import { axiosGet } from "@/redux/axios";

export const PREVIEW_EXT_TO_MIME: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    txt: "text/plain; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function extensionFromFileNameOrUrl(name: string, url = ""): string {
    const n = String(name ?? "").toLowerCase().trim();
    const fromName = n.match(/\.([a-z0-9]+)$/)?.[1] ?? "";
    if (fromName) return fromName;
    try {
        const path = new URL(url).pathname.toLowerCase();
        return path.match(/\.([a-z0-9]+)$/)?.[1] ?? "";
    } catch {
        return "";
    }
}

const SHORT_FORMAT_TO_MIME: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    txt: "text/plain; charset=utf-8",
    csv: "text/csv; charset=utf-8",
};

function normalizeMimeHint(mimeTypeHint: string): string {
    const hint = String(mimeTypeHint ?? "")
        .split(";")[0]
        ?.trim()
        .toLowerCase();
    if (!hint) return "";
    if (SHORT_FORMAT_TO_MIME[hint]) return SHORT_FORMAT_TO_MIME[hint];
    return hint;
}

export function resolveClientPreviewMime(
    name: string,
    url: string,
    blobType = "",
    headerCt?: string,
    mimeTypeHint = "",
): string {
    const hint = normalizeMimeHint(mimeTypeHint);
    if (hint && hint !== "application/octet-stream") {
        return hint;
    }

    const ext = extensionFromFileNameOrUrl(name, url);
    if (ext && PREVIEW_EXT_TO_MIME[ext]) {
        return PREVIEW_EXT_TO_MIME[ext];
    }
    const header = headerCt?.split(";")[0]?.trim().toLowerCase();
    if (header && header !== "application/octet-stream") {
        return header;
    }
    if (blobType && blobType !== "application/octet-stream") {
        return blobType;
    }
    return blobType || "application/octet-stream";
}

export function isCloudinaryAssetUrl(url: string): boolean {
    return /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw|video)\//.test(
        String(url ?? "").trim(),
    );
}

export function isBlobOrDataUrl(url: string): boolean {
    const u = String(url ?? "").trim().toLowerCase();
    return u.startsWith("blob:") || u.startsWith("data:");
}

export function isPdfMimeOrName(mimeType: string, fileName: string): boolean {
    const mime = mimeType.toLowerCase();
    const name = fileName.toLowerCase();
    return mime.includes("pdf") || name.endsWith(".pdf");
}

export function isImageMimeOrName(mimeType: string, fileName: string): boolean {
    const mime = mimeType.toLowerCase();
    const name = fileName.toLowerCase();
    return (
        mime.startsWith("image/") ||
        /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
    );
}

export function isTextMimeOrName(mimeType: string, fileName: string): boolean {
    const mime = mimeType.toLowerCase();
    const name = fileName.toLowerCase();
    return mime.startsWith("text/") || /\.(txt|csv|log)$/i.test(name);
}

export type ResolvedDocumentPreview = {
    blobUrl: string;
    mimeType: string;
    revokeOnCleanup: boolean;
};

export async function resolveDocumentPreview(
    fileUrl: string,
    fileName: string,
    options?: {
        preferDirectUrl?: boolean;
        publicPortalToken?: string;
        mimeTypeHint?: string;
    },
): Promise<ResolvedDocumentPreview> {
    const url = String(fileUrl ?? "").trim();
    const name = String(fileName ?? "document").trim() || "document";
    const preferDirectUrl = options?.preferDirectUrl === true;
    const publicPortalToken = String(options?.publicPortalToken ?? "").trim();
    const mimeTypeHint = String(options?.mimeTypeHint ?? "").trim();

    if (!url) {
        throw new Error("No file URL provided.");
    }

    if (isBlobOrDataUrl(url) || (preferDirectUrl && !isCloudinaryAssetUrl(url) && !publicPortalToken)) {
        return {
            blobUrl: url,
            mimeType: resolveClientPreviewMime(name, url, "", undefined, mimeTypeHint),
            revokeOnCleanup: false,
        };
    }

    if (publicPortalToken && isCloudinaryAssetUrl(url)) {
        const response = await axiosGet(
            `/public/application/${encodeURIComponent(publicPortalToken)}/document-request/preview`,
            {
                params: { url, name, ...(mimeTypeHint ? { mimeType: mimeTypeHint } : {}) },
                responseType: "blob",
            },
        );
        const rawBlob = response.data as Blob;
        const headerCt =
            typeof response.headers["content-type"] === "string"
                ? response.headers["content-type"]
                : undefined;
        const mimeType = resolveClientPreviewMime(
            name,
            url,
            rawBlob.type,
            headerCt,
            mimeTypeHint,
        );
        const blob = new Blob([rawBlob], { type: mimeType });
        return {
            blobUrl: URL.createObjectURL(blob),
            mimeType,
            revokeOnCleanup: true,
        };
    }

    if (preferDirectUrl && isCloudinaryAssetUrl(url)) {
        return {
            blobUrl: url,
            mimeType: resolveClientPreviewMime(name, url, "", undefined, mimeTypeHint),
            revokeOnCleanup: false,
        };
    }

    if (isCloudinaryAssetUrl(url)) {
        const response = await axiosGet("/uploads/inline-preview", {
            params: { url, name, ...(mimeTypeHint ? { mimeType: mimeTypeHint } : {}) },
            responseType: "blob",
        });
        const rawBlob = response.data as Blob;
        const headerCt =
            typeof response.headers["content-type"] === "string"
                ? response.headers["content-type"]
                : undefined;
        const mimeType = resolveClientPreviewMime(
            name,
            url,
            rawBlob.type,
            headerCt,
            mimeTypeHint,
        );
        const blob = new Blob([rawBlob], { type: mimeType });
        return {
            blobUrl: URL.createObjectURL(blob),
            mimeType,
            revokeOnCleanup: true,
        };
    }

    return {
        blobUrl: url,
        mimeType: resolveClientPreviewMime(name, url, "", undefined, mimeTypeHint),
        revokeOnCleanup: false,
    };
}
