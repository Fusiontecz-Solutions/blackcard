import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useSelector } from "react-redux";
import { Inbox, Mail } from "lucide-react";

import type { RootState } from "@/redux/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from "./paymentTemplateApi";
import {
  fetchPaymentMailLogsForApplication,
  getPaymentMailLogs,
  mergePaymentMailLogs,
  type PaymentMailLogEntry,
  type PaymentMailLogStatus,
} from "./paymentMailLogStorage";

function decodeDealLabel(raw: string | undefined) {
  if (!raw?.trim()) return "—";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const STATUS_TABS: { id: "all" | PaymentMailLogStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "queued", label: "Queued" },
  { id: "sent", label: "Sent" },
  { id: "delivered", label: "Delivered" },
  { id: "opened", label: "Opened" },
  { id: "clicked", label: "Clicked" },
  { id: "failed", label: "Failed" },
];

const DEFAULT_MAIL_LOG_POLL_MS = Number(
  import.meta.env.VITE_MAIL_LOG_POLL_MS ?? 5_000
);

function resolveRowStatus(row: PaymentMailLogEntry): PaymentMailLogStatus {
  const delivery = row.delivery;
  if (delivery) {
    if (delivery.clickedAt) return "clicked";
    if (delivery.openedAt || (delivery.openCount ?? 0) > 0) return "opened";
    if (delivery.deliveredAt) return "delivered";
    if (delivery.sentAt) return "sent";
    const deliveryStatus = delivery.status?.trim().toLowerCase();
    if (
      deliveryStatus &&
      [
        "queued",
        "sent",
        "failed",
        "delivered",
        "opened",
        "clicked",
        "deferred",
        "bounced",
        "dropped",
        "spam",
        "unsubscribed",
      ].includes(deliveryStatus)
    ) {
      return deliveryStatus as PaymentMailLogStatus;
    }
  }
  return row.status;
}

function matchesStatusFilter(
  status: PaymentMailLogStatus,
  filter: "all" | PaymentMailLogStatus
): boolean {
  if (filter === "all") return true;
  if (filter === "failed") {
    return ["failed", "bounced", "dropped", "spam"].includes(status);
  }
  if (filter === "sent") {
    return ["sent", "deferred", "processed"].includes(status);
  }
  return status === filter;
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "sent":
    case "processed":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700";
    case "delivered":
      return "border-sky-500/25 bg-sky-500/10 text-sky-700";
    case "opened":
    case "open":
      return "border-violet-500/25 bg-violet-500/10 text-violet-700";
    case "clicked":
    case "click":
      return "border-indigo-500/25 bg-indigo-500/10 text-indigo-700";
    case "failed":
    case "bounced":
    case "bounce":
    case "dropped":
      return "border-red-500/25 bg-red-500/10 text-red-700";
    case "spam":
      return "border-orange-500/25 bg-orange-500/10 text-orange-700";
    case "deferred":
    case "queued":
      return "border-amber-500/25 bg-amber-500/10 text-amber-800";
    default:
      return "border-slate-500/25 bg-slate-500/10 text-slate-700";
  }
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  processed: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  open: "Opened",
  clicked: "Clicked",
  click: "Clicked",
  deferred: "Deferred",
  queued: "Queued",
  failed: "Failed",
  bounced: "Bounced",
  bounce: "Bounced",
  dropped: "Dropped",
  spam: "Spam",
  unsubscribed: "Unsubscribed",
};

