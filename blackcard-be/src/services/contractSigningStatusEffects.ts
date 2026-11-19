import type { Role } from '@prisma/client';
import prisma from '../config/prismaClient';
import { emitToUser } from '../socket';
import { deriveCategory, deriveActionUrl } from './notificationCategory';
import {
  createApplicationActivityLog,
  type ApplicationActivityActionType,
} from './applicationActivityLogService';

const CRM_INTERNAL_NOTIFY_ROLES: Role[] = [
  'ADMIN',
  'SUPER_ADMIN',
  'OPERATIONS',
  'SCRUBBING',
  'UNDERWRITER',
  'ACCOUNTANT',
  'ACCOUNTS',
];

const TRACKED_STAGES = new Set([
  'sent',
  'viewed',
  'signed',
  'completed',
  'declined',
  'revoked',
  'expired',
]);

const STAGE_LABEL: Record<string, string> = {
  sent: 'Sent',
  viewed: 'Viewed',
  signed: 'Signed',
  completed: 'Completed',
  declined: 'Declined',
  revoked: 'Voided',
  expired: 'Expired',
};

const STAGE_SUBTITLE: Record<string, string> = {
  sent: 'Envelope sent',
  viewed: 'Signer opened',
  signed: 'Signature captured',
  completed: 'All done',
  declined: 'Signer declined',
  revoked: 'Envelope voided',
  expired: 'Envelope expired',
};

/** Socket event for open CRM screens to refresh contract/ACH status instantly (no DocuSign poll). */
export const CONTRACT_SIGNING_STATUS_SOCKET_EVENT = 'contract:signing-status';

export type ContractSigningStatusRealtimePayload = {
  applicationId: string;
  envelopeId?: string | null;
  status: string;
  priorStatus?: string | null;
  provider?: 'docusign' | 'boldsign';
  envelopeKind?: string | null;
};

interface RecipientUser {
  id: string;
}

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

function dedupeById(rows: RecipientUser[]): RecipientUser[] {
  const seen = new Set<string>();
  const out: RecipientUser[] = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

async function resolveRecipients(applicationId: string): Promise<RecipientUser[]> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      referringAgentId: true,
      salesRepresentativeId: true,
      createdById: true,
    },
  });
  if (!app) return [];

  const stakeholderIds = [app.referringAgentId, app.salesRepresentativeId, app.createdById].filter(
    Boolean,
  ) as string[];

  const internalUsers = await prisma.user.findMany({
    where: {
      role: { in: CRM_INTERNAL_NOTIFY_ROLES },
      isActive: true,
    },
    select: { id: true },
  });

  return dedupeById([
    ...stakeholderIds.map((id) => ({ id: String(id) })),
    ...internalUsers.map((u) => ({ id: String(u.id) })),
  ]);
}

async function createAndPushNotifications(
  recipients: RecipientUser[],
  base: {
    title: string;
    message: string;
    type: string;
    applicationId: string;
    createdById: string | null;
  },
  meta: Record<string, unknown>,
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
      }),
    ),
  );

  for (let i = 0; i < created.length; i += 1) {
    const result = created[i];
    const recipient = recipients[i];
    if (result.status === 'rejected') {
      console.error('[contractSigningStatusEffects] notification create failed:', {
        recipientId: recipient?.id,
        error: (result as PromiseRejectedResult).reason,
      });
      continue;
    }
    emitToUser(recipient.id, 'notification:new', {
      notification: toApiNotification(result.value),
      meta,
    });
  }
}

/**
 * Push signing-status to CRM users watching this deal so the UI can refresh from
 * DB instantly after a DocuSign Connect webhook (no envelope polling required).
 */
