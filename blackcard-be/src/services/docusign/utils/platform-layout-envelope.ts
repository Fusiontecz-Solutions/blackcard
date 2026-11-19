import prisma from '../../../config/prismaClient';
import {
  DOCUMENT_LAYOUT_KEYS,
  getDocumentLayout,
  type DocumentLayoutKey,
} from '../layouts/document-layout.registry';
import {
  isDocumentLayoutKey,
  loadPlatformDocumentPdfBase64,
  normalizeSupplementalLayoutKeys,
  findBoldSignTemplatePdfUrlByExactLayoutKey,
  findDefaultContractPdfUrl,
} from '../platform-document-registry';
import {
  isFunderContractLayoutKey,
  isFunderSupplementalLayoutKey,
  funderSupplementalLayoutKeyForDocument,
  parseFunderSupplementalLayoutKey,
  resolveFunderSupplementalStorageType,
} from '../../../utils/funderContractLayout';
import type { DocumentLayout } from './convert-docusign-template-export';
import {
  buildEnvelopeFromLayouts,
  prefillFieldsToValueMap,
  renderFlattenedLayoutPdf,
  shouldFlattenLayoutPdf,
  assertLayoutPlacementsFitPdfPages,
  type LayoutSignerInput,
} from './build-envelope-from-layout';
import {
  fetchPdfAsBase64,
  resolveCoordinateLayoutKeyForTemplate,
  resolveTemplateRefForMerge,
} from './merge-template-resolve';
import {
  DOCUSIGN_COMBINE_PACKAGE_PDF,
  DOCUSIGN_DEFAULT_ROLE_NAME,
  DOCUSIGN_SECONDARY_ROLE_NAME,
} from './docusign-client';
import { mergeLayoutPdfsToSingleDocument } from './merge-layout-pdfs';
import {
  resolveMainContractCoordinateLayoutKey,
} from './resolve-main-contract-layout';
import {
  applyAllianceBridgeContractPrefillToFieldList,
  shouldApplyAllianceBridgeContractPrefill,
} from './alliance-contract-prefill';
import { insertAntiDebtSettlementRider } from './anti-debt-settlement-rider';
import { maybeAppendReverseDisbursementToMainContractLayout } from '../../pdf/reverseDisbursementSchedule.service';
import {
  isPersistedFunderProfileId,
  resolveFunderProfile,
  type SerializedFunderProfile,
} from '../../funderProfileService';
import {
  formatFunderNameWithDealIdPrefix,
  resolveAddendumDocumentsLayoutFunderId,
  resolveFunderSupplementalDocumentDisplayName,
} from '../../../utils/funderDocumentSource';
import { toEnvelopeSubjectUppercase } from '../../../utils/contractEnvelopeEmailSubject';
import { isTexasFundingGroupFunderProfile } from '../../../utils/funderProfileResolver';
import { stampFunderLogoOnPdfBase64 } from './stamp-funder-logo';

const DOCUSIGN_SECONDARY_SIGNER_ROLE_NAME = DOCUSIGN_SECONDARY_ROLE_NAME;

export type DocumentLayoutWithBase64 = DocumentLayout & { documentBase64: string };

async function applyFunderBrandingToLayoutPdf(
  layout: DocumentLayoutWithBase64,
  funder: SerializedFunderProfile | null,
): Promise<DocumentLayoutWithBase64> {
  const key = String(layout.key || '').trim().toLowerCase();
  const isCaseTakeover =
    key === 'case_takeover_addendum' ||
    key.endsWith('_case_takeover_addendum') ||
    key === 'case_takeover_balance_transfer' ||
    key.endsWith('_case_takeover_balance_transfer');
  if (!isCaseTakeover) return layout;

  // Logo only — funder name is filled dynamically via prefill tabs (same as Flex / BT).
  const logoBox =
    layout.branding?.logo ||
    ({
      pageNumber: '1',
      x: '217',
      y: '8',
      width: '178',
      height: '100',
    } as const);
  const logoUrl = String(funder?.logoUrl || '').trim();
  if (!logoUrl) {
    console.warn(
      '[case-takeover] No funder logoUrl available for branding stamp.',
      funder?.id || funder?.name || 'no-funder',
    );
    return layout;
  }
  const stamped = await stampFunderLogoOnPdfBase64(
    layout.documentBase64,
    logoUrl,
    logoBox,
  );
  if (!stamped || stamped === layout.documentBase64) return layout;
  return { ...layout, documentBase64: stamped };
}

