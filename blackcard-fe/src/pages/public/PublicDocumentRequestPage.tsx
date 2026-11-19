import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Send,
  UploadCloud,
} from "lucide-react";
import PDFViewerDocsModal from "@/components/application/PDFViewerDocsModal";
import { axiosGet, axiosPost, axiosPostFormData } from "@/redux/axios";
import { Button } from "@/components/ui/button";
import { documentRequestDisplayLabel, type DocumentRequestRow } from "@/constants/documentRequestTypes";
import { formatDateTimeUS, cn } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import { resolveAppLogoSrc } from "@/constants/appLogo";
import { toast } from "react-toastify";
import {
  withMissingDocumentFilePrefix,
  type MissingDocumentItem,
} from "@/lib/missingDocuments";

type PortalResponse = {
  success: boolean;
  data?: {
    application: {
      id: string;
      applicationId: number;
      clientName: string;
    };
    documents: DocumentRequestRow[];
    missingDocuments?: MissingDocumentsHold;
    expiresAt: string | Date | null;
  };
  code?: string;
  message?: string;
  expiresAt?: string | Date | null;
};

type MissingDocumentsHold = {
  active: boolean;
  documents: string[];
  hasUploadedFiles: boolean;
  heldSince?: string | null;
  items?: MissingDocumentItem[];
};

/** Per-row upload state, keyed by row key. */
type RowUploadState = {
  uploading: boolean;
  /** 1-based index of the file being sent, and the batch size. */
  current: number;
  total: number;
  percent: number;
  error: string | null;
  /** File names uploaded on this page visit. */
  uploadedNames: string[];
};

/** One row on the page, normal request or Missing Documents hold. */
type PortalRow = {
  /** Unique row key (state, DOM ids). */
  key: string;
  /** Document type the uploads are tagged with. */
  slug: string;
  /** Free-text Missing Documents rows: prefix added to uploaded file names. */
  fileNamePrefix?: string;
  label: string;
  message?: string;
  /** Names of files already on record for this row. */
  existingNames: string[];
  preview?: { url: string; name: string; mimeType?: string };
  canUpload: boolean;
};

const SENT_BACK_DOCUMENTATION = "Sent Back for Documentation";

const emptyRowState: RowUploadState = {
  uploading: false,
  current: 0,
  total: 0,
  percent: 0,
  error: null,
  uploadedNames: [],
};

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data
    ?.message ||
  (error as { message?: string })?.message ||
  fallback;

