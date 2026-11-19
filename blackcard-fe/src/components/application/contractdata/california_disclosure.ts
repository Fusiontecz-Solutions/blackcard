import type { ContractPrefillField } from "./Contract";
import { formatEditorAmountFieldForDisplay } from "./prefillFieldDisplay";
import { PLATFORM_DISCLOSURE_FUNDER_NAME } from "./platformDocumentConfig";

/** BoldSign merge `roles[].formFields` row (camelCase; server normalizes to PascalCase). */
export type CaliforniaDisclosureMergeRoleFormField = {
    id: string;
    name?: string;
    fieldType: string;
    pageNumber: number;
    bounds: { x: number; y: number; width: number; height: number };
    value?: string;
    roleIndex?: number;
};

const textField = (
    id: string,
    pageNumber: number,
    x: number,
    y: number,
    width = 120,
): CaliforniaDisclosureMergeRoleFormField => ({
    id,
    name: id,
    fieldType: "TextBox",
    pageNumber,
    bounds: { x, y, width, height: 22 },
});

const signatureField = (
    id: string,
    pageNumber: number,
    x: number,
    y: number,
): CaliforniaDisclosureMergeRoleFormField => ({
    id,
    name: id,
    fieldType: "Signature",
    pageNumber,
    bounds: { x, y, width: 200, height: 34 },
});

const dateField = (
    id: string,
    pageNumber: number,
    x: number,
    y: number,
): CaliforniaDisclosureMergeRoleFormField => ({
    id,
    name: id,
    fieldType: "TextBox",
    pageNumber,
    bounds: { x, y, width: 120, height: 22 },
});

/** California daily disclosure PDF field coordinates. */
export const californiaDisclosureMergeRoleFormFields: CaliforniaDisclosureMergeRoleFormField[] =
    [
        textField("funding_provided", 1, 183, 99),
        textField("funding_provided", 1, 345, 139),
        textField("estimated_annual_percentage_rate", 1, 178, 236),
        textField("avarage_monthly_income", 1, 330, 316),
        textField("disclosure_merchant_name", 1, 383, 301, 160),
        textField("funder_name", 1, 433, 376, 160),
        textField("finance_charge", 1, 182, 421),
        textField("payment_total", 1, 184, 441),
        textField("estimated_monthly_cost", 1, 182, 477),
        textField("funder_name", 1, 348, 489, 160),
        textField("estimated_payment", 1, 182, 538),
        textField("funder_name", 1, 174, 555, 160),
        textField("payement_exceeded_percent", 1, 426, 620),
        textField("client_name", 1, 180, 635),
        textField("monthly_income", 1, 360, 648),
        textField("payement_exceeded_percent", 1, 405, 677),
        textField("estimated_term", 2, 198, 69),
        textField("disclosure_merchant_name", 2, 361, 82, 140),
        textField("avarage_monthly_income", 2, 454, 110),
        textField("finance_charge", 2, 355, 159),
        signatureField("Signature1", 2, 92, 260),
        dateField("signature_date", 2, 90, 336),
        signatureField("Signature2", 2, 429, 259),
        dateField("signature_date_owner2", 2, 434, 335),
        textField("disclosure_recipient_funds", 3, 446, 88),
        textField("disclosure_page3_line_1", 3, 446, 109),
        textField("disclosure_page3_line_2", 3, 446, 142),
        textField("disclosure_page3_subtotal", 3, 448, 164),
        textField("disclosure_broker_fee", 3, 448, 183),
        textField("disclosure_page3_net", 3, 447, 206),
    ];

