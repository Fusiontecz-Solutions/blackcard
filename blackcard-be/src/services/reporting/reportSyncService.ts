/**
 * Report data sync (single-tenant book CRM).
 *
 * Reads applications from local Prisma, maps into ReportApplicationFact rows,
 * records stage transitions, and rolls daily snapshots. Runs on a cron and via
 * POST /reports/sync.
 */
import type { Prisma } from '@prisma/client';
import prisma from '../../config/prismaClient';
import { ensureLocalBook, LOCAL_BOOK_ID } from './reportLocalBook';
import { syncPaymentsForBook } from './reportPaymentSyncService';

// ---------------------------------------------------------------------------
// Stage normalisation
// ---------------------------------------------------------------------------

export const STAGES = [
  'New',
  'Agent',
  'Scrubbing',
  'Underwriter',
  'Approved',
  'Contract_Pending',
  'Contracts_Out',
  'Signed_Contracts',
  'Final',
  'Funding_Call',
  'Disbursement',
  'Funded',
  'Declined',
  'On_Hold',
  'Waiting_For_Documents',
  'Deleted',
  'Other',
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  New: 'New',
  Agent: 'Agent',
  Scrubbing: 'Scrubbing',
  Underwriter: 'Underwriter',
  Approved: 'Approved',
  Contract_Pending: 'Contract pending',
  Contracts_Out: 'Contracts out',
  Signed_Contracts: 'Signed contracts',
  Final: 'Final approval',
  Funding_Call: 'Funding call',
  Disbursement: 'Disbursement',
  Funded: 'Funded',
  Declined: 'Declined',
  On_Hold: 'On hold',
  Waiting_For_Documents: 'Waiting for documents',
  Deleted: 'Deleted',
  Other: 'Other',
};

/** Pipeline order used for funnels and "days in stage" (terminal stages last). */
export const PIPELINE_ORDER: Stage[] = [
  'New',
  'Agent',
  'Scrubbing',
  'Underwriter',
  'Approved',
  'Contract_Pending',
  'Contracts_Out',
  'Signed_Contracts',
  'Final',
  'Funding_Call',
  'Disbursement',
  'Funded',
];

export const CONTRACT_STAGES: Stage[] = ['Contract_Pending', 'Contracts_Out', 'Signed_Contracts'];
export const FUNDING_STAGES: Stage[] = ['Final', 'Funding_Call', 'Disbursement'];

