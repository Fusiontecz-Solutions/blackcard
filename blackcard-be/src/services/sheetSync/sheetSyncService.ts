import { CollectionPaymentSource, CollectionPaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../config/prismaClient';
import {
    baseBusinessNameForClientDedupe,
    ingestApplicationBulkRows,
    parseRateToNumber,
    parseExcelDate,
    parseMoneyToNumber,
    type BulkImportSummary,
} from '../applicationBulkExcelIngestService';
import { mapApplicationStatus, mapApplicationType } from '../../constants/applicationImportMappings';
import { normalizeTermForOfferDecision, parseContractLengthDaysFromOfferTerm } from '../../utils/deriveFrequencyFromTerm';
import { distributeSyndicatorCreditsForPayments } from '../syndicatorRepaymentService';
import { syndicatorNameKey, type ParsedRowSyndicators } from '../applicationSyndicatorImportService';
import { normalizeSheetHeader, type DealField, type SheetSyncConfig } from './sheetSyncConfig';
import type { SheetTabs } from './sheetSource';
import { applyLedger, planLedger, type LedgerApplyResult, type LedgerPlan } from './sheetLedgerSync';

/**
 * Google Sheet → CRM sync for one book.
 *
 * `planSheetSync` only reads the CRM and decides, row by row, what the sheet is allowed to
 * change; `applySheetSync` then writes exactly that plan. Rules:
 *  - Deals match by Deal ID (+ name check), then by name + funded amount (+ funded date).
 *    Anything ambiguous or contradictory is a conflict and is left alone.
 *  - Status never moves backwards and a different funded amount is reported, not overwritten.
 *  - Syndicators are only filled on deals that have none; a different split is reported.
 *  - Payments are added when not already stored (deal + date + amount + status + description).
 */

type Db = PrismaClient | Prisma.TransactionClient;

const PERCENT_TOLERANCE = 0.01;
const MONEY_TOLERANCE = 0.5;
const PAYMENT_INSERT_CHUNK = 500;

/** Higher = further along. A sync may move a deal up this ladder, never down. */
const STATUS_RANK: Record<string, number> = {
    FUNDED: 0,
    'BOUNCING DEBITS': 1,
    DEFAULT: 2,
    LEGAL: 3,
    'PAID IN FULL': 4,
    CANCELLED: 4,
};

export type SheetDeal = {
    sheetRow: number;
    dealId: string;
    dealName: string;
    fields: Partial<Record<DealField, unknown>>;
    funded: number | null;
    fundedDate: Date | null;
    /** Syndicator column header → percent (0–100). */
    allocations: Array<{ column: string; percent: number }>;
    allocationIssue: string | null;
};

export type SheetPayment = {
    sheetRow: number;
    dealId: string;
    date: Date | null;
    description: string;
    amount: number;
    status: CollectionPaymentStatus;
    returnDate: Date | null;
};

type CrmDeal = {
    id: string;
    dealId: string | null;
    name: string;
    loanAmount: number | null;
    status: string | null;
    type: string;
    commissionAmount: number | null;
    createdAt: Date;
    deleted: boolean;
    isoName: string | null;
    rate: number | null;
    term: string | null;
    refinanceAmount: number | null;
    repayPerPeriod: number | null;
    fees: number | null;
    offer: number | null;
    totalRemit: number | null;
    currentQueue: string | null;
    syndicators: Array<{ syndicatorId: number; name: string; percent: number }>;
};

/** Queues the All Deals (payments) dashboard lists — see applicationStatsBucketWhere "funded". */
const ALL_DEALS_QUEUES = new Set(['funded', 'disbursement', 'disbursment']);

/** Payback = funded × factor, only for a factor-style rate (1–5); matches the sheet's Payback column. */
function paybackFrom(funded: number | null, rate: number | null): number | null {
    if (funded === null || funded <= 0 || rate === null || rate < 1 || rate > 5) return null;
    return Math.round(funded * rate * 100) / 100;
}

export type DealAction = 'create' | 'update' | 'unchanged' | 'conflict';

export type DealPlan = {
    sheetRow: number;
    dealId: string;
    dealName: string;
    action: DealAction;
    matchedBy?: 'dealId' | 'name+funded' | 'name+funded+date';
    crmApplicationId?: string;
    /** Set when the CRM deal had no Deal ID and the sheet's is written onto it. */
    setDealId?: boolean;
    changes: Array<{ field: string; from: unknown; to: unknown }>;
    kept: string[];
    conflict?: string;
    /** Syndicator split to save (CRM names), when the CRM deal has none. */
    fillSyndicators?: Array<{ name: string; percent: number }>;
    /** Row handed to the bulk import when the plan is applied. */
    ingestRow?: Record<string, unknown>;
    /** Matched CRM deal sits in a queue All Deals does not list; move it to Funded. */
    moveToFunded?: boolean;
    /** Matched CRM deal has no payback (OfferDecision.totalRemit); fill it so balances work. */
    setPayback?: number;
};

export type PaymentPlan = {
    sheetRows: number;
    toAdd: Array<SheetPayment & { applicationId: string | null; resolvedDealId: string }>;
    alreadyInCrm: number;
    unmatched: Array<{ sheetRow: number; dealId: string; description: string; amount: number; reason: string }>;
};

export type SheetSyncPlan = {
    generatedAt: string;
    deals: DealPlan[];
    dealCounts: Record<DealAction, number>;
    payments: PaymentPlan;
    /** Funding wires and ISO commission payouts from the bank ledger tab. */
    ledger: LedgerPlan;
    syndicators: {
        columns: string[];
        /** Sheet column → CRM syndicator it maps to. */
        mapped: Record<string, string>;
        /** Columns with no CRM syndicator of that name: held, never auto-created. */
        unknown: string[];
        filledDeals: number;
        differentSplitDeals: Array<{ dealId: string; sheet: string; crm: string }>;
    };
    notes: string[];
};

// ---------------------------------------------------------------------------------------------
// Sheet parsing
// ---------------------------------------------------------------------------------------------

function text(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
}

/** "WILLIE'S FRAME & BODY, INC #1" → "WILLIES FRAME BODY INC": base name for comparisons. */
function nameKey(name: string, keepNumber = false): string {
    const base = keepNumber ? name : baseBusinessNameForClientDedupe(name);
    return base.toUpperCase().replace(/#\s*(\d+)/g, '#$1').replace(/[^A-Z0-9#]+/g, ' ').trim();
}

const dealNumberSuffix = (name: string): string | null => /#\s*(\d+)\s*$/.exec(name)?.[1] ?? null;

/** Percent cell → 0–100. Percent-formatted cells arrive as fractions (1 = 100%). */
function parsePercent(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v * 100 : null;
    const s = text(v);
    if (!s || s === '-') return null;
    const n = Number.parseFloat(s.replace(/[%,\s]/g, ''));
    if (!Number.isFinite(n)) return null;
    return s.includes('%') ? n : n <= 1 ? n * 100 : n;
}

const looksLikePercentCell = (v: unknown): boolean =>
    typeof v === 'number' ? v >= 0 && v <= 1 : /^\s*-?[\d.,]+\s*%\s*$/.test(text(v));

const DAY_MS = 86_400_000;

/**
 * Same calendar day, allowing one day either way: older imports stored dates shifted by the
 * server's time zone (a payment on Jan 19 saved as Jan 18), so exact-day checks miss them.
 */
const sameDay = (a: Date | null, b: Date | null): boolean =>
    !!a && !!b && Math.abs(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) -
        Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) <= DAY_MS;

/** Calendar date a local-noon parsed date stands for, as UTC noon so `@db.Date` keeps the day. */
const asStoredDate = (d: Date): Date => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));

