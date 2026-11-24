import * as XLSX from 'xlsx';
import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import { applicationCreateUncheckedData } from '../utils/prisma/applicationCreateUncheckedData';
import { syncDuplicateFlagForApplication } from './applicationIdentityDedupeService';
import {
    deriveFrequency,
    frequencySpecToStored,
    normalizeTermForOfferDecision,
    parseContractLengthDaysFromOfferTerm,
} from '../utils/deriveFrequencyFromTerm';
import { deriveOrganizationFromDealId } from '../utils/deriveOrganizationFromDealId';
import {
    APPLICATION_TYPE_REFI,
    mapApplicationStatus,
    mapApplicationType,
} from '../constants/applicationImportMappings';
import {
    computeDealPayback,
    parseRowSyndicatorCells,
    resolveImportSyndicators,
    syncApplicationSyndicatorAllocations,
    syndicatorNameKey,
    type ImportSyndicatorRef,
    type ParsedRowSyndicators,
} from './applicationSyndicatorImportService';

type DbTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const NA = 'NA';
/** ISO row used when the sheet has commission but no ISO (schema requires `isoId` on `IsoApplicationPayout`). */
export const BULK_IMPORT_PLACEHOLDER_ISO_NAME = '[IMPORT] Unassigned ISO';

/** Thrown inside a row transaction to skip cleanly (e.g. duplicate deal id race). */
class SkipRowIngestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SkipRowIngestError';
    }
}

/**
 * Sleep for the given milliseconds. Used between retry attempts for transient DB errors.
 */
function sleepMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Best-effort detection for transient database errors that are safe to retry. Covers Prisma's
 * connection / pool exhaustion / serialization codes as well as the textual fallbacks for raw
 * `pg` connection drops that surface from Neon's serverless driver under load.
 */
function isRetryableDbError(err: unknown): boolean {
    if (!err) return false;
    const anyErr = err as { code?: unknown; message?: unknown; name?: unknown };
    const code = typeof anyErr.code === 'string' ? anyErr.code : '';
    const name = typeof anyErr.name === 'string' ? anyErr.name : '';
    const message =
        typeof anyErr.message === 'string' ? anyErr.message.toLowerCase() : '';

    // Prisma error codes that are safe to retry.
    if (
        code === 'P1001' || // Can't reach DB server
        code === 'P1002' || // DB server timed out
        code === 'P1008' || // Operations timed out
        code === 'P1017' || // Server closed the connection
        code === 'P2024' || // Connection pool timeout
        code === 'P2034' // Transaction failed due to write conflict / serialization
    ) {
        return true;
    }

    // Postgres-level transient codes (serialization failure / deadlock).
    if (code === '40001' || code === '40P01' || code === '57P01' || code === '57P03') {
        return true;
    }

    if (
        name === 'PrismaClientRustPanicError' ||
        name === 'PrismaClientInitializationError'
    ) {
        return true;
    }

    if (!message) return false;
    return (
        message.includes('connection') ||
        message.includes('terminated unexpectedly') ||
        message.includes('econnreset') ||
        message.includes('etimedout') ||
        message.includes('socket hang up') ||
        message.includes('connection pool') ||
        message.includes('connection terminated') ||
        message.includes('write conflict') ||
        message.includes('deadlock detected')
    );
}

/**
 * Wrap a database operation so transient connection / serialization failures are retried with
 * exponential backoff. Non-retryable errors are re-thrown immediately so they still surface as
 * row-level errors in the import summary.
 */
async function withDbRetry<T>(
    op: () => Promise<T>,
    opts: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
    const maxAttempts = opts.maxAttempts ?? 5;
    const baseDelayMs = opts.baseDelayMs ?? 250;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await op();
        } catch (err) {
            lastErr = err;
            if (attempt >= maxAttempts || !isRetryableDbError(err)) {
                throw err;
            }
            const delay = baseDelayMs * 2 ** (attempt - 1);
            const jitter = Math.floor(Math.random() * baseDelayMs);
            if (opts.label) {
                console.warn(
                    `[bulk-import] transient DB error during ${opts.label} (attempt ${attempt}/${maxAttempts}); retrying in ${
                        delay + jitter
                    }ms`,
                    err instanceof Error ? err.message : err,
                );
            }
            await sleepMs(delay + jitter);
        }
    }
    throw lastErr;
}

type ExistingAppLookup = {
    id: string;
    clientId: string;
    isoId: string | null;
    dealId: string | null;
    note: string | null;
};

/**
 * Find an existing application by deal id. We accept legacy rows that only carry the deal id in
 * the `note` marker (`[DEAL_ID:xxx]`), in addition to the canonical `dealId` column.
 */
async function findApplicationByDealId(
    db: Pick<typeof prisma, 'application'> | DbTx,
    dealIdNormalized: string,
): Promise<ExistingAppLookup | null> {
    if (!dealIdNormalized) return null;
    const dealIdMarker = `[DEAL_ID:${dealIdNormalized}]`;
    const existing = await db.application.findFirst({
        where: {
            OR: [
                { dealId: { equals: dealIdNormalized, mode: 'insensitive' } },
                { note: { contains: dealIdMarker, mode: 'insensitive' } },
                { note: { contains: dealIdNormalized, mode: 'insensitive' } },
            ],
        },
        select: { id: true, clientId: true, isoId: true, dealId: true, note: true },
    });
    return existing as ExistingAppLookup | null;
}

const PREFETCH_CHUNK_SIZE = 50;
/** Parallel row workers; keep below the pg pool size (default 10). */
const BULK_IMPORT_CONCURRENCY = Math.max(1, Number(process.env.BULK_IMPORT_CONCURRENCY ?? '5') || 5);

/**
 * Batch version of `findApplicationByDealId`: resolves every deal id in the file with one query per
 * chunk instead of one (unindexed `note ILIKE`) scan per row. Same matching rules, keyed by the
 * lower-cased deal id.
 */
