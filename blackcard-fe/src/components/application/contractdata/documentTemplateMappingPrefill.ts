import type {
    BuildContractPrefillFieldsArgs,
    ContractPrefillContractRecords,
    ContractPrefillField,
} from "./Contract";
import {
    buildWoodmereFlexAddendumContractPrefillFields,
    formatFlexAddendumMoneyDisplay,
    type WoodmereFlexAddendumContractPrefillFields,
} from "./WOODMERE_FLEX_ADDENDUM";
import {
    bankDetailRowToPrefillPartial,
    buildContractPrefillFieldsFromApplication,
    getApplicationPrimaryRecipientName,
    getContractPrefillEditDefaultsFromApplication,
    getLiveClientIdentityPrefillArgs,
    applyLiveClientIdentitySyncToPrefillPartial,
    pickLiveClientIdentityOverlay,
    resolveBalanceTransferMerchantContext,
    resolveApplicationClientBusinessName,
    resolveContractBusinessLegalNameForPrefill,
    resolveContractClientPersonNameForPrefill,
    resolveOfferAmountDollarsForUnderwritingFees,
    resolveOfferFrequencyLabel,
    resolveRemittancePrefillValue,
    coercePaymentFrequencyLabel,
} from "./Contract";
import {
    isAchAuthorizationPrefillKey,
    stripAchAuthorizationKeysFromRecord,
} from "./documentPrefillScope";
import {
    buildBalanceTransferSheetContractPrefillFields,
    formatFunderNameWithDealIdPrefix,
    type BalanceTransferSheetContractPrefillFields,
} from "./BALANCE_TRANSFER_SHEET_ADDENDUM";
import { DOCUSIGN_ADDENDUM_TEMPLATE_IDS } from "./docusignAddendumTemplates";
import {
    isAchAuthorizationLayoutKey,
    isPlatformLayoutKey,
    PLATFORM_DISCLOSURE_FUNDER_NAME,
    PLATFORM_LAYOUT_KEYS,
} from "./platformDocumentConfig";
import {
    buildWoodmereBuyoutBlankAddendumContractPrefillFields,
    type WoodmereBuyoutBlankAddendumContractPrefillFields,
} from "./WOODMERE_BUYOUT_BLANK_ADDENDUM";
import {
    buildWoodmereFlexDatedAddendumContractPrefillFields,
    type WoodmereFlexDatedAddendumContractPrefillFields,
} from "./WOODMERE_FLEX_DATED_ADDENDUM";
import {
    buildDiscoverAdvanceEpoAddendumContractPrefillFields,
    type DiscoverAdvanceEpoAddendumContractPrefillFields,
} from "./Discover_Advance_EPO_ADDENDUM";
import {
    buildPrePaymentAddendumContractPrefillFields,
    type PrePaymentAddendumContractPrefillFields,
} from "./PRE_PAYMENT_ADDENDUM";
import {
    buildDiscoverRefiBalanceTransferAddendumContractPrefillFields,
    type DiscoverRefiBalanceTransferAddendumContractPrefillFields,
} from "./DISCOVER_REFI_BALANCE_TRANSFER_ADDENDUM";
import {
    buildCaseTakeoverAddendumContractPrefillFields,
    type CaseTakeoverAddendumContractPrefillFields,
} from "./CASE_TAKEOVER_ADDENDUM";
import {
    buildStateDisclosurePrefillContextFromContract,
    getStateDisclosureEditorFieldDefinitions,
    getStateDisclosurePrefillFieldsByName,
    getStateDisclosurePrefillFieldsByStateFrequency,
    hasStateDisclosurePrefillRegistry,
    resolveStateDisclosureRegistryKey,
    type StateDisclosureContext,
} from "./stateDisclosurePrefill";
import {
    buildDisclosureEditorFieldsFromContext,
    collapsePdfFieldsToDisclosureEditorValues,
    expandDisclosureEditorValuesToPdfFields,
} from "./disclosureEditorFields";
import { isTexasDisclosureState } from "./texas_disclosure";
import { isVirginiaDisclosureState } from "./virginia_disclosure";
import { formatDisclosureUsd } from "./disclosureAprCalculator";
import { isUtahDisclosureState } from "./daily_utah";
import {
    ACH_AUTHORIZATION_EDITABLE_FIELD_IDS,
    ACH_AUTHORIZATION_FIELD_LABELS,
    ACH_PREFILL_MAPPING_ALIAS_KEY,
    resolveAchSavedMappingOverrides,
} from "./achFormEditConfig";
import { CONTRACT_SIGNER_OVERRIDES_KEY } from "./templateRecipients";

function resolveMainContractBusinessNameFromPrefill(
    byId: Map<string, { id: string; value: string }>,
): string {
    const businessKeys = [
        "legal_name",
        "client_legal_name",
        "security_business_name",
        "business_legal_name",
        "business_name",
        "merchant_legal_name",
        "authorization_application",
        "disclosure_merchant_name",
        "disclosure_name",
        "recipient_name",
        "disclosure_pdf__client_name",
        "disclosure_pdf__disclosure_merchant_name",
    ];
    for (const key of businessKeys) {
        const value = String(byId.get(key)?.value || "").trim();
        if (value && !/^\d+$/.test(value.replace(/\s/g, ""))) return value;
    }
    return "";
}

/** Stored on `Contract.contractPrefillOverrides` alongside main prefill keys. */
export const DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY = "documentTemplatePrefillByMappingId";

/** DocuSign envelope ids per `ContractDocumentTemplateMapping.id` (e.g. standalone ACH). */
export const DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY = "documentTemplateEnvelopeByMappingId";

export type DocumentTemplateEnvelopeMeta = {
    envelopeId: string;
    status?: string;
    updatedAt?: string;
    funderName?: string;
    funderProfileId?: string;
};

/** DocuSign send history for Contracts Generated table (contract + ACH envelopes). */
export const DOCUMENT_SEND_HISTORY_KEY = "documentSendHistory";

export type DocumentSendKind = "contract" | "ach";

export type DocumentSendHistoryTermsSnapshot = {
    approvedAmount?: number | null;
    totalAmount?: number | null;
    contractLength?: number | null;
    term?: string | null;
    position?: string | null;
    buyRate?: number | null;
    factorRate?: number | null;
    paymentAmount?: number | null;
    paybackAmount?: number | null;
    percentOfGross?: number | null;
};

export type DocumentSendHistoryEntry = {
    envelopeId: string;
    documentKind: DocumentSendKind;
    label: string;
    status?: string;
    updatedAt?: string;
    /** Funder used for this ACH send (standalone ACH envelopes). */
    funderName?: string;
    funderProfileId?: string;
    /**
     * Contract terms frozen when this envelope was created/sent.
     * Must survive later offer edits so Contracts Generated stays accurate.
     */
    termsSnapshot?: DocumentSendHistoryTermsSnapshot | null;
};

/** Last ACH funder chosen/sent — used to default the ACH Form modal dropdown. */
export const LAST_ACH_SENT_FUNDER_KEY = "lastAchSentFunder";

export type LastAchSentFunderMeta = {
    funderName: string;
    funderProfileId?: string;
    envelopeId?: string;
    updatedAt?: string;
};

export function parseLastAchSentFunder(raw: unknown): LastAchSentFunderMeta | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const blob = (raw as Record<string, unknown>)[LAST_ACH_SENT_FUNDER_KEY];
    if (blob == null || typeof blob !== "object" || Array.isArray(blob)) return null;
    const o = blob as Record<string, unknown>;
    const funderName = String(o.funderName ?? "").trim();
    if (!funderName) return null;
    const funderProfileId = String(o.funderProfileId ?? "").trim();
    const envelopeId = String(o.envelopeId ?? "").trim();
    const updatedAt = String(o.updatedAt ?? "").trim();
    return {
        funderName,
        ...(funderProfileId ? { funderProfileId } : {}),
        ...(envelopeId ? { envelopeId } : {}),
        ...(updatedAt ? { updatedAt } : {}),
    };
}

export function parseDocumentSendHistory(raw: unknown): DocumentSendHistoryEntry[] {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
    const blob = (raw as Record<string, unknown>)[DOCUMENT_SEND_HISTORY_KEY];
    if (!Array.isArray(blob)) return [];
    const out: DocumentSendHistoryEntry[] = [];
    for (const row of blob) {
        if (!row || typeof row !== "object") continue;
        const o = row as Record<string, unknown>;
        const envelopeId = String(o.envelopeId ?? "").trim();
        const documentKind = o.documentKind;
        const label = String(o.label ?? "").trim();
        if (!envelopeId || (documentKind !== "contract" && documentKind !== "ach")) continue;
        const status = String(o.status ?? "").trim();
        const updatedAt = String(o.updatedAt ?? "").trim();
        const funderName = String(o.funderName ?? "").trim();
        const funderProfileId = String(o.funderProfileId ?? "").trim();
        const snapRaw = o.termsSnapshot;
        const termsSnapshot =
            snapRaw != null && typeof snapRaw === "object" && !Array.isArray(snapRaw)
                ? (snapRaw as DocumentSendHistoryTermsSnapshot)
                : null;
        out.push({
            envelopeId,
            documentKind,
            label: label || (documentKind === "ach" ? "ACH Authorization" : "Contract"),
            ...(status ? { status } : {}),
            ...(updatedAt ? { updatedAt } : {}),
            ...(funderName ? { funderName } : {}),
            ...(funderProfileId ? { funderProfileId } : {}),
            ...(termsSnapshot ? { termsSnapshot } : {}),
        });
    }
    return out;
}

export function upsertDocumentSendHistory(
    existing: DocumentSendHistoryEntry[],
    entry: DocumentSendHistoryEntry,
): DocumentSendHistoryEntry[] {
    const idx = existing.findIndex((e) => e.envelopeId === entry.envelopeId);
    if (idx >= 0) {
        const next = [...existing];
        const prev = next[idx]!;
        // Never overwrite a frozen send-time snapshot with a later offer edit.
        next[idx] = {
            ...prev,
            ...entry,
            termsSnapshot: prev.termsSnapshot ?? entry.termsSnapshot ?? null,
        };
        return next;
    }
    return [...existing, entry];
}

const ACH_DRAFT_LIKE_STATUSES = new Set(["", "draft", "created"]);

export function isAchEnvelopeDraftLikeStatus(status?: string | null): boolean {
    return ACH_DRAFT_LIKE_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

/** Prefer a non-draft status when the mapping blob is still "draft" but the capsule was sent. */
export function preferNonDraftAchStatus(
    primary?: string | null,
    fallback?: string | null,
): string {
    const a = String(primary ?? "").trim();
    const b = String(fallback ?? "").trim();
    if (a && !isAchEnvelopeDraftLikeStatus(a)) return a;
    if (b && !isAchEnvelopeDraftLikeStatus(b)) return b;
    return a || b;
}

export function isAchEnvelopeSigningFinished(status?: string | null): boolean {
    const s = String(status ?? "").trim().toLowerCase();
    return ["completed", "signed", "declined", "revoked", "expired", "voided"].includes(s);
}

/** True when CC PDF was already sent (or envelope is past the first-send step). */
export function isAchEnvelopePastCcSendStep(status?: string | null): boolean {
    const s = String(status ?? "").trim().toLowerCase();
    return ["sent", "delivered", "viewed", "signed", "completed"].includes(s);
}

/**
 * ACH UI status: "Draft" only before the first send. On resend, while the new envelope
 * is still unsent in DocuSign, show the last known status from send history.
 */
export function resolveAchEnvelopeDisplayStatus(
    meta: DocumentTemplateEnvelopeMeta | null | undefined,
    sendHistory: DocumentSendHistoryEntry[] = [],
): string {
    const envelopeId = String(meta?.envelopeId ?? "").trim();
    const raw = String(meta?.status ?? "").trim();
    const achHistory = sendHistory.filter((h) => h.documentKind === "ach");
    const latestNonDraft = (rows: DocumentSendHistoryEntry[]) =>
        [...rows]
            .filter((h) => h.status && !isAchEnvelopeDraftLikeStatus(h.status))
            .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));

    if (!envelopeId) {
        const latest = latestNonDraft(achHistory);
        if (latest.length > 0) return String(latest[0].status).trim();
        return "draft";
    }

    if (!isAchEnvelopeDraftLikeStatus(raw)) return raw;

    const selfHistory = latestNonDraft(achHistory.filter((h) => h.envelopeId === envelopeId));
    if (selfHistory.length > 0) return String(selfHistory[0].status).trim();

    const priorOther = latestNonDraft(achHistory.filter((h) => h.envelopeId !== envelopeId));
    if (priorOther.length > 0) return String(priorOther[0].status).trim();

    return raw || "draft";
}

/**
 * Resolve the ACH envelope meta for the modal/status UI.
 * Prefer the live mapping id, then the stable `ach_authorization` alias, then
 * any ACH entry in the envelope blob / send history (survives mapping-id swaps).
 */
