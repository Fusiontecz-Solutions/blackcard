import {
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';

export type WalletSeriesRow = { date: string; amount: string };

export type RecentApplication = {
  allocationId: number;
  applicationUuid: string;
  /** External / CRM deal identifier when set; UI should prefer this over `applicationId` for display. */
  dealId: string | null;
  applicationId: number | null;
  dealDisplayName: string | null;
  /** Allocation row merchant label (matches funding table). */
  merchantName: string | null;
  /** Application client business name (matches funding table company column). */
  businessName: string | null;
  /** ISO funding date when funded; used with allocation `createdAt` for start / projected end. */
  fundingDate: string | null;
  /** Latest terms / offer frequency for projected end date. */
  repaymentFrequency: string | null;
  status: string | null;
  currentQueue: string | null;
  createdAt: string;
  fundedAmount: number;
  paybackAmount: number;
  amountSyndicated: number;
  paybackAmountSyndicated: number;
  commissionAmount: number;
  managementFeeToDate: number;
  collectedAmount: number;
  remainingAmount: number;
  percentageSyndicated: number;
  termLength: number;
  factorRate: number | null;
  frequency: string | null;
  paymentAmount: number | null;
  numberOfPayments: number | null;
  percentPaid: number;
};

/** Collection-payment rows for syndicated deals (e.g. sheet uploads → `CollectionPayment`); drives Payout list. */
export type RecentPayoutCollection = {
  id: string;
  trsDate: string;
  /** Deal-level row amount from `CollectionPayment`. */
  amount: number;
  /** This syndicator’s share (`amount` × allocation % / 100). */
  syndicatorAmount: number;
  status: string;
  paymentStatusLabel: string;
  transactionType: string;
  source: string;
  notes: string | null;
  referenceNumber: string | null;
  applicationId: string;
  dealId: string | null;
  applicationDealId: string | null;
  applicationNumericId: number | null;
  dealDisplayName: string | null;
  businessName: string | null;
  /** True when this row is the merged debit↔credit reversal (net $0 to syndicator). */
  pairedReversal?: boolean;
};

export type SummaryResponse = {
  syndicator: {
    id: number;
    firstName: string;
    lastName: string | null;
    currentBalance: number;
  };
  totals: {
    fundedAmount: number;
    amountSyndicated: number;
    paybackAmountSyndicated: number;
    commissionAmount: number;
    managementFeeToDate: number;
    collectedAmount: number;
    remainingAmount: number;
    defaultedAmount: number;
    slowPayAmount: number;
    allocationsCount: number;
  };
  trend: {
    REPAYMENT: WalletSeriesRow[];
    Funding: WalletSeriesRow[];
  };
  recentApplications: RecentApplication[];
  /** Present on newer APIs; drives syndicator payout list from `CollectionPayment` rows. */
  recentPayoutCollections?: RecentPayoutCollection[];
};

export type TrendBucket = { month: string; actual: number };

/** Bucket repayment ledger rows into chart series (daily / weekly / monthly). */
export function bucketRepayments(
  rows: WalletSeriesRow[],
  timeframe: 'daily' | 'weekly' | 'monthly',
): TrendBucket[] {
  const now = new Date();

  if (timeframe === 'daily') {
    const start = startOfDay(subDays(now, 13));
    const days = eachDayOfInterval({ start, end: now });
    return days.map((d) => {
      const dStart = startOfDay(d);
      const dEnd = endOfDay(d);
      return {
        month: format(dStart, 'MMM d'),
        actual: rows.reduce((sum, r) => {
          const rd = parseISO(r.date);
          return rd >= dStart && rd <= dEnd ? sum + Number(r.amount) : sum;
        }, 0),
      };
    });
  }

  if (timeframe === 'weekly') {
    const startThisWeek = startOfWeek(now, { weekStartsOn: 0 });
    const buckets = Array.from({ length: 8 }, (_, i) => {
      const weekStart = subWeeks(startThisWeek, 7 - i);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
      return { start: weekStart, end: weekEnd, label: `Wk${i + 1}` };
    });
    return buckets.map((b) => ({
      month: b.label,
      actual: rows.reduce((sum, r) => {
        const d = parseISO(r.date);
        return d >= b.start && d <= b.end ? sum + Number(r.amount) : sum;
      }, 0),
    }));
  }

  const start = subMonths(now, 11);
  const months = eachMonthOfInterval({ start, end: now });
  return months.map((m) => {
    const mStart = startOfMonth(m);
    const mEnd = endOfMonth(m);
    return {
      month: format(mStart, 'MMM'),
      actual: rows.reduce((sum, r) => {
        const d = parseISO(r.date);
        return d >= mStart && d <= mEnd ? sum + Number(r.amount) : sum;
      }, 0),
    };
  });
}

export function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

/** 3-point rolling average of `actual` for a dashed “trend” line on composed charts. */
export function addRollingTrend(rows: TrendBucket[]): (TrendBucket & { trend: number })[] {
  return rows.map((row, i, arr) => {
    const from = Math.max(0, i - 2);
    const slice = arr.slice(from, i + 1);
    const trend = slice.reduce((s, x) => s + x.actual, 0) / slice.length;
    return { ...row, trend };
  });
}
