import { Request, Response } from 'express';
import axios from 'axios';
import prisma from '../config/prismaClient';
import {
    findUserForGmailAccess,
    getGmailAccessTokenForUserId,
    getGoogleRefreshTokenForUser,
    mintGmailAccessToken,
    resolveGmailAccessToken,
} from '../services/googleToken.service';
import {
    fetchRecentPdfEmails,
    // getMessageDetails,
    downloadAttachment,
    fetchAllEmails,
    getMessageDetails,
    autoCreateApplicationsFromEmails,
    markGmailMessageInCrm,
    sendEmail,
    isGmailAuthError,
} from '../services/gmail.service';
import sendMail, {
    getDefaultMailFrom,
    isOutboundSmtpConfigured,
} from '../config/nodemailer';
import {
    formatRecipientList,
    inferRecipientTypeFromCategory,
} from '../services/outboundCommunicationService';
import { recordCommunicationAudit } from '../services/systemActivityLogService';
import { isPayoffOrZeroBalanceLetterTemplate } from '../utils/payoffOrZeroBalanceLetter';

/**
 * Manually trigger Gmail sync
 */

// export async function syncGmail(req: Request, res: Response): Promise<void> {
//     try {
//         const { accessToken, type, pageToken } = req.body;

//         if (!accessToken) {
//             res.status(400).json({
//                 success: false,
//                 message: 'Access token is required',
//             });
//             return;
//         }

//         if (type === 'pdf') {
//             const messages = await fetchRecentPdfEmails(accessToken);

//             res.status(200).json({
//                 success: true,
//                 total: messages.length,
//                 data: messages,
//             });

//             return;
//         }

//         const result = await fetchAllEmails(accessToken, pageToken, 15);

//         res.status(200).json({
//             success: true,
//             count: result.messages.length,
//             nextPageToken: result.nextPageToken,
//             data: result.messages,
//         });

//     } catch (error: any) {
//         res.status(500).json({
//             success: false,
//             message: error.message,
//         });
//     }
// }

// Page-size guards. Gmail allows up to 500 per `messages.list`, but each
// listed id still costs a separate `messages.get` (5 quota units), so we
// cap the per-page fan-out to keep us under Gmail's 250 units/user/second.
const GMAIL_LIST_DEFAULT_LIMIT = 50;
const GMAIL_LIST_MAX_LIMIT = 100;

function clampPageLimit(raw: unknown): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return GMAIL_LIST_DEFAULT_LIMIT;
    return Math.min(Math.max(Math.trunc(n), 1), GMAIL_LIST_MAX_LIMIT);
}

export async function syncGmail(req: Request, res: Response): Promise<void> {
    try {
        const { accessToken, type, pageToken, limit, query } = req.body;

        let resolvedAccessToken: string;
        try {
            resolvedAccessToken = await resolveGmailAccessToken({
                explicitAccessToken: accessToken,
                authUserId: req.user?.id,
                userId: req.user?.id,
                email: req.user?.email,
            });
        } catch (tokenErr: unknown) {
            const message =
                tokenErr instanceof Error
                    ? tokenErr.message
                    : 'Access token is required';
            res.status(400).json({ success: false, message });
            return;
        }

        const pageLimit = clampPageLimit(limit);
        const safeQuery = typeof query === 'string' && query.trim().length > 0 ? query.trim() : undefined;

        let label: any;
        switch (type) {
            case 'inbox':
                label = 'INBOX';
                break;
            case 'sent':
                label = 'SENT';
                break;
            case 'draft':
                label = 'DRAFT';
                break;
            case 'starred':
                label = 'STARRED';
                break;
            case 'important':
                label = 'IMPORTANT';
                break;
            default:
                label = undefined;
        }

        const runSync = async (token: string) => {
            if (type === 'pdf') {
                const messages = await fetchRecentPdfEmails(token);
                return { kind: 'pdf' as const, messages };
            }
            const result = await fetchAllEmails(token, pageToken, pageLimit, label, safeQuery);
            return { kind: 'list' as const, result };
        };

        let syncResult;
        try {
            syncResult = await runSync(resolvedAccessToken);
        } catch (error: unknown) {
            if (isGmailAuthError(error) && req.user?.id) {
                const freshToken = await getGmailAccessTokenForUserId(req.user.id);
                syncResult = await runSync(freshToken);
            } else {
                throw error;
            }
        }

        if (syncResult.kind === 'pdf') {
            res.status(200).json({
                success: true,
                total: syncResult.messages.length,
                data: syncResult.messages,
            });
            return;
        }

        res.status(200).json({
            success: true,
            count: syncResult.result.messages.length,
            nextPageToken: syncResult.result.nextPageToken,
            resultSizeEstimate: syncResult.result.resultSizeEstimate,
            pageSize: pageLimit,
            requestedPageToken:
                pageToken != null && String(pageToken).trim() !== ''
                    ? String(pageToken)
                    : null,
            data: syncResult.result.messages,
        });
    } catch (error: any) {
        const message = isGmailAuthError(error)
            ? 'Gmail connection expired or was revoked. Reconnect Google from the Gmail page.'
            : error.message;
        res.status(500).json({
            success: false,
            message,
        });
    }
}

