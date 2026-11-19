import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  applyDuplicateDecision,
  getApplicationDuplicates,
  type DuplicateApplication,
} from "@/redux/actions/applicationDedupeActions";
import { clearDedupe } from "@/redux/slices/dedupeSlice";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  formatScrubberRecommendationBadgeLabel,
  parseScrubberDeclineReasons,
} from "@/lib/scrubberDeclineReasons";

function duplicateApplicationHref(dup: DuplicateApplication): string | null {
  if (dup.applicationId != null && String(dup.applicationId).trim() !== "") {
    return `/application-details/${dup.applicationId}`;
  }
  if (dup.id) return `/application-details/${dup.id}`;
  return null;
}

function formatMoney(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return formatCurrency(value);
}

function formatPlain(value: unknown): string {
  if (value == null || String(value).trim() === "") return "—";
  return String(value);
}

type DecisionTone = "approved" | "rejected" | "pending" | "neutral";

function classifyDecisionTone(value: unknown): DecisionTone {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return "neutral";
  if (/\b(declin|reject|deny|denied|turn\s*down)\b/.test(s)) return "rejected";
  if (/\b(approv|accept|fund)\b/.test(s)) return "approved";
  if (/\b(pend|review|hold|defer|wait|consider)\b/.test(s)) return "pending";
  return "neutral";
}

const DECISION_TONE_STYLES: Record<
  DecisionTone,
  { dialog: string; banner: string; chip: string; row: string; label: string }
> = {
  approved: {
    dialog: "border-emerald-500 dark:border-emerald-600",
    banner: "bg-emerald-600 text-white dark:bg-emerald-700",
    chip: "inline-flex rounded-full bg-emerald-600 px-2.5 py-0.5 text-sm font-semibold text-white",
    row: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50",
    label: "Approved",
  },
  rejected: {
    dialog: "border-red-500 dark:border-red-600",
    banner: "bg-red-600 text-white dark:bg-red-700",
    chip: "inline-flex rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-semibold text-white",
    row: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/50",
    label: "Rejected",
  },
  pending: {
    dialog: "border-amber-500 dark:border-amber-600",
    banner: "bg-amber-500 text-white dark:bg-amber-600",
    chip: "inline-flex rounded-full bg-amber-500 px-2.5 py-0.5 text-sm font-semibold text-white",
    row: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50",
    label: "Pending",
  },
  neutral: {
    dialog: "",
    banner: "bg-slate-600 text-white dark:bg-slate-700",
    chip: "inline-flex rounded-full bg-slate-600 px-2.5 py-0.5 text-sm font-semibold text-white",
    row: "border-border/50 bg-muted/30",
    label: "Decision",
  },
};

/**
 * The decision recorded on a duplicate, shown inline under its row (replaces
 * the old View Decision modal): status banner, offer terms, reasons, notes and
 * the Open / Apply actions.
 */
