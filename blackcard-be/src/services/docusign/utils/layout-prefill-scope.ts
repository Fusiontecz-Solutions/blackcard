import type { DocumentLayout, DocumentLayoutPlacement } from './convert-docusign-template-export';

/** CRM storage prefix — PDF tab labels on each layout stay unchanged for value lookup. */
export const LAYOUT_CRM_PREFIX: Record<string, string> = {
  flex_addendum: 'flex_addendum_',
  pre_payment_addendum: 'pre_payment_addendum_',
  balance_transfer: 'balance_transfer_',
  case_takeover_addendum: 'case_takeover_addendum_',
  ach_authorization: 'ach_form_',
  ach_authorization_standalone: 'ach_form_',
  ach_authorization_texas: 'ach_form_texas_',
};

/** When CRM key differs from `{prefix}{pdfVariable}`. */
export const LAYOUT_VARIABLE_CRM_KEY: Record<string, Record<string, string>> = {
  flex_addendum: {
    client_legal_name: 'flex_addendum_merchant_legal_name',
  },
  balance_transfer: {
    balance_transfer_client_legal_name: 'balance_transfer_client_legal_name',
  },
};

export const DISCLOSURE_PDF_FIELD_PREFIX = 'disclosure_pdf__';
export const DISCLOSURE_PDF_FIELD_PREFIX_LEGACY = 'disclosure_pdf:';

export function toDisclosureScopedPrefillId(pdfFieldId: string): string {
  return `${DISCLOSURE_PDF_FIELD_PREFIX}${String(pdfFieldId || '').trim()}`;
}

export function fromDisclosureScopedPrefillId(id: string): string | null {
  const token = String(id || '').trim();
  if (token.startsWith(DISCLOSURE_PDF_FIELD_PREFIX)) return token.slice(DISCLOSURE_PDF_FIELD_PREFIX.length) || null;
  if (token.startsWith(DISCLOSURE_PDF_FIELD_PREFIX_LEGACY)) return token.slice(DISCLOSURE_PDF_FIELD_PREFIX_LEGACY.length) || null;
  if (token.startsWith('disclosure_pdf') && !token.startsWith(DISCLOSURE_PDF_FIELD_PREFIX)) return token.slice('disclosure_pdf'.length) || null;
  return null;
}

function readDisclosureScopedValue(globalValues: Record<string, string>, pdfVar: string): string {
  return String(globalValues[toDisclosureScopedPrefillId(pdfVar)] ?? globalValues[`${DISCLOSURE_PDF_FIELD_PREFIX_LEGACY}${pdfVar}`] ?? globalValues[`disclosure_pdf${pdfVar}`] ?? '').trim();
}

/** Disclosure PDF slots that must show the merchant business / legal name (never owner person). */
export const DISCLOSURE_MERCHANT_BUSINESS_NAME_VARS = new Set([
  'client_name',
  'recipient_name',
  'recipient_name2',
  'disclosure_name',
  'disclosure_merchant_name',
  'business_name',
]);

/**
 * True for disclosure merchant-name keys used across state PDFs.
 * Does NOT treat bare main-contract `client_name` as merchant (that is Owner-1 person).
 * Numbered / disclosure_-scoped / disclosure_pdf__ client_name slots ARE merchant business name.
 */
