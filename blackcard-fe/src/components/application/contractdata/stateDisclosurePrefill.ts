import type { ContractPrefillField } from "./Contract";
import {
    computeNetToMerchantDollars,
    getApplicationClientPrefillArgs,
    resolveAppendixUnderwritingFeesDollars,
    resolveBalanceTransferMerchantContext,
    resolveContractBusinessLegalNameForPrefill,
} from "./Contract";
import { buildDailyCaliforniaContractPrefillFields } from "./daily_california";
import { buildCaliforniaDisclosurePage3Amounts, resolveCaliforniaEstimatedTermDays } from "./california_disclosure";
import {
    buildNewYorkDisclosurePage3Amounts,
    resolveNewYorkPage1LineAmount,
} from "./new_york_disclosure";
import {
    buildDisclosureCalculatorInputsFromSources,
    calculateDisclosureMetrics,
    mergeLiveOfferDecision,
} from "./disclosureAprCalculator";
import { buildDailyConnecticutContractPrefillFields } from "./daily_connecticut";
import { buildDailyFloridaContractPrefillFields } from "./Daily_florida";
import { buildDailyLouisianaContractPrefillFields } from "./Daily_louisiana";
import { buildDailyTexasContractPrefillFields } from "./Daily_texas";
import { buildDailyGeorgiaContractPrefillFields } from "./Daily_georgia";
import { buildDailyKansasContractPrefillFields } from "./Daily_kansas";
import { buildDailyVirginiaContractPrefillFields } from "./daily_virginia";
import { buildDailyUtahContractPrefillFields } from "./daily_utah";
import { buildDisclosureCalculatorEditorFieldDefinitions } from "./disclosureEditorFields";
import { PLATFORM_DISCLOSURE_FUNDER_NAME } from "./platformDocumentConfig";

/**
 * Unified, concept-level inputs derived from CRM contract / offer / application data.
 * Each per-state builder picks the slots it needs and maps them to its template field ids.
 *
 * All values should be pre-formatted strings (USD numbers with 2 decimals, dates as MM/DD/YYYY)
 * because individual state builders only trim/passthrough.
 */
export interface StateDisclosureContext {
    /** Total amount of financing/funding provided (Contract.purchaseAmount). */
    fundingProvided?: string;
    /** Alias used by disclosure editor for amount financed. */
    amountBusinessFund?: string;
    /** Amount actually disbursed after fees (Contract.purchaseAmount - underwriting fees). */
    fundingDisbursed?: string;
    /** Fees deducted at disbursement (Contract.appendixUnderwritingFees). */
    feesDeducted?: string;
    /** Total amount client repays (Contract.purchasePrice). */
    totalRepayment?: string;
    /** Total dollar cost of financing (totalRepayment - fundingProvided). */
    totalDollarCost?: string;
    /** Same as totalDollarCost in many state forms ("finance charge"). */
    financeCharge?: string;
    /** Per-period payment (daily / weekly remittance). */
    estimatedPayment?: string;
    /** Estimated APR percent. */
    estimatedAnnualPercentageRate?: string;
    /** Average monthly business income / revenue. */
    averageMonthlyIncome?: string;
    /** Percent that the payment may exceed of business income. */
    paymentExceededPercent?: string;
    /** Alias for payment terms / percent of business income on disclosure forms. */
    percentOfBusinessIncome?: string;
    /** Estimated term length (days/weeks/months) of the agreement. */
    estimatedTerm?: string;
    /** Estimated term in calendar/business days (California disclosure page 2). */
    estimatedTermDays?: string;
    /** Payment frequency (Daily / Weekly / …). */
    frequency?: string;
    /** Alias for payment frequency on some disclosure editor mappings. */
    paymentFrequency?: string;
    /** Estimated total number of payments. */
    estimatedNumberOfPayments?: string;
    /** Prepayment description / amount text. */
    prepayment?: string;
    /** Merchant business / legal name (never owner person name). */
    recipientName?: string;
    /** Funder / provider legal name on the disclosure. */
    funderName?: string;
    /** Selected funder street/city/state/zip (Connecticut disclosures). */
    funderAddress?: string;
    /** Selected funder phone (Connecticut disclosures). */
    funderPhone?: string;
    /** Selected funder email (Connecticut disclosures). */
    funderEmail?: string;
    /** Selected funder deal ID prefix (Connecticut / Texas disclosures). */
    dealIdPrefix?: string;
    /** Broker fee paid to broker (Utah disclosure). */
    brokerFeePaidToBroker?: string;
    /** Estimated monthly cost of financing. */
    estimatedMonthlyCost?: string;
    /** Recipient business address (single line). */
    recipientAddress?: string;
    /** Disclosure / signature date — usually the agreement date. */
    signatureDate?: string;
    /** Date by which prepayment amount must be received to qualify for discount. */
    prepaymentReceivedByDate?: string;
    /** Amount required to trigger prepayment discount. */
    prepaymentDiscountAmount?: string;
    /** Optional page 3 line amounts (default 0.00 when empty). */
    page3Line1?: string;
    page3Line2?: string;
}

type StateDisclosureBuilder = (ctx: StateDisclosureContext) => ContractPrefillField[];

