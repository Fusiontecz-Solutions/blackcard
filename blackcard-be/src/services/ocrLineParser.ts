/**
 * Smart line-based OCR parser: labels and values on separate lines.
 * Uses explicit line walking (not regex-only) per field detection.
 */
import { normalizeOcrTextForParsing } from './ocrFieldExtraction';

/** Extra OCR-only field; Prisma create paths may ignore it — use for display / fallback to business_name. */
export type OcrLineBusinessExtras = {
    dba_name?: string | null;
};

export type OcrLineParseResult = {
    business: OcrLineBusinessExtras & {
        business_name?: string | null;
        business_address1?: string | null;
        business_ein_number?: string | null;
        business_incorporation_state?: string | null;
        business_type_of_entity?: string | null;
        business_requested_amount?: string | null;
        business_monthly_revenue?: string | null;
        business_incorporation_date?: string | null;
        /** Industry / activity line; not merged into Prisma `BusinessFields` today — avoids clobbering entity type from "Style of Business". */
        nature_of_business?: string | null;
        phone_number?: string | null;
        business_email?: string | null;
        business_website?: string | null;
    };
    owner: {
        owner_ssn?: string | null;
        owner_first_name?: string | null;
        owner_last_name?: string | null;
        owner_fico_score?: string | null;
        owner_date_of_birth?: string | null;
        owner_ownership_percentage?: string | null;
        owner_email?: string | null;
        owner_mobile_number?: string | null;
    };
};

const SECTION_HEADER_RES: readonly RegExp[] = [
    /^BUSINESS\s+INFORMATION/i,
    /^LEGAL\s+BUSINESS\s+INFORMATION/i,
    /^OWNER\s*\/?\s*OFFICER/i,
    /^BUSINESS\s+PROPERTY/i,
    /^QUALIFYING\s+QUESTIONS/i,
    /^PERSONAL\s+INFORMATION/i,
    /^EQUITY\s+ADVANCE\s+INFO/i,
    /^MERCHANT\s+CASH\s+ADVANCE\s+INFO/i,
];

const NOISE_LINE_RES: readonly RegExp[] = [
    /^(yes|no)\.?$/i,
    /^n\s*\/\s*a$/i,
    /^tbd$/i,
    /^—+$/,
    /^-+$/,
];

/** Labels in the same group may share one vertical "ordered values" block (see NY Tribeca-style forms). */
type LabelStackGroup = 'name' | 'ordered_bizmeta' | 'ordered_entity' | 'single';

type LabelRule = {
    /** Normalized label text without trailing ":" (lowercase, single spaces). */
    keys: readonly string[];
    /** Where to store the value. */
    field: keyof OcrLineParseResult['business'] | keyof OcrLineParseResult['owner'];
    /** Read value into owner instead of business. */
    owner?: boolean;
    /** Consecutive labels only stack when this matches the first label in the run (phone/address stay alone). */
    stackGroup?: LabelStackGroup;
};

