import { useEffect, useId, useState, type ReactNode } from "react";
import { CheckCircle2, ExternalLink, Eye, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import BackgroundCheckNotesField from "./BackgroundCheckNotesField";
import { cn } from "@/lib/utils";
import type {
  BackgroundCheckAttachment,
  BackgroundCheckNoteImage,
  BackgroundCheckRisk,
  BackgroundCheckStatus,
} from "./backgroundCheckTypes";
import {
  BACKGROUND_CHECK_RISK_OPTIONS,
  BACKGROUND_CHECK_STATUS_OPTIONS,
} from "./backgroundCheckTypes";
import {
  deleteBackgroundCheckAttachment,
  openBackgroundCheckAttachment,
  uploadBackgroundCheckAttachment,
} from "./backgroundCheckAttachment";
import { resolveAttachmentPreview } from "./backgroundCheckAttachmentPreview";

type BackgroundCheckItemCardProps = {
  title: string;
  description: string;
  href?: string;
  notes: string;
  noteImages?: BackgroundCheckNoteImage[];
  status?: BackgroundCheckStatus;
  risk?: BackgroundCheckRisk;
  optional?: boolean;
  attachmentName?: string;
  attachmentUrl?: string;
  attachmentPublicId?: string;
  savedAt?: string;
  onNotesChange: (value: string) => void;
  onNoteImageAdd?: (image: BackgroundCheckNoteImage) => void;
  onNoteImageRemove?: (imageId: string) => void;
  onSaveCheck?: () => void;
  onLinkOpen?: () => void;
  onStatusChange: (status: BackgroundCheckStatus) => void;
  onRiskChange?: (risk: BackgroundCheckRisk | undefined) => void;
  onOptionalToggle?: () => void;
  onAttachmentSelect?: (attachment: BackgroundCheckAttachment) => void;
  onAttachmentRemove?: () => void;
  belowNotes?: ReactNode;
  children?: ReactNode;
  anchorId?: string;
};

export default function BackgroundCheckItemCard({
  title,
  description,
  href,
  notes,
  noteImages = [],
  status,
  risk,
  optional = false,
  attachmentName,
  attachmentUrl,
  attachmentPublicId,
  savedAt,
  onNotesChange,
  onNoteImageAdd,
  onNoteImageRemove,
  onSaveCheck,
  onLinkOpen,
  onStatusChange,
  onRiskChange,
  onOptionalToggle,
  onAttachmentSelect,
  onAttachmentRemove,
  belowNotes,
  children,
  anchorId,
}: BackgroundCheckItemCardProps) {
  const fileInputId = useId();
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState(false);
  const [deletingAttachment, setDeletingAttachment] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [uploadingNoteImage, setUploadingNoteImage] = useState(false);
  const [removingNoteImageId, setRemovingNoteImageId] = useState<string | null>(null);

  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [loadingAttachmentPreview, setLoadingAttachmentPreview] = useState(false);

  const handleNotesPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onNoteImageAdd) return;

    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    event.preventDefault();
    setUploadingNoteImage(true);
    try {
      const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
      const namedFile = new File([file], `screenshot-${Date.now()}.${ext}`, { type: file.type });
      const uploaded = await uploadBackgroundCheckAttachment(namedFile);
      onNoteImageAdd({
        id: `note-img-${Date.now()}`,
        name: uploaded.name,
        url: uploaded.url,
        publicId: uploaded.publicId,
      });
      toast.success("Screenshot added to notes.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not paste screenshot.";
      toast.error(message);
    } finally {
      setUploadingNoteImage(false);
    }
  };

  const handleRemoveNoteImage = async (image: BackgroundCheckNoteImage) => {
    if (!onNoteImageRemove) return;
    setRemovingNoteImageId(image.id);
    try {
      if (image.publicId) {
        await deleteBackgroundCheckAttachment(image.publicId);
      }
      onNoteImageRemove(image.id);
    } catch {
      toast.error("Could not remove screenshot.");
    } finally {
      setRemovingNoteImageId(null);
    }
  };
  const hasAttachment = Boolean(attachmentName && attachmentUrl);
  const attachmentBusy = uploadingAttachment || viewingAttachment || deletingAttachment;
  const isSaved = Boolean(savedAt);

  const handleSaveCheck = () => {
    onSaveCheck?.();
    setJustSaved(true);
    toast.success("Check saved.");
    window.setTimeout(() => setJustSaved(false), 1500);
  };

  const handleLinkClick = () => {
    onLinkOpen?.();
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file || !onAttachmentSelect) return;

    setUploadingAttachment(true);
    try {
      if (attachmentPublicId) {
        await deleteBackgroundCheckAttachment(attachmentPublicId);
      }
      const uploaded = await uploadBackgroundCheckAttachment(file);
      onAttachmentSelect(uploaded);
      toast.success("Attachment uploaded.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not upload attachment.";
      toast.error(message);
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleViewAttachment = async () => {
    if (!attachmentUrl || !attachmentName) {
      toast.info("Re-attach this file to view it.");
      return;
    }

    setViewingAttachment(true);
    try {
      await openBackgroundCheckAttachment({
        url: attachmentUrl,
        name: attachmentName,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not open attachment.";
      toast.error(message);
    } finally {
      setViewingAttachment(false);
    }
  };

  const handleDeleteAttachment = async () => {
    if (!onAttachmentRemove) return;

    setDeletingAttachment(true);
    try {
      if (attachmentPublicId) {
        await deleteBackgroundCheckAttachment(attachmentPublicId);
      }
      onAttachmentRemove();
      setAttachmentPreviewUrl(null);
      toast.success("Attachment removed.");
    } catch {
      toast.error("Could not remove attachment.");
    } finally {
      setDeletingAttachment(false);
    }
  };

  useEffect(() => {
    if (!attachmentUrl || !attachmentName) {
      setAttachmentPreviewUrl(null);
      setLoadingAttachmentPreview(false);
      return;
    }

    let cancelled = false;
    setLoadingAttachmentPreview(true);

    void resolveAttachmentPreview({ url: attachmentUrl, name: attachmentName })
      .then((preview) => {
        if (!cancelled) {
          setAttachmentPreviewUrl(preview?.dataUrl ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAttachmentPreview(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentName, attachmentUrl]);

  const attachmentPreviewButton = hasAttachment ? (
    <button
      type="button"
      disabled={attachmentBusy}
      onClick={() => void handleViewAttachment()}
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-md border border-[#E2E8F0] bg-white shadow-sm transition-colors hover:border-[var(--brand)]",
        attachmentBusy && "cursor-not-allowed opacity-60",
      )}
      title={attachmentName ? `View ${attachmentName}` : "View attachment"}
      aria-label={attachmentName ? `View ${attachmentName}` : "View attachment"}
    >
      {loadingAttachmentPreview ? (
        <span className="flex h-[72px] w-[56px] items-center justify-center bg-[#F8FAFC]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--brand)]" aria-hidden />
        </span>
      ) : attachmentPreviewUrl ? (
        <img
          src={attachmentPreviewUrl}
          alt={attachmentName ?? "Uploaded attachment preview"}
          className="h-[72px] w-[56px] object-cover object-top"
        />
      ) : (
        <span className="flex h-[72px] w-[56px] flex-col items-center justify-center bg-[#F8FAFC] px-1 text-center text-[9px] font-semibold uppercase tracking-wide text-[#64748B]">
          File
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#0F172A]/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
        View
      </span>
    </button>
  ) : null;

  const riskSelectClass =
    BACKGROUND_CHECK_RISK_OPTIONS.find((option) => option.value === risk)?.selectClass ??
    "border-[#D1D5DB] bg-white text-[#6B7280]";

  return (
    <div
      id={anchorId}
      className="rounded-lg border border-[#E8EAED] bg-white px-4 py-3.5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3 pt-0.5">
          <div className="min-w-0 flex-1">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleLinkClick}
                className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)] hover:underline"
              >
                {title}
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              </a>
            ) : (
              <p className="text-sm font-semibold text-[var(--brand)]">{title}</p>
            )}
            <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">{description}</p>
          </div>
          {attachmentPreviewButton}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-[#E5E7EB] bg-[#F8F9FB] p-0.5">
            {BACKGROUND_CHECK_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onStatusChange(option.value)}
                className={cn(
                  "inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-[11px] font-semibold leading-none",
                  status === option.value
                    ? option.activeClass
                    : "bg-transparent text-[#6B7280] hover:bg-white hover:text-[#374151]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {onRiskChange ? (
            <select
              value={risk ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                onRiskChange(
                  value === "high" || value === "medium" || value === "low"
                    ? value
                    : undefined,
                );
              }}
              className={cn(
                "h-8 rounded-md border px-2.5 text-[11px] outline-none focus:ring-2 focus:ring-[var(--brand)]/20",
                riskSelectClass,
              )}
              aria-label="Risk level"
            >
              <option value="">Risk</option>
              {BACKGROUND_CHECK_RISK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}

          <input
            id={fileInputId}
            type="file"
            className="hidden"
            disabled={attachmentBusy}
            onChange={(e) => {
              void handleFileChange(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={attachmentBusy}
            onClick={() => document.getElementById(fileInputId)?.click()}
            className={cn(
              "rounded p-1.5 transition-colors",
              hasAttachment
                ? "text-[var(--brand)] hover:bg-[#EEF2FF]"
                : "text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6B7280]",
              attachmentBusy && "cursor-not-allowed opacity-60",
            )}
            title={hasAttachment ? "Replace attachment" : "Attach supporting file"}
            aria-label={hasAttachment ? "Replace attachment" : "Attach supporting file"}
          >
            {uploadingAttachment ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={handleSaveCheck}
            className={cn(
              "rounded p-1.5 transition-colors bg-[#22C55E] text-white shadow-sm hover:bg-[#16A34A]",
              !isSaved && !justSaved && "opacity-80 hover:opacity-100",
            )}
            title="Save status, notes, and attachment"
            aria-label="Save check"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <BackgroundCheckNotesField
        notes={notes}
        onNotesChange={onNotesChange}
        onPaste={(e) => void handleNotesPaste(e)}
      />

      {uploadingNoteImage ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-[#64748B]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brand)]" aria-hidden />
          Uploading screenshot…
        </div>
      ) : null}

      {noteImages.length > 0 ? (
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Screenshots in notes
          </p>
          <div className="flex flex-wrap gap-2">
            {noteImages.map((image) => (
              <div
                key={image.id}
                className="group relative overflow-hidden rounded-md border border-[#E2E8F0] bg-white shadow-sm"
              >
                <a
                  href={image.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  title={image.name}
                >
                  <img
                    src={image.url}
                    alt={image.name}
                    className="h-24 w-[88px] object-cover object-top"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => void handleRemoveNoteImage(image)}
                  disabled={removingNoteImageId === image.id}
                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0F172A]/75 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-60"
                  title="Remove screenshot"
                  aria-label="Remove screenshot"
                >
                  {removingNoteImageId === image.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-3 w-3" aria-hidden />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {belowNotes}

      {isSaved ? (
        <p className="mt-1 text-[10px] text-[#6B7280]">
          Saved{" "}
          {new Date(savedAt!).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      ) : null}

      {uploadingAttachment ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Uploaded file
          </p>
          <div className="flex items-center justify-between rounded border border-blue-200 bg-blue-50 px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2 pr-2">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">Uploading…</p>
                <p className="truncate text-[11px] text-slate-500">Saving to Cloudinary</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {hasAttachment ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Uploaded file
          </p>
          <div className="flex items-start justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
            <div className="min-w-0 pr-2">
              <p className="truncate text-xs font-medium text-slate-800">{attachmentName}</p>
              <p className="truncate text-[11px] text-slate-500">Attached to this check</p>
            </div>
            {attachmentPreviewUrl ? (
              <button
                type="button"
                onClick={() => void handleViewAttachment()}
                disabled={attachmentBusy}
                className={cn(
                  "shrink-0 overflow-hidden rounded border border-slate-200 bg-white transition-colors hover:border-[var(--brand)]",
                  attachmentBusy && "cursor-not-allowed opacity-50",
                )}
                title="View file"
                aria-label="View file preview"
              >
                <img
                  src={attachmentPreviewUrl}
                  alt={attachmentName ?? "Attachment preview"}
                  className="h-20 w-[72px] object-cover object-top"
                />
              </button>
            ) : null}
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => void handleViewAttachment()}
                disabled={attachmentBusy}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-white hover:text-[var(--brand)]",
                  attachmentBusy && "cursor-not-allowed opacity-50",
                )}
                title="View file"
                aria-label="View file"
              >
                {viewingAttachment ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteAttachment()}
                disabled={attachmentBusy}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-white hover:text-red-600",
                  attachmentBusy && "cursor-not-allowed opacity-50",
                )}
                title="Delete file"
                aria-label="Delete file"
              >
                {deletingAttachment ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-2">
        <button
          type="button"
          onClick={onOptionalToggle}
          className="text-xs font-medium text-[var(--brand)] hover:underline"
        >
          {optional ? "Optional — make required" : "Required — make optional"}
        </button>
      </div>

      {children ? <div className="mt-3 border-t border-[#EEF0F2] pt-3">{children}</div> : null}
    </div>
  );
}
