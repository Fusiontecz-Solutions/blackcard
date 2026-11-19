import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import type { AuthenticatedUser } from './applicationService';
import {
  createApplicationActivityLog,
  type ApplicationActivityActionType,
} from './applicationActivityLogService';
import {
  createOutboundCommunication,
  inferRecipientTypeFromCategory,
  type CommunicationChannel,
  type CommunicationRecipientType,
  markActivityLogged,
} from './outboundCommunicationService';
export type AuditCategory = 'GENERAL' | 'COMMUNICATION' | 'AUTH';

export interface RecordCommunicationAuditInput {
  /**
   * Optional explicit OutboundCommunication id. Pre-generate this id, pass it
   * to the mailer as the SendGrid `trackingId`, then pass the same value here so
   * the Event Webhook can correlate delivery/open/click events back to this row.
   */
  outboundCommunicationId?: string;
  applicationId?: string | null;
  channel: CommunicationChannel;
  recipientType?: CommunicationRecipientType | string | null;
  recipient: string;
  subject?: string | null;
  body?: string | null;
  templateName?: string | null;
  documentName?: string | null;
  contractId?: string | null;
  paymentMailLogId?: string;
  actionType?: ApplicationActivityActionType;
  actionDescription: string;
  currentStatus?: string | null;
  user?: AuthenticatedUser | null;
  metadata?: Record<string, unknown>;
}

export async function recordCommunicationAudit(
  req: Request | null,
  input: RecordCommunicationAuditInput,
) {
  const auditUser =
    input.user ??
    (req?.user ? ({ id: req.user.id, role: req.user.role } as AuthenticatedUser) : null);

  const outbound = await createOutboundCommunication({
    id: input.outboundCommunicationId,
    applicationId: input.applicationId,
    channel: input.channel,
    recipientType: input.recipientType,
    recipient: input.recipient,
    subject: input.subject,
    body: input.body,
    templateName: input.templateName,
    documentName: input.documentName,
    contractId: input.contractId,
    user: auditUser,
    req,
    metadata: input.metadata,
  });

  const actionType: ApplicationActivityActionType =
    input.actionType ??
    (input.channel === 'DOCUMENT' ? 'DOCUMENT_REQUESTED' : 'PAYMENT_MAIL_SENT');

  await createApplicationActivityLog({
    applicationId: input.applicationId ?? null,
    user: auditUser,
    req,
    actionType,
    actionDescription: input.actionDescription,
    previousStatus: null,
    currentStatus: input.currentStatus ?? null,
    metadata: {
      category: 'COMMUNICATION',
      channel: input.channel,
      recipientType: input.recipientType ?? 'OTHER',
      recipientName: input.recipient,
      subject: input.subject,
      templateName: input.templateName,
      documentName: input.documentName,
      paymentMailLogId: input.paymentMailLogId,
      outboundCommunicationId: outbound.id,
      viewType: input.paymentMailLogId ? 'payment_mail' : 'outbound_communication',
      ...input.metadata,
    },
  });

  if (req) markActivityLogged(req);

  return outbound;
}

export async function recordAuthAudit(
  req: Request,
  action: 'LOGIN' | 'LOGOUT',
  description: string,
  userOverride?: AuthenticatedUser | null,
) {
  const user =
    userOverride ??
    (req.user ? ({ id: req.user.id, role: req.user.role } as AuthenticatedUser) : null);

  await createApplicationActivityLog({
    applicationId: null,
    user,
    req,
    actionType: action === 'LOGIN' ? 'APPLICATION_UPDATED' : 'APPLICATION_UPDATED',
    actionDescription: description,
    previousStatus: null,
    currentStatus: null,
    metadata: {
      category: 'AUTH',
      action,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    },
  });
  markActivityLogged(req);
}

export async function recordGenericAudit(
  req: Request,
  input: {
    action: string;
    entity?: string;
    entityId?: string;
    description: string;
    applicationId?: string | null;
    currentStatus?: string | null;
  },
) {
  const auditUser = req.user
    ? ({ id: req.user.id, role: req.user.role } as AuthenticatedUser)
    : null;

  await createApplicationActivityLog({
    applicationId: input.applicationId ?? extractApplicationIdFromPath(req.originalUrl || req.url),
    user: auditUser,
    req,
    actionType: 'APPLICATION_UPDATED',
    actionDescription: input.description,
    previousStatus: null,
    currentStatus: input.currentStatus ?? null,
    metadata: {
      category: 'GENERAL',
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      method: req.method,
      path: req.originalUrl?.split('?')[0],
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    },
  });
  markActivityLogged(req);
}

