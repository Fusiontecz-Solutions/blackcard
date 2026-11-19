import {
    formatAchAuthorizationCapsuleLabel,
    formatAchAuthorizationTableLabel,
    mapInternalEnvelopeStatusToAchCapsule,
    parseAchAuthorizationDocuSignFromPrefill,
    parseAchSendHistoryFromPrefill,
    type AchAuthorizationDocuSignCapsuleStatus,
} from "./achAuthorizationDocuSign";
import {
    formatStandalonePackageSendLabel,
    formatStandalonePackageTableStatusLabel,
    listStandalonePackageDocumentLabels,
    parseStandalonePackageDocuSignFromPrefill,
    parseStandalonePackageSendHistoryFromPrefill,
    type StandalonePackageDocuSignCapsuleStatus,
    type StandalonePackageDocuSignMeta,
} from "./standalonePackageDocuSign";
import {
    isAchEnvelopeDraftLikeStatus,
    parseDocumentSendHistory,
    parseDocumentTemplateEnvelopeByMappingId,
    parseLastAchSentFunder,
} from "./documentTemplateMappingPrefill";
import { ACH_PREFILL_MAPPING_ALIAS_KEY } from "./achFormEditConfig";

/** Prior main-contract DocuSign sends — stored on `Contract.contractPrefillOverrides`. */
export const CONTRACT_SEND_HISTORY_KEY = "contractSendHistory";

/** Documents included in the current main-contract DocuSign envelope (for separate table rows). */
export const MAIN_CONTRACT_SEND_PACKAGE_KEY = "mainContractSendPackage";

/** Map of envelopeId → CRM DocuSign notification resends (same envelope). */
export const DOCUSIGN_ENVELOPE_RESENDS_KEY = "docusignEnvelopeResends";

export type EnvelopeResendMetaEntry = {
    lastResentAt: string;
    resentCount: number;
    /** All CRM resend timestamps (oldest → newest). */
    resentAtHistory: string[];
};

export type EnvelopeResendMetaMap = Record<string, EnvelopeResendMetaEntry>;

function normalizeResentAtHistory(
    rawHistory: unknown,
    lastResentAt: string,
    resentCount: number,
): string[] {
    const fromArray = Array.isArray(rawHistory)
        ? rawHistory.map((v) => String(v ?? "").trim()).filter(Boolean)
        : [];
    if (fromArray.length) return fromArray;
    if (!lastResentAt) return [];
    if (resentCount <= 1) return [lastResentAt];
    return Array.from({ length: resentCount }, () => lastResentAt);
}

export function parseEnvelopeResendMetaFromPrefill(raw: unknown): EnvelopeResendMetaMap {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const blob = (raw as Record<string, unknown>)[DOCUSIGN_ENVELOPE_RESENDS_KEY];
    if (blob == null || typeof blob !== "object" || Array.isArray(blob)) return {};
    const out: EnvelopeResendMetaMap = {};
    for (const [envelopeId, value] of Object.entries(blob as Record<string, unknown>)) {
        const eid = String(envelopeId ?? "").trim();
        if (!eid || value == null || typeof value !== "object" || Array.isArray(value)) continue;
        const o = value as Record<string, unknown>;
        const lastResentAt = String(o.lastResentAt ?? "").trim();
        if (!lastResentAt) continue;
        const count = Number(o.resentCount);
        const resentCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
        const resentAtHistory = normalizeResentAtHistory(
            o.resentAtHistory,
            lastResentAt,
            resentCount,
        );
        out[eid] = {
            lastResentAt: resentAtHistory[resentAtHistory.length - 1] || lastResentAt,
            resentCount: Math.max(resentCount, resentAtHistory.length),
            resentAtHistory,
        };
    }
    return out;
}

/** Prefill JSON keys that must survive FE rebuilds so Contracts Generated keeps history. */
export const DOCUSIGN_ENVELOPE_PREFILL_META_KEYS = [
    CONTRACT_SEND_HISTORY_KEY,
    MAIN_CONTRACT_SEND_PACKAGE_KEY,
    "achAuthorizationDocuSign",
    "achSendHistory",
    "standalonePackageDocuSign",
    "standalonePackageSendHistory",
    "documentSendHistory",
    "documentTemplateEnvelopeByMappingId",
    "documentTemplatePrefillByMappingId",
    "lastAchSentFunder",
    "contractSignerOverrides",
    DOCUSIGN_ENVELOPE_RESENDS_KEY,
] as const;

/** Copy DocuSign history / capsule keys from an existing prefill blob. */
export function pickPreservedDocuSignEnvelopeMetaFromPrefill(
    raw: unknown,
): Record<string, unknown> {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const o = raw as Record<string, unknown>;
    const preserved: Record<string, unknown> = {};
    for (const key of DOCUSIGN_ENVELOPE_PREFILL_META_KEYS) {
        if (o[key] !== undefined) preserved[key] = o[key];
    }
    return preserved;
}

export type MainContractSendPackageMeta = {
    envelopeId: string;
    includeMainContract?: boolean;
    includeAddendum?: boolean;
    includeDisclosure?: boolean;
    termsSnapshot?: ContractSendHistoryTermsSnapshot | null;
};

/** Contract terms captured when a main-contract envelope is sent/archived. */
export type ContractSendHistoryTermsSnapshot = {
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

export type ContractSendHistoryEntry = {
    envelopeId: string;
    status: string;
    sentAt?: string | null;
    completedAt?: string | null;
    archivedAt: string;
    package?: MainContractSendPackageMeta;
    /** DocuSign sender funder at send time (may differ from current contract funder). */
    funderName?: string | null;
    funderProfileId?: string | null;
    /** Contract terms at send time — keeps history rows from reflecting later edits. */
    termsSnapshot?: ContractSendHistoryTermsSnapshot | null;
};

export type ContractSendTableRowKind = "contract" | "ach" | "package";

/** Document identity within an envelope row (package envelopes may emit multiple rows). */
export type ContractSendTableDocumentKind =
    | "contract"
    | "ach"
    | "addendum"
    | "disclosure"
    | "package";

export type ContractSendTableRow = {
    rowType: ContractSendTableRowKind;
    key: string;
    label: string;
    envelopeId: string | null;
    contractStatus: unknown;
    documentStatus: unknown;
    sentAt: unknown;
    /** Last CRM-triggered DocuSign notification resend for this envelope (ISO). */
    lastResentAt?: string | null;
    /** How many times CRM resent this envelope's signing email. */
    resentCount?: number;
    /** All CRM resend timestamps (oldest → newest). */
    resentAtHistory?: string[];
    isCurrent: boolean;
    /** Present when `rowType === "ach"`. */
    achStatus?: AchAuthorizationDocuSignCapsuleStatus;
    /** Present when `rowType === "package"`. */
    packageStatus?: StandalonePackageDocuSignCapsuleStatus;
    /** Which document this row represents (addendum/disclosure stay separate). */
    documentKind?: ContractSendTableDocumentKind;
    /** DocuSign sender funder — may differ from contract funder (e.g. ACH). */
    funderName?: string | null;
    funderProfileId?: string | null;
    /**
     * Terms frozen for this envelope row (send-time).
     * Used by Contracts Generated so prior and current sends keep their own amounts.
     */
    termsSnapshot?: ContractSendHistoryTermsSnapshot | null;
};

/** Prefer send-time terms when present; live contract is only a display fallback. */
export function getContractSendRowTermsSnapshot(
    row: ContractSendTableRow | null | undefined,
): ContractSendHistoryTermsSnapshot | null {
    if (!row) return null;
    const snap = row.termsSnapshot;
    return snap != null && typeof snap === "object" ? snap : null;
}

function toSnapshotNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "object" && value !== null && "toNumber" in value) {
        const n = Number((value as { toNumber: () => number }).toNumber());
        return Number.isFinite(n) ? n : null;
    }
    const n = Number(String(value).replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
}

