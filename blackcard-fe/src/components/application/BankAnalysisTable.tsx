import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Check,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Loader2,
  Pencil,
} from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import { axiosGet, axiosPost, axiosPut, axiosDelete } from "@/redux/axios";
import type { BankAnalysis } from "@/types/bankAnalysisTypes";
import { toast } from "react-toastify";
import { usePendingSaveGuard } from "@/lib/usePendingSaveGuard";
import { formatInt, formatNumberUS, formatNumberUSForInput, normalizeApiDateToYyyyMmDd } from "@/lib/utils";
import BankTotalTable from "@/components/application/BankTotalTable";
import type { BankTotalRow } from "@/lib/positionMetrics";
import TaggedCurrencyCell from "@/components/application/TaggedCurrencyCell";
import BankMonthlyBarAndPositionsPie from "@/mcaWdPreview/components/BankMonthlyBarAndPositionsPie.jsx";
import { SPA_SCRUBBER_SYNCED_EVENT } from "@/components/application/contractdata/spaScrubberSync";
import type {
  BankTotalTableAverageCells,
  BankTotalTableRow,
} from "@/components/application/BankTotalTable";
import "@/styles/scrubbingPreviewTheme.css";

interface MonthlyData {
  month: string;
  totalCredit: string;
  loanTransfer: string;
  deposit: string;
  other: string;
  nsfNegDays: string;
  lowBlcDays: string;
  avgDailyBlc: string;
  /** Backend row id; set when loaded or after save. Used to permanently delete row via API. */
  rowBackendId?: string;
  /** When true, cells are read-only until user uses “Edit rows” for this bank. */
  isLocked?: boolean;
}

interface BankAnalysisInstance {
  id: number;
  backendId?: string;
  accountNumber: string;
  rows: MonthlyData[];
  /** After header Save (or load from API with an account), show "Saved" until user clicks Edit. */
  accountHeaderLocked?: boolean;
}

type MonthSummaryBucket = {
  totalCredit: number;
  loanTransfer: number;
  deposit: number;
  other: number;
  avgDailyBlcSum: number;
  avgDailyBlcPositiveCount: number;
  nsfNegDays: number;
  lowBlcDays: number;
};

type BankTotalMonth = {
  totalCredit: number;
  loanTransfer: number;
  deposit: number;
  other: number;
  netCredit: number | null;
  avgDailyBlc: number | null;
  nsfNegDays: number;
  lowBlcDays: number;
};

interface BankAnalysisTableProps {
  /** When true, only render the bottom "Bank Total" summary table (no editable bank cards) */
  showOnlyTotals?: boolean;
  /** When true, no add/edit/save/delete on bank cards (e.g. OPERATIONS view-only pipeline). */
  readOnly?: boolean;
  /**
   * Page-level edit mode. When true every month row unlocks at once and the
   * per-bank "Edit rows" button disappears - the page's single Edit/Save
   * toolbar owns the lock state for Offer, Bank Analysis and Positions.
   */
  editMode?: boolean;
  /** When true, edits are still allowed but bank- and row-level delete actions are hidden. */
  disableDelete?: boolean;
  /** When true, hide Add Bank and Add Month while keeping row editing. */
  disableCreate?: boolean;
  /** Callback with the average Net Credit across months (used for leverage/remit calculations). */
  onNetCreditAverageChange?: (avg: number | null) => void;
  /** Per-month bank totals; the Leverage card needs these for Recent month Leverage. */
  onBankTotalRowsChange?: (rows: BankTotalRow[]) => void;
  /** Fired once the saved bank analysis has loaded: true when any month was saved. */
  onSavedRowsLoaded?: (hasSavedRows: boolean) => void;
  /** Optional explicit application id (fallback when applicationDetail is not mounted). */
  applicationId?: string;
  positions?: Array<{
    amountFunded?: string | number;
    startingDate?: string;
    allocatedBankAnalysisId?: number;
  }>;
  onBanksMetaChange?: (banks: Array<{ id: number; accountNumber: string }>) => void;
  /** When true, hide per-bank Save rows / account Save — bulk save runs on Approve & Save. */
  hideToolbarSave?: boolean;
  /** Registers a bulk-save hook for the parent Approve & Save flow. */
  onRegisterSaveAll?: (saveAll: () => Promise<boolean>) => void;
  /** When true, debounce-save bank rows/account after edits (Scrubbing tab). */
  autoSave?: boolean;
  /** Debounce delay for {@link autoSave} (ms). */
  autoSaveDelayMs?: number;
  /** Show Credits Trend chart above bank cards (matches Preview order). */
  showCreditsTrend?: boolean;
}

const parseCurrency = (value: string): number => {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.-]+/g, "");
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : num;
};

/** True if the user entered a numeric value (excludes empty and placeholder like "e.g. 0"). */
const hasEnteredNumericValue = (raw: string | undefined | null): boolean => {
  if (raw == null) return false;
  const s = String(raw).trim();
  if (!s) return false;
  if (/^e\.?\s*g\.?/i.test(s)) return false;
  const cleaned = s.replace(/[^0-9.-]+/g, "");
  if (!cleaned) return false;
  const num = parseFloat(cleaned);
  return !Number.isNaN(num);
};

const normalizeMonthLabelKey = (month: string | undefined | null): string =>
  month != null ? String(month).trim().toLowerCase() : "";

const hasAnyValue = (row: MonthlyData): boolean => {
  return (
    !!row.totalCredit ||
    !!row.loanTransfer ||
    !!row.deposit ||
    !!row.other ||
    !!row.nsfNegDays ||
    !!row.lowBlcDays ||
    !!row.avgDailyBlc
  );
};

const formatMoneyRowDisplay = (row: MonthlyData): MonthlyData => ({
  ...row,
  totalCredit: hasEnteredNumericValue(row.totalCredit)
    ? formatNumberUS(parseCurrency(row.totalCredit))
    : row.totalCredit,
  loanTransfer: hasEnteredNumericValue(row.loanTransfer)
    ? formatNumberUS(parseCurrency(row.loanTransfer))
    : row.loanTransfer,
  deposit: hasEnteredNumericValue(row.deposit)
    ? formatNumberUS(parseCurrency(row.deposit))
    : row.deposit,
  other: hasEnteredNumericValue(row.other)
    ? formatNumberUS(parseCurrency(row.other))
    : row.other,
  avgDailyBlc: hasEnteredNumericValue(row.avgDailyBlc)
    ? formatNumberUS(parseCurrency(row.avgDailyBlc))
    : row.avgDailyBlc,
  nsfNegDays: hasEnteredNumericValue(row.nsfNegDays)
    ? formatInt(parseCurrency(row.nsfNegDays))
    : row.nsfNegDays,
  lowBlcDays: hasEnteredNumericValue(row.lowBlcDays)
    ? formatInt(parseCurrency(row.lowBlcDays))
    : row.lowBlcDays,
});

/** Parsed snapshot for auto-save debounce — ignores display formatting churn. */
/**
 * Preview header shows "A/C ending: 1234". Same rule as the preview's
 * getLast4Digits: skip still-encrypted values, prefer digits, fall back to raw.
 */
function getAccountLast4(value: unknown): string | null {
  // An AES-GCM payload (iv.tag.ciphertext) means the server could not decrypt,
  // so show nothing rather than a blob.
  const rawValue = value != null ? String(value).trim() : "";
  const parts = rawValue.split(".");
  const looksEncrypted =
    parts.length === 3 &&
    parts.every((part) => part.length > 0 && /^[A-Za-z0-9+/]+=*$/.test(part));
  if (!rawValue || looksEncrypted) return null;
  const digitsOnly = rawValue.replace(/\D/g, "");
  const source = digitsOnly || rawValue;
  const last4 = source.slice(-4);
  return last4.length ? last4 : null;
}

function buildBanksPersistSignature(banks: BankAnalysisInstance[]): string {
  return JSON.stringify(
    banks.map((b) => ({
      id: b.id,
      backendId: b.backendId ?? "",
      accountNumber: (b.accountNumber ?? "").trim(),
      rows: b.rows
        .filter(hasAnyValue)
        .map((r) => ({
          month: r.month,
          rowBackendId: r.rowBackendId ?? "",
          totalCredit: parseCurrency(r.totalCredit),
          loanTransfer: parseCurrency(r.loanTransfer),
          deposit: parseCurrency(r.deposit),
          other: parseCurrency(r.other),
          nsfNegDays: parseCurrency(r.nsfNegDays),
          lowBlcDays: parseCurrency(r.lowBlcDays),
          avgDailyBlc: parseCurrency(r.avgDailyBlc),
        })),
    })),
  );
}

/**
 * Funding Amt for a row: the allocated Positions total REPLACES stored funding
 * when nothing was typed - it is never added to it.
 *
 * Mirrors WouldMePreviewModal's getDisplayLoan. Adding the two counts the same
 * advance twice (once on the bank row, once via the linked position), which
 * pushes Net Credit negative and zeroes every leverage percentage downstream.
 * Both the per-row display and the monthly totals must use this, or the table
 * and the Leverage card disagree.
 */
function effectiveFundingAmount(
  raw: string | undefined | null,
  allocated: number,
): number {
  const base = parseCurrency(raw ?? "");
  // An entered value wins even when it is 0. That is how a user clears an
  // amount that came from Positions: without this, a cleared cell would read
  // as "blank" and the allocation they just removed would come straight back.
  if (hasEnteredNumericValue(raw)) return base;
  return allocated > 0 ? allocated : base;
}

const computeBankTotalForMonth = (bucket: MonthSummaryBucket): BankTotalMonth => {
  const totalCredit = bucket.totalCredit;
  const loanTransfer = bucket.loanTransfer;
  const deposit = bucket.deposit;
  const other = bucket.other;

  let netCredit: number | null = null;
  if (totalCredit > 0) {
    const rawNet = totalCredit - (loanTransfer + deposit + other);
    netCredit = Math.max(0, rawNet);
  }

  let avgDailyBlc: number | null = null;
  if (bucket.avgDailyBlcPositiveCount > 0 && bucket.avgDailyBlcSum > 0) {
    avgDailyBlc = bucket.avgDailyBlcSum / bucket.avgDailyBlcPositiveCount;
  } else if (netCredit !== null && netCredit > 0) {
    avgDailyBlc = netCredit / 30;
  }

  return {
    totalCredit,
    loanTransfer,
    deposit,
    other,
    netCredit,
    avgDailyBlc,
    nsfNegDays: bucket.nsfNegDays,
    lowBlcDays: bucket.lowBlcDays,
  };
};

const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

const createDefaultRows = (): MonthlyData[] => {

  const rows: MonthlyData[] = [];
  const now = new Date();

  // Generate the current month (MTD) + previous 5 full months
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const name = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();

    const label = i === 0 ? `${name} MTD` : `${name} ${year}`;

    rows.push({
      month: label,
      totalCredit: "",
      loanTransfer: "",
      deposit: "",
      other: "",
      nsfNegDays: "",
      lowBlcDays: "",
      avgDailyBlc: "",
    });
  }

  return rows;
};

