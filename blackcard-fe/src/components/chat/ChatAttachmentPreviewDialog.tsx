import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatAttachmentPreviewPayload = {
    url: string;
    fileName: string;
    fileType: string;
};

type ChatAttachmentPreviewDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fileUrl: string;
    fileName: string;
    fileType: string;
};

function isPdfFile(fileName: string, fileType: string): boolean {
    const t = fileType.toLowerCase();
    const n = fileName.toLowerCase();
    return t.includes("pdf") || n.endsWith(".pdf");
}

function isImageFile(fileType: string): boolean {
    return fileType.toLowerCase().startsWith("image/");
}

/** True if response body is almost certainly HTML (error page), not a PDF */
function looksLikeHtmlError(blob: Blob): boolean {
    const t = (blob.type || "").toLowerCase();
    if (t.includes("html")) return true;
    if (t.startsWith("text/") && !t.includes("pdf")) return true;
    return false;
}

export function ChatAttachmentPreviewDialog({
    open,
    onOpenChange,
    fileUrl,
    fileName,
    fileType,
}: ChatAttachmentPreviewDialogProps) {
    const [downloading, setDownloading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
    /** Reused by Download after preview fetch — no auto-download, only on button click */
    const cachedPdfBlobRef = useRef<Blob | null>(null);

    const pdf = isPdfFile(fileName, fileType);
    const image = isImageFile(fileType);

    const revokePreviewUrl = useCallback((url: string | null) => {
        if (url) URL.revokeObjectURL(url);
    }, []);

    // Load PDF into a blob URL for iframe — avoids iframe triggering file download (Content-Disposition) and many X-Frame-Options blocks
    useEffect(() => {
        if (!open || !fileUrl) {
            setPreviewBlobUrl((prev) => {
                revokePreviewUrl(prev);
                return null;
            });
            cachedPdfBlobRef.current = null;
            setPreviewError(null);
            setPreviewLoading(false);
            return;
        }

        if (!pdf) {
            setPreviewBlobUrl((prev) => {
                revokePreviewUrl(prev);
                return null;
            });
            cachedPdfBlobRef.current = null;
            setPreviewError(null);
            setPreviewLoading(false);
            return;
        }

        let cancelled = false;
        setPreviewLoading(true);
        setPreviewError(null);
        setPreviewBlobUrl((prev) => {
            revokePreviewUrl(prev);
            return null;
        });
        cachedPdfBlobRef.current = null;

        (async () => {
            try {
                const res = await fetch(fileUrl, {
                    mode: "cors",
                    credentials: "omit",
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const blob = await res.blob();
                if (cancelled) return;

                if (looksLikeHtmlError(blob)) {
                    throw new Error("not_pdf");
                }

                const buf = await blob.arrayBuffer();
                const head = new Uint8Array(buf.byteLength >= 5 ? buf.slice(0, 5) : buf);
                const sig = String.fromCharCode(...head);
                if (!sig.startsWith("%PDF")) {
                    throw new Error("not_pdf");
                }
                const pdfBlob = new Blob([buf], { type: "application/pdf" });
                cachedPdfBlobRef.current = pdfBlob;
                const objectUrl = URL.createObjectURL(pdfBlob);
                if (cancelled) {
                    URL.revokeObjectURL(objectUrl);
                    return;
                }
                setPreviewBlobUrl(objectUrl);
            } catch {
                if (!cancelled) {
                    cachedPdfBlobRef.current = null;
                    setPreviewError(
                        "Preview could not be loaded (network or permissions). You can still try Download.",
                    );
                }
            } finally {
                if (!cancelled) setPreviewLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open, fileUrl, pdf, revokePreviewUrl]);

    const handleDownload = useCallback(async () => {
        if (!fileUrl) return;
        setDownloading(true);
        try {
            let blob: Blob | null = cachedPdfBlobRef.current;
            if (!blob) {
                const res = await fetch(fileUrl, {
                    mode: "cors",
                    credentials: "omit",
                });
                if (!res.ok) throw new Error("fetch failed");
                blob = await res.blob();
                if (pdf) {
                    const ab = await blob.arrayBuffer();
                    const head = new Uint8Array(ab.byteLength >= 5 ? ab.slice(0, 5) : ab);
                    if (!String.fromCharCode(...head).startsWith("%PDF")) {
                        window.open(fileUrl, "_blank", "noopener,noreferrer");
                        return;
                    }
                    blob = new Blob([ab], { type: "application/pdf" });
                }
            }
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = fileName || "download";
            a.rel = "noopener noreferrer";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch {
            window.open(fileUrl, "_blank", "noopener,noreferrer");
        } finally {
            setDownloading(false);
        }
    }, [fileUrl, fileName, pdf]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[95vh] max-h-[95vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
                <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 space-y-0 p-3 pb-0 pr-12">
                    <DialogTitle className="min-w-0 flex-1 text-left text-base font-semibold leading-snug text-foreground break-words">
                        {fileName || "Document viewer"}
                    </DialogTitle>
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        disabled={downloading || !fileUrl}
                        onClick={() => void handleDownload()}
                    >
                        <Download className="size-4" />
                        {downloading ? "Downloading…" : "Download"}
                    </Button>
                    <DialogDescription className="sr-only">
                        Preview and download attachment
                    </DialogDescription>
                </DialogHeader>

                {/* Match PDFViewerDocsModal: bordered, inset preview panel */}
                <div className="flex min-h-0 flex-1 flex-col">
                    <div
                        className={cn(
                            "relative m-3 flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-border bg-gray-50 dark:bg-muted/40",
                            !pdf && "items-center justify-center",
                        )}
                    >
                        {pdf && fileUrl ? (
                            <>
                                {previewLoading ? (
                                    <div className="flex min-h-[500px] flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                                        <Loader2 className="size-10 animate-spin" />
                                        <p className="text-sm">Loading PDF…</p>
                                    </div>
                                ) : null}
                                {previewError && !previewLoading ? (
                                    <div className="flex min-h-[500px] flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                                        <p className="max-w-md text-sm text-muted-foreground">
                                            {previewError}
                                        </p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void handleDownload()}
                                            disabled={downloading}
                                        >
                                            <Download className="mr-2 size-4" />
                                            Download
                                        </Button>
                                    </div>
                                ) : null}
                                {previewBlobUrl && !previewLoading ? (
                                    <iframe
                                        title={fileName || "PDF"}
                                        src={previewBlobUrl}
                                        width="100%"
                                        height="100%"
                                        className="min-h-[500px] w-full flex-1 border-0 bg-white dark:bg-zinc-950"
                                        style={{ border: "none", minHeight: "500px" }}
                                    />
                                ) : null}
                            </>
                        ) : null}

                        {image && fileUrl ? (
                            <div className="flex min-h-[500px] w-full flex-1 items-center justify-center p-4">
                                <img
                                    src={fileUrl}
                                    alt={fileName}
                                    className="max-h-full max-w-full object-contain"
                                />
                            </div>
                        ) : null}

                        {!pdf && !image && fileUrl ? (
                            <div className="flex min-h-[500px] flex-col items-center justify-center gap-4 px-6 py-12">
                                <FileText
                                    className="size-14 text-muted-foreground"
                                    strokeWidth={1.25}
                                />
                                <p className="text-center text-sm text-muted-foreground">
                                    Preview isn&apos;t available for this file type. Use Download
                                    to open or save it.
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void handleDownload()}
                                    disabled={downloading}
                                >
                                    <Download className="mr-2 size-4" />
                                    Download file
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