/**
 * Get single email details
 */
// export async function getEmailDetails(req: Request, res: Response): Promise<void> {
//     try {
//         const { messageId } = req.params;
//         const { accessToken } = req.body;

//         if (!messageId || !accessToken) {
//             res.status(400).json({
//                 success: false,
//                 message: 'Message ID and access token are required',
//             });
//             return;
//         }

//         const message = await getMessageDetails(messageId, accessToken);

//         res.status(200).json({
//             success: true,
//             data: message,
//         });
//     } catch (error: any) {
//         res.status(500).json({
//             success: false,
//             message: error.message,
//         });
//     }
// }


export async function getEmailDetails(req: Request, res: Response): Promise<void> {
    try {
        const { messageId } = req.params;
        // const accessToken = req.body;
        const authHeader = req.headers.authorization;
        const accessToken = authHeader?.split(" ")[1];

        if (!messageId || !accessToken) {
            res.status(400).json({
                success: false,
                message: 'Message ID and access token are required',
            });
            return;
        }

        const message = await getMessageDetails(messageId, { accessToken });

        res.status(200).json({
            success: true,
            data: message,
        });

    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

export async function getAttachment(req: Request, res: Response): Promise<void> {
    try {
        const { messageId } = req.body;

        const authHeader = req.headers.authorization;
        const accessToken = authHeader?.split(" ")[1];

        if (!messageId || !accessToken) {
            res.status(400).json({
                success: false,
                message: "Message ID and access token are required",
            });
            return;
        }

        const message = await getMessageDetails(messageId, { accessToken });

        const allParts: any[] = [];
        const collectParts = (part: any) => {
            if (!part) return;
            if (part.body?.attachmentId) allParts.push(part);
            if (Array.isArray(part.parts)) part.parts.forEach(collectParts);
        };

        collectParts(message.payload);

        const hasFilename = (p: any) =>
            p?.filename && String(p.filename).trim().length > 0;
        const pdfWithName = allParts.filter(
            (p) => hasFilename(p) && String(p.filename).toLowerCase().endsWith('.pdf')
        );
        /** Prefer a named PDF, else any named attachment, else first part (may lack filename in API). */
        const attachmentPart =
            pdfWithName[0] || allParts.find(hasFilename) || allParts[0];

        if (!attachmentPart) {
            res.status(404).json({
                success: false,
                message: "Attachment not found",
            });
            return;
        }

        const fileBuffer = await downloadAttachment(
            messageId,
            attachmentPart.body.attachmentId,
            accessToken
        );

        const rawName = hasFilename(attachmentPart)
            ? String(attachmentPart.filename).trim()
            : 'attachment.pdf';
        const safeForHeader = rawName.replace(/[\r\n"]/g, '_');

        res.setHeader(
            "Content-Type",
            attachmentPart.mimeType || "application/octet-stream"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${safeForHeader}"`
        );

        res.status(200).send(fileBuffer);
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

/**
 * POST /api/gmail/auto-create-applications
 * Scans recent INBOX emails for PDF attachments, extracts business data,
 * and auto-creates Clients + Applications in the CRM.
 *
 * Body: { accessToken: string }
 * Requires authenticated user (req.user.id used as creator).
 */
export async function autoCreateFromEmails(req: Request, res: Response): Promise<void> {
    try {
        const { accessToken } = req.body;
        const userId = (req as any).user?.id;

        if (!accessToken) {
            res.status(400).json({
                success: false,
                message: 'Access token is required',
            });
            return;
        }

        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User authentication required',
            });
            return;
        }

        const results = await autoCreateApplicationsFromEmails(accessToken, userId);

        res.status(200).json({
            success: true,
            message: `Processed ${results.length} PDF attachment(s) from emails`,
            total: results.length,
            data: results,
        });
    } catch (error: any) {
        console.error('Auto-create applications from emails error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to auto-create applications from emails',
        });
    }
}

/**
 * POST /api/gmail/message/:messageId/in-crm
 * Adds the Gmail user label `in-crm` to the message (visible in Gmail).
 */
export async function markMessageInCrm(req: Request, res: Response): Promise<void> {
    try {
        const { messageId } = req.params;
        const { accessToken } = req.body;
        const userId = (req as any).user?.id;

        if (!messageId) {
            res.status(400).json({ success: false, message: 'messageId is required' });
            return;
        }
        if (!accessToken) {
            res.status(400).json({ success: false, message: 'Access token is required' });
            return;
        }
        if (!userId) {
            res.status(401).json({ success: false, message: 'User authentication required' });
            return;
        }

        await markGmailMessageInCrm(messageId, accessToken, userId);

        res.status(200).json({
            success: true,
            message: 'Gmail message labeled in-crm',
        });
    } catch (error: any) {
        console.error('Mark Gmail message in-crm error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to label Gmail message in-crm',
        });
    }
}

/**
 * POST /api/gmail/send
 * Compose and send an email via Gmail API.
 *
 * Body:
 *   accessToken  - Gmail OAuth access token (required)
 *   to           - recipient email(s), string or string[] (required)
 *   subject      - email subject (required)
 *   body         - HTML email body (required)
 *   cc           - CC recipient(s), string or string[] (optional)
 *   bcc          - BCC recipient(s), string or string[] (optional)
 *   from         - sender address (optional, defaults to authenticated Gmail user)
 *   replyTo      - Reply-To header (optional)
 *   threadId     - existing thread ID when replying (optional)
 *   inReplyTo    - Message-ID of the message being replied to (optional)
 *   references   - References header for threading (optional)
 *   attachLetterPdf - when true, generates a PDF from `body` (Puppeteer) and attaches it (Letters page only)
 *   letterPdfFilename - optional attachment filename (sanitized server-side; should end in .pdf)
 */
export async function sendCompose(req: Request, res: Response): Promise<void> {
    try {
        const {
            accessToken,
            to,
            subject,
            body,
            cc,
            bcc,
            from,
            replyTo,
            threadId,
            inReplyTo,
            references,
            attachLetterPdf,
            letterPdfFilename,
            templateName,
        } = req.body;

        const requestedLetterPdf =
            attachLetterPdf === true ||
            attachLetterPdf === 'true' ||
            attachLetterPdf === 1 ||
            attachLetterPdf === '1';
        const wantLetterPdf =
            requestedLetterPdf &&
            isPayoffOrZeroBalanceLetterTemplate(String(templateName || ''));

        let letterPdfBuffer: Buffer | undefined;
        let letterPdfName: string | undefined;

        if (wantLetterPdf) {
            const { renderLetterHtmlToPdfBuffer, sanitizeLetterPdfFilename } = await import(
                '../services/pdf/letterHtmlToPdf.service'
            );
            const rawPdfName =
                typeof letterPdfFilename === 'string' && letterPdfFilename.trim()
                    ? letterPdfFilename.trim()
                    : `${String(subject || 'letter').trim().slice(0, 120) || 'letter'}`;
            letterPdfName = sanitizeLetterPdfFilename(rawPdfName);
            try {
                letterPdfBuffer = await renderLetterHtmlToPdfBuffer(String(body ?? ''));
            } catch (pdfErr: unknown) {
                console.error('[gmail/send] Letter PDF generation failed:', pdfErr);
                res.status(500).json({
                    success: false,
                    message:
                        (pdfErr as { message?: string })?.message ||
                        'Failed to generate letter PDF attachment',
                });
                return;
            }
        }

        if (!to) {
            res.status(400).json({
                success: false,
                message: 'Recipient (to) is required',
            });
            return;
        }

        if (!body) {
            res.status(400).json({
                success: false,
                message: 'Email body is required',
            });
            return;
        }

        let result: any;

        if (isOutboundSmtpConfigured()) {
            // Force sender to backend SMTP account for CRM-generated letters/emails.
            result = await sendMail({
                to,
                subject: subject || '',
                html: body,
                cc,
                bcc,
                replyTo,
                from: from || getDefaultMailFrom(),
                ...(letterPdfBuffer && letterPdfName
                    ? {
                          attachments: [
                              {
                                  filename: letterPdfName,
                                  content: letterPdfBuffer,
                                  contentType: 'application/pdf',
                                  contentDisposition: 'attachment',
                              },
                          ],
                      }
                    : {}),
            });
            if (!result) {
                throw new Error('Failed to send email via SMTP');
            }
        } else {
            if (!accessToken) {
                res.status(400).json({
                    success: false,
                    message: 'Access token is required',
                });
                return;
            }

            result = await sendEmail({
                accessToken,
                to,
                subject: subject || '',
                body,
                cc,
                bcc,
                from,
                replyTo,
                threadId,
                inReplyTo,
                references,
                ...(letterPdfBuffer && letterPdfName
                    ? {
                          attachments: [
                              {
                                  filename: letterPdfName,
                                  content: letterPdfBuffer,
                                  contentType: 'application/pdf',
                              },
                          ],
                      }
                    : {}),
            });
        }

        const recipientStr = formatRecipientList(to);
        const recipientTypeRaw =
            typeof req.body.recipientType === 'string'
                ? req.body.recipientType
                : typeof req.body.category === 'string'
                  ? inferRecipientTypeFromCategory(req.body.category)
                  : 'OTHER';
        const applicationId =
            typeof req.body.applicationId === 'string' ? req.body.applicationId : null;

        try {
            await recordCommunicationAudit(req, {
                applicationId,
                channel: 'EMAIL',
                recipientType: recipientTypeRaw,
                recipient: recipientStr,
                subject: subject || '',
                body: String(body ?? ''),
                actionDescription: `Email sent to ${recipientStr}${subject ? `: ${subject}` : ''}`,
                metadata: {
                    cc: cc ?? null,
                    hasLetterPdf: Boolean(letterPdfBuffer),
                    attachments: letterPdfName ? [letterPdfName] : undefined,
                },
            });
        } catch (auditErr) {
            console.error('[gmail/send] audit log failed:', auditErr);
        }

        res.status(200).json({
            success: true,
            message: 'Email sent successfully',
            data: result,
        });
    } catch (error: any) {
        console.error('Send email error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to send email',
        });
    }
}

