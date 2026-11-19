import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import {
    isImageMimeOrName,
    isPdfMimeOrName,
    isTextMimeOrName,
    resolveDocumentPreview,
} from "@/lib/documentPreview";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type DocumentViewerPanelProps = {
    fileUrl: string;
    fileName?: string;
    className?: string;
    minHeightClassName?: string;
    preferDirectUrl?: boolean;
    publicPortalToken?: string;
    mimeTypeHint?: string;
};

function PdfPages({ fileUrl, minHeightClassName }: { fileUrl: string; minHeightClassName: string }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageWidth, setPageWidth] = useState(640);

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const measure = () => {
            const w = el.clientWidth;
            if (w > 0) setPageWidth(Math.max(280, w - 24));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            ref={wrapRef}
            className={`absolute inset-0 overflow-y-auto overflow-x-hidden bg-slate-100 dark:bg-slate-950 ${minHeightClassName}`}
        >
            <Document
                file={fileUrl}
                onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                loading={
                    <div className="flex min-h-[300px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
                    </div>
                }
                error={
                    <div className="flex min-h-[300px] items-center justify-center px-4 text-center text-xs text-slate-500">
                        Could not render this PDF. Try downloading the file instead.
                    </div>
                }
                className="flex w-full flex-col items-center gap-3 py-3"
            >
                {numPages
                    ? Array.from({ length: numPages }, (_, i) => (
                          <Page
                              key={i + 1}
                              pageNumber={i + 1}
                              width={pageWidth}
                              className="bg-white shadow-md"
                              renderTextLayer
                              renderAnnotationLayer
                          />
                      ))
                    : null}
            </Document>
        </div>
    );
}

export function DocumentViewerPanel({
    fileUrl,
    fileName = "Document",
    className = "",
    minHeightClassName = "min-h-[300px]",
    preferDirectUrl = false,
    publicPortalToken,
    mimeTypeHint,
}: DocumentViewerPanelProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [mimeType, setMimeType] = useState<string>("");
    const [textContent, setTextContent] = useState<string | null>(null);
    const revokeRef = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const revoke = () => {
            if (revokeRef.current) {
                URL.revokeObjectURL(revokeRef.current);
                revokeRef.current = null;
            }
        };

        setLoading(true);
        setError(null);
        setPreviewUrl(null);
        setMimeType("");
        setTextContent(null);
        revoke();

        void resolveDocumentPreview(fileUrl, fileName, {
            preferDirectUrl,
            publicPortalToken,
            mimeTypeHint,
        })
            .then(async (resolved) => {
                if (cancelled) {
                    if (resolved.revokeOnCleanup) URL.revokeObjectURL(resolved.blobUrl);
                    return;
                }
                if (resolved.revokeOnCleanup) {
                    revokeRef.current = resolved.blobUrl;
                }
                setPreviewUrl(resolved.blobUrl);
                setMimeType(resolved.mimeType);

                if (isTextMimeOrName(resolved.mimeType, fileName)) {
                    const response = await fetch(resolved.blobUrl);
                    const text = await response.text();
                    if (!cancelled) setTextContent(text);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(
                        err instanceof Error ? err.message : "Could not load document preview.",
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
            revoke();
        };
    }, [fileName, fileUrl, mimeTypeHint, preferDirectUrl, publicPortalToken]);

    const handleDownload = () => {
        if (!previewUrl) return;
        const anchor = document.createElement("a");
        anchor.href = previewUrl;
        anchor.download = fileName || "document";
        anchor.rel = "noopener noreferrer";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    if (loading) {
        return (
            <div
                className={`relative flex items-center justify-center rounded-lg border bg-gray-50 dark:border-slate-700 dark:bg-slate-950 ${minHeightClassName} ${className}`}
            >
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
            </div>
        );
    }

    if (error || !previewUrl) {
        return (
            <div
                className={`flex flex-col items-center justify-center gap-3 rounded-lg border bg-gray-50 px-4 text-center dark:border-slate-700 dark:bg-slate-950 ${minHeightClassName} ${className}`}
            >
                <FileText className="h-10 w-10 text-muted-foreground" strokeWidth={1.25} />
                <p className="text-sm text-muted-foreground">
                    {error ?? "Preview is not available for this file."}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download file
                </Button>
            </div>
        );
    }

    if (isPdfMimeOrName(mimeType, fileName)) {
        return (
            <div className={`relative overflow-hidden rounded-lg border bg-gray-50 dark:border-slate-700 dark:bg-slate-950 ${className}`}>
                <PdfPages fileUrl={previewUrl} minHeightClassName={minHeightClassName} />
            </div>
        );
    }

    if (isImageMimeOrName(mimeType, fileName)) {
        return (
            <div
                className={`flex items-start justify-center overflow-auto rounded-lg border bg-slate-100 p-2 dark:border-slate-700 dark:bg-slate-950 ${minHeightClassName} ${className}`}
            >
                <img
                    src={previewUrl}
                    alt={fileName}
                    className="max-h-full max-w-full object-contain"
                />
            </div>
        );
    }

    if (textContent != null) {
        return (
            <div
                className={`overflow-auto rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-950 ${minHeightClassName} ${className}`}
            >
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-800 dark:text-slate-100">
                    {textContent}
                </pre>
            </div>
        );
    }

    return (
        <div
            className={`flex flex-col overflow-hidden rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-950 ${minHeightClassName} ${className}`}
        >
            <iframe
                title={fileName}
                src={previewUrl}
                className="min-h-[300px] w-full flex-1 border-0"
            />
            <div className="flex justify-end border-t bg-muted/40 px-3 py-2">
                <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                </Button>
            </div>
        </div>
    );
}
