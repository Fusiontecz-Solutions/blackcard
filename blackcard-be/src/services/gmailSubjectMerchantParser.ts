/** Strips Re:/Fwd: prefixes from email subjects. */
function stripReplyForwardPrefix(subject: string): string {
    let s = subject.trim();
    for (let i = 0; i < 5; i++) {
        const next = s.replace(/^(re|fwd|fw)\s*:\s*/i, '').trim();
        if (next === s) break;
        s = next;
    }
    return s;
}

const DEAL_SUBJECT_PREFIXES: RegExp[] = [
    /^new\s+deal\s+submission\s*[-–—:]\s*/i,
    /^new\s+deal\s*[-–—:]\s*/i,
    /^new\s+submission\s*[-–—:]\s*/i,
    /^submitting\s*[-–—:]\s*/i,
    /^submission\s*[-–—:]\s*/i,
];

/** Removes trailing parenthetical noise such as ("attached deal") or ("See attached"). */
function stripTrailingSubjectNoise(merchant: string): string {
    return merchant
        .replace(/\s*[\(\[][^)\]]*\battached\b[^)\]]*[\)\]]\s*$/i, '')
        .replace(/\s*[-–—]\s*attached\s*$/i, '')
        .trim();
}

/**
 * Extracts merchant / business name from ISO deal submission email subjects.
 * Examples:
 *   "New Deal - PRIME 6 LLC" → "PRIME 6 LLC"
 *   "New Submission: UWIN LLC ("See attached")" → "UWIN LLC"
 */
export function parseMerchantNameFromSubject(subject: string): string | null {
    let s = stripReplyForwardPrefix(String(subject || ''));
    if (!s) return null;

    for (const prefix of DEAL_SUBJECT_PREFIXES) {
        if (prefix.test(s)) {
            s = s.replace(prefix, '').trim();
            break;
        }
    }

    s = stripTrailingSubjectNoise(s);
    s = s.replace(/^["'""]+|["'""]+$/g, '').trim();

    return s.length >= 2 ? s : null;
}
