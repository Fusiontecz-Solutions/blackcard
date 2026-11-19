import { BRAND_DISPLAY_NAME } from '../../constants/brand';

/** Display name for outbound emails (override via APP_COMPANY_NAME). */
export const APP_COMPANY_NAME =
  String(process.env.APP_COMPANY_NAME || '').trim() || BRAND_DISPLAY_NAME;

/** CRM product name referenced in client-facing emails. */
export const APP_COMPANY_CRM_NAME =
  String(process.env.APP_COMPANY_CRM_NAME || '').trim() || `${APP_COMPANY_NAME} CRM`;

/** Server-resolved client / business name placeholders. */
export const APPLICATION_APPROVAL_CLIENT_NAME_PLACEHOLDER = '__APPROVAL_CLIENT_NAME__';
export const APPLICATION_APPROVAL_COMPANY_NAME_PLACEHOLDER = '__APPROVAL_COMPANY_NAME__';

/** Backend replaces this with the signed public approval portal URL before send. */
export const APPLICATION_APPROVAL_URL_PLACEHOLDER = '__APPLICATION_APPROVAL_URL__';

export const CLIENT_PROVIDED_STIPS = [
  "Voided check",
  "Drivers license",
] as const;

export const COMPANY_HANDLED_STIPS = [
  'Bank Login (DecisionLogic or Manual)',
  'Cc Processing Statement or AR Report/Invoices',
  'Merchant interview / Funding Call',
] as const;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type ApplicationApprovalTemplateValues = Record<string, string | undefined>;

export type ApplicationApprovalEmailFields = {
  clientName: string;
  companyName: string;
  viewApplicationUrl: string;
  calculateApprovalUrl: string;
  viewCommentUrl: string;
  companyNameBrand: string;
  crmName: string;
};

export function resolveApplicationApprovalEmailFields(
  values: ApplicationApprovalTemplateValues,
): ApplicationApprovalEmailFields {
  const clientName = String(values.client_name || '').trim() || 'Valued Client';
  const companyName = String(values.company_name || '').trim() || 'your company';
  const viewApplicationUrl =
    String(values.view_application_url || '').trim() ||
    APPLICATION_APPROVAL_URL_PLACEHOLDER;
  const calculateApprovalUrl =
    String(values.calculate_approval_url || '').trim() ||
    APPLICATION_APPROVAL_URL_PLACEHOLDER;

  return {
    clientName,
    companyName,
    viewApplicationUrl,
    calculateApprovalUrl,
    viewCommentUrl: calculateApprovalUrl,
    companyNameBrand: APP_COMPANY_NAME,
    crmName: APP_COMPANY_CRM_NAME,
  };
}
