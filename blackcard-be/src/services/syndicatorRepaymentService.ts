import { CollectionPaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import { dealLabelForWalletDescription } from './applicationDealLabel';
import {
  buildRepaidRowsFromCollectionPayments,
  calendarDateKeyUTC,
  computeConsumedIncomingIndicesForDebitPairing,
  filterCollectionPaymentsForApplicationDeal,
  isIncomingForDebitPairingStatus,
  resolveTransactionDateKey,
} from './collectionPaymentFinancials';

export type PaymentLike = {
  id?: string;
  applicationId: string;
  amount: Prisma.Decimal | Prisma.DecimalJsLike | number | string;
  status?: string;
  scheduledDate?: Date | string | null;
  Date?: Date | string | null;
  notes?: string | null;
};

const toNumber = (
  value: Prisma.Decimal | Prisma.DecimalJsLike | number | string | null | undefined,
): number => {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function dateKeyForPaymentLike(p: PaymentLike): string | null {
  const raw = p.Date ?? p.scheduledDate ?? null;
  if (raw == null) return null;
  return calendarDateKeyUTC(raw instanceof Date ? raw : new Date(raw));
}

/**
 * Map each repaid-calculation row index to the index in the scoped `collectionPayment` array
 * (same iteration order as {@link buildRepaidRowsFromCollectionPayments}).
 */
function repaidIndexToScopedIndexMap(
  scoped: Array<{
    Date?: Date | null;
    scheduledDate?: Date | null;
    processedDate?: Date | null;
  }>,
): number[] {
  const map: number[] = [];
  for (let si = 0; si < scoped.length; si += 1) {
    const dk = resolveTransactionDateKey(scoped[si]);
    if (!dk) continue;
    map.push(si);
  }
  return map;
}

function findScopedIndexForBatchPayment<
  T extends {
    id: string;
    amount: Prisma.Decimal | number;
    status: CollectionPaymentStatus;
    Date?: Date | null;
    scheduledDate: Date;
    notes: string | null;
  },
>(
  p: PaymentLike,
  scoped: T[],
  usedScopedIndices: Set<number>,
): number {
  if (p.id) {
    const byId = scoped.findIndex((row, idx) => row.id === p.id && !usedScopedIndices.has(idx));
    if (byId >= 0) return byId;
  }
  const wantAmount = toNumber(p.amount);
  const wantStatus = String(p.status ?? '').toUpperCase();
  const wantNotes = String(p.notes ?? '').trim();
  const wantDateKey = dateKeyForPaymentLike(p);

  for (let i = 0; i < scoped.length; i += 1) {
    if (usedScopedIndices.has(i)) continue;
    const row = scoped[i];
    if (String(row.status).toUpperCase() !== wantStatus) continue;
    if (Math.abs(toNumber(row.amount) - wantAmount) > 0.015) continue;
    const rowDateKey = resolveTransactionDateKey(row);
    if (wantDateKey != null && rowDateKey != null && wantDateKey !== rowDateKey) continue;
    if (wantDateKey != null && rowDateKey == null) continue;
    if (String(row.notes ?? '').trim() !== wantNotes) continue;
    return i;
  }
  return -1;
}

export async function distributeSyndicatorCreditsForPayments(
  prismaLike: PrismaClient | Prisma.TransactionClient,
  payments: PaymentLike[],
): Promise<void> {
  if (!payments.length) return;

  const byApplicationId = new Map<string, PaymentLike[]>();
  for (const p of payments) {
    const id = String(p.applicationId ?? '').trim();
    if (!id) continue;
    const list = byApplicationId.get(id) ?? [];
    list.push(p);
    byApplicationId.set(id, list);
  }

  for (const [applicationId, batch] of byApplicationId) {
    const app = await prismaLike.application.findUnique({
      where: { id: applicationId },
      select: { dealId: true },
    });
    const dealId = app?.dealId ?? null;

    const allPayments = await prismaLike.collectionPayment.findMany({
      where: { applicationId },
      orderBy: [{ paymentNumber: 'asc' }, { scheduledDate: 'asc' }, { createdAt: 'asc' }],
    });
    const scoped = filterCollectionPaymentsForApplicationDeal(allPayments, dealId);
    const repaidRows = buildRepaidRowsFromCollectionPayments(scoped, dealId, applicationId);
    const repaidToScoped = repaidIndexToScopedIndexMap(scoped);
    if (repaidRows.length !== repaidToScoped.length) {
      console.warn('Syndicator distribution: repaid row count mismatch; skipping application', applicationId);
      continue;
    }

    const consumedRepaidIndices = computeConsumedIncomingIndicesForDebitPairing(repaidRows);
    const consumedScopedIndices = new Set<number>();
    for (const repIdx of consumedRepaidIndices) {
      const si = repaidToScoped[repIdx];
      if (si !== undefined) consumedScopedIndices.add(si);
    }

    const syndications = await prismaLike.applicationSyndicatorDetails.findMany({
      where: { applicationId },
      orderBy: { id: 'asc' },
    });

    const usedScopedIndices = new Set<number>();
    for (const p of batch) {
      const scopedIdx = findScopedIndexForBatchPayment(p, scoped, usedScopedIndices);
      if (scopedIdx < 0) continue;
      usedScopedIndices.add(scopedIdx);
      if (consumedScopedIndices.has(scopedIdx)) continue;

      const row = scoped[scopedIdx];
      if (!isIncomingForDebitPairingStatus(row.status, toNumber(row.amount))) continue;

      const paymentAmount = toNumber(row.amount);
      if (paymentAmount <= 0) continue;

      if (!syndications.length) continue;

      const txDateRaw = row.scheduledDate ?? row.Date ?? new Date();
      const txDate = txDateRaw instanceof Date ? txDateRaw : new Date(txDateRaw);

      const dealLabel = await dealLabelForWalletDescription(prismaLike, applicationId);
      const walletPaymentType = String(row.status).toUpperCase();

      for (const detail of syndications) {
        const percentage = toNumber(detail.percentageSyndicated);
        if (percentage <= 0) continue;

        const allocation = Number(((paymentAmount * percentage) / 100).toFixed(2));
        if (allocation <= 0) continue;

        const syndicator = await prismaLike.syndicator.findUnique({
          where: { id: detail.syndicatorId },
          select: { id: true, currentBalance: true },
        });
        if (!syndicator) continue;

        const prevBalance = toNumber(syndicator.currentBalance);
        const newBalance = prevBalance + allocation;
        const currentCollected = toNumber(detail.collectedAmount);
        const currentRemaining = toNumber(detail.remainingAmount);
        const nextCollected = currentCollected + allocation;
        const nextRemaining = Math.max(currentRemaining - allocation, 0);

        await prismaLike.syndicatorWalletTransaction.create({
          data: {
            syndicatorId: detail.syndicatorId,
            amount: allocation,
            prevBalance,
            description: `Repayment allocation for deal ${dealLabel}`,
            merchantName: detail.merchantName ?? undefined,
            applicationId,
            date: txDate,
            paymentType: walletPaymentType,
          },
        });

        await prismaLike.syndicator.update({
          where: { id: detail.syndicatorId },
          data: { currentBalance: newBalance },
        });

        await prismaLike.applicationSyndicatorDetails.update({
          where: { id: detail.id },
          data: {
            collectedAmount: nextCollected,
            remainingAmount: nextRemaining,
          },
        });
      }
    }
  }
}
