import type { ApplicationActivityLog } from '@/redux/actions/applicationActivityLogActions';

export type ActivityLogCategory =
  | 'created'
  | 'state'
  | 'offer'
  | 'claimed'
  | 'workflow'
  | 'communication'
  | 'documents'
  | 'contract'
  | 'bank_analysis'
  | 'decision'
  | 'updates';

export type FieldChange = {
  field?: string;
  label: string;
  previous?: string | null;
  current?: string | null;
};

export const ACTIVITY_LOG_CATEGORIES: {
  id: ActivityLogCategory | 'all';
  label: string;
}[] = [
  { id: 'all', label: 'All' },
  { id: 'created', label: 'Created' },
  { id: 'state', label: 'State & Queue' },
  { id: 'offer', label: 'Offer & Amount' },
  { id: 'claimed', label: 'Claimed' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'communication', label: 'Communication' },
  { id: 'documents', label: 'Documents' },
  { id: 'contract', label: 'Contract' },
  { id: 'bank_analysis', label: 'Bank Analysis' },
  { id: 'decision', label: 'Decision' },
  { id: 'updates', label: 'Other Updates' },
];

const CONTRACT_ACTIONS = new Set([
  'CONTRACT_SIGNING_STATUS',
  'CONTRACT_REINITIATION_REQUIRED',
  'CONTRACT_REINITIATED',
  'CONTRACT_GENERATED',
  'CONTRACT_DRAFT_CREATED',
  'CONTRACT_ENVELOPE_SENT',
]);

const CLAIM_ACTIONS = new Set(['UNDERWRITER_CLAIMED', 'UNDERWRITER_RELEASED']);

const WORKFLOW_ACTIONS = new Set([
  'SEND_TO_UNDERWRITER',
  'SEND_TO_FINAL_UNDERWRITER',
  'APPROVED',
]);

const STATE_ACTIONS = new Set(['STATUS_CHANGED', 'QUEUE_CHANGED']);

const GREEN_FIELD_KEYS = new Set([
  'currentstate',
  'currentqueue',
  'state',
  'queue',
  'loanamount',
  'offeramount',
]);

const GREEN_FIELD_LABELS = [
  'state',
  'queue',
  'loan amount',
  'offer amount',
  'offer',
];

export function extractFieldChanges(metadata?: Record<string, unknown> | null): FieldChange[] {
  const raw = metadata?.changes;
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is FieldChange => {
        if (!item || typeof item !== 'object') return false;
        return typeof (item as FieldChange).label === 'string';
      })
      .map((item) => ({
        field: item.field,
        label: item.label,
        previous: item.previous ?? null,
        current: item.current ?? null,
      }));
  }

  const single = metadata?.change;
  if (single && typeof single === 'object' && typeof (single as FieldChange).label === 'string') {
    const change = single as FieldChange;
    return [
      {
        field: change.field,
        label: change.label,
        previous: change.previous ?? null,
        current: change.current ?? null,
      },
    ];
  }

  return [];
}

function metadataResource(meta: Record<string, unknown>): string {
  return String(meta.resource ?? '').toLowerCase();
}

function isCommunicationLog(log: ApplicationActivityLog): boolean {
  const meta = log.metadata ?? {};
  const hasEmailMeta = Boolean(meta.emailSentTo || meta.template);
  return (
    log.category === 'COMMUNICATION' ||
    log.actionType?.startsWith('PAYMENT_MAIL_') ||
    log.action === 'SEND' ||
    (log.actionType === 'APPROVED' && hasEmailMeta) ||
    Boolean(log.canView && (log.channel || log.recipientName))
  );
}

function fieldChangeIsGreen(change: FieldChange): boolean {
  const fieldKey = String(change.field ?? '').toLowerCase();
  const label = change.label.toLowerCase();
  if (GREEN_FIELD_KEYS.has(fieldKey)) return true;
  return GREEN_FIELD_LABELS.some((token) => label.includes(token));
}

export function isGreenHighlightLog(
  log: ApplicationActivityLog,
  category: ActivityLogCategory,
  fieldChanges: FieldChange[],
): boolean {
  if (category === 'created' || category === 'state' || category === 'offer') return true;
  if (STATE_ACTIONS.has(log.actionType)) return true;
  return fieldChanges.some(fieldChangeIsGreen);
}

