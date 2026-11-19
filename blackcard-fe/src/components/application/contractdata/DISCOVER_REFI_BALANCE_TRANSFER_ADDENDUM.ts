import type { ContractPrefillField } from "./Contract";

const FIELD_IDS = {
    loanAgreementDated: ["loan_agreement_dated"],
    borrowerName: ["borrower_name"],
    borrowerPay: ["borrower_pay"],
    financialDate: ["financial_date"],
    previousFinancingDirectlyTo: ["previous_financing_directly_to"],
    borrowerName1: ["borrower_name1"],
    borrowerTitle1: ["borrower_title1"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: trimmed }));
};

/** BoldSign prefill source values for the Discover Refi Balance Transfer Addendum template. */
export interface DiscoverRefiBalanceTransferAddendumContractPrefillFields {
    loanAgreementDated?: string;
    borrowerName?: string;
    borrowerPay?: string;
    financialDate?: string;
    previousFinancingDirectlyTo?: string;
    borrowerName1?: string;
    borrowerTitle1?: string;
}

export function buildDiscoverRefiBalanceTransferAddendumContractPrefillFields({
    loanAgreementDated = "",
    borrowerName = "",
    borrowerPay = "",
    financialDate = "",
    previousFinancingDirectlyTo = "",
    borrowerName1 = "",
    borrowerTitle1 = "",
}: DiscoverRefiBalanceTransferAddendumContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.loanAgreementDated, "Loan Agreement Dated", loanAgreementDated),
        ...mapIds(FIELD_IDS.borrowerName, "Borrower Name", borrowerName),
        ...mapIds(FIELD_IDS.borrowerPay, "Borrower Pay", borrowerPay),
        ...mapIds(FIELD_IDS.financialDate, "Financial Date", financialDate),
        ...mapIds(FIELD_IDS.previousFinancingDirectlyTo, "Previous Financing Directly To", previousFinancingDirectlyTo),
        ...mapIds(FIELD_IDS.borrowerName1, "Borrower Name 1", borrowerName1),
        ...mapIds(FIELD_IDS.borrowerTitle1, "Borrower Title 1", borrowerTitle1),
    ];
}
