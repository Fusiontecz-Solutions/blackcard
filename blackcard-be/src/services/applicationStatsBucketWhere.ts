import type { Prisma } from '@prisma/client';

export type ApplicationStatsBucketWhereOptions = {
    /** SCRUBBING / UNDERWRITER inbox: align `statsBucket` list filters with Queue / Claimed / My scoped stats cards. */
    uwInbox?: {
        tab: 'unclaimed' | 'claimed' | 'mine';
        viewerId: string;
        stage?: 'scrubbing' | 'underwriter';
    };
};

function icEq(
    field: 'currentQueue' | 'currentState',
    value: string,
): Prisma.ApplicationWhereInput {
    return { [field]: { equals: value, mode: 'insensitive' } };
}

/** Mirrors dashboard `/applications/stats` bucket logic for list filtering (see `applicationStatsService.ts`). */
export function buildApplicationStatsBucketWhere(
    raw: string | undefined | null,
    opts?: ApplicationStatsBucketWhereOptions,
): Prisma.ApplicationWhereInput | undefined {
    if (!raw?.trim()) return undefined;
    const key = raw.trim().toLowerCase().replace(/-/g, '_');

    /**
     * "Funded" bucket:
     *
     * UX-wise, the user expects the FUNDED stat card and “Funded Applications”
     * view to only show rows whose visible *Current State* chip says
     * "Funded" (or an obviously funded queue such as Disbursement).
     *
     * That chip is driven by `currentQueue` in the frontend, so if we include
     * applications solely because their `currentState` is funded/completed
     * while the queue is still e.g. "Approved" or "Contracted", the list will
     * show non-funded states under a funded filter.
     *
     * To avoid that confusion we now scope the funded list strictly by queue:
     *   - currentQueue ∈ { Funded, Disbursement, Disbursment }
     *
     * (If later you want to treat other queues as funded, add them to this OR.)
     */
    const fundedWhere: Prisma.ApplicationWhereInput = {
        OR: [
            icEq('currentQueue', 'Funded'),
            icEq('currentQueue', 'Disbursement'),
            icEq('currentQueue', 'Disbursment'),
        ],
    };

    const scrubberMineClaimPart = (): Prisma.ApplicationWhereInput | undefined => {
        if (opts?.uwInbox?.tab !== 'mine' || opts.uwInbox.stage === 'underwriter') {
            return undefined;
        }
        return { claimedByUnderwriterId: opts.uwInbox.viewerId };
    };

    const withScrubberMineClaim = (
        base: Prisma.ApplicationWhereInput,
    ): Prisma.ApplicationWhereInput => {
        const claimPart = scrubberMineClaimPart();
        if (!claimPart) return base;
        return { AND: [base, claimPart] };
    };

    const uwInboxQueueAndClaim = (
        optsInbox: NonNullable<ApplicationStatsBucketWhereOptions['uwInbox']>,
    ): { AND: Prisma.ApplicationWhereInput[] } => {
        const isFinalUw = optsInbox.stage === 'underwriter';
        const claimPart: Prisma.ApplicationWhereInput =
            optsInbox.tab === 'unclaimed'
                ? isFinalUw
                    ? { assignedUnderwriterId: null }
                    : { claimedByUnderwriterId: null, assignedUnderwriterId: null }
                : isFinalUw
                  ? { assignedUnderwriterId: optsInbox.viewerId }
                  : {
                        claimedByUnderwriterId: optsInbox.viewerId,
                    };
        // Underwriter My Deals: assigned deals in any queue. Scrubber Claimed stays in Scrubbing.
        if (isFinalUw && optsInbox.tab === 'mine') {
            return { AND: [claimPart] };
        }
        const queuePart: Prisma.ApplicationWhereInput =
            isFinalUw && optsInbox.tab === 'unclaimed'
                ? {
                      OR: [icEq('currentQueue', 'Underwriter'), icEq('currentQueue', 'Scrubbing')],
                  }
                : icEq('currentQueue', isFinalUw ? 'Underwriter' : 'Scrubbing');
        return { AND: [queuePart, claimPart] };
    };

    switch (key) {
        case 'funded':
            return withScrubberMineClaim(fundedWhere);
        case 'rejected':
            return withScrubberMineClaim(icEq('currentQueue', 'Declined'));
        case 'workflow_pending':
            if (opts?.uwInbox) {
                const isFinalUw = opts.uwInbox.stage === 'underwriter';
                if (!isFinalUw && opts.uwInbox.tab === 'mine') {
                    return undefined;
                }
                const { AND: inboxAnd } = uwInboxQueueAndClaim(opts.uwInbox);
                return {
                    AND: [
                        ...(inboxAnd ?? []),
                        {
                            OR: [
                                icEq('currentState', 'SUBMITTED'),
                                icEq('currentState', 'PENDING'),
                                icEq('currentState', 'Pending'),
                            ],
                        },
                    ],
                };
            }
            return {
                OR: [
                    icEq('currentQueue', 'Agent'),
                    icEq('currentState', 'PENDING'),
                    icEq('currentState', 'Pending'),
                ],
            };
        case 'workflow_in_progress':
            if (opts?.uwInbox) {
                const isFinalUw = opts.uwInbox.stage === 'underwriter';
                if (!isFinalUw && opts.uwInbox.tab === 'mine') {
                    return undefined;
                }
                const { AND: inboxAnd } = uwInboxQueueAndClaim(opts.uwInbox);
                return {
                    AND: [
                        ...(inboxAnd ?? []),
                        {
                            OR: [
                                icEq('currentState', 'IN_PROGRESS'),
                                icEq('currentState', 'In Progress'),
                                icEq('currentState', 'In_Progress'),
                            ],
                        },
                    ],
                };
            }
            return {
                OR: [
                    icEq('currentQueue', 'Scrubbing'),
                    icEq('currentState', 'IN_PROGRESS'),
                    icEq('currentState', 'In Progress'),
                    icEq('currentState', 'In_Progress'),
                ],
            };
        case 'in_process':
            return {
                OR: [
                    icEq('currentQueue', 'New'),
                    icEq('currentQueue', 'Agent'),
                    icEq('currentQueue', 'Review'),
                    icEq('currentQueue', 'Underwriting'),
                    icEq('currentQueue', 'Scrubbing'),
                    icEq('currentQueue', 'Final Review'),
                    icEq('currentQueue', 'Underwriter'),
                ],
            };
        case 'underwriting':
            return {
                OR: [icEq('currentQueue', 'Underwriting'), icEq('currentQueue', 'Scrubbing')],
            };
        case 'pending_pipeline': {
            const pipelineQueues = [
                'New',
                'Agent',
                'On Hold',
                'Contract Pending',
                'Contract Generated',
                'Contracted',
                'Contract Out',
                'Contracts Out',
                'Review',
                'Underwriting',
                'Scrubbing',
                'Final Review',
                'Underwriter',
                'Final',
                'Funding Call',
                'Disbursement',
                'Disbursment',
            ];
            return {
                AND: [
                    { NOT: icEq('currentQueue', 'Declined') },
                    { NOT: icEq('currentQueue', 'Funded') },
                    { OR: pipelineQueues.map((q) => icEq('currentQueue', q)) },
                ],
            };
        }
        case 'approved':
            /** Matches `/applications/stats` approved bucket: `currentState` = Approved only (not CONTRACTS_OUT / Contracted). */
            return withScrubberMineClaim({
                OR: [
                    icEq('currentState', 'Underwriter Approved'),
                    icEq('currentState', 'UNDERWRITER_APPROVED'),
                    icEq('currentState', 'Approved'),
                    icEq('currentState', 'APPROVED'),
                ],
            });
        default:
            return undefined;
    }
}

/**
 * Broader “funded” cohort for **portfolio payback total**: funded queue (same as stats bucket)
 * **or** `currentState` indicating Funded — matches “look at applications whose state or queue is funded”.
 */
export function buildFundedApplicationWhereForPaybackTotals(): Prisma.ApplicationWhereInput {
    return {
        OR: [
            icEq('currentQueue', 'Funded'),
            icEq('currentQueue', 'Disbursement'),
            icEq('currentQueue', 'Disbursment'),
            icEq('currentState', 'Funded'),
            icEq('currentState', 'FUNDED'),
        ],
    };
}
