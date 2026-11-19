/** Document request ids stored on notifications → human labels (keep in sync with FE contractDocumentRequest.ts). */
export const DOCUMENT_REQUEST_LABELS: Record<string, string> = {
    'drivers-license': "Driver's License",
    'voided-check': 'Voided Check',
    'bank-statements': 'Bank Statements - 12 months',
    'bank-statements-mtd': 'Bank Statements - MTD',
    'additional-id': 'Additional ID Proof',
    'business-license': 'Business License',
    'proof-of-address': 'Proof of Address',
    'financial-statement': 'Financial Statement',
    'tax-returns': 'Tax Returns - Last 2 Years',
    'articles-of-incorporation': 'Articles of Incorporations',
};

export function normalizeDocumentRequestKey(value: unknown): string {
    return String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function getDocumentRequestLabel(documentId: string): string {
    const key = String(documentId || '').trim();
    if (DOCUMENT_REQUEST_LABELS[key]) return DOCUMENT_REQUEST_LABELS[key];
    return key
        .replace(/[-_]+/g, ' ')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/** Stable id for Final Underwriter send-back (no specific document list). */
export const SENT_BACK_DOCUMENTATION_REQUEST_ID = 'sent-back-for-documentation';

export const SENT_BACK_DOCUMENTATION_LABEL = 'Sent Back for Documentation';

function normalizeSlug(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

export function isSentBackDocumentationRequest(name: string): boolean {
    const normalized = String(name || '').trim().toLowerCase();
    const slug = normalizeSlug(normalized);
    return (
        normalized === SENT_BACK_DOCUMENTATION_REQUEST_ID ||
        slug === 'sentbackfordocumentation' ||
        normalized === SENT_BACK_DOCUMENTATION_LABEL.toLowerCase()
    );
}

export function isUploadableDocumentRequest(doc: {
    name: string;
    uploadable?: boolean;
}): boolean {
    if (doc.uploadable === false) return false;
    return !isSentBackDocumentationRequest(doc.name);
}

/** Human-readable label for a document request id (used by notifications). */
export function documentRequestDisplayLabel(docId: string): string {
    const id = String(docId || '').trim();
    if (isSentBackDocumentationRequest(id)) return SENT_BACK_DOCUMENTATION_LABEL;
    return getDocumentRequestLabel(id);
}

const DOCUMENT_REQUEST_UPLOAD_TAG_SEPARATOR = '__';

export function extractDocumentRequestTagFromFilename(filename: string): string | null {
    const raw = String(filename || '').trim();
    const sep = raw.indexOf(DOCUMENT_REQUEST_UPLOAD_TAG_SEPARATOR);
    if (sep <= 0) return null;
    return raw.slice(0, sep).trim() || null;
}

/** Canonical slug for stored uploads (keep in sync with FE documentRequestTypes.ts). */
export function normalizeDocumentSlug(raw?: string | null): string {
    const slug = String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-');
    const aliases: Record<string, string> = {
        'driving-license': 'driver-license',
        'drivers-license': 'driver-license',
        'driver-licence': 'driver-license',
        'driving-licence': 'driver-license',
        'void-check': 'voided-check',
        'voided-cheque': 'voided-check',
    };
    return aliases[slug] ?? slug;
}

/** Resolve the requested-document slug from multipart body fields and/or filename prefix. */
export function resolveUploadDocumentSlug(
    originalName: string,
    bodyFields?: { documentType?: unknown; requestedDocumentSlug?: unknown },
): string | null {
    const bodyRaw = String(
        bodyFields?.documentType || bodyFields?.requestedDocumentSlug || '',
    ).trim();
    const fromFilename = extractDocumentRequestTagFromFilename(originalName);
    const raw = fromFilename || bodyRaw;
    if (!raw) return null;
    return normalizeDocumentSlug(raw) || null;
}

type UploadedFileLike = {
    originalName?: string | null;
    fileName?: string | null;
    documentType?: string | null;
};

export function documentRequestMatchesUploadedFile(
    requestedDocName: string,
    file: UploadedFileLike,
): boolean {
    const reqKey = normalizeDocumentRequestKey(requestedDocName);
    const reqLabelKey = normalizeDocumentRequestKey(getDocumentRequestLabel(requestedDocName));
    if (!reqKey) return false;

    const rawName = String(file.originalName || file.fileName || '').trim();
    const embeddedTag = extractDocumentRequestTagFromFilename(rawName);
    if (embeddedTag) {
        const tagKey = normalizeDocumentRequestKey(embeddedTag);
        if (tagKey === reqKey || tagKey === reqLabelKey) return true;
    }

    const fileKeys = [file.originalName, file.fileName, file.documentType]
        .filter((v) => v != null && String(v).trim() !== '')
        .map((v) => normalizeDocumentRequestKey(v));

    for (const fileKey of fileKeys) {
        if (!fileKey) continue;
        if (fileKey === reqKey || fileKey === reqLabelKey) return true;
        if (fileKey.includes(reqKey) || reqKey.includes(fileKey)) return true;
        if (reqLabelKey && (fileKey.includes(reqLabelKey) || reqLabelKey.includes(fileKey))) {
            return true;
        }
    }
    return false;
}

export function isDocumentRequestFulfilled(
    requestedDocName: string,
    files: UploadedFileLike[],
): boolean {
    return files.some((file) => documentRequestMatchesUploadedFile(requestedDocName, file));
}

/** Document request ids matched by a single uploaded filename. */
export function documentRequestIdsMatchedByFileName(
    originalName: string,
    candidateIds: string[],
): string[] {
    const file = { originalName };
    return candidateIds.filter((id) => isDocumentRequestFulfilled(id, [file]));
}
