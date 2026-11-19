import { useCallback, useRef, useState, type ReactNode } from "react";
import ScrubbingPreviewModal, { type ScrubbingPreviewCaptureExtra } from "./ScrubbingPreviewModal";
import { elementToPdfBlobUrl } from "@/mcaWdPreview/utils/downloadElementAsPdf";

/** Give up on the capture after this long so Recommend / ISO approval never hangs. */
const CAPTURE_TIMEOUT_MS = 45_000;

async function blobUrlToBase64(url: string): Promise<string> {
    const blob = await (await fetch(url)).blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * Builds the Scrubbing tab Preview PDF (same render as its Download PDF) for
 * the recommend mail, where the backend attaches it as Breakdown.pdf.
 * Render `element` somewhere in the tree; `capture()` resolves to the PDF as
 * base64, or null when the deal has no positions and no bank analysis or the
 * capture fails. `capturePreviewHtml()` uses the same offscreen render but
 * only builds the preview's Copy HTML (for the ISO approval mail): null unless
 * some preview number is > 0, or when the build fails.
 */
type BreakdownCapture = {
    /** Breakdown.pdf as base64, or null. */
    pdf: string | null;
    /** The preview's Copy HTML, or null. */
    previewHtml: string | null;
};

const EMPTY_CAPTURE: BreakdownCapture = { pdf: null, previewHtml: null };

export function useBreakdownPdf(applicationId: string | null | undefined): {
    capture: () => Promise<string | null>;
    /** Same offscreen render as `capture`, but only the Copy HTML (no PDF) for the ISO approval mail. */
    capturePreviewHtml: () => Promise<string | null>;
    element: ReactNode;
} {
    const [capturing, setCapturing] = useState(false);
    const resolveRef = useRef<((value: BreakdownCapture) => void) | null>(null);
    const htmlOnlyRef = useRef(false);

    const finish = useCallback((value: BreakdownCapture) => {
        const resolve = resolveRef.current;
        resolveRef.current = null;
        setCapturing(false);
        resolve?.(value);
    }, []);

    const start = useCallback(
        (htmlOnly: boolean) =>
            new Promise<BreakdownCapture>((resolve) => {
                if (!applicationId) {
                    resolve(EMPTY_CAPTURE);
                    return;
                }
                htmlOnlyRef.current = htmlOnly;
                resolveRef.current = resolve;
                setCapturing(true);
                setTimeout(() => {
                    if (resolveRef.current === resolve) finish(EMPTY_CAPTURE);
                }, CAPTURE_TIMEOUT_MS);
            }),
        [applicationId, finish],
    );

    const capture = useCallback(
        async () => (await start(false)).pdf,
        [start],
    );
    const capturePreviewHtml = useCallback(
        async () => (await start(true)).previewHtml,
        [start],
    );

    const handleReady = useCallback(
        async (
            el: HTMLElement | null,
            hasData: boolean,
            extra?: ScrubbingPreviewCaptureExtra,
        ) => {
            if (!resolveRef.current) return;
            if (!el) {
                finish(EMPTY_CAPTURE);
                return;
            }
            if (htmlOnlyRef.current) {
                // A failed HTML build only drops the HTML, never the approval mail.
                let previewHtml: string | null = null;
                if (extra?.hasPositiveValue) {
                    try {
                        previewHtml = await extra.buildEmailHtml();
                    } catch (err) {
                        console.error("Scrubbing preview HTML build failed:", err);
                    }
                }
                finish({ pdf: null, previewHtml });
                return;
            }
            let pdf: string | null = null;
            if (hasData) {
                try {
                    const url = await elementToPdfBlobUrl(el);
                    if (url) {
                        pdf = await blobUrlToBase64(url);
                        URL.revokeObjectURL(url);
                    }
                } catch (err) {
                    console.error("Breakdown PDF capture failed:", err);
                }
            }
            finish({ pdf, previewHtml: null });
        },
        [finish],
    );

    const element = capturing ? (
        <ScrubbingPreviewModal
            open
            onOpenChange={() => undefined}
            applicationId={applicationId}
            captureMode
            onCaptureReady={(el, hasData, extra) => void handleReady(el, hasData, extra)}
        />
    ) : null;

    return { capture, capturePreviewHtml, element };
}