/** Longer keys first so "dba name" wins over "dba". */
const LABEL_RULES: readonly LabelRule[] = [
    { keys: ['legal business name', 'legal / corporate name', 'legal/corporate name'], field: 'business_name', stackGroup: 'name' },
    { keys: ['legal company name', 'corporation name', 'business legal name'], field: 'business_name', stackGroup: 'single' },
    { keys: ['business name', 'company name'], field: 'business_name', stackGroup: 'single' },
    { keys: ['dba name', 'doing business as', 'trade name'], field: 'dba_name', stackGroup: 'name' },
    { keys: ['dba'], field: 'dba_name', stackGroup: 'name' },
    { keys: ['business address', 'physical address', 'mailing address', 'street address'], field: 'business_address1', stackGroup: 'single' },
    { keys: ['tax id number', 'tax id', 'federal tax id', 'employer identification', 'ein', 'fein'], field: 'business_ein_number', stackGroup: 'ordered_entity' },
    {
        keys: ['state incorporated', 'incorporation state', 'state of incorporation', 'state of organization'],
        field: 'business_incorporation_state',
        stackGroup: 'ordered_entity',
    },
    { keys: ['nature of business'], field: 'nature_of_business', stackGroup: 'ordered_bizmeta' },
    { keys: ['type of business', 'business type'], field: 'business_type_of_entity', stackGroup: 'ordered_entity' },
    { keys: ['style of business'], field: 'business_type_of_entity', stackGroup: 'ordered_entity' },
    { keys: ['business start date', 'date business started', 'start date'], field: 'business_incorporation_date', stackGroup: 'ordered_bizmeta' },
    {
        keys: [
            'advance amount requested',
            'requested amount',
            'loan amount',
            'amount requested',
            'requested financing amount',
            'desired funding amount',
            'amount seeking',
        ],
        field: 'business_requested_amount',
        stackGroup: 'ordered_bizmeta',
    },
    {
        keys: ['average monthly revenue', 'monthly revenue', 'gross sales', 'annual business revenue'],
        field: 'business_monthly_revenue',
        stackGroup: 'single',
    },
    {
        keys: [
            'business email',
            'merchant email',
            'merchant email address',
            'e-mail address',
            'email address',
            'biz email',
            'company email',
        ],
        field: 'business_email',
        stackGroup: 'single',
    },
    { keys: ['website', 'business website'], field: 'business_website', stackGroup: 'single' },
    { keys: ['business phone number'], field: 'phone_number', stackGroup: 'single' },
    {
        keys: ['phone number', 'telephone', 'business phone', 'business telephone', 'business telephone#', 'cell', 'cell #'],
        field: 'phone_number',
        stackGroup: 'single',
    },
    { keys: ['social security number', 'social security #', 'social security'], field: 'owner_ssn', owner: true },
    { keys: ['ssn'], field: 'owner_ssn', owner: true },
    { keys: ['applicant'], field: 'owner_first_name', owner: true, stackGroup: 'single' },
    { keys: ['owner first name', 'applicant first name', 'principal first name', 'first name'], field: 'owner_first_name', owner: true, stackGroup: 'single' },
    { keys: ['owner last name', 'applicant last name', 'principal last name', 'last name'], field: 'owner_last_name', owner: true, stackGroup: 'single' },
    { keys: ['full name', 'principal owner', "principal owner's name", 'principal owners name'], field: 'owner_first_name', owner: true },
    { keys: ['owner name', 'applicant name', 'principal name'], field: 'owner_first_name', owner: true },
    { keys: ['date of birth', 'dob'], field: 'owner_date_of_birth', owner: true, stackGroup: 'single' },
    { keys: ['credit score', 'fico score', 'fico'], field: 'owner_fico_score', owner: true, stackGroup: 'single' },
    { keys: ['percent ownership', '% ownership', 'ownership %', 'ownership percentage'], field: 'owner_ownership_percentage', owner: true, stackGroup: 'single' },
    {
        keys: ['owner email', 'applicant email', 'principal email', 'personal email', 'home email'],
        field: 'owner_email',
        owner: true,
        stackGroup: 'single',
    },
    {
        keys: [
            'owner mobile',
            'owner phone',
            'owner telephone',
            'applicant phone',
            'principal phone',
            'cell phone',
            'mobile phone',
            'home phone',
        ],
        field: 'owner_mobile_number',
        owner: true,
        stackGroup: 'single',
    },
];

function normalizeLabelLine(line: string): string {
    return line
        .trim()
        .replace(/:+\s*$/, '')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
}

function ruleMatchesLabel(normalizedLabel: string, keys: readonly string[]): boolean {
    for (const key of keys) {
        if (normalizedLabel === key || normalizedLabel.startsWith(`${key} `)) {
            return true;
        }
    }
    return false;
}

/** True if this line is a section heading or noise, not a data label. */
function isSectionOrNoiseLine(trimmed: string): boolean {
    if (!trimmed) return true;
    for (const re of SECTION_HEADER_RES) {
        if (re.test(trimmed)) return true;
    }
    for (const re of NOISE_LINE_RES) {
        if (re.test(trimmed)) return true;
    }
    return false;
}

/**
 * Heuristic: label lines end with ":" or match a known label phrase (OCR may drop ":").
 */
export function isLabel(line: string): boolean {
    const t = line.trim();
    if (!t || isSectionOrNoiseLine(t)) {
        return false;
    }
    if (t.endsWith(':')) {
        const inner = t.slice(0, -1).trim();
        if (inner.length < 2) return false;
        const norm = normalizeLabelLine(inner);
        return LABEL_RULES.some((r) => r.keys.some((k) => norm === k || norm.startsWith(`${k} `)));
    }
    const norm = normalizeLabelLine(t);
    return LABEL_RULES.some((r) => r.keys.some((k) => norm === k || norm.startsWith(`${k} `)));
}

