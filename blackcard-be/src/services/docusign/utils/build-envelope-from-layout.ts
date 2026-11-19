import type {
  DocumentLayout,
  DocumentLayoutPlacement,
} from './convert-docusign-template-export';
import {
  buildLayoutPrefillValueRecord,
  CRM_ID_TO_LAYOUT_VARIABLE,
  getPrefillDisplayLabel,
} from './prefill-layout-bridge';
import type { PrefillFieldInput } from './docusign-prefill';
import { toPrefillUppercase } from './prefill-uppercase';
import { toEnvelopeSubjectUppercase } from '../../../utils/contractEnvelopeEmailSubject';
import { DOCUSIGN_DEFAULT_ROLE_NAME, DOCUSIGN_SECONDARY_ROLE_NAME } from './docusign-client';
import {
  applyDocuSignPrefillTabStyle,
  isFitToTextPrefillVariable,
  resolveDocuSignFontSizeToken,
  resolveDocuSignPrefillTabWidth,
} from './docusign-tab-style';
import { embedArialBoldPdfFont, embedArialPdfFont } from './embed-arial-pdf-font';
import { DOCUMENT_LAYOUT_KEYS } from '../layouts/document-layout.registry';
import { isFunderContractLayoutKey } from '../../../utils/funderContractLayout';
import {
  buildScopedValuesForLayout,
  DISCLOSURE_MERCHANT_BUSINESS_NAME_VARS,
  isDisclosureMerchantNameVariable,
  isDisclosureMerchantPlacementVariable,
  isMainContractLayoutKey,
  isStateDisclosureTextPlacement,
  LAYOUT_CRM_PREFIX,
  resolveCanonicalSupplementalLayoutKey,
  resolveDisclosureMerchantBusinessName,
  resolveSupplementalEnvelopeTabLabel,
  toDisclosureScopedPrefillId,
} from './layout-prefill-scope';

const DOCUSIGN_SECONDARY_SIGNER_ROLE_NAME = DOCUSIGN_SECONDARY_ROLE_NAME;

export type LayoutSignerInput = {
  roleName: string;
  name: string;
  email: string;
  routingOrder?: number;
};

export function prefillFieldsToValueMap(
  fields: Array<{ id?: string; value?: string }>,
): Record<string, string> {
  const out = buildLayoutPrefillValueRecord(fields as PrefillFieldInput[]);
  return expandPrefillValues(out);
}

export type BuildEnvelopeFromLayoutOptions = {
  layouts: DocumentLayout[];
  /** Prefill values keyed by layout variable (snake_case data labels). */
  values: Record<string, string>;
  /**
   * Optional values for each layout instance. This is intentionally index-based:
   * the same addendum layout may be included more than once with different values.
   */
  layoutValues?: Array<Record<string, string> | undefined>;
  signers: LayoutSignerInput[];
  ownerCount?: number;
  guarantorCount?: number;
  /** Display name for the primary PDF in the envelope. */
  primaryDocumentName?: string;
  /** Layout index that receives `primaryDocumentName` (main contract; defaults to 0). */
  primaryLayoutIndex?: number;
  /**
   * When true, text/date values are already burned into document PDFs — only signature /
   * initial / attachment tabs are attached (visible to all recipients including CC).
   * @deprecated Prefer `flattenedLayoutKeys` when only some documents were flattened.
   */
  skipTextDateTabs?: boolean;
  /** Layout keys whose text/date prefill was burned into the PDF (skip duplicate tabs). */
  flattenedLayoutKeys?: ReadonlySet<string>;
  /** When true, text/date tabs are created locked (use only when sending immediately). */
  lockDataTabs?: boolean;
  /** Merged PDF bytes when multiple layouts are combined into one DocuSign document. */
  mergedDocument?: { name: string; documentBase64: string };
  /** Page offset per layout key (0-based) inside `mergedDocument`. */
  pageOffsetByLayoutKey?: Map<string, number>;
  /** Index-parallel page offsets preserve duplicate layout instances. */
  pageOffsetByLayoutIndex?: number[];
};

export async function countPdfPagesFromBase64(documentBase64: string): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(Buffer.from(documentBase64, 'base64'));
  return pdfDoc.getPageCount();
}

export function maxPlacementPageNumber(layout: DocumentLayout): number {
  let max = 1;
  for (const placement of layout.placements) {
    const page = parseInt(String(placement.pageNumber || '1'), 10);
    if (Number.isFinite(page) && page > max) max = page;
  }
  return max;
}

export async function assertLayoutPlacementsFitPdfPages(
  layout: DocumentLayout & { documentBase64?: string },
): Promise<void> {
  const base64 = layout.documentBase64;
  if (!base64) return;
  const pageCount = await countPdfPagesFromBase64(base64);
  const required = maxPlacementPageNumber(layout);
  if (required <= pageCount) return;
  throw new Error(
    `Document "${layout.name}" PDF has ${pageCount} page(s) but DocuSign tabs require page ${required}. ` +
      `Re-upload a ${required}-page PDF or update tab coordinates in state-document-config.`,
  );
}

export type LayoutPartyCounts = {
  ownerCount: number;
  guarantorCount: number;
};

/** Canonical CRM keys copied to legacy / duplicate tab labels automatically. */
const PREFILL_VALUE_ALIASES: Record<string, string[]> = {
  agreement_date: ['signature_date', 'disclosure_date', 'addendum_date'],
  addendum_date: ['agreement_date', 'signature_date', 'disclosure_date'],
  signature_date: ['agreement_date', 'addendum_date', 'Signature_date', 'disclosure_date'],
  Signature_date: ['signature_date', 'agreement_date', 'addendum_date', 'disclosure_date'],
  disclosure_date: ['agreement_date', 'addendum_date', 'signature_date'],
  /** Texas ACH / page-11 owner date labels — prefill from shared agreement date. */
  agreement_date_owner1_p11: [
    'agreement_date',
    'signature_date',
    'disclosure_date',
    'addendum_date',
  ],
  agreement_date_owner2_p11: [
    'agreement_date',
    'signature_date',
    'disclosure_date',
    'addendum_date',
  ],
  agreement_date_owner1_p6: [
    'agreement_date',
    'signature_date',
    'disclosure_date',
    'addendum_date',
  ],
  agreement_date_owner2_p6: [
    'agreement_date',
    'signature_date',
    'disclosure_date',
    'addendum_date',
  ],
  date_by_which_amount_mustbe_received: ['prepayment_received_by_date'],
  funder_name: ['disclosure_funder_name'],
  client_legal_name: ['business_legal_name', 'merchant_legal_name', 'client_legal_name_p11_footer'],
  client_legal_name_p11_footer: ['client_legal_name', 'business_legal_name', 'merchant_legal_name'],
  // Seller / merchant on RPA & funder contracts = business legal name (never owner person).
  seller_1_name: [
    'client_legal_name',
    'business_legal_name',
    'merchant_legal_name',
    'security_business_name',
    'legal_name',
    'authorization_client_name',
  ],
  seller_name: [
    'client_legal_name',
    'business_legal_name',
    'merchant_legal_name',
    'security_business_name',
    'legal_name',
    'authorization_client_name',
    'seller_1_name',
  ],
  seller_2_name: [
    'owner2_guarantor_name',
    'guaranty_owner2_name',
    'guaranty_guarantor2_name',
    'merchant2_name',
  ],
  business_name_2: [
    'owner2_guarantor_name',
    'guaranty_owner2_name',
    'guaranty_guarantor2_name',
    'merchant2_name',
    'appendix_merchant2_name',
    'addendum_dated_principal_owner2_name',
  ],
  client_name: ['client_name_by'],
  addendum_client_name: [
    'client_name',
    'owner1_guarantor_name',
    'guaranty_owner1_name',
    'guaranty_guarantor1_name',
    'guaranty_client_name',
    'security_guarantor',
  ],
  business_address: [
    'security_business_address',
    'recipient_address',
    'recipient_address1',
    'ach_authorization_account_holder_address',
  ],
  business_address_city: [
    'security_business_address_city',
    'ach_authorization_account_holder_city',
  ],
  business_address_state: [
    'security_business_address_state',
    'ach_authorization_account_holder_state',
  ],
  business_address_zip: [
    'security_business_address_zip',
    'ach_authorization_account_holder_zip',
  ],
  /** Owner 1 home / contact — keep distinct from business location. */
  business_address_contract: ['guarantor_address'],
  business_address_contract_city: ['guarantor_address_city'],
  business_address_contract_state: ['guarantor_address_state'],
  business_address_contract_zip: ['guarantor_address_zip'],
  guarantor_address: ['business_address_contract'],
  guarantor_address_city: ['business_address_contract_city'],
  guarantor_address_state: ['business_address_contract_state'],
  guarantor_address_zip: ['business_address_contract_zip'],
  authorization_client_name: [
    'client_legal_name',
    'security_business_name',
    'business_legal_name',
  ],
  /** ACH auth page-13 signer line — business / merchant legal name. */
  authorization_client_signer_name: [
    'authorization_client_name',
    'client_legal_name',
    'security_business_name',
    'business_legal_name',
  ],
  /** ACH auth page-13 printed name — person / client name. */
  authorization_client_name_print: [
    'customer_name',
    'client_name',
    'owner1_guarantor_name',
  ],
  /** Consent / declaration lines — Signer 1 person name, not merchant legal name. */
  ach_authorization_concent_account_holder_name: [
    'authorization_client_name_print',
    'customer_name',
    'client_name',
    'owner1_guarantor_name',
  ],
  ach_authorization_concent_account_holder_name_2: [
    'ach_authorization_concent_account_holder_name',
    'authorization_client_name_print',
    'customer_name',
    'client_name',
    'owner1_guarantor_name',
  ],
  entity_type: ['typeOfEntity1', 'typeofentity1'],
  typeofentity1: ['entity_type', 'typeOfEntity1'],
  typeOfEntity1: ['entity_type', 'typeofentity1'],
  federal_tax_id_ein: ['security_tax_ein', 'authorization_client_tax_id'],
  security_tax_ein: ['federal_tax_id_ein', 'authorization_client_tax_id'],
  frequency: ['paymentterms', 'payment_terms'],
  // ACH transaction fee is per-form (edit ACH / layoutValues) — never alias from
  // shared remittance or multi-ACH packages all get the same deal payment amount.
  remittance: [
    'estimated_payment',
    'estimated_payment_amount',
    'disclosure_estimated_payment',
    'theestimatedpayment',
  ],
  net_to_merchant: ['netfundprovided', 'net_fund_provided'],
  purchase_amount: [
    'disclosure_amount_financed',
    'funding_provided',
    'addendum_dated_principal_owner_amount',
  ],
  /** Balance-transfer RTR — only accept the dedicated scoped CRM key (never refinance / purchase_price). */
  remaining_rtr_balance: ['balance_transfer_remaining_rtr_balance'],
  balance_transfer_remaining_rtr_balance: [],
  purchase_price: [
    'disclosure_total_payment',
    'total_repayment_amount',
    'estimatedTotalPaymentAmount',
    'addendum_dated_principal_owner_amount2',
  ],
  purchase_percent: ['specified_percentage', 'purchased_percent', 'percent_of_business_income'],
  percent_of_business_income: ['purchase_percent', 'specified_percentage', 'purchased_percent'],
  total_dollar_cost: [
    'finance_charge',
    'disclosure_finance_charge',
    'financeCharge',
    'total_dollar_cost_of_frinancing',
  ],
  finance_charge: [
    'total_dollar_cost',
    'disclosure_finance_charge',
    'financeCharge',
    'total_dollar_cost_of_frinancing',
  ],
  disclosure_finance_charge: [
    'total_dollar_cost',
    'finance_charge',
    'financeCharge',
    'total_dollar_cost_of_frinancing',
  ],
  total_amount_tobe_paid_to_provider: [
    'disclosure_total_payment',
    'total_repayment_amount',
    'purchase_price',
    'purchasePrice',
  ],
  total_amount_business_fund: ['disclosure_purchase_price', 'funding_provided', 'purchase_amount'],
  funding_provided: [
    'total_amount_of_fund_provided',
    'disclosure_purchase_price',
    'purchase_amount',
    'total_amount_business_fund',
    'total_amount_commercial_financing',
  ],
  // Fund disbursed = net after fees — never CA page-3 `disclosure_recipient_funds` (offer).
  total_amount_of_fund_disbursed: [
    'disclosure_funding_disbursed',
    'net_to_merchant',
    'total_amount_fund_disbursed',
  ],
  total_amount_fund_disbursed: [
    'disclosure_funding_disbursed',
    'total_amount_of_fund_disbursed',
    'net_to_merchant',
  ],
  total_amount_of_fund_provided: ['funding_provided', 'purchase_amount'],
  total_of_payments: ['disclosure_total_payment', 'total_repayment_amount', 'purchase_price'],
  // Virginia: sales-based financing = offer; disbursement amount = net after fees.
  total_amount_sales_based_financing: [
    'funding_provided',
    'disclosure_purchase_price',
    'purchase_amount',
    'total_amount_business_fund',
    'disclosure_amount_financed',
  ],
  disbursement_amount: [
    'disclosure_funding_disbursed',
    'net_to_merchant',
    'total_amount_of_fund_disbursed',
  ],
  total_amount_business_fund_2: [
    'disclosure_funding_disbursed',
    'total_amount_of_fund_disbursed',
    'net_to_merchant',
  ],
  total_repayment_amount: ['disclosure_total_payment', 'purchase_price', 'estimatedTotalPaymentAmount'],
  estimated_number_of_payement: ['disclosure_term_days', 'estimated_number_of_payments'],
  disclosure_name: [
    'legal_name',
    'client_legal_name',
    'security_business_name',
    'business_legal_name',
    'business_name',
    'disclosure_merchant_name',
    'recipient_name',
    // Never alias to bare client_name — that is Owner-1 person after party sync.
  ],
  disclosure_merchant_name: [
    'legal_name',
    'client_legal_name',
    'security_business_name',
    'business_legal_name',
    'business_name',
    'disclosure_name',
    'recipient_name',
  ],
  disclosure_date2: ['disclosure_date', 'agreement_date', 'signature_date'],
  recipient_name: [
    'legal_name',
    'client_legal_name',
    'security_business_name',
    'business_legal_name',
    'business_name',
    'disclosure_merchant_name',
    'disclosure_name',
  ],
  recipient_name2: [
    'legal_name',
    'client_legal_name',
    'security_business_name',
    'business_legal_name',
    'business_name',
    'disclosure_merchant_name',
    'recipient_name',
    'disclosure_name',
  ],
  recipient_address2: ['recipient_address', 'recipient_address1'],
  recipient_address: ['recipient_address1', 'business_address'],
  total_amount_commercial_financing: ['funding_provided', 'disclosure_purchase_price', 'purchase_amount', 'total_amount_business_fund', 'addendum_dated_principal_owner_amount'],
  total_commerical_financing: ['disclosure_funding_disbursed', 'total_amount_of_fund_disbursed', 'amountFinanced', 'net_to_merchant'],
  deducted_at_disbursement: [
    'disclosure_fees_deducted',
    'fees_deducted',
    'disclosure_origination_fee',
  ],
  fees_deducted: [
    'disclosure_fees_deducted',
    'deducted_at_disbursement',
    'disclosure_origination_fee',
  ],
  estimated_time_periodic_paymement: ['disclosure_term_days', 'estimated_number_of_payments'],
  theestimatedpayment: ['disclosure_estimated_payment', 'estimated_payment'],
  payment_exceed_percent: ['disclosure_payment_terms', 'percent_of_business_income'],
  signature1_date: ['disclosure_date', 'agreement_date', 'signature_date'],
  signature2_date: ['disclosure_date', 'agreement_date', 'signature_date'],
  estimated_payment_amount: ['disclosure_estimated_payment', 'estimated_payment', 'remittance'],
  monthly_income: ['disclosure_avg_monthly_revenue', 'avarage_monthly_income', 'etimated_average_income'],
  appendix_underwriting_fees: ['disclosure_broker_fee', 'underwriter_fee', 'underwriterfee', 'underwriter_fees'],
  owner1_guarantor_name: ['guaranty_owner1_name', 'guaranty_guarantor1_name', 'guaranty_client_name'],
  guaranty_owner1_name: ['owner1_guarantor_name', 'guaranty_guarantor1_name', 'guaranty_client_name', 'client_name'],
  guaranty_guarantor1_name: ['owner1_guarantor_name', 'guaranty_owner1_name', 'guaranty_client_name', 'client_name'],
  guaranty_client_name: ['client_name', 'owner1_guarantor_name', 'guaranty_owner1_name', 'guaranty_guarantor1_name'],
  security_guarantor: ['guaranty_guarantor1_name', 'guaranty_owner1_name', 'owner1_guarantor_name', 'client_name'],
  guaranty_owner1_ss: ['guaranty_guarantor1_ss'],
  guaranty_guarantor1_ss: ['guaranty_owner1_ss'],
  owner2_guarantor_name: [
    'guaranty_owner2_name',
    'guaranty_guarantor2_name',
    'merchant2_name',
    'appendix_merchant2_name',
    'addendum_dated_principal_owner2_name',
    'business_name_2',
  ],
  guaranty_owner2_name: [
    'owner2_guarantor_name',
    'guaranty_guarantor2_name',
    'merchant2_name',
    'appendix_merchant2_name',
    'addendum_dated_principal_owner2_name',
    'business_name_2',
  ],
  guaranty_guarantor2_name: [
    'owner2_guarantor_name',
    'guaranty_owner2_name',
    'merchant2_name',
    'appendix_merchant2_name',
    'addendum_dated_principal_owner2_name',
    'business_name_2',
  ],
  merchant2_name: [
    'owner2_guarantor_name',
    'guaranty_owner2_name',
    'guaranty_guarantor2_name',
    'appendix_merchant2_name',
    'addendum_dated_principal_owner2_name',
    'business_name_2',
  ],
  appendix_merchant2_name: [
    'owner2_guarantor_name',
    'guaranty_owner2_name',
    'merchant2_name',
    'guaranty_guarantor2_name',
    'addendum_dated_principal_owner2_name',
    'business_name_2',
  ],
  guaranty_owner2_ss: ['guaranty_guarantor2_ss'],
  guaranty_guarantor2_ss: ['guaranty_owner2_ss'],
  guaranty_owner2_driver_license: ['guaranty_guarantor2_driver_license'],
  guaranty_guarantor2_driver_license: ['guaranty_owner2_driver_license'],
};

