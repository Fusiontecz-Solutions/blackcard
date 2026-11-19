import * as XLSX from 'xlsx';

jest.mock('../config/prismaClient', () => ({ __esModule: true, default: {} }));

import { parseApplicationBulkSheet } from './applicationBulkExcelIngestService';
import {
    computeDealPayback,
    syncApplicationSyndicatorAllocations,
} from './applicationSyndicatorImportService';
import { partitionAlreadyImportedPayments } from './collectionPaymentDedupe';
import { mapApplicationStatus, mapApplicationType } from '../constants/applicationImportMappings';

function workbookBuffer(aoa: unknown[][], percentCells: string[] = []): Buffer {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (const addr of percentCells) {
        if (ws[addr]) ws[addr].z = '0%';
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const HEADER = ['Deal ID', 'Deal Name', 'Date', 'Status', 'Type', 'Offer', 'Term', 'Frequency', 'House', 'SLIM'];

describe('application Excel import — type/status mapping', () => {
    it('maps known values and passes unknown ones through flagged', () => {
        expect(mapApplicationType('refi')).toEqual({ value: 'REFI', unrecognized: false });
        expect(mapApplicationType(' Reverse ')).toEqual({ value: 'REVERSE', unrecognized: false });
        expect(mapApplicationType('Term Loan')).toEqual({ value: 'TERM LOAN', unrecognized: true });
        expect(mapApplicationType('')).toEqual({ value: null, unrecognized: false });
        expect(mapApplicationStatus('Paid in Full')).toEqual({ value: 'PAID IN FULL', unrecognized: false });
        expect(mapApplicationStatus('paid_in_full').value).toBe('PAID IN FULL');
        expect(mapApplicationStatus('legal').value).toBe('LEGAL');
    });
});

describe('application Excel import — syndicator columns', () => {
    it('detects every column after Frequency as a syndicator, independent of column order', () => {
        const reordered = ['Type', 'Status', 'Deal Name', 'Deal ID', 'Date', 'Frequency', 'House', 'SLIM', 'ABC Capital'];
        const { syndicatorColumns, errors } = parseApplicationBulkSheet(
            workbookBuffer([reordered, ['MCA', 'DEFAULT', 'Acme', 'KK1', '1/2/2025', 'Daily', 40, 35, 25]]),
        );
        expect(errors).toEqual([]);
        expect(syndicatorColumns).toEqual(['House', 'SLIM', 'ABC Capital']);
    });

    it('parses plain, fractional, percent-formatted and text percentages; ignores blanks and zeros', () => {
        const { rows } = parseApplicationBulkSheet(
            workbookBuffer(
                [
                    HEADER,
                    ['KK1', 'A', '1/2/2025', 'DEFAULT', 'MCA', 10000, '60 Days', 'Daily', 50, 50],
                    ['KK2', 'B', '1/2/2025', 'LEGAL', 'REFI', 10000, '60 Days', 'Daily', 0.25, 0.75],
                    ['KK3', 'C', '1/2/2025', 'DEFAULT', 'MCA', 10000, '60 Days', 'Daily', 1, ''],
                    ['KK4', 'D', '1/2/2025', 'DEFAULT', 'MCA', 10000, '60 Days', 'Daily', '60%', '40%'],
                    ['KK5', 'E', '1/2/2025', 'DEFAULT', 'MCA', 10000, '60 Days', 'Daily', 100, 0],
                ],
                ['I3', 'J3'],
            ),
        );
        const allocations = rows.map((r) => (r.__syndicators as { allocations: unknown }).allocations);
        expect(allocations[0]).toEqual([
            { name: 'House', percent: 50 },
            { name: 'SLIM', percent: 50 },
        ]);
        expect(allocations[1]).toEqual([
            { name: 'House', percent: 25 },
            { name: 'SLIM', percent: 75 },
        ]);
        expect(allocations[2]).toEqual([{ name: 'House', percent: 100 }]);
        expect(allocations[3]).toEqual([
            { name: 'House', percent: 60 },
            { name: 'SLIM', percent: 40 },
        ]);
        expect(allocations[4]).toEqual([{ name: 'House', percent: 100 }]);
    });

    it('flags rows whose percentages do not total 100%', () => {
        const { rows } = parseApplicationBulkSheet(
            workbookBuffer([HEADER, ['KK1', 'A', '1/2/2025', 'DEFAULT', 'MCA', 10000, '60 Days', 'Daily', 50, 30]]),
        );
        const parsed = rows[0].__syndicators as { allocations: unknown[]; issue: string | null };
        expect(parsed.allocations).toEqual([]);
        expect(parsed.issue).toMatch(/total 80%/);
    });

    it('has no syndicator columns when the sheet has no Frequency column', () => {
        const { syndicatorColumns, rows } = parseApplicationBulkSheet(
            workbookBuffer([['Deal ID', 'Deal Name', 'Date', 'House'], ['KK1', 'A', '1/2/2025', 100]]),
        );
        expect(syndicatorColumns).toEqual([]);
        expect(rows[0].__syndicators).toBeNull();
    });
});

/** Minimal in-memory stand-in for `tx.applicationSyndicatorDetails`. */
function fakeDetailsDb(initial: Array<Record<string, unknown>> = []) {
    let nextId = 100;
    const rows = initial.map((r) => ({ ...r }));
    const db = {
        rows,
        applicationSyndicatorDetails: {
            findMany: async ({ where }: { where: { applicationId: string } }) =>
                rows.filter((r) => r.applicationId === where.applicationId).sort((a, b) => Number(a.id) - Number(b.id)),
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const row = { id: nextId++, ...data };
                rows.push(row);
                return row;
            },
            update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
                const row = rows.find((r) => r.id === where.id)!;
                Object.assign(row, data);
                return row;
            },
            delete: async ({ where }: { where: { id: number } }) => {
                rows.splice(rows.findIndex((r) => r.id === where.id), 1);
            },
        },
    };
    return db;
}

