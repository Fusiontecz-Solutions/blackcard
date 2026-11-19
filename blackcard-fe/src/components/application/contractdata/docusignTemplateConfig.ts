import { APP_COMPANY_NAME } from "@/constants/appBranding";
import { formatUSD } from "@/utils/formatCurrency";

/** Default signer role on Woodmere DocuSign templates (must match template role name exactly). */
export const DOCUSIGN_DEFAULT_SIGNER_ROLE = "Signer";

/** Primary signer role when the template defines multiple roles but only one should receive the envelope. */
export const DOCUSIGN_PRIMARY_SIGNER_ROLE = String(
    (typeof import.meta !== "undefined" &&
        (import.meta.env?.VITE_DOCUSIGN_SIGNER_ROLE ||
            import.meta.env?.VITE_DOCUSIGN_PRIMARY_SIGNER_ROLE ||
            import.meta.env?.VITE_DOCUSIGN_DEFAULT_ROLE_NAME ||
            import.meta.env?.VITE_DOCUSIGN_DEFAULT_SIGNER_ROLE)) ||
        DOCUSIGN_DEFAULT_SIGNER_ROLE,
).trim();

/** DocuSign template GUID — must exist in the connected DocuSign account (demo vs prod). */
export const DEFAULT_DOCUSIGN_TEMPLATE_ID = String(
    (typeof import.meta !== "undefined" &&
        (import.meta.env?.VITE_DOCUSIGN_TEMPLATE_ID ||
            import.meta.env?.VITE_BOLDSIGN_TEMPLATE_ID)) ||
        "",
).trim();

/** Lender prefix for contract / ACH envelope email subjects and PDF names. */
export const CONTRACT_ENVELOPE_LENDER_NAME = String(
    (typeof import.meta !== "undefined" &&
        import.meta.env?.VITE_DOCUSIGN_EMAIL_LENDER_NAME) ||
        APP_COMPANY_NAME,
).trim();

export function toEnvelopeSubjectUppercase(value: string | null | undefined): string {
    return String(value ?? "").trim().toUpperCase();
}


/** @deprecated Use CONTRACT_ENVELOPE_LENDER_NAME */
export const DOCUSIGN_EMAIL_LENDER_NAME = CONTRACT_ENVELOPE_LENDER_NAME;

/** DocuSign API hard limit for envelope `emailSubject`. */
export const DOCUSIGN_EMAIL_SUBJECT_MAX_LEN = 100;

/** Keep lender + suffix intact; shorten the middle (business) when over the DocuSign limit. */
function clampDocuSignEmailSubject(
    lender: string,
    middle: string,
    suffix: string,
): string {
    const prefix = `${lender}: `;
    const maxMiddle =
        DOCUSIGN_EMAIL_SUBJECT_MAX_LEN - prefix.length - suffix.length;
    if (maxMiddle < 1) {
        return `${prefix}${suffix}`.slice(0, DOCUSIGN_EMAIL_SUBJECT_MAX_LEN);
    }
    const trimmedMiddle =
        middle.length > maxMiddle ? middle.slice(0, maxMiddle).trimEnd() : middle;
    return `${prefix}${trimmedMiddle}${suffix}`;
}

/** Contract envelope email subject: {FunderName}: BusinessName $Offer Amount */
export function buildContractEnvelopeEmailSubject(
    businessName: string,
    offerAmount?: number | string | null,
    funderName?: string | null,
): string {
    const business = String(businessName || "").trim() || "Business";
    const amount = formatUSD(offerAmount, { fallback: "$0.00" });
    const lender =
        String(funderName || "").trim() || CONTRACT_ENVELOPE_LENDER_NAME;
    return toEnvelopeSubjectUppercase(clampDocuSignEmailSubject(lender, business, ` ${amount}`));
}

/** ACH-only envelope email subject: {FunderName}: BusinessName - ACH Form */
export function buildAchFormEnvelopeEmailSubject(
    businessName: string,
    _offerAmount?: number | string | null,
    funderName?: string | null,
): string {
    const business = String(businessName || "").trim() || "Business";
    const lender =
        String(funderName || "").trim() || CONTRACT_ENVELOPE_LENDER_NAME;
    return toEnvelopeSubjectUppercase(clampDocuSignEmailSubject(lender, business, " - ACH Form"));
}

/** ACH-only PDF / document name: {FunderName}: BusinessName - ACH Form */
export function buildAchFormEnvelopeDocumentName(
    businessName: string,
    funderName?: string | null,
): string {
    const business = String(businessName || "").trim() || "Business";
    const lender =
        String(funderName || "").trim() || CONTRACT_ENVELOPE_LENDER_NAME;
    return toEnvelopeSubjectUppercase(`${lender}: ${business} - ACH Form`);
}

/** DocuSign PDF / document display name from an envelope subject. */
export function buildContractEnvelopeDocumentName(subject: string): string {
    const trimmed = String(subject || "")
        .trim()
        .replace(/\.pdf$/i, "")
        .trim();
    return toEnvelopeSubjectUppercase(trimmed || "Contract");
}

/** DocuSign envelope email subject: fixed lender + per-deal client name. */
export function buildDocuSignEnvelopeEmailSubject(
    clientName: string,
    offerAmount?: number | string | null,
    funderName?: string | null,
): string {
    return buildContractEnvelopeEmailSubject(clientName, offerAmount, funderName);
}
