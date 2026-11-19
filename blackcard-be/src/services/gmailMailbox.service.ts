import axios, { type AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { withMandatoryCc } from '../config/mandatoryCc';

/**
 * Gmail mailbox operations for the CRM Gmail page (labels, star, archive, trash,
 * threads, reply/forward, drafts). Every send here goes through the user's own
 * Gmail account — never SMTP — so messages land in Gmail "Sent" and in the thread.
 *
 * The PDF auto-create cron (gmail.service.ts) relies on the `in-crm` label to skip
 * already-ingested mail, so that label can't be renamed, deleted, or removed here.
 */

const GMAIL_BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_UPLOAD_BASE_URL = 'https://gmail.googleapis.com/upload/gmail/v1/users/me';

export const IN_CRM_LABEL_NAME = 'in-crm';

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const FETCH_CONCURRENCY = 8;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export class GmailMailboxError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

/* ================================
   Low-level helpers
================================ */

function paramsSerializer(params: Record<string, unknown>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)));
        else search.append(key, String(value));
    }
    return search.toString();
}

function isRetryableGmailError(error: unknown): boolean {
    const err = error as { response?: { status?: number; data?: { error?: { message?: string } } } };
    const status = err?.response?.status;
    const message = String(err?.response?.data?.error?.message || '').toLowerCase();
    return (
        status === 429 ||
        status === 503 ||
        message.includes('too many concurrent requests') ||
        message.includes('rate limit')
    );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function gmailRequest<T = any>(accessToken: string, config: AxiosRequestConfig): Promise<T> {
    let attempt = 0;
    for (;;) {
        try {
            const response = await axios.request<T>({
                ...config,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    ...(config.headers || {}),
                },
                paramsSerializer: { serialize: paramsSerializer as any },
            });
            return response.data;
        } catch (error) {
            if (!isRetryableGmailError(error) || attempt >= 3) throw error;
            attempt += 1;
            await sleep(250 * 2 ** attempt + Math.floor(Math.random() * 200));
        }
    }
}

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (items.length === 0) return [];
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await fn(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
}

function decodeBase64UrlToBuffer(data: string): Buffer {
    let base64 = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return Buffer.from(base64, 'base64');
}

function uniqueStrings(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    return Array.from(
        new Set(values.map((v) => String(v ?? '').trim()).filter((v) => v.length > 0)),
    );
}

/* ================================
   Labels
================================ */

export interface MailboxLabel {
    id: string;
    name: string;
    type: 'system' | 'user';
    messagesTotal: number;
    messagesUnread: number;
    threadsTotal: number;
    threadsUnread: number;
    color: { textColor?: string; backgroundColor?: string } | null;
    /** True for labels the CRM depends on (cannot be renamed/deleted/removed). */
    protected: boolean;
}

function isInCrmLabelName(name: unknown): boolean {
    return String(name || '').trim().toLowerCase() === IN_CRM_LABEL_NAME;
}

async function listRawLabels(accessToken: string): Promise<Array<{ id: string; name: string; type?: string }>> {
    const data = await gmailRequest<{ labels?: Array<{ id: string; name: string; type?: string }> }>(
        accessToken,
        { method: 'GET', url: `${GMAIL_BASE_URL}/labels` },
    );
    return data.labels ?? [];
}

export async function listLabelsWithCounts(accessToken: string): Promise<MailboxLabel[]> {
    const raw = await listRawLabels(accessToken);
    const detailed = await mapWithConcurrency(raw, FETCH_CONCURRENCY, async (label) => {
        try {
            return await gmailRequest<any>(accessToken, {
                method: 'GET',
                url: `${GMAIL_BASE_URL}/labels/${encodeURIComponent(label.id)}`,
            });
        } catch {
            return label;
        }
    });

    return detailed.map((label: any) => ({
        id: String(label.id),
        name: String(label.name || ''),
        type: label.type === 'system' ? 'system' : 'user',
        messagesTotal: Number(label.messagesTotal ?? 0),
        messagesUnread: Number(label.messagesUnread ?? 0),
        threadsTotal: Number(label.threadsTotal ?? 0),
        threadsUnread: Number(label.threadsUnread ?? 0),
        color: label.color ?? null,
        protected: isInCrmLabelName(label.name),
    }));
}

