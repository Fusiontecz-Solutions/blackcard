/**
 * In-app + realtime notifications for application lifecycle stages — from creation
 * through every queue / state transition (underwriting, contracts, funding, etc.).
 */
import prisma from '../config/prismaClient';
import { emitToUser } from '../socket';
import {
    deriveActionUrl,
    deriveCategory,
    notificationTriageDefaults,
} from './notificationCategory';

const NOTIFICATION_INCLUDE = {
    recipient: { select: { id: true, firstName: true, lastName: true, email: true } },
    application: {
        select: {
            id: true,
            applicationId: true,
            priority: true,
            type: true,
            currentQueue: true,
            currentState: true,
        },
    },
    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

interface RecipientUser {
    id: string;
    email: string | null;
    name: string;
}

export interface ApplicationNotificationRecord {
    id: string;
    applicationId?: number | null;
    currentQueue?: string | null;
    currentState?: string | null;
    referringAgentId?: string | null;
    salesRepresentativeId?: string | null;
    createdById?: string | null;
    client?: {
        businessName?: string | null;
        ownerFirstName?: string | null;
        ownerLastName?: string | null;
    } | null;
}

export type StageTransitionAction =
    | 'SEND_TO_UNDERWRITER'
    | 'SEND_TO_FINAL_UNDERWRITER'
    | 'SEND_FOR_FINAL_APPROVAL'
    | 'APPROVED'
    | 'QUEUE_CHANGED'
    | 'CREATED';

export interface StageNotificationContext {
    application: ApplicationNotificationRecord;
    previousQueue?: string | null;
    previousState?: string | null;
    actorId?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
    transitionAction?: StageTransitionAction;
    /** Override default copy (e.g. rejection reason). */
    titleOverride?: string;
    messageOverride?: string;
    type?: string;
    importance?: 'low' | 'normal' | 'high' | 'urgent';
}

const normalizeToken = (value: unknown): string =>
    String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');

const dedupeById = (rows: RecipientUser[]): RecipientUser[] => {
    const seen = new Set<string>();
    const out: RecipientUser[] = [];
    for (const row of rows) {
        if (!row.id || seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
    }
    return out;
};

const STAGE_LABELS: Record<string, string> = {
    new: 'New',
    agent: 'Agent',
    review: 'Review',
    onhold: 'On Hold',
    scrubbing: 'Scrubbing',
    underwriting: 'Underwriting',
    finalreview: 'Final Review',
    underwriter: 'Underwriter',
    approved: 'Approved',
    declined: 'Declined',
    contracted: 'Contracted',
    contractout: 'Contract Out',
    contractsout: 'Contracts Out',
    contractsigned: 'Contract Signed',
    signedcontracts: 'Signed Contracts',
    final: 'Final',
    fundingcall: 'Funding Call',
    disbursment: 'Disbursement',
    disbursement: 'Disbursement',
    funded: 'Funded',
};

function friendlyStageLabel(queue: string | null | undefined, state?: string | null): string {
    const q = normalizeToken(queue);
    if (STAGE_LABELS[q]) return STAGE_LABELS[q];
    const s = normalizeToken(state);
    if (STAGE_LABELS[s]) return STAGE_LABELS[s];
    const raw = String(queue ?? state ?? '').trim();
    return raw || 'Updated';
}

function clientNameOf(app: ApplicationNotificationRecord): string {
    const c = app.client;
    if (!c) return 'Client';
    return (
        c.businessName ||
        `${c.ownerFirstName || ''} ${c.ownerLastName || ''}`.trim() ||
        'Client'
    );
}

const toApiNotification = (notification: any) => {
    if (!notification) return notification;
    const recipient = notification.recipient;
    const application = notification.application;
    const createdBy = notification.createdBy;
    return {
        _id: notification.id,
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        recipient: recipient
            ? {
                  _id: recipient.id,
                  id: recipient.id,
                  firstName: recipient.firstName,
                  lastName: recipient.lastName,
                  email: recipient.email,
              }
            : notification.recipientId,
        application: application
            ? {
                  _id: application.id,
                  id: application.id,
                  applicationId: application.applicationId,
                  priority: application.priority,
                  type: application.type,
                  currentQueue: application.currentQueue,
                  currentState: application.currentState,
              }
            : notification.applicationId,
        documentRequestDetails:
            notification.documentRequestedDocuments ||
            notification.documentRequestAdditional !== undefined
                ? {
                      requestedDocuments: notification.documentRequestedDocuments || [],
                      requestAdditional: !!notification.documentRequestAdditional,
                  }
                : undefined,
        isRead: notification.isRead,
        readAt: notification.readAt,
        category: notification.category ?? deriveCategory(notification.type, application),
        bucket: notification.bucket ?? 'inbox',
        importance: notification.importance ?? 'normal',
        snoozedUntil: notification.snoozedUntil ?? null,
        isArchived: notification.isArchived ?? false,
        actionUrl:
            notification.actionUrl ??
            deriveActionUrl({
                type: notification.type,
                applicationNumber: application?.applicationId,
                applicationUuid: notification.applicationId ?? application?.id,
            }),
        createdBy: createdBy
            ? {
                  _id: createdBy.id,
                  id: createdBy.id,
                  firstName: createdBy.firstName,
                  lastName: createdBy.lastName,
                  email: createdBy.email,
              }
            : notification.createdById ?? null,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt,
    };
};

async function findActiveUsersByRoles(roles: string[]): Promise<RecipientUser[]> {
    if (!roles.length) return [];
    const users = await prisma.user.findMany({
        where: { role: { in: roles as any }, isActive: true },
        select: { id: true, email: true, firstName: true, lastName: true },
    });
    return users.map((u) => ({
        id: String(u.id),
        email: u.email,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    }));
}

async function resolveStageRecipients(
    app: ApplicationNotificationRecord,
    newQueue: string,
    newState: string | null | undefined,
    transitionAction?: StageTransitionAction,
): Promise<RecipientUser[]> {
    const recipients: RecipientUser[] = [];
    const q = normalizeToken(newQueue);

    const pushStakeholders = () => {
        const ids = [app.referringAgentId, app.salesRepresentativeId, app.createdById].filter(Boolean);
        for (const id of ids) {
            recipients.push({ id: String(id), email: null, name: '' });
        }
    };

    if (transitionAction === 'CREATED') {
        // Stakeholders + book Super Admins (org-admin / SA bell need a personal row;
        // org-admin may also use the book-wide SUPER_ADMIN feed).
        pushStakeholders();
        recipients.push(...(await findActiveUsersByRoles(['SUPER_ADMIN'])));
        return recipients;
    }

    if (transitionAction === 'SEND_TO_UNDERWRITER' || q === 'scrubbing' || q === 'underwriting') {
        recipients.push(...(await findActiveUsersByRoles(['SCRUBBING'])));
        return recipients;
    }

    if (
        transitionAction === 'SEND_TO_FINAL_UNDERWRITER' ||
        q === 'underwriter' ||
        q === 'finalreview'
    ) {
        recipients.push(...(await findActiveUsersByRoles(['UNDERWRITER'])));
        return recipients;
    }

    if (transitionAction === 'APPROVED') {
        return [];
    }

    const opsStageTokens = new Set([
        'approved',
        'contracted',
        'contractout',
        'contractsout',
        'contractsigned',
        'signedcontracts',
        'final',
        'fundingcall',
        'disbursment',
        'disbursement',
        'funded',
    ]);

    if (opsStageTokens.has(q)) {
        recipients.push(
            ...(await findActiveUsersByRoles(['OPERATIONS', 'ADMIN', 'SUPER_ADMIN'])),
        );
    }

    if (q === 'declined') {
        recipients.push(...(await findActiveUsersByRoles(['SCRUBBING', 'UNDERWRITER'])));
        pushStakeholders();
        return recipients;
    }

    if (q === 'funded') {
        recipients.push(...(await findActiveUsersByRoles(['ACCOUNTANT', 'ACCOUNTS'])));
    }

    if (q === 'agent' || q === 'new' || q === 'onhold' || q === 'review') {
        pushStakeholders();
        return recipients;
    }

    // Generic stage move: stakeholders + internal ops visibility.
    pushStakeholders();
    recipients.push(
        ...(await findActiveUsersByRoles(['OPERATIONS', 'ADMIN', 'SUPER_ADMIN'])),
    );
    return recipients;
}

async function createAndPushNotifications(
    recipients: RecipientUser[],
    base: {
        title: string;
        message: string;
        type: string;
        applicationId: string;
        createdById: string | null;
        importance?: 'low' | 'normal' | 'high' | 'urgent';
    },
    application?: ApplicationNotificationRecord | null,
    options?: { includeActor?: boolean },
): Promise<void> {
    const actorId = base.createdById ? String(base.createdById) : '';
    const filtered = dedupeById(recipients).filter(
        (r) => r.id && (options?.includeActor || r.id !== actorId),
    );
    if (!filtered.length) return;

    // Notification.createdById is optional — never write Super Admin proxy / orphan UUIDs.
    let safeCreatedById: string | null = null;
    if (actorId) {
        const actor = await prisma.user.findUnique({
            where: { id: actorId },
            select: { id: true },
        });
        safeCreatedById = actor?.id ?? null;
    }

    const triage = notificationTriageDefaults(base.type, application ?? undefined);

    const created = await Promise.allSettled(
        filtered.map((r) =>
            prisma.notification.create({
                data: {
                    title: base.title,
                    message: base.message,
                    type: base.type,
                    recipientId: r.id,
                    applicationId: base.applicationId,
                    createdById: safeCreatedById,
                    category: triage.category,
                    bucket: triage.bucket,
                    importance: base.importance ?? triage.importance,
                    actionUrl: deriveActionUrl({
                        type: base.type,
                        category: triage.category as any,
                        applicationNumber: application?.applicationId,
                        applicationUuid: base.applicationId,
                    }),
                },
                include: NOTIFICATION_INCLUDE,
            }),
        ),
    );

    for (let i = 0; i < created.length; i += 1) {
        const result = created[i];
        const recipient = filtered[i];
        if (result.status === 'rejected') {
            console.error('[stageNotification] create failed:', {
                recipientId: recipient?.id,
                error: (result as PromiseRejectedResult).reason,
            });
            continue;
        }
        emitToUser(recipient.id, 'notification:new', {
            notification: toApiNotification(result.value),
        });
    }
}

function buildDefaultCopy(ctx: StageNotificationContext): { title: string; message: string; type: string; importance: 'low' | 'normal' | 'high' | 'urgent' } {
    const app = ctx.application;
    const appNum = app.applicationId ?? '';
    const client = clientNameOf(app);
    const actor = String(ctx.actorName || '').trim();
    const stage = friendlyStageLabel(app.currentQueue, app.currentState);
    const appRef = appNum ? ` #${appNum}` : '';

    if (ctx.transitionAction === 'CREATED') {
        const selfCreated = actor && ctx.actorId;
        return {
            title: selfCreated ? `You created application${appRef}` : actor ? `${actor} created a new application` : 'New application created',
            message: `New application${appRef} for ${client} is in the ${stage} stage.`,
            type: 'application_created',
            importance: 'high',
        };
    }

    if (ctx.transitionAction === 'SEND_TO_UNDERWRITER') {
        return {
            title: actor ? `${actor} sent a new application` : 'Application sent to Scrubbing',
            message: `Application${appRef} for ${client} is ready for Scrubbing.`,
            type: 'application_update',
            importance: 'high',
        };
    }

    if (ctx.transitionAction === 'SEND_TO_FINAL_UNDERWRITER') {
        const actorRoleNorm = String(ctx.actorRole ?? '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_');
        const isScrubberRecommend = actorRoleNorm === 'SCRUBBING';
        if (isScrubberRecommend) {
            return {
                title: 'Scrubber Sent Recommend Request for Approval',
                message: `Application${appRef} for ${client} has been recommended for approval and is ready for Underwriter review.`,
                type: 'application_update',
                importance: 'high',
            };
        }
        return {
            title: actor
                ? `${actor} forwarded an application for final review`
                : 'Application sent to Underwriter',
            message: `Application${appRef} for ${client} is ready for Underwriter review.`,
            type: 'application_update',
            importance: 'high',
        };
    }

    const prevQ = normalizeToken(ctx.previousQueue);
    const newQ = normalizeToken(app.currentQueue);
    const declined = newQ === 'declined';
    const funded = newQ === 'funded';

    return {
        title: declined
            ? `Application${appRef} declined`
            : funded
              ? `Application${appRef} funded`
              : `Application${appRef} — ${stage}`,
        message: declined
            ? `Application${appRef} for ${client} was declined.${actor ? ` Updated by ${actor}.` : ''}`
            : funded
              ? `Application${appRef} for ${client} has been marked as Funded.${actor ? ` Updated by ${actor}.` : ''}`
              : `Application${appRef} for ${client} moved to ${stage}${prevQ && prevQ !== newQ ? ` (from ${friendlyStageLabel(ctx.previousQueue, ctx.previousState)})` : ''}.${actor ? ` Updated by ${actor}.` : ''}`,
        type: declined ? 'application_rejected' : 'application_update',
        importance: declined ? 'urgent' : funded ? 'high' : 'normal',
    };
}

/** Super Admin assigned an application to a specific Underwriter — single-recipient in-app alert. */
export async function notifyAdminAssignedApplicationToUnderwriter(args: {
    application: ApplicationNotificationRecord;
    recipientId: string;
    actorId?: string | null;
    actorName?: string | null;
}): Promise<void> {
    const app = args.application;
    const recipientId = String(args.recipientId || '').trim();
    if (!app?.id || !recipientId) return;

    const appNum = app.applicationId ?? '';
    const client = clientNameOf(app);
    const appRef = appNum ? ` #${appNum}` : '';
    const actor = String(args.actorName || '').trim();

    await createAndPushNotifications(
        [{ id: recipientId, email: null, name: '' }],
        {
            title: 'Admin Sent a Application To you',
            message: actor
                ? `${actor} assigned application${appRef} for ${client} to you.`
                : `An admin assigned application${appRef} for ${client} to you.`,
            type: 'application_update',
            applicationId: app.id,
            createdById: args.actorId ? String(args.actorId) : null,
            importance: 'high',
        },
        app,
    );
}

/**
 * Underwriter sent a pre-decision deal back to the scrubber for correction.
 * Goes to that one scrubber only; the deal is already back in their Claimed list.
 */
export async function notifyUnderwriterReturnedApplicationToScrubber(args: {
    application: ApplicationNotificationRecord;
    recipientId: string;
    actorId?: string | null;
    actorName?: string | null;
    reasonSummary?: string | null;
}): Promise<void> {
    const app = args.application;
    const recipientId = String(args.recipientId || '').trim();
    if (!app?.id || !recipientId) return;

    const appNum = app.applicationId ?? '';
    const client = clientNameOf(app);
    const appRef = appNum ? ` #${appNum}` : '';
    const actor = String(args.actorName || '').trim() || 'The Underwriter';
    const reason = String(args.reasonSummary || '').trim();

    // Super Admin is always notified alongside the scrubber; createAndPushNotifications
    // drops the actor, so a Super Admin doing this is not notified of their own action.
    const superAdmins = await prisma.user.findMany({
        where: { role: 'SUPER_ADMIN', isActive: true },
        select: { id: true, email: true, firstName: true, lastName: true },
    });

    await createAndPushNotifications(
        [
            { id: recipientId, email: null, name: '' },
            ...superAdmins.map((u) => ({
                id: u.id,
                email: u.email ?? null,
                name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
            })),
        ],
        {
            title: 'Underwriter sent a deal back for correction',
            message: reason
                ? `${actor} sent application${appRef} for ${client} back for correction. Reason: ${reason}`
                : `${actor} sent application${appRef} for ${client} back for correction.`,
            type: 'application_update',
            applicationId: app.id,
            createdById: args.actorId ? String(args.actorId) : null,
            importance: 'high',
        },
        app,
    );
}

/** Fire-and-forget wrapper — never throws to callers. */
export function scheduleApplicationStageNotification(ctx: StageNotificationContext): void {
    setImmediate(() => {
        void notifyApplicationStageChange(ctx).catch((err) => {
            console.error('[stageNotification] failed:', err);
        });
    });
}

export async function notifyApplicationStageChange(ctx: StageNotificationContext): Promise<void> {
    const app = ctx.application;
    if (!app?.id) return;

    if (ctx.transitionAction === 'APPROVED') return;

    const newQueue = String(app.currentQueue ?? '').trim();
    const newState = app.currentState ?? null;
    const prevQueue = ctx.previousQueue ?? null;
    const prevState = ctx.previousState ?? null;

    if (
        ctx.transitionAction !== 'CREATED' &&
        normalizeToken(prevQueue) === normalizeToken(newQueue) &&
        normalizeToken(prevState) === normalizeToken(newState)
    ) {
        return;
    }

    const copy = buildDefaultCopy(ctx);
    const title = ctx.titleOverride ?? copy.title;
    const message = ctx.messageOverride ?? copy.message;
    const type = ctx.type ?? copy.type;
    const importance = ctx.importance ?? copy.importance;

    const recipients = await resolveStageRecipients(
        app,
        newQueue,
        newState,
        ctx.transitionAction,
    );

    await createAndPushNotifications(
        recipients,
        {
            title,
            message,
            type,
            applicationId: app.id,
            createdById: ctx.actorId ? String(ctx.actorId) : null,
            importance,
        },
        app,
        { includeActor: ctx.transitionAction === 'CREATED' },
    );
}

export async function notifyApplicationRejected(args: {
    application: ApplicationNotificationRecord;
    actorId?: string | null;
    reason: string;
    extraRecipientIds?: string[];
}): Promise<void> {
    const app = args.application;
    const appNum = app.applicationId ?? 'N/A';
    const client = clientNameOf(app);
    const title = `Application #${appNum} rejected`;
    const message = `Application #${appNum} for ${client} has been rejected. Reason: ${args.reason}`;

    const roleRecipients = await resolveStageRecipients(
        app,
        String(app.currentQueue ?? 'Declined'),
        app.currentState,
    );
    const extra: RecipientUser[] = (args.extraRecipientIds ?? []).map((id) => ({
        id: String(id),
        email: null,
        name: '',
    }));

    await createAndPushNotifications(
        [...roleRecipients, ...extra],
        {
            title,
            message,
            type: 'application_rejected',
            applicationId: app.id,
            createdById: args.actorId ? String(args.actorId) : null,
            importance: 'urgent',
        },
        app,
    );
}

/** Super Admin completed final funding-call approval — alert Operations to proceed with disbursement. */
export async function notifyOperationsFundingCallApprovedForDisbursement(args: {
    application: ApplicationNotificationRecord;
    actorId?: string | null;
    actorName?: string | null;
}): Promise<void> {
    const app = args.application;
    if (!app?.id) return;

    const appNum = app.applicationId ?? '';
    const client = clientNameOf(app);
    const appRef = appNum ? ` #${appNum}` : '';
    const actor = String(args.actorName || '').trim();

    const opsUsers = await findActiveUsersByRoles(['OPERATIONS']);

    await createAndPushNotifications(
        opsUsers,
        {
            title: 'Funding call approved — ready for disbursement',
            message: actor
                ? `${actor} completed the final funding call approval for application${appRef} (${client}). You can continue with disbursement.`
                : `Super Admin completed the final funding call approval for application${appRef} (${client}). You can continue with disbursement.`,
            type: 'application_update',
            applicationId: app.id,
            createdById: args.actorId ? String(args.actorId) : null,
            importance: 'high',
        },
        app,
    );
}
