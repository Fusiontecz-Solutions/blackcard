import prisma from '../config/prismaClient';
import { decryptEncryptedStringsInJson } from '../utils/fieldEncryption';
import { mergePreservingDocuSignEnvelopeMeta } from './docusign/utils/preserve-docusign-prefill-meta';

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function ownerFullName(first?: unknown, last?: unknown): string {
  return `${str(first)} ${str(last)}`.trim();
}

/**
 * Prefill keys owned by live Client / owners — Overview edits must keep these in sync.
 * Woodmere-specific: authorizationClientSignerName + ACH consent name2 are identity-derived;
 * auth/ACH account-holder tabs use business legal name (not person).
 *
 * ACH authorization* / achAuthorization* camelCase keys stay off the main blob (multi-form
 * isolation). Per-mapping ACH tabs are patched via patchDocumentTemplatePrefillAchIdentity.
 */
export const CLIENT_IDENTITY_PREFILL_KEYS = [
  'customerName',
  'legalName',
  'clientName',
  'appendixClientName',
  'exhibitOwnerName',
  'doingBusinessAs',
  'securityDoingBusinessAs',
  'businessAddress',
  'businessAddressCity',
  'businessAddressState',
  'businessAddressZip',
  'businessAddressContract',
  'businessAddressContractCity',
  'businessAddressContractState',
  'businessAddressContractZip',
  'guarantorAddress',
  'guarantorAddressCity',
  'guarantorAddressState',
  'guarantorAddressZip',
  'state',
  'entityType',
  'federalTaxIdEin',
  'securityTaxEin',
  'securityBusinessName',
  'securityBusinessAddress',
  'securityBusinessAddressCity',
  'securityBusinessAddressState',
  'securityBusinessAddressZip',
  'securityGuarantor',
  'clientEmail',
  'clientPhone',
  'guarantorEmail',
  'guarantorPhone',
  'guarantyClientName',
  'guarantySs',
  'guarantySsDriverLicense',
  'guarantyOwner1Name',
  'guarantyOwner1Ss',
  'guarantyOwner1DriverLicense',
  'guarantyGuarantor1Name',
  'guarantyGuarantor1Ss',
  'guarantyGuarantor1DriverLicense',
  'owner1GuarantorName',
  'merchant2Name',
  'appendixMerchant2Name',
  'businessName2',
  'owner2GuarantorName',
  'guarantyOwner2Name',
  'guarantyOwner2Ss',
  'guarantyOwner2DriverLicense',
  'guarantyGuarantor2Name',
  'guarantyGuarantor2Ss',
  'guarantyGuarantor2DriverLicense',
] as const;

type ClientIdentityPrefillKey = (typeof CLIENT_IDENTITY_PREFILL_KEYS)[number];

type ClientRow = {
  businessName?: string | null;
  businessEmail?: string | null;
  businessNumber?: string | null;
  businessWebsite?: string | null;
  businessIncorporationState?: string | null;
  businessEntityType?: string | null;
  businessEinNumber?: string | null;
  businessAddress1?: string | null;
  businessAddress2?: string | null;
  businessCity?: string | null;
  businessState?: string | null;
  businessZipCode?: string | null;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
  ownerEmail?: string | null;
  ownerMobileNumber?: string | null;
  ownerSsn?: string | null;
  ownerAddress1?: string | null;
  ownerAddress2?: string | null;
  ownerCity?: string | null;
  ownerState?: string | null;
  ownerZipCode?: string | null;
  driverLicense?: string | null;
  owners?: Array<{
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    mobileNumber?: string | null;
    ssn?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    sortOrder?: number | null;
  }>;
};

