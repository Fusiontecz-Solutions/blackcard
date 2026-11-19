import {
  APP_COMPANY_CRM_NAME,
  APP_COMPANY_NAME,
} from "@/constants/appBranding";
import {
  CLIENT_PROVIDED_STIPS,
  COMPANY_HANDLED_STIPS,
  escapeHtml,
} from "./applicationApprovalEmailShared";

export const APPLICATION_APPROVED_EMAIL_SUBJECT =
  "Your Application Has Been Approved";

/** Server-resolved ISO recipient name. */
export const APPLICATION_APPROVED_CLIENT_NAME_PLACEHOLDER =
  "__APPROVAL_CLIENT_NAME__";
/** Server-resolved deal business name. */
export const APPLICATION_APPROVED_COMPANY_NAME_PLACEHOLDER =
  "__APPROVAL_COMPANY_NAME__";

export const APPLICATION_APPROVED_REQUEST_AMOUNT_PLACEHOLDER =
  "__APPROVAL_REQUEST_AMOUNT__";
export const APPLICATION_APPROVED_APPROVED_AMOUNT_PLACEHOLDER =
  "__APPROVAL_APPROVED_AMOUNT__";
export const APPLICATION_APPROVED_FACTOR_RATE_PLACEHOLDER =
  "__APPROVAL_FACTOR_RATE__";
export const APPLICATION_APPROVED_PAYBACK_AMOUNT_PLACEHOLDER =
  "__APPROVAL_PAYBACK_AMOUNT__";
export const APPLICATION_APPROVED_TERM_PLACEHOLDER = "__APPROVAL_TERM__";
export const APPLICATION_APPROVED_REPAY_PLACEHOLDER = "__APPROVAL_REPAY__";
export const APPLICATION_APPROVED_MONTHLY_REPAYMENT_PLACEHOLDER =
  "__APPROVAL_MONTHLY_REPAYMENT__";
export const APPLICATION_APPROVED_ACH_FREQUENCY_PLACEHOLDER =
  "__APPROVAL_ACH_FREQUENCY__";

export { CLIENT_PROVIDED_STIPS, COMPANY_HANDLED_STIPS, escapeHtml };

export type ApplicationApprovedEmailFields = {
  clientName: string;
  companyName: string;
  companyNameBrand: string;
  crmName: string;
  requestAmount: string;
  approvedAmount: string;
  factorRate: string;
  paybackAmount: string;
  term: string;
  repay: string;
  monthlyRepayment: string;
  achFrequency: string;
};

export function buildApplicationApprovedEmailServerPlaceholderValues(): Record<
  string,
  string
> {
  return {
    client_name: APPLICATION_APPROVED_CLIENT_NAME_PLACEHOLDER,
    company_name: APPLICATION_APPROVED_COMPANY_NAME_PLACEHOLDER,
    request_amount: APPLICATION_APPROVED_REQUEST_AMOUNT_PLACEHOLDER,
    approved_amount: APPLICATION_APPROVED_APPROVED_AMOUNT_PLACEHOLDER,
    factor_rate: APPLICATION_APPROVED_FACTOR_RATE_PLACEHOLDER,
    payback_amount: APPLICATION_APPROVED_PAYBACK_AMOUNT_PLACEHOLDER,
    term: APPLICATION_APPROVED_TERM_PLACEHOLDER,
    repay: APPLICATION_APPROVED_REPAY_PLACEHOLDER,
    monthly_repayment: APPLICATION_APPROVED_MONTHLY_REPAYMENT_PLACEHOLDER,
    ach_frequency: APPLICATION_APPROVED_ACH_FREQUENCY_PLACEHOLDER,
  };
}

export function resolveApplicationApprovedEmailFields(
  values: Record<string, string | undefined>,
): ApplicationApprovedEmailFields {
  const pick = (key: string, placeholder: string, fallback = "—") =>
    String(values[key] || "").trim() || placeholder || fallback;

  return {
    clientName:
      String(values.client_name || "").trim() ||
      APPLICATION_APPROVED_CLIENT_NAME_PLACEHOLDER,
    companyName:
      String(values.company_name || "").trim() ||
      APPLICATION_APPROVED_COMPANY_NAME_PLACEHOLDER,
    requestAmount: pick(
      "request_amount",
      APPLICATION_APPROVED_REQUEST_AMOUNT_PLACEHOLDER,
    ),
    approvedAmount: pick(
      "approved_amount",
      APPLICATION_APPROVED_APPROVED_AMOUNT_PLACEHOLDER,
    ),
    factorRate: pick("factor_rate", APPLICATION_APPROVED_FACTOR_RATE_PLACEHOLDER),
    paybackAmount: pick(
      "payback_amount",
      APPLICATION_APPROVED_PAYBACK_AMOUNT_PLACEHOLDER,
    ),
    term: pick("term", APPLICATION_APPROVED_TERM_PLACEHOLDER),
    repay: pick("repay", APPLICATION_APPROVED_REPAY_PLACEHOLDER),
    monthlyRepayment: pick(
      "monthly_repayment",
      APPLICATION_APPROVED_MONTHLY_REPAYMENT_PLACEHOLDER,
    ),
    achFrequency: pick(
      "ach_frequency",
      APPLICATION_APPROVED_ACH_FREQUENCY_PLACEHOLDER,
      "Daily",
    ),
    companyNameBrand: APP_COMPANY_NAME,
    crmName: APP_COMPANY_CRM_NAME,
  };
}
