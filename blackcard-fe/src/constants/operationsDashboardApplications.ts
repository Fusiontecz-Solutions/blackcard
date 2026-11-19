/**
 * URL/query value when no operations stage filter is applied
 * (`/applications?fromDashboard=operations&operationsStatus=all`). The list API is called without `operationsStatus`.
 */
export const OPERATIONS_APPLICATIONS_LIST_ALL_QUERY = "all";

/** Approval workflow substages (between Underwriter and Contract). */
export const OPERATIONS_APPROVAL_PIPELINE_STATUSES = [
  "Approved_By_UW",
  "Approval_Sent",
  "Approved_By_ISO",
] as const;

export type OperationsApprovalPipelineStatus =
  (typeof OPERATIONS_APPROVAL_PIPELINE_STATUSES)[number];

/** Backend `operationsStatus` values used by Operations dashboard stat cards and `/applications` filtering. */
export const OPERATIONS_DASHBOARD_APPLICATION_STATUSES = [
  ...OPERATIONS_APPROVAL_PIPELINE_STATUSES,
  "Approved",
  "Contract_Pending",
  "Contract_Generated",
  "Contract_Sent",
  "Contract_Cancelled",
  "Contract_Out",
  "Contracted",
  "Contract_Signed",
  "Reinitiate_Contract",
  "Signed_Contracts",
  "Funding Call",
  "Finals_And_Funding_Call",
  "Disbursment",
  "On_Hold",
  "Missing_Documents",
  "Funded",
  "Declined",
  "Decline_Request",
  "Declined_By_Scrubber",
  "Declined_By_Underwriter",
  "Declined_By_Admin",
  "Recently_Deleted",
  "Not_A_Application",
  "Old_Not_Scrubbed",
] as const;

export type OperationsDashboardApplicationStatus =
  (typeof OPERATIONS_DASHBOARD_APPLICATION_STATUSES)[number];

/** Deal-pipeline queue stages (aligned with Deal Pipeline `/applications?operationsStatus=`). */
export const OPERATIONS_PIPELINE_QUEUE_STATUSES = [
  "Agent",
  "Scrubbing",
  "Underwriter",
  "Final_Approval",
  "Final",
] as const;

export type OperationsPipelineQueueStatus =
  (typeof OPERATIONS_PIPELINE_QUEUE_STATUSES)[number];

/** All values valid for operations applications list + application-details depth rules. */
export const OPERATIONS_APPLICATIONS_LIST_STATUSES = [
  ...OPERATIONS_DASHBOARD_APPLICATION_STATUSES,
  ...OPERATIONS_PIPELINE_QUEUE_STATUSES,
] as const;

export type OperationsApplicationsListStatus =
  (typeof OPERATIONS_APPLICATIONS_LIST_STATUSES)[number];

const STATUS_LABELS: Record<OperationsApplicationsListStatus, string> = {
  Approved_By_UW: "Approved By UW",
  Approval_Sent: "Approval Sent",
  Approved_By_ISO: "Approved By ISO",
  Approved: "Approved",
  Contract_Pending: "Contract Pending",
  Contract_Generated: "Contract Generated",
  Contract_Sent: "Contract Sent",
  Contract_Cancelled: "Contract Cancelled",
  Contract_Out: "Contract Out",
  Contracted: "Contracted",
  Contract_Signed: "Contract Signed",
  Reinitiate_Contract: "Reinitiated Contract",
  Signed_Contracts: "Signed Contracts",
  "Funding Call": "Funding Call",
  Finals_And_Funding_Call: "Finals and Funding Call",
  Disbursment: "Disbursement",
  On_Hold: "On Hold",
  Missing_Documents: "Missing Documents",
  Funded: "Funded",
  Declined: "Decline",
  Decline_Request: "Decline request",
  Declined_By_Scrubber: "Declined by scrubber",
  Declined_By_Underwriter: "Declined by underwriter",
  Declined_By_Admin: "Declined by admin",
  Recently_Deleted: "Recently Deleted",
  Not_A_Application: "Not A Submission",
  Old_Not_Scrubbed: "Old - Not Scrubbed",
  Agent: "Agent",
  Scrubbing: "Scrubbing",
  "Underwriter": "Underwriter",
  Final_Approval: "Final Approval",
  Final: "Final",
};

