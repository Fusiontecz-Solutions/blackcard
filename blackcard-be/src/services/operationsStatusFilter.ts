import type { Prisma } from '@prisma/client';
import { awaitingNewContractReinitiationWhere } from './contractReinitiationService';
import {
    declineAllMatchWhere,
    declineRequestMatchWhere,
    declinedByScrubberMatchWhere,
    declinedByAdminMatchWhere,
    declinedByUnderwriterMatchWhere,
    excludeNotAApplicationWhere,
    excludeOldNotScrubbedWhere,
    isFakeApplicationQueue,
    isOldNotScrubbedQueue,
    notAApplicationMatchWhere,
    oldNotScrubbedMatchWhere,
} from './declineSplitFilter';

type ApplicationState =
    | 'DRAFT'
    | 'PENDING'
    | 'SUBMITTED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'CONTRACT_PENDING'
    | 'CONTRACT_GENERATED'
    | 'CONTRACT_SENT'
    | 'CONTRACT_CANCELLED'
    | 'CONTRACTS_OUT'
    | 'SIGNED_CONTRACTS'
    | 'FUNDING_CALL'
    | 'DISBURSMENT'
    | 'FUNDED'
    | 'FINAL';

const ApplicationStateConst = {
    DRAFT: 'DRAFT',
    PENDING: 'PENDING',
    SUBMITTED: 'SUBMITTED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    CONTRACT_PENDING: 'CONTRACT_PENDING',
    CONTRACT_GENERATED: 'CONTRACT_GENERATED',
    CONTRACT_SENT: 'CONTRACT_SENT',
    CONTRACT_CANCELLED: 'CONTRACT_CANCELLED',
    CONTRACTS_OUT: 'CONTRACTS_OUT',
    SIGNED_CONTRACTS: 'SIGNED_CONTRACTS',
    FUNDING_CALL: 'FUNDING_CALL',
    DISBURSMENT: 'DISBURSMENT',
    FUNDED: 'FUNDED',
    FINAL: 'FINAL',
} as const satisfies Record<ApplicationState, ApplicationState>;

const applicationStateApiToPrisma: Record<string, ApplicationState> = {
    Draft: 'DRAFT',
    New: 'DRAFT',
    Submitted: 'SUBMITTED',
    'In Progress': 'IN_PROGRESS',
    In_Progress: 'IN_PROGRESS',
    IN_PROGRESS: 'IN_PROGRESS',
    Pending: 'PENDING',
    Completed: 'COMPLETED',
    Approved: 'COMPLETED',
    Cancelled: 'CANCELLED',
    Contract_Pending: 'CONTRACT_PENDING',
    Contract_Generated: 'CONTRACT_GENERATED',
    Contract_Sent: 'CONTRACT_SENT',
    Contract_Cancelled: 'CONTRACT_CANCELLED',
    Contracts_Out: 'CONTRACTS_OUT',
    'Contracts Out': 'CONTRACTS_OUT',
    /** Legacy alias — sent contracts awaiting signature. */
    'Contract Out': 'CONTRACT_SENT',
    Contracted: 'CONTRACTS_OUT',
    Signed_Contracts: 'SIGNED_CONTRACTS',
    'Funding Call': 'FUNDING_CALL',
    Disbursment: 'DISBURSMENT',
    Disbursement: 'DISBURSMENT',
    DISBURSEMENT: 'DISBURSMENT',
    Funded: 'FUNDED',
    FUNDED: 'FUNDED',
    FINAL: 'FINAL',
    Final: 'FINAL',
};

/** First review stage queues (canonical `Scrubbing`; legacy Underwriting / Review). */
export const SCRUBBING_PIPELINE_QUEUE_STRICT = [
    'Scrubbing',
    'Underwriting',
    'Review',
] as const;

/** Final review stage queues (canonical `Underwriter`; legacy Final Review / Final Underwriter). */
export const UNDERWRITER_PIPELINE_QUEUE_STRICT = [
    'Underwriter',
    'Final Review',
    'Final Underwriter',
    'Final_Underwriter',
] as const;

/** Final approval stage — awaiting underwriter sign-off before contract automation. */
const FINAL_APPROVAL_QUEUE_STRICT = [
    'Final Approval',
    'Final_Approval',
    'FinalApproval',
] as const;

const FINAL_APPROVAL_STATE_STRICT = [
    'Final Approval',
    'Final_Approval',
    'FINAL_APPROVAL',
];

/** Agent intake queues. */
export const AGENT_PIPELINE_QUEUE_STRICT = ['Agent', 'New', 'Draft'] as const;

/** Stored `currentState` spellings for final review (post-rename + legacy). */
const UNDERWRITER_PIPELINE_STATE_STRICT = [
    'Underwriter',
    'Final Review',
    'Final Underwriter',
    'Final_Underwriter',
    'FINAL_REVIEW',
    'FINAL_UNDERWRITER',
];

