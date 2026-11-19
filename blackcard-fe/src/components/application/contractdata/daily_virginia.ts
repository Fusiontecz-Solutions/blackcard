import type { ContractPrefillField } from "./Contract";
import { formatEditorAmountFieldForDisplay } from "./prefillFieldDisplay";

const FIELD_IDS = {
    totalAmountSalesBasedFinancing: ["total_amount_sales_based_financing"],
    feesDeducted: ["fees_deducted"],
    disbursementAmount: ["disbursement_amount"],
    financeCharge: ["finance_charge"],
    totalRepaymentAmount: ["total_repayment_amount"],
    estimatedNumberOfPayement: ["estimated_number_of_payement"],
    disclosureDate: ["disclosure_date"],
    disclosureName: ["disclosure_name"],
    recipientAddress: ["recipient_address"],
    prepaymentDiscount: ["prepayment_discount"],
    dateOfAmountReceived: ["date_of_amount_received"],
    signatureDate: ["signature_date"],
    recipientName2: ["recipient_name2"],
    disclosureDate2: ["disclosure_date2"],
    recipientAddress1: ["recipient_address1"],
    fordailypayments: ["fordailypayments"],
    exceededPayment: ["exceeded_payment"],
    weeklyPayments: ["weekly_payments"],
    paymentExceededPercent: ["payment_exceeded_percent"],
    signatureDate2: ["signature_date2"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: formatEditorAmountFieldForDisplay(id, trimmed) }));
};

/** BoldSign prefill source values for the Daily Virginia state disclosure template. */
export interface DailyVirginiaContractPrefillFields {
    totalAmountSalesBasedFinancing?: string;
    feesDeducted?: string;
    disbursementAmount?: string;
    financeCharge?: string;
    totalRepaymentAmount?: string;
    estimatedNumberOfPayement?: string;
    disclosureDate?: string;
    disclosureName?: string;
    recipientAddress?: string;
    funderName?: string;
    funderAddress?: string;
    funderPhone?: string;
    funderEmail?: string;
    prepaymentDiscount?: string;
    dateOfAmountReceived?: string;
    signatureDate?: string;
    recipientName2?: string;
    disclosureDate2?: string;
    recipientAddress1?: string;
    fordailypayments?: string;
    exceededPayment?: string;
    weeklyPayments?: string;
    paymentExceededPercent?: string;
    signatureDate2?: string;
}

export function buildDailyVirginiaContractPrefillFields({
    totalAmountSalesBasedFinancing = "",
    feesDeducted = "",
    disbursementAmount = "",
    financeCharge = "",
    totalRepaymentAmount = "",
    estimatedNumberOfPayement = "",
    disclosureDate = "",
    disclosureName = "",
    recipientAddress = "",
    funderName = "",
    funderAddress = "",
    funderPhone = "",
    funderEmail = "",
    prepaymentDiscount = "",
    dateOfAmountReceived = "",
    signatureDate = "",
    recipientName2 = "",
    disclosureDate2 = "",
    recipientAddress1 = "",
    fordailypayments = "",
    exceededPayment = "",
    weeklyPayments = "",
    paymentExceededPercent = "",
    signatureDate2 = "",
}: DailyVirginiaContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(
            FIELD_IDS.totalAmountSalesBasedFinancing,
            "Total Amount Sales Based Financing",
            totalAmountSalesBasedFinancing,
        ),
        ...mapIds(FIELD_IDS.feesDeducted, "Fees Deducted", feesDeducted),
        ...mapIds(FIELD_IDS.disbursementAmount, "Disbursement Amount", disbursementAmount),
        ...mapIds(FIELD_IDS.financeCharge, "Finance Charge", financeCharge),
        ...mapIds(FIELD_IDS.totalRepaymentAmount, "Total Repayment Amount", totalRepaymentAmount),
        ...mapIds(
            FIELD_IDS.estimatedNumberOfPayement,
            "Estimated Number Of Payement",
            estimatedNumberOfPayement,
        ),
        ...mapIds(FIELD_IDS.disclosureDate, "Disclosure Date", disclosureDate),
        ...mapIds(FIELD_IDS.disclosureName, "Business name", disclosureName),
        ...mapIds(FIELD_IDS.recipientAddress, "Recipient Address", recipientAddress),
        ...mapIds(["funder_name"], "Funder Name", funderName),
        ...mapIds(["funder_address"], "Funder Address", funderAddress),
        ...mapIds(["funder_phone"], "Funder Phone", funderPhone),
        ...mapIds(["funder_email"], "Funder Email", funderEmail),
        ...mapIds(FIELD_IDS.prepaymentDiscount, "Prepayment Discount", prepaymentDiscount),
        ...mapIds(FIELD_IDS.dateOfAmountReceived, "Date Of Amount Received", dateOfAmountReceived),
        ...mapIds(FIELD_IDS.signatureDate, "Signature Date", signatureDate),
        ...mapIds(FIELD_IDS.recipientName2, "Business name (page 2)", recipientName2),
        ...mapIds(FIELD_IDS.disclosureDate2, "Disclosure Date 2", disclosureDate2),
        ...mapIds(FIELD_IDS.recipientAddress1, "Recipient Address 1", recipientAddress1),
        ...mapIds(FIELD_IDS.fordailypayments, "For Daily Payments", fordailypayments),
        ...mapIds(FIELD_IDS.exceededPayment, "Exceeded Payment", exceededPayment),
        ...mapIds(FIELD_IDS.weeklyPayments, "Weekly Payments", weeklyPayments),
        ...mapIds(FIELD_IDS.paymentExceededPercent, "Payment Exceeded Percent", paymentExceededPercent),
        ...mapIds(FIELD_IDS.signatureDate2, "Signature Date 2", signatureDate2),
    ];
}