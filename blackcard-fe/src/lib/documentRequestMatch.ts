import { DOCUMENT_REQUEST_OPTIONS } from "@/components/application/RequestMissingDocumentsModal";

export const DOCUMENT_REQUEST_LABELS: Record<string, string> = Object.fromEntries(
    DOCUMENT_REQUEST_OPTIONS.map((opt) => [opt.id, opt.label]),
);

export const SENT_BACK_DOCUMENTATION_REQUEST_ID = "sent-back-for-documentation";

export const SENT_BACK_DOCUMENTATION_LABEL = "Sent Back for Documentation";

function normalizeSlug(value: string): string {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

export function isSentBackDocumentationRequest(name: string): boolean {
    const normalized = String(name || "").trim().toLowerCase();
    const slug = normalizeSlug(normalized);
    return (
        normalized === SENT_BACK_DOCUMENTATION_REQUEST_ID ||
        slug === "sentbackfordocumentation" ||
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

type ApplicationFileLike = {
    originalName?: string | null;
    fileName?: string | null;
    url?: string | null;
    fileUrl?: string | null;
    downloadUrl?: string | null;
};

/** True when an application file satisfies a requested document id (e.g. tax-returns). */
export function isDocumentRequestFulfilled(
    docId: string,
    files: ApplicationFileLike[] | null | undefined,
): boolean {
    return findApplicationFileForDocumentRequest(docId, files) != null;
}

/** First application file that satisfies a document request id. */
export function findApplicationFileForDocumentRequest(
    docId: string,
    files: ApplicationFileLike[] | null | undefined,
): (ApplicationFileLike & { url: string; displayName: string }) | null {
    const id = String(docId || "").trim().toLowerCase();
    if (!id || !Array.isArray(files) || files.length === 0) return null;

    const label = DOCUMENT_REQUEST_LABELS[id] || "";
    const idSlug = normalizeSlug(id);
    const labelSlug = normalizeSlug(label);

    for (const file of files) {
        const name = String(file?.originalName || file?.fileName || "").toLowerCase();
        if (!name) continue;

        let matched = false;
        if (name.includes(`[${id}]`) || name.startsWith(`${id}__`) || name.startsWith(`${id}_`)) {
            matched = true;
        } else {
            const nameSlug = normalizeSlug(name.split(".")[0] || name);
            if (idSlug && (nameSlug.includes(idSlug) || name.includes(id.replace(/-/g, " ")))) {
                matched = true;
            } else if (labelSlug && nameSlug.includes(labelSlug)) {
                matched = true;
            }
        }

        if (!matched) continue;

        const url = String(file?.url || file?.fileUrl || file?.downloadUrl || "").trim();
        if (!url) continue;

        return {
            ...file,
            url,
            displayName: String(file?.originalName || file?.fileName || label || docId),
        };
    }

    return null;
}
