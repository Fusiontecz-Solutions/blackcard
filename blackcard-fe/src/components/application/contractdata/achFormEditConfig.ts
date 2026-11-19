import type { BuildContractPrefillFieldsArgs } from "./Contract";

/**
 * Text Data Labels on ACH layouts
 * (`ach_authorization.layout.json` / `ach_authorization_standalone.layout.json`).
 * Sign / initial / dateSigned tabs are filled in DocuSign — not editable here.
 *
 * Labels match the blank ACH PDF (e.g. EJM / Woodmere ACH BLANK FILLABLE).
 * Order follows the form: page 1 authorization → page 2 account holder (LTR rows).
 */
export const ACH_COORDINATE_MANIFEST_TEXT_TAB_LABELS = [
    "authorization_client_bank_name",
    "authorization_client_bank_routing",
    "authorization_client_bank_account",
    "authorization_client_name",
    "authorization_client_signer_name",
    "authorization_client_name_print",
    "authorization_client_tax_id",
    "authorized_business_phone",
    "ach_authorization_account_holder_name",
    "ach_authorization_account_holder_dba",
    "ach_authorization_account_holder_phone",
    "ach_authorization_account_holder_address",
    "ach_authorization_account_holder_city",
    "ach_authorization_account_holder_state",
    "ach_authorization_account_holder_zip",
    "ach_authorization_account_holder_bank_name",
    "ach_authorization_account_holder_bank_branch_city",
    "ach_authorization_account_holder_bank_state",
    "ach_authorization_account_holder_bank_zip",
    "ach_authorization_account_holder_bank_routing_number",
    "ach_authorization_account_holder_bank_account_number",
    "ach_authorization_account_holder_bank_transaction_fee",
    "ach_authorization_account_holder_bank_number_of_transactions",
    "ach_authorization_concent_account_holder_name",
] as const;

export type AchCoordinateTextTabLabel =
    (typeof ACH_COORDINATE_MANIFEST_TEXT_TAB_LABELS)[number];

type AchFormEditFieldKey = keyof Pick<
    BuildContractPrefillFieldsArgs,
    | "authorizationClientName"
    | "authorizationClientSignerName"
    | "authorizationClientBankName"
    | "authorizationClientBankRouting"
    | "authorizationClientBankAccount"
    | "authorizationClientNamePrint"
    | "authorizationClientTaxId"
    | "authorizedBusinessPhone"
    | "achAuthorizationAccountHolderName"
    | "achAuthorizationAccountHolderDba"
    | "achAuthorizationAccountHolderPhone"
    | "achAuthorizationAccountHolderAddress"
    | "achAuthorizationAccountHolderCity"
    | "achAuthorizationAccountHolderState"
    | "achAuthorizationAccountHolderZip"
    | "achAuthorizationAccountHolderBankName"
    | "achAuthorizationAccountHolderBankBranchCity"
    | "achAuthorizationAccountHolderBankState"
    | "achAuthorizationAccountHolderBankZip"
    | "achAuthorizationAccountHolderBankRoutingNumber"
    | "achAuthorizationAccountHolderBankAccountNumber"
    | "achAuthorizationAccountHolderBankTransactionFee"
    | "achAuthorizationAccountHolderBankNumberOfTransactions"
    | "achAuthorizationConcentAccountHolderName"
>;

export type AchFormEditField = {
    key: AchFormEditFieldKey;
    label: string;
    tabLabel: AchCoordinateTextTabLabel;
};

