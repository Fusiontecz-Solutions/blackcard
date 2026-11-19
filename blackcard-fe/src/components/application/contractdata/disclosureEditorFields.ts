import type { ContractPrefillField } from "./Contract";
import type {
    DisclosureCalculatorInputs,
    DisclosureCalculatorResult,
} from "./disclosureAprCalculator";
import {
    formatDisclosurePercent,
    formatDisclosureUsd,
    formatDisclosureUsDate,
} from "./disclosureAprCalculator";
import {
    isUtahDisclosureState,
    mapUtahDisclosureCalculatorToPdfFields,
} from "./daily_utah";
import { buildNewYorkDisclosurePage3Amounts } from "./new_york_disclosure";
import { isTexasDisclosureState } from "./texas_disclosure";
import { isVirginiaDisclosureState } from "./virginia_disclosure";
import { buildCaliforniaDisclosurePage3Amounts } from "./california_disclosure";
import { PLATFORM_DISCLOSURE_FUNDER_NAME } from "./platformDocumentConfig";
import type { StateDisclosureContext } from "./stateDisclosurePrefill";

/**
 * Canonical disclosure fields for Edit Prefilled Values — aligned with the
 * disclosure calculator (one input per value). PDF / DocuSign tab labels are
 * expanded at envelope build time via `expandDisclosureEditorValuesToPdfFields`.
 */
export const DISCLOSURE_EDITOR_FIELD_CATALOG: ReadonlyArray<{ id: string; label: string }> = [
    {
        id: "disclosure_avg_monthly_revenue",
        label: "Estimated merchant average monthly revenue",
    },
    { id: "disclosure_amount_financed", label: "Amount financed" },
    /**
     * CA/NY page-3 top line = offer / funding provided (not net after fees).
     * Do not alias this onto fund-disbursed PDF tabs.
     */
    { id: "disclosure_recipient_funds", label: "Recipient funds (page 3 / offer)" },
    /**
     * Fund disbursed / net to merchant = offer − fees (FL/GA/MO/KS/TX/etc.).
     */
    { id: "disclosure_funding_disbursed", label: "Fund disbursed (offer − fees)" },
    { id: "disclosure_apr", label: "Estimated annual percentage rate (APR)" },
    { id: "disclosure_finance_charge", label: "Finance charge" },
    { id: "disclosure_total_payment", label: "Estimated total payment amount" },
    { id: "disclosure_estimated_payment", label: "Estimated payment" },
    { id: "disclosure_monthly_cost", label: "Estimated monthly cost" },
    {
        id: "disclosure_payment_terms",
        label: "Payment terms (% of merchant daily income purchased)",
    },
    { id: "disclosure_term_days", label: "Estimated term (days)" },
    { id: "disclosure_broker_fee", label: "Broker fee (paid to broker)" },
    { id: "disclosure_page3_line_1", label: "Page 3 line 1 amount" },
    { id: "disclosure_page3_line_2", label: "Page 3 line 2 amount" },
    { id: "disclosure_page3_subtotal", label: "Page 3 subtotal" },
    { id: "disclosure_page3_net", label: "Page 3 net amount" },
    { id: "client_name", label: "Business name" },
    { id: "funder_name", label: "Funder / provider name" },
    { id: "funder_address", label: "Funder address" },
    { id: "funder_phone", label: "Funder phone" },
    { id: "funder_email", label: "Funder email" },
    { id: "deal_id_prefix", label: "Deal ID prefix" },
    { id: "disclosure_date", label: "Disclosure date" },
];