function parseTermsSnapshotFromUnknown(
    raw: unknown,
): ContractSendHistoryTermsSnapshot | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const snapshot: ContractSendHistoryTermsSnapshot = {
        approvedAmount: toSnapshotNumber(o.approvedAmount),
        totalAmount: toSnapshotNumber(o.totalAmount),
        contractLength: toSnapshotNumber(o.contractLength),
        term: o.term != null ? String(o.term) : null,
        position: o.position != null ? String(o.position) : null,
        buyRate: toSnapshotNumber(o.buyRate),
        factorRate: toSnapshotNumber(o.factorRate),
        paymentAmount: toSnapshotNumber(o.paymentAmount),
        paybackAmount: toSnapshotNumber(o.paybackAmount),
        percentOfGross: toSnapshotNumber(o.percentOfGross),
    };
    const hasAny = Object.values(snapshot).some((v) => v != null && v !== "");
    return hasAny ? snapshot : null;
}

/** Capture live contract/offer terms for a new envelope (immutable after first write). */
export function buildContractSendHistoryTermsSnapshot(
    contract: Record<string, unknown> | null | undefined,
): ContractSendHistoryTermsSnapshot | null {
    if (!contract) return null;
    const terms = Array.isArray(contract.termsOffers)
        ? (contract.termsOffers[0] as Record<string, unknown> | undefined)
        : undefined;
    const offer =
        contract.offer != null && typeof contract.offer === "object"
            ? (contract.offer as Record<string, unknown>)
            : null;
    const overridesRaw = contract.contractPrefillOverrides;
    const overrides =
        overridesRaw != null && typeof overridesRaw === "object" && !Array.isArray(overridesRaw)
            ? (overridesRaw as Record<string, unknown>)
            : null;
    /** Prefer Verify Prefill / DocuSign tab amounts — those are what the sent PDF used. */
    const prefillOffer = toSnapshotNumber(overrides?.purchaseAmount);
    const prefillPayback = toSnapshotNumber(overrides?.purchasePrice);
    const prefillPayment = toSnapshotNumber(overrides?.remittance);
    const approvedAmount =
        prefillOffer ??
        toSnapshotNumber(contract.approvedAmount) ??
        toSnapshotNumber(contract.purchaseAmount) ??
        toSnapshotNumber(terms?.approvedAmount) ??
        toSnapshotNumber(offer?.offer);
    const factorRate =
        toSnapshotNumber(terms?.factorRate) ??
        toSnapshotNumber(offer?.factorRate) ??
        toSnapshotNumber(offer?.rate);
    const snapshot: ContractSendHistoryTermsSnapshot = {
        approvedAmount,
        totalAmount:
            prefillPayback ??
            toSnapshotNumber(contract.totalAmount) ??
            toSnapshotNumber(terms?.paybackAmount) ??
            toSnapshotNumber(offer?.paybackAmount) ??
            // Only accept totalRemit when it looks like dollars (>= advance), not "our remit".
            (() => {
                const tr = toSnapshotNumber(offer?.totalRemit);
                if (approvedAmount != null && tr != null && tr >= approvedAmount) return tr;
                return null;
            })(),
        contractLength:
            toSnapshotNumber(contract.contractLenght) ??
            toSnapshotNumber(terms?.termLength),
        term:
            offer?.term != null
                ? String(offer.term)
                : overrides?.achAuthorizationAccountHolderBankNumberOfTransactions != null
                  ? String(overrides.achAuthorizationAccountHolderBankNumberOfTransactions)
                  : null,
        position: terms?.position != null ? String(terms.position) : null,
        buyRate: toSnapshotNumber(terms?.buyRate) ?? toSnapshotNumber(offer?.rate),
        factorRate,
        paymentAmount:
            prefillPayment ??
            toSnapshotNumber(terms?.paymentAmount) ??
            toSnapshotNumber(offer?.repayPerPeriod) ??
            toSnapshotNumber(offer?.daysWeeks),
        paybackAmount:
            prefillPayback ??
            toSnapshotNumber(terms?.paybackAmount) ??
            toSnapshotNumber(offer?.paybackAmount) ??
            (() => {
                if (approvedAmount != null && factorRate != null && factorRate > 1) {
                    return Math.round(approvedAmount * factorRate * 100) / 100;
                }
                const tr = toSnapshotNumber(offer?.totalRemit);
                if (approvedAmount != null && tr != null && tr >= approvedAmount) return tr;
                return null;
            })(),
        percentOfGross: toSnapshotNumber(terms?.percentOfGross),
    };
    const hasAny = Object.values(snapshot).some((v) => v != null && v !== "");
    return hasAny ? snapshot : null;
}

/** Read a frozen snapshot already stored on history / package for this envelope. */
export function resolveTermsSnapshotFromContractPrefill(
    raw: unknown,
    envelopeId: string,
): ContractSendHistoryTermsSnapshot | null {
    const eid = String(envelopeId || "").trim();
    if (!eid || raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return null;
    }
    const o = raw as Record<string, unknown>;

    for (const key of [CONTRACT_SEND_HISTORY_KEY, "documentSendHistory"]) {
        const list = o[key];
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
            const row = entry as Record<string, unknown>;
            if (String(row.envelopeId ?? "").trim() !== eid) continue;
            const snap = parseTermsSnapshotFromUnknown(row.termsSnapshot);
            if (snap) return snap;
        }
    }

    const pkg = o[MAIN_CONTRACT_SEND_PACKAGE_KEY];
    if (pkg && typeof pkg === "object" && !Array.isArray(pkg)) {
        const b = pkg as Record<string, unknown>;
        if (String(b.envelopeId ?? "").trim() === eid) {
            const snap = parseTermsSnapshotFromUnknown(b.termsSnapshot);
            if (snap) return snap;
        }
    }

    return null;
}