function isClaimActivity(log: ApplicationActivityLog, meta: Record<string, unknown>): boolean {
  if (CLAIM_ACTIONS.has(log.actionType)) return true;

  const desc = log.actionDescription.toLowerCase();
  if (desc.includes('claimed')) return true;
  if (desc.includes('returned this deal')) return true;

  const resource = metadataResource(meta);
  if (resource.includes('underwriter-claim') || resource.includes('scrubbing-claim')) {
    return true;
  }

  const subAction = String(meta.subAction ?? '').toLowerCase();
  if (subAction.includes('underwriter claim') || subAction.includes('scrubbing claim')) {
    return true;
  }

  return false;
}

export function resolveActivityLogCategory(log: ApplicationActivityLog): ActivityLogCategory {
  const meta = log.metadata ?? {};
  const resource = metadataResource(meta);
  const actionType = log.actionType ?? '';

  if (actionType === 'CREATE_APPLICATION') return 'created';
  if (isClaimActivity(log, meta)) return 'claimed';
  if (STATE_ACTIONS.has(actionType)) return 'state';
  if (WORKFLOW_ACTIONS.has(actionType)) return 'workflow';
  if (CONTRACT_ACTIONS.has(actionType) || meta.category === 'CONTRACT') return 'contract';
  if (actionType === 'APPLICATION_REJECTED' || resource === 'offer-decisions') return 'decision';
  if (actionType === 'FILE_UPLOADED' || actionType === 'DOCUMENT_REQUESTED') return 'documents';
  if (isCommunicationLog(log)) return 'communication';

  if (resource === 'bank-analysis') return 'bank_analysis';
  if (resource === 'terms-offers') return 'offer';

  const fieldChanges = extractFieldChanges(meta);
  if (fieldChanges.some((c) => fieldChangeIsGreen(c))) {
    if (fieldChanges.some((c) => {
      const key = String(c.field ?? '').toLowerCase();
      const label = c.label.toLowerCase();
      return key === 'loanamount' || label.includes('offer') || label.includes('loan amount');
    })) {
      return 'offer';
    }
    return 'state';
  }

  if (meta.offerAmount != null) return 'offer';

  return 'updates';
}

export function getCategoryLabel(category: ActivityLogCategory): string {
  return ACTIVITY_LOG_CATEGORIES.find((c) => c.id === category)?.label ?? 'Update';
}

type CategoryStyle = {
  badge: string;
  dot: string;
  card: string;
  title: string;
};

