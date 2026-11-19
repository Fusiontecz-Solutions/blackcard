import {
  XCircle,
  Clock,
  Activity,
  BadgeCheck,
  CircleDollarSign,
  ClipboardList,
  ChevronDown,
  FileText,
  Calendar,
  EyeIcon,
  LayoutGrid,
  LayoutList,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  BookCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  Bar,
  XAxis,
  YAxis,
  ComposedChart,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Line,
} from "recharts";
import { useTheme } from "@/context/ThemeContext";
import { useSelector, useDispatch } from "react-redux";
import type { RootState, AppDispatch } from "@/redux/store";
import type { user } from "@/redux/slices/authSlice";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  getApplicationMonthlyTrend,
  getApplications,
  getCommissionTrend,
} from "@/redux/actions/applicationActions";
import SyndicatorRoleHomeDashboard from "../syndicators/SyndicatorRoleHomeDashboard";

import {
  normalizeApplicationStatsData,
  type ApplicationStatsData,
} from "@/redux/actions/applicationActions";
import { getTermsOffers } from "@/redux/actions/termsOfferActions";
import type { Application } from "@/types/applicationTypes";
import type { TermsOffer } from "@/types/termsOfferTypes";
import { axiosGet } from "@/redux/axios";
import ApplicationDetailsSheet from "@/components/application/ApplicationDetailsSheet";
import { getClientByClientId } from "@/redux/actions/clientActions";
import {
  formatCurrency,
  formatInt,
  formatDate as formatDateUtil,
  getCurrentMonthDateRangeET,
  getPreviousMonthDateRangeET,
  formatYmdET,
  formatMonthDayET,
  formatMonthShortET,
  formatDayET,
  formatYearMonthET,
  getWeekRangeET,
  isWithinYmdRangeET,
  getPeriodStartET,
  etDayToUtcBounds,
} from "@/lib/utils";
import { CornerSummaryCard } from "@/pages/commissionPortal/CornerSummaryCard";
import {
  CONTRACT_OUT_QUEUE_BADGE_CLASS,
  isContractOutQueueBadgeLabel,
} from "@/lib/contractOutQueueBadge";
import {
  CONTRACT_SIGNED_QUEUE_BADGE_CLASS,
  isContractSignedQueueBadgeLabel,
} from "@/lib/contractSignedQueueBadge";
import { resolveApplicationDisplayLoanAmount } from "@/lib/applicationLoanAmount";
import {
  buildApplicationsBrowseUrl,
  DASHBOARD_APPLICATION_STATS_BUCKET,
  statCardTitleToApplicationsQuery,
} from "@/constants/dashboardApplicationsNavigation";

type TrendPoint = {
  name: string;
  approved: number;
  funded: number;
};

type CommissionPoint = {
  name: string;
  value: number;
};

// const MONTHS = [
//   "Jan",
//   "Feb",
//   "Mar",
//   "Apr",
//   "May",
//   "Jun",
//   "Jul",
//   "Aug",
//   "Sep",
//   "Oct",
//   "Nov",
//   "Dec",
// ];

const getCurrentMonthDateRange = () => {
  const range = getCurrentMonthDateRangeET();
  return {
    startDateObj: range.startDateObj,
    endDateObj: range.endDateObj,
    start: range.start,
    end: range.end,
  };
};

const getPreviousMonthDateRange = (referenceDate?: string) => {
  const range = getPreviousMonthDateRangeET(referenceDate);
  if (!range) return null;
  return {
    startDateObj: range.startDateObj,
    endDateObj: range.endDateObj,
    start: range.start,
    end: range.end,
  };
};

type AdminDashboardUsers = {
  total: number
  agents: number
  underwriters: number
  finalUnderwriters: number
  operations: number
  admins: number
  clients: number
  syndicators: number
}

type AdminDashboardBucket = {
  count: number
  totalAmount: number
}

type AdminDashboardApplications = {
  funded: AdminDashboardBucket
  approved: AdminDashboardBucket
  rejected: AdminDashboardBucket
  pending: AdminDashboardBucket
  last7Days: {
    funded: number
    approved: number
    rejected: number
    pending: number
  }
}

type AdminRecentApplication = {
  id: string
  applicationId: number
  date: string
  status: string
  applicationName: string
  advanceAmount: number | null
}

type PipelineFunnelSnapshot = {
  submit: number
  inProgress: number
  waitingForDocuments: number
  decisionMade: number
  conversionRate: { percentage: number; numerator: number; denominator: number }
}

type AdminDashboardPipelineFunnelCharts =
  | PipelineFunnelSnapshot
  | {
    weekly: PipelineFunnelSnapshot
    monthly: PipelineFunnelSnapshot
    yearly: PipelineFunnelSnapshot
    rolling12Months?: PipelineFunnelSnapshot
  }

type AdminDashboardStats = {
  users: AdminDashboardUsers
  applications: AdminDashboardApplications
  recentApplications: AdminRecentApplication[]
  charts?: {
    monthlyTrend?: { month: string; approved: number; funded: number; rejected: number }[]
    pipelineFunnel?: AdminDashboardPipelineFunnelCharts
  }
}

const ADMIN_USER_COLOR_CONFIG = [
  { key: 'agents' as const, label: 'Agents', color: '#A8CFF5' },
  { key: 'clients' as const, label: 'Clients', color: 'var(--brand-soft)' },
  { key: 'syndicators' as const, label: 'Syndicators', color: '#78BCFD' },
  { key: 'underwriters' as const, label: 'Scrubbing', color: '#39CAFF' },
  { key: 'finalUnderwriters' as const, label: 'Underwriters', color: '#74C5FF' },
]

const DASHBOARD_RECENT_APPLICATIONS_LIMIT = 5;

/** Same key as `Applications.tsx` so list/grid preference is shared. */
const RECENT_APPLICATIONS_VIEW_MODE_STORAGE_KEY = "applicationsListViewMode";

/** Footer caption for the dollar line on dashboard KPI tiles (matches commission portal stat cards). */
function dashboardStatAmountCaption(title: string): string {
  switch (title) {
    case "Funded":
    case "Funded Applications":
      return "Total funded amount";
    case "Approved":
      return "Total approved amount";
    case "Rejected":
      return "Total rejected amount";
    case "Pending":
      return "Total pending amount";
    case "In Progress":
      return "Total in progress amount";
    case "Total Application Assigned":
      return "Total assigned amount";
    case "Total Deals Picked":
    case "Total Applications Picked":
      return "Total picked amount";
    default:
      return "Total amount";
  }
}

/** Central icon mapping so all role-specific stat cards stay title-consistent. */
function getDashboardStatIcon(title: string) {
  switch (title) {
    case "Funded":
    case "Funded Deals":
    case "Funded Applications":
      return <CircleDollarSign className="size-4 text-green-600" />;
    case "Approved":
      return <BadgeCheck className="size-4 text-blue-600" />;
    case "Rejected":
      return <XCircle className="size-4 text-rose-600" />;
    case "Pending":
      return <Clock className="size-4 text-amber-600" />;
    case "In Progress":
      return <Activity className="size-4 text-orange-600" />;
    case "Total Application Assigned":
      return <ClipboardList className="size-4 text-indigo-600" />;
    case "Total Deals Picked":
    case "Total Applications Picked":
      return <BookCheck className="size-4 text-cyan-600" />;
    default:
      return <FileText className="size-4 text-[#3B82F6]" />;
  }
}

/** Queue buckets aligned with `getAdminDashboardStats` in applicationController.ts */
const FUNNEL_IN_PROGRESS_QUEUES_LC = new Set([
  "new",
  "agent",
  "review",
  "underwriting",
  "scrubbing",
  "final review",
  "final scrubbing",
]);
const FUNNEL_WAITING_QUEUES_LC = new Set(["on hold", "waiting for documents"]);
const FUNNEL_DECISION_QUEUES_LC = new Set(["approved", "declined", "contracted"]);

function classifyApplicationForPipelineFunnel(queueRaw: unknown): "inProgress" | "waiting" | "decision" | "other" {
  const q = String(queueRaw ?? "")
    .trim()
    .toLowerCase();
  if (!q) return "other";
  if (FUNNEL_IN_PROGRESS_QUEUES_LC.has(q)) return "inProgress";
  if (FUNNEL_WAITING_QUEUES_LC.has(q)) return "waiting";
  if (FUNNEL_DECISION_QUEUES_LC.has(q)) return "decision";
  return "other";
}

function buildPipelineFunnelFromApps(
  apps: Application[],
  pipelineView: "weekly" | "monthly" | "yearly",
): { stages: { stage: string; value: number; percentage: number; color: string }[]; conversionText: string } {
  const now = new Date();
  const periodStart = getPeriodStartET(pipelineView, now);

  let submit = 0;
  let inProgress = 0;
  let waitingForDocuments = 0;
  let decisionMade = 0;

  for (const app of apps) {
    const createdAtStr = app.createdAt;
    if (!createdAtStr) continue;
    const createdAt = new Date(createdAtStr);
    if (Number.isNaN(createdAt.getTime())) continue;
    if (createdAt < periodStart || createdAt > now) continue;

    submit += 1;
    const queue = app.currentQueue ?? app.queue;
    const cat = classifyApplicationForPipelineFunnel(queue);
    if (cat === "inProgress") inProgress += 1;
    else if (cat === "waiting") waitingForDocuments += 1;
    else if (cat === "decision") decisionMade += 1;
  }

  const conversionPct = submit > 0 ? Math.round((decisionMade / submit) * 100) : 0;
  const conversionText =
    submit > 0 ? `${conversionPct}% (${decisionMade}/${submit})` : "—";

  const total = submit;
  const makeStage = (stage: string, value: number, color: string, den: number) => ({
    stage,
    value,
    percentage: den > 0 ? Math.round((value / den) * 100) : 0,
    color,
  });

  return {
    stages: [
      makeStage("Submit", submit, "#3B82F6", total),
      makeStage("In Progress", inProgress, "#F97316", total),
      makeStage("Waiting for Documents", waitingForDocuments, "#A855F7", total),
      makeStage("Decision Made", decisionMade, "#10B981", total),
    ],
    conversionText,
  };
}

function stagesFromPipelineSnapshot(s: PipelineFunnelSnapshot): {
  stages: { stage: string; value: number; percentage: number; color: string }[];
  conversionText: string;
} {
  const total = s.submit;
  const makeStage = (stage: string, value: number, color: string, den: number) => ({
    stage,
    value,
    percentage: den > 0 ? Math.round((value / den) * 100) : 0,
    color,
  });
  return {
    stages: [
      makeStage("Submit", s.submit, "#3B82F6", total),
      makeStage("In Progress", s.inProgress, "#F97316", total),
      makeStage("Waiting for Documents", s.waitingForDocuments, "#A855F7", total),
      makeStage("Decision Made", s.decisionMade, "#10B981", total),
    ],
    conversionText:
      total > 0
        ? `${s.conversionRate.percentage}% (${s.conversionRate.numerator}/${s.conversionRate.denominator})`
        : "—",
  };
}

type PipelineFunnelStageRow = {
  stage: string;
  value: number;
  percentage: number;
  color: string;
};

