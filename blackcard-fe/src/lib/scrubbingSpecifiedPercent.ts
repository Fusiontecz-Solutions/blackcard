import { formatNumberUS } from "@/lib/utils";

/** SPA denominator: average net credit / revenue from the last N full months (MTD excluded). */
export const SPA_AVG_REVENUE_MONTH_WINDOW = 3;

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
] as const;

function parseNum(value: unknown): number {
    const raw = String(value ?? "").trim();
    if (!raw) return NaN;
    const n = Number.parseFloat(raw.replace(/[$,%\s]/g, ""));
    return Number.isFinite(n) ? n : NaN;
}

function normalizeMonthLabelKey(month: string | undefined | null): string {
    return month != null ? String(month).trim().toLowerCase() : "";
}

function parseMonthLabelToDate(label: string): Date | null {
    const raw = String(label ?? "").trim();
    if (!raw) return null;
    const m = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
        const idx = MONTH_NAMES.findIndex(
            (name) => name.toLowerCase() === m[1].toLowerCase(),
        );
        if (idx >= 0) return new Date(Number(m[2]), idx, 1);
    }
    const iso = raw.match(/^(\d{4})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, 1);
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function monthLabelSortKey(label: string): number {
    const d = parseMonthLabelToDate(label);
    return d != null && !Number.isNaN(d.getTime())
        ? d.getTime()
        : Number.NEGATIVE_INFINITY;
}

function sortMonthsDesc(months: string[]): string[] {
    return [...months].sort((a, b) => {
        const diff = monthLabelSortKey(b) - monthLabelSortKey(a);
        if (diff !== 0) return diff;
        return String(a).localeCompare(String(b));
    });
}

function hasEnteredNumericValue(raw: string | undefined | null): boolean {
    if (raw == null) return false;
    const s = String(raw).trim();
    if (!s || /^e\.?\s*g\.?/i.test(s)) return false;
    const cleaned = s.replace(/[^0-9.-]+/g, "");
    if (!cleaned) return false;
    return !Number.isNaN(Number.parseFloat(cleaned));
}

function parseCurrency(value: string | undefined | null): number {
    if (!value) return 0;
    const cleaned = String(value).replace(/[^0-9.-]+/g, "");
    if (!cleaned) return 0;
    const num = Number.parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
}

type BankMonthRow = {
    month?: string;
    monthLabel?: string;
    totalCredit?: string | number | null;
    loanTransfer?: string | number | null;
    deposit?: string | number | null;
    other?: string | number | null;
    avgDailyBlc?: string | number | null;
};

function rowMonthLabel(row: BankMonthRow): string {
    const raw = row.month ?? row.monthLabel;
    return raw != null ? String(raw).trim() : "";
}

type BankTableLike = { rows?: BankMonthRow[] | null };

function rowNetCredit(row: BankMonthRow): number | null {
    // SPA revenue denominator should follow the Scrubbing tab logic:
    // use the Bank Analysis "Credits" column directly (no netting against transfers/deposits/other).
    const totalCredit = parseCurrency(String(row.totalCredit ?? ""));
    const hasCredits = hasEnteredNumericValue(String(row.totalCredit ?? ""));
    if (!hasCredits) return null;
    return totalCredit;
}

/**
 * Average net credit across bank months.
 * @param monthWindow When set, uses only the newest N non-MTD months; otherwise all active months.
 */
