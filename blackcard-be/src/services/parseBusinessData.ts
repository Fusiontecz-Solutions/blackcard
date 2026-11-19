import { normalizeOcrTextForParsing, parseOcrMappedFields } from "./ocrFieldExtraction";
import { parseOCRLines } from "./ocrLineParser";
import { enrichAndSanitizeParsedOcr } from "./ocrSemanticMapping";
import { parseRobustSections } from "./robustSectionParser";

const LABELS = [
  "Legal/Corporate Name",
  "Legal Business Name",
  "Business Name",
  "Company Name",
  "Physical Address",
  "City",
  "State",
  "Zip",
  "Telephone #",
  "Length of Ownership",
  "Website",
  "Type of Entity",
  "Email Address",
  "Federal Tax ID",
  "Date Business Started",
  "Requested Amount",
  "Gross Annual Sales",
  "Applicant",
  "Owner First Name",
  "Owner Last Name",
  "Owner Email",
  "Owner Mobile",
  "Home Address",
  "Ownership %",
  "Credit Score",
  "SSN",
  "Date of Birth"
];


const getEntityType = (section: string) => {
  const regex = /Type of Entity\s*\(circle one\)\s*:\s*(\w+)/i;
  const match = section.match(regex);
  return match ? match[1].trim() : null;
};


const cleanBusinessName = (val: string | null) => {
  if (!val) return null;
  return val.replace(/DBA:?/gi, "").trim();
};

const cleanPhone = (val: string | null) => {
  if (!val) return null;

  const match = val.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);

  return match ? match[0] : null;
};


const cleanDate = (val: string | null) => {
  if (!val) return null;

  // Match formats like "May-14-1993" or "May 14 1993"
  const match = val.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[- ](\d{2})[- ](\d{4})\b/i
  );

  if (!match) return null;

  const monthMap: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };

  const monAbbr = match[1].slice(0, 3);
  const day = match[2];
  const year = match[3];
  const month = monthMap[monAbbr as keyof typeof monthMap];

  if (!month) return null;

  // Return ISO format yyyy-mm-dd so HTML date inputs can display it
  return `${year}-${month}-${day}`;
};