async function resolveCoordinateLayoutKeyForFunderPdf(
  funderLayoutKey: string,
  contractState?: string | null,
): Promise<DocumentLayoutKey> {
  const funderId = String(funderLayoutKey || '')
    .trim()
    .replace(/^funder_/i, '');
  if (funderId) {
    const row = await prisma.funderProfile.findUnique({
      where: { id: funderId },
      select: {
        name: true,
        displayName: true,
        mainContractLayoutKey: true,
        allowedStates: true,
      },
    });
    if (row) {
      const allowedStates = Array.isArray(row.allowedStates)
        ? (row.allowedStates as unknown[]).map((s) => String(s)).filter(Boolean)
        : [];
      return resolveMainContractCoordinateLayoutKey({
        funderName: row.name,
        state: contractState,
        mainContractLayoutKey: row.mainContractLayoutKey,
        allowedStates,
      });
    }
  }
  return DOCUMENT_LAYOUT_KEYS.contract;
}

export type FunderLayoutContext = {
  funderProfileId?: string | null;
  funderName?: string | null;
  contractState?: string | null;
};

async function resolveFunderLayoutContext(
  context?: FunderLayoutContext,
): Promise<SerializedFunderProfile | null> {
  if (!context) return null;
  const hasHints =
    String(context.funderProfileId ?? '').trim() ||
    String(context.funderName ?? '').trim();
  if (!hasHints) return null;
  return resolveFunderProfile({
    funderProfileId: context.funderProfileId,
    funderName: context.funderName,
    state: context.contractState,
  });
}

/** Main contract PDF + layout, with the No-Debt-Settlement rider inserted as page 3. */
export async function loadMainContractLayoutPackage(
  layoutKey: string = DOCUMENT_LAYOUT_KEYS.contract,
  contractState?: string | null,
  funderName?: string | null,
): Promise<DocumentLayoutWithBase64> {
  const key = String(layoutKey || '').trim() || DOCUMENT_LAYOUT_KEYS.contract;
  const layout = await loadMainContractLayoutPackageWithoutRider(key, contractState);
  return insertAntiDebtSettlementRider(layout, {
    purchaserName: await resolveRiderPurchaserName(key, funderName),
  });
}

/** Purchaser on the rider: the deal's funder profile (legal name -> display name -> name). */
async function resolveRiderPurchaserName(
  layoutKey: string,
  funderName?: string | null,
): Promise<string> {
  const select = { legalName: true, displayName: true, name: true } as const;
  const pick = (p?: { legalName: string | null; displayName: string | null; name: string } | null) =>
    String(p?.legalName || p?.displayName || p?.name || '').trim().toUpperCase();
  try {
    const byName = String(funderName || '').trim();
    if (byName) {
      const profile = await prisma.funderProfile.findFirst({
        where: { name: { equals: byName, mode: 'insensitive' } },
        select,
      });
      if (pick(profile)) return pick(profile);
    }
    if (isFunderContractLayoutKey(layoutKey)) {
      const profile = await prisma.funderProfile.findFirst({
        where: { mainContractLayoutKey: layoutKey },
        select,
      });
      if (pick(profile)) return pick(profile);
    }
  } catch {
    /* fall back */
  }
  return '';
}

