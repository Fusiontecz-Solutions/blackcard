import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  EyeIcon,
  LayoutGrid,
  LayoutList,
  Loader2,
  FileInput,
  CircleDollarSign,
  Landmark,
  PhoneCall,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  fetchOperationsDashboardSummary,
  fetchOperationsDashboardRecentCases,
} from "@/redux/actions/operationsDashboardActions";
import type { OperationsDashboardRecentCase } from "@/redux/slices/operationsDashboardSlice";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
} from "recharts";
import {
  formatCurrency,
  formatInt,
  formatDate as formatDateUtil,
  getMonthRangeET,
  getRecentMonthShortLabelsET,
} from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { axiosGet } from "@/redux/axios";
import { OPERATIONS_APPLICATIONS_LIST_ALL_QUERY, operationsDashboardStatusTitle } from "@/constants/operationsDashboardApplications";
import { buildOperationsPipelineApplicationsUrl } from "@/constants/dashboardApplicationsNavigation";
import ApplicationDetailsSheet from "@/components/application/ApplicationDetailsSheet";
import type { Application } from "@/types/applicationTypes";
import {
  CONTRACT_OUT_QUEUE_BADGE_CLASS,
  isContractOutQueueBadgeLabel,
} from "@/lib/contractOutQueueBadge";
import {
  CONTRACT_SIGNED_QUEUE_BADGE_CLASS,
  isContractSignedQueueBadgeLabel,
} from "@/lib/contractSignedQueueBadge";
import { CornerSummaryCard } from "@/pages/commissionPortal/CornerSummaryCard";
import { isListBlockingLoad } from "@/lib/listLoading";
import { isShellPrefetchFresh } from "@/lib/prefetchFreshness";

type SummaryCard = {
  label: string;
  value: number;
  helper?: string;
  trend?: string;
  trendTone?: "positive" | "negative" | "neutral";
  icon: React.ReactNode;
  operationsStatus?: string;
};

type CaseStatusPoint = {
  label: string;
  cases: number;
};

type PaymentTrendPoint = {
  month: string;
  collected: number;
  pending: number;
};

const caseStageStatuses = [
  { label: "AGENT", value: "Agent" },
  { label: "SCRUBBING", value: "Scrubbing" },
  { label: "UNDERWRITER", value: "Underwriter" },
  { label: "Contract Signed", value: "Contract Signed" },
  { label: "FINALS & FUNDING CALL", value: "Finals_And_Funding_Call" },
] as const;

type MonthlyTrendApiRow = {
  name?: string;
  funded?: number;
  approved?: number;
};

/** Queue pills: light mode tinted bg; dark mode light pill + dark text for contrast on dark tables. */
const getRecentCaseQueueBadgeClass = (queueLabel: string) => {
  if (isContractOutQueueBadgeLabel(queueLabel)) {
    return CONTRACT_OUT_QUEUE_BADGE_CLASS;
  }
  if (isContractSignedQueueBadgeLabel(queueLabel)) {
    return CONTRACT_SIGNED_QUEUE_BADGE_CLASS;
  }
  const n = queueLabel.toLowerCase();
  if (n === "funded" || n === "disbursement") {
    return "bg-green-100 text-green-700 dark:bg-green-200 dark:text-green-900";
  }
  if (n === "approved" || n === "contracted") {
    return "bg-sky-100 text-sky-800 dark:bg-sky-200 dark:text-sky-900";
  }
  if (n === "declined") {
    return "bg-red-100 text-red-700 dark:bg-red-200 dark:text-red-900";
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
    return "bg-sky-100 text-sky-800 dark:bg-sky-200 dark:text-sky-900";
  }
  if (n === "-" || n === "") {
    return "bg-muted/50 text-foreground";
  }
  return "bg-yellow-100 text-yellow-700 dark:bg-yellow-200 dark:text-yellow-900";
};

const formatApplicationIdDisplay = (id: unknown) => {
  if (id == null || id === "") return "—";
  const raw = String(id).trim();
  if (!raw) return "—";
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString("en-US") : raw;
};

const normalizeQueueLabel = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, " ");

