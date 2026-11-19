/**
 * Automatic DocuSign REST sync is disabled — Connect webhooks + Socket.IO own status.
 * Manual Refresh passes `force: true` and still goes through server-side throttles.
 */
export const DOCUSIGN_STATUS_SYNC_MIN_INTERVAL_MS = 10 * 60_000;

/**
 * Kept for API compatibility. Automatic stale fallback is OFF (see shouldFallbackPollDocuSign).
 */
export const DOCUSIGN_WEBHOOK_STALE_MS = Number.POSITIVE_INFINITY;

/** CRM-only refresh while waiting for webhooks (no DocuSign API). */
export const DOCUSIGN_CRM_STATUS_POLL_MS = 2 * 60_000;

export function isDocuSignPollingLimitError(message: string): boolean {
    return /burst_envelope_polling|hourly_envelope_polling|polling.?limit|hourly_apiinvocation|apiinvocation.?limit|api.?invocation.?limit|rate.?limit|cooldown is active|too many requests|status code 429|\b429\b/i.test(
        message,
    );
}

export function formatDocuSignSyncErrorMessage(err: unknown, context: string): string {
    const fromAxios = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
    const raw =
        (typeof fromAxios === "string" && fromAxios.trim()) ||
        (err instanceof Error ? err.message : String(err ?? ""));
    if (isDocuSignPollingLimitError(raw)) {
        return `DocuSign polling/API limit reached for ${context}. Status updates via webhook — wait about an hour, then use Refresh once.`;
    }
    if (raw.trim()) return raw.trim();
    return `Could not refresh ${context} status.`;
}

/** True when status is still in-flight and Connect may have missed an update. */
export function isDocuSignStatusInProgress(status: string | null | undefined): boolean {
    const s = String(status ?? "")
        .trim()
        .toLowerCase();
    if (!s) return false;
    // signed / completed / voided are terminal — do not keep polling DocuSign.
    return (
        s === "sent" ||
        s === "delivered" ||
        s === "viewed" ||
        s === "processing" ||
        s === "created" ||
        s === "draft"
    );
}

/** Statuses that mean stop automatic DocuSign status checks. */
export function isDocuSignStatusTerminal(status: string | null | undefined): boolean {
    const s = String(status ?? "")
        .trim()
        .toLowerCase();
    return (
        s === "signed" ||
        s === "completed" ||
        s === "voided" ||
        s === "revoked" ||
        s === "declined" ||
        s === "expired"
    );
}

const terminalEnvelopeIds = new Set<string>();

/** Mark envelope terminal from realtime webhook so later syncs skip DocuSign GET. */
export function markDocuSignEnvelopeTerminal(envelopeId: string): void {
    const eid = String(envelopeId ?? "").trim();
    if (eid) terminalEnvelopeIds.add(eid);
}

export function isDocuSignEnvelopeSyncTerminal(envelopeId: string): boolean {
    return terminalEnvelopeIds.has(String(envelopeId ?? "").trim());
}

/**
 * Automatic DocuSign REST polling is disabled to protect the 250/hour envelope GET budget.
 * Only manual Refresh / explicit force may sync — never after signed/completed.
 */
export function shouldFallbackPollDocuSign(args: {
    force?: boolean;
    signingFinished?: boolean;
    lastCrmStatusAtMs: number;
    nowMs?: number;
    staleMs?: number;
}): boolean {
    if (args.signingFinished) return false;
    if (args.force) return true;
    return false;
}
