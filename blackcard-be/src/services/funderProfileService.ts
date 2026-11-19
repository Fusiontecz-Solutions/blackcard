import type { UploadedFile } from 'express-fileupload';
import { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import uploadService from './uploadService';
import {
  DEFAULT_FUNDER_CONTRACT_FILENAME,
  DEFAULT_FUNDER_CONTRACT_LAYOUT_KEY,
  FUNDER_SUPPLEMENTAL_LAYOUT_TYPES,
  funderContractLayoutKey,
  funderDisclosureLayoutKeyForState,
  funderNamedAddendumLayoutKey,
  funderSupplementalLayoutKey,
  isFunderContractLayoutKey,
  isFunderOwnedLayoutKey,
  slugifyFunderDocumentToken,
  type FunderSupplementalLayoutType,
} from '../utils/funderContractLayout';
import { isDocumentLayoutKey } from './docusign/platform-document-registry';
import { platformBrandAliasesEquivalent } from '../constants/brand';
import {
  inferDefaultFunderDocumentsSource,
  normalizeFunderDocumentsSource,
  resolveAddendumDocumentsLayoutFunderId,
  resolveDisclosureDocumentsLayoutFunderId,
  resolveAddendumDocumentsSource,
  resolveDisclosureDocumentsSource,
  canManageFunderAddendums,
  canManageFunderDisclosures,
} from '../utils/funderDocumentSource';
import {
  funderStateListIncludes,
  normalizeContractStateToken,
} from '../utils/usStateMatch';

/** Legacy Katan-only funder rows (seeded by an old migration) must never surface in this book. */
function isLegacyAllianceRow(row: { name?: unknown; displayName?: unknown; mainContractLayoutKey?: unknown }): boolean {
  const text = `${String(row.name ?? '')} ${String(row.displayName ?? '')}`;
  return (
    /alliance\s*(bridge|capital)/i.test(text) ||
    String(row.mainContractLayoutKey ?? '').trim() === 'alliance_bridge_contract'
  );
}


/** Client-side fallback profile ids are not DB UUIDs. */
const PERSISTED_FUNDER_PROFILE_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPersistedFunderProfileId(id?: string | null): boolean {
  return PERSISTED_FUNDER_PROFILE_ID_REGEX.test(String(id ?? '').trim());
}

function toStatesJson(
  states?: string[] | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!states?.length) return Prisma.JsonNull;
  return states.map((s) => String(s).trim()).filter(Boolean);
}

export type FunderProfileInput = {
  name: string;
  displayName?: string | null;
  dealIdPrefix?: string | null;
  assignsDealId?: boolean;
  mainContractLayoutKey?: string | null;
  contractPdfFileName?: string | null;
  allowedStates?: string[] | null;
  excludedStates?: string[] | null;
  organization?: string | null;
  legalName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  defaultCcEmail?: string | null;
  addressLine1?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  docusignAccountProfileId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  documentsSource?: string | null;
  sharedDocumentsFunderId?: string | null;
  addendumDocumentsSource?: string | null;
  disclosureDocumentsSource?: string | null;
  sharedAddendumFunderId?: string | null;
  sharedDisclosureFunderId?: string | null;
  letterCompanyName?: string | null;
  letterLogoUrl?: string | null;
  letterWatermarkUrl?: string | null;
  letterAccentStripLight?: string | null;
  letterAccentStripDark?: string | null;
  letterInfoTableIconBg?: string | null;
  letterWireBankName?: string | null;
  letterWireAddressLine1?: string | null;
  letterWireCityStateZip?: string | null;
  letterWireRoutingNumber?: string | null;
  letterWireAccountNumber?: string | null;
};

function normalizeStateToken(state?: string | null): string {
  return normalizeContractStateToken(state);
}

function parseStateList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => normalizeStateToken(String(s))).filter(Boolean);
  }
  return [];
}

export function funderAvailableForState(
  allowedStates: string[],
  excludedStates: string[],
  state?: string | null,
): boolean {
  const normalized = normalizeStateToken(state);
  if (!normalized) return true;

  if (excludedStates.length > 0 && funderStateListIncludes(excludedStates, normalized)) {
    return false;
  }

  if (!allowedStates.length) return true;
  return funderStateListIncludes(allowedStates, normalized);
}

