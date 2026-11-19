import { useQuery } from "@tanstack/react-query";
import { useDispatch } from "react-redux";
import { axiosGet } from "@/redux/axios";
import {
  getApplicationStats,
  getCommissionTrend,
  normalizeApplicationStatsData,
  type ApplicationStatsData,
} from "@/redux/actions/applicationActions";
import type { AppDispatch } from "@/redux/store";
import type { Application } from "@/types/applicationTypes";
import { mainDashboardQueryKeys } from "@/lib/invalidateDashboardData";
import { getTermsOffers } from "@/redux/actions/termsOfferActions";
import type { TermsOffer } from "@/types/termsOfferTypes";
import {
  DASHBOARD_STALE_MS,
  dashboardRefetchWhenVisible,
} from "@/lib/dashboardQueryDefaults";

export type PipelineFunnelSnapshot = {
  submit: number;
  inProgress: number;
  waitingForDocuments: number;
  decisionMade: number;
  conversionRate: { percentage: number; numerator: number; denominator: number };
};

async function fetchStatsRange(
  startDate: string,
  endDate: string,
): Promise<ApplicationStatsData | null> {
  const queryParams = new URLSearchParams();
  if (startDate) queryParams.append("startDate", startDate);
  if (endDate) queryParams.append("endDate", endDate);
  const url = `/applications/stats${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
  const response = await axiosGet(url);
  const raw = response.data?.data ?? response.data;
  return normalizeApplicationStatsData(raw);
}

function getPreviousMonthDateRange(referenceDate?: string): { start: string; end: string } | null {
  const formatYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const base = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(base.getTime())) return null;

  let year = base.getFullYear();
  let monthIndex = base.getMonth() - 1;
  if (monthIndex < 0) {
    monthIndex = 11;
    year -= 1;
  }

  const startDateObj = new Date(year, monthIndex, 1);
  const endDateObj = new Date(year, monthIndex + 1, 0);
  return { start: formatYmd(startDateObj), end: formatYmd(endDateObj) };
}

export type DashboardTrendChartPoint = {
  name: string;
  approved: number;
  funded: number;
  declined: number;
  dateKey: string;
};

export function useMainDashboardQueries(options: {
  startDate: string;
  endDate: string;
  trendView: "monthly" | "weekly" | "yearly";
  commissionChartView: "monthly" | "weekly" | "yearly";
  userRole: string;
  isAdmin: boolean;
  enabled?: boolean;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const {
    startDate,
    endDate,
    trendView,
    userRole,
    isAdmin,
    enabled = true,
  } = options;

  const queryDefaults = {
    staleTime: DASHBOARD_STALE_MS,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
    refetchInterval: dashboardRefetchWhenVisible,
    enabled,
  };

  const globalStatsQuery = useQuery({
    queryKey: [...mainDashboardQueryKeys.all, "global-stats", userRole],
    queryFn: async () => {
      const result = await dispatch(getApplicationStats()).unwrap();
      const raw = result?.data ?? result;
      return normalizeApplicationStatsData(raw);
    },
    ...queryDefaults,
  });

  const rangeStatsQuery = useQuery({
    queryKey: mainDashboardQueryKeys.statsRange(startDate, endDate, userRole),
    queryFn: () => fetchStatsRange(startDate, endDate),
    ...queryDefaults,
  });

  const prevMonthRange = getPreviousMonthDateRange(startDate || undefined);
  const prevMonthStatsQuery = useQuery({
    queryKey: mainDashboardQueryKeys.prevMonthStats(startDate, userRole),
    queryFn: async () => {
      if (!prevMonthRange) return null;
      return fetchStatsRange(prevMonthRange.start, prevMonthRange.end);
    },
    ...queryDefaults,
    enabled: enabled && !!prevMonthRange,
  });

  const trendChartQuery = useQuery({
    queryKey: mainDashboardQueryKeys.trendChart(trendView, startDate, endDate, userRole),
    queryFn: async () => {
      const qs = new URLSearchParams({
        trendView,
        startDate,
        endDate,
      });
      const response = await axiosGet(`/applications/dashboard-trend-chart?${qs.toString()}`);
      const payload = response?.data ?? {};
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      return rows as DashboardTrendChartPoint[];
    },
    ...queryDefaults,
  });

  const pipelineFunnelQuery = useQuery({
    queryKey: mainDashboardQueryKeys.pipelineFunnel(userRole),
    queryFn: async () => {
      const response = await axiosGet("/applications/dashboard-pipeline-funnel");
      const payload = response?.data ?? {};
      return (payload?.data ?? null) as {
        weekly: PipelineFunnelSnapshot;
        monthly: PipelineFunnelSnapshot;
        yearly: PipelineFunnelSnapshot;
      } | null;
    },
    ...queryDefaults,
    enabled: enabled && !isAdmin,
  });

  const recentApplicationsQuery = useQuery({
    queryKey: mainDashboardQueryKeys.recentApplications(userRole),
    queryFn: async () => {
      const response = await axiosGet(
        "/applications/dashboard-recent-applications?limit=10",
      );
      const payload = response?.data ?? {};
      const data = Array.isArray(payload?.data) ? payload.data : [];
      const totalItems = Number(payload?.pagination?.totalItems ?? data.length);
      return { applications: data as Application[], totalItems };
    },
    ...queryDefaults,
    enabled: enabled && !isAdmin,
  });

  const commissionTrendQuery = useQuery({
    queryKey: mainDashboardQueryKeys.commissionTrend(startDate, endDate, userRole),
    queryFn: async () => {
      const result = await dispatch(
        getCommissionTrend({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      ).unwrap();
      const data = (result?.data ?? result) as Array<{ name: string; value: number }>;
      return Array.isArray(data) ? data : [];
    },
    ...queryDefaults,
  });

  /** Commission chart (daily/weekly bucketing) — capped list, not full application export. */
  const commissionOffersQuery = useQuery({
    queryKey: [
      ...mainDashboardQueryKeys.all,
      "commission-offers",
      startDate,
      endDate,
      userRole,
    ],
    queryFn: async () => {
      const result = await dispatch(
        getTermsOffers({ limit: 300 } as Parameters<typeof getTermsOffers>[0]),
      ).unwrap();
      const raw = result?.data ?? result;
      return (Array.isArray(raw) ? raw : []) as TermsOffer[];
    },
    ...queryDefaults,
  });

  const adminStatsQuery = useQuery({
    queryKey: mainDashboardQueryKeys.adminStats(userRole),
    queryFn: async () => {
      const res = await axiosGet("/applications/admin-dashboard-stats");
      return res?.data?.data ?? res?.data ?? null;
    },
    ...queryDefaults,
    enabled: enabled && isAdmin,
  });

  return {
    globalStatsQuery,
    rangeStatsQuery,
    prevMonthStatsQuery,
    trendChartQuery,
    pipelineFunnelQuery,
    recentApplicationsQuery,
    commissionTrendQuery,
    commissionOffersQuery,
    adminStatsQuery,
  };
}
