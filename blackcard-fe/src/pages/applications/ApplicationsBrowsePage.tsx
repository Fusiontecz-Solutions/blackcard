import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Filter,
  ChevronDown,
  Search,
  Trash2,
  EyeIcon,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { deleteApplication } from "@/redux/actions/applicationActions";
import { resetDeleteApplication } from "@/redux/slices/applicationSlice";
import { toast } from "react-toastify";
import type { Application, GetApplicationsParams } from "@/types/applicationTypes";
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type PaginationState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTableContent, DataTablePagination } from "@/components/DataTable";
import { useTheme } from "@/context/ThemeContext";
import {
  CONTRACT_OUT_QUEUE_BADGE_CLASS,
  isContractOutQueueBadgeLabel,
} from "@/lib/contractOutQueueBadge";
import {
  CONTRACT_SIGNED_QUEUE_BADGE_CLASS,
  isContractSignedQueueBadgeLabel,
} from "@/lib/contractSignedQueueBadge";
import { formatCurrency, formatDate as formatDateUtil } from "@/lib/utils";
import { getClientByClientId } from "@/redux/actions/clientActions";
import ApplicationDetailsSheet from "@/components/application/ApplicationDetailsSheet";
import {
  buildApplicationsListParams,
  DEFAULT_APPLICATIONS_PAGE_SIZE,
} from "@/lib/applicationsListParams";
import DuplicateApplicationBadge from "@/components/application/DuplicateApplicationBadge";
import { getApplicationBusinessDisplayName } from "@/lib/applicationBusinessDisplayName";
import { formatIsoDisplayLabel } from "@/lib/isoDisplayLabel";
import { formatDealPipelineCurrentStateLabel } from "@/lib/dealPipelineCurrentState";
import { resolveApplicationDisplayLoanAmount } from "@/lib/applicationLoanAmount";
import { useApplicationsListQuery } from "@/hooks/useApplicationsListQuery";

const QUEUE_OPTIONS = [
  { label: "Agent", value: "Agent" },
  { label: "Scrubbing", value: "Scrubbing" },
  { label: "Underwriter", value: "Underwriter" },
  { label: "Contract Out", value: "Contract Out" },
  { label: "Contract Signed", value: "Contract_Signed" },
  { label: "Final", value: "Final" },
  { label: "Funding call", value: "Funding Call" },
  { label: "Disbursement", value: "Disbursment" },
  { label: "Funded", value: "Funded" },
] as const;

const STATS_BUCKET_TITLE_MAP: Record<string, string> = {
  funded: "Funded",
  approved: "Approved",
  rejected: "Rejected",
  workflow_pending: "Pending",
  workflow_in_progress: "In Progress",
  underwriting: "Underwriting",
  pending_pipeline: "Pending",
  in_process: "In Process",
};

/**
 * Table-only applications list (filter + search + grid + pagination).
 * Used when opening a dashboard stat card; query: statsBucket, currentQueue,
 * underwriterClaim (SCRUBBING pool), viewOnly.
 */