/** Stored `currentState` spellings for first review (post-rename + legacy). */
const SCRUBBING_PIPELINE_STATE_STRICT = [
    'Scrubbing',
    'Underwriting',
    'UNDERWRITING',
    'IN_PROGRESS',
    'In Progress',
    'In_Progress',
];

/** Queue labels used by deal-pipeline filters (aligned with application list aliases). */
export const dashboardStateQueueAliases: Record<string, string[]> = {
    Agent: ['New', 'Draft'],
    Scrubbing: ['Underwriting', 'Review'],
    Underwriter: ['Final Review', 'Final Underwriter', 'Final_Underwriter'],
    Final_Approval: ['Final Approval', 'Final_Approval', 'FinalApproval'],
    Contract_Pending: ['Contract Pending', 'Contract_Pending'],
    Contract_Generated: ['Contract Generated', 'Contract_Generated'],
    Contract_Sent: ['Contract Sent', 'Contract_Sent', 'Contract Out', 'Contract_Out', 'Contracts Out', 'Contracts_Out'],
    Contract_Cancelled: ['Contract Cancelled', 'Contract_Cancelled'],
    Contracted: [
        'Contracted',
        'Contract Pending',
        'Contract_Pending',
        'Contract Generated',
        'Contract_Generated',
        'Contract Sent',
        'Contract_Sent',
        'Contract Cancelled',
        'Contract_Cancelled',
        'Contract Signed',
        'Contract_Signed',
        'Contract Out',
        'Contracts Out',
        'Contracts_Out',
        'Contract_Out',
        'Signed Contracts',
        'Signed_Contracts',
    ],
    'Contract Out': ['Contract Out', 'Contract_Out', 'Contract Sent', 'Contract_Sent', 'Contracts Out', 'Contracts_Out'],
    'Contracts Out': ['Contracts Out', 'Contracts_Out', 'Contract Out', 'Contract_Out', 'Contract Sent', 'Contract_Sent'],
    Contracts_Out: ['Contracts Out', 'Contracts_Out', 'Contract Out', 'Contract_Out', 'Contract Sent', 'Contract_Sent'],
    Signed_Contracts: [
        'Signed Contracts',
        'Signed_Contracts',
        'Contract Signed',
        'Contract_Signed',
    ],
    'Funding Call': ['Funding Call', 'Funding_Call'],
    Disbursment: ['Disbursment', 'Disbursement'],
    Funded: ['Funded', 'Completed'],
    On_Hold: ['On Hold', 'On_Hold'],
    Missing_Documents: ['Missing Documents', 'Missing_Documents'],
};

export const normalizeOperationsStatusKey = (value: string): string => {
    const normalized = value.trim().replace(/[\s-]+/g, '_');
    if (!normalized) return normalized;
    return normalized
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('_');
};

/** Umbrella deal-pipeline stage: contract out + contract signed (not contracts-out only). */
export const isContractedPipelineKey = (value: string): boolean => {
    const canonical = normalizeOperationsStatusKey(value);
    return canonical === 'Contracted';
};

export const isContractedOpsKey = (value: string): boolean => {
    const canonical = normalizeOperationsStatusKey(value);
    return canonical === 'Contracted' || canonical === 'Contracts_Out';
};

export const toPrismaApplicationState = (value: unknown): ApplicationState | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    const upper = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
    const normalizedKey = trimmed.replace(/[\s-]+/g, '_');
    const canonicalized = normalizedKey
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('_');

    if (upper === 'FUNDING_CALL' || upper === 'FUNDINGCALL') return ApplicationStateConst.FUNDING_CALL;
    if (upper === 'DISBURSMENT' || upper === 'DISBURSEMENT') return ApplicationStateConst.DISBURSMENT;
    if (upper === 'PENDING') return ApplicationStateConst.PENDING;
    if (upper === 'IN_PROGRESS') return ApplicationStateConst.IN_PROGRESS;

    return (
        applicationStateApiToPrisma[trimmed] ||
        applicationStateApiToPrisma[normalizedKey] ||
        applicationStateApiToPrisma[canonicalized]
    );
};

