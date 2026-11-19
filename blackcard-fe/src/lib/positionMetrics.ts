/**
 * Position / leverage metrics — same formulas as the MCA tool
 * (`mca-tool-web/utils/positionMetrics.js`).
 */

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

export type BankTotalRow = {
  month?: string | null;
  netCredit?: number | string | null;
};

function parseNum(str: unknown): number {
  if (str == null || String(str).trim() === "") return NaN;
  const n = Number(String(str).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function parseMonthLabelToYYYYMM(
  monthLabel: string,
  refDate = new Date(),
): string {
  if (!monthLabel || typeof monthLabel !== "string") return "";
  const trimmed = String(monthLabel).trim().toLowerCase();
  let monthIndex = -1;
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (
      trimmed.startsWith(MONTH_NAMES[i]) ||
      MONTH_NAMES[i].startsWith(trimmed.slice(0, 3))
    ) {
      monthIndex = i;
      break;
    }
  }
  if (monthIndex === -1) return "";

  const monthNum = String(monthIndex + 1).padStart(2, "0");
  const yearMatch = trimmed.match(/\b(20\d{2}|19\d{2})\b/);
  if (yearMatch) return `${yearMatch[1]}-${monthNum}`;
  return `${refDate.getFullYear()}-${monthNum}`;
}

/** Count for "Existing Active Positions" — status must be ACTIVE only. */
export function getExistingActivePositionsCount(
  positions: unknown[] | undefined | null,
): number {
  if (!Array.isArray(positions)) return 0;
  return positions.filter(
    (row) =>
      String((row as { status?: unknown })?.status || "")
        .trim()
        .toUpperCase() === "ACTIVE",
  ).length;
}

/** Positions counted toward "Active Positions" / "Our Position". */
export function getActivePositionsForCount(
  positions: any[] | undefined | null,
): any[] {
  if (!Array.isArray(positions)) return [];
  return positions.filter((row) => {
    const status = String(row?.status || "")
      .trim()
      .toUpperCase();
    if (status && status !== "SELECT") return true;

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
    ] as const;

    for (const key of numericKeys) {
      const v = row && row[key];
      if (v != null && String(v).trim() !== "" && !Number.isNaN(parseNum(v))) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Positions that contribute to Current Levg / Current Monthly:
 * ACTIVE, REFI, PIF, or REVERSE with amount funded or remit/payment,
 * or any row with remit/payment when status is blank.
 */
export function getActivePositionsForMetrics(
  positions: any[] | undefined | null,
): any[] {
  if (!Array.isArray(positions)) return [];
  return positions.filter((row) => {
    const statusUpper = String(row?.status || "")
      .toUpperCase()
      .trim();
    const hasStatus = Boolean(statusUpper && statusUpper !== "SELECT");
    const isIncludedStatus = ["ACTIVE", "REFI", "PIF", "REVERSE"].includes(
      statusUpper,
    );
    const amountFunded = parseNum(row?.amountFunded);
    const hasAmountFunded = !Number.isNaN(amountFunded) && amountFunded > 0;
    const mcaRemit = parseNum(row?.mcaRemit);
    const monthlyMcaPmts = parseNum(row?.monthlyMcaPmts);
    const hasRemitOrPayment =
      (!Number.isNaN(mcaRemit) && mcaRemit > 0) ||
      (!Number.isNaN(monthlyMcaPmts) && monthlyMcaPmts > 0);
    if (isIncludedStatus && (hasAmountFunded || hasRemitOrPayment)) return true;
    if (!hasStatus && (hasAmountFunded || hasRemitOrPayment)) return true;
    return false;
  });
}

export type PositionMetrics = {
  activeCount: number;
  existingRemit: number;
  totalMonthlyFromPositions: number;
  totalDailyFromPositions: number;
};

/**
 * - existingRemit: sum of stored MCA Remit % (do not recompute from avg net credit)
 * - totalMonthlyFromPositions: sum of stored monthlyMcaPmts
 * - totalDailyFromPositions: totalMonthlyFromPositions / 22
 */
export function computePositionMetrics(
  positions: any[] | undefined | null,
): PositionMetrics {
  const activeForCount = getActivePositionsForCount(positions);
  const activeForTotals = getActivePositionsForMetrics(positions);
  const existingRemit = activeForTotals.reduce(
    (sum, row) => sum + (parseNum(row?.mcaRemit) || 0),
    0,
  );
  const totalMonthlyFromPositions = activeForTotals.reduce(
    (sum, row) => sum + (parseNum(row?.monthlyMcaPmts) || 0),
    0,
  );
  const totalDailyFromPositions =
    totalMonthlyFromPositions > 0 ? totalMonthlyFromPositions / 22 : 0;
  return {
    activeCount: activeForCount.length,
    existingRemit,
    totalMonthlyFromPositions,
    totalDailyFromPositions,
  };
}

function monthLabelIsMtd(monthLabel: unknown): boolean {
  const m = monthLabel != null ? String(monthLabel).trim().toLowerCase() : "";
  return m.includes("mtd");
}

function subtractOneCalendarMonthFromYyyyMm(yyyyMm: string): string {
  if (!yyyyMm || typeof yyyyMm !== "string") return "";
  const match = yyyyMm.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Net credit for Recent month Leverage: full calendar month immediately
 * before the newest MTD month in bank totals (e.g. May MTD → April netCredit).
 */
function getRecentMonthNetCreditFromBankTotals(
  bankTotalRows: BankTotalRow[] | undefined | null,
  refDate = new Date(),
): number | null {
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
 * Recent month Leverage % =
 * (sum monthlyMcaPmts of qualifying positions ÷ prior full-month net credit) × 100.
 * Returns null when prior month net credit is missing or not positive.
 */
export function recentMonthLeverageRatio(
  positions: any[] | undefined | null,
  bankTotalRows: BankTotalRow[] | undefined | null,
  refDate = new Date(),
): number | null {
  const qualifying = getActivePositionsForMetrics(positions);
  let totalMonthlyFromPositions = 0;
  for (const row of qualifying) {
    const v = parseNum(row?.monthlyMcaPmts);
    if (Number.isFinite(v)) totalMonthlyFromPositions += v;
  }

  const recentMonthNetCredit = getRecentMonthNetCreditFromBankTotals(
    bankTotalRows,
    refDate,
  );

  if (
    recentMonthNetCredit == null ||
    !Number.isFinite(recentMonthNetCredit) ||
    recentMonthNetCredit <= 0
  ) {
    return null;
  }

  let leveragePct = (totalMonthlyFromPositions / recentMonthNetCredit) * 100;
  if (!Number.isFinite(leveragePct)) return null;
  return Math.round(leveragePct * 100) / 100;
}
