import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router";
import { toast } from "react-toastify";
import { AlertCircle, CheckCircle2, FileText, Loader2, Send, UploadCloud } from "lucide-react";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  getApplicationById,
  resolveApplicationMissingDocuments,
  uploadApplicationDocuments,
} from "@/redux/actions/applicationActions";
import { axiosGet } from "@/redux/axios";
import { normalizeRoleKey, resolveEffectiveRole } from "@/lib/sessionRole";
import {
  isMissingDocumentsQueue,
  mapMissingDocumentsToRequestOptions,
  parseMissingDocumentsFromNote,
  withMissingDocumentFilePrefix,
  type MissingDocumentItem,
} from "@/lib/missingDocuments";
import {
  DOCUMENT_REQUEST_OPTIONS,
  documentRequestDisplayLabel,
  type DocumentRequestRow,
} from "@/constants/documentRequestTypes";
import { getDocumentRequestsByApplication } from "@/redux/actions/notificationActions";
import RequestMissingDocumentsModal from "@/components/application/RequestMissingDocumentsModal";
import { invalidateDashboardData } from "@/lib/invalidateDashboardData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RowUploadState = {
  uploading: boolean;
  current: number;
  total: number;
  error: string | null;
};

const emptyRowState: RowUploadState = { uploading: false, current: 0, total: 0, error: null };

/**
 * Super Admin only: Missing Documents hold on a deal. One row per document the
 * scrubber flagged (same look as the public upload page), each with its own
 * Upload button — files go through the authenticated application upload and
 * are tagged with the row's document type, so they show under that type in
 * the Documents tab. "Ask for documents" emails the ISO the public upload
 * link; "Send back to Scrubber" returns the deal (Super Admin's call, even
 * with rows still open).
 */
