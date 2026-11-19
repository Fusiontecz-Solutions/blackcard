import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Grid2x2,
  List,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "react-toastify";
import type { AppDispatch, RootState } from "@/redux/store";
import { fetchOperationsApplications } from "@/redux/actions/operationsApplicationsActions";
import {
  inferOperationsListStatusFromApplication,
  normalizeOperationsDashboardStatusParam,
  OPERATIONS_APPLICATIONS_LIST_ALL_QUERY,
  operationsDashboardStatusTitle,
  type OperationsApplicationsListStatus,
} from "@/constants/operationsDashboardApplications";
import type { Application } from "@/types/applicationTypes";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate as formatDateUtil } from "@/lib/utils";
import {
  CONTRACT_OUT_QUEUE_BADGE_CLASS,
  isContractOutQueueBadgeLabel,
} from "@/lib/contractOutQueueBadge";
import {
  CONTRACT_SIGNED_QUEUE_BADGE_CLASS,
  isContractSignedQueueBadgeLabel,
} from "@/lib/contractSignedQueueBadge";
import { isListBlockingLoad } from "@/lib/listLoading";

const PAGE_SIZE = 20;

function merchantLabel(application: Application): string {
  const client = application?.client;
  if (!client) return "—";
  if (typeof client === "string") return client;
  const business = client.business?.name?.trim();
  if (business) return business;
  const first = client.owner?.firstName?.trim() ?? "";
  const last = client.owner?.lastName?.trim() ?? "";
  const name = `${first} ${last}`.trim();
  return name || "—";
}

function applicationDisplayCode(row: Application): string {
  if (row.applicationId != null) return `APP-${row.applicationId}`;
  const id = row._id;
  return id.length > 6 ? `APP-${id.slice(-6)}` : "—";
}

function queueLabel(row: Application): string {
  const q = row.currentQueue || row.queue || row.status;
  return q ? String(q) : "—";
}

function QueueDisplay({ row }: { row: Application }) {
  const text = queueLabel(row);
  if (text === "—") return text;
  if (isContractOutQueueBadgeLabel(text)) {
    return (
      <span
        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${CONTRACT_OUT_QUEUE_BADGE_CLASS}`}
      >
        {text}
      </span>
    );
  }
  if (isContractSignedQueueBadgeLabel(text)) {
    return (
      <span
        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${CONTRACT_SIGNED_QUEUE_BADGE_CLASS}`}
      >
        {text}
      </span>
    );
  }
  return text;
}

function applicationRouteId(application: Application): string {
  return application._id;
}

const thClass =
  "px-6 py-4 text-left text-[11px] font-semibold text-gray-600 dark:text-muted-foreground uppercase tracking-widest";

export type ToShowApplicationProps = {
  /** `letterGenerator`: all applications; opens `/letter-generator/:uuid` for templates & letters only. */
  variant?: "operations" | "letterGenerator";
};

/**
 * Operations dashboard drill-down: lists applications for the selected
 * `operationsStatus`, backed by Redux for pagination and search.
 */