/** PDF / legacy prefill field ids written for each canonical editor field. */
const EDITOR_TO_PDF_FIELD_IDS: Record<string, readonly string[]> = {
    disclosure_avg_monthly_revenue: [
        "disclosure_avg_monthly_revenue",
        "monthly_income",
        "avarage_monthly_income",
        "etimated_average_income",
    ],
    disclosure_amount_financed: [
        "disclosure_amount_financed",
        // funding_provided is forced from purchase_amount (offer) in the envelope expander —
        // do not alias amount-financed-after-fees onto it.
        // Connecticut total_amount_commercial_financing = offer / purchase amount (forced in expand).
        "amountFinanced",
    ],
    // Florida `total_amount_business_fund` = purchase/offer — independent of amount financed.
    disclosure_purchase_price: [
        // Sole PDF/data label — FL/GA total_amount_business_fund (offer). Not aliased to other tabs.
        "total_amount_business_fund",
        // Connecticut page-1 face amount (also forced from offer in expand).
        "total_amount_commercial_financing",
        // Kansas § 9(b)(1) — total amount of funds provided.
        "total_amount_of_fund_provided",
    ],
    disclosure_recipient_funds: [
        // CA/NY page-3 top line only — never FL/GA fund-disbursed tabs.
        "disclosure_recipient_funds",
    ],
    /** Offer − fees (and refinance when present). Independent of page-3 offer line. */
    disclosure_funding_disbursed: [
        "disclosure_funding_disbursed",
        "total_amount_of_fund_disbursed",
        "total_amount_fund_disbursed",
        // Texas second business-fund blank is net disbursed, not offer.
        "total_amount_business_fund_2",
        // Do NOT alias onto main RPA `net_to_merchant` (Final Calculation owns that).
    ],
    /** Connecticut / Virginia page-1 fees deducted from amount financed. */
    disclosure_fees_deducted: [
        "disclosure_fees_deducted",
        "deducted_at_disbursement",
        "fees_deducted",
        "disclosure_origination_fee",
    ],
    disclosure_apr: ["disclosure_apr", "estimated_annual_percentage_rate"],
    disclosure_finance_charge: [
        "disclosure_finance_charge",
        "total_dollar_cost",
        "finance_charge",
        "financeCharge",
        "total_dollar_cost_of_frinancing",
    ],
    disclosure_total_payment: [
        "disclosure_total_payment",
        "total_amount_tobe_paid_to_provider",
        "total_amount_to_be_paid",
        "amount_required_to_trigger_prepayment_discount",
        "total_repayment_amount",
        // Connecticut total_commerical_financing = amount financed (forced in expand), not payback.
        "total_of_payments",
        // Do NOT alias onto main RPA `purchase_price` / payback — disclosure calculator
        // was overwriting Final Calculation values on Review & open DocuSign.
        "estimatedTotalPaymentAmount",
        "payment_total",
    ],
    disclosure_estimated_payment: [
        "disclosure_estimated_payment",
        "estimated_payment_amount",
        "estimated_payment",
        "daily_payment",
        // Do NOT alias onto main RPA `remittance`.
        "estimatedPayment",
    ],
    disclosure_monthly_cost: ["disclosure_monthly_cost", "estimated_monthly_cost"],
    disclosure_payment_terms: [
        "disclosure_payment_terms",
        "percent_of_business_income",
        "payment_exceeded_percent",
        "payment_fallen_below_percent",
        "consistent_with_percent",
        "estimated_percent",
        "payement_exceeded_percent",
        "exceeded_percent",
        "consistent_with",
        "payments_fallen_below_percent",
        "exceeded_payment",
        "payment_fallen",
        "consistent_with_business",
        "payment_exceeded",
        "out_estimated_percent",
        // Utah disclosure % tabs — never use bare `frequency` / `paymentTerms`
        // (those IDs are Daily/Weekly cadence on the main contract).
        "payment_terms_percent",
        "payment_exceed_percent",
    ],
    disclosure_term_days: ["disclosure_term_days", "estimated_term", "estimated_number_of_payement", "estimated_time_periodic_paymement"],
    disclosure_broker_fee: ["disclosure_broker_fee", "appendix_underwriting_fees"],
    disclosure_page3_line_1: ["disclosure_page3_line_1"],
    disclosure_page3_line_2: ["disclosure_page3_line_2"],
    disclosure_page3_subtotal: ["disclosure_page3_subtotal"],
    disclosure_page3_net: ["disclosure_page3_net"],
    // Never include shared RPA `client_name` — that tab is owner/person name on the
    // main contract (e.g. client_name__p2_p87). Disclosure merchant slots only.
    // `disclosure_pdf__*` mirrors backend layout-prefill-scope so FL/KS/GA tabs
    // labeled `client_name` still get business name for every funder (incl. Woodmere).
    client_name: [
        "recipient_name",
        "recipient_name2",
        "disclosure_name",
        "disclosure_merchant_name",
        "business_name",
        "disclosure_pdf__client_name",
        "disclosure_pdf__disclosure_merchant_name",
        "disclosure_pdf__disclosure_name",
        "disclosure_pdf__recipient_name",
        "disclosure_pdf__recipient_name2",
        "disclosure_pdf__business_name",
        // Envelope Data Labels for all state disclosures / funders.
        "disclosure_client_name",
        "disclosure_recipient_name",
        "disclosure_recipient_name2",
        "disclosure_disclosure_name",
        "disclosure_disclosure_merchant_name",
        "disclosure_business_name",
        ...Array.from({ length: 40 }, (_, i) => `disclosure_client_name_${i + 1}`),
        ...Array.from({ length: 40 }, (_, i) => `client_name_${i + 1}`),
        ...Array.from({ length: 20 }, (_, i) => `disclosure_recipient_name_${i + 1}`),
        ...Array.from({ length: 20 }, (_, i) => `disclosure_merchant_name_${i + 1}`),
        ...Array.from({ length: 20 }, (_, i) => `disclosure_name_${i + 1}`),
    ],
    funder_name: ["funder_name"],
    funder_address: ["funder_address"],
    funder_phone: ["funder_phone"],
    funder_email: ["funder_email"],
    deal_id_prefix: ["deal_id_prefix"],
    disclosure_date: [
        "disclosure_date",
        "agreement_date",
        "disclosure_date2",
        "Signature_date",
        "signature_date",
        "signature1_date",
    ],
};

