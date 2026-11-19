import crypto from 'crypto';
import prisma from '../../config/prismaClient';
import { BLACKCARD_SHEET_SYNC_CONFIG as config } from './sheetSyncConfig';
import { readSheetTabs, type SheetTabs } from './sheetSource';
import { planSheetSync, applySheetSync, type SheetSyncPlan, type SheetSyncApplyResult } from './sheetSyncService';

/**
 * Runs a sheet sync in the background and keeps the latest runs in memory, for the push route
 * (Apps Script), the pull route and the daily job alike.
 *
 * Dry run by default: the plan is built in a READ ONLY transaction. A run writes only when
 * SHEET_SYNC_PUSH_APPLY=true AND SHEET_SYNC_ALLOW_WRITE_HOST equals the database host, so a
 * misconfigured env cannot change the wrong database. New deals are recorded as created by
 * SHEET_SYNC_ACTOR_USER_ID.
 */

export type SyncRun = {
    id: string;
    source: 'push' | 'link';
    receivedAt: string;
    finishedAt: string | null;
    state: 'running' | 'done' | 'failed';
    mode: 'dry-run' | 'apply';
    writesDisabledBecause: string | null;
    tabs: Record<string, number>;
    summary: ReturnType<typeof summarize> | null;
    applied: (Omit<SheetSyncApplyResult, 'deals'> & { dealsCreated: number; dealsUpdated: number; dealErrors: number }) | null;
    error: string | null;
};

const MAX_RUNS_KEPT = 20;
const runs: SyncRun[] = [];
let running = false;

export const isSheetSyncRunning = (): boolean => running;

export function getSheetSyncRun(id?: string | null): SyncRun | undefined {
    return id ? runs.find((r) => r.id === id) : runs[0];
}

function writesAllowed(): { ok: boolean; reason?: string } {
    if (process.env.SHEET_SYNC_PUSH_APPLY !== 'true') return { ok: false, reason: 'SHEET_SYNC_PUSH_APPLY is not true' };
    const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://x').hostname;
    if (process.env.SHEET_SYNC_ALLOW_WRITE_HOST !== dbHost) {
        return { ok: false, reason: 'SHEET_SYNC_ALLOW_WRITE_HOST does not match the database host' };
    }
    if (!process.env.SHEET_SYNC_ACTOR_USER_ID) return { ok: false, reason: 'SHEET_SYNC_ACTOR_USER_ID is not set' };
    return { ok: true };
}

/** What the plan would do, small enough to read in a log or the Apps Script pop-up. */
function summarize(plan: SheetSyncPlan) {
    const p = plan.payments;
    return {
        dealCounts: plan.dealCounts,
        dealsToCreate: plan.deals.filter((d) => d.action === 'create').map((d) => d.dealId),
        conflicts: plan.deals
            .filter((d) => d.action === 'conflict')
            .map((d) => ({ dealId: d.dealId, dealName: d.dealName, reason: d.conflict ?? null })),
        payments: {
            sheetRows: p.sheetRows,
            alreadyInCrm: p.alreadyInCrm,
            toAdd: p.toAdd.length,
            toAddTotal: Math.round(p.toAdd.reduce((s, x) => s + x.amount, 0) * 100) / 100,
            unmatched: p.unmatched.slice(0, 50),
            unmatchedCount: p.unmatched.length,
        },
        syndicators: {
            mapped: plan.syndicators.mapped,
            held: plan.syndicators.unknown,
            filledDeals: plan.syndicators.filledDeals,
            differentSplitDeals: plan.syndicators.differentSplitDeals.length,
        },
        notes: plan.notes,
    };
}

async function execute(run: SyncRun, loadTabs: () => Promise<SheetTabs>): Promise<void> {
    try {
        const tabs = await loadTabs();
        run.tabs = Object.fromEntries(Object.entries(tabs).map(([name, rows]) => [name, rows.length]));
        const plan = await prisma.$transaction(
            async (tx) => {
                await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
                return planSheetSync(tx, tabs, config);
            },
            { maxWait: 90_000, timeout: 600_000 },
        );
        run.summary = summarize(plan);
        if (run.mode === 'apply') {
            const { deals, ...rest } = await applySheetSync(plan, process.env.SHEET_SYNC_ACTOR_USER_ID!);
            run.applied = {
                ...rest,
                dealsCreated: deals?.successCount ?? 0,
                dealsUpdated: deals?.updatedCount ?? 0,
                dealErrors: deals?.failedCount ?? 0,
            };
        }
        run.state = 'done';
        console.log(`[sheet-sync] ${run.source} ${run.mode} done:`, JSON.stringify(run.applied ?? run.summary.dealCounts));
    } catch (err) {
        run.state = 'failed';
        run.error = err instanceof Error ? err.message : String(err);
        console.error(`[sheet-sync] ${run.source} run failed:`, run.error);
    } finally {
        run.finishedAt = new Date().toISOString();
        running = false;
    }
}

/**
 * Starts a run unless one is already going (returns null then). `dryRun` can only turn writes
 * off; it never forces writes the env has not allowed.
 */
export function startSheetSyncRun(source: SyncRun['source'], loadTabs: () => Promise<SheetTabs>, dryRun = false): SyncRun | null {
    if (running) return null;
    const allow = writesAllowed();
    const run: SyncRun = {
        id: crypto.randomUUID(),
        source,
        receivedAt: new Date().toISOString(),
        finishedAt: null,
        state: 'running',
        mode: dryRun || !allow.ok ? 'dry-run' : 'apply',
        writesDisabledBecause: allow.ok ? null : allow.reason ?? null,
        tabs: {},
        summary: null,
        applied: null,
        error: null,
    };
    runs.unshift(run);
    runs.length = Math.min(runs.length, MAX_RUNS_KEPT);
    running = true;
    void execute(run, loadTabs);
    return run;
}

/** Tabs pushed in a request body (Apps Script), limited to the two the sync reads. */
export function startPushedSheetSync(tabs: SheetTabs, dryRun: boolean): SyncRun | null {
    return startSheetSyncRun(
        'push',
        async () => ({ [config.dealsTab]: tabs[config.dealsTab], [config.paymentsTab]: tabs[config.paymentsTab] }),
        dryRun,
    );
}

/** Downloads the "anyone with the link" sheet named by SHEET_SYNC_SHEET_ID and syncs it. */
export function startLinkSheetSync(dryRun: boolean): SyncRun | null {
    const spreadsheetId = String(process.env.SHEET_SYNC_SHEET_ID ?? '').trim();
    if (!spreadsheetId) throw new Error('SHEET_SYNC_SHEET_ID is not set.');
    return startSheetSyncRun(
        'link',
        () => readSheetTabs({ kind: 'link', spreadsheetId }, [config.dealsTab, config.paymentsTab]),
        dryRun,
    );
}

export const sheetSyncTabNames = (): string[] => [config.dealsTab, config.paymentsTab];
