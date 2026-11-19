import { toPrefillUppercase } from './prefill-uppercase';
import { isDisclosureMerchantNameVariable } from './layout-prefill-scope';

export type PrefillFieldInput = { id: string; value: string };

export type DocusignTextTabRef = {
  tabId?: string;
  tabLabel?: string;
  name?: string;
  value?: string;
  pageNumber?: string | number;
};

/**
 * Tabs the signer fills blank (not CRM). Portal fields are label-only.
 * Contract pages 14–15 authorized business phone are CRM-prefilled + locked.
 */
const SIGNER_BLANK_PORTAL_LABELS = new Set([
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

function shouldSkipCrmPrefillForTab(tab: DocusignTextTabRef): boolean {
  const labels = [tab.tabLabel, tab.name]
    .map((s) => normalizeFieldKey(String(s || '')))
    .filter(Boolean);
  for (const raw of labels) {
    // Strip uniquify + multi-layout instance suffixes so portal blank fields still skip.
    const label = raw
      .replace(/__instance_\d+$/i, '')
      .replace(/__p\d+_[a-z0-9]+$/i, '')
      .replace(/__page\d+$/i, '');
    if (SIGNER_BLANK_PORTAL_LABELS.has(label) || SIGNER_BLANK_PORTAL_LABELS.has(raw)) {
      return true;
    }
  }
  return false;
}

/** Human-readable BoldSign/CRM labels → snake_case field id (for DocuSign tabLabel matching). */
const CRM_LABEL_TO_FIELD_ID: Record<string, string> = {
  legalname: 'client_legal_name',
  legal_name: 'client_legal_name',
  /** Balance Transfer: Business Legal Name → entity legal name (not client_legal_name). */
  businesslegalname: 'business_name',
  business_legal_name: 'business_name',
  businessname: 'business_name',
  business_name: 'business_name',
  /** Balance Transfer: Merchant Legal Name → CRM client_name. */
  merchantlegalname: 'client_name',
  merchant_legal_name: 'client_name',
  merchantname: 'client_name',
  merchant_name: 'client_name',
  clientdba: 'client_dba',
  client_dba: 'client_dba',
  physicaladdress: 'physical_address',
  physical_address: 'physical_address',
  clientnameby: 'client_name_by',
  client_name_by: 'client_name_by',
  seller1name: 'seller_1_name',
  seller_1_name: 'seller_1_name',
  sellername: 'seller_name',
  seller_name: 'seller_name',
  businesssellerlegalname: 'client_legal_name',
  business_seller_legal_name: 'client_legal_name',
  sellerlegalname: 'client_legal_name',
  seller_legal_name: 'client_legal_name',
  authorizationclientsignername: 'authorization_client_signer_name',
  authorization_client_signer_name: 'authorization_client_signer_name',
  authorizationsignername: 'authorization_client_signer_name',
  authorization_signer_name: 'authorization_client_signer_name',
  stateofincorporation: 'state_of_inc',
  state_of_incorporation: 'state_of_inc',
  doingbusinessas: 'doing_business_as',
  doing_business_as: 'doing_business_as',
  dba: 'doing_business_as',
  federaltaxidein: 'federal_tax_id_ein',
  federal_tax_id: 'federal_tax_id_ein',
  ein: 'federal_tax_id_ein',
  clientemail: 'client_email',
  clientphone: 'client_phone',
  clientname: 'client_name',
  addendumclientname: 'addendum_client_name',
  addendum_client_name: 'addendum_client_name',
  agreementdate: 'agreement_date',
  agreement_date: 'agreement_date',
  agreementdated: 'agreement_date',
  agreement_dated: 'agreement_date',
  purchaseprice: 'purchase_price',
  purchaseamount: 'purchase_amount',
  purchase_amount: 'purchase_amount',
  businessaddress: 'business_address',
  business_address: 'business_address',
  merchantbusinessaddress1: 'business_address',
  merchantbusinessaddress: 'business_address',
  merchantcontactaddress1: 'business_address_contract',
  merchantcontactaddress: 'business_address_contract',
  businessaddresscity: 'business_address_city',
  businessaddressstate: 'business_address_state',
  businessaddresszip: 'business_address_zip',
  typeofentity: 'entity_type',
  type_of_entity: 'entity_type',
  entitytype: 'entity_type',
  entity_type: 'entity_type',
  remittance: 'remittance',
  purchasepercent: 'purchase_percent',
  purchase_percent: 'purchase_percent',
  specifiedpercentage: 'purchase_percent',
  specified_percentage: 'purchase_percent',
  totalremit: 'remittance',
  total_remit: 'remittance',
  frequency: 'frequency',
  paymentterms: 'frequency',
  payment_terms: 'frequency',
  netfundprovided: 'net_to_merchant',
  net_fund_provided: 'net_to_merchant',
  nettomerchant: 'net_to_merchant',
  net_to_merchant: 'net_to_merchant',
  NetFundProvided: 'net_to_merchant',
  appendixunderwritingfees: 'appendix_underwriting_fees',
  appendix_underwriting_fees: 'appendix_underwriting_fees',
  underwriterfee: 'appendix_underwriting_fees',
  underwriter_fee: 'appendix_underwriting_fees',
  underwriterfees: 'appendix_underwriting_fees',
  underwriter_fees: 'appendix_underwriting_fees',
};

/** Normalize CRM / DocuSign field keys for fuzzy matching (snake_case, spaces, case). */
export function normalizeFieldKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Duplicate layouts (e.g. two ACH forms) get `label__instance_2` Data Labels at envelope
 * create time so DocuSign keeps their values separate. The shared prefill payload has no
 * per-instance ids, so it must never match those tabs — otherwise every copy is flattened
 * back to the same value.
 */
export function isDuplicateInstanceTabLabel(raw: string): boolean {
  return /__instance_\d+$/i.test(String(raw ?? '').trim());
}

/**
 * Envelope tabs for ACH / addenda use CRM-scoped labels (`ach_form_*`, `flex_addendum_*`)
 * after coordinate scoping. Prefill ids from the edit modal stay unprefixed — strip both ways.
 * Longer prefixes first so `ach_form_texas_` wins over `ach_form_`.
 */
const LAYOUT_SCOPED_TAB_PREFIXES = [
  'ach_form_texas_',
  'ach_form_',
  'pre_payment_addendum_',
  'flex_addendum_',
  'balance_transfer_',
  'disclosure_',
] as const;

/** Only ACH bare fields should be auto-seeded onto scoped ACH tab labels. */
const ACH_SCOPED_TAB_PREFIXES = ['ach_form_texas_', 'ach_form_'] as const;

function stripLayoutScopedTabPrefix(key: string): string {
  const k = normalizeFieldKey(key);
  for (const prefix of LAYOUT_SCOPED_TAB_PREFIXES) {
    if (k.startsWith(prefix) && k.length > prefix.length) {
      return k.slice(prefix.length);
    }
  }
  return k;
}

/** Florida/KS/… disclosure merchant tabs after scoping: disclosure_client_name_1__p1_sd_text_1 */
function isDisclosureMerchantNameTabKey(tabKey: string): boolean {
  return isDisclosureMerchantNameVariable(tabKey);
}

const DISCLOSURE_MERCHANT_BUSINESS_PREFILL_KEYS = [
  'disclosure_pdf__client_name',
  'disclosure_pdf__disclosure_merchant_name',
  'disclosure_pdf__disclosure_name',
  'disclosure_pdf__recipient_name',
  'disclosure_pdf__business_name',
  'disclosure_merchant_name',
  'disclosure_name',
  'recipient_name',
  'recipient_name2',
  'client_legal_name',
  'business_legal_name',
  'business_name',
  'security_business_name',
  'legal_name',
  'merchant_legal_name',
  'authorization_client_name',
  'authorization_application',
] as const;

function lookupDisclosureMerchantBusinessFromMap(
  map: Map<string, string>,
): string | undefined {
  for (const key of DISCLOSURE_MERCHANT_BUSINESS_PREFILL_KEYS) {
    const v = map.get(normalizeFieldKey(key)) || map.get(key.replace(/_/g, ''));
    const trimmed = String(v || '').trim();
    if (!trimmed) continue;
    if (/^\d+$/.test(trimmed.replace(/\s/g, ''))) continue;
    return trimmed;
  }
  return undefined;
}

function isAchLikeBareFieldId(bare: string): boolean {
  const k = normalizeFieldKey(bare);
  return (
    k.startsWith('authorization_') ||
    k.startsWith('authorized_') ||
    k.startsWith('ach_authorization_') ||
    k.startsWith('ach_')
  );
}

function registerPrefillMapValue(
  map: Map<string, string>,
  rawKey: string,
  value: string,
  options?: { overwrite?: boolean },
): void {
  const key = normalizeFieldKey(rawKey);
  if (!key || !value) return;
  if (options?.overwrite || !map.has(key)) map.set(key, value);
  const alt = key.replace(/_/g, '');
  if (options?.overwrite || !map.has(alt)) map.set(alt, value);
}

export function buildPrefillValueMap(
  fields: PrefillFieldInput[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of fields) {
    const id = String(f?.id ?? '').trim();
    const value = toPrefillUppercase(String(f?.value ?? '').trim(), id);
    if (!id || !value) continue;
    const key = normalizeFieldKey(id);
    const bare = stripLayoutScopedTabPrefix(key);
    // Exact CRM field ids always win (e.g. balance_transfer_remaining_rtr_balance Remaining RTR).
    registerPrefillMapValue(map, key, value, { overwrite: true });
    if (bare !== key) registerPrefillMapValue(map, bare, value);
    // Seed ACH scoped labels from unprefixed ACH edits only.
    // Do NOT broadcast main-contract purchase_price onto balance_transfer_remaining_rtr_balance
    // (or flex_addendum_*) — that overwrote Remaining RTR with payback amount.
    if (isAchLikeBareFieldId(bare)) {
      for (const prefix of ACH_SCOPED_TAB_PREFIXES) {
        registerPrefillMapValue(map, `${prefix}${bare}`, value);
      }
    }
  }
  for (const [aliasKey, fieldId] of Object.entries(CRM_LABEL_TO_FIELD_ID)) {
    const val = map.get(normalizeFieldKey(fieldId));
    if (val) map.set(aliasKey, val);
  }

  // Seed disclosure-scoped merchant labels so post-create rematch cannot fall through
  // from disclosure_client_name_* → bare person `client_name` (Woodmere Florida).
  const disclosureBusiness = lookupDisclosureMerchantBusinessFromMap(map);
  if (disclosureBusiness) {
    registerPrefillMapValue(map, 'disclosure_client_name', disclosureBusiness);
    registerPrefillMapValue(map, 'disclosure_merchant_name', disclosureBusiness);
    registerPrefillMapValue(map, 'disclosure_name', disclosureBusiness);
    registerPrefillMapValue(map, 'disclosure_recipient_name', disclosureBusiness);
    registerPrefillMapValue(map, 'disclosure_recipient_name2', disclosureBusiness);
    registerPrefillMapValue(map, 'disclosure_disclosure_name', disclosureBusiness);
    registerPrefillMapValue(map, 'disclosure_disclosure_merchant_name', disclosureBusiness);
    registerPrefillMapValue(map, 'disclosure_business_name', disclosureBusiness);
    registerPrefillMapValue(map, 'recipient_name', disclosureBusiness);
    registerPrefillMapValue(map, 'recipient_name2', disclosureBusiness);
    // Numbered slots used across FL/KS/GA/MO/CA/NY/CT/VA disclosures
    for (let i = 1; i <= 40; i += 1) {
      registerPrefillMapValue(map, `disclosure_client_name_${i}`, disclosureBusiness);
      registerPrefillMapValue(map, `client_name_${i}`, disclosureBusiness);
      registerPrefillMapValue(map, `disclosure_recipient_name_${i}`, disclosureBusiness);
      registerPrefillMapValue(map, `recipient_name_${i}`, disclosureBusiness);
      registerPrefillMapValue(map, `disclosure_disclosure_name_${i}`, disclosureBusiness);
      registerPrefillMapValue(map, `disclosure_name_${i}`, disclosureBusiness);
      registerPrefillMapValue(map, `disclosure_disclosure_merchant_name_${i}`, disclosureBusiness);
      registerPrefillMapValue(map, `disclosure_merchant_name_${i}`, disclosureBusiness);
      registerPrefillMapValue(map, `disclosure_business_name_${i}`, disclosureBusiness);
    }
  }

  return map;
}

function lookupPrefillValue(map: Map<string, string>, tabKey: string): string | undefined {
  const k = normalizeFieldKey(tabKey);
  if (!k) return undefined;

  // Disclosure merchant tabs (disclosure_client_name_1, …) must never resolve to the
  // main-contract Owner-1 person value on bare `client_name` (Woodmere Florida bug).
  if (isDisclosureMerchantNameTabKey(k)) {
    if (map.has(k)) return map.get(k);
    const bareUnique = k.replace(/__p\d+_[a-z0-9]+$/i, '').replace(/__page\d+$/i, '');
    if (bareUnique !== k && map.has(bareUnique)) return map.get(bareUnique);
    const business = lookupDisclosureMerchantBusinessFromMap(map);
    if (business) return business;
    // Strip disclosure_ → client_name_1 / client_name — still do not use person client_name.
    const stripped = stripLayoutScopedTabPrefix(bareUnique);
    if (stripped !== bareUnique && stripped !== 'client_name' && map.has(stripped)) {
      return map.get(stripped);
    }
    return undefined;
  }

  if (map.has(k)) return map.get(k);
  const noUnderscore = k.replace(/_/g, '');
  if (map.has(noUnderscore)) return map.get(noUnderscore);

  // Multi-ACH / duplicate layouts: `label__p2_p15__instance_2` — strip instance first,
  // then the uniquify suffix, or bare CRM ids never match and post-create updates 0 tabs.
  const withoutInstance = k.replace(/__instance_\d+$/i, '');
  if (withoutInstance !== k) {
    if (map.has(withoutInstance)) return map.get(withoutInstance);
    const withoutInstanceNoUs = withoutInstance.replace(/_/g, '');
    if (map.has(withoutInstanceNoUs)) return map.get(withoutInstanceNoUs);
  }

  // Unique Data Labels use `__p14_p45` suffix — match the bare CRM/layout variable.
  const uniquifySource = withoutInstance !== k ? withoutInstance : k;
  const bareUnique = uniquifySource
    .replace(/__p\d+_[a-z0-9]+$/i, '')
    .replace(/__page\d+$/i, '');
  if (bareUnique !== uniquifySource) {
    if (map.has(bareUnique)) return map.get(bareUnique);
    const bareUniqueNoUs = bareUnique.replace(/_/g, '');
    if (map.has(bareUniqueNoUs)) return map.get(bareUniqueNoUs);
  }

  const scopedSource = bareUnique !== uniquifySource ? bareUnique : uniquifySource;
  const bare = stripLayoutScopedTabPrefix(scopedSource);
  if (bare !== scopedSource) {
    // Do not fall back from balance_transfer_remaining_rtr_balance → purchase_price (payback).
    // Remaining RTR is a separate CRM-scoped value.
    const isRemainingRtrScoped =
      scopedSource === 'balance_transfer_remaining_rtr_balance' ||
      scopedSource === 'remaining_rtr_balance' ||
      bare === 'remaining_rtr_balance';
    const isProtectedScopedMoney =
      isRemainingRtrScoped ||
      scopedSource === 'balance_transfer_purchase_price' ||
      scopedSource === 'flex_addendum_purchase_price';
    // disclosure_client_name* → client_name must not pick Owner-1 person name.
    const isDisclosureClientNameFallback =
      scopedSource.startsWith('disclosure_client_name') ||
      (scopedSource.startsWith('disclosure_') &&
        /^(client_name)(_?\d+)?$/i.test(bare));
    if (isRemainingRtrScoped) {
      // Only the dedicated Remaining RTR pair — never purchase_price / remittance.
      if (map.has(scopedSource)) return map.get(scopedSource);
      if (map.has('balance_transfer_remaining_rtr_balance')) {
        return map.get('balance_transfer_remaining_rtr_balance');
      }
      if (map.has('remaining_rtr_balance')) return map.get('remaining_rtr_balance');
      return undefined;
    }
    if (!isProtectedScopedMoney && !isDisclosureClientNameFallback) {
      if (map.has(bare)) return map.get(bare);
      const bareNoUs = bare.replace(/_/g, '');
      if (map.has(bareNoUs)) return map.get(bareNoUs);
    }
    if (isDisclosureClientNameFallback) {
      return lookupDisclosureMerchantBusinessFromMap(map);
    }
  }

  // Bare remaining_rtr_balance tabs (layout variable) — never alias to purchase_price.
  if (
    scopedSource === 'remaining_rtr_balance' ||
    bareUnique === 'remaining_rtr_balance' ||
    k === 'remaining_rtr_balance'
  ) {
    if (map.has('remaining_rtr_balance')) return map.get('remaining_rtr_balance');
    if (map.has('balance_transfer_remaining_rtr_balance')) {
      return map.get('balance_transfer_remaining_rtr_balance');
    }
    return undefined;
  }

  const viaAlias =
    CRM_LABEL_TO_FIELD_ID[k] ||
    CRM_LABEL_TO_FIELD_ID[bare] ||
    CRM_LABEL_TO_FIELD_ID[bareUnique] ||
    CRM_LABEL_TO_FIELD_ID[withoutInstance];
  if (viaAlias) {
    const v = map.get(normalizeFieldKey(viaAlias));
    if (v) return v;
  }
  return undefined;
}

/**
 * Match CRM prefill ids to DocuSign text tabs by tabLabel, name, or tabId.
 * Returns tabs ready for create (tabLabel) or update (tabId + value).
 */
export function matchPrefillFieldsToTextTabs(
  prefillFields: PrefillFieldInput[],
  templateTabs: DocusignTextTabRef[],
): Array<{ tabId?: string; tabLabel: string; value: string }> {
  const valueMap = buildPrefillValueMap(prefillFields);
  if (!valueMap.size || !templateTabs.length) return [];

  const matched: Array<{ tabId?: string; tabLabel: string; value: string }> = [];
  const usedTabIds = new Set<string>();

  for (const tab of templateTabs) {
    // Contract pages 14/15 phone + page-16 portal fields stay blank for the signer.
    if (shouldSkipCrmPrefillForTab(tab)) continue;

    const tabId = tab.tabId ? String(tab.tabId) : '';
    const tabLabel = String(tab.tabLabel || tab.name || '').trim();
    // Multi-ACH tabs use `__instance_N`. Still match bare CRM ids (lookup strips the
    // suffix). create-time per-layout values stay when preserveExistingTabValues skips
    // tabs that already have a value — do not hard-skip every instance tab or
    // post-create updates 0 fields ("no envelope tabs updated").
    const tabName = String(tab.name || '').trim();
    const labelIsDisclosureMerchant = isDisclosureMerchantNameTabKey(tabLabel);

    let value: string | undefined;
    // Prefer tabLabel first so disclosure_client_name_* never loses to bare name=client_name.
    value = lookupPrefillValue(valueMap, tabLabel);
    if (!value && tabName && tabName !== tabLabel) {
      if (
        labelIsDisclosureMerchant &&
        normalizeFieldKey(tabName) === 'client_name'
      ) {
        value = lookupDisclosureMerchantBusinessFromMap(valueMap);
      } else if (!labelIsDisclosureMerchant) {
        value = lookupPrefillValue(valueMap, tabName);
      } else {
        value = lookupPrefillValue(valueMap, tabName);
      }
    }
    if (!value && tabId) {
      value = lookupPrefillValue(valueMap, tabId);
    }
    if (!value) continue;
    if (tabId && usedTabIds.has(tabId)) continue;

    matched.push({
      ...(tabId ? { tabId } : {}),
      tabLabel: tabLabel || tabId || 'field',
      value,
    });
    if (tabId) usedTabIds.add(tabId);
  }

  return matched;
}

/** Fallback when template tabs are unknown: send by tabLabel = CRM field id. */
export function buildTextTabsFromPrefillIds(
  prefillFields: PrefillFieldInput[],
): Array<{ tabLabel: string; value: string }> {
  return (prefillFields || [])
    .filter((f) => f?.id && String(f.value ?? '').trim() !== '')
    .map((f) => ({
      tabLabel: String(f.id).trim(),
      value: toPrefillUppercase(String(f.value).trim(), String(f.id).trim()),
    }));
}

/** Map CRM-matched tabs to envelope tabIds using tabLabel (template tabIds ≠ envelope tabIds). */
export function mapMatchedTabsToEnvelopeTabIds(
  matched: Array<{ tabLabel: string; value: string; tabId?: string }>,
  envelopeTabs: DocusignTextTabRef[],
): Array<{ tabId: string; value: string; tabLabel?: string; name?: string }> {
  const byLabel = new Map<string, DocusignTextTabRef>();
  for (const t of envelopeTabs) {
    const label = normalizeFieldKey(String(t.tabLabel || t.name || ''));
    if (!label || !t.tabId) continue;
    byLabel.set(label, t);
    const bare = stripLayoutScopedTabPrefix(label);
    if (bare !== label && !byLabel.has(bare)) byLabel.set(bare, t);
  }

  const out: Array<{ tabId: string; value: string; tabLabel?: string; name?: string }> = [];
  const used = new Set<string>();

  for (const m of matched) {
    const key = normalizeFieldKey(m.tabLabel);
    const bare = stripLayoutScopedTabPrefix(key);
    const env =
      byLabel.get(key) ||
      byLabel.get(bare) ||
      (bare !== key
        ? undefined
        : LAYOUT_SCOPED_TAB_PREFIXES.map((p) => byLabel.get(`${p}${bare}`)).find(Boolean)) ||
      (m.tabId
        ? envelopeTabs.find((t) => String(t.tabId) === String(m.tabId))
        : undefined);
    const tabId = env?.tabId ? String(env.tabId) : '';
    if (!tabId || used.has(tabId)) continue;
    used.add(tabId);
    out.push({
      tabId,
      value: m.value,
      tabLabel: String(env?.tabLabel || m.tabLabel || '').trim() || undefined,
      name: String(env?.name || '').trim() || undefined,
    });
  }

  return out;
}

export function collectTabLabels(tabs: DocusignTextTabRef[], limit = 40): string[] {
  const out: string[] = [];
  for (const t of tabs) {
    const label = String(t.tabLabel || t.name || '').trim();
    if (label && !out.includes(label)) out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}
