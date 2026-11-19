import type { ContractPrefillField } from "./Contract";

const FIELD_IDS = {
    addendumEnteredDate: ["addendum_entered_date"],
    addendumAgreementDate: ["addendum_agreement_date"],
    clientName: ["client_name"],
    agreeName: ["agree_name"],
    advanceRemit: ["advance_remit"],
    agreementTo: ["agreement_to"],
    amountOfDirecltyDisbursed: ["amount_of_direclty_disbursed"],
    transferFundTo: ["transfer_fund_to"],
    nameOfBank: ["name_of_bank"],
    abaRouting: ["aba_routing"],
    checkingAccount: ["checking_account"],
    transferAmount: ["transfer_amount"],
    ownerName: ["owner_name"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: trimmed }));
};

/** DocuSign prefill source values for the Woodmere Buyout Blank Addendum template. */
export interface WoodmereBuyoutBlankAddendumContractPrefillFields {
    addendumEnteredDate?: string;
    addendumAgreementDate?: string;
    clientName?: string;
    agreeName?: string;
    advanceRemit?: string;
    agreementTo?: string;
    amountOfDirecltyDisbursed?: string;
    transferFundTo?: string;
    nameOfBank?: string;
    abaRouting?: string;
    checkingAccount?: string;
    transferAmount?: string;
    ownerName?: string;
}

export function buildWoodmereBuyoutBlankAddendumContractPrefillFields({
    addendumEnteredDate = "",
    addendumAgreementDate = "",
    clientName = "",
    agreeName = "",
    advanceRemit = "",
    agreementTo = "",
    amountOfDirecltyDisbursed = "",
    transferFundTo = "",
    nameOfBank = "",
    abaRouting = "",
    checkingAccount = "",
    transferAmount = "",
    ownerName = "",
}: WoodmereBuyoutBlankAddendumContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.addendumEnteredDate, "Addendum Entered Date", addendumEnteredDate),
        ...mapIds(FIELD_IDS.addendumAgreementDate, "Addendum Agreement Date", addendumAgreementDate),
        ...mapIds(FIELD_IDS.clientName, "Client Name", clientName),
        ...mapIds(FIELD_IDS.agreeName, "Agree Name", agreeName),
        ...mapIds(FIELD_IDS.advanceRemit, "Advance Remit", advanceRemit),
        ...mapIds(FIELD_IDS.agreementTo, "Agreement To", agreementTo),
        ...mapIds(FIELD_IDS.amountOfDirecltyDisbursed, "Amount Of Directly Disbursed", amountOfDirecltyDisbursed),
        ...mapIds(FIELD_IDS.transferFundTo, "Transfer Fund To", transferFundTo),
        ...mapIds(FIELD_IDS.nameOfBank, "Name Of Bank", nameOfBank),
        ...mapIds(FIELD_IDS.abaRouting, "ABA Routing", abaRouting),
        ...mapIds(FIELD_IDS.checkingAccount, "Checking Account", checkingAccount),
        ...mapIds(FIELD_IDS.transferAmount, "Transfer Amount", transferAmount),
        ...mapIds(FIELD_IDS.ownerName, "Owner Name", ownerName),
    ];
}