/** Edit ACH form — labels match the blank ACH PDF; ids match layout Data Labels. */
export const ACH_FORM_FLAT_FIELDS: AchFormEditField[] = [
    // Page 1 — Transfer Funds To/From + Seller Information
    {
        key: "authorizationClientBankName",
        label: "Name of bank",
        tabLabel: "authorization_client_bank_name",
    },
    {
        key: "authorizationClientBankRouting",
        label: "ABA transit / routing #",
        tabLabel: "authorization_client_bank_routing",
    },
    {
        key: "authorizationClientBankAccount",
        label: "Checking account",
        tabLabel: "authorization_client_bank_account",
    },
    {
        key: "authorizationClientName",
        label: "Seller's name",
        tabLabel: "authorization_client_name",
    },
    {
        key: "authorizationClientSignerName",
        label: "Business name (signer line)",
        tabLabel: "authorization_client_signer_name",
    },
    {
        key: "authorizationClientNamePrint",
        label: "Printed client name",
        tabLabel: "authorization_client_name_print",
    },
    {
        key: "authorizationClientTaxId",
        label: "Seller's tax ID",
        tabLabel: "authorization_client_tax_id",
    },
    // Page 2 — ACH Authorization
    {
        key: "authorizedBusinessPhone",
        label: "Authorized business phone number",
        tabLabel: "authorized_business_phone",
    },
    {
        key: "achAuthorizationAccountHolderName",
        label: "Account holder name",
        tabLabel: "ach_authorization_account_holder_name",
    },
    {
        key: "achAuthorizationAccountHolderDba",
        label: "Account holder DBA name",
        tabLabel: "ach_authorization_account_holder_dba",
    },
    {
        key: "achAuthorizationAccountHolderPhone",
        label: "Account holder phone",
        tabLabel: "ach_authorization_account_holder_phone",
    },
    {
        key: "achAuthorizationAccountHolderAddress",
        label: "Account holder address",
        tabLabel: "ach_authorization_account_holder_address",
    },
    {
        key: "achAuthorizationAccountHolderCity",
        label: "City",
        tabLabel: "ach_authorization_account_holder_city",
    },
    {
        key: "achAuthorizationAccountHolderState",
        label: "State",
        tabLabel: "ach_authorization_account_holder_state",
    },
    {
        key: "achAuthorizationAccountHolderZip",
        label: "ZIP",
        tabLabel: "ach_authorization_account_holder_zip",
    },
    {
        key: "achAuthorizationAccountHolderBankName",
        label: "Account holder's bank name",
        tabLabel: "ach_authorization_account_holder_bank_name",
    },
    {
        key: "achAuthorizationAccountHolderBankBranchCity",
        label: "Branch city",
        tabLabel: "ach_authorization_account_holder_bank_branch_city",
    },
    {
        key: "achAuthorizationAccountHolderBankState",
        label: "Bank state",
        tabLabel: "ach_authorization_account_holder_bank_state",
    },
    {
        key: "achAuthorizationAccountHolderBankZip",
        label: "Bank ZIP",
        tabLabel: "ach_authorization_account_holder_bank_zip",
    },
    {
        key: "achAuthorizationAccountHolderBankRoutingNumber",
        label: "Bank routing number",
        tabLabel: "ach_authorization_account_holder_bank_routing_number",
    },
    {
        key: "achAuthorizationAccountHolderBankAccountNumber",
        label: "Bank account number",
        tabLabel: "ach_authorization_account_holder_bank_account_number",
    },
    {
        key: "achAuthorizationAccountHolderBankTransactionFee",
        label: "Rate / amount ($)",
        tabLabel: "ach_authorization_account_holder_bank_transaction_fee",
    },
    {
        key: "achAuthorizationAccountHolderBankNumberOfTransactions",
        label: "No. of transactions",
        tabLabel: "ach_authorization_account_holder_bank_number_of_transactions",
    },
    {
        key: "achAuthorizationConcentAccountHolderName",
        label: "Business name",
        tabLabel: "ach_authorization_concent_account_holder_name",
    },
];

export const ACH_FORM_FLAT_FIELD_KEYS = new Set(
    ACH_FORM_FLAT_FIELDS.map((f) => f.key),
) as Set<keyof BuildContractPrefillFieldsArgs>;

/** Prefill / DocuSign field ids for the Edit ACH form modal (same as layout Data Labels). */
export const ACH_AUTHORIZATION_EDITABLE_FIELD_IDS: readonly string[] =
    ACH_FORM_FLAT_FIELDS.map((f) => f.tabLabel);

export const ACH_AUTHORIZATION_FIELD_LABELS: Record<string, string> = Object.fromEntries(
    ACH_FORM_FLAT_FIELDS.map((f) => [f.tabLabel, f.label]),
);

/**
 * Stable key inside `documentTemplatePrefillByMappingId` so ACH edits survive when the
 * mapping row id changes (synthetic `ach-template-*` → real DB mapping id).
 */
export const ACH_PREFILL_MAPPING_ALIAS_KEY = "ach_authorization";

/**
 * ACH tabs that must show Manage Signers / Signer 1 person name (not business legal name).
 * Stale Edit ACH saves and business-name aliases used to leave these wrong on the envelope.
 */
export const ACH_SIGNER_PERSON_NAME_TAB_IDS = [
    "authorization_client_name_print",
    "ach_authorization_concent_account_holder_name",
    "ach_authorization_concent_account_holder_name_2",
] as const;

function normalizeAchTabIdForSignerPersonMatch(fieldId: string): string {
    return String(fieldId || "")
        .trim()
        .toLowerCase()
        .replace(/^ach_form_texas_/, "")
        .replace(/^ach_form_/, "")
        .replace(/__instance_\d+$/i, "")
        .replace(/__p\d+_[a-z0-9]+$/i, "")
        .replace(/__page\d+$/i, "");
}

