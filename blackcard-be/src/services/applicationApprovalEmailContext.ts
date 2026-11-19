import prisma from '../config/prismaClient';
import { resolveCrmFrontendBaseUrl } from '../utils/crmFrontendUrl';
import { resolveIsoApprovalPortalUrl } from './isoApprovalPortalUrlService';

/**
 * Resolves the merge fields / recipient for the ISO-facing approval (or updated-offer)
 * email. Mirrors the inline logic in `ApplicationController.sendApprovalEmail` so the
 * CRM frontend can render the same template (and preview it) without sending.
 *
 * Throws an `Error` whose message matches /not linked to an ISO|no email on file/i
 * when the deal has no linked ISO or the ISO has no email, so callers can map it to 400.
 */

export interface ApprovalEmailContextOptions {
    /** When true, build the "offer values updated" variant instead of first approval. */
    resend?: boolean;
}

export interface ApprovalEmailTemplateValues {
    clientName: string;
    companyName: string;
    viewApplicationUrl?: string;
    calculateApprovalUrl?: string;
    applicationNumber?: number | string;
    merchantName?: string;
    merchantEmail?: string;
    merchantPhone?: string;
    approvedAmount?: number;
    factorRate?: number;
    repaymentAmount?: number;
}

export interface ApprovalEmailContext {
    subject: string;
    isoEmail: string;
    isoRecipientName: string;
    companyName: string;
    viewApplicationUrl?: string;
    calculateApprovalUrl?: string;
    templateValues: ApprovalEmailTemplateValues;
}

const toOptionalNumber = (value: unknown): number | undefined => {
    if (value == null) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
};

/** Prefer email domain label (partner@acme.com → "acme"), same as FE isoDomainLabelFromEmail. */
function isoDomainLabelFromEmail(email: string | null | undefined): string | null {
    const raw = String(email || '').trim();
    if (!raw) return null;
    const at = raw.lastIndexOf('@');
    if (at < 0) return null;
    const host = raw
        .slice(at + 1)
        .trim()
        .toLowerCase()
        .replace(/\.+$/, '');
    if (!host) return null;
    const parts = host.split('.').filter(Boolean);
    if (!parts.length) return null;
    const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    if (!label || label === 'www') return parts[0] || null;
    return label;
}

function resolveIsoRecipientName(params: {
    isoName?: string | null;
    isoEmail?: string | null;
    fallback?: string | null;
}): string {
    const domain = isoDomainLabelFromEmail(params.isoEmail);
    if (domain) return domain;
    const name = String(params.isoName || '').trim();
    if (name) return name;
    const email = String(params.isoEmail || '').trim();
    if (email) return email;
    return String(params.fallback || '').trim() || 'there';
}

export async function resolveApplicationApprovalEmailContext(
    application: Record<string, any>,
    options: ApprovalEmailContextOptions = {},
): Promise<ApprovalEmailContext> {
    const { resend = false } = options;

    const client = (application?.client ?? {}) as Record<string, any>;
    let iso = (application?.iso ?? null) as Record<string, any> | null;

    const appIsoId = application?.isoId ? String(application.isoId).trim() : '';
    if (!appIsoId) {
        throw new Error(
            'This application is not linked to an ISO. Link an ISO to the deal before sending the approval email (only the ISO record receives this message).',
        );
    }

    let isoName = String(iso?.name || '').trim();
    let isoEmail = String(iso?.email || '').trim();

    if (!iso || !isoEmail) {
        const isoRow = await prisma.iso.findUnique({
            where: { id: appIsoId },
            select: { name: true, email: true },
        });
        if (isoRow) {
            iso = { ...(iso ?? {}), ...isoRow };
            isoName = isoName || String(isoRow.name || '').trim();
            isoEmail = isoEmail || String(isoRow.email || '').trim();
        }
    }

    if (!isoEmail) {
        throw new Error(
            'The linked ISO has no email on file. Add an email to that ISO in the broker/ISO settings, then try again.',
        );
    }

    const clientBusinessName = client?.businessName || 'Unknown Business';
    const companyName = clientBusinessName;
    const merchantGreetingName =
        `${client?.ownerFirstName || ''} ${client?.ownerLastName || ''}`.trim() ||
        clientBusinessName ||
        'there';
    const isoRecipientName = resolveIsoRecipientName({
        isoName,
        isoEmail: isoEmail,
        fallback: merchantGreetingName,
    });
    const merchantName =
        `${client?.ownerFirstName || ''} ${client?.ownerLastName || ''}`.trim() || undefined;
    const merchantEmail =
        String(client?.ownerEmail || client?.businessEmail || '').trim() || undefined;
    const merchantPhone =
        String(client?.ownerMobileNumber || client?.businessNumber || '').trim() || undefined;

    // Offer values: prefer values already present on the application, otherwise fetch
    // the latest terms offer / offer decision so the preview is fully populated.
    let latestTermsOffer = Array.isArray(application?.termsOffers)
        ? application.termsOffers[0]
        : null;
    let offerDecision = application?.OfferDecision ?? null;
    if (!latestTermsOffer || !offerDecision) {
        const dbId = application?.id ? String(application.id) : '';
        if (dbId) {
            if (!latestTermsOffer) {
                latestTermsOffer = await prisma.termsOffer.findFirst({
                    where: { applicationId: dbId },
                    orderBy: { updatedAt: 'desc' },
                    select: { approvedAmount: true, factorRate: true, paybackAmount: true },
                });
            }
            if (!offerDecision) {
                offerDecision = await prisma.offerDecision.findFirst({
                    where: { applicationId: dbId },
                    select: { offer: true, rate: true, totalRemit: true },
                });
            }
        }
    }

    const approvedAmount =
        toOptionalNumber(latestTermsOffer?.approvedAmount) ?? toOptionalNumber(offerDecision?.offer);
    const factorRate =
        toOptionalNumber(latestTermsOffer?.factorRate) ?? toOptionalNumber(offerDecision?.rate);
    let repaymentAmount =
        toOptionalNumber(latestTermsOffer?.paybackAmount) ??
        toOptionalNumber(offerDecision?.totalRemit);
    if (repaymentAmount == null && approvedAmount != null && factorRate != null) {
        repaymentAmount = approvedAmount * factorRate;
    }

    const baseUrl = resolveCrmFrontendBaseUrl() || '';
    const numericAppId = application?.applicationId;
    const fallbackId = application?.id;
    const viewApplicationUrl = baseUrl
        ? `${baseUrl.replace(/\/$/, '')}/applications/${numericAppId || fallbackId}`
        : undefined;

    const calculateApprovalUrl = fallbackId
        ? await resolveIsoApprovalPortalUrl(String(fallbackId), { expiresInDays: 90 })
        : undefined;

    const subject = resend
        ? 'Your Offer Values Have Been Updated'
        : 'Your Application Has Been Approved';

    const templateValues: ApprovalEmailTemplateValues = {
        clientName: isoRecipientName,
        companyName,
        viewApplicationUrl,
        calculateApprovalUrl,
        applicationNumber: numericAppId ?? undefined,
        merchantName,
        merchantEmail,
        merchantPhone,
        approvedAmount,
        factorRate,
        repaymentAmount,
    };

    return {
        subject,
        isoEmail,
        isoRecipientName,
        companyName,
        viewApplicationUrl,
        calculateApprovalUrl,
        templateValues,
    };
}