export function computeAvgNetCreditFromBankTables(
    banks: BankTableLike[] | null | undefined,
    monthWindow?: number,
): number | null {
    if (!Array.isArray(banks) || banks.length === 0) return null;

    const activeMonthSet = new Set<string>();
    for (const table of banks) {
        for (const row of table.rows ?? []) {
            const monthLabel = normalizeMonthLabelKey(rowMonthLabel(row));
            if (!monthLabel || monthLabel.includes("mtd")) continue;
            const nc = rowNetCredit(row);
            if (nc !== null) activeMonthSet.add(monthLabel);
        }
    }

    const firstRows = banks[0]?.rows ?? [];
    const orderedMonths = sortMonthsDesc(
        firstRows
            .map((r) => String(rowMonthLabel(r) || "").trim())
            .filter((m) => {
                const ml = normalizeMonthLabelKey(m);
                return ml && !ml.includes("mtd") && activeMonthSet.has(ml);
            }),
    );
    const monthsForAvg =
        monthWindow != null && monthWindow > 0
            ? orderedMonths.slice(0, monthWindow)
            : orderedMonths;

    if (!monthsForAvg.length) return null;

    let sum = 0;
    let count = 0;
    for (const month of monthsForAvg) {
        let monthSum = 0;
        let bankCount = 0;
        for (const table of banks) {
            const row = (table.rows ?? []).find(
                (r) =>
                    normalizeMonthLabelKey(rowMonthLabel(r)) ===
                    normalizeMonthLabelKey(month),
            );
            if (!row) continue;
            const nc = rowNetCredit(row);
            if (nc === null) continue;
            monthSum += nc;
            bankCount += 1;
        }
        if (bankCount > 0) {
            sum += monthSum;
            count += 1;
        }
    }
    if (count === 0) return null;
    return sum / count;
}

const ACTIVE_POSITION_STATUSES = new Set([
    "ACTIVE",
    "CURRENT",
    "OPEN",
    "OUTSTANDING",
    "SELECT",
]);

/** Map raw `/positions` API rows to scrubbing-table field names. */
function normalizePositionRowForSpa(row: Record<string, unknown>): Record<string, unknown> {
    return {
        ...row,
        installment: row.installment ?? row.ach,
        totalRepayments: row.totalRepayments ?? row.paybackAmount,
        amountFunded: row.amountFunded ?? row.fundedAmount,
        lender: row.lender ?? row.funder ?? row.fundingCompany,
        paymentTerm: row.paymentTerm ?? row.term,
    };
}

/**
 * Repayment for SPA — scrubbing REPAYMENT column (per-period ACH / installment).
 * Does not use MONTHLY PMTS or TOTAL REPAYMENTS obligation.
 */
export function getPositionRepaymentForSpa(row: Record<string, unknown>): number {
    const normalized = normalizePositionRowForSpa(row);
    const repayment = parseNum(normalized.installment);
    if (!Number.isNaN(repayment) && repayment > 0) return repayment;

    const totalObligation = parseNum(
        normalized.totalRepayments ?? normalized.paybackAmount,
    );
    const term = parseNum(normalized.paymentTerm);
    if (
        !Number.isNaN(totalObligation) &&
        totalObligation > 0 &&
        !Number.isNaN(term) &&
        term > 0
    ) {
        return totalObligation / term;
    }
    return 0;
}

/** @deprecated Use getPositionRepaymentForSpa */
export function getPositionTotalRepaymentForSpa(row: Record<string, unknown>): number {
    return getPositionRepaymentForSpa(row);
}

export function isActivePositionForTotals(row: Record<string, unknown>): boolean {
    const status = String(row.status ?? "")
        .trim()
        .toUpperCase();
    if (status && ACTIVE_POSITION_STATUSES.has(status)) return true;
    const keys = [
        "amountFunded",
        "fundedAmount",
        "installment",
        "ach",
        "paybackAmount",
        "totalRepayments",
        "monthlyMcaPmts",
        "mcaRemit",
    ] as const;
    return keys.some((key) => {
        const v = row[key];
        return v != null && String(v).trim() !== "" && !Number.isNaN(parseNum(v));
    });
}

/** Sum of scrubbing REPAYMENT column across active positions (not monthly pmts). */
export function computeTotalMonthlyPayments(
    positions: Array<Record<string, unknown>> | null | undefined,
): number {
    let sum = 0;
    for (const row of positions ?? []) {
        if (!isActivePositionForTotals(row)) continue;
        const repayment = getPositionRepaymentForSpa(row);
        if (!Number.isNaN(repayment) && repayment > 0) sum += repayment;
    }
    return sum;
}

/**
 * SPA = (total of repayments / average revenue of last 3 months) × 100.
 * Numerator = sum of scrubbing REPAYMENT column (per-period ACH), not MONTHLY PMTS.
 */
