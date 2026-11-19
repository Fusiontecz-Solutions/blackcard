/**
 * Derives repayment frequency from a human-readable `term` string.
 * The Excel `frequency` column must not be used for persistence — always derive from `term`.
 *
 * - Case-insensitive; surrounding / duplicate spaces on input should be normalized by callers
 *   when building the stored `term`; this function only lowercases for matching.
 * - Uses whole-word `day(s)` / `week(s)` so values like "Monday" do not become `daily`.
 * - `monthly`, `yearly`, malformed text → `"NA"`. Null/empty → `"NA"`.
 */
export function deriveFrequency(term: string | null | undefined): string {
    if (term == null) return 'NA';
    const normalized = String(term).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) return 'NA';
    if (/\bdays?\b/.test(normalized)) return 'daily';
    if (/\bweeks?\b/.test(normalized)) return 'weekly';
    return 'NA';
}

/** Collapse whitespace; empty after trim → `"NA"` (stored `term` default). */
export function normalizeTermForOfferDecision(raw: unknown): string {
    const t = String(raw ?? '')
        .trim()
        .replace(/\s+/g, ' ');
    return t === '' ? 'NA' : t;
}

/** Map spec lowercase labels to values stored in DB / used by existing UI (`Daily`, `Weekly`). */
export function frequencySpecToStored(spec: string): string {
    const s = String(spec ?? '').trim().toLowerCase();
    if (s === 'daily') return 'Daily';
    if (s === 'weekly') return 'Weekly';
    return 'NA';
}

/**
 * Best-effort contract length in days from `OfferDecision.term` (legacy int-as-text or "60 Days").
 */
export function parseContractLengthDaysFromOfferTerm(term: unknown): number | null {
    if (term == null) return null;
    if (typeof term === 'number' && Number.isFinite(term)) return term;
    const str = String(term).trim();
    if (!str || str.toUpperCase() === 'NA') return null;
    const m = /^(\d+)/.exec(str.replace(/\s+/g, ' '));
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
}
