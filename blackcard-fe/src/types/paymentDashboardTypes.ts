export type MoneyFlowPoint = {
  label: string;
  inflow: number;
  outflow: number;
};

/** Per-deal signed “above principal” gap when bucketed as exact (|gap| ≤ ε). */
export type ZeroGapDealRow = {
  dealId: string;
  gapAmount: number;
};

/**
 * Failed Payment KPI summary — sum of |amount| + transaction count
 * across CollectionPayment rows with `status = DEBIT`.
 */
export type FailedPaymentDebitSummary = {
  totalAmount: number;
  count: number;
};

export type PaymentDashboardCards = {
  dueToday: number;
  dueNext7Days: number;
  /** Sum of per-deal payback targets across the funded cohort (same source as `/collection-payments/balances`). */
  totalPayback: number;
  totalDues: number;
  recovered: number;
  defaults: number;
  /** Failed Payment KPI based on CollectionPayment rows with status = DEBIT (sum + count). */
  failedPayment?: FailedPaymentDebitSummary;
  totalDeals: number;
  activeDeals: number;
  collectionEfficiency: number;
  fundedTotal?: number;
  netFundingTotal?: number;
  /** Portfolio net Above Principal = Σ(positive gaps) − Σ(|negative gaps|). */
  abovePrincipalTotal?: number;
  abovePrincipalPositiveSum?: number;
  abovePrincipalNegativeSum?: number;
  dealsWithPositiveGap?: number;
  dealsWithNegativeGap?: number;
  dealsWithZeroGap?: number;
  /** Deal IDs and signed gap amounts for exact / zero-gap bucket (same ε as counts). */
  zeroGapDeals?: ZeroGapDealRow[];
};

export type PaymentDashboardData = {
  cards: PaymentDashboardCards;
  moneyFlow: {
    monthly: MoneyFlowPoint[];
    weekly: MoneyFlowPoint[];
    yearly: MoneyFlowPoint[];
  };
  creditDebitTrend?: {
    monthly: MoneyFlowPoint[];
    weekly: MoneyFlowPoint[];
    monthlyInYear: MoneyFlowPoint[];
    yearly: MoneyFlowPoint[];
  };
  chartYearOptions?: number[];
};
