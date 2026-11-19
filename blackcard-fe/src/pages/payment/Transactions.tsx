import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { Loader2, Pencil, ChevronDown } from "lucide-react";

import { sortCollectionPaymentRowsNewestFirst } from "@/lib/collectionPaymentSort";
import { cn, formatCurrencyFull } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  createCollectionPayment,
  deleteCollectionPayment,
  getCollectionPayments,
  updateCollectionPayment,
  updateDealEconomics,
} from "@/redux/actions/collectionPaymentActions";
import type {
  CollectionPayment,
  CreateCollectionPaymentPayload,
  UpdateCollectionPaymentPayload,
} from "@/types/collectionPaymentTypes";
import NotesTransaction from "./NotesTransaction";
import PaymentScheduletab from "./PaymentScheduletab";
import {
  collectDealTokensFromCollectionPaymentRow,
  normalizeDealIdToken,
} from "./paymentDealIdUtils";
import type {
  DealSchedule,
  PaymentStatus,
} from "./paymentScheduleTypes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const formatPercent = (value: number | null): string => {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
};

const resolveTransactionDate = (row: CollectionPayment): string => {
  const txRow = row as CollectionPayment & {
    date?: unknown;
    paymentDate?: unknown;
    transactionDate?: unknown;
  };
  return (
    String(
      txRow.scheduledDate ??
        txRow.date ??
        txRow.paymentDate ??
        txRow.transactionDate ??
        txRow.processedDate ??
        txRow.createdAt ??
        "",
    ).trim() || ""
  );
};

const resolveTransactionDescription = (row: CollectionPayment): string => {
  const txRow = row as CollectionPayment & {
    note?: unknown;
    description?: unknown;
  };
  return String(txRow.notes ?? txRow.note ?? txRow.description ?? "").trim();
};

