import { forwardRef, useEffect, useRef, useState, type ComponentProps } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/context/ThemeContext";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { updateApplicationQueue, updateApplication, sendApprovalEmail, getApplicationById, reinitiateContract as reinitiateContractAction } from "@/redux/actions/applicationActions";
import { getOfferDecisionByApplication } from "@/redux/actions/offerDecisionActions";
import { axiosGet, axiosPost } from "@/redux/axios";
import { toast } from "react-toastify";
import {
    formatNumberUS,
    formatNumberUSForInput,
    formatRateUS,
    formatRateUSCommit,
    parseNumberUS,
} from "@/lib/utils";
import {
    deriveOfferRepaymentStack,
    type OfferRepaymentStack,
} from "@/lib/offerRepaymentCalculations";
import { emitOfferDecisionUpdated } from "@/lib/offerDecisionSync";
import { feesPercentToDollarsFromFunded } from "@/lib/offerDecisionFees";
import { AlertTriangle, DollarSign, Mail, Pencil, Phone, X } from "lucide-react";
import { formatUSPhoneNumber } from "@/utils/formatPhoneNumber";
import AgentDealIsoTag from "./AgentDealIsoTag";
import {
    APPLICATION_APPROVAL_EMAIL_SUBJECT,
    APPLICATION_APPROVAL_URL_PLACEHOLDER,
    APPLICATION_APPROVAL_CLIENT_NAME_PLACEHOLDER,
    APPLICATION_APPROVAL_COMPANY_NAME_PLACEHOLDER,
    OFFER_UPDATED_EMAIL_SUBJECT,
    renderApplicationApprovalEmailHtml,
    renderOfferUpdatedEmailHtml,
} from "@/pages/templates";
import { applicationNeedsContractReinitiation } from "@/lib/contractReinitiation";
import { resolveActionErrorMessage } from "@/lib/unclaimedDealError";
import { mergeCcEmails, submissionCcApplicationId, useSubmissionCcPrefill } from "@/hooks/useSubmissionCcPrefill";
import LockedCcChips from "./LockedCcChips";
import { useBreakdownPdf } from "./useBreakdownPdf";
import { useSubmissionsInboxEmails } from "@/hooks/useAlwaysCcEmails";

const ORIGINATION_FEE_FIXED = "10";

interface ApprovalFormValues {
    requestAmount: string;
    tenure: string;
    paybackAmount: string;
    originationFee: string;
    approvedAmount: string;
    factorRate: string;
    repay: string;
    monthlyRepayment: string;
    achFrequency: string;
}

/** Label for the term count field that mirrors tenure (e.g. Daily → "For day"). */
function getFrequencyPeriodLabel(frequency: string): string {
    switch (frequency) {
        case "Weekly":
            return "For week";
        case "Bi-Weekly":
            return "For bi-week";
        case "Monthly":
            return "For month";
        default:
            return "For day";
    }
}

function parseTermFromTenure(tenure: string): string | null {
    const t = tenure.trim();
    if (!t) return null;
    const match = t.match(/^(\d+)/);
    return match ? match[1] : t;
}

/** Currency display: full calculated value with thousands separators and .00 cents. */
function formatMoneyField(value: unknown): string {
    if (value === null || value === undefined || value === "") return "";
    const num = typeof value === "number" ? value : parseNumberUS(value);
    if (!Number.isFinite(num) || num <= 0) return "";
    return formatNumberUS(num);
}

function stackToCalculatedFormFields(stack: OfferRepaymentStack): Pick<
    ApprovalFormValues,
    "paybackAmount" | "repay" | "monthlyRepayment"
> {
    return {
        paybackAmount: formatMoneyField(stack.payback),
        repay: formatMoneyField(stack.perPeriodPayment),
        monthlyRepayment: formatMoneyField(stack.monthlyPayment),
    };
}

/**
 * Payback / repay / monthly from current offer drivers only.
 * Payback = offer × rate; repay = payback ÷ term; monthly from frequency (OfferDecisionToggle).
 */
function deriveCalculatedFieldsFromDrivers(values: {
    approvedAmount: string;
    factorRate: string;
    tenure: string;
    achFrequency: string;
}): Pick<ApprovalFormValues, "paybackAmount" | "repay" | "monthlyRepayment"> | null {
    const termStr = parseTermFromTenure(values.tenure) ?? "";
    if (!termStr) return null;

    const stack = deriveOfferRepaymentStack({
        advance: parseNumberUS(values.approvedAmount),
        factorRate: parseNumberUS(values.factorRate),
        term: termStr,
        frequency: values.achFrequency || "Daily",
    });
    if (!stack) return null;
    return stackToCalculatedFormFields(stack);
}

function applyCalculatedFieldsToStack(
    apiOffer: unknown,
    apiRate: unknown,
    termLabel: string,
    frequency: string,
): Pick<ApprovalFormValues, "paybackAmount" | "repay" | "monthlyRepayment"> {
    const empty = { paybackAmount: "", repay: "", monthlyRepayment: "" };
    if (!termLabel) return empty;

    const derived = deriveCalculatedFieldsFromDrivers({
        approvedAmount:
            apiOffer != null ? formatMoneyField(apiOffer) : "",
        factorRate: apiRate != null ? formatRateUS(apiRate) : "",
        tenure: termLabel,
        achFrequency: frequency,
    });
    return derived ?? empty;
}


function buildApprovalFormFromApi(
    apiData: Record<string, unknown> | null,
    loanAmount: number | null | undefined,
): ApprovalFormValues {
    const offer = apiData?.offer ?? null;
    const rate = apiData?.rate ?? null;
    const term = apiData?.term ?? null;

    const termLabel =
        term != null && String(term).trim() !== ""
            ? `${String(term).replace(/\s*payments?/i, "").trim()}`
            : "";

    const frequency = (apiData?.frequency as string) || "Daily";

    // Always derive from offer × rate (do not use totalRemit — may be leverage % or stale).
    const { paybackAmount, repay, monthlyRepayment } =
        termLabel && offer != null && rate != null
            ? applyCalculatedFieldsToStack(offer, rate, termLabel, frequency)
            : { paybackAmount: "", repay: "", monthlyRepayment: "" };

    return {
        requestAmount:
            loanAmount != null ? formatMoneyField(loanAmount) : "",
        tenure: termLabel,
        paybackAmount,
        originationFee: ORIGINATION_FEE_FIXED,
        approvedAmount: offer != null ? formatMoneyField(offer) : "",
        factorRate: rate != null ? formatRateUS(rate) : "",
        repay,
        monthlyRepayment,
        achFrequency: frequency,
    };
}

function readOnlyFieldLabelClass(isDark: boolean): string {
    return `text-sm font-medium ${isDark ? "text-gray-500" : "text-gray-500"}`;
}

/** Shared control height — matches default Input (h-9) across the form grid. */
const FIELD_CONTROL_H = "h-9";

function readOnlyFieldValueClass(isDark: boolean): string {
    return `${FIELD_CONTROL_H} rounded-sm border px-3 text-sm leading-9 cursor-default select-none ${
        isDark
            ? "border-gray-700/60 bg-muted/20 text-gray-400"
            : "border-gray-200 bg-gray-100 text-gray-500"
    }`;
}

function readOnlyPlainInputClass(isDark: boolean): string {
    return `${FIELD_CONTROL_H} px-3 rounded-sm text-sm leading-9 outline-none cursor-not-allowed select-none ${
        isDark
            ? "border border-gray-700/60 bg-muted/20 text-gray-400"
            : "border border-gray-200 bg-gray-100 text-gray-500"
    }`;
}

function currencyFieldWrapperClass(isDark: boolean, muted = false): string {
    if (muted) {
        return `cursor-not-allowed select-none ${
            isDark
                ? "border border-gray-700/60 bg-muted/20 text-gray-400"
                : "border border-gray-200 bg-gray-100 text-gray-500"
        }`;
    }
    return isDark
        ? "border border-gray-700 bg-muted text-gray-200"
        : "border border-gray-200 bg-white text-gray-900";
}

/** Lucide dollar icon — readable in light/dark; softer when field is muted (calculated/read-only). */
function dollarIconClass(isDark: boolean, muted = false): string {
    if (muted) {
        return isDark ? "text-gray-500" : "text-gray-400";
    }
    return isDark ? "text-gray-400" : "text-gray-500";
}

/** Compact icon column — no extra padding; keeps row height aligned with other fields. */
const CURRENCY_ICON_SLOT_W = "w-7 shrink-0";

function DollarSignIcon({
    isDark,
    muted = false,
    className,
}: {
    isDark: boolean;
    muted?: boolean;
    className?: string;
}) {
    return (
        <DollarSign
            className={`h-3.5 w-3.5 shrink-0 ${dollarIconClass(isDark, muted)} ${className ?? ""}`}
            strokeWidth={2}
            aria-hidden
        />
    );
}