/**
 * Operations dashboard filters where each row should show its inferred pipeline
 * status instead of forcing the dashboard bucket label on every row.
 */
export const OPERATIONS_DASHBOARD_PER_ROW_STATUS_FILTERS = new Set<
  OperationsApplicationsListStatus
>([
  "Agent",
  "Scrubbing",
  "Underwriter",
  "Final_Approval",
  "Approved_By_UW",
  "Approval_Sent",
  "Approved_By_ISO",
  "Approved",
  "Contract_Pending",
  "Contract_Generated",
  "Contract_Sent",
  "Contract_Cancelled",
  "Contract_Out",
  "Contracted",
  "Contract_Signed",
  "Reinitiate_Contract",
  "Signed_Contracts",
  "Final",
  "Funding Call",
  "Finals_And_Funding_Call",
]);

const ALLOWED = new Set<string>(OPERATIONS_APPLICATIONS_LIST_STATUSES);

/** Normalize query param (slug or mixed case) to API `operationsStatus`. */
export function normalizeOperationsDashboardStatusParam(
  raw: string | null,
): OperationsApplicationsListStatus | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (ALLOWED.has(trimmed)) {
    return trimmed as OperationsApplicationsListStatus;
  }
  const key = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  const map: Record<string, OperationsApplicationsListStatus> = {
    contract_pending: "Contract_Pending",
    contract_generated: "Contract_Generated",
    contract_sent: "Contract_Sent",
    contract_cancelled: "Contract_Cancelled",
    contract_canceled: "Contract_Cancelled",
    contract_out: "Contract_Out",
    contracted: "Contracted",
    contracts_out: "Contract_Out",
    contract_signed: "Contract_Signed",
    reinitiate_contract: "Reinitiate_Contract",
    reinitiated_contract: "Reinitiate_Contract",
    signed_contracts: "Contract_Signed",
    funding_call: "Funding Call",
    finals_and_funding_call: "Finals_And_Funding_Call",
    disbursment: "Disbursment",
    disbursement: "Disbursment",
    on_hold: "On_Hold",
    hold: "On_Hold",
    missing_documents: "Missing_Documents",
    funded: "Funded",
    declined: "Declined",
    rejected: "Declined",
    decline_request: "Decline_Request",
    declined_by_scrubber: "Declined_By_Scrubber",
    declined_by_underwriter: "Declined_By_Underwriter",
    declined_by_admin: "Declined_By_Admin",
    recently_deleted: "Recently_Deleted",
    not_a_application: "Not_A_Application",
    notaapplication: "Not_A_Application",
    fake_application: "Not_A_Application",
    fakeapplication: "Not_A_Application",
    old_not_scrubbed: "Old_Not_Scrubbed",
    oldnotscrubbed: "Old_Not_Scrubbed",
    agent: "Agent",
    scrubbing: "Scrubbing",
    underwriter: "Underwriter",
    final_approval: "Final_Approval",
    approved_by_uw: "Approved_By_UW",
    approval_sent: "Approval_Sent",
    approved_by_iso: "Approved_By_ISO",
    approved: "Approved",
    final: "Final",
  };
  const mapped = map[key];
  return mapped ?? null;
}

/** Normalize queue/status strings for pipeline-stage inference (no spaces, lowercase). */
function normalizePipelineKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

/**
 * Maps loaded application workflow fields to an operations list status so
 * detail tabs match the deal stage (e.g. opening a row from Total Cases / “all”).
 */
