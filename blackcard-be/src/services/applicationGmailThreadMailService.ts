/**
 * Application submission-thread mail (Gmail API).
 * ----------------------------------------------------------------------------
 * When a deal was auto-created from an inbound Gmail message (`gmail-msg:…` on
 * Application.note), ISO-facing templates (decline / approval / offer-updated /
 * document-request) and scrubber→UW alerts should reply in that conversation.
 *
 * SendGrid cannot land inside the CRM mailbox thread. This helper:
 *   1. Resolves RFC In-Reply-To / References + Gmail threadId from the source
 *      message (and uses the *original* Subject with a Re: prefix).
 *   2. Sends via the connected mailbox's Gmail API (`messages.send`).
 *   3. Returns null when there is no Gmail source — callers fall back to SendGrid.
 */

import prisma from '../config/prismaClient';
import { getAccessTokenForRefreshToken } from '../config/gmail';
import { getMessageDetails, getGmailProfileEmail, sendEmail, extractGmailMessageBodyHtml, type GmailSendAttachment } from './gmail.service';
import {
    parseGmailMessageIdFromApplicationNote,
    parseGmailMessageIdFromClientNotes,
} from './pdfFileDedupeService';
import { getGoogleRefreshTokenForUser } from './googleToken.service';

export type ApplicationSubmissionMailSource = {
    note?: string | null;
    createdById?: string | null;
    client?: { notes?: string | null } | null;
};

export type ApplicationSubmissionThreadContext = {
    gmailMessageId: string;
    gmailThreadId?: string;
    inReplyTo: string;
    references: string;
    /** Subject for the reply — `Re: <original Gmail subject>` when available. */
    replySubject: string;
    originalSubject?: string;
    originalFrom?: string;
    /** Raw To / Cc from the inbound submission (for Reply All). */
    originalTo?: string;
    originalCc?: string;
    accessToken: string;
};

export type GmailThreadMailSendResult = {
    sent: true;
    via: 'gmail';
    gmailMessageId?: string;
    gmailThreadId?: string;
    subject: string;
};

function getHeaderValue(
    headers: Array<{ name?: string; value?: string }> | undefined,
    name: string,
): string {
    if (!Array.isArray(headers)) return '';
    const target = name.toLowerCase();
    return (
        headers.find((h) => String(h?.name || '').toLowerCase() === target)?.value?.trim() ||
        ''
    );
}

function ensureAngleBrackets(messageId: string): string {
    const trimmed = String(messageId || '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) return trimmed;
    const inner = trimmed.replace(/^<|>$/g, '');
    return inner ? `<${inner}>` : '';
}

export function buildReplySubject(originalOrFallback: string): string {
    const subject = String(originalOrFallback || '').trim() || 'Application update';
    if (/^re:\s/i.test(subject)) return subject;
    return `Re: ${subject}`;
}

/** Parse all email addresses from an RFC 5322 To/Cc/From header value. */
export function parseEmailAddressesFromHeader(raw: string): string[] {
    const value = String(raw || '').trim();
    if (!value) return [];
    const matches = value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const email of matches) {
        const trimmed = email.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(trimmed);
    }
    return out;
}

export function dedupeEmailRecipients(emails: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of emails) {
        const email = String(raw || '').trim();
        if (!email) continue;
        const key = email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(email);
    }
    return out;
}

/**
 * Reply All on the submission thread: original From/To/Cc participants plus any
 * extra recipients (ISO, UW). Everyone is placed in To (Gmail Reply All semantics).
 * The connected CRM mailbox is excluded so we do not email ourselves.
 */
