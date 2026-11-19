import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  CollectionPayment,
  CollectionPaymentSource,
  CollectionPaymentStatus,
  Prisma,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import prisma from '../config/prismaClient';
import {
  applyStrictTransactionFiltering,
  computeDealCollectionsView,
  filterCollectionPaymentsForTransactionsPage,
  alreadyNetDealEconomics,
  feesForOfferDecision,
  balanceDueLikeTransactionsPage,
  filterCollectionPaymentsForApplicationDeal,
  getApprovedOfferAmountForDealBalance,
  getBalancesForApplicationIds,
  sumTotalPaybackOfferTimesRateFromOfferDecisionRows,
  getDealFinancialsForApplication,
  grossRepaidDealEconomicsFromPayments,
  paymentBelongsToApplicationDeal,
  repaidTowardPaybackExcludingSurplus,
  signedAbovePrincipalGap,
} from '../services/collectionPaymentFinancials';
import { processCollectionPaymentUploadJob } from '../services/collectionPaymentUploadIngestService';
import { distributeSyndicatorCreditsForPayments } from '../services/syndicatorRepaymentService';
import { partitionAlreadyImportedPayments } from '../services/collectionPaymentDedupe';
import { parseExcelDate } from '../services/applicationBulkExcelIngestService';
import {
  buildApplicationStatsBucketWhere,
  buildFundedApplicationWhereForPaybackTotals,
} from '../services/applicationStatsBucketWhere';
import {
  extractReturnCodeFromDescription,
  parseTransactionStatusValue,
} from '../utils/achReturnCodeFromDescription';
import { getPreviewSheetDescription } from '../utils/previewSheetDebitCredit';
import { computeCreditDebitTrend } from '../services/paymentDashboardCreditDebitTrend';
import { mergeApplicationWhereWithOrganization, buildOrganizationListFilterWhere } from '../utils/deriveOrganizationFromDealId';
import { dealDetail, portfolioByMerchant, type PortfolioQuery } from '../services/dealPortfolioService';

const STATUS_MAP_TO_DB: Record<string, CollectionPaymentStatus | undefined> = {
  paid: CollectionPaymentStatus.PAID,
  failed: CollectionPaymentStatus.FAILED,
  due_today: CollectionPaymentStatus.DUE_TODAY,
  upcoming: CollectionPaymentStatus.UPCOMING,
  scheduled: CollectionPaymentStatus.SCHEDULED,
  manual: CollectionPaymentStatus.MANUAL,
  waived: CollectionPaymentStatus.WAIVED,
  credit: CollectionPaymentStatus.CREDIT,
  debit: CollectionPaymentStatus.DEBIT,
};

const STATUS_MAP_TO_API: Record<string, string> = {
  [CollectionPaymentStatus.PAID]: 'paid',
  [CollectionPaymentStatus.FAILED]: 'failed',
  [CollectionPaymentStatus.DUE_TODAY]: 'due_today',
  [CollectionPaymentStatus.UPCOMING]: 'upcoming',
  [CollectionPaymentStatus.SCHEDULED]: 'scheduled',
  [CollectionPaymentStatus.MANUAL]: 'manual',
  [CollectionPaymentStatus.WAIVED]: 'waived',
  [CollectionPaymentStatus.CREDIT]: 'credit',
  [CollectionPaymentStatus.DEBIT]: 'debit',
};

// Backward/forward compatibility across environments where enum variants may differ.
const maybeCredit = (CollectionPaymentStatus as unknown as Record<string, string>).CREDIT;
if (maybeCredit) {
  STATUS_MAP_TO_DB.credit = maybeCredit as CollectionPaymentStatus;
  STATUS_MAP_TO_API[maybeCredit] = 'credit';
}
const maybeDebit = (CollectionPaymentStatus as unknown as Record<string, string>).DEBIT;
if (maybeDebit) {
  STATUS_MAP_TO_DB.debit = maybeDebit as CollectionPaymentStatus;
  STATUS_MAP_TO_API[maybeDebit] = 'debit';
}

const normalizeStatusToDb = (status: unknown): CollectionPaymentStatus | null => {
  if (!status) return null;
  const raw = String(status).trim().toLowerCase();
  return STATUS_MAP_TO_DB[raw] ?? null;
};

const mapPaymentToApi = (payment: any) => ({
  ...payment,
  status: STATUS_MAP_TO_API[payment.status as CollectionPaymentStatus] ?? 'scheduled',
  amount: Number(payment.amount ?? 0),
  scheduledDate: payment.scheduledDate ? new Date(payment.scheduledDate).toISOString().slice(0, 10) : null,
  processedDate: payment.processedDate ? new Date(payment.processedDate).toISOString().slice(0, 10) : null,
});

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const toNum = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value != null && typeof value === 'object' && 'toString' in value) {
    const parsed = Number((value as { toString(): string }).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Collections / transactions table: newest first (after strict filtering). */
type CollectionPaymentSortable = {
  id: string;
  scheduledDate: Date;
  Date: Date | null;
  createdAt: Date;
  paymentNumber: number | null;
};

function sortPrismaCollectionPaymentsNewestFirst<T extends CollectionPaymentSortable>(rows: T[]): void {
  rows.sort((a, b) => {
    const at = Math.max(
      new Date(a.scheduledDate).getTime(),
      a.Date != null ? new Date(a.Date).getTime() : 0,
    );
    const bt = Math.max(
      new Date(b.scheduledDate).getTime(),
      b.Date != null ? new Date(b.Date).getTime() : 0,
    );
    if (bt !== at) return bt - at;
    const ac = new Date(a.createdAt).getTime();
    const bc = new Date(b.createdAt).getTime();
    if (bc !== ac) return bc - ac;
    return String(b.id).localeCompare(String(a.id));
  });
}

const parseMoney = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = toNum(value);
  return Number.isFinite(n) ? n : null;
};

const RECOVERED_STATUSES = new Set<CollectionPaymentStatus>([
  CollectionPaymentStatus.PAID,
]);

const OPEN_DUE_STATUSES = new Set<CollectionPaymentStatus>([
  CollectionPaymentStatus.DUE_TODAY,
  CollectionPaymentStatus.UPCOMING,
  CollectionPaymentStatus.SCHEDULED,
]);

const EXCLUDED_FROM_TOTAL_DUES = new Set<CollectionPaymentStatus>([CollectionPaymentStatus.WAIVED]);

const normalizeDealIdToken = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const normalizeHeaderKey = (value: unknown): string =>
  String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Headers whose cells are formatted as calendar dates in preview (Excel serials → YYYY-MM-DD). */
const PREVIEW_DATE_HEADER_KEYS = new Set([
  'date',
  'paymentdate',
  'transactiondate',
  'valuedate',
  'postingdate',
  'effectivedate',
  'settlementdate',
  'cleareddate',
  'scheduleddate',
  'processeddate',
  'returndate',
]);

function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatPreviewCellAsString(header: string, cellValue: unknown): string {
  if (cellValue == null) return '';
  const nk = normalizeHeaderKey(header);
  if (PREVIEW_DATE_HEADER_KEYS.has(nk)) {
    const parsed = parseExcelDate(cellValue);
    if (parsed && !Number.isNaN(parsed.getTime())) return formatLocalYmd(parsed);
  }
  if (cellValue instanceof Date) {
    const parsed = parseExcelDate(cellValue);
    if (parsed && !Number.isNaN(parsed.getTime())) return formatLocalYmd(parsed);
  }
  return String(cellValue);
}

const DEAL_ID_FROM_DESCRIPTION_REGEX = /\b(BA\d+)\b/i;

/**
 * SheetJS: max rows read from the first worksheet (Excel allows >1M; unbounded parse can OOM the API).
 * Every row up to this cap is returned in `previewRows` with full column strings for the preview grid.
 */
const PREVIEW_XLSX_SHEET_ROWS_CAP = 25_000;

const getPreviewRowValue = (rowData: Record<string, unknown>, ...candidates: string[]): unknown => {
  const wanted = new Set(candidates.map((candidate) => normalizeHeaderKey(candidate)));
  for (const [key, value] of Object.entries(rowData ?? {})) {
    if (wanted.has(normalizeHeaderKey(key))) return value;
  }
  return undefined;
};

const hasPreviewCellValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const parsePreviewAmount = (value: unknown): number | null => {
  if (!hasPreviewCellValue(value)) return null;
  const normalized = typeof value === 'string' ? value.replace(/[$,\s]/g, '') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

function formatFailedTxUsd2(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Matches dashboard-style `"$ 12,345.67"` for failed-transactions summary. */
function formatFailedSummaryMoney(n: number): string {
  return `$ ${formatFailedTxUsd2(n)}`;
}

/**
 * Calendar day shown in failed-transaction lists (`YYYY-MM-DD`) — same priority as
 * {@link mapPrismaPaymentToFailedTxRow} `displayDateYmd` so filters match visible dates.
 */
function collectionPaymentDisplayYmd(p: {
  processedDate: Date | null;
  Date: Date | null;
  scheduledDate: Date;
  createdAt: Date;
}): string {
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

type FailedTxDateQuery =
  | { kind: 'none' }
  | { kind: 'exact'; ymd: string }
  | { kind: 'ym'; ym: string }
  | { kind: 'y'; year: number }
  | { kind: 'range'; fromYmd: string; toYmd: string };

function parseIntQueryBounded(raw: unknown, min: number, max: number): number | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * Parses date filter for failed-transactions. Recognized query params (in priority order):
 *   1) `?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` — inclusive range (either side may be omitted)
 *   2) `?date=YYYY-MM-DD` — single calendar day
 *   3) `?year=&month=&day=` — single calendar day (legacy)
 */
function parseFailedTransactionsDateQuery(req: Request): FailedTxDateQuery {
  const fromRaw = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : '';
  const toRaw = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : '';
  const fromOk = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw);
  const toOk = /^\d{4}-\d{2}-\d{2}$/.test(toRaw);
  if (fromOk && toOk) {
    const [lo, hi] = fromRaw <= toRaw ? [fromRaw, toRaw] : [toRaw, fromRaw];
    return { kind: 'range', fromYmd: lo, toYmd: hi };
  }
  if (fromOk) return { kind: 'range', fromYmd: fromRaw, toYmd: fromRaw };
  if (toOk) return { kind: 'range', fromYmd: toRaw, toYmd: toRaw };

  const dateRaw = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return { kind: 'exact', ymd: dateRaw };
  }
  const y = parseIntQueryBounded(req.query.year, 2000, 2100);
  if (y == null) return { kind: 'none' };
  const m = parseIntQueryBounded(req.query.month, 1, 12);
  if (m == null) return { kind: 'y', year: y };
  const d = parseIntQueryBounded(req.query.day, 1, 31);
  if (d == null) return { kind: 'ym', ym: `${y}-${pad2(m)}` };
  return { kind: 'exact', ymd: `${y}-${pad2(m)}-${pad2(d)}` };
}

function paymentMatchesFailedDateQuery(
  p: {
    processedDate: Date | null;
    Date: Date | null;
    scheduledDate: Date;
    createdAt: Date;
  },
  q: FailedTxDateQuery,
): boolean {
  if (q.kind === 'none') return true;
  const ymd = collectionPaymentDisplayYmd(p);
  if (q.kind === 'exact') return ymd === q.ymd;
  if (q.kind === 'ym') return ymd.slice(0, 7) === q.ym;
  if (q.kind === 'range') return ymd >= q.fromYmd && ymd <= q.toYmd;
  return ymd.slice(0, 4) === String(q.year);
}

