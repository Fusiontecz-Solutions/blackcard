import prisma from '../config/prismaClient';
import {
    mergeApplicationVisibilityWhere,
    type AuthenticatedUser,
} from './applicationService';
import {
    AGENT_PIPELINE_QUEUE_STRICT,
    SCRUBBING_PIPELINE_QUEUE_STRICT,
    UNDERWRITER_PIPELINE_QUEUE_STRICT,
} from './operationsStatusFilter';

/** Canonical pipeline buckets keyed by `Application.currentQueue` (human-readable labels). */
export type QueueMetricsBucketKey =
    | 'Agent'
    | 'Scrubbing'
    | 'Underwriter'
    | 'Contract_Pending'
    | 'Contract_Sent'
    | 'Contract_Signed'
    | 'Final'
    | 'Funding Call'
    | 'Disbursment'
    | 'Funded'
    | 'Declined';

export const QUEUE_METRICS_BUCKET_KEYS: QueueMetricsBucketKey[] = [
    'Agent',
    'Scrubbing',
    'Underwriter',
    'Contract_Pending',
    'Contract_Sent',
    'Contract_Signed',
    'Final',
    'Funding Call',
    'Disbursment',
    'Funded',
    'Declined',
];

const CONTRACT_PENDING_QUEUES = new Set([
    'Contract Pending',
    'Contract_Pending',
    'ContractPending',
]);

const CONTRACT_SENT_QUEUES = new Set([
    'Contract Sent',
    'Contract_Sent',
    'Contract Out',
    'Contract_Out',
    'Contracts Out',
    'Contracts_Out',
    'ContractOut',
]);

const CONTRACT_SIGNED_QUEUES = new Set([
    'Contract Signed',
    'Contract_Signed',
    'Signed Contracts',
    'Signed_Contracts',
    'SignedContracts',
]);

function emptyBucketRecord(): Record<QueueMetricsBucketKey, number> {
    return {
        Agent: 0,
        Scrubbing: 0,
        'Underwriter': 0,
        Contract_Pending: 0,
        Contract_Sent: 0,
        Contract_Signed: 0,
        Final: 0,
        'Funding Call': 0,
        Disbursment: 0,
        Funded: 0,
        Declined: 0,
    };
}

function normalizePipelineToken(value: string | null | undefined): string {
    return String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');
}

function queueInSet(
    currentQueue: string | null | undefined,
    values: readonly string[],
): boolean {
    const q = String(currentQueue ?? '').trim();
    if (!q) return false;
    return values.some((candidate) => candidate === q);
}

function stateInUnderwriterSet(currentState: string | null | undefined): boolean {
    const token = normalizePipelineToken(currentState);
    return (
        token === 'UNDERWRITER' ||
        token === 'FINAL_REVIEW' ||
        token === 'FINAL_UNDERWRITER'
    );
}

function stateInScrubbingSet(currentState: string | null | undefined): boolean {
    const token = normalizePipelineToken(currentState);
    return (
        token === 'SCRUBBING' ||
        token === 'UNDERWRITING' ||
        token === 'IN_PROGRESS'
    );
}

/**
 * Map stored workflow fields to a dashboard bucket.
 * Queue wins over state; mirrors `buildOperationsStatusFilterWhere` pipeline matchers.
 */
export function classifyApplicationPipelineStage(
    currentQueue: string | null | undefined,
    currentState?: string | null | undefined,
): QueueMetricsBucketKey | null {
    const fromQueue = classifyApplicationCurrentQueue(currentQueue);
    if (fromQueue) return fromQueue;

    const queueToken = normalizePipelineToken(currentQueue);

    if (stateInUnderwriterSet(currentState)) {
        if (
            queueToken === 'SCRUBBING' ||
            queueToken === 'UNDERWRITING' ||
            queueToken === 'REVIEW'
        ) {
            return 'Scrubbing';
        }
        return 'Underwriter';
    }
    if (
        stateInScrubbingSet(currentState) &&
        !queueInSet(currentQueue, UNDERWRITER_PIPELINE_QUEUE_STRICT)
    ) {
        return 'Scrubbing';
    }

    return null;
}

/**
 * Map a stored `currentQueue` label to a dashboard bucket.
 * Uses `currentQueue` only (no `currentState` fallback).
 */