/**
 * Merchant #2 initials — just right of Merchant #1 on the footer line (not mid-page).
 * ~1 initial-width + small gap from the primary tab; slightly higher on Y.
 */
const OWNER2_INITIAL_OFFSET_X = 108;
const OWNER2_INITIAL_OFFSET_Y = -6;

/**
 * Optional extra nudge for main Woodmere `contract` only.
 * Default 0 — layout JSON y values are already the DocuSign positions
 * (including the +3px-from-top shift baked into contract.layout.json).
 * Never apply to addendums, ACH, state disclosures, or other funder layouts.
 */
const CONTRACT_TAB_Y_OFFSET = Number(process.env.DOCUSIGN_CONTRACT_TAB_Y_OFFSET ?? 0) || 0;

function isWoodmereMainContractLayoutKey(layoutKey?: string): boolean {
  const key = String(layoutKey || '').trim();
  // Strict: only the platform main contract — not addendum / disclosure / ACH / funder variants.
  return key === 'contract' || key === DOCUMENT_LAYOUT_KEYS.contract;
}

function resolveTabYPosition(y: string | undefined, layoutKey?: string): string {
  const raw = String(y ?? '0').trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return raw || '0';
  if (!CONTRACT_TAB_Y_OFFSET || !isWoodmereMainContractLayoutKey(layoutKey)) {
    return raw;
  }
  return String(Math.max(0, Math.round(n + CONTRACT_TAB_Y_OFFSET)));
}

const PARTY2_NAME_KEYS = [
  'owner2_guarantor_name',
  'guaranty_owner2_name',
  'guaranty_guarantor2_name',
  'merchant2_name',
  'appendix_merchant2_name',
  'addendum_dated_principal_owner2_name',
  'business_name_2',
  'seller_2_name',
] as const;

const PARTY2_NAME_PRIORITY = [
  'owner2_guarantor_name',
  'merchant2_name',
  'guaranty_owner2_name',
  'guaranty_guarantor2_name',
  'appendix_merchant2_name',
  'addendum_dated_principal_owner2_name',
  'business_name_2',
  'seller_2_name',
] as const;

const PARTY1_NAME_KEYS = [
  'client_name',
  'addendum_client_name',
  'owner1_guarantor_name',
  'guaranty_owner1_name',
  'guaranty_guarantor1_name',
  'guaranty_client_name',
  'security_guarantor',
] as const;

const PARTY1_NAME_PRIORITY = [
  'owner1_guarantor_name',
  'guaranty_owner1_name',
  'guaranty_guarantor1_name',
  'guaranty_client_name',
  'security_guarantor',
  'client_name',
  'addendum_client_name',
] as const;

/** Business / legal names that must not fill `client_name` (owner / client person). */
function resolveContractLegalNameValue(values: Record<string, string>): string {
  return String(
    values.client_legal_name ||
      values.business_legal_name ||
      values.merchant_legal_name ||
      values.security_business_name ||
      values.legal_name ||
      values.authorization_client_name ||
      '',
  ).trim();
}

/**
 * CRM clientName / layout `client_name` (e.g. client_name__p2_p87).
 * Prefer owner / client person name — never business legal name.
 */
function resolvePersonalClientNameValue(values: Record<string, string>): string {
  const legal = resolveContractLegalNameValue(values);
  const legalNorm = legal.toLowerCase();
  const isLegal = (raw: string) => Boolean(legalNorm && raw.toLowerCase() === legalNorm);
  const candidates = [
    values.owner1_guarantor_name,
    values.guaranty_owner1_name,
    values.guaranty_guarantor1_name,
    values.guaranty_client_name,
    values.security_guarantor,
    values.customer_name,
    values.client_name_by,
    values.client_name,
    values.addendum_client_name,
    values.flex_addendum_addendum_client_name,
  ];
  for (const raw of candidates) {
    const t = String(raw || '').trim();
    if (t && !isLegal(t)) return t;
  }
  // Sole proprietors sign under their legal name, so every person slot matches the
  // business name. Fall back to the owner slots (never `client_name`, which can carry a
  // business name) so merchant 1 on page 2 is not left blank.
  for (const raw of [
    values.owner1_guarantor_name,
    values.guaranty_owner1_name,
    values.guaranty_guarantor1_name,
    values.guaranty_client_name,
    values.security_guarantor,
    values.customer_name,
    values.client_name_by,
    values.addendum_client_name,
    values.flex_addendum_addendum_client_name,
  ]) {
    const t = String(raw || '').trim();
    if (t) return t;
  }
  return '';
}

const PARTY1_SS_KEYS = ['guaranty_owner1_ss', 'guaranty_guarantor1_ss'] as const;
const PARTY1_DL_KEYS = [
  'guaranty_owner1_driver_license',
  'guaranty_guarantor1_driver_license',
] as const;

const PARTY2_SS_KEYS = ['guaranty_owner2_ss', 'guaranty_guarantor2_ss'] as const;

/** Woodmere contract page 16 = Katan page 15 (ACH portal, credentials, references). */
export const FILL_AT_SIGNING_VARIABLES = new Set([
  'ach_authorization_bank_portal_website',
  'ach_authorization_username',
  'ach_authorization_password',
  'ach_authorization_security_question1',
  'ach_authorization_security_answer1',
  'ach_authorization_security_question2',
  'ach_authorization_security_answer2',
  'ach_authorization_security_question3',
  'ach_authorization_security_answer3',
  'ach_authorization_other_infomation',
  'ach_authorization_reference_name1',
  'ach_authorization_reference_number_1',
  'ach_authorization_reference_relationship1',
  'ach_authorization_reference_name2',
  'ach_authorization_reference_number2',
  'ach_authorization_reference_relationship2',
  'ach_authorization_reference_name3',
  'ach_authorization_reference_number3',
  'ach_authorization_reference_relationship3',
]);

/** Katan uses page 15; Woodmere contract shifts portal section to page 16. */
const WOODMERE_CONTRACT_FILL_AT_SIGNING_PAGE = '16';

/** Woodmere-style 17-page contract (page-16 portal section) — excludes Texas Funding Group layout. */
function usesWoodmereStyleNonTexasContractLayout(layoutKey: string | undefined): boolean {
  const key = String(layoutKey || '').trim();
  if (!key || key === DOCUMENT_LAYOUT_KEYS.contract) return true;
  if (key === DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract) return false;
  if (isFunderContractLayoutKey(key)) return true;
  return false;
}