const applicationStatePrismaToApi: Record<ApplicationState, string> = {
    [ApplicationStateConst.DRAFT]: 'Draft',
    [ApplicationStateConst.PENDING]: 'Pending',
    [ApplicationStateConst.SUBMITTED]: 'Submitted',
    [ApplicationStateConst.IN_PROGRESS]: 'In Progress',
    [ApplicationStateConst.COMPLETED]: 'Completed',
    [ApplicationStateConst.CANCELLED]: 'Cancelled',
    [ApplicationStateConst.CONTRACT_PENDING]: 'Contract_Pending',
    [ApplicationStateConst.CONTRACT_GENERATED]: 'Contract_Generated',
    [ApplicationStateConst.CONTRACT_SENT]: 'Contract_Sent',
    [ApplicationStateConst.CONTRACT_CANCELLED]: 'Contract_Cancelled',
    [ApplicationStateConst.CONTRACTS_OUT]: 'Contract Sent',
    [ApplicationStateConst.SIGNED_CONTRACTS]: 'Signed_Contracts',
    [ApplicationStateConst.FUNDING_CALL]: 'Funding Call',
    [ApplicationStateConst.DISBURSMENT]: 'Disbursment',
    [ApplicationStateConst.FUNDED]: 'Funded',
    [ApplicationStateConst.FINAL]: 'FINAL',
};

/** Queue labels for contract pending (approved / awaiting contract generation). */
const CONTRACT_PENDING_QUEUE_STRICT = [
    'Contract Pending',
    'Contract_Pending',
    'ContractPending',
];

/** Queue labels for contract generated (draft created, not yet sent). */
const CONTRACT_GENERATED_QUEUE_STRICT = [
    'Contract Generated',
    'Contract_Generated',
    'ContractGenerated',
];

/** Queue labels for contract sent (legacy Contract Out included). */
const CONTRACT_SENT_QUEUE_STRICT = [
    'Contract Sent',
    'Contract_Sent',
    'Contract Out',
    'Contract_Out',
    'Contracts Out',
    'Contracts_Out',
    'ContractOut',
];

/** Queue labels for voided / cancelled contracts. */
const CONTRACT_CANCELLED_QUEUE_STRICT = [
    'Contract Cancelled',
    'Contract_Cancelled',
    'ContractCancelled',
];

/** @deprecated Use {@link contractSentStrictMatchWhere}. */
const CONTRACT_OUT_QUEUE_STRICT = CONTRACT_SENT_QUEUE_STRICT;

export function contractPendingStrictMatchWhere(): Prisma.ApplicationWhereInput {
    return andExcludeNeedsContractReinitiation({
        OR: [
            { currentState: { in: expandStoredCurrentStateValues('CONTRACT_PENDING') } },
            { currentQueue: { in: CONTRACT_PENDING_QUEUE_STRICT } },
        ],
    });
}

export function contractGeneratedStrictMatchWhere(): Prisma.ApplicationWhereInput {
    return andExcludeNeedsContractReinitiation({
        OR: [
            { currentState: { in: expandStoredCurrentStateValues('CONTRACT_GENERATED') } },
            { currentQueue: { in: CONTRACT_GENERATED_QUEUE_STRICT } },
        ],
    });
}

/**
 * Strict contract-sent: envelope handed to signer(s), awaiting completion.
 * Includes legacy Contract Out / Contracts Out rows.
 */
export function contractSentStrictMatchWhere(): Prisma.ApplicationWhereInput {
    return andExcludeNeedsContractReinitiation({
        OR: [
            { currentState: { in: expandStoredCurrentStateValues('CONTRACT_SENT') } },
            { currentState: { in: expandStoredCurrentStateValues('CONTRACTS_OUT') } },
            { currentQueue: { in: CONTRACT_SENT_QUEUE_STRICT } },
        ],
    });
}

export function contractCancelledStrictMatchWhere(): Prisma.ApplicationWhereInput {
    return andExcludeNeedsContractReinitiation({
        OR: [
            { currentState: { in: expandStoredCurrentStateValues('CONTRACT_CANCELLED') } },
            { currentQueue: { in: CONTRACT_CANCELLED_QUEUE_STRICT } },
        ],
    });
}

/** @deprecated Use {@link contractSentStrictMatchWhere}. */
export function contractsOutStrictMatchWhere(): Prisma.ApplicationWhereInput {
    return contractSentStrictMatchWhere();
}

/** Queue labels for “contract signed” / signed-contracts stage (strict list). */
const CONTRACT_SIGNED_QUEUE_STRICT = [
    'Contract Signed',
    'Contract_Signed',
    'Signed Contracts',
    'Signed_Contracts',
    'SignedContracts',
];

/** Applications flagged for contract regeneration after offer changes post-signature. */
export function reinitiateContractMatchWhere(): Prisma.ApplicationWhereInput {
    return awaitingNewContractReinitiationWhere();
}

/** Exclude deals that belong in the Reinitiate_Contract pipeline bucket. */
export function excludeNeedsContractReinitiationWhere(): Prisma.ApplicationWhereInput {
    return { NOT: { needsContractReinitiation: true } };
}

function andExcludeNeedsContractReinitiation(
    where: Prisma.ApplicationWhereInput,
): Prisma.ApplicationWhereInput {
    return {
        AND: [where, excludeNeedsContractReinitiationWhere()],
    };
}