function stackGroupOf(rule: LabelRule | null): LabelStackGroup {
    if (!rule) return 'single';
    if (rule.stackGroup) return rule.stackGroup;
    if (rule.field === 'business_name' || rule.field === 'dba_name') return 'name';
    return 'single';
}

function resolveLabelRule(line: string): LabelRule | null {
    const norm = normalizeLabelLine(line);
    for (const rule of LABEL_RULES) {
        if (ruleMatchesLabel(norm, rule.keys)) {
            return rule;
        }
    }
    return null;
}

/** OCR often keeps "Reason for Funding:" etc. as label-like lines we do not map — do not treat as field values. */
function isUnmappedColonLabelLine(line: string): boolean {
    const t = line.trim();
    if (!t.endsWith(':')) return false;
    const inner = t.slice(0, -1).trim();
    if (inner.length < 3) return false;
    return resolveLabelRule(line) == null;
}

/**
 * After a vertical stack of labels, read the next `slotCount` non-empty data lines
 * (one line = one slot). Stops at the next label or section header.
 */
function collectOrderedValues(
    lines: readonly string[],
    startIndex: number,
    slotCount: number,
): { values: string[]; endIndex: number } {
    const values: string[] = [];
    let i = startIndex;
    while (i < lines.length && values.length < slotCount) {
        const raw = lines[i]?.trim() ?? '';
        if (!raw) {
            i += 1;
            continue;
        }
        if (isLabel(lines[i]!)) {
            break;
        }
        if (isUnmappedColonLabelLine(lines[i]!)) {
            i += 1;
            continue;
        }
        if (isSectionOrNoiseLine(raw)) {
            break;
        }
        values.push(raw);
        i += 1;
    }
    return { values, endIndex: i };
}

function dedupeConsecutiveLines(parts: readonly string[]): string[] {
    const out: string[] = [];
    for (const p of parts) {
        const low = p.toLowerCase();
        if (out.length && out[out.length - 1].toLowerCase() === low) {
            continue;
        }
        out.push(p);
    }
    return out;
}

/**
 * After a label at `labelLineIndex`, collect up to `maxLines` non-empty value lines.
 * Stops at the next label, section header, or noise-only line.
 */
export function getNextValue(
    lines: readonly string[],
    labelLineIndex: number,
    options?: { maxLines?: number },
): { value: string | null; endIndex: number } {
    const maxLines = options?.maxLines ?? 3;
    const parts: string[] = [];
    let i = labelLineIndex + 1;

    while (i < lines.length && parts.length < maxLines) {
        const raw = lines[i]?.trim() ?? '';
        if (!raw) {
            i += 1;
            continue;
        }
        if (isLabel(lines[i]!)) {
            break;
        }
        if (isUnmappedColonLabelLine(lines[i]!)) {
            i += 1;
            break;
        }
        if (isSectionOrNoiseLine(raw)) {
            i += 1;
            continue;
        }
        parts.push(raw);
        i += 1;
    }

    const merged = dedupeConsecutiveLines(parts).join(' ').replace(/\s+/g, ' ').trim();
    return { value: merged || null, endIndex: i };
}

function formatEin(val: string): string | null {
    const m = val.match(/\b\d{2}[-\s]?\d{7}\b/);
    if (m) return m[0].replace(/\s/g, '');
    const digits = val.replace(/\D/g, '');
    if (digits.length === 9) {
        return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    return val.trim().slice(0, 20) || null;
}

function formatSsn(val: string): string | null {
    const digits = val.replace(/\D/g, '');
    if (digits.length === 9) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    }
    return null;
}

function formatPhone(val: string): string | null {
    const m = val.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
    return m ? m[0] : null;
}

function formatFico(val: string): string | null {
    const range = val.match(/\b(\d{3})\s*-\s*(\d{3})\b/);
    if (range?.[1] && range?.[2]) {
        return `${range[1]}-${range[2]}`;
    }
    const one = val.match(/\b(\d{3})\b/);
    if (one?.[1]) {
        return one[1];
    }
    return null;
}

