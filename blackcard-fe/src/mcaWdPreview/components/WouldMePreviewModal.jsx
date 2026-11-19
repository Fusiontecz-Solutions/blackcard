import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import NetCreditWithTrend from "./NetCreditWithTrend";
import { formatNumberUS, formatDateUS } from "../utils/dateUtils";
import { parseMonthLabelToYYYYMM } from "../utils/calculateMonthlyNetCredit";
import {
  computePositionMetrics,
  getExistingActivePositionsCount,
  recentMonthLeverageRatio,
  sumPositionRepaymentForTotal,
} from "../utils/positionMetrics";
import { downloadElementAsPdf } from "../utils/downloadElementAsPdf";
import { bakeEmailAppearance } from "../utils/emailAppearance";
import {
  usePreviewTableSort,
  applyPreviewSort,
  monthLabelSortValue,
  dateSortValue,
  sortableThProps,
  SortIndicator,
  stripSortIndicators,
} from "./previewTableSort";
import BankMonthlyBarAndPositionsPie, {
  applyCopiedChartTableLayout,
  captureTotalNetCreditBarChartForCopy,
  replaceCopiedBarChartWithFixedPng,
  replaceCopiedChartWrappers,
} from "./BankMonthlyBarAndPositionsPie";
import { captureChartsAsImages } from "../utils/preparePreviewForCapture";
import { AdditionalInfoPreview } from "./AdditionalInfoSection";
import NoteCommentDisplay from "./NoteCommentDisplay";
import { greenBarStyle, blueBarStyle, MERGED_CARD_STYLE, MERGED_TITLE_STYLE, MERGED_THEAD_STYLE } from "./sectionBarStyles";
import DeclinedOfferPreviewCard from "./DeclinedOfferPreviewCard";
import {
  clearInlinePastedNoteImageForcedSize,
  isInlinePastedNoteImage,
} from "../utils/noteCommentHtml";
import "../mcaWdPreview.css";
import {
  copyPreviewHtmlToClipboard,
  isFaviconWatermarkNode,
  measurePreviewDesktopMinWidthPx,
  measurePreviewDesktopWidthPx,
  preserveCopiedPreviewBorders,
  preserveCopiedPreviewCardGeometry,
  removeFaviconWatermarkFromClone,
  removePreviewBrandLogoFromClone,
  revealWatermarkThroughOrdinaryCells,
  wrapCopiedPreviewHtml,
} from "./PreviewFaviconWatermark";
import {
  formatLegalCheckLabel,
  isDisplayableLegalCheck,
  sanitizeAccountNumber,
  isEmptyNoteText,
  sanitizeNoteText,
  sanitizeNoteTextList,
} from "../utils/sensitiveFields";

/** Above app sidebar (z-10) and details sheets (z-9999) so Preview never paints under chrome. */
const WD_PREVIEW_MODAL_Z_INDEX = 200000;

function getWdPreviewPortalRoot() {
  if (typeof document === "undefined") return null;
  const id = "mca-wd-preview-portal-root";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.setAttribute("data-mca-wd-preview-portal", "true");
    document.body.appendChild(el);
  }
  return el;
}

const FIELD_LABELS = ["Month", "Total Credit", "Funding Amt", "Transfers & other deductions", "Unverified Deposit", "Other", "Net Credit", "NSF/Neg days", "Low Blc. Days", "Avg Daily Blc"];
const FIELD_KEYS = ["month", "totalCredits", "loan", "transfer", "deposite", "other", "netCredit", "nsfNegDays", "lowNegDays", "averageDailyBalance"];
const CURRENCY_KEYS = ["totalCredits", "loan", "transfer", "deposite", "other", "netCredit", "averageDailyBalance", "dailyRepay"];

function parseNum(str) {
  if (str == null || String(str).trim() === "") return NaN;
  return Number(String(str).replace(/[^0-9.-]+/g, ""));
}

function hasEnteredNumericValue(raw) {
  if (raw == null) return false;
  const s = String(raw).trim();
  if (!s) return false;
  // Ignore placeholder-like strings such as "e.g 0".
  if (/^e\.?\s*g\.?/i.test(s)) return false;
  return !Number.isNaN(parseNum(s));
}

function getLast4Digits(value) {
  const raw = sanitizeAccountNumber(value);
  if (!raw) return null;
  const digitsOnly = raw.replace(/\D/g, "");
  const source = digitsOnly || raw;
  const last4 = source.slice(-4);
  return last4.length ? last4 : null;
}

function getRiskMeta(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high") return { label: "High", color: "#ef4444" };
  if (normalized === "medium") return { label: "Medium", color: "#f59e0b" };
  if (normalized === "low") return { label: "Low", color: "#22c55e" };
  return null;
}

function cellValue(row, key) {
  const v = row[key];
  if (v == null || String(v).trim() === "") return "-";
  if (CURRENCY_KEYS.includes(key)) return `$ ${formatNumberUS(v)}`;
  return String(v);
}

// Net credit: show "-" when no data (no total credit); show "$0" when calculated value is 0
function netCreditCellValue(row) {
  const totalCredits = parseNum(row.totalCredits);
  const hasTotalCredit = !Number.isNaN(totalCredits) && totalCredits > 0;
  if (!hasTotalCredit) return "-";
  const net = parseNum(row.netCredit);
  if (Number.isNaN(net)) return "-";
  return `$ ${formatNumberUS(net)}`;
}

/**
 * Net credit shown in preview body = total − (display loan + transfer + deposite + other).
 * Footer average must use the same formula (not raw `row.netCredit`).
 */
function averageDisplayNetCreditForPreviewRows(activeRows, bankIndex, getDisplayLoan, getDisplayTransfer) {
  if (!activeRows.length || typeof getDisplayLoan !== "function" || typeof getDisplayTransfer !== "function") {
    return NaN;
  }
  let total = 0;
  let hasAnyNumericValue = false;
  for (const row of activeRows) {
    const tc = parseNum(row?.totalCredits);
    const totalForNet = Number.isNaN(tc) ? 0 : tc;
    const effLoan = getDisplayLoan(bankIndex, row);
    const effTransfer = getDisplayTransfer(row);
    const deposite = parseNum(row?.deposite);
    const other = parseNum(row?.other);
    const deductions =
      (Number.isNaN(effLoan) ? 0 : effLoan) +
      (Number.isNaN(effTransfer) ? 0 : effTransfer) +
      (Number.isNaN(deposite) ? 0 : deposite) +
      (Number.isNaN(other) ? 0 : other);
    const net = totalForNet - deductions;
    if (!Number.isNaN(net)) hasAnyNumericValue = true;
    total += Number.isNaN(net) ? 0 : net;
  }
  if (!hasAnyNumericValue) return NaN;
  return total / activeRows.length;
}

function bankTableAverages(rows, bankIndex, getDisplayLoan, getDisplayTransfer) {
  const activeRows = (rows || []).filter((row) => {
    const monthLabel = row?.month != null ? String(row.month).trim().toLowerCase() : "";
    if (!monthLabel || monthLabel.includes("mtd")) return false;
    return (
      hasEnteredNumericValue(row?.totalCredits) ||
      hasEnteredNumericValue(row?.loan) ||
      hasEnteredNumericValue(row?.transfer) ||
      hasEnteredNumericValue(row?.deposite) ||
      hasEnteredNumericValue(row?.other) ||
      hasEnteredNumericValue(row?.netCredit) ||
      hasEnteredNumericValue(row?.averageDailyBalance)
    );
  });

  const averageOf = (field, includeZero = false) => {
    if (activeRows.length === 0) return NaN;
    let total = 0;
    let hasAnyNumericValue = false;
    for (const row of activeRows) {
      const v = parseNum(row[field]);
      if (!Number.isNaN(v)) hasAnyNumericValue = true;
      if (includeZero || !Number.isNaN(v)) total += Number.isNaN(v) ? 0 : v;
    }
    if (!hasAnyNumericValue) return NaN;
    return total / activeRows.length;
  };
  const avgNet =
    typeof bankIndex === "number" && typeof getDisplayLoan === "function" && typeof getDisplayTransfer === "function"
      ? averageDisplayNetCreditForPreviewRows(activeRows, bankIndex, getDisplayLoan, getDisplayTransfer)
      : averageOf("netCredit", false);
  // Match the main Bank Analysis table: average daily balance uses the
  // same averaging rule (ignore empty/zero values).
  const averageDailyBalance = averageOf("averageDailyBalance");
  return {
    totalCredits: averageOf("totalCredits"),
    loan: averageOf("loan"),
    transfer: averageOf("transfer"),
    deposite: averageOf("deposite"),
    other: averageOf("other"),
    netCredit: avgNet,
    averageDailyBalance,
    nsfNegDays: averageOf("nsfNegDays"),
    lowNegDays: averageOf("lowNegDays"),
    dailyRepay: averageOf("dailyRepay", true),
  };
}

function bankRowHasData(row) {
  if (!row || typeof row !== "object") return false;
  return (
    hasEnteredNumericValue(row.totalCredits) ||
    hasEnteredNumericValue(row.loan) ||
    hasEnteredNumericValue(row.transfer) ||
    hasEnteredNumericValue(row.deposite) ||
    hasEnteredNumericValue(row.other) ||
    hasEnteredNumericValue(row.netCredit) ||
    hasEnteredNumericValue(row.averageDailyBalance)
  );
}

function bankTotalRowHasData(row) {
  if (!row || typeof row !== "object") return false;
  return (
    hasEnteredNumericValue(row.totalCredits) ||
    hasEnteredNumericValue(row.loan) ||
    hasEnteredNumericValue(row.transfer) ||
    hasEnteredNumericValue(row.deposite) ||
    hasEnteredNumericValue(row.other) ||
    hasEnteredNumericValue(row.netCredit) ||
    hasEnteredNumericValue(row.averageDailyBalance)
  );
}

function isMtdMonthLabel(value) {
  const monthLabel = value != null ? String(value).trim().toLowerCase() : "";
  return monthLabel.includes("mtd");
}

function moveMtdRowsToEnd(rows = []) {
  const nonMtd = [];
  const mtd = [];
  for (const row of rows) {
    if (isMtdMonthLabel(row?.month)) mtd.push(row);
    else nonMtd.push(row);
  }
  return [...nonMtd, ...mtd];
}

/** AR preview: oldest calendar month first; MTD rows stay last. */
function sortArBankAnalysisRowsOldestFirstMtdLast(rows = []) {
  const moved = moveMtdRowsToEnd(rows);
  let split = moved.length;
  while (split > 0 && isMtdMonthLabel(moved[split - 1]?.month)) split -= 1;
  const nonMtd = moved.slice(0, split);
  const mtd = moved.slice(split);
  const refDate = new Date();
  nonMtd.sort((a, b) => {
    const ka = parseMonthLabelToYYYYMM(String(a?.month ?? ""), refDate);
    const kb = parseMonthLabelToYYYYMM(String(b?.month ?? ""), refDate);
    if (!ka && !kb) return 0;
    if (!ka) return 1;
    if (!kb) return -1;
    return ka.localeCompare(kb);
  });
  return [...nonMtd, ...mtd];
}

// Show a position row only when Amount Funded has been entered (valid number > 0).
function positionRowHasData(row) {
  const amountFunded = parseNum(row.amountFunded);
  return !Number.isNaN(amountFunded) && amountFunded > 0;
}

// For preview tables, we want to show any row that has
// *some* real data (non-default status, lender, dates, payments, etc.),
// but skip completely empty placeholder rows where everything is default.
function positionHasAnyPreviewData(row) {
  if (!row || typeof row !== "object") return false;

  const lender = String(row.lender || "").trim();
  const statusUpper = String(row.status || "").toUpperCase().trim();
  const frequency = String(row.frequency || "").trim();
  const startingDate = String(row.startingDate || "").trim();

  // Any lender or explicit date counts as data
  if (lender) return true;
  if (startingDate) return true;

  // Any concrete status (not blank/"SELECT") counts as data
  if (statusUpper && statusUpper !== "SELECT") return true;

  // Non-default frequency (anything other than blank/"Weekly") counts as data
  if (frequency && frequency !== "Weekly") return true;

  // Any numeric field with a value counts as data
  const numericFields = [
    "amountFunded",
    "installment",
    "paymentTerm",
    "totalRepayments",
    "monthlyMcaPmts",
    "mcaEstBalance",
    "mcaPercentPaid",
    "pmtsLeft",
    "mcaRemit",
  ];

  for (const key of numericFields) {
    const v = row[key];
    if (v != null && String(v).trim() !== "" && !Number.isNaN(parseNum(v))) {
      return true;
    }
  }
  return false;
}

function approvedOfferHasData(approved = {}) {
  const keys = ["position", "offer", "rate", "term", "fees", "notes", "frequency", "daysWeeks", "monthlyPayment"];
  return keys.some((k) => approved[k] != null && String(approved[k]).trim() !== "");
}

