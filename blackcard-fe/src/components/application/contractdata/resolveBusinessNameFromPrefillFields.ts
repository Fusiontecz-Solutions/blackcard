/**
 * Merchant / legal business name as it will appear on the PDF — read from the
 * DocuSign prefill payload so envelope subjects and PDF names follow Edit Prefill
 * / Edit ACH updates that have not been written back to Client yet.
 *
 * Prefer legal / authorization business tabs; never person-name tabs (`client_name`).
 */
const CONTRACT_BUSINESS_NAME_FIELD_IDS = [
    "client_legal_name",
    "legal_name",
    "business_legal_name",
    "merchant_legal_name",
    "security_business_name",
    "business_name",
    "authorization_client_name",
    "authorization_client_signer_name",
    "ach_authorization_account_holder_name",
    "authorization_application",
    "doing_business_as",
    "dba",
] as const;

/** ACH Edit Form updates these first — must beat stale contract legal name. */
const ACH_BUSINESS_NAME_FIELD_IDS = [
    "authorization_client_name",
    "authorization_client_signer_name",
    "ach_authorization_account_holder_name",
    "client_legal_name",
    "legal_name",
    "business_legal_name",
    "merchant_legal_name",
    "security_business_name",
    "business_name",
    "authorization_application",
    "doing_business_as",
    "dba",
] as const;

function normalizeFieldKey(fieldId?: string | null): string {
    let key = String(fieldId ?? "")
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s-]+/g, "_")
        .toLowerCase();
    // Strip DocuSign instance / page coordinate suffixes.
    key = key
        .replace(/__instance_\d+$/i, "")
        .replace(/__p\d+_[a-z0-9]+$/i, "")
        .replace(/__page\d+$/i, "")
        .replace(/_\d+$/, "");
    // Strip ACH / disclosure scoping prefixes used on envelope tabs.
    key = key
        .replace(/^ach_form_texas_/, "")
        .replace(/^ach_form_/, "")
        .replace(/^disclosure_pdf__/, "")
        .replace(/^disclosure_/, "");
    return key;
}

function isNumericOnlyApplicationId(value: string): boolean {
    return /^\d+$/.test(value.replace(/\s/g, ""));
}

export function resolveBusinessNameFromPrefillFields(
    fields: ReadonlyArray<{ id: string; value?: string | null }> | null | undefined,
    options?: { preferAch?: boolean },
): string | null {
    if (!fields?.length) return null;
    const byKey = new Map<string, string>();
    for (const field of fields) {
        const key = normalizeFieldKey(field.id);
        const value = String(field.value ?? "").trim();
        if (!key || !value) continue;
        if (!byKey.has(key)) byKey.set(key, value);
    }
    const ordered = options?.preferAch
        ? ACH_BUSINESS_NAME_FIELD_IDS
        : CONTRACT_BUSINESS_NAME_FIELD_IDS;
    for (const id of ordered) {
        const value = byKey.get(normalizeFieldKey(id));
        if (!value) continue;
        if (id === "authorization_application" && isNumericOnlyApplicationId(value)) {
            continue;
        }
        return value;
    }
    return null;
}
