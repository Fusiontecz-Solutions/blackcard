/**
 * Gmail / PDF-ingest pipeline: Claude hybrid extraction → synthetic parse text.
 */
import path from 'path';
import { getPdfExtractionService } from './pdf-extraction/pdfExtraction.context';
import { claudePdfResultToSyntheticParseText } from './claudePdfResultToSyntheticParseText';

export async function extractPdfPlainTextForParsing(
    pdfBuffer: Buffer,
    originalFilename: string,
    filePathFallback?: string,
): Promise<string> {
    const name =
        originalFilename?.trim?.() ||
        path.basename(filePathFallback || '') ||
        'document.pdf';

    try {
        const svc = getPdfExtractionService();
        const { result, meta } = await svc.extractHybridFromPdfBuffer(pdfBuffer);
        const dbg = svc.getRuntimeDebugConfig();
        const kd = result.key_data || {};
        const nonEmptyKeyCount = Object.values(kd).filter((v) => String(v ?? '').trim().length > 0).length;
        console.log(
            `[pdfIngestion] PDF extraction (${name}): provider=${String((dbg as { provider?: string }).provider ?? 'claude')} mode=${meta.text_mode_used} letters_seen=${meta.extracted_letters} bytes=${pdfBuffer.length} key_data_non_empty=${nonEmptyKeyCount}`,
        );
        console.log(
            `[pdfIngestion] key preview (${name}): business_name="${String(kd.business_name ?? '').trim()}" legal_business_name="${String(kd.legal_business_name ?? '').trim()}" owner_first_name="${String(kd.owner_first_name ?? '').trim()}" owner_last_name="${String(kd.owner_last_name ?? '').trim()}"`,
        );
        return claudePdfResultToSyntheticParseText(result);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[pdfIngestion] PDF extraction failed for "${name}". ${msg}`);
    }
}
