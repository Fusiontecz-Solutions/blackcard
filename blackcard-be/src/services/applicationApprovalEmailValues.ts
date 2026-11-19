import {
    APPLICATION_APPROVAL_CLIENT_NAME_PLACEHOLDER,
    APPLICATION_APPROVAL_COMPANY_NAME_PLACEHOLDER,
    APPLICATION_APPROVAL_URL_PLACEHOLDER,
} from './emailTemplates/applicationApprovalEmailShared';
import {
    APPLICATION_APPROVED_ACH_FREQUENCY_PLACEHOLDER,
    APPLICATION_APPROVED_APPROVED_AMOUNT_PLACEHOLDER,
    APPLICATION_APPROVED_FACTOR_RATE_PLACEHOLDER,
    APPLICATION_APPROVED_MONTHLY_REPAYMENT_PLACEHOLDER,
    APPLICATION_APPROVED_PAYBACK_AMOUNT_PLACEHOLDER,
    APPLICATION_APPROVED_REPAY_PLACEHOLDER,
    APPLICATION_APPROVED_REQUEST_AMOUNT_PLACEHOLDER,
    APPLICATION_APPROVED_TERM_PLACEHOLDER,
} from './emailTemplates/applicationApprovedEmailShared';

/** Workflow queue/state applied after the branded approval email is sent to the ISO. */
export const APPLICATION_QUEUE_APPROVAL_SENT = 'Approval Sent';
export const APPLICATION_STATE_APPROVAL_SENT = 'Approval Sent';

export type ApplicationApprovalEmailInjectValues = {
    approvalUrl?: string;
    clientName?: string;
    companyName?: string;
    requestAmount?: string;
    approvedAmount?: string;
    factorRate?: string;
    paybackAmount?: string;
    term?: string;
    repay?: string;
    monthlyRepayment?: string;
    achFrequency?: string;
};

function escapeApprovalEmailValue(value: string): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Fills the frontend approval-template placeholders with server-resolved values. */
export function injectApplicationApprovalEmailValues(
    html: string,
    values: ApplicationApprovalEmailInjectValues,
): string {
    let out = String(html || '');
    const approvalUrl = String(values.approvalUrl || '').trim();
    if (approvalUrl) {
        out = out.split(APPLICATION_APPROVAL_URL_PLACEHOLDER).join(approvalUrl);
    }
    const replaceText = (placeholder: string, raw: string | undefined) => {
        const text = String(raw ?? '').trim() || '\u2014';
        out = out.split(placeholder).join(escapeApprovalEmailValue(text));
    };
    replaceText(APPLICATION_APPROVAL_CLIENT_NAME_PLACEHOLDER, values.clientName);
    replaceText(APPLICATION_APPROVAL_COMPANY_NAME_PLACEHOLDER, values.companyName);
    replaceText(APPLICATION_APPROVED_REQUEST_AMOUNT_PLACEHOLDER, values.requestAmount);
    replaceText(APPLICATION_APPROVED_APPROVED_AMOUNT_PLACEHOLDER, values.approvedAmount);
    replaceText(APPLICATION_APPROVED_FACTOR_RATE_PLACEHOLDER, values.factorRate);
    replaceText(APPLICATION_APPROVED_PAYBACK_AMOUNT_PLACEHOLDER, values.paybackAmount);
    replaceText(APPLICATION_APPROVED_TERM_PLACEHOLDER, values.term);
    replaceText(APPLICATION_APPROVED_REPAY_PLACEHOLDER, values.repay);
    replaceText(APPLICATION_APPROVED_MONTHLY_REPAYMENT_PLACEHOLDER, values.monthlyRepayment);
    replaceText(APPLICATION_APPROVED_ACH_FREQUENCY_PLACEHOLDER, values.achFrequency);
    return out;
}

function formatOfferEmailCurrency(value?: number | null): string | undefined {
    if (value == null || !Number.isFinite(value)) return undefined;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function formatOfferEmailFactorRate(value?: number | null): string | undefined {
    if (value == null || !Number.isFinite(value)) return undefined;
    return value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
    });
}