function key(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

export function normalizeStage(queue: unknown, state?: unknown, status?: unknown, deletedAt?: unknown): Stage {
  if (deletedAt) return 'Deleted';
  const q = key(queue);
  const s = key(state);
  const st = key(status);
  const any = `${q}|${s}`;

  if (st === 'funded' || /(^|\|)funded/.test(any)) return 'Funded';
  if (/disburs/.test(any)) return 'Disbursement';
  if (/funding call/.test(any)) return 'Funding_Call';
  if (/declin|rejected/.test(any) || st === 'rejected') return 'Declined';
  if (/on hold/.test(q)) return 'On_Hold';
  if (/waiting for doc/.test(q)) return 'Waiting_For_Documents';
  if (/signed/.test(any)) return 'Signed_Contracts';
  if (/contracts? out|contracted/.test(any)) return 'Contracts_Out';
  if (/contract pending|contract_pending/.test(any)) return 'Contract_Pending';
  if (/final/.test(any)) return 'Final';
  if (/approved/.test(q) || st === 'approved') return 'Approved';
  if (/underwrit/.test(q)) return 'Underwriter';
  if (/scrub|review/.test(q)) return 'Scrubbing';
  if (/agent/.test(q)) return 'Agent';
  if (/new|draft|pending|submitted/.test(any) || !q) return 'New';
  return 'Other';
}

// ---------------------------------------------------------------------------
// Tenant row mapping
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function date(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
function obj(v: unknown): Row | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null;
}
function personName(v: unknown): { id: string | null; name: string | null } {
  const o = obj(v);
  if (!o) return { id: str(v), name: null };
  const name = [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || str(o.name) || str(o.email);
  return { id: str(o._id ?? o.id), name: name || null };
}

export interface MappedFact {
  applicationUuid: string;
  data: Omit<Prisma.ReportApplicationFactUncheckedCreateInput, 'bookId' | 'applicationUuid' | 'id'>;
}

export function mapTenantApplication(row: Row): MappedFact | null {
  const uuid = str(row._id ?? row.id);
  if (!uuid) return null;

  const client = obj(row.client);
  const business = client ? obj(client.business) : null;
  const organization = client ? obj(client.organization) : null;
  const merchantName =
    str(row.dealDisplayName) ||
    (business ? str(business.name) : null) ||
    (client ? str(client.businessName) : null) ||
    (organization ? str(organization.name) : null) ||
    (client && obj(client.owner) ? [obj(client.owner)!.firstName, obj(client.owner)!.lastName].filter(Boolean).join(' ') || null : null);

  const agent = personName(row.referringAgent ?? row.referringAgentId);
  const iso = obj(row.iso);
  const underwriter = personName(row.approvedByUnderwriter ?? row.claimedByUnderwriter ?? row.assignedUnderwriter);
  const underwriterId =
    underwriter.id || str(row.approvedByUnderwriterId) || str(row.claimedByUnderwriterId) || str(row.assignedUnderwriterId);

  const offers = Array.isArray(row.termsOffers) ? (row.termsOffers as Row[]) : [];
  const latestOffer = offers[0] ?? null;
  const decision = obj(row.OfferDecision);
  const approvedAmount =
    num(latestOffer?.approvedAmount) ??
    (decision ? num(typeof decision.offer === 'object' ? (obj(decision.offer)?.amount ?? null) : decision.offer) : null);

  const status = str(row.status);
  const stage = normalizeStage(row.currentQueue, row.statsCurrentState ?? row.currentState, status, row.deletedAt);
  const fundedAmount =
    stage === 'Funded' ? (num(row.fundedAmount) ?? approvedAmount ?? num(row.loanAmount)) : num(row.fundedAmount);

  const createdAt = date(row.createdAt);
  const updatedAt = date(row.updatedAt);

  return {
    applicationUuid: uuid,
    data: {
      applicationNumericId: str(row.applicationId),
      dealId: str(row.dealId),
      merchantName,
      dealType: str(row.type),
      priority: str(row.priority),
      agentId: agent.id,
      agentName: agent.name,
      isoId: iso ? str(iso._id ?? iso.id) : str(row.isoId),
      isoName: iso ? str(iso.name) : null,
      salesRep: str(row.salesRepresentative),
      underwriterId,
      underwriterName: underwriter.name || str(row.underwriterCommissionName),
      scrubberRecommendation: str(row.scrubberRecommendation),
      stage,
      state: str(row.statsCurrentState ?? row.currentState),
      status,
      category: str(row.category),
      requestedAmount: num(row.loanAmount ?? row.requestedAmount),
      approvedAmount,
      fundedAmount,
      commissionAmount: num(row.commissionAmount) ?? num(latestOffer?.commissionAmount),
      commissionPct: num(row.commissionPercentage),
      paybackAmount: num(row.collectionPaybackAmount) ?? num(latestOffer?.paybackAmount),
      repaidAmount: num(row.collectionSumOfRepaid),
      balanceDue: num(row.collectionBalanceDue),
      isDuplicate: !!row.isDuplicate,
      needsContractReinitiation: !!row.needsContractReinitiation,
      createdAtTenant: createdAt,
      updatedAtTenant: updatedAt,
      claimedAt: date(row.claimedAt),
      approvedAt: date(row.approvedAt),
      contractSentAt: date(row.contractSentAt ?? row.contractsOutAt),
      contractSignedAt: date(row.contractSignedAt ?? row.signedAt),
      fundedAt: date(row.fundedAt ?? row.disbursedAt),
      declinedAt: date(row.declinedAt ?? row.rejectedAt),
      deletedAtTenant: date(row.deletedAt),
      raw: row as Prisma.InputJsonValue,
      syncedAt: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// Local application listing
// ---------------------------------------------------------------------------

const PAGE_SIZE = Math.min(500, Math.max(50, Number(process.env.REPORT_SYNC_PAGE_SIZE || 200)));
const MAX_PAGES = Math.max(1, Number(process.env.REPORT_SYNC_MAX_PAGES || 300));

const userSelect = { id: true, firstName: true, lastName: true, email: true } as const;

function serializeApp(app: Record<string, unknown>): Row {
  // Prisma returns Dates; mapTenantApplication accepts Date|string via String().
  return JSON.parse(JSON.stringify(app)) as Row;
}

export interface SyncOptions {
  /** Only rows updated at/after this instant (incremental). Omit for a full scan. */
  since?: Date | null;
  trigger?: string;
}

async function* iterateLocalApplications(since: Date | null): AsyncGenerator<Row[]> {
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await prisma.application.findMany({
      where: since ? { updatedAt: { gte: since } } : undefined,
      include: {
        client: true,
        iso: true,
        termsOffers: { orderBy: { createdAt: 'desc' }, take: 3 },
        OfferDecision: true,
        referringAgent: { select: userSelect },
        claimedByUnderwriter: { select: userSelect },
        approvedByUnderwriter: { select: userSelect },
        assignedUnderwriter: { select: userSelect },
      },
      orderBy: { updatedAt: 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    if (!rows.length) return;
    yield rows.map((r) => serializeApp(r as unknown as Record<string, unknown>));
    if (rows.length < PAGE_SIZE) return;
  }
}

// ---------------------------------------------------------------------------
// Upsert + stage events
// ---------------------------------------------------------------------------

type StampKey = 'approvedAt' | 'contractSentAt' | 'contractSignedAt' | 'fundedAt' | 'declinedAt';
const TRANSITION_STAMP: Partial<Record<Stage, StampKey>> = {
  Approved: 'approvedAt',
  Contracts_Out: 'contractSentAt',
  Signed_Contracts: 'contractSignedAt',
  Funded: 'fundedAt',
  Declined: 'declinedAt',
};

async function upsertBatch(bookId: string, rows: Row[], now: Date): Promise<{ upserted: number; events: number }> {
  const mapped = rows.map(mapTenantApplication).filter((m): m is MappedFact => !!m);
  if (!mapped.length) return { upserted: 0, events: 0 };

  const existing = await prisma.reportApplicationFact.findMany({
    where: { bookId, applicationUuid: { in: mapped.map((m) => m.applicationUuid) } },
    select: { applicationUuid: true, stage: true, status: true, approvedAt: true, contractSentAt: true, contractSignedAt: true, fundedAt: true, declinedAt: true },
  });
  const prev = new Map(existing.map((e) => [e.applicationUuid, e]));

  let events = 0;
  const eventRows: Prisma.ReportStageEventCreateManyInput[] = [];

  for (const m of mapped) {
    const before = prev.get(m.applicationUuid);
    const data = { ...m.data };
    const nextStage = data.stage as Stage;

    if (before) {
      if (before.stage !== nextStage || before.status !== data.status) {
        eventRows.push({
          bookId,
          applicationUuid: m.applicationUuid,
          fromStage: before.stage,
          toStage: nextStage,
          fromStatus: before.status,
          toStatus: data.status ?? null,
          at: now,
          source: 'sync',
        });
        // Stamp the transition date when the tenant did not provide one.
        const stampKey = TRANSITION_STAMP[nextStage];
        if (stampKey && !data[stampKey] && !before[stampKey as keyof typeof before]) {
          (data as Record<string, unknown>)[stampKey] = now;
        }
      }
      // Never let a null from the tenant erase a stamp we inferred earlier.
      for (const k of ['approvedAt', 'contractSentAt', 'contractSignedAt', 'fundedAt', 'declinedAt'] as const) {
        if (!data[k] && before[k]) delete (data as Record<string, unknown>)[k];
      }
    } else {
      // First sighting: seed transition stamps from the row itself where sensible.
      const stampKey = TRANSITION_STAMP[nextStage];
      if (stampKey && !data[stampKey]) (data as Record<string, unknown>)[stampKey] = data.updatedAtTenant ?? now;
      eventRows.push({
        bookId,
        applicationUuid: m.applicationUuid,
        fromStage: null,
        toStage: nextStage,
        fromStatus: null,
        toStatus: data.status ?? null,
        at: (data.createdAtTenant as Date | null) ?? now,
        source: 'first_seen',
      });
    }

    await prisma.reportApplicationFact.upsert({
      where: { bookId_applicationUuid: { bookId, applicationUuid: m.applicationUuid } },
      create: { bookId, applicationUuid: m.applicationUuid, ...data },
      update: data,
    });
  }

  if (eventRows.length) {
    await prisma.reportStageEvent.createMany({ data: eventRows });
    events = eventRows.length;
  }
  return { upserted: mapped.length, events };
}

// ---------------------------------------------------------------------------
// Sync orchestration
// ---------------------------------------------------------------------------

let syncInProgress = false;

export async function syncBook(bookId: string = LOCAL_BOOK_ID, opts: SyncOptions = {}) {
  bookId = LOCAL_BOOK_ID;
  const run = await prisma.reportSyncRun.create({
    data: { bookId, trigger: opts.trigger ?? 'manual', status: 'running' },
  });
  const now = new Date();
  let seen = 0;
  let upserted = 0;
  let events = 0;
  try {
    await ensureLocalBook();
    for await (const rows of iterateLocalApplications(opts.since ?? null)) {
      seen += rows.length;
      const r = await upsertBatch(bookId, rows, now);
      upserted += r.upserted;
      events += r.events;
    }
    // Collection payments are best-effort: a tenant without a payments
    // endpoint must not fail the application sync.
    let payments: { seen: number; upserted: number } | { error: string } = { seen: 0, upserted: 0 };
    try {
      payments = await syncPaymentsForBook(bookId, opts.since ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      payments = { error: message };
      console.warn(`[report-sync] payments for book ${bookId} skipped: ${message}`);
    }
    await rollupDailySnapshot(bookId, now);
    await prisma.reportSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        applicationsSeen: seen,
        upserted,
        stageEvents: events,
        error: 'error' in payments ? `payments: ${payments.error}`.slice(0, 1000) : null,
      },
    });
    return { bookId, ok: true, seen, upserted, events, payments };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.reportSyncRun.update({
      where: { id: run.id },
      data: { status: 'failed', finishedAt: new Date(), applicationsSeen: seen, upserted, stageEvents: events, error: message.slice(0, 1000) },
    });
    console.error(`[report-sync] book ${bookId} failed:`, message);
    return { bookId, ok: false, seen, upserted, events, error: message };
  }
}

export async function syncAllBooks(opts: SyncOptions = {}) {
  if (syncInProgress) return { skipped: true as const, reason: 'sync already running' };
  syncInProgress = true;
  try {
    const book = await ensureLocalBook();
    const results = [{ code: book.code, name: book.name, ...(await syncBook(book.id, opts)) }];
    return { skipped: false as const, results, finishedAt: new Date() };
  } finally {
    syncInProgress = false;
  }
}

/** Incremental sync since the last successful run per book (with a safety overlap). */
export async function syncAllBooksIncremental(trigger = 'cron') {
  const last = await prisma.reportSyncRun.findFirst({
    where: { status: 'success', bookId: null },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true },
  });
  const lastBook = await prisma.reportSyncRun.findFirst({
    where: { status: 'success' },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true },
  });
  const ref = last?.finishedAt ?? lastBook?.finishedAt ?? null;
  const since = ref ? new Date(ref.getTime() - 15 * 60 * 1000) : null;
  return syncAllBooks({ since, trigger });
}

export function isSyncRunning(): boolean {
  return syncInProgress;
}

// ---------------------------------------------------------------------------
// Daily snapshot rollup
// ---------------------------------------------------------------------------

function dayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface DailyMetrics {
  byStage: Record<string, { count: number; amount: number }>;
  totals: { applications: number; open: number; funded: number; fundedAmount: number; declined: number; approvedAmount: number; balanceDue: number };
  today: { created: number; approved: number; funded: number; fundedAmount: number; declined: number; contractsSent: number; contractsSigned: number; transitions: number };
}

export async function computeDailyMetrics(bookId: string, day: Date): Promise<DailyMetrics> {
  const start = dayStart(day);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const facts = await prisma.reportApplicationFact.findMany({
    where: { bookId, deletedAtTenant: null },
    select: { stage: true, approvedAmount: true, fundedAmount: true, requestedAmount: true, balanceDue: true, createdAtTenant: true, approvedAt: true, fundedAt: true, declinedAt: true, contractSentAt: true, contractSignedAt: true },
  });
  const byStage: DailyMetrics['byStage'] = {};
  const totals = { applications: 0, open: 0, funded: 0, fundedAmount: 0, declined: 0, approvedAmount: 0, balanceDue: 0 };
  const today = { created: 0, approved: 0, funded: 0, fundedAmount: 0, declined: 0, contractsSent: 0, contractsSigned: 0, transitions: 0 };
  const inDay = (d: Date | null) => !!d && d >= start && d < end;
  for (const f of facts) {
    const stage = f.stage ?? 'Other';
    const amount = Number(f.fundedAmount ?? f.approvedAmount ?? f.requestedAmount ?? 0);
    byStage[stage] = byStage[stage] ?? { count: 0, amount: 0 };
    byStage[stage].count += 1;
    byStage[stage].amount += amount;
    totals.applications += 1;
    if (stage === 'Funded') {
      totals.funded += 1;
      totals.fundedAmount += Number(f.fundedAmount ?? 0);
      totals.balanceDue += Number(f.balanceDue ?? 0);
    } else if (stage === 'Declined') totals.declined += 1;
    else if (stage !== 'Deleted') totals.open += 1;
    totals.approvedAmount += Number(f.approvedAmount ?? 0);
    if (inDay(f.createdAtTenant)) today.created += 1;
    if (inDay(f.approvedAt)) today.approved += 1;
    if (inDay(f.fundedAt)) {
      today.funded += 1;
      today.fundedAmount += Number(f.fundedAmount ?? 0);
    }
    if (inDay(f.declinedAt)) today.declined += 1;
    if (inDay(f.contractSentAt)) today.contractsSent += 1;
    if (inDay(f.contractSignedAt)) today.contractsSigned += 1;
  }
  today.transitions = await prisma.reportStageEvent.count({ where: { bookId, at: { gte: start, lt: end }, source: 'sync' } });
  return { byStage, totals, today };
}

export async function rollupDailySnapshot(bookId: string, day = new Date()) {
  const metrics = await computeDailyMetrics(bookId, day);
  const d = dayStart(day);
  await prisma.reportDailySnapshot.upsert({
    where: { bookId_date: { bookId, date: d } },
    create: { bookId, date: d, metrics: metrics as unknown as Prisma.InputJsonValue },
    update: { metrics: metrics as unknown as Prisma.InputJsonValue },
  });
  return metrics;
}

/** Rebuild snapshots for the last N days from facts (after a backfill or demo seed). */
export async function rebuildSnapshots(days = 120) {
  const books = await prisma.book.findMany({ select: { id: true } });
  const today = dayStart(new Date());
  for (const b of books) {
    for (let i = days; i >= 0; i--) {
      await rollupDailySnapshot(b.id, new Date(today.getTime() - i * 24 * 60 * 60 * 1000));
    }
  }
}
