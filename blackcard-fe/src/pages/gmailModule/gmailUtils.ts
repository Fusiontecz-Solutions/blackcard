import type { GmailSourceAttachmentRef } from '@/redux/actions/gmailActions';

export type GmailHeader = { name: string; value: string };

export const headerValue = (headers: GmailHeader[] | undefined, name: string): string => {
  if (!headers) return '';
  const lower = name.toLowerCase();
  return headers.find((h) => String(h?.name || '').toLowerCase() === lower)?.value || '';
};

export type EmailAddress = { name: string; email: string };

/** Split an RFC 5322 address list, respecting quoted display names. */
export const parseAddressList = (value: string): EmailAddress[] => {
  const raw = String(value || '');
  if (!raw.trim()) return [];
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let inAngle = false;
  for (const ch of raw) {
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

  return parts
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const angle = trimmed.match(/^(.*)<([^>]+)>\s*$/);
      if (angle) {
        return {
          name: angle[1].trim().replace(/^"|"$/g, '').trim(),
          email: angle[2].trim(),
        };
      }
      return { name: '', email: trimmed.replace(/^"|"$/g, '') };
    })
    .filter((a): a is EmailAddress => Boolean(a && a.email));
};

export const formatAddress = (a: EmailAddress) => (a.name ? `${a.name} <${a.email}>` : a.email);

export const displayName = (value: string): string => {
  const first = parseAddressList(value)[0];
  if (!first) return value || 'Unknown';
  return first.name || first.email;
};