/** Contract page 1 — merchant may confirm/enter phone at signing (optional, stays editable). */
export const OPTIONAL_SIGNER_EDITABLE_VARIABLES = new Set(['client_phone']);

/** Text fields that must be filled by the signer (none currently — client_phone is optional). */
export const REQUIRED_SIGNER_EDITABLE_VARIABLES = new Set<string>([]);

function isOptionalSignerEditablePlacement(placement: DocumentLayoutPlacement): boolean {
  const variable = String(placement.variable || '').trim().toLowerCase();
  return OPTIONAL_SIGNER_EDITABLE_VARIABLES.has(variable);
}

function isRequiredSignerEditablePlacement(placement: DocumentLayoutPlacement): boolean {
  const variable = String(placement.variable || '').trim().toLowerCase();
  return REQUIRED_SIGNER_EDITABLE_VARIABLES.has(variable);
}

function isFillAtSigningPlacement(placement: DocumentLayoutPlacement): boolean {
  if (placement.fillAtSigning === true) return true;
  const variable = String(placement.variable || '').trim().toLowerCase();
  return FILL_AT_SIGNING_VARIABLES.has(variable);
}

function isWoodmereContractFillAtSigningPlacement(
  layoutKey: string | undefined,
  placement: DocumentLayoutPlacement,
): boolean {
  if (!usesWoodmereStyleNonTexasContractLayout(layoutKey)) return false;
  // Explicit fillAtSigning works on any page (portal / credentials stay signer-editable).
  if (placement.fillAtSigning === true) return true;
  return (
    String(placement.pageNumber || '') === WOODMERE_CONTRACT_FILL_AT_SIGNING_PAGE &&
    isFillAtSigningPlacement(placement)
  );
}

/** Page-16 ACH fields start blank; page-1 client phone keeps CRM prefill on the live tab. */
function clearsValueAtSend(
  layoutKey: string | undefined,
  placement: DocumentLayoutPlacement,
): boolean {
  return isWoodmereContractFillAtSigningPlacement(layoutKey, placement);
}

function isSignerEditableTextPlacement(
  layoutKey: string | undefined,
  placement: DocumentLayoutPlacement,
): boolean {
  // Page-1 client_phone stays signer-editable (optional) on every contract layout.
  if (isOptionalSignerEditablePlacement(placement)) return true;
  if (isRequiredSignerEditablePlacement(placement)) return true;
  if (isWoodmereContractFillAtSigningPlacement(layoutKey, placement)) return true;
  return false;
}

/** Portal / reference fields on contract page 16, plus any explicitly required signer text. */
function isRequiredSignerTextField(
  placement: DocumentLayoutPlacement,
  layoutKey?: string,
): boolean {
  if (placement.type !== 'text') return false;
  if (isRequiredSignerEditablePlacement(placement)) return true;
  return isWoodmereContractFillAtSigningPlacement(layoutKey, placement);
}

/** True when a live DocuSign tab must stay unlocked at send (signer fills or confirms). */
export function isFillAtSigningTabRef(tab: {
  tabLabel?: string;
  name?: string;
  pageNumber?: string | number;
}): boolean {
  const stripUnique = (s: string) =>
    s.replace(/__p\d+_[a-z0-9]+$/i, '').replace(/__page\d+$/i, '');
  const raw = String(tab.tabLabel || tab.name || '')
    .trim()
    .toLowerCase();
  const label = stripUnique(raw);
  if (
    label &&
    (OPTIONAL_SIGNER_EDITABLE_VARIABLES.has(label) ||
      REQUIRED_SIGNER_EDITABLE_VARIABLES.has(label) ||
      FILL_AT_SIGNING_VARIABLES.has(label))
  ) {
    return true;
  }
  return false;
}

function shouldIncludeEmptyTextPlacement(
  placement: DocumentLayoutPlacement,
  layoutKey?: string,
): boolean {
  // DateSigned / date tabs must be present even when CRM has no value (DocuSign stamps on sign).
  if (placement.type === 'date') return true;
  if (placement.type !== 'text') return false;
  if (isSignerEditableTextPlacement(layoutKey, placement)) return true;
  if (isWoodmereContractFillAtSigningPlacement(layoutKey, placement)) return true;
  return includeEmptyLockedOptionalTextPlacement(placement);
}

/** Contract ACH account-holder name lines (pages 14 & 15 — owner person name). */
const WOODMERE_ACH_OWNER_NAME_VARIABLES = new Set([
  'ach_authorization_account_holder_name',
]);

/** Consent / declaration lines on contract ACH pages — Signer 1 person name. */
const WOODMERE_ACH_CONSENT_PERSON_NAME_VARIABLES = new Set([
  'ach_authorization_concent_account_holder_name',
  'ach_authorization_concent_account_holder_name_2',
]);

/** Woodmere ACH pages 1/14/15/16 — explicit owner-2 tabs; do not auto-mirror initials here. */
const WOODMERE_CONTRACT_NO_OWNER2_INITIAL_MIRROR_PAGES = new Set(['1', '14', '15', '16']);
/** ACH authorization pages 14 & 15 — owner 2 initials only (no signature/date). */
const WOODMERE_ACH_OWNER2_INITIALS_ONLY_PAGES = new Set(['14', '15']);

function placementPageOffset(
  placement: DocumentLayoutPlacement,
  pageOffset: number,
): DocumentLayoutPlacement {
  if (!pageOffset) return placement;
  const base = Math.max(1, parseInt(String(placement.pageNumber || '1'), 10) || 1);
  return { ...placement, pageNumber: String(base + pageOffset) };
}
const PARTY2_DL_KEYS = [
  'guaranty_owner2_driver_license',
  'guaranty_guarantor2_driver_license',
] as const;

function mirrorIdentityFields(
  out: Record<string, string>,
  keys: readonly string[],
): void {
  const value = keys.map((k) => String(out[k] || '').trim()).find(Boolean);
  if (!value) return;
  for (const k of keys) {
    if (!String(out[k] || '').trim()) out[k] = value;
  }
}

/** Owner / Merchant / Guarantor / Client 1 are the same person — force one canonical name. */
function syncParty1NameFields(out: Record<string, string>): void {
  const legal = resolveContractLegalNameValue(out);
  const legalNorm = legal.toLowerCase();
  const personal = resolvePersonalClientNameValue(out);
  const canonical =
    personal ||
    PARTY1_NAME_PRIORITY.map((k) => String(out[k] || '').trim()).find((v) => {
      if (!v) return false;
      // Prefer a non-legal name when available; sole-prop may equal legal.
      if (legalNorm && v.toLowerCase() === legalNorm && personal) return false;
      return true;
    });
  if (!canonical) return;
  for (const k of PARTY1_NAME_KEYS) {
    out[k] = canonical;
  }
}

/** Seller name on RPA / funder contracts = merchant business legal name (never owner). */
function syncSellerBusinessNameFields(out: Record<string, string>): void {
  const legal = resolveContractLegalNameValue(out);
  if (!legal) return;
  out.seller_1_name = legal;
  out.seller_name = legal;
}

/** Owner / Merchant / Guarantor / Client 2 are the same person — force one canonical name. */
function syncParty2NameFields(out: Record<string, string>): void {
  const canonical = PARTY2_NAME_PRIORITY.map((k) => String(out[k] || '').trim()).find(
    Boolean,
  );
  if (!canonical) return;
  for (const k of PARTY2_NAME_KEYS) {
    out[k] = canonical;
  }
}

function stripParty2ValueKeys(out: Record<string, string>): void {
  for (const k of [...PARTY2_NAME_KEYS, ...PARTY2_SS_KEYS, ...PARTY2_DL_KEYS]) {
    delete out[k];
  }
  for (const key of Object.keys(out)) {
    const norm = key.toLowerCase();
    if (
      /seller_2|discover_owner2|agreement_date_owner2|owner2|owner_2|guarantor2|guarantor_2|merchant2|merchant_2|appendix_merchant2|business_name_2/.test(
        norm,
      )
    ) {
      delete out[key];
    }
  }
}

function isTexasDisclosureLayoutKey(layoutKey?: string): boolean {
  const k = String(layoutKey ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '');
  return k.includes('texas') && (k.includes('daily') || k.includes('weekly'));
}

function isVirginiaDisclosureLayoutKey(layoutKey?: string): boolean {
  const k = String(layoutKey ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '');
  return k.includes('virginia') && (k.includes('daily') || k.includes('weekly'));
}

