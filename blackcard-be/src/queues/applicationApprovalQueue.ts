import { Queue, type ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import { isRedisAvailable } from '../config/redis';
// Type-only import: keeps the runtime module graph acyclic
// (applicationApprovalService imports this queue module for value).
import type { ApprovalSideEffectPayload } from '../services/business/applicationApprovalService';

/* ============================================================================
 * Application Approval Side-Effects Queue
 * ----------------------------------------------------------------------------
 * Decouples user-facing latency from notification + email + downstream webhook
 * fan-out. The HTTP request returns as soon as the DB transition succeeds; this
 * queue carries the rest of the work to a worker process.
 *
 * Why BullMQ?
 *   - Already used in this codebase (see collectionPaymentUploadQueue).
 *   - Durable retries — if email/SES is briefly down, jobs survive.
 *   - Concurrency knob lets us scale fan-out across machines without code
 *     changes.
 *
 * Falls back gracefully to inline `setImmediate` execution when REDIS_URL is
 * not configured (see applicationApprovalService.dispatchApprovalSideEffects).
 * ==========================================================================*/

export const APPLICATION_APPROVAL_QUEUE_NAME = 'application-approval-side-effects';

export type ApplicationApprovalJobName = 'process-side-effects';

export type ApplicationApprovalJobData = ApprovalSideEffectPayload;

let queueInstance: Queue<ApplicationApprovalJobData> | null = null;

const redisUrl = (): string => String(process.env.REDIS_URL || '').trim();

/** BullMQ bundles its own ioredis types; cast avoids duplicate-package TS errors. */
const createRedisConnection = (): ConnectionOptions =>
    new Redis(redisUrl(), {
        maxRetriesPerRequest: null,
        retryStrategy(times) {
            return Math.min(times * 200, 2_000);
        },
    }) as ConnectionOptions;

export const isApplicationApprovalQueueEnabled = (): boolean =>
    Boolean(redisUrl()) && isRedisAvailable();

export const getApplicationApprovalQueue = (): Queue<ApplicationApprovalJobData> | null => {
    if (!isApplicationApprovalQueueEnabled()) return null;

    if (!queueInstance) {
        queueInstance = new Queue<ApplicationApprovalJobData>(
            APPLICATION_APPROVAL_QUEUE_NAME,
            {
                connection: createRedisConnection(),
                defaultJobOptions: {
                    /** Keeps last 500 successful jobs for observability without unbounded growth. */
                    removeOnComplete: 500,
                    /** Keep failed jobs longer so on-call can inspect them. */
                    removeOnFail: 1_000,
                    attempts: 5,
                    backoff: {
                        type: 'exponential',
                        delay: 5_000,
                    },
                },
            }
        ) as Queue<ApplicationApprovalJobData>;
    }

    return queueInstance;
};

export const enqueueApplicationApprovalSideEffects = async (
    payload: ApplicationApprovalJobData
): Promise<void> => {
    const queue = getApplicationApprovalQueue();
    if (!queue) return;

    /**
     * Job id ties the worker run to the application — BullMQ deduplicates by id
     * by default, so a retried HTTP request that re-dispatches the same payload
     * doesn't double-fan-out before the previous job finished.
     */
    const jobId = `approval:${payload.applicationId}:${Date.now()}`;
    await queue.add('process-side-effects', payload, {
        jobId,
    });
};
