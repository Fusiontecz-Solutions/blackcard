/**
 * Scrubber flags a deal as Missing Documents → short internal notice to every
 * active Super Admin. Server mailer (SendGrid/SMTP) only — never the ISO thread.
 */
import prisma from '../config/prismaClient';
import { logDealEmail } from './dealMailLog';
import sendMail, {
    getServerMailVia,
    isOutboundSmtpConfigured,
    isSendGridConfigured,
} from '../config/nodemailer';
import {
    buildPublicDocumentRequestPortalUrl,
    resolveCrmFrontendBaseUrl,
} from '../utils/crmFrontendUrl';
import { createPublicPortalToken } from './publicPortalTokenService';
import {
    buildMissingDocumentsEmailSubject,
    renderMissingDocumentsEmailHtml,
} from '../templates/missingDocumentsEmailHtml';

export async function sendMissingDocumentsSuperAdminEmail(params: {
    applicationId: string;
    flaggedByName: string;
    documents: string[];
}): Promise<{ sent: boolean; to: string[] }> {
    const superAdmins = await prisma.user.findMany({
        where: { role: 'SUPER_ADMIN', isActive: true },
        select: { email: true },
    });
    const to = Array.from(
        new Set(superAdmins.map((u) => String(u.email || '').trim()).filter(Boolean)),
    );
    if (to.length === 0) {
        console.warn('[missing-documents-mail] no active Super Admin emails', params.applicationId);
        return { sent: false, to };
    }

    const application = await prisma.application.findUnique({
        where: { id: params.applicationId },
        select: {
            id: true,
            applicationId: true,
            client: { select: { businessName: true, ownerFirstName: true, ownerLastName: true } },
        },
    });
    if (!application) return { sent: false, to };

    const businessName =
        String(application.client?.businessName || '').trim() ||
        `${application.client?.ownerFirstName || ''} ${application.client?.ownerLastName || ''}`.trim() ||
        'Client';
    const applicationNumber =
        application.applicationId != null ? String(application.applicationId) : application.id;
    const base = resolveCrmFrontendBaseUrl();
    // The button opens the PUBLIC upload page for this deal (per-document
    // Upload buttons + "Send back to Scrubber").
    let uploadDocumentsUrl: string | undefined;
    if (base) {
        const token =
            (await createPublicPortalToken(application.id, { expiresInDays: 30 })) || application.id;
        uploadDocumentsUrl = buildPublicDocumentRequestPortalUrl(base, token);
    } else {
        // No frontend origin → neither the upload page nor the CRM deal link
        // can be built; the email goes out without a button.
        console.warn('[missing-documents-mail] no frontend base URL; email has no upload link', params.applicationId);
    }

    const html = renderMissingDocumentsEmailHtml({
        applicationNumber,
        businessName,
        flaggedByName: params.flaggedByName,
        documents: params.documents,
        uploadDocumentsUrl,
    });
    const subject = buildMissingDocumentsEmailSubject(businessName);

    // Every outcome is written to the deal's Mail Log.
    const finish = async (sent: boolean, via?: string, error?: unknown) => {
        await logDealEmail({
            applicationId: application.id,
            to,
            subject,
            html,
            template: 'missing-documents',
            templateName: 'Missing documents (Super Admin notice)',
            recipientType: 'USER',
            description: sent
                ? 'Missing-documents notice sent to Super Admin.'
                : 'Missing-documents notice to Super Admin failed.',
            sent,
            via,
            error,
        });
        return { sent, to };
    };

    if (!isSendGridConfigured() && !isOutboundSmtpConfigured()) {
        console.warn('[missing-documents-mail] no SMTP/SendGrid configured');
        return finish(false, undefined, 'No SMTP/SendGrid configured');
    }
    try {
        await sendMail({ to, subject, html, categories: ['missing-documents'] });
        return finish(true, getServerMailVia());
    } catch (error) {
        console.error('[missing-documents-mail] send failed', params.applicationId, error);
        return finish(false, undefined, error);
    }
}
