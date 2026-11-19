import type { ContractPrefillField } from "./Contract";

const BALANCE_TRANSFER_SCOPE = "balance_transfer_";

/** DocuSign Data Labels on WOODMERE LLC — Balance Transfer Sheet. */
export interface BalanceTransferSheetContractPrefillFields {
    merchantLegalName?: string;
    businessLegalName?: string;
    clientLegalName?: string;
    clientNameBy?: string;
    dba?: string;
    businessAddress?: string;
    businessAddressCity?: string;
    businessAddressState?: string;
    businessAddressZip?: string;
    /** Letter header — remaining RTR / payoff balance on the prior agreement. */
    remainingRtrBalance?: string;
    funderNameWithDealPrefix?: string;
    dealIdPrefix?: string;
}

const FIELD_DEFS: Array<{ id: keyof BalanceTransferSheetContractPrefillFields; label: string }> = [
    { id: "merchantLegalName", label: "Merchant legal name" },
    { id: "businessLegalName", label: "Business legal name" },
    { id: "clientLegalName", label: "Client legal name" },
    { id: "clientNameBy", label: "Client name by" },
    { id: "dba", label: "DBA" },
    { id: "businessAddress", label: "Business address" },
    { id: "businessAddressCity", label: "Business address city" },
    { id: "businessAddressState", label: "Business address state" },
    { id: "businessAddressZip", label: "Business address ZIP" },
    { id: "remainingRtrBalance", label: "Remaining RTR balance" },
    { id: "funderNameWithDealPrefix", label: "Funder name (Deal ID prefix)" },
    { id: "dealIdPrefix", label: "Deal ID prefix" },
];

/** Map CRM field key → DocuSign tab label (snake_case data labels on the PDF). */
export const BALANCE_TRANSFER_SHEET_TAB_LABEL_BY_KEY: Record<
    keyof BalanceTransferSheetContractPrefillFields,
    string
> = {
    merchantLegalName: `${BALANCE_TRANSFER_SCOPE}merchant_legal_name`,
    businessLegalName: `${BALANCE_TRANSFER_SCOPE}business_legal_name`,
    clientLegalName: `${BALANCE_TRANSFER_SCOPE}client_legal_name`,
    clientNameBy: `${BALANCE_TRANSFER_SCOPE}client_name_by`,
    dba: `${BALANCE_TRANSFER_SCOPE}dba`,
    businessAddress: `${BALANCE_TRANSFER_SCOPE}business_address`,
    businessAddressCity: `${BALANCE_TRANSFER_SCOPE}business_address_city`,
    businessAddressState: `${BALANCE_TRANSFER_SCOPE}business_address_state`,
    businessAddressZip: `${BALANCE_TRANSFER_SCOPE}business_address_zip`,
    remainingRtrBalance: `${BALANCE_TRANSFER_SCOPE}remaining_rtr_balance`,
    funderNameWithDealPrefix: `${BALANCE_TRANSFER_SCOPE}funder_name_with_deal_prefix`,
    dealIdPrefix: `${BALANCE_TRANSFER_SCOPE}deal_id_prefix`,
};

export function formatFunderNameWithDealIdPrefix(
    funderName?: string | null,
    dealIdPrefix?: string | null,
    displayName?: string | null,
): string {
    const name = String(displayName || funderName || "").trim();
    const prefix = String(dealIdPrefix || "").trim();
    if (!name && !prefix) return "";
    if (!name) return `("${prefix}")`;
    if (!prefix) return name;
    return `${name} ("${prefix}")`;
}

export function buildBalanceTransferSheetContractPrefillFields(
    values: BalanceTransferSheetContractPrefillFields = {},
): ContractPrefillField[] {
    const out: ContractPrefillField[] = [];
    for (const { id, label } of FIELD_DEFS) {
        const v = String(values[id] ?? "").trim();
        out.push({ id: BALANCE_TRANSFER_SHEET_TAB_LABEL_BY_KEY[id], label, value: v });
    }
    return out;
}
