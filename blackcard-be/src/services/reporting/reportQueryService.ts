/**
 * Report computations over the local reporting store.
 *
 * Every report accepts the same ReportFilters and returns plain JSON that the
 * frontend renders and the export service tabulates.
 */
import { Prisma } from '@prisma/client';
import prisma from '../../config/prismaClient';
import {
  CONTRACT_STAGES,
  FUNDING_STAGES,
  PIPELINE_ORDER,
  STAGE_LABELS,
  type Stage,
} from './reportSyncService';

export interface ReportFilters {
  from: Date;
  to: Date;
  bookIds?: string[];
  agentId?: string;
  underwriterId?: string;
  stage?: string;
  status?: string;
  dealType?: string;
  search?: string;
}

export type Granularity = 'day' | 'week' | 'month';

const DAY = 24 * 60 * 60 * 1000;

function n(v: unknown): number {
  const x = v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function baseWhere(f: ReportFilters): Prisma.ReportApplicationFactWhereInput {
  const where: Prisma.ReportApplicationFactWhereInput = { deletedAtTenant: null };
  if (f.bookIds?.length) where.bookId = { in: f.bookIds };
  if (f.agentId) where.agentId = f.agentId;
  if (f.underwriterId) where.underwriterId = f.underwriterId;
  if (f.stage) where.stage = f.stage;
  if (f.status) where.status = f.status;
  if (f.dealType) where.dealType = f.dealType;
  if (f.search?.trim()) {
    const s = f.search.trim();
    where.OR = [
      { merchantName: { contains: s, mode: 'insensitive' } },
      { dealId: { contains: s, mode: 'insensitive' } },
      { applicationNumericId: { contains: s, mode: 'insensitive' } },
      { agentName: { contains: s, mode: 'insensitive' } },
    ];
  }
  return where;
}

function inRange(field: string, f: ReportFilters): Prisma.ReportApplicationFactWhereInput {
  return { [field]: { gte: f.from, lte: f.to } } as Prisma.ReportApplicationFactWhereInput;
}

async function bookNames(): Promise<Map<string, { code: string; name: string }>> {
  const books = await prisma.book.findMany({ select: { id: true, code: true, name: true } });
  return new Map(books.map((b) => [b.id, { code: b.code, name: b.name }]));
}

function bucketKey(d: Date, g: Granularity): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (g === 'month') return x.toISOString().slice(0, 7);
  if (g === 'week') {
    const day = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() - day + 1);
  }
  return x.toISOString().slice(0, 10);
}

