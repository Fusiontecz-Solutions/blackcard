
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { fetchOperationsDashboardSummary } from "@/redux/actions/operationsDashboardActions";
import { getClientByClientId } from "@/redux/actions/clientActions";
import type { Application } from "@/types/applicationTypes";
import ApplicationDetailsSheet from "@/components/application/ApplicationDetailsSheet";
import {
  ArrowLeft,
  LayoutGrid,
  LayoutList,
  Search,
  EyeIcon,
  Loader2,
} from "lucide-react";
import {
  type ColumnDef,
  type PaginationState,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  CONTRACT_OUT_QUEUE_BADGE_CLASS,
  isContractOutQueueBadgeLabel,
} from "@/lib/contractOutQueueBadge";
import {
  CONTRACT_SIGNED_QUEUE_BADGE_CLASS,
  isContractSignedQueueBadgeLabel,
} from "@/lib/contractSignedQueueBadge";
import { filterPipelineDealsBySearch } from "@/lib/applicationTableSearch";
import { formatDealPipelineCurrentStateLabel } from "@/lib/dealPipelineCurrentState";
import { axiosGet } from "@/redux/axios";
import {
  readDealPipelineListCache,
  writeDealPipelineListCache,
} from "@/lib/dealPipelineListCache";
import { getTokenUserId } from "@/lib/operationsDashboardSessionCache";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableContent, DataTablePagination } from "@/components/DataTable";
import { isListBlockingLoad } from "@/lib/listLoading";

type PipelineStage =
  | "agent"
  | "scrubbing"
  | "final-scrubbing"
  | "doc-request-contract"
  | "final"
  | "funding-call";

type PipelineDeal = {
  /** Application primary key (UUID) — used for navigation */
  id: string;
  /** Display ref e.g. APP-12345 */
  code: string;
  applicationId: number | null;
  merchant: string;
  email: string;
  owner: string;
  amount: number;
  currentState: string;
  createdAt: string;
  lastModifiedAt: string;
  updatedAt: string;
  ownerInitials: string;
  iso: string;
  /** Latest terms offer approved amount, if any */
  approvedAmount: number | null;
};

const STAGE_CONFIG: Array<{ value: PipelineStage; label: string }> = [
  { value: "agent", label: "AGENT" },
  { value: "scrubbing", label: "SCRUBBING" },
  { value: "final-scrubbing", label: "UNDERWRITER" },
  { value: "doc-request-contract", label: "CONTRACT" },
  { value: "final", label: "FINAL" },
  { value: "funding-call", label: "FUNDING CALL" },
];

/**
 * Matches `/applications?operationsStatus=…` filters.
 * CONTRACT uses `Contracted` (contracts out + signed) with per-row CURRENT STATE labels.
 */
const STAGE_OPERATIONS_STATUS: Record<PipelineStage, string> = {
  agent: "Agent",
  scrubbing: "Scrubbing",
  "final-scrubbing": "Underwriter",
  "doc-request-contract": "Contracted",
  final: "Final",
  "funding-call": "Funding Call",
};

/** Label to display in CURRENT STATE for non-contract pipeline stages (uniform stage badge). */
const STAGE_DISPLAY_STATE: Record<PipelineStage, string> = {
  agent: "Agent",
  scrubbing: "Scrubbing",
  "final-scrubbing": "Underwriter",
  "doc-request-contract": "Contract",
  final: "Final",
  "funding-call": "Funding Call",
};

const DEAL_PIPELINE_PAGE_SIZE = 10;
/** Rows fetched per stage for client-side search (substring match in memory). */
const DEAL_PIPELINE_FETCH_LIMIT = 500;

/** Parse API numbers / Prisma Decimal strings */
function parseMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const n = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatUserName(u?: { firstName?: string; lastName?: string } | null): string {
  if (!u) return "—";
  const name = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  return name || "—";
}

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "—";
}

