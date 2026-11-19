import type { Prisma } from '@prisma/client';
import { compactDealIdToken } from '../utils/funderDealIdTokens';

/** True when the query looks like a compact deal code (e.g. KC1203, KK1483, BA1020). */
export function isDealIdLikeSearch(term: string): boolean {
    const trimmed = String(term ?? '').trim();
    if (!trimmed || /\s/.test(trimmed)) return false;
    const compact = compactDealIdToken(trimmed);
    if (!compact || /^\d+$/.test(compact)) return false;
    return /[A-Z]/.test(compact) && /\d/.test(compact);
}

/** True when the compact token is a full deal id (letters + digits only, e.g. KC1203). */
export function isCompleteDealIdToken(compact: string): boolean {
    return /^[A-Z]{2,}\d+$/i.test(compact);
}

function dealIdEqualsFilter(
    value: string,
): Prisma.StringNullableFilter<'Application'> {
    return { equals: value, mode: 'insensitive' };
}

function dealIdStartsWithFilter(
    value: string,
): Prisma.StringNullableFilter<'Application'> {
    return { startsWith: value, mode: 'insensitive' };
}

/**
 * Server-side applications list search.
 * Deal-id-shaped queries match only `dealId` (never notes or client text) to avoid
 * false positives from `[DEAL_ID:…]` markers stored on other applications.
 */
export function buildApplicationListSearchWhere(
    search: string,
): Prisma.ApplicationWhereInput {
    const raw = String(search ?? '').trim();
    if (!raw) return {};

    if (/^\d+$/.test(raw)) {
        return {
            OR: [
                { applicationId: Number(raw) },
                { dealId: { contains: raw, mode: 'insensitive' } },
            ],
        };
    }

    if (isDealIdLikeSearch(raw)) {
        const compact = compactDealIdToken(raw);
        const variants = new Set<string>([compact]);
        const rawUpper = raw.toUpperCase();
        if (rawUpper !== compact) variants.add(rawUpper);

        const or: Prisma.ApplicationWhereInput[] = [];
        for (const token of variants) {
            const filter = isCompleteDealIdToken(token)
                ? dealIdEqualsFilter(token)
                : dealIdStartsWithFilter(token);
            or.push({ dealId: filter });
        }
        return { OR: or };
    }

    return {
        OR: [
            { dealId: { contains: raw, mode: 'insensitive' } },
            { dealDisplayName: { contains: raw, mode: 'insensitive' } },
            { type: { contains: raw, mode: 'insensitive' } },
            {
                client: {
                    OR: [
                        { businessName: { contains: raw, mode: 'insensitive' } },
                        { businessEmail: { contains: raw, mode: 'insensitive' } },
                        { ownerFirstName: { contains: raw, mode: 'insensitive' } },
                        { ownerLastName: { contains: raw, mode: 'insensitive' } },
                        { ownerEmail: { contains: raw, mode: 'insensitive' } },
                    ],
                },
            },
            {
                iso: {
                    OR: [
                        { name: { contains: raw, mode: 'insensitive' } },
                        { email: { contains: raw, mode: 'insensitive' } },
                    ],
                },
            },
        ],
    };
}
