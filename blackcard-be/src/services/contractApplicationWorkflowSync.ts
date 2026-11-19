import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';

/** Approved deal awaiting contract generation. */
export const APPLICATION_QUEUE_CONTRACT_PENDING = 'Contract Pending';
export const APPLICATION_STATE_CONTRACT_PENDING = 'CONTRACT_PENDING';

/** Contract draft created in CRM (not yet sent for signature). */
export const APPLICATION_QUEUE_CONTRACT_GENERATED = 'Contract Generated';
export const APPLICATION_STATE_CONTRACT_GENERATED = 'CONTRACT_GENERATED';

/** Envelope sent to signer(s); awaiting signature. */
export const APPLICATION_QUEUE_CONTRACT_SENT = 'Contract Sent';
export const APPLICATION_STATE_CONTRACT_SENT = 'CONTRACT_SENT';

/** Envelope voided / revoked / declined / expired. */
export const APPLICATION_QUEUE_CONTRACT_CANCELLED = 'Contract Cancelled';
export const APPLICATION_STATE_CONTRACT_CANCELLED = 'CONTRACT_CANCELLED';

/** Stored in `Application.currentQueue` when the linked contract is fully signed (BoldSign COMPLETED). */
export const APPLICATION_QUEUE_CONTRACT_SIGNED = 'Contract Signed';

/**
 * Stored in `Application.currentState` — matches operations filters (`Signed_Contracts` /
 * `operationsStatus=Contract_Signed`) and legacy signed-contract spellings.
 */
export const APPLICATION_STATE_CONTRACT_SIGNED = 'Signed_Contracts';

type PrismaLike = typeof prisma | Prisma.TransactionClient;

export type ContractWorkflowSyncMeta = {
  source: string;
  contractId?: number;
  contractStatusPrevious?: string | null;
  contractStatusNew?: string | null;
};

const CONTRACT_SIGNED_QUEUE_VARIANTS = new Set(
  [
    APPLICATION_QUEUE_CONTRACT_SIGNED,
    'Contract_Signed',
    'Signed Contracts',
    'Signed_Contracts',
    'SignedContracts',
  ].map((v) => v.toLowerCase().replace(/[\s_-]+/g, '')),
);

const CONTRACT_SIGNED_STATE_VARIANTS = new Set(
  [
    APPLICATION_STATE_CONTRACT_SIGNED,
    APPLICATION_QUEUE_CONTRACT_SIGNED,
    'SIGNED_CONTRACTS',
    'Signed Contracts',
    'Signed_Contracts',
  ].map((v) => v.toLowerCase().replace(/[\s_-]+/g, '')),
);

/** Normalize API / DB contract status strings to uppercase Prisma enum values. */
export function normalizeContractStatus(status: unknown): string | null {
  if (status === null || status === undefined) return null;
  const raw = String(status).trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    COMPLETE: 'COMPLETED',
    DONE: 'COMPLETED',
    COMPLETED: 'COMPLETED',
    DRAFT: 'DRAFT',
    SENT: 'SENT',
    VIEWED: 'VIEWED',
    SIGNED: 'SIGNED',
    DECLINED: 'DECLINED',
    REVOKED: 'REVOKED',
    EXPIRED: 'EXPIRED',
  };
  return aliases[upper] ?? upper;
}

function normalizeWorkflowToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function isApplicationAtContractSignedStage(app: {
  currentQueue?: string | null;
  currentState?: string | null;
}): boolean {
  const queueNorm = normalizeWorkflowToken(app.currentQueue);
  const stateNorm = normalizeWorkflowToken(app.currentState);
  return (
    CONTRACT_SIGNED_QUEUE_VARIANTS.has(queueNorm) ||
    CONTRACT_SIGNED_STATE_VARIANTS.has(stateNorm)
  );
}

export function contractSignedApplicationUpdateData(): {
  currentQueue: string;
  currentState: string;
} {
  return {
    currentQueue: APPLICATION_QUEUE_CONTRACT_SIGNED,
    currentState: APPLICATION_STATE_CONTRACT_SIGNED,
  };
}

export function contractGeneratedApplicationUpdateData(): {
  currentQueue: string;
  currentState: string;
} {
  return {
    currentQueue: APPLICATION_QUEUE_CONTRACT_GENERATED,
    currentState: APPLICATION_STATE_CONTRACT_GENERATED,
  };
}

export function contractSentApplicationUpdateData(): {
  currentQueue: string;
  currentState: string;
} {
  return {
    currentQueue: APPLICATION_QUEUE_CONTRACT_SENT,
    currentState: APPLICATION_STATE_CONTRACT_SENT,
  };
}

export function contractCancelledApplicationUpdateData(): {
  currentQueue: string;
  currentState: string;
} {
  return {
    currentQueue: APPLICATION_QUEUE_CONTRACT_CANCELLED,
    currentState: APPLICATION_STATE_CONTRACT_CANCELLED,
  };
}