function buildCaliforniaDisclosurePrefill(ctx: StateDisclosureContext): ContractPrefillField[] {
    /** Page-3 top line is offer amount (same as funding_provided / disclosure_recipient_funds). */
    const page3TopLine = ctx.fundingProvided;
    const page3 = buildCaliforniaDisclosurePage3Amounts({
        recipientFunds: page3TopLine,
        page3Line1: ctx.page3Line1,
        page3Line2: ctx.page3Line2,
        brokerFee: ctx.brokerFeePaidToBroker,
    });
    return buildDailyCaliforniaContractPrefillFields({
        fundingProvided: ctx.fundingProvided,
        estimatedAnnualPercentageRate: ctx.estimatedAnnualPercentageRate,
        estimatedPayment: ctx.estimatedPayment,
        estimatedMonthlyCost: ctx.estimatedMonthlyCost,
        paymentTotal: ctx.totalRepayment,
        estimatedTerm: resolveCaliforniaEstimatedTermDays({
            estimatedTermDays: ctx.estimatedTermDays,
            estimatedNumberOfPayments: ctx.estimatedNumberOfPayments,
            frequency: ctx.frequency,
        }),
        avarageMonthlyIncome: ctx.averageMonthlyIncome,
        payementExceededPercent: ctx.paymentExceededPercent,
        monthlyIncome: ctx.averageMonthlyIncome,
        financeCharge: ctx.financeCharge,
        funderName: ctx.funderName?.toUpperCase() ?? PLATFORM_DISCLOSURE_FUNDER_NAME.toUpperCase(),
        recipientName: ctx.recipientName?.toUpperCase(),
        recipientFunds: page3TopLine,
        brokerFee: ctx.brokerFeePaidToBroker,
        page3Line1: ctx.page3Line1,
        page3Line2: ctx.page3Line2,
        page3Subtotal: page3.page3Subtotal,
        page3Net: page3.page3Net,
        signatureDate: ctx.signatureDate,
    });
}

function buildNewYorkDisclosurePrefill(ctx: StateDisclosureContext): ContractPrefillField[] {
    const page3TopLine = ctx.fundingProvided;
    const page3 = buildCaliforniaDisclosurePage3Amounts({
        recipientFunds: page3TopLine,
        page3Line1: ctx.page3Line1,
        page3Line2: ctx.page3Line2,
        brokerFee: ctx.brokerFeePaidToBroker,
    });
    const nyLines = buildNewYorkDisclosurePage3Amounts({
        recipientFunds: page3TopLine,
        brokerFee: ctx.brokerFeePaidToBroker,
        page3Line1: ctx.page3Line1,
        page3Line2: ctx.page3Line2,
    });
    return [
        ...buildDailyCaliforniaContractPrefillFields({
            fundingProvided: ctx.fundingProvided,
            estimatedAnnualPercentageRate: ctx.estimatedAnnualPercentageRate,
            estimatedPayment: ctx.estimatedPayment,
            estimatedMonthlyCost: ctx.estimatedMonthlyCost,
            paymentTotal: ctx.totalRepayment,
            estimatedTerm: ctx.estimatedTermDays ?? "",
            avarageMonthlyIncome: ctx.averageMonthlyIncome,
            payementExceededPercent: ctx.paymentExceededPercent,
            monthlyIncome: ctx.averageMonthlyIncome,
            financeCharge: ctx.financeCharge,
            funderName: ctx.funderName?.toUpperCase() ?? PLATFORM_DISCLOSURE_FUNDER_NAME.toUpperCase(),
            recipientName: ctx.recipientName?.toUpperCase(),
            recipientFunds: page3TopLine,
            brokerFee: ctx.brokerFeePaidToBroker,
            page3Line1: nyLines.page3Line1,
            page3Line2: nyLines.page3Line2,
            page3Subtotal: page3.page3Subtotal,
            page3Net: page3.page3Net,
            signatureDate: ctx.signatureDate,
        }),
        {
            id: "disclosure_page1_line_1",
            label: "Page 1 line 1 amount",
            value: resolveNewYorkPage1LineAmount(undefined),
        },
    ];
}

const buildDailyUtah = (ctx: StateDisclosureContext) =>
    buildDailyUtahContractPrefillFields({
        purchaseAmount: ctx.fundingProvided,
        netToMerchant: ctx.fundingDisbursed,
        purchasePrice: ctx.totalRepayment,
        financeCharge: ctx.financeCharge || ctx.totalDollarCost,
        remittance: ctx.estimatedPayment,
        monthlyIncome: ctx.averageMonthlyIncome,
        appendixUnderwritingFees: ctx.brokerFeePaidToBroker ?? "0.00",
        paymentTermsPercent: ctx.paymentExceededPercent,
    });

/**
 * Dispatch key matches `BoldSignTemplate.name` (lowercased) and falls back to
 * `${frequency}_${state}` so callers can resolve from either source.
 */
