import {
  isContractOutQueueBadgeLabel,
  normalizeQueueBadgeLabel,
} from "@/lib/contractOutQueueBadge";
import { isContractSignedQueueBadgeLabel } from "@/lib/contractSignedQueueBadge";

function compactKey(value: string): string {
  return normalizeQueueBadgeLabel(value).replace(/\s+/g, "");
}

import {
  isFinalUnderwriterWorkflowQueue,
  isScrubbingWorkflowQueue,
} from "@/lib/applicationWorkflowState";

/**
 * Deal pipeline CURRENT STATE column — never show generic "Contracted";
 * use Contract Sent vs Contract Signed from queue/state (matches Cases list).
 */
export function formatDealPipelineCurrentStateLabel(app: {
  currentQueue?: string | null;
  queue?: string | null;
  currentState?: string | null;
  state?: string | null;
}): string {
  const queue = String(app.currentQueue ?? app.queue ?? "").trim();
  const state = String(app.currentState ?? app.state ?? "").trim();

  const queueCompact = compactKey(queue);
  const stateCompact = compactKey(state);

  if (
    queueCompact === "approvalsent" ||
    stateCompact === "approvalsent"
  ) {
    return "Approval Sent";
  }

  if (
    queueCompact === "isoapproved" ||
    stateCompact === "isoapproved" ||
    (queueCompact === "approved" && stateCompact === "approved")
  ) {
    return "Approved By ISO";
  }

  if (
    queueCompact === "contractpending" ||
    stateCompact === "contractpending" ||
    state === "Contract_Pending" ||
    state === "CONTRACT_PENDING"
  ) {
    return "Contract Pending";
  }

  if (
    queueCompact === "contractgenerated" ||
    stateCompact === "contractgenerated" ||
    state === "Contract_Generated" ||
    state === "CONTRACT_GENERATED"
  ) {
    return "Contract Generated";
  }

  if (isContractSignedQueueBadgeLabel(queue) || isContractSignedQueueBadgeLabel(state)) {
    return "Contract Signed";
  }

  if (
    stateCompact === "signedcontracts" ||
    stateCompact === "contractsigned" ||
    state === "Signed_Contracts"
  ) {
    return "Contract Signed";
  }

  if (
    queueCompact === "contractsent" ||
    stateCompact === "contractsent" ||
    state === "Contract_Sent" ||
    state === "CONTRACT_SENT"
  ) {
    return "Contract Sent";
  }

  if (isContractOutQueueBadgeLabel(queue) || isContractOutQueueBadgeLabel(state)) {
    return "Contract Sent";
  }

  if (
    queueCompact === "contracted" ||
    stateCompact === "contractsout" ||
    stateCompact === "contractout" ||
    state === "CONTRACTS_OUT" ||
    state === "Contracts_Out"
  ) {
    return "Contract Sent";
  }

  const raw = state || queue;
  if (!raw) return "—";
  if (compactKey(raw) === "contracted") return "Contract Sent";
  if (isFinalUnderwriterWorkflowQueue(queue) || isFinalUnderwriterWorkflowQueue(state)) {
    return "Underwriter";
  }
  if (isScrubbingWorkflowQueue(queue) || isScrubbingWorkflowQueue(state)) {
    return "Scrubbing";
  }

  return raw;
}