export function resolveContractSendRowFunderAuth(
    contract: Record<string, unknown> | null | undefined,
    row: ContractSendTableRow,
): {
    funderName?: string;
    funderProfileId?: string;
    contractState?: string;
} {
    const envelopeId = String(row.envelopeId ?? "").trim();
    const contractState = String((contract as { state?: unknown })?.state ?? "").trim();
    const withState = (auth: {
        funderName?: string;
        funderProfileId?: string;
    }) => ({
        ...auth,
        ...(contractState ? { contractState } : {}),
    });

    if (row.funderName || row.funderProfileId) {
        return withState({
            ...(row.funderName ? { funderName: String(row.funderName).trim() } : {}),
            ...(row.funderProfileId
                ? { funderProfileId: String(row.funderProfileId).trim() }
                : {}),
        });
    }

    const prefill = contract?.contractPrefillOverrides;
    if (envelopeId) {
        const fromContractHistory = parseContractSendHistoryFromPrefill(prefill).find(
            (h) => String(h.envelopeId ?? "").trim() === envelopeId,
        );
        if (fromContractHistory?.funderName || fromContractHistory?.funderProfileId) {
            return withState({
                ...(fromContractHistory.funderName
                    ? { funderName: fromContractHistory.funderName }
                    : {}),
                ...(fromContractHistory.funderProfileId
                    ? { funderProfileId: fromContractHistory.funderProfileId }
                    : {}),
            });
        }
        const fromHistory = parseDocumentSendHistory(prefill).find(
            (h) => String(h.envelopeId ?? "").trim() === envelopeId,
        );
        if (fromHistory?.funderName || fromHistory?.funderProfileId) {
            return withState({
                ...(fromHistory.funderName ? { funderName: fromHistory.funderName } : {}),
                ...(fromHistory.funderProfileId
                    ? { funderProfileId: fromHistory.funderProfileId }
                    : {}),
            });
        }
        const lastAch = parseLastAchSentFunder(prefill);
        if (lastAch && lastAch.envelopeId && lastAch.envelopeId === envelopeId) {
            return withState({
                funderName: lastAch.funderName,
                ...(lastAch.funderProfileId ? { funderProfileId: lastAch.funderProfileId } : {}),
            });
        }
    }

    // For ACH rows, never guess the contract funder — backend will try linked DocuSign accounts.
    if (row.rowType === "ach") {
        return withState({});
    }

    const contractFunder = String((contract as { funderName?: unknown })?.funderName ?? "").trim();
    return withState({
        ...(contractFunder ? { funderName: contractFunder } : {}),
    });
}

export function pickContractEnvelopeDocument(
    contract: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
    const app = contract?.application;
    const doc =
        app && typeof app === "object"
            ? (app as { document?: unknown }).document
            : null;
    return doc && typeof doc === "object" ? (doc as Record<string, unknown>) : null;
}

export function isContractFullySigned(
    contractStatus: unknown,
    documentStatus?: unknown,
): boolean {
    const cs = String(contractStatus ?? "").trim().toUpperCase();
    const ds = String(documentStatus ?? "").trim().toLowerCase();
    if (cs === "COMPLETED" || cs === "SIGNED") return true;
    // DocuSign often reports "signed" before/alongside CRM COMPLETED — stop further checks.
    if (ds === "completed" || ds === "signed") return true;
    return false;
}

/** True when the main contract envelope is fully signed or voided (no manual refresh needed). */
export function isContractSigningFinished(
    contract: Record<string, unknown> | null | undefined,
): boolean {
    if (!contract) return false;
    const doc = pickContractEnvelopeDocument(contract);
    const contractStatus = (contract as { status?: unknown }).status;
    const documentStatus = doc?.status;
    if (isContractFullySigned(contractStatus, documentStatus)) return true;
    return isContractVoidedOrTerminal(contractStatus, documentStatus);
}

export function isAchSigningFinished(
    status: AchAuthorizationDocuSignCapsuleStatus | null | undefined,
): boolean {
    return status === "SIGNED" || status === "VOIDED";
}

export function formatAchTableStatusLabel(
    meta: { envelopeId?: string | null; status?: AchAuthorizationDocuSignCapsuleStatus } | null,
): string {
    if (!meta?.envelopeId) return "Pending";
    // Drafts are filtered from Contracts Generated — do not surface Draft here.
    if (meta.status === "DRAFT") return "Pending";
    if (meta.status === "VOIDED") return "Voided";
    return formatAchAuthorizationCapsuleLabel(meta.status ?? "DRAFT");
}

/** Voided / declined / expired — eligible for a fresh send, not void or in-flight resend. */
export function isContractVoidedOrTerminal(
    contractStatus: unknown,
    documentStatus?: unknown,
): boolean {
    const cs = String(contractStatus ?? "").trim().toUpperCase();
    const ds = String(documentStatus ?? "").trim().toLowerCase();
    if (["REVOKED", "DECLINED", "EXPIRED", "VOIDED"].includes(cs)) return true;
    if (["revoked", "voided", "declined", "expired"].includes(ds)) return true;
    return false;
}

/**
 * Sent or viewed but not fully signed — can void, or send a new envelope
 * (send-new voids the open envelope first).
 */
export function isContractOutForSignature(
    contract: Record<string, unknown> | null | undefined,
    sessionSentAt?: Date | null,
): boolean {
    if (!contract) return false;
    const doc = pickContractEnvelopeDocument(contract);
    const contractStatus = (contract as { status?: unknown }).status;
    const documentStatus = doc?.status;
    if (isContractFullySigned(contractStatus, documentStatus)) return false;
    if (isContractVoidedOrTerminal(contractStatus, documentStatus)) return false;

    if (sessionSentAt) return true;

    const cs = String(contractStatus ?? "").trim().toUpperCase();
    if (["SENT", "VIEWED"].includes(cs)) return true;

    if (!doc) return false;
    if (doc.sentAt) return true;
    const ds = String(documentStatus ?? "").trim().toLowerCase();
    if (["sent", "viewed", "delivered"].includes(ds)) return true;
    return false;
}

export function canVoidMainContract(
    contract: Record<string, unknown> | null | undefined,
    sessionSentAt?: Date | null,
): boolean {
    const doc = pickContractEnvelopeDocument(contract);
    const envelopeId = String(doc?.envelopeId ?? "").trim();
    if (!envelopeId) return false;
    return isContractOutForSignature(contract, sessionSentAt);
}