const REGISTRY: Record<string, StateDisclosureBuilder> = {
    daily_california: buildCaliforniaDisclosurePrefill,

    daily_connecticut: (ctx) =>
        buildDailyConnecticutContractPrefillFields({
            totalCommericalFinancing: ctx.fundingDisbursed,
            deductedAtDisbursement: ctx.feesDeducted,
            totalAmountCommercialFinancing: ctx.fundingProvided,
            financeCharge: ctx.financeCharge,
            totalRepaymentAmount: ctx.totalRepayment,
            estimatedTimePeriodicPaymement: ctx.estimatedTermDays ?? ctx.estimatedTerm,
            disclosureBrokerFee: ctx.brokerFeePaidToBroker,
            disclosureDate: ctx.signatureDate,
            recipientName: ctx.recipientName,
            recipientAddress: ctx.recipientAddress,
            funderName: ctx.funderName,
            funderAddress: ctx.funderAddress,
            funderPhone: ctx.funderPhone,
            funderEmail: ctx.funderEmail,
            dealIdPrefix: ctx.dealIdPrefix,
            amountTriggerPrepayment: ctx.prepaymentDiscountAmount,
            dateWhichAmountReceived: ctx.prepaymentReceivedByDate,
            recipientName2: ctx.recipientName,
            disclosureDate2: ctx.signatureDate,
            recipientAddress2: ctx.recipientAddress,
            theestimatedpayment: ctx.estimatedPayment,
            paymentExceedPercent: ctx.paymentExceededPercent,
            signature1Date: ctx.signatureDate,
            signature2Date: ctx.signatureDate,
        }),

    weekly_connecticut: (ctx) =>
        buildDailyConnecticutContractPrefillFields({
            totalCommericalFinancing: ctx.fundingDisbursed,
            deductedAtDisbursement: ctx.feesDeducted,
            totalAmountCommercialFinancing: ctx.fundingProvided,
            financeCharge: ctx.financeCharge,
            totalRepaymentAmount: ctx.totalRepayment,
            estimatedTimePeriodicPaymement: ctx.estimatedTermDays ?? ctx.estimatedTerm,
            disclosureBrokerFee: ctx.brokerFeePaidToBroker,
            disclosureDate: ctx.signatureDate,
            recipientName: ctx.recipientName,
            recipientAddress: ctx.recipientAddress,
            funderName: ctx.funderName,
            funderAddress: ctx.funderAddress,
            funderPhone: ctx.funderPhone,
            funderEmail: ctx.funderEmail,
            dealIdPrefix: ctx.dealIdPrefix,
            amountTriggerPrepayment: ctx.prepaymentDiscountAmount,
            dateWhichAmountReceived: ctx.prepaymentReceivedByDate,
            recipientName2: ctx.recipientName,
            disclosureDate2: ctx.signatureDate,
            recipientAddress2: ctx.recipientAddress,
            theestimatedpayment: ctx.estimatedPayment,
            paymentExceedPercent: ctx.paymentExceededPercent,
            signature1Date: ctx.signatureDate,
            signature2Date: ctx.signatureDate,
        }),

    daily_florida: (ctx) =>
        buildDailyFloridaContractPrefillFields({
            clientName: ctx.recipientName,
            funderName: ctx.funderName,
            totalAmountBusinessFund: ctx.fundingProvided,
            totalAmountOfFundDisbursed: ctx.fundingDisbursed,
            totalAmountTobePaidToProvider: ctx.totalRepayment,
            totalDollarCost: ctx.totalDollarCost,
            estimatedPaymentAmount: ctx.estimatedPayment,
            paymentExceededPercent: ctx.paymentExceededPercent,
            percentOfBusinessIncome: ctx.paymentExceededPercent,
            paymentFallenBelowPercent: ctx.paymentExceededPercent,
            consistentWithPercent: ctx.paymentExceededPercent,
            amountRequiredToTriggerPrepaymentDiscount: ctx.prepaymentDiscountAmount,
            dateByWhichAmountMustbeReceived: ctx.prepaymentReceivedByDate,
            signatureDate: ctx.signatureDate,
        }),

    weekly_florida: (ctx) =>
        buildDailyFloridaContractPrefillFields({
            clientName: ctx.recipientName,
            funderName: ctx.funderName,
            totalAmountBusinessFund: ctx.fundingProvided,
            totalAmountOfFundDisbursed: ctx.fundingDisbursed,
            totalAmountTobePaidToProvider: ctx.totalRepayment,
            totalDollarCost: ctx.totalDollarCost,
            estimatedPaymentAmount: ctx.estimatedPayment,
            paymentExceededPercent: ctx.paymentExceededPercent,
            percentOfBusinessIncome: ctx.paymentExceededPercent,
            paymentFallenBelowPercent: ctx.paymentExceededPercent,
            consistentWithPercent: ctx.paymentExceededPercent,
            amountRequiredToTriggerPrepaymentDiscount: ctx.prepaymentDiscountAmount,
            dateByWhichAmountMustbeReceived: ctx.prepaymentReceivedByDate,
            signatureDate: ctx.signatureDate,
        }),

    /** Missouri uses the same field map / PDF tab labels as Florida. */
    daily_missouri: (ctx) =>
        buildDailyFloridaContractPrefillFields({
            clientName: ctx.recipientName,
            funderName: ctx.funderName,
            totalAmountBusinessFund: ctx.fundingProvided,
            totalAmountOfFundDisbursed: ctx.fundingDisbursed,
            totalAmountTobePaidToProvider: ctx.totalRepayment,
            totalDollarCost: ctx.totalDollarCost,
            estimatedPaymentAmount: ctx.estimatedPayment,
            paymentExceededPercent: ctx.paymentExceededPercent,
            percentOfBusinessIncome: ctx.paymentExceededPercent,
            paymentFallenBelowPercent: ctx.paymentExceededPercent,
            consistentWithPercent: ctx.paymentExceededPercent,
            amountRequiredToTriggerPrepaymentDiscount: ctx.prepaymentDiscountAmount,
            dateByWhichAmountMustbeReceived: ctx.prepaymentReceivedByDate,
            signatureDate: ctx.signatureDate,
        }),

    weekly_missouri: (ctx) =>
        buildDailyFloridaContractPrefillFields({
            clientName: ctx.recipientName,
            funderName: ctx.funderName,
            totalAmountBusinessFund: ctx.fundingProvided,
            totalAmountOfFundDisbursed: ctx.fundingDisbursed,
            totalAmountTobePaidToProvider: ctx.totalRepayment,
            totalDollarCost: ctx.totalDollarCost,
            estimatedPaymentAmount: ctx.estimatedPayment,
            paymentExceededPercent: ctx.paymentExceededPercent,
            percentOfBusinessIncome: ctx.paymentExceededPercent,
            paymentFallenBelowPercent: ctx.paymentExceededPercent,
            consistentWithPercent: ctx.paymentExceededPercent,
            amountRequiredToTriggerPrepaymentDiscount: ctx.prepaymentDiscountAmount,
            dateByWhichAmountMustbeReceived: ctx.prepaymentReceivedByDate,
            signatureDate: ctx.signatureDate,
        }),

    daily_louisiana: (ctx) =>
        buildDailyLouisianaContractPrefillFields({
            clientName: ctx.recipientName,
            funderName: ctx.funderName,
            totalAmountBusinessFund: ctx.fundingProvided,
            totalAmountOfFundDisbursed: ctx.fundingDisbursed,
            totalAmountTobePaidToProvider: ctx.totalRepayment,
            totalDollarCost: ctx.totalDollarCost,
            estimatedPaymentAmount: ctx.estimatedPayment,
            paymentExceededPercent: ctx.paymentExceededPercent,
            percentOfBusinessIncome: ctx.paymentExceededPercent,
            paymentFallenBelowPercent: ctx.paymentExceededPercent,
            consistentWithPercent: ctx.paymentExceededPercent,
            amountRequiredToTriggerPrepaymentDiscount: ctx.prepaymentDiscountAmount,
            dateByWhichAmountMustbeReceived: ctx.prepaymentReceivedByDate,
            signatureDate: ctx.signatureDate,
        }),

    weekly_louisiana: (ctx) =>
        buildDailyLouisianaContractPrefillFields({
            clientName: ctx.recipientName,
            funderName: ctx.funderName,
            totalAmountBusinessFund: ctx.fundingProvided,
            totalAmountOfFundDisbursed: ctx.fundingDisbursed,
            totalAmountTobePaidToProvider: ctx.totalRepayment,
            totalDollarCost: ctx.totalDollarCost,
            estimatedPaymentAmount: ctx.estimatedPayment,
            paymentExceededPercent: ctx.paymentExceededPercent,
            percentOfBusinessIncome: ctx.paymentExceededPercent,
            paymentFallenBelowPercent: ctx.paymentExceededPercent,
            consistentWithPercent: ctx.paymentExceededPercent,
            amountRequiredToTriggerPrepaymentDiscount: ctx.prepaymentDiscountAmount,
            dateByWhichAmountMustbeReceived: ctx.prepaymentReceivedByDate,
            signatureDate: ctx.signatureDate,
        }),

    daily_texas: (ctx) =>
        buildDailyTexasContractPrefillFields({
            clientName: ctx.recipientName,
            funderName: ctx.funderName,
            dealIdPrefix: ctx.dealIdPrefix,
            // Texas page-1 `total_amount_of_fund_disbursed` = offer face amount (PDF label).
            totalAmountBusinessFund: ctx.fundingProvided,
            totalAmountBusinessFund2: ctx.fundingDisbursed,
            totalAmountOfFundDisbursed: ctx.fundingProvided,
            totalAmountTobePaidToProvider: ctx.totalRepayment,
            totalDollarCost: ctx.totalDollarCost,
            estimatedTerm: ctx.estimatedTermDays ?? ctx.estimatedTerm,
            estimatedPaymentAmount: ctx.estimatedPayment,
            estimatedMonthlyCost: ctx.estimatedMonthlyCost,
            disclosureBrokerFee: ctx.brokerFeePaidToBroker,
            signatureDate: ctx.signatureDate,
        }),

    weekly_texas: (ctx) =>
        buildDailyTexasContractPrefillFields({
            clientName: ctx.recipientName,
            funderName: ctx.funderName,
            dealIdPrefix: ctx.dealIdPrefix,
            totalAmountBusinessFund: ctx.fundingProvided,
            totalAmountBusinessFund2: ctx.fundingDisbursed,
            totalAmountOfFundDisbursed: ctx.fundingProvided,
            totalAmountTobePaidToProvider: ctx.totalRepayment,
            totalDollarCost: ctx.totalDollarCost,
            estimatedTerm: ctx.estimatedTermDays ?? ctx.estimatedTerm,
            estimatedPaymentAmount: ctx.estimatedPayment,
            estimatedMonthlyCost: ctx.estimatedMonthlyCost,
            disclosureBrokerFee: ctx.brokerFeePaidToBroker,
            signatureDate: ctx.signatureDate,
        }),

    daily_georgia: (ctx) =>
        buildDailyGeorgiaContractPrefillFields({
            totalAmountBusinessFund: ctx.fundingProvided,
            totalAmountOfFundDisbursed: ctx.fundingDisbursed,
            totalAmountToBePaid: ctx.totalRepayment,
            totalDollarCost: ctx.totalDollarCost,
            estimatedPaymentAmount: ctx.estimatedPayment,
            exceededPercent: ctx.paymentExceededPercent,
            consistentWith: ctx.paymentExceededPercent,
            paymentsFallenBelowPercent: ctx.paymentExceededPercent,
            percentOfBusinessIncome: ctx.paymentExceededPercent,
            amountTriggerPrepayment: ctx.prepaymentDiscountAmount,
            amountReceivedByWhichDate: ctx.prepaymentReceivedByDate,
            signature1Date: ctx.signatureDate,
        }),

    weekly_georgia: (ctx) =>
        buildDailyGeorgiaContractPrefillFields({
            totalAmountBusinessFund: ctx.fundingProvided,
            totalAmountOfFundDisbursed: ctx.fundingDisbursed,
            totalAmountToBePaid: ctx.totalRepayment,
            totalDollarCost: ctx.totalDollarCost,
            estimatedPaymentAmount: ctx.estimatedPayment,
            exceededPercent: ctx.paymentExceededPercent,
            consistentWith: ctx.paymentExceededPercent,
            paymentsFallenBelowPercent: ctx.paymentExceededPercent,
            percentOfBusinessIncome: ctx.paymentExceededPercent,
            amountTriggerPrepayment: ctx.prepaymentDiscountAmount,
            amountReceivedByWhichDate: ctx.prepaymentReceivedByDate,
            signature1Date: ctx.signatureDate,
        }),

    daily_kansas: (ctx) =>
        buildDailyKansasContractPrefillFields({
            clientName: ctx.recipientName,
            funderName: ctx.funderName,
            totalAmountOfFundProvided: ctx.fundingProvided,
            totalAmountFundDisbursed: ctx.fundingDisbursed,
            totalOfPayments: ctx.totalRepayment,
            totalDollarCostOfFrinancing: ctx.totalDollarCost,
            estimatedPayment: ctx.estimatedPayment,
            exceededPayment: ctx.paymentExceededPercent,
            agreementDuration: ctx.estimatedTerm,
            paymentFallen: ctx.paymentExceededPercent,
            consistentWithBusiness: ctx.paymentExceededPercent,
            signatureDate: ctx.signatureDate,
        }),

    weekly_kansas: (ctx) =>
        buildDailyKansasContractPrefillFields({
            clientName: ctx.recipientName,
            funderName: ctx.funderName,
            totalAmountOfFundProvided: ctx.fundingProvided,
            totalAmountFundDisbursed: ctx.fundingDisbursed,
            totalOfPayments: ctx.totalRepayment,
            totalDollarCostOfFrinancing: ctx.totalDollarCost,
            estimatedPayment: ctx.estimatedPayment,
            exceededPayment: ctx.paymentExceededPercent,
            agreementDuration: ctx.estimatedTerm,
            paymentFallen: ctx.paymentExceededPercent,
            consistentWithBusiness: ctx.paymentExceededPercent,
            signatureDate: ctx.signatureDate,
        }),

    daily_new_york: buildNewYorkDisclosurePrefill,

    weekly_new_york: buildNewYorkDisclosurePrefill,

    daily_virginia: (ctx) =>
        buildDailyVirginiaContractPrefillFields({
            totalAmountSalesBasedFinancing: ctx.fundingProvided,
            feesDeducted: ctx.feesDeducted,
            disbursementAmount: ctx.fundingDisbursed,
            financeCharge: ctx.financeCharge,
            totalRepaymentAmount: ctx.totalRepayment,
            estimatedNumberOfPayement: ctx.estimatedNumberOfPayments,
            disclosureDate: ctx.signatureDate,
            disclosureName: ctx.recipientName,
            recipientAddress: ctx.recipientAddress,
            funderName: ctx.funderName,
            funderAddress: ctx.funderAddress,
            funderPhone: ctx.funderPhone,
            funderEmail: ctx.funderEmail,
            prepaymentDiscount: ctx.prepaymentDiscountAmount,
            dateOfAmountReceived: ctx.prepaymentReceivedByDate,
            signatureDate: ctx.signatureDate,
            recipientName2: ctx.recipientName,
            disclosureDate2: ctx.signatureDate,
            recipientAddress1: ctx.recipientAddress,
            exceededPayment: ctx.paymentExceededPercent,
            weeklyPayments: ctx.estimatedPayment,
            paymentExceededPercent: ctx.paymentExceededPercent,
            signatureDate2: ctx.signatureDate,
        }),

    weekly_virginia: (ctx) =>
        buildDailyVirginiaContractPrefillFields({
            totalAmountSalesBasedFinancing: ctx.fundingProvided,
            feesDeducted: ctx.feesDeducted,
            disbursementAmount: ctx.fundingDisbursed,
            financeCharge: ctx.financeCharge,
            totalRepaymentAmount: ctx.totalRepayment,
            estimatedNumberOfPayement: ctx.estimatedNumberOfPayments,
            disclosureDate: ctx.signatureDate,
            disclosureName: ctx.recipientName,
            recipientAddress: ctx.recipientAddress,
            funderName: ctx.funderName,
            funderAddress: ctx.funderAddress,
            funderPhone: ctx.funderPhone,
            funderEmail: ctx.funderEmail,
            prepaymentDiscount: ctx.prepaymentDiscountAmount,
            dateOfAmountReceived: ctx.prepaymentReceivedByDate,
            signatureDate: ctx.signatureDate,
            recipientName2: ctx.recipientName,
            disclosureDate2: ctx.signatureDate,
            recipientAddress1: ctx.recipientAddress,
            exceededPayment: ctx.paymentExceededPercent,
            weeklyPayments: ctx.estimatedPayment,
            paymentExceededPercent: ctx.paymentExceededPercent,
            signatureDate2: ctx.signatureDate,
        }),

    daily_utah: buildDailyUtah,
    weekly_utah: buildDailyUtah,

    weekly_california: buildCaliforniaDisclosurePrefill,
};