function formatDob(val: string): string | null {
    const slash = val.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (slash?.[1] && slash?.[2] && slash?.[3]) {
        const mm = slash[1].padStart(2, '0');
        const dd = slash[2].padStart(2, '0');
        return `${slash[3]}-${mm}-${dd}`;
    }
    const compact = val.replace(/\D/g, '');
    if (compact.length === 8) {
        const mm = compact.slice(0, 2);
        const dd = compact.slice(2, 4);
        const yyyy = compact.slice(4, 8);
        const m = Number(mm);
        const d = Number(dd);
        const y = Number(yyyy);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
            return `${yyyy}-${mm}-${dd}`;
        }
    }
    return null;
}

function cleanOwnerNameValue(v: string): string {
    let t = v.replace(/\s+/g, " ").trim();
    t = t.replace(/\b(ownership\s*percent|ownership\s*%|%?\s*of\s*ownership)\b.*$/i, "").trim();
    t = t.replace(/\b(social\s*security|ssn|dob|date\s*of\s*birth|fico|credit\s*score)\b.*$/i, "").trim();
    return t;
}

function assignValue(
    business: OcrLineParseResult['business'],
    owner: OcrLineParseResult['owner'],
    rule: LabelRule,
    value: string,
    opts?: { fromStack?: boolean },
): void {
    const v = value.trim();
    if (!v) return;

    const target = rule.owner ? owner : business;
    const key = rule.field as string;
    const cur = (target as Record<string, unknown>)[key];
    const filled = cur != null && String(cur).trim() !== '';
    if (filled && !opts?.fromStack) {
        return;
    }

    if (rule.field === 'business_ein_number') {
        business.business_ein_number = formatEin(v);
        return;
    }
    if (rule.field === 'owner_ssn') {
        const ssn = formatSsn(v);
        if (ssn) {
            owner.owner_ssn = ssn;
        }
        return;
    }
    if (rule.field === 'owner_fico_score' && rule.owner) {
        const fico = formatFico(v);
        if (fico) {
            owner.owner_fico_score = fico;
        }
        return;
    }
    if (rule.field === 'owner_date_of_birth' && rule.owner) {
        const dob = formatDob(v);
        if (dob) {
            owner.owner_date_of_birth = dob;
        }
        return;
    }
    if (rule.field === 'phone_number') {
        const p = formatPhone(v);
        if (p) {
            business.phone_number = p;
        }
        return;
    }
    if (rule.field === 'business_email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(v)) {
            return;
        }
        business.business_email = v;
        return;
    }
    if (rule.field === 'owner_email' && rule.owner) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(v)) {
            return;
        }
        owner.owner_email = v;
        return;
    }
    if (rule.field === 'owner_mobile_number' && rule.owner) {
        const p = formatPhone(v);
        if (p) {
            owner.owner_mobile_number = p;
        }
        return;
    }
    if (rule.field === 'owner_last_name' && rule.owner) {
        owner.owner_last_name = v;
        return;
    }
    if (rule.field === 'owner_first_name' && rule.owner) {
        const cleaned = cleanOwnerNameValue(v);
        const parts = cleaned.split(/\s+/).filter(Boolean);
        if (!parts.length) {
            return;
        }
        const last = parts[parts.length - 1] ?? "";
        // Guard against merged numeric tail like "100%" becoming last name.
        if (/\d/.test(last) && parts.length <= 2) {
            owner.owner_first_name = parts[0] ?? null;
            return;
        }
        if (parts.length >= 2) {
            owner.owner_last_name = parts[parts.length - 1] ?? null;
            owner.owner_first_name = parts.slice(0, -1).join(' ') || null;
        } else {
            owner.owner_first_name = cleaned;
        }
        return;
    }

    (target as Record<string, unknown>)[key] = v;
}

/** Normalize input to non-empty trimmed lines. */
export function toOcrLines(input: string | readonly string[]): string[] {
    if (typeof input === 'string') {
        return normalizeOcrTextForParsing(input)
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
    }
    return [...input].map((l) => String(l).trim()).filter((l) => l.length > 0);
}

/**
 * Walk lines: consecutive label lines share the following value block (e.g. Legal Name + DBA Name → one company name).
 * Otherwise a single label reads the next 1–3 non-empty lines until the next label.
 */
