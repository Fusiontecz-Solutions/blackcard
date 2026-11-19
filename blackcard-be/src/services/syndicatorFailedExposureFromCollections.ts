import { CollectionPaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  buildRepaidRowsFromCollectionPayments,
  computeDebitIncomingPairing,
  filterCollectionPaymentsForApplicationDeal,
  resolveTransactionDateKey,
} from './collectionPaymentFinancials';

function amt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Same iteration order as {@link buildRepaidRowsFromCollectionPayments} → scoped row index. */
function repaidIndexToScopedIndexMap(
  scoped: Array<{
    Date?: Date | null;
    scheduledDate?: Date | null;
    processedDate?: Date | null;
  }>,
): number[] {
  const map: number[] = [];
  for (let si = 0; si < scoped.length; si += 1) {
    if (!resolveTransactionDateKey(scoped[si])) continue;
    map.push(si);
  }
  return map;
}

/**
 * Per-deal scoped payments: sum of explicit `FAILED` collection rows plus debit legs of same-date
 * reversal pairs (failed ACH), in gross dollars before syndicator %.
 */
export function computeFailedCollectionBaseForScopedPayments(
  scoped: Array<{
    status: CollectionPaymentStatus;
    amount: Prisma.Decimal | number;
    Date?: Date | null;
    scheduledDate?: Date | null;
    processedDate?: Date | null;
    notes?: string | null;
    dealId?: string | null;
  }>,
  applicationId: string,
  applicationDealId: string | null | undefined,
): number {
  const repaidRows = buildRepaidRowsFromCollectionPayments(scoped, applicationDealId, applicationId);
  const scopedMap = repaidIndexToScopedIndexMap(scoped);

  let explicitFailed = 0;
  for (const row of scoped) {
    if (row.status === CollectionPaymentStatus.FAILED) {
      explicitFailed += Math.abs(amt(row.amount));
    }
  }

  if (repaidRows.length !== scopedMap.length || repaidRows.length === 0) {
    return Math.round(explicitFailed * 100) / 100;
  }

  const { pairedDebitRowIndices } = computeDebitIncomingPairing(repaidRows);
  let reversalDebit = 0;
  for (const repIdx of pairedDebitRowIndices) {
    const si = scopedMap[repIdx];
    if (si === undefined) continue;
    reversalDebit += Math.abs(amt(scoped[si].amount));
  }

  return Math.round((explicitFailed + reversalDebit) * 100) / 100;
}

/**
 * Syndicator's share of failed / reversed collection exposure (sum of base × `percentageSyndicated` / 100).
 */
export async function sumFailedCollectionSyndicatorShareForSyndicator(
  prisma: PrismaClient,
  syndicatorId: number,
): Promise<number> {
  const details = await prisma.applicationSyndicatorDetails.findMany({
    where: { syndicatorId },
    select: { applicationId: true, percentageSyndicated: true },
  });
  if (!details.length) return 0;

  const appIds = [...new Set(details.map((d) => d.applicationId))];
  const apps = await prisma.application.findMany({
    where: { id: { in: appIds } },
    select: { id: true, dealId: true },
  });
  const dealByApp = new Map(apps.map((a) => [a.id, a.dealId]));

  const allPayments = await prisma.collectionPayment.findMany({
    where: { applicationId: { in: appIds } },
    orderBy: [{ paymentNumber: 'asc' }, { scheduledDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      applicationId: true,
      dealId: true,
      notes: true,
      Date: true,
      scheduledDate: true,
      processedDate: true,
      status: true,
      amount: true,
    },
  });
  const byApp = new Map<string, typeof allPayments>();
  for (const p of allPayments) {
    const list = byApp.get(p.applicationId) ?? [];
    list.push(p);
    byApp.set(p.applicationId, list);
  }

  const failedBaseByApp = new Map<string, number>();
  for (const appId of appIds) {
    const scoped = filterCollectionPaymentsForApplicationDeal(
      byApp.get(appId) ?? [],
      dealByApp.get(appId) ?? null,
    );
    failedBaseByApp.set(
      appId,
      computeFailedCollectionBaseForScopedPayments(scoped, appId, dealByApp.get(appId) ?? null),
    );
  }

  let total = 0;
  for (const d of details) {
    const base = failedBaseByApp.get(d.applicationId) ?? 0;
    const pct = amt(d.percentageSyndicated);
    if (base > 0 && pct > 0) total += (base * pct) / 100;
  }
  return Math.round(total * 100) / 100;
}

/** Portfolio-wide sum of each allocation's share of failed / reversed collections (admin totals). */
export async function sumFailedCollectionSyndicatorSharePortfolio(prisma: PrismaClient): Promise<number> {
  const details = await prisma.applicationSyndicatorDetails.findMany({
    select: { applicationId: true, percentageSyndicated: true },
  });
  if (!details.length) return 0;

  const appIds = [...new Set(details.map((d) => d.applicationId))];
  const apps = await prisma.application.findMany({
    where: { id: { in: appIds } },
    select: { id: true, dealId: true },
  });
  const dealByApp = new Map(apps.map((a) => [a.id, a.dealId]));

  const allPayments = await prisma.collectionPayment.findMany({
    where: { applicationId: { in: appIds } },
    orderBy: [{ paymentNumber: 'asc' }, { scheduledDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      applicationId: true,
      dealId: true,
      notes: true,
      Date: true,
      scheduledDate: true,
      processedDate: true,
      status: true,
      amount: true,
    },
  });
  const byApp = new Map<string, typeof allPayments>();
  for (const p of allPayments) {
    const list = byApp.get(p.applicationId) ?? [];
    list.push(p);
    byApp.set(p.applicationId, list);
  }

  const failedBaseByApp = new Map<string, number>();
  for (const appId of appIds) {
    const scoped = filterCollectionPaymentsForApplicationDeal(
      byApp.get(appId) ?? [],
      dealByApp.get(appId) ?? null,
    );
    failedBaseByApp.set(
      appId,
      computeFailedCollectionBaseForScopedPayments(scoped, appId, dealByApp.get(appId) ?? null),
    );
  }

  let total = 0;
  for (const d of details) {
    const base = failedBaseByApp.get(d.applicationId) ?? 0;
    const pct = amt(d.percentageSyndicated);
    if (base > 0 && pct > 0) total += (base * pct) / 100;
  }
  return Math.round(total * 100) / 100;
}