async function loadMainContractLayoutPackageWithoutRider(
  layoutKey: string = DOCUMENT_LAYOUT_KEYS.contract,
  contractState?: string | null,
): Promise<DocumentLayoutWithBase64> {
  const key = String(layoutKey || '').trim() || DOCUMENT_LAYOUT_KEYS.contract;

  if (isFunderContractLayoutKey(key)) {
    const coordinateKey = await resolveCoordinateLayoutKeyForFunderPdf(key, contractState);
    const layout = getDocumentLayout(coordinateKey);
    const texasCoords =
      coordinateKey === DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract;

    if (!texasCoords) {
      const defaultPdfUrl = await findDefaultContractPdfUrl();
      if (defaultPdfUrl) {
        const documentBase64 = await fetchPdfAsBase64(defaultPdfUrl);
        return { ...layout, key: DOCUMENT_LAYOUT_KEYS.contract, name: layout.name, documentBase64 };
      }
    }

    const pdfUrl = await findBoldSignTemplatePdfUrlByExactLayoutKey(key);
    if (pdfUrl) {
      const documentBase64 = await fetchPdfAsBase64(pdfUrl);
      const row = await prisma.boldSignTemplate.findFirst({
        where: { OR: [{ layoutKey: key }, { templateId: key }] },
        orderBy: { createdAt: 'desc' },
        select: { name: true },
      });
      return {
        ...layout,
        key,
        name: row?.name || layout.name,
        documentBase64,
      };
    }
    if (texasCoords) {
      try {
        const documentBase64 = await loadPlatformDocumentPdfBase64(coordinateKey);
        return { ...layout, documentBase64 };
      } catch {
        /* fall through to upload error */
      }
    }
    throw new Error(
      `No PDF configured for "${layout.name}". Upload the contract PDF in Settings → Funders.`,
    );
  }

  const platformKey = isDocumentLayoutKey(key) ? key : DOCUMENT_LAYOUT_KEYS.contract;
  const layout = getDocumentLayout(platformKey);
  try {
    const documentBase64 = await loadPlatformDocumentPdfBase64(platformKey);
    return { ...layout, documentBase64 };
  } catch (primaryErr) {
    if (platformKey === DOCUMENT_LAYOUT_KEYS.contract) {
      const latest = await prisma.contractTemplate.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      if (latest?.url) {
        const documentBase64 = await fetchPdfAsBase64(latest.url);
        return { ...layout, documentBase64 };
      }
    }
    throw primaryErr instanceof Error
      ? primaryErr
      : new Error(
          `No PDF configured for "${layout.name}". Upload to Cloudinary or ensure the default DocuSign template is available.`,
        );
  }
}

export async function loadLatestContractLayoutPackage(): Promise<DocumentLayoutWithBase64> {
  return loadMainContractLayoutPackage(DOCUMENT_LAYOUT_KEYS.contract);
}

export async function loadSupplementalLayoutPackage(
  ref: string,
  funderContext?: FunderLayoutContext,
): Promise<DocumentLayoutWithBase64> {
  const sourceRef = String(ref || '').trim();
  const funder = await resolveFunderLayoutContext(funderContext);

  const pack = await (async (): Promise<DocumentLayoutWithBase64> => {
  if (isDocumentLayoutKey(sourceRef)) {
    const layout = getDocumentLayout(sourceRef);
    if (funder?.id) {
      const docsFunderId =
        resolveAddendumDocumentsLayoutFunderId(funder) ||
        (isTexasFundingGroupFunderProfile(funder) ? funder.id : null);
      if (docsFunderId) {
        const storageType = resolveFunderSupplementalStorageType(sourceRef);
        const scopedKey = funderSupplementalLayoutKeyForDocument(docsFunderId, sourceRef);
        let scopedPdfUrl = await findBoldSignTemplatePdfUrlByExactLayoutKey(scopedKey);
        if (!scopedPdfUrl && storageType === 'case_takeover_addendum') {
          const legacyKey = funderSupplementalLayoutKeyForDocument(
            docsFunderId,
            'case_takeover_balance_transfer',
          );
          scopedPdfUrl = await findBoldSignTemplatePdfUrlByExactLayoutKey(legacyKey);
        }
        if (!scopedPdfUrl) {
          const typedRow = await prisma.boldSignTemplate.findFirst({
            where: {
              type: {
                in:
                  storageType === 'case_takeover_addendum'
                    ? ['case_takeover_addendum', 'case_takeover_balance_transfer']
                    : [storageType],
              },
              OR: [
                { layoutKey: { startsWith: `funder_${docsFunderId}_` } },
                { templateId: { startsWith: `funder_${docsFunderId}_` } },
              ],
            },
            orderBy: { createdAt: 'desc' },
          });
          scopedPdfUrl = String(typedRow?.pdfUrl || '').trim() || null;
        }
        if (scopedPdfUrl) {
          const documentBase64 = await fetchPdfAsBase64(scopedPdfUrl);
          const row = await prisma.boldSignTemplate.findFirst({
            where: { OR: [{ layoutKey: scopedKey }, { templateId: scopedKey }] },
            orderBy: { createdAt: 'desc' },
            select: { name: true },
          });
          return {
            ...layout,
            key: scopedKey,
            name: resolveFunderSupplementalDocumentDisplayName(
              storageType,
              funder,
              row?.name,
              layout.name,
            ),
            documentBase64,
          };
        }
      }
    }
    const documentBase64 = await loadPlatformDocumentPdfBase64(sourceRef);
    return { ...layout, documentBase64 };
  }

  // Funder-scoped addendum/ACH keys reuse platform coordinates; PDF comes from the funder row.
  if (isFunderSupplementalLayoutKey(sourceRef)) {
    const parsed = parseFunderSupplementalLayoutKey(sourceRef);
    const coordinateKey = resolveCoordinateLayoutKeyForTemplate({
      layoutKey: sourceRef,
      type: parsed?.supplementalType,
    });
    if (coordinateKey) {
      const layout = getDocumentLayout(coordinateKey);
      const pdfUrl = await findBoldSignTemplatePdfUrlByExactLayoutKey(sourceRef);
      if (pdfUrl) {
        const documentBase64 = await fetchPdfAsBase64(pdfUrl, sourceRef);
        const row = await prisma.boldSignTemplate.findFirst({
          where: { OR: [{ layoutKey: sourceRef }, { templateId: sourceRef }] },
          orderBy: { createdAt: 'desc' },
          select: { name: true, type: true },
        });
        return {
          ...layout,
          key: sourceRef,
          name: String(row?.name || '').trim() || layout.name,
          documentBase64,
        };
      }
      // No funder upload — fall back to platform default PDF (uploaded or DocuSign legacy).
      const documentBase64 = await loadPlatformDocumentPdfBase64(coordinateKey);
      return {
        ...layout,
        key: sourceRef,
        name: layout.name,
        documentBase64,
      };
    }
  }

  const resolved = await resolveTemplateRefForMerge(sourceRef);
  const layout =
    resolved.inlineLayout ||
    (resolved.layoutKey ? getDocumentLayout(resolved.layoutKey) : null);
  if (!layout) {
    throw new Error(`Supplemental document "${resolved.name || ref}" has no layout.`);
  }
  let documentBase64 = String(resolved.documentBase64 || '').trim();
  if (!documentBase64) {
    const pdfUrl = String(resolved.pdfUrl || '').trim();
    if (!pdfUrl || pdfUrl.startsWith('platform://')) {
      throw new Error(
        `Supplemental document "${resolved.name || ref}" is missing a Cloudinary pdfUrl.`,
      );
    }
    documentBase64 = await fetchPdfAsBase64(pdfUrl, resolved.name || ref);
  }
  if (!documentBase64) {
    throw new Error(`Supplemental document "${resolved.name || ref}" PDF could not be loaded.`);
  }
  return { ...layout, documentBase64 };
  })();

  return applyFunderBrandingToLayoutPdf(pack, funder);
}

