/**
 * Operations dashboard / Super Admin deal pipeline: opens main `Applications` with
 * `fromDashboard=operations` and `operationsStatus` (backend bucket), same table UX
 * as agent/scrubbing `buildApplicationsBrowseUrl` drill-downs.
 */
export function buildOperationsPipelineApplicationsUrl(
  operationsStatus: string,
): string {
  const qs = new URLSearchParams();
  qs.set("fromDashboard", "operations");
  qs.set("operationsStatus", operationsStatus.trim());
  return `/applications?${qs.toString()}`;
}

/** Underwriter sidebar pipeline — deal pool, action history, or queue drill-down. */
export function buildUnderwriterPipelineApplicationsUrl(options: {
  operationsStatus?: string;
  underwriterClaim?: "unclaimed" | "claimed" | "mine";
  underwriterPipeline?: string;
}): string {
  if (options.underwriterPipeline?.trim()) {
    const qs = new URLSearchParams();
    qs.set("underwriterPipeline", options.underwriterPipeline.trim());
    return `/applications?${qs.toString()}`;
  }
  if (options.underwriterClaim) {
    const qs = new URLSearchParams();
    qs.set("underwriterClaim", options.underwriterClaim);
    return `/applications?${qs.toString()}`;
  }
  if (options.operationsStatus?.trim()) {
    return buildOperationsPipelineApplicationsUrl(options.operationsStatus.trim());
  }
  return "/applications";
}

/** Query value for `GET /applications?statsBucket=` — must match backend `buildApplicationStatsBucketWhere`. */
export const DASHBOARD_APPLICATION_STATS_BUCKET = {
  FUNDED: "funded",
  APPROVED: "approved",
  REJECTED: "rejected",
  WORKFLOW_PENDING: "workflow_pending",
  WORKFLOW_IN_PROGRESS: "workflow_in_progress",
  UNDERWRITING: "underwriting",
  /** Admin dashboard “Pending” (pre-funding pipeline queues), not agent workflow pending */
  PENDING_PIPELINE: "pending_pipeline",
  /** Stats “In Process” bucket (new / agent / review / final stages) */
  IN_PROCESS: "in_process",
} as const;

export type DashboardApplicationStatsBucket =
  (typeof DASHBOARD_APPLICATION_STATS_BUCKET)[keyof typeof DASHBOARD_APPLICATION_STATS_BUCKET];

export function buildApplicationsBrowseUrl(options: {
  statsBucket?: DashboardApplicationStatsBucket | string;
  currentQueue?: string;
  viewOnly?: boolean;
  /** SCRUBBING: scope drill-down to Queue / Claimed / My deals. */
  underwriterClaim?: "unclaimed" | "claimed" | "mine";
}): string {
  const qs = new URLSearchParams();
  if (options.statsBucket) {
    qs.set("statsBucket", options.statsBucket);
  }
  if (options.currentQueue) {
    qs.set("currentQueue", options.currentQueue);
  }
  if (options.underwriterClaim) {
    qs.set("underwriterClaim", options.underwriterClaim);
  }
  if (options.viewOnly !== false) {
    qs.set("viewOnly", "1");
  }
  const s = qs.toString();
  return s ? `/applications/browse?${s}` : "/applications/browse";
}

/** Map stat card titles used on the dashboard / applications headers to API bucket or queue. */
export function statCardTitleToApplicationsQuery(title: string): {
  statsBucket?: string;
  currentQueue?: string;
} {
  const t = title.trim().toLowerCase();
  if (t === "funded" || t === "funded deals" || t === "funded applications") {
    return { statsBucket: DASHBOARD_APPLICATION_STATS_BUCKET.FUNDED };
  }
  if (t === "approved") {
    return { statsBucket: DASHBOARD_APPLICATION_STATS_BUCKET.APPROVED };
  }
  if (t === "rejected") {
    return { statsBucket: DASHBOARD_APPLICATION_STATS_BUCKET.REJECTED };
  }
  if (t === "pending") {
    return { statsBucket: DASHBOARD_APPLICATION_STATS_BUCKET.WORKFLOW_PENDING };
  }
  if (t === "in progress") {
    return { statsBucket: DASHBOARD_APPLICATION_STATS_BUCKET.WORKFLOW_IN_PROGRESS };
  }
  if (t === "in process") {
    return { statsBucket: DASHBOARD_APPLICATION_STATS_BUCKET.IN_PROCESS };
  }
  if (t === "underwriting") {
    return { statsBucket: DASHBOARD_APPLICATION_STATS_BUCKET.UNDERWRITING };
  }
  return {};
}
