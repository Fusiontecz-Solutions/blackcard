import type { ContractPrefillField } from "./Contract";
import { formatEditorAmountFieldForDisplay } from "./prefillFieldDisplay";

const FIELD_IDS = {
    clientName: ["disclosure_pdf__client_name", "disclosure_client_name"],
    funderName: ["funder_name"],
    totalAmountBusinessFund: ["total_amount_business_fund"],
    totalAmountOfFundDisbursed: ["total_amount_of_fund_disbursed"],
    totalAmountTobePaidToProvider: ["total_amount_tobe_paid_to_provider"],
    totalDollarCost: ["total_dollar_cost"],
    estimatedPaymentAmount: ["estimated_payment_amount"],
    paymentExceededPercent: ["payment_exceeded_percent"],
    percentOfBusinessIncome: ["percent_of_business_income"],
    paymentFallenBelowPercent: ["payment_fallen_below_percent"],
    consistentWithPercent: ["consistent_with_percent"],
    amountRequiredToTriggerPrepaymentDiscount: ["amount_required_to_trigger_prepayment_discount"],
    dateByWhichAmountMustbeReceived: ["date_by_which_amount_mustbe_received"],
    signatureDate: ["Signature_date"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: formatEditorAmountFieldForDisplay(id, trimmed) }));
};

/** BoldSign prefill source values for the Daily Florida state disclosure template. */
export interface DailyFloridaContractPrefillFields {
    clientName?: string;
    funderName?: string;
    totalAmountBusinessFund?: string;
    totalAmountOfFundDisbursed?: string;
    totalAmountTobePaidToProvider?: string;
    totalDollarCost?: string;
    estimatedPaymentAmount?: string;
    paymentExceededPercent?: string;
    percentOfBusinessIncome?: string;
    paymentFallenBelowPercent?: string;
    consistentWithPercent?: string;
    amountRequiredToTriggerPrepaymentDiscount?: string;
    dateByWhichAmountMustbeReceived?: string;
    signatureDate?: string;
}

export function buildDailyFloridaContractPrefillFields({
    clientName = "",
    funderName = "",
    totalAmountBusinessFund = "",
    totalAmountOfFundDisbursed = "",
    totalAmountTobePaidToProvider = "",
    totalDollarCost = "",
    estimatedPaymentAmount = "",
    paymentExceededPercent = "",
    percentOfBusinessIncome = "",
    paymentFallenBelowPercent = "",
    consistentWithPercent = "",
    amountRequiredToTriggerPrepaymentDiscount = "",
    dateByWhichAmountMustbeReceived = "",
    signatureDate = "",
}: DailyFloridaContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.clientName, "Business name", clientName),
        ...mapIds(FIELD_IDS.funderName, "Funder / provider name", funderName),
        ...mapIds(FIELD_IDS.totalAmountBusinessFund, "Total Amount Business Fund", totalAmountBusinessFund),
        ...mapIds(
            FIELD_IDS.totalAmountOfFundDisbursed,
            "Total Amount Of Fund Disbursed",
            totalAmountOfFundDisbursed,
        ),
        ...mapIds(
            FIELD_IDS.totalAmountTobePaidToProvider,
            "Total Amount To Be Paid To Provider",
            totalAmountTobePaidToProvider,
        ),
        ...mapIds(FIELD_IDS.totalDollarCost, "Total Dollar Cost", totalDollarCost),
        ...mapIds(FIELD_IDS.estimatedPaymentAmount, "Estimated Payment Amount", estimatedPaymentAmount),
        ...mapIds(FIELD_IDS.paymentExceededPercent, "Payment Exceeded Percent", paymentExceededPercent),
        ...mapIds(FIELD_IDS.percentOfBusinessIncome, "Percent Of Business Income", percentOfBusinessIncome),
        ...mapIds(
            FIELD_IDS.paymentFallenBelowPercent,
            "Payment Fallen Below Percent",
            paymentFallenBelowPercent,
        ),
        ...mapIds(FIELD_IDS.consistentWithPercent, "Consistent With Percent", consistentWithPercent),
        ...mapIds(
            FIELD_IDS.amountRequiredToTriggerPrepaymentDiscount,
            "Amount Required To Trigger Prepayment Discount",
            amountRequiredToTriggerPrepaymentDiscount,
        ),
        ...mapIds(
            FIELD_IDS.dateByWhichAmountMustbeReceived,
            "Date By Which Amount Must Be Received",
            dateByWhichAmountMustbeReceived,
        ),
        ...mapIds(FIELD_IDS.signatureDate, "Signature Date", signatureDate),
    ];
}