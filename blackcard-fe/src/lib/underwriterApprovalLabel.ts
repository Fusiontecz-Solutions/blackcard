import type { Application, ApplicationUserLite } from "@/types/applicationTypes";

export const normalizeWorkflowLabel = (value: string): string =>
    value.replace(/[\s_-]+/g, "").toLowerCase();

const isUnderwriterApprovedToken = (value: string): boolean =>
    normalizeWorkflowLabel(value) === "underwriterapproved";

const isIsoApprovedToken = (value: string): boolean =>
    normalizeWorkflowLabel(value) === "isoapproved";

const isFinalApprovalToken = (value: string): boolean =>
    normalizeWorkflowLabel(value) === "finalapproval";

/** True when the deal is in the Underwriter Approved stage (queue is source of truth). */
export function isUnderwriterApprovedApplication(
    app:
        | Pick<
              Application,
              "currentQueue" | "currentState" | "queue" | "status" | "statsCurrentState"
          >
        | Record<string, unknown>
        | null
        | undefined,
): boolean {
    if (!app) return false;
    const record = app as Record<string, unknown>;
    const queueNorm = normalizeWorkflowLabel(
        String(record.currentQueue ?? record.queue ?? ""),
    );
    const stateNorm = normalizeWorkflowLabel(
        String(record.currentState ?? record.status ?? ""),
    );
    const rawStateNorm = normalizeWorkflowLabel(
        String(record.statsCurrentState ?? record.currentState ?? record.status ?? ""),
    );
    if (
        isFinalApprovalToken(queueNorm) ||
        isFinalApprovalToken(stateNorm) ||
        isFinalApprovalToken(rawStateNorm)
    ) {
        return false;
    }
    if (isUnderwriterApprovedToken(queueNorm)) return true;
    if (isUnderwriterApprovedToken(stateNorm)) return true;
    return false;
}

/** True when the deal is in the ISO Approved stage (queue or state). */
export function isIsoApprovedApplication(
    app:
        | Pick<Application, "currentQueue" | "currentState" | "queue" | "status">
        | Record<string, unknown>
        | null
        | undefined,
): boolean {
    if (!app) return false;
    const record = app as Record<string, unknown>;
    const queueNorm = normalizeWorkflowLabel(
        String(record.currentQueue ?? record.queue ?? ""),
    );
    const stateNorm = normalizeWorkflowLabel(
        String(record.currentState ?? record.status ?? ""),
    );
    return (
        isIsoApprovedToken(queueNorm) ||
        isIsoApprovedToken(stateNorm) ||
        (queueNorm === "approved" && stateNorm === "approved")
    );
}

type UnderwriterApprovalAppFields = Pick<
    Application,
    | "approvedByUnderwriterId"
    | "approvedByUnderwriter"
    | "assignedUnderwriterId"
    | "assignedUnderwriter"
    | "claimedByUnderwriterId"
    | "claimedByUnderwriter"
>;

const resolveUserLiteId = (user?: ApplicationUserLite | null): string => {
    if (!user || typeof user !== "object") return "";
    return String(user.id ?? user._id ?? "").trim();
};

/** True when the viewer is assigned to or recorded as approving underwriter on the deal. */
export function isUnderwriterLinkedToApplication(
    app: UnderwriterApprovalAppFields | null | undefined,
    viewerUserId: string | null | undefined,
): boolean {
    const viewerId = String(viewerUserId ?? "").trim();
    if (!viewerId || !app) return false;
    const linkedIds = [
        app.approvedByUnderwriterId,
        resolveUserLiteId(app.approvedByUnderwriter),
        app.assignedUnderwriterId,
        resolveUserLiteId(app.assignedUnderwriter),
        app.claimedByUnderwriterId,
        resolveUserLiteId(app.claimedByUnderwriter),
    ]
        .map((id) => String(id ?? "").trim())
        .filter(Boolean);
    return linkedIds.some((id) => id === viewerId);
}

/**
 * Resolve the underwriter to credit on the deal. Always prefer the deal's
 * assigned/claimed underwriter over whoever recorded the approval (which can be
 * a scrubber/admin acting on the underwriter's behalf).
 */
export function resolveApprovingUnderwriter(
    app: UnderwriterApprovalAppFields,
): { id: string; user?: ApplicationUserLite | null } | null {
    const approvedId = String(
        app.approvedByUnderwriterId ?? resolveUserLiteId(app.approvedByUnderwriter) ?? "",
    ).trim();
    const assignedId = String(
        app.assignedUnderwriterId ?? resolveUserLiteId(app.assignedUnderwriter) ?? "",
    ).trim();
    const claimedId = String(
        app.claimedByUnderwriterId ?? resolveUserLiteId(app.claimedByUnderwriter) ?? "",
    ).trim();

    if (assignedId) {
        return { id: assignedId, user: app.assignedUnderwriter };
    }
    if (claimedId) {
        return { id: claimedId, user: app.claimedByUnderwriter };
    }
    if (approvedId) {
        return { id: approvedId, user: app.approvedByUnderwriter };
    }
    return null;
}

const isActiveUnderwriterRole = (role?: string | null): boolean =>
    String(role ?? "")
        .trim()
        .toUpperCase()
        .replace(/-/g, "_") === "UNDERWRITER";

const resolveUnderwriterLink = (
    id: string | null | undefined,
    user?: ApplicationUserLite | null,
): { id: string; user?: ApplicationUserLite | null } | null => {
    const resolvedId = String(id ?? resolveUserLiteId(user) ?? "").trim();
    if (!resolvedId) return null;
    if (user?.role && !isActiveUnderwriterRole(user.role)) return null;
    return { id: resolvedId, user };
};

/**
 * Underwriter who should receive the post-contract final approval send.
 * Skips scrubbers/admins recorded as approver when an assigned Underwriter exists.
 */
export function resolveFinalApprovalTargetUnderwriter(
    app: UnderwriterApprovalAppFields,
): { id: string; user?: ApplicationUserLite | null } | null {
    return (
        resolveUnderwriterLink(
            app.approvedByUnderwriterId,
            app.approvedByUnderwriter,
        ) ??
        resolveUnderwriterLink(
            app.assignedUnderwriterId,
            app.assignedUnderwriter,
        ) ??
        resolveUnderwriterLink(
            app.claimedByUnderwriterId,
            app.claimedByUnderwriter,
        )
    );
}

/** Populated from `GET /applications` include `approvedByUnderwriter` (name/email). */
export function formatApprovedByUnderwriterLabel(
    app: UnderwriterApprovalAppFields,
    viewerUserId?: string | null,
): string | null {
    const resolved = resolveApprovingUnderwriter(app);
    if (!resolved) return null;

    if (
        viewerUserId &&
        resolved.id &&
        String(viewerUserId) === String(resolved.id)
    ) {
        return "You";
    }

    return formatUserLiteName(resolved.user);
}

export function formatUserLiteName(user?: ApplicationUserLite | null): string | null {
    if (!user) return null;
    const fn = (user.firstName ?? "").trim();
    const ln = (user.lastName ?? "").trim();
    const full = [fn, ln].filter(Boolean).join(" ");
    if (full) return full;
    if (user.email?.trim()) return user.email.trim();
    return null;
}
