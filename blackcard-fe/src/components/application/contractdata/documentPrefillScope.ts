/** Drop shared ACH tabs so each multi-ACH form instance keeps its own edited values. */
export function stripAchAuthorizationKeysFromPrefillFields<
    T extends { id: string; value: string },
>(fields: T[]): T[] {
    return fields.filter((field) => !isAchAuthorizationPrefillKey(field.id));
}

const BANK_KEYS_TO_PRESERVE = new Set([
    "authorizationclientbankname",
    "authorizationclientbankaccount",
    "authorizationclientbankrouting",
]);

export function isAchAuthorizationPrefillKey(key: unknown): boolean {
    const id = String(key || "").toLowerCase();
    if (!id) return false;
    if (BANK_KEYS_TO_PRESERVE.has(id)) return false;
    if (id.includes("ach_authorization") || id.includes("achauthorization")) return true;
    if (id.includes("authorization_client") || id.includes("authorizationclient")) return true;
    if (id === "authorized_business_phone" || id === "authorizedbusinessphone") return true;
    return false;
}

/** Strip shared ACH keys from a prefill override object (main contract blob). */
export function stripAchAuthorizationKeysFromRecord(
    raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (isAchAuthorizationPrefillKey(key)) continue;
        out[key] = value;
    }
    return out;
}