/** Draft or never sent — open Review & send (not while out for signature or signed). */
export function canSendMainContract(
    contract: Record<string, unknown> | null | undefined,
    sessionSentAt?: Date | null,
): boolean {
    if (!contract) return false;
    const doc = pickContractEnvelopeDocument(contract);
    const contractStatus = (contract as { status?: unknown }).status;
    const documentStatus = doc?.status;
    if (isContractFullySigned(contractStatus, documentStatus)) return false;
    if (isContractOutForSignature(contract, sessionSentAt)) return false;
    return true;
}

/**
 * New envelope after fully signed, or while out for signature
 * (creates a new envelope without voiding the previous one).
 */
export function canResendMainContract(
    contract: Record<string, unknown> | null | undefined,
    sessionSentAt?: Date | null,
): boolean {
    if (!contract) return false;
    if (isContractOutForSignature(contract, sessionSentAt)) return true;
    const doc = pickContractEnvelopeDocument(contract);
    return isContractFullySigned(
        (contract as { status?: unknown }).status,
        doc?.status,
    );
}

export function parseContractSendHistoryFromPrefill(raw: unknown): ContractSendHistoryEntry[] {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
    const list = (raw as Record<string, unknown>)[CONTRACT_SEND_HISTORY_KEY];
    if (!Array.isArray(list)) return [];
    const out: ContractSendHistoryEntry[] = [];
    for (const item of list) {
        if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
        const o = item as Record<string, unknown>;
        const envelopeId = String(o.envelopeId ?? "").trim();
        if (!envelopeId) continue;
        const pkgRaw = o.package;
        const packageMeta =
            pkgRaw != null && typeof pkgRaw === "object" && !Array.isArray(pkgRaw)
                ? {
                      envelopeId,
                      includeMainContract: Boolean(
                          (pkgRaw as Record<string, unknown>).includeMainContract ?? true,
                      ),
                      includeAddendum: Boolean(
                          (pkgRaw as Record<string, unknown>).includeAddendum,
                      ),
                      includeDisclosure: Boolean(
                          (pkgRaw as Record<string, unknown>).includeDisclosure,
                      ),
                  }
                : undefined;
        const snapRaw = o.termsSnapshot;
        const termsSnapshot = parseTermsSnapshotFromUnknown(snapRaw);
        out.push({
            envelopeId,
            status: String(o.status ?? "draft").trim().toLowerCase(),
            sentAt: o.sentAt != null ? String(o.sentAt) : null,
            completedAt: o.completedAt != null ? String(o.completedAt) : null,
            archivedAt: String(o.archivedAt ?? ""),
            package: packageMeta,
            funderName: String(o.funderName ?? "").trim() || null,
            funderProfileId: String(o.funderProfileId ?? "").trim() || null,
            termsSnapshot,
        });
    }
    return out;
}

/**
 * Attach / preserve a frozen termsSnapshot on contractSendHistory for this envelope.
 * Used at send time so archive/resend still has the amounts after the live offer changes.
 * Pass `forceTermsSnapshot: true` when the envelope is actually sent so draft-time
 * amounts are replaced with the values that went out on the PDF.
 */
export function upsertContractSendHistoryTermsSnapshot(
    baseRaw: unknown,
    args: {
        envelopeId: string;
        status?: string | null;
        sentAt?: string | null;
        termsSnapshot?: ContractSendHistoryTermsSnapshot | null;
        package?: ContractSendHistoryEntry["package"];
        funderName?: string | null;
        funderProfileId?: string | null;
        /** When true, replace any prior snapshot (use on DocuSign "sent"). */
        forceTermsSnapshot?: boolean;
    },
): Record<string, unknown> {
    const base =
        baseRaw && typeof baseRaw === "object" && !Array.isArray(baseRaw)
            ? { ...(baseRaw as Record<string, unknown>) }
            : {};
    const envelopeId = String(args.envelopeId ?? "").trim();
    if (!envelopeId) return base;
    const prior = parseContractSendHistoryFromPrefill(base);
    const existing = prior.find((row) => row.envelopeId === envelopeId);
    const incomingSnap = parseTermsSnapshotFromUnknown(args.termsSnapshot);
    const nextSnap = args.forceTermsSnapshot
        ? (incomingSnap ?? existing?.termsSnapshot ?? null)
        : (existing?.termsSnapshot ?? incomingSnap ?? null);
    const next: ContractSendHistoryEntry = {
        envelopeId,
        status: String(args.status ?? existing?.status ?? "draft").trim().toLowerCase(),
        sentAt: args.sentAt !== undefined ? args.sentAt : (existing?.sentAt ?? null),
        completedAt: existing?.completedAt ?? null,
        archivedAt: existing?.archivedAt || new Date().toISOString(),
        termsSnapshot: nextSnap,
        package: args.package !== undefined ? args.package : existing?.package,
        funderName:
            args.funderName !== undefined
                ? String(args.funderName ?? "").trim() || null
                : (existing?.funderName ?? null),
        funderProfileId:
            args.funderProfileId !== undefined
                ? String(args.funderProfileId ?? "").trim() || null
                : (existing?.funderProfileId ?? null),
    };
    const nextHistory = existing
        ? prior.map((row) => (row.envelopeId === envelopeId ? next : row))
        : [...prior, next];
    return {
        ...base,
        [CONTRACT_SEND_HISTORY_KEY]: nextHistory,
    };
}

export function parseMainContractSendPackageFromPrefill(
    raw: unknown,
    options?: { envelopeId?: string | null },
): MainContractSendPackageMeta | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const blob = (raw as Record<string, unknown>)[MAIN_CONTRACT_SEND_PACKAGE_KEY];
    if (blob == null || typeof blob !== "object" || Array.isArray(blob)) return null;
    const o = blob as Record<string, unknown>;
    const envelopeId = String(o.envelopeId ?? "").trim();
    if (!envelopeId) return null;
    const expected = String(options?.envelopeId ?? "").trim();
    if (expected && envelopeId !== expected) return null;
    return {
        envelopeId,
        includeMainContract: o.includeMainContract !== false,
        includeAddendum: Boolean(o.includeAddendum),
        includeDisclosure: Boolean(o.includeDisclosure),
    };
}