/**
 * GET /api/v1/gmail/me (authenticated)
 * Returns the Gmail mailbox address for the current user by calling Gmail's
 * `users/me/profile` with an access token minted from `User.googleRefreshToken`.
 * The CRM account switcher UI uses this so the connected mailbox appears after OAuth.
 */
export async function getGmailLinkedAccount(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const user = await findUserForGmailAccess({ authUserId: userId });

        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        const refreshToken = getGoogleRefreshTokenForUser(user);
        if (!refreshToken) {
            res.status(200).json({
                success: true,
                connected: false,
                crmEmail: user.email,
                gmailEmail: null,
            });
            return;
        }

        let accessToken: string;
        try {
            accessToken = await mintGmailAccessToken(refreshToken);
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : 'Could not obtain Gmail access token from refresh token';
            res.status(200).json({
                success: true,
                connected: false,
                crmEmail: user.email,
                gmailEmail: null,
                needsReconnect: true,
                message,
            });
            return;
        }

        let gmailEmail = '';
        try {
            const profileResp = await axios.get<{ emailAddress?: string }>(
                'https://gmail.googleapis.com/gmail/v1/users/me/profile',
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                },
            );
            gmailEmail = String(profileResp.data?.emailAddress || '').trim();
        } catch (err: any) {
            console.error(
                'getGmailLinkedAccount: gmail profile failed:',
                err?.response?.data || err?.message,
            );
            if (isGmailAuthError(err)) {
                res.status(200).json({
                    success: true,
                    connected: false,
                    crmEmail: user.email,
                    gmailEmail: null,
                    needsReconnect: true,
                    message:
                        'Gmail connection expired or was revoked. Reconnect Google from the Gmail page.',
                });
                return;
            }
        }

        res.status(200).json({
            success: true,
            connected: Boolean(gmailEmail),
            crmEmail: user.email,
            gmailEmail: gmailEmail || null,
            ...(gmailEmail ? {} : { needsReconnect: true }),
        });
    } catch (error: any) {
        console.error('getGmailLinkedAccount:', error);
        res.status(500).json({
            success: false,
            message: error?.message || 'Failed to resolve Gmail mailbox',
        });
    }
}

