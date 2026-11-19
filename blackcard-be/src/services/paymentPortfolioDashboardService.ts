import { CollectionPaymentStatus, type Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import {
  alreadyNetDealEconomics,
  balanceDueLikeTransactionsPage,
  feesForOfferDecision,
  filterCollectionPaymentsForApplicationDeal,
  getApprovedOfferAmountForDealBalance,
  getBalancesForApplicationIds,
  grossRepaidDealEconomicsFromPayments,
  paymentBelongsToApplicationDeal,
  repaidTowardPaybackExcludingSurplus,
  signedAbovePrincipalGap,
  sumTotalPaybackOfferTimesRateFromOfferDecisionRows,
} from './collectionPaymentFinancials';
import {
  buildApplicationStatsBucketWhere,
  buildFundedApplicationWhereForPaybackTotals,
} from './applicationStatsBucketWhere';
import { aggregateDebitPaymentSummary } from './collectionPaymentDebitSummary';
import { mergeApplicationWhereWithOrganization } from '../utils/deriveOrganizationFromDealId';

export type MoneyFlowPoint = { label: string; inflow: number; outflow: number };

export type PortfolioDashboardCards = {
  dueToday: number;
  dueNext7Days: number;
  totalDues: number;
  totalPayback: number;
  recovered: number;
  defaults: number;
  failedPayment: { totalAmount: number; count: number };
  totalDeals: number;
  activeDeals: number;
  collectionEfficiency: number;
  fundedTotal: number;
  netFundingTotal: number;
  abovePrincipalTotal: number;
  abovePrincipalPositiveSum: number;
  abovePrincipalNegativeSum: number;
  dealsWithPositiveGap: number;
  dealsWithNegativeGap: number;
  dealsWithZeroGap: number;
  zeroGapDeals: Array<{ dealId: string; gapAmount: number }>;
};

export type PortfolioDashboardPayload = {
  cards: PortfolioDashboardCards;
  moneyFlow: {
    monthly: MoneyFlowPoint[];
    weekly: MoneyFlowPoint[];
    yearly: MoneyFlowPoint[];
  };
};

export type PortfolioPaymentRow = {
  id: string;
  applicationId: string;
  dealId: string | null;
  amount: number | Prisma.Decimal;
  status: CollectionPaymentStatus;
  Date: Date | null;
  scheduledDate: Date | null;
  processedDate: Date | null;
  notes: string | null;
};

export type PortfolioFundedApp = {
  id: string;
  applicationId: number | null;
  updatedAt: Date;
  loanAmount: unknown;
  dealId: string | null;
  commissionAmount: unknown;
  termsOffers: Array<{
    approvedAmount: unknown;
    factorRate: unknown;
    paybackAmount: unknown;
    commissionAmount: unknown;
  }>;
  OfferDecision: {
    offer: unknown;
    decision: string | null;
    rate: unknown;
    fees: unknown;
    totalRemit: unknown;
    refinanceAmount: unknown;
  } | null;
};

export type PortfolioDashboardContext = {
  disbursementApps: PortfolioFundedApp[];
  paymentsForDashboardCharts: PortfolioPaymentRow[];
  appAmountById: Map<string, number>;
  dealFinancialByAppId: Map<
    string,
    {
      applicationId: string;
      paybackAmount: number;
      grossRepaidDealEconomics: number;
    }
  >;
};

const toNum = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value != null && typeof value === 'object' && 'toString' in value) {
    const parsed = Number((value as { toString(): string }).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseMoney = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = toNum(value);
  return Number.isFinite(n) ? n : null;
};

const RECOVERED_STATUSES = new Set<CollectionPaymentStatus>([CollectionPaymentStatus.PAID]);

const OPEN_DUE_STATUSES = new Set<CollectionPaymentStatus>([
  CollectionPaymentStatus.DUE_TODAY,
  CollectionPaymentStatus.UPCOMING,
  CollectionPaymentStatus.SCHEDULED,
]);

const EXCLUDED_FROM_TOTAL_DUES = new Set<CollectionPaymentStatus>([CollectionPaymentStatus.WAIVED]);

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Loads funded cohort apps + scoped collection payments once (shared by KPI cards and credit/debit trend). */
export async function loadPortfolioDashboardContext(
  organization?: string,
): Promise<PortfolioDashboardContext> {
  const fundedDashboardWhereRaw = buildApplicationStatsBucketWhere('funded');
  if (!fundedDashboardWhereRaw) {
    throw new Error('Dashboard funded scope unavailable');
  }
  const fundedDashboardWhere = mergeApplicationWhereWithOrganization(
    fundedDashboardWhereRaw,
    organization ?? '',
  );

  const disbursementApps = (await prisma.application.findMany({
    where: fundedDashboardWhere,
    select: {
      id: true,
      applicationId: true,
      updatedAt: true,
      loanAmount: true,
      dealId: true,
      commissionAmount: true,
      termsOffers: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          approvedAmount: true,
          factorRate: true,
          paybackAmount: true,
          commissionAmount: true,
        },
      },
      OfferDecision: {
        select: {
          offer: true,
          decision: true,
          rate: true,
          fees: true,
          totalRemit: true,
          refinanceAmount: true,
        },
      },
    },
  })) as PortfolioFundedApp[];

  const appIds = disbursementApps.map((app) => app.id);
  const payments =
    appIds.length > 0
      ? await prisma.collectionPayment.findMany({
          where: { applicationId: { in: appIds } },
          select: {
            id: true,
            applicationId: true,
            dealId: true,
            amount: true,
            status: true,
            Date: true,
            scheduledDate: true,
            processedDate: true,
            notes: true,
          },
        })
      : [];

  const dealIdByApplicationId = new Map(disbursementApps.map((a) => [a.id, a.dealId]));
  const paymentsForDashboardCharts = payments.filter((p) =>
    paymentBelongsToApplicationDeal(p, dealIdByApplicationId.get(p.applicationId)),
  ) as PortfolioPaymentRow[];

  const appAmountById = new Map<string, number>();
  for (const app of disbursementApps) {
    const loanAmount = toNum(app.loanAmount);
    const offerDecision =
      app.OfferDecision?.decision?.toLowerCase() === 'declined' ? 0 : toNum(app.OfferDecision?.offer);
    const chosen = loanAmount > 0 ? loanAmount : offerDecision || loanAmount || 0;
    appAmountById.set(app.id, chosen);
  }

  const dealFinancialRows =
    appIds.length > 0 ? await getBalancesForApplicationIds(prisma, appIds) : [];
  const dealFinancialByAppId = new Map(
    dealFinancialRows.map((r) => [
      r.applicationId,
      {
        applicationId: r.applicationId,
        paybackAmount: r.paybackAmount,
        grossRepaidDealEconomics: r.grossRepaidDealEconomics,
      },
    ]),
  );

  return {
    disbursementApps,
    paymentsForDashboardCharts,
    appAmountById,
    dealFinancialByAppId,
  };
}