export function inferOperationsListStatusFromApplication(
  currentQueue: string | null | undefined,
  options?: {
    explicitStatus?: string | null;
    currentState?: string | null;
  },
): OperationsApplicationsListStatus | null {
  const q = normalizePipelineKey(currentQueue);
  const st = normalizePipelineKey(options?.explicitStatus);
  const state = normalizePipelineKey(options?.currentState);

  if (
    q === "fakeapplication" ||
    st === "fakeapplication" ||
    state === "fakeapplication" ||
    q === "notaapplication" ||
    st === "notaapplication" ||
    state === "notaapplication"
  ) {
    return "Not_A_Application";
  }

  if (q === "oldnotscrubbed" || st === "oldnotscrubbed" || state === "oldnotscrubbed") {
    return "Old_Not_Scrubbed";
  }

  if (st === "funded" || q === "funded") return "Funded";
  if (
    q === "disbursment" ||
    q === "disbursement" ||
    (q.length > 0 && q.includes("disburs"))
  ) {
    return "Disbursment";
  }
  if (q === "fundingcall" || (q.includes("funding") && q.includes("call"))) {
    return "Funding Call";
  }
  if (q === "onhold") return "On_Hold";
  if (q === "missingdocuments") return "Missing_Documents";
  if (q === "final" && !q.includes("scrubbing")) return "Final";
  if (q === "underwriter" || q === "finalreview") return "Underwriter";
  if (q === "finalapproval" || state === "finalapproval") return "Final_Approval";
  if (q === "underwriterapproved" && state === "underwriterapproved") {
    return "Approved_By_UW";
  }
  if (q === "approvalsent" || state === "approvalsent") {
    return "Approval_Sent";
  }
  if (q === "isoapproved" || state === "isoapproved") {
    return "Approved_By_ISO";
  }
  if (q === "approved" && state === "approved") {
    return "Approved_By_ISO";
  }
  if (
    q === "scrubbing" ||
    q === "underwriting" ||
    q === "review"
  ) {
    return "Scrubbing";
  }
  if (q === "contractgenerated") {
    return "Contract_Generated";
  }
  if (q === "contractsent") {
    return "Contract_Sent";
  }
  if (q === "contractcancelled" || q === "contractcanceled") {
    return "Contract_Cancelled";
  }
  if (q === "contractout" || q === "contractsout") {
    return "Contract_Sent";
  }
  if (q === "contractsigned" || q === "signedcontracts") {
    return "Contract_Signed";
  }
  if (q === "declined" || q === "rejected") {
    return "Declined";
  }
  if (state === "signedcontracts" || state === "signed_contracts") {
    return "Contract_Signed";
  }
  if (q === "contractpending" || state === "contractpending") {
    return "Contract_Pending";
  }
  if (q === "contracted" || st === "contracted") {
    return "Contracted";
  }
  if (q === "new" || q === "agent" || q === "draft") return "Agent";
  if (state === "completed" && st === "approved") return "Funded";

  return null;
}

export function normalizeFundingCallStatus(
  value: string | null | undefined,
): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

/** Latest persisted funding call status is "Call Done" (case / spacing insensitive). */
export function isFundingCallStatusCallDone(
  value: string | null | undefined,
): boolean {
  return normalizeFundingCallStatus(value) === "calldone";
}

/** Latest funding call status is "Rejected" (case / spacing insensitive). */
export function isFundingCallStatusRejected(
  value: string | null | undefined,
): boolean {
  return normalizeFundingCallStatus(value) === "rejected";
}

/**
 * Whether the Disbursement tab may be opened for Operations / Super Admin.
 * Locked only when the latest funding call status is Rejected; any other saved
 * call status unlocks it, as does a deal already in Disbursement / Funded.
 */
export function canOpenDisbursementTab(
  currentQueue: string | null | undefined,
  options?: {
    explicitStatus?: string | null;
    currentState?: string | null;
    latestFundingCallStatus?: string | null;
  },
): boolean {
  const callStatus = options?.latestFundingCallStatus;

  if (isFundingCallStatusRejected(callStatus)) {
    return false;
  }

  if (callStatus && String(callStatus).trim()) {
    return true;
  }

  const inferred = inferOperationsListStatusFromApplication(currentQueue, options);
  if (inferred === "Disbursment" || inferred === "Funded") {
    return true;
  }

  const st = normalizePipelineKey(options?.explicitStatus);
  const state = normalizePipelineKey(options?.currentState);

  if (st === "funded" || state === "funded") return true;
  if (
    st === "disbursment" ||
    st === "disbursement" ||
    state === "disbursment" ||
    state === "disbursement"
  ) {
    return true;
  }

  return false;
}

/** @deprecated Use {@link canOpenDisbursementTab} — kept for existing imports. */
export function isApplicationAtOrPastFundingCallForDisbursement(
  currentQueue: string | null | undefined,
  options?: {
    explicitStatus?: string | null;
    currentState?: string | null;
    latestFundingCallStatus?: string | null;
  },
): boolean {
  return canOpenDisbursementTab(currentQueue, options);
}

export function operationsDashboardStatusTitle(
  status: OperationsApplicationsListStatus,
): string {
  return STATUS_LABELS[status] ?? status;
}
