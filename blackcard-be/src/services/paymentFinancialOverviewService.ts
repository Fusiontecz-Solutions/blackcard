import { DashboardCacheKind, withDashboardCache } from './dashboardCache';
import {
  aggregatePaymentPortfolioDashboard,
  loadPortfolioDashboardContext,
  type PortfolioDashboardPayload,
} from './paymentPortfolioDashboardService';
import {
  aggregateCreditDebitTrendPortfolio,
  computeChartYearOptionsFromPortfolio,
  type CreditDebitTrendSeries,
} from './paymentDashboardCreditDebitTrend';

export type PaymentFinancialOverviewSummaryPayload = PortfolioDashboardPayload & {
  creditDebitTrend: CreditDebitTrendSeries;
  chartYearOptions: number[];
};

function parseChartMonth(raw: number | 'all' | undefined): number | 'all' {
  if (raw === 'all') return 'all';
  if (raw !== undefined && Number.isFinite(Number(raw))) {
    const month = Math.floor(Number(raw));
    if (month >= 0 && month <= 11) return month;
  }
  return new Date().getMonth();
}

function portfolioCacheKey(year: number, month: number | 'all', organization?: string): string {
  const orgSuffix =
    organization?.trim() && organization.trim().toLowerCase() !== 'all'
      ? `:org:${organization.trim()}`
      : '';
  return `summary:${year}:${month === 'all' ? 'all' : month}${orgSuffix}`;
}

export async function buildPaymentFinancialOverviewSummary(
  chartYear?: number,
  chartMonth?: number | 'all',
  organization?: string,
): Promise<PaymentFinancialOverviewSummaryPayload> {
  const year = Number.isFinite(Number(chartYear))
    ? Math.floor(Number(chartYear))
    : new Date().getFullYear();
  const month = chartMonth === undefined ? new Date().getMonth() : parseChartMonth(chartMonth);
  const orgParam =
    organization?.trim() && organization.trim().toLowerCase() !== 'all'
      ? organization.trim()
      : undefined;

  return withDashboardCache(
    DashboardCacheKind.PAYMENT_OVERVIEW,
    portfolioCacheKey(year, month, orgParam),
    async () => {
      const ctx = await loadPortfolioDashboardContext(orgParam);
      const portfolio = await aggregatePaymentPortfolioDashboard(ctx);
      const creditDebitTrend = aggregateCreditDebitTrendPortfolio(ctx, year, month);
      const chartYearOptions = computeChartYearOptionsFromPortfolio(ctx, year);
      return { ...portfolio, creditDebitTrend, chartYearOptions };
    },
  );
}