const parseSlashDate = (val: string | null): string | null => {
  if (!val) return null;
  const t = val.trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  let yyyy = parseInt(m[3], 10);
  yyyy += yyyy >= 70 ? 1900 : 2000;
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/** yyyy-mm-dd or d/m[/yy|yyyy] variants for OWNER DOB extraction. */
const normalizeStructuredDob = (val: string | null): string | null => {
  if (!val) return null;
  const trimmed = val.trim();
  const slash = parseSlashDate(trimmed);
  if (slash) return slash;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return cleanDate(trimmed);
};

/** Prosperum / similar MCAs: labels and values are not inline; text is one long line from pdf-parse. */
const isProsperumStyleForm = (t: string) =>
  /Prosperum Fund|Pre-qualification Form|Merchant Pre-Qualification Form/i.test(t);

type BusinessFields = {
  business_name: string | null;
  /** From OCR line parser (DBA); optional — not always sent to Prisma. */
  dba_name: string | null;
  business_address1: string | null;
  business_city: string | null;
  business_state: string | null;
  business_zip_code: string | null;
  phone_number: string | null;
  business_ein_number: string | null;
  business_incorporation_date: string | null;
  business_requested_amount: string | null;
  business_monthly_revenue: string | null;
  business_type_of_entity: string | null;
  business_email: string | null;
  business_website: string | null;
  business_address2: string | null;
  business_incorporation_state: string | null;
};

type OwnerFields = {
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  /** Owner / principal cell (distinct from business phone when extracted). */
  owner_mobile_number: string | null;
  owner_address1: string | null;
  owner_city: string | null;
  owner_state: string | null;
  owner_zip_code: string | null;
  owner_ownership_percentage: string | null;
  owner_fico_score: string | null;
  owner_ssn: string | null;
  owner_date_of_birth: string | null;
  owner_middle_name: string | null;
};

const parseProsperumStyleData = (
  rawText: string,
): { business: Partial<BusinessFields>; owner: Partial<OwnerFields> } | null => {
  const t = rawText.replace(/\s+/g, " ").trim();
  if (!isProsperumStyleForm(t)) return null;

  const business: Partial<BusinessFields> = {};
  const owner: Partial<OwnerFields> = {};

  const llcMatch = t.match(/\b([A-Z][A-Z0-9\s&.',-]{2,80}\s+LLC)\b/);
  if (llcMatch) {
    business.business_name = cleanBusinessName(llcMatch[1].replace(/\s+/g, " ").trim()) as string | null;
    business.business_type_of_entity = business.business_type_of_entity ?? "LLC";
  }

  const emails = [...t.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)]
    .map((m) => m[0])
    .filter((e) => !/prosperum|unsubscribe|transunion|experian|equifax/i.test(e));
  if (emails.length) {
    business.business_email = emails[0];
    owner.owner_email = emails[0];
  }

  const urls = [...t.matchAll(/https?:\/\/[^\s)]+/gi)].map((m) => m[0]).filter((u) => !/prosperum/i.test(u));
  if (urls.length) {
    business.business_website = urls[0];
  }

  const ssnMatch = t.match(/\b(\d{3}-\d{2}-\d{4})\b/);
  if (ssnMatch) {
    owner.owner_ssn = ssnMatch[1];
  }

  const nameSsnDob = t.match(
    /\b([a-z]{2,})\s+([a-z]{2,})\s+(\d{3}-\d{2}-\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\b/i,
  );
  if (nameSsnDob) {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    owner.owner_first_name = cap(nameSsnDob[1]);
    owner.owner_last_name = cap(nameSsnDob[2]);
    owner.owner_date_of_birth = parseSlashDate(nameSsnDob[4]);
  }

  const bizDateBeforeUrl = t.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+https:\/\//i);
  if (bizDateBeforeUrl) {
    business.business_incorporation_date = parseSlashDate(bizDateBeforeUrl[1]);
  }

  const einMatch = t.match(/\b(\d{2}-\d{7})\b/);
  if (einMatch) {
    business.business_ein_number = einMatch[1];
  }

  const phones = [...t.matchAll(/\b(\d{10})\b/g)]
    .map((m) => m[1])
    .filter((p) => !/^8(00|33|44|55|66|77|88)\d{7}$/.test(p));
  if (phones.length) {
    business.phone_number = phones[0];
  }

  const streetMatch = t.match(
    /\b(\d{3,6}\s+[A-Za-z][A-Za-z0-9]+(?:\s+[A-Za-z][A-Za-z0-9]+)*\s+(?:DR|ST|AVE|RD|BLVD|LN|CT|WAY)\.?)\b/i,
  );
  if (streetMatch) {
    const street = streetMatch[1].replace(/\s+/g, " ").trim();
    business.business_address1 = street;
    owner.owner_address1 = street;
  }

  // City may be ALL CAPS (e.g. SONORA); state+zip often appear as "ca95370"
  const cityStZip = t.match(/\b([A-Z][A-Za-z]{2,30})\s+([a-z]{2})\s*(\d{5})\b/);
  if (cityStZip) {
    const city = cityStZip[1].replace(/\s+/g, " ").trim();
    const st = cityStZip[2].toUpperCase();
    const zip = cityStZip[3];
    business.business_city = city;
    business.business_state = business.business_state ?? st;
    business.business_zip_code = zip;
    business.business_incorporation_state = business.business_incorporation_state ?? st;
    owner.owner_city = city;
    owner.owner_state = owner.owner_state ?? st;
    owner.owner_zip_code = zip;
  }

  const grossMatch = t.match(/\b(\d{1,3}(?:,\d{3})+)\b/);
  if (grossMatch) {
    business.business_monthly_revenue = grossMatch[1];
  }

  const stateOwnEmail = t.match(/\b([A-Z]{2})\s+(100)\s+[A-Za-z0-9._%+-]+@/);
  if (stateOwnEmail) {
    owner.owner_ownership_percentage = stateOwnEmail[2];
    const st = stateOwnEmail[1];
    business.business_state = business.business_state ?? st;
    business.business_incorporation_state = business.business_incorporation_state ?? st;
    owner.owner_state = owner.owner_state ?? st;
  }

  const filled: { business: Partial<BusinessFields>; owner: Partial<OwnerFields> } = { business, owner };
  const hasAnything =
    filled.business.business_name ||
    filled.owner.owner_ssn ||
    filled.business.business_email ||
    filled.owner.owner_first_name;

  return hasAnything ? filled : null;
};

function mergeBlocks<T extends Record<string, string | null>>(primary: T, extra: Partial<T>): T {
  const out = { ...primary };
  for (const key of Object.keys(extra) as (keyof T)[]) {
    const v = extra[key];
    if (v != null && v !== "" && (out[key] == null || out[key] === "")) {
      (out[key] as string | null) = v;
    }
  }
  return out;
}

function isValidSsn(v: string | null | undefined): boolean {
  if (!v) return false;
  return /^\d{3}-\d{2}-\d{4}$/.test(v.trim());
}

function isValidDob(v: string | null | undefined): boolean {
  if (!v) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

function isValidFico(v: string | null | undefined): boolean {
  if (!v) return false;
  const compact = v.replace(/\s+/g, "");
  /** Three-digit FICO only; realistic consumer range rejects ownership "100 %" misreads */
  const m = compact.match(/^(\d{3})(?:-\d{3})?$/);
  if (!m) return false;
  const n = parseInt(m[1], 10);
  return n >= 300 && n <= 850;
}

function isValidOwnership(v: string | null | undefined): boolean {
  if (!v) return false;
  return /^\d{1,3}(\.\d+)?%?$/.test(v.trim());
}

function isValidOwnerName(v: string | null | undefined): boolean {
  if (!v) return false;
  const t = v.trim();
  if (!t) return false;
  if (/\d/.test(t)) return false;
  if (/(ownership|percent|ssn|dob|fico|credit score)/i.test(t)) return false;
  const low = t.toLowerCase();
  if (
    /^(extracted|summary|unknown|document|none|not\s+provided)$/i.test(t) ||
    low === "claude"
  ) {
    return false;
  }
  return true;
}

function looksLikeLabelPollutedBusinessName(v: string | null | undefined): boolean {
  if (!v) return true;
  const t = v.trim().toLowerCase();
  if (!t) return true;
  return /(state of organization|address:|federal tax id|zip:|city:|legal entity)/i.test(t);
}

function cleanBusinessAddress1(v: string | null | undefined): string | null {
  if (!v) return null;
  let t = v.replace(/\s+/g, " ").trim();
  t = t.replace(/\b(suite\/fl|suite|city:|state:|zip:|federal tax id)\b.*$/i, "").trim();
  return t || null;
}

function cleanOwnerNameTokens(v: string | null | undefined): string {
  if (!v) return "";
  let t = v.replace(/\s+/g, " ").trim();
  t = t.replace(/\b(ownership\s*percent|ownership\s*%|%?\s*of\s*ownership)\b.*$/i, "").trim();
  t = t.replace(/\b(ssn|social security|dob|date of birth|fico|credit score)\b.*$/i, "").trim();
  t = t.replace(/[^A-Za-z\s.'-]/g, " ").replace(/\s+/g, " ").trim();
  return t;
}

function looksLikeEmailSimple(s: string | null | undefined): boolean {
  return !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(s).trim());
}

function normalizePhoneSimple(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, "");
  if (d.length < 10) return null;
  const ten = d.slice(-10);
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

function extractDistinctEmails(raw: string): string[] {
  const t = String(raw || "").replace(/\s+/g, " ");
  const re = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of t.matchAll(re)) {
    const e = m[0]!.toLowerCase();
    if (!seen.has(e)) {
      seen.add(e);
      out.push(m[0]!);
    }
  }
  return out;
}

function extractDistinctPhones(raw: string): string[] {
  const t = String(raw || "");
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\+?1?[\s(.-]*\d{3}[\s)./-]*\d{3}[\s./-]*\d{4}\b/g;
  for (const m of t.matchAll(re)) {
    const p = normalizePhoneSimple(m[0]);
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/**
 * MCA forms often use one personal email for both merchant and principal, or put "email" only in the business block.
 * Fill the missing side when we have a strong signal (principal named, or a single distinct address).
 */
function reconcileOwnerBusinessContactConsistency(
  rawText: string,
  parsed: { business: BusinessFields; owner: OwnerFields },
): void {
  const b = parsed.business;
  const o = parsed.owner;

  let biz = (b.business_email || "").trim();
  let own = (o.owner_email || "").trim();

  const emails = extractDistinctEmails(rawText);
  const principalNamed =
    isValidOwnerName(o.owner_first_name) && isValidOwnerName(o.owner_last_name);

  if (emails.length === 1 && looksLikeEmailSimple(emails[0])) {
    const one = emails[0]!;
    if (!biz) b.business_email = one;
    if (!own) o.owner_email = one;
    biz = (b.business_email || "").trim();
    own = (o.owner_email || "").trim();
  }

  if (!own && biz && looksLikeEmailSimple(biz)) {
    if (emails.length <= 1 || emails.every((e) => e.toLowerCase() === biz.toLowerCase()) || principalNamed) {
      o.owner_email = biz;
    }
  }

  if (!biz && own && looksLikeEmailSimple(own)) {
    b.business_email = own;
  }
}

function reconcileBusinessOwnerPhoneConsistency(
  rawText: string,
  parsed: { business: BusinessFields; owner: OwnerFields },
): void {
  const b = parsed.business;
  const o = parsed.owner;
  const phones = extractDistinctPhones(rawText);

  let biz = normalizePhoneSimple(b.phone_number);
  let own = normalizePhoneSimple(o.owner_mobile_number);
  if (biz) b.phone_number = biz;
  if (own) o.owner_mobile_number = own;

  if (phones.length === 1) {
    const one = phones[0]!;
    if (!biz) b.phone_number = one;
    if (!own) o.owner_mobile_number = one;
    return;
  }
  if (phones.length >= 2) {
    if (!biz) b.phone_number = phones[0]!;
    if (!own) o.owner_mobile_number = phones[1]!;
    return;
  }

  // If only one side is known, mirror as a fallback for downstream workflows.
  if (!b.phone_number && o.owner_mobile_number) b.phone_number = o.owner_mobile_number;
  if (!o.owner_mobile_number && b.phone_number) o.owner_mobile_number = b.phone_number;
}

function fillOwnerNamesFromApplicantLine(applicantRaw: string | null, owner: OwnerFields): void {
  const app = applicantRaw?.replace(/\s+/g, " ").trim();
  if (!app || /\d/.test(app)) return;
  const parts = app.split(/\s+/).filter(Boolean).filter((p) => !/^(dba|inc|llc)\.?$/i.test(p));
  if (parts.length < 2) return;
  if (!String(owner.owner_first_name || "").trim()) {
    owner.owner_first_name = parts.slice(0, -1).join(" ") || null;
  }
  if (!String(owner.owner_last_name || "").trim()) {
    owner.owner_last_name = parts[parts.length - 1]! || null;
  }
}

function enforceOwnerNameShape(owner: {
  owner_first_name: string | null;
  owner_last_name: string | null;
}): void {
  const cleanFirst = cleanOwnerNameTokens(owner.owner_first_name);
  const cleanLast = cleanOwnerNameTokens(owner.owner_last_name);

  // Case: first name accidentally includes full name + label suffix, last name is numeric/garbage.
  const joined = `${cleanFirst} ${cleanLast}`.trim();
  const parts = joined.split(/\s+/).filter(Boolean);
  const lastLooksBad = !cleanLast || /\d/.test(owner.owner_last_name || "") || !isValidOwnerName(cleanLast);
  if (parts.length >= 2 && (lastLooksBad || !isValidOwnerName(cleanFirst))) {
    owner.owner_first_name = parts[0] || null;
    owner.owner_last_name = parts[1] || null;
    return;
  }

  if (cleanFirst && isValidOwnerName(cleanFirst)) {
    owner.owner_first_name = cleanFirst;
  }
  if (cleanLast && isValidOwnerName(cleanLast)) {
    owner.owner_last_name = cleanLast;
  }
}

/** Business block → owner block: OCR may omit exact “OWNER/OFFICER” casing or property header. */
const OWNER_SECTION_START_MARKERS = [
  "OWNER/OFFICER INFORMATION",
  "OWNER & OFFICER INFORMATION",
  "OWNER INFORMATION",
] as const;

/** End of owner block when template omits “BUSINESS PROPERTY INFORMATION”. */
const OWNER_SECTION_END_MARKERS = [
  "BUSINESS PROPERTY INFORMATION",
  "ADDITIONAL EXTRACTED FIELDS",
  "QUALIFYING QUESTIONS",
  "MERCHANT CASH ADVANCE",
] as const;

function firstIndexOfAny(haystack: string, needles: readonly string[], from = 0): number {
  let best = -1;
  for (const n of needles) {
    const i = haystack.indexOf(n, from);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

function trimWebsiteOrNull(v: string | null): string | null {
  if (!v) return null;
  const t = v.replace(/\s+/g, " ").trim().replace(/[,;)]+$/, "");
  if (!t || !/\./.test(t)) return null;
  return t.slice(0, 500);
}

export const parseBusinessData = (text: string) => {

  const businessStart = text.indexOf("BUSINESS INFORMATION");
  const ownerStart = firstIndexOfAny(text, OWNER_SECTION_START_MARKERS);

  const businessSection =
    businessStart !== -1 && ownerStart !== -1
      ? text.substring(businessStart, ownerStart)
      : "";

  const ownerEnd =
    ownerStart !== -1
      ? (() => {
          const i = firstIndexOfAny(text, OWNER_SECTION_END_MARKERS, ownerStart + 1);
          return i === -1 ? text.length : i;
        })()
      : -1;

  const ownerSection = ownerStart !== -1 && ownerEnd > ownerStart ? text.substring(ownerStart, ownerEnd) : "";

  const normalize = (t: string) =>
    t
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/(\d)([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();

  const businessText = normalize(businessSection);
  const ownerText = normalize(ownerSection);

  const getValue = (section: string, label: string) => {
    const nextLabels = LABELS.join("|");
  
    const regex = new RegExp(
      `${label}\\s*:\\s*(.*?)\\s*(?=${nextLabels}\\s*:|$)`,
      "i"
    );
  
    const match = section.match(regex);
  
    return match ? match[1].trim() : null;
  };

  const bizFallbackRaw =
    businessStart !== -1
      ? text.substring(businessStart, ownerStart !== -1 ? ownerStart : text.length)
      : "";

  /** When section slicing fails but labels exist further in doc (missing intermediate headers). */
  const gvBiz = (label: string): string | null => {
    const v = getValue(businessText, label);
    return v ?? (bizFallbackRaw ? getValue(normalize(bizFallbackRaw), label) : null);
  };

  /** Wider slice (through EOF) catches owner fields when an end-marker is missing upstream. Prefer narrow `ownerText` first via regex. */
  const ownerWideNorm = ownerStart !== -1 ? normalize(text.substring(ownerStart)) : "";

  const gvOwn = (label: string): string | null => {
    return getValue(ownerText, label) ?? (ownerWideNorm ? getValue(ownerWideNorm, label) : null);
  };

  const firstValue = (...vals: Array<string | null | undefined>): string | null => {
    for (const v of vals) {
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return null;
  };

  const legacy = {
    business: {
      business_name: cleanBusinessName(
        firstValue(
          gvBiz("Legal/Corporate Name"),
          gvBiz("Legal Business Name"),
          gvBiz("Business Name"),
          gvBiz("Company Name"),
        )
      ),
      dba_name: null,
      business_address1: gvBiz("Physical Address"),
      business_city: gvBiz("City"),
      business_state: gvBiz("State"),
      business_zip_code: gvBiz("Zip"),
      phone_number: cleanPhone(
        gvBiz("Telephone #")
      ),
      business_ein_number: gvBiz("Federal Tax ID"),
      business_incorporation_date: cleanDate(
        gvBiz("Date Business Started")
      ),
      business_requested_amount: gvBiz("Requested Amount"),
      business_monthly_revenue: gvBiz("Gross Annual Sales"),
      business_type_of_entity: getEntityType(businessText || normalize(bizFallbackRaw)),
      business_email: (() => {
        const raw = gvBiz("Email Address");
        return raw && looksLikeEmailSimple(raw) ? raw.trim() : null;
      })(),
      business_website: trimWebsiteOrNull(gvBiz("Website")),
      business_address2: null,
      business_incorporation_state: null
    },

    owner: (() => {
      const applicantLine = ownerStart !== -1 ? gvOwn("Applicant") : null;
      const draft: OwnerFields = {
        owner_first_name: gvOwn("Owner First Name"),
        owner_last_name: gvOwn("Owner Last Name"),
        owner_email: gvOwn("Owner Email"),
        owner_mobile_number: cleanPhone(gvOwn("Owner Mobile")),
        owner_address1: gvOwn("Home Address"),
        owner_city: gvOwn("City"),
        owner_state: gvOwn("State"),
        owner_zip_code: gvOwn("Zip"),
        owner_ownership_percentage: gvOwn("Ownership %"),
        owner_fico_score: gvOwn("Credit Score"),
        owner_ssn: gvOwn("SSN"),
        owner_date_of_birth: normalizeStructuredDob(gvOwn("Date of Birth")),
        owner_middle_name: null,
      };
      fillOwnerNamesFromApplicantLine(applicantLine, draft);
      return draft;
    })(),
  };

  const prosperum = parseProsperumStyleData(text);
  const baseBusiness = prosperum ? mergeBlocks(legacy.business, prosperum.business) : legacy.business;
  const baseOwner = prosperum ? mergeBlocks(legacy.owner, prosperum.owner) : legacy.owner;

  // OCR: line-based parser first (labels / values on separate lines), then regex gap-fill.
  const ocrBody = normalizeOcrTextForParsing(text);
  const ocrLines = ocrBody.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const lineParsed = parseOCRLines(ocrLines);
  const ocrKeywords = parseOcrMappedFields(ocrBody);

  const { nature_of_business: _ocrNature, ...lineBusinessForMerge } = lineParsed.business;
  void _ocrNature;
  const businessAfterLines = mergeBlocks(baseBusiness, lineBusinessForMerge as Partial<BusinessFields>);
  const ownerAfterLines = mergeBlocks(baseOwner, lineParsed.owner as Partial<OwnerFields>);

  const parsed = {
    business: mergeBlocks(businessAfterLines, ocrKeywords.business as Partial<BusinessFields>),
    owner: mergeBlocks(ownerAfterLines, ocrKeywords.owner as Partial<OwnerFields>),
  };
  enrichAndSanitizeParsedOcr(text, parsed);

  // Robust section-based parser: patch noisy/mis-mapped fields without overriding good values.
  const robust = parseRobustSections(text);
  parsed.business = mergeBlocks(parsed.business, robust.business as Partial<BusinessFields>);
  if (looksLikeLabelPollutedBusinessName(parsed.business.business_name) && robust.business.business_name) {
    parsed.business.business_name = robust.business.business_name;
  }
  if (looksLikeLabelPollutedBusinessName(parsed.business.dba_name)) {
    if (robust.business.dba_name) parsed.business.dba_name = robust.business.dba_name;
    else if (robust.business.business_name) parsed.business.dba_name = robust.business.business_name;
  }
  parsed.business.business_address1 = cleanBusinessAddress1(parsed.business.business_address1);

  if ((!parsed.owner.owner_ssn || !isValidSsn(parsed.owner.owner_ssn)) && robust.owner.owner_ssn) {
    parsed.owner.owner_ssn = robust.owner.owner_ssn;
  }
  if ((!parsed.owner.owner_date_of_birth || !isValidDob(parsed.owner.owner_date_of_birth)) && robust.owner.owner_date_of_birth) {
    parsed.owner.owner_date_of_birth = robust.owner.owner_date_of_birth;
  }
  if (
    (!parsed.owner.owner_fico_score || !isValidFico(parsed.owner.owner_fico_score)) &&
    robust.owner.owner_fico_score &&
    isValidFico(robust.owner.owner_fico_score)
  ) {
    parsed.owner.owner_fico_score = robust.owner.owner_fico_score;
  }
  if ((!parsed.owner.owner_ownership_percentage || !isValidOwnership(parsed.owner.owner_ownership_percentage)) && robust.owner.owner_ownership_percentage) {
    parsed.owner.owner_ownership_percentage = robust.owner.owner_ownership_percentage;
  }
  if ((!parsed.owner.owner_first_name || !isValidOwnerName(parsed.owner.owner_first_name)) && robust.owner.owner_first_name) {
    parsed.owner.owner_first_name = robust.owner.owner_first_name;
  }
  if ((!parsed.owner.owner_last_name || !isValidOwnerName(parsed.owner.owner_last_name)) && robust.owner.owner_last_name) {
    parsed.owner.owner_last_name = robust.owner.owner_last_name;
  }

  // Ownership % is commonly "100"; never treat as a FICO score.
  if (parsed.owner.owner_fico_score && !isValidFico(parsed.owner.owner_fico_score)) {
    parsed.owner.owner_fico_score = null;
  }

  /** Parser noise from discarded AI metadata headings. */
  const fnLow = `${parsed.owner.owner_first_name ?? ""}`.trim().toLowerCase();
  const lnLow = `${parsed.owner.owner_last_name ?? ""}`.trim().toLowerCase();
  if (
    (fnLow === "extracted" && lnLow === "summary") ||
    fnLow === "summary" ||
    lnLow === "extracted" ||
    lnLow === "claude"
  ) {
    parsed.owner.owner_first_name = null;
    parsed.owner.owner_last_name = null;
  }

  // Final hard-stop sanitizer so merged labels like "Ownership Percent" never leak to API/DB.
  enforceOwnerNameShape(parsed.owner);

  reconcileOwnerBusinessContactConsistency(text, parsed);
  reconcileBusinessOwnerPhoneConsistency(text, parsed);

  /** Label bleed: “Requested Amount” / funding labels sometimes land in start-date field. */
  const incRaw = String(parsed.business.business_incorporation_date ?? "").trim();
  if (
    incRaw &&
    (/requested\s+amount|desired\s+funding|loan\s+amount/i.test(incRaw) ||
      (/:/.test(incRaw) && !/\d{4}/.test(incRaw) && !/\d{1,2}\/\d{1,2}/.test(incRaw)))
  ) {
    parsed.business.business_incorporation_date = null;
  }

  return parsed;
};