/** Loads collection payments in chunks of applications (not one giant `IN` list). */
const FAILED_TX_APP_BATCH = 100;
const FAILED_TX_BATCH_CONCURRENCY = 8;
const FAILED_TX_COHORT_CACHE_TTL_MS = 120_000;

const FAILED_TX_PAYMENT_ORDER_BY = [
  { paymentNumber: 'asc' as const },
  { scheduledDate: 'asc' as const },
  { createdAt: 'asc' as const },
];

const FAILED_TX_PAYMENT_SELECT = {
  id: true,
  applicationId: true,
  dealId: true,
  paymentNumber: true,
  scheduledDate: true,
  processedDate: true,
  Date: true,
  amount: true,
  status: true,
  notes: true,
  referenceNumber: true,
  createdAt: true,
  transactionStatus: true,
} satisfies Prisma.CollectionPaymentSelect;

type FailedTxPaymentRow = Prisma.CollectionPaymentGetPayload<{
  select: typeof FAILED_TX_PAYMENT_SELECT;
}>;

const failedTxCohortCache = new Map<
  string,
  { storedAt: number; apps: FailedTxCohortApp[] }
>();

type FailedTxCohortApp = {
  id: string;
  applicationId: number | null;
  dealId: string | null;
  note: string | null;
  client: { businessName: string } | null;
};

type FailedTxRow = {
  id: string;
  amount: number;
  rawAmount: number;
  scheduledDate: string | null;
  processedDate: string | null;
  paymentDate: string | null;
  displayDateYmd: string;
  displayDebit: string;
  notes: string;
  referenceNumber: string | null;
  status: string;
  transactionStatus: string | null;
  createdAt: Date;
};

type FailedTxDealBundle = {
  app: FailedTxCohortApp;
  failedRows: FailedTxRow[];
  failedAmount: number;
};

function buildFailedTxCohortApplicationWhere(
  searchRaw: string,
): Prisma.ApplicationWhereInput | null {
  const fundedWhere = buildApplicationStatsBucketWhere('funded');
  if (!fundedWhere) return null;
  const applicationFilter: Prisma.ApplicationWhereInput = { ...fundedWhere };
  if (searchRaw.length > 0) {
    const searchToken = normalizeDealIdToken(searchRaw);
    applicationFilter.AND = [
      {
        OR: [
          { dealId: { contains: searchRaw, mode: 'insensitive' } },
          {
            note: {
              contains: `[DEAL_ID:${searchRaw}]`,
              mode: 'insensitive',
            },
          },
          { client: { businessName: { contains: searchRaw, mode: 'insensitive' } } },
          ...(searchToken.length > 0
            ? [
                { dealId: { contains: searchToken, mode: 'insensitive' } } as const,
                {
                  note: {
                    contains: `[DEAL_ID:${searchToken}]`,
                    mode: 'insensitive',
                  },
                } as const,
              ]
            : []),
        ],
      },
    ];
  }
  return applicationFilter;
}

function pruneFailedTxCohortCache() {
  const now = Date.now();
  for (const [k, v] of failedTxCohortCache) {
    if (now - v.storedAt > FAILED_TX_COHORT_CACHE_TTL_MS) {
      failedTxCohortCache.delete(k);
    }
  }
}