export function serializeFunderProfile(row: Record<string, unknown>) {
  const docusign = row.docusignAccountProfile as Record<string, unknown> | null | undefined;
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    displayName: row.displayName != null ? String(row.displayName) : null,
    dealIdPrefix: row.dealIdPrefix != null ? String(row.dealIdPrefix) : null,
    assignsDealId: row.assignsDealId === true,
    mainContractLayoutKey: String(row.mainContractLayoutKey ?? 'contract'),
    contractPdfFileName: row.contractPdfFileName != null ? String(row.contractPdfFileName) : null,
    logoUrl: row.logoUrl != null ? String(row.logoUrl) : null,
    allowedStates: parseStateList(row.allowedStates),
    excludedStates: parseStateList(row.excludedStates),
    organization: row.organization != null ? String(row.organization) : null,
    legalName: row.legalName != null ? String(row.legalName) : null,
    contactEmail: row.contactEmail != null ? String(row.contactEmail) : null,
    contactPhone: row.contactPhone != null ? String(row.contactPhone) : null,
    defaultCcEmail: row.defaultCcEmail != null ? String(row.defaultCcEmail) : null,
    addressLine1: row.addressLine1 != null ? String(row.addressLine1) : null,
    addressCity: row.addressCity != null ? String(row.addressCity) : null,
    addressState: row.addressState != null ? String(row.addressState) : null,
    addressZip: row.addressZip != null ? String(row.addressZip) : null,
    docusignAccountProfileId:
      row.docusignAccountProfileId != null ? String(row.docusignAccountProfileId) : null,
    docusignAccountName: docusign?.name ? String(docusign.name) : null,
    sortOrder: Number(row.sortOrder ?? 0),
    isActive: row.isActive !== false,
    documentsSource: normalizeFunderDocumentsSource(
      row.documentsSource != null ? String(row.documentsSource) : null,
    ),
    sharedDocumentsFunderId:
      row.sharedDocumentsFunderId != null ? String(row.sharedDocumentsFunderId) : null,
    sharedDocumentsFunderName:
      row.sharedDocumentsFunderName != null ? String(row.sharedDocumentsFunderName) : null,
    addendumDocumentsSource: normalizeFunderDocumentsSource(
      row.addendumDocumentsSource != null
        ? String(row.addendumDocumentsSource)
        : row.documentsSource != null
          ? String(row.documentsSource)
          : null,
    ),
    disclosureDocumentsSource: normalizeFunderDocumentsSource(
      row.disclosureDocumentsSource != null
        ? String(row.disclosureDocumentsSource)
        : row.documentsSource != null
          ? String(row.documentsSource)
          : null,
    ),
    sharedAddendumFunderId:
      row.sharedAddendumFunderId != null
        ? String(row.sharedAddendumFunderId)
        : row.sharedDocumentsFunderId != null
          ? String(row.sharedDocumentsFunderId)
          : null,
    sharedDisclosureFunderId:
      row.sharedDisclosureFunderId != null
        ? String(row.sharedDisclosureFunderId)
        : row.sharedDocumentsFunderId != null
          ? String(row.sharedDocumentsFunderId)
          : null,
    sharedAddendumFunderName:
      row.sharedAddendumFunderName != null ? String(row.sharedAddendumFunderName) : null,
    sharedDisclosureFunderName:
      row.sharedDisclosureFunderName != null ? String(row.sharedDisclosureFunderName) : null,
    letterCompanyName: row.letterCompanyName != null ? String(row.letterCompanyName) : null,
    letterLogoUrl: row.letterLogoUrl != null ? String(row.letterLogoUrl) : null,
    letterWatermarkUrl: row.letterWatermarkUrl != null ? String(row.letterWatermarkUrl) : null,
    letterAccentStripLight:
      row.letterAccentStripLight != null ? String(row.letterAccentStripLight) : null,
    letterAccentStripDark:
      row.letterAccentStripDark != null ? String(row.letterAccentStripDark) : null,
    letterInfoTableIconBg:
      row.letterInfoTableIconBg != null ? String(row.letterInfoTableIconBg) : null,
    letterWireBankName: row.letterWireBankName != null ? String(row.letterWireBankName) : null,
    letterWireAddressLine1:
      row.letterWireAddressLine1 != null ? String(row.letterWireAddressLine1) : null,
    letterWireCityStateZip:
      row.letterWireCityStateZip != null ? String(row.letterWireCityStateZip) : null,
    letterWireRoutingNumber:
      row.letterWireRoutingNumber != null ? String(row.letterWireRoutingNumber) : null,
    letterWireAccountNumber:
      row.letterWireAccountNumber != null ? String(row.letterWireAccountNumber) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type SerializedFunderProfile = ReturnType<typeof serializeFunderProfile>;

function normalizeFunderLookupToken(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function funderNamesEquivalent(
  left?: string | null,
  right?: string | null,
): boolean {
  const a = normalizeFunderLookupToken(left);
  const b = normalizeFunderLookupToken(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (platformBrandAliasesEquivalent(a, b)) return true;
  const texasFundingGroup = new Set([
    'texas funding group',
    'texas funding',
    'tfg',
  ]);
  if (texasFundingGroup.has(a) && texasFundingGroup.has(b)) return true;
  if (a.includes('texas funding group') && b.includes('texas funding group')) return true;
  return false;
}

export function pickCanonicalFunderName(
  profiles: SerializedFunderProfile[],
  funderName?: string | null,
  state?: string | null,
): string {
  const raw = String(funderName ?? '').trim();
  if (!raw) return '';
  const picked = pickFunderProfileFromList(profiles, raw, state);
  return picked?.name ?? raw;
}

export async function resolveStoredContractFunderName(
  funderNameRaw: string | null | undefined,
  contractState?: string | null,
): Promise<string | null> {
  const trimmed = String(funderNameRaw ?? '').trim();
  if (!trimmed) return null;

  const profiles = await listFunderProfiles({ activeOnly: false });
  const canonical = pickCanonicalFunderName(profiles, trimmed, contractState);
  if (pickFunderProfileFromList(profiles, canonical, contractState)) {
    return canonical;
  }

  return trimmed;
}

export function pickFunderProfileFromList<T extends SerializedFunderProfile>(
  profiles: T[],
  funderName?: string | null,
  state?: string | null,
): T | undefined {
  const key = normalizeFunderLookupToken(funderName);
  if (!key) return undefined;

  const matches = profiles.filter(
    (p) =>
      funderNamesEquivalent(p.name, key) ||
      funderNamesEquivalent(p.displayName, key),
  );
  if (!matches.length) return undefined;
  if (matches.length === 1) return matches[0];

  const normalizedState = normalizeFunderLookupToken(state);
  if (normalizedState) {
    const forState = matches.filter((p) =>
      funderAvailableForState(p.allowedStates, p.excludedStates, normalizedState),
    );
    if (forState.length === 1) return forState[0];
    if (forState.length > 1) {
      return [...forState].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
    }
  }

  return [...matches].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
}

export async function resolveFunderProfile(options: {
  funderProfileId?: string | null;
  funderName?: string | null;
  state?: string | null;
}): Promise<SerializedFunderProfile | null> {
  const funderProfileId = String(options.funderProfileId ?? '').trim();
  if (funderProfileId && isPersistedFunderProfileId(funderProfileId)) {
    const row = await prisma.funderProfile.findUnique({
      where: { id: funderProfileId },
      include: { docusignAccountProfile: true },
    });
    if (row?.isActive !== false) {
      return serializeFunderProfile(row as unknown as Record<string, unknown>);
    }
  }

  const funderName = String(options.funderName ?? '').trim();
  if (!funderName) return null;

  const rows = await prisma.funderProfile.findMany({
    where: { isActive: true },
    include: { docusignAccountProfile: true },
  });

  const serialized = rows.filter((r) => !isLegacyAllianceRow(r)).map((r) =>
    serializeFunderProfile(r as unknown as Record<string, unknown>),
  );
  return pickFunderProfileFromList(serialized, funderName, options.state) ?? null;
}

export async function listFunderProfiles(options?: { state?: string | null; activeOnly?: boolean }) {
  const where: Prisma.FunderProfileWhereInput = {};
  if (options?.activeOnly !== false) where.isActive = true;

  const rows = await prisma.funderProfile.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      docusignAccountProfile: { select: { id: true, name: true, isActive: true } },
    },
  });

  const stateFilter = normalizeStateToken(options?.state);
  const filtered = stateFilter
    ? rows.filter((row) => !isLegacyAllianceRow(row)).filter((row) => {
        const allowed = parseStateList(row.allowedStates);
        const excluded = parseStateList(row.excludedStates);
        return funderAvailableForState(allowed, excluded, stateFilter);
      })
    : rows.filter((row) => !isLegacyAllianceRow(row));

  const serialized = filtered.map((r) =>
    serializeFunderProfile(r as unknown as Record<string, unknown>),
  );
  return enrichFunderProfilesWithSharedNames(serialized);
}