/** UUID application id from paths like /api/v1/applications/:id/... */
function extractApplicationIdFromPath(path: string | undefined): string | null {
  if (!path) return null;
  const match = path.match(/\/applications\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match?.[1] ?? null;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return req.socket?.remoteAddress ?? null;
}

function metadataAsObject(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function extractAttachmentNamesFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const meta = metadata as Record<string, unknown>;
  const names: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) names.push(value.trim());
  };

  push(meta.documentName);
  if (meta.hasLetterPdf === true) names.push('Letter PDF');

  if (Array.isArray(meta.attachments)) {
    for (const item of meta.attachments) {
      if (typeof item === 'string') push(item);
      else if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        push(row.filename);
        push(row.name);
        push(row.originalName);
      }
    }
  }

  return [...new Set(names)];
}

export interface GetSystemActivityLogsParams {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  category?: string;
  channel?: string;
  recipientType?: string;
  entity?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

export async function getSystemActivityLogs(params: GetSystemActivityLogsParams) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const and: Prisma.ApplicationActivityLogWhereInput[] = [];

  // Global audit: system-wide only — deal emails/templates live on each application's Activity log.
  and.push({
    applicationId: null,
  });

  if (params.category && params.category !== 'all') {
    and.push({
      metadata: {
        path: ['category'],
        equals: params.category.toUpperCase(),
      },
    });
  }

  if (params.channel && params.channel !== 'all') {
    and.push({
      metadata: {
        path: ['channel'],
        equals: params.channel.toUpperCase(),
      },
    });
  }

  if (params.recipientType && params.recipientType !== 'all') {
    and.push({
      metadata: {
        path: ['recipientType'],
        equals: params.recipientType.toUpperCase(),
      },
    });
  }

  if (params.userId) {
    and.push({ userId: params.userId });
  }

