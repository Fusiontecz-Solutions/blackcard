import type { Request } from 'express';
import prisma from '../config/prismaClient';
import {
  createApplicationActivityLog,
  type ApplicationActivityActionType,
} from './applicationActivityLogService';
import type { ApplicationFieldChange } from './applicationUpdateActivityLog';
import { markActivityLogged } from './outboundCommunicationService';
import type { AuthenticatedUser } from './applicationService';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function truncateForActivityLog(value: unknown, max = 160): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function buildActorPrefix(user: AuthenticatedUser | null, actorName = ''): string {
  const roleLabel = user?.role
    ? String(user.role).toUpperCase().replace(/_/g, ' ')
    : 'User';
  return `${roleLabel} ${actorName}`.trim();
}

function formatChangeValue(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return value;
}

function actionTypeForField(field: string): ApplicationActivityActionType {
  if (field === 'currentQueue') return 'QUEUE_CHANGED';
  if (field === 'currentState') return 'STATUS_CHANGED';
  return 'APPLICATION_UPDATED';
}

async function resolveApplicationUuid(ref: unknown): Promise<string | null> {
  const raw = Array.isArray(ref) ? ref[0] : ref;
  const str = String(raw ?? '').trim();
  if (!str) return null;
  if (UUID_RE.test(str)) return str;
  if (/^\d+$/.test(str)) {
    const row = await prisma.application.findUnique({
      where: { applicationId: Number(str) },
      select: { id: true },
    });
    return row?.id ?? null;
  }
  return null;
}

function extractApplicationUuidFromPath(path: string): string | null {
  const normalized = path.replace(/^\/api\/v1\/?/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts[0] === 'applications' && parts[1] && UUID_RE.test(parts[1])) {
    return parts[1];
  }
  if (parts[0] === 'comments' && parts[1] === 'application' && parts[2] && UUID_RE.test(parts[2])) {
    return parts[2];
  }
  return null;
}

function subActionFromPath(path: string): string {
  const parts = path.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  if (parts.length > 2 && !UUID_RE.test(last) && !/^\d+$/.test(last)) {
    return last.replace(/-/g, ' ');
  }
  return parts[0]?.replace(/-/g, ' ') ?? 'record';
}

function verbForMethod(method: string): string {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'added';
    case 'PUT':
    case 'PATCH':
      return 'updated';
    case 'DELETE':
      return 'removed';
    default:
      return 'changed';
  }
}

export async function recordApplicationSubActivity(input: {
  req?: Request | null;
  applicationId: string;
  user: AuthenticatedUser | null;
  actionType?: ApplicationActivityActionType;
  description: string;
  subAction: string;
  details?: Record<string, unknown>;
  change?: ApplicationFieldChange;
  previousStatus?: string | null;
  currentStatus?: string | null;
  markLogged?: boolean;
}) {
  const log = await createApplicationActivityLog({
    applicationId: input.applicationId,
    user: input.user,
    req: input.req ?? null,
    actionType: input.actionType ?? 'APPLICATION_UPDATED',
    actionDescription: input.description,
    previousStatus: input.previousStatus ?? null,
    currentStatus: input.currentStatus ?? null,
    metadata: {
      category: 'SUB_ACTIVITY',
      subAction: input.subAction,
      ...(input.change ? { change: input.change } : {}),
      ...(input.details ?? {}),
    },
  });

  if (input.markLogged && input.req) {
    markActivityLogged(input.req);
  }

  return log;
}

export async function recordApplicationFieldChangeLogs(input: {
  req: Request;
  applicationId: string;
  user: AuthenticatedUser | null;
  actorName?: string;
  changes: ApplicationFieldChange[];
  previousStatus: string;
  currentStatus: string;
}) {
  const { req, applicationId, user, actorName = '', changes, previousStatus, currentStatus } =
    input;
  if (changes.length === 0) return [];

  const actorPrefix = buildActorPrefix(user, actorName);
  const logs = [];

  for (const change of changes) {
    const description =
      `${actorPrefix} changed ${change.label}: ` +
      `${formatChangeValue(change.previous)} → ${formatChangeValue(change.current)}.`;

    const log = await recordApplicationSubActivity({
      req,
      applicationId,
      user,
      actionType: actionTypeForField(change.field),
      description,
      subAction: 'FIELD_CHANGED',
      change,
      previousStatus,
      currentStatus,
    });
    logs.push(log);
  }

  markActivityLogged(req);
  return logs;
}