export default function ApplicationsBrowsePage() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [viewOnlyMode, setViewOnlyMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [statsBucketFilter, setStatsBucketFilter] = useState("");
  const [underwriterClaimFilter, setUnderwriterClaimFilter] = useState<
    "" | "unclaimed" | "claimed" | "mine"
  >("");
  const [isListFilterInitialized, setIsListFilterInitialized] = useState(false);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_APPLICATIONS_PAGE_SIZE,
  });
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [viewApplication, setViewApplication] = useState<Application | null>(null);
  const isBulkDeleteRef = useRef(false);

  const {
    loading,
    isRefreshing,
    data: applications,
    pagination: apiPagination,
    error,
  } = useSelector((state: RootState) => state.applications);

  const {
    loading: deleteLoading,
    success: deleteSuccess,
    error: deleteError,
  } = useSelector((state: RootState) => state.deleteApplication);

  const getApplicationClientId = useCallback((application: Application): string | null => {
    const client = application?.client;
    if (!client) return null;
    if (typeof client === "string") return client;
    if (client.clientId != null) return String(client.clientId);
    if (client._id) return String(client._id);
    return null;
  }, []);

  const handleOpenApplicationDetails = useCallback(
    async (application: Application) => {
      const clientId = getApplicationClientId(application);
      if (clientId) {
        try {
          await dispatch(getClientByClientId(clientId)).unwrap();
        } catch {
          /* sheet still opens */
        }
      }
      setViewApplication(application);
    },
    [dispatch, getApplicationClientId],
  );

  const handleNavigateToApplication = useCallback(
    (app: Application) => {
      const id =
        app.applicationId != null ? String(app.applicationId) : String(app._id ?? "");
      if (!id) return;
      const qs = new URLSearchParams();
      if (viewOnlyMode) qs.set("viewOnly", "1");
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      navigate(`/application-details/${id}${suffix}`);
    },
    [navigate, viewOnlyMode],
  );

  const formatDate = useCallback((dateString?: string) => {
    return formatDateUtil(dateString ?? "", "-");
  }, []);

  const getClientEmail = useCallback((client: Application["client"]) => {
    if (typeof client === "string") return "-";
    return client?.business?.email || client?.owner?.email || "-";
  }, []);

  const getApplicationIsoLabel = useCallback((application: Application): string => {
    return formatIsoDisplayLabel(application.iso);
  }, []);

  /** Same pipeline label rules as `Applications.tsx`. */
  const getApplicationQueueLabel = useCallback((application: Application): string => {
    const stRaw = application.currentState ?? application.state;
    const stStr = String(stRaw ?? "").trim();
    const stateCompact = stStr.replace(/[\s_-]+/g, "").toLowerCase();
    if (stateCompact === "underwriterapproved") {
      return "Underwriter-Approved";
    }

    const q = application.currentQueue || application.queue;
    if (q == null || String(q).trim() === "") return "-";
    const raw = String(q).trim();

    const pipelineLabel = formatDealPipelineCurrentStateLabel({
      currentQueue: raw,
      queue: raw,
      currentState: application.currentState ?? application.state,
      state: application.currentState ?? application.state,
    });
    if (pipelineLabel !== "—") return pipelineLabel;

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

  const getApplicationQueueBadgeClass = useCallback((queueLabel: string) => {
    if (isContractOutQueueBadgeLabel(queueLabel)) {
      return CONTRACT_OUT_QUEUE_BADGE_CLASS;
    }
    if (isContractSignedQueueBadgeLabel(queueLabel)) {
      return CONTRACT_SIGNED_QUEUE_BADGE_CLASS;
    }
    const n = queueLabel.toLowerCase();
    if (n === "final scrubbing-approved") {
      return "border border-sky-200 bg-gradient-to-b from-sky-100 to-white text-sky-800 dark:from-sky-950 dark:to-transparent dark:text-sky-200";
    }
    if (n === "funded" || n === "disbursement") {
      return "border border-green-200 bg-gradient-to-b from-green-100 to-white text-green-700 dark:from-green-950 dark:to-transparent dark:text-green-200";
    }
    if (n === "approved" || n === "contracted") {
      return "border border-blue-200 bg-gradient-to-b from-blue-100 to-white text-blue-700 dark:from-blue-950 dark:to-transparent dark:text-blue-200";
    }
    if (n === "declined") {
      return "border border-red-200 bg-gradient-to-b from-red-100 to-white text-red-700 dark:from-red-950 dark:to-transparent dark:text-red-200";
    }
    if (
      n === "underwriting" ||
      n === "scrubbing" ||
      n === "underwriter" ||
      n === "review" ||
      n === "final review" ||
      n === "final scrubbing" ||
      n === "final" ||
      n === "funding call"
    ) {
      return "border border-sky-200 bg-gradient-to-b from-sky-100 to-white text-sky-800 dark:from-sky-950 dark:to-transparent dark:text-sky-200";
    }
    if (n === "-") {
      return "bg-muted/50 text-foreground";
    }
    return "border border-yellow-200 bg-gradient-to-b from-yellow-100 to-white text-yellow-700 dark:from-yellow-950 dark:to-transparent dark:text-yellow-200";
  }, []);

  const columns: ColumnDef<Application>[] = useMemo(() => {
    const selectColumn: ColumnDef<Application> = {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          className="size-4 rounded border-border text-blue-600 cursor-pointer"
          checked={table.getIsAllPageRowsSelected()}
          ref={(input) => {
            if (input) input.indeterminate = table.getIsSomePageRowsSelected();
          }}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="size-4 rounded border-gray-300 text-blue-600 cursor-pointer"
          checked={row.getIsSelected()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    };

    const dataColumns: ColumnDef<Application>[] = [
      {
        accessorKey: "applicationId",
        header: () => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">ID</span>
          </div>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.applicationId || "-"}
          </span>
        ),
      },
      {
        id: "businessName",
        accessorFn: (row) => getApplicationBusinessDisplayName(row),
        header: () => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">BUSINESS NAME</span>
          </div>
        ),
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2 text-foreground">
            <span className="min-w-0 truncate">
              {getApplicationBusinessDisplayName(row.original)}
            </span>
            <DuplicateApplicationBadge isDuplicate={row.original.isDuplicate} />
          </span>
        ),
      },
      {
        id: "email",
        accessorFn: (row) => getClientEmail(row.client),
        header: () => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">EMAIL</span>
          </div>
        ),
        cell: ({ row }) => (
          <span className="text-foreground">{getClientEmail(row.original.client)}</span>
        ),
      },
      {
        id: "iso",
        accessorFn: (row) => getApplicationIsoLabel(row),
        header: () => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">ISO</span>
          </div>
        ),
        cell: ({ row }) => (
          <span className="text-foreground">{getApplicationIsoLabel(row.original)}</span>
        ),
      },
      {
        id: "loanAmount",
        accessorFn: (row) => resolveApplicationDisplayLoanAmount(row),
        header: () => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">Loan Amount</span>
          </div>
        ),
        cell: ({ row }) => {
          const loanAmount = resolveApplicationDisplayLoanAmount(row.original);
          if (loanAmount == null) return <span className="text-foreground">-</span>;
          return (
            <span className="text-foreground">
              {formatCurrency(loanAmount)}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: () => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">Current State</span>
          </div>
        ),
        cell: ({ row }) => {
          const queueLabel = getApplicationQueueLabel(row.original);
          return (
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${getApplicationQueueBadgeClass(queueLabel)}`}
            >
              {queueLabel}
            </span>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: () => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">CREATED AT</span>
          </div>
        ),
        cell: ({ row }) => (
          <span className="text-foreground">{formatDate(row.original.createdAt)}</span>
        ),
      },
      {
        accessorKey: "lastModifiedAt",
        header: () => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">Last Modified Date</span>
          </div>
        ),
        cell: ({ row }) => (
          <span className="text-foreground">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "view",
        header: () => <span className="font-medium text-foreground">VIEW</span>,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleOpenApplicationDetails(row.original);
            }}
            className="flex items-center justify-center text-[var(--brand)] hover:text-[var(--brand-accent-strong)] cursor-pointer"
            aria-label="Preview application in drawer"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs font-bold">
              <EyeIcon className="h-4 w-4" />
            </span>
          </button>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ];

    return viewOnlyMode ? dataColumns : [selectColumn, ...dataColumns];
  }, [
    formatDate,
    getApplicationQueueBadgeClass,
    getApplicationIsoLabel,
    getApplicationBusinessDisplayName,
    getClientEmail,
    getApplicationQueueLabel,
    handleOpenApplicationDetails,
    viewOnlyMode,
  ]);

  const tableRows = applications ?? [];
  const totalItems = apiPagination?.total ?? tableRows.length;
  const pageCount =
    apiPagination?.totalPages ??
    Math.max(1, Math.ceil(totalItems / pagination.pageSize) || 1);

  const table = useReactTable({
    data: tableRows,
    columns,
    pageCount,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    manualPagination: true,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
    getRowId: (row) => {
      const rid = row._id ?? (row as { id?: string }).id;
      if (rid) return String(rid);
      return row.applicationId != null
        ? `missing-uuid-app-${row.applicationId}`
        : "missing-uuid-row";
    },
  });

  useEffect(() => {
    setSelectedApplicationIds(Object.keys(rowSelection));
  }, [rowSelection]);

  const listFetchParams = useMemo((): GetApplicationsParams => {
    const base = buildApplicationsListParams({
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
      searchTerm: debouncedSearchTerm,
      dashboardStateFilter: "",
      statusFilter: statsBucketFilter ? "all" : statusFilter,
    });
    const params: GetApplicationsParams = {
      ...base,
      lite: true,
      skipListCache: true,
      skipListCacheRead: true,
      clearListOnFetch: true,
    };
    if (underwriterClaimFilter) {
      params.underwriterClaim = underwriterClaimFilter;
    }
    if (statsBucketFilter) {
      params.statsBucket = statsBucketFilter;
      delete params.currentQueue;
      delete params.operationsStatus;
    }
    return params;
  }, [
    statusFilter,
    statsBucketFilter,
    underwriterClaimFilter,
    pagination.pageIndex,
    pagination.pageSize,
    debouncedSearchTerm,
  ]);

  const {
    refetch: refetchApplicationsList,
    isPending: applicationsListQueryPending,
  } = useApplicationsListQuery(listFetchParams, {
    enabled: isListFilterInitialized,
  });

  const fetchApplications = useCallback(async () => {
    await refetchApplicationsList();
  }, [refetchApplicationsList]);

  useLayoutEffect(() => {
    setIsListFilterInitialized(false);
    const query = new URLSearchParams(location.search);
    setViewOnlyMode(query.get("viewOnly") === "1");
    const statsBucketRaw = query.get("statsBucket")?.trim() ?? "";
    const currentQueueRaw = query.get("currentQueue")?.trim() ?? "";
    const uwRaw = query.get("underwriterClaim")?.trim().toLowerCase() ?? "";
    setUnderwriterClaimFilter(
      uwRaw === "unclaimed" || uwRaw === "claimed" || uwRaw === "mine" ? uwRaw : "",
    );

    if (statsBucketRaw) {
      setStatsBucketFilter(statsBucketRaw);
      setStatusFilter("all");
    } else {
      setStatsBucketFilter("");
      setStatusFilter(currentQueueRaw ? currentQueueRaw : "all");
    }

    if (pagination.pageIndex !== 0) {
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    }
  }, [dispatch, location.search]);

  /** Enable list fetch once pagination is on page 1 (after URL-driven reset above). */
  useEffect(() => {
    if (pagination.pageIndex !== 0) return;
    setIsListFilterInitialized(true);
  }, [pagination.pageIndex]);

  const handleBulkDelete = useCallback(async () => {
    const idsToDelete = selectedApplicationIds.filter(
      (id) => typeof id === "string" && id.length > 0 && id !== "undefined",
    );
    if (idsToDelete.length === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${idsToDelete.length} selected application(s)?`,
    );
    if (!confirmed) return;

    isBulkDeleteRef.current = true;
    try {
      await Promise.all(idsToDelete.map((id) => dispatch(deleteApplication(id)).unwrap()));
      toast.success(
        idsToDelete.length === 1
          ? "Application deleted successfully!"
          : `${idsToDelete.length} applications deleted successfully!`,
      );
      dispatch(resetDeleteApplication());
      setRowSelection({});
      if (
        viewApplication &&
        idsToDelete.includes(
          String(viewApplication._id ?? (viewApplication as { id?: string }).id ?? ""),
        )
      ) {
        setViewApplication(null);
      }
      fetchApplications();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to delete some applications";
      toast.error(message);
      dispatch(resetDeleteApplication());
      fetchApplications();
      setRowSelection({});
    } finally {
      isBulkDeleteRef.current = false;
    }
  }, [selectedApplicationIds, dispatch, fetchApplications, viewApplication]);

  useEffect(() => {
    if (deleteSuccess) {
      if (isBulkDeleteRef.current) {
        dispatch(resetDeleteApplication());
        return;
      }
      toast.success("Application deleted successfully!");
      dispatch(resetDeleteApplication());
      fetchApplications();
    }
    if (deleteError) {
      toast.error(deleteError);
      dispatch(resetDeleteApplication());
    }
  }, [deleteSuccess, deleteError, dispatch, fetchApplications]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 400);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
  }, [debouncedSearchTerm, statusFilter, statsBucketFilter, underwriterClaimFilter]);

  const pipelineLabel = useMemo(() => {
    if (statusFilter === "all") return "All";
    return QUEUE_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter;
  }, [statusFilter]);

  const isDashboardStatCardDrilldown = useMemo(() => {
    const query = new URLSearchParams(location.search);
    const statsBucketRaw = query.get("statsBucket")?.trim() ?? "";
    const currentQueueRaw = query.get("currentQueue")?.trim() ?? "";
    return Boolean(statsBucketRaw || currentQueueRaw);
  }, [location.search]);

  const pageHeading = useMemo(() => {
    if (statsBucketFilter) {
      const key = statsBucketFilter.trim().toLowerCase();
      return STATS_BUCKET_TITLE_MAP[key] ?? "Submissions";
    }
    if (statusFilter !== "all") {
      return pipelineLabel;
    }
    return "All";
  }, [statsBucketFilter, statusFilter, pipelineLabel]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const listHeaderLoading =
    !isListFilterInitialized ||
    loading ||
    isRefreshing ||
    applicationsListQueryPending;

  const listBlockingLoad =
    (applications?.length ?? 0) === 0 && listHeaderLoading;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div
        className={`rounded-xl border px-4 py-3 md:px-5 md:py-4 shadow-sm ${isDark ? "bg-[#141517] border-[#374151]" : "bg-card border-[#EEF2F7]"
          }`}
      >
        {/* <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--brand)]">Submissions</span>
        </div> */}
        <h1 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight text-foreground">
          {pageHeading} Submissions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage submissions for this selected status.
        </p>
      </div>

      <div className="mt-4 flex flex-col md:flex-row items-stretch md:items-center gap-3 justify-between">
        <div className="flex items-center gap-3 w-full md:max-w-[520px]">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 cursor-pointer shrink-0 bg-card text-muted-foreground"
            onClick={handleBack}
            aria-label="Go back"
          >
            <ArrowLeft className="size-4" />
          </Button>
          {!isDashboardStatCardDrilldown && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 gap-2 text-muted-foreground bg-card"
                >
                  <Filter className="size-4" />
                  <span>{pipelineLabel}</span>
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => {
                    setStatsBucketFilter("");
                    setStatusFilter("all");
                    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                  }}
                >
                  All
                </DropdownMenuItem>
                {QUEUE_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => {
                      setStatsBucketFilter("");
                      setStatusFilter(opt.value);
                      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                    }}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, ISO..."
              className="pl-9 h-10 bg-card"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      <div
        className={`mt-5 rounded-[5px] border shadow-[0px_4px_20px_0px_#00000005] ${isDark ? "bg-[#141517] border-[#374151]" : "bg-card border-[#FDFDFD]"
          }`}
      >
        <div
          className={`px-4 md:px-5 py-2 rounded-t-[5px] flex items-center justify-between gap-6 ${isDark ? "bg-[#2A2B2F]" : "bg-[#F9FAFD]"
            }`}
        >
          <span className="font-semibold text-[1rem] text-foreground font-roboto inline-flex items-center gap-2">
            Applications
            {listHeaderLoading ? (
              <Loader2
                className="size-4 animate-spin text-muted-foreground shrink-0"
                aria-label="Loading applications"
              />
            ) : null}
          </span>
          {!viewOnlyMode && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1 cursor-pointer text-xs shrink-0"
              disabled={selectedApplicationIds.length === 0 || deleteLoading}
              onClick={handleBulkDelete}
            >
              <Trash2 className="size-3" />
              Delete
            </Button>
          )}
        </div>
        <div
          className={`p-1 transition-opacity duration-300 ${
            listHeaderLoading && (applications?.length ?? 0) > 0
              ? "opacity-85"
              : "opacity-100"
          }`}
        >
          <div className="overflow-x-auto overflow-y-auto rounded-xl [scrollbar-gutter:stable] min-h-[min(32rem,65vh)] max-lg:min-h-[min(24rem,55vh)]">
            <DataTableContent
              table={table}
              loading={listBlockingLoad}
              loadingMessage="Loading applications..."
              emptyMessage={
                debouncedSearchTerm.trim()
                  ? "No matching applications"
                  : "No applications found"
              }
              emptySubMessage={
                debouncedSearchTerm.trim()
                  ? "Try a different search term"
                  : "Try adjusting your search or filter criteria"
              }
              onRowClick={(row) => handleNavigateToApplication(row.original)}
            />
          </div>
        </div>

        {!listBlockingLoad && totalItems > 0 && (
          <DataTablePagination
            table={table}
            totalItems={totalItems}
            showSelectedCount={false}
          />
        )}
      </div>

      <ApplicationDetailsSheet
        application={viewApplication}
        open={!!viewApplication}
        onOpenChange={(open) => {
          if (!open) setViewApplication(null);
        }}
      />
    </div>
  );
}
