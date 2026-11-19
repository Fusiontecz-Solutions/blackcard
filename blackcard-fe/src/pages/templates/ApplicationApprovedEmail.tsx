import type { TemplateVariable } from "./types";
import { createHtmlTemplatePreview } from "./HtmlTemplatePreview";
import { renderApplicationApprovedEmailHtml } from "./applicationApprovedEmailHtml";
import {
  APPLICATION_APPROVED_ACH_FREQUENCY_PLACEHOLDER,
  APPLICATION_APPROVED_APPROVED_AMOUNT_PLACEHOLDER,
  APPLICATION_APPROVED_CLIENT_NAME_PLACEHOLDER,
  APPLICATION_APPROVED_COMPANY_NAME_PLACEHOLDER,
  APPLICATION_APPROVED_FACTOR_RATE_PLACEHOLDER,
  APPLICATION_APPROVED_MONTHLY_REPAYMENT_PLACEHOLDER,
  APPLICATION_APPROVED_PAYBACK_AMOUNT_PLACEHOLDER,
  APPLICATION_APPROVED_REPAY_PLACEHOLDER,
  APPLICATION_APPROVED_REQUEST_AMOUNT_PLACEHOLDER,
  APPLICATION_APPROVED_TERM_PLACEHOLDER,
} from "./applicationApprovedEmailShared";

export const APPLICATION_APPROVED_EMAIL_VARIABLES: TemplateVariable[] = [
  {
    key: "client_name",
    label: "Client / ISO name",
    placeholder: APPLICATION_APPROVED_CLIENT_NAME_PLACEHOLDER,
    defaultValue: "John Doe",
  },
  {
    key: "company_name",
    label: "Company name",
    placeholder: APPLICATION_APPROVED_COMPANY_NAME_PLACEHOLDER,
    defaultValue: "Kinsen LLC",
  },
  {
    key: "request_amount",
    label: "Request amount",
    placeholder: APPLICATION_APPROVED_REQUEST_AMOUNT_PLACEHOLDER,
    defaultValue: "$250,000.00",
  },
  {
    key: "approved_amount",
    label: "Approved amount",
    placeholder: APPLICATION_APPROVED_APPROVED_AMOUNT_PLACEHOLDER,
    defaultValue: "$200,000.00",
  },
  {
    key: "factor_rate",
    label: "Factor rate",
    placeholder: APPLICATION_APPROVED_FACTOR_RATE_PLACEHOLDER,
    defaultValue: "1.32",
  },
  {
    key: "payback_amount",
    label: "Payback amount",
    placeholder: APPLICATION_APPROVED_PAYBACK_AMOUNT_PLACEHOLDER,
    defaultValue: "$264,000.00",
  },
  {
    key: "term",
    label: "Term",
    placeholder: APPLICATION_APPROVED_TERM_PLACEHOLDER,
    defaultValue: "120",
  },
  {
    key: "repay",
    label: "Repay (per period)",
    placeholder: APPLICATION_APPROVED_REPAY_PLACEHOLDER,
    defaultValue: "$2,200.00",
  },
  {
    key: "monthly_repayment",
    label: "Monthly repayment",
    placeholder: APPLICATION_APPROVED_MONTHLY_REPAYMENT_PLACEHOLDER,
    defaultValue: "$66,000.00",
  },
  {
    key: "ach_frequency",
    label: "ACH / frequency",
    placeholder: APPLICATION_APPROVED_ACH_FREQUENCY_PLACEHOLDER,
    defaultValue: "Daily",
  },
];

const ApplicationApprovedEmail = createHtmlTemplatePreview(
  renderApplicationApprovedEmailHtml,
  "Application approved email preview",
);

export default ApplicationApprovedEmail;
