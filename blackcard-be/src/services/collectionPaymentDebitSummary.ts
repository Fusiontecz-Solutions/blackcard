import { CollectionPaymentStatus, type Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';

export type DebitPaymentSummaryResult = {
  totalAmount: number;
  totalCount: number;
};

export type DebitSummaryDateQuery =
  | { kind: 'none' }
  | { kind: 'exact'; ymd: string }
  | { kind: 'ym'; ym: string }
  | { kind: 'y'; year: number }
  | { kind: 'range'; fromYmd: string; toYmd: string };

type DebitPaymentDateFields = {
  processedDate: Date | null;
  Date: Date | null;
  scheduledDate: Date;
  createdAt: Date;
};

const APP_ID_BATCH = 100;

function toNum(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value != null && typeof value === 'object' && 'toString' in value) {
    const parsed = Number((value as { toString(): string }).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function collectionPaymentDisplayYmd(p: DebitPaymentDateFields): string {
  const processedDate = p.processedDate
    ? new Date(p.processedDate).toISOString().slice(0, 10)
    : null;
  const paymentDate = p.Date ? new Date(p.Date).toISOString().slice(0, 10) : null;
  const scheduledDate = p.scheduledDate
    ? new Date(p.scheduledDate).toISOString().slice(0, 10)
    : null;
  return (
    processedDate ??
    paymentDate ??
    scheduledDate ??
    new Date(p.createdAt).toISOString().slice(0, 10)
  );
}

function paymentMatchesDebitDateQuery(
  p: DebitPaymentDateFields,
  q: DebitSummaryDateQuery,
): boolean {
  if (q.kind === 'none') return true;
  const ymd = collectionPaymentDisplayYmd(p);
  if (q.kind === 'exact') return ymd === q.ymd;
  if (q.kind === 'ym') return ymd.slice(0, 7) === q.ym;
  if (q.kind === 'range') return ymd >= q.fromYmd && ymd <= q.toYmd;
  return ymd.slice(0, 4) === String(q.year);
}

function utcDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function utcDayEndInclusive(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999Z`);
}

/** Best-effort SQL date window before strict in-memory display-date filtering. */
function buildDebitPaymentsPrefilter(
  dateQuery: DebitSummaryDateQuery,
): Prisma.CollectionPaymentWhereInput | undefined {
  if (dateQuery.kind === 'none' || dateQuery.kind === 'y') return undefined;

  const dateFieldOr = (from: Date, to: Date): Prisma.CollectionPaymentWhereInput[] => [
    { processedDate: { gte: from, lte: to } },
    { Date: { gte: from, lte: to } },
    { scheduledDate: { gte: from, lte: to } },
  ];

  if (dateQuery.kind === 'exact') {
    return { OR: dateFieldOr(utcDayStart(dateQuery.ymd), utcDayEndInclusive(dateQuery.ymd)) };
  }
  if (dateQuery.kind === 'ym') {
    const [y, m] = dateQuery.ym.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return { OR: dateFieldOr(from, to) };
  }
  if (dateQuery.kind === 'range') {
    return {
      OR: dateFieldOr(utcDayStart(dateQuery.fromYmd), utcDayEndInclusive(dateQuery.toYmd)),
    };
  }
  return undefined;
}

function needsInMemoryDateFilter(dateQuery: DebitSummaryDateQuery): boolean {
  return dateQuery.kind !== 'none';
}

async function aggregateDebitWhere(
  where: Prisma.CollectionPaymentWhereInput,
): Promise<DebitPaymentSummaryResult> {
  const agg = await prisma.collectionPayment.aggregate({
    where: { ...where, status: CollectionPaymentStatus.DEBIT },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return {
    totalAmount: Number(Math.abs(toNum(agg._sum.amount)).toFixed(2)),
    totalCount: Number(agg._count?._all ?? 0) || 0,
  };
}

async function aggregateDebitForApplicationIds(
  applicationIds: string[],
  dateQuery: DebitSummaryDateQuery,
): Promise<DebitPaymentSummaryResult> {
  if (!applicationIds.length) {
    return { totalAmount: 0, totalCount: 0 };
  }

  const datePrefilter = buildDebitPaymentsPrefilter(dateQuery);
  const inMemoryDate = needsInMemoryDateFilter(dateQuery);

  if (!inMemoryDate) {
    let totalAmount = 0;
    let totalCount = 0;
    for (let i = 0; i < applicationIds.length; i += APP_ID_BATCH) {
      const batch = applicationIds.slice(i, i + APP_ID_BATCH);
      const batchResult = await aggregateDebitWhere({
        applicationId: { in: batch },
        ...(datePrefilter ? { AND: [datePrefilter] } : {}),
      });
      totalAmount += batchResult.totalAmount;
      totalCount += batchResult.totalCount;
    }
    return {
      totalAmount: Number(totalAmount.toFixed(2)),
      totalCount,
    };
  }

  let totalAmount = 0;
  let totalCount = 0;
  for (let i = 0; i < applicationIds.length; i += APP_ID_BATCH) {
    const batch = applicationIds.slice(i, i + APP_ID_BATCH);
    const payments = await prisma.collectionPayment.findMany({
      where: {
        status: CollectionPaymentStatus.DEBIT,
        applicationId: { in: batch },
        ...(datePrefilter ? { AND: [datePrefilter] } : {}),
      },
      select: {
        amount: true,
        processedDate: true,
        Date: true,
        scheduledDate: true,
        createdAt: true,
      },
    });
    for (const payment of payments) {
      if (!paymentMatchesDebitDateQuery(payment, dateQuery)) continue;
      totalCount += 1;
      totalAmount += Math.abs(toNum(payment.amount));
    }
  }

  return {
    totalAmount: Number(totalAmount.toFixed(2)),
    totalCount,
  };
}

/**
 * Portfolio Failed Payment KPI — count CollectionPayment rows with `status = DEBIT`
 * and sum |amount| (debits are typically negative in storage).
 */
export async function aggregateDebitPaymentSummary(options?: {
  applicationIds?: string[];
  dateQuery?: DebitSummaryDateQuery;
}): Promise<DebitPaymentSummaryResult> {
  const applicationIds = options?.applicationIds;
  const dateQuery = options?.dateQuery ?? { kind: 'none' };

  if (applicationIds?.length) {
    return aggregateDebitForApplicationIds(applicationIds, dateQuery);
  }

  if (needsInMemoryDateFilter(dateQuery)) {
    const datePrefilter = buildDebitPaymentsPrefilter(dateQuery);
    const payments = await prisma.collectionPayment.findMany({
      where: {
        status: CollectionPaymentStatus.DEBIT,
        ...(datePrefilter ? { AND: [datePrefilter] } : {}),
      },
      select: {
        amount: true,
        processedDate: true,
        Date: true,
        scheduledDate: true,
        createdAt: true,
      },
    });
    let totalAmount = 0;
    let totalCount = 0;
    for (const payment of payments) {
      if (!paymentMatchesDebitDateQuery(payment, dateQuery)) continue;
      totalCount += 1;
      totalAmount += Math.abs(toNum(payment.amount));
    }
    return {
      totalAmount: Number(totalAmount.toFixed(2)),
      totalCount,
    };
  }

  return aggregateDebitWhere({});
}

/** Distinct funded applications with at least one DEBIT row matching the same filters. */
export async function countDealsWithDebitPayments(options?: {
  applicationIds?: string[];
  dateQuery?: DebitSummaryDateQuery;
}): Promise<number> {
  const applicationIds = options?.applicationIds;
  const dateQuery = options?.dateQuery ?? { kind: 'none' };

  if (!applicationIds?.length) {
    if (!needsInMemoryDateFilter(dateQuery)) {
      const rows = await prisma.collectionPayment.findMany({
        where: { status: CollectionPaymentStatus.DEBIT },
        distinct: ['applicationId'],
        select: { applicationId: true },
      });
      return rows.length;
    }
    const payments = await prisma.collectionPayment.findMany({
      where: { status: CollectionPaymentStatus.DEBIT },
      select: {
        applicationId: true,
        processedDate: true,
        Date: true,
        scheduledDate: true,
        createdAt: true,
      },
    });
    const seen = new Set<string>();
    for (const payment of payments) {
      if (!paymentMatchesDebitDateQuery(payment, dateQuery)) continue;
      seen.add(payment.applicationId);
    }
    return seen.size;
  }

  const seen = new Set<string>();
  const datePrefilter = buildDebitPaymentsPrefilter(dateQuery);
  const inMemoryDate = needsInMemoryDateFilter(dateQuery);

  for (let i = 0; i < applicationIds.length; i += APP_ID_BATCH) {
    const batch = applicationIds.slice(i, i + APP_ID_BATCH);
    const payments = await prisma.collectionPayment.findMany({
      where: {
        status: CollectionPaymentStatus.DEBIT,
        applicationId: { in: batch },
        ...(datePrefilter ? { AND: [datePrefilter] } : {}),
      },
      select: {
        applicationId: true,
        amount: true,
        processedDate: true,
        Date: true,
        scheduledDate: true,
        createdAt: true,
      },
      ...(inMemoryDate ? {} : { distinct: ['applicationId'] as const }),
    });
    for (const payment of payments) {
      if (inMemoryDate && !paymentMatchesDebitDateQuery(payment, dateQuery)) continue;
      seen.add(payment.applicationId);
    }
  }

  return seen.size;
}
