import { inferOperationsListStatusFromApplication } from "@/constants/operationsDashboardApplications";
import { resolveApplicationProgress } from "@/lib/applicationProgress";
import { isContractSignedQueueBadgeLabel } from "@/lib/contractSignedQueueBadge";
import { isUnderwriterApprovedApplication } from "@/lib/underwriterApprovalLabel";

/**
 * Workflow labels for "Current state" / summary — aligned with API `mapApplicationToApi` / `toWorkflowApiState`.
 */

/** First review stage queue (stored as `Scrubbing`; legacy: Underwriting). */
export function isScrubbingWorkflowQueue(queue: string | null | undefined): boolean {
  const q = String(queue ?? "").trim().toLowerCase();
  return q === "scrubbing" || q === "underwriting" || q === "review";
}

/** Final review stage queue (stored as `Underwriter`; legacy: Final Review / Final Underwriter). */
export function isFinalUnderwriterWorkflowQueue(queue: string | null | undefined): boolean {
  const q = String(queue ?? "").trim().toLowerCase();
  return q === "underwriter" || q === "final review" || q === "final scrubbing";
}

/** Final approval stage queue (stored as `Final Approval`). */
export function isFinalApprovalWorkflowQueue(queue: string | null | undefined): boolean {
  const q = String(queue ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return q === "finalapproval";
}

type WorkflowDecisionApp = {
  currentQueue?: string | null;
  currentState?: string | null;
  queue?: string | null;
  state?: string | null;
  status?: string | null;
  statsCurrentState?: string | null;
};

/** Raw DB state + mapped API fields — `statsCurrentState` wins when the API collapses workflow labels. */
export function resolveApplicationWorkflowQueueAndStates(
  app: WorkflowDecisionApp | null | undefined,
): {
  queue: string;
  mappedState: string;
  rawState: string;
} {
  if (!app) return { queue: "", mappedState: "", rawState: "" };
  const queue = String(app.currentQueue ?? app.queue ?? "").trim();
  const mappedState = String(
    app.currentState ?? app.state ?? app.status ?? "",
  ).trim();
  const rawState = String(app.statsCurrentState ?? mappedState).trim();
  return { queue, mappedState, rawState };
}

/** True when the deal is in the contract-signed stage (queue and/or raw DB state). */
export function isContractSignedApplication(
  app: WorkflowDecisionApp | null | undefined,
): boolean {
  if (!app) return false;
  const { queue, mappedState, rawState } =
    resolveApplicationWorkflowQueueAndStates(app);
  if (
    isContractSignedQueueBadgeLabel(queue) ||
    isContractSignedQueueBadgeLabel(mappedState) ||
    isContractSignedQueueBadgeLabel(rawState)
  ) {
    return true;
  }
  if (resolveApplicationProgress(app).currentStageKey === "CONTRACT_SIGNED") {
    return true;
  }
  return (
    inferOperationsListStatusFromApplication(queue, {
      currentState: rawState || mappedState,
      explicitStatus: mappedState,
    }) === "Contract_Signed"
  );
}

/** True when the deal is awaiting underwriter final approval (queue and/or raw DB state). */
export function isApplicationInFinalApprovalStage(
  app: WorkflowDecisionApp | null | undefined,
): boolean {
  const { queue, mappedState, rawState } =
    resolveApplicationWorkflowQueueAndStates(app);
  return (
    isFinalApprovalWorkflowQueue(queue) ||
    isFinalApprovalWorkflowQueue(mappedState) ||
    isFinalApprovalWorkflowQueue(rawState)
  );
}

/**
 * Queues/states where the UNDERWRITER role should keep decision CTAs visible
 * (first approval in `Underwriter`, post-approve `Underwriter Approved`, admin-sent `Final Approval`).
 */
export function isUnderwriterWorkflowDecisionStage(
  app: WorkflowDecisionApp | null | undefined,
): boolean {
  if (!app) return false;
  const { queue } = resolveApplicationWorkflowQueueAndStates(app);
  if (isFinalUnderwriterWorkflowQueue(queue)) return true;
  if (isApplicationInFinalApprovalStage(app)) return true;
  if (isUnderwriterApprovedApplication(app as Record<string, unknown>)) return true;
  const q = String(queue ?? "").trim().toLowerCase();
  return q === "scrubbing" || q === "underwriting" || q === "review";
}

export function getWorkflowCurrentStateLabel(app: {
  currentQueue?: string | null;
  queue?: string | null;
  currentState?: string | null;
  state?: string | null;
  status?: string | null;
}): string {
  const queue = app.currentQueue || app.queue || "";
  const state = app.currentState || app.state || "";

  if (queue === "Final") return "FINAL";
  if (queue === "Funding Call") return "FUNDING CALL";
  if (queue === "Disbursement") return "DISBURSEMENT";
  if (queue === "Funded") return "FUNDED";

  if (queue === "Approved") {
    if (state === "Completed") return "Funded";
    return "Approved";
  }
  if (queue === "Declined") return "Rejected";
  if (
    queue === "fake Application" ||
    queue === "Fake Application" ||
    queue === "Not A Submission"
  ) {
    return "Not A Submission";
  }
  if (queue === "Old Not Scrubbed") return "Old - Not Scrubbed";

  if (queue === "Agent" || queue === "New") return "Pending";
  if (queue === "Underwriting" || queue === "Scrubbing" || queue === "Review") {
    return "In Progress";
  }
  if (queue === "Final Review" || queue === "Underwriter") {
    if (state === "Approved" || state === "Completed") return "Approved";
    return "In Progress";
  }

  if (queue === "On Hold") return "Pending";

  if (state === "Cancelled") return "Rejected";
  if (app.status) return String(app.status);

  return "Pending";
}
