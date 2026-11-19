import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  LayoutList,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "react-toastify";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { cn, formatCurrencyFull, formatDateMonthDayYear } from "@/lib/utils";
import { axiosGet } from "@/redux/axios";
import type { AppDispatch } from "@/redux/store";
import {
  getSchedulePaymentTracking,
  type SchedulePaymentTrackingRow,
} from "@/redux/actions/applicationActions";
import type { CollectionPayment } from "@/types/collectionPaymentTypes";

import {
  attachScheduleTrackingStatusFromCollections,
  buildScheduleTrackingSummary,
} from "./schedulePaymentTrackingMatch";
import {
  scheduleTrackingStatusClass,
  scheduleTrackingStatusLabel,
  type ScheduleRowWithTrackingStatus,
  type ScheduleTrackingDisplayStatus,
  type ScheduleTrackingSummary,
} from "./schedulePaymentTrackingStatus";

type StatusFilterTab = "all" | ScheduleTrackingDisplayStatus;

type StatusStat = { count: number; sum: number };

const STATUS_FILTERS: ReadonlyArray<{
  key: StatusFilterTab;
  label: string;
  icon: typeof LayoutList;
  accent: string;
  activeRing: string;
}> = [
  {
    key: "all",
    label: "All",
    icon: LayoutList,
    accent: "text-[var(--brand)]",
    activeRing: "ring-[var(--brand)]/40 border-[var(--brand)]",
  },
  {
    key: "upcoming",
    label: "Upcoming",
    icon: Clock,
    accent: "text-sky-600 dark:text-sky-400",
    activeRing: "ring-sky-500/30 border-sky-500",
  },
  {
    key: "clear",
    label: "Clear",
    icon: CheckCircle2,
    accent: "text-emerald-600 dark:text-emerald-400",
    activeRing: "ring-emerald-500/30 border-emerald-500",
  },
  {
    key: "bounced",
    label: "Bounced",
    icon: XCircle,
    accent: "text-rose-600 dark:text-rose-400",
    activeRing: "ring-rose-500/30 border-rose-500",
  },
];

const EMPTY_SUMMARY: ScheduleTrackingSummary = {
  all: { count: 0, sum: 0 },
  upcoming: { count: 0, sum: 0 },
  clear: { count: 0, sum: 0 },
  bounced: { count: 0, sum: 0 },
};

export type SchedulePaymentTrackingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId?: string;
  applicationDealId?: string;
  isDark: boolean;
};

type ScheduleTrackingTableProps = {
  isDark: boolean;
  isLoading: boolean;
  error: string | null;
  rows: ScheduleRowWithTrackingStatus[];
  emptyMessage: string;
};

