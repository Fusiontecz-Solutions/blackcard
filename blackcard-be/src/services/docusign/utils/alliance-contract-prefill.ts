import prisma from '../../../config/prismaClient';
import { isFunderContractLayoutKey } from '../../../utils/funderContractLayout';

/**
 * Layout-key token for the Alliance Bridge contract. Platform coordinates do
 * not ship an Alliance layout, so this token is used only for detection.
 */
const ALLIANCE_BRIDGE_CONTRACT_LAYOUT_KEY = 'alliance_bridge_contract';
import {
  buildLayoutPrefillValueRecord,
  CRM_ID_TO_LAYOUT_VARIABLE,
} from './prefill-layout-bridge';
import { normalizeFieldKey } from './docusign-prefill';
import {
  isAllianceBridgeFunder,
  isTexasContractState,
  isTexasFundingGroupFunder,
  resolveMainContractCoordinateLayoutKey,
} from './resolve-main-contract-layout';
import { DOCUMENT_LAYOUT_KEYS } from '../layouts/document-layout.registry';

export const ALLIANCE_CONTRACT_MONEY_TAB_IDS = new Set([
  'purchase_amount',
  'finance_charge',
  'purchase_price',
  'appendix_underwriting_fees',
  'net_to_merchant',
  'remittance',
]);

/** CRM / BoldSign ids that map to Alliance page-1 money tabs. */
export const ALLIANCE_CONTRACT_MONEY_FIELD_ALIASES: Record<string, readonly string[]> = {
  purchase_amount: [
    'purchaseamount',
    'receivable_purchase',
    'receivable_purchase_1',
    'receivable_purchase_2',
  ],
  purchase_price: [
    'purchaseprice',
    'total_repayment_amount',
    'disclosure_total_payment',
    'estimatedtotalpaymentamount',
  ],
  finance_charge: [
    'financecharge',
    'total_dollar_cost',
    'disclosure_finance_charge',
  ],
  appendix_underwriting_fees: [
    'underwriter_fee',
    'underwriterfee',
    'underwriter_fees',
  ],
  net_to_merchant: ['netfundprovided', 'net_fund_provided', 'NetFundProvided'],
  remittance: [
    'daily_payment',
    'dailypayment',
    'estimated_payment',
    'estimated_payment_amount',
    'estimatedremittance',
  ],
};

/** Page 1 city / state / ZIP lines — must render Arial 9 (not size7 from legacy 14px tabs). */
export const ALLIANCE_CONTRACT_PAGE1_SUBADDRESS_TAB_IDS = new Set([
  'business_address_city',
  'business_address_state',
  'business_address_zip',
  'business_address_contract_city',
  'business_address_contract_state',
  'business_address_contract_zip',
]);

const BUSINESS_DAYS_PER_WEEK = 5;

