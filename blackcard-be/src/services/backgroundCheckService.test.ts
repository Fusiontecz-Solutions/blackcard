/// <reference types="jest" />
/**
 * Background Check service — covers the brief's three critical rules:
 *  (1) readiness gate (a decision requires READY_FOR_DECISION),
 *  (2) Fail-blocks-approval (override is Admin-only, with a reason),
 *  (3) the contract gate (isContractEligible true only when APPROVED),
 *  plus the "cannot complete without a result" item rule.
 * Prisma is mocked so this is a fast unit test (no DB).
 */
jest.mock('../config/prismaClient', () => {
    const m = {
        backgroundCheck: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), create: jest.fn() },
        backgroundCheckItem: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), findMany: jest.fn() },
        backgroundCheckDecision: { create: jest.fn().mockResolvedValue({}), delete: jest.fn() },
        backgroundCheckEvent: { create: jest.fn().mockResolvedValue({}) },
        application: { findUnique: jest.fn() },
    };
    return { __esModule: true, default: m };
});

import prisma from '../config/prismaClient';
import backgroundCheckService, { BackgroundCheckError } from './backgroundCheckService';

const db = prisma as any;
const UW = { id: 'u1', role: 'UNDERWRITER' };
const ADMIN = { id: 'a1', role: 'ADMIN' };

const reason = { reasonText: 'looks good' };

describe('recordDecision — readiness gate', () => {
    it('rejects a decision when the check is not READY_FOR_DECISION', async () => {
        db.backgroundCheck.findUnique.mockResolvedValue({ id: 'bc1', status: 'IN_PROGRESS', items: [], decision: null });
        await expect(
            backgroundCheckService.recordDecision('bc1', { outcome: 'APPROVED', ...reason }, UW),
        ).rejects.toThrow(/required checks must be completed/i);
    });

    it('requires a reason', async () => {
        db.backgroundCheck.findUnique.mockResolvedValue({ id: 'bc1', status: 'READY_FOR_DECISION', items: [], decision: null });
        await expect(
            backgroundCheckService.recordDecision('bc1', { outcome: 'APPROVED', reasonText: '' }, UW),
        ).rejects.toThrow(/reason is required/i);
    });
});

describe('recordDecision — Fail blocks approval', () => {
    const readyWithFail = { id: 'bc1', status: 'READY_FOR_DECISION', items: [{ result: 'FAIL' }, { result: 'PASS' }], decision: null };

    it('blocks approval when a check FAILed (non-admin, no override)', async () => {
        db.backgroundCheck.findUnique.mockResolvedValue(readyWithFail);
        await expect(
            backgroundCheckService.recordDecision('bc1', { outcome: 'APPROVED', ...reason }, UW),
        ).rejects.toThrow(/failed check blocks approval/i);
    });

    it('blocks approval for a non-admin even with overrideFail=true', async () => {
        db.backgroundCheck.findUnique.mockResolvedValue(readyWithFail);
        await expect(
            backgroundCheckService.recordDecision('bc1', { outcome: 'APPROVED', overrideFail: true, ...reason }, UW),
        ).rejects.toThrow(/Manager can override/i);
    });

    it('allows an Admin to override a FAIL with a reason', async () => {
        db.backgroundCheck.findUnique.mockResolvedValue(readyWithFail);
        await backgroundCheckService.recordDecision('bc1', { outcome: 'APPROVED', overrideFail: true, ...reason }, ADMIN);
        expect(db.backgroundCheckDecision.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ outcome: 'APPROVED', overrodeFail: true }) }),
        );
        expect(db.backgroundCheck.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
        );
    });

    it('allows DECLINE despite a FAIL', async () => {
        db.backgroundCheck.findUnique.mockResolvedValue(readyWithFail);
        await backgroundCheckService.recordDecision('bc1', { outcome: 'DECLINED', ...reason }, UW);
        expect(db.backgroundCheck.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'DECLINED' }) }),
        );
    });

    it('rejects unauthorized roles entirely', async () => {
        await expect(
            backgroundCheckService.recordDecision('bc1', { outcome: 'APPROVED', ...reason }, { id: 'g', role: 'AGENT' }),
        ).rejects.toThrow(/not authorized/i);
    });
});

describe('updateItem — cannot complete without a result', () => {
    it('throws when marking COMPLETE with no result', async () => {
        db.backgroundCheckItem.findUnique.mockResolvedValue({ id: 'it1', backgroundCheckId: 'bc1', checkType: 'TLO', status: 'IN_PROGRESS', result: null });
        await expect(
            backgroundCheckService.updateItem('it1', { status: 'COMPLETE' }, UW),
        ).rejects.toThrow(/without a result/i);
    });

    it('merges provider metadata without discarding existing item metadata', async () => {
        db.backgroundCheckItem.findUnique.mockResolvedValue({
            id: 'it1',
            backgroundCheckId: 'bc1',
            checkType: 'TLO',
            status: 'IN_PROGRESS',
            result: null,
            metadata: { existing: true },
        });
        db.backgroundCheckItem.update.mockResolvedValue({
            id: 'it1',
            backgroundCheckId: 'bc1',
            status: 'IN_PROGRESS',
            result: null,
        });
        db.backgroundCheck.findUnique.mockResolvedValue({
            id: 'bc1',
            status: 'IN_PROGRESS',
            items: [],
            decision: null,
        });

        await backgroundCheckService.updateItem(
            'it1',
            { metadata: { provider: 'Thomson Reuters CLEAR' } },
            UW,
        );

        expect(db.backgroundCheckItem.update).toHaveBeenCalledWith({
            where: { id: 'it1' },
            data: {
                metadata: {
                    existing: true,
                    provider: 'Thomson Reuters CLEAR',
                },
            },
        });
    });
});

describe('isContractEligible — the contract gate', () => {
    it('is true only when the check is APPROVED', async () => {
        db.backgroundCheck.findUnique.mockResolvedValueOnce({ status: 'APPROVED' });
        await expect(backgroundCheckService.isContractEligible('app1')).resolves.toBe(true);

        db.backgroundCheck.findUnique.mockResolvedValueOnce({ status: 'READY_FOR_DECISION' });
        await expect(backgroundCheckService.isContractEligible('app1')).resolves.toBe(false);

        db.backgroundCheck.findUnique.mockResolvedValueOnce(null);
        await expect(backgroundCheckService.isContractEligible('app1')).resolves.toBe(false);
    });
});

describe('BackgroundCheckError', () => {
    it('carries a status code', () => {
        expect(new BackgroundCheckError('x', 403).statusCode).toBe(403);
    });
});