/**
 * GET /api/v1/gmail/health
 *
 * Book-wide Gmail health, for the Super Admin panel's settings screen.
 *
 * "Connected" is deliberately not just "a refresh token row exists". A revoked
 * or expired grant leaves the token sitting in the database looking healthy
 * while the auto-create cron silently stops producing deals — which is exactly
 * the failure this screen exists to catch. So each mailbox is verified by
 * actually minting an access token, the same call the cron makes.
 *
 * Every mailbox on the book is reported, because the cron sweeps all of them
 * (see cron-job/crmGmailCronJob.ts): one healthy mailbox does not mean the book
 * is fine if a second one has gone stale.
 *
 * Pass `?verify=false` for a cheap presence-only check that performs no Google
 * round-trips.
 */
export async function getGmailHealth(req: Request, res: Response): Promise<void> {
    try {
        // Book-wide data, not the caller's own mailbox — restrict to the Super
        // Admin gateway and to admins signed in to this book directly.
        const role = String(req.user?.role || '').toUpperCase();
        const isPrivileged =
            req.isSuperAdminProxy === true || role === 'SUPER_ADMIN' || role === 'ADMIN';
        if (!isPrivileged) {
            res.status(403).json({ success: false, message: 'Forbidden' });
            return;
        }

        const verify = String(req.query.verify ?? 'true').toLowerCase() !== 'false';

        const users = await prisma.user.findMany({
            where: { googleRefreshToken: { not: null } },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                googleRefreshToken: true,
                gmailAutoCreateEnabled: true,
                gmailAutoCreateEnabledAt: true,
            },
            orderBy: { email: 'asc' },
        });

        const linked = await prisma.googleOAuth.findMany({
            select: { userId: true, email: true, updatedAt: true },
        });
        const linkedByUser = new Map(linked.map((row) => [row.userId, row]));

        const mailboxes = await Promise.all(
            users.map(async (user) => {
                const oauth = linkedByUser.get(user.id);
                const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || null;
                const base = {
                    userId: user.id,
                    crmEmail: user.email,
                    userName: name,
                    gmailEmail: oauth?.email ?? null,
                    connectedAt: oauth?.updatedAt ?? null,
                    autoCreateEnabled: user.gmailAutoCreateEnabled,
                    autoCreateEnabledAt: user.gmailAutoCreateEnabledAt,
                };

                if (!verify) {
                    return { ...base, healthy: true, verified: false, error: null };
                }

                try {
                    const token = await mintGmailAccessToken(String(user.googleRefreshToken).trim());
                    if (!token) throw new Error('Google returned an empty access token');
                    return { ...base, healthy: true, verified: true, error: null };
                } catch (err: any) {
                    return {
                        ...base,
                        healthy: false,
                        verified: true,
                        error:
                            err?.response?.data?.error_description ||
                            err?.message ||
                            'Could not mint an access token from the stored refresh token',
                    };
                }
            }),
        );

        const healthy = mailboxes.filter((m) => m.healthy).length;
        const broken = mailboxes.length - healthy;

        res.status(200).json({
            success: true,
            data: {
                connected: mailboxes.length > 0 && broken === 0,
                // 'ok' = every mailbox verified; 'degraded' = some work, some do
                // not; 'broken' = tokens exist but none work; 'not_connected' =
                // nobody has ever connected Gmail on this book.
                status:
                    mailboxes.length === 0
                        ? 'not_connected'
                        : broken === 0
                          ? 'ok'
                          : healthy > 0
                            ? 'degraded'
                            : 'broken',
                mailboxCount: mailboxes.length,
                healthyCount: healthy,
                brokenCount: broken,
                verified: verify,
                checkedAt: new Date().toISOString(),
                mailboxes,
            },
        });
    } catch (error: any) {
        console.error('getGmailHealth:', error);
        res.status(500).json({
            success: false,
            message: error?.message || 'Failed to resolve Gmail health',
        });
    }
}

