import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/redux/store';
import {
  getApplicationActivityLogs,
  getApplicationActivityLogContent,
  type ApplicationActivityLog,
} from '@/redux/actions/applicationActivityLogActions';
import type { ActivityLogContent } from '@/redux/actions/activityLogActions';
import {
  ACTIVITY_LOG_CATEGORIES,
  channelLabel,
  enrichActivityLogs,
  extractSubActivityPreview,
  formatActorLabel,
  formatChangeValue,
  getActorVerbForLog,
  getCategoryLabel,
  isGreenFieldChange,
  parseStatusParts,
  type ActivityLogCategory,
  type FieldChange,
} from '@/lib/activityLogDisplay';
import {
  ArrowRight,
  Clock,
  Eye,
  FileText,
  Mail,
  MessageCircle,
  User,
} from 'lucide-react';
import { cn, formatDateTimeUS } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ApplicationSheetActivityLogProps = {
  applicationId: string;
  className?: string;
  headerClassName?: string;
};

function GroupedChangesPanel({
  title,
  details,
  saveCount,
  tone = 'sky',
}: {
  title: string;
  details: { action: string; label: string }[];
  saveCount: number;
  tone?: 'sky' | 'slate';
}) {
  if (details.length === 0) return null;

  const toneClasses =
    tone === 'sky'
      ? {
          wrap: 'border-sky-200 bg-sky-50/80 dark:border-sky-900/60 dark:bg-sky-950/30',
          heading: 'text-sky-700 dark:text-sky-300',
          text: 'text-sky-900 dark:text-sky-100',
          badge: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
        }
      : {
          wrap: 'border-border/60 bg-background/70',
          heading: 'text-muted-foreground',
          text: 'text-foreground/90',
          badge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
        };

  return (
    <div className={cn('mt-3 rounded-lg border p-3', toneClasses.wrap)}>
      <p
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.08em] mb-2',
          toneClasses.heading,
        )}
      >
        {title}
        {saveCount > 1 ? ` · ${saveCount} saves grouped` : ''}
      </p>
      <ul className="space-y-1.5">
        {details.map((detail, index) => (
          <li
            key={`${detail.label}-${index}`}
            className={cn('flex items-start gap-2 text-sm', toneClasses.text)}
          >
            <span
              className={cn(
                'mt-0.5 inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                detail.action === 'added'
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                  : detail.action === 'removed'
                    ? 'bg-rose-500/15 text-rose-800 dark:text-rose-300'
                    : toneClasses.badge,
              )}
            >
              {detail.action}
            </span>
            <span>
              {detail.label.replace(/^(Added|Updated|Removed)\s+/i, '') || detail.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BankAnalysisDetailsPanel({
  details,
  saveCount,
}: {
  details: { action: string; label: string }[];
  saveCount: number;
}) {
  return (
    <GroupedChangesPanel
      title="Bank analysis changes"
      details={details}
      saveCount={saveCount}
      tone="sky"
    />
  );
}

function bodyLooksLikeHtml(body: string): boolean {
  return /<[a-z][\s\S]*>/i.test(body);
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

function StateTransitionPanel({
  log,
  fieldChanges,
}: {
  log: ApplicationActivityLog;
  fieldChanges: FieldChange[];
}) {
  const stateChanges = fieldChanges.filter(
    (c) =>
      isGreenFieldChange(c) &&
      (String(c.field ?? '').toLowerCase().includes('state') ||
        String(c.field ?? '').toLowerCase().includes('queue') ||
        c.label.toLowerCase().includes('state') ||
        c.label.toLowerCase().includes('queue')),
  );

  if (stateChanges.length > 0) {
    return (
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300 mb-2">
          State &amp; queue change
        </p>
        <ul className="space-y-2">
          {stateChanges.map((change) => (
            <li
              key={`${change.field ?? change.label}-state`}
              className="text-sm text-emerald-900 dark:text-emerald-100"
            >
              <span className="font-semibold">{change.label}:</span>{' '}
              <span className="text-emerald-700/80 dark:text-emerald-300/80">
                {formatChangeValue(change.previous)}
              </span>
              <ArrowRight className="mx-1 inline size-3.5 text-emerald-600" />
              <span className="font-semibold text-emerald-800 dark:text-emerald-200">
                {formatChangeValue(change.current)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const previous = parseStatusParts(log.previousStatus);
  const current = parseStatusParts(log.currentStatus);
  if (!previous && !current) return null;
  if (
    previous?.queue === current?.queue &&
    previous?.state === current?.state
  ) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300 mb-2">
        Deal status
      </p>
      <div className="grid gap-2 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded-md bg-white/70 px-3 py-2 dark:bg-emerald-950/40">
          <p className="text-[10px] uppercase tracking-wide text-emerald-700/70 dark:text-emerald-400/70">
            Before
          </p>
          <p className="font-medium text-emerald-900 dark:text-emerald-100">
            {log.previousStatus ?? '—'}
          </p>
        </div>
        <ArrowRight className="hidden size-4 text-emerald-600 sm:block" />
        <div className="rounded-md bg-emerald-100/80 px-3 py-2 dark:bg-emerald-900/40">
          <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            After
          </p>
          <p className="font-semibold text-emerald-900 dark:text-emerald-50">
            {log.currentStatus ?? '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

function OfferAmountPanel({ fieldChanges }: { fieldChanges: FieldChange[] }) {
  const offerChanges = fieldChanges.filter((c) => {
    const field = String(c.field ?? '').toLowerCase();
    const label = c.label.toLowerCase();
    return (
      field === 'loanamount' ||
      field === 'offeramount' ||
      label.includes('offer') ||
      label.includes('loan amount')
    );
  });

  if (offerChanges.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300 mb-2">
        Offer &amp; amount
      </p>
      <ul className="space-y-2">
        {offerChanges.map((change) => (
          <li
            key={`${change.field ?? change.label}-offer`}
            className="text-sm text-emerald-900 dark:text-emerald-100"
          >
            <span className="font-semibold">{change.label}:</span>{' '}
            <span className="text-emerald-700/80 dark:text-emerald-300/80">
              {formatChangeValue(change.previous)}
            </span>
            <ArrowRight className="mx-1 inline size-3.5 text-emerald-600" />
            <span className="font-semibold text-emerald-800 dark:text-emerald-200">
              {formatChangeValue(change.current)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OtherChangesPanel({
  logId,
  fieldChanges,
}: {
  logId: string;
  fieldChanges: FieldChange[];
}) {
  const otherChanges = fieldChanges.filter((c) => !isGreenFieldChange(c));
  if (otherChanges.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-background/70 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
        Changes
      </p>
      <ul className="space-y-2">
        {otherChanges.map((change) => (
          <li
            key={`${logId}-${change.field ?? change.label}`}
            className="text-sm text-foreground/90"
          >
            <span className="font-medium">{change.label}:</span>{' '}
            <span className="text-muted-foreground">
              {formatChangeValue(change.previous)}
            </span>
            <span className="mx-1 text-muted-foreground">→</span>
            <span>{formatChangeValue(change.current)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ApplicationSheetActivityLog({
  applicationId,
  className,
  headerClassName,
}: ApplicationSheetActivityLogProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { logs, loading, error } = useSelector((state: RootState) => state.activityLogs);

  const [categoryFilter, setCategoryFilter] = useState<ActivityLogCategory | 'all'>('all');
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewContent, setViewContent] = useState<ActivityLogContent | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) return;
    dispatch(getApplicationActivityLogs(applicationId));
  }, [applicationId, dispatch]);

  const appLogs = logs.filter(
    (log): log is ApplicationActivityLog =>
      typeof log === 'object' &&
      log !== null &&
      'id' in log &&
      'actionDescription' in log,
  );

  const displayLogs = useMemo(() => enrichActivityLogs(appLogs), [appLogs]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<ActivityLogCategory | 'all', number>();
    counts.set('all', displayLogs.length);
    for (const entry of displayLogs) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    return counts;
  }, [displayLogs]);

  const visibleLogs = useMemo(
    () =>
      categoryFilter === 'all'
        ? displayLogs
        : displayLogs.filter((entry) => entry.category === categoryFilter),
    [displayLogs, categoryFilter],
  );

  const formatTimestamp = (iso: string) => formatDateTimeUS(iso, iso);

  const openView = async (log: ApplicationActivityLog) => {
    setViewOpen(true);
    setViewLoading(true);
    setViewContent(null);
    setViewError(null);
    try {
      const content = await dispatch(
        getApplicationActivityLogContent({ applicationId, logId: log.id }),
      ).unwrap();
      setViewContent(content);
    } catch (e) {
      setViewError(typeof e === 'string' ? e : 'Failed to load content');
    } finally {
      setViewLoading(false);
    }
  };

  const previewBody = viewContent?.body?.trim() ?? '';
  const previewIsHtml = previewBody ? bodyLooksLikeHtml(previewBody) : false;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col bg-background',
        className,
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-3 border-b border-border/60 bg-muted/40 px-6 pb-4',
          headerClassName,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <h2 className="text-md font-semibold text-foreground/90 flex items-center gap-2">
              Activity Log
            </h2>
            <p className="text-xs text-muted-foreground">
              Categorized timeline — who created, who changed state, offers, workflow, and more.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1 border border-border/60 shrink-0">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
              Most recent first
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {ACTIVITY_LOG_CATEGORIES.map((cat) => {
            const count = categoryCounts.get(cat.id) ?? 0;
            if (cat.id !== 'all' && count === 0) return null;
            const active = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/70 bg-background text-muted-foreground hover:bg-muted/60',
                )}
              >
                {cat.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px]',
                    active ? 'bg-primary-foreground/20' : 'bg-muted',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && (
          <p className="text-xs text-muted-foreground mb-3">Loading activity logs...</p>
        )}
        {error && !loading && (
          <p className="text-xs text-red-500 mb-3">Failed to load activity logs: {error}</p>
        )}
        {!loading && !error && visibleLogs.length === 0 && (
          <p className="text-xs text-muted-foreground mb-3">
            {categoryFilter === 'all'
              ? 'No activity has been recorded for this application yet.'
              : `No ${getCategoryLabel(categoryFilter).toLowerCase()} events yet.`}
          </p>
        )}

        <div className="relative">
          <div className="absolute left-[0.58rem] top-2 bottom-0 w-px bg-border/60" />

          <div className="space-y-5">
            {visibleLogs.map((entry) => {
              const {
                log,
                category,
                fieldChanges,
                isGreen,
                style,
                bankAnalysisDetails,
                groupedChangeDetails,
                groupedLogs,
                summaryDescription,
                id,
              } = entry;
              const isComm = isCommunicationLog(log);
              const subActivityPreview = extractSubActivityPreview(log.metadata);
              const actorLabel = formatActorLabel(log);
              const actorVerb = getActorVerbForLog(category, log);
              const showStatePanel =
                category === 'state' ||
                category === 'created' ||
                log.actionType === 'STATUS_CHANGED' ||
                log.actionType === 'QUEUE_CHANGED';
              const showOfferPanel = category === 'offer';
              const displayDescription = summaryDescription ?? log.actionDescription;

              return (
                <div key={id} className="relative flex items-start gap-4">
                  <div className="relative z-10 mt-1">
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 border-background ring-2 ring-offset-0 flex items-center justify-center',
                        style.dot,
                      )}
                    >
                      <span className="block w-1.5 h-1.5 rounded-full bg-background" />
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex-1 rounded-xl border p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]',
                      style.card,
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                              style.badge,
                            )}
                          >
                            {getCategoryLabel(category)}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>{formatTimestamp(log.createdAt)}</span>
                          </div>
                        </div>

                        <div
                          className={cn(
                            'flex items-start gap-2 text-sm font-semibold',
                            isGreen ? style.title : 'text-foreground',
                          )}
                        >
                          {isComm ? (
                            <Mail className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
                          ) : (
                            <FileText
                              className={cn(
                                'w-4 h-4 shrink-0 mt-0.5',
                                isGreen ? 'text-emerald-600' : 'text-primary',
                              )}
                            />
                          )}
                          <span>{displayDescription}</span>
                        </div>

                        <div className="rounded-md border border-border/50 bg-background/60 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {actorVerb}
                          </p>
                          <p
                            className={cn(
                              'mt-0.5 text-sm font-medium',
                              isGreen
                                ? 'text-emerald-800 dark:text-emerald-200'
                                : 'text-foreground',
                            )}
                          >
                            <User className="mr-1 inline size-3.5 text-slate-500" />
                            {actorLabel}
                          </p>
                        </div>

                        {isComm && (
                          <div className="flex flex-wrap gap-2 text-[11px]">
                            {log.channel && (
                              <span className="rounded-full bg-cyan-500/10 text-cyan-800 dark:text-cyan-300 px-2 py-0.5 font-semibold uppercase">
                                {channelLabel(log.channel)}
                              </span>
                            )}
                            {log.recipientType && (
                              <span className="rounded-full bg-slate-500/10 px-2 py-0.5 uppercase text-muted-foreground">
                                {log.recipientType}
                              </span>
                            )}
                            {log.recipientName && (
                              <span className="text-muted-foreground truncate max-w-full">
                                To: {log.recipientName}
                              </span>
                            )}
                            {log.templateName && (
                              <span className="text-muted-foreground">
                                Template: {log.templateName}
                              </span>
                            )}
                          </div>
                        )}

                        {log.currentStatus && (
                          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5 text-slate-500" />
                              <span>{log.currentStatus}</span>
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span
                          className={cn(
                            'inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.1em] border',
                            style.badge,
                          )}
                        >
                          {log.actionType.replace(/_/g, ' ')}
                        </span>
                        {log.canView && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 cursor-pointer gap-1 text-xs"
                            onClick={() => openView(log)}
                          >
                            <Eye className="size-3.5" /> View
                          </Button>
                        )}
                      </div>
                    </div>

                    {typeof log.metadata?.reason === 'string' ? (
                      <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
                        {log.metadata.reason}
                      </p>
                    ) : null}

                    {subActivityPreview ? (
                      <p className="mt-3 text-sm text-foreground/80 leading-relaxed italic">
                        “{subActivityPreview}”
                      </p>
                    ) : null}

                    {category === 'bank_analysis' ? (
                      <BankAnalysisDetailsPanel
                        details={bankAnalysisDetails}
                        saveCount={groupedLogs.length}
                      />
                    ) : null}

                    {category === 'updates' && groupedChangeDetails.length > 0 ? (
                      <GroupedChangesPanel
                        title="What changed"
                        details={groupedChangeDetails}
                        saveCount={groupedLogs.length}
                        tone="slate"
                      />
                    ) : null}

                    {showStatePanel ? (
                      <StateTransitionPanel log={log} fieldChanges={fieldChanges} />
                    ) : null}

                    {showOfferPanel ? (
                      <OfferAmountPanel fieldChanges={fieldChanges} />
                    ) : null}

                    <OtherChangesPanel logId={log.id} fieldChanges={fieldChanges} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sent communication</DialogTitle>
          </DialogHeader>
          {viewLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {viewError && <p className="text-sm text-red-500">{viewError}</p>}
          {!viewLoading && !viewError && viewContent && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Channel</p>
                  <p>{channelLabel(viewContent.channel) || '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Recipient type</p>
                  <p>{viewContent.recipientType ?? '—'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Recipient</p>
                <p className="break-all">{viewContent.recipient ?? '—'}</p>
              </div>
              {viewContent.templateName && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Template</p>
                  <p>{viewContent.templateName}</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase text-muted-foreground">Subject</p>
                <p>{viewContent.subject ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Message</p>
                <div className="rounded-md border border-border bg-muted/20 p-3 mt-1">
                  {previewBody ? (
                    previewIsHtml ? (
                      <div
                        className="max-h-[50vh] overflow-y-auto prose prose-sm dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: previewBody }}
                      />
                    ) : (
                      <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-xs">
                        {previewBody}
                      </pre>
                    )
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      {(viewContent as { note?: string }).note ??
                        'No message body stored for this entry.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