export function isDisclosureMerchantNameVariable(raw: string | null | undefined): boolean {
  const k = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/__p\d+_[a-z0-9]+$/i, '')
    .replace(/__page\d+$/i, '');
  if (!k) return false;

  // Bare main-contract person slot — never treat as disclosure merchant by key alone.
  if (k === 'client_name' || k === 'addendum_client_name') return false;

  // Strip CRM envelope / storage prefixes; keep whether the key was disclosure-scoped.
  let token = k;
  let disclosureScoped = false;
  if (token.startsWith('disclosure_pdf__')) {
    token = token.slice('disclosure_pdf__'.length);
    disclosureScoped = true;
  } else if (token.startsWith('disclosure_pdf:')) {
    token = token.slice('disclosure_pdf:'.length);
    disclosureScoped = true;
  } else if (token.startsWith('disclosure_pdf')) {
    token = token.slice('disclosure_pdf'.length);
    disclosureScoped = true;
  }
  if (
    token.startsWith('disclosure_') &&
    token !== 'disclosure_name' &&
    token !== 'disclosure_merchant_name'
  ) {
    token = token.slice('disclosure_'.length);
    disclosureScoped = true;
  }

  // Scoped bare client_name (disclosure_client_name / disclosure_pdf__client_name) is merchant.
  if (token === 'client_name' || token === 'addendum_client_name') {
    return disclosureScoped;
  }

  if (
    token === 'recipient_name' ||
    token === 'recipient_name2' ||
    token === 'disclosure_name' ||
    token === 'disclosure_merchant_name' ||
    token === 'business_name'
  ) {
    return true;
  }
  if (
    /^(client_name|recipient_name|recipient_name2|disclosure_name|disclosure_merchant_name|business_name)_?\d+$/i.test(
      token,
    )
  ) {
    return true;
  }
  return false;
}

/** True when a disclosure placement's variable is a merchant business-name slot (incl. bare client_name). */
export function isDisclosureMerchantPlacementVariable(
  variable: string | null | undefined,
): boolean {
  const v = String(variable || '').trim().toLowerCase();
  if (!v) return false;
  if (DISCLOSURE_MERCHANT_BUSINESS_NAME_VARS.has(v)) return true;
  return isDisclosureMerchantNameVariable(v);
}

/** Owner / person slots — must never win for disclosure merchant business name. */
const DISCLOSURE_PERSONAL_NAME_VALUE_KEYS = [
  'owner1_guarantor_name',
  'guaranty_owner1_name',
  'guaranty_guarantor1_name',
  'guaranty_client_name',
  'customer_name',
  'client_name_by',
  'security_guarantor',
] as const;

function isLikelyDisclosurePersonalName(
  values: Record<string, string>,
  candidate: string,
): boolean {
  const name = String(candidate || '').trim().toLowerCase();
  if (!name) return false;
  for (const key of DISCLOSURE_PERSONAL_NAME_VALUE_KEYS) {
    const personal = String(values[key] ?? '').trim().toLowerCase();
    if (personal && personal === name) return true;
  }
  return false;
}

/**
 * Business / legal name for state disclosure merchant fields.
 * Do not use bare `client_name` — package sends overwrite that with Owner 1 person name.
 * Same resolution for every funder (Woodmere platform + funder-scoped disclosures).
 */
export function resolveDisclosureMerchantBusinessName(
  values: Record<string, string>,
): string {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const v = String(values[key] ?? '').trim();
      if (!v) continue;
      // Deal-id / numeric-only authorization_application is not a merchant name.
      if (/^\d+$/.test(v.replace(/\s/g, ''))) continue;
      if (isLikelyDisclosurePersonalName(values, v)) continue;
      return v;
    }
    return '';
  };
  return (
    pick(
      toDisclosureScopedPrefillId('disclosure_merchant_name'),
      toDisclosureScopedPrefillId('disclosure_name'),
      toDisclosureScopedPrefillId('recipient_name'),
      toDisclosureScopedPrefillId('client_name'),
      toDisclosureScopedPrefillId('business_name'),
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
      'doing_business_as',
      'authorization_client_name',
      'authorization_application',
    ) || ''
  );
}

