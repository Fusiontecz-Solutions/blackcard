import { useCallback, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CheckCircle2, Eye, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppDispatch, RootState } from "@/redux/store";
import { uploadApplicationDocuments, getApplicationByApplicationId } from "@/redux/actions/applicationActions";
import { getDocumentRequestsByApplication } from "@/redux/actions/notificationActions";
import {
    documentRequestDisplayLabel,
    isContractUploadDocumentRequest,
    type DocumentRequestRow,
} from "@/constants/documentRequestTypes";
import { cn } from "@/lib/utils";
import { toast } from "react-toastify";
import PDFViewerDocsModal from "./PDFViewerDocsModal";

type RequestedDocumentsPanelProps = {
    applicationLookupId: string | number | null;
    applicationUuid: string | null;
    businessApplicationId?: string | number | null;
    contractId?: number | null;
    onUploadContractDocument?: (
        contractUploadKey: "voidedCheck" | "driverLicense",
        file: File,
    ) => Promise<void>;
    /** When set (e.g. contract modal), preview inline instead of opening a separate modal. */
    onViewDocument?: (fileUrl: string, fileName?: string) => void;
    readOnly?: boolean;
    compact?: boolean;
    className?: string;
};

export function RequestedDocumentsPanel({
    applicationLookupId,
    applicationUuid,
    businessApplicationId,
    contractId,
    onUploadContractDocument,
    onViewDocument,
    readOnly = false,
    compact = false,
    className,
}: RequestedDocumentsPanelProps) {
    const dispatch = useDispatch<AppDispatch>();
    const { loading, data: documentRequests } = useSelector(
        (state: RootState) => state.documentRequests,
    );
    const [uploadingSlug, setUploadingSlug] = useState<string | null>(null);
    const [previewModal, setPreviewModal] = useState<{ url: string; name: string; mimeType?: string } | null>(null);
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const handleViewDocument = useCallback(
        (doc: DocumentRequestRow) => {
            const url = String(doc.fileUrl || "").trim();
            if (!url) {
                toast.error("File URL not available.");
                return;
            }
            const name = documentRequestDisplayLabel(doc);
            if (onViewDocument) {
                onViewDocument(url, name);
            } else {
                setPreviewModal({ url, name, mimeType: doc.mimeType });
            }
        },
        [onViewDocument],
    );

    const refreshAfterUpload = useCallback(async () => {
        const lookup = applicationLookupId ?? businessApplicationId;
        if (lookup != null) {
            await dispatch(getDocumentRequestsByApplication(lookup));
        }
        const refreshKey = businessApplicationId ?? applicationLookupId;
        if (refreshKey != null) {
            await dispatch(getApplicationByApplicationId(String(refreshKey)));
        }
    }, [applicationLookupId, businessApplicationId, dispatch]);

    const handleUpload = useCallback(
        async (doc: DocumentRequestRow, file: File) => {
            const slug = doc.name;

            setUploadingSlug(slug);
            try {
                if (
                    isContractUploadDocumentRequest(doc) &&
                    doc.contractUploadKey &&
                    onUploadContractDocument
                ) {
                    if (contractId == null) {
                        toast.error("Open or create a contract before uploading this document.");
                        return;
                    }
                    await onUploadContractDocument(doc.contractUploadKey, file);
                } else {
                    if (!applicationUuid) {
                        toast.error("Application not loaded. Refresh and try again.");
                        return;
                    }
                    const formDataId = applicationUuid;
                    await dispatch(
                        uploadApplicationDocuments({
                            id: formDataId,
                            files: [file],
                            requestedDocumentSlug: slug,
                        }),
                    ).unwrap();
                }

                toast.success(`${documentRequestDisplayLabel(doc)} uploaded.`);
                await refreshAfterUpload();
            } catch (error: unknown) {
                const message =
                    typeof error === "string"
                        ? error
                        : (error as { message?: string })?.message || "Upload failed.";
                toast.error(message);
            } finally {
                setUploadingSlug(null);
            }
        },
        [
            applicationUuid,
            contractId,
            dispatch,
            onUploadContractDocument,
            refreshAfterUpload,
        ],
    );

    const rows = (documentRequests || []) as DocumentRequestRow[];
    const pendingCount = rows.filter((d) => d.status !== "Complete").length;

    if (loading && rows.length === 0) {
        return (
            <div className={cn("flex items-center gap-2 text-xs text-slate-500", className)}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading document requests…
            </div>
        );
    }

    if (rows.length === 0) {
        return null;
    }

    return (
        <div
            className={cn(
                "rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
                compact ? "p-3" : "p-4",
                className,
            )}
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Document Requests
                </p>
                {pendingCount > 0 ? (
                    <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        {pendingCount} pending
                    </span>
                ) : (
                    <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        All received
                    </span>
                )}
            </div>

            <div className="space-y-2">
                {rows.map((doc, index) => {
                    const isReceived = doc.status === "Complete";
                    const label = documentRequestDisplayLabel(doc);
                    const isUploading = uploadingSlug === doc.name;

                    return (
                        <div
                            key={`${doc.name}-${index}`}
                            className={cn(
                                "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2",
                                isReceived
                                    ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                                    : "border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20",
                            )}
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                    {label}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {isReceived ? "Received" : "Pending — upload required"}
                                </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                                {isReceived && doc.fileUrl ? (
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 shrink-0"
                                        title={`View ${label}`}
                                        aria-label={`View ${label}`}
                                        onClick={() => handleViewDocument(doc)}
                                    >
                                        <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                ) : null}

                                {!isReceived && !readOnly ? (
                                    <>
                                        <input
                                            ref={(el) => {
                                                fileInputRefs.current[doc.name] = el;
                                            }}
                                            type="file"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                e.target.value = "";
                                                if (file) void handleUpload(doc, file);
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-8 gap-1 border-[var(--brand)]/30 px-2.5 text-xs text-[var(--brand)] hover:bg-[var(--brand)]/5"
                                            disabled={isUploading}
                                            onClick={() => fileInputRefs.current[doc.name]?.click()}
                                        >
                                            {isUploading ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <UploadCloud className="h-3.5 w-3.5" />
                                            )}
                                            Upload
                                        </Button>
                                    </>
                                ) : null}

                                {isReceived ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>

            <PDFViewerDocsModal
                isOpen={previewModal != null}
                onClose={() => setPreviewModal(null)}
                fileUrl={previewModal?.url}
                fileName={previewModal?.name}
                mimeTypeHint={previewModal?.mimeType}
            />
        </div>
    );
}

export default RequestedDocumentsPanel;