function ReadOnlyDetailField({
    label,
    value,
    required,
    isDark,
    prefix,
    /** When false, uses full-contrast styling (e.g. required fields user may edit after clicking Edit). */
    muted = true,
    /** Shows a leading $ for dollar amount fields. */
    currency = false,
}: {
    label: string;
    value: string;
    required?: boolean;
    isDark: boolean;
    prefix?: string;
    muted?: boolean;
    currency?: boolean;
}) {
    const hasValue = Boolean(value?.trim());
    const display = hasValue ? `${prefix ?? ""}${value}` : "—";
    const labelClass = muted
        ? readOnlyFieldLabelClass(isDark)
        : `text-sm font-medium ${isDark ? "text-gray-300" : "text-black"}`;
    const valueClass = muted
        ? readOnlyFieldValueClass(isDark)
        : `${FIELD_CONTROL_H} rounded-sm border px-3 text-sm leading-9 ${
              isDark
                  ? "border-gray-700 bg-muted/50 text-gray-200"
                  : "border-gray-200 bg-white text-gray-900"
          }`;

    return (
        <div className="space-y-1.5">
            <Label className={labelClass}>
                {label}
                {required ? <span className="text-red-500"> *</span> : null}
            </Label>
            {currency && hasValue ? (
                <div
                    className={`${valueClass} flex ${FIELD_CONTROL_H} items-center overflow-hidden p-0 tabular-nums`}
                >
                    <span
                        className={`inline-flex ${FIELD_CONTROL_H} items-center justify-center ${CURRENCY_ICON_SLOT_W}`}
                    >
                        <DollarSignIcon isDark={isDark} muted={muted} />
                    </span>
                    <span className="min-w-0 flex-1 truncate px-2 leading-9">{display}</span>
                </div>
            ) : (
                <p className={valueClass}>{display}</p>
            )}
        </div>
    );
}

export interface ApprovedApplicationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Plain SCRUBBING scrubbing flow — recommend for approval wording. */
    isPlainUnderwriter?: boolean;
    /** When true, show ISO approval-mail CTA (Underwriter or Super Admin). */
    isFinalUnderwriter?: boolean;
    /** UNDERWRITER role: review/edit offer terms, then mark as Underwriter Approved. */
    isUnderwriterDirectApprove?: boolean;
    /** Called when UNDERWRITER clicks Proceed to Generate Contract */
    onProceedToContract?: () => void;
    /** When true, send the "offer updated" resend template to ISO. */
    resendApprovalEmail?: boolean;
    /** Pre-check reinitiate contract when resending (user can toggle in the modal). */
    reinitiateContract?: boolean;
    /** Underwriter role — show reinitiate contract in approval modals. */
    showReinitiateContractCheckbox?: boolean;
    /** Called after offer-decision is saved (e.g. Underwriter refresh for resend-mail state). */
    onOfferUpdated?: () => void;
    /** Underwriter ISO mail flow — editable To/CC recipients below offer details. */
    showIsoRecipientFields?: boolean;
}

const ISO_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatCurrencyInputLive(raw: string): string {
    return formatNumberUSForInput(raw);
}

/** On blur, lock amount fields to en-US currency with two decimal places (e.g. 12,000.00). */
function formatCurrencyInputCommit(raw: string): string {
    const num = parseNumberUS(raw);
    if (!Number.isFinite(num)) return "";
    return formatNumberUS(num);
}

interface UsCurrencyInputProps extends Omit<ComponentProps<typeof Input>, "onChange" | "value"> {
    value: string;
    onChange: (next: string) => void;
    isDark?: boolean;
    /** Softer $ color for calculated / non-editable amount fields. */
    muted?: boolean;
}

const UsCurrencyInput = forwardRef<HTMLInputElement, UsCurrencyInputProps>(
    function UsCurrencyInput(
        { value, onChange, className, isDark = false, muted = false, onBlur, readOnly, ...rest },
        ref,
    ) {
        return (
            <div
                className={`flex ${FIELD_CONTROL_H} w-full min-w-0 items-center overflow-hidden rounded-sm border outline-none ${className ?? ""}`}
            >
                <span
                    className={`inline-flex ${FIELD_CONTROL_H} items-center justify-center ${CURRENCY_ICON_SLOT_W}`}
                    aria-hidden
                >
                    <DollarSignIcon isDark={isDark} muted={muted} />
                </span>
                <Input
                    {...rest}
                    ref={ref}
                    readOnly={readOnly}
                    value={value}
                    onChange={(e) => onChange(formatCurrencyInputLive(e.target.value))}
                    onBlur={(e) => {
                        onBlur?.(e);
                        const committed = formatCurrencyInputCommit(value);
                        if (committed !== value) {
                            onChange(committed);
                        }
                    }}
                    className={`${FIELD_CONTROL_H} flex-1 min-w-0 rounded-none border-0 bg-transparent py-0 pl-2 pr-3 text-sm tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 ${readOnly ? "cursor-default" : ""}`}
                />
            </div>
        );
    },
);

interface UsNumberInputProps extends Omit<ComponentProps<typeof Input>, "onChange" | "value"> {
    value: string;
    onChange: (next: string) => void;
}

/** Factor rate input — preserves fractional precision (not forced to .00). */
const UsRateInput = forwardRef<HTMLInputElement, UsNumberInputProps>(
    function UsRateInput({ value, onChange, className, onBlur, ...rest }, ref) {
        return (
            <Input
                {...rest}
                ref={ref}
                value={value}
                onChange={(e) => onChange(formatNumberUSForInput(e.target.value))}
                onBlur={(e) => {
                    onBlur?.(e);
                    const committed = formatRateUSCommit(value);
                    if (committed !== value) {
                        onChange(committed);
                    }
                }}
                className={className}
            />
        );
    },
);

const UNDERWRITER_APPROVED_STAGE = "Underwriter Approved";

