import { formatNumberUS, formatNumberUSForInput, parseNumberUS } from "@/lib/utils";

/** Drop trailing DocuSign/data-label ids like "(disclosure_merchant_name)" from UI labels. */
export function stripTechnicalFieldIdFromLabel(label: string): string {
    return String(label || "")
        .replace(/\s*\(([a-z][a-z0-9_]*)\)\s*$/i, "")
        .trim();
}

/** Amount-like editor field ids (disclosure / addendum / template mapping / ACH). */
export function isEditorAmountFieldId(fieldId: string): boolean {
    const n = String(fieldId || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    if (!n) return false;
    // Money tabs that contain "day" / "term" tokens but are still dollar amounts.
    if (
        n.includes("dailypayment") ||
        n.includes("borrowerpay") ||
        n.includes("advanceremit") ||
        n.includes("fundingprovided") ||
        n.includes("page3line") ||
        n.includes("receivablepurchase") ||
        n.includes("financecharge") ||
        n.includes("dollarcost")
    ) {
        return true;
    }
    if (
        n.includes("percent") ||
        n.includes("apr") ||
        n.includes("rate") ||
        n.includes("term") ||
        n.includes("installmentday") ||
        n.includes("termdays") ||
        n.includes("date") ||
        n.includes("frequency") ||
        n.includes("phone") ||
        n.includes("email") ||
        n.includes("name") ||
        n.includes("address") ||
        n.includes("city") ||
        n.includes("state") ||
        n.includes("zip") ||
        n.includes("routing") ||
        n.includes("tax") ||
        n.includes("ein") ||
        n.includes("ssn") ||
        n.includes("license") ||
        n.includes("numberoftransaction") ||
        n.includes("nooftransaction")
    ) {
        return false;
    }
    return (
        n.includes("amount") ||
        n.includes("price") ||
        n.includes("fee") ||
        n.includes("funds") ||
        n.includes("fund") ||
        n.includes("payment") ||
        n.includes("cost") ||
        n.includes("charge") ||
        n.includes("revenue") ||
        n.includes("income") ||
        n.includes("remittance") ||
        n.includes("payback") ||
        n.includes("purchase") ||
        n.includes("subtotal") ||
        n.includes("balance") ||
        n.includes("rtr") ||
        n.includes("disburs") ||
        n.includes("financ") ||
        n.includes("transactionfee") ||
        n.includes("provided") ||
        n.endsWith("net") ||
        n.includes("nettomerchant")
    );
}

export function formatEditorAmountFieldForDisplay(fieldId: string, raw: string): string {
    const t = String(raw ?? "").trim();
    if (!t || !isEditorAmountFieldId(fieldId)) return String(raw ?? "");
    if (t.includes("%")) return t;
    const n = parseNumberUS(t);
    return Number.isFinite(n) ? formatNumberUS(n) : t;
}

export function formatEditorAmountFieldWhileTyping(fieldId: string, raw: string): string {
    if (!isEditorAmountFieldId(fieldId)) return String(raw ?? "");
    if (String(raw ?? "").includes("%")) return String(raw ?? "");
    const stripped = String(raw ?? "").replace(/^\$\s*/, "");
    return formatNumberUSForInput(stripped);
}

/** Apply US comma formatting to every amount-like disclosure/addendum prefill row. */
export function formatDisclosurePrefillFieldRows<
    T extends { id: string; label?: string; value?: string },
>(fields: T[]): T[] {
    return fields.map((field) => {
        const id = String(field.id ?? "").trim();
        const raw = String(field.value ?? "");
        if (!id || !raw.trim()) return field;
        return {
            ...field,
            value: formatEditorAmountFieldForDisplay(id, raw),
        };
    });
}

/** Apply US comma formatting to every amount-like key in a disclosure values map. */
export function formatDisclosureAmountValuesMap(
    values: Record<string, string>,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, raw] of Object.entries(values)) {
        out[id] = formatEditorAmountFieldForDisplay(id, String(raw ?? ""));
    }
    return out;
}
