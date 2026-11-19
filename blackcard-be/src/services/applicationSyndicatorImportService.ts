import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';

/**
 * Excel import support for the dynamic syndicator columns that follow the "Frequency" column.
 * Each such column header is a syndicator name; each cell is that syndicator's funding
 * percentage for the row's application.
 */

type DbTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type DbLike = typeof prisma | DbTx;

/** Tolerance when checking that a row's syndicator percentages add up to 100%. */
const PERCENT_TOTAL_TOLERANCE = 0.01;

/** Placeholder email domain for auto-created syndicators (`.invalid` is never deliverable). */
const IMPORT_SYNDICATOR_EMAIL_DOMAIN = 'syndicators.invalid';

export type SyndicatorAllocationInput = {
    /** Header text of the syndicator column (display name). */
    name: string;
    /** Funding percentage, 0–100 scale. */
    percent: number;
};

export type ParsedRowSyndicators = {
    allocations: SyndicatorAllocationInput[];
    /** Set when the row's syndicator cells are invalid; allocations must not be applied. */
    issue: string | null;
};

export type ImportSyndicatorRef = { id: number; name: string };

export function syndicatorNameKey(name: string): string {
    return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const toNumber = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

type RawPercentCell =
    | { kind: 'blank' }
    | { kind: 'invalid'; text: string }
    | { kind: 'value'; value: number; explicitPercent: boolean };

/**
 * Read one syndicator cell. Percent-formatted numeric cells (stored by Excel as fractions,
 * e.g. 50% → 0.5) and text like "50%" are flagged `explicitPercent` and returned on the 0–100
 * scale; plain numbers are returned as-is and resolved per row by {@link parseRowSyndicatorCells}.
 */
function readPercentCell(ws: XLSX.WorkSheet, rowIndex0: number, colIndex0: number): RawPercentCell {
    const sheetCell = ws[XLSX.utils.encode_cell({ r: rowIndex0, c: colIndex0 })] as XLSX.CellObject | undefined;
    if (!sheetCell || sheetCell.v === null || sheetCell.v === undefined) return { kind: 'blank' };

    const formatted = sheetCell.w != null ? String(sheetCell.w).trim() : '';
    if (typeof sheetCell.v === 'number') {
        const isPercentFormat =
            (typeof sheetCell.z === 'string' && sheetCell.z.includes('%')) || formatted.endsWith('%');
        return isPercentFormat
            ? { kind: 'value', value: sheetCell.v * 100, explicitPercent: true }
            : { kind: 'value', value: sheetCell.v, explicitPercent: false };
    }

    const text = String(sheetCell.v).replace(/[​-‍﻿]/g, '').trim();
    if (!text || text === '-') return { kind: 'blank' };
    const hasPercent = text.includes('%');
    const n = Number.parseFloat(text.replace(/[%,\s]/g, ''));
    if (!Number.isFinite(n)) return { kind: 'invalid', text };
    return { kind: 'value', value: n, explicitPercent: hasPercent };
}

/**
 * Parse every syndicator cell of one data row into allocations, then validate that the
 * non-blank, non-zero percentages total 100%.
 */
export function parseRowSyndicatorCells(
    ws: XLSX.WorkSheet,
    rowIndex0: number,
    columns: Array<{ index: number; name: string }>,
): ParsedRowSyndicators {
    const cells: Array<{ name: string; value: number; explicitPercent: boolean }> = [];
    for (const column of columns) {
        const raw = readPercentCell(ws, rowIndex0, column.index);
        if (raw.kind === 'blank') continue;
        if (raw.kind === 'invalid') {
            return {
                allocations: [],
                issue: `Syndicator "${column.name}" has a non-numeric percentage "${raw.text}" — syndicator funding not updated.`,
            };
        }
        if (raw.value < 0) {
            return {
                allocations: [],
                issue: `Syndicator "${column.name}" has a negative percentage — syndicator funding not updated.`,
            };
        }
        if (raw.value === 0) continue;
        cells.push({ name: column.name, ...raw });
    }
    if (!cells.length) return { allocations: [], issue: null };

    // Plain numbers are ambiguous (0.5 vs 50). Treat them as fractions when that is the only
    // reading that makes the row total 100%, or when every plain value is ≤ 1.
    const asIs = cells.map((c) => c.value);
    const asFractions = cells.map((c) => (c.explicitPercent ? c.value : c.value * 100));
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const totalsHundred = (xs: number[]) => Math.abs(sum(xs) - 100) <= PERCENT_TOTAL_TOLERANCE;
    const plainAllAtMostOne = cells.every((c) => c.explicitPercent || c.value <= 1);
    const values =
        totalsHundred(asIs) ? asIs : totalsHundred(asFractions) || plainAllAtMostOne ? asFractions : asIs;

    const allocations = cells.map((c, i) => ({ name: c.name, percent: Math.round(values[i] * 10000) / 10000 }));
    const total = sum(allocations.map((a) => a.percent));
    if (Math.abs(total - 100) > PERCENT_TOTAL_TOLERANCE) {
        const detail = allocations.map((a) => `${a.name} ${a.percent}%`).join(', ');
        return {
            allocations: [],
            issue: `Syndicator percentages total ${round2(total)}% (${detail}); expected 100% — syndicator funding not updated.`,
        };
    }
    return { allocations, issue: null };
}

function placeholderEmailForSyndicator(name: string): string {
    const slug =
        syndicatorNameKey(name)
            .normalize('NFKD')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'syndicator';
    return `import-${slug}@${IMPORT_SYNDICATOR_EMAIL_DOMAIN}`;
}

/**
 * Find (case-insensitive by company name, then first name) or create one syndicator per name.
 * Creation uses a deterministic placeholder email, so a concurrent import that races us hits the
 * unique email constraint and we re-read the row instead of creating a duplicate.
 */
export async function resolveImportSyndicators(
    db: typeof prisma,
    names: string[],
): Promise<{ byKey: Map<string, ImportSyndicatorRef>; createdNames: string[] }> {
    const byKey = new Map<string, ImportSyndicatorRef>();
    const createdNames: string[] = [];

    for (const rawName of names) {
        const name = rawName.replace(/\s+/g, ' ').trim();
        const key = syndicatorNameKey(name);
        if (!key || byKey.has(key)) continue;

        const candidates = await db.syndicator.findMany({
            where: {
                OR: [
                    { companyName: { equals: name, mode: 'insensitive' } },
                    { firstName: { equals: name, mode: 'insensitive' } },
                ],
            },
            select: { id: true, firstName: true, lastName: true, companyName: true },
            orderBy: { id: 'asc' },
        });
        const match =
            candidates.find((c) => syndicatorNameKey(c.companyName ?? '') === key) ??
            candidates.find((c) => !String(c.lastName ?? '').trim()) ??
            candidates[0];
        if (match) {
            byKey.set(key, { id: match.id, name: match.companyName?.trim() || match.firstName });
            continue;
        }

        const email = placeholderEmailForSyndicator(name);
        const byEmail = await db.syndicator.findUnique({ where: { email }, select: { id: true, firstName: true } });
        if (byEmail) {
            byKey.set(key, { id: byEmail.id, name: byEmail.firstName });
            continue;
        }

        try {
            const created = await db.syndicator.create({
                data: {
                    firstName: name,
                    companyName: name,
                    email,
                    role: 'PARTICIPANT',
                    address1: 'N/A',
                    city: 'N/A',
                    state: 'N/A',
                    zip: 'N/A',
                    notes: 'Auto-created by Excel application import.',
                },
                select: { id: true },
            });
            byKey.set(key, { id: created.id, name });
            createdNames.push(name);
        } catch (err) {
            if ((err as { code?: string })?.code !== 'P2002') throw err;
            const raced = await db.syndicator.findUnique({ where: { email }, select: { id: true } });
            if (!raced) throw err;
            byKey.set(key, { id: raced.id, name });
        }
    }

    return { byKey, createdNames };
}

/**
 * Total payback for the deal: funded × factor rate when the rate looks like a factor (1–10),
 * else repay-per-period × number of periods, else 0 (unknown).
 */
export function computeDealPayback(params: {
    fundedAmount: number;
    rate: number | null;
    repayPerPeriod: number | null;
    termPeriods: number | null;
}): number {
    const { fundedAmount, rate, repayPerPeriod, termPeriods } = params;
    if (fundedAmount > 0 && rate != null && rate >= 1 && rate < 10) return round2(fundedAmount * rate);
    if (repayPerPeriod != null && repayPerPeriod > 0 && termPeriods != null && termPeriods > 0) {
        return round2(repayPerPeriod * termPeriods);
    }
    return 0;
}

/** Split `total` by percentages, rounding to cents with the remainder on the last share. */
function splitByPercent(total: number, percents: number[]): number[] {
    if (total <= 0) return percents.map(() => 0);
    const shares = percents.map((p) => round2((total * p) / 100));
    const percentTotal = percents.reduce((a, b) => a + b, 0);
    if (shares.length && Math.abs(percentTotal - 100) <= PERCENT_TOTAL_TOLERANCE) {
        const others = shares.slice(0, -1).reduce((a, b) => a + b, 0);
        shares[shares.length - 1] = round2(total - others);
    }
    return shares;
}

/**
 * Bring an application's `ApplicationSyndicatorDetails` in line with the row's allocations.
 *
 * - Existing (application, syndicator) rows are updated in place — never duplicated — and keep
 *   their collected repayment history, commission and management fee.
 * - A syndicator whose column is in the file but blank/0 on this row is removed from the deal,
 *   but only when it has not collected any repayment yet; otherwise it is kept and reported.
 * - Syndicators on the deal that are not columns in this file are left untouched.
 *
 * Returns human-readable warnings for the import report.
 */
export async function syncApplicationSyndicatorAllocations(
    tx: DbLike,
    params: {
        applicationId: string;
        merchantName: string;
        allocations: Array<{ syndicator: ImportSyndicatorRef; percent: number }>;
        /** Syndicator ids that have a column in this file. */
        fileSyndicatorIds: Set<number>;
        fundedAmount: number;
        paybackAmount: number;
        termLength: number;
    },
): Promise<string[]> {
    const warnings: string[] = [];
    const { applicationId, allocations, fundedAmount, paybackAmount } = params;
    // A row with no syndicator values says nothing about funding — never strip existing records.
    if (!allocations.length) return warnings;

    const existing = await tx.applicationSyndicatorDetails.findMany({
        where: { applicationId },
        orderBy: { id: 'asc' },
    });
    const existingBySyndicator = new Map<number, (typeof existing)[number]>();
    for (const row of existing) {
        if (existingBySyndicator.has(row.syndicatorId)) {
            if (allocations.some((a) => a.syndicator.id === row.syndicatorId)) {
                warnings.push(
                    `Syndicator "${row.syndicatorName ?? row.syndicatorId}" has duplicate funding records on this deal; only the first was updated.`,
                );
            }
            continue;
        }
        existingBySyndicator.set(row.syndicatorId, row);
    }

    if (allocations.length && fundedAmount <= 0) {
        warnings.push('Funded amount is missing — syndicator percentages saved with $0 funding amounts.');
    }

    const percents = allocations.map((a) => a.percent);
    const fundingShares = splitByPercent(fundedAmount, percents);
    const paybackShares = splitByPercent(paybackAmount, percents);

    for (let i = 0; i < allocations.length; i += 1) {
        const { syndicator, percent } = allocations[i];
        const amountSyndicated = fundingShares[i];
        const paybackAmountSyndicated = paybackShares[i];
        const current = existingBySyndicator.get(syndicator.id);

        if (current) {
            const collected = toNumber(current.collectedAmount);
            await tx.applicationSyndicatorDetails.update({
                where: { id: current.id },
                data: {
                    syndicatorName: syndicator.name,
                    merchantName: params.merchantName,
                    percentageSyndicated: new Prisma.Decimal(percent),
                    amountSyndicated: new Prisma.Decimal(amountSyndicated),
                    fundedAmount: new Prisma.Decimal(fundedAmount),
                    paybackAmount: new Prisma.Decimal(paybackAmount),
                    paybackAmountSyndicated: new Prisma.Decimal(paybackAmountSyndicated),
                    remainingAmount: new Prisma.Decimal(Math.max(round2(paybackAmountSyndicated - collected), 0)),
                    ...(params.termLength > 0 ? { termLength: params.termLength } : {}),
                },
            });
            continue;
        }

        await tx.applicationSyndicatorDetails.create({
            data: {
                applicationId,
                syndicatorId: syndicator.id,
                syndicatorName: syndicator.name,
                merchantName: params.merchantName,
                percentageSyndicated: new Prisma.Decimal(percent),
                amountSyndicated: new Prisma.Decimal(amountSyndicated),
                fundedAmount: new Prisma.Decimal(fundedAmount),
                paybackAmount: new Prisma.Decimal(paybackAmount),
                paybackAmountSyndicated: new Prisma.Decimal(paybackAmountSyndicated),
                commissionAmount: new Prisma.Decimal(0),
                managementFeeToDate: new Prisma.Decimal(0),
                termLength: params.termLength,
                collectedAmount: new Prisma.Decimal(0),
                remainingAmount: new Prisma.Decimal(paybackAmountSyndicated),
                syndicationCalculationLogic: 'EXCEL_IMPORT',
            },
        });
    }

    const allocatedIds = new Set(allocations.map((a) => a.syndicator.id));
    for (const [syndicatorId, row] of existingBySyndicator) {
        if (allocatedIds.has(syndicatorId)) continue;
        const label = row.syndicatorName ?? String(syndicatorId);
        if (!params.fileSyndicatorIds.has(syndicatorId)) {
            warnings.push(
                `Deal also has syndicator "${label}" (${toNumber(row.percentageSyndicated)}%) which is not a column in this file — left unchanged.`,
            );
            continue;
        }
        if (toNumber(row.collectedAmount) > 0) {
            warnings.push(
                `Syndicator "${label}" is blank in this row but has already collected repayments — kept on the deal.`,
            );
            continue;
        }
        await tx.applicationSyndicatorDetails.delete({ where: { id: row.id } });
    }

    return warnings;
}
