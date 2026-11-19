import { CollectionPaymentStatus, type CollectionPayment, type SchedulePaymentTracking } from '@prisma/client';

import {
  collectionAmountMatchKey,
  filterCollectionPaymentsForScheduleMatch,
  installmentMatchDateKey,
  normalizeDealIdTokenForPayments,
  resolveScheduleDayCollectionStatus,
  selectCollectionRowsForScheduleInstallment,
} from './collectionPaymentFinancials';

export type ScheduleTrackingDisplayStatus = 'clear' | 'bounced' | 'upcoming';

export type SchedulePaymentTrackingApiRow = {
  id: string;
  applicationId: string;
  dealId: string | null;
  batchId: string;
  paymentNumber: number;
  scheduledDate: string;
  amount: number;
  label: string | null;
  paymentStartDate: string | null;
  effectiveStartDate: string | null;
  status: string;
  confirmedById: string | null;
  createdAt: string;
  updatedAt: string;
  trackingStatus: ScheduleTrackingDisplayStatus;
};

export type ScheduleTrackingSummaryStat = { count: number; sum: number };

export type ScheduleTrackingSummary = Record<
  'all' | ScheduleTrackingDisplayStatus,
  ScheduleTrackingSummaryStat
>;

type CollectionPaymentForMatch = Pick<
  CollectionPayment,
  | 'id'
  | 'amount'
  | 'status'
  | 'scheduledDate'
  | 'processedDate'
  | 'Date'
  | 'returnDate'
  | 'dealId'
  | 'notes'
  | 'createdAt'
>;

function scheduleInstallmentDateKey(row: SchedulePaymentTracking): string | null {
  return installmentMatchDateKey(row.scheduledDate);
}

function scheduleInstallmentAmountKey(row: SchedulePaymentTracking): string {
  return collectionAmountMatchKey(row.amount);
}

export function filterScheduleRowsByDealId(
  rows: SchedulePaymentTracking[],
  dealId?: string | null,
): SchedulePaymentTracking[] {
  const token = normalizeDealIdTokenForPayments(dealId);
  if (!token) return rows;
  return rows.filter((row) => {
    const rowToken = normalizeDealIdTokenForPayments(row.dealId);
    if (!rowToken) return true;
    return rowToken === token;
  });
}

/**
 * Match each planned installment to collection activity on that calendar day:
 * - Same deal scope as Collections → Transactions
 * - Exact |amount| (2 dp)
 * - Installment date matches the row’s display date or any populated date column
 * - Debit + incoming pairs on overlapping column dates → **Bounced** (same as Failed tab)
 * - Unpaired PAID/CREDIT on that day → **Clear**
 */
export function resolveScheduleTrackingStatuses(
  scheduleRows: SchedulePaymentTracking[],
  rawCollectionPayments: CollectionPaymentForMatch[],
  applicationDealId: string | null | undefined,
): ScheduleTrackingDisplayStatus[] {
  const scoped = filterCollectionPaymentsForScheduleMatch(
    rawCollectionPayments,
    applicationDealId,
  );
  const usedCollectionIds = new Set<string>();

  return scheduleRows.map((schedule) => {
    const installmentDate = scheduleInstallmentDateKey(schedule);
    if (!installmentDate) return 'upcoming';

    const amountKey = scheduleInstallmentAmountKey(schedule);

    const dayRows = selectCollectionRowsForScheduleInstallment(
      scoped,
      installmentDate,
      amountKey,
      usedCollectionIds,
    );

    const dayStatus = resolveScheduleDayCollectionStatus(dayRows);
    if (!dayStatus) return 'upcoming';

    for (const row of dayRows) {
      usedCollectionIds.add(row.id);
    }

    return dayStatus;
  });
}

export function buildScheduleTrackingSummary(
  payments: Array<{ amount: number; trackingStatus: ScheduleTrackingDisplayStatus }>,
): ScheduleTrackingSummary {
  const summary: ScheduleTrackingSummary = {
    all: { count: 0, sum: 0 },
    upcoming: { count: 0, sum: 0 },
    clear: { count: 0, sum: 0 },
    bounced: { count: 0, sum: 0 },
  };

  for (const row of payments) {
    const amt = Number(row.amount);
    summary.all.count += 1;
    summary.all.sum += amt;
    summary[row.trackingStatus].count += 1;
    summary[row.trackingStatus].sum += amt;
  }

  return {
    all: { count: summary.all.count, sum: Number(summary.all.sum.toFixed(2)) },
    upcoming: { count: summary.upcoming.count, sum: Number(summary.upcoming.sum.toFixed(2)) },
    clear: { count: summary.clear.count, sum: Number(summary.clear.sum.toFixed(2)) },
    bounced: { count: summary.bounced.count, sum: Number(summary.bounced.sum.toFixed(2)) },
  };
}

export function mapSchedulePaymentToApiWithTracking(
  row: SchedulePaymentTracking,
  trackingStatus: ScheduleTrackingDisplayStatus,
): SchedulePaymentTrackingApiRow {
  return {
    id: row.id,
    applicationId: row.applicationId,
    dealId: row.dealId,
    batchId: row.batchId,
    paymentNumber: row.paymentNumber,
    scheduledDate: installmentMatchDateKey(row.scheduledDate) ?? row.scheduledDate.toISOString().slice(0, 10),
    amount: Number(row.amount),
    label: row.label,
    paymentStartDate: row.paymentStartDate
      ? installmentMatchDateKey(row.paymentStartDate)
      : null,
    effectiveStartDate: row.effectiveStartDate
      ? installmentMatchDateKey(row.effectiveStartDate)
      : null,
    status: row.status.toLowerCase(),
    confirmedById: row.confirmedById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    trackingStatus,
  };
}
