import type { ApplicationActivityLog, User } from '@prisma/client';
import { sanitizeAuditDescription } from '../utils/auditDescription';

type LogWithUser = ApplicationActivityLog & {
  User?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'> | null;
};

function metadataAsObject(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

const PAYMENT_MAIL_ACTIONS = new Set([
  'PAYMENT_MAIL_SENT',
  'PAYMENT_MAIL_FAILED',
  'PAYMENT_MAIL_QUEUED',
]);

function isApprovalEmailLog(log: LogWithUser, meta: Record<string, unknown>): boolean {
  return (
    log.actionType === 'APPROVED' &&
    (Boolean(meta.emailSentTo) ||
      meta.template === 'approval' ||
      meta.template === 'application-approved' ||
      meta.template === 'offer-updated')
  );
}

function isRejectionEmailLog(log: LogWithUser, meta: Record<string, unknown>): boolean {
  return (
    log.actionType === 'APPLICATION_REJECTED' &&
    (meta.template === 'rejection' || Boolean(meta.outboundCommunicationId))
  );
}

function isDocumentRequestEmailLog(log: LogWithUser, meta: Record<string, unknown>): boolean {
  return (
    log.actionType === 'DOCUMENT_REQUESTED' &&
    (meta.template === 'document-request' || Boolean(meta.outboundCommunicationId))
  );
}

export function mapApplicationActivityLogEntry(log: LogWithUser) {
  const meta = metadataAsObject(log.metadata);
  const user = log.User;
  const approvalEmail = isApprovalEmailLog(log, meta);
  const rejectionEmail = isRejectionEmailLog(log, meta);
  const documentRequestEmail = isDocumentRequestEmailLog(log, meta);
  const category = String(
    meta.category ??
      (PAYMENT_MAIL_ACTIONS.has(log.actionType) ||
      approvalEmail ||
      rejectionEmail ||
      documentRequestEmail
        ? 'COMMUNICATION'
        : 'GENERAL'),
  );
  const isCommunication =
    category === 'COMMUNICATION' ||
    PAYMENT_MAIL_ACTIONS.has(log.actionType) ||
    approvalEmail ||
    rejectionEmail ||
    documentRequestEmail;

  return {
    id: log.id,
    applicationId: log.applicationId,
    userId: log.userId,
    userName: user
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
      : null,
    userRole: log.userRole,
    actionType: log.actionType,
    action: isCommunication ? 'SEND' : log.actionType,
    actionDescription: sanitizeAuditDescription(log.actionDescription),
    previousStatus: log.previousStatus,
    currentStatus: log.currentStatus,
    metadata: log.metadata,
    category,
    channel:
      (meta.channel as string | undefined) ??
      (approvalEmail ? 'EMAIL' : PAYMENT_MAIL_ACTIONS.has(log.actionType) ? 'TEMPLATE' : null),
    recipientName: (meta.recipientName ??
      meta.recipient ??
      (Array.isArray(meta.emailSentTo) ? meta.emailSentTo.join(', ') : meta.emailSentTo)) as
      | string
      | null,
    recipientType: (meta.recipientType as string | undefined) ?? (approvalEmail ? 'ISO' : null),
    templateName: (meta.templateName ??
      (meta.template === 'offer-updated'
        ? 'Update offer template'
        : meta.template === 'approval' || meta.template === 'application-approved'
          ? 'Application approved template'
          : meta.template === 'rejection'
            ? 'Application declined template'
            : meta.template === 'document-request'
              ? 'Document request template'
              : null)) as string | null,
    subject: meta.subject as string | null,
    viewType: meta.viewType as string | null,
    paymentMailLogId: meta.paymentMailLogId as string | null,
    outboundCommunicationId: meta.outboundCommunicationId as string | null,
    canView: Boolean(
      meta.paymentMailLogId ||
        meta.outboundCommunicationId ||
        approvalEmail ||
        rejectionEmail ||
        documentRequestEmail,
    ),
    createdAt: log.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
