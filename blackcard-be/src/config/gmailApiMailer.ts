import axios from 'axios';
import MailComposer from 'nodemailer/lib/mail-composer';
import type Mail from 'nodemailer/lib/mailer';
import { getAccessTokenForRefreshToken, invalidateAccessTokenCache } from './gmail';
import {
    findUserForGmailAccess,
    getGoogleRefreshTokenForUser,
} from '../services/googleToken.service';

/**
 * Server-wide outbound mail via the Gmail API (`users.messages.send`).
 *
 * The sending mailbox is `GMAIL_SENDER_EMAIL`. Its OAuth refresh token comes from
 * `GMAIL_SENDER_REFRESH_TOKEN`, or — when unset — from the CRM user with that email
 * who connected Google on the Gmail page (scope `gmail.send` is already requested).
 *
 * Gmail sends From the authenticated mailbox (or a verified "Send mail as" alias),
 * so the From address is always the sender mailbox; only the display name varies.
 * Gmail has no delivery/open/click webhooks, so Mail Log rows stay at "sent".
 */

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const ACCESS_TOKEN_CACHE_KEY = 'server-mailer';

export function getGmailSenderEmail(): string | undefined {
    return process.env.GMAIL_SENDER_EMAIL?.trim() || undefined;
}

export function isGmailApiMailerConfigured(): boolean {
    return Boolean(
        getGmailSenderEmail() &&
            process.env.GOOGLE_CLIENT_ID?.trim() &&
            process.env.GOOGLE_CLIENT_SECRET?.trim(),
    );
}

async function resolveSenderRefreshToken(senderEmail: string): Promise<string> {
    const fromEnv = process.env.GMAIL_SENDER_REFRESH_TOKEN?.trim();
    if (fromEnv) return fromEnv;

    const user = await findUserForGmailAccess({ email: senderEmail });
    const fromDb = user ? getGoogleRefreshTokenForUser(user) : null;
    if (!fromDb) {
        throw new Error(
            `Gmail sender ${senderEmail} is not connected. Sign in to the CRM as ${senderEmail} and connect Google on the Gmail page, or set GMAIL_SENDER_REFRESH_TOKEN.`,
        );
    }
    return fromDb;
}

async function getSenderAccessToken(senderEmail: string): Promise<string> {
    const refreshToken = await resolveSenderRefreshToken(senderEmail);
    const token = await getAccessTokenForRefreshToken(refreshToken, ACCESS_TOKEN_CACHE_KEY);
    if (!token) {
        throw new Error(`Could not mint a Gmail access token for ${senderEmail}`);
    }
    return token;
}

function toBase64Url(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type GmailApiSendResult = {
    gmailMessageId?: string;
    gmailThreadId?: string;
    accepted: string[];
    rejected: string[];
};

function listAddresses(value: Mail.Options['to']): string[] {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return list
        .map((entry) => (typeof entry === 'string' ? entry : entry?.address || ''))
        .map((entry) => String(entry).trim())
        .filter(Boolean);
}

/**
 * Send a fully composed message (nodemailer `Mail.Options`: html, cc, bcc,
 * attachments incl. inline `cid`, custom headers) through the Gmail API.
 */
export async function sendViaGmailApi(
    mail: Omit<Mail.Options, 'from'> & { fromName?: string },
): Promise<GmailApiSendResult> {
    const senderEmail = getGmailSenderEmail();
    if (!senderEmail) {
        throw new Error('Gmail API mailer is not configured. Set GMAIL_SENDER_EMAIL.');
    }

    const { fromName, ...rest } = mail;
    const raw = await new MailComposer({
        ...rest,
        from: fromName ? { name: fromName, address: senderEmail } : senderEmail,
    })
        .compile()
        .build();

    const post = (accessToken: string) =>
        axios.post(
            GMAIL_SEND_URL,
            { raw: toBase64Url(raw) },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                maxBodyLength: Infinity,
            },
        );

    let response;
    try {
        response = await post(await getSenderAccessToken(senderEmail));
    } catch (error: any) {
        if (error?.response?.status === 401) {
            invalidateAccessTokenCache(ACCESS_TOKEN_CACHE_KEY);
            response = await post(await getSenderAccessToken(senderEmail));
        } else {
            throw new Error(
                `Gmail API send failed: ${error?.response?.data?.error?.message || error?.message || error}`,
            );
        }
    }

    return {
        gmailMessageId: response.data?.id ? String(response.data.id) : undefined,
        gmailThreadId: response.data?.threadId ? String(response.data.threadId) : undefined,
        accepted: [...listAddresses(mail.to), ...listAddresses(mail.cc), ...listAddresses(mail.bcc)],
        rejected: [],
    };
}
