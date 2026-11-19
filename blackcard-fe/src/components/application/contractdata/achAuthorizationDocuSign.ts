/** Stored on `Contract.contractPrefillOverrides` — separate from main contract envelope. */
export const ACH_AUTHORIZATION_DOCUSIGN_KEY = "achAuthorizationDocuSign";

/** Prior standalone ACH DocuSign sends — stored on `Contract.contractPrefillOverrides`. */
export const ACH_SEND_HISTORY_KEY = "achSendHistory";

export type AchSendHistoryEntry = {
    envelopeId: string;
    status: AchAuthorizationDocuSignCapsuleStatus;
    sentAt?: string | null;
    archivedAt: string;
    funderName?: string | null;
};

export type AchAuthorizationDocuSignCapsuleStatus =
    | "DRAFT"
    | "SENT"
    | "VIEWED"
    | "SIGNED"
    | "VOIDED";

export type AchAuthorizationDocuSignMeta = {
    envelopeId: string;
    status: AchAuthorizationDocuSignCapsuleStatus;
    sentAt?: string | null;
    updatedAt?: string | null;
    funderName?: string | null;
};

export function mapInternalEnvelopeStatusToAchCapsule(
    internalStatus: unknown,
): AchAuthorizationDocuSignCapsuleStatus {
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

export function achCapsuleStatusToInternal(
    status: AchAuthorizationDocuSignCapsuleStatus | string | null | undefined,
): string {
    switch (String(status ?? "").trim().toUpperCase()) {
        case "SIGNED":
            return "completed";
        case "VIEWED":
            return "viewed";
        case "SENT":
            return "sent";
        case "VOIDED":
            return "revoked";
        default:
            return "draft";
    }
}

export function parseAchAuthorizationDocuSignFromPrefill(
    raw: unknown,
    options?: { excludeEnvelopeId?: string | null },
): AchAuthorizationDocuSignMeta | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const blob = (raw as Record<string, unknown>)[ACH_AUTHORIZATION_DOCUSIGN_KEY];
    if (blob == null || typeof blob !== "object" || Array.isArray(blob)) return null;
    const o = blob as Record<string, unknown>;
    const envelopeId = String(o.envelopeId ?? "").trim();
    if (!envelopeId) return null;
    const exclude = String(options?.excludeEnvelopeId ?? "").trim();
    if (exclude && envelopeId === exclude) return null;
    const statusRaw = String(o.status ?? "DRAFT").trim().toUpperCase();
    const status: AchAuthorizationDocuSignCapsuleStatus =
        statusRaw === "SENT" ||
        statusRaw === "VIEWED" ||
        statusRaw === "SIGNED" ||
        statusRaw === "VOIDED"
            ? statusRaw
            : "DRAFT";
    return {
        envelopeId,
        status,
        sentAt: o.sentAt != null ? String(o.sentAt) : null,
        updatedAt: o.updatedAt != null ? String(o.updatedAt) : null,
        funderName: o.funderName != null ? String(o.funderName).trim() || null : null,
    };
}

export function mergeAchAuthorizationDocuSignIntoPrefill(
    baseRaw: unknown,
    patch: Partial<AchAuthorizationDocuSignMeta> & { envelopeId: string },
): Record<string, unknown> {
    const base =
        baseRaw && typeof baseRaw === "object" && !Array.isArray(baseRaw)
            ? { ...(baseRaw as Record<string, unknown>) }
            : {};
    const prior = parseAchAuthorizationDocuSignFromPrefill(base);
    const nextEnvelopeId = String(patch.envelopeId || prior?.envelopeId || "").trim();
    const status =
        patch.status ??
        (prior && prior.envelopeId === nextEnvelopeId ? prior.status : "DRAFT");
    const now = new Date().toISOString();
    const meta: AchAuthorizationDocuSignMeta = {
        envelopeId: nextEnvelopeId,
        status,
        sentAt:
            patch.sentAt !== undefined
                ? patch.sentAt
                : status === "VOIDED"
                  ? null
                  : status === "SENT" || status === "VIEWED" || status === "SIGNED"
                    ? (prior?.envelopeId === nextEnvelopeId ? (prior.sentAt ?? now) : now)
                    : (prior?.envelopeId === nextEnvelopeId ? (prior.sentAt ?? null) : null),
        updatedAt: patch.updatedAt ?? now,
        funderName:
            patch.funderName !== undefined
                ? patch.funderName
                : prior?.envelopeId === nextEnvelopeId
                  ? (prior.funderName ?? null)
                  : null,
    };

    let next = { ...base };
    if (prior?.envelopeId && prior.envelopeId !== nextEnvelopeId && prior.status !== "DRAFT") {
        next = appendAchSendHistoryEntry(next, {
            envelopeId: prior.envelopeId,
            status: prior.status,
            sentAt: prior.sentAt,
            funderName: prior.funderName,
        });
    }

    return {
        ...next,
        [ACH_AUTHORIZATION_DOCUSIGN_KEY]: meta,
    };
}

export function formatAchAuthorizationTableLabel(funderName?: string | null): string {
    const funder = String(funderName ?? "").trim();
    return funder ? `ACH Authorization — ${funder}` : "ACH Authorization";
}

export function formatAchAuthorizationCapsuleLabel(
    status: AchAuthorizationDocuSignCapsuleStatus,
): string {
    switch (status) {
        case "SENT":
            return "Sent";
        case "VIEWED":
            return "Viewed";
        case "SIGNED":
            return "Signed";
        case "VOIDED":
            return "Voided";
        default:
            return "Ready";
    }
}

