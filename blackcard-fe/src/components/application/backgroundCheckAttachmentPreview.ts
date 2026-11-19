import { axiosGet } from "@/redux/axios";
import { getDocument, GlobalWorkerOptions, version } from "pdfjs-dist";
import type { BackgroundCheckFormState } from "./backgroundCheckTypes";

GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

export type AttachmentPreview = {
  dataUrl: string;
  kind: "image" | "pdf";
};

function isPdfAttachment(name: string, mimeType: string): boolean {
  return /\.pdf$/i.test(name) || mimeType === "application/pdf";
}

function isImageAttachment(name: string, mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
  );
}

async function fetchAttachmentBlob(url: string, name: string): Promise<Blob> {
  const response = await axiosGet("/uploads/inline-preview", {
    params: { url, name },
    responseType: "blob",
  });
  return response.data as Blob;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read attachment preview."));
    reader.readAsDataURL(blob);
  });
}

async function renderPdfFirstPageDataUrl(blob: Blob): Promise<string> {
  const data = await blob.arrayBuffer();
  const pdf = await getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.4 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas not supported.");
  }
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/png");
}

export async function resolveAttachmentPreview(meta: {
  name: string;
  url: string;
}): Promise<AttachmentPreview | null> {
  try {
    const blob = await fetchAttachmentBlob(meta.url, meta.name);
    if (isPdfAttachment(meta.name, blob.type)) {
      return { dataUrl: await renderPdfFirstPageDataUrl(blob), kind: "pdf" };
    }
    if (isImageAttachment(meta.name, blob.type)) {
      return { dataUrl: await blobToDataUrl(blob), kind: "image" };
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveCheckAttachmentPreviews(
  checks: BackgroundCheckFormState,
  checkIds: string[],
): Promise<Record<string, AttachmentPreview | null>> {
  const entries = await Promise.all(
    checkIds.map(async (id) => {
      const item = checks[id];
      if (!item?.attachmentUrl || !item?.attachmentName) {
        return [id, null] as const;
      }
      const preview = await resolveAttachmentPreview({
        name: item.attachmentName,
        url: item.attachmentUrl,
      });
      return [id, preview] as const;
    }),
  );
  return Object.fromEntries(entries);
}
