import type { BuildContractPrefillFieldsArgs } from "./Contract";
import { mergeContractPrefillOverrideLayers } from "./Contract";

export type KycDocumentType = "driverLicense" | "voidedCheck";

export interface KycPanelOwnerPatch {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
}

export interface KycPanelGuarantorPatch {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    driverLicenseNumber: string;
}

export interface KycPanelAchPatch {
    bankName: string;
    fullNameOnAccount: string;
    accountNumber: string;
    routingNumber: string;
    dba: string;
    address: string;
    city: string;
    state: string;
    zip: string;
}

export interface KycExtractionResult {
    documentType?: KycDocumentType;
    keyData?: Record<string, string>;
    contractPrefill?: Record<string, string>;
    panels?: {
        owner?: KycPanelOwnerPatch;
        guarantor?: KycPanelGuarantorPatch;
        ach?: KycPanelAchPatch;
    };
    mergedContractPrefillOverrides?: Record<string, unknown>;
    error?: string;
}

function str(v: unknown): string {
    return v == null ? "" : String(v).trim();
}

function patchIfEmpty<T extends Record<string, unknown>>(
    base: T,
    patch: Record<string, unknown>,
): T {
    const out = { ...base };
    for (const [key, val] of Object.entries(patch)) {
        if (str(val) && !str(out[key as keyof T])) {
            (out as Record<string, unknown>)[key] = val;
        }
    }
    return out;
}

export function mergeKycExtractionIntoPrefill(
    current: Partial<BuildContractPrefillFieldsArgs> | null | undefined,
    extraction: KycExtractionResult | null | undefined,
): Partial<BuildContractPrefillFieldsArgs> | null {
    if (!extraction?.contractPrefill || extraction.error) {
        return current ?? null;
    }
    const merged = mergeContractPrefillOverrideLayers(
        current,
        extraction.contractPrefill as Partial<BuildContractPrefillFieldsArgs>,
    );
    return Object.keys(merged).length ? merged : null;
}

export function applyKycPanelsToOwnerEntries<
    T extends {
        ownerFirstName: string;
        ownerLastName: string;
        ownerAddress: string;
        city: string;
        state: string;
        zipCode: string;
    },
>(entries: T[], patch?: KycPanelOwnerPatch): T[] {
    if (!patch || !entries.length) return entries;
    const [first, ...rest] = entries;
    return [patchIfEmpty(first, patch as unknown as Record<string, unknown>), ...rest];
}

export function applyKycPanelsToGuarantorEntries<
    T extends {
        guarantorFirstName: string;
        guarantorLastName: string;
        guarantorAddress: string;
        city: string;
        state: string;
        zipCode: string;
        driverLicenseNumber: string;
    },
>(entries: T[], patch?: KycPanelGuarantorPatch): T[] {
    if (!patch || !entries.length) return entries;
    const [first, ...rest] = entries;
    return [patchIfEmpty(first, patch as unknown as Record<string, unknown>), ...rest];
}

export function applyKycPanelsToAchEntries<
    T extends {
        bankName: string;
        fullNameOnAccount: string;
        accountNumber: string;
        routingNumber: string;
        dba: string;
        address: string;
        city: string;
        state: string;
        zip: string;
    },
>(entries: T[], patch?: KycPanelAchPatch): T[] {
    if (!patch || !entries.length) return entries;
    const [first, ...rest] = entries;
    return [patchIfEmpty(first, patch as unknown as Record<string, unknown>), ...rest];
}

export function parseKycExtractionsFromUploadResponse(
    payload: unknown,
): KycExtractionResult[] {
    if (!payload || typeof payload !== "object") return [];
    const root = payload as Record<string, unknown>;
    const direct = root.kycExtractions;
    if (Array.isArray(direct)) {
        return direct as KycExtractionResult[];
    }
    const data = root.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
        const nested = (data as Record<string, unknown>).kycExtractions;
        if (Array.isArray(nested)) {
            return nested as KycExtractionResult[];
        }
    }
    return [];
}

