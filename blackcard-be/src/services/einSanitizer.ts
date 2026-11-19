/**
 * Document AI / OCR often pairs "Federal Tax ID / EIN" with the *next field label*
 * (commonly "DateBusiness" / "Date Business Started") instead of the 9-digit EIN.
 * Re-running fill on the same PDF can succeed because Claude or a later text pass
 * finds the real number. Always persist EIN only when it looks like XX-XXXXXXX.
 */

const EIN_DIGITS = /\b(\d{2})[-\s]?(\d{7})\b/;

const EIN_LABELS = [
    /federal\s*tax\s*id(?:entification)?(?:\s*number)?/gi,
    /employer\s*identification(?:\s*number)?/gi,
    /\bfein\b/gi,
    /\bein\b/gi,
    /tax\s*id(?:entification)?(?:\s*number)?/gi,
];

const LABEL_ARTIFACT = /date\s*business|business\s*started|date\s*started|inception|established|incorporation|federal\s*tax|tax\s*id|employer\s*id/i;

export function looksLikeEin(value: unknown): boolean {
    if (value == null) return false;
    const s = String(value).trim();
    if (!s || LABEL_ARTIFACT.test(s) || /[a-zA-Z]/.test(s)) return false;
    const digits = s.replace(/\D/g, '');
    if (digits.length !== 9) return false;
    if (/^0+$/.test(digits) || /^1+$/.test(digits) || /^9+$/.test(digits)) return false;
    return true;
}

export function formatEin(value: unknown): string | null {
    if (!looksLikeEin(value)) return null;
    const digits = String(value).replace(/\D/g, '');
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function sanitizeEin(value: unknown): string | null {
    return formatEin(value);
}

/** Prefer a real EIN over a longer junk string (mergeKeyData used to keep the longer value). */
export function preferBetterEin(current: unknown, next: unknown): string | undefined {
    const a = sanitizeEin(current);
    const b = sanitizeEin(next);
    if (b && !a) return b;
    if (a && !b) return a;
    if (a) return a;
    return undefined;
}

function sliceAfterMatch(text: string, match: RegExpMatchArray, len = 80): string {
    const end = (match.index ?? 0) + match[0].length;
    return text.slice(end, end + len);
}

/**
 * Find EIN near Federal Tax ID / EIN labels, then any well-formed EIN in the page text.
 */
export function extractEinFromText(text: string | null | undefined): string | null {
    if (!text) return null;
    const t = String(text);

    for (const re of EIN_LABELS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(t)) !== null) {
            const window = sliceAfterMatch(t, m);
            const hit = window.match(EIN_DIGITS);
            if (hit && looksLikeEin(hit[0])) {
                return formatEin(hit[0]);
            }
        }
    }

    const all = t.match(new RegExp(EIN_DIGITS.source, 'g')) || [];
    for (const raw of all) {
        if (looksLikeEin(raw)) return formatEin(raw);
    }
    return null;
}

export function resolveEin(candidate: unknown, rawText?: string | null): string | undefined {
    return sanitizeEin(candidate) || extractEinFromText(rawText) || undefined;
}
