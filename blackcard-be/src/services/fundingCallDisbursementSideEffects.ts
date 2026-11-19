import prisma from '../config/prismaClient';
import { logDealEmail } from './dealMailLog';
import { isOutboundSmtpConfigured } from '../config/nodemailer';
import { sendOperationsDisbursementReadyEmail } from './emailService';
import { emitToUser } from '../socket';
import { resolveCrmFrontendBaseUrl } from '../utils/crmFrontendUrl';

export const FUNDING_CALL_DISBURSEMENT_NOTIFICATION_TYPE = 'funding_call_disbursement_ready';

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

export function normalizeFundingCallStatus(value: string | null | undefined): string {
    return String(value ?? '')
        .trim()
        .replace(/[\s_-]+/g, '')
        .toLowerCase();
}

export function isFundingCallStatusCallDone(value: string | null | undefined): boolean {
    const normalized = normalizeFundingCallStatus(value);
    return normalized === 'calldone';
}

export function isFundingCallStatusRejected(value: string | null | undefined): boolean {
    return normalizeFundingCallStatus(value) === 'rejected';
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
        isRead: notification.isRead,
        readAt: notification.readAt,
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

export interface NotifyOperationsDisbursementResult {
    notified: number;
    emailsSent: number;
    recipients: Array<{ id: string; name: string; email: string }>;
    skipped: boolean;
}

/**
 * Notify all active Operations users that funding call is complete and disbursement may proceed.
 */
export async function notifyOperationsDisbursementReady(options: {
    applicationId: string;
    createdById: string | null;
    /** When true, skip if a prior notification of this type already exists for the application. */
    skipIfAlreadyNotified?: boolean;
}): Promise<NotifyOperationsDisbursementResult> {
    const empty: NotifyOperationsDisbursementResult = {
        notified: 0,
        emailsSent: 0,
        recipients: [],
        skipped: false,
    };

    try {
        if (options.skipIfAlreadyNotified !== false) {
            const existing = await prisma.notification.count({
                where: {
                    applicationId: options.applicationId,
                    type: FUNDING_CALL_DISBURSEMENT_NOTIFICATION_TYPE,
                },
            });
            if (existing > 0) {
                return { ...empty, skipped: true };
            }
        }

        const application = await prisma.application.findUnique({
            where: { id: options.applicationId },
            include: { client: true },
        });
        if (!application) return empty;

        const operationsUsers = await prisma.user.findMany({
            where: { role: 'OPERATIONS', isActive: true },
            select: { id: true, firstName: true, lastName: true, email: true },
        });
        if (operationsUsers.length === 0) return empty;

        const clientName =
            (application as any).client?.businessName ||
            `${(application as any).client?.ownerFirstName || ''} ${(application as any).client?.ownerLastName || ''}`.trim() ||
            'Client';
        const appIdNumber = application.applicationId ?? '';
        const appLabel = appIdNumber ? ` #${appIdNumber}` : '';

        const title = `Funding call complete — proceed with disbursement`;
        const message = `Application${appLabel} (${clientName}) has funding call status "Call Done". You may now proceed with disbursement.`;

        const baseUrl = resolveCrmFrontendBaseUrl();
        const routeId =
            application.applicationId != null && String(application.applicationId).trim() !== ''
                ? String(application.applicationId)
                : String(application.id);
        const actionUrl = baseUrl
            ? `${baseUrl.replace(/\/$/, '')}/application-details/${routeId}/disbursement`
            : `/application-details/${routeId}/disbursement`;

        const viewApplicationUrl = baseUrl
            ? `${baseUrl.replace(/\/$/, '')}/application-details/${routeId}/disbursement`
            : undefined;

        let emailsSent = 0;
        const recipients: NotifyOperationsDisbursementResult['recipients'] = [];

        const created = await Promise.allSettled(
            operationsUsers.map((u) =>
                prisma.notification.create({
                    data: {
                        title,
                        message,
                        type: FUNDING_CALL_DISBURSEMENT_NOTIFICATION_TYPE,
                        recipientId: u.id,
                        applicationId: application.id,
                        createdById: options.createdById,
                    },
                    include: NOTIFICATION_INCLUDE,
                }),
            ),
        );

        for (let i = 0; i < created.length; i += 1) {
            const result = created[i];
            const user = operationsUsers[i];
            const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Operations';
            const email = String(user.email || '').trim();
            recipients.push({ id: String(user.id), name, email });

            if (result.status === 'rejected') {
                console.error('[fundingCallDisbursementSideEffects] notification create failed:', {
                    recipientId: user?.id,
                    error: (result as PromiseRejectedResult).reason,
                });
                continue;
            }

            emitToUser(String(user.id), 'notification:new', {
                notification: toApiNotification(result.value),
                meta: {
                    realtimeKind: 'funding_call_disbursement_ready',
                    actionUrl,
                },
            });

            if (email && isOutboundSmtpConfigured()) {
                const sent = await sendOperationsDisbursementReadyEmail({
                    to: email,
                    operationsName: name,
                    applicationNumber: String(appIdNumber || ''),
                    clientName,
                    viewApplicationUrl,
                });
                if (sent) emailsSent += 1;
                await logDealEmail({
                    applicationId: options.applicationId,
                    to: email,
                    subject: `Ready for disbursement: application #${appIdNumber}`,
                    template: 'operations-disbursement-ready',
                    templateName: 'Operations alert: ready for disbursement',
                    recipientType: 'USER',
                    description: sent
                        ? 'Ready-for-disbursement alert emailed to Operations.'
                        : 'Ready-for-disbursement alert email to Operations failed.',
                    sent: Boolean(sent),
                });
            }
        }

        return {
            notified: recipients.length,
            emailsSent,
            recipients,
            skipped: false,
        };
    } catch (err) {
        console.error('[fundingCallDisbursementSideEffects] failed:', err);
        return empty;
    }
}
