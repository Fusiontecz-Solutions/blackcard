import { resolveOfferFeeAmountForDeal } from "@/lib/offerDecisionFees";
import {
    computePerPeriodPayment,
    parseTerm,
    recalculateOfferFields,
    resolveOfferFactorRate,
    resolveOfferPayback,
    type OfferCalcDriverField,
} from "@/lib/offerRepaymentCalculations";
import { formatRateUS } from "@/lib/utils";
import { formatUSD, parseMoneyInput } from "@/utils/formatCurrency";
import {
    clearParty2PrefillFieldPayload,
    clearParty2PrefillPartial,
    resolveActiveOwnerCount,
    resolveSecondOwnerSignerName,
    syncOwner2NameToPrefillPartial,
} from "./contractPartyCounts";
import { resolveOwnerRowsForContractPrefill } from "./contractSignerOwnersSync";
import {
    buildDocuSignRolesFromEditorRows,
    parseContractSignerOverridesFromPrefill,
} from "./templateRecipients";
import {
    isTexasContractState,
    isTexasFundingGroupFunder,
    resolveMainContractLayoutKey,
    PLATFORM_LAYOUT_KEYS,
} from "./platformDocumentConfig";
import { isTexasOnlyAllowedStates } from "@/utils/usStateMatch";

export interface ContractPrefillField {
    id: string;
    label: string;
    value: string;
}

export interface BuildContractPrefillFieldsArgs {
    customerName: string;
    entityType?: string;
    legalName?: string;
    doingBusinessAs?: string;
    businessAddress?: string;
    federalTaxIdEin?: string;
    agreementDate?: string;
    state?: string;
    businessAddressCity?: string;
    businessAddressState?: string;
    businessAddressZip?: string;
    businessAddressContract?: string;
    businessAddressContractCity?: string;
    businessAddressContractState?: string;
    businessAddressContractZip?: string;
    guarantorAddress?: string;
    guarantorAddressCity?: string;
    guarantorAddressState?: string;
    guarantorAddressZip?: string;
    clientEmail?: string;
    guarantorEmail?: string;
    guarantorPhone?: string;
    clientPhone?: string;
    purchasePrice?: string;
    purchaseAmount?: string;
    purchasePercent?: string;
    remittance?: string;
    /** Payment frequency (e.g. Daily, Weekly). DocuSign data label: `frequency`; BoldSign may use `paymentTerms`. */
    frequency?: string;
    /** Recipient funds / net cash to merchant (offer − fees − refinance). DocuSign: `net_to_merchant`. */
    netToMerchant?: string;

    clientName?: string;
    owner1GuarantorName?: string;
    owner2GuarantorName?: string;
    merchant2Name?: string;
    appendixMerchant2Name?: string;
    businessName2?: string;
    securityBusinessName?: string;
    securityTaxEin?: string;
    securityDoingBusinessAs?: string;
    securityBusinessAddress?: string;
    securityBusinessAddressCity?: string;
    securityBusinessAddressState?: string;
    securityBusinessAddressZip?: string;
    securityGuarantor?: string;
    guarantyClientName?: string;
    guarantySs?: string;
    guarantySsDriverLicense?: string;
    guarantyOwner1Name?: string;
    guarantyOwner1Ss?: string;
    guarantyOwner1DriverLicense?: string;
    guarantyOwner2Name?: string;
    guarantyOwner2DriverLicense?: string;
    guarantyOwner2Ss?: string;
    guarantyGuarantor1Name?: string;
    guarantyGuarantor1Ss?: string;
    guarantyGuarantor1DriverLicense?: string;
    guarantyGuarantor2Name?: string;
    guarantyGuarantor2Ss?: string;
    guarantyGuarantor2DriverLicense?: string;
    appendixUnderwritingFees?: string;
    appendixClientName?: string;
    authorizationApplication?: string;
    authorizationClientBankName?: string;
    authorizationClientBankRouting?: string;
    authorizationClientBankAccount?: string;
    authorizationClientName?: string;
    authorizationClientSignerName?: string;
    authorizationClientNamePrint?: string;
    authorizationClientTaxId?: string;
    authorizationClientDate?: string;
    authorizedBusinessPhone?: string;
    achAuthorizationAccountHolderName?: string;
    achAuthorizationAccountHolderDba?: string;
    achAuthorizationAccountHolderPhone?: string;
    achAuthorizationAccountHolderAddress?: string;
    achAuthorizationAccountHolderCity?: string;
    achAuthorizationAccountHolderState?: string;
    achAuthorizationAccountHolderZip?: string;
    achAuthorizationAccountHolderBankName?: string;
    achAuthorizationAccountHolderBankBranchCity?: string;
    achAuthorizationAccountHolderBankState?: string;
    achAuthorizationAccountHolderBankZip?: string;
    achAuthorizationAccountHolderBankRoutingNumber?: string;
    achAuthorizationAccountHolderBankAccountNumber?: string;
    achAuthorizationAccountHolderBankTransactionFee?: string;
    /** Term of offer — number of payments / transactions for ACH form. */
    achAuthorizationAccountHolderBankNumberOfTransactions?: string;
    achAuthorizationAccountHolderDate?: string;

    /**
     * Some templates use a "concent" (sic) variation of the ACH authorization fields.
     * These are separate from `achAuthorizationAccountHolderName/Date` but map to their own BoldSign ids.
     */
    achAuthorizationConcentAccountHolderName?: string;
    achAuthorizationConcentAccountHolderName2?: string;
    achAuthorizationConcentAccountHolderDate?: string;

    achAuthorizationBankPortalWebsite?: string;
    achAuthorizationUsername?: string;
    achAuthorizationPassword?: string;
    achAuthorizationSecurityQuestion1?: string;
    achAuthorizationSecurityQuestion2?: string;
    achAuthorizationSecurityQuestion3?: string;
    achAuthorizationSecurityAnswer1?: string;
    achAuthorizationSecurityAnswer2?: string;
    achAuthorizationSecurityAnswer3?: string;
    achAuthorizationOtherInfomation?: string;
    // Optional snake_case aliases for external payload compatibility.
    ach_authorization_bank_portal_website?: string;
    ach_authorization_username?: string;
    ach_authorization_password?: string;
    ach_authorization_security_question1?: string;
    ach_authorization_security_answer1?: string;
    ach_authorization_security_question2?: string;
    ach_authorization_security_answer2?: string;
    ach_authorization_security_question3?: string;
    ach_authorization_security_answer3?: string;
    ach_authorization_other_infomation?: string;
    achAuthorizationReferenceName1?: string;
    achAuthorizationReferenceNumber1?: string;
    achAuthorizationReferenceRelationship1?: string;
    achAuthorizationReferenceName2?: string;
    achAuthorizationReferenceNumber2?: string;
    achAuthorizationReferenceRelationship2?: string;
    achAuthorizationReferenceName3?: string;
    achAuthorizationReferenceNumber3?: string;
    achAuthorizationReferenceRelationship3?: string;
    addendumDated?: string;
    addendumDatedPrincipalOwner?: string;
    addendumDatedPrincipalBusiness?: string;
    addendumDatedBusinessLocation?: string;
    addendumDatedPrincipalState?: string;
    addendumDatedPrincipalOwnerAmount?: string;
    addendumDatedPrincipalOwnerAmount2?: string;
    addendumDatedPrincipalOwner1Name?: string;
    addendumDatedPrincipalOwner1Date?: string;
    addendumDatedPrincipalOwner2Name?: string;
    addendumDatedPrincipalOwner2Date?: string;
    exhibitOwnerName?: string;
    /** Exhibit A line items (DocuSign data labels `exhibit_a_value_1` … `exhibit_a_value_10`). */
    exhibitAValue1?: string;
    exhibitAValue2?: string;
    exhibitAValue3?: string;
    exhibitAValue4?: string;
    exhibitAValue5?: string;
    exhibitAValue6?: string;
    exhibitAValue7?: string;
    exhibitAValue8?: string;
    exhibitAValue9?: string;
    exhibitAValue10?: string;
}

export const EXHIBIT_A_VALUE_COUNT = 10;