type PaymentKeyInput = { applicationId: string; amount: number; status: string; date: Date; notes: string };

/**
 * Split rows into new ones and ones already stored: same deal, amount, status and description,
 * with the date within a day (see {@link sameDay}). Matching is by multiplicity, so two real
 * identical payments in the sheet need two stored ones to both count as already imported.
 */
async function partitionAgainstStoredPayments<T extends PaymentKeyInput>(
    db: Db,
    rows: T[],
): Promise<{ fresh: T[]; duplicates: number }> {
    const applicationIds = [...new Set(rows.map((r) => r.applicationId))];
    const stored = applicationIds.length
        ? await db.collectionPayment.findMany({
              where: { applicationId: { in: applicationIds } },
              select: { applicationId: true, amount: true, status: true, Date: true, scheduledDate: true, notes: true },
          })
        : [];
    // Stored descriptions sometimes have their spacing squeezed ("R16  Account" → "R16 Account",
    // "VIN  Ending" → "VINEnding"), so whitespace is ignored when comparing.
    const key = (applicationId: string, amount: number, status: string, notes: string | null) =>
        [applicationId, amount.toFixed(2), status.toUpperCase(), String(notes ?? '').replace(/\s+/g, '').toLowerCase()].join('|');
    const pool = new Map<string, Array<{ date: Date | null; used: boolean }>>();
    for (const s of stored) {
        const k = key(s.applicationId, Number(s.amount), String(s.status), s.notes);
        const list = pool.get(k) ?? [];
        list.push({ date: s.Date ?? s.scheduledDate, used: false });
        pool.set(k, list);
    }
    const fresh: T[] = [];
    let duplicates = 0;
    for (const r of rows) {
        const candidates = pool.get(key(r.applicationId, r.amount, r.status, r.notes)) ?? [];
        const hit = candidates.find((c) => !c.used && sameDay(c.date, r.date));
        if (hit) {
            hit.used = true;
            duplicates += 1;
        } else {
            fresh.push(r);
        }
    }
    return { fresh, duplicates };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function parseDealsTab(
    rows: unknown[][],
    config: SheetSyncConfig,
): { deals: SheetDeal[]; syndicatorColumns: string[]; notes: string[] } {
    const notes: string[] = [];
    const header = rows[0] ?? [];
    const dataStart = 1 + config.dealsSkipRowsAfterHeader;
    const data = rows.slice(dataStart);

    const fieldIndex = new Map<DealField, number>();
    const positioned = new Set<number>();
    for (const [field, index] of Object.entries(config.dealColumnPositions ?? {}) as Array<[DealField, number]>) {
        fieldIndex.set(field, index);
        positioned.add(index);
    }
    const ignored = new Set(config.nonSyndicatorColumns);
    const syndicatorColumns: Array<{ index: number; name: string }> = [];
    header.forEach((cell, index) => {
        const name = text(cell);
        const key = normalizeSheetHeader(name);
        if (!key || positioned.has(index)) return;
        const field = config.dealColumns[key];
        if (field) {
            if (!fieldIndex.has(field)) fieldIndex.set(field, index);
            return;
        }
        // A header that is itself a number/percentage ("14.00%") is a stray formula cell.
        if (ignored.has(key) || /^[\d.,%$\s-]+$/.test(name)) return;
        // Syndicator columns hold percentages only — a column with any dollar amount is not one.
        const values = data.map((r) => r[index]).filter((v) => text(v) !== '');
        if (values.every(looksLikePercentCell)) syndicatorColumns.push({ index, name });
    });

    for (const required of ['dealId', 'dealName'] as const) {
        if (!fieldIndex.has(required)) throw new Error(`Deals tab "${config.dealsTab}" has no column for ${required}.`);
    }

    const deals: SheetDeal[] = [];
    data.forEach((row, i) => {
        const sheetRow = dataStart + i + 1;
        const dealId = text(row[fieldIndex.get('dealId')!]).toUpperCase();
        const dealName = text(row[fieldIndex.get('dealName')!]);
        if (!dealId && !dealName) return;

        const fields: Partial<Record<DealField, unknown>> = {};
        for (const [field, index] of fieldIndex) fields[field] = row[index];

        const allocations: SheetDeal['allocations'] = [];
        let allocationIssue: string | null = null;
        for (const column of syndicatorColumns) {
            const raw = row[column.index];
            if (text(raw) === '') continue;
            const percent = parsePercent(raw);
            if (percent === null || percent < 0) {
                allocationIssue = `Syndicator "${column.name}" has an invalid percentage "${text(raw)}".`;
                break;
            }
            if (percent > 0) allocations.push({ column: column.name, percent: Math.round(percent * 10000) / 10000 });
        }
        const total = allocations.reduce((s, a) => s + a.percent, 0);
        if (!allocationIssue && allocations.length && Math.abs(total - 100) > PERCENT_TOLERANCE) {
            allocationIssue = `Syndicator percentages total ${round2(total)}%, expected 100%.`;
        }

        deals.push({
            sheetRow,
            dealId,
            dealName,
            fields,
            funded: parseMoneyToNumber(fields.offer),
            fundedDate: parseExcelDate(fields.date),
            allocations: allocationIssue ? [] : allocations,
            allocationIssue,
        });
    });

    const seen = new Map<string, number>();
    for (const d of deals) {
        if (!d.dealId) continue;
        seen.set(d.dealId, (seen.get(d.dealId) ?? 0) + 1);
    }
    for (const [id, n] of seen) if (n > 1) notes.push(`Deal ID ${id} appears ${n} times in the deals tab.`);

    return { deals, syndicatorColumns: syndicatorColumns.map((c) => c.name), notes };
}

/** Fills blank deal fields from the optional supplement tab (matched by Deal ID). Mutates `deals`. */
export function applySupplementTab(
    deals: SheetDeal[],
    rows: unknown[][] | undefined,
    config: SheetSyncConfig,
    notes: string[],
): void {
    const sup = config.supplementTab;
    if (!sup) return;
    if (!rows?.length) {
        notes.push(`Tab "${sup.name}" not provided; fields it supplies were not filled.`);
        return;
    }
    const header = (rows[0] ?? []).map((h) => normalizeSheetHeader(h));
    const idCol = header.indexOf(sup.dealIdHeader);
    if (idCol < 0) {
        notes.push(`Tab "${sup.name}" has no Deal ID column; skipped.`);
        return;
    }
    const cols = Object.entries(sup.columns)
        .map(([h, field]) => ({ index: header.indexOf(h), field, header: h }))
        .filter((c) => {
            if (c.index < 0) notes.push(`Tab "${sup.name}" has no "${c.header}" column.`);
            return c.index >= 0;
        });
    const byId = new Map<string, unknown[]>();
    for (const row of rows.slice(1 + sup.skipRowsAfterHeader)) {
        const id = text(row[idCol]).toUpperCase();
        if (id && !byId.has(id)) byId.set(id, row);
    }
    for (const d of deals) {
        const row = byId.get(d.dealId);
        if (!row) continue;
        for (const c of cols) {
            if (text(d.fields[c.field]) === '' && text(row[c.index]) !== '') d.fields[c.field] = row[c.index];
        }
    }
}

export function parsePaymentsTab(rows: unknown[][], config: SheetSyncConfig): SheetPayment[] {
    const header = (rows[0] ?? []).map((h) => normalizeSheetHeader(h));
    const col = (name: string): number => {
        const i = header.indexOf(normalizeSheetHeader(name));
        if (i < 0) throw new Error(`Payments tab "${config.paymentsTab}" has no "${name}" column.`);
        return i;
    };
    const c = config.paymentColumns;
    const idx = {
        date: col(c.date),
        description: col(c.description),
        debit: col(c.debit),
        credit: col(c.credit),
        amount: col(c.amount),
        dealId: col(c.dealId),
        returnDate: header.indexOf(normalizeSheetHeader(c.returnDate)),
    };

    const payments: SheetPayment[] = [];
    rows.slice(1).forEach((row, i) => {
        const amount = parseMoneyToNumber(row[idx.amount]);
        const date = parseExcelDate(row[idx.date]);
        // Rows with neither a date nor an amount are padding below the data.
        if (amount === null && !date) return;
        const hasCredit = text(row[idx.credit]) !== '';
        const hasDebit = text(row[idx.debit]) !== '';
        const signed = amount ?? 0;
        // Bounce dates are often formula errors ("#VALUE!"); only real dates are kept.
        const returnRaw = idx.returnDate >= 0 ? row[idx.returnDate] : null;
        const returnDate = text(returnRaw).startsWith('#') ? null : parseExcelDate(returnRaw);
        payments.push({
            sheetRow: i + 2,
            dealId: text(row[idx.dealId]).toUpperCase(),
            date,
            // Kept exactly as written (only trimmed, like the Excel upload): the duplicate check
            // compares descriptions verbatim against stored payments.
            description: String(row[idx.description] ?? '').trim(),
            amount: signed,
            status: hasCredit
                ? CollectionPaymentStatus.CREDIT
                : hasDebit || signed < 0
                  ? CollectionPaymentStatus.DEBIT
                  : CollectionPaymentStatus.CREDIT,
            returnDate,
        });
    });
    return payments;
}

// ---------------------------------------------------------------------------------------------
// CRM snapshot (read-only)
// ---------------------------------------------------------------------------------------------

async function loadCrmDeals(db: Db): Promise<CrmDeal[]> {
    const apps = await db.application.findMany({
        select: {
            id: true,
            dealId: true,
            dealDisplayName: true,
            loanAmount: true,
            status: true,
            type: true,
            commissionAmount: true,
            currentQueue: true,
            createdAt: true,
            deletedAt: true,
            client: { select: { businessName: true } },
            iso: { select: { name: true } },
        },
    });
    const ids = apps.map((a) => a.id);
    const [offers, details] = await Promise.all([
        db.offerDecision.findMany({
            where: { applicationId: { in: ids } },
            select: {
                applicationId: true,
                rate: true,
                term: true,
                refinanceAmount: true,
                repayPerPeriod: true,
                fees: true,
                offer: true,
                totalRemit: true,
            },
        }),
        db.applicationSyndicatorDetails.findMany({
            where: { applicationId: { in: ids } },
            select: { applicationId: true, syndicatorId: true, syndicatorName: true, percentageSyndicated: true },
        }),
    ]);
    const offerByApp = new Map(offers.map((o) => [o.applicationId, o]));
    const detailsByApp = new Map<string, typeof details>();
    for (const d of details) {
        const list = detailsByApp.get(d.applicationId) ?? [];
        list.push(d);
        detailsByApp.set(d.applicationId, list);
    }
    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    return apps.map((a) => {
        const offer = offerByApp.get(a.id);
        return {
            id: a.id,
            dealId: a.dealId ? a.dealId.trim().toUpperCase() : null,
            name: text(a.dealDisplayName || a.client?.businessName),
            loanAmount: a.loanAmount,
            status: a.status ? a.status.toUpperCase() : null,
            type: a.type,
            commissionAmount: a.commissionAmount,
            createdAt: a.createdAt,
            deleted: !!a.deletedAt,
            isoName: a.iso?.name ?? null,
            rate: num(offer?.rate),
            term: offer?.term ?? null,
            refinanceAmount: num(offer?.refinanceAmount),
            repayPerPeriod: num(offer?.repayPerPeriod),
            fees: num(offer?.fees),
            offer: num(offer?.offer),
            totalRemit: num(offer?.totalRemit),
            currentQueue: a.currentQueue ?? null,
            syndicators: (detailsByApp.get(a.id) ?? []).map((d) => ({
                syndicatorId: d.syndicatorId,
                name: d.syndicatorName ?? String(d.syndicatorId),
                percent: Number(d.percentageSyndicated),
            })),
        };
    });
}

/** Sheet syndicator column → existing CRM syndicator (after aliases). Never creates any. */
async function mapSyndicatorColumns(
    db: Db,
    columns: string[],
    config: SheetSyncConfig,
): Promise<{ mapped: Map<string, { id: number; name: string }>; unknown: string[] }> {
    const all = await db.syndicator.findMany({
        select: { id: true, firstName: true, lastName: true, companyName: true },
        orderBy: { id: 'asc' },
    });
    const mapped = new Map<string, { id: number; name: string }>();
    const unknown: string[] = [];
    for (const column of columns) {
        const target = config.syndicatorAliases[column] ?? column;
        const key = syndicatorNameKey(target);
        const match =
            all.find((s) => syndicatorNameKey(s.companyName ?? '') === key) ??
            all.find((s) => syndicatorNameKey(s.firstName) === key && !text(s.lastName));
        if (match) mapped.set(column, { id: match.id, name: text(match.companyName) || match.firstName });
        else unknown.push(column);
    }
    return { mapped, unknown };
}

// ---------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------

type MatchResult =
    | { kind: 'match'; crm: CrmDeal; by: NonNullable<DealPlan['matchedBy']>; setDealId: boolean }
    | { kind: 'none' }
    | { kind: 'conflict'; reason: string; crm?: CrmDeal };

function matchDeal(deal: SheetDeal, crmById: Map<string, CrmDeal[]>, crmLive: CrmDeal[]): MatchResult {
    const sheetBase = nameKey(deal.dealName);
    if (deal.dealId) {
        const byId = crmById.get(deal.dealId) ?? [];
        if (byId.length > 1) return { kind: 'conflict', reason: `Deal ID is used by ${byId.length} CRM deals.` };
        if (byId.length === 1) {
            const crm = byId[0];
            if (crm.deleted) return { kind: 'conflict', reason: 'Deal ID belongs to a deleted CRM deal.', crm };
            if (nameKey(crm.name) !== sheetBase) {
                return { kind: 'conflict', reason: `Deal ID matches, but the CRM name is "${crm.name}".`, crm };
            }
            return { kind: 'match', crm, by: 'dealId', setDealId: false };
        }
    }

    // No Deal ID match: same name (including "#N" when the sheet has one) and same funded amount.
    const sheetNumber = dealNumberSuffix(deal.dealName);
    const byName = crmLive.filter((c) =>
        sheetNumber
            ? nameKey(c.name, true) === nameKey(deal.dealName, true) ||
              (nameKey(c.name) === sheetBase && !dealNumberSuffix(c.name))
            : nameKey(c.name) === sheetBase,
    );
    if (!byName.length) return { kind: 'none' };

    const byFunded = byName.filter(
        (c) => deal.funded !== null && c.loanAmount !== null && Math.abs(c.loanAmount - deal.funded) <= MONEY_TOLERANCE,
    );
    if (!byFunded.length) {
        // Same client, different amount: a new (repeat) deal unless the CRM one has no Deal ID yet.
        const idless = byName.filter((c) => !c.dealId);
        if (idless.length) {
            return {
                kind: 'conflict',
                reason: `Name matches CRM deal "${idless[0].name}" (no Deal ID) but the funded amount differs.`,
            };
        }
        return { kind: 'none' };
    }
    let candidates = byFunded;
    let by: NonNullable<DealPlan['matchedBy']> = 'name+funded';
    if (candidates.length > 1) {
        candidates = candidates.filter((c) => sameDay(c.createdAt, deal.fundedDate));
        by = 'name+funded+date';
    }
    if (candidates.length !== 1) {
        return { kind: 'conflict', reason: `Name + funded amount match ${byFunded.length} CRM deals.` };
    }
    const crm = candidates[0];
    if (crm.dealId && crm.dealId !== deal.dealId) {
        // Same name and amount but a different Deal ID: a separate deal the CRM already has.
        return { kind: 'none' };
    }
    return { kind: 'match', crm, by, setDealId: !crm.dealId && !!deal.dealId };
}

function describeSplit(list: Array<{ name: string; percent: number }>): string {
    return list
        .map((s) => `${s.name} ${round2(s.percent)}%`)
        .sort()
        .join(', ');
}

function planDeal(
    deal: SheetDeal,
    match: MatchResult,
    syndicatorMap: Map<string, { id: number; name: string }>,
    unknownSyndicators: Set<string>,
    differentSplits: SheetSyncPlan['syndicators']['differentSplitDeals'],
): DealPlan {
    const base: DealPlan = {
        sheetRow: deal.sheetRow,
        dealId: deal.dealId,
        dealName: deal.dealName,
        action: 'unchanged',
        changes: [],
        kept: [],
    };
    if (!deal.dealId) return { ...base, action: 'conflict', conflict: 'Row has no Deal ID.' };
    if (match.kind === 'conflict') {
        return { ...base, action: 'conflict', conflict: match.reason, crmApplicationId: match.crm?.id };
    }

    const f = deal.fields;
    const type = mapApplicationType(f.type).value;
    const status = mapApplicationStatus(f.status).value;
    // Same parsing the import stores with, so a stored rate compares equal on the next sync.
    const rate = parseRateToNumber(f.rate);
    const commission = parseMoneyToNumber(f.commission);
    const refi = parseMoneyToNumber(f.refinanceAmount);
    const daily = parseMoneyToNumber(f.repayPerPeriod);
    const termText = text(f.term);
    const iso = text(f.iso);

    // Syndicator split in CRM names; held when any column has no CRM syndicator.
    let split: Array<{ name: string; percent: number }> | null = null;
    if (deal.allocations.length) {
        const missing = deal.allocations.filter((a) => unknownSyndicators.has(a.column));
        if (!missing.length) {
            split = deal.allocations.map((a) => ({ name: syndicatorMap.get(a.column)!.name, percent: a.percent }));
        } else {
            base.kept.push(`syndicators held: no CRM syndicator named ${missing.map((m) => `"${m.column}"`).join(', ')}`);
        }
    } else if (deal.allocationIssue) {
        base.kept.push(`syndicators not changed: ${deal.allocationIssue}`);
    }

    const ingestRow: Record<string, unknown> = {
        __excelRow: deal.sheetRow,
        dealId: deal.dealId,
        dealName: deal.dealName,
        date: '',
        type: '',
        status: '',
        offer: '',
        fees: '',
        rate: '',
        commission: '',
        iso: '',
        term: '',
        repayPerPeriod: '',
        refinanceAmount: '',
        reverseAmount: '',
        __syndicators: null,
    };

    if (match.kind === 'none') {
        if (!deal.fundedDate) return { ...base, action: 'conflict', conflict: 'New deal has no valid funded date.' };
        Object.assign(ingestRow, {
            date: f.date,
            type: f.type ?? '',
            status: f.status ?? '',
            offer: f.offer ?? '',
            rate: f.rate ?? '',
            commission: f.commission ?? '',
            fees: f.fees ?? '',
            iso: f.iso ?? '',
            term: f.term ?? '',
            repayPerPeriod: f.repayPerPeriod ?? '',
            refinanceAmount: f.refinanceAmount ?? '',
        });
        if (split) {
            ingestRow.__syndicators = { allocations: split, issue: null } satisfies ParsedRowSyndicators;
        }
        return { ...base, action: 'create', fillSyndicators: split ?? undefined, ingestRow };
    }

    const crm = match.crm;
    const plan: DealPlan = {
        ...base,
        matchedBy: match.by,
        crmApplicationId: crm.id,
        setDealId: match.setDealId,
        ingestRow,
    };
    // Keep the CRM's display name ("ACME #1") when the sheet only drops the "#N".
    ingestRow.dealName = crm.name || deal.dealName;
    if (match.setDealId) plan.changes.push({ field: 'dealId', from: crm.dealId, to: deal.dealId });

    let ingestNeeded = false;
    const change = (field: string, from: unknown, to: unknown, ingestKey: string, ingestValue: unknown) => {
        plan.changes.push({ field, from, to });
        ingestRow[ingestKey] = ingestValue;
        ingestNeeded = true;
    };

    // Every deal on the sheet is a live/funded book deal, so it must be listed on All Deals.
    if (!ALL_DEALS_QUEUES.has(text(crm.currentQueue).toLowerCase())) {
        plan.moveToFunded = true;
        plan.changes.push({ field: 'queue', from: crm.currentQueue, to: 'Funded' });
    }
    const fees = parseMoneyToNumber(f.fees);

    if (status && status !== crm.status) {
        const from = crm.status ? STATUS_RANK[crm.status] : undefined;
        const to = STATUS_RANK[status];
        if (from === undefined && crm.status) plan.kept.push(`status kept "${crm.status}" (sheet "${status}"): unknown CRM status`);
        else if (to === undefined) plan.kept.push(`status kept "${crm.status}" (sheet "${status}"): unknown sheet status`);
        else if (from !== undefined && to < from) plan.kept.push(`status kept "${crm.status}" (sheet "${status}" is behind)`);
        else change('status', crm.status, status, 'status', f.status);
    }
    if (deal.funded !== null && (crm.loanAmount === null || Math.abs(crm.loanAmount - deal.funded) > MONEY_TOLERANCE)) {
        if (crm.loanAmount === null) change('funded', null, deal.funded, 'offer', f.offer);
        else plan.kept.push(`funded kept ${crm.loanAmount} (sheet ${deal.funded})`);
    }
    if (type && type !== text(crm.type).toUpperCase()) change('type', crm.type, type, 'type', f.type);
    if (rate !== null && (crm.rate === null || Math.abs(crm.rate - rate) > 0.0001)) change('rate', crm.rate, rate, 'rate', f.rate);
    if (commission !== null && (crm.commissionAmount === null || Math.abs(crm.commissionAmount - commission) > MONEY_TOLERANCE)) {
        change('commission', crm.commissionAmount, commission, 'commission', f.commission);
    }
    if (fees !== null && (crm.fees === null || Math.abs(crm.fees - fees) > MONEY_TOLERANCE)) {
        change('fees', crm.fees, fees, 'fees', f.fees);
    }
    if (crm.totalRemit === null) {
        const payback = paybackFrom(crm.offer ?? crm.loanAmount ?? deal.funded, rate ?? crm.rate);
        if (payback !== null) {
            plan.setPayback = payback;
            plan.changes.push({ field: 'payback', from: null, to: payback });
        }
    }
    if (refi !== null && refi !== 0 && (crm.refinanceAmount === null || Math.abs(crm.refinanceAmount - refi) > MONEY_TOLERANCE)) {
        change('refinanceAmount', crm.refinanceAmount, refi, 'refinanceAmount', f.refinanceAmount);
    }
    if (daily !== null && daily !== 0 && (crm.repayPerPeriod === null || Math.abs(crm.repayPerPeriod - daily) > MONEY_TOLERANCE)) {
        change('repayPerPeriod', crm.repayPerPeriod, daily, 'repayPerPeriod', f.repayPerPeriod);
    }
    // "35 Days" in the sheet and "35" in the CRM are the same term.
    const sheetTermDays = parseContractLengthDaysFromOfferTerm(f.term);
    const crmTermDays = parseContractLengthDaysFromOfferTerm(crm.term);
    const termDiffers =
        sheetTermDays !== null && crmTermDays !== null
            ? sheetTermDays !== crmTermDays
            : normalizeTermForOfferDecision(f.term) !== crm.term;
    if (termText && termDiffers) {
        change('term', crm.term, normalizeTermForOfferDecision(f.term), 'term', f.term);
    }
    if (iso && iso.toLowerCase() !== text(crm.isoName).toLowerCase()) change('iso', crm.isoName, iso, 'iso', f.iso);
    if (deal.fundedDate && !sameDay(deal.fundedDate, crm.createdAt)) {
        change('fundedDate', crm.createdAt.toISOString().slice(0, 10), deal.fundedDate.toISOString().slice(0, 10), 'date', f.date);
    }

    if (split) {
        if (!crm.syndicators.length) {
            plan.fillSyndicators = split;
            plan.changes.push({ field: 'syndicators', from: null, to: describeSplit(split) });
            ingestRow.__syndicators = { allocations: split, issue: null } satisfies ParsedRowSyndicators;
            ingestNeeded = true;
        } else if (describeSplit(split) !== describeSplit(crm.syndicators)) {
            plan.kept.push(`syndicators kept (CRM ${describeSplit(crm.syndicators)}; sheet ${describeSplit(split)})`);
            differentSplits.push({ dealId: deal.dealId, sheet: describeSplit(split), crm: describeSplit(crm.syndicators) });
        }
    }

    plan.action = plan.changes.length ? 'update' : 'unchanged';
    // Queue / payback / Deal ID fixes are applied directly; only field changes go through the import.
    if (!ingestNeeded) delete plan.ingestRow;
    return plan;
}

/** First 10 letters/digits of a name, as bank descriptions truncate merchant names. */
const descriptionKey = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]+/g, '');

