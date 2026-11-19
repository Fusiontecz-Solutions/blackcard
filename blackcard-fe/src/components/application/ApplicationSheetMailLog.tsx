import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/redux/store';
import {
  getApplicationActivityLogs,
  getApplicationActivityLogContent,
  type ApplicationActivityLog,
} from '@/redux/actions/applicationActivityLogActions';
import type { ActivityLogContent } from '@/redux/actions/activityLogActions';
import {
  fetchPaymentMailLogsForApplication,
  type PaymentMailLogEntry,
} from '@/pages/payment/paymentMailLogStorage';
import {
  Clock,
  Eye,
  Mail,
  Paperclip,
  User,
  FileText,
  Tag,
} from 'lucide-react';
import { cn, formatDateTimeUS } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ApplicationSheetMailLogProps = {
  applicationId: string;
  /** When false, polling pauses (e.g. mail log dialog closed). Defaults to true. */
  active?: boolean;
  /** How often to refetch delivery status while active. Defaults to 10s. */
  pollIntervalMs?: number;
  className?: string;
  headerClassName?: string;
};

const DEFAULT_MAIL_LOG_POLL_MS = Number(
  import.meta.env.VITE_MAIL_LOG_POLL_MS ?? 5_000,
);

type MailLogRow = {
  id: string;
  at: string;
  recipient: string;
  subject: string;
  templateName: string | null;
  channel: string | null;
  status: string;
  attachments: string[];
  source: 'activity' | 'payment';
  activityLog?: ApplicationActivityLog;
  paymentLog?: PaymentMailLogEntry;
};

function isCommunicationLog(log: ApplicationActivityLog): boolean {
  const meta = log.metadata ?? {};
  const templateKey = typeof meta.template === 'string' ? meta.template.trim().toLowerCase() : '';
  const hasEmailMeta = Boolean(meta.emailSentTo || meta.template || meta.outboundCommunicationId);
  return (
    log.category === 'COMMUNICATION' ||
    log.actionType?.startsWith('PAYMENT_MAIL_') ||
    log.action === 'SEND' ||
    (log.actionType === 'APPROVED' && hasEmailMeta) ||
    (log.actionType === 'APPLICATION_REJECTED' && templateKey === 'rejection') ||
    (log.actionType === 'DOCUMENT_REQUESTED' && templateKey === 'document-request') ||
    Boolean(log.canView && (log.channel || log.recipientName))
  );
}

function channelLabel(channel: string | null | undefined): string {
  if (!channel) return '—';
  const map: Record<string, string> = {
    EMAIL: 'Email',
    TEMPLATE: 'Template',
    DOCUMENT: 'Document',
  };
  return map[channel.toUpperCase()] ?? channel;
}

function resolveActivityMailStatus(log: ApplicationActivityLog): string {
  const type = String(log.actionType ?? '').toUpperCase();
  if (type.includes('FAILED')) return 'failed';
  if (type.includes('QUEUED')) return 'queued';

  const delivery = extractDeliveryMeta(log);
  if (delivery) return resolveStatusFromDeliveryTimeline(delivery);

  const meta = log.metadata ?? {};
  const metaStatus = meta.status;
  if (typeof metaStatus === 'string' && metaStatus.trim()) {
    return metaStatus.trim().toLowerCase();
  }
  return 'sent';
}

/** Canonical progression: sent → delivered → opened → clicked */
function resolveStatusFromDeliveryTimeline(delivery: DeliveryMeta): string {
  if (delivery.clickedAt) return 'clicked';
  if (delivery.openedAt || (delivery.openCount ?? 0) > 0) return 'opened';
  if (delivery.deliveredAt) return 'delivered';
  if (delivery.sentAt) return 'sent';
  return delivery.status?.trim().toLowerCase() ?? 'sent';
}

function extractAttachmentNames(
  log: ApplicationActivityLog,
  content?: ActivityLogContent | null,
): string[] {
  const meta = log.metadata ?? {};
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
    const template = (log.templateName ?? meta.templateName ?? '').toString().trim();
    if (template) {
      return [template.toLowerCase().endsWith('.pdf') ? template : `${template}.pdf`];
    }
    return ['Letter PDF'];
  }

  if (content?.documentName) push(content.documentName);
  return [...new Set(names)];
}