const ScheduleTrackingTable = memo(function ScheduleTrackingTable({
  isDark,
  isLoading,
  error,
  rows,
  emptyMessage,
}: ScheduleTrackingTableProps) {
  return (
    <div
      className={cn(
        "max-h-[min(52vh,28rem)] overflow-auto rounded-xl border shadow-inner",
        isDark
          ? "border-white/10 bg-black/20"
          : "border-slate-200/80 bg-slate-50/50",
      )}
    >
      <Table>
        <TableHeader className="sticky top-0 z-10">
          <TableRow
            className={cn(
              "border-b",
              isDark ? "border-white/10 bg-[#1a1c1f]" : "border-slate-200 bg-slate-100/90",
            )}
          >
            <TableHead className="w-14 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              #
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scheduled Date
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Amount
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={4} className="h-[220px] align-middle text-center">
                <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-9 w-9 animate-spin text-[var(--brand)]" aria-hidden />
                  <span>Loading scheduled payments…</span>
                </div>
              </TableCell>
            </TableRow>
          )}

          {!isLoading && error && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="h-[180px] align-middle text-center text-sm text-rose-600"
              >
                {error}
              </TableCell>
            </TableRow>
          )}

          {!isLoading && !error && rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="h-[180px] align-middle text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}

          {!isLoading &&
            !error &&
            rows.map((row, idx) => (
              <TableRow
                key={row.id}
                className={cn(
                  "border-b transition-colors last:border-0",
                  isDark
                    ? "border-white/5 hover:bg-white/[0.04]"
                    : "border-slate-100 hover:bg-white",
                  idx % 2 === 1 && (isDark ? "bg-white/[0.02]" : "bg-white/60"),
                )}
              >
                <TableCell className="font-medium tabular-nums text-muted-foreground">
                  {row.paymentNumber}
                </TableCell>
                <TableCell className="whitespace-nowrap font-medium">
                  {formatDateMonthDayYear(row.scheduledDate, row.scheduledDate)}
                </TableCell>
                <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                  {formatCurrencyFull(Number(row.amount))}
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
                      scheduleTrackingStatusClass[row.trackingStatus],
                    )}
                  >
                    {scheduleTrackingStatusLabel[row.trackingStatus]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
});

type StatusFilterCardsProps = {
  isDark: boolean;
  activeFilter: StatusFilterTab;
  onFilterChange: (tab: StatusFilterTab) => void;
  stats: Record<StatusFilterTab, StatusStat>;
  disabled?: boolean;
};

function StatusFilterCards({
  isDark,
  activeFilter,
  onFilterChange,
  stats,
  disabled,
}: StatusFilterCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {STATUS_FILTERS.map(({ key, label, icon: Icon, accent, activeRing }) => {
        const { count, sum } = stats[key];
        const isActive = activeFilter === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onFilterChange(key)}
            className={cn(
              "group relative flex flex-col rounded-xl border p-3.5 text-left transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50",
              disabled && "pointer-events-none opacity-60",
              isActive
                ? cn(
                    "border-2 bg-white shadow-md ring-2 dark:bg-[#1e2024]",
                    activeRing,
                    isDark && "bg-[#1e2024]",
                  )
                : isDark
                  ? "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                  : "border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  isActive ? accent : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? accent : "text-muted-foreground/70",
                )}
                aria-hidden
              />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
              {count}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {formatCurrencyFull(sum)}
              </span>{" "}
              total
            </p>
          </button>
        );
      })}
    </div>
  );
}

