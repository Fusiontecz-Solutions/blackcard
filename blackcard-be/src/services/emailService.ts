import sendMail, {
    getServerMailVia,
    isOutboundSmtpConfigured,
    isSendGridConfigured,
    sendCredentialMail,
    sendSendGridMail,
} from '../config/nodemailer';
import {
    BRAND_DISPLAY_NAME,
    BRAND_LOGO_URL,
    buildBrandHeaderRowHtml,
    buildBrandHeaderStyles,
    buildBrandLogoAttachments,
} from '../constants/brand';
import { buildHtmlPdfMailAttachment } from './emailHtmlPdfAttachment.service';
import {
    buildIsoApprovalEmailPackage,
    resolveIsoApprovalEmailSubject,
} from './applicationApprovalEmailRenderService';
import { htmlContainsApprovalUrlPlaceholder } from '../templates/applicationApprovalEmailPlaceholders';
import {
  resolveCrmFrontendBaseUrl,
  resolveDecisionLogicInvitationBaseUrl,
} from '../utils/crmFrontendUrl';
import {
    trySendOnApplicationSubmissionThread,
    type ApplicationSubmissionMailSource,
    type ApplicationSubmissionThreadContext,
} from './applicationGmailThreadMailService';

import { logDealEmail } from './dealMailLog';
export { buildBrandLogoAttachments } from '../constants/brand';

export {
    injectApplicationApprovalEmailValues,
    buildApplicationApprovedEmailInjectValues,
    resolveMerchantContactForOfferEmail,
} from './applicationApprovalEmailValues';
export type {
    ApplicationApprovalEmailInjectValues,
    ResolveMerchantContactOptions,
} from './applicationApprovalEmailValues';

