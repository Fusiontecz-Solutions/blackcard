import prisma from '../config/prismaClient';
import { logDealEmail } from './dealMailLog';
import { sendApplicationApprovalEmail, sendOperationsIsoApprovalAlertEmail } from './emailService';
import {
    buildPublicApprovalPortalUrl,
    resolveCrmFrontendBaseUrl,
} from '../utils/crmFrontendUrl';
import { createPublicPortalToken } from './publicPortalTokenService';
import { emitToUser } from '../socket';
import { deriveCategory, deriveActionUrl } from './notificationCategory';
// Type-only to avoid a runtime cycle (applicationApprovalService -> queue -> worker -> here).
import type { ApprovalSideEffectPayload } from './business/applicationApprovalService';

/* ============================================================================
 * Application approval side-effects
 * ----------------------------------------------------------------------------
 * Runs OUT-OF-BAND from the HTTP request that triggered the approval. May be
 * invoked by:
 *   1. The BullMQ approval worker (preferred — durable, retried, scalable).
 *   2. `setImmediate(...)` fallback inside `applicationApprovalService` when
 *      Redis is not configured.
 *
 * Keep this module:
 *   - Idempotent: re-running on retry must not flood users with duplicate
 *     emails. We skip if the application is no longer Approved (rolled back)
 *     or if the actor matches a recipient (no self-notify).
 *   - Self-contained: every external call is wrapped — a single failing email
 *     never breaks the whole fan-out.
 *   - Observable: every branch logs context so production triage works.
 * ==========================================================================*/

const CRM_INTERNAL_NOTIFY_ROLES = [
    'ADMIN',
    'SUPER_ADMIN',
    'OPERATIONS',
    'SCRUBBING',
    'UNDERWRITER',
    'ACCOUNTANT',
    'ACCOUNTS',
] as const;

interface RecipientUser {
    id: string;
    email: string | null;
    name: string;
}

const dedupeById = (rows: RecipientUser[]): RecipientUser[] => {
    const seen = new Set<string>();
    const out: RecipientUser[] = [];
    for (const row of rows) {
        if (!row.id) continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
    }
    return out;
};

/**
 * Notification include shape matching {@link mapNotificationToApi} in the
 * notification controller — keeps the realtime payload identical to what the
 * REST inbox returns so the frontend reducer can prepend without divergence.
 */
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

/** Mirror of the API shape returned by GET /notifications (see notificationController.mapNotificationToApi). */
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

interface RealtimeMeta {
    /** Tag emitted alongside the notification so clients can render an in-app toast / CTA. */
    realtimeKind?: 'iso_approval_for_operations' | 'application_approved';
    /** Optional deep-link the frontend can use as a click-through. */
    actionUrl?: string;
}

/**
 * Persist a notification per recipient and immediately push it down the
 * recipient's socket room so the bell / inbox updates with zero latency.
 *
 * Uses N parallel `create({ include })` calls instead of `createMany` so the
 * full populated record (with relations) comes back ready to emit. N is tiny
 * (active operations / underwriters / etc.) so the extra round-trips are
 * negligible — and this whole function runs out of band in the BullMQ worker.
 */
async function createAndPushNotifications(
    recipients: RecipientUser[],
    base: {
        title: string;
        message: string;
        type: string;
        applicationId: string;
        createdById: string | null;
    },
    meta: RealtimeMeta = {}
): Promise<void> {
    if (!recipients.length) return;

    const created = await Promise.allSettled(
        recipients.map((r) =>
            prisma.notification.create({
                data: {
                    title: base.title,
                    message: base.message,
                    type: base.type,
                    category: deriveCategory(base.type),
                    recipientId: r.id,
                    applicationId: base.applicationId,
                    createdById: base.createdById,
                },
                include: NOTIFICATION_INCLUDE,
            })
        )
    );

    for (let i = 0; i < created.length; i += 1) {
        const result = created[i];
        const recipient = recipients[i];
        if (result.status === 'rejected') {
            console.error('[approvalSideEffects] notification create failed:', {
                recipientId: recipient?.id,
                error: (result as PromiseRejectedResult).reason,
            });
            continue;
        }

        const apiPayload = toApiNotification(result.value);
        emitToUser(recipient.id, 'notification:new', {
            notification: apiPayload,
            meta,
        });
    }
}

