import type { ContractPrefillField } from "./Contract";

export interface PrePaymentAddendumContractPrefillFields {
    agreementDate?: string;
    sellerName?: string;
    guarantorName?: string;
    businessDays?: string;
    discountPercentage?: string;
    printedName?: string;
}

const FIELD_DEFS: Array<{
    id: keyof PrePaymentAddendumContractPrefillFields;
    label: string;
    tabId: string;
}> = [
    { id: "agreementDate", label: "Current date", tabId: "agreement_date" },
    { id: "sellerName", label: "Seller name", tabId: "seller_name" },
    { id: "guarantorName", label: "Guarantor name", tabId: "guarantor_name" },
    { id: "businessDays", label: "Business days", tabId: "business_days" },
    {
        id: "discountPercentage",
        label: "Discount off remaining balance (%)",
        tabId: "discount_percentage",
    },
    { id: "printedName", label: "Printed name below signature", tabId: "printed_name" },
];

export function buildPrePaymentAddendumContractPrefillFields(
    values: PrePaymentAddendumContractPrefillFields = {},
): ContractPrefillField[] {
    return FIELD_DEFS.map(({ id, label, tabId }) => ({
        id: tabId,
        label,
        value: String(values[id] ?? "").trim(),
    }));
}
