/**
 * Payment cadence only (Daily / Weekly / …). Rejects disclosure percents like "0.00%"
 * that were historically written into OfferDecision / ACH / Contract.frequency.
 */

const PAYMENT_FREQUENCY_LABELS = new Set([
  'daily',
  'weekly',
  'monthly',
  'biweekly',
]);

function looksLikePaymentFrequencyLabel(value: string): boolean {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return false;
  const compact = trimmed.toLowerCase().replace(/[^a-z]/g, '');
  if (PAYMENT_FREQUENCY_LABELS.has(compact)) return true;
  return /^(daily|weekly|monthly|bi[-\s]?weekly)$/i.test(trimmed);
}

/** Normalize to Title Case cadence, or empty string if not a valid payment frequency. */
export function coercePaymentFrequencyLabel(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (/%/.test(text)) return '';
  const asNum = Number(String(text).replace(/,/g, ''));
  if (Number.isFinite(asNum) && !looksLikePaymentFrequencyLabel(text)) return '';

  const normalized = text.replace(/_/g, ' ').trim();
  if (!normalized) return '';
  if (!looksLikePaymentFrequencyLabel(normalized)) return '';

  return normalized
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Persist-only: cadence label or null (never save "0.00%" / bare numbers as frequency). */
export function sanitizePaymentFrequencyForPersist(raw: unknown): string | null {
  const label = coercePaymentFrequencyLabel(raw);
  return label || null;
}