export async function resolveInCrmLabelIdForToken(accessToken: string): Promise<string | null> {
    const labels = await listRawLabels(accessToken);
    return labels.find((l) => isInCrmLabelName(l.name))?.id ?? null;
}

async function assertLabelIsEditable(accessToken: string, labelId: string): Promise<void> {
    const label = await gmailRequest<{ name?: string; type?: string }>(accessToken, {
        method: 'GET',
        url: `${GMAIL_BASE_URL}/labels/${encodeURIComponent(labelId)}`,
    });
    if (label.type === 'system') {
        throw new GmailMailboxError('System labels cannot be changed');
    }
    if (isInCrmLabelName(label.name)) {
        throw new GmailMailboxError(
            'The "in-crm" label is used by CRM auto-create and cannot be renamed or deleted',
        );
    }
}

function normalizeLabelName(name: unknown): string {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) throw new GmailMailboxError('Label name is required');
    if (trimmed.length > 225) throw new GmailMailboxError('Label name is too long');
    if (isInCrmLabelName(trimmed)) {
        throw new GmailMailboxError('"in-crm" is reserved for CRM auto-create');
    }
    return trimmed;
}

export async function createLabel(accessToken: string, name: unknown) {
    return gmailRequest(accessToken, {
        method: 'POST',
        url: `${GMAIL_BASE_URL}/labels`,
        data: {
            name: normalizeLabelName(name),
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
        },
    });
}

export async function renameLabel(accessToken: string, labelId: string, name: unknown) {
    await assertLabelIsEditable(accessToken, labelId);
    return gmailRequest(accessToken, {
        method: 'PATCH',
        url: `${GMAIL_BASE_URL}/labels/${encodeURIComponent(labelId)}`,
        data: { name: normalizeLabelName(name) },
    });
}

export async function deleteLabel(accessToken: string, labelId: string): Promise<void> {
    await assertLabelIsEditable(accessToken, labelId);
    await gmailRequest(accessToken, {
        method: 'DELETE',
        url: `${GMAIL_BASE_URL}/labels/${encodeURIComponent(labelId)}`,
    });
}

/* ================================
   Listing & threads
================================ */

export interface MailboxListItem {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    to: string;
    cc: string;
    date: string;
    internalDate: number;
    snippet: string;
    labelIds: string[];
    isRead: boolean;
    isStarred: boolean;
    hasAttachment: boolean;
    /** Every message id in the conversation (used for thread-wide actions). */
    messageIds: string[];
    messageCount: number;
    /** `From` header of each non-draft message, oldest first. */
    senders: string[];
    hasDraft: boolean;
}

/**
 * Conversation list (one row per thread, like Gmail). Each row represents the newest
 * message in the current view; `messageIds` covers the whole thread so actions
 * (archive, star, read, labels) apply to the conversation.
 */