export async function emitContractSigningStatusRealtime(
  input: ContractSigningStatusRealtimePayload,
): Promise<void> {
  const applicationId = String(input.applicationId || '').trim();
  const status = String(input.status || '').trim().toLowerCase();
  if (!applicationId || !status) return;

  const payload: ContractSigningStatusRealtimePayload = {
    applicationId,
    envelopeId: input.envelopeId ? String(input.envelopeId) : null,
    status,
    priorStatus: input.priorStatus ? String(input.priorStatus).toLowerCase() : null,
    provider: input.provider ?? 'docusign',
    envelopeKind: input.envelopeKind ?? null,
  };

  try {
    const recipients = await resolveRecipients(applicationId);
    for (const recipient of recipients) {
      emitToUser(recipient.id, CONTRACT_SIGNING_STATUS_SOCKET_EVENT, payload);
    }
  } catch (err) {
    console.error('[contractSigningStatusEffects] realtime emit failed:', err);
  }
}

export interface ContractSigningStatusTransitionInput {
  applicationId: string;
  priorStatus: string | null | undefined;
  newStatus: string;
  envelopeId?: string;
  documentName?: string;
  provider?: 'docusign' | 'boldsign';
}

/**
 * When DocuSign / BoldSign advances envelope status (sent → viewed → signed → completed),
 * fan out in-app notifications (realtime + inbox) and append an application audit log entry.
 */
export async function handleContractSigningStatusTransition(
  input: ContractSigningStatusTransitionInput,
): Promise<void> {
  const applicationId = String(input.applicationId || '').trim();
  const prior = input.priorStatus ? String(input.priorStatus).trim().toLowerCase() : null;
  const next = String(input.newStatus || '').trim().toLowerCase();

  if (!applicationId || !next || prior === next || !TRACKED_STAGES.has(next)) {
    return;
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      applicationId: true,
      currentQueue: true,
      currentState: true,
    },
  });
  if (!application) return;

  const appNumber =
    application.applicationId != null && String(application.applicationId).trim() !== ''
      ? String(application.applicationId)
      : applicationId;

  const docLabel = String(input.documentName || 'Contract').trim() || 'Contract';
  const stageLabel = STAGE_LABEL[next] ?? next;
  const stageSubtitle = STAGE_SUBTITLE[next] ?? next;
  const providerLabel =
    input.provider === 'boldsign' ? 'BoldSign' : input.provider === 'docusign' ? 'DocuSign' : 'E-sign';

  const title = `Contract ${stageLabel}`;
  const message = `Application #${appNumber} — ${docLabel}: ${stageSubtitle} (${stageLabel}).`;

  const actionUrl =
    appNumber && appNumber !== applicationId
      ? `/application-details/${appNumber}`
      : `/application-details/${applicationId}`;

  try {
    await emitContractSigningStatusRealtime({
      applicationId,
      envelopeId: input.envelopeId,
      status: next,
      priorStatus: prior,
      provider: input.provider ?? 'docusign',
    });
  } catch (err) {
    console.error('[contractSigningStatusEffects] realtime emit failed:', err);
  }

  try {
    const recipients = await resolveRecipients(applicationId);
    await createAndPushNotifications(
      recipients,
      {
        title,
        message,
        type: 'contract_signing',
        applicationId,
        createdById: null,
      },
      {
        realtimeKind: 'contract_signing_status',
        actionUrl,
        applicationId,
        envelopeId: input.envelopeId ?? null,
        status: next,
        priorStatus: prior,
      },
    );
  } catch (err) {
    console.error('[contractSigningStatusEffects] notifications failed:', err);
  }

  try {
    const priorSigning = prior ? STAGE_LABEL[prior] ?? prior : '—';
    const queueState = `${application.currentQueue ?? ''} / ${application.currentState ?? ''}`;
    await createApplicationActivityLog({
      applicationId,
      user: null,
      actionType: 'CONTRACT_SIGNING_STATUS' as ApplicationActivityActionType,
      actionDescription: `${providerLabel} contract signing status: ${stageLabel} — ${stageSubtitle} (${docLabel}).`,
      previousStatus: priorSigning,
      currentStatus: queueState.trim() || stageLabel,
      metadata: {
        signingStage: next,
        signingStageLabel: stageLabel,
        signingStageSubtitle: stageSubtitle,
        documentName: docLabel,
        envelopeId: input.envelopeId ?? null,
        provider: input.provider ?? null,
        priorEnvelopeStatus: prior,
      },
    });
  } catch (err) {
    console.error('[contractSigningStatusEffects] activity log failed:', err);
  }
}