const POST_CONTRACT_SENT_QUEUE_KEYS = new Set([
  'contractsigned',
  'signedcontracts',
  'final',
  'fundingcall',
  'disbursment',
  'disbursement',
  'funded',
]);

function isPostContractSentQueue(queue: string | null | undefined): boolean {
  return POST_CONTRACT_SENT_QUEUE_KEYS.has(normalizeWorkflowToken(queue));
}

/** Deal has already moved past Contract Signed (Final, Funding Call, Disbursement, etc.). */
function isApplicationPastContractSignedStage(app: {
  currentQueue?: string | null;
  currentState?: string | null;
}): boolean {
  return (
    isApplicationAtContractSignedStage(app) || isPostContractSentQueue(app.currentQueue)
  );
}

async function syncApplicationWorkflowStage(
  prismaClient: PrismaLike,
  applicationId: string,
  updateData: { currentQueue: string; currentState: string },
  meta: ContractWorkflowSyncMeta,
  skipIfAlready?: (app: { currentQueue?: string | null; currentState?: string | null }) => boolean,
): Promise<boolean> {
  const application = await prismaClient.application.findUnique({
    where: { id: applicationId },
    select: { id: true, applicationId: true, currentQueue: true, currentState: true },
  });

  if (!application) {
    console.log('[Contract→Application Sync]', {
      event: 'sync_skip',
      reason: 'application_not_found',
      applicationId,
      ...meta,
    });
    return false;
  }

  if (skipIfAlready?.(application)) {
    console.log('[Contract→Application Sync]', {
      event: 'sync_skip',
      reason: 'already_at_target_stage',
      applicationId,
      currentQueue: application.currentQueue,
      currentState: application.currentState,
      ...meta,
    });
    return false;
  }

  const updated = await prismaClient.application.update({
    where: { id: applicationId },
    data: updateData,
    select: {
      id: true,
      applicationId: true,
      currentQueue: true,
      currentState: true,
    },
  });

  console.log('[Contract→Application Sync]', {
    event: 'sync_applied',
    applicationId,
    applicationNumericId: updated.applicationId,
    previousQueue: application.currentQueue,
    previousState: application.currentState,
    newQueue: updated.currentQueue,
    newState: updated.currentState,
    ...meta,
  });

  return true;
}

/** After contract record is created (DRAFT) — not when the envelope is sent. */
export async function syncApplicationToContractGenerated(
  prismaClient: PrismaLike,
  applicationId: string,
  meta: ContractWorkflowSyncMeta,
): Promise<boolean> {
  return syncApplicationWorkflowStage(
    prismaClient,
    applicationId,
    contractGeneratedApplicationUpdateData(),
    meta,
    (app) =>
      isApplicationAtContractSignedStage(app) ||
      normalizeWorkflowToken(app.currentQueue) === 'contractsent' ||
      normalizeWorkflowToken(app.currentQueue) === 'contractout' ||
      normalizeWorkflowToken(app.currentQueue) === 'contractsout',
  );
}

/**
 * When a new main-contract DocuSign envelope replaces a prior send (resend after signed, etc.),
 * move the deal back to Contract Generated so downstream sent/completed webhooks can advance it again.
 */
export async function syncApplicationOnMainContractResend(
  prismaClient: PrismaLike,
  applicationId: string,
  meta: ContractWorkflowSyncMeta,
): Promise<boolean> {
  return syncApplicationWorkflowStage(
    prismaClient,
    applicationId,
    contractGeneratedApplicationUpdateData(),
    meta,
  );
}

/** After envelope is sent / viewed / partially signed — awaiting completion. */
export async function syncApplicationToContractSent(
  prismaClient: PrismaLike,
  applicationId: string,
  meta: ContractWorkflowSyncMeta,
): Promise<boolean> {
  return syncApplicationWorkflowStage(
    prismaClient,
    applicationId,
    contractSentApplicationUpdateData(),
    meta,
    (app) =>
      isApplicationAtContractSignedStage(app) || isPostContractSentQueue(app.currentQueue),
  );
}

/** After envelope is voided / revoked / declined / expired. */
export async function syncApplicationToContractCancelled(
  prismaClient: PrismaLike,
  applicationId: string,
  meta: ContractWorkflowSyncMeta,
): Promise<boolean> {
  return syncApplicationWorkflowStage(
    prismaClient,
    applicationId,
    contractCancelledApplicationUpdateData(),
    meta,
    (app) => isApplicationAtContractSignedStage(app) || isPostContractSentQueue(app.currentQueue),
  );
}

/**
 * Maps DocuSign / BoldSign envelope status to the application workflow stage.
 * - DRAFT → Contract Generated (if a contract row exists)
 * - SENT / VIEWED / SIGNED → Contract Sent
 * - COMPLETED → Contract Signed
 * - DECLINED / REVOKED / EXPIRED → Contract Cancelled
 */
