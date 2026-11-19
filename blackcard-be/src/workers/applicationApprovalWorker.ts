import { Worker, type ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import {
    APPLICATION_APPROVAL_QUEUE_NAME,
    type ApplicationApprovalJobData,
    isApplicationApprovalQueueEnabled,
} from '../queues/applicationApprovalQueue';
import { processApplicationApprovalSideEffects } from '../services/applicationApprovalSideEffects';

/* ============================================================================
 * Application Approval Side-Effects Worker
 * ----------------------------------------------------------------------------
 * Runs the heavy fan-out (notifications + emails + token generation) outside
 * of the request lifecycle. Configurable concurrency means we can scale up by
 * starting more worker processes without touching the controller.
 *
 * Concurrency tuning is exposed via APPROVAL_WORKER_CONCURRENCY (default 5);
 * email-bound work is mostly I/O so concurrency much higher than CPU count is
 * fine.
 * ==========================================================================*/

let workerInstance: Worker<ApplicationApprovalJobData> | null = null;

const createRedisConnection = (): ConnectionOptions =>
    new Redis(String(process.env.REDIS_URL || '').trim(), {
        maxRetriesPerRequest: null,
        retryStrategy(times) {
            return Math.min(times * 200, 2_000);
        },
    }) as ConnectionOptions;

const resolveConcurrency = (): number => {
    const raw = Number(process.env.APPROVAL_WORKER_CONCURRENCY);
    if (!Number.isFinite(raw) || raw <= 0) return 5;
    return Math.min(50, Math.max(1, Math.floor(raw)));
};

export const startApplicationApprovalWorker = (): void => {
    if (!isApplicationApprovalQueueEnabled()) {
        console.warn(
            '[applicationApprovalWorker] disabled: REDIS_URL not configured. Falling back to inline setImmediate fan-out.'
        );
        return;
    }

    if (workerInstance) return;

    try {
        workerInstance = new Worker<ApplicationApprovalJobData>(
            APPLICATION_APPROVAL_QUEUE_NAME,
            async (job) => {
                await processApplicationApprovalSideEffects(job.data);
            },
            {
                connection: createRedisConnection(),
                concurrency: resolveConcurrency(),
            }
        ) as Worker<ApplicationApprovalJobData>;

        workerInstance.on('failed', (job, err) => {
            console.error('[applicationApprovalWorker] job failed:', {
                jobId: job?.id,
                applicationId: job?.data?.applicationId,
                attemptsMade: job?.attemptsMade,
                error: err?.message,
            });
        });

        workerInstance.on('error', (err) => {
            console.error('[applicationApprovalWorker] worker error:', err);
        });

        console.log(
            `[applicationApprovalWorker] started (concurrency=${resolveConcurrency()})`
        );
    } catch (err) {
        console.error('[applicationApprovalWorker] failed to start:', err);
        workerInstance = null;
    }
};
