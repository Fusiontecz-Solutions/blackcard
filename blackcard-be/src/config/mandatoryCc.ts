/**
 * Blackcard copies one address on every outbound email (deal mails, ISO mails,
 * payment mails, reports, Gmail compose/replies sent through the CRM).
 *
 * Override with MAIL_ALWAYS_CC (comma-separated); set it to "none" to turn the
 * copy off. Mails that carry a login / reset code or a temporary password pass
 * `skipMandatoryCc` so those credentials are never copied to anyone.
 *
 * The copy is a removable default: when a user removes the chip in a mail popup,
 * the request carries `x-default-cc-removed` and mails sent while handling that
 * request leave the address off (see runWithDefaultCcRemoved).
 */
import { AsyncLocalStorage } from 'async_hooks';
const DEFAULT_ALWAYS_CC = 'Mark@blackcardfunding.com';

const EMAIL_IN_TEXT = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function getMandatoryCcEmails(): string[] {
    const raw = process.env.MAIL_ALWAYS_CC;
    if (raw != null && raw.trim().toLowerCase() === 'none') return [];
    const source = raw != null && raw.trim() ? raw : DEFAULT_ALWAYS_CC;
    return source.match(EMAIL_IN_TEXT) ?? [];
}

const removedDefaultCc = new AsyncLocalStorage<Set<string>>();

/** Run `fn` with these default Cc addresses opted out (lower-cased). */
export function runWithDefaultCcRemoved<T>(emails: string[], fn: () => T): T {
    return removedDefaultCc.run(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)), fn);
}

/** True when the user removed this default Cc for the current request. */
export function isDefaultCcRemoved(email: string): boolean {
    return removedDefaultCc.getStore()?.has(String(email).trim().toLowerCase()) ?? false;
}

type RecipientValue = unknown;

/** Every address in a to / cc / bcc value: strings ("a, Name <b>"), arrays, or { address } objects. */
function addressesIn(value: RecipientValue): string[] {
    if (value == null) return [];
    if (Array.isArray(value)) return value.flatMap(addressesIn);
    if (typeof value === 'object') {
        const address = (value as { address?: unknown }).address;
        return typeof address === 'string' ? address.match(EMAIL_IN_TEXT) ?? [] : [];
    }
    return String(value).match(EMAIL_IN_TEXT) ?? [];
}

/**
 * The cc value with the mandatory addresses appended — skipping any already
 * among the to / cc / bcc recipients. Returns `cc` untouched when there is
 * nothing to add, so callers' existing values and types are preserved.
 */
export function withMandatoryCc(
    cc: string | string[] | undefined,
    ...otherRecipients: RecipientValue[]
): string | string[] | undefined {
    const present = new Set(
        [cc, ...otherRecipients].flatMap(addressesIn).map((e) => e.toLowerCase()),
    );
    const missing = getMandatoryCcEmails().filter(
        (e) => !present.has(e.toLowerCase()) && !isDefaultCcRemoved(e),
    );
    if (missing.length === 0) return cc;

    const existing = cc == null ? [] : Array.isArray(cc) ? cc : cc.trim() ? [cc] : [];
    return [...existing, ...missing];
}

/** Array form for e-sign CC lists (BoldSign / DocuSign envelopes): `list` plus the mandatory addresses. */
export function withMandatoryCcList(list?: string[] | null): string[] {
    const merged = withMandatoryCc(list ?? undefined);
    return merged == null ? [] : Array.isArray(merged) ? merged : [merged];
}