/** Force printed client / consent name tabs to the live DocuSign Signer 1 name. */
export function applyAchSignerPersonNameToPrefillFields<
    T extends { id: string; value: string; label?: string },
>(fields: T[], signerName: string, options?: { achPrefix?: string }): T[] {
    const name = String(signerName || "").trim();
    if (!name) return fields;
    const personIds = new Set<string>(ACH_SIGNER_PERSON_NAME_TAB_IDS);
    const prefix = String(options?.achPrefix || "ach_form_").trim() || "ach_form_";
    const byId = new Map(fields.map((f) => [f.id, { ...f }]));

    for (const [id, row] of [...byId.entries()]) {
        if (personIds.has(normalizeAchTabIdForSignerPersonMatch(id))) {
            byId.set(id, { ...row, value: name });
        }
    }
    for (const id of ACH_SIGNER_PERSON_NAME_TAB_IDS) {
        for (const key of [id, `${prefix}${id}`]) {
            const existing = byId.get(key);
            byId.set(
                key,
                existing
                    ? { ...existing, value: name }
                    : ({ id: key, label: key, value: name } as T),
            );
        }
    }
    return Array.from(byId.values());
}

/** DocuSign tabLabel → camelCase contract prefill keys. */
export function achTabValuesToCamelPartial(
    values: Record<string, string>,
): Partial<BuildContractPrefillFieldsArgs> {
    const out: Partial<BuildContractPrefillFieldsArgs> = {};
    for (const field of ACH_FORM_FLAT_FIELDS) {
        const raw = values[field.tabLabel];
        (out as Record<string, string>)[field.key] =
            raw === undefined || raw === null ? "" : String(raw);
    }
    return out;
}

/** camelCase contract prefill → DocuSign tabLabel map. */
export function achCamelPartialToTabValues(
    partial: Partial<BuildContractPrefillFieldsArgs> | null | undefined,
): Record<string, string> {
    const out: Record<string, string> = {};
    if (!partial) return out;
    for (const field of ACH_FORM_FLAT_FIELDS) {
        const raw = partial[field.key];
        if (raw === undefined || raw === null) continue;
        out[field.tabLabel] = String(raw);
    }
    return out;
}

/** Prefer mapping-row overrides, then the stable ACH alias. */
export function resolveAchSavedMappingOverrides(
    blob: Record<string, Record<string, string>> | null | undefined,
    mappingId?: string | null,
    options?: { allowAliasFallback?: boolean },
): Record<string, string> {
    const map = blob ?? {};
    const byId = mappingId ? map[String(mappingId)] : undefined;
    if (byId && typeof byId === "object" && Object.keys(byId).length > 0) {
        return { ...byId };
    }
    // The alias holds whichever ACH form was saved last. With several forms on one
    // contract, falling back to it copies that form's values onto all the others.
    if (options?.allowAliasFallback === false) return {};
    const alias = map[ACH_PREFILL_MAPPING_ALIAS_KEY];
    if (alias && typeof alias === "object") return { ...alias };
    return {};
}

/** ACH Info Required / `ACH` table payload from edit-form camelCase values. */
export function achCamelPartialToAchRecordPatch(
    partial: Partial<BuildContractPrefillFieldsArgs>,
): Record<string, string | undefined> {
    const g = (key: keyof BuildContractPrefillFieldsArgs) => {
        const v = String(partial[key] ?? "").trim();
        return v || undefined;
    };
    return {
        bankName:
            g("achAuthorizationAccountHolderBankName") || g("authorizationClientBankName"),
        accountHolderName: g("achAuthorizationAccountHolderName") || g("authorizationClientName"),
        accountNumber:
            g("achAuthorizationAccountHolderBankAccountNumber") ||
            g("authorizationClientBankAccount"),
        routingNumber:
            g("achAuthorizationAccountHolderBankRoutingNumber") ||
            g("authorizationClientBankRouting"),
        dba: g("achAuthorizationAccountHolderDba"),
        phone: g("achAuthorizationAccountHolderPhone") || g("authorizedBusinessPhone"),
        address: g("achAuthorizationAccountHolderAddress"),
        city: g("achAuthorizationAccountHolderCity"),
        state: g("achAuthorizationAccountHolderState"),
        zip: g("achAuthorizationAccountHolderZip"),
        bankBranchCity: g("achAuthorizationAccountHolderBankBranchCity"),
        bankState: g("achAuthorizationAccountHolderBankState"),
        bankZip: g("achAuthorizationAccountHolderBankZip"),
        paymentAmount: g("achAuthorizationAccountHolderBankTransactionFee"),
    };
}
