/** Tooltip copy for projected end date cells (funding table + dashboard). */
export const SYNDICATOR_PROJECTED_END_DATE_TITLE =
  'Projected: start date (funding or allocation created) plus term length as payment periods—weekly ×7 days per period, bi-weekly ×14, monthly ≈30.4 days, daily +1 day each. If frequency is missing, periods are treated as weeks.';

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * `termLength` on the allocation is a **period count** (e.g. 16 weekly payments = 16 weeks), not raw calendar days.
 * Uses deal repayment frequency from terms / offer when present; otherwise assumes **weeks** (common MCA default).
 */
export function termPeriodsToApproxCalendarDays(periods: number, frequency: string | null | undefined): number {
  if (!Number.isFinite(periods) || periods <= 0) return 0;
  const raw = String(frequency ?? '').trim().toLowerCase();
  const f = raw.replace(/\s+/g, '').replace(/_/g, '');
  if (f.includes('biweek') || f === 'bi-weekly') return Math.round(periods * 14);
  if (f.includes('week')) return Math.round(periods * 7);
  if (f.includes('month')) return Math.round(periods * 30.437);
  if (f.includes('day')) return Math.round(periods);
  return Math.round(periods * 7);
}

export function formatProjectedEndDate(
  startIso: string | undefined,
  termLengthRaw: unknown,
  frequency: string | null | undefined,
): string {
  const periods = num(termLengthRaw);
  if (!startIso || !Number.isFinite(periods) || periods <= 0) return '—';
  const calendarDays = termPeriodsToApproxCalendarDays(periods, frequency);
  if (!calendarDays) return '—';
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime())) return '—';
  const end = new Date(start);
  end.setDate(end.getDate() + calendarDays);
  return end.toLocaleDateString();
}
