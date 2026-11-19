/**
 * Super Admin underwriter routing (book-wide).
 *
 * Super Admin picks who this book's cases belong to:
 *   - one underwriter  → deals entering the Underwriter queue are auto-assigned to them,
 *     and unassigned deals already in that queue are handed over when the setting is saved;
 *   - several underwriters → nothing is auto-assigned, they simply all see the book's cases
 *     and claim as usual;
 *   - nobody → default behaviour, every underwriter sees unclaimed work.
 *
 * In the first two cases underwriters outside the selection only keep deals that were
 * assigned to them explicitly. Per-application "Send to Underwriter" always wins —
 * routing never overwrites an existing assignee.
 */
import prisma from '../config/prismaClient';
import {
    CANONICAL_WORKFLOW_QUEUES,
    isFinalUnderwriterQueueTarget,
} from '../utils/workflowQueueStorage';
import { notifyAdminAssignedApplicationToUnderwriter } from './applicationStageNotificationService';

export const UNDERWRITER_ROUTING_CONFIG_ID = 'default';

const UNDERWRITER_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    isActive: true,
} as const;

export type RoutingUnderwriter = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
};

export type UnderwriterRoutingConfigView = {
    underwriterIds: string[];
    underwriters: RoutingUnderwriter[];
    /** True only for a single selection — that is when deals are auto-assigned. */
    autoAssign: boolean;
    updatedAt: string | null;
};

export class UnderwriterRoutingError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = 'UnderwriterRoutingError';
        this.status = status;
    }
}

/**
 * Visibility checks run inside hot list queries, so the selection is cached and refreshed
 * in the background. Writes invalidate it immediately.
 */
const CACHE_TTL_MS = 15_000;
let cachedUnderwriterIds: string[] = [];
let cacheExpiresAt = 0;
let inflightRefresh: Promise<string[]> | null = null;

export function invalidateUnderwriterRoutingCache(): void {
    cacheExpiresAt = 0;
}

/** Selected underwriters that still exist as active underwriters, in stored order. */
async function readDesignatedUnderwriters(): Promise<RoutingUnderwriter[]> {
    const config = await prisma.underwriterRoutingConfig.findUnique({
        where: { id: UNDERWRITER_ROUTING_CONFIG_ID },
        select: { designatedUnderwriterIds: true },
    });
    const ids = config?.designatedUnderwriterIds ?? [];
    if (ids.length === 0) return [];

    const users = await prisma.user.findMany({
        where: { id: { in: ids }, role: 'UNDERWRITER', isActive: true },
        select: UNDERWRITER_SELECT,
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return ids
        .map((id) => byId.get(id))
        .filter((user): user is RoutingUnderwriter => Boolean(user));
}

/** Load the selected underwriter ids, refreshing the cache when stale. */
export async function loadDesignatedUnderwriterIds(): Promise<string[]> {
    if (Date.now() < cacheExpiresAt) return cachedUnderwriterIds;
    if (!inflightRefresh) {
        inflightRefresh = readDesignatedUnderwriters()
            .then((underwriters) => {
                cachedUnderwriterIds = underwriters.map((user) => user.id);
                cacheExpiresAt = Date.now() + CACHE_TTL_MS;
                return cachedUnderwriterIds;
            })
            .catch((error) => {
                console.error('[underwriterRouting] failed to load config:', error);
                return cachedUnderwriterIds;
            })
            .finally(() => {
                inflightRefresh = null;
            });
    }
    return inflightRefresh;
}

/**
 * Cached selection for synchronous visibility filters. Kicks off a background refresh
 * when stale rather than blocking the request.
 */
export function getCachedDesignatedUnderwriterIds(): string[] {
    if (Date.now() >= cacheExpiresAt) {
        void loadDesignatedUnderwriterIds();
    }
    return cachedUnderwriterIds;
}

/** Warm the cache at boot so the first requests are not evaluated against an empty cache. */
export async function primeUnderwriterRoutingCache(): Promise<void> {
    try {
        await loadDesignatedUnderwriterIds();
    } catch (error) {
        console.error('[underwriterRouting] failed to prime cache:', error);
    }
}

export async function getUnderwriterRoutingConfig(): Promise<UnderwriterRoutingConfigView> {
    const [underwriters, config] = await Promise.all([
        readDesignatedUnderwriters(),
        prisma.underwriterRoutingConfig.findUnique({
            where: { id: UNDERWRITER_ROUTING_CONFIG_ID },
            select: { updatedAt: true },
        }),
    ]);

    return {
        underwriterIds: underwriters.map((user) => user.id),
        underwriters,
        autoAssign: underwriters.length === 1,
        updatedAt: config?.updatedAt ? config.updatedAt.toISOString() : null,
    };
}

/**
 * Hand every unassigned deal in the Underwriter queue to the designated underwriter.
 * Deals already assigned to someone else are left untouched.
 */
export async function assignUnclaimedUnderwriterQueueDeals(
    underwriterId: string,
): Promise<number> {
    const { count } = await prisma.application.updateMany({
        where: {
            currentQueue: CANONICAL_WORKFLOW_QUEUES.UNDERWRITER,
            assignedUnderwriterId: null,
            deletedAt: null,
        },
        data: { assignedUnderwriterId: underwriterId },
    });
    return count;
}

const NOTIFICATION_SELECT = {
    id: true,
    applicationId: true,
    currentQueue: true,
    currentState: true,
    referringAgentId: true,
    salesRepresentativeId: true,
    createdById: true,
    client: {
        select: {
            businessName: true,
            ownerFirstName: true,
            ownerLastName: true,
        },
    },
} as const;

async function notifyRoutedApplication(
    applicationId: string,
    underwriterId: string,
): Promise<void> {
    try {
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            select: NOTIFICATION_SELECT,
        });
        if (!application) return;
        await notifyAdminAssignedApplicationToUnderwriter({
            application,
            recipientId: underwriterId,
        });
    } catch (error) {
        console.error('[underwriterRouting] notify failed:', error);
    }
}