/** Map funder-specific layout keys to platform coordinate layouts. */
export function resolveCanonicalSupplementalLayoutKey(layoutKey: string): string | null {
  const k = String(layoutKey || '').trim().toLowerCase();
  if (!k) return null;
  if (k === 'flex_addendum' || k.endsWith('_flex_addendum')) return 'flex_addendum';
  if (k === 'pre_payment_addendum' || k.endsWith('_pre_payment_addendum')) {
    return 'pre_payment_addendum';
  }
  // Must run before balance_transfer — legacy key ends with `_balance_transfer`.
  if (
    k === 'case_takeover_addendum' ||
    k.endsWith('_case_takeover_addendum') ||
    k === 'case_takeover_balance_transfer' ||
    k.endsWith('_case_takeover_balance_transfer')
  ) {
    return 'case_takeover_addendum';
  }
  if (k === 'balance_transfer' || k.endsWith('_balance_transfer')) return 'balance_transfer';
  if (
    k === 'ach_authorization' ||
    k === 'ach_authorization_standalone' ||
    k.endsWith('_ach_authorization') ||
    (k.includes('_ach_') && !k.includes('texas'))
  ) {
    return 'ach_authorization';
  }
  if (k === 'ach_authorization_texas' || k.endsWith('_ach_authorization_texas')) {
    return 'ach_authorization_texas';
  }
  return null;
}

export function isMainContractLayoutKey(layoutKey: string): boolean {
  const k = String(layoutKey || '').trim();
  if (
    k === 'contract' ||
    k === 'alliance_bridge_contract' ||
    k === 'texas_funding_group_contract'
  ) {
    return true;
  }
  if (!k.startsWith('funder_')) return false;
  return !/_flex_addendum|_pre_payment_addendum|_case_takeover_addendum|_case_takeover_balance_transfer|_balance_transfer|_ach_|_disclosure|_addendum_/.test(k);
}

export function resolveCrmKeyForLayoutVariable(layoutKey: string, pdfVariable: string): string {
  const pdfVar = String(pdfVariable || '').trim();
  const canonical = resolveCanonicalSupplementalLayoutKey(layoutKey) ?? layoutKey;
  const mapped = LAYOUT_VARIABLE_CRM_KEY[canonical]?.[pdfVar];
  if (mapped) return mapped;
  const prefix = LAYOUT_CRM_PREFIX[canonical];
  if (prefix) return `${prefix}${pdfVar}`;
  return pdfVar;
}

export function isStateDisclosureTextPlacement(placement?: DocumentLayoutPlacement): boolean {
  return Boolean(String(placement?.id || '').startsWith('sd_text_'));
}

