import {
  normalizeOperationsDashboardStatusParam,
  OPERATIONS_APPLICATIONS_LIST_ALL_QUERY,
} from "@/constants/operationsDashboardApplications";
import { normalizeUnderwriterPipelineParam } from "@/constants/underwriterPipeline";
import { FAKE_APPLICATION_QUEUE, OLD_NOT_SCRUBBED_QUEUE } from "@/lib/notMcaApplication";
import type { GetApplicationsParams } from "@/types/applicationTypes";
import type { SortingState } from "@tanstack/react-table";

/** Legacy pipeline dropdown labels → `operationsStatus` API keys. */
const PIPELINE_STATUS_LEGACY_TO_OPERATIONS: Record<string, string> = {
  "Contract Generated": "Contract_Generated",
  "Contract Sent": "Contract_Sent",
  "Contract Cancelled": "Contract_Cancelled",
  "Funding call": "Funding Call",
  Disbursement: "Disbursment",
  Contract_Signed: "Contract_Signed",
  Signed_Contracts: "Signed_Contracts",
};

/** Maps `/applications` pipeline filter selection to GET /applications query fields. */
export function pipelineStatusFilterToApiFields(
  statusFilter: string,
): Pick<GetApplicationsParams, "currentQueue" | "operationsStatus"> {
  if (statusFilter === "all") return {};
  const operationsStatus =
    PIPELINE_STATUS_LEGACY_TO_OPERATIONS[statusFilter] ?? statusFilter;
  return { operationsStatus };
}

export const DEFAULT_APPLICATIONS_PAGE_SIZE = 10;

/** Application `type` field — matches create form + operations bypass intake. */
export const APPLICATION_TYPE_FILTER_OPTIONS = [
  { label: "New Application", value: "New" },
  { label: "Renewal", value: "Renewal" },
  { label: "Modification", value: "Modification" },
  { label: "Bypass", value: "Bypass" },
] as const;

export function applicationTypeFilterLabel(typeFilter: string): string {
  if (typeFilter === "all") return "All types";
  const match = APPLICATION_TYPE_FILTER_OPTIONS.find((o) => o.value === typeFilter);
  return match?.label ?? typeFilter;
}

/** Application `priority` field — matches create form options. */
export const APPLICATION_PRIORITY_FILTER_OPTIONS = [
  { label: "Low", value: "Low" },
  { label: "Medium", value: "Medium" },
  { label: "High", value: "High" },
  { label: "Urgent", value: "Urgent" },
] as const;

export function applicationPriorityFilterLabel(priorityFilter: string): string {
  if (priorityFilter === "all") return "All priorities";
  const match = APPLICATION_PRIORITY_FILTER_OPTIONS.find(
    (o) => o.value === priorityFilter,
  );
  return match?.label ?? priorityFilter;
}

/** Auto-tagged organization for imported deals. */
export const APPLICATION_ORGANIZATION_FILTER_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
];

export function applicationOrganizationFilterLabel(
  organizationFilter: string,
): string {
  if (organizationFilter === "all") return "All organizations";
  const match = APPLICATION_ORGANIZATION_FILTER_OPTIONS.find(
    (o) => o.value === organizationFilter,
  );
  return match?.label ?? organizationFilter;
}

/** Default ordering for the main applications table (newest first). */
export const APPLICATIONS_LIST_DEFAULT_SORT: Pick<
  GetApplicationsParams,
  "sortBy" | "sortOrder"
> = {
  sortBy: "createdAt",
  sortOrder: "desc",
};

/** URL → underwriter sidebar pipeline (`/applications?underwriterPipeline=`). */
export function parseUnderwriterPipelineFromSearch(
  search: string,
): ReturnType<typeof normalizeUnderwriterPipelineParam> {
  const raw = new URLSearchParams(search).get("underwriterPipeline");
  return normalizeUnderwriterPipelineParam(raw);
}

/** URL → scrubber / underwriter deal-pool tab (`/applications?underwriterClaim=`). */
export type UnderwriterClaimParam = "unclaimed" | "claimed" | "mine";

export type ScrubberPoolTab = "queue" | "claimed" | "my";

export function parseUnderwriterClaimFromSearch(
  search: string,
): UnderwriterClaimParam | undefined {
  const raw = new URLSearchParams(search).get("underwriterClaim")?.trim().toLowerCase();
  if (raw === "unclaimed" || raw === "claimed" || raw === "mine") return raw;
  return undefined;
}