const house = { id: 1, name: 'House' };
const slim = { id: 2, name: 'SLIM' };
const num = (v: unknown) => Number(v);

describe('syncApplicationSyndicatorAllocations', () => {
    const base = {
        applicationId: 'app-a',
        merchantName: 'Acme',
        fileSyndicatorIds: new Set([1, 2]),
        fundedAmount: 10000,
        paybackAmount: 14000,
        termLength: 60,
    };

    it('creates one record per syndicator with funding % and $ amount, and is idempotent on re-import', async () => {
        const db = fakeDetailsDb();
        const params = {
            ...base,
            allocations: [
                { syndicator: house, percent: 25 },
                { syndicator: slim, percent: 75 },
            ],
        };
        await syncApplicationSyndicatorAllocations(db as never, params);
        await syncApplicationSyndicatorAllocations(db as never, params);

        expect(db.rows).toHaveLength(2);
        const [h, s] = db.rows;
        expect([num(h.percentageSyndicated), num(h.amountSyndicated), num(h.paybackAmountSyndicated)]).toEqual([
            25, 2500, 3500,
        ]);
        expect([num(s.percentageSyndicated), num(s.amountSyndicated), num(s.paybackAmountSyndicated)]).toEqual([
            75, 7500, 10500,
        ]);
    });

    it('keeps collected repayments when percentages change, and recomputes remaining', async () => {
        const db = fakeDetailsDb([
            { id: 1, applicationId: 'app-a', syndicatorId: 1, syndicatorName: 'House', percentageSyndicated: 50, collectedAmount: 2000 },
            { id: 2, applicationId: 'app-a', syndicatorId: 2, syndicatorName: 'SLIM', percentageSyndicated: 50, collectedAmount: 2000 },
        ]);
        await syncApplicationSyndicatorAllocations(db as never, {
            ...base,
            allocations: [
                { syndicator: house, percent: 60 },
                { syndicator: slim, percent: 40 },
            ],
        });
        expect(db.rows.map((r) => num(r.collectedAmount))).toEqual([2000, 2000]);
        expect(db.rows.map((r) => num(r.amountSyndicated))).toEqual([6000, 4000]);
        expect(db.rows.map((r) => num(r.remainingAmount))).toEqual([8400 - 2000, 5600 - 2000]);
    });

    it('never strips funding when the row has no syndicator values', async () => {
        const db = fakeDetailsDb([
            { id: 1, applicationId: 'app-a', syndicatorId: 1, percentageSyndicated: 100, collectedAmount: 0 },
        ]);
        await syncApplicationSyndicatorAllocations(db as never, { ...base, allocations: [] });
        expect(db.rows).toHaveLength(1);
    });

    it('drops a syndicator blanked in the file only if it has collected nothing', async () => {
        const db = fakeDetailsDb([
            { id: 1, applicationId: 'app-a', syndicatorId: 1, percentageSyndicated: 50, collectedAmount: 0 },
            { id: 2, applicationId: 'app-a', syndicatorId: 2, percentageSyndicated: 50, collectedAmount: 0 },
        ]);
        await syncApplicationSyndicatorAllocations(db as never, {
            ...base,
            allocations: [{ syndicator: house, percent: 100 }],
        });
        expect(db.rows.map((r) => r.syndicatorId)).toEqual([1]);

        const withHistory = fakeDetailsDb([
            { id: 1, applicationId: 'app-a', syndicatorId: 1, percentageSyndicated: 50, collectedAmount: 0 },
            { id: 2, applicationId: 'app-a', syndicatorId: 2, syndicatorName: 'SLIM', percentageSyndicated: 50, collectedAmount: 10 },
        ]);
        const warnings = await syncApplicationSyndicatorAllocations(withHistory as never, {
            ...base,
            allocations: [{ syndicator: house, percent: 100 }],
        });
        expect(withHistory.rows).toHaveLength(2);
        expect(warnings.join(' ')).toMatch(/SLIM.*already collected/);
    });

    it('splits odd amounts so shares add up exactly to the funded amount', async () => {
        const db = fakeDetailsDb();
        await syncApplicationSyndicatorAllocations(db as never, {
            ...base,
            fundedAmount: 100,
            allocations: [
                { syndicator: house, percent: 33.3333 },
                { syndicator: slim, percent: 33.3333 },
                { syndicator: { id: 3, name: 'ABC' }, percent: 33.3334 },
            ],
            fileSyndicatorIds: new Set([1, 2, 3]),
        });
        const total = db.rows.reduce((acc, r) => acc + num(r.amountSyndicated), 0);
        expect(Math.round(total * 100) / 100).toBe(100);
    });
});