/* ----------------------------- formatting helpers ----------------------------- */

function coerceFiniteNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean" || value == null) return undefined;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "object") {
        const o = value as { toNumber?: unknown; valueOf?: unknown };
        if (typeof o.toNumber === "function") {
            const n = Number((o as { toNumber(): unknown }).toNumber());
            return Number.isFinite(n) ? n : undefined;
        }
        if (typeof o.valueOf === "function") {
            const n = Number((o as { valueOf(): unknown }).valueOf());
            if (Number.isFinite(n)) return n;
        }
    }
    const s =
        typeof value === "string"
            ? value.trim().replace(/,/g, "").replace(/^[$€£¥]\s*/, "")
            : String(value ?? "").trim();
    if (!s) return undefined;
    const parsed = Number(s);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function formatUsd(value: unknown): string {
    const n = coerceFiniteNumber(value);
    if (n === undefined) return "";
    const truncated = Math.trunc(n * 100) / 100;
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(truncated);
}

function formatPercent(value: unknown, suffix = "%"): string {
    const n = coerceFiniteNumber(value);
    if (n === undefined) return "";
    const truncated = Math.trunc(n * 100) / 100;
    return `${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(truncated)}${suffix}`;
}

function formatUsDate(value: unknown): string {
    if (value == null) return "";
    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? ""
            : new Intl.DateTimeFormat("en-US", {
                  month: "2-digit",
                  day: "2-digit",
                  year: "numeric",
                  timeZone: "UTC",
              }).format(value);
    }
    const t = String(value || "").trim();
    if (!t) return "";
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return t;
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
        return `${t.slice(5, 7)}/${t.slice(8, 10)}/${t.slice(0, 4)}`;
    }
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return t;
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).format(d);
}

