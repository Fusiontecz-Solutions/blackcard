import { BRAND_DISPLAY_NAME } from './brand';

/** Canonical sender / header brand for all outbound CRM email. */
export const EMAIL_BRAND_DISPLAY_NAME = BRAND_DISPLAY_NAME;

const LEGACY_MAIL_FROM_NAMES = new Set([
    'crm',
    'in-house crm',
    'ih crm',
    'in house crm',
    'katan capital llc',
    'katan capital',
    'woodmere financial',
    'woodmere',
    'hardrock',
    'hard rock',
    'landova',
    'ocean preferred',
]);

/**
 * Resolves the display name for email From headers and HTML text fallbacks.
 */
export function resolveEmailBrandDisplayName(): string {
    const raw =
        process.env.MAIL_FROM_NAME?.trim() ||
        process.env.SENDGRID_FROM_NAME?.trim() ||
        '';
    if (raw && !LEGACY_MAIL_FROM_NAMES.has(raw.toLowerCase())) {
        return raw;
    }
    return EMAIL_BRAND_DISPLAY_NAME;
}
