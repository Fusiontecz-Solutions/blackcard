import {
    computePerPeriodPayment,
    normalizeFrequency,
    parseTerm,
    resolveOfferFactorRate,
    resolveOfferPayback,
    roundMoney,
} from "@/lib/offerRepaymentCalculations";
import { resolveAppendixUnderwritingFeesDollars, getApplicationClientPrefillArgs } from "./Contract";

export type DisclosureCalculatorFrequency = "Daily" | "Weekly" | "Bi-Weekly" | "Monthly";

/** Live Offer Decision wins over a stale `contract.offer` snapshot. */
export function mergeLiveOfferDecision(
    contract: Record<string, unknown> | null | undefined,
    offerDecision: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
    const contractOffer =
        contract != null &&
        typeof contract.offer === "object" &&
        contract.offer != null &&
        !Array.isArray(contract.offer)
            ? (contract.offer as Record<string, unknown>)
            : null;
    const live =
        offerDecision != null && typeof offerDecision === "object" && !Array.isArray(offerDecision)
            ? offerDecision
            : null;
    if (live) {
        return contractOffer ? { ...contractOffer, ...live } : { ...live };
    }
    return contractOffer;
}

export interface DisclosureCalculatorInputs {
    state: string;
    frequency: DisclosureCalculatorFrequency;
    merchantName?: string;
    purchasePrice: number;
    factorRate: number;
    originationFee: number;
    brokerFeePaidByMerchant?: number;
    brokerFeePaidByFunder?: number;
    isRefinance?: boolean;
    numberOfPayments: number;
    numberOfPaymentDays: number;
    disbursementDate: string;
    firstPaymentDate: string;
    /** Monthly net-credit / revenue figures from bank analysis (historical method). */
    monthlyRevenues: number[];
}

export interface DisclosureCalculatorResult {
    purchasePrice: number;
    revenuePurchased: number;
    amountFinanced: number;
    recipientFunds: number;
    financeCharge: number;
    estimatedTotalPayment: number;
    paymentTotal: number;
    estimatedAnnualPercentageRate: number;
    estimatedMerchantAverageMonthlyRevenue: number;
    estimatedPayment: number;
    estimatedMonthlyCost: number;
    /** % of merchant daily income purchased (disclosure payment terms). */
    percentOfDailyIncomePurchased: number;
    estimatedTermDays: number;
    checkValue: number;
}

const WEEKS_PER_MONTH = 4.3;
const BUSINESS_DAYS_PER_WEEK = 5;
/** Business days per month for estimated monthly cost (daily remittance × 22). */
const BUSINESS_DAYS_PER_MONTH = 22;
/** APR term adjustment for daily deals (12 wk / 60 day). */
const APR_TERM_DAYS_PER_WEEK = 49 / 12;

function parseMoney(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value == null) return 0;
    const cleaned = String(value).trim().replace(/[$,\s]/g, "").replace(/%$/, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
}

function averagePositive(values: number[]): number {
    const valid = values.filter((v) => Number.isFinite(v) && v > 0);
    if (!valid.length) return 0;
    return roundMoney(valid.reduce((sum, v) => sum + v, 0) / valid.length);
}

function resolveDisclosurePaymentSchedule(input: DisclosureCalculatorInputs): {
    /** Approximate weeks in term (derived from payment days for daily deals). */
    numberOfWeeks: number;
    /** Actual count of remittances over the term. */
    actualPaymentCount: number;
} {
    const paymentDays = Math.max(
        1,
        Math.trunc(input.numberOfPaymentDays) ||
            Math.trunc(input.numberOfPayments) ||
            1,
    );

    if (input.frequency === "Daily") {
        return {
            numberOfWeeks: Math.max(1, Math.round(paymentDays / BUSINESS_DAYS_PER_WEEK)),
            actualPaymentCount: paymentDays,
        };
    }

    const paymentsField = Math.max(1, Math.trunc(input.numberOfPayments) || 1);

    if (input.frequency === "Weekly") {
        return { numberOfWeeks: paymentsField, actualPaymentCount: paymentsField };
    }

    if (input.frequency === "Bi-Weekly") {
        return { numberOfWeeks: paymentsField * 2, actualPaymentCount: paymentsField };
    }

    return { numberOfWeeks: paymentsField * 4, actualPaymentCount: paymentsField };
}

