import { APP_LOGO_DARK_SRC } from "@/constants/appLogo";
import { BACKGROUND_CHECK_RESOURCES } from "@/config/externalLinks";
import { axiosPost } from "@/redux/axios";
import type { DataMerchLookupData } from "@/redux/actions/datamerch-actions";
import type { OpenCorporatesLookupData } from "@/components/application/opencorporatesTypes";
import {
  resolveCheckAttachmentPreviews,
  type AttachmentPreview,
} from "./backgroundCheckAttachmentPreview";
import type { BackgroundCheckFormState } from "./backgroundCheckTypes";
import type { ClearPdfMatchSection } from "./clearComparison";

const MAX_ATTACHMENT_PREVIEW_CHARS = 1_500_000;

function compactAttachmentPreviews(
  previews: Record<string, AttachmentPreview | null>,
): Record<string, AttachmentPreview | null> {
  const compact: Record<string, AttachmentPreview | null> = {};
  for (const [id, preview] of Object.entries(previews)) {
    if (!preview?.dataUrl || preview.dataUrl.length <= MAX_ATTACHMENT_PREVIEW_CHARS) {
      compact[id] = preview;
      continue;
    }
    compact[id] = null;
  }
  return compact;
}

async function parsePdfErrorMessage(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") {
    return "Could not generate the background check PDF.";
  }
  const axiosError = error as {
    response?: { data?: Blob; status?: number };
    message?: string;
  };
  const data = axiosError.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      // Response was not JSON.
    }
  }
  if (axiosError.message?.trim()) {
    return axiosError.message;
  }
  return "Could not generate the background check PDF.";
}

function assertPdfBlob(blob: Blob): void {
  if (blob.type && blob.type !== "application/pdf") {
    throw new Error("Server did not return a PDF file.");
  }
  if (blob.size < 128) {
    throw new Error("Generated PDF was empty.");
  }
}

function formatEinDisplay(ein: string): string {
  const digits = ein.replace(/\D/g, "");
  if (digits.length !== 9) return ein || "—";
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function formatBackgroundCheckEin(ein: string): string {
  return formatEinDisplay(ein);
}

export type BackgroundCheckPdfInput = {
  logoUrl?: string;
  merchantName: string;
  ownerName: string;
  ownerSsn?: string;
  offerAmount: string;
  savedByName: string;
  ein: string;
  dealId: string;
  checks: BackgroundCheckFormState;
  savedAt?: string | null;
  datamerch?: Omit<DataMerchLookupData, "raw"> | null;
  datamerchSearchedAt?: string | null;
  opencorporates?: OpenCorporatesLookupData | null;
  opencorporatesSearchedAt?: string | null;
  /** CLEAR Application match blocks (same rows as ClearPanel). */
  clearMatchSections?: ClearPdfMatchSection[] | null;
};

export function backgroundCheckPdfFilename(merchantName: string): string {
  const safeName = (merchantName || "merchant")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `Compliance-Report-${safeName || "merchant"}.pdf`;
}

export async function fetchBackgroundCheckPdfBlob(
  input: BackgroundCheckPdfInput,
): Promise<Blob> {
  const checkIds = BACKGROUND_CHECK_RESOURCES.map((resource) => resource.id);
  const attachmentPreviews = compactAttachmentPreviews(
    await resolveCheckAttachmentPreviews(input.checks, checkIds),
  );

  const response = await axiosPost(
    "/background-check-report/pdf",
    {
      merchantName: input.merchantName,
      ownerName: input.ownerName,
      ownerSsn: input.ownerSsn,
      offerAmount: input.offerAmount,
      ein: input.ein,
      dealId: input.dealId,
      checks: input.checks,
      datamerch: input.datamerch ?? null,
      datamerchSearchedAt: input.datamerchSearchedAt ?? null,
      opencorporates: input.opencorporates ?? null,
      opencorporatesSearchedAt: input.opencorporatesSearchedAt ?? null,
      clearMatchSections: input.clearMatchSections ?? null,
      attachmentPreviews,
    },
    { responseType: "blob" },
  );

  const blob = new Blob([response.data], { type: "application/pdf" });
  assertPdfBlob(blob);
  return blob;
}

export async function getBackgroundCheckPdfErrorMessage(error: unknown): Promise<string> {
  return parsePdfErrorMessage(error);
}

export async function downloadBackgroundCheckPdf(input: BackgroundCheckPdfInput): Promise<void> {
  const blob = await fetchBackgroundCheckPdfBlob(input);
  const filename = backgroundCheckPdfFilename(input.merchantName);

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function defaultBackgroundCheckLogoUrl(): string {
  return APP_LOGO_DARK_SRC;
}
