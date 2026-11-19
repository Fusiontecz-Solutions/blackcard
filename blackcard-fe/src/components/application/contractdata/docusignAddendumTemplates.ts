import {
    PLATFORM_LAYOUT_KEYS,
    type PlatformLayoutKey,
    isPlatformLayoutKey,
} from "./platformDocumentConfig";

/** DocuSign template GUIDs for addenda merged with the main contract envelope. */
export const DOCUSIGN_ADDENDUM_TEMPLATE_IDS = {
    WOODMERE_FLEX: "47d20896-9bb4-4b17-a2cc-dba35fd824e3",
    WOODMERE_BALANCE_TRANSFER_SHEET: "bab60e0d-68ec-481f-b146-4013fd3d3b9a",
} as const;

/** Layout keys for code-driven addendum prefill. */
export const DOCUSIGN_ADDENDUM_LAYOUT_KEYS = {
    BALANCE_TRANSFER_SHEET: PLATFORM_LAYOUT_KEYS.balanceTransfer,
    CASE_TAKEOVER_ADDENDUM: PLATFORM_LAYOUT_KEYS.caseTakeoverAddendum,
    FLEX_ADDENDUM: PLATFORM_LAYOUT_KEYS.flexAddendum,
    PRE_PAYMENT_ADDENDUM: PLATFORM_LAYOUT_KEYS.prePaymentAddendum,
    ACH_AUTHORIZATION: PLATFORM_LAYOUT_KEYS.achAuthorization,
    /** Standalone ACH send — same PDF/coords, no owner 2 initial mirror. */
    ACH_AUTHORIZATION_STANDALONE: "ach_authorization_standalone",
} as const;

export type DocusignAddendumLayoutKey =
    (typeof DOCUSIGN_ADDENDUM_LAYOUT_KEYS)[keyof typeof DOCUSIGN_ADDENDUM_LAYOUT_KEYS];

const LAYOUT_KEY_SET = new Set<string>(Object.values(DOCUSIGN_ADDENDUM_LAYOUT_KEYS));

export function normalizeDocusignLayoutKey(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

export function isKnownKatanAddendumLayoutKey(
    layoutKey: unknown,
): layoutKey is PlatformLayoutKey {
    return LAYOUT_KEY_SET.has(normalizeDocusignLayoutKey(layoutKey));
}

export function isKnownKatanAddendumTemplateId(ref: unknown): boolean {
    return isPlatformLayoutKey(ref) || isKnownKatanAddendumLayoutKey(ref);
}