/**
 * Auto-assign a deal that just landed in the Underwriter queue. Only applies to a single
 * designated underwriter; a multi-underwriter selection is visibility-only.
 */
export async function routeApplicationToDesignatedUnderwriter(
    applicationId: string,
): Promise<string | null> {
    if (!applicationId) return null;
    const underwriterIds = await loadDesignatedUnderwriterIds();
    if (underwriterIds.length !== 1) return null;
    const underwriterId = underwriterIds[0];

    const { count } = await prisma.application.updateMany({
        where: {
            id: applicationId,
            currentQueue: CANONICAL_WORKFLOW_QUEUES.UNDERWRITER,
            assignedUnderwriterId: null,
        },
        data: { assignedUnderwriterId: underwriterId },
    });
    if (count === 0) return null;

    void notifyRoutedApplication(applicationId, underwriterId);
    return underwriterId;
}

/**
 * Safe to call after any application write: routes the deal only when it now sits in the
 * Underwriter queue with no assignee.
 */
export async function routeApplicationIfInUnderwriterQueue(record: {
    id: string;
    currentQueue?: string | null;
    assignedUnderwriterId?: string | null;
}): Promise<string | null> {
    if (!record?.id) return null;
    if (record.assignedUnderwriterId) return null;
    if (!isFinalUnderwriterQueueTarget(record.currentQueue)) return null;
    try {
        return await routeApplicationToDesignatedUnderwriter(record.id);
    } catch (error) {
        console.error('[underwriterRouting] auto-assign failed:', error);
        return null;
    }
}

/** Validate the requested ids and return them de-duplicated, in the order given. */
async function resolveUnderwriterSelection(rawIds: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const raw of rawIds) {
        const id = String(raw ?? '').trim();
        if (id && !ids.includes(id)) ids.push(id);
    }
    if (ids.length === 0) return [];

    const users = await prisma.user.findMany({
        where: { id: { in: ids }, role: 'UNDERWRITER' },
        select: { id: true, isActive: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    for (const id of ids) {
        const user = byId.get(id);
        if (!user) {
            throw new UnderwriterRoutingError(
                'One of the selected users is not an Underwriter in this book',
            );
        }
        if (!user.isActive) {
            throw new UnderwriterRoutingError('One of the selected Underwriters is inactive');
        }
    }
    return ids;
}

export async function setDesignatedUnderwriters(args: {
    underwriterIds: string[];
    actorId?: string | null;
}): Promise<{ config: UnderwriterRoutingConfigView; assignedCount: number }> {
    const ids = await resolveUnderwriterSelection(args.underwriterIds ?? []);
    const updatedById = args.actorId ? String(args.actorId) : null;

    await prisma.underwriterRoutingConfig.upsert({
        where: { id: UNDERWRITER_ROUTING_CONFIG_ID },
        create: {
            id: UNDERWRITER_ROUTING_CONFIG_ID,
            designatedUnderwriterIds: ids,
            updatedById,
        },
        update: { designatedUnderwriterIds: ids, updatedById },
    });
    invalidateUnderwriterRoutingCache();
    await loadDesignatedUnderwriterIds();

    // Only a single selection takes ownership of the existing queue.
    const assignedCount =
        ids.length === 1 ? await assignUnclaimedUnderwriterQueueDeals(ids[0]) : 0;

    return { config: await getUnderwriterRoutingConfig(), assignedCount };
}
