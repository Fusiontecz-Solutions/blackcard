import {
    APP_COMPANY_NAME,
    APPLICATION_APPROVAL_EMAIL_LOGO_SRC,
} from './applicationApprovalEmailShared';

const EMAIL_WIDTH = 600;
const FONT = `'Helvetica Neue',Helvetica,Arial,sans-serif`;

export type MissingDocumentsEmailParams = {
    applicationNumber: string;
    businessName: string;
    /** Scrubber who flagged the deal. */
    flaggedByName: string;
    /** Document labels plus the scrubber's free-text entry. */
    documents: string[];
    /** Public upload page for this deal (falls back to the CRM deal page). */
    uploadDocumentsUrl?: string;
};

function escapeHtml(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function buildMissingDocumentsEmailSubject(businessName?: string | null): string {
    const business = String(businessName || '').trim();
    return business ? `Missing Documents — ${business}` : 'Missing Documents';
}

/**
 * Scrubber flagged a deal as Missing Documents → internal notice to Super Admin.
 * Same shell as the return-to-scrubber mail. Not ISO/merchant facing.
 */
/* Branding comes from this book's own constants — never hard-code a book name
 * or logo here, or it travels when this file is ported to another book. */
export function renderMissingDocumentsEmailHtml(params: MissingDocumentsEmailParams): string {
    const brandName = escapeHtml(String(APP_COMPANY_NAME || '').trim() || 'CRM');
    const logoSrc = escapeHtml(String(APPLICATION_APPROVAL_EMAIL_LOGO_SRC || '').trim());
    const applicationNumber = escapeHtml(String(params.applicationNumber || '').trim() || '—');
    const businessName = escapeHtml(String(params.businessName || '').trim() || 'the business');
    const flaggedBy = escapeHtml(String(params.flaggedByName || '').trim() || 'Scrubber');
    const openUrl = String(params.uploadDocumentsUrl || '').trim();
    const ctaLabel = 'Upload Documents';

    const docRows = params.documents
        .map((d) => String(d || '').trim())
        .filter(Boolean)
        .map(
            (d) =>
                `<tr><td style="padding:4px 0;font-family:${FONT};font-size:13px;color:#09090b;">&bull;&nbsp; ${escapeHtml(d)}</td></tr>`,
        )
        .join('');

    const logoBlock = logoSrc
        ? `<img src="${logoSrc}" alt="${brandName}" width="160" border="0" style="display:block;width:160px;max-width:160px;height:auto;margin:0 auto;" />`
        : `<div style="font-family:${FONT};font-size:18px;font-weight:700;color:#002147;">${brandName}</div>`;

    const ctaBlock = openUrl
        ? `<tr><td style="padding:8px 0 10px 0;"><a href="${escapeHtml(openUrl)}" target="_blank" style="background-color:#000000;border-radius:6px;color:#ffffff;display:inline-block;font-family:${FONT};font-size:12px;font-weight:bold;line-height:44px;padding:0 28px;text-decoration:none;text-transform:uppercase;letter-spacing:0.5px;">${ctaLabel}</a></td></tr>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Missing Documents — ${businessName}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f8fafc;font-family:${FONT};">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f8fafc;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${EMAIL_WIDTH}" style="width:${EMAIL_WIDTH}px;max-width:100%;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;">
          <tr><td height="12" bgcolor="#3d6fa0" style="height:12px;line-height:12px;font-size:12px;">&nbsp;</td></tr>
          <tr><td height="12" bgcolor="#002147" style="height:12px;line-height:12px;font-size:12px;">&nbsp;</td></tr>
          <tr><td align="center" style="padding:10px 45px 24px 45px;">${logoBlock}</td></tr>
          <tr>
            <td style="padding:0 45px 20px 45px;font-family:${FONT};">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr><td align="center" style="padding:0 0 18px 0;"><h1 style="margin:0;font-family:${FONT};font-size:24px;font-weight:700;color:#002147;text-transform:uppercase;">Missing <span style="color:#a1a1aa;font-weight:400;">Documents</span></h1></td></tr>
                <tr><td style="padding:0 0 18px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:#52525b;">
                  <strong style="color:#09090b;">${flaggedBy}</strong> flagged application
                  <strong style="color:#09090b;">#${applicationNumber}</strong> for
                  <strong style="color:#09090b;">${businessName}</strong> as missing documents.
                  The deal is out of the scrubbing queue until the documents are collected and it is sent back to Scrubber. Use the button below to upload them, or ask the ISO for them from the deal in the CRM.
                </td></tr>
                <tr><td style="padding:0 0 10px 0;font-family:${FONT};font-size:14px;font-weight:700;color:#002147;text-transform:uppercase;">Documents Needed</td></tr>
                <tr><td style="padding:0 0 18px 0;"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${docRows}</table></td></tr>
                ${ctaBlock}
                <tr><td style="padding:12px 0 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:#71717a;">This message is for internal use only. It is not a notice to the ISO or merchant.</td></tr>
              </table>
            </td>
          </tr>
          <tr><td style="padding:16px 45px 20px 45px;font-family:${FONT};font-size:13px;font-weight:700;color:#52525b;">Best Regards,<br/>${brandName} Team</td></tr>
          <tr><td height="12" bgcolor="#002147" style="height:12px;line-height:12px;font-size:12px;">&nbsp;</td></tr>
          <tr><td height="12" bgcolor="#3d6fa0" style="height:12px;line-height:12px;font-size:12px;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