const PDF_TO_EDITOR_FIELD_ID = (() => {
    const map = new Map<string, string>();
    for (const [editorId, pdfIds] of Object.entries(EDITOR_TO_PDF_FIELD_IDS)) {
        for (const pdfId of pdfIds) {
            if (!map.has(pdfId)) map.set(pdfId, editorId);
        }
    }
    return map;
})();

export function buildDisclosureCalculatorEditorFieldDefinitions(): ContractPrefillField[] {
    return DISCLOSURE_EDITOR_FIELD_CATALOG.map((field) => ({
        id: field.id,
        label: field.label,
        value: "",
    }));
}

function parseDisclosurePrefillMoney(value: unknown): number | undefined {
    const raw = String(value ?? "").trim();
    if (!raw) return undefined;
    const n = Number.parseFloat(raw.replace(/[$,%\s]/g, ""));
    return Number.isFinite(n) ? n : undefined;
}

/** Collapse legacy PDF-key blobs into canonical editor keys for the form UI. */
export function collapsePdfFieldsToDisclosureEditorValues(
    saved: Record<string, string> | null | undefined,
): Record<string, string> {
    const raw = saved ?? {};
    const out: Record<string, string> = {};

    // Canonical calculator / editor keys always win over legacy PDF tab ids.
    for (const field of DISCLOSURE_EDITOR_FIELD_CATALOG) {
        const v = String(raw[field.id] ?? "").trim();
        if (v) out[field.id] = v;
    }

    for (const [key, value] of Object.entries(raw)) {
        const v = String(value ?? "").trim();
        if (!v) continue;
        const editorId = PDF_TO_EDITOR_FIELD_ID.get(key) ?? key;
        // Utah broker fee: never let legacy `appendix_underwriting_fees` (origination) clobber explicit broker fee.
        if (
            editorId === "disclosure_broker_fee" &&
            key === "appendix_underwriting_fees" &&
            Object.prototype.hasOwnProperty.call(raw, "disclosure_broker_fee")
        ) {
            continue;
        }
        const existing = out[editorId];
        if (!existing) {
            out[editorId] = v;
            continue;
        }
        // Prefer a non-zero amount over a stale "0.00" on a duplicate PDF alias key.
        const existingNum = parseDisclosurePrefillMoney(existing);
        const incomingNum = parseDisclosurePrefillMoney(v);
        if (
            existingNum === 0 &&
            incomingNum !== undefined &&
            incomingNum > 0
        ) {
            out[editorId] = v;
        }
    }

    if (!out.funder_name) {
        out.funder_name = PLATFORM_DISCLOSURE_FUNDER_NAME.toUpperCase();
    }

    return out;
}