/** California weekly disclosure PDF field coordinates (distinct from daily). */
export const weeklyCaliforniaDisclosureMergeRoleFormFields: CaliforniaDisclosureMergeRoleFormField[] =
    [
        textField("funding_provided", 1, 183, 99),
        textField("funding_provided", 1, 345, 139),
        textField("funder_name", 1, 415, 96, 160),
        textField("estimated_annual_percentage_rate", 1, 178, 236),
        textField("avarage_monthly_income", 1, 330, 316),
        textField("disclosure_merchant_name", 1, 383, 301, 160),
        textField("funder_name", 1, 433, 376, 160),
        textField("finance_charge", 1, 183, 408),
        textField("payment_total", 1, 183, 429),
        textField("estimated_monthly_cost", 1, 184, 462),
        textField("funder_name", 1, 349, 476, 160),
        textField("estimated_payment", 1, 183, 525),
        textField("funder_name", 1, 240, 541, 160),
        textField("payement_exceeded_percent", 1, 425, 605),
        textField("client_name", 1, 180, 620),
        textField("monthly_income", 1, 361, 633),
        textField("payement_exceeded_percent", 1, 405, 664),
        textField("estimated_term", 2, 198, 69),
        textField("disclosure_merchant_name", 2, 361, 82, 140),
        textField("avarage_monthly_income", 2, 454, 110),
        textField("finance_charge", 2, 355, 159),
        signatureField("Signature1", 2, 92, 260),
        dateField("signature_date", 2, 90, 336),
        signatureField("Signature2", 2, 429, 259),
        dateField("signature_date_owner2", 2, 434, 335),
        textField("disclosure_recipient_funds", 3, 434, 88),
        textField("disclosure_page3_line_1", 3, 434, 109),
        textField("disclosure_page3_line_2", 3, 434, 142),
        textField("disclosure_page3_subtotal", 3, 434, 164),
        textField("disclosure_broker_fee", 3, 434, 183),
        textField("disclosure_page3_net", 3, 434, 206),
    ];

export function californiaDisclosureMergeRoleFormFieldsForRole(
    roleIndex: number,
): Array<CaliforniaDisclosureMergeRoleFormField & { roleIndex: number }> {
    return californiaDisclosureMergeRoleFormFields.map((field) => ({
        ...field,
        roleIndex,
    }));
}

export function weeklyCaliforniaDisclosureMergeRoleFormFieldsForRole(
    roleIndex: number,
): Array<CaliforniaDisclosureMergeRoleFormField & { roleIndex: number }> {
    return weeklyCaliforniaDisclosureMergeRoleFormFields.map((field) => ({
        ...field,
        roleIndex,
    }));
}

export interface CaliforniaDisclosureContractPrefillFields {
    fundingProvided?: string;
    estimatedAnnualPercentageRate?: string;
    estimatedPayment?: string;
    estimatedMonthlyCost?: string;
    paymentTotal?: string;
    estimatedTerm?: string;
    avarageMonthlyIncome?: string;
    payementExceededPercent?: string;
    monthlyIncome?: string;
    financeCharge?: string;
    funderName?: string;
    recipientName?: string;
    recipientFunds?: string;
    brokerFee?: string;
    page3Line1?: string;
    page3Line2?: string;
    page3Subtotal?: string;
    page3Net?: string;
    signatureDate?: string;
}

const FIELD_IDS = {
    fundingProvided: ["funding_provided"],
    estimatedAnnualPercentageRate: ["estimated_annual_percentage_rate"],
    estimatedPayment: ["estimated_payment"],
    estimatedMonthlyCost: ["estimated_monthly_cost"],
    paymentTotal: ["payment_total"],
    estimatedTerm: ["estimated_term", "disclosure_term_days"],
    avarageMonthlyIncome: ["avarage_monthly_income"],
    payementExceededPercent: ["payement_exceeded_percent"],
    monthlyIncome: ["monthly_income"],
    financeCharge: ["finance_charge"],
    funderName: ["funder_name"],
    recipientName: ["disclosure_pdf__client_name", "disclosure_merchant_name"],
    recipientFunds: ["disclosure_recipient_funds"],
    brokerFee: ["disclosure_broker_fee"],
    page3Line1: ["disclosure_page3_line_1"],
    page3Line2: ["disclosure_page3_line_2"],
    page3Subtotal: ["disclosure_page3_subtotal"],
    page3Net: ["disclosure_page3_net"],
    signatureDate: ["signature_date"],
} as const;

const mapIds = (ids: readonly string[], label: string, value: string): ContractPrefillField[] => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return [];
    return ids.map((id) => ({ id, label, value: formatEditorAmountFieldForDisplay(id, trimmed) }));
};

