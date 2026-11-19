import { APPLICATION_APPROVAL_URL_PLACEHOLDER } from './applicationApprovalEmailPlaceholders';
import { BRAND_DISPLAY_NAME, BRAND_LOGO_URL } from '../constants/brand';

export const APP_COMPANY_NAME = BRAND_DISPLAY_NAME;
export const APP_COMPANY_CRM_NAME =
    String(process.env.APP_COMPANY_CRM_NAME || '').trim() || BRAND_DISPLAY_NAME;

/** Same hosted logo as ISO approval / banner emails (never empty relative paths). */
const DEFAULT_APPROVAL_EMAIL_LOGO =
    'https://res.cloudinary.com/oqok4ng8/image/upload/v1787242509/black_logo.svg';

export const APPLICATION_APPROVAL_EMAIL_LOGO_SRC =
    String(BRAND_LOGO_URL || '').trim() || DEFAULT_APPROVAL_EMAIL_LOGO;

export const APPLICATION_APPROVAL_EMAIL_WATERMARK_SRC = APPLICATION_APPROVAL_EMAIL_LOGO_SRC;

export const CLIENT_PROVIDED_STIPS = [
  "Voided check",
  "Drivers license",
] as const;

export const COMPANY_HANDLED_STIPS = [
    'Bank Login (DecisionLogic or Manual)',
    'Cc Processing Statement or AR Report/Invoices',
    'Merchant interview / Funding Call',
] as const;

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Encode a URL for use in an HTML href attribute (preserves the merge-field placeholder). */
export function escapeHrefAttribute(url: string): string {
    if (url === APPLICATION_APPROVAL_URL_PLACEHOLDER) {
        return url;
    }
    return escapeHtml(url);
}

export type ApplicationApprovalEmailFields = {
    clientName: string;
    companyName: string;
    /** Public ISO approval portal — single link for approval + offer-updated CTAs. */
    isoApprovalUrl: string;
    viewApplicationUrl: string;
    calculateApprovalUrl: string;
    viewCommentUrl: string;
    companyNameBrand: string;
    crmName: string;
};

/** One canonical public approval link for both email templates. */
export function resolveIsoApprovalUrl(values: Record<string, string | undefined>): string {
    return (
        String(values.calculate_approval_url || values.view_application_url || '').trim() ||
        APPLICATION_APPROVAL_URL_PLACEHOLDER
    );
}

export function resolveApplicationApprovalEmailFields(
    values: Record<string, string | undefined>,
): ApplicationApprovalEmailFields {
    const clientName = String(values.client_name || '').trim() || 'Valued Client';
    const companyName = String(values.company_name || '').trim() || 'your company';
    const isoApprovalUrl = resolveIsoApprovalUrl(values);

    return {
        clientName,
        companyName,
        isoApprovalUrl,
        viewApplicationUrl: isoApprovalUrl,
        calculateApprovalUrl: isoApprovalUrl,
        viewCommentUrl: isoApprovalUrl,
        companyNameBrand: APP_COMPANY_NAME,
        crmName: APP_COMPANY_CRM_NAME,
    };
}