export async function listMessages(
    accessToken: string,
    options: { labelId?: string; pageToken?: string; limit?: unknown; query?: string },
): Promise<{ messages: MailboxListItem[]; nextPageToken: string | null; resultSizeEstimate: number }> {
    const labelId = String(options.labelId || '').trim();
    const limitNum = Number(options.limit);
    const limit =
        Number.isFinite(limitNum) && limitNum > 0
            ? Math.min(Math.trunc(limitNum), LIST_MAX_LIMIT)
            : LIST_DEFAULT_LIMIT;
    const query = String(options.query || '').trim();
    const includeSpamTrash = labelId === 'TRASH' || labelId === 'SPAM';
    const viewLabel = labelId && labelId !== 'ALL' ? labelId : null;

    const list = await gmailRequest<{
        threads?: Array<{ id: string }>;
        nextPageToken?: string;
        resultSizeEstimate?: number;
    }>(accessToken, {
        method: 'GET',
        url: `${GMAIL_BASE_URL}/threads`,
        params: {
            maxResults: limit,
            pageToken: options.pageToken || undefined,
            q: query || undefined,
            labelIds: viewLabel ? [viewLabel] : undefined,
            includeSpamTrash: includeSpamTrash ? 'true' : undefined,
        },
    });

    const threads = await mapWithConcurrency(list.threads ?? [], FETCH_CONCURRENCY, async (item) => {
        const data = await gmailRequest<{ id: string; messages?: any[] }>(accessToken, {
            method: 'GET',
            url: `${GMAIL_BASE_URL}/threads/${encodeURIComponent(item.id)}`,
            params: {
                format: 'metadata',
                metadataHeaders: ['Subject', 'From', 'To', 'Cc', 'Date'],
            },
        });

        let all = (data.messages ?? []).slice();
        if (labelId !== 'TRASH') {
            all = all.filter((m) => !(m.labelIds ?? []).includes('TRASH'));
        }
        if (all.length === 0) return null;
        all.sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0));

        const inView = viewLabel ? all.filter((m) => (m.labelIds ?? []).includes(viewLabel)) : all;
        const latest = (inView.length > 0 ? inView : all)[(inView.length > 0 ? inView : all).length - 1];
        const headerOf = (message: any, name: string) =>
            ((message?.payload?.headers ?? []) as Array<{ name: string; value: string }>).find(
                (h) => String(h.name).toLowerCase() === name.toLowerCase(),
            )?.value || '';

        const labelIds = Array.from(new Set(all.flatMap((m) => (m.labelIds ?? []) as string[])));
        const nonDraft = all.filter((m) => !(m.labelIds ?? []).includes('DRAFT'));

        return {
            id: latest.id,
            threadId: data.id,
            subject: headerOf(all[0], 'Subject') || headerOf(latest, 'Subject'),
            from: headerOf(latest, 'From'),
            to: headerOf(latest, 'To'),
            cc: headerOf(latest, 'Cc'),
            date: headerOf(latest, 'Date'),
            internalDate: Number(latest.internalDate ?? 0),
            snippet: latest.snippet ?? '',
            labelIds,
            isRead: !all.some((m) => (m.labelIds ?? []).includes('UNREAD')),
            isStarred: labelIds.includes('STARRED'),
            hasAttachment: all.some((m) => /multipart\/mixed/i.test(String(m?.payload?.mimeType || ''))),
            messageIds: all.map((m) => String(m.id)),
            messageCount: nonDraft.length,
            senders: nonDraft.map((m) => headerOf(m, 'From')),
            hasDraft: all.some((m) => (m.labelIds ?? []).includes('DRAFT')),
        } satisfies MailboxListItem;
    });

    return {
        messages: threads.filter((t): t is NonNullable<typeof t> => t !== null),
        nextPageToken: list.nextPageToken ?? null,
        resultSizeEstimate: Number(list.resultSizeEstimate ?? 0),
    };
}

export async function getThread(accessToken: string, threadId: string) {
    const data = await gmailRequest<{ id: string; messages?: any[] }>(accessToken, {
        method: 'GET',
        url: `${GMAIL_BASE_URL}/threads/${encodeURIComponent(threadId)}`,
        params: { format: 'full' },
    });
    return { id: data.id, messages: data.messages ?? [] };
}

/* ================================
   Modify / trash
================================ */

