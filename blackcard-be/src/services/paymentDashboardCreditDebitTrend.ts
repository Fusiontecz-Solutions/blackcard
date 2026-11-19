import type { CollectionPayment, Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import { paymentBelongsToApplicationDeal } from './collectionPaymentFinancials';
import { buildApplicationStatsBucketWhere } from './applicationStatsBucketWhere';
import { mergeApplicationWhereWithOrganization } from '../utils/deriveOrganizationFromDealId';
import type { PortfolioDashboardContext } from './paymentPortfolioDashboardService';

export type CreditDebitTrendView = 'monthly' | 'weekly' | 'monthlyInYear' | 'yearly';

export type MoneyFlowPointDto = {
  label: string;
  inflow: number;
  outflow: number;
};

export type CreditDebitTrendSeries = {
  monthly: MoneyFlowPointDto[];
  weekly: MoneyFlowPointDto[];
  monthlyInYear: MoneyFlowPointDto[];
  yearly: MoneyFlowPointDto[];
};

export type CreditDebitTrendQuery = {
  view: CreditDebitTrendView;
  year: number;
  month: number | 'all';
};

const BASE_YEAR = 2023;

const DEBIT_STATUS_KEYWORDS = ['debit', 'debited'];
const PAID_STATUS_KEYWORDS = ['paid', 'credit', 'manual', 'completed', 'success'];

const toNum = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value != null && typeof value === 'object' && 'toString' in value) {
    const parsed = Number((value as { toString(): string }).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();

function classifyCreditDebitTrendBucket(statusRaw: unknown): 'credit' | 'debit' | null {
  const s = normalizeStatus(statusRaw);
  if (!s) return null;
  if (s === 'credit' || s === 'paid' || s === 'manual') return 'credit';
  if (s === 'debit' || s === 'failed') return 'debit';
  if (DEBIT_STATUS_KEYWORDS.some((k) => s.includes(k))) return 'debit';
  if (PAID_STATUS_KEYWORDS.some((k) => s.includes(k))) return 'credit';
  return null;
}

function paymentTxDate(
  payment: Pick<TrendPaymentRow, 'Date' | 'processedDate' | 'scheduledDate' | 'createdAt'>,
): Date | null {
  const candidates = [payment.Date, payment.processedDate, payment.scheduledDate, payment.createdAt];
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function formatDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekSunday(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

function endOfWeekSaturday(weekStart: Date): Date {
  const e = new Date(weekStart);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function parseTrendQuery(raw: Record<string, unknown>): CreditDebitTrendQuery | null {
  const viewRaw = String(raw.view ?? 'monthly').trim().toLowerCase();
  const view: CreditDebitTrendView =
    viewRaw === 'weekly' || viewRaw === 'monthlyinyear' || viewRaw === 'yearly'
      ? viewRaw === 'monthlyinyear'
        ? 'monthlyInYear'
        : (viewRaw as CreditDebitTrendView)
      : 'monthly';

  const year = Number(raw.year);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;

  const monthRaw = raw.month;
  let month: number | 'all' = 'all';
  if (monthRaw !== undefined && monthRaw !== null && String(monthRaw).trim().toLowerCase() !== 'all') {
    const m = Number(monthRaw);
    if (!Number.isFinite(m) || m < 0 || m > 11) return null;
    month = Math.floor(m);
  }

  return { view, year, month };
}

/** Inclusive calendar range for DB pre-filter (widened by one week for weekly buckets). */
function trendDateRange(query: CreditDebitTrendQuery): { start: Date; end: Date } {
  const { year, month, view } = query;
  if (view === 'yearly' && month === 'all') {
    return {
      start: new Date(year - 10, 0, 1),
      end: new Date(year + 1, 11, 31, 23, 59, 59, 999),
    };
  }
  if (month === 'all') {
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  if (view === 'weekly') {
    const padStart = new Date(monthStart);
    padStart.setDate(padStart.getDate() - 7);
    const padEnd = new Date(monthEnd);
    padEnd.setDate(padEnd.getDate() + 7);
    return { start: padStart, end: padEnd };
  }
  return { start: monthStart, end: monthEnd };
}

function buildTrendPaymentsWhere(
  fundedWhere: Prisma.ApplicationWhereInput,
  range: { start: Date; end: Date },
): Prisma.CollectionPaymentWhereInput {
  return {
    Application: fundedWhere,
    OR: [
      { Date: { gte: range.start, lte: range.end } },
      { processedDate: { gte: range.start, lte: range.end } },
      { scheduledDate: { gte: range.start, lte: range.end } },
    ],
  };
}

type TrendTx = {
  dealToken: string;
  bucket: 'credit' | 'debit';
  amount: number;
  txDate: Date;
  dayKey: string;
};

type TrendPaymentRow = {
  applicationId: string;
  dealId: string | null;
  amount: unknown;
  status: unknown;
  Date: Date | null;
  processedDate: Date | null;
  scheduledDate: Date | null;
  createdAt?: Date | null;
};

function resolveDealToken(
  payment: TrendPaymentRow,
  appDealId: string | null | undefined,
  rowIndex: number,
): string {
  const appDealToken = String(appDealId ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return (
    String(payment.dealId ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '') ||
    appDealToken ||
    `ROW-${payment.applicationId}-${rowIndex}`
  );
}

function collectTrendTransactions(
  payments: TrendPaymentRow[],
  dealIdByApplicationId: Map<string, string | null | undefined>,
  year: number,
  month: number | 'all',
  yearFilterMode: 'query-year' | 'all-years',
): TrendTx[] {
  const isAllMonthsMode = month === 'all';
  const trendTransactions: TrendTx[] = [];

  payments.forEach((payment, rowIndex) => {
    const appDealId = dealIdByApplicationId.get(payment.applicationId) ?? null;
    if (!paymentBelongsToApplicationDeal(payment, appDealId)) return;

    const bucket = classifyCreditDebitTrendBucket(payment.status);
    if (!bucket) return;

    const amount = Math.abs(toNum(payment.amount));
    if (!Number.isFinite(amount) || amount === 0) return;

    const txDate = paymentTxDate(payment);
    if (!txDate) return;

    if (yearFilterMode === 'query-year' && txDate.getFullYear() !== year) return;
    if (!isAllMonthsMode && txDate.getMonth() !== month) return;

    trendTransactions.push({
      dealToken: resolveDealToken(payment, appDealId, rowIndex),
      bucket,
      amount,
      txDate,
      dayKey: formatDayKey(txDate),
    });
  });

  return trendTransactions;
}

function aggregateTrendTransactions(
  trendTransactions: TrendTx[],
  year: number,
  month: number | 'all',
): Omit<CreditDebitTrendSeries, 'yearly'> & { yearlyAxisInflowTotals: Map<number, number>; yearlyAxisOutflowTotals: Map<number, number>; maxYear: number } {
  const now = new Date();
  const anchor = now;
  const currentYear = year;
  const currentMonth = month === 'all' ? anchor.getMonth() : month;

  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const monthlyInflowTotals = new Map<number, number>();
  const monthlyOutflowTotals = new Map<number, number>();
  const yearlyMonthInflowTotals = new Map<number, number>();
  const yearlyMonthOutflowTotals = new Map<number, number>();
  const yearlyAxisInflowTotals = new Map<number, number>();
  const yearlyAxisOutflowTotals = new Map<number, number>();
  let maxYear = Math.max(now.getFullYear(), currentYear);

  const weeklyWindows =
    month === 'all'
      ? (() => {
          const currentWeekStart = startOfWeekSunday(anchor);
          return Array.from({ length: 5 }, (_, index) => {
            const weekStart = new Date(currentWeekStart);
            weekStart.setDate(currentWeekStart.getDate() - (4 - index) * 7);
            const weekEnd = endOfWeekSaturday(weekStart);
            return { weekStart, weekEnd, inflowTotal: 0, outflowTotal: 0 };
          });
        })()
      : (() => {
          const monthStart = new Date(currentYear, currentMonth, 1);
          const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
          const firstWeekStart = startOfWeekSunday(monthStart);
          const windows: Array<{
            weekStart: Date;
            weekEnd: Date;
            inflowTotal: number;
            outflowTotal: number;
          }> = [];
          let cursor = new Date(firstWeekStart);
          while (cursor <= monthEnd) {
            const weekStart = new Date(cursor);
            const weekEnd = endOfWeekSaturday(weekStart);
            windows.push({ weekStart, weekEnd, inflowTotal: 0, outflowTotal: 0 });
            cursor.setDate(cursor.getDate() + 7);
          }
          return windows;
        })();

  const applyToTrend = (txDate: Date, creditDelta: number, debitDelta: number) => {
    maxYear = Math.max(maxYear, txDate.getFullYear());
    if (txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth) {
      const day = txDate.getDate();
      monthlyInflowTotals.set(day, (monthlyInflowTotals.get(day) ?? 0) + creditDelta);
      monthlyOutflowTotals.set(day, (monthlyOutflowTotals.get(day) ?? 0) + debitDelta);
    }
    if (txDate.getFullYear() === currentYear) {
      const monthIndex = txDate.getMonth();
      yearlyMonthInflowTotals.set(monthIndex, (yearlyMonthInflowTotals.get(monthIndex) ?? 0) + creditDelta);
      yearlyMonthOutflowTotals.set(monthIndex, (yearlyMonthOutflowTotals.get(monthIndex) ?? 0) + debitDelta);
    }
    const txYear = txDate.getFullYear();
    yearlyAxisInflowTotals.set(txYear, (yearlyAxisInflowTotals.get(txYear) ?? 0) + creditDelta);
    yearlyAxisOutflowTotals.set(txYear, (yearlyAxisOutflowTotals.get(txYear) ?? 0) + debitDelta);
    weeklyWindows.forEach((window) => {
      if (txDate >= window.weekStart && txDate <= window.weekEnd) {
        window.inflowTotal += creditDelta;
        window.outflowTotal += debitDelta;
      }
    });
  };

  const txByDeal = new Map<string, TrendTx[]>();
  trendTransactions.forEach((tx) => {
    const list = txByDeal.get(tx.dealToken) ?? [];
    list.push(tx);
    txByDeal.set(tx.dealToken, list);
  });

  txByDeal.forEach((dealTxs) => {
    const credits = dealTxs.filter((tx) => tx.bucket === 'credit');
    const debits = dealTxs.filter((tx) => tx.bucket === 'debit');
    const pairedCredits = new Array<boolean>(credits.length).fill(false);
    const pairedDebits = new Array<boolean>(debits.length).fill(false);

    credits.forEach((credit, creditIndex) => {
      let matchIndex = debits.findIndex(
        (debit, idx) => !pairedDebits[idx] && debit.dayKey === credit.dayKey,
      );
      if (matchIndex === -1) {
        matchIndex = debits.findIndex((_, idx) => !pairedDebits[idx]);
      }
      if (matchIndex >= 0) {
        pairedCredits[creditIndex] = true;
        pairedDebits[matchIndex] = true;
      }
    });

    credits.forEach((credit, idx) => {
      if (pairedCredits[idx]) return;
      applyToTrend(credit.txDate, credit.amount, 0);
    });
    debits.forEach((debit, idx) => {
      if (pairedDebits[idx]) return;
      applyToTrend(debit.txDate, 0, debit.amount);
    });
  });

  const monthly = Array.from({ length: daysInCurrentMonth }, (_, idx) => ({
    label: String(idx + 1),
    inflow: Number((monthlyInflowTotals.get(idx + 1) ?? 0).toFixed(2)),
    outflow: Number((monthlyOutflowTotals.get(idx + 1) ?? 0).toFixed(2)),
  }));

  const weekly = weeklyWindows.map((window) => ({
    label: `${window.weekStart.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })} - ${window.weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    inflow: Number(window.inflowTotal.toFixed(2)),
    outflow: Number(window.outflowTotal.toFixed(2)),
  }));

  const monthlyInYear = Array.from({ length: 12 }, (_, monthIndex) => ({
    label: new Date(currentYear, monthIndex, 1).toLocaleDateString('en-US', { month: 'short' }),
    inflow: Number((yearlyMonthInflowTotals.get(monthIndex) ?? 0).toFixed(2)),
    outflow: Number((yearlyMonthOutflowTotals.get(monthIndex) ?? 0).toFixed(2)),
  }));

  return {
    monthly,
    weekly,
    monthlyInYear,
    yearlyAxisInflowTotals,
    yearlyAxisOutflowTotals,
    maxYear,
  };
}

function buildCreditDebitTrendSeries(
  payments: TrendPaymentRow[],
  dealIdByApplicationId: Map<string, string | null | undefined>,
  year: number,
  month: number | 'all',
): CreditDebitTrendSeries & { maxYear: number } {
  const scopedTrendTx = collectTrendTransactions(
    payments,
    dealIdByApplicationId,
    year,
    month,
    'query-year',
  );
  const scoped = aggregateTrendTransactions(scopedTrendTx, year, month);

  const isAllMonthsMode = month === 'all';
  let yearly: MoneyFlowPointDto[];

  if (isAllMonthsMode) {
    const allYearsTrendTx = collectTrendTransactions(
      payments,
      dealIdByApplicationId,
      year,
      month,
      'all-years',
    );
    const allYears = aggregateTrendTransactions(allYearsTrendTx, year, month);
    const yearOptions = Array.from(
      { length: Math.max(1, allYears.maxYear - BASE_YEAR + 1) },
      (_, idx) => BASE_YEAR + idx,
    );
    yearly = yearOptions.map((y) => ({
      label: String(y),
      inflow: Number((allYears.yearlyAxisInflowTotals.get(y) ?? 0).toFixed(2)),
      outflow: Number((allYears.yearlyAxisOutflowTotals.get(y) ?? 0).toFixed(2)),
    }));
    return {
      monthly: scoped.monthly,
      weekly: scoped.weekly,
      monthlyInYear: scoped.monthlyInYear,
      yearly,
      maxYear: Math.max(scoped.maxYear, allYears.maxYear),
    };
  }

  yearly = scoped.monthlyInYear;
  return {
    monthly: scoped.monthly,
    weekly: scoped.weekly,
    monthlyInYear: scoped.monthlyInYear,
    yearly,
    maxYear: scoped.maxYear,
  };
}

export function aggregateCreditDebitTrendPortfolio(
  ctx: PortfolioDashboardContext,
  chartYear?: number,
  chartMonth?: number | 'all',
): CreditDebitTrendSeries {
  const year = Number.isFinite(Number(chartYear))
    ? Math.floor(Number(chartYear))
    : new Date().getFullYear();
  const month =
    chartMonth === undefined
      ? new Date().getMonth()
      : chartMonth === 'all'
        ? 'all'
        : Number.isFinite(Number(chartMonth))
          ? Math.floor(Number(chartMonth))
          : new Date().getMonth();

  const dealIdByApplicationId = new Map(
    ctx.disbursementApps.map((app) => [app.id, app.dealId]),
  );

  const { monthly, weekly, monthlyInYear, yearly } = buildCreditDebitTrendSeries(
    ctx.paymentsForDashboardCharts,
    dealIdByApplicationId,
    year,
    month,
  );

  return { monthly, weekly, monthlyInYear, yearly };
}

export function computeChartYearOptionsFromPortfolio(
  ctx: PortfolioDashboardContext,
  selectedYear?: number,
): number[] {
  const now = new Date();
  let maxYear = Math.max(now.getFullYear(), selectedYear ?? now.getFullYear());

  for (const payment of ctx.paymentsForDashboardCharts) {
    const txDate = paymentTxDate(payment);
    if (txDate) maxYear = Math.max(maxYear, txDate.getFullYear());
  }

  return Array.from(
    { length: Math.max(1, maxYear - BASE_YEAR + 1) },
    (_, idx) => BASE_YEAR + idx,
  );
}

export async function computeCreditDebitTrend(
  queryInput: Record<string, unknown>,
): Promise<{ points: MoneyFlowPointDto[]; yearOptions: number[] } | null> {
  const query = parseTrendQuery(queryInput);
  if (!query) return null;

  const organizationParam = String(queryInput.organization ?? '').trim();
  const fundedWhereRaw = buildApplicationStatsBucketWhere('funded');
  if (!fundedWhereRaw) return null;
  const fundedWhere = mergeApplicationWhereWithOrganization(fundedWhereRaw, organizationParam);

  const range = trendDateRange(query);
  const payments = await prisma.collectionPayment.findMany({
    where: buildTrendPaymentsWhere(fundedWhere, range),
    select: {
      id: true,
      applicationId: true,
      dealId: true,
      amount: true,
      status: true,
      Date: true,
      processedDate: true,
      scheduledDate: true,
      createdAt: true,
      notes: true,
      Application: { select: { dealId: true } },
    },
  });

  const dealIdByApplicationId = new Map<string, string | null | undefined>();
  payments.forEach((payment) => {
    if (!dealIdByApplicationId.has(payment.applicationId)) {
      dealIdByApplicationId.set(payment.applicationId, payment.Application?.dealId ?? null);
    }
  });

  const { monthly, weekly, monthlyInYear, yearly, maxYear } = buildCreditDebitTrendSeries(
    payments,
    dealIdByApplicationId,
    query.year,
    query.month,
  );

  const yearOptions = Array.from(
    { length: Math.max(1, maxYear - BASE_YEAR + 1) },
    (_, idx) => BASE_YEAR + idx,
  );

  const byView = { monthly, weekly, monthlyInYear, yearly };
  const points = byView[query.view === 'monthlyInYear' ? 'monthlyInYear' : query.view];

  return { points, yearOptions };
}

export { parseTrendQuery };