export default function Transactions() {
  const dispatch = useDispatch<AppDispatch>();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const applicationData = useSelector(
    (state: RootState) => state.applicationDetail.data
  );
  const applicationDetailLoading = useSelector(
    (state: RootState) => state.applicationDetail.loading
  );

  const [activeSection, setActiveSection] = useState<
    "schedule" | "notes" | "actionLogs"
  >("schedule");
  const [collectionPaymentErrorToastShown, setCollectionPaymentErrorToastShown] =
    useState(false);

  const applicationIds = useMemo(() => {
    const app = applicationData as
      | {
          id?: string;
          _id?: string;
          applicationId?: string | number;
          dealId?: string;
          dealID?: string;
          deal_id?: string;
        }
      | null;
    return [
      app?.id,
      app?._id,
      app?.applicationId != null ? String(app.applicationId) : null,
      app?.dealId,
      app?.dealID,
      app?.deal_id,
    ].filter((v): v is string => !!v && String(v).trim() !== "");
  }, [applicationData]);

  /** Backend `/collection-payments` keys by Prisma/Mongo application id (`id` or `_id`), not the display `applicationId`. */
  const primaryApplicationId = useMemo(() => {
    const app = applicationData as { id?: string; _id?: string } | null;
    const raw = app?.id ?? app?._id;
    return raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";
  }, [applicationData]);

  const applicationDealId = useMemo(() => {
    const app = applicationData as
      | { dealId?: string; dealID?: string; deal_id?: string }
      | null;
    const raw = app?.dealId ?? app?.dealID ?? app?.deal_id;
    return raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";
  }, [applicationData]);

  const collectionPaymentsByApp = useSelector(
    (state: RootState) => state.collectionPayments.data
  );
  const collectionPaymentsError = useSelector(
    (state: RootState) => state.collectionPayments.error
  );
  const collectionPaymentsLoading = useSelector(
    (state: RootState) => state.collectionPayments.loading
  );
  // Prefer caching by dealId when available since this page renders transactions scoped to the deal.
  const mongoCollectionsId = applicationDealId || primaryApplicationId;
  const hasFetchedCollections = useSelector((state: RootState) =>
    mongoCollectionsId
      ? Boolean(state.collectionPayments.fetched[mongoCollectionsId])
      : false
  );
  const dealViewLookupKey = applicationDealId || primaryApplicationId;
  const dealView = useSelector((state: RootState) =>
    dealViewLookupKey
      ? state.collectionPayments.dealViewByKey[dealViewLookupKey] ?? null
      : null,
  );
  const normalizedApplicationIds = useMemo(() => {
    return new Set(
      applicationIds
        .map((id) => String(id ?? "").trim())
        .filter((id) => id.length > 0),
    );
  }, [applicationIds]);
  const normalizedDealToken = useMemo(
    () => normalizeDealIdToken(applicationDealId),
    [applicationDealId]
  );

  const collectionRows: CollectionPayment[] = useMemo(() => {
    if (!primaryApplicationId && !applicationDealId) return [];
    let sourceRows: CollectionPayment[] = [];
    if (applicationDealId) {
      const fromDeal = collectionPaymentsByApp[applicationDealId];
      if (fromDeal?.length) sourceRows = fromDeal;
    }
    if (!sourceRows.length) {
      const fromMongo = collectionPaymentsByApp[primaryApplicationId];
      if (fromMongo?.length) sourceRows = fromMongo;
    }
    if (!sourceRows.length) {
      const app = applicationData as { applicationId?: string | number } | null;
      const alt =
        app?.applicationId != null ? String(app.applicationId).trim() : "";
      sourceRows = alt ? collectionPaymentsByApp[alt] ?? [] : [];
    }

    const filtered = sourceRows.filter((row) => {
      const typedRow = row as CollectionPayment & {
        applicationId?: unknown;
        application?: { id?: unknown; _id?: unknown; applicationId?: unknown; dealId?: unknown };
        dealId?: unknown;
        dealID?: unknown;
        deal_id?: unknown;
      };
      const rowApplicationIds = [
        typedRow.applicationId,
        typedRow.application?.id,
        typedRow.application?._id,
        typedRow.application?.applicationId,
      ]
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0);

      const rowDealTokens = collectDealTokensFromCollectionPaymentRow(
        typedRow as unknown as Record<string, unknown>,
      );

      const matchesApplication = rowApplicationIds.some((id) =>
        normalizedApplicationIds.has(id),
      );
      const matchesDealId =
        normalizedDealToken.length > 0 &&
        rowDealTokens.some((token) => token === normalizedDealToken);

      // When the open application has a display deal id, only keep collection rows for that deal.
      // Rows may share the same applicationId (upload noise) but carry another deal in `dealId` / notes.
      if (normalizedDealToken.length > 0) {
        if (rowDealTokens.length > 0) {
          return matchesDealId;
        }
        return matchesApplication;
      }

      return matchesApplication || matchesDealId;
    });
    sortCollectionPaymentRowsNewestFirst(filtered);
    return filtered;
  }, [
    collectionPaymentsByApp,
    primaryApplicationId,
    applicationDealId,
    applicationData,
    normalizedApplicationIds,
    normalizedDealToken,
  ]);

  useEffect(() => {
    if (!primaryApplicationId && !applicationDealId) return;
    // `GET /collection-payments` needs either:
    // - `applicationId` as Prisma/Mongo application UUID (preferred), or
    // - `dealId` (when UUID is missing).
    // Our thunk always includes `applicationId`, so we pass "" when UUID is not available.
    const mongoId = primaryApplicationId || "";
    if (hasFetchedCollections) return;
    dispatch(
      getCollectionPayments({
        applicationId: mongoId,
        dealId: applicationDealId || undefined,
        includeDealView: true,
      }),
    );
  }, [
    dispatch,
    primaryApplicationId,
    applicationDealId,
    hasFetchedCollections,
  ]);

  useEffect(() => {
    if (!collectionPaymentsError) {
      setCollectionPaymentErrorToastShown(false);
      return;
    }
    if (!collectionPaymentErrorToastShown) {
      toast.error(collectionPaymentsError);
      setCollectionPaymentErrorToastShown(true);
    }
  }, [collectionPaymentsError, collectionPaymentErrorToastShown]);

  const derivedSchedule = useMemo<DealSchedule | null>(() => {
    const client =
      applicationData && typeof applicationData.client === "object"
        ? applicationData.client
        : null;
    const owner = client?.owner;
    const business = client?.business as
      | { name?: string; einNumber?: string; businessEntityType?: string }
      | undefined;

    const ownerName =
      [owner?.firstName, owner?.lastName].filter(Boolean).join(" ").trim() ||
      "N/A";
    const appIds = applicationData as {
      id?: unknown;
      _id?: unknown;
      applicationId?: unknown;
    } | null;
    const scheduleId =
      String(appIds?.id ?? appIds?._id ?? appIds?.applicationId ?? "").trim() ||
      "";

    if (!scheduleId) return null;

    const s = dealView?.schedule;
    return {
      id: scheduleId,
      deal: business?.name || "N/A",
      merchant: ownerName,
      ein: business?.einNumber,
      industry: business?.businessEntityType,
      advanceAmount: s?.advanceAmount ?? 0,
      factor: s?.factor ?? 0,
      paybackAmount: s?.paybackAmount ?? 0,
      dailyPayment: s?.dailyPayment ?? 0,
      startDate: s?.startDate ?? new Date().toISOString().split("T")[0],
      totalPayments: 0,
      payments: [],
    };
  }, [applicationData, dealView]);

  /** Schedule rows mirror GET /collection-payments (server applies debit↔incoming pairing and status). */
  const schedules = useMemo<DealSchedule[]>(() => {
    if (!derivedSchedule) return [];
    const mappedPayments = collectionRows.map((row, idx) => {
      const date = resolveTransactionDate(row);
      const description = resolveTransactionDescription(row);
      return {
        id: row.id,
        payNum: row.paymentNumber ?? idx + 1,
        date,
        amount: Number(row.amount ?? 0),
        status: row.status as PaymentStatus,
        refId:
          row.referenceNumber ||
          `COL-${derivedSchedule.id.slice(0, 6).toUpperCase()}-${row.paymentNumber ?? idx + 1}`,
        note: description,
        dealId: row.dealId ?? null,
      };
    });
    return [
      {
        ...derivedSchedule,
        payments: mappedPayments,
        totalPayments: mappedPayments.length,
      },
    ];
  }, [derivedSchedule, collectionRows]);

  const selectedAcct = derivedSchedule?.id ?? "";

  const acct = useMemo(() => {
    if (!selectedAcct) return null;
    return schedules.find((s) => s.id === selectedAcct) ?? null;
  }, [schedules, selectedAcct]);

  const applicationCardData = useMemo(() => {
    const client =
      applicationData && typeof applicationData.client === "object"
        ? applicationData.client
        : null;
    const owner = client?.owner;
    const business = client?.business as
      | { name?: string; einNumber?: string; businessEntityType?: string }
      | undefined;

    const ownerName =
      [owner?.firstName, owner?.lastName].filter(Boolean).join(" ").trim() ||
      acct?.merchant ||
      "N/A";

    const toDisplayName = (value: unknown): string | null => {
      if (!value) return null;
      if (typeof value === "string") return value;
      if (typeof value === "object") {
        const person = value as {
          firstName?: string;
          lastName?: string;
          name?: string;
        };
        if (person.name) return person.name;
        return [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || null;
      }
      return null;
    };

    const appRecord = applicationData as {
      dealId?: unknown;
      dealID?: unknown;
      deal_id?: unknown;
      applicationId?: unknown;
      _id?: unknown;
      iso?: unknown;
      ISO?: unknown;
      isoName?: unknown;
      isoCompany?: unknown;
      isoDetails?: unknown;
    } | null;
    const displayDealId = String(
      appRecord?.dealId ??
        appRecord?.dealID ??
        appRecord?.deal_id ??
        appRecord?.applicationId ??
        appRecord?._id ??
        acct?.id ??
        "—"
    );
    const isoName =
      toDisplayName(appRecord?.iso) ||
      toDisplayName(appRecord?.ISO) ||
      toDisplayName(appRecord?.isoDetails) ||
      (typeof appRecord?.isoName === "string" ? appRecord.isoName : null) ||
      (typeof appRecord?.isoCompany === "string" ? appRecord.isoCompany : null);

    return {
      subtitle: displayDealId,
      rows: [
        ["Business", business?.name || acct?.deal || "N/A"],
        ["Owner", ownerName],
        ["EIN", business?.einNumber || acct?.ein || "N/A"],
        ["Agent", "N/A"],
        ["Industry", business?.businessEntityType || acct?.industry || "N/A"],
        ["ISO", isoName || acct?.iso || "N/A"],
      ] as const,
    };
  }, [applicationData, acct]);

  /** Display strings for Funding card — numeric source is GET /collection-payments?includeDealView. */
  const fundingLabels = useMemo(() => {
    if (!dealView) {
      return {
        advanceLabel: formatCurrencyFull(0),
        factorLabel: "0.00",
        paybackLabel: formatCurrencyFull(0),
        refinanceLabel: "—" as const,
        frequencyLabel: "Daily",
        dailyLabel: formatCurrencyFull(0),
        feesAmount: 0,
        commissionAmount: 0,
      };
    }
    const s = dealView.offerSummary;
    const freq = s.frequency;
    const dailyLabel =
      s.paymentAmount != null && (freq === "daily" || freq === "weekly")
        ? formatCurrencyFull(s.paymentAmount)
        : formatCurrencyFull(s.paymentAmount ?? 0);
    return {
      advanceLabel: formatCurrencyFull(s.advanceNum),
      factorLabel:
        s.factorRate != null ? `${Number(s.factorRate).toFixed(3)}` : "0.00",
      paybackLabel: formatCurrencyFull(s.paybackNum),
      refinanceLabel:
        s.refinanceAmount != null ? formatCurrencyFull(s.refinanceAmount) : "—",
      frequencyLabel: s.frequencyLabel,
      dailyLabel,
      feesAmount: s.feesAmount,
      commissionAmount: s.commissionOnDeal,
    };
  }, [dealView]);

  // Inline editor for Fees + Commission — persists via PATCH /collection-payments/deal-economics
  // and the slice optimistically refreshes the deal economics tile.
  const [isEconomicsDialogOpen, setIsEconomicsDialogOpen] = useState(false);
  const [feesInput, setFeesInput] = useState("");
  const [commissionInput, setCommissionInput] = useState("");
  const [isSavingEconomics, setIsSavingEconomics] = useState(false);

  const openEconomicsDialog = useCallback(() => {
    setFeesInput(
      dealView?.offerSummary?.feesAmount != null
        ? String(Number(dealView.offerSummary.feesAmount))
        : "",
    );
    setCommissionInput(
      dealView?.offerSummary?.commissionOnDeal != null
        ? String(Number(dealView.offerSummary.commissionOnDeal))
        : "",
    );
    setIsEconomicsDialogOpen(true);
  }, [dealView]);

  const handleSaveEconomics = useCallback(async () => {
    if (!primaryApplicationId && !applicationDealId) {
      toast.error("Application context is missing");
      return;
    }
    const feesTrim = feesInput.trim();
    const commissionTrim = commissionInput.trim();
    const feesNum = feesTrim === "" ? null : Number(feesTrim);
    const commissionNum = commissionTrim === "" ? null : Number(commissionTrim);
    if (feesNum !== null && (!Number.isFinite(feesNum) || feesNum < 0)) {
      toast.error("Fees must be a non-negative number");
      return;
    }
    if (commissionNum !== null && (!Number.isFinite(commissionNum) || commissionNum < 0)) {
      toast.error("Commission must be a non-negative number");
      return;
    }
    if (feesNum === null && commissionNum === null) {
      toast.error("Enter a fees or commission value to update");
      return;
    }
    setIsSavingEconomics(true);
    try {
      await dispatch(
        updateDealEconomics({
          applicationId: primaryApplicationId || undefined,
          dealId: applicationDealId || undefined,
          ...(feesNum !== null ? { feesAmount: feesNum } : {}),
          ...(commissionNum !== null ? { commissionOnDeal: commissionNum } : {}),
        }),
      ).unwrap();
      // Re-pull the canonical deal view so balance/abovePrincipal/paidPct stay consistent with the server math.
      await dispatch(
        getCollectionPayments({
          applicationId: primaryApplicationId || applicationDealId,
          dealId: applicationDealId || undefined,
          includeDealView: true,
          force: true,
        }),
      );
      toast.success("Fees & commission updated");
      setIsEconomicsDialogOpen(false);
    } catch (err: unknown) {
      const message = typeof err === "string" ? err : (err as Error)?.message ?? "Failed to update";
      toast.error(message);
    } finally {
      setIsSavingEconomics(false);
    }
  }, [dispatch, primaryApplicationId, applicationDealId, feesInput, commissionInput]);

  const handleCreatePayment = useCallback(
    async (payload: {
      amount: string;
      date: string;
      note: string;
      status: import("./paymentScheduleTypes").PaymentStatus;
    }) => {
      if (!primaryApplicationId) throw new Error("Application id is missing");
      const data: CreateCollectionPaymentPayload = {
        applicationId: primaryApplicationId,
        amount: Number(payload.amount),
        date: payload.date,
        status: payload.status,
        note: payload.note,
      };
      await dispatch(createCollectionPayment(data)).unwrap();
      await dispatch(
        getCollectionPayments({
          applicationId: primaryApplicationId || applicationDealId,
          dealId: applicationDealId || undefined,
          includeDealView: true,
        }),
      );
    },
    [dispatch, primaryApplicationId, applicationDealId]
  );

  const handleEditPayment = useCallback(
    async (
      paymentId: string,
      payload: {
        amount: string;
        date: string;
        note: string;
        status: import("./paymentScheduleTypes").PaymentStatus;
      }
    ) => {
      const data: UpdateCollectionPaymentPayload = {
        amount: Number(payload.amount),
        date: payload.date,
        status: payload.status,
        note: payload.note,
      };
      await dispatch(updateCollectionPayment({ id: paymentId, data })).unwrap();
      await dispatch(
        getCollectionPayments({
          applicationId: primaryApplicationId || applicationDealId,
          dealId: applicationDealId || undefined,
          includeDealView: true,
        }),
      );
    },
    [dispatch, primaryApplicationId, applicationDealId]
  );

  const handleDeletePayment = useCallback(
    async (paymentId: string) => {
      await dispatch(deleteCollectionPayment(paymentId)).unwrap();
      await dispatch(
        getCollectionPayments({
          applicationId: primaryApplicationId || applicationDealId,
          dealId: applicationDealId || undefined,
          includeDealView: true,
        }),
      );
    },
    [dispatch, primaryApplicationId, applicationDealId]
  );

  if (!acct) {
    if (applicationDetailLoading && !applicationData) {
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center text-muted-foreground">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-[var(--brand)]" aria-hidden />
          <p className="text-sm font-medium">Loading application…</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center text-muted-foreground">
        <p className="text-sm font-medium">No schedule selected</p>
      </div>
    );
  }

  /** Full-screen wait only on the first load; background refetches keep showing cached deal view. */
  if (collectionPaymentsLoading && !dealView && !hasFetchedCollections) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center text-muted-foreground">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-[var(--brand)]" aria-hidden />
        <p className="text-sm font-medium">Loading collections & deal economics…</p>
      </div>
    );
  }

  if (!dealView) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center text-muted-foreground">
        <p className="text-sm font-medium">Unable to load deal economics</p>
        <p className="mt-1 text-xs">Try refreshing the page.</p>
      </div>
    );
  }

  const {
    paidAmount,
    repaidTowardPayback,
    failedAmount,
    debitedAmount,
    creditCount,
    failedTxnCount,
    debitTxnCount,
    dueTodayAmount,
    netFunding,
    balance,
    paidPct,
    overPaid,
    abovePrincipal,
    alreadyNet,
  } = dealView.repayment;

  const paybackTotal =
    Number(dealView.offerSummary?.paybackNum ?? repaidTowardPayback + balance) || 0;

  return (
    <div
      className={cn(
        "min-h-screen",
        isDark ? "bg-background text-foreground" : "text-slate-900"
      )}
    >
      <div className="mx-auto w-full space-y-6">
        <div
          className={cn(
            "overflow-hidden rounded-2xl border shadow-lg",
            isDark ? "border-white/10 bg-[#141517]" : "border-white/20 bg-white"
          )}
        >
          <div className="border-b border-border/60 px-5 py-5 sm:px-6">
            {/* Progress-first summary — the one thing that matters */}
            <div
              className={cn(
                "rounded-2xl border p-4 sm:p-5",
                isDark ? "border-white/10 bg-white/[0.03]" : "border-border/60 bg-muted/15"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Deal
                  </p>
                  <h2 className="mt-0.5 text-lg font-semibold leading-tight">
                    {applicationCardData.rows[0][1]}
                    <span className="ml-1.5 font-mono text-sm text-muted-foreground">
                      #{applicationCardData.subtitle}
                    </span>
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Balance remaining
                  </p>
                  <p className="text-3xl font-semibold tabular-nums tracking-tight text-[#ef5b2c]">
                    {formatCurrencyFull(balance)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">
                    Repaid{" "}
                    <span className="font-semibold text-foreground">
                      {formatCurrencyFull(repaidTowardPayback)}
                    </span>{" "}
                    of {formatCurrencyFull(paybackTotal)}
                  </span>
                  <span className="font-semibold tabular-nums">{formatPercent(paidPct)}</span>
                </div>
                <div
                  className={cn(
                    "mt-2 h-3 w-full overflow-hidden rounded-full",
                    isDark ? "bg-white/10" : "bg-muted"
                  )}
                >
                  <div
                    className="h-full rounded-full bg-[var(--brand)] transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, Number(paidPct) || 0))}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    <span className="font-semibold text-foreground">{creditCount}</span> paid
                  </span>
                  <span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {failedTxnCount}
                    </span>{" "}
                    failed
                  </span>
                  <span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {formatCurrencyFull(dueTodayAmount)}
                    </span>{" "}
                    due today
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {(
                  [
                    ["Funded", fundingLabels.advanceLabel],
                    ["Payback", fundingLabels.paybackLabel],
                    ["Repaid", formatCurrencyFull(repaidTowardPayback)],
                    ["Balance", formatCurrencyFull(balance)],
                  ] as const
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className={cn(
                      "rounded-lg border px-3 py-2.5",
                      isDark ? "border-white/10 bg-black/20" : "border-border/50 bg-background/70"
                    )}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {k}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced — the dense economics & terms, collapsed by default */}
            <details
              className={cn(
                "group mt-4 overflow-hidden rounded-xl border",
                isDark ? "border-white/10" : "border-border/60"
              )}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40">
                <span>Deal economics &amp; terms</span>
                <ChevronDown
                  className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="border-t border-border/60 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-stretch">
              {/** Shared card shell: flat, quiet border */}
              {(
                [
                  {
                    key: "app",
                    title: "Application",
                    subtitle: applicationCardData.subtitle,
                    body: (
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                        {applicationCardData.rows.map(([k, v]) => (
                          <div key={k} className="min-w-0">
                            <p className="text-xs text-muted-foreground">{k}</p>
                            <p className="mt-0.5 truncate font-medium leading-snug">
                              {v}
                            </p>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: "fund",
                    title: "Funding",
                    subtitle: dealView.offerDecision
                      ? `Offer: ${dealView.offerDecision}`
                      : "Advance & payback",
                    body: (
                      <div className="mt-3 grid grid-cols-2 gap-4">
                        {(
                          [
                            ["Advance", fundingLabels.advanceLabel],
                            ["Refinance", fundingLabels.refinanceLabel],
                            ["Factor", fundingLabels.factorLabel],
                            ["Payback", fundingLabels.paybackLabel],
                            [fundingLabels.frequencyLabel, fundingLabels.dailyLabel],
                          ] as const
                        ).map(([k, v]) => (
                          <div key={k}>
                            <p className="text-xs text-muted-foreground">{k}</p>
                            <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight">
                              {v}
                            </p>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: "due",
                    title: "Pending",
                    subtitle: "Still to collect",
                    accent: true as const,
                    body: (
                      <>
                        <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-[#ef5b2c]">
                          {formatCurrencyFull(balance)}
                        </p>
                        <p className="mt-3 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {creditCount}
                          </span>{" "}
                          paid
                          <span className="mx-2 text-foreground/25">·</span>
                          <span className="font-medium text-foreground">
                            {failedTxnCount}
                          </span>{" "}
                          failed
                          <span className="mx-2 text-foreground/25">·</span>
                          <span className="font-medium text-indigo-600 dark:text-indigo-400">
                            {debitTxnCount}
                          </span>{" "}
                          debited
                          <span className="mx-2 text-foreground/25">·</span>
                          <span className="font-medium text-amber-600 dark:text-amber-400">
                            {formatCurrencyFull(dueTodayAmount)}
                          </span>{" "}
                          due today
                        </p>
                        <div
                          className={cn(
                            "mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground",
                            isDark ? "border-white/10" : "border-border/60"
                          )}
                        >
                          <span>
                            Paid{" "}
                            <span className="font-medium text-foreground">
                              {formatCurrencyFull(paidAmount)}
                            </span>
                          </span>
                          <span>
                            Failed{" "}
                            <span className="font-medium text-foreground">
                              {formatCurrencyFull(failedAmount)}
                            </span>
                          </span>
                          <span>
                            Debited{" "}
                            <span className="font-medium text-indigo-600 dark:text-indigo-400">
                              {formatCurrencyFull(debitedAmount)}
                            </span>
                          </span>
                        </div>
                      </>
                    ),
                  },
                ] as const
              ).map((card) => (
                <div
                  key={card.key}
                  className={cn(
                    "flex h-full flex-col rounded-xl border p-4",
                    isDark
                      ? "border-white/10 bg-white/[0.03]"
                      : "border-border/50 bg-muted/20",
                    "accent" in card &&
                      card.accent &&
                      (isDark
                        ? "border-[#ef5b2c]/30 bg-[#ef5b2c]/[0.06]"
                        : "border-[#ef5b2c]/25 bg-[#ef5b2c]/[0.04]")
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{card.title}</h3>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium",
                        card.key === "app" && "font-mono",
                        card.key === "due"
                          ? "bg-[#ef5b2c]/15 text-[#ef5b2c]"
                          : isDark
                            ? "bg-white/10 text-foreground/80"
                            : "bg-background/80 text-muted-foreground"
                      )}
                    >
                      {card.key === "app"
                        ? card.subtitle
                        : card.key === "fund"
                          ? "Terms"
                          : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {card.key === "app" ? "Deal profile" : card.subtitle}
                  </p>
                  {card.body}
                </div>
              ))}
            </div>

            {/* Deal economics — net funding, repayment progress, balances */}
            <div
              className={cn(
                "mt-5 rounded-xl border px-4 py-4 sm:px-5",
                isDark ? "border-white/10 bg-white/[0.03]" : "border-border/60 bg-muted/15"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Deal economics
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openEconomicsDialog}
                  disabled={!primaryApplicationId && !applicationDealId}
                  className="h-8 cursor-pointer gap-1.5 px-3 text-xs"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit fees &amp; commission
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-9">
                {(
                  [
                    {
                      key: "net",
                      label: "Net funding",
                      value: formatCurrencyFull(netFunding),
                    },
                    {
                      key: "fees",
                      label: "Fees",
                      value: formatCurrencyFull(fundingLabels.feesAmount ?? 0),
                      highlight: true as const,
                    },
                    {
                      key: "commission",
                      label: "Commission",
                      value: formatCurrencyFull(fundingLabels.commissionAmount ?? 0),
                      highlight: true as const,
                    },
                    {
                      key: "repaid",
                      label: "Repaid",
                      value: formatCurrencyFull(repaidTowardPayback),
                    },
                    {
                      key: "pct",
                      label: "Paid %",
                      value: formatPercent(paidPct),
                    },
                    {
                      key: "bal",
                      label: "Balance",
                      value: formatCurrencyFull(balance),
                    },
                    {
                      key: "overpaid",
                      label: "OverPaid",
                      value: formatCurrencyFull(overPaid),
                    },
                    {
                      key: "above",
                      label: "Above principal",
                      value: formatCurrencyFull(abovePrincipal),
                    },
                    {
                      key: "already",
                      label: "Already net",
                      value: formatCurrencyFull(alreadyNet),
                    },
                  ] as const
                ).map((cell) => (
                  <div
                    key={cell.key}
                    className={cn(
                      "rounded-lg border px-3 py-2.5",
                      isDark ? "border-white/10 bg-black/20" : "border-border/50 bg-background/60",
                      "highlight" in cell &&
                        cell.highlight &&
                        (isDark
                          ? "border-[var(--brand)]/40 bg-[var(--brand)]/[0.08]"
                          : "border-[var(--brand)]/30 bg-[var(--brand)]/[0.05]")
                    )}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {cell.label}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-lg font-semibold tabular-nums tracking-tight",
                        cell.key === "above" &&
                          (abovePrincipal < -0.005
                            ? "text-red-600 dark:text-red-400"
                            : "text-emerald-600 dark:text-emerald-400"),
                      )}
                    >
                      {cell.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
              </div>
            </details>

            {/* Section switcher — segmented tabs */}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div
                role="tablist"
                aria-label="Collections section"
                className={cn(
                  "inline-flex h-10 w-full max-w-md rounded-xl p-1 sm:w-auto",
                  isDark
                    ? "border border-white/10 bg-white/[0.04]"
                    : "border border-border/70 bg-muted/50"
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSection === "schedule"}
                  onClick={() => setActiveSection("schedule")}
                  className={cn(
                    "flex-1 cursor-pointer rounded-lg px-4 text-xs font-semibold uppercase tracking-wide transition-all sm:flex-none sm:px-5 sm:text-[13px] sm:normal-case sm:tracking-normal",
                    activeSection === "schedule"
                      ? "bg-[var(--brand)] text-white shadow-sm"
                      : isDark
                        ? "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                        : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  )}
                >
                  Payment schedule
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSection === "notes"}
                  onClick={() => setActiveSection("notes")}
                  className={cn(
                    "flex-1 cursor-pointer rounded-lg px-4 text-xs font-semibold uppercase tracking-wide transition-all sm:flex-none sm:px-5 sm:text-[13px] sm:normal-case sm:tracking-normal",
                    activeSection === "notes"
                      ? "bg-[var(--brand)] text-white shadow-sm"
                      : isDark
                        ? "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                        : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  )}
                >
                  Notes
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            {activeSection === "schedule" && (
              <>
                <PaymentScheduletab
                  schedules={schedules}
                  selectedAcct={selectedAcct}
                  applicationDealId={applicationDealId}
                  isRowsLoading={collectionPaymentsLoading && collectionRows.length === 0}
                  isDark={isDark}
                  onCreatePayment={handleCreatePayment}
                  onUpdatePayment={handleEditPayment}
                  onDeletePayment={handleDeletePayment}
                />
              </>
            )}

            {activeSection === "notes" && (
              <div
                className={cn(
                  "rounded-2xl border p-5",
                  isDark ? "border-white/10 bg-white/5" : "border-border/60 bg-white/70"
                )}
              >
                <NotesTransaction applicationId={primaryApplicationId} />
              </div>
            )}
          </div>
        </div>

      </div>

      <Dialog
        open={isEconomicsDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!isSavingEconomics) setIsEconomicsDialogOpen(open);
        }}
      >
        <DialogContent className="payment-module sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit fees &amp; commission</DialogTitle>
            <DialogDescription>
              Update the deal&rsquo;s fees and commission. Saved values feed Net funding,
              Already net, and Above principal across the deal economics.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="deal-fees-input" className="text-xs font-medium">
                Fees ($)
              </Label>
              <Input
                id="deal-fees-input"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={feesInput}
                onChange={(e) => setFeesInput(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="deal-commission-input" className="text-xs font-medium">
                Commission ($)
              </Label>
              <Input
                id="deal-commission-input"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={commissionInput}
                onChange={(e) => setCommissionInput(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEconomicsDialogOpen(false)}
              disabled={isSavingEconomics}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveEconomics}
              disabled={isSavingEconomics}
              className="bg-[var(--brand)] text-white hover:bg-[#1f598a]"
            >
              {isSavingEconomics ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
