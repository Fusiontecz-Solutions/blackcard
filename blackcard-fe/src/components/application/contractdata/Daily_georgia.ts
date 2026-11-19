import type { ContractPrefillField } from "./Contract";
import { formatEditorAmountFieldForDisplay } from "./prefillFieldDisplay";

const FIELD_IDS = {
    totalAmountBusinessFund: ["total_amount_business_fund"],
    totalAmountOfFundDisbursed: ["total_amount_of_fund_disbursed"],
    totalAmountToBePaid: ["total_amount_to_be_paid"],
    totalDollarCost: ["total_dollar_cost"],
    estimatedPaymentAmount: ["estimated_payment_amount"],
    exceededPercent: ["exceeded_percent"],
    consistentWith: ["consistent_with"],
    paymentsFallenBelowPercent: ["payments_fallen_below_percent"],
    percentOfBusinessIncome: ["percent_of_business_income"],
    amountTriggerPrepayment: ["amount_trigger_prepayment"],
    amountReceivedByWhichDate: ["amount_received_by_which_date"],
    signature1Date: ["signature1_date"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: formatEditorAmountFieldForDisplay(id, trimmed) }));
};

/** BoldSign prefill source values for the Daily Georgia state disclosure template. */
export interface DailyGeorgiaContractPrefillFields {
    totalAmountBusinessFund?: string;
    totalAmountOfFundDisbursed?: string;
    totalAmountToBePaid?: string;
    totalDollarCost?: string;
    estimatedPaymentAmount?: string;
    exceededPercent?: string;
    consistentWith?: string;
    paymentsFallenBelowPercent?: string;
    percentOfBusinessIncome?: string;
    amountTriggerPrepayment?: string;
    amountReceivedByWhichDate?: string;
    signature1Date?: string;
}

export function buildDailyGeorgiaContractPrefillFields({
    totalAmountBusinessFund = "",
    totalAmountOfFundDisbursed = "",
    totalAmountToBePaid = "",
    totalDollarCost = "",
    estimatedPaymentAmount = "",
    exceededPercent = "",
    consistentWith = "",
    paymentsFallenBelowPercent = "",
    percentOfBusinessIncome = "",
    amountTriggerPrepayment = "",
    amountReceivedByWhichDate = "",
    signature1Date = "",
}: DailyGeorgiaContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.totalAmountBusinessFund, "Total Amount Business Fund", totalAmountBusinessFund),
        ...mapIds(FIELD_IDS.totalAmountOfFundDisbursed, "Total Amount Of Fund Disbursed", totalAmountOfFundDisbursed),
        ...mapIds(FIELD_IDS.totalAmountToBePaid, "Total Amount To Be Paid", totalAmountToBePaid),
        ...mapIds(FIELD_IDS.totalDollarCost, "Total Dollar Cost", totalDollarCost),
        ...mapIds(FIELD_IDS.estimatedPaymentAmount, "Estimated Payment Amount", estimatedPaymentAmount),
        ...mapIds(FIELD_IDS.exceededPercent, "Exceeded Percent", exceededPercent),
        ...mapIds(FIELD_IDS.consistentWith, "Consistent With", consistentWith),
        ...mapIds(
            FIELD_IDS.paymentsFallenBelowPercent,
            "Payments Fallen Below Percent",
            paymentsFallenBelowPercent,
        ),
        ...mapIds(FIELD_IDS.percentOfBusinessIncome, "Percent Of Business Income", percentOfBusinessIncome),
        ...mapIds(FIELD_IDS.amountTriggerPrepayment, "Amount Trigger Prepayment", amountTriggerPrepayment),
        ...mapIds(
            FIELD_IDS.amountReceivedByWhichDate,
            "Amount Received By Which Date",
            amountReceivedByWhichDate,
        ),
        ...mapIds(FIELD_IDS.signature1Date, "Signature1 Date", signature1Date),
    ];
}