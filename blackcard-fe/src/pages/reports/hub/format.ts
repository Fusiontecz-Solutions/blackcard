/** Number, money and bucket formatters plus palette slot references for the Reports hub. */

export const fmtInt = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString('en-US'));
export const fmtMoney = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const fmtMoneyShort = (v: number | null | undefined) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
};
export const fmtPct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(digits)}%`);
export const fmtDays = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(v < 10 ? 1 : 0)}d`);
export const fmtBucket = (bucket: string) => {
  if (/^\d{4}-\d{2}$/.test(bucket)) return new Date(`${bucket}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const d = new Date(`${bucket}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? bucket : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

export const SERIES = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `var(--viz-series-${i})`);
export const SEQ = [1, 2, 3, 4, 5, 6].map((i) => `var(--viz-seq-${i})`);
export const MUTED = 'var(--viz-muted)';