const ApprovedApplicationModal = ({
    open,
    onOpenChange,
    isPlainUnderwriter,
    isFinalUnderwriter,
    isUnderwriterDirectApprove,
    onProceedToContract,
    resendApprovalEmail,
    reinitiateContract,
    showReinitiateContractCheckbox,
    onOfferUpdated,
    showIsoRecipientFields,
}: ApprovedApplicationModalProps) => {
    const dispatch = useDispatch<AppDispatch>();
    const { data: applicationData } = useSelector((state: RootState) => state.applicationDetail);

    const { control, handleSubmit, formState: { errors }, reset, setValue, getValues } = useForm<ApprovalFormValues>({
        mode: "onSubmit",
        defaultValues: {
            requestAmount: "",
            tenure: "",
            paybackAmount: "",
            originationFee: ORIGINATION_FEE_FIXED,
            approvedAmount: "",
            factorRate: "",
            repay: "",
            monthlyRepayment: "",
            achFrequency: "",
        },
    });

    // Align application identifier resolution with BankAnalysis / ApplicationDetails:
    // prefer business numeric applicationId, then fall back to MongoDB _id.
    const applicationId =
        (applicationData as any)?.applicationId ??
        (applicationData as any)?._id ??
        null;
    const applicationUuid =
        (applicationData as any)?._id ??
        (applicationData as any)?.id ??
        null;
    /** Scrubbing preview PDF, attached to the recommend mail as Breakdown.pdf. */
    const breakdownPdf = useBreakdownPdf(
        applicationId != null ? String(applicationId) : null,
    );
    /**
     * Scrubbing Preview Copy HTML for the ISO approval / offer-updated mail (the API
     * appends it below the template). Null when no preview number is > 0; a
     * failure is logged and the mail goes out without it.
     */
    const captureScrubbingPreviewHtml = async (): Promise<string | null> => {
        try {
            return await breakdownPdf.capturePreviewHtml();
        } catch (err) {
            console.error("Scrubbing preview HTML capture failed:", err);
            return null;
        }
    };

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUpdatingOffer, setIsUpdatingOffer] = useState(false);
    const [offerDecisionLoading, setOfferDecisionLoading] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [persistedDecision, setPersistedDecision] = useState<"approved" | "declined">("approved");
    const editSnapshotRef = useRef<ApprovalFormValues | null>(null);
    /** Fields not edited in this modal but must be preserved on offer-decision save. */
    const offerPreserveRef = useRef<{
        position: string | null;
        ourRemit: number | null;
    }>({ position: null, ourRemit: null });
    /** To chips for every mail this popup sends (ISO approval, UW approve, scrubber recommend). */
    const [toEmails, setToEmails] = useState<string[]>([]);
    const [toDraft, setToDraft] = useState("");
    const [ccEmails, setCcEmails] = useState<string[]>([]);
    const [ccDraft, setCcDraft] = useState("");
    type ScrubberMailPreview = {
        underwriters: Array<{ name: string; email: string }>;
        submissionAttachments: Array<{ name: string; size?: number }>;
    };
    const [scrubberMailPreview, setScrubberMailPreview] = useState<ScrubberMailPreview | null>(null);
    const [scrubberMailPreviewLoading, setScrubberMailPreviewLoading] = useState(false);
    const [reinitiateContractChecked, setReinitiateContractChecked] = useState(false);
    const isoEmailTouchedRef = useRef(false);
    const isoRecipientWasOpenRef = useRef(false);
    const reinitiateContractTouchedRef = useRef(false);
    const showReinitiateContractOption = Boolean(showReinitiateContractCheckbox);
    const effectiveResendApprovalEmail =
        Boolean(resendApprovalEmail) ||
        (showReinitiateContractOption && reinitiateContractChecked);

    const linkedIso = (applicationData as { iso?: { name?: string; email?: string; phone?: string } | null })
        ?.iso;
    const hasLinkedIso = Boolean(linkedIso?.name || linkedIso?.email || linkedIso?.phone);
    const linkedIsoName = String(linkedIso?.name ?? "").trim();
    const linkedIsoEmail = String(linkedIso?.email ?? "").trim();
    const linkedIsoPhone = String(linkedIso?.phone ?? "").trim();
    const merchantClientEmail = String(
        (applicationData as { client?: { business?: { email?: string }; owner?: { email?: string } } })
            ?.client?.business?.email ||
            (applicationData as { client?: { owner?: { email?: string } } })?.client?.owner?.email ||
            "",
    ).trim();

    const complianceApplicationId =
        applicationUuid ??
        (applicationData as { applicationId?: string | number })?.applicationId?.toString() ??
        (applicationId != null ? String(applicationId) : null);

    const useWideApprovalLayout = false;

    const loadOfferDecision = async () => {
        if (!open || !applicationId) return;
        try {
            setOfferDecisionLoading(true);
            const res = await axiosGet("/offer-decisions", {
                params: { application: applicationId },
            });
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

            setPersistedDecision(
                apiData?.decision === "declined" ? "declined" : "approved",
            );

            const formValues = buildApprovalFormFromApi(
                apiData,
                applicationData?.loanAmount,
            );
            reset(formValues);
            editSnapshotRef.current = formValues;
        } catch (error) {
            console.error("Failed to load offer decision for modal:", error);
            offerPreserveRef.current = { position: null, ourRemit: null };
            const fallback = buildApprovalFormFromApi(
                null,
                applicationData?.loanAmount,
            );
            reset(fallback);
            editSnapshotRef.current = fallback;
            setPersistedDecision("approved");
        } finally {
            setOfferDecisionLoading(false);
        }
    };

    useEffect(() => {
        if (!open) {
            setIsEditMode(false);
            return;
        }
        void loadOfferDecision();
    }, [open, applicationId, applicationData?.loanAmount]);

    // Cc from the ISO's submission email, for the mails that go to the ISO
    // (approval / updated offer, UW direct approve). Not the internal
    // Recommend-to-UW mail.
    const submissionCc = useSubmissionCcPrefill({
        // Same id the Linked ISO card in this modal fetches with.
        applicationId: complianceApplicationId ?? submissionCcApplicationId(applicationData),
        enabled: Boolean(open && (showIsoRecipientFields || isUnderwriterDirectApprove)),
        setCcEmails,
    });

    const resetIsoRecipientFields = () => {
        setToEmails([]);
        setToDraft("");
        setCcEmails([]);
        setCcDraft("");
        isoEmailTouchedRef.current = false;
    };

    useEffect(() => {
        if (!open) {
            setReinitiateContractChecked(false);
            reinitiateContractTouchedRef.current = false;
            return;
        }
        if (!showReinitiateContractOption) {
            setReinitiateContractChecked(false);
            reinitiateContractTouchedRef.current = false;
            return;
        }
        if (reinitiateContractTouchedRef.current) return;
        setReinitiateContractChecked(
            reinitiateContract ??
                applicationNeedsContractReinitiation(
                    applicationData as Record<string, unknown> | null,
                ),
        );
    }, [open, showReinitiateContractOption, reinitiateContract, applicationData]);

    useEffect(() => {
        if (!showIsoRecipientFields) {
            if (isoRecipientWasOpenRef.current) {
                resetIsoRecipientFields();
            }
            isoRecipientWasOpenRef.current = false;
            return;
        }

        if (!open) {
            if (isoRecipientWasOpenRef.current) {
                resetIsoRecipientFields();
            }
            isoRecipientWasOpenRef.current = false;
            return;
        }

        if (!isoRecipientWasOpenRef.current) {
            isoEmailTouchedRef.current = false;
            const prefillCc =
                merchantClientEmail && ISO_EMAIL_PATTERN.test(merchantClientEmail)
                    ? [merchantClientEmail]
                    : [];
            setCcEmails(mergeCcEmails(prefillCc, submissionCc));
            setCcDraft("");
            setToEmails(linkedIsoEmail ? [linkedIsoEmail] : []);
            setToDraft("");
        }

        isoRecipientWasOpenRef.current = true;
    }, [open, showIsoRecipientFields, linkedIsoEmail, merchantClientEmail]);

    useEffect(() => {
        if (!open || !showIsoRecipientFields || isoEmailTouchedRef.current) return;
        if (linkedIsoEmail) {
            setToEmails([linkedIsoEmail]);
        }
    }, [open, showIsoRecipientFields, linkedIsoEmail]);

    const addCcEmail = (raw: string) => {
        const email = raw.trim();
        if (!email) return;
        if (!ISO_EMAIL_PATTERN.test(email)) {
            toast.error("Enter a valid email address");
            return;
        }
        if (ccEmails.some((e) => e.toLowerCase() === email.toLowerCase())) {
            toast.warning("Email already added");
            return;
        }
        setCcEmails([...ccEmails, email]);
        setCcDraft("");
    };

    const addToEmail = (raw: string) => {
        const email = raw.trim();
        if (!email) return;
        if (!ISO_EMAIL_PATTERN.test(email)) {
            toast.error("Enter a valid email address");
            return;
        }
        if (toEmails.some((e) => e.toLowerCase() === email.toLowerCase())) {
            toast.warning("Email already added");
            return;
        }
        isoEmailTouchedRef.current = true;
        setToEmails([...toEmails, email]);
        setToDraft("");
    };

    useEffect(() => {
        if (!open || !isPlainUnderwriter || !applicationUuid) {
            setScrubberMailPreview(null);
            setScrubberMailPreviewLoading(false);
            return;
        }
        let cancelled = false;
        setScrubberMailPreviewLoading(true);
        void axiosGet(
            `/applications/${encodeURIComponent(applicationUuid)}/scrubber-recommendation-mail-preview`,
        )
            .then((response) => {
                if (!cancelled) {
                    setScrubberMailPreview(response.data?.data ?? null);
                }
            })
            .catch(() => {
                if (!cancelled) setScrubberMailPreview(null);
            })
            .finally(() => {
                if (!cancelled) setScrubberMailPreviewLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, isPlainUnderwriter, applicationUuid]);

    // Scrubber recommend and underwriter approve both confirm recipients here; the
    // underwriter's goes to the submissions inbox for Super Admin, never the ISO.
    const showRecommendOrUwApproveMailFields =
        Boolean(isPlainUnderwriter || isUnderwriterDirectApprove) && !showIsoRecipientFields;
    /** Underwriter approve: To is the submissions inbox (subs@). */
    const submissionsInbox = useSubmissionsInboxEmails();

    useEffect(() => {
        if (!open || !showRecommendOrUwApproveMailFields) {
            if (!showIsoRecipientFields) {
                // Keep ISO-flow state intact when that panel owns recipients.
            }
            return;
        }
        setCcDraft("");
        if (isUnderwriterDirectApprove) {
            // Internal mail to the submissions inbox: no ISO / client CCs.
            setCcEmails([]);
        } else if (isPlainUnderwriter) {
            setCcEmails([]);
            isoEmailTouchedRef.current = false;
        }
    }, [
        open,
        showRecommendOrUwApproveMailFields,
        isUnderwriterDirectApprove,
        isPlainUnderwriter,
        linkedIsoEmail,
        merchantClientEmail,
        showIsoRecipientFields,
    ]);

    // Default To for the internal mails: subs@ for the underwriter approve,
    // the designated underwriters for the scrubber recommend. Editable chips.
    const scrubberPreviewToKey = (scrubberMailPreview?.underwriters || [])
        .map((uw) => uw.email)
        .join(",");
    useEffect(() => {
        if (!open) {
            if (!showIsoRecipientFields) {
                setToEmails([]);
                setToDraft("");
            }
            return;
        }
        if (!showRecommendOrUwApproveMailFields || isoEmailTouchedRef.current) return;
        if (isUnderwriterDirectApprove) {
            setToEmails(submissionsInbox);
        } else if (isPlainUnderwriter) {
            setToEmails(scrubberPreviewToKey ? scrubberPreviewToKey.split(",") : []);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        open,
        showRecommendOrUwApproveMailFields,
        showIsoRecipientFields,
        isUnderwriterDirectApprove,
        isPlainUnderwriter,
        submissionsInbox.join(","),
        scrubberPreviewToKey,
    ]);

    /** To chips plus any address still typed in the To field; null (with a toast) when invalid/empty. */
    const resolveToRecipientsForSend = (): string[] | null => {
        const list = [...toEmails];
        const draft = toDraft.trim();
        if (draft) {
            if (!ISO_EMAIL_PATTERN.test(draft)) {
                toast.error("Enter a valid To email address or clear the To field");
                return null;
            }
            if (!list.some((e) => e.toLowerCase() === draft.toLowerCase())) list.push(draft);
        }
        if (list.length === 0) {
            toast.error("Add at least one To recipient");
            return null;
        }
        return list;
    };

    const dealDetailApplicationNumber =
        (applicationData as { applicationId?: string | number } | null)?.applicationId != null
            ? String((applicationData as { applicationId?: string | number }).applicationId)
            : applicationId != null
              ? String(applicationId)
              : "—";
    const dealDetailBusinessName =
        String(
            (applicationData as { client?: { businessName?: string; business?: { name?: string } } })
                ?.client?.businessName ||
                (applicationData as { client?: { business?: { name?: string } } })?.client?.business
                    ?.name ||
                "",
        ).trim() || "—";

    const resolveCcRecipientsForSend = (
        recipientEmail: string | string[],
    ): { emails: string[]; draftError?: string } => {
        const toLower = (Array.isArray(recipientEmail) ? recipientEmail : [recipientEmail]).map((e) =>
            e.toLowerCase(),
        );
        const merged = [...ccEmails];
        const trimmedDraft = ccDraft.trim();
        if (trimmedDraft) {
            if (!ISO_EMAIL_PATTERN.test(trimmedDraft)) {
                return {
                    emails: [],
                    draftError:
                        "Enter a valid CC email address or clear the CC field before sending",
                };
            }
            if (!merged.some((e) => e.toLowerCase() === trimmedDraft.toLowerCase())) {
                merged.push(trimmedDraft);
            }
        }
        return {
            emails: merged.filter((e) => !toLower.includes(e.toLowerCase())),
        };
    };

    const isoRecipientHelper = (() => {
        if (hasLinkedIso && linkedIsoEmail) {
            return "Prefilled from the linked ISO record. Edit if needed.";
        }
        if (hasLinkedIso && !linkedIsoEmail) {
            return "Linked ISO has no email on file — enter one below.";
        }
        return "Enter the ISO email that should receive the approval template.";
    })();

    const handleStartEdit = () => {
        editSnapshotRef.current = getValues();
        setValue("originationFee", ORIGINATION_FEE_FIXED, { shouldDirty: false });
        setIsEditMode(true);
    };

    const syncDerivedFieldsInEditMode = (drivers: {
        approvedAmount: string;
        factorRate: string;
        tenure: string;
        achFrequency: string;
    }) => {
        const derived = deriveCalculatedFieldsFromDrivers(drivers);
        const empty = { paybackAmount: "", repay: "", monthlyRepayment: "" };
        const next = derived ?? empty;

        setValue("paybackAmount", next.paybackAmount, {
            shouldDirty: true,
            shouldValidate: false,
        });
        setValue("repay", next.repay, {
            shouldDirty: true,
            shouldValidate: false,
        });
        setValue("monthlyRepayment", next.monthlyRepayment, {
            shouldDirty: true,
            shouldValidate: false,
        });
    };

    const handleCancelEdit = () => {
        if (editSnapshotRef.current) {
            reset(editSnapshotRef.current);
        }
        setIsEditMode(false);
    };

    const persistOfferDecisionFromForm = async (data: ApprovalFormValues) => {
        if (!applicationId) {
            throw new Error("Missing application id. Please reload and try again.");
        }

        const feesDollars = feesPercentToDollarsFromFunded(
            data.approvedAmount,
            ORIGINATION_FEE_FIXED,
        );

        const offerNum = parseNumberUS(data.approvedAmount);
        const rateNum = parseNumberUS(data.factorRate);
        const termStr = parseTermFromTenure(data.tenure) ?? "";
        const repaymentStack =
            offerNum > 0 && rateNum > 0 && termStr
                ? deriveOfferRepaymentStack({
                      advance: offerNum,
                      factorRate: rateNum,
                      term: termStr,
                      frequency: data.achFrequency || "Daily",
                  })
                : null;

        const derivedForSave = deriveCalculatedFieldsFromDrivers({
            approvedAmount: data.approvedAmount,
            factorRate: data.factorRate,
            tenure: data.tenure,
            achFrequency: data.achFrequency,
        });

        const paybackSaved =
            repaymentStack?.payback ??
            (parseNumberUS(derivedForSave?.paybackAmount ?? data.paybackAmount) ||
                null);

        const saveRes = await axiosPost("/offer-decisions", {
            applicationId,
            decision: persistedDecision,
            position: offerPreserveRef.current.position,
            ourRemit: offerPreserveRef.current.ourRemit,
            offer: offerNum > 0 ? offerNum : null,
            rate: rateNum > 0 ? rateNum : null,
            term: termStr || null,
            frequency: data.achFrequency || null,
            fees: feesDollars,
            totalRemit: paybackSaved,
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

        emitOfferDecisionUpdated(applicationId);
        await dispatch(getOfferDecisionByApplication(String(applicationId))).unwrap();
        onOfferUpdated?.();

        const refreshedDerived =
            derivedForSave ??
            (repaymentStack ? stackToCalculatedFormFields(repaymentStack) : null);

        const refreshed = {
            ...data,
            paybackAmount: refreshedDerived?.paybackAmount ?? data.paybackAmount,
            repay: refreshedDerived?.repay ?? data.repay,
            monthlyRepayment:
                refreshedDerived?.monthlyRepayment ?? data.monthlyRepayment,
            originationFee: ORIGINATION_FEE_FIXED,
        };
        reset(refreshed);
        editSnapshotRef.current = refreshed;
        setIsEditMode(false);

        return refreshed;
    };

    const handleUpdateOffer = handleSubmit(async (data) => {
        setIsUpdatingOffer(true);
        const toastId = toast.loading("Updating offer details...");
        try {
            await persistOfferDecisionFromForm(data);
            toast.update(toastId, {
                render: "Offer details updated successfully.",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });
        } catch (error) {
            console.error("Failed to update offer decision:", error);
            toast.update(toastId, {
                render: "Failed to update offer details. Please try again.",
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setIsUpdatingOffer(false);
        }
    });

    const handleUnderwriterDirectApprove = handleSubmit(async (data) => {
        if (!applicationUuid) {
            toast.error("Missing application id. Please reload and try again.");
            return;
        }
        // No ISO email here: the decision goes to the submissions inbox (plus the CC
        // confirmed above) for Super Admin, who sends the ISO approval.
        const uwApproveTo = resolveToRecipientsForSend();
        if (!uwApproveTo) return;
        const ccResolution = resolveCcRecipientsForSend(uwApproveTo);
        if (ccResolution.draftError) {
            toast.error(ccResolution.draftError);
            return;
        }
        setIsSubmitting(true);
        const toastId = toast.loading("Approving application...");
        try {
            await persistOfferDecisionFromForm(data);
            await dispatch(
                updateApplicationQueue({
                    id: applicationUuid,
                    data: {
                        currentQueue: UNDERWRITER_APPROVED_STAGE,
                        toEmails: uwApproveTo,
                        ccEmails: ccResolution.emails,
                    },
                }),
            ).unwrap();
            if (showReinitiateContractOption && reinitiateContractChecked) {
                await dispatch(reinitiateContractAction(String(applicationUuid))).unwrap();
            }
            await dispatch(getApplicationById(String(applicationId ?? applicationUuid)));
            toast.update(toastId, {
                render:
                    showReinitiateContractOption && reinitiateContractChecked
                        ? "Application set to Underwriter Approved and contract reinitiated for regeneration."
                        : "Application set to Underwriter Approved.",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });
            onOpenChange(false);
        } catch (err) {
            console.error("Failed to approve application:", err);
            toast.update(toastId, {
                render: "Failed to approve application. Please try again.",
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setIsSubmitting(false);
        }
    });

    const handleSendIsoApprovalMail = handleSubmit(async (data) => {
        if (!applicationUuid) {
            onProceedToContract?.();
            onOpenChange(false);
            return;
        }

        if (showIsoRecipientFields) {
            const isoToList = resolveToRecipientsForSend();
            if (!isoToList) return;
            const recipientEmail = isoToList[0];
            const ccResolution = resolveCcRecipientsForSend(isoToList);
            if (ccResolution.draftError) {
                toast.error(ccResolution.draftError);
                return;
            }

            setIsSubmitting(true);
            const toastId = toast.loading(
                effectiveResendApprovalEmail
                    ? "Sending updated offer email to ISO..."
                    : "Sending approval email to ISO...",
            );
            try {
                await persistOfferDecisionFromForm(data);
                const approvalEmailHtml = effectiveResendApprovalEmail
                    ? renderOfferUpdatedEmailHtml({
                          client_name: APPLICATION_APPROVAL_CLIENT_NAME_PLACEHOLDER,
                          company_name: APPLICATION_APPROVAL_COMPANY_NAME_PLACEHOLDER,
                          calculate_approval_url: APPLICATION_APPROVAL_URL_PLACEHOLDER,
                          view_application_url: APPLICATION_APPROVAL_URL_PLACEHOLDER,
                      })
                    : renderApplicationApprovalEmailHtml({
                          client_name: APPLICATION_APPROVAL_CLIENT_NAME_PLACEHOLDER,
                          company_name: APPLICATION_APPROVAL_COMPANY_NAME_PLACEHOLDER,
                          calculate_approval_url: APPLICATION_APPROVAL_URL_PLACEHOLDER,
                          view_application_url: APPLICATION_APPROVAL_URL_PLACEHOLDER,
                      });
                const scrubbingPreviewHtml = await captureScrubbingPreviewHtml();
                await dispatch(
                    sendApprovalEmail({
                        applicationId: applicationUuid,
                        resend: effectiveResendApprovalEmail,
                        ...(scrubbingPreviewHtml ? { scrubbingPreviewHtml } : {}),
                        reinitiateContract: reinitiateContractChecked,
                        emailHtml: approvalEmailHtml,
                        emailSubject: effectiveResendApprovalEmail
                            ? OFFER_UPDATED_EMAIL_SUBJECT
                            : APPLICATION_APPROVAL_EMAIL_SUBJECT,
                        isoEmail: recipientEmail,
                        toEmails: isoToList,
                        ccEmails: ccResolution.emails,
                    }),
                ).unwrap();
                if (applicationId ?? applicationUuid) {
                    await dispatch(
                        getApplicationById(String(applicationId ?? applicationUuid)),
                    );
                }
                toast.update(toastId, {
                    render: reinitiateContractChecked
                        ? "Updated offer email sent to the ISO and contract reinitiated for regeneration."
                        : effectiveResendApprovalEmail
                          ? "Updated offer email sent to the ISO. Application marked as approved by you."
                          : "Approval email sent to the ISO. Application marked as approved by you.",
                    type: "success",
                    isLoading: false,
                    autoClose: 3000,
                });
                onProceedToContract?.();
                onOpenChange(false);
                resetIsoRecipientFields();
            } catch (emailError) {
                console.error("Failed to send approval email:", emailError);
                const backendMessage =
                    typeof emailError === "string"
                        ? emailError
                        : emailError &&
                            typeof emailError === "object" &&
                            "message" in emailError
                          ? String((emailError as { message?: string }).message)
                          : null;
                toast.update(toastId, {
                    render:
                        backendMessage ||
                        (effectiveResendApprovalEmail
                            ? "The ISO updated-offer email could not be sent."
                            : "The ISO approval email could not be sent."),
                    type: "error",
                    isLoading: false,
                    autoClose: 5000,
                });
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        setIsSubmitting(true);
        const toastId = toast.loading(
            effectiveResendApprovalEmail
                ? "Sending updated offer email to ISO..."
                : "Sending approval email to ISO...",
        );
        try {
            try {
                await persistOfferDecisionFromForm(data);
                const approvalEmailHtml = effectiveResendApprovalEmail
                    ? renderOfferUpdatedEmailHtml({
                          client_name: APPLICATION_APPROVAL_CLIENT_NAME_PLACEHOLDER,
                          company_name: APPLICATION_APPROVAL_COMPANY_NAME_PLACEHOLDER,
                          calculate_approval_url: APPLICATION_APPROVAL_URL_PLACEHOLDER,
                          view_application_url: APPLICATION_APPROVAL_URL_PLACEHOLDER,
                      })
                    : renderApplicationApprovalEmailHtml({
                          client_name: APPLICATION_APPROVAL_CLIENT_NAME_PLACEHOLDER,
                          company_name: APPLICATION_APPROVAL_COMPANY_NAME_PLACEHOLDER,
                          calculate_approval_url: APPLICATION_APPROVAL_URL_PLACEHOLDER,
                          view_application_url: APPLICATION_APPROVAL_URL_PLACEHOLDER,
                      });
                const scrubbingPreviewHtml = await captureScrubbingPreviewHtml();
                await dispatch(
                    sendApprovalEmail({
                        applicationId: applicationUuid,
                        resend: effectiveResendApprovalEmail,
                        ...(scrubbingPreviewHtml ? { scrubbingPreviewHtml } : {}),
                        reinitiateContract: reinitiateContractChecked,
                        emailHtml: approvalEmailHtml,
                        emailSubject: effectiveResendApprovalEmail
                            ? OFFER_UPDATED_EMAIL_SUBJECT
                            : APPLICATION_APPROVAL_EMAIL_SUBJECT,
                    }),
                ).unwrap();
                if (applicationId ?? applicationUuid) {
                    await dispatch(
                        getApplicationById(String(applicationId ?? applicationUuid)),
                    );
                }
                toast.update(toastId, {
                    render: reinitiateContractChecked
                        ? "Updated offer email sent to the ISO and contract reinitiated for regeneration."
                        : effectiveResendApprovalEmail
                          ? "Updated offer email sent to the linked ISO when that ISO has an email on file."
                          : "Approval email sent to the linked ISO when that ISO has an email on file.",
                    type: "success",
                    isLoading: false,
                    autoClose: 3000,
                });
            } catch (emailError) {
                console.error("Failed to send approval email:", emailError);
                const backendMessage =
                    typeof emailError === "string"
                        ? emailError
                        : emailError &&
                            typeof emailError === "object" &&
                            "message" in emailError
                          ? String((emailError as { message?: string }).message)
                          : null;
                toast.update(toastId, {
                    render:
                        backendMessage ||
                        (effectiveResendApprovalEmail
                            ? "The ISO updated-offer email could not be sent (link an ISO with email, check SMTP, or try again)."
                            : "The ISO approval email could not be sent (link an ISO with email, check SMTP, or try again)."),
                    type: "warning",
                    isLoading: false,
                    autoClose: 5000,
                });
            }

            onProceedToContract?.();
            onOpenChange(false);
        } finally {
            setIsSubmitting(false);
        }
    });

    const onSubmit = async (
        data: ApprovalFormValues,
        scrubberRecommendation?: "Recommend Approval" | "Recommend Decline",
    ) => {
        if (!applicationUuid || !applicationId) {
            console.error("No application ID available");
            onOpenChange(false);
            return;
        }
        const isDeclineRecommendation =
            scrubberRecommendation === "Recommend Decline";

        if (isPlainUnderwriter) {
            // To chips (prefilled with the designated underwriters, editable).
            const scrubberTo = isDeclineRecommendation ? [] : resolveToRecipientsForSend();
            if (!scrubberTo) return;
            const ccResolution = resolveCcRecipientsForSend(scrubberTo);
            if (ccResolution.draftError) {
                toast.error(ccResolution.draftError);
                return;
            }
            const toLower = new Set(scrubberTo.map((e) => e.toLowerCase()));
            const scrubberCc = ccResolution.emails.filter(
                (e) => !toLower.has(e.toLowerCase()),
            );
            setIsSubmitting(true);
            const toastId = toast.loading(
                isDeclineRecommendation
                    ? "Sending recommend request for decline..."
                    : "Sending recommend request for approval...",
            );
            try {
                if (!isDeclineRecommendation) {
                    try {
                        await persistOfferDecisionFromForm(data);
                    } catch (persistErr) {
                        console.error(
                            "Failed to persist offer before scrubber recommend approval:",
                            persistErr,
                        );
                        toast.update(toastId, {
                            render: resolveActionErrorMessage(
                                persistErr,
                                "Could not save offer details before recommending approval. Please try again.",
                            ),
                            type: "error",
                            isLoading: false,
                            autoClose: 5000,
                        });
                        return;
                    }
                }
                // Scrubbing preview PDF → Breakdown.pdf on the mail; null when the
                // deal has no positions and no bank analysis.
                const breakdownPdfBase64 = await breakdownPdf.capture();
                await dispatch(
                    updateApplicationQueue({
                        id: applicationUuid,
                        data: {
                            currentQueue: "Underwriter",
                            ...(scrubberRecommendation
                                ? { scrubberRecommendation }
                                : {}),
                            ...(scrubberTo.length ? { toEmails: scrubberTo } : {}),
                            ccEmails: scrubberCc,
                            ...(breakdownPdfBase64 ? { breakdownPdf: breakdownPdfBase64 } : {}),
                        },
                    }),
                ).unwrap();
                await dispatch(getApplicationById(String(applicationId ?? applicationUuid)));
                toast.update(toastId, {
                    render: isDeclineRecommendation
                        ? "Decline recommendation sent. Underwriters can review it from their queue."
                        : "Approval recommendation sent. Underwriters can claim this application from their queue.",
                    type: "success",
                    isLoading: false,
                    autoClose: 3000,
                });
                onOpenChange(false);
            } catch (err) {
                console.error("Failed to send to Underwriter:", err);
                toast.update(toastId, {
                    render: "Failed to send application to Underwriter. Please try again.",
                    type: "error",
                    isLoading: false,
                    autoClose: 4000,
                });
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        setIsSubmitting(true);
        const toastId = toast.loading("Sending application to Underwriter...");
        try {
            await dispatch(updateApplicationQueue({
                id: applicationUuid,
                data: { currentQueue: "Underwriter" },
            })).unwrap();
            await dispatch(updateApplication({
                id: applicationUuid,
                data: {
                    status: "Sent to Underwriter",
                    underwriterApproval: true,
                    approvedAt: new Date().toISOString(),
                },
            })).unwrap();

            toast.update(toastId, {
                render: "Application has been sent to Underwriter and they have been notified.",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });
            onOpenChange(false);
        } catch (err) {
            console.error("Failed to send to Underwriter:", err);
            toast.update(toastId, {
                render: "Failed to send application to Underwriter. Please try again.",
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const inputClass = `${FIELD_CONTROL_H} ${isDark ? "bg-muted border-gray-700 text-gray-200" : "bg-white border-gray-200"} px-3 py-0 text-sm rounded-sm outline-none`;

    const loanFieldsGridClass = useWideApprovalLayout
        ? "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4"
        : "grid grid-cols-2 gap-x-4 gap-y-3";

    const loanDetailsPanelClass = `${isDark ? "bg-[#262827]" : "bg-green-50"} ${
        useWideApprovalLayout ? "p-6" : "p-4"
    } rounded-lg`;

    const formValues = useWatch({ control });
    const watchedApprovedAmount = useWatch({ control, name: "approvedAmount" });
    /**
     * No approved amount, no decision: approve, the approval mail and the
     * scrubber recommendation all stay disabled until an amount above 0 is set.
     */
    const approvedAmountMissing = !(Number(parseNumberUS(watchedApprovedAmount ?? "")) > 0);
    const watchedFactorRate = useWatch({ control, name: "factorRate" });
    const watchedTenure = useWatch({ control, name: "tenure" });
    const watchedAchFrequency = useWatch({ control, name: "achFrequency" });

    useEffect(() => {
        if (!isEditMode) return;

        syncDerivedFieldsInEditMode({
            approvedAmount: watchedApprovedAmount ?? "",
            factorRate: watchedFactorRate ?? "",
            tenure: watchedTenure ?? "",
            achFrequency: watchedAchFrequency ?? "",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only recalc when user-editable drivers change
    }, [
        isEditMode,
        watchedApprovedAmount,
        watchedFactorRate,
        watchedTenure,
        watchedAchFrequency,
    ]);

    const frequencyPeriodLabel = getFrequencyPeriodLabel(
        formValues.achFrequency ?? watchedAchFrequency ?? "",
    );

    const reinitiateContractCheckbox = showReinitiateContractOption ? (
        <div
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                isDark
                    ? "border-gray-700 bg-muted/30"
                    : "border-gray-200 bg-[#F9FAFD]"
            }`}
        >
            <Checkbox
                id="reinitiate-contract-on-resend"
                checked={reinitiateContractChecked}
                onCheckedChange={(checked: boolean | "indeterminate") => {
                    reinitiateContractTouchedRef.current = true;
                    setReinitiateContractChecked(checked === true);
                }}
                disabled={isSubmitting}
                className="mt-0.5"
            />
            <div className="min-w-0">
                <Label
                    htmlFor="reinitiate-contract-on-resend"
                    className={`cursor-pointer text-sm font-semibold ${
                        isDark ? "text-gray-200" : "text-gray-900"
                    }`}
                >
                    Reinitiate contract
                </Label>
                <p
                    className={`mt-1 text-xs leading-snug ${
                        isDark ? "text-gray-400" : "text-gray-600"
                    }`}
                >
                    Archive the prior contract envelope and reset the deal so
                    Operations can regenerate the contract after the ISO
                    re-approves the updated offer.
                </p>
            </div>
        </div>
    ) : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={
                    useWideApprovalLayout
                        ? "sm:max-w-6xl max-h-[min(88vh,780px)] overflow-hidden flex flex-col"
                        : "sm:max-w-2xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto flex flex-col gap-3"
                }
            >
                <DialogHeader>
                    <DialogTitle className={`text-xl font-semibold ${isDark ? 'text-gray-200' : 'text-black'}`}>
                        {showIsoRecipientFields
                            ? resendApprovalEmail
                                ? "Resend Approval Mail to ISO"
                                : "Send Approval Mail to ISO"
                            : isUnderwriterDirectApprove
                            ? "Approve Submission"
                            : isFinalUnderwriter
                              ? "Approved Application"
                              : isPlainUnderwriter
                                ? "Recommend to Underwriter"
                                : "Send application to Final-scrubbing"}
                    </DialogTitle>
                    <DialogDescription className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {showIsoRecipientFields
                            ? resendApprovalEmail
                                ? "Set To/CC, review loan terms, then send the updated offer email to the ISO."
                                : "Set To/CC, review loan terms, then send the approval email to the ISO."
                            : isUnderwriterDirectApprove
                            ? "Confirm deal details and recipients, then approve."
                            : isFinalUnderwriter
                              ? "Review loan terms, update the offer if needed, then send the approval email to the ISO."
                              : isPlainUnderwriter
                                ? "Confirm deal details and recipients, then recommend."
                                : "Review loan terms, then send this application to the Underwriter."}
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                    {showIsoRecipientFields ? (
                        <div className="space-y-4 rounded-lg border border-border/60 p-4">
                            {hasLinkedIso ? (
                                <div
                                    className={`flex items-start gap-3 rounded-lg border p-4 ${isDark ? "border-gray-700 bg-muted/40" : "border-gray-200 bg-gray-50"}`}
                                >
                                    <Mail
                                        className={`h-4 w-4 shrink-0 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-900"}`}
                                        >
                                            {linkedIsoName || "Linked ISO"}
                                        </p>
                                        {linkedIsoPhone ? (
                                            <span
                                                className={`mt-1 flex items-center gap-1.5 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}
                                            >
                                                <Phone
                                                    className="h-3.5 w-3.5 shrink-0"
                                                    strokeWidth={2}
                                                    aria-hidden
                                                />
                                                <span className="truncate">
                                                    {formatUSPhoneNumber(linkedIsoPhone) || linkedIsoPhone}
                                                </span>
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className={`flex items-start gap-3 rounded-lg border p-4 ${isDark ? "border-amber-500/30 bg-amber-500/10" : "border-amber-200 bg-amber-50"}`}
                                >
                                    <AlertTriangle
                                        className={`h-4 w-4 shrink-0 ${isDark ? "text-amber-400" : "text-amber-600"}`}
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                    <p
                                        className={`text-sm ${isDark ? "text-amber-200" : "text-amber-800"}`}
                                    >
                                        No ISO is linked to this application. Enter a recipient email below to send the approval template.
                                    </p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                                    To <span className="text-red-500">*</span>
                                </Label>
                                <div className="flex flex-wrap gap-2">
                                    {toEmails.map((email) => (
                                        <span
                                            key={email}
                                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${isDark ? "border-gray-600 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
                                        >
                                            {email}
                                            <button
                                                type="button"
                                                className="text-gray-500 hover:text-red-600"
                                                aria-label={`Remove ${email}`}
                                                onClick={() => {
                                                    isoEmailTouchedRef.current = true;
                                                    setToEmails(toEmails.filter((e) => e !== email));
                                                }}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        type="email"
                                        placeholder="to@example.com"
                                        value={toDraft}
                                        onChange={(e) => setToDraft(e.target.value)}
                                        className={isDark ? "bg-muted border-gray-700" : ""}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addToEmail(toDraft);
                                            }
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addToEmail(toDraft)}
                                    >
                                        Add
                                    </Button>
                                </div>
                                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                    {isoRecipientHelper}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                                    CC
                                </Label>
                                <div className="mb-2 flex flex-wrap gap-2">
                                    <LockedCcChips isDark={isDark} withSubmissionsInbox={Boolean(isPlainUnderwriter) || Boolean(showIsoRecipientFields)} />
                                    {ccEmails.map((email) => (
                                        <span
                                            key={email}
                                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${isDark ? "border-gray-600 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
                                        >
                                            {email}
                                            <button
                                                type="button"
                                                className="text-gray-500 hover:text-red-600"
                                                onClick={() =>
                                                    setCcEmails(ccEmails.filter((e) => e !== email))
                                                }
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        type="email"
                                        placeholder="cc@example.com"
                                        value={ccDraft}
                                        onChange={(e) => setCcDraft(e.target.value)}
                                        className={isDark ? "bg-muted border-gray-700" : ""}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addCcEmail(ccDraft);
                                            }
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addCcEmail(ccDraft)}
                                    >
                                        Add
                                    </Button>
                                </div>
                                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                    Press Enter or Add for each CC address. Any valid address left in the field is included when you send.
                                </p>
                            </div>

                            {reinitiateContractCheckbox}
                        </div>
                    ) : null}

                    {showRecommendOrUwApproveMailFields ? (
                        <div
                            className={`space-y-3 rounded-lg border p-4 ${
                                isDark
                                    ? "border-gray-700 bg-[#262827]"
                                    : "border-gray-200 bg-[#F9FAFD]"
                            }`}
                        >
                            <dl className={`grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1.5 text-sm ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                                <dt className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>Application</dt>
                                <dd>#{dealDetailApplicationNumber}</dd>
                                <dt className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>Business</dt>
                                <dd className="break-words">{dealDetailBusinessName}</dd>
                                {linkedIsoName || linkedIsoEmail ? (
                                    <>
                                        <dt className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>ISO</dt>
                                        <dd className="break-words">{linkedIsoName || linkedIsoEmail}</dd>
                                    </>
                                ) : null}
                            </dl>

                            <div className="space-y-2">
                                <Label className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                                    To <span className="text-red-500">*</span>
                                </Label>
                                {isPlainUnderwriter && scrubberMailPreviewLoading ? (
                                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Loading recipients…</p>
                                ) : null}
                                <div className="flex flex-wrap gap-2">
                                    {toEmails.map((email) => (
                                        <span
                                            key={email}
                                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${isDark ? "border-gray-600 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
                                        >
                                            {email}
                                            <button
                                                type="button"
                                                className="text-gray-500 hover:text-red-600"
                                                aria-label={`Remove ${email}`}
                                                onClick={() => {
                                                    isoEmailTouchedRef.current = true;
                                                    setToEmails(toEmails.filter((e) => e !== email));
                                                }}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        type="email"
                                        placeholder="to@example.com"
                                        value={toDraft}
                                        onChange={(e) => setToDraft(e.target.value)}
                                        className={isDark ? "bg-muted border-gray-700" : ""}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addToEmail(toDraft);
                                            }
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addToEmail(toDraft)}
                                    >
                                        Add
                                    </Button>
                                </div>
                                {isUnderwriterDirectApprove ? (
                                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                        Goes to the submissions inbox for Super Admin. Nothing is sent to the ISO until Super Admin approves.
                                    </p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                                    CC
                                </Label>
                                <div className="mb-2 flex flex-wrap gap-2">
                                    <LockedCcChips isDark={isDark} withSubmissionsInbox={Boolean(isPlainUnderwriter)} />
                                    {ccEmails.map((email) => (
                                        <span
                                            key={email}
                                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${isDark ? "border-gray-600 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
                                        >
                                            {email}
                                            <button
                                                type="button"
                                                className="text-gray-500 hover:text-red-600"
                                                onClick={() =>
                                                    setCcEmails(ccEmails.filter((e) => e !== email))
                                                }
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        type="email"
                                        placeholder="Add CC email"
                                        value={ccDraft}
                                        onChange={(e) => setCcDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addCcEmail(ccDraft);
                                            }
                                        }}
                                        className={isDark ? "bg-muted border-gray-700" : ""}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addCcEmail(ccDraft)}
                                    >
                                        Add
                                    </Button>
                                </div>
                            </div>

                        </div>
                    ) : null}

                    {isFinalUnderwriter ? (
                        <AgentDealIsoTag
                            applicationId={
                                complianceApplicationId ??
                                (applicationId != null ? String(applicationId) : null)
                            }
                            alwaysEditable={false}
                            variant="compact"
                        />
                    ) : null}

                    <div
                        className={
                            useWideApprovalLayout
                                ? "grid grid-cols-1 lg:grid-cols-2 gap-4 items-start"
                                : "space-y-4"
                        }
                    >
                    {/* Requested & Approval Loan Details — left column */}
                    <div className={loanDetailsPanelClass}>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-black'}`}>
                                Requested & Approval Loan Details
                            </h3>
                            {!isEditMode && !offerDecisionLoading ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleStartEdit}
                                    className={`gap-2 ${isDark ? 'border-gray-600 bg-muted text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}`}
                                >
                                    <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Edit
                                </Button>
                            ) : null}
                        </div>

                        {offerDecisionLoading ? (
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading approval details…</p>
                        ) : !isEditMode ? (
                            <div className={loanFieldsGridClass}>
                                <ReadOnlyDetailField
                                    label="Request Amount"
                                    value={formValues.requestAmount ?? ""}
                                    isDark={isDark}
                                    currency
                                />
                                <ReadOnlyDetailField
                                    label="Approved Amount"
                                    value={formValues.approvedAmount ?? ""}
                                    required
                                    isDark={isDark}
                                    muted={false}
                                    currency
                                />
                                <ReadOnlyDetailField
                                    label="Factor Rate"
                                    value={formValues.factorRate ?? ""}
                                    isDark={isDark}
                                    muted={false}
                                />
                                <ReadOnlyDetailField
                                    label="Payback Amount"
                                    value={formValues.paybackAmount ?? ""}
                                    isDark={isDark}
                                    currency
                                />
                                <ReadOnlyDetailField
                                    label="Term"
                                    value={formValues.tenure ?? ""}
                                    required
                                    isDark={isDark}
                                    muted={false}
                                />
                                <ReadOnlyDetailField
                                    label="Repay"
                                    value={formValues.repay ?? ""}
                                    isDark={isDark}
                                    currency
                                />
                                <ReadOnlyDetailField
                                    label="Monthly Repayment"
                                    value={formValues.monthlyRepayment ?? ""}
                                    isDark={isDark}
                                    currency
                                />
                                <ReadOnlyDetailField
                                    label="ACH / Frequency"
                                    value={formValues.achFrequency ?? ""}
                                    required
                                    isDark={isDark}
                                    muted={false}
                                />
                                <ReadOnlyDetailField
                                    label={frequencyPeriodLabel}
                                    value={formValues.tenure ?? ""}
                                    isDark={isDark}
                                />
                            </div>
                        ) : (
                        <>
                        <div className={loanFieldsGridClass}>
                            <div className="space-y-1.5">
                                <Label className={readOnlyFieldLabelClass(isDark)}>
                                    Request Amount
                                </Label>
                                <Controller
                                    control={control}
                                    name="requestAmount"
                                    render={({ field }) => (
                                        <UsCurrencyInput
                                            ref={field.ref}
                                            name={field.name}
                                            value={field.value}
                                            onBlur={field.onBlur}
                                            onChange={field.onChange}
                                            isDark={isDark}
                                            muted
                                            readOnly
                                            tabIndex={-1}
                                            className={currencyFieldWrapperClass(isDark, true)}
                                            placeholder="e.g. 250,000"
                                            inputMode="decimal"
                                            autoComplete="off"
                                        />
                                    )}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-black"}`}>
                                    Approved Amount <span className="text-red-500">*</span>
                                </Label>
                                <Controller
                                    control={control}
                                    name="approvedAmount"
                                    rules={{ required: "Approved amount is required" }}
                                    render={({ field }) => (
                                        <>
                                            <UsCurrencyInput
                                                ref={field.ref}
                                                name={field.name}
                                                value={field.value}
                                                onBlur={field.onBlur}
                                                onChange={field.onChange}
                                                isDark={isDark}
                                                className={currencyFieldWrapperClass(isDark)}
                                                placeholder="e.g. 250,000"
                                                inputMode="decimal"
                                                autoComplete="off"
                                            />
                                            {errors.approvedAmount && (
                                                <p className="text-xs text-red-500">{errors.approvedAmount.message}</p>
                                            )}
                                        </>
                                    )}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-black"}`}>
                                    Factor Rate
                                </Label>
                                <Controller
                                    control={control}
                                    name="factorRate"
                                    render={({ field }) => (
                                        <UsRateInput
                                            ref={field.ref}
                                            name={field.name}
                                            value={field.value}
                                            onBlur={field.onBlur}
                                            onChange={field.onChange}
                                            className={inputClass}
                                            placeholder="e.g. 1.32"
                                            inputMode="decimal"
                                            autoComplete="off"
                                        />
                                    )}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className={readOnlyFieldLabelClass(isDark)}>
                                    Payback Amount
                                </Label>
                                <Controller
                                    control={control}
                                    name="paybackAmount"
                                    render={({ field }) => (
                                        <UsCurrencyInput
                                            ref={field.ref}
                                            name={field.name}
                                            value={field.value}
                                            onBlur={field.onBlur}
                                            onChange={field.onChange}
                                            isDark={isDark}
                                            muted
                                            readOnly
                                            tabIndex={-1}
                                            className={currencyFieldWrapperClass(isDark, true)}
                                            placeholder="Calculated from approved × factor rate"
                                            inputMode="decimal"
                                            autoComplete="off"
                                        />
                                    )}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-black"}`}>
                                    Term <span className="text-red-500">*</span>
                                </Label>
                                <Controller
                                    control={control}
                                    name="tenure"
                                    rules={{ required: "Tenure is required" }}
                                    render={({ field }) => (
                                        <>
                                            <Input
                                                ref={field.ref}
                                                name={field.name}
                                                value={field.value}
                                                onBlur={field.onBlur}
                                                onChange={field.onChange}
                                                className={inputClass}
                                                placeholder="e.g No. Of payments"
                                            />
                                            {errors.tenure && (
                                                <p className="text-xs text-red-500">{errors.tenure.message}</p>
                                            )}
                                        </>
                                    )}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className={readOnlyFieldLabelClass(isDark)}>
                                    Repay
                                </Label>
                                <Controller
                                    control={control}
                                    name="repay"
                                    render={({ field }) => (
                                        <UsCurrencyInput
                                            ref={field.ref}
                                            name={field.name}
                                            value={field.value}
                                            onBlur={field.onBlur}
                                            onChange={field.onChange}
                                            isDark={isDark}
                                            muted
                                            readOnly
                                            tabIndex={-1}
                                            className={currencyFieldWrapperClass(isDark, true)}
                                            placeholder="Calculated from offer, rate, term & frequency"
                                            inputMode="decimal"
                                            autoComplete="off"
                                        />
                                    )}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className={readOnlyFieldLabelClass(isDark)}>
                                    Monthly Repayment
                                </Label>
                                <Controller
                                    control={control}
                                    name="monthlyRepayment"
                                    render={({ field }) => (
                                        <UsCurrencyInput
                                            ref={field.ref}
                                            name={field.name}
                                            value={field.value}
                                            onBlur={field.onBlur}
                                            onChange={field.onChange}
                                            isDark={isDark}
                                            muted
                                            readOnly
                                            tabIndex={-1}
                                            className={currencyFieldWrapperClass(isDark, true)}
                                            placeholder="Calculated from offer, rate, term & frequency"
                                            inputMode="decimal"
                                            autoComplete="off"
                                        />
                                    )}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-black"}`}>
                                    ACH / Frequency <span className="text-red-500">*</span>
                                </Label>
                                <Controller
                                    control={control}
                                    name="achFrequency"
                                    rules={{ required: "ACH / Frequency is required" }}
                                    render={({ field }) => (
                                        <>
                                            <Select
                                                onValueChange={field.onChange}
                                                value={field.value || undefined}
                                            >
                                                <SelectTrigger className={`${FIELD_CONTROL_H} w-full rounded-sm px-3 py-0 text-sm outline-none ${isDark ? "bg-muted border-gray-700 text-gray-200" : "bg-white border-gray-200"}`}>
                                                    <SelectValue placeholder="Select frequency" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Daily">Daily</SelectItem>
                                                    <SelectItem value="Weekly">Weekly</SelectItem>
                                                    <SelectItem value="Bi-Weekly">Bi-Weekly</SelectItem>
                                                    <SelectItem value="Monthly">Monthly</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {errors.achFrequency && (
                                                <p className="text-xs text-red-500">{errors.achFrequency.message}</p>
                                            )}
                                        </>
                                    )}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className={readOnlyFieldLabelClass(isDark)}>
                                    {frequencyPeriodLabel}
                                </Label>
                                <Input
                                    value={watchedTenure ?? ""}
                                    readOnly
                                    tabIndex={-1}
                                    className={readOnlyPlainInputClass(isDark)}
                                    placeholder="Same as term"
                                />
                            </div>

                            <Controller
                                control={control}
                                name="originationFee"
                                render={({ field }) => (
                                    <input type="hidden" {...field} value={ORIGINATION_FEE_FIXED} />
                                )}
                            />
                        </div>
                        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-border/60 pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCancelEdit}
                                disabled={isUpdatingOffer}
                                className={`px-6 ${isDark ? 'border-gray-600 bg-muted text-gray-300' : 'border-gray-300 bg-white text-gray-700'}`}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={() => void handleUpdateOffer()}
                                disabled={isUpdatingOffer}
                                className="px-6"
                            >
                                {isUpdatingOffer ? "Updating…" : "Update"}
                            </Button>
                        </div>
                        </>
                        )}
                    </div>

                    </div>

                    {showReinitiateContractOption && !showIsoRecipientFields
                        ? reinitiateContractCheckbox
                        : null}
                </div>

                {/* Action Buttons */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 pt-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className={`px-6 border-gray-300 ${isDark ? 'bg-muted border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    {isUnderwriterDirectApprove ? (
                        <Button
                            type="button"
                            onClick={() => void handleUnderwriterDirectApprove()}
                            disabled={
                                approvedAmountMissing ||
                                offerDecisionLoading ||
                                isSubmitting ||
                                isUpdatingOffer
                            }
                            className="bg-green-600 hover:bg-green-700 text-white px-6"
                        >
                            {isSubmitting
                                ? "Approving…"
                                : offerDecisionLoading
                                  ? "Approve Submission"
                                : isUpdatingOffer
                                  ? "Updating…"
                                  : approvedAmountMissing
                                    ? "Enter approved amount first"
                                    : "Approve Submission"}
                        </Button>
                    ) : isFinalUnderwriter ? (
                        <Button
                            type="button"
                            onClick={() => void handleSendIsoApprovalMail()}
                            disabled={
                                approvedAmountMissing ||
                                offerDecisionLoading ||
                                isSubmitting ||
                                isEditMode ||
                                isUpdatingOffer
                            }
                            className="bg-green-600 hover:bg-green-700 text-white px-6"
                        >
                            {offerDecisionLoading || isSubmitting
                                ? "Processing…"
                                : isUpdatingOffer
                                  ? "Updating…"
                                  : isEditMode
                                    ? "Save offer changes first"
                                    : approvedAmountMissing
                                      ? "Enter approved amount first"
                                      : resendApprovalEmail
                                      ? "Resend approval mail"
                                      : "Send approval mail"}
                        </Button>
                    ) : isPlainUnderwriter ? (
                        (() => {
                            const recommendDisabled =
                                offerDecisionLoading ||
                                isSubmitting ||
                                isEditMode ||
                                isUpdatingOffer;
                            // While the offer is loading/saving keep a single guided
                            // button; otherwise reveal the two recommendation choices.
                            if (recommendDisabled) {
                                return (
                                    <Button
                                        type="button"
                                        disabled
                                        className="bg-green-600 hover:bg-green-700 cursor-pointer text-white px-6"
                                    >
                                        {isSubmitting
                                            ? "Sending…"
                                            : offerDecisionLoading
                                              ? "Loading…"
                                              : isEditMode
                                                ? "Save offer changes first"
                                                : "Updating…"}
                                    </Button>
                                );
                            }
                            return (
                                <div className="flex items-center gap-3">
                                    {/* Decline lives on the panel's Decline button (reasons + submissions inbox). */}
                                    <Button
                                        type="button"
                                        variant="success"
                                        onClick={handleSubmit((data) =>
                                            onSubmit(data, "Recommend Approval"),
                                        )}
                                        disabled={approvedAmountMissing}
                                        title={approvedAmountMissing ? "Enter approved amount first" : undefined}
                                        className="cursor-pointer px-6"
                                    >
                                        {approvedAmountMissing ? "Enter approved amount first" : "Recommend Approval"}
                                    </Button>
                                </div>
                            );
                        })()
                    ) : (
                        <Button
                            type="button"
                            onClick={handleSubmit((data) => onSubmit(data))}
                            disabled={
                                approvedAmountMissing ||
                                offerDecisionLoading ||
                                isSubmitting ||
                                isEditMode ||
                                isUpdatingOffer
                            }
                            className="bg-green-600 hover:bg-green-700 cursor-pointer text-white px-6"
                        >
                            {isSubmitting
                                ? "Sending…"
                                : offerDecisionLoading
                                    ? "Loading…"
                                    : "Send to Final-Scrubbing"}
                        </Button>
                    )}
                </div>
            </DialogContent>
            {breakdownPdf.element}
        </Dialog>
    );
};

export default ApprovedApplicationModal;