export function computeSpecifiedPurchasePercent(
    totalMonthlyPayments: number,
    avgRevenueLast3Months: number,
): string | null {
    if (!(totalMonthlyPayments > 0) || !(avgRevenueLast3Months > 0)) return null;
    const pct = (totalMonthlyPayments / avgRevenueLast3Months) * 100;
    if (!Number.isFinite(pct) || pct <= 0) return null;
    return formatNumberUS(pct.toFixed(2));
}

export function resolveSpecifiedPurchasePercentFromScrubbing(args: {
    banks?: BankTableLike[] | null;
    positions?: Array<Record<string, unknown>> | null;
}): string | null {
    const breakdown = buildSpaCalculationBreakdown(args);
    return breakdown.spa;
}

export type SpaBankMonthContribution = {
    bankBackendId: string;
    rowBackendId?: string;
    netCredit: number;
    totalCredit: number;
    loanTransfer: number;
    deposit: number;
    other: number;
};

export type SpaMonthlyRevenueRow = {
    month: string;
    netCredit: number;
    includedInSpaAverage: boolean;
    bankContributions?: SpaBankMonthContribution[];
};

export type SpaMonthlyPaymentRow = {
    label: string;
    amount: number;
    source: "position" | "offer" | "positions_total";
    positionId?: string;
};

export type SpaCalculationBreakdown = {
    monthlyRevenues: SpaMonthlyRevenueRow[];
    monthlyPayments: SpaMonthlyPaymentRow[];
    totalMonthlyPayments: number;
    avgRevenueLast3Months: number | null;
    monthsUsedForAverage: string[];
    spa: string | null;
};

/** Last N full calendar months (excludes current MTD) for empty SPA revenue seeding. */
export function buildDefaultSpaRevenueMonthLabels(
    count: number = SPA_AVG_REVENUE_MONTH_WINDOW,
): string[] {
    const now = new Date();
    const labels: string[] = [];
    for (let i = 1; i <= count; i += 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(`${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`);
    }
    return labels;
}

/** Empty editable revenue rows when scrubber has no bank months yet. */
export function buildEmptySpaRevenueRows(
    count: number = SPA_AVG_REVENUE_MONTH_WINDOW,
): SpaMonthlyRevenueRow[] {
    return buildDefaultSpaRevenueMonthLabels(count).map((month) => ({
        month,
        netCredit: 0,
        includedInSpaAverage: true,
    }));
}

/** Empty editable repayment row when scrubber has no positions yet. */
export function buildEmptySpaPaymentRows(): SpaMonthlyPaymentRow[] {
    return [
        {
            label: "Total of repayments",
            amount: 0,
            source: "positions_total",
        },
    ];
}

/** Per-month net credit across all banks; flags last N months used for SPA average. */
export function buildSpaMonthlyRevenueRows(
    banks: BankTableLike[] | null | undefined,
    monthWindow: number = SPA_AVG_REVENUE_MONTH_WINDOW,
): { rows: SpaMonthlyRevenueRow[]; monthsUsedForAverage: string[] } {
    if (!Array.isArray(banks) || banks.length === 0) {
        return { rows: [], monthsUsedForAverage: [] };
    }

    // Include structured bank months even when credits are still empty so SPA can edit them.
    const monthLabelByKey = new Map<string, string>();
    for (const table of banks) {
        for (const row of table.rows ?? []) {
            const display = String(rowMonthLabel(row) || "").trim();
            const monthLabel = normalizeMonthLabelKey(display);
            if (!monthLabel || monthLabel.includes("mtd")) continue;
            if (!monthLabelByKey.has(monthLabel)) {
                monthLabelByKey.set(monthLabel, display);
            }
        }
    }

    const orderedMonths = sortMonthsDesc([...monthLabelByKey.values()]);
    const monthsForAvg =
        monthWindow > 0 ? orderedMonths.slice(0, monthWindow) : orderedMonths;
    const avgMonthKeys = new Set(
        monthsForAvg.map((m) => normalizeMonthLabelKey(m)),
    );

    const rows: SpaMonthlyRevenueRow[] = [];
    for (const month of orderedMonths) {
        let monthSum = 0;
        let bankCount = 0;
        const bankContributions: SpaBankMonthContribution[] = [];
        for (const table of banks) {
            const bankBackendId = String(
                (table as { _id?: string; id?: string })._id ??
                    (table as { _id?: string; id?: string }).id ??
                    "",
            ).trim();
            const row = (table.rows ?? []).find(
                (r) =>
                    normalizeMonthLabelKey(rowMonthLabel(r)) ===
                    normalizeMonthLabelKey(month),
            );
            if (!row) continue;
            const nc = rowNetCredit(row);
            const totalCredit = parseCurrency(String(row.totalCredit ?? ""));
            const loanTransfer = parseCurrency(String(row.loanTransfer ?? ""));
            const deposit = parseCurrency(String(row.deposit ?? ""));
            const other = parseCurrency(String(row.other ?? ""));
            const effectiveNc = nc !== null ? nc : 0;
            const rowBackendId = String(
                (row as { _id?: string; id?: string })._id ??
                    (row as { _id?: string; id?: string }).id ??
                    "",
            ).trim();
            bankContributions.push({
                bankBackendId,
                rowBackendId: rowBackendId || undefined,
                netCredit: effectiveNc,
                totalCredit,
                loanTransfer,
                deposit,
                other,
            });
            monthSum += effectiveNc;
            bankCount += 1;
        }
        if (bankCount === 0) continue;
        rows.push({
            month,
            netCredit: monthSum,
            includedInSpaAverage: avgMonthKeys.has(normalizeMonthLabelKey(month)),
            bankContributions,
        });
    }

    return { rows, monthsUsedForAverage: monthsForAvg };
}

