import { CollectionPaymentStatus } from '@prisma/client';
import prisma from '../config/prismaClient';
import {
  alreadyNetDealEconomics,
  balanceDueLikeTransactionsPage,
  feesForOfferDecision,
  getApprovedOfferAmountForDealBalance,
  getBalancesForApplicationIds,
  paymentBelongsToApplicationDeal,
  repaidTowardPaybackExcludingSurplus,
  signedAbovePrincipalGap,
  sumTotalPaybackOfferTimesRateFromOfferDecisionRows,
} from './collectionPaymentFinancials';
import {
  buildApplicationStatsBucketWhere,
  buildFundedApplicationWhereForPaybackTotals,
} from './applicationStatsBucketWhere';

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

const OPEN_DUE_STATUSES = new Set<CollectionPaymentStatus>([
  CollectionPaymentStatus.DUE_TODAY,
  CollectionPaymentStatus.UPCOMING,
  CollectionPaymentStatus.SCHEDULED,
]);

export type PaymentDashboardPortfolioPayload = {
  cards: Record<string, unknown>;
  moneyFlow: {
    monthly: unknown[];
    weekly: unknown[];
    yearly: unknown[];
  };
};

/** KPI cards + money-flow shell for Payment History dashboard (no chart series). */
export async function buildPaymentDashboardPortfolioPayload(): Promise<PaymentDashboardPortfolioPayload> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const next7End = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));

  const fundedDashboardWhere = buildApplicationStatsBucketWhere('funded');
  if (!fundedDashboardWhere) {
    throw new Error('Dashboard funded scope unavailable');
  }

  const disbursementApps = await prisma.application.findMany({
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
  });

  const appsForPaybackPortfolioTotal = await prisma.application.findMany({
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
  });
  const totalPayback = sumTotalPaybackOfferTimesRateFromOfferDecisionRows(appsForPaybackPortfolioTotal);

  const appIds = disbursementApps.map((app) => app.id);
  const debitDefaultsAggregate = await prisma.collectionPayment.aggregate({
    where: { status: CollectionPaymentStatus.DEBIT },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const duesPayments = appIds.length
    ? await prisma.collectionPayment.findMany({
        where: {
          applicationId: { in: appIds },
          OR: [
            { status: CollectionPaymentStatus.DUE_TODAY },
            { status: { in: Array.from(OPEN_DUE_STATUSES) } },
          ],
        },
        select: {
          id: true,
          applicationId: true,
          dealId: true,
          amount: true,
          status: true,
          scheduledDate: true,
        },
      })
    : [];

  const dealIdByApplicationIdDashboard = new Map(
    disbursementApps.map((a) => [a.id, a.dealId]),
  );
  const paymentsForDueCards = duesPayments.filter((p) =>
    paymentBelongsToApplicationDeal(p, dealIdByApplicationIdDashboard.get(p.applicationId)),
  );

  let dueToday = 0;
  let dueNext7Days = 0;
  let totalDues = 0;
  let recovered = 0;

  for (const payment of paymentsForDueCards) {
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
  }

  const dealFinancialRows =
    appIds.length > 0 ? await getBalancesForApplicationIds(prisma, appIds) : [];
  const dealFinancialByAppId = new Map(dealFinancialRows.map((r) => [r.applicationId, r]));

  recovered = dealFinancialRows.reduce(
    (sum, row) =>
      sum + repaidTowardPaybackExcludingSurplus(row.grossRepaidDealEconomics, row.paybackAmount),
    0,
  );
  totalDues = dealFinancialRows.reduce(
    (sum, row) =>
      sum +
      Math.max(balanceDueLikeTransactionsPage(row.paybackAmount, row.grossRepaidDealEconomics), 0),
    0,
  );

  const defaults = Math.abs(toNum(debitDefaultsAggregate._sum.amount));
  const failedPaymentDebitCount = Number(debitDefaultsAggregate._count?._all ?? 0) || 0;
  const failedPaymentDebitTotal = defaults;

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
    const grossRepaid = bal?.grossRepaidDealEconomics ?? 0;
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
      const dealLabel = String(app.dealId ?? '').trim();
      zeroGapDealsPayload.push({
        dealId: dealLabel.length > 0 ? dealLabel : String(app.applicationId),
        gapAmount: Number(gap.toFixed(2)),
      });
    }

    fundedPortfolioTotal += advanceNum;
    netFundingPortfolioTotal += netFundingNum;
  }

  const abovePrincipalNet = abovePrincipalPositiveSum - abovePrincipalNegativeMagSum;
  const collectionEfficiency = totalDues > 0 ? Number(((recovered / totalDues) * 100).toFixed(1)) : 0;

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
      monthly: [],
      weekly: [],
      yearly: [],
    },
  };
}
