import type { TemplateVariable } from "./types";
import { createHtmlTemplatePreview } from "./HtmlTemplatePreview";
import { renderApplicationApprovalEmailHtml } from "./applicationApprovalEmailHtml";
import { APPLICATION_APPROVAL_URL_PLACEHOLDER } from "./applicationApprovalEmailShared";

export const APPLICATION_APPROVAL_EMAIL_VARIABLES: TemplateVariable[] = [
  {
    key: "client_name",
    label: "Client / ISO name",
    placeholder: "John Doe",
    defaultValue: "John Doe",
  },
  {
    key: "company_name",
    label: "Company name",
    placeholder: "Kinsen LLC",
    defaultValue: "Kinsen LLC",
  },
  {
    key: "calculate_approval_url",
    label: "ISO approval portal URL",
    placeholder: APPLICATION_APPROVAL_URL_PLACEHOLDER,
    defaultValue: "https://example.com/public/application/approval/sample-token",
  },
];

const ApplicationApprovalEmail = createHtmlTemplatePreview(
  renderApplicationApprovalEmailHtml,
  "Application approval email preview",
);

export default ApplicationApprovalEmail;