const CATEGORY_STYLES: Record<ActivityLogCategory, CategoryStyle> = {
  created: {
    badge: 'bg-emerald-500/15 text-emerald-800 border-emerald-200 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'ring-emerald-500/50 bg-emerald-600',
    card: 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20',
    title: 'text-emerald-900 dark:text-emerald-100',
  },
  state: {
    badge: 'bg-emerald-500/15 text-emerald-800 border-emerald-200 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'ring-emerald-500/50 bg-emerald-600',
    card: 'border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/25',
    title: 'text-emerald-900 dark:text-emerald-100',
  },
  offer: {
    badge: 'bg-emerald-500/15 text-emerald-800 border-emerald-200 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'ring-emerald-500/50 bg-emerald-600',
    card: 'border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/25',
    title: 'text-emerald-900 dark:text-emerald-100',
  },
  claimed: {
    badge: 'bg-violet-500/15 text-violet-800 border-violet-200 dark:text-violet-300 dark:border-violet-800',
    dot: 'ring-violet-500/50 bg-violet-600',
    card: 'border-violet-200/70 bg-violet-50/40 dark:border-violet-900/50 dark:bg-violet-950/20',
    title: 'text-violet-900 dark:text-violet-100',
  },
  workflow: {
    badge: 'bg-violet-500/15 text-violet-800 border-violet-200 dark:text-violet-300 dark:border-violet-800',
    dot: 'ring-violet-500/40 bg-violet-600',
    card: 'border-violet-200/60 bg-violet-50/30 dark:border-violet-900/40 dark:bg-violet-950/15',
    title: 'text-foreground',
  },
  communication: {
    badge: 'bg-cyan-500/15 text-cyan-800 border-cyan-200 dark:text-cyan-300 dark:border-cyan-800',
    dot: 'ring-cyan-500/40 bg-cyan-600',
    card: 'border-cyan-200/60 bg-cyan-50/30 dark:border-cyan-900/40 dark:bg-cyan-950/15',
    title: 'text-foreground',
  },
  documents: {
    badge: 'bg-amber-500/15 text-amber-900 border-amber-200 dark:text-amber-300 dark:border-amber-800',
    dot: 'ring-amber-500/40 bg-amber-600',
    card: 'border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/15',
    title: 'text-foreground',
  },
  contract: {
    badge: 'bg-indigo-500/15 text-indigo-800 border-indigo-200 dark:text-indigo-300 dark:border-indigo-800',
    dot: 'ring-indigo-500/40 bg-indigo-600',
    card: 'border-indigo-200/60 bg-indigo-50/30 dark:border-indigo-900/40 dark:bg-indigo-950/15',
    title: 'text-foreground',
  },
  bank_analysis: {
    badge: 'bg-sky-500/15 text-sky-800 border-sky-200 dark:text-sky-300 dark:border-sky-800',
    dot: 'ring-sky-500/40 bg-sky-600',
    card: 'border-sky-200/60 bg-sky-50/30 dark:border-sky-900/40 dark:bg-sky-950/15',
    title: 'text-foreground',
  },
  decision: {
    badge: 'bg-rose-500/15 text-rose-800 border-rose-200 dark:text-rose-300 dark:border-rose-800',
    dot: 'ring-rose-500/40 bg-rose-600',
    card: 'border-rose-200/60 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/15',
    title: 'text-foreground',
  },
  updates: {
    badge: 'bg-slate-500/10 text-slate-700 border-slate-200 dark:text-slate-300 dark:border-slate-700',
    dot: 'ring-primary/40 bg-primary',
    card: 'border-border/60 bg-secondary/40',
    title: 'text-foreground',
  },
};

export function getCategoryStyle(category: ActivityLogCategory): CategoryStyle {
  return CATEGORY_STYLES[category];
}

export function formatActorLabel(log: ApplicationActivityLog): string {
  const name = log.userName?.trim() || 'System';
  const role = log.userRole
    ? String(log.userRole).replace(/_/g, ' ').toLowerCase()
    : null;
  return role ? `${name} (${role})` : name;
}

export function getActorVerb(category: ActivityLogCategory): string {
  if (category === 'created') return 'Created by';
  if (category === 'claimed') return 'Claimed by';
  if (category === 'communication') return 'Sent by';
  return 'Changed by';
}

export function formatChangeValue(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return value;
}

export function extractSubActivityPreview(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const preview = metadata.preview ?? metadata.question ?? metadata.commentType;
  if (typeof preview !== 'string' || !preview.trim()) return null;
  return preview.trim();
}

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return '';
  const map: Record<string, string> = {
    EMAIL: 'Email',
    TEMPLATE: 'Template',
    DOCUMENT: 'Document',
  };
  return map[channel.toUpperCase()] ?? channel;
}

export function isGreenFieldChange(change: FieldChange): boolean {
  return fieldChangeIsGreen(change);
}

export function parseStatusParts(status: string | null | undefined): { queue: string; state: string } | null {
  if (!status) return null;
  const parts = status.split('/').map((p) => p.trim());
  if (parts.length < 2) return null;
  return { queue: parts[0], state: parts.slice(1).join(' / ') };
}

export type BankAnalysisDetail = {
  action: 'added' | 'updated' | 'removed';
  label: string;
  bankName: string | null;
  accountNumber: string | null;
};

export type GroupedChangeDetail = BankAnalysisDetail;

export type EnrichedActivityLog = {
  log: ApplicationActivityLog;
  category: ActivityLogCategory;
  fieldChanges: FieldChange[];
  isGreen: boolean;
  style: ReturnType<typeof getCategoryStyle>;
};

export type DisplayActivityLog = EnrichedActivityLog & {
  id: string;
  groupedLogs: ApplicationActivityLog[];
  isGrouped: boolean;
  bankAnalysisDetails: BankAnalysisDetail[];
  groupedChangeDetails: GroupedChangeDetail[];
  summaryDescription?: string;
};