function rebuildDriverLicenseContractPrefill(
    panels: KycExtractionResult["panels"],
): Record<string, string> {
    const guarantor = panels?.guarantor;
    const owner = panels?.owner;
    const firstName = str(guarantor?.firstName || owner?.firstName);
    const lastName = str(guarantor?.lastName || owner?.lastName);
    const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const dlNumber = str(guarantor?.driverLicenseNumber);
    const street = str(guarantor?.address || owner?.address);
    const city = str(guarantor?.city || owner?.city);
    const state = str(guarantor?.state || owner?.state).toUpperCase().slice(0, 2);
    const zip = str(guarantor?.zipCode || owner?.zipCode);

    const contractPrefill: Record<string, string> = {};
    const set = (key: string, val: string) => {
        if (str(val)) contractPrefill[key] = val;
    };

    if (displayName) {
        set("customerName", displayName);
        set("clientName", displayName);
        set("owner1GuarantorName", displayName);
        set("guarantyOwner1Name", displayName);
        set("guarantyGuarantor1Name", displayName);
        set("securityGuarantor", displayName);
        set("achAuthorizationAccountHolderName", displayName);
        set("achAuthorizationConcentAccountHolderName", displayName);
    }
    if (dlNumber) {
        set("guarantyOwner1DriverLicense", dlNumber);
        set("guarantyGuarantor1DriverLicense", dlNumber);
        set("guarantySsDriverLicense", dlNumber);
    }
    if (street) {
        set("guarantorAddress", street);
        set("businessAddressContract", street);
        set("achAuthorizationAccountHolderAddress", street);
    }
    if (city) {
        set("guarantorAddressCity", city);
        set("businessAddressContractCity", city);
        set("achAuthorizationAccountHolderCity", city);
    }
    if (state) {
        set("guarantorAddressState", state);
        set("businessAddressContractState", state);
        set("achAuthorizationAccountHolderState", state);
    }
    if (zip) {
        set("guarantorAddressZip", zip);
        set("businessAddressContractZip", zip);
        set("achAuthorizationAccountHolderZip", zip);
    }
    return contractPrefill;
}

function rebuildVoidedCheckContractPrefill(
    panels: KycExtractionResult["panels"],
): Record<string, string> {
    const ach = panels?.ach;
    if (!ach) return {};

    const contractPrefill: Record<string, string> = {};
    const set = (key: string, val: string) => {
        if (str(val)) contractPrefill[key] = val;
    };

    const holderName = str(ach.fullNameOnAccount);
    if (holderName) {
        set("legalName", holderName);
        set("authorizationClientName", holderName);
        set("authorizationClientNamePrint", holderName);
        set("authorizationApplication", holderName);
        set("achAuthorizationAccountHolderName", holderName);
        set("achAuthorizationConcentAccountHolderName", holderName);
        set("securityBusinessName", holderName);
    }
    if (str(ach.dba)) {
        set("doingBusinessAs", ach.dba);
        set("securityDoingBusinessAs", ach.dba);
        set("achAuthorizationAccountHolderDba", ach.dba);
    }
    if (str(ach.bankName)) {
        set("authorizationClientBankName", ach.bankName);
        set("achAuthorizationAccountHolderBankName", ach.bankName);
    }
    if (str(ach.routingNumber)) {
        set("authorizationClientBankRouting", ach.routingNumber);
        set("achAuthorizationAccountHolderBankRoutingNumber", ach.routingNumber);
    }
    if (str(ach.accountNumber)) {
        set("authorizationClientBankAccount", ach.accountNumber);
        set("achAuthorizationAccountHolderBankAccountNumber", ach.accountNumber);
    }
    if (str(ach.address)) {
        set("businessAddress", ach.address);
        set("securityBusinessAddress", ach.address);
        set("achAuthorizationAccountHolderAddress", ach.address);
    }
    if (str(ach.city)) {
        set("businessAddressCity", ach.city);
        set("securityBusinessAddressCity", ach.city);
        set("achAuthorizationAccountHolderCity", ach.city);
    }
    if (str(ach.state)) {
        set("businessAddressState", ach.state);
        set("securityBusinessAddressState", ach.state);
        set("achAuthorizationAccountHolderState", ach.state);
    }
    if (str(ach.zip)) {
        set("businessAddressZip", ach.zip);
        set("securityBusinessAddressZip", ach.zip);
        set("achAuthorizationAccountHolderZip", ach.zip);
    }
    return contractPrefill;
}

/** Rebuild contractPrefill from edited panel fields before syncing to the server. */
export function finalizeKycExtractionForSync(
    extraction: KycExtractionResult,
): KycExtractionResult {
    if (!extraction?.documentType || extraction.error) return extraction;
    if (extraction.documentType === "driverLicense") {
        const contractPrefill = rebuildDriverLicenseContractPrefill(extraction.panels);
        return { ...extraction, contractPrefill };
    }
    if (extraction.documentType === "voidedCheck") {
        const contractPrefill = rebuildVoidedCheckContractPrefill(extraction.panels);
        return { ...extraction, contractPrefill };
    }
    return extraction;
}

export function kycExtractionHasReadableFields(extraction: KycExtractionResult): boolean {
    if (extraction.error) return false;
    const panel = extraction.panels;
    if (extraction.documentType === "driverLicense") {
        const g = panel?.guarantor;
        const o = panel?.owner;
        return Boolean(
            str(g?.firstName || o?.firstName) ||
                str(g?.lastName || o?.lastName) ||
                str(g?.driverLicenseNumber) ||
                str(g?.address || o?.address),
        );
    }
    if (extraction.documentType === "voidedCheck") {
        const ach = panel?.ach;
        return Boolean(
            str(ach?.bankName) ||
                str(ach?.accountNumber) ||
                str(ach?.routingNumber) ||
                str(ach?.fullNameOnAccount),
        );
    }
    return Boolean(
        extraction.contractPrefill &&
            Object.keys(extraction.contractPrefill).some((k) =>
                str(extraction.contractPrefill?.[k]),
            ),
    );
}
