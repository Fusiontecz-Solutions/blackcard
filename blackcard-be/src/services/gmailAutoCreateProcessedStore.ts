import { createHash } from 'crypto';

import prisma from '../config/prismaClient';
import { getRedisClient } from '../config/redis';

/** In-process dedupe when Redis is unavailable. */
const handledInMemory = new Set<string>();
/** Short-lived create locks (multi-user / multi-instance races). */
const claimInMemory = new Map<string, number>();

const TTL_DAYS_DEFAULT = 90;
const SCAN_DAYS_DEFAULT = 14;
/** Claim TTL: long enough for Claude parse + create; short enough to retry after crash. */
const CLAIM_TTL_SECONDS = 180;

function cacheKey(userId: string, messageId: string): string {
    return `gmail:auto-create:handled:${userId}:${messageId}`;
}

function globalMessageCacheKey(messageId: string): string {
    return `gmail:auto-create:global-msg:${String(messageId || '').trim()}`;
}

function globalPdfHashCacheKey(pdfContentHash: string): string {
    return `gmail:auto-create:global-pdf:${String(pdfContentHash || '').trim()}`;
}

function claimMessageKey(messageId: string): string {
    return `gmail:auto-create:claim-msg:${String(messageId || '').trim()}`;
}

function claimPdfHashKey(pdfContentHash: string): string {
    return `gmail:auto-create:claim-pdf:${String(pdfContentHash || '').trim()}`;
}

function pruneExpiredClaims(now = Date.now()): void {
    for (const [key, expiresAt] of claimInMemory) {
        if (expiresAt <= now) claimInMemory.delete(key);
    }
}

/**
 * Acquire a short-lived exclusive lock. Returns false if another worker already holds it.
 * Prefer Redis SET NX; fall back to in-process Map when Redis is down.
 */
