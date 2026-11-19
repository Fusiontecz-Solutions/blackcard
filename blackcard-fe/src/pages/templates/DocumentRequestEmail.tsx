import { APP_COMPANY_NAME } from "@/constants/appBranding";
import type { TemplateVariable } from "./types";
import { createHtmlTemplatePreview } from "@/pages/templates/HtmlTemplatePreview";
import { renderDocumentRequestEmailHtml } from "./documentRequestEmailHtml";
import { DOCUMENT_REQUEST_UPLOAD_URL_PLACEHOLDER } from "./documentRequestEmailShared";

export const DOCUMENT_REQUEST_EMAIL_VARIABLES: TemplateVariable[] = [
  {
    key: "iso_name",
    label: "ISO / recipient name",
    placeholder: "Acme Funding Partners",
    defaultValue: "Acme Funding Partners",
  },
  {
    key: "requested_documents",
    label: "Requested documents (one per line)",
    placeholder: "Voided check\nDriver's license\nBank statements",
    defaultValue: "Voided check\nDriver's license\nBank statements",
  },
  {
    key: "note", 
    label: "Note to ISO",
    placeholder: "Please upload the listed documents at your earliest convenience.",
    defaultValue: "Please upload the listed documents at your earliest convenience.",
  },
  {
    key: "upload_documents_url",
    label: "Upload portal URL",
    placeholder: DOCUMENT_REQUEST_UPLOAD_URL_PLACEHOLDER,
    defaultValue: "https://example.com/public/application/documents/sample-token",
  },
  {
    key: "team_name",
    label: "Team name (signature)",
    placeholder: APP_COMPANY_NAME,
    defaultValue: APP_COMPANY_NAME,
  },
];

const DocumentRequestEmail = createHtmlTemplatePreview(
  renderDocumentRequestEmailHtml,
  "Document request email preview",
);

export default DocumentRequestEmail;
