import type { ContractPrefillField } from "./Contract";
import { formatUSD } from "@/utils/formatCurrency";

/** Tab ids for payment schedule money cells — formatted as USD on PDF output. */
export const FLEX_ADDENDUM_MONEY_TAB_IDS = new Set([
    "daily_payment_1",
    "receivable_purchase_1",
    "daily_payment_2",
    "receivable_purchase_2",
]);

/** Format flex addendum payment / receivable values as $X,XXX.XX (empty when not numeric). */
export function formatFlexAddendumMoneyDisplay(value: string): string {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return "";
    return formatUSD(trimmed, { fallback: "" });
}

/**
 * Flex Addendum — CRM-editable fields (page 1 schedule + parties).
 * Payment schedule: two installments (Day 1 / Day 16), each with payment amount + receivables purchased.
 * Owner print names and signatures on page 2 are filled at signing when not set here.
 */
export interface WoodmereFlexAddendumContractPrefillFields {
    addendumDate?: string;
    agreementDate?: string;
    merchantName?: string;
    clientName?: string;
    /** Second merchant / owner print name (page 2) when two signers. */
    businessName2?: string;
    /** Day of month — first installment (default Day 1). */
    installmentDay1?: string;
    /** Day of month — second installment (default Day 16). */
    installmentDay2?: string;
    /** Payment amount — first installment (Day 1). */
    dailyPayment1?: string;
    /** Receivables purchased — first installment (Day 1). */
    receivablePurchase1?: string;
    /** Payment amount — second installment (Day 16). */
    dailyPayment2?: string;
    /** Receivables purchased — second installment (Day 16). */
    receivablePurchase2?: string;
}

const EDITOR_FIELD_DEFS: Array<{
    id: keyof WoodmereFlexAddendumContractPrefillFields;
    label: string;
    tabId: string;
}> = [
    { id: "addendumDate", label: "Addendum date", tabId: "addendum_date" },
    { id: "agreementDate", label: "Agreement date", tabId: "agreement_date" },
    { id: "merchantName", label: "Business name", tabId: "flex_addendum_merchant_legal_name" },
    { id: "clientName", label: "Owner 1 name (print)", tabId: "addendum_client_name" },
    { id: "businessName2", label: "Merchant 2 / owner 2 name", tabId: "merchant2_name" },
    { id: "installmentDay1", label: "Installment day — 1st payment", tabId: "installment_day_1" },
    { id: "installmentDay2", label: "Installment day — 2nd payment", tabId: "installment_day_2" },
    {
        id: "dailyPayment1",
        label: "Payment amount — 1st installment (Day 1)",
        tabId: "daily_payment_1",
    },
    {
        id: "receivablePurchase1",
        label: "Receivables purchased — 1st installment (Day 1)",
        tabId: "receivable_purchase_1",
    },
    {
        id: "dailyPayment2",
        label: "Payment amount — 2nd installment (Day 16)",
        tabId: "daily_payment_2",
    },
    {
        id: "receivablePurchase2",
        label: "Receivables purchased — 2nd installment (Day 16)",
        tabId: "receivable_purchase_2",
    },
];

/** @deprecated Prefer EDITOR_FIELD_DEFS via buildWoodmereFlexAddendumContractPrefillFields */
export const WOODMERE_FLEX_FIELD_DEFS = EDITOR_FIELD_DEFS.map(({ tabId, label }) => ({
    id: tabId,
    label,
}));

export function buildWoodmereFlexAddendumContractPrefillFields(
    values: WoodmereFlexAddendumContractPrefillFields = {},
): ContractPrefillField[] {
    const resolved: WoodmereFlexAddendumContractPrefillFields = {
        installmentDay1: "1",
        installmentDay2: "16",
        ...values,
    };
    const out: ContractPrefillField[] = [];
    for (const { id, label, tabId } of EDITOR_FIELD_DEFS) {
        const raw = String(resolved[id] ?? "").trim();
        const value = FLEX_ADDENDUM_MONEY_TAB_IDS.has(tabId)
            ? formatFlexAddendumMoneyDisplay(raw)
            : raw;
        out.push({ id: tabId, label, value });
        // Layout variable is still `client_legal_name`; keep both ids so flatten +
        // saved mapping blobs keyed on the old tab id continue to resolve.
        if (id === "merchantName" && value) {
            out.push({ id: "client_legal_name", label, value });
        }
    }
    return out;
}