export function signerRolesToLayoutSigners(
  roles: Array<Record<string, unknown>>,
): LayoutSignerInput[] {
  return roles
    .map((r, idx) => ({
      roleName: String(r.roleName || r.signerRole || `Signer ${idx + 1}`).trim(),
      name: String(r.signerName || '').trim(),
      email: String(r.signerEmail || '').trim(),
      routingOrder: Number(r.signerOrder ?? idx + 1),
    }))
    .filter((s) => s.email);
}

function roleLabelFromRow(row: Record<string, unknown>): string {
  return String(row.roleName || row.signerRole || '').trim();
}

/** Map CRM / template signer rows to DocuSign Client + Owner 2 slots for layout routing. */
export function collapseSignerRolesForLayoutEnvelope(
  roles: Array<Record<string, unknown>>,
  ownerCount: number,
): Array<Record<string, unknown>> {
  const withEmail = roles.filter((r) => String(r.signerEmail || '').trim());
  if (!withEmail.length) return roles;

  const primary =
    withEmail.find((r) => /^client|merchant|customer|receiver/i.test(roleLabelFromRow(r))) ||
    withEmail.find((r) => /^owner$/i.test(roleLabelFromRow(r))) ||
    withEmail.find((r) => /^guarantor$/i.test(roleLabelFromRow(r))) ||
    withEmail[0];

  if (ownerCount < 2) {
    return primary
      ? [
          {
            ...primary,
            signerRole: DOCUSIGN_DEFAULT_ROLE_NAME,
            roleName: DOCUSIGN_DEFAULT_ROLE_NAME,
            signerOrder: 1,
          },
        ]
      : roles;
  }

  let secondary =
    withEmail.find((r) => /owner\s*2/i.test(roleLabelFromRow(r))) ||
    withEmail.find((r) => /guarantor\s*2/i.test(roleLabelFromRow(r)));

  if (!secondary) {
    const primaryEmail = String(primary?.signerEmail || '').trim().toLowerCase();
    const secondaryCandidates = withEmail.filter((r) => {
      if (r === primary) return false;
      const label = roleLabelFromRow(r);
      const email = String(r.signerEmail || '').trim().toLowerCase();
      if (!email || email === primaryEmail) return false;
      return (
        /owner\s*2|guarantor\s*2/i.test(label) ||
        /^owner(\s*2)?$/i.test(label) ||
        /^guarantor(\s*2)?$/i.test(label) ||
        /^signer$/i.test(label)
      );
    });
    secondary =
      secondaryCandidates[secondaryCandidates.length - 1] ||
      withEmail.find((r) => {
        if (r === primary) return false;
        const email = String(r.signerEmail || '').trim().toLowerCase();
        return Boolean(email && email !== primaryEmail);
      }) ||
      withEmail[1];
  }

  const out: Array<Record<string, unknown>> = [];
  if (primary) {
    out.push({
      ...primary,
      signerRole: DOCUSIGN_DEFAULT_ROLE_NAME,
      roleName: DOCUSIGN_DEFAULT_ROLE_NAME,
      signerOrder: 1,
    });
  }
  if (secondary && secondary !== primary) {
    const secondaryRoleName =
      DOCUSIGN_SECONDARY_SIGNER_ROLE_NAME.toLowerCase() ===
      DOCUSIGN_DEFAULT_ROLE_NAME.toLowerCase()
        ? 'Owner 2'
        : DOCUSIGN_SECONDARY_SIGNER_ROLE_NAME;
    out.push({
      ...secondary,
      signerRole: secondaryRoleName,
      roleName: secondaryRoleName,
      signerOrder: 2,
    });
  }
  return out.length ? out : roles;
}

