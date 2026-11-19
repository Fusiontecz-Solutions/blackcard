import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { useDispatch } from "react-redux";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UsCurrencyInput } from "@/components/ui/us-currency-input";
import { axiosGet } from "@/redux/axios";
import { formatCurrencyFull, cn } from "@/lib/utils";
import type { AppDispatch } from "@/redux/store";
import {
    buildEmptySpaPaymentRows,
    buildEmptySpaRevenueRows,
    buildSpaCalculationBreakdown,
    computeSpaBreakdownFromRows,
    SPA_AVG_REVENUE_MONTH_WINDOW,
    type SpaMonthlyPaymentRow,
    type SpaMonthlyRevenueRow,
} from "@/lib/scrubbingSpecifiedPercent";
import {
    persistSpaEditsToScrubber,
    type SpaBankApiRecord,
} from "./spaScrubberSync";

type SpaCalculationModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    applicationUuid?: string | null;
    offerDecision?: Record<string, unknown> | null;
    saving?: boolean;
    onApply: (spa: string) => void | Promise<void>;
};

const SECTION_LABEL_CLASS =
    "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const MONEY_INPUT_CLASS = "h-8 w-full min-w-[7rem] text-right tabular-nums";

function parseInputMoney(value: string): number {
    const cleaned = value.replace(/[$,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
}

function formatMoneyInputValue(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return "";
    return formatCurrencyFull(value).replace(/^\$\s?/, "$");
}

function paymentRowKey(row: SpaMonthlyPaymentRow, index: number): string {
    if (row.source === "positions_total") return "positions:total";
    return `position:${row.positionId ?? `${row.label}:${index}`}`;
}

async function fetchSpaSourceData(
    applicationUuid: string,
): Promise<{
    banks: SpaBankApiRecord[];
    breakdown: ReturnType<typeof buildSpaCalculationBreakdown>;
}> {
    const [banksResp, positionsResp] = await Promise.all([
        axiosGet(
            `/bank-analysis?${new URLSearchParams({ application: applicationUuid }).toString()}`,
        ),
        axiosGet(
            `/positions?${new URLSearchParams({ application: applicationUuid }).toString()}`,
        ),
    ]);
    const banksRaw =
        (banksResp as { data?: { data?: unknown } })?.data?.data ??
        (banksResp as { data?: unknown })?.data;
    const banks = Array.isArray(banksRaw) ? (banksRaw as SpaBankApiRecord[]) : [];
    const positionsRaw =
        (positionsResp as { data?: { data?: unknown } })?.data?.data ??
        (positionsResp as { data?: unknown })?.data;
    const positions = Array.isArray(positionsRaw) ? positionsRaw : [];

    const breakdown = buildSpaCalculationBreakdown({
        banks: banks as Array<{ rows?: Array<Record<string, unknown>> }>,
        positions: positions as Array<Record<string, unknown>>,
    });

    return { banks, breakdown };
}

export function SpaCalculationModal({
    open,
    onOpenChange,
    applicationUuid,
    offerDecision,
    saving = false,
    onApply,
}: SpaCalculationModalProps) {
    const dispatch = useDispatch<AppDispatch>();
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [sourceBanks, setSourceBanks] = useState<SpaBankApiRecord[]>([]);
    const [paymentRows, setPaymentRows] = useState<SpaMonthlyPaymentRow[]>([]);
    const [revenueRows, setRevenueRows] = useState<SpaMonthlyRevenueRow[]>([]);
    const [initialPaymentRows, setInitialPaymentRows] = useState<SpaMonthlyPaymentRow[]>([]);
    const [initialRevenueRows, setInitialRevenueRows] = useState<SpaMonthlyRevenueRow[]>([]);
    const [paymentInputs, setPaymentInputs] = useState<Record<string, string>>({});
    const [revenueInputs, setRevenueInputs] = useState<Record<string, string>>({});
    const [monthsUsedForAverage, setMonthsUsedForAverage] = useState<string[]>([]);

    const [syncing, setSyncing] = useState(false);

    const appKey = String(applicationUuid ?? "").trim();

    const reloadBreakdown = useCallback(async () => {
        if (!appKey) {
            setLoadError("Application id is required.");
            setPaymentRows([]);
            setRevenueRows([]);
            return;
        }
        setLoading(true);
        setLoadError(null);
        try {
            const { banks, breakdown } = await fetchSpaSourceData(appKey);
            setSourceBanks(banks);

            // Allow entry when scrubber is empty; values sync back on Calculate & sync.
            const payments =
                breakdown.monthlyPayments.length > 0
                    ? breakdown.monthlyPayments
                    : buildEmptySpaPaymentRows();
            const revenues =
                breakdown.monthlyRevenues.length > 0
                    ? breakdown.monthlyRevenues
                    : buildEmptySpaRevenueRows();
            const monthsUsed =
                breakdown.monthsUsedForAverage.length > 0
                    ? breakdown.monthsUsedForAverage
                    : revenues
                          .filter((row) => row.includedInSpaAverage)
                          .map((row) => row.month);

            setPaymentRows(payments);
            setRevenueRows(revenues);
            setInitialPaymentRows(payments.map((row) => ({ ...row })));
            setInitialRevenueRows(
                revenues.map((row) => ({
                    ...row,
                    bankContributions: row.bankContributions?.map((c) => ({ ...c })),
                })),
            );
            setMonthsUsedForAverage(monthsUsed);
            const nextPaymentInputs: Record<string, string> = {};
            payments.forEach((row, index) => {
                nextPaymentInputs[paymentRowKey(row, index)] =
                    formatMoneyInputValue(row.amount);
            });
            const nextRevenueInputs: Record<string, string> = {};
            revenues.forEach((row) => {
                nextRevenueInputs[row.month] = formatMoneyInputValue(row.netCredit);
            });
            setPaymentInputs(nextPaymentInputs);
            setRevenueInputs(nextRevenueInputs);
        } catch {
            setLoadError("Failed to load bank analysis and positions.");
            setPaymentRows([]);
            setRevenueRows([]);
        } finally {
            setLoading(false);
        }
    }, [appKey]);

    useEffect(() => {
        if (!open) return;
        setSyncing(false);
        void reloadBreakdown();
    }, [open, reloadBreakdown]);

    const currentPaymentRows = useMemo(
        () =>
            paymentRows.map((row, index) => ({
                ...row,
                amount: parseInputMoney(paymentInputs[paymentRowKey(row, index)] ?? ""),
            })),
        [paymentRows, paymentInputs],
    );

    const currentRevenueRows = useMemo(
        () =>
            revenueRows.map((row) => ({
                ...row,
                netCredit: parseInputMoney(revenueInputs[row.month] ?? ""),
            })),
        [revenueRows, revenueInputs],
    );

    const breakdown = useMemo(
        () =>
            computeSpaBreakdownFromRows(
                currentPaymentRows,
                currentRevenueRows,
                monthsUsedForAverage,
            ),
        [currentPaymentRows, currentRevenueRows, monthsUsedForAverage],
    );

    const canCalculate = Boolean(breakdown.spa);
    const isBusy = syncing || saving;

    const handleCalculate = useCallback(async () => {
        if (!breakdown.spa) {
            toast.warn(
                "Could not calculate SPA. Enter monthly payments and revenue for the last 3 months.",
            );
            return;
        }
        if (!appKey) {
            toast.warn("Application id is required.");
            return;
        }
        setSyncing(true);
        try {
            await persistSpaEditsToScrubber({
                dispatch,
                applicationUuid: appKey,
                banks: sourceBanks,
                initialPayments: initialPaymentRows,
                currentPayments: currentPaymentRows,
                initialRevenues: initialRevenueRows,
                currentRevenues: currentRevenueRows,
            });
            await onApply(breakdown.spa);
        } catch {
            toast.error("Failed to save SPA and scrubber values.");
        } finally {
            setSyncing(false);
        }
    }, [
        appKey,
        breakdown.spa,
        currentPaymentRows,
        currentRevenueRows,
        dispatch,
        initialPaymentRows,
        initialRevenueRows,
        onApply,
        sourceBanks,
    ]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-0 sm:max-w-xl">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                    <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                        <Calculator className="h-4 w-4 text-[var(--brand)]" aria-hidden />
                        Calculate SPA
                    </DialogTitle>
                    <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">
                        Edit repayments and revenue below. Uses scrubbing REPAYMENT column
                        (per-period ACH, e.g. $1,259) — not MONTHLY PMTS. New offer excluded.
                    </p>
                </div>

                <div className="space-y-5 px-5 py-4">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            Loading monthly payments and revenue…
                        </div>
                    ) : loadError ? (
                        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                            {loadError}
                        </p>
                    ) : (
                        <>
                            <section className="space-y-2">
                                <h3 className={SECTION_LABEL_CLASS}>Repayments</h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Values sync with scrubbing positions (REPAYMENT). Enter amounts
                                    here if scrubbing is empty.
                                </p>
                                <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                                <th className="px-3 py-2 font-semibold">Source</th>
                                                <th className="px-3 py-2 text-right font-semibold">
                                                    Repayment
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paymentRows.map((row, index) => {
                                                const key = paymentRowKey(row, index);
                                                return (
                                                    <tr
                                                        key={key}
                                                        className="border-t border-slate-100 dark:border-slate-800"
                                                    >
                                                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                                            {row.label}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <UsCurrencyInput
                                                                className={MONEY_INPUT_CLASS}
                                                                value={paymentInputs[key] ?? ""}
                                                                onChange={(next) => {
                                                                    setPaymentInputs((prev) => ({
                                                                        ...prev,
                                                                        [key]: next,
                                                                    }));
                                                                }}
                                                                onBlur={() => {
                                                                    const amount = parseInputMoney(
                                                                        paymentInputs[key] ?? "",
                                                                    );
                                                                    setPaymentInputs((prev) => ({
                                                                        ...prev,
                                                                        [key]: formatMoneyInputValue(
                                                                            amount,
                                                                        ),
                                                                    }));
                                                                }}
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="border-t border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/40">
                                                <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                                                    Total monthly repayments
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                                    {formatCurrencyFull(
                                                        breakdown.totalMonthlyPayments,
                                                    )}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="space-y-2">
                                <h3 className={SECTION_LABEL_CLASS}>
                                    Monthly revenue (credits)
                                </h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Values sync with bank analysis credits. Enter amounts here if
                                    scrubbing is empty.
                                </p>
                                <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                                <th className="px-3 py-2 font-semibold">Month</th>
                                                <th className="px-3 py-2 text-right font-semibold">
                                                    Credits
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {revenueRows.map((row) => (
                                                <tr
                                                    key={row.month}
                                                    className={cn(
                                                        "border-t border-slate-100 dark:border-slate-800",
                                                        row.includedInSpaAverage &&
                                                                "bg-[var(--brand)]/5 dark:bg-[var(--brand)]/10",
                                                    )}
                                                >
                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                                        {row.month}
                                                        {row.includedInSpaAverage ? (
                                                                <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                                                Used in avg
                                                            </span>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <UsCurrencyInput
                                                            className={MONEY_INPUT_CLASS}
                                                            value={revenueInputs[row.month] ?? ""}
                                                            onChange={(next) => {
                                                                setRevenueInputs((prev) => ({
                                                                    ...prev,
                                                                    [row.month]: next,
                                                                }));
                                                            }}
                                                            onBlur={() => {
                                                                const amount = parseInputMoney(
                                                                    revenueInputs[row.month] ?? "",
                                                                );
                                                                setRevenueInputs((prev) => ({
                                                                    ...prev,
                                                                    [row.month]:
                                                                        formatMoneyInputValue(amount),
                                                                }));
                                                            }}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="border-t border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/40">
                                                <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                                                    Average (last {SPA_AVG_REVENUE_MONTH_WINDOW}{" "}
                                                    months)
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                                    {breakdown.avgRevenueLast3Months != null
                                                        ? formatCurrencyFull(
                                                              breakdown.avgRevenueLast3Months,
                                                          )
                                                        : "—"}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                    <span className="text-slate-600 dark:text-slate-300">
                                        Calculated SPA
                                    </span>
                                    <span className="text-lg font-bold tabular-nums text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                        {breakdown.spa ? `${breakdown.spa}%` : "—"}
                                    </span>
                                </div>
                                {breakdown.spa ? (
                                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                        ({formatCurrencyFull(breakdown.totalMonthlyPayments)} ÷{" "}
                                        {formatCurrencyFull(breakdown.avgRevenueLast3Months ?? 0)}) ×
                                        100
                                    </p>
                                ) : null}
                            </section>
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        disabled={isBusy}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        className="gap-1.5 bg-[image:var(--brand-gradient)] text-white hover:opacity-90"
                        disabled={loading || isBusy || !canCalculate}
                        onClick={() => {
                            void handleCalculate();
                        }}
                    >
                        {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                            <Calculator className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Calculate &amp; sync
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
