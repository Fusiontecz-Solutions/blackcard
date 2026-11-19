import { useState, useMemo, useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router";
import type { AppDispatch, RootState } from "@/redux/store";
import { getApplications, deleteApplication } from "@/redux/actions/applicationActions";
import { resetDeleteApplication } from "@/redux/slices/applicationSlice";
import type { Application } from "@/types/applicationTypes";
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type PaginationState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Trash2 } from "lucide-react";
import { DataTableContent, DataTablePagination } from "@/components/DataTable";
import ApplicationDetailsSheet from "@/components/application/ApplicationDetailsSheet";
import { useTheme } from "@/context/ThemeContext";
import { CONTRACT_OUT_QUEUE_BADGE_CLASS } from "@/lib/contractOutQueueBadge";
import { CONTRACT_SIGNED_QUEUE_BADGE_CLASS } from "@/lib/contractSignedQueueBadge";
import { formatCurrency } from "@/lib/utils";
import { resolveApplicationDisplayLoanAmount } from "@/lib/applicationLoanAmount";
import { toast } from "react-toastify";
import { formatDate as formatDateUtil } from "@/lib/utils";
import { isListBlockingLoad } from "@/lib/listLoading";

const Cases = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Local state
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  // TanStack Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [viewApplication, setViewApplication] = useState<Application | null>(null);

  // Redux state
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

  const formatDate = useCallback((dateString?: string) => {
    return formatDateUtil(dateString ?? "", "-");
  }, []);

  const getClientName = useCallback((client: Application["client"]) => {
    if (typeof client === "string") return client;
    if (client?.business?.name) return client.business.name;
    if (client?.owner?.firstName || client?.owner?.lastName) {
      return `${client.owner.firstName || ""} ${client.owner.lastName || ""}`.trim();
    }
    return "-";
  }, []);

  const getClientEmail = useCallback((client: Application["client"]) => {
    if (typeof client === "string") return "-";
    return client?.business?.email || client?.owner?.email || "-";
  }, []);

  const getCaseStatus = useCallback((application: Application): string => {
    const queue = application.currentQueue || application.queue;
    const state = application.currentState || application.state;

    if (application.status) {
      return application.status;
    }

    if (queue === "Contract Pending") return "Contract Pending";
    if (queue === "Contract Generated") return "Contract Generated";
    if (queue === "Contract Out") return "Contract Out";
    if (queue === "Contracts Out") return "Contract Out";
    if (
      queue === "Contract Signed" ||
      queue === "Signed Contracts" ||
      queue === "Signed_Contracts"
    ) {
      return "Contract Signed";
    }
    const stateNorm = String(state ?? "")
      .trim()
      .replace(/[\s_-]+/g, "")
      .toLowerCase();
    if (stateNorm === "signedcontracts" || stateNorm === "signed_contracts") {
      return "Contract Signed";
    }
    if (queue === "Contracted") return "Contracted";
    if (queue === "Approved") {
      if (state === "Completed") return "Funded";
      if (state === "Submitted" || state === "In Progress") return "Approved";
      return "Approved";
    }
    if (queue === "Declined") return "Declined";
    if (queue === "On Hold") return "Pending";
    if (queue === "Scrubbing" || queue === "Underwriter" || queue === "Underwriting" || queue === "Review" || queue === "Final Review")
      return "In Progress";
    if (queue === "New") return "Pending";

    if (state === "Cancelled") return "Declined";
    if (state === "Completed" && queue === "Approved") return "Funded";
    if (state === "Submitted" && queue === "Approved") return "Approved";

    return "Pending";
  }, []);

  const columns: ColumnDef<Application>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            className="size-4 rounded border-border text-blue-600 cursor-pointer"
            checked={table.getIsAllPageRowsSelected()}
            ref={(input) => {
              if (input) {
                input.indeterminate = table.getIsSomePageRowsSelected();
              }
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
            onChange={(e) => row.toggleSelected(e.target.checked)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "applicationId",
        header: () => (
          <span className="font-medium text-foreground">CASE ID</span>
        ),
        cell: ({ row }) => (
          <span
            className="font-medium text-foreground cursor-pointer hover:text-blue-600"
            onClick={() => navigate(`/application-details/${row.original.applicationId}`)}
          >
            {row.original.applicationId || "-"}
          </span>
        ),
      },
      {
        id: "businessName",
        accessorFn: (row) => getClientName(row.client),
        header: () => (
          <span className="font-medium text-foreground">BUSINESS NAME</span>
        ),
        cell: ({ row }) => (
          <span className="text-foreground">
            {getClientName(row.original.client)}
          </span>
        ),
      },
      {
        id: "email",
        accessorFn: (row) => getClientEmail(row.client),
        header: () => (
          <span className="font-medium text-foreground">EMAIL</span>
        ),
        cell: ({ row }) => (
          <span className="text-foreground">
            {getClientEmail(row.original.client)}
          </span>
        ),
      },
      {
        id: "loanAmount",
        accessorFn: (row) => resolveApplicationDisplayLoanAmount(row),
        header: () => (
          <span className="font-medium text-foreground">LOAN AMOUNT</span>
        ),
        cell: ({ row }) => {
          const loanAmount = resolveApplicationDisplayLoanAmount(row.original);
          if (loanAmount == null) {
            return <span className="text-foreground">-</span>;
          }
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
          <span className="font-medium text-foreground">STATUS</span>
        ),
        cell: ({ row }) => {
          const status = getCaseStatus(row.original);
          return (
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                status === "Funded"
                  ? "bg-green-100 text-green-700"
                  : status === "Approved"
                  ? "bg-blue-100 text-blue-700"
                  : status === "Declined"
                  ? "bg-red-100 text-red-700"
                  : status === "Contract Out" || status === "Contracts Out"
                  ? CONTRACT_OUT_QUEUE_BADGE_CLASS
                  : status === "Contract Signed"
                  ? CONTRACT_SIGNED_QUEUE_BADGE_CLASS
                  : status === "Contracted"
                  ? "bg-orange-100 text-orange-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {status}
            </span>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: () => (
          <span className="font-medium text-foreground">CREATED AT</span>
        ),
        cell: ({ row }) => (
          <span className="text-foreground">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        accessorKey: "lastModifiedAt",
        header: () => (
          <span className="font-medium text-foreground">LAST MODIFIED DATE</span>
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
            onClick={() => setViewApplication(row.original)}
            className="flex items-center justify-center text-[var(--brand)] hover:text-[var(--brand-accent-strong)] cursor-pointer"
            aria-label="View case details"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs font-bold">
              i
            </span>
          </button>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [formatDate, getClientEmail, getClientName, getCaseStatus, navigate]
  );

  const casesListBlockingLoad = isListBlockingLoad({
    rowCount: applications?.length ?? 0,
    loading,
    isRefreshing,
    awaitingFirstLoad: apiPagination == null && !error,
  });

  const tableRows = applications ?? [];
  const totalItems = apiPagination?.total ?? tableRows.length;
  const pageCount = Math.max(1, apiPagination?.totalPages ?? 1);

  const caseStats = useMemo(() => {
    const list = applications || [];
    const base = {
      total: apiPagination?.total ?? list.length,
      contracted: 0,
      funded: 0,
      approved: 0,
      pending: 0,
      declined: 0,
    };
    return list.reduce((acc, app) => {
      const status = getCaseStatus(app);
      acc.contracted +=
        status === "Contracted" ||
        status === "Contract Out" ||
        status === "Contracts Out"
          ? 1
          : 0;
      acc.funded += status === "Funded" ? 1 : 0;
      acc.approved += status === "Approved" ? 1 : 0;
      acc.pending += status === "Pending" || status === "In Progress" ? 1 : 0;
      acc.declined += status === "Declined" ? 1 : 0;
      return acc;
    }, base);
  }, [applications, apiPagination?.total, getCaseStatus]);

  const table = useReactTable({
    data: tableRows,
    columns,
    pageCount,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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
    getRowId: (row) => row._id,
  });

  useEffect(() => {
    setSelectedCaseIds(Object.keys(rowSelection));
  }, [rowSelection]);

  const fetchCases = useCallback(() => {
    dispatch(
      getApplications({
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
        search: debouncedSearchTerm.trim() || undefined,
        operationsStatus: "Contracted",
        lite: true,
      }),
    );
  }, [dispatch, pagination.pageIndex, pagination.pageSize, debouncedSearchTerm]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 400);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
  }, [debouncedSearchTerm]);

  // const handleDelete = useCallback(
  //   (id: string) => {
  //     if (window.confirm("Are you sure you want to delete this case?")) {
  //       dispatch(deleteApplication(id));
  //     }
  //   },
  //   [dispatch]
  // );

  const handleBulkDelete = useCallback(async () => {
    if (selectedCaseIds.length === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedCaseIds.length} selected case(s)?`
    );
    if (!confirmed) return;

    try {
      await Promise.all(
        selectedCaseIds.map((id) => dispatch(deleteApplication(id)).unwrap())
      );
      toast.success(
        selectedCaseIds.length === 1
          ? "Case deleted successfully!"
          : `${selectedCaseIds.length} cases deleted successfully!`
      );
      dispatch(resetDeleteApplication());
      setRowSelection({});
      fetchCases();
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to delete some cases";
      toast.error(message);
      dispatch(resetDeleteApplication());
      fetchCases();
      setRowSelection({});
    }
  }, [selectedCaseIds, dispatch, fetchCases]);

  useEffect(() => {
    if (deleteSuccess) {
      toast.success("Case deleted successfully!");
      dispatch(resetDeleteApplication());
      fetchCases();
    }
    if (deleteError) {
      toast.error(deleteError);
      dispatch(resetDeleteApplication());
    }
  }, [deleteSuccess, deleteError, dispatch, fetchCases]);

  return (
    <div
      className="min-h-screen bg-background p-4 md:p-6"
    >
      <div
        className={`flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-6 rounded-lg shadow-[0px_4px_20px_0px_#00000005] ${
          isDark ? "bg-[#141517]" : "bg-white"
        }`}
      >
        <div className="space-y-1">
          <h1 className="text-[1.35rem] font-semibold text-foreground font-roboto">
            All Cases
          </h1>
          <p className="text-sm text-muted-foreground">
            View and manage all applications that have reached the{" "}
            <span className="font-medium text-[var(--brand)]">Contracted</span> stage.
          </p>
        </div>
        <div className="flex items-center gap-3 justify-end">
          
        </div>
      </div>

      {/* Compact stats row */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-lg border border-border bg-card/70 px-3 py-2.5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Total Cases
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {caseStats.total}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-3 py-2.5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
            Funded
          </p>
          <p className="mt-1 text-lg font-semibold text-emerald-700">
            {caseStats.funded}
          </p>
        </div>
        <div className="rounded-lg border border-blue-200/70 bg-blue-50/60 px-3 py-2.5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-blue-700">
            Contracted
          </p>
          <p className="mt-1 text-lg font-semibold text-blue-700">
            {caseStats.contracted}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
            In Progress
          </p>
          <p className="mt-1 text-lg font-semibold text-amber-700">
            {caseStats.pending}
          </p>
        </div>
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/60 px-3 py-2.5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-rose-700">
            Declined
          </p>
          <p className="mt-1 text-lg font-semibold text-rose-700">
            {caseStats.declined}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col md:flex-row items-stretch md:items-center gap-3 justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search cases by name, email..."
            className="pl-9 h-10 bg-card"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {apiPagination?.total != null && apiPagination.total > 0 ? (
          <div className="text-xs md:text-sm text-muted-foreground text-right">
            <span className="font-semibold text-foreground">{apiPagination.total}</span>{" "}
            contracted case{apiPagination.total === 1 ? "" : "s"}
            {searchTerm.trim() ? " (search applied on server)" : ""}
          </div>
        ) : null}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      <div
        className={`mt-5 rounded-[5px] border shadow-[0px_4px_20px_0px_#00000005] ${
          isDark ? "bg-[#141517] border-[#374151]" : "bg-card border-[#FDFDFD]"
        }`}
      >
        <div
          className={`px-4 md:px-5 py-2 rounded-t-[5px] flex items-center justify-between gap-6 ${
            isDark ? "bg-[#2A2B2F]" : "bg-[#F9FAFD]"
          }`}
        >
          <span className="font-semibold text-[1rem] text-foreground font-roboto">
            Cases
          </span>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1 cursor-pointer text-xs shrink-0"
            disabled={selectedCaseIds.length === 0 || deleteLoading}
            onClick={handleBulkDelete}
          >
            <Trash2 className="size-3" />
            Delete
          </Button>
        </div>
        <div className="p-1">
          <div className="overflow-x-auto rounded-xl">
            <DataTableContent
              table={table}
              loading={casesListBlockingLoad}
              loadingMessage="Loading cases..."
              emptyMessage={
                debouncedSearchTerm.trim() ? "No matching cases" : "No cases found"
              }
              emptySubMessage={
                debouncedSearchTerm.trim()
                  ? "Try a different search term"
                  : "No contracted applications match the current filters"
              }
            />
          </div>
        </div>

        {!casesListBlockingLoad && tableRows.length > 0 && (
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
};

export default Cases;