/** Parse "April MTD" or "March 2026" to the first day of that month (MTD uses the current calendar year). */
function parseMonthLabelToDate(label: string): Date | null {
  const trimmed = String(label || "").trim();
  if (!trimmed) return null;
  const mtd = trimmed.match(/^([A-Za-z]+)\s+MTD$/i);
  if (mtd) {
    const monthIdx = MONTH_NAMES.findIndex(
      (m) => m.toLowerCase() === mtd[1].toLowerCase(),
    );
    if (monthIdx < 0) return null;
    const now = new Date();
    return new Date(now.getFullYear(), monthIdx, 1);
  }
  const full = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/i);
  if (!full) return null;
  const monthIdx = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === full[1].toLowerCase(),
  );
  if (monthIdx < 0) return null;
  const year = parseInt(full[2], 10);
  if (!Number.isFinite(year)) return null;
  return new Date(year, monthIdx, 1);
}

function monthLabelSortKey(label: string): number {
  const d = parseMonthLabelToDate(label);
  return d != null && !Number.isNaN(d.getTime())
    ? d.getTime()
    : Number.NEGATIVE_INFINITY;
}


/** Newest month first (same convention as default rows: current MTD, then prior full months). */
function sortMonthlyRowsByMonthDesc(rows: MonthlyData[]): MonthlyData[] {
  return [...rows].sort((a, b) => {
    const diff = monthLabelSortKey(b.month) - monthLabelSortKey(a.month);
    if (diff !== 0) return diff;
    return String(a.month).localeCompare(String(b.month));
  });
}

const emptyMonthRow = (month: string): MonthlyData => ({
  month,
  totalCredit: "",
  loanTransfer: "",
  deposit: "",
  other: "",
  nsfNegDays: "",
  lowBlcDays: "",
  avgDailyBlc: "",
});

/**
 * Saved rows as of today (mca-tool normalizeLoadedRowsForCurrentMonth): a stale
 * "September MTD" becomes "September 2026", the current month is always the
 * first row as "<Month> MTD" (blank when nothing was saved for it — empty rows
 * are never persisted), and months between the latest saved row and today are
 * filled in blank.
 */
function normalizeLoadedRowsForCurrentMonth(rows: MonthlyData[]): MonthlyData[] {
  const now = new Date();
  const currentIdx = now.getMonth();
  const currentYear = now.getFullYear();
  const keyOf = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const currentKey = keyOf(now);

  let currentRow: MonthlyData | null = null;
  const rest: MonthlyData[] = [];
  rows.forEach((row) => {
    let label = String(row.month || "").trim();
    const mtd = label.match(/^([A-Za-z]+)\s+MTD$/i);
    if (mtd) {
      const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === mtd[1].toLowerCase());
      if (idx >= 0 && idx !== currentIdx) {
        label = `${MONTH_NAMES[idx]} ${idx > currentIdx ? currentYear - 1 : currentYear}`;
      }
    }
    const d = parseMonthLabelToDate(label);
    if (d && keyOf(d) === currentKey && !currentRow) {
      currentRow = { ...row, month: `${MONTH_NAMES[currentIdx]} MTD` };
      return;
    }
    rest.push(label === row.month ? row : { ...row, month: label });
  });

  const latestKey = rest.reduce((max, row) => {
    const d = parseMonthLabelToDate(row.month);
    return d ? Math.max(max, keyOf(d)) : max;
  }, Number.NEGATIVE_INFINITY);
  const gap: MonthlyData[] = [];
  if (Number.isFinite(latestKey)) {
    for (let i = 1; currentKey - i > latestKey; i += 1) {
      const d = new Date(currentYear, currentIdx - i, 1);
      gap.push(emptyMonthRow(`${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`));
    }
  }

  return sortMonthlyRowsByMonthDesc([
    currentRow ?? emptyMonthRow(`${MONTH_NAMES[currentIdx]} MTD`),
    ...gap,
    ...rest,
  ]);
}

/** A month is worth showing read-only only when one of its values is above 0. */
const rowHasPositiveValue = (row: MonthlyData, fundingAmount = 0): boolean =>
  fundingAmount > 0 ||
  [
    row.totalCredit,
    row.loanTransfer,
    row.deposit,
    row.other,
    row.nsfNegDays,
    row.lowBlcDays,
    row.avgDailyBlc,
  ].some((v) => parseCurrency(String(v ?? "")) > 0);

