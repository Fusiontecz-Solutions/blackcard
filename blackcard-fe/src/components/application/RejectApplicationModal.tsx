import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useTheme } from "@/context/ThemeContext";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { rejectApplication, getApplicationByApplicationId, getApplicationById, updateApplicationQueue } from "@/redux/actions/applicationActions";
import { toast } from "react-toastify";
import { AlertTriangle, Mail, Phone, Search, X, XCircle } from "lucide-react";
import { formatUSPhoneNumber } from "@/utils/formatPhoneNumber";
import { cn } from "@/lib/utils";
import {
    buildApplicationRejectionEmailSubject,
    renderApplicationRejectionEmailHtml,
} from "@/pages/templates";
import { formatDeclineReasonsForEmail } from "@/pages/templates/applicationRejectionEmailShared";
import { normalizeRoleKey, resolveEffectiveRole } from "@/lib/sessionRole";
import { submissionCcApplicationId, useSubmissionCcPrefill } from "@/hooks/useSubmissionCcPrefill";
import LockedCcChips from "./LockedCcChips";
import { useSubmissionsInboxEmails } from "@/hooks/useAlwaysCcEmails";
import { useBreakdownPdf } from "./useBreakdownPdf";
import {
    SCRUBBER_RECOMMEND_DECLINE_LABEL,
    isScrubberDeclineRecommendation,
} from "@/lib/scrubberDeclineReasons";
import { resolveScrubberDeclineReasonsForDisplay } from "@/lib/scrubberDeclineReasonsDisplay";

interface RejectApplicationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Custom submit that skips rejectApplication API (legacy). Prefer onAfterReject. */
    onConfirm?: (reason: string) => Promise<void>;
    /** Runs after rejectApplication succeeds (e.g. record funding call outcome). */
    onAfterReject?: (reason: string) => Promise<void>;
    confirmLoading?: boolean;
}

interface RejectFormValues {
    isoEmail: string;
}

const REJECTION_REASON_OPTIONS = [
    "Low Average Daily Balance",
    "Excessive Negative Balance Days",
    "Bounced Payments",
    "Excessive ACH Returns",
    "Excessive Overdraft Fees",
    "Insufficient Revenue",
    "Insufficient Revenue (Construction)",
    "Insufficient Revenue (Trucking)",
    "No Active MCA Position",
    "Insufficient MCA History",
    "Delinquent on Reverse Consolidation",
    "Over-Leveraged",
    "Recovery Activity on File",
    "Recent Default",
    "Active Settlement",
    "Delinquent on Recent Fundings",
    "Insufficient Recent Funding",
    "Position Behind Non-Reputable Funder",
    "Excessive NSF Occurrences",
    "First Position Not Eligible",
] as const;

/** Scrubber (SCRUBBING role) — limited decline reasons only. */
/** Scrubbers decline with the same reasons as underwriters and Super Admin. */
const SCRUBBER_REJECTION_REASON_OPTIONS = REJECTION_REASON_OPTIONS;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reasons the underwriter picked, saved on the deal's note as `UNDERWRITER_DECLINE_REASONS:a|||b`. */
function readUnderwriterDeclineReasons(note: unknown): string[] {
    const marker = "UNDERWRITER_DECLINE_REASONS:";
    const line = String(note ?? "")
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith(marker));
    if (!line) return [];
    return line
        .slice(marker.length)
        .split("|||")
        .map((r) => r.trim())
        .filter(Boolean);
}

