import type { DocumentLayout } from '../utils/convert-docusign-template-export';
import { convertSimplifiedTabsContractExport } from '../utils/convert-docusign-template-export';
import achAuthorizationLayout from './ach_authorization.layout.json';
import achAuthorizationStandaloneLayout from './ach_authorization_standalone.layout.json';
import achAuthorizationTexasExport from './ach_authorization_texas.json';
import balanceTransferLayout from './balance_transfer.layout.json';
import caseTakeoverAddendumLayout from './case_takeover_addendum.layout.json';
import contractLayout from './contract.layout.json';
import flexAddendumLayout from './flex_addendum.layout.json';
import prePaymentAddendumLayout from './pre_payment_addendum.layout.json';
import texasFundingGroupContractExport from './texas_funding_group_contract.json';

/** Document type keys used with BoldSignTemplate.type and merge order. */
export const DOCUMENT_LAYOUT_KEYS = {
  contract: 'contract',
  texasFundingGroupContract: 'texas_funding_group_contract',
  balanceTransfer: 'balance_transfer',
  caseTakeoverAddendum: 'case_takeover_addendum',
  flexAddendum: 'flex_addendum',
  prePaymentAddendum: 'pre_payment_addendum',
  achAuthorization: 'ach_authorization',
  achAuthorizationStandalone: 'ach_authorization_standalone',
  achAuthorizationTexas: 'ach_authorization_texas',
} as const;

export type DocumentLayoutKey =
  (typeof DOCUMENT_LAYOUT_KEYS)[keyof typeof DOCUMENT_LAYOUT_KEYS];

/** Maps BoldSignTemplate.type values to coordinate layouts. */
export const BOLD_SIGN_TYPE_TO_LAYOUT_KEY: Record<string, DocumentLayoutKey> = {
  contract: DOCUMENT_LAYOUT_KEYS.contract,
  texas_funding_group_contract: DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract,
  texas_funding_group: DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract,
  balance_transfer: DOCUMENT_LAYOUT_KEYS.balanceTransfer,
  case_takeover_addendum: DOCUMENT_LAYOUT_KEYS.caseTakeoverAddendum,
  /** @deprecated legacy key — same layout as case_takeover_addendum */
  case_takeover_balance_transfer: DOCUMENT_LAYOUT_KEYS.caseTakeoverAddendum,
  addendum: DOCUMENT_LAYOUT_KEYS.flexAddendum,
  flex_addendum: DOCUMENT_LAYOUT_KEYS.flexAddendum,
  pre_payment_addendum: DOCUMENT_LAYOUT_KEYS.prePaymentAddendum,
  epo: DOCUMENT_LAYOUT_KEYS.prePaymentAddendum,
  ach_authorization: DOCUMENT_LAYOUT_KEYS.achAuthorization,
  ach_authorization_standalone: DOCUMENT_LAYOUT_KEYS.achAuthorizationStandalone,
  ach_authorization_texas: DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas,
  ach: DOCUMENT_LAYOUT_KEYS.achAuthorization,
  woodmere_ach_authorization: DOCUMENT_LAYOUT_KEYS.achAuthorization,
  texas_ach_authorization: DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas,
};

const texasFundingGroupLayout = convertSimplifiedTabsContractExport(
  texasFundingGroupContractExport as Record<string, unknown>,
  {
    key: DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract,
    name: 'Texas Funding Group Contract',
    pdfFileName: 'TEXAS FUNDING GROUP.pdf',
  },
);

const achAuthorizationTexasLayout = {
  ...convertSimplifiedTabsContractExport(
    achAuthorizationTexasExport as Record<string, unknown>,
    {
      key: DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas,
      name: 'Texas ACH Authorization',
      pdfFileName: 'TEXAS FUNDING GROUP ACH.pdf',
    },
  ),
  skipOwner2InitialMirror: true,
} as DocumentLayout;

const REGISTRY: Record<DocumentLayoutKey, DocumentLayout> = {
  [DOCUMENT_LAYOUT_KEYS.contract]: contractLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract]: texasFundingGroupLayout,
  [DOCUMENT_LAYOUT_KEYS.balanceTransfer]: balanceTransferLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.caseTakeoverAddendum]:
    caseTakeoverAddendumLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.flexAddendum]: flexAddendumLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.prePaymentAddendum]: prePaymentAddendumLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.achAuthorization]: achAuthorizationLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.achAuthorizationStandalone]:
    achAuthorizationStandaloneLayout as DocumentLayout,
  [DOCUMENT_LAYOUT_KEYS.achAuthorizationTexas]: achAuthorizationTexasLayout,
};

export function getDocumentLayout(key: DocumentLayoutKey): DocumentLayout {
  const layout = REGISTRY[key];
  if (!layout) {
    throw new Error(`Unknown document layout key: ${key}`);
  }
  return layout;
}

export function resolveLayoutKeyFromBoldSignType(type: string): DocumentLayoutKey | null {
  const normalized = String(type || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return BOLD_SIGN_TYPE_TO_LAYOUT_KEY[normalized] || null;
}

/** Default merge order for a full contract package. */
export const DEFAULT_MERGE_LAYOUT_ORDER: DocumentLayoutKey[] = [
  DOCUMENT_LAYOUT_KEYS.contract,
  DOCUMENT_LAYOUT_KEYS.balanceTransfer,
];
