/** Mirrors the frontend template placeholders (`applicationApprovalEmailShared.ts`). */
export const APPLICATION_APPROVAL_URL_PLACEHOLDER = '__APPLICATION_APPROVAL_URL__';
export const APPLICATION_APPROVAL_CLIENT_NAME_PLACEHOLDER = '__APPROVAL_CLIENT_NAME__';
export const APPLICATION_APPROVAL_COMPANY_NAME_PLACEHOLDER = '__APPROVAL_COMPANY_NAME__';

export const APPLICATION_APPROVAL_EMAIL_SUBJECT = 'Your Application Has Been Approved';
export const OFFER_UPDATED_EMAIL_SUBJECT = 'Your Offer Values Have Been Updated';

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Swap server-generated merge fields into branded HTML rendered by the CRM frontend.
 * The upload-URL placeholder pattern matches document-request emails.
 */
export function applyApplicationApprovalEmailPlaceholders(
    html: string,
    values: {
        calculateApprovalUrl?: string;
        clientName?: string;
        companyName?: string;
    },
): string {
    let out = String(html || '');
    const approvalUrl = String(values.calculateApprovalUrl || '').trim();
    if (approvalUrl) {
        out = out.split(APPLICATION_APPROVAL_URL_PLACEHOLDER).join(approvalUrl);
        // Browsers may lower-case scheme-less href hosts in the address bar.
        out = out.replace(/__APPLICATION_APPROVAL_URL__/gi, approvalUrl);
    }
    const clientName = String(values.clientName || '').trim();
    if (clientName) {
        out = out.split(APPLICATION_APPROVAL_CLIENT_NAME_PLACEHOLDER).join(escapeHtml(clientName));
        out = out.replace(/__APPROVAL_CLIENT_NAME__/gi, escapeHtml(clientName));
    }
    const companyName = String(values.companyName || '').trim();
    if (companyName) {
        out = out.split(APPLICATION_APPROVAL_COMPANY_NAME_PLACEHOLDER).join(escapeHtml(companyName));
        out = out.replace(/__APPROVAL_COMPANY_NAME__/gi, escapeHtml(companyName));
    }
    return out;
}

export function htmlContainsApprovalUrlPlaceholder(html: string): boolean {
    return /__APPLICATION_APPROVAL_URL__/i.test(String(html || ''));
}
