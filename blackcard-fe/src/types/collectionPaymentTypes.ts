import type { PaymentStatus } from '@/pages/payment/paymentScheduleTypes';

export type CollectionPayment = {
  id: string;
  paymentNumber: number | null;
  applicationId: string;
  /** Populated from DB / uploads; use to scope rows to the open application’s deal. */
  dealId?: string | null;
  scheduledDate: string;
  processedDate?: string | null;
  amount: number;
  status: PaymentStatus;
  referenceNumber?: string | null;
  externalOrderId?: string | null;
  source?: 'SYSTEM' | 'MANUAL';
  notes?: string | null;
  createdById?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

/** Precomputed deal economics + repayment metrics from GET /collection-payments?includeDealView=true */
export type DealCollectionsView = {
  calculatedAt: string;
  viewApplicationId: string;
  offerDecision: 'approved' | 'declined' | null;
  offerSummary: {
    advanceNum: number;
    paybackNum: number;
    netFundingNum: number;
    feesAmount: number;
    commissionOnDeal: number;
    alreadyNetNum: number;
    refinanceAmount: number | null;
    factorRate: number | null;
    frequency: string;
    frequencyLabel: string;
    paymentAmount: number | null;
  };
  repayment: {
    pendingAmount: number;
    paidAmount: number;
    failedAmount: number;
    debitedAmount: number;
    netFunding: number;
    repaidTowardPayback: number;
    balance: number;
    paidPct: number | null;
    overPaid: number;
    abovePrincipal: number;
    alreadyNet: number;
    payback: number;
    advance: number;
    creditCount: number;
    failedTxnCount: number;
    debitTxnCount: number;
    dueTodayAmount: number;
  };
  schedule: {
    advanceAmount: number;
    factor: number;
    paybackAmount: number;
    dailyPayment: number;
    startDate: string;
  };
};

export type GetCollectionPaymentsParams = {
  applicationId: string;
  dealId?: string;
  force?: boolean;
  /** Server computes deal economics + repayment metrics (single source of truth). */
  includeDealView?: boolean;
};

export type CreateCollectionPaymentPayload = {
  applicationId: string;
  amount: number;
  date: string;
  status: PaymentStatus;
  note?: string;
  referenceNumber?: string;
};

export type UpdateCollectionPaymentPayload = {
  amount?: number;
  date?: string;
  status?: PaymentStatus;
  note?: string;
  referenceNumber?: string;
};

/** PATCH /collection-payments/deal-economics — fees / commission for the Transactions tab cards. */
export type UpdateDealEconomicsPayload = {
  applicationId?: string;
  dealId?: string;
  feesAmount?: number;
  commissionOnDeal?: number;
};

export type UpdateDealEconomicsResponse = {
  applicationId: string;
  applicationDisplayId: number | null;
  dealId: string | null;
  feesAmount: number;
  commissionOnDeal: number;
};
