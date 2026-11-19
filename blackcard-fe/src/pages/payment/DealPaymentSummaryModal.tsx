import { useEffect, useMemo, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  CheckCircle2,
  Clock,
  Loader2,
  PieChart,
  TrendingUp,
  XCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
} from "recharts";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrencyFull } from "@/lib/utils";
import { getCollectionPayments } from "@/redux/actions/collectionPaymentActions";
import type { AppDispatch, RootState } from "@/redux/store";
import type { CollectionPayment } from "@/types/collectionPaymentTypes";

/** Platform primary — var(--brand) */
const PLATFORM = "var(--brand)";
/** Paid segment — lighter sky blue (positive, on-brand) */
const BLUE_PAID = "#3FA3D6";
/** Failed / at-risk — deeper navy (distinct but still blue family) */
const BLUE_FAILED = "#1A5376";
/** Pending — steel / muted blue */
const BLUE_PENDING = "#6B9CBD";

function isPendingFutureStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "scheduled" || s === "due_today" || s === "upcoming";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prisma application id (UUID) */
  applicationId: string;
  dealId: string | null;
  /** Display label — e.g. BA1234 */
  dealLabel?: string;
};

export function DealPaymentSummaryModal({
  open,
  onOpenChange,
  applicationId,
  dealId,
  dealLabel,
}: Props) {
  const dispatch = useDispatch<AppDispatch>();

  const dealIdTrim = dealId?.trim() ?? "";
  const appIdTrim = applicationId.trim();
  const lookupKey = dealIdTrim || appIdTrim;

  const collectionLoading = useSelector(
    (s: RootState) => s.collectionPayments.loading,
  );
  const collectionError = useSelector(
    (s: RootState) => s.collectionPayments.error,
  );
  const paymentsByKey = useSelector(
    (s: RootState) => s.collectionPayments.data,
  );
  const dealView = useSelector((s: RootState) =>
    lookupKey ? s.collectionPayments.dealViewByKey[lookupKey] ?? null : null,
  );

  const rows: CollectionPayment[] = useMemo(() => {
    if (!lookupKey) return [];
    let out = paymentsByKey[lookupKey] ?? [];
    if (!out.length && appIdTrim) out = paymentsByKey[appIdTrim] ?? [];
    return Array.isArray(out) ? out : [];
  }, [paymentsByKey, lookupKey, appIdTrim]);

  useEffect(() => {
    if (!open || !appIdTrim) return;
    void dispatch(
      getCollectionPayments({
        applicationId: appIdTrim,
        dealId: dealIdTrim || undefined,
        includeDealView: true,
      }),
    );
  }, [dispatch, open, appIdTrim, dealIdTrim]);

  const pendingCount = useMemo(
    () => rows.filter((r) => isPendingFutureStatus(r.status)).length,
    [rows],
  );

  const paidCount = dealView?.repayment.creditCount ?? 0;
  const failedCount = dealView?.repayment.failedTxnCount ?? 0;
  const paidAmount = dealView?.repayment.paidAmount ?? 0;
  const failedAmount = dealView?.repayment.failedAmount ?? 0;
  const pendingAmount = dealView?.repayment.pendingAmount ?? 0;
  const paidPct = dealView?.repayment.paidPct ?? null;

  const breakdownTotal = paidCount + failedCount + pendingCount;

  const pieData = useMemo(() => {
    const data = [
      {
        name: "Paid",
        value: paidCount,
        amount: paidAmount,
        fill: BLUE_PAID,
      },
      {
        name: "Failed",
        value: failedCount,
        amount: failedAmount,
        fill: BLUE_FAILED,
      },
      {
        name: "Pending",
        value: pendingCount,
        amount: pendingAmount,
        fill: BLUE_PENDING,
      },
    ];
    return data.filter((d) => d.value > 0);
  }, [paidCount, failedCount, pendingCount, paidAmount, failedAmount, pendingAmount]);

  const pieSlicesTotal = useMemo(
    () => pieData.reduce((sum, d) => sum + d.value, 0),
    [pieData],
  );

  const showLoading = open && collectionLoading && !dealView;
  const showError =
    open && !collectionLoading && !dealView && (collectionError || !appIdTrim);

  const recoveryPctLabel =
    paidPct != null && Number.isFinite(paidPct)
      ? `${paidPct.toFixed(1)}%`
      : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] max-w-[min(100vw-1.5rem,52rem)] overflow-hidden rounded-3xl border border-border/70 bg-background p-0 shadow-2xl sm:rounded-3xl dark:border-white/12 dark:bg-gradient-to-b dark:from-slate-950 dark:to-card"
      >
        <div
          className="h-[3px] w-full shrink-0 bg-gradient-to-r from-transparent via-[var(--brand)] to-transparent opacity-95 dark:via-sky-500/90"
          aria-hidden
        />
        <DialogHeader className="space-y-3 border-b border-border/60 bg-gradient-to-br from-muted/35 via-transparent to-transparent px-6 pb-6 pt-5 text-left dark:from-[var(--brand)]/[0.07] dark:via-transparent">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              {/* <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brand)]/90 dark:text-sky-400/90">
                Collections
              </p> */}
              <DialogTitle className="flex flex-wrap items-center gap-x-4 gap-y-3 text-lg font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
                <span className="whitespace-nowrap">Payment summary</span>
                {dealLabel?.trim() || dealIdTrim ? (
                  <span className="inline-flex items-center gap-2.5 sm:border-l sm:border-border/50 sm:pl-5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-xs">
                      Deal ID
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[var(--brand)]/20 bg-[var(--brand)]/10 px-3 py-1.5 text-sm font-semibold tabular-nums leading-none text-[var(--brand)] dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300">
                      {dealLabel?.trim() || dealIdTrim}
                    </span>
                  </span>
                ) : null}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Payment summary and status breakdown for deal{" "}
                {dealLabel?.trim() || dealIdTrim || "this application"}.
              </DialogDescription>
            </div>
            <div
              className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--brand)]/15 bg-[var(--brand)]/[0.08] shadow-inner sm:flex dark:border-sky-500/15 dark:bg-sky-500/10"
              aria-hidden
            >
              <PieChart className="size-7 text-[var(--brand)] dark:text-sky-400" strokeWidth={1.75} />
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(90vh-8rem)] space-y-6 overflow-y-auto overscroll-contain px-6 py-6">
          {showLoading ? (
            <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-[var(--brand)]/20 bg-muted/20 py-16 dark:border-sky-500/20">
              <Loader2
                className="size-12 animate-spin text-[var(--brand)] dark:text-sky-400"
                aria-hidden
              />
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Loading payment stats</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Aggregating repayment and schedule data…
                </p>
              </div>
            </div>
          ) : showError ? (
            <div className="rounded-2xl border border-destructive/35 bg-gradient-to-br from-destructive/10 to-transparent px-5 py-8 text-center text-sm leading-relaxed text-destructive">
              {collectionError ||
                "Could not load deal payment summary. Try again later."}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryStatCard
                  title="Paid"
                  accent={BLUE_PAID}
                  accentSoft="bluePaid"
                  valueTone="bluePaid"
                  icon={
                    <CheckCircle2 className="size-[18px] text-[#2f8fc4] dark:text-sky-400" />
                  }
                  value={paidCount.toLocaleString("en-US")}
                  sub={<span>{formatCurrencyFull(paidAmount)} recovered</span>}
                />
                <SummaryStatCard
                  title="Failed"
                  accent={BLUE_FAILED}
                  accentSoft="blueFailed"
                  valueTone="blueFailed"
                  icon={
                    <XCircle className="size-[18px] text-[#1f5f85] dark:text-sky-500/90" />
                  }
                  value={failedCount.toLocaleString("en-US")}
                  sub={
                    <span>
                      {formatCurrencyFull(failedAmount)}{" "}
                      <span className="text-muted-foreground">at risk</span>
                    </span>
                  }
                />
                <SummaryStatCard
                  title="Pending"
                  accent={BLUE_PENDING}
                  accentSoft="bluePending"
                  valueTone="bluePending"
                  icon={
                    <Clock className="size-[18px] text-[#5a87ad] dark:text-sky-400/85" />
                  }
                  value={pendingCount.toLocaleString("en-US")}
                  sub={
                    <>
                      <p className="text-foreground/90">Awaiting debit</p>
                      {pendingAmount > 0 ? (
                        <p className="mt-1 text-muted-foreground">
                          {formatCurrencyFull(pendingAmount)}
                        </p>
                      ) : null}
                    </>
                  }
                />
                <SummaryStatCard
                  title="Recovery rate"
                  accent={PLATFORM}
                  accentSoft="sky"
                  valueTone="muted"
                  icon={
                    <TrendingUp className="size-[18px] text-[var(--brand)] dark:text-sky-400" />
                  }
                  value={recoveryPctLabel}
                  sub={
                    <span className="text-muted-foreground">
                      Across {breakdownTotal.toLocaleString("en-US")} payments in breakdown
                    </span>
                  }
                />
              </div>

              <section
                aria-labelledby="deal-payment-status-breakdown"
                className="overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-[0_8px_30px_-12px_rgba(39,109,156,0.18)] ring-1 ring-black/[0.03] dark:border-white/10 dark:bg-card/50 dark:ring-white/[0.05]"
              >
                <div className="border-b border-border/50 bg-gradient-to-r from-[var(--brand)]/[0.06] via-sky-500/[0.05] to-[var(--brand)]/[0.04] px-5 py-4 dark:from-[var(--brand)]/12 dark:via-sky-400/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3
                      id="deal-payment-status-breakdown"
                      className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground"
                    >
                      Status breakdown
                    </h3>
                    {pieSlicesTotal > 0 ? (
                      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                        {pieSlicesTotal.toLocaleString("en-US")} items charted
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  {pieData.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 py-14 text-center">
                      <PieChart className="mx-auto size-10 text-muted-foreground/45" aria-hidden />
                      <p className="mt-3 text-sm font-medium text-foreground">
                        Nothing to visualize yet
                      </p>
                      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                        No scheduled, paid, or failed payments in this breakdown. Open the deal
                        collections tab for full history.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:gap-12">
                      <div className="relative flex shrink-0 items-center justify-center">
                        <div
                          className="pointer-events-none absolute inset-0 m-auto size-[120px] rounded-full bg-gradient-to-br from-[var(--brand)]/14 via-transparent to-sky-400/15 blur-2xl dark:from-sky-500/18 dark:to-[var(--brand)]/20"
                          aria-hidden
                        />
                        <div className="relative h-[220px] w-[220px]">
                          <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center gap-0.5">
                            <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
                              {pieSlicesTotal.toLocaleString("en-US")}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              in chart
                            </span>
                          </div>
                          <div className="relative z-10 h-full w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <RePieChart>
                                <Pie
                                  data={pieData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={62}
                                  outerRadius={96}
                                  paddingAngle={2.5}
                                  cornerRadius={4}
                                  dataKey="value"
                                  strokeWidth={0}
                                >
                                  {pieData.map((entry) => (
                                    <Cell
                                      key={entry.name}
                                      fill={entry.fill}
                                      stroke="hsl(var(--background))"
                                      strokeWidth={2}
                                    />
                                  ))}
                                </Pie>
                              </RePieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      <div className="flex w-full min-w-0 flex-1 flex-col gap-2.5">
                        {pieData.map((row) => (
                          <div
                            key={row.name}
                            className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3.5 shadow-sm transition-all duration-200 hover:border-[var(--brand)]/25 hover:bg-muted/35 dark:bg-white/[0.03] dark:hover:border-sky-500/25"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className="size-3 shrink-0 rounded-full ring-2 ring-background shadow-sm dark:ring-card"
                                style={{
                                  backgroundColor: row.fill,
                                  boxShadow: `0 0 0 1px ${row.fill}40`,
                                }}
                                aria-hidden
                              />
                              <span className="text-[15px] font-semibold text-foreground">
                                {row.name}
                              </span>
                            </div>
                            <div className="min-w-0 text-left tabular-nums">
                              <span className="text-sm font-bold text-foreground">
                                {row.value.toLocaleString("en-US")}
                              </span>
                              <span className="mx-1.5 font-normal text-muted-foreground">·</span>
                              <span className="text-sm font-semibold text-muted-foreground">
                                {formatCurrencyFull(row.amount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStatCard({
  title,
  value,
  sub,
  accent,
  accentSoft,
  valueTone = "muted",
  icon,
}: {
  title: string;
  value: string;
  sub: ReactNode;
  accent: string;
  accentSoft: "bluePaid" | "blueFailed" | "bluePending" | "sky";
  valueTone?: "bluePaid" | "blueFailed" | "bluePending" | "muted";
  icon: ReactNode;
}) {
  const toneClass =
    valueTone === "bluePaid"
      ? "text-[#1e6a94] dark:text-sky-300"
      : valueTone === "blueFailed"
        ? "text-[#173e56] dark:text-sky-200/95"
        : valueTone === "bluePending"
          ? "text-[#4d6f8c] dark:text-sky-300/90"
          : "text-[var(--brand)] dark:text-sky-300";

  const softRing =
    accentSoft === "bluePaid"
      ? "bg-[#3FA3D6]/22 dark:bg-sky-400/14"
      : accentSoft === "blueFailed"
        ? "bg-[#1A5376]/18 dark:bg-sky-500/14"
        : accentSoft === "bluePending"
          ? "bg-[#6B9CBD]/22 dark:bg-sky-400/12"
          : "bg-[var(--brand)]/15 dark:bg-sky-500/15";

  return (
    <div className="group relative flex min-h-[142px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/95 p-4 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] transition-shadow duration-300 hover:border-[var(--brand)]/22 hover:shadow-[0_8px_24px_-8px_rgba(39,109,156,0.2)] dark:border-white/[0.08] dark:bg-gradient-to-br dark:from-card dark:to-muted/40 dark:hover:border-sky-500/22">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.14),transparent_55%)] opacity-70 dark:bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.05),transparent_52%)]"
        aria-hidden
      />
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <p className="max-w-[9rem] text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {title}
          </p>
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl border border-transparent ${softRing}`}
          >
            {icon}
          </span>
        </div>
        <p
          className={`mt-3 text-[1.85rem] font-bold tabular-nums leading-none tracking-tight ${toneClass}`}
        >
          {value}
        </p>
        <div className="mt-auto space-y-0.5 pt-3 text-xs leading-snug text-foreground/90 [&_.text-muted-foreground]:text-muted-foreground">
          {sub}
        </div>
        <div
          className="mt-4 h-1 w-full shrink-0 rounded-full opacity-95 transition-opacity group-hover:opacity-100"
          style={{
            background: `linear-gradient(90deg, ${accent}aa, ${accent})`,
          }}
          aria-hidden
        />
      </div>
    </div>
  );
}
