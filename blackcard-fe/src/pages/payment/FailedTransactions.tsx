import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Loader2,
  Search,
  TrendingDown,
} from "lucide-react";
import { motion } from "framer-motion";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format, isValid, parse } from "date-fns";

import { axiosGet } from "@/redux/axios";
import { formatCurrencyFull, formatNumberUS } from "@/lib/utils";
import { DealPaymentSummaryModal } from "./DealPaymentSummaryModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  extractReturnCodeFromDescription,
  getReturnCodeMeaning,
  parseTransactionStatusValue,
} from "@/lib/achReturnCodeFromDescription";

type FailedTransactionRow = {
  id: string;
  amount: number;
  rawAmount: number;
  scheduledDate: string | null;
  processedDate: string | null;
  paymentDate: string | null;
  /** Server-rendered list cell (YYYY-MM-DD). */
  displayDateYmd?: string;
  /** Server-rendered list cell (e.g. `1,234.56` or em dash). */
  displayDebit?: string;
  notes: string;
  referenceNumber: string | null;
  status: string;
  transactionStatus: string | null;
  createdAt: string;
};

type FailedDealGroup = {
  applicationId: string;
  applicationDisplayId: number | null;
  dealId: string | null;
  /** Server-resolved label for the Deal ID column. */
  displayDealId?: string;
  businessName: string;
  failedAmount: number;
  failedCount: number;
  transactions: FailedTransactionRow[];
  paybackAmount?: number | null;
  balanceDue?: number | null;
  paybackAmountDisplay?: string | null;
  balanceDueDisplay?: string | null;
};

type FailedSummary = {
  totalAmount: number;
  totalCount: number;
  dealCount: number;
  totalAmountDisplay?: string;
  totalCountDisplay?: string;
  dealCountDisplay?: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  /** Present when the server performed a full count; otherwise null with `hasNextPage`. */
  total: number | null;
  totalPages: number | null;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
};

type FailedTransactionsApiResponse = {
  success: boolean;
  data: FailedDealGroup[];
  summary: FailedSummary | null;
  pagination: Pagination;
};

const DEFAULT_PAGE_SIZE = 10;

const EMPTY_SUMMARY: FailedSummary = {
  totalAmount: 0,
  totalCount: 0,
  dealCount: 0,
  totalAmountDisplay: "$ 0.00",
  totalCountDisplay: "0",
  dealCountDisplay: "0",
};

/** `YYYY-MM-DD` → `MM/dd/yyyy` for the date filter display (US). */
function isoYmdToUsDisplay(iso: string): string {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "";
  const d = parse(t, "yyyy-MM-dd", new Date());
  return isValid(d) ? format(d, "MM/dd/yyyy") : "";
}

function dealLabelFromGroup(group: FailedDealGroup): string {
  const d = group.displayDealId?.trim();
  if (d) return d;
  return group.dealId?.trim() || `App-${group.applicationDisplayId ?? "—"}`;
}

/** Normalizes `$ 1,234.00` → `$1,234.00` for consistent tabular display. */
function compactUsdTableLabel(s: string): string {
  const t = s.trim();
  if (!t || t === "—") return t;
  return t.replace(/^\$\s+/, "$");
}

function groupPaybackLabel(group: FailedDealGroup): string {
  if (group.paybackAmountDisplay?.trim()) {
    return compactUsdTableLabel(group.paybackAmountDisplay.trim());
  }
  if (group.paybackAmount != null && Number.isFinite(group.paybackAmount)) {
    return `$${formatNumberUS(group.paybackAmount)}`;
  }
  return "—";
}

function groupBalanceLabel(group: FailedDealGroup): string {
  if (group.balanceDueDisplay?.trim()) {
    return compactUsdTableLabel(group.balanceDueDisplay.trim());
  }
  if (group.balanceDue != null && Number.isFinite(group.balanceDue)) {
    return `$${formatNumberUS(group.balanceDue)}`;
  }
  return "—";
}

