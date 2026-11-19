import { Fragment } from "react";
import { CheckCircle2, Info, RefreshCw } from "lucide-react";
import { cn, formatDateTimeUS } from "@/lib/utils";

export type DocuSignSigningStatusStep = {
    key: string;
    label: string;
    hint: string;
};

export const DEFAULT_DOCUSIGN_SIGNING_STEPS: DocuSignSigningStatusStep[] = [
    { key: "SENT", label: "Sent", hint: "Envelope sent" },
    { key: "VIEWED", label: "Viewed", hint: "Signer opened" },
    { key: "SIGNED", label: "Signed", hint: "Signature captured" },
    { key: "COMPLETED", label: "Completed", hint: "All done" },
];

export type DocuSignSigningStatusPanelProps = {
    title: string;
    description: string;
    statusLabel: string;
    badgeClassName?: string;
    steps?: DocuSignSigningStatusStep[];
    activeIndex: number;
    isTerminal?: boolean;
    terminalMessage?: string;
    onRefresh?: () => void;
    refreshing?: boolean;
    refreshDisabled?: boolean;
    lastCheckedAt?: Date | null;
    crmUpdatedAt?: string | null;
    refreshInHeader?: boolean;
};

export function DocuSignSigningStatusPanel({
    title,
    description,
    statusLabel,
    badgeClassName = "bg-[var(--brand)]/12 text-[var(--brand)]",
    steps = DEFAULT_DOCUSIGN_SIGNING_STEPS,
    activeIndex,
    isTerminal = false,
    terminalMessage,
    onRefresh,
    refreshing = false,
    refreshDisabled = false,
    lastCheckedAt = null,
    crmUpdatedAt = null,
    refreshInHeader = false,
}: DocuSignSigningStatusPanelProps) {
    const refreshControl = onRefresh ? (
        <button
            type="button"
            aria-label={refreshing ? "Refreshing status" : "Refresh status"}
            disabled={refreshDisabled || refreshing}
            onClick={onRefresh}
            className={cn(
                refreshInHeader
                    ? "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    : "inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10 disabled:cursor-not-allowed disabled:opacity-60",
            )}
        >
            <RefreshCw
                className={cn(
                    refreshInHeader ? "h-3.5 w-3.5" : "h-3.5 w-3.5",
                    refreshing && "animate-spin",
                )}
                aria-hidden
            />
            {refreshInHeader ? "Refresh" : null}
        </button>
    ) : null;

    return (
        <div className="rounded-2xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
                        <Info className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                            {title}
                        </h3>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                            {description}
                        </p>
                    </div>
                </div>
                {refreshInHeader ? refreshControl : null}
            </div>

            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={cn(
                            "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                            badgeClassName,
                        )}
                    >
                        {statusLabel}
                    </span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="flex items-start">
                        {steps.map((step, index) => {
                            const isDone = activeIndex >= index;
                            const isCurrent = activeIndex === index;
                            return (
                                <Fragment key={step.key}>
                                    <div className="flex min-w-[70px] flex-1 flex-col items-center text-center">
                                        <div
                                            className={cn(
                                                "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                                                isDone
                                                    ? "border-[var(--brand)] bg-[image:var(--brand-gradient)] text-white shadow-sm shadow-[var(--brand)]/25"
                                                    : "border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-950",
                                            )}
                                        >
                                            {isDone ? (
                                                <CheckCircle2 className="h-4 w-4" aria-hidden />
                                            ) : (
                                                index + 1
                                            )}
                                        </div>
                                        <div className="mt-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                            {step.label}
                                        </div>
                                        <div
                                            className={cn(
                                                "mt-0.5 text-[10px] leading-snug",
                                                isCurrent
                                                    ? "text-[var(--brand)]"
                                                    : "text-slate-400",
                                            )}
                                        >
                                            {step.hint}
                                        </div>
                                    </div>
                                    {index < steps.length - 1 ? (
                                        <div
                                            className={cn(
                                                "mt-4 h-0.5 w-8 shrink-0 rounded-full",
                                                activeIndex > index
                                                    ? "bg-[image:var(--brand-gradient)]"
                                                    : "bg-slate-200 dark:bg-slate-700",
                                            )}
                                        />
                                    ) : null}
                                </Fragment>
                            );
                        })}
                    </div>
                    {isTerminal && terminalMessage ? (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                            {terminalMessage}
                        </div>
                    ) : null}
                </div>
            </div>

            {onRefresh && !refreshInHeader ? (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {refreshControl}
                    <span>
                        Last checked:{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                            {lastCheckedAt
                                ? formatDateTimeUS(lastCheckedAt.toISOString(), "Not yet")
                                : "Not yet"}
                        </span>
                        {crmUpdatedAt && String(crmUpdatedAt).trim() !== "" ? (
                            <>
                                {" "}
                                · CRM record updated{" "}
                                {formatDateTimeUS(String(crmUpdatedAt), "")}
                            </>
                        ) : null}
                    </span>
                </p>
            ) : null}
        </div>
    );
}