export function expandPrefillValues(
  values: Record<string, string>,
  ownerCount?: number,
  options?: { layoutKey?: string },
): Record<string, string> {
  const out = { ...values };
  // Sanitize before party sync so a legal-name `client_name` does not pollute owner slots
  // or land on client_name__p2_p87.
  {
    const personal = resolvePersonalClientNameValue(out);
    const legal = resolveContractLegalNameValue(out);
    const current = String(out.client_name || '').trim();
    const currentIsLegal =
      Boolean(legal) && current.toLowerCase() === legal.toLowerCase();
    if (personal) {
      if (!current || currentIsLegal) out.client_name = personal;
    } else if (currentIsLegal) {
      out.client_name = '';
    }
  }
  // Capture disclosure merchant business name before Owner-1 person sync overwrites client_name.
  const disclosureBusinessBeforeSync = resolveDisclosureMerchantBusinessName(out);
  syncParty1NameFields(out);
  syncSellerBusinessNameFields(out);
  {
    const personal = resolvePersonalClientNameValue(out);
    if (personal) out.client_name = personal;
  }
  mirrorIdentityFields(out, PARTY1_SS_KEYS);
  mirrorIdentityFields(out, PARTY1_DL_KEYS);
  if (ownerCount === undefined || ownerCount >= 2) {
    syncParty2NameFields(out);
    mirrorIdentityFields(out, PARTY2_SS_KEYS);
    mirrorIdentityFields(out, PARTY2_DL_KEYS);
  } else {
    stripParty2ValueKeys(out);
  }

  const todayUs = new Date().toLocaleDateString('en-US');
  const agreementDate =
    String(out.agreement_date || '').trim() ||
    String(out.signature_date || '').trim() ||
    String(out.Signature_date || '').trim() ||
    String(out.disclosure_date || '').trim() ||
    String(out.addendum_date || '').trim() ||
    todayUs;
  if (!String(out.agreement_date || '').trim()) out.agreement_date = agreementDate;
  if (!String(out.signature_date || '').trim()) out.signature_date = agreementDate;

  for (const [canonical, aliases] of Object.entries(PREFILL_VALUE_ALIASES)) {
    const v = String(out[canonical] || '').trim();
    if (!v) continue;
    for (const alias of aliases) {
      if (!String(out[alias] || '').trim()) out[alias] = v;
    }
  }

  /**
   * State disclosure "Funding Provided" / CT "total amount of commercial financing"
   * / FL "total amount business fund" must be offer / purchase_amount — never
   * payback, recipient funds, or net-to-merchant. Force-overwrite numbered +
   * scoped slots so a prior wrong value cannot stick.
   */
  const offerAmount =
    String(out.purchase_amount || '').trim() ||
    String(out.addendum_dated_principal_owner_amount || '').trim() ||
    String(out.disclosure_purchase_price || '').trim() ||
    String(out.total_amount_business_fund || '').trim() ||
    String(out.funding_provided || '').trim() ||
    String(out[toDisclosureScopedPrefillId('funding_provided')] || '').trim() ||
    String(out.approved_amount || '').trim();
  if (offerAmount) {
    const offerSlots = [
      'funding_provided',
      'funding_provided_1',
      'funding_provided_2',
      'disclosure_purchase_price',
      'total_amount_commercial_financing',
      'total_amount_business_fund',
      'total_amount_of_fund_provided',
      'disclosure_amount_financed',
      'receivable_purchase',
      'receivable_purchase_1',
      'receivable_purchase_2',
      'addendum_dated_principal_owner_amount',
    ] as const;
    for (const slot of offerSlots) {
      out[slot] = offerAmount;
      out[toDisclosureScopedPrefillId(slot)] = offerAmount;
      out[`disclosure_${slot}`] = offerAmount;
    }
    // Numbered uniquified disclosure tabs (e.g. disclosure_total_amount_commercial_financing_7).
    for (const slot of [
      'total_amount_commercial_financing',
      'total_amount_business_fund',
      'total_amount_of_fund_provided',
      'funding_provided',
      'disclosure_purchase_price',
      'disclosure_amount_financed',
      'receivable_purchase',
    ] as const) {
      for (let i = 1; i <= 40; i += 1) {
        // Texas `total_amount_business_fund_2` is net disbursed, not offer.
        if (slot === 'total_amount_business_fund' && i === 2) continue;
        const numbered = `${slot}_${i}`;
        out[numbered] = offerAmount;
        out[`disclosure_${numbered}`] = offerAmount;
        out[toDisclosureScopedPrefillId(numbered)] = offerAmount;
      }
    }
    out.disclosure_funding_provided = offerAmount;
    out.disclosure_funding_provided_1 = offerAmount;
    out.disclosure_funding_provided_2 = offerAmount;
  }

  // Fund disbursed / net to merchant = offer − fees (never page-3 offer / recipient_funds).
  {
    const parseMoney = (raw: unknown): number => {
      const n = Number.parseFloat(String(raw ?? '').replace(/[$,%\s]/g, ''));
      return Number.isFinite(n) ? n : NaN;
    };
    const formatMoney = (n: number): string =>
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.round(n * 100) / 100);
    const offerN = parseMoney(offerAmount);
    const feesN = parseMoney(
      out.appendix_underwriting_fees ||
        out.disclosure_fees_deducted ||
        out.deducted_at_disbursement ||
        out.fees_deducted ||
        '',
    );
    const netFromSlots = String(
      out.net_to_merchant ||
        out.disclosure_funding_disbursed ||
        out.total_amount_of_fund_disbursed ||
        out.total_amount_fund_disbursed ||
        '',
    ).trim();
    let disbursedAmount = '';
    if (Number.isFinite(offerN) && Number.isFinite(feesN) && feesN > 0) {
      disbursedAmount = formatMoney(Math.max(0, offerN - feesN));
    } else if (netFromSlots) {
      const existingN = parseMoney(netFromSlots);
      // Reject stale value that still equals offer (old expand path).
      if (
        Number.isFinite(existingN) &&
        Number.isFinite(offerN) &&
        Math.abs(existingN - offerN) < 0.01
      ) {
        disbursedAmount = '';
      } else {
        disbursedAmount = netFromSlots;
      }
    }
    if (disbursedAmount) {
      const texasLayout = isTexasDisclosureLayoutKey(options?.layoutKey);
      const virginiaLayout = isVirginiaDisclosureLayoutKey(options?.layoutKey);
      const disbursedSlots = [
        'disclosure_funding_disbursed',
        ...(texasLayout ? [] : (['total_amount_of_fund_disbursed', 'total_amount_fund_disbursed'] as const)),
        ...(virginiaLayout ? [] : (['total_amount_sales_based_financing'] as const)),
        'total_amount_business_fund_2',
        'total_commerical_financing',
        ...(virginiaLayout ? (['disbursement_amount'] as const) : []),
      ] as const;
      for (const slot of disbursedSlots) {
        out[slot] = disbursedAmount;
        out[toDisclosureScopedPrefillId(slot)] = disbursedAmount;
        out[`disclosure_${slot}`] = disbursedAmount;
      }
      for (const slot of [
        ...(texasLayout ? [] : (['total_amount_of_fund_disbursed', 'total_amount_fund_disbursed'] as const)),
        'disclosure_funding_disbursed',
        ...(virginiaLayout ? (['disbursement_amount'] as const) : []),
      ] as const) {
        for (let i = 1; i <= 40; i += 1) {
          const numbered = `${slot}_${i}`;
          out[numbered] = disbursedAmount;
          out[`disclosure_${numbered}`] = disbursedAmount;
          out[toDisclosureScopedPrefillId(numbered)] = disbursedAmount;
        }
      }
    }
  }

  // Texas page-1 `total_amount_of_fund_disbursed` = offer face amount (not net like KS/LA).
  if (isTexasDisclosureLayoutKey(options?.layoutKey) && offerAmount) {
    const texasOfferSlots = [
      'total_amount_of_fund_disbursed',
      'total_amount_fund_disbursed',
    ] as const;
    for (const slot of texasOfferSlots) {
      out[slot] = offerAmount;
      out[toDisclosureScopedPrefillId(slot)] = offerAmount;
      out[`disclosure_${slot}`] = offerAmount;
      for (let i = 1; i <= 40; i += 1) {
        const numbered = `${slot}_${i}`;
        out[numbered] = offerAmount;
        out[`disclosure_${numbered}`] = offerAmount;
        out[toDisclosureScopedPrefillId(numbered)] = offerAmount;
      }
    }
  }

  // Virginia: sales-based financing = offer; disbursement amount = net (offer − fees).
  if (isVirginiaDisclosureLayoutKey(options?.layoutKey) && offerAmount) {
    const virginiaOfferSlots = ['total_amount_sales_based_financing'] as const;
    for (const slot of virginiaOfferSlots) {
      out[slot] = offerAmount;
      out[toDisclosureScopedPrefillId(slot)] = offerAmount;
      out[`disclosure_${slot}`] = offerAmount;
      for (let i = 1; i <= 40; i += 1) {
        const numbered = `${slot}_${i}`;
        out[numbered] = offerAmount;
        out[`disclosure_${numbered}`] = offerAmount;
        out[toDisclosureScopedPrefillId(numbered)] = offerAmount;
      }
    }
  }

  const paybackAmount =
    String(out.purchase_price || '').trim() ||
    String(out.addendum_dated_principal_owner_amount2 || '').trim() ||
    String(out.disclosure_total_payment || '').trim() ||
    String(out.total_repayment_amount || '').trim();
  if (paybackAmount) {
    for (const slot of [
      'purchase_price',
      'addendum_dated_principal_owner_amount2',
      'disclosure_total_payment',
      'total_of_payments',
      'total_repayment_amount',
      'total_repayment',
    ] as const) {
      out[slot] = paybackAmount;
      out[toDisclosureScopedPrefillId(slot)] = paybackAmount;
    }
  }

  const remittanceAmount =
    String(out.remittance || '').trim() ||
    String(out.disclosure_estimated_payment || '').trim() ||
    String(out.estimated_payment || '').trim();
  if (remittanceAmount) {
    // Do not force-write ach_authorization_account_holder_bank_transaction_fee —
    // each ACH form may keep its own edited fee / amount after Edit ACH form.
    for (const slot of [
      'remittance',
      'disclosure_estimated_payment',
      'estimated_payment',
      'daily_payment',
      'daily_payment_1',
      'daily_payment_2',
    ] as const) {
      out[slot] = remittanceAmount;
      out[toDisclosureScopedPrefillId(slot)] = remittanceAmount;
    }
  }

  // Finance charge = payback − offer when both parse as money.
  {
    const parseMoney = (raw: unknown): number => {
      const n = Number.parseFloat(String(raw ?? '').replace(/[$,%\s]/g, ''));
      return Number.isFinite(n) ? n : NaN;
    };
    const offerN = parseMoney(offerAmount);
    const paybackN = parseMoney(paybackAmount);
    if (Number.isFinite(offerN) && Number.isFinite(paybackN) && paybackN >= offerN) {
      const finance = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.round((paybackN - offerN) * 100) / 100);
      for (const slot of [
        'disclosure_finance_charge',
        'finance_charge',
        'total_dollar_cost',
      ] as const) {
        out[slot] = finance;
        out[toDisclosureScopedPrefillId(slot)] = finance;
      }
    }
  }

  /**
   * CA / NY page-3 auto-calc (before DocuSign):
   *   recipient_funds (top) = offer amount
   *   subtotal = recipient_funds + line_1 + line_2
   *   net      = subtotal − broker_fee
   */
  {
    const hasPage3 =
      String(out.disclosure_page3_subtotal ?? '').trim() !== '' ||
      String(out.disclosure_page3_net ?? '').trim() !== '' ||
      String(out.disclosure_page3_line_1 ?? '').trim() !== '' ||
      String(out.disclosure_page3_line_2 ?? '').trim() !== '' ||
      String(out.disclosure_broker_fee ?? '').trim() !== '' ||
      String(out.disclosure_recipient_funds ?? '').trim() !== '';
    if (hasPage3) {
      const parseMoney = (raw: unknown): number => {
        const n = Number.parseFloat(String(raw ?? '').replace(/[$,%\s]/g, ''));
        return Number.isFinite(n) ? n : 0;
      };
      const formatMoney = (n: number): string =>
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.round(n * 100) / 100);
      if (offerAmount) {
        out.disclosure_recipient_funds = offerAmount;
      }
      const top =
        parseMoney(out.disclosure_recipient_funds) ||
        parseMoney(out.funding_provided) ||
        parseMoney(out.purchase_amount);
      const line1 = parseMoney(out.disclosure_page3_line_1);
      const line2 = parseMoney(out.disclosure_page3_line_2);
      // Item 5 may be explicitly 0 — do not treat 0 as missing and fall back to
      // appendix_underwriting_fees (origination), which is a different fee slot.
      const broker = String(out.disclosure_broker_fee ?? '').trim()
        ? parseMoney(out.disclosure_broker_fee)
        : String(out.appendix_underwriting_fees ?? '').trim()
          ? parseMoney(out.appendix_underwriting_fees)
          : 0;
      const subtotal = top + line1 + line2;
      const net = Math.max(0, subtotal - broker);
      out.disclosure_page3_subtotal = formatMoney(subtotal);
      out.disclosure_page3_net = formatMoney(net);
      for (const key of Object.keys(out)) {
        if (/^disclosure_page3_subtotal_\d+$/i.test(key)) {
          out[key] = formatMoney(subtotal);
        } else if (/^disclosure_page3_net_\d+$/i.test(key)) {
          out[key] = formatMoney(net);
        }
      }
      if (!String(out.disclosure_page3_line_1 ?? '').trim()) {
        out.disclosure_page3_line_1 = formatMoney(line1);
      }
      if (!String(out.disclosure_page3_line_2 ?? '').trim()) {
        out.disclosure_page3_line_2 = formatMoney(line2);
      }
    }
  }

  // After party-name sync, re-seed disclosure merchant fields from business/legal name.
  const disclosureBusiness =
    disclosureBusinessBeforeSync || resolveDisclosureMerchantBusinessName(out);
  if (disclosureBusiness) {
    for (const key of [
      'disclosure_merchant_name',
      'disclosure_name',
      'recipient_name',
      'recipient_name2',
      'business_name',
    ] as const) {
      out[key] = disclosureBusiness;
    }
    for (const key of DISCLOSURE_MERCHANT_BUSINESS_NAME_VARS) {
      out[toDisclosureScopedPrefillId(key)] = disclosureBusiness;
    }
    // Envelope Data Labels: disclosure_client_name_1 (Florida) etc.
    out.disclosure_client_name = disclosureBusiness;
    out.disclosure_recipient_name = disclosureBusiness;
    out.disclosure_recipient_name2 = disclosureBusiness;
    out.disclosure_disclosure_name = disclosureBusiness;
    out.disclosure_disclosure_merchant_name = disclosureBusiness;
    out.disclosure_business_name = disclosureBusiness;
    // Overwrite any existing merchant-keyed slots (never bare person client_name).
    for (const key of Object.keys(out)) {
      if (isDisclosureMerchantNameVariable(key)) {
        out[key] = disclosureBusiness;
      }
    }
    for (let i = 1; i <= 40; i += 1) {
      out[`disclosure_client_name_${i}`] = disclosureBusiness;
      out[`client_name_${i}`] = disclosureBusiness;
      out[`disclosure_recipient_name_${i}`] = disclosureBusiness;
      out[`recipient_name_${i}`] = disclosureBusiness;
      out[`disclosure_disclosure_name_${i}`] = disclosureBusiness;
      out[`disclosure_name_${i}`] = disclosureBusiness;
      out[`disclosure_disclosure_merchant_name_${i}`] = disclosureBusiness;
      out[`disclosure_merchant_name_${i}`] = disclosureBusiness;
      out[`disclosure_business_name_${i}`] = disclosureBusiness;
      out[toDisclosureScopedPrefillId(`client_name_${i}`)] = disclosureBusiness;
      out[toDisclosureScopedPrefillId(`disclosure_client_name_${i}`)] =
        disclosureBusiness;
      out[toDisclosureScopedPrefillId(`recipient_name_${i}`)] = disclosureBusiness;
    }
  }

  // Seed owner date labels (and Texas ACH CRM-scoped ids) so supplemental layouts can resolve.
  const owner1DateKeys = [
    'agreement_date_owner1_p11',
    'agreement_date_owner1_p6',
    'ach_form_texas_agreement_date_owner1_p11',
    'ach_form_signature_date',
  ];
  const owner2DateKeys = [
    'agreement_date_owner2_p11',
    'agreement_date_owner2_p6',
    'ach_form_texas_agreement_date_owner2_p11',
  ];
  for (const dateKey of owner1DateKeys) {
    if (!String(out[dateKey] || '').trim()) out[dateKey] = agreementDate;
  }
  if (ownerCount === undefined || ownerCount >= 2) {
    for (const dateKey of owner2DateKeys) {
      if (!String(out[dateKey] || '').trim()) out[dateKey] = agreementDate;
    }
  }

  {
    const netToMerchantValue = String(
      out.net_to_merchant ||
        out.disclosure_funding_disbursed ||
        out.total_amount_of_fund_disbursed ||
        out.total_amount_fund_disbursed ||
        '',
    ).trim();
    // Texas disclosure tab — same value as net-to-merchant, separate data label.
    if (netToMerchantValue && !String(out.total_amount_business_fund_2 || '').trim()) {
      out.total_amount_business_fund_2 = netToMerchantValue;
    }
  }

  return out;
}