/** Build values for one layout only — prevents cross-document tab bleed. */
export function buildScopedValuesForLayout(
  layout: DocumentLayout,
  globalValues: Record<string, string>,
): Record<string, string> {
  const layoutKey = String(layout.key || '').trim();
  if (isMainContractLayoutKey(layoutKey)) {
    return { ...globalValues };
  }

  const canonicalKey = resolveCanonicalSupplementalLayoutKey(layoutKey) ?? layoutKey;
  const prefix = LAYOUT_CRM_PREFIX[canonicalKey];
  const out: Record<string, string> = {};

  // Disclosure layouts are scoped to placement keys only — keep merchant business-name
  // sources available so tab resolution never falls back to Owner-1 person name.
  const hasDisclosurePlacements = layout.placements.some((p) =>
    isStateDisclosureTextPlacement(p),
  );
  if (hasDisclosurePlacements || /disclosure/i.test(layoutKey)) {
    const business = resolveDisclosureMerchantBusinessName(globalValues);
    // Offer / net sources must stay in scoped values — resolveTextPlacementValue
    // (Texas page-1 total_amount_of_fund_disbursed = offer) reads them here.
    for (const key of [
      'purchase_amount',
      'addendum_dated_principal_owner_amount',
      'disclosure_purchase_price',
      'total_amount_business_fund',
      'funding_provided',
      'total_amount_commercial_financing',
      'approved_amount',
      'total_amount_of_fund_provided',
      'receivable_purchase',
      'disclosure_amount_financed',
      'disclosure_funding_disbursed',
      'net_to_merchant',
      'total_amount_business_fund_2',
      toDisclosureScopedPrefillId('funding_provided'),
      toDisclosureScopedPrefillId('disclosure_purchase_price'),
      toDisclosureScopedPrefillId('total_amount_business_fund'),
    ]) {
      const v = String(globalValues[key] ?? '').trim();
      if (v) out[key] = v;
    }
    for (const key of [
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
      toDisclosureScopedPrefillId('client_name'),
      toDisclosureScopedPrefillId('disclosure_merchant_name'),
      toDisclosureScopedPrefillId('disclosure_name'),
      toDisclosureScopedPrefillId('recipient_name'),
      toDisclosureScopedPrefillId('business_name'),
    ]) {
      const v = String(globalValues[key] ?? '').trim();
      if (v) out[key] = v;
    }
    if (business) {
      out.disclosure_merchant_name = business;
      out.disclosure_name = business;
      out.recipient_name = business;
      out.business_name = business;
      out[toDisclosureScopedPrefillId('client_name')] = business;
      out[toDisclosureScopedPrefillId('disclosure_merchant_name')] = business;
    }
    // Carry person-name keys so isLikelyDisclosurePersonalName can filter them out.
    for (const key of [
      'owner1_guarantor_name',
      'guaranty_owner1_name',
      'guaranty_guarantor1_name',
      'guaranty_client_name',
      'customer_name',
      'client_name_by',
      'security_guarantor',
    ]) {
      const v = String(globalValues[key] ?? '').trim();
      if (v) out[key] = v;
    }
  }

  for (const placement of layout.placements) {
    if (placement.type !== 'text' && placement.type !== 'date') continue;
    const pdfVar = String(placement.variable || '').trim();
    if (!pdfVar) continue;

    if (isStateDisclosureTextPlacement(placement)) {
      // Individual data labels use unique sourceTabLabel (e.g. funder_name_5) so
      // repeated PDF slots stay independent in DocuSign. Prefer that value, but
      // always also expose the shared pdfVar so envelope value lookup works.
      const uniqueKey = String(placement.sourceTabLabel || '').trim();
      const perPlacementRaw = uniqueKey
        ? readDisclosureScopedValue(globalValues, uniqueKey)
        : '';
      const scoped = readDisclosureScopedValue(globalValues, pdfVar);
      const isMerchantNameSlot =
        isDisclosureMerchantPlacementVariable(pdfVar) ||
        isDisclosureMerchantNameVariable(uniqueKey);
      // Prefer business/legal name over package-synced Owner 1 person name on client_name.
      const businessName = isMerchantNameSlot
        ? resolveDisclosureMerchantBusinessName(globalValues)
        : '';
      const legacyRaw = String(globalValues[pdfVar] ?? '').trim();
      // Never stamp Owner-1 person name onto disclosure merchant slots (Woodmere + all funders).
      const perPlacement =
        isMerchantNameSlot && isLikelyDisclosurePersonalName(globalValues, perPlacementRaw)
          ? ''
          : perPlacementRaw;
      // Bare shared `client_name` is person-synced after party sync — never a merchant fallback.
      const legacy = isMerchantNameSlot
        ? ''
        : legacyRaw;
      const val = perPlacement || scoped || businessName || legacy;
      if (val) {
        if (uniqueKey) out[uniqueKey] = val;
        out[pdfVar] = val;
      }
      continue;
    }

    if (prefix) {
      const crmKey = resolveCrmKeyForLayoutVariable(canonicalKey, pdfVar);
      let val = String(globalValues[crmKey] ?? '').trim();
      if (
        !val &&
        canonicalKey === 'flex_addendum' &&
        pdfVar === 'addendum_client_name'
      ) {
        val = [
          'flex_addendum_addendum_client_name',
          'owner1_guarantor_name',
          'guaranty_owner1_name',
          'guaranty_guarantor1_name',
          'guaranty_client_name',
          'customer_name',
          'client_name_by',
          'addendum_client_name',
          'client_name',
        ]
          .map((key) => String(globalValues[key] ?? '').trim())
          .find(Boolean) ?? '';
      }
      if (
        !val &&
        canonicalKey === 'flex_addendum' &&
        pdfVar === 'client_legal_name'
      ) {
        val =
          [
            'flex_addendum_merchant_legal_name',
            'business_name',
            'security_business_name',
          ]
            .map((key) => String(globalValues[key] ?? '').trim())
            .find(Boolean) ?? '';
      }
      // Case Takeover funder name must stay document-scoped. Shared `funder_name` is
      // forced to platform disclosure "Woodmere" when a state disclosure is merged —
      // same pattern as Flex/BT using their own CRM keys instead of bare funder_name.
      const skipSharedFunderNameFallback =
        canonicalKey === 'case_takeover_addendum' && pdfVar === 'funder_name';
      const skipSharedClientLegalNameFallback =
        canonicalKey === 'flex_addendum' && pdfVar === 'client_legal_name';
      if (!val && !skipSharedFunderNameFallback && !skipSharedClientLegalNameFallback) {
        val = String(globalValues[pdfVar] ?? '').trim();
      }
      if (
        !val &&
        (placement.type === 'date' ||
          /^(agreement_date|signature_date)/i.test(pdfVar))
      ) {
        val =
          String(globalValues.agreement_date ?? '').trim() ||
          String(globalValues.signature_date ?? '').trim() ||
          String(globalValues.Signature_date ?? '').trim() ||
          String(globalValues.disclosure_date ?? '').trim() ||
          String(globalValues.addendum_date ?? '').trim();
      }
      if (
        !val &&
        canonicalKey === 'flex_addendum' &&
        pdfVar === 'business_name_2'
      ) {
        for (const fallbackKey of [
          'business_name_2',
          'merchant2_name',
          'owner2_guarantor_name',
          'guaranty_owner2_name',
          'guaranty_guarantor2_name',
        ]) {
          const candidate = String(globalValues[fallbackKey] ?? '').trim();
          if (candidate) {
            val = candidate;
            break;
          }
        }
      }
      if (val) out[pdfVar] = val;
      continue;
    }

    const disclosureScoped = readDisclosureScopedValue(globalValues, pdfVar);
    const direct = String(globalValues[pdfVar] ?? '').trim();
    const val = disclosureScoped || direct;
    if (val) out[pdfVar] = val;
  }

  // Flex page-2 owner print name resolves via person-name helpers that read these
  // keys. Copy them into the scoped map so they are not dropped with the prefix.
  if (canonicalKey === 'flex_addendum') {
    for (const key of [
      'owner1_guarantor_name',
      'guaranty_owner1_name',
      'guaranty_guarantor1_name',
      'guaranty_client_name',
      'customer_name',
      'client_name_by',
      'security_guarantor',
      'client_name',
      'addendum_client_name',
      'flex_addendum_addendum_client_name',
    ]) {
      const v = String(globalValues[key] ?? '').trim();
      if (v && !String(out[key] ?? '').trim()) out[key] = v;
    }
  }

  return out;
}