async function prefetchApplicationsByDealIds(
    dealIds: string[],
): Promise<Map<string, ExistingAppLookup>> {
    const result = new Map<string, ExistingAppLookup>();
    const unique = [...new Set(dealIds.filter(Boolean))];
    for (let i = 0; i < unique.length; i += PREFETCH_CHUNK_SIZE) {
        const chunk = unique.slice(i, i + PREFETCH_CHUNK_SIZE);
        const candidates = (await withDbRetry(
            () =>
                prisma.application.findMany({
                    where: {
                        OR: [
                            { dealId: { in: chunk, mode: 'insensitive' } },
                            ...chunk.map((id) => ({
                                note: { contains: id, mode: 'insensitive' as const },
                            })),
                        ],
                    },
                    select: { id: true, clientId: true, isoId: true, dealId: true, note: true },
                }),
            { label: 'prefetch applications by deal id' },
        )) as ExistingAppLookup[];
        if (!candidates.length) continue;
        for (const dealId of chunk) {
            const key = dealId.toLowerCase();
            const marker = `[deal_id:${key}]`;
            const match =
                candidates.find((a) => (a.dealId ?? '').toLowerCase() === key) ??
                candidates.find((a) => (a.note ?? '').toLowerCase().includes(marker)) ??
                candidates.find((a) => (a.note ?? '').toLowerCase().includes(key));
            if (match) result.set(key, match);
        }
    }
    return result;
}

/** Run `worker` over `items` with at most `limit` in flight. */
async function runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    let next = 0;
    const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const item = items[next];
            next += 1;
            await worker(item);
        }
    });
    await Promise.all(runners);
}

export type BulkImportRowError = {
    excelRowNumber: number;
    message: string;
    dealId?: string | null;
    dealName?: string | null;
};

export type BulkImportSummary = {
    totalRows: number;
    successCount: number;
    /** Rows that matched an existing application by deal id and were updated in place. */
    updatedCount: number;
    failedCount: number;
    errors: BulkImportRowError[];
    /** Rows that imported but need attention (e.g. syndicator % not 100, unrecognized Type). */
    warnings: BulkImportRowError[];
    /** Syndicators auto-created from the file's syndicator columns. */
    createdSyndicators: string[];
};

export type BulkImportIngestOptions = {
    /** Syndicator column headers (after "Frequency"); each is resolved or created up front. */
    syndicatorColumns?: string[];
};

export type BulkImportProgress = {
    totalRows: number;
    processedRows: number;
    successCount: number;
    /** Rows that matched an existing application by deal id and were updated in place. */
    updatedCount: number;
    failedCount: number;
    currentExcelRowNumber?: number;
};

function trimStr(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    // Strip BOM and zero-width chars that appear in exported CSV/Excel headers.
    return String(v)
        .replace(/^\uFEFF/, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
}

/** Collapse header text for case-insensitive column matching (handles "Deal ID", "deal id", etc.). */
function canonicalHeader(h: unknown): string {
    return trimStr(h)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ]+/g, '')
        .replace(/\s+/g, '');
}

/** Map normalized header → logical field key. */
function headerToFieldKey(canonical: string): string | null {
    const aliases: Record<string, string> = {
        dealid: 'dealId',
        dealno: 'dealId',
        id: 'dealId',
        dealname: 'dealName',
        merchant: 'dealName',
        client: 'dealName',
        businessname: 'dealName',
        date: 'date',
        fundeddate: 'date',
        type: 'type',
        status: 'status',
        offer: 'offer',
        funded: 'offer',
        fees: 'fees',
        fee: 'fees',
        commission: 'commission',
        iso: 'iso',
        broker: 'iso',
        term: 'term',
        tenor: 'term',
        loanterm: 'term',
        contractterm: 'term',
        repaymentterm: 'term',
        rate: 'rate',
        factorrate: 'rate',
        repayperperiod: 'repayPerPeriod',
        repaymentperperiod: 'repayPerPeriod',
        payperperiod: 'repayPerPeriod',
        paymentperperiod: 'repayPerPeriod',
        refinance: 'refinanceAmount',
        refi: 'refinanceAmount',
        refinanceamount: 'refinanceAmount',
        refinaceamount: 'refinanceAmount',
        refinancingamount: 'refinanceAmount',
        refinanceamt: 'refinanceAmount',
        refiamount: 'refinanceAmount',
        payoffamount: 'refinanceAmount',
        refinancepayoff: 'refinanceAmount',
        refirolloveramount: 'refinanceAmount',
        reverse: 'reverseAmount',
        reverseamount: 'reverseAmount',
        reverseamt: 'reverseAmount',
        reversefundedamount: 'reverseAmount',
        // Frequency is not persisted (always derived from Term) — it marks where the dynamic
        // syndicator columns begin.
        frequency: 'frequency',
        paymentfrequency: 'frequency',
    };
    return aliases[canonical.replace(/\s/g, '')] ?? aliases[canonical] ?? null;
}

/**
 * One client per business: strip trailing " #1", " #2", … from deal/merchant names so
 * "TTR MANUFACTURING #1" … "#3" all map to the same client ("TTR MANUFACTURING").
 */