/**
 * Strict contract-signed: `currentState` in SIGNED_CONTRACTS spellings **or** `currentQueue`
 * matches explicit signed-contract labels (operations “Contract Signed” card drill-down).
 * Excludes deals awaiting contract reinitiation (shown under Reinitiate_Contract).
 */
export function signedContractsStrictMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        AND: [
            {
                OR: [
                    { currentState: { in: expandStoredCurrentStateValues('SIGNED_CONTRACTS') } },
                    { currentQueue: { in: CONTRACT_SIGNED_QUEUE_STRICT } },
                ],
            },
            { NOT: { needsContractReinitiation: true } },
        ],
    };
}

/** Broader signed-contract bucket for `operationsStatus=Signed_Contracts` (mixed queue/state rows). */
function signedContractsBroadMatchWhere(): Prisma.ApplicationWhereInput {
    const canonical = normalizeOperationsStatusKey('Signed_Contracts');
    const aliases =
        dashboardStateQueueAliases[canonical] ||
        dashboardStateQueueAliases[canonical.replace(/_/g, ' ')] ||
        [];
    const queueValues = Array.from(
        new Set([canonical, canonical.replace(/_/g, ' '), ...aliases]),
    );
    return andExcludeNeedsContractReinitiation({
        OR: [
            { currentState: { in: expandStoredCurrentStateValues('SIGNED_CONTRACTS') } },
            { currentQueue: { in: queueValues } },
        ],
    });
}

/**
 * Broader “contracted / contracts out” bucket (includes `Contracted` queue) for deal-pipeline
 * `operationsStatus=Contracted` and mixed legacy rows.
 */
function contractsOutBroadMatchWhere(): Prisma.ApplicationWhereInput {
    const canonical = normalizeOperationsStatusKey('Contracted');
    const aliases =
        dashboardStateQueueAliases['Contract Out'] ||
        dashboardStateQueueAliases[canonical] ||
        [];
    const queueValues = Array.from(
        new Set([canonical, canonical.replace(/_/g, ' '), ...aliases]),
    );
    return andExcludeNeedsContractReinitiation({
        OR: [
            { currentState: { in: expandStoredCurrentStateValues('CONTRACTS_OUT') } },
            { currentQueue: { in: queueValues } },
        ],
    });
}

/** Merged deal-pipeline stage: Final + Funding Call queues/states. */
export function finalsAndFundingCallCombinedMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        OR: [
            { currentState: { in: expandStoredCurrentStateValues('FINAL') } },
            { currentQueue: { in: ['Final', 'FINAL'] } },
            { currentState: { in: expandStoredCurrentStateValues('FUNDING_CALL') } },
            { currentQueue: { in: ['Funding Call', 'Funding_Call'] } },
        ],
    };
}

/** Declined / rejected applications (`currentQueue=Declined`). */
export function declinedMatchWhere(): Prisma.ApplicationWhereInput {
    return { currentQueue: 'Declined' };
}

/** Soft-deleted applications (Recently Deleted bucket). */
export function recentlyDeletedMatchWhere(): Prisma.ApplicationWhereInput {
    return { deletedAt: { not: null } };
}

/** Exclude soft-deleted rows from normal pipeline lists and stats. */
export function excludeSoftDeletedWhere(): Prisma.ApplicationWhereInput {
    return { deletedAt: null };
}

/** Scope list queries: Recently Deleted shows only trashed rows; all other views hide them. */
export function applySoftDeleteListScope(
    where: Prisma.ApplicationWhereInput,
    operationsStatus: string | undefined,
    currentQueue?: string,
    options?: {
        /** Scrubber's My Deals: old unscrubbed deals bulk-assigned to them stay visible there. */
        includeOldNotScrubbed?: boolean;
    },
): Prisma.ApplicationWhereInput {
    const canonical = operationsStatus
        ? normalizeOperationsStatusKey(String(operationsStatus))
        : '';
    const softDeleteFilter =
        canonical === 'Recently_Deleted'
            ? recentlyDeletedMatchWhere()
            : excludeSoftDeletedWhere();
    const existingAnd = where.AND
        ? Array.isArray(where.AND)
            ? where.AND
            : [where.AND]
        : [];
    const extras: Prisma.ApplicationWhereInput[] = [...existingAnd, softDeleteFilter];
    const listingNotAApplication =
        canonical === 'Not_A_Application' ||
        canonical === 'Fake_Application' ||
        isFakeApplicationQueue(currentQueue);
    if (!listingNotAApplication && canonical !== 'Recently_Deleted') {
        extras.push(excludeNotAApplicationWhere());
    }
    const listingOldNotScrubbed =
        canonical === 'Old_Not_Scrubbed' ||
        isOldNotScrubbedQueue(currentQueue) ||
        Boolean(options?.includeOldNotScrubbed);
    if (!listingOldNotScrubbed && canonical !== 'Recently_Deleted') {
        extras.push(excludeOldNotScrubbedWhere());
    }
    return {
        ...where,
        AND: extras,
    };
}

