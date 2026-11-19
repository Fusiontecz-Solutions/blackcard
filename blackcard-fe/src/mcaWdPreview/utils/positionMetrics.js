/**
 * Position table metrics: Active count (ACTIVE + REFI), Existing Remit, Total Monthly/Daily from positions.
 * Single source of truth for summary blocks in OfferDecisionToggle and BankAnalysisPreviewModal.
 */

import { parseMonthLabelToYYYYMM } from "./calculateMonthlyNetCredit";

function parseNum(str) {
  if (str == null || String(str).trim() === "") return NaN;
  return Number(String(str).replace(/[^0-9.-]+/g, ""));
}

/** PIF installments are shown in the table but excluded from REPAYMENT footer totals. */
export function isRepaymentExcludedFromPositionsTotal(row) {
  const status = String(row?.status || "").trim().toUpperCase();
  return status === "PIF";
}

/** Sum installment/repayment for positions table TOTAL row (excludes PIF only). */
export function sumPositionRepaymentForTotal(positions) {
  if (!Array.isArray(positions)) return 0;
  return positions.reduce((sum, row) => {
    if (isRepaymentExcludedFromPositionsTotal(row)) return sum;
    return sum + (parseNum(row.installment) || 0);
  }, 0);
}

/** Count for "Existing Active Positions" summary — status must be ACTIVE only. */
export function getExistingActivePositionsCount(positions) {
  if (!Array.isArray(positions)) return 0;
  return positions.filter(
    (row) => String(row?.status || "").trim().toUpperCase() === "ACTIVE"
  ).length;
}

/** Positions counted toward "Active Positions" / "Our Position".
 *  Old behavior: only rows with a non-empty status (not blank / SELECT).
 *  New behavior: also count rows that clearly have position data entered
 *  (amount funded / installment / other numeric fields or lender),
 *  even when status has not been chosen yet.
 */
export function getActivePositionsForCount(positions) {
  if (!Array.isArray(positions)) return [];
  return positions.filter((row) => {
    const status = String(row.status || "").trim().toUpperCase();
    // Treat rows with a real status (not blank / SELECT) as part of the stack.
    if (status && status !== "SELECT") return true;

    // If no explicit status yet, treat the row as "active for count"
    // when the user has actually entered some meaningful position data.
    const lender = String(row?.lender || "").trim();
    if (lender) return true;

    const numericKeys = [
      "amountFunded",
      "installment",
      "paymentTerm",
      "totalRepayments",
      "monthlyMcaPmts",
      "mcaEstBalance",
      "mcaPercentPaid",
      "pmtsLeft",
      "mcaRemit",
      "loanAmount",
    ];

    for (const key of numericKeys) {
      const v = row && row[key];
      if (v != null && String(v).trim() !== "" && !Number.isNaN(parseNum(v))) {
        return true;
      }
    }

    return false;
  });
}

/** Positions with status ACTIVE, REFI, PIF, or REVERSE (with amount funded or remit/payment data), or any row with remit/payment data (so existingRemit counts even when amountFunded is empty). */
export function getActivePositionsForMetrics(positions) {
  if (!Array.isArray(positions)) return [];
  return positions.filter((row) => {
    const statusUpper = String(row.status || "").toUpperCase().trim();
    const hasStatus = statusUpper && statusUpper !== "SELECT";
    const isIncludedStatus = ["ACTIVE", "REFI", "PIF", "REVERSE"].includes(statusUpper);
    const amountFunded = parseNum(row.amountFunded);
    const hasAmountFunded = !Number.isNaN(amountFunded) && amountFunded > 0;
    const mcaRemit = parseNum(row.mcaRemit);
    const monthlyMcaPmts = parseNum(row.monthlyMcaPmts);
    const hasRemitOrPayment = (!Number.isNaN(mcaRemit) && mcaRemit > 0) || (!Number.isNaN(monthlyMcaPmts) && monthlyMcaPmts > 0);
    if (isIncludedStatus && (hasAmountFunded || hasRemitOrPayment)) return true;
    if (!hasStatus && (hasAmountFunded || hasRemitOrPayment)) return true;
    return false;
  });
}

/**
 * Compute metrics from position table:
 * - activeCount: count of all ACTIVE + REFI positions (even without amount funded)
 * - existingRemit: sum of MCA Remit % from positions that have amount funded
 * - totalMonthlyFromPositions: sum of Monthly MCA Pmts from those positions
 * - totalDailyFromPositions: totalMonthlyFromPositions / 22
 */