async function tryAcquireClaim(lockKey: string, ttlSeconds = CLAIM_TTL_SECONDS): Promise<boolean> {
    const key = String(lockKey || '').trim();
    if (!key) return false;

    pruneExpiredClaims();
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const existing = claimInMemory.get(key);
    if (existing && existing > Date.now()) {
        return false;
    }
    claimInMemory.set(key, expiresAt);

    const redis = getRedisClient();
    if (!redis) {
        return true;
    }

    try {
        const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
        if (result === 'OK') {
            return true;
        }
        // Another instance holds Redis lock — drop our optimistic in-memory claim.
        claimInMemory.delete(key);
        return false;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gmail-auto-create] claim Redis failed for ${key}: ${msg}`);
        // Keep in-memory claim so same process still serializes.
        return true;
    }
}

async function releaseClaim(lockKey: string): Promise<void> {
    const key = String(lockKey || '').trim();
    if (!key) return;
    claimInMemory.delete(key);
    const redis = getRedisClient();
    if (!redis) return;
    try {
        await redis.del(key);
    } catch {
        /* best-effort */
    }
}

function readTtlSeconds(): number {
    const raw = Number(process.env.GMAIL_AUTO_CREATE_PROCESSED_TTL_DAYS ?? TTL_DAYS_DEFAULT);
    const days = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 365) : TTL_DAYS_DEFAULT;
    return days * 24 * 60 * 60;
}

/** How far back the Gmail list query scans (read + unread). */
export function readGmailAutoCreateScanDays(): number {
    const raw = Number(process.env.GMAIL_AUTO_CREATE_SCAN_DAYS ?? SCAN_DAYS_DEFAULT);
    if (!Number.isFinite(raw) || raw < 1) return SCAN_DAYS_DEFAULT;
    return Math.min(Math.floor(raw), 90);
}

export function buildGmailPdfInboxQuery(): string {
    const scanDays = readGmailAutoCreateScanDays();
    // Exclude already-ingested mail so newer genuine deals aren't buried behind in-crm noise.
    // `crm-skipped` = filtered by auto-create rules; admins can retry from the review list.
    return `has:attachment filename:pdf newer_than:${scanDays}d -label:in-crm -label:crm-skipped`;
}

/** Stable SHA-256 idempotency key for a CRM user + Gmail message id. */
export function gmailAutoCreateMessageKey(userId: string, gmailMessageId: string): string {
    const user = String(userId || '').trim();
    const messageId = String(gmailMessageId || '').trim();
    return createHash('sha256').update(`${user}:${messageId}`, 'utf8').digest('hex');
}

/** Cross-user processing key — only one CRM user may claim a given Gmail message. */
export function gmailAutoCreateGlobalMessageKey(gmailMessageId: string): string {
    const messageId = String(gmailMessageId || '').trim();
    return createHash('sha256').update(`global:${messageId}`, 'utf8').digest('hex');
}

/** SHA-256 hex digest of PDF attachment bytes (cross-email duplicate detection). */
export function sha256PdfContent(pdfBuffer: Buffer): string {
    return createHash('sha256').update(pdfBuffer).digest('hex');
}

export type GmailAutoCreateOutcome =
    | 'success'
    | 'skipped_no_pdf'
    | 'skipped_duplicate'
    | 'skipped_filtered'
    | 'failed_parse'
    | 'failed_other'
    | 'processing'
    | 'force_create';

/**
 * Pending marker written by an admin "force retry": the next poll treats the
 * message as unhandled and bypasses the skip filters for it once.
 */
export const GMAIL_AUTO_CREATE_FORCE_OUTCOME = 'force_create';

/** Outcomes shown in the admin "Skipped emails" review list. */
export const GMAIL_AUTO_CREATE_SKIPPED_OUTCOMES = ['skipped_filtered', 'skipped_duplicate'];

/** Message ids whose claim converted a force_create marker (consumed by the poller). */
const forcedMessageIds = new Set<string>();

export type RecordGmailAutoCreateParams = {
    applicationId?: string | null;
    pdfContentHash?: string | null;
    /** Skip bookkeeping for the admin review list. */
    skipReason?: string | null;
    skipDetail?: string | null;
    subject?: string | null;
    fromEmail?: string | null;
    pdfCount?: number | null;
};

function trimOrNull(value: string | null | undefined, max: number): string | null {
    const v = String(value ?? '').trim();
    return v ? v.slice(0, max) : null;
}

async function lookupLedger(messageKey: string): Promise<boolean> {
    try {
        const row = await prisma.gmailAutoCreateLedger.findUnique({
            where: { messageKey },
            select: { id: true, outcome: true, createdAt: true },
        });
        if (!row) return false;
        if (row.outcome === GMAIL_AUTO_CREATE_FORCE_OUTCOME) return false;
        if (row.outcome === 'processing') {
            const ageMs = Date.now() - new Date(row.createdAt).getTime();
            return ageMs < CLAIM_TTL_SECONDS * 1000;
        }
        return true;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gmail-auto-create] ledger lookup failed for key=${messageKey}: ${msg}`);
        return false;
    }
}

/**
 * True if this Gmail message was already handled by auto-create for this CRM user
 * (success, skip, or terminal failure). Prevents repeat Claude calls on cron retries.
 */
