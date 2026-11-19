/** Standalone contract-package sends (addendum / disclosure without main contract PDF). */
export const STANDALONE_PACKAGE_DOCUSIGN_KEY = "standalonePackageDocuSign";

export const STANDALONE_PACKAGE_SEND_HISTORY_KEY = "standalonePackageSendHistory";

export type StandalonePackageDocuSignCapsuleStatus =
    | "DRAFT"
    | "SENT"
    | "VIEWED"
    | "SIGNED"
    | "VOIDED";

export type StandalonePackageDocuSignMeta = {
    envelopeId: string;
    status: StandalonePackageDocuSignCapsuleStatus;
    sentAt?: string | null;
    updatedAt?: string | null;
    /** Documents included in this envelope (main contract PDF omitted when false). */
    package?: {
        includeMainContract?: boolean;
        includeAddendum?: boolean;
        includeDisclosure?: boolean;
    };
};

export type StandalonePackageSendHistoryEntry = {
    envelopeId: string;
    status: StandalonePackageDocuSignCapsuleStatus;
    sentAt?: string | null;
    archivedAt: string;
    package?: StandalonePackageDocuSignMeta["package"];
};

export function mapInternalEnvelopeStatusToPackageCapsule(
    internalStatus: unknown,
): StandalonePackageDocuSignCapsuleStatus {
    const k = String(internalStatus ?? "")
        .trim()
        .toLowerCase();
    if (k === "voided" || k === "revoked" || k === "declined" || k === "expired") {
        return "VOIDED";
    }
    if (k === "completed" || k === "signed") return "SIGNED";
    if (k === "viewed" || k === "delivered") return "VIEWED";
    if (k === "sent" || k === "processing") return "SENT";
    return "DRAFT";
}

const PACKAGE_CAPSULE_STATUS_RANK: Record<StandalonePackageDocuSignCapsuleStatus, number> = {
    DRAFT: 0,
    SENT: 1,
    VIEWED: 2,
    SIGNED: 3,
    VOIDED: 4,
};

/** Never downgrade SIGNED → DRAFT when CRM re-saves prefill after DocuSign webhooks. */
export function mergeStandalonePackageCapsuleStatus(
    prior: StandalonePackageDocuSignCapsuleStatus,
    patch?: StandalonePackageDocuSignCapsuleStatus,
): StandalonePackageDocuSignCapsuleStatus {
    if (!patch) return prior;
    if (patch === "VOIDED" || prior === "VOIDED") return "VOIDED";
    return PACKAGE_CAPSULE_STATUS_RANK[patch] >= PACKAGE_CAPSULE_STATUS_RANK[prior]
        ? patch
        : prior;
}

export function parseStandalonePackageDocuSignFromPrefill(
    raw: unknown,
    options?: { excludeEnvelopeId?: string | null },
): StandalonePackageDocuSignMeta | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const blob = (raw as Record<string, unknown>)[STANDALONE_PACKAGE_DOCUSIGN_KEY];
    if (blob == null || typeof blob !== "object" || Array.isArray(blob)) return null;
    const o = blob as Record<string, unknown>;
    const envelopeId = String(o.envelopeId ?? "").trim();
    if (!envelopeId) return null;
    const exclude = String(options?.excludeEnvelopeId ?? "").trim();
    if (exclude && envelopeId === exclude) return null;
    const statusRaw = String(o.status ?? "DRAFT").trim().toUpperCase();
    const status: StandalonePackageDocuSignCapsuleStatus =
        statusRaw === "SENT" ||
        statusRaw === "VIEWED" ||
        statusRaw === "SIGNED" ||
        statusRaw === "VOIDED"
            ? statusRaw
            : "DRAFT";
    const pkgRaw = o.package;
    const packageMeta =
        pkgRaw != null && typeof pkgRaw === "object" && !Array.isArray(pkgRaw)
            ? {
                  includeMainContract: Boolean(
                      (pkgRaw as Record<string, unknown>).includeMainContract,
                  ),
                  includeAddendum: Boolean((pkgRaw as Record<string, unknown>).includeAddendum),
                  includeDisclosure: Boolean(
                      (pkgRaw as Record<string, unknown>).includeDisclosure,
                  ),
              }
            : undefined;
    return {
        envelopeId,
        status,
        sentAt: o.sentAt != null ? String(o.sentAt) : null,
        updatedAt: o.updatedAt != null ? String(o.updatedAt) : null,
        package: packageMeta,
    };
}

/** Per-document labels; table rows combine them with formatStandalonePackageSendLabel. */
export function listStandalonePackageDocumentLabels(
    packageMeta?: StandalonePackageDocuSignMeta["package"],
): string[] {
    if (!packageMeta) return ["Supplemental documents"];
    const labels: string[] = [];
    if (packageMeta.includeAddendum) labels.push("Addendum");
    if (packageMeta.includeDisclosure) labels.push("State disclosure");
    if (!labels.length) return ["Supplemental documents"];
    return labels;
}

