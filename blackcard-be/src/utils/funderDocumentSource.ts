import { isPlatformBrandName } from "../constants/brand";
import { isTexasFundingGroupFunderProfile } from "./funderProfileResolver";

export const FUNDER_DOCUMENTS_SOURCES = ["platform", "own", "shared"] as const;
export type FunderDocumentsSource = (typeof FUNDER_DOCUMENTS_SOURCES)[number];

export type FunderDocumentKind = "addendum" | "disclosure";

function normalizeToken(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function normalizeFunderDocumentsSource(
  value?: string | null,
): FunderDocumentsSource {
  const token = normalizeToken(value);
  if (token === "platform" || token === "shared") return token;
  return "own";
}

export function isWoodmereFinancialFunderName(
  name?: string | null,
  displayName?: string | null,
): boolean {
  return isPlatformBrandName(name) || isPlatformBrandName(displayName);
}

export function isTexasFundingGroupFunderName(
  name?: string | null,
  displayName?: string | null,
): boolean {
  return isTexasFundingGroupFunderProfile({ name, displayName });
}

export function inferDefaultFunderDocumentsSource(input: {
  name?: string | null;
  displayName?: string | null;
  mainContractLayoutKey?: string | null;
}): FunderDocumentsSource {
  if (isWoodmereFinancialFunderName(input.name, input.displayName)) return "platform";
  return "own";
}

type DocumentsSourceProfile = {
  id: string;
  name?: string | null;
  displayName?: string | null;
  mainContractLayoutKey?: string | null;
  organization?: string | null;
  legalName?: string | null;
  contactEmail?: string | null;
  documentsSource?: string | null;
  sharedDocumentsFunderId?: string | null;
  addendumDocumentsSource?: string | null;
  disclosureDocumentsSource?: string | null;
  sharedAddendumFunderId?: string | null;
  sharedDisclosureFunderId?: string | null;
};

/** Addendum/ACH PDF source — falls back to legacy documentsSource. */
export function resolveAddendumDocumentsSource(
  profile: Pick<
    DocumentsSourceProfile,
    "documentsSource" | "addendumDocumentsSource"
  >,
): FunderDocumentsSource {
  const dedicated = String(profile.addendumDocumentsSource ?? "").trim();
  if (dedicated) return normalizeFunderDocumentsSource(dedicated);
  return normalizeFunderDocumentsSource(profile.documentsSource);
}

/** State disclosure PDF source — falls back to legacy documentsSource. */
export function resolveDisclosureDocumentsSource(
  profile: Pick<
    DocumentsSourceProfile,
    "documentsSource" | "disclosureDocumentsSource"
  >,
): FunderDocumentsSource {
  const dedicated = String(profile.disclosureDocumentsSource ?? "").trim();
  if (dedicated) return normalizeFunderDocumentsSource(dedicated);
  return normalizeFunderDocumentsSource(profile.documentsSource);
}

function resolveSharedFunderIdForKind(
  profile: DocumentsSourceProfile,
  kind: FunderDocumentKind,
): string {
  if (kind === "addendum") {
    return (
      String(profile.sharedAddendumFunderId || "").trim() ||
      String(profile.sharedDocumentsFunderId || "").trim()
    );
  }
  return (
    String(profile.sharedDisclosureFunderId || "").trim() ||
    String(profile.sharedDocumentsFunderId || "").trim()
  );
}

function resolveLayoutFunderIdForSource(
  profile: DocumentsSourceProfile,
  source: FunderDocumentsSource,
  kind: FunderDocumentKind,
): string | null {
  if (isTexasFundingGroupFunderProfile(profile)) {
    if (source === "shared") {
      return resolveSharedFunderIdForKind(profile, kind) || profile.id;
    }
    // Honor "Platform defaults" — use Woodmere platform disclosure/addendum rows.
    if (source === "platform") return null;
    return profile.id;
  }
  if (source === "platform") return null;
  if (source === "shared") {
    return resolveSharedFunderIdForKind(profile, kind) || profile.id;
  }
  return profile.id;
}

/** Funder id for addendum/ACH layout keys; null = platform templates. */
export function resolveAddendumDocumentsLayoutFunderId(
  profile: DocumentsSourceProfile,
): string | null {
  return resolveLayoutFunderIdForSource(
    profile,
    resolveAddendumDocumentsSource(profile),
    "addendum",
  );
}

/** Funder id for disclosure layout keys; null = platform templates. */
export function resolveDisclosureDocumentsLayoutFunderId(
  profile: DocumentsSourceProfile,
): string | null {
  return resolveLayoutFunderIdForSource(
    profile,
    resolveDisclosureDocumentsSource(profile),
    "disclosure",
  );
}

/**
 * @deprecated Prefer resolveAddendumDocumentsLayoutFunderId /
 * resolveDisclosureDocumentsLayoutFunderId. Kept for older call sites (addendum).
 */
export function resolveDocumentsLayoutFunderId(
  profile: DocumentsSourceProfile,
): string | null {
  return resolveAddendumDocumentsLayoutFunderId(profile);
}

export function canManageFunderAddendums(
  profile: Pick<
    DocumentsSourceProfile,
    | "id"
    | "documentsSource"
    | "addendumDocumentsSource"
    | "sharedDocumentsFunderId"
    | "sharedAddendumFunderId"
    | "name"
    | "displayName"
    | "mainContractLayoutKey"
    | "organization"
    | "legalName"
    | "contactEmail"
  >,
): boolean {
  const source = resolveAddendumDocumentsSource(profile);
  if (source === "platform") return false;
  const layoutFunderId = resolveAddendumDocumentsLayoutFunderId(profile);
  return layoutFunderId === profile.id;
}

export function canManageFunderDisclosures(
  profile: Pick<
    DocumentsSourceProfile,
    | "id"
    | "documentsSource"
    | "disclosureDocumentsSource"
    | "sharedDocumentsFunderId"
    | "sharedDisclosureFunderId"
    | "name"
    | "displayName"
    | "mainContractLayoutKey"
    | "organization"
    | "legalName"
    | "contactEmail"
  >,
): boolean {
  const source = resolveDisclosureDocumentsSource(profile);
  if (source === "platform") return false;
  const layoutFunderId = resolveDisclosureDocumentsLayoutFunderId(profile);
  return layoutFunderId === profile.id;
}

/** True when either addendums or disclosures can be uploaded on this funder. */
export function canManageFunderDocuments(
  profile: DocumentsSourceProfile,
): boolean {
  return canManageFunderAddendums(profile) || canManageFunderDisclosures(profile);
}

const SUPPLEMENTAL_GENERIC_DISPLAY_NAMES: Record<string, string> = {
  flex_addendum: "Flex Addendum",
  pre_payment_addendum: 'Pre-Payment Addendum',
  balance_transfer: "Balance Transfer Sheet",
  case_takeover_addendum: "Case Takeover Balance Transfer",
  case_takeover_balance_transfer: "Case Takeover Balance Transfer",
  ach_authorization: "ACH Authorization",
  ach_authorization_standalone: "ACH Authorization",
};

/** Display name for funder-owned supplemental PDFs (avoid Woodmere platform labels on Texas Funding Group sends). */
export function resolveFunderSupplementalDocumentDisplayName(
  supplementalType: string,
  profile: {
    name?: string | null;
    displayName?: string | null;
    documentsSource?: string | null;
    addendumDocumentsSource?: string | null;
  } | null | undefined,
  uploadedName?: string | null,
  platformDefaultName?: string | null,
): string {
  const type = String(supplementalType || "").trim();
  const uploaded = String(uploadedName ?? "").trim();
  const usesPlatform =
    !profile || resolveAddendumDocumentsSource(profile) === "platform";
  if (usesPlatform) {
    return uploaded || String(platformDefaultName ?? "").trim() || type;
  }
  if (uploaded && !isPlatformBrandName(uploaded) && !/woodmere/i.test(uploaded)) {
    return uploaded;
  }
  const generic =
    SUPPLEMENTAL_GENERIC_DISPLAY_NAMES[type] ||
    String(platformDefaultName ?? "")
      .replace(/^(Woodmere|Black\s*Rok|Black\s*Card)[^ ]*\s+/i, "")
      .trim() ||
    type;
  const funderLabel = String(profile?.displayName || profile?.name || "").trim();
  return funderLabel ? `${funderLabel} ${generic}` : generic;
}

/**
 * Balance transfer label: bold FunderName ("DEALPREFIX").
 * Example: Black Card ("BCF")
 */
export function formatFunderNameWithDealIdPrefix(
  funderName?: string | null,
  dealIdPrefix?: string | null,
  displayName?: string | null,
): string {
  const name = String(displayName || funderName || "").trim();
  const prefix = String(dealIdPrefix || "").trim();
  if (!name && !prefix) return "";
  if (!name) return `("${prefix}")`;
  if (!prefix) return name;
  return `${name} ("${prefix}")`;
}
