import { parseMoneyInput } from "@/utils/formatCurrency";

/** Prefer true offer / advance keys — never payback or recipient funds. */
const OFFER_AMOUNT_FIELD_IDS = [
    "purchase_amount",
    "purchaseamount",
    "purchaseAmount",
    "addendum_dated_principal_owner_amount",
    "funding_provided",
    "disclosure_purchase_price",
    "total_amount_business_fund",
    "total_amount_commercial_financing",
    "receivable_purchase",
    "receivable_purchase_1",
    "receivable_purchase_2",
] as const;

function normalizeFieldKey(fieldId?: string | null): string {
    return String(fieldId ?? "")
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s-]+/g, "_")
        .toLowerCase()
        .replace(/__p\d+_[a-z0-9]+$/i, "")
        .replace(/__page\d+$/i, "")
        .replace(/_\d+$/, "");
}

/**
 * Offer amount as it will appear in the generated PDF, read from the DocuSign
 * prefill payload so envelope subjects / PDF names follow edits that have not
 * been written back to the OfferDecision record yet.
 */
export function resolveOfferAmountFromPrefillFields(
    fields: ReadonlyArray<{ id: string; value: string }> | null | undefined,
): number | null {
    if (!fields?.length) return null;
    const byKey = new Map<string, number>();
    for (const field of fields) {
        const key = normalizeFieldKey(field.id);
        const amount = parseMoneyInput(field.value);
        if (amount == null || !(amount > 0)) continue;
        if (!byKey.has(key)) byKey.set(key, amount);
    }
    for (const id of OFFER_AMOUNT_FIELD_IDS) {
        const amount = byKey.get(normalizeFieldKey(id));
        if (amount != null && amount > 0) return amount;
    }
    return null;
}