/** Trims, de-dupes, and drops empty carbon-copy recipients. */
function normalizeCcRecipients(cc?: string[] | null): string[] {
    if (!Array.isArray(cc)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of cc) {
        const value = String(raw ?? '').trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}

/**
 * Logo shown **above** the dark title box on ISO "Application Approved" and
 * "Offer Updated" emails (white background — use a dark/black logo URL, not white).
 *
 * Set once in `.env` for both templates:
 *   ISO_EMAIL_LOGO_URL=https://example.com/black_logo.png
 *
 * Per-template overrides (optional):
 *   APPROVAL_BANNER_LOGO_URL=...
 *   OFFER_UPDATED_BANNER_LOGO_URL=...
 *
 * When empty, falls back to APP_LOGO_URL or the inline brand header (CID attachments).
 */
export const ISO_EMAIL_LOGO_URL ="https://res.cloudinary.com/oqok4ng8/image/upload/v1787242509/black_logo.svg" ;

export const APPROVAL_BANNER_LOGO_URL = 'https://res.cloudinary.com/oqok4ng8/image/upload/v1787242509/black_logo.svg';

export const OFFER_UPDATED_BANNER_LOGO_URL = 'https://res.cloudinary.com/oqok4ng8/image/upload/v1787242509/black_logo.svg';

/**
 * Shared header for Application Approved + Offer Updated:
 * logo row on white (above the dark box), then dark title strip.
 */
function buildIsoBrandedEmailHeaderHtml(
    logoUrl: string | undefined,
    title: string,
    subtitle: string,
): string {
    const url = String(logoUrl || BRAND_LOGO_URL || '').trim();
    const logoRow = url
        ? `
                    <tr>
                        <td align="center" style="padding: 24px 20px 16px; background-color: #ffffff;">
                            <img src="${url}" alt="${BRAND_DISPLAY_NAME}" width="180" style="display: block; margin: 0 auto; max-width: 180px; width: 180px; height: auto; border: 0; outline: none;" />
                        </td>
                    </tr>`
        : buildBrandHeaderRowHtml();

    return `
                    ${logoRow}
                    <tr>
                        <td style="padding: 0 20px 4px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background: linear-gradient(to right, #2c2c2c, #111111); background-color: #111111; border-radius: 8px;">
                                <tr>
                                    <td align="center" style="padding: 28px 24px; color: #ffffff;">
                                        <div style="font-size: 22px; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px;">${title}</div>
                                        <div style="font-size: 14px; opacity: 0.9;">${subtitle}</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>`;
}

/**
 * Href values in these templates (`viewApplicationUrl`, `publicPortalUrl`, `calculateApprovalUrl`, etc.)
 * are supplied by callers (e.g. `applicationController`) using `resolveCrmFrontendBaseUrl()` from `../utils/crmFrontendUrl`.
 * For local testing, set `LOCAL_FRONTEND_URL` (or `DEV_FRONTEND_URL`) in the API `.env` so links open your dev SPA;
 * in production, set `PUBLIC_SITE_ORIGIN` or `FRONTEND_URL` to the live client origin.
 */

/**
 * When true (default), workflow step emails are not sent to CRM roles (agent, underwriter,
 * final underwriter, operations, super admin, etc.). In-app bell notifications still work.
 * ISO-branded approval / offer-updated templates are always allowed (see sendApplicationApprovalEmail).
 * Set DISABLE_APPLICATION_NOTIFICATION_EMAILS=false to re-enable internal step mail.
 */
export function areApplicationNotificationEmailsDisabled(): boolean {
    const master = String(process.env.DISABLE_APPLICATION_NOTIFICATION_EMAILS ?? '').trim().toLowerCase();
    if (master === 'false') return false;
    if (master === 'true') return true;
    if (String(process.env.DISABLE_CLIENT_APPLICATION_EMAILS || '').trim().toLowerCase() === 'true') {
        return true;
    }
    if (String(process.env.DISABLE_INTERNAL_APPLICATION_EMAILS ?? 'true').trim().toLowerCase() !== 'false') {
        return true;
    }
    return true;
}

/** Resolves links like `{base}/application-details/:id/overview` (idempotent if `/overview` is already present). */
export function withApplicationDetailsOverviewHref(
    viewApplicationUrl: string | undefined,
): string {
    const u = (viewApplicationUrl || '').trim();
    if (!u) return '#';
    const base = u.replace(/\/$/, '');
    if (/\/overview$/i.test(base)) return base;
    return `${base}/overview`;
}

export interface WelcomeEmailParams {
    to: string;
    name: string;
    role: string;
    temporaryPassword: string;
    loginUrl: string;
}

export async function sendWelcomeEmail({
    to,
    name,
    role,
    temporaryPassword,
    loginUrl,
}: WelcomeEmailParams): Promise<void> {
    const safeName = name || to;
    const subject = 'Your In-House CRM Account Details';
    const body = `
    <h2>Hello ${safeName},</h2>
    <p>Your account has been created in <strong>In-House CRM</strong>.</p>
    <p><strong>Assigned role:</strong> ${role}</p>
    <p><strong>Temporary password:</strong> ${temporaryPassword}</p>
    <p>For security, please log in and change your password after first sign-in.</p>
  `;

    try {
        // Carries a temporary password: never copied to the always-cc address.
        await sendCredentialMail(to, subject, body);
    } catch (error) {
        // Log only – user creation must not fail because of email issues
        // eslint-disable-next-line no-console
        console.error('Welcome email send failed (user was created):', error);
    }
}

export interface ApplicationApprovalEmailParams {
    to: string | string[];
    /** Optional carbon-copy recipients. */
    cc?: string[];
    clientName: string;
    companyName: string;
    viewApplicationUrl?: string;
    calculateApprovalUrl?: string;
    /** Pre-rendered branded HTML (CRM frontend template). When omitted, the server renders the new template. */
    html?: string;
    subject?: string;
    /** Optional logo image link shown at the top (overrides APPROVAL_BANNER_LOGO_URL). */
    bannerLogoUrl?: string;
    /** OutboundCommunication id for SendGrid delivery/open tracking (echoed back as `ocid`). */
    trackingId?: string;
    submissionApplication?: ApplicationSubmissionMailSource | null;
    gmailThread?: ApplicationSubmissionThreadContext | null;
}

export const buildApplicationApprovalEmailHtml = ({
    clientName,
    companyName,
    viewApplicationUrl,
    calculateApprovalUrl,
    bannerLogoUrl,
}: Omit<ApplicationApprovalEmailParams, 'to'>): string => {
    const safeClientName = clientName || 'Valued Client';
    const safeCompanyName = companyName || 'your company';
    const primaryActionUrl = calculateApprovalUrl || viewApplicationUrl || '#';
    const emailHeader = buildIsoBrandedEmailHeaderHtml(
        bannerLogoUrl || APPROVAL_BANNER_LOGO_URL,
        'APPLICATION APPROVED',
        'Congratulations! Your application has been successfully processed.',
    );

    return `
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Application Approved</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    ${buildBrandHeaderStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border: 1px solid #e0e0e0;">
                    
                    ${emailHeader}

                    <tr>
                        <td style="padding: 30px 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td width="110" valign="top" align="center">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #111111; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #111111; line-height: 1.2; font-weight: bold;">Application<br/>Submitted</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #111111; height: 35px;"></div></td></tr>
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #111111; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #111111; font-weight: bold;">Underwriting</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #111111; height: 35px;"></div></td></tr>
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #111111; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #111111; font-weight: bold;">Approved</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 35px;"></div></td></tr>
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Contract</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 35px;"></div></td></tr>
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Funding Call</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 35px;"></div></td></tr>
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Funded</td></tr>
                                        </table>
                                    </td>

                                    <td valign="top" style="padding-left: 25px;">
                                        <p style="margin: 0 0 15px 0; font-size: 16px; color: #111111;">Hi Team!</p>
                                        
                                        <p style="font-size: 15px; color: #444444; line-height: 1.5;">
                                            We are pleased to inform you that your application for 
                                            <strong style="color: #111111;">'${safeCompanyName}'</strong> 
                                            has been approved for ${BRAND_DISPLAY_NAME}!
                                        </p>

                                        <p style="font-size: 14px; color: #666666; line-height: 1.5;">
                                            Use the button below to calculate your approvals, review offer details, and leave comments — no ${BRAND_DISPLAY_NAME} CRM login required. Everyone on your team can access everything from this secure link.
                                        </p>

                                        <table border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                                            <tr>
                                                <td align="center" bgcolor="#111111" style="border-radius: 5px;">
                                                    <a href="${primaryActionUrl}" style="display: inline-block; padding: 12px 25px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none;">Calculate your Approval</a>
                                                </td>
                                            </tr>
                                        </table>

                                        <h4 style="margin: 30px 0 10px 0; font-size: 15px; color: #111111; text-decoration: underline; letter-spacing: 0.5px;">REQUIRED STIPS</h4>
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <td width="50%" valign="top" style="font-size: 12px; color: #444444; padding-right: 10px;">
                                                    <strong>Stips to Request Contracts</strong>
                                                    <ul style="list-style: none; padding-left: 15px; margin-top: 8px; color: #111111;">
                                                        <li><span style="color: #444444;">&#9744;&nbsp;Voided check</span></li>
                                                        <li><span style="color: #444444;">&#9744;&nbsp;Drivers license</span></li>
                                                    </ul>
                                                </td>
                                                <td width="50%" valign="top" style="font-size: 12px; color: #444444;">
                                                    <strong>Stips for Funding</strong>
                                                    <ul style="list-style: none; padding-left: 15px; margin-top: 8px; color: #111111;">
                                                        <li><span style="color: #444444;">&#9744;&nbsp;Bank Login (DecisionLogic or Manual)</span></li>
                                                        <li><span style="color: #444444;">&#9744;&nbsp;Cc Processing Statement or AR Report/Invoices</span></li>
                                                        <li><span style="color: #444444;">&#9744;&nbsp;Merchant interview / Funding Call</span></li>
                                                    </ul>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="font-size: 13px; color: #666666; margin-top: 20px; line-height: 1.4;">If you need more information or have questions, contact your representative directly or leave a comment from the same approval link above.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`
};

export interface ApplicationRejectionEmailParams {
    to: string | string[];
    /** Optional carbon-copy recipients (e.g. account managers). */
    cc?: string[];
    subject?: string;
    /** Fully-rendered, branded rejection email HTML (built by the caller). */
    html?: string;
    trackingId?: string;
    /** Threading hints (accepted for API compatibility; delivery is best-effort). */
    inReplyTo?: string | null;
    references?: string | string[] | null;
    freshSubject?: string;
    clientName?: string;
    primaryReason?: string;
    otherReasons?: string;
    /** When set, try Gmail API reply on the submission thread before SendGrid. */
    submissionApplication?: ApplicationSubmissionMailSource | null;
    gmailThread?: ApplicationSubmissionThreadContext | null;
}

/**
 * Sends the application rejection/decline template to the linked ISO.
 * The HTML is rendered by the caller (the CRM frontend's rejection template),
 * so this only handles delivery + tracking.
 *
 * @returns send result; `sgMessageId` is stored for webhook fallback matching
 */
export async function sendApplicationRejectionEmail({
    to,
    cc,
    subject,
    html,
    trackingId,
    submissionApplication,
    gmailThread,
}: ApplicationRejectionEmailParams): Promise<{
    sent: boolean;
    emailedTo: string[];
    emailedCc: string[];
    ccErrors: string[];
    sgMessageId?: string;
    via?: 'gmail' | 'sendgrid' | 'smtp';
    gmailMessageId?: string;
    gmailThreadId?: string;
    subjectUsed?: string;
}> {
    const toList = normalizeCcRecipients(Array.isArray(to) ? to : [String(to || '')]);
    const toTrimmed = toList[0] || '';
    /** Every To recipient confirmed in the popup (single string when only one). */
    const toSend: string | string[] = toList.length > 1 ? toList : toTrimmed;
    const ccList = normalizeCcRecipients(cc);
    if (!toTrimmed) {
        // eslint-disable-next-line no-console
        console.warn('[email] Application rejection skipped: empty recipient');
        return { sent: false, emailedTo: [], emailedCc: [], ccErrors: [] };
    }

    const htmlBody = String(html || '').trim();
    if (!htmlBody) {
        // eslint-disable-next-line no-console
        console.warn('[email] Application rejection skipped: empty html');
        return { sent: false, emailedTo: [], emailedCc: [], ccErrors: [] };
    }

    const safeSubject = String(subject || '').trim() || 'Application Update';

    const gmailResult = await trySendOnApplicationSubmissionThread({
        application: submissionApplication,
        thread: gmailThread,
        to: toSend,
        cc: ccList.length ? ccList : undefined,
        html: htmlBody,
        fallbackSubject: safeSubject,
    });
    if (gmailResult) {
        return {
            sent: true,
            emailedTo: toList,
            emailedCc: ccList,
            ccErrors: [],
            via: 'gmail',
            gmailMessageId: gmailResult.gmailMessageId,
            gmailThreadId: gmailResult.gmailThreadId,
            subjectUsed: gmailResult.subject,
        };
    }

    try {
        const pdfAttachment = await buildHtmlPdfMailAttachment(htmlBody, 'application-rejected');
        const response = await sendMail({
            to: toSend,
            cc: ccList.length ? ccList : undefined,
            subject: safeSubject,
            html: htmlBody,
            attachments: [
                ...buildBrandLogoAttachments(),
                ...(pdfAttachment ? [pdfAttachment] : []),
            ],
            trackingId,
            categories: ['application-rejection'],
        });
        return {
            sent: true,
            emailedTo: toList,
            emailedCc: ccList,
            ccErrors: [],
            sgMessageId: response?.messageId,
            via: getServerMailVia(),
            subjectUsed: safeSubject,
        };
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Application rejection email send failed:', { to: toTrimmed, error });
        return { sent: false, emailedTo: [], emailedCc: [], ccErrors: [] };
    }
}

/** @returns send result; `sgMessageId` is stored for webhook fallback matching */
function assertSendReadyApprovalHtml(html: string): string | null {
    const trimmed = String(html || '').trim();
    if (!trimmed || htmlContainsApprovalUrlPlaceholder(trimmed)) {
        return null;
    }
    if (!/\/public\/application\/approval\//i.test(trimmed)) {
        return null;
    }
    return trimmed;
}

/** @returns send result; `sgMessageId` is stored for webhook fallback matching */
export async function sendApplicationApprovalEmail({
    to,
    cc,
    clientName,
    companyName,
    viewApplicationUrl,
    calculateApprovalUrl,
    html: customHtml,
    subject: customSubject,
    trackingId,
    submissionApplication,
    gmailThread,
}: ApplicationApprovalEmailParams): Promise<{
    sent: boolean;
    sgMessageId?: string;
    via?: 'gmail' | 'sendgrid' | 'smtp';
    gmailMessageId?: string;
    gmailThreadId?: string;
    subjectUsed?: string;
}> {
    const toList = normalizeCcRecipients(Array.isArray(to) ? to : [String(to || '')]);
    const toTrimmed = toList[0] || '';
    /** Every To recipient confirmed in the popup (single string when only one). */
    const toSend: string | string[] = toList.length > 1 ? toList : toTrimmed;
    const ccList = normalizeCcRecipients(cc);
    if (!toTrimmed) {
        // eslint-disable-next-line no-console
        console.warn('[email] Application approval skipped: empty recipient');
        return { sent: false };
    }

    const subject = resolveIsoApprovalEmailSubject(false, customSubject);
    let html = assertSendReadyApprovalHtml(String(customHtml || ''));

    if (!html && calculateApprovalUrl) {
        const built = buildIsoApprovalEmailPackage({
            resend: false,
            clientName,
            companyName,
            isoApprovalUrl: calculateApprovalUrl,
            customSubject,
        });
        html = built?.html ?? null;
    }

    if (!html) {
        console.error(
            '[email] Application approval skipped: ISO public portal URL was not resolved (check FRONTEND_URL)',
        );
        return { sent: false };
    }

    const gmailResult = await trySendOnApplicationSubmissionThread({
        application: submissionApplication,
        thread: gmailThread,
        to: toSend,
        cc: ccList.length ? ccList : undefined,
        html,
        fallbackSubject: subject,
    });
    if (gmailResult) {
        return {
            sent: true,
            via: 'gmail',
            gmailMessageId: gmailResult.gmailMessageId,
            gmailThreadId: gmailResult.gmailThreadId,
            subjectUsed: gmailResult.subject,
        };
    }

    try {
        const pdfAttachment = await buildHtmlPdfMailAttachment(html, 'application-approved');
        const response = await sendMail({
            to: toSend,
            cc: ccList.length ? ccList : undefined,
            subject,
            html,
            attachments: pdfAttachment ? [pdfAttachment] : undefined,
            trackingId,
            categories: ['application-approval'],
        });
        return {
            sent: true,
            sgMessageId: response?.messageId,
            via: getServerMailVia(),
            subjectUsed: subject,
        };
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Application approval email send failed:', { to: toTrimmed, error });
        return { sent: false };
    }
}

export interface OperationsIsoApprovalAlertEmailParams {
    to: string;
    operationsName?: string;
    isoName: string;
    applicationNumber: string;
    clientName: string;
    viewApplicationUrl?: string;
}

/** Operations alert email when ISO approves an application and contract creation can begin. */
export async function sendOperationsIsoApprovalAlertEmail({
    to,
    operationsName,
    isoName,
    applicationNumber,
    clientName,
    viewApplicationUrl,
}: OperationsIsoApprovalAlertEmailParams): Promise<boolean> {
    const toTrimmed = String(to || '').trim();
    if (!toTrimmed) {
        // eslint-disable-next-line no-console
        console.warn('[email] Operations ISO-approval alert skipped: empty recipient');
        return false;
    }

    if (areApplicationNotificationEmailsDisabled()) {
        return false;
    }

    const safeOperationsName = String(operationsName || '').trim() || 'Operations Team';
    const safeIsoName = String(isoName || '').trim() || 'ISO';
    const safeApplicationNumber = String(applicationNumber || '').trim() || 'N/A';
    const safeClientName = String(clientName || '').trim() || 'Client';
    const applicationHref = withApplicationDetailsOverviewHref(viewApplicationUrl);

    const subject = `ISO approved application #${safeApplicationNumber} - proceed to generate contract`;
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>ISO Approval Alert</title>
    ${buildBrandHeaderStyles()}
</head>
<body style="margin:0; padding:0; background:#f4f7f9; font-family: Arial, Helvetica, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff; border:1px solid #e5e7eb;">
                    ${buildBrandHeaderRowHtml()}
                    <tr>
                        <td style="padding: 20px 24px 8px;">
                            <h2 style="margin:0; color:#111827; font-size:22px;">ISO Approval Received</h2>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 24px 20px; color:#374151; font-size:14px; line-height:1.6;">
                            <p style="margin: 0 0 12px;">Hi Team,</p>
                            <p style="margin: 0 0 8px;">
                                <strong>Application ID:</strong> #${safeApplicationNumber}
                            </p>
                            <p style="margin: 0 0 16px;">
                                <strong>ISO</strong> approved application <strong>#${safeApplicationNumber}</strong>.
                                Now you can proceed to generate contract.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    try {
        await sendMail({
            to: toTrimmed,
            subject,
            html,
            attachments: buildBrandLogoAttachments(),
        });
        return true;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Operations ISO-approval alert email send failed:', { to: toTrimmed, error });
        return false;
    }
}

export interface OperationsDisbursementReadyEmailParams {
    to: string;
    operationsName: string;
    applicationNumber: string;
    clientName: string;
    viewApplicationUrl?: string;
}

/** Operations alert when funding call is "Call Done" and disbursement can proceed. */
export async function sendOperationsDisbursementReadyEmail({
    to,
    operationsName,
    applicationNumber,
    clientName,
    viewApplicationUrl,
}: OperationsDisbursementReadyEmailParams): Promise<boolean> {
    const toTrimmed = String(to || '').trim();
    if (!toTrimmed) {
        console.warn('[email] Operations disbursement-ready alert skipped: empty recipient');
        return false;
    }

    if (areApplicationNotificationEmailsDisabled()) {
        return false;
    }

    const safeOperationsName = String(operationsName || '').trim() || 'Operations Team';
    const safeApplicationNumber = String(applicationNumber || '').trim() || 'N/A';
    const safeClientName = String(clientName || '').trim() || 'Client';
    const applicationHref = withApplicationDetailsOverviewHref(viewApplicationUrl);

    const subject = `Funding call complete — proceed with disbursement (#${safeApplicationNumber})`;
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Disbursement Ready</title>
    ${buildBrandHeaderStyles()}
</head>
<body style="margin:0; padding:0; background:#f4f7f9; font-family: Arial, Helvetica, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff; border:1px solid #e5e7eb;">
                    ${buildBrandHeaderRowHtml()}
                    <tr>
                        <td style="padding: 20px 24px 8px;">
                            <h2 style="margin:0; color:#111827; font-size:22px;">Ready for Disbursement</h2>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 24px 20px; color:#374151; font-size:14px; line-height:1.6;">
                            <p style="margin: 0 0 12px;">Hi Team,</p>
                            <p style="margin: 0 0 8px;">
                                <strong>Application ID:</strong> #${safeApplicationNumber}
                            </p>
                            <p style="margin: 0 0 8px;">
                                <strong>Client:</strong> ${safeClientName}
                            </p>
                            <p style="margin: 0 0 16px;">
                                The funding call for this application is marked <strong>Call Done</strong>.
                                You may now proceed with disbursement in the CRM.
                            </p>
                            ${
                                applicationHref
                                    ? `<p style="margin: 0;"><a href="${applicationHref}" style="color:#1E88E5;">Open disbursement in CRM</a></p>`
                                    : ''
                            }
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    try {
        await sendMail({
            to: toTrimmed,
            subject,
            html,
            attachments: buildBrandLogoAttachments(),
        });
        return true;
    } catch (error) {
        console.error('Operations disbursement-ready email send failed:', { to: toTrimmed, error });
        return false;
    }
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

/** Application summary block for ISO-branded approval / offer-updated emails. */
function buildIsoOfferEmailApplicationDetailsHtml({
    applicationNumber,
    companyName,
    merchantName,
    merchantEmail,
    merchantPhone,
    approvedAmount,
    factorRate,
    repaymentAmount,
}: {
    applicationNumber?: number | string;
    companyName: string;
    merchantName?: string;
    merchantEmail?: string;
    merchantPhone?: string;
    approvedAmount?: number;
    factorRate?: number;
    repaymentAmount?: number;
}): string {
    const rows: { label: string; value: string }[] = [];
    const safeAppRef =
        applicationNumber != null && String(applicationNumber).trim() !== ''
            ? `#${String(applicationNumber).trim()}`
            : '';
    if (safeAppRef) rows.push({ label: 'Application ID', value: safeAppRef });
    rows.push({ label: 'Business Name', value: companyName || '—' });
    if (merchantName) rows.push({ label: 'Merchant / Owner', value: merchantName });
    if (merchantEmail) {
        rows.push({
            label: 'Owner Email',
            value: `<a href="mailto:${merchantEmail}" style="color: #3d6fa0; text-decoration: none;">${merchantEmail}</a>`,
        });
    }
    if (merchantPhone) rows.push({ label: 'Owner Phone', value: merchantPhone });

    const formattedApprovedAmount = formatOfferEmailCurrency(approvedAmount);
    const formattedFactorRate = formatOfferEmailFactorRate(factorRate);
    const formattedRepaymentAmount = formatOfferEmailCurrency(repaymentAmount);
    if (formattedApprovedAmount) rows.push({ label: 'Approved Amount', value: formattedApprovedAmount });
    if (formattedFactorRate) rows.push({ label: 'Factor Rate', value: formattedFactorRate });
    if (formattedRepaymentAmount) rows.push({ label: 'Repayment Amount', value: formattedRepaymentAmount });

    const detailRows = rows
        .map(
            (row) => `
                                            <tr>
                                                <td style="padding: 8px 12px; font-size: 12px; color: #888888; border-bottom: 1px solid #eeeeee; width: 38%;">${row.label}</td>
                                                <td style="padding: 8px 12px; font-size: 13px; color: #111111; font-weight: bold; border-bottom: 1px solid #eeeeee;">${row.value}</td>
                                            </tr>`,
        )
        .join('');

    return `
                                        <h4 style="margin: 28px 0 10px 0; font-size: 15px; color: #111111; text-decoration: underline; letter-spacing: 0.5px;">APPLICATION DETAILS</h4>
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fafafa; border: 1px solid #e8e8e8; border-radius: 4px;">
                                            ${detailRows}
                                        </table>`;
}

/** Client email when offer values are updated after approval comments. */
export interface ApplicationOfferUpdatedEmailParams {
    to: string | string[];
    /** Optional carbon-copy recipients. */
    cc?: string[];
    clientName: string;
    companyName: string;
    viewApplicationUrl?: string;
    calculateApprovalUrl?: string;
    /** Pre-rendered branded HTML (CRM frontend template). When omitted, the server renders the new template. */
    html?: string;
    subject?: string;
    applicationNumber?: number | string;
    merchantName?: string;
    merchantEmail?: string;
    merchantPhone?: string;
    approvedAmount?: number;
    factorRate?: number;
    repaymentAmount?: number;
    /** Optional logo image link shown at the top (overrides OFFER_UPDATED_BANNER_LOGO_URL). */
    bannerLogoUrl?: string;
    /** OutboundCommunication id for SendGrid delivery/open tracking (echoed back as `ocid`). */
    trackingId?: string;
    submissionApplication?: ApplicationSubmissionMailSource | null;
    gmailThread?: ApplicationSubmissionThreadContext | null;
}

export const buildApplicationOfferUpdatedEmailHtml = ({
    clientName,
    companyName,
    viewApplicationUrl,
    calculateApprovalUrl,
    applicationNumber,
    merchantName,
    merchantEmail,
    merchantPhone,
    approvedAmount,
    factorRate,
    repaymentAmount,
    bannerLogoUrl,
}: Omit<ApplicationOfferUpdatedEmailParams, 'to'>): string => {
    const safeClientName = clientName || 'Valued Client';
    const safeCompanyName = companyName || 'your company';
    const primaryActionUrl = calculateApprovalUrl || viewApplicationUrl || '#';
    const applicationDetailsBlock = buildIsoOfferEmailApplicationDetailsHtml({
        applicationNumber,
        companyName: safeCompanyName,
        merchantName,
        merchantEmail,
        merchantPhone,
        approvedAmount,
        factorRate,
        repaymentAmount,
    });
    const emailHeader = buildIsoBrandedEmailHeaderHtml(
        bannerLogoUrl || OFFER_UPDATED_BANNER_LOGO_URL,
        'OFFER UPDATED',
        '',
    );

    return `
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Offer Updated</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    ${buildBrandHeaderStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border: 1px solid #e0e0e0;">
                    
                    ${emailHeader}

                    <tr>
                        <td style="padding: 30px 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td width="110" valign="top" align="center">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #111111; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #111111; line-height: 1.2; font-weight: bold;">Application<br/>Submitted</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #111111; height: 35px;"></div></td></tr>
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #111111; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #111111; font-weight: bold;">Underwriting</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #111111; height: 35px;"></div></td></tr>
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #111111; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #111111; font-weight: bold;">Approved</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #111111; height: 35px;"></div></td></tr>
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #111111; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #111111; font-weight: bold;">Offer Updated</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 35px;"></div></td></tr>
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Final Call</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 35px;"></div></td></tr>
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Funded</td></tr>
                                        </table>
                                    </td>

                                    <td valign="top" style="padding-left: 25px;">
                                        <p style="margin: 0 0 15px 0; font-size: 16px; color: #111111;">Hi Team!</p>
                                        
                                        <p style="font-size: 15px; color: #444444; line-height: 1.5;">
                                            Your offer values for
                                            <strong style="color: #111111;">'${safeCompanyName}'</strong>
                                            are now updated as mentioned in the last approval mail comment.
                                        </p>

                                        <p style="font-size: 14px; color: #666666; line-height: 1.5;">
                                            Use the button below to review the updated offer, recalculate approval values if needed, and view your full application details — no ${BRAND_DISPLAY_NAME} CRM login required.
                                        </p>

                                        <table border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                                            <tr>
                                                <td align="center" bgcolor="#111111" style="border-radius: 5px;">
                                                    <a href="${primaryActionUrl}" style="display: inline-block; padding: 12px 25px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none;">Review Approval</a>
                                                </td>
                                            </tr>
                                        </table>

                                        ${applicationDetailsBlock}

                                        <p style="font-size: 13px; color: #666666; margin-top: 20px; line-height: 1.4;">If you have questions, reply to the latest approval mail comment thread, leave a comment from the link above, or contact your representative.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};

export async function sendApplicationOfferUpdatedEmail({
    to,
    cc,
    clientName,
    companyName,
    viewApplicationUrl,
    calculateApprovalUrl,
    html: customHtml,
    subject: customSubject,
    trackingId,
    submissionApplication,
    gmailThread,
}: ApplicationOfferUpdatedEmailParams): Promise<{
    sent: boolean;
    sgMessageId?: string;
    via?: 'gmail' | 'sendgrid' | 'smtp';
    gmailMessageId?: string;
    gmailThreadId?: string;
    subjectUsed?: string;
}> {
    const toList = normalizeCcRecipients(Array.isArray(to) ? to : [String(to || '')]);
    const toTrimmed = toList[0] || '';
    /** Every To recipient confirmed in the popup (single string when only one). */
    const toSend: string | string[] = toList.length > 1 ? toList : toTrimmed;
    const ccList = normalizeCcRecipients(cc);
    if (!toTrimmed) {
        // eslint-disable-next-line no-console
        console.warn('[email] Offer update skipped: empty recipient');
        return { sent: false };
    }

    const subject = resolveIsoApprovalEmailSubject(true, customSubject);
    let html = assertSendReadyApprovalHtml(String(customHtml || ''));

    if (!html && calculateApprovalUrl) {
        const built = buildIsoApprovalEmailPackage({
            resend: true,
            clientName,
            companyName,
            isoApprovalUrl: calculateApprovalUrl,
            customSubject,
        });
        html = built?.html ?? null;
    }

    if (!html) {
        console.error(
            '[email] Offer update skipped: ISO public portal URL was not resolved (check FRONTEND_URL)',
        );
        return { sent: false };
    }

    const gmailResult = await trySendOnApplicationSubmissionThread({
        application: submissionApplication,
        thread: gmailThread,
        to: toSend,
        cc: ccList.length ? ccList : undefined,
        html,
        fallbackSubject: subject,
    });
    if (gmailResult) {
        return {
            sent: true,
            via: 'gmail',
            gmailMessageId: gmailResult.gmailMessageId,
            gmailThreadId: gmailResult.gmailThreadId,
            subjectUsed: gmailResult.subject,
        };
    }

    try {
        const pdfAttachment = await buildHtmlPdfMailAttachment(html, 'offer-updated');
        const response = await sendMail({
            to: toSend,
            cc: ccList.length ? ccList : undefined,
            subject,
            html,
            attachments: pdfAttachment ? [pdfAttachment] : undefined,
            trackingId,
            categories: ['offer-updated'],
        });
        return {
            sent: true,
            sgMessageId: response?.messageId,
            via: getServerMailVia(),
            subjectUsed: subject,
        };
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Offer update email send failed:', { to: toTrimmed, error });
        return { sent: false };
    }
}

/** Client email when Operations updates Funding Call status (merchant interview / verification stage). */
export interface FundingCallPendingEmailParams {
    to: string;
    clientName?: string;
    companyName?: string;
}

export const buildFundingCallPendingEmailHtml = ({
    clientName,
    companyName,
}: Omit<FundingCallPendingEmailParams, 'to'>): string => {
    const safeClientName = clientName || 'Valued Client';
    const safeCompanyName = companyName || 'your business';

    return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Funding Call Stage</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    ${buildBrandHeaderStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border: 1px solid #dddddd;">
                    
                    ${buildBrandHeaderRowHtml()}

                    <tr>
                        <td style="padding: 0 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background: #002147; background-color: #002147; border-radius: 8px;">
                                <tr>
                                    <td width="100" align="center" style="padding: 30px 0 30px 20px;">
                                        <div style="width: 70px; height: 70px; border: 2px solid #ffffff; border-radius: 50%; line-height: 70px; text-align: center; font-size: 35px; color: #ffffff;">📞</div>
                                    </td>
                                    <td style="padding: 30px 20px; color: #ffffff;">
                                        <div style="font-size: 22px; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px;">FUNDING CALL PENDING</div>
                                        <div style="font-size: 14px; opacity: 0.9;">You're almost there! One final call to verify your funding details.</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 30px 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td width="110" valign="top" align="center">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333; line-height: 1.2;">Application<br/>Submitted</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2.5px dotted #3d6fa0; height: 35px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333;">Underwriting</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2.5px dotted #3d6fa0; height: 35px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333;">Approved</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2.5px dotted #3d6fa0; height: 35px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333;">Contract</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2.5px dotted #3d6fa0; height: 35px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333; font-weight: bold;">Funding Call</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 35px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Funded</td></tr>
                                        </table>
                                    </td>

                                    <td valign="top" style="padding-left: 25px;">
                                        <p style="margin: 0 0 15px 0; font-size: 16px; color: #444;">Hi Team!</p>
                                        
                                        <p style="font-size: 15px; color: #666; line-height: 1.5;">
                                            Your application for <strong style="color: #3d6fa0;">'${safeCompanyName}'</strong> has reached the final verification stage: <strong>The Funding Call</strong>.
                                        </p>

                                        <p style="font-size: 14px; color: #666; line-height: 1.5;">
                                            To complete the process and release your funds, we need to conduct a brief merchant interview. This call is to verify the terms of the advance and confirm your business details. 
                                        </p>

                                      

                                       
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

export async function sendFundingCallPendingEmail({
    to,
    clientName,
    companyName,
}: FundingCallPendingEmailParams): Promise<void> {
    if (areApplicationNotificationEmailsDisabled()) return;

    const subject = 'Funding call — next step for your application';
    const html = buildFundingCallPendingEmailHtml({ clientName, companyName });

    try {
        await sendMail({
            to,
            subject,
            html,
            attachments: buildBrandLogoAttachments(),
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Funding call pending email send failed:', error);
    }
}

/** Client email when disbursement is confirmed (funds released notification). */
export interface ApplicationFundedEmailParams {
    to: string;
    clientName?: string;
    companyName?: string;
}

export const buildApplicationFundedEmailHtml = ({
    clientName,
    companyName,
}: Omit<ApplicationFundedEmailParams, 'to'>): string => {
    const safeClientName = clientName || 'Valued Client';
    const safeCompanyName = companyName || 'your business';

    return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Application Funded</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    ${buildBrandHeaderStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border: 1px solid #dddddd;">
                    
                    ${buildBrandHeaderRowHtml()}

                    <tr>
                        <td style="padding: 0 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background: #002147; background-color: #002147; border-radius: 8px;">
                                <tr>
                                    <td width="100" align="center" style="padding: 30px 0 30px 20px;">
                                        <div style="width: 70px; height: 70px; border: 2px solid #ffffff; border-radius: 50%; line-height: 70px; text-align: center; font-size: 35px; color: #ffffff;">💰</div>
                                    </td>
                                    <td style="padding: 30px 20px; color: #ffffff;">
                                        <div style="font-size: 22px; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px;">FUNDS RELEASED</div>
                                        <div style="font-size: 14px; opacity: 0.9;">Success! Your funding has been processed and sent.</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 30px 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td width="110" valign="top" align="center">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333; line-height: 1.2;">Application<br/>Submitted</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #3d6fa0; height: 35px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333;">Underwriting</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #3d6fa0; height: 35px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333;">Approved</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #3d6fa0; height: 35px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333;">Verification</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #3d6fa0; height: 35px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333;">Final Review</td></tr>
                                            <tr><td align="center" style="padding: 5px 0;"><div style="width: 0px; border-left: 2px dotted #3d6fa0; height: 35px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 32px; height: 32px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 32px; font-size: 16px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333; font-weight: bold;">Funded</td></tr>
                                        </table>
                                    </td>

                                    <td valign="top" style="padding-left: 25px;">
                                        <p style="margin: 0 0 15px 0; font-size: 16px; color: #444;">Hi Team!</p>
                                        
                                        <p style="font-size: 15px; color: #666; line-height: 1.5;">
                                            We are excited to inform you that your application for <strong style="color: #3d6fa0;">'${safeCompanyName}'</strong> is now fully <strong>Funded</strong>.
                                        </p>

                                        <p style="font-size: 14px; color: #666; line-height: 1.5;">
                                            The funds have been successfully released to your designated bank account. Depending on your bank's processing time, you should see the capital reflected in your balance shortly.
                                        </p>

                                    
                                        <p style="font-size: 13px; color: #777; margin-top: 20px; line-height: 1.4;">
                                            Thank you for choosing Barclays Advance as your funding partner. We look forward to supporting your business growth!
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

export async function sendApplicationFundedEmail({
    to,
    clientName,
    companyName,
}: ApplicationFundedEmailParams): Promise<void> {
    if (areApplicationNotificationEmailsDisabled()) return;

    const subject = 'Your application is funded — funds released';
    const html = buildApplicationFundedEmailHtml({ clientName, companyName });

    try {
        await sendMail({
            to,
            subject,
            html,
            attachments: buildBrandLogoAttachments(),
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Application funded email send failed:', error);
    }
}

/** Client email when an agent sends the application to Underwriting — prefer `publicPortalUrl` (token link; no CRM login). */
export interface ApplicationSentToUnderwritingClientEmailParams {
    to: string;
    clientName?: string;
    companyName?: string;
    agentName?: string;
    applicationNumber?: number | string;
    /** Optional CRM deep link for internal staff only. */
    viewApplicationUrl?: string;
    /** Public secure URL: /public/application/status/:token */
    publicPortalUrl?: string;
}

export const buildApplicationSentToUnderwritingClientEmailHtml = ({
    clientName,
    companyName,
    agentName,
    applicationNumber,
    viewApplicationUrl,
    publicPortalUrl,
}: Omit<ApplicationSentToUnderwritingClientEmailParams, 'to'>): string => {
    const safeClientName = clientName || 'Valued Client';
    const safeCompanyName = companyName || 'your business';
    const safeAgentName = agentName || 'your representative';
    const safeAppRef = applicationNumber != null && String(applicationNumber).trim() !== ''
        ? String(applicationNumber).trim()
        : null;
    const externalHref = (publicPortalUrl || '').trim();
    const internalFallback = withApplicationDetailsOverviewHref(viewApplicationUrl);
    const primaryHref = externalHref || internalFallback;
    const hasValidPortalLink = primaryHref !== '#' && primaryHref.length > 1;
    const isPublicTokenLink = Boolean(externalHref);

    const portalButtonBlock = hasValidPortalLink
        ? `<table border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                                            <tr>
                                                <td align="center" bgcolor="#3d6fa0" style="border-radius: 5px;">
                                                    <a href="${primaryHref}" style="display: inline-block; padding: 12px 25px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none;">View your application</a>
                                                </td>
                                            </tr>
                                        </table>
                                        ${isPublicTokenLink
            ? `<p style="font-size: 12px; color: #777; margin: 8px 0 0 0;">No Barclays Advance CRM login required. This personal link expires after 90 days; do not forward to anyone you do not trust.</p>`
            : ''
        }`
        : `<p style="font-size: 13px; color: #777;">We could not generate a secure portal link. Please contact your representative for an updated link.</p>`;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Application Submitted</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    ${buildBrandHeaderStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border: 1px solid #dddddd;">
                    
                    ${buildBrandHeaderRowHtml()}

                    <tr>
                        <td style="padding: 0 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background: #002147; background-color: #002147; border-radius: 8px;">
                                <tr>
                                    <td width="100" align="center" style="padding: 30px 0 30px 20px;">
                                        <div style="width: 70px; height: 70px; border: 2px solid #ffffff; border-radius: 50%; line-height: 70px; text-align: center; font-size: 35px; color: #ffffff;">📩</div>
                                    </td>
                                    <td style="padding: 30px 20px; color: #ffffff;">
                                        <div style="font-size: 22px; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px;">APPLICATION SUBMITTED</div>
                                        <div style="font-size: 14px; opacity: 0.9;">Your application has been successfully submitted.</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 30px 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td width="120" valign="top" align="center">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333; font-weight: bold; line-height: 1.2;">Application<br/>Submitted</td></tr>
                                            <tr><td align="center" style="padding: 2px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 30px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Underwriting</td></tr>
                                            <tr><td align="center" style="padding: 2px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 30px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Approved</td></tr>
                                            <tr><td align="center" style="padding: 2px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 30px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Contract</td></tr>
                                            <tr><td align="center" style="padding: 2px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 30px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Funding Call</td></tr>
                                            <tr><td align="center" style="padding: 2px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 30px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Funded</td></tr>
                                        </table>
                                    </td>

                                    <td valign="top" style="padding-left: 25px;">
                                        <p style="margin: 0 0 15px 0; font-size: 16px; color: #444;">Hi Team!</p>
                                        
                                        <p style="font-size: 15px; color: #666; line-height: 1.5;">
                                            Great news! Your application for 
                                            <strong style="color: #3d6fa0;">'${safeCompanyName}'</strong> 
                                            has been <strong>successfully submitted</strong>.
                                        </p>

                                        <p style="font-size: 14px; color: #666; line-height: 1.5;">
                                            Our underwriting team will begin reviewing your request shortly.${hasValidPortalLink
            ? ' Use the button below to view status, leave comments, and upload documents — the same secure experience we use for approvals.'
            : ''
        }
                                        </p>

                                        ${portalButtonBlock}

                                        <p style="font-size: 13px; color: #777; margin-top: 20px; line-height: 1.4;">
                                            Need help or have questions? Open the link above — you can leave a comment for your representative from that page.
                                        </p>
                                        
                                        <table border="0" cellpadding="0" cellspacing="0" style="margin-top: 10px;">
                                            <tr>
                                                <td align="center" bgcolor="#eeeeee" style="border-radius: 5px;">
                                                    <a href="${hasValidPortalLink ? primaryHref : '#'}" style="display: inline-block; padding: 10px 20px; color: #555555; font-size: 14px; font-weight: bold; text-decoration: none;">Write a comment</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
};

export async function sendApplicationSentToUnderwritingClientEmail({
    to,
    clientName,
    companyName,
    agentName,
    applicationNumber,
    viewApplicationUrl,
    publicPortalUrl,
}: ApplicationSentToUnderwritingClientEmailParams): Promise<void> {
    if (areApplicationNotificationEmailsDisabled()) return;

    const safeAppRef = applicationNumber != null && String(applicationNumber).trim() !== ''
        ? String(applicationNumber).trim()
        : '';
    const subject = safeAppRef
        ? `Your application #${safeAppRef} is with Underwriting`
        : 'Your application is with Underwriting';

    const html = buildApplicationSentToUnderwritingClientEmailHtml({
        clientName,
        companyName,
        agentName,
        applicationNumber,
        viewApplicationUrl,
        publicPortalUrl,
    });

    try {
        await sendMail({
            to,
            subject,
            html,
            attachments: buildBrandLogoAttachments(),
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Client sent-to-underwriting email send failed:', error);
    }
}

/** Client email when an Underwriter forwards the application to Final Underwriter (initial underwriting complete). */
export interface ApplicationUnderwritingCompletedClientEmailParams {
    to: string;
    clientName?: string;
    companyName?: string;
    /** Optional CRM deep link */
    viewApplicationUrl?: string;
    /** Public secure URL: /public/application/status/:token */
    publicPortalUrl?: string;
    applicationNumber?: number | string;
}

export const buildApplicationUnderwritingCompletedClientEmailHtml = ({
    clientName,
    companyName,
    viewApplicationUrl,
    publicPortalUrl,
}: Omit<ApplicationUnderwritingCompletedClientEmailParams, 'to' | 'applicationNumber'>): string => {
    const safeClientName = clientName || 'Valued Client';
    const safeCompanyName = companyName || 'your business';
    const externalHref = (publicPortalUrl || '').trim();
    const internalFallback = withApplicationDetailsOverviewHref(viewApplicationUrl);
    const primaryHref = externalHref || internalFallback;
    const hasValidPortalLink = primaryHref !== '#' && primaryHref.length > 1;

    const statusButtonBlock = hasValidPortalLink
        ? `<table border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                                            <tr>
                                                <td align="center" bgcolor="#3d6fa0" style="border-radius: 5px;">
                                                    <a href="${primaryHref}" style="display: inline-block; padding: 12px 25px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none;">View Review Status</a>
                                                </td>
                                            </tr>
                                        </table>`
        : `<p style="font-size: 13px; color: #777;">We could not generate a secure portal link. Please contact your representative for an updated link.</p>`;

    return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Underwriting Completed</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    ${buildBrandHeaderStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border: 1px solid #dddddd;">
                    
                    ${buildBrandHeaderRowHtml()}

                    <tr>
                        <td style="padding: 0 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background: #002147; background-color: #002147; border-radius: 8px;">
                                <tr>
                                    <td width="100" align="center" style="padding: 30px 0 30px 20px;">
                                        <div style="width: 70px; height: 70px; border: 2px solid #ffffff; border-radius: 50%; line-height: 70px; text-align: center; font-size: 35px; color: #ffffff;">✅</div>
                                    </td>
                                    <td style="padding: 30px 20px; color: #ffffff;">
                                        <div style="font-size: 22px; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px;">UNDERWRITING COMPLETED</div>
                                        <div style="font-size: 14px; opacity: 0.9;">Great news! The initial underwriting review is finished.</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 30px 20px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td width="120" valign="top" align="center">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333; line-height: 1.2;">Application<br/>Submitted</td></tr>
                                            <tr><td align="center" style="padding: 2px 0;"><div style="width: 0px; border-left: 2.5px dotted #3d6fa0; height: 30px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #3d6fa0; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">✓</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #333; font-weight: bold;">Underwriting</td></tr>
                                            <tr><td align="center" style="padding: 2px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 30px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Approved</td></tr>
                                            <tr><td align="center" style="padding: 2px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 30px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Contract</td></tr>
                                            <tr><td align="center" style="padding: 2px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 30px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Funding Call</td></tr>
                                            <tr><td align="center" style="padding: 2px 0;"><div style="width: 0px; border-left: 2px dotted #cccccc; height: 30px;"></div></td></tr>

                                            <tr><td align="center"><div style="width: 35px; height: 35px; background: #cccccc; border-radius: 50%; color: #ffffff; line-height: 35px; font-size: 18px;">X</div></td></tr>
                                            <tr><td align="center" style="font-size: 11px; padding: 5px 0; color: #888;">Funded</td></tr>
                                        </table>
                                    </td>

                                    <td valign="top" style="padding-left: 25px;">
                                        <p style="margin: 0 0 15px 0; font-size: 16px; color: #444;">Hi Team!</p>
                                        
                                        <p style="font-size: 15px; color: #666; line-height: 1.5;">
                                            We are happy to inform you that our underwriters have finished 
                                            analyzing your application for <strong style="color: #3d6fa0;">'${safeCompanyName}'</strong>.
                                        </p>

                                        <p style="font-size: 14px; color: #666; line-height: 1.5;">
                                            The review stage is now complete. Your application is being prepared for the <strong>Approval</strong> stage. Please check your dashboard to see if any specific conditions or additional documents are needed to finalize the offer.
                                        </p>

                                        ${statusButtonBlock}

                                        <p style="font-size: 13px; color: #777; margin-top: 20px; line-height: 1.4;">
                                            Our team will reach out shortly if further clarification is required. You can also leave a direct comment for the underwriter below.
                                        </p>
                                        
                                        <table border="0" cellpadding="0" cellspacing="0" style="margin-top: 10px;">
                                            <tr>
                                                <td align="center" bgcolor="#eeeeee" style="border-radius: 5px;">
                                                    <a href="${hasValidPortalLink ? primaryHref : '#'}" style="display: inline-block; padding: 10px 20px; color: #555555; font-size: 14px; font-weight: bold; text-decoration: none;">Write a Comment</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

export async function sendApplicationUnderwritingCompletedClientEmail({
    to,
    clientName,
    companyName,
    viewApplicationUrl,
    publicPortalUrl,
    applicationNumber,
}: ApplicationUnderwritingCompletedClientEmailParams): Promise<void> {
    if (areApplicationNotificationEmailsDisabled()) return;

    const safeAppRef =
        applicationNumber != null && String(applicationNumber).trim() !== ''
            ? String(applicationNumber).trim()
            : '';
    const subject = safeAppRef
        ? `Application #${safeAppRef}: underwriting complete — next step is approval`
        : 'Your application: underwriting complete';

    const html = buildApplicationUnderwritingCompletedClientEmailHtml({
        clientName,
        companyName,
        viewApplicationUrl,
        publicPortalUrl,
    });

    try {
        await sendMail({
            to,
            subject,
            html,
            attachments: buildBrandLogoAttachments(),
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Client underwriting-completed email send failed:', error);
    }
}

export interface UnderwriterNewApplicationEmailParams {
    to: string;
    underwriterName?: string;
    agentName: string;
    applicationNumber?: number | string;
    clientName?: string;
    viewApplicationUrl?: string;
    /** Application UUID — when set, the send is written to the deal's Mail Log. */
    applicationUuid?: string;
}

export async function sendUnderwriterNewApplicationEmail({
    to,
    underwriterName,
    agentName,
    applicationNumber,
    clientName,
    viewApplicationUrl,
    applicationUuid,
}: UnderwriterNewApplicationEmailParams): Promise<void> {
    if (areApplicationNotificationEmailsDisabled()) {
        return;
    }

    const safeUnderwriterName = underwriterName || to;
    const safeAgentName = agentName || 'Agent';
    const safeClientName = clientName || 'Client';
    const safeApplicationNumber = applicationNumber ? String(applicationNumber) : '';

    const subject = `New application${safeApplicationNumber ? ` #${safeApplicationNumber}` : ''} sent to Underwriting`;

    const buttonHtml = viewApplicationUrl
        ? `<p style="margin:24px 0;">
        <a href="${viewApplicationUrl}"
           style="display:inline-block; padding:12px 18px; background-color:#1E88E5; color:#ffffff; text-decoration:none; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:600; border-radius:6px;">
          View application
        </a>
      </p>`
        : '';

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif; color:#111827; line-height:1.5;">
      <h2 style="margin:0 0 12px 0;">Hi Team,</h2>
      <p style="margin:0 0 10px 0;">
        <strong>${safeAgentName}</strong> sent a new application${safeApplicationNumber ? ` <strong>#${safeApplicationNumber}</strong>` : ''} to <strong>Underwriting</strong>.
      </p>
      <p style="margin:0 0 10px 0;">
        Client: <strong>${safeClientName}</strong>
      </p>
      ${buttonHtml}
      <p style="margin:18px 0 0 0; font-size:12px; color:#6B7280;">
        This is an automated notification from In-House CRM.
      </p>
    </div>
  `;

    let sendError: unknown;
    try {
        await sendMail(to, subject, html);
    } catch (error) {
        sendError = error;
        // eslint-disable-next-line no-console
        console.error('Underwriter new application email send failed:', error);
    }
    await logDealEmail({
        applicationId: applicationUuid,
        to,
        subject,
        html,
        template: 'new-application-to-scrubbing',
        templateName: 'New application sent to Scrubbing',
        recipientType: 'USER',
        description: sendError
            ? 'New-application email to the Scrubbing team failed.'
            : 'New-application email sent to the Scrubbing team.',
        sent: !sendError,
        error: sendError,
    });
}

/** Hostname (+ port) only, `www.` stripped — for detecting duplicate primary vs hosted link. */
function decisionLogicInvitationHostKey(raw: string): string | null {
    const t = String(raw || '').trim();
    if (!t || t.startsWith('(')) return null;
    try {
        const url = /^https?:/i.test(t) ? new URL(t) : new URL(`https://${t}`);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        const port =
            url.port && url.port !== '80' && url.port !== '443'
                ? `:${url.port}`
                : '';
        return `${host}${port}`;
    } catch {
        return null;
    }
}

export interface DocumentRequestEmailParams {
    to: string[];
    cc?: string[];
    isoName?: string;
    applicationNumber: string | number;
    clientName: string;
    requestedDocuments: string[];
    requestAdditional?: boolean;
    note?: string;
    /** Upload link (public token URL preferred; CRM documents tab as fallback). */
    viewApplicationUrl?: string;
    /** Pre-rendered branded HTML (upload-URL placeholder already swapped). */
    html?: string;
    subject?: string;
    /** OutboundCommunication id for SendGrid delivery/open tracking (echoed back as `ocid`). */
    trackingId?: string;
    submissionApplication?: ApplicationSubmissionMailSource | null;
    gmailThread?: ApplicationSubmissionThreadContext | null;
}

function formatDocumentRequestList(
    requestedDocuments: string[],
    requestAdditional?: boolean,
): string {
    const lines = (requestedDocuments || [])
        .map((d) => String(d || '').trim())
        .filter(Boolean);
    if (requestAdditional) {
        lines.push('Additional documents (as discussed)');
    }
    if (!lines.length) {
        return '<li>See note below</li>';
    }
    return lines.map((line) => `<li>${line}</li>`).join('');
}

export type DocumentRequestEmailResult = {
    sent: boolean;
    error?: string;
    /** SendGrid message id stored for webhook fallback matching. */
    sgMessageId?: string;
    via?: 'gmail' | 'sendgrid' | 'smtp';
    gmailMessageId?: string;
    gmailThreadId?: string;
};

/** Email ISO when underwriting requests documents on a deal (Gmail thread when available). */
export async function sendDocumentRequestEmail({
    to,
    cc,
    isoName,
    applicationNumber,
    clientName,
    requestedDocuments,
    requestAdditional,
    note,
    viewApplicationUrl,
    html: customHtml,
    subject: customSubject,
    trackingId,
    submissionApplication,
    gmailThread,
}: DocumentRequestEmailParams): Promise<DocumentRequestEmailResult> {
    const recipients = [...new Set((to || []).map((e) => String(e || '').trim()).filter(Boolean))];
    if (!recipients.length) {
        console.warn('[email] Document request skipped: no recipients');
        return { sent: false, error: 'No email recipients' };
    }

    const safeIso = isoName?.trim() || 'there';
    const appLabel = applicationNumber != null ? String(applicationNumber) : 'N/A';
    const subject =
        customSubject?.trim() || `Document request — Application #${appLabel} (${clientName})`;
    const uploadUrl = (viewApplicationUrl || '').trim() || undefined;
    const isPublicTokenLink = Boolean(uploadUrl && /\/public\/application\/documents\//i.test(uploadUrl));
    const noteBlock = note?.trim()
        ? `<p style="margin:16px 0 0;"><strong>Note from underwriting:</strong><br/>${note
              .trim()
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\n/g, '<br/>')}</p>`
        : '';
    const defaultHtml = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.5;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    ${buildBrandHeaderRowHtml()}
    <p>Hello ${safeIso},</p>
    <p>Additional documents are needed for <strong>${clientName}</strong> (Application <strong>#${appLabel}</strong>).</p>
    <p><strong>Requested documents:</strong></p>
    <ul style="margin:8px 0 16px;padding-left:20px;">
      ${formatDocumentRequestList(requestedDocuments, requestAdditional)}
    </ul>
    ${noteBlock}
    ${
        uploadUrl
            ? `<p style="margin:24px 0 0;"><a href="${uploadUrl}" style="display:inline-block;background:#3d6fa0;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Upload requested documents</a></p>`
            : ''
    }
    <p style="margin:24px 0 0;font-size:12px;color:#6B7280;">${
        isPublicTokenLink
            ? 'Open the link above and upload each requested file. No CRM login required. The system will mark items as received once uploaded.'
            : 'Open the link above, go to the Documents tab, and upload each requested file. The CRM will mark items as received once uploaded.'
    }</p>
  </div>
</body>
</html>`;

    // Prefer the branded HTML supplied by the client (upload-URL placeholder
    // already swapped for the real link); fall back to the default template.
    // The CRM template carries a placeholder for the upload link; swap in this deal's
    // public upload URL (else the link opened "http://__document_request_upload_url__/").
    const html = customHtml?.trim()
        ? uploadUrl
            ? customHtml.replace(/__DOCUMENT_REQUEST_UPLOAD_URL__/gi, uploadUrl)
            : customHtml
        : defaultHtml;

    // Never send the raw placeholder: with no public upload URL the ISO's button would
    // open http://__document_request_upload_url__/. Fail the send so the CRM shows why.
    if (/__DOCUMENT_REQUEST_UPLOAD_URL__/i.test(html)) {
        console.error('[email] Document request not sent: upload link unavailable', {
            applicationNumber,
        });
        return {
            sent: false,
            error: 'Could not create the document upload link (check FRONTEND_URL and the PublicApprovalToken table).',
        };
    }

    const ccList = [...new Set((cc || []).map((e) => String(e || '').trim()).filter(Boolean))];

    const gmailResult = await trySendOnApplicationSubmissionThread({
        application: submissionApplication,
        thread: gmailThread,
        to: recipients,
        cc: ccList.length ? ccList : undefined,
        html,
        fallbackSubject: subject,
    });
    if (gmailResult) {
        console.info('[email] Document request sent via Gmail thread', {
            to: recipients,
            subject: gmailResult.subject,
        });
        return {
            sent: true,
            via: 'gmail',
            gmailMessageId: gmailResult.gmailMessageId,
            gmailThreadId: gmailResult.gmailThreadId,
        };
    }

    if (!isSendGridConfigured()) {
        const message =
            'SendGrid is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL on the server.';
        console.warn(`[email] Document request skipped: ${message}`);
        return { sent: false, error: message };
    }

    try {
        const response = await sendSendGridMail({
            to: recipients,
            cc: ccList.length ? ccList : undefined,
            subject,
            html,
            attachments: buildBrandLogoAttachments(),
            trackingId,
            categories: ['document-request'],
        });
        console.info('[email] Document request sent via SendGrid', {
            to: recipients,
            cc: ccList.length ? ccList : undefined,
        });
        return { sent: true, sgMessageId: response?.messageId };
    } catch (error: unknown) {
        let message =
            error instanceof Error ? error.message : 'SendGrid failed to deliver the document request email';
        if (/maximum credits exceeded/i.test(message)) {
            message =
                'SendGrid email credits exceeded. Add credits to your SendGrid account or contact your administrator.';
        }
        console.error('Document request email send failed (SendGrid):', { to: recipients, error });
        return { sent: false, error: message };
    }
}

export function buildDecisionLogicEmailHtml({
    verificationUrl,
    alternateVerificationUrl,
    showAlternateLink = false,
}: {
    verificationUrl: string;
    alternateVerificationUrl?: string;
    showAlternateLink?: boolean;
}): string {
    const safeUrl = String(verificationUrl || '').trim();
    const safeAlternateUrl = String(alternateVerificationUrl || '').trim();
    const alternateBlock =
        showAlternateLink && safeAlternateUrl && safeAlternateUrl !== safeUrl
            ? `
                            <p style="margin: 16px 0 0; font-size:12px; color:#6b7280; line-height:1.5;">
                                Alternate link:
                                <a href="${safeAlternateUrl}" style="color:#3d6fa0; word-break:break-all;">${safeAlternateUrl}</a>
                            </p>`
            : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Bank Verification</title>
    ${buildBrandHeaderStyles()}
</head>
<body style="margin:0; padding:0; background:#f4f7f9; font-family: Arial, Helvetica, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff; border:1px solid #e5e7eb;">
                    ${buildBrandHeaderRowHtml()}
                    <tr>
                        <td style="padding: 20px 24px 8px;">
                            <h2 style="margin:0; color:#111827; font-size:22px;">Bank Verification</h2>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 24px 20px; color:#374151; font-size:14px; line-height:1.6;">
                            <p style="margin: 0 0 12px;">Hello,</p>
                            <p style="margin: 0 0 12px;">
                                You have been invited to complete secure bank verification for your application with <strong>${BRAND_DISPLAY_NAME}</strong>.
                            </p>
                            <p style="margin: 0 0 12px;">
                                Use the button below to connect your financial institution through Decision Logic. The process is encrypted.
                            </p>
                            <p style="margin: 20px 0 0; text-align:center;">
                                <a href="${safeUrl}" style="display:inline-block; background:#3d6fa0; color:#ffffff; text-decoration:none; font-weight:600; font-size:14px; padding:12px 24px; border-radius:6px;">Complete bank verification</a>
                            </p>
                            <p style="margin: 20px 0 0; font-size:12px; color:#6b7280; line-height:1.5;">
                                If the button does not work, copy and paste this URL into your browser:
                                <br/>
                                <a href="${safeUrl}" style="color:#3d6fa0; word-break:break-all;">${safeUrl}</a>
                            </p>
                            ${alternateBlock}
                            <p style="margin: 20px 0 0; font-size:12px; color:#6b7280; line-height:1.5;">
                                This link is unique to you and may expire. If it has expired, please contact your underwriter for a new invitation.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

export async function sendDecisionLogicEmail(
    to: string,
    token: string,
): Promise<void> {
    if (!isOutboundSmtpConfigured()) {
        throw new Error(
            'Decision Logic invitation email cannot be sent: outbound mail is not configured. ' +
            'Set SENDGRID_API_KEY (recommended: SendGrid SMTP via smtp.sendgrid.net, user "apikey") ' +
            'or SMTP_AUTH_USER + SMTP_AUTH_PASS. Also set a verified From address: SMTP_FROM, MAIL_FROM, ' +
            'SENDGRID_FROM_EMAIL, or SENDGRID_AUTH_USER.',
        );
    }

    const hostedOrigin = String(
        process.env.WOODMERE_HOSTED_ORIGIN ||
            process.env.DECISION_LOGIC_HOSTED_FALLBACK_ORIGIN ||
            'https://woodmere.finexusai.com',
    )
        .trim()
        .replace(/\/$/, '');
    const base =
        resolveDecisionLogicInvitationBaseUrl() ||
        resolveCrmFrontendBaseUrl()?.replace(/\/$/, '') ||
        '';
    const link = base
        ? `${base}/decision-logic?token=${encodeURIComponent(token)}`
        : `(configure a frontend base URL in env) token=${encodeURIComponent(token)}`;
    const hostedLink = `${hostedOrigin}/decision-logic?token=${encodeURIComponent(token)}`;
    const primaryHost = decisionLogicInvitationHostKey(base);
    const hostedHost = decisionLogicInvitationHostKey(hostedOrigin);
    const primaryIsHosted =
        primaryHost != null &&
        hostedHost != null &&
        primaryHost === hostedHost;
    const subject = `Bank verification — ${BRAND_DISPLAY_NAME}`;
    const html = buildDecisionLogicEmailHtml({
        verificationUrl: link,
        alternateVerificationUrl: hostedLink,
        showAlternateLink: !primaryIsHosted,
    });
    await sendMail({
        to,
        subject,
        html,
        attachments: buildBrandLogoAttachments(),
    });
}