export async function syncApplicationWorkflowFromContractEnvelopeStatus(
  prismaClient: PrismaLike,
  applicationId: string,
  envelopeStatus: unknown,
  meta: ContractWorkflowSyncMeta,
): Promise<boolean> {
  const statusNorm = normalizeContractStatus(envelopeStatus);
  if (!statusNorm) return false;

  if (statusNorm === 'COMPLETED') {
    return syncApplicationToContractSignedWhenContractCompleted(
      prismaClient,
      applicationId,
      meta,
    );
  }

  if (['DECLINED', 'REVOKED', 'EXPIRED'].includes(statusNorm)) {
    return syncApplicationToContractCancelled(prismaClient, applicationId, meta);
  }

  if (['SENT', 'VIEWED', 'SIGNED'].includes(statusNorm)) {
    return syncApplicationToContractSent(prismaClient, applicationId, meta);
  }

  if (statusNorm === 'DRAFT') {
    return syncApplicationToContractGenerated(prismaClient, applicationId, meta);
  }

  return false;
}

/**
 * When `Contract.status` is COMPLETED, move the linked application to the Contract Signed stage.
 * Idempotent: skips if the application is already in a signed-contract queue/state.
 */
export async function syncApplicationToContractSignedWhenContractCompleted(
  prismaClient: PrismaLike,
  applicationId: string,
  meta: ContractWorkflowSyncMeta,
): Promise<boolean> {
  const application = await prismaClient.application.findUnique({
    where: { id: applicationId },
    select: { id: true, applicationId: true, currentQueue: true, currentState: true },
  });

  if (!application) {
    console.log('[Contract→Application Sync]', {
      event: 'sync_skip',
      reason: 'application_not_found',
      applicationId,
      ...meta,
    });
    return false;
  }

  if (isApplicationPastContractSignedStage(application)) {
    console.log('[Contract→Application Sync]', {
      event: 'sync_skip',
      reason: 'already_at_or_past_contract_signed',
      applicationId,
      currentQueue: application.currentQueue,
      currentState: application.currentState,
      ...meta,
    });
    return false;
  }

  const updateData = contractSignedApplicationUpdateData();
  const updated = await prismaClient.application.update({
    where: { id: applicationId },
    data: updateData,
    select: {
      id: true,
      applicationId: true,
      currentQueue: true,
      currentState: true,
    },
  });

  console.log('[Contract→Application Sync]', {
    event: 'sync_applied',
    applicationId,
    applicationNumericId: updated.applicationId,
    previousQueue: application.currentQueue,
    previousState: application.currentState,
    newQueue: updated.currentQueue,
    newState: updated.currentState,
    ...meta,
  });

  return true;
}

/** Backfill sync when reading a contract that is already COMPLETED. */
export async function maybeSyncApplicationFromCompletedContract(
  prismaClient: PrismaLike,
  contract: { id?: number; applicationId?: string | null; status?: unknown },
  source: string,
): Promise<boolean> {
  const statusNorm = normalizeContractStatus(contract.status);
  if (statusNorm !== 'COMPLETED') return false;

  const applicationId = contract.applicationId ? String(contract.applicationId).trim() : '';
  if (!applicationId) {
    console.log('[Contract→Application Sync]', {
      event: 'maybeSync_skip',
      reason: 'contract_has_no_applicationId',
      contractId: contract.id ?? null,
      source,
      contractStatus: statusNorm,
    });
    return false;
  }

  return syncApplicationToContractSignedWhenContractCompleted(prismaClient, applicationId, {
    source,
    contractId: contract.id,
    contractStatusNew: statusNorm,
  });
}

/**
 * Ensures GET application responses reflect a completed contract even if the webhook
 * missed the application update. Mutates `applicationRecord` in place when a sync runs.
 */
export async function applyContractCompletedSyncToApplicationRecord(
  prismaClient: PrismaLike,
  applicationRecord: {
    id: string;
    currentQueue?: string | null;
    currentState?: string | null;
  },
  source: string,
): Promise<boolean> {
  if (isApplicationPastContractSignedStage(applicationRecord)) {
    return false;
  }

  const contract = await prismaClient.contract.findFirst({
    where: { applicationId: applicationRecord.id },
    select: { id: true, applicationId: true, status: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (!contract) return false;

  const synced = await maybeSyncApplicationFromCompletedContract(
    prismaClient,
    contract,
    source,
  );

  if (synced) {
    const fresh = await prismaClient.application.findUnique({
      where: { id: applicationRecord.id },
      select: { currentQueue: true, currentState: true },
    });
    if (fresh) {
      applicationRecord.currentQueue = fresh.currentQueue;
      applicationRecord.currentState = fresh.currentState;
    }
  }

  return synced;
}