export async function buildSubmissionThreadReplyAllRecipients(params: {
    thread: ApplicationSubmissionThreadContext;
    additionalEmails?: string[];
}): Promise<string[]> {
    const participants = dedupeEmailRecipients([
        ...parseEmailAddressesFromHeader(params.thread.originalFrom || ''),
        ...parseEmailAddressesFromHeader(params.thread.originalTo || ''),
        ...parseEmailAddressesFromHeader(params.thread.originalCc || ''),
        ...(params.additionalEmails || []),
    ]);

    const excludeLower = new Set<string>();
    const mailboxEmail = await getGmailProfileEmail(params.thread.accessToken);
    if (mailboxEmail) excludeLower.add(mailboxEmail.toLowerCase());

    for (const envKey of ['SENDGRID_FROM_EMAIL', 'SMTP_FROM', 'GMAIL_MAILBOX_EMAIL']) {
        const raw = String(process.env[envKey] || '').trim();
        if (!raw) continue;
        const match = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (match?.[0]) excludeLower.add(match[0].toLowerCase());
    }

    return participants.filter((email) => !excludeLower.has(email.toLowerCase()));
}

export type ForwardSubmissionMessageResult = {
    gmailMessageId: string;
    gmailThreadId?: string;
    inReplyTo: string;
    references: string;
    replySubject: string;
};

/**
 * Forward the inbound submission message to a recipient who was not on the original
 * thread (e.g. underwriter). Returns RFC headers for replying on the UW-side thread.
 */