function str(v: unknown): string {
    return String(v ?? "").trim();
}

/* --------------------------- context extraction --------------------------- */

/**
 * Pull state-disclosure prefill values out of the latest contract row + offer + application.
 * Returns formatted strings (USD numbers, MM/DD/YYYY dates, "x.xx%" percentages).
 */
export function buildStateDisclosurePrefillContextFromContract(args: {
    contract?: Record<string, unknown> | null;
    application?: Record<string, unknown> | null;
    /** Live offer decision — overrides stale `contract.offer` for funding / term / payments. */
    offerDecision?: Record<string, unknown> | null;
    /** Optional override for the signature/disclosure date (e.g., today). */
    agreementDate?: string;
}): StateDisclosureContext {
    const contract = (args.contract ?? {}) as Record<string, unknown>;
    const offer = mergeLiveOfferDecision(contract, args.offerDecision);

    // Prefer live mainPrefill / contract.purchaseAmount (callers must pass offer-synced
    // overrides for DocuSign). Fall back to Offer Decision when contract money is empty.
    const purchaseAmount = coerceFiniteNumber(
        contract.purchaseAmount ??
            offer?.offer ??
            offer?.approvedAmount ??
            contract.approvedAmount,
    );
    const purchasePrice = coerceFiniteNumber(
        contract.purchasePrice ??
            offer?.totalRemit ??
            offer?.paybackAmount ??
            contract.totalAmount,
    );
    const purchasePercent = coerceFiniteNumber(
        contract.purchasePercent ?? offer?.rate ?? offer?.factorRate,
    );
    const underwritingFees =
        resolveAppendixUnderwritingFeesDollars(
            contract.appendixUnderwritingFees ?? offer?.fees,
            purchaseAmount,
        ) ?? coerceFiniteNumber(contract.appendixUnderwritingFees);

    /** Per-period payment lives on the TermsOffer / OfferDecision row. */
    const periodicPayment = coerceFiniteNumber(
        offer?.paymentAmount ??
            (contract as Record<string, unknown>).paymentAmount ??
            offer?.dailyPayment ??
            offer?.weeklyPayment,
    );
    const numberOfPayments = coerceFiniteNumber(
        offer?.numberOfPayments ?? (contract as Record<string, unknown>).numberOfPayments,
    );
    const termLength = coerceFiniteNumber(
        offer?.termLength ??
            (contract as Record<string, unknown>).contractLenght ??
            (contract as Record<string, unknown>).termLength,
    );
    const percentOfGross = coerceFiniteNumber(offer?.percentOfGross);
    const frequency = String(
        offer?.frequency ?? (contract as Record<string, unknown>).remittance ?? "",
    ).trim();

    const fundingProvided = formatUsd(purchaseAmount);
    const totalRepayment = formatUsd(purchasePrice);

    // Same net as Contract "Recipient Funds": offer − fees − refinance.
    const netDollars =
        computeNetToMerchantDollars({
            contract,
            offerDecision: args.offerDecision,
            application: args.application,
        }) ??
        (purchaseAmount !== undefined && underwritingFees !== undefined
            ? Math.max(0, purchaseAmount - underwritingFees)
            : undefined);
    const fundingDisbursed = formatUsd(netDollars);
    const feesDeductedDollars =
        purchaseAmount !== undefined && netDollars !== undefined
            ? Math.max(0, purchaseAmount - netDollars)
            : underwritingFees;
    const feesDeducted = formatUsd(feesDeductedDollars);

    const totalDollarCostNum =
        purchasePrice !== undefined && purchaseAmount !== undefined
            ? Math.max(0, purchasePrice - purchaseAmount)
            : undefined;
    const totalDollarCost = formatUsd(totalDollarCostNum);

    /** Fall back to derived per-period payment when not stored explicitly. */
    let estimatedPayment = formatUsd(periodicPayment);
    if (!estimatedPayment && purchasePrice !== undefined && numberOfPayments && numberOfPayments > 0) {
        estimatedPayment = formatUsd(purchasePrice / numberOfPayments);
    }

    /** APR percentage: prefer explicit annual rate; otherwise approximate from factor rate (purchasePercent in CRM). */
    let estimatedAnnualPercentageRate = "";
    const explicitApr = coerceFiniteNumber(
        (contract as Record<string, unknown>).estimatedAnnualPercentageRate ??
            offer?.annualPercentageRate ??
            offer?.apr,
    );
    if (explicitApr !== undefined) {
        estimatedAnnualPercentageRate = formatPercent(explicitApr);
    } else if (purchasePercent !== undefined) {
        /** CRM stores `purchasePercent` as a factor (e.g. 1.49 = 149%) — display as-is for templates that show factor. */
        estimatedAnnualPercentageRate = formatPercent(purchasePercent);
    }

    const appPrefill = getApplicationClientPrefillArgs(args.application);
    const merchant = resolveBalanceTransferMerchantContext(contract, args.application);
    /** Disclosures always show merchant business/legal name — never owner/customer person name. */
    const customerName =
        resolveContractBusinessLegalNameForPrefill(contract, args.application) ||
        merchant.businessName ||
        merchant.clientLegalName ||
        str(contract.legalName) ||
        str(contract.clientLegalName) ||
        str((contract as Record<string, unknown>).client_legal_name) ||
        str(appPrefill.legalName);

    const businessAddressLine = [
        str(contract.businessAddress),
        str(contract.businessAddressCity),
        str(contract.businessAddressState),
        str(contract.businessAddressZip),
    ]
        .filter(Boolean)
        .join(", ") ||
        [
            str(appPrefill.businessAddress),
            str(appPrefill.businessAddressCity),
            str(appPrefill.businessAddressState),
            str(appPrefill.businessAddressZip),
        ]
            .filter(Boolean)
            .join(", ");

    const signatureDate =
        formatUsDate(args.agreementDate) ||
        formatUsDate(contract.agreementDate) ||
        formatUsDate(contract.contractDate);

    /** Average monthly income is sourced from the application/business analysis, not the contract row. */
    const application = (args.application ?? {}) as Record<string, unknown>;
    const averageMonthlyIncome = formatUsd(
        application.averageMonthlyIncome ??
            application.averageMonthlyDeposit ??
            (application as Record<string, unknown>).avgMonthlyDeposit ??
            "",
    );

    let estimatedTermDays = "";
    let estimatedMonthlyCost = "";
    let averageMonthlyIncomeFromCalculator = "";
    let estimatedPaymentFromCalculator = "";
    let paymentExceededPercentFromCalculator = "";
    let estimatedAnnualPercentageRateFromCalculator = "";
    try {
        const calcInputs = buildDisclosureCalculatorInputsFromSources({
            contract: args.contract ?? null,
            application: args.application ?? null,
            offerDecision: args.offerDecision ?? offer,
            state: String(
                contract.state ??
                    (contract as Record<string, unknown>).businessAddressState ??
                    "",
            ),
        });
        const metrics = calculateDisclosureMetrics(calcInputs);
        if (metrics.estimatedTermDays > 0) {
            estimatedTermDays = String(metrics.estimatedTermDays);
        }
        if (metrics.estimatedMonthlyCost > 0) {
            estimatedMonthlyCost = formatUsd(metrics.estimatedMonthlyCost);
        }
        if (metrics.estimatedMerchantAverageMonthlyRevenue > 0) {
            averageMonthlyIncomeFromCalculator = formatUsd(
                metrics.estimatedMerchantAverageMonthlyRevenue,
            );
        }
        if (metrics.estimatedPayment > 0) {
            estimatedPaymentFromCalculator = formatUsd(metrics.estimatedPayment);
        }
        if (metrics.percentOfDailyIncomePurchased > 0) {
            paymentExceededPercentFromCalculator = formatPercent(
                metrics.percentOfDailyIncomePurchased,
            );
        }
        if (metrics.estimatedAnnualPercentageRate > 0) {
            estimatedAnnualPercentageRateFromCalculator = formatPercent(
                metrics.estimatedAnnualPercentageRate,
            );
        }
    } catch {
        estimatedTermDays = "";
    }

    const resolvedAverageMonthlyIncome =
        averageMonthlyIncomeFromCalculator || averageMonthlyIncome;
    const resolvedEstimatedPayment = estimatedPayment || estimatedPaymentFromCalculator;
    const resolvedPaymentExceededPercent =
        paymentExceededPercentFromCalculator ||
        (percentOfGross !== undefined ? formatPercent(percentOfGross) : "");
    const resolvedEstimatedApr =
        estimatedAnnualPercentageRateFromCalculator || estimatedAnnualPercentageRate;

    return {
        fundingProvided,
        fundingDisbursed,
        feesDeducted,
        totalRepayment,
        totalDollarCost,
        financeCharge: totalDollarCost,
        estimatedPayment: resolvedEstimatedPayment,
        estimatedAnnualPercentageRate: resolvedEstimatedApr,
        paymentExceededPercent: resolvedPaymentExceededPercent,
        averageMonthlyIncome: resolvedAverageMonthlyIncome,
        estimatedTerm: termLength !== undefined ? String(Math.trunc(termLength)) : "",
        estimatedTermDays,
        frequency,
        estimatedNumberOfPayments:
            numberOfPayments !== undefined ? String(Math.trunc(numberOfPayments)) : "",
        prepayment: "",
        recipientName: customerName,
        funderName:
            str(contract.funderName) ||
            str((contract as Record<string, unknown>).funder_name) ||
            PLATFORM_DISCLOSURE_FUNDER_NAME,
        funderAddress: str((contract as Record<string, unknown>).funderAddress),
        funderPhone: str((contract as Record<string, unknown>).funderPhone),
        funderEmail: str((contract as Record<string, unknown>).funderEmail),
        dealIdPrefix: str((contract as Record<string, unknown>).dealIdPrefix),
        recipientAddress: businessAddressLine,
        signatureDate,
        prepaymentReceivedByDate: signatureDate,
        prepaymentDiscountAmount: "",
        brokerFeePaidToBroker: "0.00",
        estimatedMonthlyCost,
    };
}