/** Connecticut page-1: purchase price / fee / amount financed. */
function applyConnecticutPage1AmountFields(
    editorValues: Record<string, string>,
    out: Record<string, string>,
): void {
    const hasSeparatePurchase = Boolean(
        String(editorValues.funding_provided ?? "").trim() ||
            String(editorValues.disclosure_purchase_price ?? "").trim(),
    );
    const purchase = String(
        editorValues.funding_provided ??
            editorValues.disclosure_purchase_price ??
            out.funding_provided ??
            out.purchase_amount ??
            "",
    ).trim();
    const amountFinancedRaw = String(editorValues.disclosure_amount_financed ?? "").trim();
    const recipientRaw = String(
        editorValues.disclosure_funding_disbursed ??
            editorValues.disclosure_recipient_funds ??
            out.disclosure_funding_disbursed ??
            out.disclosure_recipient_funds ??
            "",
    ).trim();
    let fees = String(
        editorValues.disclosure_fees_deducted ??
            out.deducted_at_disbursement ??
            out.fees_deducted ??
            "",
    ).trim();

    const purchaseFinal = purchase || (!hasSeparatePurchase ? amountFinancedRaw : "");
    const purchaseN = parseDisclosurePrefillMoney(purchaseFinal);
    const amountN = parseDisclosurePrefillMoney(amountFinancedRaw);
    const recipientN = parseDisclosurePrefillMoney(recipientRaw);
    let feesN = parseDisclosurePrefillMoney(fees);

    if (
        !fees &&
        purchaseN !== undefined &&
        amountN !== undefined &&
        amountN < purchaseN - 0.009
    ) {
        fees = formatDisclosureUsd(Math.max(0, purchaseN - amountN));
        feesN = parseDisclosurePrefillMoney(fees);
    }

    let amountFinanced = "";
    if (purchaseN !== undefined && amountN !== undefined && amountN < purchaseN - 0.009) {
        amountFinanced = formatDisclosureUsd(amountN);
    } else if (
        purchaseN !== undefined &&
        recipientN !== undefined &&
        recipientN < purchaseN - 0.009
    ) {
        amountFinanced = formatDisclosureUsd(recipientN);
    } else if (purchaseN !== undefined && feesN !== undefined) {
        amountFinanced = formatDisclosureUsd(Math.max(0, purchaseN - feesN));
    } else if (hasSeparatePurchase && amountN !== undefined) {
        amountFinanced = formatDisclosureUsd(amountN);
    } else if (recipientN !== undefined) {
        amountFinanced = formatDisclosureUsd(recipientN);
    } else if (amountN !== undefined && feesN !== undefined) {
        amountFinanced = formatDisclosureUsd(Math.max(0, amountN - feesN));
    }

    if (purchaseFinal) {
        out.total_amount_commercial_financing = purchaseFinal;
        out.disclosure_total_amount_commercial_financing = purchaseFinal;
        out.total_amount_business_fund = purchaseFinal;
        out.disclosure_purchase_price = purchaseFinal;
        for (let i = 1; i <= 40; i += 1) {
            out[`total_amount_commercial_financing_${i}`] = purchaseFinal;
            out[`disclosure_total_amount_commercial_financing_${i}`] = purchaseFinal;
        }
    }
    if (fees) {
        out.deducted_at_disbursement = fees;
        if (!String(out.fees_deducted ?? "").trim()) out.fees_deducted = fees;
    }
    if (amountFinanced) out.total_commerical_financing = amountFinanced;
}