export function countOwnersFromRoles(roles: Array<Record<string, unknown>>): number {
  const distinctEmails = new Set(
    roles
      .map((r) => String(r.signerEmail || '').trim().toLowerCase())
      .filter(Boolean),
  );
  if (distinctEmails.size >= 2) return 2;

  let ownerLikeCount = 0;
  let hasExplicitSecond = false;
  for (const r of roles) {
    const roleName = String(r.roleName || r.signerRole || '').trim();
    const email = String(r.signerEmail || '').trim();
    if (!email) continue;
    if (/owner\s*2|guarantor\s*2/i.test(roleName)) {
      hasExplicitSecond = true;
    }
    if (/^owner(\s*2)?$/i.test(roleName) || /guarantor(\s*2)?/i.test(roleName)) {
      ownerLikeCount++;
    }
  }
  if (hasExplicitSecond) return 2;
  return ownerLikeCount > 0 ? Math.min(2, ownerLikeCount) : 1;
}

export function countGuarantorsFromRoles(roles: Array<Record<string, unknown>>): number {
  let count = 0;
  for (const r of roles) {
    const roleName = String(r.roleName || r.signerRole || '').trim();
    if (/^guarantor(\s*2)?$/i.test(roleName) && String(r.signerEmail || '').trim()) {
      count++;
    }
  }
  return Math.min(2, count);
}

/** Normalize supplemental refs to platform layout keys or CRM template row ids (e.g. state disclosure). */
export async function filterSupplementalRefs(refs: string[]): Promise<string[]> {
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  const out: string[] = [];
  for (const ref of refs) {
    const trimmed = String(ref || '').trim();
    if (!trimmed) continue;
    if (isDocumentLayoutKey(trimmed)) {
      out.push(trimmed);
      continue;
    }

    // Funder-owned keys (`funder_{uuid}_case_takeover_addendum`) are not UUIDs —
    // never query BoldSignTemplate.id with them (Postgres uuid cast fails).
    if (isFunderSupplementalLayoutKey(trimmed)) {
      const pdfUrl = await findBoldSignTemplatePdfUrlByExactLayoutKey(trimmed);
      if (pdfUrl) {
        out.push(trimmed);
        continue;
      }
      const scopedRow = await prisma.boldSignTemplate.findFirst({
        where: { OR: [{ layoutKey: trimmed }, { templateId: trimmed }] },
        select: { id: true },
      });
      if (scopedRow?.id) out.push(trimmed);
      continue;
    }

    const or: Array<{ id: string } | { templateId: string } | { layoutKey: string }> = [
      { templateId: trimmed },
      { layoutKey: trimmed },
    ];
    if (isUuid(trimmed)) {
      or.unshift({ id: trimmed });
    }

    const row = await prisma.boldSignTemplate.findFirst({
      where: { OR: or },
      select: { id: true, layoutKey: true, type: true, templateId: true, pdfUrl: true },
    });
    if (row?.id && String(row.pdfUrl || '').trim()) {
      out.push(String(row.id));
      continue;
    }
    const fromRow = String(row?.layoutKey || row?.templateId || '').trim();
    if (isDocumentLayoutKey(fromRow)) {
      out.push(fromRow);
    }
  }
  return [...new Set(out)];
}

