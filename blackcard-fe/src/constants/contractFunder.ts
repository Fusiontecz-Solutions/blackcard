import { CONTRACT_ENVELOPE_LENDER_NAME } from "@/components/application/contractdata/docusignTemplateConfig";
import {
  TEXAS_FUNDING_GROUP_FUNDER_LABEL,
  isTexasFundingGroupFunder,
} from "@/components/application/contractdata/platformDocumentConfig";
import {
  FALLBACK_FUNDER_PROFILES,
  findFunderProfile,
  funderNamesEquivalent,
  funderNamesForContractState,
  funderSelectOptionsForState,
  isTexasFundingGroupFunderProfile,
  persistedFunderProfileIdForApi,
  resolveDefaultFunderNameForState,
  resolveMainContractLayoutKeyFromFunders,
  useFunderProfiles,
} from "@/hooks/useFunderProfiles";

export const DEFAULT_FUNDER_NAME = CONTRACT_ENVELOPE_LENDER_NAME;

export { TEXAS_FUNDING_GROUP_FUNDER_LABEL };

/** Default funder options shown in Contract Information (fallback profiles). */
export const DEFAULT_FUNDER_OPTIONS: readonly string[] = [DEFAULT_FUNDER_NAME];

export function funderOptionsForState(state?: string | null): string[] {
  return funderNamesForContractState(FALLBACK_FUNDER_PROFILES, state);
}

/** Coerce stored funder values to known platform funders; preserve custom funder names from Settings. */
export function normalizeLegacyFunderName(value: unknown): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (funderNamesEquivalent(v, DEFAULT_FUNDER_NAME)) return DEFAULT_FUNDER_NAME;
  if (isTexasFundingGroupFunder(v)) {
    const profile = findFunderProfile(FALLBACK_FUNDER_PROFILES, v);
    return profile?.name ?? TEXAS_FUNDING_GROUP_FUNDER_LABEL;
  }
  return v;
}

export function pickFunderForSelect(
  value: unknown,
  options: readonly string[] = DEFAULT_FUNDER_OPTIONS,
): string {
  const v = normalizeLegacyFunderName(value);
  if (!v) return "";
  const exact = options.find((s) => s === v);
  if (exact) return exact;
  const ci = options.find((s) => s.toLowerCase() === v.toLowerCase());
  if (ci) return ci;
  return v;
}

export {
  isTexasFundingGroupFunderProfile,
  useFunderProfiles,
  FALLBACK_FUNDER_PROFILES,
  findFunderProfile,
  funderNamesForContractState,
  funderSelectOptionsForState,
  resolveDefaultFunderNameForState,
  resolveMainContractLayoutKeyFromFunders,
  persistedFunderProfileIdForApi,
};