export function pickGranularity(f: ReportFilters): Granularity {
  const days = (f.to.getTime() - f.from.getTime()) / DAY;
  if (days <= 45) return 'day';
  if (days <= 200) return 'week';
  return 'month';
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

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const daysBetween = (a: Date | null, b: Date | null) => (a && b ? (b.getTime() - a.getTime()) / DAY : null);

// ---------------------------------------------------------------------------
// Overview (KPIs + trend + funnel)
// ---------------------------------------------------------------------------

export async function overviewReport(f: ReportFilters) {
  const g = pickGranularity(f);
  const where = baseWhere(f);
  const prevSpan = f.to.getTime() - f.from.getTime();
  const prev: ReportFilters = { ...f, from: new Date(f.from.getTime() - prevSpan - DAY), to: new Date(f.from.getTime() - 1) };

  const kpiFor = async (r: ReportFilters) => {
    const w = baseWhere(r);
    const [created, approved, funded, declined, contractsSent, contractsSigned] = await Promise.all([
      prisma.reportApplicationFact.aggregate({ where: { ...w, ...inRange('createdAtTenant', r) }, _count: { _all: true }, _sum: { requestedAmount: true } }),
      prisma.reportApplicationFact.aggregate({ where: { ...w, ...inRange('approvedAt', r) }, _count: { _all: true }, _sum: { approvedAmount: true } }),
      prisma.reportApplicationFact.aggregate({ where: { ...w, ...inRange('fundedAt', r), stage: 'Funded' }, _count: { _all: true }, _sum: { fundedAmount: true, commissionAmount: true } }),
      prisma.reportApplicationFact.count({ where: { ...w, ...inRange('declinedAt', r) } }),
      prisma.reportApplicationFact.count({ where: { ...w, ...inRange('contractSentAt', r) } }),
      prisma.reportApplicationFact.count({ where: { ...w, ...inRange('contractSignedAt', r) } }),
    ]);
    return {
      applications: created._count._all,
      requestedAmount: n(created._sum.requestedAmount),
      approved: approved._count._all,
      approvedAmount: n(approved._sum.approvedAmount),
      funded: funded._count._all,
      fundedAmount: n(funded._sum.fundedAmount),
      commissionAmount: n(funded._sum.commissionAmount),
      declined,
      contractsSent,
      contractsSigned,
      approvalRate: created._count._all ? approved._count._all / created._count._all : null,
      fundingRate: created._count._all ? funded._count._all / created._count._all : null,
      avgFundedDeal: funded._count._all ? n(funded._sum.fundedAmount) / funded._count._all : null,
    };
  };

  const [current, previous, openByStage, trendRows] = await Promise.all([
    kpiFor(f),
    kpiFor(prev),
    prisma.reportApplicationFact.groupBy({ by: ['stage'], where: { ...where, stage: { notIn: ['Funded', 'Declined', 'Deleted'] } }, _count: { _all: true }, _sum: { approvedAmount: true, requestedAmount: true } }),
    prisma.reportApplicationFact.findMany({
      where: {
        ...where,
        OR: [inRange('createdAtTenant', f), inRange('approvedAt', f), inRange('fundedAt', f), inRange('declinedAt', f)],
      },
      select: { createdAtTenant: true, approvedAt: true, fundedAt: true, declinedAt: true, fundedAmount: true, approvedAmount: true },
    }),
  ]);

  const keys = bucketsBetween(f, g);
  const trend = keys.map((k) => ({ bucket: k, applications: 0, approved: 0, funded: 0, declined: 0, fundedAmount: 0, approvedAmount: 0 }));
  const idx = new Map(keys.map((k, i) => [k, i]));
  const within = (d: Date | null) => d && d >= f.from && d <= f.to;
  for (const r of trendRows) {
    if (within(r.createdAtTenant)) trend[idx.get(bucketKey(r.createdAtTenant!, g))!].applications += 1;
    if (within(r.approvedAt)) {
      const t = trend[idx.get(bucketKey(r.approvedAt!, g))!];
      t.approved += 1;
      t.approvedAmount += n(r.approvedAmount);
    }
    if (within(r.fundedAt)) {
      const t = trend[idx.get(bucketKey(r.fundedAt!, g))!];
      t.funded += 1;
      t.fundedAmount += n(r.fundedAmount);
    }
    if (within(r.declinedAt)) trend[idx.get(bucketKey(r.declinedAt!, g))!].declined += 1;
  }

  const openPipeline = PIPELINE_ORDER.filter((s) => s !== 'Funded').map((s) => {
    const row = openByStage.find((r) => r.stage === s);
    return { stage: s, label: STAGE_LABELS[s], count: row?._count._all ?? 0, amount: n(row?._sum.approvedAmount) || n(row?._sum.requestedAmount) };
  });
  const waiting = ['On_Hold', 'Waiting_For_Documents'].map((s) => {
    const row = openByStage.find((r) => r.stage === s);
    return { stage: s, label: STAGE_LABELS[s as Stage], count: row?._count._all ?? 0, amount: n(row?._sum.approvedAmount) || n(row?._sum.requestedAmount) };
  });

  return { granularity: g, current, previous, trend, openPipeline, waiting };
}

// ---------------------------------------------------------------------------
// Book performance
// ---------------------------------------------------------------------------

export async function booksReport(f: ReportFilters) {
  const names = await bookNames();
  const where = baseWhere(f);
  const [created, approved, funded, declined, open, cycle] = await Promise.all([
    prisma.reportApplicationFact.groupBy({ by: ['bookId'], where: { ...where, ...inRange('createdAtTenant', f) }, _count: { _all: true }, _sum: { requestedAmount: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['bookId'], where: { ...where, ...inRange('approvedAt', f) }, _count: { _all: true }, _sum: { approvedAmount: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['bookId'], where: { ...where, ...inRange('fundedAt', f), stage: 'Funded' }, _count: { _all: true }, _sum: { fundedAmount: true, commissionAmount: true, balanceDue: true, repaidAmount: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['bookId'], where: { ...where, ...inRange('declinedAt', f) }, _count: { _all: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['bookId'], where: { ...where, stage: { notIn: ['Funded', 'Declined', 'Deleted'] } }, _count: { _all: true }, _sum: { approvedAmount: true, requestedAmount: true } }),
    prisma.reportApplicationFact.findMany({ where: { ...where, ...inRange('fundedAt', f), stage: 'Funded' }, select: { bookId: true, createdAtTenant: true, fundedAt: true, dealType: true } }),
  ]);
  const ids = new Set<string>([...created, ...approved, ...funded, ...declined, ...open].map((r) => r.bookId));
  if (f.bookIds?.length) for (const id of f.bookIds) ids.add(id);
  const rows = [...ids].map((bookId) => {
    const c = created.find((r) => r.bookId === bookId);
    const a = approved.find((r) => r.bookId === bookId);
    const fu = funded.find((r) => r.bookId === bookId);
    const d = declined.find((r) => r.bookId === bookId);
    const o = open.find((r) => r.bookId === bookId);
    const cyc = cycle.filter((r) => r.bookId === bookId);
    const days = cyc.map((r) => daysBetween(r.createdAtTenant, r.fundedAt)).filter((x): x is number => x !== null && x >= 0);
    const renewals = cyc.filter((r) => /renew/i.test(r.dealType ?? '')).length;
    const apps = c?._count._all ?? 0;
    const fundedCount = fu?._count._all ?? 0;
    return {
      bookId,
      code: names.get(bookId)?.code ?? '?',
      name: names.get(bookId)?.name ?? bookId,
      applications: apps,
      requestedAmount: n(c?._sum.requestedAmount),
      approved: a?._count._all ?? 0,
      approvedAmount: n(a?._sum.approvedAmount),
      funded: fundedCount,
      fundedAmount: n(fu?._sum.fundedAmount),
      commissionAmount: n(fu?._sum.commissionAmount),
      declined: d?._count._all ?? 0,
      openCount: o?._count._all ?? 0,
      openAmount: n(o?._sum.approvedAmount) || n(o?._sum.requestedAmount),
      balanceDue: n(fu?._sum.balanceDue),
      repaidAmount: n(fu?._sum.repaidAmount),
      approvalRate: apps ? (a?._count._all ?? 0) / apps : null,
      fundingRate: apps ? fundedCount / apps : null,
      avgFundedDeal: fundedCount ? n(fu?._sum.fundedAmount) / fundedCount : null,
      avgDaysToFund: avg(days),
      renewalShare: fundedCount ? renewals / fundedCount : null,
    };
  });
  rows.sort((a, b) => b.fundedAmount - a.fundedAmount);
  return { rows };
}

export async function bookTrendReport(f: ReportFilters) {
  const names = await bookNames();
  const g = pickGranularity(f);
  const rows = await prisma.reportApplicationFact.findMany({
    where: { ...baseWhere(f), ...inRange('fundedAt', f), stage: 'Funded' },
    select: { bookId: true, fundedAt: true, fundedAmount: true },
  });
  const keys = bucketsBetween(f, g);
  const series = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const s = series.get(r.bookId) ?? Object.fromEntries(keys.map((k) => [k, 0]));
    s[bucketKey(r.fundedAt!, g)] = (s[bucketKey(r.fundedAt!, g)] ?? 0) + n(r.fundedAmount);
    series.set(r.bookId, s);
  }
  return {
    granularity: g,
    buckets: keys,
    series: [...series.entries()].map(([bookId, values]) => ({ bookId, code: names.get(bookId)?.code ?? '?', name: names.get(bookId)?.name ?? bookId, values: keys.map((k) => values[k] ?? 0) })),
  };
}

// ---------------------------------------------------------------------------
// Cases overview
// ---------------------------------------------------------------------------

const AGING_BUCKETS = [
  { key: '0-3', max: 3 },
  { key: '4-7', max: 7 },
  { key: '8-14', max: 14 },
  { key: '15-30', max: 30 },
  { key: '31+', max: Infinity },
];

export async function casesReport(f: ReportFilters, slaDays = Number(process.env.REPORT_STAGE_SLA_DAYS || 7)) {
  const where = baseWhere(f);
  const names = await bookNames();
  const now = Date.now();

  const open = await prisma.reportApplicationFact.findMany({
    where: { ...where, stage: { notIn: ['Funded', 'Declined', 'Deleted'] } },
    select: { id: true, bookId: true, applicationUuid: true, applicationNumericId: true, merchantName: true, stage: true, approvedAmount: true, requestedAmount: true, agentName: true, underwriterName: true, updatedAtTenant: true, createdAtTenant: true },
  });
  // Last transition into the current stage (falls back to tenant updatedAt).
  const lastEvents = await prisma.reportStageEvent.findMany({
    where: { applicationUuid: { in: open.map((o) => o.applicationUuid) } },
    orderBy: { at: 'desc' },
    select: { applicationUuid: true, bookId: true, toStage: true, at: true },
  });
  const enteredAt = new Map<string, Date>();
  for (const e of lastEvents) {
    const k = `${e.bookId}:${e.applicationUuid}`;
    if (!enteredAt.has(k)) enteredAt.set(k, e.at);
  }

  const byStage = PIPELINE_ORDER.filter((s) => s !== 'Funded').concat(['On_Hold', 'Waiting_For_Documents', 'Other']).map((s) => ({
    stage: s,
    label: STAGE_LABELS[s as Stage],
    count: 0,
    amount: 0,
    aging: Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, 0])) as Record<string, number>,
    avgDaysInStage: null as number | null,
    overSla: 0,
    _days: [] as number[],
  }));
  const stuck: Array<Record<string, unknown>> = [];
  for (const o of open) {
    const entered = enteredAt.get(`${o.bookId}:${o.applicationUuid}`) ?? o.updatedAtTenant ?? o.createdAtTenant;
    const days = entered ? (now - entered.getTime()) / DAY : 0;
    const row = byStage.find((s) => s.stage === o.stage) ?? byStage[byStage.length - 1];
    row.count += 1;
    row.amount += n(o.approvedAmount) || n(o.requestedAmount);
    row._days.push(days);
    const bucket = AGING_BUCKETS.find((b) => days <= b.max)!;
    row.aging[bucket.key] += 1;
    if (days > slaDays) {
      row.overSla += 1;
      stuck.push({
        bookId: o.bookId,
        bookCode: names.get(o.bookId)?.code,
        applicationUuid: o.applicationUuid,
        applicationNumericId: o.applicationNumericId,
        merchantName: o.merchantName,
        stage: o.stage,
        stageLabel: STAGE_LABELS[(o.stage ?? 'Other') as Stage],
        amount: n(o.approvedAmount) || n(o.requestedAmount),
        agentName: o.agentName,
        underwriterName: o.underwriterName,
        daysInStage: Math.round(days),
        enteredAt: entered,
      });
    }
  }
  for (const s of byStage) {
    s.avgDaysInStage = avg(s._days) === null ? null : Math.round(avg(s._days)! * 10) / 10;
    delete (s as Partial<typeof s>)._days;
  }
  stuck.sort((a, b) => (b.daysInStage as number) - (a.daysInStage as number));

  // Velocity: per-stage durations from consecutive events in range.
  const events = await prisma.reportStageEvent.findMany({
    where: { at: { gte: f.from, lte: f.to }, ...(f.bookIds?.length ? { bookId: { in: f.bookIds } } : {}) },
    orderBy: [{ applicationUuid: 'asc' }, { at: 'asc' }],
    select: { applicationUuid: true, fromStage: true, toStage: true, at: true },
  });
  const durations = new Map<string, number[]>();
  let prevKey = '';
  let prevAt: Date | null = null;
  for (const e of events) {
    const k = e.applicationUuid;
    if (k === prevKey && prevAt && e.fromStage) {
      const arr = durations.get(e.fromStage) ?? [];
      arr.push((e.at.getTime() - prevAt.getTime()) / DAY);
      durations.set(e.fromStage, arr);
    }
    prevKey = k;
    prevAt = e.at;
  }
  const velocity = PIPELINE_ORDER.map((s) => ({ stage: s, label: STAGE_LABELS[s], avgDays: avg(durations.get(s) ?? []), medianDays: median(durations.get(s) ?? []), samples: (durations.get(s) ?? []).length }));

  const funded = await prisma.reportApplicationFact.findMany({ where: { ...where, ...inRange('fundedAt', f), stage: 'Funded' }, select: { createdAtTenant: true, fundedAt: true } });
  const cycleDays = funded.map((r) => daysBetween(r.createdAtTenant, r.fundedAt)).filter((x): x is number => x !== null && x >= 0);

  const declines = await prisma.reportApplicationFact.groupBy({ by: ['declinedByRole'], where: { ...where, ...inRange('declinedAt', f) }, _count: { _all: true } });
  // ScrubberRecommendation is Super-Admin-only; book CRMs leave decline reasons empty.
  const reasonCounts = new Map<string, number>();

  return {
    slaDays,
    byStage,
    stuck: stuck.slice(0, 200),
    velocity,
    cycle: { avgDays: avg(cycleDays), medianDays: median(cycleDays), samples: cycleDays.length },
    declines: {
      byActor: declines.map((d) => ({ actor: d.declinedByRole ?? 'unknown', count: d._count._all })),
      reasons: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 15),
    },
  };
}

