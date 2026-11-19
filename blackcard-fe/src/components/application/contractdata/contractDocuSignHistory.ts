/** Archived main-contract DocuSign envelopes on `Contract.contractPrefillOverrides`. */
export const CONTRACT_DOCUSIGN_HISTORY_KEY = "contractDocuSignHistory";

export type ContractDocuSignHistoryEntry = {
    envelopeId: string;
    type: "contract";
    name?: string;
    status: string;
    sentAt?: string | null;
    completedAt?: string | null;
    voidedAt?: string | null;
    updatedAt: string;
};

const INTERNAL_TO_CAPSULE: Record<string, string> = {
    draft: "DRAFT",
    created: "DRAFT",
    sent: "SENT",
    processing: "SENT",
    viewed: "VIEWED",
    delivered: "VIEWED",
    signed: "SIGNED",
    completed: "COMPLETED",
    revoked: "REVOKED",
    voided: "REVOKED",
    declined: "DECLINED",
    expired: "EXPIRED",
};

/** Normalize CRM / DocuSign internal or capsule status to a contract capsule code. */
export function normalizeContractCapsuleStatus(raw: unknown): string {
    const s = String(raw ?? "").trim();
    if (!s) return "DRAFT";
    const lower = s.toLowerCase();
    if (INTERNAL_TO_CAPSULE[lower]) return INTERNAL_TO_CAPSULE[lower];
    const upper = s.toUpperCase();
    if (Object.values(INTERNAL_TO_CAPSULE).includes(upper)) return upper;
    return upper || "DRAFT";
}

export function parseContractDocuSignHistory(raw: unknown): ContractDocuSignHistoryEntry[] {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
    const list = (raw as Record<string, unknown>)[CONTRACT_DOCUSIGN_HISTORY_KEY];
    if (!Array.isArray(list)) return [];
    const out: ContractDocuSignHistoryEntry[] = [];
    for (const item of list) {
        if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
        const o = item as Record<string, unknown>;
        const envelopeId = String(o.envelopeId ?? "").trim();
        if (!envelopeId) continue;
        out.push({
            envelopeId,
            type: "contract",
            name: o.name != null ? String(o.name) : undefined,
            status: normalizeContractCapsuleStatus(o.status),
            sentAt: o.sentAt != null ? String(o.sentAt) : null,
            completedAt: o.completedAt != null ? String(o.completedAt) : null,
            voidedAt: o.voidedAt != null ? String(o.voidedAt) : null,
            updatedAt: o.updatedAt != null ? String(o.updatedAt) : "",
        });
    }
    return out;
}

/** Prefer voidedAt / completedAt / sentAt when archived status field is stale (e.g. DRAFT). */
export function resolveHistoryEntryCapsuleStatus(entry: ContractDocuSignHistoryEntry): {
    contractStatus: string;
    documentStatus: string | null;
} {
    if (entry.voidedAt) {
        return { contractStatus: "REVOKED", documentStatus: "revoked" };
    }
    if (entry.completedAt) {
        return { contractStatus: "COMPLETED", documentStatus: "completed" };
    }

    const capsule = normalizeContractCapsuleStatus(entry.status);
    if (capsule === "DRAFT" && entry.sentAt) {
        return { contractStatus: "SENT", documentStatus: "sent" };
    }

    const documentStatus =
        capsule === "SENT"
            ? "sent"
            : capsule === "VIEWED"
              ? "viewed"
              : capsule === "SIGNED" || capsule === "COMPLETED"
                ? "completed"
                : capsule === "REVOKED"
                  ? "revoked"
                  : capsule === "DECLINED"
                    ? "declined"
                    : capsule === "EXPIRED"
                      ? "expired"
                      : null;

    return { contractStatus: capsule, documentStatus };
}