export function formatStandalonePackageSendLabel(
    packageMeta?: StandalonePackageDocuSignMeta["package"],
): string {
    const labels = listStandalonePackageDocumentLabels(packageMeta);
    return labels.join(" & ");
}

export function formatStandalonePackageTableStatusLabel(
    status: StandalonePackageDocuSignCapsuleStatus | null | undefined,
    envelopeId?: string | null,
): string {
    if (!String(envelopeId ?? "").trim()) return "Pending";
    // Drafts are filtered from Contracts Generated — do not surface Draft here.
    if (status === "DRAFT") return "Pending";
    if (status === "VOIDED") return "Voided";
    if (status === "SENT") return "Sent";
    if (status === "VIEWED") return "Viewed";
    if (status === "SIGNED") return "Signed";
    return "Pending";
}

export function isStandalonePackageSigningFinished(
    status: StandalonePackageDocuSignCapsuleStatus | null | undefined,
): boolean {
    return status === "SIGNED" || status === "VOIDED";
}

/** Package envelope is in-flight — void before resending. */
export function standalonePackageEnvelopeIsActive(
    status: StandalonePackageDocuSignCapsuleStatus,
): boolean {
    return status === "DRAFT" || status === "SENT" || status === "VIEWED";
}

export function canVoidStandalonePackage(
    meta: { envelopeId?: string | null; status?: StandalonePackageDocuSignCapsuleStatus } | null,
    sessionEnvelopeId?: string | null,
): boolean {
    const envelopeId = String(meta?.envelopeId ?? sessionEnvelopeId ?? "").trim();
    if (!envelopeId) return false;
    const status = meta?.status ?? "DRAFT";
    return standalonePackageEnvelopeIsActive(status);
}

export function parseStandalonePackageSendHistoryFromPrefill(
    raw: unknown,
): StandalonePackageSendHistoryEntry[] {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
    const list = (raw as Record<string, unknown>)[STANDALONE_PACKAGE_SEND_HISTORY_KEY];
    if (!Array.isArray(list)) return [];
    const out: StandalonePackageSendHistoryEntry[] = [];
    for (const item of list) {
        if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
        const o = item as Record<string, unknown>;
        const envelopeId = String(o.envelopeId ?? "").trim();
        if (!envelopeId) continue;
        const statusRaw = String(o.status ?? "DRAFT").trim().toUpperCase();
        const status: StandalonePackageDocuSignCapsuleStatus =
            statusRaw === "SENT" ||
            statusRaw === "VIEWED" ||
            statusRaw === "SIGNED" ||
            statusRaw === "VOIDED"
                ? statusRaw
                : "DRAFT";
        const pkgRaw = o.package;
        out.push({
            envelopeId,
            status,
            sentAt: o.sentAt != null ? String(o.sentAt) : null,
            archivedAt: String(o.archivedAt ?? ""),
            package:
                pkgRaw != null && typeof pkgRaw === "object" && !Array.isArray(pkgRaw)
                    ? {
                          includeMainContract: Boolean(
                              (pkgRaw as Record<string, unknown>).includeMainContract,
                          ),
                          includeAddendum: Boolean(
                              (pkgRaw as Record<string, unknown>).includeAddendum,
                          ),
                          includeDisclosure: Boolean(
                              (pkgRaw as Record<string, unknown>).includeDisclosure,
                          ),
                      }
                    : undefined,
        });
    }
    return out;
}

export function mergeStandalonePackageDocuSignIntoPrefill(
    baseRaw: unknown,
    patch: Partial<StandalonePackageDocuSignMeta> & { envelopeId: string },
): Record<string, unknown> {
    const base =
        baseRaw && typeof baseRaw === "object" && !Array.isArray(baseRaw)
            ? { ...(baseRaw as Record<string, unknown>) }
            : {};
    const prior = parseStandalonePackageDocuSignFromPrefill(base) ?? {
        envelopeId: patch.envelopeId,
        status: "DRAFT" as const,
    };
    const status = mergeStandalonePackageCapsuleStatus(
        prior.status,
        patch.status,
    );
    const now = new Date().toISOString();
    const meta: StandalonePackageDocuSignMeta = {
        envelopeId: String(patch.envelopeId || prior.envelopeId).trim(),
        status,
        sentAt:
            patch.sentAt !== undefined
                ? patch.sentAt
                : status === "VOIDED"
                  ? null
                  : status === "SENT" || status === "VIEWED" || status === "SIGNED"
                    ? (prior.sentAt ?? now)
                    : (prior.sentAt ?? null),
        updatedAt: patch.updatedAt ?? now,
        package: patch.package ?? prior.package,
    };
    return {
        ...base,
        [STANDALONE_PACKAGE_DOCUSIGN_KEY]: meta,
    };
}