export function poolTabFromUnderwriterClaim(
  claim: UnderwriterClaimParam | undefined,
): ScrubberPoolTab {
  if (claim === "claimed") return "claimed";
  if (claim === "mine") return "my";
  return "queue";
}

export function underwriterClaimFromPoolTab(
  tab: ScrubberPoolTab,
  roleKey: string,
): UnderwriterClaimParam {
  const normalizedRole = roleKey.toUpperCase().replace(/-/g, "_");
  if (normalizedRole === "SCRUBBING") {
    if (tab === "claimed") return "claimed";
    if (tab === "my") return "mine";
    return "unclaimed";
  }
  return tab === "my" ? "mine" : "unclaimed";
}

/** URL → organization / funder filter (`/applications?organization=`). */
export function parseOrganizationFromSearch(search: string): string {
  const raw = new URLSearchParams(search).get("organization")?.trim() ?? "";
  return raw || "all";
}

/** Build `/applications` URL scoped to a funder/organization book. */
export function buildApplicationsOrganizationUrl(organization: string): string {
  const name = organization.trim();
  if (!name || name.toLowerCase() === "all") return "/applications";
  const qs = new URLSearchParams();
  qs.set("organization", name);
  return `/applications?${qs.toString()}`;
}

/** URL → list filters (operations dashboard drill-down). */
export function parseApplicationsListRouteFilters(search: string): {
  dashboardStateFilter: string;
  statusFilter: string;
} {
  const query = new URLSearchParams(search);
  const operationsStatusFromQuery =
    query.get("operationsStatus") || query.get("currentState");
  const fromDashboard = query.get("fromDashboard");
  if (fromDashboard === "operations" && operationsStatusFromQuery) {
    const normalized =
      normalizeOperationsDashboardStatusParam(operationsStatusFromQuery) ??
      operationsStatusFromQuery.trim();
    return { dashboardStateFilter: normalized, statusFilter: "all" };
  }
  return { dashboardStateFilter: "", statusFilter: "all" };
}

/** Apply search, type, priority, organization, and claim-assignment filters (always sent to the API). */
function applyCommonApplicationsListFilters(
  params: GetApplicationsParams,
  options: {
    searchTerm: string;
    typeFilter?: string;
    priorityFilter?: string;
    organizationFilter?: string;
    scrubberFilter?: string;
    underwriterFilter?: string;
  },
): void {
  if (options.searchTerm) {
    params.search = options.searchTerm;
  }
  if (options.typeFilter && options.typeFilter !== "all") {
    params.type = options.typeFilter;
  }
  if (options.priorityFilter && options.priorityFilter !== "all") {
    params.priority = options.priorityFilter;
  }
  if (options.organizationFilter && options.organizationFilter !== "all") {
    params.organization = options.organizationFilter;
  }
  if (options.scrubberFilter && options.scrubberFilter !== "all") {
    params.claimedByUnderwriterId = options.scrubberFilter;
  }
  if (options.underwriterFilter && options.underwriterFilter !== "all") {
    params.assignedUnderwriterId = options.underwriterFilter;
  }
}