export async function isGmailAutoCreateMessageHandled(
    userId: string,
    messageId: string,
): Promise<boolean> {
    if (await isGmailMessageHandledGlobally(messageId)) {
        return true;
    }

    // Legacy per-user keys + new global key
    const legacyKey = gmailAutoCreateMessageKey(userId, messageId);
    const globalMsgKey = gmailAutoCreateGlobalMessageKey(messageId);
    const key = cacheKey(userId, messageId);
    if (handledInMemory.has(key)) {
        return true;
    }

    if ((await lookupLedger(globalMsgKey)) || (await lookupLedger(legacyKey))) {
        handledInMemory.add(key);
        return true;
    }

    const redis = getRedisClient();
    if (!redis) {
        return false;
    }

    try {
        const value = await redis.get(key);
        if (value) {
            handledInMemory.add(key);
            return true;
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gmail-auto-create] Redis lookup failed for ${messageId}: ${msg}`);
    }
    return false;
}

/**
 * True if ANY CRM user already processed this Gmail message id.
 * Shared inboxes connect multiple users — per-user ledger alone creates twin deals.
 * Ignores stale `processing` claims older than CLAIM_TTL so crashed workers can retry.
 */
export async function isGmailMessageHandledGlobally(messageId: string): Promise<boolean> {
    const gmailMessageId = String(messageId || '').trim();
    if (!gmailMessageId) return false;

    const globalKey = globalMessageCacheKey(gmailMessageId);
    if (handledInMemory.has(globalKey)) {
        return true;
    }

    try {
        const row = await prisma.gmailAutoCreateLedger.findFirst({
            where: { gmailMessageId },
            select: { id: true, outcome: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
        if (row && row.outcome !== GMAIL_AUTO_CREATE_FORCE_OUTCOME) {
            if (row.outcome === 'processing') {
                const ageMs = Date.now() - new Date(row.createdAt).getTime();
                if (ageMs < CLAIM_TTL_SECONDS * 1000) {
                    handledInMemory.add(globalKey);
                    return true;
                }
                // Stale claim — treat as not handled so another worker can reclaim.
            } else {
                handledInMemory.add(globalKey);
                return true;
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gmail-auto-create] global message ledger lookup failed: ${msg}`);
    }

    const redis = getRedisClient();
    if (!redis) return false;
    try {
        const value = await redis.get(globalKey);
        if (value) {
            handledInMemory.add(globalKey);
            return true;
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gmail-auto-create] global message Redis lookup failed: ${msg}`);
    }
    return false;
}

/**
 * Claim exclusive processing rights for a Gmail message (cross-user / cross-instance).
 * Uses Redis SET NX when available, plus a durable DB row with global messageKey so
 * multi-instance deploys without relying on in-process memory alone.
 */
export async function tryClaimGmailAutoCreateMessage(
    messageId: string,
    userId: string,
): Promise<boolean> {
    const id = String(messageId || '').trim();
    const uid = String(userId || '').trim();
    if (!id || !uid) return false;
    if (await isGmailMessageHandledGlobally(id)) return false;

    const redisOk = await tryAcquireClaim(claimMessageKey(id));
    if (!redisOk) return false;

    const globalMessageKey = gmailAutoCreateGlobalMessageKey(id);
    try {
        await prisma.gmailAutoCreateLedger.create({
            data: {
                userId: uid,
                gmailMessageId: id,
                messageKey: globalMessageKey,
                outcome: 'processing',
            },
        });
        return true;
    } catch (err: unknown) {
        // Unique messageKey → another user/instance already claimed.
        const prismaErr = err as { code?: string };
        if (prismaErr?.code === 'P2002') {
            await releaseClaim(claimMessageKey(id));
            // Reclaim if the winning row is a stale processing claim.
            try {
                const existing = await prisma.gmailAutoCreateLedger.findUnique({
                    where: { messageKey: globalMessageKey },
                    select: { id: true, outcome: true, createdAt: true },
                });
                const isForce = existing?.outcome === GMAIL_AUTO_CREATE_FORCE_OUTCOME;
                if (
                    existing &&
                    (isForce ||
                        (existing.outcome === 'processing' &&
                            Date.now() - new Date(existing.createdAt).getTime() >=
                                CLAIM_TTL_SECONDS * 1000))
                ) {
                    const reclaimed = await tryAcquireClaim(claimMessageKey(id));
                    if (!reclaimed) return false;
                    // Conditional update so only one worker converts the marker.
                    const updated = await prisma.gmailAutoCreateLedger.updateMany({
                        where: { id: existing.id, outcome: existing.outcome },
                        data: { userId: uid, outcome: 'processing', createdAt: new Date() },
                    });
                    if (updated.count === 0) {
                        await releaseClaim(claimMessageKey(id));
                        return false;
                    }
                    if (isForce) forcedMessageIds.add(id);
                    return true;
                }
            } catch (reclaimErr: unknown) {
                const msg = reclaimErr instanceof Error ? reclaimErr.message : String(reclaimErr);
                console.warn(`[gmail-auto-create] stale claim reclaim failed: ${msg}`);
            }
            return false;
        }
        console.warn(
            `[gmail-auto-create] DB claim failed for ${id}:`,
            err instanceof Error ? err.message : String(err),
        );
        // Redis claim held — still proceed so create is serialized at least in-process / Redis.
        return true;
    }
}

/** True (once) when the current claim came from an admin force-retry marker. */
export function consumeGmailAutoCreateForce(messageId: string): boolean {
    const id = String(messageId || '').trim();
    if (!forcedMessageIds.has(id)) return false;
    forcedMessageIds.delete(id);
    return true;
}

/**
 * Drop in-memory + Redis "handled" markers for a message so the next poll
 * re-evaluates it (used by admin retry; the ledger rows are removed separately).
 */
export async function clearGmailAutoCreateHandledCache(
    messageId: string,
    userIds: string[],
): Promise<void> {
    const id = String(messageId || '').trim();
    if (!id) return;
    const keys = [globalMessageCacheKey(id), ...userIds.map((u) => cacheKey(u, id))];
    for (const key of Array.from(handledInMemory)) {
        if (key.endsWith(`:${id}`)) handledInMemory.delete(key);
    }
    const redis = getRedisClient();
    if (!redis) return;
    try {
        await redis.del(...keys);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gmail-auto-create] Redis clear failed for ${id}: ${msg}`);
    }
}

