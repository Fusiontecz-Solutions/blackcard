import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';

type TransactionClient = Prisma.TransactionClient;

/** Postgres advisory lock key for serializing deal id allocation. */
const ADVISORY_LOCK_KEY = 874_203_891;

export function sanitizeDealIdPrefix(raw?: string | null): string {
    return String(raw ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8);
}

/** Default when no funder prefix and no DEAL_ID_PREFIX env. */
export const DEAL_ID_PREFIX = sanitizeDealIdPrefix(process.env.DEAL_ID_PREFIX) || 'BCF';

/**
 * Prefer an active funder's Deal ID prefix (assignsDealId first, then sort order).
 * Falls back to DEAL_ID_PREFIX env / BCF.
 */
export async function resolvePlatformDealIdPrefix(
    tx: TransactionClient,
): Promise<string> {
    const envPrefix = sanitizeDealIdPrefix(process.env.DEAL_ID_PREFIX);
    const rows = await tx.funderProfile.findMany({
        where: {
            isActive: true,
            dealIdPrefix: { not: null },
        },
        select: {
            dealIdPrefix: true,
            assignsDealId: true,
            sortOrder: true,
        },
        orderBy: [{ assignsDealId: 'desc' }, { sortOrder: 'asc' }],
        take: 50,
    });
    for (const row of rows) {
        const prefix = sanitizeDealIdPrefix(row.dealIdPrefix);
        if (prefix) return prefix;
    }
    return envPrefix || DEAL_ID_PREFIX;
}

/**
 * Returns the next deal id (`{prefix}{n}`) for that prefix. Starts at `{prefix}1`
 * when none exist.
 */
export async function allocateNextDealId(
    tx: TransactionClient,
    prefixRaw?: string | null,
): Promise<string> {
    const prefix =
        sanitizeDealIdPrefix(prefixRaw) || (await resolvePlatformDealIdPrefix(tx));

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;

    const rows = await tx.$queryRaw<Array<{ max_num: number | null }>>`
        SELECT MAX((regexp_match(upper("dealId"), '^' || ${prefix} || '([0-9]+)$'))[1]::integer) AS max_num
        FROM "Application"
        WHERE "dealId" IS NOT NULL
    `;

    const maxNum = rows[0]?.max_num != null ? Number(rows[0].max_num) : 0;
    const next = Number.isFinite(maxNum) && maxNum >= 0 ? maxNum + 1 : 1;
    return `${prefix}${next}`;
}

/** Allocate a deal id and run `fn` inside the same transaction (safe under concurrent creates). */
export async function withAllocatedDealId<T>(
    fn: (dealId: string, tx: TransactionClient) => Promise<T>,
    prefix?: string | null,
): Promise<T> {
    return prisma.$transaction(async (tx) => {
        const dealId = await allocateNextDealId(tx, prefix);
        return fn(dealId, tx);
    });
}