function statusLabel(status: string): string {
  const normalized = status.toLowerCase();
  return STATUS_LABELS[normalized] ?? status;
}

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function normalizeMojibakeText(value: string): string {
  if (!value) return value;
  // Decode common UTF-8-as-Latin1 mojibake (e.g. "Ã¢Â€Â”" -> "—").
  if (!/[ÃÂâ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return decoded || value;
  } catch {
    return value;
  }
}

function bodyIsHtml(body: string): boolean {
  return /<\/?(?:table|html|div|p|pre|br|span|strong|ul|ol|li|td|tr)\b/i.test(
    body
  );
}

export default function MailLogs() {
  const { paymentDealId } = useParams<{ paymentDealId: string }>();
  const dealLabel = useMemo(
    () => decodeDealLabel(paymentDealId),
    [paymentDealId]
  );
  const application = useSelector(
    (s: RootState) => s.applicationDetail.data
  ) as { _id?: string } | null | undefined;
  const applicationId = application?._id ?? null;

  const [rows, setRows] = useState<PaymentMailLogEntry[]>(() =>
    getPaymentMailLogs()
  );
  const [statusFilter, setStatusFilter] = useState<
    "all" | PaymentMailLogStatus
  >("all");
  const [selectedLog, setSelectedLog] = useState<PaymentMailLogEntry | null>(
    null
  );
  const selectedBody = selectedLog?.body?.trim() || "";
  const selectedBodyIsHtml = bodyIsHtml(selectedBody);

  const refreshRows = useCallback(async () => {
    if (applicationId) {
      try {
        const data = await fetchPaymentMailLogsForApplication(applicationId);
        setRows(data);
        mergePaymentMailLogs(data);
        return;
      } catch {
        setRows(
          getPaymentMailLogs().filter(
            (r) =>
              r.dealKey === dealLabel || r.applicationId === applicationId
          )
        );
      }
      return;
    }
    setRows(getPaymentMailLogs());
  }, [applicationId, dealLabel]);

  useEffect(() => {
    void refreshRows();
    window.addEventListener("payment-mail-log-updated", refreshRows);
    window.addEventListener("storage", refreshRows);
    return () => {
      window.removeEventListener("payment-mail-log-updated", refreshRows);
      window.removeEventListener("storage", refreshRows);
    };
  }, [refreshRows]);

  useEffect(() => {
    if (!applicationId) return;

    const intervalMs = Math.max(5_000, DEFAULT_MAIL_LOG_POLL_MS);
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      void refreshRows();
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [applicationId, refreshRows]);

  let scope: "deal" | "all" = "deal";
  let query: string | undefined = undefined;
  const filtered = useMemo(() => {
    let list = rows;
    if (scope === "deal") {
      list = list.filter(
        (r) =>
          r.dealKey === dealLabel ||
          (applicationId != null && r.applicationId === applicationId)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((r) =>
        matchesStatusFilter(resolveRowStatus(r), statusFilter)
      );
    }
    const q = (query as any)?.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.recipient.toLowerCase().includes(q) ||
          r.subject.toLowerCase().includes(q) ||
          r.templateName.toLowerCase().includes(q) ||
          r.dealKey.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, scope, dealLabel, applicationId, statusFilter, query]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Mail logs
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          History of letters and emails queued or sent from the payment workspace.
          New entries appear when you send from the Letters tab.
        </p>
      </div>
{/* 
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {SCOPE_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors",
                scope === id
                  ? "bg-[image:var(--brand-gradient)] text-white shadow-sm"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search recipient, subject, template…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search mail logs"
          />
        </div>
      </div> */}

      <div className="inline-flex max-w-full flex-wrap items-center gap-2">
    
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {STATUS_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                statusFilter === id
                  ? "bg-[image:var(--brand-gradient)] text-white shadow-sm"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)]">
              <Inbox className="size-6" aria-hidden />
            </div>
            <div className="max-w-md space-y-1">
              <p className="text-sm font-semibold text-foreground">
                No mail history yet
              </p>
              <p className="text-sm text-muted-foreground">
                {scope === "deal"
                  ? "Nothing logged for this deal. Open Letters, compose a template, and send — it will show up here."
                  : "No entries across deals. Send from Letters on any payment deal to build history."}
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">When</TableHead>
                <TableHead>Deal</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead className="min-w-[180px]">Subject</TableHead>
                <TableHead className="text-left">View</TableHead>
                <TableHead className="pr-4 text-left">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const displayStatus = resolveRowStatus(row);
                return (
                <TableRow key={row.id}>
                  <TableCell className="pl-4 text-foreground">
                    {formatWhen(row.at)}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate font-medium text-foreground">
                    {row.dealKey}
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-foreground">
                    {row.templateName}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                      {
                        TEMPLATE_CATEGORY_LABELS[
                          row.category as TemplateCategory
                        ]
                      }
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {row.recipient}
                  </TableCell>
                  <TableCell className="max-w-[240px] whitespace-normal break-words text-foreground">
                    {normalizeMojibakeText(row.subject || "—")}
                  </TableCell>
                  <TableCell className="text-left">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedLog(row)}
                    >
                      View
                    </Button>
                  </TableCell>
                  <TableCell className="pr-4 text-left">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide",
                        statusBadgeClass(displayStatus)
                      )}
                    >
                      {statusLabel(displayStatus)}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} entr
          {filtered.length === 1 ? "y" : "ies"}
          {scope === "deal" ? " for this deal" : " across all deals"}.
          {applicationId
            ? " Logs are saved on the server for this application."
            : " Logs are stored in this browser only until an application is loaded."}
        </p>
      )}

      <Dialog
        open={selectedLog !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setSelectedLog(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mail preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Recipient
              </p>
              <p className="break-all text-foreground">
                {selectedLog?.recipient || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Subject
              </p>
              <p className="text-foreground">
                {normalizeMojibakeText(selectedLog?.subject || "—")}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Message
              </p>
              <div className="rounded-md border border-border bg-muted/20 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                {selectedBody ? (
                  selectedBodyIsHtml ? (
                    <div
                      className="max-h-[52vh] overflow-y-auto rounded-md border border-slate-200 bg-white p-3 break-words font-sans text-slate-900 [&_table]:w-full [&_td]:align-top"
                      dangerouslySetInnerHTML={{ __html: selectedBody }}
                    />
                  ) : (
                    <pre className="max-h-[52vh] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white p-3 font-sans text-slate-900">
                      {selectedBody}
                    </pre>
                  )
                ) : (
                  <pre className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white p-3 font-sans text-slate-900">
                    No message body is available for this log.
                  </pre>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
