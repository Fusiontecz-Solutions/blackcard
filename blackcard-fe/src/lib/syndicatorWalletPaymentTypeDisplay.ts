const SYNDICATION_PREFIX = 'SYNDICATION_';

/** Strip internal `SYNDICATION_` prefix from wallet `paymentType` for tables (e.g. COMMISSION, MANAGEMENT_FEE). */
export function syndicatorWalletPaymentTypeDisplay(
  paymentType: string | null | undefined,
): string {
  if (paymentType == null || String(paymentType).trim() === '') return '—';
  const s = String(paymentType);
  if (s.toUpperCase().startsWith(SYNDICATION_PREFIX)) {
    return s.slice(SYNDICATION_PREFIX.length).toUpperCase();
  }
  return s;
}
