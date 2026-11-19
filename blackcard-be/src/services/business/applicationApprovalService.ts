import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../config/prismaClient';
import { createApplicationActivityLog } from '../applicationActivityLogService';
import type { AuthenticatedUser } from '../applicationService';
import {
    enqueueApplicationApprovalSideEffects,
    isApplicationApprovalQueueEnabled,
} from '../../queues/applicationApprovalQueue';
import {
    APPLICATION_QUEUE_CONTRACT_PENDING,
    APPLICATION_STATE_CONTRACT_PENDING,
} from '../contractApplicationWorkflowSync';

/* ============================================================================
 * Application Approval domain service
 * ----------------------------------------------------------------------------
 * Single source of truth for moving an Application into the "Approved" state.
 *
 * Why a dedicated service?
 *   - Idempotent: parallel/repeat clicks (e.g. ISO double-tap, retried webhooks,
 *     email-link bots) cannot create duplicate state transitions or duplicate
 *     activity logs.
 *   - Concurrency-safe: the actual write is a single conditional `updateMany`
 *     guarded by the previous (queue,state). Only one transition wins; the
 *     others observe `alreadyApproved=true` and return without side-effects.
 *   - Scalable: side-effects (notifications, emails, analytics, downstream
 *     webhooks) are dispatched through a BullMQ queue when Redis is available
 *     and fall back to non-blocking `setImmediate` otherwise. The HTTP request
 *     never waits on fan-out work.
 *   - Reusable: the controller, future internal automations, scheduled jobs,
 *     or external webhooks can all call `approveApplication()` with the same
 *     guarantees.
 * ==========================================================================*/

/** Canonical labels persisted on `Application.currentQueue` / `currentState`. */
export const APPLICATION_APPROVED_QUEUE = 'Approved' as const;
export const APPLICATION_APPROVED_STATE = 'Approved' as const;

/** ISO public-portal approval (`actorType=ISO`). */
const isIsoApprovalActor = (actorType: string | null | undefined): boolean =>
    String(actorType ?? '').trim().toUpperCase() === 'ISO';

/**
 * ISO public-portal approvals advance straight to Contract Pending so Operations
 * can generate the contract. Internal CRM approvals keep Approved/Approved.
 */
const resolveApprovalTarget = (
    actorType: string | null | undefined
): { queue: string; state: string } =>
    isIsoApprovalActor(actorType)
        ? { queue: APPLICATION_QUEUE_CONTRACT_PENDING, state: APPLICATION_STATE_CONTRACT_PENDING }
        : { queue: APPLICATION_APPROVED_QUEUE, state: APPLICATION_APPROVED_STATE };

/** Public contract returned to the controller / API. */
export interface ApproveApplicationResult {
    application: any;
    alreadyApproved: boolean;
    previousQueue: string | null;
    previousState: string | null;
}

export interface ApproveApplicationOptions {
    /** Authenticated principal performing the approval (CRM user or ISO public-portal session). */
    actor: AuthenticatedUser | null;
    /** Tag the activity log + worker payload (`'ISO'`, `'CLIENT'`, internal role label, …). */
    actorType?: string | null;
    /** Optional human-readable name of the actor (for activity log + emails). */
    actorName?: string | null;
    /** Optional free-form note/reason the approver supplied (stored in metadata). */
    note?: string | null;
    /**
     * When provided, an in-flight approval with the same key returns the cached
     * result instead of re-running the transition. Lets clients safely retry.
     */
    idempotencyKey?: string | null;
    /** When set, audit rows attribute to a real tenant User (incl. Super Admin proxy fallback). */
    req?: Request | null;
}

/* --------------------------- Idempotency cache ---------------------------- */
/** Bounded in-memory cache so the same retry within ~10 minutes maps to one transition. */
const IDEMPOTENCY_CACHE_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_CACHE_MAX_ENTRIES = 5_000;

type IdempotencyCacheEntry = {
    expiresAt: number;
    promise: Promise<ApproveApplicationResult>;
};

const idempotencyCache = new Map<string, IdempotencyCacheEntry>();

const buildIdempotencyCacheKey = (applicationId: string, idempotencyKey: string): string =>
    `${applicationId}::${idempotencyKey}`;

const pruneExpiredIdempotencyEntries = (now: number): void => {
    if (idempotencyCache.size === 0) return;
    for (const [key, entry] of idempotencyCache.entries()) {
        if (entry.expiresAt <= now) idempotencyCache.delete(key);
    }
    while (idempotencyCache.size > IDEMPOTENCY_CACHE_MAX_ENTRIES) {
        const oldest = idempotencyCache.keys().next();
        if (oldest.done) break;
        idempotencyCache.delete(oldest.value);
    }
};

/* ------------------------------ Helpers ----------------------------------- */
const includeForApiResponse: Prisma.ApplicationInclude = {
    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    client: true,
    iso: true,
    files: true,
};

/**
 * Normalized queue/state tokens that mean the deal has already reached (or moved
 * past) the approval transition. Used to keep `approveApplication` idempotent so
 * repeat clicks / retried webhooks never re-fire side-effects and — critically —
 * never overwrite a more-advanced contract stage back to an earlier one.
 */
const POST_APPROVAL_WORKFLOW_TOKENS = new Set<string>([
    'approved',
    'completed',
    'isoapproved',
    'approvedbyiso',
    'contractpending',
    'contractgenerated',
    'contractsent',
    'contractout',
    'contractsout',
    'contractcancelled',
    'contractsigned',
    'signedcontracts',
    'fundingcall',
    'disbursment',
    'disbursement',
    'funded',
    'final',
]);

const normalizeWorkflowToken = (value: string | null | undefined): string =>
    String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');

const isAlreadyApproved = (queue: string | null | undefined, state: string | null | undefined): boolean =>
    POST_APPROVAL_WORKFLOW_TOKENS.has(normalizeWorkflowToken(queue)) ||
    POST_APPROVAL_WORKFLOW_TOKENS.has(normalizeWorkflowToken(state));

const isIsoApprovedStage = (
    queue: string | null | undefined,
    state: string | null | undefined
): boolean =>
    normalizeWorkflowToken(queue) === 'isoapproved' ||
    normalizeWorkflowToken(state) === 'isoapproved';

const isContractPendingStage = (
    queue: string | null | undefined,
    state: string | null | undefined
): boolean =>
    normalizeWorkflowToken(queue) === 'contractpending' ||
    normalizeWorkflowToken(state) === 'contractpending';

/* ============================ Core action ================================= */

/**
 * Atomically move an application to the Approved queue/state and dispatch
 * non-blocking side-effects (notifications, ISO/agent emails, activity log).
 *
 * Safe to call concurrently from many sources — only one caller will observe
 * `alreadyApproved=false`; all others get `alreadyApproved=true` and the same
 * canonical record back.
 */
export async function approveApplication(
    where: Prisma.ApplicationWhereUniqueInput,
    options: ApproveApplicationOptions
): Promise<ApproveApplicationResult> {
    const idempotencyKey = options.idempotencyKey?.trim() || '';

    if (idempotencyKey) {
        const now = Date.now();
        pruneExpiredIdempotencyEntries(now);

        const lookupApp = await prisma.application.findUnique({
            where,
            select: { id: true },
        });
        if (lookupApp) {
            const cacheKey = buildIdempotencyCacheKey(lookupApp.id, idempotencyKey);
            const cached = idempotencyCache.get(cacheKey);
            if (cached) return cached.promise;

            const inflight = runApproval(where, options);
            idempotencyCache.set(cacheKey, {
                expiresAt: now + IDEMPOTENCY_CACHE_TTL_MS,
                promise: inflight,
            });
            inflight.catch(() => {
                idempotencyCache.delete(cacheKey);
            });
            return inflight;
        }
    }

    return runApproval(where, options);
}

