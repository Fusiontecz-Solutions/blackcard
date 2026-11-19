import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsCurrencyInput } from "@/components/ui/us-currency-input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/context/ThemeContext";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/redux/store";
import { axiosGet, axiosPost } from "@/redux/axios";
import { getOfferDecisionByApplication } from "@/redux/actions/offerDecisionActions";
import { emitOfferDecisionUpdated } from "@/lib/offerDecisionSync";
import { feesPercentToDollarsFromFunded } from "@/lib/offerDecisionFees";
import { deriveOfferRepaymentStack } from "@/lib/offerRepaymentCalculations";
import {
    cn,
    formatNumberUS,
    formatNumberUSForInput,
    formatRateUS,
    formatRateUSCommit,
    parseNumberUS,
} from "@/lib/utils";
import { Pencil } from "lucide-react";
import { toast } from "react-toastify";

const ORIGINATION_FEE_FIXED = "10";

const isValidEmail = (value: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());

interface OfferFormValues {
    requestAmount: string;
    approvedAmount: string;
    factorRate: string;
    paybackAmount: string;
    tenure: string;
    repay: string;
    monthlyRepayment: string;
    achFrequency: string;
}

const EMPTY_OFFER: OfferFormValues = {
    requestAmount: "",
    approvedAmount: "",
    factorRate: "",
    paybackAmount: "",
    tenure: "",
    repay: "",
    monthlyRepayment: "",
    achFrequency: "Daily",
};

function formatMoneyField(value: unknown): string {
    if (value === null || value === undefined || value === "") return "";
    const num = typeof value === "number" ? value : parseNumberUS(value);
    if (!Number.isFinite(num) || num <= 0) return "";
    return formatNumberUS(num);
}

function parseTermFromTenure(tenure: string): string | null {
    const t = String(tenure ?? "").trim();
    if (!t) return null;
    const match = t.match(/^(\d+)/);
    return match ? match[1] : t;
}

/** Payback / repay / monthly derived from offer × rate over the term & frequency. */
function deriveCalculatedFields(values: {
    approvedAmount: string;
    factorRate: string;
    tenure: string;
    achFrequency: string;
}): Pick<OfferFormValues, "paybackAmount" | "repay" | "monthlyRepayment"> {
    const empty = { paybackAmount: "", repay: "", monthlyRepayment: "" };
    const termStr = parseTermFromTenure(values.tenure) ?? "";
    if (!termStr) return empty;

    const stack = deriveOfferRepaymentStack({
        advance: parseNumberUS(values.approvedAmount),
        factorRate: parseNumberUS(values.factorRate),
        term: termStr,
        frequency: values.achFrequency || "Daily",
    });
    if (!stack) return empty;

    return {
        paybackAmount: formatMoneyField(stack.payback),
        repay: formatMoneyField(stack.perPeriodPayment),
        monthlyRepayment: formatMoneyField(stack.monthlyPayment),
    };
}

function buildOfferFormFromApi(
    apiData: Record<string, unknown> | null,
    loanAmount: number | null | undefined,
): OfferFormValues {
    const offer = apiData?.offer ?? null;
    const rate = apiData?.rate ?? null;
    const term = apiData?.term ?? null;

    const termLabel =
        term != null && String(term).trim() !== ""
            ? `${String(term).replace(/\s*payments?/i, "").trim()}`
            : "";
    const frequency = (apiData?.frequency as string) || "Daily";

    const derived =
        termLabel && offer != null && rate != null
            ? deriveCalculatedFields({
                  approvedAmount: offer != null ? formatMoneyField(offer) : "",
                  factorRate: rate != null ? formatRateUS(rate) : "",
                  tenure: termLabel,
                  achFrequency: frequency,
              })
            : { paybackAmount: "", repay: "", monthlyRepayment: "" };

    return {
        requestAmount: loanAmount != null ? formatMoneyField(loanAmount) : "",
        approvedAmount: offer != null ? formatMoneyField(offer) : "",
        factorRate: rate != null ? formatRateUS(rate) : "",
        paybackAmount: derived.paybackAmount,
        tenure: termLabel,
        repay: derived.repay,
        monthlyRepayment: derived.monthlyRepayment,
        achFrequency: frequency,
    };
}

