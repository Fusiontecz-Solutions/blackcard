import { useRef, useState } from "react";
import { CheckCircle2, Eye, Loader2, Upload, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DOCUMENT_REQUEST_OPTIONS } from "./RequestMissingDocumentsModal";
import {
    isSentBackDocumentationRequest,
    isUploadableDocumentRequest,
    SENT_BACK_DOCUMENTATION_LABEL,
} from "@/lib/documentRequestMatch";

export type RequestedDocumentRow = {
    name: string;
    label?: string;
    status: "Complete" | "Pending";
    uploadable?: boolean;
    message?: string;
};

function formatDocName(name: string): string {
    if (!name) return "";
    return name
        .replace(/[-_]/g, " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

export function getRequestedDocumentLabel(doc: { name: string; label?: string }): string {
    if (doc.label?.trim()) return doc.label.trim();
    if (isSentBackDocumentationRequest(doc.name)) return SENT_BACK_DOCUMENTATION_LABEL;
    const match = DOCUMENT_REQUEST_OPTIONS.find((opt) => opt.id === doc.name);
    if (match) return match.label;
    return formatDocName(doc.name);
}

type RequestedDocumentUploadRowsProps = {
    pending: RequestedDocumentRow[];
    completed: RequestedDocumentRow[];
    onUpload: (requestDocId: string, file: File) => Promise<void>;
    /** Open in-app preview (modal or contract pane) — never navigate/download directly. */
    onView?: (requestDocId: string) => void;
    /** When true, rows render without outer section chrome (for contract modal document list). */
    embedded?: boolean;
    canView?: (requestDocId: string) => boolean;
    /** Allow replacing an already-received document (public portal / request flows). */
    allowReplace?: boolean;
    /** Remove/cancel a document request (contract modal — staff only). */
    onRemove?: (requestDocId: string) => Promise<void> | void;
};

export default function RequestedDocumentUploadRows({
    pending,
    completed,
    onUpload,
    onView,
    embedded = false,
    canView,
    allowReplace = false,
    onRemove,
}: RequestedDocumentUploadRowsProps) {
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [pendingName, setPendingName] = useState<Record<string, string>>({});
    const [dragOverKey, setDragOverKey] = useState<string | null>(null);
    const [removingKey, setRemovingKey] = useState<string | null>(null);
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const allRows = [...pending, ...completed];
    if (!allRows.length) return null;

    const handlePick = async (requestKey: string, files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;

        setPendingName((prev) => ({ ...prev, [requestKey]: file.name }));
        setUploadProgress((prev) => ({ ...prev, [requestKey]: 0 }));

        try {
            await onUpload(requestKey, file);
            setUploadProgress((prev) => ({ ...prev, [requestKey]: 100 }));
        } finally {
            setUploadProgress((prev) => {
                const next = { ...prev };
                delete next[requestKey];
                return next;
            });
            setPendingName((prev) => {
                const next = { ...prev };
                delete next[requestKey];
                return next;
            });
        }
    };

    const rows = (
        <div className="space-y-2">
            {allRows.map((doc, index) => {
                const requestKey = String(doc.name || `request-${index}`);
                const label = getRequestedDocumentLabel(doc);
                const isComplete = doc.status === "Complete";
                const progress = uploadProgress[requestKey];
                const isUploading = typeof progress === "number";
                const isDragOver = dragOverKey === requestKey;
                const uploadingName = pendingName[requestKey];
                const viewable = isComplete && Boolean(onView) && (canView?.(requestKey) ?? true);
                const rowUploadable = isUploadableDocumentRequest(doc);
                const canUpload = rowUploadable && (!isComplete || allowReplace);
                const isRemoving = removingKey === requestKey;
                const rowInteractive = canUpload && !isUploading && !isRemoving;

                return (
                    <div
                        key={`req-doc-${requestKey}`}
                        role={rowInteractive ? "button" : undefined}
                        tabIndex={rowInteractive ? 0 : -1}
                        onClick={() => {
                            if (!rowInteractive) return;
                            inputRefs.current[requestKey]?.click();
                        }}
                        onKeyDown={(e) => {
                            if (!rowInteractive) return;
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                inputRefs.current[requestKey]?.click();
                            }
                        }}
                        onDragOver={(e) => {
                            if (!rowInteractive) return;
                            e.preventDefault();
                            setDragOverKey(requestKey);
                        }}
                        onDragLeave={() => setDragOverKey((k) => (k === requestKey ? null : k))}
                        onDrop={(e) => {
                            if (!rowInteractive) return;
                            e.preventDefault();
                            setDragOverKey(null);
                            void handlePick(requestKey, e.dataTransfer?.files ?? null);
                        }}
                        className={cn(
                            "relative flex items-center justify-between rounded-2xl border px-3 py-2.5 transition-colors",
                            isComplete
                                ? "border-emerald-200 bg-emerald-50"
                                : isUploading
                                  ? "border-blue-200 bg-blue-50"
                                    : isDragOver
                                    ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
                                    : "border-amber-200 bg-amber-50",
                            rowInteractive && "cursor-pointer hover:bg-amber-100/70",
                        )}
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            {rowUploadable && (!isComplete || isUploading) && (
                                <span
                                    className={cn(
                                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                                        isUploading
                                            ? "bg-blue-100 text-blue-700"
                                            : "bg-amber-100 text-amber-700",
                                    )}
                                >
                                    {isUploading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <UploadCloud className="h-3.5 w-3.5" />
                                    )}
                                </span>
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800">{label}</p>
                                <p className="truncate text-[11px] text-slate-500">
                                    {!rowUploadable
                                        ? doc.message?.trim() || "Underwriting send-back — no file upload required"
                                        : isComplete
                                          ? allowReplace
                                              ? "Document received — replace if needed"
                                              : "Document received"
                                          : isUploading
                                            ? uploadingName || "Uploading..."
                                            : "Pending — upload required"}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {canUpload && !isUploading && (
                                <Input
                                    ref={(el) => {
                                        inputRefs.current[requestKey] = el;
                                    }}
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    className="hidden"
                                    onChange={(e) => {
                                        void handlePick(requestKey, e.target.files);
                                        e.target.value = "";
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )}

                            {isUploading ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                    {`${progress ?? 0}%`}
                                </span>
                            ) : (
                                <span
                                    className={cn(
                                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                        !rowUploadable
                                            ? "bg-slate-100 text-slate-700"
                                            : isComplete
                                              ? "bg-emerald-100 text-emerald-700"
                                              : "bg-amber-100 text-amber-700",
                                    )}
                                >
                                    {isComplete ? (
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                    ) : null}
                                    {!rowUploadable
                                        ? "Send-back"
                                        : isComplete
                                          ? "Received"
                                          : "Pending"}
                                </span>
                            )}

                            {viewable ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-[11px] font-medium"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onView?.(requestKey);
                                    }}
                                >
                                    <Eye className="h-3.5 w-3.5" aria-hidden />
                                    View
                                </Button>
                            ) : null}

                            {canUpload && !isUploading ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-[11px] font-medium"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        inputRefs.current[requestKey]?.click();
                                    }}
                                >
                                    <Upload className="h-3.5 w-3.5" aria-hidden />
                                    {isComplete ? "Replace" : "Upload"}
                                </Button>
                            ) : null}

                            {onRemove ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
                                    disabled={isRemoving || isUploading}
                                    title="Remove document request"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setRemovingKey(requestKey);
                                        Promise.resolve(onRemove(requestKey)).finally(() => {
                                            setRemovingKey((k) => (k === requestKey ? null : k));
                                        });
                                    }}
                                >
                                    {isRemoving ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                    ) : (
                                        <X className="h-3.5 w-3.5" aria-hidden />
                                    )}
                                </Button>
                            ) : null}
                        </div>

                        {isUploading && (
                            <div className="pointer-events-none absolute inset-x-3 bottom-1 h-1 overflow-hidden rounded-full bg-blue-100">
                                <div
                                    className="h-full rounded-full bg-blue-500 transition-[width] duration-200 ease-out"
                                    style={{ width: `${progress ?? 0}%` }}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    if (embedded) return rows;

    return <div className="space-y-3 border-b px-6 py-4">{rows}</div>;
}