async function runApproval(
    where: Prisma.ApplicationWhereUniqueInput,
    options: ApproveApplicationOptions
): Promise<ApproveApplicationResult> {
    console.log('[approveApplication] >>> START', {
        where,
        actorId: options.actor?.id ?? null,
        actorRole: options.actor?.role ?? null,
        actorType: options.actorType ?? null,
    });

    const existing = await prisma.application.findUnique({
        where,
        select: {
            id: true,
            applicationId: true,
            currentQueue: true,
            currentState: true,
            needsContractReinitiation: true,
        },
    });

    if (!existing) {
        console.error('[approveApplication] application not found for where:', where);
        const err = new Error('Application not found') as Error & { statusCode?: number };
        err.statusCode = 404;
        throw err;
    }

    const previousQueue = existing.currentQueue;
    const previousState = existing.currentState;

    console.log('[approveApplication] before update:', {
        applicationDbId: existing.id,
        applicationNumericId: existing.applicationId,
        previousQueue,
        previousState,
    });

    const alreadyApproved = isAlreadyApproved(previousQueue, previousState);

    /**
     * Idempotent fast-path: the deal has already reached (or moved past) the
     * approval transition. Return the canonical record untouched so a repeat
     * click / retried webhook never overwrites a more-advanced contract stage
     * (e.g. Contract Generated → back to Approved) and never re-fires emails.
     */
    if (alreadyApproved) {
        let current = await prisma.application.findUnique({
            where: { id: existing.id },
            include: includeForApiResponse,
        });
        console.log('[approveApplication] already at/past approval — no-op:', {
            applicationDbId: existing.id,
            previousQueue,
            previousState,
        });

        if (current && isIsoApprovalActor(options.actorType) && existing.needsContractReinitiation) {
            current = await prisma.application.update({
                where: { id: existing.id },
                data: { isoUpdatedOfferApproved: true },
                include: includeForApiResponse,
            });
            dispatchApprovalSideEffects({
                applicationId: existing.id,
                applicationNumber: existing.applicationId,
                actorId: options.actor?.id ?? null,
                actorRole: options.actor?.role ? String(options.actor.role) : null,
                actorType: options.actorType ?? null,
                actorName: options.actorName ?? null,
                previousQueue: previousQueue ?? null,
                previousState: previousState ?? null,
                targetQueue: current.currentQueue,
                targetState: current.currentState,
            });
        } else if (
            current &&
            (isIsoApprovedStage(current.currentQueue, current.currentState) ||
                normalizeWorkflowToken(current.currentQueue) === 'approved' ||
                normalizeWorkflowToken(current.currentState) === 'approved' ||
                isContractPendingStage(current.currentQueue, current.currentState)) &&
            isIsoApprovalActor(options.actorType)
        ) {
            // Backfill: ISO approval may have updated state while notifications failed.
            // Re-run fan-out idempotently for ISO actors only.
            dispatchApprovalSideEffects({
                applicationId: existing.id,
                applicationNumber: existing.applicationId,
                actorId: options.actor?.id ?? null,
                actorRole: options.actor?.role ? String(options.actor.role) : null,
                actorType: options.actorType ?? null,
                actorName: options.actorName ?? null,
                previousQueue: previousQueue ?? null,
                previousState: previousState ?? null,
                targetQueue: current.currentQueue,
                targetState: current.currentState,
            });
        }

        return {
            application: current,
            alreadyApproved: true,
            previousQueue,
            previousState,
        };
    }

    /**
     * Target stage depends on who approved:
     *   - ISO (public portal)  → Contract Pending (ready for contract generation).
     *   - Internal CRM actor   → legacy Approved/Approved bucket.
     *
     * Single non-interactive update by primary key to avoid Prisma interactive
     * transaction timeout failures (P2028) under DB latency spikes.
     */
    const target = resolveApprovalTarget(options.actorType);
    const approvalUpdateData: Prisma.ApplicationUpdateInput = {
        currentQueue: target.queue,
        currentState: target.state,
    };
    if (isIsoApprovalActor(options.actorType) && existing.needsContractReinitiation) {
        approvalUpdateData.isoUpdatedOfferApproved = true;
    }

    const application = await prisma.application.update({
        where: { id: existing.id },
        data: approvalUpdateData,
        include: includeForApiResponse,
    });

    console.log('[approveApplication] DB write succeeded:', {
        applicationDbId: application.id,
        currentQueue: application.currentQueue,
        currentState: application.currentState,
        updatedAt: application.updatedAt,
    });

    /**
     * Defensive read-back to confirm the row really shows the target stage
     * (catches replicas, triggers, or concurrent writers that might revert).
     */
    const readback = await prisma.application.findUnique({
        where: { id: existing.id },
        select: { currentQueue: true, currentState: true },
    });
    console.log('[approveApplication] readback after commit:', readback);

    /**
     * Activity log + side-effects (this call performed the real transition).
     */
    {
        try {
            await createApplicationActivityLog({
                applicationId: existing.id,
                user: options.actor ?? null,
                req: options.req,
                actionType: 'APPROVED',
                actionDescription: buildApprovalActivityDescription(options),
                previousStatus: `${previousQueue ?? ''} / ${previousState ?? ''}`,
                currentStatus: `${target.queue} / ${target.state}`,
                metadata: {
                    actorType: options.actorType ?? null,
                    actorName: options.actorName ?? null,
                    actorId: options.actor?.id ?? null,
                    actorRole: options.actor?.role ?? null,
                    note: options.note ?? null,
                    idempotencyKey: options.idempotencyKey ?? null,
                    source: 'approveApplication',
                },
            });
        } catch (logError) {
            console.error('[applicationApprovalService] activity log failed:', logError);
        }

        dispatchApprovalSideEffects({
            applicationId: existing.id,
            applicationNumber: existing.applicationId,
            actorId: options.actor?.id ?? null,
            actorRole: options.actor?.role ? String(options.actor.role) : null,
            actorType: options.actorType ?? null,
            actorName: options.actorName ?? null,
            previousQueue: previousQueue ?? null,
            previousState: previousState ?? null,
            targetQueue: target.queue,
            targetState: target.state,
        });
    }

    console.log('[approveApplication] <<< DONE', {
        applicationDbId: existing.id,
        alreadyApproved,
    });

    return {
        application,
        alreadyApproved,
        previousQueue,
        previousState,
    };
}

