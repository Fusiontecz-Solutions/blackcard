/**
 * When an underwriter approves a deal, send the tenant ISO approval template on the
 * original Gmail submission thread (if available).
 */
import prisma from '../config/prismaClient';
import { buildApprovalOfferTermsHtml, fillApprovalOfferTerms } from './approvalOfferTerms';
import { logDealEmail } from './dealMailLog';
import { sendApplicationApprovalEmail } from './emailService';
import { resolveApplicationApprovalEmailContext } from './applicationApprovalEmailContext';
import {
    resolveIsoApprovalEmailHtml,
} from './applicationApprovalEmailRenderService';
import {
    dedupeEmailRecipients,
    resolveApplicationSubmissionThreadContext,
    type ApplicationSubmissionMailSource,
} from './applicationGmailThreadMailService';

export async function sendIsoApprovalEmailAfterUnderwriterApprove(
    applicationId: string,
    options?: {
        isoEmail?: string;
        ccEmails?: string[];
    },
): Promise<{ sent: boolean }> {
    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
            client: true,
            iso: true,
            termsOffers: {
                orderBy: { updatedAt: 'desc' },
                take: 1,
                select: {
                    approvedAmount: true,
                    factorRate: true,
                    paybackAmount: true,
                },
            },
            OfferDecision: {
                select: {
                    offer: true,
                    rate: true,
                    totalRemit: true,
                    term: true,
                    frequency: true,
                },
            },
        },
    });

    if (!application) {
        console.warn('[uw-approve-iso-mail] application not found', applicationId);
        return { sent: false };
    }

    try {
        const ctx = await resolveApplicationApprovalEmailContext(application as Record<string, unknown>);
        const toEmail =
            String(options?.isoEmail || '').trim() || String(ctx.isoEmail || '').trim();
        if (!toEmail) {
            console.warn('[uw-approve-iso-mail] no ISO email', applicationId);
            return { sent: false };
        }

        const html = fillApprovalOfferTerms(
            resolveIsoApprovalEmailHtml({
                resend: false,
                clientName: ctx.isoRecipientName,
                companyName: ctx.companyName,
                calculateApprovalUrl: ctx.calculateApprovalUrl,
            }),
            await buildApprovalOfferTermsHtml(application.id),
        );

        const submissionApplication: ApplicationSubmissionMailSource = {
            note: application.note,
            createdById: application.createdById,
            client: application.client,
        };
        const gmailThread = await resolveApplicationSubmissionThreadContext(
            submissionApplication,
            ctx.subject,
        );

        const cc = dedupeEmailRecipients(options?.ccEmails || []).filter(
            (email) => email.toLowerCase() !== toEmail.toLowerCase(),
        );

        const result = await sendApplicationApprovalEmail({
            to: toEmail,
            cc: cc.length ? cc : undefined,
            clientName: ctx.isoRecipientName,
            companyName: ctx.companyName,
            viewApplicationUrl: ctx.calculateApprovalUrl,
            calculateApprovalUrl: ctx.calculateApprovalUrl,
            html,
            subject: ctx.subject,
            submissionApplication,
            gmailThread,
        });

        await logDealEmail({
            applicationId: application.id,
            to: toEmail,
            cc,
            subject: ctx.subject,
            html,
            template: 'approval',
            templateName: 'Application approved template',
            recipientType: 'ISO',
            description: result.sent
                ? 'Approval email sent to the ISO after underwriter approval.'
                : 'Approval email to the ISO failed after underwriter approval.',
            sent: Boolean(result.sent),
            via: (result as { via?: string }).via,
        });

        return { sent: Boolean(result.sent) };
    } catch (error) {
        console.error('[uw-approve-iso-mail] skipped or failed:', applicationId, error);
        return { sent: false };
    }
}