type RouteActivityPlan = {
  applicationId: string;
  description: string;
  subAction: string;
  actionType?: ApplicationActivityActionType;
  details?: Record<string, unknown>;
  previousStatus?: string | null;
  currentStatus?: string | null;
};

async function loadApplicationStatus(applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { currentQueue: true, currentState: true },
  });
  if (!app) return { previousStatus: null, currentStatus: null };
  const status = `${app.currentQueue} / ${app.currentState}`;
  return { previousStatus: status, currentStatus: status };
}

async function buildRouteActivityPlan(
  req: Request,
  path: string,
  method: string,
  user: AuthenticatedUser,
): Promise<RouteActivityPlan | null> {
  const actorPrefix = buildActorPrefix(user, String((req as any).user?.name || ''));
  const verb = verbForMethod(method);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const normalized = path.replace(/^\/api\/v1\/?/, '');
  const parts = normalized.split('/').filter(Boolean);
  const resource = parts[0] ?? '';

  const pathAppId = extractApplicationUuidFromPath(path);
  if (pathAppId && resource === 'applications') {
    const sub = parts[2] ?? '';
    if (!sub && (method === 'PUT' || method === 'PATCH')) {
      return null;
    }
    if (sub && APPLICATION_HANDLED_SUBROUTES.has(sub)) {
      return null;
    }
    if (sub === 'applications' || sub === 'activity-logs' || sub === 'payment-mail-logs') {
      return null;
    }
    const status = await loadApplicationStatus(pathAppId);
    return {
      applicationId: pathAppId,
      description: `${actorPrefix} ${verb} ${sub || 'application'}.`,
      subAction: `${resource.toUpperCase()}_${method}${sub ? `_${sub.replace(/-/g, '_').toUpperCase()}` : ''}`,
      details: { resource, subAction: sub || 'application', method },
      ...status,
    };
  }

  const bodyAppRef =
    body.application ??
    body.applicationId ??
    (resource === 'offer-decisions' ? body.application : undefined);

  let applicationId = pathAppId;
  if (!applicationId && bodyAppRef) {
    applicationId = await resolveApplicationUuid(bodyAppRef);
  }

  if (!applicationId && resource === 'bank-analysis' && method !== 'POST') {
    const resourceId = parts[1];
    if (resourceId && UUID_RE.test(resourceId)) {
      const row = await prisma.bankAnalysis.findUnique({
        where: { id: resourceId },
        select: { applicationId: true },
      });
      applicationId = row?.applicationId ?? null;
    }
  }

  if (!applicationId && ['positions', 'terms-offers', 'compliance-checks', 'notes'].includes(resource) && method !== 'POST') {
    const resourceId = parts[1];
    if (resourceId && UUID_RE.test(resourceId)) {
      const table =
        resource === 'positions'
          ? prisma.position
          : resource === 'terms-offers'
            ? prisma.termsOffer
            : resource === 'compliance-checks'
              ? prisma.complianceCheck
              : prisma.note;
      const row = await (table as any).findUnique({
        where: { id: resourceId },
        select: { applicationId: true },
      });
      applicationId = row?.applicationId ?? null;
    }
  }

  if (!applicationId && resource === 'comments' && method !== 'POST') {
    const commentId = parts[1];
    if (commentId && UUID_RE.test(commentId)) {
      const row = await prisma.comment.findUnique({
        where: { id: commentId },
        select: { applicationId: true },
      });
      applicationId = row?.applicationId ?? null;
    }
  }

  if (!applicationId) return null;

  const status = await loadApplicationStatus(applicationId);
  const resourceLabel = resource.replace(/-/g, ' ');
  const sub = subActionFromPath(path);
  const details: Record<string, unknown> = { resource, method };

  if (resource === 'comments' && method === 'POST') {
    details.preview = truncateForActivityLog(body.content);
    details.commentType = body.type ?? 'Internal Comment';
  } else if (resource === 'bank-analysis') {
    const bankName = body.bankName ?? null;
    const accountNumber = body.accountNumber
      ? '***' + String(body.accountNumber).slice(-4)
      : null;
    details.bankName = bankName;
    details.accountNumber = accountNumber;
    const updatedParts: string[] = [];
    if (bankName != null && String(bankName).trim()) updatedParts.push('bank name');
    if (body.accountNumber != null && String(body.accountNumber).trim()) {
      updatedParts.push('account number');
    }
    if (Array.isArray(body.rows)) {
      updatedParts.push(`${body.rows.length} monthly row${body.rows.length === 1 ? '' : 's'}`);
    }
    if (method === 'POST') {
      details.changeSummary = updatedParts.length
        ? `Added ${updatedParts.join(', ')}`
        : 'Added bank account';
    } else if (updatedParts.length > 0) {
      details.changeSummary = `Updated ${updatedParts.join(', ')}`;
    } else {
      details.changeSummary = 'Updated bank analysis data';
    }
  } else if (resource === 'offer-decisions') {
    details.decision = parts[1] === 'decline' ? 'declined' : (body.decision ?? body.status ?? 'updated');
  } else if (resource === 'compliance-checks') {
    details.question = truncateForActivityLog(body.question, 80);
    details.answer = truncateForActivityLog(body.answer, 80);
  } else if (resource === 'notes') {
    details.preview = truncateForActivityLog(body.content);
  } else if (resource === 'positions') {
    details.funder = body.funder ?? body.funderName ?? null;
    details.balance = body.balance ?? body.currentBalance ?? null;
  } else if (resource === 'terms-offers') {
    details.offerAmount = body.offerAmount ?? body.amount ?? null;
  } else {
    details.subAction = sub;
  }

  return {
    applicationId,
    description: `${actorPrefix} ${verb} ${resourceLabel}${sub && sub !== resourceLabel ? ` (${sub})` : ''}.`,
    subAction: `${resource.toUpperCase().replace(/-/g, '_')}_${method}`,
    details,
    ...status,
  };
}

