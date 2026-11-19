/** Prefill / DocuSign values that must keep original casing. */
export function shouldSkipPrefillUppercase(fieldId?: string | null): boolean {
    const k = String(fieldId ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (!k) return false;
    const compact = k.replace(/_/g, "");
    if (k.includes("email")) return true;
    if (compact.includes("password")) return true;
    if (compact.includes("username")) return true;
    if (
        compact.includes("website") ||
        compact.includes("portal") ||
        compact.includes("url")
    ) {
        return true;
    }
    if (compact.includes("securityquestion") || compact.includes("securityanswer")) {
        return true;
    }
    // BoldSign/DocuSign dropdown option text is case-sensitive.
    if (compact.includes("entitytype") || compact.includes("typeofentity")) {
        return true;
    }
    return false;
}

export function toPrefillUppercase(value: string, fieldId?: string | null): string {
    const raw = String(value ?? "");
    if (!raw) return raw;
    if (raw.startsWith("enc:v1:")) return raw;
    if (shouldSkipPrefillUppercase(fieldId)) return raw;
    return raw.toUpperCase();
}

export function uppercasePrefillValueMap(
    values: Record<string, string> | null | undefined,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(values ?? {})) {
        out[id] = toPrefillUppercase(String(value ?? ""), id);
    }
    return out;
}