/** Expand canonical editor values to every PDF tab label needed for DocuSign. */
export function expandDisclosureEditorValuesToPdfFields(
    editorValues: Record<string, string>,
    options?: { disclosureState?: string | null },
): Record<string, string> {
    const out: Record<string, string> = {};

    for (const [editorId, rawValue] of Object.entries(editorValues)) {
        const value = String(rawValue ?? "").trim();
        if (!value) continue;
        const texas = isTexasDisclosureState(options?.disclosureState);
        const pdfIds = (EDITOR_TO_PDF_FIELD_IDS[editorId] ?? [editorId]).filter((pdfId) => {
            if (texas && editorId === "disclosure_funding_disbursed") {
                return (
                    pdfId !== "total_amount_of_fund_disbursed" &&
                    pdfId !== "total_amount_fund_disbursed"
                );
            }
            return true;
        });
        for (const pdfId of pdfIds) {
            out[pdfId] = value;
        }
    }

    out.funder_name = String(
        editorValues.funder_name || PLATFORM_DISCLOSURE_FUNDER_NAME,
    )
        .trim()
        .toUpperCase();
    const merchant = String(editorValues.client_name ?? "").trim();
    if (merchant) {
        for (const pdfId of EDITOR_TO_PDF_FIELD_IDS.client_name ?? []) {
            out[pdfId] = merchant;
        }
    }
    // Legacy saved blobs may still contain bare client_name — never leak it onto the RPA.
    // State disclosure PDFs (FL/KS/…) use tab label `client_name` for merchant business
    // name; those resolve via disclosure_pdf__client_name + backend business-name helpers.
    delete out.client_name;

    // Offer / purchase amount for "Funding Provided" + CT commercial financing —
    // never net-after-fees or payback. Prefer purchase/offer slots.
    // State layouts uniquify duplicate tabs as funding_provided_1 / funding_provided_2.
    const fundingProvided = String(
        editorValues.funding_provided ??
            editorValues.disclosure_purchase_price ??
            editorValues.purchase_amount ??
            editorValues.disclosure_amount_financed ??
            "",
    ).trim();
    if (fundingProvided) {
        out.funding_provided = fundingProvided;
        out.funding_provided_1 = fundingProvided;
        out.funding_provided_2 = fundingProvided;
        out.disclosure_funding_provided = fundingProvided;
        out.disclosure_funding_provided_1 = fundingProvided;
        out.disclosure_funding_provided_2 = fundingProvided;
        out.disclosure_pdf__funding_provided = fundingProvided;
        out.disclosure_pdf__funding_provided_1 = fundingProvided;
        out.disclosure_pdf__funding_provided_2 = fundingProvided;
        // Connecticut / Florida offer face amount (not payback).
        out.total_amount_commercial_financing = fundingProvided;
        out.disclosure_total_amount_commercial_financing = fundingProvided;
        out.total_amount_business_fund = fundingProvided;
        out.disclosure_purchase_price = fundingProvided;
        out.total_amount_of_fund_provided = fundingProvided;
        for (let i = 1; i <= 40; i += 1) {
            out[`total_amount_commercial_financing_${i}`] = fundingProvided;
            out[`disclosure_total_amount_commercial_financing_${i}`] = fundingProvided;
            out[`total_amount_of_fund_provided_${i}`] = fundingProvided;
            out[`disclosure_total_amount_of_fund_provided_${i}`] = fundingProvided;
            // Texas `total_amount_business_fund_2` is net disbursed — skip here.
            if (i === 2) continue;
            out[`total_amount_business_fund_${i}`] = fundingProvided;
        }
    }

    // Connecticut / Virginia page-1 "fees deducted" = amount financed − fund disbursed
    // when not already set explicitly (editor may omit this derived slot).
    const explicitFees = String(editorValues.disclosure_fees_deducted ?? "").trim();
    const financed = parseDisclosurePrefillMoney(
        editorValues.disclosure_amount_financed ?? out.disclosure_amount_financed,
    );
    const recipient = parseDisclosurePrefillMoney(
        editorValues.disclosure_funding_disbursed ?? out.disclosure_funding_disbursed,
    );
    const derivedFees =
        explicitFees ||
        (financed !== undefined && recipient !== undefined
            ? formatDisclosureUsd(Math.max(0, financed - recipient))
            : "");
    if (derivedFees) {
        for (const pdfId of EDITOR_TO_PDF_FIELD_IDS.disclosure_fees_deducted ?? []) {
            if (!String(out[pdfId] ?? "").trim()) out[pdfId] = derivedFees;
        }
    }

    applyConnecticutPage1AmountFields(editorValues, out);

    // Fund disbursed = offer − fees (never the CA page-3 offer line). After fees so
    // derived / CT fees can feed the net when editor omitted disclosure_funding_disbursed.
    const fundingDisbursed = String(
        editorValues.disclosure_funding_disbursed ??
            editorValues.total_amount_of_fund_disbursed ??
            editorValues.total_amount_fund_disbursed ??
            "",
    ).trim();
    let disbursedFinal = fundingDisbursed;
    const offerN = parseDisclosurePrefillMoney(fundingProvided);
    const feesN = parseDisclosurePrefillMoney(
        editorValues.disclosure_fees_deducted ??
            out.deducted_at_disbursement ??
            out.fees_deducted ??
            out.disclosure_fees_deducted ??
            editorValues.appendix_underwriting_fees,
    );
    const disbursedN = parseDisclosurePrefillMoney(disbursedFinal);
    if (
        offerN !== undefined &&
        feesN !== undefined &&
        feesN > 0 &&
        (disbursedN === undefined || Math.abs(disbursedN - offerN) < 0.01)
    ) {
        disbursedFinal = formatDisclosureUsd(Math.max(0, offerN - feesN));
    } else if (!disbursedFinal && offerN !== undefined && feesN !== undefined) {
        disbursedFinal = formatDisclosureUsd(Math.max(0, offerN - feesN));
    }
    if (disbursedFinal) {
        const texas = isTexasDisclosureState(options?.disclosureState);
        const virginia = isVirginiaDisclosureState(options?.disclosureState);
        for (const pdfId of EDITOR_TO_PDF_FIELD_IDS.disclosure_funding_disbursed ?? []) {
            if (
                texas &&
                (pdfId === "total_amount_of_fund_disbursed" || pdfId === "total_amount_fund_disbursed")
            ) {
                continue;
            }
            if (virginia && pdfId === "disbursement_amount") {
                continue;
            }
            out[pdfId] = disbursedFinal;
        }
        for (let i = 1; i <= 40; i += 1) {
            if (!texas) {
                out[`total_amount_of_fund_disbursed_${i}`] = disbursedFinal;
                out[`disclosure_total_amount_of_fund_disbursed_${i}`] = disbursedFinal;
                out[`total_amount_fund_disbursed_${i}`] = disbursedFinal;
                out[`disclosure_total_amount_fund_disbursed_${i}`] = disbursedFinal;
            }
            out[`total_amount_business_fund_2_${i}`] = disbursedFinal;
            out[`disclosure_total_amount_business_fund_2_${i}`] = disbursedFinal;
        }
        out.total_amount_business_fund_2 = disbursedFinal;
        out.disclosure_total_amount_business_fund_2 = disbursedFinal;
    }

    // CA / NY page 3: subtotal = recipient + line1 + line2; net = subtotal − broker fee.
    const page3Top = parseDisclosurePrefillMoney(
        editorValues.disclosure_recipient_funds ?? out.disclosure_recipient_funds,
    );
    const page3Line1 = parseDisclosurePrefillMoney(
        editorValues.disclosure_page3_line_1 ?? out.disclosure_page3_line_1,
    );
    const page3Line2 = parseDisclosurePrefillMoney(
        editorValues.disclosure_page3_line_2 ?? out.disclosure_page3_line_2,
    );
    const brokerRaw = String(editorValues.disclosure_broker_fee ?? "").trim();
    const page3Broker = brokerRaw
        ? parseDisclosurePrefillMoney(brokerRaw)
        : parseDisclosurePrefillMoney(editorValues.appendix_underwriting_fees);
    if (page3Top !== undefined) {
        const subtotal = page3Top + (page3Line1 ?? 0) + (page3Line2 ?? 0);
        const net = Math.max(0, subtotal - (page3Broker ?? 0));
        const subtotalStr = formatDisclosureUsd(subtotal);
        const netStr = formatDisclosureUsd(net);
        out.disclosure_page3_subtotal = subtotalStr;
        out.disclosure_page3_net = netStr;
        for (const key of Object.keys(out)) {
            if (/^disclosure_page3_subtotal_\d+$/i.test(key)) {
                out[key] = subtotalStr;
            } else if (/^disclosure_page3_net_\d+$/i.test(key)) {
                out[key] = netStr;
            }
        }
    }

    // Texas page-1 `total_amount_of_fund_disbursed` = offer (not net like KS/LA).
    if (isTexasDisclosureState(options?.disclosureState)) {
        const texasOffer =
            String(
                editorValues.funding_provided ??
                    editorValues.disclosure_purchase_price ??
                    editorValues.purchase_amount ??
                    out.funding_provided ??
                    out.total_amount_business_fund ??
                    "",
            ).trim() || fundingProvided;
        if (texasOffer) {
            const texasOfferSlots = [
                "total_amount_of_fund_disbursed",
                "total_amount_fund_disbursed",
            ] as const;
            for (const slot of texasOfferSlots) {
                out[slot] = texasOffer;
                out[`disclosure_${slot}`] = texasOffer;
                out[`disclosure_pdf__${slot}`] = texasOffer;
                for (let i = 1; i <= 40; i += 1) {
                    out[`${slot}_${i}`] = texasOffer;
                    out[`disclosure_${slot}_${i}`] = texasOffer;
                    out[`disclosure_pdf__${slot}_${i}`] = texasOffer;
                }
            }
        }
    }

    // Virginia: sales-based financing = offer; disbursement amount = offer − fees.
    if (isVirginiaDisclosureState(options?.disclosureState)) {
        const virginiaOffer =
            String(
                editorValues.funding_provided ??
                    editorValues.disclosure_purchase_price ??
                    editorValues.purchase_amount ??
                    out.funding_provided ??
                    "",
            ).trim() || fundingProvided;
        if (virginiaOffer) {
            const offerSlots = ["total_amount_sales_based_financing"] as const;
            for (const slot of offerSlots) {
                out[slot] = virginiaOffer;
                out[`disclosure_${slot}`] = virginiaOffer;
                out[`disclosure_pdf__${slot}`] = virginiaOffer;
                for (let i = 1; i <= 40; i += 1) {
                    out[`${slot}_${i}`] = virginiaOffer;
                    out[`disclosure_${slot}_${i}`] = virginiaOffer;
                    out[`disclosure_pdf__${slot}_${i}`] = virginiaOffer;
                }
            }
        }
            let virginiaNet = disbursedFinal;
            if (!virginiaNet) {
                const netFromEditor = parseDisclosurePrefillMoney(
                    editorValues.disclosure_funding_disbursed ?? "",
                );
                if (netFromEditor !== undefined) {
                    virginiaNet = formatDisclosureUsd(netFromEditor);
                } else if (offerN !== undefined && feesN !== undefined) {
                    virginiaNet = formatDisclosureUsd(Math.max(0, offerN - feesN));
                }
            }
        if (virginiaNet) {
            const netSlots = ["disbursement_amount"] as const;
            for (const slot of netSlots) {
                out[slot] = virginiaNet;
                out[`disclosure_${slot}`] = virginiaNet;
                out[`disclosure_pdf__${slot}`] = virginiaNet;
                for (let i = 1; i <= 40; i += 1) {
                    out[`${slot}_${i}`] = virginiaNet;
                    out[`disclosure_${slot}_${i}`] = virginiaNet;
                    out[`disclosure_pdf__${slot}_${i}`] = virginiaNet;
                }
            }
        }
    }

    return out;
}

