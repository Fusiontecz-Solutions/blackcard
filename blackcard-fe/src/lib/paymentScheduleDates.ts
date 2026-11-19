import { formatDateMonthDayYear } from "@/lib/utils";

export type PaymentScheduleEntry = {
  index: number;
  date: string;
  amount: number;
  label: string;
};

function parseLocalDate(iso: string): Date | null {
  const m = String(iso ?? "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getTodayInputDate(): string {
  return formatYmd(new Date());
}

export function isWeekend(iso: string): boolean {
  const d = parseLocalDate(iso);
  if (!d) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** Next Mon–Fri on or after the given calendar day. */
export function toNextBusinessDay(iso: string): string {
  const d = parseLocalDate(iso);
  if (!d) return iso;
  const cursor = new Date(d);
  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor.setDate(cursor.getDate() + 1);
  }
  return formatYmd(cursor);
}

export function getDefaultPaymentStartDate(): string {
  return toNextBusinessDay(getTodayInputDate());
}

export function parsePaymentTerm(term: string): number {
  const cleaned = String(term ?? "").replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function getScheduleFrequencyLabel(frequency: string): string {
  const f = String(frequency ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (f === "weekly") return "Weekly";
  if (f === "monthly") return "Monthly";
  if (f === "bi-weekly" || f === "biweekly") return "Bi-Weekly";
  return "Daily";
}

export function getFrequencyScheduleSummary(
  frequency: string,
  paymentCount: number,
): string {
  const label = getScheduleFrequencyLabel(frequency);
  const count = Math.max(0, paymentCount);
  if (count === 0) return "Enter a valid term to preview payments";

  if (label === "Daily") {
    return `${count} weekday debit${count === 1 ? "" : "s"} (Mon–Fri · 5 per calendar week)`;
  }
  if (label === "Weekly") {
    return `${count} weekly debit${count === 1 ? "" : "s"} on the same weekday`;
  }
  if (label === "Bi-Weekly") {
    return `${count} debit${count === 1 ? "" : "s"} every 14 days`;
  }
  return `${count} monthly debit${count === 1 ? "" : "s"}`;
}

function advanceByFrequency(d: Date, frequency: string): Date {
  const next = new Date(d);
  const f = String(frequency ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  if (f === "weekly") {
    next.setDate(next.getDate() + 7);
    return next;
  }
  if (f === "bi-weekly" || f === "biweekly") {
    next.setDate(next.getDate() + 14);
    return next;
  }
  if (f === "monthly") {
    next.setMonth(next.getMonth() + 1);
    return next;
  }

  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6);
  return next;
}

function effectiveStartDate(iso: string, frequency: string): Date | null {
  const parsed = parseLocalDate(iso);
  if (!parsed) return null;

  const f = String(frequency ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (f === "daily" || f === "") {
    const cursor = new Date(parsed);
    while (cursor.getDay() === 0 || cursor.getDay() === 6) {
      cursor.setDate(cursor.getDate() + 1);
    }
    return cursor;
  }
  return parsed;
}

export function buildPaymentSchedule(params: {
  startDate: string;
  term: string;
  frequency: string;
  paymentAmount: number;
}): PaymentScheduleEntry[] {
  const count = parsePaymentTerm(params.term);
  if (!count || !params.startDate?.trim()) return [];

  const start = effectiveStartDate(params.startDate.trim(), params.frequency);
  if (!start) return [];

  const amount = Number(params.paymentAmount);
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;

  const entries: PaymentScheduleEntry[] = [];
  let cursor = new Date(start);

  for (let i = 0; i < count; i++) {
    if (i > 0) {
      cursor = advanceByFrequency(cursor, params.frequency);
    }
    const date = formatYmd(cursor);
    entries.push({
      index: i + 1,
      date,
      amount: safeAmount,
      label: formatDateMonthDayYear(date) || date,
    });
  }

  return entries;
}

export function getScheduleEndDate(
  entries: PaymentScheduleEntry[],
): string | null {
  if (!entries.length) return null;
  return entries[entries.length - 1]?.date ?? null;
}

export function sumScheduleAmounts(entries: PaymentScheduleEntry[]): number {
  return entries.reduce((sum, row) => {
    const n = Number(row.amount);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

export function patchPaymentScheduleEntry(
  entry: PaymentScheduleEntry,
  patch: { date?: string; amount?: number },
): PaymentScheduleEntry {
  const date =
    patch.date != null && /^\d{4}-\d{2}-\d{2}$/.test(patch.date.trim())
      ? patch.date.trim()
      : entry.date;
  const amount =
    patch.amount != null && Number.isFinite(patch.amount) && patch.amount >= 0
      ? Math.round(patch.amount * 100) / 100
      : entry.amount;

  return {
    ...entry,
    date,
    amount,
    label: formatDateMonthDayYear(date) || date,
  };
}
