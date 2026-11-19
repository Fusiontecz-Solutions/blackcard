import type { Request } from 'express';
import prisma from '../config/prismaClient';
import { resolveAuditLogUserId } from '../middleware/authMiddleware';
import type { AuthenticatedUser } from './applicationService';

export type CommunicationChannel = 'EMAIL' | 'TEMPLATE' | 'DOCUMENT';
export type CommunicationRecipientType = 'ISO' | 'CLIENT' | 'MERCHANT' | 'USER' | 'OTHER';

export interface CreateOutboundCommunicationInput {
  /** Optional explicit id so the value can be pre-generated and used as the SendGrid tracking arg before the email is sent. */
  id?: string;
  applicationId?: string | null;
  channel: CommunicationChannel;
  recipientType?: CommunicationRecipientType | string | null;
  recipient: string;
  subject?: string | null;
  body?: string | null;
  templateName?: string | null;
  documentName?: string | null;
  contractId?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
  user?: AuthenticatedUser | null;
  req?: Request | null;
}

export function inferRecipientTypeFromCategory(category: string): CommunicationRecipientType {
  const c = category.toLowerCase();
  if (c.includes('iso')) return 'ISO';
  if (c.includes('merchant')) return 'MERCHANT';
  if (c.includes('client')) return 'CLIENT';
  return 'OTHER';
}

export function formatRecipientList(to: string | string[] | undefined): string {
  if (!to) return '—';
  if (Array.isArray(to)) return to.filter(Boolean).join(', ');
  return String(to);
}

export async function createOutboundCommunication(input: CreateOutboundCommunicationInput) {
  const {
    id,
    applicationId,
    channel,
    recipientType,
    recipient,
    subject,
    body,
    templateName,
    documentName,
    contractId,
    status = 'sent',
    metadata,
    user,
    req,
  } = input;

  const createdById = await resolveAuditLogUserId(req, {
    user,
    applicationId: applicationId ?? undefined,
  });

  return prisma.outbound_communications.create({
    data: {
      ...(id ? { id } : {}),
      applicationId: applicationId ?? null,
      channel,
      recipientType: recipientType ? String(recipientType).toUpperCase() : null,
      recipient,
      subject: subject ?? null,
      body: body?.trim() ? body : null,
      templateName: templateName ?? null,
      documentName: documentName ?? null,
      contractId: contractId ?? null,
      status,
      metadata: metadata ? (metadata as object) : undefined,
      createdById,
    },
  });
}

export async function getOutboundCommunicationById(id: string) {
  return prisma.outbound_communications.findUnique({
    where: { id },
    include: {
      User: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      Application: { select: { id: true, applicationId: true, dealDisplayName: true } },
    },
  });
}

declare global {
  namespace Express {
    interface Request {
      __activityLogged?: boolean;
    }
  }
}

export function markActivityLogged(req: Request): void {
  req.__activityLogged = true;
}

/** Persist SendGrid `x-message-id` on the outbound row for webhook fallback matching. */
export async function storeSgMessageIdOnOutbound(
  outboundId: string,
  sgMessageId: string,
): Promise<void> {
  const existing = await prisma.outbound_communications.findUnique({
    where: { id: outboundId },
    select: { metadata: true },
  });
  const prior =
    existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};
  await prisma.outbound_communications.update({
    where: { id: outboundId },
    data: { metadata: { ...prior, sgMessageId } as object },
  });
}