async function loadFailedTxCohortApps(searchRaw: string): Promise<FailedTxCohortApp[]> {
  pruneFailedTxCohortCache();
  const hit = failedTxCohortCache.get(searchRaw);
  if (hit && Date.now() - hit.storedAt < FAILED_TX_COHORT_CACHE_TTL_MS) {
    return hit.apps;
  }
  const applicationFilter = buildFailedTxCohortApplicationWhere(searchRaw);
  if (!applicationFilter) return [];
  const apps = (await prisma.application.findMany({
    where: applicationFilter,
    select: {
      id: true,
      applicationId: true,
      dealId: true,
      note: true,
      client: { select: { businessName: true } },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  })) as FailedTxCohortApp[];
  failedTxCohortCache.set(searchRaw, { storedAt: Date.now(), apps });
  return apps;
}

function utcDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function utcDayEndInclusive(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999Z`);
}

/** Best-effort SQL date window before strict in-memory pairing (reduces rows read). */
function buildFailedTxPaymentsPrefilter(
  dateQuery: FailedTxDateQuery,
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

function failedTxBatchCacheKey(batchIds: string[], dealIds: string[]): string {
  return `${[...batchIds].sort().join(',')}|${[...dealIds].sort().join(',')}`;
}

/** Deal token on Application — `dealId` column or `[DEAL_ID:…]` in note. */
function resolveFailedTxAppDealId(app: FailedTxCohortApp): string | null {
  const fromCol = String(app.dealId ?? '').trim();
  if (fromCol) return fromCol;
  const markerMatch = String(app.note ?? '').match(/\[DEAL_ID:([^\]]+)\]/i);
  return markerMatch?.[1]?.trim() || null;
}

function paymentMatchesFailedTxApp(
  payment: FailedTxPaymentRow,
  app: FailedTxCohortApp,
): boolean {
  if (payment.applicationId === app.id) return true;
  return paymentBelongsToApplicationDeal(payment, resolveFailedTxAppDealId(app));
}

async function fetchPaymentsForFailedTxBatch(
  batch: FailedTxCohortApp[],
  dateQuery: FailedTxDateQuery,
  paymentCache?: Map<string, FailedTxPaymentRow[]>,
): Promise<FailedTxPaymentRow[]> {
  const batchIds = batch.map((a) => a.id);
  const dealIds = [
    ...new Set(
      batch
        .map((a) => resolveFailedTxAppDealId(a))
        .filter((d): d is string => Boolean(d)),
    ),
  ];
  const cacheKey = failedTxBatchCacheKey(batchIds, dealIds);
  const cached = paymentCache?.get(cacheKey);
  if (cached) return cached;

  const datePrefilter = buildFailedTxPaymentsPrefilter(dateQuery);
  const matchClauses: Prisma.CollectionPaymentWhereInput[] = [
    { applicationId: { in: batchIds } },
  ];
  if (dealIds.length > 0) {
    matchClauses.push({ dealId: { in: dealIds, mode: 'insensitive' } });
  }

  const payments = await prisma.collectionPayment.findMany({
    where: {
      AND: [{ OR: matchClauses }, ...(datePrefilter ? [datePrefilter] : [])],
    },
    select: FAILED_TX_PAYMENT_SELECT,
    orderBy: FAILED_TX_PAYMENT_ORDER_BY,
  });

  paymentCache?.set(cacheKey, payments);
  return payments;
}

function batchToFailedTxBundles(
  batch: FailedTxCohortApp[],
  payments: FailedTxPaymentRow[],
  dateQuery: FailedTxDateQuery,
): FailedTxDealBundle[] {
  const assignedPaymentIds = new Set<string>();

  const bundles: FailedTxDealBundle[] = [];
  for (const app of batch) {
    const group = payments.filter(
      (p) => !assignedPaymentIds.has(p.id) && paymentMatchesFailedTxApp(p, app),
    );
    for (const p of group) assignedPaymentIds.add(p.id);
    const fails = getStrictFailedPaymentsForApp(group, dateQuery);
    if (!fails.length) continue;
    let dealFailedAmount = 0;
    const failedRows: FailedTxRow[] = [];
    for (const p of fails) {
      const row = mapPrismaPaymentToFailedTxRow(p);
      failedRows.push(row);
      dealFailedAmount += row.amount;
    }
    failedRows.sort((a, b) => {
      const da = `${b.processedDate ?? b.paymentDate ?? b.scheduledDate ?? ''}`.localeCompare(
        `${a.processedDate ?? a.paymentDate ?? a.scheduledDate ?? ''}`,
      );
      if (da !== 0) return da;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    bundles.push({
      app,
      failedRows,
      failedAmount: Number(dealFailedAmount.toFixed(2)),
    });
  }
  return bundles;
}

async function processFailedTxBatch(
  batch: FailedTxCohortApp[],
  dateQuery: FailedTxDateQuery,
  paymentCache?: Map<string, FailedTxPaymentRow[]>,
): Promise<FailedTxDealBundle[]> {
  if (!batch.length) return [];
  const payments = await fetchPaymentsForFailedTxBatch(batch, dateQuery, paymentCache);
  return batchToFailedTxBundles(batch, payments, dateQuery);
}

function summarizeFailedTxBundles(bundles: FailedTxDealBundle[]): {
  totalAmount: number;
  totalCount: number;
  dealCount: number;
  totalAmountDisplay: string;
  totalCountDisplay: string;
  dealCountDisplay: string;
} {
  let portfolioTotalAmount = 0;
  let portfolioTotalCount = 0;
  for (const b of bundles) {
    portfolioTotalCount += b.failedRows.length;
    portfolioTotalAmount += b.failedAmount;
  }
  const summaryTotal = Number(portfolioTotalAmount.toFixed(2));
  return {
    totalAmount: summaryTotal,
    totalCount: portfolioTotalCount,
    dealCount: bundles.length,
    totalAmountDisplay: formatFailedSummaryMoney(summaryTotal),
    totalCountDisplay: portfolioTotalCount.toLocaleString('en-US'),
    dealCountDisplay: bundles.length.toLocaleString('en-US'),
  };
}

async function paginateFailedTxDeals(
  cohortApps: FailedTxCohortApp[],
  dateQuery: FailedTxDateQuery,
  page: number,
  pageSize: number,
  paymentCache: Map<string, FailedTxPaymentRow[]>,
): Promise<{ pageBundles: FailedTxDealBundle[]; hasNextPage: boolean }> {
  const skip = Math.max(0, (page - 1) * pageSize);
  const pageBundles: FailedTxDealBundle[] = [];
  let dealIdx = -1;
  let hasNextPage = false;

  for (let i = 0; i < cohortApps.length; i += FAILED_TX_APP_BATCH) {
    const batch = cohortApps.slice(i, i + FAILED_TX_APP_BATCH);
    const bundles = await processFailedTxBatch(batch, dateQuery, paymentCache);
    for (const deal of bundles) {
      dealIdx++;
      if (dealIdx < skip) continue;
      if (pageBundles.length < pageSize) {
        pageBundles.push(deal);
        continue;
      }
      hasNextPage = true;
      return { pageBundles, hasNextPage };
    }
  }
  return { pageBundles, hasNextPage };
}

async function collectAllFailedTxBundlesParallel(
  cohortApps: FailedTxCohortApp[],
  dateQuery: FailedTxDateQuery,
  paymentCache: Map<string, FailedTxPaymentRow[]>,
): Promise<FailedTxDealBundle[]> {
  const batches: FailedTxCohortApp[][] = [];
  for (let i = 0; i < cohortApps.length; i += FAILED_TX_APP_BATCH) {
    batches.push(cohortApps.slice(i, i + FAILED_TX_APP_BATCH));
  }

  const all: FailedTxDealBundle[] = [];
  for (let i = 0; i < batches.length; i += FAILED_TX_BATCH_CONCURRENCY) {
    const chunk = batches.slice(i, i + FAILED_TX_BATCH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((batch) => processFailedTxBatch(batch, dateQuery, paymentCache)),
    );
    for (const bundles of results) {
      all.push(...bundles);
    }
  }
  return all;
}

function getStrictFailedPaymentsForApp(
  payments: FailedTxPaymentRow[],
  dateQuery: FailedTxDateQuery,
): FailedTxPaymentRow[] {
  if (!payments.length) return [];
  const filtered = applyStrictTransactionFiltering(payments);
  const failsAll = filtered.filter((p) => p.status === CollectionPaymentStatus.FAILED);
  return failsAll.filter((p) => paymentMatchesFailedDateQuery(p, dateQuery));
}

function mapPrismaPaymentToFailedTxRow(payment: FailedTxPaymentRow): FailedTxRow {
  const absAmount = Math.abs(toNum(payment.amount));
  const amountFixed = Number(absAmount.toFixed(2));
  const rawFixed = Number(toNum(payment.amount).toFixed(2));
  const scheduledDate = payment.scheduledDate
    ? new Date(payment.scheduledDate).toISOString().slice(0, 10)
    : null;
  const processedDate = payment.processedDate
    ? new Date(payment.processedDate).toISOString().slice(0, 10)
    : null;
  const paymentDate = payment.Date ? new Date(payment.Date).toISOString().slice(0, 10) : null;
  const displayDateYmd = collectionPaymentDisplayYmd(payment);
  const displayDebit = absAmount > 0 ? formatFailedTxUsd2(amountFixed) : '—';
  return {
    id: payment.id,
    amount: amountFixed,
    rawAmount: rawFixed,
    scheduledDate,
    processedDate,
    paymentDate,
    displayDateYmd,
    displayDebit,
    notes: payment.notes ?? '',
    referenceNumber: payment.referenceNumber ?? null,
    status: STATUS_MAP_TO_API[payment.status] ?? 'failed',
    transactionStatus: (() => {
      const stored =
        typeof payment.transactionStatus === 'string' && payment.transactionStatus.trim() !== ''
          ? parseTransactionStatusValue(payment.transactionStatus)
          : null;
      if (stored) return stored;
      return extractReturnCodeFromDescription(payment.notes ?? '');
    })(),
    createdAt: payment.createdAt,
  };
}


function serializeFailedTxDealBundle(
  bundle: FailedTxDealBundle,
  economics?: {
    paybackAmount: number;
    grossRepaidDealEconomics: number;
  } | null,
) {
  const markerMatch = String(bundle.app.note ?? '').match(/\[DEAL_ID:([^\]]+)\]/i);
  const resolvedDealId =
    String(bundle.app.dealId ?? '').trim() || markerMatch?.[1]?.trim() || '';
  const displayDealId =
    resolvedDealId.trim() ||
    `App-${bundle.app.applicationId != null ? String(bundle.app.applicationId) : '—'}`;

  const paybackAmount =
    economics != null && Number.isFinite(economics.paybackAmount)
      ? Number(Number(economics.paybackAmount).toFixed(2))
      : null;
  const balanceDue =
    economics != null && paybackAmount != null
      ? Math.max(
          balanceDueLikeTransactionsPage(
            economics.paybackAmount,
            economics.grossRepaidDealEconomics,
          ),
          0,
        )
      : null;

  return {
    applicationId: bundle.app.id,
    applicationDisplayId: bundle.app.applicationId,
    dealId: resolvedDealId || null,
    displayDealId,
    businessName: bundle.app.client?.businessName ?? '',
    failedAmount: bundle.failedAmount,
    failedCount: bundle.failedRows.length,
    transactions: bundle.failedRows,
    paybackAmount,
    balanceDue,
    paybackAmountDisplay:
      paybackAmount != null ? formatFailedSummaryMoney(paybackAmount) : null,
    balanceDueDisplay: balanceDue != null ? formatFailedSummaryMoney(balanceDue) : null,
  };
}

async function serializeFailedTxDealBundlesWithEconomics(bundles: FailedTxDealBundle[]) {
  const appIds = bundles.map((b) => b.app.id);
  const economicsRows =
    appIds.length > 0 ? await getBalancesForApplicationIds(prisma, appIds) : [];
  const economicsByAppId = new Map(
    economicsRows.map((row) => [row.applicationId, row]),
  );
  return bundles.map((bundle) =>
    serializeFailedTxDealBundle(bundle, economicsByAppId.get(bundle.app.id) ?? null),
  );
}

const FAILED_TX_SUMMARY_TTL_MS = 60_000;

type FailedTxSummaryPayload = {
  success: true;
  summary: {
    totalAmount: number;
    totalCount: number;
    dealCount: number;
    totalAmountDisplay: string;
    totalCountDisplay: string;
    dealCountDisplay: string;
  };
};

const failedTxSummaryCache = new Map<
  string,
  { storedAt: number; payload: FailedTxSummaryPayload }
>();

function buildFailedTxSummaryCacheKey(req: Request): string {
  const searchRaw =
    typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  const year = typeof req.query.year === 'string' ? req.query.year.trim() : '';
  const month = typeof req.query.month === 'string' ? req.query.month.trim() : '';
  const day = typeof req.query.day === 'string' ? req.query.day.trim() : '';
  const fromDate =
    typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : '';
  const toDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : '';
  return JSON.stringify({ searchRaw, date, year, month, day, fromDate, toDate });
}

function pruneExpiredFailedTxSummaryCache() {
  const now = Date.now();
  for (const [k, v] of failedTxSummaryCache) {
    if (now - v.storedAt > FAILED_TX_SUMMARY_TTL_MS) {
      failedTxSummaryCache.delete(k);
    }
  }
}

async function aggregateFailedTransactionsPortfolioSummary(
  cohortApps: FailedTxCohortApp[],
  dateQuery: FailedTxDateQuery,
  paymentCache?: Map<string, FailedTxPaymentRow[]>,
): Promise<{
  totalAmount: number;
  totalCount: number;
  dealCount: number;
  totalAmountDisplay: string;
  totalCountDisplay: string;
  dealCountDisplay: string;
}> {
  const cache = paymentCache ?? new Map<string, FailedTxPaymentRow[]>();
  const bundles = await collectAllFailedTxBundlesParallel(cohortApps, dateQuery, cache);
  return summarizeFailedTxBundles(bundles);
}

type FailedTxSummaryShape = {
  totalAmount: number;
  totalCount: number;
  dealCount: number;
  totalAmountDisplay: string;
  totalCountDisplay: string;
  dealCountDisplay: string;
};

/**
 * Inclusive date window (OR across processedDate / Date / scheduledDate) for the raw-DEBIT
 * summary aggregate. Mirrors {@link buildFailedTxPaymentsPrefilter} but also covers a
 * year-only (`kind: 'y'`) filter.
 */
function buildAllDebitSummaryDateWhere(
  dateQuery: FailedTxDateQuery,
): Prisma.CollectionPaymentWhereInput | undefined {
  if (dateQuery.kind === 'none') return undefined;
  if (dateQuery.kind === 'y') {
    const from = new Date(Date.UTC(dateQuery.year, 0, 1));
    const to = new Date(Date.UTC(dateQuery.year, 11, 31, 23, 59, 59, 999));
    return {
      OR: [
        { processedDate: { gte: from, lte: to } },
        { Date: { gte: from, lte: to } },
        { scheduledDate: { gte: from, lte: to } },
      ],
    };
  }
  return buildFailedTxPaymentsPrefilter(dateQuery);
}

/**
 * `status = DEBIT` filter for the Failed Transactions summary cards — same definition as the
 * dashboard "Failed payment" KPI (all deals, no funded restriction, no strict pairing), plus the
 * optional date window and search (deal id / business name).
 */
function buildAllDebitSummaryWhere(
  searchRaw: string,
  dateQuery: FailedTxDateQuery,
  organizationParam = '',
): Prisma.CollectionPaymentWhereInput {
  const and: Prisma.CollectionPaymentWhereInput[] = [
    { status: CollectionPaymentStatus.DEBIT },
  ];

  const org = organizationParam.trim();
  if (org) {
    and.push({ Application: buildOrganizationListFilterWhere(org) });
  }

  const dateWhere = buildAllDebitSummaryDateWhere(dateQuery);
  if (dateWhere) and.push(dateWhere);

  if (searchRaw.length > 0) {
    const token = normalizeDealIdToken(searchRaw);
    const appOr: Prisma.ApplicationWhereInput[] = [
      { dealId: { contains: searchRaw, mode: 'insensitive' } },
      { note: { contains: `[DEAL_ID:${searchRaw}]`, mode: 'insensitive' } },
      { client: { businessName: { contains: searchRaw, mode: 'insensitive' } } },
    ];
    if (token.length > 0) {
      appOr.push({ dealId: { contains: token, mode: 'insensitive' } });
      appOr.push({ note: { contains: `[DEAL_ID:${token}]`, mode: 'insensitive' } });
    }
    and.push({
      OR: [
        { dealId: { contains: searchRaw, mode: 'insensitive' } },
        ...(token.length > 0
          ? [{ dealId: { contains: token, mode: 'insensitive' } } as const]
          : []),
        { Application: { OR: appOr } },
      ],
    });
  }

  return { AND: and };
}

/**
 * Single source of truth for the Failed Transactions summary cards. Computes total |amount|,
 * transaction count, and affected-deal count directly from `CollectionPayment` rows with
 * `status = DEBIT` — identical to the dashboard "Failed payment" KPI so the two never disagree.
 */
async function aggregateAllDebitSummary(
  searchRaw: string,
  dateQuery: FailedTxDateQuery,
  organizationParam = '',
): Promise<FailedTxSummaryShape> {
  const where = buildAllDebitSummaryWhere(searchRaw, dateQuery, organizationParam);
  const [agg, dealGroups] = await Promise.all([
    prisma.collectionPayment.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.collectionPayment.groupBy({ by: ['applicationId'], where }),
  ]);

  const totalAmount = Number(Math.abs(toNum(agg._sum.amount)).toFixed(2));
  const totalCount = Number(agg._count?._all ?? 0) || 0;
  const dealCount = dealGroups.filter((g) => g.applicationId != null).length;

  return {
    totalAmount,
    totalCount,
    dealCount,
    totalAmountDisplay: formatFailedSummaryMoney(totalAmount),
    totalCountDisplay: totalCount.toLocaleString('en-US'),
    dealCountDisplay: dealCount.toLocaleString('en-US'),
  };
}

async function loadFailedTxAppsByIds(
  appIds: string[],
): Promise<Map<string, FailedTxCohortApp>> {
  if (!appIds.length) return new Map();
  const apps = (await prisma.application.findMany({
    where: { id: { in: appIds } },
    select: {
      id: true,
      applicationId: true,
      dealId: true,
      note: true,
      client: { select: { businessName: true } },
    },
  })) as FailedTxCohortApp[];
  return new Map(apps.map((a) => [a.id, a]));
}

function failedTxRowTimestamp(row: FailedTxRow): number {
  const v = row.processedDate ?? row.paymentDate ?? row.scheduledDate;
  if (!v) return -Infinity;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : -Infinity;
}

function bundleLatestFailedTxTimestamp(bundle: FailedTxDealBundle): number {
  let best = -Infinity;
  for (const tx of bundle.failedRows) {
    const ms = failedTxRowTimestamp(tx);
    if (ms > best) best = ms;
  }
  return best;
}

/** Group raw `status = DEBIT` rows by application for the failed-transactions table. */
function buildFailedTxBundlesFromDebitPayments(
  payments: FailedTxPaymentRow[],
  appsById: Map<string, FailedTxCohortApp>,
): FailedTxDealBundle[] {
  const byAppId = new Map<string, FailedTxPaymentRow[]>();
  for (const payment of payments) {
    const appId = payment.applicationId;
    if (!appId) continue;
    const list = byAppId.get(appId) ?? [];
    list.push(payment);
    byAppId.set(appId, list);
  }

  const bundles: FailedTxDealBundle[] = [];
  for (const [appId, rows] of byAppId) {
    const app =
      appsById.get(appId) ??
      ({
        id: appId,
        applicationId: null,
        dealId: rows[0]?.dealId ?? null,
        note: null,
        client: null,
      } satisfies FailedTxCohortApp);

    let dealFailedAmount = 0;
    const failedRows: FailedTxRow[] = [];
    for (const payment of rows) {
      const row = mapPrismaPaymentToFailedTxRow(payment);
      failedRows.push(row);
      dealFailedAmount += row.amount;
    }
    failedRows.sort((a, b) => {
      const da = `${b.processedDate ?? b.paymentDate ?? b.scheduledDate ?? ''}`.localeCompare(
        `${a.processedDate ?? a.paymentDate ?? a.scheduledDate ?? ''}`,
      );
      if (da !== 0) return da;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    bundles.push({
      app,
      failedRows,
      failedAmount: Number(dealFailedAmount.toFixed(2)),
    });
  }

  bundles.sort((a, b) => bundleLatestFailedTxTimestamp(b) - bundleLatestFailedTxTimestamp(a));
  return bundles;
}

/**
 * Paginate failed-transaction deals from every `CollectionPayment` with `status = DEBIT`
 * (same scope as the dashboard Failed Payment KPI).
 */
async function paginateAllDebitFailedTransactions(
  searchRaw: string,
  dateQuery: FailedTxDateQuery,
  page: number,
  pageSize: number,
): Promise<{ pageBundles: FailedTxDealBundle[]; totalDeals: number }> {
  const where = buildAllDebitSummaryWhere(searchRaw, dateQuery);
  const payments = await prisma.collectionPayment.findMany({
    where,
    select: FAILED_TX_PAYMENT_SELECT,
    orderBy: [
      { processedDate: 'desc' },
      { Date: 'desc' },
      { scheduledDate: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  const appIds = [...new Set(payments.map((p) => p.applicationId).filter(Boolean))] as string[];
  const appsById = await loadFailedTxAppsByIds(appIds);
  const bundles = buildFailedTxBundlesFromDebitPayments(payments, appsById);

  const skip = Math.max(0, (page - 1) * pageSize);
  return {
    pageBundles: bundles.slice(skip, skip + pageSize),
    totalDeals: bundles.length,
  };
}

class CollectionPaymentController {
  private static readonly APPLICATION_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /** Resolve Application rows for GET /collection-payments — UUID, numeric applicationId, or dealId. */
  private async resolveListApplicationScope(params: {
    applicationIdRaw: string;
    dealIdRaw: string;
  }): Promise<Array<{ id: string; applicationId: number; createdAt: Date }>> {
    const dealId = String(params.dealIdRaw ?? '').trim();
    if (dealId) {
      const byDeal = await this.findApplicationsForDealId(dealId);
      if (byDeal.length) return byDeal;
    }

    const applicationIdRaw = String(params.applicationIdRaw ?? '').trim();
    if (!applicationIdRaw) return [];

    if (CollectionPaymentController.APPLICATION_UUID_RE.test(applicationIdRaw)) {
      const byUuid = await prisma.application.findUnique({
        where: { id: applicationIdRaw },
        select: { id: true, applicationId: true, createdAt: true },
      });
      return byUuid ? [byUuid] : [];
    }

    if (/^\d+$/.test(applicationIdRaw)) {
      const num = Number(applicationIdRaw);
      if (Number.isFinite(num) && num > 0) {
        const byDisplay = await prisma.application.findMany({
          where: { applicationId: num },
          select: { id: true, applicationId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
        if (byDisplay.length) return byDisplay;
      }
    }

    const resolvedDealId = await this.resolveDealIdFromQuery({
      applicationIdRaw,
      dealIdRaw: '',
    });
    if (resolvedDealId) {
      return this.findApplicationsForDealId(resolvedDealId);
    }

    return [];
  }

  private async resolveDealIdFromQuery(params: {
    applicationIdRaw: string;
    dealIdRaw: string;
  }): Promise<string | null> {
    const { applicationIdRaw, dealIdRaw } = params;
    if (dealIdRaw) return dealIdRaw;
    if (!applicationIdRaw) return null;

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let byUuid: { dealId: string | null; note: string | null } | null = null;
    if (uuidRe.test(applicationIdRaw)) {
      byUuid = await prisma.application.findUnique({
        where: { id: applicationIdRaw },
        select: { dealId: true, note: true },
      });
    }
    if (byUuid?.dealId?.trim()) return byUuid.dealId.trim();

    const markerMatch = String(byUuid?.note ?? '').match(/\[DEAL_ID:([^\]]+)\]/i);
    if (markerMatch?.[1]?.trim()) return markerMatch[1].trim();

    const byDisplayId =
      Number.isFinite(Number(applicationIdRaw)) && Number(applicationIdRaw) > 0
        ? await prisma.application.findFirst({
            where: { applicationId: Number(applicationIdRaw) },
            select: { dealId: true, note: true },
            orderBy: { createdAt: 'desc' },
          })
        : null;
    if (byDisplayId?.dealId?.trim()) return byDisplayId.dealId.trim();
    const markerFromDisplay = String(byDisplayId?.note ?? '').match(/\[DEAL_ID:([^\]]+)\]/i);
    if (markerFromDisplay?.[1]?.trim()) return markerFromDisplay[1].trim();

    const byDealId = await prisma.application.findFirst({
      where: {
        OR: [
          { dealId: { equals: applicationIdRaw, mode: 'insensitive' } },
          { note: { contains: `[DEAL_ID:${applicationIdRaw}]`, mode: 'insensitive' } },
          { note: { contains: applicationIdRaw, mode: 'insensitive' } },
        ],
      },
      select: { dealId: true, note: true },
      orderBy: { createdAt: 'desc' },
    });
    if (byDealId?.dealId?.trim()) return byDealId.dealId.trim();
    const markerFromDeal = String(byDealId?.note ?? '').match(/\[DEAL_ID:([^\]]+)\]/i);
    if (markerFromDeal?.[1]?.trim()) return markerFromDeal[1].trim();

    // Final fallback for formatting variants (e.g. BA2010 vs BA-2010 vs BA 2010).
    const targetToken = normalizeDealIdToken(applicationIdRaw);
    if (targetToken) {
      const appsForToken = await this.findApplicationsByNormalizedDealIdToken(targetToken);
      const tokenMatch = appsForToken[0];
      if (tokenMatch?.dealId?.trim()) return tokenMatch.dealId.trim();
    }

    return null;
  }

  private async findApplicationsForDealId(
    dealId: string,
  ): Promise<Array<{ id: string; applicationId: number; createdAt: Date }>> {
    const trimmed = String(dealId || '').trim();
    if (!trimmed) return [];
    const marker = `[DEAL_ID:${trimmed}]`;
    return prisma.application.findMany({
      where: {
        OR: [
          { dealId: { equals: trimmed, mode: 'insensitive' } },
          { note: { contains: marker, mode: 'insensitive' } },
          { note: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      select: { id: true, applicationId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Applications whose `dealId` normalizes to `targetToken` (same rules as {@link normalizeDealIdToken}).
   * Avoids `findMany({ dealId: { not: null } })` + in-memory filter, which loaded the entire table at scale.
   */
  private async findApplicationsByNormalizedDealIdToken(
    targetToken: string,
  ): Promise<Array<{ id: string; applicationId: number; createdAt: Date; dealId: string | null }>> {
    const t = String(targetToken ?? '').trim();
    if (!t) return [];
    return prisma.$queryRaw<
      Array<{ id: string; applicationId: number; createdAt: Date; dealId: string | null }>
    >`
      SELECT
        a.id::text AS id,
        a."applicationId" AS "applicationId",
        a."createdAt" AS "createdAt",
        a."dealId" AS "dealId"
      FROM "Application" a
      WHERE a."dealId" IS NOT NULL
      AND regexp_replace(upper(a."dealId"), '[^A-Z0-9]', '', 'g') = ${t}
      ORDER BY a."createdAt" DESC
    `;
  }

  /** Latest application per normalized deal token (for batch upload mapping). */
  private async mapLatestApplicationsByNormalizedDealTokens(
    tokens: string[],
  ): Promise<Map<string, { id: string; dealId: string | null }>> {
    const uniq = Array.from(
      new Set(tokens.map((x) => String(x ?? '').trim()).filter((x) => x.length > 0)),
    );
    const out = new Map<string, { id: string; dealId: string | null }>();
    if (!uniq.length) return out;

    /** Index-friendly path when the stored dealId matches the token (avoids regexp scan on large tables). */
    if (uniq.length === 1) {
      const t = uniq[0]!;
      const direct = await prisma.application.findFirst({
        where: { dealId: { not: null, equals: t, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, dealId: true },
      });
      if (direct?.dealId) {
        const nt = normalizeDealIdToken(direct.dealId);
        if (nt === t) {
          out.set(t, { id: direct.id, dealId: direct.dealId });
          return out;
        }
      }
    }

    const rows = await prisma.$queryRaw<
      Array<{ id: string; dealId: string | null; tok: string }>
    >`
      SELECT
        a.id::text AS id,
        a."dealId" AS "dealId",
        regexp_replace(upper(a."dealId"), '[^A-Z0-9]', '', 'g') AS tok
      FROM "Application" a
      WHERE a."dealId" IS NOT NULL
      AND regexp_replace(upper(a."dealId"), '[^A-Z0-9]', '', 'g') IN (${Prisma.join(uniq)})
      ORDER BY a."createdAt" DESC
    `;

    for (const row of rows) {
      if (!row.tok || out.has(row.tok)) continue;
      out.set(row.tok, { id: row.id, dealId: row.dealId });
    }
    return out;
  }

  /** Pick the application row the CRM detail view refers to (UUID, display id, or latest on deal). */
  private resolveViewApplicationUuid(params: {
    applicationIdQuery: string;
    matchedApps: Array<{ id: string; applicationId: number }>;
  }): string | null {
    const { applicationIdQuery, matchedApps } = params;
    const q = String(applicationIdQuery ?? '').trim();
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (q && uuidRe.test(q)) {
      const hit = matchedApps.find((a) => a.id === q);
      if (hit) return hit.id;
      return q;
    }
    if (q) {
      const num = Number(q);
      if (Number.isFinite(num) && num > 0) {
        const byDisplay = matchedApps.find((a) => a.applicationId === num);
        if (byDisplay) return byDisplay.id;
      }
    }
    return matchedApps[0]?.id ?? null;
  }

  /** Batch Balance Due / repaid totals from DB — used by Payment History funded-deals grid (always fresh). */
  async balancesForApplications(req: Request, res: Response) {
    try {
      const rawList = (req.body as { applicationIds?: unknown })?.applicationIds;
      const ids = Array.isArray(rawList)
        ? rawList.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0)
        : [];
      if (!ids.length) {
        return res.status(400).json({
          success: false,
          message: 'applicationIds must be a non-empty array',
        });
      }
      const max = 400;
      const sliced = ids.slice(0, max);
      const data = await getBalancesForApplicationIds(prisma, sliced);
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('balancesForApplications error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Sum of repaid and balance using strict CREDIT/DEBIT linking rules. Query: `applicationId` (UUID). */
  async financials(req: Request, res: Response) {
    try {
      const applicationId = typeof req.query.applicationId === 'string' ? req.query.applicationId.trim() : '';
      const dealId = typeof req.query.dealId === 'string' ? req.query.dealId.trim() : '';
      if (!applicationId && !dealId) {
        return res
          .status(400)
          .json({ success: false, message: 'applicationId or dealId query parameter is required' });
      }

      const resolvedDealId = await this.resolveDealIdFromQuery({
        applicationIdRaw: applicationId,
        dealIdRaw: dealId,
      });
      if (!resolvedDealId) {
        return res.status(404).json({ success: false, message: 'Application/deal not found' });
      }

      const matchedApps = await this.findApplicationsForDealId(resolvedDealId);
      const latestApp = matchedApps[0];
      if (!latestApp?.id) {
        return res.status(404).json({ success: false, message: 'Application not found for dealId' });
      }

      const data = await getDealFinancialsForApplication(prisma, latestApp.id);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      return res.status(200).json({
        success: true,
        data: {
          dealId: data.dealId,
          sumOfRepaid: Number(data.sumOfRepaid.toFixed(2)),
          balance: Number(data.balance.toFixed(2)),
        },
      });
    } catch (error) {
      console.error('Collection payment financials error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const applicationId = typeof req.query.applicationId === 'string' ? req.query.applicationId.trim() : '';
      const dealId = typeof req.query.dealId === 'string' ? req.query.dealId.trim() : '';
      if (!applicationId && !dealId) {
        return res
          .status(400)
          .json({ success: false, message: 'applicationId or dealId query parameter is required' });
      }

      const matchedApps = await this.resolveListApplicationScope({
        applicationIdRaw: applicationId,
        dealIdRaw: dealId,
      });
      if (!matchedApps.length) {
        return res.status(404).json({ success: false, message: 'Application/deal not found' });
      }

      let matchedIds = matchedApps.map((app) => app.id);
      if (!matchedIds.length && dealId) {
        const targetToken = normalizeDealIdToken(dealId);
        if (targetToken) {
          const tokenMatchedApps =
            await this.findApplicationsByNormalizedDealIdToken(targetToken);
          matchedIds = tokenMatchedApps.map((app) => app.id);
        }
      }
      const payments = await prisma.collectionPayment.findMany({
        where: {
          applicationId: matchedIds.length
            ? { in: matchedIds }
            : applicationId
              ? applicationId
              : undefined,
        },
        orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }, { paymentNumber: 'desc' }],
      });
      const filteredPayments = applyStrictTransactionFiltering(payments);
      sortPrismaCollectionPaymentsNewestFirst(filteredPayments);

      const includeDealView =
        req.query.includeDealView === '1' ||
        String(req.query.includeDealView ?? '').toLowerCase() === 'true';

      let dealView: import('../services/collectionPaymentFinancials').DealCollectionsViewApi | null = null;
      if (includeDealView && matchedApps.length > 0) {
        const viewUuid = this.resolveViewApplicationUuid({
          applicationIdQuery: applicationId,
          matchedApps,
        });
        if (viewUuid) {
          const viewApp = await prisma.application.findUnique({
            where: { id: viewUuid },
            select: {
              id: true,
              applicationId: true,
              dealId: true,
              loanAmount: true,
              commissionAmount: true,
              OfferDecision: true,
              termsOffers: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  approvedAmount: true,
                  factorRate: true,
                  paybackAmount: true,
                  paymentAmount: true,
                  frequency: true,
                  commissionAmount: true,
                },
              },
            },
          });
          if (viewApp) {
            const appDealId = viewApp.dealId ?? null;
            const viewRows = filterCollectionPaymentsForTransactionsPage(filteredPayments, {
              primaryApplicationId: viewApp.id,
              applicationIdDisplay: String(viewApp.applicationId),
              applicationDealId: appDealId,
            });
            const toTerms = viewApp.termsOffers[0];
            dealView = computeDealCollectionsView({
              viewPayments: viewRows,
              application: {
                id: viewApp.id,
                applicationId: viewApp.applicationId,
                dealId: appDealId,
                loanAmount: viewApp.loanAmount,
                commissionAmount: viewApp.commissionAmount,
                OfferDecision: (viewApp.OfferDecision ?? null) as unknown as Record<string, unknown> | null,
                termsOffers: toTerms
                  ? [
                      {
                        approvedAmount: toTerms.approvedAmount,
                        factorRate: toTerms.factorRate,
                        paybackAmount: toTerms.paybackAmount,
                        paymentAmount: toTerms.paymentAmount,
                        frequency: toTerms.frequency,
                        commissionAmount: toTerms.commissionAmount,
                      },
                    ]
                  : [],
              },
            });
          }
        }
      }

      return res.status(200).json({
        success: true,
        data: filteredPayments.map(mapPaymentToApi),
        ...(includeDealView ? { dealView } : {}),
      });
    } catch (error) {
      console.error('List collection payments error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Bulk load for payment dashboard: one DB round-trip instead of N × GET /collection-payments.
   * Applies the same per-application strict transaction filtering as GET list (pairing is per appId).
   */
  async listByApplicationIds(req: Request, res: Response) {
    try {
      const body = (req.body ?? {}) as { applicationIds?: unknown };
      const rawIds = Array.isArray(body.applicationIds) ? body.applicationIds : [];
      const MAX_IDS = 2_000;
      const ids = [
        ...new Set(
          rawIds
            .map((id) => String(id ?? '').trim())
            .filter((id) => id.length > 0),
        ),
      ];
      if (ids.length > MAX_IDS) {
        return res.status(400).json({
          success: false,
          message: `applicationIds must contain at most ${MAX_IDS} ids`,
        });
      }
      if (ids.length === 0) {
        return res.status(200).json({ success: true, data: {} });
      }

      const payments = await prisma.collectionPayment.findMany({
        where: { applicationId: { in: ids } },
        orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }, { paymentNumber: 'desc' }],
      });

      const byApp = new Map<string, typeof payments>();
      for (const p of payments) {
        const list = byApp.get(p.applicationId) ?? [];
        list.push(p);
        byApp.set(p.applicationId, list);
      }

      const data: Record<string, ReturnType<typeof mapPaymentToApi>[]> = {};
      for (const id of ids) {
        const group = byApp.get(id) ?? [];
        const filtered = applyStrictTransactionFiltering(group);
        sortPrismaCollectionPaymentsNewestFirst(filtered);
        data[id] = filtered.map(mapPaymentToApi);
      }

      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Bulk list collection payments error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { applicationId, amount, date, status, note, referenceNumber } = req.body ?? {};
      if (!String(applicationId ?? '').trim() || amount === undefined || !String(date ?? '').trim()) {
        return res.status(400).json({ success: false, message: 'applicationId, amount and date are required' });
      }

      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'amount must be a valid positive number' });
      }

      const parsedDate = new Date(String(date));
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ success: false, message: 'date must be a valid date' });
      }

      const normalizedStatus = normalizeStatusToDb(status) ?? CollectionPaymentStatus.MANUAL;

      const existingApplication = await prisma.application.findUnique({
        where: { id: String(applicationId).trim() },
        select: { id: true },
      });
      if (!existingApplication) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const resolvedDealId = await this.resolveDealIdFromQuery({
        applicationIdRaw: String(applicationId).trim(),
        dealIdRaw: '',
      });

      const lastPayment = await prisma.collectionPayment.findFirst({
        where: { applicationId: String(applicationId).trim() },
        orderBy: { paymentNumber: 'desc' },
        select: { paymentNumber: true },
      });

      const created = await prisma.collectionPayment.create({
        data: {
          applicationId: String(applicationId).trim(),
          dealId: resolvedDealId,
          amount: new Prisma.Decimal(parsedAmount),
          scheduledDate: parsedDate,
          status: normalizedStatus,
          notes: note ? String(note).trim() : '',
          referenceNumber: referenceNumber ? String(referenceNumber).trim() : null,
          source:
            normalizedStatus === CollectionPaymentStatus.MANUAL
              ? CollectionPaymentSource.MANUAL
              : CollectionPaymentSource.SYSTEM,
          paymentNumber: (lastPayment?.paymentNumber ?? 0) + 1,
          createdById: (req as any)?.user?.id ?? null,
        },
      });

      try {
        await distributeSyndicatorCreditsForPayments(prisma, [
          {
            id: created.id,
            applicationId: created.applicationId,
            amount: created.amount,
            status: created.status,
            scheduledDate: created.scheduledDate,
            Date: created.Date,
            notes: created.notes,
          },
        ]);
      } catch (syndicatorErr) {
        console.error('Syndicator distribution after collection payment create:', syndicatorErr);
      }

      return res.status(201).json({
        success: true,
        message: 'Payment created successfully',
        data: mapPaymentToApi(created),
      });
    } catch (error) {
      console.error('Create collection payment error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { amount, date, status, note, referenceNumber } = req.body ?? {};
      const existing = await prisma.collectionPayment.findUnique({ where: { id } });

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      const payload: Prisma.CollectionPaymentUpdateInput = {};

      if (amount !== undefined) {
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
          return res.status(400).json({ success: false, message: 'amount must be a valid positive number' });
        }
        payload.amount = new Prisma.Decimal(parsedAmount);
      }

      if (date !== undefined) {
        const parsedDate = new Date(String(date));
        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({ success: false, message: 'date must be a valid date' });
        }
        payload.scheduledDate = parsedDate;
      }

      if (status !== undefined) {
        const normalizedStatus = normalizeStatusToDb(status);
        if (!normalizedStatus) {
          return res.status(400).json({ success: false, message: 'Invalid payment status' });
        }
        payload.status = normalizedStatus;
      }

      if (note !== undefined) payload.notes = String(note ?? '').trim();
      if (referenceNumber !== undefined) payload.referenceNumber = referenceNumber ? String(referenceNumber).trim() : null;

      const updated = await prisma.collectionPayment.update({
        where: { id },
        data: payload,
      });

      return res.status(200).json({
        success: true,
        message: 'Payment updated successfully',
        data: mapPaymentToApi(updated),
      });
    } catch (error) {
      console.error('Update collection payment error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!String(id ?? '').trim()) {
        return res.status(400).json({ success: false, message: 'Payment id is required' });
      }

      const existing = await prisma.collectionPayment.findUnique({ where: { id } });

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      await prisma.collectionPayment.delete({ where: { id } });

      return res.status(200).json({
        success: true,
        message: 'Payment deleted successfully',
        data: { id },
      });
    } catch (error) {
      console.error('Delete collection payment error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Update Fees (`OfferDecision.fees`) and / or Commission (`Application.commissionAmount`)
   * for the deal shown in the Transactions tab. Accepts either the application UUID / display id
   * or the dealId — resolves to one Application row and writes both fields.
   */
  async updateDealEconomics(req: Request, res: Response) {
    try {
      const body = (req.body ?? {}) as {
        applicationId?: unknown;
        dealId?: unknown;
        feesAmount?: unknown;
        commissionOnDeal?: unknown;
      };

      const applicationIdRaw = String(body.applicationId ?? '').trim();
      const dealIdRaw = String(body.dealId ?? '').trim();
      if (!applicationIdRaw && !dealIdRaw) {
        return res
          .status(400)
          .json({ success: false, message: 'applicationId or dealId is required' });
      }

      const hasFees = body.feesAmount !== undefined && body.feesAmount !== null && body.feesAmount !== '';
      const hasCommission =
        body.commissionOnDeal !== undefined && body.commissionOnDeal !== null && body.commissionOnDeal !== '';
      if (!hasFees && !hasCommission) {
        return res
          .status(400)
          .json({ success: false, message: 'Provide feesAmount and/or commissionOnDeal to update' });
      }

      const feesAmount = hasFees ? parseMoney(body.feesAmount) : null;
      const commissionOnDeal = hasCommission ? parseMoney(body.commissionOnDeal) : null;
      if (hasFees && (feesAmount == null || feesAmount < 0)) {
        return res.status(400).json({ success: false, message: 'feesAmount must be a non-negative number' });
      }
      if (hasCommission && (commissionOnDeal == null || commissionOnDeal < 0)) {
        return res
          .status(400)
          .json({ success: false, message: 'commissionOnDeal must be a non-negative number' });
      }

      // Resolve to a concrete Application UUID. Match the same resolution rules used by GET /collection-payments.
      let appUuid: string | null = null;
      const uuidRe =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
      if (applicationIdRaw && uuidRe.test(applicationIdRaw)) {
        const direct = await prisma.application.findUnique({
          where: { id: applicationIdRaw },
          select: { id: true },
        });
        if (direct) appUuid = direct.id;
      }
      if (!appUuid && applicationIdRaw && /^\d+$/.test(applicationIdRaw)) {
        const byDisplay = await prisma.application.findUnique({
          where: { applicationId: Number(applicationIdRaw) },
          select: { id: true },
        });
        if (byDisplay) appUuid = byDisplay.id;
      }
      if (!appUuid) {
        const resolvedDealId = await this.resolveDealIdFromQuery({
          applicationIdRaw,
          dealIdRaw,
        });
        if (resolvedDealId) {
          const matchedApps = await this.findApplicationsForDealId(resolvedDealId);
          appUuid = this.resolveViewApplicationUuid({
            applicationIdQuery: applicationIdRaw,
            matchedApps,
          });
          if (!appUuid) {
            const targetToken = normalizeDealIdToken(resolvedDealId);
            if (targetToken) {
              const tokenApps = await this.findApplicationsByNormalizedDealIdToken(targetToken);
              appUuid = tokenApps[0]?.id ?? null;
            }
          }
        }
      }

      if (!appUuid) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const updates: Promise<unknown>[] = [];

      if (hasFees) {
        updates.push(
          prisma.offerDecision.upsert({
            where: { applicationId: appUuid },
            update: { fees: new Prisma.Decimal(feesAmount as number) },
            // Persisting fees alone for a brand-new deal: use neutral defaults so required scalars stay non-null.
            create: {
              applicationId: appUuid,
              decision: 'approved',
              fees: new Prisma.Decimal(feesAmount as number),
            },
          }),
        );
      }

      if (hasCommission) {
        updates.push(
          prisma.application.update({
            where: { id: appUuid },
            data: { commissionAmount: commissionOnDeal as number },
          }),
        );
      }

      await Promise.all(updates);

      const updatedApp = await prisma.application.findUnique({
        where: { id: appUuid },
        select: {
          id: true,
          applicationId: true,
          dealId: true,
          commissionAmount: true,
          OfferDecision: { select: { fees: true } },
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Deal economics updated successfully',
        data: {
          applicationId: updatedApp?.id ?? appUuid,
          applicationDisplayId: updatedApp?.applicationId ?? null,
          dealId: updatedApp?.dealId ?? null,
          feesAmount: toNum(updatedApp?.OfferDecision?.fees ?? 0),
          commissionOnDeal: toNum(updatedApp?.commissionAmount ?? 0),
        },
      });
    } catch (error) {
      console.error('Update deal economics error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async uploadTransactions(req: Request, res: Response) {
    try {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        return res.status(400).json({ message: 'File is required' });
      }

      const previewOnlyRaw = (req.body as { previewOnly?: unknown } | undefined)?.previewOnly;
      const previewOnly =
        previewOnlyRaw === true ||
        String(previewOnlyRaw ?? '')
          .trim()
          .toLowerCase() === 'true';
      const queueJobId = randomUUID();
      const safeOriginal = (file.originalname || 'transactions.xlsx').replace(/[^a-zA-Z0-9._-]/g, '_');
      await prisma.collectionPaymentUploadJob.create({
        data: {
          queueJobId,
          fileName: file.originalname || safeOriginal,
          filePath: `BUFFER_ONLY:${queueJobId}-${safeOriginal}`,
          createdById: (req as any)?.user?.id ?? null,
          status: 'PROCESSING',
        },
      });

      // Process in background from in-memory buffer to avoid temp-file ENOENT race conditions.
      setImmediate(() => {
        void (async () => {
          try {
            await prisma.collectionPaymentUploadJob.update({
              where: { queueJobId },
              data: {
                status: 'PROCESSING',
                startedAt: new Date(),
                errorMessage: null,
              },
            });

            await processCollectionPaymentUploadJob(
              {
                queueJobId,
                filePath: `BUFFER_ONLY:${queueJobId}-${safeOriginal}`,
                workbookBuffer: file.buffer,
                previewOnly,
              },
              async (progress) => {
                await prisma.collectionPaymentUploadJob.update({
                  where: { queueJobId },
                  data: {
                    totalRows: progress.totalRows,
                    processedRows: progress.processedRows,
                    successCount: progress.successCount,
                    failedCount: progress.failedCount,
                  },
                });
              },
            );

            const latest = await prisma.collectionPaymentUploadJob.findUnique({
              where: { queueJobId },
              select: { failedCount: true },
            });

            await prisma.collectionPaymentUploadJob.update({
              where: { queueJobId },
              data: {
                status: (latest?.failedCount ?? 0) > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
                completedAt: new Date(),
              },
            });
          } catch (bgErr) {
            console.error('Collection payment upload background processing failed:', {
              queueJobId,
              error: bgErr instanceof Error ? bgErr.message : bgErr,
            });
            await prisma.collectionPaymentUploadJob.update({
              where: { queueJobId },
              data: {
                status: 'FAILED',
                completedAt: new Date(),
                errorMessage: bgErr instanceof Error ? bgErr.message : 'Upload processing failed',
              },
            });
          }
        })();
      });

      return res.status(202).json({
        success: true,
        message: previewOnly
          ? 'Preview accepted. Processing started in background without DB inserts.'
          : 'Upload accepted. Processing started in background.',
        data: {
          jobId: queueJobId,
          status: 'processing',
          previewOnly,
        },
      });
    } catch (error) {
      console.error('Upload transaction excel error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  async previewTransactions(req: Request, res: Response) {
    try {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file?.buffer || !file.originalname) {
        return res.status(400).json({ success: false, message: 'File is required' });
      }

      const fileName = file.originalname.toLowerCase();
      const isSupported =
        fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
      if (!isSupported) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file format. Please upload .xlsx, .xls, or .csv file.',
        });
      }

      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(file.buffer, {
          type: 'buffer',
          raw: true,
          cellDates: false,
          bookVBA: false,
          /** Critical perf: avoid materializing 100k+ rows. */
          sheetRows: PREVIEW_XLSX_SHEET_ROWS_CAP,
        });
      } catch (parseErr) {
        return res.status(400).json({
          success: false,
          message: 'Unable to parse the uploaded file. Please verify the file format.',
          error: parseErr instanceof Error ? parseErr.message : 'Parse failed',
        });
      }

      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return res.status(400).json({ success: false, message: 'Excel file has no sheet.' });
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], {
        defval: null,
        blankrows: false,
      });
      if (!rows.length) {
        return res.status(400).json({ success: false, message: 'Uploaded file is empty.' });
      }

      const firstRow = rows[0] ?? {};
      const descriptionKey = Object.keys(firstRow).find((key) => {
        const normalized = normalizeHeaderKey(key);
        return normalized === 'description' || normalized === 'desc' || normalized === 'narration';
      });

      if (!descriptionKey) {
        return res.status(400).json({
          success: false,
          message: 'Missing required Description column in uploaded file.',
        });
      }

      const excelHeaders = Object.keys(firstRow);

      type LightPreviewRow = {
        rowNumber: number;
        description: string;
        dealId: string | null;
      };

      const duplicateCounts = new Map<string, number>();
      const lightRows: LightPreviewRow[] = [];
      for (let idx = 0; idx < rows.length; idx += 1) {
        const row = rows[idx] ?? {};
        const rowNumber = idx + 2;
        const description = String(row[descriptionKey] ?? '').trim();
        const match = description.match(DEAL_ID_FROM_DESCRIPTION_REGEX);
        const dealToken = match?.[1] ? String(match[1]).toUpperCase() : '';
        const dealId = dealToken || null;
        if (dealToken) {
          duplicateCounts.set(dealToken, (duplicateCounts.get(dealToken) ?? 0) + 1);
        }
        lightRows.push({ rowNumber, description, dealId });
      }

      const duplicateDealIds = Array.from(duplicateCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([dealId]) => dealId);
      const duplicateDealIdSet = new Set(duplicateDealIds);

      const totalRows = lightRows.length;
      const validRows = lightRows.filter((r) => r.dealId).length;
      const invalidRows = totalRows - validRows;

      /** Full `rowData` for every scanned row so the preview grid can list the whole sheet (within the row cap). */
      const previewRowsBase = lightRows.map((meta) => {
        const row = rows[meta.rowNumber - 2] ?? {};
        const rowData = excelHeaders.reduce<Record<string, string>>((acc, header) => {
          const cellValue = row[header];
          if (cellValue == null) {
            acc[header] = '';
            return acc;
          }
          acc[header] = formatPreviewCellAsString(header, cellValue);
          return acc;
        }, {});
        return {
          rowNumber: meta.rowNumber,
          description: meta.description,
          dealId: meta.dealId,
          isValid: Boolean(meta.dealId),
          validationStatus: meta.dealId ? ('valid' as const) : ('invalid' as const),
          isDuplicate: Boolean(meta.dealId && duplicateDealIdSet.has(meta.dealId)),
          rowData,
        };
      });

      const previewRows = previewRowsBase.map((row) => {
        const description = getPreviewSheetDescription(row.rowData, row.description);
        const transactionStatus = extractReturnCodeFromDescription(description);
        return {
          ...row,
          transactionStatus: transactionStatus ?? null,
        };
      });

      const sheetRowCapHit = rows.length >= PREVIEW_XLSX_SHEET_ROWS_CAP;

      return res.status(200).json({
        success: true,
        data: {
          regex: DEAL_ID_FROM_DESCRIPTION_REGEX.source,
          excelHeaders,
          totalRows,
          validRows,
          invalidRows,
          duplicateDealIds,
          sheetRowCapHit,
          previewRows,
        },
      });
    } catch (error) {
      console.error('Preview transaction excel error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async commitPreviewTransactions(req: Request, res: Response) {
    try {
      const body = (req.body ?? {}) as {
        transactions?: Array<{
          rowNumber?: unknown;
          dealId?: unknown;
          description?: unknown;
          transactionStatus?: unknown;
          rowData?: Record<string, unknown>;
        }>;
      };
      const transactions = Array.isArray(body.transactions) ? body.transactions : [];
      if (!transactions.length) {
        return res.status(400).json({ success: false, message: 'No transactions provided for commit.' });
      }

      const dealTokens = Array.from(
        new Set(
          transactions
            .map((row) => normalizeDealIdToken(row.dealId))
            .filter((token) => token.length > 0),
        ),
      );
      if (!dealTokens.length) {
        return res.status(400).json({ success: false, message: 'Mapped Deal ID is required for save.' });
      }

      const appByDealToken = await this.mapLatestApplicationsByNormalizedDealTokens(dealTokens);

      const preparedRows: Prisma.CollectionPaymentCreateManyInput[] = [];
      const preparedMeta: Array<{ rowNumber: number; dealId: string }> = [];
      const failedRows: Array<{ rowNumber: number; dealId: string; reason: string }> = [];

      transactions.forEach((tx, idx) => {
        const rowNumber =
          typeof tx.rowNumber === 'number' && Number.isFinite(tx.rowNumber) ? tx.rowNumber : idx + 1;
        const mappedDealId = normalizeDealIdToken(tx.dealId);
        if (!mappedDealId) {
          failedRows.push({ rowNumber, dealId: '', reason: 'Deal ID is missing.' });
          return;
        }

        const app = appByDealToken.get(mappedDealId);
        if (!app?.id) {
          failedRows.push({ rowNumber, dealId: mappedDealId, reason: 'No application found for selected Deal ID.' });
          return;
        }

        const rowData = tx.rowData && typeof tx.rowData === 'object' ? tx.rowData : {};
        const amountFromAmount = parsePreviewAmount(getPreviewRowValue(rowData, 'Amount'));
        const creditAmount = parsePreviewAmount(getPreviewRowValue(rowData, 'Credit'));
        const debitAmount = parsePreviewAmount(getPreviewRowValue(rowData, 'Debit'));
        const amount = amountFromAmount ?? creditAmount ?? debitAmount ?? 0;
        const statusRaw = String(getPreviewRowValue(rowData, 'Status', 'Payment Status') ?? '')
          .trim()
          .toLowerCase();
        const hasCredit = hasPreviewCellValue(getPreviewRowValue(rowData, 'Credit'));
        const hasDebit = hasPreviewCellValue(getPreviewRowValue(rowData, 'Debit'));
        const status = hasCredit
          ? CollectionPaymentStatus.CREDIT
          : hasDebit
            ? CollectionPaymentStatus.DEBIT
            : statusRaw === 'debit' || statusRaw === 'failed'
              ? CollectionPaymentStatus.DEBIT
              : statusRaw === 'paid'
                ? CollectionPaymentStatus.PAID
                : statusRaw === 'manual'
                  ? CollectionPaymentStatus.MANUAL
                  : CollectionPaymentStatus.CREDIT;
        const dateRaw = getPreviewRowValue(
          rowData,
          'Date',
          'Payment Date',
          'Transaction Date',
          'Value Date',
          'Posting Date',
        );
        const date = (() => {
          if (!hasPreviewCellValue(dateRaw)) return new Date();
          const parsed = parseExcelDate(dateRaw);
          return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
        })();
        const description = String(
          getPreviewRowValue(rowData, 'Description', 'Notes', 'Note', 'Remarks') ??
            tx.description ??
            '',
        ).trim();

        const transactionStatus =
          parseTransactionStatusValue(tx.transactionStatus) ??
          extractReturnCodeFromDescription(description);

        preparedRows.push({
          applicationId: app.id,
          dealId: app.dealId?.trim() || mappedDealId,
          amount: new Prisma.Decimal(amount),
          Date: date,
          scheduledDate: date,
          status,
          source: CollectionPaymentSource.MANUAL,
          notes: description,
          ...(transactionStatus ? { transactionStatus } : {}),
        });
        preparedMeta.push({ rowNumber, dealId: mappedDealId });
      });

      if (!preparedRows.length) {
        return res.status(400).json({
          success: false,
          message: 'No valid transactions to save.',
          data: {
            savedCount: 0,
            failedCount: failedRows.length,
            failedRows,
          },
        });
      }

      // Idempotency: transactions already stored (same deal, date, amount, status, description)
      // are skipped so a re-upload never double-counts repayments or syndicator allocations.
      const { freshIndices, duplicateIndices } = await partitionAlreadyImportedPayments(prisma, preparedRows);
      const duplicateRows = duplicateIndices.map((i) => ({
        ...preparedMeta[i]!,
        reason: 'Already imported — duplicate transaction skipped.',
      }));
      const freshRows = freshIndices.map((i) => preparedRows[i]!);
      const freshMeta = freshIndices.map((i) => preparedMeta[i]!);

      let savedCount = 0;
      const savedRowsForSyndicator: Prisma.CollectionPaymentCreateManyInput[] = [];
      try {
        if (freshRows.length) {
          await prisma.collectionPayment.createMany({ data: freshRows });
          savedCount = freshRows.length;
          savedRowsForSyndicator.push(...freshRows);
        }
      } catch (bulkErr) {
        for (let i = 0; i < freshRows.length; i += 1) {
          try {
            await prisma.collectionPayment.create({ data: freshRows[i]! });
            savedCount += 1;
            savedRowsForSyndicator.push(freshRows[i]!);
          } catch (rowErr) {
            failedRows.push({
              ...freshMeta[i]!,
              reason: rowErr instanceof Error ? rowErr.message : 'Insert failed',
            });
          }
        }
      }

      if (savedRowsForSyndicator.length) {
        try {
          await distributeSyndicatorCreditsForPayments(prisma, savedRowsForSyndicator);
        } catch (syndicatorErr) {
          console.error('Syndicator distribution after preview commit:', syndicatorErr);
        }
      }

      return res.status(200).json({
        success: true,
        message:
          savedCount > 0
            ? 'Verified transactions saved successfully.'
            : duplicateRows.length
              ? 'All transactions were already imported.'
              : 'No transactions were saved.',
        data: {
          savedCount,
          failedCount: failedRows.length,
          failedRows,
          duplicateCount: duplicateRows.length,
          duplicateRows,
        },
      });
    } catch (error) {
      console.error('Commit preview transactions error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async uploadTransactionsStatus(req: Request, res: Response) {
    try {
      const jobId = String(req.params.jobId || '').trim();
      if (!jobId) {
        return res.status(400).json({ success: false, message: 'jobId is required' });
      }

      const job = await prisma.collectionPaymentUploadJob.findUnique({
        where: { queueJobId: jobId },
        select: {
          queueJobId: true,
          totalRows: true,
          processedRows: true,
          successCount: true,
          failedCount: true,
          status: true,
          failedRows: true,
          errorMessage: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          fileName: true,
        },
      });

      if (!job) {
        return res.status(404).json({ success: false, message: 'Upload job not found' });
      }

      return res.status(200).json({
        success: true,
        data: {
          jobId: job.queueJobId,
          fileName: job.fileName,
          totalRows: job.totalRows,
          processedRows: job.processedRows,
          successCount: job.successCount,
          failedCount: job.failedCount,
          status: String(job.status).toLowerCase(),
          failedRows: job.failedRows ?? [],
          errorMessage: job.errorMessage,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        },
      });
    } catch (error) {
      console.error('Collection payment upload status error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Paginated failed deals. Loads collection payments in **batches of applications**
   * (see `FAILED_TX_APP_BATCH`) instead of one query for the entire cohort. Iteration stops
   * once the requested page is filled plus one deal to detect `hasNextPage`.
   *
   * Uses the same strict filtering rules as the payment dashboard (see
   * {@link applyStrictTransactionFiltering}).
   *
   * Query: `search`, `page` (1-based), `pageSize` (default 10, max 50), date params as documented
   * on {@link parseFailedTransactionsDateQuery}.
   *
   * Pass `includeSummary=1` to return portfolio KPI cards in the same response (page 1 loads faster).
   * Pagination uses `hasNextPage` / `hasPreviousPage` when `total` is unknown without a full scan.
   */
  async failedTransactions(req: Request, res: Response) {
    try {
      const searchRaw =
        typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const pageRaw = Number(req.query.page ?? 1);
      const pageSizeRaw = Number(req.query.pageSize ?? 10);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
      const pageSize =
        Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
          ? Math.min(Math.max(Math.floor(pageSizeRaw), 1), 50)
          : 10;
      const includeSummary =
        req.query.includeSummary === '1' || req.query.includeSummary === 'true';

      const dateQuery = parseFailedTransactionsDateQuery(req);

      const [{ pageBundles, totalDeals }, summary] = await Promise.all([
        paginateAllDebitFailedTransactions(searchRaw, dateQuery, page, pageSize),
        includeSummary
          ? aggregateAllDebitSummary(searchRaw, dateQuery)
          : Promise.resolve(null),
      ]);

      const data = await serializeFailedTxDealBundlesWithEconomics(pageBundles);
      const totalPages = totalDeals > 0 ? Math.ceil(totalDeals / pageSize) : 0;

      return res.status(200).json({
        success: true,
        data,
        summary,
        pagination: {
          page,
          pageSize,
          total: totalDeals,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      });
    } catch (error) {
      console.error('Failed transactions list error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Portfolio-wide failed payment totals for dashboard cards. Same `search` / date query params as
   * {@link failedTransactions}; walks the cohort in batched payment queries.
   */
  async failedTransactionsSummary(req: Request, res: Response) {
    try {
      const cacheKey = buildFailedTxSummaryCacheKey(req);
      pruneExpiredFailedTxSummaryCache();
      const hit = failedTxSummaryCache.get(cacheKey);
      if (hit && Date.now() - hit.storedAt < FAILED_TX_SUMMARY_TTL_MS) {
        return res.status(200).json(hit.payload);
      }

      const searchRaw =
        typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const dateQuery = parseFailedTransactionsDateQuery(req);

      const summary = await aggregateAllDebitSummary(searchRaw, dateQuery);
      const payload: FailedTxSummaryPayload = { success: true, summary };

      failedTxSummaryCache.set(cacheKey, { storedAt: Date.now(), payload });
      return res.status(200).json(payload);
    } catch (error) {
      console.error('Failed transactions summary error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async financialOverviewSummary(req: Request, res: Response) {
    try {
      const { buildPaymentFinancialOverviewSummary } = await import(
        '../services/paymentFinancialOverviewService'
      );
      const chartYear = Number(req.query.chartYear);
      const chartMonthRaw = req.query.chartMonth;
      const organization = String(req.query.organization ?? '').trim() || undefined;
      const data = await buildPaymentFinancialOverviewSummary(
        Number.isFinite(chartYear) ? chartYear : undefined,
        chartMonthRaw === 'all'
          ? 'all'
          : chartMonthRaw != null && String(chartMonthRaw).trim() !== ''
            ? Number(chartMonthRaw)
            : undefined,
        organization,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Collection payment financial overview summary error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Debit vs credit trend for the payment dashboard chart — scoped by view/year/month.
   * Loads only collection rows in the relevant date window (not the full portfolio).
   */
  async creditDebitTrend(req: Request, res: Response) {
    try {
      const result = await computeCreditDebitTrend(req.query as Record<string, unknown>);
      if (!result) {
        return res.status(400).json({
          success: false,
          message: 'Invalid query: view (monthly|weekly|monthlyInYear|yearly), year, optional month (0-11 or all)',
        });
      }
      return res.status(200).json({
        success: true,
        data: {
          points: result.points,
          yearOptions: result.yearOptions,
        },
      });
    } catch (error) {
      console.error('Credit/debit trend error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async dashboard(req: Request, res: Response) {
    try {
      const organizationParam = String(req.query.organization ?? '').trim();
      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const next7End = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
      /** Same cohort as Payment History `/applications?statsBucket=funded` (queue-led only — see `applicationStatsBucketWhere`). */
      const fundedDashboardWhereRaw = buildApplicationStatsBucketWhere('funded');
      if (!fundedDashboardWhereRaw) {
        return res.status(500).json({ success: false, message: 'Dashboard funded scope unavailable' });
      }
      const fundedDashboardWhere = mergeApplicationWhereWithOrganization(
        fundedDashboardWhereRaw,
        organizationParam,
      );
      const disbursementApps = await prisma.application.findMany({
        where: fundedDashboardWhere,
        select: {
          id: true,
          applicationId: true,
          updatedAt: true,
          loanAmount: true,
          dealId: true,
          commissionAmount: true,
          termsOffers: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              approvedAmount: true,
              factorRate: true,
              paybackAmount: true,
              commissionAmount: true,
            },
          },
          OfferDecision: {
            select: {
              offer: true,
              decision: true,
              rate: true,
              fees: true,
              totalRemit: true,
              refinanceAmount: true,
            },
          },
        },
      });

      /** Σ(`OfferDecision.offer` × `OfferDecision.rate`) for funded queue or Funded state — Total Payback card. */
      const appsForPaybackPortfolioTotal = await prisma.application.findMany({
        where: mergeApplicationWhereWithOrganization(
          buildFundedApplicationWhereForPaybackTotals(),
          organizationParam,
        ),
        select: {
          id: true,
          dealId: true,
          OfferDecision: {
            select: {
              offer: true,
              decision: true,
              rate: true,
            },
          },
        },
      });
      const totalPayback = sumTotalPaybackOfferTimesRateFromOfferDecisionRows(appsForPaybackPortfolioTotal);

      const appIds = disbursementApps.map((app) => app.id);
      const failedPaymentSummary = await aggregateAllDebitSummary(
        '',
        { kind: 'none' },
        organizationParam,
      );
      /** Due-today / next-7 only — avoids loading the full payment history for KPI cards. */
      const duesPayments = appIds.length
        ? await prisma.collectionPayment.findMany({
            where: {
              applicationId: { in: appIds },
              OR: [
                { status: CollectionPaymentStatus.DUE_TODAY },
                { status: { in: Array.from(OPEN_DUE_STATUSES) } },
              ],
            },
            select: {
              id: true,
              applicationId: true,
              dealId: true,
              amount: true,
              status: true,
              scheduledDate: true,
            },
          })
        : [];

      const dealIdByApplicationIdDashboard = new Map(
        disbursementApps.map((a) => [a.id, a.dealId]),
      );
      const paymentsForDueCards = duesPayments.filter((p) =>
        paymentBelongsToApplicationDeal(p, dealIdByApplicationIdDashboard.get(p.applicationId)),
      );

      let dueToday = 0;
      let dueNext7Days = 0;
      let totalDues = 0;
      let recovered = 0;
      let defaults = 0;

      for (const payment of paymentsForDueCards) {
        const amount = toNum(payment.amount);
        const date = payment.scheduledDate ? new Date(payment.scheduledDate) : null;
        const status = payment.status;

        // Due today follows schedule semantics first (status-based),
        // and falls back to date only for still-open statuses.
        if (status === CollectionPaymentStatus.DUE_TODAY) {
          dueToday += amount;
        } else if (
          OPEN_DUE_STATUSES.has(status) &&
          date &&
          date >= todayStart &&
          date <= todayEnd
        ) {
          dueToday += amount;
        }

        // Next 7 days includes only open scheduled items and excludes today's dues.
        if (OPEN_DUE_STATUSES.has(status) && date && date > todayEnd && date <= next7End) {
          dueNext7Days += amount;
        }

        if (!EXCLUDED_FROM_TOTAL_DUES.has(status)) {
          // Keep for legacy cards if needed; overridden below with financials-based total.
          totalDues += amount;
        }

        if (RECOVERED_STATUSES.has(status)) {
          // Keep for legacy cards if needed; overridden below with financials-based total.
          recovered += amount;
        }
      }

      // Recovered Amount + Total Dues: single source of truth as funded list/embed — sum per-deal from DB (`getBalancesForApplicationIds`).
      const dealFinancialRows =
        appIds.length > 0 ? await getBalancesForApplicationIds(prisma, appIds) : [];
      const dealFinancialByAppId = new Map(
        dealFinancialRows.map((r) => [r.applicationId, r]),
      );
      recovered = dealFinancialRows.reduce(
        (sum, row) =>
          sum +
          repaidTowardPaybackExcludingSurplus(
            row.grossRepaidDealEconomics,
            row.paybackAmount,
          ),
        0,
      );
      /** Same “payback remaining” as `Transactions.tsx` (gross repaid economics, not strict pairing balance). */
      totalDues = dealFinancialRows.reduce(
        (sum, row) =>
          sum +
          Math.max(
            balanceDueLikeTransactionsPage(row.paybackAmount, row.grossRepaidDealEconomics),
            0,
          ),
        0,
      );
      defaults = failedPaymentSummary.totalAmount;
      const failedPaymentDebitCount = failedPaymentSummary.totalCount;
      const failedPaymentDebitTotal = failedPaymentSummary.totalAmount;

      // Portfolio: funded + net funding; Above Principal = Σ signed gaps = Σ(positive) − Σ(|negative|) (same as Payment History StatCard).
      let fundedPortfolioTotal = 0;
      let netFundingPortfolioTotal = 0;
      let abovePrincipalPositiveSum = 0;
      let abovePrincipalNegativeMagSum = 0;
      let dealsWithPositiveGap = 0;
      let dealsWithNegativeGap = 0;
      let dealsWithZeroGap = 0;
      const zeroGapDealsPayload: Array<{ dealId: string; gapAmount: number }> = [];
      const GAP_CLASSIFY_EPS = 1e-6;
      for (const app of disbursementApps) {
        const advanceNum = Math.max(getApprovedOfferAmountForDealBalance(app), 0);
        const od = app.OfferDecision ?? null;
        const feesAmount = feesForOfferDecision(od);
        const refinanceAmount = toNum(od?.refinanceAmount);
        const latestTermsOffer = app.termsOffers?.[0];
        const commissionOnDeal =
          parseMoney(app.commissionAmount) ?? parseMoney(latestTermsOffer?.commissionAmount) ?? 0;

        const netFundingNum = Math.max(
          0,
          advanceNum - feesAmount - refinanceAmount,
        );
        const alreadyNetNum = alreadyNetDealEconomics(
          advanceNum,
          feesAmount,
          commissionOnDeal,
        );

        const bal = dealFinancialByAppId.get(app.id);
        const grossRepaid = bal?.grossRepaidDealEconomics ?? 0;
        const paybackAmt = bal?.paybackAmount ?? 0;
        const repaidCapped = repaidTowardPaybackExcludingSurplus(grossRepaid, paybackAmt);
        const gap = signedAbovePrincipalGap(repaidCapped, alreadyNetNum);
        if (gap > GAP_CLASSIFY_EPS) {
          abovePrincipalPositiveSum += gap;
          dealsWithPositiveGap += 1;
        } else if (gap < -GAP_CLASSIFY_EPS) {
          abovePrincipalNegativeMagSum += -gap;
          dealsWithNegativeGap += 1;
        } else {
          dealsWithZeroGap += 1;
          const dealLabel = String(app.dealId ?? '').trim();
          zeroGapDealsPayload.push({
            dealId: dealLabel.length > 0 ? dealLabel : String(app.applicationId),
            gapAmount: Number(gap.toFixed(2)),
          });
        }

        fundedPortfolioTotal += advanceNum;
        netFundingPortfolioTotal += netFundingNum;
      }
      const abovePrincipalNet =
        abovePrincipalPositiveSum - abovePrincipalNegativeMagSum;

      const collectionEfficiency = totalDues > 0 ? Number(((recovered / totalDues) * 100).toFixed(1)) : 0;

      return res.status(200).json({
        success: true,
        data: {
          cards: {
            dueToday: Number(dueToday.toFixed(2)),
            dueNext7Days: Number(dueNext7Days.toFixed(2)),
            totalDues: Number(totalDues.toFixed(2)),
            totalPayback: Number(totalPayback.toFixed(2)),
            recovered: Number(recovered.toFixed(2)),
            defaults: Number(defaults.toFixed(2)),
            // Failed Payment KPI: total |amount| + count of CollectionPayment rows with status = DEBIT.
            failedPayment: {
              totalAmount: Number(failedPaymentDebitTotal.toFixed(2)),
              count: failedPaymentDebitCount,
            },
            totalDeals: disbursementApps.length,
            activeDeals: disbursementApps.length,
            collectionEfficiency,
            fundedTotal: Number(fundedPortfolioTotal.toFixed(2)),
            netFundingTotal: Number(netFundingPortfolioTotal.toFixed(2)),
            abovePrincipalTotal: Number(abovePrincipalNet.toFixed(2)),
            abovePrincipalPositiveSum: Number(abovePrincipalPositiveSum.toFixed(2)),
            abovePrincipalNegativeSum: Number(abovePrincipalNegativeMagSum.toFixed(2)),
            dealsWithPositiveGap,
            dealsWithNegativeGap,
            dealsWithZeroGap,
            zeroGapDeals: zeroGapDealsPayload,
          },
          moneyFlow: {
            monthly: [],
            weekly: [],
            yearly: [],
          },
        },
      });
    } catch (error) {
      console.error('Collection payment dashboard error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** All Deals "By merchant" portfolio. */
  async portfolioMerchants(req: Request, res: Response) {
    try {
      const q = req.query;
      const statuses: PortfolioQuery['status'][] = ['all', 'active', 'paid_off', 'attention', 'multi'];
      const sorts: PortfolioQuery['sortBy'][] = [
        'balance', 'funded', 'repaid', 'name', 'pctPaid', 'deals', 'lastFunded',
      ];
      const status = statuses.includes(q.status as PortfolioQuery['status'])
        ? (q.status as PortfolioQuery['status']) : 'all';
      const sortBy = sorts.includes(q.sortBy as PortfolioQuery['sortBy'])
        ? (q.sortBy as PortfolioQuery['sortBy']) : 'balance';
      const skipCache =
        String(q.refresh ?? q.fresh ?? '').trim() === '1' ||
        String(req.headers['cache-control'] ?? '').includes('no-cache');
      const data = await portfolioByMerchant({
        organization: String(q.organization ?? '').trim() || undefined,
        search: String(q.search ?? '').trim() || undefined,
        status,
        sortBy,
        sortDir: q.sortDir === 'asc' ? 'asc' : 'desc',
        page: Number(q.page) || 1,
        limit: Number(q.limit) || 25,
        skipCache,
      });
      res.setHeader('Cache-Control', skipCache ? 'no-store' : 'private, max-age=20');
      return res.status(200).json({ success: true, ...data });
    } catch (error) {
      console.error('Collection payment portfolio merchants error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Deal hero / sidebar for /payments/:deal. */
  async portfolioDeal(req: Request, res: Response) {
    try {
      const ref = String(req.params.ref ?? '').trim();
      if (!ref) {
        return res.status(400).json({ success: false, message: 'Deal reference is required' });
      }
      const organization = String(req.query.organization ?? '').trim() || undefined;
      const skipCache =
        String(req.query.refresh ?? req.query.fresh ?? '').trim() === '1' ||
        String(req.headers['cache-control'] ?? '').includes('no-cache');
      const data = await dealDetail(ref, { organization, skipCache });
      if (!data) {
        return res.status(404).json({ success: false, message: 'Deal not found' });
      }
      res.setHeader('Cache-Control', skipCache ? 'no-store' : 'private, max-age=20');
      return res.status(200).json({ success: true, ...data });
    } catch (error) {
      console.error('Collection payment portfolio deal error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

const collectionPaymentController = new CollectionPaymentController();
export default collectionPaymentController;
