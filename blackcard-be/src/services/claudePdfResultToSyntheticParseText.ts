import type { PdfClaudeExtractResultDTO } from '../nestjs-claude-pdf/claude-pdf-extraction.service';

/** Lowercase snake_case lookup for heterogeneous Claude key_data keys. */
function normalizedLookup(kd: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(kd)) {
    const key = String(k)
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
      .replace(/_+/g, '_');
    const val = String(v ?? '').trim();
    if (!out[key]) out[key] = val;
  }
  return out;
}

function gv(n: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const key = a.toLowerCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_');
    const v = n[key];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

/** 9-digit SSN → xxx-xx-xxxx when possible (document may omit dashes). */
function formatNineDigitSsn(raw: string): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length !== 9) return String(raw ?? '').trim();
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** Split natural person name → first tokens + last token (e.g. Craig Linder). */
function splitFullPersonName(full: string): { first: string; last: string } | null {
  const t = full.replace(/\s+/g, ' ').trim();
  if (!t || !/[a-zA-Z]/.test(t)) return null;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    first: parts.slice(0, -1).join(' '),
    last: parts[parts.length - 1]!,
  };
}

/**
 * Reconstructs OCR-style labeled text so {@link parseBusinessData} legacy section
 * parsers and gap-fill merges still apply after Claude extraction.
 */
