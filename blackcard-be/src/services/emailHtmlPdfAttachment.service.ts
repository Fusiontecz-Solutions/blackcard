import {
    renderLetterHtmlToPdfBuffer,
    sanitizeLetterPdfFilename,
} from './pdf/letterHtmlToPdf.service';

export type HtmlPdfMailAttachment = {
    filename: string;
    content: Buffer;
    contentType: string;
    contentDisposition: 'attachment';
};

/**
 * Best-effort: render an HTML email body as a PDF attachment.
 * Returns null if generation fails so callers can still deliver the HTML email.
 */
export async function buildHtmlPdfMailAttachment(
    html: string,
    filenameBase: string,
): Promise<HtmlPdfMailAttachment | null> {
    const htmlTrimmed = String(html ?? '').trim();
    if (!htmlTrimmed) return null;

    try {
        const buffer = await renderLetterHtmlToPdfBuffer(htmlTrimmed);
        return {
            filename: sanitizeLetterPdfFilename(filenameBase),
            content: buffer,
            contentType: 'application/pdf',
            contentDisposition: 'attachment',
        };
    } catch (err) {
        console.error('[emailHtmlPdf] PDF generation failed:', err);
        return null;
    }
}

/** Strict variant — throws when PDF generation fails (e.g. explicit letter compose). */
export async function requireHtmlPdfMailAttachment(
    html: string,
    filenameBase: string,
): Promise<HtmlPdfMailAttachment> {
    const attachment = await buildHtmlPdfMailAttachment(html, filenameBase);
    if (!attachment) {
        throw new Error('Failed to generate PDF attachment from email HTML');
    }
    return attachment;
}
