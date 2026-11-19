import type { Request } from 'express';
import type { PaymentMailLog, PaymentMailLogStatus } from '@prisma/client';
import prisma from '../config/prismaClient';
import { resolveMailLogDisplayStatus } from './sendgridWebhookService';
import { resolveAuditLogUserId } from '../middleware/authMiddleware';
import type { AuthenticatedUser } from './applicationService';
import { createApplicationActivityLog } from './applicationActivityLogService';
import { inferRecipientTypeFromCategory } from './outboundCommunicationService';

const STATUS_MAP: Record<string, PaymentMailLogStatus> = {
  queued: 'QUEUED',
  sent: 'SENT',
  failed: 'FAILED',
};

export function toPrismaMailLogStatus(status: string): PaymentMailLogStatus | null {
  const key = status.toLowerCase();
  return STATUS_MAP[key] ?? null;
}

export function fromPrismaMailLogStatus(status: PaymentMailLogStatus): 'queued' | 'sent' | 'failed' {
  switch (status) {
    case 'SENT':
      return 'sent';
    case 'FAILED':
      return 'failed';
    default:
      return 'queued';
  }
}

/** Delivery statuses from SendGrid webhooks (stored on linked activity log metadata). */
export type PaymentMailDeliveryStatus =
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'deferred'
  | 'bounced'
  | 'dropped'
  | 'spam'
  | 'unsubscribed'
  | 'failed';

export type PaymentMailLogApiStatus = 'queued' | 'sent' | 'failed' | PaymentMailDeliveryStatus;

export function resolvePaymentMailDisplayStatus(
  prismaStatus: PaymentMailLogStatus,
  deliveryStatus?: string | null,
  delivery?: PaymentMailLogDeliveryMeta | null,
): PaymentMailLogApiStatus {
  const fromTimeline = delivery ? statusFromDeliveryTimeline(delivery) : null;
  const normalized = (fromTimeline ?? deliveryStatus)?.trim().toLowerCase();
  if (normalized && normalized !== 'sent' && normalized !== 'processed') {
    return normalized as PaymentMailLogApiStatus;
  }
  return fromPrismaMailLogStatus(prismaStatus);
}

function statusFromDeliveryTimeline(delivery: PaymentMailLogDeliveryMeta): string {
  return resolveMailLogDisplayStatus({
    status: (delivery.status as 'sent') ?? 'sent',
    statusRank: 0,
    lastEvent: delivery.lastEvent ?? '',
    lastEventAt: delivery.lastEventAt ?? '',
    sentAt: delivery.sentAt,
    deliveredAt: delivery.deliveredAt,
    openedAt: delivery.openedAt,
    clickedAt: delivery.clickedAt,
    bouncedAt: delivery.bouncedAt,
    openCount: delivery.openCount ?? 0,
    clickCount: delivery.clickCount ?? 0,
    processedEventIds: [],
  });
}

export type PaymentMailLogDeliveryMeta = {
  status?: string;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  bouncedAt?: string;
  openCount?: number;
  clickCount?: number;
  bounceReason?: string;
  lastEvent?: string;
  lastEventAt?: string;
  lastClickedUrl?: string;
};

export function formatPaymentMailLogApiRow(
  log: PaymentMailLog,
  opts?: {
    deliveryStatus?: string | null;
    attachments?: string[];
    delivery?: PaymentMailLogDeliveryMeta | null;
  },
) {
  const deliveryStatus = opts?.deliveryStatus ?? null;
  return {
    id: log.id,
    at: log.createdAt?.toISOString() ?? new Date().toISOString(),
    dealKey: log.dealKey,
    applicationId: log.applicationId,
    templateName: log.templateName,
    category: log.category,
    recipient: log.recipient,
    subject: log.subject,
    body: log.body ?? undefined,
    status: resolvePaymentMailDisplayStatus(log.status, deliveryStatus, opts?.delivery ?? null),
    attachments: opts?.attachments?.length ? opts.attachments : undefined,
    delivery: opts?.delivery ?? undefined,
  };
}

function extractAttachmentNamesFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const meta = metadata as Record<string, unknown>;
  const names: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) names.push(value.trim());
  };

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
  if (names.length) return [...new Set(names)];

  push(meta.documentName);
  if (meta.hasLetterPdf === true) {
    const template =
      typeof meta.templateName === 'string'
        ? meta.templateName.trim()
        : typeof meta.documentName === 'string'
          ? meta.documentName.trim()
          : '';
    if (template) {
      return [template.toLowerCase().endsWith('.pdf') ? template : `${template}.pdf`];
    }
    return ['Letter PDF'];
  }

  return [];
}

function deliveryMetaFromOutboundMetadata(metadata: unknown): PaymentMailLogDeliveryMeta | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const tracking = (metadata as Record<string, unknown>).tracking;
  if (!tracking || typeof tracking !== 'object' || Array.isArray(tracking)) return null;
  const t = tracking as Record<string, unknown>;
  const delivery: PaymentMailLogDeliveryMeta = {
    status: typeof t.status === 'string' ? t.status : undefined,
    sentAt: typeof t.sentAt === 'string' ? t.sentAt : undefined,
    deliveredAt: typeof t.deliveredAt === 'string' ? t.deliveredAt : undefined,
    openedAt: typeof t.openedAt === 'string' ? t.openedAt : undefined,
    clickedAt: typeof t.clickedAt === 'string' ? t.clickedAt : undefined,
    bouncedAt: typeof t.bouncedAt === 'string' ? t.bouncedAt : undefined,
    openCount: typeof t.openCount === 'number' ? t.openCount : undefined,
    clickCount: typeof t.clickCount === 'number' ? t.clickCount : undefined,
    bounceReason: typeof t.bounceReason === 'string' ? t.bounceReason : undefined,
    lastEvent: typeof t.lastEvent === 'string' ? t.lastEvent : undefined,
    lastEventAt: typeof t.lastEventAt === 'string' ? t.lastEventAt : undefined,
    lastClickedUrl: typeof t.lastClickedUrl === 'string' ? t.lastClickedUrl : undefined,
  };
  return delivery.sentAt || delivery.deliveredAt || delivery.status ? delivery : null;
}

function deliveryTimelineRank(delivery: PaymentMailLogDeliveryMeta): number {
  if (delivery.clickedAt) return 4;
  if (delivery.openedAt || (delivery.openCount ?? 0) > 0) return 3;
  if (delivery.deliveredAt) return 2;
  if (delivery.sentAt) return 1;
  return 0;
}

function mergeDeliveryMeta(
  activityDelivery: PaymentMailLogDeliveryMeta | null,
  outboundDelivery: PaymentMailLogDeliveryMeta | null,
): PaymentMailLogDeliveryMeta | null {
  if (!activityDelivery) return outboundDelivery;
  if (!outboundDelivery) return activityDelivery;
  const preferred =
    deliveryTimelineRank(outboundDelivery) >= deliveryTimelineRank(activityDelivery)
      ? outboundDelivery
      : activityDelivery;
  return {
    ...activityDelivery,
    ...outboundDelivery,
    ...preferred,
  };
}

function deliveryMetaFromActivityMetadata(metadata: unknown): {
  status: string | null;
  delivery: PaymentMailLogDeliveryMeta | null;
  attachments: string[];
} {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { status: null, delivery: null, attachments: [] };
  }
  const meta = metadata as Record<string, unknown>;
  const deliveryRaw = meta.delivery;
  let delivery: PaymentMailLogDeliveryMeta | null = null;
  let status: string | null = null;

  if (deliveryRaw && typeof deliveryRaw === 'object' && !Array.isArray(deliveryRaw)) {
    delivery = { ...(deliveryRaw as PaymentMailLogDeliveryMeta) };
    status = statusFromDeliveryTimeline(delivery);
  }

  if (!status) {
    const metaStatus = meta.status;
    if (typeof metaStatus === 'string' && metaStatus.trim()) {
      status = metaStatus.trim().toLowerCase();
    }
  }

  if (delivery && status) {
    delivery = { ...delivery, status };
  }

  return {
    status,
    delivery,
    attachments: extractAttachmentNamesFromMetadata(meta),
  };
}