export function buildDisclosureEditorFieldsFromContext(
    ctx: StateDisclosureContext,
): ContractPrefillField[] {
    const disclosureDate = formatDisclosureUsDate(ctx.signatureDate) || "";
    const page3TopLine = ctx.fundingProvided || "";
    const page3 = buildCaliforniaDisclosurePage3Amounts({
        recipientFunds: page3TopLine,
        page3Line1: ctx.page3Line1,
        page3Line2: ctx.page3Line2,
        brokerFee: ctx.brokerFeePaidToBroker,
    });
    const nyLines = buildNewYorkDisclosurePage3Amounts({
        recipientFunds: page3TopLine,
        page3Line1: ctx.page3Line1,
        page3Line2: ctx.page3Line2,
        brokerFee: ctx.brokerFeePaidToBroker,
    });

    const values: Record<string, string> = {
        disclosure_avg_monthly_revenue: ctx.averageMonthlyIncome ?? "",
        disclosure_amount_financed: ctx.amountBusinessFund || ctx.fundingProvided || "",
        /** Same offer amount as funding_provided (CA page-3 top line uses this id). */
        disclosure_recipient_funds: page3TopLine,
        /** Offer − fees for FL/GA/MO/KS/TX fund-disbursed tabs. */
        disclosure_funding_disbursed: ctx.fundingDisbursed || "",
        funding_provided: ctx.fundingProvided || "",
        disclosure_purchase_price: ctx.fundingProvided || ctx.amountBusinessFund || "",
        disclosure_fees_deducted: ctx.feesDeducted || "",
        disclosure_apr: ctx.estimatedAnnualPercentageRate ?? "",
        disclosure_finance_charge: ctx.financeCharge || ctx.totalDollarCost || "",
        disclosure_total_payment: ctx.totalRepayment ?? "",
        disclosure_estimated_payment: ctx.estimatedPayment ?? "",
        disclosure_monthly_cost: ctx.estimatedMonthlyCost ?? "",
        disclosure_payment_terms: ctx.percentOfBusinessIncome || ctx.paymentExceededPercent || "",
        disclosure_term_days: ctx.estimatedTermDays ?? ctx.estimatedTerm ?? "",
        disclosure_broker_fee: ctx.brokerFeePaidToBroker ?? "0.00",
        disclosure_page3_line_1: nyLines.page3Line1,
        disclosure_page3_line_2: nyLines.page3Line2,
        disclosure_page3_subtotal: page3.page3Subtotal,
        disclosure_page3_net: page3.page3Net,
        client_name: String(ctx.recipientName ?? "").trim().toUpperCase(),
        funder_name: String(ctx.funderName ?? PLATFORM_DISCLOSURE_FUNDER_NAME)
            .trim()
            .toUpperCase(),
        funder_address: String(ctx.funderAddress ?? "").trim(),
        funder_phone: String(ctx.funderPhone ?? "").trim(),
        funder_email: String(ctx.funderEmail ?? "").trim(),
        deal_id_prefix: String(ctx.dealIdPrefix ?? "").trim(),
        disclosure_date: disclosureDate,
    };

    return DISCLOSURE_EDITOR_FIELD_CATALOG.map((field) => ({
        id: field.id,
        label: field.label,
        value: values[field.id] ?? "",
    }));
}