export function claudePdfResultToSyntheticParseText(result: PdfClaudeExtractResultDTO): string {
  const kd = normalizedLookup(result.key_data || {});

  const legalName = gv(
    kd,
    'business_name',
    'legal_business_name',
    'legal_corporate_name',
    'legal_name',
    'company_name',
    'corporate_name',
    'dba',
    'dba_name',
  );
  const phys = gv(
    kd,
    'physical_address',
    'business_address',
    'business_address1',
    'address',
    'street_address',
  );
  const city = gv(kd, 'city', 'business_city');
  const state = gv(kd, 'state', 'business_state');
  const zip = gv(kd, 'zip', 'zip_code', 'business_zip', 'business_zip_code');
  const phone = gv(kd, 'phone', 'telephone', 'business_phone', 'phone_number');
  const website = gv(kd, 'website', 'business_website', 'url');
  const entity = gv(kd, 'type_of_entity', 'entity_type', 'business_type_of_entity');
  const email = gv(
    kd,
    'email',
    'business_email',
    'merchant_email',
    'email_address',
    'e_mail',
    'business_email_address',
    'merchant_email_address',
    'contact_email_primary',
    'primary_email_address',
    'principal_business_email',
  );
  const ein = gv(kd, 'ein', 'federal_tax_id', 'tax_id', 'business_ein_number');
  const einDigits = ein.replace(/\D/g, '');
  /** IRS EIN: xx-xxxxxxx */
  const einDisp = einDigits.length === 9 ? `${einDigits.slice(0, 2)}-${einDigits.slice(2)}` : ein;
  const dateStarted = gv(
    kd,
    'date_business_started',
    'business_start_date',
    'incorporation_date',
    'business_incorporation_date',
    'business_established',
    'year_business_established',
  );
  const reqAmt = gv(
    kd,
    'requested_amount',
    'business_requested_amount',
    'loan_amount',
    'amount_requested',
    'funding_requested',
    'desired_funding',
    'desired_funding_amount',
    'desired_amount',
    'advance_amount_requested',
    'merchant_advance_request',
    'financing_requested',
    'capital_requested',
    'mca_requested_amount',
    'request_financing_amount',
    'requested_financing_amount',
    'requested_loan_amount',
    'loan_request_amount',
  );
  const grossSales = gv(
    kd,
    'gross_annual_sales',
    'annual_sales',
    'business_monthly_revenue',
    'revenue',
  );
  const lengthOwn = gv(kd, 'length_of_ownership', 'years_in_business');

  let ofn = gv(
    kd,
    'owner_first_name',
    'first_name',
    'principal_first_name',
    'signer_first_name',
  );
  let oln = gv(
    kd,
    'owner_last_name',
    'last_name',
    'principal_last_name',
    'signer_last_name',
  );
  const applicantFull =
    gv(
      kd,
      'applicant_name',
      'applicant',
      'merchant_owner_name',
      'principal_name',
      'owner_full_name',
      'signer_name',
      'authorized_signer_name',
      'merchant_owner_primary',
      'borrower_name',
    );

  // Many MCA forms label a single Applicant/Merchant line — derive first/last when missing pieces.
  if ((!ofn || !oln) && applicantFull && applicantFull.includes(' ')) {
    const split = splitFullPersonName(applicantFull);
    if (split) {
      if (!ofn) ofn = split.first;
      if (!oln) oln = split.last;
    }
  }
  const oemail = gv(
    kd,
    'owner_email',
    'principal_email',
    'personal_email',
    'applicant_email',
    'contact_email',
    'signer_email',
    'authorized_signer_email',
    'primary_contact_email',
  );
  const home = gv(kd, 'home_address', 'owner_address', 'owner_address1', 'residential_address');
  const ocity = gv(kd, 'owner_city', 'home_city');
  const ostate = gv(kd, 'owner_state', 'home_state');
  const ozip = gv(kd, 'owner_zip', 'owner_zip_code', 'home_zip');
  const omobile = gv(
    kd,
    'owner_mobile',
    'owner_mobile_number',
    'owner_phone',
    'mobile_phone',
    'cell_phone',
    'applicant_phone',
    'principal_phone',
    'phone_mobile',
  );
  const ownPct = gv(kd, 'ownership_percent', 'ownership_percentage', 'owner_ownership_percentage');
  const fico = gv(kd, 'credit_score', 'fico', 'owner_fico_score');
  const rawSsn = gv(kd, 'ssn', 'owner_ssn', 'social_security_number');
  const ssn = rawSsn ? formatNineDigitSsn(rawSsn) : '';
  const dob = gv(kd, 'date_of_birth', 'dob', 'owner_date_of_birth');

  /** Many PDFs emit a single `email` for the merchant owner — echo to owner block when separate key missing. */
  const hasOwnerSignal = Boolean(
    (ofn && oln) || applicantFull || rawSsn || dob || home,
  );
  const oemailResolved = oemail || (hasOwnerSignal && email ? email : '');

  // Only map keys we did not emit in labeled blocks — NEVER append summaries/titles into parse text:
  // they pollute OCR heuristics (e.g. "EXTRACTED SUMMARY" → bogus owner names).
  const emittedSynonyms = new Set(
    [
        'business_name',
        'legal_business_name',
        'legal_corporate_name',
        'legal_name',
        'company_name',
        'corporate_name',
        'dba',
        'dba_name',
        'physical_address',
        'business_address',
        'business_address1',
        'address',
        'street_address',
        'city',
        'business_city',
        'state',
        'business_state',
        'zip',
        'zip_code',
        'business_zip',
        'business_zip_code',
        'phone',
        'telephone',
        'business_phone',
        'phone_number',
        'website',
        'business_website',
        'url',
        'type_of_entity',
        'entity_type',
        'business_type_of_entity',
        'email',
        'business_email',
        'email_address',
        'ein',
        'federal_tax_id',
        'tax_id',
        'business_ein_number',
        'date_business_started',
        'business_start_date',
        'incorporation_date',
        'business_incorporation_date',
        'requested_amount',
        'business_requested_amount',
        'loan_amount',
        'amount_requested',
        'funding_requested',
        'desired_funding',
        'desired_funding_amount',
        'desired_amount',
        'advance_amount_requested',
        'merchant_advance_request',
        'financing_requested',
        'capital_requested',
        'mca_requested_amount',
        'request_financing_amount',
        'requested_financing_amount',
        'requested_loan_amount',
        'loan_request_amount',
        'gross_annual_sales',
        'annual_sales',
        'business_monthly_revenue',
        'revenue',
        'length_of_ownership',
        'years_in_business',
        'owner_first_name',
        'first_name',
        'principal_first_name',
        'owner_last_name',
        'last_name',
        'principal_last_name',
        'owner_email',
        'principal_email',
        'personal_email',
        'applicant_email',
        'contact_email',
        'signer_email',
        'authorized_signer_email',
        'primary_contact_email',
        'home_address',
        'owner_address',
        'owner_address1',
        'residential_address',
        'owner_city',
        'home_city',
        'owner_state',
        'home_state',
        'owner_zip',
        'owner_zip_code',
        'home_zip',
        'owner_mobile',
        'owner_mobile_number',
        'owner_phone',
        'mobile_phone',
        'cell_phone',
        'applicant_phone',
        'principal_phone',
        'phone_mobile',
        'ownership_percent',
        'ownership_percentage',
        'owner_ownership_percentage',
        'credit_score',
        'fico',
        'owner_fico_score',
        'ssn',
        'owner_ssn',
        'social_security_number',
        'date_of_birth',
        'dob',
        'owner_date_of_birth',
        'business_established',
        'year_business_established',
        'applicant',
        'applicant_name',
        'merchant_owner_name',
        'authorized_signer_name',
        'signer_name',
        'signer_first_name',
        'signer_last_name',
        'borrower_name',
        'owner_full_name',
        'merchant_owner_primary',
        'principal_name',
    ].map((x) => x.toLowerCase()),
  );

  const extraLines: string[] = [];
  for (const [k, v] of Object.entries(result.key_data || {})) {
    if (!v || !String(v).trim()) continue;
    const nk = String(k)
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
      .replace(/_+/g, '_');
    const used = emittedSynonyms;
    if (
      used.has(nk) ||
      /^(document_)?title$/i.test(nk) ||
      /^summary$/i.test(nk) ||
      nk.includes('page_note')
    ) {
      continue;
    }
    extraLines.push(`${k}: ${String(v).trim()}`);
  }

  const parts: string[] = [
    'BUSINESS INFORMATION',
    '',
    `Legal/Corporate Name : ${legalName}`,
    `Business Name : ${legalName}`,
    `Physical Address : ${phys}`,
    `City : ${city}`,
    `State : ${state}`,
    `Zip : ${zip}`,
    `Telephone # : ${phone}`,
    `Length of Ownership : ${lengthOwn}`,
    `Website : ${website}`,
    `Type of Entity : ${entity}`,
    `Email Address : ${email}`,
    `Federal Tax ID : ${einDisp}`,
    `Date Business Started : ${dateStarted}`,
    `Requested Amount : ${reqAmt}`,
    `Gross Annual Sales : ${grossSales}`,
    '',
    'OWNER/OFFICER INFORMATION',
    '',
    /** Two lines so `parseOCRLines` treats `Applicant:` as a label (inline `Applicant : name` is skipped). */
    ...(applicantFull ? ['Applicant:', applicantFull, ''] : []),
    `Owner First Name : ${ofn}`,
    `Owner Last Name : ${oln}`,
    `Owner Email : ${oemailResolved}`,
    `Owner Mobile : ${omobile}`,
    `Home Address : ${home}`,
    `City : ${ocity}`,
    `State : ${ostate}`,
    `Zip : ${ozip}`,
    `Ownership % : ${ownPct}`,
    `Credit Score : ${fico}`,
    `SSN : ${ssn}`,
    `Date of Birth : ${dob}`,
    '',
    'BUSINESS PROPERTY INFORMATION',
    '',
    // Optional: supplemental key/value rows only — no free-form summaries (those break OCR merges).
    ...(extraLines.length > 0
      ? ['ADDITIONAL EXTRACTED FIELDS', '', ...extraLines, '']
      : []),
  ];

  return parts.join('\n');
}