export function parseOCRLines(linesInput: string | readonly string[]): OcrLineParseResult {
    const lines = toOcrLines(linesInput);
    const business: OcrLineParseResult['business'] = {};
    const owner: OcrLineParseResult['owner'] = {};

    let i = 0;
    while (i < lines.length) {
        const line = lines[i]!;
        const trimmed = line.trim();

        if (!trimmed || isSectionOrNoiseLine(trimmed)) {
            i += 1;
            continue;
        }

        if (!isLabel(line)) {
            i += 1;
            continue;
        }

        const firstRule = resolveLabelRule(lines[i]!);
        const anchorGroup = stackGroupOf(firstRule);
        let j = i;
        while (j < lines.length && isLabel(lines[j]!)) {
            const tj = lines[j]!.trim();
            if (isSectionOrNoiseLine(tj)) {
                break;
            }
            const rj = resolveLabelRule(lines[j]!);
            if (!rj) {
                break;
            }
            if (j === i) {
                j += 1;
                continue;
            }
            if (anchorGroup === 'single' || stackGroupOf(rj) !== anchorGroup) {
                break;
            }
            if (anchorGroup === 'name') {
                j += 1;
                continue;
            }
            if (anchorGroup === 'ordered_bizmeta' || anchorGroup === 'ordered_entity') {
                j += 1;
                continue;
            }
            break;
        }

        const stackDepth = j - i;
        const valueAnchor = j - 1;
        const rulesInRun: LabelRule[] = [];
        for (let k = i; k < j; k += 1) {
            const r = resolveLabelRule(lines[k]!);
            if (r) {
                rulesInRun.push(r);
            }
        }

        const nameShareStack =
            stackDepth > 1 &&
            rulesInRun.length > 0 &&
            stackGroupOf(rulesInRun[0]!) === 'name' &&
            rulesInRun.every((r) => r.field === 'business_name' || r.field === 'dba_name');

        if (nameShareStack) {
            const { value, endIndex } = getNextValue(lines, valueAnchor, { maxLines: 3 });
            if (value) {
                for (let k = i; k < j; k += 1) {
                    const rule = resolveLabelRule(lines[k]!);
                    if (rule) {
                        assignValue(business, owner, rule, value, { fromStack: true });
                    }
                }
            }
            i = endIndex > valueAnchor ? endIndex : j;
            continue;
        }

        if (stackDepth > 1 && rulesInRun.length > 0 && stackGroupOf(rulesInRun[0]!) !== 'name') {
            const { values, endIndex } = collectOrderedValues(lines, j, rulesInRun.length);
            for (let idx = 0; idx < rulesInRun.length; idx += 1) {
                const v = values[idx];
                if (v) {
                    assignValue(business, owner, rulesInRun[idx]!, v, { fromStack: false });
                }
            }
            i = endIndex > j ? endIndex : j;
            continue;
        }

        if (stackDepth === 1 && rulesInRun.length === 1) {
            const { value, endIndex } = getNextValue(lines, valueAnchor, { maxLines: 3 });
            if (value) {
                assignValue(business, owner, rulesInRun[0]!, value, { fromStack: false });
            }
            i = endIndex > valueAnchor ? endIndex : j;
            continue;
        }

        i = j > i ? j : i + 1;
    }

    if (!business.business_name?.trim() && business.dba_name?.trim()) {
        business.business_name = business.dba_name.replace(/DBA:?/gi, '').trim() || business.dba_name;
    }

    return { business, owner };
}

/** Compact 5-field JSON for OCR previews (matches common MCA intake shape). */
export type OcrBusinessSummaryJson = {
    business: {
        business_name: string;
        dba_name: string;
        business_address1: string;
        business_ein_number: string;
        business_incorporation_state: string;
    };
};

export function formatOcrBusinessBlock(
    b: Partial<OcrLineParseResult['business']> & Record<string, unknown>,
): OcrBusinessSummaryJson {
    const s = (v: unknown) => (v != null && String(v).trim() ? String(v).trim() : '');
    return {
        business: {
            business_name: s(b.business_name),
            dba_name: s(b.dba_name),
            business_address1: s(b.business_address1),
            business_ein_number: s(b.business_ein_number),
            business_incorporation_state: s(b.business_incorporation_state),
        },
    };
}