function mapApiApplicationToDeal(app: Record<string, unknown>): PipelineDeal {
  const client = app.client as Record<string, unknown> | string | undefined;
  let merchant = "—";
  let email = "—";
  if (typeof client === "string") {
    merchant = client;
  } else if (client && typeof client === "object") {
    const biz = client.business as { name?: string; email?: string } | undefined;
    email = biz?.email || "—";
    const owner = client.owner as { firstName?: string; lastName?: string } | undefined;
    if (biz?.name) merchant = biz.name;
    else if (owner) merchant = formatUserName(owner);
  }

  const salesRep = app.salesRepresentative as
    | { firstName?: string; lastName?: string }
    | undefined;
  const ownerName = formatUserName(salesRep);

  const isoName = formatUserName(
    app.referringAgent as { firstName?: string; lastName?: string } | undefined,
  );

  const applicationId = app.applicationId as number | undefined;
  const uuid = String(app._id ?? app.id ?? "");
  const code =
    applicationId != null
      ? `APP-${applicationId}`
      : uuid.length > 6
        ? `APP-${uuid.slice(-6)}`
        : "—";

  const updatedRaw = app.updatedAt as string | undefined;
  const updatedAt =
    updatedRaw && !Number.isNaN(Date.parse(updatedRaw))
      ? new Date(updatedRaw).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      : "—";
  const createdRaw = app.createdAt as string | undefined;
  const createdAt =
    createdRaw && !Number.isNaN(Date.parse(createdRaw))
      ? new Date(createdRaw).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      : "—";

  const loanAmount = parseMoney(app.loanAmount);

  const termsOffers = app.termsOffers as { approvedAmount?: unknown }[] | undefined;
  const fromTerms =
    termsOffers && termsOffers.length > 0 ? parseMoney(termsOffers[0].approvedAmount) : null;

  const od = app.OfferDecision as { offer?: unknown; decision?: string } | null | undefined;
  const decisionNorm = od?.decision ? String(od.decision).toLowerCase() : "";
  const fromOfferDecision =
    od && decisionNorm !== "declined" ? parseMoney(od.offer) : null;

  const approvedAmount = fromTerms ?? fromOfferDecision;

  const amount =
    loanAmount != null && loanAmount > 0 ? loanAmount : approvedAmount ?? loanAmount ?? 0;

  const currentState = formatDealPipelineCurrentStateLabel({
    currentQueue: app.currentQueue as string | null | undefined,
    queue: app.queue as string | null | undefined,
    currentState: app.currentState as string | null | undefined,
    state: app.state as string | null | undefined,
  });

  return {
    id: uuid,
    code,
    applicationId: applicationId ?? null,
    merchant,
    email,
    owner: ownerName,
    amount,
    currentState,
    createdAt,
    lastModifiedAt: updatedAt,
    updatedAt,
    ownerInitials: initialsFromName(ownerName),
    iso: isoName,
    approvedAmount,
  };
}

function getDealStateBadgeClass(stateLabel: string): string {
  if (isContractOutQueueBadgeLabel(stateLabel)) {
    return CONTRACT_OUT_QUEUE_BADGE_CLASS;
  }
  if (isContractSignedQueueBadgeLabel(stateLabel)) {
    return CONTRACT_SIGNED_QUEUE_BADGE_CLASS;
  }
  const n = stateLabel.toLowerCase();
  if (n.includes("approved")) return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
  if (n === "funded" || n === "disbursement" || n === "disbursment") return "bg-green-100 text-green-700";
  if (n === "contracted" || n === "contract") return "bg-blue-100 text-blue-700";
  if (n === "declined") return "bg-red-100 text-red-700";
  if (
    n === "underwriting" ||
    n === "scrubbing" ||
    n === "review" ||
    n === "final review" ||
    n === "final scrubbing" ||
    n === "final" ||
    n === "funding call" ||
    n === "agent"
  ) {
    return "bg-sky-100 text-sky-800";
  }
  if (n === "-" || n === "—") return "bg-muted/50 text-foreground";
  return "bg-yellow-100 text-yellow-700";
}

function getApplicationClientId(application: Application): string | null {
  const client = application?.client;
  if (!client) return null;
  if (typeof client === "string") return client;
  if (client.clientId != null) return String(client.clientId);
  if (client._id) return String(client._id);
  return null;
}