async function planPayments(
    db: Db,
    payments: SheetPayment[],
    deals: DealPlan[],
    crm: CrmDeal[],
): Promise<PaymentPlan> {
    const plan: PaymentPlan = { sheetRows: payments.length, toAdd: [], alreadyInCrm: 0, unmatched: [] };
    const liveById = new Map<string, CrmDeal>();
    for (const c of crm) if (c.dealId && !c.deleted && !liveById.has(c.dealId)) liveById.set(c.dealId, c);
    const planById = new Map(deals.filter((d) => d.dealId).map((d) => [d.dealId, d]));

    const resolved: Array<SheetPayment & { applicationId: string | null; resolvedDealId: string }> = [];
    for (const p of payments) {
        if (!p.date) {
            plan.unmatched.push({ sheetRow: p.sheetRow, dealId: p.dealId, description: p.description, amount: p.amount, reason: 'No valid date.' });
            continue;
        }
        let dealId = p.dealId;
        if (!dealId) {
            // No Deal ID: the merchant name inside the bank description, funded on/before the payment.
            const desc = descriptionKey(p.description);
            const hits = crm.filter((c) => {
                if (c.deleted || !c.dealId || c.createdAt > p.date!) return false;
                const key = descriptionKey(baseBusinessNameForClientDedupe(c.name)).slice(0, 10);
                return key.length >= 6 && desc.includes(key);
            });
            const latest = hits.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            if (latest.length === 1 || (latest.length > 1 && nameKey(latest[0].name) !== nameKey(latest[1].name))) {
                dealId = latest[0].dealId!;
            } else {
                plan.unmatched.push({
                    sheetRow: p.sheetRow,
                    dealId: '',
                    description: p.description,
                    amount: p.amount,
                    reason: latest.length ? `Description matches ${latest.length} deals.` : 'No Deal ID and no deal name found in description.',
                });
                continue;
            }
        }
        const dealPlan = planById.get(dealId);
        if (dealPlan?.action === 'conflict') {
            plan.unmatched.push({ sheetRow: p.sheetRow, dealId, description: p.description, amount: p.amount, reason: 'Deal is a conflict in this sync.' });
            continue;
        }
        const crmDeal = dealPlan?.crmApplicationId ? crm.find((c) => c.id === dealPlan.crmApplicationId) : liveById.get(dealId);
        if (!crmDeal && dealPlan?.action !== 'create') {
            plan.unmatched.push({ sheetRow: p.sheetRow, dealId, description: p.description, amount: p.amount, reason: 'Deal not in CRM or deals tab.' });
            continue;
        }
        resolved.push({ ...p, applicationId: crmDeal?.id ?? null, resolvedDealId: dealId });
    }

    // Deals created by this sync have no stored payments yet; the rest are checked against the CRM.
    const known = resolved
        .filter((p) => p.applicationId)
        .map((p) => ({ ...p, applicationId: p.applicationId!, date: p.date!, notes: p.description }));
    const { fresh, duplicates } = await partitionAgainstStoredPayments(db, known);
    plan.alreadyInCrm = duplicates;
    plan.toAdd = [
        ...fresh.map(({ notes: _notes, ...p }) => p),
        ...resolved.filter((p) => !p.applicationId),
    ];
    return plan;
}

/** Reads the sheet tabs and the CRM; writes nothing. Run it inside a read-only transaction. */
export async function planSheetSync(db: Db, tabs: SheetTabs, config: SheetSyncConfig): Promise<SheetSyncPlan> {
    const { deals, syndicatorColumns, notes } = parseDealsTab(tabs[config.dealsTab] ?? [], config);
    applySupplementTab(deals, config.supplementTab ? tabs[config.supplementTab.name] : undefined, config, notes);
    const payments = parsePaymentsTab(tabs[config.paymentsTab] ?? [], config);
    const crm = await loadCrmDeals(db);
    const { mapped, unknown } = await mapSyndicatorColumns(db, syndicatorColumns, config);
    const unknownSet = new Set(unknown);

    const crmById = new Map<string, CrmDeal[]>();
    for (const c of crm) {
        if (!c.dealId) continue;
        const list = crmById.get(c.dealId) ?? [];
        list.push(c);
        crmById.set(c.dealId, list);
    }
    const crmLive = crm.filter((c) => !c.deleted);

    const differentSplitDeals: SheetSyncPlan['syndicators']['differentSplitDeals'] = [];
    const seenIds = new Set<string>();
    const dealPlans = deals.map((d) => {
        if (d.dealId && seenIds.has(d.dealId)) {
            return {
                sheetRow: d.sheetRow,
                dealId: d.dealId,
                dealName: d.dealName,
                action: 'conflict' as const,
                changes: [],
                kept: [],
                conflict: 'Duplicate Deal ID in the deals tab; only the first row is used.',
            };
        }
        if (d.dealId) seenIds.add(d.dealId);
        return planDeal(d, matchDeal(d, crmById, crmLive), mapped, unknownSet, differentSplitDeals);
    });

    const dealCounts: Record<DealAction, number> = { create: 0, update: 0, unchanged: 0, conflict: 0 };
    for (const d of dealPlans) dealCounts[d.action] += 1;

    const filled = dealPlans.filter((d) => d.fillSyndicators && d.action !== 'create');
    if (filled.length) {
        notes.push(
            `${filled.length} existing deals get syndicators for the first time. Their past payments are NOT split to those ` +
                'syndicators (that would credit syndicator wallets); only payments added from now on are.',
        );
    }

    // Ledger entries attach to deals the sync keeps; commission owed comes from the deals tab.
    const sheetDealById = new Map(deals.map((d) => [d.dealId, d]));
    const ledgerDeals = new Map<string, { commissionOwed: number | null }>();
    for (const d of dealPlans) {
        if (!d.dealId || d.action === 'conflict') continue;
        ledgerDeals.set(d.dealId, { commissionOwed: parseMoneyToNumber(sheetDealById.get(d.dealId)?.fields.commission) });
    }
    const ledger = await planLedger(
        db,
        config.ledgerTab ? tabs[config.ledgerTab.name] : undefined,
        config,
        ledgerDeals,
        notes,
    );

    return {
        generatedAt: new Date().toISOString(),
        deals: dealPlans,
        dealCounts,
        ledger,
        payments: await planPayments(db, payments, dealPlans, crm),
        syndicators: {
            columns: syndicatorColumns,
            mapped: Object.fromEntries([...mapped].map(([column, s]) => [column, s.name])),
            unknown,
            filledDeals: dealPlans.filter((d) => d.fillSyndicators).length,
            differentSplitDeals,
        },
        notes,
    };
}

// ---------------------------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------------------------

export type SheetSyncApplyResult = {
    deals: BulkImportSummary | null;
    dealIdsSet: number;
    dealsMovedToFunded: number;
    paybacksSet: number;
    ledger: LedgerApplyResult | null;
    paymentsAdded: number;
    paymentsSkippedAsDuplicate: number;
    paymentErrors: string[];
};

/** Writes the plan: deal creates/updates via the bulk import, then new payments. */
export async function applySheetSync(plan: SheetSyncPlan, actorUserId: string): Promise<SheetSyncApplyResult> {
    const result: SheetSyncApplyResult = {
        deals: null,
        dealIdsSet: 0,
        dealsMovedToFunded: 0,
        paybacksSet: 0,
        ledger: null,
        paymentsAdded: 0,
        paymentsSkippedAsDuplicate: 0,
        paymentErrors: [],
    };

    // Name-matched CRM deals without a Deal ID get the sheet's, so the import updates them
    // instead of creating a second copy.
    for (const d of plan.deals) {
        if (!d.setDealId || !d.crmApplicationId) continue;
        await prisma.application.update({ where: { id: d.crmApplicationId }, data: { dealId: d.dealId } });
        result.dealIdsSet += 1;
    }

    // Sheet deals parked in another queue: list them on All Deals.
    for (const d of plan.deals) {
        if (!d.moveToFunded || !d.crmApplicationId || d.action === 'conflict') continue;
        await prisma.application.update({
            where: { id: d.crmApplicationId },
            data: { currentQueue: 'Funded', currentState: 'FUNDED' },
        });
        result.dealsMovedToFunded += 1;
    }

    // Missing payback (totalRemit) makes the dashboard balance read 0; only ever fills an empty value.
    for (const d of plan.deals) {
        if (d.setPayback === undefined || !d.crmApplicationId || d.action === 'conflict') continue;
        const { count } = await prisma.offerDecision.updateMany({
            where: { applicationId: d.crmApplicationId, totalRemit: null },
            data: { totalRemit: d.setPayback },
        });
        result.paybacksSet += count;
    }

    const ingestRows = plan.deals.filter((d) => d.ingestRow && (d.action === 'create' || d.action === 'update'));
    if (ingestRows.length) {
        const syndicatorNames = [
            ...new Set(ingestRows.flatMap((d) => (d.fillSyndicators ?? []).map((s) => s.name))),
        ];
        result.deals = await ingestApplicationBulkRows(
            ingestRows.map((d) => d.ingestRow!),
            actorUserId,
            undefined,
            { syndicatorColumns: syndicatorNames },
        );
    }

    // Deals exist now (created above), so every ledger Deal ID resolves.
    result.ledger = await applyLedger(plan.ledger);

    if (!plan.payments.toAdd.length) return result;

    // Resolve applications again: deals created above now exist.
    const dealIds = [...new Set(plan.payments.toAdd.map((p) => p.resolvedDealId))];
    const apps = await prisma.application.findMany({
        where: { dealId: { in: dealIds, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, dealId: true },
    });
    const appByDealId = new Map(apps.map((a) => [String(a.dealId).toUpperCase(), a.id]));

    const candidates: Array<PaymentKeyInput & { row: Prisma.CollectionPaymentCreateManyInput }> = [];
    for (const p of plan.payments.toAdd) {
        const applicationId = p.applicationId ?? appByDealId.get(p.resolvedDealId);
        if (!applicationId) {
            result.paymentErrors.push(`Sheet row ${p.sheetRow}: deal ${p.resolvedDealId} was not created; payment skipped.`);
            continue;
        }
        const date = asStoredDate(p.date!);
        candidates.push({
            applicationId,
            amount: p.amount,
            status: p.status,
            date,
            notes: p.description,
            row: {
                applicationId,
                dealId: p.resolvedDealId,
                amount: new Prisma.Decimal(p.amount),
                Date: date,
                scheduledDate: date,
                returnDate: p.returnDate ? asStoredDate(p.returnDate) : null,
                status: p.status,
                source: CollectionPaymentSource.MANUAL,
                notes: p.description,
            },
        });
    }

    // Re-check against the database right before inserting, in case anything changed since the plan.
    const recheck = await partitionAgainstStoredPayments(prisma, candidates);
    const fresh = recheck.fresh.map((c) => c.row);
    result.paymentsSkippedAsDuplicate = recheck.duplicates;

    for (let i = 0; i < fresh.length; i += PAYMENT_INSERT_CHUNK) {
        const chunk = fresh.slice(i, i + PAYMENT_INSERT_CHUNK);
        const label = `Payments ${i + 1}-${i + chunk.length}`;
        try {
            await prisma.collectionPayment.createMany({ data: chunk });
            result.paymentsAdded += chunk.length;
        } catch (err) {
            result.paymentErrors.push(`${label} not added: ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }
        try {
            await distributeSyndicatorCreditsForPayments(prisma, chunk);
        } catch (err) {
            result.paymentErrors.push(
                `${label} added, but splitting them to syndicators failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
    return result;
}