/* ------------------------------ dispatch API ------------------------------ */

function normalizeKey(value: string | null | undefined): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

const US_STATE_ABBR_TO_KEY: Record<string, string> = {
    ca: "california",
    fl: "florida",
    mo: "missouri",
    ga: "georgia",
    ks: "kansas",
    ut: "utah",
    va: "virginia",
    ct: "connecticut",
    ny: "new_york",
    la: "louisiana",
    tx: "texas",
};

function normalizeStateKey(value: string | null | undefined): string {
    const key = normalizeKey(value);
    if (!key) return "";
    if (US_STATE_ABBR_TO_KEY[key]) return US_STATE_ABBR_TO_KEY[key];
    return key;
}

function normalizeFrequencyKey(value: string | null | undefined): string {
    const key = normalizeKey(value);
    if (!key) return "";
    if (key.startsWith("week")) return "weekly";
    if (key.startsWith("day")) return "daily";
    return key;
}

/** Resolve registry key from template name and/or CRM state + frequency. */
export function resolveStateDisclosureRegistryKey(
    name?: string | null,
    state?: string | null,
    frequency?: string | null,
): string | null {
    const nameKey = normalizeKey(name);
    if (nameKey && REGISTRY[nameKey]) return nameKey;

    const stateKey = normalizeStateKey(state);
    const freqKey = normalizeFrequencyKey(frequency);
    if (stateKey && freqKey) {
        const composite = `${freqKey}_${stateKey}`;
        if (REGISTRY[composite]) return composite;
    }

    if (nameKey && stateKey) {
        for (const registryKey of Object.keys(REGISTRY)) {
            if (!registryKey.includes(stateKey)) continue;
            if (freqKey && !registryKey.startsWith(`${freqKey}_`)) continue;
            return registryKey;
        }
    }

    return null;
}

