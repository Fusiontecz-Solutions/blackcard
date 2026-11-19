import {
    APPLICATION_APPROVAL_EMAIL_SUBJECT,
    OFFER_UPDATED_EMAIL_SUBJECT,
    applyApplicationApprovalEmailPlaceholders,
    htmlContainsApprovalUrlPlaceholder,
} from '../templates/applicationApprovalEmailPlaceholders';
import { renderApplicationApprovalEmailHtml } from '../templates/applicationApprovalEmailHtml';
import { renderOfferUpdatedEmailHtml } from '../templates/offerUpdatedEmailHtml';

export type ResolveIsoApprovalEmailHtmlInput = {
    resend: boolean;
    clientName: string;
    companyName: string;
    calculateApprovalUrl?: string;
    /** Branded HTML from the CRM frontend (may contain merge-field placeholders). */
    customHtml?: string;
};

export type IsoApprovalEmailPackage = {
    subject: string;
    html: string;
    isoApprovalUrl: string;
};

/**
 * Build a send-ready ISO approval / offer-updated email.
 * Always injects the public portal URL into the server template (same HTML as the CRM frontend).
 */
export function buildIsoApprovalEmailPackage(input: {
    resend: boolean;
    clientName: string;
    companyName: string;
    isoApprovalUrl: string;
    customSubject?: string;
}): IsoApprovalEmailPackage | null {
    const isoApprovalUrl = String(input.isoApprovalUrl || '').trim();
    if (!isoApprovalUrl) return null;

    const html = resolveIsoApprovalEmailHtml({
        resend: input.resend,
        clientName: input.clientName,
        companyName: input.companyName,
        calculateApprovalUrl: isoApprovalUrl,
        customHtml: undefined,
    });

    if (htmlContainsApprovalUrlPlaceholder(html)) {
        return null;
    }

    return {
        subject: resolveIsoApprovalEmailSubject(input.resend, input.customSubject),
        html,
        isoApprovalUrl,
    };
}

/** Build the final HTML for an ISO approval or offer-updated email. */
export function resolveIsoApprovalEmailHtml({
    resend,
    clientName,
    companyName,
    calculateApprovalUrl,
    customHtml,
}: ResolveIsoApprovalEmailHtmlInput): string {
    const isoApprovalUrl = String(calculateApprovalUrl || '').trim();
    const mergeValues = {
        calculateApprovalUrl: isoApprovalUrl,
        clientName,
        companyName,
    };

    const trimmedCustom = String(customHtml || '').trim();
    let html: string;

    if (trimmedCustom) {
        html = trimmedCustom;
    } else {
        const templateValues: Record<string, string | undefined> = {
            client_name: clientName,
            company_name: companyName,
            // Inject the real portal URL at render time — never embed the placeholder on the server path.
            calculate_approval_url: isoApprovalUrl,
        };
        html = resend
            ? renderOfferUpdatedEmailHtml(templateValues)
            : renderApplicationApprovalEmailHtml(templateValues);
    }

    const resolved = applyApplicationApprovalEmailPlaceholders(html, mergeValues);

    if (htmlContainsApprovalUrlPlaceholder(resolved)) {
        console.warn(
            '[approvalEmail] ISO approval URL placeholder was not replaced — set FRONTEND_URL on the API server.',
            { hasUrl: Boolean(isoApprovalUrl), resend },
        );
    }

    return resolved;
}

export function resolveIsoApprovalEmailSubject(resend: boolean, customSubject?: string): string {
    const trimmed = String(customSubject || '').trim();
    if (trimmed) return trimmed;
    return resend ? OFFER_UPDATED_EMAIL_SUBJECT : APPLICATION_APPROVAL_EMAIL_SUBJECT;
}