const PublicDocumentRequestPage = () => {
  const { token } = useParams<{ token: string }>();
  const { resolvedTheme } = useTheme();
  const brandLogo = (
    <img
      src={resolveAppLogoSrc(resolvedTheme === "dark")}
      alt="Company logo"
      className="mx-auto h-24 w-auto max-w-full object-contain sm:h-28 md:h-32"
    />
  );

  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | Date | null>(null);
  const [application, setApplication] = useState<{
    id: string;
    applicationId: number;
    clientName: string;
  } | null>(null);
  const [documents, setDocuments] = useState<DocumentRequestRow[]>([]);
  const [previewModal, setPreviewModal] = useState<{
    url: string;
    name: string;
    mimeType?: string;
  } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [missingHold, setMissingHold] = useState<MissingDocumentsHold | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowUploadState>>({});
  const [confirmingSendBack, setConfirmingSendBack] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [sendBackError, setSendBackError] = useState<string | null>(null);
  const [sentBack, setSentBack] = useState(false);

  const loadPortal = useCallback(async () => {
    if (!token) {
      setErrorCode("TOKEN_MISSING");
      setLoading(false);
      return;
    }

    try {
      const res = await axiosGet(`/public/application/${token}/document-request`);
      const body = res.data as PortalResponse;

      if (!body?.success || !body?.data) {
        setErrorCode(body?.code || "INVALID_TOKEN");
        setLoading(false);
        return;
      }

      setApplication(body.data.application);
      setDocuments(body.data.documents || []);
      setMissingHold(body.data.missingDocuments?.active ? body.data.missingDocuments : null);
      setExpiresAt(body.data.expiresAt);
      setErrorCode(null);
      setLoading(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: PortalResponse } };
      const status = axiosErr?.response?.status;
      if (status === 410) {
        setErrorCode("TOKEN_EXPIRED");
        setExpiresAt(axiosErr?.response?.data?.expiresAt ?? null);
      } else {
        setErrorCode("TOKEN_INVALID");
      }
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  const patchRow = (slug: string, patch: Partial<RowUploadState>) =>
    setRowState((prev) => ({ ...prev, [slug]: { ...emptyRowState, ...prev[slug], ...patch } }));

  /** Upload each file through the public endpoint, tagged with the row's slug. */
  const handleRowUpload = async (row: PortalRow, files: File[]) => {
    if (!token || files.length === 0) return;
    const slug = row.key;
    patchRow(slug, { uploading: true, current: 1, total: files.length, percent: 0, error: null });

    let ok = 0;
    try {
      for (const [index, file] of files.entries()) {
        patchRow(slug, { current: index + 1, percent: 0 });
        const formData = new FormData();
        formData.append("file", withMissingDocumentFilePrefix(file, row.fileNamePrefix));
        formData.append("requestedDocumentSlug", row.slug);
        const res = await axiosPostFormData(
          `/public/application/${token}/document-request/upload`,
          formData,
          {
            onUploadProgress: (evt) => {
              if (evt.total) patchRow(slug, { percent: Math.round((evt.loaded / evt.total) * 100) });
            },
          },
        );
        const body = res.data as {
          success: boolean;
          data?: { documents?: DocumentRequestRow[] };
          message?: string;
        };
        if (!body?.success) throw new Error(body?.message || "Upload failed.");
        if (body.data?.documents) setDocuments(body.data.documents);
        ok += 1;
        setRowState((prev) => {
          const current = { ...emptyRowState, ...prev[slug] };
          return {
            ...prev,
            [slug]: { ...current, uploadedNames: [...current.uploadedNames, file.name] },
          };
        });
      }
      toast.success(
        ok === 1 ? `${row.label} uploaded.` : `${ok} files uploaded for ${row.label}.`,
      );
      patchRow(slug, { uploading: false });
    } catch (error: unknown) {
      const message = errorMessage(error, "Upload failed.");
      patchRow(slug, {
        uploading: false,
        error:
          files.length > 1
            ? `${message} (${ok} of ${files.length} files uploaded)`
            : message,
      });
    }
  };

  const handleSendBackToScrubber = async () => {
    if (!token) return;
    setSendingBack(true);
    setSendBackError(null);
    try {
      const res = await axiosPost(
        `/public/application/${token}/document-request/missing-documents/resolve`,
      );
      const body = res.data as { success: boolean; message?: string };
      if (!body?.success) throw new Error(body?.message || "Could not send back for review.");
      setSentBack(true);
      setConfirmingSendBack(false);
    } catch (error: unknown) {
      setSendBackError(errorMessage(error, "Could not send back for review."));
    } finally {
      setSendingBack(false);
    }
  };

  const shell = (content: ReactNode) => (
    <div className="min-h-screen bg-background px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-screen-md">
        <header className="mb-4 text-center">
          <div
            className={cn(
              "rounded-md py-1",
              resolvedTheme === "dark" ? "bg-transparent" : "px-4",
            )}
          >
            {brandLogo}
          </div>
        </header>
        {content}
      </div>
      <PDFViewerDocsModal
        isOpen={previewModal != null}
        onClose={() => setPreviewModal(null)}
        fileUrl={previewModal?.url}
        fileName={previewModal?.name}
        mimeTypeHint={previewModal?.mimeType}
        publicPortalToken={token}
      />
    </div>
  );

  const cardClass =
    "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

  if (loading) {
    return shell(
      <div className={cn(cardClass, "flex items-center gap-2 p-5 text-sm text-slate-500")} role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading document request…
      </div>,
    );
  }

  if (errorCode) {
    return shell(
      <div className={cn(cardClass, "p-5 text-sm text-slate-600 dark:text-slate-400")}>
        <div className="font-semibold text-[var(--brand)]">
          {errorCode === "TOKEN_EXPIRED" ? "Link expired" : "Link not available"}
        </div>
        {errorCode === "TOKEN_EXPIRED" && expiresAt ? (
          <div className="mt-1">This link expired on {formatDateTimeUS(expiresAt)}</div>
        ) : (
          <div className="mt-1">Please ask the sender for a new link.</div>
        )}
      </div>,
    );
  }

  if (sentBack) {
    return shell(
      <div className={cn(cardClass, "px-5 py-10 text-center")} role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Documents sent for review
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600 dark:text-slate-400">
          Thank you. The documents for{" "}
          {application ? <strong>{application.clientName}</strong> : "this application"} are back
          with our team for review. You can close this page.
        </p>
      </div>,
    );
  }

  // Missing Documents hold: one row per document the scrubber flagged.
  // Otherwise: one row per open document request.
  const holdItems = missingHold?.items ?? [];
  const rows: PortalRow[] = missingHold
    ? holdItems.map((item) => ({
        key: item.key ?? item.slug,
        slug: item.slug,
        fileNamePrefix: item.fileNamePrefix,
        label: item.label,
        existingNames: item.files.map((f) => f.name),
        canUpload: true,
      }))
    : documents.map((doc) => {
        const isReceived = doc.status === "Complete";
        const label = documentRequestDisplayLabel(doc);
        return {
          key: doc.name,
          slug: doc.name,
          label,
          message: doc.message,
          existingNames: isReceived ? [doc.originalFileName?.trim() || "Received"] : [],
          preview:
            isReceived && doc.fileUrl
              ? {
                  url: String(doc.fileUrl),
                  name: doc.originalFileName?.trim() || label,
                  mimeType: doc.mimeType,
                }
              : undefined,
          canUpload: doc.name !== SENT_BACK_DOCUMENTATION,
        };
      });

  const rowFileNames = (row: PortalRow) => [
    ...row.existingNames,
    ...(rowState[row.key]?.uploadedNames ?? []),
  ];
  const isRowDone = (row: PortalRow) => rowFileNames(row).length > 0;
  const doneCount = rows.filter(isRowDone).length;
  const anyUploading = Object.values(rowState).some((r) => r.uploading);
  // Every listed document needs at least one file from this hold. An old hold
  // with no recorded list falls back to "any file on the deal".
  const canSendBack = missingHold
    ? rows.length > 0
      ? doneCount === rows.length
      : missingHold.hasUploadedFiles ||
        Object.values(rowState).some((r) => r.uploadedNames.length > 0)
    : false;

  return shell(
    <>
      <section className={cardClass} aria-labelledby="document-request-title">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h1
                id="document-request-title"
                className="text-xl font-semibold text-slate-900 dark:text-slate-100"
              >
                {missingHold ? "Documents needed" : "Document Request"}
              </h1>
              {application ? (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {missingHold
                    ? "Our review team needs the documents below to continue with "
                    : "Please upload the requested documents for "}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {application.clientName}
                  </strong>{" "}
                  (Application #{application.applicationId}).
                </p>
              ) : null}
            </div>
            {rows.length > 0 ? (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                  doneCount === rows.length
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                )}
              >
                {doneCount} of {rows.length} uploaded
              </span>
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            {missingHold
              ? "No document list was recorded for this request. Upload is not available here; please contact us."
              : "No document requests found for this link."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map((row) => {
              const state = rowState[row.key] ?? emptyRowState;
              const names = rowFileNames(row);
              const done = names.length > 0;
              const inputId = `upload-${row.key}`;
              const statusId = `status-${row.key}`;
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
                        {names.length > 0 ? (
                          <ul className="mt-1 space-y-0.5">
                            {names.map((name, i) => (
                              <li
                                key={`${name}-${i}`}
                                className="break-all text-xs text-slate-500 dark:text-slate-400"
                              >
                                {name}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {row.message ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {row.message}
                          </p>
                        ) : null}
                        {state.uploading ? (
                          <div className="mt-2" role="status" aria-live="polite">
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              Uploading{state.total > 1 ? ` ${state.current} of ${state.total}` : ""}…{" "}
                              {state.percent}%
                            </p>
                            <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                              <div
                                className="h-full rounded-full bg-[var(--brand)] transition-all"
                                style={{ width: `${state.percent}%` }}
                              />
                            </div>
                          </div>
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

                    <div className="flex shrink-0 items-center gap-1 pl-11 sm:pl-0">
                      {row.preview ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          title={`View ${row.label}`}
                          aria-label={`View ${row.label}`}
                          onClick={() => setPreviewModal(row.preview ?? null)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {row.canUpload ? (
                        <>
                          <input
                            id={inputId}
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
                              done &&
                                "border-[var(--brand)]/30 text-[var(--brand)] hover:bg-[var(--brand)]/5",
                            )}
                            disabled={state.uploading || sendingBack}
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
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {missingHold ? (
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/40">
            {confirmingSendBack ? (
              <div role="dialog" aria-labelledby="send-back-confirm-title">
                <p
                  id="send-back-confirm-title"
                  className="text-sm font-medium text-slate-900 dark:text-slate-100"
                >
                  Send these documents back for review?
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  You will not be able to add more files from this page afterwards.
                </p>
                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sendingBack}
                    onClick={() => setConfirmingSendBack(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="gap-1.5"
                    disabled={sendingBack}
                    onClick={() => void handleSendBackToScrubber()}
                  >
                    {sendingBack ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4" aria-hidden />
                    )}
                    Yes, send for review
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {canSendBack
                    ? "All documents are uploaded. Send them back for review."
                    : "Upload every document above to send them back for review."}
                </p>
                <Button
                  type="button"
                  className="w-full gap-1.5 sm:w-auto"
                  disabled={!canSendBack || anyUploading || sendingBack}
                  onClick={() => {
                    setSendBackError(null);
                    setConfirmingSendBack(true);
                  }}
                >
                  <Send className="h-4 w-4" aria-hidden />
                  Send back to Scrubber
                </Button>
              </div>
            )}
            {sendBackError ? (
              <p
                className="mt-2 flex items-start gap-1 text-xs text-red-600 dark:text-red-400"
                role="alert"
              >
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                {sendBackError}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
        All common file types are accepted. You can upload several files per document.
      </p>
    </>,
  );
};

export default PublicDocumentRequestPage;
