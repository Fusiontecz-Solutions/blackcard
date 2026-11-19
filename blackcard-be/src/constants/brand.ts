import fs from 'fs';
import path from 'path';

function envTrim(key: string): string {
    return String(process.env[key] || '').trim();
}

/** Display name used in transactional email copy (matches outbound mail From name). */
export const BRAND_DISPLAY_NAME = envTrim('APP_COMPANY_NAME') || 'Black Card';

/** Legal entity name for letters and wire copy. */
export const BRAND_LEGAL_NAME = envTrim('APP_COMPANY_LEGAL_NAME') || 'Black Card LLC';

/** Hosted logo URL (light / default). Set APP_LOGO_URL in .env. */
export const BRAND_LOGO_URL = envTrim('APP_LOGO_URL') || envTrim('APP_LOGO_DARK_URL');

/** Hosted logo URL for dark backgrounds. */
export const BRAND_LOGO_DARK_URL = envTrim('APP_LOGO_DARK_URL') || BRAND_LOGO_URL;

const PLATFORM_BRAND_ALIASES = new Set([
    'woodmere financial',
    'woodmere',
    'black card',
    'black card llc',
    'blackcard',
    'black card financial',
    'black rok',
    'black rok llc',
    'blackrok',
    'black rok financial',
    'blackrock',
    'black rock',
    'black rock llc',
]);

function normalizeBrandToken(value?: string | null): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s._-]+/g, ' ');
}

/** True for the platform lender (legacy Woodmere names still match after rebrand). */
export function isPlatformBrandName(value?: string | null): boolean {
    const token = normalizeBrandToken(value);
    if (!token || token.includes('texas')) return false;
    const compact = token.replace(/\s+/g, '');
    return (
        PLATFORM_BRAND_ALIASES.has(token) ||
        token.includes('woodmere') ||
        token.includes('black card') ||
        token.includes('black rok') ||
        compact.includes('blackcard') ||
        compact.includes('blackrok') ||
        compact.includes('blackrock')
    );
}

export function platformBrandAliasesEquivalent(
    left?: string | null,
    right?: string | null,
): boolean {
    const a = normalizeBrandToken(left);
    const b = normalizeBrandToken(right);
    if (!a || !b) return false;
    return isPlatformBrandName(a) && isPlatformBrandName(b);
}

const LEGACY_BRAND_PATTERN =
    /\b(katan(?:\s*(?:ii|iii|2|3|capital(?:\s+llc)?)?)?|woodmere(?:\s+(?:financial|capital|llc))?|hard\s*rock|hardrock|landova|ocean\s+preferred|black\s*rok(?:\s+(?:llc|financial))?)\b/gi;

export function looksLikeLegacyBrandLabel(value?: string | null): boolean {
    LEGACY_BRAND_PATTERN.lastIndex = 0;
    return LEGACY_BRAND_PATTERN.test(String(value ?? ''));
}

export function replaceLegacyBrandInDisplayName(
    value?: string | null,
    fallback = `${BRAND_DISPLAY_NAME} Contract.pdf`,
): string {
    const raw = String(value ?? '').trim();
    if (!raw) return fallback;
    LEGACY_BRAND_PATTERN.lastIndex = 0;
    if (!LEGACY_BRAND_PATTERN.test(raw)) return raw;
    LEGACY_BRAND_PATTERN.lastIndex = 0;
    const next = raw
        .replace(LEGACY_BRAND_PATTERN, BRAND_DISPLAY_NAME)
        .replace(/\s{2,}/g, ' ')
        .trim();
    return next || fallback;
}

/**
 * Inline brand logos used inside transactional email templates.
 * Files live under `<project-root>/public/` (NOT in `src/`) so they survive
 * the `tsc` build (`rootDir: ./src` would otherwise strip non-`.ts` files).
 */
const BRAND_ASSETS_DIR = path.resolve(__dirname, '..', '..', 'public');
const BRAND_LIGHT_LOGO_PATH = path.join(BRAND_ASSETS_DIR, 'woodmere_transparent.png');
const BRAND_DARK_LOGO_PATH = path.join(BRAND_ASSETS_DIR, 'woodmere_dark_theme_logo.png');

const BRAND_LIGHT_LOGO_CID = 'brand-logo-light@finexusai';
const BRAND_DARK_LOGO_CID = 'brand-logo-dark@finexusai';

/**
 * Inline attachments (Content-ID) for the brand logo. Skipped when APP_LOGO_URL
 * is set — emails then use the hosted URL directly.
 */