export async function releaseGmailAutoCreateMessageClaim(messageId: string): Promise<void> {
    await releaseClaim(claimMessageKey(messageId));
}

/**
 * Short-lived exclusive lock so two workers do not insert the same request twice.
 * Same PDF bytes on a later email are allowed to create a new deal (Dupes).
 */
export async function tryClaimPdfContentHashCreate(pdfContentHash: string): Promise<boolean> {
    const hash = String(pdfContentHash || '').trim();
    if (!hash) return false;
    return tryAcquireClaim(claimPdfHashKey(hash));
}

export async function releasePdfContentHashCreateClaim(pdfContentHash: string): Promise<void> {
    await releaseClaim(claimPdfHashKey(pdfContentHash));
}

export async function hasRecentGmailPdfContentHash(params: {
    /** When omitted, search across all CRM users (shared-inbox safe). */
    userId?: string;
    pdfContentHash: string;
    dedupeDays?: number;
}): Promise<boolean> {
    const row = await findRecentLedgerRowByPdfContentHash(params);
    if (row) return true;

    const pdfContentHash = String(params.pdfContentHash || '').trim();
    if (!pdfContentHash) return false;
    const globalKey = globalPdfHashCacheKey(pdfContentHash);
    if (handledInMemory.has(globalKey)) return true;

    const redis = getRedisClient();
    if (!redis) return false;
    try {
        const value = await redis.get(globalKey);
        if (value) {
            handledInMemory.add(globalKey);
            return true;
        }
    } catch {
        /* ignore */
    }
    return false;
}

