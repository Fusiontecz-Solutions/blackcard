import type { Request, Response } from 'express';
import { getAccessTokenForRefreshToken, invalidateAccessTokenCache } from '../config/gmail';
import {
    findUserForGmailAccess,
    getGmailAccessTokenForUserId,
    getGoogleRefreshTokenForUser,
} from '../services/googleToken.service';
import { isGmailAuthError } from '../services/gmail.service';
import {
    GmailMailboxError,
    createLabel,
    deleteDraft,
    deleteLabel,
    downloadAttachmentById,
    findDraftIdByMessageId,
    getThread,
    listLabelsWithCounts,
    listMessages,
    modifyMessages,
    renameLabel,
    saveDraft,
    sendMailboxEmail,
    trashMessages,
    untrashMessages,
} from '../services/gmailMailbox.service';
import { recordCommunicationAudit } from '../services/systemActivityLogService';

const RECONNECT_MESSAGE =
    'Gmail connection expired or was revoked. Reconnect Google from the Gmail page.';

/**
 * Resolves the logged-in user's Gmail token server-side and retries once with a
 * freshly minted token on auth failure. Gmail auth errors are returned as 400 (not
 * 401) so the CRM session interceptor doesn't sign the user out of the CRM.
 */
async function withGmail(
    req: Request,
    res: Response,
    handler: (accessToken: string) => Promise<void>,
): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
    }

    let accessToken: string;
    try {
        const user = await findUserForGmailAccess({ authUserId: userId });
        const refreshToken = user ? getGoogleRefreshTokenForUser(user) : null;
        if (!refreshToken) {
            throw new Error('Gmail is not connected for this user. Connect Google from the Gmail page.');
        }
        // Shares the per-user access-token cache with the auto-create cron (keyed by user id).
        const token = await getAccessTokenForRefreshToken(refreshToken, userId);
        if (!token) throw new Error(RECONNECT_MESSAGE);
        accessToken = token;
    } catch (error: unknown) {
        res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : RECONNECT_MESSAGE,
        });
        return;
    }

    try {
        try {
            await handler(accessToken);
        } catch (error) {
            if (!isGmailAuthError(error)) throw error;
            invalidateAccessTokenCache(userId);
            await handler(await getGmailAccessTokenForUserId(userId));
        }
    } catch (error: any) {
        if (res.headersSent) return;
        if (error instanceof GmailMailboxError) {
            res.status(error.status).json({ success: false, message: error.message });
            return;
        }
        if (isGmailAuthError(error)) {
            res.status(400).json({ success: false, message: RECONNECT_MESSAGE });
            return;
        }
        const message =
            error?.response?.data?.error?.message || error?.message || 'Gmail request failed';
        const status = Number(error?.response?.status);
        console.error('[gmail-mailbox]', message);
        res.status(status === 404 ? 404 : 500).json({ success: false, message });
    }
}

const param = (req: Request, name: string) => String(req.params[name] || '').trim();

export const getLabels = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        res.json({ success: true, data: await listLabelsWithCounts(token) });
    });

export const postLabel = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        res.json({ success: true, data: await createLabel(token, req.body?.name) });
    });

export const patchLabel = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        res.json({ success: true, data: await renameLabel(token, param(req, 'labelId'), req.body?.name) });
    });

export const removeLabel = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        await deleteLabel(token, param(req, 'labelId'));
        res.json({ success: true });
    });

export const listMailbox = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        const { labelId, pageToken, limit, query } = req.body || {};
        const result = await listMessages(token, { labelId, pageToken, limit, query });
        res.json({
            success: true,
            data: result.messages,
            nextPageToken: result.nextPageToken,
            resultSizeEstimate: result.resultSizeEstimate,
            requestedPageToken: pageToken ? String(pageToken) : null,
        });
    });

export const getMailboxThread = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        res.json({ success: true, data: await getThread(token, param(req, 'threadId')) });
    });

export const modifyMailbox = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        const { ids, addLabelIds, removeLabelIds } = req.body || {};
        await modifyMessages(token, ids, addLabelIds, removeLabelIds);
        res.json({ success: true });
    });

export const trashMailbox = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        await trashMessages(token, req.body?.ids);
        res.json({ success: true });
    });

export const untrashMailbox = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        await untrashMessages(token, req.body?.ids);
        res.json({ success: true });
    });

export const getMailboxAttachment = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        const buffer = await downloadAttachmentById(
            token,
            param(req, 'messageId'),
            param(req, 'attachmentId'),
        );
        const filename = String(req.query.filename || 'attachment').replace(/[\r\n"]/g, '_');
        const mimeType = String(req.query.mimeType || 'application/octet-stream');
        res.setHeader('Content-Type', mimeType);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        );
        res.status(200).send(buffer);
    });

export const sendMailbox = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        const body = req.body || {};
        const result = await sendMailboxEmail(token, body);

        try {
            const recipient = [body.to, body.cc, body.bcc]
                .flat()
                .filter(Boolean)
                .join(', ');
            await recordCommunicationAudit(req, {
                applicationId: typeof body.applicationId === 'string' ? body.applicationId : null,
                channel: 'EMAIL',
                recipientType: 'OTHER',
                recipient,
                subject: body.subject || '',
                body: String(body.body ?? ''),
                actionDescription: `Email sent from Gmail to ${recipient}${body.subject ? `: ${body.subject}` : ''}`,
                metadata: {
                    via: 'gmail-page',
                    threadId: result?.threadId ?? body.threadId ?? null,
                    reply: Boolean(body.inReplyTo),
                },
            });
        } catch (auditErr) {
            console.error('[gmail-mailbox] audit log failed:', auditErr);
        }

        res.json({ success: true, message: 'Email sent', data: result });
    });

export const saveMailboxDraft = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        res.json({ success: true, data: await saveDraft(token, req.body || {}) });
    });

export const deleteMailboxDraft = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        await deleteDraft(token, param(req, 'draftId'));
        res.json({ success: true });
    });

export const findMailboxDraft = (req: Request, res: Response) =>
    withGmail(req, res, async (token) => {
        const draftId = await findDraftIdByMessageId(token, param(req, 'messageId'));
        res.json({ success: true, data: { draftId } });
    });
