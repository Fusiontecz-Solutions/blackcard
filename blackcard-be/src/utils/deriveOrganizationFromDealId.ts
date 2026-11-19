import type { Prisma } from '@prisma/client';

/**
 * Bulk-import organization tags from deal id prefix:
 * - KK… → Katan II
 * - KC… → Katan III
 */
export function deriveOrganizationFromDealId(dealIdRaw: string | null | undefined): string | null {
    let normalized = String(dealIdRaw ?? '')
        .trim()
        .toUpperCase();
    if (!normalized) return null;
    // Excel text cells may include a leading apostrophe.
    normalized = normalized.replace(/^['']+/g, '');
    // Treat "KK-1000", "KK 1000", "KK_1000" the same as "KK1000".
    const compact = normalized.replace(/[\s\-_/]+/g, '');
    if (compact.startsWith('KK')) return 'Katan II';
    if (compact.startsWith('KC')) return 'Katan III';
    return null;
}

/**
 * List filter: match stored `organization` and/or `dealId` prefix (KK/KC).
 * Rows often display org from deal id even when `organization` was never persisted.
 */
export function buildOrganizationListFilterWhere(orgParam: string): Prisma.ApplicationWhereInput {
    const trimmed = String(orgParam).trim();
    const lower = trimmed.toLowerCase();

    if (lower === 'katan ii') {
        return {
            OR: [
                { organization: { equals: 'Katan II', mode: 'insensitive' } },
                { organization: { equals: 'Katan 2', mode: 'insensitive' } },
                { dealId: { startsWith: 'KK', mode: 'insensitive' } },
            ],
        };
    }
    if (lower === 'katan iii') {
        return {
            OR: [
                { organization: { equals: 'Katan III', mode: 'insensitive' } },
                { organization: { equals: 'Katan 3', mode: 'insensitive' } },
                { dealId: { startsWith: 'KC', mode: 'insensitive' } },
            ],
        };
    }

    return {
        organization: { equals: trimmed, mode: 'insensitive' },
    };
}

/** Optional payment-dashboard / list scope: merge funded (or any) base where with Katan II / III filter. */
export function mergeApplicationWhereWithOrganization(
    baseWhere: Prisma.ApplicationWhereInput,
    orgParam: string | undefined | null,
): Prisma.ApplicationWhereInput {
    const trimmed = String(orgParam ?? '').trim();
    if (!trimmed || trimmed.toLowerCase() === 'all') return baseWhere;
    return {
        AND: [baseWhere, buildOrganizationListFilterWhere(trimmed)],
    };
}