export type ExhibitAValueFieldKey = `exhibitAValue${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;

export const EXHIBIT_A_VALUE_FIELD_KEYS: readonly ExhibitAValueFieldKey[] = Array.from(
    { length: EXHIBIT_A_VALUE_COUNT },
    (_, i) => `exhibitAValue${i + 1}` as ExhibitAValueFieldKey,
);

const FIELD_IDS = {
    agreementDate: ["agreement_date"],
    legalName: ["client_legal_name"],
    stateOfInc: ["state_of_inc"],
    doingBusinessAs: ["doing_business_as"],
    federalTaxIdEin: ["federal_tax_id_EIN"],
    entityType: ["entity_type"],
    businessAddress: ["business_address"],
    businessAddressCity: ["business_address_city"],
    businessAddressState: ["business_address_state"],
    businessAddressZip: ["business_address_zip"],
    businessAddressContract: ["business_address_contract"],
    businessAddressContractCity: ["business_address_contract_city"],
    businessAddressContractState: ["business_address_contract_state"],
    businessAddressContractZip: ["business_address_contract_zip"],
    guarantorAddress: ["guarantor_address"],
    guarantorAddressCity: ["guarantor_address_city"],
    guarantorAddressState: ["guarantor_address_state"],
    guarantorAddressZip: ["guarantor_address_zip"],
    clientEmail: ["client_email"],
    guarantorEmail: ["guarantor_email"],
    guarantorPhone: ["guarantor_phone"],
    clientPhone: ["client_phone"],
    purchasePrice: ["purchase_price"],
    purchaseAmount: ["purchase_amount"],
    purchasePercent: ["purchase_percent", "specified_percentage"],
    remittance: ["remittance"],
    frequency: ["frequency", "paymentTerms"],
    /** DocuSign: `net_to_merchant`; BoldSign template tabs often use `NetFundProvided`. */
    netToMerchant: ["net_to_merchant", "NetFundProvided"],

    clientName: ["client_name", "addendum_client_name"],
    owner1GuarantorName: ["owner1_guarantor_name"],
    owner2GuarantorName: ["owner2_guarantor_name"],
    merchant2Name: ["merchant2_name"],
    appendixMerchant2Name: ["appendix_merchant2_name"],
    businessName2: ["business_name_2"],
    securityBusinessName: ["security_business_name"],
    securityTaxEin: ["security_tax_ein"],
    securityDoingBusinessAs: ["security_doing_business_as"],
    securityBusinessAddress: ["security_business_address"],
    securityBusinessAddressCity: ["security_business_address_city"],
    securityBusinessAddressState: ["security_business_address_state"],
    securityBusinessAddressZip: ["security_business_address_zip"],
    securityGuarantor: ["security_guarantor"],

    guarantyClientName: ["guaranty_client_name"],
    guarantySs: ["guaranty_ss"],
    guarantySsDriverLicense: ["guaranty_ss_driver_license"],
    guarantyOwner1Name: ["guaranty_owner1_name"],
    guarantyOwner1Ss: ["guaranty_owner1_ss"],
    guarantyOwner1DriverLicense: ["guaranty_owner1_driver_license"],
    guarantyOwner2Name: ["guaranty_owner2_name"],
    guarantyOwner2DriverLicense: ["guaranty_owner2_driver_license"],
    guarantyOwner2Ss: ["guaranty_owner2_ss"],
    guarantyGuarantor1Name: ["guaranty_guarantor1_name"],
    guarantyGuarantor1Ss: ["guaranty_guarantor1_ss"],
    guarantyGuarantor1DriverLicense: ["guaranty_guarantor1_driver_license"],
    guarantyGuarantor2Name: ["guaranty_guarantor2_name"],
    guarantyGuarantor2Ss: ["guaranty_guarantor2_ss"],
    guarantyGuarantor2DriverLicense: ["guaranty_guarantor2_driver_license"],

    appendixUnderwritingFees: [
        "appendix_underwriting_fees",
        "underwriter_fee",
        "underwriterfee",
        "underwriter_fees",
    ],
    appendixClientName: ["appendix_client_name"],
    authorizationApplication: ["authorization_application"],
    authorizationClientBankName: ["authorization_client_bank_name"],
    authorizationClientBankRouting: ["authorization_client_bank_routing"],
    authorizationClientBankAccount: ["authorization_client_bank_account"],
    authorizationClientName: ["authorization_client_name"],
    authorizationClientSignerName: ["authorization_client_signer_name"],
    authorizationClientNamePrint: ["authorization_client_name_print"],
    authorizationClientTaxId: ["authorization_client_tax_id"],
    authorizationClientDate: ["authorization_client_date"],
    authorizedBusinessPhone: ["authorized_business_phone"],
    achAuthorizationAccountHolderName: ["ach_authorization_account_holder_name"],
    achAuthorizationAccountHolderDba: ["ach_authorization_account_holder_dba"],
    achAuthorizationAccountHolderPhone: ["ach_authorization_account_holder_phone"],
    achAuthorizationAccountHolderAddress: ["ach_authorization_account_holder_address"],
    achAuthorizationAccountHolderCity: ["ach_authorization_account_holder_city"],
    achAuthorizationAccountHolderState: ["ach_authorization_account_holder_state"],
    achAuthorizationAccountHolderZip: ["ach_authorization_account_holder_zip"],
    achAuthorizationAccountHolderBankName: ["ach_authorization_account_holder_bank_name"],
    achAuthorizationAccountHolderBankBranchCity: ["ach_authorization_account_holder_bank_branch_city"],
    achAuthorizationAccountHolderBankState: ["ach_authorization_account_holder_bank_state"],
    achAuthorizationAccountHolderBankZip: ["ach_authorization_account_holder_bank_zip"],
    achAuthorizationAccountHolderBankRoutingNumber: ["ach_authorization_account_holder_bank_routing_number"],
    achAuthorizationAccountHolderBankAccountNumber: ["ach_authorization_account_holder_bank_account_number"],
    achAuthorizationAccountHolderBankTransactionFee: ["ach_authorization_account_holder_bank_transaction_fee"],
    achAuthorizationAccountHolderBankNumberOfTransactions: [
        "ach_authorization_account_holder_bank_number_of_transactions",
    ],
    achAuthorizationAccountHolderDate: ["ach_authorization_account_holder_date"],

    achAuthorizationConcentAccountHolderName: ["ach_authorization_concent_account_holder_name"],
    achAuthorizationConcentAccountHolderName2: ["ach_authorization_concent_account_holder_name_2"],
    achAuthorizationConcentAccountHolderDate: ["ach_authorization_concent_account_holder_date"],

    achAuthorizationBankPortalWebsite: ["ach_authorization_bank_portal_website"],
    achAuthorizationUsername: ["ach_authorization_username"],
    achAuthorizationPassword: ["ach_authorization_password"],
    achAuthorizationSecurityQuestion1: ["ach_authorization_security_question1"],
    achAuthorizationSecurityQuestion2: ["ach_authorization_security_question2"],
    achAuthorizationSecurityQuestion3: ["ach_authorization_security_question3"],
    achAuthorizationSecurityAnswer1: ["ach_authorization_security_answer1"],
    achAuthorizationSecurityAnswer2: ["ach_authorization_security_answer2"],
    achAuthorizationSecurityAnswer3: ["ach_authorization_security_answer3"],
    achAuthorizationOtherInfomation: ["ach_authorization_other_infomation"],

    achAuthorizationReferenceName1: ["ach_authorization_reference_name1"],
    achAuthorizationReferenceNumber1: ["ach_authorization_reference_number_1"],
    achAuthorizationReferenceRelationship1: ["ach_authorization_reference_relationship1"],
    achAuthorizationReferenceName2: ["ach_authorization_reference_name2"],
    achAuthorizationReferenceNumber2: ["ach_authorization_reference_number2"],
    achAuthorizationReferenceRelationship2: ["ach_authorization_reference_relationship2"],
    achAuthorizationReferenceName3: ["ach_authorization_reference_name3"],
    achAuthorizationReferenceNumber3: ["ach_authorization_reference_number3"],
    achAuthorizationReferenceRelationship3: ["ach_authorization_reference_relationship3"],
    addendumDated: ["addendum_dated"],
    addendumDatedPrincipalOwner: ["addendum_dated_principal_owner"],
    addendumDatedPrincipalBusiness: ["addendum_dated_principal_business"],
    addendumDatedBusinessLocation: ["addendum_dated_business_location"],
    addendumDatedPrincipalState: ["addendum_dated_principal_state"],
    addendumDatedPrincipalOwnerAmount: ["addendum_dated_principal_owner_amount"],
    addendumDatedPrincipalOwnerAmount2: ["addendum_dated_principal_owner_amount2"],
    addendumDatedPrincipalOwner1Name: ["addendum_dated_principal_owner1_name"],
    addendumDatedPrincipalOwner1Date: ["addendum_dated_principal_owner1_date"],
    addendumDatedPrincipalOwner2Name: ["addendum_dated_principal_owner2_name"],
    addendumDatedPrincipalOwner2Date: ["addendum_dated_principal_owner2_date"],
    exhibitOwnerName: ["exhibit_owner_name"],
    exhibitAValue1: ["exhibit_a_value_1"],
    exhibitAValue2: ["exhibit_a_value_2"],
    exhibitAValue3: ["exhibit_a_value_3"],
    exhibitAValue4: ["exhibit_a_value_4"],
    exhibitAValue5: ["exhibit_a_value_5"],
    exhibitAValue6: ["exhibit_a_value_6"],
    exhibitAValue7: ["exhibit_a_value_7"],
    exhibitAValue8: ["exhibit_a_value_8"],
    exhibitAValue9: ["exhibit_a_value_9"],
    exhibitAValue10: ["exhibit_a_value_10"],
} as const;

function formatUsDateString(value: string): string {
    const t = String(value || "").trim();
    if (!t) return "";
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return t;
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
        const y = t.slice(0, 4);
        const m = t.slice(5, 7);
        const d = t.slice(8, 10);
        return `${m}/${d}/${y}`;
    }
    const parsed = new Date(t);
    if (Number.isNaN(parsed.getTime())) return t;
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).format(parsed);
}

function formatUsNumberString(value: string): string {
    const n = coerceToFiniteNumber(value);
    if (n === undefined) return value;
    const truncated = Math.trunc(n * 100) / 100;
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(truncated);
}

function normalizePrefillValueForUsFormat(id: string, value: string): string {
    const k = String(id || "").trim().toLowerCase();
    if (!k) return value;

    if (
        k.includes("date") ||
        /^epo_received_date_\d+$/.test(k)
    ) {
        return formatUsDateString(value);
    }

    if (
        k.includes("amount") ||
        k.includes("price") ||
        k.includes("fees") ||
        k.includes("netfund") ||
        k.includes("net_fund") ||
        k.includes("transaction_fee") ||
        /^epo_amount_received_\d+$/.test(k) ||
        k === "remittance"
    ) {
        return formatUsNumberString(value);
    }

    if (k === "purchase_percent" || k === "specified_percentage") {
        const formatted = formatRateUS(value);
        return formatted || value;
    }

    return value;
}

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({
        id,
        label,
        value: normalizePrefillValueForUsFormat(id, trimmed),
    }));
};

/** BoldSign dropdowns require exact option text; CRM stores short codes (e.g. LLC). */
function normalizeEntityTypeKey(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/\./g, "")
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeEntityTypeForBoldSignDropdown(raw: string): string {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) return "";

    const key = normalizeEntityTypeKey(trimmed);
    const byKey: Record<string, string> = {
        llc: "Limited_Liability_Company",
        "limited liability company": "Limited_Liability_Company",
        corporation: "Corporation",
        partnership: "Partnership",
        "sole proprietorship": "Sole Proprietorship",
        "s corp": "S Corporation",
        scorp: "S Corporation",
        scorporation: "S Corporation",
        "s corporation": "S Corporation",
        "c corp": "C Corporation",
        ccorp: "C Corporation",
        ccorporation: "C Corporation",
        "c corporation": "C Corporation",
        "non profit": "Non-Profit",
        nonprofit: "Non-Profit",
        other: "Other",
    };
    if (byKey[key]) return byKey[key];

    for (const canonical of new Set(Object.values(byKey))) {
        if (normalizeEntityTypeKey(canonical) === key) return canonical;
    }

    return trimmed;
}

export const buildContractPrefillFields = ({
    customerName,
    entityType = "",
    legalName = customerName,
    doingBusinessAs = "",
    businessAddress = "",
    federalTaxIdEin = "",
    agreementDate = "",
    state = "",
    businessAddressCity = "",
    businessAddressState = "",
    businessAddressZip = "",
    businessAddressContract = "",
    businessAddressContractCity = "",
    businessAddressContractState = "",
    businessAddressContractZip = "",
    guarantorAddress = "",
    guarantorAddressCity = "",
    guarantorAddressState = "",
    guarantorAddressZip = "",
    clientEmail = "",
    guarantorEmail = "",
    guarantorPhone = "",
    clientPhone = "",
    purchasePrice = "",
    purchaseAmount = "",
    purchasePercent = "",
    remittance = "",
    frequency = "",
    netToMerchant = "",

    clientName = "",
    owner1GuarantorName = "",
    owner2GuarantorName = "",
    merchant2Name = "",
    appendixMerchant2Name = "",
    businessName2 = "",
    securityBusinessName = "",
    securityTaxEin = "",
    securityDoingBusinessAs = "",
    securityBusinessAddress = "",
    securityBusinessAddressCity = "",
    securityBusinessAddressState = "",
    securityBusinessAddressZip = "",
    securityGuarantor = "",
    guarantyClientName = "",
    guarantySs = "",
    guarantySsDriverLicense = "",
    guarantyOwner1Name = "",
    guarantyOwner1Ss = "",
    guarantyOwner1DriverLicense = "",
    guarantyOwner2Name = "",
    guarantyOwner2DriverLicense = "",
    guarantyOwner2Ss = "",
    guarantyGuarantor1Name = "",
    guarantyGuarantor1Ss = "",
    guarantyGuarantor1DriverLicense = "",
    guarantyGuarantor2Name = "",
    guarantyGuarantor2Ss = "",
    guarantyGuarantor2DriverLicense = "",
    appendixUnderwritingFees = "",
    appendixClientName = "",
    authorizationApplication = "",
    authorizationClientBankName = "",
    authorizationClientBankRouting = "",
    authorizationClientBankAccount = "",
    authorizationClientName = "",
    authorizationClientSignerName = "",
    authorizationClientNamePrint = "",
    authorizationClientTaxId = "",
    authorizationClientDate = "",
    authorizedBusinessPhone = "",
    achAuthorizationAccountHolderName = "",
    achAuthorizationAccountHolderDba = "",
    achAuthorizationAccountHolderPhone = "",
    achAuthorizationAccountHolderAddress = "",
    achAuthorizationAccountHolderCity = "",
    achAuthorizationAccountHolderState = "",
    achAuthorizationAccountHolderZip = "",
    achAuthorizationAccountHolderBankName = "",
    achAuthorizationAccountHolderBankBranchCity = "",
    achAuthorizationAccountHolderBankState = "",
    achAuthorizationAccountHolderBankZip = "",
    achAuthorizationAccountHolderBankRoutingNumber = "",
    achAuthorizationAccountHolderBankAccountNumber = "",
    achAuthorizationAccountHolderBankTransactionFee = "",
    achAuthorizationAccountHolderBankNumberOfTransactions = "",
    achAuthorizationAccountHolderDate = "",

    achAuthorizationConcentAccountHolderName = "",
    achAuthorizationConcentAccountHolderName2 = "",
    achAuthorizationConcentAccountHolderDate = "",
    achAuthorizationBankPortalWebsite = "",
    achAuthorizationUsername = "",
    achAuthorizationPassword = "",
    achAuthorizationSecurityQuestion1 = "",
    achAuthorizationSecurityQuestion2 = "",
    achAuthorizationSecurityQuestion3 = "",
    achAuthorizationSecurityAnswer1 = "",
    achAuthorizationSecurityAnswer2 = "",
    achAuthorizationSecurityAnswer3 = "",
    achAuthorizationOtherInfomation = "",
    ach_authorization_bank_portal_website = "",
    ach_authorization_username = "",
    ach_authorization_password = "",
    ach_authorization_security_question1 = "",
    ach_authorization_security_answer1 = "",
    ach_authorization_security_question2 = "",
    ach_authorization_security_answer2 = "",
    ach_authorization_security_question3 = "",
    ach_authorization_security_answer3 = "",
    ach_authorization_other_infomation = "",
    achAuthorizationReferenceName1 = "",
    achAuthorizationReferenceNumber1 = "",
    achAuthorizationReferenceRelationship1 = "",
    achAuthorizationReferenceName2 = "",
    achAuthorizationReferenceNumber2 = "",
    achAuthorizationReferenceRelationship2 = "",
    achAuthorizationReferenceName3 = "",
    achAuthorizationReferenceNumber3 = "",
    achAuthorizationReferenceRelationship3 = "",
    addendumDated = "",
    addendumDatedPrincipalOwner = "",
    addendumDatedPrincipalBusiness = "",
    addendumDatedBusinessLocation = "",
    addendumDatedPrincipalState = "",
    addendumDatedPrincipalOwnerAmount = "",
    addendumDatedPrincipalOwnerAmount2 = "",
    addendumDatedPrincipalOwner1Name = "",
    addendumDatedPrincipalOwner1Date = "",
    addendumDatedPrincipalOwner2Name = "",
    addendumDatedPrincipalOwner2Date = "",
    exhibitOwnerName = "",
    exhibitAValue1 = "",
    exhibitAValue2 = "",
    exhibitAValue3 = "",
    exhibitAValue4 = "",
    exhibitAValue5 = "",
    exhibitAValue6 = "",
    exhibitAValue7 = "",
    exhibitAValue8 = "",
    exhibitAValue9 = "",
    exhibitAValue10 = "",
}: BuildContractPrefillFieldsArgs): ContractPrefillField[] => {
    return [
        ...mapIds(FIELD_IDS.legalName, "Legal Name", legalName),
        ...mapIds(FIELD_IDS.stateOfInc, "State Of Incorporation", state),
        ...mapIds(FIELD_IDS.doingBusinessAs, "Doing Business As", doingBusinessAs),
        ...mapIds(FIELD_IDS.businessAddress, "Business Address", businessAddress),
        ...mapIds(FIELD_IDS.businessAddressCity, "City", businessAddressCity),
        ...mapIds(FIELD_IDS.businessAddressState, "State", businessAddressState),
        ...mapIds(FIELD_IDS.businessAddressZip, "Zip", businessAddressZip),
        ...mapIds(FIELD_IDS.businessAddressContract, "Contract Address", businessAddressContract),
        ...mapIds(FIELD_IDS.businessAddressContractCity, "Contract City", businessAddressContractCity),
        ...mapIds(FIELD_IDS.businessAddressContractState, "Contract State", businessAddressContractState),
        ...mapIds(FIELD_IDS.businessAddressContractZip, "Contract Zip", businessAddressContractZip),
        ...mapIds(FIELD_IDS.guarantorAddress, "Guarantor Address", guarantorAddress),
        ...mapIds(FIELD_IDS.guarantorAddressCity, "Guarantor City", guarantorAddressCity),
        ...mapIds(FIELD_IDS.guarantorAddressState, "Guarantor State", guarantorAddressState),
        ...mapIds(FIELD_IDS.guarantorAddressZip, "Guarantor Zip", guarantorAddressZip),
        ...mapIds(FIELD_IDS.clientEmail, "Client Email", clientEmail),
        ...mapIds(FIELD_IDS.guarantorEmail, "Guarantor Email", guarantorEmail),
        ...mapIds(FIELD_IDS.guarantorPhone, "Guarantor Phone", guarantorPhone),
        ...mapIds(FIELD_IDS.clientPhone, "Client Phone", clientPhone),
        ...mapIds(
            FIELD_IDS.entityType,
            "Entity Type",
            String(entityType ?? "").trim(),
        ),
        ...mapIds(FIELD_IDS.federalTaxIdEin, "Federal Tax ID EIN", federalTaxIdEin),
        ...mapIds(FIELD_IDS.agreementDate, "Agreement Date", agreementDate),
        ...mapIds(FIELD_IDS.purchasePrice, "Purchase Price", purchasePrice),
        ...mapIds(FIELD_IDS.purchaseAmount, "Purchase Amount", purchaseAmount),
        ...mapIds(FIELD_IDS.purchasePercent, "Specific Percentage", purchasePercent),
        ...mapIds(FIELD_IDS.remittance, "Remittance", remittance),
        ...mapIds(FIELD_IDS.frequency, "Frequency", frequency),
        ...mapIds(FIELD_IDS.netToMerchant, "Recipient funds", netToMerchant),
        ...mapIds(FIELD_IDS.clientName, "Client Name", clientName),
        ...mapIds(FIELD_IDS.owner1GuarantorName, "Owner1 Guarantor Name", owner1GuarantorName),
        ...mapIds(FIELD_IDS.owner2GuarantorName, "Owner2 Guarantor Name", owner2GuarantorName),
        ...mapIds(FIELD_IDS.merchant2Name, "Merchant2 Name", merchant2Name),
        ...mapIds(FIELD_IDS.appendixMerchant2Name, "Appendix Merchant2 Name", appendixMerchant2Name),
        ...mapIds(FIELD_IDS.businessName2, "Business Name 2", businessName2),
        ...mapIds(FIELD_IDS.securityBusinessName, "Security Business Name", securityBusinessName),
        ...mapIds(FIELD_IDS.securityTaxEin, "Security Tax EIN", securityTaxEin),
        ...mapIds(FIELD_IDS.securityDoingBusinessAs, "Security Doing Business As", securityDoingBusinessAs),
        ...mapIds(FIELD_IDS.securityBusinessAddress, "Security Business Address", securityBusinessAddress),
        ...mapIds(FIELD_IDS.securityBusinessAddressCity, "Security Business City", securityBusinessAddressCity),
        ...mapIds(FIELD_IDS.securityBusinessAddressState, "Security Business State", securityBusinessAddressState),
        ...mapIds(FIELD_IDS.securityBusinessAddressZip, "Security Business Zip", securityBusinessAddressZip),
        ...mapIds(FIELD_IDS.securityGuarantor, "Security Guarantor", securityGuarantor),
        ...mapIds(FIELD_IDS.guarantyClientName, "Guaranty Client Name", guarantyClientName),
        ...mapIds(FIELD_IDS.guarantySs, "Guaranty SS", guarantySs),
        ...mapIds(FIELD_IDS.guarantySsDriverLicense, "Guaranty SS Driver License", guarantySsDriverLicense),
        ...mapIds(FIELD_IDS.guarantyOwner1Name, "Guaranty Owner1 Name", guarantyOwner1Name),
        ...mapIds(FIELD_IDS.guarantyOwner1Ss, "Guaranty Owner1 SS", guarantyOwner1Ss),
        ...mapIds(FIELD_IDS.guarantyOwner1DriverLicense, "Guaranty Owner1 Driver License", guarantyOwner1DriverLicense),
        ...mapIds(FIELD_IDS.guarantyOwner2Name, "Guaranty Owner2 Name", guarantyOwner2Name),
        ...mapIds(FIELD_IDS.guarantyOwner2DriverLicense, "Guaranty Owner2 Driver License", guarantyOwner2DriverLicense),
        ...mapIds(FIELD_IDS.guarantyOwner2Ss, "Guaranty Owner2 SS", guarantyOwner2Ss),
        ...mapIds(FIELD_IDS.guarantyGuarantor1Name, "Guaranty Guarantor1 Name", guarantyGuarantor1Name),
        ...mapIds(FIELD_IDS.guarantyGuarantor1Ss, "Guaranty Guarantor1 SS", guarantyGuarantor1Ss),
        ...mapIds(
            FIELD_IDS.guarantyGuarantor1DriverLicense,
            "Guaranty Guarantor1 Driver License",
            guarantyGuarantor1DriverLicense,
        ),
        ...mapIds(FIELD_IDS.guarantyGuarantor2Name, "Guaranty Guarantor2 Name", guarantyGuarantor2Name),
        ...mapIds(FIELD_IDS.guarantyGuarantor2Ss, "Guaranty Guarantor2 SS", guarantyGuarantor2Ss),
        ...mapIds(
            FIELD_IDS.guarantyGuarantor2DriverLicense,
            "Guaranty Guarantor2 Driver License",
            guarantyGuarantor2DriverLicense,
        ),
        ...mapIds(FIELD_IDS.appendixUnderwritingFees, "Appendix Underwriting Fees", appendixUnderwritingFees),
        ...mapIds(FIELD_IDS.appendixClientName, "Appendix Client Name", appendixClientName),
        ...mapIds(FIELD_IDS.authorizationApplication, "Authorization Merchant Name", authorizationApplication),
        ...mapIds(FIELD_IDS.authorizationClientBankName, "Authorization Client Bank Name", authorizationClientBankName),
        ...mapIds(FIELD_IDS.authorizationClientBankRouting, "Authorization Client Bank Routing", authorizationClientBankRouting),
        ...mapIds(FIELD_IDS.authorizationClientBankAccount, "Authorization Client Bank Account", authorizationClientBankAccount),
        ...mapIds(FIELD_IDS.authorizationClientName, "Authorization Client Name", authorizationClientName),
        ...mapIds(
            FIELD_IDS.authorizationClientSignerName,
            "Authorization Client Signer Name",
            authorizationClientSignerName,
        ),
        ...mapIds(FIELD_IDS.authorizationClientNamePrint, "Authorization Client Name Print", authorizationClientNamePrint),
        ...mapIds(FIELD_IDS.authorizationClientTaxId, "Authorization Client Tax ID", authorizationClientTaxId),
        ...mapIds(FIELD_IDS.authorizationClientDate, "Authorization Client Date", authorizationClientDate),
        ...mapIds(FIELD_IDS.authorizedBusinessPhone, "Authorized Business Phone", authorizedBusinessPhone),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderName, "ACH Account Holder Name", achAuthorizationAccountHolderName),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderDba, "ACH Account Holder DBA", achAuthorizationAccountHolderDba),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderPhone, "ACH Account Holder Phone", achAuthorizationAccountHolderPhone),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderAddress, "ACH Account Holder Address", achAuthorizationAccountHolderAddress),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderCity, "ACH Account Holder City", achAuthorizationAccountHolderCity),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderState, "ACH Account Holder State", achAuthorizationAccountHolderState),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderZip, "ACH Account Holder Zip", achAuthorizationAccountHolderZip),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderBankName, "ACH Bank Name", achAuthorizationAccountHolderBankName),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderBankBranchCity, "ACH Bank Branch City", achAuthorizationAccountHolderBankBranchCity),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderBankState, "ACH Bank State", achAuthorizationAccountHolderBankState),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderBankZip, "ACH Bank Zip", achAuthorizationAccountHolderBankZip),
        ...mapIds(
            FIELD_IDS.achAuthorizationAccountHolderBankRoutingNumber,
            "ACH Routing Number",
            achAuthorizationAccountHolderBankRoutingNumber,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationAccountHolderBankAccountNumber,
            "ACH Account Number",
            achAuthorizationAccountHolderBankAccountNumber,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationAccountHolderBankTransactionFee,
            "ACH Transaction Fee",
            achAuthorizationAccountHolderBankTransactionFee,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationAccountHolderBankNumberOfTransactions,
            "ACH Number of Transactions",
            achAuthorizationAccountHolderBankNumberOfTransactions,
        ),
        ...mapIds(FIELD_IDS.achAuthorizationAccountHolderDate, "ACH Date", achAuthorizationAccountHolderDate),
        ...mapIds(
            FIELD_IDS.achAuthorizationConcentAccountHolderName,
            "ACH Concent Account Holder Name",
            achAuthorizationConcentAccountHolderName,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationConcentAccountHolderName2,
            "ACH Concent Account Holder Name (page 15)",
            achAuthorizationConcentAccountHolderName2,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationConcentAccountHolderDate,
            "ACH Concent Account Holder Date",
            achAuthorizationConcentAccountHolderDate,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationBankPortalWebsite,
            "ACH Bank Portal Website",
            achAuthorizationBankPortalWebsite || ach_authorization_bank_portal_website,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationUsername,
            "ACH Username",
            achAuthorizationUsername || ach_authorization_username,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationPassword,
            "ACH Password",
            achAuthorizationPassword || ach_authorization_password,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationSecurityQuestion1,
            "ACH Security Question 1",
            achAuthorizationSecurityQuestion1 || ach_authorization_security_question1,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationSecurityAnswer1,
            "ACH Security Answer 1",
            achAuthorizationSecurityAnswer1 || ach_authorization_security_answer1,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationSecurityQuestion2,
            "ACH Security Question 2",
            achAuthorizationSecurityQuestion2 || ach_authorization_security_question2,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationSecurityAnswer2,
            "ACH Security Answer 2",
            achAuthorizationSecurityAnswer2 || ach_authorization_security_answer2,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationSecurityQuestion3,
            "ACH Security Question 3",
            achAuthorizationSecurityQuestion3 || ach_authorization_security_question3,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationSecurityAnswer3,
            "ACH Security Answer 3",
            achAuthorizationSecurityAnswer3 || ach_authorization_security_answer3,
        ),
        ...mapIds(
            FIELD_IDS.achAuthorizationOtherInfomation,
            "ACH Other Information",
            achAuthorizationOtherInfomation || ach_authorization_other_infomation,
        ),
        ...mapIds(FIELD_IDS.achAuthorizationReferenceName1, "ACH Reference Name 1", achAuthorizationReferenceName1),
        ...mapIds(FIELD_IDS.achAuthorizationReferenceNumber1, "ACH Reference Number 1", achAuthorizationReferenceNumber1),
        ...mapIds(FIELD_IDS.achAuthorizationReferenceRelationship1, "ACH Reference Relationship 1", achAuthorizationReferenceRelationship1),
        ...mapIds(FIELD_IDS.achAuthorizationReferenceName2, "ACH Reference Name 2", achAuthorizationReferenceName2),
        ...mapIds(FIELD_IDS.achAuthorizationReferenceNumber2, "ACH Reference Number 2", achAuthorizationReferenceNumber2),
        ...mapIds(FIELD_IDS.achAuthorizationReferenceRelationship2, "ACH Reference Relationship 2", achAuthorizationReferenceRelationship2),
        ...mapIds(FIELD_IDS.achAuthorizationReferenceName3, "ACH Reference Name 3", achAuthorizationReferenceName3),
        ...mapIds(FIELD_IDS.achAuthorizationReferenceNumber3, "ACH Reference Number 3", achAuthorizationReferenceNumber3),
        ...mapIds(FIELD_IDS.achAuthorizationReferenceRelationship3, "ACH Reference Relationship 3", achAuthorizationReferenceRelationship3),
        ...mapIds(FIELD_IDS.addendumDated, "Addendum Dated", addendumDated),
        ...mapIds(FIELD_IDS.addendumDatedPrincipalOwner, "Addendum Principal Owner", addendumDatedPrincipalOwner),
        ...mapIds(FIELD_IDS.addendumDatedPrincipalBusiness, "Addendum Principal Business", addendumDatedPrincipalBusiness),
        ...mapIds(FIELD_IDS.addendumDatedBusinessLocation, "Addendum Business Location", addendumDatedBusinessLocation),
        ...mapIds(FIELD_IDS.addendumDatedPrincipalState, "Addendum Principal State", addendumDatedPrincipalState),
        ...mapIds(FIELD_IDS.addendumDatedPrincipalOwnerAmount, "Addendum Principal Owner Amount", addendumDatedPrincipalOwnerAmount),
        ...mapIds(FIELD_IDS.addendumDatedPrincipalOwnerAmount2, "Addendum Principal Owner Amount 2", addendumDatedPrincipalOwnerAmount2),
        ...mapIds(FIELD_IDS.addendumDatedPrincipalOwner1Name, "Addendum Principal Owner1 Name", addendumDatedPrincipalOwner1Name),
        ...mapIds(FIELD_IDS.addendumDatedPrincipalOwner1Date, "Addendum Principal Owner1 Date", addendumDatedPrincipalOwner1Date),
        ...mapIds(FIELD_IDS.addendumDatedPrincipalOwner2Name, "Addendum Principal Owner2 Name", addendumDatedPrincipalOwner2Name),
        ...mapIds(FIELD_IDS.addendumDatedPrincipalOwner2Date, "Addendum Principal Owner2 Date", addendumDatedPrincipalOwner2Date),
        ...mapIds(FIELD_IDS.exhibitOwnerName, "Exhibit Owner Name", exhibitOwnerName),
        ...mapIds(FIELD_IDS.exhibitAValue1, "Exhibit A company 1", exhibitAValue1),
        ...mapIds(FIELD_IDS.exhibitAValue2, "Exhibit A company 2", exhibitAValue2),
        ...mapIds(FIELD_IDS.exhibitAValue3, "Exhibit A company 3", exhibitAValue3),
        ...mapIds(FIELD_IDS.exhibitAValue4, "Exhibit A company 4", exhibitAValue4),
        ...mapIds(FIELD_IDS.exhibitAValue5, "Exhibit A company 5", exhibitAValue5),
        ...mapIds(FIELD_IDS.exhibitAValue6, "Exhibit A company 6", exhibitAValue6),
        ...mapIds(FIELD_IDS.exhibitAValue7, "Exhibit A company 7", exhibitAValue7),
        ...mapIds(FIELD_IDS.exhibitAValue8, "Exhibit A company 8", exhibitAValue8),
        ...mapIds(FIELD_IDS.exhibitAValue9, "Exhibit A company 9", exhibitAValue9),
        ...mapIds(FIELD_IDS.exhibitAValue10, "Exhibit A company 10", exhibitAValue10),
    ];
};

/** Optional rows from contract APIs (first ACH / addendum / EPO + owner & guarantor lists). */
export type ContractPrefillContractRecords = {
    contract?: Record<string, unknown> | null;
    ach?: Record<string, unknown> | null;
    /** Latest application BankDetail (decrypted from API); wins over stale ACH for routing/account. */
    bankDetail?: Record<string, unknown> | null;
    addendum?: Record<string, unknown> | null;
    epo?: Record<string, unknown> | null;
    owners?: Record<string, unknown>[] | null;
    guarantors?: Record<string, unknown>[] | null;
};

/** Prefill keys populated from live application bank details. */
export const LIVE_BANK_PREFILL_KEYS: (keyof BuildContractPrefillFieldsArgs)[] = [
    "authorizationClientBankName",
    "authorizationClientBankAccount",
    "authorizationClientBankRouting",
    "achAuthorizationAccountHolderBankName",
    "achAuthorizationAccountHolderBankAccountNumber",
    "achAuthorizationAccountHolderBankRoutingNumber",
];

/** Prefer non-empty bank values from defaults when persisted/ACH copies are empty or still encrypted. */
export function applyLiveBankDetailsToPrefillMerge(
    defaults: Partial<BuildContractPrefillFieldsArgs>,
    merged: Partial<BuildContractPrefillFieldsArgs>,
): Partial<BuildContractPrefillFieldsArgs> {
    const out = { ...merged };
    for (const key of LIVE_BANK_PREFILL_KEYS) {
        const fromDefaults = str(defaults[key]);
        const current = str(out[key]);
        if (fromDefaults && (!current || current.startsWith("enc:v1:"))) {
            (out as Record<string, string>)[key] = fromDefaults;
        }
    }
    return out;
}

function str(v: unknown): string {
    return String(v ?? "").trim();
}

/** Apply persisted contract rows without wiping application defaults with empty strings. */
function mergeNonemptyPrefillPartial<T extends Record<string, unknown>>(
    base: Partial<T>,
    overlay: Partial<T>,
): Partial<T> {
    const out: Partial<T> = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
        if (str(value)) {
            (out as Record<string, unknown>)[key] = value;
        }
    }
    return out;
}

/**
 * DocuSign page 1 expects street in `business_address` and city/state/zip in separate tabs.
 * Legacy contract rows sometimes store the full line in `businessAddress`; strip the suffix
 * when split city/state/zip columns are also present.
 */
export function streetOnlyWhenPartsSplit(args: {
    line?: unknown;
    city?: unknown;
    state?: unknown;
    zip?: unknown;
}): string {
    let line = str(args.line);
    const city = str(args.city);
    const state = str(args.state);
    const zip = str(args.zip);
    if (!line || (!city && !state && !zip)) return line;

    const suffixCandidates = [
        [city, state, zip].filter(Boolean).join(", "),
        [city, state].filter(Boolean).join(", "),
        city,
    ].filter((s) => s.length > 0);

    for (const suffix of suffixCandidates) {
        const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const withComma = new RegExp(`,\\s*${escaped}\\s*$`, "i");
        if (withComma.test(line)) {
            line = line.replace(withComma, "").trim();
            break;
        }
        const withSpace = new RegExp(`\\s+${escaped}\\s*$`, "i");
        if (withSpace.test(line) && suffix.includes(",")) {
            line = line.replace(withSpace, "").trim();
            break;
        }
    }
    return line;
}

function applySplitAddressStreetFields(
    partial: Partial<BuildContractPrefillFieldsArgs>,
): Partial<BuildContractPrefillFieldsArgs> {
    const out = { ...partial };
    if (str(out.businessAddressCity) || str(out.businessAddressState) || str(out.businessAddressZip)) {
        out.businessAddress = streetOnlyWhenPartsSplit({
            line: out.businessAddress,
            city: out.businessAddressCity,
            state: out.businessAddressState,
            zip: out.businessAddressZip,
        });
    }
    if (
        str(out.businessAddressContractCity) ||
        str(out.businessAddressContractState) ||
        str(out.businessAddressContractZip)
    ) {
        out.businessAddressContract = streetOnlyWhenPartsSplit({
            line: out.businessAddressContract,
            city: out.businessAddressContractCity,
            state: out.businessAddressContractState,
            zip: out.businessAddressContractZip,
        });
    }
    if (
        str(out.securityBusinessAddressCity) ||
        str(out.securityBusinessAddressState) ||
        str(out.securityBusinessAddressZip)
    ) {
        out.securityBusinessAddress = streetOnlyWhenPartsSplit({
            line: out.securityBusinessAddress,
            city: out.securityBusinessAddressCity,
            state: out.securityBusinessAddressState,
            zip: out.securityBusinessAddressZip,
        });
    }
    if (str(out.guarantorAddressCity) || str(out.guarantorAddressState) || str(out.guarantorAddressZip)) {
        out.guarantorAddress = streetOnlyWhenPartsSplit({
            line: out.guarantorAddress,
            city: out.guarantorAddressCity,
            state: out.guarantorAddressState,
            zip: out.guarantorAddressZip,
        });
    }
    return out;
}

/**
 * Prisma decimals / floats often arrive as strings like `1400.00000000000`.
 * Normalize for US number style: truncate toward zero, format with comma separators and 2 decimals.
 */
function coerceToFiniteNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean") return undefined;
    if (typeof value === "bigint") return Number(value);
    if (value != null && typeof value === "object") {
        const perhaps = value as { toNumber?: unknown; valueOf?: unknown };
        if (typeof perhaps.toNumber === "function") {
            const nn = Number((perhaps as any).toNumber());
            return Number.isFinite(nn) ? nn : undefined;
        }
        const fromValueOf = typeof perhaps.valueOf === "function" ? Number((perhaps as { valueOf(): unknown }).valueOf()) : NaN;
        if (Number.isFinite(fromValueOf)) return fromValueOf;
    }
    const s =
        typeof value === "string" ? value.trim().replace(/,/g, "").replace(/^[$€£¥]\s*/, "") : String(value ?? "").trim();
    if (!s) return undefined;
    const parsed = Number(s);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function truncateDecimalPrefill(value: unknown): string {
    const n = coerceToFiniteNumber(value);
    if (n === undefined) return "";
    const truncated = Math.trunc(n * 100) / 100;
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(truncated);
}

/** Texas Funding Group / Alliance-style money tabs that should show `$` on the PDF. */
const TEXAS_CONTRACT_USD_MONEY_FIELD_IDS = new Set([
    "purchase_amount",
    "purchaseamount",
    "purchaseAmount",
    "purchase_price",
    "purchaseprice",
    "purchasePrice",
    "finance_charge",
    "financecharge",
    "total_dollar_cost",
    "disclosure_finance_charge",
    "appendix_underwriting_fees",
    "appendixUnderwritingFees",
    "underwriter_fee",
    "underwriterfee",
    "net_to_merchant",
    "netToMerchant",
    "NetFundProvided",
    "netfundprovided",
    "remittance",
    "daily_payment",
    "dailypayment",
    "estimated_payment",
    "estimated_payment_amount",
    "estimatedremittance",
    "receivable_purchase",
    "receivable_purchase_1",
    "receivable_purchase_2",
    "total_repayment_amount",
    "disclosure_total_payment",
    "estimatedtotalpaymentamount",
]);

function normalizeTexasMoneyFieldId(id: string): string {
    return String(id || "")
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s-]+/g, "_")
        .toLowerCase();
}

export function shouldFormatTexasContractUsdAmounts(options?: {
    funderName?: string | null;
    state?: string | null;
    layoutKey?: string | null;
    allowedStates?: string[] | null;
}): boolean {
    const layoutKey = String(options?.layoutKey ?? "").trim();
    if (
        layoutKey === PLATFORM_LAYOUT_KEYS.texasFundingGroupContract ||
        layoutKey === "texas_funding_group" ||
        layoutKey === "alliance_bridge_contract"
    ) {
        return true;
    }
    if (isTexasOnlyAllowedStates(options?.allowedStates) && isTexasContractState(options?.state)) {
        return true;
    }
    const funderName = String(options?.funderName ?? "").trim();
    const state = String(options?.state ?? "").trim();
    if (!funderName || !isTexasContractState(state)) return false;
    if (isTexasFundingGroupFunder(funderName)) return true;
    return resolveMainContractLayoutKey(funderName, state) ===
        PLATFORM_LAYOUT_KEYS.texasFundingGroupContract;
}

/** Prefix Texas contract money tabs with `$` (e.g. `$12,000.00`) for DocuSign. */
export function applyTexasContractUsdMoneyToPrefillFields<
    T extends { id: string; value: string },
>(
    fields: T[],
    options?: {
        funderName?: string | null;
        state?: string | null;
        layoutKey?: string | null;
        allowedStates?: string[] | null;
    },
): T[] {
    if (!fields.length || !shouldFormatTexasContractUsdAmounts(options)) {
        return fields;
    }
    return fields.map((field) => {
        const id = String(field.id ?? "").trim();
        if (!id) return field;
        const snake = normalizeTexasMoneyFieldId(id);
        if (
            !TEXAS_CONTRACT_USD_MONEY_FIELD_IDS.has(id) &&
            !TEXAS_CONTRACT_USD_MONEY_FIELD_IDS.has(snake) &&
            !TEXAS_CONTRACT_USD_MONEY_FIELD_IDS.has(id.replace(/_/g, ""))
        ) {
            return field;
        }
        const raw = String(field.value ?? "").trim();
        if (!raw) return field;
        const n = parseMoneyInput(raw);
        if (n === null) return field;
        return { ...field, value: formatUSD(n, { fallback: raw }) };
    });
}

/** Prefer first nonempty truncated money string from fallback chain. */
function firstTruncateDecimal(...values: unknown[]): string {
    for (const v of values) {
        const t = truncateDecimalPrefill(v);
        if (t !== "") return t;
    }
    return "";
}

/** Values from APIs are often ISO strings or `Date` objects; normalize to US date format MM/DD/YYYY. */
function prefillIsoDate(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") {
        const t = value.trim();
        if (!t) return "";
        return formatUsDateString(t);
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? "" : formatUsDateString(value.toISOString());
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? "" : formatUsDateString(d.toISOString());
    }
    return formatUsDateString(str(value));
}

const MONEY_STRING_PREFILL_KEYS: readonly (keyof BuildContractPrefillFieldsArgs)[] = [
    "purchasePrice",
    "purchaseAmount",
    "netToMerchant",
    "appendixUnderwritingFees",
    "addendumDatedPrincipalOwnerAmount",
    "addendumDatedPrincipalOwnerAmount2",
];

export type NetToMerchantPrefillSources = {
    offerDecision?: Record<string, unknown> | null;
    contract?: Record<string, unknown> | null;
    application?: Record<string, unknown> | null;
    prefill?: Partial<BuildContractPrefillFieldsArgs>;
};

function offerDecisionEffectiveRecordForNet(
    odRoot: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
    if (!odRoot || typeof odRoot !== "object") return null;
    const inner = odRoot.offer;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        return inner as Record<string, unknown>;
    }
    return odRoot;
}

/**
 * Payback dollars for DocuSign / Verify Prefill.
 * Prefer offer × factor rate. Do not treat `OfferDecision.totalRemit` as dollars — in woodmere
 * that column stores total-leverage %, so reading it directly poisoned `purchase_price`.
 */
function resolvePaybackAmountDollars(sources: NetToMerchantPrefillSources): number | undefined {
    const app = sources.application;
    const contract = sources.contract;
    const odRoot =
        sources.offerDecision ??
        (contract?.offer as Record<string, unknown> | undefined) ??
        (app?.offerDecision as Record<string, unknown> | undefined) ??
        (app?.OfferDecision as Record<string, unknown> | undefined) ??
        null;
    const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;
    const termsRaw = app?.termsOffers;
    const terms0 =
        Array.isArray(termsRaw) && termsRaw[0] && typeof termsRaw[0] === "object"
            ? (termsRaw[0] as Record<string, unknown>)
            : termsRaw && typeof termsRaw === "object" && !Array.isArray(termsRaw)
              ? (termsRaw as Record<string, unknown>)
              : null;

    // Read advance directly — do not call resolveOfferAmountDollarsForUnderwritingFees here
    // (that helper asks for payback and would recurse).
    const advance =
        coerceToFiniteNumber(odEff?.offer) ??
        coerceToFiniteNumber(odEff?.approvedAmount) ??
        coerceToFiniteNumber(odRoot?.offer) ??
        coerceToFiniteNumber(odRoot?.approvedAmount) ??
        coerceToFiniteNumber(terms0?.approvedAmount) ??
        coerceToFiniteNumber(contract?.approvedAmount) ??
        0;
    const factorRate = resolveOfferFactorRate({
        offerDecisionRate:
            coerceToFiniteNumber(odRoot?.rate) ?? coerceToFiniteNumber(odEff?.rate),
        offerDecisionFactorRate:
            coerceToFiniteNumber(odRoot?.factorRate) ?? coerceToFiniteNumber(odEff?.factorRate),
        termsFactorRate: coerceToFiniteNumber(terms0?.factorRate),
    });
    const payback = resolveOfferPayback(advance, factorRate, {
        termsPaybackAmount: coerceToFiniteNumber(terms0?.paybackAmount),
        offerPaybackAmount:
            coerceToFiniteNumber(odEff?.paybackAmount) ?? coerceToFiniteNumber(odRoot?.paybackAmount),
        // Only accepted when totalRemit >= advance (true dollars); leverage % is ignored.
        totalRemit:
            coerceToFiniteNumber(odEff?.totalRemit) ?? coerceToFiniteNumber(odRoot?.totalRemit),
    });
    if (payback > 0) return payback;

    const legacy =
        coerceToFiniteNumber(contract?.purchasePrice) ?? coerceToFiniteNumber(contract?.totalAmount);
    return legacy !== undefined && legacy > 0 ? legacy : undefined;
}

/**
 * Offer / advance amount for underwriting fee % → dollars (never payback / total remit).
 */
export function resolveOfferAmountDollarsForUnderwritingFees(
    sources: NetToMerchantPrefillSources,
): number | undefined {
    const app = sources.application;
    const contract = sources.contract;
    const odRoot =
        sources.offerDecision ??
        (contract?.offer as Record<string, unknown> | undefined) ??
        (app?.offerDecision as Record<string, unknown> | undefined) ??
        (app?.OfferDecision as Record<string, unknown> | undefined) ??
        null;
    const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;
    const termsRaw = app?.termsOffers;
    const terms0 =
        Array.isArray(termsRaw) && termsRaw[0] && typeof termsRaw[0] === "object"
            ? (termsRaw[0] as Record<string, unknown>)
            : termsRaw && typeof termsRaw === "object" && !Array.isArray(termsRaw)
              ? (termsRaw as Record<string, unknown>)
              : null;

    const payback = resolvePaybackAmountDollars(sources);
    const prefillOverrides = normalizeContractPrefillOverrides(contract?.contractPrefillOverrides);
    const candidates = [
        coerceToFiniteNumber(sources.prefill?.purchaseAmount),
        coerceToFiniteNumber(prefillOverrides?.purchaseAmount),
        coerceToFiniteNumber(contract?.purchaseAmount),
        coerceToFiniteNumber(odEff?.offer),
        coerceToFiniteNumber(odEff?.approvedAmount),
        coerceToFiniteNumber(odRoot?.offer),
        coerceToFiniteNumber(odRoot?.approvedAmount),
        coerceToFiniteNumber(terms0?.approvedAmount),
        coerceToFiniteNumber(contract?.approvedAmount),
        coerceToFiniteNumber(app?.loanAmount),
    ];

    for (const n of candidates) {
        if (n === undefined || !(n > 0)) continue;
        if (payback !== undefined && Math.abs(n - payback) < 0.01) continue;
        return n;
    }
    return undefined;
}

/** Purchase / advance amount used for fee % and net-to-merchant math. */
export function resolvePurchaseAmountDollars(sources: NetToMerchantPrefillSources): number | undefined {
    return resolveOfferAmountDollarsForUnderwritingFees(sources);
}

/**
 * Appendix A / offer fees: CRM often stores a percent (e.g. `10` or `10%`); DocuSign expects dollars.
 * Values over 100 without a % sign are treated as already-dollar amounts.
 */
export function resolveAppendixUnderwritingFeesDisplay(
    rawFees: unknown,
    purchaseAmount: number | undefined,
    options?: {
        /**
         * @deprecated Offer decision `fees` is stored as dollars. Prefer
         * `formatOfferDecisionFeesDollarsForPrefill` for that source.
         */
        fromOfferDecision?: boolean;
    },
): string {
    const raw = str(rawFees);
    if (!raw) return "";

    const hasPercentSign = raw.includes("%");
    const numeric = coerceToFiniteNumber(raw.replace(/%/g, ""));
    if (numeric === undefined) return raw;

    let percent: number | undefined;
    if (hasPercentSign || options?.fromOfferDecision) {
        percent = numeric;
    } else if (numeric > 0 && numeric <= 100) {
        percent = numeric;
    } else {
        return truncateDecimalPrefill(numeric);
    }

    if (purchaseAmount === undefined || !(purchaseAmount > 0)) {
        return truncateDecimalPrefill(numeric);
    }

    return truncateDecimalPrefill((purchaseAmount * percent) / 100);
}

export function resolveAppendixUnderwritingFeesDollars(
    rawFees: unknown,
    purchaseAmount: number | undefined,
): number | undefined {
    return coerceToFiniteNumber(resolveAppendixUnderwritingFeesDisplay(rawFees, purchaseAmount));
}

/** `OfferDecision.fees` is persisted as dollars (% was applied to funded amount at save). */
export function formatOfferDecisionFeesDollarsForPrefill(rawFees: unknown): string {
    const n = coerceToFiniteNumber(rawFees);
    if (n !== undefined) return truncateDecimalPrefill(n);
    const raw = str(rawFees);
    return raw ? truncateDecimalPrefill(raw) : "";
}

function applyAppendixUnderwritingFeesAmount(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    sources: NetToMerchantPrefillSources,
): Partial<BuildContractPrefillFieldsArgs> {
    const out = { ...partial };
    const purchase =
        resolveOfferAmountDollarsForUnderwritingFees({
            ...sources,
            prefill: { ...sources.prefill, ...partial },
        }) ?? coerceToFiniteNumber(out.purchaseAmount);
    let raw = str(out.appendixUnderwritingFees);
    let feesFromOfferDecision = false;
    if (!raw) {
        const contract = sources.contract;
        const odRoot =
            sources.offerDecision ??
            (contract?.offer as Record<string, unknown> | undefined) ??
            null;
        const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;
        const offer = (contract?.offer ?? null) as Record<string, unknown> | null;
        raw = str(odEff?.fees ?? offer?.fees ?? odRoot?.fees);
        feesFromOfferDecision = Boolean(raw);
    }
    if (raw && !feesFromOfferDecision) {
        out.appendixUnderwritingFees = resolveAppendixUnderwritingFeesDisplay(raw, purchase);
    } else if (purchase !== undefined && purchase > 0) {
        const contract = sources.contract;
        const odRoot =
            sources.offerDecision ??
            (contract?.offer as Record<string, unknown> | undefined) ??
            null;
        const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;
        const app = sources.application;
        const termsRaw = app?.termsOffers;
        const terms0 =
            Array.isArray(termsRaw) && termsRaw[0] && typeof termsRaw[0] === "object"
                ? (termsRaw[0] as Record<string, unknown>)
                : termsRaw && typeof termsRaw === "object" && !Array.isArray(termsRaw)
                  ? (termsRaw as Record<string, unknown>)
                  : null;
        const feeDollars = resolveOfferFeeAmountForDeal({
            fundedAmount: purchase,
            factorRate:
                odEff?.rate ?? odRoot?.rate ?? terms0?.factorRate,
            feesRaw: odEff?.fees ?? odRoot?.fees ?? raw,
            termsCommissionPercent: terms0?.commissionPercent,
            applicationCommissionPercentage: app?.commissionPercentage,
        });
        out.appendixUnderwritingFees = formatOfferDecisionFeesDollarsForPrefill(
            feeDollars,
        );
    }
    return out;
}

/** Apply appendix fee % → $ and related money normalization (call after merging overrides). */
export function finalizeContractPrefillMoneyFields(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    sources: NetToMerchantPrefillSources,
): Partial<BuildContractPrefillFieldsArgs> {
    return applyAppendixUnderwritingFeesAmount(partial, sources);
}

/**
 * Recipient funds / net to merchant = max(0, advance − fees − refinance).
 * Same as Contract tab "Recipient Funds" (offer − commission/fees − refinance).
 * Do not use a stored appendix fee of 0 to skip live offer commission (that made net = offer).
 */
export function computeNetToMerchantDollars(sources: NetToMerchantPrefillSources): number | undefined {
    const advance = resolvePurchaseAmountDollars(sources);
    if (advance === undefined) return undefined;

    const app = sources.application;
    const contract = sources.contract;
    const odRoot =
        sources.offerDecision ??
        (contract?.offer as Record<string, unknown> | undefined) ??
        (app?.offerDecision as Record<string, unknown> | undefined) ??
        (app?.OfferDecision as Record<string, unknown> | undefined) ??
        null;
    const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;

    const termsRaw = app?.termsOffers;
    const terms0 =
        Array.isArray(termsRaw) && termsRaw[0] && typeof termsRaw[0] === "object"
            ? (termsRaw[0] as Record<string, unknown>)
            : termsRaw && typeof termsRaw === "object" && !Array.isArray(termsRaw)
              ? (termsRaw as Record<string, unknown>)
              : null;

    const liveFees = resolveOfferFeeAmountForDeal({
        fundedAmount: advance,
        factorRate:
            odEff?.rate ??
            odRoot?.rate ??
            terms0?.factorRate,
        feesRaw: odEff?.fees ?? odRoot?.fees,
        termsCommissionPercent: terms0?.commissionPercent,
        applicationCommissionPercentage: app?.commissionPercentage,
    });

    const appendixFees = coerceToFiniteNumber(
        sources.prefill?.appendixUnderwritingFees ?? contract?.appendixUnderwritingFees,
    );
    // Live offer/app commission wins over a stored appendix of 0 (which incorrectly
    // made recipient funds / net-to-merchant equal the offer amount).
    const fees =
        appendixFees !== undefined && appendixFees > 0
            ? appendixFees
            : liveFees > 0
              ? liveFees
              : appendixFees !== undefined
                ? appendixFees
                : 0;

    const refinance =
        coerceToFiniteNumber(odRoot?.refinanceAmount) ??
        coerceToFiniteNumber(odRoot?.RefinanceAmount) ??
        coerceToFiniteNumber(odEff?.refinanceAmount) ??
        coerceToFiniteNumber(odEff?.RefinanceAmount) ??
        0;

    return Math.max(0, Math.round((advance - (fees || 0) - refinance) * 100) / 100);
}

/** Alias — DocuSign `net_to_merchant` is recipient funds, not offer amount. */
export const computeRecipientFundsDollars = computeNetToMerchantDollars;

/** True when a stored net/recipient-funds value is just a copy of the offer amount. */
export function netToMerchantLooksLikeOfferAmount(
    storedNet: unknown,
    sources: NetToMerchantPrefillSources,
): boolean {
    const stored = coerceToFiniteNumber(storedNet);
    const offer = resolvePurchaseAmountDollars(sources);
    if (stored === undefined || offer === undefined) return false;
    return Math.abs(stored - offer) < 0.005;
}

/**
 * Back-solve underwriting fees from advance and a edited net-to-merchant amount.
 * fees = max(0, advance − refinance − netToMerchant).
 */
export function deriveOfferFeesDollarsForNetToMerchant(
    sources: NetToMerchantPrefillSources,
    netToMerchantDollars: number,
): number | undefined {
    if (!Number.isFinite(netToMerchantDollars) || netToMerchantDollars < 0) {
        return undefined;
    }
    const advance = resolvePurchaseAmountDollars(sources);
    if (advance === undefined || !(advance > 0)) return undefined;

    const app = sources.application;
    const contract = sources.contract;
    const odRoot =
        sources.offerDecision ??
        (contract?.offer as Record<string, unknown> | undefined) ??
        (app?.offerDecision as Record<string, unknown> | undefined) ??
        (app?.OfferDecision as Record<string, unknown> | undefined) ??
        null;
    const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;
    const refinance =
        coerceToFiniteNumber(odRoot?.refinanceAmount) ??
        coerceToFiniteNumber(odRoot?.RefinanceAmount) ??
        coerceToFiniteNumber(odEff?.refinanceAmount) ??
        coerceToFiniteNumber(odEff?.RefinanceAmount) ??
        0;

    return Math.max(
        0,
        Math.round((advance - refinance - netToMerchantDollars) * 100) / 100,
    );
}

export function formatNetToMerchantPrefillValue(amount: number | undefined): string {
    if (amount === undefined || !Number.isFinite(amount)) return "";
    return truncateDecimalPrefill(amount);
}

const PAYMENT_FREQUENCY_LABELS = new Set([
    "daily",
    "weekly",
    "monthly",
    "biweekly",
]);

/** True when a stored remittance value is a payment cadence label, not a dollar amount. */
export function looksLikePaymentFrequencyLabel(value: string): boolean {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return false;
    const compact = trimmed.toLowerCase().replace(/[^a-z]/g, "");
    if (PAYMENT_FREQUENCY_LABELS.has(compact)) return true;
    return /^(daily|weekly|monthly|bi[-\s]?weekly)$/i.test(trimmed);
}

/**
 * Normalize offer/contract frequency to Daily / Weekly / etc.
 * Rejects percents & bare numbers (disclosure % was incorrectly expanded onto DocuSign
 * labels `frequency` / `paymentTerms`, which polluted Contract / OfferDecision / ACH).
 */
export function coercePaymentFrequencyLabel(raw: unknown): string {
    const text = str(raw);
    if (!text) return "";
    if (/%/.test(text)) return "";
    const asNum = coerceToFiniteNumber(text);
    if (asNum !== undefined && !looksLikePaymentFrequencyLabel(text)) return "";

    const normalized = text.replace(/_/g, " ").trim();
    if (!normalized) return "";
    if (!looksLikePaymentFrequencyLabel(normalized)) return "";

    return normalized
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

/** Persist-only: cadence label or null (never save "0.00%" / bare numbers as frequency). */
export function sanitizePaymentFrequencyForPersist(raw: unknown): string | null {
    const label = coercePaymentFrequencyLabel(raw);
    return label || null;
}

/** Human-readable payment frequency for contract / DocuSign prefill. */
export function resolveOfferFrequencyLabel(sources: NetToMerchantPrefillSources): string {
    const app = sources.application;
    const contract = sources.contract;
    const odRoot =
        sources.offerDecision ??
        (contract?.offer as Record<string, unknown> | undefined) ??
        (app?.offerDecision as Record<string, unknown> | undefined) ??
        (app?.OfferDecision as Record<string, unknown> | undefined) ??
        null;
    const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;
    const termsRaw = app?.termsOffers;
    const terms0 =
        Array.isArray(termsRaw) && termsRaw[0] && typeof termsRaw[0] === "object"
            ? (termsRaw[0] as Record<string, unknown>)
            : termsRaw && typeof termsRaw === "object" && !Array.isArray(termsRaw)
              ? (termsRaw as Record<string, unknown>)
              : null;

    // Prefer live offer cadence; contract.frequency is last because it can hold a stale %.
    const candidates = [
        odRoot?.frequency,
        odEff?.frequency,
        terms0?.frequency,
        app?.frequency,
        sources.prefill?.frequency,
        contract?.frequency,
    ];
    for (const raw of candidates) {
        const label = coercePaymentFrequencyLabel(raw);
        if (label) return label;
    }
    return "";
}

/** Specified percentage for contract `purchasePercent` → DocuSign `purchase_percent` (persisted value only). */
export function resolvePurchasePercentPrefillValue(
    sources: NetToMerchantPrefillSources,
): string {
    const stored = str(sources.contract?.purchasePercent);
    if (!stored) return "";
    const asNum = coerceToFiniteNumber(stored);
    return asNum !== undefined ? formatRateUS(asNum) : stored;
}

/** True when persisted remittance should be replaced (frequency label or legacy full payback). */
export function remittanceStoredValueNeedsRecompute(
    stored: string,
    sources: NetToMerchantPrefillSources,
    frequencyLabel?: string,
): boolean {
    const trimmed = String(stored ?? "").trim();
    if (!trimmed) return true;
    if (looksLikePaymentFrequencyLabel(trimmed)) return true;
    const freq = String(frequencyLabel ?? resolveOfferFrequencyLabel(sources)).trim();
    if (freq && trimmed.toLowerCase() === freq.toLowerCase()) return true;
    const asMoney = coerceToFiniteNumber(trimmed);
    const payback = resolvePaybackAmountDollars(sources);
    if (
        asMoney !== undefined &&
        payback !== undefined &&
        payback > 0 &&
        Math.abs(asMoney - payback) < 0.01
    ) {
        return true;
    }
    return false;
}

/**
 * Total remit ($) for contract / DocuSign `remittance` tab — payment amount per period
 * (repay per period at the offer frequency), not full payback or a frequency label.
 */
export function resolveRemittancePrefillValue(sources: NetToMerchantPrefillSources): string {
    const app = sources.application;
    const contract = sources.contract;
    const odRoot =
        sources.offerDecision ??
        (contract?.offer as Record<string, unknown> | undefined) ??
        (app?.offerDecision as Record<string, unknown> | undefined) ??
        (app?.OfferDecision as Record<string, unknown> | undefined) ??
        null;
    const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;

    const stored = str(contract?.remittance);
    if (stored && !remittanceStoredValueNeedsRecompute(stored, sources)) {
        const asMoney = coerceToFiniteNumber(stored);
        if (asMoney !== undefined) return truncateDecimalPrefill(asMoney);
    }

    const repayPerPeriod =
        coerceToFiniteNumber(odEff?.repayPerPeriod) ??
        coerceToFiniteNumber(odRoot?.repayPerPeriod) ??
        coerceToFiniteNumber(odEff?.daysWeeks) ??
        coerceToFiniteNumber(odRoot?.daysWeeks) ??
        coerceToFiniteNumber(odEff?.paymentAmount) ??
        coerceToFiniteNumber(odRoot?.paymentAmount);
    if (repayPerPeriod !== undefined && repayPerPeriod > 0) {
        return truncateDecimalPrefill(repayPerPeriod);
    }

    const payback = resolvePaybackAmountDollars(sources);
    const termRaw =
        str(odEff?.term) ||
        str(odRoot?.term) ||
        str(contract?.contractLenght) ||
        str(contract?.contractLength) ||
        "";
    if (payback !== undefined && payback > 0 && termRaw) {
        const perPeriod = computePerPeriodPayment({ payback, term: termRaw });
        if (perPeriod > 0) return truncateDecimalPrefill(perPeriod);
    }

    return "";
}

function resolveOfferTermsRecord(
    app: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
    const termsRaw = app?.termsOffers;
    if (Array.isArray(termsRaw) && termsRaw[0] && typeof termsRaw[0] === "object") {
        return termsRaw[0] as Record<string, unknown>;
    }
    if (termsRaw && typeof termsRaw === "object" && !Array.isArray(termsRaw)) {
        return termsRaw as Record<string, unknown>;
    }
    return null;
}

function paymentCountFromOfferTerm(raw: unknown): number | undefined {
    const termStr = str(raw);
    if (!termStr) return undefined;
    const parsed = parseTerm(termStr);
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
    const numeric = coerceToFiniteNumber(raw);
    if (numeric !== undefined && numeric > 0) return Math.trunc(numeric);
    return undefined;
}

/** ACH form "NO. of transaction" = term of offer (payments count from offer / terms offer). */
export function resolveNumberOfPaymentsPrefillValue(sources: NetToMerchantPrefillSources): string {
    const app = sources.application;
    const contract = sources.contract;
    const contractOffer = (contract as Record<string, unknown> | null | undefined)?.offer as
        | Record<string, unknown>
        | undefined;
    const odRoot =
        sources.offerDecision ??
        contractOffer ??
        (app?.offerDecision as Record<string, unknown> | undefined) ??
        (app?.OfferDecision as Record<string, unknown> | undefined) ??
        null;
    const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;
    const terms0 = resolveOfferTermsRecord(app);

    const numPayments =
        coerceToFiniteNumber(odRoot?.numberOfPayments) ??
        coerceToFiniteNumber(odEff?.numberOfPayments) ??
        paymentCountFromOfferTerm(odRoot?.term) ??
        paymentCountFromOfferTerm(odEff?.term) ??
        coerceToFiniteNumber(terms0?.numberOfPayments) ??
        paymentCountFromOfferTerm(terms0?.term) ??
        coerceToFiniteNumber(terms0?.termLength) ??
        coerceToFiniteNumber((contract as Record<string, unknown> | null)?.numberOfPayments) ??
        coerceToFiniteNumber(contractOffer?.numberOfPayments) ??
        paymentCountFromOfferTerm(contractOffer?.term);

    if (numPayments !== undefined && numPayments > 0) {
        return String(Math.trunc(numPayments));
    }

    const saved = str(
        (contract as Record<string, unknown> | null | undefined)
            ?.achAuthorizationAccountHolderBankNumberOfTransactions,
    );
    if (saved) return saved;
    return "";
}

function normalizeDealReviewFieldId(id: string): string {
    return String(id ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
}

function stripLeadingLabelPrefixes(label: string, prefixes: string[]): string {
    let s = String(label ?? "").trim();
    let changed = true;
    while (changed) {
        changed = false;
        for (const prefix of prefixes) {
            const re = new RegExp(`^${escapeRegExpForNote(prefix)}\\s+`, "i");
            const next = s.replace(re, "").trim();
            if (next !== s) {
                s = next;
                changed = true;
            }
        }
    }
    return s;
}

function humanizeDealReviewToken(token: string): string {
    const t = String(token || "")
        .trim()
        .replace(/_/g, " ");
    if (!t) return "";
    return t
        .split(/\s+/)
        .map((w) => {
            const lower = w.toLowerCase();
            if (lower === "dba") return "DBA";
            if (lower === "ein") return "EIN";
            if (lower === "ssn") return "SSN";
            if (lower === "zip") return "ZIP";
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join(" ");
}

/** Longest-first prefixes removed from row labels per Deal Review section. */
const DEAL_REVIEW_LABEL_PREFIXES_BY_CATEGORY: Record<string, string[]> = {
    General: ["Federal Tax ID EIN", "Federal Tax ID", "State Of Incorporation", "Doing Business As", "Agreement"],
    Parties: ["Owner2 Guarantor", "Owner1 Guarantor", "Owner 2 Guarantor", "Owner 1 Guarantor", "Client Legal", "Client"],
    "Business Address": ["Business Address"],
    "Contract Address": ["Contract Address", "Contract"],
    "Deal Terms": ["Purchase"],
    ACH: [
        "ACH Authorization Concent Account Holder",
        "ACH Concent Account Holder",
        "Concent Account Holder",
        "ACH Authorization Account Holder",
        "ACH Account Holder",
        "Account Holder",
        "ACH Authorization",
        "ACH",
    ],
    Authorization: ["Authorization Client", "Authorized Business", "Authorization", "Client"],
    Guarantor: ["Guarantor"],
    Security: ["Security"],
    Guaranty: ["Guaranty"],
    Appendix: ["Appendix"],
    Addendum: ["Principal", "Dated", "Addendum"],
};

const ACH_ACCOUNT_HOLDER_TAIL_LABELS: Record<string, string> = {
    name: "Name",
    dba: "DBA",
    phone: "Phone",
    address: "Street",
    city: "City",
    state: "State",
    zip: "ZIP",
    date: "Date",
};

const ACH_BANK_TAIL_LABELS: Record<string, string> = {
    name: "Bank name",
    branch_city: "Branch city",
    state: "Bank state",
    zip: "Bank ZIP",
    routing_number: "Routing number",
    account_number: "Account number",
    transaction_fee: "Transaction fee",
};

const AUTHORIZATION_CLIENT_TAIL_LABELS: Record<string, string> = {
    application: "Merchant name",
    bank_name: "Bank name",
    bank_routing: "Routing number",
    bank_account: "Account number",
    name: "Signer name",
    name_print: "Printed name",
    tax_id: "Tax ID / EIN",
    date: "Date",
};

function inferDealReviewLabelFromFieldId(id: string, category: string): string | null {
    const norm = normalizeDealReviewFieldId(id);

    if (category === "ACH" && norm.startsWith("ach_authorization_")) {
        let rest = norm.slice("ach_authorization_".length);
        if (rest.startsWith("concent_account_holder_") || rest.startsWith("consent_account_holder_")) {
            const tail = rest.replace(/^concent_account_holder_/, "").replace(/^consent_account_holder_/, "");
            if (tail === "name") return "Name";
            if (tail === "date") return "Date";
            return humanizeDealReviewToken(tail);
        }
        if (rest.startsWith("account_holder_bank_")) {
            const tail = rest.slice("account_holder_bank_".length);
            return ACH_BANK_TAIL_LABELS[tail] ?? humanizeDealReviewToken(tail);
        }
        if (rest.startsWith("account_holder_")) {
            const tail = rest.slice("account_holder_".length);
            return ACH_ACCOUNT_HOLDER_TAIL_LABELS[tail] ?? humanizeDealReviewToken(tail);
        }
        if (rest.startsWith("reference_")) {
            const tail = rest.replace(/^reference_/, "");
            return humanizeDealReviewToken(tail);
        }
        return humanizeDealReviewToken(rest);
    }

    if (category === "Authorization" && norm.startsWith("authorization_client_")) {
        const tail = norm.slice("authorization_client_".length);
        return AUTHORIZATION_CLIENT_TAIL_LABELS[tail] ?? humanizeDealReviewToken(tail);
    }
    if (category === "Authorization" && norm === "authorization_application") {
        return "Merchant name";
    }
    if (category === "Authorization" && norm === "authorized_business_phone") {
        return "Business phone";
    }

    if (category === "Guarantor" && norm.startsWith("guarantor_")) {
        const tail = norm.slice("guarantor_".length);
        const map: Record<string, string> = {
            address: "Street",
            address_city: "City",
            address_state: "State",
            address_zip: "ZIP",
            email: "Email",
            phone: "Phone",
        };
        return map[tail] ?? humanizeDealReviewToken(tail);
    }

    if (category === "Parties") {
        if (norm === "client_legal_name") return "Legal name";
        if (norm === "client_email") return "Email";
        if (norm === "client_phone") return "Phone";
        if (norm === "client_name") return "Name";
        if (norm === "owner1_guarantor_name") return "Owner 1 — Guarantor";
        if (norm === "owner2_guarantor_name") return "Owner 2 — Guarantor";
    }

    if (category === "General") {
        if (norm === "state_of_inc") return "State of incorporation";
        if (norm === "doing_business_as") return "DBA";
        if (norm === "federal_tax_id_ein") return "EIN";
        if (norm === "agreement_date") return "Agreement date";
    }

    if (category === "Business Address" || category === "Contract Address") {
        if (norm.endsWith("_city")) return "City";
        if (norm.endsWith("_state")) return "State";
        if (norm.endsWith("_zip")) return "ZIP";
        if (norm === "business_address" || norm === "business_address_contract") return "Street";
    }

    if (category === "Deal Terms") {
        if (norm === "purchase_price") return PLATFORM_LABEL.paybackAmount;
        if (norm === "purchase_amount") return PLATFORM_LABEL.offerAmount;
        if (norm === "purchase_percent" || norm === "specified_percentage") return PLATFORM_LABEL.specificPercentage;
        if (norm === "remittance") return PLATFORM_LABEL.totalRemit;
        if (norm === "frequency" || norm === "paymentterms") return PLATFORM_LABEL.frequency;
    }

    if (category === "Addendum") {
        if (norm === "addendum_dated_principal_owner_amount") return PLATFORM_LABEL.offerAmount;
        if (norm === "addendum_dated_principal_owner_amount2") return PLATFORM_LABEL.paybackAmount;
    }

    if (category === "Appendix") {
        if (norm === "appendix_client_name") return "Client name";
        if (norm === "exhibit_owner_name") return "Exhibit owner";
        const exhibitVal = norm.match(/^exhibit_a_value_(\d+)$/);
        if (exhibitVal) return `Exhibit A company ${exhibitVal[1]}`;
    }

    return null;
}

const DEAL_REVIEW_APPENDIX_FEE_IDS = new Set([
    "appendix_underwriting_fees",
    "underwriter_fee",
    "underwriterfee",
    "underwriter_fees",
]);

/** Labels deduped globally (same value shown once across sections). */
const DEAL_REVIEW_GLOBAL_DEDUPE_LABELS = new Set(["underwriting fees", "net to merchant"]);

/** Deal Review section for a prefill field id (display only; DocuSign still gets every id). */
export function categorizeDealReviewPrefillFieldId(id: string): string {
    const s = normalizeDealReviewFieldId(id);
    if (DEAL_REVIEW_APPENDIX_FEE_IDS.has(s)) return "Appendix";
    if (s === "exhibit_owner_name" || /^exhibit_a_value_\d+$/.test(s)) return "Appendix";
    if (s.startsWith("ach_")) return "ACH";
    if (s.startsWith("addendum_")) return "Addendum";
    if (s.startsWith("authorization_") || s.startsWith("authorized_")) return "Authorization";
    if (s.startsWith("appendix_")) return "Appendix";
    if (s.startsWith("security_")) return "Security";
    if (s.startsWith("guaranty_")) return "Guaranty";
    if (s.startsWith("guarantor_")) return "Guarantor";
    if (s.startsWith("business_address_contract")) return "Contract Address";
    if (s.startsWith("business_address_")) return "Business Address";
    if (s === "business_address") return "Business Address";
    if (
        s.startsWith("purchase_") ||
        s === "specified_percentage" ||
        s === "remittance" ||
        s === "frequency" ||
        s === "paymentterms" ||
        s === "net_to_merchant" ||
        s === "netfundprovided"
    ) {
        return "Deal Terms";
    }
    if (
        s === "agreement_date" ||
        s === "entity_type" ||
        s === "federal_tax_id_ein" ||
        s === "state_of_inc" ||
        s === "doing_business_as"
    ) {
        return "General";
    }
    if (s.startsWith("client_") || s.includes("owner1_guarantor") || s.includes("owner2_guarantor")) {
        return "Parties";
    }
    if (s.startsWith("epo_")) return "EPOs";
    return "Other";
}

/** Optional nested heading inside Addendum / similar sections in Deal Review. */
export function dealReviewPrefillSubsection(fieldId: string, category: string): string | null {
    const id = normalizeDealReviewFieldId(fieldId);
    if (category === "Addendum") {
        if (id.includes("principal")) return "Principal";
        if (
            id.includes("legal_name") ||
            id.includes("_dba_") ||
            id.includes("type_of_entity") ||
            id.includes("_ein_") ||
            id.includes("mailing")
        ) {
            return "Entity slots";
        }
    }
    if (category === "Guaranty") {
        if (
            id === "guaranty_client_name" ||
            id === "guaranty_ss" ||
            id === "guaranty_ss_driver_license"
        ) {
            return "Client";
        }
        if (id.includes("guarantor1") || id.includes("owner1")) return "Owner 1";
        if (id.includes("guarantor2") || id.includes("owner2")) return "Owner 2";
    }
    if (category === "ACH") {
        if (id.includes("concent") || id.includes("consent")) return "Consent";
        if (
            id.includes("account_holder_bank") ||
            id.includes("bank_routing") ||
            id.includes("bank_account") ||
            (id.includes("bank_") && !id.includes("account_holder_address"))
        ) {
            return "Bank";
        }
        if (id.includes("reference_")) return "References";
        if (
            id.includes("bank_portal") ||
            id.includes("username") ||
            id.includes("password") ||
            id.includes("security_question") ||
            id.includes("security_answer") ||
            id.includes("other_infomation")
        ) {
            return "Online banking";
        }
        if (id.includes("account_holder")) return "Account holder";
    }
    if (category === "Guarantor") {
        if (id.includes("address") || id.includes("_city") || id.includes("_state") || id.includes("_zip")) {
            return "Address";
        }
        if (id.includes("email") || id.includes("phone")) return "Contact";
    }
    if (category === "Appendix" && /^exhibit_a_value_\d+$/.test(id)) {
        return "Exhibit A companies";
    }
    return null;
}

/** Drop section title from row label when repeated (e.g. "Contract City" under "Contract Address" → "City"). */
export function formatDealReviewFieldLabel(label: string, category: string): string {
    const rowLabel = String(label || "").trim();
    const section = String(category || "").trim();
    if (!rowLabel || !section) return rowLabel || section;

    const words = section.split(/\s+/).filter(Boolean);
    for (let n = words.length; n >= 1; n--) {
        const prefix = words.slice(0, n).join(" ");
        const re = new RegExp(`^${escapeRegExpForNote(prefix)}\\s+`, "i");
        if (re.test(rowLabel)) {
            const stripped = rowLabel.replace(re, "").trim();
            if (stripped) return stripped;
        }
    }
    return rowLabel;
}

/**
 * Deal Review labels aligned with Offer Decision / contract UI
 * (see PDFViewerModal offerDecisionSummaryRows, ContractTab, ContractPrefillEditForm).
 */
const PLATFORM_LABEL = {
    offerAmount: "Offer amount",
    paybackAmount: "Payback amount",
    totalRemit: "Total remit (payment amount)",
    /** OfferDecision.rate / terms factor — not SPA / purchasePercent. */
    rate: "Factor rate",
    specificPercentage: "Specific Percentage",
    term: "Term",
    frequency: "Frequency",
    netToMerchant: "Recipient funds",
    underwritingFees: "Underwriting fees",
    repayPerPeriod: "Repay per period",
} as const;

/** Short display labels for Deal Review (avoids repeated "Principal", "Security", etc.). */
const DEAL_REVIEW_CANONICAL_LABEL_BY_ID: Record<string, string> = {
    addendum_dated: "Date",
    addendum_dated_principal_owner: "Owner",
    addendum_dated_principal_business: "Business",
    addendum_dated_business_location: "Business location",
    addendum_dated_principal_state: "State",
    addendum_dated_principal_owner_amount: PLATFORM_LABEL.offerAmount,
    addendum_dated_principal_owner_amount2: PLATFORM_LABEL.paybackAmount,
    addendum_dated_principal_owner1_name: "Owner 1 — Name",
    addendum_dated_principal_owner1_date: "Owner 1 — Date",
    addendum_dated_principal_owner2_name: "Owner 2 — Name",
    addendum_dated_principal_owner2_date: "Owner 2 — Date",
    addendum_legal_name_1: "Legal name (slot 1)",
    addendum_legal_name_2: "Legal name (slot 2)",
    addendum_legal_name_3: "Legal name (slot 3)",
    addendum_dba_1: "DBA (slot 1)",
    addendum_dba_2: "DBA (slot 2)",
    addendum_dba_3: "DBA (slot 3)",
    addendum_type_of_entity_1: "Entity type (slot 1)",
    addendum_type_of_entity_2: "Entity type (slot 2)",
    addendum_type_of_entity_3: "Entity type (slot 3)",
    addendum_ein_1: "EIN (slot 1)",
    addendum_ein_2: "EIN (slot 2)",
    addendum_ein_3: "EIN (slot 3)",
    addendum_mailing_address_1: "Mailing (slot 1)",
    addendum_mailing_address_2: "Mailing (slot 2)",
    addendum_mailing_address_3: "Mailing (slot 3)",
    security_business_name: "Business name",
    security_tax_ein: "Tax ID / EIN",
    security_doing_business_as: "DBA",
    security_business_address: "Street",
    security_business_address_city: "City",
    security_business_address_state: "State",
    security_business_address_zip: "ZIP",
    security_guarantor: "Guarantor",
    guaranty_client_name: "Name",
    guaranty_ss: "SSN",
    guaranty_ss_driver_license: "Driver license",
    guaranty_owner1_name: "Owner 1 — Name",
    guaranty_owner1_ss: "Owner 1 — SSN",
    guaranty_owner1_driver_license: "Owner 1 — License",
    guaranty_owner2_name: "Owner 2 — Name",
    guaranty_owner2_ss: "Owner 2 — SSN",
    guaranty_owner2_driver_license: "Owner 2 — License",
    guaranty_guarantor1_name: "Guarantor 1 — Name",
    guaranty_guarantor1_ss: "Guarantor 1 — SSN",
    guaranty_guarantor1_driver_license: "Guarantor 1 — License",
    guaranty_guarantor2_name: "Guarantor 2 — Name",
    guaranty_guarantor2_ss: "Guarantor 2 — SSN",
    guaranty_guarantor2_driver_license: "Guarantor 2 — License",
    net_to_merchant: PLATFORM_LABEL.netToMerchant,
    netfundprovided: PLATFORM_LABEL.netToMerchant,
    appendix_underwriting_fees: PLATFORM_LABEL.underwritingFees,
    underwriter_fee: PLATFORM_LABEL.underwritingFees,
    underwriterfee: PLATFORM_LABEL.underwritingFees,
    underwriter_fees: PLATFORM_LABEL.underwritingFees,
    appendix_client_name: "Client name",
    exhibit_owner_name: "Exhibit owner",
    exhibit_a_value_1: "Exhibit A company 1",
    exhibit_a_value_2: "Exhibit A company 2",
    exhibit_a_value_3: "Exhibit A company 3",
    exhibit_a_value_4: "Exhibit A company 4",
    exhibit_a_value_5: "Exhibit A company 5",
    exhibit_a_value_6: "Exhibit A company 6",
    exhibit_a_value_7: "Exhibit A company 7",
    exhibit_a_value_8: "Exhibit A company 8",
    exhibit_a_value_9: "Exhibit A company 9",
    exhibit_a_value_10: "Exhibit A company 10",
    state_of_inc: "State of incorporation",
    doing_business_as: "DBA",
    federal_tax_id_ein: "EIN",
    agreement_date: "Agreement date",
    client_legal_name: "Legal name",
    client_email: "Email",
    client_phone: "Phone",
    client_name: "Name",
    owner1_guarantor_name: "Owner 1 — Guarantor",
    owner2_guarantor_name: "Owner 2 — Guarantor",
    business_address: "Street",
    business_address_city: "City",
    business_address_state: "State",
    business_address_zip: "ZIP",
    business_address_contract: "Street",
    business_address_contract_city: "City",
    business_address_contract_state: "State",
    business_address_contract_zip: "ZIP",
    purchase_price: PLATFORM_LABEL.paybackAmount,
    purchase_amount: PLATFORM_LABEL.offerAmount,
    purchase_percent: PLATFORM_LABEL.specificPercentage,
    specified_percentage: PLATFORM_LABEL.specificPercentage,
    remittance: PLATFORM_LABEL.totalRemit,
    frequency: PLATFORM_LABEL.frequency,
    paymentterms: PLATFORM_LABEL.frequency,
    authorization_application: "Merchant name",
    authorization_client_bank_name: "Bank name",
    authorization_client_bank_routing: "Routing number",
    authorization_client_bank_account: "Account number",
    authorization_client_name: "Business name",
    authorization_client_signer_name: "Business name (signer line)",
    authorization_client_name_print: "Printed client name",
    authorization_client_tax_id: "Tax ID / EIN",
    authorization_client_date: "Date",
    authorized_business_phone: "Business phone",
    ach_authorization_account_holder_name: "Name",
    ach_authorization_account_holder_dba: "DBA",
    ach_authorization_account_holder_phone: "Phone",
    ach_authorization_account_holder_address: "Street",
    ach_authorization_account_holder_city: "City",
    ach_authorization_account_holder_state: "State",
    ach_authorization_account_holder_zip: "ZIP",
    ach_authorization_account_holder_bank_name: "Bank name",
    ach_authorization_account_holder_bank_branch_city: "Branch city",
    ach_authorization_account_holder_bank_state: "Bank state",
    ach_authorization_account_holder_bank_zip: "Bank ZIP",
    ach_authorization_account_holder_bank_routing_number: "Routing number",
    ach_authorization_account_holder_bank_account_number: "Account number",
    ach_authorization_account_holder_bank_transaction_fee: "Transaction fee",
    ach_authorization_account_holder_bank_number_of_transactions: "NO. of transaction",
    ach_authorization_account_holder_date: "Date",
    ach_authorization_concent_account_holder_name: "Business name",
    ach_authorization_concent_account_holder_name_2: "Business name (page 15)",
    ach_authorization_concent_account_holder_date: "Date",
    guarantor_address: "Street",
    guarantor_address_city: "City",
    guarantor_address_state: "State",
    guarantor_address_zip: "ZIP",
    guarantor_email: "Email",
    guarantor_phone: "Phone",
};

function resolveDealReviewDisplayLabel(id: string, label: string, category: string): string {
    const norm = normalizeDealReviewFieldId(id);
    const canonical = DEAL_REVIEW_CANONICAL_LABEL_BY_ID[norm];
    if (canonical) return canonical;

    const inferred = inferDealReviewLabelFromFieldId(id, category);
    if (inferred) return inferred;

    const prefixes = DEAL_REVIEW_LABEL_PREFIXES_BY_CATEGORY[category] ?? [];
    let row = formatDealReviewFieldLabel(label, category);
    row = stripLeadingLabelPrefixes(row, prefixes);
    row = row.replace(/\bowner\s*(\d+)\b/gi, "Owner $1");
    row = row.replace(/\s+/g, " ").trim();
    return row || label || id;
}

/**
 * When a subsection heading is shown (e.g. "Consent"), drop the same word from the row label
 * (e.g. "Consent — Name" → "Name"). Only strips `Subsection — label` patterns, not "Bank name".
 */
export function stripDealReviewSubsectionFromLabel(
    label: string,
    subsection: string | null | undefined,
): string {
    const sub = String(subsection ?? "").trim();
    const row = String(label ?? "").trim();
    if (!sub || !row) return row;

    const escaped = escapeRegExpForNote(sub);
    const dashRe = new RegExp(`^${escaped}\\s*[—–-]\\s*`, "i");
    const dashStripped = row.replace(dashRe, "").trim();
    if (dashStripped && dashStripped !== row) {
        return dashStripped.charAt(0).toUpperCase() + dashStripped.slice(1);
    }

    const spaceRe = new RegExp(`^${escaped}\\s+`, "i");
    const spaceStripped = row.replace(spaceRe, "").trim();
    if (spaceStripped && spaceStripped !== row) {
        return spaceStripped.charAt(0).toUpperCase() + spaceStripped.slice(1);
    }

    return row;
}

function normalizeDealReviewDedupeValue(value: string): string {
    return String(value ?? "")
        .trim()
        .replace(/[$,\s]/g, "")
        .toLowerCase();
}

/**
 * Deal Review summary: hide empty values, shorten labels, one row per section+label.
 * DocuSign prefill still uses the full field list from `buildContractPrefillFieldsFromApplication`.
 */
export function prepareDealReviewPrefillDisplay(fields: ContractPrefillField[]): ContractPrefillField[] {
    const seenSection = new Set<string>();
    const seenGlobal = new Set<string>();
    /** Last row wins for labels like "Underwriting fees" (multiple DocuSign ids share one display row). */
    const globalDedupeLastBySection = new Map<string, ContractPrefillField>();
    const out: ContractPrefillField[] = [];
    for (const f of fields) {
        if (!str(f.value)) continue;
        const category = categorizeDealReviewPrefillFieldId(f.id);
        const subsection = dealReviewPrefillSubsection(f.id, category);
        let displayLabel = resolveDealReviewDisplayLabel(f.id, f.label, category);
        if (category === "Addendum" && !subsection) {
            displayLabel = stripLeadingLabelPrefixes(displayLabel, ["Addendum"]);
        }
        displayLabel = stripDealReviewSubsectionFromLabel(displayLabel, subsection);
        const labelKey = displayLabel.toLowerCase();
        const dedupeKey = `${category}|${labelKey}`;

        if (DEAL_REVIEW_GLOBAL_DEDUPE_LABELS.has(labelKey)) {
            const globalKey = `${labelKey}|${normalizeDealReviewDedupeValue(f.value)}`;
            if (seenGlobal.has(globalKey)) continue;
            seenGlobal.add(globalKey);
            globalDedupeLastBySection.set(dedupeKey, {
                id: f.id,
                label: displayLabel,
                value: f.value,
            });
            continue;
        }

        if (seenSection.has(dedupeKey)) continue;

        seenSection.add(dedupeKey);
        out.push({ id: f.id, label: displayLabel, value: f.value });
    }
    for (const [dedupeKey, field] of globalDedupeLastBySection) {
        if (seenSection.has(dedupeKey)) continue;
        seenSection.add(dedupeKey);
        out.push(field);
    }
    return out;
}

/** @deprecated Prefer `prepareDealReviewPrefillDisplay` for Deal Review UI. */
export function dedupePrefillFieldsByLabel(fields: ContractPrefillField[]): ContractPrefillField[] {
    return prepareDealReviewPrefillDisplay(fields);
}

/** When merged args still carry serialized decimals (`1400.00000000000`), coerce numeric fields to truncated two decimals. */
function coerceNumericPrefillMoneyStrings(obj: Partial<BuildContractPrefillFieldsArgs>): void {
    for (const key of MONEY_STRING_PREFILL_KEYS) {
        const raw = obj[key];
        if (raw === undefined || raw === null || raw === "") continue;
        if (coerceToFiniteNumber(raw) === undefined) continue;
        const formatted = truncateDecimalPrefill(raw);
        if (formatted !== "") (obj as Record<string, unknown>)[key] = formatted;
    }
}

function ownerFullName(first?: unknown, last?: unknown): string {
    const f = str(first);
    const l = str(last);
    if (f && l && f.toLowerCase() === l.toLowerCase()) return f;
    return `${f} ${l}`.trim();
}

/**
 * Application detail API maps Prisma `Client` to nested `client.business` / `client.owner`.
 * Prefill must read both that shape and legacy flat fields (`businessName`, `ownerFirstName`, …).
 */
function resolveOwnerAddressForPrefill(own: Record<string, any>, client: Record<string, any>) {
    const ownAddr = own.address && typeof own.address === "object" ? own.address : {};
    const flatStreet = typeof own.address === "string" ? own.address : "";
    return {
        ownerAddress1: str(client.ownerAddress1 || own.address1 || ownAddr.address1 || flatStreet),
        ownerAddress2: str(client.ownerAddress2 || own.address2 || ownAddr.address2),
        ownerCity: str(client.ownerCity || own.city || ownAddr.city),
        ownerState: str(client.ownerState || own.state || ownAddr.state),
        ownerZip: str(client.ownerZipCode || own.zipCode || own.zip || ownAddr.zipCode),
    };
}

function resolveClientForPrefill(anyApp: Record<string, any> | null | undefined) {
    const c = anyApp?.client || {};
    const biz = c.business || {};
    const addr = biz.address || {};
    const own = c.owner || {};
    const owners = Array.isArray(c.owners) ? c.owners : [];
    const primaryOwn = (owners[0] && typeof owners[0] === "object" ? owners[0] : own) || {};
    const ownerAddr = resolveOwnerAddressForPrefill(primaryOwn, c);

    return {
        businessName: str(c.businessName || biz.name),
        dba: str(c.dba || biz.dba),
        businessAddress1: str(c.businessAddress1 || addr.address1),
        businessAddress2: str(c.businessAddress2 || addr.address2),
        businessCity: str(c.businessCity || addr.city || c.city),
        businessState: str(c.businessState || addr.state || c.state),
        businessZip: str(c.businessZipCode || addr.zipCode || c.zip),
        incorporationState: str(
            c.businessIncorporationState ||
            biz.incorporationState ||
            c.stateOfIncorporation ||
            c.businessState ||
            addr.state,
        ),
        entityType: str(c.businessEntityType || biz.businessEntityType),
        ein: str(c.businessEinNumber || c.federalTaxIdEin || c.ein || biz.einNumber),
        businessEmail: str(c.businessEmail || biz.email),
        businessPhone: str(c.businessNumber || c.businessPhone || biz.number || c.phone),
        // Prefer nested owners[0] / owner over legacy flat client.owner* — Overview edits
        // update the owners collection first and flat columns can lag.
        ownerFirst: str(primaryOwn.firstName || own.firstName || c.ownerFirstName),
        ownerLast: str(primaryOwn.lastName || own.lastName || c.ownerLastName),
        ownerEmail: str(primaryOwn.email || own.email || c.ownerEmail),
        ownerPhone: str(
            primaryOwn.mobileNumber || own.mobileNumber || c.ownerMobileNumber || c.ownerPhone,
        ),
        ownerSsn: str(primaryOwn.ssn || own.ssn || c.ownerSsn),
        ownerDriverLicense: str(primaryOwn.driverLicense || own.driverLicense || c.driverLicense),
        ...ownerAddr,
    };
}

/** Legacy application `note` section for BoldSign prefill (superseded by `Contract.contractPrefillOverrides`). */
export const CONTRACT_PREFILL_OVERRIDES_SECTION = "CONTRACT_PREFILL_OVERRIDES";

/** Normalize `Contract.contractPrefillOverrides` (Prisma Json) for merge into prefill. */
export function normalizeContractPrefillOverrides(
    raw: unknown,
): Partial<BuildContractPrefillFieldsArgs> | null {
    if (raw == null) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Partial<BuildContractPrefillFieldsArgs>;
}

function coalescePlainBankField(...values: unknown[]): string {
    for (const value of values) {
        const s = str(value);
        if (s && !s.startsWith("enc:v1:")) return s;
    }
    return "";
}

export function resolveCanonicalBankFromPrefill(
    prefill: Partial<BuildContractPrefillFieldsArgs> | Record<string, unknown>,
): { bankName: string; accountNumber: string; routingNumber: string } {
    const row = prefill as Partial<BuildContractPrefillFieldsArgs>;
    return {
        bankName: coalescePlainBankField(
            row.authorizationClientBankName,
            row.achAuthorizationAccountHolderBankName,
        ),
        accountNumber: coalescePlainBankField(
            row.authorizationClientBankAccount,
            row.achAuthorizationAccountHolderBankAccountNumber,
        ),
        routingNumber: coalescePlainBankField(
            row.authorizationClientBankRouting,
            row.achAuthorizationAccountHolderBankRoutingNumber,
        ),
    };
}

export function applyCanonicalBankFieldsToPrefill(
    partial: Partial<BuildContractPrefillFieldsArgs>,
): Partial<BuildContractPrefillFieldsArgs> {
    const { bankName, accountNumber, routingNumber } = resolveCanonicalBankFromPrefill(partial);
    if (!bankName && !accountNumber && !routingNumber) return partial;

    const out = { ...partial };
    if (bankName) {
        out.authorizationClientBankName = bankName;
        out.achAuthorizationAccountHolderBankName = bankName;
    }
    if (accountNumber) {
        out.authorizationClientBankAccount = accountNumber;
        out.achAuthorizationAccountHolderBankAccountNumber = accountNumber;
    }
    if (routingNumber) {
        out.authorizationClientBankRouting = routingNumber;
        out.achAuthorizationAccountHolderBankRoutingNumber = routingNumber;
    }
    return out;
}

/**
 * Contract table columns updated alongside `contractPrefillOverrides`
 * (keep in sync with in-house-crm-be `CONTRACT_EXTRA_STRING_FIELDS`).
 */
export const CONTRACT_PREFILL_COLUMN_SYNC_KEYS = [
    "legalName",
    "clientName",
    "entityType",
    "remittance",
    "clientEmail",
    "clientPhone",
    "customerName",
    "purchasePrice",
    "purchaseAmount",
    "purchasePercent",
    "securityTaxEin",
    "businessAddress",
    "businessAddressCity",
    "businessAddressState",
    "businessAddressZip",
    "doingBusinessAs",
    "federalTaxIdEin",
    "exhibitOwnerName",
    "appendixClientName",
    "appendixUnderwritingFees",
    "authorizationClientBankName",
    "authorizationClientBankAccount",
    "authorizationClientBankRouting",
    "authorizationApplication",
    "authorizationClientDate",
    "authorizationClientName",
    "authorizationClientSignerName",
    "authorizationClientNamePrint",
    "authorizationClientTaxId",
    "authorizationClientBankName",
    "authorizationClientBankAccount",
    "authorizationClientBankRouting",
    "authorizedBusinessPhone",
    "businessAddressContract",
    "businessAddressContractCity",
    "businessAddressContractState",
    "businessAddressContractZip",
    "securityBusinessName",
    "securityDoingBusinessAs",
    "securityBusinessAddress",
    "securityBusinessAddressCity",
    "securityBusinessAddressState",
    "securityBusinessAddressZip",
    "securityGuarantor",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

const APPENDIX_FEE_OVERRIDE_ALIASES = [
    "appendixUnderwritingFees",
    "appendix_underwriting_fees",
    "underwriter_fee",
    "underwriterfee",
    "underwriter_fees",
] as const;

/** Map legacy / DocuSign fee field keys onto `appendixUnderwritingFees` for merge + display. */
function expandPrefillOverrideAliases(
    partial: Partial<BuildContractPrefillFieldsArgs>,
): Partial<BuildContractPrefillFieldsArgs> {
    const out = { ...partial } as Record<string, unknown>;
    if (str(out.appendixUnderwritingFees)) return out as Partial<BuildContractPrefillFieldsArgs>;
    for (const key of APPENDIX_FEE_OVERRIDE_ALIASES) {
        const fee = str(out[key]);
        if (fee) {
            out.appendixUnderwritingFees = fee;
            break;
        }
    }
    return out as Partial<BuildContractPrefillFieldsArgs>;
}

/** Merge prefill override layers; later layers win (used for Deal Review + DocuSign build). */
export function mergeContractPrefillOverrideLayers(
    ...layers: Array<Partial<BuildContractPrefillFieldsArgs> | null | undefined>
): Partial<BuildContractPrefillFieldsArgs> {
    const out: Partial<BuildContractPrefillFieldsArgs> = {};
    for (const layer of layers) {
        if (!layer || typeof layer !== "object" || Array.isArray(layer)) continue;
        for (const [key, val] of Object.entries(layer)) {
            if (val === undefined || val === null) continue;
            if (!str(val)) continue;
            if (key === "frequency") {
                const freq = sanitizePaymentFrequencyForPersist(val);
                if (!freq) continue;
                out.frequency = freq;
                continue;
            }
            (out as Record<string, unknown>)[key] = val;
        }
    }
    return expandPrefillOverrideAliases(out);
}

/**
 * Deal Review shows one "Underwriting fees" row; ensure every fee field id reflects saved overrides
 * (edit prefill may store `appendixUnderwritingFees` while DocuSign ids use `underwriter_fee`, etc.).
 */
export function overlaySavedAppendixFeeOnPrefillFields(
    fields: ContractPrefillField[],
    overrides: Partial<BuildContractPrefillFieldsArgs> | null | undefined,
    sources?: NetToMerchantPrefillSources,
): ContractPrefillField[] {
    const normalized = mergeContractPrefillOverrideLayers(overrides);
    const rawFee = str(normalized.appendixUnderwritingFees);
    if (!rawFee) return fields;

    const purchase = sources
        ? resolveOfferAmountDollarsForUnderwritingFees({
              ...sources,
              prefill: normalized,
          })
        : undefined;
    const displayFee = resolveAppendixUnderwritingFeesDisplay(rawFee, purchase) || rawFee;
    const value = normalizePrefillValueForUsFormat("underwriter_fee", displayFee);

    return fields.map((f) =>
        DEAL_REVIEW_APPENDIX_FEE_IDS.has(normalizeDealReviewFieldId(f.id))
            ? { ...f, value }
            : f,
    );
}

/** Map saved prefill to `updateContract` scalar fields so Deal Review / DocuSign see edits. */
export function contractPrefillToContractColumnUpdate(
    partial: Partial<BuildContractPrefillFieldsArgs>,
): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const key of CONTRACT_PREFILL_COLUMN_SYNC_KEYS) {
        if (!(key in partial)) continue;
        const v = str((partial as Record<string, unknown>)[key]);
        out[key] = v || null;
    }
    return out;
}

const PREFILL_ID_TO_CAMEL_KEY: Record<string, keyof BuildContractPrefillFieldsArgs> = (() => {
    const out: Record<string, keyof BuildContractPrefillFieldsArgs> = {};
    for (const [camel, ids] of Object.entries(FIELD_IDS)) {
        for (const id of ids) {
            out[id.toLowerCase()] = camel as keyof BuildContractPrefillFieldsArgs;
        }
    }
    return out;
})();

/** Reverse map DocuSign prefill ids → camelCase contract prefill keys. */
export function contractPrefillFieldsToPartial(
    fields: Array<{ id: string; value: string }>,
): Partial<BuildContractPrefillFieldsArgs> {
    const partial: Partial<BuildContractPrefillFieldsArgs> = {};
    for (const field of fields) {
        const key = PREFILL_ID_TO_CAMEL_KEY[String(field.id || "").trim().toLowerCase()];
        const value = str(field.value);
        if (!key || !value) continue;
        // Never map disclosure % tabs onto payment cadence.
        if (key === "frequency") {
            const freq = sanitizePaymentFrequencyForPersist(value);
            if (!freq) continue;
            partial.frequency = freq;
            continue;
        }
        (partial as Record<string, string>)[key] = value;
    }
    return partial;
}

export function contractPrefillFieldsToColumnUpdate(
    fields: Array<{ id: string; value: string }>,
): Record<string, string | null> {
    return contractPrefillToContractColumnUpdate(contractPrefillFieldsToPartial(fields));
}

/** Overwrite prefill payload rows from a synced partial (names, addresses, party slots). */
export function mergeSyncedPartialIntoPrefillFields(
    fields: ContractPrefillField[],
    partial: Partial<BuildContractPrefillFieldsArgs>,
): ContractPrefillField[] {
    const byId = new Map(fields.map((f) => [f.id, { ...f }]));
    const syncedFields = buildContractPrefillFields({
        customerName: str(partial.customerName) || "Signer",
        agreementDate: str(partial.agreementDate),
        ...partial,
    });
    for (const f of syncedFields) {
        const value = str(f.value);
        if (!value) continue;
        const existing = byId.get(f.id);
        byId.set(f.id, {
            id: f.id,
            label: existing?.label ?? f.label,
            value,
        });
    }
    return Array.from(byId.values());
}

function escapeRegExpForNote(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse a `[SECTION]\n{json}` block from an application note (same pattern as ContractTab). */
export function parseNoteStructuredSection<T>(note: string, sectionLabel: string): T | null {
    if (!note || !sectionLabel) return null;
    const sectionPattern = new RegExp(
        `\\[${escapeRegExpForNote(sectionLabel)}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\n\\[[^\\]]+\\]\\s*\\n|$)`,
        "g",
    );
    let match: RegExpExecArray | null = null;
    let lastPayload = "";
    while ((match = sectionPattern.exec(note)) !== null) {
        lastPayload = String(match[1] || "").trim();
    }
    if (!lastPayload) return null;
    try {
        return JSON.parse(lastPayload) as T;
    } catch {
        return null;
    }
}

export function upsertNoteStructuredSection(
    existingNote: string,
    sectionLabel: string,
    payload: unknown,
): string {
    const serialized = JSON.stringify(payload);
    const blockRegex = new RegExp(
        `(?:\\n\\n)?\\[${escapeRegExpForNote(sectionLabel)}\\]\\s*\\n[\\s\\S]*?(?=(?:\\n\\n\\[[^\\]]+\\]\\s*\\n)|$)`,
        "g",
    );
    const stripped = String(existingNote || "").replace(blockRegex, "").trim();
    const nextBlock = `[${sectionLabel}]\n${serialized}`;
    return stripped ? `${stripped}\n\n${nextBlock}` : nextBlock;
}

/** Later groups only fill ids not already present (application / client wins on overlap). */
function mergePrefillFieldsPreferFirst(...groups: ContractPrefillField[][]): ContractPrefillField[] {
    const map = new Map<string, ContractPrefillField>();
    for (const group of groups) {
        for (const f of group) {
            const val = str(f.value);
            if (!val || map.has(f.id)) continue;
            map.set(f.id, { id: f.id, label: f.label, value: val });
        }
    }
    return Array.from(map.values());
}

/** Scrubbing / BankDetail → ACH + authorization bank tabs (live CRM wins over stale contract columns). */
export function bankDetailRowToPrefillPartial(
    row: Record<string, unknown> | null | undefined,
): Partial<BuildContractPrefillFieldsArgs> {
    if (!row) return {};
    const name = str(row.bankName);
    const account = str(row.accountNumber);
    const routing = str(row.routingNumber);
    if (!name && !account && !routing) return {};
    return {
        achAuthorizationAccountHolderBankName: name,
        achAuthorizationAccountHolderBankAccountNumber: account,
        achAuthorizationAccountHolderBankRoutingNumber: routing,
        authorizationClientBankName: name,
        authorizationClientBankAccount: account,
        authorizationClientBankRouting: routing,
    };
}

function achRowToPrefillPartial(
    row: Record<string, unknown> | null | undefined,
    businessNameFallback = "",
): Partial<BuildContractPrefillFieldsArgs> {
    if (!row) return {};
    const accountHolderName = str(businessNameFallback) || str(row.accountHolderName);
    const out: Partial<BuildContractPrefillFieldsArgs> = {
        achAuthorizationAccountHolderName: accountHolderName,
        achAuthorizationConcentAccountHolderDate:
            prefillIsoDate(row.createdAt) || str(row.createdAt),
        achAuthorizationAccountHolderDba: str(row.dba),
        achAuthorizationAccountHolderPhone: str(row.phone),
        achAuthorizationAccountHolderAddress: str(row.address),
        achAuthorizationAccountHolderCity: str(row.city),
        achAuthorizationAccountHolderState: str(row.state),
        achAuthorizationAccountHolderZip: str(row.zip),
        achAuthorizationAccountHolderBankName: str(row.bankName),
        achAuthorizationAccountHolderBankBranchCity: str(row.bankBranchCity),
        achAuthorizationAccountHolderBankState: str(row.bankState),
        achAuthorizationAccountHolderBankZip: str(row.bankZip),
        achAuthorizationAccountHolderBankRoutingNumber: str(row.routingNumber),
        achAuthorizationAccountHolderBankAccountNumber: str(row.accountNumber),
        achAuthorizationBankPortalWebsite: str(row.ach_authorization_bank_portal_website) || str(row.achAuthorizationBankPortalWebsite),
        achAuthorizationUsername: str(row.ach_authorization_username) || str(row.achAuthorizationUsername),
        achAuthorizationPassword: str(row.ach_authorization_password) || str(row.achAuthorizationPassword),
        achAuthorizationSecurityQuestion1: str(row.ach_authorization_security_question1) || str(row.achAuthorizationSecurityQuestion1),
        achAuthorizationSecurityAnswer1: str(row.ach_authorization_security_answer1) || str(row.achAuthorizationSecurityAnswer1),
        achAuthorizationSecurityQuestion2: str(row.ach_authorization_security_question2) || str(row.achAuthorizationSecurityQuestion2),
        achAuthorizationSecurityAnswer2: str(row.ach_authorization_security_answer2) || str(row.achAuthorizationSecurityAnswer2),
        achAuthorizationSecurityQuestion3: str(row.ach_authorization_security_question3) || str(row.achAuthorizationSecurityQuestion3),
        achAuthorizationSecurityAnswer3: str(row.ach_authorization_security_answer3) || str(row.achAuthorizationSecurityAnswer3),
        achAuthorizationOtherInfomation: str(row.ach_authorization_other_infomation) || str(row.achAuthorizationOtherInfomation),
        achAuthorizationReferenceName1: str(row.ach_authorization_reference_name1) || str(row.achAuthorizationReferenceName1),
        achAuthorizationReferenceNumber1: str(row.ach_authorization_reference_number_1) || str(row.achAuthorizationReferenceNumber1),
        achAuthorizationReferenceRelationship1: str(row.ach_authorization_reference_relationship1) || str(row.achAuthorizationReferenceRelationship1),
        achAuthorizationReferenceName2: str(row.ach_authorization_reference_name2) || str(row.achAuthorizationReferenceName2),
        achAuthorizationReferenceNumber2: str(row.ach_authorization_reference_number2) || str(row.achAuthorizationReferenceNumber2),
        achAuthorizationReferenceRelationship2: str(row.ach_authorization_reference_relationship2) || str(row.achAuthorizationReferenceRelationship2),
        achAuthorizationReferenceName3: str(row.ach_authorization_reference_name3) || str(row.achAuthorizationReferenceName3),
        achAuthorizationReferenceNumber3: str(row.ach_authorization_reference_number3) || str(row.achAuthorizationReferenceNumber3),
        achAuthorizationReferenceRelationship3: str(row.ach_authorization_reference_relationship3) || str(row.achAuthorizationReferenceRelationship3),
    };
    return out;
}

function addendumRowToPrefillPartial(row: Record<string, unknown> | null | undefined): Partial<BuildContractPrefillFieldsArgs> {
    if (!row) return {};
    return {
        addendumDated: prefillIsoDate(row.addendumDated) || str(row.addendumDated),
        addendumDatedPrincipalOwner: str(row.principalOwner),
        addendumDatedPrincipalBusiness: str(row.principalBusiness),
        addendumDatedBusinessLocation: str(row.businessLocation),
        addendumDatedPrincipalState: str(row.principalState),
        addendumDatedPrincipalOwnerAmount: truncateDecimalPrefill(row.principalOwnerAmount1) || str(row.principalOwnerAmount1),
        addendumDatedPrincipalOwnerAmount2: truncateDecimalPrefill(row.principalOwnerAmount2) || str(row.principalOwnerAmount2),
        addendumDatedPrincipalOwner1Name: str(row.principalOwner1Name),
        addendumDatedPrincipalOwner1Date: prefillIsoDate(row.principalOwner1Date) || str(row.principalOwner1Date),
        addendumDatedPrincipalOwner2Name: str(row.principalOwner2Name),
        addendumDatedPrincipalOwner2Date: prefillIsoDate(row.principalOwner2Date) || str(row.principalOwner2Date),
    };
}

function addendumSlotExtraFields(row: Record<string, unknown> | null | undefined): ContractPrefillField[] {
    if (!row) return [];
    const out: ContractPrefillField[] = [];
    for (const s of [1, 2, 3] as const) {
        out.push(...mapIds([`addendum_legal_name_${s}`], `Addendum Legal Name ${s}`, str(row[`legalName${s}`])));
        out.push(...mapIds([`addendum_dba_${s}`], `Addendum DBA ${s}`, str(row[`dba${s}`])));
        out.push(
            ...mapIds(
                [`addendum_type_of_entity_${s}`],
                `Addendum Entity Type ${s}`,
                normalizeEntityTypeForBoldSignDropdown(str(row[`typeOfEntity${s}`])),
            ),
        );
        out.push(...mapIds([`addendum_ein_${s}`], `Addendum EIN ${s}`, str(row[`ein${s}`])));
        out.push(...mapIds([`addendum_mailing_address_${s}`], `Addendum Mailing ${s}`, str(row[`mailingAddress${s}`])));
    }
    return out;
}

function epoExtraFields(row: Record<string, unknown> | null | undefined): ContractPrefillField[] {
    if (!row) return [];
    const out: ContractPrefillField[] = [];
    for (const s of [1, 2, 3] as const) {
        const rawAmt = row[`amountReceived${s}`];
        const v = truncateDecimalPrefill(rawAmt) || str(rawAmt);
        out.push(...mapIds([`epo_amount_received_${s}`], `EPO Amount ${s}`, v));
        out.push(...mapIds([`epo_received_date_${s}`], `EPO Date ${s}`, str(row[`receivedDate${s}`])));
    }
    return out;
}

/** Resolve Owner 1 home address from a CRM / contract-owner row. */
function ownerRowAddressParts(row: Record<string, unknown> | null | undefined): {
    street: string;
    city: string;
    state: string;
    zip: string;
} {
    if (!row) return { street: "", city: "", state: "", zip: "" };
    const nested = (row.address && typeof row.address === "object"
        ? (row.address as Record<string, unknown>)
        : null);
    const a1 = str(row.address1 ?? nested?.address1 ?? (typeof row.address === "string" ? row.address : ""));
    const a2 = str(row.address2 ?? nested?.address2);
    return {
        street: [a1, a2].filter(Boolean).join(", ").trim(),
        city: str(row.city ?? nested?.city),
        state: str(row.state ?? nested?.state),
        zip: str(row.zip ?? row.zipCode ?? nested?.zipCode),
    };
}

/** Contact / mailing + guarantor tabs — Owner 1 home address (not business location). */
function applyOwner1AddressToPrefillPartial(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    row: Record<string, unknown> | null | undefined,
): void {
    const { street, city, state, zip } = ownerRowAddressParts(row);
    if (!street && !city && !state && !zip) return;

    const bizStreet = str(partial.businessAddress);
    const contactLooksMirrored =
        !str(partial.businessAddressContract) ||
        (bizStreet.length > 0 && str(partial.businessAddressContract) === bizStreet);
    const guarantorLooksMirrored =
        !str(partial.guarantorAddress) ||
        (bizStreet.length > 0 && str(partial.guarantorAddress) === bizStreet);

    if (street) {
        if (contactLooksMirrored) partial.businessAddressContract = street;
        if (guarantorLooksMirrored) partial.guarantorAddress = street;
    }
    if (city) {
        if (contactLooksMirrored || !str(partial.businessAddressContractCity)) {
            partial.businessAddressContractCity = city;
        }
        if (guarantorLooksMirrored || !str(partial.guarantorAddressCity)) {
            partial.guarantorAddressCity = city;
        }
    }
    if (state) {
        if (contactLooksMirrored || !str(partial.businessAddressContractState)) {
            partial.businessAddressContractState = state;
        }
        if (guarantorLooksMirrored || !str(partial.guarantorAddressState)) {
            partial.guarantorAddressState = state;
        }
    }
    if (zip) {
        if (contactLooksMirrored || !str(partial.businessAddressContractZip)) {
            partial.businessAddressContractZip = zip;
        }
        if (guarantorLooksMirrored || !str(partial.guarantorAddressZip)) {
            partial.guarantorAddressZip = zip;
        }
    }
}

/** Mirror each linked owner into Client / Owner / Guarantor slots for that index (1 or 2). */
export function applyOwnerRowsToPrefillMerge(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    rows: Record<string, unknown>[] | null | undefined,
): void {
    if (!rows?.length) return;

    const o1 = rows[0];
    if (o1) {
        const n1 = ownerFullName(o1.firstName, o1.lastName);
        const ssn1 = str(o1.ssnNumber ?? o1.ssn);
        const dl1 = str(o1.driverLicenseNumber ?? o1.driverLicense);
        applyOwner1AddressToPrefillPartial(partial, o1);
        if (n1 || ssn1 || dl1 || partyEmail(o1)) {
            if (n1) {
                syncPrimaryPartyNameToPrefillPartial(partial as Record<string, unknown>, n1);
            }
            if (ssn1) {
                partial.guarantySs = ssn1;
                partial.guarantyOwner1Ss = ssn1;
                partial.guarantyGuarantor1Ss = ssn1;
            }
            if (dl1) {
                partial.guarantySsDriverLicense = dl1;
                partial.guarantyOwner1DriverLicense = dl1;
                partial.guarantyGuarantor1DriverLicense = dl1;
            }
        }
    }

    const o2 = rows[1];
    const n2 = ownerFullName(o2?.firstName, o2?.lastName);
    const hasSecondOwner = Boolean(o2 && (partyEmail(o2) || n2));
    if (hasSecondOwner) {
        const ssn2 = str(o2?.ssnNumber ?? o2?.ssn);
        const dl2 = str(o2?.driverLicenseNumber ?? o2?.driverLicense);
        if (n2) {
            syncOwner2NameToPrefillPartial(partial as Record<string, unknown>, n2);
        }
        if (ssn2) {
            partial.guarantyOwner2Ss = ssn2;
            partial.guarantyGuarantor2Ss = ssn2;
        }
        if (dl2) {
            partial.guarantyOwner2DriverLicense = dl2;
            partial.guarantyGuarantor2DriverLicense = dl2;
        }
        const n1 = ownerFullName(rows[0]?.firstName, rows[0]?.lastName);
        partial.exhibitOwnerName = n1 || n2;
    }
}

function ownersToPrefillPartial(rows: Record<string, unknown>[] | null | undefined): Partial<BuildContractPrefillFieldsArgs> {
    const out: Partial<BuildContractPrefillFieldsArgs> = {};
    applyOwnerRowsToPrefillMerge(out, rows);
    return out;
}

function partyEmail(row: Record<string, unknown> | undefined): string {
    return str(row?.email);
}

function guarantorsToPrefillPartial(rows: Record<string, unknown>[] | null | undefined): Partial<BuildContractPrefillFieldsArgs> {
    if (!rows?.length) return {};
    const g1 = rows[0];
    const g2 = rows[1];
    const guarantorName = ownerFullName(g1?.firstName, g1?.lastName);
    const out: Partial<BuildContractPrefillFieldsArgs> = {
        securityGuarantor: guarantorName,
        guarantorEmail: str(g1?.email),
        guarantorPhone: str(g1?.phone),
        guarantorAddress: str(g1?.address),
        guarantorAddressCity: str(g1?.city),
        guarantorAddressState: str(g1?.state),
        guarantorAddressZip: str(g1?.zip),
        guarantyGuarantor1Name: ownerFullName(g1?.firstName, g1?.lastName),
        guarantyGuarantor1Ss: str(g1?.ssnNumber ?? g1?.ssn),
        guarantyGuarantor1DriverLicense: str(g1?.driverLicenseNumber ?? g1?.driverLicense),
    };
    const g2Name = ownerFullName(g2?.firstName, g2?.lastName);
    if (g2Name || partyEmail(g2) || str(g2?.ssnNumber ?? g2?.ssn)) {
        if (g2Name) {
            syncOwner2NameToPrefillPartial(out as Record<string, unknown>, g2Name);
        }
        const ssn2 = str(g2?.ssnNumber ?? g2?.ssn);
        if (ssn2) {
            out.guarantyOwner2Ss = ssn2;
            out.guarantyGuarantor2Ss = ssn2;
        }
        const dl2 = str(g2?.driverLicenseNumber ?? g2?.driverLicense);
        if (dl2) {
            out.guarantyOwner2DriverLicense = dl2;
            out.guarantyGuarantor2DriverLicense = dl2;
        }
    }
    return out;
}

/** ACH authorization `authorization_application` tab — merchant legal name, not CRM application id. */
function resolveAuthorizationApplicationMerchantName(row: Record<string, unknown>): string {
    const merchant = resolveContractBusinessLegalNameForPrefill(row);
    const raw = str(row.authorizationApplication);
    if (!raw) return merchant;
    if (/^\d+$/.test(raw.replace(/\s/g, ""))) return merchant || raw;
    return raw;
}

/** BoldSign authorization / ACH holder tabs — merchant business name. */
export const AUTHORIZATION_BUSINESS_NAME_PREFILL_KEYS = [
    "authorizationClientName",
    /** Page 13 “signer name” line on the ACH auth block is the business, not the person. */
    "authorizationClientSignerName",
    "achAuthorizationAccountHolderName",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

/** ACH consent lines (pages 14–15) — client/person name, not business legal name. */
export const ACH_CONSENT_CLIENT_NAME_PREFILL_KEYS = [
    "achAuthorizationConcentAccountHolderName",
    "achAuthorizationConcentAccountHolderName2",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

/** RPA person-name tabs (owner/signer), not merchant legal name. */
export const CLIENT_PERSON_NAME_PREFILL_KEYS = [
    "clientName",
    "appendixClientName",
    "guarantyClientName",
    /** Page 13 printed name under the ACH auth signature. */
    "authorizationClientNamePrint",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

/** Signer 1 / Owner 1 / Guarantor 1 / Client 1 / Merchant 1 — same person on every line. */
export const PRIMARY_PARTY_NAME_SYNC_CAMEL_KEYS = [
    "customerName",
    "clientName",
    "owner1GuarantorName",
    "guarantyClientName",
    "guarantyOwner1Name",
    "guarantyGuarantor1Name",
    "securityGuarantor",
    "exhibitOwnerName",
    "appendixClientName",
    "authorizationClientNamePrint",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

/** Business location only — never contact/mailing or guarantor (owner home) address. */
export const CANONICAL_BUSINESS_ADDRESS_STREET_KEYS = [
    "businessAddress",
    "securityBusinessAddress",
    "achAuthorizationAccountHolderAddress",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

export const CANONICAL_BUSINESS_ADDRESS_CITY_KEYS = [
    "businessAddressCity",
    "securityBusinessAddressCity",
    "achAuthorizationAccountHolderCity",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

export const CANONICAL_BUSINESS_ADDRESS_STATE_KEYS = [
    "businessAddressState",
    "securityBusinessAddressState",
    "achAuthorizationAccountHolderState",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

export const CANONICAL_BUSINESS_ADDRESS_ZIP_KEYS = [
    "businessAddressZip",
    "securityBusinessAddressZip",
    "achAuthorizationAccountHolderZip",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

/** Owner 1 home — Contact / mailing + Guarantor address tabs. */
export const CANONICAL_OWNER_ADDRESS_STREET_KEYS = [
    "businessAddressContract",
    "guarantorAddress",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

export const CANONICAL_OWNER_ADDRESS_CITY_KEYS = [
    "businessAddressContractCity",
    "guarantorAddressCity",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

export const CANONICAL_OWNER_ADDRESS_STATE_KEYS = [
    "businessAddressContractState",
    "guarantorAddressState",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

export const CANONICAL_OWNER_ADDRESS_ZIP_KEYS = [
    "businessAddressContractZip",
    "guarantorAddressZip",
] as const satisfies readonly (keyof BuildContractPrefillFieldsArgs)[];

/** Force the canonical primary-party person name onto every linked signer-1 line. */
export function syncPrimaryPartyNameToPrefillPartial(
    partial: Record<string, unknown>,
    name: string,
): void {
    const value = String(name || "").trim();
    if (!value) return;
    for (const key of PRIMARY_PARTY_NAME_SYNC_CAMEL_KEYS) {
        partial[key] = value;
    }
}

/** Mirror business location across security + ACH holder tabs (not contact / guarantor). */
export function applyCanonicalBusinessAddressPrefillFields(
    partial: Partial<BuildContractPrefillFieldsArgs>,
): Partial<BuildContractPrefillFieldsArgs> {
    const out = { ...partial };
    const street = str(out.businessAddress);
    const city = str(out.businessAddressCity);
    const state = str(out.businessAddressState);
    const zip = str(out.businessAddressZip);
    if (!street && !city && !state && !zip) return out;
    if (street) {
        for (const key of CANONICAL_BUSINESS_ADDRESS_STREET_KEYS) {
            (out as Record<string, string>)[key] = street;
        }
    }
    if (city) {
        for (const key of CANONICAL_BUSINESS_ADDRESS_CITY_KEYS) {
            (out as Record<string, string>)[key] = city;
        }
    }
    if (state) {
        for (const key of CANONICAL_BUSINESS_ADDRESS_STATE_KEYS) {
            (out as Record<string, string>)[key] = state;
        }
    }
    if (zip) {
        for (const key of CANONICAL_BUSINESS_ADDRESS_ZIP_KEYS) {
            (out as Record<string, string>)[key] = zip;
        }
    }
    return out;
}

/**
 * Mirror Owner 1 home address across Contact / mailing and Guarantor tabs.
 * Does not touch business location fields.
 */
export function applyCanonicalOwnerAddressPrefillFields(
    partial: Partial<BuildContractPrefillFieldsArgs>,
): Partial<BuildContractPrefillFieldsArgs> {
    const out = { ...partial };
    const street = str(out.businessAddressContract) || str(out.guarantorAddress);
    const city = str(out.businessAddressContractCity) || str(out.guarantorAddressCity);
    const state = str(out.businessAddressContractState) || str(out.guarantorAddressState);
    const zip = str(out.businessAddressContractZip) || str(out.guarantorAddressZip);
    if (!street && !city && !state && !zip) return out;
    if (street) {
        for (const key of CANONICAL_OWNER_ADDRESS_STREET_KEYS) {
            (out as Record<string, string>)[key] = street;
        }
    }
    if (city) {
        for (const key of CANONICAL_OWNER_ADDRESS_CITY_KEYS) {
            (out as Record<string, string>)[key] = city;
        }
    }
    if (state) {
        for (const key of CANONICAL_OWNER_ADDRESS_STATE_KEYS) {
            (out as Record<string, string>)[key] = state;
        }
    }
    if (zip) {
        for (const key of CANONICAL_OWNER_ADDRESS_ZIP_KEYS) {
            (out as Record<string, string>)[key] = zip;
        }
    }
    return out;
}

/**
 * Undo stale prefill where business ↔ owner addresses were force-mirrored.
 * CRM business profile and Owner 1 home address stay distinct.
 */
export function repairDistinctBusinessAndOwnerAddresses(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    sources: {
        businessStreet?: string;
        businessCity?: string;
        businessState?: string;
        businessZip?: string;
        ownerStreet?: string;
        ownerCity?: string;
        ownerState?: string;
        ownerZip?: string;
    },
): Partial<BuildContractPrefillFieldsArgs> {
    const out = { ...partial };
    const bizStreet = str(sources.businessStreet);
    const bizCity = str(sources.businessCity);
    const bizState = str(sources.businessState);
    const bizZip = str(sources.businessZip);
    const ownStreet = str(sources.ownerStreet);
    const ownCity = str(sources.ownerCity);
    const ownState = str(sources.ownerState);
    const ownZip = str(sources.ownerZip);

    const addressesDiffer =
        (bizStreet && ownStreet && bizStreet !== ownStreet) ||
        (bizCity && ownCity && bizCity !== ownCity) ||
        (bizState && ownState && bizState !== ownState) ||
        (bizZip && ownZip && bizZip !== ownZip);

    if (!addressesDiffer) return out;

    // Business tab wrongly showing owner home → restore CRM business profile.
    if (bizStreet && ownStreet && str(out.businessAddress) === ownStreet) {
        out.businessAddress = bizStreet;
        if (bizCity) out.businessAddressCity = bizCity;
        if (bizState) out.businessAddressState = bizState;
        if (bizZip) out.businessAddressZip = bizZip;
    }

    // Contact / guarantor wrongly showing business location → restore owner home.
    if (ownStreet && bizStreet) {
        if (!str(out.businessAddressContract) || str(out.businessAddressContract) === bizStreet) {
            out.businessAddressContract = ownStreet;
            if (ownCity) out.businessAddressContractCity = ownCity;
            if (ownState) out.businessAddressContractState = ownState;
            if (ownZip) out.businessAddressContractZip = ownZip;
        }
        if (!str(out.guarantorAddress) || str(out.guarantorAddress) === bizStreet) {
            out.guarantorAddress = ownStreet;
            if (ownCity) out.guarantorAddressCity = ownCity;
            if (ownState) out.guarantorAddressState = ownState;
            if (ownZip) out.guarantorAddressZip = ownZip;
        }
    }

    return out;
}

/**
 * Keep business location and Owner 1 home address distinct, then mirror within each family.
 */
export function applySeparatedAddressPrefillFields(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    anyApp?: unknown,
): Partial<BuildContractPrefillFieldsArgs> {
    const r = anyApp ? resolveClientForPrefill(anyApp as Record<string, any>) : null;
    const businessStreet = r
        ? [r.businessAddress1, r.businessAddress2].filter(Boolean).join(", ").trim()
        : str(partial.businessAddress);
    const ownerStreet = r
        ? [r.ownerAddress1, r.ownerAddress2].filter(Boolean).join(", ").trim()
        : str(partial.businessAddressContract) || str(partial.guarantorAddress);

    const repaired = repairDistinctBusinessAndOwnerAddresses(partial, {
        businessStreet: businessStreet || str(partial.businessAddress),
        businessCity: r ? r.businessCity : str(partial.businessAddressCity),
        businessState: r ? r.businessState : str(partial.businessAddressState),
        businessZip: r ? r.businessZip : str(partial.businessAddressZip),
        ownerStreet: ownerStreet || str(partial.businessAddressContract) || str(partial.guarantorAddress),
        ownerCity: r ? r.ownerCity : str(partial.businessAddressContractCity) || str(partial.guarantorAddressCity),
        ownerState: r
            ? r.ownerState
            : str(partial.businessAddressContractState) || str(partial.guarantorAddressState),
        ownerZip: r
            ? r.ownerZip
            : str(partial.businessAddressContractZip) || str(partial.guarantorAddressZip),
    });

    return applyCanonicalOwnerAddressPrefillFields(
        applyCanonicalBusinessAddressPrefillFields(repaired),
    );
}

function businessNameFromApplicationClient(anyApp: unknown): string {
    if (!anyApp) return "";
    const a = anyApp as Record<string, any>;
    const r = resolveClientForPrefill(a);
    const bi = Array.isArray(a?.businessInfo) ? a.businessInfo[0] : a?.businessInfo;
    return str(r.businessName || bi?.clientBusinessName);
}

/** Client Overview `businessName` — not contract `legalName`. */
export function resolveApplicationClientBusinessName(application?: unknown): string {
    return businessNameFromApplicationClient(application);
}

/** Resolve merchant legal/business name for authorization tabs (never owner `customerName`). */
export function resolveContractBusinessLegalNameForPrefill(
    partial: Partial<BuildContractPrefillFieldsArgs> | Record<string, unknown>,
    application?: unknown,
): string {
    const row = partial as Record<string, unknown>;
    const authApp = str(row.authorizationApplication);
    const authAppMerchant =
        authApp && !/^\d+$/.test(authApp.replace(/\s/g, "")) ? authApp : "";
    const linkedClient = row.client as Record<string, unknown> | undefined;
    // Saved Verify Prefill / contract legal name wins over live Overview so
    // intentional Prefill name edits survive reopen + DocuSign send.
    const fromApp = businessNameFromApplicationClient(application);

    return (
        str(row.legalName) ||
        str(row.securityBusinessName) ||
        fromApp ||
        str(linkedClient?.businessName) ||
        authAppMerchant
    );
}

/** Owner / signer name for client_name, appendix_client_name, guaranty_client_name, authorization signer line (not business legal name). */
export function resolveContractClientPersonNameForPrefill(
    partial: Partial<BuildContractPrefillFieldsArgs> | Record<string, unknown>,
    application?: unknown,
): string {
    const row = partial as Record<string, unknown>;
    const linkedClient = row.client as Record<string, unknown> | undefined;
    const linkedOwnerName = ownerFullName(linkedClient?.ownerFirstName, linkedClient?.ownerLastName);
    const legal =
        str(row.legalName) ||
        str(row.securityBusinessName) ||
        str(linkedClient?.businessName) ||
        "";
    const legalNorm = legal.toLowerCase();
    const isLegal = (name: string) => Boolean(legalNorm && name.toLowerCase() === legalNorm);

    /** Prefer saved Verify Prefill person names over live Overview when present. */
    const liveAppName = getApplicationPrimaryRecipientName(application);
    const liveAppOk =
        Boolean(liveAppName) && liveAppName !== "Signer" && !isLegal(liveAppName);

    const candidates = [
        str(row.customerName),
        str(row.clientName),
        str(row.owner1GuarantorName),
        str(row.guarantyOwner1Name),
        str(row.guarantyGuarantor1Name),
        str(row.guarantyClientName),
        str(row.securityGuarantor),
        str(row.authorizationClientNamePrint),
        liveAppOk ? liveAppName : "",
        linkedOwnerName,
        str(row.exhibitOwnerName),
        str(row.appendixClientName),
    ];
    return candidates.find((n) => n && !isLegal(n)) || "";
}

/** Force client / appendix / guaranty name tabs to owner person name (never merchant legal name). */
export function applyClientPersonNamePrefillFields(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    application?: unknown,
): Partial<BuildContractPrefillFieldsArgs> {
    const personName = resolveContractClientPersonNameForPrefill(partial, application);
    if (!personName) return partial;
    const out = { ...partial } as Record<string, unknown>;
    // Gap-fill only — keep intentional Verify Prefill person-name edits.
    for (const key of PRIMARY_PARTY_NAME_SYNC_CAMEL_KEYS) {
        if (str(out[key])) continue;
        out[key] = personName;
    }
    return out as Partial<BuildContractPrefillFieldsArgs>;
}

/** Force authorization / ACH account-holder prefill tabs to merchant business name. */
export function applyAuthorizationBusinessNamePrefillFields(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    application?: unknown,
): Partial<BuildContractPrefillFieldsArgs> {
    const businessName = resolveContractBusinessLegalNameForPrefill(partial, application);
    let out = { ...partial };
    if (businessName) {
        for (const key of AUTHORIZATION_BUSINESS_NAME_PREFILL_KEYS) {
            // Keep intentional Verify Prefill edits on individual auth name tabs.
            if (str((out as Record<string, unknown>)[key])) continue;
            (out as Record<string, string>)[key] = businessName;
        }
    }
    // Consent declaration lines (pages 14–15) always use client/person name.
    out = applyAchConsentClientNamePrefillFields(out, application);
    return out;
}

/** Force ACH consent / declaration lines to client (person) name — pages 14–15. */
export function applyAchConsentClientNamePrefillFields(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    application?: unknown,
): Partial<BuildContractPrefillFieldsArgs> {
    const clientName = resolveContractClientPersonNameForPrefill(partial, application);
    if (!clientName) return partial;
    const out = { ...partial };
    for (const key of ACH_CONSENT_CLIENT_NAME_PREFILL_KEYS) {
        if (str((out as Record<string, unknown>)[key])) continue;
        (out as Record<string, string>)[key] = clientName;
    }
    return out;
}

export function exhibitValuesToPrefillPartial(
    row: Record<string, unknown> | null | undefined,
): Partial<BuildContractPrefillFieldsArgs> {
    if (!row) return {};
    const overrides = normalizeContractPrefillOverrides(row.contractPrefillOverrides) ?? {};
    const out: Partial<BuildContractPrefillFieldsArgs> = {};
    for (const key of EXHIBIT_A_VALUE_FIELD_KEYS) {
        const v = str(row[key]) || str(overrides[key]);
        if (v) (out as Record<string, string>)[key] = v;
    }
    return out;
}

// contractRowToPrefillPartial prefill of feilds happens here

function contractRowToPrefillPartial(row: Record<string, unknown> | null | undefined): Partial<BuildContractPrefillFieldsArgs> {
    if (!row) return {};
    const offer = (row.offer ?? null) as Record<string, unknown> | null;
    const paymentBank = (row.paymentBank ?? null) as Record<string, unknown> | null;

    const purchaseAmount = firstTruncateDecimal(row.purchaseAmount, offer?.offer, row.approvedAmount);
    const purchasePrice = firstTruncateDecimal(row.purchasePrice, offer?.totalRemit, row.totalAmount);
    const netToMerchant =
        str(row.netToMerchant) ||
        formatNetToMerchantPrefillValue(
            computeNetToMerchantDollars({ contract: row, offerDecision: offer }),
        );
    const frequency =
        coercePaymentFrequencyLabel(row.frequency) ||
        resolveOfferFrequencyLabel({ contract: row, offerDecision: offer });

    const agreementDatePrefill =
        prefillIsoDate(row.agreementDate) || prefillIsoDate(row.contractDate);
    let authorizationDate = prefillIsoDate(row.authorizationClientDate);
    if (!authorizationDate && agreementDatePrefill) authorizationDate = agreementDatePrefill;

    let authBankName = str(row.authorizationClientBankName);
    if (!authBankName) authBankName = str(paymentBank?.bankName);

    return applySplitAddressStreetFields({
        customerName: str(row.customerName),
        entityType: str(row.entityType),
        legalName: str(row.legalName),
        doingBusinessAs: str(row.doingBusinessAs),
        businessAddress: str(row.businessAddress),
        federalTaxIdEin: str(row.federalTaxIdEin),
        agreementDate: agreementDatePrefill || str(row.agreementDate),
        state: str(row.state),
        businessAddressCity: str(row.businessAddressCity),
        businessAddressState: str(row.businessAddressState),
        businessAddressZip: str(row.businessAddressZip),
        businessAddressContract: str(row.businessAddressContract),
        businessAddressContractCity: str(row.businessAddressContractCity),
        businessAddressContractState: str(row.businessAddressContractState),
        businessAddressContractZip: str(row.businessAddressContractZip),
        clientEmail: str(row.clientEmail),
        clientPhone: str(row.clientPhone),
        purchasePrice,
        purchaseAmount,
        purchasePercent: resolvePurchasePercentPrefillValue({
            contract: row,
            offerDecision: offer,
        }),
        frequency,
        netToMerchant,
        remittance: resolveRemittancePrefillValue({ contract: row, offerDecision: offer }),
        clientName: str(row.customerName) || str(row.clientName),
        securityBusinessName: str(row.securityBusinessName),
        securityTaxEin: str(row.securityTaxEin),
        securityDoingBusinessAs: str(row.securityDoingBusinessAs),
        securityBusinessAddress: str(row.securityBusinessAddress),
        securityBusinessAddressCity: str(row.securityBusinessAddressCity),
        securityBusinessAddressState: str(row.securityBusinessAddressState),
        securityBusinessAddressZip: str(row.securityBusinessAddressZip),
        securityGuarantor: str(row.securityGuarantor),
        guarantyClientName: str(row.customerName) || str(row.guarantyClientName),
        appendixUnderwritingFees: (() => {
            const rowRaw = str(row.appendixUnderwritingFees);
            const purchaseNum = coerceToFiniteNumber(purchaseAmount);
            if (rowRaw) {
                return resolveAppendixUnderwritingFeesDisplay(rowRaw, purchaseNum);
            }
            const feeDollars = resolveOfferFeeAmountForDeal({
                fundedAmount: purchaseNum ?? coerceToFiniteNumber(offer?.offer),
                factorRate: offer?.rate,
                feesRaw: offer?.fees,
            });
            if (feeDollars > 0) {
                return formatOfferDecisionFeesDollarsForPrefill(feeDollars);
            }
            return resolveAppendixUnderwritingFeesDisplay(offer?.fees, purchaseNum);
        })(),
        appendixClientName: str(row.customerName) || str(row.appendixClientName),
        authorizationApplication: resolveAuthorizationApplicationMerchantName(row),
        authorizationClientBankName: authBankName,
        authorizationClientBankRouting: str(row.authorizationClientBankRouting),
        authorizationClientBankAccount: str(row.authorizationClientBankAccount),
        authorizationClientName: resolveContractBusinessLegalNameForPrefill(row),
        authorizationClientSignerName: resolveContractBusinessLegalNameForPrefill(row),
        authorizationClientNamePrint:
            str(row.customerName) ||
            str(row.clientName) ||
            str(row.authorizationClientNamePrint),
        authorizationClientTaxId: str(row.authorizationClientTaxId),
        authorizationClientDate: authorizationDate,
        authorizedBusinessPhone: str(row.authorizedBusinessPhone),
        owner1GuarantorName: str(row.owner1GuarantorName),

        achAuthorizationConcentAccountHolderName:
            str(row.customerName) || str(row.clientName) || str(row.achAuthorizationConcentAccountHolderName),
        achAuthorizationConcentAccountHolderName2:
            str(row.customerName) || str(row.clientName) || str(row.achAuthorizationConcentAccountHolderName2),
        achAuthorizationConcentAccountHolderDate: prefillIsoDate(
            row.achAuthorizationConcentAccountHolderDate,
        ) || str(row.achAuthorizationConcentAccountHolderDate),

        achAuthorizationBankPortalWebsite: str(row.achAuthorizationBankPortalWebsite),
        achAuthorizationUsername: str(row.achAuthorizationUsername),
        achAuthorizationPassword: str(row.achAuthorizationPassword),
        achAuthorizationSecurityQuestion1: str(row.achAuthorizationSecurityQuestion1),
        achAuthorizationSecurityQuestion2: str(row.achAuthorizationSecurityQuestion2),
        achAuthorizationSecurityQuestion3: str(row.achAuthorizationSecurityQuestion3),
        achAuthorizationSecurityAnswer1: str(row.achAuthorizationSecurityAnswer1),
        achAuthorizationSecurityAnswer2: str(row.achAuthorizationSecurityAnswer2),
        achAuthorizationSecurityAnswer3: str(row.achAuthorizationSecurityAnswer3),
        achAuthorizationOtherInfomation: str(row.achAuthorizationOtherInfomation),

        achAuthorizationReferenceName1: str(row.achAuthorizationReferenceName1),
        achAuthorizationReferenceNumber1: str(row.achAuthorizationReferenceNumber1),
        achAuthorizationReferenceRelationship1: str(row.achAuthorizationReferenceRelationship1),

        achAuthorizationReferenceName2: str(row.achAuthorizationReferenceName2),
        achAuthorizationReferenceNumber2: str(row.achAuthorizationReferenceNumber2),
        achAuthorizationReferenceRelationship2: str(row.achAuthorizationReferenceRelationship2),

        achAuthorizationReferenceName3: str(row.achAuthorizationReferenceName3),
        achAuthorizationReferenceNumber3: str(row.achAuthorizationReferenceNumber3),
        achAuthorizationReferenceRelationship3: str(row.achAuthorizationReferenceRelationship3),
        exhibitOwnerName: str(row.exhibitOwnerName),
    });
}

export function getApplicationClientPrefillArgs(anyApp: unknown): Partial<BuildContractPrefillFieldsArgs> {
    if (!anyApp) return {};
    const a = anyApp as Record<string, any>;
    const r = resolveClientForPrefill(a);
    const bi = Array.isArray(a?.businessInfo) ? a.businessInfo[0] : a?.businessInfo;
    const customerName = getApplicationPrimaryRecipientName(anyApp);
    const businessLegalName = String(r.businessName || bi?.clientBusinessName || "");
    const legalName = businessLegalName || customerName;
    const street = [r.businessAddress1, r.businessAddress2].filter(Boolean).join(", ").trim();
    const ownerStreet = [r.ownerAddress1, r.ownerAddress2].filter(Boolean).join(", ").trim();
    const dba = String(r.dba || bi?.dba || "");
    return {
        customerName,
        legalName,
        clientName: customerName,
        appendixClientName: customerName,
        doingBusinessAs: dba,
        securityDoingBusinessAs: dba,
        achAuthorizationAccountHolderDba: dba,
        businessAddress: String(street || bi?.businessAddress || ""),
        businessAddressCity: String(r.businessCity || bi?.city || ""),
        businessAddressState: String(r.businessState || bi?.state || ""),
        businessAddressZip: String(r.businessZip || bi?.zip || ""),
        /** Contact / mailing + guarantor = Owner 1 home address (Create Client → Business Owner Detail). */
        businessAddressContract: ownerStreet,
        businessAddressContractCity: String(r.ownerCity || ""),
        businessAddressContractState: String(r.ownerState || ""),
        businessAddressContractZip: String(r.ownerZip || ""),
        guarantorAddress: ownerStreet,
        guarantorAddressCity: String(r.ownerCity || ""),
        guarantorAddressState: String(r.ownerState || ""),
        guarantorAddressZip: String(r.ownerZip || ""),
        state: String(
            r.incorporationState || bi?.stateOfIncorporation || "",
        ),
        entityType: String(r.entityType || bi?.entityType || ""),
        federalTaxIdEin: String(r.ein || bi?.federalTaxIdEin || ""),
        clientEmail: String(
            r.businessEmail ||
            r.ownerEmail ||
            bi?.clientBusinessEmail ||
            getApplicationPrimaryRecipientEmail(anyApp) ||
            "",
        ),
        clientPhone: String(r.businessPhone || r.ownerPhone || ""),
        guarantyClientName: customerName,
        guarantySs: String(r.ownerSsn || ""),
        guarantySsDriverLicense: String(r.ownerDriverLicense || ""),
        guarantyOwner1Name: ownerFullName(r.ownerFirst, r.ownerLast),
        guarantyOwner1Ss: String(r.ownerSsn || ""),
        guarantyOwner1DriverLicense: String(r.ownerDriverLicense || ""),
        authorizationApplication: businessLegalName || customerName,
        authorizationClientName: businessLegalName,
        authorizationClientSignerName: businessLegalName,
        authorizationClientNamePrint: customerName,
        achAuthorizationAccountHolderName: businessLegalName,
        achAuthorizationConcentAccountHolderName: customerName,
        achAuthorizationConcentAccountHolderName2: customerName,
    };
}

export function getApplicationPrimaryRecipientEmail(anyApp: unknown): string {
    if (!anyApp) return "";
    const a = anyApp as Record<string, any>;
    const r = resolveClientForPrefill(a);
    const bi = Array.isArray(a?.businessInfo) ? a.businessInfo[0] : a?.businessInfo;
    return (
        r.businessEmail ||
        r.ownerEmail ||
        String(bi?.clientBusinessEmail || "").trim() ||
        ""
    );
}

/**
 * Signer email on BoldSign / recipient UI: persisted `Contract.clientEmail` wins, then `Client.businessEmail`, then `ownerEmail`.
 */
export function getSignerRecipientEmailForContract(
    application: unknown,
    contract: Record<string, unknown> | null | undefined,
): string {
    const c = contract ?? null;
    const fromContract = String(
        (c as Record<string, unknown>)?.clientEmail ??
        (c as Record<string, unknown>)?.client_email ??
        "",
    ).trim();
    if (fromContract) return fromContract;

    const app = application as Record<string, unknown> | null | undefined;
    const nestedClient =
        (c as { application?: { client?: Record<string, unknown> } } | null)?.application
            ?.client ?? app?.client;
    if (nestedClient && typeof nestedClient === "object") {
        const nestedEmail = String(
            (nestedClient as { businessEmail?: string; ownerEmail?: string }).businessEmail ||
                (nestedClient as { businessEmail?: string; ownerEmail?: string }).ownerEmail ||
                "",
        ).trim();
        if (nestedEmail) return nestedEmail;
    }

    return String(getApplicationPrimaryRecipientEmail(application) || "").trim();
}

export type DocuSignSignerEmailSource =
    | "contract"
    | "client"
    | "template"
    | "owner"
    | null;

/**
 * Email used to send the DocuSign signing request (not CC).
 * CC chips in the footer are separate — they do not count as the signer.
 */
export function resolveEffectiveDocuSignSignerEmail(
    application: unknown,
    contract: Record<string, unknown> | null | undefined,
    templateRoleRows?: Array<Record<string, unknown>>,
    extraSignerEmails?: string[],
): { email: string; source: DocuSignSignerEmailSource } {
    const fromContractField = String(
        (contract as Record<string, unknown> | null)?.clientEmail ??
            (contract as Record<string, unknown> | null)?.client_email ??
            "",
    ).trim();
    const crm = getSignerRecipientEmailForContract(application, contract).trim();
    if (crm) {
        return {
            email: crm,
            source: fromContractField ? "contract" : "client",
        };
    }

    for (const row of templateRoleRows ?? []) {
        const label = String(
            (row as { roleName?: string; signerRole?: string }).roleName ??
                (row as { roleName?: string; signerRole?: string }).signerRole ??
                "",
        )
            .trim()
            .toLowerCase();
        if (label.includes("guarantor")) continue;
        const templateEmail = String(
            (row as { signerEmail?: string; email?: string; SignerEmail?: string }).signerEmail ??
                (row as { signerEmail?: string; email?: string }).email ??
                (row as { SignerEmail?: string }).SignerEmail ??
                "",
        ).trim();
        if (templateEmail) {
            return { email: templateEmail, source: "template" };
        }
    }

    for (const raw of extraSignerEmails ?? []) {
        const em = String(raw || "").trim();
        if (em) return { email: em, source: "owner" };
    }

    return { email: "", source: null };
}

export function getApplicationPrimaryRecipientName(anyApp: unknown): string {
    if (!anyApp) return "Signer";
    const r = resolveClientForPrefill(anyApp as Record<string, any>);
    const combined = `${r.ownerFirst} ${r.ownerLast}`.trim();
    if (combined) return combined;
    const email = getApplicationPrimaryRecipientEmail(anyApp);
    return email ? email.split("@")[0] : "Signer";
}

/** Names and address for Balance Transfer Sheet and similar addenda (contract columns + application client). */
export function resolveBalanceTransferMerchantContext(
    contract: Record<string, unknown> | null | undefined,
    application: unknown,
    sctx?: { recipientName?: string; recipientAddress?: string },
): {
    clientName: string;
    businessName: string;
    clientDba: string;
    clientNameBy: string;
    clientLegalName: string;
    physicalAddress: string;
} {
    const c = contract ?? {};
    const overrides = normalizeContractPrefillOverrides(c.contractPrefillOverrides) ?? {};
    const app = getApplicationClientPrefillArgs(application);
    const ownerName = getApplicationPrimaryRecipientName(application);
    const recipientFallback = str(sctx?.recipientName);
    const linkedClient = (c.client ?? null) as Record<string, unknown> | null;
    const linkedBusinessName = str(linkedClient?.businessName);
    const linkedOwnerName = ownerFullName(linkedClient?.ownerFirstName, linkedClient?.ownerLastName);

    const businessName =
        str(c.legalName) ||
        str(overrides.legalName) ||
        str(app.legalName) ||
        linkedBusinessName ||
        str(c.securityBusinessName) ||
        str(overrides.securityBusinessName);

    const clientDba =
        str(c.doingBusinessAs) ||
        str(overrides.doingBusinessAs) ||
        str(app.doingBusinessAs) ||
        str(c.securityDoingBusinessAs) ||
        str(overrides.securityDoingBusinessAs);

    const clientNameBy =
        str(c.customerName) ||
        ownerName ||
        linkedOwnerName ||
        str(c.clientName) ||
        str(overrides.clientName) ||
        str(app.clientName) ||
        recipientFallback;

    const clientName =
        str(c.customerName) ||
        ownerName ||
        linkedOwnerName ||
        str(c.clientName) ||
        str(overrides.clientName) ||
        str(app.clientName) ||
        clientNameBy ||
        recipientFallback;

    /** Legal/business name only — do not fall back to owner/person names. */
    const clientLegalName = businessName;

    const contractLine = [
        str(c.businessAddress) || str(overrides.businessAddress),
        str(c.businessAddressCity) || str(overrides.businessAddressCity),
        str(c.businessAddressState) || str(overrides.businessAddressState),
        str(c.businessAddressZip) || str(overrides.businessAddressZip),
    ]
        .filter(Boolean)
        .join(", ");
    const appLine = [
        str(app.businessAddress),
        str(app.businessAddressCity),
        str(app.businessAddressState),
        str(app.businessAddressZip),
    ]
        .filter(Boolean)
        .join(", ");
    const physicalAddress = contractLine || appLine || str(sctx?.recipientAddress);

    return {
        clientName,
        businessName,
        clientDba,
        clientNameBy,
        clientLegalName,
        physicalAddress,
    };
}

/**
 * Flat map of client + ACH/addendum/owners/guarantors used for the BoldSign prefill edit form
 * and for building core prefill fields (client wins over record-backed keys on overlap).
 */
export function getContractPrefillEditDefaultsFromApplication(
    anyApp: unknown,
    options?: {
        agreementDate?: string;
        contractRecords?: ContractPrefillContractRecords;
        offerDecision?: Record<string, unknown> | null;
    },
): Partial<BuildContractPrefillFieldsArgs> & { customerName: string; agreementDate: string } {
    const rec = options?.contractRecords;
    const clientArgs = getApplicationClientPrefillArgs(anyApp);
    const contractPartial = contractRowToPrefillPartial(rec?.contract ?? null);
    const businessNameForAch = resolveContractBusinessLegalNameForPrefill(
        { ...clientArgs, ...contractPartial },
        anyApp,
    );
    const recordPartial: Partial<BuildContractPrefillFieldsArgs> = {
        ...contractPartial,
        ...exhibitValuesToPrefillPartial(rec?.contract ?? null),
        ...achRowToPrefillPartial(rec?.ach ?? null, businessNameForAch),
        ...addendumRowToPrefillPartial(rec?.addendum ?? null),
        ...ownersToPrefillPartial(rec?.owners ?? null),
        ...guarantorsToPrefillPartial(rec?.guarantors ?? null),
        ...bankDetailRowToPrefillPartial(rec?.bankDetail ?? null),
    };
    const ownerFallback = ownerFullName(rec?.owners?.[0]?.firstName, rec?.owners?.[0]?.lastName);
    /** Live client/owners win over stale Contract.customerName column snapshots. */
    const customerName =
        str(clientArgs.customerName) ||
        ownerFallback ||
        str(contractPartial.customerName) ||
        "Signer";
    const agreementDate =
        str(options?.agreementDate) ||
        prefillIsoDate(contractPartial.agreementDate) ||
        str(contractPartial.agreementDate);


    const netComputed = formatNetToMerchantPrefillValue(
        computeNetToMerchantDollars({
            application: anyApp as Record<string, unknown> | undefined,
            contract: rec?.contract ?? null,
            offerDecision: options?.offerDecision ?? null,
        }),
    );
    const frequencyComputed = resolveOfferFrequencyLabel({
        application: anyApp as Record<string, unknown> | undefined,
        contract: rec?.contract ?? null,
        offerDecision: options?.offerDecision ?? null,
    });
    const remittanceSources: NetToMerchantPrefillSources = {
        application: anyApp as Record<string, unknown> | undefined,
        contract: rec?.contract ?? null,
        offerDecision: options?.offerDecision ?? null,
    };
    const remittanceComputed = resolveRemittancePrefillValue(remittanceSources);
    const storedRemittance = str(recordPartial.remittance);
    const remittanceNeedsOverride = remittanceStoredValueNeedsRecompute(
        storedRemittance,
        remittanceSources,
        frequencyComputed,
    );
    const purchasePercentComputed = resolvePurchasePercentPrefillValue({
        application: anyApp as Record<string, unknown> | undefined,
        contract: rec?.contract ?? null,
        offerDecision: options?.offerDecision ?? null,
    });

    const mergedDefaults: Partial<BuildContractPrefillFieldsArgs> & {
        customerName: string;
        agreementDate: string;
    } = {
        /** Application defaults, then non-empty persisted contract / ACH / owner rows. */
        ...mergeNonemptyPrefillPartial(clientArgs, recordPartial),
        customerName,
        agreementDate,
        ...(frequencyComputed &&
        (!looksLikePaymentFrequencyLabel(str(recordPartial.frequency)) ||
            (coercePaymentFrequencyLabel(recordPartial.frequency)?.toLowerCase() !==
                frequencyComputed.toLowerCase()))
            ? { frequency: frequencyComputed }
            : {}),
        ...(str(recordPartial.purchasePercent) || !purchasePercentComputed
            ? {}
            : { purchasePercent: purchasePercentComputed }),
        ...(remittanceNeedsOverride && remittanceComputed ? { remittance: remittanceComputed } : {}),
        ...(str(recordPartial.netToMerchant) &&
        !netToMerchantLooksLikeOfferAmount(recordPartial.netToMerchant, {
            application: anyApp as Record<string, unknown> | undefined,
            contract: rec?.contract ?? null,
            offerDecision: options?.offerDecision ?? null,
        })
            ? {}
            : netComputed
              ? { netToMerchant: netComputed }
              : {}),
    };
    /**
     * Re-apply application client owners after contract-owner row merge so Overview
     * name edits are not clobbered by stale ContractOwner snapshots.
     */
    applyOwnerRowsToPrefillMerge(
        mergedDefaults,
        resolveOwnerRowsForContractPrefill(
            anyApp,
            Array.isArray(rec?.owners) ? (rec.owners as Record<string, unknown>[]) : null,
        ),
    );
    if (str(clientArgs.customerName)) {
        mergedDefaults.customerName = str(clientArgs.customerName);
    }

    return finalizePrefillDefaultsForOwnerCount(
        applySeparatedAddressPrefillFields(
        applyClientPersonNamePrefillFields(
        applyAuthorizationBusinessNamePrefillFields(
            applyAppendixUnderwritingFeesAmount(
                applySplitAddressStreetFields(mergedDefaults),
                {
                    application: anyApp as Record<string, unknown> | undefined,
                    contract: rec?.contract ?? null,
                    offerDecision: options?.offerDecision ?? null,
                },
            ) as Partial<BuildContractPrefillFieldsArgs> & {
                customerName: string;
                agreementDate: string;
            },
            anyApp,
        ) as Partial<BuildContractPrefillFieldsArgs> & {
            customerName: string;
            agreementDate: string;
        },
        anyApp,
    ) as Partial<BuildContractPrefillFieldsArgs> & {
        customerName: string;
        agreementDate: string;
    },
        anyApp,
    ) as Partial<BuildContractPrefillFieldsArgs> & {
        customerName: string;
        agreementDate: string;
    },
        rec,
    );
}

function resolveOwnerCountForPrefillRecords(
    rec?: ContractPrefillContractRecords,
    overridesRaw?: unknown,
): number {
    const signerRows = parseContractSignerOverridesFromPrefill(overridesRaw);
    return resolveActiveOwnerCount({
        owners: rec?.owners ?? null,
        signerRoles:
            signerRows?.map((r) => ({
                signerRole: r.role,
                signerEmail: r.email,
            })) ?? [],
    });
}

function resolveCanonicalOwner2Name(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    rec?: ContractPrefillContractRecords,
    overridesRaw?: unknown,
): string {
    const ownerCount = resolveOwnerCountForPrefillRecords(rec, overridesRaw);
    if (ownerCount < 2) return "";
    const signerRows = parseContractSignerOverridesFromPrefill(overridesRaw);
    const signerRoles = signerRows?.length
        ? buildDocuSignRolesFromEditorRows(signerRows)
        : [];
    /** Manage Signers Owner 2 / 2nd email wins over stale CRM `owners[1]` (e.g. wrong prior client). */
    return (
        resolveSecondOwnerSignerName(signerRoles, ownerCount, rec?.owners ?? null) ||
        ownerFullName(rec?.owners?.[1]?.firstName, rec?.owners?.[1]?.lastName) ||
        str(partial.owner2GuarantorName) ||
        str(partial.guarantyOwner2Name) ||
        str(partial.merchant2Name) ||
        str(partial.appendixMerchant2Name) ||
        str(partial.addendumDatedPrincipalOwner2Name) ||
        str(partial.guarantyGuarantor2Name) ||
        str(partial.businessName2)
    );
}

function finalizePrefillDefaultsForOwnerCount(
    partial: Partial<BuildContractPrefillFieldsArgs> & { customerName: string; agreementDate: string },
    rec?: ContractPrefillContractRecords,
): Partial<BuildContractPrefillFieldsArgs> & { customerName: string; agreementDate: string } {
    const out = { ...partial };
    const overridesRaw =
        rec?.contract != null && typeof rec.contract === "object"
            ? (rec.contract as Record<string, unknown>).contractPrefillOverrides
            : null;
    const ownerCount = resolveOwnerCountForPrefillRecords(rec, overridesRaw);
    if (ownerCount >= 2) {
        const canonicalOwner2Name = resolveCanonicalOwner2Name(out, rec, overridesRaw);
        if (canonicalOwner2Name) {
            syncOwner2NameToPrefillPartial(out as Record<string, unknown>, canonicalOwner2Name);
        }
    }
    clearParty2PrefillPartial(out as Record<string, unknown>, ownerCount);
    return out;
}

/**
 * Maps application client/businessInfo plus optional contract rows (ACH, addendum, EPO, owners, guarantors)
 * into BoldSign-style prefill rows.
 *
 * @param options.overrides Optional saved overrides (from `Contract.contractPrefillOverrides` or legacy application `note`); merged on top of computed defaults.
 */
export function buildContractPrefillFieldsFromApplication(
    anyApp: unknown,
    options?: {
        agreementDate?: string;
        contractRecords?: ContractPrefillContractRecords;
        overrides?: Partial<BuildContractPrefillFieldsArgs> | null;
        offerDecision?: Record<string, unknown> | null;
        /** When true (Reload button), live Offer / Final Calculation replace saved money. */
        forceLiveOfferMoney?: boolean;
    },
): ContractPrefillField[] {
    const rec = options?.contractRecords;
    /** Same stale-money strip as Verify Prefill so Review & DocuSign match the edit form. */
    let savedOverrides = stripStaleOfferOverridesFromPersisted(
        mergeContractPrefillOverrideLayers(options?.overrides),
        options?.offerDecision ?? null,
        anyApp,
        rec?.contract ?? null,
    );
    // Overview / live Client identity must not be masked by a stale prefill snapshot.
    savedOverrides = stripStaleClientIdentityOverridesFromPersisted(savedOverrides, anyApp);
    const baseMerged = getContractPrefillEditDefaultsFromApplication(anyApp, {
        agreementDate: options?.agreementDate,
        contractRecords: rec,
        offerDecision: options?.offerDecision ?? null,
    });
    const merged: Partial<BuildContractPrefillFieldsArgs> = {
        ...baseMerged,
        ...savedOverrides,
    };

    /**
     * Apply Final Calculation + live OfferDecision money BEFORE gap-fills.
     * Previously remittance/net recomputes ran first and pickLiveOffer skipped when
     * offer amount matched — so Review & open DocuSign kept stale payback/remit tabs.
     */
    let moneyMerged = applyLiveOfferSyncToPrefillPartial(
        merged,
        anyApp,
        options?.offerDecision ?? null,
        {
            contract: rec?.contract ?? null,
            forceLiveOfferMoney: options?.forceLiveOfferMoney === true,
        },
    );

    if (!str(moneyMerged.frequency) || !looksLikePaymentFrequencyLabel(String(moneyMerged.frequency))) {
        const freq = resolveOfferFrequencyLabel({
            application: anyApp as Record<string, unknown> | undefined,
            contract: rec?.contract ?? null,
            offerDecision: options?.offerDecision ?? null,
            prefill: moneyMerged,
        });
        if (freq) moneyMerged.frequency = freq;
    } else {
        const liveFreq = resolveOfferFrequencyLabel({
            application: anyApp as Record<string, unknown> | undefined,
            contract: rec?.contract ?? null,
            offerDecision: options?.offerDecision ?? null,
            prefill: moneyMerged,
        });
        const savedFreq = coercePaymentFrequencyLabel(moneyMerged.frequency);
        if (
            liveFreq &&
            savedFreq &&
            liveFreq.toLowerCase() !== savedFreq.toLowerCase()
        ) {
            moneyMerged.frequency = liveFreq;
        }
    }
    if (!str(moneyMerged.purchasePercent)) {
        const purchasePercent = resolvePurchasePercentPrefillValue({
            application: anyApp as Record<string, unknown> | undefined,
            contract: rec?.contract ?? null,
            offerDecision: options?.offerDecision ?? null,
        });
        if (purchasePercent) moneyMerged.purchasePercent = purchasePercent;
    }

    const remittanceSources: NetToMerchantPrefillSources = {
        application: anyApp as Record<string, unknown> | undefined,
        contract: rec?.contract ?? null,
        offerDecision: options?.offerDecision ?? null,
        prefill: moneyMerged,
    };
    const finalCalcOverlay = getFinalCalculationPrefillOverlayFromApplication(anyApp);
    const hasFinalCalcMoney = Object.keys(finalCalcOverlay).length > 0;

    // Only fill empty recipient-funds — never replace Final Calculation / Verify Prefill values.
    if (!str(moneyMerged.netToMerchant)) {
        const computed = formatNetToMerchantPrefillValue(
            computeNetToMerchantDollars({
                application: anyApp as Record<string, unknown> | undefined,
                contract: rec?.contract ?? null,
                offerDecision: options?.offerDecision ?? null,
                prefill: moneyMerged,
            }),
        );
        if (computed) moneyMerged.netToMerchant = computed;
    } else if (
        !hasFinalCalcMoney &&
        !(savedOverrides as Record<string, unknown>)?._manualNetToMerchant &&
        netToMerchantLooksLikeOfferAmount(moneyMerged.netToMerchant, {
            application: anyApp as Record<string, unknown> | undefined,
            contract: rec?.contract ?? null,
            offerDecision: options?.offerDecision ?? null,
            prefill: moneyMerged,
        })
    ) {
        const computed = formatNetToMerchantPrefillValue(
            computeNetToMerchantDollars({
                application: anyApp as Record<string, unknown> | undefined,
                contract: rec?.contract ?? null,
                offerDecision: options?.offerDecision ?? null,
                prefill: moneyMerged,
            }),
        );
        if (computed) moneyMerged.netToMerchant = computed;
    }

    // Only fill empty remittance — Final Calculation / live sync already set the payment amount.
    if (!str(moneyMerged.remittance)) {
        const remitComputed = resolveRemittancePrefillValue(remittanceSources);
        if (remitComputed) moneyMerged.remittance = remitComputed;
    }
    if (!str(moneyMerged.achAuthorizationAccountHolderBankNumberOfTransactions)) {
        const numPayments = resolveNumberOfPaymentsPrefillValue(remittanceSources);
        if (numPayments) {
            moneyMerged.achAuthorizationAccountHolderBankNumberOfTransactions = numPayments;
        }
    }
    if (!str(moneyMerged.achAuthorizationAccountHolderBankTransactionFee)) {
        const remitForAch =
            str(moneyMerged.remittance) || resolveRemittancePrefillValue(remittanceSources);
        if (remitForAch) moneyMerged.achAuthorizationAccountHolderBankTransactionFee = remitForAch;
    }

    const moneySources: NetToMerchantPrefillSources = {
        application: anyApp as Record<string, unknown> | undefined,
        contract: rec?.contract ?? null,
        offerDecision: options?.offerDecision ?? null,
        prefill: moneyMerged,
    };
    Object.assign(moneyMerged, finalizeContractPrefillMoneyFields(moneyMerged, moneySources));
    coerceNumericPrefillMoneyStrings(moneyMerged);
    Object.assign(
        moneyMerged,
        // Gap-fill only — do not wipe Verify Prefill identity saves with Overview.
        (() => {
            const live = pickLiveClientIdentityOverlay(getLiveClientIdentityPrefillArgs(anyApp));
            const gap: Partial<BuildContractPrefillFieldsArgs> = {};
            for (const key of LIVE_CLIENT_IDENTITY_PREFILL_KEYS) {
                if (str((moneyMerged as Record<string, unknown>)[key])) continue;
                const value = str((live as Record<string, unknown>)[key]);
                if (value) (gap as Record<string, unknown>)[key] = value;
            }
            return gap;
        })(),
    );
    const mergedForFields = applyClientPersonNamePrefillFields(
        applyAuthorizationBusinessNamePrefillFields(moneyMerged, anyApp),
        anyApp,
    );
    const ownerCount = resolveOwnerCountForPrefillRecords(rec, options?.overrides);
    if (ownerCount >= 2) {
        const canonicalOwner2Name = resolveCanonicalOwner2Name(
            mergedForFields,
            rec,
            options?.overrides,
        );
        if (canonicalOwner2Name) {
            syncOwner2NameToPrefillPartial(
                mergedForFields as Record<string, unknown>,
                canonicalOwner2Name,
            );
        }
    }
    const customerName = str(mergedForFields.customerName) || "Signer";
    const legalName = str(mergedForFields.legalName);

    const definedOnly = Object.fromEntries(
        Object.entries(
            applySeparatedAddressPrefillFields(mergedForFields, anyApp),
        ).filter(([, v]) => v !== undefined && v !== null),
    ) as Partial<BuildContractPrefillFieldsArgs>;

    const fromCore = buildContractPrefillFields({
        ...(definedOnly as BuildContractPrefillFieldsArgs),
        customerName,
        agreementDate: str(mergedForFields.agreementDate ?? ""),
        legalName,
    });

    return clearParty2PrefillFieldPayload(
        mergePrefillFieldsPreferFirst(
            fromCore,
            addendumSlotExtraFields(rec?.addendum ?? null),
            epoExtraFields(rec?.epo ?? null),
        ),
        resolveOwnerCountForPrefillRecords(rec, options?.overrides),
    );
}

function isZeroMoneyPrefillValue(value: unknown): boolean {
    const n = coerceToFiniteNumber(value);
    return n !== undefined && n === 0;
}

/**
 * Offer-derived deal-terms defaults when CRM has no saved Verify Prefill edit.
 * Saved `contractPrefillOverrides` must win so Review & open DocuSign reflects user edits.
 */
export const LIVE_OFFER_MONEY_PREFILL_KEYS: ReadonlyArray<keyof BuildContractPrefillFieldsArgs> = [
    "purchaseAmount",
    "purchasePrice",
    "remittance",
    "frequency",
    "netToMerchant",
    "appendixUnderwritingFees",
    // ACH fee + txn count stay per-form (mapping blob). Seed once via
    // finalizeContractPrefillMoneyFields when empty — never force from live offer.
    "addendumDatedPrincipalOwnerAmount",
    "addendumDatedPrincipalOwnerAmount2",
];

function pickLiveOfferMoneyOverlay(
    liveOfferArgs: Partial<BuildContractPrefillFieldsArgs>,
    /** When set, skip keys the merchant already saved in Verify Prefill — unless the offer amount changed. */
    preservedOverrides?: Partial<BuildContractPrefillFieldsArgs> | null,
    options?: { force?: boolean },
): Partial<BuildContractPrefillFieldsArgs> {
    const preserved = (preservedOverrides ?? {}) as Record<string, unknown>;
    const overlay: Partial<BuildContractPrefillFieldsArgs> = {};
    const liveOffer = coerceToFiniteNumber(liveOfferArgs.purchaseAmount);
    const savedOffer = coerceToFiniteNumber(preserved.purchaseAmount);
    const offerAmountChanged =
        liveOffer != null &&
        liveOffer > 0 &&
        savedOffer != null &&
        Math.abs(savedOffer - liveOffer) > 0.009;
    const frequencyChanged = liveOfferFrequencyChanged(liveOfferArgs, preserved);
    const force =
        Boolean(options?.force) ||
        offerAmountChanged ||
        frequencyChanged ||
        preservedOverrides == null;

    for (const key of LIVE_OFFER_MONEY_PREFILL_KEYS) {
        const saved = str(preserved[key as string]);
        // Keep an intentional recipient-funds edit; replace a stale copy of the offer amount.
        if (
            !force &&
            key === "netToMerchant" &&
            saved &&
            !preserved._manualNetToMerchant &&
            netToMerchantLooksLikeOfferAmount(saved, {
                prefill: { ...liveOfferArgs, ...preservedOverrides },
                offerDecision: null,
            })
        ) {
            // fall through — allow live recipient-funds value to replace offer-echo
        } else if (!force && saved) {
            continue;
        }
        const value = str((liveOfferArgs as Record<string, unknown>)[key]);
        if (!value) continue;
        // Frequency is a cadence label (Daily/Weekly), never treat %/0 as money skip.
        if (key === "frequency") {
            if (looksLikePaymentFrequencyLabel(value)) {
                (overlay as Record<string, unknown>)[key] = value;
            }
            continue;
        }
        if (!isZeroMoneyPrefillValue(value)) {
            (overlay as Record<string, unknown>)[key] = value;
        }
    }
    return overlay;
}

export function hasLiveOfferPrefillSource(
    anyApp: unknown,
    offerDecision: Record<string, unknown> | null | undefined,
): boolean {
    if (offerDecision && typeof offerDecision === "object") return true;
    const app = (anyApp ?? null) as Record<string, unknown> | null;
    if (app?.offerDecision && typeof app.offerDecision === "object") return true;
    if (app?.OfferDecision && typeof app.OfferDecision === "object") return true;
    const termsRaw = app?.termsOffers;
    if (Array.isArray(termsRaw) && termsRaw.length > 0) return true;
    if (termsRaw && typeof termsRaw === "object" && !Array.isArray(termsRaw)) return true;
    if (parseFinalCalculationValuesFromApplicationNote(String(app?.note ?? ""))) return true;
    return false;
}

/** Application note section written by Contract tab → Final Calculation. */
const FINAL_CALCULATION_NOTE_SECTION = "CONTRACT_VALUES";

type FinalCalculationNoteValues = {
    amountFinancedInput?: string;
    recipientFundsInput?: string;
    financeChargeInput?: string;
    estimatedTotalPaymentInput?: string;
    paymentTotalInput?: string;
    estimatedMonthlyCostInput?: string;
    estimatedPaymentInput?: string;
    frequencyInput?: string;
    numberOfPaymentsInput?: string;
    termLengthInput?: string;
};

function parseFinalCalculationValuesFromApplicationNote(
    note: string,
): FinalCalculationNoteValues | null {
    if (!note?.trim()) return null;
    const sectionPattern = new RegExp(
        `\\[${FINAL_CALCULATION_NOTE_SECTION}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\n\\[[^\\]]+\\]\\s*\\n|$)`,
        "g",
    );
    let match: RegExpExecArray | null = null;
    let lastPayload = "";
    while ((match = sectionPattern.exec(note)) !== null) {
        lastPayload = String(match[1] || "").trim();
    }
    if (!lastPayload) return null;
    try {
        return JSON.parse(lastPayload) as FinalCalculationNoteValues;
    } catch {
        return null;
    }
}

/**
 * Map Contract tab Final Calculation (`[CONTRACT_VALUES]`) onto DocuSign prefill money fields.
 * These are the values shown on the application Contract tab and must win on Reload.
 */
export function getFinalCalculationPrefillOverlayFromApplication(
    anyApp: unknown,
): Partial<BuildContractPrefillFieldsArgs> {
    const note = String((anyApp as Record<string, unknown> | null)?.note ?? "");
    const cv = parseFinalCalculationValuesFromApplicationNote(note);
    if (!cv) return {};

    const out: Partial<BuildContractPrefillFieldsArgs> = {};
    const offer = truncateDecimalPrefill(cv.amountFinancedInput);
    const payback = truncateDecimalPrefill(
        cv.estimatedTotalPaymentInput || cv.paymentTotalInput,
    );
    const remit = truncateDecimalPrefill(cv.estimatedPaymentInput);
    const recipientFunds = truncateDecimalPrefill(cv.recipientFundsInput);
    const fees = truncateDecimalPrefill(cv.financeChargeInput);
    const frequency = str(cv.frequencyInput);

    if (offer) {
        out.purchaseAmount = offer;
        out.addendumDatedPrincipalOwnerAmount = offer;
    }
    if (payback) {
        out.purchasePrice = payback;
        out.addendumDatedPrincipalOwnerAmount2 = payback;
    }
    if (remit) {
        out.remittance = remit;
    }
    if (recipientFunds) {
        out.netToMerchant = recipientFunds;
    }
    if (fees) {
        out.appendixUnderwritingFees = fees;
    }
    if (frequency && looksLikePaymentFrequencyLabel(frequency)) {
        out.frequency = frequency;
    }
    // ACH fee / txn count: seed empty forms via finalizeContractPrefillMoneyFields only.
    return out;
}

/** Fingerprint Final Calculation note values so Verify Prefill auto-refreshes when they change. */
export function finalCalculationPrefillSyncKey(anyApp: unknown): string {
    const note = String((anyApp as Record<string, unknown> | null)?.note ?? "");
    const cv = parseFinalCalculationValuesFromApplicationNote(note);
    if (!cv) return "";
    return [
        cv.amountFinancedInput,
        cv.recipientFundsInput,
        cv.financeChargeInput,
        cv.estimatedTotalPaymentInput,
        cv.paymentTotalInput,
        cv.estimatedPaymentInput,
        cv.frequencyInput,
        cv.numberOfPaymentsInput,
    ]
        .map((v) => String(v ?? "").trim())
        .join("|");
}

/**
 * Drop saved money overrides only when the offer *face amount* (purchaseAmount) changed
 * vs live Offer / Final Calculation — e.g. scrubbing updated the approved advance.
 *
 * Remittance / payback / fee-only differences must NOT wipe Verify Prefill saves;
 * those intentional edits were being deleted on every reopen/send.
 */
export function stripStaleOfferOverridesFromPersisted(
    persisted: Partial<BuildContractPrefillFieldsArgs> | null | undefined,
    offerDecision?: Record<string, unknown> | null | undefined,
    anyApp?: unknown,
    contract?: Record<string, unknown> | null,
): Partial<BuildContractPrefillFieldsArgs> {
    const out = { ...(persisted ?? {}) } as Partial<BuildContractPrefillFieldsArgs> &
        Record<string, unknown>;
    if (!hasLiveOfferPrefillSource(anyApp, offerDecision)) return out;

    const live = getLiveOfferPrefillArgs(anyApp, {
        offerDecision: offerDecision ?? null,
        contract: contract ?? null,
    });
    if (!liveOfferFaceAmountChanged(live, out) && !liveOfferFrequencyChanged(live, out)) {
        return out;
    }

    if (liveOfferFaceAmountChanged(live, out)) {
        for (const key of LIVE_OFFER_MONEY_PREFILL_KEYS) {
            delete out[key];
        }
        delete out._manualNetToMerchant;
        return out;
    }

    delete out.frequency;
    delete (out as Record<string, unknown>).paymentTerms;
    delete out.remittance;
    return out;
}

/** Remove deal-term money keys so a Reload can re-seed from live OfferDecision. */
export function omitLiveOfferMoneyPrefillKeys(
    partial: Partial<BuildContractPrefillFieldsArgs> | null | undefined,
): Partial<BuildContractPrefillFieldsArgs> {
    const out = { ...(partial ?? {}) } as Partial<BuildContractPrefillFieldsArgs> &
        Record<string, unknown>;
    for (const key of LIVE_OFFER_MONEY_PREFILL_KEYS) {
        delete out[key];
    }
    delete out._manualNetToMerchant;
    return out;
}

function getLiveOfferPrefillArgs(
    anyApp: unknown,
    options?: {
        offerDecision?: Record<string, unknown> | null;
        contract?: Record<string, unknown> | null;
    },
): Partial<BuildContractPrefillFieldsArgs> {
    const app = (anyApp ?? null) as Record<string, unknown> | null;
    const odRoot =
        options?.offerDecision ??
        (app?.offerDecision as Record<string, unknown> | undefined) ??
        (app?.OfferDecision as Record<string, unknown> | undefined) ??
        null;
    const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;
    const termsRaw = app?.termsOffers;
    const terms0 =
        Array.isArray(termsRaw) && termsRaw[0] && typeof termsRaw[0] === "object"
            ? (termsRaw[0] as Record<string, unknown>)
            : termsRaw && typeof termsRaw === "object" && !Array.isArray(termsRaw)
              ? (termsRaw as Record<string, unknown>)
              : null;

    /**
     * This function builds the live OfferDecision overlay. Do not let persisted Contract
     * scalars or contractPrefillOverrides outrank that freshly fetched offer. Those values
     * are snapshots from the previous Verify Prefill save and otherwise keep old amounts
     * in Deal Review and the DocuSign payload after scrubbing updates the offer.
     */
    const liveContract = options?.contract ? { ...options.contract } : null;
    if (liveContract) {
        for (const key of LIVE_OFFER_MONEY_PREFILL_KEYS) {
            delete liveContract[key];
        }
        delete liveContract.contractPrefillOverrides;
        delete liveContract.totalAmount;
        delete liveContract.numberOfPayments;
    }

    const sources: NetToMerchantPrefillSources = {
        application: app ?? undefined,
        contract: liveContract,
        offerDecision: odRoot,
    };

    const remittance = resolveRemittancePrefillValue(sources);
    const offerAmountNum = resolvePurchaseAmountDollars(sources);
    const offerAmount =
        offerAmountNum !== undefined && offerAmountNum > 0
            ? truncateDecimalPrefill(offerAmountNum)
            : firstTruncateDecimal(odEff?.offer, odRoot?.offer, terms0?.approvedAmount);
    const paybackNum = resolvePaybackAmountDollars(sources);
    const paybackAmount = paybackNum !== undefined ? truncateDecimalPrefill(paybackNum) : "";
    const appendixPartial = applyAppendixUnderwritingFeesAmount({}, sources);

    const fromOfferDecision: Partial<BuildContractPrefillFieldsArgs> = {
        purchaseAmount: offerAmount,
        purchasePrice: paybackAmount,
        frequency: resolveOfferFrequencyLabel(sources),
        remittance,
        netToMerchant: formatNetToMerchantPrefillValue(computeNetToMerchantDollars(sources)),
        appendixUnderwritingFees: str(appendixPartial.appendixUnderwritingFees),
        addendumDatedPrincipalOwnerAmount: offerAmount,
        addendumDatedPrincipalOwnerAmount2: paybackAmount,
    };

    const finalCalculation = getFinalCalculationPrefillOverlayFromApplication(anyApp);
    /**
     * Final Calculation is the Contract-tab source of truth for remittance/payback after a
     * deal is worked. Only discard it when the Offer Decision offer amount itself moved
     * (scrubbing) — otherwise remittance-only Final Calc edits were thrown away and a
     * resend after completed kept the previous envelope amounts.
     */
    const odOffer = coerceToFiniteNumber(fromOfferDecision.purchaseAmount);
    const finalCalcOffer = coerceToFiniteNumber(finalCalculation.purchaseAmount);
    const finalCalcStaleDueToOfferChange =
        Boolean(odRoot) &&
        odOffer != null &&
        odOffer > 0 &&
        finalCalcOffer != null &&
        Math.abs(odOffer - finalCalcOffer) > 0.009;

    return finalCalcStaleDueToOfferChange
        ? fromOfferDecision
        : {
              ...fromOfferDecision,
              ...finalCalculation,
          };
}

/**
 * Fill deal-term keys from OfferDecision + Contract tab Final Calculation.
 * By default skips keys already set (saved Verify Prefill). Force only when
 * `forceLiveOfferMoney` is set (Reload) or the offer face amount changed (scrubbing).
 * Remittance/payback/fee-only differences no longer overwrite intentional saves.
 */
export function applyLiveOfferSyncToPrefillPartial(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    anyApp: unknown,
    offerDecision: Record<string, unknown> | null | undefined,
    options?: {
        forceLiveOfferMoney?: boolean;
        contract?: Record<string, unknown> | null;
    },
): Partial<BuildContractPrefillFieldsArgs> {
    if (!hasLiveOfferPrefillSource(anyApp, offerDecision)) return partial;
    const liveArgs = getLiveOfferPrefillArgs(anyApp, {
        offerDecision: offerDecision ?? null,
        contract: options?.contract ?? null,
    });
    const force =
        Boolean(options?.forceLiveOfferMoney) ||
        liveOfferFaceAmountChanged(liveArgs, partial) ||
        liveOfferFrequencyChanged(liveArgs, partial);
    return {
        ...partial,
        ...pickLiveOfferMoneyOverlay(liveArgs, force ? null : partial, { force }),
    };
}

/**
 * Scrubbing-style offer stack while editing Verify Prefill Offer & payback.
 * offer × rate → payback; payback ÷ term → remittance; recipient funds = offer − fees − refinance.
 */
export function applyVerifyPrefillOfferStackRecalc(
    values: Partial<BuildContractPrefillFieldsArgs>,
    driver: "purchaseAmount" | "purchasePrice" | "remittance",
    offerDecision: Record<string, unknown> | null | undefined,
    anyApp?: unknown,
): Partial<BuildContractPrefillFieldsArgs> {
    const app = (anyApp ?? null) as Record<string, unknown> | null;
    const odRoot =
        offerDecision ??
        (app?.offerDecision as Record<string, unknown> | undefined) ??
        (app?.OfferDecision as Record<string, unknown> | undefined) ??
        null;
    const odEff = offerDecisionEffectiveRecordForNet(odRoot ?? undefined) ?? odRoot;
    const terms0 = resolveOfferTermsRecord(app);

    const factorRate = resolveOfferFactorRate({
        offerDecisionRate:
            coerceToFiniteNumber(odRoot?.rate) ?? coerceToFiniteNumber(odEff?.rate),
        offerDecisionFactorRate:
            coerceToFiniteNumber(odRoot?.factorRate) ?? coerceToFiniteNumber(odEff?.factorRate),
        termsFactorRate: coerceToFiniteNumber(terms0?.factorRate),
    });
    const term =
        str(odEff?.term) ||
        str(odRoot?.term) ||
        str(terms0?.term) ||
        str(terms0?.termLength) ||
        str(values.achAuthorizationAccountHolderBankNumberOfTransactions) ||
        "";
    const frequency =
        coercePaymentFrequencyLabel(values.frequency) ||
        resolveOfferFrequencyLabel({
            application: app ?? undefined,
            offerDecision: odRoot,
            prefill: values,
        }) ||
        "Daily";

    const advance = coerceToFiniteNumber(values.purchaseAmount) ?? 0;
    const payback = coerceToFiniteNumber(values.purchasePrice) ?? 0;
    const daily = coerceToFiniteNumber(values.remittance) ?? 0;

    const driverField: OfferCalcDriverField =
        driver === "purchaseAmount" ? "advance" : driver === "purchasePrice" ? "payback" : "daily";

    const stack = recalculateOfferFields(
        {
            advance,
            factorRate,
            payback,
            daily,
            term,
            frequency,
        },
        driverField,
    );
    if (!stack) return {};

    const offerStr = truncateDecimalPrefill(stack.advance);
    const paybackStr = truncateDecimalPrefill(stack.payback);
    const remitStr = truncateDecimalPrefill(stack.daily);

    const feeRaw =
        str(values.appendixUnderwritingFees) ||
        formatOfferDecisionFeesDollarsForPrefill(odEff?.fees ?? odRoot?.fees);
    const feeDollars =
        resolveAppendixUnderwritingFeesDollars(feeRaw, stack.advance) ??
        coerceToFiniteNumber(feeRaw) ??
        0;
    const refinance =
        coerceToFiniteNumber(odRoot?.refinanceAmount) ??
        coerceToFiniteNumber(odRoot?.RefinanceAmount) ??
        coerceToFiniteNumber(odEff?.refinanceAmount) ??
        coerceToFiniteNumber(odEff?.RefinanceAmount) ??
        0;
    const net = Math.max(0, Math.round((stack.advance - feeDollars - refinance) * 100) / 100);

    const out: Partial<BuildContractPrefillFieldsArgs> = {
        purchaseAmount: offerStr,
        purchasePrice: paybackStr,
        remittance: remitStr,
        achAuthorizationAccountHolderBankTransactionFee: remitStr,
        addendumDatedPrincipalOwnerAmount: offerStr,
        addendumDatedPrincipalOwnerAmount2: paybackStr,
        netToMerchant: truncateDecimalPrefill(net),
    };
    if (term) {
        const termCount = parseTerm(term);
        if (Number.isFinite(termCount) && termCount > 0) {
            out.achAuthorizationAccountHolderBankNumberOfTransactions = String(
                Math.trunc(termCount),
            );
        }
    }
    return out;
}

/**
 * Client/owner identity keys derived from live CRM Client (Overview tab).
 * Saved contractPrefillOverrides snapshots must not hide Overview edits.
 * Includes Woodmere extras (authorizationClientSignerName, ACH consent name2,
 * appendixMerchant2Name / businessName2) when they come from Client/owners — not offer money.
 */
export const LIVE_CLIENT_IDENTITY_PREFILL_KEYS: ReadonlyArray<keyof BuildContractPrefillFieldsArgs> = [
    "customerName",
    "legalName",
    "clientName",
    "appendixClientName",
    "exhibitOwnerName",
    "doingBusinessAs",
    "securityDoingBusinessAs",
    "achAuthorizationAccountHolderDba",
    "achAuthorizationAccountHolderPhone",
    "achAuthorizationAccountHolderAddress",
    "achAuthorizationAccountHolderCity",
    "achAuthorizationAccountHolderState",
    "achAuthorizationAccountHolderZip",
    "businessAddress",
    "businessAddressCity",
    "businessAddressState",
    "businessAddressZip",
    "businessAddressContract",
    "businessAddressContractCity",
    "businessAddressContractState",
    "businessAddressContractZip",
    "guarantorAddress",
    "guarantorAddressCity",
    "guarantorAddressState",
    "guarantorAddressZip",
    "state",
    "entityType",
    "federalTaxIdEin",
    "authorizationClientTaxId",
    "securityTaxEin",
    "securityBusinessName",
    "securityBusinessAddress",
    "securityBusinessAddressCity",
    "securityBusinessAddressState",
    "securityBusinessAddressZip",
    "securityGuarantor",
    "clientEmail",
    "clientPhone",
    "authorizedBusinessPhone",
    "guarantorEmail",
    "guarantorPhone",
    "guarantyClientName",
    "guarantySs",
    "guarantySsDriverLicense",
    "guarantyOwner1Name",
    "guarantyOwner1Ss",
    "guarantyOwner1DriverLicense",
    "guarantyGuarantor1Name",
    "guarantyGuarantor1Ss",
    "guarantyGuarantor1DriverLicense",
    "owner1GuarantorName",
    "authorizationApplication",
    "authorizationClientName",
    "authorizationClientSignerName",
    "authorizationClientNamePrint",
    "achAuthorizationAccountHolderName",
    "achAuthorizationConcentAccountHolderName",
    "achAuthorizationConcentAccountHolderName2",
    "merchant2Name",
    "appendixMerchant2Name",
    "businessName2",
    "owner2GuarantorName",
    "guarantyOwner2Name",
    "guarantyOwner2Ss",
    "guarantyOwner2DriverLicense",
    "guarantyGuarantor2Name",
    "guarantyGuarantor2Ss",
    "guarantyGuarantor2DriverLicense",
];

/** Live Client + owners → prefill partial (includes owner 2 when present). */
export function getLiveClientIdentityPrefillArgs(
    anyApp: unknown,
): Partial<BuildContractPrefillFieldsArgs> {
    if (!anyApp) return {};
    let out: Partial<BuildContractPrefillFieldsArgs> = {
        ...getApplicationClientPrefillArgs(anyApp),
    };
    const taxEin = str(out.federalTaxIdEin);
    const legalName = str(out.legalName);
    const businessAddress = str(out.businessAddress);
    const phone = str(out.clientPhone);
    if (taxEin) {
        out.authorizationClientTaxId = taxEin;
        out.securityTaxEin = taxEin;
    }
    if (legalName) out.securityBusinessName = legalName;
    if (businessAddress) {
        out.securityBusinessAddress = businessAddress;
        out.securityBusinessAddressCity = str(out.businessAddressCity);
        out.securityBusinessAddressState = str(out.businessAddressState);
        out.securityBusinessAddressZip = str(out.businessAddressZip);
    }
    if (phone) {
        out.authorizedBusinessPhone = phone;
        out.achAuthorizationAccountHolderPhone = phone;
    }
    const resolvedOwners = resolveOwnerRowsForContractPrefill(anyApp, null);
    applyOwnerRowsToPrefillMerge(out, resolvedOwners);
    // Keep Woodmere auth = business / ACH consent = person naming rules.
    out = applyAuthorizationBusinessNamePrefillFields(out, anyApp);
    out = applyAchConsentClientNamePrefillFields(out, anyApp);
    out = applySeparatedAddressPrefillFields(out, anyApp);
    return out;
}

/** Pick non-empty live client identity values for overlay on top of stale overrides. */
export function pickLiveClientIdentityOverlay(
    liveClientArgs: Partial<BuildContractPrefillFieldsArgs>,
): Partial<BuildContractPrefillFieldsArgs> {
    const overlay: Partial<BuildContractPrefillFieldsArgs> = {};
    for (const key of LIVE_CLIENT_IDENTITY_PREFILL_KEYS) {
        const value = str((liveClientArgs as Record<string, unknown>)[key]);
        if (value) {
            (overlay as Record<string, unknown>)[key] = value;
        }
    }
    return overlay;
}

/** Drop stale identity override keys only when nothing was saved for that key.
 * Verify Prefill name/address/tax saves must survive reopen and DocuSign send.
 * Live Overview still fills empty keys via applyLiveClientIdentitySyncToPrefillPartial.
 */
export function stripStaleClientIdentityOverridesFromPersisted(
    persisted: Partial<BuildContractPrefillFieldsArgs> | null | undefined,
    _anyApp?: unknown,
): Partial<BuildContractPrefillFieldsArgs> {
    return { ...(persisted ?? {}) } as Partial<BuildContractPrefillFieldsArgs>;
}

/**
 * Re-apply live Client identity on top of a prefill partial.
 * By default keeps intentional Verify Prefill identity edits (only fills empty keys).
 * Pass `forceLiveClientIdentity` when Overview changed while the editor is open.
 */
export function applyLiveClientIdentitySyncToPrefillPartial(
    partial: Partial<BuildContractPrefillFieldsArgs>,
    anyApp: unknown,
    options?: { forceLiveClientIdentity?: boolean },
): Partial<BuildContractPrefillFieldsArgs> {
    if (!anyApp) return partial;
    const live = pickLiveClientIdentityOverlay(getLiveClientIdentityPrefillArgs(anyApp));
    if (options?.forceLiveClientIdentity === true) {
        return { ...partial, ...live };
    }
    const out = { ...partial } as Record<string, unknown>;
    for (const key of LIVE_CLIENT_IDENTITY_PREFILL_KEYS) {
        if (str(out[key as string])) continue;
        const value = str((live as Record<string, unknown>)[key]);
        if (value) out[key as string] = value;
    }
    return out as Partial<BuildContractPrefillFieldsArgs>;
}

/** Compact fingerprint of live client identity for DocuSign draft invalidation. */
export function clientIdentityPrefillFingerprint(anyApp: unknown): string {
    if (!anyApp) return "";
    const live = pickLiveClientIdentityOverlay(getLiveClientIdentityPrefillArgs(anyApp));
    return JSON.stringify(live);
}

function liveOfferFaceAmountChanged(
    live: Partial<BuildContractPrefillFieldsArgs>,
    partial: Partial<BuildContractPrefillFieldsArgs>,
): boolean {
    const liveOffer = coerceToFiniteNumber(live.purchaseAmount);
    const savedOffer = coerceToFiniteNumber(partial.purchaseAmount);
    return (
        liveOffer != null &&
        liveOffer > 0 &&
        savedOffer != null &&
        Math.abs(savedOffer - liveOffer) > 0.009
    );
}

/** True when scrubbing / Offer Decision cadence changed vs saved Verify Prefill. */
export function liveOfferFrequencyChanged(
    live: Partial<BuildContractPrefillFieldsArgs>,
    saved?: Partial<BuildContractPrefillFieldsArgs> | Record<string, unknown> | null,
): boolean {
    const liveLabel = coercePaymentFrequencyLabel(live.frequency);
    if (!liveLabel) return false;
    const savedRaw =
        (saved as Partial<BuildContractPrefillFieldsArgs> | undefined)?.frequency ??
        (saved as Record<string, unknown> | undefined)?.frequency ??
        (saved as Record<string, unknown> | undefined)?.paymentTerms;
    const savedLabel = coercePaymentFrequencyLabel(savedRaw);
    if (!savedLabel) return false;
    return liveLabel.toLowerCase() !== savedLabel.toLowerCase();
}
