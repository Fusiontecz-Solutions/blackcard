import type { Prisma } from '@prisma/client';

/** Tenant queue written when Super Admin / Scrubber tags a deal as not a real MCA application. */
export const FAKE_APPLICATION_QUEUE = 'fake Application';

export const FAKE_APPLICATION_QUEUE_ALIASES = [
    FAKE_APPLICATION_QUEUE,
    'Fake Application',
    'Not A Application',
    'Not_A_Application',
    'Not an MCA Application',
] as const;

/**
 * Old deals that were never scrubbed, parked out of the live pipeline. Written as
 * both queue and state so no queue- or state-based pipeline count picks them up.
 */
export const OLD_NOT_SCRUBBED_QUEUE = 'Old Not Scrubbed';

export const OLD_NOT_SCRUBBED_QUEUE_ALIASES = [
    OLD_NOT_SCRUBBED_QUEUE,
    'Old - Not Scrubbed',
    'Old_Not_Scrubbed',
] as const;

export function isOldNotScrubbedQueue(value: string | null | undefined): boolean {
    return (
        String(value ?? '')
            .trim()
            .replace(/[\s_-]+/g, '')
            .toLowerCase() === 'oldnotscrubbed'
    );
}

export function oldNotScrubbedMatchWhere(): Prisma.ApplicationWhereInput {
    return { currentQueue: { in: [...OLD_NOT_SCRUBBED_QUEUE_ALIASES] } };
}

export function excludeOldNotScrubbedWhere(): Prisma.ApplicationWhereInput {
    return { NOT: { currentQueue: { in: [...OLD_NOT_SCRUBBED_QUEUE_ALIASES] } } };
}

export const DECLINE_BY_SCRUBBER_ACTION = 'Decline by Scrubber';
export const DECLINE_BY_UNDERWRITER_ACTION = 'Decline by UW';
/** Declined by Super Admin / Admin / Operations — not by an underwriter. */
export const DECLINE_BY_ADMIN_ACTION = 'Decline by Admin';

const RECOMMEND_DECLINE = 'Recommend Decline';

export function isFakeApplicationQueue(value: string | null | undefined): boolean {
    const key = String(value ?? '')
        .trim()
        .replace(/[\s_-]+/g, '')
        .toLowerCase();
    return (
        key === 'fakeapplication' ||
        key === 'notaapplication' ||
        key === 'notanapplication' ||
        key === 'notanmcaapplication'
    );
}

export function notAApplicationMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        currentQueue: { in: [...FAKE_APPLICATION_QUEUE_ALIASES] },
    };
}

export function excludeNotAApplicationWhere(): Prisma.ApplicationWhereInput {
    return {
        NOT: { currentQueue: { in: [...FAKE_APPLICATION_QUEUE_ALIASES] } },
    };
}

export function declineRequestMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        AND: [
            {
                scrubberRecommendation: {
                    contains: RECOMMEND_DECLINE,
                    mode: 'insensitive',
                },
            },
            {
                NOT: {
                    currentQueue: {
                        in: [
                            'Declined',
                            'Rejected',
                            ...FAKE_APPLICATION_QUEUE_ALIASES,
                        ],
                    },
                },
            },
        ],
    };
}

export function declinedByScrubberMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        AND: [
            { currentQueue: { in: ['Declined', 'Rejected'] } },
            {
                OR: [
                    { underwriterAction: DECLINE_BY_SCRUBBER_ACTION },
                    {
                        AND: [
                            {
                                scrubberRecommendation: {
                                    contains: RECOMMEND_DECLINE,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                NOT: {
                                    underwriterAction: {
                                        in: [DECLINE_BY_UNDERWRITER_ACTION, DECLINE_BY_ADMIN_ACTION],
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

export function declinedByUnderwriterMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        AND: [
            { currentQueue: { in: ['Declined', 'Rejected'] } },
            { NOT: declinedByScrubberMatchWhere() },
            { NOT: { underwriterAction: DECLINE_BY_ADMIN_ACTION } },
        ],
    };
}

/** Hard declines recorded by Super Admin / Admin / Operations. */
export function declinedByAdminMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        AND: [
            { currentQueue: { in: ['Declined', 'Rejected'] } },
            { underwriterAction: DECLINE_BY_ADMIN_ACTION },
        ],
    };
}

/** Parent Decline bucket for Super Admin: open decline requests + hard declines. */
export function declineAllMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        OR: [
            declineRequestMatchWhere(),
            { currentQueue: { in: ['Declined', 'Rejected'] } },
        ],
    };
}

export function classifyDeclineActorRole(
    actorRole: string | null | undefined,
    bodyDeclinedByRole?: string | null,
): 'SCRUBBING' | 'UNDERWRITER' | 'ADMIN' {
    const raw = String(bodyDeclinedByRole || actorRole || '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');
    if (raw === 'SCRUBBING' || raw === 'SCRUBBER') return 'SCRUBBING';
    if (raw === 'UNDERWRITER') return 'UNDERWRITER';
    // Super Admin, Admin, Operations, … used to fall through to UNDERWRITER,
    // so an admin decline read "Decline by UW".
    return 'ADMIN';
}

export function declineActionForRole(
    actorRole: string | null | undefined,
    bodyDeclinedByRole?: string | null,
): string {
    const role = classifyDeclineActorRole(actorRole, bodyDeclinedByRole);
    if (role === 'SCRUBBING') return DECLINE_BY_SCRUBBER_ACTION;
    if (role === 'UNDERWRITER') return DECLINE_BY_UNDERWRITER_ACTION;
    return DECLINE_BY_ADMIN_ACTION;
}
