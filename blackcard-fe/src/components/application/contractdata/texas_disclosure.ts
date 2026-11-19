export const TEXAS_DISCLOSURE_PAGE3_DEFAULT_AMOUNT = "0.00";

export function isTexasDisclosureState(state: string | null | undefined): boolean {
    const key = String(state ?? "")
        .trim()
        .toLowerCase();
    return key === "texas" || key === "tx";
}

export function resolveTexasPage3Amount(value: string | null | undefined): string {
    const trimmed = String(value ?? "").trim();
    return trimmed || TEXAS_DISCLOSURE_PAGE3_DEFAULT_AMOUNT;
}
