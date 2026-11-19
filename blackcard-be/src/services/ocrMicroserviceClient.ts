
import axios from 'axios';
import FormData from 'form-data';

const DEFAULT_OCR_BASE = 'http://127.0.0.1:8000';

export type OcrExtractResponse = {
    raw_text?: string[];
    words?: unknown[];
    combined_text?: string;
    structured_fields?: {
        business?: Record<string, string | null | undefined>;
        owner?: Record<string, string | null | undefined>;
        confidence?: Record<string, number | null | undefined>;
        template_hints?: Record<string, unknown>;
    };
};

export function getOcrServiceBaseUrl(): string {
    const raw = process.env.OCR_SERVICE_URL || DEFAULT_OCR_BASE;
    return String(raw).replace(/\/$/, '');
}

/**
 * POSTs the PDF bytes to `{base}/extract` and returns the best available full-text string.
 * FastAPI field name matches `UploadFile = File(...)`: **file**.
 */
const previewMax = () => Math.max(200, Number(process.env.OCR_DEBUG_PREVIEW_CHARS || 800));

function appendStructuredHintsToText(
    text: string,
    structured?: OcrExtractResponse['structured_fields'],
): string {
    if (!structured) return text;

    const business = structured.business || {};
    const owner = structured.owner || {};

    const lines: string[] = [];
    const add = (label: string, value: unknown) => {
        const v = String(value ?? '').trim();
        if (!v) return;
        lines.push(`${label}: ${v}`);
    };

    // Canonical hints tailored to downstream parser labels.
    add('Business Legal Name', business.business_name);
    add('Business Address', business.business_address1);
    add('City', business.business_city);
    add('State', business.business_state);
    add('Zip', business.business_zip_code);
    add('Federal Tax ID', business.business_ein_number);

    const ownerFull = String(owner.owner_full_name ?? '').trim();
    if (ownerFull) {
        add('Full Name', ownerFull);
    } else {
        const first = String(owner.owner_first_name ?? '').trim();
        const last = String(owner.owner_last_name ?? '').trim();
        if (first) add('Owner First Name', first);
        if (last) add('Owner Last Name', last);
    }
    add('SSN', owner.owner_ssn);
    add('Date of Birth', owner.owner_date_of_birth);
    add('Credit Score', owner.owner_fico_score);
    add('Ownership %', owner.owner_ownership_percentage);

    if (!lines.length) return text;

    return `${text}\n\nSTRUCTURED OCR HINTS\n${lines.join('\n')}`.trim();
}

export async function extractCombinedTextFromOcrService(
    pdfBuffer: Buffer,
    filename: string,
): Promise<string> {
    const safeName = filename || 'document.pdf';
    const url = `${getOcrServiceBaseUrl()}/extract`;

    console.log('\n========== [Backend → OCR] Pipeline ==========');
    console.log('[Backend → OCR] Step 1: Backend is sending the PDF to the OCR microservice.');
    console.log('[Backend → OCR]   → URL:', url);
    console.log('[Backend → OCR]   → multipart field: file');
    console.log('[Backend → OCR]   → filename:', safeName);
    console.log('[Backend → OCR]   → buffer size (bytes):', pdfBuffer?.length ?? 0);

    const form = new FormData();
    form.append('file', pdfBuffer, {
        filename: safeName,
        contentType: 'application/pdf',
    });

    console.log('[Backend → OCR] Step 2: POST request in flight (uploading file body)...');

    const response = await axios.post<OcrExtractResponse>(url, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: Number(process.env.OCR_SERVICE_TIMEOUT_MS || 600_000),
        validateStatus: () => true,
    });

    const { data, status } = response;

    console.log('[OCR → Backend] Step 3: HTTP response received.');
    console.log('[OCR → Backend]   → status:', status);

    if (status >= 400) {
        const detail =
            typeof (data as any)?.detail === 'string'
                ? (data as any).detail
                : typeof data === 'string'
                  ? data
                  : JSON.stringify(data);
        console.error('[OCR → Backend]   → error body:', detail);
        console.log('========== [Backend → OCR] Pipeline (failed) ==========\n');
        throw new Error(`OCR service HTTP ${status}: ${detail}`);
    }

    const combined = typeof data?.combined_text === 'string' ? data.combined_text.trim() : '';
    const fromRaw = Array.isArray(data?.raw_text) ? data.raw_text.join('\n').trim() : '';
    let merged = combined || fromRaw;
    merged = appendStructuredHintsToText(merged, data?.structured_fields);
    const rawLineCount = Array.isArray(data?.raw_text) ? data.raw_text.length : 0;
    const wordCount = Array.isArray(data?.words) ? data.words.length : 0;

    console.log('[OCR → Backend] Step 4: Parsed OCR JSON payload.');
    console.log('[OCR → Backend]   → combined_text length:', combined.length);
    console.log('[OCR → Backend]   → raw_text lines:', rawLineCount);
    console.log('[OCR → Backend]   → words entries:', wordCount);
    console.log(
        '[OCR → Backend]   → structured owner_full_name:',
        (data?.structured_fields?.owner as any)?.owner_full_name || '(empty)',
    );
    console.log('[OCR → Backend]   → merged text length (used downstream):', merged.length);

    const maxPrev = previewMax();
    const preview = merged.length > maxPrev ? `${merged.slice(0, maxPrev)}\n… (${merged.length} chars total)` : merged;
    console.log('[OCR → Backend] Step 5: Extracted text preview (console):');
    console.log('--- OCR text preview start ---');
    console.log(preview || '(empty)');
    console.log('--- OCR text preview end ---');
    console.log('========== [Backend → OCR] Pipeline (ok) ==========\n');

    return merged;
}
