import type { ContractPrefillField } from "./Contract";
import { formatEditorAmountFieldForDisplay } from "./prefillFieldDisplay";

const FIELD_IDS = {
    fundingProvided: ["funding_provided"],
    estimatedAnnualPercentageRate: ["estimated_annual_percentage_rate"],
    estimatedPayment: ["estimated_payment"],
    dailyPayment: ["daily_payment"],
    etimatedAverageIncome: ["etimated_average_income"],
    monthlyIncome: ["monthly_income"],
    paymentExceeded: ["payment_exceeded"],
    estimatedTerm: ["estimated_term"],
    prepayment: ["prepayment"],
    signatureDate: ["signature_date"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: formatEditorAmountFieldForDisplay(id, trimmed) }));
};

/** BoldSign prefill source values for the Daily New York state disclosure template. */
export interface DailyNewYorkContractPrefillFields {
    fundingProvided?: string;
    estimatedAnnualPercentageRate?: string;
    estimatedPayment?: string;
    dailyPayment?: string;
    etimatedAverageIncome?: string;
    monthlyIncome?: string;
    paymentExceeded?: string;
    estimatedTerm?: string;
    prepayment?: string;
    signatureDate?: string;
}

export function buildDailyNewYorkContractPrefillFields({
    fundingProvided = "",
    estimatedAnnualPercentageRate = "",
    estimatedPayment = "",
    dailyPayment = "",
    etimatedAverageIncome = "",
    monthlyIncome = "",
    paymentExceeded = "",
    estimatedTerm = "",
    prepayment = "",
    signatureDate = "",
}: DailyNewYorkContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.fundingProvided, "Funding Provided", fundingProvided),
        ...mapIds(
            FIELD_IDS.estimatedAnnualPercentageRate,
            "Estimated Annual Percentage Rate",
            estimatedAnnualPercentageRate,
        ),
        ...mapIds(FIELD_IDS.estimatedPayment, "Estimated Payment", estimatedPayment),
        ...mapIds(FIELD_IDS.dailyPayment, "Daily Payment", dailyPayment),
        ...mapIds(FIELD_IDS.etimatedAverageIncome, "Etimated Average Income", etimatedAverageIncome),
        ...mapIds(FIELD_IDS.monthlyIncome, "Monthly Income", monthlyIncome),
        ...mapIds(FIELD_IDS.paymentExceeded, "Payment Exceeded", paymentExceeded),
        ...mapIds(FIELD_IDS.estimatedTerm, "Estimated Term", estimatedTerm),
        ...mapIds(FIELD_IDS.prepayment, "Prepayment", prepayment),
        ...mapIds(FIELD_IDS.signatureDate, "Signature Date", signatureDate),
    ];
}