/**
 * Unique DocuSign tab label for supplemental layouts (avoids shared-tab sync with contract).
 * Prefer CRM-scoped id so editing one document's tab never rewrites another document.
 */
export function resolveSupplementalEnvelopeTabLabel(
  layoutKey: string,
  placement: DocumentLayoutPlacement,
  pdfVariable: string,
): string | null {
  const layout = String(layoutKey || '').trim();
  if (isMainContractLayoutKey(layout)) {
    // Main contract: keep explicit source labels, but uniquify footer clone.
    const src = String(placement.sourceTabLabel || '').trim();
    if (src) return src;
    return null;
  }

  if (isStateDisclosureTextPlacement(placement)) {
    const unique = String(placement.sourceTabLabel || '').trim();
    if (unique) return `disclosure_${unique}`;
    const pdfVar = String(pdfVariable || '').trim();
    return pdfVar ? `disclosure_${pdfVar}` : null;
  }

  const canonical = resolveCanonicalSupplementalLayoutKey(layout);
  if (!canonical || !LAYOUT_CRM_PREFIX[canonical]) {
    const pdfVar = String(pdfVariable || '').trim();
    if (!pdfVar) return null;
    // State disclosures / other supplementals without a CRM prefix still need unique labels.
    const token = layout.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'doc';
    return `${token}_${pdfVar}`;
  }
  const pdfVar = String(pdfVariable || '').trim();
  if (!pdfVar) return null;
  return resolveCrmKeyForLayoutVariable(canonical, pdfVar);
}