export default function WouldMePreviewModal({
  isOpen,
  onClose,
  bankAnalysisId = null,
  createdBy = null,
  updatedBy = null,
  offerDecision = null,
  declinedReason = "",
  form = {},
  approvedOffer = {},
  riskCategory = "",
  notesFromApi = "",
  currentNote = null,
  bankTables = [],
  bankAccountNumbers = [],
  bankTotalRows = [],
  bankTotalAverages = {},
  positions = [],
  eligibility = {},
  mcaOffer = {},
  finalOffers = [],
  getMcaDeductionForMonth = null,
  // Optional: map of bankIndex -> { monthLabel -> Positions amount funded allocated to that bank for that month }
  loanTransferAllocatedByBankAndMonth = null,
  /** @see BankAnalysisPreviewModal privateRoleFundingLoanRule */
  privateRoleFundingLoanRule = false,
  variant = "wd",
  additionalInfo = null,
  /** Render off-screen and hand the content element to onCaptureReady (e.g. Breakdown.pdf for mail). */
  captureMode = false,
  onCaptureReady = null,
}) {
  const contentRef = useRef(null);
  const onCaptureReadyRef = useRef(onCaptureReady);
  onCaptureReadyRef.current = onCaptureReady;
  /** Set below to buildCopyHtml; handed to onCaptureReady so callers get the Copy HTML. */
  const buildCopyHtmlRef = useRef(null);
  useEffect(() => {
    if (!captureMode || !isOpen) return undefined;
    // Give charts and images a moment to paint before the capture.
    const timer = setTimeout(() => onCaptureReadyRef.current?.(contentRef.current, () => buildCopyHtmlRef.current?.() ?? Promise.resolve(null)), 1500);
    return () => clearTimeout(timer);
  }, [captureMode, isOpen]);
  const [copied, setCopied] = useState(false);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState(null);
  // The CRM host passes the offer in as `approvedOffer`; there is no
  // finalOffer / auth slice here, so these stay null.
  const currentFinalOffer = null;
  const user = null;

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);
  const riskMeta = getRiskMeta(riskCategory);
  const isArPreview = variant === "ar";
  const { getSort, toggleSort } = usePreviewTableSort();

  // Net credit mapping by bank and month for display.
  // Uses the stored Net Credit values from bank analysis; Positions Amount Funded
  // effects are already included in Bank Total and overall eligibility, so this
  // map only mirrors the per-bank stored values. Net credit for Bank Total is
  // driven directly from bankTotalRows (which already includes Positions).
  const displayNetByBankAndMonth = (() => {
    if (!Array.isArray(bankTables) || bankTables.length === 0) {
      return null;
    }

    const result = {};

    bankTables.forEach((table, bankIndex) => {
      (table || []).forEach((row) => {
        const label = row?.month && String(row.month).trim();
        if (!label) return;
        const base = parseNum(row.netCredit);
        if (!result[bankIndex]) result[bankIndex] = {};
        result[bankIndex][label] = base;
      });
    });

    return result;
  })();

  // Funding Amt: Positions totals for bucket when allocated; otherwise stored funding.
  function getDisplayLoan(bankIndex, row) {
    const baseFromRow = parseNum(row?.loan);
    const baseSafe = Number.isNaN(baseFromRow) ? 0 : baseFromRow;

    if (
      !loanTransferAllocatedByBankAndMonth ||
      typeof loanTransferAllocatedByBankAndMonth !== "object" ||
      !loanTransferAllocatedByBankAndMonth[bankIndex] ||
      typeof loanTransferAllocatedByBankAndMonth[bankIndex] !== "object"
    ) {
      return baseSafe;
    }

    const label = row?.month && String(row.month).trim();
    if (!label) return baseSafe;

    const extraRaw = loanTransferAllocatedByBankAndMonth[bankIndex][label];
    const extraSafe = Array.isArray(extraRaw)
      ? extraRaw.reduce((s, n) => s + (Number(n) || 0), 0)
      : (Number.isNaN(parseNum(extraRaw)) ? 0 : parseNum(extraRaw));

    if (privateRoleFundingLoanRule) return Math.max(baseSafe, extraSafe);
    return baseSafe > 0 ? baseSafe : extraSafe > 0 ? extraSafe : baseSafe;
  }

  // Display transfer: stored value only.
  function getDisplayTransfer(row) {
    const v = parseNum(row?.transfer);
    return Number.isNaN(v) ? 0 : v;
  }

  const positionsWithData = positions.filter(positionRowHasData);
  const positionsForPreviewTable = Array.isArray(positions)
    ? positions.filter(positionHasAnyPreviewData)
    : [];
  const groupedPositionsForPreviewTable = useMemo(() => {
    const sortedRows = positionsForPreviewTable
      .map((row, originalIndex) => ({ row, originalIndex }))
      .sort((a, b) => {
        const da = a.row?.startingDate ? new Date(a.row.startingDate).getTime() : 0;
        const db = b.row?.startingDate ? new Date(b.row.startingDate).getTime() : 0;
        if (db !== da) return db - da;
        return b.originalIndex - a.originalIndex;
      })
      .map(({ row }) => {
        const startDateLabel = (() => {
          if (!row.startingDate) return "-";
          const formatted = formatDateUS(row.startingDate);
          return formatted ? formatted.replace(/-/g, "/") : String(row.startingDate);
        })();

        const monthLabel = (() => {
          if (!row.startingDate) return "-";
          const d = new Date(row.startingDate);
          if (Number.isNaN(d.getTime())) return "-";
          return d.toLocaleString("en-US", { month: "long" });
        })();

        const amountFundedNum = parseNum(row.amountFunded);
        const installmentNum = parseNum(row.installment);
        const mcaPercentPaidNum = parseNum(row.mcaPercentPaid);
        const rawStatus = String(row.status || "").trim();
        const statusUpper = rawStatus.toUpperCase();
        const lastPymtDate = row.dateOfLastPymt || row.dateOfLastPymts;

        return {
          ...row,
          monthLabel,
          monthKey: monthLabel.toLowerCase(),
          startSortValue: dateSortValue(row.startingDate),
          startDateLabel,
          lenderLabel: row.lender || "-",
          amountFundedLabel: !Number.isNaN(amountFundedNum) ? `$ ${formatNumberUS(amountFundedNum)}` : "-",
          statusLabel: rawStatus && statusUpper !== "SELECT" ? rawStatus : "-",
          statusUpper,
          frequencyLabel: row.frequency || "-",
          repaymentLabel: !Number.isNaN(installmentNum) ? `$ ${formatNumberUS(installmentNum)}` : "-",
          lastPaymentDateLabel: lastPymtDate
            ? (formatDateUS(lastPymtDate) || String(lastPymtDate)).replace(/-/g, "/")
            : "-",
          mcaPercentPaidLabel: !Number.isNaN(mcaPercentPaidNum) ? `${formatNumberUS(mcaPercentPaidNum)}%` : "-",
        };
      });

    let activeMonthKey = null;
    let monthGroupIndex = -1;

    const orderedRows = applyPreviewSort(sortedRows, getSort("positions"), (r) => r.startSortValue);
    return orderedRows.map((row) => {
      const showMonth = row.monthKey !== activeMonthKey;
      if (showMonth) {
        activeMonthKey = row.monthKey;
        monthGroupIndex += 1;
      }

      return {
        ...row,
        showMonth,
        monthGroupIndex,
      };
    });
  }, [positionsForPreviewTable, getSort]);
  // Positions to include in TOTAL row: ACTIVE, REFI, PIF, REVERSE and any row with numeric data (match PositionsTable logic)
  const positionsForGrandTotal = Array.isArray(positions)
    ? positions.filter((row) => {
        const status = String(row.status || "").trim().toUpperCase();
        if (status && status !== "SELECT" && ["ACTIVE", "REFI", "PIF", "REVERSE"].includes(status)) return true;
        const hasData = ["installment", "totalRepayments", "amountFunded", "monthlyMcaPmts", "mcaRemit"].some(
          (key) => row[key] != null && String(row[key]).trim() !== "" && !Number.isNaN(parseNum(row[key]))
        );
        return hasData;
      })
    : [];
  // Position table metrics: Active count (ACTIVE + REFI), Existing Remit, Total Monthly/Daily from positions.
  const {
    activeCount,
    existingRemit,
    totalMonthlyFromPositions: totalMonthly,
    totalDailyFromPositions: totalDaily,
  } = computePositionMetrics(positions);
  const existingActivePositionsCount = getExistingActivePositionsCount(positions);
  const ourRemitNum = (() => {
    const monthlyPayment = currentFinalOffer?.monthlyPayment ?? approvedOffer?.monthlyPayment ?? "";
    const avgNetCredit = Number(bankTotalAverages?.netCredit);
    const monthlyRepayNum = parseNum(monthlyPayment);
    if (!Number.isFinite(monthlyRepayNum) || !Number.isFinite(avgNetCredit) || avgNetCredit <= 0) return 0;
    return (monthlyRepayNum / avgNetCredit) * 100;
  })();
  const totalRemit = ourRemitNum + existingRemit;
  const isHighTotalRemit = totalRemit > 60;
  const recentMonthLeverage = recentMonthLeverageRatio(positions, bankTotalRows);
  const displayDate =
    form?.date && String(form.date).trim() !== ""
      ? formatDateUS(form.date) || form.date
      : "-";

  const finalOfferData = currentFinalOffer;
  const data = finalOfferData ?? approvedOffer;
  // const notesDisplay = (notesFromApi && String(notesFromApi).trim() !== "")
  //   ? String(notesFromApi).trim()
  //   : (data?.notes ?? approvedOffer?.notes ?? "");
  const notesDisplay = data?.notes ?? "";
  const isDeclined = offerDecision === "declined" || data?.status === "declined";
  const isApproved = offerDecision === "approved" || data?.status === "approved";

  const repaymentSum = sumPositionRepaymentForTotal(positionsWithData);
  const totalRepaymentsSum = positionsWithData.reduce((sum, row) => sum + (parseNum(row.totalRepayments) || 0), 0);
  const paymentTermSum = positionsWithData.reduce((sum, row) => sum + (parseNum(row.paymentTerm) || 0), 0);
  const amountFundedSum = positionsWithData.reduce((sum, row) => sum + (parseNum(row.amountFunded) || 0), 0);
  const mcaEstBalanceSum = positionsWithData.reduce((sum, row) => sum + (parseNum(row.mcaEstBalance) || 0), 0);
  const mcaPercentPaidSum = positionsWithData.reduce((sum, row) => sum + (parseNum(row.mcaPercentPaid) || 0), 0);
  const pmtsLeftSum = positionsWithData.reduce((sum, row) => sum + (parseNum(row.pmtsLeft) || 0), 0);
  const mcaRemitSum = positionsWithData.reduce((sum, row) => sum + (parseNum(row.mcaRemit) || 0), 0);
  const monthlyMcaPmtsSum = positionsWithData.reduce((sum, row) => sum + (parseNum(row.monthlyMcaPmts) || 0), 0);
  // Grand total row (footer): REPAYMENT excludes PIF
  const grandTotalRepaymentSum = sumPositionRepaymentForTotal(positionsForGrandTotal);
  const grandTotalPaymentTermSum = positionsForGrandTotal.reduce((sum, row) => sum + (parseNum(row.paymentTerm) || 0), 0);
  const grandTotalAmountFundedSum = positionsForGrandTotal.reduce((sum, row) => sum + (parseNum(row.amountFunded) || 0), 0);
  // Loan Amount = Amount Funded / 0.9 (amt funded + 10% of loan amount)
  const grandTotalLoanAmountSum = positionsForGrandTotal.reduce((sum, row) => {
    // Prefer the loanAmount that was already calculated on the bank‑analysis page
    // (it respects manual overrides and deduction logic). Fallback to Amount Funded / 0.9
    // when loanAmount is empty, using the same formula as applyEstimatedPaymentToRow.
    const loanFromRow = parseNum(row.loanAmount);
    if (!Number.isNaN(loanFromRow) && loanFromRow > 0) {
      return sum + loanFromRow;
    }
    const af = parseNum(row.amountFunded);
    if (Number.isNaN(af) || af <= 0) return sum;
    return sum + af / 0.9;
  }, 0);
  const grandTotalMcaEstBalanceSum = positionsForGrandTotal.reduce((sum, row) => sum + (parseNum(row.mcaEstBalance) || 0), 0);
  const grandTotalMcaPercentPaidSum = positionsForGrandTotal.reduce((sum, row) => sum + (parseNum(row.mcaPercentPaid) || 0), 0);
  const grandTotalMcaRemitSum = positionsForGrandTotal.reduce((sum, row) => sum + (parseNum(row.mcaRemit) || 0), 0);
  const grandTotalMonthlyMcaPmtsSum = positionsForGrandTotal.reduce((sum, row) => sum + (parseNum(row.monthlyMcaPmts) || 0), 0);
  const grandTotalPmtsLeftSum = positionsForGrandTotal.reduce((sum, row) => sum + (parseNum(row.pmtsLeft) || 0), 0);

  // Convert image URLs to base64 data URLs for email compatibility
  const convertImagesToBase64 = useCallback(async (element) => {
    if (!element) return;
    const images = element.querySelectorAll("img");
    const conversions = [];

    for (const img of images) {
      const src = img.getAttribute("src");
      if (!src) continue;

      // Skip if already a data URL
      if (src.startsWith("data:")) continue;

      try {
        let dataUrl;
        let resolvedSrc = src;

        // Convert relative URLs to absolute URLs
        if (src.startsWith("/") || (!src.startsWith("http") && !src.startsWith("blob:"))) {
          resolvedSrc = src.startsWith("/") 
            ? `${window.location.origin}${src}`
            : `${window.location.origin}/${src}`;
        }

        // Handle blob URLs by converting them first
        if (src.startsWith("blob:")) {
          try {
            const response = await fetch(src);
            const blob = await response.blob();
            dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.warn("Failed to convert blob URL to base64:", src, e);
            continue;
          }
        } else {
          // Handle regular URLs (including relative paths)
          try {
            dataUrl = await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error("Image load timeout"));
              }, 10000); // 10 second timeout

              const imgEl = new Image();
              imgEl.crossOrigin = "anonymous";
              
              imgEl.onload = () => {
                clearTimeout(timeout);
                try {
                  const canvas = document.createElement("canvas");
                  const ctx = canvas.getContext("2d");
                  canvas.width = imgEl.width;
                  canvas.height = imgEl.height;
                  ctx.drawImage(imgEl, 0, 0);
                  const dataUrl = canvas.toDataURL("image/png");
                  resolve(dataUrl);
                } catch (e) {
                  reject(e);
                }
              };
              
              imgEl.onerror = () => {
                clearTimeout(timeout);
                // If direct image load fails, try fetch
                fetch(resolvedSrc, { 
                  mode: 'cors',
                  credentials: 'include'
                })
                  .then((response) => {
                    if (!response.ok) throw new Error("Fetch failed");
                    return response.blob();
                  })
                  .then((blob) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  })
                  .catch((fetchError) => {
                    // If fetch also fails, try original src
                    if (resolvedSrc !== src) {
                      fetch(src, { 
                        mode: 'cors',
                        credentials: 'include'
                      })
                        .then((response) => {
                          if (!response.ok) throw new Error("Fetch failed");
                          return response.blob();
                        })
                        .then((blob) => {
                          const reader = new FileReader();
                          reader.onloadend = () => resolve(reader.result);
                          reader.onerror = reject;
                          reader.readAsDataURL(blob);
                        })
                        .catch(reject);
                    } else {
                      reject(fetchError);
                    }
                  });
              };
              
              imgEl.src = resolvedSrc;
            });
          } catch (e) {
            console.warn("Failed to convert image to base64:", src, e);
            // Don't continue - keep original src as fallback
            continue;
          }
        }

        if (dataUrl) {
          conversions.push({ img, dataUrl });
        }
      } catch (e) {
        console.warn("Failed to convert image to base64:", src, e);
        // Keep original src as fallback
      }
    }

    // Apply conversions
    conversions.forEach(({ img, dataUrl }) => {
      img.setAttribute("src", dataUrl);
      const w = img.dataset.emailWidth;
      const h = img.dataset.emailHeight;
      if (w && h) {
        img.setAttribute("width", w);
        img.setAttribute("height", h);
        img.style.width = w + "px";
        img.style.height = h + "px";
      }
      // Remove anchor wrapper if present
      const anchor = img.parentElement;
      if (anchor && anchor.tagName === "A") {
        const parent = anchor.parentElement;
        if (parent) {
          parent.insertBefore(img, anchor);
          parent.removeChild(anchor);
        }
      }
      // Ensure responsive sizing
      const currentStyle = img.getAttribute("style") || "";
      if (!currentStyle.includes("max-width")) {
        img.style.maxWidth = "100%";
      }
      if (!currentStyle.includes("height")) {
        img.style.height = "auto";
      }
      if (!currentStyle.includes("display")) {
        img.style.display = "block";
      }
    });
  }, []);

  /**
   * Builds the email-ready HTML the Copy button puts on the clipboard (also
   * appended to the scrubber's Recommend Approval mail via captureMode).
   * Returns null when the preview content isn't mounted.
   */
  const buildCopyHtml = useCallback(async () => {
    if (!contentRef.current) return null;
    const el = contentRef.current;

    // 1) Capture Recharts charts as PNG images so they survive in email clients.
    const barCopy = await captureTotalNetCreditBarChartForCopy(el);
    const chartImages = barCopy ? [barCopy] : await captureChartsAsImages(el);

    // 2) Clone the DOM so we can safely mutate it for copying.
    const clone = el.cloneNode(true);

    // 3) Replace SVG charts with <img> tags in the cloned content.
    if (chartImages.length > 0) {
      replaceCopiedChartWrappers(clone, chartImages);
    }

    // 3.5) Convert all images (including screenshots) to base64 data URLs for email compatibility
    await convertImagesToBase64(clone);

    // 4) Inline important styles so that pasted HTML looks close to the preview.
    const STYLE_PROPS = [
      "color", "background-color", "font-size", "font-weight", "font-family", "text-align", "line-height",
      "border", "border-top", "border-right", "border-bottom", "border-left", "border-color", "border-width",
      "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
      "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
      "width", "min-width", "max-width", "display", "vertical-align", "border-collapse", "border-spacing",
      "background", "fill",
      "background-image", "text-transform", "letter-spacing",
      "border-radius", "overflow",
    ];


    

    function applyComputedStyles(original, cloned) {
      if (original.nodeType !== Node.ELEMENT_NODE) return;
      if (isFaviconWatermarkNode(original) || isFaviconWatermarkNode(cloned)) return;
      const computed = window.getComputedStyle(original);
      let style = "";
      for (const prop of STYLE_PROPS) {
        const value = computed.getPropertyValue(prop);
        if (value && value !== "none" && value !== "normal" && value !== "0px none rgb(0, 0, 0)") {
          style += `${prop}: ${value}; `;
        }
      }
      if (style) cloned.setAttribute("style", (cloned.getAttribute("style") || "") + style);
      const oChildren = original.childNodes;
      const cChildren = cloned.childNodes;
      for (let i = 0; i < oChildren.length; i++) {
        if (oChildren[i].nodeType === Node.ELEMENT_NODE && cChildren[i]?.nodeType === Node.ELEMENT_NODE) {
          applyComputedStyles(oChildren[i], cChildren[i]);
        }
      }
    }

    applyComputedStyles(el, clone);

    // 5) Clean up email-incompatible styles and ensure proper spacing for notes
    const cleanupEmailStyles = (element) => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
      if (isFaviconWatermarkNode(element)) return;
      if (element.classList?.contains("chart-capture-area") || element.closest?.(".chart-capture-area")) return;

      const style = element.getAttribute("style");
      if (style) {
        let cleaned = style
          .replace(/backdrop-filter[^;]*;?/gi, "")
          .replace(/filter[^;]*blur[^;]*;?/gi, "")
          .replace(/box-shadow[^;]*;?/gi, "")
          .replace(/text-shadow[^;]*;?/gi, "")
          .replace(/text-decoration[^;]*;?/gi, "")
          .replace(/transform[^;]*;?/gi, "")
          .replace(/transition[^;]*;?/gi, "")
          .replace(/opacity[^;]*;?/gi, "")
          .replace(/list-style[^;]*;?/gi, "");

        // Preserve background and background-color for email
        const bgColorMatch = style.match(/background-color\s*:\s*([^;]+)/i);
        const preservedBgColor = bgColorMatch ? bgColorMatch[1].trim() : null;
        if (preservedBgColor && !cleaned.includes("background-color")) {
          cleaned += ` background-color: ${preservedBgColor};`;
        }
        const bgMatch = style.match(/background\s*:\s*([^;]+)/i);
        const preservedBg = bgMatch ? bgMatch[1].trim() : null;
        if (preservedBg && !cleaned.includes("background:")) {
          cleaned += ` background: ${preservedBg};`;
        }

        element.setAttribute("style", cleaned);
      }

      // Ensure divs have proper display and spacing
      if (element.tagName === "DIV") {
        const computed = window.getComputedStyle(element);
        const display = computed.display;
        
        // Handle flex column containers (like notes section)
        if (display === "flex" && computed.flexDirection === "column") {
          // Convert flex column to block with proper spacing
          let currentStyle = element.getAttribute("style") || "";
          const gap = computed.gap || "0";
          const gapNum = parseFloat(gap) || 0;
          
          // Add spacing between flex column items (never set display on TABLE - email needs table layout)
          Array.from(element.children).forEach((child, idx) => {
            if (child.nodeType === Node.ELEMENT_NODE) {
              let childStyle = child.getAttribute("style") || "";
              if (child.tagName !== "TABLE" && !childStyle.includes("display")) {
                childStyle += " display: block;";
              }
              // Add margin-top for spacing (except first item)
              if (idx > 0 && gapNum > 0) {
                childStyle += ` margin-top: ${gapNum}px;`;
              }
              // Ensure width is preserved
              if (!childStyle.includes("width")) {
                childStyle += " width: 100%;";
              }
              child.setAttribute("style", childStyle.trim());
            }
          });
          
          // Convert container to block
          currentStyle = currentStyle.replace(/display:\s*flex;?/gi, "");
          element.setAttribute("style", (currentStyle + " display: block;").trim());
        }
        
        // Handle flex row containers - ensure they don't wrap
        if (display === "flex" && computed.flexDirection === "row") {
          let currentStyle = element.getAttribute("style") || "";
          // For flex-wrap containers, ensure proper spacing
          if (computed.flexWrap === "wrap") {
            const gap = computed.gap || "0";
            const gapNum = parseFloat(gap) || 0;
            Array.from(element.children).forEach((child, idx) => {
              if (child.nodeType === Node.ELEMENT_NODE && idx > 0) {
                let childStyle = child.getAttribute("style") || "";
                if (gapNum > 0 && !childStyle.includes("margin-left")) {
                  childStyle += ` margin-left: ${gapNum}px;`;
                }
                child.setAttribute("style", childStyle.trim());
              }
            });
          }
        }
      }
      
      // Ensure text elements have proper line-height and spacing
      if (element.tagName === "SPAN" || element.tagName === "DIV") {
        let currentStyle = element.getAttribute("style") || "";
        const computed = window.getComputedStyle(element);
        
        // Ensure proper line-height for text readability
        if (!currentStyle.includes("line-height") && computed.lineHeight) {
          currentStyle += ` line-height: ${computed.lineHeight};`;
        }
        
        // Ensure white-space is preserved for pre-wrap elements
        if (computed.whiteSpace === "pre-wrap" && !currentStyle.includes("white-space")) {
          currentStyle += " white-space: pre-wrap;";
        }
        
        if (currentStyle !== element.getAttribute("style")) {
          element.setAttribute("style", currentStyle.trim());
        }
      }

      // Process children
      Array.from(element.childNodes).forEach((child) => {
        cleanupEmailStyles(child);
      });
    };

    cleanupEmailStyles(clone);

    /* Runs last on purpose: cleanupEmailStyles re-appends the original

       `background` shorthand, which carries the gradient and resets

       background-color. Baking before it was silently undone. */


    // 5.3b) Do NOT wrap Offer + Charts in a layout table for email. Many clients (e.g. Outlook) strip
    // nested tables and show only text; the Offer table must stay top-level so it pastes as a table.
    // Ensure the approved top section is block layout so Offer block, then Charts, then Remit stack.
    const emailTopLayout = clone.querySelector("[data-email-top-layout='true']");
    if (emailTopLayout && emailTopLayout.firstElementChild) {
      const topRow = emailTopLayout.firstElementChild;
      topRow.setAttribute("style", (topRow.getAttribute("style") || "") + " display: block;");
      Array.from(topRow.children).forEach((child, idx) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          let s = child.getAttribute("style") || "";
          if (!s.includes("display")) s += " display: block;";
          if (idx > 0 && !s.includes("margin-top")) s += " margin-top: 16px;";
          child.setAttribute("style", s.trim());
        }
      });
    }

    // 5.3c) Ensure Offer and Remit tables use email-safe table markup so they don't paste as plain text
    const offerBorderColor = "#cbd5e1";
    const emailSafeTdStyle = "border: 1px solid #94a3b8; padding: 6px 8px; vertical-align: middle;";
    const offerTdStyle = `border: 1px solid ${offerBorderColor}; padding: 6px 8px; vertical-align: middle;`;
    clone.querySelectorAll("table").forEach((tbl) => {
      const firstRow = tbl.querySelector("tbody tr, tr");
      if (!firstRow) return;
      const cells = firstRow.querySelectorAll("td, th");
      const firstCellText = (cells[0]?.textContent || "").trim();
      const isOfferTable = firstCellText === "Offer";
      // The Leverage table's first cell now reads "Our Levg / Repay".
      const isRemitTable =
        firstCellText.includes("Our Remit") || firstCellText.includes("Our Levg");
      if (!isOfferTable && !isRemitTable) return;
      tbl.setAttribute("border", "1");
      tbl.setAttribute("cellpadding", "4");
      tbl.setAttribute("cellspacing", "0");
      let tblStyle = tbl.getAttribute("style") || "";
      if (!tblStyle.includes("border-collapse")) tblStyle += " border-collapse: collapse;";
      if (!tblStyle.includes("width")) tblStyle += " width: 100%;";
      if (isOfferTable) tblStyle += " border: 1px solid " + offerBorderColor + ";";
      tbl.setAttribute("style", tblStyle.trim());
      const OFFER_LABELS = new Set(["Offer", "Repayment", "Rate", "Our Position", "Frequency / Repay", "Monthly payment", "Term", "Fees", "Notes:"]);
      const cellStyle = isOfferTable ? offerTdStyle : emailSafeTdStyle;
      tbl.querySelectorAll("td, th").forEach((cell) => {
        let s = cell.getAttribute("style") || "";
        if (!s.includes("border")) s += " " + cellStyle;
        else if (!s.includes("padding")) s += " padding: 6px 8px;";
        if (isOfferTable) {
          const text = (cell.textContent || "").trim();
          s = s.replace(/\bcolor\s*:\s*[^;]+;?/gi, "").replace(/\bfont-weight\s*:\s*[^;]+;?/gi, "").replace(/\bfont-size\s*:\s*[^;]+;?/gi, "");
          if (OFFER_LABELS.has(text)) {
            s += " color: #334155; font-weight: normal; font-size: 13px;";
          } else if (firstRow.contains(cell) && cells[1] === cell) {
            s += " color: #0caa46; font-weight: 700;";
          } else {
            s += " color: #3d5c86; font-weight: 700;";
          }
        }
        cell.setAttribute("style", s.trim());
      });
    });

    // 5.3d) Keep the live Offer card structure (header div + table wrapper).
    // Do not flatten wrappers or merge the header into the table — that makes
    // the header bar a different width than the table body in Gmail.

    // 5.4) Charts in email: side-by-side table matching preview (bar full-width, pie legend left)
    applyCopiedChartTableLayout(clone, chartImages);

    // 5.5) Specifically fix notes section spacing to prevent overlapping
    // Find all flex-col containers (including notes section)
    const flexColSections = clone.querySelectorAll('div[class*="flex"][class*="flex-col"], div.flex.flex-col');
    flexColSections.forEach((section) => {
      const computed = window.getComputedStyle(section);
      if (computed.display === "flex" && computed.flexDirection === "column") {
        const children = Array.from(section.children);
        children.forEach((child, idx) => {
          if (child.nodeType === Node.ELEMENT_NODE) {
            let childStyle = child.getAttribute("style") || "";
            // Ensure block display
            if (!childStyle.includes("display")) {
              childStyle += " display: block;";
            }
            // Add margin-bottom for spacing between items (use gap value if available)
            const gap = computed.gap || "8px";
            const gapNum = parseFloat(gap) || 8;
            if (idx < children.length - 1) {
              childStyle += ` margin-bottom: ${gapNum}px;`;
            }
            // Ensure width
            if (!childStyle.includes("width")) {
              childStyle += " width: 100%;";
            }
            // Add line-height for text readability
            if (!childStyle.includes("line-height")) {
              childStyle += " line-height: 1.5;";
            }
            // Preserve white-space for pre-wrap elements
            const preWrapSpan = child.querySelector('span[style*="white-space"]');
            if (preWrapSpan) {
              let spanStyle = preWrapSpan.getAttribute("style") || "";
              if (!spanStyle.includes("white-space")) {
                spanStyle += " white-space: pre-wrap;";
              }
              if (!spanStyle.includes("display")) {
                spanStyle += " display: block;";
              }
              preWrapSpan.setAttribute("style", spanStyle.trim());
            }
            child.setAttribute("style", childStyle.trim());
          }
        });
        // Convert container to block
        let sectionStyle = section.getAttribute("style") || "";
        sectionStyle = sectionStyle.replace(/display:\s*flex;?/gi, "");
        section.setAttribute("style", (sectionStyle + " display: block;").trim());
      }
    });

    // 5.6) Fix Notes section specifically - ensure each note item is properly spaced
    // Find Notes section by looking for div containing "Legal Check", "Comment", or "Other Notes"
    const allDivs = clone.querySelectorAll('div');
    allDivs.forEach((div) => {
      const text = div.textContent || "";
      if (text.includes("Legal Check") || text.includes("Comment") || text.includes("Other Notes") || text.includes("Legal case screenshots & attachments")) {
        // This is likely a Notes section container or item
        let style = div.getAttribute("style") || "";
        if (div.textContent.includes("Legal Check") || div.textContent.includes("Comment") || div.textContent.includes("Other Notes")) {
          // Individual note item
          if (!style.includes("display")) {
            style += " display: block;";
          }
          if (!style.includes("margin-bottom")) {
            style += " margin-bottom: 14px;";
          }
          if (!style.includes("line-height")) {
            style += " line-height: 1.6;";
          }
          if (!style.includes("width")) {
            style += " width: 100%;";
          }
          div.setAttribute("style", style.trim());
        }
        // Ensure parent container is block
        const parent = div.parentElement;
        if (parent && (parent.textContent.includes("Notes") || parent.className.includes("flex-col"))) {
          let parentStyle = parent.getAttribute("style") || "";
          if (!parentStyle.includes("display")) {
            parentStyle += " display: block;";
          }
          parent.setAttribute("style", parentStyle.trim());
        }
      }
    });
    
    // Also ensure all spans with pre-wrap have proper display
    const preWrapSpans = clone.querySelectorAll('span[style*="white-space"]');
    preWrapSpans.forEach((span) => {
      let style = span.getAttribute("style") || "";
      if (style.includes("pre-wrap") && !style.includes("display")) {
        style += " display: block;";
        if (!style.includes("margin-top")) {
          style += " margin-top: 4px;";
        }
        span.setAttribute("style", style.trim());
      }
    });

    // 5.7) Notes section: force line breaks in email; put each bullet on the next line (same as NotesPreviewModal).
    const notesSection = Array.from(clone.querySelectorAll("div")).find((d) => {
      const t = (d.textContent || "").trim();
      return t.includes("Notes") && (t.includes("Legal check") || t.includes("Legal Check") || t.includes("Comment") || t.includes("Other notes") || t.includes("Other Notes"));
    });
    if (notesSection) {
      notesSection.querySelectorAll("span").forEach((span) => {
        if (span.querySelector("img")) return;
        const text = span.textContent || "";
        if (text.includes("\n") || text.includes("•")) {
          let withBreaks = text
            .replace(/\n\s*•\s*/g, " • ")
            .replace(/\s*•\s*\n/g, " • ");
          withBreaks = withBreaks
            .replace(/\.\s*•\s*/g, ".<br>• ")
            .replace(/ • /g, "<br>• ")
            .replace(/\n/g, "<br>");
          span.innerHTML = withBreaks;
        }
      });
      notesSection.querySelectorAll("*").forEach((el) => {
        if (el.nodeType !== Node.ELEMENT_NODE) return;
        let s = el.getAttribute("style") || "";
        s = s.replace(/border[^;]*;?/gi, "").replace(/text-decoration[^;]*;?/gi, "")
          .replace(/position[^;]*;?/gi, "").replace(/\b(left|right|top|bottom)\s*:[^;]*;?/gi, "");
        if (s.trim()) el.setAttribute("style", s.trim());
      });
    }

    // 5.8) Simplify offer table Notes cell for email (same as NotesPreviewModal).
    const allRows = clone.querySelectorAll("tr");
    allRows.forEach((tr) => {
      const tds = tr.querySelectorAll("td");
      const notesLabelTd = Array.from(tds).find((td) => (td.textContent || "").trim() === "Notes:");
      if (!notesLabelTd) return;
      const contentTd = Array.from(tds).find((td) => td !== notesLabelTd && (td.getAttribute("colspan") || td.textContent));
      if (!contentTd) return;
      const raw = (contentTd.textContent || "").trim();
      if (!raw || raw === "-") return;

      /* Keep the note's structure. This used to rebuild the cell from
         textContent joined on newlines, which destroyed the <ul>/<li> markup —
         and because a list's textContent contains no newlines, every bullet
         collapsed onto one line in email. Normalise the existing markup for
         email instead: explicit list styling (cleanupEmailStyles strips
         list-style) and block display on line-level elements. */
      contentTd.style.setProperty("line-height", "1.5");
      contentTd.querySelectorAll("ul, ol").forEach((list) => {
        list.style.setProperty("display", "block");
        list.style.setProperty("margin", "4px 0");
        list.style.setProperty("padding-left", "22px");
        list.style.setProperty("list-style-position", "outside");
        list.style.setProperty("list-style-type", list.tagName === "OL" ? "decimal" : "disc");
      });
      contentTd.querySelectorAll("li").forEach((li) => {
        li.style.setProperty("display", "list-item");
        li.style.setProperty("margin", "0");
        li.style.setProperty("padding", "0");
        /* The note editor keeps white-space as pre/pre-wrap, so a newline stored
           before the item's text renders as a real line break — the bullet ends
           up alone on its own line with the text beneath it. Collapse whitespace
           and drop leading blank text nodes so the text sits beside its marker. */
        li.style.setProperty("white-space", "normal");
        while (
          li.firstChild &&
          li.firstChild.nodeType === Node.TEXT_NODE &&
          !li.firstChild.textContent.trim()
        ) {
          li.removeChild(li.firstChild);
        }
        if (li.firstChild && li.firstChild.nodeType === Node.TEXT_NODE) {
          li.firstChild.textContent = li.firstChild.textContent.replace(/^s+/, "");
        }
      });
      /* EVERY descendant of a list item goes inline, not just p/div/span.
         Whatever the editor wraps the text in, a block-level child drops below
         the bullet and leaves the marker alone on its own line. Nested lists are
         the one exception — those must stay block to indent properly. */
      contentTd.querySelectorAll("li *").forEach((el) => {
        if (el.tagName === "UL" || el.tagName === "OL" || el.tagName === "LI") return;
        el.style.setProperty("display", "inline");
        el.style.setProperty("margin", "0");
        el.style.setProperty("padding", "0");
        el.style.setProperty("white-space", "normal");
      });
      contentTd.querySelectorAll("p, div").forEach((el) => {
        if (el.closest("li")) return;
        if (!el.style.display) el.style.setProperty("display", "block");
        el.style.setProperty("margin", "0");
      });
    });

    // 6) Ensure images are responsive and properly formatted for email
    const images = clone.querySelectorAll("img");
    images.forEach((img) => {
      if (isFaviconWatermarkNode(img)) return;
      if (img.closest?.(".chart-capture-area")) return;
      if (isInlinePastedNoteImage(img)) {
        clearInlinePastedNoteImageForcedSize(img);
        if (!img.getAttribute("alt")) img.setAttribute("alt", "Pasted image");
        return;
      }
      let currentStyle = img.getAttribute("style") || "";
      // Ensure images have proper inline styles for email compatibility
      if (!currentStyle.includes("max-width")) {
        currentStyle += " max-width: 100%;";
      }
      if (!currentStyle.includes("height")) {
        currentStyle += " height: auto;";
      }
      if (!currentStyle.includes("display")) {
        currentStyle += " display: block;";
      }
      if (!currentStyle.includes("margin")) {
        currentStyle += " margin: 8px 0;";
      }
      // Ensure border for screenshots
      if (!currentStyle.includes("border")) {
        currentStyle += " border: 1px solid #cbd5e1;";
      }
      img.setAttribute("style", currentStyle.trim());
      
      // Ensure alt text for accessibility
      if (!img.getAttribute("alt")) {
        img.setAttribute("alt", "Image");
      }
    });

    const desktopWidthPx = measurePreviewDesktopWidthPx(el);
    const desktopMinWidthPx = measurePreviewDesktopMinWidthPx(el);

    preserveCopiedPreviewBorders(el, clone);
    preserveCopiedPreviewCardGeometry(el, clone);
    removePreviewBrandLogoFromClone(clone);
    removeFaviconWatermarkFromClone(clone);
    revealWatermarkThroughOrdinaryCells(clone);
    /* Must run AFTER revealWatermarkThroughOrdinaryCells: that pass sets any
       "ordinary" (light) background to transparent so the watermark shows
       through, which stripped the pale Bank Analysis / Positions / wire bands
       while leaving the saturated Offer and Leverage bars alone. Baking after
       it keeps the bands and still lets the watermark through the data cells. */
    bakeEmailAppearance(el, clone);
    replaceCopiedBarChartWithFixedPng(clone, barCopy);

    // Copy the full cloned container so desktop sizing (min-width/padding) is preserved
    // when the HTML is pasted from mobile devices.
    // Sort arrows are UI only — an email cannot re-sort.
    stripSortIndicators(clone);
    let html = clone.outerHTML;
    html = html.replace(/var\(--[^)]+\)/g, "#e2e8f0");

    return wrapCopiedPreviewHtml(html, desktopWidthPx, desktopMinWidthPx);
  }, [convertImagesToBase64]);
  buildCopyHtmlRef.current = buildCopyHtml;

  const handleCopy = useCallback(async () => {
    const wrapped = await buildCopyHtml();
    if (!wrapped) return;

    let success = false;
    try {
      success = await copyPreviewHtmlToClipboard(wrapped);
    } catch {
      success = false;
    }
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [buildCopyHtml]);

  const handleDownloadPdf = useCallback(async () => {
    if (!contentRef.current) return;
    setIsPreparingPdf(true);
    try {
      const titleName = String(form?.clientName || "Financial Analysis")
        .replace(/[^\w\s-]/g, "")
        .trim();
      const safeName = `${titleName || "Financial Analysis"} - Preview.pdf`;
      await downloadElementAsPdf(contentRef.current, safeName);
    } catch (err) {
      window.alert("Unable to download PDF. Please try again.");
    } finally {
      setIsPreparingPdf(false);
    }
  }, [form?.clientName, variant]);

  if (!isOpen) return null;

  const portalRoot = getWdPreviewPortalRoot();
  if (!portalRoot) return null;

  return createPortal(
    <div
      data-mca-wd-preview-root=""
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/50"
      style={
        captureMode
          ? { zIndex: -1, left: "-20000px", right: "auto", width: "1400px", opacity: 0, pointerEvents: "none" }
          : { zIndex: WD_PREVIEW_MODAL_Z_INDEX }
      }
      aria-hidden={captureMode || undefined}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div
        className="bg-white rounded-xl shadow-xl max-h-[90vh] max-w-[90%] flex flex-col overflow-hidden min-w-0 w-full"
        style={{ borderColor: "var(--ledgerx-border)" }}
      >
        <div
          className="flex items-center flex-wrap justify-between px-6 py-4 border-b shrink-0 rounded-xl overflow-hidden"
          style={{ borderColor: "var(--ledgerx-border)", background: "var(--ledgerx-content-bg)" }}
        >
          <h2 id="preview-modal-title" className="md:text-lg text-base font-semibold text-slate-800">
          {form.clientName||""} – Financial Analysis
          </h2>
          <div className="flex items-center gap-2 md:mt-0 mt-2">
            <button
              type="button"
              onClick={handleCopy}
               className="rounded-lg px-3 py-1.5 md:text-sm text-xs md:border-none border-2 border-slate-500 font-medium text-slate-600 hover:bg-slate-100 mca-preview-action focus:outline-none"
              aria-label={copied ? "Copied" : "Copy preview"}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isPreparingPdf}
              className={`rounded-lg px-3 py-1.5 md:text-sm text-xs md:border-none border-2 border-slate-500 font-medium text-slate-600 hover:bg-slate-100 mca-preview-action focus:outline-none ${
                isPreparingPdf ? "opacity-60 cursor-not-allowed" : ""
              }`}
              aria-label="Download preview pdf"
            >
              {isPreparingPdf ? "Preparing..." : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={onClose}
               className="rounded-lg px-3 py-1.5 md:text-sm text-xs md:border-none border-2 border-slate-500 font-medium text-slate-600 hover:bg-slate-100 mca-preview-action focus:outline-none"
              aria-label="Close preview"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-auto w-full">
          <div
            ref={contentRef}
            className="min-w-[1000px] p-6 px-4 space-y-4 [&>[data-preview-favicon-watermark]]:!mt-0 [&_table]:bg-slate-50 [&_td]:bg-slate-50 [&_th]:bg-slate-50 mca-preview-body"
            style={{ fontFamily: "Calibri, system-ui, -apple-system, sans-serif", position: "relative", isolation: "isolate" }}
          >
          <div className="flex w-full items-center justify-between gap-2 mca-headline-row" >
            <div className="text-[15px] font-semibold whitespace-nowrap mca-headline">
              <div className="inline-block align-middle mr-7 whitespace-nowrap mca-headline-item">
                <span className="text-slate-500 uppercase mr-1.5">Client Name:</span>
                <span className="text-slate-800">{form.clientName || "-"}</span>
              </div>
              <div className="inline-block align-middle mr-7 whitespace-nowrap mca-headline-item">
                <span className="text-slate-500 uppercase mr-1.5">Date:</span>
                <span className="text-slate-800">{displayDate}</span>
              </div>
              {riskMeta && (
                <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[12px] font-semibold text-slate-700">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: riskMeta.color }}
                  />
                  Risk: {riskMeta.label}
                </div>
              )}
            </div>
          </div>

          {isDeclined && (
            <DeclinedOfferPreviewCard reason={declinedReason} />
          )}

          {(() => {
            const offerVal = data?.offer ?? approvedOffer?.offer ?? "";
            const rateVal = data?.rate ?? approvedOffer?.rate ?? "";
            const offerNum = parseNum(offerVal);
            const rateNum = parseNum(rateVal);
            const repaymentTotal = !Number.isNaN(offerNum) && !Number.isNaN(rateNum) && rateNum > 0 ? offerNum * rateNum : NaN;
            const frequencyVal = data?.frequency ?? approvedOffer?.frequency ?? "Daily";
            const daysWeeksVal = data?.daysWeeks ?? data?.mcaOffer?.dailyRepay ?? data?.mcaOffer?.weeklyRepay ?? approvedOffer?.daysWeeks ?? "";
            const frequencyRepayStr =
              frequencyVal && daysWeeksVal != null && String(daysWeeksVal).trim() !== ""
                ? `${frequencyVal} / $ ${formatNumberUS(daysWeeksVal)}`
                : frequencyVal || "-";
            const monthlyPaymentVal = data?.monthlyPayment ?? approvedOffer?.monthlyPayment ?? "";
            const ourRemitValue =
              Number.isFinite(ourRemitNum) && ourRemitNum > 0 ? ourRemitNum.toFixed(2) : "0";
            const blockStyle = {
              backgroundColor: "#ffe3aca3",
              border: "1px solid rgb(183 180 180 / 50%)",
              boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.4)",
            };

            // Remit blocks:
            // - remitSummaryBlock: compact 2x3 grid (used when offer is NOT approved – matches screenshot)
            // - remitBlock: detailed single-column card (used alongside Offer when approved)
            const remitSummaryBlock = (
              <div className="w-full overflow-hidden rounded-xl shadow-md" style={{ border: "1px solid var(--ledgerx-border)" }}>
                <div
                  className="flex items-center justify-between gap-4 px-4 py-3 rounded-t-lg backdrop-blur-sm flex-wrap mca-section-bar"
                  style={{ borderColor: "var(--ledgerx-border)", ...blueBarStyle() }}
                />
                <div>
                  <table className="w-full min-w-[600px] table-fixed text-[12px] border-collapse">
                    <colgroup>
                      <col style={{ width: "33.33%" }} />
                      <col style={{ width: "33.33%" }} />
                      <col style={{ width: "33.34%" }} />
                    </colgroup>
                    <tbody>
                      <tr className="bg-white border-b" style={{ borderColor: "var(--ledgerx-border)" }}>
                        <td className="px-3 py-2 align-middle border-r" style={{ borderColor: "var(--ledgerx-border)" }}>
                          <div className="flex items-center gap-2 w-full">
                            <span className="w-[50%] text-[#143c2e] text-[14px] font-medium shrink-0">Our Hold</span>
                            <span className="w-[50%] text-base font-bold" style={{ color: "#0caa46" }}>
                              {isDeclined ? "0%" : `${ourRemitValue} %`}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle border-r" style={{ borderColor: "var(--ledgerx-border)" }}>
                          <div className="flex items-center gap-2 w-full">
                            <span className="w-[50%] text-[#143c2e] text-[14px] font-medium shrink-0">Total Hold</span>
                            <span
                              className="w-[50%] text-base font-bold"
                              style={{ color: isHighTotalRemit ? "#ef4444" : "#ba8d14" }}
                            >
                              {isDeclined ? "-" : totalRemit > 0 ? `${totalRemit.toFixed(2)}%` : "0%"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex items-center gap-2 w-full">
                            <span className="w-[50%] text-[#143c2e] text-[14px] font-medium shrink-0">Existing Hold</span>
                            <span className="w-[50%] text-base font-bold" style={{ color: "#249dbe" }}>
                              {existingRemit > 0 ? `${existingRemit.toFixed(2)}%` : "0%"}
                            </span>
                          </div>
                        </td>
                      </tr>
                      <tr className="bg-white border-b" style={{ borderColor: "var(--ledgerx-border)" }}>
                        <td className="px-3 py-2 align-middle border-r" style={{ borderColor: "var(--ledgerx-border)" }}>
                          <div className="flex items-center gap-2 w-full">
                            <span className="w-[50%] text-[#143c2e] text-[14px] font-medium shrink-0">Active Positions</span>
                            <span className="w-[50%] text-base font-bold text-blue-500">
                              {existingActivePositionsCount}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle border-r" style={{ borderColor: "var(--ledgerx-border)" }}>
                          <div className="flex items-center gap-2 w-full">
                            <span className="w-[50%] text-[#143c2e] text-[14px] font-medium shrink-0">Total Monthly Repay</span>
                            <span className="w-[50%] text-base font-bold text-[#3d5c86]">
                              $ {totalMonthly > 0 ? formatNumberUS(totalMonthly) : "0.00"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex items-center gap-2 w-full">
                            <span className="w-[50%] text-[#143c2e] text-[14px] font-medium shrink-0">Est Daily Repay</span>
                            <span className="w-[50%] text-base font-bold text-[#3d5c86]">
                              $ {totalDaily > 0 ? formatNumberUS(totalDaily) : "0.00"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );


            const ourMonthlyNum = parseNum(monthlyPaymentVal);
            const ourMonthlyRepay = Number.isFinite(ourMonthlyNum) && ourMonthlyNum > 0 ? ourMonthlyNum : 0;
            const existingMonthlyRepay = totalMonthly > 0 ? totalMonthly : 0;
            const totalMonthlyRepay = ourMonthlyRepay + existingMonthlyRepay;

            const daysWeeksNum = parseNum(daysWeeksVal);
            const ourDailyRepay =
              frequencyVal === "Daily"
                ? (Number.isFinite(daysWeeksNum) && daysWeeksNum > 0 ? daysWeeksNum : 0)
                : ourMonthlyRepay > 0
                  ? ourMonthlyRepay / 22
                  : 0;
            const existingDailyRepay = totalDaily > 0 ? totalDaily : 0;
            const totalDailyRepay = existingDailyRepay + ourDailyRepay;

            const remitBlock = (
              <div className="w-full rounded-xl overflow-hidden shadow-sm border border-slate-400">
                <div className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-t-lg backdrop-blur-sm flex-wrap border-slate-400 mca-section-bar" style={{ ...blueBarStyle() }}>
                  <span className="font-semibold text-slate-700 uppercase tracking-wide text-sm">Leverage</span>
                </div>
                <div>
                  <table className="w-full min-w-[820px] table-fixed text-[13px] border-collapse mca-leverage-table">
                    <colgroup>
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "16%" }} />
                    </colgroup>
                    <tbody>
                      <tr className="bg-white border-b border-slate-400">
                        <td className="px-3 py-1.5 text-[#143c2e] font-medium border-r border-slate-400 mca-strong">Our Levg / Repay</td>
                        <td className="px-3 py-1.5 text-[14px] font-bold whitespace-nowrap border-r border-slate-400" style={{ color: "#0caa46" }}>
                          {isDeclined ? "0% / $ 0.00" : `${ourRemitValue} % / $ ${ourMonthlyRepay > 0 ? formatNumberUS(ourMonthlyRepay) : "0.00"}`}
                        </td>
                        <td className="px-3 py-1.5 text-[#143c2e] font-medium border-r border-slate-400 mca-strong">Current Levg / Repay</td>
                        <td className="px-3 py-1.5 text-[14px] font-bold text-[#3d5c86] whitespace-nowrap border-r border-slate-400">
                          {`${existingRemit > 0 ? `${existingRemit.toFixed(2)}%` : "0%"} / $ ${existingMonthlyRepay > 0 ? formatNumberUS(existingMonthlyRepay) : "0.00"}`}
                        </td>
                        <td className="px-3 py-1.5 text-[#143c2e] font-medium border-r border-slate-400 mca-strong">Total Levg / Repay</td>
                        <td className="px-3 py-1.5 text-[14px] font-bold whitespace-nowrap" style={{ color: isHighTotalRemit ? "#ef4444" : "#ba8d14" }}>
                          {isDeclined
                            ? "0% / $ 0.00"
                            : `${totalRemit > 0 ? `${totalRemit.toFixed(2)}%` : "0%"} / $ ${totalMonthlyRepay > 0 ? formatNumberUS(totalMonthlyRepay) : "0.00"}`}
                        </td>
                      </tr>
                      <tr className="bg-white border-b border-slate-400">
                        <td className="px-3 py-1.5 text-[#143c2e] font-medium border-r border-slate-400 mca-strong">Current Monthly / Daily Repay</td>
                        <td colSpan={2} className="px-3 py-1.5 text-[14px] font-bold text-[#3d5c86] whitespace-nowrap border-r border-slate-400">
                          $ {existingMonthlyRepay > 0 ? formatNumberUS(existingMonthlyRepay) : "0.00"} / $ {existingDailyRepay > 0 ? formatNumberUS(existingDailyRepay) : "0.00"}
                        </td>
                        <td className="px-3 py-1.5 text-[#143c2e] font-medium border-r border-slate-400 mca-strong">Total Monthly / Daily Repay</td>
                        <td colSpan={2} className="px-3 py-1.5 text-[14px] font-bold text-[#3d5c86] whitespace-nowrap">
                          $ {totalMonthlyRepay > 0 ? formatNumberUS(totalMonthlyRepay) : "0.00"} / $ {totalDailyRepay > 0 ? formatNumberUS(totalDailyRepay) : "0.00"}
                        </td>
                      </tr>
                      <tr className="bg-white border-slate-400">
                        <td className="px-3 py-1.5 text-[#143c2e] font-medium border-r border-slate-400 mca-strong">Existing Active Positions</td>
                        <td colSpan={2} className="px-3 py-1.5 text-[14px] font-bold text-blue-500 text-center border-r border-slate-400">
                          {existingActivePositionsCount}
                        </td>
                        <td className="px-3 py-1.5 text-[#143c2e] font-medium border-r border-slate-400 mca-strong">Recent month Leverage</td>
                        <td colSpan={2} className="px-3 py-1.5 text-[14px] font-bold text-[#3d5c86] whitespace-nowrap">
                          {recentMonthLeverage != null
                            ? `${formatNumberUS(recentMonthLeverage)} %`
                            : "-"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );

            const offerBlock = isApproved && (
              <div className="w-full rounded-xl overflow-hidden shadow-md" style={{ border: "1px solid var(--ledgerx-border)" }}>
                <div className="font-semibold text-white uppercase tracking-wide text-[14px] px-4 py-3 rounded-t-lg mca-offer-bar" style={{ ...greenBarStyle() }}>
                  Approved
                </div>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full border-collapse table-fixed min-w-[380px] text-[17px] text-slate-800 [&_td]:px-1.5 [&_td]:py-1.5" style={{ border: "1px solid rgb(100 100 100)", borderTop: "none" }}>
                    <colgroup>
                      <col style={{ width: "25%" }} />
                      <col style={{ width: "25%" }} />
                      <col style={{ width: "25%" }} />
                      <col style={{ width: "25%" }} />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td className="px-2 py-2 border border-slate-400 font-medium text-slate-800 text-left text-[16px]">Offer</td>
                        <td className="px-2 py-2 border border-slate-400 font-bold mca-strong text-left" style={{ color: "#0caa46" }}>
                          {offerVal != null && String(offerVal).trim() !== "" ? `$ ${formatNumberUS(offerVal)}` : "-"}
                        </td>
                        <td className="px-2 py-2 border border-slate-400 font-medium text-slate-800 text-left text-[16px]">Repayment</td>
                        <td className="px-2 py-2 border border-slate-400 font-bold mca-strong text-[#3d5c86] text-left">
                          {Number.isFinite(repaymentTotal) ? `$ ${formatNumberUS(repaymentTotal)}` : "-"}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2 py-2 border border-slate-400 font-medium text-slate-800 text-left text-[16px]">Rate</td>
                        <td className="px-2 py-2 border border-slate-400 font-bold mca-strong text-[#3d5c86] text-left">
                          {rateVal != null && String(rateVal).trim() !== "" ? rateVal : "-"}
                        </td>
                        <td className="px-2 py-2 border border-slate-400 font-medium text-slate-800 text-left text-[16px]">Our Position</td>
                        <td className="px-2 py-2 border border-slate-400 font-bold mca-strong text-[#3d5c86] text-left">
                          {/*
                            Our Position = positions still outstanding + 1. activeCount
                            counts every row with a status (PIF, ONE TIME, REVERSE
                            included); use the ACTIVE-only count Leverage shows.
                          */}
                          {existingActivePositionsCount + 1}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2 py-2 border border-slate-400 font-medium text-slate-800 text-left text-[16px]">Frequency / Repay</td>
                        <td className="px-2 py-2 border border-slate-400 font-bold mca-strong text-[#3d5c86] text-left">
                          {frequencyRepayStr}
                        </td>
                        <td className="px-2 py-2 border border-slate-400 font-medium text-slate-800 text-left text-[16px]">Monthly payment</td>
                        <td className="px-2 py-2 border border-slate-400 font-bold mca-strong text-[#3d5c86] text-left">
                          {monthlyPaymentVal != null && String(monthlyPaymentVal).trim() !== "" ? `$ ${formatNumberUS(monthlyPaymentVal)}` : "-"}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2 py-2 border border-slate-400 font-medium text-slate-800 text-left text-[16px]">Term</td>
                        <td className="px-2 py-2 border border-slate-400 font-bold mca-strong text-[#3d5c86] text-left">
                          {(data?.term ?? approvedOffer?.term) ?? "-"}
                        </td>
                        <td className="px-2 py-2 border border-slate-400 font-medium text-slate-800 text-left text-[16px]">Fees</td>
                        <td className="px-2 py-2 border border-slate-400 font-bold mca-strong text-[#3d5c86] text-left text-[16px]">
                          {(data?.fees ?? approvedOffer?.fees) ?? "10%"}
                        </td>
                      </tr>
                      <tr className="h-[52px]">
                        <td className="px-2 py-2 border border-slate-400 font-medium text-slate-800 text-left align-top text-[16px]">Notes:</td>
                        <td colSpan={3} className="px-2 py-2 border border-slate-400 align-top text-left">
                          <div className="text-[#3d5c86] font-bold space-y-0.5">
                            {(() => {
                              const raw = String(notesDisplay ?? "").trim();
                              if (!raw) return "-";
                              const segments = raw.split(/\s*\|\s*/g).flatMap((seg) => String(seg).split(/\r?\n/));
                              const items = segments
                                .map((line, idx) => {
                                  const trimmed = String(line).trim();
                                  if (!trimmed) return null;
                                  const isBullet = /^[•\-\*]\s/.test(trimmed);
                                  const content = isBullet ? trimmed.replace(/^[•\-\*]\s+/, "") : trimmed;
                                  return (
                                    <div key={idx} className={isBullet ? "pl-4" : ""}>
                                      {isBullet && <span className="text-slate-800" style={{ display: "inline-block", width: "12px" }}>•</span>}
                                      <span style={{ display: "inline" }}>{content || "\u00A0"}</span>
                                    </div>
                                  );
                                })
                                .filter((item) => item !== null);
                              return items.length > 0 ? items : "-";
                            })()}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );

            if (!isApproved) {
              return (
                <div data-email-top-layout="true" style={{ display: "block", width: "100%" }}>
                  <div style={{ display: "block", width: "100%" }}>
                    {remitBlock}
                  </div>
                </div>
              );
            }
            return (
              <div className="mb-6 w-full" data-email-top-layout="true">
                <div className="w-full block">
                  {offerBlock}
                </div>
                <div className="w-full block mt-6">
                  {remitBlock}
                </div>
              </div>
            );
          })()}

          <div style={{ width: "100%", margin: "16px 0 20px" }}>
            <BankMonthlyBarAndPositionsPie
              bankTables={bankTables}
              loanTransferAllocatedByBankAndMonth={loanTransferAllocatedByBankAndMonth}
              privateRoleFundingLoanRule={privateRoleFundingLoanRule}
              ispreview={true}
            />
          </div>

          {bankTables.map((rows, bankIndex) => {
            const rowsWithData = rows.filter(bankRowHasData);
            if (rowsWithData.length === 0) return null;
            const accountLast4 = getLast4Digits(bankAccountNumbers?.[bankIndex]);
            const averages = bankTableAverages(rowsWithData, bankIndex, getDisplayLoan, getDisplayTransfer);
            const displayRows = isArPreview ? sortArBankAnalysisRowsOldestFirstMtdLast(rowsWithData) : rowsWithData;

            // Click-to-sort on Month / Net Credit. Sorts row positions, not the rows
            // themselves, so each row's trend arrow still compares against its
            // chronological neighbour in displayRows.
            const bankSortId = `bank-${bankIndex}`;
            const bankSort = getSort(bankSortId);
            const rowNetCredit = (row) => {
              const total = parseNum(row.totalCredits);
              const parts = [
                getDisplayLoan(bankIndex, row),
                getDisplayTransfer(row),
                parseNum(row.deposite),
                parseNum(row.other),
              ];
              return (
                (Number.isNaN(total) ? 0 : total) -
                parts.reduce((sum, v) => sum + (Number.isNaN(v) ? 0 : v), 0)
              );
            };
            const displayRowIndices = applyPreviewSort(
              displayRows.map((_, i) => i),
              bankSort,
              (i) =>
                bankSort?.column === "netCredit"
                  ? rowNetCredit(displayRows[i])
                  : monthLabelSortValue(displayRows[i]?.month)
            );

            const rowsNonMtd = displayRows.filter((row) => !isMtdMonthLabel(row?.month));

            const avgDisplayLoanForBank = (() => {
              let total = 0;
              rowsNonMtd.forEach((row) => {
                const v = getDisplayLoan(bankIndex, row);
                total += Number.isNaN(v) ? 0 : v;
              });
              return rowsNonMtd.length === 0 ? NaN : total / rowsNonMtd.length;
            })();

            const totalFor = (field) =>
              rowsNonMtd.reduce((sum, row) => {
                const v = parseNum(row?.[field]);
                return sum + (Number.isNaN(v) ? 0 : v);
              }, 0);
            const totalDisplayNetCredit = rowsNonMtd.reduce((sum, row) => {
              const totalCredits = parseNum(row?.totalCredits);
              const effLoan = getDisplayLoan(bankIndex, row);
              const effTransfer = getDisplayTransfer(row);
              const deposite = parseNum(row?.deposite);
              const other = parseNum(row?.other);
              const deductions =
                (Number.isNaN(effLoan) ? 0 : effLoan) +
                (Number.isNaN(effTransfer) ? 0 : effTransfer) +
                (Number.isNaN(deposite) ? 0 : deposite) +
                (Number.isNaN(other) ? 0 : other);
              const currentNet = (Number.isNaN(totalCredits) ? 0 : totalCredits) - deductions;
              return sum + (Number.isNaN(currentNet) ? 0 : currentNet);
            }, 0);
            const bankAnalysisTotalValues = {
              netCredit: totalDisplayNetCredit,
              totalCredits: totalFor("totalCredits"),
              averageDailyBalance: totalFor("averageDailyBalance"),
              nsfNegDays: totalFor("nsfNegDays"),
              lowNegDays: totalFor("lowNegDays"),
            };
            return (
              <div
                key={bankIndex}
                className="rounded-xl border bg-white/90 shadow-lg overflow-hidden no-gradient mca-merged-card"
                style={MERGED_CARD_STYLE}
              >
                <div
                  className="px-2 py-2 text-[14px] font-semibold text-slate-700 backdrop-blur-sm flex items-center justify-between gap-2 mca-merged-bar"
                  style={MERGED_TITLE_STYLE}
                >
                  <span>
                    {`Bank Analysis${bankTables.length > 1 ? ` ${bankIndex + 1}` : ""}` +
                      (accountLast4 ? ` - Account Ending: ${accountLast4}` : "")}
                  </span>
                </div>
                <div className="">
                  <table className="w-full min-w-[520px] text-[14px] border-collapse" style={{ borderColor: "var(--ledgerx-border)" }}>
                    <thead>
                      <tr
                        className="font-semibold bg-(--ledgerx-content-bg) text-slate-500 uppercase tracking-wide text-[14px] border-b no-gradient mca-merged-head-flat"
                        style={MERGED_THEAD_STYLE}
                      >
                        {(isArPreview
                          ? [
                              "Month",
                              "Real Revenue",
                              "Revenue",
                              "Avg Daily Blc",
                              "Low/Neg",
                              "Low Blc. Days",
                            ]
                          : [
                              "Month",
                              "Net Credit",
                              "Funding Amt",
                              "Transfers & other deductions",
                              "Total Credit",
                              "Avg Daily Blc",
                              "NSF/Neg days",
                            ]
                        ).map((label) => {
                          if (label === "Other") return null;
                          const isNetCreditHeader = label === "Net Credit" || label === "Real Revenue";
                          const isNsfOrLow =
                            label === "NSF/Neg days" ||
                            label === "Low/Neg" ||
                            label === "Low Blc. Days";
                          const sortColumn =
                            label === "Month" ? "month" : isNetCreditHeader ? "netCredit" : null;
                          return (
                            <th
                              key={label}
                              className={`px-2 py-2 text-left${sortColumn ? " cursor-pointer select-none" : ""}`}
                              style={
                                isNetCreditHeader
                                  ? { backgroundColor: "#e6f0ff" }
                                  : isNsfOrLow
                                  ? { backgroundColor: "var(--ledgerx-alert-bg)" }
                                  : undefined
                              }
                              {...(sortColumn ? sortableThProps(bankSortId, sortColumn, toggleSort) : {})}
                            >
                              {label}
                              {sortColumn && <SortIndicator sort={bankSort} column={sortColumn} />}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRowIndices.map((ri) => {
                        const row = displayRows[ri];
                        const monthLabel = row?.month && String(row.month).trim();
                        // Net credit = total - (loan + transfer + deposit + other); loan includes allocated Positions amount. Show value even when negative.
                        const totalCredits = parseNum(row.totalCredits);
                        const effLoan = getDisplayLoan(bankIndex, row);
                        const effTransfer = getDisplayTransfer(row);
                        const deposite = parseNum(row.deposite);
                        const other = parseNum(row.other);
                        const totalForNet = Number.isNaN(totalCredits) ? 0 : totalCredits;
                        const deductions =
                          (Number.isNaN(effLoan) ? 0 : effLoan) +
                          (Number.isNaN(effTransfer) ? 0 : effTransfer) +
                          (Number.isNaN(deposite) ? 0 : deposite) +
                          (Number.isNaN(other) ? 0 : other);
                        const currentNet = totalForNet - deductions;

                        // Trend vs prior calendar month: AR = oldest-first so prior month is row above; Wd = row below is prior month in display order
                        const priorMonthRow = isArPreview
                          ? ri > 0
                            ? displayRows[ri - 1]
                            : null
                          : ri < displayRows.length - 1
                            ? displayRows[ri + 1]
                            : null;
                        let prevNet = NaN;
                        if (priorMonthRow) {
                          const pTotal = parseNum(priorMonthRow.totalCredits);
                          const pHasTotal = !Number.isNaN(pTotal) && pTotal > 0;
                          const pLoan = getDisplayLoan(bankIndex, priorMonthRow);
                          const pTransfer = getDisplayTransfer(priorMonthRow);
                          const pDep = parseNum(priorMonthRow.deposite);
                          const pOther = parseNum(priorMonthRow.other);
                          const pDeductions =
                            (Number.isNaN(pLoan) ? 0 : pLoan) +
                            (Number.isNaN(pTransfer) ? 0 : pTransfer) +
                            (Number.isNaN(pDep) ? 0 : pDep) +
                            (Number.isNaN(pOther) ? 0 : pOther);
                          prevNet = pHasTotal ? pTotal - pDeductions : NaN;
                        }

                        const hasTrend =
                          priorMonthRow &&
                          !Number.isNaN(currentNet) &&
                          !Number.isNaN(prevNet);
                        const diff = hasTrend ? currentNet - prevNet : 0;

                        const netCreditStr =
                          Number.isNaN(currentNet)
                            ? "-"
                            : `$ ${formatNumberUS(currentNet)}`;
                        // Use only the stored Avg Daily Blc from bank analysis data; do not auto‑derive from Net Credit here.
                        const rowAvgDaily = parseNum(row.averageDailyBalance);
                        const avgDailyStr =
                          !Number.isNaN(rowAvgDaily)
                            ? `$ ${formatNumberUS(rowAvgDaily)}`
                            : "-";
                        return (
                          <tr
                            key={ri}
                            className="border-b"
                            style={{ borderColor: "var(--ledgerx-border)" }}
                          >
                            {(isArPreview
                              ? [
                                  "month",
                                  "netCredit",
                                  "totalCredits",
                                  "averageDailyBalance",
                                  "nsfNegDays",
                                  "lowNegDays",
                                ]
                              : ["month", "netCredit", "loan", "transfer", "totalCredits", "averageDailyBalance", "nsfNegDays"]
                            ).map((key) => {
                              if (key === "other") return null;
                              const isNet = key === "netCredit";
                              const isNsfOrLow = key === "nsfNegDays" || key === "lowNegDays";
                              const isAvgDaily = key === "averageDailyBalance";
                              const isLoan = key === "loan";
                              const isTransfer = key === "transfer";
                              let content;
                              if (isNet) {
                                content = (
                                  <NetCreditWithTrend value={netCreditStr} hasTrend={hasTrend} diff={diff} />
                                );
                              } else if (isAvgDaily) {
                                content = avgDailyStr;
                              } else if (isLoan) {
                                const loanVal = getDisplayLoan(bankIndex, row);
                                content =
                                  !Number.isNaN(loanVal) && loanVal !== 0
                                    ? `$ ${formatNumberUS(loanVal)}`
                                    : "-";
                              } else if (isTransfer) {
                                const transferVal = getDisplayTransfer(row);
                                content =
                                  !Number.isNaN(transferVal) && transferVal !== 0
                                    ? `$ ${formatNumberUS(transferVal)}`
                                    : "-";
                              } else {
                                content = cellValue(row, key);
                              }
                              return (
                                <td
                                  key={key}
                                  className="px-2 py-2.5 text-slate-700"
                                  style={
                                    isNet
                                      ? { backgroundColor: "#ebf3ff" }
                                      : isNsfOrLow
                                      ? { backgroundColor: "var(--ledgerx-alert-bg)" }
                                      : undefined
                                  }
                                >
                                  {content}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    {displayRows.length > 0 && (
                      <tfoot>
                        <tr className="font-semibold text-slate-800 mca-summary-row">
                          <td className="px-2 py-2 border-t leading-tight" style={{ borderColor: "var(--ledgerx-border)" }}>
                            <div>AVERAGE</div>
                            <div className="text-[11px] font-medium text-slate-500">(MTD Not counted)</div>
                          </td>
                          {(isArPreview
                            ? [
                                "netCredit",
                                "totalCredits",
                                "averageDailyBalance",
                                "nsfNegDays",
                                "lowNegDays",
                              ]
                            : ["netCredit", "loan", "transfer", "totalCredits", "averageDailyBalance", "nsfNegDays"]
                          ).map((f) => (
                            <td
                              key={f}
                              className="px-2 py-2 border-t"
                              style={{
                                borderColor: "var(--ledgerx-border)",
                                ...(f === "netCredit" ? { backgroundColor: "#e6f0ff" }
                                   : f === "nsfNegDays" || f === "lowNegDays" ? { backgroundColor: "var(--ledgerx-alert-bg)" } : {}),
                              }}
                              >
                              {f === "netCredit"
                                ? (averages.netCredit != null && !Number.isNaN(averages.netCredit)
                                    ? `$ ${formatNumberUS(averages.netCredit)}`
                                    : "-")
                                : f === "averageDailyBalance"
                                  ? (averages[f] != null && !Number.isNaN(averages[f])
                                      ? `$ ${formatNumberUS(averages[f])}`
                                      : "-")
                                  : f === "loan"
                                    ? (!Number.isNaN(avgDisplayLoanForBank)
                                        ? `$ ${formatNumberUS(avgDisplayLoanForBank)}`
                                        : "-")
                                    : Number.isNaN(averages[f])
                                      ? "-"
                                      : CURRENCY_KEYS.includes(f)
                                        ? `$ ${formatNumberUS(averages[f])}`
                                        : String(Math.round(averages[f]))}
                            </td>
                          ))}
                        </tr>
                        {isArPreview && (
                          <tr className="font-semibold text-slate-800 mca-summary-row">
                            <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>TOTAL</td>
                            {[
                              "netCredit",
                              "totalCredits",
                              "averageDailyBalance",
                              "nsfNegDays",
                              "lowNegDays",
                            ].map((f) => (
                              <td
                                key={`total-${f}`}
                                className="px-2 py-2 border-t"
                                style={{
                                  borderColor: "var(--ledgerx-border)",
                                  ...(f === "netCredit"
                                    ? { backgroundColor: "#e6f0ff" }
                                    : f === "nsfNegDays" || f === "lowNegDays"
                                    ? { backgroundColor: "var(--ledgerx-alert-bg)" }
                                    : {}),
                                }}
                              >
                                {f === "nsfNegDays" || f === "lowNegDays"
                                  ? (bankAnalysisTotalValues[f] === 0
                                      ? "-"
                                      : String(Math.round(bankAnalysisTotalValues[f])))
                                  : bankAnalysisTotalValues[f] === 0
                                    ? "-"
                                    : `$ ${formatNumberUS(bankAnalysisTotalValues[f])}`}
                              </td>
                            ))}
                          </tr>
                        )}
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            );
          })}

          {(() => {
            const activeBankMonths = new Set(
              Array.isArray(bankTables)
                ? bankTables.flatMap((rows) =>
                    (rows || [])
                      .filter((r) => bankRowHasData(r))
                      .map((r) => String(r?.month || "").trim().toLowerCase())
                  )
                : []
            );
            const bankTotalWithData = bankTotalRows.filter((row) =>
              activeBankMonths.has(String(row?.month || "").trim().toLowerCase())
            );
            if (bankTotalWithData.length === 0) return null;

            // Only show Bank Total when more than one bank has data.
            // Count how many individual bank tables actually have data rows.
            const banksWithDataCount = Array.isArray(bankTables)
              ? bankTables.reduce((count, rows) => {
                  if (!Array.isArray(rows)) return count;
                  const hasData = rows.some(bankRowHasData);
                  return hasData ? count + 1 : count;
                }, 0)
              : 0;

            if (banksWithDataCount < 2) return null;

            const avgBankTotalLoan = Number(bankTotalAverages?.loan);
            const displayBankTotalRows = isArPreview ? sortArBankAnalysisRowsOldestFirstMtdLast(bankTotalWithData) : bankTotalWithData;
            const bankTotalRowsNonMtd = displayBankTotalRows.filter((row) => !isMtdMonthLabel(row?.month));
            const bankTotalSums = {
              netCredit: bankTotalRowsNonMtd.reduce((sum, row) => {
                const v = parseNum(row?.netCredit);
                return sum + (Number.isNaN(v) ? 0 : v);
              }, 0),
              totalCredits: bankTotalRowsNonMtd.reduce((sum, row) => {
                const v = parseNum(row?.totalCredits);
                return sum + (Number.isNaN(v) ? 0 : v);
              }, 0),
              averageDailyBalance: bankTotalRowsNonMtd.reduce((sum, row) => {
                const v = parseNum(row?.averageDailyBalance);
                return sum + (Number.isNaN(v) ? 0 : v);
              }, 0),
              nsfNegDays: bankTotalRowsNonMtd.reduce((sum, row) => {
                const v = parseNum(row?.nsfNegDays);
                return sum + (Number.isNaN(v) ? 0 : v);
              }, 0),
              lowNegDays: bankTotalRowsNonMtd.reduce((sum, row) => {
                const v = parseNum(row?.lowNegDays);
                return sum + (Number.isNaN(v) ? 0 : v);
              }, 0),
            };

            return (
            <div
              className="rounded-xl border bg-white/90 shadow-lg overflow-hidden no-gradient mca-merged-card"
              style={MERGED_CARD_STYLE}
            >
            <div
              className="px-2 py-2 text-[14px] font-semibold backdrop-blur-sm mca-merged-bar"
              style={{ ...MERGED_TITLE_STYLE, color: "#334155" }}
            >
              Bank Total
            </div>
            <div className="">
              <table className="w-full min-w-[520px] text-[14px] border-collapse" style={{ borderColor: "var(--ledgerx-border)" }}>
                    <thead>
                  <tr
                    className="font-semibold text-slate-500 uppercase tracking-wide text-[14px] border-b bg-(--ledgerx-content-bg) no-gradient mca-merged-head-flat"
                    style={MERGED_THEAD_STYLE}
                  >
                    <th
                      className="px-3 py-2 text-left cursor-pointer select-none"
                      {...sortableThProps("bankTotal", "month", toggleSort)}
                    >
                      Month
                      <SortIndicator sort={getSort("bankTotal")} column="month" />
                    </th>
                    <th
                      className="px-3 py-2 text-left cursor-pointer select-none"
                      style={{ backgroundColor: "#e6f0ff" }}
                      {...sortableThProps("bankTotal", "netCredit", toggleSort)}
                    >
                      {isArPreview ? "Real Revenue" : "Net Credit"}
                      <SortIndicator sort={getSort("bankTotal")} column="netCredit" />
                    </th>
                    {/* <th className="px-3 py-2 text-left">Daily Repay</th> */}
                    {!isArPreview && <th className="px-3 py-2 text-left">Funding Amt</th>}
                    {!isArPreview && <th className="px-3 py-2 text-left">Transfers & other deductions</th>}
                    {/* <th className="px-3 py-2 text-left">Unverified Deposit</th> */}

                    <th className="px-3 py-2 text-left">{isArPreview ? "Revenue" : "Total Credit"}</th>
                    <th className="px-3 py-2 text-left">Avg Daily Blc.</th>
                    <th
                      className="px-3 py-2 text-left"
                      style={{ backgroundColor: "var(--ledgerx-alert-bg)" }}
                    >
                      {isArPreview ? "Low/Neg" : "NSF/Neg days"}
                    </th>
                    {isArPreview && (
                      <th
                        className="px-3 py-2 text-left"
                        style={{ backgroundColor: "var(--ledgerx-alert-bg)" }}
                      >
                        Low Blc Days
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {applyPreviewSort(
                    displayBankTotalRows.map((_, i) => i),
                    getSort("bankTotal"),
                    (i) =>
                      getSort("bankTotal")?.column === "netCredit"
                        ? parseNum(displayBankTotalRows[i]?.netCredit)
                        : monthLabelSortValue(displayBankTotalRows[i]?.month)
                  ).map((index) => {
                    const row = displayBankTotalRows[index];
                    // AR = oldest-first → prior month is row above; Wd = row below is prior month in display order.
                    // NOTE: bankTotalRows.netCredit is already AFTER MCA deductions, so we use it directly here.
                    const priorMonthRow = isArPreview
                      ? index > 0
                        ? displayBankTotalRows[index - 1]
                        : null
                      : index < displayBankTotalRows.length - 1
                        ? displayBankTotalRows[index + 1]
                        : null;
                    const currentDisplayNet = parseNum(row.netCredit);
                    const prevDisplayNet = priorMonthRow ? parseNum(priorMonthRow.netCredit) : NaN;
                    const hasTrend =
                      priorMonthRow &&
                      !Number.isNaN(currentDisplayNet) &&
                      !Number.isNaN(prevDisplayNet);
                    const diff = hasTrend ? currentDisplayNet - prevDisplayNet : 0;
                    const netCreditDisplayStr =
                      row.netCredit != null && !Number.isNaN(currentDisplayNet)
                        ? `$ ${formatNumberUS(currentDisplayNet)}`
                        : "-";
                    const avgDailyStr =
                      row.averageDailyBalance != null &&
                      !Number.isNaN(row.averageDailyBalance)
                        ? `$ ${formatNumberUS(row.averageDailyBalance)}`
                        : "-";
                    return (
                      <tr
                        key={row.id}
                        className="border-b"
                        style={{ borderColor: "var(--ledgerx-border)" }}
                      >
                        <td className="px-3 py-2 text-slate-700">{row.month}</td>
                        <td
                          className="px-3 py-2 text-slate-700"
                          style={{ backgroundColor: "#ebf3ff" }}
                        >
                          <NetCreditWithTrend value={netCreditDisplayStr} hasTrend={hasTrend} diff={diff} />
                        </td>
                        {/* <td className="px-3 py-2 text-slate-700">{row.dailyRepay != null && row.dailyRepay > 0 ? `$ ${formatNumberUS(row.dailyRepay)}` : "-"}</td> */}
                        {!isArPreview && (
                          <td className="px-3 py-2 text-slate-700">
                            {row.loan > 0
                              ? `$ ${formatNumberUS(row.loan)}`
                              : "-"}
                          </td>
                        )}
                        {!isArPreview && (
                          <td className="px-3 py-2 text-slate-700">
                            {row.transfer > 0
                              ? `$ ${formatNumberUS(row.transfer)}`
                              : "-"}
                          </td>
                        )}
                        {/* <td className="px-3 py-2 text-slate-700">
                          {row.deposite > 0
                            ? `$ ${formatNumberUS(row.deposite)}`
                            : "-"}
                        </td> */}
                        
                        <td className="px-3 py-2 text-slate-700">
                          {row.totalCredits > 0
                            ? `$ ${formatNumberUS(row.totalCredits)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {avgDailyStr}
                        </td>
                        <td
                          className="px-3 py-2 text-slate-700"
                          style={{ backgroundColor: "var(--ledgerx-alert-bg)" }}
                        >
                          {row.nsfNegDays != null && row.nsfNegDays > 0
                            ? String(row.nsfNegDays)
                            : "-"}
                        </td>
                        {isArPreview && (
                          <td
                            className="px-3 py-2 text-slate-700"
                            style={{ backgroundColor: "var(--ledgerx-alert-bg)" }}
                          >
                            {row.lowNegDays != null && row.lowNegDays > 0
                              ? String(row.lowNegDays)
                              : "-"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {displayBankTotalRows.length > 0 && (
                  <tfoot>
                    <tr className="font-semibold text-slate-800 mca-summary-row">
                      <td className="px-3 py-2 border-t leading-tight" style={{ borderColor: "var(--ledgerx-border)" }}>
                        <div>AVERAGE</div>
                        <div className="text-[11px] font-medium text-slate-500">(MTD Not counted)</div>
                      </td>
                      <td
                        className="px-3 py-2 border-t"
                        style={{ borderColor: "var(--ledgerx-border)", backgroundColor: "#e6f0ff" }}
                      >
                        {bankTotalAverages.netCredit != null && !Number.isNaN(bankTotalAverages.netCredit)
                          ? `$ ${formatNumberUS(bankTotalAverages.netCredit)}`
                          : "-"}
                      </td>
                      
                      {!isArPreview && (
                        <td className="px-3 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>{Number.isNaN(avgBankTotalLoan) ? "-" : `$ ${formatNumberUS(avgBankTotalLoan)}`}</td>
                      )}
                      {!isArPreview && (
                        <td className="px-3 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>{Number.isNaN(bankTotalAverages.transfer) ? "-" : `$ ${formatNumberUS(bankTotalAverages.transfer)}`}</td>
                      )}
                      {/* <td className="px-3 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>{Number.isNaN(bankTotalAverages.deposite) ? "-" : `$ ${formatNumberUS(bankTotalAverages.deposite)}`}</td> */}

                      <td className="px-3 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>{Number.isNaN(bankTotalAverages.totalCredits) ? "-" : `$ ${formatNumberUS(bankTotalAverages.totalCredits)}`}</td>
                      <td className="px-3 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                        {bankTotalAverages.averageDailyBalance != null && !Number.isNaN(bankTotalAverages.averageDailyBalance)
                          ? `$ ${formatNumberUS(bankTotalAverages.averageDailyBalance)}`
                          : "-"}
                      </td>
                      <td
                        className="px-3 py-2 border-t"
                        style={{ borderColor: "var(--ledgerx-border)", backgroundColor: "var(--ledgerx-alert-bg)" }}
                      >
                        {Number.isNaN(bankTotalAverages.nsfNegDays) ? "-" : String(Math.round(bankTotalAverages.nsfNegDays))}
                      </td>
                      {isArPreview && (
                        <td
                          className="px-3 py-2 border-t"
                          style={{ borderColor: "var(--ledgerx-border)", backgroundColor: "var(--ledgerx-alert-bg)" }}
                        >
                          {Number.isNaN(bankTotalAverages.lowNegDays) ? "-" : String(Math.round(bankTotalAverages.lowNegDays))}
                        </td>
                      )}
                    </tr>
                    {isArPreview && (
                      <tr className="font-semibold text-slate-800 mca-summary-row">
                        <td className="px-3 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>TOTAL</td>
                        <td
                          className="px-3 py-2 border-t"
                          style={{ borderColor: "var(--ledgerx-border)", backgroundColor: "#e6f0ff" }}
                        >
                          {bankTotalSums.netCredit === 0 ? "-" : `$ ${formatNumberUS(bankTotalSums.netCredit)}`}
                        </td>
                        <td className="px-3 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                          {bankTotalSums.totalCredits === 0 ? "-" : `$ ${formatNumberUS(bankTotalSums.totalCredits)}`}
                        </td>
                        <td className="px-3 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                          {bankTotalSums.averageDailyBalance === 0 ? "-" : `$ ${formatNumberUS(bankTotalSums.averageDailyBalance)}`}
                        </td>
                        <td
                          className="px-3 py-2 border-t"
                          style={{ borderColor: "var(--ledgerx-border)", backgroundColor: "var(--ledgerx-alert-bg)" }}
                        >
                          {bankTotalSums.nsfNegDays === 0 ? "-" : String(Math.round(bankTotalSums.nsfNegDays))}
                        </td>
                        <td
                          className="px-3 py-2 border-t"
                          style={{ borderColor: "var(--ledgerx-border)", backgroundColor: "var(--ledgerx-alert-bg)" }}
                        >
                          {bankTotalSums.lowNegDays === 0 ? "-" : String(Math.round(bankTotalSums.lowNegDays))}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>
          </div>
            );
          })()}

          <div
            className="rounded-xl border bg-white/90 shadow-lg overflow-hidden no-gradient mca-merged-card mca-band-tall"
            style={MERGED_CARD_STYLE}
          >
            <div
              className="px-2 py-2 text-[14px] font-semibold text-slate-700 backdrop-blur-sm mca-merged-bar"
              style={MERGED_TITLE_STYLE}
            >
              Positions
            </div>
            {positionsForPreviewTable.length === 0 ? (
              <div className="px-4 py-4 text-[12px] text-slate-600">No positions.</div>
            ) : (
            <div className="">
              <table className="w-full text-[14px] border-collapse" style={{ borderColor: "var(--ledgerx-border)" }}>
                <thead>
                  <tr
                    className="font-semibold text-slate-500 uppercase tracking-wide text-[14px] border-b bg-(--ledgerx-content-bg) no-gradient mca-merged-head-flat"
                    style={MERGED_THEAD_STYLE}
                  >
                    {isArPreview ? (
                      <>
                        <th className="px-2 py-2 text-left">Start Date</th>
                        <th
                          className="px-2 py-2 text-left cursor-pointer select-none"
                          {...sortableThProps("positions", "month", toggleSort)}
                        >
                          Month
                          <SortIndicator sort={getSort("positions")} column="month" />
                        </th>
                        <th className="px-2 py-2 text-left">Funder</th>
                        <th className="px-2 py-2 text-left">Type of advance</th>
                        <th className="px-2 py-2 text-left">Amount</th>
                        <th className="px-2 py-2 text-left">Repay</th>
                        <th className="px-2 py-2 text-left">Remit</th>
                        <th className="px-2 py-2 text-left">Freq</th>
                        <th className="px-2 py-2 text-left">Date: Last Repay</th>
                      </>
                    ) : (
                      <>
                        <th
                          className="px-2 py-2 text-left cursor-pointer select-none"
                          {...sortableThProps("positions", "month", toggleSort)}
                        >
                          Month
                          <SortIndicator sort={getSort("positions")} column="month" />
                        </th>
                        <th className="px-2 py-2 text-left">Start Date</th>
                        <th className="px-2 py-2 text-left">Lender</th>
                        <th className="px-2 py-2 text-left">Amount Funded</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-left">Frequency</th>
                        <th className="px-2 py-2 text-left">Repayment</th>
                        <th className="px-2 py-2 text-left">Date: Last Repay</th>
                        <th className="px-2 py-2 text-left">Est. MCA % Paid</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {groupedPositionsForPreviewTable.map((row, i) => {
                    const isPif = row.statusUpper === "PIF" || String(row.status || "").trim().toUpperCase() === "PIF";
                    const isAlertRow =
                      row.statusUpper === "RECOVERY" ||
                      row.statusUpper === "STOP" ||
                      row.statusUpper === "LOWER" ||
                      String(row.status || "").trim().toUpperCase() === "RECOVERY" ||
                      String(row.status || "").trim().toUpperCase() === "STOP" ||
                      String(row.status || "").trim().toUpperCase() === "LOWER";
                    const groupBackground =
                      row.monthGroupIndex % 2 === 0 ? "#f3f4f6" : "#ffffff";
                    // Per-cell backgrounds required: <tr> bg does not reliably paint behind <td> in table layout.
                    const arCellBackground = isPif
                      ? "#abffab24"
                      : isAlertRow
                        ? "var(--ledgerx-alert-bg2)"
                        : groupBackground;
                    return (
                      <tr
                        data-mca-month-band="1"
                        key={i}
                        className="border-b"
                        style={{
                          borderColor: "var(--ledgerx-border)",
                        }}
                      >
                        {isArPreview ? (
                          <>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: arCellBackground }}>
                              {row.startDateLabel}
                            </td>
                            <td
                              className="px-2 py-2.5 text-slate-700 font-medium align-top"
                              style={{ backgroundColor: arCellBackground }}
                            >
                              {row.showMonth ? row.monthLabel : ""}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: arCellBackground }}>
                              {row.lender || "-"}
                            </td>
                            <td
                              className="px-2 py-2.5 font-medium"
                              style={{
                                backgroundColor: arCellBackground,
                                color: isPif ? "#15803d" : isAlertRow ? "#b45309" : "#334155",
                              }}
                            >
                              {row.statusLabel}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: arCellBackground }}>
                              {row.amountFunded ? `$ ${formatNumberUS(row.amountFunded)}` : "-"}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: arCellBackground }}>
                              {row.installment ? `$ ${formatNumberUS(row.installment)}` : "-"}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: arCellBackground }}>
                              {row.mcaRemit ? `${formatNumberUS(row.mcaRemit)}%` : "-"}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: arCellBackground }}>
                              {row.frequency || "-"}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: arCellBackground }}>
                              {row.lastPaymentDateLabel}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-2.5 text-slate-700 font-medium align-top" style={{ backgroundColor: isPif ? "rgba(171, 255, 171, 0.14)" : groupBackground }}>
                              {row.showMonth ? row.monthLabel : ""}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: isPif ? "rgba(171, 255, 171, 0.14)" : groupBackground }}>
                              {row.startDateLabel}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: isPif ? "rgba(171, 255, 171, 0.14)" : groupBackground }}>
                              {row.lenderLabel}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: isPif ? "rgba(171, 255, 171, 0.14)" : groupBackground }}>
                              {row.amountFundedLabel}
                            </td>
                            <td
                              className="px-2 py-2.5 font-medium"
                              style={{
                                backgroundColor: isPif ? "rgba(171, 255, 171, 0.14)" : groupBackground,
                                color: isPif ? "#15803d" : isAlertRow ? "#b45309" : "#334155",
                              }}
                            >
                              {row.statusLabel}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: isPif ? "rgba(171, 255, 171, 0.14)" : groupBackground }}>
                              {row.frequencyLabel}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: isPif ? "rgba(171, 255, 171, 0.14)" : groupBackground }}>
                              {row.repaymentLabel}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: isPif ? "rgba(171, 255, 171, 0.14)" : groupBackground }}>
                              {row.lastPaymentDateLabel}
                            </td>
                            <td className="px-2 py-2.5 text-slate-700" style={{ backgroundColor: isPif ? "rgba(171, 255, 171, 0.14)" : groupBackground }}>
                              {row.mcaPercentPaidLabel}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {positionsForGrandTotal.length > 0 && (
                  <tfoot>
                    <tr className="font-semibold text-slate-800 mca-summary-row">
                      {isArPreview ? (
                        <>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            -
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            TOTAL
                          </td>
                          <td className="px-2 py-2 border-t text-slate-500" style={{ borderColor: "var(--ledgerx-border)" }}>
                            -
                          </td>
                          <td className="px-2 py-2 border-t text-slate-500" style={{ borderColor: "var(--ledgerx-border)" }}>
                            -
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            {grandTotalAmountFundedSum > 0 ? `$ ${formatNumberUS(grandTotalAmountFundedSum)}` : "-"}
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            {grandTotalRepaymentSum > 0 ? `$ ${formatNumberUS(grandTotalRepaymentSum)}` : "-"}
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            {grandTotalMcaRemitSum > 0 ? `${formatNumberUS(grandTotalMcaRemitSum)} %` : "-"}
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            -
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            -
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            TOTAL
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            -
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            -
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            {grandTotalAmountFundedSum > 0 ? `$ ${formatNumberUS(grandTotalAmountFundedSum)}` : "-"}
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            -
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            -
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            {grandTotalRepaymentSum > 0 ? `$ ${formatNumberUS(grandTotalRepaymentSum)}` : "-"}
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            -
                          </td>
                          <td className="px-2 py-2 border-t" style={{ borderColor: "var(--ledgerx-border)" }}>
                            {grandTotalMcaPercentPaidSum > 0 ? `${formatNumberUS(grandTotalMcaPercentPaidSum)} %` : "-"}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            )}
          </div>

          <AdditionalInfoPreview value={additionalInfo} className="mb-6" />

          {/* Notes Section – only show when there are notes or legal screenshots */}
          {(() => {
            const hasLegalCheck = isDisplayableLegalCheck(currentNote?.legalCheck);
            const hasLegalComment = !isEmptyNoteText(currentNote?.legalComment);
            const hasOtherNotes = sanitizeNoteTextList(currentNote?.otherNotes).length > 0;
            const hasScreenshots = Array.isArray(currentNote?.legalScreenshots) && currentNote.legalScreenshots.length > 0;
            const courtCasesList = Array.isArray(currentNote?.courtCases) ? currentNote.courtCases : [];
            const hasCourtCases = courtCasesList.length > 0;
            const hasNotesFromApi = notesFromApi != null && String(notesFromApi).trim() !== "";
            const hasAnyNotes = hasLegalCheck || hasLegalComment || hasOtherNotes || hasScreenshots || hasNotesFromApi || hasCourtCases;
            if (!hasAnyNotes) return null;

            const screenshotUrls = currentNote?.legalScreenshots ?? [];
            const screenshotNames = currentNote?.legalScreenshotNames ?? [];

            return (
          <div
            className="rounded-xl border bg-white/90 shadow-lg overflow-hidden no-gradient mca-merged-card"
            style={MERGED_CARD_STYLE}
          >
            <div
              className="px-4 py-2 text-[14px] font-semibold text-slate-700 mca-merged-bar"
              style={MERGED_TITLE_STYLE}
            >
              Notes
            </div>
            <div className="flex flex-col gap-2 px-4 py-3 text-[14px] text-slate-800" style={{ display: "block" }}>
              {(hasLegalCheck || hasLegalComment || hasOtherNotes) ? (
                <>
                  {hasLegalCheck && (
                    <div style={{ display: "block", marginBottom: "14px", lineHeight: "1.6", width: "100%" }}>
                      <span className="font-semibold text-slate-700" style={{ display: "inline" }}>Legal Check: </span>
                      <span className="text-slate-700" style={{ display: "inline" }}>
                        {formatLegalCheckLabel(currentNote.legalCheck)}
                      </span>
                    </div>
                  )}
                  {hasLegalComment && (
                    <div className="" style={{ display: "block", marginBottom: "14px", lineHeight: "1.6", width: "100%" }}>
                      <span className="font-semibold text-slate-700" style={{ display: "inline" }}>Comment: </span>
                      <span className="text-slate-700" style={{ whiteSpace: "pre-wrap", display: "block", marginTop: "4px" }}>
                        <NoteCommentDisplay value={currentNote.legalComment} />
                      </span>
                    </div>
                  )}
                  {hasOtherNotes && (
                    <div className="" style={{ display: "block", marginBottom: "14px", lineHeight: "1.6", width: "100%" }}>
                      <span className="font-semibold text-slate-700" style={{ display: "inline" }}>Other Notes: </span>
                      <span className="text-slate-700" style={{ whiteSpace: "pre-wrap", display: "block", marginTop: "4px" }}>
                        {sanitizeNoteTextList(currentNote.otherNotes).map((note, i) => (
                          <NoteCommentDisplay key={i} value={note} style={{ marginBottom: i === sanitizeNoteTextList(currentNote.otherNotes).length - 1 ? 0 : 8 }} />
                        ))}
                      </span>
                    </div>
                  )}
                </>
              ) : hasNotesFromApi ? (
                <div className="text-slate-700" style={{ display: "block", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{notesFromApi}</div>
              ) : null}

                {hasCourtCases && (
                  <div style={{ display: "block", marginBottom: "14px", lineHeight: "1.6", width: "100%" }}>
                    <span className="font-semibold text-slate-700" style={{ display: "block", marginBottom: "4px" }}>Court case links:</span>
                    {courtCasesList.map((c, i) => {
                      const href = c?.url ? (/^https?:\/\//i.test(c.url) ? c.url : `https://${c.url}`) : "";
                      const label = [c?.caseNumber, c?.court].filter(Boolean).join(" · ") || c?.caption || c?.url || `Case ${i + 1}`;
                      return (
                        <div key={i} style={{ display: "block", marginBottom: "4px" }}>
                          <span className="text-slate-700">{i + 1}. {label}</span>
                          {c?.caption ? <span style={{ display: "block", color: "#64748b" }}>{c.caption}</span> : null}
                          {href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "block", color: "#4338ca", wordBreak: "break-all" }}>{href}</a> : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {hasScreenshots && (
                <div className="pt-2 border-t" style={{ borderColor: "var(--ledgerx-border)", display: "block", marginTop: "14px", paddingTop: "14px" }}>
                  <div className="font-semibold text-[14px] text-slate-700 mb-2" style={{ display: "block", marginBottom: "14px" }}>Legal case screenshots & attachments</div>
                  <div className="flex flex-wrap gap-4" style={{ display: "block" }}>
                    {screenshotUrls.map((url, idx) => (
                        <div
                      key={idx}
                      className="flex flex-col gap-1"
                      style={{
                        display: "inline-block",
                        marginRight: "16px",
                        marginBottom: "14px",
                        verticalAlign: "top",
                        maxWidth: "520px",
                        width: "520px",
                      }}
                    >
                        {(() => {
                          const name = screenshotNames[idx] || `Attachment ${idx + 1}`;
                          const lowerName = String(name).toLowerCase();
                          const lowerUrl = String(url || "").toLowerCase();
                          const isDocument =
                            /\.(pdf|doc|docx)$/i.test(lowerName) ||
                            /\.(pdf|doc|docx)$/i.test(lowerUrl);

                          if (isDocument) {
                            return (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center px-2 py-2 text-[14px] font-medium text-blue-700 bg-slate-50 border rounded"
                                style={{ borderColor: "var(--ledgerx-border)", maxWidth: "300px", wordBreak: "break-all" }}
                              >
                                {name}
                              </a>
                            );
                          }

                          return (
                            <>
                              <img
                                src={url}
                                alt={name}
                                className="object-contain rounded border bg-slate-50 cursor-pointer hover:opacity-90"
                                style={{
                                  borderColor: "var(--ledgerx-border)",
                                  width: "100%",
                                  maxWidth: "520px",
                                  maxHeight: "360px",
                                  height: "auto",
                                  display: "block",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "4px",
                                }}
                                onClick={() => setActiveScreenshotIndex(idx)}
                              />
                              {name && (
                                <span
                                  className="text-[14px] text-slate-500 truncate"
                                  style={{ display: "block", marginTop: "4px", maxWidth: "520px" }}
                                  title={name}
                                >
                                  {name}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
            );
          })()}
          
            {/* Signature / created-by footer */}
            {user?.role !== "uw" && user?.role !== "private" && (
              <div className="mt-6 flex justify-start">
                <div className="text-[18px] text-slate-600 font-bold">
                  {createdBy?.fullName
                    ? `Signed by: ${
                        createdBy.fullName
                          .toUpperCase()
                          .slice(0, 1) +
                        createdBy.fullName.slice(1).toLowerCase()
                      }`
                    : "-"}
                </div>
              </div>
            )}
          </div>
        </div>

        {activeScreenshotIndex != null && currentNote?.legalScreenshots?.[activeScreenshotIndex] && (
          <div
            className="fixed inset-0 flex items-center justify-center bg-black/70"
            style={{ zIndex: WD_PREVIEW_MODAL_Z_INDEX + 1 }}
            onClick={() => setActiveScreenshotIndex(null)}
          >
            <div
              className="relative max-w-5xl max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={currentNote.legalScreenshots[activeScreenshotIndex]}
                alt={
                  currentNote.legalScreenshotNames?.[activeScreenshotIndex] ||
                  `Attachment ${activeScreenshotIndex + 1}`
                }
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl bg-white"
              />
              <button
                type="button"
                onClick={() => setActiveScreenshotIndex(null)}
                className="absolute -top-3 -right-3 rounded-full bg-white text-slate-700 text-xs font-semibold px-2 py-1 shadow-md"
              >
                X
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    portalRoot,
  );
}
