import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/context/ThemeContext";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { sendDocumentRequest, getDocumentRequestsByApplication } from "@/redux/actions/notificationActions";
import type { SendDocumentRequestPayload } from "@/redux/actions/notificationActions";
import { DOCUMENT_REQUEST_LABELS, DOCUMENT_REQUEST_OPTIONS, normalizeDocumentSlug } from "@/constants/documentRequestTypes";
import {
    DOCUMENT_REQUEST_UPLOAD_URL_PLACEHOLDER,
    documentRequestEmailSubject,
    renderDocumentRequestEmailHtml,
} from "@/pages/templates";
import {
    assignApplicationFileDocumentType,
    getApplicationByApplicationId,
    getApplicationById,
} from "@/redux/actions/applicationActions";
import { toast } from "react-toastify";
import { ArrowLeft, CheckCircle2, Eye, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApplicationFiles } from "@/types/applicationTypes";
import {
    formatUploadedFileSize,
    getFulfilledDocumentSlugs,
    suggestDocumentSlugForFile,
} from "@/lib/documentRequestFulfillment";
import PDFViewerDocsModal from "./PDFViewerDocsModal";
import { submissionCcApplicationId, useSubmissionCcPrefill } from "@/hooks/useSubmissionCcPrefill";
import LockedCcChips from "./LockedCcChips";

export { DOCUMENT_REQUEST_OPTIONS };

interface RequestMissingDocumentsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    /** Optional presentation mode — currently informational for callers. */
    variant?: "request" | "panel";
    /**
     * Missing Documents hold: document slugs to pre-select. These stay
     * requestable even when a matching file is already on the deal (the
     * scrubber flagged them as missing). Opens straight on the request step.
     */
    preselectedDocuments?: string[];
    /** Pre-fills the note (e.g. the scrubber's free-text missing items). */
    prefillNote?: string;
}

interface RequestFormValues {
    reason: string;
    isoEmail: string;
}

type WizardStep = "uploads" | "request";

const documentOptions = DOCUMENT_REQUEST_OPTIONS;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNASSIGNED_VALUE = "__unassigned__";

function fileKey(file: ApplicationFiles): string {
    return String(file._id || (file as { id?: string }).id || "").trim();
}