export function mergeMainContractSendPackageIntoPrefill(
    baseRaw: unknown,
    packageMeta: MainContractSendPackageMeta,
): Record<string, unknown> {
    const base =
        baseRaw && typeof baseRaw === "object" && !Array.isArray(baseRaw)
            ? { ...(baseRaw as Record<string, unknown>) }
            : {};
    const envelopeId = String(packageMeta.envelopeId ?? "").trim();
    if (!envelopeId) return base;
    const incomingSnap = parseTermsSnapshotFromUnknown(packageMeta.termsSnapshot);
    const existingPkg = base[MAIN_CONTRACT_SEND_PACKAGE_KEY];
    const existingSnap =
        existingPkg &&
        typeof existingPkg === "object" &&
        !Array.isArray(existingPkg) &&
        String((existingPkg as Record<string, unknown>).envelopeId ?? "").trim() === envelopeId
            ? parseTermsSnapshotFromUnknown(
                  (existingPkg as Record<string, unknown>).termsSnapshot,
              )
            : null;
    // Prefer the incoming send-time snap when provided so offer edits after a draft
    // freeze are not stuck on the old draft amounts.
    const termsSnapshot = incomingSnap ?? existingSnap ?? null;
    return {
        ...base,
        [MAIN_CONTRACT_SEND_PACKAGE_KEY]: {
            envelopeId,
            includeMainContract: packageMeta.includeMainContract !== false,
            includeAddendum: Boolean(packageMeta.includeAddendum),
            includeDisclosure: Boolean(packageMeta.includeDisclosure),
            ...(termsSnapshot ? { termsSnapshot } : {}),
        },
    };
}

/**
 * Contracts Generated — only real DocuSign outcomes:
 * Sent / Viewed / Signed / Completed / Voided.
 * Never show draft/created (or sentAt-only draft leaks).
 */
const HISTORY_DOCUMENT_STATUSES = new Set([
    "sent",
    "delivered",
    "viewed",
    "signed",
    "completed",
    "voided",
    "revoked",
]);

const HISTORY_CONTRACT_STATUSES = new Set([
    "SENT",
    "VIEWED",
    "SIGNED",
    "COMPLETED",
    "VOIDED",
    "REVOKED",
]);

const HISTORY_CAPSULE_STATUSES = new Set(["SENT", "VIEWED", "SIGNED", "VOIDED"]);

function isContractRowVisibleInSendTable(
    contractStatus: unknown,
    documentStatus?: unknown,
    envelopeId?: string | null,
    _sentAt?: unknown,
): boolean {
    if (!String(envelopeId ?? "").trim()) return false;
    const ds = String(documentStatus ?? "").trim().toLowerCase();
    const cs = String(contractStatus ?? "").trim().toUpperCase();
    if (HISTORY_DOCUMENT_STATUSES.has(ds)) return true;
    if (HISTORY_CONTRACT_STATUSES.has(cs)) return true;
    return false;
}

function isAchRowVisibleInSendTable(
    status: AchAuthorizationDocuSignCapsuleStatus | undefined,
    envelopeId?: string | null,
    _sentAt?: unknown,
): boolean {
    if (!String(envelopeId ?? "").trim()) return false;
    return HISTORY_CAPSULE_STATUSES.has(String(status ?? "").trim().toUpperCase());
}

function isPackageRowVisibleInSendTable(
    status: StandalonePackageDocuSignCapsuleStatus | undefined,
    envelopeId?: string | null,
    _sentAt?: unknown,
): boolean {
    if (!String(envelopeId ?? "").trim()) return false;
    return HISTORY_CAPSULE_STATUSES.has(String(status ?? "").trim().toUpperCase());
}

function documentKindFromPackageLabel(label: string): ContractSendTableDocumentKind {
    const lower = label.toLowerCase();
    if (lower.includes("addendum")) return "addendum";
    if (lower.includes("disclosure")) return "disclosure";
    return "package";
}

/**
 * One Contracts Generated row per envelope.
 * Addendum + disclosure (and optional contract) that share an envelope stay combined.
 */
function listMainEnvelopeDocumentParts(
    packageMeta?: MainContractSendPackageMeta | StandalonePackageDocuSignMeta["package"] | null,
): Array<{ documentKind: ContractSendTableDocumentKind; label: string }> {
    if (!packageMeta) {
        return [{ documentKind: "contract", label: "Contract" }];
    }
    const labels: string[] = [];
    const includeMain =
        (packageMeta as MainContractSendPackageMeta).includeMainContract !== false;
    if (includeMain) labels.push("Contract");
    if (packageMeta.includeAddendum) labels.push("Addendum");
    if (packageMeta.includeDisclosure) labels.push("State disclosure");
    if (!labels.length) {
        return [{ documentKind: "contract", label: "Contract" }];
    }
    let documentKind: ContractSendTableDocumentKind = "contract";
    if (!includeMain && labels.length === 1) {
        documentKind = documentKindFromPackageLabel(labels[0]!);
    } else if (!includeMain) {
        documentKind = "package";
    }
    return [{ documentKind, label: labels.join(" & ") }];
}

function pushMainEnvelopeDocumentRows(
    rows: ContractSendTableRow[],
    args: {
        envelopeId: string;
        contractStatus: unknown;
        documentStatus: unknown;
        sentAt: unknown;
        isCurrent: boolean;
        packageMeta?: MainContractSendPackageMeta | StandalonePackageDocuSignMeta["package"] | null;
        keyPrefix: string;
        funderName?: string | null;
        funderProfileId?: string | null;
        termsSnapshot?: ContractSendHistoryTermsSnapshot | null;
    },
): void {
    const parts = listMainEnvelopeDocumentParts(args.packageMeta);
    const part = parts[0]!;
    rows.push({
        rowType: "contract",
        key: `${args.keyPrefix}-${part.documentKind}-${args.envelopeId}`,
        label: part.label,
        envelopeId: args.envelopeId,
        contractStatus: args.contractStatus,
        documentStatus: args.documentStatus,
        sentAt: args.sentAt,
        isCurrent: args.isCurrent,
        documentKind: part.documentKind,
        ...(args.funderName ? { funderName: args.funderName } : {}),
        ...(args.funderProfileId ? { funderProfileId: args.funderProfileId } : {}),
        ...(args.termsSnapshot ? { termsSnapshot: args.termsSnapshot } : {}),
    });
}

function pushPackageDocumentRows(
    rows: ContractSendTableRow[],
    args: {
        envelopeId: string;
        status: StandalonePackageDocuSignCapsuleStatus;
        sentAt: unknown;
        isCurrent: boolean;
        packageMeta?: StandalonePackageDocuSignMeta["package"];
        keyPrefix: string;
    },
): void {
    const combinedLabel = formatStandalonePackageSendLabel(args.packageMeta);
    const documentKind =
        listStandalonePackageDocumentLabels(args.packageMeta).length > 1
            ? "package"
            : documentKindFromPackageLabel(combinedLabel);
    rows.push({
        rowType: "package",
        key: `${args.keyPrefix}-${documentKind}-${args.envelopeId}`,
        label: combinedLabel,
        envelopeId: args.envelopeId,
        contractStatus: args.status,
        documentStatus: args.status,
        sentAt: args.sentAt,
        isCurrent: args.isCurrent,
        packageStatus: args.status,
        documentKind,
    });
}

