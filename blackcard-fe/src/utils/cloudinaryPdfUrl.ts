import { axiosGet } from "@/redux/axios";
import { isBlobOrDataUrl, isCloudinaryAssetUrl } from "@/lib/documentPreview";

/** Cloudinary PDFs (image/ or raw/) are often blocked by CORS in the browser PDF viewer. */
export function isCloudinaryRawPdfUrl(url: string): boolean {
    const u = String(url || "").trim();
    if (!u) return false;
    return isCloudinaryAssetUrl(u);
}

export async function fetchCloudinaryPdfBlobUrl(
    url: string,
    name = "document.pdf",
): Promise<string> {
    const response = await axiosGet("/uploads/inline-preview", {
        params: { url, name, mimeType: "application/pdf" },
        responseType: "blob",
    });
    const blob =
        response.data instanceof Blob
            ? response.data
            : new Blob([response.data], { type: "application/pdf" });
    const typed =
        blob.type && blob.type !== "application/octet-stream"
            ? blob
            : new Blob([blob], { type: "application/pdf" });
    return URL.createObjectURL(typed);
}

/** Resolve a stored Cloudinary URL for in-browser PDF viewing (react-pdf / iframe). */
export async function resolvePdfViewUrl(
    url: string,
    name = "document.pdf",
): Promise<string> {
    const trimmed = String(url || "").trim();
    if (!trimmed) return "";
    if (/^platform:/i.test(trimmed)) return "";
    if (isBlobOrDataUrl(trimmed)) return trimmed;
    if (!isCloudinaryAssetUrl(trimmed)) return trimmed;
    return fetchCloudinaryPdfBlobUrl(trimmed, name);
}
