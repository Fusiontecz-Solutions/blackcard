/**
 * Robust OCR parser:
 * - section-based
 * - regex-first for structured fields
 * - controlled lookahead (1-3 lines)
 * - strict value validation to avoid label/value mixing
 */

type Sections = {
    business: string;
    ownership: string;
};

export type RobustBusinessFields = {
    business_name?: string | null;
    dba_name?: string | null;
    business_ein_number?: string | null;
    business_incorporation_date?: string | null;
    business_type_of_entity?: string | null;
    business_requested_amount?: string | null;
    business_address1?: string | null;
    business_city?: string | null;
    business_state?: string | null;
    business_zip_code?: string | null;
};

export type RobustOwnerFields = {
    owner_first_name?: string | null;
    owner_last_name?: string | null;
    owner_ssn?: string | null;
    owner_date_of_birth?: string | null;
    owner_fico_score?: string | null;
    owner_ownership_percentage?: string | null;
};

export type RobustParsed = {
    business: RobustBusinessFields;
    owner: RobustOwnerFields;
};

const EIN_RE = /\b\d{2}-\d{7}\b/;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
const DATE_SLASH_RE = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;
const AMOUNT_RE = /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g;
const ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;
const STATE_RE = /\b[A-Z]{2}\b/;

function normalizeText(raw: string): string {
    return (raw || "")
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((l) => l.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function sectionSlice(src: string, startRe: RegExp, endRes: readonly RegExp[]): string {
    const m = src.match(startRe);
    if (!m || m.index == null) return "";
    const start = m.index;
    const tail = src.slice(start + m[0].length);
    let end = tail.length;
    for (const re of endRes) {
        const em = tail.match(re);
        if (em?.index != null && em.index >= 0) {
            end = Math.min(end, em.index);
        }
    }
    return tail.slice(0, end).trim();
}

/**
 * Slice starting after whichever `starts` regex matches earliest, until the earliest `ends`
 * match inside the remainder (exclusive). Use `m`/`i` flags on patterns that use `^...$`.
 */
function sliceBetweenFirstStartAndEnds(
    src: string,
    starts: readonly RegExp[],
    ends: readonly RegExp[],
): string {
    let bestIdx: number | null = null;
    let bestHdrLen = 0;

    for (const re of starts) {
        const m = src.match(re);
        if (m?.index != null && m.index >= 0 && m[0].length >= 1) {
            if (bestIdx === null || m.index < bestIdx) {
                bestIdx = m.index;
                bestHdrLen = m[0].length;
            }
        }
    }

    if (bestIdx == null) return "";
    const tail = src.slice(bestIdx + bestHdrLen);
    let endPos = tail.length;
    for (const re of ends) {
        const em = tail.match(re);
        if (em?.index != null && em.index >= 0) {
            endPos = Math.min(endPos, em.index);
        }
    }
    return tail.slice(0, endPos).trim();
}

/**
 * MCA / lending PDFs vary section titles (“Business Information”, “Merchant Profile”, …).
 * Anything before the owner/applicant slice is tentatively treated as business context.
 */
function sliceBeforeOwnerRegion(body: string): string {
    const ownerEnds: RegExp[] = [
        /\bOWNER\/OFFICER\s+INFORMATION\b/im,
        /\bMERCHANT\s*\/\s*OWNER\b/im,
        /\bOWNER\s+(?:INFORMATION|DETAILS)\b/im,
        /^OWNER\s*&\s*OFFICER\b/im,
        /^APPLICANT(?:\s+INFORMATION|\s+DETAILS|\s+SECTION)?\b/im,
        /^OWNERSHIP\s+INFORMATION\b/im,
        /\bPERSONAL\s+INFORMATION\s+(?:ON\s+)?OWNERS?\b/im,
        /^MERCHANT\s*\/\s*OWNER/im,
    ];

    let first = body.length;
    for (const re of ownerEnds) {
        const em = body.match(re);
        if (em?.index != null && em.index >= 0 && em.index > 80) {
            first = Math.min(first, em.index);
        }
    }
    return first < body.length ? body.slice(0, first).trim() : "";
}

export function splitSections(text: string): Sections {
    const body = normalizeText(text);

    const businessEnds: RegExp[] = [
        /\bOWNER\/OFFICER\s+INFORMATION\b/im,
        /\bMERCHANT\s*\/\s*OWNER\b/im,
        /\bOWNER\s+(?:INFORMATION|DETAILS)\b/im,
        /^OWNER\s*&\s*OFFICER\b/im,
        /^APPLICANT(?:\s+INFORMATION|\s+DETAILS|\s+SECTION)?\b/im,
        /\bGUARANTOR\b/im,
        /\bOWNERSHIP\s+INFORMATION\b/im,
        /\bPERSONAL\s+INFORMATION\s+(?:ON\s+)?OWNERS?\b/im,
    ];

    const businessStarts: RegExp[] = [
        /\bBUSINESS\s+(?:INFORMATION|PROFILE|DETAILS)(?:\s+SECTION)?\b/im,
        /\bMERCHANT\s+(?:INFORMATION|BUSINESS\s+PROFILE|PROFILE|DETAILS)\b/im,
        /\bCOMPANY\s+(?:INFORMATION|PROFILE|DETAILS)\b/im,
        /\bBUSINESS\s+AND\s+FUNDING\b/im,
    ];

    let business = sliceBetweenFirstStartAndEnds(body, businessStarts, businessEnds);

    if (!business.trim()) {
        business = sliceBeforeOwnerRegion(body);
    }

    const ownerStarts: RegExp[] = [
        /\bOWNER\/OFFICER\s+INFORMATION\b/im,
        /\bMERCHANT\s*\/\s*OWNER(?:\s+INFORMATION)?\b/im,
        /\bOWNER\s+(?:INFORMATION|DETAILS|PROFILE)\b/im,
        /^OWNER\s*&\s*OFFICER\b/im,
        /^APPLICANT(?:\s+INFORMATION|\s+DETAILS|\s+SECTION)?\b/im,
        /\bOWNERSHIP\s+INFORMATION\b/im,
        /\bPERSONAL\s+INFORMATION\s+(?:ON\s+)?OWNERS?\b/im,
        /\bGUARANTOR\s+(?:INFORMATION|DETAILS)\b/im,
    ];

    const ownerEnds: RegExp[] = [
        /\bAUTHORIZATION\b/im,
        /\bSIGNATURE\s*(?:\s+BLOCK)?\b/im,
        /\bQUALIFYING\s+QUESTIONS\b/im,
        /\bMERCHANT\s+CASH\s+ADVANCE\b/im,
        /\bLEGAL\s+(?:AUTHORIZATION|ELECTRONIC)\b/im,
        /\bBANK(?:ING)?\b.*\bINFORMATION\b/im,
        /\bADDITIONAL\s+EXTRACTED\s+FIELDS\b/im,
    ];

    let ownership = sliceBetweenFirstStartAndEnds(body, ownerStarts, ownerEnds);

    if (!ownership.trim()) {
        for (const startRe of ownerStarts) {
            ownership = sectionSlice(body, startRe, ownerEnds);
            if (ownership.trim()) break;
        }
    }

    return { business, ownership };
}

function toLines(text: string): string[] {
    return normalizeText(text)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
}

function looksLikeLabel(line: string): boolean {
    const t = line.trim().toLowerCase();
    return (
        t.endsWith(":") ||
        /^(name|fico|dob|date of birth|social security|ssn|ownership|address|city|state|zip|tax id|ein|business|amount|loan)/i.test(
            t,
        )
    );
}

function isValid(value: string | null | undefined): boolean {
    if (!value) return false;
    const t = value.trim();
    if (t.length <= 2) return false;
    if (t.includes(":")) return false;
    if (/(email|address|name|social security|ssn|fico|ownership|city|state|zip)/i.test(t) && !/\d/.test(t)) {
        return false;
    }
    return true;
}

function stripInlineTrailingLabels(value: string, labels: readonly string[]): string {
    let out = value.trim();
    const low = out.toLowerCase();
    let cut = out.length;
    for (const label of labels) {
        const i = low.indexOf(label.toLowerCase());
        if (i > 0) {
            cut = Math.min(cut, i);
        }
    }
    out = out.slice(0, cut).trim();
    return out;
}

function lookaheadValue(lines: readonly string[], idx: number, max = 3): string | null {
    const parts: string[] = [];
    for (let i = idx + 1; i < lines.length && i <= idx + max; i += 1) {
        const l = lines[i]!.trim();
        if (!l) continue;
        if (looksLikeLabel(l)) break;
        if (!isValid(l)) continue;
        parts.push(l);
    }
    if (!parts.length) return null;
    // controlled merge only when likely a split value.
    return parts.slice(0, 2).join(" ").trim();
}

function extractByLabels(lines: readonly string[], labels: readonly RegExp[], maxLookahead = 3): string | null {
    for (let i = 0; i < lines.length; i += 1) {
        const l = lines[i]!;
        if (!labels.some((re) => re.test(l))) continue;
        const sameLine = l.split(":").slice(1).join(":").trim();
        if (isValid(sameLine)) return sameLine;
        const v = lookaheadValue(lines, i, maxLookahead);
        if (isValid(v)) return v;
    }
    return null;
}

function toIsoDate(v: string | null): string | null {
    if (!v) return null;
    const s = v.match(DATE_SLASH_RE)?.[0];
    if (s) {
        const [mm, dd, yyyy] = s.split("/");
        return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    const digits = v.replace(/\D/g, "");
    if (digits.length === 8) {
        const mm = digits.slice(0, 2);
        const dd = digits.slice(2, 4);
        const yyyy = digits.slice(4);
        const m = Number(mm);
        const d = Number(dd);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${yyyy}-${mm}-${dd}`;
    }
    return null;
}

/** FICO must not pick up ownership "100" or arbitrary 3-digit codes. */
function coerceFicoScore(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const compact = raw.replace(/\s+/g, "");
    const range = compact.match(/^(\d{3})-(\d{3})$/);
    if (range) {
        const a = Number(range[1]);
        const b = Number(range[2]);
        if (a >= 300 && a <= 850 && b >= 300 && b <= 850 && b >= a) return `${a}-${b}`;
        return null;
    }
    const single = compact.match(/^(\d{3})$/);
    if (single) {
        const n = Number(single[1]);
        if (n >= 300 && n <= 850) return single[1]!;
    }
    return null;
}

function parseAddressLine(input: string | null): { address1: string | null; city: string | null; state: string | null; zip: string | null } {
    if (!input) return { address1: null, city: null, state: null, zip: null };
    let t = input.replace(/\s+/g, " ").trim();
    t = stripInlineTrailingLabels(t, ["suite/fl", "suite", "federal tax id", "city:", "state:", "zip:"]);
    const zip = t.match(ZIP_RE)?.[0] ?? null;
    const state = t.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/)?.[1] ?? null;
    const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
    let address1: string | null = null;
    let city: string | null = null;
    if (parts.length >= 3) {
        address1 = parts[0] ?? null;
        city = parts[1] ?? null;
    } else if (parts.length === 2) {
        address1 = parts[0] ?? null;
        city = parts[1]?.replace(/\b[A-Z]{2}\b.*$/, "").trim() || null;
    } else {
        address1 = t;
    }
    return { address1, city, state, zip };
}

function parseOwnerSection(section: string): RobustOwnerFields {
    const lines = toLines(section);
    const owner: RobustOwnerFields = {};
    const blob = lines.join("\n");

    const ssn = blob.match(SSN_RE)?.[0] ?? null;
    if (ssn) owner.owner_ssn = ssn;

    const dob = toIsoDate(blob.match(DATE_SLASH_RE)?.[0] ?? extractByLabels(lines, [/^DOB\b/i, /Date of Birth/i], 3));
    if (dob) owner.owner_date_of_birth = dob;

    const own = extractByLabels(lines, [/%\s*of\s*Ownership/i, /Ownership\s*%/i], 2) ?? blob.match(/\b(100|[1-9]?\d(?:\.\d+)?)\s*%?\b/)?.[1] ?? null;
    if (own && /^\d{1,3}(?:\.\d+)?%?$/.test(own)) owner.owner_ownership_percentage = own;

    const ficoLabel = extractByLabels(lines, [/^FICO\b/i, /Credit Score/i, /\bBeacon\b/i], 2);
    const ficoFromBlob = blob.match(/\b(?:FICO|credit\s+score)\s*[:\s]+\s*(\d{3}(?:\s*-\s*\d{3})?)\b/i)?.[1] ?? null;
    const fico = coerceFicoScore(ficoLabel ?? ficoFromBlob);
    if (fico) owner.owner_fico_score = fico;

    const applicantName = extractByLabels(
        lines,
        [
            /^Applicant\b/i,
            /\bMerchant\s+Owner\b/i,
            /\bBusiness\s+Owner\b/i,
            /^Signer\s+Name\b/i,
            /\bPertinent\s+Signature\b/i,
            /\bPertinant\s+Signature\b/i,
            /^Owner\s+Name\b/i,
        ],
        3,
    );
    if (applicantName && isValid(applicantName)) {
        const parts = applicantName.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            owner.owner_first_name = parts[0]!;
            owner.owner_last_name = parts[parts.length - 1]!;
        }
    }

    // Generic "Name" row under Owner heading (prefer Applicant/signers when extracted above).
    if (!owner.owner_first_name || !owner.owner_last_name) {
        const ownerStart = lines.findIndex((l) => /^name\b/i.test(l));
        if (ownerStart !== -1) {
            const window = lines.slice(ownerStart, Math.min(ownerStart + 6, lines.length)).join(" ");
            const m = window.match(/name(?:\s+fico)?\s+([A-Za-z.'-]+)\s+([A-Za-z.'-]+)/i);
            if (m?.[1] && m?.[2]) {
                owner.owner_first_name = m[1];
                owner.owner_last_name = m[2];
            }
        }
    }
    if (!owner.owner_first_name || !owner.owner_last_name) {
        for (const l of lines) {
            if (!isValid(l)) continue;
            if (/\d/.test(l)) continue;
            if (looksLikeLabel(l)) continue;
            if (/\b(LLC|L\.L\.C\.|INC\.?|CORP\.?|LP)\b/i.test(l)) continue;
            const parts = l.split(/\s+/).filter(Boolean);
            if (parts.length >= 2) {
                owner.owner_first_name = parts[0]!;
                owner.owner_last_name = parts[1]!;
                break;
            }
        }
    }

    return owner;
}

function parseBusinessSection(section: string): RobustBusinessFields {
    const lines = toLines(section);
    const business: RobustBusinessFields = {};
    const blob = lines.join("\n");

    const ein = blob.match(EIN_RE)?.[0] ?? null;
    if (ein) business.business_ein_number = ein;

    const date = toIsoDate(
        extractByLabels(lines, [/Business Start Date/i, /Date Business Started/i, /Inception Date/i], 3) ??
            blob.match(DATE_SLASH_RE)?.[0] ??
            null,
    );
    if (date) business.business_incorporation_date = date;

    const entity =
        extractByLabels(lines, [/Style of Business/i, /Type of Entity/i, /Legal Entity/i], 2) ??
        blob.match(/\b(LLC|LLP|Corporation|Corp|Sole Prop(?:rietor)?|Partnership)\b/i)?.[1] ??
        null;
    if (entity) business.business_type_of_entity = entity;

    const requested =
        extractByLabels(lines, [/Advance Amount Requested/i, /Amount Requested/i, /Loan Amount/i, /Desired Funding/i], 2) ??
        (([...(blob.match(AMOUNT_RE) || [])].join(" ").trim() || null));
    if (requested) business.business_requested_amount = requested;

    const addressLine =
        extractByLabels(lines, [/Business Address/i, /Physical Address/i, /^Address/i], 3) ??
        lines.find((l) => /\d{3,6}\s+\w+/.test(l) && /,/.test(l)) ??
        null;
    const addr = parseAddressLine(addressLine);
    business.business_address1 = addr.address1;
    business.business_city = addr.city;
    business.business_state = addr.state;
    business.business_zip_code = addr.zip;

    const dbaRaw = extractByLabels(lines, [/Doing\s+Business\s+As/i, /\bDBA\s+Name\b/i, /\bDBA\b/i], 3);
    if (dbaRaw) {
        const d = stripInlineTrailingLabels(dbaRaw, ["ein", "address", "phone", "fax"]).replace(/^dba:?\s*/i, "").trim();
        if (d && !/^(yes|no|n\/a)$/i.test(d) && d.length >= 2 && !looksLikeLabel(d)) business.dba_name = d;
    }

    const nameRaw =
        extractByLabels(
            lines,
            [
                /Legal\s*[/,&]\s*Corporate\s+Name/i,
                /\bCorporate\s+(?:Legal\s+)?Name\b/i,
                /Legal Business Name/i,
                /Company Name/i,
                /Corporation Name/i,
                /Business Legal Name/i,
                /^Legal\s+Name\b/i,
            ],
            2,
        ) ?? null;
    const name = nameRaw
        ? stripInlineTrailingLabels(nameRaw, [
              "legal entity",
              "dba",
              "state of organization",
              "address",
              "federal tax id",
              "city",
              "zip",
          ])
        : null;
    if (name && !/dba name|business phone|start date|state of organization|address:/i.test(name) && name.length >= 3) {
        business.business_name = name.replace(/DBA:?/gi, "").trim();
    }

    return business;
}

export function parseRobustSections(rawText: string): RobustParsed {
    const clean = normalizeText(rawText);
    const sections = splitSections(clean);
    return {
        business: parseBusinessSection(sections.business),
        owner: parseOwnerSection(sections.ownership),
    };
}