const REPEATABLE_GROUP_MS = 5 * 60 * 1000;
const GROUPABLE_CATEGORIES = new Set<ActivityLogCategory>(['bank_analysis', 'updates']);

export function extractBankAnalysisDetail(log: ApplicationActivityLog): BankAnalysisDetail {
  const meta = log.metadata ?? {};
  const method = String(meta.method ?? '').toUpperCase();
  const subAction = String(meta.subAction ?? '').toUpperCase();
  const desc = log.actionDescription.toLowerCase();
  const changeSummary =
    meta.changeSummary != null && String(meta.changeSummary).trim()
      ? String(meta.changeSummary).trim()
      : null;

  let action: BankAnalysisDetail['action'] = 'updated';
  if (method === 'POST' || subAction.includes('_POST') || desc.includes('added bank')) {
    action = 'added';
  } else if (method === 'DELETE' || subAction.includes('_DELETE') || desc.includes('removed bank')) {
    action = 'removed';
  }

  const bankName =
    meta.bankName != null && String(meta.bankName).trim()
      ? String(meta.bankName).trim()
      : null;
  const accountNumber =
    meta.accountNumber != null && String(meta.accountNumber).trim()
      ? String(meta.accountNumber).trim()
      : null;

  if (changeSummary) {
    return {
      action,
      label: changeSummary,
      bankName,
      accountNumber,
    };
  }

  const parts: string[] = [];
  if (bankName) parts.push(bankName);
  if (accountNumber) parts.push(`acct ${accountNumber}`);

  const target = parts.length > 0 ? parts.join(' · ') : 'bank analysis data';
  const verb = action === 'added' ? 'Added' : action === 'removed' ? 'Removed' : 'Updated';

  return {
    action,
    label: `${verb} ${target}`,
    bankName,
    accountNumber,
  };
}

function resolveActionFromLog(
  log: ApplicationActivityLog,
  method: string,
  desc: string,
): GroupedChangeDetail['action'] {
  if (method === 'POST' || desc.includes('added ')) return 'added';
  if (method === 'DELETE' || desc.includes('removed ')) return 'removed';
  return 'updated';
}

export function extractGroupedChangeDetail(log: ApplicationActivityLog): GroupedChangeDetail {
  const category = resolveActivityLogCategory(log);
  if (category === 'bank_analysis') {
    return extractBankAnalysisDetail(log);
  }

  const meta = log.metadata ?? {};
  const method = String(meta.method ?? '').toUpperCase();
  const desc = log.actionDescription.toLowerCase();
  const changeSummary =
    meta.changeSummary != null && String(meta.changeSummary).trim()
      ? String(meta.changeSummary).trim()
      : null;
  const action = resolveActionFromLog(log, method, desc);

  if (changeSummary) {
    return {
      action,
      label: changeSummary,
      bankName: null,
      accountNumber: null,
    };
  }

  const resource = String(meta.resource ?? '').replace(/-/g, ' ').trim();
  const subAction = String(meta.subAction ?? '').replace(/_/g, ' ').trim();
  const target = resource || subAction || desc.replace(/\.$/, '');
  const verb = action === 'added' ? 'Added' : action === 'removed' ? 'Removed' : 'Updated';

  return {
    action,
    label: target ? `${verb} ${target}` : log.actionDescription,
    bankName: null,
    accountNumber: null,
  };
}

function normalizeActivitySignature(log: ApplicationActivityLog, category: ActivityLogCategory): string {
  const meta = log.metadata ?? {};
  const resource = String(meta.resource ?? '').toLowerCase();
  const method = String(meta.method ?? 'PATCH').toUpperCase();
  if (resource) return `${category}:${resource}:${method}`;
  const desc = log.actionDescription
    .replace(/^[A-Z_\s]+ [^(]+\([^)]*\)\s+/i, '')
    .replace(/^[A-Z_\s]+\s+[\w.]+\s+/i, '')
    .toLowerCase()
    .trim();
  return `${category}:${desc}`;
}