export async function resolveSupplementalRefsFromDb(filters: {
  state?: string | null;
  frequency?: string | null;
  type?: string | null;
}): Promise<string[]> {
  const normalize = (value: string | null | undefined) => {
    const v = String(value ?? '').trim().toLowerCase();
    return v || undefined;
  };
  const where: Record<string, string> = {};
  const state = normalize(filters.state);
  const frequency = normalize(filters.frequency);
  const type = normalize(filters.type);
  if (state) where.state = state;
  if (frequency) where.frequency = frequency;
  if (type) where.type = type;

  const rows = await prisma.boldSignTemplate.findMany({
    where: {
      ...where,
      OR: [{ layoutKey: null }, { NOT: { layoutKey: { startsWith: 'funder_' } } }],
    },
    select: { id: true, pdfUrl: true },
  });
  return [...new Set(rows.filter((r) => r.pdfUrl).map((r) => r.id))];
}

export type SupplementalDocumentPosition = 'before_main' | 'after_main';

export async function buildPlatformLayoutEnvelopeDefinition(options: {
  supplementalRefs?: string[];
  /** Ordered supplemental document instances; duplicate refs and per-instance values are preserved. */
  supplementalDocuments?: Array<{
    documentRef: string;
    prefillFields?: Array<{ id: string; value: string }>;
    /** `before_main` places the document ahead of the main contract (e.g. state disclosure). */
    position?: SupplementalDocumentPosition;
  }>;
  /** ACH / other standalone docs — envelope contains only these PDFs (no main contract). */
  standaloneDocumentRefs?: string[];
  /** When false, envelope contains only supplemental layouts (e.g. standalone ACH). */
  includeMainContract?: boolean;
  mainContractLayoutKey?: string;
  funderProfileId?: string | null;
  funderName?: string | null;
  contractState?: string | null;
  roles: Array<Record<string, unknown>>;
  prefillFields?: Array<{ id: string; value: string }>;
  ownerCount?: number;
  guarantorCount?: number;
  title?: string;
  message?: string;
  /** Display name for the primary PDF document in the envelope. */
  documentName?: string;
  /** Burn prefill into PDF at create (auto-send). Draft review keeps editable tabs. */
  flattenPrefillInPdf?: boolean;
  lockDataTabs?: boolean;
  /** When set, may append reverse disbursement schedule as last page of main contract PDF. */
  contractId?: number;
}) {
  const standaloneRefs = options.standaloneDocumentRefs || [];
  const hasStandaloneOnly = standaloneRefs.length > 0;
  const includeMainContract = hasStandaloneOnly
    ? false
    : options.includeMainContract !== false;
  const funderProfile = await resolveFunderLayoutContext({
    funderProfileId: options.funderProfileId,
    funderName: options.funderName,
    contractState: options.contractState,
  });
  const funderContext: FunderLayoutContext = {
    funderProfileId:
      (funderProfile?.id && isPersistedFunderProfileId(funderProfile.id)
        ? funderProfile.id
        : null) ??
      (isPersistedFunderProfileId(options.funderProfileId)
        ? String(options.funderProfileId).trim()
        : null),
    funderName: funderProfile?.name ?? options.funderName,
    contractState: options.contractState,
  };
  const layouts: DocumentLayoutWithBase64[] = [];
  const layoutValues: Array<Record<string, string> | undefined> = [];
  const supplementalItems = options.supplementalDocuments || [];
  // Envelope order: `before_main` docs (state disclosure) → main contract → remaining docs (addenda).
  const leadingSupplementalItems = supplementalItems.filter(
    (item) => item.position === 'before_main',
  );
  const trailingSupplementalItems = supplementalItems.filter(
    (item) => item.position !== 'before_main',
  );
  for (const item of leadingSupplementalItems) {
    layouts.push(await loadSupplementalLayoutPackage(item.documentRef, funderContext));
    layoutValues.push(prefillFieldsToValueMap(item.prefillFields || []));
  }
  let mainLayoutIndex = -1;
  if (includeMainContract) {
    const mainContractLayoutKey =
      String(options.mainContractLayoutKey || '').trim() || DOCUMENT_LAYOUT_KEYS.contract;
    let mainLayout = await loadMainContractLayoutPackage(
      mainContractLayoutKey,
      options.contractState,
      funderContext.funderName,
    );
    const contractId = Number(options.contractId);
    if (Number.isFinite(contractId) && contractId > 0) {
      mainLayout = await maybeAppendReverseDisbursementToMainContractLayout(
        mainLayout,
        contractId,
      );
    }
    mainLayoutIndex = layouts.length;
    layouts.push(mainLayout);
    layoutValues.push(undefined);
  }
  if (supplementalItems.length) {
    for (const item of trailingSupplementalItems) {
      layouts.push(await loadSupplementalLayoutPackage(item.documentRef, funderContext));
      layoutValues.push(prefillFieldsToValueMap(item.prefillFields || []));
    }
  } else {
    for (const ref of options.supplementalRefs || []) {
      layouts.push(await loadSupplementalLayoutPackage(ref, funderContext));
      layoutValues.push(undefined);
    }
  }
  for (const ref of standaloneRefs) {
    layouts.push(await loadSupplementalLayoutPackage(ref, funderContext));
    layoutValues.push(undefined);
  }
  if (!layouts.length) {
    throw new Error('At least one document layout is required.');
  }

  const ownerCount = options.ownerCount ?? countOwnersFromRoles(options.roles);
  const collapsedRoles = collapseSignerRolesForLayoutEnvelope(options.roles, ownerCount);
  const signers = signerRolesToLayoutSigners(collapsedRoles);
  if (!signers.length) {
    throw new Error('At least one signer with a valid email is required.');
  }
  const guarantorCount =
    options.guarantorCount ??
    (ownerCount >= 2 ? 2 : countGuarantorsFromRoles(options.roles));
  const prefillFields = [...(options.prefillFields || [])];
  if (funderProfile) {
    const funderPlainName = String(
      funderProfile.displayName || funderProfile.name || '',
    ).trim();
    if (funderPlainName) {
      const funderNameIds = [
        'funder_name',
        'case_takeover_addendum_funder_name',
      ];
      // Drop every prior funder_name entry (e.g. disclosure forced "Woodmere"), then set once.
      const filtered = prefillFields.filter((f) => {
        const id = String(f.id || '').trim();
        return id !== 'funder_name' && id !== 'case_takeover_addendum_funder_name';
      });
      prefillFields.length = 0;
      prefillFields.push(...filtered);
      for (const id of funderNameIds) {
        prefillFields.push({
          id,
          value: funderPlainName,
        });
      }
    }
    const funderLabel = formatFunderNameWithDealIdPrefix(
      funderProfile.name,
      funderProfile.dealIdPrefix,
      funderProfile.displayName,
    );
    if (funderLabel) {
      const existingIdx = prefillFields.findIndex(
        (f) => String(f.id || '').trim() === 'funder_name_with_deal_prefix',
      );
      if (existingIdx >= 0) {
        prefillFields[existingIdx] = {
          ...prefillFields[existingIdx],
          id: 'funder_name_with_deal_prefix',
          value: funderLabel,
        };
      } else {
        prefillFields.push({
          id: 'funder_name_with_deal_prefix',
          value: funderLabel,
        });
      }
    }
    const dealPrefix = String(funderProfile.dealIdPrefix || '').trim();
    if (dealPrefix) {
      const existingPrefixIdx = prefillFields.findIndex(
        (f) => String(f.id || '').trim() === 'deal_id_prefix',
      );
      if (existingPrefixIdx >= 0) {
        prefillFields[existingPrefixIdx] = {
          ...prefillFields[existingPrefixIdx],
          id: 'deal_id_prefix',
          value: dealPrefix,
        };
      } else {
        prefillFields.push({
          id: 'deal_id_prefix',
          value: dealPrefix,
        });
      }
    }
  }

  const mainLayoutKeyForPrefill =
    String(options.mainContractLayoutKey || '').trim() ||
    (includeMainContract ? DOCUMENT_LAYOUT_KEYS.contract : '');
  const coordinateLayoutKeyForPrefill = includeMainContract
    ? resolveMainContractCoordinateLayoutKey({
        funderName: funderContext.funderName,
        state: options.contractState,
        mainContractLayoutKey: mainLayoutKeyForPrefill,
        allowedStates: funderProfile?.allowedStates,
      })
    : null;
  if (
    shouldApplyAllianceBridgeContractPrefill({
      layoutKey: mainLayoutKeyForPrefill,
      coordinateLayoutKey: coordinateLayoutKeyForPrefill,
      funderName: funderContext.funderName,
      contractState: options.contractState,
    })
  ) {
    const formatted = applyAllianceBridgeContractPrefillToFieldList(prefillFields);
    prefillFields.length = 0;
    prefillFields.push(...formatted);
  }

  const values = prefillFieldsToValueMap(prefillFields);
  const partyCounts = { ownerCount, guarantorCount };

  const shouldFlatten = options.flattenPrefillInPdf === true;
  const flattenedLayouts: DocumentLayoutWithBase64[] = [];
  const flattenedLayoutKeys = new Set<string>();
  if (shouldFlatten) {
    for (const [layoutIndex, layout] of layouts.entries()) {
      if (!shouldFlattenLayoutPdf(layout)) {
        flattenedLayouts.push(layout);
        continue;
      }
      try {
        const buf = await renderFlattenedLayoutPdf(
          layout,
          {
            ...values,
            ...(layoutValues[layoutIndex] || {}),
          },
          partyCounts,
        );
        if (buf?.length) {
          flattenedLayouts.push({
            ...layout,
            documentBase64: buf.toString('base64'),
          });
          flattenedLayoutKeys.add(layout.key);
          continue;
        }
      } catch (err) {
        console.warn(
          `[DocuSign] flatten prefill into PDF failed for layout "${layout.key}":`,
          err,
        );
      }
      flattenedLayouts.push(layout);
    }
  } else {
    flattenedLayouts.push(...layouts);
  }
  const prefillFlattenedInPdf = flattenedLayoutKeys.size > 0;

  for (const layout of flattenedLayouts) {
    await assertLayoutPlacementsFitPdfPages(layout);
  }

  let mergedDocument: { name: string; documentBase64: string } | undefined;
  let pageOffsetByLayoutKey: Map<string, number> | undefined;
  let pageOffsetByLayoutIndex: number[] | undefined;
  if (DOCUSIGN_COMBINE_PACKAGE_PDF && flattenedLayouts.length > 1) {
    const merged = await mergeLayoutPdfsToSingleDocument(flattenedLayouts);
    pageOffsetByLayoutKey = merged.pageOffsetByLayoutKey;
    pageOffsetByLayoutIndex = merged.pageOffsetByLayoutIndex;
    const primaryLayout = flattenedLayouts[Math.max(mainLayoutIndex, 0)];
    const mergedName = toEnvelopeSubjectUppercase(
      String(options.documentName || '').trim() ||
      primaryLayout.document.originalFileName ||
      primaryLayout.name ||
      'Contract Package',
    );
    mergedDocument = {
      name: mergedName,
      documentBase64: merged.documentBase64,
    };
    console.log(
      `[DocuSign] combined ${flattenedLayouts.length} layout PDF(s) into one document (${merged.pageCount} pages) for envelope send`,
    );
  }

  const envelope = buildEnvelopeFromLayouts({
    layouts: flattenedLayouts,
    values,
    layoutValues,
    signers,
    ownerCount,
    guarantorCount,
    primaryDocumentName: options.documentName,
    primaryLayoutIndex: Math.max(mainLayoutIndex, 0),
    flattenedLayoutKeys,
    lockDataTabs: options.lockDataTabs === true,
    mergedDocument,
    pageOffsetByLayoutKey,
    pageOffsetByLayoutIndex,
  });

  const createTimePrefillTabCount = prefillFlattenedInPdf
    ? 0
    : envelope.recipients.signers.reduce(
        (sum, s) =>
          sum +
          (s.tabs?.textTabs?.length || 0) +
          (s.tabs?.dateTabs?.length || 0),
        0,
      );

  return {
    envelopeDefinition: {
      ...envelope,
      // DocuSign rejects emailSubject over 100 chars (common on ACH: long business + " - ACH Form").
      emailSubject: String(options.title || 'Please sign this document')
        .trim()
        .slice(0, 100),
      emailBlurb: options.message || '',
    },
    createTimePrefillTabCount,
    prefillFlattenedInPdf,
    layoutKeys: layouts.map((l) => l.key),
  };
}
