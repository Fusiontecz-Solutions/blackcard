import type { Application } from "@/types/applicationTypes";

const POST_REINITIATION_CONTRACT_QUEUES = new Set([
    "contractgenerated",
    "contractsent",
    "contractout",
    "contractsout",
    "contractsigned",
    "signedcontracts",
]);

const POST_REINITIATION_CONTRACT_STATES = new Set([
    "contractgenerated",
    "contractsent",
    "contractsout",
    "signedcontracts",
    "contractsigned",
]);

const POST_REINITIATION_CONTRACT_STATUSES = new Set([
    "sent",
    "viewed",
    "signed",
    "completed",
    "declined",
    "revoked",
    "expired",
]);

function normalizePipelineToken(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}

function applicationProgressedPastContractReinitiation(
    app: Application | Record<string, unknown> | null | undefined,
): boolean {
    if (!app) return false;

    const document =
        (app as { document?: { envelopeId?: unknown } | null }).document ??
        (
            (app as { contract?: { application?: { document?: { envelopeId?: unknown } | null } } })
                .contract?.application?.document
        );
    if (String(document?.envelopeId ?? "").trim()) return true;

    const contractStatus = normalizePipelineToken(
        (app as { contract?: { status?: unknown } }).contract?.status,
    );
    if (contractStatus && POST_REINITIATION_CONTRACT_STATUSES.has(contractStatus)) {
        return true;
    }

    const queueKey = normalizePipelineToken((app as { currentQueue?: unknown }).currentQueue);
    if (queueKey && POST_REINITIATION_CONTRACT_QUEUES.has(queueKey)) return true;

    const stateKey = normalizePipelineToken((app as { currentState?: unknown }).currentState);
    if (stateKey && POST_REINITIATION_CONTRACT_STATES.has(stateKey)) return true;

    return false;
}

/** Application row flag from API — UW updated offer after a contract was already generated. */
export function applicationNeedsContractReinitiation(
    app: Application | Record<string, unknown> | null | undefined,
): boolean {
    return (app as { needsContractReinitiation?: boolean } | null)?.needsContractReinitiation === true;
}

/**
 * Deal still belongs in the Reinitiate Contract pipeline — flagged for reinitiation and
 * no new DocuSign envelope has been linked yet.
 */
export function applicationAwaitingContractReinitiation(
    app: Application | Record<string, unknown> | null | undefined,
): boolean {
    if (!applicationNeedsContractReinitiation(app)) return false;
    if (applicationProgressedPastContractReinitiation(app)) return false;
    const document =
        (app as { document?: { envelopeId?: unknown } | null } | null)?.document ??
        (
            (app as { contract?: { application?: { document?: { envelopeId?: unknown } | null } } } | null)
                ?.contract?.application?.document
        );
    const envelopeId = String(document?.envelopeId ?? "").trim();
    return !envelopeId;
}

/** ISO approved the updated offer while the deal awaits contract regeneration. */
export function isIsoUpdatedOfferApproved(
    app: Application | Record<string, unknown> | null | undefined,
): boolean {
    return (app as { isoUpdatedOfferApproved?: boolean } | null)?.isoUpdatedOfferApproved === true;
}

/** Label for the Reinitiate Contract list ISO Decision column. */
export function getReinitiateContractIsoDecisionLabel(
    app: Application | Record<string, unknown> | null | undefined,
): string {
    return isIsoUpdatedOfferApproved(app) ? "Approved" : "--";
}
