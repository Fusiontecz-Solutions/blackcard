/**
 * Label-driven extraction for noisy OCR text.
 * Stops at the next known field label or blank line — avoids assigning whole paragraphs to one field.
 */

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Turn a human label into a pattern that tolerates odd OCR spacing. */
const labelVariantsToAlternation = (labels: readonly string[]): string =>
    labels
        .map((label) =>
            label
                .trim()
                .split(/\s+/)
                .map(escapeRegex)
                .join('\\s+'),
        )
        .join('|');

/**
 * Normalize OCR: keep line breaks (helps stop at next label), trim lines, collapse spaces per line.
 */
export function normalizeOcrTextForParsing(raw: string): string {
    if (!raw || !raw.trim()) return '';
    return raw
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Reject captured “values” that are really another field label (common OCR noise). */
export function isLikelyOcrLabelArtifact(val: string | null | undefined): boolean {
    if (val == null) return true;
    const t = String(val).trim();
    if (t.length < 2) return true;
    const low = t.toLowerCase();
    if (t.endsWith(':')) return true;
    if (low.includes('email address') || low === 'email') return true;
    if (low.includes('phone number') && !/\d{3}/.test(t)) return true;
    if (/\/\s*country/i.test(t) || low === '/country' || low === 'country') return true;
    if (/^(address|city|state|zip|fax|ssn|ein|tax id)\s*$/i.test(t)) return true;
    if (/^(yes|no|n\/a)\.?$/i.test(t)) return true;
    return false;
}

export function isPlausibleBusinessCity(val: string | null | undefined): boolean {
    if (val == null || !String(val).trim()) return false;
    if (isLikelyOcrLabelArtifact(val)) return false;
    const t = String(val).trim();
    if (t.includes('/') || t.includes('\\')) return false;
    if (!/[a-zA-Z]/.test(t)) return false;
    if (t.length > 60) return false;
    return true;
}

export function isPlausibleBusinessPhoneDigits(val: string | null | undefined): boolean {
    if (val == null || !String(val).trim()) return false;
    const d = String(val).replace(/\D/g, '');
    return d.length >= 10;
}

export type ExtractFieldOptions = {
    /** Do not capture more than this many characters (then trim at last space). */
    maxLen: number;
    /** Label phrases that start the *next* field — value stops before the first match. */
    stopLabels: readonly string[];
};

/**
 * Find the first occurrence of any `labelVariants`, then read the value until:
 * - a line that starts with another known label (`stopLabels`), or
 * - a blank line (paragraph break), or
 * - `maxLen` characters.
 */
export function extractFieldAfterLabel(
    text: string,
    labelVariants: readonly string[],
    options: ExtractFieldOptions,
): string | null {
    const body = normalizeOcrTextForParsing(text);
    if (!body || labelVariants.length === 0) return null;

    const labelAlt = labelVariantsToAlternation(labelVariants);
    const labelRe = new RegExp(`(?:^|\\n)\\s*(?:${labelAlt})\\s*[:#\\u2013\\u2014\\-]?\\s*`, 'i');
    const m = body.match(labelRe);
    if (!m || m.index === undefined) return null;

    const start = m.index + m[0].length;
    let chunk = body.slice(start);

    const uniqueStops = [...new Set(options.stopLabels.filter(Boolean))];
    if (uniqueStops.length) {
        const stopAlt = uniqueStops.map((l) => labelVariantsToAlternation([l])).join('|');
        // Line-start field headers (typical multi-line OCR).
        const strictRe = new RegExp(`(?:\\n|^)\\s*(?:${stopAlt})\\b`, 'i');
        const sm = chunk.match(strictRe);
        if (sm?.index != null && sm.index >= 0) {
            chunk = chunk.slice(0, sm.index);
        }
        // Same-line "Next Label:" (common when OCR flattens to one line).
        const looseRe = new RegExp(`(?:\\s|^)(?:${stopAlt})\\s*[:#\\u2013\\u2014\\-]`, 'i');
        const lm = chunk.match(looseRe);
        if (lm?.index != null && lm.index > 0) {
            chunk = chunk.slice(0, lm.index);
        }
    }

    const paraBreak = chunk.search(/\n\s*\n/);
    if (paraBreak !== -1) {
        chunk = chunk.slice(0, paraBreak);
    }

    let value = chunk
        .split('\n')
        .map((l) => l.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join(' ')
        .trim();

    if (value.length > options.maxLen) {
        value = value.slice(0, options.maxLen);
        const cut = value.lastIndexOf(' ');
        if (cut > options.maxLen * 0.4) {
            value = value.slice(0, cut);
        }
        value = value.trim();
    }

    return value || null;
}

const cleanBusinessNameLocal = (val: string | null) => {
    if (!val) return null;
    return val.replace(/DBA:?/gi, '').trim() || null;
};

const cleanPhoneLocal = (val: string | null) => {
    if (!val) return null;
    const match = val.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
    return match ? match[0] : null;
};

type BusinessPartial = {
    business_name?: string | null;
    business_address1?: string | null;
    business_city?: string | null;
    business_state?: string | null;
    business_zip_code?: string | null;
    phone_number?: string | null;
    business_ein_number?: string | null;
    business_email?: string | null;
    business_website?: string | null;
    business_incorporation_state?: string | null;
    business_incorporation_date?: string | null;
    business_type_of_entity?: string | null;
    business_requested_amount?: string | null;
    business_monthly_revenue?: string | null;
};

type OwnerPartial = {
    owner_first_name?: string | null;
    owner_last_name?: string | null;
    owner_ssn?: string | null;
    owner_email?: string | null;
    owner_mobile_number?: string | null;
    owner_date_of_birth?: string | null;
    owner_fico_score?: string | null;
    owner_ownership_percentage?: string | null;
};

function parseSlashDateIso(val: string | null | undefined): string | null {
    if (!val?.trim()) return null;
    const m = val.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!m) return val.trim().replace(/[^\d/].*$/, '').slice(0, 32) || null;
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
}

function cleanMoneyToken(val: string | null | undefined): string | null {
    if (!val?.trim()) return null;
    const m = val.match(/(\$[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?)/);
    return m ? m[1].trim() : null;
}

function cleanCityFromInlineOcr(val: string | null | undefined): string | null {
    if (!val?.trim()) return null;
    let t = val.replace(/\s+/g, ' ').trim();
    const low = t.toLowerCase();
    const cutAt = (needle: string) => {
        const i = low.indexOf(needle);
        if (i !== -1) {
            t = t.slice(0, i).trim();
        }
    };
    cutAt('state:');
    cutAt('zip:');
    cutAt('zip code:');
    if (!isPlausibleBusinessCity(t)) return null;
    return t;
}

function extractZipFromFragment(val: string | null | undefined): string | null {
    if (!val) return null;
    const m = val.match(/\b(\d{5}(?:-\s*\d{4})?)\b/);
    return m ? m[1].replace(/\s/g, '') : null;
}

function annualUsdToMonthlyString(annualStr: string): string | null {
    const n = parseFloat(annualStr.replace(/[$,]/g, ''));
    if (Number.isNaN(n) || n <= 0) return null;
    return String(Math.round((n / 12) * 100) / 100);
}

function looksLikeEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(s).trim());
}