export function buildCaliforniaDisclosureContractPrefillFields({
    fundingProvided = "",
    estimatedAnnualPercentageRate = "",
    estimatedPayment = "",
    estimatedMonthlyCost = "",
    paymentTotal = "",
    estimatedTerm = "",
    avarageMonthlyIncome = "",
    payementExceededPercent = "",
    monthlyIncome = "",
    financeCharge = "",
    funderName = PLATFORM_DISCLOSURE_FUNDER_NAME.toUpperCase(),
    recipientName = "",
    recipientFunds = "",
    brokerFee = "",
    page3Line1 = "",
    page3Line2 = "",
    page3Subtotal = "",
    page3Net = "",
    signatureDate = "",
}: CaliforniaDisclosureContractPrefillFields = {}): ContractPrefillField[] {
    return [
        ...mapIds(FIELD_IDS.fundingProvided, "Funding Provided", fundingProvided),
        ...mapIds(
            FIELD_IDS.estimatedAnnualPercentageRate,
            "Estimated Annual Percentage Rate",
            estimatedAnnualPercentageRate,
        ),
        ...mapIds(FIELD_IDS.estimatedPayment, "Estimated Payment", estimatedPayment),
        ...mapIds(FIELD_IDS.estimatedMonthlyCost, "Estimated Monthly Cost", estimatedMonthlyCost),
        ...mapIds(FIELD_IDS.paymentTotal, "Payment Total", paymentTotal),
        ...mapIds(FIELD_IDS.estimatedTerm, "Estimated Term", estimatedTerm),
        ...mapIds(FIELD_IDS.avarageMonthlyIncome, "Average Monthly Income", avarageMonthlyIncome),
        ...mapIds(
            FIELD_IDS.payementExceededPercent,
            "Payment Exceeded Percent",
            payementExceededPercent,
        ),
        ...mapIds(FIELD_IDS.monthlyIncome, "Monthly Income", monthlyIncome),
        ...mapIds(FIELD_IDS.financeCharge, "Finance Charge", financeCharge),
        ...mapIds(FIELD_IDS.funderName, "Funder Name", funderName),
        ...mapIds(FIELD_IDS.recipientName, "Business name", recipientName),
        ...mapIds(FIELD_IDS.recipientFunds, "Recipient Funds", recipientFunds),
        ...mapIds(FIELD_IDS.brokerFee, "Broker Fee", brokerFee),
        ...mapIds(FIELD_IDS.page3Line1, "Page 3 Line 1", page3Line1),
        ...mapIds(FIELD_IDS.page3Line2, "Page 3 Line 2", page3Line2),
        ...mapIds(FIELD_IDS.page3Subtotal, "Page 3 Subtotal", page3Subtotal),
        ...mapIds(FIELD_IDS.page3Net, "Page 3 Net", page3Net),
        ...mapIds(FIELD_IDS.signatureDate, "Signature Date", signatureDate),
    ];
}

function parseMoney(value: string | undefined): number {
    const n = Number.parseFloat(String(value ?? "").replace(/[$,%\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

function formatUsdAmount(amount: number): string {
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Math.round(amount * 100) / 100);
}

const BUSINESS_DAYS_PER_WEEK = 5;

/** California page-2 estimated term must be payment days, not term weeks. */
export function resolveCaliforniaEstimatedTermDays(args: {
    estimatedTermDays?: string;
    estimatedNumberOfPayments?: string;
    frequency?: string | null;
}): string {
    const fromDays = String(args.estimatedTermDays ?? "").trim();
    if (fromDays) return fromDays;

    const count = Number.parseInt(String(args.estimatedNumberOfPayments ?? "").trim(), 10);
    const frequency = String(args.frequency ?? "")
        .trim()
        .toLowerCase();
    if (count > 0 && frequency.startsWith("week") && !frequency.includes("bi")) {
        return String(count * BUSINESS_DAYS_PER_WEEK);
    }
    if (count > 0 && frequency.startsWith("day")) {
        return String(count);
    }
    return "";
}

/**
 * California / NY-style page 3 amounts:
 *   subtotal = recipient_funds (offer line) + line_1 + line_2
 *   net      = subtotal − broker_fee
 */
export function buildCaliforniaDisclosurePage3Amounts(args: {
    recipientFunds?: string;
    page3Line1?: string;
    page3Line2?: string;
    brokerFee?: string;
}): { page3Subtotal: string; page3Net: string } {
    const recipient = parseMoney(args.recipientFunds);
    const line1 = parseMoney(args.page3Line1);
    const line2 = parseMoney(args.page3Line2);
    const broker = parseMoney(args.brokerFee);
    const subtotal = recipient + line1 + line2;
    const net = Math.max(0, subtotal - broker);
    return {
        page3Subtotal: formatUsdAmount(subtotal),
        page3Net: formatUsdAmount(net),
    };
}

export function isCaliforniaDisclosureState(state: string | null | undefined): boolean {
    const key = String(state ?? "")
        .trim()
        .toLowerCase();
    return key === "california" || key === "ca";
}