// ---------------------------------------------------------------------------
// Contracts overview
// ---------------------------------------------------------------------------

export async function contractsReport(f: ReportFilters) {
  const where = baseWhere(f);
  const names = await bookNames();
  const now = Date.now();
  const [byStage, sent, signed, reinit] = await Promise.all([
    prisma.reportApplicationFact.groupBy({ by: ['stage'], where: { ...where, stage: { in: CONTRACT_STAGES } }, _count: { _all: true }, _sum: { approvedAmount: true } }),
    prisma.reportApplicationFact.findMany({ where: { ...where, ...inRange('contractSentAt', f) }, select: { approvedAt: true, contractSentAt: true, contractSignedAt: true } }),
    prisma.reportApplicationFact.count({ where: { ...where, ...inRange('contractSignedAt', f) } }),
    prisma.reportApplicationFact.count({ where: { ...where, needsContractReinitiation: true, stage: { notIn: ['Funded', 'Declined', 'Deleted'] } } }),
  ]);
  const unsigned = await prisma.reportApplicationFact.findMany({
    where: { ...where, stage: 'Contracts_Out' },
    select: { bookId: true, applicationUuid: true, applicationNumericId: true, merchantName: true, approvedAmount: true, agentName: true, contractSentAt: true, updatedAtTenant: true },
    orderBy: { contractSentAt: 'asc' },
    take: 200,
  });
  const approvalToSent = sent.map((r) => daysBetween(r.approvedAt, r.contractSentAt)).filter((x): x is number => x !== null && x >= 0);
  const sentToSigned = sent.map((r) => daysBetween(r.contractSentAt, r.contractSignedAt)).filter((x): x is number => x !== null && x >= 0);
  return {
    byStage: CONTRACT_STAGES.map((s) => {
      const r = byStage.find((x) => x.stage === s);
      return { stage: s, label: STAGE_LABELS[s], count: r?._count._all ?? 0, amount: n(r?._sum.approvedAmount) };
    }),
    sentInRange: sent.length,
    signedInRange: signed,
    signRate: sent.length ? sent.filter((r) => r.contractSignedAt).length / sent.length : null,
    needsReinitiation: reinit,
    turnaround: {
      approvalToSentAvgDays: avg(approvalToSent),
      sentToSignedAvgDays: avg(sentToSigned),
      sentToSignedMedianDays: median(sentToSigned),
    },
    unsigned: unsigned.map((u) => ({
      ...u,
      bookCode: names.get(u.bookId)?.code,
      amount: n(u.approvedAmount),
      daysOut: Math.round((now - (u.contractSentAt ?? u.updatedAtTenant ?? new Date(now)).getTime()) / DAY),
    })),
  };
}

