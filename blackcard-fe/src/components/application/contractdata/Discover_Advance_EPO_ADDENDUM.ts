import type { ContractPrefillField } from "./Contract";

const FIELD_IDS = {
    loanAgreementDated: ["loan_agreement_dated"],
    borrowerName: ["borrower_name"],
    payingToDiscoverAgent60: ["paying_to_discover_agent_60"],
    payingToDiscoverAgent90: ["paying_to_discover_agent_90"],
    payingToDiscoverAgent120: ["paying_to_discover_agent_120"],
    printBorrowerName1: ["print_borrower_name1"],
    printBorrowerTitle1: ["print_borrower_title1"],
    printBorrowerName2: ["print_borrower_name2"],
    printBorrowerTitle2: ["print_borrower_title2"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: trimmed }));
};

/** BoldSign prefill source values for the Discover Advance EPO Addendum template. */
export interface DiscoverAdvanceEpoAddendumContractPrefillFields {
    loanAgreementDated?: string;
    borrowerName?: string;
    payingToDiscoverAgent60?: string;
    payingToDiscoverAgent90?: string;
    payingToDiscoverAgent120?: string;
    printBorrowerName1?: string;
    printBorrowerTitle1?: string;
    printBorrowerName2?: string;
    printBorrowerTitle2?: string;
}

export function buildDiscoverAdvanceEpoAddendumContractPrefillFields({
    loanAgreementDated = "",
    borrowerName = "",
    payingToDiscoverAgent60 = "",
    payingToDiscoverAgent90 = "",
    payingToDiscoverAgent120 = "",
    printBorrowerName1 = "",
    printBorrowerTitle1 = "",
    printBorrowerName2 = "",
    printBorrowerTitle2 = "",
}: DiscoverAdvanceEpoAddendumContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.loanAgreementDated, "Loan Agreement Dated", loanAgreementDated),
        ...mapIds(FIELD_IDS.borrowerName, "Borrower Name", borrowerName),
        ...mapIds(FIELD_IDS.payingToDiscoverAgent60, "Paying To Discover Agent 60", payingToDiscoverAgent60),
        ...mapIds(FIELD_IDS.payingToDiscoverAgent90, "Paying To Discover Agent 90", payingToDiscoverAgent90),
        ...mapIds(FIELD_IDS.payingToDiscoverAgent120, "Paying To Discover Agent 120", payingToDiscoverAgent120),
        ...mapIds(FIELD_IDS.printBorrowerName1, "Print Borrower Name 1", printBorrowerName1),
        ...mapIds(FIELD_IDS.printBorrowerTitle1, "Print Borrower Title 1", printBorrowerTitle1),
        ...mapIds(FIELD_IDS.printBorrowerName2, "Print Borrower Name 2", printBorrowerName2),
        ...mapIds(FIELD_IDS.printBorrowerTitle2, "Print Borrower Title 2", printBorrowerTitle2),
    ];
}