export function SchedulePaymentTrackingModal({
  open,
  onOpenChange,
  applicationId,
  applicationDealId,
  isDark,
}: SchedulePaymentTrackingModalProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [rows, setRows] = useState<ScheduleRowWithTrackingStatus[]>([]);
  const [summary, setSummary] = useState<ScheduleTrackingSummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatusFilterTab>("all");

  const fetchRows = useCallback(async () => {
    if (!applicationId) {
      const message = "Application id is missing";
      setError(message);
      toast.error(message);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const dealQuery =
        applicationDealId?.trim()
          ? `&dealId=${encodeURIComponent(applicationDealId.trim())}`
          : "";

      const [scheduleResult, collectionResponse] = await Promise.all([
        dispatch(
          getSchedulePaymentTracking({
            id: applicationId,
            status: "all",
            dealId: applicationDealId,
          }),
        ).unwrap(),
        axiosGet(
          `/collection-payments?applicationId=${encodeURIComponent(applicationId)}${dealQuery}`,
        ),
      ]);

      const schedulePayments = Array.isArray(scheduleResult?.payments)
        ? (scheduleResult.payments as SchedulePaymentTrackingRow[])
        : [];

      const collectionPayload = collectionResponse.data as {
        data?: CollectionPayment[];
      };
      const collectionPayments = Array.isArray(collectionPayload?.data)
        ? collectionPayload.data
        : [];

      const withStatus = attachScheduleTrackingStatusFromCollections(
        schedulePayments,
        collectionPayments,
        applicationDealId,
      );

      setRows(withStatus);
      setSummary(buildScheduleTrackingSummary(withStatus));
    } catch (err: unknown) {
      const message =
        typeof err === "string"
          ? err
          : (err as { message?: string })?.message ?? "Failed to load scheduled payments";
      setError(message);
      setRows([]);
      setSummary(EMPTY_SUMMARY);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [applicationId, applicationDealId, dispatch]);

  useEffect(() => {
    if (!open) return;
    void fetchRows();
  }, [open, fetchRows]);

  useEffect(() => {
    if (open) return;
    setRows([]);
    setSummary(EMPTY_SUMMARY);
    setError(null);
    setIsLoading(false);
    setActiveFilter("all");
  }, [open]);

  const filteredRows = useMemo(() => {
    if (activeFilter === "all") return rows;
    return rows.filter((row) => row.trackingStatus === activeFilter);
  }, [rows, activeFilter]);

  const activeStat = summary[activeFilter];
  const activeFilterMeta = STATUS_FILTERS.find((f) => f.key === activeFilter);

  const emptyMessage =
    activeFilter === "all"
      ? "No scheduled payments tracked for this application."
      : `No ${activeFilterMeta?.label.toLowerCase() ?? activeFilter} payments in this schedule.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-4xl",
          isDark ? "border-white/10 bg-[#141517] text-slate-100" : "border-slate-200",
        )}
      >
        <div
          className={cn(
            "border-b px-6 py-5",
            isDark
              ? "border-white/10 bg-gradient-to-br from-[var(--brand)]/20 via-[#141517] to-[#141517]"
              : "border-slate-200/80 bg-gradient-to-br from-[var(--brand)]/8 via-white to-slate-50",
          )}
        >
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm",
                  isDark ? "bg-[var(--brand)]/30 text-[#7eb8dc]" : "bg-[var(--brand)]/15 text-[var(--brand)]",
                )}
              >
                <CalendarClock className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-lg font-bold tracking-tight sm:text-xl">
                  Tracked Scheduled Payments
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Planned debits captured at disbursement
                  {applicationDealId ? (
                    <>
                      {" "}
                      for deal{" "}
                      <span className="font-semibold text-foreground">
                        {applicationDealId}
                      </span>
                    </>
                  ) : null}
                  . Status matches the Transactions tab (same date, same amount, paid →
                  clear, failed → bounced).
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <StatusFilterCards
            isDark={isDark}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            stats={summary}
            disabled={isLoading}
          />

          <ScheduleTrackingTable
            isDark={isDark}
            isLoading={isLoading}
            error={error}
            rows={filteredRows}
            emptyMessage={emptyMessage}
          />

          {!isLoading && !error && rows.length > 0 && (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
                isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200/80 bg-slate-50",
              )}
            >
              <div className="text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground">
                  {filteredRows.length}
                </span>{" "}
                of {rows.length} payment{rows.length === 1 ? "" : "s"}
                {activeFilter !== "all" && activeFilterMeta ? (
                  <span className="ml-1">({activeFilterMeta.label})</span>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  {activeFilter === "all" ? "Grand total" : `${activeFilterMeta?.label} total`}
                </p>
                <p className="text-base font-bold tabular-nums text-[var(--brand)] dark:text-[#7eb8dc]">
                  {formatCurrencyFull(activeStat.sum)}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter
          className={cn(
            "gap-2 border-t px-6 py-4 sm:gap-0",
            isDark ? "border-white/10 bg-[#121316]" : "border-slate-200 bg-slate-50/80",
          )}
        >
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!isLoading && error ? (
            <Button
              type="button"
              className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
              onClick={() => void fetchRows()}
            >
              Retry
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type SchedulePaymentTrackingLauncherProps = {
  applicationId?: string;
  applicationDealId?: string;
  isDark: boolean;
};

export const SchedulePaymentTrackingLauncher = memo(
  function SchedulePaymentTrackingLauncher({
    applicationId,
    applicationDealId,
    isDark,
  }: SchedulePaymentTrackingLauncherProps) {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button
          type="button"
          className="h-10 gap-2 bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
          disabled={!applicationId}
          onClick={() => setOpen(true)}
        >
          Track Schedule Payments
        </Button>
        <SchedulePaymentTrackingModal
          open={open}
          onOpenChange={setOpen}
          applicationId={applicationId}
          applicationDealId={applicationDealId}
          isDark={isDark}
        />
      </>
    );
  },
);

export default SchedulePaymentTrackingModal;