export function baseBusinessNameForClientDedupe(dealName: string): string {
    const t = dealName.replace(/\s+/g, ' ').trim();
    const stripped = t.replace(/\s*#\d+\s*$/i, '').trim();
    return stripped || t;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Currency and Indian-style grouped integers: `$1,08,000.00` → 108000. */
export function parseMoneyToNumber(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    let s = trimStr(v);
    if (!s) return null;
    s = s.replace(/\$/g, '').replace(/\s/g, '');
    const neg = s.startsWith('(') && s.endsWith(')');
    if (neg) s = s.slice(1, -1);
    s = s.replace(/,/g, '');
    if (!s) return null;
    const n = Number.parseFloat(s);
    if (Number.isNaN(n)) return null;
    return neg ? -n : n;
}

/**
 * Parses sheet dates and strings like `5-5-2023` (M-D-YYYY) without UTC shift surprises.
 * Handles Excel serial numbers (number or numeric string), ISO `YYYY-MM-DD`, and slash dates
 * (US MDY by default; if the first component is > 12, treats as DMY).
 */
export function parseExcelDate(v: unknown): Date | null {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    if (typeof v === 'number' && Number.isFinite(v)) {
        const d = XLSX.SSF?.parse_date_code?.(v);
        if (d && typeof d.y === 'number') {
            return new Date(d.y, (d.m ?? 1) - 1, d.d ?? 1, 12, 0, 0, 0);
        }
        const epoch = new Date(1899, 11, 30, 12, 0, 0, 0);
        return new Date(epoch.getTime() + Math.round(v * 86400000));
    }
    const s = trimStr(v);
    if (!s) return null;

    // Plain numeric string from Excel (serial) when `sheet_to_json` / preview used raw values.
    if (/^-?\d+(\.\d+)?$/.test(s)) {
        const n = Number(s);
        if (Number.isFinite(n) && n >= 25569 && n < 600000) {
            return parseExcelDate(n);
        }
    }

    const isoYmd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (isoYmd) {
        const year = Number.parseInt(isoYmd[1], 10);
        const month = Number.parseInt(isoYmd[2], 10) - 1;
        const day = Number.parseInt(isoYmd[3], 10);
        const d = new Date(year, month, day, 12, 0, 0, 0);
        if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) return d;
    }

    const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
    if (slash) {
        const first = Number.parseInt(slash[1], 10);
        const second = Number.parseInt(slash[2], 10);
        let year = Number.parseInt(slash[3], 10);
        if (year < 100) year += 2000;
        let month0: number;
        let day: number;
        if (first > 12) {
            // DMY: 25/03/2024
            day = first;
            month0 = second - 1;
        } else if (second > 12) {
            // MDY: 03/25/2024
            month0 = first - 1;
            day = second;
        } else {
            // Ambiguous (both ≤ 12): keep MDY for backward compatibility with US sheets.
            month0 = first - 1;
            day = second;
        }
        const d = new Date(year, month0, day, 12, 0, 0, 0);
        if (d.getFullYear() === year && d.getMonth() === month0 && d.getDate() === day) return d;
    }

    const d2 = new Date(s);
    return Number.isNaN(d2.getTime()) ? null : d2;
}

function buildColumnIndex(headerRow: unknown[]): Map<string, number> {
    const map = new Map<string, number>();
    headerRow.forEach((cell, idx) => {
        const raw = trimStr(cell);
        if (!raw) return;
        const key = headerToFieldKey(canonicalHeader(cell));
        if (key && !map.has(key)) map.set(key, idx);
    });
    return map;
}

/** Headers after "Frequency" that are not syndicators even though they are not mapped fields. */
const NON_SYNDICATOR_HEADERS = new Set([
    'total',
    'totalpercent',
    'totalpercentage',
    'notes',
    'note',
    'comments',
    'comment',
    'remarks',
]);

/**
 * Every non-empty header to the right of the Frequency column that is not a known field is a
 * syndicator column (header text = syndicator name). Duplicate names keep the first column.
 */
function findSyndicatorColumns(
    headerRow: unknown[],
    col: Map<string, number>,
): { columns: Array<{ index: number; name: string }>; duplicates: string[] } {
    const frequencyIndex = col.get('frequency');
    const columns: Array<{ index: number; name: string }> = [];
    const duplicates: string[] = [];
    if (frequencyIndex === undefined) return { columns, duplicates };
    const seen = new Set<string>();
    for (let i = frequencyIndex + 1; i < headerRow.length; i++) {
        const name = trimStr(headerRow[i]).replace(/\s+/g, ' ');
        if (!name) continue;
        const canonical = canonicalHeader(name);
        if (headerToFieldKey(canonical) || NON_SYNDICATOR_HEADERS.has(canonical)) continue;
        const key = syndicatorNameKey(name);
        if (seen.has(key)) {
            duplicates.push(name);
            continue;
        }
        seen.add(key);
        columns.push({ index: i, name });
    }
    return { columns, duplicates };
}

function cell(row: unknown[], col: Map<string, number>, field: string): unknown {
    const i = col.get(field);
    if (i === undefined) return '';
    return row[i];
}

/** Prefer Excel formatted text (`cell.w`) so deal ids like `KK1000` are not lost to numeric coercion. */
function cellForField(
    ws: XLSX.WorkSheet,
    rowIndex0: number,
    row: unknown[],
    col: Map<string, number>,
    field: string,
): unknown {
    const i = col.get(field);
    if (i === undefined) return '';
    const addr = XLSX.utils.encode_cell({ r: rowIndex0, c: i });
    const sheetCell = ws[addr];
    const formatted = sheetCell?.w != null ? trimStr(sheetCell.w) : '';
    if (formatted) return formatted;
    return row[i];
}

function normalizeDealIdFromSheet(v: unknown): string {
    const raw = trimStr(v);
    if (!raw) return '';
    return raw.replace(/^['']+/g, '').trim();
}

async function getOrCreatePlaceholderIso(tx: Pick<typeof prisma, 'iso'> | DbTx): Promise<{ id: string }> {
    const existing = await tx.iso.findFirst({
        where: { name: BULK_IMPORT_PLACEHOLDER_ISO_NAME },
        select: { id: true },
    });
    if (existing) return existing;
    return tx.iso.create({
        data: {
            name: BULK_IMPORT_PLACEHOLDER_ISO_NAME,
            email: null,
            phone: null,
            bankAccountNo: NA,
            routingNumber: NA,
            commissionPercentage: 0,
        },
        select: { id: true },
    });
}

async function resolveIso(
    tx: Pick<typeof prisma, 'iso'> | DbTx,
    isoNameRaw: string,
    placeholderIsoId: string,
): Promise<{ id: string; isPlaceholder: boolean }> {
    const name = trimStr(isoNameRaw);
    if (!name) {
        return { id: placeholderIsoId, isPlaceholder: true };
    }
    const found = await tx.iso.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
    });
    if (found) return { id: found.id, isPlaceholder: false };
    const created = await tx.iso.create({
        data: {
            name,
            email: null,
            phone: null,
            bankAccountNo: NA,
            routingNumber: NA,
            commissionPercentage: 0,
        },
        select: { id: true },
    });
    return { id: created.id, isPlaceholder: false };
}

