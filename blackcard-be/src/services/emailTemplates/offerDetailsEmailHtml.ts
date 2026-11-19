import { escapeHtml } from './applicationApprovalEmailShared';

export function renderOfferDetailRow(label: string, value: string): string {
  const safeLabel = escapeHtml(label);
  const safeValue = escapeHtml(value);
  return `
    <tr>
      <td width="48%" valign="top" style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:#6b7280;border-bottom:1px solid #e5e7eb;background-color:#f9fafb;">
        ${safeLabel}
      </td>
      <td valign="top" style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;line-height:1.4;color:#1f2937;border-bottom:1px solid #e5e7eb;">
        ${safeValue}
      </td>
    </tr>`;
}

export function renderOfferDetailsTable(rows: string): string {
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;">
  <tr>
    <td colspan="2" style="padding:12px 12px 10px 12px;font-family:Georgia,'Times New Roman',Times,serif;font-size:15px;font-weight:bold;line-height:1.3;color:#374151;letter-spacing:0.4px;text-transform:uppercase;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">
      Approved Offer Details
    </td>
  </tr>
  ${rows}
</table>`;
}

export type OfferDetailsEmailFields = {
  requestAmount: string;
  approvedAmount: string;
  factorRate: string;
  paybackAmount: string;
  term: string;
  repay: string;
  monthlyRepayment: string;
  achFrequency: string;
};

export function buildOfferDetailsRows(fields: OfferDetailsEmailFields): string {
  return [
    renderOfferDetailRow('Request Amount', fields.requestAmount),
    renderOfferDetailRow('Approved Amount', fields.approvedAmount),
    renderOfferDetailRow('Factor Rate', fields.factorRate),
    renderOfferDetailRow('Payback Amount', fields.paybackAmount),
    renderOfferDetailRow('Term', fields.term),
    renderOfferDetailRow('Repay (per period)', fields.repay),
    renderOfferDetailRow('Monthly Repayment', fields.monthlyRepayment),
    renderOfferDetailRow('ACH / Frequency', fields.achFrequency),
  ].join('');
}