function resolveMailLogHeading(row: MailLogRow): string {
  const meta = row.activityLog?.metadata ?? {};
  const templateKey =
    typeof meta.template === 'string' ? meta.template.trim().toLowerCase() : '';
  const isIsoApprovalEmail =
    row.activityLog?.actionType === 'APPROVED' ||
    templateKey === 'approval' ||
    templateKey === 'application-approved' ||
    templateKey === 'offer-updated';

  if (templateKey === 'rejection') {
    return 'Application declined template';
  }
  if (templateKey === 'document-request') {
    return 'Document request template';
  }

  if (isIsoApprovalEmail) {
    if (templateKey === 'offer-updated' || meta.resend === true) {
      return 'Update offer template';
    }
    if (templateKey === 'approval' || templateKey === 'application-approved') {
      return 'Application approved template';
    }
    if (row.templateName?.trim()) {
      return row.templateName.trim();
    }
  }

  return row.subject?.trim() || row.templateName?.trim() || '—';
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case 'sent':
    case 'processed':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'delivered':
      return 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300';
    case 'opened':
    case 'open':
      return 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300';
    case 'clicked':
    case 'click':
      return 'border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300';
    case 'failed':
    case 'bounced':
    case 'bounce':
    case 'dropped':
      return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
    case 'spam':
      return 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300';
    case 'deferred':
    case 'queued':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300';
  }
}

const STATUS_LABELS: Record<string, string> = {
  sent: 'Sent',
  processed: 'Sent',
  delivered: 'Delivered',
  opened: 'Opened',
  open: 'Opened',
  clicked: 'Clicked',
  click: 'Clicked',
  deferred: 'Deferred',
  queued: 'Queued',
  failed: 'Failed',
  bounced: 'Bounced',
  bounce: 'Bounced',
  dropped: 'Dropped',
  spam: 'Spam',
  unsubscribed: 'Unsubscribed',
};

function statusLabel(status: string): string {
  const normalized = status.toLowerCase();
  return STATUS_LABELS[normalized] ?? status;
}

type DeliveryMeta = {
  status?: string;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  bouncedAt?: string;
  openCount?: number;
  clickCount?: number;
  bounceReason?: string;
  lastClickedUrl?: string;
  lastEvent?: string;
  lastEventAt?: string;
};

function extractDeliveryMeta(log?: ApplicationActivityLog): DeliveryMeta | null {
  const delivery = log?.metadata?.delivery;
  if (delivery && typeof delivery === 'object') {
    return delivery as DeliveryMeta;
  }
  return null;
}

function bodyLooksLikeHtml(body: string): boolean {
  return /<[a-z][\s\S]*>/i.test(body);
}