/**
 * Resolve or create a single Client for a deal row: same base name (after stripping " #N")
 * shares one client; applications stay distinct per deal id.
 */
async function ensureClientByDealName(
    tx: DbTx,
    dealName: string,
    actorUserId: string,
    cache: { get(key: string): string | undefined; set(key: string, value: string): void },
): Promise<string> {
    const displayName = dealName.replace(/\s+/g, ' ').trim();
    const baseName = baseBusinessNameForClientDedupe(displayName);
    const cacheKey = baseName.toLowerCase();

    const cacheHit = cache.get(cacheKey);
    if (cacheHit) return cacheHit;

    let found = await tx.client.findFirst({
        where: { businessName: { equals: baseName, mode: 'insensitive' } },
        select: { id: true },
        orderBy: { clientId: 'asc' },
    });
    if (!found) {
        found = await tx.client.findFirst({
            where: { businessName: { equals: displayName, mode: 'insensitive' } },
            select: { id: true },
            orderBy: { clientId: 'asc' },
        });
    }
    if (!found && baseName.length > 0) {
        const numberedPrefix = `${baseName} #`;
        const legacyRows = await tx.client.findMany({
            where: { businessName: { startsWith: numberedPrefix, mode: 'insensitive' } },
            take: 40,
            select: { id: true, businessName: true },
            orderBy: { clientId: 'asc' },
        });
        const legacyRe = new RegExp(`^${escapeRegExp(baseName)}\\s*#\\d+\\s*$`, 'i');
        const legacy = legacyRows.find((r) => legacyRe.test(String(r.businessName).trim()));
        if (legacy) found = { id: legacy.id };
    }

    if (found) {
        cache.set(cacheKey, found.id);
        return found.id;
    }

    const created = await tx.client.create({
        data: {
            businessName: baseName,
            ownerFirstName: NA,
            ownerLastName: NA,
            createdById: actorUserId,
        },
        select: { id: true },
    });
    cache.set(cacheKey, created.id);
    return created.id;
}

/** Parse percent-like cells for rate columns (`1.39%`, `0.0139`, `1.39`). */
export function parseRateToNumber(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
        // Excel often stores percentage-formatted cells as fractions (e.g. 1.39% -> 0.0139).
        if (v > 0 && v < 1) return v * 100;
        return v;
    }
    let s = trimStr(v);
    if (!s) return null;
    s = s.replace(/%/g, '').trim();
    const n = parseMoneyToNumber(s);
    if (n == null) return null;
    // String values may still come as decimal fractions.
    if (n > 0 && n < 1) return n * 100;
    return n;
}

/**
 * Parses the first worksheet: row 1 = headers, data starts after optional summary row.
 */
export type ParsedApplicationBulkSheet = {
    rows: Record<string, unknown>[];
    errors: BulkImportRowError[];
    warnings: BulkImportRowError[];
    /** Syndicator names taken from the headers after "Frequency", in column order. */
    syndicatorColumns: string[];
};

export function parseApplicationBulkSheet(buffer: Buffer): ParsedApplicationBulkSheet {
    const errors: BulkImportRowError[] = [];
    const warnings: BulkImportRowError[] = [];
    const empty = (): ParsedApplicationBulkSheet => ({ rows: [], errors, warnings, syndicatorColumns: [] });
    let workbook: XLSX.WorkBook;
    try {
        workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch (e) {
        errors.push({
            excelRowNumber: 0,
            message: `Failed to read workbook: ${e instanceof Error ? e.message : String(e)}`,
        });
        return empty();
    }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
        errors.push({ excelRowNumber: 0, message: 'Workbook has no sheets' });
        return empty();
    }
    const ws = workbook.Sheets[sheetName];
    // `raw: true` preserves numeric refinance/offer/fees cells; money/date parsers accept both strings and numbers.
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });
    if (aoa.length < 2) {
        errors.push({
            excelRowNumber: 0,
            message: 'Expected a header row and at least one data row.',
        });
        return empty();
    }

    const headerRow = aoa[0] ?? [];
    const col = buildColumnIndex(headerRow);
    if (!col.has('dealName') || !col.has('dealId')) {
        errors.push({
            excelRowNumber: 1,
            message: 'Required columns "Deal Name" and "Deal ID" were not found (headers are matched case-insensitively).',
        });
        return empty();
    }

    const { columns: syndicatorColumns, duplicates } = findSyndicatorColumns(headerRow, col);
    for (const name of duplicates) {
        warnings.push({
            excelRowNumber: 1,
            message: `Syndicator column "${name}" appears more than once — only the first "${name}" column is used.`,
        });
    }

    // Start directly after the header row. This avoids accidentally dropping a real first data row.
    // Empty rows are skipped below and invalid rows are reported with exact Excel row numbers.
    const dataStartIndex = 1;

    const out: Record<string, unknown>[] = [];
    for (let r = dataStartIndex; r < aoa.length; r++) {
        const row = aoa[r] ?? [];
        const excelRowNumber = r + 1;
        const isEmpty = (row as unknown[]).every((c) => trimStr(c) === '');
        if (isEmpty) continue;

        out.push({
            __excelRow: excelRowNumber,
            dealId: normalizeDealIdFromSheet(cellForField(ws, r, row, col, 'dealId')),
            dealName: cell(row, col, 'dealName'),
            date: cell(row, col, 'date'),
            type: cell(row, col, 'type'),
            status: cell(row, col, 'status'),
            offer: cell(row, col, 'offer'),
            fees: cell(row, col, 'fees'),
            rate: cell(row, col, 'rate'),
            commission: cell(row, col, 'commission'),
            iso: cell(row, col, 'iso'),
            term: cell(row, col, 'term'),
            repayPerPeriod: cell(row, col, 'repayPerPeriod'),
            refinanceAmount: cell(row, col, 'refinanceAmount'),
            reverseAmount: cell(row, col, 'reverseAmount'),
            __syndicators: syndicatorColumns.length
                ? parseRowSyndicatorCells(ws, r, syndicatorColumns)
                : null,
        });
    }
    return { rows: out, errors, warnings, syndicatorColumns: syndicatorColumns.map((c) => c.name) };
}

