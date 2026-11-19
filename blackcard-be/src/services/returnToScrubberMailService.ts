/**
 * Underwriter sends a deal back to the scrubber for correction → email the
 * scrubber. Replies on the application's Gmail submission thread so the request
 * sits with the rest of the deal's correspondence; falls back to Gmail direct,
 * then SendGrid/SMTP, exactly like the scrubber → underwriter recommendation
 * mail.
 */
import prisma from '../config/prismaClient';
import { logDealEmail } from './dealMailLog';
import sendMail, {
    getServerMailVia,
    isOutboundSmtpConfigured,
    isSendGridConfigured,
} from '../config/nodemailer';
import {
    trySendOnApplicationSubmissionThread,
    resolveGmailAccessTokenForApplication,
    type ApplicationSubmissionMailSource,
} from './applicationGmailThreadMailService';
import { sendEmail } from './gmail.service';
import { resolveCrmFrontendBaseUrl } from '../utils/crmFrontendUrl';
import {
    buildReturnToScrubberEmailSubject,
    renderReturnToScrubberEmailHtml,
} from '../templates/returnToScrubberEmailHtml';

export type ReturnToScrubberMailResult = {
    sent: boolean;
    via?: 'gmail' | 'sendgrid' | 'smtp';
    to: string | null;
};

export async function sendReturnToScrubberEmail(params: {
    applicationId: string;
    scrubberEmail: string;
    scrubberName: string;
    underwriterName: string;
    reasons: string[];
    note: string;
}): Promise<ReturnToScrubberMailResult> {
    const to = String(params.scrubberEmail || '').trim();
    if (!to) {
        console.warn('[return-to-scrubber-mail] no scrubber email', params.applicationId);
        return { sent: false, to: null };
    }

    const application = await prisma.application.findUnique({
        where: { id: params.applicationId },
        select: {
            id: true,
            applicationId: true,
            note: true,
            createdById: true,
            client: {
                select: {
                    notes: true,
                    businessName: true,
                    ownerFirstName: true,
                    ownerLastName: true,
                },
            },
        },
    });
    if (!application) {
        console.warn('[return-to-scrubber-mail] application not found', params.applicationId);
        return { sent: false, to };
    }

    const businessName =
        String(application.client?.businessName || '').trim() ||
        `${application.client?.ownerFirstName || ''} ${application.client?.ownerLastName || ''}`.trim() ||
        'Client';
    const applicationNumber =
        application.applicationId != null && String(application.applicationId).trim() !== ''
            ? String(application.applicationId)
            : application.id;

    const base = resolveCrmFrontendBaseUrl();
    const openApplicationUrl = base
        ? `${base.replace(/\/+$/, '')}/application-details/${applicationNumber}`
        : null;

    const html = renderReturnToScrubberEmailHtml({
        scrubberName: params.scrubberName,
        underwriterName: params.underwriterName,
        applicationNumber,
        businessName,
        reasons: params.reasons,
        note: params.note,
        openApplicationUrl: openApplicationUrl ?? undefined,
    });
    const subject = buildReturnToScrubberEmailSubject(businessName);

    const submissionApplication: ApplicationSubmissionMailSource = {
        note: application.note,
        createdById: application.createdById,
        client: application.client,
    };

    // Every outcome below is written to the deal's Mail Log.
    const finish = async <T extends { sent: boolean; via?: string }>(result: T, error?: unknown): Promise<T> => {
        await logDealEmail({
            applicationId: application.id,
            to,
            subject,
            html,
            template: 'return-to-scrubber',
            templateName: 'Correction required (returned to scrubber)',
            recipientType: 'USER',
            description: result.sent
                ? 'Correction-required email sent to the scrubber.'
                : 'Correction-required email to the scrubber failed.',
            sent: result.sent,
            via: result.via,
            error,
        });
        return result;
    };

    try {
        const threadResult = await trySendOnApplicationSubmissionThread({
            application: submissionApplication,
            to,
            html,
            fallbackSubject: subject,
            useOriginalReplySubject: true,
            // Internal correction mail — never fan out to the thread's external participants.
            includeThreadParticipants: false,
        });
        if (threadResult) {
            return finish({ sent: true, via: 'gmail', to });
        }

        const gmailAccessToken = await resolveGmailAccessTokenForApplication({
            note: application.note,
            createdById: application.createdById,
            client: application.client,
        });
        if (gmailAccessToken) {
            await sendEmail({
                accessToken: gmailAccessToken,
                to,
                subject,
                body: html,
            });
            return finish({ sent: true, via: 'gmail', to });
        }

        if (isSendGridConfigured() || isOutboundSmtpConfigured()) {
            await sendMail({
                to,
                subject,
                html,
                categories: ['return-to-scrubber'],
            });
            return finish({ sent: true, via: getServerMailVia(), to });
        }

        console.warn('[return-to-scrubber-mail] no Gmail OAuth and no SMTP/SendGrid configured');
        return finish({ sent: false, to }, 'No Gmail OAuth and no SMTP/SendGrid configured');
    } catch (error) {
        console.error('[return-to-scrubber-mail] send failed', params.applicationId, error);
        return finish({ sent: false, to }, error);
    }
}