/** Agent intake — queue labels only (matches sidebar / list drill-down). */
export function agentPipelineMatchWhere(): Prisma.ApplicationWhereInput {
    return { currentQueue: { in: [...AGENT_PIPELINE_QUEUE_STRICT] } };
}

/**
 * First review stage (Scrubbing). Matches canonical + legacy queue labels and
 * in-progress state rows that have not advanced to final review.
 */
export function scrubbingPipelineMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        OR: [
            { currentQueue: { in: [...SCRUBBING_PIPELINE_QUEUE_STRICT] } },
            {
                AND: [
                    { currentState: { in: SCRUBBING_PIPELINE_STATE_STRICT } },
                    {
                        NOT: {
                            currentQueue: { in: [...UNDERWRITER_PIPELINE_QUEUE_STRICT] },
                        },
                    },
                ],
            },
        ],
    };
}

/**
 * Final review stage (Underwriter). Matches canonical + legacy queue/state spellings
 * (aligned with `workflowQueueStorage` and post-rename migrations).
 */
export function underwriterPipelineMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        OR: [
            { currentQueue: { in: [...UNDERWRITER_PIPELINE_QUEUE_STRICT] } },
            {
                AND: [
                    { currentState: { in: UNDERWRITER_PIPELINE_STATE_STRICT } },
                    {
                        NOT: {
                            currentQueue: { in: [...SCRUBBING_PIPELINE_QUEUE_STRICT] },
                        },
                    },
                ],
            },
        ],
    };
}

/** Final approval — admin-sent from Decision Logic or Funding Call; awaiting UW sign-off. */
export function finalApprovalPipelineMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        AND: [
            {
                finalApprovalSource: {
                    in: ['Decision Logic', 'Funding Call'],
                },
            },
            {
                OR: [
                    { currentQueue: { in: [...FINAL_APPROVAL_QUEUE_STRICT] } },
                    { currentState: { in: FINAL_APPROVAL_STATE_STRICT } },
                ],
            },
        ],
    };
}

/** Final stage before funding call. */
export function finalPipelineMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        OR: [
            { currentState: { in: expandStoredCurrentStateValues('FINAL') } },
            { currentQueue: { in: ['Final', 'FINAL'] } },
        ],
    };
}

/** Activity log row for a branded approval / offer-update email sent to the linked ISO. */
function approvalEmailActivityLogWhere(): Prisma.ApplicationWhereInput {
    return {
        ApplicationActivityLog: {
            some: {
                actionType: 'APPROVED',
                OR: [
                    { metadata: { path: ['template'], equals: 'approval' } },
                    { metadata: { path: ['template'], equals: 'offer-updated' } },
                    {
                        actionDescription: {
                            contains: 'sent approval email',
                            mode: 'insensitive',
                        },
                    },
                    {
                        actionDescription: {
                            contains: 'resent updated offer email',
                            mode: 'insensitive',
                        },
                    },
                ],
            },
        },
    };
}

/** ISO public-portal approval (`approveApplication` with `actorType=ISO`). */
function isoPortalApprovalActivityLogWhere(): Prisma.ApplicationWhereInput {
    return {
        ApplicationActivityLog: {
            some: {
                actionType: 'APPROVED',
                OR: [
                    { metadata: { path: ['actorType'], equals: 'ISO' } },
                    { actionDescription: { contains: 'ISO approved', mode: 'insensitive' } },
                ],
            },
        },
    };
}

/** UW / internal approval bucket (`currentQueue` = Underwriter Approved). */
const uwApprovedBucketWhere: Prisma.ApplicationWhereInput = {
    OR: [
        { currentQueue: { equals: 'Underwriter Approved', mode: 'insensitive' } },
        // Legacy UW rows before the label change — exclude ISO portal approvals.
        {
            AND: [
                { currentQueue: { equals: 'Approved', mode: 'insensitive' } },
                { currentState: { equals: 'Approved', mode: 'insensitive' } },
                { NOT: isoPortalApprovalActivityLogWhere() },
            ],
        },
    ],
};

/** Umbrella deal-pipeline stage: UW approved + approval mail sent + ISO approved. */
export const isApprovedPipelineKey = (value: string): boolean => {
    const canonical = normalizeOperationsStatusKey(value);
    return (
        canonical === 'Approved' ||
        canonical === 'Approved_By_Uw' ||
        canonical === 'Approval_Sent' ||
        canonical === 'Approved_By_Iso'
    );
};

/** Final underwriter approved; queue is Underwriter Approved (source of truth). */
export function approvedByUwMatchWhere(): Prisma.ApplicationWhereInput {
    return andExcludeNeedsContractReinitiation(uwApprovedBucketWhere);
}

