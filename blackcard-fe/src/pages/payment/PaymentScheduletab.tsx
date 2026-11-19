import { lazy, memo, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Loader2,
  Eye,
  Trash2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrencyFull, formatDateMonthDayYear } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { DealSchedule, PaymentRow, PaymentStatus } from "./paymentScheduleTypes";
import {
  extractDealTokensFromText,
  normalizeDealIdToken,
} from "./paymentDealIdUtils";

const SchedulePaymentTrackingLauncher = lazy(() =>
  import("./SchedulePaymentTrackingModal").then((m) => ({
    default: m.SchedulePaymentTrackingLauncher,
  })),
);

const paymentStatusBadge: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  paid: {
    label: "Paid",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900",
  },
  failed: {
    label: "Failed",
    className:
      "border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900",
  },
  due_today: {
    label: "Due Today",
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900",
  },
  upcoming: {
    label: "Upcoming",
    className:
      "border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-900",
  },
  scheduled: {
    label: "Scheduled",
    className:
      "border-border bg-muted/60 text-muted-foreground dark:bg-muted/30",
  },
  reversed: {
    label: "Reversed",
    className:
      "border-orange-200 bg-orange-50 text-orange-800 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-900",
  },
  waived: {
    label: "Waived",
    className:
      "border-violet-200 bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-400 dark:border-violet-900",
  },
  manual: {
    label: "Manual",
    className:
      "border-[var(--brand)]/30 bg-[var(--brand)]/10 text-[var(--brand)] dark:text-[#5ba3d4]",
  },
  credit: {
    label: "Credit",
    className:
      "border-teal-200 bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400 dark:border-teal-900",
  },
  debit: {
    label: "Debit",
    className:
      "border-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 dark:border-indigo-900",
  },
};

const getTodayInputDate = () => {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
};

function rowStatusLc(p: PaymentRow): string {
  return String(p.status ?? "").trim().toLowerCase();
}