/**
 * Turn automatic deal creation from a mailbox's PDF emails on or off.
 * Switching on stamps `gmailAutoCreateEnabledAt`, and the cron only scans mail
 * received after that moment, so emails that arrived while it was off never
 * become deals.
 */
export async function setGmailAutoCreate(req: Request, res: Response): Promise<void> {
    try {
        const role = String(req.user?.role || '').toUpperCase();
        const isPrivileged =
            req.isSuperAdminProxy === true || role === 'SUPER_ADMIN' || role === 'ADMIN';
        if (!isPrivileged) {
            res.status(403).json({ success: false, message: 'Forbidden' });
            return;
        }

        const userId = String(req.params.userId || '').trim();
        const enabled = req.body?.enabled;
        if (!userId || typeof enabled !== 'boolean') {
            res.status(400).json({ success: false, message: 'userId and boolean "enabled" are required' });
            return;
        }

        const existing = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, gmailAutoCreateEnabled: true },
        });
        if (!existing) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        const updated =
            existing.gmailAutoCreateEnabled === enabled
                ? await prisma.user.findUniqueOrThrow({
                      where: { id: userId },
                      select: { id: true, gmailAutoCreateEnabled: true, gmailAutoCreateEnabledAt: true },
                  })
                : await prisma.user.update({
                      where: { id: userId },
                      data: enabled
                          ? { gmailAutoCreateEnabled: true, gmailAutoCreateEnabledAt: new Date() }
                          : { gmailAutoCreateEnabled: false },
                      select: { id: true, gmailAutoCreateEnabled: true, gmailAutoCreateEnabledAt: true },
                  });

        res.status(200).json({
            success: true,
            data: {
                userId: updated.id,
                autoCreateEnabled: updated.gmailAutoCreateEnabled,
                autoCreateEnabledAt: updated.gmailAutoCreateEnabledAt,
            },
        });
    } catch (error: any) {
        console.error('setGmailAutoCreate:', error);
        res.status(500).json({
            success: false,
            message: error?.message || 'Failed to update auto-create setting',
        });
    }
}
