/** Mirrors backend `funderContractLayout.ts` slug rules for template lookup. */

export function slugifyFunderDocumentToken(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function funderDisclosureLayoutKeyForState(
  funderId: string,
  state: string,
  frequency: string,
): string {
  const id = String(funderId || "").trim();
  const stateToken = slugifyFunderDocumentToken(state);
  const freqToken = slugifyFunderDocumentToken(frequency);
  return `funder_${id}_disclosure_${stateToken}_${freqToken}`;
}

export function funderNamedAddendumLayoutKey(funderId: string, slug: string): string {
  const id = String(funderId || "").trim();
  const token = slugifyFunderDocumentToken(slug);
  return token ? `funder_${id}_addendum_${token}` : `funder_${id}_addendum`;
}

export const FUNDER_ADDENDUM_COORDINATE_LAYOUT_OPTIONS = [
  { value: "flex_addendum", label: "Flex addendum" },
  { value: "pre_payment_addendum", label: "Pre-payment addendum" },
  { value: "balance_transfer", label: "Balance transfer" },
  { value: "case_takeover_addendum", label: "Case Takeover Balance Transfer" },
  { value: "ach_authorization", label: "ACH authorization (Black Card)" },
  {
    value: "ach_authorization_texas",
    label: "ACH authorization (Texas)",
  },
] as const;

export const DISCLOSURE_FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
] as const;

export type FunderDocumentTemplateRow = {
  id: string;
  name: string;
  type: string;
  state: string | null;
  frequency: string | null;
  layoutKey: string | null;
  pdfUrl: string | null;
  createdAt: string;
};

export function isFunderDisclosureRow(row: FunderDocumentTemplateRow): boolean {
  return row.type === "disclosure" || String(row.layoutKey || "").includes("_disclosure_");
}

export function isFunderAddendumRow(row: FunderDocumentTemplateRow): boolean {
  const key = String(row.layoutKey || "");
  return (
    key.includes("_addendum_") ||
    key.endsWith("_flex_addendum") ||
    key.endsWith("_pre_payment_addendum") ||
    key.endsWith("_case_takeover_addendum") ||
    key.endsWith("_case_takeover_balance_transfer") ||
    key.endsWith("_balance_transfer") ||
    key.endsWith("_ach_authorization") ||
    key.endsWith("_ach_authorization_texas") ||
    key.includes("_ach_authorization")
  );
}

/** Platform Woodmere disclosures — exclude funder-owned layout keys from state/frequency lookup. */
export function isPlatformScopedBoldSignTemplateRow(row: {
  layoutKey?: string | null;
}): boolean {
  const key = String(row?.layoutKey ?? "").trim();
  if (!key) return true;
  return !key.startsWith("funder_");
}
