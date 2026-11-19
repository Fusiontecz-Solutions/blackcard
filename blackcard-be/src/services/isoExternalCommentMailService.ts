/**
 * Staff External Comment → email linked ISO with comment body + public status/comments CTA.
 * Prefer Gmail submission thread; fall back to SendGrid/SMTP.
 * Brand name + logo must be this book's only (never another tenant's assets).
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
    type ApplicationSubmissionMailSource,
} from './applicationGmailThreadMailService';
import { resolvePublicApplicationStatusPortalUrl } from './publicApplicationStatusPortalUrlService';
import { resolveEmailBrandDisplayName } from '../constants/emailBrand';


function resolveBrandName(): string {
    return resolveEmailBrandDisplayName() || 'Black Card';
}

/** Other books' logo tokens — never Black Card's own cloud (`oqok4ng8`). */
const OTHER_BOOK_LOGO_TOKENS = [
    'black_logo_vnjhof', // Woodmere (was wrongly used as Black Card fallback)
    'katan_o1l74i',
    '62276ff9534732040de8e636d9e861dd182a7ecd',
    'white_logo_d8bsb1',
    'white_logo_khpuxy',
    'Final_Logo_G6_Advance_wzqizm',
    'black_logo_uckzeu',
    'black_logo_gay0ly',
    'preferred_unctru',
    'bf5429d7285569ee9845ba28f66414f3564a3a42_jdgwrr',
];

const BLACKCARD_DEFAULT_LOGO_URL =
    'https://res.cloudinary.com/oqok4ng8/image/upload/v1787242509/black_logo.svg';

function resolveLogoUrl(): string {
    // Same order as other outbound mail: prefer env, skip other books, then Black Card default.
    const candidates = [
        String(process.env.BRAND_LOGO_URL || '').trim(),
        String(process.env.ISO_EMAIL_LOGO_URL || '').trim(),
        String(process.env.APPROVAL_BANNER_LOGO_URL || '').trim(),
        String(process.env.APP_LOGO_URL || '').trim(),
        BLACKCARD_DEFAULT_LOGO_URL,
    ];
    for (const url of candidates) {
        const trimmed = String(url || '').trim();
        if (!trimmed) continue;
        if (OTHER_BOOK_LOGO_TOKENS.some((token) => trimmed.includes(token))) continue;
        return trimmed;
    }
    return BLACKCARD_DEFAULT_LOGO_URL;
}

function escapeHtml(value: string): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildExternalCommentIsoEmailHtml(params: {
    brandName: string;
    logoUrl?: string;
    businessName: string;
    isoName: string;
    actorName: string;
    commentBody: string;
    portalUrl?: string;
}): string {
    const {
        brandName,
        logoUrl,
        businessName,
        isoName,
        actorName,
        commentBody,
        portalUrl,
    } = params;
    const greeting = 'Hi Team,';
    const logoBlock = logoUrl
        ? `<p style="margin:0 0 20px;">
            <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" width="140"
                 style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;" />
          </p>`
        : '';
    const cta = portalUrl
        ? `<p style="margin:24px 0 8px;">
            <a href="${escapeHtml(portalUrl)}"
               style="display:inline-block;background:#3d6fa0;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">
              Reply in portal
            </a>
          </p>
          <p style="margin:0 0 16px;font-size:12px;color:#6b7280;">
            Or open: <a href="${escapeHtml(portalUrl)}" style="color:#3d6fa0;">${escapeHtml(portalUrl)}</a>
          </p>`
        : '';

    return `
<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1f2937;max-width:640px;">
  ${logoBlock}
  <p style="margin:0 0 16px;">${greeting}</p>
  <p style="margin:0 0 12px;">
    ${escapeHtml(actorName)} from <strong>${escapeHtml(brandName)}</strong> shared a comment${businessName ? ` on the application for <strong>${escapeHtml(businessName)}</strong>` : ' on your application'}.
  </p>
  <div style="margin:16px 0;padding:14px 16px;border-left:4px solid #3d6fa0;background:#f3f4f6;border-radius:4px;white-space:pre-wrap;">
${escapeHtml(commentBody)}
  </div>
  ${cta}
  <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
    Please reply from the portal so your response appears on the deal in our system.
  </p>
  <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">— ${escapeHtml(brandName)}</p>
</div>`.trim();
}