function dedupeGroupedDetails(details: GroupedChangeDetail[]): GroupedChangeDetail[] {
  const seen = new Set<string>();
  const result: GroupedChangeDetail[] = [];
  for (const detail of details) {
    const key = `${detail.action}|${detail.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(detail);
  }
  return result;
}

function buildGroupedSummary(
  logs: ApplicationActivityLog[],
  details: GroupedChangeDetail[],
  category: ActivityLogCategory,
): string {
  const actor = formatActorLabel(logs[0]);
  if (logs.length === 1) return logs[0].actionDescription;

  const categoryLabel = getCategoryLabel(category).toLowerCase();
  const added = details.filter((d) => d.action === 'added').length;
  const updated = details.filter((d) => d.action === 'updated').length;
  const removed = details.filter((d) => d.action === 'removed').length;
  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (updated) parts.push(`${updated} updated`);
  if (removed) parts.push(`${removed} removed`);
  const breakdown = parts.length > 0 ? parts.join(', ') : `${logs.length} changes`;
  return `${actor} updated ${categoryLabel} (${breakdown})`;
}

function canGroupEntries(current: EnrichedActivityLog, next: EnrichedActivityLog): boolean {
  if (!GROUPABLE_CATEGORIES.has(current.category) || current.category !== next.category) {
    return false;
  }
  if (current.log.userId !== next.log.userId) return false;
  if (
    normalizeActivitySignature(current.log, current.category) !==
    normalizeActivitySignature(next.log, next.category)
  ) {
    return false;
  }

  const currentTime = new Date(current.log.createdAt).getTime();
  const nextTime = new Date(next.log.createdAt).getTime();
  return Math.abs(currentTime - nextTime) <= REPEATABLE_GROUP_MS;
}

export function groupActivityLogEntries(
  entries: EnrichedActivityLog[],
): DisplayActivityLog[] {
  const result: DisplayActivityLog[] = [];
  let index = 0;

  while (index < entries.length) {
    const current = entries[index];

    if (!GROUPABLE_CATEGORIES.has(current.category)) {
      const detail = extractGroupedChangeDetail(current.log);
      result.push({
        ...current,
        id: current.log.id,
        groupedLogs: [current.log],
        isGrouped: false,
        bankAnalysisDetails: current.category === 'bank_analysis' ? [detail] : [],
        groupedChangeDetails: [],
      });
      index += 1;
      continue;
    }

    const group = [current];
    let nextIndex = index + 1;
    while (nextIndex < entries.length && canGroupEntries(group[group.length - 1], entries[nextIndex])) {
      group.push(entries[nextIndex]);
      nextIndex += 1;
    }

    const groupedLogs = group.map((entry) => entry.log);
    const groupedChangeDetails = dedupeGroupedDetails(
      groupedLogs.map((log) => extractGroupedChangeDetail(log)),
    );
    const bankAnalysisDetails =
      current.category === 'bank_analysis' ? groupedChangeDetails : [];

    if (group.length === 1) {
      result.push({
        ...current,
        id: current.log.id,
        groupedLogs,
        isGrouped: false,
        bankAnalysisDetails,
        groupedChangeDetails: current.category === 'updates' ? groupedChangeDetails : [],
      });
    } else {
      const representative = group[0];
      result.push({
        ...representative,
        id: `group-${representative.log.id}`,
        groupedLogs,
        isGrouped: true,
        bankAnalysisDetails,
        groupedChangeDetails,
        summaryDescription: buildGroupedSummary(
          groupedLogs,
          groupedChangeDetails,
          representative.category,
        ),
      });
    }

    index = nextIndex;
  }

  return result;
}

export function enrichActivityLogs(logs: ApplicationActivityLog[]): DisplayActivityLog[] {
  const enriched: EnrichedActivityLog[] = logs.map((log) => {
    const category = resolveActivityLogCategory(log);
    const fieldChanges = extractFieldChanges(log.metadata);
    return {
      log,
      category,
      fieldChanges,
      isGreen: isGreenHighlightLog(log, category, fieldChanges),
      style: getCategoryStyle(category),
    };
  });

  return groupActivityLogEntries(enriched);
}

export function getActorVerbForLog(
  category: ActivityLogCategory,
  log: ApplicationActivityLog,
): string {
  if (category === 'claimed' || log.actionType === 'UNDERWRITER_CLAIMED') return 'Claimed by';
  return getActorVerb(category);
}
