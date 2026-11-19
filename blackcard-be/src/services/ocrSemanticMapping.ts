/**
 * Semantic / synonym-style OCR gap-fill (whole-document patterns).
 * Validators live in `ocrFieldExtraction` to avoid circular imports.
 */

import {
    isLikelyOcrLabelArtifact,
    isPlausibleBusinessCity,
    isPlausibleBusinessPhoneDigits,
    normalizeOcrTextForParsing,
} from './ocrFieldExtraction';

/**
 * MCA / credit forms: "Name FICO Basil Davidson 720" or "FICO Basil Davidson 720".
 */
export function extractOwnerFullNameFromOcrText(raw: string): string | null {
    const body = normalizeOcrTextForParsing(raw);
    if (!body) return null;
    if (/\bEXTRACTED\s+SUMMARY\b/i.test(body)) {
        return null;
    }
    const oneLine = body.replace(/\s+/g, ' ').trim();

    const m1 = oneLine.match(/\bName\s+FICO\s+([A-Za-z][A-Za-z\s.'-]+?)\s+(\d{3})\b/);
    if (m1?.[1]) {
        return m1[1].replace(/\s+/g, ' ').trim();
    }

    const m2 = oneLine.match(/\bFICO\s+([A-Za-z][A-Za-z\s.'-]+?)\s+(\d{3})\b/);
    if (m2?.[1] && !/^(score|range|number)$/i.test(m2[1].trim())) {
        return m2[1].replace(/\s+/g, ' ').trim();
    }

    const lines = body.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    for (let i = 0; i < lines.length; i += 1) {
        const low = lines[i]!.toLowerCase();
        if (/^name(\s+fico)?$/i.test(low) || /^name\s+fico\s*$/i.test(low)) {
            const next = lines[i + 1];
            if (next && !isLikelyOcrLabelArtifact(next) && next.split(/\s+/).filter(Boolean).length >= 2) {
                const stripped = next.replace(/\s+(\d{3})\s*$/, '').trim();
                if (stripped.length >= 3 && /[a-zA-Z]/.test(stripped)) {
                    return stripped;
                }
            }
        }
    }

    return null;
}

export function extractOwnerFicoScoreFromOcrText(raw: string): string | null {
    const oneLine = normalizeOcrTextForParsing(raw).replace(/\s+/g, ' ').trim();
    const m = oneLine.match(/\bName\s+FICO\s+[A-Za-z][A-Za-z\s.'-]+?\s+(\d{3})\b/i);
    if (m?.[1]) return isPlausibleConsumerFico(m[1]) ? m[1] : null;
    const m2 = oneLine.match(/\bFICO\s+[A-Za-z][A-Za-z\s.'-]+?\s+(\d{3})\b/i);
    if (m2?.[1]) return isPlausibleConsumerFico(m2[1]) ? m2[1] : null;
    return null;
}

function isPlausibleConsumerFico(digits: string): boolean {
    const n = parseInt(String(digits).replace(/\D/g, '').slice(0, 3), 10);
    return Number.isFinite(n) && n >= 300 && n <= 850;
}

export function splitOwnerFullNameToFirstLast(full: string): { first: string; last: string } | null {
    const parts = full.replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    return {
        first: parts.slice(0, -1).join(' '),
        last: parts[parts.length - 1]!,
    };
}

type LooseOwner = {
    owner_first_name?: string | null;
    owner_last_name?: string | null;
    owner_fico_score?: string | null;
};

type LooseBusiness = {
    business_city?: string | null;
    business_state?: string | null;
    phone_number?: string | null;
    business_email?: string | null;
};

/**
 * Fill missing owner name / FICO from whole-document heuristics; clear obvious label junk on business fields.
 */
export function enrichAndSanitizeParsedOcr(
    fullText: string,
    parsed: { business: LooseBusiness; owner: LooseOwner },
): void {
    const owner = parsed.owner;
    const business = parsed.business;

    const needName = !String(owner.owner_first_name ?? '').trim() || !String(owner.owner_last_name ?? '').trim();
    if (needName) {
        const app = fullText.match(
            /\bApplicant\s*:\s*([A-Za-z][A-Za-z\s.'-]{1,120}?)(?=\s+(?:Owner\s+First|Owner\s+Last|Owner\s+Email|Home\s+Address|BUSINESS\s+PROPERTY|ADDITIONAL\b)|$)/i,
        );
        if (app?.[1]?.trim()) {
            const sp = splitOwnerFullNameToFirstLast(app[1].trim());
            if (sp) {
                if (!String(owner.owner_first_name ?? '').trim()) owner.owner_first_name = sp.first;
                if (!String(owner.owner_last_name ?? '').trim()) owner.owner_last_name = sp.last;
            }
        }
        const full = extractOwnerFullNameFromOcrText(fullText);
        if (full) {
            const sp = splitOwnerFullNameToFirstLast(full);
            if (sp) {
                if (!String(owner.owner_first_name ?? '').trim()) {
                    owner.owner_first_name = sp.first;
                }
                if (!String(owner.owner_last_name ?? '').trim()) {
                    owner.owner_last_name = sp.last;
                }
            }
        }
    }

    const fico = extractOwnerFicoScoreFromOcrText(fullText);
    if (fico && !String(owner.owner_fico_score ?? '').trim()) {
        owner.owner_fico_score = fico;
    }

    if (business.business_city && !isPlausibleBusinessCity(business.business_city)) {
        business.business_city = null;
    }
    const st = business.business_state?.trim();
    if (st && !/^[A-Za-z]{2}$/.test(st)) {
        business.business_state = null;
    }
    if (business.phone_number && !isPlausibleBusinessPhoneDigits(business.phone_number)) {
        business.phone_number = null;
    }
    if (business.business_email && isLikelyOcrLabelArtifact(business.business_email)) {
        business.business_email = null;
    }
}