/**
 * One editable row per active scrubbing position (REPAYMENT / ACH).
 * Empty scrubber returns [] — modal seeds a manual total row the user can fill.
 */
export function buildSpaMonthlyPaymentRows(
    positions: Array<Record<string, unknown>> | null | undefined,
): SpaMonthlyPaymentRow[] {
    const rows: SpaMonthlyPaymentRow[] = [];
    for (const row of positions ?? []) {
        if (!isActivePositionForTotals(row)) continue;
        const normalized = normalizePositionRowForSpa(row);
        const positionId = String(row._id ?? row.id ?? "").trim();
        if (!positionId) continue;
        const repayment = getPositionRepaymentForSpa(row);
        const lender = String(normalized.lender ?? "").trim();
        rows.push({
            label: lender || "Position",
            amount: !Number.isNaN(repayment) && repayment > 0 ? repayment : 0,
            source: "position",
            positionId,
        });
    }
    return rows;
}

export function buildSpaCalculationBreakdown(args: {
    banks?: BankTableLike[] | null;
    positions?: Array<Record<string, unknown>> | null;
}): SpaCalculationBreakdown {
    const { rows: monthlyRevenues, monthsUsedForAverage } = buildSpaMonthlyRevenueRows(
        args.banks,
        SPA_AVG_REVENUE_MONTH_WINDOW,
    );
    const monthlyPayments = buildSpaMonthlyPaymentRows(args.positions);
    return computeSpaBreakdownFromRows(monthlyPayments, monthlyRevenues, monthsUsedForAverage);
}

/** Recompute SPA totals from editable payment/revenue rows (e.g. SPA modal). */
export function computeSpaBreakdownFromRows(
    monthlyPayments: SpaMonthlyPaymentRow[],
    monthlyRevenues: SpaMonthlyRevenueRow[],
    monthsUsedForAverage?: string[],
): SpaCalculationBreakdown {
    const totalMonthlyPayments = monthlyPayments.reduce(
        (sum, row) => sum + (Number.isFinite(row.amount) && row.amount > 0 ? row.amount : 0),
        0,
    );
    const includedRevenues = monthlyRevenues.filter((row) => row.includedInSpaAverage);
    const avgRevenueLast3Months =
        includedRevenues.length > 0
            ? includedRevenues.reduce((sum, row) => sum + row.netCredit, 0) /
              includedRevenues.length
            : null;
    const spa =
        avgRevenueLast3Months != null && avgRevenueLast3Months > 0
            ? computeSpecifiedPurchasePercent(totalMonthlyPayments, avgRevenueLast3Months)
            : null;

    return {
        monthlyPayments,
        monthlyRevenues,
        totalMonthlyPayments,
        avgRevenueLast3Months,
        monthsUsedForAverage:
            monthsUsedForAverage ??
            includedRevenues.map((row) => row.month),
        spa,
    };
}