const ToShowApplication = ({ variant = "operations" }: ToShowApplicationProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const { loading, error, data, pagination, operationsStatus } = useSelector(
    (state: RootState) => state.operationsApplications,
  );

  const statusParam = searchParams.get("operationsStatus");

  type OperationsListMode =
    | { kind: "stage"; status: OperationsApplicationsListStatus }
    | { kind: "all" }
    | { kind: "invalid" };

  const listMode = useMemo((): OperationsListMode => {
    if (variant === "letterGenerator") {
      return { kind: "all" };
    }
    const raw = statusParam?.trim() ?? "";
    if (!raw) return { kind: "invalid" };
    if (raw.toLowerCase() === OPERATIONS_APPLICATIONS_LIST_ALL_QUERY) {
      return { kind: "all" };
    }
    const status = normalizeOperationsDashboardStatusParam(statusParam);
    if (!status) return { kind: "invalid" };
    return { kind: "stage", status };
  }, [variant, statusParam]);

  const listModeKey =
    listMode.kind === "invalid"
      ? ""
      : listMode.kind === "all"
        ? "all"
        : listMode.status;

  const title =
    variant === "letterGenerator"
      ? "Letters"
      : listMode.kind === "all"
        ? "All applications"
        : listMode.kind === "stage"
          ? operationsDashboardStatusTitle(listMode.status)
          : "Submissions";

  const listBlockingLoad = isListBlockingLoad({
    rowCount: data.length,
    loading,
    awaitingFirstLoad:
      listMode.kind !== "invalid" && pagination == null && !error,
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (variant === "letterGenerator") return;
    if (listMode.kind === "invalid") {
      toast.error("Invalid or missing pipeline status.");
      navigate("/", { replace: true });
    }
  }, [variant, listMode.kind, navigate]);

  useLayoutEffect(() => {
    if (!listModeKey) return;
    setPage(1);
  }, [listModeKey]);

  useLayoutEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (listMode.kind === "invalid") return;
    if (listMode.kind === "all") {
      void dispatch(
        fetchOperationsApplications({
          page,
          limit: PAGE_SIZE,
          search: debouncedSearch,
          sortBy: "updatedAt",
          sortOrder: "desc",
        }),
      );
      return;
    }
    void dispatch(
      fetchOperationsApplications({
        operationsStatus: listMode.status,
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        sortBy: "updatedAt",
        sortOrder: "desc",
      }),
    );
  }, [dispatch, variant, listMode, page, debouncedSearch]);

  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleOpen = useCallback(
    (application: Application) => {
      if (variant === "letterGenerator") {
        const uuid = application._id?.trim();
        if (!uuid) return;
        navigate(`/letter-generator/${encodeURIComponent(uuid)}`);
        return;
      }
      const id =
        application.applicationId != null
          ? String(application.applicationId)
          : applicationRouteId(application);
      if (!id) return;
      const qs = new URLSearchParams();
      if (listMode.kind === "stage") {
        qs.set("operationsStatus", listMode.status);
      } else if (listMode.kind === "all") {
        const inferred = inferOperationsListStatusFromApplication(
          application.currentQueue ?? application.queue,
          {
            explicitStatus: application.status,
            currentState: application.currentState,
          },
        );
        if (inferred) qs.set("operationsStatus", inferred);
      }
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      navigate(`/application-details/${id}${suffix}`);
    },
    [navigate, listMode, variant],
  );

  const totalItems = pagination?.total ?? 0;
  const safeCurrentPage = Math.min(page, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const showingStart = totalItems === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(startIndex + data.length, totalItems);

  if (variant === "operations" && listMode.kind === "invalid") {
    return null;
  }

  return (
    <motion.div
      className="min-h-screen bg-background p-4 md:p-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                {title}
              </h1>
              <p className="text-sm text-gray-700 dark:text-muted-foreground">
                {variant === "letterGenerator"
                  ? "Click an application to send Payoff or Zero Balance letters."
                  : listMode.kind === "all"
                    ? "All applications across pipeline stages."
                    : listMode.kind === "stage"
                      ? `Applications in this stage (${operationsStatus ?? listMode.status})`
                      : ""}
              </p>
            </div>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Submissions</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {listMode.kind === "all"
                  ? `${totalItems} total applications`
                  : `${totalItems} total in this queue`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  size={16}
                />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name, email, application ID…"
                  className="h-11 w-full min-w-[220px] max-w-[320px] rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 sm:w-[280px]"
                />
              </div>

              <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`inline-flex h-9 w-10 items-center justify-center rounded-lg transition-colors ${
                    viewMode === "list"
                      ? "bg-[image:var(--brand-gradient)] text-white"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  aria-label="List view"
                >
                  <List size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`inline-flex h-9 w-10 items-center justify-center rounded-lg transition-colors ${
                    viewMode === "grid"
                      ? "bg-[image:var(--brand-gradient)] text-white"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  aria-label="Grid view"
                >
                  <Grid2x2 size={16} />
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div
              className="px-6 py-8 text-center text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {listBlockingLoad && !error ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading applications…</span>
            </div>
          ) : null}

          {!listBlockingLoad && !error && data.length > 0 ? (
            <AnimatePresence mode="wait">
              {viewMode === "list" ? (
                <motion.div
                  key="list-view"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-x-auto"
                >
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-accent/20">
                        <th className={thClass}>Business Name</th>
                        <th className={thClass}>Queue</th>
                        <th className={thClass}>Updated</th>
                        <th className={`${thClass} text-left`}>Amount</th>
                        <th className={`${thClass} text-left`}>Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.map((row) => (
                        <tr
                          key={row._id}
                          className="group transition-colors hover:bg-accent/30"
                        >
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-foreground transition-colors group-hover:text-foreground">
                                {merchantLabel(row)}
                              </span>
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {applicationDisplayCode(row)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-muted-foreground">
                            <QueueDisplay row={row} />
                          </td>
                          <td className="px-6 py-4 text-sm font-medium whitespace-nowrap text-muted-foreground">
                            {row.updatedAt
                              ? formatDateUtil(row.updatedAt)
                              : "—"}
                          </td>
                          <td className="px-6 py-4 text-left text-sm font-bold tabular-nums text-foreground">
                            {row.loanAmount != null
                              ? formatCurrency(Number(row.loanAmount))
                              : "—"}
                          </td>
                          <td className="px-6 py-4 text-left">
                            <button
                              type="button"
                              onClick={() => handleOpen(row)}
                              className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold uppercase tracking-tighter text-muted-foreground transition-colors hover:text-[var(--brand)]"
                            >
                              <Eye size={20} className="opacity-50" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              ) : (
                <motion.div
                  key="grid-view"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                  className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3"
                >
                  {data.map((row) => (
                    <div
                      key={row._id}
                      className="rounded-xl border border-border bg-background p-4 transition-colors hover:bg-accent/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-foreground">
                            {merchantLabel(row)}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {applicationDisplayCode(row)}
                          </p>
                        </div>
                        <span className="shrink-0 text-right text-xs font-semibold text-foreground">
                          <span className="block text-muted-foreground font-normal">
                            Amount
                          </span>
                          {row.loanAmount != null
                            ? formatCurrency(Number(row.loanAmount))
                            : "—"}
                        </span>
                      </div>
                      <div className="mt-4 space-y-1 text-sm">
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            Queue:{" "}
                          </span>
                          <QueueDisplay row={row} />
                        </p>
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            Updated:{" "}
                          </span>
                          {row.updatedAt
                            ? formatDateUtil(row.updatedAt)
                            : "—"}
                        </p>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleOpen(row)}
                          className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold uppercase tracking-tighter text-muted-foreground transition-colors hover:text-[var(--brand)]"
                        >
                          <Eye size={19} className="opacity-50" />
                        </button>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          ) : null}

          {!listBlockingLoad && !error && data.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No applications found
              {debouncedSearch
                ? ` for "${debouncedSearch}".`
                : listMode.kind === "all"
                  ? "."
                  : " for this stage."}
            </div>
          ) : null}

          {!listBlockingLoad && !error && data.length > 0 ? (
            <div className="flex flex-col items-stretch justify-between gap-3 border-t border-border bg-accent/20 px-6 py-4 text-xs font-bold text-muted-foreground sm:flex-row sm:items-center">
              <span>
                Showing {showingStart} to {showingEnd} of {totalItems} entries
              </span>
              <div className="flex flex-wrap items-center justify-center gap-1 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={safeCurrentPage <= 1}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="First page"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <div className="flex max-w-full flex-wrap justify-center gap-1 overflow-x-auto">
                  {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-2 text-[11px] font-semibold transition-colors ${
                          safeCurrentPage === p
                            ? "border-[var(--brand)] bg-[image:var(--brand-gradient)] text-white"
                            : "border-border bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                        }`}
                        aria-label={`Page ${p}`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  disabled={safeCurrentPage >= totalPages}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Last page"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </motion.div>
  );
};

export default ToShowApplication;