/** Next older calendar month label after the chronologically oldest row (for Add Month). */
function labelForMonthBeforeOldest(sortedRowsDesc: MonthlyData[]): string {
  const now = new Date();
  const oldest = sortedRowsDesc[sortedRowsDesc.length - 1];
  if (oldest) {
    const od = parseMonthLabelToDate(oldest.month);
    if (od && !Number.isNaN(od.getTime())) {
      const d = new Date(od.getFullYear(), od.getMonth() - 1, 1);
      return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    }
  }
  const d = new Date(now.getFullYear(), now.getMonth() - sortedRowsDesc.length, 1);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** First cell for average footer rows: bold “AVERAGE” with blue subtitle. */
function BankAnalysisAverageFooterLabelCell({
  monthWindow,
  monthCount,
}: {
  /** When set, labels the row as a last-N-month scrubbing average. */
  monthWindow?: number;
  monthCount?: number;
}) {
  // Preview prints a bare "(MTD Not counted)"; only an explicit scrubbing
  // window earns the longer form.
  let subtitle = "(MTD Not counted)";
  if (monthWindow != null && monthWindow > 0) {
    subtitle = `(last ${monthWindow} months, MTD not counted)`;
  }
  return (
    <td className="px-4 py-3 align-middle bg-inherit">
      <div className="flex flex-col leading-snug">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
          Average
        </span>
        <span className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-sky-300">
          {subtitle}
        </span>
      </div>
    </td>
  );
}

const BankAnalysisTable = ({
  showOnlyTotals = false,
  readOnly = false,
  editMode,
  disableDelete = false,
  disableCreate = false,
  onNetCreditAverageChange,
  onBankTotalRowsChange,
  onSavedRowsLoaded,
  applicationId: applicationIdProp,
  positions = [],
  onBanksMetaChange,
  hideToolbarSave = false,
  onRegisterSaveAll,
  autoSave = false,
  autoSaveDelayMs = 1500,
  showCreditsTrend = false,
}: BankAnalysisTableProps) => {
  const isReadOnly = !!readOnly;
  /** Page-level edit mode never overrides read-only (preview / view-only pipeline). */
  const isPageEditing = !!editMode && !isReadOnly;
  /**
   * True when a page-level Edit button owns the lock state. Those screens hide
   * the per-bank "Edit rows" button entirely: everything is unlocked from the
   * one button at the top.
   */
  const pageDrivesEditing = editMode !== undefined;
  /** Hide per-bank Save when bulk save is wired (e.g. Offer "Approve & Save"). */
  const deferToolbarSave = hideToolbarSave || Boolean(onRegisterSaveAll);
  const isDeleteDisabled = !!disableDelete;
  const isCreateDisabled = !!disableCreate;
  const [fundingBreakdownModal, setFundingBreakdownModal] = useState<{
    bankId: number;
    rowIndex: number;
    month: string;
    allocated: number;
  } | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [savingHeaderBankId, setSavingHeaderBankId] = useState<number | null>(null);
  const [bulkSavingBankId, setBulkSavingBankId] = useState<number | null>(null);
  const [deletingBankId, setDeletingBankId] = useState<number | null>(null);
  const [deletingRow, setDeletingRow] = useState<{ bankId: number; rowIndex: number } | null>(null);
  /** Blocks duplicate API saves when save is triggered faster than React re-renders. */
  const saveBankInFlightRef = useRef<Set<number>>(new Set());
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Debounced autosave waiting on its timer (flushed on unmount / tab close). */
  const pendingAutoSaveRef = useRef<(() => Promise<void>) | null>(null);
  const autoSaveInFlightRef = useRef(0);
  const lastLoadedBankAppRef = useRef<string | undefined>(undefined);
  const lastAutoSavedBanksSigRef = useRef<string>("");
  const banksAutoSaveBootstrappedRef = useRef(false);

  const { data: applicationData } = useSelector(
    (state: RootState) => state.applicationDetail,
  );
  const applicationId = (applicationIdProp || (applicationData?._id as string | undefined));

  const [banks, setBanks] = useState<BankAnalysisInstance[]>([
    {
      id: 1,
      accountNumber: "",
      rows: createDefaultRows(),
      accountHeaderLocked: false,
    },
  ]);

  const baseMonths = useMemo(() => {
    const r0 = banks[0]?.rows;
    if (!r0?.length) return createDefaultRows().map((row) => row.month);
    return sortMonthlyRowsByMonthDesc(r0).map((row) => row.month);
  }, [banks]);

  useEffect(() => {
    if (!onBanksMetaChange) return;
    onBanksMetaChange(
      banks.map((b) => ({ id: b.id, accountNumber: b.accountNumber || "" })),
    );
  }, [banks, onBanksMetaChange]);

  const toYearMonthFromLabel = (label: string): string => {
    const now = new Date();
    const mtd = label.match(/^([A-Za-z]+)\s+MTD$/);
    if (mtd) {
      const monthIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === mtd[1].toLowerCase());
      if (monthIdx < 0) return "";
      return `${now.getFullYear()}-${String(monthIdx + 1).padStart(2, "0")}`;
    }
    const full = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (!full) return "";
    const monthIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === full[1].toLowerCase());
    if (monthIdx < 0) return "";
    return `${full[2]}-${String(monthIdx + 1).padStart(2, "0")}`;
  };

  const {
    loanTransferAllocatedByBankAndMonth,
    loanTransferAllocationAmountsByBankAndMonth,
  } = useMemo(() => {
    const map: Record<string, number> = {};
    const amountsMap: Record<string, number[]> = {};
    const bankCount = banks.length;
    if (!bankCount || !Array.isArray(positions)) {
      return {
        loanTransferAllocatedByBankAndMonth: map,
        loanTransferAllocationAmountsByBankAndMonth: amountsMap,
      };
    }

    const pushAmount = (key: string, amount: number) => {
      map[key] = (map[key] || 0) + amount;
      if (!amountsMap[key]) amountsMap[key] = [];
      amountsMap[key].push(amount);
    };

    positions.forEach((p) => {
      const amount = parseCurrency(String(p?.amountFunded ?? ""));
      if (!Number.isFinite(amount) || amount <= 0) return;
      const date = normalizeApiDateToYyyyMmDd(p?.startingDate ?? "");
      const ymMatch = date.match(/^(\d{4}-\d{2})/);
      if (!ymMatch) return;
      const ym = ymMatch[1];

      if (bankCount === 1) {
        pushAmount(`1|${ym}`, amount);
        return;
      }

      const idxRaw = p?.allocatedBankAnalysisId;
      const idx = Number(idxRaw);
      if (!Number.isInteger(idx) || idx < 1 || idx > bankCount) return;
      pushAmount(`${idx}|${ym}`, amount);
    });

    return {
      loanTransferAllocatedByBankAndMonth: map,
      loanTransferAllocationAmountsByBankAndMonth: amountsMap,
    };
  }, [banks.length, positions]);

  /** Per-row Funding Amt - see effectiveFundingAmount. */
  const displayFundingAmount = (row: MonthlyData, bankId: number) =>
    effectiveFundingAmount(
      row.loanTransfer,
      loanTransferAllocatedByBankAndMonth[
        `${bankId}|${toYearMonthFromLabel(row.month)}`
      ] || 0,
    );

  const calculateNetCredit = (row: MonthlyData, bankId: number) => {
    const credit = parseCurrency(row.totalCredit);
    const loan = displayFundingAmount(row, bankId);
    const deposit = parseCurrency(row.deposit);
    const other = parseCurrency(row.other);
    return credit - (loan + deposit + other);
  };

  // Load existing bank analysis data for this application
  const onSavedRowsLoadedRef = useRef(onSavedRowsLoaded);
  onSavedRowsLoadedRef.current = onSavedRowsLoaded;

  const loadBankAnalysis = useCallback(async () => {
    if (!applicationId) {
      setIsInitialLoading(false);
      return;
    }
    // A failed load counts as "has rows" so the page errs towards read-only.
    let hasSavedRows = true;
    try {
      const resp = await axiosGet(
        `/bank-analysis?${new URLSearchParams({ application: applicationId }).toString()}`,
      );
      const payload = resp.data;
      const list: BankAnalysis[] = payload?.data ?? payload ?? [];
      hasSavedRows =
        Array.isArray(list) && list.some((item) => (item.rows?.length ?? 0) > 0);
      const switchedDeal = lastLoadedBankAppRef.current !== applicationId;
      lastLoadedBankAppRef.current = applicationId;
      if (!Array.isArray(list) || list.length === 0) {
        // Another deal's cards must not stay on screen (or be autosaved into
        // this deal) when this one has no bank analysis yet.
        if (switchedDeal) {
          setBanks([
            {
              id: 1,
              accountNumber: "",
              rows: createDefaultRows(),
              accountHeaderLocked: false,
            },
          ]);
        }
        setIsInitialLoading(false);
        return;
      }
      setBanks(
        list.map((item, index) => ({
          id: index + 1,
          backendId: item._id,
          accountNumber: item.accountNumber || "",
          accountHeaderLocked: Boolean(item.accountNumber?.trim()),
          rows:
            item.rows && item.rows.length > 0
              ? normalizeLoadedRowsForCurrentMonth(
                  item.rows.map((r) => {
                    const backendNetCredit =
                      (r.totalCredit || 0) -
                      ((r.loanTransfer || 0) +
                        (r.deposit || 0) +
                        (r.other || 0));
                    const autoAvgDailyBlc =
                      backendNetCredit > 0 ? backendNetCredit / 30 : 0;

                    const mr: MonthlyData = {
                      month: r.monthLabel,
                      totalCredit: r.totalCredit ? String(r.totalCredit) : "",
                      loanTransfer: r.loanTransfer
                        ? String(r.loanTransfer)
                        : "",
                      deposit: r.deposit ? String(r.deposit) : "",
                      other: r.other ? String(r.other) : "",
                      nsfNegDays: r.nsfNegDays ? String(r.nsfNegDays) : "",
                      lowBlcDays: r.lowBlcDays ? String(r.lowBlcDays) : "",
                      avgDailyBlc: r.avgDailyBlc
                        ? String(r.avgDailyBlc)
                        : autoAvgDailyBlc > 0
                          ? formatNumberUS(autoAvgDailyBlc)
                          : "",
                      rowBackendId: (r as { _id?: string; id?: string })._id ?? (r as { _id?: string; id?: string }).id,
                    };
                    const locked = { ...mr, isLocked: hasAnyValue(mr) };
                    return formatMoneyRowDisplay(locked);
                  }),
                )
              : createDefaultRows(),
        })),
      );
    } catch (error) {
      console.error("Failed to load bank analysis", error);
    } finally {
      setIsInitialLoading(false);
      onSavedRowsLoadedRef.current?.(hasSavedRows);
    }
  }, [applicationId]);

  useEffect(() => {
    void loadBankAnalysis();
  }, [loadBankAnalysis]);

  useEffect(() => {
    if (!applicationId || typeof window === "undefined") return;
    const onSpaScrubberSynced = (event: Event) => {
      const detail = (event as CustomEvent<{ applicationUuid?: string }>).detail;
      if (String(detail?.applicationUuid ?? "").trim() !== String(applicationId).trim()) {
        return;
      }
      void loadBankAnalysis();
    };
    window.addEventListener(SPA_SCRUBBER_SYNCED_EVENT, onSpaScrubberSynced);
    return () => {
      window.removeEventListener(SPA_SCRUBBER_SYNCED_EVENT, onSpaScrubberSynced);
    };
  }, [applicationId, loadBankAnalysis]);

  const monthSummary = useMemo(() => {
    const summary: Record<string, MonthSummaryBucket> = {};

    banks.forEach((bank) => {
      bank.rows.forEach((row) => {
        const allocatedForRow =
          loanTransferAllocatedByBankAndMonth[
            `${bank.id}|${toYearMonthFromLabel(row.month)}`
          ] || 0;
        if (!hasAnyValue(row) && allocatedForRow <= 0) return;
        if (!summary[row.month]) {
          summary[row.month] = {
            totalCredit: 0,
            loanTransfer: 0,
            deposit: 0,
            other: 0,
            avgDailyBlcSum: 0,
            avgDailyBlcPositiveCount: 0,
            nsfNegDays: 0,
            lowBlcDays: 0,
          };
        }
        const bucket = summary[row.month];

        const totalCredit = parseCurrency(row.totalCredit);
        const loanTransfer = effectiveFundingAmount(
          row.loanTransfer,
          allocatedForRow,
        );
        const deposit = parseCurrency(row.deposit);
        const other = parseCurrency(row.other);
        const avgDailyBlc = parseCurrency(row.avgDailyBlc);
        const nsfNegDays = parseCurrency(row.nsfNegDays);
        const lowBlcDays = parseCurrency(row.lowBlcDays);

        if (totalCredit > 0) bucket.totalCredit += totalCredit;
        if (loanTransfer > 0) bucket.loanTransfer += loanTransfer;
        if (deposit > 0) bucket.deposit += deposit;
        if (other > 0) bucket.other += other;

        if (avgDailyBlc > 0) {
          bucket.avgDailyBlcSum += avgDailyBlc;
          bucket.avgDailyBlcPositiveCount += 1;
        }

        if (nsfNegDays > 0) bucket.nsfNegDays += nsfNegDays;
        if (lowBlcDays > 0) bucket.lowBlcDays += lowBlcDays;
      });
    });

    return summary;
  }, [banks, loanTransferAllocatedByBankAndMonth]);

  /** Scrubbing / EST. Lvg / footer display: all non-MTD months with data. */
  const bankTotalAverages = useMemo(() => {
    return computeBankTotalAveragesForMonths(banks, monthSummary, undefined);
  }, [banks, monthSummary]);

  function computeBankTotalAveragesForMonths(
    bankTables: BankAnalysisInstance[],
    summary: Record<string, MonthSummaryBucket>,
    monthLimit?: number,
  ) {
    const activeMonthSet = new Set<string>();
    bankTables.forEach((table) => {
      (table.rows || []).forEach((row) => {
        const monthLabel = normalizeMonthLabelKey(row.month);
        if (!monthLabel || monthLabel.includes("mtd")) return;
        const hasCoreValue =
          hasEnteredNumericValue(row.totalCredit) ||
          hasEnteredNumericValue(row.loanTransfer) ||
          hasEnteredNumericValue(row.deposit) ||
          hasEnteredNumericValue(row.other) ||
          hasEnteredNumericValue(row.avgDailyBlc);
        if (hasCoreValue) activeMonthSet.add(monthLabel);
      });
    });

    const firstBankMonths = bankTables[0]?.rows.length
      ? sortMonthlyRowsByMonthDesc(bankTables[0].rows).map((r) => r.month)
      : [];
    const filteredMonths = firstBankMonths.filter((m) => {
      const ml = normalizeMonthLabelKey(m);
      if (!ml || ml.includes("mtd")) return false;
      return activeMonthSet.has(ml);
    });
    const activeBankTotalMonths =
      monthLimit != null && monthLimit > 0
        ? filteredMonths.slice(0, monthLimit)
        : filteredMonths;

    const n = activeBankTotalMonths.length;
    const acc = {
      totalCredit: { sum: 0, any: false },
      loanTransfer: { sum: 0, any: false },
      deposit: { sum: 0, any: false },
      other: { sum: 0, any: false },
      netCredit: { sum: 0, any: false },
      avgDailyBlc: { sum: 0, any: false },
      nsfNegDays: { sum: 0, any: false },
      lowBlcDays: { sum: 0, any: false },
    };

    const bankTotalRowHasData = (totals: BankTotalMonth | null) =>
      !!totals &&
      (totals.totalCredit > 0 ||
        totals.loanTransfer > 0 ||
        totals.deposit > 0 ||
        totals.other > 0 ||
        (totals.netCredit ?? 0) > 0 ||
        (totals.avgDailyBlc ?? 0) > 0 ||
        totals.nsfNegDays > 0 ||
        totals.lowBlcDays > 0);

    for (const month of activeBankTotalMonths) {
      const bucket = summary[month];
      const totals = bucket ? computeBankTotalForMonth(bucket) : null;
      const rowHasData = bankTotalRowHasData(totals);

      acc.totalCredit.sum += totals?.totalCredit ?? 0;
      if (rowHasData) acc.totalCredit.any = true;

      acc.loanTransfer.sum += totals?.loanTransfer ?? 0;
      if (rowHasData) acc.loanTransfer.any = true;

      acc.deposit.sum += totals?.deposit ?? 0;
      if (rowHasData) acc.deposit.any = true;

      acc.other.sum += totals?.other ?? 0;
      if (rowHasData) acc.other.any = true;

      const netVal = totals?.netCredit;
      acc.netCredit.sum += netVal ?? 0;
      if (rowHasData && netVal !== null) acc.netCredit.any = true;

      const advVal = totals?.avgDailyBlc;
      acc.avgDailyBlc.sum += advVal ?? 0;
      if (rowHasData && advVal !== null) acc.avgDailyBlc.any = true;

      acc.nsfNegDays.sum += totals?.nsfNegDays ?? 0;
      if (rowHasData) acc.nsfNegDays.any = true;

      acc.lowBlcDays.sum += totals?.lowBlcDays ?? 0;
      if (rowHasData) acc.lowBlcDays.any = true;
    }

    const finish = (x: { sum: number; any: boolean }) =>
      n > 0 && x.any ? x.sum / n : null;

    return {
      totalCredit: finish(acc.totalCredit),
      loanTransfer: finish(acc.loanTransfer),
      deposit: finish(acc.deposit),
      other: finish(acc.other),
      netCredit: finish(acc.netCredit),
      avgDailyBlc: finish(acc.avgDailyBlc),
      nsfNegDays: finish(acc.nsfNegDays),
      lowBlcDays: finish(acc.lowBlcDays),
      divisorMonths: n,
    };
  }

  const hasBankTotalAverageRow = bankTotalAverages.divisorMonths > 0;

  /** Mirrors the preview's bankRowHasData / banksWithDataCount. */
  const banksWithDataCount = useMemo(
    () =>
      banks.reduce((count, bank) => {
        const hasData = (bank.rows ?? []).some(
          (row) =>
            hasEnteredNumericValue(row.totalCredit) ||
            hasEnteredNumericValue(row.loanTransfer) ||
            hasEnteredNumericValue(row.deposit) ||
            hasEnteredNumericValue(row.other) ||
            hasEnteredNumericValue(row.avgDailyBlc),
        );
        return hasData ? count + 1 : count;
      }, 0),
    [banks],
  );

  const bankTotalTablePayload = useMemo((): {
    rows: BankTotalTableRow[];
    average: BankTotalTableAverageCells;
  } => {
    const L = isInitialLoading;
    const H = hasBankTotalAverageRow;

    const rows: BankTotalTableRow[] = baseMonths.map((month) => {
      const summary = monthSummary[month];
      const totals = summary ? computeBankTotalForMonth(summary) : undefined;
      const hasData =
        totals &&
        (totals.totalCredit > 0 ||
          totals.loanTransfer > 0 ||
          totals.deposit > 0 ||
          totals.other > 0 ||
          (totals.netCredit ?? 0) > 0 ||
          (totals.avgDailyBlc ?? 0) > 0 ||
          totals.nsfNegDays > 0 ||
          totals.lowBlcDays > 0);

      return {
        month,
        totalCredit: L ? "Loading..." : hasData && totals ? `$ ${formatNumberUS(totals.totalCredit)}` : "-",
        loanTransfer: L ? "Loading..." : hasData && totals ? `$ ${formatNumberUS(totals.loanTransfer)}` : "-",
        deposit: L ? "Loading..." : hasData && totals ? `$ ${formatNumberUS(totals.deposit)}` : "-",
        other: L ? "Loading..." : hasData && totals ? `$ ${formatNumberUS(totals.other)}` : "-",
        netCredit: L
          ? "Loading..."
          : hasData && totals && totals.netCredit !== null
            ? `$ ${formatNumberUS(totals.netCredit)}`
            : "-",
        avgDailyBal: L
          ? "Loading..."
          : hasData && totals && totals.avgDailyBlc !== null
            ? `$ ${formatNumberUS(totals.avgDailyBlc)}`
            : "-",
        nsfNegDays: L ? "Loading..." : hasData && totals ? formatInt(totals.nsfNegDays) : "-",
        lowBalDays: L ? "Loading..." : hasData && totals ? formatInt(totals.lowBlcDays) : "-",
      };
    });

    const {
      totalCredit: totalCreditAvg,
      loanTransfer: loanTransferAvg,
      deposit: depositAvg,
      other: otherAvg,
      netCredit: netCreditAvgRow,
      avgDailyBlc: avgDailyBlcAvgBase,
      nsfNegDays: nsfAvg,
      lowBlcDays: lowBlcAvg,
    } = bankTotalAverages;

    let avgDailyBlcAvg = avgDailyBlcAvgBase;
    if (
      (avgDailyBlcAvg === null || Number.isNaN(avgDailyBlcAvg)) &&
      netCreditAvgRow !== null &&
      netCreditAvgRow > 0
    ) {
      avgDailyBlcAvg = netCreditAvgRow / 30;
    }

    const average: BankTotalTableAverageCells = {
      totalCredit: L ? "Loading..." : H && totalCreditAvg !== null ? `$ ${formatNumberUS(totalCreditAvg)}` : "-",
      loanTransfer: L ? "Loading..." : H && loanTransferAvg !== null ? `$ ${formatNumberUS(loanTransferAvg)}` : "-",
      deposit: L ? "Loading..." : H && depositAvg !== null ? `$ ${formatNumberUS(depositAvg)}` : "-",
      other: L ? "Loading..." : H && otherAvg !== null ? `$ ${formatNumberUS(otherAvg)}` : "-",
      netCredit: L ? "Loading..." : H && netCreditAvgRow !== null ? `$ ${formatNumberUS(netCreditAvgRow)}` : "-",
      avgDailyBal: L
        ? "Loading..."
        : H &&
            avgDailyBlcAvg !== null &&
            typeof avgDailyBlcAvg === "number" &&
            !Number.isNaN(avgDailyBlcAvg)
          ? `$ ${formatNumberUS(avgDailyBlcAvg)}`
          : "-",
      nsfNegDays: L ? "Loading..." : H && nsfAvg !== null ? formatInt(Math.round(nsfAvg)) : "-",
      lowBalDays: L ? "Loading..." : H && lowBlcAvg !== null ? formatInt(Math.round(lowBlcAvg)) : "-",
    };

    return { rows, average };
  }, [baseMonths, monthSummary, isInitialLoading, bankTotalAverages, hasBankTotalAverageRow]);

  /** Scrubbing / EST. Lvg denominator — all non-MTD months (matches footer). */
  const netCreditAvg = bankTotalAverages.netCredit;

  const lastEmittedNetCreditAvgRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (!onNetCreditAverageChange) return;
    const raw = netCreditAvg ?? null;
    const stabilized =
      raw != null && Number.isFinite(raw) ? Math.round(raw * 100) / 100 : raw;
    if (Object.is(lastEmittedNetCreditAvgRef.current, stabilized)) return;
    lastEmittedNetCreditAvgRef.current = stabilized;
    onNetCreditAverageChange(stabilized);
  }, [onNetCreditAverageChange, netCreditAvg]);

  const lastEmittedBankTotalRowsSigRef = useRef<string>("");

  useEffect(() => {
    if (!onBankTotalRowsChange) return;
    const rows: BankTotalRow[] = baseMonths.map((month) => {
      const summary = monthSummary[month];
      const totals = summary ? computeBankTotalForMonth(summary) : undefined;
      return {
        month,
        netCredit: totals?.netCredit ?? null,
      };
    });
    const sig = JSON.stringify(rows);
    if (sig === lastEmittedBankTotalRowsSigRef.current) return;
    lastEmittedBankTotalRowsSigRef.current = sig;
    onBankTotalRowsChange(rows);
  }, [onBankTotalRowsChange, baseMonths, monthSummary]);

  const handleAddBank = () => {
    setBanks((prev) => {
      const nextId = prev.length + 1;
      return [
        ...prev,
        {
          id: nextId,
          accountNumber: "",
          rows: createDefaultRows(),
          accountHeaderLocked: false,
        },
      ];
    });
  };

  const handleDeleteBank = async (bankId: number) => {
    // Find the bank instance so we know if it exists in the backend
    const bankToDelete = banks.find((b) => b.id === bankId);

    setDeletingBankId(bankId);
    try {
      // If it has a backendId, delete from API first
      if (bankToDelete?.backendId) {
        try {
          await axiosDelete(`/bank-analysis/${bankToDelete.backendId}`);
        } catch (error: any) {
          console.error("Failed to delete bank analysis", error);
          const errMsg =
            error?.response?.data?.message ||
            error?.message ||
            "Failed to delete bank analysis. Please try again.";
          toast.error(errMsg);
          return;
        }
      }

      // Remove from local state
      setBanks((prev) => prev.filter((bank) => bank.id !== bankId));
      toast.success("Bank analysis deleted successfully.");
    } finally {
      setDeletingBankId(null);
    }
  };

  const handleAccountChange = (bankId: number, value: string) => {
    setBanks((prev) =>
      prev.map((bank) =>
        bank.id === bankId ? { ...bank, accountNumber: value } : bank,
      ),
    );
  };

  const handleRowChange = (
    bankId: number,
    rowIndex: number,
    field: keyof MonthlyData,
    value: string,
  ) => {
    setBanks((prev) =>
      prev.map((bank) => {
        if (bank.id !== bankId) return bank;
        const rows = bank.rows.map((row, idx) => {
          if (idx !== rowIndex) return row;
          // Page Edit unlocks saved rows for input; without this the keystroke
          // was dropped on every row that already held data.
          if (row.isLocked && !isPageEditing) return row;
          row = { ...row, isLocked: false };

          if (
            field === "totalCredit" ||
            field === "loanTransfer" ||
            field === "deposit" ||
            field === "other"
          ) {
            const updatedRow: MonthlyData = { ...row, [field]: value };
            const netCredit = calculateNetCredit(updatedRow, bankId);
            const autoAvg = netCredit > 0 ? netCredit / 30 : 0;

            return {
              ...updatedRow,
              avgDailyBlc: autoAvg > 0 ? formatNumberUS(autoAvg) : "",
            };
          }

          return { ...row, [field]: value };
        });
        return { ...bank, rows };
      }),
    );
  };

  const handleUnlockAllBankRows = (bankId: number) => {
    setBanks((prev) =>
      prev.map((bank) =>
        bank.id !== bankId
          ? bank
          : {
              ...bank,
              rows: bank.rows.map((row) => ({ ...row, isLocked: false })),
            },
      ),
    );
  };

  const handleDeleteRow = async (bankId: number, rowIndex: number) => {
    const bank = banks.find((b) => b.id === bankId);
    if (!bank || bank.rows.length <= 1) return;

    setDeletingRow({ bankId, rowIndex });
    try {
      const row = bank.rows[rowIndex];
      const rowBackendId = row?.rowBackendId;
      const hasBackendRow = Boolean(bank.backendId && rowBackendId);

      if (hasBackendRow) {
        try {
          await axiosDelete(
            `/bank-analysis/${bank.backendId}/rows/${rowBackendId}`,
          );
        } catch (error: unknown) {
          const err = error as { response?: { data?: { message?: string } }; message?: string };
          const errMsg =
            err?.response?.data?.message ?? err?.message ?? "Failed to delete row.";
          toast.error(errMsg);
          return;
        }
      }

      setBanks((prev) =>
        prev.map((b) => {
          if (b.id !== bankId) return b;
          const rows = sortMonthlyRowsByMonthDesc(
            b.rows.filter((_, idx) => idx !== rowIndex),
          );
          return { ...b, rows };
        }),
      );
      toast.success("Row deleted successfully.");
    } finally {
      setDeletingRow(null);
    }
  };

  const handleAddMonth = (bankId: number) => {
    setBanks((prev) =>
      prev.map((bank) => {
        if (bank.id !== bankId) return bank;
        const sorted = sortMonthlyRowsByMonthDesc(bank.rows);
        const label = labelForMonthBeforeOldest(sorted);

        const newRow: MonthlyData = {
          month: label,
          totalCredit: "",
          loanTransfer: "",
          deposit: "",
          other: "",
          nsfNegDays: "",
          lowBlcDays: "",
          avgDailyBlc: "",
          isLocked: false,
        };
        return {
          ...bank,
          rows: sortMonthlyRowsByMonthDesc([...bank.rows, newRow]),
        };
      }),
    );
  };

  const selectedBreakdownRow = useMemo(() => {
    if (!fundingBreakdownModal) return null;
    const bank = banks.find((b) => b.id === fundingBreakdownModal.bankId);
    if (!bank) return null;
    const row = bank.rows[fundingBreakdownModal.rowIndex];
    if (!row) return null;
    return { bank, row };
  }, [fundingBreakdownModal, banks]);

  const saveBank = useCallback(async (
    bank: BankAnalysisInstance,
    opts?: { lockAfterSave?: boolean; silent?: boolean },
  ): Promise<"saved" | "failed" | "skipped"> => {
    const lockAfterSave = opts?.lockAfterSave !== false;
    const silent = !!opts?.silent;
    if (!applicationId) {
      console.error("Cannot save bank analysis without applicationId");
      return "failed";
    }

    if (saveBankInFlightRef.current.has(bank.id)) {
      return "skipped";
    }
    saveBankInFlightRef.current.add(bank.id);

    // Only persist rows that have at least one meaningful value
    const nonEmptyRows = bank.rows.filter((row) => hasAnyValue(row));

    const rowsPayload = nonEmptyRows.map((row) => ({
      // include identifiers so backend can update existing rows instead of duplicating
      _id: row.rowBackendId,
      id: row.rowBackendId,
      monthLabel: row.month,
      monthDate: new Date().toISOString(),
      totalCredit: parseCurrency(row.totalCredit),
      loanTransfer: parseCurrency(row.loanTransfer),
      deposit: parseCurrency(row.deposit),
      other: parseCurrency(row.other),
      nsfNegDays: parseCurrency(row.nsfNegDays),
      lowBlcDays: parseCurrency(row.lowBlcDays),
      avgDailyBlc: parseCurrency(row.avgDailyBlc),
    }));

    try {
      let resp;
      if (bank.backendId) {
        resp = await axiosPut(`/bank-analysis/${bank.backendId}`, {
          accountNumber: bank.accountNumber,
          rows: rowsPayload,
        });
      } else {
        resp = await axiosPost("/bank-analysis", {
          application: applicationId,
          accountNumber: bank.accountNumber,
          rows: rowsPayload,
        });
      }

      const payload = resp.data;
      const updated: BankAnalysis = payload?.data ?? payload;
      const updatedRows = updated?.rows ?? [];

      setBanks((prev) =>
        prev.map((b) => {
          if (b.id !== bank.id) return b;
          const rowsWithIds = b.rows.map((r) => {
            const fromApi = updatedRows.find(
              (ur: any) =>
                ur?.monthLabel === r.month ||
                ur?._id === r.rowBackendId ||
                ur?.id === r.rowBackendId,
            ) as { _id?: string; id?: string } | undefined;
            const rowBackendId = fromApi?._id ?? fromApi?.id ?? r.rowBackendId;
            return formatMoneyRowDisplay({
              ...r,
              rowBackendId: rowBackendId ?? r.rowBackendId,
              isLocked: lockAfterSave ? hasAnyValue(r) : r.isLocked,
            });
          });
          return {
            ...b,
            backendId: updated._id,
            accountNumber: updated.accountNumber || b.accountNumber,
            rows: sortMonthlyRowsByMonthDesc(rowsWithIds),
          };
        }),
      );
      return "saved";
    } catch (error) {
      console.error("Failed to save bank analysis", error);
      if (!silent) {
        toast.error("Failed to save bank analysis. Please try again.");
      }
      return "failed";
    } finally {
      saveBankInFlightRef.current.delete(bank.id);
    }
  }, [applicationId]);

  const handleBulkSaveBank = async (bank: BankAnalysisInstance) => {
    setBulkSavingBankId(bank.id);
    try {
      const result = await saveBank(bank, { lockAfterSave: true });
      if (result === "saved") {
        toast.success("Bank analysis saved.");
      }
    } finally {
      setBulkSavingBankId(null);
    }
  };

  const bankNeedsPersist = (bank: BankAnalysisInstance): boolean =>
    Boolean(bank.accountNumber?.trim()) ||
    bank.rows.some((row) => hasAnyValue(row));

  /**
   * Persist every bank card (account number + month rows) in one pass.
   * Registered with the parent for Offer "Approve & Save".
   */
  const saveAll = useCallback(async (): Promise<boolean> => {
    if (!applicationId) return true;
    let allOk = true;
    for (const bank of banks) {
      if (!bankNeedsPersist(bank)) continue;
      const result = await saveBank(bank);
      if (result === "failed") {
        allOk = false;
      } else if (result === "saved") {
        setBanks((prev) =>
          prev.map((b) =>
            b.id === bank.id
              ? {
                  ...b,
                  accountHeaderLocked: Boolean(bank.accountNumber?.trim()),
                }
              : b,
          ),
        );
      }
    }
    return allOk;
  }, [applicationId, banks, saveBank]);

  useEffect(() => {
    onRegisterSaveAll?.(saveAll);
  }, [onRegisterSaveAll, saveAll]);

  useEffect(() => {
    banksAutoSaveBootstrappedRef.current = false;
    lastAutoSavedBanksSigRef.current = "";
  }, [applicationId]);

  usePendingSaveGuard(
    () => pendingAutoSaveRef.current != null || autoSaveInFlightRef.current > 0,
    () => {
      const pending = pendingAutoSaveRef.current;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (pending) void pending();
    },
  );

  /** Debounced auto-save for Scrubbing — persists without re-locking rows. */
  useEffect(() => {
    if (!autoSave || isReadOnly || isInitialLoading || !applicationId) return;

    const sig = buildBanksPersistSignature(banks);
    if (!banksAutoSaveBootstrappedRef.current) {
      banksAutoSaveBootstrappedRef.current = true;
      lastAutoSavedBanksSigRef.current = sig;
      return;
    }
    if (sig === lastAutoSavedBanksSigRef.current) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const run = async () => {
      autoSaveTimerRef.current = null;
      pendingAutoSaveRef.current = null;
      autoSaveInFlightRef.current += 1;
      try {
        let savedAny = false;
        let failedAny = false;
        for (const bank of banks) {
          if (!bankNeedsPersist(bank)) continue;
          const hasUnlockedData = bank.rows.some(
            (row) => !row.isLocked && hasAnyValue(row),
          );
          if (!hasUnlockedData && !deferToolbarSave) continue;

          const result = await saveBank(bank, {
            lockAfterSave: false,
            silent: true,
          });
          if (result === "saved") savedAny = true;
          if (result === "failed") failedAny = true;
        }
        if (savedAny && !failedAny) {
          lastAutoSavedBanksSigRef.current = sig;
        }
        if (failedAny) {
          // Autosave is silent on success only. A failed save (e.g. the deal
          // is not claimed, or the session expired) used to be swallowed, so
          // the scrubber believed the figures were stored when nobody else
          // could ever see them.
          toast.error(
            "Bank Analysis could not be saved. Your changes are not stored yet.",
            { toastId: "bank-analysis-autosave-failed" },
          );
        }
      } finally {
        autoSaveInFlightRef.current -= 1;
      }
    };
    pendingAutoSaveRef.current = run;
    autoSaveTimerRef.current = setTimeout(() => {
      void run();
    }, autoSaveDelayMs);

    return () => {
      // Only the timer is cancelled; the pending run is replaced by the next
      // edit or flushed on unmount by usePendingSaveGuard.
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    banks,
    autoSave,
    autoSaveDelayMs,
    isReadOnly,
    isInitialLoading,
    applicationId,
    saveBank,
    deferToolbarSave,
  ]);

  /** Persist account number only. Backend update skips rows when `rows` is omitted, so row edits stay local until full save. */
  const saveAccountHeaderOnly = async (
    bank: BankAnalysisInstance,
  ): Promise<"saved" | "failed"> => {
    if (!applicationId) {
      console.error("Cannot save bank analysis without applicationId");
      return "failed";
    }
    if (saveBankInFlightRef.current.has(bank.id)) {
      return "failed";
    }
    saveBankInFlightRef.current.add(bank.id);

    try {
      let resp;
      if (bank.backendId) {
        resp = await axiosPut(`/bank-analysis/${bank.backendId}`, {
          accountNumber: bank.accountNumber,
        });
      } else {
        resp = await axiosPost("/bank-analysis", {
          application: applicationId,
          accountNumber: bank.accountNumber,
        });
      }

      const payload = resp.data;
      const updated: BankAnalysis = payload?.data ?? payload;

      setBanks((prev) =>
        prev.map((b) => {
          if (b.id !== bank.id) return b;
          return {
            ...b,
            backendId: updated._id ?? b.backendId,
            accountNumber: updated.accountNumber || b.accountNumber,
          };
        }),
      );
      return "saved";
    } catch (error) {
      console.error("Failed to save account header", error);
      toast.error("Failed to save account number. Please try again.");
      return "failed";
    } finally {
      saveBankInFlightRef.current.delete(bank.id);
    }
  };


  /** Same row shape + allocation map as Scrubbing Preview / WouldMe Credits Trend. */
  const previewCreditsTrend = useMemo(() => {
    const bankTables = banks.map((bank) =>
      bank.rows
        .filter((row) => {
          const m = String(row.month || "").trim().toLowerCase();
          if (!m) return false;
          if (m === "average" || m === "total" || m.includes("average")) return false;
          return true;
        })
        .map((row) => {
          const totalCredits = parseCurrency(row.totalCredit);
          const loan = parseCurrency(row.loanTransfer);
          const deposite = parseCurrency(row.deposit);
          const other = parseCurrency(row.other);
          const transfer = 0;
          return {
            month: row.month || "-",
            totalCredits,
            loan,
            transfer,
            deposite,
            other,
            nsfNegDays: parseCurrency(row.nsfNegDays),
            lowBlcDays: parseCurrency(row.lowBlcDays),
            netCredit: totalCredits - loan - transfer - deposite - other,
          };
        }),
    );

    const loanTransferAllocatedForChart: Record<
      number,
      Record<string, number | number[]>
    > = {};
    banks.forEach((bank, bankIndex) => {
      const perBank: Record<string, number | number[]> = {};
      bank.rows.forEach((row) => {
        const label = String(row.month || "").trim();
        if (!label) return;
        const ym = toYearMonthFromLabel(label);
        const key = `${bank.id}|${ym}`;
        const amounts =
          loanTransferAllocationAmountsByBankAndMonth[key] ||
          (loanTransferAllocatedByBankAndMonth[key]
            ? [loanTransferAllocatedByBankAndMonth[key]]
            : null);
        if (amounts && amounts.length) {
          perBank[label] = amounts.length === 1 ? amounts[0] : amounts;
        }
      });
      if (Object.keys(perBank).length) {
        loanTransferAllocatedForChart[bankIndex] = perBank;
      }
    });

    return { bankTables, loanTransferAllocatedForChart };
  }, [
    banks,
    loanTransferAllocatedByBankAndMonth,
    loanTransferAllocationAmountsByBankAndMonth,
  ]);

  return (
    <div className="w-full space-y-4">
      {showCreditsTrend ? (
        <BankMonthlyBarAndPositionsPie
          bankTables={previewCreditsTrend.bankTables}
          loanTransferAllocatedByBankAndMonth={
            previewCreditsTrend.loanTransferAllocatedForChart
          }
        />
      ) : null}

      {!showOnlyTotals && banks.map((bank, bankIndex) => (
        <div
          key={bank.id}
          data-scrubbing-preview-theme
          className="w-full overflow-hidden scrub-merged-card rounded-[14px] border border-[#e2e2e2] bg-white shadow-sm dark:border-slate-700 dark:bg-[#141517]"
        >
          {/* Header Section — single horizontal toolbar */}
          {/* Three-column grid so the title stays centred in read-only and edit
              alike: an empty left cell balances the controls on the right. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 overflow-x-auto scrub-merged-bar px-4 py-1.5 dark:bg-[#2A2B2F] [scrollbar-width:thin]">
            <span aria-hidden />
            {/* Wd preview: "BANK ANALYSIS[ N] - ACCOUNT ENDING: 1234", centred,
                16px/700. The number only appears when there is more than one bank. */}
            <h2
              className="scrub-merged-title whitespace-nowrap text-center text-[16px] font-bold uppercase text-slate-700 dark:text-slate-100"
            >
              Bank Analysis{banks.length > 1 ? ` ${bankIndex + 1}` : ""}
              {isReadOnly
                ? ` - Account Ending: ${getAccountLast4(bank.accountNumber) ?? "—"}`
                : ""}
            </h2>

            <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2 justify-self-end">
              {!isReadOnly && !pageDrivesEditing && bank.rows.length > 0 && (
                <>
                  {deferToolbarSave ? (
                    bank.rows.some((r) => r.isLocked) ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 border-slate-300 px-3 text-xs font-medium dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        disabled={
                          isInitialLoading ||
                          bulkSavingBankId === bank.id ||
                          deletingBankId === bank.id ||
                          savingHeaderBankId === bank.id
                        }
                        onClick={() => handleUnlockAllBankRows(bank.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit rows
                      </Button>
                    ) : null
                  ) : bank.rows.some((r) => r.isLocked) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 border-slate-300 px-3 text-xs font-medium dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      disabled={
                        isInitialLoading ||
                        bulkSavingBankId === bank.id ||
                        deletingBankId === bank.id ||
                        savingHeaderBankId === bank.id
                      }
                      onClick={() => handleUnlockAllBankRows(bank.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit rows
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[image:var(--brand-gradient)] px-3 text-xs font-medium text-white hover:opacity-90"
                      disabled={
                        isInitialLoading ||
                        bulkSavingBankId === bank.id ||
                        deletingBankId === bank.id ||
                        savingHeaderBankId === bank.id
                      }
                      onClick={() => void handleBulkSaveBank(bank)}
                    >
                      {bulkSavingBankId === bank.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {bulkSavingBankId === bank.id ? "Saving…" : "Save rows"}
                    </Button>
                  )}
                  <span
                    className="mx-1 hidden h-6 w-px shrink-0 bg-slate-300/80 dark:bg-slate-600/80 sm:block"
                    aria-hidden
                  />
                </>
              )}

              {/* Read-only shows the preview's "A/C ending: 1234"; editing keeps
                  the account-number field, which the preview has no place for. */}
              {isReadOnly ? null : (
                <>
              <span className="shrink-0 whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-[#556987] dark:text-slate-300">
                Account Number
              </span>
              <Input
                className={`h-9 w-36 shrink-0 rounded-md border border-[#E2E8F0] text-xs dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400 ${
                  (!deferToolbarSave && bank.accountHeaderLocked) || isReadOnly
                    ? "bg-slate-50 dark:bg-slate-800/70"
                    : "bg-white dark:bg-slate-900"
                }`}
                placeholder={isInitialLoading ? "Loading..." : "Enter account number"}
                readOnly={
                  isReadOnly || (!deferToolbarSave && !!bank.accountHeaderLocked)
                }
                value={bank.accountNumber}
                onChange={(e) =>
                  handleAccountChange(bank.id, e.target.value)
                }
              />
              {!isReadOnly && !deferToolbarSave && bank.accountHeaderLocked ? (
                <>
                  <span
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                    aria-live="polite"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    Saved
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0 cursor-pointer border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    aria-label="Edit account number"
                    onClick={() =>
                      setBanks((prev) =>
                        prev.map((b) =>
                          b.id === bank.id
                            ? { ...b, accountHeaderLocked: false }
                            : b,
                        ),
                      )
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : !isReadOnly && !deferToolbarSave ? (
                <Button
                  type="button"
                  className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[image:var(--brand-gradient)] px-3 text-xs font-medium text-white hover:opacity-90"
                  disabled={isInitialLoading || savingHeaderBankId === bank.id}
                  onClick={async () => {
                    setSavingHeaderBankId(bank.id);
                    try {
                      const result = await saveAccountHeaderOnly(bank);
                      if (result === "saved") {
                        toast.success("Account number saved.");
                        setBanks((prev) =>
                          prev.map((b) =>
                            b.id === bank.id
                              ? { ...b, accountHeaderLocked: true }
                              : b,
                          ),
                        );
                      } else if (result === "failed") {
                        toast.error("Failed to save account number.");
                      }
                    } finally {
                      if (!saveBankInFlightRef.current.has(bank.id)) {
                        setSavingHeaderBankId(null);
                      }
                    }
                  }}
                >
                  {savingHeaderBankId === bank.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {savingHeaderBankId === bank.id ? "Saving…" : "Save"}
                </Button>
              ) : null}
                </>
              )}

              {!isReadOnly && (
                <>
                  <span
                    className="mx-1 hidden h-6 w-px shrink-0 bg-slate-300/80 dark:bg-slate-600/80 sm:block"
                    aria-hidden
                  />
                  {!isCreateDisabled && bankIndex === 0 && (
                    <Button
                      type="button"
                      className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[image:var(--brand-gradient)] px-3 text-xs font-medium text-white hover:opacity-90"
                      disabled={isInitialLoading}
                      onClick={handleAddBank}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Bank
                    </Button>
                  )}
                  {!isDeleteDisabled && (
                    <Button
                      variant="outline"
                      type="button"
                      className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-900/20"
                      disabled={isInitialLoading || deletingBankId === bank.id}
                      onClick={() => handleDeleteBank(bank.id)}
                    >
                      {deletingBankId === bank.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      {deletingBankId === bank.id ? "Deleting…" : "Delete"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Table Section */}
          <div
            className={`overflow-x-auto rounded-b-xl${!isReadOnly && isCreateDisabled ? " pb-3" : ""}`}
          >
            <table className="w-full min-w-[1100px] text-left border-separate border-spacing-0 text-[11px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] scrub-merged-head text-[12px] font-semibold uppercase tracking-wide text-[#475569] dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                  {/* Two column orders, matching the two things this table is.
                      While editing it is mca-tool's data-entry sheet; the rest of
                      the time it mirrors ScrubbingPreviewModal, so what the user
                      reads on screen is what the preview and PDF will show. */}
                  {(() => {
                    const thMonth = <th className="px-4 py-3 min-w-[140px]">Month</th>;
                    const thNetCredit = (
                      <th className="px-4 py-3 text-left min-w-[140px]">
                        Net Credit
                      </th>
                    );
                    const thFunding = (
                      <th className="px-4 py-3 text-left min-w-[140px]">Funding Amt</th>
                    );
                    const thTransfers = (
                      <th className="px-4 py-3 text-left min-w-[140px]">Transfers &amp; other deductions</th>
                    );
                    const thTotalCredit = (
                      <th className="px-4 py-3 text-left min-w-[140px]">Total Credit</th>
                    );
                    const thAvgDaily = (
                      <th className="px-4 py-3 text-left min-w-[140px]">Avg Daily Blc</th>
                    );
                    const thNsf = (
                      <th className="px-4 py-3 text-left min-w-[140px]">
                        NSF/Neg days
                      </th>
                    );
                    const thUnverified = (
                      <th className="px-4 py-3 text-left min-w-[140px]">
                        Unverified Deposit
                      </th>
                    );
                    const thLowBlc = (
                      <th className="px-4 py-3 text-left min-w-[140px]">
                        Low Blc. Days
                      </th>
                    );
                    return isPageEditing ? (
                      <>
                        {thMonth}
                        {thTotalCredit}
                        {thFunding}
                        {thTransfers}
                        {thUnverified}
                        {thNetCredit}
                        {thNsf}
                        {thLowBlc}
                        {thAvgDaily}
                      </>
                    ) : (
                      <>
                        {thMonth}
                        {thNetCredit}
                        {thFunding}
                        {thTransfers}
                        {thTotalCredit}
                        {thAvgDaily}
                        {thNsf}
                      </>
                    );
                  })()}

                  {!isReadOnly && !isDeleteDisabled && (
                    <th className="px-2 py-3 text-center w-[56px] min-w-[56px]">Delete</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(() => {
                  const ordered = baseMonths.map((month) => {
                    const idx = bank.rows.findIndex((r) => r.month === month);
                    if (idx === -1) return null;
                    return { row: bank.rows[idx], rowIndex: idx };
                  }).filter((x): x is { row: MonthlyData; rowIndex: number } => x !== null);

                  // Fallback: if for some reason baseMonths don't cover this bank, use its own order
                  const allRows = ordered.length > 0
                    ? ordered
                    : bank.rows.map((row, idx) => ({ row, rowIndex: idx }));
                  // Read-only view (as mca-tool's preview): skip months with nothing above 0.
                  // An empty MTD row is hidden too; Edit shows it for entry.
                  const rowsToRender = isReadOnly
                    ? allRows.filter(({ row }) =>
                        rowHasPositiveValue(row, displayFundingAmount(row, bank.id)),
                      )
                    : allRows;

                  return rowsToRender.map(({ row, rowIndex }, displayIndex) => {
                    const rowLocked = isReadOnly || (!!row.isLocked && !isPageEditing);
                    const rowBusy =
                      deletingRow?.bankId === bank.id &&
                      deletingRow?.rowIndex === rowIndex;
                    const cellLockedClass = rowLocked
                      ? "bg-slate-50 pointer-events-none cursor-not-allowed select-none dark:bg-slate-800/80 dark:text-slate-400"
                      : "bg-white dark:bg-slate-900 dark:text-slate-100";
                    const currentNetCredit = calculateNetCredit(row, bank.id);
                    const nextEntry = rowsToRender[displayIndex + 1];
                    const previousNetCredit = nextEntry
                      ? calculateNetCredit(nextEntry.row, bank.id)
                      : null;
                    const diff =
                      previousNetCredit != null
                        ? currentNetCredit - previousNetCredit
                        : 0;
                    const trend =
                      displayIndex === rowsToRender.length - 1 || diff === 0
                        ? "none"
                        : diff > 0
                          ? "up"
                          : "down";

                        const cellAvgDaily = (
                          <>
                        <td className="px-2 py-2 min-w-[140px]">
                          {rowLocked ? (
                            <div className="flex h-9 w-full items-center text-[13px] text-slate-700 dark:text-slate-200">
                              {isInitialLoading
                                ? "Loading..."
                                : hasEnteredNumericValue(row.avgDailyBlc)
                                  ? `$ ${row.avgDailyBlc}`
                                  : "-"}
                            </div>
                          ) : (
                            <div className="relative w-full">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                                $
                              </span>
                              <Input
                                className={`h-9 w-full border-slate-200 pl-6 text-left text-[13px] focus-visible:ring-1 focus-visible:ring-sky-400 dark:border-slate-700 dark:placeholder:text-slate-500 ${cellLockedClass}`}
                                readOnly={rowLocked}
                                tabIndex={rowLocked ? -1 : undefined}
                                value={row.avgDailyBlc}
                                placeholder={isInitialLoading ? "Loading..." : ""}
                                onChange={(e) =>
                                  handleRowChange(
                                    bank.id,
                                    rowIndex,
                                    "avgDailyBlc",
                                    formatNumberUSForInput(e.target.value),
                                  )
                                }
                              />
                            </div>
                          )}
                        </td>
                          </>
                        );
                        const cellFunding = (
                          <>
                        <td className="px-2 py-2 min-w-[140px]">
                          {(() => {
                            const ymKey = `${bank.id}|${toYearMonthFromLabel(row.month)}`;
                            const allocated =
                              loanTransferAllocatedByBankAndMonth[ymKey] || 0;
                            const allocationAmounts =
                              loanTransferAllocationAmountsByBankAndMonth[ymKey] ||
                              (allocated > 0 ? [allocated] : []);
                            const baseLoan = parseCurrency(row.loanTransfer);
                            const displayLoan = displayFundingAmount(row, bank.id);
                            const lockedDisplayValue =
                              baseLoan > 0
                                ? hasEnteredNumericValue(row.loanTransfer)
                                  ? row.loanTransfer
                                  : formatNumberUS(displayLoan)
                                : allocated > 0
                                  ? formatNumberUS(displayLoan)
                                  : "";

                            if (rowLocked) {
                              const clickableForBreakdown = allocated > 0;
                              return (
                                <div
                                  className={`flex h-9 w-full items-center text-[13px] text-slate-700 dark:text-slate-200 ${
                                    clickableForBreakdown
                                      ? "cursor-pointer font-medium hover:underline"
                                      : ""
                                  }`}
                                  onClick={() => {
                                    if (!clickableForBreakdown) return;
                                    setFundingBreakdownModal({
                                      bankId: bank.id,
                                      rowIndex,
                                      month: row.month,
                                      allocated,
                                    });
                                  }}
                                >
                                  {isInitialLoading
                                    ? "Loading..."
                                    : lockedDisplayValue
                                      ? `$ ${lockedDisplayValue}`
                                      : "-"}
                                </div>
                              );
                            }

                            return (
                              <TaggedCurrencyCell
                                value={row.loanTransfer}
                                placeholder={
                                  isInitialLoading ? "Loading..." : "Loan/Transfer"
                                }
                                allocationAmounts={
                                  hasEnteredNumericValue(row.loanTransfer)
                                    ? []
                                    : allocationAmounts
                                }
                                allocationsEditable
                                valueIsManualOnly
                                onOpenBreakdown={
                                  allocated > 0
                                    ? () =>
                                        setFundingBreakdownModal({
                                          bankId: bank.id,
                                          rowIndex,
                                          month: row.month,
                                          allocated,
                                        })
                                    : undefined
                                }
                                onCommit={(next) =>
                                  handleRowChange(
                                    bank.id,
                                    rowIndex,
                                    "loanTransfer",
                                    next,
                                  )
                                }
                              />
                            );
                          })()}
                        </td>
                          </>
                        );
                        const cellLowBlc = (
                          <>
                        <td className="px-2 py-2 min-w-[140px] scrub-alert-cell bg-[rgba(146,39,39,0.08)] dark:bg-rose-950/30">
                          {rowLocked ? (
                            <div className="flex h-9 w-full items-center text-[13px] text-slate-700 dark:text-slate-200">
                              {isInitialLoading
                                ? "Loading..."
                                : hasEnteredNumericValue(row.lowBlcDays)
                                  ? formatInt(parseCurrency(row.lowBlcDays))
                                  : "-"}
                            </div>
                          ) : (
                            <Input
                              className={`h-9 w-full border-slate-200 text-left text-[13px] focus-visible:ring-1 focus-visible:ring-sky-400 dark:border-slate-700 dark:placeholder:text-slate-500 ${cellLockedClass}`}
                              placeholder={isInitialLoading ? "Loading..." : "e.g. 0"}
                              readOnly={rowLocked}
                              tabIndex={rowLocked ? -1 : undefined}
                              value={row.lowBlcDays}
                              onChange={(e) =>
                                handleRowChange(
                                  bank.id,
                                  rowIndex,
                                  "lowBlcDays",
                                  formatNumberUSForInput(e.target.value),
                                )
                              }
                            />
                          )}
                        </td>
                          </>
                        );
                        const cellMonth = (
                          <>
                        <td className="min-w-[140px] whitespace-nowrap px-4 py-2 text-[12px] font-medium text-slate-700 dark:text-slate-200">
                          {row.month}
                        </td>
                          </>
                        );
                        const cellNetCredit = (
                          <>
                        {/* Net Credit (calculated) with trend arrow */}
                        <td className="px-2 py-2 text-left min-w-[140px] scrub-net-cell bg-[#ebf3ff] dark:bg-sky-950/40">
                          <div className="flex items-center justify-start gap-1 w-full">
                            <div
                              className={
                                rowLocked
                                  ? "flex h-9 w-full items-center justify-start text-[13px] text-slate-700 select-none dark:text-slate-200"
                                  : "flex h-9 w-full items-center justify-start rounded-md border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
                              }
                            >
                              {isInitialLoading ? "Loading..." : `$ ${formatNumberUS(currentNetCredit)}`}
                            </div>
                            {trend !== "none" && (
                              <span className="inline-flex items-center justify-center">
                                {/* Same icons, size and colours as the preview. */}
                                {trend === "up" ? (
                                  <ArrowUp className="inline h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <ArrowDown className="inline h-3.5 w-3.5 text-red-500" />
                                )}
                              </span>
                            )}
                          </div>
                        </td>
                          </>
                        );
                        const cellNsf = (
                          <>
                        <td className="px-2 py-2 min-w-[140px] scrub-alert-cell bg-[rgba(146,39,39,0.08)] dark:bg-rose-950/30">
                          {rowLocked ? (
                            <div className="flex h-9 w-full items-center text-[13px] text-slate-700 dark:text-slate-200">
                              {isInitialLoading
                                ? "Loading..."
                                : hasEnteredNumericValue(row.nsfNegDays)
                                  ? formatInt(parseCurrency(row.nsfNegDays))
                                  : "-"}
                            </div>
                          ) : (
                            <Input
                              className={`h-9 w-full border-slate-200 text-left text-[13px] focus-visible:ring-1 focus-visible:ring-sky-400 dark:border-slate-700 dark:placeholder:text-slate-500 ${cellLockedClass}`}
                              placeholder={isInitialLoading ? "Loading..." : "e.g. 0"}
                              readOnly={rowLocked}
                              tabIndex={rowLocked ? -1 : undefined}
                              value={row.nsfNegDays}
                              onChange={(e) =>
                                handleRowChange(
                                  bank.id,
                                  rowIndex,
                                  "nsfNegDays",
                                  formatNumberUSForInput(e.target.value),
                                )
                              }
                            />
                          )}
                        </td>
                          </>
                        );
                        const cellTotalCredit = (
                          <>
                        {/* Input fields with icons like the image */}
                        <td className="px-2 py-2 min-w-[140px]">
                          {rowLocked ? (
                            <div className="flex h-9 w-full items-center text-[13px] text-slate-700 dark:text-slate-200">
                              {isInitialLoading
                                ? "Loading..."
                                : hasEnteredNumericValue(row.totalCredit)
                                  ? `$ ${row.totalCredit}`
                                  : "-"}
                            </div>
                          ) : (
                            <TaggedCurrencyCell
                              className={cellLockedClass}
                              value={row.totalCredit}
                              placeholder={isInitialLoading ? "Loading..." : "Credits"}
                              onCommit={(next) =>
                                handleRowChange(bank.id, rowIndex, "totalCredit", next)
                              }
                            />
                          )}
                        </td>
                          </>
                        );
                        const cellTransfers = (
                          <>
                        <td className="px-2 py-2 min-w-[140px]">
                          {rowLocked ? (
                            <div className="flex h-9 w-full items-center text-[13px] text-slate-700 dark:text-slate-200">
                              {isInitialLoading
                                ? "Loading..."
                                : hasEnteredNumericValue(row.deposit)
                                  ? `$ ${row.deposit}`
                                  : "-"}
                            </div>
                          ) : (
                            <TaggedCurrencyCell
                              className={cellLockedClass}
                              value={row.deposit}
                              placeholder={isInitialLoading ? "Loading..." : "Deposit"}
                              onCommit={(next) =>
                                handleRowChange(bank.id, rowIndex, "deposit", next)
                              }
                            />
                          )}
                        </td>
                          </>
                        );
                        const cellUnverified = (
                          <>
                        <td className="px-2 py-2 min-w-[140px]">
                          {rowLocked ? (
                            <div className="flex h-9 w-full items-center text-[13px] text-slate-700 dark:text-slate-200">
                              {isInitialLoading
                                ? "Loading..."
                                : hasEnteredNumericValue(row.other)
                                  ? `$ ${row.other}`
                                  : "-"}
                            </div>
                          ) : (
                            <TaggedCurrencyCell
                              className={cellLockedClass}
                              value={row.other}
                              placeholder={
                                isInitialLoading ? "Loading..." : "Other amount"
                              }
                              onCommit={(next) =>
                                handleRowChange(bank.id, rowIndex, "other", next)
                              }
                            />
                          )}
                        </td>
                          </>
                        );
                    return (
                      <tr
                        key={row.month + rowIndex}
                        className={`${displayIndex % 2 === 0 ? "bg-white dark:bg-[#141517]" : "bg-slate-50/40 dark:bg-slate-900/35"} ${rowLocked ? "" : "hover:bg-sky-50/50 dark:hover:bg-slate-800/70"} transition-colors`}
                      >
                        {isPageEditing ? (
                          <>
                            {cellMonth}
                            {cellTotalCredit}
                            {cellFunding}
                            {cellTransfers}
                            {cellUnverified}
                            {cellNetCredit}
                            {cellNsf}
                            {cellLowBlc}
                            {cellAvgDaily}
                          </>
                        ) : (
                          <>
                            {cellMonth}
                            {cellNetCredit}
                            {cellFunding}
                            {cellTransfers}
                            {cellTotalCredit}
                            {cellAvgDaily}
                            {cellNsf}
                          </>
                        )}
                        {!isReadOnly && !isDeleteDisabled && (
                          <td className="w-[56px] min-w-[56px] px-2 py-2 text-center align-middle whitespace-nowrap">
                            <button
                              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-900/20"
                              type="button"
                              title="Delete row"
                              disabled={rowBusy || bulkSavingBankId === bank.id}
                              onClick={() => handleDeleteRow(bank.id, rowIndex)}
                            >
                              {deletingRow?.bankId === bank.id &&
                              deletingRow?.rowIndex === rowIndex ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 size={18} />
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  });
                })()}
              </tbody>
              {/* Footer Totals */}
              <tfoot className="bg-[#F8FAFC] dark:bg-slate-900/60">
                {(() => {
                  const isActiveNonMtdRow = (row: MonthlyData) => {
                    const monthLabel = normalizeMonthLabelKey(row.month);
                    if (!monthLabel || monthLabel.includes("mtd")) return false;
                    const allocated =
                      loanTransferAllocatedByBankAndMonth[
                        `${bank.id}|${toYearMonthFromLabel(row.month)}`
                      ] || 0;
                    const hasLoanFromPositions = allocated > 0;
                    return (
                      hasLoanFromPositions ||
                      hasEnteredNumericValue(row.totalCredit) ||
                      hasEnteredNumericValue(row.loanTransfer) ||
                      hasEnteredNumericValue(row.deposit) ||
                      hasEnteredNumericValue(row.other) ||
                      hasEnteredNumericValue(row.avgDailyBlc)
                    );
                  };
                  const R = sortMonthlyRowsByMonthDesc(
                    bank.rows.filter(isActiveNonMtdRow),
                  );
                  const n = R.length;

                  const acc = {
                    totalCredit: { sum: 0, any: false },
                    loanTransfer: { sum: 0, any: false },
                    deposit: { sum: 0, any: false },
                    other: { sum: 0, any: false },
                    netCredit: { sum: 0, any: false },
                    nsfNegDays: { sum: 0, any: false },
                    lowBlcDays: { sum: 0, any: false },
                    avgDailyBlc: { sum: 0, any: false },
                  };

                  for (const row of R) {
                    const allocated =
                      loanTransferAllocatedByBankAndMonth[
                        `${bank.id}|${toYearMonthFromLabel(row.month)}`
                      ] || 0;
                    const displayLoan = displayFundingAmount(row, bank.id);
                    const ncRow = calculateNetCredit(row, bank.id);

                    if (hasEnteredNumericValue(row.totalCredit)) acc.totalCredit.any = true;
                    acc.totalCredit.sum += parseCurrency(row.totalCredit);

                    if (hasEnteredNumericValue(row.loanTransfer) || allocated > 0) {
                      acc.loanTransfer.any = true;
                    }
                    acc.loanTransfer.sum += displayLoan;

                    if (hasEnteredNumericValue(row.deposit)) acc.deposit.any = true;
                    acc.deposit.sum += parseCurrency(row.deposit);

                    if (hasEnteredNumericValue(row.other)) acc.other.any = true;
                    acc.other.sum += parseCurrency(row.other);

                    const netHas =
                      hasEnteredNumericValue(row.totalCredit) ||
                      hasEnteredNumericValue(row.loanTransfer) ||
                      allocated > 0 ||
                      hasEnteredNumericValue(row.deposit) ||
                      hasEnteredNumericValue(row.other);
                    if (netHas) acc.netCredit.any = true;
                    acc.netCredit.sum += ncRow;

                    if (hasEnteredNumericValue(row.nsfNegDays)) acc.nsfNegDays.any = true;
                    acc.nsfNegDays.sum += parseCurrency(row.nsfNegDays);

                    if (hasEnteredNumericValue(row.lowBlcDays)) acc.lowBlcDays.any = true;
                    acc.lowBlcDays.sum += parseCurrency(row.lowBlcDays);

                    let adv = parseCurrency(row.avgDailyBlc);
                    if (!hasEnteredNumericValue(row.avgDailyBlc)) {
                      adv = ncRow > 0 ? ncRow / 30 : 0;
                    }
                    if (hasEnteredNumericValue(row.avgDailyBlc) || ncRow > 0) {
                      acc.avgDailyBlc.any = true;
                    }
                    acc.avgDailyBlc.sum += adv;
                  }

                  const finish = (x: { sum: number; any: boolean }) =>
                    n > 0 && x.any ? x.sum / n : null;

                  const totalCreditAvg = finish(acc.totalCredit);
                  const loanAvg = finish(acc.loanTransfer);
                  const depositAvg = finish(acc.deposit);
                  const otherAvg = finish(acc.other);
                  const netAvg = finish(acc.netCredit);
                  const nsfAvg = finish(acc.nsfNegDays);
                  const lowAvg = finish(acc.lowBlcDays);
                  let avgDailyAvg = finish(acc.avgDailyBlc);
                  if (
                    (avgDailyAvg === null || Number.isNaN(avgDailyAvg)) &&
                    netAvg !== null &&
                    netAvg > 0
                  ) {
                    avgDailyAvg = netAvg / 30;
                  }

                  const hasData = n > 0;

                  return (
                    <tr className="scrub-summary-row bg-slate-200 text-sm font-semibold text-slate-900 dark:bg-slate-800/80 dark:text-slate-100">
                      <BankAnalysisAverageFooterLabelCell monthCount={n} />
                      {(() => {
                        const money = (v: number | null) =>
                          isInitialLoading
                            ? "Loading..."
                            : hasData && v !== null
                              ? `$ ${formatNumberUS(v)}`
                              : "-";
                        const count = (v: number | null) =>
                          isInitialLoading
                            ? "Loading..."
                            : hasData && v !== null
                              ? formatInt(Math.round(v))
                              : "-";
                        const tdNetCredit = (
                          <td className="px-4 py-3 text-left scrub-net-cell bg-[#e6f0ff] dark:bg-sky-950/40">
                            {money(netAvg)}
                          </td>
                        );
                        const tdFunding = (
                          <td className="px-4 py-3 text-left">{money(loanAvg)}</td>
                        );
                        // `deposit` is Transfers, `other` is Unverified Deposit.
                        const tdTransfers = (
                          <td className="px-4 py-3 text-left">{money(depositAvg)}</td>
                        );
                        const tdUnverified = (
                          <td className="px-4 py-3 text-left">{money(otherAvg)}</td>
                        );
                        const tdTotalCredit = (
                          <td className="px-4 py-3 text-left">{money(totalCreditAvg)}</td>
                        );
                        const tdAvgDaily = (
                          <td className="px-4 py-3 text-left">{money(avgDailyAvg)}</td>
                        );
                        const tdNsf = (
                          <td className="px-4 py-3 text-left scrub-alert-cell bg-[rgba(146,39,39,0.08)] dark:bg-rose-950/30">
                            {count(nsfAvg)}
                          </td>
                        );
                        const tdLowBlc = (
                          <td className="px-4 py-3 text-left scrub-alert-cell bg-[rgba(146,39,39,0.08)] dark:bg-rose-950/30">
                            {count(lowAvg)}
                          </td>
                        );
                        return isPageEditing ? (
                          <>
                            {tdTotalCredit}
                            {tdFunding}
                            {tdTransfers}
                            {tdUnverified}
                            {tdNetCredit}
                            {tdNsf}
                            {tdLowBlc}
                            {tdAvgDaily}
                          </>
                        ) : (
                          <>
                            {tdNetCredit}
                            {tdFunding}
                            {tdTransfers}
                            {tdTotalCredit}
                            {tdAvgDaily}
                            {tdNsf}
                          </>
                        );
                      })()}

                      {!isReadOnly && !isDeleteDisabled && <td></td>}
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
          {!isReadOnly && !isCreateDisabled && (
          <div className="flex justify-end border-t border-slate-200 bg-[#F9FAFB] px-4 py-2 dark:border-slate-700 dark:bg-slate-900/70">
            <Button
              type="button"
              variant="outline"
              className="h-8 px-3 text-[11px] flex items-center gap-1 cursor-pointer"
              onClick={() => handleAddMonth(bank.id)}
            >
              <Plus className="h-3 w-3" />
              Add Month
            </Button>
          </div>
          )}
        </div>
      ))}

      {/* Preview only renders Bank Total once TWO OR MORE banks have data -
          with a single account it would just restate Bank Analysis 1.
          (WouldMePreviewModal: `if (banksWithDataCount < 2) return null`). */}
      {banksWithDataCount >= 2 && (
        <BankTotalTable
          rows={bankTotalTablePayload.rows}
          average={bankTotalTablePayload.average}
          averageMonthCount={bankTotalAverages.divisorMonths}
        />
      )}
      {fundingBreakdownModal && selectedBreakdownRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => {
            setFundingBreakdownModal(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-[#141517]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span>Funding Breakdown</span>
              <span>{fundingBreakdownModal.month}</span>
            </div>
            <div className="flex items-center justify-between py-1 text-sm text-slate-700 dark:text-slate-200">
              <span>Manual Loan</span>
              <span className="font-medium">
                $ {formatNumberUS(parseCurrency(selectedBreakdownRow.row.loanTransfer))}
              </span>
            </div>
            <div className="mt-2">
              <Input
                className="h-9 border-slate-200 bg-white text-left text-sm focus-visible:ring-1 focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                value={selectedBreakdownRow.row.loanTransfer}
                placeholder="Edit manual loan"
                onChange={(e) =>
                  handleRowChange(
                    fundingBreakdownModal.bankId,
                    fundingBreakdownModal.rowIndex,
                    "loanTransfer",
                    formatNumberUSForInput(e.target.value),
                  )
                }
              />
            </div>
            <div className="mt-2 flex items-center justify-between py-1 text-sm text-emerald-700 dark:text-emerald-400">
              <span>From Positions</span>
              <span className="font-medium">$ {formatNumberUS(fundingBreakdownModal.allocated)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
              <span>Total</span>
              <span>
                $ {formatNumberUS(
                  effectiveFundingAmount(
                    selectedBreakdownRow.row.loanTransfer,
                    fundingBreakdownModal.allocated,
                  ),
                )}
              </span>
            </div>
            <div className="mt-4 flex  justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-8 px-3  cursor-pointer text-xs"
                onClick={() => {
                  setFundingBreakdownModal(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankAnalysisTable;