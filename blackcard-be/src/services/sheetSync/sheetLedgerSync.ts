import { DealLedgerKind, IsoApplicationPayoutStatus, Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../config/prismaClient';
import { parseExcelDate, parseMoneyToNumber } from '../applicationBulkExcelIngestService';
import { normalizeSheetHeader, type SheetSyncConfig } from './sheetSyncConfig';

/**
 * Bank ledger tab (Bank1) → DealLedgerEntry: funding wires to merchants and ISO commission payouts.
 *
 * The sheet is the source: an applied sync adds entries the CRM is missing and removes SHEET_SYNC
 * entries no longer on the sheet, for deals listed on the deals tab. When a deal's commission
 * payouts reach the commission owed, its PENDING ISO payout is marked PAID (never moved back).
 */

type Db = PrismaClient | Prisma.TransactionClient;

const MONEY_TOLERANCE = 0.5;
const SOURCE = 'SHEET_SYNC';

export type SheetLedgerEntry = {
    sheetRow: number;
    dealId: string;
    kind: DealLedgerKind;
    date: Date;
    /** Paid out = positive; returned (e.g. a wire bounced back) = negative. */
    amount: number;
    description: string;
};

export type LedgerPlan = {
    /** False when the ledger tab was not provided: nothing is added, removed or marked. */
    enabled: boolean;
    sheetRows: number;
    toAdd: SheetLedgerEntry[];
    /** Stored SHEET_SYNC entry ids that are no longer on the sheet. */
    toRemove: Array<{ id: string; dealId: string; kind: DealLedgerKind; date: string; amount: number; description: string }>;
    alreadyInCrm: number;
    unmatched: Array<{ sheetRow: number; dealId: string; kind: DealLedgerKind; amount: number; reason: string }>;
    /** Deals whose commission is fully paid on the sheet: their PENDING ISO payout becomes PAID. */
    commissionPaid: Array<{ dealId: string; owed: number; paid: number; paidAt: string }>;
    totals: { fundingWired: number; commissionPaid: number };
};

const text = (v: unknown): string =>
    v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Calendar day at UTC noon, the same convention the payment sync stores. */
const asStoredDate = (d: Date): Date => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

const entryKey = (e: { dealId: string; kind: string; date: Date; amount: number; description: string }): string =>
    `${e.dealId}|${e.kind}|${dayKey(e.date)}|${round2(e.amount).toFixed(2)}|${e.description}`;

export function parseLedgerTab(rows: unknown[][], config: SheetSyncConfig): SheetLedgerEntry[] {
    const lt = config.ledgerTab;
    if (!lt) return [];
    const header = (rows[0] ?? []).map((h) => normalizeSheetHeader(h));
    const col = (name: string): number => {
        const i = header.indexOf(normalizeSheetHeader(name));
        if (i < 0) throw new Error(`Ledger tab "${lt.name}" has no "${name}" column.`);
        return i;
    };
    const idx = {
        date: col(lt.columns.date),
        description: col(lt.columns.description),
        amount: col(lt.columns.amount),
        dealId: col(lt.columns.dealId),
        type: col(lt.columns.type),
    };
    const kinds = new Map(Object.entries(lt.kinds).map(([k, v]) => [normalizeSheetHeader(k), v]));

    const out: SheetLedgerEntry[] = [];
    rows.slice(1).forEach((row, i) => {
        const kind = kinds.get(normalizeSheetHeader(row[idx.type]));
        if (!kind) return;
        const dealId = text(row[idx.dealId]).toUpperCase();
        const date = parseExcelDate(row[idx.date]);
        const signed = parseMoneyToNumber(row[idx.amount]);
        if (!dealId || !date || signed === null || signed === 0) return;
        out.push({
            sheetRow: i + 2,
            dealId,
            kind: kind as DealLedgerKind,
            date: asStoredDate(date),
            // Bank amounts are negative for money leaving the account; store money paid out as positive.
            amount: round2(-signed),
            description: String(row[idx.description] ?? '').trim(),
        });
    });
    return out;
}

/**
 * Read-only. `sheetDeals` are the deals tab rows that the sync will keep in the CRM (not conflicts),
 * with the commission owed from the sheet.
 */
export async function planLedger(
    db: Db,
    rows: unknown[][] | undefined,
    config: SheetSyncConfig,
    sheetDeals: Map<string, { commissionOwed: number | null }>,
    notes: string[],
): Promise<LedgerPlan> {
    const plan: LedgerPlan = {
        enabled: false,
        sheetRows: 0,
        toAdd: [],
        toRemove: [],
        alreadyInCrm: 0,
        unmatched: [],
        commissionPaid: [],
        totals: { fundingWired: 0, commissionPaid: 0 },
    };
    if (!config.ledgerTab) return plan;
    if (!rows?.length) {
        notes.push(`Tab "${config.ledgerTab.name}" not provided; funding and commission entries were not synced.`);
        return plan;
    }
    plan.enabled = true;

    const entries = parseLedgerTab(rows, config);
    plan.sheetRows = entries.length;
    const wanted: SheetLedgerEntry[] = [];
    for (const e of entries) {
        if (!sheetDeals.has(e.dealId)) {
            plan.unmatched.push({ sheetRow: e.sheetRow, dealId: e.dealId, kind: e.kind, amount: e.amount, reason: 'Deal not on the deals tab (or a conflict).' });
            continue;
        }
        wanted.push(e);
    }

    // Diff by multiset of keys, so two identical wires on the same day both count.
    const stored = await db.dealLedgerEntry.findMany({
        where: { source: SOURCE, dealId: { in: [...sheetDeals.keys()] } },
        select: { id: true, dealId: true, kind: true, entryDate: true, amount: true, description: true },
    });
    const storedByKey = new Map<string, typeof stored>();
    for (const s of stored) {
        const key = entryKey({ dealId: s.dealId, kind: s.kind, date: s.entryDate, amount: Number(s.amount), description: s.description });
        const list = storedByKey.get(key) ?? [];
        list.push(s);
        storedByKey.set(key, list);
    }
    for (const e of wanted) {
        const list = storedByKey.get(entryKey(e));
        if (list?.length) {
            list.pop();
            plan.alreadyInCrm += 1;
        } else {
            plan.toAdd.push(e);
        }
    }
    for (const list of storedByKey.values()) {
        for (const s of list) {
            plan.toRemove.push({
                id: s.id,
                dealId: s.dealId,
                kind: s.kind,
                date: dayKey(s.entryDate),
                amount: Number(s.amount),
                description: s.description,
            });
        }
    }

    // Totals and fully-paid commissions, from the sheet (the state the CRM will match).
    const commissionByDeal = new Map<string, { paid: number; last: Date }>();
    for (const e of wanted) {
        if (e.kind === 'FUNDING') plan.totals.fundingWired += e.amount;
        else {
            plan.totals.commissionPaid += e.amount;
            const c = commissionByDeal.get(e.dealId) ?? { paid: 0, last: e.date };
            c.paid += e.amount;
            if (e.date > c.last) c.last = e.date;
            commissionByDeal.set(e.dealId, c);
        }
    }
    plan.totals.fundingWired = round2(plan.totals.fundingWired);
    plan.totals.commissionPaid = round2(plan.totals.commissionPaid);
    for (const [dealId, c] of commissionByDeal) {
        const owed = sheetDeals.get(dealId)?.commissionOwed ?? null;
        if (owed !== null && owed > 0 && c.paid >= owed - MONEY_TOLERANCE) {
            plan.commissionPaid.push({ dealId, owed, paid: round2(c.paid), paidAt: dayKey(c.last) });
        }
    }
    return plan;
}

export type LedgerApplyResult = { added: number; removed: number; payoutsMarkedPaid: number; errors: string[] };

/** Writes the ledger plan. Run after deals are created so every Deal ID resolves to an application. */
export async function applyLedger(plan: LedgerPlan): Promise<LedgerApplyResult> {
    const result: LedgerApplyResult = { added: 0, removed: 0, payoutsMarkedPaid: 0, errors: [] };
    if (!plan.enabled) return result;

    const dealIds = [...new Set([...plan.toAdd.map((e) => e.dealId), ...plan.commissionPaid.map((c) => c.dealId)])];
    const apps = await prisma.application.findMany({
        where: { dealId: { in: dealIds, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, dealId: true },
    });
    const appByDealId = new Map(apps.map((a) => [String(a.dealId).toUpperCase(), a.id]));

    const rows: Prisma.DealLedgerEntryCreateManyInput[] = [];
    for (const e of plan.toAdd) {
        const applicationId = appByDealId.get(e.dealId);
        if (!applicationId) {
            result.errors.push(`Sheet row ${e.sheetRow}: deal ${e.dealId} not in CRM; ${e.kind.toLowerCase()} entry skipped.`);
            continue;
        }
        rows.push({
            applicationId,
            dealId: e.dealId,
            kind: e.kind,
            entryDate: e.date,
            amount: e.amount,
            description: e.description,
            source: SOURCE,
        });
    }

    await prisma.$transaction(async (tx) => {
        if (plan.toRemove.length) {
            const { count } = await tx.dealLedgerEntry.deleteMany({
                where: { id: { in: plan.toRemove.map((r) => r.id) }, source: SOURCE },
            });
            result.removed = count;
        }
        if (rows.length) {
            const { count } = await tx.dealLedgerEntry.createMany({ data: rows });
            result.added = count;
        }
    });

    for (const c of plan.commissionPaid) {
        const applicationId = appByDealId.get(c.dealId);
        if (!applicationId) continue;
        const { count } = await prisma.isoApplicationPayout.updateMany({
            where: { applicationId, payoutStatus: IsoApplicationPayoutStatus.PENDING },
            data: { payoutStatus: IsoApplicationPayoutStatus.PAID, paidAt: new Date(`${c.paidAt}T12:00:00Z`) },
        });
        result.payoutsMarkedPaid += count;
    }
    return result;
}