/** Resolve display status for the active application document row. */
export function resolveLiveContractEnvelopeStatus(
    contractStatus: unknown,
    documentStatus: unknown,
): {
    contractStatus: string;
    documentStatus: string | null;
} {
    const cs = normalizeContractCapsuleStatus(contractStatus);
    const dsRaw = String(documentStatus ?? "").trim().toLowerCase();
    const ds = dsRaw || null;

    if (ds === "completed" || ds === "signed") {
        return { contractStatus: "COMPLETED", documentStatus: ds };
    }
    if (ds === "revoked" || ds === "voided") {
        return { contractStatus: "REVOKED", documentStatus: ds };
    }
    if (ds && ["sent", "viewed", "delivered"].includes(ds)) {
        const viewed = ds === "viewed" || ds === "delivered";
        return {
            contractStatus:
                cs === "DRAFT" || cs === "REVOKED"
                    ? viewed
                        ? "VIEWED"
                        : "SENT"
                    : cs,
            documentStatus: ds,
        };
    }

    if (cs === "COMPLETED" || cs === "SIGNED") {
        return {
            contractStatus: cs,
            documentStatus: ds ?? (cs === "COMPLETED" ? "completed" : "signed"),
        };
    }
    if (cs === "REVOKED") {
        return { contractStatus: cs, documentStatus: ds ?? "revoked" };
    }
    if (cs === "SENT" || cs === "VIEWED") {
        return {
            contractStatus: cs,
            documentStatus: ds ?? (cs === "VIEWED" ? "viewed" : "sent"),
        };
    }

    return { contractStatus: cs, documentStatus: ds };
}

export type ContractTableStatusHints = {
    contractStatus?: unknown;
    documentStatus?: unknown;
    sentAt?: string | null;
    completedAt?: string | null;
    voidedAt?: string | null;
    syncedContractStatus?: string | null;
    syncedDocuSignStatus?: string | null;
};

/** Table row status — prefers live DocuSign sync, then timestamps, then CRM row. */
export function resolveContractTableRowStatus(hints: ContractTableStatusHints): {
    contractStatus: string;
    documentStatus: string | null;
} {
    if (hints.voidedAt) {
        return { contractStatus: "REVOKED", documentStatus: "revoked" };
    }
    if (hints.completedAt) {
        return { contractStatus: "COMPLETED", documentStatus: "completed" };
    }

    const syncedCapsule = normalizeContractCapsuleStatus(hints.syncedContractStatus);
    const dsFromSync = String(hints.syncedDocuSignStatus ?? "")
        .trim()
        .toLowerCase();
    if (dsFromSync) {
        if (dsFromSync === "completed") {
            return { contractStatus: "COMPLETED", documentStatus: "completed" };
        }
        if (dsFromSync === "signed") {
            return { contractStatus: "SIGNED", documentStatus: "signed" };
        }
        if (dsFromSync === "delivered") {
            return { contractStatus: "VIEWED", documentStatus: "viewed" };
        }
        if (dsFromSync === "sent") {
            return { contractStatus: "SENT", documentStatus: "sent" };
        }
        if (["voided", "declined", "expired"].includes(dsFromSync)) {
            const capsule = normalizeContractCapsuleStatus(dsFromSync);
            return {
                contractStatus: capsule,
                documentStatus: dsFromSync === "voided" ? "revoked" : dsFromSync,
            };
        }
    }
    if (syncedCapsule !== "DRAFT") {
        const fromSynced = resolveLiveContractEnvelopeStatus(syncedCapsule, dsFromSync || null);
        if (fromSynced.contractStatus !== "DRAFT") return fromSynced;
    }

    const fromCrm = resolveLiveContractEnvelopeStatus(
        hints.contractStatus,
        hints.documentStatus,
    );
    if (fromCrm.contractStatus !== "DRAFT") {
        return fromCrm;
    }

    if (hints.sentAt) {
        return { contractStatus: "SENT", documentStatus: "sent" };
    }

    return fromCrm;
}

/** Best sent timestamp for the SENT column. */
export function resolveContractTableSentAt(hints: {
    sentAt?: string | null;
    completedAt?: string | null;
    voidedAt?: string | null;
    updatedAt?: string | null;
    contractStatus?: string;
    documentStatus?: string | null;
}): string | null {
    if (hints.sentAt) return hints.sentAt;
    const cs = normalizeContractCapsuleStatus(hints.contractStatus);
    const ds = String(hints.documentStatus ?? "").trim().toLowerCase();
    const wasSent =
        cs === "SENT" ||
        cs === "VIEWED" ||
        cs === "SIGNED" ||
        cs === "COMPLETED" ||
        ["sent", "viewed", "delivered", "signed", "completed"].includes(ds);
    if (wasSent && hints.updatedAt) return hints.updatedAt;
    return null;
}
