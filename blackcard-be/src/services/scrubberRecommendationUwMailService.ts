/**
 * Scrubber recommend approval/decline → fresh email to designated underwriter(s) only.
 * Uses dedicated scrubber → UW templates (not ISO approval/decline mail).
 * Prefer Gmail API (CRM mailbox); fall back to SendGrid/SMTP when Gmail OAuth is unavailable.
 */
import prisma from '../config/prismaClient';
import sendMail, {
    getServerMailVia,
    isOutboundSmtpConfigured,
    isSendGridConfigured,
} from '../config/nodemailer';
import { trySendOnApplicationSubmissionThread,
    dedupeEmailRecipients,
    resolveGmailAccessTokenForApplication,
    type ApplicationSubmissionMailSource,
 } from './applicationGmailThreadMailService';
import { getUnderwriterRoutingConfig } from './underwriterRoutingService';
import { renderHtmlToPngBuffer } from './pdf/htmlToPng.service';
import { sendEmail, type GmailSendAttachment } from './gmail.service';
import { resolveCrmFrontendBaseUrl } from '../utils/crmFrontendUrl';
import {
    buildScrubberRecommendationUwEmailSubject,
    renderScrubberRecommendationUwEmailHtml,
    SCRUBBER_RECOMMEND_DECLINE_REASON,
    type ScrubberUwOfferSummary,
} from '../templates/scrubberRecommendationUwEmailHtml';

export type ScrubberRecommendationKind = 'Recommend Approval' | 'Recommend Decline';

type ScrubberMailApplication = ApplicationSubmissionMailSource & {
    id: string;
    applicationId?: number | null;
    assignedUnderwriterId?: string | null;
    iso?: { email?: string | null; name?: string | null } | null;
    client?: {
        notes?: string | null;
        businessName?: string | null;
        ownerFirstName?: string | null;
        ownerLastName?: string | null;
    } | null;
};

export type ScrubberUwRecipient = {
    name: string;
    email: string;
};

const MAX_SUBMISSION_ATTACHMENTS = 5;
const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

