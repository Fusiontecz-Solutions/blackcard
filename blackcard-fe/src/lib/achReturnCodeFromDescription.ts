import { getPreviewSheetDescription, type PreviewSheetRowLike } from "@/lib/previewSheetDebitCredit";

/** ACH return code token: R + two digits (e.g. R01, R08, R10). Letter O is treated as zero. */
const RETURN_CODE_TOKEN_REGEX = /R(?:1\d|0\d|O\d)/gi;

/** Known ACH return codes — short code → human-readable meaning. */
export const ACH_RETURN_CODE_MEANINGS: Readonly<Record<string, string>> = {
  R01: "Insufficient Funds",
  R02: "Account Closed",
  R03: "No Account / Unable to Locate",
  R04: "Invalid Account Number",
  R07: "Authorization Revoked",
  R08: "Payment Stopped",
  R10: "Customer Advises Not Authorized",
};

const LEGACY_ENUM_TO_SHORT: Record<string, string> = {
  R01_INSUFFICIENT_FUNDS: "R01",
  R02_ACCOUNT_CLOSED: "R02",
  R03_NO_ACCOUNT_UNABLE_TO_LOCATE: "R03",
  R04_INVALID_ACCOUNT_NUMBER: "R04",
  R07_AUTHORIZATION_REVOKED: "R07",
  R08_PAYMENT_STOPPED: "R08",
  R10_CUSTOMER_ADVISES_NOT_AUTHORIZED: "R10",
};

export function normalizeReturnCodeToken(raw: string): string | null {
  let token = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!token) return null;
  if (token.startsWith("RO")) token = `R0${token.slice(2)}`;
  if (!/^R\d{2}$/.test(token)) return null;
  return token;
}

/** Extract R## from description; prefers code at the beginning of the text. */
export function extractReturnCodeFromDescription(description: string): string | null {
  const text = String(description ?? "").trim();
  if (!text) return null;

  const startMatch = text.match(/^\s*(R(?:1\d|0\d|O\d))(?=$|[^A-Z0-9])/i);
  if (startMatch?.[1]) {
    const atStart = normalizeReturnCodeToken(startMatch[1]);
    if (atStart) return atStart;
  }

  const matches = [...text.matchAll(RETURN_CODE_TOKEN_REGEX)];
  if (!matches.length) return null;

  const normalized: string[] = [];
  for (const m of matches) {
    const idx = m.index ?? 0;
    const after = text[idx + m[0].length];
    if (after && /[A-Z]/i.test(after)) continue;
    const code = normalizeReturnCodeToken(m[0]);
    if (code) normalized.push(code);
  }

  if (!normalized.length) return null;
  if (normalized.includes("R10")) return "R10";
  return normalized[0] ?? null;
}

export function extractAchReturnTransactionStatus(description: string): string | null {
  return extractReturnCodeFromDescription(description);
}

/** Only reads this row's description — never a paired debit/credit line. */
export function resolveReturnCodeForSheetRow<T extends PreviewSheetRowLike>(
  row: T,
  _groupRows?: T[],
  _dealId?: string,
): string | null {
  const description = getPreviewSheetDescription(row);
  if (!description.trim()) return null;
  return extractReturnCodeFromDescription(description);
}

export function parseTransactionStatusValue(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const upper = text.toUpperCase().replace(/[\s-]+/g, "_");
  if (LEGACY_ENUM_TO_SHORT[upper]) return LEGACY_ENUM_TO_SHORT[upper];

  const short = normalizeReturnCodeToken(upper);
  if (short) return short;

  return extractReturnCodeFromDescription(text);
}

/** Short code stored in DB (e.g. R08). */
export function formatAchReturnStatusLabel(code: string): string {
  return parseTransactionStatusValue(code) ?? normalizeReturnCodeToken(code) ?? code;
}

/** Meaning for tooltips / display (e.g. "Payment Stopped" for R08). */
export function getReturnCodeMeaning(code: string): string | null {
  const short = parseTransactionStatusValue(code) ?? normalizeReturnCodeToken(code);
  if (!short) return null;
  return ACH_RETURN_CODE_MEANINGS[short] ?? null;
}

export type AchReturnCodeOption = {
  code: string;
  meaning: string;
  label: string;
};

/** Display label: `(R08 - Payment Stopped)` */
export function formatReturnCodeParenthetical(code: string): string {
  const short = parseTransactionStatusValue(code) ?? normalizeReturnCodeToken(code);
  if (!short) {
    const trimmed = String(code ?? "").trim();
    return trimmed ? `(${trimmed})` : "—";
  }
  const meaning = ACH_RETURN_CODE_MEANINGS[short];
  return meaning ? `(${short} - ${meaning})` : `(${short})`;
}

/** All ACH return codes for status pickers. */
export const ACH_RETURN_CODE_OPTIONS: AchReturnCodeOption[] = Object.entries(ACH_RETURN_CODE_MEANINGS)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([code, meaning]) => ({
    code,
    meaning,
    label: formatReturnCodeParenthetical(code),
  }));

/** Status cell label — same parenthetical format as dropdown options. */
export function formatReturnCodeDisplay(code: string): string {
  return formatReturnCodeParenthetical(code);
}