function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).trim().replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatAllianceUsd(value: unknown): string {
  const n = parseMoney(value);
  if (n === null) {
    const raw = String(value ?? '').trim();
    return raw;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function toAllianceMoneyFieldKey(fieldId?: string | null): string | null {
  const raw = String(fieldId ?? '').trim();
  if (!raw) return null;
  const snake = raw
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
  const norm = normalizeFieldKey(raw);
  if (ALLIANCE_CONTRACT_MONEY_TAB_IDS.has(snake)) return snake;
  if (ALLIANCE_CONTRACT_MONEY_TAB_IDS.has(norm)) return norm;
  const layoutVar = CRM_ID_TO_LAYOUT_VARIABLE[norm] || CRM_ID_TO_LAYOUT_VARIABLE[snake];
  if (layoutVar && ALLIANCE_CONTRACT_MONEY_TAB_IDS.has(layoutVar)) return layoutVar;
  for (const canonical of ALLIANCE_CONTRACT_MONEY_TAB_IDS) {
    const aliases = ALLIANCE_CONTRACT_MONEY_FIELD_ALIASES[canonical] || [];
    if (aliases.some((alias) => normalizeFieldKey(alias) === norm)) return canonical;
  }
  return null;
}

function hydrateAllianceMoneyCanonicalValues(values: Record<string, string>): void {
  for (const canonical of ALLIANCE_CONTRACT_MONEY_TAB_IDS) {
    if (String(values[canonical] ?? '').trim()) continue;
    for (const alias of ALLIANCE_CONTRACT_MONEY_FIELD_ALIASES[canonical] || []) {
      const raw = String(values[alias] ?? '').trim();
      if (raw) {
        values[canonical] = raw;
        break;
      }
    }
    if (String(values[canonical] ?? '').trim()) continue;
    for (const [key, val] of Object.entries(values)) {
      if (toAllianceMoneyFieldKey(key) === canonical && String(val ?? '').trim()) {
        values[canonical] = String(val).trim();
        break;
      }
    }
  }
}

function propagateAllianceMoneyFormattedValues(values: Record<string, string>): void {
  for (const canonical of ALLIANCE_CONTRACT_MONEY_TAB_IDS) {
    const formatted = String(values[canonical] ?? '').trim();
    if (!formatted) continue;
    for (const alias of ALLIANCE_CONTRACT_MONEY_FIELD_ALIASES[canonical] || []) {
      values[alias] = formatted;
    }
  }
}

function normalizeFrequencyKey(frequency: string): string {
  const f = String(frequency ?? '')
    .trim()
    .toLowerCase();
  if (f.includes('biweek') || f.includes('bi_week')) return 'biweekly';
  if (f.startsWith('week')) return 'weekly';
  if (f.startsWith('day')) return 'daily';
  if (f.startsWith('month')) return 'monthly';
  return f || 'daily';
}

function formatWeeksLabel(weeks: number): string {
  const n = Math.max(1, Math.round(weeks));
  return `${n} ${n === 1 ? 'week' : 'weeks'}`;
}

function resolveTermWeeks(values: Record<string, string>): number | null {
  const freqKey = normalizeFrequencyKey(values.frequency || '');
  const paymentsRaw =
    values.ach_authorization_account_holder_bank_number_of_transactions ||
    values.number_of_payments ||
    values.estimated_number_of_payments ||
    '';
  const payments = Math.max(
    1,
    Math.trunc(parseMoney(paymentsRaw) ?? 0) ||
      Math.trunc(Number(String(paymentsRaw).replace(/[^\d]/g, '')) || 0) ||
      1,
  );

  if (freqKey === 'daily') {
    return Math.max(1, Math.round(payments / BUSINESS_DAYS_PER_WEEK));
  }
  if (freqKey === 'weekly') {
    return payments;
  }
  if (freqKey === 'biweekly') {
    return payments * 2;
  }
  if (freqKey === 'monthly') {
    return payments * 4;
  }
  return payments;
}

const ALLIANCE_CONTRACT_ADDRESS_TAB_GROUPS: Array<[string, string, string, string]> = [
  ['business_address', 'business_address_city', 'business_address_state', 'business_address_zip'],
  [
    'business_address_contract',
    'business_address_contract_city',
    'business_address_contract_state',
    'business_address_contract_zip',
  ],
];

function stripDuplicateAddressSuffix(
  line: string,
  city: string,
  state: string,
  zip: string,
): string {
  let street = String(line ?? '').trim();
  if (!street || (!city && !state && !zip)) return street;

  const suffixCandidates = [
    [city, state, zip].filter(Boolean).join(', '),
    [city, state].filter(Boolean).join(', '),
    city,
  ].filter((s) => s.length > 0);

  for (const suffix of suffixCandidates) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withComma = new RegExp(`,\\s*${escaped}\\s*$`, 'i');
    if (withComma.test(street)) {
      street = street.replace(withComma, '').trim();
      break;
    }
  }
  return street;
}

/** Alliance page 1: street tab is street-only; city/state/zip use separate tabs below. */
export function applyAllianceBridgeAddressPrefillValues(values: Record<string, string>): void {
  for (const [streetKey, cityKey, stateKey, zipKey] of ALLIANCE_CONTRACT_ADDRESS_TAB_GROUPS) {
    const city = String(values[cityKey] ?? '').trim();
    const state = String(values[stateKey] ?? '').trim();
    const zip = String(values[zipKey] ?? '').trim();
    if (!city && !state && !zip) continue;

    const streetOnly = stripDuplicateAddressSuffix(
      String(values[streetKey] ?? '').trim(),
      city,
      state,
      zip,
    );
    if (streetOnly) values[streetKey] = streetOnly;
  }
}

/** Map CRM Exhibit A values (`exhibit_a_value_N`) onto Alliance layout tabs (`exhibit_company_name_N`). */
export function applyAllianceBridgeExhibitPrefillValues(values: Record<string, string>): void {
  for (let i = 1; i <= 10; i += 1) {
    const companyKey = `exhibit_company_name_${i}`;
    const legacyKey = `exhibit_a_value_${i}`;
    const legacy = String(values[legacyKey] ?? '').trim();
    if (!String(values[companyKey] ?? '').trim() && legacy) {
      values[companyKey] = legacy;
    }
  }
}

export function isAllianceBridgeContractLayoutKey(layoutKey?: string | null): boolean {
  return String(layoutKey ?? '').trim() === ALLIANCE_BRIDGE_CONTRACT_LAYOUT_KEY;
}

export function isTexasFundingGroupContractLayoutKey(layoutKey?: string | null): boolean {
  const key = String(layoutKey ?? '').trim();
  return (
    key === DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract ||
    key === 'texas_funding_group' ||
    key === ALLIANCE_BRIDGE_CONTRACT_LAYOUT_KEY
  );
}

export type AllianceBridgePrefillContext = {
  /** Storage / send layout key (may be `funder_<uuid>` in production). */
  layoutKey?: string | null;
  /** Coordinate layout used for tab placements (often `alliance_bridge_contract`). */
  coordinateLayoutKey?: string | null;
  funderName?: string | null;
  contractState?: string | null;
};

/**
 * True when Texas contract money formatting ($ amounts) / address / term-weeks should run.
 * Covers Texas Funding Group + legacy Alliance Bridge layouts (same money tab ids).
 */
export function shouldApplyAllianceBridgeContractPrefill(
  context?: AllianceBridgePrefillContext,
): boolean {
  const layoutKey = String(context?.layoutKey ?? '').trim();
  const coordinateLayoutKey = String(context?.coordinateLayoutKey ?? '').trim();
  if (isTexasFundingGroupContractLayoutKey(layoutKey)) return true;
  if (coordinateLayoutKey && isTexasFundingGroupContractLayoutKey(coordinateLayoutKey)) {
    return true;
  }
  if (!isTexasContractState(context?.contractState)) return false;
  const funderName = String(context?.funderName ?? '').trim();
  if (
    funderName &&
    (isTexasFundingGroupFunder(funderName) || isAllianceBridgeFunder(funderName))
  ) {
    return (
      isFunderContractLayoutKey(layoutKey) ||
      isTexasFundingGroupContractLayoutKey(layoutKey) ||
      !layoutKey
    );
  }
  return false;
}

/** Resolve coordinate layout key for a main contract send (handles production `funder_*` PDF keys). */
export async function resolveAllianceBridgeCoordinateLayoutKey(options: {
  mainContractLayoutKey?: string | null;
  funderName?: string | null;
  contractState?: string | null;
}): Promise<string | null> {
  const layoutKey = String(options.mainContractLayoutKey ?? '').trim();
  if (isTexasFundingGroupContractLayoutKey(layoutKey)) {
    return layoutKey === ALLIANCE_BRIDGE_CONTRACT_LAYOUT_KEY
      ? ALLIANCE_BRIDGE_CONTRACT_LAYOUT_KEY
      : DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract;
  }
  if (isFunderContractLayoutKey(layoutKey)) {
    const funderId = layoutKey.replace(/^funder_/i, '');
    if (funderId) {
      const row = await prisma.funderProfile.findUnique({
        where: { id: funderId },
        select: {
          name: true,
          displayName: true,
          mainContractLayoutKey: true,
          organization: true,
          legalName: true,
          contactEmail: true,
          allowedStates: true,
        },
      });
      if (row) {
        const allowedStates = Array.isArray(row.allowedStates)
          ? (row.allowedStates as unknown[]).map((s) => String(s)).filter(Boolean)
          : [];
        return resolveMainContractCoordinateLayoutKey({
          funderName: row.name,
          state: options.contractState,
          mainContractLayoutKey: row.mainContractLayoutKey,
          allowedStates,
        });
      }
    }
  }
  const funderName = String(options.funderName ?? '').trim();
  if (funderName) {
    return resolveMainContractCoordinateLayoutKey({
      funderName,
      state: options.contractState,
    });
  }
  return null;
}

/** Authoritative gate for DocuSign send / prefill sync (production uses `funder_*` storage keys). */
export async function shouldApplyAllianceBridgeContractPrefillForSend(options: {
  mainContractLayoutKey?: string | null;
  funderName?: string | null;
  contractState?: string | null;
}): Promise<boolean> {
  const layoutKey = String(options.mainContractLayoutKey ?? '').trim();
  const coordinateLayoutKey = await resolveAllianceBridgeCoordinateLayoutKey(options);
  return shouldApplyAllianceBridgeContractPrefill({
    layoutKey,
    coordinateLayoutKey,
    funderName: options.funderName,
    contractState: options.contractState,
  });
}

export function isAllianceContractPage1SubaddressTab(variable?: string | null): boolean {
  return ALLIANCE_CONTRACT_PAGE1_SUBADDRESS_TAB_IDS.has(String(variable ?? '').trim());
}

/** DocuSign tab styling for Alliance Texas contract (Arial 9 on page-1 address + amount fields). */
export function resolveAllianceBridgePrefillTabStyleOptions(
  layoutKey: string | undefined,
  variable: string | undefined,
  height?: string | number,
  alliancePrefillActive?: boolean,
): { height?: string | number; fontSize?: string } {
  const active =
    alliancePrefillActive === true ||
    shouldApplyAllianceBridgeContractPrefill({
      layoutKey,
      coordinateLayoutKey: layoutKey,
    });
  if (!active) {
    return { height };
  }
  const tabId = String(variable ?? '').trim();
  if (isAllianceContractPage1SubaddressTab(tabId) || ALLIANCE_CONTRACT_MONEY_TAB_IDS.has(tabId)) {
    return { height: '19', fontSize: 'size9' };
  }
  const h = parseFloat(String(height ?? '19')) || 19;
  if (h >= 19 && h < 24) {
    return { height, fontSize: 'size9' };
  }
  return { height };
}

/** Flattened PDF point size for Alliance layout text placements. */
export function resolveAllianceBridgeFlattenedFontSizePt(
  layoutKey: string | undefined,
  placement: { variable?: string; height?: string | number },
  fallback: number,
  alliancePrefillActive?: boolean,
): number {
  const active =
    alliancePrefillActive === true ||
    shouldApplyAllianceBridgeContractPrefill({
      layoutKey,
      coordinateLayoutKey: layoutKey,
    });
  if (!active) return fallback;
  const tabId = String(placement.variable ?? '').trim();
  if (isAllianceContractPage1SubaddressTab(tabId) || ALLIANCE_CONTRACT_MONEY_TAB_IDS.has(tabId)) {
    return 9;
  }
  const h = parseFloat(String(placement.height ?? '19')) || 19;
  if (h >= 19 && h < 24) return 9;
  return fallback;
}

/** Apply Alliance money / address / term formatting to CRM prefill field rows (Texas contract only). */
export function applyAllianceBridgeContractPrefillToFieldList<
  T extends { id: string; value: string },
>(fields: T[]): T[] {
  if (!fields.length) return fields;
  const values = buildLayoutPrefillValueRecord(fields);
  applyAllianceBridgeContractPrefillValues(values);

  const allianceManagedKeys = new Set<string>([
    ...ALLIANCE_CONTRACT_MONEY_TAB_IDS,
    ...ALLIANCE_CONTRACT_PAGE1_SUBADDRESS_TAB_IDS,
    'business_address',
    'business_address_contract',
    'addendum_dated',
    ...Array.from({ length: 10 }, (_, i) => `exhibit_company_name_${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `exhibit_a_value_${i + 1}`),
  ]);

  return fields.map((field) => {
    const id = String(field.id ?? '').trim();
    if (!id) return field;
    const moneyKey = toAllianceMoneyFieldKey(id);
    if (moneyKey) {
      const updated = String(values[moneyKey] ?? '').trim();
      return updated ? { ...field, value: updated } : field;
    }
    const snake = id
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
    const layoutVar = CRM_ID_TO_LAYOUT_VARIABLE[id] || snake;
    if (!allianceManagedKeys.has(snake) && !allianceManagedKeys.has(layoutVar)) {
      return field;
    }
    const updated =
      String(values[layoutVar] ?? values[snake] ?? values[id] ?? '').trim();
    return updated ? { ...field, value: updated } : field;
  });
}

/** Alliance Texas contract: USD amounts with $ and page-1 addendum_dated as term weeks. */
export function applyAllianceBridgeContractPrefillValues(values: Record<string, string>): void {
  hydrateAllianceMoneyCanonicalValues(values);
  for (const id of ALLIANCE_CONTRACT_MONEY_TAB_IDS) {
    const raw = String(values[id] || '').trim();
    if (!raw) continue;
    values[id] = formatAllianceUsd(raw);
  }
  propagateAllianceMoneyFormattedValues(values);

  const offer = parseMoney(values.purchase_amount);
  const payback = parseMoney(values.purchase_price);
  const computedFinanceCharge =
    offer != null && payback != null && payback > offer ? payback - offer : null;
  const financeRaw = String(values.finance_charge || '').trim();
  if (financeRaw) {
    values.finance_charge = formatAllianceUsd(financeRaw);
  } else if (computedFinanceCharge != null) {
    values.finance_charge = formatAllianceUsd(computedFinanceCharge);
  }

  const weeks = resolveTermWeeks(values);
  if (weeks != null && Number.isFinite(weeks)) {
    values.addendum_dated = formatWeeksLabel(weeks);
  }

  applyAllianceBridgeAddressPrefillValues(values);
  applyAllianceBridgeExhibitPrefillValues(values);
}