export function hasStateDisclosurePrefillRegistry(
    name?: string | null,
    state?: string | null,
    frequency?: string | null,
): boolean {
    return resolveStateDisclosureRegistryKey(name, state, frequency) != null;
}

/**
 * Canonical disclosure editor rows (empty values) when a state disclosure template applies.
 * Used by the template-mapping prefill editor before CRM values are merged in.
 */
export function getStateDisclosureEditorFieldDefinitions(
    name?: string | null,
    state?: string | null,
    frequency?: string | null,
): ContractPrefillField[] {
    if (!resolveStateDisclosureRegistryKey(name, state, frequency)) {
        return [];
    }
    return buildDisclosureCalculatorEditorFieldDefinitions();
}

/** Resolve per-state prefill rows by `BoldSignTemplate.name` (e.g., "daily_kansas"). */
export function getStateDisclosurePrefillFieldsByName(
    name: string | null | undefined,
    context: StateDisclosureContext,
): ContractPrefillField[] {
    const key = resolveStateDisclosureRegistryKey(name, null, null) ?? normalizeKey(name);
    if (!key) return [];
    const builder = REGISTRY[key];
    return builder ? builder(context) : [];
}

/** Resolve per-state prefill rows by `frequency` + `state` (DB lowercase columns). */
export function getStateDisclosurePrefillFieldsByStateFrequency(args: {
    state?: string | null;
    frequency?: string | null;
    context: StateDisclosureContext;
}): ContractPrefillField[] {
    const state = normalizeKey(args.state);
    const frequency = normalizeKey(args.frequency);
    if (!state || !frequency) return [];
    return getStateDisclosurePrefillFieldsByName(`${frequency}_${state}`, args.context);
}

/**
 * Compute prefill rows for every BoldSignTemplate row that has a registered builder.
 * Dispatches by `name` first; falls back to `frequency_state`. Deduplicates by id
 * so the same field id from two templates only gets one (last) value.
 */
export function getStateDisclosurePrefillFieldsForTemplates(args: {
    templates: Array<{ name?: string | null; state?: string | null; frequency?: string | null }>;
    context: StateDisclosureContext;
}): ContractPrefillField[] {
    const collected = new Map<string, ContractPrefillField>();
    for (const tpl of args.templates ?? []) {
        const rows = (() => {
            const byName = getStateDisclosurePrefillFieldsByName(tpl?.name, args.context);
            if (byName.length > 0) return byName;
            return getStateDisclosurePrefillFieldsByStateFrequency({
                state: tpl?.state,
                frequency: tpl?.frequency,
                context: args.context,
            });
        })();
        for (const row of rows) {
            if (!row?.id) continue;
            const value = String(row.value ?? "").trim();
            if (!value) continue;
            collected.set(row.id, { id: row.id, label: row.label, value });
        }
    }
    return Array.from(collected.values());
}
