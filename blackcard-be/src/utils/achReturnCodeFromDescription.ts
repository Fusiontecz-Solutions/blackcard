import { getPreviewSheetDescription, type PreviewSheetRowLike } from './previewSheetDebitCredit';

/** ACH return code token: R + two digits (e.g. R01, R08, R10). Letter O is treated as zero. */
const RETURN_CODE_TOKEN_REGEX = /R(?:1\d|0\d|O\d)/gi;

/** Known ACH return codes — short code → human-readable meaning. */
export const ACH_RETURN_CODE_MEANINGS: Readonly<Record<string, string>> = {
  R01: 'Insufficient Funds',
  R02: 'Account Closed',
  R03: 'No Account / Unable to Locate',
  R04: 'Invalid Account Number',
  R07: 'Authorization Revoked',
  R08: 'Payment Stopped',
  R10: 'Customer Advises Not Authorized',
};

const LEGACY_ENUM_TO_SHORT: Record<string, string> = {
  R01_INSUFFICIENT_FUNDS: 'R01',
  R02_ACCOUNT_CLOSED: 'R02',
  R03_NO_ACCOUNT_UNABLE_TO_LOCATE: 'R03',
  R04_INVALID_ACCOUNT_NUMBER: 'R04',
  R07_AUTHORIZATION_REVOKED: 'R07',
  R08_PAYMENT_STOPPED: 'R08',
  R10_CUSTOMER_ADVISES_NOT_AUTHORIZED: 'R10',
};

/** Normalizes RO8 → R08, RO1 → R01; validates R## shape. */
export function normalizeReturnCodeToken(raw: string): string | null {
  let token = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!token) return null;
  if (token.startsWith('RO')) token = `R0${token.slice(2)}`;
  if (!/^R\d{2}$/.test(token)) return null;
  return token;
}

export function extractReturnCodeFromDescription(description: string): string | null {
  const text = String(description ?? '').trim();
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
  if (normalized.includes('R10')) return 'R10';
  return normalized[0] ?? null;
}

/** @deprecated Use extractReturnCodeFromDescription */
export function extractAchReturnTransactionStatus(description: string): string | null {
  return extractReturnCodeFromDescription(description);
}

/** Only this row's description — never a paired debit/credit line. */
export function resolveReturnCodeForSheetRow<T extends PreviewSheetRowLike>(
  row: T,
  _groupRows?: T[],
  _dealId?: string,
): string | null {
  const description = getPreviewSheetDescription(
    (row.rowData ?? {}) as Record<string, unknown>,
    row.description,
  );
  if (!description.trim()) return null;
  return extractReturnCodeFromDescription(description);
}

export function parseTransactionStatusValue(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  const upper = text.toUpperCase().replace(/[\s-]+/g, '_');
  if (LEGACY_ENUM_TO_SHORT[upper]) return LEGACY_ENUM_TO_SHORT[upper];

  const short = normalizeReturnCodeToken(upper);
  if (short) return short;

  return extractReturnCodeFromDescription(text);
}

export function formatAchReturnStatusLabel(code: string): string {
  return normalizeReturnCodeToken(code) ?? code;
}

export function getReturnCodeMeaning(code: string): string | null {
  const short = normalizeReturnCodeToken(code);
  if (!short) return null;
  return ACH_RETURN_CODE_MEANINGS[short] ?? null;
}

export function formatReturnCodeDisplay(code: string): string {
  const short = formatAchReturnStatusLabel(code);
  const meaning = getReturnCodeMeaning(short);
  return meaning ? `${short} — ${meaning}` : short;
}