/* ------------------------- Activity description -------------------------- */
function buildApprovalActivityDescription(options: ApproveApplicationOptions): string {
    const actorTypeRaw = String(options.actorType ?? '').trim().toUpperCase();
    const role = String(options.actor?.role ?? '').trim().toUpperCase().replace(/_/g, ' ');
    const name = String(options.actorName ?? '').trim();

    const subject = (() => {
        if (actorTypeRaw === 'ISO') return name ? `ISO ${name}` : 'ISO';
        if (actorTypeRaw === 'CLIENT') return name ? `Client ${name}` : 'Client';
        if (role) return name ? `${role} ${name}` : role;
        return name || 'User';
    })();

    return `${subject} approved the application.`;
}

/* ----------------------- Side-effect dispatcher -------------------------- */
export interface ApprovalSideEffectPayload {
    applicationId: string;
    applicationNumber: number | null | undefined;
    actorId: string | null;
    actorRole: string | null;
    actorType: string | null;
    actorName: string | null;
    previousQueue: string | null;
    previousState: string | null;
    /** Post-transition queue label (e.g. Contract Pending) — drives notification routing. */
    targetQueue?: string | null;
    /** Post-transition state label (e.g. CONTRACT_PENDING) — drives notification routing. */
    targetState?: string | null;
}

function dispatchApprovalSideEffects(payload: ApprovalSideEffectPayload): void {
    if (isApplicationApprovalQueueEnabled()) {
        enqueueApplicationApprovalSideEffects(payload).catch((err: unknown) => {
            console.error(
                '[applicationApprovalService] enqueue failed; falling back to inline fan-out:',
                err
            );
            void runApprovalSideEffectsInline(payload);
        });
        return;
    }

    setImmediate(() => {
        void runApprovalSideEffectsInline(payload);
    });
}

/**
 * Inline (non-queue) fan-out used when Redis is unavailable. The worker module
 * exports the same function and is the canonical implementation.
 *
 * Imported lazily so the request path never pulls in worker/email modules
 * unless we actually need the inline path.
 */
async function runApprovalSideEffectsInline(payload: ApprovalSideEffectPayload): Promise<void> {
    try {
        const { processApplicationApprovalSideEffects } = await import(
            '../applicationApprovalSideEffects'
        );
        await processApplicationApprovalSideEffects(payload);
    } catch (err) {
        console.error('[applicationApprovalService] inline fan-out failed:', err);
    }
}
