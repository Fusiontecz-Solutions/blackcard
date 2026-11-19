export const NEW_YORK_DISCLOSURE_PAGE3_DEFAULT_AMOUNT = "0.00";
export const NEW_YORK_DISCLOSURE_PAGE1_DEFAULT_AMOUNT = "0.00";

export function isNewYorkDisclosureState(state: string | null | undefined): boolean {
    const key = String(state ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, " ");
    return key === "new york" || key === "newyork" || key === "ny";
}

export function resolveNewYorkPage3LineAmount(value: string | null | undefined): string {
    const trimmed = String(value ?? "").trim();
    return trimmed || NEW_YORK_DISCLOSURE_PAGE3_DEFAULT_AMOUNT;
}

export function resolveNewYorkPage1LineAmount(value: string | null | undefined): string {
    const trimmed = String(value ?? "").trim();
    return trimmed || NEW_YORK_DISCLOSURE_PAGE1_DEFAULT_AMOUNT;
}

function parseMoney(value: string | undefined): number {
    const n = Number.parseFloat(String(value ?? "").replace(/[$,%\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

/** New York page 3: subtotal = recipient funds + line 1 + line 2; net = subtotal − broker fee. */
export function buildNewYorkDisclosurePage3Amounts(args: {
    recipientFunds?: string;
    page3Line1?: string;
    page3Line2?: string;
    brokerFee?: string;
}): {
    page3Line1: string;
    page3Line2: string;
    page3Subtotal: string;
    page3Net: string;
} {
    const page3Line1 = resolveNewYorkPage3LineAmount(args.page3Line1);
    const page3Line2 = resolveNewYorkPage3LineAmount(args.page3Line2);
    const subtotal =
        parseMoney(args.recipientFunds) + parseMoney(page3Line1) + parseMoney(page3Line2);
    const net = Math.max(0, subtotal - parseMoney(args.brokerFee));
    return {
        page3Line1,
        page3Line2,
        page3Subtotal: new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(Math.round(subtotal * 100) / 100),
        page3Net: new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(Math.round(net * 100) / 100),
    };
}
