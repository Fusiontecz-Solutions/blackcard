import type { Role } from '@prisma/client';
import type { Request } from 'express';
import prisma from '../config/prismaClient';
import { resolveAuditLogUserId } from '../middleware/authMiddleware';
import { markActivityLogged } from './outboundCommunicationService';
import type { AuthenticatedUser } from './applicationService';

// Local TypeScript representation of allowed activity action types.
// This mirrors the values used in the Prisma enum.
export type ApplicationActivityActionType =
  | 'CREATE_APPLICATION'
  | 'UNDERWRITER_CLAIMED'
  | 'UNDERWRITER_RELEASED'
  | 'SEND_TO_UNDERWRITER'
  | 'SEND_TO_FINAL_UNDERWRITER'
  | 'APPROVED'
  | 'DOCUMENT_REQUESTED'
  | 'STATUS_CHANGED'
  | 'QUEUE_CHANGED'
  | 'APPLICATION_UPDATED'
  | 'FILE_UPLOADED'
  | 'APPLICATION_REJECTED'
  | 'PAYMENT_MAIL_SENT'
  | 'PAYMENT_MAIL_FAILED'
  | 'PAYMENT_MAIL_QUEUED'
  | 'CONTRACT_SIGNING_STATUS'
  | 'CONTRACT_REINITIATION_REQUIRED'
  | 'CONTRACT_REINITIATED'
  | 'CONTRACT_GENERATED'
  | 'CONTRACT_DRAFT_CREATED'
  | 'CONTRACT_ENVELOPE_SENT'
  /** Any other deal email (see services/dealMailLog). */
  | 'EMAIL_SENT'
  | 'EMAIL_FAILED';

export interface CreateApplicationActivityLogInput {
  applicationId: string | null;
  user: AuthenticatedUser | null;
  actionType: ApplicationActivityActionType;
  actionDescription: string;
  previousStatus?: string | null;
  currentStatus?: string | null;
  /** Optional originating request, used by callers to enrich context. */
  req?: Request | null;
  metadata?: Record<string, unknown>;
}

export async function createApplicationActivityLog(input: CreateApplicationActivityLogInput) {
  const { applicationId, user, actionType, actionDescription, previousStatus, currentStatus, metadata, req } = input;

  const userId = await resolveAuditLogUserId(req, {
    user,
    applicationId: applicationId ?? undefined,
  });
  const normalizedRole = (user?.role ?? null) as Role | string | null;
  const roleValue =
    typeof normalizedRole === 'string' 
      ? (normalizedRole.trim().toUpperCase().replace(/-/g, '_') as Role)
      : (normalizedRole as Role | null);

  return prisma.applicationActivityLog.create({
    data: {
      applicationId,
      userId,
      userRole: roleValue && ['AGENT', 'SCRUBBING', 'UNDERWRITER', 'ACCOUNTANT', 'ACCOUNTS', 'ADMIN', 'SUPER_ADMIN'].includes(roleValue)
        ? (roleValue as Role)
        : null,
      actionType,
      actionDescription,
      previousStatus: previousStatus ?? null,
      currentStatus,
      metadata: metadata ? (metadata as any) : undefined,
    },
  }).then((log) => {
    if (req) markActivityLogged(req);
    return log;
  });
}

export async function getApplicationActivityLogsForUser(applicationId: string, user: AuthenticatedUser | null) {
  // Ensure application exists and user has access
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      referringAgentId: true,
      createdById: true,
    },
  });

  if (!application) {
    return { forbidden: false, application: null, logs: [] };
  }

  // Basic access check: elevated roles see everything; agents see only owned applications
  const role = (user?.role ?? '').toString().trim().toUpperCase().replace(/-/g, '_');
  const isElevated = ['ADMIN', 'SUPER_ADMIN', 'SCRUBBING', 'UNDERWRITER', 'ACCOUNTANT', 'ACCOUNTS'].includes(role);
  const isAgent = role === 'AGENT';

  if (!user || (!isElevated && !(isAgent && (application.referringAgentId === user.id || application.createdById === user.id)))) {
    return { forbidden: true, application, logs: [] };
  }

  const logs = await prisma.applicationActivityLog.findMany({
    where: { applicationId: application.id },
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
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return { forbidden: false, application, logs };
}