function rowDateListCell(tx: FailedTransactionRow): string {
  const y = tx.displayDateYmd?.trim();
  if (y) return y;
  const v = tx.processedDate ?? tx.paymentDate ?? tx.scheduledDate;
  if (!v) return "—";
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const parsed = new Date(t);
  if (Number.isNaN(parsed.getTime())) return "—";
  const yy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function rowDebitListCell(tx: FailedTransactionRow): string {
  if (tx.displayDebit != null && tx.displayDebit !== "") return tx.displayDebit;
  if (tx.amount > 0)
    return tx.amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return "—";
}

type RowStatusInfo = {
  code: string;
  meaning: string | null;
};

/** Prefer DB `transactionStatus` (e.g. R01); fall back to ACH code in description. */
function resolveRowStatus(tx: FailedTransactionRow): RowStatusInfo | null {
  const stored = tx.transactionStatus?.trim()
    ? parseTransactionStatusValue(tx.transactionStatus)
    : null;
  const code = stored ?? extractReturnCodeFromDescription(tx.notes ?? "");
  if (!code) return null;
  return { code, meaning: getReturnCodeMeaning(code) };
}

type SortKey = "dealId" | "date" | "amount";
type SortDir = "asc" | "desc";

type RangePreset = "last1" | "last3" | "last7";

const RANGE_PRESETS: ReadonlyArray<{ id: RangePreset; label: string; days: number }> = [
  { id: "last1", label: "Last day", days: 1 },
  { id: "last3", label: "Last 3 days", days: 3 },
  { id: "last7", label: "Last 7 days", days: 7 },
];

/** Local-time `YYYY-MM-DD` for a JS Date (avoids UTC shift on the user's clock). */
function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Inclusive `[from, to]` for a preset in local time.
 * "Last day" = yesterday only; "Last N days" = the N calendar days ending yesterday (excludes today).
 */
function rangeForPreset(preset: RangePreset, now: Date = new Date()): {
  fromDate: string;
  toDate: string;
} {
  const days = RANGE_PRESETS.find((p) => p.id === preset)?.days ?? 1;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const from = new Date(yesterday);
  from.setDate(yesterday.getDate() - (days - 1));
  return { fromDate: toLocalYmd(from), toDate: toLocalYmd(yesterday) };
}

type ActiveDateFilter =
  | { kind: "exact"; ymd: string }
  | { kind: "range"; fromYmd: string; toYmd: string };

function normalizeYmdRange(
  from: string,
  to: string,
): { fromYmd: string; toYmd: string } | null {
  const f = from.trim();
  const t = to.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  if (f <= t) return { fromYmd: f, toYmd: t };
  return { fromYmd: t, toYmd: f };
}

function openNativeDatePicker(input: HTMLInputElement | null) {
  if (!input) return;
  if (typeof input.showPicker === "function") {
    try {
      input.showPicker();
      return;
    } catch {
      /* showPicker may throw outside a user gesture */
    }
  }
  input.focus({ preventScroll: true });
  input.click();
}

function buildActiveDateFilter(
  customRange: { fromYmd: string; toYmd: string } | null,
  rangePreset: RangePreset | null,
  datePick: string,
  filterYear: string,
  filterMonth: string,
  filterDay: string,
): ActiveDateFilter | null {
  if (customRange) {
    return { kind: "range", fromYmd: customRange.fromYmd, toYmd: customRange.toYmd };
  }
  if (rangePreset) {
    const { fromDate, toDate } = rangeForPreset(rangePreset);
    return { kind: "range", fromYmd: fromDate, toYmd: toDate };
  }
  if (datePick) return { kind: "exact", ymd: datePick };
  if (filterYear && filterMonth && filterDay) {
    const m = String(Number(filterMonth)).padStart(2, "0");
    const d = String(Number(filterDay)).padStart(2, "0");
    return { kind: "exact", ymd: `${filterYear}-${m}-${d}` };
  }
  return null;
}

/** Pick the best-available timestamp (ms) for a transaction; -Infinity when missing. */
function txTimestamp(tx: FailedTransactionRow): number {
  const v = tx.processedDate ?? tx.paymentDate ?? tx.scheduledDate;
  if (!v) return -Infinity;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : -Infinity;
}

/** Most-recent failed-tx timestamp in a group (used to sort groups by Date). */
function groupLatestTimestamp(group: FailedDealGroup): number {
  let best = -Infinity;
  for (const tx of group.transactions) {
    const ms = txTimestamp(tx);
    if (ms > best) best = ms;
  }
  return best;
}

export default function FailedTransactions() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebouncedValue(searchTerm, 280);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState<FailedDealGroup[]>([]);
  const [summary, setSummary] = useState<FailedSummary>(EMPTY_SUMMARY);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: null,
    totalPages: null,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [tableLoading, setTableLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedTable, setHasLoadedTable] = useState(false);
  /** After first successful summary response; avoids skeleton flash on filter changes. */
  const [summaryHydrated, setSummaryHydrated] = useState(false);
  const [paymentSummaryModal, setPaymentSummaryModal] = useState<{
    applicationId: string;
    dealId: string | null;
    dealLabel: string;
  } | null>(null);

  /** Calendar / dropdown date filter — sent as `date` or `year`/`month`/`day` query params. */
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterDay, setFilterDay] = useState("");
  const [datePick, setDatePick] = useState("");
  /** Quick-range preset — null by default (no date filter, show all). */
  const [rangePreset, setRangePreset] = useState<RangePreset | null>(null);
  /** User-defined inclusive From → To range (`fromDate` / `toDate` on the API). */
  const [customRange, setCustomRange] = useState<{ fromYmd: string; toYmd: string } | null>(
    null,
  );
  const [draftRangeFrom, setDraftRangeFrom] = useState("");
  const [draftRangeTo, setDraftRangeTo] = useState("");

  /** Client-side sort of the current page (server paginates the result set). */
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir(key === "dealId" ? "asc" : "desc");
      return key;
    });
  }, []);
  const applyCustomDateRange = useCallback(() => {
    const norm = normalizeYmdRange(draftRangeFrom, draftRangeTo);
    if (!norm) return;
    setCustomRange(norm);
    setRangePreset(null);
    setDatePick(norm.toYmd);
    setFilterYear("");
    setFilterMonth("");
    setFilterDay("");
  }, [draftRangeFrom, draftRangeTo]);

  const canApplyCustomRange = useMemo(
    () => normalizeYmdRange(draftRangeFrom, draftRangeTo) != null,
    [draftRangeFrom, draftRangeTo],
  );

  const customRangePendingApply = useMemo(() => {
    if (!customRange || !canApplyCustomRange) return canApplyCustomRange;
    const norm = normalizeYmdRange(draftRangeFrom, draftRangeTo);
    if (!norm) return false;
    return norm.fromYmd !== customRange.fromYmd || norm.toYmd !== customRange.toYmd;
  }, [customRange, draftRangeFrom, draftRangeTo, canApplyCustomRange]);

  const filterQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) {
      params.set("search", debouncedSearch.trim());
    }
    if (customRange) {
      params.set("fromDate", customRange.fromYmd);
      params.set("toDate", customRange.toYmd);
    } else if (rangePreset) {
      const { fromDate, toDate } = rangeForPreset(rangePreset);
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
    } else if (datePick) {
      params.set("date", datePick);
    } else {
      if (filterYear) params.set("year", filterYear);
      if (filterYear && filterMonth) params.set("month", filterMonth);
      if (filterYear && filterMonth && filterDay) params.set("day", filterDay);
    }
    return params;
  }, [debouncedSearch, customRange, rangePreset, datePick, filterYear, filterMonth, filterDay]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterYear, filterMonth, filterDay, datePick, rangePreset, customRange]);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setTableLoading(true);
      setError(null);
      if (page === 1) setSummaryLoading(true);

      try {
        const params = new URLSearchParams(filterQueryParams);
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        if (page === 1) params.set("includeSummary", "1");

        const res = await axiosGet(
          `/collection-payments/failed-transactions?${params.toString()}`,
        );
        if (cancelled) return;

        const payload = res.data as FailedTransactionsApiResponse | undefined;
        if (payload?.success) {
          setData(payload.data ?? []);
          setPagination(
            payload.pagination ?? {
              page,
              pageSize,
              total: null,
              totalPages: null,
              hasNextPage: false,
              hasPreviousPage: page > 1,
            },
          );
          setHasLoadedTable(true);

          if (page === 1) {
            if (payload.summary) {
              setSummary(payload.summary);
            } else {
              const sumRes = await axiosGet(
                `/collection-payments/failed-transactions/summary?${filterQueryParams.toString()}`,
              );
              if (cancelled) return;
              const sumPayload = sumRes.data as
                | { success?: boolean; summary?: FailedSummary }
                | undefined;
              setSummary(
                sumPayload?.success && sumPayload.summary
                  ? sumPayload.summary
                  : EMPTY_SUMMARY,
              );
            }
          }
        } else {
          setError("Failed to load failed transactions.");
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load failed transactions.";
        setError(message);
        if (page === 1) setSummary(EMPTY_SUMMARY);
      } finally {
        if (!cancelled) {
          setTableLoading(false);
          if (page === 1) {
            setSummaryLoading(false);
            setSummaryHydrated(true);
          }
        }
      }
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [filterQueryParams, page, pageSize]);

  const activeDateFilter = useMemo(
    () =>
      buildActiveDateFilter(customRange, rangePreset, datePick, filterYear, filterMonth, filterDay),
    [customRange, rangePreset, datePick, filterYear, filterMonth, filterDay],
  );

  const hasExactTotals =
    pagination.total != null &&
    pagination.totalPages != null &&
    pagination.totalPages > 0;
  const totalPages = pagination.totalPages ?? 0;
  const canPrev =
    pagination.hasPreviousPage === true ||
    (pagination.hasPreviousPage !== false && page > 1);
  const canNext = hasExactTotals ? page < totalPages : Boolean(pagination.hasNextPage);

  const goToPage = useCallback(
    (next: number) => {
      if (!Number.isFinite(next)) return;
      const n = Math.floor(next);
      if (hasExactTotals) {
        const clamped = Math.min(Math.max(1, n), Math.max(totalPages, 1));
        setPage(clamped);
        return;
      }
      const low = Math.max(1, n);
      if (low < page) setPage(low);
      else if (low > page && pagination.hasNextPage) setPage(low);
    },
    [hasExactTotals, totalPages, page, pagination.hasNextPage],
  );

  const pageNumbers = useMemo(() => {
    if (!hasExactTotals || totalPages <= 1) return [];
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    if (page <= 3) {
      for (let i = 1; i <= 4; i++) pages.push(i);
      pages.push("...");
      pages.push(totalPages);
    } else if (page >= totalPages - 2) {
      pages.push(1);
      pages.push("...");
      for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push("...");
      for (let i = page - 1; i <= page + 1; i++) pages.push(i);
      pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [page, totalPages, hasExactTotals]);

  const sortedData = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    const sortedGroups = [...data].sort((a, b) => {
      if (sortKey === "dealId") {
        return (
          dir *
          dealLabelFromGroup(a).localeCompare(dealLabelFromGroup(b), undefined, {
            numeric: true,
            sensitivity: "base",
          })
        );
      }
      if (sortKey === "amount") {
        return dir * ((a.failedAmount ?? 0) - (b.failedAmount ?? 0));
      }
      return dir * (groupLatestTimestamp(a) - groupLatestTimestamp(b));
    });

    if (sortKey === "date") {
      return sortedGroups.map((g) => ({
        ...g,
        transactions: [...g.transactions].sort(
          (a, b) => dir * (txTimestamp(a) - txTimestamp(b)),
        ),
      }));
    }
    if (sortKey === "amount") {
      return sortedGroups.map((g) => ({
        ...g,
        transactions: [...g.transactions].sort(
          (a, b) => dir * ((a.amount ?? 0) - (b.amount ?? 0)),
        ),
      }));
    }
    return sortedGroups;
  }, [data, sortKey, sortDir]);

  const showEmpty = !tableLoading && !error && data.length === 0;
  const isInitialTableLoading = tableLoading && !hasLoadedTable;
  const isRefetchingTable = tableLoading && hasLoadedTable;
  const showSummaryTotalsSpinner = summaryLoading && !summaryHydrated;
  const showSummaryUpdatingOverlay = summaryLoading && summaryHydrated;

  const dealsToolbarHint = useMemo(() => {
    if (!hasLoadedTable) return "";
    if (data.length === 0 && !pagination.hasNextPage && page === 1) {
      return "No matching deals";
    }
    if (pagination.total != null && pagination.total > 0) {
      return `Page ${pagination.page} of ${Math.max(pagination.totalPages ?? 1, 1)} · ${
        pagination.total
      } ${pagination.total === 1 ? "deal" : "deals"} on this page`;
    }
    const bits = [`Page ${pagination.page}`];
    if (pagination.hasNextPage) bits.push("more deals on next page");
    else bits.push(`${data.length} deal${data.length === 1 ? "" : "s"} on this page`);
    return bits.join(" · ");
  }, [hasLoadedTable, pagination, data.length, page]);

  const showPager = hasLoadedTable && (canPrev || canNext);

  const clearDateFilters = useCallback(() => {
    setFilterYear("");
    setFilterMonth("");
    setFilterDay("");
    setDatePick("");
    setRangePreset(null);
    setCustomRange(null);
    setDraftRangeFrom("");
    setDraftRangeTo("");
  }, []);

  /** Select a quick-range preset; clears single-day calendar params and syncs the picker. */
  const selectPreset = useCallback((preset: RangePreset) => {
    const { fromDate, toDate } = rangeForPreset(preset);
    setCustomRange(null);
    setRangePreset(preset);
    setDatePick(toDate);
    setDraftRangeFrom(fromDate);
    setDraftRangeTo(toDate);
    setFilterYear("");
    setFilterMonth("");
    setFilterDay("");
  }, []);

  const activeDateFilterLabel = useMemo(() => {
    if (customRange) {
      if (customRange.fromYmd === customRange.toYmd) {
        return `Custom · ${isoYmdToUsDisplay(customRange.fromYmd)}`;
      }
      return `Custom · ${isoYmdToUsDisplay(customRange.fromYmd)} – ${isoYmdToUsDisplay(customRange.toYmd)}`;
    }
    if (rangePreset) {
      const preset = RANGE_PRESETS.find((p) => p.id === rangePreset);
      const { fromDate, toDate } = rangeForPreset(rangePreset);
      if (fromDate === toDate) {
        return `${preset?.label ?? "Range"} · ${isoYmdToUsDisplay(fromDate)}`;
      }
      return `${preset?.label ?? "Range"} · ${isoYmdToUsDisplay(fromDate)} – ${isoYmdToUsDisplay(toDate)}`;
    }
    if (datePick) return `Single day · ${isoYmdToUsDisplay(datePick)}`;
    return "";
  }, [customRange, rangePreset, datePick]);

  const summaryAmount =
    summary.totalAmountDisplay ?? formatCurrencyFull(summary.totalAmount);
  const summaryCount = summary.totalCountDisplay ?? summary.totalCount.toLocaleString("en-US");
  const summaryDeals = summary.dealCountDisplay ?? summary.dealCount.toLocaleString("en-US");

  const tableHeadClass =
    "border-b-2 border-[var(--brand)]/15 bg-gradient-to-b from-slate-100 to-slate-50/95 px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600 dark:border-[var(--brand)]/25 dark:from-slate-900 dark:to-slate-900/90 dark:text-slate-300";

  const tableCellClass =
    "border-b border-slate-100 px-4 py-3 align-middle text-sm text-foreground transition-colors group-hover/row:border-slate-200/80 dark:border-slate-800/80";

  const tableRowClass = (idx: number) =>
    `group/row border-l-[3px] border-l-transparent transition-colors hover:border-l-[var(--brand)]/70 hover:bg-[var(--brand)]/[0.04] dark:hover:bg-[var(--brand)]/10 ${
      idx % 2 === 0
        ? "bg-white dark:bg-slate-950/40"
        : "bg-slate-50/80 dark:bg-slate-900/25"
    }`;

  return (
    <div className="payment-module relative min-h-[calc(100vh-6rem)] bg-gradient-to-b from-slate-50/90 via-background to-background dark:from-slate-950/80">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={() => navigate("/payments")}
          className="group mb-6 inline-flex cursor-pointer items-center gap-2 rounded-full px-1 py-1 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
        >
          <span className="flex size-8 items-center justify-center rounded-full border border-border/60 bg-card/80 shadow-sm transition-transform group-hover:-translate-x-0.5 dark:bg-card/50">
            <ArrowLeft size={16} aria-hidden className="shrink-0" />
          </span>
          Back to payments
        </button>

        <motion.header
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
            Collections
          </p>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Failed transactions
          </h1>
          {/* <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">/ */}
        </motion.header>

        <div className="relative mb-6">
          {showSummaryTotalsSpinner ? (
            <div className="flex min-h-[8.5rem] flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card/80 px-6 py-12 text-center shadow-sm dark:border-white/10 dark:bg-card/40">
              <Loader2
                className="size-9 animate-spin text-[var(--brand)]"
                aria-hidden
              />
              <div>
                <p className="text-base font-semibold text-foreground">Loading portfolio totals…</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Totals include every matching failed payment across funded deals. The table below can
                  appear first while this finishes.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative">
              {showSummaryUpdatingOverlay ? (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/55 backdrop-blur-[2px] dark:bg-background/45"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/95 px-4 py-2 text-sm font-medium text-foreground shadow-lg dark:border-white/10">
                    <Loader2 className="size-4 shrink-0 animate-spin text-[var(--brand)]" aria-hidden />
                    Updating totals…
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SummaryCard
                  icon={<TrendingDown className="size-5 text-red-500" aria-hidden />}
                  title="Total failed amount"
                  value={summaryAmount}
                  accent="red"
                />
                <SummaryCard
                  icon={<AlertCircle className="size-5 text-amber-500" aria-hidden />}
                  title="Failed transactions"
                  value={summaryCount}
                  accent="amber"
                />
                <SummaryCard
                  icon={<AlertCircle className="size-5 text-sky-500" aria-hidden />}
                  title="Affected deals"
                  value={summaryDeals}
                  accent="sky"
                />
              </div>
            </div>
          )}
        </div>

        <div className="mb-6 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur-md transition-shadow duration-300 hover:shadow-md dark:border-white/10 dark:bg-card/40">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative min-w-0 w-full sm:max-w-xl sm:flex-1">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search by business name or deal ID…"
                  className="h-10 rounded-xl border-border/80 bg-background/80 pl-10 shadow-inner transition-[box-shadow,border-color] duration-200 focus-visible:border-[var(--brand)]/50 focus-visible:ring-[var(--brand)]/20"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {dealsToolbarHint ? (
                <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
                  {dealsToolbarHint}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 dark:border-white/10 dark:bg-muted/10">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-xs font-semibold text-foreground">Transaction dates</p>
                {activeDateFilterLabel ? (
                  <p className="text-xs tabular-nums text-muted-foreground">{activeDateFilterLabel}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-4">
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Quick date ranges"
                >
                  {RANGE_PRESETS.map((preset) => {
                    const active = !customRange && rangePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => selectPreset(preset.id)}
                        aria-pressed={active}
                        className={`inline-flex h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 ${
                          active
                            ? "border-[var(--brand)] bg-[image:var(--brand-gradient)] text-white shadow-sm hover:bg-[#1f5d86]"
                            : "border-border/80 bg-background/90 text-muted-foreground hover:border-[var(--brand)]/35 hover:bg-background hover:text-foreground"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <div className="hidden h-9 w-px shrink-0 bg-border/70 xl:block" aria-hidden />

                <div
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                  role="group"
                  aria-label="Custom date range from and to"
                >
                  <FailedDateField
                    id="ft-range-from"
                    label="From"
                    inline
                    value={draftRangeFrom}
                    onChange={setDraftRangeFrom}
                  />
                  <span className="px-0.5 text-sm text-muted-foreground" aria-hidden>
                    –
                  </span>
                  <FailedDateField
                    id="ft-range-to"
                    label="To"
                    inline
                    value={draftRangeTo}
                    onChange={setDraftRangeTo}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canApplyCustomRange}
                    onClick={applyCustomDateRange}
                    className={`h-9 shrink-0 rounded-lg px-3.5 text-xs font-semibold ${
                      customRangePendingApply
                        ? "bg-[image:var(--brand-gradient)] text-white hover:bg-[#1f5d86]"
                        : customRange
                          ? "border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)] hover:bg-[var(--brand)]/15"
                          : ""
                    }`}
                  >
                    {customRangePendingApply ? "Apply" : customRange ? "Applied" : "Apply"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 shrink-0 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={clearDateFilters}
                  >
                    Reset
                  </Button>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">
                Use presets for quick ranges, or set From and To for a custom range (same day for a
                single date).
              </p>
            </div>
          </div>
        </div>
        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200/80 bg-red-50/90 p-4 text-sm text-red-700 shadow-sm dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {isInitialTableLoading ? (
          <FailedTableSkeleton />
        ) : showEmpty ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-24 text-center shadow-inner dark:bg-card/20">
            <AlertCircle className="mb-4 size-12 text-muted-foreground/80" aria-hidden />
            <p className="text-lg font-semibold text-foreground">No failed transactions</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {debouncedSearch.trim().length > 0
                ? "Try a different deal ID or business name."
                : activeDateFilter
                  ? customRange
                    ? `No failed payments from ${isoYmdToUsDisplay(customRange.fromYmd)} to ${isoYmdToUsDisplay(customRange.toYmd)}.`
                    : rangePreset
                      ? `No failed payments on the selected dates (${RANGE_PRESETS.find((p) => p.id === rangePreset)?.label.toLowerCase()}).`
                      : "No failed payments on the selected date."
                  : "No failed payments in this view for funded deals."}
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-lg ring-1 ring-black/[0.03] dark:border-white/10 dark:bg-card/50 dark:ring-white/[0.04]"
          >
            {isRefetchingTable ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-background/40 pt-24 backdrop-blur-[1px] dark:bg-background/30">
                <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/95 px-4 py-2 text-xs font-medium text-muted-foreground shadow-lg">
                  <Loader2 className="size-3.5 animate-spin text-[var(--brand)]" aria-hidden />
                  Updating…
                </div>
              </div>
            ) : null}
            <div className="max-h-[min(70vh,52rem)] overflow-auto [scrollbar-gutter:stable]">
              <table className="w-full min-w-[80rem] border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20 shadow-[0_1px_0_0_rgba(39,109,156,0.12)]">
                  <tr>
                    <th className={`${tableHeadClass} w-[7.5rem] min-w-[7rem]`}>
                      <SortableHeader
                        label="Deal ID"
                        sortKey="dealId"
                        activeKey={sortKey}
                        direction={sortDir}
                        onToggle={toggleSort}
                      />
                    </th>
                    <th className={`${tableHeadClass} min-w-[12rem] max-w-[18rem]`}>
                      Deal name
                    </th>
                    <th
                      className={`${tableHeadClass} w-[7.25rem] min-w-[7rem] whitespace-nowrap`}
                    >
                      <SortableHeader
                        label="Date"
                        sortKey="date"
                        activeKey={sortKey}
                        direction={sortDir}
                        onToggle={toggleSort}
                      />
                    </th>
                    <th className={`${tableHeadClass} w-[7.5rem] min-w-[7rem] text-right`}>
                      <SortableHeader
                        label="Debit"
                        sortKey="amount"
                        activeKey={sortKey}
                        direction={sortDir}
                        onToggle={toggleSort}
                        align="right"
                      />
                    </th>
                    <th className={`${tableHeadClass} w-[11rem] min-w-[9rem]`}>Status</th>
                    <th className={`${tableHeadClass} min-w-[14rem]`}>Description</th>
                    <th className={`${tableHeadClass} w-[8.5rem] min-w-[8rem]`}>
                      Payback amount
                    </th>
                    <th className={`${tableHeadClass} w-[8.5rem] min-w-[8rem]`}>
                      Balance amount
                    </th>
                    <th className={`${tableHeadClass} w-[8.5rem] min-w-[7.5rem] text-center`}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((group) => {
                    const dealToken = dealLabelFromGroup(group);
                    const rows = group.transactions;
                    const span = Math.max(1, rows.length);
                    const businessName = group.businessName?.trim() || "";
                    const canOpenDeal = Boolean(group.applicationId);
                    const openDeal = () => {
                      if (!canOpenDeal) return;
                      navigate(`/payments/${encodeURIComponent(group.applicationId)}`);
                    };

                    const dealIdCell = (
                      <button
                        type="button"
                        onClick={openDeal}
                        disabled={!canOpenDeal}
                        title={canOpenDeal ? `Open deal ${dealToken}` : undefined}
                        className={`group/dl inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg border border-transparent bg-[var(--brand)]/[0.06] px-2.5 py-1 text-left text-sm font-semibold tabular-nums text-[var(--brand)] transition-all hover:border-[var(--brand)]/25 hover:bg-[var(--brand)]/10 hover:text-[var(--brand-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-foreground disabled:opacity-80 dark:hover:bg-[var(--brand)]/20 ${canOpenDeal ? "cursor-pointer" : ""}`}
                      >
                        <span className="truncate">{dealToken}</span>
                        {canOpenDeal ? (
                          <ExternalLink
                            className="size-3.5 shrink-0 opacity-50 transition-opacity group-hover/dl:opacity-100"
                            aria-hidden
                          />
                        ) : null}
                      </button>
                    );

                    const dealNameCell = businessName ? (
                      <span
                        className="line-clamp-3 block text-sm font-medium leading-snug text-foreground/90"
                        title={businessName}
                      >
                        {businessName}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    );

                    const paybackCell = (
                      <span className="block w-full text-left text-[13px] font-medium tabular-nums text-foreground">
                        {groupPaybackLabel(group)}
                      </span>
                    );

                    const balanceCell = (
                      <span className="block w-full text-left text-[13px] font-medium tabular-nums text-foreground">
                        {groupBalanceLabel(group)}
                      </span>
                    );

                    const actionCell = (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canOpenDeal}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!canOpenDeal) return;
                          setPaymentSummaryModal({
                            applicationId: group.applicationId,
                            dealId: group.dealId,
                            dealLabel: dealLabelFromGroup(group),
                          });
                        }}
                        className="h-8 rounded-lg border-[var(--brand)]/30 px-3 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand)]/10 hover:text-[var(--brand-accent-strong)] disabled:opacity-50"
                      >
                        View summary
                      </Button>
                    );

                    if (rows.length === 0) {
                      return (
                        <tr key={group.applicationId} className={tableRowClass(0)}>
                          <td className={`${tableCellClass} align-top`}>{dealIdCell}</td>
                          <td className={`${tableCellClass} align-top`}>{dealNameCell}</td>
                          <td
                            className={`${tableCellClass} whitespace-nowrap tabular-nums text-muted-foreground`}
                          >
                            —
                          </td>
                          <td className={`${tableCellClass} text-right text-muted-foreground`}>
                            —
                          </td>
                          <td className={`${tableCellClass} text-muted-foreground`}>—</td>
                          <td className={`${tableCellClass} text-muted-foreground`}>
                            No transaction rows for this deal.
                          </td>
                          <td className={`${tableCellClass} align-top text-left`}>
                            {paybackCell}
                          </td>
                          <td className={`${tableCellClass} align-top text-left`}>
                            {balanceCell}
                          </td>
                          <td className={`${tableCellClass} align-top text-center`}>
                            {actionCell}
                          </td>
                        </tr>
                      );
                    }

                    return rows.map((tx, idx) => {
                      const isFirst = idx === 0;
                      const dateCol = rowDateListCell(tx);
                      const dateDisplay =
                        dateCol !== "—" ? isoYmdToUsDisplay(dateCol) || dateCol : "—";
                      const descTitle = [
                        dateCol !== "—" ? `Date: ${dateCol}` : null,
                        tx.notes?.trim(),
                      ]
                        .filter(Boolean)
                        .join("\n");
                      const debitStr = rowDebitListCell(tx);
                      const notes = tx.notes?.trim() || "";
                      const statusInfo = resolveRowStatus(tx);
                      const statusTitle = statusInfo
                        ? statusInfo.meaning
                          ? `${statusInfo.code} - ${statusInfo.meaning}`
                          : statusInfo.code
                        : undefined;
                      return (
                        <tr key={tx.id} className={tableRowClass(idx)}>
                          {isFirst ? (
                            <td rowSpan={span} className={`${tableCellClass} align-top`}>
                              {dealIdCell}
                            </td>
                          ) : null}
                          {isFirst ? (
                            <td rowSpan={span} className={`${tableCellClass} align-top`}>
                              {dealNameCell}
                            </td>
                          ) : null}
                          <td
                            className={`${tableCellClass} whitespace-nowrap text-[13px] font-medium tabular-nums text-slate-700 dark:text-slate-200`}
                          >
                            {dateDisplay}
                          </td>
                          <td
                            className={`${tableCellClass} text-right text-[13px] font-semibold tabular-nums text-red-600 dark:text-red-400`}
                          >
                            {debitStr !== "—" ? (
                              <span className="inline-block rounded-md bg-red-50 px-2 py-0.5 dark:bg-red-950/40">
                                {debitStr}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={`${tableCellClass} whitespace-nowrap`}>
                            {statusInfo ? (
                              <span
                                className="inline-flex max-w-full items-center gap-1 rounded-md border border-red-200/80 bg-red-50 px-2 py-0.5 text-[12px] font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200"
                                title={statusTitle}
                              >
                                <span className="tabular-nums">{statusInfo.code}</span>
                                {statusInfo.meaning ? (
                                  <span className="truncate text-[11px] font-medium text-red-700/85 dark:text-red-200/85">
                                    {statusInfo.meaning}
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className={tableCellClass}>
                            {notes ? (
                              <p
                                className="line-clamp-3 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 text-[13px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300"
                                title={descTitle || undefined}
                              >
                                {notes}
                              </p>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          {isFirst ? (
                            <td
                              rowSpan={span}
                              className={`${tableCellClass} align-top text-left`}
                            >
                              {paybackCell}
                            </td>
                          ) : null}
                          {isFirst ? (
                            <td
                              rowSpan={span}
                              className={`${tableCellClass} align-top text-left`}
                            >
                              {balanceCell}
                            </td>
                          ) : null}
                          {isFirst ? (
                            <td
                              rowSpan={span}
                              className={`${tableCellClass} align-top text-center`}
                            >
                              {actionCell}
                            </td>
                          ) : null}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {showPager ? (
          <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/80 px-4 py-3 shadow-sm backdrop-blur-sm sm:flex-row dark:border-white/10 dark:bg-card/40">
            <p className="text-xs text-muted-foreground">
              {hasExactTotals ? (
                <>
                  Page {pagination.page} of {Math.max(totalPages, 1)} · {pagination.total} total deals
                </>
              ) : (
                <>
                  Page {pagination.page}
                  {pagination.hasNextPage ? " · more pages available" : ""}
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg px-2"
                onClick={() => goToPage(1)}
                disabled={!canPrev || tableLoading || !hasExactTotals}
                aria-label="First page"
              >
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg px-2"
                onClick={() => goToPage(page - 1)}
                disabled={!canPrev || tableLoading}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              {hasExactTotals && pageNumbers.length > 0
                ? pageNumbers.map((label, idx) =>
                    typeof label === "number" ? (
                      <Button
                        key={`pg-${label}-${idx}`}
                        variant={label === page ? "default" : "ghost"}
                        size="sm"
                        className="h-9 min-w-[2.25rem] rounded-lg px-2 text-xs"
                        onClick={() => goToPage(label)}
                        disabled={tableLoading}
                      >
                        {label}
                      </Button>
                    ) : (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-1 text-xs text-muted-foreground"
                        aria-hidden
                      >
                        {label}
                      </span>
                    ),
                  )
                : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg px-2"
                onClick={() => goToPage(page + 1)}
                disabled={!canNext || tableLoading}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg px-2"
                onClick={() => goToPage(totalPages)}
                disabled={!canNext || tableLoading || !hasExactTotals}
                aria-label="Last page"
              >
                <ChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      <DealPaymentSummaryModal
        open={paymentSummaryModal != null}
        onOpenChange={(open) => {
          if (!open) setPaymentSummaryModal(null);
        }}
        applicationId={paymentSummaryModal?.applicationId ?? ""}
        dealId={paymentSummaryModal?.dealId ?? null}
        dealLabel={paymentSummaryModal?.dealLabel}
      />
      </div>
    </div>
  );
}

type SummaryCardProps = {
  icon: ReactNode;
  title: string;
  value: string;
  accent: "red" | "amber" | "sky";
};

function SummaryCard({ icon, title, value, accent }: SummaryCardProps) {
  const accentRing =
    accent === "red"
      ? "ring-red-400/30 dark:ring-red-300/20"
      : accent === "amber"
        ? "ring-amber-400/30 dark:ring-amber-300/20"
        : "ring-sky-400/30 dark:ring-sky-300/20";
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-5 shadow-lg ring-1 ring-inset transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${accentRing} dark:border-white/10 dark:bg-white/[0.05]`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.12),transparent_55%)] opacity-90 transition-opacity group-hover:opacity-100 dark:bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.07),transparent_55%)]" />
      <div className="relative flex items-start gap-3">
        <div className="rounded-xl border border-border/50 bg-background/70 p-2 shadow-sm transition-transform duration-300 group-hover:scale-105 dark:border-white/10 dark:bg-white/[0.06]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 whitespace-nowrap text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

type SortableHeaderProps = {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDir;
  onToggle: (key: SortKey) => void;
  align?: "left" | "right";
};

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onToggle,
  align = "left",
}: SortableHeaderProps) {
  const isActive = activeKey === sortKey;
  const Icon = isActive ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const nextDir = isActive ? (direction === "asc" ? "descending" : "ascending") : "ascending";
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      aria-label={`Sort by ${label} (${nextDir})`}
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`group/sort -mx-1 inline-flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 ${
        align === "right" ? "justify-end" : "justify-start"
      } ${isActive ? "text-[var(--brand)] dark:text-sky-300" : ""}`}
    >
      <span>{label}</span>
      <Icon
        className={`size-3.5 shrink-0 transition-opacity ${
          isActive ? "opacity-100" : "opacity-40 group-hover/sort:opacity-80"
        }`}
        aria-hidden
      />
    </button>
  );
}

type FailedDateFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (ymd: string) => void;
  inline?: boolean;
};

function FailedDateField({ id, label, value, onChange, inline }: FailedDateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const display = value ? isoYmdToUsDisplay(value) : "";

  const picker = (
    <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => openNativeDatePicker(inputRef.current)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openNativeDatePicker(inputRef.current);
          }
        }}
        className={`relative shrink-0 cursor-pointer ${
          inline ? "h-9 w-[7.75rem] sm:w-[8.25rem]" : "h-11 w-[8.75rem] sm:w-[9.25rem]"
        }`}
      >
        <Input
          readOnly
          tabIndex={-1}
          placeholder="MM/DD/YYYY"
          aria-hidden
          className={`pointer-events-none w-full rounded-lg border-border/80 bg-background/90 pr-8 tabular-nums ${
            inline ? "h-9 text-sm" : "h-11 rounded-xl"
          }`}
          value={display}
        />
        <input
          ref={inputRef}
          id={id}
          type="date"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) onChange(v);
          }}
        />
        <span
          className="pointer-events-none absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center text-muted-foreground"
          aria-hidden
        >
          <Calendar className="size-3.5 shrink-0" />
        </span>
      </div>
  );

  if (inline) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-9 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
        {picker}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {picker}
    </div>
  );
}

function FailedTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-4 shadow-inner dark:border-white/10 dark:bg-card/30">
      <div className="space-y-2.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-12 w-full animate-pulse rounded-xl bg-muted/50"
            style={{ animationDelay: `${i * 45}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