/** Same rules as `Applications` / `getApplications` list (operations vs queue dropdown). */
export function buildApplicationsListParams(options: {
  pageIndex: number;
  pageSize: number;
  searchTerm: string;
  dashboardStateFilter: string;
  statusFilter: string;
  /** `all` or application type value (New, Renewal, …). */
  typeFilter?: string;
  /** `all` or priority value (Low, Medium, High, Urgent). */
  priorityFilter?: string;
  /** `all` or organization value (Katan II, Katan III). */
  organizationFilter?: string;
    /** SCRUBBING / UNDERWRITER: narrow list to pool vs claimed vs completed deals. */
    underwriterClaim?: UnderwriterClaimParam;
    /** Scrubbing: only deals an Underwriter sent back for correction. */
    returnedForCorrection?: boolean;
    /** UNDERWRITER: sidebar pipeline drill-down scoped to the logged-in underwriter. */
    underwriterPipeline?: string;
  /** SUPER_ADMIN / OPERATIONS: scrubbing-stage claim user id. */
  scrubberFilter?: string;
  /** SUPER_ADMIN / OPERATIONS: assigned underwriter user id. */
  underwriterFilter?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /**
   * When true (operations sidebar: `fromDashboard=operations`), `dashboardStateFilter`
   * drives `operationsStatus`. When false, the pipeline dropdown (`statusFilter`) wins.
   */
  useDashboardStageFilter?: boolean;
  /** Filter by Application.createdAt (YYYY-MM-DD, Eastern calendar day). */
  startDate?: string;
  endDate?: string;
}): GetApplicationsParams {
  const params: GetApplicationsParams = {
    page: options.pageIndex + 1,
    limit: options.pageSize,
    ...APPLICATIONS_LIST_DEFAULT_SORT,
    lite: true,
  };
  if (options.sortBy) {
    params.sortBy = options.sortBy;
    params.sortOrder = options.sortOrder ?? "asc";
  }
  applyCommonApplicationsListFilters(params, options);

  const withCreatedAtRange = (p: GetApplicationsParams): GetApplicationsParams => {
    if (options.startDate) p.startDate = options.startDate;
    if (options.endDate) p.endDate = options.endDate;
    return p;
  };

  if (options.returnedForCorrection) {
    params.returnedForCorrection = 1;
    return withCreatedAtRange(params);
  }
  if (options.underwriterPipeline) {
    params.underwriterPipeline = options.underwriterPipeline;
    return withCreatedAtRange(params);
  }
  if (options.underwriterClaim) {
    params.underwriterClaim = options.underwriterClaim;
    return withCreatedAtRange(params);
  }

  const normalizedDashboardStatus = normalizeOperationsDashboardStatusParam(
    options.dashboardStateFilter,
  );
  if (normalizedDashboardStatus === "Old_Not_Scrubbed") {
    params.currentQueue = OLD_NOT_SCRUBBED_QUEUE;
    return withCreatedAtRange(params);
  }
  if (normalizedDashboardStatus === "Not_A_Application") {
    params.currentQueue = FAKE_APPLICATION_QUEUE;
    return withCreatedAtRange(params);
  }

  if (options.useDashboardStageFilter && options.dashboardStateFilter) {
    const isAllPipeline =
      options.dashboardStateFilter === OPERATIONS_APPLICATIONS_LIST_ALL_QUERY ||
      options.dashboardStateFilter.toLowerCase() === "all";
    if (!isAllPipeline) {
      params.operationsStatus = options.dashboardStateFilter;
    }
    return withCreatedAtRange(params);
  }

  if (options.statusFilter !== "all") {
    Object.assign(params, pipelineStatusFilterToApiFields(options.statusFilter));
    return withCreatedAtRange(params);
  }

  if (options.dashboardStateFilter) {
    const isAllPipeline =
      options.dashboardStateFilter === OPERATIONS_APPLICATIONS_LIST_ALL_QUERY ||
      options.dashboardStateFilter.toLowerCase() === "all";
    if (!isAllPipeline) {
      params.operationsStatus = options.dashboardStateFilter;
    }
  }
  return withCreatedAtRange(params);
}

const TABLE_COLUMN_TO_API_SORT: Record<string, string> = {
  dealId: "dealId",
  businessName: "businessName",
  email: "email",
  loanAmount: "loanAmount",
  createdAt: "createdAt",
  lastModifiedAt: "lastModifiedAt",
  status: "status",
};

/** Map TanStack table sorting state to GET /applications `sortBy` / `sortOrder`. */
export function applicationsListSortFromTable(
  sorting: SortingState,
): Pick<GetApplicationsParams, "sortBy" | "sortOrder"> {
  const active = sorting[0];
  if (!active?.id) return {};
  const sortBy = TABLE_COLUMN_TO_API_SORT[active.id];
  if (!sortBy) return {};
  return {
    sortBy,
    sortOrder: active.desc ? "desc" : "asc",
  };
}

/** First-page request for the current URL (route loader + cache key). */
export function buildInitialApplicationsListParamsFromSearch(
  urlSearch: string,
): GetApplicationsParams {
  const query = new URLSearchParams(urlSearch);
  const { dashboardStateFilter, statusFilter } =
    parseApplicationsListRouteFilters(urlSearch);
  const useDashboardStageFilter =
    query.get("fromDashboard") === "operations";
  const underwriterClaim = parseUnderwriterClaimFromSearch(urlSearch);
  const underwriterPipeline = parseUnderwriterPipelineFromSearch(urlSearch);
  const startDate =
    query.get("startDate")?.trim() ||
    query.get("from")?.trim() ||
    undefined;
  const endDate =
    query.get("endDate")?.trim() ||
    query.get("to")?.trim() ||
    undefined;
  return buildApplicationsListParams({
    pageIndex: 0,
    pageSize: DEFAULT_APPLICATIONS_PAGE_SIZE,
    searchTerm: "",
    dashboardStateFilter,
    statusFilter,
    underwriterClaim,
    underwriterPipeline,
    useDashboardStageFilter,
    startDate,
    endDate,
  });
}