/**
 * Percent of merchant's daily income purchased (payment terms).
 * Daily: payment ÷ (avg monthly revenue ÷ payment-days-per-month).
 */
export function computePercentOfMerchantDailyIncomePurchased(args: {
    estimatedPayment: number;
    averageMonthlyRevenue: number;
    frequency: DisclosureCalculatorFrequency;
    numberOfWeeks: number;
    numberOfPaymentDays: number;
}): number {
    const {
        estimatedPayment,
        averageMonthlyRevenue,
        frequency,
        numberOfWeeks,
        numberOfPaymentDays,
    } = args;
    if (!(averageMonthlyRevenue > 0) || !(estimatedPayment > 0)) return 0;

    if (frequency === "Daily") {
        const businessDaysPerWeek = numberOfPaymentDays / Math.max(numberOfWeeks, 1);
        const paymentDaysPerMonth = businessDaysPerWeek * WEEKS_PER_MONTH;
        const avgDailyIncome = averageMonthlyRevenue / Math.max(paymentDaysPerMonth, 1);
        return roundMoney((estimatedPayment / avgDailyIncome) * 100);
    }

    if (frequency === "Weekly") {
        const avgWeeklyIncome = averageMonthlyRevenue / WEEKS_PER_MONTH;
        return roundMoney((estimatedPayment / avgWeeklyIncome) * 100);
    }

    if (frequency === "Bi-Weekly") {
        const avgBiWeeklyIncome = averageMonthlyRevenue / (WEEKS_PER_MONTH / 2);
        return roundMoney((estimatedPayment / avgBiWeeklyIncome) * 100);
    }

    return roundMoney((estimatedPayment / averageMonthlyRevenue) * 100);
}

/**
 * Disclosure APR: finance charge over purchase price, annualized with adjusted term days.
 * Matches the reference example (≈446.38% for $20k / 1.499 / 60 daily payments).
 */
export function computeDisclosureApr(args: {
    financeCharge: number;
    purchasePrice: number;
    numberOfPaymentDays: number;
    numberOfWeeks: number;
}): number {
    const { financeCharge, purchasePrice, numberOfPaymentDays, numberOfWeeks } = args;
    if (!(purchasePrice > 0) || !(financeCharge > 0)) return 0;

    const aprTermDays =
        numberOfPaymentDays > 0
            ? Math.max(1, roundMoney(numberOfWeeks * APR_TERM_DAYS_PER_WEEK))
            : Math.max(1, numberOfWeeks);

    const apr = (financeCharge / purchasePrice) / (aprTermDays / 365) * 100;
    return roundMoney(apr);
}

export function calculateDisclosureMetrics(
    input: DisclosureCalculatorInputs,
): DisclosureCalculatorResult {
    const purchasePrice = Math.max(0, input.purchasePrice);
    const factorRate = input.factorRate > 0 ? input.factorRate : 1;
    const originationFee = Math.max(0, input.originationFee);
    const brokerMerchant = Math.max(0, input.brokerFeePaidByMerchant ?? 0);

    const revenuePurchased = roundMoney(purchasePrice * factorRate);
    const amountFinanced = roundMoney(
        Math.max(0, purchasePrice - originationFee - brokerMerchant),
    );
    const checkValue = input.isRefinance ? 0 : 0;
    const recipientFunds = roundMoney(Math.max(0, amountFinanced - checkValue));
    // Finance charge = purchase price (payback) − purchase amount (offer).
    const financeCharge = roundMoney(Math.max(0, revenuePurchased - purchasePrice));
    const estimatedTotalPayment = revenuePurchased;

    const { numberOfWeeks, actualPaymentCount } = resolveDisclosurePaymentSchedule(input);
    const estimatedPayment = roundMoney(estimatedTotalPayment / actualPaymentCount);
    const paymentTotal = estimatedTotalPayment;

    // Estimated monthly cost = remittance × 22 (daily) or × 4 (weekly).
    const monthlyPaymentMultiplier =
        input.frequency === "Daily"
            ? BUSINESS_DAYS_PER_MONTH
            : input.frequency === "Weekly"
              ? 4
              : input.frequency === "Bi-Weekly"
                ? 2
                : 1;
    const estimatedMonthlyCost = roundMoney(estimatedPayment * monthlyPaymentMultiplier);

    const estimatedMerchantAverageMonthlyRevenue = averagePositive(input.monthlyRevenues);
    const percentOfDailyIncomePurchased = computePercentOfMerchantDailyIncomePurchased({
        estimatedPayment,
        averageMonthlyRevenue: estimatedMerchantAverageMonthlyRevenue,
        frequency: input.frequency,
        numberOfWeeks,
        numberOfPaymentDays: input.numberOfPaymentDays,
    });

    const estimatedAnnualPercentageRate = computeDisclosureApr({
        financeCharge,
        purchasePrice,
        numberOfPaymentDays: input.numberOfPaymentDays,
        numberOfWeeks,
    });

    return {
        purchasePrice,
        revenuePurchased,
        amountFinanced,
        recipientFunds,
        financeCharge,
        estimatedTotalPayment,
        paymentTotal,
        estimatedAnnualPercentageRate,
        estimatedMerchantAverageMonthlyRevenue,
        estimatedPayment,
        estimatedMonthlyCost,
        percentOfDailyIncomePurchased,
        estimatedTermDays: Math.max(0, Math.trunc(input.numberOfPaymentDays)),
        checkValue,
    };
}