export function getContractSendTableRowStatusLabel(row: ContractSendTableRow): string {
    if (row.rowType === "ach") {
        return formatAchTableStatusLabel({
            envelopeId: row.envelopeId,
            status: row.achStatus,
        });
    }
    if (row.rowType === "package") {
        return formatStandalonePackageTableStatusLabel(row.packageStatus, row.envelopeId);
    }
    const ds = String(row.documentStatus ?? "").trim().toLowerCase();
    const cs = String(row.contractStatus ?? "").trim().toUpperCase();
    // Prefer Completed over Signed so fully-finished envelopes stay distinct.
    if (ds === "completed" || cs === "COMPLETED") return "Completed";
    if (ds === "signed" || cs === "SIGNED") return "Signed";
    if (ds === "viewed" || ds === "delivered" || cs === "VIEWED") return "Viewed";
    if (ds === "sent" || cs === "SENT") return "Sent";
    if (
        ds === "revoked" ||
        ds === "voided" ||
        cs === "REVOKED" ||
        cs === "VOIDED" ||
        cs === "DECLINED" ||
        cs === "EXPIRED"
    ) {
        return "Voided";
    }
    // Draft/unknown rows are filtered out of Contracts Generated.
    return cs || ds || "Sent";
}

export function isContractSendTableRowFullySigned(row: ContractSendTableRow): boolean {
    if (row.rowType === "ach") return row.achStatus === "SIGNED";
    if (row.rowType === "package") return row.packageStatus === "SIGNED";
    return isContractFullySigned(row.contractStatus, row.documentStatus);
}

export function isContractSendTableRowVoided(row: ContractSendTableRow): boolean {
    if (row.rowType === "ach") return row.achStatus === "VOIDED";
    if (row.rowType === "package") return row.packageStatus === "VOIDED";
    return isContractVoidedOrTerminal(row.contractStatus, row.documentStatus);
}

/**
 * True when DocuSign can re-email signing invites for this row's envelope
 * (in-progress only — not draft / signed / voided).
 */
export function canResendEnvelopeNotification(row: ContractSendTableRow | null | undefined): boolean {
    if (!row || !String(row.envelopeId ?? "").trim()) return false;
    if (isContractSendTableRowFullySigned(row) || isContractSendTableRowVoided(row)) {
        return false;
    }

    if (row.rowType === "ach") {
        return row.achStatus === "SENT" || row.achStatus === "VIEWED";
    }
    if (row.rowType === "package") {
        return row.packageStatus === "SENT" || row.packageStatus === "VIEWED";
    }

    const ds = String(row.documentStatus ?? "").trim().toLowerCase();
    const cs = String(row.contractStatus ?? "").trim().toUpperCase();
    if (["SENT", "VIEWED"].includes(cs)) return true;
    if (["sent", "viewed", "delivered"].includes(ds)) return true;
    return false;
}

export function canVoidContractSendTableRow(
    contract: Record<string, unknown> | null | undefined,
    row: ContractSendTableRow | null | undefined,
    sessionSentAt?: Date | null,
): boolean {
    if (!row || !String(row.envelopeId ?? "").trim()) return false;
    if (row.rowType === "contract") {
        if (!row.isCurrent) return false;
        return canVoidMainContract(contract, sessionSentAt);
    }
    if (row.rowType === "ach") {
        const status = row.achStatus ?? "DRAFT";
        return status === "DRAFT" || status === "SENT" || status === "VIEWED";
    }
    if (row.rowType === "package") {
        if (!row.isCurrent) return false;
        const status = row.packageStatus ?? "DRAFT";
        return status === "DRAFT" || status === "SENT" || status === "VIEWED";
    }
    return false;
}

/** True when at least one envelope left DocuSign draft (main, ACH, or standalone package). */
export function hasVisibleContractSendTableRows(
    contract: Record<string, unknown> | null | undefined,
): boolean {
    return buildContractSendTableRows(contract).length > 0;
}

