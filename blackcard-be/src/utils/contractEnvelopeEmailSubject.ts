import { EMAIL_BRAND_DISPLAY_NAME } from '../constants/emailBrand';
import { sanitizeLetterPdfFilename } from '../services/pdf/letterHtmlToPdf.service';

export function toEnvelopeSubjectUppercase(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}


/** Lender prefix for contract envelope email subjects and PDF names. */
export const CONTRACT_ENVELOPE_LENDER_NAME = String(
  process.env.DOCUSIGN_EMAIL_LENDER_NAME || EMAIL_BRAND_DISPLAY_NAME,
).trim();

/** DocuSign API hard limit for envelope `emailSubject`. */
export const DOCUSIGN_EMAIL_SUBJECT_MAX_LEN = 100;

function parseContractOfferAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[$,\s]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatContractOfferAmountForSubject(
  value?: number | string | null,
): string {
  const amount = parseContractOfferAmount(value);
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Keep lender + suffix intact; shorten the middle (business) when over the DocuSign limit. */
function clampDocuSignEmailSubject(
  lender: string,
  middle: string,
  suffix: string,
): string {
  const prefix = `${lender}: `;
  const maxMiddle =
    DOCUSIGN_EMAIL_SUBJECT_MAX_LEN - prefix.length - suffix.length;
  if (maxMiddle < 1) {
    return `${prefix}${suffix}`.slice(0, DOCUSIGN_EMAIL_SUBJECT_MAX_LEN);
  }
  const trimmedMiddle =
    middle.length > maxMiddle ? middle.slice(0, maxMiddle).trimEnd() : middle;
  return `${prefix}${trimmedMiddle}${suffix}`;
}

/** Clamp any pre-built subject (e.g. FE override) to DocuSign's emailSubject max. */
export function clampDocuSignEnvelopeEmailSubject(subject: string): string {
  const trimmed = String(subject || '').trim();
  if (!trimmed) return 'Please sign this document';
  if (trimmed.length <= DOCUSIGN_EMAIL_SUBJECT_MAX_LEN) return trimmed;
  return trimmed.slice(0, DOCUSIGN_EMAIL_SUBJECT_MAX_LEN).trimEnd();
}

/** Contract envelope subject / PDF name: {FunderName}: BusinessName $12,345.67 */
export function buildContractEnvelopeEmailSubject(
  businessName: string,
  offerAmount?: number | string | null,
  funderName?: string | null,
): string {
  const business = String(businessName || '').trim() || 'Business';
  const amount = formatContractOfferAmountForSubject(offerAmount);
  const lender =
    String(funderName || '').trim() || CONTRACT_ENVELOPE_LENDER_NAME;
  return toEnvelopeSubjectUppercase(clampDocuSignEmailSubject(lender, business, ` ${amount}`));
}

/** ACH-only envelope email subject: {FunderName}: BusinessName - ACH Form */
export function buildAchFormEnvelopeEmailSubject(
  businessName: string,
  _offerAmount?: number | string | null,
  funderName?: string | null,
): string {
  const business = String(businessName || '').trim() || 'Business';
  const lender =
    String(funderName || '').trim() || CONTRACT_ENVELOPE_LENDER_NAME;
  return toEnvelopeSubjectUppercase(clampDocuSignEmailSubject(lender, business, ' - ACH Form'));
}

/** ACH-only PDF / document name: {FunderName}: BusinessName - ACH Form */
export function buildAchFormEnvelopeDocumentName(
  businessName: string,
  funderName?: string | null,
): string {
  const business = String(businessName || '').trim() || 'Business';
  const lender =
    String(funderName || '').trim() || CONTRACT_ENVELOPE_LENDER_NAME;
  return toEnvelopeSubjectUppercase(`${lender}: ${business} - ACH Form`);
}

export function buildContractEnvelopePdfFilename(subject: string): string {
  const file = sanitizeLetterPdfFilename(toEnvelopeSubjectUppercase(subject));
  const stem = file.replace(/\.pdf$/i, '').toUpperCase();
  return `${stem}.pdf`;
}

export function buildContractEnvelopeDocumentName(subject: string): string {
  return buildContractEnvelopePdfFilename(subject).replace(/\.pdf$/i, '');
}

export function normalizeContractCcEmailSubject(subject: string | null | undefined): string {
  const trimmed = String(subject || '').trim();
  return toEnvelopeSubjectUppercase(trimmed || 'Contract');
}

/** @deprecated Use buildContractEnvelopeEmailSubject */
export function buildDocuSignEnvelopeEmailSubject(
  businessName: string,
  offerAmount?: number | string | null,
  funderName?: string | null,
): string {
  return buildContractEnvelopeEmailSubject(businessName, offerAmount, funderName);
}