function enrichValuesFromSigners(
  values: Record<string, string>,
  signers: LayoutSignerInput[],
  ownerCount: number,
): Record<string, string> {
  const out = { ...values };
  const legalNorm = resolveContractLegalNameValue(out).toLowerCase();
  const primaryName = String(
    signers.find((s) => /receiver|client|merchant|customer/i.test(s.roleName))?.name ||
      signers.find((s) => /^owner$/i.test(s.roleName))?.name ||
      signers.find((s) => /^guarantor$/i.test(s.roleName))?.name ||
      signers[0]?.name ||
      '',
  ).trim();
  // Do not stamp business/legal name onto client_name / owner person slots.
  if (primaryName && !(legalNorm && primaryName.toLowerCase() === legalNorm)) {
    for (const k of [...PRIMARY_GUARANTOR_NAME_VARIABLES, ...PARTY1_NAME_KEYS]) {
      out[k] = primaryName;
    }
  }
  syncParty1NameFields(out);
  syncSellerBusinessNameFields(out);
  {
    const personal = resolvePersonalClientNameValue(out);
    if (personal) out.client_name = personal;
  }
  if (ownerCount >= 2) {
    const primaryEmail = String(
      signers.find((s) => /receiver|client|merchant|customer/i.test(s.roleName))?.email ||
        signers[0]?.email ||
        '',
    )
      .trim()
      .toLowerCase();
    const secondarySigner =
      signers.find((s) => /owner\s*2|guarantor\s*2/i.test(s.roleName)) ||
      (signers.length >= 2 ? signers[signers.length - 1] : undefined) ||
      signers.find((s) => {
        const email = String(s.email || '').trim().toLowerCase();
        return Boolean(email && email !== primaryEmail);
      });
    const secondaryName = String(secondarySigner?.name || '').trim();
    const primaryNameNorm = primaryName.toLowerCase();
    if (secondaryName && secondaryName.toLowerCase() !== primaryNameNorm) {
      for (const k of PARTY2_NAME_KEYS) {
        out[k] = secondaryName;
      }
      if (!String(out.business_name_2 || '').trim()) {
        out.business_name_2 = secondaryName;
      }
    }
    syncParty2NameFields(out);
    mirrorIdentityFields(out, PARTY2_SS_KEYS);
    mirrorIdentityFields(out, PARTY2_DL_KEYS);
  } else {
    stripParty2ValueKeys(out);
  }
  return out;
}

type DocuSignTab = Record<string, string | undefined>;

type SignerTabBuckets = {
  textTabs: DocuSignTab[];
  dateTabs: DocuSignTab[];
  signHereTabs: DocuSignTab[];
  initialHereTabs: DocuSignTab[];
  signerAttachmentTabs: DocuSignTab[];
};

function emptySignerTabBuckets(): SignerTabBuckets {
  return {
    textTabs: [],
    dateTabs: [],
    signHereTabs: [],
    initialHereTabs: [],
    signerAttachmentTabs: [],
  };
}

function resolvePrimarySignerRoleName(signers: LayoutSignerInput[]): string {
  return (
    signers.find((s) => /^signer$/i.test(s.roleName))?.roleName ||
    signers.find((s) => /receiver|client|merchant|customer/i.test(s.roleName))?.roleName ||
    signers.find((s) => /^owner$/i.test(s.roleName))?.roleName ||
    signers.find((s) => /^guarantor$/i.test(s.roleName))?.roleName ||
    signers[0]?.roleName ||
    DOCUSIGN_DEFAULT_ROLE_NAME
  );
}

function resolveSecondarySignerRoleName(signers: LayoutSignerInput[]): string {
  const primaryRole = resolvePrimarySignerRoleName(signers).toLowerCase();
  return (
    signers.find((s) => /owner\s*2/i.test(s.roleName))?.roleName ||
    signers.find((s) => /guarantor\s*2/i.test(s.roleName))?.roleName ||
    signers.find(
      (s) =>
        /^signer$/i.test(s.roleName) &&
        s.roleName.toLowerCase() !== primaryRole,
    )?.roleName ||
    signers.find((s) => s.roleName.toLowerCase() !== primaryRole)?.roleName ||
    DOCUSIGN_SECONDARY_SIGNER_ROLE_NAME
  );
}

function resolvePrimarySignerIndex(signers: LayoutSignerInput[]): number {
  const primaryRole = resolvePrimarySignerRoleName(signers).toLowerCase();
  const idx = signers.findIndex((s) => s.roleName.toLowerCase() === primaryRole);
  return idx >= 0 ? idx : 0;
}

function resolveSecondarySignerIndex(signers: LayoutSignerInput[]): number {
  const secondaryRole = resolveSecondarySignerRoleName(signers).toLowerCase();
  const idx = signers.findIndex((s) => s.roleName.toLowerCase() === secondaryRole);
  if (idx >= 0) return idx;
  return signers.length > 1 ? 1 : 0;
}

function placementPrefillVariable(placement: DocumentLayoutPlacement): string {
  return String(placement.variable || placement.sourceTabLabel || placement.slot || '')
    .trim()
    .toLowerCase();
}

export function isParty2PrefillVariable(variable: string): boolean {
  const key = String(variable || '').trim().toLowerCase();
  if (!key) return false;
  return /seller_2|discover_owner2|agreement_date_owner2|owner2|owner_2|guarantor2|guarantor_2|merchant2|merchant_2|appendix_merchant2|business_name_2/.test(
    key,
  );
}

export function isParty1IdentityPrefillVariable(variable: string): boolean {
  const key = String(variable || '').trim().toLowerCase();
  if (!key) return false;
  if (isParty2PrefillVariable(key)) return false;
  // Seller / merchant legal name slots are business identity, not owner person name.
  if (key === 'seller_1_name' || key === 'seller_name' || /(^|_)seller_1_name($|_)/.test(key)) {
    return false;
  }
  return /owner1|owner_1|guarantor1|guarantor_1|merchant1|merchant_1|security_guarantor|client_name|customer_name|guaranty_ss|authorization_client_name|appendix_client_name|ach_authorization_account_holder_name|ach_authorization_concent_account_holder_name/.test(
    key,
  );
}

export function isPartySpecificIdentityPrefillVariable(variable: string): boolean {
  return isParty1IdentityPrefillVariable(variable) || isParty2PrefillVariable(variable);
}

/** Deal fields used to be shared across recipients; that green-links edits in Prepare. Always false. */
export function shouldShareDocuSignPrefillTab(_variable: string): boolean {
  return false;
}

function resolvePlacementSignerIndex(
  placement: DocumentLayoutPlacement,
  signers: LayoutSignerInput[],
  counts: LayoutPartyCounts,
  layoutKey?: string,
): number {
  const variable = placementPrefillVariable(placement);

  // Party-specific identity text (name/SSN/DL) must attach to the correct signer.
  // Unique tab labels already prevent DocuSign green-link sync across pages.
  if (placement.type === 'text') {
    if (isParty2PrefillVariable(variable) && counts.ownerCount >= 2) {
      return resolveSecondarySignerIndex(signers);
    }
    if (isParty1IdentityPrefillVariable(variable)) {
      return resolvePrimarySignerIndex(signers);
    }
    // Shared deal prefill stays on primary (visible to both when shared=true).
    return resolvePrimarySignerIndex(signers);
  }
  if (placement.type === 'date') {
    if (
      (isSecondaryParty(placement.signerParty) || isParty2PrefillVariable(variable)) &&
      counts.ownerCount >= 2
    ) {
      return resolveSecondarySignerIndex(signers);
    }
    return resolvePrimarySignerIndex(signers);
  }

  const party = placement.signerParty;
  const page = String(placement.pageNumber || '');

  if (isSecondaryParty(party)) {
    if (counts.ownerCount >= 2) {
      if (
        layoutKey === 'contract' &&
        WOODMERE_ACH_OWNER2_INITIALS_ONLY_PAGES.has(page) &&
        placement.type !== 'initial'
      ) {
        return resolvePrimarySignerIndex(signers);
      }
      if (placement.type === 'initial') {
        return resolveSecondarySignerIndex(signers);
      }
      return resolveSecondarySignerIndex(signers);
    }
    if (placement.type === 'initial') {
      return resolvePrimarySignerIndex(signers);
    }
    return signers.length > 1 ? resolveSecondarySignerIndex(signers) : 0;
  }

  if (isPrimaryParty(party)) {
    return resolvePrimarySignerIndex(signers);
  }

  const legacy = String(placement.signerRole || '').trim();
  if (legacy && legacy.toLowerCase() !== 'signer') {
    const idx = signers.findIndex((s) => s.roleName.toLowerCase() === legacy.toLowerCase());
    if (idx >= 0) return idx;
  }

  return resolvePrimarySignerIndex(signers);
}

function isSecondaryParty(party: string | undefined): boolean {
  return party === 'secondary' || party === 'owner2' || party === 'guarantor2';
}

function isPrimaryParty(party: string | undefined): boolean {
  return (
    party === 'primary' ||
    party === 'client' ||
    party === 'owner' ||
    party === 'guarantor'
  );
}

function resolvePlacementSignerRoleName(
  placement: DocumentLayoutPlacement,
  signers: LayoutSignerInput[],
  counts: LayoutPartyCounts,
  layoutKey?: string,
): string {
  const idx = resolvePlacementSignerIndex(placement, signers, counts, layoutKey);
  return signers[idx]?.roleName || resolvePrimarySignerRoleName(signers);
}

const PRIMARY_GUARANTOR_NAME_VARIABLES = [
  'owner1_guarantor_name',
  'guaranty_owner1_name',
  'guaranty_guarantor1_name',
  'guaranty_client_name',
  'client_name',
  'addendum_client_name',
  'security_guarantor',
] as const;

function primaryGuarantorNamePresent(values: Record<string, string>): boolean {
  return PRIMARY_GUARANTOR_NAME_VARIABLES.some((k) => String(values[k] || '').trim());
}

/**
 * Mirror each Merchant #1 (primary) initial as a Merchant #2 (secondary) initial when two owners sign.
 * Applied to the main contract and every merged supplemental layout (ACH, flex addendum, etc.).
 */
function expandLayoutsWithOwner2Initials(
  layouts: DocumentLayout[],
  ownerCount: number,
): DocumentLayout[] {
  if (ownerCount < 2) return layouts;

  return layouts.map((layout) => {
    if (layout.skipOwner2InitialMirror) {
      return layout;
    }
    const extras: DocumentLayoutPlacement[] = [];
    for (const placement of layout.placements) {
      if (placement.type !== 'initial') continue;
      if (placement.when === 'owners >= 2') continue;
      if (
        layout.key === 'contract' &&
        WOODMERE_CONTRACT_NO_OWNER2_INITIAL_MIRROR_PAGES.has(
          String(placement.pageNumber || ''),
        )
      ) {
        continue;
      }
      if (isSecondaryParty(placement.signerParty)) continue;
      const party = placement.signerParty;
      if (party && !isPrimaryParty(party)) continue;

      const baseX = Number(placement.x);
      const baseY = Number(placement.y);
      if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) continue;

      extras.push({
        ...placement,
        id: `${placement.id}_m2init`,
        slot: `${placement.slot || placement.id}_m2init`,
        x: String(baseX + OWNER2_INITIAL_OFFSET_X),
        y: String(Math.max(0, baseY + OWNER2_INITIAL_OFFSET_Y)),
        signerParty: 'secondary',
        when: 'owners >= 2',
        sourceTabLabel: `Merchant #2 ${placement.sourceTabLabel || placement.id}`,
      });
    }
    return { ...layout, placements: [...layout.placements, ...extras] };
  });
}

