/** Max Scrubbing Preview HTML accepted for a mail; larger is ignored. */
export const SCRUBBING_PREVIEW_HTML_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Validates the Scrubbing Preview HTML (the preview's Copy output) sent with
 * the ISO approval request: strips <script> tags and returns undefined when
 * empty or over the size cap.
 */
export function sanitizeScrubbingPreviewHtml(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    if (Buffer.byteLength(raw, 'utf8') > SCRUBBING_PREVIEW_HTML_MAX_BYTES) {
        console.warn('[scrubbing-preview-html] scrubbing preview HTML over size cap; ignored');
        return undefined;
    }
    const cleaned = raw
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
        .replace(/<\/?script\b[^>]*>/gi, '')
        .trim();
    return cleaned || undefined;
}

/** Puts `extraHtml` below the template's content (inside </body> when present). */
export function appendBelowEmailBody(templateHtml: string, extraHtml: string): string {
    const block = `<div style="margin-top:24px;">${extraHtml}</div>`;
    const bodyClose = templateHtml.toLowerCase().lastIndexOf('</body>');
    if (bodyClose === -1) return `${templateHtml}${block}`;
    return `${templateHtml.slice(0, bodyClose)}${block}${templateHtml.slice(bodyClose)}`;
}
