import type { BankDetail } from "@/types/bankDetailTypes";

export function resolveBankDetailApplicationRef(bank: BankDetail): string {
    const app = bank.application;
    if (typeof app === "string") return app.trim();
    if (app && typeof app === "object") {
        return String(
            app._id ?? (app as { id?: string }).id ?? app.applicationId ?? "",
        ).trim();
    }
    return "";
}

export function bankDetailMatchesApplication(
    bank: BankDetail,
    applicationKeys: Array<string | number | null | undefined>,
): boolean {
    const ref = resolveBankDetailApplicationRef(bank);
    if (!ref) return true;
    return applicationKeys.some(
        (key) => key != null && String(key).trim() !== "" && String(key).trim() === ref,
    );
}

export function hasCompleteBankDetailRow(bank: BankDetail): boolean {
    const acct = String(bank.accountNumber ?? "").trim();
    const route = String(bank.routingNumber ?? "").trim();
    return Boolean(acct && route);
}

export function filterBankDetailsForApplication(
    rows: BankDetail[] | null | undefined,
    applicationKeys: Array<string | number | null | undefined>,
): BankDetail[] {
    const list = Array.isArray(rows) ? rows : [];
    return list.filter((bank) => bankDetailMatchesApplication(bank, applicationKeys));
}