export default function MissingDocumentsPanel() {
  const dispatch = useDispatch<AppDispatch>();
  const { applicationId: paramApplicationId } = useParams<{ applicationId: string }>();
  const loginUser = useSelector((state: RootState) => state.login.data?.user);
  const applicationData = useSelector((state: RootState) => state.applicationDetail.data);
  const documentRequests = useSelector((state: RootState) => state.documentRequests.data);
  const [isSending, setIsSending] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [items, setItems] = useState<MissingDocumentItem[] | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowUploadState>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const isSuperAdmin =
    normalizeRoleKey(resolveEffectiveRole({ role: loginUser?.role })) === "SUPER_ADMIN";
  const app = (applicationData ?? null) as {
    _id?: string;
    id?: string;
    applicationId?: string | number | null;
    currentQueue?: string | null;
    note?: string | null;
  } | null;
  const applicationUuid = app?._id ?? app?.id ?? null;
  const isActive = isSuperAdmin && !!app && isMissingDocumentsQueue(app.currentQueue);
  const note = app?.note ?? null;
  const requestLookupId = app?.applicationId ?? applicationUuid;

  /** Pending ISO document requests live in this one list during the hold (the separate panel is hidden). */
  const loadRequests = useCallback(async () => {
    if (requestLookupId == null) return;
    try {
      await dispatch(getDocumentRequestsByApplication(requestLookupId));
    } catch (err) {
      console.error("Failed to load document requests:", err);
    }
  }, [dispatch, requestLookupId]);

  /** Per-row status from the backend (files of that type uploaded since the hold started). */
  const loadStatus = useCallback(async () => {
    if (!applicationUuid) return;
    try {
      const res = await axiosGet(
        `/applications/${encodeURIComponent(String(applicationUuid))}/missing-documents`,
      );
      const body = res.data as { success: boolean; data?: { items?: MissingDocumentItem[] } };
      setItems(body?.data?.items ?? []);
      setStatusError(null);
    } catch (err) {
      console.error("Failed to load missing documents status:", err);
      setStatusError("Could not load upload status.");
    }
  }, [applicationUuid]);

  useEffect(() => {
    if (isActive) {
      void loadStatus();
      void loadRequests();
    }
    // Re-read when the marker changes (e.g. re-flagged with a new list).
  }, [isActive, loadStatus, loadRequests, note]);

  if (!isActive) return null;

  const documents = parseMissingDocumentsFromNote(app.note);
  const { slugs: preselectedDocuments, unmatched } = mapMissingDocumentsToRequestOptions(
    documents,
    DOCUMENT_REQUEST_OPTIONS,
  );
  const prefillNote = unmatched.length
    ? `Also needed: ${unmatched.join("; ")}`
    : "";

  const baseRows = items ?? [];
  const coveredSlugs = new Set(baseRows.filter((r) => r.matched).map((r) => r.slug));
  const requestRows: MissingDocumentItem[] = ((documentRequests || []) as DocumentRequestRow[])
    .filter((doc) => doc.status !== "Complete" && doc.name && !coveredSlugs.has(String(doc.name)))
    .map((doc) => ({
      key: `request-${doc.name}`,
      label: documentRequestDisplayLabel(doc),
      slug: String(doc.name),
      matched: true,
      fileNamePrefix: "",
      satisfied: false,
      files: [],
    }));
  const rows = [...baseRows, ...requestRows];
  const doneCount = rows.filter((r) => r.satisfied).length;
  const stillMissing = rows.length - doneCount;
  const anyUploading = Object.values(rowState).some((r) => r.uploading);

  const patchRow = (key: string, patch: Partial<RowUploadState>) =>
    setRowState((prev) => ({ ...prev, [key]: { ...emptyRowState, ...prev[key], ...patch } }));

  const handleRowUpload = async (row: MissingDocumentItem, files: File[]) => {
    if (!applicationUuid || files.length === 0) return;
    patchRow(row.key, { uploading: true, current: 1, total: files.length, error: null });
    let ok = 0;
    try {
      // One file per request so a failure reports how far it got.
      for (const [index, file] of files.entries()) {
        patchRow(row.key, { current: index + 1 });
        await dispatch(
          uploadApplicationDocuments({
            id: String(applicationUuid),
            files: [withMissingDocumentFilePrefix(file, row.fileNamePrefix)],
            requestedDocumentSlug: row.slug,
          }),
        ).unwrap();
        ok += 1;
      }
      toast.success(
        ok === 1 ? `${row.label} uploaded.` : `${ok} files uploaded for ${row.label}.`,
      );
      patchRow(row.key, { uploading: false });
    } catch (err) {
      const message = typeof err === "string" ? err : "Upload failed.";
      patchRow(row.key, {
        uploading: false,
        error: files.length > 1 ? `${message} (${ok} of ${files.length} files uploaded)` : message,
      });
    } finally {
      if (ok > 0) {
        await Promise.all([loadStatus(), loadRequests()]);
        void dispatch(getApplicationById(paramApplicationId ?? String(applicationUuid)));
      }
    }
  };

  const handleSendBack = async () => {
    if (!applicationUuid) return;
    setIsSending(true);
    const toastId = toast.loading("Sending the deal back to Scrubber...");
    try {
      await dispatch(
        resolveApplicationMissingDocuments({ applicationId: String(applicationUuid) }),
      ).unwrap();
      toast.update(toastId, {
        render: "Deal sent back to the Scrubbing queue. Any scrubber can claim it.",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
      setIsConfirmOpen(false);
      invalidateDashboardData(dispatch);
      void dispatch(getApplicationById(paramApplicationId ?? String(applicationUuid)));
    } catch (err) {
      console.error("Failed to resolve missing documents:", err);
      toast.update(toastId, {
        render:
          typeof err === "string"
            ? err
            : "Failed to send the deal back to Scrubber. Please try again.",
        type: "error",
        isLoading: false,
        autoClose: 4000,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-amber-300 bg-white shadow-sm dark:border-amber-500/40 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide">Missing Documents</p>
          <p className="mt-1 text-xs opacity-90">
            The scrubber flagged these documents as missing. Upload them here, or
            ask the ISO for them (they get an upload link), then send the deal
            back to the open Scrubbing queue.
          </p>
        </div>
        {rows.length > 0 ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
              stillMissing === 0
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
            )}
          >
            {doneCount} of {rows.length} uploaded
          </span>
        ) : null}
      </div>

      {items == null && !statusError ? (
        <div className="flex items-center gap-2 px-5 py-4 text-sm text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading documents…
        </div>
      ) : statusError ? (
        <p className="flex items-center gap-1 px-5 py-4 text-sm text-red-600 dark:text-red-400" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {statusError}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-sm italic text-slate-500">No document list was recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {rows.map((row) => {
            const state = rowState[row.key] ?? emptyRowState;
            const done = row.satisfied;
            const statusId = `md-status-${row.key}`;
            return (
              <li key={row.key} className="px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        done
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                      )}
                      aria-hidden
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-slate-900 dark:text-slate-100">
                        {row.label}
                      </p>
                      <p
                        id={statusId}
                        className={cn(
                          "mt-0.5 text-xs font-medium",
                          done
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-amber-700 dark:text-amber-300",
                        )}
                      >
                        {done ? "Uploaded ✓" : "Needed"}
                      </p>
                      {row.files.length > 0 ? (
                        <ul className="mt-1 space-y-0.5">
                          {row.files.map((f) => (
                            <li
                              key={f.id}
                              className="break-all text-xs text-slate-500 dark:text-slate-400"
                            >
                              {f.name}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {state.uploading ? (
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400" role="status">
                          Uploading{state.total > 1 ? ` ${state.current} of ${state.total}` : ""}…
                        </p>
                      ) : null}
                      {state.error ? (
                        <p
                          className="mt-2 flex items-start gap-1 text-xs text-red-600 dark:text-red-400"
                          role="alert"
                        >
                          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                          {state.error}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center pl-11 sm:pl-0">
                    <input
                      ref={(el) => {
                        fileInputRefs.current[row.key] = el;
                      }}
                      type="file"
                      multiple
                      className="sr-only"
                      tabIndex={-1}
                      aria-label={`Choose files for ${row.label}`}
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        void handleRowUpload(row, files);
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant={done ? "outline" : "default"}
                      className={cn(
                        "h-9 gap-1.5 px-3 text-xs",
                        done
                          ? "border-[#9A6BC4] text-[#9A6BC4] hover:bg-[#9A6BC4]/10"
                          : "bg-[#9A6BC4] text-white hover:bg-[#9A6BC4]/90",
                      )}
                      disabled={state.uploading || isSending || !applicationUuid}
                      aria-label={`${done ? "Upload more files for" : "Upload"} ${row.label}`}
                      aria-describedby={statusId}
                      onClick={() => fileInputRefs.current[row.key]?.click()}
                    >
                      {state.uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <UploadCloud className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {done ? "Add more" : "Upload"}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/40">
        <Button
          type="button"
          variant="outline"
          className="border-[#9A6BC4] text-[#9A6BC4] hover:bg-[#9A6BC4]/10"
          disabled={isSending || !applicationUuid}
          onClick={() => setIsRequestOpen(true)}
        >
          Ask for documents
        </Button>
        <Button
          type="button"
          className="gap-1.5 bg-[#9A6BC4] text-white hover:bg-[#9A6BC4]/90"
          disabled={isSending || anyUploading || !applicationUuid}
          onClick={() => setIsConfirmOpen(true)}
        >
          <Send className="h-4 w-4" aria-hidden />
          {isSending ? "Sending…" : "Send back to Scrubber"}
        </Button>
      </div>

      <Dialog open={isConfirmOpen} onOpenChange={(open: boolean) => !isSending && setIsConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back to Scrubber?</DialogTitle>
            <DialogDescription>
              {stillMissing > 0
                ? `${stillMissing} of ${rows.length} document${rows.length === 1 ? " is" : "s are"} still missing. The deal will go back to the open Scrubbing queue anyway.`
                : "All documents are uploaded. The deal will go back to the open Scrubbing queue."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSending}
              onClick={() => setIsConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#9A6BC4] text-white hover:bg-[#9A6BC4]/90"
              disabled={isSending}
              onClick={() => void handleSendBack()}
            >
              {isSending ? "Sending…" : "Send back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RequestMissingDocumentsModal
        open={isRequestOpen}
        onOpenChange={setIsRequestOpen}
        preselectedDocuments={preselectedDocuments}
        prefillNote={prefillNote}
      />
    </div>
  );
}