  if (params.startDate || params.endDate) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (params.startDate) createdAt.gte = new Date(params.startDate);
    if (params.endDate) createdAt.lte = new Date(params.endDate);
    and.push({ createdAt });
  }

  if (params.search?.trim()) {
    const q = params.search.trim();
    and.push({
      OR: [
        { actionDescription: { contains: q, mode: 'insensitive' } },
        { actionType: { contains: q, mode: 'insensitive' } },
        { userRole: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  if (params.action && params.action !== 'all') {
    const actionUpper = params.action.toUpperCase();
    if (['LOGIN', 'LOGOUT', 'SEND'].includes(actionUpper)) {
      and.push({
        OR: [
          { actionType: { contains: actionUpper, mode: 'insensitive' } },
          { metadata: { path: ['action'], equals: actionUpper } },
        ],
      });
    } else {
      and.push({
        OR: [
          { actionType: { contains: actionUpper, mode: 'insensitive' } },
          { metadata: { path: ['action'], equals: actionUpper } },
        ],
      });
    }
  }

  const where: Prisma.ApplicationActivityLogWhereInput =
    and.length > 0 ? { AND: and } : {};

  const [total, logs] = await Promise.all([
    prisma.applicationActivityLog.count({ where }),
    prisma.applicationActivityLog.findMany({
      where,
      include: {
        User: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        Application: {
          select: {
            id: true,
            applicationId: true,
            dealDisplayName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  const data = logs.map((log) => {
    const meta = metadataAsObject(log.metadata);
    const user = log.User;
    const category = String(meta.category ?? 'GENERAL');
    const isCommunication = category === 'COMMUNICATION';
    const action =
      category === 'AUTH'
        ? String(meta.action ?? 'LOGIN')
        : isCommunication
          ? 'SEND'
          : String(meta.action ?? log.actionType);

    return {
      _id: log.id,
      id: log.id,
      user: user
        ? {
            _id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
          }
        : null,
      action,
      entity: String(meta.entity ?? log.Application?.dealDisplayName ?? 'Application'),
      entityId: String(meta.entityId ?? log.applicationId ?? ''),
      applicationId: log.applicationId,
      applicationNumericId: log.Application?.applicationId ?? null,
      description: log.actionDescription,
      category,
      channel: meta.channel ?? null,
      recipientName: meta.recipientName ?? meta.recipient ?? null,
      recipientType: meta.recipientType ?? null,
      templateName: meta.templateName ?? null,
      subject: meta.subject ?? null,
      viewType: meta.viewType ?? null,
      paymentMailLogId: meta.paymentMailLogId ?? null,
      outboundCommunicationId: meta.outboundCommunicationId ?? null,
      ipAddress: meta.ipAddress ?? null,
      method: meta.method ?? null,
      path: meta.path ?? null,
      statusCode: meta.statusCode ?? null,
      createdAt: log.createdAt?.toISOString() ?? new Date().toISOString(),
      canView: Boolean(
        meta.paymentMailLogId || meta.outboundCommunicationId || meta.viewType,
      ),
    };
  });

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function getSystemActivityLogContent(logId: string) {
  const log = await prisma.applicationActivityLog.findUnique({
    where: { id: logId },
    include: {
      User: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      },
    },
  });

  if (!log) return null;

  const meta = metadataAsObject(log.metadata);

  if (
    log.actionType === 'APPROVED' &&
    meta.emailSentTo &&
    !meta.paymentMailLogId &&
    !meta.outboundCommunicationId
  ) {
    const recipients = Array.isArray(meta.emailSentTo)
      ? meta.emailSentTo.join(', ')
      : String(meta.emailSentTo);
    const isOfferUpdate = meta.template === 'offer-updated' || meta.resend === true;
    return {
      viewType: 'approval_email_legacy',
      channel: 'EMAIL',
      recipient: recipients,
      recipientType: 'ISO',
      templateName: isOfferUpdate ? 'Update offer template' : 'Application approved template',
      subject: isOfferUpdate
        ? 'Your Offer Values Have Been Updated'
        : 'Your Application Has Been Approved',
      body: null,
      note: 'This send was logged before full email archiving. New sends include the full message below.',
      createdAt: log.createdAt?.toISOString(),
    };
  }

  if (meta.paymentMailLogId) {
    const mail = await prisma.paymentMailLog.findUnique({
      where: { id: String(meta.paymentMailLogId) },
    });
    if (mail) {
      const attachments = extractAttachmentNamesFromMetadata(meta);
      if (mail.templateName?.trim()) attachments.unshift(mail.templateName.trim());

      return {
        viewType: 'payment_mail',
        channel: 'TEMPLATE',
        recipient: mail.recipient,
        recipientType: inferRecipientTypeFromCategory(mail.category),
        templateName: mail.templateName,
        category: mail.category,
        subject: mail.subject,
        body: mail.body,
        status: (meta.delivery as { status?: string } | undefined)?.status ?? mail.status,
        applicationId: mail.applicationId,
        attachments: attachments.length ? [...new Set(attachments)] : undefined,
        delivery: meta.delivery as Record<string, unknown> | undefined,
        createdAt: mail.createdAt?.toISOString(),
      };
    }
  }

  if (meta.outboundCommunicationId) {
    const outbound = await prisma.outbound_communications.findUnique({
      where: { id: String(meta.outboundCommunicationId) },
    });
    if (outbound) {
      const outboundMeta = metadataAsObject(outbound.metadata);
      const tracking =
        outboundMeta.tracking && typeof outboundMeta.tracking === 'object'
          ? (outboundMeta.tracking as Record<string, unknown>)
          : null;
      const attachments = extractAttachmentNamesFromMetadata(meta);
      if (outbound.documentName) attachments.push(String(outbound.documentName));

      return {
        viewType: 'outbound_communication',
        channel: outbound.channel,
        recipient: outbound.recipient,
        recipientType: outbound.recipientType,
        templateName: outbound.templateName,
        documentName: outbound.documentName,
        subject: outbound.subject,
        body: outbound.body,
        status: outbound.status ?? (tracking?.status as string | undefined),
        applicationId: outbound.applicationId,
        contractId: outbound.contractId,
        attachments: attachments.length ? [...new Set(attachments)] : undefined,
        delivery: tracking
          ? {
              status: tracking.status as string | undefined,
              deliveredAt: tracking.deliveredAt as string | undefined,
              openedAt: tracking.openedAt as string | undefined,
              clickedAt: tracking.clickedAt as string | undefined,
              bouncedAt: tracking.bouncedAt as string | undefined,
              openCount: tracking.openCount as number | undefined,
              clickCount: tracking.clickCount as number | undefined,
              bounceReason: tracking.bounceReason as string | undefined,
              lastEvent: tracking.lastEvent as string | undefined,
              lastEventAt: tracking.lastEventAt as string | undefined,
            }
          : (meta.delivery as Record<string, unknown> | undefined),
        createdAt: outbound.createdAt.toISOString(),
      };
    }
  }

  return {
    viewType: 'activity_only',
    description: log.actionDescription,
    metadata: meta,
    createdAt: log.createdAt?.toISOString(),
  };
}