/** Latest successful auto-create ledger row for this PDF content hash (if any). */
export async function findRecentLedgerRowByPdfContentHash(params: {
    /** When omitted, match any user — required for shared Gmail inboxes. */
    userId?: string;
    pdfContentHash: string;
    dedupeDays?: number;
}): Promise<{ applicationId: string | null } | null> {
    const pdfContentHash = String(params.pdfContentHash || '').trim();
    if (!pdfContentHash) return null;

    const dedupeDaysRaw = Number(
        params.dedupeDays ?? process.env.GMAIL_AUTO_CREATE_DEDUPE_DAYS ?? 7,
    );
    const dedupeDays =
        Number.isFinite(dedupeDaysRaw) && dedupeDaysRaw > 0
            ? Math.min(Math.floor(dedupeDaysRaw), 90)
            : 7;
    const since = new Date(Date.now() - dedupeDays * 24 * 60 * 60 * 1000);
    const userId = params.userId ? String(params.userId).trim() : '';

    try {
        const row = await prisma.gmailAutoCreateLedger.findFirst({
            where: {
                ...(userId ? { userId } : {}),
                pdfContentHash,
                outcome: 'success',
                createdAt: { gte: since },
            },
            select: { applicationId: true },
            orderBy: { createdAt: 'desc' },
        });
        return row ?? null;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gmail-auto-create] pdf hash lookup failed: ${msg}`);
        return null;
    }
}

/**
 * Record a successful PDF create for content-hash idempotency even when there is
 * no Gmail message id (FE Auto-Create / upload). Uses a synthetic message id.
 */
export async function recordPdfContentCreateHandled(
    userId: string,
    pdfContentHash: string,
    applicationId: string,
): Promise<void> {
    const hash = String(pdfContentHash || '').trim();
    const uid = String(userId || '').trim();
    const appId = String(applicationId || '').trim();
    if (!hash || !uid || !appId) return;
    await recordGmailAutoCreateMessageHandled(uid, `pdf:${hash}`, 'success', {
        applicationId: appId,
        pdfContentHash: hash,
    });
}

export async function recordGmailAutoCreateMessageHandled(
    userId: string,
    messageId: string,
    outcome: GmailAutoCreateOutcome,
    extras?: RecordGmailAutoCreateParams,
): Promise<void> {
    const gmailMessageId = String(messageId || '').trim();
    if (!gmailMessageId || !userId) return;

    // Always use the cross-user key so shared inboxes share one ledger row per message/PDF.
    const messageKey = gmailAutoCreateGlobalMessageKey(gmailMessageId);
    const key = cacheKey(userId, gmailMessageId);
    const globalKey = globalMessageCacheKey(gmailMessageId);
    handledInMemory.add(key);
    handledInMemory.add(globalKey);

    const applicationId = extras?.applicationId ? String(extras.applicationId).trim() : null;
    const pdfContentHash = extras?.pdfContentHash ? String(extras.pdfContentHash).trim() : null;
    const skipFields = {
        skipReason: trimOrNull(extras?.skipReason, 64),
        skipDetail: trimOrNull(extras?.skipDetail, 1000),
        subject: trimOrNull(extras?.subject, 300),
        fromEmail: trimOrNull(extras?.fromEmail, 320),
        pdfCount: Number.isFinite(Number(extras?.pdfCount)) && extras?.pdfCount != null
            ? Math.floor(Number(extras.pdfCount))
            : null,
    };
    if (pdfContentHash) {
        handledInMemory.add(globalPdfHashCacheKey(pdfContentHash));
    }

    try {
        await prisma.gmailAutoCreateLedger.upsert({
            where: { messageKey },
            create: {
                userId,
                gmailMessageId,
                messageKey,
                outcome,
                applicationId: applicationId || undefined,
                pdfContentHash: pdfContentHash || undefined,
                ...skipFields,
            },
            update: {
                userId,
                outcome,
                applicationId: applicationId || undefined,
                pdfContentHash: pdfContentHash || undefined,
                ...skipFields,
            },
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gmail-auto-create] ledger upsert failed for ${gmailMessageId}: ${msg}`);
    }

    const redis = getRedisClient();
    if (!redis) {
        return;
    }

    const ttl = readTtlSeconds();
    try {
        await redis.set(key, outcome, 'EX', ttl);
        await redis.set(globalKey, outcome, 'EX', ttl);
        if (pdfContentHash) {
            await redis.set(globalPdfHashCacheKey(pdfContentHash), outcome, 'EX', ttl);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gmail-auto-create] Redis record failed for ${gmailMessageId}: ${msg}`);
    }
}
