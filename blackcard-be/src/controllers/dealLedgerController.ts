import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /collection-payments/deal-ledger/:applicationId
 * Funding wires and ISO commission payouts for one deal (synced from the Google Sheet), with
 * totals, the commission owed and the ISO payout status.
 */
export async function getDealLedger(req: Request, res: Response): Promise<void> {
    const applicationId = String(req.params.applicationId ?? '').trim();
    if (!UUID_RE.test(applicationId)) {
        res.status(400).json({ success: false, message: 'applicationId must be the application UUID.' });
        return;
    }
    try {
        const [app, entries, payouts] = await Promise.all([
            prisma.application.findUnique({
                where: { id: applicationId },
                select: { id: true, dealId: true, commissionAmount: true },
            }),
            prisma.dealLedgerEntry.findMany({
                where: { applicationId },
                orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
                select: { id: true, kind: true, entryDate: true, amount: true, description: true, source: true },
            }),
            prisma.isoApplicationPayout.findMany({
                where: { applicationId },
                select: { payoutStatus: true, paidAt: true, iso: { select: { name: true } } },
            }),
        ]);
        if (!app) {
            res.status(404).json({ success: false, message: 'Application not found.' });
            return;
        }

        const rows = entries.map((e) => ({
            id: e.id,
            kind: e.kind,
            date: e.entryDate.toISOString().slice(0, 10),
            amount: Number(e.amount),
            description: e.description,
            source: e.source,
        }));
        const sum = (kind: string) =>
            Math.round(rows.filter((r) => r.kind === kind).reduce((s, r) => s + r.amount, 0) * 100) / 100;
        const commissionPaid = sum('COMMISSION');
        const commissionOwed = app.commissionAmount ?? null;

        res.json({
            success: true,
            data: {
                applicationId: app.id,
                dealId: app.dealId,
                entries: rows,
                totals: {
                    fundingWired: sum('FUNDING'),
                    commissionPaid,
                    commissionOwed,
                    commissionBalance:
                        commissionOwed === null ? null : Math.round((commissionOwed - commissionPaid) * 100) / 100,
                },
                payouts: payouts.map((p) => ({
                    iso: p.iso?.name ?? null,
                    status: p.payoutStatus,
                    paidAt: p.paidAt ? p.paidAt.toISOString().slice(0, 10) : null,
                })),
            },
        });
    } catch (err) {
        console.error('[deal-ledger] failed:', err);
        res.status(500).json({ success: false, message: 'Could not load funding and commission entries.' });
    }
}