function formatMoney(value: unknown): string {
    if (value == null || value === '') return '—';
    const n =
        typeof value === 'object' && value !== null && 'toNumber' in value
            ? Number((value as { toNumber: () => number }).toNumber())
            : Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function buildClientLabel(application: ScrubberMailApplication): string {
    const business = String(application.client?.businessName || '').trim();
    if (business) return business;
    const owner = `${application.client?.ownerFirstName || ''} ${application.client?.ownerLastName || ''}`.trim();
    return owner || 'Client';
}

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

function resolveIsoLabel(application: ScrubberMailApplication): string {
    const isoEmail = String(application.iso?.email || '').trim();
    const domain = isoDomainLabelFromEmail(isoEmail);
    if (domain) return domain;
    const isoName = String(application.iso?.name || '').trim();
    if (isoName) return isoName;
    if (isoEmail) return isoEmail;
    return buildClientLabel(application);
}

function resolveOpenApplicationUrl(application: ScrubberMailApplication): string | undefined {
    const baseUrl = resolveCrmFrontendBaseUrl()?.replace(/\/$/, '');
    if (!baseUrl) return undefined;
    const numeric =
        application.applicationId != null && String(application.applicationId).trim() !== ''
            ? String(application.applicationId)
            : '';
    return `${baseUrl}/applications/${numeric || application.id}`;
}

function toOfferSummary(
    offer: Awaited<ReturnType<typeof loadOfferDecisionSummary>>,
): ScrubberUwOfferSummary {
    return {
        approvedAmount: formatMoney(offer?.offer),
        factorRate: offer?.rate != null ? String(offer.rate) : '—',
        term: offer?.term ? String(offer.term) : '—',
        frequency: offer?.frequency ? String(offer.frequency) : '—',
        payback: formatMoney(offer?.totalRemit),
        repay: formatMoney(offer?.repayPerPeriod ?? offer?.monthlyPayment),
    };
}

function isPdfApplicationFile(file: {
    originalName?: string | null;
    mimeType?: string | null;
}): boolean {
    const mime = String(file.mimeType || '').toLowerCase();
    const name = String(file.originalName || '').toLowerCase();
    return mime.includes('pdf') || name.endsWith('.pdf');
}

async function fetchUrlBuffer(url: string): Promise<Buffer | null> {
    const target = String(url || '').trim();
    if (!target) return null;
    try {
        const response = await fetch(target, { redirect: 'follow' });
        if (!response.ok) return null;
        return Buffer.from(await response.arrayBuffer());
    } catch (error) {
        console.warn('[scrubber-uw-mail] failed to download attachment:', target, error);
        return null;
    }
}

export type ScrubberSubmissionAttachmentMeta = {
    name: string;
    size?: number;
};

export async function listScrubberSubmissionAttachmentMeta(
    applicationId: string,
): Promise<ScrubberSubmissionAttachmentMeta[]> {
    const files = await prisma.applicationFile.findMany({
        where: { applicationId },
        orderBy: { uploadedAt: 'asc' },
        take: MAX_SUBMISSION_ATTACHMENTS,
        select: { originalName: true, mimeType: true, size: true },
    });
    return files
        .filter(isPdfApplicationFile)
        .map((file) => ({
            name: String(file.originalName || 'document.pdf').trim() || 'document.pdf',
            size: file.size ?? undefined,
        }));
}

async function loadSubmissionPdfAttachments(
    applicationId: string,
): Promise<GmailSendAttachment[]> {
    const files = await prisma.applicationFile.findMany({
        where: { applicationId },
        orderBy: { uploadedAt: 'asc' },
        take: MAX_SUBMISSION_ATTACHMENTS,
        select: { url: true, originalName: true, mimeType: true, size: true },
    });

    const attachments: GmailSendAttachment[] = [];
    let totalBytes = 0;

    for (const file of files) {
        if (!isPdfApplicationFile(file)) continue;
        const estimatedSize = file.size ?? 0;
        if (estimatedSize > 0 && totalBytes + estimatedSize > MAX_ATTACHMENT_TOTAL_BYTES) break;

        const content = await fetchUrlBuffer(file.url);
        if (!content?.length) continue;
        if (totalBytes + content.length > MAX_ATTACHMENT_TOTAL_BYTES) break;

        totalBytes += content.length;
        attachments.push({
            filename: String(file.originalName || 'document.pdf').trim() || 'document.pdf',
            contentType: 'application/pdf',
            content,
        });
    }

    return attachments;
}

async function resolveUwRecipients(application: ScrubberMailApplication): Promise<ScrubberUwRecipient[]> {
    const config = await getUnderwriterRoutingConfig();
    const fromRouting = (config.underwriters || [])
        .map((user) => {
            const email = String(user.email || '').trim();
            if (!email) return null;
            const name =
                `${user.firstName || ''} ${user.lastName || ''}`.trim() || email;
            return { name, email };
        })
        .filter(Boolean) as ScrubberUwRecipient[];

    if (fromRouting.length) {
        const seen = new Set<string>();
        return fromRouting.filter((row) => {
            const key = row.email.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    const assignedId = application.assignedUnderwriterId
        ? String(application.assignedUnderwriterId).trim()
        : '';
    if (!assignedId) return [];

    const assigned = await prisma.user.findUnique({
        where: { id: assignedId },
        select: { email: true, firstName: true, lastName: true, isActive: true },
    });
    const email = String(assigned?.email || '').trim();
    if (!email || assigned?.isActive === false) return [];
    const name = `${assigned?.firstName || ''} ${assigned?.lastName || ''}`.trim() || email;
    return [{ name, email }];
}

async function loadScrubberMailApplication(applicationId: string): Promise<ScrubberMailApplication | null> {
    return prisma.application.findUnique({
        where: { id: applicationId },
        select: {
            id: true,
            applicationId: true,
            note: true,
            createdById: true,
            assignedUnderwriterId: true,
            iso: { select: { email: true, name: true } },
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
}

async function loadOfferDecisionSummary(applicationId: string) {
    return prisma.offerDecision.findFirst({
        where: { applicationId },
        select: {
            offer: true,
            rate: true,
            term: true,
            frequency: true,
            totalRemit: true,
            repayPerPeriod: true,
            monthlyPayment: true,
        },
    });
}

function buildOfferSummaryHtml(params: {
    clientName: string;
    applicationNumber: string;
    offer: Awaited<ReturnType<typeof loadOfferDecisionSummary>>;
}): string {
    const { clientName, applicationNumber, offer } = params;
    return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px;">
  <h2 style="margin:0 0 16px;font-size:20px;">Recommended offer</h2>
  <p style="margin:0 0 12px;"><strong>Application:</strong> #${applicationNumber}</p>
  <p style="margin:0 0 20px;"><strong>Client:</strong> ${clientName}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Approved amount</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(offer?.offer)}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Factor rate</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${offer?.rate ?? '—'}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Term</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${offer?.term || '—'}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Frequency</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${offer?.frequency || '—'}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Payback</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(offer?.totalRemit)}</td></tr>
    <tr><td style="padding:8px 0;">Repay</td><td style="padding:8px 0;text-align:right;">${formatMoney(offer?.repayPerPeriod ?? offer?.monthlyPayment)}</td></tr>
  </table>
</div>`;
}

/** Reasons the scrubber picked, saved on the deal's note as `SCRUBBER_DECLINE_REASONS:a|||b`. */
function readScrubberDeclineReasons(note: string | null | undefined): string[] {
    const marker = 'SCRUBBER_DECLINE_REASONS:';
    const line = String(note ?? '')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith(marker));
    if (!line) return [];
    return line
        .slice(marker.length)
        .split('|||')
        .map((r) => r.trim())
        .filter(Boolean);
}

function buildScrubberUwEmailHtml(params: {
    application: ScrubberMailApplication;
    recommendation: ScrubberRecommendationKind;
    underwriterName: string;
    attachmentNames: string[];
    offerSummary: ScrubberUwOfferSummary | null;
    isCorrection?: boolean;
    correctionNote?: string | null;
    stage?: MailStage;
    deciderName?: string | null;
    declineReasons?: string[];
}): string {
    const businessName = buildClientLabel(params.application);
    const applicationNumber =
        params.application.applicationId != null &&
        String(params.application.applicationId).trim() !== ''
            ? String(params.application.applicationId)
            : params.application.id;
    const isoName = resolveIsoLabel(params.application);

    return renderScrubberRecommendationUwEmailHtml({
        recommendation: params.recommendation,
        underwriterName: params.underwriterName,
        applicationNumber,
        businessName,
        isoName,
        openApplicationUrl: resolveOpenApplicationUrl(params.application),
        attachmentNames: params.attachmentNames,
        offer: params.offerSummary,
        declineReason:
            (params.declineReasons?.length
                ? params.declineReasons
                : readScrubberDeclineReasons(params.application.note)
            ).join('; ') || undefined,
        isCorrection: params.isCorrection,
        correctionNote: params.correctionNote,
        stage: params.stage,
        deciderName: params.deciderName,
    });
}

/**
 * 'scrubber': scrubber recommendation (approval → underwriters, decline → subs@).
 * 'underwriter': underwriter's decision for Super Admin — always to subs@, never the ISO.
 */
export type MailStage = 'scrubber' | 'underwriter';

export type ScrubberMailRecipientPlan = {
    underwriters: ScrubberUwRecipient[];
    submissionAttachments: ScrubberSubmissionAttachmentMeta[];
};

export async function previewScrubberRecommendationMailRecipients(
    applicationId: string,
): Promise<ScrubberMailRecipientPlan | null> {
    const application = await loadScrubberMailApplication(applicationId);
    if (!application) return null;

    return {
        underwriters: await resolveUwRecipients(application),
        submissionAttachments: await listScrubberSubmissionAttachmentMeta(applicationId),
    };
}

import { isDefaultCcRemoved } from '../config/mandatoryCc';
import { logDealEmail } from './dealMailLog';

const DEFAULT_SUBMISSIONS_INBOX = 'subs@blackcardfunding.com';

/** Submissions inbox (override with SCRUBBER_SUBMISSIONS_EMAIL, comma-separated). */
export function getSubmissionsInboxEmails(): string[] {
    const raw = process.env.SCRUBBER_SUBMISSIONS_EMAIL;
    return dedupeEmailRecipients(
        (raw && raw.trim() ? raw : DEFAULT_SUBMISSIONS_INBOX).split(',').map((e) => e.trim()).filter(Boolean),
    );
}

export type ScrubberUwThreadMailResult = {
    sent: boolean;
    via?: 'gmail' | 'sendgrid' | 'smtp';
    to: string[];
    subject?: string;
};

export async function sendScrubberRecommendationUwThreadEmail(params: {
    applicationId: string;
    recommendation: ScrubberRecommendationKind;
    ccEmails?: string[];
    /** When set (e.g. org-admin book-access list), use instead of local UW routing. */
    toEmails?: string[];
    /**
     * When true (org-admin Recommend modal), never fall back to book UW routing
     * if `toEmails` is missing/empty.
     */
    explicitToEmails?: boolean;
    /** True when the scrubber is resending a deal the underwriter returned for correction. */
    isCorrection?: boolean;
    /** The underwriter's original correction note, echoed in the email. */
    correctionNote?: string | null;
    /** Scrubbing preview PDF from the Recommend modal, attached as Breakdown.pdf. */
    breakdownPdf?: Buffer;
    /** Default 'scrubber'. 'underwriter' = the underwriter's decision mail to subs@ for Super Admin. */
    stage?: MailStage;
    /** Underwriter who made the decision (underwriter stage). */
    deciderName?: string | null;
    /** Decline reasons given by the underwriter (underwriter stage). */
    declineReasons?: string[];
}): Promise<ScrubberUwThreadMailResult> {
    const isUnderwriterStage = params.stage === 'underwriter';
    const application = await loadScrubberMailApplication(params.applicationId);

    if (!application) {
        console.warn('[scrubber-uw-mail] application not found', params.applicationId);
        return { sent: false, to: [] };
    }

    const overrideTo = dedupeEmailRecipients(params.toEmails || []);
    const explicit = Boolean(params.explicitToEmails);
    const isDecline = params.recommendation === 'Recommend Decline';
    let uwRecipients: Array<{ name: string; email: string }>;
    if (isUnderwriterStage) {
        // Underwriter decisions go to the submissions inbox for Super Admin — never the ISO.
        // The popup pre-fills To with that inbox; honour edits to it.
        const decisionTo = overrideTo.length ? overrideTo : getSubmissionsInboxEmails();
        uwRecipients = decisionTo.map((email) => ({ name: 'Team', email }));
    } else if (isDecline) {
        // A scrubber decline goes to the submissions inbox for Super Admin — never to the
        // book's underwriters. The popup pre-fills To with that inbox; honour edits to it.
        const declineTo = overrideTo.length ? overrideTo : getSubmissionsInboxEmails();
        uwRecipients = declineTo.map((email) => ({ name: 'Team', email }));
    } else if (explicit || overrideTo.length > 0) {
        if (!overrideTo.length) {
            console.warn(
                '[scrubber-uw-mail] explicit To required but empty; refusing book routing fallback',
                params.applicationId,
            );
            return { sent: false, to: [] };
        }
        uwRecipients = overrideTo.map((email) => ({ name: email, email }));
        console.info('[scrubber-uw-mail] using explicit To', {
            applicationId: params.applicationId,
            to: overrideTo,
        });
    } else {
        uwRecipients = await resolveUwRecipients(application);
        console.info('[scrubber-uw-mail] using book UW routing', {
            applicationId: params.applicationId,
            to: uwRecipients.map((row) => row.email),
        });
    }
    const toEmails = dedupeEmailRecipients(uwRecipients.map((row) => row.email));

    if (!toEmails.length) {
        console.warn('[scrubber-uw-mail] no underwriter recipients configured', params.applicationId);
        return { sent: false, to: [] };
    }

    const gmailAccessToken = await resolveGmailAccessTokenForApplication({
        note: application.note,
        createdById: application.createdById,
        client: application.client,
    });
    const canUseGmail = Boolean(gmailAccessToken);
    const canUseSendgridOrSmtp = isSendGridConfigured() || isOutboundSmtpConfigured();

    if (!canUseGmail && !canUseSendgridOrSmtp) {
        console.warn('[scrubber-uw-mail] no Gmail OAuth and no SMTP/SendGrid configured');
        return { sent: false, to: toEmails };
    }

    const clientName = buildClientLabel(application);
    const applicationNumber =
        application.applicationId != null && String(application.applicationId).trim() !== ''
            ? String(application.applicationId)
            : application.id;
    const subject = isUnderwriterStage
        ? `Final Decision Required — Underwriter ${isDecline ? 'Declined' : 'Approved'}${
              clientName ? ` — ${clientName}` : ''
          }`
        : buildScrubberRecommendationUwEmailSubject(
              params.recommendation,
              clientName,
              params.isCorrection,
          );

    const pdfAttachments = await loadSubmissionPdfAttachments(application.id);
    const gmailAttachments: GmailSendAttachment[] = [...pdfAttachments];
    const attachmentNames = pdfAttachments.map((a) => a.filename);

    let offerSummary: ScrubberUwOfferSummary | null = null;
    if (params.recommendation === 'Recommend Approval') {
        const offer = await loadOfferDecisionSummary(application.id);
        offerSummary = toOfferSummary(offer);
        const screenshotHtml = buildOfferSummaryHtml({
            clientName,
            applicationNumber,
            offer,
        });
        const png = await renderHtmlToPngBuffer(screenshotHtml);
        if (png?.length) {
            gmailAttachments.push({
                filename: 'recommended-offer.png',
                content: png,
                contentType: 'image/png',
            });
            attachmentNames.push('recommended-offer.png');
        }
    }

    if (params.breakdownPdf?.length) {
        gmailAttachments.push({
            filename: 'Breakdown.pdf',
            content: params.breakdownPdf,
            contentType: 'application/pdf',
        });
        attachmentNames.push('Breakdown.pdf');
    }

    const mailAttachments = gmailAttachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
    }));

    const sentTo: string[] = [];
    let via: ScrubberUwThreadMailResult['via'] = canUseGmail
        ? 'gmail'
        : getServerMailVia();

    // Recommend Approval copies the submissions inbox; Mark@ is added to every mail by mandatoryCc.
    const ccSource = isDecline || isUnderwriterStage
        ? params.ccEmails || []
        : [
              ...(params.ccEmails || []),
              ...getSubmissionsInboxEmails().filter((e) => !isDefaultCcRemoved(e)),
          ];
    const ccList = dedupeEmailRecipients(ccSource).filter(
        (email) => !toEmails.some((to) => to.toLowerCase() === email.toLowerCase()),
    );

    for (const recipient of uwRecipients) {
        const html = buildScrubberUwEmailHtml({
            application,
            recommendation: params.recommendation,
            underwriterName: recipient.name,
            attachmentNames,
            offerSummary,
            isCorrection: params.isCorrection,
            correctionNote: params.correctionNote,
            stage: params.stage,
            deciderName: params.deciderName,
            declineReasons: params.declineReasons,
        });
        try {
            const submissionApplication: ApplicationSubmissionMailSource = {
                note: application.note,
                createdById: application.createdById,
                client: application.client,
            };
            const threadResult = await trySendOnApplicationSubmissionThread({
                application: submissionApplication,
                to: recipient.email,
                cc: ccList.length ? ccList : undefined,
                html,
                fallbackSubject: subject,
                useOriginalReplySubject: true,
                // Internal UW alert — never fan out to the submission thread's external participants.
                includeThreadParticipants: false,
                attachments: gmailAttachments.length ? gmailAttachments : undefined,
            });
            if (threadResult) {
                sentTo.push(recipient.email);
                via = 'gmail';
                continue;
            }
            if (gmailAccessToken) {
                await sendEmail({
                    accessToken: gmailAccessToken,
                    to: recipient.email,
                    cc: ccList.length ? ccList : undefined,
                    subject,
                    body: html,
                    attachments: gmailAttachments.length ? gmailAttachments : undefined,
                });
                sentTo.push(recipient.email);
                console.info('[scrubber-uw-mail] sent via Gmail API', {
                    to: recipient.email,
                    cc: ccList,
                    applicationId: params.applicationId,
                    recommendation: params.recommendation,
                });
                continue;
            }

            await sendMail({
                to: recipient.email,
                cc: ccList.length ? ccList : undefined,
                subject,
                html,
                attachments: mailAttachments.length ? mailAttachments : undefined,
                categories: ['scrubber-recommendation-uw'],
            });
            sentTo.push(recipient.email);
            via = getServerMailVia();
        } catch (error) {
            if (gmailAccessToken && canUseSendgridOrSmtp) {
                try {
                    await sendMail({
                        to: recipient.email,
                        cc: ccList.length ? ccList : undefined,
                        subject,
                        html,
                        attachments: mailAttachments.length ? mailAttachments : undefined,
                        categories: ['scrubber-recommendation-uw'],
                    });
                    sentTo.push(recipient.email);
                    via = getServerMailVia();
                    console.warn(
                        '[scrubber-uw-mail] Gmail failed; fell back to SendGrid/SMTP for',
                        recipient.email,
                        error,
                    );
                    continue;
                } catch (fallbackError) {
                    console.error(
                        '[scrubber-uw-mail] Gmail and SendGrid/SMTP failed for',
                        recipient.email,
                        { gmailError: error, fallbackError },
                    );
                    continue;
                }
            }
            console.error('[scrubber-uw-mail] failed for', recipient.email, error);
        }
    }

    // Mail Log: one entry for who received it, one for anyone it failed to reach.
    const logHtml = buildScrubberUwEmailHtml({
        application,
        recommendation: params.recommendation,
        underwriterName: uwRecipients[0]?.name || '',
        attachmentNames,
        offerSummary,
        isCorrection: params.isCorrection,
        correctionNote: params.correctionNote,
        stage: params.stage,
        deciderName: params.deciderName,
        declineReasons: params.declineReasons,
    });
    const failedTo = toEmails.filter(
        (email) => !sentTo.some((sent) => sent.toLowerCase() === email.toLowerCase()),
    );
    const isDeclineMail = params.recommendation === 'Recommend Decline';
    for (const [batch, sent] of [
        [sentTo, true],
        [failedTo, false],
    ] as const) {
        if (!batch.length) continue;
        await logDealEmail({
            applicationId: application.id,
            to: [...batch],
            cc: ccList,
            subject,
            html: logHtml,
            template: isUnderwriterStage ? 'underwriter-decision' : 'scrubber-recommendation',
            templateName: isUnderwriterStage
                ? `Underwriter ${isDeclineMail ? 'Declined' : 'Approved'} (for Super Admin)`
                : `Scrubber ${params.recommendation}`,
            recipientType: 'USER',
            description: isUnderwriterStage
                ? `Underwriter ${isDeclineMail ? 'decline' : 'approval'} email ${sent ? 'sent' : 'failed'} to the submissions inbox.`
                : `${params.recommendation} email ${sent ? 'sent' : 'failed'} to ${
                      isDeclineMail ? 'the submissions inbox' : 'underwriting'
                  }.`,
            sent,
            via,
        });
    }

    return {
        sent: sentTo.length > 0,
        via: sentTo.length > 0 ? via : undefined,
        to: sentTo,
        subject,
    };
}
