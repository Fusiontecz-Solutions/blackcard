import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Calendar, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsCurrencyInput } from "@/components/ui/us-currency-input";
import {
    calculateDisclosureMetrics,
    formatDisclosurePercent,
    formatDisclosureUsd,
    type DisclosureCalculatorInputs,
    type DisclosureCalculatorResult,
} from "./disclosureAprCalculator";

type DisclosureCalculationModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Deal defaults — only used when the modal opens (not on every parent re-render). */
    seedInputs: DisclosureCalculatorInputs | null;
    /** Bank analysis net-credit months; merged once when loaded if revenue fields are still empty. */
    bankMonthlyRevenues?: number[];
    loadingBankAnalysis?: boolean;
    disclosureLabel?: string;
    saving?: boolean;
    onApply: (args: {
        inputs: DisclosureCalculatorInputs;
        metrics: DisclosureCalculatorResult;
    }) => void | Promise<void>;
};

function parseInputMoney(value: string): number {
    const cleaned = value.replace(/[$,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
}

function formatMoneyInputValue(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const n = parseInputMoney(trimmed);
    if (!Number.isFinite(n) || n <= 0) return trimmed;
    return `$${formatDisclosureUsd(n)}`;
}

function formatMoneyFromNumber(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return "";
    return `$${formatDisclosureUsd(value)}`;
}

function parseInputPercent(value: string): number {
    const cleaned = value.replace(/[$,\s%]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
}

function formatAprInputValue(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const n = parseInputPercent(trimmed);
    if (!Number.isFinite(n) || n <= 0) return trimmed;
    return formatDisclosurePercent(n);
}

const MONEY_INPUT_CLASS = "max-w-full tabular-nums";
const MONEY_INPUT_COMPACT_CLASS = "w-full tabular-nums";
const EDITABLE_INPUT_CLASS = "bg-white dark:bg-slate-950";
const READONLY_INPUT_CLASS =
    "cursor-default bg-slate-100 text-slate-600 dark:bg-slate-900/80 dark:text-slate-400";
const SECTION_LABEL_CLASS =
    "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

function buildFormFromInputs(
    inputs: DisclosureCalculatorInputs,
    monthlyRevenueText: string[],
): DisclosureCalculatorInputs {
    const monthlyRevenues = monthlyRevenueText
        .map((v) => parseInputMoney(v))
        .filter((v) => v > 0);
    return { ...inputs, monthlyRevenues };
}

export function DisclosureCalculationModal({
    open,
    onOpenChange,
    seedInputs,
    bankMonthlyRevenues = [],
    loadingBankAnalysis = false,
    disclosureLabel,
    saving = false,
    onApply,
}: DisclosureCalculationModalProps) {
    const [form, setForm] = useState<DisclosureCalculatorInputs | null>(null);
    const [metrics, setMetrics] = useState<DisclosureCalculatorResult | null>(null);
    const [monthlyRevenueText, setMonthlyRevenueText] = useState<string[]>([]);
    const [purchasePriceText, setPurchasePriceText] = useState("");
    const [factorRateText, setFactorRateText] = useState("");
    const [originationFeeText, setOriginationFeeText] = useState("");
    const [brokerFeeText, setBrokerFeeText] = useState("");
    const [aprText, setAprText] = useState("");

    const seededForOpenRef = useRef(false);
    const bankRevenuesMergedRef = useRef(false);

    /** Seed form once per modal open — avoids reset when bank analysis or parent state updates. */
    useEffect(() => {
        if (!open) {
            seededForOpenRef.current = false;
            bankRevenuesMergedRef.current = false;
            return;
        }
        if (seededForOpenRef.current || !seedInputs) return;

        seededForOpenRef.current = true;
        setForm({ ...seedInputs });
        setPurchasePriceText(formatMoneyFromNumber(seedInputs.purchasePrice));
        setFactorRateText(
            Number.isFinite(seedInputs.factorRate) && seedInputs.factorRate > 0
                ? String(seedInputs.factorRate)
                : "",
        );
        setOriginationFeeText(formatMoneyFromNumber(seedInputs.originationFee));
        setBrokerFeeText(
            formatMoneyFromNumber(
                (seedInputs.brokerFeePaidByFunder ?? 0) +
                    (seedInputs.brokerFeePaidByMerchant ?? 0),
            ),
        );
        setMonthlyRevenueText(
            seedInputs.monthlyRevenues.length > 0
                ? seedInputs.monthlyRevenues.map((v) => formatMoneyFromNumber(v))
                : [""],
        );
        setMetrics(null);
        setAprText("");
    }, [open, seedInputs]);

    /** Merge bank analysis revenues when they arrive — only if user has not entered values yet. */
    useEffect(() => {
        if (!open || bankRevenuesMergedRef.current || !bankMonthlyRevenues.length) return;

        setMonthlyRevenueText((prev) => {
            const hasUserValues = prev.some((v) => parseInputMoney(v) > 0);
            if (hasUserValues) {
                bankRevenuesMergedRef.current = true;
                return prev;
            }
            bankRevenuesMergedRef.current = true;
            return bankMonthlyRevenues.map((v) => formatMoneyFromNumber(v));
        });
    }, [open, bankMonthlyRevenues]);

    const resolvedForm = useMemo((): DisclosureCalculatorInputs | null => {
        if (!form) return null;
        return {
            ...form,
            purchasePrice: parseInputMoney(purchasePriceText),
            factorRate: parseInputMoney(factorRateText) || form.factorRate,
            originationFee: parseInputMoney(originationFeeText),
            brokerFeePaidByFunder: parseInputMoney(brokerFeeText),
            brokerFeePaidByMerchant: 0,
            monthlyRevenues: monthlyRevenueText
                .map((v) => parseInputMoney(v))
                .filter((v) => v > 0),
        };
    }, [form, purchasePriceText, factorRateText, originationFeeText, brokerFeeText, monthlyRevenueText]);

    const revenuePurchasedPreview = useMemo(() => {
        if (!resolvedForm) return "";
        const total = resolvedForm.purchasePrice * resolvedForm.factorRate;
        return total > 0 ? `$${formatDisclosureUsd(total)}` : "";
    }, [resolvedForm]);

    const canCalculate = Boolean(
        resolvedForm && resolvedForm.purchasePrice > 0 && resolvedForm.factorRate > 0,
    );

    const metricsForApply = useMemo((): DisclosureCalculatorResult | null => {
        if (!metrics) return null;
        const editedApr = parseInputPercent(aprText);
        if (editedApr > 0) {
            return { ...metrics, estimatedAnnualPercentageRate: editedApr };
        }
        return metrics;
    }, [metrics, aprText]);

    const resultRows = useMemo(() => {
        if (!metrics) return [];
        return [
            {
                label: "Estimated merchant average monthly revenue",
                value: `$${formatDisclosureUsd(metrics.estimatedMerchantAverageMonthlyRevenue)}`,
            },
            { label: "Amount financed", value: `$${formatDisclosureUsd(metrics.amountFinanced)}` },
            { label: "Recipient funds", value: `$${formatDisclosureUsd(metrics.recipientFunds)}` },
            { label: "Finance charge", value: `$${formatDisclosureUsd(metrics.financeCharge)}` },
            {
                label: "Estimated total payment amount",
                value: `$${formatDisclosureUsd(metrics.estimatedTotalPayment)}`,
            },
            { label: "Payment total", value: `$${formatDisclosureUsd(metrics.paymentTotal)}` },
            { label: "Estimated payment", value: `$${formatDisclosureUsd(metrics.estimatedPayment)}` },
            {
                label: "Estimated monthly cost",
                value: `$${formatDisclosureUsd(metrics.estimatedMonthlyCost)}`,
            },
            {
                label: "Payment terms (% of merchant daily income purchased)",
                value: formatDisclosurePercent(metrics.percentOfDailyIncomePurchased),
            },
            {
                label: "Broker fee (paid to broker)",
                value: `$${formatDisclosureUsd(
                    (resolvedForm?.brokerFeePaidByFunder ?? 0) +
                        (resolvedForm?.brokerFeePaidByMerchant ?? 0),
                )}`,
            },
            { label: "Estimated term (days)", value: String(metrics.estimatedTermDays) },
        ];
    }, [metrics, resolvedForm]);

    const updateForm = <K extends keyof DisclosureCalculatorInputs>(
        key: K,
        value: DisclosureCalculatorInputs[K],
    ) => {
        setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    };

    const handleCalculate = () => {
        if (!resolvedForm) return;
        const next = calculateDisclosureMetrics(resolvedForm);
        setMetrics(next);
        setAprText(formatDisclosurePercent(next.estimatedAnnualPercentageRate));
    };

    const handleApply = async () => {
        if (!resolvedForm || !metricsForApply) return;
        await onApply({
            inputs: buildFormFromInputs(resolvedForm, monthlyRevenueText),
            metrics: metricsForApply,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0 sm:max-w-4xl">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                    <DialogTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Disclosure calculation
                    </DialogTitle>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Review deal values, choose disbursement and first payment dates, then
                        calculate APR and disclosure amounts
                        {disclosureLabel ? ` for ${disclosureLabel}` : ""}.
                    </p>
                </div>

                {!form ? (
                    <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading deal data…
                    </div>
                ) : (
                    <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
                        <div className="space-y-4">
                            <div className="rounded-lg border border-[var(--brand)]/25 bg-[var(--brand)]/5 p-4">
                                <div className="mb-3 flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-[var(--brand)]" />
                                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
                                        Payment schedule dates
                                    </h4>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label
                                            className="text-xs font-medium"
                                            htmlFor="disclosure-disbursement-date"
                                        >
                                            Disbursement date
                                        </Label>
                                        <Input
                                            id="disclosure-disbursement-date"
                                            type="date"
                                            className="bg-white dark:bg-slate-950"
                                            value={form.disbursementDate}
                                            onChange={(e) =>
                                                updateForm("disbursementDate", e.target.value)
                                            }
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label
                                            className="text-xs font-medium"
                                            htmlFor="disclosure-first-payment-date"
                                        >
                                            First payment date
                                        </Label>
                                        <Input
                                            id="disclosure-first-payment-date"
                                            type="date"
                                            className="bg-white dark:bg-slate-950"
                                            value={form.firstPaymentDate}
                                            onChange={(e) =>
                                                updateForm("firstPaymentDate", e.target.value)
                                            }
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs">Merchant name</Label>
                                        <Input
                                            className={EDITABLE_INPUT_CLASS}
                                            value={form.merchantName ?? ""}
                                            onChange={(e) =>
                                                updateForm("merchantName", e.target.value)
                                            }
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">State</Label>
                                        <Input
                                            value={form.state}
                                            readOnly
                                            className={READONLY_INPUT_CLASS}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Frequency</Label>
                                        <Input
                                            value={form.frequency}
                                            readOnly
                                            className={READONLY_INPUT_CLASS}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <p className={`${SECTION_LABEL_CLASS} mb-2`}>Funding</p>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Purchase price</Label>
                                            <UsCurrencyInput
                                                className={`${MONEY_INPUT_CLASS} ${EDITABLE_INPUT_CLASS}`}
                                                value={purchasePriceText}
                                                onChange={setPurchasePriceText}
                                                onBlur={(e) =>
                                                    setPurchasePriceText(
                                                        formatMoneyInputValue(e.target.value),
                                                    )
                                                }
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Factor rate</Label>
                                            <Input
                                                inputMode="decimal"
                                                className={EDITABLE_INPUT_CLASS}
                                                value={factorRateText}
                                                onChange={(e) =>
                                                    setFactorRateText(e.target.value)
                                                }
                                                placeholder="1.499"
                                            />
                                        </div>
                                        <div className="space-y-1.5 sm:col-span-2">
                                            <Label className="text-xs">Revenue purchased</Label>
                                            <Input
                                                readOnly
                                                className={`${MONEY_INPUT_CLASS} ${READONLY_INPUT_CLASS}`}
                                                value={revenuePurchasedPreview}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <p className={`${SECTION_LABEL_CLASS} mb-2`}>Fees</p>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Origination fee</Label>
                                            <UsCurrencyInput
                                                className={`${MONEY_INPUT_CLASS} ${EDITABLE_INPUT_CLASS}`}
                                                value={originationFeeText}
                                                onChange={setOriginationFeeText}
                                                onBlur={(e) =>
                                                    setOriginationFeeText(
                                                        formatMoneyInputValue(e.target.value),
                                                    )
                                                }
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">
                                                Broker fee (paid to broker)
                                            </Label>
                                            <UsCurrencyInput
                                                className={`${MONEY_INPUT_CLASS} ${EDITABLE_INPUT_CLASS}`}
                                                value={brokerFeeText}
                                                onChange={setBrokerFeeText}
                                                onBlur={(e) =>
                                                    setBrokerFeeText(
                                                        formatMoneyInputValue(e.target.value),
                                                    )
                                                }
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                                    <p className={`${SECTION_LABEL_CLASS} mb-2`}>Payment term</p>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">
                                                {form.frequency === "Daily"
                                                    ? "Estimated term (days)"
                                                    : "Number of payments"}
                                            </Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                className={`tabular-nums ${EDITABLE_INPUT_CLASS}`}
                                                value={String(
                                                    form.frequency === "Daily"
                                                        ? form.numberOfPaymentDays
                                                        : form.numberOfPayments,
                                                )}
                                                onChange={(e) => {
                                                    const count = Math.max(
                                                        1,
                                                        Number(e.target.value) || 1,
                                                    );
                                                    if (form.frequency === "Daily") {
                                                        setForm((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      numberOfPayments: count,
                                                                      numberOfPaymentDays: count,
                                                                  }
                                                                : prev,
                                                        );
                                                    } else {
                                                        updateForm("numberOfPayments", count);
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="hidden sm:block" aria-hidden />
                                    </div>
                                    {form.frequency === "Daily" ? (
                                        <p className="mt-2 text-[11px] text-slate-500">
                                            Daily deals: offer term is the number of payment days
                                            (e.g. term 12 = 12 business days).
                                        </p>
                                    ) : form.frequency === "Weekly" ? (
                                        <p className="mt-2 text-[11px] text-slate-500">
                                            Weekly deals: term is the number of weekly payments
                                            (e.g. 12 weeks).
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                                <div className="flex items-center justify-between gap-2">
                                    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                        Merchant monthly revenue (bank analysis)
                                    </Label>
                                    {loadingBankAnalysis ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brand)]" />
                                    ) : null}
                                </div>
                                <p className="text-[11px] text-slate-500">
                                    Pulled from bank analysis net credit by month. Edit if needed.
                                </p>
                                <div className="flex flex-wrap gap-x-3 gap-y-2">
                                    {monthlyRevenueText.map((value, index) => (
                                        <div
                                            key={`month-${index}`}
                                            className="w-[8.75rem] shrink-0 space-y-1"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <Label className="text-[11px] text-slate-500">
                                                    Month {index + 1}
                                                </Label>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                                                    disabled={monthlyRevenueText.length <= 1}
                                                    onClick={() =>
                                                        setMonthlyRevenueText((prev) =>
                                                            prev.length <= 1
                                                                ? prev
                                                                : prev.filter(
                                                                      (_, i) => i !== index,
                                                                  ),
                                                        )
                                                    }
                                                    aria-label={`Remove month ${index + 1}`}
                                                    title={
                                                        monthlyRevenueText.length <= 1
                                                            ? "At least one month is required"
                                                            : `Remove month ${index + 1}`
                                                    }
                                                >
                                                    <X className="size-4" />
                                                </Button>
                                            </div>
                                            <UsCurrencyInput
                                                className={MONEY_INPUT_COMPACT_CLASS}
                                                value={value}
                                                onChange={(next) => {
                                                    const nextMonths = [...monthlyRevenueText];
                                                    nextMonths[index] = next;
                                                    setMonthlyRevenueText(nextMonths);
                                                }}
                                                onBlur={(e) => {
                                                    const next = [...monthlyRevenueText];
                                                    next[index] = formatMoneyInputValue(
                                                        e.target.value,
                                                    );
                                                    setMonthlyRevenueText(next);
                                                }}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={() =>
                                        setMonthlyRevenueText((prev) => [...prev, ""])
                                    }
                                >
                                    Add month
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-lg border border-[var(--brand)]/20 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
                                    Calculation results
                                </h4>
                                {!metrics ? (
                                    <p className="mt-3 text-xs text-slate-500">
                                        Set disbursement and first payment dates, then click
                                        Calculate. Results stay visible until you change inputs or
                                        close this dialog.
                                    </p>
                                ) : (
                                    <dl className="mt-3 space-y-2">
                                        {resultRows.map((row) => (
                                            <div
                                                key={row.label}
                                                className="flex items-start justify-between gap-3 text-xs"
                                            >
                                                <dt className="text-slate-500">{row.label}</dt>
                                                <dd className="text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                                    {row.value}
                                                </dd>
                                            </div>
                                        ))}
                                        <div className="flex items-center justify-between gap-3 text-xs">
                                            <Label
                                                htmlFor="disclosure-calc-apr"
                                                className="text-slate-500"
                                            >
                                                Estimated annual percentage rate (APR)
                                            </Label>
                                            <Input
                                                id="disclosure-calc-apr"
                                                inputMode="decimal"
                                                className="h-8 max-w-[7.5rem] text-right text-xs font-semibold tabular-nums"
                                                value={aprText}
                                                onChange={(e) => setAprText(e.target.value)}
                                                onBlur={(e) =>
                                                    setAprText(formatAprInputValue(e.target.value))
                                                }
                                                placeholder="0.00%"
                                            />
                                        </div>
                                    </dl>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    className="bg-[image:var(--brand-gradient)] text-white hover:opacity-90"
                                    disabled={!canCalculate || saving}
                                    onClick={handleCalculate}
                                >
                                    <Calculator className="mr-2 h-4 w-4" />
                                    Calculate
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!metricsForApply || saving}
                                    onClick={() => void handleApply()}
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Applying…
                                        </>
                                    ) : (
                                        "Apply to disclosure"
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
