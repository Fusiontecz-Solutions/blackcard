import type { Request } from 'express';
import type { Application, Client, Iso, User } from '@prisma/client';
import type { ApplicationActivityActionType } from './applicationActivityLogService';
import { markActivityLogged } from './outboundCommunicationService';
import type { AuthenticatedUser } from './applicationService';
import {
  buildActorPrefix,
  recordApplicationFieldChangeLogs,
  recordApplicationSubActivity,
} from './applicationSubActivityLog';

export type ApplicationFieldChange = {
  field: string;
  label: string;
  previous: string | null;
  current: string | null;
};

type ApplicationSnapshot = Application & {
  client?: Pick<Client, 'id' | 'businessName' | 'clientId'> | null;
  iso?: Pick<Iso, 'id' | 'name'> | null;
  referringAgent?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null;
  salesRepresentative?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null;
};

const FIELD_LABELS: Record<string, string> = {
  priority: 'Priority',
  type: 'Type',
  currentQueue: 'Queue',
  currentState: 'State',
  note: 'Note',
  loanAmount: 'Loan Amount',
  category: 'Category',
  commissionPercentage: 'ISO Commission %',
  underwriterCommissionPercentage: 'Underwriter Commission %',
  brokerCommissionPercentage: 'Broker Commission %',
  commissionAmount: 'ISO Commission Amount',
  underwriterCommissionAmount: 'Underwriter Commission Amount',
  brokerCommissionAmount: 'Broker Commission Amount',
  clientId: 'Client',
  isoId: 'ISO',
  referringAgentId: 'Referring Agent',
  salesRepresentativeId: 'Sales Representative',
};

const TRACKED_FIELDS = Object.keys(FIELD_LABELS);

function formatUserName(user?: Pick<User, 'firstName' | 'lastName' | 'email'> | null): string | null {
  if (!user) return null;
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name || user.email || null;
}

function formatClientLabel(client?: Pick<Client, 'businessName' | 'clientId'> | null): string | null {
  if (!client) return null;
  const name = String(client.businessName || '').trim();
  if (name) return name;
  if (client.clientId != null) return `Client #${client.clientId}`;
  return null;
}

function formatIsoLabel(iso?: Pick<Iso, 'name'> | null): string | null {
  if (!iso) return null;
  return String(iso.name || '').trim() || null;
}

function formatCurrency(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return `${value}%`;
}

function normalizeScalar(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : String(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  const left = normalizeScalar(a);
  const right = normalizeScalar(b);
  return left === right;
}

function resolveFieldValue(
  app: ApplicationSnapshot,
  field: string,
): string | null {
  switch (field) {
    case 'clientId':
      return formatClientLabel(app.client) ?? normalizeScalar(app.clientId);
    case 'isoId':
      return formatIsoLabel(app.iso) ?? normalizeScalar(app.isoId);
    case 'referringAgentId':
      return formatUserName(app.referringAgent) ?? normalizeScalar(app.referringAgentId);
    case 'salesRepresentativeId':
      return formatUserName(app.salesRepresentative) ?? normalizeScalar(app.salesRepresentativeId);
    case 'loanAmount':
    case 'commissionAmount':
    case 'underwriterCommissionAmount':
    case 'brokerCommissionAmount':
      return formatCurrency(app[field as keyof Application] as number | null);
    case 'commissionPercentage':
    case 'underwriterCommissionPercentage':
    case 'brokerCommissionPercentage':
      return formatPercent(app[field as keyof Application] as number | null);
    default:
      return normalizeScalar(app[field as keyof Application]);
  }
}

export function buildApplicationFieldChanges(
  before: ApplicationSnapshot,
  after: ApplicationSnapshot,
): ApplicationFieldChange[] {
  const changes: ApplicationFieldChange[] = [];

  for (const field of TRACKED_FIELDS) {
    const previousRaw = before[field as keyof Application];
    const currentRaw = after[field as keyof Application];
    if (valuesEqual(previousRaw, currentRaw)) continue;

    changes.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      previous: resolveFieldValue(before, field),
      current: resolveFieldValue(after, field),
    });
  }

  return changes;
}

function buildChangeSummary(changes: ApplicationFieldChange[]): string {
  if (changes.length === 0) return 'updated the application';
  const labels = changes.map((c) => c.label);
  if (labels.length === 1) return `updated ${labels[0]}`;
  if (labels.length === 2) return `updated ${labels[0]} and ${labels[1]}`;
  return `updated ${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function normalizeContractQueueToken(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function contractQueueTransitionDescription(
  actorPrefix: string,
  previousQueue: string | null | undefined,
  nextQueue: string | null | undefined,
): string | null {
  const next = normalizeContractQueueToken(nextQueue);
  const prev = normalizeContractQueueToken(previousQueue);

  if (next === 'contractpending' && prev !== 'contractpending') {
    return `${actorPrefix} started contract generation (moved deal to Contract Pending).`.trim();
  }
  if (next === 'contractgenerated' && prev !== 'contractgenerated') {
    return `${actorPrefix} advanced contract generation (moved deal to Contract Generated).`.trim();
  }
  return null;
}

function resolveActionType(changes: ApplicationFieldChange[]): ApplicationActivityActionType {
  const fields = new Set(changes.map((c) => c.field));
  const queueChange = changes.find((c) => c.field === 'currentQueue');
  if (queueChange) {
    const next = normalizeContractQueueToken(queueChange.current);
    if (next === 'contractpending' || next === 'contractgenerated') {
      return 'CONTRACT_GENERATED';
    }
    return 'QUEUE_CHANGED';
  }
  if (fields.has('currentState')) return 'STATUS_CHANGED';
  return 'APPLICATION_UPDATED';
}

export async function recordApplicationUpdateActivityLog(input: {
  req: Request;
  before: ApplicationSnapshot;
  after: ApplicationSnapshot;
  user: AuthenticatedUser | null;
  actorName?: string;
}) {
  const { req, before, after, user, actorName = '' } = input;
  const changes = buildApplicationFieldChanges(before, after);
  if (changes.length === 0) return null;

  const previousStatus = `${before.currentQueue} / ${before.currentState}`;
  const currentStatus = `${after.currentQueue} / ${after.currentState}`;
  const actorPrefix = buildActorPrefix(user, actorName);

  if (changes.length === 1) {
    const change = changes[0];
    const contractDescription =
      change.field === 'currentQueue'
        ? contractQueueTransitionDescription(actorPrefix, change.previous, change.current)
        : null;
    return recordApplicationSubActivity({
      req,
      applicationId: after.id,
      user,
      actionType: resolveActionType(changes),
      description:
        contractDescription ??
        `${actorPrefix} changed ${change.label}: ` +
          `${change.previous ?? '—'} → ${change.current ?? '—'}.`,
      subAction: 'FIELD_CHANGED',
      change,
      previousStatus,
      currentStatus,
      markLogged: true,
      details: contractDescription
        ? { category: 'CONTRACT', contractWorkflowStep: 'QUEUE_ADVANCED' }
        : undefined,
    });
  }

  const summary = await recordApplicationSubActivity({
    req,
    applicationId: after.id,
    user,
    actionType: resolveActionType(changes),
    description: `${actorPrefix} ${buildChangeSummary(changes)}.`,
    subAction: 'FIELDS_UPDATED',
    details: { changes },
    previousStatus,
    currentStatus,
  });

  await recordApplicationFieldChangeLogs({
    req,
    applicationId: after.id,
    user,
    actorName,
    changes,
    previousStatus,
    currentStatus,
  });

  markActivityLogged(req);
  return summary;
}