/**
 * Deals that have left the “Approval Sent” stage (ISO approved, contract, final, funded, etc.).
 * Used so activity-log fallbacks do not keep advanced deals in the Approval Sent bucket.
 */
function progressedPastApprovalSentMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        OR: [
            isoPortalApprovalActivityLogWhere(),
            {
                AND: [
                    { currentQueue: { equals: 'ISO Approved', mode: 'insensitive' } },
                    { currentState: { equals: 'ISO Approved', mode: 'insensitive' } },
                ],
            },
            {
                AND: [
                    { currentQueue: { equals: 'Approved', mode: 'insensitive' } },
                    { currentState: { equals: 'Approved', mode: 'insensitive' } },
                ],
            },
            reinitiateContractMatchWhere(),
            contractPendingStrictMatchWhere(),
            contractGeneratedStrictMatchWhere(),
            contractSentStrictMatchWhere(),
            contractCancelledStrictMatchWhere(),
            signedContractsStrictMatchWhere(),
            finalApprovalPipelineMatchWhere(),
            finalPipelineMatchWhere(),
            { currentState: { in: expandStoredCurrentStateValues('FUNDING_CALL') } },
            { currentQueue: { in: ['Funding Call', 'Funding_Call'] } },
            { currentState: { in: expandStoredCurrentStateValues('DISBURSMENT') } },
            { currentQueue: { in: ['Disbursment', 'Disbursement'] } },
            { currentState: { in: expandStoredCurrentStateValues('FUNDED') } },
            { currentQueue: { in: ['Funded'] } },
            declinedMatchWhere(),
        ],
    };
}

/**
 * Deals that have left the “ISO Approved” stage (contract workflow onward).
 * Contract Pending rows belong in Contract_Pending, not Approved_By_ISO.
 */
function progressedPastIsoApprovedMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        OR: [
            reinitiateContractMatchWhere(),
            contractPendingStrictMatchWhere(),
            contractGeneratedStrictMatchWhere(),
            contractSentStrictMatchWhere(),
            contractCancelledStrictMatchWhere(),
            signedContractsStrictMatchWhere(),
            { currentQueue: 'Contracted' },
            finalApprovalPipelineMatchWhere(),
            finalPipelineMatchWhere(),
            { currentState: { in: expandStoredCurrentStateValues('FUNDING_CALL') } },
            { currentQueue: { in: ['Funding Call', 'Funding_Call'] } },
            { currentState: { in: expandStoredCurrentStateValues('DISBURSMENT') } },
            { currentQueue: { in: ['Disbursment', 'Disbursement'] } },
            { currentState: { in: expandStoredCurrentStateValues('FUNDED') } },
            { currentQueue: { in: ['Funded'] } },
            declinedMatchWhere(),
        ],
    };
}

/** Approval email sent to ISO; awaiting ISO portal approval. */
export function approvalSentMatchWhere(): Prisma.ApplicationWhereInput {
    const approvalSentQueueWhere: Prisma.ApplicationWhereInput = {
        AND: [
            { currentQueue: { equals: 'Approval Sent', mode: 'insensitive' } },
            { currentState: { equals: 'Approval Sent', mode: 'insensitive' } },
        ],
    };

    const notUnderwriterApprovedQueue: Prisma.ApplicationWhereInput = {
        NOT: { currentQueue: { equals: 'Underwriter Approved', mode: 'insensitive' } },
    };

    return andExcludeNeedsContractReinitiation({
        OR: [
            approvalSentQueueWhere,
            {
                AND: [
                    approvalEmailActivityLogWhere(),
                    { NOT: isoPortalApprovalActivityLogWhere() },
                    notUnderwriterApprovedQueue,
                    { NOT: progressedPastApprovalSentMatchWhere() },
                ],
            },
        ],
    });
}

/** ISO approved via portal — deal is ready for contract generation. */
export function approvedByIsoMatchWhere(): Prisma.ApplicationWhereInput {
    const isoApprovedQueueWhere: Prisma.ApplicationWhereInput = {
        OR: [
            {
                AND: [
                    { currentQueue: { equals: 'ISO Approved', mode: 'insensitive' } },
                    { currentState: { equals: 'ISO Approved', mode: 'insensitive' } },
                ],
            },
            // Tolerate rows where only one field was migrated to ISO Approved.
            { currentQueue: { equals: 'ISO Approved', mode: 'insensitive' } },
            { currentState: { equals: 'ISO Approved', mode: 'insensitive' } },
        ],
    };

    const legacyIsoApprovedQueueWhere: Prisma.ApplicationWhereInput = {
        AND: [
            { currentQueue: { equals: 'Approved', mode: 'insensitive' } },
            { currentState: { equals: 'Approved', mode: 'insensitive' } },
            isoPortalApprovalActivityLogWhere(),
        ],
    };

    return andExcludeNeedsContractReinitiation({
        OR: [
            isoApprovedQueueWhere,
            legacyIsoApprovedQueueWhere,
            {
                AND: [
                    isoPortalApprovalActivityLogWhere(),
                    { NOT: progressedPastIsoApprovedMatchWhere() },
                ],
            },
        ],
    });
}