const RequestMissingDocumentsModal = ({
    open,
    onOpenChange,
    onSuccess,
    variant: _variant = "request",
    preselectedDocuments,
    prefillNote,
}: RequestMissingDocumentsModalProps) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const dispatch = useDispatch<AppDispatch>();
    const [wizardStep, setWizardStep] = useState<WizardStep>("uploads");
    const [fileAssignments, setFileAssignments] = useState<Record<string, string>>({});
    const [savingAssignments, setSavingAssignments] = useState(false);
    const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
    const [requestAdditional, setRequestAdditional] = useState(false);
    const [additionalToEmails, setAdditionalToEmails] = useState<string[]>([]);
    const [ccEmails, setCcEmails] = useState<string[]>([]);
    const [additionalToDraft, setAdditionalToDraft] = useState("");
    const [ccDraft, setCcDraft] = useState("");
    const [isPDFModalOpen, setIsPDFModalOpen] = useState(false);
    const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
    const [pdfFileName, setPdfFileName] = useState("Document");
    const [pdfMimeTypeHint, setPdfMimeTypeHint] = useState("");
    const isoEmailTouchedRef = useRef(false);
    const maxChars = 500;

    const { data: applicationData } = useSelector((state: RootState) => state.applicationDetail);
    const { loading: sendRequestLoading } = useSelector((state: RootState) => state.sendDocumentRequest);
    // Cc from the ISO's submission email (same list as the Linked ISO card).
    useSubmissionCcPrefill({
        applicationId: submissionCcApplicationId(applicationData),
        enabled: open,
        setCcEmails,
    });

    const linkedIso = (applicationData as any)?.iso;
    const hasLinkedIso = Boolean(linkedIso?.id || linkedIso?._id);
    const linkedIsoEmail = String(linkedIso?.email || "").trim();

    const uploadedFiles = useMemo(
        () => ((applicationData?.files as ApplicationFiles[] | undefined) ?? []).filter((f) => fileKey(f)),
        [applicationData?.files],
    );

    const fulfilledSlugs = useMemo(
        () => getFulfilledDocumentSlugs(uploadedFiles, fileAssignments),
        [uploadedFiles, fileAssignments],
    );

    const preselectedKey = (preselectedDocuments ?? []).join("|");
    const keepRequestable = useMemo(
        () => new Set<string>(preselectedKey ? preselectedKey.split("|") : []),
        [preselectedKey],
    );
    const isPrefilled = preselectedDocuments !== undefined;

    const requestableOptions = useMemo(
        () => documentOptions.filter((doc) => !fulfilledSlugs.has(doc.id) || keepRequestable.has(doc.id)),
        [fulfilledSlugs, keepRequestable],
    );

    const fulfilledOptions = useMemo(
        () => documentOptions.filter((doc) => fulfilledSlugs.has(doc.id) && !keepRequestable.has(doc.id)),
        [fulfilledSlugs, keepRequestable],
    );

    const { control, handleSubmit, formState: { errors }, watch, reset, setValue } = useForm<RequestFormValues>({
        defaultValues: {
            reason: "",
            isoEmail: "",
        },
    });

    const reasonText = watch("reason") || "";

    const handleClosePDFModal = () => {
        setIsPDFModalOpen(false);
        setPdfFileUrl(null);
        setPdfFileName("Document");
        setPdfMimeTypeHint("");
    };

    const handleViewFile = (file: ApplicationFiles) => {
        if (file.url) {
            setPdfFileUrl(file.url);
            setPdfFileName(file.originalName || "Document");
            setPdfMimeTypeHint(String(file.mimeType || "").trim());
            setIsPDFModalOpen(true);
        } else {
            toast.error("File URL not available");
        }
    };

    const resetFormState = () => {
        reset({ reason: "", isoEmail: "" });
        setWizardStep("uploads");
        setFileAssignments({});
        setSelectedDocuments([]);
        setRequestAdditional(false);
        setAdditionalToEmails([]);
        setCcEmails([]);
        setAdditionalToDraft("");
        setCcDraft("");
        handleClosePDFModal();
        isoEmailTouchedRef.current = false;
    };

    useEffect(() => {
        if (!open) {
            resetFormState();
            return;
        }

        isoEmailTouchedRef.current = false;
        setAdditionalToEmails([]);
        setCcEmails([]);
        setAdditionalToDraft("");
        setCcDraft("");
        setValue("isoEmail", linkedIsoEmail || "");

        const files = ((applicationData?.files as ApplicationFiles[] | undefined) ?? []).filter((f) =>
            fileKey(f),
        );
        const assignments: Record<string, string> = {};
        files.forEach((file) => {
            const id = fileKey(file);
            if (id) assignments[id] = suggestDocumentSlugForFile(file);
        });
        setFileAssignments(assignments);
        if (isPrefilled) {
            // Missing Documents request: the scrubber's list, straight to the request step.
            setSelectedDocuments(Array.from(keepRequestable));
            const note = String(prefillNote ?? "").trim();
            setRequestAdditional(Boolean(note));
            setValue("reason", note.slice(0, maxChars));
            setWizardStep("request");
        } else {
            setWizardStep(files.length > 0 ? "uploads" : "request");
        }
        // Only initialize when the modal opens — not when files refresh mid-flow.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open || isoEmailTouchedRef.current) return;
        if (linkedIsoEmail) {
            setValue("isoEmail", linkedIsoEmail);
        }
    }, [open, linkedIsoEmail, setValue]);

    useEffect(() => {
        setSelectedDocuments((prev) =>
            prev.filter((id) => !fulfilledSlugs.has(id) || keepRequestable.has(id)),
        );
    }, [fulfilledSlugs, keepRequestable]);

    const setDocumentSelected = (documentId: string, selected: boolean) => {
        setSelectedDocuments((prev) => {
            if (selected) {
                return prev.includes(documentId) ? prev : [...prev, documentId];
            }
            return prev.filter((id) => id !== documentId);
        });
    };

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

    const removeEmailFromList = (email: string, list: string[], setList: (next: string[]) => void) => {
        setList(list.filter((e) => e !== email));
    };

    const refreshApplication = async () => {
        if ((applicationData as any)?.applicationId) {
            await dispatch(getApplicationByApplicationId(String((applicationData as any).applicationId)));
        } else if ((applicationData as any)?._id) {
            await dispatch(getApplicationById((applicationData as any)._id));
        }
    };

    const saveFileAssignments = async (): Promise<boolean> => {
        const applicationUuid = (applicationData as any)?._id;
        if (!applicationUuid) {
            toast.error("Application not loaded");
            return false;
        }

        const updates = uploadedFiles.filter((file) => {
            const id = fileKey(file);
            const next = normalizeDocumentSlug(fileAssignments[id] || "");
            const current = normalizeDocumentSlug(file.requestedDocumentSlug || "");
            return next !== current;
        });

        if (updates.length === 0) return true;

        setSavingAssignments(true);
        try {
            for (const file of updates) {
                const id = fileKey(file);
                await dispatch(
                    assignApplicationFileDocumentType({
                        applicationId: String(applicationUuid),
                        fileId: id,
                        requestedDocumentSlug: fileAssignments[id] || "",
                    }),
                ).unwrap();
            }
            await refreshApplication();
            const docLookupId =
                (applicationData as any)?.applicationId ??
                (applicationData as any)?._id ??
                (applicationData as any)?.id;
            if (docLookupId != null) {
                await dispatch(getDocumentRequestsByApplication(docLookupId));
            }
            toast.success("Uploaded documents matched to document types.");
            return true;
        } catch (error: unknown) {
            const message =
                typeof error === "string"
                    ? error
                    : (error as { message?: string })?.message || "Failed to save document assignments";
            toast.error(message);
            return false;
        } finally {
            setSavingAssignments(false);
        }
    };

    const handleContinueFromUploads = async () => {
        const saved = await saveFileAssignments();
        if (saved) setWizardStep("request");
    };

    const handleSkipToRequest = () => {
        const assignments: Record<string, string> = {};
        uploadedFiles.forEach((file) => {
            const id = fileKey(file);
            if (id) assignments[id] = suggestDocumentSlugForFile(file);
        });
        setFileAssignments(assignments);
        setWizardStep("request");
    };

    const handleFinishWithoutRequest = async () => {
        const saved = await saveFileAssignments();
        if (!saved) return;
        resetFormState();
        onOpenChange(false);
        onSuccess?.();
    };

    const onSubmit = async (data: RequestFormValues) => {
        if (!applicationData) {
            toast.error("Application data not found");
            return;
        }

        if (selectedDocuments.length === 0 && !requestAdditional) {
            toast.error("Select at least one document type or Request Additional Documents");
            return;
        }

        const primaryEmail = data.isoEmail?.trim() || "";
        if (!primaryEmail && additionalToEmails.length === 0) {
            toast.error("Enter an ISO email or add at least one Additional To address");
            return;
        }
        if (primaryEmail && !EMAIL_PATTERN.test(primaryEmail)) {
            toast.error("Enter a valid ISO email address");
            return;
        }

        const applicationId = (applicationData as any).applicationId || (applicationData as any)._id;
        if (!applicationId) {
            toast.error("Application ID not found");
            return;
        }

        try {
            const requestedLabels = [
                ...selectedDocuments.map(
                    (id) => DOCUMENT_REQUEST_LABELS[id] || id.replace(/[-_]/g, " "),
                ),
                ...(requestAdditional ? [DOCUMENT_REQUEST_LABELS["additional-documents"]] : []),
            ];

            const recipientName =
                linkedIso?.name?.trim() || data.isoEmail?.trim() || "ISO Partner";

            const clientBusinessName =
                (applicationData as any)?.client?.business?.name?.trim() || "";
            const ownerFirst = (applicationData as any)?.client?.owner?.firstName?.trim() || "";
            const ownerLast = (applicationData as any)?.client?.owner?.lastName?.trim() || "";
            const applicationOwnerName =
                ownerFirst || ownerLast ? `${ownerFirst} ${ownerLast}`.trim() : "";
            const clientName = clientBusinessName || applicationOwnerName;

            const emailHtml = renderDocumentRequestEmailHtml({
                iso_name: recipientName,
                client_name: clientName,
                application_owner_name: applicationOwnerName,
                application_number: String(applicationId),
                requested_documents: requestedLabels.join("\n"),
                note: data.reason?.trim() || "",
                upload_documents_url: DOCUMENT_REQUEST_UPLOAD_URL_PLACEHOLDER,
            });

            const payload: SendDocumentRequestPayload = {
                applicationId: String(applicationId),
                requestedDocuments: selectedDocuments,
                requestAdditional,
                reason: data.reason?.trim() || undefined,
                isoEmail: data.isoEmail?.trim() || "",
                emailHtml,
                emailSubject: documentRequestEmailSubject(
                    applicationId,
                    clientName,
                    applicationOwnerName,
                ),
            };

            if (additionalToEmails.length > 0) {
                payload.additionalToEmails = additionalToEmails;
            }
            if (ccEmails.length > 0) {
                payload.ccEmails = ccEmails;
            }

            const result = await dispatch(sendDocumentRequest(payload)).unwrap();
            const emailSent = Boolean((result as any)?.emailSent);

            if (emailSent) {
                toast.success("Document request emailed to ISO and logged in CRM.");
            } else {
                toast.success((result as any)?.message || "Document request sent successfully");
            }

            resetFormState();
            onOpenChange(false);

            const responseApplication = (result as any)?.application;
            if (!responseApplication) {
                try {
                    await refreshApplication();
                } catch {
                    /* ignore refetch errors */
                }
            }

            const docLookupId =
                (applicationData as any)?.applicationId ??
                (applicationData as any)?._id ??
                (applicationData as any)?.id;
            if (docLookupId != null) {
                await dispatch(getDocumentRequestsByApplication(docLookupId));
            }

            onSuccess?.();
        } catch (error: any) {
            const errPayload =
                typeof error === "object" && error !== null && "message" in error
                    ? error
                    : { message: String(error) };
            const message = errPayload.message || "Failed to send document request";
            toast.error(message);
        }
    };

    const handleCancel = () => {
        onOpenChange(false);
        resetFormState();
    };

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

    const isoName = linkedIso?.name || "N/A";

    const isoEmailHelper = (() => {
        if (hasLinkedIso && linkedIsoEmail) {
            return "Prefilled from the linked ISO record. Edit if needed.";
        }
        if (hasLinkedIso && !linkedIsoEmail) {
            return "Linked ISO has no email on file — enter one below.";
        }
        return "No ISO is linked to this application. Enter a recipient email to send the document request.";
    })();

    const applicationSummary = (
        <div
            className={cn(
                "rounded-lg border p-4",
                isDark ? "border-gray-700 bg-[#282524]" : "border-amber-200/80 bg-amber-50",
            )}
        >
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"} mb-1`}>
                        Application ID
                    </p>
                    <p className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                        {(applicationData as any)?.applicationId
                            ? `LN-${(applicationData as any).applicationId}`
                            : "N/A"}
                    </p>
                </div>
                <div>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"} mb-1`}>ISO</p>
                    <p className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                        {isoName}
                    </p>
                </div>
                <div>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"} mb-1`}>Client name</p>
                    <p className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                        {businessName}
                    </p>
                </div>
                <div>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"} mb-1`}>
                        Application Owner name
                    </p>
                    <p className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                        {borrowerName}
                    </p>
                </div>
            </div>
        </div>
    );

    const stepIndicator = (
        <div className="flex items-center gap-2 text-xs font-medium">
            <span
                className={cn(
                    "rounded-full px-2.5 py-1",
                    wizardStep === "uploads"
                        ? "bg-[var(--brand)]/15 text-[var(--brand)]"
                        : isDark
                          ? "text-gray-500"
                          : "text-slate-500",
                )}
            >
                1. Uploaded files
            </span>
            <span className={isDark ? "text-gray-600" : "text-slate-300"}>→</span>
            <span
                className={cn(
                    "rounded-full px-2.5 py-1",
                    wizardStep === "request"
                        ? "bg-[var(--brand)]/15 text-[var(--brand)]"
                        : isDark
                          ? "text-gray-500"
                          : "text-slate-500",
                )}
            >
                2. Request from ISO
            </span>
        </div>
    );

    const allTypesCovered = requestableOptions.length === 0 && fulfilledOptions.length > 0;

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="z-[10250] flex max-h-[min(90vh,820px)] w-full max-w-[640px] flex-col gap-0 overflow-hidden p-0"
                overlayClassName="z-[10249]"
            >
                <div className="shrink-0 border-b px-6 py-4 dark:border-gray-700">
                    <DialogHeader className="space-y-2 text-left">
                        <DialogTitle className={`text-lg font-semibold ${isDark ? "text-gray-100" : "text-slate-900"}`}>
                            Request Documents
                        </DialogTitle>
                        <DialogDescription className={`text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                            {wizardStep === "uploads"
                                ? "Match uploaded files to document types, then request anything still missing from the ISO."
                                : "Select remaining documents to request from the ISO and send the request by email."}
                        </DialogDescription>
                        {uploadedFiles.length > 0 ? stepIndicator : null}
                    </DialogHeader>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                    {applicationSummary}

                    {wizardStep === "uploads" ? (
                        <>
                            <div className="space-y-3">
                                <div>
                                    <Label className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-slate-900"}`}>
                                        Use uploaded documents
                                    </Label>
                                    <p className={`mt-1 text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                                        Assign each file to a document type so it counts as received. You can still
                                        request anything not covered in the next step.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    {uploadedFiles.map((file) => {
                                        const id = fileKey(file);
                                        const assignedSlug = fileAssignments[id] || "";
                                        const assignedLabel = assignedSlug
                                            ? DOCUMENT_REQUEST_LABELS[assignedSlug]
                                            : null;

                                        return (
                                            <div
                                                key={id}
                                                className={cn(
                                                    "flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
                                                    isDark
                                                        ? "border-gray-700 bg-[#1f2023]"
                                                        : "border-slate-200 bg-white",
                                                )}
                                            >
                                                <div className="flex min-w-0 flex-1 items-start gap-2">
                                                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" />
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                                            {file.originalName || "Untitled file"}
                                                        </p>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                            {formatUploadedFileSize(file.size)}
                                                            {assignedLabel ? ` · ${assignedLabel}` : ""}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {file.url ? (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-9 w-9 shrink-0 text-blue-500 hover:text-blue-600"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleViewFile(file);
                                                            }}
                                                            title="View document"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                    ) : null}

                                                    <Select
                                                        value={assignedSlug || UNASSIGNED_VALUE}
                                                        onValueChange={(value: string) =>
                                                            setFileAssignments((prev) => ({
                                                                ...prev,
                                                                [id]: value === UNASSIGNED_VALUE ? "" : value,
                                                            }))
                                                        }
                                                    >
                                                        <SelectTrigger className="h-9 w-full sm:w-[200px]">
                                                            <SelectValue placeholder="Assign document type" />
                                                        </SelectTrigger>
                                                        <SelectContent className="z-[10300]">
                                                            <SelectItem value={UNASSIGNED_VALUE}>
                                                                Not assigned
                                                            </SelectItem>
                                                            {documentOptions.map((opt) => (
                                                                <SelectItem key={opt.id} value={opt.id}>
                                                                    {opt.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {fulfilledOptions.length > 0 ? (
                                <div
                                    className={cn(
                                        "rounded-lg border px-3 py-3",
                                        isDark
                                            ? "border-emerald-900/40 bg-emerald-950/20"
                                            : "border-emerald-200 bg-emerald-50/80",
                                    )}
                                >
                                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                        Already on file ({fulfilledOptions.length})
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {fulfilledOptions.map((doc) => (
                                            <span
                                                key={doc.id}
                                                className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                                            >
                                                <CheckCircle2 className="h-3 w-3" />
                                                {doc.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <>
                            {fulfilledOptions.length > 0 ? (
                                <div
                                    className={cn(
                                        "rounded-lg border px-3 py-3",
                                        isDark
                                            ? "border-emerald-900/40 bg-emerald-950/20"
                                            : "border-emerald-200 bg-emerald-50/80",
                                    )}
                                >
                                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                        Covered by uploads — no request needed
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {fulfilledOptions.map((doc) => (
                                            <span
                                                key={doc.id}
                                                className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                                            >
                                                <CheckCircle2 className="h-3 w-3" />
                                                {doc.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {allTypesCovered ? (
                                <div
                                    className={cn(
                                        "rounded-lg border px-4 py-4 text-sm",
                                        isDark
                                            ? "border-gray-700 bg-[#282524] text-gray-300"
                                            : "border-slate-200 bg-slate-50 text-slate-600",
                                    )}
                                >
                                    All standard document types are already covered by uploaded files.
                                    You can finish without sending an ISO request, or go back to adjust file
                                    assignments.
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-3">
                                        <Label className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-slate-900"}`}>
                                            Request missing documents
                                        </Label>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {requestableOptions.map((doc) => {
                                                const isSelected = selectedDocuments.includes(doc.id);
                                                return (
                                                    <label
                                                        key={doc.id}
                                                        className={cn(
                                                            "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                                                            isSelected
                                                                ? isDark
                                                                    ? "border-[var(--brand)]/50 bg-[var(--brand)]/10"
                                                                    : "border-[var(--brand)]/40 bg-[var(--brand)]/5"
                                                                : isDark
                                                                  ? "border-gray-700 bg-transparent hover:bg-gray-800/50"
                                                                  : "border-slate-200 bg-white hover:bg-slate-50",
                                                        )}
                                                    >
                                                        <Checkbox
                                                            checked={isSelected}
                                                            className="mt-0.5 size-4 shrink-0"
                                                            onCheckedChange={(checked: boolean | "indeterminate") =>
                                                                setDocumentSelected(doc.id, checked === true)
                                                            }
                                                        />
                                                        <span
                                                            className={cn(
                                                                "text-sm leading-snug",
                                                                isDark ? "text-gray-200" : "text-slate-800",
                                                            )}
                                                        >
                                                            {doc.label}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        <p className={`text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                                            {selectedDocuments.length} document
                                            {selectedDocuments.length === 1 ? "" : "s"} selected
                                            {requestAdditional ? " (+ additional)" : ""}
                                        </p>
                                    </div>

                                    <label
                                        className={cn(
                                            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5",
                                            requestAdditional
                                                ? isDark
                                                    ? "border-[var(--brand)]/50 bg-[var(--brand)]/10"
                                                    : "border-[var(--brand)]/40 bg-[var(--brand)]/5"
                                                : isDark
                                                  ? "border-gray-700"
                                                  : "border-slate-200",
                                        )}
                                    >
                                        <Checkbox
                                            checked={requestAdditional}
                                            className="size-4 shrink-0"
                                            onCheckedChange={(checked: boolean | "indeterminate") =>
                                                setRequestAdditional(checked === true)
                                            }
                                        />
                                        <span className={`text-sm ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                                            Request Additional Documents
                                        </span>
                                    </label>

                                    <div className="space-y-2">
                                        <Label className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                                            Optional Note for ISO
                                        </Label>
                                        <Controller
                                            control={control}
                                            name="reason"
                                            rules={{
                                                maxLength: {
                                                    value: maxChars,
                                                    message: `Note must not exceed ${maxChars} characters`,
                                                },
                                            }}
                                            render={({ field }) => (
                                                <>
                                                    <Textarea
                                                        {...field}
                                                        placeholder="Optional note to include in the ISO email..."
                                                        className={`min-h-[80px] resize-none px-3 py-2 rounded-sm outline-none ${isDark ? "bg-muted border-gray-700 text-gray-200" : "bg-white"}`}
                                                        maxLength={maxChars}
                                                    />
                                                    <p className={`text-xs ml-auto ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                                        {reasonText.length}/{maxChars} characters
                                                    </p>
                                                </>
                                            )}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                                            ISO email (To) <span className="text-red-500">*</span>
                                        </Label>
                                        <Controller
                                            control={control}
                                            name="isoEmail"
                                            rules={{
                                                validate: (value) => {
                                                    const trimmed = String(value || "").trim();
                                                    if (trimmed && !EMAIL_PATTERN.test(trimmed)) {
                                                        return "Enter a valid email address";
                                                    }
                                                    if (!trimmed && additionalToEmails.length === 0) {
                                                        return "ISO email or Additional To is required";
                                                    }
                                                    return true;
                                                },
                                            }}
                                            render={({ field }) => (
                                                <>
                                                    <Input
                                                        {...field}
                                                        type="email"
                                                        placeholder="Enter ISO email"
                                                        className={isDark ? "bg-muted border-gray-700" : ""}
                                                        onChange={(e) => {
                                                            isoEmailTouchedRef.current = true;
                                                            field.onChange(e);
                                                        }}
                                                    />
                                                    {errors.isoEmail && (
                                                        <p className="text-xs text-red-500">{errors.isoEmail.message}</p>
                                                    )}
                                                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                                        {isoEmailHelper}
                                                    </p>
                                                </>
                                            )}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                                            Additional To
                                        </Label>
                                        <div className="mb-2 flex flex-wrap gap-2">
                                            {additionalToEmails.map((email) => (
                                                <span
                                                    key={email}
                                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${isDark ? "border-gray-600 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
                                                >
                                                    {email}
                                                    <button
                                                        type="button"
                                                        className="text-gray-500 hover:text-red-600"
                                                        onClick={() =>
                                                            removeEmailFromList(
                                                                email,
                                                                additionalToEmails,
                                                                setAdditionalToEmails,
                                                            )
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
                                                placeholder="extra@example.com"
                                                value={additionalToDraft}
                                                onChange={(e) => setAdditionalToDraft(e.target.value)}
                                                className={isDark ? "bg-muted border-gray-700" : ""}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        addEmailToList(
                                                            additionalToDraft,
                                                            additionalToEmails,
                                                            setAdditionalToEmails,
                                                            () => setAdditionalToDraft(""),
                                                        );
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    addEmailToList(
                                                        additionalToDraft,
                                                        additionalToEmails,
                                                        setAdditionalToEmails,
                                                        () => setAdditionalToDraft(""),
                                                    )
                                                }
                                            >
                                                Add
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                                            CC
                                        </Label>
                                        <div className="mb-2 flex flex-wrap gap-2">
                                            <LockedCcChips isDark={isDark} />
                                            {ccEmails.map((email) => (
                                                <span
                                                    key={email}
                                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${isDark ? "border-gray-600 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
                                                >
                                                    {email}
                                                    <button
                                                        type="button"
                                                        className="text-gray-500 hover:text-red-600"
                                                        onClick={() => removeEmailFromList(email, ccEmails, setCcEmails)}
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
                                                        addEmailToList(ccDraft, ccEmails, setCcEmails, () =>
                                                            setCcDraft(""),
                                                        );
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    addEmailToList(ccDraft, ccEmails, setCcEmails, () => setCcDraft(""))
                                                }
                                            >
                                                Add
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-3 border-t px-6 py-4 dark:border-gray-700">
                    {wizardStep === "uploads" ? (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCancel}
                                className={cn(
                                    "h-10 flex-1 rounded-md",
                                    isDark
                                        ? "border-gray-700 bg-muted text-gray-300 hover:bg-gray-700"
                                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                                )}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleSkipToRequest}
                                className="h-10 flex-1 rounded-md"
                            >
                                Skip to request
                            </Button>
                            <Button
                                type="button"
                                onClick={() => void handleContinueFromUploads()}
                                disabled={savingAssignments}
                                className="h-10 flex-1 rounded-md bg-[#CA8A03] px-4 text-white hover:bg-[#CA8A03]/90 disabled:opacity-50"
                            >
                                {savingAssignments ? "Saving..." : "Continue"}
                            </Button>
                        </>
                    ) : (
                        <>
                            {uploadedFiles.length > 0 ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setWizardStep("uploads")}
                                    className="h-10 rounded-md px-3"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCancel}
                                className={cn(
                                    "h-10 flex-1 rounded-md",
                                    isDark
                                        ? "border-gray-700 bg-muted text-gray-300 hover:bg-gray-700"
                                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                                )}
                            >
                                Cancel
                            </Button>
                            {allTypesCovered ? (
                                <Button
                                    type="button"
                                    onClick={() => void handleFinishWithoutRequest()}
                                    disabled={savingAssignments}
                                    className="h-10 flex-1 rounded-md bg-[#CA8A03] px-6 text-white hover:bg-[#CA8A03]/90 disabled:opacity-50"
                                >
                                    {savingAssignments ? "Saving..." : "Done"}
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    onClick={handleSubmit(onSubmit)}
                                    disabled={sendRequestLoading}
                                    className="h-10 flex-1 rounded-md bg-[#CA8A03] px-6 text-white hover:bg-[#CA8A03]/90 disabled:opacity-50"
                                >
                                    {sendRequestLoading ? "Submitting..." : "Send Request"}
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
        <PDFViewerDocsModal
            isOpen={isPDFModalOpen}
            onClose={handleClosePDFModal}
            fileUrl={pdfFileUrl}
            fileName={pdfFileName}
            mimeTypeHint={pdfMimeTypeHint}
            overlayClassName="z-[10251]"
            contentClassName="z-[10252]"
        />
        </>
    );
};

export default RequestMissingDocumentsModal;
