import type { ContractPrefillField } from "./Contract";
import { formatEditorAmountFieldForDisplay } from "./prefillFieldDisplay";
import { TEXAS_DISCLOSURE_PAGE3_DEFAULT_AMOUNT } from "./texas_disclosure";

const FIELD_IDS = {
    clientName: ["disclosure_pdf__client_name", "disclosure_client_name"],
    funderName: ["funder_name"],
    dealIdPrefix: ["deal_id_prefix"],
    totalAmountBusinessFund: ["total_amount_business_fund"],
    totalAmountBusinessFund2: ["total_amount_business_fund_2"],
    totalAmountOfFundDisbursed: [
        "total_amount_of_fund_disbursed",
        "funding_provided",
        "disclosure_purchase_price",
        "purchase_amount",
        "total_amount_business_fund",
    ],
    totalAmountTobePaidToProvider: ["total_amount_tobe_paid_to_provider"],
    totalDollarCost: ["total_dollar_cost"],
    estimatedTerm: ["estimated_term"],
    estimatedPaymentAmount: ["estimated_payment_amount"],
    estimatedMonthlyCost: ["estimated_monthly_cost"],
    disclosureBrokerFee: ["disclosure_broker_fee"],
    disclosurePage3Line1: ["disclosure_page3_line_1"],
    disclosurePage3Line2: ["disclosure_page3_line_2"],
    disclosurePage3Net: ["disclosure_page3_net"],
    signatureDate: ["Signature_date"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: formatEditorAmountFieldForDisplay(id, trimmed) }));
};

const mapIdsWithDefault = (
    ids: readonly string[],
    label: string,
    value: string | undefined,
    defaultValue: string,
): ContractPrefillField[] => {
    const trimmed = String(value ?? "").trim() || defaultValue;
    return ids.map((id) => ({ id, label, value: formatEditorAmountFieldForDisplay(id, trimmed) }));
};

/** BoldSign / DocuSign prefill source values for Texas state disclosure templates. */
export interface DailyTexasContractPrefillFields {
    clientName?: string;
    funderName?: string;
    dealIdPrefix?: string;
    totalAmountBusinessFund?: string;
    totalAmountBusinessFund2?: string;
    totalAmountOfFundDisbursed?: string;
    totalAmountTobePaidToProvider?: string;
    totalDollarCost?: string;
    estimatedTerm?: string;
    estimatedPaymentAmount?: string;
    estimatedMonthlyCost?: string;
    disclosureBrokerFee?: string;
    disclosurePage3Line1?: string;
    disclosurePage3Line2?: string;
    disclosurePage3Net?: string;
    signatureDate?: string;
}

export function buildDailyTexasContractPrefillFields({
    clientName = "",
    funderName = "",
    dealIdPrefix = "",
    totalAmountBusinessFund = "",
    totalAmountBusinessFund2 = "",
    totalAmountOfFundDisbursed = "",
    totalAmountTobePaidToProvider = "",
    totalDollarCost = "",
    estimatedTerm = "",
    estimatedPaymentAmount = "",
    estimatedMonthlyCost = "",
    disclosureBrokerFee = "",
    disclosurePage3Line1 = TEXAS_DISCLOSURE_PAGE3_DEFAULT_AMOUNT,
    disclosurePage3Line2 = TEXAS_DISCLOSURE_PAGE3_DEFAULT_AMOUNT,
    disclosurePage3Net = TEXAS_DISCLOSURE_PAGE3_DEFAULT_AMOUNT,
    signatureDate = "",
}: DailyTexasContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.clientName, "Business name", clientName),
        ...mapIds(FIELD_IDS.funderName, "Funder / provider name", funderName),
        ...mapIds(FIELD_IDS.dealIdPrefix, "Deal ID prefix", dealIdPrefix),
        ...mapIds(FIELD_IDS.totalAmountBusinessFund, "Total amount business fund", totalAmountBusinessFund),
        ...mapIds(
            FIELD_IDS.totalAmountBusinessFund2,
            "Total amount business fund 2",
            totalAmountBusinessFund2,
        ),
        ...mapIds(
            FIELD_IDS.totalAmountOfFundDisbursed,
            "Total amount of fund disbursed",
            totalAmountOfFundDisbursed,
        ),
        ...mapIds(
            FIELD_IDS.totalAmountTobePaidToProvider,
            "Total amount to be paid to provider",
            totalAmountTobePaidToProvider,
        ),
        ...mapIds(FIELD_IDS.totalDollarCost, "Total dollar cost", totalDollarCost),
        ...mapIds(FIELD_IDS.estimatedTerm, "Estimated term (days)", estimatedTerm),
        ...mapIds(FIELD_IDS.estimatedPaymentAmount, "Estimated payment amount", estimatedPaymentAmount),
        ...mapIds(FIELD_IDS.estimatedMonthlyCost, "Estimated monthly cost", estimatedMonthlyCost),
        ...mapIds(FIELD_IDS.disclosureBrokerFee, "Broker fee (paid to broker)", disclosureBrokerFee),
        ...mapIdsWithDefault(
            FIELD_IDS.disclosurePage3Line1,
            "Page 3 line 1 amount",
            disclosurePage3Line1,
            TEXAS_DISCLOSURE_PAGE3_DEFAULT_AMOUNT,
        ),
        ...mapIdsWithDefault(
            FIELD_IDS.disclosurePage3Line2,
            "Page 3 line 2 amount",
            disclosurePage3Line2,
            TEXAS_DISCLOSURE_PAGE3_DEFAULT_AMOUNT,
        ),
        ...mapIdsWithDefault(
            FIELD_IDS.disclosurePage3Net,
            "Page 3 net amount",
            disclosurePage3Net,
            TEXAS_DISCLOSURE_PAGE3_DEFAULT_AMOUNT,
        ),
        ...mapIds(FIELD_IDS.signatureDate, "Signature date", signatureDate),
    ];
}