/** Umbrella `operationsStatus=Approved`: all approval workflow substages. */
export function approvedCombinedMatchWhere(): Prisma.ApplicationWhereInput {
    return {
        OR: [
            approvedByUwMatchWhere(),
            approvalSentMatchWhere(),
            approvedByIsoMatchWhere(),
        ],
    };
}

/**
 * Umbrella `operationsStatus=Contracted`: every contract workflow stage from pending
 * through signed (includes legacy Contracted / Contract Out spellings).
 */
export function contractedCombinedMatchWhere(): Prisma.ApplicationWhereInput {
    return andExcludeNeedsContractReinitiation({
        OR: [
            { currentState: { in: expandStoredCurrentStateValues('CONTRACT_PENDING') } },
            { currentQueue: { in: CONTRACT_PENDING_QUEUE_STRICT } },
            { currentQueue: 'Underwriter Approved', currentState: 'Underwriter Approved' },
            { currentQueue: 'Approved', currentState: 'Approved' },
            { currentState: { in: expandStoredCurrentStateValues('CONTRACT_GENERATED') } },
            { currentQueue: { in: CONTRACT_GENERATED_QUEUE_STRICT } },
            { currentState: { in: expandStoredCurrentStateValues('CONTRACT_SENT') } },
            { currentState: { in: expandStoredCurrentStateValues('CONTRACTS_OUT') } },
            { currentQueue: { in: CONTRACT_SENT_QUEUE_STRICT } },
            { currentState: { in: expandStoredCurrentStateValues('CONTRACT_CANCELLED') } },
            { currentQueue: { in: CONTRACT_CANCELLED_QUEUE_STRICT } },
            { currentState: { in: expandStoredCurrentStateValues('SIGNED_CONTRACTS') } },
            { currentQueue: { in: CONTRACT_SIGNED_QUEUE_STRICT } },
            { currentQueue: 'Contracted' },
        ],
    });
}

/** DB `currentState` may store Prisma enum strings, API labels, or legacy spellings. */
function expandStoredCurrentStateValues(mappedState: ApplicationState): string[] {
    const out = new Set<string>([mappedState]);
    const api = applicationStatePrismaToApi[mappedState];
    if (api) {
        out.add(api);
        out.add(api.replace(/ /g, '_'));
        out.add(api.replace(/ /g, ''));
    }
    if (mappedState === 'FUNDING_CALL') {
        out.add('FUNDING CALL');
        out.add('Funding Call');
    }
    if (mappedState === 'DISBURSMENT') {
        out.add('DISBURSEMENT');
        out.add('Disbursement');
    }
    return Array.from(out);
}

export type OperationsStatusFilterMode = 'legacy' | 'state' | 'queue';

/**
 * Filters applications for operations pipeline URLs.
 * - `legacy`: match either `currentState` (enum) or `currentQueue` (human labels) — default for non–ops-dashboard roles.
 * - `state`: OPERATIONS — match by `currentState` when the label maps to an enum; pipeline queue-only labels
 *   (e.g. Agent, Scrubbing) fall back to `currentQueue` so `/applications` matches operations dashboard stage counts.
 * - `queue`: SUPER_ADMIN — counts and lists by `currentQueue` only.
 */
/** Deals paused from the funding-call workflow. */
export function onHoldMatchWhere(): Prisma.ApplicationWhereInput {
    const holdValues = ['On Hold', 'On_Hold'];
    return {
        OR: [
            { currentQueue: { in: holdValues } },
            { currentState: { in: holdValues } },
        ],
    };
}

/** Deals a scrubber flagged as missing documents — waiting on Super Admin. */
export function missingDocumentsMatchWhere(): Prisma.ApplicationWhereInput {
    const missingValues = ['Missing Documents', 'Missing_Documents'];
    return {
        OR: [
            { currentQueue: { in: missingValues } },
            { currentState: { in: missingValues } },
        ],
    };
}

