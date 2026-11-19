import { APP_COMPANY_NAME } from "@/constants/appBranding";

/** Backend replaces this token with the public upload portal URL before SendGrid send. */
export const DOCUMENT_REQUEST_UPLOAD_URL_PLACEHOLDER =
  "__DOCUMENT_REQUEST_UPLOAD_URL__";

export function documentRequestEmailSubject(
  applicationNumber: string | number,
  _clientName?: string | null,
  _applicationOwnerName?: string | null,
): string {
  const num = String(applicationNumber || "").trim() || "N/A";
  return `Document request — Application #${num}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type DocumentRequestEmailFields = {
  isoName: string;
  requestedDocumentLabels: string[];
  note: string;
  uploadUrl: string;
  teamName: string;
};

export function resolveDocumentRequestEmailFields(
  values: Record<string, string | undefined>,
): DocumentRequestEmailFields {
  const isoName =
    String(values.iso_name || "").trim() || "ISO Partner";
  const rawDocs = String(values.requested_documents || "").trim();
  const requestedDocumentLabels = rawDocs
    ? rawDocs
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const note = String(values.note || "").trim();
  const uploadUrl =
    String(values.upload_documents_url || "").trim() ||
    DOCUMENT_REQUEST_UPLOAD_URL_PLACEHOLDER;
  const teamName = String(values.team_name || "").trim() || APP_COMPANY_NAME;

  return {
    isoName,
    requestedDocumentLabels,
    note,
    uploadUrl,
    teamName,
  };
}