export default function ApplicationSheetMailLog({
  applicationId,
  active = true,
  pollIntervalMs = DEFAULT_MAIL_LOG_POLL_MS,
  className,
  headerClassName,
}: ApplicationSheetMailLogProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { logs, loading, error } = useSelector((state: RootState) => state.activityLogs);

  const [paymentLogs, setPaymentLogs] = useState<PaymentMailLogEntry[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewContent, setViewContent] = useState<ActivityLogContent | null>(null);
  const [viewPayment, setViewPayment] = useState<PaymentMailLogEntry | null>(null);
  const [viewActivityLogId, setViewActivityLogId] = useState<string | null>(null);
  const [viewAttachments, setViewAttachments] = useState<string[]>([]);
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewDelivery, setViewDelivery] = useState<DeliveryMeta | null>(null);

  const refreshPaymentMailLogs = useCallback(
    async (opts?: { showLoading?: boolean }) => {
      if (!applicationId) return;
      const showLoading = opts?.showLoading ?? false;
      if (showLoading) setPaymentLoading(true);
      try {
        const data = await fetchPaymentMailLogsForApplication(applicationId);
        setPaymentLogs(data);
      } catch {
        if (showLoading) setPaymentLogs([]);
      } finally {
        if (showLoading) setPaymentLoading(false);
      }
    },
    [applicationId],
  );

  const refreshActivityMailLogs = useCallback(() => {
    if (!applicationId) return;
    void dispatch(getApplicationActivityLogs(applicationId));
  }, [applicationId, dispatch]);

  const refreshAllMailLogs = useCallback(
    (opts?: { showLoading?: boolean }) => {
      refreshActivityMailLogs();
      void refreshPaymentMailLogs(opts);
    },
    [refreshActivityMailLogs, refreshPaymentMailLogs],
  );

  useEffect(() => {
    setInitialLoadDone(false);
  }, [applicationId]);

  useEffect(() => {
    if (!applicationId || !active) return;

    refreshAllMailLogs({ showLoading: true });

    const intervalMs = Math.max(5_000, pollIntervalMs);
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      refreshAllMailLogs({ showLoading: false });
    }, intervalMs);

    const onPaymentLogUpdated = () => refreshAllMailLogs({ showLoading: false });
    window.addEventListener('payment-mail-log-updated', onPaymentLogUpdated);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('payment-mail-log-updated', onPaymentLogUpdated);
    };
  }, [applicationId, active, pollIntervalMs, refreshAllMailLogs]);

  useEffect(() => {
    if (!loading && !paymentLoading) {
      setInitialLoadDone(true);
    }
  }, [loading, paymentLoading]);

  useEffect(() => {
    if (!viewOpen) return;

    if (viewActivityLogId) {
      const updated = logs.find(
        (row): row is ApplicationActivityLog =>
          typeof row === 'object' &&
          row !== null &&
          'id' in row &&
          (row as ApplicationActivityLog).id === viewActivityLogId,
      );
      if (updated) setViewDelivery(extractDeliveryMeta(updated));
      return;
    }

    if (viewPayment) {
      const linkedActivity = logs.find(
        (row): row is ApplicationActivityLog =>
          typeof row === 'object' &&
          row !== null &&
          'metadata' in row &&
          (row as ApplicationActivityLog).metadata?.paymentMailLogId === viewPayment.id,
      );
      setViewDelivery(viewPayment.delivery ?? extractDeliveryMeta(linkedActivity));
    }
  }, [logs, viewOpen, viewActivityLogId, viewPayment]);

  const rows = useMemo((): MailLogRow[] => {
    const communicationActivityLogs = logs.filter(
      (log): log is ApplicationActivityLog =>
        typeof log === 'object' &&
        log !== null &&
        'id' in log &&
        'actionDescription' in log &&
        isCommunicationLog(log as ApplicationActivityLog),
    );

    const activityRows = communicationActivityLogs.map((log) => ({
        id: `activity-${log.id}`,
        at: log.createdAt,
        recipient: log.recipientName ?? '—',
        subject: log.subject ?? log.actionDescription ?? '—',
        templateName: log.templateName ?? null,
        channel: log.channel ?? null,
        status: resolveActivityMailStatus(log),
        attachments: extractAttachmentNames(log),
        source: 'activity' as const,
        activityLog: log,
      }));

    const paymentLogIdsInActivity = new Set(
      communicationActivityLogs
        .map((log) => {
          const meta = log.metadata ?? {};
          return typeof meta.paymentMailLogId === 'string' ? meta.paymentMailLogId : null;
        })
        .filter((id): id is string => Boolean(id)),
    );

    const paymentRows = paymentLogs
      .filter((log) => !paymentLogIdsInActivity.has(log.id))
      .map((log) => ({
      id: `payment-${log.id}`,
      at: log.at,
      recipient: log.recipient,
      subject: log.subject,
      templateName: log.templateName,
      channel: log.category === 'letter' ? 'DOCUMENT' : 'TEMPLATE',
      status: log.delivery
        ? resolveStatusFromDeliveryTimeline(log.delivery as DeliveryMeta)
        : log.status,
      attachments: log.attachments?.length ? log.attachments : [],
      source: 'payment' as const,
      paymentLog: log,
    }));

    return [...activityRows, ...paymentRows].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [logs, paymentLogs]);

  const openActivityView = async (log: ApplicationActivityLog) => {
    setViewOpen(true);
    setViewLoading(true);
    setViewContent(null);
    setViewPayment(null);
    setViewActivityLogId(log.id);
    setViewError(null);
    setViewDelivery(extractDeliveryMeta(log));
    setViewAttachments(extractAttachmentNames(log));
    try {
      const content = await dispatch(
        getApplicationActivityLogContent({ applicationId, logId: log.id }),
      ).unwrap();
      setViewContent(content);
      setViewAttachments(
        content.attachments?.length
          ? content.attachments
          : extractAttachmentNames(log, content),
      );
      if (content.delivery) setViewDelivery(content.delivery as DeliveryMeta);
    } catch (e) {
      setViewError(typeof e === 'string' ? e : 'Failed to load mail content');
    } finally {
      setViewLoading(false);
    }
  };

  const openPaymentView = (log: PaymentMailLogEntry) => {
    setViewOpen(true);
    setViewLoading(false);
    setViewContent(null);
    setViewPayment(log);
    setViewActivityLogId(null);
    setViewError(null);
    const linkedActivity = logs.find(
      (row): row is ApplicationActivityLog =>
        typeof row === 'object' &&
        row !== null &&
        'metadata' in row &&
        (row as ApplicationActivityLog).metadata?.paymentMailLogId === log.id,
    );
    setViewDelivery(log.delivery ?? extractDeliveryMeta(linkedActivity));
    setViewAttachments(
      log.attachments?.length
        ? log.attachments
        : log.templateName
          ? [log.templateName]
          : [],
    );
  };

  const previewBody =
    viewPayment?.body?.trim() ?? viewContent?.body?.trim() ?? '';
  const previewIsHtml = previewBody ? bodyLooksLikeHtml(previewBody) : false;
  const isLoading = !initialLoadDone && (loading || paymentLoading);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col bg-background',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between border-b border-border/60 bg-muted/40 px-6 pb-3',
          headerClassName,
        )}
      >
        <div className="space-y-0.5">
          <h2 className="text-md flex items-center gap-2 font-semibold text-foreground/90">
            <Mail className="h-4 w-4 text-cyan-600" aria-hidden />
            Mail Log
          </h2>
          <p className="text-xs text-muted-foreground">
            Emails and templates sent for this deal — attachments and delivery status.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/70 px-3 py-1">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Most recent first
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {isLoading && (
          <p className="mb-3 text-xs text-muted-foreground">Loading mail logs…</p>
        )}
        {error && !loading && (
          <p className="mb-3 text-xs text-red-500">
            Failed to load mail logs: {error}
          </p>
        )}
        {!isLoading && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No emails or templates have been logged for this application yet.
          </p>
        )}

        {rows.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">When</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead className="min-w-[140px]">Heading</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="min-w-[120px]">Attachments</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4 text-xs text-foreground">
                      {formatDateTimeUS(row.at, row.at)}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs">
                      {row.recipient}
                    </TableCell>
                    <TableCell className="max-w-[200px] whitespace-normal break-words text-xs">
                      {resolveMailLogHeading(row)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {channelLabel(row.channel)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.attachments.length > 0 ? (
                        <ul className="space-y-1">
                          {row.attachments.map((name) => (
                            <li
                              key={`${row.id}-${name}`}
                              className="flex items-center gap-1 text-foreground"
                            >
                              <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="truncate">{name}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-wide',
                          statusBadgeClass(row.status),
                        )}
                      >
                        {statusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 cursor-pointer gap-1 text-xs"
                        onClick={() => {
                          if (row.activityLog) void openActivityView(row.activityLog);
                          else if (row.paymentLog) openPaymentView(row.paymentLog);
                        }}
                      >
                        <Eye className="size-3.5" aria-hidden />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="flex max-h-[92vh] w-[min(96vw,56rem)] max-w-[56rem] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
          <div className="shrink-0 border-b border-cyan-200/60 bg-gradient-to-r from-cyan-50 via-white to-sky-50 px-6 py-5 pr-14 dark:border-cyan-900/40 dark:from-cyan-950/40 dark:via-card dark:to-sky-950/30">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-600/10 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300">
                  <Mail className="h-4 w-4" aria-hidden />
                </span>
                Mail Details
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {viewPayment?.subject ?? viewContent?.subject ?? 'Sent communication'}
              </p>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-6 py-5">
            {viewLoading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {viewError && <p className="text-sm text-red-500">{viewError}</p>}
            {!viewLoading && !viewError && (viewContent || viewPayment) && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        'mt-2 text-[11px] font-semibold uppercase',
                        statusBadgeClass(
                          viewDelivery?.status ??
                            viewPayment?.status ??
                            viewContent?.status ??
                            'sent',
                        ),
                      )}
                    >
                      {statusLabel(
                        viewDelivery?.status ??
                          viewPayment?.status ??
                          viewContent?.status ??
                          'sent',
                      )}
                    </Badge>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Type
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
                      <Tag className="h-4 w-4 text-cyan-600" aria-hidden />
                      {viewPayment
                        ? 'Template'
                        : channelLabel(viewContent?.channel) || '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-4 sm:col-span-2 lg:col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Recipient
                    </p>
                    <p className="mt-2 flex items-start gap-2 break-all text-sm font-medium text-foreground">
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" aria-hidden />
                      {viewPayment?.recipient ?? viewContent?.recipient ?? '—'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Subject
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-snug text-foreground">
                      {viewPayment?.subject ?? viewContent?.subject ?? '—'}
                    </p>
                  </div>
                  {(viewPayment?.templateName || viewContent?.templateName) && (
                    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Template
                      </p>
                      <p className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
                        <FileText className="h-4 w-4 text-cyan-600" aria-hidden />
                        {viewPayment?.templateName ?? viewContent?.templateName}
                      </p>
                    </div>
                  )}
                </div>

                {viewAttachments.length > 0 && (
                  <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Attachments
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {viewAttachments.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-100"
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {viewDelivery && (
                  <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Delivery tracking
                    </p>
                    <div className="space-y-2">
                      {(
                        [
                          {
                            key: 'sent',
                            label: 'Sent',
                            at: viewDelivery.sentAt,
                            color: 'bg-emerald-500',
                            done: Boolean(
                              viewDelivery.sentAt ||
                                viewDelivery.deliveredAt ||
                                viewDelivery.openedAt ||
                                viewDelivery.clickedAt,
                            ),
                          },
                          {
                            key: 'delivered',
                            label: 'Delivered',
                            at: viewDelivery.deliveredAt,
                            color: 'bg-sky-500',
                            done: Boolean(viewDelivery.deliveredAt),
                          },
                          {
                            key: 'opened',
                            label: 'Opened',
                            at: viewDelivery.openedAt,
                            color: 'bg-violet-500',
                            done: Boolean(
                              viewDelivery.openedAt || (viewDelivery.openCount ?? 0) > 0,
                            ),
                          },
                          {
                            key: 'clicked',
                            label: 'Clicked',
                            at: viewDelivery.clickedAt,
                            color: 'bg-indigo-500',
                            done: Boolean(viewDelivery.clickedAt),
                            extra:
                              viewDelivery.lastClickedUrl &&
                              viewDelivery.clickedAt
                                ? viewDelivery.lastClickedUrl
                                : undefined,
                          },
                        ] as const
                      ).map((step) => (
                        <div
                          key={step.key}
                          className={cn(
                            'flex items-center gap-3 rounded-lg border px-3 py-2 text-xs',
                            step.done
                              ? 'border-border/70 bg-muted/20 text-foreground'
                              : 'border-dashed border-border/50 text-muted-foreground',
                          )}
                        >
                          <span
                            className={cn(
                              'h-2.5 w-2.5 shrink-0 rounded-full',
                              step.done ? step.color : 'bg-muted-foreground/30',
                            )}
                          />
                          <span className="min-w-[72px] font-medium">{step.label}</span>
                          {step.done && step.at ? (
                            <span className="text-muted-foreground">
                              {formatDateTimeUS(step.at, step.at)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Pending</span>
                          )}
                          {'extra' in step && step.extra ? (
                            <span className="truncate text-muted-foreground">— {step.extra}</span>
                          ) : null}
                        </div>
                      ))}
                      {viewDelivery.bouncedAt && (
                        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-foreground">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                          <span className="font-medium">Bounced</span>
                          <span className="break-all text-muted-foreground">
                            {formatDateTimeUS(viewDelivery.bouncedAt, viewDelivery.bouncedAt)}
                            {viewDelivery.bounceReason ? ` — ${viewDelivery.bounceReason}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border/70 bg-card shadow-sm">
                  <div className="border-b border-border/60 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Message preview
                    </p>
                  </div>
                  <div className="bg-slate-50/80 p-4 dark:bg-slate-900/40">
                    {previewBody ? (
                      previewIsHtml ? (
                        // Isolated frame: the email renders exactly as sent, untouched by the CRM
                        // styles (all-caps text, typography). Sandboxed: no scripts run.
                        <iframe
                          title="Email preview"
                          sandbox="allow-popups allow-popups-to-escape-sandbox"
                          srcDoc={previewBody}
                          className="h-[min(70vh,40rem)] w-full rounded-lg border border-border/60 bg-white shadow-inner"
                        />
                      ) : (
                        <pre className="scrollbar-hide max-h-[min(52vh,28rem)] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-white p-4 text-sm leading-relaxed text-foreground shadow-inner dark:bg-card">
                          {previewBody}
                        </pre>
                      )
                    ) : (
                      <p className="rounded-lg border border-dashed border-border bg-white p-6 text-center text-sm text-muted-foreground dark:bg-card">
                        {(viewContent as { note?: string } | null)?.note ??
                          'No message body stored for this entry.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
