export type DocumentRequestSlug =
    | "bank-statements"
    | "bank-statements-mtd"
    | "additional-id"
    | "business-license"
    | "proof-of-address"
    | "financial-statement"
    | "voided-check"
    | "driver-license"
    | "tax-returns"
    | "articles-of-incorporation";

export type DocumentRequestRow = {
    name: string;
    label?: string;
    status: "Complete" | "Pending";
    createdAt?: string;
    fileUrl?: string;
    fileId?: string;
    originalFileName?: string;
    mimeType?: string;
    contractUploadKey?: "voidedCheck" | "driverLicense";
    message?: string;
};

export const DOCUMENT_REQUEST_LABELS: Record<string, string> = {
    "bank-statements": "Bank Statements - 12 months",
    "bank-statements-mtd": "Bank Statements - MTD",
    "additional-id": "Additional ID Proof",
    "business-license": "Business License",
    "proof-of-address": "Proof of Address",
    "financial-statement": "Financial Statement",
    "voided-check": "Voided Check",
    "driver-license": "Driver's License",
    "tax-returns": "Tax Returns - Last 2 Years",
    "articles-of-incorporation": "Articles of Incorporations",
    "additional-documents": "Additional documents (as discussed)",
};

/**
 * The canonical "public document list" surfaced in the Document Request flow
 * (RequestMissingDocumentsModal / public upload portal). Reused by the ISO
 * approval review dialog so both flows stay in sync.
 */
export const DOCUMENT_REQUEST_OPTIONS: { id: DocumentRequestSlug; label: string }[] = [
    { id: "bank-statements", label: DOCUMENT_REQUEST_LABELS["bank-statements"] },
    { id: "bank-statements-mtd", label: DOCUMENT_REQUEST_LABELS["bank-statements-mtd"] },
    { id: "additional-id", label: DOCUMENT_REQUEST_LABELS["additional-id"] },
    { id: "business-license", label: DOCUMENT_REQUEST_LABELS["business-license"] },
    { id: "proof-of-address", label: DOCUMENT_REQUEST_LABELS["proof-of-address"] },
    { id: "financial-statement", label: DOCUMENT_REQUEST_LABELS["financial-statement"] },
    { id: "voided-check", label: DOCUMENT_REQUEST_LABELS["voided-check"] },
    { id: "tax-returns", label: DOCUMENT_REQUEST_LABELS["tax-returns"] },
    { id: "articles-of-incorporation", label: DOCUMENT_REQUEST_LABELS["articles-of-incorporation"] },
];

/**
 * Slugs for the two key identity / banking documents the ISO captures at
 * approval. Files tagged with these are pinned + highlighted in the CRM
 * uploaded-documents table.
 */
export const PINNED_DOCUMENT_SLUGS = ["voided-check", "driver-license"] as const;

/**
 * Normalize legacy / variant slugs (e.g. the older ISO portal `driving_license`
 * and `voided_check` document types) to their canonical catalog slug.
 */
export function normalizeDocumentSlug(raw?: string | null): string {
    const slug = String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-");
    const aliases: Record<string, string> = {
        "driving-license": "driver-license",
        "drivers-license": "driver-license",
        "driver-licence": "driver-license",
        "driving-licence": "driver-license",
        "void-check": "voided-check",
        "voided-cheque": "voided-check",
    };
    return aliases[slug] ?? slug;
}

export function isPinnedDocumentSlug(raw?: string | null): boolean {
    return (PINNED_DOCUMENT_SLUGS as readonly string[]).includes(normalizeDocumentSlug(raw));
}

export function documentRequestDisplayLabel(doc: DocumentRequestRow): string {
    if (doc.label?.trim()) return doc.label.trim();
    return DOCUMENT_REQUEST_LABELS[doc.name] || doc.name.replace(/[-_]/g, " ");
}

export function isContractUploadDocumentRequest(doc: DocumentRequestRow): boolean {
    return Boolean(doc.contractUploadKey);
}