const SKIP_ROUTE_PREFIXES = [
  '/activity-logs',
  '/auth/',
  '/health',
  '/google/test',
  '/notifications',
  '/chat',
  '/team-chat',
  '/sendgrid',
];

/** Application routes that already write their own activity logs in controllers. */
const APPLICATION_HANDLED_SUBROUTES = new Set([
  'queue',
  'state',
  'document-checklist',
  'reject',
  'approve',
  'files',
  'scrubbing-claim',
  'underwriter-claim',
  'scrubbing-release',
  'assign-underwriter',
  'send-final-underwriter-approval',
  'activity-logs',
  'payment-mail-logs',
  'fill-from-pdf',
]);

export async function tryRecordApplicationRouteActivity(req: Request, statusCode: number) {
  if (req.__activityLogged || !req.user || statusCode >= 400) return;

  const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
  const method = req.method.toUpperCase();
  if (!MUTATING.has(method)) return;

  const normalized = pathOnly.replace(/^\/api\/v1/, '') || pathOnly;
  if (SKIP_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return;

  const user = { id: req.user.id, role: req.user.role } as AuthenticatedUser;
  const plan = await buildRouteActivityPlan(req, pathOnly, method, user);
  if (!plan) return;

  await recordApplicationSubActivity({
    req,
    applicationId: plan.applicationId,
    user,
    actionType: plan.actionType,
    description: plan.description,
    subAction: plan.subAction,
    details: plan.details,
    previousStatus: plan.previousStatus,
    currentStatus: plan.currentStatus,
    markLogged: true,
  });
}