/** Minimal `Application` for `ApplicationDetailsSheet` (matches `DashboardPage` preview pattern). */
function recentCaseToApplication(row: OperationsDashboardRecentCase): Application {
  const appIdNum = Number(row.applicationId);
  const bizEmail = row.email && row.email !== "-" ? row.email : undefined;
  let client: Application["client"];
  const lookup = row.clientLookupId?.trim();
  if (lookup) {
    const asNum = Number(lookup);
    const isNumericId =
      Number.isFinite(asNum) && String(Math.trunc(asNum)) === lookup;
    if (isNumericId) {
      client = {
        _id: "",
        clientId: asNum,
        business: { name: row.merchant, email: bizEmail },
      };
    } else {
      client = {
        _id: lookup,
        business: { name: row.merchant, email: bizEmail },
      };
    }
  } else {
    client = {
      _id: "",
      business: { name: row.merchant, email: bizEmail },
    };
  }
  return {
    _id: row.applicationMongoId,
    applicationId: Number.isFinite(appIdNum) ? appIdNum : undefined,
    client,
    loanAmount: row.amount,
    queue: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    priority: "Medium",
    type: "New",
    salesRepresentative: "",
  };
}

export const OperationsDashboard = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { data: loginData } = useSelector((state: RootState) => state.login);
  const userRole =
    loginData?.user?.role ||
    (typeof window !== "undefined" ? localStorage.getItem("role") : "") ||
    "";
  const isSuperAdmin = userRole === "SUPER_ADMIN" || userRole === "SUPERADMIN";
  const isOperationsUser = userRole.toUpperCase() === "OPERATIONS";
  const {
    summaryCounts,
    summaryAmounts,
    caseStageCounts,
    caseStageAmounts,
    summaryLoading,
    summaryRefreshing,
    summaryError,
    hasLoadedSummaryOnce,
    recentCases,
    recentLoading,
    recentError,
    recentInFlight,
    hasLoadedRecentOnce,
    lastSummaryFetchedAt,
    lastRecentFetchedAt,
  } = useSelector((state: RootState) => state.operationsDashboard);

  const summaryPrefetchFresh =
    hasLoadedSummaryOnce && isShellPrefetchFresh(lastSummaryFetchedAt);
  const recentPrefetchFresh =
    hasLoadedRecentOnce && isShellPrefetchFresh(lastRecentFetchedAt);

  /** First paint after login: avoid showing zeros while the summary API is still in flight. */
  const statCardsShowSkeleton =
    !hasLoadedSummaryOnce || (summaryLoading && !summaryRefreshing);
  const chartAwaitingFirstSummary =
    !hasLoadedSummaryOnce || (summaryLoading && !summaryRefreshing);
  const isMobile = useIsMobile();
  const [recentCasesViewMode, setRecentCasesViewMode] = useState<"list" | "grid">(
    "list",
  );
  const [recentCasesSearchTerm, setRecentCasesSearchTerm] = useState("");
  const [recentCasesCurrentPage, setRecentCasesCurrentPage] = useState(1);
  const [operationsPreviewApplication, setOperationsPreviewApplication] =
    useState<Application | null>(null);

  const sectionShadowClass =
    "shadow-[0px_10px_28px_0px_rgba(2,6,23,0.10)]";

  const surfaceBaseClasses =
    `rounded-md border border-border bg-card p-5 ${sectionShadowClass}`;

  const trendToneClass = (tone: SummaryCard["trendTone"]) => {
    if (tone === "positive") return "text-emerald-500";
    if (tone === "negative") return "text-red-500";
    return "text-muted-foreground";
  };

  useEffect(() => {
    setRecentCasesCurrentPage(1);
  }, [recentCasesSearchTerm, recentCasesViewMode]);

  useQuery({
    queryKey: ["operations-dashboard-summary", userRole],
    queryFn: async () => dispatch(fetchOperationsDashboardSummary()).unwrap(),
    enabled: !summaryPrefetchFresh,
    staleTime: 60_000,
    refetchOnMount: !summaryPrefetchFresh,
    refetchOnWindowFocus: false,
  });

  const { data: monthlyTrendRows = [] } = useQuery<MonthlyTrendApiRow[]>({
    queryKey: ["operations-dashboard-monthly-trend", userRole],
    queryFn: async () => {
      const { start, end } = getMonthRangeET(5);
      const qs = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      const response = await axiosGet(`/applications/stats/trend?${qs.toString()}`);
      const payload = response?.data ?? {};
      return Array.isArray(payload?.data) ? (payload.data as MonthlyTrendApiRow[]) : [];
    },
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const recentCasesQuery = useQuery({
    queryKey: ["operations-dashboard-recent-cases", userRole],
    queryFn: async () => dispatch(fetchOperationsDashboardRecentCases()).unwrap(),
    enabled: !recentPrefetchFresh,
    staleTime: 60_000,
    refetchOnMount: !recentPrefetchFresh,
    refetchOnWindowFocus: false,
  });

  const recentCasesBlockingLoad = isListBlockingLoad({
    rowCount: recentCases.length,
    loading: recentLoading,
    isFetching: recentCasesQuery.isPending || recentCasesQuery.isFetching,
    awaitingFirstLoad: !hasLoadedRecentOnce && recentInFlight,
  });

  const summaryCards: SummaryCard[] = useMemo(
    () => [
      {
        label: "Total Cases",
        value: summaryCounts.totalCases,
        helper: "Active Applications",
        icon: <LayoutList className="w-6 h-6 text-emerald-500" />,
        operationsStatus: OPERATIONS_APPLICATIONS_LIST_ALL_QUERY,
      },
      {
        label: "Contract Pending",
        value: summaryCounts.contractPending,
        helper: "Total Amount",
        icon: <Clock className="w-6 h-6 text-sky-500" />,
        operationsStatus: "Contract_Pending",
      },
      {
        label: "Contract Out",
        value: summaryCounts.contractsOut,
        helper: "Total Amount",
        icon: <FileInput className="w-6 h-6 text-emerald-500" />,
        operationsStatus: "Contract_Out",
      },
      {
        label: "Contract Signed",
        value: summaryCounts.signedContracts,
        helper: "Total Amount",
        icon: <CheckCircle2 className="w-6 h-6 text-amber-500" />,
        operationsStatus: "Contract_Signed",
      },
      {
        label: operationsDashboardStatusTitle("Finals_And_Funding_Call"),
        value:
          summaryCounts.fundingCall +
          (caseStageCounts.Final ?? 0),
        helper: "Total Amount",
        icon: <PhoneCall className="w-6 h-6 text-red-500" />,
        operationsStatus: "Finals_And_Funding_Call",
      },
      {
        label: "Disbursment",
        value: summaryCounts.disbursment,
        helper: "Total Amount",
        icon: < Landmark  className="w-6 h-6 text-emerald-500" />,
        operationsStatus: "Disbursment",
      },
      {
        label: "Funded",
        value: summaryCounts.funded,
        helper: "Total Amount",
        icon: <CircleDollarSign className="w-6 h-6 text-emerald-500" />,
        operationsStatus: "Funded",
      },
    ],
    [summaryCounts, caseStageCounts.Final],
  );

  /** Ops works post-signature only — hide Contract Pending / Contract Out queue cards. */
  const summaryCardsForRole = useMemo(() => {
    if (!isOperationsUser) return summaryCards;
    return summaryCards.filter(
      (card) =>
        card.operationsStatus !== "Contract_Out" &&
        card.operationsStatus !== "Contract_Pending",
    );
  }, [summaryCards, isOperationsUser]);

  /** Deal pipeline stages — aligned with Super Admin sidebar (DEAL PIPELINE). */
  const superAdminPipelineCards: SummaryCard[] = useMemo(
    () => [
      {
        label: "Scrubbing",
        value: caseStageCounts.Scrubbing ?? 0,
        helper: "In underwriting review",
        icon: <Search className="h-6 w-6 text-[var(--brand)]" />,
        operationsStatus: "Scrubbing",
      },
      {
        label: "Underwriter",
        value: caseStageCounts["Underwriter"] ?? 0,
        helper: "Final underwriting stage",
        icon: <ShieldCheck className="h-6 w-6 text-[#1E88E5]" />,
        operationsStatus: "Underwriter",
      },
      {
        label: "Contract Pending",
        value: caseStageCounts.Contract_Pending ?? summaryCounts.contractPending ?? 0,
        helper: "Awaiting contract generation",
        icon: <Clock className="h-6 w-6 text-sky-500" />,
        operationsStatus: "Contract_Pending",
      },
      {
        label: "Contract Sent",
        value: caseStageCounts.Contract_Sent ?? summaryCounts.contractsOut ?? 0,
        helper: "Contracts sent for signature",
        icon: <FileInput className="h-6 w-6 text-emerald-500" />,
        operationsStatus: "Contract_Sent",
      },
      {
        label: "Contract Signed",
        value: caseStageCounts.Contract_Signed ?? summaryCounts.signedContracts ?? 0,
        helper: "Contract signed applications",
        icon: <CheckCircle2 className="h-6 w-6 text-amber-500" />,
        operationsStatus: "Contract_Signed",
      },
      {
        label: operationsDashboardStatusTitle("Finals_And_Funding_Call"),
        value:
          (caseStageCounts.Final ?? 0) +
          (caseStageCounts["Funding Call"] ?? summaryCounts.fundingCall ?? 0),
        helper: "Final review and funding call queue",
        icon: <PhoneCall className="h-6 w-6 text-[#7C3AED]" />,
        operationsStatus: "Finals_And_Funding_Call",
      },
      {
        label: "Disbursement",
        value: caseStageCounts.Disbursment ?? summaryCounts.disbursment ?? 0,
        helper: "Pending disbursement",
        icon: <Landmark className="h-6 w-6 text-sky-600 dark:text-sky-400" />,
        operationsStatus: "Disbursment",
      },
      {
        label: "Funded",
        value: caseStageCounts.Funded ?? summaryCounts.funded ?? 0,
        helper: "Funded deals",
        icon: <CircleDollarSign className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />,
        operationsStatus: "Funded",
      },
    ],
    [
      caseStageCounts,
      summaryCounts.contractPending,
      summaryCounts.contractsOut,
      summaryCounts.disbursment,
      summaryCounts.funded,
      summaryCounts.fundingCall,
      summaryCounts.signedContracts,
    ],
  );

  const handleSummaryCardClick = (card: SummaryCard) => {
    if (!card.operationsStatus) return;
    navigate(buildOperationsPipelineApplicationsUrl(card.operationsStatus));
  };

  const handleNavigateRecentCase = useCallback(
    (recentCase: OperationsDashboardRecentCase) => {
      if (!recentCase.applicationId) return;
      const qs = new URLSearchParams();
      qs.set(
        "operationsStatus",
        isSuperAdmin ? "Funded" : isOperationsUser ? "Contract_Signed" : "Contracted",
      );
      navigate(
        `/application-details/${recentCase.applicationId}?${qs.toString()}`,
      );
    },
    [isOperationsUser, isSuperAdmin, navigate],
  );

  const handleOpenRecentCasePreview = useCallback(
    (recentCase: OperationsDashboardRecentCase) => {
      if (!recentCase.applicationMongoId) {
        handleNavigateRecentCase(recentCase);
        return;
      }
      // Open immediately; `ApplicationDetailsSheet` loads client via its own effect.
      setOperationsPreviewApplication(recentCaseToApplication(recentCase));
    },
    [handleNavigateRecentCase],
  );

  const getSummaryCardAmount = useCallback(
    (card: SummaryCard) => {
      switch (card.operationsStatus) {
        case "Agent":
          return caseStageAmounts.Agent ?? 0;
        case "Scrubbing":
          return caseStageAmounts.Scrubbing ?? 0;
        case "Underwriter":
          return caseStageAmounts["Underwriter"] ?? 0;
        case "Final":
          return caseStageAmounts.Final ?? 0;
        case "Finals_And_Funding_Call":
          return (
            (caseStageAmounts.Final ?? 0) +
            (summaryAmounts.fundingCall ?? caseStageAmounts["Funding Call"] ?? 0)
          );
        case "Contract_Pending":
          return summaryAmounts.contractPending ?? caseStageAmounts.Contract_Pending ?? 0;
        case "Contract_Out":
        case "Contract_Sent":
          return summaryAmounts.contractsOut ?? caseStageAmounts.Contract_Sent ?? 0;
        case "Contract_Signed":
          return summaryAmounts.signedContracts ?? caseStageAmounts.Contract_Signed ?? 0;
        case "Funding Call":
          return summaryAmounts.fundingCall ?? caseStageAmounts["Funding Call"] ?? 0;
        case "Disbursment":
          return summaryAmounts.disbursment ?? caseStageAmounts.Disbursment ?? 0;
        case "Funded":
          return summaryAmounts.funded ?? caseStageAmounts.Funded ?? 0;
        case "Declined":
          return caseStageAmounts.Declined ?? 0;
        default:
          return 0;
      }
    },
    [caseStageAmounts, summaryAmounts],
  );

  // Narrow axis gutters on phones can't fit "$1,400,000.00" — use $1.4M / $350K there.
  const formatCompactCurrency = (value: number): string => {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
    return `${sign}$${Math.round(abs)}`;
  };

  const renderSummaryCard = (card: SummaryCard) => {
    const cardAmount = formatCurrency(getSummaryCardAmount(card));
    const cardFootLabel = card.helper || "Total amount";
    return (
      <div
        key={card.label}
        role={card.operationsStatus && !statCardsShowSkeleton ? "button" : undefined}
        tabIndex={card.operationsStatus && !statCardsShowSkeleton ? 0 : -1}
        aria-busy={statCardsShowSkeleton}
        onClick={() => {
          if (!card.operationsStatus || statCardsShowSkeleton) return;
          handleSummaryCardClick(card);
        }}
        onKeyDown={(e) => {
          if (!card.operationsStatus || statCardsShowSkeleton) return;
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          handleSummaryCardClick(card);
        }}
        className={`h-full overflow-hidden rounded-xl text-left transition hover:ring-2 hover:ring-[var(--brand)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 ${sectionShadowClass} ${
          card.operationsStatus && !statCardsShowSkeleton
            ? "cursor-pointer"
            : "cursor-default"
        }`}
      >
        <CornerSummaryCard
          isDark={isDark}
          title={card.label.toUpperCase()}
          icon={card.icon}
          iconSize={22}
          isLoading={statCardsShowSkeleton}
          countValue={formatInt(card.value, { fallback: "0" })}
          countSuffix="Submissions"
          footLeft={cardFootLabel}
          amountValue={cardAmount}
          footNote={card.trend}
          footNoteClassName={trendToneClass(card.trendTone)}
        />
      </div>
    );
  };

  const chartCaseStatusData: CaseStatusPoint[] = useMemo(
    () =>
      caseStageStatuses.map((status) => {
        const useSignedForContractBar =
          (isSuperAdmin || isOperationsUser) &&
          status.value === "Contract Signed";
        const mergedFinalsAndFundingCall =
          status.value === "Finals_And_Funding_Call"
            ? (caseStageCounts.Final ?? 0) +
              (caseStageCounts["Funding Call"] ?? 0)
            : null;
        return {
          label: status.label,
          cases: useSignedForContractBar
            ? summaryCounts.signedContracts ?? 0
            : mergedFinalsAndFundingCall != null
              ? mergedFinalsAndFundingCall
              : (caseStageCounts[status.value] ?? 0),
        };
      }),
    [
      caseStageCounts,
      isOperationsUser,
      isSuperAdmin,
      summaryCounts.signedContracts,
    ],
  );
  const chartCasesTotal = useMemo(
    () => chartCaseStatusData.reduce((acc, p) => acc + p.cases, 0),
    [chartCaseStatusData],
  );

  const paymentTrend = useMemo<PaymentTrendPoint[]>(() => {
    const labels = getRecentMonthShortLabelsET(6);
    const byName = new Map(
      monthlyTrendRows.map((row) => [String(row.name ?? "").trim(), row]),
    );
    return labels.map((month) => {
      const key = month.trim();
      const row = byName.get(key);
      return {
        month,
        collected: row?.funded ?? 0,
        pending: row?.approved ?? 0,
      };
    });
  }, [monthlyTrendRows]);

  const recentCasesForRole = useMemo(() => {
    if (isSuperAdmin) {
      return recentCases.filter((item) => {
        const normalizedStatus = normalizeQueueLabel(item.status);
        return (
          normalizedStatus === "funded" || normalizedStatus === "disbursement"
        );
      });
    }
    if (isOperationsUser) {
      // Recent-cases API is already scoped to Contract_Signed for OPERATIONS.
      return recentCases;
    }
    return recentCases;
  }, [isOperationsUser, isSuperAdmin, recentCases]);

  const filteredRecentCases = useMemo(() => {
    if (!recentCasesSearchTerm.trim()) return recentCasesForRole;
    const term = recentCasesSearchTerm.toLowerCase();
    return recentCasesForRole.filter(
      (item) =>
        item.id.toLowerCase().includes(term) ||
        item.applicationId.toLowerCase().includes(term) ||
        item.merchant.toLowerCase().includes(term) ||
        item.status.toLowerCase().includes(term) ||
        (item.email ?? "").toLowerCase().includes(term),
    );
  }, [recentCasesForRole, recentCasesSearchTerm]);

  const recentCasesPageSize = recentCasesViewMode === "list" ? 5 : 6;
  const totalRecentCasesPages = Math.max(
    1,
    Math.ceil(filteredRecentCases.length / recentCasesPageSize),
  );
  const safeRecentCasesCurrentPage = Math.min(
    recentCasesCurrentPage,
    totalRecentCasesPages,
  );
  const recentCasesStartIndex =
    (safeRecentCasesCurrentPage - 1) * recentCasesPageSize;
  const paginatedRecentCases = filteredRecentCases.slice(
    recentCasesStartIndex,
    recentCasesStartIndex + recentCasesPageSize,
  );

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {/* <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Operations Dashboard
          </h1> */}
          <p className="mt-1 text-xl font-semibold text-muted-foreground max-w-3xl">
            Track operational performance across cases, payments, risk in a single view.
          </p>
        </div>
      </header>

      {summaryError ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          {summaryError}
        </p>
      ) : null}
      {summaryRefreshing ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          Updating totals…
        </p>
      ) : null}

      {/* Summary cards — skeleton on first load; stale values kept while refreshing */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {(isSuperAdmin ? superAdminPipelineCards : summaryCardsForRole).map((card) =>
          renderSummaryCard(card),
        )}
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1  xl:grid-cols-[2fr_1.4fr] gap-5">
        {/* Cases by stage */}
        <div className={surfaceBaseClasses}>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-semibold text-foreground">
                Cases by Status
              </h3>
            </div>
          </div>

          <div className="h-[260px] mt-4">
            {chartAwaitingFirstSummary ? (
              <div
                className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-foreground"
                aria-live="polite"
              >
                <Loader2 className="h-9 w-9 shrink-0 animate-spin text-primary" aria-hidden />
                <span>Loading case breakdown…</span>
              </div>
            ) : chartCasesTotal === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                No applications in these stages yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartCaseStatusData}
                  barSize={isMobile ? 16 : 22}
                  margin={{ top: 10, right: 12, left: 8, bottom: isMobile ? 4 : 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={isDark ? "#1f2933" : "#e5e7eb"}
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    minTickGap={8}
                    // Angled, truncated ticks on phones — full horizontal labels don't fit.
                    angle={isMobile ? -40 : 0}
                    textAnchor={isMobile ? "end" : "middle"}
                    height={isMobile ? 70 : 30}
                    tickFormatter={(value) => {
                      const label = String(value);
                      if (!isMobile) return label;
                      return label.length > 14 ? `${label.slice(0, 13)}…` : label;
                    }}
                    tick={{ fontSize: isMobile ? 10 : 11, fill: isDark ? "#e5e7eb" : "#4b5563" }}
                    label={{
                      value: "",
                      position: "insideBottom",
                      offset: -5,
                      fill: isDark ? "#e5e7eb" : "#6b7280",
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: isDark ? "#e5e7eb" : "#4b5563" }}
                    tickFormatter={(value) => formatInt(value as number)}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    contentStyle={{
                      backgroundColor: isDark ? "#111827" : "#f9fafb",
                      borderRadius: 8,
                      border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                      padding: "8px 10px",
                    }}
                    formatter={(value) => [`${formatInt(value as number)} cases`, "Cases"]}
                  />
                  <Bar
                    dataKey="cases"
                    radius={[4, 4, 0, 0]}
                    fill="var(--brand)"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment trend */}
        <div className={surfaceBaseClasses}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground">
                Payment Performance
              </h3>
              <p className="text-xs text-muted-foreground">
                Collected vs pending payments across the last 6 months.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
              <div className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[image:var(--brand-gradient)]" />
                <span>Collected</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#F97316]" />
                <span>Pending</span>
              </div>
            </div>
          </div>

          <div className="h-[260px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={paymentTrend}
                margin={{ top: 10, right: 12, left: 0, bottom: 8 }}
              >
                <defs>
                  <linearGradient id="collectedArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="pendingArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F97316" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? "#1f2933" : "#e5e7eb"}
                />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: isDark ? "#e5e7eb" : "#4b5563" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={isMobile ? 46 : 60}
                  tick={{ fontSize: isMobile ? 10 : 11, fill: isDark ? "#e5e7eb" : "#4b5563" }}
                  tickFormatter={(value) =>
                    isMobile
                      ? formatCompactCurrency(value as number)
                      : formatCurrency(value as number)
                  }
                />
                <Tooltip
                  cursor={{ stroke: "rgba(15,23,42,0.1)", strokeWidth: 1 }}
                  contentStyle={{
                    backgroundColor: isDark ? "#111827" : "#f9fafb",
                    borderRadius: 8,
                    border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                    padding: "8px 10px",
                  }}
                  formatter={(value, name) => [
                    formatCurrency(Number(value ?? 0)),
                    name === "collected" ? "Collected" : "Pending",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="collected"
                  name="collected"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  fill="url(#collectedArea)"
                  dot={{ strokeWidth: 1, r: 3 }}
                />
                <Area
                  type="monotone"
                  dataKey="pending"
                  name="pending"
                  stroke="#F97316"
                  strokeWidth={2}
                  fill="url(#pendingArea)"
                  dot={{ strokeWidth: 1, r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Applications — same columns & chrome as `DashboardPage` recent applications */}
      <section>
        <div
          className={`rounded-[5px] border ${sectionShadowClass} ${
            isDark ? "bg-[#141517] border-[#374151]" : "bg-card border-[#FDFDFD]"
          }`}
        >
          <div
            className={`px-4 md:px-5 py-2 rounded-t-[5px] flex flex-wrap items-center justify-between gap-3 ${
              isDark ? "bg-[#2A2B2F]" : "bg-[#F9FAFD]"
            }`}
          >
            <div className="min-w-0">
              <span className="font-semibold text-[1rem] text-foreground font-roboto">
                {isSuperAdmin
                  ? "Latest Funded Deals"
                  : isOperationsUser
                    ? "Contract Signed Applications"
                    : "Recent Applications"}
              </span>
              <p className="mt-0.5 text-xs text-muted-foreground hidden sm:block">
                {isSuperAdmin
                  ? "Most recently funded or disbursed deals."
                  : isOperationsUser
                    ? "Deals with a fully signed contract — ready for Final, funding call, and disbursement."
                    : "Latest contracted applications."}
              </p>
              {recentError ? (
                <p className="mt-1 text-sm text-destructive" role="alert">
                  {recentError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 ml-auto">
              <div className="relative w-full min-w-[200px] sm:w-[280px]">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={16}
                />
                <input
                  value={recentCasesSearchTerm}
                  onChange={(e) => setRecentCasesSearchTerm(e.target.value)}
                  placeholder={
                    isSuperAdmin
                      ? "Search funded deals..."
                      : isOperationsUser
                        ? "Search contract signed..."
                        : "Search contracted..."
                  }
                  className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
                />
              </div>
              <div
                className="flex items-center gap-2 shrink-0"
                role="group"
                aria-label="Applications display layout"
              >
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  View
                </span>
                <div className="flex rounded-md border border-border overflow-hidden bg-card">
                  <Button
                    type="button"
                    variant={recentCasesViewMode === "list" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-10 sm:h-9 rounded-none px-3 gap-1.5 shadow-none"
                    onClick={() => setRecentCasesViewMode("list")}
                    aria-pressed={recentCasesViewMode === "list"}
                    title="List view"
                  >
                    <LayoutList className="size-4 shrink-0" />
                    <span className="text-xs font-medium">List</span>
                  </Button>
                  <Button
                    type="button"
                    variant={recentCasesViewMode === "grid" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-10 sm:h-9 rounded-none px-3 gap-1.5 border-l border-border shadow-none"
                    onClick={() => setRecentCasesViewMode("grid")}
                    aria-pressed={recentCasesViewMode === "grid"}
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
              {recentCasesBlockingLoad ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary shrink-0" />
                  <span className="ml-2 text-muted-foreground">
                    Loading applications...
                  </span>
                </div>
              ) : filteredRecentCases.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {isSuperAdmin
                    ? "No funded deals found."
                    : isOperationsUser
                      ? "No contract signed applications found."
                      : "No contracted applications found."}
                </div>
              ) : recentCasesViewMode === "list" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-6">
                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                          ID
                        </span>
                      </TableHead>
                      <TableHead className="px-6">
                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                          Business name
                        </span>
                      </TableHead>
                      <TableHead className="px-6">
                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                          Email
                        </span>
                      </TableHead>
                      <TableHead className="px-6">
                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                          Loan amount
                        </span>
                      </TableHead>
                      <TableHead className="px-6">
                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                          Current state
                        </span>
                      </TableHead>
                      <TableHead className="px-6">
                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                          Created at
                        </span>
                      </TableHead>
                      <TableHead className="px-6">
                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                          Last modified date
                        </span>
                      </TableHead>
                      <TableHead className="px-6 text-left">
                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                          View
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRecentCases.map((item, idx) => {
                      const queueLabel = String(item.status || "").trim() || "-";
                      const createdStr = formatDateUtil(item.createdAt, "-");
                      const updatedStr = formatDateUtil(item.updatedAt, "-");
                      const hasLoan =
                        item.amount != null &&
                        Number.isFinite(Number(item.amount)) &&
                        Number(item.amount) > 0;

                      return (
                        <TableRow
                          key={item.id}
                          tabIndex={0}
                          className={`cursor-pointer hover:bg-accent ${
                            idx % 2 ? "bg-muted/50" : ""
                          }`}
                          onClick={(e) => {
                            const t = e.target;
                            if (!(t instanceof Element)) return;
                            if (t.closest("button, input, a, [role='button']"))
                              return;
                            handleNavigateRecentCase(item);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            handleNavigateRecentCase(item);
                          }}
                        >
                          <TableCell className="px-6 text-[0.85rem] text-[#4B5563] dark:text-foreground">
                            <span className="font-semibold text-foreground">
                              {item.applicationId
                                ? formatApplicationIdDisplay(item.applicationId)
                                : "-"}
                            </span>
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-[#4B5563] dark:text-foreground">
                            {item.merchant}
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-[#4B5563] dark:text-foreground">
                            {item.email && item.email !== "-" ? item.email : "-"}
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-[#4B5563] dark:text-foreground">
                            {hasLoan ? (
                              <span className="text-foreground">
                                {formatCurrency(Number(item.amount))}
                              </span>
                            ) : (
                              <span className="text-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-[#4B5563] dark:text-foreground">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getRecentCaseQueueBadgeClass(
                                queueLabel,
                              )}`}
                            >
                              {queueLabel}
                            </span>
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-[#4B5563] dark:text-foreground">
                            {createdStr}
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-[#4B5563] dark:text-foreground">
                            {updatedStr}
                          </TableCell>
                          <TableCell className="px-6 text-[0.85rem] text-left text-[#4B5563] dark:text-foreground">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleOpenRecentCasePreview(item);
                              }}
                              className="inline-flex items-center justify-center text-[var(--brand)] hover:text-[var(--brand-accent-strong)] dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
                              aria-label="View application details"
                            >
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current">
                                <EyeIcon className="h-4 w-4 cursor-pointer" />
                              </span>
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-3 md:p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {paginatedRecentCases.map((item) => {
                      const queueLabel =
                        String(item.status || "").trim() || "-";
                      const hasLoan =
                        item.amount != null &&
                        Number.isFinite(Number(item.amount)) &&
                        Number(item.amount) > 0;

                      return (
                        <div
                          key={item.id}
                          role="group"
                          tabIndex={0}
                          aria-label={`Open application ${item.applicationId || item.id}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleNavigateRecentCase(item);
                            }
                          }}
                          onClick={() => handleNavigateRecentCase(item)}
                          className={`rounded-lg border shadow-sm flex flex-col gap-3 p-4 text-left transition hover:ring-2 hover:ring-[var(--brand)]/20 cursor-pointer ${
                            isDark
                              ? "bg-[#1a1b1e] border-[#374151]"
                              : "bg-card border-[#F0F0F0]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground truncate">
                                {item.merchant}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                ID{" "}
                                <span className="text-sky-600 font-medium">
                                  {item.applicationId
                                    ? formatApplicationIdDisplay(item.applicationId)
                                    : "—"}
                                </span>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleOpenRecentCasePreview(item);
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
                              title={
                                item.email && item.email !== "-"
                                  ? item.email
                                  : undefined
                              }
                            >
                              {item.email && item.email !== "-"
                                ? item.email
                                : "—"}
                            </p>
                            <p>
                              <span className="text-foreground/80">Loan: </span>
                              {hasLoan
                                ? formatCurrency(Number(item.amount))
                                : "—"}
                            </p>
                            <p>
                              <span className="text-foreground/80">Created: </span>
                              {formatDateUtil(item.createdAt, "—")}
                            </p>
                          </div>
                          <div className="pt-1 border-t border-border/60">
                            <span
                              className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getRecentCaseQueueBadgeClass(
                                queueLabel,
                              )}`}
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
                  {filteredRecentCases.length === 0
                    ? "Showing 0 to 0 of 0 entries"
                    : `Showing ${recentCasesStartIndex + 1} to ${Math.min(
                        recentCasesStartIndex + recentCasesPageSize,
                        filteredRecentCases.length,
                      )} of ${filteredRecentCases.length} entries`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={safeRecentCasesCurrentPage <= 1}
                  onClick={() => setRecentCasesCurrentPage(1)}
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={safeRecentCasesCurrentPage <= 1}
                  onClick={() =>
                    setRecentCasesCurrentPage((p) => Math.max(1, p - 1))
                  }
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="default"
                  size="icon"
                  className="h-8 w-8 bg-[#2F80ED] text-white hover:bg-[#2F80ED]/90"
                  aria-current="page"
                >
                  {safeRecentCasesCurrentPage}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={
                    safeRecentCasesCurrentPage >= totalRecentCasesPages
                  }
                  onClick={() =>
                    setRecentCasesCurrentPage((p) =>
                      Math.min(totalRecentCasesPages, p + 1),
                    )
                  }
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={
                    safeRecentCasesCurrentPage >= totalRecentCasesPages
                  }
                  onClick={() => setRecentCasesCurrentPage(totalRecentCasesPages)}
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ApplicationDetailsSheet
        application={operationsPreviewApplication}
        open={!!operationsPreviewApplication}
        onOpenChange={(open) => {
          if (!open) setOperationsPreviewApplication(null);
        }}
      />
    </div>
  );
};

export default OperationsDashboard;