export async function enrichPaymentMailLogsForApi(logs: PaymentMailLog[]) {
  if (!logs.length) return [];

  const applicationId = logs[0]?.applicationId;
  if (!applicationId) {
    return logs.map((log) => formatPaymentMailLogApiRow(log));
  }

  const activityLogs = await prisma.applicationActivityLog.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });

  const enrichmentByPaymentLogId = new Map<
    string,
    { status: string | null; delivery: PaymentMailLogDeliveryMeta | null; attachments: string[] }
  >();
  const outboundIdByPaymentLogId = new Map<string, string>();

  for (const row of activityLogs) {
    const meta = row.metadata;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) continue;
    const metaObj = meta as Record<string, unknown>;
    const paymentMailLogId = metaObj.paymentMailLogId;
    if (typeof paymentMailLogId !== 'string' || enrichmentByPaymentLogId.has(paymentMailLogId)) {
      continue;
    }
    enrichmentByPaymentLogId.set(paymentMailLogId, deliveryMetaFromActivityMetadata(meta));
    const outboundCommunicationId = metaObj.outboundCommunicationId;
    if (typeof outboundCommunicationId === 'string' && outboundCommunicationId.trim()) {
      outboundIdByPaymentLogId.set(paymentMailLogId, outboundCommunicationId.trim());
    }
  }

  const outboundIds = [...new Set(outboundIdByPaymentLogId.values())];
  const trackingByOutboundId = new Map<string, PaymentMailLogDeliveryMeta | null>();
  if (outboundIds.length) {
    const outboundRows = await prisma.outbound_communications.findMany({
      where: { id: { in: outboundIds } },
      select: { id: true, metadata: true },
    });
    for (const outbound of outboundRows) {
      trackingByOutboundId.set(
        outbound.id,
        deliveryMetaFromOutboundMetadata(outbound.metadata),
      );
    }
  }

  return logs.map((log) => {
    const enrichment = enrichmentByPaymentLogId.get(log.id);
    const outboundId = outboundIdByPaymentLogId.get(log.id);
    const outboundDelivery = outboundId
      ? trackingByOutboundId.get(outboundId) ?? null
      : null;
    const delivery = mergeDeliveryMeta(enrichment?.delivery ?? null, outboundDelivery);
    const deliveryStatus = delivery
      ? statusFromDeliveryTimeline(delivery)
      : enrichment?.status ?? null;
    const attachments = enrichment?.attachments?.length ? enrichment.attachments : [];
    return formatPaymentMailLogApiRow(log, {
      deliveryStatus,
      delivery,
      attachments,
    });
  });
}

export async function insertPaymentMailLogRecord(
  applicationId: string,
  user: AuthenticatedUser | null,
  input: CreatePaymentMailLogInput,
  req?: Request | null,
) {
  const prismaStatus = toPrismaMailLogStatus(input.status);
  if (!prismaStatus) {
    throw new Error('Invalid payment mail log status');
  }

  const createdById = await resolveAuditLogUserId(req, { user, applicationId });

  return prisma.paymentMailLog.create({
    data: {
      applicationId,
      dealKey: input.dealKey,
      templateName: input.templateName,
      category: input.category,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body?.trim() ? input.body : null,
      status: prismaStatus,
      createdById,
    },
  });
}