function InlineDecisionPanel({
  dup,
  canApply,
  isApplying,
  onApply,
  onOpen,
}: {
  dup: DuplicateApplication;
  canApply: boolean;
  isApplying: boolean;
  onApply: (e: React.MouseEvent) => void;
  onOpen: (() => void) | null;
}) {
  const decisionText = dup.decision ?? dup.currentDecision;
  const tone = classifyDecisionTone(decisionText);
  const styles = DECISION_TONE_STYLES[tone];
  // The API resolves reasons across all their storage locations; fall back to
  // parsing the recommendation locally for an older backend that omits them.
  const declineReasons =
    dup.declineReasons && dup.declineReasons.length > 0
      ? dup.declineReasons
      : parseScrubberDeclineReasons(dup.scrubberRecommendation);
  const recommendationBadge = formatScrubberRecommendationBadgeLabel(
    dup.scrubberRecommendation,
  );
  const tags = [
    ...(recommendationBadge ? [`Scrubber: ${recommendationBadge}`] : []),
    ...(dup.underwriterAction ? [`Underwriter: ${String(dup.underwriterAction).trim()}`] : []),
    ...declineReasons,
    ...(declineReasons.length === 0 && dup.declineReason ? [String(dup.declineReason).trim()] : []),
  ];
  const term = formatPlain(dup.term);
  const frequency = formatPlain(dup.frequency);
  const mainTerms = [
    { label: "Offer", value: formatMoney(dup.offerAmount ?? null) },
    { label: "Factor rate", value: formatPlain(dup.rate) },
    {
      label: "Term",
      value: term !== "—" && frequency !== "—" ? `${term} (${frequency})` : term,
    },
    { label: "Repay / period", value: formatMoney(dup.repayPerPeriod ?? null) },
    { label: "Our remit", value: formatMoney(dup.ourRemit ?? null) },
    { label: "Total remit", value: formatMoney(dup.totalRemit ?? null) },
  ];
  const moreTerms = [
    { label: "Position", value: formatPlain(dup.position) },
    { label: "Monthly payment", value: formatMoney(dup.monthlyPayment ?? null) },
    { label: "Fees", value: formatPlain(dup.fees) },
    { label: "Refinance amount", value: formatMoney(dup.refinanceAmount ?? null) },
  ].filter((t) => t.value !== "—");

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3",
          styles.row,
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className={styles.chip}>{styles.label}</span>
          <span className="text-sm font-semibold text-foreground">
            Decision on #{dup.applicationId ?? "—"}
          </span>
          {decisionText ? (
            <span className="text-sm text-muted-foreground">{String(decisionText).trim()}</span>
          ) : null}
        </div>
        {dup.businessName ? (
          <span className="text-xs text-muted-foreground">{dup.businessName}</span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {mainTerms.map((t) => (
          <div key={t.label} className="border-b border-r border-border/40 px-5 py-3">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t.label}
            </dt>
            <dd className="mt-0.5 text-base font-semibold text-foreground">{t.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-6 px-5 py-4">
        {moreTerms.length > 0 ? (
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {moreTerms.map((t) => (
              <div key={t.label}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t.label}
                </dt>
                <dd className="text-sm text-foreground">{t.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {tags.length > 0 ? (
          <div className="min-w-[240px] flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Reasons &amp; recommendation
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {formatPlain(dup.notes) !== "—" ? (
          <div className="min-w-[280px] flex-[2]">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
              {formatPlain(dup.notes)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-5 py-3">
        <span className="text-xs text-muted-foreground">
          {canApply
            ? "Apply copies this offer, bank analysis, positions and additional info onto the current deal."
            : "This decision has no offer terms behind it, so it cannot be applied."}
        </span>
        <div className="flex gap-2">
          {onOpen ? (
            <button
              type="button"
              data-row-click-ignore
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Open deal #{dup.applicationId ?? ""}
            </button>
          ) : null}
          {canApply ? (
            <button
              type="button"
              data-row-click-ignore
              disabled={isApplying}
              onClick={onApply}
              className="rounded-md bg-[var(--brand,#1e3a5f)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {isApplying ? "Applying…" : "Apply this decision"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type ApplicationSheetDedupeProps = {
  applicationId: string;
  /** Close the sheet when navigating to another application (optional). */
  onNavigateAway?: () => void;
  /** Called after a prior deal's decision is applied to the current application. */
  onDecisionApplied?: () => void;
};

export default function ApplicationSheetDudep({
  applicationId,
  onNavigateAway,
  onDecisionApplied,
}: ApplicationSheetDedupeProps) {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { data, loading, error } = useSelector((state: RootState) => state.applicationDedupe);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  /** Row whose decision is expanded inline under it. */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) return;
    dispatch(clearDedupe());
    dispatch(getApplicationDuplicates(applicationId));
  }, [applicationId, dispatch]);

  const isForbidden = error?.toLowerCase().includes("forbidden");

  const openDuplicateDeal = (dup: DuplicateApplication) => {
    const href = duplicateApplicationHref(dup);
    if (!href) return;
    onNavigateAway?.();
    navigate(href);
  };

  const handleApplyDecision = async (dup: DuplicateApplication, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!dup.hasDecision && !dup.decision) {
      toast.error("This application has no offer decision to apply.");
      return;
    }
    const label =
      dup.applicationId != null ? `#${dup.applicationId}` : dup.businessName || "this deal";
    if (
      !window.confirm(
        `Apply the offer decision from ${label} to this application? This will overwrite the current offer decision.`,
      )
    ) {
      return;
    }

    setApplyingId(dup.id);
    try {
      const result = await dispatch(
        applyDuplicateDecision({
          applicationId,
          sourceApplicationId: dup.id,
        }),
      ).unwrap();
      toast.success(result?.message || "Decision applied successfully.");
      setExpandedId(null);
      onDecisionApplied?.();
      dispatch(getApplicationDuplicates(applicationId));
    } catch (err: any) {
      toast.error(typeof err === "string" ? err : err?.message || "Failed to apply decision");
    } finally {
      setApplyingId(null);
    }
  };

  if (isForbidden) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Dupes view is only visible to Scrubbing and Admins.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {loading && <p className="text-sm text-muted-foreground">Checking for duplicate applications...</p>}
      {!loading && !error && data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No prior applications found with the same EIN or SSN.
        </p>
      )}
      {error && !loading && !isForbidden && (
        <p className="text-sm text-red-500">Failed to load duplicate applications: {error}</p>
      )}

      {data.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              This application matches prior deals by EIN or SSN.
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Duplicate Applications History
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/60 bg-secondary/30">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left">Submission ID</th>
                  <th className="px-4 py-2 text-left">Business Name</th>
                  <th className="px-4 py-2 text-left">Agent</th>
                  <th className="px-4 py-2 text-left">EIN</th>
                  <th className="px-4 py-2 text-left">SSN</th>
                  <th className="px-4 py-2 text-left">Match With</th>
                  <th className="px-4 py-2 text-left">Date Submitted</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Funded Amount</th>
                  <th className="px-4 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.map((dup) => {
                  const navigable = duplicateApplicationHref(dup) != null;
                  // Applying copies OfferDecision fields across, so it still
                  // requires a real offer decision. Viewing is read-only, so it
                  // opens for a decision from any stage — an underwriter decline
                  // is exactly what someone checking a duplicate needs to see.
                  const canApply = !!(dup.hasDecision || dup.decision);
                  const canView = canApply || !!dup.currentDecision;
                  const isApplying = applyingId === dup.id;
                  const isExpanded = expandedId === dup.id;
                  return (
                    <Fragment key={dup.id}>
                    <tr
                      className={cn(
                        "border-t border-border/40 transition-colors hover:bg-secondary/40",
                        navigable && "cursor-pointer group"
                      )}
                      tabIndex={navigable ? 0 : undefined}
                      onClick={navigable ? () => openDuplicateDeal(dup) : undefined}
                      onKeyDown={
                        navigable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openDuplicateDeal(dup);
                              }
                            }
                          : undefined
                      }
                    >
                      <td className="px-4 py-2 font-mono text-xs text-foreground/80">
                        {navigable ? (
                          <span className="text-primary underline-offset-2 group-hover:underline font-mono text-xs">
                            {dup.applicationId != null
                              ? String(dup.applicationId)
                              : "Open"}
                          </span>
                        ) : (
                          (dup.applicationId ?? "-")
                        )}
                      </td>
                      <td className="px-4 py-2">{dup.businessName || "-"}</td>
                      <td className="px-4 py-2">{dup.agentName || "-"}</td>
                      <td className="px-4 py-2">{dup.businessEinNumber || "-"}</td>
                      <td className="px-4 py-2">{dup.ownerSsn || "-"}</td>
                      <td className="px-4 py-2">
                        {dup.matchWith && dup.matchWith.length > 0 ? dup.matchWith.join(", ") : "-"}
                      </td>
                      <td className="px-4 py-2">
                        {formatDate(dup.submittedAt, "—")}
                      </td>
                      <td className="px-4 py-2">{dup.status}</td>
                      <td className="px-4 py-2 text-left">
                        {typeof dup.fundedAmount === "number"
                          ? formatCurrency(dup.fundedAmount)
                          : "-"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            data-row-click-ignore
                            disabled={!canView}
                            title={
                              canView
                                ? "Preview the decision recorded on this deal"
                                : "No decision recorded on this application"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (!canView) return;
                              setExpandedId(isExpanded ? null : dup.id);
                            }}
                            aria-expanded={isExpanded}
                            className={cn(
                              "whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                              canView
                                ? "border-[var(--brand,#1e3a5f)] bg-background text-[var(--brand,#1e3a5f)] hover:bg-muted"
                                : "cursor-not-allowed border-border bg-muted text-muted-foreground"
                            )}
                          >
                            {isExpanded ? "Hide" : "View Decision"}
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              className={cn("ml-1 inline h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            data-row-click-ignore
                            disabled={!canApply || isApplying}
                            title={
                              canApply
                                ? "Copy this deal's offer decision onto the current application"
                                : "No offer decision on this application"
                            }
                            onClick={(e) => void handleApplyDecision(dup, e)}
                            className={cn(
                              "whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                              canApply
                                ? "bg-[var(--brand,#1e3a5f)] text-white hover:opacity-90 disabled:opacity-60"
                                : "cursor-not-allowed bg-muted text-muted-foreground"
                            )}
                          >
                            {isApplying ? "Applying…" : "Apply Decision"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="bg-secondary/20">
                        <td colSpan={11} className="px-4 pb-4 pt-1">
                          <InlineDecisionPanel
                            dup={dup}
                            canApply={canApply}
                            isApplying={isApplying}
                            onApply={(e) => void handleApplyDecision(dup, e)}
                            onOpen={navigable ? () => openDuplicateDeal(dup) : null}
                          />
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