export interface ApproveForDisbursementModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Numeric applicationId (preferred) or _id used for offer-decision read/write. */
    applicationId?: string | number | null;
    /** Requested loan amount, shown for context. */
    loanAmount?: number | null;
    /** Linked client email used as the default recipient. */
    defaultClientEmail?: string;
    /** Whether the parent approval request is in flight. */
    confirming?: boolean;
    /** Label for the confirm CTA (e.g. resend vs first approval). */
    confirmLabel?: string;
    /** Send the approval mail with the (possibly edited) client email. */
    onConfirm: (clientEmail: string) => void | Promise<void>;
    /** Called after the offer terms are saved/edited in this modal. */
    onOfferUpdated?: () => void;
    /** Parent flag: offer values were updated (in this modal or elsewhere). */
    offerUpdated?: boolean;
    /** Send the deal to the approving Underwriter for final sign-off. */
    onSendForFinalApproval?: () => boolean | void | Promise<boolean | void>;
    sendingFinalApproval?: boolean;
    /** True when the deal is already in the Final Approval queue. */
    isFinalApprovalStage?: boolean;
}

const ApproveForDisbursementModal = ({
    open,
    onOpenChange,
    applicationId,
    loanAmount,
    defaultClientEmail,
    confirming = false,
    confirmLabel = "Approve & send email",
    onConfirm,
    onOfferUpdated,
    offerUpdated = false,
    onSendForFinalApproval,
    sendingFinalApproval = false,
    isFinalApprovalStage = false,
}: ApproveForDisbursementModalProps) => {
    const dispatch = useDispatch<AppDispatch>();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const [clientEmail, setClientEmail] = useState("");
    const [emailError, setEmailError] = useState<string | null>(null);

    const [offer, setOffer] = useState<OfferFormValues>(EMPTY_OFFER);
    const [offerLoading, setOfferLoading] = useState(false);
    const [isEditingOffer, setIsEditingOffer] = useState(false);
    const [savingOffer, setSavingOffer] = useState(false);
    const offerSnapshotRef = useRef<OfferFormValues>(EMPTY_OFFER);
    const offerPreserveRef = useRef<{ position: string | null; ourRemit: number | null }>({
        position: null,
        ourRemit: null,
    });
    const [decision, setDecision] = useState<"approved" | "declined">("approved");
    const [offerSavedInSession, setOfferSavedInSession] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    const resolvedApplicationId =
        applicationId != null && String(applicationId).trim() !== ""
            ? String(applicationId)
            : null;

    useEffect(() => {
        if (!open) {
            setIsEditingOffer(false);
            setEmailError(null);
            setOfferSavedInSession(false);
            setIsClosing(false);
            return;
        }
        setIsClosing(false);
        setClientEmail(defaultClientEmail ?? "");

        let active = true;
        const loadOffer = async () => {
            if (!resolvedApplicationId) {
                setOffer(buildOfferFormFromApi(null, loanAmount));
                offerSnapshotRef.current = buildOfferFormFromApi(null, loanAmount);
                return;
            }
            try {
                setOfferLoading(true);
                const res = await axiosGet("/offer-decisions", {
                    params: { application: resolvedApplicationId },
                });
                if (!active) return;
                const apiData = (res.data && res.data.data) || null;
                offerPreserveRef.current = {
                    position:
                        apiData?.position != null && String(apiData.position).trim() !== ""
                            ? String(apiData.position)
                            : null,
                    ourRemit: (() => {
                        const n = parseNumberUS(apiData?.ourRemit);
                        return Number.isFinite(n) ? n : null;
                    })(),
                };
                setDecision(apiData?.decision === "declined" ? "declined" : "approved");
                const form = buildOfferFormFromApi(apiData, loanAmount);
                setOffer(form);
                offerSnapshotRef.current = form;
            } catch (err) {
                console.error("Failed to load offer decision for approval modal:", err);
                if (!active) return;
                offerPreserveRef.current = { position: null, ourRemit: null };
                const fallback = buildOfferFormFromApi(null, loanAmount);
                setOffer(fallback);
                offerSnapshotRef.current = fallback;
            } finally {
                if (active) setOfferLoading(false);
            }
        };
        void loadOffer();
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, resolvedApplicationId, loanAmount]);

    const updateDriver = (patch: Partial<OfferFormValues>) => {
        setOffer((prev) => {
            const next = { ...prev, ...patch };
            const derived = deriveCalculatedFields({
                approvedAmount: next.approvedAmount,
                factorRate: next.factorRate,
                tenure: next.tenure,
                achFrequency: next.achFrequency,
            });
            return { ...next, ...derived };
        });
    };

    const handleStartEditOffer = () => {
        offerSnapshotRef.current = offer;
        setIsEditingOffer(true);
    };

    const handleCancelEditOffer = () => {
        setOffer(offerSnapshotRef.current);
        setIsEditingOffer(false);
    };

    const handleSaveOffer = async () => {
        if (!resolvedApplicationId) {
            toast.error("Missing application id. Please reload and try again.");
            return;
        }
        const offerNum = parseNumberUS(offer.approvedAmount);
        const rateNum = parseNumberUS(offer.factorRate);
        const termStr = parseTermFromTenure(offer.tenure) ?? "";
        if (!(offerNum > 0)) {
            toast.error("Approved amount is required.");
            return;
        }
        if (!termStr) {
            toast.error("Term is required.");
            return;
        }

        const repaymentStack =
            offerNum > 0 && rateNum > 0 && termStr
                ? deriveOfferRepaymentStack({
                      advance: offerNum,
                      factorRate: rateNum,
                      term: termStr,
                      frequency: offer.achFrequency || "Daily",
                  })
                : null;

        const feesDollars = feesPercentToDollarsFromFunded(
            offer.approvedAmount,
            ORIGINATION_FEE_FIXED,
        );

        setSavingOffer(true);
        const toastId = toast.loading("Updating offer details...");
        try {
            const saveRes = await axiosPost("/offer-decisions", {
                applicationId: resolvedApplicationId,
                decision,
                position: offerPreserveRef.current.position,
                ourRemit: offerPreserveRef.current.ourRemit,
                offer: offerNum > 0 ? offerNum : null,
                rate: rateNum > 0 ? rateNum : null,
                term: termStr || null,
                frequency: offer.achFrequency || null,
                fees: feesDollars,
                totalRemit: repaymentStack?.payback ?? null,
                repayPerPeriod:
                    repaymentStack && repaymentStack.perPeriodPayment > 0
                        ? repaymentStack.perPeriodPayment
                        : null,
                monthlyPayment:
                    repaymentStack && repaymentStack.monthlyPayment > 0
                        ? repaymentStack.monthlyPayment
                        : null,
            });

            const saved = (saveRes?.data && saveRes.data.data) || null;
            if (saved) {
                offerPreserveRef.current = {
                    position:
                        saved.position != null && String(saved.position).trim() !== ""
                            ? String(saved.position)
                            : offerPreserveRef.current.position,
                    ourRemit: (() => {
                        const n = parseNumberUS(saved.ourRemit);
                        return Number.isFinite(n) ? n : offerPreserveRef.current.ourRemit;
                    })(),
                };
            }

            emitOfferDecisionUpdated(resolvedApplicationId);
            try {
                await dispatch(
                    getOfferDecisionByApplication(resolvedApplicationId),
                ).unwrap();
            } catch {
                /* non-fatal: redux refresh is best-effort */
            }

            offerSnapshotRef.current = offer;
            setIsEditingOffer(false);
            setOfferSavedInSession(true);
            onOfferUpdated?.();
            toast.update(toastId, {
                render: "Offer details updated.",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });
        } catch (err) {
            console.error("Failed to update offer decision:", err);
            toast.update(toastId, {
                render: "Failed to update offer details. Please try again.",
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setSavingOffer(false);
        }
    };

    const handleConfirm = async () => {
        const trimmed = clientEmail.trim();
        if (!trimmed) {
            setEmailError("Client email is required to send the approval mail.");
            return;
        }
        if (!isValidEmail(trimmed)) {
            setEmailError("Enter a valid email address.");
            return;
        }
        setEmailError(null);
        await onConfirm(trimmed);
    };

    const busy = confirming || savingOffer || sendingFinalApproval || isClosing;
    const showSendForFinalApproval =
        Boolean(onSendForFinalApproval) && (offerUpdated || offerSavedInSession);

    const handleSendForFinalApprovalClick = useCallback(async () => {
        if (!onSendForFinalApproval || isClosing) return;
        try {
            const result = await onSendForFinalApproval();
            if (result !== false) {
                setIsClosing(true);
            }
        } catch {
            /* keep modal open on failure */
        }
    }, [isClosing, onSendForFinalApproval]);

    const handleCloseAnimationComplete = useCallback(() => {
        if (!isClosing) return;
        setIsClosing(false);
        onOpenChange(false);
    }, [isClosing, onOpenChange]);

    const labelClass = `text-xs font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`;
    const inputClass = `h-9 text-sm rounded-sm ${
        isDark ? "bg-muted border-gray-700 text-gray-200" : "bg-white border-gray-200"
    }`;
    const readOnlyValueClass = `h-9 rounded-sm border px-3 text-sm leading-9 ${
        isDark
            ? "border-gray-700/60 bg-muted/20 text-gray-400"
            : "border-gray-200 bg-gray-100 text-gray-600"
    }`;

    const renderReadOnly = (label: string, value: string, prefix = "") => (
        <div className="space-y-1.5">
            <Label className={labelClass}>{label}</Label>
            <p className={readOnlyValueClass}>
                {value?.trim() ? `${prefix}${value}` : "—"}
            </p>
        </div>
    );

    return (
        <Dialog
            open={open || isClosing}
            onOpenChange={(next: boolean) => (busy ? undefined : onOpenChange(next))}
        >
            <DialogContent
                className={cn(
                    "sm:max-w-2xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto flex flex-col gap-3",
                    "data-[state=open]:!animate-none data-[state=closed]:!animate-none",
                )}
                overlayClassName={cn(
                    "transition-opacity duration-300 ease-out",
                    isClosing && "!opacity-0",
                )}
            >
                <motion.div
                    className="flex min-h-0 flex-1 flex-col gap-3"
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={
                        isClosing
                            ? { opacity: 0, scale: 0.96, y: 18 }
                            : { opacity: 1, scale: 1, y: 0 }
                    }
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    onAnimationComplete={handleCloseAnimationComplete}
                >
                <DialogHeader>
                    <DialogTitle
                        className={`text-lg font-semibold ${isDark ? "text-gray-200" : "text-black"}`}
                    >
                        Review approval email
                    </DialogTitle>
                    <DialogDescription
                        className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
                    >
                        Confirm the client recipient and offer terms before the approval
                        email is sent.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
                    {/* Client email */}
                    <div className="space-y-1.5">
                        <Label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-black"}`}>
                            Client email <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            type="email"
                            value={clientEmail}
                            disabled={busy}
                            onChange={(e) => {
                                setClientEmail(e.target.value);
                                if (emailError) setEmailError(null);
                            }}
                            placeholder="client@example.com"
                            className={inputClass}
                            autoComplete="off"
                        />
                        {emailError ? (
                            <p className="text-xs text-red-500">{emailError}</p>
                        ) : (
                            <p className={`text-[11px] ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                The approval email will be sent to this address.
                            </p>
                        )}
                    </div>

                    {/* Offer terms */}
                    <div
                        className={`rounded-lg p-4 ${
                            isDark ? "bg-[#262827]" : "bg-green-50"
                        }`}
                    >
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h3 className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                                Offer Terms
                            </h3>
                            {!isEditingOffer && !offerLoading ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleStartEditOffer}
                                    disabled={busy || !resolvedApplicationId}
                                    className={`gap-2 ${
                                        isDark
                                            ? "border-gray-600 bg-muted text-gray-200 hover:bg-gray-700"
                                            : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                                    }`}
                                >
                                    <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Edit offer
                                </Button>
                            ) : null}
                        </div>

                        {offerLoading ? (
                            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                Loading offer details…
                            </p>
                        ) : !isEditingOffer ? (
                            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                                {renderReadOnly("Request Amount", offer.requestAmount, "$")}
                                {renderReadOnly("Approved Amount", offer.approvedAmount, "$")}
                                {renderReadOnly("Factor Rate", offer.factorRate)}
                                {renderReadOnly("Payback Amount", offer.paybackAmount, "$")}
                                {renderReadOnly("Term", offer.tenure)}
                                {renderReadOnly("Repay", offer.repay, "$")}
                                {renderReadOnly("Monthly Repayment", offer.monthlyRepayment, "$")}
                                {renderReadOnly("ACH / Frequency", offer.achFrequency)}
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label className={labelClass}>Request Amount</Label>
                                        <p className={readOnlyValueClass}>
                                            {offer.requestAmount?.trim() ? `$${offer.requestAmount}` : "—"}
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-black"}`}>
                                            Approved Amount <span className="text-red-500">*</span>
                                        </Label>
                                        <UsCurrencyInput
                                            value={offer.approvedAmount}
                                            onChange={(next) =>
                                                updateDriver({
                                                    approvedAmount: next,
                                                })
                                            }
                                            onBlur={() =>
                                                updateDriver({
                                                    approvedAmount: formatMoneyField(offer.approvedAmount),
                                                })
                                            }
                                            placeholder="e.g. 250,000.00"
                                            className={inputClass}
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-black"}`}>
                                            Factor Rate
                                        </Label>
                                        <Input
                                            value={offer.factorRate}
                                            onChange={(e) =>
                                                updateDriver({
                                                    factorRate: formatNumberUSForInput(e.target.value),
                                                })
                                            }
                                            onBlur={() =>
                                                updateDriver({
                                                    factorRate: formatRateUSCommit(offer.factorRate),
                                                })
                                            }
                                            inputMode="decimal"
                                            placeholder="e.g. 1.32"
                                            className={inputClass}
                                            autoComplete="off"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className={labelClass}>Payback Amount</Label>
                                        <p className={readOnlyValueClass}>
                                            {offer.paybackAmount?.trim() ? `$${offer.paybackAmount}` : "—"}
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-black"}`}>
                                            Term <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            value={offer.tenure}
                                            onChange={(e) => updateDriver({ tenure: e.target.value })}
                                            placeholder="e.g. No. of payments"
                                            className={inputClass}
                                            autoComplete="off"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className={labelClass}>Repay</Label>
                                        <p className={readOnlyValueClass}>
                                            {offer.repay?.trim() ? `$${offer.repay}` : "—"}
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className={labelClass}>Monthly Repayment</Label>
                                        <p className={readOnlyValueClass}>
                                            {offer.monthlyRepayment?.trim() ? `$${offer.monthlyRepayment}` : "—"}
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-black"}`}>
                                            ACH / Frequency <span className="text-red-500">*</span>
                                        </Label>
                                        <Select
                                            value={offer.achFrequency || undefined}
                                            onValueChange={(value: string) => updateDriver({ achFrequency: value })}
                                        >
                                            <SelectTrigger className={`h-9 w-full rounded-sm text-sm ${isDark ? "bg-muted border-gray-700 text-gray-200" : "bg-white border-gray-200"}`}>
                                                <SelectValue placeholder="Select frequency" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Daily">Daily</SelectItem>
                                                <SelectItem value="Weekly">Weekly</SelectItem>
                                                <SelectItem value="Bi-Weekly">Bi-Weekly</SelectItem>
                                                <SelectItem value="Monthly">Monthly</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-border/60 pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleCancelEditOffer}
                                        disabled={savingOffer}
                                        className={`px-6 ${
                                            isDark
                                                ? "border-gray-600 bg-muted text-gray-300"
                                                : "border-gray-300 bg-white text-gray-700"
                                        }`}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => void handleSaveOffer()}
                                        disabled={savingOffer}
                                        className="px-6"
                                    >
                                        {savingOffer ? "Saving…" : "Save offer"}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>

                    {showSendForFinalApproval ? (
                        <div
                            className={`rounded-lg border px-4 py-3 ${
                                isDark
                                    ? "border-emerald-900/50 bg-emerald-950/30"
                                    : "border-emerald-200 bg-emerald-50"
                            }`}
                        >
                            <p
                                className={`mb-3 text-xs ${
                                    isDark ? "text-gray-400" : "text-gray-600"
                                }`}
                            >
                                {isFinalApprovalStage
                                    ? "This deal has already been sent for final Underwriter approval."
                                    : "Offer values changed. Send the updated deal to the approving Underwriter for final sign-off before resending the ISO approval mail."}
                            </p>
                            <Button
                                type="button"
                                onClick={() => void handleSendForFinalApprovalClick()}
                                disabled={
                                    busy ||
                                    isEditingOffer ||
                                    offerLoading ||
                                    isFinalApprovalStage
                                }
                                className="w-full bg-[image:none] bg-[#16A34A] px-6 text-white hover:bg-green-700 hover:opacity-100"
                            >
                                {sendingFinalApproval
                                    ? "Sending…"
                                    : isFinalApprovalStage
                                      ? "Sent for final approval"
                                      : "Send for Final Approval"}
                            </Button>
                        </div>
                    ) : null}
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 pt-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={busy}
                        className={`px-6 ${
                            isDark
                                ? "bg-muted border-gray-700 text-gray-300 hover:bg-gray-700"
                                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={() => void handleConfirm()}
                        disabled={busy || offerLoading || isEditingOffer}
                        className="bg-green-600 px-6 text-white hover:bg-green-700"
                        title={isEditingOffer ? "Save or cancel offer changes first" : undefined}
                    >
                        {confirming
                            ? "Sending…"
                            : isEditingOffer
                              ? "Save offer changes first"
                              : confirmLabel}
                    </Button>
                </div>
                </motion.div>
            </DialogContent>
        </Dialog>
    );
};

export default ApproveForDisbursementModal;
