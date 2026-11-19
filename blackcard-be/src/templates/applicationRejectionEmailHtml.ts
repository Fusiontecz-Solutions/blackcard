import { BRAND_DISPLAY_NAME } from '../constants/brand';
import {
    DECLINE_REASONS_DELIMITER,
    escapeHtml,
    resolveApplicationRejectionEmailFields,
} from './applicationRejectionEmailShared';

const BRAND_NAME = BRAND_DISPLAY_NAME;

const EMAIL_WIDTH = 600;
const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";

/** One reason per chip: the CRM's encoded list, else the resolved primary + other reasons. */
function declineReasonList(
  values: Record<string, string | undefined>,
  fields: { primaryReason: string; otherReasons: string },
): string[] {
  const encoded = String(values.decline_reasons || "").trim();
  if (encoded) {
    const list = encoded
      .split(DECLINE_REASONS_DELIMITER)
      .map((reason) => reason.trim())
      .filter(Boolean);
    if (list.length) return list;
  }
  return [
    fields.primaryReason,
    ...String(fields.otherReasons || "")
      .split(",")
      .map((reason) => reason.trim()),
  ].filter(Boolean);
}

/**
 * Gmail / Outlook-safe HTML for the broker decline email (Blackcard design):
 * declined pill, reasons card with one chip per selected reason, info note,
 * thank-you and sign-off.
 */
export function renderApplicationRejectionEmailHtml(
  values: Record<string, string | undefined>,
): string {
  const fields = resolveApplicationRejectionEmailFields(values);
  // Header/footer add "FUNDING" themselves, so drop it from the name if present.
  const brandRaw = String(BRAND_NAME || "Black Card")
    .trim()
    .replace(/\s+funding$/i, "") || "Black Card";
  const brand = escapeHtml(brandRaw);
  const reasonChips = declineReasonList(values, fields)
    .map(
      (reason) =>
        `<span style="display:inline-block;background-color:#FFFFFF;border:1px solid #F5C6CC;border-radius:999px;padding:5px 12px;margin:3px;font-size:14px;font-weight:700;color:#B42335;">${escapeHtml(reason)}</span>`,
    )
    .join("\n              ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Application Declined</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF1F5;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#EEF1F5;">
Thank you for your submission. After careful review, we're unable to approve this application at this time.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF1F5;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="${EMAIL_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${EMAIL_WIDTH}px;font-family:${FONT};">
    <tr>
      <td align="center" style="background-color:#0B1F3A;padding:14px 24px;border-radius:12px 12px 0 0;">
        <div style="font-size:18px;font-weight:800;letter-spacing:2.5px;color:#FFFFFF;line-height:1;">${escapeHtml(brandRaw.toUpperCase())}</div>
        <div style="font-size:9px;font-weight:600;letter-spacing:5px;color:#9FB0C8;margin-top:4px;">FUNDING</div>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:32px 40px 8px 40px;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background-color:#FDECEE;color:#B42335;font-size:15px;font-weight:700;letter-spacing:1.2px;padding:9px 20px;border-radius:999px;">
              &#10005;&nbsp; DECLINED
            </td>
          </tr>
        </table>
        <h1 style="margin:18px 0 6px 0;font-size:24px;line-height:1.3;color:#0B1F3A;font-weight:700;">Application Declined</h1>
        <p style="margin:0;font-size:15px;color:#5B6B82;">Thank you for your submission. After careful review, we're unable to approve it at this time.</p>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:24px 40px 8px 40px;">
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#2B3A4F;">Hi Team,</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#2B3A4F;">
          Unfortunately, this application does not meet our current underwriting criteria.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:22px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FDECEE;border:1px solid #F5C6CC;border-radius:10px;">
          <tr>
            <td align="center" style="padding:16px 14px;">
              <div style="font-size:11px;font-weight:600;letter-spacing:1.5px;color:#9A3B47;margin-bottom:8px;">REASONS FOR DECLINE</div>
              ${reasonChips}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:16px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F7F9FB;border:1px solid #E3E8EF;border-radius:8px;">
          <tr>
            <td style="padding:12px 14px;font-size:13px;line-height:1.6;color:#5B6B82;">
              &#9432;&nbsp; This decision is based on our review of the application and supporting documents. It applies only to this application and does not affect future submissions.
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:24px 40px 30px 40px;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#2B3A4F;">
          Thank you for considering ${brand} Funding as your funding partner. We appreciate the opportunity and look forward to your next submission.
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#2B3A4F;">Best regards,<br><strong>${brand} Team</strong></p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:24px 24px 0 24px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#8A97AA;">
          ${brand} Funding<br>
          Questions? Simply reply to this email.
        </p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