export function mapDisclosureMetricsToEditorFieldOverrides(
    metrics: DisclosureCalculatorResult,
    options?: {
        merchantName?: string;
        signatureDate?: string;
        state?: string | null;
        inputs?: Pick<
            DisclosureCalculatorInputs,
            | "purchasePrice"
            | "frequency"
            | "brokerFeePaidByFunder"
            | "brokerFeePaidByMerchant"
            | "state"
        >;
    },
): Record<string, string> {
    const merchant = String(options?.merchantName ?? "")
        .trim()
        .toUpperCase();
    const disclosureDate = formatDisclosureUsDate(options?.signatureDate ?? "");
    const isUtah = isUtahDisclosureState(options?.state ?? options?.inputs?.state);
    const fundsProvided =
        options?.inputs?.purchasePrice != null && options.inputs.purchasePrice > 0
            ? options.inputs.purchasePrice
            : metrics.amountFinanced;

    const amountFinancedForFees = isUtah ? fundsProvided : metrics.amountFinanced;
    const offerAmount =
        options?.inputs?.purchasePrice != null && options.inputs.purchasePrice > 0
            ? options.inputs.purchasePrice
            : metrics.purchasePrice;
    const editorFields: Record<string, string> = {
        disclosure_purchase_price: formatDisclosureUsd(offerAmount),
        disclosure_avg_monthly_revenue: formatDisclosureUsd(
            metrics.estimatedMerchantAverageMonthlyRevenue,
        ),
        disclosure_amount_financed: formatDisclosureUsd(amountFinancedForFees),
        /** Offer / amount financed on the deal — never recipient funds. */
        funding_provided: formatDisclosureUsd(offerAmount),
        /** Offer amount — CA page-3 `disclosure_recipient_funds` tab uses this id. */
        disclosure_recipient_funds: formatDisclosureUsd(offerAmount),
        /** Net after fees — FL/GA/etc. fund-disbursed tabs. */
        disclosure_funding_disbursed: formatDisclosureUsd(metrics.recipientFunds),
        disclosure_fees_deducted: formatDisclosureUsd(
            Math.max(0, amountFinancedForFees - metrics.recipientFunds),
        ),
        disclosure_apr: formatDisclosurePercent(metrics.estimatedAnnualPercentageRate),
        disclosure_finance_charge: formatDisclosureUsd(metrics.financeCharge),
        disclosure_total_payment: formatDisclosureUsd(metrics.estimatedTotalPayment),
        disclosure_estimated_payment: formatDisclosureUsd(metrics.estimatedPayment),
        disclosure_monthly_cost: formatDisclosureUsd(metrics.estimatedMonthlyCost),
        disclosure_payment_terms: formatDisclosurePercent(metrics.percentOfDailyIncomePurchased),
        disclosure_term_days: String(metrics.estimatedTermDays),
        disclosure_broker_fee: formatDisclosureUsd(
            (options?.inputs?.brokerFeePaidByFunder ?? 0) +
                (options?.inputs?.brokerFeePaidByMerchant ?? 0),
        ),
        ...(merchant ? { client_name: merchant } : {}),
        funder_name: PLATFORM_DISCLOSURE_FUNDER_NAME.toUpperCase(),
        ...(disclosureDate ? { disclosure_date: disclosureDate } : {}),
    };

    if (isUtah && options?.inputs) {
        return {
            ...editorFields,
            ...mapUtahDisclosureCalculatorToPdfFields(metrics, options.inputs),
        };
    }

    return editorFields;
}