const RejectApplicationModal = ({
    open,
    onOpenChange,
    onConfirm,
    onAfterReject,
    confirmLoading,
}: RejectApplicationModalProps) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const dispatch = useDispatch<AppDispatch>();

    const { data: applicationData } = useSelector((state: RootState) => state.applicationDetail);
    const { loading: rejectLoading } = useSelector((state: RootState) => state.rejectApplication);
    const loginUserRole = useSelector(
        (state: RootState) => state.login.data?.user?.role,
    );
    const viewerRoleKey = normalizeRoleKey(
        resolveEffectiveRole({ role: loginUserRole }),
    );
    const isScrubberRole = viewerRoleKey === "SCRUBBING";
    /** Underwriter decline is not final: it goes to Super Admin (subs@), never the ISO. */
    const isUnderwriterRole = viewerRoleKey === "UNDERWRITER";
    const rejectionReasonOptions = isScrubberRole
        ? SCRUBBER_REJECTION_REASON_OPTIONS
        : REJECTION_REASON_OPTIONS;
    const [scrubberSubmitting, setScrubberSubmitting] = useState(false);
    /** Scrubbing preview PDF, attached to the decline-recommend mail as Breakdown.pdf. */
    const breakdownPdf = useBreakdownPdf(
        (applicationData as any)?.applicationId != null
            ? String((applicationData as any).applicationId)
            : null,
    );
    const isSubmitting =
        scrubberSubmitting ||
        (onConfirm ? Boolean(confirmLoading) : rejectLoading || Boolean(confirmLoading));

    const iso = (applicationData as any)?.iso as
        | { name?: string; email?: string; phone?: string }
        | null
        | undefined;
    const hasLinkedIso = Boolean(iso?.name || iso?.email || iso?.phone);
    const isoName = String(iso?.name ?? '').trim();
    const linkedIsoEmail = String(iso?.email ?? '').trim();
    const isoPhone = String(iso?.phone ?? '').trim();

    const client = (applicationData as any)?.client;
    const clientEmail = String(
        client?.business?.email || client?.owner?.email || '',
    ).trim();

    const [ccEmails, setCcEmails] = useState<string[]>([]);
    const [ccDraft, setCcDraft] = useState("");
    const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
    const [reasonError, setReasonError] = useState<string | null>(null);
    const [reasonSearch, setReasonSearch] = useState("");
    const isoEmailTouchedRef = useRef(false);
    const wasOpenRef = useRef(false);
    // Cc from the ISO's submission email (same list as the Linked ISO card).
    useSubmissionCcPrefill({
        applicationId: submissionCcApplicationId(applicationData),
        // Underwriter decline is internal: no ISO / deal Cc prefill.
        enabled: open && !isUnderwriterRole && !isScrubberRole,
        setCcEmails,
    });

    const { handleSubmit, reset, setValue } = useForm<RejectFormValues>({
        defaultValues: {
            isoEmail: "",
        },
    });

    const resetFormState = () => {
        reset({ isoEmail: "" });
        setCcEmails([]);
        setCcDraft("");
        setSelectedReasons([]);
        setReasonError(null);
        setReasonSearch("");
        isoEmailTouchedRef.current = false;
    };

    const toggleReason = (reason: string) => {
        setSelectedReasons((prev) => {
            const next = prev.includes(reason)
                ? prev.filter((r) => r !== reason)
                : [...prev, reason];
            if (next.length > 0) {
                setReasonError(null);
            }
            return next;
        });
    };

    const filteredReasonOptions = useMemo(() => {
        const query = reasonSearch.trim().toLowerCase();
        if (!query) return rejectionReasonOptions;
        return rejectionReasonOptions.filter((option) =>
            option.toLowerCase().includes(query),
        );
    }, [reasonSearch, rejectionReasonOptions]);

    const businessName =
        (applicationData as any)?.client?.business?.name ||
        ((applicationData as any)?.client?.owner?.firstName &&
        (applicationData as any)?.client?.owner?.lastName
            ? `${(applicationData as any).client.owner.firstName} ${(applicationData as any).client.owner.lastName}`
            : "N/A");

    const borrowerName =
        (applicationData as any)?.client?.owner?.firstName &&
        (applicationData as any)?.client?.owner?.lastName
            ? `${(applicationData as any).client.owner.firstName} ${(applicationData as any).client.owner.lastName}`
            : "N/A";

    const applicationIdLabel = (applicationData as any)?.applicationId
        ? `LN-${(applicationData as any).applicationId}`
        : "N/A";

    const requestedAmount = (applicationData as any)?.requestedAmount || "N/A";

    /** Merge chip list + any address still typed in the CC field (not yet added). */
    const resolveCcRecipientsForSend = (
        recipientEmail: string,
    ): { emails: string[]; draftError?: string } => {
        const merged = [...ccEmails];
        const trimmedDraft = ccDraft.trim();
        if (trimmedDraft) {
            if (!EMAIL_PATTERN.test(trimmedDraft)) {
                return {
                    emails: [],
                    draftError: "Enter a valid CC email address or clear the CC field before declining",
                };
            }
            if (!merged.some((e) => e.toLowerCase() === trimmedDraft.toLowerCase())) {
                merged.push(trimmedDraft);
            }
        }
        return {
            emails: merged.filter(
                (e) => e.toLowerCase() !== recipientEmail.toLowerCase(),
            ),
        };
    };
    /** Underwriter decline: editable To (defaults to the submissions inbox). */
    const submissionsInbox = useSubmissionsInboxEmails();
    const [uwToEmails, setUwToEmails] = useState<string[]>([]);
    const [uwToDraft, setUwToDraft] = useState("");
    const uwToTouchedRef = useRef(false);
    useEffect(() => {
        if (!open) {
            uwToTouchedRef.current = false;
            setUwToEmails([]);
            setUwToDraft("");
            return;
        }
        if (uwToTouchedRef.current) return;
        if (isUnderwriterRole || isScrubberRole) setUwToEmails(submissionsInbox);
        else setUwToEmails(linkedIsoEmail ? [linkedIsoEmail] : []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, isUnderwriterRole, isScrubberRole, submissionsInbox.join(","), linkedIsoEmail]);
    /** To / CC for the underwriter decline mail, including addresses still typed in the fields. */
    const resolveUwDeclineRecipients = (): { to: string[]; cc: string[] } | null => {
        const to = [...uwToEmails];
        const toDraft = uwToDraft.trim();
        if (toDraft) {
            if (!EMAIL_PATTERN.test(toDraft)) {
                toast.error("Enter a valid To email address or clear the To field");
                return null;
            }
            if (!to.some((e) => e.toLowerCase() === toDraft.toLowerCase())) to.push(toDraft);
        }
        if (to.length === 0) {
            toast.error("Add at least one To recipient");
            return null;
        }
        const ccResolution = resolveCcRecipientsForSend(to[0]);
        if (ccResolution.draftError) {
            toast.error(ccResolution.draftError);
            return null;
        }
        const toLower = to.map((e) => e.toLowerCase());
        return { to, cc: ccResolution.emails.filter((e) => !toLower.includes(e.toLowerCase())) };
    };

    useEffect(() => {
        if (!open) {
            if (wasOpenRef.current) {
                resetFormState();
            }
            wasOpenRef.current = false;
            return;
        }

        if (!wasOpenRef.current) {
            isoEmailTouchedRef.current = false;
            const prefillCc =
                clientEmail && EMAIL_PATTERN.test(clientEmail) ? [clientEmail] : [];
            setCcEmails(isUnderwriterRole || isScrubberRole ? [] : prefillCc);
            setCcDraft("");
            setValue("isoEmail", linkedIsoEmail || "");
            // Super Admin declining a deal starts from the reasons already given:
            // the underwriter's (when the underwriter declined it), else the scrubber's.
            const app = applicationData as any;
            const underwriterReasons = readUnderwriterDeclineReasons(app?.note).filter((r) =>
                (rejectionReasonOptions as readonly string[]).includes(r),
            );
            if (
                !isScrubberRole &&
                !isUnderwriterRole &&
                /decline by uw/i.test(String(app?.underwriterAction ?? "")) &&
                underwriterReasons.length
            ) {
                setSelectedReasons(underwriterReasons);
            } else if (!isScrubberRole && isScrubberDeclineRecommendation(app?.scrubberRecommendation)) {
                const scrubberReasons = resolveScrubberDeclineReasonsForDisplay({
                    scrubberRecommendation: app?.scrubberRecommendation,
                    scrubberDeclineReasons: app?.scrubberDeclineReasons,
                    note: app?.note,
                });
                const known = scrubberReasons.filter((r) =>
                    (rejectionReasonOptions as readonly string[]).includes(r),
                );
                if (known.length) setSelectedReasons(known);
            }
        }

        wasOpenRef.current = true;
    }, [open, linkedIsoEmail, clientEmail, setValue]);

    useEffect(() => {
        if (!open || isoEmailTouchedRef.current) return;
        if (linkedIsoEmail) {
            setValue("isoEmail", linkedIsoEmail);
        }
    }, [open, linkedIsoEmail, setValue]);

    const addEmailToList = (
        raw: string,
        list: string[],
        setList: (next: string[]) => void,
        clearDraft: () => void,
    ) => {
        const email = raw.trim();
        if (!email) return;
        if (!EMAIL_PATTERN.test(email)) {
            toast.error("Enter a valid email address");
            return;
        }
        if (list.some((e) => e.toLowerCase() === email.toLowerCase())) {
            toast.warning("Email already added");
            return;
        }
        setList([...list, email]);
        clearDraft();
    };

    const removeEmailFromList = (
        email: string,
        list: string[],
        setList: (next: string[]) => void,
    ) => {
        setList(list.filter((e) => e !== email));
    };

    const handleCancel = () => {
        onOpenChange(false);
        resetFormState();
    };

    /** Scrubber decline is a recommendation: the deal goes to Super Admin with the reasons, no ISO mail. */
    /** Underwriter decline: record it and notify Super Admin via subs@; no ISO email. */
    const submitUnderwriterDecline = async () => {
        if (selectedReasons.length === 0) {
            setReasonError("Select at least one rejection reason");
            return;
        }
        const applicationId =
            (applicationData as any)?.applicationId || (applicationData as any)?._id;
        if (!applicationId) {
            toast.error("Submission ID not found");
            return;
        }
        const { combinedReason } = formatDeclineReasonsForEmail(selectedReasons);
        const uwRecipients = resolveUwDeclineRecipients();
        if (!uwRecipients) return;
        setScrubberSubmitting(true);
        try {
            await dispatch(
                rejectApplication({
                    id: applicationId,
                    reason: combinedReason,
                    toEmails: uwRecipients.to,
                    ccEmails: uwRecipients.cc,
                }),
            ).unwrap();
            if (onAfterReject) await onAfterReject(combinedReason);
            await dispatch(getApplicationById(String(applicationId)));
            toast.success("Decline sent to Super Admin for the final decision.");
            onOpenChange(false);
            resetFormState();
        } catch (error: any) {
            toast.error(typeof error === "string" ? error : "Failed to decline application");
        } finally {
            setScrubberSubmitting(false);
        }
    };

    const submitScrubberRecommendDecline = async () => {
        if (selectedReasons.length === 0) {
            setReasonError("Select at least one rejection reason");
            return;
        }
        const uuid = (applicationData as any)?.id ?? (applicationData as any)?._id;
        if (!uuid) {
            toast.error("Application data not found");
            return;
        }
        const recipients = resolveUwDeclineRecipients();
        if (!recipients) return;
        setScrubberSubmitting(true);
        try {
            // Scrubbing preview PDF → Breakdown.pdf on the mail; null when the
            // deal has no positions and no bank analysis.
            const breakdownPdfBase64 = await breakdownPdf.capture();
            await dispatch(
                updateApplicationQueue({
                    id: uuid,
                    data: {
                        currentQueue: "Underwriter",
                        scrubberRecommendation: SCRUBBER_RECOMMEND_DECLINE_LABEL,
                        declineReasons: selectedReasons,
                        // To / CC confirmed in the popup (To defaults to the submissions inbox).
                        toEmails: recipients.to,
                        ccEmails: recipients.cc,
                        ...(breakdownPdfBase64 ? { breakdownPdf: breakdownPdfBase64 } : {}),
                    },
                }),
            ).unwrap();
            await dispatch(getApplicationById(String((applicationData as any)?.applicationId ?? uuid)));
            toast.success("Decline recommendation sent to the submissions team.");
            onOpenChange(false);
            resetFormState();
        } catch (error: any) {
            toast.error(typeof error === "string" ? error : "Failed to send decline recommendation");
        } finally {
            setScrubberSubmitting(false);
        }
    };

    const onSubmit = async (data: RejectFormValues) => {
        if (selectedReasons.length === 0) {
            setReasonError("Select at least one rejection reason");
            return;
        }

        const { combinedReason, declineReasons } =
            formatDeclineReasonsForEmail(selectedReasons);

        if (onConfirm) {
            try {
                await onConfirm(combinedReason);
                onOpenChange(false);
                resetFormState();
            } catch (error: any) {
                toast.error(error || 'Failed to decline application');
            }
            return;
        }

        if (!applicationData) {
            toast.error('Application data not found');
            return;
        }

        // To chips (prefilled with the linked ISO email) + CC chips.
        const isoRecipients = resolveUwDeclineRecipients();
        if (!isoRecipients) return;
        const recipientEmail = isoRecipients.to[0];
        void data;

        const applicationId = (applicationData as any).applicationId || (applicationData as any)._id;

        if (!applicationId) {
            toast.error('Submission ID not found');
            return;
        }

        try {
            const ccForSend = isoRecipients.cc;

            const emailHtml = renderApplicationRejectionEmailHtml({
                client_name: isoName || recipientEmail,
                decline_reasons: declineReasons,
            });

            const businessName = String(
                (applicationData as any)?.client?.business?.name ||
                    (applicationData as any)?.client?.businessName ||
                    "",
            ).trim();

            const result = await dispatch(rejectApplication({
                id: applicationId,
                reason: combinedReason,
                isoEmail: recipientEmail,
                toEmails: isoRecipients.to,
                ccEmails: ccForSend,
                emailHtml,
                emailSubject: buildApplicationRejectionEmailSubject(businessName),
            })).unwrap();

            if (onAfterReject) {
                await onAfterReject(combinedReason);
            }

            const ccErrors = Array.isArray(result?.ccErrors) ? result.ccErrors : [];
            const emailedCc = Array.isArray(result?.emailedCc) ? result.emailedCc : [];
            const ccFailed =
                ccForSend.length > 0 &&
                (ccErrors.length > 0 || emailedCc.length < ccForSend.length);
            if (ccFailed) {
                const undelivered = ccForSend.filter(
                    (e) => !emailedCc.some((sent: string) => sent.toLowerCase() === e.toLowerCase()),
                );
                const failureDetail =
                    ccErrors.length > 0
                        ? ccErrors.join("; ")
                        : undelivered.join(", ");
                toast.warning(
                    `Decline sent to ${isoRecipients.to.join(", ")}${emailedCc.length ? `; CC delivered to ${emailedCc.join(", ")}` : ""}. CC not delivered to: ${failureDetail}`,
                );
            } else if (emailedCc.length > 0) {
                toast.success(
                    `Application rejection template sent to ${isoRecipients.to.join(", ")} and CC ${emailedCc.join(", ")}`,
                );
            } else {
                toast.success(`Application rejection template sent to ${isoRecipients.to.join(", ")}`);
            }

            onOpenChange(false);
            resetFormState();

            if ((applicationData as any)?.applicationId) {
                await dispatch(getApplicationByApplicationId(String((applicationData as any).applicationId)));
            } else if ((applicationData as any)?._id) {
                await dispatch(getApplicationById((applicationData as any)._id));
            }
        } catch (error: any) {
            toast.error(error || 'Failed to reject application');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="z-[10250] flex max-h-[min(92vh,860px)] w-full max-w-[680px] flex-col gap-0 overflow-hidden p-0"
                overlayClassName="z-[10249]"
            >
                <div className="shrink-0 border-b px-6 py-4 dark:border-gray-700">
                    <DialogHeader className="space-y-2 text-left">
                        <div className="flex items-start gap-3 pr-6">
                            <span
                                className={cn(
                                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                                    isDark
                                        ? "bg-red-500/15 text-red-300"
                                        : "bg-red-50 text-red-600",
                                )}
                            >
                                <XCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
                            </span>
                            <div className="min-w-0 space-y-1">
                                <DialogTitle
                                    className={cn(
                                        "text-lg font-semibold",
                                        isDark ? "text-gray-100" : "text-slate-900",
                                    )}
                                >
                                    {isScrubberRole
                                        ? "Recommend Decline"
                                        : isUnderwriterRole
                                          ? "Decline (Super Admin review)"
                                          : "Decline Submission"}
                                </DialogTitle>
                                <DialogDescription
                                    className={cn(
                                        "text-sm leading-relaxed",
                                        isDark ? "text-gray-400" : "text-slate-600",
                                    )}
                                >
                                    {isScrubberRole
                                        ? "Choose the decline reasons. Super Admin reviews the deal and makes the final decline."
                                        : isUnderwriterRole
                                          ? "Choose the decline reasons and confirm who receives your decision."
                                          : "Choose one or more decline reasons and confirm where the rejection email should be sent."}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
                    <div
                        className={cn(
                            "rounded-xl border p-4",
                            isDark
                                ? "border-gray-700 bg-[#282524]"
                                : "border-slate-200 bg-slate-50/80",
                        )}
                    >
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <div>
                                <p className={cn("mb-1 text-xs", isDark ? "text-gray-400" : "text-slate-500")}>
                                    Submission ID
                                </p>
                                <p className={cn("text-sm font-semibold", isDark ? "text-gray-100" : "text-slate-900")}>
                                    {applicationIdLabel}
                                </p>
                            </div>
                            <div>
                                <p className={cn("mb-1 text-xs", isDark ? "text-gray-400" : "text-slate-500")}>
                                    Requested Amount
                                </p>
                                <p className={cn("text-sm font-semibold", isDark ? "text-gray-100" : "text-slate-900")}>
                                    {requestedAmount}
                                </p>
                            </div>
                            <div>
                                <p className={cn("mb-1 text-xs", isDark ? "text-gray-400" : "text-slate-500")}>
                                    Business
                                </p>
                                <p className={cn("text-sm font-semibold", isDark ? "text-gray-100" : "text-slate-900")}>
                                    {businessName}
                                </p>
                            </div>
                            <div>
                                <p className={cn("mb-1 text-xs", isDark ? "text-gray-400" : "text-slate-500")}>
                                    Borrower
                                </p>
                                <p className={cn("text-sm font-semibold", isDark ? "text-gray-100" : "text-slate-900")}>
                                    {borrowerName}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Scrubber / underwriter declines go to Super Admin, never the ISO: no ISO card. */}
                    {isScrubberRole || isUnderwriterRole ? null : hasLinkedIso ? (
                        <div
                            className={cn(
                                "flex items-start gap-3 rounded-xl border px-4 py-3",
                                isDark
                                    ? "border-blue-500/20 bg-blue-500/5"
                                    : "border-blue-100 bg-blue-50/80",
                            )}
                        >
                            <span
                                className={cn(
                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                                    isDark ? "bg-blue-500/15 text-blue-300" : "bg-blue-100 text-blue-600",
                                )}
                            >
                                <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p
                                    className={cn(
                                        "text-xs font-semibold uppercase tracking-wide",
                                        isDark ? "text-blue-200/80" : "text-blue-700",
                                    )}
                                >
                                    Linked ISO
                                </p>
                                <p className={cn("mt-0.5 text-sm font-semibold", isDark ? "text-gray-100" : "text-slate-900")}>
                                    {isoName || "Linked ISO"}
                                </p>
                                {isoPhone ? (
                                    <span
                                        className={cn(
                                            "mt-1 flex items-center gap-1.5 text-sm",
                                            isDark ? "text-gray-300" : "text-slate-600",
                                        )}
                                    >
                                        <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                                        <span className="truncate">{formatUSPhoneNumber(isoPhone) || isoPhone}</span>
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div
                            className={cn(
                                "flex items-start gap-3 rounded-xl border px-4 py-3",
                                isDark
                                    ? "border-amber-500/30 bg-amber-500/10"
                                    : "border-amber-200 bg-amber-50",
                            )}
                        >
                            <AlertTriangle
                                className={cn(
                                    "mt-0.5 h-4 w-4 shrink-0",
                                    isDark ? "text-amber-400" : "text-amber-600",
                                )}
                                strokeWidth={2}
                                aria-hidden
                            />
                            <p className={cn("text-sm leading-relaxed", isDark ? "text-amber-200" : "text-amber-800")}>
                                No ISO is linked to this application. Enter a recipient email below to send the decline template.
                            </p>
                        </div>
                    )}

                    {(
                        <div
                            className={cn(
                                "space-y-4 rounded-xl border p-4",
                                isDark ? "border-gray-700 bg-[#1f2023]/60" : "border-slate-200 bg-white",
                            )}
                        >
                            <div>
                                <p className={cn("text-sm font-semibold", isDark ? "text-gray-100" : "text-slate-900")}>
                                    Email recipients
                                </p>
                                <p className={cn("mt-1 text-xs", isDark ? "text-gray-400" : "text-slate-500")}>
                                    {isScrubberRole
                                        ? "Your decline recommendation goes to Super Admin for the final decision."
                                        : isUnderwriterRole
                                          ? "Super Admin reviews your decline and makes the final decision with the ISO."
                                          : "To is prefilled with the linked ISO email. ISO replies stay in the submission thread."}
                                </p>
                            </div>
                            {([
                                { label: "To", required: true, list: uwToEmails, setList: setUwToEmails, draft: uwToDraft, setDraft: setUwToDraft, locked: false },
                                { label: "CC", required: false, list: ccEmails, setList: setCcEmails, draft: ccDraft, setDraft: setCcDraft, locked: true },
                            ] as const).map((field) => (
                                <div key={field.label} className="space-y-2">
                                    <Label className={cn("text-sm font-medium", isDark ? "text-gray-200" : "text-slate-800")}>
                                        {field.label} {field.required ? <span className="text-red-500">*</span> : null}
                                    </Label>
                                    <div className="flex flex-wrap gap-2">
                                        {field.locked ? (
                                            <LockedCcChips
                                                isDark={isDark}
                                                withSubmissionsInbox={!isUnderwriterRole && !isScrubberRole}
                                            />
                                        ) : null}
                                        {field.list.map((email) => (
                                            <span
                                                key={email}
                                                className={cn(
                                                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                                                    isDark
                                                        ? "border-gray-600 bg-gray-800 text-gray-200"
                                                        : "border-slate-200 bg-slate-50 text-slate-700",
                                                )}
                                            >
                                                {email}
                                                <button
                                                    type="button"
                                                    className="text-slate-400 transition-colors hover:text-red-600"
                                                    onClick={() => {
                                                        if (field.label === "To") uwToTouchedRef.current = true;
                                                        removeEmailFromList(email, field.list, field.setList);
                                                    }}
                                                    aria-label={`Remove ${email}`}
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            type="email"
                                            placeholder={field.label === "To" ? "to@example.com" : "cc@example.com"}
                                            value={field.draft}
                                            onChange={(e) => field.setDraft(e.target.value)}
                                            className={cn("h-10", isDark ? "border-gray-700 bg-muted" : "")}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    if (field.label === "To") uwToTouchedRef.current = true;
                                                    addEmailToList(field.draft, field.list, field.setList, () => field.setDraft(""));
                                                }
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-10 shrink-0 px-4"
                                            onClick={() => {
                                                if (field.label === "To") uwToTouchedRef.current = true;
                                                addEmailToList(field.draft, field.list, field.setList, () => field.setDraft(""));
                                            }}
                                        >
                                            Add
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <Label className={cn("text-sm font-semibold", isDark ? "text-gray-100" : "text-slate-900")}>
                                    Decline reasons <span className="text-red-500">*</span>
                                </Label>
                                <p className={cn("mt-1 text-xs", isDark ? "text-gray-400" : "text-slate-500")}>
                                    Select all reasons that apply. The first selected reason becomes the primary reason in the email.
                                </p>
                            </div>
                            {selectedReasons.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedReasons([]);
                                        setReasonError(null);
                                    }}
                                    className={cn(
                                        "shrink-0 text-xs font-medium transition-colors",
                                        isDark
                                            ? "text-gray-400 hover:text-gray-200"
                                            : "text-slate-500 hover:text-slate-800",
                                    )}
                                >
                                    Clear all
                                </button>
                            ) : null}
                        </div>

                        {selectedReasons.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {selectedReasons.map((reason, index) => (
                                    <button
                                        key={reason}
                                        type="button"
                                        onClick={() => toggleReason(reason)}
                                        className={cn(
                                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                                            index === 0
                                                ? isDark
                                                    ? "border-red-500/40 bg-red-500/10 text-red-200"
                                                    : "border-red-200 bg-red-50 text-red-700"
                                                : isDark
                                                  ? "border-[var(--brand)]/40 bg-[var(--brand)]/10 text-gray-200"
                                                  : "border-[var(--brand)]/30 bg-[var(--brand)]/5 text-slate-700",
                                        )}
                                    >
                                        {index === 0 ? (
                                            <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                                                Primary
                                            </span>
                                        ) : null}
                                        {reason}
                                        <X className="h-3 w-3 opacity-60" />
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        <div className="relative">
                            <Search
                                className={cn(
                                    "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                                    isDark ? "text-gray-500" : "text-slate-400",
                                )}
                                aria-hidden
                            />
                            <Input
                                type="text"
                                value={reasonSearch}
                                onChange={(e) => setReasonSearch(e.target.value)}
                                placeholder="Search decline reasons..."
                                className={cn("h-10 pl-9", isDark ? "border-gray-700 bg-muted" : "")}
                            />
                        </div>

                        <div
                            className={cn(
                                "max-h-[220px] overflow-y-auto rounded-xl border p-2",
                                isDark ? "border-gray-700 bg-[#1a1b1e]" : "border-slate-200 bg-slate-50/50",
                                reasonError ? "border-red-400/70" : "",
                            )}
                        >
                            {filteredReasonOptions.length === 0 ? (
                                <p
                                    className={cn(
                                        "px-3 py-8 text-center text-sm",
                                        isDark ? "text-gray-500" : "text-slate-500",
                                    )}
                                >
                                    No reasons match your search.
                                </p>
                            ) : (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {filteredReasonOptions.map((option) => {
                                        const checked = selectedReasons.includes(option);
                                        const isPrimary = checked && selectedReasons[0] === option;
                                        return (
                                            <label
                                                key={option}
                                                className={cn(
                                                    "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                                                    checked
                                                        ? isPrimary
                                                            ? isDark
                                                                ? "border-red-500/40 bg-red-500/10"
                                                                : "border-red-200 bg-red-50"
                                                            : isDark
                                                              ? "border-[var(--brand)]/50 bg-[var(--brand)]/10"
                                                              : "border-[var(--brand)]/40 bg-[var(--brand)]/5"
                                                        : isDark
                                                          ? "border-gray-700 bg-transparent hover:bg-gray-800/50"
                                                          : "border-slate-200 bg-white hover:bg-white hover:shadow-sm",
                                                )}
                                            >
                                                <Checkbox
                                                    checked={checked}
                                                    className="mt-0.5 size-4 shrink-0"
                                                    onCheckedChange={() => toggleReason(option)}
                                                />
                                                <span
                                                    className={cn(
                                                        "text-sm leading-snug",
                                                        isDark ? "text-gray-200" : "text-slate-800",
                                                    )}
                                                >
                                                    {option}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <p className={cn("text-xs", isDark ? "text-gray-400" : "text-slate-500")}>
                                {selectedReasons.length > 0
                                    ? `${selectedReasons.length} reason${selectedReasons.length === 1 ? "" : "s"} selected`
                                    : "No reasons selected yet"}
                            </p>
                            {reasonError ? (
                                <p className="text-xs font-medium text-red-500">{reasonError}</p>
                            ) : null}
                        </div>
                    </div>
                </div>

                <DialogFooter
                    className={cn(
                        "shrink-0 gap-2 border-t px-6 py-4 sm:justify-between",
                        isDark ? "border-gray-700" : "border-slate-200",
                    )}
                >
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isSubmitting}
                        className={cn(
                            "min-w-[120px]",
                            isDark ? "border-gray-700 bg-muted text-gray-300 hover:bg-gray-700" : "",
                        )}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={
                            isScrubberRole
                                ? () => void submitScrubberRecommendDecline()
                                : isUnderwriterRole
                                  ? () => void submitUnderwriterDecline()
                                  : handleSubmit(onSubmit)
                        }
                        disabled={isSubmitting}
                        className="min-w-[160px] bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                        {isSubmitting
                            ? isScrubberRole ? "Sending..." : "Declining..."
                            : isScrubberRole ? "Recommend Decline" : "Decline Submission"}
                    </Button>
                </DialogFooter>
            </DialogContent>
            {breakdownPdf.element}
        </Dialog>
    );
};

export default RejectApplicationModal;
