import type { ContractPrefillField } from "./Contract";
import { formatEditorAmountFieldForDisplay } from "./prefillFieldDisplay";

const FIELD_IDS = {
    clientName: ["disclosure_pdf__client_name", "disclosure_client_name"],
    funderName: ["funder_name"],
    totalAmountOfFundProvided: [
        "total_amount_of_fund_provided",
        "funding_provided",
        "disclosure_purchase_price",
        "purchase_amount",
    ],
    totalAmountFundDisbursed: ["total_amount_fund_disbursed"],
    totalOfPayments: ["total_of_payments"],
    totalDollarCostOfFrinancing: ["total_dollar_cost_of_frinancing"],
    estimatedPayment: ["estimated_payment"],
    exceededPayment: ["exceeded_payment"],
    agreementDuration: ["agreement_duration"],
    paymentFallen: ["payment_fallen"],
    consistentWithBusiness: ["consistent_with_business"],
    signatureDate: ["signature_date"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: formatEditorAmountFieldForDisplay(id, trimmed) }));
};

/** BoldSign prefill source values for the Daily Kansas state disclosure template. */
export interface DailyKansasContractPrefillFields {
    clientName?: string;
    funderName?: string;
    totalAmountOfFundProvided?: string;
    totalAmountFundDisbursed?: string;
    totalOfPayments?: string;
    totalDollarCostOfFrinancing?: string;
    estimatedPayment?: string;
    exceededPayment?: string;
    agreementDuration?: string;
    paymentFallen?: string;
    consistentWithBusiness?: string;
    signatureDate?: string;
}

/**
 * Maps Daily Kansas disclosure inputs to BoldSign `ContractPrefillField` rows
 * (same output shape as `buildContractPrefillFields` in `Contract.ts`).
 */
export function buildDailyKansasContractPrefillFields({
    clientName = "",
    funderName = "",
    totalAmountOfFundProvided = "",
    totalAmountFundDisbursed = "",
    totalOfPayments = "",
    totalDollarCostOfFrinancing = "",
    estimatedPayment = "",
    exceededPayment = "",
    agreementDuration = "",
    paymentFallen = "",
    consistentWithBusiness = "",
    signatureDate = "",
}: DailyKansasContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.clientName, "Business name", clientName),
        ...mapIds(FIELD_IDS.funderName, "Funder / provider name", funderName),
        ...mapIds(
            FIELD_IDS.totalAmountOfFundProvided,
            "Total Amount Of Fund Provided",
            totalAmountOfFundProvided,
        ),
        ...mapIds(
            FIELD_IDS.totalAmountFundDisbursed,
            "Total Amount Fund Disbursed",
            totalAmountFundDisbursed,
        ),
        ...mapIds(FIELD_IDS.totalOfPayments, "Total Of Payments", totalOfPayments),
        ...mapIds(
            FIELD_IDS.totalDollarCostOfFrinancing,
            "Total Dollar Cost Of Frinancing",
            totalDollarCostOfFrinancing,
        ),
        ...mapIds(FIELD_IDS.estimatedPayment, "Estimated Payment", estimatedPayment),
        ...mapIds(FIELD_IDS.exceededPayment, "Exceeded Payment", exceededPayment),
        ...mapIds(FIELD_IDS.agreementDuration, "Agreement Duration", agreementDuration),
        ...mapIds(FIELD_IDS.paymentFallen, "Payment Fallen", paymentFallen),
        ...mapIds(FIELD_IDS.consistentWithBusiness, "Consistent With Business", consistentWithBusiness),
        ...mapIds(FIELD_IDS.signatureDate, "Signature Date", signatureDate),
    ];
}
