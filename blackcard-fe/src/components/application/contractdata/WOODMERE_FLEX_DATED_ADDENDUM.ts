import type { ContractPrefillField } from "./Contract";

const FIELD_IDS = {
    addendumDated: ["addendum_dated"],
    agreementDate: ["agreement_date"],
    clientNameAddendum: ["client_name_addendum"],
    clientName: ["client_name"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: trimmed }));
};

/** DocuSign prefill source values for the Woodmere Flex Addendum (dated) template. */
export interface WoodmereFlexDatedAddendumContractPrefillFields {
    addendumDated?: string;
    agreementDate?: string;
    clientNameAddendum?: string;
    clientName?: string;
}

export function buildWoodmereFlexDatedAddendumContractPrefillFields({
    addendumDated = "",
    agreementDate = "",
    clientNameAddendum = "",
    clientName = "",
}: WoodmereFlexDatedAddendumContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.addendumDated, "Addendum Dated", addendumDated),
        ...mapIds(FIELD_IDS.agreementDate, "Agreement Date", agreementDate),
        ...mapIds(FIELD_IDS.clientNameAddendum, "Client Name Addendum", clientNameAddendum),
        ...mapIds(FIELD_IDS.clientName, "Client Name", clientName),
    ];
}