export function buildBrandLogoAttachments(): Array<{
    filename: false;
    path: string;
    cid: string;
    contentType: string;
    contentDisposition: 'inline';
}> {
    if (BRAND_LOGO_URL) return [];

    const candidates = [
        {
            filename: false as const,
            path: BRAND_LIGHT_LOGO_PATH,
            cid: BRAND_LIGHT_LOGO_CID,
            contentType: 'image/png',
            contentDisposition: 'inline' as const,
        },
        {
            filename: false as const,
            path: BRAND_DARK_LOGO_PATH,
            cid: BRAND_DARK_LOGO_CID,
            contentType: 'image/png',
            contentDisposition: 'inline' as const,
        },
    ];

    const existing = candidates.filter((attachment) => fs.existsSync(attachment.path));
    if (existing.length < candidates.length) {
        const missing = candidates
            .filter((attachment) => !fs.existsSync(attachment.path))
            .map((attachment) => attachment.path);
        console.warn('[email] Brand logo files missing; sending without inline logos:', missing);
    }

    return existing;
}

/**
 * Theme-aware brand header (`<tr>` row) used at the top of every
 * transactional email.
 */
export function buildBrandHeaderRowHtml(): string {
    if (BRAND_LOGO_URL) {
        const src = BRAND_LOGO_URL.replace(/"/g, '&quot;');
        return `
                    <tr>
                        <td align="center" style="padding: 6px 16px 0; line-height: 0; font-size: 0;">
                            <img src="${src}"
                                 alt="${BRAND_DISPLAY_NAME.replace(/"/g, '&quot;')}"
                                 width="180"
                                 border="0"
                                 style="display:block; margin: 0 auto; width:180px; height:auto; border:0; outline:none;" />
                        </td>
                    </tr>`;
    }

    return `
                    <tr>
                        <td align="center" style="padding: 6px 16px 0; line-height: 0; font-size: 0;">
                            <!--[if !mso]><!-->
                            <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                                <tr>
                                    <td align="center" style="padding:0; line-height:0; font-size:0;">
                            <div class="brand-logo-bg-light brand-logo-bg-slot"
                                 role="presentation"
                                 aria-hidden="true"
                                 style="display:inline-block; margin:0; padding:0; vertical-align:top;
                                        width:180px; height:78px;
                                        background-image:url('cid:${BRAND_LIGHT_LOGO_CID}');
                                        background-position:center center;
                                        background-repeat:no-repeat;
                                        background-size:contain;"></div>
                            <div class="brand-logo-bg-dark brand-logo-bg-slot"
                                 role="presentation"
                                 aria-hidden="true"
                                 style="display:inline-block; margin:0; padding:0; vertical-align:top;
                                        width:180px; height:78px;
                                        background-image:url('cid:${BRAND_DARK_LOGO_CID}');
                                        background-position:center center;
                                        background-repeat:no-repeat;
                                        background-size:contain;"></div>
                                    </td>
                                </tr>
                            </table>
                            <!--<![endif]-->
                            <!--[if mso]>
                            <span style="line-height:normal; font-family: Arial, Helvetica, sans-serif; font-size: 1px; color:#ffffff">&nbsp;<br /></span>
                            <img src="cid:${BRAND_LIGHT_LOGO_CID}"
                                 alt="${BRAND_DISPLAY_NAME.replace(/"/g, '&quot;')}"
                                 width="180"
                                 border="0"
                                 style="display:block; margin: 0 auto; width:180px; height:auto; border:0; outline:none;" />
                            <![endif]-->
                        </td>
                    </tr>`;
}

/** `<style>` + `<meta>` block for theme-aware logo visibility in email clients. */
export function buildBrandHeaderStyles(): string {
    if (BRAND_LOGO_URL) {
        return `
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />`;
    }

    return `
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <style>
        .brand-logo-bg-dark { display: none !important; width: 0 !important; height: 0 !important; overflow: hidden !important; }
        @media (prefers-color-scheme: dark) {
            .brand-logo-bg-light { display: none !important; width: 0 !important; height: 0 !important; overflow: hidden !important; }
            .brand-logo-bg-dark { display: inline-block !important; width: 180px !important; height: 78px !important; overflow: visible !important; }
        }
        [data-ogsc] .brand-logo-bg-light { display: none !important; width: 0 !important; height: 0 !important; overflow: hidden !important; }
        [data-ogsc] .brand-logo-bg-dark { display: inline-block !important; width: 180px !important; height: 78px !important; overflow: visible !important; }
    </style>`;
}
