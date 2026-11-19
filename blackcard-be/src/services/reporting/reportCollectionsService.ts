/**
 * Collections report: funded portfolio, what is expected today, what came in,
 * failed payments, due / overdue aging, trends and per-book / per-deal detail.
 *
 * Built from ReportPaymentFact (payment schedule synced from tenants) with
 * ReportApplicationFact for funded totals and merchant names.
 */
import { Prisma } from '@prisma/client';
import prisma from '../../config/prismaClient';
import { pickGranularity, type Granularity, type ReportFilters } from './reportQueryService';

const DAY = 24 * 60 * 60 * 1000;

function n(v: unknown): number {
  const x = v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function bucketKey(d: Date, g: Granularity): string {
  const x = dayStart(d);
  if (g === 'month') return x.toISOString().slice(0, 7);
  if (g === 'week') {
    const day = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() - day + 1);
  }
  return x.toISOString().slice(0, 10);
}
function bucketsBetween(f: ReportFilters, g: Granularity): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let t = f.from.getTime(); t <= f.to.getTime(); t += DAY) {
    const k = bucketKey(new Date(t), g);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

const AGING = [
  { key: '1-7', max: 7 },
  { key: '8-14', max: 14 },
  { key: '15-30', max: 30 },
  { key: '31-60', max: 60 },
  { key: '61+', max: Infinity },
];

export interface CollectionsOptions {
  /** "Today" reference (defaults to now). */
  asOf?: Date;
  /** Days ahead counted as "due soon". */
  dueSoonDays?: number;
  listLimit?: number;
}

export async function collectionsReport(f: ReportFilters, opts: CollectionsOptions = {}) {
  const asOf = opts.asOf ?? new Date();
  const today = dayStart(asOf);
  const tomorrow = new Date(today.getTime() + DAY);
  const dueSoonDays = Math.max(1, opts.dueSoonDays ?? 7);
  const dueSoonEnd = new Date(today.getTime() + dueSoonDays * DAY);
  const limit = Math.max(5, Math.min(200, opts.listLimit ?? 25));
  const g = pickGranularity(f);
  const bookScope: Prisma.ReportPaymentFactWhereInput = f.bookIds?.length ? { bookId: { in: f.bookIds } } : {};
  const appScope: Prisma.ReportApplicationFactWhereInput = { deletedAtTenant: null, ...(f.bookIds?.length ? { bookId: { in: f.bookIds } } : {}) };
  const names = new Map((await prisma.book.findMany({ select: { id: true, code: true, name: true } })).map((b) => [b.id, b]));

  const [
    portfolio,
    expectedToday,
    receivedToday,
    failedToday,
    dueSoon,
    overdueRows,
    failedInRange,
    paidInRange,
    scheduledInRange,
    byBookPaid,
    byBookFailed,
    byBookOverdue,
    byBookExpected,
    categories,
    healthRows,
  ] = await Promise.all([
    prisma.reportApplicationFact.aggregate({ where: { ...appScope, stage: 'Funded' }, _count: { _all: true }, _sum: { fundedAmount: true, paybackAmount: true, repaidAmount: true, balanceDue: true } }),
    prisma.reportPaymentFact.aggregate({ where: { ...bookScope, status: 'scheduled', scheduledDate: { gte: today, lt: tomorrow } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.reportPaymentFact.aggregate({ where: { ...bookScope, status: 'paid', processedDate: { gte: today, lt: tomorrow } }, _count: { _all: true }, _sum: { paidAmount: true, amount: true } }),
    prisma.reportPaymentFact.aggregate({ where: { ...bookScope, status: 'failed', OR: [{ processedDate: { gte: today, lt: tomorrow } }, { processedDate: null, scheduledDate: { gte: today, lt: tomorrow } }] }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.reportPaymentFact.aggregate({ where: { ...bookScope, status: 'scheduled', scheduledDate: { gte: tomorrow, lt: dueSoonEnd } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.reportPaymentFact.findMany({
      where: { ...bookScope, status: { in: ['scheduled', 'failed'] }, scheduledDate: { lt: today } },
      select: { bookId: true, applicationUuid: true, applicationNumericId: true, dealId: true, merchantName: true, amount: true, status: true, rawStatus: true, failureReason: true, scheduledDate: true },
    }),
    prisma.reportPaymentFact.findMany({
      where: { ...bookScope, status: 'failed', OR: [{ processedDate: { gte: f.from, lte: f.to } }, { processedDate: null, scheduledDate: { gte: f.from, lte: f.to } }] },
      select: { id: true, bookId: true, applicationUuid: true, applicationNumericId: true, dealId: true, merchantName: true, amount: true, rawStatus: true, failureReason: true, scheduledDate: true, processedDate: true, method: true },
      orderBy: [{ processedDate: 'desc' }, { scheduledDate: 'desc' }],
    }),
    prisma.reportPaymentFact.findMany({ where: { ...bookScope, status: 'paid', processedDate: { gte: f.from, lte: f.to } }, select: { processedDate: true, amount: true, paidAmount: true } }),
    prisma.reportPaymentFact.findMany({ where: { ...bookScope, status: { in: ['scheduled', 'paid', 'failed'] }, scheduledDate: { gte: f.from, lte: f.to } }, select: { scheduledDate: true, amount: true, status: true } }),
    prisma.reportPaymentFact.groupBy({ by: ['bookId'], where: { ...bookScope, status: 'paid', processedDate: { gte: f.from, lte: f.to } }, _count: { _all: true }, _sum: { paidAmount: true, amount: true } }),
    prisma.reportPaymentFact.groupBy({ by: ['bookId'], where: { ...bookScope, status: 'failed', OR: [{ processedDate: { gte: f.from, lte: f.to } }, { processedDate: null, scheduledDate: { gte: f.from, lte: f.to } }] }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.reportPaymentFact.groupBy({ by: ['bookId'], where: { ...bookScope, status: { in: ['scheduled', 'failed'] }, scheduledDate: { lt: today } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.reportPaymentFact.groupBy({ by: ['bookId'], where: { ...bookScope, status: { in: ['scheduled', 'paid', 'failed'] }, scheduledDate: { gte: f.from, lte: f.to } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['category'], where: { ...appScope, stage: 'Funded', category: { not: null } }, _count: { _all: true }, _sum: { balanceDue: true } }),
    prisma.reportApplicationFact.findMany({ where: { ...appScope, stage: 'Funded' }, select: { bookId: true, applicationUuid: true, applicationNumericId: true, dealId: true, merchantName: true, fundedAmount: true, paybackAmount: true, repaidAmount: true, balanceDue: true, fundedAt: true, agentName: true, category: true } }),
  ]);

  // --- Overdue aging + per-deal delinquency ---
  const aging = Object.fromEntries(AGING.map((b) => [b.key, { count: 0, amount: 0 }])) as Record<string, { count: number; amount: number }>;
  const perDeal = new Map<string, { bookId: string; applicationUuid: string | null; applicationNumericId: string | null; dealId: string | null; merchantName: string | null; overdueAmount: number; overdueCount: number; failedCount: number; oldestDue: Date | null }>();
  let overdueAmount = 0;
  for (const r of overdueRows) {
    const days = Math.max(1, Math.floor((today.getTime() - dayStart(r.scheduledDate!).getTime()) / DAY));
    const b = AGING.find((x) => days <= x.max)!;
    aging[b.key].count += 1;
    aging[b.key].amount += n(r.amount);
    overdueAmount += n(r.amount);
    const key = `${r.bookId}:${r.applicationUuid ?? r.dealId ?? r.merchantName}`;
    const d = perDeal.get(key) ?? { bookId: r.bookId, applicationUuid: r.applicationUuid, applicationNumericId: r.applicationNumericId, dealId: r.dealId, merchantName: r.merchantName, overdueAmount: 0, overdueCount: 0, failedCount: 0, oldestDue: null };
    d.overdueAmount += n(r.amount);
    d.overdueCount += 1;
    if (r.status === 'failed') d.failedCount += 1;
    if (!d.oldestDue || r.scheduledDate! < d.oldestDue) d.oldestDue = r.scheduledDate!;
    perDeal.set(key, d);
  }
  const delinquent = [...perDeal.values()]
    .map((d) => ({ ...d, bookCode: names.get(d.bookId)?.code ?? null, daysOverdue: d.oldestDue ? Math.floor((today.getTime() - dayStart(d.oldestDue).getTime()) / DAY) : 0 }))
    .sort((a, b) => b.overdueAmount - a.overdueAmount)
    .slice(0, limit);

  // --- Failed reasons ---
  const reasons = new Map<string, { count: number; amount: number }>();
  for (const r of failedInRange) {
    const k = (r.failureReason || r.rawStatus || 'Unknown').trim();
    const cur = reasons.get(k) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += n(r.amount);
    reasons.set(k, cur);
  }

  // --- Trend: expected (scheduled by due date) vs collected (paid by processed date) vs failed ---
  const keys = bucketsBetween(f, g);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const trend = keys.map((bucket) => ({ bucket, expected: 0, collected: 0, failed: 0, failedCount: 0, paidCount: 0 }));
  for (const r of scheduledInRange) {
    const t = trend[idx.get(bucketKey(r.scheduledDate!, g)) ?? -1];
    if (t) t.expected += n(r.amount);
  }
  for (const r of paidInRange) {
    const t = trend[idx.get(bucketKey(r.processedDate!, g)) ?? -1];
    if (t) {
      t.collected += n(r.paidAmount ?? r.amount);
      t.paidCount += 1;
    }
  }
  for (const r of failedInRange) {
    const d = r.processedDate ?? r.scheduledDate;
    const t = d ? trend[idx.get(bucketKey(d, g)) ?? -1] : undefined;
    if (t) {
      t.failed += n(r.amount);
      t.failedCount += 1;
    }
  }

  const expectedInRange = scheduledInRange.reduce((a, r) => a + n(r.amount), 0);
  const collectedInRange = paidInRange.reduce((a, r) => a + n(r.paidAmount ?? r.amount), 0);
  const failedAmountInRange = failedInRange.reduce((a, r) => a + n(r.amount), 0);
  const failedCountInRange = failedInRange.length;
  const attempts = paidInRange.length + failedCountInRange;

  // --- By book ---
  const bookIds = new Set<string>([...byBookPaid, ...byBookFailed, ...byBookOverdue, ...byBookExpected].map((r) => r.bookId));
  for (const h of healthRows) bookIds.add(h.bookId);
  const byBook = [...bookIds].map((bookId) => {
    const paid = byBookPaid.find((r) => r.bookId === bookId);
    const failed = byBookFailed.find((r) => r.bookId === bookId);
    const overdue = byBookOverdue.find((r) => r.bookId === bookId);
    const expected = byBookExpected.find((r) => r.bookId === bookId);
    const funded = healthRows.filter((h) => h.bookId === bookId);
    const collected = n(paid?._sum.paidAmount) || n(paid?._sum.amount);
    return {
      bookId,
      code: names.get(bookId)?.code ?? '?',
      name: names.get(bookId)?.name ?? bookId,
      fundedDeals: funded.length,
      fundedAmount: funded.reduce((a, h) => a + n(h.fundedAmount), 0),
      outstanding: funded.reduce((a, h) => a + n(h.balanceDue), 0),
      expected: n(expected?._sum.amount),
      collected,
      failedCount: failed?._count._all ?? 0,
      failedAmount: n(failed?._sum.amount),
      overdueCount: overdue?._count._all ?? 0,
      overdueAmount: n(overdue?._sum.amount),
      collectionRate: n(expected?._sum.amount) ? collected / n(expected?._sum.amount) : null,
    };
  }).sort((a, b) => b.outstanding - a.outstanding);

  return {
    asOf: asOf.toISOString(),
    granularity: g,
    dueSoonDays,
    portfolio: {
      fundedDeals: portfolio._count._all,
      totalFunded: n(portfolio._sum.fundedAmount),
      totalPayback: n(portfolio._sum.paybackAmount),
      collectedToDate: n(portfolio._sum.repaidAmount),
      outstanding: n(portfolio._sum.balanceDue),
      collectedShare: n(portfolio._sum.paybackAmount) ? n(portfolio._sum.repaidAmount) / n(portfolio._sum.paybackAmount) : null,
    },
    today: {
      expectedCount: expectedToday._count._all,
      expectedAmount: n(expectedToday._sum.amount),
      receivedCount: receivedToday._count._all,
      receivedAmount: n(receivedToday._sum.paidAmount) || n(receivedToday._sum.amount),
      failedCount: failedToday._count._all,
      failedAmount: n(failedToday._sum.amount),
    },
    dueSoon: { count: dueSoon._count._all, amount: n(dueSoon._sum.amount) },
    overdue: { count: overdueRows.length, amount: overdueAmount, aging },
    period: {
      expected: expectedInRange,
      collected: collectedInRange,
      collectionRate: expectedInRange ? collectedInRange / expectedInRange : null,
      failedCount: failedCountInRange,
      failedAmount: failedAmountInRange,
      failureRate: attempts ? failedCountInRange / attempts : null,
      paidCount: paidInRange.length,
    },
    trend,
    failedReasons: [...reasons.entries()].map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.count - a.count).slice(0, 12),
    failedPayments: failedInRange.slice(0, limit).map((r) => ({ ...r, bookCode: names.get(r.bookId)?.code ?? null, amount: n(r.amount) })),
    delinquent,
    byBook,
    healthCategories: categories.map((c) => ({ category: c.category ?? 'Uncategorised', deals: c._count._all, outstanding: n(c._sum.balanceDue) })).sort((a, b) => b.deals - a.deals),
  };
}

export type CollectionsReport = Awaited<ReturnType<typeof collectionsReport>>;

/** Drill-down list of payments for tables (failed / overdue / due / paid). */
export interface PaymentDrillQuery extends ReportFilters {
  kind: 'failed' | 'overdue' | 'due' | 'paid' | 'scheduled' | 'all';
  applicationUuid?: string;
  bookId?: string;
  page?: number;
  limit?: number;
  asOf?: Date;
}

export async function paymentsDrillDown(q: PaymentDrillQuery) {
  const page = Math.max(1, q.page ?? 1);
  const limit = Math.min(500, Math.max(1, q.limit ?? 50));
  const today = dayStart(q.asOf ?? new Date());
  const where: Prisma.ReportPaymentFactWhereInput = {};
  if (q.bookIds?.length) where.bookId = { in: q.bookIds };
  if (q.bookId) where.bookId = q.bookId;
  if (q.applicationUuid) where.applicationUuid = q.applicationUuid;
  if (q.search?.trim()) {
    const s = q.search.trim();
    where.OR = [{ merchantName: { contains: s, mode: 'insensitive' } }, { dealId: { contains: s, mode: 'insensitive' } }, { applicationNumericId: { contains: s, mode: 'insensitive' } }];
  }
  switch (q.kind) {
    case 'failed':
      where.status = 'failed';
      where.AND = [{ OR: [{ processedDate: { gte: q.from, lte: q.to } }, { processedDate: null, scheduledDate: { gte: q.from, lte: q.to } }] }];
      break;
    case 'overdue':
      where.status = { in: ['scheduled', 'failed'] };
      where.scheduledDate = { lt: today };
      break;
    case 'due':
      where.status = 'scheduled';
      where.scheduledDate = { gte: today, lte: q.to };
      break;
    case 'paid':
      where.status = 'paid';
      where.processedDate = { gte: q.from, lte: q.to };
      break;
    case 'scheduled':
      where.status = 'scheduled';
      where.scheduledDate = { gte: q.from, lte: q.to };
      break;
    default:
      where.scheduledDate = { gte: q.from, lte: q.to };
  }
  const names = new Map((await prisma.book.findMany({ select: { id: true, code: true } })).map((b) => [b.id, b.code]));
  const [total, rows] = await Promise.all([
    prisma.reportPaymentFact.count({ where }),
    prisma.reportPaymentFact.findMany({ where, orderBy: [{ scheduledDate: 'desc' }], skip: (page - 1) * limit, take: limit }),
  ]);
  return {
    data: rows.map((r) => ({
      ...r,
      raw: undefined,
      bookCode: names.get(r.bookId) ?? null,
      amount: n(r.amount),
      paidAmount: r.paidAmount === null ? null : n(r.paidAmount),
      daysOverdue: r.scheduledDate && r.scheduledDate < today && r.status !== 'paid' && r.status !== 'waived' ? Math.floor((today.getTime() - dayStart(r.scheduledDate).getTime()) / DAY) : 0,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
