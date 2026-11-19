import {
    DOCUMENT_REQUEST_LABELS,
    DOCUMENT_REQUEST_OPTIONS,
    normalizeDocumentSlug,
} from "@/constants/documentRequestTypes";
import type { ApplicationFiles } from "@/types/applicationTypes";

const MATCH_KEYWORDS: Record<string, string[]> = {
    "bank-statements": ["bank statement", "bankstatement", "bank-statement", "bank statements"],
    "bank-statements-mtd": [
        "bank statement mtd",
        "bank statements mtd",
        "mtd bank statement",
        "bank-statement-mtd",
        "bank statements - mtd",
    ],
    "additional-id": ["additional id", "id proof", "identification", "passport"],
    "business-license": ["business license", "business-license", "license"],
    "proof-of-address": ["proof of address", "utility bill", "utilitybill", "proof-of-address"],
    "financial-statement": ["financial statement", "financial-statement", "p&l", "profit and loss"],
    "voided-check": ["voided check", "voidedcheck", "voided-check"],
    "tax-returns": ["tax return", "tax-return", "tax returns", "1040", "1120"],
    "articles-of-incorporation": [
        "articles of incorporation",
        "articles-of-incorporation",
        "certificate of incorporation",
        "articles of organization",
    ],
};

function fileId(file: ApplicationFiles): string {
    return String(file._id || (file as { id?: string }).id || "").trim();
}

function normalizeMatchText(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ");
}

function explicitSlugForFile(
    file: ApplicationFiles,
    assignments?: Record<string, string>,
): string {
    const id = fileId(file);
    if (assignments && id in assignments) {
        return normalizeDocumentSlug(assignments[id] || "");
    }
    return normalizeDocumentSlug(
        (file as { requestedDocumentSlug?: string }).requestedDocumentSlug ||
            file.type ||
            (file as { documentType?: string }).documentType,
    );
}

function matchesKeywords(fileName: string | undefined, slug: string): boolean {
    const name = normalizeMatchText(fileName);
    if (!name) return false;
    const keywords = MATCH_KEYWORDS[slug] || [];
    return keywords.some((kw) => name.includes(kw));
}

/** Slug fulfilled by this file (explicit tag or filename match). */
export function resolveFulfilledSlugForFile(
    file: ApplicationFiles,
    assignments?: Record<string, string>,
): string | null {
    const explicit = explicitSlugForFile(file, assignments);
    if (explicit && DOCUMENT_REQUEST_LABELS[explicit]) return explicit;

    for (const opt of DOCUMENT_REQUEST_OPTIONS) {
        if (matchesKeywords(file.originalName, opt.id)) return opt.id;
    }
    return null;
}

/** Document types already covered by uploaded files on the application. */
export function getFulfilledDocumentSlugs(
    files: ApplicationFiles[],
    assignments?: Record<string, string>,
): Set<string> {
    const fulfilled = new Set<string>();
    for (const file of files) {
        const slug = resolveFulfilledSlugForFile(file, assignments);
        if (slug) fulfilled.add(slug);
    }
    return fulfilled;
}

/** Best-effort slug suggestion when assigning an uploaded file. */
export function suggestDocumentSlugForFile(file: ApplicationFiles): string {
    const existing = normalizeDocumentSlug(
        (file as { requestedDocumentSlug?: string }).requestedDocumentSlug ||
            file.type ||
            (file as { documentType?: string }).documentType,
    );
    if (existing && DOCUMENT_REQUEST_LABELS[existing]) return existing;

    for (const opt of DOCUMENT_REQUEST_OPTIONS) {
        if (matchesKeywords(file.originalName, opt.id)) return opt.id;
    }
    return "";
}

export function formatUploadedFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return "—";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / Math.pow(k, i))} ${sizes[i]}`;
}

const CONTRACT_KEY_TO_SLUG: Record<string, string> = {
    driverLicense: "driver-license",
    voidedCheck: "voided-check",
};

/** Application file that fulfills a contract required-doc slot (Driver's License / Voided Check). */
export function getApplicationFileForRequiredDocumentKey(
    files: ApplicationFiles[],
    contractKey: "driverLicense" | "voidedCheck",
): ApplicationFiles | null {
    const targetSlug = CONTRACT_KEY_TO_SLUG[contractKey];
    if (!targetSlug) return null;

    for (const file of files) {
        const slug = normalizeDocumentSlug(
            file.requestedDocumentSlug || file.documentType || file.type,
        );
        if (slug === targetSlug) return file;
    }

    for (const file of files) {
        if (resolveFulfilledSlugForFile(file) === targetSlug) return file;
    }

    return null;
}