export async function processApplicationApprovalSideEffects(
    payload: ApprovalSideEffectPayload
): Promise<void> {
    const { applicationId } = payload;

    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
            client: true,
            iso: true,
            referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
            salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
    });

    if (!application) {
        console.warn('[approvalSideEffects] application missing — skipping fan-out:', applicationId);
        return;
    }

    const normalizeStageToken = (value: string | null | undefined): string =>
        String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/[\s_-]+/g, '');

    const currentQueueToken = normalizeStageToken(application.currentQueue);
    const currentStateToken = normalizeStageToken(application.currentState);
    const isApprovedStage =
        currentQueueToken === 'approved' ||
        currentStateToken === 'approved' ||
        currentQueueToken === 'isoapproved' ||
        currentStateToken === 'isoapproved' ||
        currentQueueToken === 'contractpending' ||
        currentStateToken === 'contractpending';
    if (!isApprovedStage) {
        console.warn('[approvalSideEffects] application no longer Approved — skipping fan-out:', {
            applicationId,
            currentQueue: application.currentQueue,
            currentState: application.currentState,
        });
        return;
    }

    const client = (application as any).client;
    const iso = (application as any).iso;

    const businessName = String(client?.businessName ?? '').trim();
    const ownerName = `${client?.ownerFirstName ?? ''} ${client?.ownerLastName ?? ''}`.trim();
    const clientName = businessName || ownerName || 'Client';
    const actorType = String(payload.actorType ?? '').trim().toUpperCase();
    const isIsoActor = actorType === 'ISO';
    const isoApproverName = String(payload.actorName ?? '').trim() || String(iso?.name ?? '').trim() || 'ISO';
    const applicationNumber =
        application.applicationId != null && String(application.applicationId).trim() !== ''
            ? String(application.applicationId)
            : applicationId;

    /* ----------------------------- Notifications ----------------------------- */
    try {
        const internalUsers = await prisma.user.findMany({
            where: {
                role: { in: CRM_INTERNAL_NOTIFY_ROLES as unknown as any },
                isActive: true,
            },
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
        });

        const operationsRecipients: RecipientUser[] = internalUsers
            .filter((u) => String(u.role || '').toUpperCase() === 'OPERATIONS')
            .map((u) => ({
                id: String(u.id),
                email: u.email ? String(u.email) : null,
                name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
            }));

        const nonOperationsInternalRecipients: RecipientUser[] = internalUsers
            .filter((u) => String(u.role || '').toUpperCase() !== 'OPERATIONS')
            .map((u) => ({
                id: String(u.id),
                email: u.email ? String(u.email) : null,
                name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
            }));

        const directRecipients: RecipientUser[] = [
            (application as any).referringAgent,
            (application as any).salesRepresentative,
            (application as any).createdBy,
        ]
            .filter(Boolean)
            .map((u: any) => ({
                id: String(u.id),
                email: u.email ? String(u.email) : null,
                name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
            }));

        /*
         * ISO-approved branch: ONLY notify Operations users.
         *   - No fan-out to Underwriter / Scrubbing / Admin / Accountant.
         *   - No fan-out to referring agent / sales rep / createdBy.
         * This is the strict requirement when an ISO performs the approval action.
         */
        if (isIsoActor) {
            const operationNotifications = dedupeById(operationsRecipients).filter(
                (r) => r.id !== payload.actorId
            );

            if (operationNotifications.length > 0) {
                await createAndPushNotifications(
                    operationNotifications,
                    {
                        title: `ISO approved application #${applicationNumber}`,
                        message: `ISO approved application #${applicationNumber}. Now you can proceed to generate contract.`,
                        type: 'application_update',
                        applicationId: application.id,
                        createdById: payload.actorId,
                    },
                    { realtimeKind: 'iso_approval_for_operations' }
                );
            }
        } else {
            /*
             * Non-ISO actor (Underwriter / Admin / etc. approving manually):
             * keep the existing broader fan-out so other internal staff and the
             * deal’s direct contacts still see the approval.
             */
            const allRecipients = dedupeById([
                ...directRecipients,
                ...nonOperationsInternalRecipients,
            ]).filter((r) => r.id !== payload.actorId);

            if (allRecipients.length > 0) {
                const actorLabel = (() => {
                    const t = String(payload.actorType ?? '').trim().toUpperCase();
                    if (t === 'CLIENT') return 'Client';
                    if (payload.actorRole) return String(payload.actorRole).toUpperCase().replace(/_/g, ' ');
                    return 'User';
                })();

                const title = `Application #${applicationNumber} approved`;
                const message = `${actorLabel}${
                    payload.actorName ? ` (${payload.actorName})` : ''
                } approved application #${applicationNumber} for ${clientName}.`;

                await createAndPushNotifications(
                    allRecipients,
                    {
                        title,
                        message,
                        type: 'application_update',
                        applicationId: application.id,
                        createdById: payload.actorId,
                    },
                    { realtimeKind: 'application_approved' }
                );
            }
        }
    } catch (notifyErr) {
        console.error('[approvalSideEffects] notification fan-out failed:', notifyErr);
    }

    /* -------------------------------- Email ---------------------------------- */
    try {
        const baseUrl = resolveCrmFrontendBaseUrl() || '';

        let publicApprovalUrl: string | undefined;
        try {
            const token = await createPublicPortalToken(application.id, { expiresInDays: 90 });
            if (token && baseUrl) {
                publicApprovalUrl = buildPublicApprovalPortalUrl(baseUrl, token);
            }
        } catch (tokenErr) {
            console.error('[approvalSideEffects] portal token generation failed:', tokenErr);
        }

        const viewApplicationUrl = publicApprovalUrl;
        const calculateApprovalUrl = publicApprovalUrl;

        const isoEmail = String(iso?.email ?? '').trim();
        const isoName = String(iso?.name ?? '').trim();

        /*
         * When an ISO performs the approval, we do NOT send the regular approval
         * template to anyone (no ISO mailbox, no referring agent, no FUW/UW).
         * Operations are the sole recipients via the dedicated alert email below.
         */
        if (!isIsoActor) {
            const recipients: { to: string; clientName: string }[] = [];
            if (isoEmail) {
                recipients.push({
                    to: isoEmail,
                    clientName: isoName || isoEmail,
                });
            }

            // Internal email confirmation to referring agent (when configured separately from ISO).
            const refAgentEmail = String((application as any).referringAgent?.email ?? '').trim();
            if (refAgentEmail && refAgentEmail.toLowerCase() !== isoEmail.toLowerCase()) {
                recipients.push({
                    to: refAgentEmail,
                    clientName:
                        `${(application as any).referringAgent?.firstName ?? ''} ${
                            (application as any).referringAgent?.lastName ?? ''
                        }`.trim() || refAgentEmail,
                });
            }

            if (recipients.length === 0) {
                console.warn(
                    '[approvalSideEffects] no approval template recipients for non-ISO actor on application',
                    applicationNumber
                );
            } else {
                const results = await Promise.allSettled(
                    recipients.map((r) =>
                        sendApplicationApprovalEmail({
                            to: r.to,
                            clientName: r.clientName,
                            companyName: businessName || clientName,
                            viewApplicationUrl,
                            calculateApprovalUrl,
                            submissionApplication: {
                                note: (application as any).note,
                                createdById: (application as any).createdById,
                                client: (application as any).client,
                            },
                        })
                    )
                );

                const failures = results.filter((r) => r.status === 'rejected');
                if (failures.length > 0) {
                    console.error(
                        '[approvalSideEffects] one or more approval confirmation emails failed:',
                        failures
                    );
                }
                for (const [index, result] of results.entries()) {
                    const sent =
                        result.status === 'fulfilled' &&
                        (result.value as { sent?: boolean } | undefined)?.sent !== false;
                    await logDealEmail({
                        applicationId: (application as any).id,
                        to: recipients[index].to,
                        subject: 'Your Application Has Been Approved',
                        template: 'approval',
                        templateName: 'Application approved template',
                        recipientType: index === 0 && isoEmail ? 'ISO' : 'USER',
                        description: sent
                            ? 'Approval confirmation email sent.'
                            : 'Approval confirmation email failed.',
                        sent,
                        error: result.status === 'rejected' ? result.reason : undefined,
                    });
                }
            }
        }

        if (isIsoActor) {
            const operationsUsers = await prisma.user.findMany({
                where: {
                    role: 'OPERATIONS',
                    isActive: true,
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                },
            });

            const operationEmailRecipients = dedupeById(
                operationsUsers.map((u) => ({
                    id: String(u.id),
                    email: u.email ? String(u.email) : null,
                    name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
                }))
            ).filter((r) => r.id !== payload.actorId && Boolean(r.email));

            if (operationEmailRecipients.length > 0) {
                const operationEmailResults = await Promise.allSettled(
                    operationEmailRecipients.map((recipient) =>
                        sendOperationsIsoApprovalAlertEmail({
                            to: String(recipient.email),
                            operationsName: recipient.name,
                            isoName: isoApproverName,
                            applicationNumber,
                            clientName,
                            viewApplicationUrl,
                        })
                    )
                );

                const operationEmailFailures = operationEmailResults.filter(
                    (result) => result.status === 'rejected'
                );
                for (const [index, result] of operationEmailResults.entries()) {
                    const sent = result.status === 'fulfilled';
                    await logDealEmail({
                        applicationId: (application as any).id,
                        to: String(operationEmailRecipients[index].email),
                        subject: `ISO approved application #${applicationNumber}`,
                        template: 'operations-iso-approval-alert',
                        templateName: 'Operations alert: ISO approved',
                        recipientType: 'USER',
                        description: sent
                            ? 'ISO-approval alert emailed to Operations.'
                            : 'ISO-approval alert email to Operations failed.',
                        sent,
                        error: result.status === 'rejected' ? result.reason : undefined,
                    });
                }
                if (operationEmailFailures.length > 0) {
                    console.error(
                        '[approvalSideEffects] one or more operations ISO-approval alert emails failed:',
                        operationEmailFailures
                    );
                }
            }
        }
    } catch (emailErr) {
        console.error('[approvalSideEffects] email fan-out failed:', emailErr);
    }
}