export function buildApplicationApprovedEmailInjectValues(input: {
    requestAmount?: number | null;
    approvedAmount?: number | null;
    factorRate?: number | null;
    paybackAmount?: number | null;
    term?: string | number | null;
    repay?: number | null;
    monthlyRepayment?: number | null;
    achFrequency?: string | null;
}): Pick<
    ApplicationApprovalEmailInjectValues,
    | 'requestAmount'
    | 'approvedAmount'
    | 'factorRate'
    | 'paybackAmount'
    | 'term'
    | 'repay'
    | 'monthlyRepayment'
    | 'achFrequency'
> {
    const termRaw = input.term;
    const termText =
        termRaw == null || String(termRaw).trim() === ''
            ? undefined
            : String(termRaw).replace(/\s*payments?/i, '').trim();

    return {
        requestAmount: formatOfferEmailCurrency(input.requestAmount),
        approvedAmount: formatOfferEmailCurrency(input.approvedAmount),
        factorRate: formatOfferEmailFactorRate(input.factorRate),
        paybackAmount: formatOfferEmailCurrency(input.paybackAmount),
        term: termText,
        repay: formatOfferEmailCurrency(input.repay),
        monthlyRepayment: formatOfferEmailCurrency(input.monthlyRepayment),
        achFrequency: String(input.achFrequency || '').trim() || undefined,
    };
}

function looksLikeEmail(value: unknown): boolean {
    const s = String(value ?? '').trim();
    if (!s) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function pickFirstValidEmail(...candidates: unknown[]): string | undefined {
    for (const candidate of candidates) {
        const value = String(candidate ?? '').trim();
        if (looksLikeEmail(value)) return value;
    }
    return undefined;
}

export type ResolveMerchantContactOptions = {
    /** Caller-resolved linked client email (e.g. Funding Call UI from application detail). */
    explicitClientEmail?: string | null;
    /** Persisted contract signer email — highest priority when set. */
    contractClientEmail?: string | null;
};

/**
 * Resolves the merchant email + phone from a client record. CRM client rows
 * sometimes store a phone in `ownerEmail`, so we prefer a real email address and
 * keep phone-only values out of the email slot. Also checks linked owner rows.
 */
export function resolveMerchantContactForOfferEmail(
    client:
        | {
              ownerEmail?: string | null;
              businessEmail?: string | null;
              ownerMobileNumber?: string | null;
              businessNumber?: string | null;
              owners?: Array<{ email?: string | null; sortOrder?: number | null }> | null;
          }
        | null
        | undefined,
    options?: ResolveMerchantContactOptions,
): { merchantEmail?: string; merchantPhone?: string } {
    const ownerEmailRaw = String(client?.ownerEmail ?? '').trim();
    const businessEmailRaw = String(client?.businessEmail ?? '').trim();
    const ownerMobileRaw = String(client?.ownerMobileNumber ?? '').trim();
    const businessPhoneRaw = String(client?.businessNumber ?? '').trim();

    const ownerRelationEmails = Array.isArray(client?.owners)
        ? [...client.owners]
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((owner) => String(owner?.email ?? '').trim())
              .filter(Boolean)
        : [];

    const merchantEmail = pickFirstValidEmail(
        options?.explicitClientEmail,
        ownerEmailRaw,
        ...ownerRelationEmails,
        options?.contractClientEmail,
        businessEmailRaw,
    );

    const phoneCandidates = [ownerMobileRaw, businessPhoneRaw];
    if (ownerEmailRaw && !looksLikeEmail(ownerEmailRaw)) phoneCandidates.push(ownerEmailRaw);
    if (businessEmailRaw && !looksLikeEmail(businessEmailRaw)) phoneCandidates.push(businessEmailRaw);

    const merchantPhone = phoneCandidates.find((value) => value.length > 0);
    return { merchantEmail, merchantPhone };
}
