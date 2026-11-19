import prisma from '../config/prismaClient';
import { ContractStatus, type Prisma } from '@prisma/client';
import {
    archiveMainContractEnvelopeToHistory,
    buildContractSendHistoryTermsSnapshot,
    isCompletedEnvelopeStatus,
    resolveArchivedMainContractEnvelopeStatus,
} from './docusign/utils/contract-send-history';
import {
    recordContractWorkflowActivityLog,
    type ContractWorkflowLogContext,
} from './contractWorkflowActivityLog';

const REINITIATION_ELIGIBLE_QUEUE_TOKENS = new Set([
    'finalapproval',
    'approvalsent',
    'isoapproved',
    'contractpending',
    'contractgenerated',
    'contractsent',
    'contractout',
    'contractsout',
    'underwriterapproved',
    'approved',
]);

export function normalizeApplicationQueueToken(value: string | null | undefined): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
}

export function isQueueEligibleForContractReinitiation(
    queue: string | null | undefined,
): boolean {
    return REINITIATION_ELIGIBLE_QUEUE_TOKENS.has(normalizeApplicationQueueToken(queue));
}

export async function flagNeedsContractReinitiation(applicationId: string): Promise<void> {
    const appId = String(applicationId || '').trim();
    if (!appId) return;
    await prisma.application.update({
        where: { id: appId },
        data: {
            needsContractReinitiation: true,
            isoUpdatedOfferApproved: false,
        },
    });
}

export async function clearNeedsContractReinitiation(applicationId: string): Promise<void> {
    const appId = String(applicationId || '').trim();
    if (!appId) return;
    await prisma.application.update({
        where: { id: appId },
        data: {
            needsContractReinitiation: false,
            isoUpdatedOfferApproved: false,
        },
    });
}

/** Queue labels indicating contract workflow moved past the reinitiation bucket. */
const POST_REINITIATION_CONTRACT_QUEUES = [
    'Contract Generated',
    'Contract_Generated',
    'ContractGenerated',
    'Contract Sent',
    'Contract_Sent',
    'Contract Out',
    'Contract_Out',
    'Contracts Out',
    'Contracts_Out',
    'ContractOut',
    'Contract Signed',
    'Contract_Signed',
    'Signed Contracts',
    'Signed_Contracts',
    'SignedContracts',
] as const;

/** State tokens indicating contract workflow moved past the reinitiation bucket. */
const POST_REINITIATION_CONTRACT_STATES = [
    'CONTRACT_GENERATED',
    'Contract Generated',
    'Contract_Generated',
    'CONTRACT_SENT',
    'Contract Sent',
    'Contract_Sent',
    'CONTRACTS_OUT',
    'Contract Out',
    'Contract_Out',
    'Contracts Out',
    'Contracts_Out',
    'SIGNED_CONTRACTS',
    'Contract Signed',
    'Contract_Signed',
    'Signed Contracts',
    'Signed_Contracts',
] as const;

const POST_REINITIATION_CONTRACT_STATUSES: ContractStatus[] = [
    ContractStatus.SENT,
    ContractStatus.VIEWED,
    ContractStatus.SIGNED,
    ContractStatus.COMPLETED,
    ContractStatus.DECLINED,
    ContractStatus.REVOKED,
    ContractStatus.EXPIRED,
];

/**
 * Rows that still carry `needsContractReinitiation` but already progressed in the contract
 * workflow (stale flag from before regeneration / send completed).
 */
export function staleContractReinitiationProgressWhere(): Prisma.ApplicationWhereInput {
    return {
        OR: [
            { document: { isNot: null } },
            {
                contract: {
                    status: { in: POST_REINITIATION_CONTRACT_STATUSES },
                },
            },
            { currentQueue: { in: [...POST_REINITIATION_CONTRACT_QUEUES] } },
            { currentState: { in: [...POST_REINITIATION_CONTRACT_STATES] } },
        ],
    };
}

/**
 * Deals flagged for contract reinitiation that still need a fresh contract generated/sent.
 * Excludes stale rows whose queue/state or contract status already advanced.
 */
export function awaitingNewContractReinitiationWhere(): Prisma.ApplicationWhereInput {
    return {
        AND: [
            { needsContractReinitiation: true },
            { document: { is: null } },
            { NOT: staleContractReinitiationProgressWhere() },
        ],
    };
}

/** Clear stale `needsContractReinitiation` flags for deals that already left the bucket. */
export async function reconcileStaleContractReinitiationFlags(): Promise<number> {
    const result = await prisma.application.updateMany({
        where: {
            AND: [{ needsContractReinitiation: true }, staleContractReinitiationProgressWhere()],
        },
        data: {
            needsContractReinitiation: false,
            isoUpdatedOfferApproved: false,
        },
    });
    return result.count;
}