export function stateDisclosureRequiresApr(
    state?: string | null,
    frequency?: string | null,
): boolean {
    const st = String(state ?? "")
        .trim()
        .toLowerCase();
    if (!st) return false;
    const isCa = st === "california" || st === "ca";
    const isNy = st === "new york" || st === "ny";
    return isCa || isNy;
}

export function formatDisclosureUsd(value: number): string {
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(roundMoney(value));
}

export function formatDisclosurePercent(value: number, suffix = "%"): string {
    return `${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(roundMoney(value))}${suffix}`;
}

/** ISO or US date string → MM/DD/YYYY for disclosure PDF fields. */
export function formatDisclosureUsDate(value: unknown): string {
    if (value == null) return "";
    const t = String(value).trim();
    if (!t) return "";
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return t;
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
        return `${t.slice(5, 7)}/${t.slice(8, 10)}/${t.slice(0, 4)}`;
    }
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return t;
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).format(d);
}

export type BankAnalysisRevenueRowTarget = {
    bankAnalysisId: string;
    rowId?: string;
    monthLabel: string;
    monthDate?: string;
    netCredit: number;
    loanTransfer: number;
    deposit: number;
    other: number;
    nsfNegDays: number;
    lowBlcDays: number;
    avgDailyBlc: number;
};

function resolveBankAnalysisId(analysis: unknown): string | null {
    const a = analysis as { _id?: string; id?: string };
    const id = a._id ?? a.id;
    return id != null && String(id).trim() ? String(id) : null;
}

function resolveBankAnalysisRowId(row: unknown): string | undefined {
    const r = row as { _id?: string; id?: string };
    const id = r._id ?? r.id;
    return id != null && String(id).trim() ? String(id) : undefined;
}

export function computeBankAnalysisRowNetCredit(row: unknown): number {
    const totalCredit = parseMoney((row as { totalCredit?: unknown })?.totalCredit);
    const loanTransfer = parseMoney((row as { loanTransfer?: unknown })?.loanTransfer);
    const deposit = parseMoney((row as { deposit?: unknown })?.deposit);
    const other = parseMoney((row as { other?: unknown })?.other);
    const netFromRow = parseMoney((row as { netCredit?: unknown })?.netCredit);
    if (netFromRow > 0) return netFromRow;
    if (totalCredit > 0) return Math.max(0, totalCredit - (loanTransfer + deposit + other));
    return 0;
}

/** Rows with positive net credit, in the same order as {@link extractMonthlyRevenuesFromBankAnalyses}. */
export function listBankAnalysisRevenueRowTargets(analyses: unknown): BankAnalysisRevenueRowTarget[] {
    if (!Array.isArray(analyses)) return [];
    const targets: BankAnalysisRevenueRowTarget[] = [];
    for (const analysis of analyses) {
        const bankAnalysisId = resolveBankAnalysisId(analysis);
        if (!bankAnalysisId) continue;
        const rows = (analysis as { rows?: unknown })?.rows;
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
            const netCredit = computeBankAnalysisRowNetCredit(row);
            if (netCredit <= 0) continue;
            const monthLabel = String((row as { monthLabel?: unknown })?.monthLabel ?? "").trim();
            targets.push({
                bankAnalysisId,
                rowId: resolveBankAnalysisRowId(row),
                monthLabel,
                monthDate:
                    (row as { monthDate?: string })?.monthDate != null
                        ? String((row as { monthDate?: string }).monthDate)
                        : undefined,
                netCredit,
                loanTransfer: parseMoney((row as { loanTransfer?: unknown })?.loanTransfer),
                deposit: parseMoney((row as { deposit?: unknown })?.deposit),
                other: parseMoney((row as { other?: unknown })?.other),
                nsfNegDays: parseMoney((row as { nsfNegDays?: unknown })?.nsfNegDays),
                lowBlcDays: parseMoney((row as { lowBlcDays?: unknown })?.lowBlcDays),
                avgDailyBlc: parseMoney((row as { avgDailyBlc?: unknown })?.avgDailyBlc),
            });
        }
    }
    return targets;
}