/** `YYYY-MM-DD` key from any parseable date string; falls back to the raw value so missing dates don't pair across rows. */
function normalizeDateKey(dateStr: string | undefined | null): string {
  const t = (dateStr ?? "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Two-decimal numeric key so `15` and `15.00` group together. */
function amountKey(n: number | undefined | null): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

/**
 * Pairs same-day same-amount debit/credit-paid rows into a single FAILED row.
 *
 * The resulting Failed row always inherits the **debit's** description — the credit leg is
 * the offsetting bank refund (typically carrying generic ACH return text like `…ROC… CCD …`
 * that doesn't describe the actual deal payment). If the debit's note is blank, the row is
 * left blank rather than leaking the refund's text, so the Failed tab consistently shows the
 * originating transaction's description.
 *
 * Unpaired rows pass through unchanged so Paid/Debit tabs still show truly one-sided activity.
 */
function pairDebitCreditAsFailed(list: PaymentRow[]): PaymentRow[] {
  if (list.length < 2) return list;

  const groups = new Map<string, PaymentRow[]>();
  for (const p of list) {
    const key = `${normalizeDateKey(p.date)}|${amountKey(p.amount)}`;
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  const out: PaymentRow[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) {
      out.push(...group);
      continue;
    }
    const debits: PaymentRow[] = [];
    const credits: PaymentRow[] = [];
    const others: PaymentRow[] = [];
    for (const p of group) {
      const s = rowStatusLc(p);
      if (s === "debit") debits.push(p);
      else if (s === "credit" || s === "paid") credits.push(p);
      else others.push(p);
    }

    const pairCount = Math.min(debits.length, credits.length);
    for (let i = 0; i < pairCount; i++) {
      const debit = debits[i];
      out.push({
        ...debit,
        status: "failed",
        note: debit.note ?? "",
      });
    }
    for (let i = pairCount; i < debits.length; i++) out.push(debits[i]);
    for (let i = pairCount; i < credits.length; i++) out.push(credits[i]);
    out.push(...others);
  }

  out.sort((a, b) => (a.payNum ?? 0) - (b.payNum ?? 0));
  return out;
}

/** Compact page list so the footer does not render 40+ buttons in one row. */
function getVisiblePages(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

type PaymentScheduletabProps = {
  schedules: DealSchedule[];
  selectedAcct: string;
  /** Deal id from the open application (`dealId` / `dealID`). Scopes transactions to CollectionPayment rows for this deal only. */
  applicationDealId?: string;
  /**
   * Prisma `Application.id` (UUID) or numeric `applicationId` of the open application.
   * Used to fetch `SchedulePaymentTracking` rows via `GET /applications/:id/schedule-payment-tracking`.
   */
  applicationId?: string;
  /** True while GET `/collection-payments` is in flight and there are no rows yet (avoids an empty table flash). */
  isRowsLoading?: boolean;
  isDark: boolean;
  onCreatePayment: (payload: {
    amount: string;
    date: string;
    note: string;
    status: PaymentStatus;
  }) => Promise<void>;
  onUpdatePayment: (
    paymentId: string,
    payload: {
      amount: string;
      date: string;
      note: string;
      status: PaymentStatus;
    }
  ) => Promise<void>;
  onDeletePayment: (paymentId: string) => Promise<void>;
};

function PaymentScheduletab({
  schedules,
  selectedAcct,
  applicationDealId,
  applicationId,
  isRowsLoading = false,
  isDark,
  onCreatePayment,
  onUpdatePayment,
  onDeletePayment,
}: PaymentScheduletabProps) {
  type PaymentFilterTab = "all" | "paid" | "failed" | "debit";
  const navigate = useNavigate();
  const [activeFilterTab, setActiveFilterTab] = useState<PaymentFilterTab>("all");
  const [newPayment, setNewPayment] = useState(() => ({
    amount: "",
    date: getTodayInputDate(),
    note: "",
    status: "upcoming" as PaymentStatus,
  }));

  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState<PaymentRow | null>(null);
  const [updateStatus, setUpdateStatus] = useState<PaymentStatus>("paid");
  const [updateAmount, setUpdateAmount] = useState("");
  const [updateDate, setUpdateDate] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [updateMode, setUpdateMode] = useState<"view" | "edit">("edit");
  const [isSavingAddPayment, setIsSavingAddPayment] = useState(false);
  const [isSavingUpdatePayment, setIsSavingUpdatePayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (showUpdateModal) {
      setUpdateStatus(showUpdateModal.status);
      setUpdateAmount(String(showUpdateModal.amount ?? ""));
      setUpdateDate(showUpdateModal.date || "");
      setUpdateNote(showUpdateModal.note || "");
    }
  }, [showUpdateModal]);

  const acct = useMemo(
    () => schedules.find((s) => s.id === selectedAcct) ?? null,
    [schedules, selectedAcct]
  );

  const dealScopedPayments = useMemo(() => {
    const list = acct?.payments ?? [];
    const rawDeal = applicationDealId?.trim() ?? "";
    if (!rawDeal) return list;
    const token = normalizeDealIdToken(applicationDealId);
    if (!token) return list;
    return list.filter((p) => {
      const rowDeal = p.dealId != null ? normalizeDealIdToken(p.dealId) : "";
      if (rowDeal) return rowDeal === token;
      const fromNote = extractDealTokensFromText(p.note);
      if (fromNote.length > 0) return fromNote.some((t) => t === token);
      return true;
    });
  }, [acct, applicationDealId]);

  /**
   * Same-day same-amount debit+credit (or debit+paid) rows are collapsed into a single FAILED row
   * carrying the debit's description. This restores the prior behavior where a returned credit
   * cancels its triggering debit instead of showing both halves of the round-trip separately.
   */
  const pairedPayments = useMemo(
    () => pairDebitCreditAsFailed(dealScopedPayments),
    [dealScopedPayments]
  );

  /** Tabs run against the paired list so paired halves no longer leak into Paid/Debit tabs. */
  const filteredPayments = useMemo(() => {
    if (!acct) return [];
    if (activeFilterTab === "paid") {
      return pairedPayments.filter((p) => {
        const st = rowStatusLc(p);
        return st === "credit" || st === "paid";
      });
    }
    if (activeFilterTab === "failed") {
      return pairedPayments.filter((p) => rowStatusLc(p) === "failed");
    }
    if (activeFilterTab === "debit") {
      return pairedPayments.filter((p) => rowStatusLc(p) === "debit");
    }
    return pairedPayments;
  }, [acct, activeFilterTab, pairedPayments]);

  const pageSize = 50;
  const [currentPage, setCurrentPage] = useState(1);

  const totalFiltered = filteredPayments.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPayments = filteredPayments.slice(startIndex, endIndex);
  const showingStart = totalFiltered === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(endIndex, totalFiltered);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAcct]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilterTab]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const visiblePages = useMemo(
    () => getVisiblePages(safeCurrentPage, totalPages),
    [safeCurrentPage, totalPages]
  );

  const handleUpdatePayment = async () => {
    if (!showUpdateModal?.id || !updateAmount || !updateDate) return;
    setIsSavingUpdatePayment(true);
    try {
      await onUpdatePayment(showUpdateModal.id, {
        amount: updateAmount,
        date: updateDate,
        note: updateNote,
        status: updateStatus,
      });
      toast.success("Payment updated successfully.");
      setShowUpdateModal(null);
      setUpdateMode("edit");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update payment.");
    } finally {
      setIsSavingUpdatePayment(false);
    }
  };

  const handleAddPayment = async () => {
    if (!selectedAcct || !newPayment.amount || !newPayment.date) return;
    setIsSavingAddPayment(true);
    try {
      await onCreatePayment(newPayment);
      toast.success("Payment scheduled successfully.");
      setNewPayment({ amount: "", date: getTodayInputDate(), note: "", status: "upcoming" });
      setShowAddPayment(false);
    } catch (error: any) {
      toast.error(error?.message || "Failed to create payment.");
    } finally {
      setIsSavingAddPayment(false);
    }
  };

  const handleDeletePaymentRow = async (p: PaymentRow) => {
    if (!p.id) return;
    if (
      !window.confirm(
        "Delete this transaction? This cannot be undone."
      )
    ) {
      return;
    }
    setDeletingPaymentId(p.id);
    try {
      await onDeletePayment(p.id);
      toast.success("Transaction deleted successfully.");
      if (showUpdateModal?.id === p.id) {
        setShowUpdateModal(null);
        setUpdateMode("edit");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete transaction.");
    } finally {
      setDeletingPaymentId(null);
    }
  };

  if (!acct) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center text-muted-foreground">
        <p className="text-sm font-medium">No schedule selected</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">Transaction</h2>
          <p className="text-sm text-muted-foreground">
            Filter and update Transactions for{" "}
            <span className="font-semibold text-foreground">{acct.deal}</span>.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        

          {/* <Button
            type="button"
            className="h-10 gap-2 bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
            onClick={() => {
              setNewPayment({ amount: "", date: getTodayInputDate(), note: "", status: "upcoming" });
              setShowAddPayment(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Upload Excel
          </Button> */}


          <Suspense
            fallback={
              <Button
                type="button"
                className="h-10 gap-2 bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
                disabled
              >
                Track Schedule Payments
              </Button>
            }
          >
            <SchedulePaymentTrackingLauncher
              applicationId={applicationId}
              applicationDealId={applicationDealId}
              isDark={isDark}
            />
          </Suspense>

          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2 border-2 border-solid border-[var(--brand)] bg-background text-[var(--brand)] shadow-none hover:bg-background hover:text-[var(--brand)] dark:border-[var(--brand)] dark:hover:bg-background"
            onClick={() => {
              navigate("/gmail");
            }}
          >
            {/* <img
              src="https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico"
              alt=""
              className="h-4 w-4 shrink-0"
              aria-hidden
            /> */}
            Email
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "all", label: "All" },
            { key: "paid", label: "Paid" },
            { key: "failed", label: "Failed" },
            { key: "debit", label: "Debit" },
          ] satisfies ReadonlyArray<{ key: PaymentFilterTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveFilterTab(tab.key)}
            className={cn(
              "h-9 rounded-md border px-4 cursor-pointer text-sm font-semibold transition-colors",
              activeFilterTab === tab.key
                ? "border-[var(--brand)] bg-[image:var(--brand-gradient)] text-white"
                : isDark
                  ? "border-white/15 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "min-h-[360px] max-h-[70vh] overflow-auto rounded-2xl border",
          isDark ? "border-white/10 bg-white/5" : "border-border/60 bg-white/70"
        )}
      >
        <Table>
          <TableHeader>
            <TableRow className={cn("sticky top-0 z-10", isDark ? "bg-[#1b1c20]" : "bg-[#F4F6FA]")}>
              <TableHead className="text-xs uppercase tracking-wide">Transaction ID</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Amount</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Description</TableHead>
              <TableHead className="text-left text-xs uppercase tracking-wide">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isRowsLoading && filteredPayments.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-[300px] align-middle text-center text-sm text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" aria-hidden />
                    <span>Loading payments...</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!isRowsLoading && filteredPayments.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-[300px] align-middle text-center text-sm text-muted-foreground"
                >
                  No payments available.
                </TableCell>
              </TableRow>
            )}

            {paginatedPayments.map((p) => (
              <TableRow key={p.refId} className="hover:bg-white/5">
                <TableCell className="font-medium">{p.payNum}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDateMonthDayYear(p.date, p.date)}
                </TableCell>
                <TableCell className="whitespace-nowrap font-semibold">
                  {formatCurrencyFull(p.amount)}
                </TableCell>
                <TableCell>
                  {(() => {
                    const s = rowStatusLc(p);
                    let statusForDisplay: PaymentStatus;
                    if (s === "credit") statusForDisplay = "paid";
                    else if (s in paymentStatusBadge) {
                      statusForDisplay = s as PaymentStatus;
                    } else {
                      statusForDisplay = p.status as PaymentStatus;
                    }
                    return (
                  <Badge
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                          paymentStatusBadge[statusForDisplay].className
                    )}
                  >
                          {paymentStatusBadge[statusForDisplay].label}
                  </Badge>
                    );
                  })()}
                </TableCell>
                <TableCell className="max-w-[220px] truncate text-muted-foreground" title={p.note}>
                  {p.note?.trim() ? p.note : "-"}
                </TableCell>
                <TableCell className="text-left">
                  <div className="inline-flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 gap-2 cursor-pointer",
                        isDark
                          ? "border-white/10 bg-white/5 hover:bg-white/10"
                          : "border-border/60 bg-white/70 hover:bg-muted/50"
                      )}
                      onClick={() => {
                        setUpdateMode("view");
                        setShowUpdateModal(p);
                      }}
                    >
                      <Eye className="h-4 w-4 cursor-pointer" />
                   
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 gap-2 cursor-pointer",
                        isDark
                          ? "border-white/10 bg-white/5 hover:bg-white/10"
                          : "border-border/60 bg-white/70 hover:bg-muted/50"
                      )}
                      onClick={() => {
                        setUpdateMode("edit");
                        setShowUpdateModal(p);
                      }}
                    >
                      <Pencil className="h-4 w-4 cursor-pointer" />
                    
                    </Button>
                    {p.id ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        title="Delete transaction"
                        disabled={deletingPaymentId === p.id}
                        className={cn(
                          "h-8 gap-2 cursor-pointer text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40",
                          isDark
                            ? "border-white/10 bg-white/5 hover:bg-white/10"
                            : "border-border/60 bg-white/70 hover:bg-muted/50"
                        )}
                        onClick={() => void handleDeletePaymentRow(p)}
                      >
                        {deletingPaymentId === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filteredPayments.length > 0 && (
        <div className="px-6 py-4 border-t border-border flex items-center justify-between text-xs font-bold text-muted-foreground bg-accent/20">
          <span>
            Showing {showingStart} to {showingEnd} of {totalFiltered} entries
          </span>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:flex-none sm:flex-initial">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage === 1}
              className="h-7 w-7 inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="First page"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((prev) => Math.max(1, prev - 1))
              }
              disabled={safeCurrentPage === 1}
              className="h-7 w-7 inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>

            <div className="flex min-w-0 max-w-[min(100%,18rem)] items-center gap-1 overflow-x-auto sm:max-w-none">
              {visiblePages.map((page, idx) => {
                if (page === "...") {
                  return (
                    <span
                      key={`ellipsis-${idx}`}
                      className="shrink-0 px-1.5 text-muted-foreground"
                      aria-hidden
                    >
                      ...
                    </span>
                  );
                }
                const pageNum = page;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-7 min-w-7 shrink-0 px-2 inline-flex items-center justify-center rounded-md border text-[11px] font-semibold transition-colors ${
                      safeCurrentPage === pageNum
                        ? "bg-[image:var(--brand-gradient)] border-[var(--brand)] text-white"
                        : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    }`}
                    aria-label={`Page ${pageNum}`}
                    aria-current={safeCurrentPage === pageNum ? "page" : undefined}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={safeCurrentPage === totalPages}
              className="h-7 w-7 inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>

            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage === totalPages}
              className="h-7 w-7 inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Last page"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}

      <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
        <DialogContent className={cn("payment-module", isDark ? "bg-[#141517] text-slate-100" : "")}>
          <DialogHeader>
            <DialogTitle>Add Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-payment-amount">Amount</Label>
              <Input
                id="add-payment-amount"
                type="number"
                min={0}
                step="1"
                value={newPayment.amount}
                onChange={(e) =>
                  setNewPayment((prev) => ({ ...prev, amount: e.target.value }))
                }
                placeholder="e.g. 1200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-payment-date">Date</Label>
              <Input
                id="add-payment-date"
                type="date"
                value={newPayment.date}
                onChange={(e) =>
                  setNewPayment((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-payment-note">Note</Label>
              <Textarea
                id="add-payment-note"
                value={newPayment.note}
                onChange={(e) =>
                  setNewPayment((prev) => ({ ...prev, note: e.target.value }))
                }
                placeholder="Optional note"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-payment-status">Status</Label>
              <Select
                value={newPayment.status}
                onValueChange={(v: string) =>
                  setNewPayment((prev) => ({ ...prev, status: v as PaymentStatus }))
                }
              >
                <SelectTrigger id="add-payment-status" className="h-10">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {(
                    [
                      "paid",
                      "failed",
                      "upcoming",
                      "credit",
                      "debit",
                    ] as PaymentStatus[]
                  ).map((st) => (
                    <SelectItem key={st} value={st}>
                      {paymentStatusBadge[st].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddPayment(false)}
              disabled={isSavingAddPayment}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
              onClick={handleAddPayment}
              disabled={isSavingAddPayment || !newPayment.amount || !newPayment.date}
            >
              {isSavingAddPayment ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!showUpdateModal}
        onOpenChange={(open: boolean) => {
          if (!open) setShowUpdateModal(null);
        }}
      >
        <DialogContent className={cn("payment-module", isDark ? "bg-[#141517] text-slate-100" : "")}>
          <DialogHeader>
            <DialogTitle>Update Payment Status</DialogTitle>
          </DialogHeader>

          {showUpdateModal && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="text-sm font-semibold">{showUpdateModal.refId}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatDateMonthDayYear(showUpdateModal.date, showUpdateModal.date)} Â·{" "}
                  {formatCurrencyFull(showUpdateModal.amount)}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="update-payment-amount">Amount</Label>
                <Input
                  id="update-payment-amount"
                  type="number"
                  min={0}
                  step="1"
                  value={updateAmount}
                  onChange={(e) => setUpdateAmount(e.target.value)}
                  disabled={updateMode === "view"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="update-payment-date">Date</Label>
                <Input
                  id="update-payment-date"
                  type="date"
                  value={updateDate}
                  onChange={(e) => setUpdateDate(e.target.value)}
                  disabled={updateMode === "view"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="update-payment-status">Status</Label>
                <Select
                  value={updateStatus}
                  onValueChange={(v: string) => setUpdateStatus(v as PaymentStatus)}
                  disabled={updateMode === "view"}
                >
                  <SelectTrigger id="update-payment-status" className="h-10">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "paid",
                        "failed",
                        "upcoming",
                        "credit",
                        "debit",
                      ] as PaymentStatus[]
                    ).map((st) => (
                      <SelectItem key={st} value={st}>
                        {paymentStatusBadge[st].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="update-payment-note">Note</Label>
                <Textarea
                  id="update-payment-note"
                  value={updateNote}
                  onChange={(e) => setUpdateNote(e.target.value)}
                  placeholder="Optional note"
                  disabled={updateMode === "view"}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowUpdateModal(null)}
              disabled={isSavingUpdatePayment}
            >
              Cancel
            </Button>
            {updateMode === "view" ? (
              <Button
                type="button"
                className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
                onClick={() => setUpdateMode("edit")}
              >
                Edit
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
                onClick={handleUpdatePayment}
                disabled={!showUpdateModal || isSavingUpdatePayment}
              >
                {isSavingUpdatePayment ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

export default memo(PaymentScheduletab);
