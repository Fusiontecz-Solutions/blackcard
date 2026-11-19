import type { Prisma } from '@prisma/client';
import { CANONICAL_WORKFLOW_QUEUES } from '../utils/workflowQueueStorage';
import { declinedByAdminMatchWhere } from './declineSplitFilter';
import { declinedMatchWhere, excludeSoftDeletedWhere } from './operationsStatusFilter';

/** Canonical labels persisted on `Application.underwriterAction`. */
export const UNDERWRITER_ACTION_APPROVED = 'Approved By UW' as const;
export const UNDERWRITER_ACTION_DECLINED = 'Decline by UW' as const;
export const UNDERWRITER_ACTION_FINAL_APPROVED = 'Final Approved by UW' as const;

export const FINAL_APPROVAL_QUEUE = 'Final Approval' as const;

export const UNDERWRITER_PIPELINE_FILTERS = [
    'unclaimed',
    'claimed',
    'approved-by-uw',
    'declined-by-uw',
    'declined-by-admin',
    'final-approval',
    'final-approved-by-uw',
    'iso-query',
    'on-hold',
    'scrubber-approved',
    'scrubber-declined',
] as const;

/** Scrubber sidebar My Deals filters (deals the scrubber claimed, by outcome). */
export const SCRUBBER_PIPELINE_FILTERS = ['scrubber-approved', 'scrubber-declined'] as const;

/** Comment type posted by ISO from the approval portal. */
export const ISO_COMMENT_TYPE = 'ISO Comment' as const;

export type UnderwriterPipelineFilter =
    (typeof UNDERWRITER_PIPELINE_FILTERS)[number];

export function normalizeUnderwriterPipelineParam(
    raw: unknown,
): UnderwriterPipelineFilter | null {
    if (raw == null) return null;
    const value = String(Array.isArray(raw) ? raw[0] : raw)
        .trim()
        .toLowerCase();
    return (UNDERWRITER_PIPELINE_FILTERS as readonly string[]).includes(value)
        ? (value as UnderwriterPipelineFilter)
        : null;
}

/** Deals credited to the viewing underwriter (assigned or approved-by). */
function linkedToUnderwriter(viewerId: string): Prisma.ApplicationWhereInput {
    return {
        OR: [
            { approvedByUnderwriterId: viewerId },
            { assignedUnderwriterId: viewerId },
        ],
    };
}

/** Scrubber My Deals: deals this scrubber claimed that have left Scrubbing. */
function scrubberMyDeals(viewerId: string): Prisma.ApplicationWhereInput {
    return {
        claimedByUnderwriterId: viewerId,
        NOT: {
            currentQueue: {
                equals: CANONICAL_WORKFLOW_QUEUES.SCRUBBING,
                mode: 'insensitive',
            },
        },
    };
}

export function buildUnderwriterPipelineWhere(
    pipeline: UnderwriterPipelineFilter,
    viewerId: string,
): Prisma.ApplicationWhereInput {
    switch (pipeline) {
        case 'unclaimed':
            return {
                assignedUnderwriterId: null,
                OR: [
                    { currentQueue: CANONICAL_WORKFLOW_QUEUES.UNDERWRITER },
                    { currentQueue: CANONICAL_WORKFLOW_QUEUES.SCRUBBING },
                ],
            };
        case 'claimed':
            // Claimed / My Deals for underwriter: all deals assigned to them.
            return {
                assignedUnderwriterId: viewerId,
            };
        case 'approved-by-uw':
            return {
                underwriterAction: UNDERWRITER_ACTION_APPROVED,
                ...linkedToUnderwriter(viewerId),
            };
        case 'declined-by-admin':
            // Hard declines by Super Admin / Admin / Operations on deals linked to this underwriter.
            return {
                AND: [linkedToUnderwriter(viewerId), declinedByAdminMatchWhere()],
            };
        case 'declined-by-uw':
            return {
                underwriterAction: UNDERWRITER_ACTION_DECLINED,
                ...linkedToUnderwriter(viewerId),
            };
        case 'final-approval':
            return {
                currentQueue: FINAL_APPROVAL_QUEUE,
                ...linkedToUnderwriter(viewerId),
            };
        case 'final-approved-by-uw':
            return {
                underwriterAction: UNDERWRITER_ACTION_FINAL_APPROVED,
                ...linkedToUnderwriter(viewerId),
            };
        case 'iso-query':
            // Deals the underwriter is linked to that have unresolved ISO comments.
            return {
                AND: [
                    linkedToUnderwriter(viewerId),
                    { isoQueryResolved: false },
                    {
                        comments: {
                            some: {
                                type: ISO_COMMENT_TYPE,
                                isDeleted: false,
                            },
                        },
                    },
                ],
            };
        case 'on-hold':
            return {
                AND: [
                    {
                        OR: [
                            { currentQueue: { in: ['On Hold', 'On_Hold'] } },
                            { currentState: { in: ['On Hold', 'On_Hold'] } },
                        ],
                    },
                    linkedToUnderwriter(viewerId),
                ],
            };
        case 'scrubber-approved':
            // Underwriter approved (or final approved) and not declined afterwards.
            return {
                AND: [
                    scrubberMyDeals(viewerId),
                    {
                        underwriterAction: {
                            in: [UNDERWRITER_ACTION_APPROVED, UNDERWRITER_ACTION_FINAL_APPROVED],
                        },
                    },
                    { NOT: declinedMatchWhere() },
                ],
            };
        case 'scrubber-declined':
            return {
                AND: [scrubberMyDeals(viewerId), declinedMatchWhere()],
            };
        default:
            return {};
    }
}

export async function countUnderwriterPipelineDeals(
    prisma: { application: { count: (args: { where: Prisma.ApplicationWhereInput }) => Promise<number> } },
    viewerId: string,
    pipelines: readonly UnderwriterPipelineFilter[] = UNDERWRITER_PIPELINE_FILTERS.filter(
        (p) => !(SCRUBBER_PIPELINE_FILTERS as readonly string[]).includes(p),
    ),
): Promise<Partial<Record<UnderwriterPipelineFilter, number>>> {
    const entries = await Promise.all(
        pipelines.map(async (pipeline) => {
            const count = await prisma.application.count({
                where: {
                    AND: [
                        buildUnderwriterPipelineWhere(pipeline, viewerId),
                        excludeSoftDeletedWhere(),
                    ],
                },
            });
            return [pipeline, count] as const;
        }),
    );
    return Object.fromEntries(entries) as Partial<Record<UnderwriterPipelineFilter, number>>;
}