export function computePositionMetrics(positions) {
  const activeForCount = getActivePositionsForCount(positions);
  const activeForTotals = getActivePositionsForMetrics(positions);
  const existingRemit = activeForTotals.reduce((sum, row) => sum + (parseNum(row.mcaRemit) || 0), 0);
  const totalMonthlyFromPositions = activeForTotals.reduce(
    (sum, row) => sum + (parseNum(row.monthlyMcaPmts) || 0),
    0
  );
  const totalDailyFromPositions = totalMonthlyFromPositions > 0 ? totalMonthlyFromPositions / 22 : 0;
  return {
    activeCount: activeForCount.length,
    existingRemit,
    totalMonthlyFromPositions,
    totalDailyFromPositions,
  };
}

function monthLabelIsMtd(monthLabel) {
  const m = monthLabel != null ? String(monthLabel).trim().toLowerCase() : "";
  return m.includes("mtd");
}

/** @param {string} yyyyMm e.g. "2026-05" */
function subtractOneCalendarMonthFromYyyyMm(yyyyMm) {
  if (!yyyyMm || typeof yyyyMm !== "string") return "";
  const match = yyyyMm.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Net credit for leverage denominator: **full calendar month immediately before**
 * the newest MTD month in bank totals (e.g. MTD May 2026 → use April 2026 `netCredit`).
 * If there is no MTD row or no matching prior-month row / value, returns null.
 */
function getRecentMonthNetCreditFromBankTotals(bankTotalRows, refDate = new Date()) {
  if (!Array.isArray(bankTotalRows) || bankTotalRows.length === 0) return null;

  let bestMtdYm = "";
  for (const row of bankTotalRows) {
    if (!monthLabelIsMtd(row?.month)) continue;
    const ym = parseMonthLabelToYYYYMM(String(row.month).trim(), refDate);
    if (!ym) continue;
    if (!bestMtdYm || ym > bestMtdYm) bestMtdYm = ym;
  }
  if (!bestMtdYm) return null;

  const priorYm = subtractOneCalendarMonthFromYyyyMm(bestMtdYm);
  if (!priorYm) return null;

  for (const row of bankTotalRows) {
    if (monthLabelIsMtd(row?.month)) continue;
    const ym = parseMonthLabelToYYYYMM(String(row.month).trim(), refDate);
    if (ym === priorYm) {
      const priorNet = parseNum(row?.netCredit);
      if (Number.isFinite(priorNet) && priorNet > 0) return priorNet;
      return null;
    }
  }

  return null;
}

/**
 * “Recent month Leverage” as a percentage:
 * (sum of `monthlyMcaPmts` from `getActivePositionsForMetrics(positions)` ÷ net credit) × 100.
 * Net credit = **prior full month** vs newest MTD in bank totals (MTD May → April row’s `netCredit`).
 * Returns null when prior month net credit is missing, non-positive, or not finite. Rounded to 2 decimal places.
 */
export function recentMonthLeverageRatio(positions, bankTotalRows, refDate = new Date()) {
  const qualifying = getActivePositionsForMetrics(positions);
  let totalMonthlyFromPositions = 0;
  for (const row of qualifying) {
    const v = parseNum(row?.monthlyMcaPmts);
    if (Number.isFinite(v)) totalMonthlyFromPositions += v;
  }

  const recentMonthNetCredit = getRecentMonthNetCreditFromBankTotals(bankTotalRows, refDate);

  let leveragePct = null;
  if (
    recentMonthNetCredit != null &&
    Number.isFinite(recentMonthNetCredit) &&
    recentMonthNetCredit > 0
  ) {
    leveragePct = (totalMonthlyFromPositions / recentMonthNetCredit) * 100;
    if (!Number.isFinite(leveragePct)) leveragePct = null;
    else leveragePct = Math.round(leveragePct * 100) / 100;
  }

  console.log("[Recent Month Leverage] qualifying positions", qualifying);
  console.log("[Recent Month Leverage] totalMonthlyFromPositions", totalMonthlyFromPositions);
  console.log("[Recent Month Leverage] recentMonthNetCredit", recentMonthNetCredit);
  console.log("[Recent Month Leverage] leverage %", leveragePct);

  return leveragePct;
}