function buildClientIdentityPrefillPatch(
  client: ClientRow,
): Partial<Record<ClientIdentityPrefillKey, string | null>> {
  const owners = Array.isArray(client.owners)
    ? [...client.owners].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];
  const o1 = owners[0];
  const o2 = owners[1];

  const ownerFirst = str(o1?.firstName ?? client.ownerFirstName);
  const ownerLast = str(o1?.lastName ?? client.ownerLastName);
  const ownerName = ownerFullName(ownerFirst, ownerLast);
  const ownerSsn = str(o1?.ssn ?? client.ownerSsn);
  const ownerDl = str(client.driverLicense);
  const ownerEmail = str(o1?.email ?? client.ownerEmail);
  const ownerPhone = str(o1?.mobileNumber ?? client.ownerMobileNumber);

  const businessLegalName = str(client.businessName);
  const legalName = businessLegalName || ownerName;
  const customerName = ownerName || legalName;
  const businessStreet = [str(client.businessAddress1), str(client.businessAddress2)]
    .filter(Boolean)
    .join(', ');
  const ownerStreet = [
    str(o1?.address1 ?? client.ownerAddress1),
    str(o1?.address2 ?? client.ownerAddress2),
  ]
    .filter(Boolean)
    .join(', ');
  const taxEin = str(client.businessEinNumber);
  const phone = str(client.businessNumber) || ownerPhone;
  const email = str(client.businessEmail) || ownerEmail;
  const entityType = str(client.businessEntityType);
  const incorpState = str(client.businessIncorporationState) || str(client.businessState);

  const patch: Partial<Record<ClientIdentityPrefillKey, string | null>> = {
    customerName: customerName || null,
    legalName: legalName || null,
    clientName: customerName || null,
    appendixClientName: customerName || null,
    exhibitOwnerName: ownerName || customerName || null,
    businessAddress: businessStreet || null,
    businessAddressCity: str(client.businessCity) || null,
    businessAddressState: str(client.businessState) || null,
    businessAddressZip: str(client.businessZipCode) || null,
    businessAddressContract: ownerStreet || null,
    businessAddressContractCity: str(o1?.city ?? client.ownerCity) || null,
    businessAddressContractState: str(o1?.state ?? client.ownerState) || null,
    businessAddressContractZip: str(o1?.zipCode ?? client.ownerZipCode) || null,
    guarantorAddress: ownerStreet || null,
    guarantorAddressCity: str(o1?.city ?? client.ownerCity) || null,
    guarantorAddressState: str(o1?.state ?? client.ownerState) || null,
    guarantorAddressZip: str(o1?.zipCode ?? client.ownerZipCode) || null,
    state: incorpState || null,
    entityType: entityType || null,
    federalTaxIdEin: taxEin || null,
    securityTaxEin: taxEin || null,
    securityBusinessName: legalName || null,
    securityBusinessAddress: businessStreet || null,
    securityBusinessAddressCity: str(client.businessCity) || null,
    securityBusinessAddressState: str(client.businessState) || null,
    securityBusinessAddressZip: str(client.businessZipCode) || null,
    securityGuarantor: ownerName || customerName || null,
    clientEmail: email || null,
    clientPhone: phone || null,
    guarantorEmail: ownerEmail || email || null,
    guarantorPhone: ownerPhone || phone || null,
    guarantyClientName: ownerName || customerName || null,
    guarantySs: ownerSsn || null,
    guarantySsDriverLicense: ownerDl || null,
    guarantyOwner1Name: ownerName || null,
    guarantyOwner1Ss: ownerSsn || null,
    guarantyOwner1DriverLicense: ownerDl || null,
    guarantyGuarantor1Name: ownerName || null,
    guarantyGuarantor1Ss: ownerSsn || null,
    guarantyGuarantor1DriverLicense: ownerDl || null,
    owner1GuarantorName: ownerName || null,
  };

  const o2Name = ownerFullName(o2?.firstName, o2?.lastName);
  const o2Ssn = str(o2?.ssn);
  if (o2Name || o2Ssn) {
    if (o2Name) {
      patch.merchant2Name = o2Name;
      patch.appendixMerchant2Name = o2Name;
      patch.businessName2 = o2Name;
      patch.owner2GuarantorName = o2Name;
      patch.guarantyOwner2Name = o2Name;
      patch.guarantyGuarantor2Name = o2Name;
    }
    if (o2Ssn) {
      patch.guarantyOwner2Ss = o2Ssn;
      patch.guarantyGuarantor2Ss = o2Ssn;
    }
  }

  return patch;
}

function asContractPrefillObject(existing: unknown): Record<string, unknown> {
  if (existing != null && typeof existing === 'object' && !Array.isArray(existing)) {
    return { ...(existing as Record<string, unknown>) };
  }
  if (typeof existing === 'string' && existing.trim()) {
    try {
      const parsed = JSON.parse(existing) as unknown;
      if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      /* keep empty base */
    }
  }
  return {};
}

function patchContractPrefillOverridesIdentity(
  existing: unknown,
  patch: Partial<Record<ClientIdentityPrefillKey, string | null>>,
): Record<string, unknown> {
  const base = asContractPrefillObject(existing);
  for (const key of CLIENT_IDENTITY_PREFILL_KEYS) {
    if (!(key in patch)) continue;
    const val = patch[key];
    if (val == null || val === '') {
      // Keep prior override when Overview left the field blank so KYC/manual values are not wiped.
      continue;
    }
    base[key] = val;
  }
  return decryptEncryptedStringsInJson(base) as Record<string, unknown>;
}

const DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY = 'documentTemplatePrefillByMappingId';

type AchMappingIdentityValues = {
  businessName: string;
  personName: string;
  taxId: string;
  phone: string;
  dba: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

function mappingLooksLikeAch(fields: Record<string, unknown>, mappingId: string): boolean {
  const id = String(mappingId || '').toLowerCase();
  if (id === 'ach_authorization' || id.includes('ach')) return true;
  return Object.keys(fields).some((key) => {
    const k = key.toLowerCase();
    return (
      k.includes('authorization_client') ||
      k.includes('ach_authorization') ||
      k.includes('authorized_business_phone')
    );
  });
}

function normalizeAchMappingTabKey(key: string): string {
  return String(key || '')
    .toLowerCase()
    .replace(/^ach_form_texas_/, '')
    .replace(/^ach_form_/, '')
    .replace(/__instance_\d+$/i, '')
    .replace(/__p\d+_[a-z0-9]+$/i, '')
    .replace(/__page\d+$/i, '');
}

function setAchMappingField(
  fields: Record<string, string>,
  canonicalTab: string,
  value: string,
): void {
  if (!value) return;
  const target = normalizeAchMappingTabKey(canonicalTab);
  let matched = false;
  for (const key of Object.keys(fields)) {
    if (normalizeAchMappingTabKey(key) === target) {
      matched = true;
      // Never overwrite a saved ACH form value with live Client identity.
      if (String(fields[key] ?? '').trim()) continue;
      fields[key] = value;
    }
  }
  if (!matched) {
    fields[canonicalTab] = value;
  }
}

/** Mirror Overview identity into each ACH form's documentTemplatePrefillByMappingId entry. */
function patchDocumentTemplatePrefillAchIdentity(
  overrides: Record<string, unknown>,
  identity: AchMappingIdentityValues,
): Record<string, unknown> {
  const rawBlob = overrides[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
  if (rawBlob == null || typeof rawBlob !== 'object' || Array.isArray(rawBlob)) {
    return overrides;
  }
  const blob = { ...(rawBlob as Record<string, unknown>) };
  let blobChanged = false;
  for (const [mappingId, rawFields] of Object.entries(blob)) {
    if (rawFields == null || typeof rawFields !== 'object' || Array.isArray(rawFields)) {
      continue;
    }
    const fields = { ...(rawFields as Record<string, unknown>) } as Record<string, string>;
    const stringFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      stringFields[k] = String(v ?? '');
    }
    if (!mappingLooksLikeAch(stringFields, mappingId)) continue;

    setAchMappingField(stringFields, 'authorization_client_name', identity.businessName);
    setAchMappingField(stringFields, 'authorization_client_signer_name', identity.businessName);
    setAchMappingField(stringFields, 'authorization_client_name_print', identity.personName);
    setAchMappingField(stringFields, 'authorization_client_tax_id', identity.taxId);
    setAchMappingField(stringFields, 'authorized_business_phone', identity.phone);
    setAchMappingField(
      stringFields,
      'ach_authorization_account_holder_name',
      identity.businessName,
    );
    setAchMappingField(stringFields, 'ach_authorization_account_holder_dba', identity.dba);
    setAchMappingField(stringFields, 'ach_authorization_account_holder_phone', identity.phone);
    setAchMappingField(
      stringFields,
      'ach_authorization_account_holder_address',
      identity.address,
    );
    setAchMappingField(stringFields, 'ach_authorization_account_holder_city', identity.city);
    setAchMappingField(stringFields, 'ach_authorization_account_holder_state', identity.state);
    setAchMappingField(stringFields, 'ach_authorization_account_holder_zip', identity.zip);
    setAchMappingField(
      stringFields,
      'ach_authorization_concent_account_holder_name',
      identity.personName,
    );
    setAchMappingField(
      stringFields,
      'ach_authorization_concent_account_holder_name_2',
      identity.personName,
    );

    blob[mappingId] = stringFields;
    blobChanged = true;
  }
  if (!blobChanged) return overrides;
  return {
    ...overrides,
    [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: blob,
  };
}

type OwnerPartyForSignerSync = {
  firstName: string;
  lastName: string;
  email: string;
  name: string;
};

/** Live CRM owners (up to 2) used to refresh Signer Details after Overview edits. */
function buildOwnerPartiesForSignerSync(client: ClientRow): OwnerPartyForSignerSync[] {
  const owners = Array.isArray(client.owners)
    ? [...client.owners].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];
  const o1 = owners[0];
  const o2 = owners[1];

  const parties: OwnerPartyForSignerSync[] = [];
  const firstName1 = str(o1?.firstName ?? client.ownerFirstName);
  const lastName1 = str(o1?.lastName ?? client.ownerLastName);
  const email1 = str(o1?.email ?? client.ownerEmail);
  const name1 = ownerFullName(firstName1, lastName1);
  if (name1 || email1) {
    parties.push({ firstName: firstName1, lastName: lastName1, email: email1, name: name1 });
  }

  const firstName2 = str(o2?.firstName);
  const lastName2 = str(o2?.lastName);
  const email2 = str(o2?.email);
  const name2 = ownerFullName(firstName2, lastName2);
  if (name2 || email2) {
    parties.push({ firstName: firstName2, lastName: lastName2, email: email2, name: name2 });
  }

  return parties.slice(0, 2);
}

function isOwnerLikeSignerRole(role: string): boolean {
  const r = role.toLowerCase();
  if (!r || r.includes('cc') || r.includes('carbon')) return false;
  return (
    r.includes('client') ||
    r.includes('owner') ||
    r.includes('guarantor') ||
    r.includes('signer') ||
    r.includes('merchant')
  );
}

/**
 * Keep frozen `contractSignerOverrides` names/emails aligned with CRM owners.
 * Match by email first, then by owner-like role slot index.
 */
function patchContractSignerOverridesFromOwners(
  overrides: Record<string, unknown>,
  parties: OwnerPartyForSignerSync[],
): Record<string, unknown> {
  if (!parties.length) return overrides;
  const rows = overrides.contractSignerOverrides;
  if (!Array.isArray(rows) || !rows.length) return overrides;

  const claimed = new Set<number>();
  const updated = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const r = row as Record<string, unknown>;
    const role = str(r.role);
    const email = str(r.email).toLowerCase();
    const name = str(r.name);
    if (!isOwnerLikeSignerRole(role)) return row;

    let partyIndex = -1;
    if (email) {
      partyIndex = parties.findIndex(
        (p, i) => !claimed.has(i) && str(p.email).toLowerCase() === email,
      );
    }
    if (partyIndex < 0) {
      partyIndex = parties.findIndex((_, i) => !claimed.has(i));
    }
    if (partyIndex < 0) return row;
    claimed.add(partyIndex);
    const party = parties[partyIndex]!;
    return {
      ...r,
      name: party.name || name,
      email: party.email || str(r.email),
    };
  });

  return {
    ...overrides,
    contractSignerOverrides: updated,
  };
}

async function syncContractOwnersFromClientParties(
  contractId: number,
  parties: OwnerPartyForSignerSync[],
): Promise<void> {
  if (!parties.length) return;
  const existing = await (prisma as any).contractOwner.findMany({
    where: { contractId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!Array.isArray(existing) || !existing.length) return;

  await Promise.all(
    existing.slice(0, parties.length).map(async (row: { id: number; firstName?: string; lastName?: string; email?: string | null }, index: number) => {
      const party = parties[index];
      if (!party) return;
      const data: { firstName?: string; lastName?: string; email?: string } = {};
      if (party.firstName) data.firstName = party.firstName;
      else if (party.name) data.firstName = party.name.split(/\s+/)[0] || row.firstName;
      if (party.lastName) data.lastName = party.lastName;
      else if (party.name) {
        const parts = party.name.split(/\s+/);
        if (parts.length > 1) data.lastName = parts.slice(1).join(' ');
      }
      if (party.email) data.email = party.email;
      if (Object.keys(data).length === 0) return;
      await (prisma as any).contractOwner.update({
        where: { id: row.id },
        data,
      });
    }),
  );
}

/**
 * After Client create/update (Overview tab), mirror identity fields into every linked
 * Contract.contractPrefillOverrides (+ matching contract columns) so Prefill Edit and
 * DocuSign draft builds stay aligned with CRM.
 */
export async function syncClientToContractPrefill(clientId: string): Promise<void> {
  const id = str(clientId);
  if (!id) return;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      owners: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!client) return;

  const patch = buildClientIdentityPrefillPatch(client as ClientRow);
  const nonemptyPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v != null && String(v).trim() !== ''),
  ) as Partial<Record<ClientIdentityPrefillKey, string>>;
  const ownerParties = buildOwnerPartiesForSignerSync(client as ClientRow);

  if (Object.keys(nonemptyPatch).length === 0 && ownerParties.length === 0) return;

  const contracts = await prisma.contract.findMany({
    where: { clientId: id },
    select: { id: true, contractPrefillOverrides: true },
  });

  // Also sync contracts linked via applications for this client (clientId on contract may be stale).
  const apps = await prisma.application.findMany({
    where: { clientId: id },
    select: { id: true },
  });
  const appIds = apps.map((a) => a.id);
  if (appIds.length > 0) {
    const byApp = await prisma.contract.findMany({
      where: { applicationId: { in: appIds } },
      select: { id: true, contractPrefillOverrides: true },
    });
    const seen = new Set(contracts.map((c) => c.id));
    for (const row of byApp) {
      if (!seen.has(row.id)) contracts.push(row);
    }
  }

  if (contracts.length === 0) return;

  const columnUpdate: Record<string, string | null> = {};
  const columnKeys = [
    'legalName',
    'clientName',
    'entityType',
    'clientEmail',
    'clientPhone',
    'customerName',
    'securityTaxEin',
    'businessAddress',
    'businessAddressCity',
    'businessAddressState',
    'businessAddressZip',
    'doingBusinessAs',
    'federalTaxIdEin',
    'exhibitOwnerName',
    'appendixClientName',
    'businessAddressContract',
    'businessAddressContractCity',
    'businessAddressContractState',
    'businessAddressContractZip',
    'securityBusinessName',
    'securityDoingBusinessAs',
    'securityBusinessAddress',
    'securityBusinessAddressCity',
    'securityBusinessAddressState',
    'securityBusinessAddressZip',
    'securityGuarantor',
  ] as const;
  for (const key of columnKeys) {
    if (key in nonemptyPatch) {
      columnUpdate[key] = nonemptyPatch[key as ClientIdentityPrefillKey] ?? null;
    }
  }

  await Promise.all(
    contracts.map(async (contract) => {
      const identityPatched = patchContractPrefillOverridesIdentity(
        contract.contractPrefillOverrides,
        patch,
      );
      const withAchMapping = patchDocumentTemplatePrefillAchIdentity(identityPatched, {
        businessName: str(nonemptyPatch.legalName) || str(client.businessName),
        personName: str(nonemptyPatch.customerName),
        taxId: str(nonemptyPatch.federalTaxIdEin),
        phone: str(nonemptyPatch.clientPhone),
        dba: str(nonemptyPatch.doingBusinessAs),
        address: str(nonemptyPatch.businessAddress),
        city: str(nonemptyPatch.businessAddressCity),
        state: str(nonemptyPatch.businessAddressState),
        zip: str(nonemptyPatch.businessAddressZip),
      });
      const withSigners = patchContractSignerOverridesFromOwners(
        withAchMapping,
        ownerParties,
      );
      // Meta merge can restore a prior `contractSignerOverrides` blob when identity
      // patching started from a non-object JSON value. Re-apply owner names after merge.
      const mergedMeta = mergePreservingDocuSignEnvelopeMeta(
        contract.contractPrefillOverrides,
        withSigners,
      );
      let mergedOverrides = patchContractSignerOverridesFromOwners(
        asContractPrefillObject(mergedMeta ?? withSigners),
        ownerParties,
      );
      // Meta merge must not drop the ACH mapping identity patch.
      mergedOverrides = patchDocumentTemplatePrefillAchIdentity(mergedOverrides, {
        businessName: str(nonemptyPatch.legalName) || str(client.businessName),
        personName: str(nonemptyPatch.customerName),
        taxId: str(nonemptyPatch.federalTaxIdEin),
        phone: str(nonemptyPatch.clientPhone),
        dba: str(nonemptyPatch.doingBusinessAs),
        address: str(nonemptyPatch.businessAddress),
        city: str(nonemptyPatch.businessAddressCity),
        state: str(nonemptyPatch.businessAddressState),
        zip: str(nonemptyPatch.businessAddressZip),
      });
      await prisma.contract.update({
        where: { id: contract.id },
        data: {
          ...columnUpdate,
          contractPrefillOverrides: decryptEncryptedStringsInJson(
            mergedOverrides,
          ) as object,
        } as any,
      });
      await syncContractOwnersFromClientParties(contract.id, ownerParties);

      const achIdentityUpdate: Record<string, string | null> = {};
      const businessName = str(nonemptyPatch.legalName) || str(client.businessName);
      const phone = str(nonemptyPatch.clientPhone);
      const dba = str(nonemptyPatch.doingBusinessAs);
      const address = str(nonemptyPatch.businessAddress);
      const city = str(nonemptyPatch.businessAddressCity);
      const state = str(nonemptyPatch.businessAddressState);
      const zip = str(nonemptyPatch.businessAddressZip);
      if (businessName) achIdentityUpdate.accountHolderName = businessName;
      if (phone) achIdentityUpdate.phone = phone;
      if (dba) achIdentityUpdate.dba = dba;
      if (address) achIdentityUpdate.address = address;
      if (city) achIdentityUpdate.city = city;
      if (state) achIdentityUpdate.state = state;
      if (zip) achIdentityUpdate.zip = zip;
      if (Object.keys(achIdentityUpdate).length > 0) {
        await prisma.aCH.updateMany({
          where: { contractId: contract.id },
          data: achIdentityUpdate as any,
        });
      }
    }),
  );
}

/**
 * Keep Application list "Business Name" (`dealDisplayName`) aligned with Client.businessName.
 * List UI prefers dealDisplayName when set, so Overview / ACH / Contract identity edits must
 * refresh it or the pipeline table stays stale.
 */
export async function syncClientDisplayNameToApplications(clientId: string): Promise<void> {
  const id = str(clientId);
  if (!id) return;

  const client = await prisma.client.findUnique({
    where: { id },
    select: { businessName: true },
  });
  const businessName = str(client?.businessName);
  if (!businessName) return;

  await prisma.application.updateMany({
    where: { clientId: id },
    data: { dealDisplayName: businessName },
  });
}

function splitPersonName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1]!,
  };
}

function asPrefillRecord(existing: unknown): Record<string, unknown> {
  return asContractPrefillObject(existing);
}

function prefillStr(prefill: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = str(prefill[key]);
    if (v) return v;
  }
  return '';
}

/**
 * Reverse of syncClientToContractPrefill: when Contract / ACH prefill identity fields are saved,
 * push them onto the linked Client (+ owners) so Overview and lists match.
 * Uses prisma directly (not clientController) to avoid re-entering Client → Contract sync loops.
 */
export async function syncContractPrefillIdentityToClient(contractId: number): Promise<void> {
  if (!Number.isFinite(contractId) || contractId <= 0) return;

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      clientId: true,
      applicationId: true,
      contractPrefillOverrides: true,
      legalName: true,
      customerName: true,
      clientName: true,
      clientEmail: true,
      clientPhone: true,
      entityType: true,
      federalTaxIdEin: true,
      securityTaxEin: true,
      securityBusinessName: true,
      businessAddress: true,
      businessAddressCity: true,
      businessAddressState: true,
      businessAddressZip: true,
      authorizationClientName: true,
      authorizationClientNamePrint: true,
    },
  });
  if (!contract) return;

  let clientId = str(contract.clientId);
  if (!clientId && contract.applicationId) {
    const app = await prisma.application.findUnique({
      where: { id: contract.applicationId },
      select: { clientId: true },
    });
    clientId = str(app?.clientId);
  }
  if (!clientId) return;

  const prefill = asPrefillRecord(contract.contractPrefillOverrides);

  const businessName =
    prefillStr(prefill, 'legalName', 'securityBusinessName') ||
    str(contract.legalName) ||
    str(contract.securityBusinessName);

  const owner1Name =
    prefillStr(
      prefill,
      'guarantyClientName',
      'guarantyOwner1Name',
      'guarantyGuarantor1Name',
      'owner1GuarantorName',
      'customerName',
      'clientName',
      'appendixClientName',
      'exhibitOwnerName',
    ) ||
    str(contract.customerName) ||
    str(contract.clientName);

  const owner2Name = prefillStr(
    prefill,
    'merchant2Name',
    'appendixMerchant2Name',
    'businessName2',
    'owner2GuarantorName',
    'guarantyOwner2Name',
    'guarantyGuarantor2Name',
  );

  const owner1Ssn = prefillStr(
    prefill,
    'guarantySs',
    'guarantyOwner1Ss',
    'guarantyGuarantor1Ss',
  );
  const owner2Ssn = prefillStr(prefill, 'guarantyOwner2Ss', 'guarantyGuarantor2Ss');

  const businessEmail =
    prefillStr(prefill, 'clientEmail', 'guarantorEmail') || str(contract.clientEmail);
  const businessPhone =
    prefillStr(prefill, 'clientPhone', 'guarantorPhone') || str(contract.clientPhone);
  const entityType = prefillStr(prefill, 'entityType') || str(contract.entityType);
  const ein =
    prefillStr(prefill, 'federalTaxIdEin', 'securityTaxEin') ||
    str(contract.federalTaxIdEin) ||
    str(contract.securityTaxEin);
  const businessStreet =
    prefillStr(prefill, 'businessAddress', 'securityBusinessAddress') ||
    str(contract.businessAddress);
  const businessCity =
    prefillStr(prefill, 'businessAddressCity', 'securityBusinessAddressCity') ||
    str(contract.businessAddressCity);
  const businessState =
    prefillStr(prefill, 'businessAddressState', 'securityBusinessAddressState', 'state') ||
    str(contract.businessAddressState);
  const businessZip =
    prefillStr(prefill, 'businessAddressZip', 'securityBusinessAddressZip') ||
    str(contract.businessAddressZip);

  const ownerStreet = prefillStr(prefill, 'businessAddressContract', 'guarantorAddress');
  const ownerCity = prefillStr(prefill, 'businessAddressContractCity', 'guarantorAddressCity');
  const ownerState = prefillStr(prefill, 'businessAddressContractState', 'guarantorAddressState');
  const ownerZip = prefillStr(prefill, 'businessAddressContractZip', 'guarantorAddressZip');

  const clientUpdate: Record<string, string | null> = {};
  if (businessName) clientUpdate.businessName = businessName;
  if (businessEmail) clientUpdate.businessEmail = businessEmail;
  if (businessPhone) clientUpdate.businessNumber = businessPhone;
  if (entityType) clientUpdate.businessEntityType = entityType;
  if (ein) clientUpdate.businessEinNumber = ein;
  if (businessStreet) clientUpdate.businessAddress1 = businessStreet;
  if (businessCity) clientUpdate.businessCity = businessCity;
  if (businessState) {
    clientUpdate.businessState = businessState;
    clientUpdate.businessIncorporationState = businessState;
  }
  if (businessZip) clientUpdate.businessZipCode = businessZip;

  if (owner1Name) {
    const { firstName, lastName } = splitPersonName(owner1Name);
    if (firstName) clientUpdate.ownerFirstName = firstName;
    if (lastName || firstName) clientUpdate.ownerLastName = lastName;
  }
  if (owner1Ssn) clientUpdate.ownerSsn = owner1Ssn;
  if (businessEmail) clientUpdate.ownerEmail = businessEmail;
  if (businessPhone) clientUpdate.ownerMobileNumber = businessPhone;
  if (ownerStreet) clientUpdate.ownerAddress1 = ownerStreet;
  if (ownerCity) clientUpdate.ownerCity = ownerCity;
  if (ownerState) clientUpdate.ownerState = ownerState;
  if (ownerZip) clientUpdate.ownerZipCode = ownerZip;

  if (Object.keys(clientUpdate).length > 0) {
    await prisma.client.update({
      where: { id: clientId },
      data: clientUpdate,
    });
  }

  const existingOwners = await prisma.clientOwner.findMany({
    where: { clientId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, sortOrder: true },
  });

  if (owner1Name || owner1Ssn || ownerStreet || ownerCity || ownerState || ownerZip) {
    const { firstName, lastName } = splitPersonName(owner1Name);
    const o1Data: Record<string, string | null> = {};
    if (firstName) o1Data.firstName = firstName;
    if (owner1Name) o1Data.lastName = lastName;
    if (owner1Ssn) o1Data.ssn = owner1Ssn;
    if (businessEmail) o1Data.email = businessEmail;
    if (businessPhone) o1Data.mobileNumber = businessPhone;
    if (ownerStreet) o1Data.address1 = ownerStreet;
    if (ownerCity) o1Data.city = ownerCity;
    if (ownerState) o1Data.state = ownerState;
    if (ownerZip) o1Data.zipCode = ownerZip;

    if (Object.keys(o1Data).length > 0) {
      const primary = existingOwners[0];
      if (primary) {
        await prisma.clientOwner.update({ where: { id: primary.id }, data: o1Data });
      } else if (firstName) {
        await prisma.clientOwner.create({
          data: {
            clientId,
            sortOrder: 0,
            firstName,
            lastName: lastName || '',
            email: o1Data.email ?? null,
            mobileNumber: o1Data.mobileNumber ?? null,
            ssn: o1Data.ssn ?? null,
            address1: o1Data.address1 ?? null,
            city: o1Data.city ?? null,
            state: o1Data.state ?? null,
            zipCode: o1Data.zipCode ?? null,
          },
        });
      }
    }
  }

  if (owner2Name || owner2Ssn) {
    const { firstName, lastName } = splitPersonName(owner2Name);
    const o2Data: Record<string, string | null> = {};
    if (firstName) o2Data.firstName = firstName;
    if (owner2Name) o2Data.lastName = lastName;
    if (owner2Ssn) o2Data.ssn = owner2Ssn;

    if (Object.keys(o2Data).length > 0) {
      const secondary = existingOwners[1];
      if (secondary) {
        await prisma.clientOwner.update({ where: { id: secondary.id }, data: o2Data });
      } else if (firstName) {
        await prisma.clientOwner.create({
          data: {
            clientId,
            sortOrder: 1,
            firstName,
            lastName: lastName || '',
            ssn: o2Data.ssn ?? null,
          },
        });
      }
    }
  }

  await syncClientDisplayNameToApplications(clientId);
}