export type PortfolioDashboardAggregateOptions = {
  /** When false, skips monthly/weekly/yearly chart aggregation (super-admin snapshot). */
  includeMoneyFlow?: boolean;
  /** When false, omits per-deal zero-gap list (saves memory on large portfolios). */
  includeZeroGapDeals?: boolean;
  /** When true, reuses funded cohort for total payback instead of a second DB query. */
  paybackFromFundedCohortOnly?: boolean;
};

export async function aggregatePaymentPortfolioDashboard(
  ctx: PortfolioDashboardContext,
  options?: PortfolioDashboardAggregateOptions,
): Promise<PortfolioDashboardPayload> {
  const includeMoneyFlow = options?.includeMoneyFlow !== false;
  const includeZeroGapDeals = options?.includeZeroGapDeals !== false;
  const paybackFromFundedCohortOnly = options?.paybackFromFundedCohortOnly === true;

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const next7End = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const { disbursementApps, paymentsForDashboardCharts, appAmountById, dealFinancialByAppId } =
    ctx;

  const totalPayback = paybackFromFundedCohortOnly
    ? sumTotalPaybackOfferTimesRateFromOfferDecisionRows(disbursementApps)
    : sumTotalPaybackOfferTimesRateFromOfferDecisionRows(
        await prisma.application.findMany({
          where: buildFundedApplicationWhereForPaybackTotals(),
          select: {
            id: true,
            dealId: true,
            OfferDecision: {
              select: {
                offer: true,
                decision: true,
                rate: true,
              },
            },
          },
        }),
      );

  const debitPaymentSummary = await aggregateDebitPaymentSummary();

  let dueToday = 0;
  let dueNext7Days = 0;
  let totalDues = 0;
  let recovered = 0;

  const paymentsByApplicationId = new Map<string, PortfolioPaymentRow[]>();
  for (const payment of paymentsForDashboardCharts) {
    const list = paymentsByApplicationId.get(payment.applicationId);
    if (list) list.push(payment);
    else paymentsByApplicationId.set(payment.applicationId, [payment]);
  }

  for (const payment of paymentsForDashboardCharts) {
    const amount = toNum(payment.amount);
    const date = payment.scheduledDate ? new Date(payment.scheduledDate) : null;
    const status = payment.status;

    if (status === CollectionPaymentStatus.DUE_TODAY) {
      dueToday += amount;
    } else if (
      OPEN_DUE_STATUSES.has(status) &&
      date &&
      date >= todayStart &&
      date <= todayEnd
    ) {
      dueToday += amount;
    }

    if (OPEN_DUE_STATUSES.has(status) && date && date > todayEnd && date <= next7End) {
      dueNext7Days += amount;
    }

    if (!EXCLUDED_FROM_TOTAL_DUES.has(status)) {
      totalDues += amount;
    }

    if (RECOVERED_STATUSES.has(status)) {
      recovered += amount;
    }
  }

  recovered = [...dealFinancialByAppId.values()].reduce(
    (sum, row) =>
      sum + repaidTowardPaybackExcludingSurplus(row.grossRepaidDealEconomics, row.paybackAmount),
    0,
  );
  totalDues = [...dealFinancialByAppId.values()].reduce(
    (sum, row) =>
      sum +
      Math.max(
        balanceDueLikeTransactionsPage(row.paybackAmount, row.grossRepaidDealEconomics),
        0,
      ),
    0,
  );
  const defaults = debitPaymentSummary.totalAmount;
  const failedPaymentDebitCount = debitPaymentSummary.totalCount;
  const failedPaymentDebitTotal = debitPaymentSummary.totalAmount;

  let fundedPortfolioTotal = 0;
  let netFundingPortfolioTotal = 0;
  let abovePrincipalPositiveSum = 0;
  let abovePrincipalNegativeMagSum = 0;
  let dealsWithPositiveGap = 0;
  let dealsWithNegativeGap = 0;
  let dealsWithZeroGap = 0;
  const zeroGapDealsPayload: Array<{ dealId: string; gapAmount: number }> = [];
  const GAP_CLASSIFY_EPS = 1e-6;

  for (const app of disbursementApps) {
    const rawPayments = paymentsByApplicationId.get(app.id) ?? [];
    const scopedPayments = filterCollectionPaymentsForApplicationDeal(
      rawPayments,
      app.dealId ?? null,
    );
    const advanceNum = Math.max(getApprovedOfferAmountForDealBalance(app), 0);
    const od = app.OfferDecision ?? null;
    const feesAmount = feesForOfferDecision(od);
    const refinanceAmount = toNum(od?.refinanceAmount);
    const latestTermsOffer = app.termsOffers?.[0];
    const commissionOnDeal =
      parseMoney(app.commissionAmount) ?? parseMoney(latestTermsOffer?.commissionAmount) ?? 0;

    const netFundingNum = Math.max(0, advanceNum - feesAmount - refinanceAmount);
    const alreadyNetNum = alreadyNetDealEconomics(advanceNum, feesAmount, commissionOnDeal);

    const bal = dealFinancialByAppId.get(app.id);
    const grossRepaid = bal
      ? bal.grossRepaidDealEconomics
      : grossRepaidDealEconomicsFromPayments(scopedPayments);
    const paybackAmt = bal?.paybackAmount ?? 0;
    const repaidCapped = repaidTowardPaybackExcludingSurplus(grossRepaid, paybackAmt);
    const gap = signedAbovePrincipalGap(repaidCapped, alreadyNetNum);
    if (gap > GAP_CLASSIFY_EPS) {
      abovePrincipalPositiveSum += gap;
      dealsWithPositiveGap += 1;
    } else if (gap < -GAP_CLASSIFY_EPS) {
      abovePrincipalNegativeMagSum += -gap;
      dealsWithNegativeGap += 1;
    } else {
      dealsWithZeroGap += 1;
      if (includeZeroGapDeals) {
        const dealLabel = String(app.dealId ?? '').trim();
        zeroGapDealsPayload.push({
          dealId: dealLabel.length > 0 ? dealLabel : String(app.applicationId),
          gapAmount: Number(gap.toFixed(2)),
        });
      }
    }

    fundedPortfolioTotal += advanceNum;
    netFundingPortfolioTotal += netFundingNum;
  }

  const abovePrincipalNet = abovePrincipalPositiveSum - abovePrincipalNegativeMagSum;
  const collectionEfficiency =
    totalDues > 0 ? Number(((recovered / totalDues) * 100).toFixed(1)) : 0;

  if (!includeMoneyFlow) {
    return {
      cards: {
        dueToday: Number(dueToday.toFixed(2)),
        dueNext7Days: Number(dueNext7Days.toFixed(2)),
        totalDues: Number(totalDues.toFixed(2)),
        totalPayback: Number(totalPayback.toFixed(2)),
        recovered: Number(recovered.toFixed(2)),
        defaults: Number(defaults.toFixed(2)),
        failedPayment: {
          totalAmount: Number(failedPaymentDebitTotal.toFixed(2)),
          count: failedPaymentDebitCount,
        },
        totalDeals: disbursementApps.length,
        activeDeals: disbursementApps.length,
        collectionEfficiency,
        fundedTotal: Number(fundedPortfolioTotal.toFixed(2)),
        netFundingTotal: Number(netFundingPortfolioTotal.toFixed(2)),
        abovePrincipalTotal: Number(abovePrincipalNet.toFixed(2)),
        abovePrincipalPositiveSum: Number(abovePrincipalPositiveSum.toFixed(2)),
        abovePrincipalNegativeSum: Number(abovePrincipalNegativeMagSum.toFixed(2)),
        dealsWithPositiveGap,
        dealsWithNegativeGap,
        dealsWithZeroGap,
        zeroGapDeals: zeroGapDealsPayload,
      },
      moneyFlow: { monthly: [], weekly: [], yearly: [] },
    };
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yearlyMap = new Map<string, { inflow: number; outflow: number }>();
  for (const month of monthNames) yearlyMap.set(month, { inflow: 0, outflow: 0 });

  for (const payment of paymentsForDashboardCharts) {
    const baseDate = payment.processedDate || payment.scheduledDate;
    if (!baseDate) continue;
    const d = new Date(baseDate);
    if (d.getFullYear() !== now.getFullYear()) continue;
    const month = monthNames[d.getMonth()];
    const bucket = yearlyMap.get(month)!;
    if (RECOVERED_STATUSES.has(payment.status)) bucket.inflow += toNum(payment.amount);
  }

  for (const app of disbursementApps) {
    const d = new Date(app.updatedAt);
    if (d < yearStart || d > now) continue;
    const month = monthNames[d.getMonth()];
    const bucket = yearlyMap.get(month)!;
    bucket.outflow += appAmountById.get(app.id) || 0;
  }

  const yearly = monthNames.map((label) => ({
    label,
    inflow: Number((yearlyMap.get(label)?.inflow || 0).toFixed(2)),
    outflow: Number((yearlyMap.get(label)?.outflow || 0).toFixed(2)),
  }));

  const currentMonth = now.getMonth();
  const daysInMonth = new Date(now.getFullYear(), currentMonth + 1, 0).getDate();
  const monthlyByDay = Array.from({ length: daysInMonth }, (_, i) => ({
    label: String(i + 1),
    inflow: 0,
    outflow: 0,
  }));

  for (const payment of paymentsForDashboardCharts) {
    const baseDate = payment.processedDate || payment.scheduledDate;
    if (!baseDate || !RECOVERED_STATUSES.has(payment.status)) continue;
    const d = new Date(baseDate);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === currentMonth) {
      const idx = d.getDate() - 1;
      if (monthlyByDay[idx]) monthlyByDay[idx].inflow += toNum(payment.amount);
    }
  }

  for (const app of disbursementApps) {
    const d = new Date(app.updatedAt);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === currentMonth) {
      const idx = d.getDate() - 1;
      if (monthlyByDay[idx]) monthlyByDay[idx].outflow += appAmountById.get(app.id) || 0;
    }
  }

  const NUM_WEEKLY_BUCKETS = 5;
  const startOfWeekSunday = (d: Date) => {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    s.setDate(s.getDate() - s.getDay());
    return s;
  };
  const formatWeekRangeLabel = (weekStart: Date, weekEnd: Date) => {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${weekStart.toLocaleDateString('en-US', opts)} - ${weekEnd.toLocaleDateString('en-US', opts)}`;
  };
  const thisWeekStart = startOfWeekSunday(now);
  const weekly: MoneyFlowPoint[] = [];
  const weekStarts: Date[] = [];
  for (let w = NUM_WEEKLY_BUCKETS - 1; w >= 0; w--) {
    const ws = new Date(thisWeekStart);
    ws.setDate(ws.getDate() - w * 7);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    weekStarts.push(ws);
    weekly.push({
      label: formatWeekRangeLabel(ws, we),
      inflow: 0,
      outflow: 0,
    });
  }
  const weekIndexForCalendarDate = (d: Date) => {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    for (let i = 0; i < NUM_WEEKLY_BUCKETS; i++) {
      const ws = weekStarts[i]!;
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      if (t >= ws && t <= we) return i;
    }
    return -1;
  };
  for (const payment of paymentsForDashboardCharts) {
    const baseDate = payment.processedDate || payment.scheduledDate;
    if (!baseDate || !RECOVERED_STATUSES.has(payment.status)) continue;
    const d = new Date(baseDate);
    const idx = weekIndexForCalendarDate(d);
    if (idx >= 0) weekly[idx]!.inflow += toNum(payment.amount);
  }
  for (const app of disbursementApps) {
    const d = new Date(app.updatedAt);
    const idx = weekIndexForCalendarDate(d);
    if (idx >= 0) weekly[idx]!.outflow += appAmountById.get(app.id) || 0;
  }

  const hasCollectionPaymentRecords = paymentsForDashboardCharts.length > 0;
  if (!hasCollectionPaymentRecords) {
    yearly.forEach((row) => {
      row.inflow = 0;
    });
    monthlyByDay.forEach((row) => {
      row.inflow = 0;
    });
    weekly.forEach((row) => {
      row.inflow = 0;
    });
  }

  return {
    cards: {
      dueToday: Number(dueToday.toFixed(2)),
      dueNext7Days: Number(dueNext7Days.toFixed(2)),
      totalDues: Number(totalDues.toFixed(2)),
      totalPayback: Number(totalPayback.toFixed(2)),
      recovered: Number(recovered.toFixed(2)),
      defaults: Number(defaults.toFixed(2)),
      failedPayment: {
        totalAmount: Number(failedPaymentDebitTotal.toFixed(2)),
        count: failedPaymentDebitCount,
      },
      totalDeals: disbursementApps.length,
      activeDeals: disbursementApps.length,
      collectionEfficiency,
      fundedTotal: Number(fundedPortfolioTotal.toFixed(2)),
      netFundingTotal: Number(netFundingPortfolioTotal.toFixed(2)),
      abovePrincipalTotal: Number(abovePrincipalNet.toFixed(2)),
      abovePrincipalPositiveSum: Number(abovePrincipalPositiveSum.toFixed(2)),
      abovePrincipalNegativeSum: Number(abovePrincipalNegativeMagSum.toFixed(2)),
      dealsWithPositiveGap,
      dealsWithNegativeGap,
      dealsWithZeroGap,
      zeroGapDeals: zeroGapDealsPayload,
    },
    moneyFlow: {
      monthly: monthlyByDay.map((row) => ({
        ...row,
        inflow: Number(row.inflow.toFixed(2)),
        outflow: Number(row.outflow.toFixed(2)),
      })),
      weekly: weekly.map((row) => ({
        ...row,
        inflow: Number(row.inflow.toFixed(2)),
        outflow: Number(row.outflow.toFixed(2)),
      })),
      yearly,
    },
  };
}
