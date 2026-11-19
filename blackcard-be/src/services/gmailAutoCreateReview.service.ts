import prisma from '../config/prismaClient';
import { Prisma } from '@prisma/client';
import {
    GMAIL_AUTO_CREATE_FORCE_OUTCOME,
    GMAIL_AUTO_CREATE_SKIPPED_OUTCOMES,
    clearGmailAutoCreateHandledCache,
    gmailAutoCreateGlobalMessageKey,
} from './gmailAutoCreateProcessedStore';
import { removeAutoCreateLabelsFromMessage } from './gmail.service';
import { getGmailAccessTokenForUserId } from './googleToken.service';

/** Sentinel for rows written before skip reasons were logged. */
export const UNKNOWN_SKIP_REASON = 'unknown';

export type SkippedEmailListParams = {
    page?: number;
    pageSize?: number;
    reason?: string | null;
    status?: 'open' | 'dismissed' | 'all';
    from?: Date | null;
    to?: Date | null;
    search?: string | null;
};

export async function listSkippedGmailAutoCreateRows(params: SkippedEmailListParams) {
    const page = Math.max(1, Math.floor(Number(params.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(params.pageSize) || 25)));

    const and: Prisma.GmailAutoCreateLedgerWhereInput[] = [
        { outcome: { in: GMAIL_AUTO_CREATE_SKIPPED_OUTCOMES } },
    ];
    const status = params.status || 'open';
    if (status === 'open') and.push({ reviewedAt: null });
    if (status === 'dismissed') and.push({ reviewedAt: { not: null } });
    const reason = String(params.reason || '').trim();
    if (reason === UNKNOWN_SKIP_REASON) and.push({ skipReason: null });
    else if (reason) and.push({ skipReason: reason });
    if (params.from) and.push({ createdAt: { gte: params.from } });
    if (params.to) and.push({ createdAt: { lte: params.to } });
    const search = String(params.search || '').trim();
    if (search) {
        and.push({
            OR: [
                { subject: { contains: search, mode: 'insensitive' } },
                { fromEmail: { contains: search, mode: 'insensitive' } },
                { gmailMessageId: { contains: search } },
            ],
        });
    }
    const where: Prisma.GmailAutoCreateLedgerWhereInput = { AND: and };

    const [total, rows] = await Promise.all([
        prisma.gmailAutoCreateLedger.count({ where }),
        prisma.gmailAutoCreateLedger.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
                id: true,
                userId: true,
                gmailMessageId: true,
                outcome: true,
                skipReason: true,
                skipDetail: true,
                subject: true,
                fromEmail: true,
                pdfCount: true,
                reviewedAt: true,
                reviewedById: true,
                createdAt: true,
                user: { select: { email: true } },
            },
        }),
    ]);

    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const oauth = userIds.length
        ? await prisma.googleOAuth.findMany({
              where: { userId: { in: userIds } },
              select: { userId: true, email: true },
          })
        : [];
    const gmailByUser = new Map(oauth.map((o) => [o.userId, o.email]));

    return {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: rows.map((r) => {
            const mailbox = gmailByUser.get(r.userId) || r.user?.email || null;
            return {
                id: r.id,
                userId: r.userId,
                mailbox,
                gmailMessageId: r.gmailMessageId,
                gmailUrl: `https://mail.google.com/mail/${
                    mailbox ? `?authuser=${encodeURIComponent(mailbox)}` : 'u/0/'
                }#all/${encodeURIComponent(r.gmailMessageId)}`,
                outcome: r.outcome,
                skipReason: r.skipReason ?? UNKNOWN_SKIP_REASON,
                skipDetail: r.skipDetail,
                subject: r.subject,
                fromEmail: r.fromEmail,
                pdfCount: r.pdfCount,
                reviewedAt: r.reviewedAt,
                reviewedById: r.reviewedById,
                createdAt: r.createdAt,
            };
        }),
    };
}

export type SkippedRetryResult = {
    id: string;
    gmailMessageId: string | null;
    ok: boolean;
    /** Ledger cleared but Gmail labels could not be removed — the scan will still exclude it. */
    labelError?: string;
    error?: string;
};

/**
 * Re-queue skipped messages: drop their ledger rows (all keys for that Gmail id),
 * clear caches and remove `crm-skipped`/`in-crm` so the next poll re-evaluates.
 * With `force`, a `force_create` marker is left that makes the poller bypass the
 * skip filters for that message once.
 */
export async function retrySkippedGmailAutoCreateRows(
    ids: string[],
    options?: { force?: boolean },
): Promise<SkippedRetryResult[]> {
    const rows = await prisma.gmailAutoCreateLedger.findMany({
        where: { id: { in: ids }, outcome: { in: GMAIL_AUTO_CREATE_SKIPPED_OUTCOMES } },
        select: { id: true, userId: true, gmailMessageId: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const results: SkippedRetryResult[] = [];

    for (const id of ids) {
        const row = byId.get(id);
        if (!row) {
            results.push({ id, gmailMessageId: null, ok: false, error: 'Not found or not a skipped row' });
            continue;
        }
        try {
            const related = await prisma.gmailAutoCreateLedger.findMany({
                where: { gmailMessageId: row.gmailMessageId },
                select: { userId: true },
            });
            await prisma.$transaction(async (tx) => {
                await tx.gmailAutoCreateLedger.deleteMany({
                    where: { gmailMessageId: row.gmailMessageId },
                });
                if (options?.force) {
                    await tx.gmailAutoCreateLedger.create({
                        data: {
                            userId: row.userId,
                            gmailMessageId: row.gmailMessageId,
                            messageKey: gmailAutoCreateGlobalMessageKey(row.gmailMessageId),
                            outcome: GMAIL_AUTO_CREATE_FORCE_OUTCOME,
                        },
                    });
                }
            });
            await clearGmailAutoCreateHandledCache(
                row.gmailMessageId,
                Array.from(new Set([row.userId, ...related.map((r) => r.userId)])),
            );

            const result: SkippedRetryResult = { id, gmailMessageId: row.gmailMessageId, ok: true };
            try {
                const accessToken = await getGmailAccessTokenForUserId(row.userId);
                await removeAutoCreateLabelsFromMessage(row.gmailMessageId, accessToken, row.userId);
            } catch (err: any) {
                result.labelError = String(
                    err?.response?.data?.error?.message || err?.message || err,
                ).slice(0, 300);
            }
            results.push(result);
        } catch (err: unknown) {
            results.push({
                id,
                gmailMessageId: row.gmailMessageId,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return results;
}

/** Mark skipped rows reviewed (they stay skipped and stay out of the scan). */
export async function dismissSkippedGmailAutoCreateRows(
    ids: string[],
    reviewedById: string | null,
): Promise<number> {
    const updated = await prisma.gmailAutoCreateLedger.updateMany({
        where: { id: { in: ids }, outcome: { in: GMAIL_AUTO_CREATE_SKIPPED_OUTCOMES } },
        data: { reviewedAt: new Date(), reviewedById },
    });
    return updated.count;
}
