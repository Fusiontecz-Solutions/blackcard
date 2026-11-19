/**
 * Decide whether Gmail auto-create should skip a message before OCR / app create.
 *
 * Product rules:
 * - Skip emails with fewer than 2 PDF attachments (lone bank statement / lone certificate).
 * - Skip DocuSign completion mail: the From address is @docusign.net or the
 *   subject starts with "Completed:". A PDF named "…DocuSign…" is not enough —
 *   ISOs submit DocuSign-signed applications that must become deals.
 * - Skip mail sent by the connected mailbox itself (From = the mailbox, e.g.
 *   subs@). An ISO putting its own address in To: is still a submission.
 * - Skip the CRM's own templates (scrubber recommend, approval, decline, offer
 *   updated, correction) — the CRM mails the submissions inbox with the deal's
 *   PDFs, and those must never come back in as new deals.
 *
 * Genuine ISO submissions are typically application + bank statement(s) (≥2 PDFs).
 */
export type GmailAutoCreateSkipDecision =
  | {
      skip: true;
      reason: 'single_attachment' | 'docusign_or_esign' | 'self_sent' | 'crm_template';
      detail: string;
    }
  | { skip: false };

/** DocuSign's own notification sender. */
const ESIGN_SENDER_RE = /@docusign\.net$/i;

/** DocuSign completion subject, e.g. "Completed: BLACKCARD FUNDING LLC: …". */
const ESIGN_SUBJECT_RE = /^completed:/i;

/** Wording that only appears in the CRM's own outbound templates. */
const CRM_TEMPLATE_BODY_RE =
  /complete your underwriting decision in the CRM|the scrubber team has (?:completed|corrected)|pending underwriting review|has been pre-approved by|has been approved by|calculate your approval|we are unable to approve it at this time|offer\s*(?:<[^>]*>\s*)*updated|correction required/i;

/**
 * Markers where quoted history begins. Everything from the earliest match on is
 * dropped. Order does not matter — the earliest index wins.
 */
const QUOTE_START_RES: RegExp[] = [
  /<div[^>]*\bclass\s*=\s*["']?[^"'>]*\bgmail_quote\b/i,
  /<div[^>]*\bid\s*=\s*["']?divRplyFwdMsg\b/i,
  /<hr[^>]*\bid\s*=\s*["']?stopSpelling\b/i,
  /-{2,}\s*Original Message\s*-{2,}/i,
  /-{2,}\s*Forwarded message\s*-{2,}/i,
  /\bBegin forwarded message:/i,
  // Outlook header block: "From: … Sent: …" (or "Date:") within a few lines.
  /(?:^|[\n>])[ \t]*(?:<[^>]+>[ \t]*)*(?:\*\s*)?From:(?:\s*\*)?[^\n]{0,300}(?:\n|<br\s*\/?>|<\/?[a-z][^>]*>|\s){1,40}?(?:<[^>]+>[ \t]*)*(?:\*\s*)?(?:Sent|Date):/i,
  // Apple / Gmail plain: "On <date>, <name> wrote:" (may wrap across a line / <br>).
  /\bOn\s(?:[^<>\n]|<[^>]+>|\n(?![ \t]*\n)){4,300}?\bwrote:/i,
];

/**
 * Return only the newest part of an email body (HTML or text): quoted reply
 * history, Outlook header blocks, forwarded sections, `<blockquote>` blocks and
 * plain-text `>` lines are removed.
 */
export function extractNewestReplyPart(body: string | null | undefined): string {
  let text = String(body || '');
  if (!text) return '';

  let cut = text.length;
  for (const re of QUOTE_START_RES) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  text = text.slice(0, cut);

  // Remove <blockquote> blocks innermost-first; an unclosed one cuts the rest.
  const innerBlockquote = /<blockquote\b[^>]*>(?:(?!<blockquote\b)[\s\S])*?<\/blockquote\s*>/gi;
  let prev: string;
  do {
    prev = text;
    text = text.replace(innerBlockquote, '');
  } while (text !== prev);
  const openIdx = text.search(/<blockquote\b/i);
  if (openIdx >= 0) text = text.slice(0, openIdx);

  // Plain-text quoted lines ("> …" or "&gt; …").
  text = text.replace(/^[ \t]*(?:>|&gt;)(?:[ \t>]|&gt;|$).*$/gim, '');

  return text;
}

export function evaluateGmailAutoCreateSkip(params: {
  subject?: string | null;
  fromHeader?: string | null;
  senderEmails?: string[] | null;
  pdfFilenames?: string[] | null;
  pdfCount: number;
  /** Address in the From header. */
  fromEmail?: string | null;
  /** The connected mailbox being scanned (e.g. subs@…). */
  mailboxEmail?: string | null;
  /** HTML or text body of the message. */
  bodyText?: string | null;
}): GmailAutoCreateSkipDecision {
  const fromEmail = String(params.fromEmail || '').trim().toLowerCase();
  const mailbox = String(params.mailboxEmail || '').trim().toLowerCase();
  if (fromEmail && mailbox && fromEmail === mailbox) {
    return { skip: true, reason: 'self_sent', detail: `sender ${fromEmail} is the receiving mailbox` };
  }

  // Only the newest part of a reply counts — an ISO replying above a quoted CRM
  // decline/approval is a genuine submission, not the CRM's own template.
  const templateMatch = CRM_TEMPLATE_BODY_RE.exec(extractNewestReplyPart(params.bodyText));
  if (templateMatch) {
    return {
      skip: true,
      reason: 'crm_template',
      detail: `body matched CRM template ("${templateMatch[0].slice(0, 60)}")`,
    };
  }

  const subject = String(params.subject || '').trim();
  const pdfCount = Number(params.pdfCount) || 0;

  if (ESIGN_SENDER_RE.test(fromEmail) || ESIGN_SUBJECT_RE.test(subject)) {
    return {
      skip: true,
      reason: 'docusign_or_esign',
      detail: `DocuSign notification (from ${fromEmail || 'unknown'}, pdfs=${pdfCount})`,
    };
  }

  if (pdfCount < 2) {
    return {
      skip: true,
      reason: 'single_attachment',
      detail: `pdfCount=${pdfCount} (need ≥2 PDFs for auto-create)`,
    };
  }

  return { skip: false };
}