function cleanOwnerFullName(value: string | null | undefined): string | null {
    if (!value?.trim()) return null;
    let t = value.replace(/\s+/g, ' ').trim();
    t = t.replace(/^(?:name|owner name|principal owner(?:'s)? name)\s*/i, '');
    t = t.replace(/^fico\s*/i, '');
    t = t.replace(/\b\d{3}\b$/, '').trim();
    // Keep letters and common name punctuation only.
    t = t.replace(/[^A-Za-z\s.'-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.split(/\s+/).filter(Boolean).length < 2) return null;
    return t;
}

function parseCompactDob(value: string | null | undefined): string | null {
    if (!value?.trim()) return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 8) return null;
    // Most forms in this project use MMDDYYYY in compact mode.
    const mm = digits.slice(0, 2);
    const dd = digits.slice(2, 4);
    const yyyy = digits.slice(4, 8);
    const month = Number(mm);
    const day = Number(dd);
    const year = Number(yyyy);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
    return `${yyyy}-${mm}-${dd}`;
}

function looksLikeValidSsn(value: string | null | undefined): boolean {
    if (!value?.trim()) return false;
    const digits = value.replace(/\D/g, '');
    return digits.length === 9;
}

function looksLikeValidFico(value: string | null | undefined): boolean {
    if (!value?.trim()) return false;
    const v = value.trim();
    if (/^\d{3}$/.test(v)) return true;
    if (/^\d{3}\s*-\s*\d{3}$/.test(v)) return true;
    return false;
}

function extractOwnerTableBlock(rawText: string): string | null {
    const flat = rawText.replace(/\s+/g, ' ').trim();
    if (!flat) return null;
    const variants: RegExp[] = [
        /OWNER\s*\/\s*PRINCIPAL\s+INFORMATION\s*\(\s*OWNER\s*1\s*\)[\s\S]{0,2200}?(?=OWNER\s*\/\s*PRINCIPAL\s+INFORMATION\s*\(\s*OWNER\s*2\s*\)|AUTHORIZATION|BUSINESS INFORMATION|$)/i,
        /PERSONAL INFORMATION ON OWNERS[\s\S]{0,1600}?(?=AUTHORIZATION|BUSINESS INFORMATION|$)/i,
    ];
    for (const re of variants) {
        const m = flat.match(re);
        if (m?.[0]) return m[0];
    }
    return null;
}

function supplementOwnerPersonalTablePatterns(rawText: string, owner: OwnerPartial): void {
    const section = extractOwnerTableBlock(rawText);
    if (!section) return;

    if (!owner.owner_first_name?.trim() || !owner.owner_last_name?.trim()) {
        const nameMatch =
            section.match(
                /Name\s*:\s*([A-Za-z][A-Za-z\s.'-]{2,80}?)(?=\s+Date\s*of\s*Birth|\s+\bDOB\b|\s+Home\s+Address|\s+City\s*:|\s+SSN\s*:|\s+Credit\s*Score|\s+Email\s*:|\s+Percent\s+Ownership|\s+\d{1,2}\/\d{1,2}\/\d{4})/i,
            ) ||
            section.match(/Name\s+FICO\s+([A-Za-z][A-Za-z\s.'-]{2,60}?)\s+\d{3}\b/i) ||
            section.match(/Name\s+([A-Za-z][A-Za-z\s.'-]{2,60}?)(?=\s+FICO|\s+% of Ownership|\s+Social Security|\s+DOB\b)/i);
        const cleaned = cleanOwnerFullName(nameMatch?.[1] ?? null);
        if (cleaned) {
            const parts = cleaned.split(/\s+/).filter(Boolean);
            if (!owner.owner_first_name?.trim()) owner.owner_first_name = parts.slice(0, -1).join(' ');
            if (!owner.owner_last_name?.trim()) owner.owner_last_name = parts[parts.length - 1] ?? null;
        }
    }

    if (!looksLikeValidFico(owner.owner_fico_score)) {
        const fico = section.match(/\bFICO\b\s*(\d{3})\b/i);
        if (fico?.[1]) owner.owner_fico_score = fico[1];
    }

    if (!owner.owner_ownership_percentage?.trim()) {
        const own = section.match(/% of Ownership\s*([0-9]{1,3}(?:\.[0-9]+)?%?)/i);
        if (own?.[1]) owner.owner_ownership_percentage = own[1];
    }

    if (!looksLikeValidSsn(owner.owner_ssn)) {
        const ssn = section.match(/Social Security No\.?\s*([0-9]{3}-?[0-9]{2}-?[0-9]{4})/i);
        if (ssn?.[1]) {
            const digits = ssn[1].replace(/\D/g, '');
            if (digits.length === 9) {
                owner.owner_ssn = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
            }
        }
    }

    if (!owner.owner_date_of_birth?.trim()) {
        const dob = section.match(/\bDOB\b\s*([0-9]{8}|\d{1,2}\/\d{1,2}\/\d{4})/i);
        if (dob?.[1]) {
            owner.owner_date_of_birth = parseCompactDob(dob[1]) ?? parseSlashDateIso(dob[1]);
        }
    }
}

/**
 * Inline / flattened PDF text (single-line-ish) where `Label:ValueNextLabel:` patterns
 * are not handled well by line-based extraction alone.
 */
function supplementCompressedApplicationPatterns(
    rawText: string,
    business: BusinessPartial,
    owner: OwnerPartial,
): void {
    const flat = rawText.replace(/\s+/g, ' ').trim();
    if (!flat) return;

    if (!business.business_name) {
        const m =
            flat.match(/Legal Company Name:\s*([^:]+?)(?=Website:|Industry:|Business Address:)/i) ||
            flat.match(/Legal Business Name:\s*([^:]+?)(?=Street Address:|Industry:|DBA Name:)/i);
        if (m?.[1]) {
            const nm = cleanBusinessNameLocal(m[1].trim());
            if (nm) business.business_name = nm;
        }
    }
    if (!business.business_name) {
        const m2 = flat.match(/Corporation Name:\s*([^:]+?)(?=Email|Phone|Address|Business)/i);
        if (m2?.[1]) {
            const nm = cleanBusinessNameLocal(m2[1].trim());
            if (nm) business.business_name = nm;
        }
    }

    if (!owner.owner_first_name?.trim() || !owner.owner_last_name?.trim()) {
        const fn = flat.match(
            /Full Name:\s*([A-Za-z][A-Za-z\s.'-]+?)(?=Full Name:|% Ownership|Home Address|Home Street|Social Security|Date of Birth|Name Printed)/i,
        );
        if (fn?.[1]) {
            const full = fn[1].replace(/\s+/g, ' ').trim();
            const pts = full.split(/\s+/).filter(Boolean);
            if (pts.length >= 2) {
                if (!owner.owner_first_name?.trim()) {
                    owner.owner_first_name = pts.slice(0, -1).join(' ');
                }
                if (!owner.owner_last_name?.trim()) {
                    owner.owner_last_name = pts[pts.length - 1] ?? null;
                }
            }
        }
    }

    if (!owner.owner_ssn?.trim()) {
        const sm =
            flat.match(/Social Security NO:\s*([\d-\s]+)/i) ||
            flat.match(/Social Security Number:\s*([\d-\s]+)/i);
        if (sm?.[1]) {
            const digits = sm[1].replace(/\D/g, '');
            if (digits.length === 9) {
                owner.owner_ssn = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
            }
        }
    }

    if (!owner.owner_date_of_birth?.trim()) {
        const dm = flat.match(/Date of Birth:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
        if (dm?.[1]) {
            owner.owner_date_of_birth = parseSlashDateIso(dm[1]);
        }
    }

    if (!owner.owner_fico_score?.trim()) {
        const single = flat.match(/(?:Credit Score|FICO)\s*\(?[A-Za-z]*\)?\s*[:\s]+(\d{3})\b/i);
        if (single?.[1]) {
            owner.owner_fico_score = single[1];
        } else {
            const range = flat.match(/\b(\d{3})\s*-\s*(\d{3})\b/);
            if (range?.[1] && range[2]) {
                const a = Number(range[1]);
                const b = Number(range[2]);
                if (a >= 300 && b <= 900 && b > a && b - a <= 120) {
                    owner.owner_fico_score = `${range[1]}-${range[2]}`;
                }
            }
        }
    }

    if (!business.business_ein_number?.trim()) {
        const em = flat.match(/(?:Tax ID|Federal Tax ID|EIN)\s*[#:]?\s*(\d{2}[-\s]?\d{7})/i);
        if (em?.[1]) {
            const digits = em[1].replace(/\s/g, '');
            business.business_ein_number = digits.includes('-')
                ? digits
                : `${digits.slice(0, 2)}-${digits.slice(2)}`;
        }
    }

    if (!business.phone_number?.trim()) {
        const pm =
            flat.match(/Business Telephone#?:\s*([\d\s().-]+)/i) ||
            flat.match(/Business Phone:\s*([\d\s().-]+)/i);
        const ph = cleanPhoneLocal(pm?.[1] ?? null);
        if (ph) {
            business.phone_number = ph;
        }
    }

    const emails = [...flat.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi)].map((x) => x[0]);
    if (emails.length) {
        if (!business.business_email?.trim() && looksLikeEmail(emails[0])) {
            business.business_email = emails[0];
        }
        const bizLow = (business.business_email || '').toLowerCase();
        const alt = emails.find((e) => e.toLowerCase() !== bizLow);
        if (!owner.owner_email?.trim() && alt) {
            owner.owner_email = alt;
        }
        if (!owner.owner_email?.trim() && emails.length === 1 && looksLikeEmail(emails[0]!)) {
            owner.owner_email = emails[0]!;
        }
    }

    if (!owner.owner_mobile_number?.trim() && business.phone_number) {
        const pb = rawText.match(/Phones:\s*([\s\S]{0,900}?)(?=Credit Score|Social Security|E-mail|Signature|$)/i);
        if (pb?.[1]) {
            const nums = [...pb[1].matchAll(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g)].map((mm) => cleanPhoneLocal(mm[0]));
            const bizDigits = (business.phone_number || '').replace(/\D/g, '');
            const alt = nums.find((n) => n && n.replace(/\D/g, '') !== bizDigits);
            if (alt) {
                owner.owner_mobile_number = alt;
            }
        }
    }

    if (!business.business_monthly_revenue?.trim()) {
        const mm = flat.match(/Average Monthly Revenue:\s*([$.,\d]+)/i);
        if (mm?.[1]) {
            business.business_monthly_revenue = mm[1].trim();
        }
        const ar = flat.match(/Annual Business Revenue:\s*([$.,\d]+)/i);
        if (ar?.[1] && !business.business_monthly_revenue?.trim()) {
            const conv = annualUsdToMonthlyString(ar[1]);
            if (conv) {
                business.business_monthly_revenue = conv;
            }
        }
    }

    if (!business.business_requested_amount?.trim()) {
        const am = flat.match(
            /(?:Requested Financing Amount|Amount Requested|Amount Seeking|Desired Funding Amount|Loan Amount):\s*([$.,\d\s-]+)/i,
        );
        if (am?.[1]) {
            const t = am[1].replace(/\s+/g, ' ').trim();
            if (t && !/^no$/i.test(t) && !/use of funds|existing business|yes|no/i.test(t)) {
                const money = cleanMoneyToken(t);
                if (money) {
                    business.business_requested_amount = money.slice(0, 120);
                }
            }
        }
    }

    const wm = flat.match(/Website:\s*(\S+)/i);
    if (wm?.[1] && !/^Industry$/i.test(wm[1]) && /\./.test(wm[1])) {
        if (!business.business_website?.trim()) {
            business.business_website = wm[1].replace(/[,;]+$/, '');
        }
    }

    const inc =
        flat.match(/Incorporation State:\s*([A-Z]{2})(?=Tax|State|Zip|\s|:|$)/i) ||
        flat.match(/State of Organization:\s*([A-Za-z]{2})\b/i);
    if (inc?.[1] && !business.business_incorporation_state?.trim()) {
        business.business_incorporation_state = inc[1].toUpperCase();
    }

    const ent = flat.match(
        /Legal Entity:\s*(LLC|LLP|Corp|Corporation|Sole Prop\.?|Sole Proprietor|Partnership)\b/i,
    );
    if (ent?.[1] && !business.business_type_of_entity?.trim()) {
        business.business_type_of_entity = ent[1];
    }

    if (!owner.owner_ownership_percentage?.trim()) {
        const om = flat.match(/% Ownership:\s*([\d.]+%?)/i);
        if (om?.[1]) {
            owner.owner_ownership_percentage = om[1].trim();
        }
    }
}

/** Every label we recognize when scanning for “next field” boundaries. */
const ALL_OCR_LABEL_PHRASES: readonly string[] = [
    'Legal Business Name',
    'Legal Company Name',
    'Business Legal Name',
    'Corporation Name',
    'Legal Name',
    'Legal / Corporate Name',
    'Legal/Corporate Name',
    'Company Name',
    'Business Name',
    'DBA Name',
    'DBA',
    'Doing Business As',
    'Business Address',
    'Physical Address',
    'Mailing Address',
    'Street Address',
    'Home Street Address',
    'Home Address',
    'Tax ID Number',
    'Tax ID',
    'Federal Tax ID',
    'Employer Identification Number',
    'EIN',
    'FEIN',
    'SSN',
    'Social Security Number',
    'Social Security #',
    'Social Security NO',
    'Phone Number',
    'Telephone',
    'Business Telephone',
    'Business Phone',
    'Cell',
    'Cell #',
    'Mobile',
    'Cell Phone',
    'Owner Name',
    'Applicant Name',
    'Principal Name',
    'Principal Owner',
    'Full Name',
    'First Name',
    'Last Name',
    'Owner First Name',
    'Owner Last Name',
    'Email',
    'E-mail',
    'E-mails',
    'Email Address',
    'Business Email',
    'Merchant Email',
    'Merchant Email Address',
    'Website',
    'Industry',
    'Incorporation State',
    'State of Organization',
    'State Incorporated',
    'Legal Entity',
    'Business Start Date',
    'Average Monthly Revenue',
    'Monthly Revenue',
    'Annual Business Revenue',
    'Gross Sales',
    'Gross Annual Sales',
    'Requested Financing Amount',
    'Desired Funding Amount',
    'Amount Seeking',
    'Amount Requested',
    'Loan Amount',
    'Date of Birth',
    'DOB',
    'Credit Score',
    'FICO Score',
    'Credit Score(Estimate)',
    '% Ownership',
    'Percent Ownership',
    'Ownership %',
    'City',
    'State',
    'Zip',
    'ZIP Code',
    'Zip Code',
];

/**
 * Map OCR lines / blob text into partial `business` / `owner` shapes used by `parseBusinessData`.
 */
export function parseOcrMappedFields(rawText: string): { business: BusinessPartial; owner: OwnerPartial } {
    const business: BusinessPartial = {};
    const owner: OwnerPartial = {};
    const stops = ALL_OCR_LABEL_PHRASES;

    const bizName = extractFieldAfterLabel(
        rawText,
        [
            'Legal Company Name',
            'Corporation Name',
            'Legal Business Name',
            'Business Legal Name',
            'Legal Name',
            'Legal/Corporate Name',
            'Legal / Corporate Name',
            'Company Name',
            'Business Name',
            
        ],
        { maxLen: 120, stopLabels: stops },
    );
    if (bizName?.trim()) {
        business.business_name = cleanBusinessNameLocal(bizName.trim());
    }

    const dba = extractFieldAfterLabel(rawText, ['DBA Name', 'Doing Business As', 'DBA','The Bussiness DBA Name'], {
        maxLen: 120,
        stopLabels: stops,
    });
    if (dba?.trim() && !business.business_name) {
        business.business_name = cleanBusinessNameLocal(dba.trim());
    }

    const addr = extractFieldAfterLabel(
        rawText,
        ['Business Address', 'Physical Address', 'Mailing Address', 'Street Address', 'Home Street Address', 'Address'],
        { maxLen: 220, stopLabels: stops },
    );
    if (addr?.trim()) {
        const a = addr.trim();
        const bn = (business.business_name || '').toLowerCase();
        if (!bn || a.toLowerCase() !== bn) {
            business.business_address1 = a;
        }
    }

    const ein = extractFieldAfterLabel(
        rawText,
        ['Tax ID Number', 'Tax ID', 'Federal Tax ID', 'Employer Identification Number', 'EIN', 'FEIN'],
        { maxLen: 24, stopLabels: stops },
    );
    if (ein?.trim()) {
        const v = ein.trim();
        const m = v.match(/\b\d{2}[-\s]?\d{7}\b/);
        business.business_ein_number = m ? m[0].replace(/\s/g, '') : v.replace(/\s/g, '').slice(0, 12);
    }

    const ssnRaw = extractFieldAfterLabel(
        rawText,
        ['SSN', 'Social Security Number', 'Social Security #', 'Social Security NO','Social Security No', 'S.S'],
        { maxLen: 22, stopLabels: stops },
    );
    if (ssnRaw?.trim()) {
        const digits = ssnRaw.replace(/\D/g, '');
        if (digits.length === 9) {
            owner.owner_ssn = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
        }
    }

    const phoneRaw = extractFieldAfterLabel(
        rawText,
        [
            'Business Telephone',
            'Business Telephone#',
            'Business Phone',
            'Phone Number',
            'Telephone',
            'Cell #',
            'Cell',
            'Mobile',
            'Phone',
            'Work Phone',
        ],
        { maxLen: 40, stopLabels: stops },
    );
    const phone = cleanPhoneLocal(phoneRaw?.replace(/\s*ext\.?.*/i, '').trim() ?? null);
    if (phone) {
        business.phone_number = phone;
    }

    const cityRaw = extractFieldAfterLabel(rawText, ['City'], { maxLen: 80, stopLabels: stops });
    const cityClean = cleanCityFromInlineOcr(cityRaw);
    if (cityClean && !/^\d+$/.test(cityClean)) {
        business.business_city = cityClean;
    }
    if (cityRaw?.trim()) {
        const stInline = cityRaw.match(/State:\s*([A-Z]{2})(?=Zip|ZIP|z|$|\s|,)/i);
        if (stInline?.[1]) {
            business.business_state = stInline[1].toUpperCase();
        }
    }

    const state = extractFieldAfterLabel(rawText, ['State'], { maxLen: 4, stopLabels: stops });
    if (
        state?.trim() &&
        /^[A-Za-z]{2}$/.test(state.trim()) &&
        !business.business_state?.trim()
    ) {
        business.business_state = state.trim().toUpperCase();
    }

    const zip = extractFieldAfterLabel(rawText, ['ZIP Code', 'Zip Code', 'Zip'], { maxLen: 12, stopLabels: stops });
    let zipM = zip?.match(/\b\d{5}(?:-\s*\d{4})?\b/);
    if (zipM) {
        business.business_zip_code = zipM[0].replace(/\s/g, '');
    } else if (cityRaw?.trim()) {
        const z2 = extractZipFromFragment(cityRaw);
        if (z2) {
            business.business_zip_code = z2;
        }
    }

    const incState = extractFieldAfterLabel(
        rawText,
        ['Incorporation State', 'State of Organization', 'State Incorporated'],
        { maxLen: 8, stopLabels: stops },
    );
    if (incState?.trim() && /^[A-Za-z]{2}$/.test(incState.trim())) {
        business.business_incorporation_state = incState.trim().toUpperCase();
    }

    const incDate = extractFieldAfterLabel(
        rawText,
        ['Business Start Date', 'Date Business Started', 'Incorporation Date', 'Business Inception Date'],
        { maxLen: 40, stopLabels: stops },
    );
    if (incDate?.trim()) {
        const id = incDate.trim();
        business.business_incorporation_date = parseSlashDateIso(id) ?? id.slice(0, 32);
    }

    const entity = extractFieldAfterLabel(rawText, ['Legal Entity', 'Type of Entity', 'Style of Business'], {
        maxLen: 40,
        stopLabels: stops,
    });
    if (entity?.trim() && !isLikelyOcrLabelArtifact(entity)) {
        const entT = entity.trim();
        const entPick = entT.match(/\b(LLC|LLP|Corp|Corporation|Sole Prop|Sole Proprietor|Partnership)\b/i);
        business.business_type_of_entity = (entPick ? entPick[1] : entT).slice(0, 60);
    }

    const web = extractFieldAfterLabel(rawText, ['Website', 'Business Website'], { maxLen: 200, stopLabels: stops });
    if (web?.trim() && /\./.test(web) && !isLikelyOcrLabelArtifact(web)) {
        business.business_website = web.trim().split(/\s+/)[0];
    }

    const bizEmail = extractFieldAfterLabel(
        rawText,
        ['Business Email', 'Merchant Email', 'Merchant Email Address', 'E-mail Address'],
        { maxLen: 120, stopLabels: stops },
    );
    if (bizEmail?.trim() && looksLikeEmail(bizEmail)) {
        business.business_email = bizEmail.trim();
    }

    const monthlyRev = extractFieldAfterLabel(
        rawText,
        ['Average Monthly Revenue', 'Monthly Revenue'],
        { maxLen: 40, stopLabels: stops },
    );
    if (monthlyRev?.trim()) {
        const mr = cleanMoneyToken(monthlyRev) ?? monthlyRev.trim().split(/\s+/)[0];
        if (mr && !/processing|credit card/i.test(monthlyRev)) {
            business.business_monthly_revenue = mr;
        }
    }
    const annualRev = extractFieldAfterLabel(
        rawText,
        ['Annual Business Revenue', 'Gross Annual Sales', 'Gross Sales'],
        { maxLen: 40, stopLabels: stops },
    );
    if (annualRev?.trim() && !business.business_monthly_revenue?.trim()) {
        const conv = annualUsdToMonthlyString(annualRev.trim());
        if (conv) {
            business.business_monthly_revenue = conv;
        }
    }

    const loanAmt = extractFieldAfterLabel(
        rawText,
        [
            'Requested Financing Amount',
            'Desired Funding Amount',
            'Amount Seeking',
            'Amount Requested',
            'Loan Amount',
            'Requested Amount',
        ],
        { maxLen: 120, stopLabels: stops },
    );
    if (loanAmt?.trim() && !isLikelyOcrLabelArtifact(loanAmt) && !/use of funds|existing business/i.test(loanAmt)) {
        const lm = cleanMoneyToken(loanAmt);
        if (lm) {
            business.business_requested_amount = lm.slice(0, 120);
        }
    }

    const ownerFull = extractFieldAfterLabel(
        rawText,
        ['Full Name', "Principal Owner's Name", 'Principal Owner', 'Owner Name', 'Applicant Name', 'Principal Name','The Owner Full Name','Owner Full Name'],
        { maxLen: 100, stopLabels: stops },
    );
    if (ownerFull?.trim() && !isLikelyOcrLabelArtifact(ownerFull)) {
        const cleaned = cleanOwnerFullName(ownerFull);
        const parts = (cleaned || '').split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            owner.owner_last_name = parts[parts.length - 1] ?? null;
            owner.owner_first_name = parts.slice(0, -1).join(' ') || null;
        }
    }

    const ownerEmail = extractFieldAfterLabel(
        rawText,
        ['Owner Email', 'Applicant Email', 'Principal Email','Personal Email'],
        { maxLen: 120, stopLabels: stops },
    );
    if (ownerEmail?.trim() && looksLikeEmail(ownerEmail)) {
        owner.owner_email = ownerEmail.trim();
    }

    const ownerMobileRaw = extractFieldAfterLabel(
        rawText,
        ['Owner Mobile', 'Owner Phone', 'Owner Telephone', 'Applicant Phone', 'Principal Phone', 'Cell Phone', 'Mobile Phone', 'Home Phone'],
        { maxLen: 40, stopLabels: stops },
    );
    const ownerMobile = cleanPhoneLocal(ownerMobileRaw?.trim() ?? null);
    if (ownerMobile) {
        owner.owner_mobile_number = ownerMobile;
    }

    const dobRaw = extractFieldAfterLabel(rawText, ['Date of Birth', 'DOB'], { maxLen: 32, stopLabels: stops });
    if (dobRaw?.trim()) {
        owner.owner_date_of_birth = parseSlashDateIso(dobRaw);
    }

    const ficoRaw = extractFieldAfterLabel(
        rawText,
        ['FICO Score', 'FICO Score (Estimate)','Personal Credit Score'],
        { maxLen: 40, stopLabels: stops },
    );
    if (ficoRaw?.trim() && !isLikelyOcrLabelArtifact(ficoRaw)) {
        const fr = ficoRaw.trim();
        const rangeM = fr.match(/\b(\d{3})\s*-\s*(\d{3})\b/);
        const oneM = fr.match(/\b(\d{3})\b/);
        if (rangeM) {
            owner.owner_fico_score = `${rangeM[1]}-${rangeM[2]}`;
        } else if (oneM) {
            owner.owner_fico_score = oneM[1];
        }
    }

    const ownPct = extractFieldAfterLabel(
        rawText,
        ['% Ownership', 'Percent Ownership', 'Ownership %'],
        { maxLen: 20, stopLabels: stops },
    );
    if (ownPct?.trim() && !isLikelyOcrLabelArtifact(ownPct)) {
        owner.owner_ownership_percentage = ownPct.trim();
    }

    supplementCompressedApplicationPatterns(rawText, business, owner);
    supplementOwnerPersonalTablePatterns(rawText, owner);

    // Clear owner noise so downstream fallback can safely repopulate.
    if (!looksLikeValidSsn(owner.owner_ssn)) {
        owner.owner_ssn = null;
    }
    if (!looksLikeValidFico(owner.owner_fico_score)) {
        owner.owner_fico_score = null;
    }

    if (owner.owner_date_of_birth?.includes('/')) {
        const iso = parseSlashDateIso(owner.owner_date_of_birth);
        if (iso) {
            owner.owner_date_of_birth = iso;
        }
    }

    return { business, owner };
}