export async function modifyMessages(
    accessToken: string,
    rawIds: unknown,
    rawAdd: unknown,
    rawRemove: unknown,
): Promise<void> {
    const ids = uniqueStrings(rawIds).slice(0, 1000);
    const addLabelIds = uniqueStrings(rawAdd);
    const removeLabelIds = uniqueStrings(rawRemove);

    if (ids.length === 0) throw new GmailMailboxError('At least one message id is required');
    if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
        throw new GmailMailboxError('Nothing to change');
    }

    if (removeLabelIds.some((id) => !/^[A-Z_]+$/.test(id))) {
        const inCrmId = await resolveInCrmLabelIdForToken(accessToken);
        if (inCrmId && removeLabelIds.includes(inCrmId)) {
            throw new GmailMailboxError(
                'The "in-crm" label is used by CRM auto-create and cannot be removed',
            );
        }
    }

    if (ids.length === 1) {
        await gmailRequest(accessToken, {
            method: 'POST',
            url: `${GMAIL_BASE_URL}/messages/${encodeURIComponent(ids[0]!)}/modify`,
            data: { addLabelIds, removeLabelIds },
        });
        return;
    }

    await gmailRequest(accessToken, {
        method: 'POST',
        url: `${GMAIL_BASE_URL}/messages/batchModify`,
        data: { ids, addLabelIds, removeLabelIds },
    });
}

async function forEachMessage(
    accessToken: string,
    rawIds: unknown,
    action: 'trash' | 'untrash',
): Promise<void> {
    const ids = uniqueStrings(rawIds).slice(0, 500);
    if (ids.length === 0) throw new GmailMailboxError('At least one message id is required');
    await mapWithConcurrency(ids, FETCH_CONCURRENCY, (id) =>
        gmailRequest(accessToken, {
            method: 'POST',
            url: `${GMAIL_BASE_URL}/messages/${encodeURIComponent(id)}/${action}`,
        }),
    );
}

export const trashMessages = (accessToken: string, ids: unknown) =>
    forEachMessage(accessToken, ids, 'trash');

export const untrashMessages = (accessToken: string, ids: unknown) =>
    forEachMessage(accessToken, ids, 'untrash');

/* ================================
   Attachments
================================ */