export type ExternalCommentIsoMailResult = {
    sent: boolean;
    via?: 'gmail' | 'sendgrid' | 'smtp';
    to?: string;
    skippedReason?: string;
};

/**
 * Notify the linked ISO about a new staff External Comment.
 * Safe to fire-and-forget from comment create (errors are logged, not thrown to the API).
 */
export async function sendExternalCommentToIsoEmail(params: {
    applicationId: string;
    commentBody: string;
    actorName?: string | null;
}): Promise<ExternalCommentIsoMailResult> {
    const applicationId = String(params.applicationId || '').trim();
    const commentBody = String(params.commentBody || '').trim();
    if (!applicationId || !commentBody) {
        return { sent: false, skippedReason: 'missing-application-or-body' };
    }

    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
            id: true,
            applicationId: true,
            note: true,
            createdById: true,
            isoId: true,
            iso: {
                select: {
                    email: true,
                    name: true,
                },
            },
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
        return { sent: false, skippedReason: 'application-not-found' };
    }

    const isoEmail = String(application.iso?.email || '').trim();
    if (!isoEmail) {
        return { sent: false, skippedReason: 'no-iso-email' };
    }

    const brandName = resolveBrandName();
    const logoUrl = resolveLogoUrl();
    const businessName =
        String(application.client?.businessName || '').trim() ||
        `${application.client?.ownerFirstName || ''} ${application.client?.ownerLastName || ''}`.trim();
    const isoName = String(application.iso?.name || '').trim();
    const actorName = String(params.actorName || '').trim() || 'Our team';

    let portalUrl: string | undefined;
    try {
        portalUrl = await resolvePublicApplicationStatusPortalUrl(application.id);
    } catch (err) {
        console.error('[external-comment-iso-mail] portal URL failed:', err);
    }

    const subject = `${brandName}: New comment${businessName ? ` for ${businessName}` : ''}`;
    const html = buildExternalCommentIsoEmailHtml({
        brandName,
        logoUrl: logoUrl || undefined,
        businessName,
        isoName,
        actorName,
        commentBody,
        portalUrl,
    });

    const submissionApplication: ApplicationSubmissionMailSource = {
        note: application.note,
        createdById: application.createdById,
        client: application.client
            ? { notes: application.client.notes ?? null }
            : null,
    };

    // Every outcome below is written to the deal's Mail Log.
    const finish = async <T extends { sent: boolean; via?: string }>(result: T, error?: unknown): Promise<T> => {
        await logDealEmail({
            applicationId: application.id,
            to: isoEmail,
            subject,
            html,
            template: 'external-comment',
            templateName: 'New comment (to ISO)',
            recipientType: 'ISO',
            description: result.sent
                ? 'External comment emailed to the ISO.'
                : 'External comment email to the ISO failed.',
            sent: result.sent,
            via: result.via,
            error,
        });
        return result;
    };

    try {
        const gmailResult = await trySendOnApplicationSubmissionThread({
            application: submissionApplication,
            to: isoEmail,
            html,
            fallbackSubject: subject,
            useOriginalReplySubject: true,
        });
        if (gmailResult) {
            return finish({ sent: true, via: 'gmail', to: isoEmail });
        }

        if (!isSendGridConfigured() && !isOutboundSmtpConfigured()) {
            console.warn(
                '[external-comment-iso-mail] no Gmail thread and no SMTP/SendGrid',
                applicationId,
            );
            return finish({ sent: false, skippedReason: 'no-mail-transport' }, 'No Gmail thread and no SMTP/SendGrid');
        }

        await sendMail({
            to: isoEmail,
            subject,
            html,
            categories: ['external-comment-iso'],
        });
        return finish({
            sent: true,
            via: getServerMailVia(),
            to: isoEmail,
        });
    } catch (error) {
        console.error('[external-comment-iso-mail] send failed:', applicationId, error);
        return finish({ sent: false, skippedReason: 'send-failed' }, error);
    }
}
