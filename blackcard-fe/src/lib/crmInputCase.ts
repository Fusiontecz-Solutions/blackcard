/** Inputs whose stored value must keep original casing. */
export function shouldKeepCrmInputCase(options?: {
    type?: string;
    name?: string;
    id?: string;
    autoComplete?: string;
}): boolean {
    const type = String(options?.type ?? "text").toLowerCase();
    if (
        type === "email" ||
        type === "password" ||
        type === "url" ||
        type === "search" ||
        type === "hidden" ||
        type === "file" ||
        type === "number" ||
        type === "date" ||
        type === "time" ||
        type === "datetime-local" ||
        type === "month" ||
        type === "week" ||
        type === "checkbox" ||
        type === "radio" ||
        type === "range" ||
        type === "color"
    ) {
        return true;
    }
    const hint = `${options?.name ?? ""} ${options?.id ?? ""} ${options?.autoComplete ?? ""}`.toLowerCase();
    if (hint.includes("email") || hint.includes("password") || hint.includes("username")) {
        return true;
    }
    if (hint.includes("website") || hint.includes("url") || hint.includes("portal")) {
        return true;
    }
    return false;
}

export function uppercaseCrmInputValue(
    value: string,
    options?: Parameters<typeof shouldKeepCrmInputCase>[0],
): string {
    const raw = String(value ?? "");
    if (!raw || shouldKeepCrmInputCase(options)) return raw;
    return raw.toUpperCase();
}
