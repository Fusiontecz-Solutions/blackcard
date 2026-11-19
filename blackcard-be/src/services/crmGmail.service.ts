import { google, gmail_v1 } from 'googleapis';
import { createOAuth2Client } from '../config/gmail';

function getGmailClient(refreshToken?: string) {
  const auth = createOAuth2Client();
  const token = refreshToken || process.env.GOOGLE_REFRESH_TOKEN;
  if (token) {
    auth.setCredentials({ refresh_token: token });
  }
  return google.gmail({ version: 'v1', auth });
}

export interface PdfAttachment {
  attachmentId: string;
  filename: string;
}

export async function fetchNewEmails(): Promise<gmail_v1.Schema$Message[]> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
  });
  return res.data.messages || [];
}

export async function getEmailDetails(messageId: string): Promise<gmail_v1.Schema$Message> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
  return res.data;
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  return Buffer.from(res.data.data!, 'base64');
}

export function extractPdfAttachments(email: gmail_v1.Schema$Message): PdfAttachment[] {
  const parts = email.payload?.parts || [];
  return parts
    .filter(part => part.filename && part.filename.endsWith('.pdf') && part.body?.attachmentId)
    .map(part => ({ attachmentId: part.body!.attachmentId!, filename: part.filename! }));
}

export async function markAsRead(messageId: string): Promise<void> {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}