export function resolveAchLinkedEnvelopeMeta(args: {
    mappingId?: string | null;
    envelopeByMappingId: Record<string, DocumentTemplateEnvelopeMeta>;
    sendHistory?: DocumentSendHistoryEntry[];
    /** Optional capsule from `achAuthorizationDocuSign` (Contracts Generated source). */
    capsule?: { envelopeId?: string | null; status?: string | null; updatedAt?: string | null } | null;
}): DocumentTemplateEnvelopeMeta | null {
    const byId = args.envelopeByMappingId ?? {};
    const mappingId = String(args.mappingId ?? "").trim();
    if (mappingId && byId[mappingId]?.envelopeId) {
        return byId[mappingId];
    }
    const alias = byId[ACH_PREFILL_MAPPING_ALIAS_KEY];
    if (alias?.envelopeId) return alias;

    const capsuleId = String(args.capsule?.envelopeId ?? "").trim();
    if (capsuleId) {
        return {
            envelopeId: capsuleId,
            status: String(args.capsule?.status ?? "").trim() || undefined,
            updatedAt: String(args.capsule?.updatedAt ?? "").trim() || undefined,
        };
    }

    for (const meta of Object.values(byId)) {
        if (String(meta?.envelopeId ?? "").trim()) return meta;
    }

    const achHistory = (args.sendHistory ?? []).filter((h) => h.documentKind === "ach");
    const latest = [...achHistory]
        .filter((h) => String(h.envelopeId ?? "").trim())
        .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    if (latest.length > 0) {
        return {
            envelopeId: String(latest[0].envelopeId).trim(),
            status: String(latest[0].status ?? "").trim() || undefined,
            updatedAt: String(latest[0].updatedAt ?? "").trim() || undefined,
        };
    }
    return null;
}

/** DocuSign envelope id to load in the PDF pane (may differ from current when resend is in progress). */
export function resolveAchPdfEnvelopeId(
    meta: DocumentTemplateEnvelopeMeta | null | undefined,
    sendHistory: DocumentSendHistoryEntry[] = [],
    options?: { preferSigned?: boolean },
): string {
    const envelopeId = String(meta?.envelopeId ?? "").trim();
    const raw = String(meta?.status ?? "").trim();
    const achHistory = sendHistory.filter((h) => h.documentKind === "ach");
    const latestRows = (
        rows: DocumentSendHistoryEntry[],
        predicate: (h: DocumentSendHistoryEntry) => boolean,
    ) =>
        [...rows]
            .filter((h) => h.envelopeId && predicate(h))
            .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));

    if (options?.preferSigned) {
        if (isAchEnvelopeSigningFinished(raw) && envelopeId) return envelopeId;
        const signedRows = latestRows(achHistory, (h) =>
            isAchEnvelopeSigningFinished(h.status),
        );
        if (signedRows.length > 0) return String(signedRows[0].envelopeId).trim();
    }

    const latestNonDraft = (rows: DocumentSendHistoryEntry[]) =>
        latestRows(rows, (h) => Boolean(h.status && !isAchEnvelopeDraftLikeStatus(h.status)));

    if (!envelopeId) {
        const latest = latestNonDraft(achHistory);
        return latest.length > 0 ? String(latest[0].envelopeId).trim() : "";
    }

    if (!isAchEnvelopeDraftLikeStatus(raw)) return envelopeId;

    const selfHistory = latestNonDraft(achHistory.filter((h) => h.envelopeId === envelopeId));
    if (selfHistory.length > 0) return envelopeId;

    const priorOther = latestNonDraft(achHistory.filter((h) => h.envelopeId !== envelopeId));
    if (priorOther.length > 0) return String(priorOther[0].envelopeId).trim();

    return envelopeId;
}

/** True when the ACH form has never been sent (initial draft only). */
export function isInitialAchDraft(
    meta: DocumentTemplateEnvelopeMeta | null | undefined,
    sendHistory: DocumentSendHistoryEntry[] = [],
): boolean {
    const raw = String(meta?.status ?? "").trim();
    const hasAnySentAch = sendHistory.some(
        (h) => h.documentKind === "ach" && h.status && !isAchEnvelopeDraftLikeStatus(h.status),
    );
    if (hasAnySentAch) return false;
    const envelopeId = String(meta?.envelopeId ?? "").trim();
    if (!envelopeId) return true;
    return isAchEnvelopeDraftLikeStatus(raw);
}

export function resolveAchHistoryEntryDisplayStatus(
    entry: DocumentSendHistoryEntry,
    allHistory: DocumentSendHistoryEntry[],
): string {
    if (entry.documentKind !== "ach") return String(entry.status ?? "").trim();
    return resolveAchEnvelopeDisplayStatus(
        {
            envelopeId: entry.envelopeId,
            status: entry.status,
            updatedAt: entry.updatedAt,
        },
        allHistory,
    );
}

export function formatDocumentSendStatusLabel(status?: string | null): string {
    const s = String(status ?? "").trim().toLowerCase();
    if (!s) return "Generated";
    if (s === "completed" || s === "signed") return "Signed";
    if (s === "sent" || s === "delivered") return "Sent";
    if (s === "viewed") return "Viewed";
    if (s === "draft" || s === "created") return "Draft";
    if (s === "revoked" || s === "voided") return "Voided";
    if (s === "declined") return "Declined";
    if (s === "expired") return "Expired";
    return s.toUpperCase();
}

export function isDocumentSendEntryViewable(status?: string | null): boolean {
    const s = String(status ?? "").trim().toLowerCase();
    return s === "completed" || s === "signed";
}

