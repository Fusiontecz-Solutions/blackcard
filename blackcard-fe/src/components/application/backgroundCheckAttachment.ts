import { axiosDelete, axiosGet, axiosPostFormData } from "@/redux/axios";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type BackgroundCheckAttachmentMeta = {
  name: string;
  url: string;
  publicId: string;
};

export async function uploadBackgroundCheckAttachment(
  file: File,
): Promise<BackgroundCheckAttachmentMeta> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("File must be 10 MB or smaller.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", "ih-crm/background-checks");
  const response = await axiosPostFormData("/uploads/single", formData);
  const data = response.data?.data as
    | { url?: string; publicId?: string; originalName?: string }
    | undefined;

  if (!data?.url) {
    throw new Error("Upload failed.");
  }

  return {
    name: String(data.originalName ?? file.name),
    url: String(data.url),
    publicId: String(data.publicId ?? ""),
  };
}

export async function deleteBackgroundCheckAttachment(publicId: string): Promise<void> {
  const id = String(publicId ?? "").trim();
  if (!id) return;

  try {
    await axiosDelete("/uploads", { data: { publicId: id, resourceType: "raw" } });
  } catch {
    // Still clear local reference if Cloudinary delete fails.
  }
}

export async function openBackgroundCheckAttachment(meta: {
  name: string;
  url: string;
}): Promise<void> {
  const response = await axiosGet("/uploads/inline-preview", {
    params: { url: meta.url, name: meta.name },
    responseType: "blob",
  });
  const blob = response.data as Blob;
  const blobUrl = URL.createObjectURL(blob);
  const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    URL.revokeObjectURL(blobUrl);
    throw new Error("Pop-up blocked. Allow pop-ups to view the file.");
  }
}

/**
 * Cloudinary raw public IDs often omit `.pdf`, so cross-origin downloads use a
 * bare name. Fetch through our preview proxy and force a `.pdf` download name.
 */
export function ensurePdfDownloadFilename(name: string | null | undefined): string {
  const trimmed = String(name ?? "").trim() || "CLEAR-Report.pdf";
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}

export async function downloadBackgroundCheckAttachment(meta: {
  name: string;
  url: string;
}): Promise<void> {
  const href = String(meta.url ?? "").trim();
  if (!href) {
    throw new Error("This PDF has no download URL.");
  }
  const filename = ensurePdfDownloadFilename(meta.name);
  const response = await axiosGet("/uploads/inline-preview", {
    params: { url: href, name: filename },
    responseType: "blob",
  });
  const blob = new Blob([response.data], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}
