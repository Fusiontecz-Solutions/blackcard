import { Worker, type ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import prisma from '../config/prismaClient';
import {
  COLLECTION_PAYMENT_UPLOAD_QUEUE,
  CollectionPaymentUploadJobData,
  isCollectionPaymentUploadQueueEnabled,
} from '../queues/collectionPaymentUploadQueue';
import { processCollectionPaymentUploadJob } from '../services/collectionPaymentUploadIngestService';

let workerInstance: Worker<CollectionPaymentUploadJobData> | null = null;

const createRedisConnection = (): ConnectionOptions =>
  new Redis(String(process.env.REDIS_URL || '').trim(), {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 200, 2000);
    },
  }) as ConnectionOptions;

export const startCollectionPaymentUploadWorker = (): void => {
  if (!isCollectionPaymentUploadQueueEnabled()) {
    console.warn('Collection payment upload worker disabled: REDIS_URL is not configured.');
    return;
  }

  if (workerInstance) return;

  try {
    workerInstance = new Worker<CollectionPaymentUploadJobData>(
      COLLECTION_PAYMENT_UPLOAD_QUEUE,
      async (job) => {
        await prisma.collectionPaymentUploadJob.update({
          where: { queueJobId: job.data.queueJobId },
          data: {
            status: 'PROCESSING',
            startedAt: new Date(),
            errorMessage: null,
          },
        });

        await processCollectionPaymentUploadJob(
          {
            queueJobId: job.data.queueJobId,
            filePath: job.data.filePath,
            fileBufferBase64: job.data.fileBufferBase64,
          },
          async (progress) => {
            await job.updateProgress({
              totalRows: progress.totalRows,
              processedRows: progress.processedRows,
              successCount: progress.successCount,
              failedCount: progress.failedCount,
            });
          },
        );

        const latest = await prisma.collectionPaymentUploadJob.findUnique({
          where: { queueJobId: job.data.queueJobId },
          select: { failedCount: true },
        });

        await prisma.collectionPaymentUploadJob.update({
          where: { queueJobId: job.data.queueJobId },
          data: {
            status: (latest?.failedCount ?? 0) > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
            completedAt: new Date(),
          },
        });
      },
      {
        connection: createRedisConnection(),
        concurrency: 4,
      },
    );
  } catch (err) {
    console.error('Failed to start collection payment upload worker:', err);
    workerInstance = null;
    return;
  }

  workerInstance.on('failed', async (job, err) => {
    if (!job) return;

    console.error('Collection payment upload job failed:', {
      queueJobId: job.data.queueJobId,
      filePath: job.data.filePath,
      hasFileBufferBase64: Boolean(job.data.fileBufferBase64),
      error: err.message,
    });

    await prisma.collectionPaymentUploadJob.update({
      where: { queueJobId: job.data.queueJobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: err.message,
      },
    });
  });

  workerInstance.on('error', (err) => {
    console.error('Collection payment upload worker error:', err);
  });
};
