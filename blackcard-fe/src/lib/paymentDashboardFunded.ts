import { DASHBOARD_APPLICATION_STATS_BUCKET } from "@/constants/dashboardApplicationsNavigation";
import { APPLICATIONS_LIST_DEFAULT_SORT, DEFAULT_APPLICATIONS_PAGE_SIZE } from "@/lib/applicationsListParams";
import type { Application, GetApplicationsParams } from "@/types/applicationTypes";

/** Matches backend funded cohort for payment dashboard lists. */
export function isFundedApplication(app: Application): boolean {
  const q = normalizeStatus(app.currentQueue || app.queue || "");
  if (q === "funded" || q === "disbursement" || q === "disbursment") return true;
  return false;
}

function normalizeStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type PaymentFundedDealsListArg = {
  page: number;
  limit?: number;
  search?: string;
  /** Organization filter — omit or `all` for no filter. */
  organization?: string;
};

/**
 * Server-paginated funded cohort for the payment dashboard deals table.
 * Balances are embedded by the applications list API when `statsBucket=funded`.
 */
export function paymentFundedDealsListParams(
  arg: PaymentFundedDealsListArg,
): GetApplicationsParams {
  const organization =
    arg.organization?.trim() && arg.organization.trim().toLowerCase() !== "all"
      ? arg.organization.trim()
      : undefined;

  return {
    page: Math.max(1, arg.page),
    limit: arg.limit ?? DEFAULT_APPLICATIONS_PAGE_SIZE,
    ...(arg.search?.trim() ? { search: arg.search.trim() } : {}),
    ...(organization ? { organization } : {}),
    ...APPLICATIONS_LIST_DEFAULT_SORT,
    statsBucket: DASHBOARD_APPLICATION_STATS_BUCKET.FUNDED,
    skipListCacheRead: true,
    skipListCache: true,
    requestTimeoutMs: 60_000,
  };
}