export function achCapsuleClassName(status: AchAuthorizationDocuSignCapsuleStatus): string {
    switch (status) {
        case "SENT":
            return "bg-sky-100 text-sky-800 ring-sky-200/80 dark:bg-sky-900/40 dark:text-sky-200 dark:ring-sky-800/50";
        case "VIEWED":
            return "bg-amber-100 text-amber-900 ring-amber-200/80 dark:bg-amber-900/35 dark:text-amber-100 dark:ring-amber-800/50";
        case "SIGNED":
            return "bg-emerald-100 text-emerald-800 ring-emerald-200/80 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800/50";
        case "VOIDED":
            return "bg-slate-200 text-slate-700 ring-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600";
        default:
            return "bg-sky-100 text-sky-800 ring-sky-200/80 dark:bg-sky-900/40 dark:text-sky-200 dark:ring-sky-800/50";
    }
}

export function achEnvelopeIsActive(status: AchAuthorizationDocuSignCapsuleStatus): boolean {
    return status === "DRAFT" || status === "SENT" || status === "VIEWED";
}

export function canVoidAchAuthorization(
    meta: AchAuthorizationDocuSignMeta | null,
    sessionEnvelopeId?: string | null,
): boolean {
    const envelopeId = String(meta?.envelopeId ?? sessionEnvelopeId ?? "").trim();
    if (!envelopeId) return false;
    const status = meta?.status ?? "DRAFT";
    return status === "SENT" || status === "VIEWED";
}

/** Strip ACH DocuSign envelope meta before merging into the prefill edit form. */
export function stripAchDocuSignMetaFromPrefillOverrides(
    raw: unknown,
): Record<string, unknown> | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = { ...(raw as Record<string, unknown>) };
    delete o[ACH_AUTHORIZATION_DOCUSIGN_KEY];
    return o;
}

export function canResendAchAuthorization(
    meta: AchAuthorizationDocuSignMeta | null,
    sessionEnvelopeId?: string | null,
): boolean {
    const envelopeId = String(meta?.envelopeId ?? sessionEnvelopeId ?? "").trim();
    if (!envelopeId) return true;
    const status = meta?.status ?? "DRAFT";
    return status === "VOIDED" || status === "SIGNED";
}

export function parseAchSendHistoryFromPrefill(raw: unknown): AchSendHistoryEntry[] {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
    const list = (raw as Record<string, unknown>)[ACH_SEND_HISTORY_KEY];
    if (!Array.isArray(list)) return [];
    const out: AchSendHistoryEntry[] = [];
    for (const item of list) {
        if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
        const o = item as Record<string, unknown>;
        const envelopeId = String(o.envelopeId ?? "").trim();
        if (!envelopeId) continue;
        const statusRaw = String(o.status ?? "DRAFT").trim().toUpperCase();
        const status: AchAuthorizationDocuSignCapsuleStatus =
            statusRaw === "SENT" ||
            statusRaw === "VIEWED" ||
            statusRaw === "SIGNED" ||
            statusRaw === "VOIDED"
                ? statusRaw
                : "DRAFT";
        out.push({
            envelopeId,
            status,
            sentAt: o.sentAt != null ? String(o.sentAt) : null,
            archivedAt: String(o.archivedAt ?? ""),
            funderName: o.funderName != null ? String(o.funderName).trim() || null : null,
        });
    }
    return out;
}

export function appendAchSendHistoryEntry(
    prefill: Record<string, unknown>,
    entry: {
        envelopeId: string;
        status: AchAuthorizationDocuSignCapsuleStatus;
        sentAt?: string | null;
        funderName?: string | null;
    },
): Record<string, unknown> {
    const envelopeId = String(entry.envelopeId ?? "").trim();
    if (!envelopeId) return prefill;
    const existing = parseAchSendHistoryFromPrefill(prefill);
    const nextEntry: AchSendHistoryEntry = {
        envelopeId,
        status: entry.status,
        sentAt: entry.sentAt ?? null,
        archivedAt: new Date().toISOString(),
        funderName: entry.funderName ?? null,
    };
    const withoutDup = existing.filter((item) => item.envelopeId !== envelopeId);
    return {
        ...prefill,
        [ACH_SEND_HISTORY_KEY]: [...withoutDup, nextEntry],
    };
}

/** Main contract DocuSign envelope — never treat ACH authorization envelope as the contract. */
export function resolveMainContractEnvelopeId(
    contract:
        | {
              application?: { document?: { envelopeId?: unknown } };
              contractPrefillOverrides?: unknown;
          }
        | null
        | undefined,
): string | null {
    const fromDocument = String(contract?.application?.document?.envelopeId ?? "").trim();
    if (!fromDocument) return null;
    const achEnvelopeId = String(
        parseAchAuthorizationDocuSignFromPrefill(contract?.contractPrefillOverrides)?.envelopeId ??
            "",
    ).trim();
    if (achEnvelopeId && achEnvelopeId === fromDocument) {
        return null;
    }
    return fromDocument;
}

export function isAchAuthorizationEnvelopeId(
    envelopeId: string | null | undefined,
    contractPrefillOverrides?: unknown,
): boolean {
    const eid = String(envelopeId ?? "").trim();
    if (!eid) return false;
    const achEnvelopeId = String(
        parseAchAuthorizationDocuSignFromPrefill(contractPrefillOverrides)?.envelopeId ?? "",
    ).trim();
    return Boolean(achEnvelopeId && achEnvelopeId === eid);
}
