import {
  APP_COMPANY_CRM_NAME,
  APP_COMPANY_NAME,
} from './applicationApprovalEmailShared';

export const APPLICATION_APPROVED_REQUEST_AMOUNT_PLACEHOLDER =
  '__APPROVAL_REQUEST_AMOUNT__';
export const APPLICATION_APPROVED_APPROVED_AMOUNT_PLACEHOLDER =
  '__APPROVAL_APPROVED_AMOUNT__';
export const APPLICATION_APPROVED_FACTOR_RATE_PLACEHOLDER = '__APPROVAL_FACTOR_RATE__';
export const APPLICATION_APPROVED_PAYBACK_AMOUNT_PLACEHOLDER =
  '__APPROVAL_PAYBACK_AMOUNT__';
export const APPLICATION_APPROVED_TERM_PLACEHOLDER = '__APPROVAL_TERM__';
export const APPLICATION_APPROVED_REPAY_PLACEHOLDER = '__APPROVAL_REPAY__';
export const APPLICATION_APPROVED_MONTHLY_REPAYMENT_PLACEHOLDER =
  '__APPROVAL_MONTHLY_REPAYMENT__';
export const APPLICATION_APPROVED_ACH_FREQUENCY_PLACEHOLDER =
  '__APPROVAL_ACH_FREQUENCY__';

export type ApplicationApprovedTemplateValues = Record<string, string | undefined>;

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

export function resolveApplicationApprovedEmailFields(
  values: Record<string, string | undefined>,
): ApplicationApprovedEmailFields {
  const pick = (key: string, placeholder: string, fallback = '—') =>
    String(values[key] || '').trim() || placeholder || fallback;

  return {
    clientName: String(values.client_name || '').trim() || '__APPROVAL_CLIENT_NAME__',
    companyName: String(values.company_name || '').trim() || '__APPROVAL_COMPANY_NAME__',
    requestAmount: pick('request_amount', APPLICATION_APPROVED_REQUEST_AMOUNT_PLACEHOLDER),
    approvedAmount: pick('approved_amount', APPLICATION_APPROVED_APPROVED_AMOUNT_PLACEHOLDER),
    factorRate: pick('factor_rate', APPLICATION_APPROVED_FACTOR_RATE_PLACEHOLDER),
    paybackAmount: pick('payback_amount', APPLICATION_APPROVED_PAYBACK_AMOUNT_PLACEHOLDER),
    term: pick('term', APPLICATION_APPROVED_TERM_PLACEHOLDER),
    repay: pick('repay', APPLICATION_APPROVED_REPAY_PLACEHOLDER),
    monthlyRepayment: pick(
      'monthly_repayment',
      APPLICATION_APPROVED_MONTHLY_REPAYMENT_PLACEHOLDER,
    ),
    achFrequency: pick(
      'ach_frequency',
      APPLICATION_APPROVED_ACH_FREQUENCY_PLACEHOLDER,
      'Daily',
    ),
    companyNameBrand: APP_COMPANY_NAME,
    crmName: APP_COMPANY_CRM_NAME,
  };
}