export function extractMonthlyRevenuesFromBankAnalyses(
    analyses: unknown,
): number[] {
    return listBankAnalysisRevenueRowTargets(analyses).map((target) => target.netCredit);
}

export function buildDisclosureCalculatorInputsFromSources(args: {
    state?: string | null;
    application?: Record<string, unknown> | null;
    contract?: Record<string, unknown> | null;
    offerDecision?: Record<string, unknown> | null;
    bankAnalyses?: unknown;
    disbursementDate?: string;
    firstPaymentDate?: string;
}): DisclosureCalculatorInputs {
    const contract = args.contract ?? {};
    const offer =
        (contract.offer as Record<string, unknown> | null) ??
        args.offerDecision ??
        null;

    const purchasePrice =
        parseMoney(contract.purchaseAmount) ||
        parseMoney(offer?.offer) ||
        parseMoney(offer?.approvedAmount) ||
        parseMoney(contract.approvedAmount);

    const factorRate = resolveOfferFactorRate({
        offerDecisionRate: parseMoney(offer?.rate),
        offerDecisionFactorRate: parseMoney(offer?.factorRate),
        termsFactorRate: parseMoney(offer?.factorRate),
        fallback: 1.5,
    });

    const payback = resolveOfferPayback(purchasePrice, factorRate, {
        termsPaybackAmount: parseMoney(offer?.paybackAmount),
        offerPaybackAmount: parseMoney(offer?.paybackAmount),
        totalRemit: parseMoney(offer?.totalRemit),
    });

    const termRaw = String(offer?.term ?? offer?.termLength ?? contract.contractLenght ?? "");
    const termNum = parseTerm(termRaw);
    const frequency = normalizeFrequency(
        String(offer?.frequency ?? contract.remittance ?? "Daily"),
    ) as DisclosureCalculatorFrequency;

    let numberOfPayments =
        parseMoney(offer?.numberOfPayments) ||
        (termNum > 0 ? Math.trunc(termNum) : 0);
    let numberOfPaymentDays = numberOfPayments;

    if (frequency === "Daily") {
        const term = termNum > 0 ? Math.trunc(termNum) : 0;
        const explicitCount =
            parseMoney(offer?.numberOfPayments) > 0
                ? Math.trunc(parseMoney(offer?.numberOfPayments))
                : 0;
        let paymentDays = 0;

        // Offer decision `term` is the number of daily payments (same as payment days).
        if (term > 0) {
            paymentDays = term;
        } else if (explicitCount > 0) {
            paymentDays = explicitCount;
        }

        const perPeriod = parseMoney(
            offer?.paymentAmount ?? offer?.repayPerPeriod ?? offer?.daysWeeks,
        );
        if (!(paymentDays > 0) && payback > 0 && perPeriod > 0) {
            paymentDays = Math.max(1, Math.round(payback / perPeriod));
        }

        numberOfPayments = Math.max(1, paymentDays || 1);
        numberOfPaymentDays = numberOfPayments;
    } else if (frequency === "Weekly") {
        numberOfPaymentDays =
            numberOfPayments > 0 ? numberOfPayments * 7 : termNum > 0 ? termNum * 7 : 0;
    } else if (frequency === "Bi-Weekly") {
        numberOfPaymentDays =
            numberOfPayments > 0 ? numberOfPayments * 14 : termNum > 0 ? termNum * 14 : 0;
    } else {
        numberOfPaymentDays =
            numberOfPayments > 0 ? numberOfPayments * 30 : termNum > 0 ? termNum * 30 : 0;
    }

    if (!(numberOfPayments > 0) && payback > 0) {
        const perPeriod = computePerPeriodPayment({ payback, term: termRaw || "1" });
        if (perPeriod > 0) {
            numberOfPayments = Math.max(1, Math.round(payback / perPeriod));
        }
    }

    const originationFee =
        resolveAppendixUnderwritingFeesDollars(
            contract.appendixUnderwritingFees ?? offer?.fees,
            purchasePrice,
        ) ?? parseMoney(contract.appendixUnderwritingFees ?? offer?.fees);

    const app = args.application ?? {};
    const client = (app.client as Record<string, unknown> | null) ?? null;
    const business = (client?.business as Record<string, unknown> | null) ?? null;
    const appPrefill = getApplicationClientPrefillArgs(args.application);
    const merchantName =
        String(
            contract.legalName ??
                contract.clientLegalName ??
                contract.securityBusinessName ??
                appPrefill.legalName ??
                client?.businessName ??
                (business as Record<string, unknown> | null)?.name ??
                "",
        ).trim() || undefined;

    const bankRevenues = extractMonthlyRevenuesFromBankAnalyses(args.bankAnalyses);
    const fallbackRevenue = parseMoney(business?.monthlyRevenue);
    const monthlyRevenues =
        bankRevenues.length > 0
            ? bankRevenues
            : fallbackRevenue > 0
              ? [fallbackRevenue]
              : [];

    const today = new Date();
    const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    return {
        state: String(args.state ?? contract.state ?? "").trim(),
        frequency,
        merchantName,
        purchasePrice,
        factorRate,
        originationFee,
        brokerFeePaidByMerchant: 0,
        brokerFeePaidByFunder: 0,
        isRefinance: false,
        numberOfPayments: Math.max(1, numberOfPayments || 1),
        numberOfPaymentDays: Math.max(1, numberOfPaymentDays || numberOfPayments || 1),
        disbursementDate: args.disbursementDate || defaultDate,
        firstPaymentDate: args.firstPaymentDate || args.disbursementDate || defaultDate,
        monthlyRevenues,
    };
}

