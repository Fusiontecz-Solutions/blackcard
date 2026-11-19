import { isTexasFundingGroupFunderProfile } from "@/hooks/useFunderProfiles";

export const FUNDER_DOCUMENTS_SOURCES = ["platform", "own", "shared"] as const;
export type FunderDocumentsSource = (typeof FUNDER_DOCUMENTS_SOURCES)[number];

export type FunderDocumentKind = "addendum" | "disclosure";

export function normalizeFunderDocumentsSource(
  value?: string | null,
): FunderDocumentsSource {
  const token = String(value ?? "")
    .trim()
    .toLowerCase();
  if (token === "platform" || token === "shared") return token;
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

export function resolveAddendumDocumentsLayoutFunderId(
  profile: DocumentsSourceProfile,
): string | null {
  return resolveLayoutFunderIdForSource(
    profile,
    resolveAddendumDocumentsSource(profile),
    "addendum",
  );
}

export function resolveDisclosureDocumentsLayoutFunderId(
  profile: DocumentsSourceProfile,
): string | null {
  return resolveLayoutFunderIdForSource(
    profile,
    resolveDisclosureDocumentsSource(profile),
    "disclosure",
  );
}

/** @deprecated Prefer resolveAddendumDocumentsLayoutFunderId */
export function resolveDocumentsLayoutFunderId(
  profile: DocumentsSourceProfile,
): string | null {
  return resolveAddendumDocumentsLayoutFunderId(profile);
}

export function canManageFunderAddendums(
  profile: DocumentsSourceProfile,
): boolean {
  const source = resolveAddendumDocumentsSource(profile);
  if (source === "platform") return false;
  const layoutFunderId = resolveAddendumDocumentsLayoutFunderId(profile);
  return layoutFunderId === profile.id;
}

export function canManageFunderDisclosures(
  profile: DocumentsSourceProfile,
): boolean {
  const source = resolveDisclosureDocumentsSource(profile);
  if (source === "platform") return false;
  const layoutFunderId = resolveDisclosureDocumentsLayoutFunderId(profile);
  return layoutFunderId === profile.id;
}

export function canManageFunderDocuments(
  profile: DocumentsSourceProfile,
): boolean {
  return canManageFunderAddendums(profile) || canManageFunderDisclosures(profile);
}

export const FUNDER_ADDENDUM_SOURCE_OPTIONS = [
  {
    value: "platform" as const,
    label: "Platform defaults",
    description:
      "Use the shared platform addendums (same set as Black Card).",
  },
  {
    value: "own" as const,
    label: "This funder only",
    description: "Upload addendums just for this funder.",
  },
  {
    value: "shared" as const,
    label: "Same as another funder",
    description: "Reuse another funder's uploaded addendums.",
  },
] as const;

export const FUNDER_DISCLOSURE_SOURCE_OPTIONS = [
  {
    value: "platform" as const,
    label: "Platform defaults",
    description:
      "Use the shared platform state disclosures (same set as Black Card).",
  },
  {
    value: "own" as const,
    label: "This funder only",
    description: "Upload state disclosures just for this funder.",
  },
  {
    value: "shared" as const,
    label: "Same as another funder",
    description: "Reuse another funder's uploaded state disclosures.",
  },
] as const;

/** @deprecated Use FUNDER_ADDENDUM_SOURCE_OPTIONS / FUNDER_DISCLOSURE_SOURCE_OPTIONS */
export const FUNDER_DOCUMENTS_SOURCE_OPTIONS = FUNDER_ADDENDUM_SOURCE_OPTIONS;