/** Pipeline funnel card: stages fill the middle; conversion rate is pinned to the bottom bar. */
function ApplicationPipelineFunnelCard({
  isDark,
  className = "",
  stages,
  conversionText,
  pipelineView,
  onSelectView,
  dropdownButtonClassName,
}: {
  isDark: boolean;
  className?: string;
  stages: PipelineFunnelStageRow[];
  conversionText: string;
  pipelineView: "monthly" | "weekly" | "yearly";
  onSelectView: (v: "monthly" | "weekly" | "yearly") => void;
  dropdownButtonClassName?: string;
}) {
  const periodLabel =
    pipelineView === "weekly"
      ? "Weekly"
      : pipelineView === "monthly"
        ? "Monthly"
        : "Yearly";

  return (
    <div
      className={`flex min-h-[320px] flex-col overflow-hidden rounded-xl border shadow-md ${isDark ? "border-slate-700/80 bg-[#141517]" : "border-slate-200/90 bg-white"} ${className}`}
    >
      <div
        className={`flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 ${isDark ? "border-white/10" : "border-slate-100"}`}
      >
        <h3
          className={`text-[11px] font-bold uppercase tracking-[0.14em] ${isDark ? "text-slate-400" : "text-slate-500"}`}
        >
          Application Pipeline Funnel
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={
                dropdownButtonClassName ??
                "h-8 gap-2 border-slate-200 bg-background text-xs shadow-none"
              }
            >
              {periodLabel}
              <ChevronDown className="size-4 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onSelectView("weekly")}>
              Weekly
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSelectView("monthly")}>
              Monthly
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSelectView("yearly")}>
              Yearly
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 pt-1">
        <div className="flex flex-1 flex-col justify-center gap-5 pb-2">
          {stages.map((item, index) => {
            const pct = Math.min(100, Math.max(0, Math.round(item.percentage)));
            /** Reference UI: true zero rows (0 count & 0%) get a small colored pill with “00%”. */
            const showZeroCap = pct === 0 && item.value === 0;
            const fillPct =
              showZeroCap ? 0 : Math.min(100, Math.max(pct, 5));
            const tight = !showZeroCap && fillPct < 22;
            const pctLabel =
              pct === 0
                ? `${String(pct).padStart(2, "0")}%`
                : `${pct}%`;
            return (
              <div
                key={`${item.stage}-${index}`}
                className="flex items-center gap-3 sm:gap-4"
              >
                <div className="w-[124px] shrink-0 text-[12px] font-medium leading-snug text-foreground sm:w-[148px] dark:text-slate-100">
                  {item.stage}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`relative h-8 w-full overflow-hidden rounded-full ${isDark ? "bg-white/[0.08]" : "bg-slate-100"}`}
                  >
                    {showZeroCap ? (
                      <div
                        className="absolute left-0 top-0 z-[1] flex h-8 w-8 items-center justify-center rounded-l-full rounded-r-none shadow-sm ring-1 ring-black/5"
                        style={{ backgroundColor: item.color }}
                        aria-hidden
                      >
                        <span className="text-[10px] font-semibold tabular-nums leading-none text-white">
                          {pctLabel}
                        </span>
                      </div>
                    ) : (
                      <div
                        className={`flex h-full min-h-8 items-center bg-transparent ${fillPct >= 100 ? "rounded-full" : "rounded-l-full rounded-r-none"} ${tight ? "justify-between px-2" : "justify-between px-3"}`}
                        style={{
                          width: `${fillPct}%`,
                          backgroundColor: item.color,
                          transition: "width 0.35s ease",
                        }}
                      >
                        <span className="text-[11px] font-semibold tabular-nums text-white drop-shadow-sm">
                          {formatInt(item.value)}
                        </span>
                        <span className="text-[11px] font-semibold tabular-nums text-white drop-shadow-sm">
                          {pctLabel}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className={`mt-auto flex shrink-0 items-center justify-between gap-4 border-t px-5 py-4 ${isDark ? "border-white/10 bg-[#1c1d21]" : "border-slate-100 bg-[#eef3ff]"}`}
      >
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Conversion Rate
        </span>
        <span className="text-sm font-bold tabular-nums text-foreground">
          {conversionText}
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const { data: statsData } = useSelector(
    (state: RootState) => state.applicationStats,
  );
  const dashboardLoginUserRole = useSelector(
    (state: RootState) => state.login.data?.user?.role ?? "",
  );

  const goToApplicationsForStatCard = useCallback(
    (
      title: string,
      options?: { pendingMeansPipeline?: boolean },
    ) => {
      if (title === "Pending" && options?.pendingMeansPipeline) {
        navigate(
          buildApplicationsBrowseUrl({
            statsBucket: DASHBOARD_APPLICATION_STATS_BUCKET.PENDING_PIPELINE,
          }),
        );
        return;
      }
      if (title === "Total Application Assigned") {
        const role =
          dashboardLoginUserRole ||
          (typeof window !== "undefined"
            ? localStorage.getItem("role") || ""
            : "");
        if (role === "UNDERWRITER") {
          navigate(
            buildApplicationsBrowseUrl({ currentQueue: "Underwriter" }),
          );
        } else if (role === "SCRUBBING") {
          navigate(
            buildApplicationsBrowseUrl({ currentQueue: "Scrubbing" }),
          );
        } else if (role === "AGENT") {
          navigate(buildApplicationsBrowseUrl({ currentQueue: "Agent" }));
        } else {
          navigate(buildApplicationsBrowseUrl({}));
        }
        return;
      }
      if (title === "Total Deals Picked" || title === "Total Applications Picked") {
        navigate(buildApplicationsBrowseUrl({}));
        return;
      }
      const q = statCardTitleToApplicationsQuery(title);
      navigate(buildApplicationsBrowseUrl(q));
    },
    [dashboardLoginUserRole, navigate],
  );

  const { data: termsOffersList } = useSelector(
    (state: RootState) => state.termsOffers,
  );

  // Date range state (default to current month: 1st day to last day)
  const [startDate, setStartDate] = useState<string>(
    () => getCurrentMonthDateRange().start,
  );
  const [endDate, setEndDate] = useState<string>(
    () => getCurrentMonthDateRange().end,
  );
  const [prevMonthStats, setPrevMonthStats] =
    useState<ApplicationStatsData | null>(null);
  /** `/applications/stats` for the dashboard date range (cards must match API, not unscoped Redux). */
  const [rangeScopedStats, setRangeScopedStats] =
    useState<ApplicationStatsData | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [, setCommissionTrend] = useState<CommissionPoint[]>([]);
  const [trendView, setTrendView] = useState<"monthly" | "weekly" | "yearly">(
    "monthly",
  );
  const [pipelineView, setPipelineView] = useState<
    "monthly" | "weekly" | "yearly"
  >("monthly");
  const [commissionChartView, setCommissionChartView] = useState<
    "monthly" | "weekly" | "yearly"
  >("monthly");

  const formatMoney = useCallback((amount: number) => {
    return formatCurrency(amount);
  }, []);

  const [dashboardRoleApps, setDashboardRoleApps] = useState<Application[]>([]);
  const [dashboardRoleAppsTotal, setDashboardRoleAppsTotal] = useState(0);
  const [dashboardRoleAppsLoading, setDashboardRoleAppsLoading] = useState(false);

  /** Role-scoped list for funnel + recent table (DB-filtered, all pages). */
  useEffect(() => {
    const roleKey = String(dashboardLoginUserRole || localStorage.getItem("role") || "")
      .toUpperCase()
      .replace(/-/g, "_");
    if (roleKey === "ADMIN" || roleKey === "SUPER_ADMIN" || roleKey === "SUPERADMIN") {
      setDashboardRoleApps([]);
      setDashboardRoleAppsTotal(0);
      return;
    }
  /** Underwriters filter by queue; agents need all own deals (incl. sent to Scrubbing = "In Progress"). */
    const queueByRole: Partial<Record<string, string>> = {
      SCRUBBING: "Scrubbing",
      UNDERWRITER: "Underwriter",
    };
    const queueFilter = queueByRole[roleKey];
    if (roleKey !== "AGENT" && !queueFilter) {
      setDashboardRoleApps([]);
      setDashboardRoleAppsTotal(0);
      return;
    }
    let cancelled = false;
    setDashboardRoleAppsLoading(true);
    void dispatch(
      getApplications({
        page: 1,
        limit: 500,
        lite: true,
        ...(queueFilter ? { currentQueue: queueFilter } : {}),
        sortBy: "createdAt",
        sortOrder: "desc",
        fetchAllPages: true,
        skipListCache: true,
        skipListCacheRead: true,
      }),
    )
      .unwrap()
      .then((res) => {
        if (!cancelled) {
          const rows = Array.isArray(res?.data) ? res.data : [];
          setDashboardRoleApps(rows);
          const total =
            Number(res?.pagination?.totalItems ?? res?.pagination?.total) ||
            rows.length;
          setDashboardRoleAppsTotal(total);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDashboardRoleApps([]);
          setDashboardRoleAppsTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setDashboardRoleAppsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, dashboardLoginUserRole]);

  useEffect(() => {
    dispatch(
      getTermsOffers({
        limit: 500,
      } as any),
    );
  }, [dispatch]);

  // Application stats are prefetched in RootLayout (and on login). This page only reads Redux.

  useEffect(() => {
    const prevRange = getPreviousMonthDateRange(startDate);
    if (!prevRange) {
      setPrevMonthStats(null);
      return;
    }

    const fetchPrevStats = async () => {
      try {
        const queryParams = new URLSearchParams();
        if (prevRange.start) queryParams.append("startDate", prevRange.start);
        if (prevRange.end) queryParams.append("endDate", prevRange.end);
        const url = `/applications/stats${queryParams.toString() ? `?${queryParams.toString()}` : ""
          }`;
        const response = await axiosGet(url);
        const payload = response.data as any;
        const data = normalizeApplicationStatsData(payload?.data ?? payload);
        setPrevMonthStats(data ?? null);
      } catch (error) {
        console.error(
          "Failed to fetch previous month application stats",
          error,
        );
        setPrevMonthStats(null);
      }
    };

    fetchPrevStats();
  }, [startDate]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const queryParams = new URLSearchParams();
        if (startDate) queryParams.append("startDate", startDate);
        if (endDate) queryParams.append("endDate", endDate);
        const url = `/applications/stats${queryParams.toString() ? `?${queryParams.toString()}` : ""
          }`;
        const response = await axiosGet(url);
        const raw = response.data?.data ?? response.data;
        const data = normalizeApplicationStatsData(raw);
        if (!cancelled) setRangeScopedStats(data);
      } catch (e) {
        console.error("Failed to fetch dashboard range application stats", e);
        if (!cancelled) setRangeScopedStats(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  const statsForDashboardCards = rangeScopedStats ?? statsData;

  // Fetch monthly trend data for charts whenever date range changes
  useEffect(() => {
    const hasStart = !!startDate;
    const hasEnd = !!endDate;

    dispatch(
      getApplicationMonthlyTrend(
        hasStart || hasEnd
          ? {
            startDate: hasStart ? startDate : undefined,
            endDate: hasEnd ? endDate : undefined,
          }
          : undefined,
      ),
    )
      .unwrap()
      .then((res: any) => {
        const data = (res?.data ?? res) as TrendPoint[];
        if (Array.isArray(data)) {
          setTrendData(data);
        }
      })
      .catch(() => {
        // keep previous trendData on error
      });
  }, [dispatch, startDate, endDate]);

  // Fetch monthly commission trend data whenever date range changes
  useEffect(() => {
    const hasStart = !!startDate;
    const hasEnd = !!endDate;

    dispatch(
      getCommissionTrend(
        hasStart || hasEnd
          ? {
            startDate: hasStart ? startDate : undefined,
            endDate: hasEnd ? endDate : undefined,
          }
          : undefined,
      ),
    )
      .unwrap()
      .then((res: any) => {
        const data = (res?.data ?? res) as CommissionPoint[];
        if (Array.isArray(data)) {
          setCommissionTrend(data);
        }
      })
      .catch(() => {
        // keep previous commissionTrend on error
      });
  }, [dispatch, startDate, endDate]);

  // const selectedMonthInfo = useMemo(() => {
  //   // Use startDate month if available, otherwise endDate, otherwise current month
  //   let ref = startDate
  //     ? new Date(startDate)
  //     : endDate
  //       ? new Date(endDate)
  //       : new Date();
  //   if (Number.isNaN(ref.getTime())) {
  //     ref = new Date();
  //   }
  //   const year = ref.getFullYear();
  //   const monthIndex = ref.getMonth();
  //   const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  //   // Determine active day range within this month from selected date range
  //   let rangeStartDay = 1;
  //   let rangeEndDay = daysInMonth;

  //   if (startDate) {
  //     const s = new Date(startDate);
  //     if (
  //       !Number.isNaN(s.getTime()) &&
  //       s.getFullYear() === year &&
  //       s.getMonth() === monthIndex
  //     ) {
  //       rangeStartDay = Math.max(1, s.getDate());
  //     }
  //   }
  //   if (endDate) {
  //     const e = new Date(endDate);
  //     if (
  //       !Number.isNaN(e.getTime()) &&
  //       e.getFullYear() === year &&
  //       e.getMonth() === monthIndex
  //     ) {
  //       rangeEndDay = Math.min(daysInMonth, e.getDate());
  //     }
  //   }

  //   if (rangeEndDay < rangeStartDay) {
  //     rangeStartDay = 1;
  //     rangeEndDay = 0;
  //   }

  //   const activeDays =
  //     rangeEndDay >= rangeStartDay ? rangeEndDay - rangeStartDay + 1 : 0;

  //   return {
  //     year,
  //     monthIndex,
  //     daysInMonth,
  //     rangeStartDay,
  //     rangeEndDay,
  //     activeDays,
  //   };
  // }, [startDate, endDate]);

  const filterByDateRange = useCallback(
    (recordDate: Date | null | undefined) => {
      if (!recordDate || Number.isNaN(recordDate.getTime())) return false;
      return isWithinYmdRangeET(recordDate, startDate || null, endDate || null);
    },
    [startDate, endDate],
  );

  /** Monthly trend chart uses `/applications/stats/trend` aggregates only (no client row sampling). */
  const filteredTrendData = useMemo(() => {
    const trendFromApi = (trendData as Array<Record<string, unknown>>).map((p, idx) => ({
      name: String(p.name ?? p.period ?? ""),
      approved: Number(p.approved) || 0,
      funded: Number(p.funded) || 0,
      declined: Number(p.declined ?? p.rejected) || 0,
      dateKey: String(p.dateKey ?? p.name ?? p.period ?? idx),
    }));
    return trendFromApi.sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
  }, [trendData]);

  const trendChartYMax = useMemo(() => {
    let max = 0;
    for (const p of filteredTrendData) {
      const row = p as { approved?: number; funded?: number; declined?: number };
      max = Math.max(
        max,
        Number(row.approved) || 0,
        Number(row.funded) || 0,
        Number(row.declined) || 0,
      );
    }
    if (max <= 0) return 1;
    const padded = max * 1.12;
    const step =
      padded >= 1_000_000
        ? 100_000
        : padded >= 100_000
          ? 10_000
          : padded >= 10_000
            ? 1_000
            : padded >= 1_000
              ? 100
              : 10;
    return Math.max(Math.ceil(padded / step) * step, step);
  }, [filteredTrendData]);

  const filteredCommissionData = useMemo(() => {
    const periodData: {
      [key: string]: { name: string; value: number; dateKey: string };
    } = {};

    const offers = (termsOffersList as TermsOffer[] | undefined) ?? [];
    if (offers.length === 0 && !startDate && !endDate) return [];

    const parseDateOnly = (value: string | null) => {
      if (!value) return null;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const start = parseDateOnly(startDate || null);
    const end = parseDateOnly(endDate || null);

    const fallback = getCurrentMonthDateRange();
    const rangeStart = start ?? fallback.startDateObj;
    const rangeEnd = (() => {
      const e = end ?? fallback.endDateObj;
      const normalized = new Date(e);
      normalized.setHours(23, 59, 59, 999);
      return normalized;
    })();

    const formatYmd = (d: Date) => formatYmdET(d);

    const sameMonth =
      formatYearMonthET(rangeStart) === formatYearMonthET(rangeEnd);

    if (commissionChartView === "monthly") {
      const d = new Date(rangeStart);
      d.setHours(0, 0, 0, 0);
      while (d <= rangeEnd) {
        const periodKey = formatYmd(d);
        const label = sameMonth
          ? formatDayET(d)
          : formatMonthDayET(d);
        periodData[periodKey] = { name: label, value: 0, dateKey: periodKey };
        d.setDate(d.getDate() + 1);
      }
    } else if (commissionChartView === "weekly") {
      const d = new Date(rangeStart);
      const weekRange = getWeekRangeET(d);
      if (weekRange) {
        const weekStart = new Date(etDayToUtcBounds(weekRange.startYmd).start);
        d.setTime(weekStart.getTime());
      }
      d.setHours(0, 0, 0, 0);
      while (d <= rangeEnd) {
        const week = getWeekRangeET(d);
        if (!week) break;
        const periodKey = week.startYmd;
        periodData[periodKey] = {
          name: week.label,
          value: 0,
          dateKey: periodKey,
        };
        d.setDate(d.getDate() + 7);
      }
    } else if (commissionChartView === "yearly") {
      const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      d.setHours(0, 0, 0, 0);
      const endMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
      endMonth.setHours(0, 0, 0, 0);
      while (d <= endMonth) {
        const periodKey = formatYearMonthET(d);
        const periodLabel = formatMonthShortET(d);
        periodData[periodKey] = {
          name: periodLabel,
          value: 0,
          dateKey: periodKey,
        };
        d.setMonth(d.getMonth() + 1);
      }
    }

    offers.forEach((offer) => {
      const created = offer.createdAt ? new Date(offer.createdAt as any) : null;
      if (!created || isNaN(created.getTime())) return;
      if (!filterByDateRange(created)) return;

      let periodKey = "";
      let periodLabel = "";

      if (commissionChartView === "monthly") {
        periodKey = formatYmdET(created);
        periodLabel = sameMonth
          ? formatDayET(created)
          : formatMonthDayET(created);
      } else if (commissionChartView === "weekly") {
        const week = getWeekRangeET(created);
        if (!week) return;
        periodKey = week.startYmd;
        periodLabel = week.label;
      } else {
        periodKey = formatYearMonthET(created);
        periodLabel = formatMonthShortET(created);
      }

      if (!periodData[periodKey]) {
        periodData[periodKey] = { name: periodLabel, value: 0, dateKey: periodKey };
      }

      const amt = offer.commissionAmount ?? 0;
      periodData[periodKey].value += amt;
    });

    return Object.values(periodData).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey),
    );
  }, [termsOffersList, commissionChartView, startDate, endDate, filterByDateRange]);

  const nonUnderwriterStats = useMemo(() => {
    const s = statsForDashboardCards;
    const prev = prevMonthStats;

    const buildBucket = (
      count: number,
      total: number,
      prevTotal: number | null | undefined,
    ) => {
      const currentTotal = total ?? 0;
      const previousTotal = prevTotal ?? 0;

      let changePercent: number | null = null;

      if (previousTotal > 0) {
        changePercent = ((currentTotal - previousTotal) / previousTotal) * 100;
      } else if (currentTotal > 0) {
        changePercent = 100;
      } else if (previousTotal === 0 && currentTotal === 0) {
        changePercent = 0;
      }

      let changeLabel = "No change from last month";
      let changeClass = "text-muted-foreground";

      if (typeof changePercent === "number") {
        const rounded = Math.round(Math.abs(changePercent));
        const sign = changePercent > 0 ? "+" : changePercent < 0 ? "-" : "";

        if (changePercent > 0) {
          changeClass = "text-emerald-600";
        } else if (changePercent < 0) {
          changeClass = "text-rose-600";
        }

        changeLabel = `${sign}${rounded}% from last month`;
      }

      return {
        value: String(count),
        money: formatMoney(currentTotal),
        changePercent,
        changeLabel,
        changeClass,
      };
    };

    return [
      {
        title: "Funded",
        ...buildBucket(
          s?.funded?.count ?? 0,
          s?.funded?.totalAmount ?? 0,
          prev?.funded?.totalAmount,
        ),
        icon: getDashboardStatIcon("Funded"),
        bg: "bg-emerald-50 dark:bg-emerald-950",
        iconBg: "bg-emerald-100 dark:bg-emerald-900",
        text: "text-muted-foreground",
      },
      {
        title: "Approved",
        ...buildBucket(
          s?.approved?.count ?? 0,
          s?.approved?.totalAmount ?? 0,
          prev?.approved?.totalAmount,
        ),
        icon: getDashboardStatIcon("Approved"),
        bg: "bg-blue-50 dark:bg-blue-950",
        iconBg: "bg-blue-100 dark:bg-blue-900",
        text: "text-muted-foreground",
      },
      {
        title: "Rejected",
        ...buildBucket(
          s?.rejected?.count ?? 0,
          s?.rejected?.totalAmount ?? 0,
          prev?.rejected?.totalAmount,
        ),
        icon: getDashboardStatIcon("Rejected"),
        bg: "bg-rose-50 dark:bg-rose-950",
        iconBg: "bg-rose-100 dark:bg-rose-900",
        text: "text-muted-foreground",
      },
    ];
  }, [statsForDashboardCards, prevMonthStats, formatMoney]);

  /** Backend `/applications/stats`: Agent queue ↔ Pending, Scrubbing queue ↔ In Progress. */
  const workflowStateCards = useMemo(() => {
    const s = statsForDashboardCards;
    const prev = prevMonthStats;

    const buildBucket = (
      count: number,
      total: number,
      prevTotal: number | null | undefined,
    ) => {
      const currentTotal = total ?? 0;
      const previousTotal = prevTotal ?? 0;

      let changePercent: number | null = null;

      if (previousTotal > 0) {
        changePercent = ((currentTotal - previousTotal) / previousTotal) * 100;
      } else if (currentTotal > 0) {
        changePercent = 100;
      } else if (previousTotal === 0 && currentTotal === 0) {
        changePercent = 0;
      }

      let changeLabel = "No change from last month";
      let changeClass = "text-muted-foreground";

      if (typeof changePercent === "number") {
        const rounded = Math.round(Math.abs(changePercent));
        const sign = changePercent > 0 ? "+" : changePercent < 0 ? "-" : "";

        if (changePercent > 0) {
          changeClass = "text-emerald-600";
        } else if (changePercent < 0) {
          changeClass = "text-rose-600";
        }

        changeLabel = `${sign}${rounded}% from last month`;
      }

      return {
        value: String(count),
        money: formatMoney(currentTotal),
        changePercent,
        changeLabel,
        changeClass,
      };
    };

    const pendingCount = s?.workflowPending?.count ?? 0;
    const inProgressCount = s?.workflowInProgress?.count ?? 0;

    return [
      {
        title: "Pending",
        ...buildBucket(
          pendingCount,
          s?.workflowPending?.totalAmount ?? 0,
          prev?.workflowPending?.totalAmount,
        ),
        icon: getDashboardStatIcon("Pending"),
        iconBg: "bg-amber-100 dark:bg-amber-900",
      },
      {
        title: "In Progress",
        ...buildBucket(
          inProgressCount,
          s?.workflowInProgress?.totalAmount ?? 0,
          prev?.workflowInProgress?.totalAmount,
        ),
        icon: getDashboardStatIcon("In Progress"),
        iconBg: "bg-orange-100 dark:bg-orange-900",
      },
    ];
  }, [statsForDashboardCards, prevMonthStats, formatMoney]);

  const underwriterStats = useMemo(() => {
    const s = statsForDashboardCards;
    const prev = prevMonthStats;

    const buildBucket = (
      count: number,
      totalAmt: number,
      prevTotalAmt: number | null | undefined,
    ) => {
      const currentTotal = totalAmt ?? 0;
      const previousTotal = prevTotalAmt ?? 0;

      let changePercent: number | null = null;

      if (previousTotal > 0) {
        changePercent = ((currentTotal - previousTotal) / previousTotal) * 100;
      } else if (currentTotal > 0) {
        changePercent = 100;
      } else if (previousTotal === 0 && currentTotal === 0) {
        changePercent = 0;
      }

      let changeLabel = "No change from last month";
      let changeClass = "text-muted-foreground";

      if (typeof changePercent === "number") {
        const rounded = Math.round(Math.abs(changePercent));
        const sign = changePercent > 0 ? "+" : changePercent < 0 ? "-" : "";

        if (changePercent > 0) {
          changeClass = "text-emerald-600";
        } else if (changePercent < 0) {
          changeClass = "text-rose-600";
        }

        changeLabel = `${sign}${rounded}% from last month`;
      }

      return {
        value: String(count),
        money: formatMoney(currentTotal),
        changePercent,
        changeLabel,
        changeClass,
      };
    };

    const assignedBucket = buildBucket(
      s?.roleQueueAssigned?.count ?? 0,
      s?.roleQueueAssigned?.totalAmount ?? 0,
      prev?.roleQueueAssigned?.totalAmount,
    );
    const dealsPickedBucket = buildBucket(
      s?.totalDealsPicked?.count ?? 0,
      s?.totalDealsPicked?.totalAmount ?? 0,
      prev?.totalDealsPicked?.totalAmount,
    );

    return [
      {
        title: "Total Application Assigned",
        ...assignedBucket,
        icon: getDashboardStatIcon("Total Application Assigned"),
        bg: "bg-blue-50 dark:bg-blue-950",
        iconBg: "bg-[#3B82F61A] dark:bg-blue-900",
        text: "text-muted-foreground",
      },
      {
        title: "Approved",
        ...buildBucket(
          s?.approved?.count ?? 0,
          s?.approved?.totalAmount ?? 0,
          prev?.approved?.totalAmount,
        ),
        icon: getDashboardStatIcon("Approved"),
        bg: "bg-blue-50 dark:bg-blue-950",
        iconBg: "bg-emerald-100 dark:bg-emerald-900",
        text: "text-muted-foreground",
      },
      {
        title: "Rejected",
        ...buildBucket(
          s?.rejected?.count ?? 0,
          s?.rejected?.totalAmount ?? 0,
          prev?.rejected?.totalAmount,
        ),
        icon: getDashboardStatIcon("Rejected"),
        bg: "bg-rose-50 dark:bg-rose-950",
        iconBg: "bg-rose-100 dark:bg-rose-900",
        text: "text-muted-foreground",
      },
      {
        title: "Funded Applications",
        ...buildBucket(
          s?.funded?.count ?? 0,
          s?.funded?.totalAmount ?? 0,
          prev?.funded?.totalAmount,
        ),
        icon: getDashboardStatIcon("Funded Applications"),
        bg: "bg-emerald-50 dark:bg-emerald-950",
        iconBg: "bg-[#3B82F61A] dark:bg-emerald-900",
        text: "text-muted-foreground",
      },
      {
        title: "Total Applications Picked",
        ...dealsPickedBucket,
        icon: getDashboardStatIcon("Total Applications Picked"),
        bg: "bg-blue-50 dark:bg-blue-950",
        iconBg: "bg-blue-100 dark:bg-blue-900",
        text: "text-muted-foreground",
      },
    ];
  }, [statsForDashboardCards, prevMonthStats, formatMoney]);

  const clientPipelineFunnel = useMemo(() => {
    return buildPipelineFunnelFromApps(dashboardRoleApps, pipelineView);
  }, [dashboardRoleApps, pipelineView]);

  /** Latest N applications: agents see all own deals; UW/FUW stay queue-scoped. */
  const latestDashboardApplications = useMemo(() => {
    const apps = dashboardRoleApps;

    const normalizeQueueToken = (value: unknown): string =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const roleQueueMap: Record<string, string> = {
      SCRUBBING: "scrubbing",
      UNDERWRITER: "underwriter",
    };

    const dashboardRole =
      dashboardLoginUserRole ||
      (typeof window !== "undefined" ? localStorage.getItem("role") || "" : "");
    const roleKey = String(dashboardRole).toUpperCase().replace(/-/g, "_");
    const expectedQueueToken = roleQueueMap[roleKey] ?? "";

    return [...apps]
      .filter((a) => a.createdAt || a.updatedAt)
      .filter((a) => {
        if (roleKey === "AGENT") return true;
        if (!expectedQueueToken) return true;
        const queueToken = normalizeQueueToken(a.currentQueue ?? a.queue);
        return queueToken === expectedQueueToken;
      })
      .sort((a, b) => {
        const ta = new Date(
          (a.updatedAt ?? a.createdAt) as string,
        ).getTime();
        const tb = new Date(
          (b.updatedAt ?? b.createdAt) as string,
        ).getTime();
        return tb - ta;
      })
      .slice(0, DASHBOARD_RECENT_APPLICATIONS_LIMIT);
  }, [dashboardRoleApps, dashboardLoginUserRole]);

  const formatDateForRecentAppsTable = useCallback((dateString?: string) => {
    return formatDateUtil(dateString ?? "", "-");
  }, []);

  const getRecentAppClientName = useCallback((client: Application["client"]) => {
    if (typeof client === "string") return client;
    if (client?.business?.name) return client.business.name;
    if (client?.owner?.firstName || client?.owner?.lastName) {
      return `${client.owner.firstName || ""} ${client.owner.lastName || ""}`.trim();
    }
    return "-";
  }, []);

  const getRecentAppClientEmail = useCallback((client: Application["client"]) => {
    if (typeof client === "string") return "-";
    return client?.business?.email || client?.owner?.email || "-";
  }, []);

  const getRecentApplicationQueueLabel = useCallback((application: Application): string => {
    const q = application.currentQueue || application.queue;
    if (q == null || String(q).trim() === "") return "-";
    const raw = String(q).trim();
    if (raw.toLowerCase() !== "new") return raw;

    const creator = application.createdBy as
      | { id?: string; _id?: string; role?: string }
      | string
      | undefined;
    const referring = application.referringAgent as
      | { id?: string; _id?: string }
      | string
      | undefined;

    const creatorRole =
      typeof creator === "object" && creator?.role != null
        ? String(creator.role).toUpperCase().replace(/-/g, "_")
        : "";
    if (creatorRole === "AGENT") return "Agent";

    const creatorId =
      typeof creator === "object" && creator
        ? String(creator.id ?? creator._id ?? "")
        : "";
    const referringId =
      typeof referring === "object" && referring
        ? String(referring.id ?? referring._id ?? "")
        : "";
    if (creatorId && referringId && creatorId === referringId) return "Agent";

    return raw;
  }, []);

  const getRecentApplicationQueueBadgeClass = useCallback((queueLabel: string) => {
    if (isContractOutQueueBadgeLabel(queueLabel)) {
      return CONTRACT_OUT_QUEUE_BADGE_CLASS;
    }
    if (isContractSignedQueueBadgeLabel(queueLabel)) {
      return CONTRACT_SIGNED_QUEUE_BADGE_CLASS;
    }
    const n = queueLabel.toLowerCase();
    if (n === "funded" || n === "disbursement") {
      return "bg-green-100 text-green-700";
    }
    if (n === "approved" || n === "contracted") {
      return "bg-blue-100 text-blue-700";
    }
    if (n === "declined") {
      return "bg-red-100 text-red-700";
    }
    if (
      n === "underwriting" ||
      n === "scrubbing" ||
      n === "review" ||
      n === "final review" ||
      n === "final scrubbing" ||
      n === "final" ||
      n === "funding call"
    ) {
      return "bg-sky-100 text-sky-800";
    }
    if (n === "-") {
      return "bg-muted/50 text-foreground";
    }
    return "bg-yellow-100 text-yellow-700";
  }, []);

  const getRecentApplicationRowId = useCallback((app: Application) => {
    const rid = app._id ?? (app as { id?: string }).id;
    if (rid) return String(rid);
    return app.applicationId != null
      ? `missing-uuid-app-${app.applicationId}`
      : "missing-uuid-row";
  }, []);

  const getRecentApplicationClientId = useCallback((application: Application): string | null => {
    const client = application?.client;
    if (!client) return null;
    if (typeof client === "string") return client;
    if (client.clientId != null) return String(client.clientId);
    if (client._id) return String(client._id);
    return null;
  }, []);

  const [dashboardViewApplication, setDashboardViewApplication] = useState<Application | null>(
    null,
  );

  const [dashboardRecentAppsViewMode, setDashboardRecentAppsViewMode] = useState<
    "list" | "grid"
  >(() => {
    if (typeof window === "undefined") return "list";
    try {
      const stored = localStorage.getItem(RECENT_APPLICATIONS_VIEW_MODE_STORAGE_KEY);
      return stored === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        RECENT_APPLICATIONS_VIEW_MODE_STORAGE_KEY,
        dashboardRecentAppsViewMode,
      );
    } catch {
      /* ignore */
    }
  }, [dashboardRecentAppsViewMode]);

  const handleOpenDashboardApplicationDetails = useCallback(
    async (application: Application) => {
      const clientId = getRecentApplicationClientId(application);
      if (clientId) {
        try {
          await dispatch(getClientByClientId(clientId)).unwrap();
        } catch {
          /* sheet still opens */
        }
      }
      setDashboardViewApplication(application);
    },
    [dispatch, getRecentApplicationClientId],
  );

  const handleNavigateDashboardApplication = useCallback(
    (app: Application) => {
      const id =
        app.applicationId != null ? String(app.applicationId) : String(app._id ?? "");
      if (!id) return;
      navigate(`/application-details/${id}`);
    },
    [navigate],
  );

  const formatApplicationIdDisplay = useCallback((id: unknown) => {
    if (id == null) return "—";
    const raw = String(id).trim();
    if (!raw) return "—";
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n).toLocaleString("en-US") : raw;
  }, []);

  // Format date for display (Month Day, Year)
  const formatDateDisplay = (dateString: string): string => {
    return formatDateUtil(dateString, "");
  };

  const handleDateChange = () => {
    // You can add logic here to filter data based on date range
    setIsDatePickerOpen(false);
  };

  // Get user and role from Redux store
  const [user, setUser] = useState<user>();
  const { loading, data } = useSelector((state: RootState) => state.login);

  useEffect(() => {
    setUser(data?.user);
    if (!data?.user) {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    }
  }, [data, loading]);

  // Get user role - available roles: 'AGENT', 'SCRUBBING', 'UNDERWRITER', 'ACCOUNTANT', 'ADMIN'
  const userRole = user?.role || localStorage.getItem("role") || "";

  // SCRUBBING and UNDERWRITER see the same scrubbing dashboard
  const showUnderwriterDashboard =
    userRole === "SCRUBBING" || userRole === "UNDERWRITER";
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'
  const isSyndicator = userRole === 'SYNDICATOR'

  const showPipelineWorkflowCards =
    !isAdmin &&
    (userRole === "AGENT" ||
      userRole === "SCRUBBING" ||
      userRole === "UNDERWRITER");

  // Admin dashboard stats (users, application buckets, recent applications)
  const [adminStats, setAdminStats] = useState<AdminDashboardStats | null>(null)
  const [adminStatsLoading, setAdminStatsLoading] = useState(false)
  const [adminStatsError, setAdminStatsError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) return

    const fetchAdminStats = async () => {
      try {
        setAdminStatsLoading(true)
        setAdminStatsError(null)

        // Backend controller: getAdminDashboardStats
        // Adjust endpoint path if your backend uses a different route.
        const res = await axiosGet('/applications/admin-dashboard-stats')
        console.log("res", res);
        const payload = res?.data?.data || res?.data
        setAdminStats(payload as AdminDashboardStats)
      } catch (err: any) {
        console.error('Failed to fetch admin dashboard stats:', err)
        setAdminStatsError(
          err?.response?.data?.message || 'Failed to load admin dashboard stats',
        )
      } finally {
        setAdminStatsLoading(false)
      }
    }

    fetchAdminStats()
  }, [isAdmin])

  const { stages: pipelineFunnelData, conversionText: pipelineConversionText } = useMemo(() => {
    const pf = adminStats?.charts?.pipelineFunnel
    if (isAdmin && pf) {
      const maybeNested = pf as {
        weekly?: PipelineFunnelSnapshot
        monthly?: PipelineFunnelSnapshot
        yearly?: PipelineFunnelSnapshot
      }
      if (maybeNested?.weekly && maybeNested?.monthly && maybeNested?.yearly) {
        const snap =
          pipelineView === "weekly"
            ? maybeNested.weekly
            : pipelineView === "monthly"
              ? maybeNested.monthly
              : maybeNested.yearly
        return stagesFromPipelineSnapshot(snap)
      }
      const flat = pf as PipelineFunnelSnapshot
      if (flat && typeof flat.submit === "number") {
        return stagesFromPipelineSnapshot(flat)
      }
    }
    return clientPipelineFunnel
  }, [isAdmin, adminStats?.charts?.pipelineFunnel, pipelineView, clientPipelineFunnel])

  // Dynamic admin user summary for radial widgets + legend
  const adminUserSummary = useMemo(() => {
    const u = adminStats?.users
    return ADMIN_USER_COLOR_CONFIG.map((cfg) => ({
      label: cfg.label,
      color: cfg.color,
      value: u ? (u as any)[cfg.key] ?? 0 : 0,
    }))
  }, [adminStats])

  // Dynamic top metrics for admin (Funded / Approved / Rejected / Pending)
  const adminTopStats = useMemo(() => {
    const a = adminStats?.applications
    if (!a) return null

    const last = a.last7Days
    const bucket = (bucketKey: keyof AdminDashboardApplications, lastKey: keyof typeof last) => {
      const b = a[bucketKey] as AdminDashboardBucket
      const countLast7 = last[lastKey] ?? 0
      return {
        title: bucketKey.charAt(0).toUpperCase() + bucketKey.slice(1),
        value: String(countLast7),
        money: formatMoney(b?.totalAmount ?? 0),
        icon: null as any, // icon filled in below to reuse existing config
        bg: '',
        iconBg: '',
        text: 'text-muted-foreground',
      }
    }

    const base = [
      bucket('funded', 'funded'),
      bucket('approved', 'approved'),
      bucket('rejected', 'rejected'),
      bucket('pending', 'pending'),
    ]

    // Reuse styling & icons from nonUnderwriterStats; 4th tile is admin "Pending" (not shown on agent grid).
    const adminPendingVisual = {
      icon: getDashboardStatIcon("Pending"),
      bg: "bg-sky-50 dark:bg-sky-950",
      iconBg: "bg-sky-100 dark:bg-sky-900",
      text: "text-muted-foreground" as const,
    }
    return base.map((b, idx) => {
      const fallback =
        idx < nonUnderwriterStats.length
          ? nonUnderwriterStats[idx]
          : adminPendingVisual
      return {
        ...fallback,
        title: b.title,
        value: b.value,
        money: b.money,
      }
    })
  }, [adminStats, nonUnderwriterStats, formatMoney])

  const adminMonthlyTrendChartData = useMemo(() => {
    const fromAdmin = adminStats?.charts?.monthlyTrend;
    if (fromAdmin && Array.isArray(fromAdmin) && fromAdmin.length > 0) {
      return fromAdmin.map((p: Record<string, unknown>) => ({
        name: String(p.name ?? p.period ?? p.month ?? ""),
        approved: Number(p.approved) || 0,
        funded: Number(p.funded) || 0,
        rejected: Number(p.rejected) || 0,
      }));
    }
    return (trendData as Array<Record<string, unknown>>).map((p) => ({
      name: String(p.name ?? ""),
      approved: Number(p.approved) || 0,
      funded: Number(p.funded) || 0,
      rejected: Number(p.rejected) || 0,
    }));
  }, [adminStats?.charts?.monthlyTrend, trendData]);

  const adminTrendChartYMax = useMemo(() => {
    let max = 0;
    for (const p of adminMonthlyTrendChartData) {
      max = Math.max(max, p.approved, p.funded, p.rejected);
    }
    if (max <= 0) return 1;
    const padded = max * 1.12;
    const step =
      padded >= 1_000_000
        ? 100_000
        : padded >= 100_000
          ? 10_000
          : padded >= 10_000
            ? 1_000
            : padded >= 1_000
              ? 100
              : 10;
    return Math.max(Math.ceil(padded / step) * step, step);
  }, [adminMonthlyTrendChartData]);

  // If logged-in user is a Syndicator, show the dedicated Syndicator dashboard
  if (isSyndicator) {
    return <SyndicatorRoleHomeDashboard />
  }

  // State for selected deals
  // const [selectedDeals, setSelectedDeals] = useState<Set<number>>(new Set());

  // Deals data
  // const dealsData = [
  //   {
  //     id: 21,
  //     clientName: "Abc name",
  //     assignedDate: "Sep 29, 2025",
  //     status: "In Review",
  //     requestedAmount: "$250,000",
  //     decisionDate: "Sep 29, 2025",
  //   },
  //   {
  //     id: 22,
  //     clientName: "Abc name",
  //     assignedDate: "Sep 29, 2025",
  //     status: "Waiting for Docs",
  //     requestedAmount: "$500,000",
  //     decisionDate: "Sep 29, 2025",
  //   },
  //   {
  //     id: 23,
  //     clientName: "Abc name",
  //     assignedDate: "Sep 29, 2025",
  //     status: "Approved",
  //     requestedAmount: "$1,200,000",
  //     decisionDate: "Sep 29, 2025",
  //   },
  //   {
  //     id: 24,
  //     clientName: "Abc name",
  //     assignedDate: "Sep 29, 2025",
  //     status: "In Progress",
  //     requestedAmount: "$75,000",
  //     decisionDate: "Sep 29, 2025",
  //   },
  // ];

  // const handleDealSelect = (dealId: number) => {
  //   const newSelected = new Set(selectedDeals);
  //   if (newSelected.has(dealId)) {
  //     newSelected.delete(dealId);
  //   } else {
  //     newSelected.add(dealId);
  //   }
  //   setSelectedDeals(newSelected);
  // };

  // const filteredDealsData = useMemo(() => {
  //   return dealsData.filter((deal) => {
  //     const date = deal.assignedDate ? new Date(deal.assignedDate) : null;
  //     return filterByDateRange(date);
  //   });
  // }, [dealsData, filterByDateRange]);

  // const handleSelectAll = () => {
  //   if (selectedDeals.size === filteredDealsData.length) {
  //     setSelectedDeals(new Set());
  //   } else {
  //     setSelectedDeals(new Set(filteredDealsData.map((d) => d.id)));
  //   }
  // };

  // const getStatusBadgeClass = (status: string) => {
  //   switch (status) {
  //     case "In Review":
  //       return "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800";
  //     case "Waiting for Docs":
  //       return "text-yellow-600 border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800";
  //     case "Approved":
  //       return "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800";
  //     case "In Progress":
  //       return "text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800";
  //     default:
  //       return "text-muted-foreground border-border bg-muted";
  //   }
  // };


  // Data matching the provided image
  const syndicatorPieData = [
    { name: 'Successful', value: 87833, color: '#4a84bc' },
    { name: 'Remaining', value: 11206, color: '#d1e9f6' },
    { name: 'Default', value: 5860, color: '#ffb09c' },
  ];

  const totalAmount = formatCurrency(
    syndicatorPieData.reduce((s, d) => s + d.value, 0),
  );

  const surfaceBase = isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#e5eef5]';

  const recentAppsFooterTotal =
    dashboardRoleAppsTotal > 0 ? dashboardRoleAppsTotal : dashboardRoleApps.length;
  const recentAppsDisplayedCount = latestDashboardApplications.length;

  const dashboardRecentApplicationsSection = (
    <section className="mt-6">
      <div
        className={`rounded-[5px] border shadow-lg ${isDark ? "bg-[#141517] border-[#374151]" : "bg-card border-[#FDFDFD]"
          }`}
      >
        <div
          className={`px-4 md:px-5 py-2 rounded-t-[5px] flex flex-wrap items-center justify-between gap-3 ${isDark ? "bg-[#2A2B2F]" : "bg-[#F9FAFD]"
            }`}
        >
          <span className="font-semibold text-[1rem] text-foreground uppercase">
            Recent Applications
          </span>
          <div className="flex flex-wrap items-center gap-3 ml-auto">
            <div
              className="flex items-center gap-2 shrink-0"
              role="group"
              aria-label="Applications display layout"
            >
              <span className="text-xs text-muted-foreground hidden sm:inline">View</span>
              <div className="flex rounded-md border border-border overflow-hidden bg-card">
                <Button
                  type="button"
                  variant={dashboardRecentAppsViewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-10 sm:h-9 rounded-none px-3 gap-1.5 shadow-none"
                  onClick={() => setDashboardRecentAppsViewMode("list")}
                  aria-pressed={dashboardRecentAppsViewMode === "list"}
                  title="List view"
                >
                  <LayoutList className="size-4 shrink-0" />
                  <span className="text-xs font-medium">List</span>
                </Button>
                <Button
                  type="button"
                  variant={dashboardRecentAppsViewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-10 sm:h-9 rounded-none px-3 gap-1.5 border-l border-border shadow-none"
                  onClick={() => setDashboardRecentAppsViewMode("grid")}
                  aria-pressed={dashboardRecentAppsViewMode === "grid"}
                  title="Grid view"
                >
                  <LayoutGrid className="size-4 shrink-0" />
                  <span className="text-xs font-medium">Grid</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="p-1">
          <div className="overflow-x-auto rounded-xl">
            {dashboardRoleAppsLoading && latestDashboardApplications.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary shrink-0" />
                <span className="ml-2 text-muted-foreground">Loading applications...</span>
              </div>
            ) : dashboardRecentAppsViewMode === "list" ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="px-6 text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide text-muted-foreground">
                        ID
                      </span>
                    </TableHead>
                    <TableHead className="px-6 text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide text-muted-foreground">
                        BUSINESS NAME
                      </span>
                    </TableHead>
                    <TableHead className="px-6 text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide text-muted-foreground">
                        EMAIL
                      </span>
                    </TableHead>
                    <TableHead className="px-6 text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide text-muted-foreground">
                        LOAN AMOUNT
                      </span>
                    </TableHead>
                    <TableHead className="px-6 text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide text-muted-foreground">
                        CURRENT STATE
                      </span>
                    </TableHead>
                    <TableHead className="px-6 text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide text-muted-foreground">
                        CREATED AT
                      </span>
                    </TableHead>
                    <TableHead className="px-6 text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide text-muted-foreground">
                        LAST MODIFIED DATE
                      </span>
                    </TableHead>
                    <TableHead className="px-6 text-left text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide text-muted-foreground">
                        VIEW
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestDashboardApplications.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="h-24 text-left text-muted-foreground font-poppins py-10"
                      >
                        <p className="font-medium text-foreground">No applications found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    latestDashboardApplications.map((app, idx) => {
                      const rowId = getRecentApplicationRowId(app);
                      const queueLabel = getRecentApplicationQueueLabel(app);
                      const loanAmount = resolveApplicationDisplayLoanAmount(app);
                      return (
                        <TableRow
                          key={rowId}
                          tabIndex={0}
                          className={`cursor-pointer border-border hover:bg-accent ${idx % 2 ? "bg-muted/50" : ""}`}
                          onClick={(e) => {
                            const t = e.target;
                            if (!(t instanceof Element)) return;
                            if (t.closest("button, input, a, [role='button']")) return;
                            handleNavigateDashboardApplication(app);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            handleNavigateDashboardApplication(app);
                          }}
                        >
                          <TableCell className="px-6 text-[0.85rem] text-foreground">
                            <span className="font-medium">
                              {app.applicationId != null
                                ? formatApplicationIdDisplay(app.applicationId)
                                : "-"}
                            </span>
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-foreground">
                            {getRecentAppClientName(app.client)}
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-foreground">
                            {getRecentAppClientEmail(app.client)}
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-foreground">
                            {loanAmount == null ? (
                              <span>-</span>
                            ) : (
                              <span>{formatCurrency(loanAmount)}</span>
                            )}
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-foreground">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getRecentApplicationQueueBadgeClass(queueLabel)}`}
                            >
                              {queueLabel}
                            </span>
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-foreground">
                            {formatDateForRecentAppsTable(app.createdAt)}
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-foreground">
                            {formatDateForRecentAppsTable(app.updatedAt ?? app.createdAt)}
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-left text-foreground">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleOpenDashboardApplicationDetails(app);
                              }}
                              className="inline-flex items-center justify-center text-[var(--brand)] hover:text-[var(--brand-accent-strong)] cursor-pointer"
                              aria-label="View application details"
                            >
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current">
                                <EyeIcon className="h-4 w-4" />
                              </span>
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            ) : latestDashboardApplications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-xl">
                <p className="font-medium text-muted-foreground">No applications found</p>
              </div>
            ) : (
              <div className="p-3 md:p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {latestDashboardApplications.map((app) => {
                    const rowId = getRecentApplicationRowId(app);
                    const queueLabel = getRecentApplicationQueueLabel(app);
                    const loanAmount = resolveApplicationDisplayLoanAmount(app);
                    return (
                      <div
                        key={rowId}
                        role="group"
                        tabIndex={0}
                        aria-label={`Open application ${app.applicationId ?? app._id ?? ""}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleNavigateDashboardApplication(app);
                          }
                        }}
                        onClick={() => handleNavigateDashboardApplication(app)}
                        className={`rounded-lg border shadow-sm flex flex-col gap-3 p-4 text-left transition hover:ring-2 hover:ring-[var(--brand)]/20 cursor-pointer ${isDark
                          ? "bg-[#1a1b1e] border-[#374151]"
                          : "bg-card border-[#F0F0F0]"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground truncate">
                              {getRecentAppClientName(app.client)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              ID{" "}
                              <span className="text-sky-600 font-medium">
                                {app.applicationId != null
                                  ? formatApplicationIdDisplay(app.applicationId)
                                  : "—"}
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleOpenDashboardApplicationDetails(app);
                            }}
                            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/10"
                            aria-label="Preview application"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p
                            className="truncate"
                            title={getRecentAppClientEmail(app.client)}
                          >
                            {getRecentAppClientEmail(app.client)}
                          </p>
                          <p>
                            <span className="text-foreground/80">Loan: </span>
                            {loanAmount == null
                              ? "—"
                              : formatCurrency(loanAmount)}
                          </p>
                          <p>
                            <span className="text-foreground/80">Created: </span>
                            {formatDateForRecentAppsTable(app.createdAt)}
                          </p>
                        </div>
                        <div className="pt-1 border-t border-border/60">
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getRecentApplicationQueueBadgeClass(queueLabel)}`}
                          >
                          {queueLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-4 md:px-5 py-4 border-t bg-card rounded-b-2xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              <span>
                {recentAppsDisplayedCount === 0
                  ? `Showing 0 to 0 of ${recentAppsFooterTotal} entries`
                  : `Showing 1 to ${recentAppsDisplayedCount} of ${recentAppsFooterTotal} entries`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="default"
                size="icon"
                className="h-8 w-8 bg-[#2F80ED] text-white hover:bg-[#2F80ED]/90"
                disabled
              >
                1
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  // Logic to place labels inside slices
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }: { cx: number, cy: number, midAngle: number, innerRadius: number, outerRadius: number, value: number, index: number }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
        {formatCurrency(value as number)}
      </text>
    );
  };

  return (
    <div
      className="min-h-screen flex bg-background"
    >
      {/* Main */}
      {!showUnderwriterDashboard ?
        (isAdmin ? (
          <main className="flex-1 px-6 md:px-8 py-6">
            {/* Top Bar */}
            <div className="flex items-center justify-between">
              <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
                Admin Dashboard
              </h1>
              <div className="flex items-center gap-3">
                <DropdownMenu open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={`flex items-center gap-2 px-3 py-2 h-9 rounded-md transition-colors ${isDark
                        ? 'bg-[#141517] hover:bg-[#374151] text-white'
                        : 'bg-white hover:bg-gray-50 text-black border border-[var(--brand)]'
                        }`}
                      style={isDark ? { border: '1px solid rgba(118, 183, 226, 0.5)' } : {}}
                    >
                      <Calendar className={`h-4 w-4 ${isDark ? 'text-white' : 'text-black'}`} />
                      <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-black'}`}>DATE:</span>
                      <span className={`text-sm ${isDark ? 'text-white' : 'text-black'}`}>
                        {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-foreground">Start Date</label>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-foreground">End Date</label>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full"
                          min={startDate}
                        />
                      </div>
                      <Button
                        onClick={handleDateChange}
                        className="w-full bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
                      >
                        Apply
                      </Button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Users + Top Stats */}

            <section className="mt-6 grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
              {/* Left Section: Users Panel */}
              <div className="bg-[#004172] rounded-xl p-6 text-white shadow-sm flex flex-col h-full">
                <h2 className="text-lg font-semibold mb-8">Users</h2>

                {/* Progress Circles Row */}
                <div className="flex justify-between items-center mb-10 px-2">
                  {adminUserSummary.map((item) => (
                    <div key={item.label} className="relative h-32 w-32">

                      <svg className="h-full w-full" viewBox="0 0 100 100">

                        {/* Background Track */}
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          fill="transparent"
                          stroke="rgba(255,255,255,0.1)"
                          strokeWidth="8"
                        />

                        {/* Active Progress */}
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          fill="transparent"
                          stroke={item.color}
                          strokeWidth="8"
                          strokeDasharray="263.89"
                          strokeDashoffset={263.89 * (1 - 0.75)}
                          strokeLinecap="round"
                          style={{
                            transform: "rotate(-90deg)",
                            transformOrigin: "50% 50%",
                            transition: "stroke-dashoffset 0.5s ease"
                          }}
                        />

                      </svg>

                      {/* Value */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-bold">{item.value}</span>
                      </div>

                    </div>
                  ))}
                </div>

                {/* Structured Legend - 2 Rows as per image */}
                <div className="mt-auto space-y-4">
                  {/* Row 1 */}
                  <div className="flex justify-center gap-10">
                    {adminUserSummary.slice(0, 3).map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <p className="text-xs font-medium">
                          {item.label}: <span className="font-bold ml-1">{item.value}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                  {/* Row 2 */}
                  <div className="flex justify-center gap-10">
                    {adminUserSummary.slice(3, 5).map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <p className="text-xs font-medium">
                          {item.label}: <span className="font-bold ml-1">{item.value}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Section: 2x2 Metric Grid (layout aligned with commission portal KPI cards) */}
              <div className="grid grid-cols-5 gap-3">
                {(adminTopStats || nonUnderwriterStats).map((c, i) => {
                  const isAdminSevenDayTile = Boolean(adminTopStats);
                  return (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          goToApplicationsForStatCard(c.title, {
                            pendingMeansPipeline:
                              isAdminSevenDayTile && c.title === "Pending",
                          });
                        }
                      }}
                      onClick={() =>
                        goToApplicationsForStatCard(c.title, {
                          pendingMeansPipeline:
                            isAdminSevenDayTile && c.title === "Pending",
                        })
                      }
                      className="h-full rounded-xl cursor-pointer transition hover:ring-2 hover:ring-[var(--brand)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
                    >
                      <CornerSummaryCard
                        isDark={isDark}
                        title={c.title.toUpperCase()}
                        countValue={c.value}
                        countSuffix={
                          isAdminSevenDayTile ? "Last 7 days" : "Submissions"
                        }
                        footLeft={dashboardStatAmountCaption(c.title)}
                        amountValue={c.money}
                        icon={c.icon}
                        iconSize={28}
                      />
                    </div>
                  );
                })}
              </div>
            </section>



            {/* Monthly Trend + Pipeline */}
            <section className="mt-6 grid grid-cols-1 xl:grid-cols-[2fr_1.3fr] gap-5">
              <div className={`rounded-md border p-5 shadow-lg ${isDark
                ? 'bg-[#141517] border-[#374151]'
                : 'bg-card border-[#FDFDFD]'
                }`}>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-semibold text-foreground">Monthly Trend</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#76B7E2]"></div>
                      <span className="text-xs text-muted-foreground">
                        Approved
                        {adminStats?.applications && (
                          <>
                            {': '}
                            {formatMoney(
                              adminStats.applications.approved.totalAmount ?? 0,
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[image:var(--brand-gradient)]"></div>
                      <span className="text-xs text-muted-foreground">
                        Funded
                        {adminStats?.applications && (
                          <>
                            {': '}
                            {formatMoney(
                              adminStats.applications.funded.totalAmount ?? 0,
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#A9CCE3]"></div>
                      <span className="text-xs text-muted-foreground">
                        Rejected
                        {adminStats?.applications && (
                          <>
                            {': '}
                            {formatMoney(
                              adminStats.applications.rejected.totalAmount ?? 0,
                            )}
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-8 gap-2 text-sm">Monthly <ChevronDown className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Weekly</DropdownMenuItem>
                      <DropdownMenuItem>Monthly</DropdownMenuItem>
                      <DropdownMenuItem>Yearly</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-8 h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={adminMonthlyTrendChartData}
                      barGap={0}
                      margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={{ stroke: '#000000' }}
                        tick={{ fill: isDark ? "#FFFFFF" : "#000000", fontSize: 12 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={{ stroke: '#000000' }}
                        tick={{ fill: isDark ? "#FFFFFF" : "#000000", fontSize: 12 }}
                        label={{ value: 'Amount', angle: -90, position: 'insideLeft', offset: -10 }}
                        tickFormatter={(value) => formatCurrency(value as number)}
                        domain={[0, adminTrendChartYMax]}
                        tickCount={6}
                      />
                      <Tooltip
                        cursor={{ fill: 'transparent' }}
                        formatter={(value, name) => [
                          formatCurrency(Number(value ?? 0)),
                          String(name ?? ''),
                        ]}
                      />

                      {/* Bars matching the image colors */}
                      <Bar dataKey="rejected" name="Rejected" fill="#A9CCE3" barSize={10} />
                      <Bar dataKey="funded" name="Funded" fill="var(--brand)" barSize={10} />
                      <Bar dataKey="approved" name="Approved" fill="#3b82f6" barSize={10} />

                      {/* The Connection Line anchoring to the highest bar (Funded) */}
                      <Line
                        type="linear"
                        dataKey="funded"
                        stroke="var(--brand)"
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <ApplicationPipelineFunnelCard
                isDark={isDark}
                stages={pipelineFunnelData}
                conversionText={pipelineConversionText}
                pipelineView={pipelineView}
                onSelectView={setPipelineView}
              />
            </section>

            {/* Syndicator Donut + Commission */}
            <section className="mt-6 grid grid-cols-1 xl:grid-cols-[1.4fr_1.6fr] gap-5">

              <div className={`rounded-xl border p-6 shadow-sm ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-white border-[#f0f0f0]'
                }`}>
                <h3 className="text-md font-bold text-foreground mb-4">Invested Amount By Syndicator</h3>

                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                  {/* Pie Chart Section */}
                  <div className="relative w-full md:w-1/2 h-52 flex flex-col items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={syndicatorPieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(props: any) => renderCustomizedLabel(props)}
                          outerRadius={85}
                          fill="#8884d8"
                          dataKey="value"
                          stroke="none"
                        >
                          {syndicatorPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Total Amount centered below chart */}
                    <p className="text-lg font-black mt-2 text-foreground">{totalAmount}</p>
                  </div>

                  {/* Legend Section */}
                  <div className="w-full md:w-1/2 space-y-5">
                    {syndicatorPieData.map((item) => (
                      <div key={item.name} className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-xs font-medium text-muted-foreground">{item.name}</span>
                        </div>
                        <p className="text-xl font-black text-foreground ml-5">
                          {formatCurrency(item.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`rounded-md border p-5 shadow-lg ${isDark
                ? 'bg-[#141517] border-[#374151]'
                : 'bg-card border-[#FDFDFD]'
                }`}>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-semibold text-foreground">Monthly Commission Trend</h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-8 gap-2 text-xs">Monthly <ChevronDown className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Weekly</DropdownMenuItem>
                      <DropdownMenuItem>Monthly</DropdownMenuItem>
                      <DropdownMenuItem>Yearly</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-4 h-[210px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={filteredCommissionData}
                      margin={{ top: 5, right: 5, bottom: 5, left: 36 }}
                    >
                      <defs>
                        <linearGradient id="colorCommissionAdmin" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#F5FBFF" stopOpacity={0} />
                          <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} horizontal={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={true}
                        fontSize={12}
                        fontWeight={400}
                        stroke={isDark ? "#FFFFFF" : "#000000"}
                        tick={{ fill: isDark ? "#FFFFFF" : "#000000" }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={true}
                        stroke={isDark ? "#FFFFFF" : "#000000"}
                        fontSize={12}
                        fontWeight={400}
                        tick={{ fill: isDark ? "#FFFFFF" : "#000000" }}
                        label={{
                          value: "Amount",
                          angle: -90,
                          position: "insideLeft",
                          offset: -6,
                          style: {
                            textAnchor: "middle",
                            color: isDark ? "#FFFFFF" : "#000000",
                          },
                        }}
                        tickFormatter={(value) => formatCurrency(value as number)}
                        domain={[0, 6000]}
                        ticks={[0, 1000, 2000, 3000, 4000, 5000, 6000]}
                      />
                      <Tooltip
                        cursor={{ stroke: 'var(--brand)', strokeWidth: 1 }}
                        contentStyle={{
                          backgroundColor: 'white',
                          borderRadius: '8px',
                          padding: '12px',
                          border: 'none',
                          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
                        }}
                        content={({ payload, label }) => {
                          if (!payload || payload.length === 0) return null;
                          const monthName = typeof label === 'string' ? label.toUpperCase() : String(label).toUpperCase();
                          const value = payload[0]?.value as number;
                          return (
                            <div className="bg-white rounded-lg p-3 shadow-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 rounded-full bg-[image:var(--brand-gradient)]"></div>
                                <p className="text-[var(--brand)] font-semibold text-sm">{monthName}</p>
                              </div>
                              <p className="text-black text-sm">
                                <span className="font-medium">Commission: </span>
                                <span>{formatCurrency(value)}</span>
                              </p>
                            </div>
                          )
                        }}
                      />
                      <Area
                        type="linear"
                        dataKey="value"
                        stroke="var(--brand)"
                        strokeWidth={2}
                        fill="url(#colorCommissionAdmin)"
                        dot={{ r: 4, fill: 'var(--brand)' }}
                        activeDot={{ r: 6, fill: 'var(--brand)' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className={`mt-6 rounded-md border shadow-lg p-0 ${isDark
              ? 'bg-[#141517] border-[#374151]'
              : 'bg-card border-[#FDFDFD]'
              }`}>
              <div className={`rounded-xl border shadow-sm overflow-hidden ${surfaceBase}`}>
                <div className="p-4 bg-slate-50/50 border-b flex justify-between items-center">
                  <h3 className="text-md font-bold text-black-600">Recent Applications</h3>
                  <Button variant="ghost" size="sm" className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white text-sm h-9 px-4">View All</Button>
                </div>
                <Table>
                  <TableHeader className="bg-slate-100/50">
                    <TableRow className="border-inherit">
                      {['ID', 'DATE', 'STATUS', 'APPLICATION NAME', 'ADVANCE AMOUNT'].map(head => (
                        <TableHead key={head} className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
                          {head}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!adminStats || adminStats.recentApplications.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-12 text-left text-xs dark:text-white text-slate-400 font-medium italic">
                          {adminStatsLoading
                            ? 'Loading recent applications...'
                            : adminStatsError || 'No recent applications'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      adminStats.recentApplications.map((app) => (
                        <TableRow key={app.id}>
                          <TableCell className="text-xs font-semibold dark:text-white text-slate-700">
                            #{app.applicationId}
                          </TableCell>
                          <TableCell className="text-xs dark:text-white text-slate-600">
                            {formatDateUtil(app.date)}
                          </TableCell>
                          <TableCell className="text-xs dark:text-white text-slate-600">
                            {app.status}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">
                            {app.applicationName || '—'}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">
                            {app.advanceAmount != null
                              ? formatMoney(app.advanceAmount)
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </main>
        ) : (
          <main className="flex-1 px-6 md:px-8 py-6">
            {/* Top Bar */}
            <div className="flex items-center justify-between">
              <h1 className="text-[22px] font-semibold tracking-tight">
                {/* <span className="text-foreground">Dashboard</span> */}
              </h1>
              <div className="flex items-center gap-3">
                <DropdownMenu
                  open={isDatePickerOpen}
                  onOpenChange={setIsDatePickerOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      className={`flex items-center gap-2 px-3 py-2 h-9 rounded-md transition-colors ${isDark
                        ? "bg-[#141517] hover:bg-[#374151] text-white"
                        : "bg-white hover:bg-gray-50 text-black border border-[var(--brand)]"
                        }`}
                      style={isDark ? { border: "1px solid rgba(118, 183, 226, 0.5)" } : {}}
                    >
                      <Calendar className={`h-4 w-4 ${isDark ? "text-white" : "text-black"}`} />

                      <span
                        className={`text-xs font-semibold ${isDark ? "text-white" : "text-black"
                          }`}
                      >
                        DATE:
                      </span>

                      <span className={`text-sm ${isDark ? "text-white" : "text-black"}`}>
                        {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-foreground">Start Date</label>

                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-foreground">End Date</label>

                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full"
                          min={startDate}
                        />
                      </div>
                      <Button
                        onClick={handleDateChange}
                        className="w-full bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
                      >
                        Apply
                      </Button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>



            {/* Stats: agents get 5 KPIs in one row (matches commission portal); others keep 3-up */}
            <section
              className={
                showPipelineWorkflowCards && userRole === "AGENT"
                  ? "mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
                  : "mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
              }
            >
              {(showPipelineWorkflowCards && userRole === "AGENT"
                ? [...nonUnderwriterStats, ...workflowStateCards]
                : nonUnderwriterStats
              ).map((c, i) => (
                <div
                  key={`${c.title}-${i}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goToApplicationsForStatCard(c.title);
                    }
                  }}
                  onClick={() => goToApplicationsForStatCard(c.title)}
                  className="h-full rounded-xl cursor-pointer transition hover:ring-2 hover:ring-[var(--brand)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
                >
                  <CornerSummaryCard
                    isDark={isDark}
                    title={c.title.toUpperCase()}
                    countValue={c.value}
                    countSuffix="Submissions"
                    footLeft={dashboardStatAmountCaption(c.title)}
                    amountValue={c.money}
                    icon={c.icon}
                    iconSize={24}
                  />
                </div>
              ))}
            </section>

            {/* Charts: agents see pipeline funnel beside trend; others keep commission trend */}
            <section
              className={
                userRole === "AGENT"
                  ? "mt-6 grid grid-cols-1 xl:grid-cols-[7fr_3fr] gap-5"
                  : "flex mt-6 w-full gap-5"
              }
            >
              <div
                className={`${userRole === "AGENT"
                  ? "min-h-[350px] h-full min-w-0"
                  : "w-full h-[350px]"
                  } rounded-md border p-5 shadow-lg ${isDark
                    ? "bg-[#141517] border-[#374151]"
                    : "bg-card border-[#FDFDFD]"
                  }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-semibold text-foreground">
                    {`${trendView.charAt(0).toUpperCase() + trendView.slice(1)}`}{" "}
                    Trend
                  </h3>
                  {/* Legend */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#76B7E2]"></div>
                      <span className="text-sm text-muted-foreground">
                        Approved
                      </span>
                    </div>
                    <div className="h-4 w-px"></div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[image:var(--brand-gradient)]"></div>
                      <span className="text-sm text-muted-foreground">
                        Funded
                      </span>
                    </div>
                  </div>
                  {/* Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-8 gap-2 text-sm">
                        {trendView === "monthly"
                          ? "Monthly"
                          : trendView === "weekly"
                            ? "Weekly"
                            : "Yearly"}
                        <ChevronDown className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setTrendView("weekly")}>
                        Weekly
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setTrendView("monthly")}>
                        Monthly
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setTrendView("yearly")}>
                        Yearly
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-10 h-[210px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={filteredTrendData}
                      barCategoryGap={20}
                      barGap={0}
                      margin={{
                        top: 5,
                        right: 5,
                        bottom: 5,
                        left: 30,
                      }}
                    >
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={true}
                        fontSize={12}
                        fontWeight={400}
                        stroke={isDark ? "#FFFFFF" : "#000000"}
                        tick={{ fill: isDark ? "#FFFFFF" : "#000000" }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={true}
                        stroke={isDark ? "#FFFFFF" : "#000000"}
                        fontSize={12}
                        fontWeight={400}
                        tick={{ fill: isDark ? "#FFFFFF" : "#000000" }}
                        label={{
                          value: "Amount",
                          angle: -90,
                          position: "insideLeft",
                          offset: -20,
                          style: {
                            textAnchor: "middle",
                            color: isDark ? "#FFFFFF" : "#000000",
                          },
                        }}
                        tickFormatter={(value) => formatCurrency(value as number)}
                        domain={[0, trendChartYMax]}
                        tickCount={6}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(0, 0, 0, 0.05)" }}
                        contentStyle={{
                          backgroundColor: isDark ? "#111827" : "#f1f5f9",
                          borderRadius: "6px",
                          padding: "10px",
                          border: isDark
                            ? "1px solid #374151"
                            : "1px solid #e5e7eb",
                        }}
                        content={({ payload, label }) => {
                          const firstPayload = payload?.[0] as any | undefined;
                          const dateKey = firstPayload?.payload?.dateKey as
                            | string
                            | undefined;

                          let formattedLabel: string | number | undefined = label;

                          if (trendView === "monthly" && dateKey) {
                            const d = new Date(dateKey);
                            if (!isNaN(d.getTime())) {
                              const monthShort = formatMonthShortET(d).toUpperCase();
                              const day = formatDayET(d);
                              formattedLabel = `${monthShort}-${day}`;
                            }
                          }

                          return (
                            <div className="bg-card dark:bg-card rounded-md p-2">
                              <p className="text-foreground font-medium">
                                {formattedLabel}
                              </p>
                              {payload?.map((entry, index) => (
                                <p key={index} className="text-sm">
                                  <span style={{ color: entry.color }}>
                                    {entry.name}:
                                  </span>{" "}
                                  <span className="text-foreground">
                                    {formatCurrency(entry.value as number)}
                                  </span>
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="funded"
                        name="Funded"
                        fill="var(--brand)"
                        radius={[3, 3, 0, 0]}
                        barSize={12}
                      />
                      <Bar
                        dataKey="approved"
                        name="Approved"
                        fill="#76B7E2"
                        radius={[3, 3, 0, 0]}
                        barSize={12}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center mt-2 text-md text-muted-foreground">
                    {trendView === "monthly"
                      ? "Days"
                      : trendView === "weekly"
                        ? "Weeks"
                        : "Months"}{" "}
                  </div>
                </div>
              </div>

              {userRole === "AGENT" ? (
                <ApplicationPipelineFunnelCard
                  isDark={isDark}
                  className="min-h-[350px] min-w-0"
                  stages={pipelineFunnelData}
                  conversionText={pipelineConversionText}
                  pipelineView={pipelineView}
                  onSelectView={setPipelineView}
                />
              ) : (
                <div
                  className={`w-[70%] h-[350px] flex flex-col justify-between rounded-md border p-5 shadow-lg ${isDark
                    ? "bg-[#141517] border-[#374151]"
                    : "bg-card border-[#FDFDFD]"
                    }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold text-foreground">
                      {`${commissionChartView.charAt(0).toUpperCase() + commissionChartView.slice(1)}`}{" "}
                      Commission Trend
                    </h3>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="h-8 gap-2 text-sm">
                          {commissionChartView === "monthly"
                            ? "Monthly"
                            : commissionChartView === "weekly"
                              ? "Weekly"
                              : "Yearly"}
                          <ChevronDown className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => setCommissionChartView("weekly")}
                        >
                          Weekly
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setCommissionChartView("monthly")}
                        >
                          Monthly
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setCommissionChartView("yearly")}
                        >
                          Yearly
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className=" flex flex-col items-center justify-center  h-[270px]">
                    <div className="flex items-center gap-4 ">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#76B7E2]"></div>
                        <span className="text-xs text-muted-foreground">
                          Paid Commission
                        </span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={filteredCommissionData}
                        margin={{ top: 5, right: 5, bottom: 5, left: 36 }}
                      >
                        <defs>
                          <linearGradient
                            id="colorCommission"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--brand)"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="#F5FBFF"
                              stopOpacity={0}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--brand)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          horizontal={false}
                          strokeDasharray="3 3"
                        />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={true}
                          fontSize={12}
                          fontWeight={40}
                          stroke={isDark ? "#FFFFFF" : "#000000"}
                          tick={{ fill: isDark ? "#FFFFFF" : "#000000" }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={true}
                          stroke={isDark ? "#FFFFFF" : "#000000"}
                          fontSize={12}
                          fontWeight={400}
                          tick={{ fill: isDark ? "#FFFFFF" : "#000000" }}
                          label={{
                            value: "Amount",
                            angle: -90,
                            position: "insideLeft",
                            offset: -6,
                            style: {
                              textAnchor: "middle",
                              color: isDark ? "#FFFFFF" : "#000000",
                            },
                          }}
                          tickFormatter={(value) => formatCurrency(value as number)}
                          domain={[0, 10000]}
                          ticks={[
                            0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000,
                            10000,
                          ]}
                        />
                        <Tooltip
                          cursor={{ stroke: "var(--brand)", strokeWidth: 1 }}
                          contentStyle={{
                            backgroundColor: "white",
                            borderRadius: "8px",
                            padding: "12px",
                            border: "none",
                            boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.1)",
                          }}
                          content={({ payload, label }) => {
                            if (!payload || payload.length === 0) return null;

                            let displayLabel: string | number | undefined = label;

                            if (
                              commissionChartView === "monthly" &&
                              termsOffersList &&
                              (termsOffersList as TermsOffer[]).length > 0 &&
                              label !== undefined &&
                              label !== null
                            ) {
                              const first = (termsOffersList as TermsOffer[])[0];
                              const created = first.createdAt
                                ? new Date(first.createdAt as any)
                                : null;
                              if (created && !isNaN(created.getTime())) {
                                const monthShort = formatMonthShortET(created).toUpperCase();
                                displayLabel = `${monthShort}-${label}`;
                              }
                            } else if (typeof label === "string") {
                              displayLabel = label.toUpperCase();
                            } else if (label !== undefined && label !== null) {
                              displayLabel = String(label).toUpperCase();
                            }

                            const value = payload[0]?.value as number;
                            return (
                              <div className="bg-white rounded-lg p-3 shadow-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-2 h-2 rounded-full bg-[image:var(--brand-gradient)]"></div>
                                  <p className="text-[var(--brand)] font-semibold text-sm">
                                    {displayLabel}
                                  </p>
                                </div>
                                <p className="text-black text-sm">
                                  <span className="font-medium">Commission: </span>
                                  <span>{formatCurrency(value)}</span>
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="var(--brand)"
                          strokeWidth={2}
                          fill="url(#colorCommission)"
                          dot={{ r: 4, fill: "var(--brand)" }}
                          activeDot={{ r: 6, fill: "var(--brand)" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center mt-2 text-md text-muted-foreground">
                      {commissionChartView === "monthly"
                        ? "Days"
                        : commissionChartView === "weekly"
                          ? "Weeks"
                          : "Months"}{" "}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {dashboardRecentApplicationsSection}
          </main>
        ))
        : (
          <>
            <main className="flex-1 px-6 md:px-8 py-6">
              {/* Top Bar */}
              <div className="flex items-center justify-between">
                <h1 className="text-[22px] font-semibold tracking-tight">
                  {/* <span className="text-foreground">Dashboard</span> */}
                </h1>
                <div className="flex items-center gap-3">
                  {userRole !== "UNDERWRITER" && (
                    <Button
                      variant="outline"
                      className="h-9 gap-2 bg-[image:var(--brand-gradient)] hover:opacity-90 text-white hover:text-white border-[var(--brand)]"
                      onClick={() => navigate("/case-management")}
                    >
                      <span className="text-sm font-semibold">
                        View Case Management
                      </span>
                    </Button>
                  )}
                  <DropdownMenu
                    open={isDatePickerOpen}
                    onOpenChange={setIsDatePickerOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`flex items-center gap-2 px-3 py-2 h-9 rounded-md transition-colors ${isDark
                          ? "bg-[#141517] hover:bg-[#374151] text-white"
                          : "bg-white hover:bg-gray-50 text-black border border-[var(--brand)]"
                          }`}
                        style={
                          isDark
                            ? { border: "1px solid rgba(118, 183, 226, 0.5)" }
                            : {}
                        }
                      >
                        <Calendar
                          className={`h-4 w-4 ${isDark ? "text-white" : "text-black"}`}
                        />
                        <span
                          className={`text-xs font-semibold ${isDark ? "text-white" : "text-black"}`}
                        >
                          DATE:
                        </span>
                        <span
                          className={`text-sm ${isDark ? "text-white" : "text-black"}`}
                        >
                          {formatDateDisplay(startDate)} -{" "}
                          {formatDateDisplay(endDate)}
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-auto p-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-semibold text-foreground">
                            Start Date
                          </label>
                          <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-semibold text-foreground">
                            End Date
                          </label>
                          <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full"
                            min={startDate}
                          />
                        </div>
                        <Button
                          onClick={handleDateChange}
                          className="w-full bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
                        >
                          Apply
                        </Button>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Scrubbing/Underwriter: keep first 5 KPI cards in one row (agent-style layout). */}
              <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                {underwriterStats.slice(0, 5).map((c, i) => (
                  <div
                    key={`uw-card-${i}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goToApplicationsForStatCard(c.title);
                      }
                    }}
                    onClick={() => goToApplicationsForStatCard(c.title)}
                    className="h-full rounded-xl cursor-pointer transition hover:ring-2 hover:ring-[var(--brand)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
                  >
                    <CornerSummaryCard
                      isDark={isDark}
                      title={c.title.toUpperCase()}
                      countValue={c.value}
                      countSuffix="Submissions"
                      footLeft={dashboardStatAmountCaption(c.title)}
                      amountValue={c.money}
                      icon={c.icon}
                      iconSize={24}
                    />
                  </div>
                ))}
              </section>

              {/* Scrubbing/Underwriter: render remaining cards on the next row. */}
              {(underwriterStats.length > 5 ||
                (showPipelineWorkflowCards && showUnderwriterDashboard)) && (
                  <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {underwriterStats.slice(5).map((c, i) => (
                      <div
                        key={`uw-secondary-${i}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            goToApplicationsForStatCard(c.title);
                          }
                        }}
                        onClick={() => goToApplicationsForStatCard(c.title)}
                        className="h-full rounded-xl cursor-pointer transition hover:ring-2 hover:ring-[var(--brand)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
                      >
                        <CornerSummaryCard
                          isDark={isDark}
                          title={c.title.toUpperCase()}
                          countValue={c.value}
                          countSuffix="Submissions"
                          footLeft={dashboardStatAmountCaption(c.title)}
                          amountValue={c.money}
                          icon={c.icon}
                          iconSize={24}
                        />
                      </div>
                    ))}
                    {showPipelineWorkflowCards &&
                      showUnderwriterDashboard &&
                      workflowStateCards.map((c, i) => (
                        <div
                          key={`uw-workflow-${i}`}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              goToApplicationsForStatCard(c.title);
                            }
                          }}
                          onClick={() => goToApplicationsForStatCard(c.title)}
                          className="h-full rounded-xl cursor-pointer transition hover:ring-2 hover:ring-[var(--brand)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
                        >
                          <CornerSummaryCard
                            isDark={isDark}
                            title={c.title.toUpperCase()}
                            countValue={c.value}
                            countSuffix="Submissions"
                            footLeft={dashboardStatAmountCaption(c.title)}
                            amountValue={c.money}
                            icon={c.icon}
                            iconSize={24}
                          />
                        </div>
                      ))}
                  </section>
                )}

              {/* Charts: trend ~70% + pipeline funnel ~30% (matches agent / reference layout) */}
              <section className="mt-6 grid grid-cols-1 xl:grid-cols-[7fr_3fr] gap-5">
                <div
                  className={`min-h-[350px] h-full min-w-0 rounded-md border p-5 shadow-lg ${isDark
                    ? "bg-[#141517] border-[#374151]"
                    : "bg-card border-[#FDFDFD]"
                    }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold text-foreground">
                      {`${trendView.charAt(0).toUpperCase() + trendView.slice(1)}`}{" "}
                      Trend
                    </h3>
                    {/* Legend */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#76B7E2]"></div>
                        <span className="text-sm text-muted-foreground">
                          Approved
                        </span>
                      </div>
                      <div className="h-4 w-px"></div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[image:var(--brand-gradient)]"></div>
                        <span className="text-sm text-muted-foreground">
                          Funded
                        </span>
                      </div>
                    </div>
                    {/* Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="h-8 gap-2 text-sm">
                          {trendView === "monthly"
                            ? "Monthly"
                            : trendView === "weekly"
                              ? "Weekly"
                              : "Yearly"}
                          <ChevronDown className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setTrendView("weekly")}>
                          Weekly
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setTrendView("monthly")}>
                          Monthly
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setTrendView("yearly")}>
                          Yearly
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-10 h-[210px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={filteredTrendData}
                        barCategoryGap={20}
                        barGap={0}
                        margin={{
                          top: 5,
                          right: 5,
                          bottom: 5,
                          left: 30,
                        }}
                      >
                        <CartesianGrid
                          vertical={false}
                          strokeDasharray="3 3"
                          horizontal={false}
                        />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={true}
                          fontSize={12}
                          fontWeight={400}
                          stroke={isDark ? "#FFFFFF" : "#000000"}
                          tick={{ fill: isDark ? "#FFFFFF" : "#000000" }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={true}
                          stroke={isDark ? "#FFFFFF" : "#000000"}
                          fontSize={12}
                          fontWeight={400}
                          tick={{ fill: isDark ? "#FFFFFF" : "#000000" }}
                          label={{
                            value: "Amount",
                            angle: -90,
                            position: "insideLeft",
                            offset: -20,
                            style: {
                              textAnchor: "middle",
                              color: isDark ? "#FFFFFF" : "#000000",
                            },
                          }}
                          tickFormatter={(value) => formatCurrency(value as number)}
                          domain={[0, trendChartYMax]}
                          tickCount={6}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(0, 0, 0, 0.05)" }}
                          contentStyle={{
                            backgroundColor: isDark ? "#111827" : "#f1f5f9",
                            borderRadius: "6px",
                            padding: "10px",
                            border: isDark
                              ? "1px solid #374151"
                              : "1px solid #e5e7eb",
                          }}
                          content={({ payload, label }) => {
                            const firstPayload = payload?.[0] as any | undefined;
                            const dateKey = firstPayload?.payload?.dateKey as
                              | string
                              | undefined;

                            let formattedLabel: string | number | undefined = label;

                            if (trendView === "monthly" && dateKey) {
                              const d = new Date(dateKey);
                              if (!isNaN(d.getTime())) {
                                const monthShort = formatMonthShortET(d).toUpperCase();
                                const day = formatDayET(d);
                                formattedLabel = `${monthShort}-${day}`;
                              }
                            }

                            return (
                              <div className="bg-card dark:bg-card rounded-md p-2">
                                <p className="text-foreground font-medium">
                                  {formattedLabel}
                                </p>
                                {payload?.map((entry, index) => (
                                  <p key={index} className="text-sm">
                                    <span style={{ color: entry.color }}>
                                      {entry.name}:
                                    </span>{" "}
                                    <span className="text-foreground">
                                      {formatCurrency(entry.value as number)}
                                    </span>
                                  </p>
                                ))}
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="funded"
                          name="Funded"
                          fill="var(--brand)"
                          radius={[3, 3, 0, 0]}
                          barSize={12}
                        />
                        <Bar
                          dataKey="approved"
                          name="Approved"
                          fill="#76B7E2"
                          radius={[3, 3, 0, 0]}
                          barSize={12}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center mt-2 text-md text-muted-foreground">
                      {trendView === "monthly"
                        ? "Days"
                        : trendView === "weekly"
                          ? "Weeks"
                          : "Months"}{" "}
                    </div>
                  </div>
                </div>


                <ApplicationPipelineFunnelCard
                  isDark={isDark}
                  className="min-h-[350px] min-w-0"
                  stages={pipelineFunnelData}
                  conversionText={pipelineConversionText}
                  pipelineView={pipelineView}
                  onSelectView={setPipelineView}
                  dropdownButtonClassName="h-8 gap-2 rounded-md border-none bg-background font-inter text-sm text-[var(--brand)] shadow-none"
                />
              </section>

              {dashboardRecentApplicationsSection}
            </main>
          </>
        )
      }
      <ApplicationDetailsSheet
        application={dashboardViewApplication}
        open={!!dashboardViewApplication}
        onOpenChange={(open) => {
          if (!open) setDashboardViewApplication(null);
        }}
      />
    </div>
  );
}