export async function forwardSubmissionSourceMessage(params: {
    thread: ApplicationSubmissionThreadContext;
    to: string;
    attachments?: GmailSendAttachment[];
}): Promise<ForwardSubmissionMessageResult | null> {
    const to = String(params.to || '').trim();
    if (!to || !params.thread.gmailMessageId || !params.thread.accessToken) return null;

    try {
        const source = await getMessageDetails(params.thread.gmailMessageId, {
            accessToken: params.thread.accessToken,
        });
        const headers = source?.payload?.headers as
            | Array<{ name?: string; value?: string }>
            | undefined;
        const originalFrom = getHeaderValue(headers, 'From');
        const originalDate = getHeaderValue(headers, 'Date');
        const originalSubject =
            params.thread.originalSubject || getHeaderValue(headers, 'Subject') || 'Application';
        const originalBody = extractGmailMessageBodyHtml(source);
        const fwdSubject = /^fwd:\s/i.test(originalSubject)
            ? originalSubject
            : `Fwd: ${originalSubject}`;

        const forwardHtml = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;">
  <div style="margin:0 0 16px;padding:12px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;line-height:1.5;">
    ---------- Forwarded message ---------<br/>
    From: ${originalFrom.replace(/</g, '&lt;').replace(/>/g, '&gt;')}<br/>
    Date: ${originalDate.replace(/</g, '&lt;').replace(/>/g, '&gt;')}<br/>
    Subject: ${originalSubject.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
  </div>
  ${originalBody}
</body>
</html>`;

        const sent = await sendEmail({
            accessToken: params.thread.accessToken,
            to,
            subject: fwdSubject,
            body: forwardHtml,
            attachments: params.attachments?.length ? params.attachments : undefined,
        });

        const sentId = sent?.id ? String(sent.id) : '';
        if (!sentId) return null;

        const sentMessage = await getMessageDetails(sentId, {
            accessToken: params.thread.accessToken,
        });
        const sentHeaders = sentMessage?.payload?.headers as
            | Array<{ name?: string; value?: string }>
            | undefined;
        const rfcMessageId = ensureAngleBrackets(getHeaderValue(sentHeaders, 'Message-ID'));
        if (!rfcMessageId) return null;

        return {
            gmailMessageId: sentId,
            gmailThreadId: sentMessage?.threadId ? String(sentMessage.threadId) : undefined,
            inReplyTo: rfcMessageId,
            references: rfcMessageId,
            replySubject: buildReplySubject(fwdSubject),
        };
    } catch (error) {
        console.error('[app-gmail-thread] forward submission message failed:', error);
        return null;
    }
}

/** Send on a thread with explicit RFC / Gmail thread targets (UW-side reply after forward). */
export async function sendOnSubmissionThreadDirect(params: {
    thread: ApplicationSubmissionThreadContext;
    to: string | string[];
    html: string;
    inReplyTo: string;
    references: string;
    gmailThreadId?: string;
    subject?: string;
    attachments?: GmailSendAttachment[];
}): Promise<GmailThreadMailSendResult | null> {
    const toList = (Array.isArray(params.to) ? params.to : [params.to])
        .map((e) => String(e || '').trim())
        .filter(Boolean);
    if (!toList.length || !params.thread.accessToken) return null;

    const subject =
        String(params.subject || '').trim() || params.thread.replySubject;

    try {
        const result = await sendEmail({
            accessToken: params.thread.accessToken,
            to: toList.length === 1 ? toList[0] : toList,
            subject,
            body: params.html,
            threadId: params.gmailThreadId,
            inReplyTo: params.inReplyTo,
            references: params.references,
            attachments: params.attachments?.length ? params.attachments : undefined,
        });

        return {
            sent: true,
            via: 'gmail',
            gmailMessageId: result?.id ? String(result.id) : undefined,
            gmailThreadId: params.gmailThreadId,
            subject,
        };
    } catch (error) {
        console.error('[app-gmail-thread] direct thread send failed:', error);
        return null;
    }
}

function buildReferencesHeader(existingReferences: string, messageId: string): string {
    const mid = ensureAngleBrackets(messageId);
    if (!mid) return String(existingReferences || '').trim();
    const refs = String(existingReferences || '').trim();
    if (!refs) return mid;
    if (refs.includes(mid)) return refs;
    return `${refs} ${mid}`.trim();
}

export function resolveStoredGmailMessageId(application: ApplicationSubmissionMailSource): string | null {
    return (
        parseGmailMessageIdFromApplicationNote(application.note) ||
        parseGmailMessageIdFromClientNotes(application.client?.notes) ||
        null
    );
}

/** Keep `gmail-msg:…` on Application.note when later flows overwrite the note field. */
export function preserveGmailMessageNoteMarker(
    existingNote: string | null | undefined,
    nextNote: string,
): string {
    const next = String(nextNote || '').trim();
    const storedId = parseGmailMessageIdFromApplicationNote(existingNote);
    if (!storedId) return next;
    if (parseGmailMessageIdFromApplicationNote(next)) return next;
    const marker = `gmail-msg:${storedId}`;
    return next ? `${marker}\n${next}` : marker;
}

export async function resolveGmailAccessTokenForApplication(
    application: ApplicationSubmissionMailSource,
): Promise<string | null> {
    const createdById = application.createdById
        ? String(application.createdById).trim()
        : '';
    if (createdById) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: createdById },
                select: {
                    id: true,
                    email: true,
                    googleRefreshToken: true,
                    googleOAuths: { select: { refreshToken: true, email: true } },
                },
            });
            if (user) {
                const refreshToken = getGoogleRefreshTokenForUser(user);
                if (refreshToken) {
                    const token = await getAccessTokenForRefreshToken(
                        refreshToken,
                        createdById,
                    );
                    if (token) return token;
                }
            }
        } catch (error) {
            console.warn(
                '[app-gmail-thread] createdBy Gmail token failed; trying env fallback',
                createdById,
                error instanceof Error ? error.message : error,
            );
        }
    }

    const envRefreshToken = String(process.env.GOOGLE_REFRESH_TOKEN || '').trim();
    if (envRefreshToken) {
        try {
            const token = await getAccessTokenForRefreshToken(
                envRefreshToken,
                'env-gmail',
            );
            if (token) return token;
        } catch (error) {
            console.warn(
                '[app-gmail-thread] env GOOGLE_REFRESH_TOKEN failed',
                error instanceof Error ? error.message : error,
            );
        }
    }

    return null;
}

/**
 * Load Gmail + RFC headers for the inbound message that created the application.
 * `fallbackSubject` is used only when the source message has no Subject header.
 */
export async function resolveApplicationSubmissionThreadContext(
    application: ApplicationSubmissionMailSource,
    fallbackSubject: string,
): Promise<ApplicationSubmissionThreadContext | null> {
    const gmailMessageId = resolveStoredGmailMessageId(application);
    if (!gmailMessageId) return null;

    const accessToken = await resolveGmailAccessTokenForApplication(application);
    if (!accessToken) {
        console.warn(
            '[app-gmail-thread] No Gmail access token for source message',
            gmailMessageId,
        );
        return null;
    }

    try {
        const message = await getMessageDetails(gmailMessageId, { accessToken });
        const headers = message?.payload?.headers as
            | Array<{ name?: string; value?: string }>
            | undefined;
        const rfcMessageId = getHeaderValue(headers, 'Message-ID');
        if (!rfcMessageId) {
            console.warn(
                '[app-gmail-thread] Gmail message missing Message-ID header',
                gmailMessageId,
            );
            return null;
        }

        const inReplyTo = ensureAngleBrackets(rfcMessageId);
        const references = buildReferencesHeader(
            getHeaderValue(headers, 'References'),
            inReplyTo,
        );
        const originalSubject = getHeaderValue(headers, 'Subject');
        const originalFrom = getHeaderValue(headers, 'From');
        const originalTo = getHeaderValue(headers, 'To');
        const originalCc = getHeaderValue(headers, 'Cc');

        return {
            gmailMessageId,
            gmailThreadId: message?.threadId ? String(message.threadId) : undefined,
            inReplyTo,
            references,
            originalSubject: originalSubject || undefined,
            originalFrom: originalFrom || undefined,
            originalTo: originalTo || undefined,
            originalCc: originalCc || undefined,
            replySubject: buildReplySubject(originalSubject || fallbackSubject),
            accessToken,
        };
    } catch (error) {
        console.error(
            '[app-gmail-thread] Failed to load Gmail source message:',
            gmailMessageId,
            error,
        );
        return null;
    }
}

/**
 * @deprecated Prefer {@link resolveApplicationSubmissionThreadContext}.
 * Returns the same fields without `accessToken` for older callers.
 */
export async function resolveIsoSubmissionEmailThreadContext(
    application: ApplicationSubmissionMailSource,
    fallbackSubject: string,
): Promise<Omit<ApplicationSubmissionThreadContext, 'accessToken'> | null> {
    const ctx = await resolveApplicationSubmissionThreadContext(
        application,
        fallbackSubject,
    );
    if (!ctx) return null;
    const { accessToken: _ignored, ...rest } = ctx;
    return rest;
}

export type SendOnSubmissionThreadParams = {
    application?: ApplicationSubmissionMailSource | null;
    /** Pre-resolved context (avoids a second Gmail fetch). */
    thread?: ApplicationSubmissionThreadContext | null;
    to: string | string[];
    cc?: string | string[];
    html: string;
    /** Branded subject used only when the source message has no Subject. */
    fallbackSubject: string;
    /**
     * When true (default), use `Re: <original subject>`.
     * When false, send `fallbackSubject` but still attach threading headers / threadId.
     */
    useOriginalReplySubject?: boolean;
    /**
     * When true (default), Reply All: every From/To/Cc participant on the inbound
     * submission mail receives the message alongside `to`. Set false for internal
     * mails (UW alerts, scrubber corrections) that must not reach the thread's
     * external participants.
     */
    includeThreadParticipants?: boolean;
    attachments?: GmailSendAttachment[];
};

/**
 * Attempt Gmail API send on the submission thread.
 * @returns result when sent via Gmail; `null` when caller should use SendGrid/SMTP.
 */
export async function trySendOnApplicationSubmissionThread(
    params: SendOnSubmissionThreadParams,
): Promise<GmailThreadMailSendResult | null> {
    const disabled =
        String(process.env.APPLICATION_MAIL_USE_GMAIL_THREAD || 'true')
            .trim()
            .toLowerCase() === 'false';
    if (disabled) return null;

    let thread = params.thread ?? null;
    if ((!thread || !thread.accessToken) && params.application) {
        thread = await resolveApplicationSubmissionThreadContext(
            params.application,
            params.fallbackSubject,
        );
    }
    if (!thread?.accessToken || !thread.inReplyTo) return null;

    const toList = (Array.isArray(params.to) ? params.to : [params.to])
        .map((e) => String(e || '').trim())
        .filter(Boolean);
    if (!toList.length) return null;

    // Reply All: fan out to everyone on the inbound submission mail (From/To/Cc),
    // so a thread with several recipients keeps all of them on every CRM reply.
    let finalTo = toList;
    if (params.includeThreadParticipants !== false) {
        try {
            const all = await buildSubmissionThreadReplyAllRecipients({
                thread,
                additionalEmails: toList,
            });
            if (all.length) finalTo = all;
        } catch (error) {
            console.warn(
                '[app-gmail-thread] reply-all expansion failed; sending to caller recipients only:',
                error instanceof Error ? error.message : error,
            );
        }
    }

    const finalToLower = new Set(finalTo.map((e) => e.toLowerCase()));
    const ccList = (Array.isArray(params.cc) ? params.cc : params.cc ? [params.cc] : [])
        .map((e) => String(e || '').trim())
        .filter((e) => Boolean(e) && !finalToLower.has(e.toLowerCase()));

    const useOriginal = params.useOriginalReplySubject !== false;
    const subject = useOriginal
        ? thread.replySubject
        : String(params.fallbackSubject || '').trim() || thread.replySubject;

    try {
        const result = await sendEmail({
            accessToken: thread.accessToken,
            to: finalTo.length === 1 ? finalTo[0] : finalTo,
            cc: ccList.length ? ccList : undefined,
            subject,
            body: params.html,
            threadId: thread.gmailThreadId,
            inReplyTo: thread.inReplyTo,
            references: thread.references,
            attachments: params.attachments?.length ? params.attachments : undefined,
        });

        console.info('[app-gmail-thread] Sent via Gmail API', {
            to: finalTo,
            cc: ccList.length ? ccList : undefined,
            subject,
            gmailThreadId: thread.gmailThreadId,
            sourceMessageId: thread.gmailMessageId,
            sentId: result?.id,
            attachmentCount: params.attachments?.length ?? 0,
        });

        return {
            sent: true,
            via: 'gmail',
            gmailMessageId: result?.id ? String(result.id) : undefined,
            gmailThreadId: thread.gmailThreadId,
            subject,
        };
    } catch (error) {
        console.error(
            '[app-gmail-thread] Gmail API send failed; caller should fall back to SendGrid:',
            error,
        );
        return null;
    }
}

export type ApplicationSubmissionMailParticipants = {
    available: boolean;
    from: string[];
    cc: string[];
    to: string[];
    gmailMessageId?: string;
};

/** From / To / Cc on the inbound Gmail that created the deal (when `gmail-msg:` is present). */
export async function getApplicationSubmissionMailParticipants(
    application: ApplicationSubmissionMailSource | null | undefined,
): Promise<ApplicationSubmissionMailParticipants> {
    const empty: ApplicationSubmissionMailParticipants = {
        available: false,
        from: [],
        cc: [],
        to: [],
    };
    if (!application) return empty;

    const thread = await resolveApplicationSubmissionThreadContext(
        application,
        'Application',
    );
    if (!thread) return empty;

    return {
        available: true,
        from: parseEmailAddressesFromHeader(thread.originalFrom || ''),
        cc: parseEmailAddressesFromHeader(thread.originalCc || ''),
        to: parseEmailAddressesFromHeader(thread.originalTo || ''),
        gmailMessageId: thread.gmailMessageId,
    };
}
