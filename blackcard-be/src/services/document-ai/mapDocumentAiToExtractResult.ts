import type { google } from '@google-cloud/documentai/build/protos/protos';
import type { PdfClaudeExtractResultDTO } from '../../nestjs-claude-pdf/claude-pdf-extraction.service';
import { preferBetterEin, resolveEin } from '../einSanitizer';

type Document = google.cloud.documentai.v1.IDocument;
type TextAnchor = google.cloud.documentai.v1.Document.ITextAnchor;

function normalizeFieldKey(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[#:]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function textFromAnchor(document: Document, anchor?: TextAnchor | null): string {
  const full = String(document.text || '');
  if (!anchor?.textSegments?.length) return '';
  return anchor.textSegments
    .map((seg) => {
      const start = Number(seg.startIndex ?? 0);
      const end = Number(seg.endIndex ?? 0);
      return full.substring(start, end);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const FIELD_ALIASES: Record<string, string> = {
  legal_corporate_name: 'business_name',
  legal_business_name: 'business_name',
  legal_name: 'business_name',
  company_name: 'business_name',
  corporate_name: 'business_name',
  merchant_name: 'business_name',
  business_name: 'business_name',
  dba: 'dba_name',
  dba_name: 'dba_name',
  doing_business_as: 'dba_name',
  physical_address: 'physical_address',
  business_address: 'physical_address',
  street_address: 'physical_address',
  address: 'physical_address',
  city: 'city',
  business_city: 'city',
  state: 'state',
  business_state: 'state',
  zip: 'zip',
  zip_code: 'zip',
  business_zip: 'zip',
  telephone: 'phone',
  phone: 'phone',
  business_phone: 'phone',
  phone_number: 'phone',
  email: 'email',
  business_email: 'email',
  email_address: 'email',
  federal_tax_id: 'ein',
  tax_id: 'ein',
  ein: 'ein',
  business_ein_number: 'ein',
  requested_amount: 'requested_amount',
  loan_amount: 'requested_amount',
  amount_requested: 'requested_amount',
  funding_requested: 'requested_amount',
  gross_annual_sales: 'gross_annual_sales',
  annual_sales: 'gross_annual_sales',
  owner_first_name: 'owner_first_name',
  first_name: 'owner_first_name',
  principal_first_name: 'owner_first_name',
  owner_last_name: 'owner_last_name',
  last_name: 'owner_last_name',
  principal_last_name: 'owner_last_name',
  applicant_name: 'applicant_name',
  applicant: 'applicant_name',
  owner_name: 'applicant_name',
  principal_name: 'applicant_name',
  ssn: 'ssn',
  social_security_number: 'ssn',
  owner_ssn: 'ssn',
  date_of_birth: 'date_of_birth',
  dob: 'date_of_birth',
  owner_mobile: 'owner_mobile',
  mobile_phone: 'owner_mobile',
  cell_phone: 'owner_mobile',
  owner_phone: 'owner_mobile',
  home_address: 'home_address',
  owner_address: 'home_address',
  residential_address: 'home_address',
  owner_city: 'owner_city',
  owner_state: 'owner_state',
  owner_zip: 'owner_zip',
  ownership_percent: 'ownership_percent',
  ownership_percentage: 'ownership_percent',
  credit_score: 'credit_score',
  fico: 'credit_score',
  date_business_started: 'date_business_started',
  business_start_date: 'date_business_started',
  incorporation_date: 'date_business_started',
  type_of_entity: 'type_of_entity',
  entity_type: 'type_of_entity',
  website: 'website',
  url: 'website',
  driver_license_number: 'driver_license_number',
  license_number: 'driver_license_number',
  dl_number: 'driver_license_number',
  full_name: 'full_name',
  sex: 'sex',
  height: 'height',
  eye_color: 'eye_color',
  license_class: 'license_class',
  address_line1: 'address_line1',
  address_line2: 'address_line2',
  issue_date: 'issue_date',
  expiration_date: 'expiration_date',
  exp_date: 'expiration_date',
  account_holder_name: 'account_holder_name',
  member_name: 'account_holder_name',
  bank_name: 'bank_name',
  routing_number: 'routing_number',
  aba_routing_number: 'routing_number',
  account_number: 'account_number',
  checking_account_number: 'account_number',
  account_type: 'account_type',
  check_number: 'check_number',
  bank_address: 'bank_address',
  bank_city: 'bank_city',
  bank_state: 'bank_state',
  bank_zip: 'bank_zip',
};

function canonicalKey(rawLabel: string): string {
  const nk = normalizeFieldKey(rawLabel);
  return FIELD_ALIASES[nk] || nk;
}

function mergeKeyData(target: Record<string, string>, label: string, value: string): void {
  const v = String(value || '').trim();
  if (!v) return;
  const key = canonicalKey(label);
  if (key === 'ein') {
    const chosen = preferBetterEin(target[key], v);
    if (chosen) target[key] = chosen;
    return;
  }
  if (!target[key] || target[key].length < v.length) {
    target[key] = v;
  }
}

function collectFormFields(document: Document, keyData: Record<string, string>): void {
  for (const page of document.pages || []) {
    for (const field of page.formFields || []) {
      const name = textFromAnchor(document, field.fieldName?.textAnchor);
      const value = textFromAnchor(document, field.fieldValue?.textAnchor);
      if (name) mergeKeyData(keyData, name, value);
    }
  }
}

function collectEntities(document: Document, keyData: Record<string, string>): void {
  for (const entity of document.entities || []) {
    const type = String(entity.type || '').trim();
    const value =
      String(entity.mentionText || '').trim() ||
      String(entity.normalizedValue?.text || '').trim();
    if (type) mergeKeyData(keyData, type, value);

    for (const prop of entity.properties || []) {
      const propType = String(prop.type || '').trim();
      const propValue =
        String(prop.mentionText || '').trim() ||
        String(prop.normalizedValue?.text || '').trim();
      if (propType) mergeKeyData(keyData, propType, propValue);
    }
  }
}

export function mapDocumentAiToExtractResult(document: Document): PdfClaudeExtractResultDTO {
  const key_data: Record<string, string> = {};
  collectFormFields(document, key_data);
  collectEntities(document, key_data);

  const pages = (document.pages || []).map((page, idx) => ({
    page_number: Number(page.pageNumber ?? idx + 1),
    note: '',
  }));

  const fullText = String(document.text || '').trim();
  const ein = resolveEin(key_data.ein, fullText);
  if (ein) key_data.ein = ein;
  else delete key_data.ein;

  const docTypeGuess = /driver|license|identification/i.test(fullText)
    ? 'driver_license'
    : /routing|account number|voided check|direct deposit/i.test(fullText)
      ? 'voided_check'
      : /application|merchant|funding|loan|mca/i.test(fullText)
        ? 'business_funding_application'
        : 'unknown';

  return {
    document_type: docTypeGuess,
    title: '',
    summary: fullText.slice(0, 500),
    key_data,
    pages,
    transactions: [],
    model_notes: 'extracted_via_google_document_ai',
  };
}

export function mapDocumentAiToKycKeyData(
  document: Document,
  documentType: 'driverLicense' | 'voidedCheck',
): Record<string, string> {
  const result = mapDocumentAiToExtractResult(document);
  const kd = { ...(result.key_data || {}) };

  if (documentType === 'driverLicense') {
    if (!kd.first_name && !kd.owner_first_name && kd.full_name) {
      const parts = kd.full_name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        kd.first_name = parts.slice(0, -1).join(' ');
        kd.last_name = parts[parts.length - 1]!;
      }
    }
    if (!kd.first_name && kd.owner_first_name) kd.first_name = kd.owner_first_name;
    if (!kd.last_name && kd.owner_last_name) kd.last_name = kd.owner_last_name;
  }

  if (documentType === 'voidedCheck') {
    if (!kd.account_holder_name && kd.member_name) kd.account_holder_name = kd.member_name;
    if (!kd.routing_number && kd.aba_routing_number) kd.routing_number = kd.aba_routing_number;
    if (!kd.account_number && kd.checking_account_number) kd.account_number = kd.checking_account_number;
  }

  return kd;
}