// ---------------------------------------------------------------------------
// Funding overview
// ---------------------------------------------------------------------------

export async function fundingReport(f: ReportFilters) {
  const where = baseWhere(f);
  const names = await bookNames();
  const g = pickGranularity(f);
  const [queue, fundedRows, byAgent, byUnderwriter, portfolio] = await Promise.all([
    prisma.reportApplicationFact.groupBy({ by: ['stage'], where: { ...where, stage: { in: FUNDING_STAGES } }, _count: { _all: true }, _sum: { approvedAmount: true } }),
    prisma.reportApplicationFact.findMany({ where: { ...where, ...inRange('fundedAt', f), stage: 'Funded' }, select: { bookId: true, fundedAt: true, fundedAmount: true, commissionAmount: true, contractSignedAt: true, dealType: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['agentId', 'agentName'], where: { ...where, ...inRange('fundedAt', f), stage: 'Funded' }, _count: { _all: true }, _sum: { fundedAmount: true, commissionAmount: true }, orderBy: { _sum: { fundedAmount: 'desc' } }, take: 15 }),
    prisma.reportApplicationFact.groupBy({ by: ['underwriterId', 'underwriterName'], where: { ...where, ...inRange('fundedAt', f), stage: 'Funded' }, _count: { _all: true }, _sum: { fundedAmount: true }, orderBy: { _sum: { fundedAmount: 'desc' } }, take: 15 }),
    prisma.reportApplicationFact.aggregate({ where: { ...where, stage: 'Funded' }, _count: { _all: true }, _sum: { fundedAmount: true, paybackAmount: true, repaidAmount: true, balanceDue: true } }),
  ]);
  const keys = bucketsBetween(f, g);
  const trend = keys.map((k) => ({ bucket: k, funded: 0, fundedAmount: 0, commissionAmount: 0 }));
  const idx = new Map(keys.map((k, i) => [k, i]));
  const byBook = new Map<string, { count: number; amount: number }>();
  const signedToFunded: number[] = [];
  let renewals = 0;
  for (const r of fundedRows) {
    const t = trend[idx.get(bucketKey(r.fundedAt!, g))!];
    if (t) {
      t.funded += 1;
      t.fundedAmount += n(r.fundedAmount);
      t.commissionAmount += n(r.commissionAmount);
    }
    const b = byBook.get(r.bookId) ?? { count: 0, amount: 0 };
    b.count += 1;
    b.amount += n(r.fundedAmount);
    byBook.set(r.bookId, b);
    const d = daysBetween(r.contractSignedAt, r.fundedAt);
    if (d !== null && d >= 0) signedToFunded.push(d);
    if (/renew/i.test(r.dealType ?? '')) renewals += 1;
  }
  return {
    granularity: g,
    queue: FUNDING_STAGES.map((s) => {
      const r = queue.find((x) => x.stage === s);
      return { stage: s, label: STAGE_LABELS[s], count: r?._count._all ?? 0, amount: n(r?._sum.approvedAmount) };
    }),
    totals: {
      funded: fundedRows.length,
      fundedAmount: fundedRows.reduce((a, r) => a + n(r.fundedAmount), 0),
      commissionAmount: fundedRows.reduce((a, r) => a + n(r.commissionAmount), 0),
      avgDeal: fundedRows.length ? fundedRows.reduce((a, r) => a + n(r.fundedAmount), 0) / fundedRows.length : null,
      renewalShare: fundedRows.length ? renewals / fundedRows.length : null,
      signedToFundedAvgDays: avg(signedToFunded),
    },
    trend,
    byBook: [...byBook.entries()].map(([bookId, v]) => ({ bookId, code: names.get(bookId)?.code ?? '?', name: names.get(bookId)?.name ?? bookId, ...v })).sort((a, b) => b.amount - a.amount),
    byAgent: byAgent.map((r) => ({ id: r.agentId, name: r.agentName ?? 'Unassigned', count: r._count._all, amount: n(r._sum.fundedAmount), commission: n(r._sum.commissionAmount) })),
    byUnderwriter: byUnderwriter.map((r) => ({ id: r.underwriterId, name: r.underwriterName ?? 'Unassigned', count: r._count._all, amount: n(r._sum.fundedAmount) })),
    portfolio: {
      fundedDeals: portfolio._count._all,
      fundedAmount: n(portfolio._sum.fundedAmount),
      paybackAmount: n(portfolio._sum.paybackAmount),
      repaidAmount: n(portfolio._sum.repaidAmount),
      balanceDue: n(portfolio._sum.balanceDue),
      collectedShare: n(portfolio._sum.paybackAmount) ? n(portfolio._sum.repaidAmount) / n(portfolio._sum.paybackAmount) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Daily working overview
// ---------------------------------------------------------------------------

export async function dailyReport(day: Date, bookIds?: string[]) {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start.getTime() + DAY);
  const yesterday = new Date(start.getTime() - DAY);
  const lastWeek = new Date(start.getTime() - 7 * DAY);
  const names = await bookNames();

  const dayFilters = (from: Date): ReportFilters => ({ from, to: new Date(from.getTime() + DAY - 1), bookIds });
  const counts = async (from: Date) => {
    const f = dayFilters(from);
    const w = baseWhere(f);
    const [created, approved, funded, declined, sent, signed, transitions] = await Promise.all([
      prisma.reportApplicationFact.count({ where: { ...w, ...inRange('createdAtTenant', f) } }),
      prisma.reportApplicationFact.count({ where: { ...w, ...inRange('approvedAt', f) } }),
      prisma.reportApplicationFact.aggregate({ where: { ...w, ...inRange('fundedAt', f), stage: 'Funded' }, _count: { _all: true }, _sum: { fundedAmount: true } }),
      prisma.reportApplicationFact.count({ where: { ...w, ...inRange('declinedAt', f) } }),
      prisma.reportApplicationFact.count({ where: { ...w, ...inRange('contractSentAt', f) } }),
      prisma.reportApplicationFact.count({ where: { ...w, ...inRange('contractSignedAt', f) } }),
      prisma.reportStageEvent.count({ where: { at: { gte: f.from, lte: f.to }, source: 'sync', ...(bookIds?.length ? { bookId: { in: bookIds } } : {}) } }),
    ]);
    return { created, approved, funded: funded._count._all, fundedAmount: n(funded._sum.fundedAmount), declined, contractsSent: sent, contractsSigned: signed, stageMoves: transitions };
  };

  const [today, prevDay, sameDayLastWeek] = await Promise.all([counts(start), counts(yesterday), counts(lastWeek)]);

  // Movements today (stage transitions) with merchant names.
  const moves = await prisma.reportStageEvent.findMany({
    where: { at: { gte: start, lt: end }, source: 'sync', ...(bookIds?.length ? { bookId: { in: bookIds } } : {}) },
    orderBy: { at: 'desc' },
    take: 300,
    select: { bookId: true, applicationUuid: true, fromStage: true, toStage: true, at: true },
  });
  const facts = await prisma.reportApplicationFact.findMany({
    where: { applicationUuid: { in: [...new Set(moves.map((m) => m.applicationUuid))] } },
    select: { bookId: true, applicationUuid: true, merchantName: true, applicationNumericId: true, approvedAmount: true, requestedAmount: true, agentName: true, underwriterName: true },
  });
  const factMap = new Map(facts.map((x) => [`${x.bookId}:${x.applicationUuid}`, x]));
  const movements = moves.map((m) => {
    const x = factMap.get(`${m.bookId}:${m.applicationUuid}`);
    return {
      at: m.at,
      bookCode: names.get(m.bookId)?.code,
      applicationUuid: m.applicationUuid,
      applicationNumericId: x?.applicationNumericId ?? null,
      merchantName: x?.merchantName ?? null,
      amount: n(x?.approvedAmount) || n(x?.requestedAmount),
      from: m.fromStage ? STAGE_LABELS[m.fromStage as Stage] ?? m.fromStage : null,
      to: m.toStage ? STAGE_LABELS[m.toStage as Stage] ?? m.toStage : null,
      agentName: x?.agentName ?? null,
      underwriterName: x?.underwriterName ?? null,
    };
  });

  // Queues right now.
  const w = baseWhere({ from: start, to: end, bookIds });
  const [unclaimed, claimed, waitingDocs, onHold, byUnderwriter] = await Promise.all([
    prisma.reportApplicationFact.count({ where: { ...w, stage: 'Underwriter', underwriterId: null } }),
    prisma.reportApplicationFact.count({ where: { ...w, stage: 'Underwriter', underwriterId: { not: null } } }),
    prisma.reportApplicationFact.count({ where: { ...w, stage: 'Waiting_For_Documents' } }),
    prisma.reportApplicationFact.count({ where: { ...w, stage: 'On_Hold' } }),
    prisma.reportApplicationFact.groupBy({ by: ['underwriterName'], where: { ...w, stage: 'Underwriter', underwriterId: { not: null } }, _count: { _all: true } }),
  ]);

  // AuditLog is Super-Admin-only; book CRMs omit login activity.
  const logins: Array<{ email: string | null; count: number }> = [];

  return {
    date: start.toISOString().slice(0, 10),
    today,
    yesterday: prevDay,
    sameDayLastWeek,
    queues: { unclaimed, claimed, waitingDocs, onHold, byUnderwriter: byUnderwriter.map((r) => ({ name: r.underwriterName ?? 'Unknown', count: r._count._all })) },
    movements,
    logins,
  };
}

// ---------------------------------------------------------------------------
// Team / people performance
// ---------------------------------------------------------------------------

export async function teamReport(f: ReportFilters) {
  const where = baseWhere(f);
  const [agents, underwriters, scrubbers] = await Promise.all([
    prisma.reportApplicationFact.groupBy({ by: ['agentId', 'agentName'], where: { ...where, ...inRange('createdAtTenant', f) }, _count: { _all: true }, _sum: { requestedAmount: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['underwriterId', 'underwriterName'], where: { ...where, OR: [inRange('approvedAt', f), inRange('declinedAt', f)] }, _count: { _all: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['scrubberRecommendation'], where: { ...where, ...inRange('createdAtTenant', f), scrubberRecommendation: { not: null } }, _count: { _all: true } }),
  ]);
  const agentIds = agents.map((a) => a.agentId).filter((x): x is string => !!x);
  const [agentApproved, agentFunded] = await Promise.all([
    prisma.reportApplicationFact.groupBy({ by: ['agentId'], where: { ...where, agentId: { in: agentIds }, ...inRange('approvedAt', f) }, _count: { _all: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['agentId'], where: { ...where, agentId: { in: agentIds }, ...inRange('fundedAt', f), stage: 'Funded' }, _count: { _all: true }, _sum: { fundedAmount: true, commissionAmount: true } }),
  ]);
  const uwIds = underwriters.map((u) => u.underwriterId).filter((x): x is string => !!x);
  const [uwApproved, uwDeclined, uwFunded] = await Promise.all([
    prisma.reportApplicationFact.groupBy({ by: ['underwriterId'], where: { ...where, underwriterId: { in: uwIds }, ...inRange('approvedAt', f) }, _count: { _all: true }, _sum: { approvedAmount: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['underwriterId'], where: { ...where, underwriterId: { in: uwIds }, ...inRange('declinedAt', f) }, _count: { _all: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['underwriterId'], where: { ...where, underwriterId: { in: uwIds }, ...inRange('fundedAt', f), stage: 'Funded' }, _count: { _all: true }, _sum: { fundedAmount: true } }),
  ]);
  const find = <T extends { [k: string]: unknown }>(arr: T[], k: keyof T, id: string | null) => arr.find((r) => r[k] === id);
  return {
    agents: agents
      .map((a) => {
        const ap = find(agentApproved, 'agentId', a.agentId);
        const fu = find(agentFunded, 'agentId', a.agentId);
        return {
          id: a.agentId,
          name: a.agentName ?? 'Unassigned',
          submitted: a._count._all,
          requestedAmount: n(a._sum.requestedAmount),
          approved: ap?._count._all ?? 0,
          funded: fu?._count._all ?? 0,
          fundedAmount: n(fu?._sum.fundedAmount),
          commission: n(fu?._sum.commissionAmount),
          approvalRate: a._count._all ? (ap?._count._all ?? 0) / a._count._all : null,
          fundingRate: a._count._all ? (fu?._count._all ?? 0) / a._count._all : null,
        };
      })
      .sort((a, b) => b.fundedAmount - a.fundedAmount),
    underwriters: underwriters
      .map((u) => {
        const ap = find(uwApproved, 'underwriterId', u.underwriterId);
        const de = find(uwDeclined, 'underwriterId', u.underwriterId);
        const fu = find(uwFunded, 'underwriterId', u.underwriterId);
        const decisions = (ap?._count._all ?? 0) + (de?._count._all ?? 0);
        return {
          id: u.underwriterId,
          name: u.underwriterName ?? 'Unassigned',
          decisions,
          approved: ap?._count._all ?? 0,
          declined: de?._count._all ?? 0,
          approvedAmount: n(ap?._sum.approvedAmount),
          funded: fu?._count._all ?? 0,
          fundedAmount: n(fu?._sum.fundedAmount),
          approvalRate: decisions ? (ap?._count._all ?? 0) / decisions : null,
        };
      })
      .sort((a, b) => b.decisions - a.decisions),
    scrubbing: scrubbers.map((s) => ({ recommendation: s.scrubberRecommendation, count: s._count._all })),
  };
}

// ---------------------------------------------------------------------------
// Drill-down list
// ---------------------------------------------------------------------------

export interface DrillQuery extends ReportFilters {
  /** Which date the range applies to. */
  dateField?: 'createdAtTenant' | 'approvedAt' | 'fundedAt' | 'declinedAt' | 'contractSentAt' | 'contractSignedAt' | 'none';
  bookId?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAtTenant' | 'fundedAt' | 'approvedAmount' | 'fundedAmount' | 'merchantName' | 'stage' | 'updatedAtTenant';
  sortDir?: 'asc' | 'desc';
}

export async function drillDown(q: DrillQuery) {
  const page = Math.max(1, q.page ?? 1);
  const limit = Math.min(500, Math.max(1, q.limit ?? 50));
  const where = baseWhere(q);
  if (q.bookId) where.bookId = q.bookId;
  if (q.dateField && q.dateField !== 'none') Object.assign(where, inRange(q.dateField, q));
  const names = await bookNames();
  const [total, rows] = await Promise.all([
    prisma.reportApplicationFact.count({ where }),
    prisma.reportApplicationFact.findMany({
      where,
      orderBy: { [q.sortBy ?? 'updatedAtTenant']: q.sortDir ?? 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, bookId: true, applicationUuid: true, applicationNumericId: true, dealId: true, merchantName: true, dealType: true, stage: true, status: true,
        agentName: true, isoName: true, underwriterName: true, requestedAmount: true, approvedAmount: true, fundedAmount: true, commissionAmount: true,
        balanceDue: true, createdAtTenant: true, approvedAt: true, contractSentAt: true, contractSignedAt: true, fundedAt: true, declinedAt: true, updatedAtTenant: true,
      },
    }),
  ]);
  return {
    data: rows.map((r) => ({
      ...r,
      bookCode: names.get(r.bookId)?.code ?? null,
      bookName: names.get(r.bookId)?.name ?? null,
      stageLabel: STAGE_LABELS[(r.stage ?? 'Other') as Stage] ?? r.stage,
      requestedAmount: n(r.requestedAmount),
      approvedAmount: n(r.approvedAmount),
      fundedAmount: n(r.fundedAmount),
      commissionAmount: n(r.commissionAmount),
      balanceDue: n(r.balanceDue),
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Distinct people for filter dropdowns. */
export async function filterOptions(bookIds?: string[]) {
  const where: Prisma.ReportApplicationFactWhereInput = bookIds?.length ? { bookId: { in: bookIds } } : {};
  const [agents, underwriters, stages, dealTypes] = await Promise.all([
    prisma.reportApplicationFact.groupBy({ by: ['agentId', 'agentName'], where: { ...where, agentId: { not: null } }, _count: { _all: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['underwriterId', 'underwriterName'], where: { ...where, underwriterId: { not: null } }, _count: { _all: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['stage'], where, _count: { _all: true } }),
    prisma.reportApplicationFact.groupBy({ by: ['dealType'], where: { ...where, dealType: { not: null } }, _count: { _all: true } }),
  ]);
  return {
    agents: agents.map((a) => ({ id: a.agentId!, name: a.agentName ?? a.agentId!, count: a._count._all })).sort((a, b) => a.name.localeCompare(b.name)),
    underwriters: underwriters.map((u) => ({ id: u.underwriterId!, name: u.underwriterName ?? u.underwriterId!, count: u._count._all })).sort((a, b) => a.name.localeCompare(b.name)),
    stages: stages.map((s) => ({ stage: s.stage, label: STAGE_LABELS[(s.stage ?? 'Other') as Stage] ?? s.stage, count: s._count._all })),
    dealTypes: dealTypes.map((d) => ({ dealType: d.dealType!, count: d._count._all })),
  };
}

export async function syncStatus() {
  const [lastRuns, facts, books, lastEvent] = await Promise.all([
    prisma.reportSyncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
    prisma.reportApplicationFact.count(),
    prisma.reportApplicationFact.groupBy({ by: ['bookId'], _count: { _all: true }, _max: { syncedAt: true } }),
    prisma.reportStageEvent.findFirst({ orderBy: { at: 'desc' }, select: { at: true } }),
  ]);
  const names = await bookNames();
  return {
    facts,
    lastEventAt: lastEvent?.at ?? null,
    books: books.map((b) => ({ bookId: b.bookId, code: names.get(b.bookId)?.code, name: names.get(b.bookId)?.name, facts: b._count._all, lastSyncedAt: b._max.syncedAt })),
    runs: lastRuns.map((r) => ({ ...r, bookCode: r.bookId ? names.get(r.bookId)?.code ?? null : null })),
  };
}