export function buildContractSendTableRows(
    contract: Record<string, unknown> | null | undefined,
): ContractSendTableRow[] {
    if (!contract) return [];

    const contractId = Number((contract as { id?: unknown }).id);
    const hasContractRecord = Number.isFinite(contractId) && contractId > 0;
    if (!hasContractRecord) return [];

    const prefill = contract.contractPrefillOverrides;
    const doc = pickContractEnvelopeDocument(contract);
    const mainEnvelopeId = String(doc?.envelopeId ?? "").trim() || null;

    const envelopeByMappingId = parseDocumentTemplateEnvelopeByMappingId(prefill);
    const achHistory = parseAchSendHistoryFromPrefill(prefill);
    const documentAchHistory = parseDocumentSendHistory(prefill).filter(
        (h) => h.documentKind === "ach",
    );
    const knownAchEnvelopeIds = new Set<string>();
    const rememberAchEnvelope = (value?: string | null) => {
        const id = String(value ?? "").trim();
        if (id) knownAchEnvelopeIds.add(id);
    };
    for (const entry of achHistory) rememberAchEnvelope(entry.envelopeId);
    for (const entry of documentAchHistory) rememberAchEnvelope(entry.envelopeId);
    for (const [key, meta] of Object.entries(envelopeByMappingId)) {
        const envelopeId = String(meta.envelopeId ?? "").trim();
        if (!envelopeId) continue;
        const k = String(key ?? "").trim().toLowerCase();
        if (
            k === ACH_PREFILL_MAPPING_ALIAS_KEY ||
            k.startsWith("ach_history_") ||
            k.includes("ach_authorization") ||
            k.includes("ach_form") ||
            k.endsWith("_ach")
        ) {
            rememberAchEnvelope(envelopeId);
        }
    }
    rememberAchEnvelope(parseLastAchSentFunder(prefill)?.envelopeId);

    const rawAchCurrent = parseAchAuthorizationDocuSignFromPrefill(prefill);
    const achCurrent =
        rawAchCurrent &&
        (rawAchCurrent.envelopeId !== mainEnvelopeId ||
            knownAchEnvelopeIds.has(rawAchCurrent.envelopeId))
            ? rawAchCurrent
            : null;
    if (achCurrent?.envelopeId) rememberAchEnvelope(achCurrent.envelopeId);
    const achEnvelopeId = String(achCurrent?.envelopeId ?? "").trim() || null;

    const packageCurrent = parseStandalonePackageDocuSignFromPrefill(prefill, {
        excludeEnvelopeId: mainEnvelopeId,
    });
    const packageEnvelopeId = String(packageCurrent?.envelopeId ?? "").trim() || null;

    const contractHistory = parseContractSendHistoryFromPrefill(prefill);
    const packageHistory = parseStandalonePackageSendHistoryFromPrefill(prefill);
    const mainSendPackage = parseMainContractSendPackageFromPrefill(prefill, {
        envelopeId: mainEnvelopeId,
    });

    const seenEnvelopeIds = new Set<string>();
    const rows: ContractSendTableRow[] = [];

    const mainEnvelopeIsAchOnly = Boolean(
        mainEnvelopeId && knownAchEnvelopeIds.has(mainEnvelopeId),
    );
    const mainEnvelopeIsPackageOnly = Boolean(
        mainEnvelopeId &&
            packageEnvelopeId &&
            mainEnvelopeId === packageEnvelopeId &&
            !knownAchEnvelopeIds.has(mainEnvelopeId),
    );
    // ACH wrongly linked as package (legacy bug) — treat as ACH, not supplemental package.
    const packageEnvelopeIsAch = Boolean(
        packageEnvelopeId && knownAchEnvelopeIds.has(packageEnvelopeId),
    );

    if (mainEnvelopeId && !mainEnvelopeIsAchOnly && !mainEnvelopeIsPackageOnly) {
        if (
            isContractRowVisibleInSendTable(
                (contract as { status?: unknown }).status,
                doc?.status,
                mainEnvelopeId,
                doc?.sentAt ?? doc?.updatedAt,
            )
        ) {
            seenEnvelopeIds.add(mainEnvelopeId);
            pushMainEnvelopeDocumentRows(rows, {
                envelopeId: mainEnvelopeId,
                contractStatus: (contract as { status?: unknown }).status,
                documentStatus: doc?.status,
                sentAt: doc?.sentAt ?? doc?.updatedAt ?? null,
                isCurrent: true,
                packageMeta: mainSendPackage,
                keyPrefix: "current-contract",
                funderName:
                    String((contract as { funderName?: unknown }).funderName ?? "").trim() ||
                    null,
                termsSnapshot: resolveTermsSnapshotFromContractPrefill(
                    prefill,
                    mainEnvelopeId,
                ),
            });
        }
    }

    const contractHistoryNewestFirst = [...contractHistory].reverse();
    contractHistoryNewestFirst.forEach((entry) => {
        if (seenEnvelopeIds.has(entry.envelopeId)) return;
        if (knownAchEnvelopeIds.has(entry.envelopeId)) return;
        if (
            !isContractRowVisibleInSendTable(
                entry.status,
                entry.status,
                entry.envelopeId,
                entry.sentAt ?? entry.archivedAt,
            )
        ) {
            return;
        }
        seenEnvelopeIds.add(entry.envelopeId);
        const fromDocHistory = parseDocumentSendHistory(prefill).find(
            (h) => String(h.envelopeId ?? "").trim() === entry.envelopeId,
        );
        const docSnap = fromDocHistory?.termsSnapshot
            ? parseTermsSnapshotFromUnknown(fromDocHistory.termsSnapshot)
            : null;
        pushMainEnvelopeDocumentRows(rows, {
            envelopeId: entry.envelopeId,
            contractStatus: entry.status,
            documentStatus: entry.status,
            sentAt: entry.sentAt ?? entry.archivedAt ?? null,
            isCurrent: false,
            packageMeta: entry.package,
            keyPrefix: "history-contract",
            funderName: entry.funderName,
            funderProfileId: entry.funderProfileId,
            termsSnapshot:
                entry.termsSnapshot ??
                docSnap ??
                resolveTermsSnapshotFromContractPrefill(prefill, entry.envelopeId),
        });
    });

    const achAliasMeta = envelopeByMappingId[ACH_PREFILL_MAPPING_ALIAS_KEY];
    const achAliasEnvelopeId = String(achAliasMeta?.envelopeId ?? "").trim() || null;

    const resolveAchRowFunderName = (
        envelopeId: string,
        extra?: string | null,
    ): string | null => {
        const extraTrim = String(extra ?? "").trim();
        if (extraTrim) return extraTrim;
        if (achCurrent?.envelopeId === envelopeId) {
            const fromCapsule = String(achCurrent.funderName ?? "").trim();
            if (fromCapsule) return fromCapsule;
        }
        const fromHist = achHistory.find((h) => h.envelopeId === envelopeId);
        if (fromHist?.funderName) return String(fromHist.funderName).trim() || null;
        const fromDoc = documentAchHistory.find(
            (h) => String(h.envelopeId ?? "").trim() === envelopeId,
        );
        if (fromDoc?.funderName) return String(fromDoc.funderName).trim() || null;
        for (const meta of Object.values(envelopeByMappingId)) {
            if (String(meta.envelopeId ?? "").trim() !== envelopeId) continue;
            const name = String(meta.funderName ?? "").trim();
            if (name) return name;
        }
        return null;
    };

    const pushAchTableRow = (args: {
        envelopeId: string;
        status: AchAuthorizationDocuSignCapsuleStatus;
        sentAt: unknown;
        isCurrent: boolean;
        key: string;
        funderName?: string | null;
    }) => {
        if (seenEnvelopeIds.has(args.envelopeId)) return;
        if (!isAchRowVisibleInSendTable(args.status, args.envelopeId, args.sentAt)) return;
        seenEnvelopeIds.add(args.envelopeId);
        const funderName = resolveAchRowFunderName(args.envelopeId, args.funderName);
        rows.push({
            rowType: "ach",
            key: args.key,
            label: formatAchAuthorizationTableLabel(funderName),
            envelopeId: args.envelopeId,
            contractStatus: args.status,
            documentStatus: args.status,
            sentAt: args.sentAt ?? null,
            isCurrent: args.isCurrent,
            achStatus: args.status,
            documentKind: "ach",
            funderName,
        });
    };

    const resolveAchDisplayCapsuleStatus = (
        envelopeId: string,
        preferred?: AchAuthorizationDocuSignCapsuleStatus | string | null,
    ): AchAuthorizationDocuSignCapsuleStatus => {
        const fromDoc = documentAchHistory.find(
            (h) => String(h.envelopeId ?? "").trim() === envelopeId,
        );
        const fromHist = achHistory.find((h) => h.envelopeId === envelopeId);
        const preferredMapped = preferred
            ? mapInternalEnvelopeStatusToAchCapsule(preferred)
            : undefined;
        const historyStatus = fromHist?.status
            ? fromHist.status
            : fromDoc?.status && !isAchEnvelopeDraftLikeStatus(fromDoc.status)
              ? mapInternalEnvelopeStatusToAchCapsule(fromDoc.status)
              : undefined;
        // Prefer non-draft history when capsule/alias is still stuck on DRAFT.
        if ((!preferredMapped || preferredMapped === "DRAFT") && historyStatus && historyStatus !== "DRAFT") {
            return historyStatus;
        }
        return preferredMapped ?? historyStatus ?? mapInternalEnvelopeStatusToAchCapsule(fromDoc?.status ?? "DRAFT");
    };

    if (achEnvelopeId && !seenEnvelopeIds.has(achEnvelopeId)) {
        pushAchTableRow({
            envelopeId: achEnvelopeId,
            status: resolveAchDisplayCapsuleStatus(achEnvelopeId, achCurrent?.status),
            sentAt: achCurrent?.sentAt ?? achCurrent?.updatedAt ?? null,
            isCurrent: true,
            key: `current-ach-${achEnvelopeId}`,
            funderName: achCurrent?.funderName,
        });
    }

    // Recover current ACH from stable alias when capsule is missing / draft-only.
    if (
        achAliasEnvelopeId &&
        !seenEnvelopeIds.has(achAliasEnvelopeId) &&
        achAliasEnvelopeId !== mainEnvelopeId
    ) {
        pushAchTableRow({
            envelopeId: achAliasEnvelopeId,
            status: resolveAchDisplayCapsuleStatus(achAliasEnvelopeId, achAliasMeta?.status),
            sentAt: achAliasMeta?.updatedAt ?? null,
            isCurrent: true,
            key: `current-ach-${achAliasEnvelopeId}`,
            funderName: achAliasMeta?.funderName,
        });
    }

    // Recover current ACH from document send history / mis-linked package capsule.
    if (packageEnvelopeIsAch && packageEnvelopeId && !seenEnvelopeIds.has(packageEnvelopeId)) {
        const fromDoc = documentAchHistory.find(
            (h) => String(h.envelopeId ?? "").trim() === packageEnvelopeId,
        );
        pushAchTableRow({
            envelopeId: packageEnvelopeId,
            status: resolveAchDisplayCapsuleStatus(
                packageEnvelopeId,
                fromDoc?.status ?? packageCurrent?.status ?? "DRAFT",
            ),
            sentAt:
                packageCurrent?.sentAt ??
                packageCurrent?.updatedAt ??
                fromDoc?.updatedAt ??
                null,
            isCurrent: true,
            key: `current-ach-${packageEnvelopeId}`,
            funderName: fromDoc?.funderName,
        });
    }

    if (
        packageEnvelopeId &&
        !packageEnvelopeIsAch &&
        !seenEnvelopeIds.has(packageEnvelopeId)
    ) {
        if (
            isPackageRowVisibleInSendTable(
                packageCurrent?.status,
                packageEnvelopeId,
                packageCurrent?.sentAt ?? packageCurrent?.updatedAt,
            )
        ) {
            seenEnvelopeIds.add(packageEnvelopeId);
            pushPackageDocumentRows(rows, {
                envelopeId: packageEnvelopeId,
                status: packageCurrent?.status ?? "DRAFT",
                sentAt: packageCurrent?.sentAt ?? packageCurrent?.updatedAt ?? null,
                isCurrent: true,
                packageMeta: packageCurrent?.package,
                keyPrefix: "current-package",
            });
        }
    }

    const packageHistoryNewestFirst = [...packageHistory].reverse();
    packageHistoryNewestFirst.forEach((entry) => {
        if (seenEnvelopeIds.has(entry.envelopeId)) return;
        if (knownAchEnvelopeIds.has(entry.envelopeId)) return;
        if (
            !isPackageRowVisibleInSendTable(
                entry.status,
                entry.envelopeId,
                entry.sentAt ?? entry.archivedAt,
            )
        )
            return;
        seenEnvelopeIds.add(entry.envelopeId);
        pushPackageDocumentRows(rows, {
            envelopeId: entry.envelopeId,
            status: entry.status,
            sentAt: entry.sentAt ?? entry.archivedAt ?? null,
            isCurrent: false,
            packageMeta: entry.package,
            keyPrefix: "history-package",
        });
    });

    const achHistoryNewestFirst = [...achHistory].reverse();
    achHistoryNewestFirst.forEach((entry) => {
        pushAchTableRow({
            envelopeId: entry.envelopeId,
            status: resolveAchDisplayCapsuleStatus(entry.envelopeId, entry.status),
            sentAt: entry.sentAt ?? entry.archivedAt ?? null,
            isCurrent: false,
            key: `history-ach-${entry.envelopeId}`,
            funderName: entry.funderName,
        });
    });

    // FE documentSendHistory ACH rows (covers sends before ACH capsule was linked correctly).
    const documentAchNewestFirst = [...documentAchHistory]
        .filter((h) => String(h.envelopeId ?? "").trim())
        .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    documentAchNewestFirst.forEach((entry) => {
        const envelopeId = String(entry.envelopeId ?? "").trim();
        if (!envelopeId) return;
        const alreadyHasCurrent = rows.some((r) => r.rowType === "ach" && r.isCurrent);
        pushAchTableRow({
            envelopeId,
            status: resolveAchDisplayCapsuleStatus(envelopeId, entry.status),
            sentAt: entry.updatedAt ?? null,
            isCurrent: !alreadyHasCurrent,
            key: alreadyHasCurrent ? `history-doc-ach-${envelopeId}` : `current-ach-${envelopeId}`,
            funderName: entry.funderName,
        });
    });

    // Recover prior-funder ACH envelopes that still live under other mapping ids.
    for (const [key, meta] of Object.entries(envelopeByMappingId)) {
        const envelopeId = String(meta.envelopeId ?? "").trim();
        if (!envelopeId || seenEnvelopeIds.has(envelopeId) || envelopeId === mainEnvelopeId) {
            continue;
        }
        const isAchKey =
            key === ACH_PREFILL_MAPPING_ALIAS_KEY ||
            key.startsWith("ach_history_") ||
            key.toLowerCase().includes("ach_authorization") ||
            key.toLowerCase().includes("ach_form") ||
            Boolean(String(meta.funderName ?? "").trim()) ||
            knownAchEnvelopeIds.has(envelopeId);
        if (!isAchKey) continue;
        pushAchTableRow({
            envelopeId,
            status: resolveAchDisplayCapsuleStatus(envelopeId, meta.status),
            sentAt: meta.updatedAt ?? null,
            isCurrent: false,
            key: `mapping-ach-${envelopeId}`,
            funderName: meta.funderName,
        });
    }

    const resendMetaByEnvelope = parseEnvelopeResendMetaFromPrefill(prefill);
    for (const row of rows) {
        const eid = String(row.envelopeId ?? "").trim();
        if (!eid) continue;
        const meta = resendMetaByEnvelope[eid];
        if (!meta) continue;
        row.lastResentAt = meta.lastResentAt;
        row.resentCount = meta.resentCount;
        row.resentAtHistory = meta.resentAtHistory;
    }

    return rows;
}
