function envText(key: string): string {
  const value =
    typeof import.meta !== "undefined"
      ? String((import.meta.env as Record<string, string | undefined>)[key] || "")
      : "";
  return value.trim();
}

/** Short brand shown in the CRM, emails, and letters. Override with VITE_APP_COMPANY_NAME. */
export const APP_COMPANY_NAME = envText("VITE_APP_COMPANY_NAME") || "Black Card";

/** Legal entity name (letters, wire beneficiary). Override with VITE_APP_COMPANY_LEGAL_NAME. */
export const APP_COMPANY_LEGAL_NAME =
  envText("VITE_APP_COMPANY_LEGAL_NAME") || "Black Card LLC";

/** CRM product name referenced in client-facing emails. */
export const APP_COMPANY_CRM_NAME =
  envText("VITE_APP_COMPANY_CRM_NAME") || APP_COMPANY_NAME;

const PLATFORM_BRAND_ALIASES = new Set([
  "woodmere financial",
  "woodmere",
  "black card",
  "black card llc",
  "blackcard",
  "black card financial",
  "black rok",
  "black rok llc",
  "blackrok",
  "black rok financial",
  "blackrock",
  "black rock",
  "black rock llc",
]);

function normalizeBrandToken(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, " ");
}

/** True for the platform lender (legacy Woodmere names still match after rebrand). */
export function isPlatformBrandName(value?: string | null): boolean {
  const token = normalizeBrandToken(value);
  if (!token || token.includes("texas")) return false;
  const compact = token.replace(/\s+/g, "");
  return (
    PLATFORM_BRAND_ALIASES.has(token) ||
    token.includes("woodmere") ||
    token.includes("black card") ||
    token.includes("black rok") ||
    compact.includes("blackcard") ||
    compact.includes("blackrok") ||
    compact.includes("blackrock")
  );
}

export function platformBrandAliasesEquivalent(
  left?: string | null,
  right?: string | null,
): boolean {
  const a = normalizeBrandToken(left);
  const b = normalizeBrandToken(right);
  if (!a || !b) return false;
  return isPlatformBrandName(a) && isPlatformBrandName(b);
}

const LEGACY_BRAND_PATTERN =
  /\b(katan(?:\s*(?:ii|iii|2|3|capital(?:\s+llc)?)?)?|woodmere(?:\s+(?:financial|capital|llc))?|hard\s*rock|hardrock|landova|ocean\s+preferred|black\s*rok(?:\s+(?:llc|financial))?)\b/gi;

/** True when a template/file label still uses a previous CRM brand. */
export function looksLikeLegacyBrandLabel(value?: string | null): boolean {
  LEGACY_BRAND_PATTERN.lastIndex = 0;
  return LEGACY_BRAND_PATTERN.test(String(value ?? ""));
}

/** Swap leftover Katan/Woodmere/etc. labels for the current company name. */
export function replaceLegacyBrandInDisplayName(
  value?: string | null,
  fallback = `${APP_COMPANY_NAME} Contract.pdf`,
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  LEGACY_BRAND_PATTERN.lastIndex = 0;
  if (!LEGACY_BRAND_PATTERN.test(raw)) return raw;
  LEGACY_BRAND_PATTERN.lastIndex = 0;
  const next = raw
    .replace(LEGACY_BRAND_PATTERN, APP_COMPANY_NAME)
    .replace(/\s{2,}/g, " ")
    .trim();
  return next || fallback;
}