export async function downloadAttachmentById(
    accessToken: string,
    messageId: string,
    attachmentId: string,
): Promise<Buffer> {
    const data = await gmailRequest<{ data: string }>(accessToken, {
        method: 'GET',
        url: `${GMAIL_BASE_URL}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    });
    return decodeBase64UrlToBuffer(data.data);
}

export interface OutgoingAttachment {
    filename: string;
    contentType: string;
    content: Buffer;
}

/**
 * Gmail attachment ids change between fetches, so forwarded/draft attachments are
 * referenced by MIME `partId` (stable) and re-resolved here.
 */
async function loadSourceAttachments(
    accessToken: string,
    sources: unknown,
): Promise<OutgoingAttachment[]> {
    if (!Array.isArray(sources)) return [];
    const out: OutgoingAttachment[] = [];

    for (const source of sources) {
        const messageId = String((source as any)?.messageId || '').trim();
        const partIds = uniqueStrings((source as any)?.partIds);
        if (!messageId || partIds.length === 0) continue;

        const message = await gmailRequest<any>(accessToken, {
            method: 'GET',
            url: `${GMAIL_BASE_URL}/messages/${encodeURIComponent(messageId)}`,
            params: { format: 'full' },
        });

        const parts: any[] = [];
        const walk = (part: any) => {
            if (!part) return;
            if (part.partId != null && partIds.includes(String(part.partId)) && part.body?.attachmentId) {
                parts.push(part);
            }
            if (Array.isArray(part.parts)) part.parts.forEach(walk);
        };
        walk(message?.payload);

        for (const part of parts) {
            const content = await downloadAttachmentById(accessToken, messageId, part.body.attachmentId);
            out.push({
                filename: String(part.filename || 'attachment'),
                contentType: String(part.mimeType || 'application/octet-stream'),
                content,
            });
        }
    }
    return out;
}

function parseUploadedAttachments(raw: unknown): OutgoingAttachment[] {
    if (!Array.isArray(raw)) return [];
    const out: OutgoingAttachment[] = [];
    for (const item of raw as any[]) {
        const data = String(item?.data || '').replace(/^data:[^;]+;base64,/, '');
        if (!data) continue;
        const content: Buffer = Buffer.from(data, 'base64');
        if (content.length === 0) continue;
        out.push({
            filename: String(item?.filename || 'attachment').slice(0, 200),
            contentType: String(item?.contentType || 'application/octet-stream'),
            content,
        });
    }
    return out;
}

/* ================================
   MIME building
================================ */

export interface OutgoingEmailInput {
    to?: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    body?: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    attachments?: unknown;
    sourceAttachments?: unknown;
}

/** Split an address list on , / ; while respecting quoted display names and <angle-addr>. */
function splitAddressList(value: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let inAngle = false;
    for (const ch of value) {
        if (ch === '"') inQuotes = !inQuotes;
        if (!inQuotes && ch === '<') inAngle = true;
        if (!inQuotes && ch === '>') inAngle = false;
        if ((ch === ',' || ch === ';') && !inQuotes && !inAngle) {
            parts.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    parts.push(current);
    return parts.map((v) => v.trim()).filter(Boolean);
}

function joinAddresses(value: unknown): string {
    if (Array.isArray(value)) {
        return value.map((v) => String(v ?? '').trim()).filter(Boolean).join(', ');
    }
    return splitAddressList(String(value ?? '')).join(', ');
}

function stripHeaderValue(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeaderWord(value: string): string {
    const raw = stripHeaderValue(value);
    if (/^[\x20-\x7E]*$/.test(raw)) return raw;
    return `=?UTF-8?B?${Buffer.from(raw, 'utf8').toString('base64')}?=`;
}

function foldBase64(buffer: Buffer): string {
    return buffer.toString('base64').replace(/.{1,76}/g, (line) => `${line}\r\n`).trimEnd();
}

function htmlToPlainText(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function boundary(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function buildRawMime(input: OutgoingEmailInput, attachments: OutgoingAttachment[]): string {
    const to = joinAddresses(input.to);
    const cc = joinAddresses(input.cc);
    const bcc = joinAddresses(input.bcc);
    const html = String(input.body ?? '');

    const headers: string[] = [];
    if (to) headers.push(`To: ${stripHeaderValue(to)}`);
    if (cc) headers.push(`Cc: ${stripHeaderValue(cc)}`);
    if (bcc) headers.push(`Bcc: ${stripHeaderValue(bcc)}`);
    headers.push(`Subject: ${encodeHeaderWord(String(input.subject ?? ''))}`);
    if (input.inReplyTo) headers.push(`In-Reply-To: ${stripHeaderValue(input.inReplyTo)}`);
    if (input.references) headers.push(`References: ${stripHeaderValue(input.references)}`);
    headers.push('MIME-Version: 1.0');

    const altBoundary = boundary('alt');
    const alternative = [
        `--${altBoundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        foldBase64(Buffer.from(htmlToPlainText(html), 'utf8')),
        `--${altBoundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        foldBase64(Buffer.from(html, 'utf8')),
        `--${altBoundary}--`,
    ].join('\r\n');

    if (attachments.length === 0) {
        headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
        return `${headers.join('\r\n')}\r\n\r\n${alternative}\r\n`;
    }

    const mixedBoundary = boundary('mixed');
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    const parts = [
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
        alternative,
        ...attachments.flatMap((att) => {
            const filename = encodeHeaderWord(att.filename.replace(/"/g, ''));
            return [
                `--${mixedBoundary}`,
                `Content-Type: ${stripHeaderValue(att.contentType)}; name="${filename}"`,
                'Content-Transfer-Encoding: base64',
                `Content-Disposition: attachment; filename="${filename}"`,
                '',
                foldBase64(att.content),
            ];
        }),
        `--${mixedBoundary}--`,
    ];
    return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}\r\n`;
}

async function prepareRawMime(accessToken: string, input: OutgoingEmailInput): Promise<string> {
    const attachments = [
        ...parseUploadedAttachments(input.attachments),
        ...(await loadSourceAttachments(accessToken, input.sourceAttachments)),
    ];
    const totalBytes = attachments.reduce((sum, a) => sum + a.content.length, 0);
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new GmailMailboxError('Attachments exceed Gmail’s 25 MB limit');
    }
    return buildRawMime(input, attachments);
}

/** Gmail media upload (multipart/related) — supports messages up to 35 MB. */
async function uploadMime(
    accessToken: string,
    method: 'POST' | 'PUT',
    path: string,
    metadata: Record<string, unknown>,
    rawMime: string,
): Promise<any> {
    const b = boundary('upload');
    const body = [
        `--${b}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${b}`,
        'Content-Type: message/rfc822',
        '',
        rawMime,
        `--${b}--`,
        '',
    ].join('\r\n');

    return gmailRequest(accessToken, {
        method,
        url: `${GMAIL_UPLOAD_BASE_URL}${path}`,
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary=${b}` },
        data: body,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });
}

function hasAnyRecipient(input: OutgoingEmailInput): boolean {
    return Boolean(joinAddresses(input.to) || joinAddresses(input.cc) || joinAddresses(input.bcc));
}

/* ================================
   Send & drafts
================================ */

export async function sendMailboxEmail(
    accessToken: string,
    input: OutgoingEmailInput & { draftId?: string },
): Promise<any> {
    if (!hasAnyRecipient(input)) throw new GmailMailboxError('Add at least one recipient');
    // Mail sent from the CRM mailbox copies the always-cc address (config/mandatoryCc).
    input = { ...input, cc: withMandatoryCc(input.cc, input.to, input.bcc) };
    const rawMime = await prepareRawMime(accessToken, input);
    const threadId = String(input.threadId || '').trim() || undefined;
    const draftId = String(input.draftId || '').trim();

    if (draftId) {
        await uploadMime(accessToken, 'PUT', `/drafts/${encodeURIComponent(draftId)}`, {
            id: draftId,
            message: threadId ? { threadId } : {},
        }, rawMime);
        return gmailRequest(accessToken, {
            method: 'POST',
            url: `${GMAIL_BASE_URL}/drafts/send`,
            data: { id: draftId },
        });
    }

    return uploadMime(accessToken, 'POST', '/messages/send', threadId ? { threadId } : {}, rawMime);
}

export async function saveDraft(
    accessToken: string,
    input: OutgoingEmailInput & { draftId?: string },
): Promise<{ id: string; message?: { id: string; threadId: string } }> {
    const rawMime = await prepareRawMime(accessToken, input);
    const threadId = String(input.threadId || '').trim() || undefined;
    const draftId = String(input.draftId || '').trim();
    const message = threadId ? { threadId } : {};

    if (draftId) {
        return uploadMime(accessToken, 'PUT', `/drafts/${encodeURIComponent(draftId)}`, {
            id: draftId,
            message,
        }, rawMime);
    }
    return uploadMime(accessToken, 'POST', '/drafts', { message }, rawMime);
}

export async function deleteDraft(accessToken: string, draftId: string): Promise<void> {
    await gmailRequest(accessToken, {
        method: 'DELETE',
        url: `${GMAIL_BASE_URL}/drafts/${encodeURIComponent(draftId)}`,
    });
}

export async function findDraftIdByMessageId(
    accessToken: string,
    messageId: string,
): Promise<string | null> {
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page += 1) {
        const data = await gmailRequest<{
            drafts?: Array<{ id: string; message?: { id: string } }>;
            nextPageToken?: string;
        }>(accessToken, {
            method: 'GET',
            url: `${GMAIL_BASE_URL}/drafts`,
            params: { maxResults: 500, pageToken },
        });
        const match = data.drafts?.find((d) => d.message?.id === messageId);
        if (match) return match.id;
        if (!data.nextPageToken) return null;
        pageToken = data.nextPageToken;
    }
    return null;
}