/** Map calculator output to state disclosure DocuSign field ids. */
export function mapDisclosureMetricsToFieldOverrides(
    metrics: DisclosureCalculatorResult,
    options: {
        state?: string | null;
        frequency?: string | null;
        includeApr?: boolean;
    },
): Record<string, string> {
    const includeApr =
        options.includeApr ?? stateDisclosureRequiresApr(options.state, options.frequency);

    const overrides: Record<string, string> = {
        funding_provided: formatDisclosureUsd(metrics.purchasePrice),
        finance_charge: formatDisclosureUsd(metrics.financeCharge),
        estimated_payment: formatDisclosureUsd(metrics.estimatedPayment),
        daily_payment: formatDisclosureUsd(metrics.estimatedPayment),
        monthly_income: formatDisclosureUsd(metrics.estimatedMerchantAverageMonthlyRevenue),
        avarage_monthly_income: formatDisclosureUsd(
            metrics.estimatedMerchantAverageMonthlyRevenue,
        ),
        etimated_average_income: formatDisclosureUsd(
            metrics.estimatedMerchantAverageMonthlyRevenue,
        ),
        estimated_term: String(metrics.estimatedTermDays),
        percent_of_business_income: formatDisclosurePercent(
            metrics.percentOfDailyIncomePurchased,
        ),
        total_amount_business_fund: formatDisclosureUsd(metrics.purchasePrice),
        total_amount_of_fund_disbursed: formatDisclosureUsd(metrics.recipientFunds),
        total_amount_tobe_paid_to_provider: formatDisclosureUsd(metrics.estimatedTotalPayment),
        total_dollar_cost: formatDisclosureUsd(metrics.financeCharge),
        estimated_payment_amount: formatDisclosureUsd(metrics.estimatedPayment),
        estimated_monthly_cost: formatDisclosureUsd(metrics.estimatedMonthlyCost),
        payment_total: formatDisclosureUsd(metrics.estimatedTotalPayment),
        payement_exceeded_percent: formatDisclosurePercent(
            metrics.percentOfDailyIncomePurchased,
        ),
    };

    if (includeApr) {
        overrides.estimated_annual_percentage_rate = formatDisclosurePercent(
            metrics.estimatedAnnualPercentageRate,
        );
    }

    return overrides;
}
