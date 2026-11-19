/**
 * Notify CRM users who are on the deal when any comment is posted.
 * In-app bell + socket only — never email staff from this path.
 * (Staff External → ISO email is handled separately by isoExternalCommentMailService.)
 */
import prisma from '../config/prismaClient';
import { emitToUser } from '../socket';
import {
  deriveActionUrl,
  notificationTriageDefaults,
} from './notificationCategory';

type RecipientUser = {
  id: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

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

function toApiNotification(notification: any) {
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
    category: notification.category,
    bucket: notification.bucket,
    importance: notification.importance,
    snoozedUntil: notification.snoozedUntil ?? null,
    isArchived: notification.isArchived ?? false,
    actionUrl: notification.actionUrl,
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
}

function snippet(body: string, max = 160): string {
  const t = String(body || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function normalizeRoleKey(role: string | null | undefined): string {
  return String(role || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

/** Human label for CRM roles in bell copy — never expose raw enum. */
function roleDisplayLabel(role: string | null | undefined): string {
  const r = normalizeRoleKey(role);
  switch (r) {
    case 'SCRUBBING':
      return 'Scrubber';
    case 'UNDERWRITER':
      return 'Underwriter';
    case 'SUPER_ADMIN':
    case 'SUPERADMIN':
      return 'Super Admin';
    case 'ADMIN':
      return 'Admin';
    case 'OPERATIONS':
      return 'Operations';
    case 'AGENT':
      return 'Agent';
    case 'ACCOUNTANT':
    case 'ACCOUNTS':
      return 'Accounts';
    case 'SYNDICATOR':
      return 'Syndicator';
    default:
      return r
        ? r
            .split('_')
            .filter(Boolean)
            .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
            .join(' ')
        : '';
  }
}

async function findActiveUsersByIds(ids: string[]): Promise<RecipientUser[]> {
  const unique = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!unique.length) return [];
  return prisma.user.findMany({
    where: { id: { in: unique }, isActive: true },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
}

async function findActiveSuperAdmins(): Promise<RecipientUser[]> {
  try {
    return await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' as any, isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  } catch (err) {
    console.error('[deal-comment-notify] super-admin recipients failed:', err);
    return [];
  }
}

/**
 * Users tied to this deal only (never the whole platform), plus all Super Admins.
 */
async function resolveDealUsers(applicationId: string): Promise<RecipientUser[]> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      claimedByUnderwriterId: true,
      assignedUnderwriterId: true,
      approvedByUnderwriterId: true,
      salesRepresentativeId: true,
      referringAgentId: true,
      createdById: true,
    },
  });
  if (!application) return [];

  const byId = new Map<string, RecipientUser>();
  const add = (row: RecipientUser | null | undefined) => {
    if (!row?.id) return;
    byId.set(String(row.id), {
      id: String(row.id),
      email: row.email ?? null,
      firstName: row.firstName,
      lastName: row.lastName,
    });
  };

  const stakeIds = [
    application.claimedByUnderwriterId,
    application.assignedUnderwriterId,
    (application as { approvedByUnderwriterId?: string | null }).approvedByUnderwriterId,
    application.salesRepresentativeId,
    application.referringAgentId,
    application.createdById,
  ].filter(Boolean) as string[];
  (await findActiveUsersByIds(stakeIds)).forEach(add);

  try {
    const recentLogs = await prisma.applicationActivityLog.findMany({
      where: {
        applicationId: application.id,
        userId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { userId: true },
    });
    const logUserIds = Array.from(
      new Set(recentLogs.map((row) => String(row.userId || '').trim()).filter(Boolean)),
    );
    (await findActiveUsersByIds(logUserIds)).forEach(add);
  } catch (err) {
    console.error('[deal-comment-notify] activity recipients failed:', err);
  }

  try {
    const commentAuthors = await prisma.comment.findMany({
      where: {
        applicationId: application.id,
        createdById: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { createdById: true },
    });
    const authorIds = Array.from(
      new Set(commentAuthors.map((row) => String(row.createdById || '').trim()).filter(Boolean)),
    );
    (await findActiveUsersByIds(authorIds)).forEach(add);
  } catch (err) {
    console.error('[deal-comment-notify] comment-author recipients failed:', err);
  }

  (await findActiveSuperAdmins()).forEach(add);

  return Array.from(byId.values());
}

export type DealCommentNotifyParams = {
  applicationId: string;
  commentBody: string;
  commentType: 'ISO Comment' | 'External Comment' | 'Internal Comment';
  actorName?: string | null;
  /** CRM role of the staff poster (ignored for ISO / public portal). */
  actorRole?: string | null;
  createdById?: string | null;
  /**
   * When true (ISO portal or ISO Comment type), bell copy is always "ISO" —
   * never the mapped CRM Super Admin name (e.g. "SUBS .").
   */
  preferIsoActorLabel?: boolean;
};

/** @deprecated alias — use notifyDealUsersOfComment */
export type PublicPortalCommentNotifyParams = DealCommentNotifyParams;

function commentTitle(
  commentType: DealCommentNotifyParams['commentType'],
  appNumber: string | number,
): string {
  if (commentType === 'ISO Comment') return `ISO comment on Application #${appNumber}`;
  if (commentType === 'External Comment') return `External comment on Application #${appNumber}`;
  return `New comment on Application #${appNumber}`;
}

/**
 * Build bell actor label:
 * - ISO → always "ISO" (never mapped CRM name)
 * - Staff → "Role Name" when possible (e.g. "Underwriter Jane Doe")
 */
async function resolveActorLabel(params: {
  commentType: DealCommentNotifyParams['commentType'];
  preferIsoActorLabel?: boolean;
  actorName?: string | null;
  actorRole?: string | null;
  actorId?: string;
}): Promise<string> {
  const preferIso =
    params.preferIsoActorLabel === true || params.commentType === 'ISO Comment';
  if (preferIso) return 'ISO';

  let role = String(params.actorRole || '').trim();
  let name = String(params.actorName || '').trim();

  // Drop junk CRM display names that look like placeholders.
  if (/^subs\s*\.?$/i.test(name) || /^iso$/i.test(name) || /^a teammate$/i.test(name)) {
    name = '';
  }

  if (params.actorId && (!role || !name)) {
    const actor = await prisma.user
      .findUnique({
        where: { id: params.actorId },
        select: { firstName: true, lastName: true, email: true, role: true },
      })
      .catch(() => null);
    if (actor) {
      if (!role) role = String(actor.role || '').trim();
      if (!name) {
        name =
          `${actor.firstName || ''} ${actor.lastName || ''}`.trim() ||
          String(actor.email || '').trim();
      }
    }
  }

  if (/^subs\s*\.?$/i.test(name)) name = '';

  const roleLabel = roleDisplayLabel(role);
  if (roleLabel && name) return `${roleLabel} ${name}`;
  if (roleLabel) return roleLabel;
  if (name) return name;
  if (params.commentType === 'External Comment') return 'Team';
  return 'Team';
}

/**
 * In-app bell for every deal user + all Super Admins when a comment is posted.
 * Never emails. Safe to fire-and-forget from comment create.
 */
export async function notifyDealUsersOfComment(
  params: DealCommentNotifyParams,
): Promise<{ notified: number }> {
  const applicationId = String(params.applicationId || '').trim();
  const commentBody = String(params.commentBody || '').trim();
  if (!applicationId || !commentBody) return { notified: 0 };

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      applicationId: true,
      currentQueue: true,
      currentState: true,
      client: {
        select: {
          businessName: true,
          ownerFirstName: true,
          ownerLastName: true,
        },
      },
    },
  });
  if (!application) return { notified: 0 };

  const superAdmins = await findActiveSuperAdmins();
  const superAdminIds = new Set(superAdmins.map((u) => String(u.id)));

  const recipients = await resolveDealUsers(application.id);
  const actorId = String(params.createdById || '').trim();

  // Exclude the poster from deal-user fan-out, but never drop Super Admins.
  // Portal ISO sessions are often mapped to a SUPER_ADMIN user by email — callers
  // should pass createdById=null for public ISO so that Super Admin still receives
  // a personal inbox row (bell uses personalOnly for SUPER_ADMIN).
  const byId = new Map<string, RecipientUser>();
  for (const r of recipients) {
    if (!r?.id) continue;
    if (actorId && r.id === actorId && !superAdminIds.has(r.id)) continue;
    byId.set(r.id, r);
  }
  // Force-include every active Super Admin last (overrides any prior skip).
  for (const sa of superAdmins) {
    byId.set(String(sa.id), sa);
  }

  const filtered = Array.from(byId.values());
  if (!filtered.length) {
    console.warn('[deal-comment-notify] no deal recipients', {
      applicationId,
      superAdminCount: superAdmins.length,
    });
    return { notified: 0 };
  }

  const clientName =
    application.client?.businessName ||
    `${application.client?.ownerFirstName || ''} ${application.client?.ownerLastName || ''}`.trim() ||
    'Client';
  const appNumber = application.applicationId ?? 'N/A';

  const actorLabel = await resolveActorLabel({
    commentType: params.commentType,
    preferIsoActorLabel: params.preferIsoActorLabel,
    actorName: params.actorName,
    actorRole: params.actorRole,
    actorId,
  });

  const bodySnippet = snippet(commentBody);
  const title = commentTitle(params.commentType, appNumber);
  const message = bodySnippet
    ? `${actorLabel} commented on ${clientName}: "${bodySnippet}"`
    : `${actorLabel} commented on ${clientName}. Review the deal comments.`;
  const type = 'application_update';
  const triage = notificationTriageDefaults(type, application);
  const actionUrl = deriveActionUrl({
    type,
    category: triage.category as any,
    applicationNumber: application.applicationId,
    applicationUuid: application.id,
  });

  const createdByIdForRow = actorId || null;

  let notified = 0;
  const failedRecipientIds: string[] = [];
  for (const recipient of filtered) {
    try {
      const created = await prisma.notification.create({
        data: {
          title,
          message,
          type,
          recipientId: recipient.id,
          applicationId: application.id,
          createdById: createdByIdForRow,
          category: triage.category,
          bucket: triage.bucket,
          importance: 'high',
          actionUrl,
        },
        include: NOTIFICATION_INCLUDE,
      });
      emitToUser(recipient.id, 'notification:new', {
        notification: toApiNotification(created),
      });
      emitToUser(recipient.id, 'comment:new', {
        applicationId: application.id,
        commentType: params.commentType,
      });
      notified += 1;
    } catch (err) {
      // Retry once without createdById if FK failed (portal actor not in User).
      try {
        const created = await prisma.notification.create({
          data: {
            title,
            message,
            type,
            recipientId: recipient.id,
            applicationId: application.id,
            createdById: null,
            category: triage.category,
            bucket: triage.bucket,
            importance: 'high',
            actionUrl,
          },
          include: NOTIFICATION_INCLUDE,
        });
        emitToUser(recipient.id, 'notification:new', {
          notification: toApiNotification(created),
        });
        emitToUser(recipient.id, 'comment:new', {
          applicationId: application.id,
          commentType: params.commentType,
        });
        notified += 1;
      } catch (err2) {
        failedRecipientIds.push(recipient.id);
        console.error('[deal-comment-notify] notification create failed:', {
          recipientId: recipient.id,
          err: err2,
          firstErr: err,
        });
      }
    }
  }

  console.info('[deal-comment-notify] done', {
    applicationId,
    commentType: params.commentType,
    actorLabel,
    notified,
    recipients: filtered.length,
    superAdminRecipients: filtered.filter((r) => superAdminIds.has(r.id)).map((r) => r.id),
    failedRecipientIds,
  });

  return { notified };
}

/** @deprecated Prefer notifyDealUsersOfComment — kept for existing imports. */
export async function notifyStaffOfPublicPortalComment(
  params: PublicPortalCommentNotifyParams,
): Promise<{ notified: number }> {
  return notifyDealUsersOfComment(params);
}