describe('computeDealPayback', () => {
    it('uses factor rate, then repay-per-period × term, else 0', () => {
        expect(computeDealPayback({ fundedAmount: 10000, rate: 1.4, repayPerPeriod: null, termPeriods: null })).toBe(14000);
        expect(computeDealPayback({ fundedAmount: 10000, rate: null, repayPerPeriod: 250, termPeriods: 60 })).toBe(15000);
        expect(computeDealPayback({ fundedAmount: 10000, rate: null, repayPerPeriod: null, termPeriods: 60 })).toBe(0);
    });
});

describe('partitionAlreadyImportedPayments', () => {
    const payment = (amount: number, day: string, notes = 'ACH') => ({
        applicationId: 'app-a',
        amount,
        status: 'CREDIT',
        Date: new Date(`${day}T12:00:00Z`),
        scheduledDate: new Date(`${day}T12:00:00Z`),
        notes,
    });

    it('skips transactions already stored and counts identical rows by multiplicity', async () => {
        const db = {
            collectionPayment: {
                findMany: async () => [payment(500, '2025-03-01')],
            },
        };
        const incoming = [payment(500, '2025-03-01'), payment(500, '2025-03-01'), payment(500, '2025-03-02')];
        const result = await partitionAlreadyImportedPayments(db as never, incoming);
        expect(result.duplicateIndices).toEqual([0]);
        expect(result.freshIndices).toEqual([1, 2]);
    });
});
