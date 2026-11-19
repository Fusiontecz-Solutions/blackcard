import { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import { computeCommissionPortalStats } from './commissionPortalStatsService';
import { computePlatformDealCounts } from './dealCountsService';
import {
  aggregatePaymentPortfolioDashboard,
  loadPortfolioDashboardContext,
} from './paymentPortfolioDashboardService';

export const SUPER_ADMIN_PLATFORM_ROW_ID = 'platform';

let refreshInProgress = false;

const toDecimal = (value: number): Prisma.Decimal =>
  new Prisma.Decimal(Number.isFinite(value) ? value.toFixed(2) : '0');

export type SuperAdminPlatformSnapshot = {
  id: string;
  clientCount: number;
  isoCount: number;
  deals: {
    total: number;
    funded: number;
  };
  /** @deprecated Use deals.funded */
  dealCount: number;
  totalDealsCount: number;
  fundedDealsCount: number;
  commissionPortalDealCount: number;
  /** @deprecated Use commissionPortalDealCount */
  commissionDealsFunded: number;
  totalCommission: number;
  commission: {
    paid: number;
    pending: number;
    processing: number;
    approved: number;
    clawback: number;
    totalFundedVolume: number;
    portalDealCount: number;
    /** @deprecated Use portalDealCount */
    dealsFunded: number;
  };
  paymentCards: {
    fundedTotal: number;
    netFundingTotal: number;
    abovePrincipalTotal: number;
    recovered: number;
    failedPayment: { totalAmount: number; count: number };
    dueToday: number;
    dueNext7Days: number;
    totalDues: number;
    totalPayback: number;
    collectionEfficiency: number;
    totalDeals: number;
    activeDeals: number;
  };
  lastRefreshedAt: string;
  updatedAt: string;
};

function mapRowToSnapshot(row: {
  id: string;
  clientCount: number;
  isoCount: number;
  totalDealsCount: number;
  fundedDealsCount: number;
  dealCount: number;
  commissionPortalDealCount: number;
  commissionDealsFunded: number;
  totalCommission: Prisma.Decimal;
  commissionPaid: Prisma.Decimal;
  commissionPending: Prisma.Decimal;
  commissionProcessing: Prisma.Decimal;
  commissionApproved: Prisma.Decimal;
  commissionClawback: Prisma.Decimal;
  totalFundedVolume: Prisma.Decimal;
  fundedTotal: Prisma.Decimal;
  netFundingTotal: Prisma.Decimal;
  abovePrincipalTotal: Prisma.Decimal;
  recoveredAmount: Prisma.Decimal;
  failedPaymentAmount: Prisma.Decimal;
  failedPaymentCount: number;
  dueToday: Prisma.Decimal;
  dueNext7Days: Prisma.Decimal;
  totalDues: Prisma.Decimal;
  totalPayback: Prisma.Decimal;
  collectionEfficiency: number;
  lastRefreshedAt: Date;
  updatedAt: Date;
}): SuperAdminPlatformSnapshot {
  const num = (d: Prisma.Decimal) => Number(d.toString());
  const fundedDealsCount = row.fundedDealsCount || row.dealCount;
  const totalDealsCount = row.totalDealsCount || 0;
  const commissionPortalDealCount =
    row.commissionPortalDealCount || row.commissionDealsFunded;

  return {
    id: row.id,
    clientCount: row.clientCount,
    isoCount: row.isoCount,
    deals: {
      total: totalDealsCount,
      funded: fundedDealsCount,
    },
    totalDealsCount,
    fundedDealsCount,
    dealCount: fundedDealsCount,
    commissionPortalDealCount,
    commissionDealsFunded: commissionPortalDealCount,
    totalCommission: num(row.totalCommission),
    commission: {
      paid: num(row.commissionPaid),
      pending: num(row.commissionPending),
      processing: num(row.commissionProcessing),
      approved: num(row.commissionApproved),
      clawback: num(row.commissionClawback),
      totalFundedVolume: num(row.totalFundedVolume),
      portalDealCount: commissionPortalDealCount,
      dealsFunded: commissionPortalDealCount,
    },
    paymentCards: {
      fundedTotal: num(row.fundedTotal),
      netFundingTotal: num(row.netFundingTotal),
      abovePrincipalTotal: num(row.abovePrincipalTotal),
      recovered: num(row.recoveredAmount),
      failedPayment: {
        totalAmount: num(row.failedPaymentAmount),
        count: row.failedPaymentCount,
      },
      dueToday: num(row.dueToday),
      dueNext7Days: num(row.dueNext7Days),
      totalDues: num(row.totalDues),
      totalPayback: num(row.totalPayback),
      collectionEfficiency: row.collectionEfficiency,
      totalDeals: fundedDealsCount,
      activeDeals: fundedDealsCount,
    },
    lastRefreshedAt: row.lastRefreshedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Recomputes KPIs from live data and upserts the singleton `superAdminPlateform` row. */
export async function refreshSuperAdminPlatformSnapshot(): Promise<SuperAdminPlatformSnapshot> {
  if (refreshInProgress) {
    const existing = await prisma.superAdminPlateform.findUnique({
      where: { id: SUPER_ADMIN_PLATFORM_ROW_ID },
    });
    if (existing) return mapRowToSnapshot(existing);
  }

  refreshInProgress = true;
  try {
    const [clientCount, isoCount, portfolioCtx, commissionStats, dealCounts] = await Promise.all([
      prisma.client.count(),
      prisma.iso.count(),
      loadPortfolioDashboardContext(),
      computeCommissionPortalStats(),
      computePlatformDealCounts(),
    ]);

    const portfolio = await aggregatePaymentPortfolioDashboard(portfolioCtx, {
      includeMoneyFlow: false,
      includeZeroGapDeals: false,
      paybackFromFundedCohortOnly: true,
    });
    const cards = portfolio.cards;
    const now = new Date();

    const fundedDealsCount =
      dealCounts.fundedDealsCount > 0 ? dealCounts.fundedDealsCount : cards.totalDeals;

    const data = {
      clientCount,
      isoCount,
      totalDealsCount: dealCounts.totalDealsCount,
      fundedDealsCount,
      dealCount: fundedDealsCount,
      commissionPortalDealCount: commissionStats.portalDealCount,
      commissionDealsFunded: commissionStats.portalDealCount,
      totalCommission: toDecimal(commissionStats.commissionTotal),
      commissionPaid: toDecimal(commissionStats.paid),
      commissionPending: toDecimal(commissionStats.pendingCommission),
      commissionProcessing: toDecimal(commissionStats.processing),
      commissionApproved: toDecimal(commissionStats.approved),
      commissionClawback: toDecimal(commissionStats.clawback),
      totalFundedVolume: toDecimal(commissionStats.totalFunded),
      fundedTotal: toDecimal(cards.fundedTotal ?? 0),
      netFundingTotal: toDecimal(cards.netFundingTotal ?? 0),
      abovePrincipalTotal: toDecimal(cards.abovePrincipalTotal ?? 0),
      recoveredAmount: toDecimal(cards.recovered),
      failedPaymentAmount: toDecimal(cards.failedPayment?.totalAmount ?? cards.defaults ?? 0),
      failedPaymentCount: cards.failedPayment?.count ?? 0,
      dueToday: toDecimal(cards.dueToday),
      dueNext7Days: toDecimal(cards.dueNext7Days),
      totalDues: toDecimal(cards.totalDues),
      totalPayback: toDecimal(cards.totalPayback),
      collectionEfficiency: cards.collectionEfficiency,
      lastRefreshedAt: now,
    };

    const row = await prisma.superAdminPlateform.upsert({
      where: { id: SUPER_ADMIN_PLATFORM_ROW_ID },
      create: { id: SUPER_ADMIN_PLATFORM_ROW_ID, ...data },
      update: data,
    });

    return mapRowToSnapshot(row);
  } finally {
    refreshInProgress = false;
  }
}

export async function getSuperAdminPlatformSnapshot(options?: {
  refreshIfMissing?: boolean;
}): Promise<SuperAdminPlatformSnapshot | null> {
  const row = await prisma.superAdminPlateform.findUnique({
    where: { id: SUPER_ADMIN_PLATFORM_ROW_ID },
  });

  if (!row) {
    if (options?.refreshIfMissing) {
      return refreshSuperAdminPlatformSnapshot();
    }
    return null;
  }

  return mapRowToSnapshot(row);
}
