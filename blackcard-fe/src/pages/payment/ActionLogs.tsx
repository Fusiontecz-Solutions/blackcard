import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useSelector } from "react-redux";
import { FileText, Handshake,Mail } from "lucide-react";

import type { RootState } from "@/redux/store";
import type { Application } from "@/types/applicationTypes";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { axiosGet } from "@/redux/axios";
import {
  fetchPaymentMailLogsForApplication,
  getPaymentMailLogs,
  type PaymentMailLogEntry,
} from "./paymentMailLogStorage";

const PAYMENT_MAIL_ACTION_TYPES = new Set([
  "PAYMENT_MAIL_SENT",
  "PAYMENT_MAIL_FAILED",
  "PAYMENT_MAIL_QUEUED",
]);

type ActivityCategory = "deal" | "letter" | "mail";

type ActivityEntry = {
  id: string;
  category: ActivityCategory;
  when: string;
  summary: string;
  detail: string;
  actor: string;
};

type ApiActivityLog = {
  id?: string;
  _id?: string;
  actionType?: string;
  actionDescription?: string;
  currentStatus?: string;
  createdAt?: string;
  userName?: string | null;
  userRole?: string | null;
  metadata?: Record<string, unknown> | null;
};

const CATEGORY_META: Record<
  ActivityCategory,
  { label: string; icon: typeof Handshake; badgeClass: string }
> = {
  deal: {
    label: "Deal",
    icon: Handshake,
    badgeClass: "border-sky-500/25 bg-sky-500/10 text-sky-800",
  },
  letter: {
    label: "Letter",
    icon: FileText,
    badgeClass: "border-violet-500/25 bg-violet-500/10 text-violet-800",
  },
  mail: {
    label: "Mail",
    icon: Mail,
    badgeClass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-800",
  },
};

function decodeDealLabel(raw: string | undefined) {
  if (!raw?.trim()) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
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

function inferCategoryFromLog(log: ApiActivityLog): ActivityCategory {
  const text = `${log.actionType ?? ""} ${log.actionDescription ?? ""}`.toLowerCase();
  if (text.includes("letter")) return "letter";
  if (text.includes("mail") || text.includes("email")) return "mail";
  return "deal";
}

function mapMailLogToActivity(log: PaymentMailLogEntry): ActivityEntry {
  const category: ActivityCategory = log.category === "letter" ? "letter" : "mail";
  const statusLabel = log.status.charAt(0).toUpperCase() + log.status.slice(1);
  return {
    id: `mail-${log.id}`,
    category,
    when: log.at,
    summary: `${statusLabel} ${category === "letter" ? "letter" : "email"}`,
    detail: `Template: ${log.templateName} | Recipient: ${log.recipient}${log.subject ? ` | Subject: ${log.subject}` : ""}`,
    actor: "System",
  };
}

const FILTER_TABS: { id: "all" | ActivityCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "deal", label: "Deals" },
  { id: "letter", label: "Letters" },
  { id: "mail", label: "Mails" },
];

export default function ActionLogs() {
  const { paymentDealId } = useParams<{ paymentDealId: string }>();
  const application = useSelector(
    (s: RootState) => s.applicationDetail.data
  ) as Application | null | undefined;
  const dealHint = useMemo(() => decodeDealLabel(paymentDealId), [paymentDealId]);
  const displayDealLabel = useMemo(() => {
    if (application?.applicationId != null) return String(application.applicationId);
    if (!dealHint || isUuid(dealHint)) return "";
    return dealHint;
  }, [application?.applicationId, dealHint]);
  const applicationId = application?._id;

  const [filter, setFilter] = useState<"all" | ActivityCategory>("all");
  const [apiLogs, setApiLogs] = useState<ApiActivityLog[]>([]);
  const [mailLogs, setMailLogs] = useState<PaymentMailLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refreshMailLogs = () => {
      if (applicationId) {
        void fetchPaymentMailLogsForApplication(applicationId)
          .then(setMailLogs)
          .catch(() => {
            setMailLogs(
              getPaymentMailLogs().filter(
                (row) =>
                  row.dealKey === dealHint ||
                  row.applicationId === applicationId
              )
            );
          });
        return;
      }
      setMailLogs(getPaymentMailLogs());
    };
    refreshMailLogs();
    window.addEventListener("payment-mail-log-updated", refreshMailLogs);
    window.addEventListener("storage", refreshMailLogs);
    return () => {
      window.removeEventListener("payment-mail-log-updated", refreshMailLogs);
      window.removeEventListener("storage", refreshMailLogs);
    };
  }, [applicationId, dealHint]);

  useEffect(() => {
    if (!applicationId) {
      setApiLogs([]);
      return;
    }
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await axiosGet(`/applications/${applicationId}/activity-logs`);
        if (!mounted) return;
        const payload = response?.data?.data ?? response?.data ?? [];
        setApiLogs(Array.isArray(payload) ? payload : []);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.message || "Failed to load action logs");
        setApiLogs([]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [applicationId]);

  const rows = useMemo(() => {
    const fromApi = apiLogs
      .filter(
        (log) =>
          !log.actionType || !PAYMENT_MAIL_ACTION_TYPES.has(log.actionType)
      )
      .map((log, index) => {
        const category = inferCategoryFromLog(log);
        return {
          id: `api-${log.id ?? log._id ?? index}`,
          category,
          when: log.createdAt ?? "",
          summary: log.actionDescription || log.actionType || "Activity updated",
          detail: log.currentStatus
            ? `Current status: ${log.currentStatus}`
            : "System activity update",
          actor:
            [log.userName, log.userRole].filter(Boolean).join(" ") || "System",
        } satisfies ActivityEntry;
      });

    const scopedMailLogs = mailLogs.filter(
      (row) =>
        row.dealKey === dealHint || (applicationId != null && row.applicationId === applicationId)
    );
    const fromMail = scopedMailLogs.map(mapMailLogToActivity);

    const merged = [...fromApi, ...fromMail].sort(
      (a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()
    );
    if (filter === "all") return merged;
    return merged.filter((a) => a.category === filter);
  }, [apiLogs, mailLogs, filter, dealHint, applicationId]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Action logs
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Chronological record of work on this payment deal from live activity
          logs and mail events.
          {displayDealLabel ? (
            <>
              {" "}
              Showing activity for deal{" "}
              <span className="font-medium text-foreground">{displayDealLabel}</span>.
            </>
          ) : null}
        </p>
      </div>

      <div className="inline-flex max-w-full flex-wrap items-center gap-2">

        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {FILTER_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                filter === id
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
        {isLoading ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            Loading action logs...
          </div>
        ) : error ? (
          <div className="px-5 py-8 text-sm text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            No action logs found for this deal.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((entry) => {
              const meta = CATEGORY_META[entry.category];
              const Icon = meta.icon;
              return (
                <li
                  key={entry.id}
                  className="flex gap-4 px-4 py-4 sm:px-5 sm:py-4"
                >
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full",
                      entry.category === "deal" && "bg-sky-500/10 text-sky-700",
                      entry.category === "letter" &&
                        "bg-violet-500/10 text-violet-700",
                      entry.category === "mail" &&
                        "bg-emerald-500/10 text-emerald-700"
                    )}
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-wide",
                          meta.badgeClass
                        )}
                      >
                        {meta.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatWhen(entry.when)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {entry.summary}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.detail}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      By <span className="font-medium">{entry.actor}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