export default function DealPipeline() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const caseStageCounts = useSelector(
    (state: RootState) => state.operationsDashboard.caseStageCounts,
  );

  const bootstrapList = useMemo(() => {
    const uid = getTokenUserId();
    if (!uid) return null;
    const c = readDealPipelineListCache(
      uid,
      STAGE_OPERATIONS_STATUS.agent,
      1,
      DEAL_PIPELINE_FETCH_LIMIT,
      "",
    );
    if (!c) return null;
    const raw = c.raw as Record<string, unknown>[];
    return {
      deals: raw.map(mapApiApplicationToDeal),
      apps: c.raw as Application[],
      total: c.total,
    };
  }, []);

  const [activeStage, setActiveStage] = useState<PipelineStage>("agent");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEAL_PIPELINE_PAGE_SIZE,
  });
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [stageDeals, setStageDeals] = useState<PipelineDeal[]>(
    bootstrapList?.deals ?? [],
  );
  /** Same page as `stageDeals` — full application for the preview drawer */
  const [pageApplications, setPageApplications] = useState<Application[]>(
    bootstrapList?.apps ?? [],
  );
  const [viewApplication, setViewApplication] = useState<Application | null>(null);
  const [listLoading, setListLoading] = useState(() => !bootstrapList);
  const [listError, setListError] = useState<string | null>(null);
  const [totalFromApi, setTotalFromApi] = useState(() => bootstrapList?.total ?? 0);

  const stageCounts = useMemo(
    () =>
      STAGE_CONFIG.reduce(
        (acc, { value }) => {
          const statusKey = STAGE_OPERATIONS_STATUS[value];
          acc[value] = Number(caseStageCounts[statusKey]) || 0;
          return acc;
        },
        {} as Record<PipelineStage, number>,
      ),
    [caseStageCounts],
  );

  const totalDeals = stageCounts[activeStage] ?? 0;
  const displayCurrentState = STAGE_DISPLAY_STATE[activeStage];
  const stageDealsWithDisplayState = useMemo(
    () =>
      stageDeals.map((deal) => ({
        ...deal,
        currentState:
          activeStage === "doc-request-contract"
            ? deal.currentState
            : displayCurrentState,
      })),
    [stageDeals, displayCurrentState, activeStage],
  );
  const filteredStageDeals = useMemo(
    () => filterPipelineDealsBySearch(stageDealsWithDisplayState, searchTerm),
    [stageDealsWithDisplayState, searchTerm],
  );
  const listTotalForPager = filteredStageDeals.length;

  const goToDeal = useCallback(
    (deal: PipelineDeal) => {
      const qs = new URLSearchParams();
      qs.set("fromStage", activeStage);
      navigate(`/deal-pipeline/${deal.id}?${qs.toString()}`);
    },
    [navigate, activeStage],
  );

  const handleOpenApplicationDetails = useCallback(
    async (application: Application) => {
      const clientId = getApplicationClientId(application);
      if (clientId) {
        try {
          await dispatch(getClientByClientId(clientId)).unwrap();
        } catch {
          /* sheet still opens; client loads inside sheet */
        }
      }
      setViewApplication(application);
    },
    [dispatch],
  );

  const openPreviewForDealId = useCallback(
    (dealId: string) => {
      const application = pageApplications.find(
        (a) => String(a._id ?? (a as { id?: string }).id ?? "") === dealId,
      );
      if (application) void handleOpenApplicationDetails(application);
    },
    [pageApplications, handleOpenApplicationDetails],
  );

  const columns: ColumnDef<PipelineDeal>[] = useMemo(
    () => [
      {
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
      },
      {
        id: "id",
        accessorKey: "applicationId",
        header: () => <span className="font-medium text-foreground uppercase tracking-wide">ID</span>,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.applicationId ?? "-"}</span>
        ),
      },
      {
        id: "businessName",
        accessorKey: "merchant",
        header: () => (
          <span className="font-medium text-foreground uppercase tracking-wide">BUSINESS NAME</span>
        ),
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.merchant}</span>,
      },
      {
        id: "email",
        accessorKey: "email",
        header: () => <span className="font-medium text-foreground uppercase tracking-wide">EMAIL</span>,
        cell: ({ row }) => <span className="text-foreground">{row.original.email}</span>,
      },
      {
        id: "iso",
        accessorKey: "iso",
        header: () => <span className="font-medium text-foreground uppercase tracking-wide">ISO</span>,
        cell: ({ row }) => <span className="text-foreground">{row.original.iso}</span>,
      },
      {
        id: "amount",
        accessorKey: "amount",
        header: () => <span className="font-medium text-foreground uppercase tracking-wide">LOAN AMOUNT</span>,
        cell: ({ row }) => <span className="text-foreground">{formatCurrency(row.original.amount)}</span>,
      },
      {
        id: "currentState",
        accessorKey: "currentState",
        header: () => <span className="font-medium text-foreground uppercase tracking-wide">CURRENT STATE</span>,
        cell: ({ row }) => (
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${getDealStateBadgeClass(
              row.original.currentState,
            )}`}
          >
            {row.original.currentState}
          </span>
        ),
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: () => <span className="font-medium text-foreground uppercase tracking-wide">CREATED AT</span>,
        cell: ({ row }) => <span className="text-foreground">{row.original.createdAt}</span>,
      },
      {
        id: "lastModifiedAt",
        accessorKey: "lastModifiedAt",
        header: () => (
          <span className="font-medium text-foreground uppercase tracking-wide">LAST MODIFIED DATE</span>
        ),
        cell: ({ row }) => <span className="text-foreground">{row.original.lastModifiedAt}</span>,
      },
      {
        id: "view",
        header: () => <span className="font-medium text-foreground uppercase tracking-wide">VIEW</span>,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openPreviewForDealId(row.original.id);
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
    ],
    [openPreviewForDealId],
  );

  const table = useReactTable({
    data: filteredStageDeals,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    enableRowSelection: true,
    manualPagination: false,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
  });

  const buildListQueryString = useCallback(
    (operationsStatus: string, page: number, limit: number) => {
      const qp = new URLSearchParams();
      qp.set("page", String(page));
      qp.set("limit", String(limit));
      qp.set("operationsStatus", operationsStatus);
      qp.set("sortBy", "updatedAt");
      qp.set("sortOrder", "desc");
      return qp.toString();
    },
    [],
  );

  const listBlockingLoad = isListBlockingLoad({
    rowCount: stageDeals.length,
    loading: listLoading,
  });

  /**
   * One round-trip for all stage totals (same semantics as six separate list `totalItems` calls).
   * Reuses Redux + thunk TTL when the operations dashboard already fetched this summary.
   */
  useEffect(() => {
    void dispatch(fetchOperationsDashboardSummary());
  }, [dispatch]);

  /** Warm cache for every stage (page 1, no search) so circle clicks usually hit session cache. */
  useEffect(() => {
    const userId = getTokenUserId();
    if (!userId) return;
    const ctrl = new AbortController();
    const run = async () => {
      await new Promise((r) => {
        window.setTimeout(r, 200);
      });
      if (ctrl.signal.aborted) return;
      await Promise.all(
        STAGE_CONFIG.map(async ({ value }) => {
          const ops = STAGE_OPERATIONS_STATUS[value];
          if (readDealPipelineListCache(userId, ops, 1, DEAL_PIPELINE_FETCH_LIMIT, "")) {
            return;
          }
          try {
            const qs = buildListQueryString(ops, 1, DEAL_PIPELINE_FETCH_LIMIT);
            const res = await axiosGet(`/applications?${qs}`, { signal: ctrl.signal });
            const payload = res?.data ?? {};
            const raw = Array.isArray(payload.data) ? payload.data : [];
            const total =
              payload?.pagination?.totalItems ?? payload?.pagination?.total ?? raw.length;
            writeDealPipelineListCache(
              userId,
              ops,
              1,
              DEAL_PIPELINE_FETCH_LIMIT,
              "",
              raw,
              Number(total),
            );
          } catch {
            /* prefetch is best-effort */
          }
        }),
      );
    };
    void run();
    return () => ctrl.abort();
  }, [buildListQueryString]);

  useEffect(() => {
    let cancelled = false;
    const userId = getTokenUserId();
    const ops = STAGE_OPERATIONS_STATUS[activeStage];
    const page = 1;
    const limit = DEAL_PIPELINE_FETCH_LIMIT;

    const cached = userId
      ? readDealPipelineListCache(userId, ops, page, limit, "")
      : null;

    if (cached) {
      const rawRows = cached.raw as Record<string, unknown>[];
      setStageDeals(rawRows.map(mapApiApplicationToDeal));
      setPageApplications(cached.raw as Application[]);
      setTotalFromApi(cached.total);
      setListError(null);
      setListLoading(false);
    } else {
      setStageDeals([]);
      setPageApplications([]);
      setTotalFromApi(0);
      setListLoading(true);
      setListError(null);
    }

    const load = async () => {
      try {
        const qs = buildListQueryString(ops, page, limit);
        const res = await axiosGet(`/applications?${qs}`);
        if (cancelled) return;

        const payload = res?.data ?? {};
        const raw = Array.isArray(payload.data) ? payload.data : [];
        const deals = raw.map((a: Record<string, unknown>) => mapApiApplicationToDeal(a));
        const total = payload?.pagination?.totalItems ?? payload?.pagination?.total ?? deals.length;
        const totalNum = Number(total);

        if (userId) {
          writeDealPipelineListCache(userId, ops, page, limit, "", raw, totalNum);
        }

        setStageDeals(deals);
        setPageApplications(raw as Application[]);
        setTotalFromApi(totalNum);
        setListError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        if (!cached) {
          const message =
            typeof e === "object" && e !== null && "response" in e
              ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message)
              : "Failed to load applications";
          setListError(message || "Failed to load applications");
          setStageDeals([]);
          setPageApplications([]);
          setTotalFromApi(0);
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeStage, buildListQueryString]);

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [activeStage, searchTerm, viewMode]);

  useEffect(() => {
    setViewApplication(null);
  }, [activeStage]);

  return (
    <motion.div
      className="flex-1 min-h-screen space-y-6 bg-background px-4 md:px-6 py-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <motion.div
        className="flex justify-between items-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground">
            Track deals through your funding pipeline
          </p>
        </div>
      </motion.div>

      <motion.section
        className={`border rounded-xl shadow-[0px_4px_20px_0px_#00000005] p-4 overflow-x-auto ${
          isDark ? "bg-[#141517] border-[#374151]" : "bg-white border-[#FDFDFD]"
        }`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.12 }}
      >
        <div className="flex items-start justify-between min-w-[800px] px-4">
          {STAGE_CONFIG.map((stage, idx) => {
            const isCompleted =
              STAGE_CONFIG.findIndex((s) => s.value === activeStage) > idx;
            const isActive = activeStage === stage.value;

            return (
              <React.Fragment key={stage.value}>
                <motion.div
                  className="flex flex-col items-center flex-shrink-0"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.04 }}
                >
                  <motion.button
                    type="button"
                    onClick={() => setActiveStage(stage.value)}
                    className="flex flex-col items-center text-center group relative z-10"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <motion.div
                      className={`w-10 h-10 flex items-center justify-center rounded-full cursor-pointer border-2 transition-all
                  ${isCompleted
                          ? "bg-[image:var(--brand-gradient)] border-[var(--brand)] text-white"
                          : isActive
                            ? "border-[var(--brand)] text-[var(--brand)] bg-white dark:bg-background"
                            : "border-slate-300 text-slate-400 bg-white dark:bg-card"
                        }`}
                      animate={{
                        scale: isActive ? 1.08 : 1,
                        boxShadow: isActive
                          ? "0 0 0 4px rgba(39, 109, 156, 0.2)"
                          : "0 0 0 0 rgba(0, 0, 0, 0)",
                      }}
                      transition={{ type: "spring", stiffness: 320, damping: 24 }}
                    >
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={isCompleted ? "done" : "index"}
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          transition={{ duration: 0.18 }}
                        >
                          {isCompleted ? "✓" : idx + 1}
                        </motion.span>
                      </AnimatePresence>
                    </motion.div>

                    <motion.span
                      className={`mt-2 text-[13px] font-bold uppercase tracking-tight leading-none
                ${isActive || isCompleted ? "text-[var(--brand)]" : "text-slate-400"}`}
                      animate={{ y: isActive ? -1 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {stage.label}
                    </motion.span>

                    <motion.span
                      className="text-sm font-bold text-slate-800 dark:text-white"
                      animate={{ scale: isActive ? 1.05 : 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      {stageCounts[stage.value] ?? 0}
                    </motion.span>
                  </motion.button>
                </motion.div>

                {idx !== STAGE_CONFIG.length - 1 && (
                  <div className="flex-1 mt-5 h-[2px] mx-6 bg-slate-200 dark:bg-slate-700 relative">
                    <motion.div
                      className={`absolute top-0 left-0 h-full transition-all duration-500
                  ${isCompleted ? "bg-[image:var(--brand-gradient)] w-full" : "bg-transparent w-0"}`}
                      initial={false}
                      animate={{ width: isCompleted ? "100%" : "0%" }}
                      transition={{ duration: 0.35, ease: "easeInOut" }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </motion.section>

      <div className="mt-4 flex flex-col lg:flex-row items-stretch lg:items-center gap-3 justify-between">
        <div className="flex items-center gap-3 w-full lg:max-w-[520px]">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 bg-card text-muted-foreground"
            onClick={() => window.history.back()}
            aria-label="Go back"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search merchants..."
              className="pl-9 h-10 bg-card"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div
          className="flex items-center gap-2 shrink-0"
          role="group"
          aria-label="Deals display layout"
        >
          <span className="text-xs text-muted-foreground hidden sm:inline">View</span>
          <div className="flex rounded-md border border-border overflow-hidden bg-card">
            <Button
              type="button"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-10 sm:h-9 rounded-none px-3 gap-1.5 shadow-none"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              title="List view"
            >
              <LayoutList className="size-4 shrink-0" />
              <span className="text-xs font-medium">List</span>
            </Button>
            <Button
              type="button"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-10 sm:h-9 rounded-none px-3 gap-1.5 border-l border-border shadow-none"
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              title="Grid view"
            >
              <LayoutGrid className="size-4 shrink-0" />
              <span className="text-xs font-medium">Grid</span>
            </Button>
          </div>
        </div>
      </div>

      <div
        className={`rounded-[5px] border shadow-[0px_4px_20px_0px_#00000005] ${
          isDark ? "bg-[#141517] border-[#374151]" : "bg-card border-[#FDFDFD]"
        }`}
      >
        <div
          className={`px-4 md:px-5 py-2 rounded-t-[5px] flex flex-wrap items-center justify-between gap-3 ${
            isDark ? "bg-[#2A2B2F]" : "bg-[#F9FAFD]"
          }`}
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-[1rem] text-foreground font-roboto inline-flex items-center gap-2 uppercase tracking-wide">
              Applications
              {listLoading ? (
                <Loader2
                  className="size-4 animate-spin text-muted-foreground shrink-0"
                  aria-label="Updating list"
                />
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {totalDeals} total in this queue
              {totalFromApi > 0 ? (
                <span className="text-muted-foreground/80">
                  {" "}
                  · {stageDeals.length} loaded
                  {searchTerm.trim() ? ` · ${filteredStageDeals.length} match` : ""}
                </span>
              ) : null}
            </span>
          </div>
          <Button variant="destructive" size="sm" className="gap-1 cursor-not-allowed text-xs shrink-0" disabled>
            Delete
          </Button>
        </div>

        <div className="p-1">
          {listError ? (
            <div className="px-6 py-8 text-center text-destructive text-sm" role="alert">
              {listError}
            </div>
          ) : viewMode === "list" ? (
            <div className="overflow-x-auto overflow-y-auto rounded-xl [scrollbar-gutter:stable] min-h-[min(32rem,65vh)] max-lg:min-h-[min(24rem,55vh)]">
              <DataTableContent
                table={table}
                loading={listBlockingLoad}
                loadingMessage="Loading deals…"
                emptyMessage="No deals found"
                emptySubMessage={
                  searchTerm.trim()
                    ? `Try a different search than "${searchTerm.trim()}"`
                    : "No applications in this stage"
                }
                onRowClick={(row) => goToDeal(row.original)}
              />
            </div>
          ) : listBlockingLoad ? (
            <div className="flex items-center justify-center py-20 rounded-xl">
              <Loader2 className="h-8 w-8 animate-spin text-primary shrink-0" />
              <span className="ml-2 text-muted-foreground">Loading deals…</span>
            </div>
          ) : !filteredStageDeals.length ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-xl">
              <p className="font-medium text-[#687182]">No deals found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchTerm.trim()
                  ? `Try adjusting your search for "${searchTerm.trim()}"`
                  : "No applications in this stage"}
              </p>
            </div>
          ) : (
            <div className="p-3 md:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredStageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    role="group"
                    tabIndex={0}
                    onClick={() => goToDeal(deal)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goToDeal(deal);
                      }
                    }}
                    aria-label={`Open deal ${deal.code}`}
                    className={`rounded-lg border shadow-sm flex flex-col gap-3 p-4 text-left transition hover:ring-2 hover:ring-[var(--brand)]/20 cursor-pointer ${
                      isDark ? "bg-[#1a1b1e] border-[#374151]" : "bg-card border-[#F0F0F0]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground truncate">{deal.merchant}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="text-sky-600 font-medium">{deal.code}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPreviewForDealId(deal.id);
                        }}
                        className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/10"
                        aria-label="Preview application in drawer"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        <span className="text-foreground/80">Agent: </span>
                        {deal.owner}
                      </p>
                      <p>
                        <span className="text-foreground/80">Updated: </span>
                        {deal.updatedAt}
                      </p>
                      <p>
                        <span className="text-foreground/80">Requested Amount: </span>
                        {formatCurrency(deal.amount)}
                      </p>
                      <p>
                        <span className="text-foreground/80">Approved Amount: </span>
                        {deal.approvedAmount != null
                          ? formatCurrency(deal.approvedAmount)
                          : "Pending"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {viewMode === "list" &&
          filteredStageDeals.length > 0 &&
          !listError && (
          <DataTablePagination
            table={table}
            totalItems={listTotalForPager}
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
    </motion.div>
  );
}
