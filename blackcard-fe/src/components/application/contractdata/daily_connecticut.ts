import type { ContractPrefillField } from "./Contract";
import { formatEditorAmountFieldForDisplay } from "./prefillFieldDisplay";

const FIELD_IDS = {
    totalCommericalFinancing: ["total_commerical_financing"],
    deductedAtDisbursement: ["deducted_at_disbursement"],
    totalAmountCommercialFinancing: ["total_amount_commercial_financing"],
    financeCharge: ["finance_charge"],
    totalRepaymentAmount: ["total_repayment_amount"],
    estimatedTimePeriodicPaymement: ["estimated_time_periodic_paymement", "disclosure_term_days"],
    disclosureBrokerFee: ["disclosure_broker_fee"],
    disclosureDate: ["disclosure_date"],
    recipientName: ["recipient_name"],
    recipientAddress: ["recipient_address"],
    funderName: ["funder_name"],
    funderAddress: ["funder_address"],
    funderPhone: ["funder_phone"],
    funderEmail: ["funder_email"],
    dealIdPrefix: ["deal_id_prefix"],
    amountTriggerPrepayment: ["amount_trigger_prepayment"],
    dateWhichAmountReceived: ["date_which_amount_received"],
    recipientName2: ["recipient_name2"],
    disclosureDate2: ["disclosure_date2"],
    recipientAddress2: ["recipient_address2"],
    theestimatedpayment: ["theestimatedpayment"],
    paymentExceedPercent: ["payment_exceed_percent"],
    signature1Date: ["signature1_date"],
    signature2Date: ["signature2_date"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: formatEditorAmountFieldForDisplay(id, trimmed) }));
};

/** BoldSign prefill source values for the Daily Connecticut state disclosure template. */
export interface DailyConnecticutContractPrefillFields {
    totalCommericalFinancing?: string;
    deductedAtDisbursement?: string;
    totalAmountCommercialFinancing?: string;
    financeCharge?: string;
    totalRepaymentAmount?: string;
    estimatedTimePeriodicPaymement?: string;
    disclosureBrokerFee?: string;
    disclosureDate?: string;
    recipientName?: string;
    recipientAddress?: string;
    funderName?: string;
    funderAddress?: string;
    funderPhone?: string;
    funderEmail?: string;
    dealIdPrefix?: string;
    amountTriggerPrepayment?: string;
    dateWhichAmountReceived?: string;
    recipientName2?: string;
    disclosureDate2?: string;
    recipientAddress2?: string;
    theestimatedpayment?: string;
    paymentExceedPercent?: string;
    signature1Date?: string;
    signature2Date?: string;
}

export function buildDailyConnecticutContractPrefillFields({
    totalCommericalFinancing = "",
    deductedAtDisbursement = "",
    totalAmountCommercialFinancing = "",
    financeCharge = "",
    totalRepaymentAmount = "",
    estimatedTimePeriodicPaymement = "",
    disclosureBrokerFee = "",
    disclosureDate = "",
    recipientName = "",
    recipientAddress = "",
    funderName = "",
    funderAddress = "",
    funderPhone = "",
    funderEmail = "",
    dealIdPrefix = "",
    amountTriggerPrepayment = "",
    dateWhichAmountReceived = "",
    recipientName2 = "",
    disclosureDate2 = "",
    recipientAddress2 = "",
    theestimatedpayment = "",
    paymentExceedPercent = "",
    signature1Date = "",
    signature2Date = "",
}: DailyConnecticutContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.totalCommericalFinancing, "Total Commerical Financing", totalCommericalFinancing),
        ...mapIds(FIELD_IDS.deductedAtDisbursement, "Deducted At Disbursement", deductedAtDisbursement),
        ...mapIds(
            FIELD_IDS.totalAmountCommercialFinancing,
            "Total Amount Commercial Financing",
            totalAmountCommercialFinancing,
        ),
        ...mapIds(FIELD_IDS.financeCharge, "Finance Charge", financeCharge),
        ...mapIds(FIELD_IDS.totalRepaymentAmount, "Total Repayment Amount", totalRepaymentAmount),
        ...mapIds(
            FIELD_IDS.estimatedTimePeriodicPaymement,
            "Estimated term (days)",
            estimatedTimePeriodicPaymement,
        ),
        ...mapIds(FIELD_IDS.disclosureBrokerFee, "Broker fee", disclosureBrokerFee),
        ...mapIds(FIELD_IDS.disclosureDate, "Disclosure Date", disclosureDate),
        ...mapIds(FIELD_IDS.recipientName, "Business name", recipientName),
        ...mapIds(FIELD_IDS.recipientAddress, "Recipient Address", recipientAddress),
        ...mapIds(FIELD_IDS.funderName, "Funder Name", funderName),
        ...mapIds(FIELD_IDS.funderAddress, "Funder Address", funderAddress),
        ...mapIds(FIELD_IDS.funderPhone, "Funder Phone", funderPhone),
        ...mapIds(FIELD_IDS.funderEmail, "Funder Email", funderEmail),
        ...mapIds(FIELD_IDS.dealIdPrefix, "Deal ID Prefix", dealIdPrefix),
        ...mapIds(FIELD_IDS.amountTriggerPrepayment, "Amount Trigger Prepayment", amountTriggerPrepayment),
        ...mapIds(FIELD_IDS.dateWhichAmountReceived, "Date Which Amount Received", dateWhichAmountReceived),
        ...mapIds(FIELD_IDS.recipientName2, "Business name (page 2)", recipientName2),
        ...mapIds(FIELD_IDS.disclosureDate2, "Disclosure Date 2", disclosureDate2),
        ...mapIds(FIELD_IDS.recipientAddress2, "Recipient Address 2", recipientAddress2),
        ...mapIds(FIELD_IDS.theestimatedpayment, "The Estimated Payment", theestimatedpayment),
        ...mapIds(FIELD_IDS.paymentExceedPercent, "Payment Exceed Percent", paymentExceedPercent),
        ...mapIds(FIELD_IDS.signature1Date, "Signature1 Date", signature1Date),
        ...mapIds(FIELD_IDS.signature2Date, "Signature2 Date", signature2Date),
    ];
}