/**
 * Archive the current main-contract envelope, reset CRM contract/document rows,
 * and mark the deal as needing a fresh contract after ISO re-approves updated terms.
 */
export async function reinitiateContractForApplication(
    applicationId: string,
    logContext?: ContractWorkflowLogContext,
): Promise<boolean> {
    const appId = String(applicationId || '').trim();
    if (!appId) return false;

    const applicationBefore = await prisma.application.findUnique({
        where: { id: appId },
        select: { currentQueue: true, currentState: true },
    });
    const previousStatus = applicationBefore
        ? `${applicationBefore.currentQueue ?? ''} / ${applicationBefore.currentState ?? ''}`.trim()
        : null;

    const contract = await prisma.contract.findUnique({
        where: { applicationId: appId },
        select: {
            id: true,
            status: true,
            approvedAmount: true,
            totalAmount: true,
            contractLenght: true,
            offer: {
                select: {
                    offer: true,
                    term: true,
                    rate: true,
                    repayPerPeriod: true,
                    totalRemit: true,
                },
            },
            termsOffers: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                    approvedAmount: true,
                    position: true,
                    buyRate: true,
                    factorRate: true,
                    paymentAmount: true,
                    paybackAmount: true,
                    percentOfGross: true,
                    termLength: true,
                },
            },
            application: {
                select: {
                    document: {
                        select: {
                            envelopeId: true,
                            status: true,
                            sentAt: true,
                            completedAt: true,
                        },
                    },
                },
            },
        },
    });

    if (!contract) {
        await flagNeedsContractReinitiation(appId);
        await prisma.application.update({
            where: { id: appId },
            data: {
                currentQueue: 'Contract Pending',
                currentState: 'Contract_Pending',
            },
        });
        await recordContractWorkflowActivityLog(
            appId,
            'REINITIATED',
            logContext ?? {},
            {
                previousStatus,
                currentStatus: previousStatus,
                metadata: {
                    hadContractRow: false,
                    priorEnvelopeId: null,
                },
            },
        );
        return true;
    }

    const doc = contract.application?.document;
    const priorEnvelopeId = String(doc?.envelopeId ?? '').trim();
    let archivedEnvelopeStatus: string | null = null;

    if (priorEnvelopeId) {
        const archiveStatus = resolveArchivedMainContractEnvelopeStatus(
            doc?.status,
            contract.status,
        );
        archivedEnvelopeStatus = archiveStatus;
        const priorWasCompleted = isCompletedEnvelopeStatus(doc?.status, contract.status);

        await archiveMainContractEnvelopeToHistory(appId, {
            envelopeId: priorEnvelopeId,
            status: archiveStatus,
            sentAt: doc?.sentAt,
            completedAt:
                doc?.completedAt ?? (priorWasCompleted ? new Date() : null),
            termsSnapshot: buildContractSendHistoryTermsSnapshot(contract),
        });

        await prisma.document.deleteMany({ where: { applicationId: appId } });
    }

    await prisma.contract.update({
        where: { id: contract.id },
        data: { status: 'DRAFT' },
    });

    await flagNeedsContractReinitiation(appId);

    await prisma.application.update({
        where: { id: appId },
        data: {
            currentQueue: 'Contract Pending',
            currentState: 'Contract_Pending',
        },
    });

    const applicationAfter = await prisma.application.findUnique({
        where: { id: appId },
        select: { currentQueue: true, currentState: true },
    });
    const currentStatus = applicationAfter
        ? `${applicationAfter.currentQueue ?? ''} / ${applicationAfter.currentState ?? ''}`.trim()
        : previousStatus;

    await recordContractWorkflowActivityLog(
        appId,
        'REINITIATED',
        logContext ?? {},
        {
            previousStatus,
            currentStatus,
            metadata: {
                contractId: contract.id,
                hadContractRow: true,
                priorEnvelopeId: priorEnvelopeId || null,
                archivedEnvelopeStatus,
                priorContractStatus: String(contract.status ?? ''),
            },
        },
    );

    return true;
}

export function offerDecisionValuesChanged(
    prior: {
        offer?: number | null;
        rate?: number | null;
        totalRemit?: number | null;
        term?: string | null;
        frequency?: string | null;
    } | null,
    next: {
        offer?: number | null;
        rate?: number | null;
        totalRemit?: number | null;
        term?: string | null;
        frequency?: string | null;
    },
): boolean {
    const normNum = (v: unknown) => {
        if (v == null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    const normStr = (v: unknown) => {
        const s = String(v ?? '').trim();
        return s || null;
    };

    if (!prior) return true;

    return (
        normNum(prior.offer) !== normNum(next.offer) ||
        normNum(prior.rate) !== normNum(next.rate) ||
        normNum(prior.totalRemit) !== normNum(next.totalRemit) ||
        normStr(prior.term) !== normStr(next.term) ||
        normStr(prior.frequency) !== normStr(next.frequency)
    );
}
