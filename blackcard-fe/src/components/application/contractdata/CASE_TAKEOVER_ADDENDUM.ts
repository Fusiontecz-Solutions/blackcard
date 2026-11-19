import type { ContractPrefillField } from "./Contract";

export const CASE_TAKEOVER_ADDENDUM_SCOPE = "case_takeover_addendum_";

/** Prefill fields for Case Takeover Balance Transfer (refinance / financing payoff addendum). */
export interface CaseTakeoverAddendumContractPrefillFields {
    funderName?: string;
    loanAgreementDated?: string;
    borrowerName?: string;
    borrowerPay?: string;
    financialDate?: string;
    previousFinancingDirectlyTo?: string;
    borrowerName1?: string;
    borrowerTitle1?: string;
}

const FIELD_DEFS: Array<{
    id: keyof CaseTakeoverAddendumContractPrefillFields;
    label: string;
}> = [
    { id: "funderName", label: "Funder Name" },
    { id: "loanAgreementDated", label: "Loan Agreement Dated" },
    { id: "borrowerName", label: "Borrower Name" },
    { id: "borrowerPay", label: "Payoff Amount" },
    { id: "financialDate", label: "Previous Financing Date" },
    { id: "previousFinancingDirectlyTo", label: "Previous Financing Directly To" },
    { id: "borrowerName1", label: "Borrower Print Name" },
    { id: "borrowerTitle1", label: "Borrower Title" },
];

export const CASE_TAKEOVER_ADDENDUM_TAB_LABEL_BY_KEY: Record<
    keyof CaseTakeoverAddendumContractPrefillFields,
    string
> = {
    funderName: `${CASE_TAKEOVER_ADDENDUM_SCOPE}funder_name`,
    loanAgreementDated: `${CASE_TAKEOVER_ADDENDUM_SCOPE}loan_agreement_dated`,
    borrowerName: `${CASE_TAKEOVER_ADDENDUM_SCOPE}borrower_name`,
    borrowerPay: `${CASE_TAKEOVER_ADDENDUM_SCOPE}borrower_pay`,
    financialDate: `${CASE_TAKEOVER_ADDENDUM_SCOPE}financial_date`,
    previousFinancingDirectlyTo: `${CASE_TAKEOVER_ADDENDUM_SCOPE}previous_financing_directly_to`,
    borrowerName1: `${CASE_TAKEOVER_ADDENDUM_SCOPE}borrower_name1`,
    borrowerTitle1: `${CASE_TAKEOVER_ADDENDUM_SCOPE}borrower_title1`,
};

export function buildCaseTakeoverAddendumContractPrefillFields(
    values: CaseTakeoverAddendumContractPrefillFields = {},
): ContractPrefillField[] {
    const out: ContractPrefillField[] = [];
    for (const { id, label } of FIELD_DEFS) {
        const v = String(values[id] ?? "").trim();
        out.push({
            id: CASE_TAKEOVER_ADDENDUM_TAB_LABEL_BY_KEY[id],
            label,
            value: v,
        });
    }
    return out;
}