/**
 * Inserts applications (and related rows) from parsed sheet rows, or updates an existing application
 * in place when its deal id already exists. One transaction per row so a failure never leaves a
 * half-inserted graph. Updates preserve the application's current `clientId` (we never re-parent an
 * existing application to a different client) and only overwrite fields that have an explicit value
 * in the sheet — empty cells leave existing values untouched.
 */
export async function ingestApplicationBulkRows(
    rows: Record<string, unknown>[],
    actorUserId: string,
    onProgress?: (progress: BulkImportProgress) => void,
    options: BulkImportIngestOptions = {},
): Promise<BulkImportSummary> {
    const errors: BulkImportRowError[] = [];
    const warnings: BulkImportRowError[] = [];
    let successCount = 0;
    let updatedCount = 0;
    const dealIdsSeenInBatch = new Set<string>();
    const clientCache = new Map<string, string>();

    // Resolve every syndicator column once (find existing or create) before touching any row.
    const syndicatorNames = new Set<string>(options.syndicatorColumns ?? []);
    for (const raw of rows) {
        const parsed = raw.__syndicators as ParsedRowSyndicators | null | undefined;
        parsed?.allocations.forEach((a) => syndicatorNames.add(a.name));
    }
    let syndicatorsByKey = new Map<string, ImportSyndicatorRef>();
    let createdSyndicators: string[] = [];
    if (syndicatorNames.size) {
        try {
            const resolved = await withDbRetry(
                () => resolveImportSyndicators(prisma, [...syndicatorNames]),
                { label: 'resolve syndicator columns' },
            );
            syndicatorsByKey = resolved.byKey;
            createdSyndicators = resolved.createdNames;
        } catch (e) {
            warnings.push({
                excelRowNumber: 1,
                message: `Could not resolve syndicator columns (${
                    e instanceof Error ? e.message : String(e)
                }) — applications imported without syndicator funding.`,
            });
        }
    }
    const fileSyndicatorIds = new Set(
        (options.syndicatorColumns ?? [])
            .map((name) => syndicatorsByKey.get(syndicatorNameKey(name))?.id)
            .filter((id): id is number => id != null),
    );

    // Pre-pass: the first occurrence of each deal id is processed; later ones are reported as
    // duplicates. Done up front so rows can be processed concurrently below.
    const duplicateDealIdRows = new Set<Record<string, unknown>>();
    const dealIdsInFile: string[] = [];
    for (const raw of rows) {
        if (!trimStr(raw.dealName)) continue;
        const key = normalizeDealIdFromSheet(raw.dealId);
        if (!key) continue;
        if (dealIdsSeenInBatch.has(key.toLowerCase())) {
            duplicateDealIdRows.add(raw);
            continue;
        }
        dealIdsSeenInBatch.add(key.toLowerCase());
        dealIdsInFile.push(key);
    }

    // One batched lookup instead of a full `note ILIKE` scan per row.
    let existingByDealId: Map<string, ExistingAppLookup> | null = null;
    try {
        existingByDealId = await prefetchApplicationsByDealIds(dealIdsInFile);
    } catch (e) {
        console.warn('[bulk-import] deal id prefetch failed; falling back to per-row lookups', e);
    }

    // ISO lookups are shared across rows; resolved outside the row transactions so a rolled-back
    // row can never leave a cached id pointing at an ISO that doesn't exist.
    let placeholderIsoPromise: Promise<{ id: string }> | null = null;
    const getPlaceholderIsoCached = (): Promise<{ id: string }> => {
        if (!placeholderIsoPromise) {
            placeholderIsoPromise = withDbRetry(() => getOrCreatePlaceholderIso(prisma), {
                label: 'placeholder iso',
            });
            placeholderIsoPromise.catch(() => {
                placeholderIsoPromise = null;
            });
        }
        return placeholderIsoPromise;
    };
    const isoCache = new Map<string, Promise<{ id: string; isPlaceholder: boolean }>>();
    const resolveIsoCached = async (isoNameRaw: string) => {
        const placeholder = await getPlaceholderIsoCached();
        const key = trimStr(isoNameRaw).toLowerCase();
        if (!key) return { id: placeholder.id, isPlaceholder: true };
        let pending = isoCache.get(key);
        if (!pending) {
            pending = withDbRetry(() => resolveIso(prisma, isoNameRaw, placeholder.id), {
                label: `resolve iso "${isoNameRaw}"`,
            });
            pending.catch(() => isoCache.delete(key));
            isoCache.set(key, pending);
        }
        return pending;
    };

    const processRow = async (raw: Record<string, unknown>): Promise<void> => {
        const excelRowNumber = Number(raw.__excelRow) || 0;
        const emitProgress = (
            currentSuccess: number,
            currentUpdated: number,
            currentFailed: number,
        ) => {
            if (!onProgress) return;
            onProgress({
                totalRows: rows.length,
                processedRows: currentSuccess + currentUpdated + currentFailed,
                successCount: currentSuccess,
                updatedCount: currentUpdated,
                failedCount: currentFailed,
                currentExcelRowNumber: excelRowNumber || undefined,
            });
        };
        const dealNameTrim = trimStr(raw.dealName);
        if (!dealNameTrim) {
            errors.push({
                excelRowNumber,
                message: 'Missing deal name — row skipped.',
                dealId: trimStr(raw.dealId) || null,
            });
            emitProgress(successCount, updatedCount, errors.length);
            return;
        }

        const dealIdKey = normalizeDealIdFromSheet(raw.dealId);
        if (!dealIdKey) {
            errors.push({
                excelRowNumber,
                message: 'Missing deal id — row skipped.',
                dealName: dealNameTrim,
            });
            emitProgress(successCount, updatedCount, errors.length);
            return;
        }

        const dealIdDedupeKey = dealIdKey.toLowerCase();
        const mappedOrganization = deriveOrganizationFromDealId(dealIdKey);
        if (duplicateDealIdRows.has(raw)) {
            errors.push({
                excelRowNumber,
                message: 'Duplicate deal id in this file — row skipped.',
                dealId: dealIdKey,
                dealName: dealNameTrim,
            });
            emitProgress(successCount, updatedCount, errors.length);
            return;
        }

        // Everything below this point must NEVER throw out of the loop — a transient DB blip on
        // row N must not stop the import of rows N+1..end. Any error is captured into `errors`
        // and the loop continues. Retryable errors (Neon connection drops, pool timeouts, etc.)
        // are retried automatically by `withDbRetry` before being recorded as a row failure.
        try {
            const existingApp = existingByDealId
                ? existingByDealId.get(dealIdDedupeKey) ?? null
                : await withDbRetry(
                      () => findApplicationByDealId(prisma, dealIdKey),
                      { label: `findApplicationByDealId(row ${excelRowNumber})` },
                  );

            const createdAt = parseExcelDate(raw.date);
            // Date is only mandatory when creating a brand-new application; updates can omit it
            // and we'll keep the previous `createdAt` intact.
            if (!existingApp && !createdAt) {
                errors.push({
                    excelRowNumber,
                    message: 'Invalid or missing date — row skipped.',
                    dealId: dealIdKey,
                    dealName: dealNameTrim,
                });
                emitProgress(successCount, updatedCount, errors.length);
                return;
            }

            const rowWarnings: string[] = [];
            const typeMapping = mapApplicationType(raw.type);
            const typeRaw = typeMapping.value ?? '';
            const typeVal = typeRaw || NA;
            if (typeMapping.unrecognized) {
                rowWarnings.push(
                    `Type "${typeRaw}" is not a recognized application type — saved as "${typeRaw}".`,
                );
            }
            const statusMapping = mapApplicationStatus(raw.status);
            const statusVal = statusMapping.value;
            if (statusMapping.unrecognized) {
                rowWarnings.push(
                    `Status "${statusVal}" is not a recognized application status — saved as "${statusVal}".`,
                );
            }
            const reverseAmountNum = parseMoneyToNumber(raw.reverseAmount);

            const rowSyndicators = raw.__syndicators as ParsedRowSyndicators | null | undefined;
            let syndicatorAllocations: Array<{ syndicator: ImportSyndicatorRef; percent: number }> = [];
            if (rowSyndicators?.issue) {
                rowWarnings.push(rowSyndicators.issue);
            } else if (rowSyndicators?.allocations.length) {
                const resolvedAllocations = rowSyndicators.allocations.map((a) => ({
                    syndicator: syndicatorsByKey.get(syndicatorNameKey(a.name)),
                    percent: a.percent,
                }));
                if (resolvedAllocations.every((a) => a.syndicator)) {
                    syndicatorAllocations = resolvedAllocations as typeof syndicatorAllocations;
                } else {
                    rowWarnings.push('Syndicators could not be resolved — syndicator funding not updated.');
                }
            }

            let txWarnings: string[] = [];
            /** Shared by create + update: REFI check and syndicator allocation sync. */
            const applyFundingDetails = async (
                tx: DbTx,
                applicationId: string,
                offerDecision: {
                    offer: Prisma.Decimal | null;
                    rate: Prisma.Decimal | null;
                    term: string | null;
                    repayPerPeriod: Prisma.Decimal | null;
                    refinanceAmount: Prisma.Decimal | null;
                },
            ) => {
                if (typeRaw === APPLICATION_TYPE_REFI && offerDecision.refinanceAmount == null) {
                    txWarnings.push('Type is REFI but no Refinance Amount was found in the row.');
                }
                if (!syndicatorAllocations.length) return;
                const fundedAmount = Number(offerDecision.offer ?? 0) || 0;
                const termPeriods = parseContractLengthDaysFromOfferTerm(offerDecision.term);
                const paybackAmount = computeDealPayback({
                    fundedAmount,
                    rate: offerDecision.rate == null ? null : Number(offerDecision.rate),
                    repayPerPeriod:
                        offerDecision.repayPerPeriod == null ? null : Number(offerDecision.repayPerPeriod),
                    termPeriods,
                });
                const syncWarnings = await syncApplicationSyndicatorAllocations(tx, {
                    applicationId,
                    merchantName: dealNameTrim,
                    allocations: syndicatorAllocations,
                    fileSyndicatorIds,
                    fundedAmount,
                    paybackAmount,
                    termLength: termPeriods ?? 0,
                });
                txWarnings.push(...syncWarnings);
            };
            const offerNum = parseMoneyToNumber(raw.offer);
            const feesNum = parseMoneyToNumber(raw.fees);
            const rateNum = parseRateToNumber(raw.rate);
            // Payback (OfferDecision.totalRemit) drives the deal balance on the payments dashboard;
            // without it balances read as 0. Only a factor-style rate (e.g. 1.5) yields a payback.
            const totalRemitNum =
                offerNum != null && offerNum > 0 && rateNum != null && rateNum >= 1 && rateNum <= 5
                    ? Math.round(offerNum * rateNum * 100) / 100
                    : null;
            const commissionRaw = trimStr(raw.commission);
            const commissionParsed = commissionRaw
                ? parseMoneyToNumber(raw.commission)
                : null;
            const commissionNumForCreate = commissionParsed ?? 0;
            const isoCell = trimStr(raw.iso);
            const termRaw = trimStr(raw.term);
            const termStored = normalizeTermForOfferDecision(raw.term);
            const frequencyStored = frequencySpecToStored(deriveFrequency(termRaw));
            const repayPerPeriodNum = parseMoneyToNumber(raw.repayPerPeriod);
            const refinanceAmountNum = parseMoneyToNumber(raw.refinanceAmount);

            const isoResolvedForRow = isoCell || !existingApp ? await resolveIsoCached(isoCell) : null;

            let createdApplicationIdForDedupe: string | null = null;
            let pendingClientCacheEntry: [string, string] | null = null;
            const wasUpdate = await withDbRetry(
                () => prisma.$transaction(
                    async (tx): Promise<boolean> => {
                    // Re-check inside the transaction to avoid a duplicate-create race between the
                    // initial lookup and now (e.g. two concurrent imports). The prefetch already ran
                    // the legacy `note` match, so only the cheap dealId check is repeated here.
                    const txExisting: ExistingAppLookup | null = existingApp
                        ? existingApp
                        : existingByDealId
                          ? ((await tx.application.findFirst({
                                where: { dealId: { equals: dealIdKey, mode: 'insensitive' } },
                                select: { id: true, clientId: true, isoId: true, dealId: true, note: true },
                            })) as ExistingAppLookup | null)
                          : await findApplicationByDealId(tx, dealIdKey);
                    pendingClientCacheEntry = null;
                    // Reset per attempt so a retried transaction doesn't report warnings twice.
                    txWarnings = [];

                    if (txExisting) {
                        // UPDATE path: refresh the matched application in place. We never move the
                        // application to a different client and we leave any user-authored `note`
                        // text alone (only ensuring the `[DEAL_ID:xxx]` marker exists).
                        const updateData: Prisma.ApplicationUncheckedUpdateInput = {
                            dealId: dealIdKey,
                            dealDisplayName: dealNameTrim,
                            organization: mappedOrganization,
                        };

                        if (typeRaw) updateData.type = typeVal;
                        if (statusVal) updateData.status = statusVal;
                        if (offerNum != null) updateData.loanAmount = offerNum;
                        if (commissionParsed != null) updateData.commissionAmount = commissionParsed;
                        if (createdAt) updateData.createdAt = createdAt;

                        // Ensure the deal-id marker is present in `note` so future lookups by the
                        // legacy `note`-marker path keep working. Existing user content is kept.
                        const dealIdMarker = `[DEAL_ID:${dealIdKey}]`;
                        const currentNote = txExisting.note ?? '';
                        if (!currentNote.toLowerCase().includes(dealIdMarker.toLowerCase())) {
                            updateData.note = currentNote
                                ? `${currentNote}\n${dealIdMarker}`
                                : dealIdMarker;
                        }

                        let payoutIsoId: string | null = null;
                        if (isoCell) {
                            const isoResolved = isoResolvedForRow ?? (await resolveIsoCached(isoCell));
                            updateData.isoId = isoResolved.isPlaceholder ? null : isoResolved.id;
                            payoutIsoId = isoResolved.id;
                        }

                        await tx.application.update({
                            where: { id: txExisting.id },
                            data: updateData,
                        });

                        // Keep Client.businessName aligned with the import deal name so Overview /
                        // application detail match the list (which prefers dealDisplayName).
                        if (dealNameTrim && txExisting.clientId) {
                            await tx.client.update({
                                where: { id: txExisting.clientId },
                                data: { businessName: dealNameTrim },
                            });
                        }

                        // OfferDecision is 1:1 with Application — upsert keeps the same row.
                        // For updates, only overwrite columns that have an explicit value in the sheet
                        // so empty cells don't blank out real data. The `create` branch keeps the
                        // legacy default-to-0 behavior for newly minted decision rows.
                        const offerUpdate: Record<string, unknown> = {
                            decision: 'IMPORTED',
                        };
                        if (offerNum != null) offerUpdate.offer = offerNum;
                        if (feesNum != null) offerUpdate.fees = feesNum;
                        if (totalRemitNum != null) offerUpdate.totalRemit = totalRemitNum;
                        if (rateNum != null) offerUpdate.rate = rateNum;
                        if (termRaw) {
                            offerUpdate.term = termStored;
                            offerUpdate.frequency = frequencyStored;
                        }
                        if (repayPerPeriodNum != null) {
                            offerUpdate.repayPerPeriod = repayPerPeriodNum;
                        }
                        if (refinanceAmountNum != null) {
                            offerUpdate.refinanceAmount = refinanceAmountNum;
                        }
                        if (reverseAmountNum != null) {
                            offerUpdate.reverseAmount = reverseAmountNum;
                        }

                        const offerDecision = await tx.offerDecision.upsert({
                            where: { applicationId: txExisting.id },
                            update: offerUpdate,
                            create: {
                                applicationId: txExisting.id,
                                decision: 'IMPORTED',
                                offer: offerNum ?? 0,
                                rate: rateNum,
                                totalRemit: totalRemitNum,
                                fees: feesNum ?? 0,
                                term: termStored,
                                frequency: frequencyStored,
                                repayPerPeriod: repayPerPeriodNum,
                                refinanceAmount: refinanceAmountNum,
                                reverseAmount: reverseAmountNum,
                            },
                        });
                        await applyFundingDetails(tx, txExisting.id, offerDecision);

                        // Make sure the new iso has a payout row, but don't delete other payouts
                        // (an application may legitimately have multiple iso payouts).
                        if (payoutIsoId) {
                            await tx.isoApplicationPayout.upsert({
                                where: {
                                    isoId_applicationId: {
                                        isoId: payoutIsoId,
                                        applicationId: txExisting.id,
                                    },
                                },
                                update: {},
                                create: {
                                    isoId: payoutIsoId,
                                    applicationId: txExisting.id,
                                },
                            });
                        }

                        return true;
                    }

                    // CREATE path (no existing match).
                    if (!createdAt) {
                        // Defensive — should have been filtered above, but the transaction may have
                        // raced with another import that deleted the previous match.
                        throw new SkipRowIngestError('Invalid or missing date — row skipped.');
                    }
                    // Only publish the client id to the shared cache after the transaction commits.
                    const clientId = await ensureClientByDealName(tx, dealNameTrim, actorUserId, {
                        get: (key) => clientCache.get(key),
                        set: (key, value) => {
                            pendingClientCacheEntry = [key, value];
                        },
                    });

                    const isoResolved = isoResolvedForRow ?? (await resolveIsoCached(isoCell));
                    const applicationIsoId = isoResolved.isPlaceholder ? null : isoResolved.id;
                    const noteWithDealId = `[DEAL_ID:${dealIdKey}]`;

                    const application = await tx.application.create({
                        data: applicationCreateUncheckedData({
                            priority: NA,
                            type: typeVal,
                            status: statusVal,
                            salesRepresentativeId: actorUserId,
                            referringAgentId: null,
                            clientId,
                            createdById: actorUserId,
                            loanAmount: offerNum ?? null,
                            note: noteWithDealId,
                            commissionPercentage: 0,
                            commissionAmount: commissionNumForCreate,
                            dealId: dealIdKey,
                            dealDisplayName: dealNameTrim,
                            currentQueue: 'Funded',
                            currentState: 'FUNDED',
                            organization: mappedOrganization,
                            isoId: applicationIsoId,
                            createdAt,
                        }),
                    });
                    createdApplicationIdForDedupe = application.id;

                    const offerDec = offerNum ?? 0;
                    const feesDec = feesNum ?? 0;
                    const offerDecision = await tx.offerDecision.create({
                        data: {
                            applicationId: application.id,
                            decision: 'IMPORTED',
                            offer: offerDec,
                            rate: rateNum,
                            totalRemit: totalRemitNum,
                            fees: feesDec,
                            term: termStored,
                            frequency: frequencyStored,
                            repayPerPeriod: repayPerPeriodNum,
                            refinanceAmount: refinanceAmountNum,
                            reverseAmount: reverseAmountNum,
                        },
                    });
                    await applyFundingDetails(tx, application.id, offerDecision);

                    await tx.isoApplicationPayout.create({
                        data: {
                            isoId: isoResolved.id,
                            applicationId: application.id,
                        },
                    });
                    return false;
                },
                // Per-row transaction budget: under load Neon can take a while to allocate a
                // connection, so we give each row plenty of headroom rather than fail the whole job.
                { maxWait: 60_000, timeout: 120_000 },
                ),
                { label: `row ${excelRowNumber} transaction`, maxAttempts: 4 },
            );

            // Assigned inside the transaction closure, which TS flow analysis can't see.
            const committedClientEntry = pendingClientCacheEntry as [string, string] | null;
            if (committedClientEntry) {
                const [cacheKey, cachedClientId] = committedClientEntry;
                clientCache.set(cacheKey, cachedClientId);
            }
            for (const message of [...rowWarnings, ...txWarnings]) {
                warnings.push({ excelRowNumber, message, dealId: dealIdKey, dealName: dealNameTrim });
            }
            if (wasUpdate) {
                updatedCount += 1;
            } else {
                successCount += 1;
                if (createdApplicationIdForDedupe) {
                    try {
                        await syncDuplicateFlagForApplication(createdApplicationIdForDedupe);
                    } catch (dedupeErr) {
                        console.warn(
                            `[bulk-import] isDuplicate sync failed for ${createdApplicationIdForDedupe}:`,
                            dedupeErr,
                        );
                    }
                }
            }
            emitProgress(successCount, updatedCount, errors.length);
        } catch (e) {
            if (e instanceof SkipRowIngestError) {
                errors.push({
                    excelRowNumber,
                    message: e.message,
                    dealId: dealIdKey,
                    dealName: dealNameTrim,
                });
                emitProgress(successCount, updatedCount, errors.length);
                return;
            }
            const msg = e instanceof Error ? e.message : String(e);
            errors.push({
                excelRowNumber,
                message: msg,
                dealId: dealIdKey,
                dealName: dealNameTrim,
            });
            emitProgress(successCount, updatedCount, errors.length);
            // Defensive: if a single row blows up with something extraordinary (e.g. an OOM-ish
            // crash, an unexpected throw from a helper), log and continue so the import never
            // stalls on row N.
            if (!(e instanceof Error)) {
                console.warn('[bulk-import] row error (non-Error):', e);
            }
        }
    };

    // Rows sharing a client base name run sequentially in one lane so they reuse (rather than race
    // to create) the same client; independent lanes run in parallel.
    const lanes = new Map<string, Record<string, unknown>[]>();
    for (const raw of rows) {
        const laneKey = baseBusinessNameForClientDedupe(trimStr(raw.dealName)).toLowerCase();
        const lane = lanes.get(laneKey);
        if (lane) lane.push(raw);
        else lanes.set(laneKey, [raw]);
    }
    await runWithConcurrency([...lanes.values()], BULK_IMPORT_CONCURRENCY, async (lane) => {
        for (const raw of lane) await processRow(raw);
    });
    errors.sort((a, b) => a.excelRowNumber - b.excelRowNumber);
    warnings.sort((a, b) => a.excelRowNumber - b.excelRowNumber);

    return {
        totalRows: rows.length,
        successCount,
        updatedCount,
        failedCount: errors.length,
        errors,
        warnings,
        createdSyndicators,
    };
}

export async function processApplicationBulkExcelBuffer(
    buffer: Buffer,
    actorUserId: string,
): Promise<BulkImportSummary> {
    const {
        rows,
        errors: parseErrors,
        warnings: parseWarnings,
        syndicatorColumns,
    } = parseApplicationBulkSheet(buffer);
    if (parseErrors.length && rows.length === 0) {
        return {
            totalRows: 0,
            successCount: 0,
            updatedCount: 0,
            failedCount: parseErrors.length,
            errors: parseErrors,
            warnings: parseWarnings,
            createdSyndicators: [],
        };
    }
    const ingest = await ingestApplicationBulkRows(rows, actorUserId, undefined, { syndicatorColumns });
    const mergedErrors = [...parseErrors, ...ingest.errors];
    return {
        totalRows: rows.length,
        successCount: ingest.successCount,
        updatedCount: ingest.updatedCount,
        failedCount: mergedErrors.length,
        errors: mergedErrors,
        warnings: [...parseWarnings, ...ingest.warnings],
        createdSyndicators: ingest.createdSyndicators,
    };
}
