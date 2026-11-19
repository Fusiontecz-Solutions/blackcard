import type { AppDispatch } from "@/redux/store";
import { appQueryClient } from "@/lib/queryClient";
import { getApplicationStats } from "@/redux/actions/applicationActions";
import {
  fetchOperationsDashboardSummary,
  fetchOperationsDashboardRecentCases,
} from "@/redux/actions/operationsDashboardActions";
import { invalidateOperationsDashboardCache } from "@/redux/slices/operationsDashboardSlice";

export const MAIN_DASHBOARD_QUERY_ROOT = "main-dashboard" as const;

/** React Query keys used by the main agent/admin dashboard. */
export const mainDashboardQueryKeys = {
  all: [MAIN_DASHBOARD_QUERY_ROOT] as const,
  statsRange: (startDate: string, endDate: string, role: string) =>
    [...mainDashboardQueryKeys.all, "stats-range", startDate, endDate, role] as const,
  prevMonthStats: (startDate: string, role: string) =>
    [...mainDashboardQueryKeys.all, "prev-month-stats", startDate, role] as const,
  trendChart: (
    trendView: string,
    startDate: string,
    endDate: string,
    role: string,
  ) =>
    [
      ...mainDashboardQueryKeys.all,
      "trend-chart",
      trendView,
      startDate,
      endDate,
      role,
    ] as const,
  pipelineFunnel: (role: string) =>
    [...mainDashboardQueryKeys.all, "pipeline-funnel", role] as const,
  recentApplications: (role: string) =>
    [...mainDashboardQueryKeys.all, "recent-applications", role] as const,
  commissionTrend: (startDate: string, endDate: string, role: string) =>
    [...mainDashboardQueryKeys.all, "commission-trend", startDate, endDate, role] as const,
  adminStats: (role: string) =>
    [...mainDashboardQueryKeys.all, "admin-stats", role] as const,
};

/**
 * Refresh dashboard metrics after application mutations or when returning to the dashboard.
 */
export function invalidateDashboardData(dispatch: AppDispatch): void {
  void appQueryClient.invalidateQueries({ queryKey: mainDashboardQueryKeys.all });
  void dispatch(getApplicationStats());
  dispatch(invalidateOperationsDashboardCache());
  void dispatch(fetchOperationsDashboardSummary());
  void dispatch(fetchOperationsDashboardRecentCases());
}