export async function markPaymentMailLogFailed(
  paymentMailLogId: string,
  input: Pick<CreatePaymentMailLogInput, 'dealKey' | 'templateName' | 'category' | 'recipient' | 'subject'>,
) {
  const log = await prisma.paymentMailLog.update({
    where: { id: paymentMailLogId },
    data: { status: 'FAILED' },
  });

  const summary = `Failed to send ${input.category} "${input.templateName}" to ${input.recipient}`;
  const activityLog = await prisma.applicationActivityLog.findFirst({
    where: {
      metadata: {
        path: ['paymentMailLogId'],
        equals: paymentMailLogId,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (activityLog) {
    const prior =
      activityLog.metadata &&
      typeof activityLog.metadata === 'object' &&
      !Array.isArray(activityLog.metadata)
        ? (activityLog.metadata as Record<string, unknown>)
        : {};
    await prisma.applicationActivityLog.update({
      where: { id: activityLog.id },
      data: {
        actionType: 'PAYMENT_MAIL_FAILED',
        actionDescription: summary,
        metadata: { ...prior, status: 'failed' } as object,
      },
    });
  }

  return log;
}

export interface CreatePaymentMailLogInput {
  dealKey: string;
  templateName: string;
  category: string;
  recipient: string;
  subject: string;
  body?: string | null;
  status: 'queued' | 'sent' | 'failed';
}

export async function assertApplicationMailLogAccess(applicationId: string, user: AuthenticatedUser | null) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      currentState: true,
      referringAgentId: true,
      createdById: true,
    },
  });

  if (!application) {
    return { ok: false as const, forbidden: false as const, application: null };
  }

  const role = (user?.role ?? '').toString().trim().toUpperCase().replace(/-/g, '_');
  const isElevated = ['ADMIN', 'SUPER_ADMIN', 'SCRUBBING', 'UNDERWRITER', 'ACCOUNTANT', 'ACCOUNTS', 'OPERATIONS'].includes(
    role,
  );
  const isAgent = role === 'AGENT';

  if (
    !user ||
    (!isElevated && !(isAgent && (application.referringAgentId === user.id || application.createdById === user.id)))
  ) {
    return { ok: false as const, forbidden: true as const, application };
  }

  return { ok: true as const, forbidden: false as const, application };
}

export async function createPaymentMailLog(
  applicationId: string,
  user: AuthenticatedUser | null,
  input: CreatePaymentMailLogInput,
  req?: Request | null,
) {
  const access = await assertApplicationMailLogAccess(applicationId, user);
  if (!access.application) {
    return { forbidden: false, notFound: true, log: null };
  }
  if (access.forbidden) {
    return { forbidden: true, notFound: false, log: null };
  }

  const prismaStatus = toPrismaMailLogStatus(input.status);
  if (!prismaStatus) {
    return { forbidden: false, notFound: false, log: null, badRequest: true as const };
  }

  const createdById = await resolveAuditLogUserId(req, { user, applicationId });

  const log = await prisma.paymentMailLog.create({
    data: {
      applicationId,
      dealKey: input.dealKey,
      templateName: input.templateName,
      category: input.category,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body?.trim() ? input.body : null,
      status: prismaStatus,
      createdById,
    },
  });

  const summary =
    prismaStatus === 'SENT'
      ? `Sent ${input.category} "${input.templateName}" to ${input.recipient}`
      : prismaStatus === 'FAILED'
        ? `Failed to send ${input.category} "${input.templateName}" to ${input.recipient}`
        : `Queued ${input.category} "${input.templateName}" to ${input.recipient}`;

  await createApplicationActivityLog({
    applicationId,
    user,
    req,
    actionType:
      prismaStatus === 'SENT'
        ? 'PAYMENT_MAIL_SENT'
        : prismaStatus === 'FAILED'
          ? 'PAYMENT_MAIL_FAILED'
          : 'PAYMENT_MAIL_QUEUED',
    actionDescription: summary,
    previousStatus: null,
    currentStatus: access.application.currentState ?? 'Unknown',
    metadata: {
      category: 'COMMUNICATION',
      channel: 'TEMPLATE',
      recipientType: inferRecipientTypeFromCategory(input.category),
      recipientName: input.recipient,
      paymentMailLogId: log.id,
      viewType: 'payment_mail',
      templateName: input.templateName,
      categoryLabel: input.category,
      recipient: input.recipient,
      subject: input.subject,
      status: input.status,
    },
  });

  return { forbidden: false, notFound: false, log };
}

export async function listPaymentMailLogs(applicationId: string, user: AuthenticatedUser | null) {
  const access = await assertApplicationMailLogAccess(applicationId, user);
  if (!access.application) {
    return { forbidden: false, notFound: true, logs: [] as const };
  }
  if (access.forbidden) {
    return { forbidden: true, notFound: false, logs: [] as const };
  }

  const logs = await prisma.paymentMailLog.findMany({
    where: { applicationId: access.application.id },
    orderBy: { createdAt: 'desc' },
  });

  return { forbidden: false, notFound: false, logs };
}