export function classifyApplicationCurrentQueue(
    currentQueue: string | null | undefined,
): QueueMetricsBucketKey | null {
    const q = String(currentQueue ?? '').trim();
    if (!q) return null;

    if (q === 'Declined') return 'Declined';
    if (q === 'Funded' || q === 'Completed') return 'Funded';
    if (q === 'Disbursment' || q === 'Disbursement') return 'Disbursment';
    if (q === 'Final' || q === 'FINAL') return 'Final';
    if (q === 'Funding Call' || q === 'Funding_Call') return 'Funding Call';
    if (CONTRACT_SIGNED_QUEUES.has(q)) return 'Contract_Signed';
    if (CONTRACT_SENT_QUEUES.has(q)) return 'Contract_Sent';
    if (CONTRACT_PENDING_QUEUES.has(q)) return 'Contract_Pending';
    if (queueInSet(q, UNDERWRITER_PIPELINE_QUEUE_STRICT)) return 'Underwriter';
    if (queueInSet(q, SCRUBBING_PIPELINE_QUEUE_STRICT)) return 'Scrubbing';
    if (queueInSet(q, AGENT_PIPELINE_QUEUE_STRICT)) return 'Agent';

    return null;
}

export type QueueMetricsAggregate = {
    counts: Record<QueueMetricsBucketKey, number>;
    amounts: Record<QueueMetricsBucketKey, number>;
    totalCases: number;
};

function toFiniteNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

/**
 * Count applications per `currentQueue` bucket and sum the underwritten **offer/approved amount**
 * (never the requested `loanAmount`). Mirrors the FE `resolveApplicationOfferAmount` precedence:
 * a non-declined `OfferDecision.offer`, then the latest `TermsOffer.approvedAmount`, then
 * `Contract.approvedAmount`. Applications without an offer contribute 0.
 */
export async function aggregateQueueMetricsByCurrentQueue(
    authUser: AuthenticatedUser | null,
): Promise<QueueMetricsAggregate> {
    const visibilityBase = mergeApplicationVisibilityWhere(
        authUser ? {} : { id: '00000000-0000-0000-0000-000000000000' },
        authUser,
    );

    const apps = await prisma.application.findMany({
        where: visibilityBase,
        select: { id: true, currentQueue: true, currentState: true },
    });

    const counts = emptyBucketRecord();
    const amounts = emptyBucketRecord();

    if (apps.length === 0) {
        return { counts, amounts, totalCases: 0 };
    }

    const appIds = apps.map((app) => app.id);

    const [offerDecisions, termsOffers, contracts] = await Promise.all([
        prisma.offerDecision.findMany({
            where: { applicationId: { in: appIds } },
            select: { applicationId: true, offer: true, decision: true },
        }),
        prisma.termsOffer.findMany({
            where: { applicationId: { in: appIds } },
            select: { applicationId: true, approvedAmount: true },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.contract.findMany({
            where: { applicationId: { in: appIds } },
            select: { applicationId: true, approvedAmount: true },
        }),
    ]);

    const offerDecisionByApp = new Map(
        offerDecisions.map((row) => [row.applicationId, row]),
    );
    const latestTermsByApp = new Map<string, number | null>();
    for (const row of termsOffers) {
        if (!latestTermsByApp.has(row.applicationId)) {
            latestTermsByApp.set(row.applicationId, toFiniteNumber(row.approvedAmount));
        }
    }
    const contractByApp = new Map<string, number | null>();
    for (const row of contracts) {
        if (row.applicationId && !contractByApp.has(row.applicationId)) {
            contractByApp.set(row.applicationId, toFiniteNumber(row.approvedAmount));
        }
    }

    for (const app of apps) {
        const bucket = classifyApplicationPipelineStage(
            app.currentQueue,
            app.currentState,
        );
        if (!bucket) continue;

        counts[bucket] += 1;

        const od = offerDecisionByApp.get(app.id);
        const odOffer =
            od && String(od.decision ?? '').toLowerCase() !== 'declined'
                ? toFiniteNumber(od.offer)
                : null;
        const offerAmount =
            odOffer ??
            latestTermsByApp.get(app.id) ??
            contractByApp.get(app.id) ??
            0;
        amounts[bucket] += offerAmount;
    }

    return { counts, amounts, totalCases: apps.length };
}