export function buildOperationsStatusFilterWhere(
    rawValue: string,
    mode: OperationsStatusFilterMode,
): Prisma.ApplicationWhereInput {
    const canonical = normalizeOperationsStatusKey(rawValue);
    if (canonical === 'Finals_And_Funding_Call') {
        return finalsAndFundingCallCombinedMatchWhere();
    }
    if (canonical === 'Not_A_Application' || canonical === 'Fake_Application') {
        return notAApplicationMatchWhere();
    }
    if (canonical === 'Old_Not_Scrubbed') {
        return oldNotScrubbedMatchWhere();
    }
    if (canonical === 'Decline_Request') {
        return declineRequestMatchWhere();
    }
    if (canonical === 'Declined_By_Scrubber') {
        return declinedByScrubberMatchWhere();
    }
    if (canonical === 'Declined_By_Admin') {
        return declinedByAdminMatchWhere();
    }
    if (canonical === 'Declined_By_Underwriter') {
        return declinedByUnderwriterMatchWhere();
    }
    if (canonical === 'Declined' || canonical === 'Rejected') {
        return mode === 'queue' ? declineAllMatchWhere() : declinedMatchWhere();
    }
    if (canonical === 'Recently_Deleted') {
        return recentlyDeletedMatchWhere();
    }
    if (canonical === 'On_Hold') {
        return onHoldMatchWhere();
    }
    if (canonical === 'Missing_Documents') {
        return missingDocumentsMatchWhere();
    }
    if (canonical === 'Contract_Pending') {
        return contractPendingStrictMatchWhere();
    }
    if (canonical === 'Contract_Generated') {
        return contractGeneratedStrictMatchWhere();
    }
    if (canonical === 'Contract_Sent' || canonical === 'Contract_Out') {
        return contractSentStrictMatchWhere();
    }
    if (canonical === 'Contract_Cancelled') {
        return contractCancelledStrictMatchWhere();
    }
    if (canonical === 'Contract_Signed') {
        return signedContractsStrictMatchWhere();
    }
    if (canonical === 'Reinitiate_Contract') {
        return reinitiateContractMatchWhere();
    }
    if (canonical === 'Agent') {
        return agentPipelineMatchWhere();
    }
    if (canonical === 'Scrubbing') {
        return scrubbingPipelineMatchWhere();
    }
    if (canonical === 'Underwriter') {
        return underwriterPipelineMatchWhere();
    }
    if (canonical === 'Final_Approval') {
        return finalApprovalPipelineMatchWhere();
    }
    if (canonical === 'Final') {
        return finalPipelineMatchWhere();
    }
    if (canonical === 'Approved_By_Uw') {
        return approvedByUwMatchWhere();
    }
    if (canonical === 'Approval_Sent') {
        return approvalSentMatchWhere();
    }
    if (canonical === 'Approved_By_Iso') {
        return approvedByIsoMatchWhere();
    }
    if (canonical === 'Approved') {
        return approvedCombinedMatchWhere();
    }
    const mappedState =
        isContractedPipelineKey(canonical) || canonical === 'Contracts_Out'
            ? undefined
            : toPrismaApplicationState(canonical);
    const aliases =
        dashboardStateQueueAliases[canonical] ||
        dashboardStateQueueAliases[canonical.replace(/_/g, ' ')] ||
        [];

    const queueValues = Array.from(
        new Set([canonical, canonical.replace(/_/g, ' '), ...aliases]),
    );

    if (mode === 'queue') {
        if (isContractedPipelineKey(canonical)) {
            return contractedCombinedMatchWhere();
        }
        if (canonical === 'Contracts_Out') {
            return contractsOutBroadMatchWhere();
        }
        return { currentQueue: { in: queueValues } };
    }

    if (mode === 'state') {
        if (isContractedPipelineKey(canonical)) {
            return contractedCombinedMatchWhere();
        }
        if (canonical === 'Contracts_Out') {
            return contractsOutBroadMatchWhere();
        }
        if (canonical === 'Signed_Contracts') {
            return signedContractsBroadMatchWhere();
        }
        const stateKey: ApplicationState | undefined = mappedState;
        if (!stateKey) {
            // Same as legacy when the param is a workflow queue name, not an ApplicationState — avoids empty lists
            // while dashboard `caseStageCounts` still includes those rows (chart uses legacy matching).
            return { currentQueue: { in: queueValues } };
        }
        return { currentState: { in: expandStoredCurrentStateValues(stateKey) } };
    }

    // legacy
    if (isContractedPipelineKey(canonical)) {
        return contractedCombinedMatchWhere();
    }
    if (canonical === 'Contracts_Out') {
        return contractsOutBroadMatchWhere();
    }
    if (canonical === 'Signed_Contracts') {
        return signedContractsBroadMatchWhere();
    }
    if (!mappedState) {
        return { currentQueue: { in: queueValues } };
    }
    return {
        OR: [{ currentState: mappedState }, { currentQueue: { in: queueValues } }],
    };
}

export function resolveOperationsListFilterMode(
    role: string | null | undefined,
): OperationsStatusFilterMode {
    const r = String(role ?? '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
    if (r === 'OPERATIONS') return 'state';
    if (r === 'SUPER_ADMIN' || r === 'SUPERADMIN') return 'queue';
    return 'legacy';
}