const decodeBase64UrlUtf8 = (data: string): string => {
  try {
    let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
};

export const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const plainTextToHtml = (text: string) =>
  `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;

/** Strip styles/scripts so email CSS can't leak into the CRM shell. */
export const sanitizeEmailHtml = (rawHtml: string): string => {
  if (!rawHtml) return '';
  try {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    doc
      .querySelectorAll('style,script,link[rel="stylesheet"],meta,base,title,iframe,object,embed')
      .forEach((node) => node.remove());
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      }
      for (const attrName of ['href', 'src']) {
        const value = el.getAttribute(attrName);
        if (value && /^\s*javascript:/i.test(value)) el.removeAttribute(attrName);
      }
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return doc.body?.innerHTML || '';
  } catch {
    return rawHtml;
  }
};

/** HTML body of a Gmail message (falls back to text/plain). */
export const getMessageHtml = (payload: any): string => {
  let html = '';
  let text = '';
  const walk = (part: any) => {
    if (!part || (html && text)) return;
    const mime = String(part.mimeType || '').toLowerCase();
    const isAttachment = Boolean(part.filename);
    if (!isAttachment && part.body?.data) {
      if (mime === 'text/html' && !html) html = decodeBase64UrlUtf8(part.body.data);
      else if (mime === 'text/plain' && !text) text = decodeBase64UrlUtf8(part.body.data);
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };
  walk(payload);
  if (html) return sanitizeEmailHtml(html);
  if (text) return plainTextToHtml(text);
  return '';
};

export type MessageAttachment = {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
};

export const getMessageAttachments = (payload: any): MessageAttachment[] => {
  const out: MessageAttachment[] = [];
  const walk = (part: any) => {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      out.push({
        partId: String(part.partId ?? ''),
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: Number(part.body.size || 0),
        attachmentId: part.body.attachmentId,
      });
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };
  walk(payload);
  return out;
};

export const formatListDate = (internalDate?: number, dateHeader?: string): string => {
  const date = internalDate ? new Date(internalDate) : dateHeader ? new Date(dateHeader) : null;
  if (!date || Number.isNaN(date.getTime())) return dateHeader || '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
};

export const formatFullDate = (internalDate?: number, dateHeader?: string): string => {
  const date = internalDate ? new Date(Number(internalDate)) : dateHeader ? new Date(dateHeader) : null;
  if (!date || Number.isNaN(date.getTime())) return dateHeader || '';
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^;]*;base64,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';

export type ComposeSourceAttachment = MessageAttachment & { messageId: string };

export interface ComposeInitial {
  key: string;
  mode: ComposeMode;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  /** Editable HTML body. */
  bodyHtml: string;
  /** Quoted original (reply/forward), appended under the body when sending. */
  quotedHtml?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  draftId?: string;
  sourceAttachments?: ComposeSourceAttachment[];
}

export const groupSourceAttachments = (
  items: ComposeSourceAttachment[],
): GmailSourceAttachmentRef[] => {
  const byMessage = new Map<string, string[]>();
  items.forEach((a) => {
    if (!a.partId) return;
    byMessage.set(a.messageId, [...(byMessage.get(a.messageId) ?? []), a.partId]);
  });
  return Array.from(byMessage, ([messageId, partIds]) => ({ messageId, partIds }));
};

const prefixSubject = (subject: string, prefix: 'Re:' | 'Fwd:') => {
  const s = subject.trim();
  const pattern = prefix === 'Re:' ? /^re:/i : /^(fwd?|fw):/i;
  return pattern.test(s) ? s : `${prefix} ${s || '(no subject)'}`;
};

/** Build a reply / reply-all / forward from a full Gmail message resource. */
export const buildComposeFromMessage = (
  message: any,
  mode: 'reply' | 'replyAll' | 'forward',
  myEmail: string | null,
): ComposeInitial => {
  const headers: GmailHeader[] = message?.payload?.headers ?? [];
  const from = headerValue(headers, 'From');
  const replyTo = headerValue(headers, 'Reply-To');
  const to = headerValue(headers, 'To');
  const cc = headerValue(headers, 'Cc');
  const subject = headerValue(headers, 'Subject');
  const date = headerValue(headers, 'Date');
  const messageIdHeader = headerValue(headers, 'Message-ID') || headerValue(headers, 'Message-Id');
  const references = headerValue(headers, 'References');
  const originalHtml = getMessageHtml(message?.payload) || escapeHtml(message?.snippet || '');
  const me = String(myEmail || '').toLowerCase();
  const isMine = (a: EmailAddress) => me && a.email.toLowerCase() === me;
  const sentByMe = parseAddressList(from).some(isMine);

  const key = `${mode}-${message?.id}-${Date.now()}`;

  if (mode === 'forward') {
    const attachments = getMessageAttachments(message?.payload).map((a) => ({
      ...a,
      messageId: message.id,
    }));
    const forwardedHeader = [
      '---------- Forwarded message ---------',
      `From: ${escapeHtml(from)}`,
      `Date: ${escapeHtml(date)}`,
      `Subject: ${escapeHtml(subject)}`,
      `To: ${escapeHtml(to)}`,
      cc ? `Cc: ${escapeHtml(cc)}` : '',
    ]
      .filter(Boolean)
      .join('<br>');
    return {
      key,
      mode,
      to: '',
      cc: '',
      bcc: '',
      subject: prefixSubject(subject, 'Fwd:'),
      bodyHtml: '<br>',
      quotedHtml: `<div class="gmail_quote">${forwardedHeader}<br><br>${originalHtml}</div>`,
      sourceAttachments: attachments,
    };
  }

  // Replying to your own sent message goes back to its original recipients (Gmail behavior).
  const primary = sentByMe ? parseAddressList(to) : parseAddressList(replyTo || from);
  // Reply and Reply All both keep every other To/Cc participant — a CRM reply on a
  // multi-recipient thread must reach everyone, not just the sender.
  const seen = new Set(primary.map((a) => a.email.toLowerCase()));
  const ccList = [...(sentByMe ? [] : parseAddressList(to)), ...parseAddressList(cc)].filter((a) => {
    const key = a.email.toLowerCase();
    if (seen.has(key) || isMine(a)) return false;
    seen.add(key);
    return true;
  });

  const quoteHeader = `On ${escapeHtml(date)}, ${escapeHtml(from)} wrote:`;
  return {
    key,
    mode,
    to: primary.map(formatAddress).join(', '),
    cc: ccList.map(formatAddress).join(', '),
    bcc: '',
    subject: prefixSubject(subject, 'Re:'),
    bodyHtml: '<br>',
    quotedHtml: `<div class="gmail_quote">${quoteHeader}<br><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${originalHtml}</blockquote></div>`,
    threadId: message?.threadId,
    inReplyTo: messageIdHeader || undefined,
    references: [references, messageIdHeader].filter(Boolean).join(' ') || undefined,
  };
};

/** Re-open an existing Gmail draft in the composer. */
export const buildComposeFromDraft = (message: any, draftId: string): ComposeInitial => {
  const headers: GmailHeader[] = message?.payload?.headers ?? [];
  return {
    key: `draft-${draftId}-${Date.now()}`,
    mode: 'draft',
    to: headerValue(headers, 'To'),
    cc: headerValue(headers, 'Cc'),
    bcc: headerValue(headers, 'Bcc'),
    subject: headerValue(headers, 'Subject'),
    bodyHtml: getMessageHtml(message?.payload) || '<br>',
    threadId: message?.threadId,
    inReplyTo: headerValue(headers, 'In-Reply-To') || undefined,
    references: headerValue(headers, 'References') || undefined,
    draftId,
    sourceAttachments: getMessageAttachments(message?.payload).map((a) => ({
      ...a,
      messageId: message.id,
    })),
  };
};