async function enrichFunderProfilesWithSharedNames<
  T extends SerializedFunderProfile,
>(profiles: T[]): Promise<T[]> {
  const ownerIds = [
    ...new Set(
      profiles
        .flatMap((p) => [
          p.sharedDocumentsFunderId,
          p.sharedAddendumFunderId,
          p.sharedDisclosureFunderId,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!ownerIds.length) return profiles;

  const owners = await prisma.funderProfile.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(owners.map((o) => [o.id, o.name]));

  return profiles.map((p) => ({
    ...p,
    sharedDocumentsFunderName: p.sharedDocumentsFunderId
      ? nameById.get(p.sharedDocumentsFunderId) ?? null
      : null,
    sharedAddendumFunderName: p.sharedAddendumFunderId
      ? nameById.get(p.sharedAddendumFunderId) ?? null
      : null,
    sharedDisclosureFunderName: p.sharedDisclosureFunderId
      ? nameById.get(p.sharedDisclosureFunderId) ?? null
      : null,
  }));
}

export async function getFunderProfileByName(name: string, state?: string | null) {
  return resolveFunderProfile({ funderName: name, state });
}

export async function getFunderProfileById(id: string) {
  if (!isPersistedFunderProfileId(id)) return null;
  const row = await prisma.funderProfile.findUnique({
    where: { id },
    include: { docusignAccountProfile: { select: { id: true, name: true, isActive: true } } },
  });
  if (!row) return null;
  const [enriched] = await enrichFunderProfilesWithSharedNames([
    serializeFunderProfile(row as unknown as Record<string, unknown>),
  ]);
  return enriched;
}

export function assertCanManageFunderAddendums(profile: SerializedFunderProfile) {
  if (canManageFunderAddendums(profile)) return;
  if (resolveAddendumDocumentsSource(profile) === 'platform') {
    throw new Error(
      'This funder uses platform addendums (same as Black Card). Switch addendum source to "This funder only" and save, then upload.',
    );
  }
  const ownerName = profile.sharedAddendumFunderName || profile.sharedDocumentsFunderName;
  if (ownerName) {
    throw new Error(`Upload addendums on "${ownerName}" — this funder shares their addendums.`);
  }
  throw new Error('This funder does not manage its own addendum uploads.');
}

export function assertCanManageFunderDisclosures(profile: SerializedFunderProfile) {
  if (canManageFunderDisclosures(profile)) return;
  if (resolveDisclosureDocumentsSource(profile) === 'platform') {
    throw new Error(
      'This funder uses platform disclosures (same as Black Card). Switch disclosure source to "This funder only" and save, then upload.',
    );
  }
  const ownerName = profile.sharedDisclosureFunderName || profile.sharedDocumentsFunderName;
  if (ownerName) {
    throw new Error(
      `Upload disclosures on "${ownerName}" — this funder shares their disclosures.`,
    );
  }
  throw new Error('This funder does not manage its own disclosure uploads.');
}

/** @deprecated Prefer assertCanManageFunderAddendums / assertCanManageFunderDisclosures */
export function assertCanManageFunderDocuments(profile: SerializedFunderProfile) {
  if (canManageFunderAddendums(profile) || canManageFunderDisclosures(profile)) return;
  assertCanManageFunderAddendums(profile);
}

export async function getFunderWithDocuSignCredentials(
  funderName: string,
  state?: string | null,
) {
  const profile = await resolveFunderProfile({ funderName, state });
  if (!profile) return null;

  if (!isPersistedFunderProfileId(profile.id)) {
    return { funder: profile, docusignProfile: null };
  }

  const row = await prisma.funderProfile.findUnique({
    where: { id: profile.id },
    include: { docusignAccountProfile: true },
  });
  if (!row) return null;

  return {
    funder: profile,
    docusignProfile: row.docusignAccountProfile,
  };
}

function defaultContractFields(input: FunderProfileInput) {
  const layoutKey = String(input.mainContractLayoutKey || '').trim();
  const fileName = String(input.contractPdfFileName || '').trim();
  if (isFunderContractLayoutKey(layoutKey)) {
    return {
      mainContractLayoutKey: layoutKey,
      contractPdfFileName: fileName || DEFAULT_FUNDER_CONTRACT_FILENAME,
    };
  }
  if (isDocumentLayoutKey(layoutKey)) {
    return {
      mainContractLayoutKey: layoutKey,
      contractPdfFileName: fileName || DEFAULT_FUNDER_CONTRACT_FILENAME,
    };
  }

  return {
    mainContractLayoutKey: DEFAULT_FUNDER_CONTRACT_LAYOUT_KEY,
    contractPdfFileName: fileName || DEFAULT_FUNDER_CONTRACT_FILENAME,
  };
}

async function upsertFunderBoldSignTemplate(
  funderId: string,
  funderName: string,
  pdfUrl: string,
) {
  const layoutKey = funderContractLayoutKey(funderId);
  const templateData = {
    name: `${funderName} Contract`,
    type: 'contract',
    layoutKey,
    templateId: layoutKey,
    pdfUrl,
  };

  const existing = await prisma.boldSignTemplate.findFirst({
    where: { OR: [{ layoutKey }, { templateId: layoutKey }] },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    await prisma.boldSignTemplate.update({
      where: { id: existing.id },
      data: templateData,
    });
    return;
  }

  await prisma.boldSignTemplate.create({ data: templateData });
}

export async function uploadFunderContractPdf(
  funderId: string,
  funderName: string,
  file: UploadedFile,
) {
  const mimetype = String(file.mimetype || '').toLowerCase();
  if (mimetype !== 'application/pdf') {
    throw new Error('Only PDF files are allowed for funder contracts.');
  }

  const folder = 'ih-crm/funder-contracts';
  const result = await uploadService.uploadFile(file, folder);
  if (!result.success || !result.data?.secure_url) {
    throw new Error(result.message || 'Failed to upload contract PDF to Cloudinary.');
  }

  const fileName = String(result.fileName || file.name || DEFAULT_FUNDER_CONTRACT_FILENAME).trim();
  const layoutKey = funderContractLayoutKey(funderId);

  await upsertFunderBoldSignTemplate(funderId, funderName, result.data.secure_url);

  const row = await prisma.funderProfile.update({
    where: { id: funderId },
    data: {
      mainContractLayoutKey: layoutKey,
      contractPdfFileName: fileName,
    },
    include: { docusignAccountProfile: { select: { id: true, name: true } } },
  });

  return serializeFunderProfile(row as unknown as Record<string, unknown>);
}

async function upsertFunderSupplementalBoldSignTemplate(
  funderId: string,
  funderName: string,
  supplementalType: FunderSupplementalLayoutType,
  pdfUrl: string,
  fileName: string,
) {
  const layoutKey = funderSupplementalLayoutKey(funderId, supplementalType);
  const label =
    supplementalType === 'flex_addendum'
      ? 'Flex Addendum'
      : supplementalType === 'pre_payment_addendum'
        ? 'Pre-Payment Addendum'
      : supplementalType === 'balance_transfer'
        ? 'Balance Transfer'
        : supplementalType === 'case_takeover_addendum'
          ? 'Case Takeover Balance Transfer'
        : 'ACH Authorization';
  const templateData = {
    name: `${funderName} ${label}`,
    type: supplementalType,
    layoutKey,
    templateId: layoutKey,
    pdfUrl,
  };

  const existing = await prisma.boldSignTemplate.findFirst({
    where: { OR: [{ layoutKey }, { templateId: layoutKey }] },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    await prisma.boldSignTemplate.update({
      where: { id: existing.id },
      data: templateData,
    });
    return;
  }

  await prisma.boldSignTemplate.create({ data: templateData });
}

export async function uploadFunderSupplementalPdf(
  funderId: string,
  funderName: string,
  supplementalType: FunderSupplementalLayoutType,
  file: UploadedFile,
) {
  const profile = await getFunderProfileById(funderId);
  if (!profile) throw new Error('Funder not found.');
  assertCanManageFunderAddendums(profile);
  const layoutFunderId = resolveAddendumDocumentsLayoutFunderId(profile) || funderId;

  const mimetype = String(file.mimetype || '').toLowerCase();
  if (mimetype !== 'application/pdf') {
    throw new Error('Only PDF files are allowed for funder supplemental documents.');
  }

  const folder = `ih-crm/funder-supplemental/${supplementalType}`;
  const result = await uploadService.uploadFile(file, folder);
  if (!result.success || !result.data?.secure_url) {
    throw new Error(result.message || 'Failed to upload supplemental PDF to Cloudinary.');
  }

  const fileName = String(result.fileName || file.name || `${supplementalType}.pdf`).trim();
  await upsertFunderSupplementalBoldSignTemplate(
    layoutFunderId,
    funderName,
    supplementalType,
    result.data.secure_url,
    fileName,
  );

  return {
    layoutKey: funderSupplementalLayoutKey(layoutFunderId, supplementalType),
    fileName,
    supplementalType,
  };
}

export async function uploadFunderDisclosurePdf(
  funderId: string,
  funderName: string,
  state: string,
  frequency: string,
  file: UploadedFile,
) {
  const profile = await getFunderProfileById(funderId);
  if (!profile) throw new Error('Funder not found.');
  assertCanManageFunderDisclosures(profile);

  const layoutFunderId = resolveDisclosureDocumentsLayoutFunderId(profile) || funderId;
  const mimetype = String(file.mimetype || '').toLowerCase();
  if (mimetype !== 'application/pdf') {
    throw new Error('Only PDF files are allowed for funder disclosure documents.');
  }

  const folder = 'ih-crm/funder-disclosures';
  const result = await uploadService.uploadFile(file, folder);
  if (!result.success || !result.data?.secure_url) {
    throw new Error(result.message || 'Failed to upload disclosure PDF to Cloudinary.');
  }

  const normalizedState = normalizeStateToken(state);
  const normalizedFrequency = String(frequency || '').trim().toLowerCase();
  const layoutKey = funderDisclosureLayoutKeyForState(
    layoutFunderId,
    normalizedState,
    normalizedFrequency,
  );
  const fileName = String(result.fileName || file.name || 'disclosure.pdf').trim();
  const templateData = {
    name: `${funderName} ${normalizedState} ${normalizedFrequency} disclosure`.trim(),
    type: 'disclosure',
    state: normalizedState,
    frequency: normalizedFrequency || null,
    layoutKey,
    templateId: layoutKey,
    pdfUrl: result.data.secure_url,
  };

  const existing = await prisma.boldSignTemplate.findFirst({
    where: {
      OR: [{ layoutKey }, { templateId: layoutKey }],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    await prisma.boldSignTemplate.update({
      where: { id: existing.id },
      data: templateData,
    });
  } else {
    await prisma.boldSignTemplate.create({ data: templateData });
  }

  return { layoutKey, fileName, state: normalizedState, frequency: normalizedFrequency };
}

export type FunderDocumentTemplateRow = {
  id: string;
  name: string;
  type: string;
  state: string | null;
  frequency: string | null;
  layoutKey: string | null;
  pdfUrl: string | null;
  createdAt: Date;
};

export async function listFunderDocumentTemplates(funderId: string): Promise<FunderDocumentTemplateRow[]> {
  const profile = await getFunderProfileById(funderId);
  if (!profile) throw new Error('Funder not found.');

  const addendumFunderId = resolveAddendumDocumentsLayoutFunderId(profile);
  const disclosureFunderId = resolveDisclosureDocumentsLayoutFunderId(profile);
  const ids = [...new Set([addendumFunderId, disclosureFunderId].filter(Boolean))] as string[];
  if (!ids.length) return [];

  const orClauses = ids.flatMap((id) => {
    const prefix = `funder_${id}_`;
    return [
      { layoutKey: { startsWith: prefix } },
      { templateId: { startsWith: prefix } },
    ];
  });

  const contractKeys = ids.map((id) => funderContractLayoutKey(id));
  const rows = await prisma.boldSignTemplate.findMany({
    where: {
      AND: [
        { OR: orClauses },
        { NOT: { layoutKey: { in: contractKeys } } },
        { NOT: { templateId: { in: contractKeys } } },
      ],
    },
    orderBy: [{ type: 'asc' }, { state: 'asc' }, { frequency: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      type: true,
      state: true,
      frequency: true,
      layoutKey: true,
      templateId: true,
      pdfUrl: true,
      createdAt: true,
    },
  });

  const isDisclosureType = (type: string) =>
    String(type || '')
      .trim()
      .toLowerCase() === 'disclosure';

  return rows
    .filter((row) => {
      const key = String(row.layoutKey || row.templateId || '')
        .trim()
        .toLowerCase();
      const disclosure = isDisclosureType(row.type) || key.includes('disclosure');
      if (disclosure) {
        if (!disclosureFunderId) return false;
        return key.startsWith(`funder_${disclosureFunderId}_`.toLowerCase());
      }
      if (!addendumFunderId) return false;
      return key.startsWith(`funder_${addendumFunderId}_`.toLowerCase());
    })
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      state: row.state,
      frequency: row.frequency,
      layoutKey: row.layoutKey,
      pdfUrl: row.pdfUrl,
      createdAt: row.createdAt,
    }));
}

export async function uploadFunderNamedAddendumPdf(
  funderId: string,
  funderName: string,
  displayName: string,
  coordinateLayoutKey: string,
  file: UploadedFile,
) {
  const profile = await getFunderProfileById(funderId);
  if (!profile) throw new Error('Funder not found.');
  assertCanManageFunderAddendums(profile);

  const layoutFunderId = resolveAddendumDocumentsLayoutFunderId(profile) || funderId;

  const mimetype = String(file.mimetype || '').toLowerCase();
  if (mimetype !== 'application/pdf') {
    throw new Error('Only PDF files are allowed for funder addendum documents.');
  }

  const label = String(displayName || '').trim();
  if (!label) throw new Error('Addendum name is required.');

  const coordsKey = String(coordinateLayoutKey || '').trim();
  if (!coordsKey || !isDocumentLayoutKey(coordsKey)) {
    throw new Error(
      'Select a valid coordinate layout (Flex Addendum, Pre-Payment Addendum, Balance Transfer, Case Takeover Balance Transfer, ACH Authorization, or Texas ACH).',
    );
  }

  const slug = slugifyFunderDocumentToken(label);
  const isStandardSupplemental = (
    FUNDER_SUPPLEMENTAL_LAYOUT_TYPES as readonly string[]
  ).includes(coordsKey);
  const layoutKey = isStandardSupplemental
    ? funderSupplementalLayoutKey(layoutFunderId, coordsKey)
    : funderNamedAddendumLayoutKey(layoutFunderId, slug);
  const folder = `ih-crm/funder-addendums/${slug || 'custom'}`;
  const result = await uploadService.uploadFile(file, folder);
  if (!result.success || !result.data?.secure_url) {
    throw new Error(result.message || 'Failed to upload addendum PDF to Cloudinary.');
  }

  const fileName = String(result.fileName || file.name || `${slug || 'addendum'}.pdf`).trim();
  const templateData = {
    name: label,
    type: coordsKey,
    layoutKey,
    templateId: layoutKey,
    pdfUrl: result.data.secure_url,
  };

  const existing = await prisma.boldSignTemplate.findFirst({
    where: { OR: [{ layoutKey }, { templateId: layoutKey }] },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    await prisma.boldSignTemplate.update({
      where: { id: existing.id },
      data: templateData,
    });
    return { id: existing.id, layoutKey, fileName, name: label, coordinateLayoutKey: coordsKey };
  }

  const created = await prisma.boldSignTemplate.create({ data: templateData });
  return {
    id: created.id,
    layoutKey,
    fileName,
    name: label,
    coordinateLayoutKey: coordsKey,
  };
}

export async function deleteFunderDocumentTemplate(funderId: string, templateId: string) {
  const fid = String(funderId || '').trim();
  const tid = String(templateId || '').trim();
  if (!fid || !tid) throw new Error('Funder id and template id are required.');

  const profile = await getFunderProfileById(fid);
  if (!profile) throw new Error('Funder not found.');

  const row = await prisma.boldSignTemplate.findUnique({ where: { id: tid } });
  if (!row) throw new Error('Document template not found.');

  const layoutKey = String(row.layoutKey || row.templateId || '').trim();
  const keyLower = layoutKey.toLowerCase();
  const isDisclosure =
    String(row.type || '')
      .trim()
      .toLowerCase() === 'disclosure' || keyLower.includes('disclosure');

  if (isDisclosure) {
    assertCanManageFunderDisclosures(profile);
  } else {
    assertCanManageFunderAddendums(profile);
  }

  const layoutFunderId =
    (isDisclosure
      ? resolveDisclosureDocumentsLayoutFunderId(profile)
      : resolveAddendumDocumentsLayoutFunderId(profile)) || fid;
  if (
    !isFunderOwnedLayoutKey(layoutKey, layoutFunderId) ||
    layoutKey === funderContractLayoutKey(fid)
  ) {
    throw new Error('This document does not belong to the selected funder.');
  }

  await prisma.boldSignTemplate.delete({ where: { id: tid } });
  return { id: tid };
}

export async function uploadFunderLogo(funderId: string, file: UploadedFile) {
  const profile = await prisma.funderProfile.findUnique({
    where: { id: funderId },
    select: { id: true, logoPublicId: true },
  });
  if (!profile) throw new Error('Funder profile not found.');

  const mime = String(file.mimetype || '').toLowerCase();
  if (!mime.startsWith('image/')) {
    throw new Error('Funder logo must be an image file.');
  }
  if (Number(file.size || 0) > 5 * 1024 * 1024) {
    throw new Error('Funder logo must be 5 MB or smaller.');
  }

  const result = await uploadService.uploadFile(
    file,
    `ih-crm/funder-logos/${funderId}`,
    file.name,
  );
  const logoUrl = String(result.data?.secure_url || '').trim();
  const logoPublicId = String(result.data?.public_id || '').trim();
  if (!result.success || !logoUrl || !logoPublicId) {
    throw new Error(result.error || result.message || 'Failed to upload funder logo.');
  }

  const row = await prisma.funderProfile.update({
    where: { id: funderId },
    data: { logoUrl, logoPublicId },
    include: { docusignAccountProfile: { select: { id: true, name: true } } },
  });

  const oldPublicId = String(profile.logoPublicId || '').trim();
  if (oldPublicId && oldPublicId !== logoPublicId) {
    void uploadService.deleteFile(oldPublicId, 'image');
  }

  const [enriched] = await enrichFunderProfilesWithSharedNames([
    serializeFunderProfile(row as unknown as Record<string, unknown>),
  ]);
  return enriched;
}

export async function uploadFunderLetterLogo(funderId: string, file: UploadedFile) {
  const profile = await prisma.funderProfile.findUnique({
    where: { id: funderId },
    select: { id: true, letterLogoPublicId: true },
  });
  if (!profile) throw new Error('Funder profile not found.');

  const mime = String(file.mimetype || '').toLowerCase();
  if (!mime.startsWith('image/')) {
    throw new Error('Letter logo must be an image file.');
  }
  if (Number(file.size || 0) > 5 * 1024 * 1024) {
    throw new Error('Letter logo must be 5 MB or smaller.');
  }

  const result = await uploadService.uploadFile(
    file,
    `ih-crm/funder-letter-logos/${funderId}`,
    file.name,
  );
  const letterLogoUrl = String(result.data?.secure_url || '').trim();
  const letterLogoPublicId = String(result.data?.public_id || '').trim();
  if (!result.success || !letterLogoUrl || !letterLogoPublicId) {
    throw new Error(result.error || result.message || 'Failed to upload letter logo.');
  }

  const row = await prisma.funderProfile.update({
    where: { id: funderId },
    data: { letterLogoUrl, letterLogoPublicId },
    include: { docusignAccountProfile: { select: { id: true, name: true } } },
  });

  const oldPublicId = String(profile.letterLogoPublicId || '').trim();
  if (oldPublicId && oldPublicId !== letterLogoPublicId) {
    void uploadService.deleteFile(oldPublicId, 'image');
  }

  const [enriched] = await enrichFunderProfilesWithSharedNames([
    serializeFunderProfile(row as unknown as Record<string, unknown>),
  ]);
  return enriched;
}

export async function createFunderProfile(input: FunderProfileInput) {
  const contractDefaults = defaultContractFields(input);
  const row = await prisma.funderProfile.create({
    data: {
      name: String(input.name).trim(),
      displayName: input.displayName ? String(input.displayName).trim() : null,
      dealIdPrefix: input.dealIdPrefix ? String(input.dealIdPrefix).trim().toUpperCase() : null,
      assignsDealId: input.assignsDealId === true,
      mainContractLayoutKey: contractDefaults.mainContractLayoutKey,
      contractPdfFileName: contractDefaults.contractPdfFileName,
      allowedStates: toStatesJson(input.allowedStates),
      excludedStates: toStatesJson(input.excludedStates),
      organization: input.organization ? String(input.organization).trim() : null,
      legalName: input.legalName ? String(input.legalName).trim() : null,
      contactEmail: input.contactEmail ? String(input.contactEmail).trim() : null,
      contactPhone: input.contactPhone ? String(input.contactPhone).trim() : null,
      defaultCcEmail: input.defaultCcEmail ? String(input.defaultCcEmail).trim() : null,
      addressLine1: input.addressLine1 ? String(input.addressLine1).trim() : null,
      addressCity: input.addressCity ? String(input.addressCity).trim() : null,
      addressState: input.addressState ? String(input.addressState).trim() : null,
      addressZip: input.addressZip ? String(input.addressZip).trim() : null,
      docusignAccountProfileId: input.docusignAccountProfileId || null,
      sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
      isActive: input.isActive !== false,
      documentsSource: normalizeFunderDocumentsSource(
        input.addendumDocumentsSource ??
          input.documentsSource ??
          inferDefaultFunderDocumentsSource(input),
      ),
      sharedDocumentsFunderId:
        input.sharedAddendumFunderId || input.sharedDocumentsFunderId
          ? String(input.sharedAddendumFunderId || input.sharedDocumentsFunderId).trim()
          : null,
      addendumDocumentsSource: normalizeFunderDocumentsSource(
        input.addendumDocumentsSource ??
          input.documentsSource ??
          inferDefaultFunderDocumentsSource(input),
      ),
      disclosureDocumentsSource: normalizeFunderDocumentsSource(
        input.disclosureDocumentsSource ??
          input.documentsSource ??
          inferDefaultFunderDocumentsSource(input),
      ),
      sharedAddendumFunderId: input.sharedAddendumFunderId
        ? String(input.sharedAddendumFunderId).trim()
        : input.sharedDocumentsFunderId
          ? String(input.sharedDocumentsFunderId).trim()
          : null,
      sharedDisclosureFunderId: input.sharedDisclosureFunderId
        ? String(input.sharedDisclosureFunderId).trim()
        : input.sharedDocumentsFunderId
          ? String(input.sharedDocumentsFunderId).trim()
          : null,
      letterCompanyName: input.letterCompanyName
        ? String(input.letterCompanyName).trim()
        : null,
      letterLogoUrl: input.letterLogoUrl ? String(input.letterLogoUrl).trim() : null,
      letterWatermarkUrl: input.letterWatermarkUrl
        ? String(input.letterWatermarkUrl).trim()
        : null,
      letterAccentStripLight: input.letterAccentStripLight
        ? String(input.letterAccentStripLight).trim()
        : null,
      letterAccentStripDark: input.letterAccentStripDark
        ? String(input.letterAccentStripDark).trim()
        : null,
      letterInfoTableIconBg: input.letterInfoTableIconBg
        ? String(input.letterInfoTableIconBg).trim()
        : null,
      letterWireBankName: input.letterWireBankName
        ? String(input.letterWireBankName).trim()
        : null,
      letterWireAddressLine1: input.letterWireAddressLine1
        ? String(input.letterWireAddressLine1).trim()
        : null,
      letterWireCityStateZip: input.letterWireCityStateZip
        ? String(input.letterWireCityStateZip).trim()
        : null,
      letterWireRoutingNumber: input.letterWireRoutingNumber
        ? String(input.letterWireRoutingNumber).trim()
        : null,
      letterWireAccountNumber: input.letterWireAccountNumber
        ? String(input.letterWireAccountNumber).trim()
        : null,
    },
    include: { docusignAccountProfile: { select: { id: true, name: true } } },
  });
  const [enriched] = await enrichFunderProfilesWithSharedNames([
    serializeFunderProfile(row as unknown as Record<string, unknown>),
  ]);
  return enriched;
}

export async function updateFunderProfile(id: string, input: Partial<FunderProfileInput>) {
  const existing = await prisma.funderProfile.findUnique({ where: { id } });
  if (!existing) throw new Error('Funder profile not found.');

  const data: Prisma.FunderProfileUpdateInput = {};
  if (input.name !== undefined) data.name = String(input.name).trim();
  if (input.displayName !== undefined) {
    data.displayName = input.displayName ? String(input.displayName).trim() : null;
  }
  if (input.dealIdPrefix !== undefined) {
    data.dealIdPrefix = input.dealIdPrefix ? String(input.dealIdPrefix).trim().toUpperCase() : null;
  }
  if (input.assignsDealId !== undefined) data.assignsDealId = Boolean(input.assignsDealId);
  if (input.mainContractLayoutKey !== undefined) {
    const layoutKey = String(input.mainContractLayoutKey || '').trim();
    data.mainContractLayoutKey =
      isFunderContractLayoutKey(layoutKey) || isDocumentLayoutKey(layoutKey)
        ? layoutKey
        : DEFAULT_FUNDER_CONTRACT_LAYOUT_KEY;
  }
  if (input.contractPdfFileName !== undefined) {
    data.contractPdfFileName = input.contractPdfFileName
      ? String(input.contractPdfFileName).trim()
      : DEFAULT_FUNDER_CONTRACT_FILENAME;
  }
  if (input.allowedStates !== undefined) {
    data.allowedStates = toStatesJson(input.allowedStates);
  }
  if (input.excludedStates !== undefined) {
    data.excludedStates = toStatesJson(input.excludedStates);
  }
  if (input.organization !== undefined) {
    data.organization = input.organization ? String(input.organization).trim() : null;
  }
  if (input.legalName !== undefined) data.legalName = input.legalName ? String(input.legalName).trim() : null;
  if (input.contactEmail !== undefined) {
    data.contactEmail = input.contactEmail ? String(input.contactEmail).trim() : null;
  }
  if (input.contactPhone !== undefined) {
    data.contactPhone = input.contactPhone ? String(input.contactPhone).trim() : null;
  }
  if (input.defaultCcEmail !== undefined) {
    data.defaultCcEmail = input.defaultCcEmail ? String(input.defaultCcEmail).trim() : null;
  }
  if (input.addressLine1 !== undefined) {
    data.addressLine1 = input.addressLine1 ? String(input.addressLine1).trim() : null;
  }
  if (input.addressCity !== undefined) {
    data.addressCity = input.addressCity ? String(input.addressCity).trim() : null;
  }
  if (input.addressState !== undefined) {
    data.addressState = input.addressState ? String(input.addressState).trim() : null;
  }
  if (input.addressZip !== undefined) data.addressZip = input.addressZip ? String(input.addressZip).trim() : null;
  if (input.docusignAccountProfileId !== undefined) {
    data.docusignAccountProfile =
      input.docusignAccountProfileId ?
        { connect: { id: input.docusignAccountProfileId } }
      : { disconnect: true };
  }
  if (input.sortOrder !== undefined) data.sortOrder = Number(input.sortOrder) || 0;
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  if (input.documentsSource !== undefined) {
    data.documentsSource = normalizeFunderDocumentsSource(input.documentsSource);
  }
  if (input.sharedDocumentsFunderId !== undefined) {
    data.sharedDocumentsFunderId = input.sharedDocumentsFunderId
      ? String(input.sharedDocumentsFunderId).trim()
      : null;
  }
  if (input.addendumDocumentsSource !== undefined) {
    const src = normalizeFunderDocumentsSource(input.addendumDocumentsSource);
    data.addendumDocumentsSource = src;
    // Keep legacy column aligned with addendum source for older readers.
    data.documentsSource = src;
  }
  if (input.disclosureDocumentsSource !== undefined) {
    data.disclosureDocumentsSource = normalizeFunderDocumentsSource(
      input.disclosureDocumentsSource,
    );
  }
  if (input.sharedAddendumFunderId !== undefined) {
    const sharedId = input.sharedAddendumFunderId
      ? String(input.sharedAddendumFunderId).trim()
      : null;
    data.sharedAddendumFunderId = sharedId;
    data.sharedDocumentsFunderId = sharedId;
  }
  if (input.sharedDisclosureFunderId !== undefined) {
    data.sharedDisclosureFunderId = input.sharedDisclosureFunderId
      ? String(input.sharedDisclosureFunderId).trim()
      : null;
  }
  if (input.letterCompanyName !== undefined) {
    data.letterCompanyName = input.letterCompanyName
      ? String(input.letterCompanyName).trim()
      : null;
  }
  if (input.letterLogoUrl !== undefined) {
    const nextUrl = input.letterLogoUrl ? String(input.letterLogoUrl).trim() : null;
    data.letterLogoUrl = nextUrl;
    if (!nextUrl) {
      data.letterLogoPublicId = null;
      const oldLetterPublicId = String(existing.letterLogoPublicId || '').trim();
      if (oldLetterPublicId) {
        void uploadService.deleteFile(oldLetterPublicId, 'image');
      }
    }
  }
  if (input.letterWatermarkUrl !== undefined) {
    data.letterWatermarkUrl = input.letterWatermarkUrl
      ? String(input.letterWatermarkUrl).trim()
      : null;
  }
  if (input.letterAccentStripLight !== undefined) {
    data.letterAccentStripLight = input.letterAccentStripLight
      ? String(input.letterAccentStripLight).trim()
      : null;
  }
  if (input.letterAccentStripDark !== undefined) {
    data.letterAccentStripDark = input.letterAccentStripDark
      ? String(input.letterAccentStripDark).trim()
      : null;
  }
  if (input.letterInfoTableIconBg !== undefined) {
    data.letterInfoTableIconBg = input.letterInfoTableIconBg
      ? String(input.letterInfoTableIconBg).trim()
      : null;
  }
  if (input.letterWireBankName !== undefined) {
    data.letterWireBankName = input.letterWireBankName
      ? String(input.letterWireBankName).trim()
      : null;
  }
  if (input.letterWireAddressLine1 !== undefined) {
    data.letterWireAddressLine1 = input.letterWireAddressLine1
      ? String(input.letterWireAddressLine1).trim()
      : null;
  }
  if (input.letterWireCityStateZip !== undefined) {
    data.letterWireCityStateZip = input.letterWireCityStateZip
      ? String(input.letterWireCityStateZip).trim()
      : null;
  }
  if (input.letterWireRoutingNumber !== undefined) {
    data.letterWireRoutingNumber = input.letterWireRoutingNumber
      ? String(input.letterWireRoutingNumber).trim()
      : null;
  }
  if (input.letterWireAccountNumber !== undefined) {
    data.letterWireAccountNumber = input.letterWireAccountNumber
      ? String(input.letterWireAccountNumber).trim()
      : null;
  }

  const row = await prisma.funderProfile.update({
    where: { id },
    data,
    include: { docusignAccountProfile: { select: { id: true, name: true } } },
  });
  const [enriched] = await enrichFunderProfilesWithSharedNames([
    serializeFunderProfile(row as unknown as Record<string, unknown>),
  ]);
  return enriched;
}

export async function deleteFunderProfile(id: string) {
  const existing = await prisma.funderProfile.findUnique({
    where: { id },
    select: { logoPublicId: true, letterLogoPublicId: true },
  });
  await prisma.funderProfile.delete({ where: { id } });
  const logoPublicId = String(existing?.logoPublicId || '').trim();
  if (logoPublicId) {
    void uploadService.deleteFile(logoPublicId, 'image');
  }
  const letterLogoPublicId = String(existing?.letterLogoPublicId || '').trim();
  if (letterLogoPublicId) {
    void uploadService.deleteFile(letterLogoPublicId, 'image');
  }
  return { success: true };
}