const FLEX_ADDENDUM_MONEY_VARIABLES = new Set([
  'daily_payment_1',
  'daily_payment_2',
  'receivable_purchase_1',
  'receivable_purchase_2',
]);

function formatFlexAddendumMoneyUsd(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const n = Number(trimmed.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return trimmed;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Disclosure name tabs always render the merchant business name — never an owner / client person name. */
const DISCLOSURE_PERSONAL_NAME_VALUE_KEYS = [
  'owner1_guarantor_name',
  'guaranty_owner1_name',
  'guaranty_guarantor1_name',
  'guaranty_client_name',
  'customer_name',
  'client_name_by',
  'security_guarantor',
] as const;

const DISCLOSURE_SCOPED_VALUE_PREFIX = 'disclosure_pdf__';

function isDisclosureMerchantNamePlacement(
  placement?: DocumentLayoutPlacement,
  layoutKey?: string,
): boolean {
  if (!placement) return false;
  const tabLabel = String(placement.sourceTabLabel || '').trim();
  const variable = String(placement.variable || '').trim();
  const disclosurePlacement = String(placement.id || '').startsWith('sd_text_');
  const layout = String(layoutKey || '').trim().toLowerCase();
  const isDisclosureLayout =
    disclosurePlacement ||
    layout.startsWith('state_disclosure_') ||
    layout.includes('_disclosure') ||
    layout === 'disclosure';
  if (!isDisclosureLayout) {
    // Numbered disclosure-scoped keys can still appear outside sd_text_ in some exports.
    return isDisclosureMerchantNameVariable(tabLabel);
  }
  return (
    isDisclosureMerchantPlacementVariable(variable) ||
    isDisclosureMerchantNameVariable(tabLabel) ||
    isDisclosureMerchantNameVariable(variable)
  );
}

function resolveDisclosureMerchantNameValue(
  values: Record<string, string>,
  placement?: DocumentLayoutPlacement,
): string {
  const personalNames = DISCLOSURE_PERSONAL_NAME_VALUE_KEYS.map((key) =>
    String(values[key] || '').trim().toLowerCase(),
  ).filter(Boolean);
  const isPersonalName = (name: string) =>
    personalNames.includes(name.trim().toLowerCase());
  const scopedLabels = [
    String(placement?.sourceTabLabel || '').trim(),
    String(placement?.variable || '').trim(),
    `disclosure_${String(placement?.sourceTabLabel || '').trim()}`,
    `disclosure_${String(placement?.variable || '').trim()}`,
  ].filter((label) => label && label !== 'disclosure_');
  const candidates = [
    ...scopedLabels.map(
      (label) => values[`${DISCLOSURE_SCOPED_VALUE_PREFIX}${label}`],
    ),
    ...scopedLabels.map((label) => values[label]),
    values.disclosure_merchant_name,
    values.client_legal_name,
    values.business_legal_name,
    values.business_name,
    values.merchant_legal_name,
    values.legal_name,
    values.security_business_name,
    values.doing_business_as,
    values.recipient_name,
    values.recipient_name2,
    values.disclosure_name,
    values.authorization_client_name,
    values.authorization_application,
    values.disclosure_client_name,
    // Never use bare package-synced person `client_name`.
  ];
  for (const candidate of candidates) {
    const name = String(candidate || '').trim();
    if (!name || isPersonalName(name)) continue;
    if (/^\d+$/.test(name.replace(/\s/g, ''))) continue;
    return name;
  }
  return resolveDisclosureMerchantBusinessName(values);
}

function resolveTextPlacementValue(
  variable: string,
  values: Record<string, string>,
  placement?: DocumentLayoutPlacement,
  layoutKey?: string,
): string {
  const key = String(variable || '').trim();
  if (!key) return '';
  if (isDisclosureMerchantNamePlacement(placement, layoutKey)) {
    const disclosureMerchantName = resolveDisclosureMerchantNameValue(
      values,
      placement,
    );
    if (disclosureMerchantName) return disclosureMerchantName;
    // Never fall through to person-synced client_name for disclosure merchant slots.
    return '';
  }

  const formatIfMoney = (raw: string) =>
    FLEX_ADDENDUM_MONEY_VARIABLES.has(key.toLowerCase())
      ? formatFlexAddendumMoneyUsd(raw)
      : raw;

  // State disclosures use per-slot sourceTabLabel keys (funder_name_5, client_name_1).
  // Resolve those before any owner-name remapping so Woodmere funder/merchant fills work.
  if (isStateDisclosureTextPlacement(placement)) {
    const uniqueKey = String(placement?.sourceTabLabel || '').trim();
    const merchantSlot =
      isDisclosureMerchantPlacementVariable(key) ||
      isDisclosureMerchantNameVariable(uniqueKey);
    if (merchantSlot) {
      const business = resolveDisclosureMerchantBusinessName(values);
      if (business) return formatIfMoney(business);
      return '';
    }
    // Funding Provided / CT total_amount_commercial_financing / FL total_amount_business_fund
    // = offer / purchase amount only — never payback or net_to_merchant.
    // Exclude Texas `total_amount_business_fund_2` (net disbursed).
    const fundingSlotToken = `${key} ${uniqueKey}`.toLowerCase();
    const isBusinessFund2 =
      /(^|_)total_amount_business_fund_2($|_)/.test(fundingSlotToken);
    if (
      !isBusinessFund2 &&
      (/funding_provided/.test(fundingSlotToken) ||
        /total_amount_commercial_financing/.test(fundingSlotToken) ||
        /(^|_)total_amount_business_fund($|_)/.test(fundingSlotToken) ||
        /disclosure_purchase_price/.test(fundingSlotToken))
    ) {
      const offerForFunding =
        String(values.purchase_amount || '').trim() ||
        String(values.addendum_dated_principal_owner_amount || '').trim() ||
        String(values.disclosure_purchase_price || '').trim() ||
        String(values.total_amount_business_fund || '').trim() ||
        String(values.funding_provided || '').trim() ||
        String(values[toDisclosureScopedPrefillId('funding_provided')] || '').trim() ||
        String(values.total_amount_commercial_financing || '').trim() ||
        String(values.approved_amount || '').trim();
      if (offerForFunding) return formatIfMoney(offerForFunding);
      return '';
    }
    if (
      isTexasDisclosureLayoutKey(layoutKey) &&
      /total_amount_of_fund_disbursed/.test(fundingSlotToken)
    ) {
      const offerForFunding =
        String(values.purchase_amount || '').trim() ||
        String(values.addendum_dated_principal_owner_amount || '').trim() ||
        String(values.disclosure_purchase_price || '').trim() ||
        String(values.total_amount_business_fund || '').trim() ||
        String(values.funding_provided || '').trim() ||
        String(values[toDisclosureScopedPrefillId('funding_provided')] || '').trim() ||
        String(values.total_amount_commercial_financing || '').trim() ||
        String(values.approved_amount || '').trim();
      if (offerForFunding) return formatIfMoney(offerForFunding);
      const fromBusinessFund = String(values.total_amount_business_fund || '').trim();
      if (fromBusinessFund) return formatIfMoney(fromBusinessFund);
      return '';
    }
    if (
      isVirginiaDisclosureLayoutKey(layoutKey) &&
      /total_amount_sales_based_financing/.test(fundingSlotToken)
    ) {
      const offerForFunding =
        String(values.purchase_amount || '').trim() ||
        String(values.addendum_dated_principal_owner_amount || '').trim() ||
        String(values.disclosure_purchase_price || '').trim() ||
        String(values.total_amount_business_fund || '').trim() ||
        String(values.funding_provided || '').trim() ||
        String(values[toDisclosureScopedPrefillId('funding_provided')] || '').trim() ||
        String(values.total_amount_commercial_financing || '').trim() ||
        String(values.approved_amount || '').trim();
      if (offerForFunding) return formatIfMoney(offerForFunding);
      return '';
    }
    if (
      isVirginiaDisclosureLayoutKey(layoutKey) &&
      /disbursement_amount/.test(fundingSlotToken)
    ) {
      const disbursed =
        String(values.disclosure_funding_disbursed || '').trim() ||
        String(values.net_to_merchant || '').trim() ||
        String(values.disbursement_amount || '').trim();
      if (disbursed) return formatIfMoney(disbursed);
      return '';
    }
    const texasDisbursedAsOffer =
      isTexasDisclosureLayoutKey(layoutKey) &&
      (/total_amount_of_fund_disbursed/.test(fundingSlotToken) ||
        /total_amount_fund_disbursed/.test(fundingSlotToken));
    const virginiaSalesBasedAsOffer =
      isVirginiaDisclosureLayoutKey(layoutKey) &&
      /total_amount_sales_based_financing/.test(fundingSlotToken);
    const virginiaDisbursementAsNet =
      isVirginiaDisclosureLayoutKey(layoutKey) &&
      /disbursement_amount/.test(fundingSlotToken);
    if (
      isBusinessFund2 ||
      (!texasDisbursedAsOffer && /total_amount_of_fund_disbursed/.test(fundingSlotToken)) ||
      (!texasDisbursedAsOffer && /total_amount_fund_disbursed/.test(fundingSlotToken)) ||
      /disclosure_funding_disbursed/.test(fundingSlotToken) ||
      (!virginiaSalesBasedAsOffer && /total_amount_sales_based_financing/.test(fundingSlotToken)) &&
      !virginiaDisbursementAsNet
    ) {
      const disbursed =
        String(values.disclosure_funding_disbursed || '').trim() ||
        String(values.net_to_merchant || '').trim() ||
        String(values.total_amount_of_fund_disbursed || '').trim() ||
        String(values.total_amount_fund_disbursed || '').trim() ||
        String(values.total_amount_business_fund_2 || '').trim();
      if (disbursed) return formatIfMoney(disbursed);
    }
    if (uniqueKey) {
      const perPlacement = String(
        values[toDisclosureScopedPrefillId(uniqueKey)] ?? values[uniqueKey] ?? '',
      ).trim();
      if (perPlacement) return formatIfMoney(perPlacement);
    }
    const sharedScoped = String(values[toDisclosureScopedPrefillId(key)] ?? '').trim();
    if (sharedScoped) return formatIfMoney(sharedScoped);
    const sharedDirect = String(values[key] ?? '').trim();
    if (sharedDirect) return formatIfMoney(sharedDirect);
  }

  if (
    layoutKey === 'contract' &&
    (String(placement?.pageNumber || '') === '14' ||
      String(placement?.pageNumber || '') === '15') &&
    WOODMERE_ACH_CONSENT_PERSON_NAME_VARIABLES.has(key.toLowerCase())
  ) {
    const personal =
      resolvePersonalClientNameValue(values) ||
      String(
        values.authorization_client_name_print ||
          values.customer_name ||
          values.client_name ||
          values.owner1_guarantor_name ||
          values.ach_authorization_concent_account_holder_name ||
          values.ach_authorization_concent_account_holder_name_2 ||
          '',
      ).trim();
    if (personal) return formatIfMoney(personal);
  }

  if (
    !isStateDisclosureTextPlacement(placement) &&
    (key.toLowerCase() === 'client_name' ||
      key.toLowerCase() === 'addendum_client_name')
  ) {
    const layout = String(layoutKey || '').trim().toLowerCase();
    const isDisclosureLayout =
      layout.startsWith('state_disclosure_') ||
      layout.includes('_disclosure') ||
      layout === 'disclosure';
    if (isDisclosureLayout) {
      // Funder / platform disclosure PDFs: merchant business name, never Owner-1 person.
      const business = resolveDisclosureMerchantBusinessName(values);
      if (business) return formatIfMoney(business);
      return '';
    }
    // client_name__p2_p87 — owner/client person name only, never business legal name.
    const personal = resolvePersonalClientNameValue(values);
    if (personal) return formatIfMoney(personal);
    // Flex addendum page 2 "Owner 1 name (print)" must still stamp when the owner
    // equals merchant legal name (sole prop) or when scoped values only carry the
    // addendum print-name field.
    const flexLayout = resolveCanonicalSupplementalLayoutKey(layoutKey || '') === 'flex_addendum';
    if (flexLayout && key.toLowerCase() === 'addendum_client_name') {
      const printName = String(
        values.addendum_client_name ||
          values.flex_addendum_addendum_client_name ||
          values.owner1_guarantor_name ||
          values.guaranty_owner1_name ||
          values.client_name ||
          '',
      ).trim();
      if (printName) return formatIfMoney(printName);
    }
    return '';
  }

  if (
    layoutKey === 'contract' &&
    (String(placement?.pageNumber || '') === '14' ||
      String(placement?.pageNumber || '') === '15') &&
    WOODMERE_ACH_OWNER_NAME_VARIABLES.has(key.toLowerCase())
  ) {
    for (const aliasKey of PARTY1_NAME_KEYS) {
      const owner1 = String(values[aliasKey] || '').trim();
      if (owner1) return owner1;
    }
  }

  const candidates = [
    key,
    key.toLowerCase(),
    CRM_ID_TO_LAYOUT_VARIABLE[key.toLowerCase()] || '',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const direct = String(values[candidate] || '').trim();
    if (direct) return formatIfMoney(direct);
    const aliases = PREFILL_VALUE_ALIASES[candidate] || PREFILL_VALUE_ALIASES[candidate.toLowerCase()];
    if (aliases) {
      for (const alias of aliases) {
        const v = String(values[alias] || '').trim();
        if (v) return formatIfMoney(v);
      }
    }
  }
  return '';
}

function placementAllowed(
  placement: DocumentLayoutPlacement,
  counts: LayoutPartyCounts,
  values: Record<string, string> = {},
  layoutKey?: string,
): boolean {
  const when = String(placement.when || '').trim();
  if (when === 'owners >= 2' && counts.ownerCount < 2) return false;
  if (when === 'guarantors >= 2' && counts.ownerCount < 2) return false;

  if (
    layoutKey === 'contract' &&
    WOODMERE_ACH_OWNER2_INITIALS_ONLY_PAGES.has(String(placement.pageNumber || '')) &&
    isSecondaryParty(placement.signerParty) &&
    (placement.type === 'signature' || placement.type === 'date')
  ) {
    return false;
  }

  if (isSecondaryParty(placement.signerParty)) {
    if (counts.ownerCount < 2) return false;
  }

  if (
    placement.type === 'signature' &&
    placement.optional &&
    isPrimaryParty(placement.signerParty) &&
    !primaryGuarantorNamePresent(values)
  ) {
    return false;
  }

  const variable = String(placement.variable || '').trim().toLowerCase();
  const label = String(
    placement.sourceTabLabel || placement.slot || placement.variable || '',
  )
    .trim()
    .toLowerCase();
  if (variable || label) {
    const owner2Token = `${variable} ${label}`;
    if (
      /seller_2|discover_owner2|agreement_date_owner2|owner2|owner_2|guarantor2|guarantor_2/.test(
        owner2Token,
      ) &&
      counts.ownerCount < 2
    ) {
      return false;
    }
    if (/merchant2|merchant_2|appendix_merchant2|business_name_2/.test(owner2Token) && counts.ownerCount < 2) {
      return false;
    }
  }

  return true;
}

function includeEmptyLockedOptionalTextPlacement(
  placement: DocumentLayoutPlacement,
): boolean {
  return (
    placement.type === 'text' &&
    placement.optional === true &&
    placement.lockedForSigner === true
  );
}

/**
 * DocuSign auto-groups tabs that share the same Data Label (tabLabel) → green sync set.
 * Value fields must stay unique (blue/independent). Prefill still resolves via `variable`/`name`.
 */
function uniquifyEnvelopeTextTabLabel(
  baseLabel: string,
  placement: DocumentLayoutPlacement,
): string {
  const base = String(baseLabel || '').trim() || 'text';
  const id = String(placement.id || '').trim();
  if (!id) {
    const page = String(placement.pageNumber || '').trim();
    return page ? `${base}__page${page}` : base;
  }
  if (base === id || base.endsWith(`_${id}`) || base.endsWith(`__${id}`)) {
    return base;
  }
  const page = String(placement.pageNumber || '').trim();
  const suffix = page ? `p${page}_${id}` : id;
  if (base.includes(suffix)) return base;
  return `${base}__${suffix}`;
}

function toTextTab(
  placement: DocumentLayoutPlacement,
  value: string,
  envelopeDocumentId: string,
  _lockDataTabs = false,
  layoutKey?: string,
  tabLabelSuffix?: string,
): DocuSignTab {
  const signerEditable = isSignerEditableTextPlacement(layoutKey, placement);
  const tabValue = clearsValueAtSend(layoutKey, placement) ? '' : toPrefillUppercase(value, placement.variable || placement.sourceTabLabel);
  const variable = String(placement.variable || '').trim();
  const displayLabel =
    getPrefillDisplayLabel(variable) ||
    String(placement.sourceTabLabel || '').trim() ||
    variable ||
    placement.slot;
  const scopedTabLabel = resolveSupplementalEnvelopeTabLabel(
    layoutKey || '',
    placement,
    variable,
  );
  const baseLabel =
    scopedTabLabel ||
    String(placement.sourceTabLabel || '').trim() ||
    displayLabel ||
    `${variable || 'text'}_${placement.id}`;
  // Unique Data Label per field so page 14/15 (etc.) do not green-link as one group.
  const uniqueBaseLabel = uniquifyEnvelopeTextTabLabel(baseLabel, placement);
  const tabLabel = tabLabelSuffix ? `${uniqueBaseLabel}${tabLabelSuffix}` : uniqueBaseLabel;
  const width = resolveDocuSignPrefillTabWidth({
    value: tabValue,
    height: placement.height,
    layoutWidth: placement.width,
    fontSize: placement.fontSize,
    variable,
  });
  // CRM-prefilled tabs are always read-only in DocuSign (edit in Verify Prefill /
  // Edit ACH). Only explicit fill-at-signing fields (page-16 portal, client_phone,
  // lockedForSigner=false signer blanks) stay writable.
  const lockTab = !signerEditable;
  const optionalTab = !isRequiredSignerTextField(placement, layoutKey);
  // Fill-at-signing phones use unique labels — keep name in sync so CRM post-create
  // sync cannot rematch bare `authorized_business_phone`.
  // Disclosure merchant slots must NOT use bare `client_name` as `name` — post-create
  // prefill rematch would stamp Owner-1 person name onto Florida (etc.) disclosure tabs
  // (e.g. disclosure_client_name_1__p1_sd_text_1). Keep the scoped unique label instead.
  const isDisclosureMerchantTab =
    isDisclosureMerchantNamePlacement(placement, layoutKey) ||
    (isStateDisclosureTextPlacement(placement) &&
      isDisclosureMerchantNameVariable(variable));
  const tabName = clearsValueAtSend(layoutKey, placement)
    ? tabLabel || variable || undefined
    : isDisclosureMerchantTab
      ? tabLabel || variable || undefined
      : variable || undefined;
  const fontSize = resolveDocuSignFontSizeToken({
    fontSize: placement.fontSize || '9',
    height: placement.height,
  });
  return applyDocuSignPrefillTabStyle(
    {
      tabLabel,
      name: tabName,
      documentId: envelopeDocumentId,
      pageNumber: placement.pageNumber,
      xPosition: placement.x,
      yPosition: resolveTabYPosition(placement.y, layoutKey),
      ...(tabValue ? { value: tabValue } : {}),
      ...(optionalTab ? { optional: 'true' } : { required: 'true', optional: 'false' }),
      ...(lockTab ? { locked: 'true' } : {}),
      ...(placement.bold ? { bold: 'true' } : {}),
      // Never share — shared/same Data Label groups make one Prepare edit rewrite other fields.
      shared: 'false',
      // Keep explicit size9 — DocuSign auto-size was shrinking short tabs to ~size7.
      disableAutoSize: 'true',
      fontSize,
      width,
      ...(isFitToTextPrefillVariable(variable)
        ? { height: '19' }
        : placement.height
          ? { height: String(placement.height) }
          : { height: '19' }),
    },
    { height: placement.height || '19', fontSize },
  );
}

/** Stamp layout text/date values onto the base PDF for CC email (DocuSign download is often blank). */
export async function renderFlattenedLayoutPdf(
  layout: DocumentLayout & { documentBase64: string },
  values: Record<string, string>,
  counts: LayoutPartyCounts,
): Promise<Buffer> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(Buffer.from(layout.documentBase64, 'base64'));
  const font = await embedArialPdfFont(pdfDoc);
  const boldFont = await embedArialBoldPdfFont(pdfDoc);
  const pages = pdfDoc.getPages();
  const expanded = expandPrefillValues(values, counts.ownerCount, {
    layoutKey: String(layout.key || ''),
  });
  const scopedExpanded = buildScopedValuesForLayout(layout, expanded);

  for (const placement of layout.placements) {
    if (placement.type !== 'text' && placement.type !== 'date') continue;
    if (!placementAllowed(placement, counts, scopedExpanded, layout.key)) continue;
    if (isWoodmereContractFillAtSigningPlacement(layout.key, placement)) continue;
    // Keep client_phone as a live DocuSign tab (optional + writable), never burn into PDF.
    if (
      isOptionalSignerEditablePlacement(placement) ||
      isRequiredSignerEditablePlacement(placement)
    ) {
      continue;
    }
    const text = resolveTextPlacementValue(
      placement.variable || '',
      scopedExpanded,
      placement,
      layout.key,
    );
    if (!text) continue;

    const pageIndex = Math.max(0, parseInt(String(placement.pageNumber || '1'), 10) - 1);
    const page = pages[pageIndex];
    if (!page) continue;

    const fontSizeToken = resolveDocuSignFontSizeToken({
      fontSize: placement.fontSize,
      height: placement.height,
    });
    const fontSize =
      parseFloat(String(fontSizeToken).replace(/^size/i, '')) || 9;
    const { height: pageHeight } = page.getSize();
    const x = parseFloat(String(placement.x || '0')) || 0;
    const yTop = parseFloat(resolveTabYPosition(placement.y, layout.key)) || 0;
    const y = pageHeight - yTop - fontSize;

    const maxWidth = parseFloat(
      resolveDocuSignPrefillTabWidth({
        value: text,
        height: placement.height,
        layoutWidth: placement.width,
        fontSize: placement.fontSize,
        variable: placement.variable,
      }),
    );
    page.drawText(text, {
      x,
      y: Math.max(2, y),
      size: fontSize,
      font: placement.bold ? boldFont : font,
      color: rgb(0, 0, 0),
      maxWidth:
        isFitToTextPrefillVariable(placement.variable) ||
        !Number.isFinite(maxWidth) ||
        maxWidth <= 0
          ? undefined
          : maxWidth,
    });
  }

  return Buffer.from(
    await pdfDoc.save({ useObjectStreams: false, updateFieldAppearances: false }),
  );
}

/** State disclosure PDFs often fail DocuSign validation after pdf-lib rewrite. */
export function shouldFlattenLayoutPdf(layout: DocumentLayout): boolean {
  return !String(layout.key || '').startsWith('state_disclosure_');
}

function layoutPrefillBurnedIntoPdf(
  layoutKey: string,
  options: BuildEnvelopeFromLayoutOptions,
): boolean {
  if (options.flattenedLayoutKeys) {
    return options.flattenedLayoutKeys.has(layoutKey);
  }
  return options.skipTextDateTabs === true;
}

function toSignTab(
  placement: DocumentLayoutPlacement,
  envelopeDocumentId: string,
  layoutKey?: string,
): DocuSignTab {
  // Prefer unique source label (GUID / page-specific); never reuse one Data Label across tabs.
  const baseLabel =
    String(placement.sourceTabLabel || '').trim() ||
    placement.slot ||
    `${placement.type}_${placement.id}`;
  const scoped =
    layoutKey && !isMainContractLayoutKey(layoutKey)
      ? `${String(layoutKey).replace(/[^a-zA-Z0-9]+/g, '_')}_${baseLabel}`
      : baseLabel;
  const id = String(placement.id || '').trim();
  const tabLabel =
    id && !scoped.includes(id) ? `${scoped}__${id}` : scoped;
  return {
    tabLabel,
    documentId: envelopeDocumentId,
    pageNumber: placement.pageNumber,
    xPosition: placement.x,
    yPosition: resolveTabYPosition(placement.y, layoutKey),
    optional: placement.optional ? 'true' : 'false',
    shared: 'false',
  };
}

function toAttachmentTab(
  placement: DocumentLayoutPlacement,
  envelopeDocumentId: string,
  layoutKey?: string,
): DocuSignTab {
  const isOptional = placement.optional !== false;
  const tab: DocuSignTab = {
    tabLabel:
      String(placement.sourceTabLabel || '').trim() ||
      placement.slot ||
      `attachment_${placement.id}`,
    documentId: envelopeDocumentId,
    pageNumber: placement.pageNumber,
    xPosition: placement.x,
    yPosition: resolveTabYPosition(placement.y, layoutKey),
    scaleValue: '1',
  };
  if (isOptional) {
    // Match DocuSign template export: optional attachments use SignerAttachmentOptional
    // with optional=true only (no required property).
    tab.name = 'SignerAttachmentOptional';
    tab.optional = 'true';
  } else {
    tab.name = 'SignerAttachment';
    tab.optional = 'false';
    tab.required = 'true';
  }
  return tab;
}

export function buildRecipientTabsByRoleForLayout(
  layout: DocumentLayout,
  envelopeDocumentId: string,
  values: Record<string, string>,
  signers: LayoutSignerInput[],
  counts: LayoutPartyCounts,
): Map<string, SignerTabBuckets> {
  const signerTabs = new Map<number, SignerTabBuckets>();
  const scopedValues = buildScopedValuesForLayout(layout, values);

  const ensureSigner = (signerIndex: number) => {
    if (!signerTabs.has(signerIndex)) {
      signerTabs.set(signerIndex, emptySignerTabBuckets());
    }
    return signerTabs.get(signerIndex)!;
  };

  for (const placement of layout.placements) {
    if (!placementAllowed(placement, counts, scopedValues, layout.key)) continue;

    const signerIndex = resolvePlacementSignerIndex(placement, signers, counts, layout.key);

    const bucket = ensureSigner(signerIndex);

    if (placement.type === 'text' || placement.type === 'date') {
      const variable = placement.variable || '';
      const value = resolveTextPlacementValue(
        variable,
        scopedValues,
        placement,
        layout.key,
      );
      if (!value && !shouldIncludeEmptyTextPlacement(placement, layout.key)) continue;
      const tab = toTextTab(placement, value, envelopeDocumentId, false, layout.key);
      if (placement.type === 'date') bucket.dateTabs.push(tab);
      else bucket.textTabs.push(tab);
      continue;
    }

    if (placement.type === 'signature') {
      bucket.signHereTabs.push(toSignTab(placement, envelopeDocumentId, layout.key));
      continue;
    }

    if (placement.type === 'initial') {
      bucket.initialHereTabs.push(toSignTab(placement, envelopeDocumentId, layout.key));
      continue;
    }

    if (placement.type === 'attachment') {
      bucket.signerAttachmentTabs.push(toAttachmentTab(placement, envelopeDocumentId, layout.key));
    }
  }

  const byRole = new Map<string, SignerTabBuckets>();
  signers.forEach((s, idx) => {
    const tabs = signerTabs.get(idx);
    if (tabs) byRole.set(s.roleName, tabs);
  });
  return byRole;
}

function signerHasTabs(tabs: SignerTabBuckets): boolean {
  return (
    tabs.textTabs.length +
      tabs.dateTabs.length +
      tabs.signHereTabs.length +
      tabs.initialHereTabs.length +
      tabs.signerAttachmentTabs.length >
    0
  );
}

/**
 * Builds DocuSign envelope definition from platform layouts + PDFs.
 * Same `variable` is written to every placement that references it (multi-page prefill).
 */
export function buildEnvelopeFromLayouts(options: BuildEnvelopeFromLayoutOptions) {
  const counts: LayoutPartyCounts = {
    ownerCount: options.ownerCount ?? 1,
    guarantorCount: options.guarantorCount ?? 0,
  };
  const values = enrichValuesFromSigners(
    expandPrefillValues(options.values, counts.ownerCount),
    options.signers,
    counts.ownerCount,
  );
  const documents: Array<{ documentId: string; name: string; documentBase64: string }> =
    [];
  /** Index-parallel ids preserve duplicate layout instances. */
  const envelopeDocIdByLayoutIndex: string[] = [];
  const pageOffsetByLayoutKey = options.pageOffsetByLayoutKey ?? new Map<string, number>();

  if (options.mergedDocument?.documentBase64) {
    const mergedName = toEnvelopeSubjectUppercase(
      String(options.mergedDocument.name || '').trim() ||
      options.primaryDocumentName ||
      'Contract Package',
    );
    documents.push({
      documentId: '1',
      name: mergedName,
      documentBase64: options.mergedDocument.documentBase64,
    });
    options.layouts.forEach(() => envelopeDocIdByLayoutIndex.push('1'));
  } else {
    options.layouts.forEach((layout, idx) => {
      const envelopeDocId = String(idx + 1);
      envelopeDocIdByLayoutIndex.push(envelopeDocId);
      const base64 = (layout as DocumentLayout & { documentBase64?: string })
        .documentBase64;
      if (!base64) {
        throw new Error(
          `Layout "${layout.key}" is missing documentBase64 on the merged envelope build.`,
        );
      }
      documents.push({
        documentId: envelopeDocId,
        name: toEnvelopeSubjectUppercase(
          idx === (options.primaryLayoutIndex ?? 0) && options.primaryDocumentName
            ? options.primaryDocumentName
            : layout.document.originalFileName || layout.name),
        documentBase64: base64,
      });
    });
  }

  const signerTabs = new Map<number, SignerTabBuckets>();

  const ensureSigner = (signerIndex: number) => {
    if (!signerTabs.has(signerIndex)) {
      signerTabs.set(signerIndex, emptySignerTabBuckets());
    }
    return signerTabs.get(signerIndex)!;
  };

  const expandedLayouts = expandLayoutsWithOwner2Initials(options.layouts, counts.ownerCount);
  const normalizeLayoutInstanceKey = (layoutKey: string): string => {
    const key = String(layoutKey || '').trim().toLowerCase();
    if (
      key === 'ach_authorization' ||
      key === 'ach_authorization_standalone' ||
      key.includes('ach_authorization')
    ) {
      return 'ach_authorization';
    }
    return key;
  };
  const isAchLayoutKey = (layoutKey: string): boolean =>
    normalizeLayoutInstanceKey(layoutKey) === 'ach_authorization';
  const layoutInstanceCounts = new Map<string, number>();
  for (const layout of expandedLayouts) {
    const key = normalizeLayoutInstanceKey(String(layout.key || ''));
    layoutInstanceCounts.set(key, (layoutInstanceCounts.get(key) || 0) + 1);
  }
  const layoutInstanceOccurrences = new Map<string, number>();

  for (const [layoutIndex, layout] of expandedLayouts.entries()) {
    const layoutInstanceKey = normalizeLayoutInstanceKey(String(layout.key || ''));
    const layoutOccurrence = (layoutInstanceOccurrences.get(layoutInstanceKey) || 0) + 1;
    layoutInstanceOccurrences.set(layoutInstanceKey, layoutOccurrence);
    const tabLabelSuffix =
      (layoutInstanceCounts.get(layoutInstanceKey) || 0) > 1
        ? `__instance_${layoutOccurrence}`
        : undefined;
    const envelopeDocId = envelopeDocIdByLayoutIndex[layoutIndex] || '1';
    const pageOffset =
      options.pageOffsetByLayoutIndex?.[layoutIndex] ??
      pageOffsetByLayoutKey.get(layout.key) ??
      0;
    const globalValuesForInstance = { ...values };
    if (Array.isArray(options.layoutValues) && layoutIndex < options.layoutValues.length) {
      const canonical = resolveCanonicalSupplementalLayoutKey(String(layout.key || ''));
      const prefix = canonical ? LAYOUT_CRM_PREFIX[canonical] : undefined;
      if (prefix) {
        for (const key of Object.keys(globalValuesForInstance)) {
          if (key.startsWith(prefix)) delete globalValuesForInstance[key];
        }
      }
      if (isAchLayoutKey(String(layout.key || ''))) {
        for (const key of Object.keys(globalValuesForInstance)) {
          const lk = key.toLowerCase();
          if (
            lk.includes('ach_authorization') ||
            lk.includes('authorization_client') ||
            lk.includes('authorizationclient') ||
            lk.startsWith('achauthorization') ||
            lk === 'authorized_business_phone' ||
            lk === 'authorizedbusinessphone'
          ) {
            delete globalValuesForInstance[key];
          }
        }
      }
    }
    const instanceValues = enrichValuesFromSigners(
      expandPrefillValues(
        {
          ...globalValuesForInstance,
          ...(options.layoutValues?.[layoutIndex] || {}),
        },
        counts.ownerCount,
        { layoutKey: String(layout.key || '') },
      ),
      options.signers,
      counts.ownerCount,
    );
    const scopedValues = buildScopedValuesForLayout(layout, instanceValues);

    for (const placement of layout.placements) {
      if (!placementAllowed(placement, counts, scopedValues, layout.key)) continue;

      const signerIndex = resolvePlacementSignerIndex(
        placement,
        options.signers,
        counts,
        layout.key,
      );

      const bucket = ensureSigner(signerIndex);
      const tabPlacement = placementPageOffset(placement, pageOffset);

      if (placement.type === 'text' || placement.type === 'date') {
        if (
          layoutPrefillBurnedIntoPdf(layout.key, options) &&
          !shouldIncludeEmptyTextPlacement(placement, layout.key)
        ) {
          continue;
        }
        const variable = placement.variable || '';
        const value = resolveTextPlacementValue(
          variable,
          scopedValues,
          placement,
          layout.key,
        );
        if (!value && !shouldIncludeEmptyTextPlacement(placement, layout.key)) continue;
        const tab = toTextTab(
          tabPlacement,
          value,
          envelopeDocId,
          options.lockDataTabs,
          layout.key,
          tabLabelSuffix,
        );
        if (placement.type === 'date') bucket.dateTabs.push(tab);
        else bucket.textTabs.push(tab);
        continue;
      }

      if (placement.type === 'signature') {
        bucket.signHereTabs.push(toSignTab(tabPlacement, envelopeDocId, layout.key));
        continue;
      }

      if (placement.type === 'initial') {
        bucket.initialHereTabs.push(toSignTab(tabPlacement, envelopeDocId, layout.key));
        continue;
      }

      if (placement.type === 'attachment') {
        bucket.signerAttachmentTabs.push(toAttachmentTab(tabPlacement, envelopeDocId, layout.key));
      }
    }
  }

  const emptyTabs = emptySignerTabBuckets;

  const mappedSigners = options.signers.map((s, idx) => {
    const tabs = signerTabs.get(idx) || emptyTabs();
    return {
      roleName: s.roleName,
      name: s.name,
      email: s.email,
      routingOrder: s.routingOrder,
      tabs,
    };
  });

  if (counts.ownerCount >= 2) {
    const secondaryIdx = resolveSecondarySignerIndex(options.signers);
    const secondaryTabs = signerTabs.get(secondaryIdx);
    const hasSecondaryRecipient = mappedSigners.some(
      (s, idx) => idx === secondaryIdx && signerHasTabs(s.tabs),
    );
    if (!hasSecondaryRecipient && secondaryTabs && signerHasTabs(secondaryTabs)) {
      const secondaryInput = options.signers[secondaryIdx];
      if (secondaryInput) {
        mappedSigners.push({
          roleName:
            secondaryInput.roleName || resolveSecondarySignerRoleName(options.signers),
          name: secondaryInput.name,
          email: secondaryInput.email,
          routingOrder: secondaryInput.routingOrder ?? 2,
          tabs: secondaryTabs,
        });
      }
    }
  }

  const signers = mappedSigners
    .filter((s) => signerHasTabs(s.tabs))
    .map((s, idx) => ({
      roleName: s.roleName,
      name: s.name,
      email: s.email,
      recipientId: String(idx + 1),
      routingOrder: String(s.routingOrder ?? idx + 1),
      tabs: s.tabs,
    }));

  return {
    status: 'created',
    documents,
    recipients: { signers },
  };
}