/** Tailwind classes for Sent / Viewed / Signed status capsules on ACH and contract rows. */
export function getDocumentSendStatusCapsuleClasses(status?: string | null): string {
    const label = formatDocumentSendStatusLabel(status);
    const base =
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
    switch (label) {
        case "Signed":
            return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200`;
        case "Viewed":
            return `${base} border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-200`;
        case "Sent":
            return `${base} border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200`;
        case "Draft":
            return `${base} border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300`;
        case "Voided":
        case "Declined":
        case "Expired":
            return `${base} border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200`;
        default:
            return `${base} border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200`;
    }
}

export function canPreviewFilledOrSignedEnvelope(status?: string | null): boolean {
    const s = String(status ?? "").trim().toLowerCase();
    return ["sent", "delivered", "viewed", "signed", "completed"].includes(s);
}

const DUMMY = ".";

function str(v: unknown): string {
    return String(v ?? "").trim();
}

function normalizeKey(value: string | null | undefined): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function disclosureDummyContext(): StateDisclosureContext {
    const d = (): string => DUMMY;
    return {
        fundingProvided: d(),
        amountBusinessFund: d(),
        fundingDisbursed: d(),
        feesDeducted: d(),
        totalRepayment: d(),
        totalDollarCost: d(),
        financeCharge: d(),
        estimatedPayment: d(),
        estimatedAnnualPercentageRate: d(),
        averageMonthlyIncome: d(),
        paymentExceededPercent: d(),
        percentOfBusinessIncome: d(),
        estimatedTerm: d(),
        estimatedNumberOfPayments: d(),
        prepayment: d(),
        recipientName: d(),
        funderName: PLATFORM_DISCLOSURE_FUNDER_NAME,
        funderAddress: d(),
        funderPhone: d(),
        funderEmail: d(),
        dealIdPrefix: d(),
        recipientAddress: d(),
        signatureDate: d(),
        prepaymentReceivedByDate: d(),
        prepaymentDiscountAmount: d(),
        paymentFrequency: d(),
    };
}

/** Parse `state_disclosure_dailyFlorida` / `daily_florida` into state + frequency. */
function parseStateFrequencyFromDisclosureRef(
    ref?: string | null,
): { state: string | null; frequency: string | null } {
    const raw = String(ref ?? "")
        .trim()
        .replace(/[\s-]+/g, "_");
    if (!raw) return { state: null, frequency: null };

    let key = raw;
    if (key.toLowerCase().startsWith("state_disclosure_")) {
        key = key.slice("state_disclosure_".length);
    }

    const freqMatch = key.match(/^(daily|weekly|monthly)[_]?(.+)$/i);
    if (!freqMatch) return { state: null, frequency: null };
    const frequency = freqMatch[1].toLowerCase();
    let statePart = String(freqMatch[2] ?? "")
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toLowerCase()
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
    if (statePart === "newyork" || statePart === "new_york") statePart = "new_york";
    return { state: statePart || null, frequency };
}

function resolveDisclosureStateAndFrequency(options: {
    templateState?: string | null;
    templateFrequency?: string | null;
    fallbackState?: string | null;
    fallbackFrequency?: string | null;
    templateLayoutKey?: string | null;
    templateName?: string | null;
    contract?: Record<string, unknown> | null;
}): { state: string | null; frequency: string | null } {
    const contract = options.contract ?? {};
    let state =
        String(options.templateState ?? options.fallbackState ?? contract.state ?? "").trim() ||
        null;
    let frequency =
        String(
            options.templateFrequency ??
                options.fallbackFrequency ??
                (contract as Record<string, unknown>).disclosureFrequency ??
                "",
        ).trim() || null;

    if (!state || !frequency) {
        const fromLayout = parseStateFrequencyFromDisclosureRef(options.templateLayoutKey);
        const fromName = parseStateFrequencyFromDisclosureRef(options.templateName);
        state = state || fromLayout.state || fromName.state;
        frequency = frequency || fromLayout.frequency || fromName.frequency;
    }
    return { state, frequency };
}

function applyPlatformDisclosureFunderName(fields: ContractPrefillField[]): ContractPrefillField[] {
    return fields.map((field) =>
        field.id === "funder_name"
            ? { ...field, value: PLATFORM_DISCLOSURE_FUNDER_NAME.toUpperCase() }
            : field,
    );
}

function parsePrefillMoneyForMerge(value: unknown): number | undefined {
    const raw = String(value ?? "").trim();
    if (!raw) return undefined;
    const n = Number.parseFloat(raw.replace(/[$,%\s]/g, ""));
    return Number.isFinite(n) ? n : undefined;
}

/** Same merge order as Deal Review / main contract prefill edit (app → contract row → saved overrides → live Overview identity). */
function buildEffectiveContractForTemplatePrefill(options: {
    contract?: Record<string, unknown> | null;
    application?: Record<string, unknown> | null;
    agreementDate?: string;
    mainPrefillOverrides?: Partial<BuildContractPrefillFieldsArgs> | null;
    bankDetail?: Record<string, unknown> | null;
}): Record<string, unknown> {
    const contract = options.contract ?? {};
    const merged = getContractPrefillEditDefaultsFromApplication(options.application ?? null, {
        agreementDate: options.agreementDate,
        contractRecords: { contract, bankDetail: options.bankDetail ?? null },
    });
    const liveBank = bankDetailRowToPrefillPartial(options.bankDetail ?? null);
    const base = {
        ...merged,
        ...contract,
        ...(options.mainPrefillOverrides ?? {}),
        // Scrubbing BankDetail must win over stale authorization* bank columns on Contract.
        ...liveBank,
    };
    // Gap-fill identity from Overview only — Verify Prefill name saves in overrides win.
    return applyLiveClientIdentitySyncToPrefillPartial(
        base as Partial<BuildContractPrefillFieldsArgs>,
        options.application ?? null,
    ) as Record<string, unknown>;
}

function mergeFieldRows(
    allDefs: ContractPrefillField[],
    computed: ContractPrefillField[],
    savedForRow: Record<string, string> | null | undefined,
): ContractPrefillField[] {
    const computedById = new Map(computed.map((f) => [f.id, f]));
    const saved = savedForRow ?? {};
    return allDefs.map((def) => {
        const fromSaved = saved[def.id];
        const fromSavedTrim =
            fromSaved !== undefined ? String(fromSaved).trim() : "";
        const computedVal = String(computedById.get(def.id)?.value ?? "").trim();
        const nk = normalizeMappingFieldKey(def.id);
        if (
            (nk === "frequency" || nk === "paymentterms") &&
            fromSavedTrim &&
            computedVal &&
            fromSavedTrim.toLowerCase() !== computedVal.toLowerCase()
        ) {
            return { id: def.id, label: def.label, value: computedVal };
        }
        if (fromSavedTrim !== "") {
            const savedNum = parsePrefillMoneyForMerge(fromSavedTrim);
            const computedNum = parsePrefillMoneyForMerge(computedVal);
            if (
                savedNum === 0 &&
                computedNum !== undefined &&
                computedNum > 0
            ) {
                return { id: def.id, label: def.label, value: computedVal };
            }
            // Stale Flex / addendum receivable snapshots must not beat live offer.
            const nk = normalizeMappingFieldKey(def.id);
            if (
                (nk === "receivable_purchase" ||
                    nk.startsWith("receivable_purchase")) &&
                savedNum != null &&
                computedNum != null &&
                computedNum > 0 &&
                Math.abs(savedNum - computedNum) > 0.009
            ) {
                return { id: def.id, label: def.label, value: computedVal };
            }
            return { id: def.id, label: def.label, value: fromSavedTrim };
        }
        return {
            id: def.id,
            label: def.label,
            value: computedVal,
        };
    });
}

function normalizeMappingFieldKey(fieldId?: string | null): string {
    return String(fieldId ?? "")
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s-]+/g, "_")
        .toLowerCase()
        .replace(/__p\d+_[a-z0-9]+$/i, "")
        .replace(/__page\d+$/i, "");
}

/** Field ids that mirror offer / payback / remittance (must refresh when CRM offer changes). */
function isOfferDerivedMappingFieldId(fieldId?: string | null): boolean {
    const k = normalizeMappingFieldKey(fieldId);
    if (!k) return false;
    const base = k.replace(/_\d+$/, "");
    if (
        base === "funding_provided" ||
        base === "disclosure_funding_provided" ||
        base === "disclosure_pdf__funding_provided" ||
        base === "disclosure_amount_financed" ||
        base === "disclosure_recipient_funds" ||
        base === "disclosure_purchase_price" ||
        base === "disclosure_finance_charge" ||
        base === "disclosure_total_payment" ||
        base === "disclosure_estimated_payment" ||
        base === "disclosure_monthly_cost" ||
        base === "disclosure_apr" ||
        base === "disclosure_fees_deducted" ||
        base === "disclosure_page3_line_1" ||
        base === "disclosure_page3_line_2" ||
        base === "disclosure_page3_subtotal" ||
        base === "disclosure_page3_net" ||
        base === "total_amount_business_fund" ||
        base === "total_amount_commercial_financing" ||
        base === "total_amount_of_fund_provided" ||
        base === "purchase_amount" ||
        base === "purchaseamount" ||
        base === "purchase_price" ||
        base === "purchaseprice" ||
        base === "remittance" ||
        base === "receivable_purchase" ||
        base === "daily_payment" ||
        base === "addendum_dated_principal_owner_amount" ||
        base === "amountfinanced" ||
        base === "disbursement_amount" ||
        base === "disclosure_funding_disbursed" ||
        base === "total_amount_of_fund_disbursed" ||
        base === "total_amount_fund_disbursed" ||
        base === "total_amount_sales_based_financing" ||
        base === "total_amount_business_fund_2" ||
        base === "finance_charge" ||
        base === "total_dollar_cost" ||
        base === "estimated_annual_percentage_rate"
    ) {
        return true;
    }
    return (
        k.startsWith("funding_provided") ||
        k.startsWith("receivable_purchase") ||
        k.startsWith("daily_payment") ||
        k.includes("total_amount_of_fund_disbursed") ||
        k.includes("total_amount_fund_disbursed") ||
        // Offer face amount only — exclude Texas `_2` (net) which is handled above as base.
        /(^|_)total_amount_business_fund($|_(?!2(?:$|_))\d+)/.test(k) ||
        k.includes("total_amount_commercial_financing")
    );
}

function resolveOfferAmountFromMappingOverrides(
    saved: Record<string, string> | null | undefined,
): number | undefined {
    if (!saved) return undefined;
    const preferredKeys = [
        "purchase_amount",
        "purchaseAmount",
        "funding_provided",
        "disclosure_purchase_price",
        "receivable_purchase_1",
        "receivable_purchase",
        "total_amount_business_fund",
        "total_amount_commercial_financing",
        "disclosure_amount_financed",
        "addendum_dated_principal_owner_amount",
    ];
    for (const key of preferredKeys) {
        const direct = saved[key];
        if (direct != null && String(direct).trim()) {
            const n = parsePrefillMoneyForMerge(String(direct));
            if (n != null && n > 0) return n;
        }
    }
    for (const [key, value] of Object.entries(saved)) {
        if (!isOfferDerivedMappingFieldId(key)) continue;
        const base = normalizeMappingFieldKey(key).replace(/_\d+$/, "");
        if (
            base !== "funding_provided" &&
            base !== "purchase_amount" &&
            base !== "purchaseamount" &&
            base !== "receivable_purchase" &&
            base !== "disclosure_purchase_price" &&
            base !== "total_amount_business_fund" &&
            base !== "total_amount_commercial_financing" &&
            base !== "disclosure_amount_financed"
        ) {
            continue;
        }
        const n = parsePrefillMoneyForMerge(String(value ?? ""));
        if (n != null && n > 0) return n;
    }
    return undefined;
}

/**
 * When the live CRM / Verify Prefill offer amount changed, drop saved mapping
 * money overrides so addendum + disclosure Edit fields recompute from the new offer.
 *
 * Also strips when *any* offer-derived money field (e.g. receivable_purchase_1)
 * still holds an old amount even if another key was already updated to the live offer.
 */
export function stripStaleOfferMoneyFromMappingOverrides(
    saved: Record<string, string> | null | undefined,
    liveOfferAmount: number | null | undefined,
    liveRemitAmount?: number | null,
    livePaybackAmount?: number | null,
    disclosureState?: string | null,
): Record<string, string> | null | undefined {
    if (saved == null) return saved;
    if (liveOfferAmount == null || !(liveOfferAmount > 0)) return saved;

    const savedOffer = resolveOfferAmountFromMappingOverrides(saved);
    let dirty =
        savedOffer != null && Math.abs(savedOffer - liveOfferAmount) > 0.009;

    if (!dirty) {
        for (const [key, value] of Object.entries(saved)) {
            if (!isOfferDerivedMappingFieldId(key)) continue;
            const n = parsePrefillMoneyForMerge(value);
            if (n == null || !(n > 0)) continue;
            const base = normalizeMappingFieldKey(key).replace(/_\d+$/, "");
            const isPayment =
                base === "remittance" ||
                base === "daily_payment" ||
                base.includes("transaction_fee") ||
                base.includes("estimated_payment") ||
                base === "ach_authorization_account_holder_bank_transaction_fee";
            const isPayback =
                base === "purchase_price" ||
                base === "purchaseprice" ||
                base === "disclosure_total_payment" ||
                base === "total_of_payments" ||
                base === "total_repayment_amount" ||
                base === "total_repayment" ||
                base === "addendum_dated_principal_owner_amount2" ||
                base === "disclosure_finance_charge" ||
                base === "finance_charge" ||
                base === "total_dollar_cost";
            if (isPayment) {
                if (
                    liveRemitAmount != null &&
                    liveRemitAmount > 0 &&
                    Math.abs(n - liveRemitAmount) > 0.009
                ) {
                    dirty = true;
                    break;
                }
                continue;
            }
            if (isPayback) {
                if (
                    livePaybackAmount != null &&
                    livePaybackAmount > 0 &&
                    Math.abs(n - livePaybackAmount) > 0.009
                ) {
                    dirty = true;
                    break;
                }
                continue;
            }
            // Fund disbursed / net = offer − fees — must not equal offer when fees exist.
            // Texas page-1 `total_amount_of_fund_disbursed` = offer face amount (not net).
            // Virginia `total_amount_sales_based_financing` = offer; `disbursement_amount` = net.
            const isDisbursedNet =
                base === "disclosure_funding_disbursed" ||
                (!isTexasDisclosureState(disclosureState) &&
                    (base === "total_amount_of_fund_disbursed" ||
                        base === "total_amount_fund_disbursed")) ||
                base === "disbursement_amount" ||
                base === "total_amount_business_fund_2" ||
                base === "total_commerical_financing" ||
                base === "disclosure_fees_deducted" ||
                base === "net_to_merchant";
            if (isDisbursedNet) {
                continue;
            }
            // Offer / receivable / funding mirrors must match live offer.
            if (Math.abs(n - liveOfferAmount) > 0.009) {
                dirty = true;
                break;
            }
        }
    }

    if (!dirty) return saved;

    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(saved)) {
        if (isOfferDerivedMappingFieldId(key)) continue;
        next[key] = value;
    }
    return next;
}

function isPaymentFrequencyMappingFieldId(fieldId?: string | null): boolean {
    const nk = normalizeMappingFieldKey(fieldId);
    return nk === "frequency" || nk === "paymentterms";
}

/** Drop saved Weekly/Daily overrides when scrubbing changed offer cadence. */
export function stripStaleFrequencyFromMappingOverrides(
    saved: Record<string, string> | null | undefined,
    liveFrequency?: string | null,
): Record<string, string> | null | undefined {
    if (saved == null) return saved;
    const live = coercePaymentFrequencyLabel(liveFrequency);
    if (!live) return saved;

    let dirty = false;
    for (const [key, value] of Object.entries(saved)) {
        if (!isPaymentFrequencyMappingFieldId(key)) continue;
        const savedLabel = coercePaymentFrequencyLabel(value);
        if (savedLabel && savedLabel.toLowerCase() !== live.toLowerCase()) {
            dirty = true;
            break;
        }
    }
    if (!dirty) return saved;

    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(saved)) {
        if (isPaymentFrequencyMappingFieldId(key)) continue;
        next[key] = value;
    }
    return next;
}

/** Mapping / disclosure field ids that mirror Overview client / owner identity. */
function isClientIdentityMappingFieldId(fieldId?: string | null): boolean {
    if (isOfferDerivedMappingFieldId(fieldId)) return false;
    const nk = normalizeMappingFieldKey(fieldId);
    if (!nk) return false;
    if (
        nk.includes("payment") ||
        nk.includes("remittance") ||
        nk.includes("purchase") ||
        nk.includes("receivable") ||
        nk.includes("finance_charge") ||
        nk.includes("funding") ||
        nk.includes("fee") ||
        nk.includes("percent") ||
        nk.includes("term") ||
        nk.includes("frequency") ||
        nk.includes("funder")
    ) {
        return false;
    }
    return (
        nk.includes("client_name") ||
        nk.includes("customer_name") ||
        nk.includes("owner_name") ||
        nk.includes("owner1") ||
        nk.includes("owner2") ||
        nk.includes("guarantor") ||
        nk.includes("printed_name") ||
        nk.includes("print_borrower") ||
        nk.includes("borrower_name") ||
        nk.includes("seller_name") ||
        nk.includes("merchant_name") ||
        nk.includes("agree_name") ||
        nk.includes("legal_name") ||
        nk.includes("business_name") ||
        nk.includes("doing_business") ||
        nk.includes("_dba") ||
        nk.endsWith("dba") ||
        nk.includes("recipient_name") ||
        nk.includes("federal_tax") ||
        nk.includes("tax_id") ||
        nk.includes("ein") ||
        nk.includes("ssn") ||
        nk.includes("driver_license") ||
        nk.includes("business_address") ||
        nk.includes("guarantor_address") ||
        nk.includes("owner_address") ||
        nk.includes("client_email") ||
        nk.includes("client_phone") ||
        nk.includes("guarantor_email") ||
        nk.includes("guarantor_phone")
    );
}

/**
 * Drop saved addendum/disclosure identity overrides when live Overview Client
 * identity is available so computed rows re-seed from CRM (mirrors money strip).
 */
export function stripStaleClientIdentityFromMappingOverrides(
    saved: Record<string, string> | null | undefined,
    application?: Record<string, unknown> | null,
): Record<string, string> | null | undefined {
    if (saved == null) return saved;
    const live = pickLiveClientIdentityOverlay(
        getLiveClientIdentityPrefillArgs(application ?? null),
    );
    const hasLive = Object.values(live).some((v) => String(v ?? "").trim());
    if (!hasLive) return saved;

    let changed = false;
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(saved)) {
        if (isClientIdentityMappingFieldId(key)) {
            changed = true;
            continue;
        }
        next[key] = value;
    }
    return changed ? next : saved;
}

/**
 * ACH Edit Form fields that Overview / Scrubbing (Client + BankDetail) can seed
 * when the mapping has no saved value. Saved ACH form tabs always win on reload.
 */
export function isAchCrmSyncedMappingFieldId(fieldId?: string | null): boolean {
    const nk = normalizeMappingFieldKey(fieldId);
    if (!nk) return false;
    if (
        nk.includes("transaction_fee") ||
        nk.includes("number_of_transactions") ||
        nk.includes("portal") ||
        nk.includes("username") ||
        nk.includes("password") ||
        nk.includes("security_question") ||
        nk.includes("security_answer") ||
        nk.includes("reference_") ||
        nk.includes("other_infomation") ||
        nk.includes("other_information")
    ) {
        return false;
    }
    if (isClientIdentityMappingFieldId(fieldId)) return true;
    return (
        nk.includes("authorization_client") ||
        nk.includes("authorized_business_phone") ||
        nk.includes("ach_authorization_account_holder") ||
        nk.includes("ach_authorization_concent") ||
        nk.includes("bank_name") ||
        nk.includes("bank_routing") ||
        nk.includes("bank_account") ||
        nk.includes("routing_number") ||
        nk.includes("account_number") ||
        nk.includes("branch_city") ||
        nk.includes("bank_state") ||
        nk.includes("bank_zip")
    );
}

/** @deprecated Saved ACH form values are kept; this is unused. */
export function stripStaleAchCrmSyncedFieldsFromMappingOverrides(
    saved: Record<string, string> | null | undefined,
    _application?: Record<string, unknown> | null,
): Record<string, string> | null | undefined {
    return saved;
}

function stateDisclosureAllDefs(
    name: string | null | undefined,
    state: string | null | undefined,
    frequency: string | null | undefined,
): ContractPrefillField[] {
    const fromEditor = getStateDisclosureEditorFieldDefinitions(name, state, frequency);
    if (fromEditor.length > 0) return fromEditor;

    const dummy = disclosureDummyContext();
    const byName = getStateDisclosurePrefillFieldsByName(name, dummy);
    if (byName.length > 0) return byName;
    return getStateDisclosurePrefillFieldsByStateFrequency({
        state,
        frequency,
        context: dummy,
    });
}

function stateDisclosureComputed(
    name: string | null | undefined,
    state: string | null | undefined,
    frequency: string | null | undefined,
    context: StateDisclosureContext,
): ContractPrefillField[] {
    const key = resolveStateDisclosureRegistryKey(name, state, frequency);
    if (key) return buildDisclosureEditorFieldsFromContext(context);

    const byName = getStateDisclosurePrefillFieldsByName(name, context);
    if (byName.length > 0) return byName;
    return getStateDisclosurePrefillFieldsByStateFrequency({
        state,
        frequency,
        context,
    });
}

function dotBalanceTransfer(): BalanceTransferSheetContractPrefillFields {
    return {
        merchantLegalName: DUMMY,
        businessLegalName: DUMMY,
        clientLegalName: DUMMY,
        clientNameBy: DUMMY,
        dba: DUMMY,
        businessAddress: DUMMY,
        businessAddressCity: DUMMY,
        businessAddressState: DUMMY,
        businessAddressZip: DUMMY,
        remainingRtrBalance: DUMMY,
        funderNameWithDealPrefix: DUMMY,
        dealIdPrefix: DUMMY,
    };
}

function dotWoodmereFlex(): WoodmereFlexAddendumContractPrefillFields {
    return {
        addendumDate: DUMMY,
        agreementDate: DUMMY,
        merchantName: DUMMY,
        clientName: DUMMY,
        businessName2: DUMMY,
        installmentDay1: "1",
        installmentDay2: "16",
        dailyPayment1: DUMMY,
        receivablePurchase1: DUMMY,
        dailyPayment2: DUMMY,
        receivablePurchase2: DUMMY,
    };
}

function currentUsDate(): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
    }).format(new Date());
}

function buildPrePaymentAddendumComputed(
    contract: Record<string, unknown> | null,
    application: Record<string, unknown> | null,
    sctx: StateDisclosureContext,
): ContractPrefillField[] {
    const c = contract ?? {};
    const sellerName =
        resolveContractBusinessLegalNameForPrefill(c, application) ||
        sctx.recipientName ||
        "";
    const guarantorName =
        getApplicationPrimaryRecipientName(application) ||
        str(c.owner1GuarantorName) ||
        str(c.guarantorName) ||
        str(c.customerName) ||
        str(c.clientName) ||
        "";
    return buildPrePaymentAddendumContractPrefillFields({
        agreementDate: currentUsDate(),
        sellerName,
        guarantorName,
        businessDays: str(c.prePaymentBusinessDays),
        discountPercentage: str(c.prePaymentDiscountPercentage),
        printedName: guarantorName,
    });
}

function dotPrePaymentAddendum(): PrePaymentAddendumContractPrefillFields {
    return {
        agreementDate: DUMMY,
        sellerName: DUMMY,
        guarantorName: DUMMY,
        businessDays: DUMMY,
        discountPercentage: DUMMY,
        printedName: DUMMY,
    };
}

function buildBalanceTransferComputed(
    contract: Record<string, unknown> | null,
    sctx: StateDisclosureContext,
    application: Record<string, unknown> | null,
): ContractPrefillField[] {
    const c = contract ?? {};
    const overrides = (c.contractPrefillOverrides as Record<string, unknown> | undefined) ?? {};
    const merchant = resolveBalanceTransferMerchantContext(contract, application, {
        recipientName: sctx.recipientName,
        recipientAddress: sctx.recipientAddress,
    });
    // Remaining RTR is editor-only (BT sheet mapping / Verify Prefill) — never
    // refinance, payback, or legacy purchase_price aliases.
    const remainingRtrBalance =
        str(overrides.balance_transfer_remaining_rtr_balance) ||
        str(overrides.remaining_rtr_balance) ||
        str(overrides.remainingRtrBalance) ||
        "";
    const funderNameWithDealPrefix = formatFunderNameWithDealIdPrefix(
        str(c.funderName) || str(overrides.funderName),
        str(c.dealIdPrefix) || str(overrides.dealIdPrefix),
        str(c.funderDisplayName) || str(overrides.funderDisplayName),
    );
    const dealIdPrefix =
        str(c.dealIdPrefix) || str(overrides.dealIdPrefix) || "";
    return buildBalanceTransferSheetContractPrefillFields({
        merchantLegalName: merchant.clientLegalName,
        businessLegalName: merchant.businessName,
        clientLegalName: merchant.clientLegalName,
        clientNameBy: merchant.clientNameBy,
        dba: merchant.clientDba,
        businessAddress: str(c.businessAddress) || str(overrides.businessAddress),
        businessAddressCity: str(c.businessAddressCity) || str(overrides.businessAddressCity),
        businessAddressState: str(c.businessAddressState) || str(overrides.businessAddressState),
        businessAddressZip: str(c.businessAddressZip) || str(overrides.businessAddressZip),
        remainingRtrBalance,
        funderNameWithDealPrefix,
        dealIdPrefix,
    });
}

function buildWoodmereFlexComputed(
    contract: Record<string, unknown> | null,
    sctx: StateDisclosureContext,
    application?: Record<string, unknown> | null,
): ContractPrefillField[] {
    const c = contract ?? {};
    const app = application ?? null;
    const offerDecision =
        (app?.offerDecision as Record<string, unknown> | undefined) ??
        (app?.OfferDecision as Record<string, unknown> | undefined) ??
        (c.offer as Record<string, unknown> | undefined) ??
        null;
    const legal =
        resolveContractBusinessLegalNameForPrefill(c, app) ||
        sctx.recipientName ||
        "";
    const linkedClient = c.client as Record<string, unknown> | undefined;
    const businessName =
        resolveApplicationClientBusinessName(app) ||
        str(linkedClient?.businessName) ||
        str(c.securityBusinessName) ||
        legal;
    const primaryRecipient = getApplicationPrimaryRecipientName(app);
    const personName = resolveContractClientPersonNameForPrefill(c, app);
    const clientName =
        personName ||
        (primaryRecipient && primaryRecipient !== "Signer" ? primaryRecipient : "") ||
        str(c.customerName) ||
        str(c.owner1GuarantorName) ||
        str(c.clientName) ||
        primaryRecipient ||
        "";
    const agreementDate =
        str(c.agreement_date) ||
        sctx.signatureDate ||
        str(c.agreementDate) ||
        "";
    const addendumDate = str(c.addendum_date) || agreementDate;
    const liveRemittanceRaw = resolveRemittancePrefillValue({
        application: app ?? undefined,
        contract,
        offerDecision,
    });
    const liveRemittanceStr = liveRemittanceRaw
        ? formatFlexAddendumMoneyDisplay(String(liveRemittanceRaw))
        : "";
    const legacyDailyPayment =
        liveRemittanceStr ||
        str(c.daily_payment) ||
        str(c.remittance) ||
        "";
    const offerAmountNum = resolveOfferAmountDollarsForUnderwritingFees({
        contract,
        application: app ?? undefined,
        offerDecision,
    });
    const offerAmountStr =
        offerAmountNum !== undefined && offerAmountNum > 0
            ? formatFlexAddendumMoneyDisplay(String(offerAmountNum))
            : str(offerDecision?.offer) || str(c.approvedAmount) || "";
    // Prefer live CRM offer / remittance over stale receivable_purchase_* / daily_payment_*
    // snapshots left on the contract blob after an offer change.
    const dailyPayment1 =
        liveRemittanceStr ||
        str(c.daily_payment_1) ||
        str(c.dailyPayment1) ||
        legacyDailyPayment;
    const receivablePurchase1 =
        offerAmountStr ||
        str(c.receivable_purchase_1) ||
        str(c.receivablePurchase1) ||
        str(c.receivable_purchase) ||
        str(c.receivablePurchase);
    const dailyPayment2 =
        liveRemittanceStr ||
        str(c.daily_payment_2) ||
        str(c.dailyPayment2) ||
        dailyPayment1;
    const receivablePurchase2 =
        offerAmountStr ||
        str(c.receivable_purchase_2) ||
        str(c.receivablePurchase2) ||
        receivablePurchase1;
    const businessName2 =
        str(c.merchant2Name) ||
        str(c.owner2GuarantorName) ||
        str(c.merchant2_name) ||
        str(c.owner2_guarantor_name) ||
        str(c.business_name_2) ||
        "";
    return buildWoodmereFlexAddendumContractPrefillFields({
        addendumDate,
        agreementDate,
        merchantName: businessName,
        clientName,
        businessName2,
        dailyPayment1,
        receivablePurchase1,
        dailyPayment2,
        receivablePurchase2,
    });
}

function buildWoodmereBuyoutComputed(
    contract: Record<string, unknown> | null,
    sctx: StateDisclosureContext,
    application?: Record<string, unknown> | null,
): ContractPrefillField[] {
    const c = contract ?? {};
    const businessName =
        resolveContractBusinessLegalNameForPrefill(c, application) ||
        sctx.recipientName ||
        "";
    const personName =
        getApplicationPrimaryRecipientName(application) ||
        str(c.owner1GuarantorName) ||
        str(c.customerName) ||
        str(c.clientName) ||
        "";
    return buildWoodmereBuyoutBlankAddendumContractPrefillFields({
        addendumEnteredDate: sctx.signatureDate,
        addendumAgreementDate: sctx.signatureDate,
        clientName: businessName,
        agreeName: businessName,
        advanceRemit: sctx.estimatedPayment,
        agreementTo: str(c.authorizationApplication),
        amountOfDirecltyDisbursed: sctx.fundingDisbursed,
        transferFundTo: "",
        nameOfBank: str(c.authorizationClientBankName),
        abaRouting: str(c.authorizationClientBankRouting),
        checkingAccount: str(c.authorizationClientBankAccount),
        transferAmount: sctx.totalRepayment,
        ownerName: personName || businessName,
    });
}

function dotWoodmereBuyout(): WoodmereBuyoutBlankAddendumContractPrefillFields {
    return {
        addendumEnteredDate: DUMMY,
        addendumAgreementDate: DUMMY,
        clientName: DUMMY,
        agreeName: DUMMY,
        advanceRemit: DUMMY,
        agreementTo: DUMMY,
        amountOfDirecltyDisbursed: DUMMY,
        transferFundTo: DUMMY,
        nameOfBank: DUMMY,
        abaRouting: DUMMY,
        checkingAccount: DUMMY,
        transferAmount: DUMMY,
        ownerName: DUMMY,
    };
}

function buildWoodmereFlexDatedComputed(
    contract: Record<string, unknown> | null,
    sctx: StateDisclosureContext,
    application?: Record<string, unknown> | null,
): ContractPrefillField[] {
    const c = contract ?? {};
    const personName =
        getApplicationPrimaryRecipientName(application) ||
        str(c.customerName) ||
        str(c.clientName) ||
        str(c.owner1GuarantorName) ||
        "";
    return buildWoodmereFlexDatedAddendumContractPrefillFields({
        addendumDated: sctx.signatureDate,
        agreementDate: sctx.signatureDate,
        clientNameAddendum: personName,
        clientName: personName,
    });
}

function dotWoodmereFlexDated(): WoodmereFlexDatedAddendumContractPrefillFields {
    return {
        addendumDated: DUMMY,
        agreementDate: DUMMY,
        clientNameAddendum: DUMMY,
        clientName: DUMMY,
    };
}

function buildDiscoverEpoComputed(
    contract: Record<string, unknown> | null,
    sctx: StateDisclosureContext,
    application?: Record<string, unknown> | null,
): ContractPrefillField[] {
    const c = contract ?? {};
    const offer = (c.offer ?? null) as Record<string, unknown> | null;
    const payFmt = (n: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
    let p60 = "";
    let p90 = "";
    let p120 = "";
    const total = Number(c.purchasePrice ?? offer?.totalRemit ?? offer?.paybackAmount);
    if (Number.isFinite(total)) {
        p60 = payFmt(total * (60 / 100));
        p90 = payFmt(total * (90 / 100));
        p120 = payFmt(total * (120 / 100));
    }
    const businessName =
        resolveContractBusinessLegalNameForPrefill(c, application) ||
        sctx.recipientName ||
        "";
    const personName =
        getApplicationPrimaryRecipientName(application) ||
        str(c.owner1GuarantorName) ||
        str(c.customerName) ||
        str(c.clientName) ||
        "";
    return buildDiscoverAdvanceEpoAddendumContractPrefillFields({
        loanAgreementDated: sctx.signatureDate,
        borrowerName: businessName,
        payingToDiscoverAgent60: p60,
        payingToDiscoverAgent90: p90,
        payingToDiscoverAgent120: p120,
        printBorrowerName1: personName || businessName,
        printBorrowerTitle1: str(c["ownerTitle"]),
        printBorrowerName2: str(c["owner1GuarantorName"]) || personName,
        printBorrowerTitle2: "",
    });
}

function dotDiscoverEpo(): DiscoverAdvanceEpoAddendumContractPrefillFields {
    return {
        loanAgreementDated: DUMMY,
        borrowerName: DUMMY,
        payingToDiscoverAgent60: DUMMY,
        payingToDiscoverAgent90: DUMMY,
        payingToDiscoverAgent120: DUMMY,
        printBorrowerName1: DUMMY,
        printBorrowerTitle1: DUMMY,
        printBorrowerName2: DUMMY,
        printBorrowerTitle2: DUMMY,
    };
}

function buildDiscoverRefiComputed(
    contract: Record<string, unknown> | null,
    sctx: StateDisclosureContext,
    application?: Record<string, unknown> | null,
): ContractPrefillField[] {
    const c = contract ?? {};
    const businessName =
        resolveContractBusinessLegalNameForPrefill(c, application) ||
        sctx.recipientName ||
        "";
    const personName =
        getApplicationPrimaryRecipientName(application) ||
        str(c.customerName) ||
        str(c.clientName) ||
        str(c.owner1GuarantorName) ||
        "";
    return buildDiscoverRefiBalanceTransferAddendumContractPrefillFields({
        loanAgreementDated: sctx.signatureDate,
        borrowerName: businessName,
        borrowerPay: sctx.estimatedPayment,
        financialDate: sctx.signatureDate,
        previousFinancingDirectlyTo: "",
        borrowerName1: personName || businessName,
        borrowerTitle1: str(c["ownerTitle"]),
    });
}

function buildCaseTakeoverAddendumComputed(
    contract: Record<string, unknown> | null,
    sctx: StateDisclosureContext,
): ContractPrefillField[] {
    const c = contract ?? {};
    const fromCtx = str(sctx.funderName);
    const funderName =
        str(c.funderName) ||
        str(c["funder_name"]) ||
        (fromCtx &&
        fromCtx.toLowerCase() !== PLATFORM_DISCLOSURE_FUNDER_NAME.toLowerCase()
            ? fromCtx
            : "") ||
        "";
    return buildCaseTakeoverAddendumContractPrefillFields({
        funderName,
        loanAgreementDated: sctx.signatureDate,
        borrowerName: sctx.recipientName,
        borrowerPay: sctx.estimatedPayment,
        financialDate: sctx.signatureDate,
        previousFinancingDirectlyTo: "",
        borrowerName1: str(c.clientName) || sctx.recipientName,
        borrowerTitle1: str(c["ownerTitle"]),
    });
}

function dotDiscoverRefi(): DiscoverRefiBalanceTransferAddendumContractPrefillFields {
    return {
        loanAgreementDated: DUMMY,
        borrowerName: DUMMY,
        borrowerPay: DUMMY,
        financialDate: DUMMY,
        previousFinancingDirectlyTo: DUMMY,
        borrowerName1: DUMMY,
        borrowerTitle1: DUMMY,
    };
}

function dotCaseTakeoverAddendum(): CaseTakeoverAddendumContractPrefillFields {
    return {
        funderName: DUMMY,
        loanAgreementDated: DUMMY,
        borrowerName: DUMMY,
        borrowerPay: DUMMY,
        financialDate: DUMMY,
        previousFinancingDirectlyTo: DUMMY,
        borrowerName1: DUMMY,
        borrowerTitle1: DUMMY,
    };
}

function matches(norm: string, ...needles: string[]): boolean {
    return needles.every((n) => norm.includes(n));
}

type AddendumKind =
    | "balance_transfer_sheet"
    | "case_takeover_addendum"
    | "woodmere_flex"
    | "pre_payment_addendum"
    | "woodmere_buyout_blank"
    | "woodmere_flex_dated"
    | "discover_epo"
    | "discover_refi_balance";

const ADDENDUM_GUID = Object.fromEntries(
    Object.entries(DOCUSIGN_ADDENDUM_TEMPLATE_IDS).map(([k, v]) => [k, String(v).trim().toLowerCase()]),
) as Record<keyof typeof DOCUSIGN_ADDENDUM_TEMPLATE_IDS, string>;

function resolveAddendumKind(
    templateId?: string | null,
    normName = "",
    layoutKey?: string | null,
): AddendumKind | null {
    const tid = String(templateId ?? "").trim().toLowerCase();
    const lk = String(layoutKey ?? "").trim().toLowerCase();
    const key = lk || tid;
    if (
        key === PLATFORM_LAYOUT_KEYS.flexAddendum ||
        key.endsWith("_flex_addendum")
    ) {
        return "woodmere_flex";
    }
    if (
        key === PLATFORM_LAYOUT_KEYS.prePaymentAddendum ||
        key.endsWith("_pre_payment_addendum")
    ) {
        return "pre_payment_addendum";
    }
    // Must run before balance_transfer — legacy key ends with `_balance_transfer`.
    if (
        key === PLATFORM_LAYOUT_KEYS.caseTakeoverAddendum ||
        key.endsWith("_case_takeover_addendum") ||
        key === "case_takeover_balance_transfer" ||
        key.endsWith("_case_takeover_balance_transfer")
    ) {
        return "case_takeover_addendum";
    }
    if (
        key === PLATFORM_LAYOUT_KEYS.balanceTransfer ||
        key.endsWith("_balance_transfer")
    ) {
        return "balance_transfer_sheet";
    }
    if (tid === ADDENDUM_GUID.WOODMERE_FLEX) return "woodmere_flex";
    if (tid === ADDENDUM_GUID.WOODMERE_BALANCE_TRANSFER_SHEET) return "balance_transfer_sheet";
    if (matches(normName, "case", "takeover")) return "case_takeover_addendum";
    if (matches(normName, "balance", "transfer") && !normName.includes("discover") && !normName.includes("refi"))
        return "balance_transfer_sheet";
    if (normName.includes("woodmere") && normName.includes("flex") && (normName.includes("dated") || normName.includes("agreement")))
        return "woodmere_flex_dated";
    if (normName.includes("woodmere") && normName.includes("flex")) return "woodmere_flex";
    if (normName.includes("flex") && !normName.includes("dated")) return "woodmere_flex";
    if (
        (normName.includes("pre_payment") || normName.includes("prepayment")) &&
        normName.includes("addendum")
    )
        return "pre_payment_addendum";
    if (normName.includes("buyout") && normName.includes("blank")) return "woodmere_buyout_blank";
    if (normName.includes("discover") && normName.includes("epo")) return "discover_epo";
    if (normName.includes("discover") && (normName.includes("refi") || normName.includes("balance_transfer")))
        return "discover_refi_balance";
    return null;
}

/** True when this DocuSign addendum template has a registered prefill field map (edit in contract prefill modal). */
export function hasStateDisclosurePrefillFieldMap(
    templateName?: string | null,
    templateState?: string | null,
    templateFrequency?: string | null,
    fallbackState?: string | null,
    fallbackFrequency?: string | null,
    templateLayoutKey?: string | null,
): boolean {
    const { state, frequency } = resolveDisclosureStateAndFrequency({
        templateState,
        templateFrequency,
        fallbackState,
        fallbackFrequency,
        templateLayoutKey,
        templateName,
    });
    return hasStateDisclosurePrefillRegistry(templateName, state, frequency);
}

/** Whether the template-mapping editor has registered fields (addendum or state disclosure). */
export function hasDocumentTemplatePrefillFieldMap(
    templateId?: string | null,
    templateName?: string | null,
    templateState?: string | null,
    templateFrequency?: string | null,
    fallbackState?: string | null,
    fallbackFrequency?: string | null,
): boolean {
    return (
        hasAddendumPrefillFieldMap(templateId, templateName) ||
        hasStateDisclosurePrefillFieldMap(
            templateName,
            templateState,
            templateFrequency,
            fallbackState,
            fallbackFrequency,
        )
    );
}

export function hasAddendumPrefillFieldMap(
    templateId?: string | null,
    templateName?: string | null,
    layoutKey?: string | null,
): boolean {
    return (
        resolveAddendumKind(
            templateId,
            normalizeKey(templateName ?? ""),
            layoutKey,
        ) != null
    );
}

/** Remove per-mapping addendum blob so main contract prefill forms do not treat it as flat keys. */
export function stripDocumentTemplateBlobFromPrefillOverrides<
    T extends Record<string, unknown> | null | undefined,
>(raw: T): T {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const o = { ...raw } as Record<string, unknown>;
    delete o[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
    delete o[DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY];
    delete o[DOCUMENT_SEND_HISTORY_KEY];
    delete o[LAST_ACH_SENT_FUNDER_KEY];
    delete o[CONTRACT_SIGNER_OVERRIDES_KEY];
    return o as T;
}

function addendumAllDefs(kind: AddendumKind): ContractPrefillField[] {
    switch (kind) {
        case "balance_transfer_sheet":
            return buildBalanceTransferSheetContractPrefillFields(dotBalanceTransfer());
        case "case_takeover_addendum":
            return buildCaseTakeoverAddendumContractPrefillFields(dotCaseTakeoverAddendum());
        case "woodmere_flex":
            return buildWoodmereFlexAddendumContractPrefillFields(dotWoodmereFlex());
        case "pre_payment_addendum":
            return buildPrePaymentAddendumContractPrefillFields(dotPrePaymentAddendum());
        case "woodmere_buyout_blank":
            return buildWoodmereBuyoutBlankAddendumContractPrefillFields(dotWoodmereBuyout());
        case "woodmere_flex_dated":
            return buildWoodmereFlexDatedAddendumContractPrefillFields(dotWoodmereFlexDated());
        case "discover_epo":
            return buildDiscoverAdvanceEpoAddendumContractPrefillFields(dotDiscoverEpo());
        case "discover_refi_balance":
            return buildDiscoverRefiBalanceTransferAddendumContractPrefillFields(dotDiscoverRefi());
        default:
            return [];
    }
}

function addendumComputed(
    kind: AddendumKind,
    contract: Record<string, unknown> | null,
    sctx: StateDisclosureContext,
    application: Record<string, unknown> | null,
): ContractPrefillField[] {
    switch (kind) {
        case "balance_transfer_sheet":
            return buildBalanceTransferComputed(contract, sctx, application);
        case "case_takeover_addendum":
            return buildCaseTakeoverAddendumComputed(contract, sctx);
        case "woodmere_flex":
            return buildWoodmereFlexComputed(contract, sctx, application);
        case "pre_payment_addendum":
            return buildPrePaymentAddendumComputed(contract, application, sctx);
        case "woodmere_buyout_blank":
            return buildWoodmereBuyoutComputed(contract, sctx, application);
        case "woodmere_flex_dated":
            return buildWoodmereFlexDatedComputed(contract, sctx, application);
        case "discover_epo":
            return buildDiscoverEpoComputed(contract, sctx, application);
        case "discover_refi_balance":
            return buildDiscoverRefiComputed(contract, sctx, application);
        default:
            return [];
    }
}

export function parseDocumentTemplatePrefillByMappingId(raw: unknown): Record<string, Record<string, string>> {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const blob = (raw as Record<string, unknown>)[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
    if (blob == null || typeof blob !== "object" || Array.isArray(blob)) return {};
    const out: Record<string, Record<string, string>> = {};
    for (const [mappingId, row] of Object.entries(blob)) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const inner: Record<string, string> = {};
        for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
            inner[k] = String(v ?? "");
        }
        out[mappingId] = inner;
    }
    return out;
}

export function parseDocumentTemplateEnvelopeByMappingId(
    raw: unknown,
): Record<string, DocumentTemplateEnvelopeMeta> {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const blob = (raw as Record<string, unknown>)[DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY];
    if (blob == null || typeof blob !== "object" || Array.isArray(blob)) return {};
    const out: Record<string, DocumentTemplateEnvelopeMeta> = {};
    for (const [mappingId, row] of Object.entries(blob)) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const envelopeId = String((row as Record<string, unknown>).envelopeId ?? "").trim();
        if (!envelopeId) continue;
        const o = row as Record<string, unknown>;
        const status = String(o.status ?? "").trim();
        const updatedAt = String(o.updatedAt ?? "").trim();
        const funderName = String(o.funderName ?? "").trim();
        const funderProfileId = String(o.funderProfileId ?? "").trim();
        out[mappingId] = {
            envelopeId,
            ...(status ? { status } : {}),
            ...(updatedAt ? { updatedAt } : {}),
            ...(funderName ? { funderName } : {}),
            ...(funderProfileId ? { funderProfileId } : {}),
        };
    }
    return out;
}

/**
 * Rows for the template-mapping editor: every BoldSign field id for this template, labels from builders,
 * values from CRM-derived defaults merged with optional saved overrides for this mapping row.
 */
export const LINKED_DOCUSIGN_ADDENDUM_SECTION_ID = "linked_docusign_addendum";

/** State disclosure template merged with the contract (Florida, Georgia, etc.). */
export const LINKED_DOCUSIGN_DISCLOSURE_SECTION_ID = "linked_docusign_disclosure";
export const LINKED_DOCUSIGN_ACH_SECTION_ID = "linked_docusign_ach";

/**
 * Text Data Labels from `ach_authorization*.layout.json` (excludes DocuSign date/sign tabs).
 * Source of truth: `achFormEditConfig.ts`.
 */
export function usesCoordinateLayoutTemplate(row: {
    documentType?: string | null;
    template?: {
        type?: string | null;
        layoutKey?: string | null;
        pdfUrl?: string | null;
        templateId?: string | null;
        name?: string | null;
    } | null;
} | null): boolean {
    if (!row) return false;
    const docType = normalizeKey(row.documentType ?? "");
    const type = normalizeKey(row.template?.type ?? "");
    const layoutKey = String(row.template?.layoutKey ?? "").trim();
    if (docType === "ach" || type === "ach") return true;
    if (isAchAuthorizationLayoutKey(layoutKey)) return true;
    return resolveAchAuthorizationTemplate(type, row.template?.name, layoutKey);
}

function resolveAchAuthorizationTemplate(
    templateType?: string | null,
    templateName?: string | null,
    layoutKey?: string | null,
): boolean {
    const typeNorm = normalizeKey(templateType ?? "");
    const nameNorm = normalizeKey(templateName ?? "");
    if (typeNorm === "ach") return true;
    if (isAchAuthorizationLayoutKey(layoutKey)) return true;
    // Avoid matching unrelated templates that merely mention "ach" in the name.
    return (
        nameNorm.includes("ach_authorization") ||
        nameNorm.includes("ach authorization") ||
        (nameNorm.includes("ach") && nameNorm.includes("authorization"))
    );
}

function achAuthorizationAllDefs(): ContractPrefillField[] {
    return ACH_AUTHORIZATION_EDITABLE_FIELD_IDS.map((id) => ({
        id,
        label: ACH_AUTHORIZATION_FIELD_LABELS[id] || id.replace(/_/g, " "),
        value: "",
    }));
}

function achAuthorizationComputed(
    contract: Record<string, unknown> | null,
    application: Record<string, unknown> | null,
    agreementDate?: string,
    mainPrefillOverrides?: Partial<BuildContractPrefillFieldsArgs> | null,
    contractRecords?: ContractPrefillContractRecords | null,
): ContractPrefillField[] {
    const bankDetail = contractRecords?.bankDetail ?? null;
    // Drop stale shared ACH columns on the contract row so Overview / Scrubbing reseeds.
    const contractWithoutStaleAch = stripAchAuthorizationKeysFromRecord(
        (contract ?? null) as Record<string, unknown> | null,
    );
    const effectiveContract = buildEffectiveContractForTemplatePrefill({
        contract: contractWithoutStaleAch,
        application,
        agreementDate,
        // Do not seed ACH editor defaults from shared main ACH keys (multi-form isolation).
        mainPrefillOverrides: stripAchAuthorizationKeysFromRecord(
            (mainPrefillOverrides ?? null) as Record<string, unknown> | null,
        ) as Partial<BuildContractPrefillFieldsArgs>,
        bankDetail,
    });
    const computed = buildContractPrefillFieldsFromApplication(application, {
        agreementDate,
        contractRecords: {
            contract: effectiveContract,
            ach: contractRecords?.ach ?? null,
            bankDetail,
        },
    });
    const allowed = new Set<string>(ACH_AUTHORIZATION_EDITABLE_FIELD_IDS);
    const byId = new Map(computed.filter((f) => allowed.has(f.id)).map((f) => [f.id, f]));
    // Preserve layout placement order for the Edit ACH form modal.
    return ACH_AUTHORIZATION_EDITABLE_FIELD_IDS.map((id) => {
        const row = byId.get(id);
        return {
            id,
            label: ACH_AUTHORIZATION_FIELD_LABELS[id] || id.replace(/_/g, " "),
            value: row?.value ?? "",
        };
    });
}

export function getDocumentTemplatePrefillFieldRowsForEditor(options: {
    templateId?: string | null;
    templateName?: string | null;
    templateType?: string | null;
    templateLayoutKey?: string | null;
    templateState?: string | null;
    templateFrequency?: string | null;
    /** Contract / UI state when the template row has no `state` column set. */
    fallbackState?: string | null;
    /** Offer payment frequency when the template row has no `frequency` column set. */
    fallbackFrequency?: string | null;
    contract?: Record<string, unknown> | null;
    application?: Record<string, unknown> | null;
    /** Live Offer Decision — disclosure funding/term must track Review & open edits. */
    offerDecision?: Record<string, unknown> | null;
    contractRecords?: ContractPrefillContractRecords | null;
    agreementDate?: string;
    /** Main contract prefill overrides (excludes per-mapping blob); same source as Deal Review. */
    mainPrefillOverrides?: Partial<BuildContractPrefillFieldsArgs> | null;
    savedOverridesForMapping?: Record<string, string> | null;
    bankDetail?: Record<string, unknown> | null;
    documentType?: string | null;
    /** Forces ACH form vs addendum field set when the template row alone is ambiguous. */
    prefillDocumentKind?: "ach_form" | "addendum" | null;
}): ContractPrefillField[] {
    const effectiveContract = buildEffectiveContractForTemplatePrefill({
        contract: options.contract ?? null,
        application: options.application ?? null,
        agreementDate: options.agreementDate,
        mainPrefillOverrides: options.mainPrefillOverrides,
        bankDetail: options.bankDetail ?? null,
    });

    const sctx = buildStateDisclosurePrefillContextFromContract({
        contract: effectiveContract,
        application: options.application ?? null,
        offerDecision: options.offerDecision ?? null,
        agreementDate: options.agreementDate,
    });

    const odOfferAmount =
        parsePrefillMoneyForMerge(
            String(
                (options.offerDecision as { offer?: unknown } | null | undefined)?.offer ??
                    (options.offerDecision as { approvedAmount?: unknown } | null | undefined)
                        ?.approvedAmount ??
                    "",
            ),
        ) ??
        resolveOfferAmountDollarsForUnderwritingFees({
            contract: effectiveContract,
            application: options.application ?? undefined,
            offerDecision: options.offerDecision ?? null,
        });
    const mainOfferAmount = parsePrefillMoneyForMerge(
        String(
            (options.mainPrefillOverrides as { purchaseAmount?: unknown } | null | undefined)
                ?.purchaseAmount ??
                effectiveContract.purchaseAmount ??
                "",
        ),
    );
    // Prefer Offer Decision / synced main when they disagree with a stale mapping snapshot.
    const liveOfferAmount =
        (odOfferAmount != null && odOfferAmount > 0 ? odOfferAmount : undefined) ??
        (mainOfferAmount != null && mainOfferAmount > 0 ? mainOfferAmount : undefined);
    const liveRemitAmount = parsePrefillMoneyForMerge(
        String(
            (options.mainPrefillOverrides as { remittance?: unknown } | null | undefined)
                ?.remittance ??
                effectiveContract.remittance ??
                "",
        ),
    );
    const livePaybackAmount = parsePrefillMoneyForMerge(
        String(
            (options.mainPrefillOverrides as { purchasePrice?: unknown } | null | undefined)
                ?.purchasePrice ??
                effectiveContract.purchasePrice ??
                "",
        ),
    );

    const name = options.templateName;
    const docType = String(options.documentType ?? "").toLowerCase();
    const isAchForm =
        docType === "ach" ||
        options.prefillDocumentKind === "ach_form" ||
        (options.prefillDocumentKind !== "addendum" &&
            resolveAchAuthorizationTemplate(
                options.templateType,
                name,
                options.templateLayoutKey,
            ));

    // ACH: keep the saved mapping as the source of truth (all form tabs).
    // Live Client/Bank only gap-fills empty fields in mergeFieldRows.
    const liveFrequency = resolveOfferFrequencyLabel({
        application: options.application ?? undefined,
        contract: effectiveContract,
        offerDecision: options.offerDecision ?? null,
    });
    const { state, frequency } = resolveDisclosureStateAndFrequency({
        templateState: options.templateState,
        templateFrequency: options.templateFrequency,
        fallbackState: options.fallbackState,
        fallbackFrequency: options.fallbackFrequency,
        templateLayoutKey: options.templateLayoutKey,
        templateName: options.templateName,
        contract: effectiveContract,
    });
    const savedOverridesForMapping = isAchForm
        ? (options.savedOverridesForMapping ?? null)
        : stripStaleFrequencyFromMappingOverrides(
              stripStaleClientIdentityFromMappingOverrides(
                  stripStaleOfferMoneyFromMappingOverrides(
                      options.savedOverridesForMapping,
                      liveOfferAmount,
                      liveRemitAmount,
                      livePaybackAmount,
                      state,
                  ),
                  options.application ?? null,
              ),
              liveFrequency,
          );

    const isDisclosureDoc = docType === "disclosure";
    const templateId = options.templateId;

    // Explicit disclosure rows must use the disclosure catalog / PDF data labels
    // (same as Katan) — never fall through to ACH/addendum name matching.
    if (isDisclosureDoc) {
        const stAll = stateDisclosureAllDefs(name, state, frequency);
        if (stAll.length > 0) {
            const computed = stateDisclosureComputed(name, state, frequency, sctx);
            const savedCollapsed = collapsePdfFieldsToDisclosureEditorValues(
                savedOverridesForMapping,
            );
            return applyPlatformDisclosureFunderName(
                mergeFieldRows(stAll, computed, savedCollapsed),
            );
        }
        const fromEditor = getStateDisclosureEditorFieldDefinitions(name, state, frequency);
        if (fromEditor.length > 0) {
            const computed = stateDisclosureComputed(name, state, frequency, sctx);
            const savedCollapsed = collapsePdfFieldsToDisclosureEditorValues(
                savedOverridesForMapping,
            );
            return applyPlatformDisclosureFunderName(
                mergeFieldRows(fromEditor, computed, savedCollapsed),
            );
        }
        return [];
    }

    // ACH must win over disclosure matching: state+frequency alone would otherwise
    // return Page 3 / disclosure fields for every template on a disclosure deal.
    if (isAchForm) {
        const all = achAuthorizationAllDefs();
        const bankDetail =
            options.bankDetail ?? options.contractRecords?.bankDetail ?? null;
        const computed = achAuthorizationComputed(
            effectiveContract,
            options.application ?? null,
            options.agreementDate,
            options.mainPrefillOverrides,
            {
                ...(options.contractRecords ?? {}),
                bankDetail,
            },
        );
        return mergeFieldRows(all, computed, savedOverridesForMapping);
    }

    // Addendums must also win over disclosure matching for the same reason.
    const norm = normalizeKey(name ?? "");
    const addendum = resolveAddendumKind(
        templateId,
        norm,
        options.templateLayoutKey,
    );
    if (addendum) {
        const all = addendumAllDefs(addendum);
        const computed = addendumComputed(
            addendum,
            effectiveContract,
            sctx,
            options.application ?? null,
        );
        return mergeFieldRows(all, computed, savedOverridesForMapping);
    }

    const fromEditor = getStateDisclosureEditorFieldDefinitions(name, state, frequency);
    if (fromEditor.length > 0) {
        const computed = stateDisclosureComputed(name, state, frequency, sctx);
        const savedCollapsed = collapsePdfFieldsToDisclosureEditorValues(
            savedOverridesForMapping,
        );
        return applyPlatformDisclosureFunderName(
            mergeFieldRows(fromEditor, computed, savedCollapsed),
        );
    }

    const stAll = stateDisclosureAllDefs(name, state, frequency);
    if (stAll.length > 0) {
        const computed = stateDisclosureComputed(name, state, frequency, sctx);
        return mergeFieldRows(stAll, computed, savedOverridesForMapping);
    }

    return [];
}

function upsertPrefillFieldValue(
    byId: Map<string, ContractPrefillField>,
    id: string,
    value: string,
): void {
    const v = String(value ?? "").trim();
    if (!v) return;
    const existing = byId.get(id);
    byId.set(id, existing ? { ...existing, value: v } : { id, value: v, label: "" });
}

/**
 * Main RPA / Verify Prefill money tabs. Disclosure + addendum expansion must not
 * overwrite these when already set — shared envelope value maps feed the main contract PDF.
 */
const MAIN_CONTRACT_PROTECTED_MONEY_FIELD_IDS = new Set(
    [
        "purchase_price",
        "purchasePrice",
        "purchase_amount",
        "purchaseAmount",
        "remittance",
        "net_to_merchant",
        "NetFundProvided",
        "purchase_percent",
        "specified_percentage",
        "appendix_underwriting_fees",
        "underwriter_fee",
        "underwriterfee",
        "underwriter_fees",
        "addendum_dated_principal_owner_amount",
        "addendum_dated_principal_owner_amount2",
    ].map((id) => id.toLowerCase()),
);

function isMainContractProtectedMoneyFieldId(id: string): boolean {
    return MAIN_CONTRACT_PROTECTED_MONEY_FIELD_IDS.has(
        String(id || "")
            .trim()
            .toLowerCase(),
    );
}

/** Owner/person tabs on the main RPA — disclosure merchant expansion must never overwrite these. */
const DISCLOSURE_PROTECTED_PRIMARY_NAME_IDS = new Set(
    [
        "client_name",
        "addendum_client_name",
        "owner1_guarantor_name",
        "guaranty_owner1_name",
        "guaranty_guarantor1_name",
        "guaranty_client_name",
        "security_guarantor",
        "appendix_client_name",
        "customer_name",
    ].map((id) => id.toLowerCase()),
);

function isDisclosureProtectedPrimaryNameId(id: string): boolean {
    return DISCLOSURE_PROTECTED_PRIMARY_NAME_IDS.has(
        String(id || "")
            .trim()
            .toLowerCase(),
    );
}

/** Upsert unless this is a protected main-contract money id that already has a value. */
function upsertPrefillFieldValuePreserveMainMoney(
    byId: Map<string, ContractPrefillField>,
    id: string,
    value: string,
): void {
    const key = String(id || "").trim();
    const v = String(value ?? "").trim();
    if (!key || !v) return;
    if (isMainContractProtectedMoneyFieldId(key)) {
        const existing = String(byId.get(key)?.value ?? "").trim();
        if (existing) return;
    }
    upsertPrefillFieldValue(byId, key, v);
}

/** Standalone ACH form fee / # transactions — must not overwrite main contract page 14–15. */
function isAchFormIsolatedFeeOrTransactionFieldId(fieldId?: string | null): boolean {
    const nk = normalizeMappingFieldKey(fieldId);
    if (!nk) return false;
    return (
        nk.includes("bank_transaction_fee") ||
        nk.includes("number_of_transactions") ||
        nk === "ach_authorization_account_holder_bank_transaction_fee" ||
        nk === "ach_authorization_account_holder_bank_number_of_transactions"
    );
}

function pickBalanceTransferRemainingRtrBalance(
    ...sources: Array<Record<string, string> | null | undefined>
): string {
    for (const src of sources) {
        if (!src) continue;
        const v = String(
            src.balance_transfer_remaining_rtr_balance ??
                src.remaining_rtr_balance ??
                src.remainingRtrBalance ??
                "",
        ).trim();
        if (v) return v;
    }
    return "";
}

export function applyDocumentTemplateMappingPrefillOverrides(args: {
    prefillFieldsPayload: ContractPrefillField[];
    mergedTemplateIds: string[];
    mergedLayoutKeys?: string[];
    templateMappingRows: Array<{
        id: string;
        documentType?: string | null;
        template?: {
            id?: string;
            templateId?: string;
            layoutKey?: string | null;
            name?: string | null;
            state?: string | null;
            frequency?: string | null;
            type?: string | null;
        } | null;
    }>;
    contractPrefillOverridesRaw: unknown;
    contract?: Record<string, unknown> | null;
    application?: Record<string, unknown> | null;
    offerDecision?: Record<string, unknown> | null;
    agreementDate?: string;
    mainPrefillOverrides?: Partial<BuildContractPrefillFieldsArgs> | null;
    bankDetail?: Record<string, unknown> | null;
    /** Pass false when the contract has more than one ACH form. */
    allowAchAliasFallback?: boolean;
}): ContractPrefillField[] {
    const blob = parseDocumentTemplatePrefillByMappingId(args.contractPrefillOverridesRaw);
    const mergedSet = new Set([
        ...args.mergedTemplateIds.map((x) => String(x).trim()).filter(Boolean),
        ...(args.mergedLayoutKeys || []).map((x) => String(x).trim()).filter(Boolean),
    ]);
    const byId = new Map(args.prefillFieldsPayload.map((f) => [f.id, { ...f }]));
    // Main RPA already carries contract ACH tabs (page 14–15). Standalone ACH form
    // fee / # transactions must stay on the ACH document only.
    const baseHasMainContractAchTabs = args.prefillFieldsPayload.some((f) =>
        isAchAuthorizationPrefillKey(f.id),
    );

    for (const row of args.templateMappingRows) {
        const layoutKey = String(row.template?.layoutKey ?? "").trim();
        const tid = String(row.template?.templateId ?? "").trim();
        const templateId = String(row.template?.id ?? "").trim();
        const docType = String(row.documentType || "").trim().toLowerCase();
        const isAchMerged = [...mergedSet].some((k) =>
            /ach_authorization/i.test(String(k || "")),
        );
        const included =
            (layoutKey && mergedSet.has(layoutKey)) ||
            (tid && mergedSet.has(tid)) ||
            (templateId && mergedSet.has(templateId)) ||
            (docType === "ach" && isAchMerged) ||
            (args.templateMappingRows.length === 1 && Boolean(blob[row.id]));
        if (!included) continue;
        const isAchMappingRow =
            docType === "ach" ||
            isAchAuthorizationLayoutKey(layoutKey) ||
            normalizeKey(row.template?.type ?? "") === "ach";
        const perMap = isAchMappingRow
            ? resolveAchSavedMappingOverrides(blob, row.id, {
                  allowAliasFallback: args.allowAchAliasFallback !== false,
              })
            : (blob[row.id] ?? null);
        const computedRows = getDocumentTemplatePrefillFieldRowsForEditor({
            templateId: templateId || tid || layoutKey,
            templateName: row.template?.name ?? null,
            templateType: row.template?.type ?? null,
            templateLayoutKey: layoutKey || null,
            templateState: row.template?.state ?? null,
            templateFrequency: row.template?.frequency ?? null,
            contract: args.contract ?? null,
            application: args.application ?? null,
            offerDecision: args.offerDecision ?? null,
            agreementDate: args.agreementDate,
            mainPrefillOverrides: isAchMappingRow
                ? (stripAchAuthorizationKeysFromRecord(
                      (args.mainPrefillOverrides ?? null) as Record<string, unknown> | null,
                  ) as Partial<BuildContractPrefillFieldsArgs>)
                : args.mainPrefillOverrides,
            savedOverridesForMapping: perMap,
            bankDetail: args.bankDetail ?? null,
            documentType: row.documentType ?? null,
            prefillDocumentKind: isAchMappingRow ? "ach_form" : null,
        });
        const isDisclosureRow =
            String(row.documentType || "").toLowerCase() === "disclosure";
        const editorValues: Record<string, string> = {};
        for (const field of computedRows) {
            // Only force platform disclosure funder name on disclosure PDFs —
            // Case Takeover / other addenda must keep the selected funder.
            const v =
                isDisclosureRow && field.id === "funder_name"
                    ? PLATFORM_DISCLOSURE_FUNDER_NAME.toUpperCase()
                    : String(field.value ?? "").trim();
            if (!v) continue;
            editorValues[field.id] = v;
        }
        const fieldsToMerge = isDisclosureRow
            ? expandDisclosureEditorValuesToPdfFields(editorValues, {
                  disclosureState: row.template?.state ?? null,
              })
            : editorValues;
        for (const [id, value] of Object.entries(fieldsToMerge)) {
            if (isDisclosureRow && isDisclosureProtectedPrimaryNameId(id)) continue;
            // Keep standalone ACH form fee / #tx off the main contract ACH pages.
            if (
                isAchMappingRow &&
                baseHasMainContractAchTabs &&
                isAchFormIsolatedFeeOrTransactionFieldId(id)
            ) {
                continue;
            }
            upsertPrefillFieldValuePreserveMainMoney(byId, id, String(value ?? ""));
        }
        const addendumKind = resolveAddendumKind(
            templateId || tid || null,
            normalizeKey(row.template?.name ?? ""),
            layoutKey || null,
        );
        if (addendumKind === "balance_transfer_sheet") {
            const remaining = pickBalanceTransferRemainingRtrBalance(
                fieldsToMerge,
                perMap,
            );
            if (remaining) {
                // Dedicated BT data label — never clobber main RPA purchase_price (payback).
                upsertPrefillFieldValue(byId, "balance_transfer_remaining_rtr_balance", remaining);
                upsertPrefillFieldValue(byId, "remaining_rtr_balance", remaining);
            }
        }
    }

    const disclosureMerged = args.templateMappingRows.some((row) => {
        const templateRowId = String(row.template?.id ?? "").trim();
        return (
            String(row.documentType || "").toLowerCase() === "disclosure" &&
            Boolean(templateRowId && mergedSet.has(templateRowId))
        );
    });
    const caseTakeoverMerged = args.templateMappingRows.some((row) => {
        const layoutKey = String(row.template?.layoutKey ?? row.template?.templateId ?? "")
            .trim()
            .toLowerCase();
        const templateRowId = String(row.template?.id ?? "").trim();
        const included =
            (layoutKey && mergedSet.has(String(row.template?.layoutKey ?? "").trim())) ||
            (layoutKey && mergedSet.has(layoutKey)) ||
            (templateRowId && mergedSet.has(templateRowId)) ||
            [...mergedSet].some((k) => String(k).toLowerCase().includes("case_takeover"));
        return included && layoutKey.includes("case_takeover");
    }) || [...mergedSet].some((k) => String(k).toLowerCase().includes("case_takeover"));

    if (disclosureMerged) {
        // Do not overwrite shared `funder_name` with Woodmere when Case Takeover is
        // also merged — that addendum needs the selected funder (e.g. EJM).
        if (!caseTakeoverMerged) {
            upsertPrefillFieldValue(
                byId,
                "funder_name",
                PLATFORM_DISCLOSURE_FUNDER_NAME.toUpperCase(),
            );
        }
        const merchant = resolveMainContractBusinessNameFromPrefill(byId);
        if (merchant) {
            // Do not overwrite shared `client_name` — main contract page 2 uses it for
            // the person/client name. Disclosure merchant slots resolve via scoped ids /
            // disclosure_* fields + layout-prefill-scope business-name helpers.
            upsertPrefillFieldValue(byId, "recipient_name", merchant);
            upsertPrefillFieldValue(byId, "recipient_name2", merchant);
            upsertPrefillFieldValue(byId, "disclosure_name", merchant);
            upsertPrefillFieldValue(byId, "disclosure_merchant_name", merchant);
            upsertPrefillFieldValue(byId, "business_name", merchant);
            upsertPrefillFieldValue(byId, "disclosure_pdf__client_name", merchant);
            upsertPrefillFieldValue(byId, "disclosure_pdf__disclosure_merchant_name", merchant);
            upsertPrefillFieldValue(byId, "disclosure_pdf__disclosure_name", merchant);
            upsertPrefillFieldValue(byId, "disclosure_pdf__recipient_name", merchant);
            upsertPrefillFieldValue(byId, "disclosure_pdf__recipient_name2", merchant);
            upsertPrefillFieldValue(byId, "disclosure_pdf__business_name", merchant);
            upsertPrefillFieldValue(byId, "disclosure_client_name", merchant);
            for (let i = 1; i <= 40; i += 1) {
                upsertPrefillFieldValue(byId, `disclosure_client_name_${i}`, merchant);
                upsertPrefillFieldValue(byId, `client_name_${i}`, merchant);
            }
        }
    }

    if (caseTakeoverMerged) {
        const selectedFunder = String(
            (args.contract as Record<string, unknown> | null | undefined)?.funderName ??
                (args.mainPrefillOverrides as Record<string, unknown> | null | undefined)
                    ?.funderName ??
                "",
        ).trim();
        if (selectedFunder) {
            upsertPrefillFieldValue(byId, "funder_name", selectedFunder);
            upsertPrefillFieldValue(
                byId,
                "case_takeover_addendum_funder_name",
                selectedFunder,
            );
        }
    }

    return Array.from(byId.values());
}

/** Ensures disclosure merchant + funder names are on the send payload when a CRM disclosure PDF is merged. */
export function mergeStateDisclosurePrefillFallback(args: {
    payload: ContractPrefillField[];
    supplementalRefs: string[];
    contract?: Record<string, unknown> | null;
    application?: Record<string, unknown> | null;
    offerDecision?: Record<string, unknown> | null;
    agreementDate?: string;
    mainPrefillOverrides?: Partial<BuildContractPrefillFieldsArgs> | null;
    bankDetail?: Record<string, unknown> | null;
}): ContractPrefillField[] {
    const supplementalIds = (args.supplementalRefs || [])
        .map((x) => String(x).trim())
        .filter(Boolean);
    const hasCrmDisclosurePdf = supplementalIds.some((ref) => !isPlatformLayoutKey(ref));
    if (!hasCrmDisclosurePdf) return args.payload;

    const effectiveContract = buildEffectiveContractForTemplatePrefill({
        contract: args.contract ?? null,
        application: args.application ?? null,
        agreementDate: args.agreementDate,
        mainPrefillOverrides: args.mainPrefillOverrides,
        bankDetail: args.bankDetail ?? null,
    });

    const { state, frequency } = resolveDisclosureStateAndFrequency({
        fallbackState: str(effectiveContract.state),
        fallbackFrequency: str(
            (effectiveContract as Record<string, unknown>).disclosureFrequency ??
                (effectiveContract.offer as Record<string, unknown> | null | undefined)?.frequency,
        ),
        contract: effectiveContract,
    });
    if (!state || !frequency || !hasStateDisclosurePrefillRegistry(null, state, frequency)) {
        return args.payload;
    }

    const sctx = buildStateDisclosurePrefillContextFromContract({
        contract: effectiveContract,
        application: args.application ?? null,
        offerDecision: args.offerDecision ?? null,
        agreementDate: args.agreementDate,
    });
    const fields = getStateDisclosurePrefillFieldsByStateFrequency({
        state,
        frequency,
        context: sctx,
    });
    if (!fields.length) return args.payload;

    const byId = new Map(args.payload.map((f) => [f.id, { ...f }]));
    for (const field of fields) {
        const v = String(field.value ?? "").trim();
        if (!v) continue;
        // Never stamp disclosure merchant business name onto main-contract person slots.
        if (isDisclosureProtectedPrimaryNameId(field.id)) continue;
        const existing = byId.get(field.id);
        const existingNum = parsePrefillMoneyForMerge(existing?.value);
        if (existingNum !== undefined && existingNum > 0) continue;
        if (
            field.id === "appendix_underwriting_fees" &&
            existing !== undefined &&
            String(existing.value ?? "").trim() !== ""
        ) {
            continue;
        }
        byId.set(
            field.id,
            existing
                ? { ...existing, value: v }
                : { id: field.id, value: v, label: String(field.label ?? "").trim() },
        );
    }
    const hasCaseTakeover = supplementalIds.some((ref) =>
        /case_takeover/i.test(ref),
    );
    // Case Takeover needs the selected funder on shared `funder_name` — do not
    // overwrite with the platform disclosure name (Woodmere).
    if (!hasCaseTakeover) {
        upsertPrefillFieldValue(
            byId,
            "funder_name",
            PLATFORM_DISCLOSURE_FUNDER_NAME.toUpperCase(),
        );
    }
    const merchant =
        resolveMainContractBusinessNameFromPrefill(byId) ||
        resolveContractBusinessLegalNameForPrefill(
            effectiveContract,
            args.application ?? null,
        ) ||
        String(sctx.recipientName || "").trim();
    if (merchant) {
        // Do not overwrite shared `client_name` with merchant legal name — that field is
        // the person/client name on the main contract (e.g. page 2).
        upsertPrefillFieldValue(byId, "recipient_name", merchant);
        upsertPrefillFieldValue(byId, "recipient_name2", merchant);
        upsertPrefillFieldValue(byId, "disclosure_name", merchant);
        upsertPrefillFieldValue(byId, "disclosure_merchant_name", merchant);
        upsertPrefillFieldValue(byId, "business_name", merchant);
        upsertPrefillFieldValue(byId, "disclosure_pdf__client_name", merchant);
        upsertPrefillFieldValue(byId, "disclosure_pdf__disclosure_merchant_name", merchant);
        upsertPrefillFieldValue(byId, "disclosure_pdf__disclosure_name", merchant);
        upsertPrefillFieldValue(byId, "disclosure_pdf__recipient_name", merchant);
        upsertPrefillFieldValue(byId, "disclosure_pdf__recipient_name2", merchant);
        upsertPrefillFieldValue(byId, "disclosure_pdf__business_name", merchant);
        upsertPrefillFieldValue(byId, "disclosure_client_name", merchant);
        for (let i = 1; i <= 40; i += 1) {
            upsertPrefillFieldValue(byId, `disclosure_client_name_${i}`, merchant);
            upsertPrefillFieldValue(byId, `client_name_${i}`, merchant);
        }
    }
    return Array.from(byId.values());
}

type DisclosureMappingRow = {
    id: string;
    documentType?: string | null;
    template?: {
        id?: string;
        templateId?: string;
        layoutKey?: string | null;
        name?: string | null;
        state?: string | null;
        frequency?: string | null;
    } | null;
};

/** Expand one linked disclosure mapping row → PDF tab ids (e.g. `total_dollar_cost`). */
export function buildExpandedDisclosurePrefillFieldsForMapping(args: {
    mappingRow: DisclosureMappingRow | null | undefined;
    savedOverridesForMapping?: Record<string, string> | null;
    contract?: Record<string, unknown> | null;
    application?: Record<string, unknown> | null;
    offerDecision?: Record<string, unknown> | null;
    agreementDate?: string;
    mainPrefillOverrides?: Partial<BuildContractPrefillFieldsArgs> | null;
    bankDetail?: Record<string, unknown> | null;
}): Array<{ id: string; value: string }> {
    const row = args.mappingRow;
    if (!row || String(row.documentType || "").toLowerCase() !== "disclosure") {
        return [];
    }

    const templateId = String(row.template?.id ?? "").trim();
    const tid = String(row.template?.templateId ?? "").trim();
    const layoutKey = String(row.template?.layoutKey ?? "").trim();

    const computedRows = getDocumentTemplatePrefillFieldRowsForEditor({
        templateId: templateId || tid || layoutKey,
        templateName: row.template?.name ?? null,
        templateState: row.template?.state ?? null,
        templateFrequency: row.template?.frequency ?? null,
        contract: args.contract ?? null,
        application: args.application ?? null,
        offerDecision: args.offerDecision ?? null,
        agreementDate: args.agreementDate,
        mainPrefillOverrides: args.mainPrefillOverrides,
        savedOverridesForMapping: args.savedOverridesForMapping ?? null,
        bankDetail: args.bankDetail ?? null,
        documentType: "disclosure",
    });

    const editorValues: Record<string, string> = {};
    for (const field of computedRows) {
        const v =
            field.id === "funder_name"
                ? PLATFORM_DISCLOSURE_FUNDER_NAME.toUpperCase()
                : String(field.value ?? "").trim();
        if (!v) continue;
        editorValues[field.id] = v;
    }

    const expanded = expandDisclosureEditorValuesToPdfFields(editorValues, {
        disclosureState: row.template?.state ?? null,
    });

    const templateState = String(row.template?.state ?? "").trim();
    if (isTexasDisclosureState(templateState)) {
        const liveOfferAmount =
            parsePrefillMoneyForMerge(
                String(
                    editorValues.funding_provided ??
                        editorValues.disclosure_purchase_price ??
                        (args.mainPrefillOverrides as { purchaseAmount?: unknown } | null | undefined)
                            ?.purchaseAmount ??
                        (args.offerDecision as { offer?: unknown } | null | undefined)?.offer ??
                        "",
                ),
            ) ??
            resolveOfferAmountDollarsForUnderwritingFees({
                contract: args.contract ?? null,
                application: args.application ?? undefined,
                offerDecision: args.offerDecision ?? null,
            });
        if (liveOfferAmount != null && liveOfferAmount > 0) {
            const texasOffer = formatDisclosureUsd(liveOfferAmount);
            for (const slot of ["total_amount_of_fund_disbursed", "total_amount_fund_disbursed"] as const) {
                expanded[slot] = texasOffer;
                expanded[`disclosure_${slot}`] = texasOffer;
                expanded[`disclosure_pdf__${slot}`] = texasOffer;
                for (let i = 1; i <= 40; i += 1) {
                    expanded[`${slot}_${i}`] = texasOffer;
                    expanded[`disclosure_${slot}_${i}`] = texasOffer;
                    expanded[`disclosure_pdf__${slot}_${i}`] = texasOffer;
                }
            }
        }
    }
    if (isVirginiaDisclosureState(templateState)) {
        const liveOfferAmount =
            parsePrefillMoneyForMerge(
                String(
                    editorValues.funding_provided ??
                        editorValues.disclosure_purchase_price ??
                        (args.mainPrefillOverrides as { purchaseAmount?: unknown } | null | undefined)
                            ?.purchaseAmount ??
                        (args.offerDecision as { offer?: unknown } | null | undefined)?.offer ??
                        "",
                ),
            ) ??
            resolveOfferAmountDollarsForUnderwritingFees({
                contract: args.contract ?? null,
                application: args.application ?? undefined,
                offerDecision: args.offerDecision ?? null,
            });
        const liveFees = parsePrefillMoneyForMerge(
            String(
                editorValues.disclosure_fees_deducted ??
                    (args.mainPrefillOverrides as { appendixUnderwritingFees?: unknown } | null)
                        ?.appendixUnderwritingFees ??
                    "",
            ),
        );
        if (liveOfferAmount != null && liveOfferAmount > 0) {
            const virginiaOffer = formatDisclosureUsd(liveOfferAmount);
            for (const slot of ["total_amount_sales_based_financing"] as const) {
                expanded[slot] = virginiaOffer;
                expanded[`disclosure_${slot}`] = virginiaOffer;
                expanded[`disclosure_pdf__${slot}`] = virginiaOffer;
                for (let i = 1; i <= 40; i += 1) {
                    expanded[`${slot}_${i}`] = virginiaOffer;
                    expanded[`disclosure_${slot}_${i}`] = virginiaOffer;
                    expanded[`disclosure_pdf__${slot}_${i}`] = virginiaOffer;
                }
            }
            const liveNet = parsePrefillMoneyForMerge(
                String(editorValues.disclosure_funding_disbursed ?? ""),
            );
            let virginiaNet =
                liveNet != null && liveNet > 0 ? formatDisclosureUsd(liveNet) : "";
            if (
                !virginiaNet &&
                liveFees != null &&
                liveFees > 0 &&
                liveOfferAmount > liveFees
            ) {
                virginiaNet = formatDisclosureUsd(Math.max(0, liveOfferAmount - liveFees));
            }
            if (virginiaNet) {
                for (const slot of ["disbursement_amount"] as const) {
                    expanded[slot] = virginiaNet;
                    expanded[`disclosure_${slot}`] = virginiaNet;
                    expanded[`disclosure_pdf__${slot}`] = virginiaNet;
                    for (let i = 1; i <= 40; i += 1) {
                        expanded[`${slot}_${i}`] = virginiaNet;
                        expanded[`disclosure_${slot}_${i}`] = virginiaNet;
                        expanded[`disclosure_pdf__${slot}_${i}`] = virginiaNet;
                    }
                }
            }
        }
    }
    if (isUtahDisclosureState(templateState)) {
        // Use the same stale-offer strip as the editor so Utah keys don't re-inject old money.
        const liveOfferAmount =
            parsePrefillMoneyForMerge(
                String(
                    (args.mainPrefillOverrides as { purchaseAmount?: unknown } | null | undefined)
                        ?.purchaseAmount ??
                        (args.offerDecision as { offer?: unknown } | null | undefined)?.offer ??
                        "",
                ),
            ) ??
            resolveOfferAmountDollarsForUnderwritingFees({
                contract: args.contract ?? null,
                application: args.application ?? undefined,
                offerDecision: args.offerDecision ?? null,
            });
        const strippedSaved = stripStaleClientIdentityFromMappingOverrides(
            stripStaleOfferMoneyFromMappingOverrides(
                args.savedOverridesForMapping ?? {},
                liveOfferAmount,
                parsePrefillMoneyForMerge(
                    String(
                        (args.mainPrefillOverrides as { remittance?: unknown } | null | undefined)
                            ?.remittance ?? "",
                    ),
                ),
                parsePrefillMoneyForMerge(
                    String(
                        (args.mainPrefillOverrides as { purchasePrice?: unknown } | null | undefined)
                            ?.purchasePrice ?? "",
                    ),
                ),
            ),
            args.application ?? null,
        );
        const raw = strippedSaved ?? {};
        const brokerFee = String(
            raw.disclosure_broker_fee ?? expanded.appendix_underwriting_fees ?? "",
        ).trim();
        if (brokerFee) {
            expanded.appendix_underwriting_fees = brokerFee;
        }
        const utahPdfKeys = [
            "purchase_amount",
            "net_to_merchant",
            "purchase_price",
            "finance_charge",
            "remittance",
            "monthly_income",
            "payment_terms_percent",
            "payment_exceed_percent",
            "disclosure_payment_terms",
        ] as const;
        for (const key of utahPdfKeys) {
            const fromRaw = String(raw[key] ?? "").trim();
            if (fromRaw) expanded[key] = fromRaw;
        }
    }

    return Object.entries(expanded)
        .map(([id, value]) => ({ id, value: String(value ?? "").trim() }))
        .filter((f) => f.id && f.value && !isDisclosureProtectedPrimaryNameId(f.id));
}

/** Merge expanded disclosure PDF fields into a DocuSign prefill payload (by field id). */
export function mergeExpandedDisclosurePrefillIntoPayload(
    payload: ContractPrefillField[],
    disclosureFields: Array<{ id: string; value: string; label?: string }>,
): ContractPrefillField[] {
    if (!disclosureFields.length) return payload;
    const byId = new Map(payload.map((f) => [f.id, { ...f }]));
    for (const field of disclosureFields) {
        const id = String(field.id ?? "").trim();
        const v = String(field.value ?? "").trim();
        if (!id || !v) continue;
        if (isDisclosureProtectedPrimaryNameId(id)) continue;
        // Cadence-only slots: never let disclosure % (e.g. "0.00%") overwrite Daily/Weekly.
        const idNorm = id.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (
            (idNorm === "frequency" || idNorm === "paymentterms") &&
            /%/.test(v)
        ) {
            continue;
        }
        // Disclosure must not overwrite shared `funder_name` when Case Takeover (or
        // another addendum) already set the selected funder via its scoped CRM key.
        if (
            id === "funder_name" &&
            (byId.has("case_takeover_addendum_funder_name") ||
                [...byId.keys()].some((k) =>
                    String(k).toLowerCase().includes("case_takeover"),
                ))
        ) {
            continue;
        }
        const existing = byId.get(id);
        const existingVal = String(existing?.value ?? "").trim();
        // Verify Prefill / Final Calculation money on the main RPA must win over
        // disclosure calculator aliases (purchase_price, remittance, etc.).
        if (isMainContractProtectedMoneyFieldId(id) && existingVal) {
            continue;
        }
        const existingNum = parsePrefillMoneyForMerge(existing?.value);
        const incomingNum = parsePrefillMoneyForMerge(v);
        if (
            existingNum !== undefined &&
            existingNum > 0 &&
            incomingNum !== undefined &&
            incomingNum === 0
        ) {
            continue;
        }
        byId.set(
            id,
            existing
                ? { ...existing, value: v }
                : { id, value: v, label: String(field.label ?? "").trim() },
        );
    }
    return Array.from(byId.values());
}
