import { APP_EMAIL_LOGO_SRC } from "@/constants/appLogo";
import type { TemplateValues } from "./types";
import {
  CLIENT_PROVIDED_STIPS,
  COMPANY_HANDLED_STIPS,
  escapeHtml,
  escapeHrefAttribute,
  resolveApplicationApprovalEmailFields,
} from "./applicationApprovalEmailShared";

const EMAIL_WIDTH = 600;
const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";

/** Server fills this with the approved amount + offer terms (services/approvalOfferTerms). */
const OFFER_TERMS_SLOT = "<!--__APPROVAL_OFFER_TERMS__-->";

function stipLines(items: readonly string[], mark: string): string {
  return items.map((item) => `${mark}&nbsp; ${escapeHtml(item)}`).join("<br>");
}

/**
 * Gmail / Outlook-safe HTML for the ISO application-approval email (Blackcard design):
 * approved pill, green approval card (amount + terms + calculator button),
 * required stips, sign-off. Business, brand and link come from the deal.
 */
export function renderApplicationApprovalEmailHtml(
  values: TemplateValues,
): string {
  const fields = resolveApplicationApprovalEmailFields(values);
  const companyName = escapeHtml(fields.companyName);
  // Header/footer add "FUNDING" themselves, so drop it from the name if present.
  const brandRaw = String(fields.companyNameBrand || "Black Card")
    .trim()
    .replace(/\s+funding$/i, "") || "Black Card";
  const brand = escapeHtml(brandRaw);
  const isoApprovalHref = escapeHrefAttribute(fields.isoApprovalUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Application Approved</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF1F5;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#EEF1F5;">
Good news – ${companyName} has been approved by ${brand} Funding. Calculate your approval now.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF1F5;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="${EMAIL_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${EMAIL_WIDTH}px;font-family:${FONT};">
    <tr>
      <td align="center" style="background-color:#FFFFFF;padding:18px 24px 14px 24px;border-top:6px solid #0B1F3A;border-radius:12px 12px 0 0;">
        <img src="${APP_EMAIL_LOGO_SRC}" alt="${escapeHtml(brandRaw)} Funding" width="140" border="0" style="display:block;width:140px;max-width:140px;height:auto;margin:0 auto;" />
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:32px 40px 8px 40px;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background-color:#E7F6EE;color:#13804B;font-size:12px;font-weight:700;letter-spacing:1px;padding:7px 14px;border-radius:999px;">
              &#10003;&nbsp; APPROVED
            </td>
          </tr>
        </table>
        <h1 style="margin:18px 0 6px 0;font-size:24px;line-height:1.3;color:#0B1F3A;font-weight:700;">Application Approved</h1>
        <p style="margin:0;font-size:15px;color:#5B6B82;">Congratulations! Your application has been successfully processed.</p>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:24px 40px 8px 40px;">
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#2B3A4F;">Hi Team,</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#2B3A4F;">
          We're pleased to let you know that <strong>${companyName}</strong> has been <strong style="color:#13804B;">approved</strong> by ${brand} Funding.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:22px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#E7F6EE;border:1px solid #BFE6D0;border-radius:10px;">
          <tr>
            <td align="center" style="padding:16px 12px 20px 12px;">
              ${OFFER_TERMS_SLOT}
              <div style="font-size:13px;color:#3F7A5C;margin:14px 0 14px 0;">No ${brand} login needed &middot; Anyone on your team can use this link</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:#13804B;border-radius:8px;">
                    <a href="${isoApprovalHref}" target="_blank" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">Calculate Your Approval &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:24px 40px 0 40px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#0B1F3A;margin-bottom:8px;">REQUIRED STIPS</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E3E8EF;border-radius:10px;">
          <tr>
            <td width="50%" valign="top" style="padding:12px 16px;border-right:1px solid #E3E8EF;">
              <div style="font-size:12px;font-weight:700;color:#0B1F3A;margin-bottom:6px;">Stips to Request Contracts</div>
              <div style="font-size:14px;line-height:1.8;color:#2B3A4F;">${stipLines(CLIENT_PROVIDED_STIPS, "&#9744;")}</div>
            </td>
            <td width="50%" valign="top" style="padding:12px 16px;">
              <div style="font-size:12px;font-weight:700;color:#0B1F3A;margin-bottom:6px;">Stips for Funding</div>
              <div style="font-size:14px;line-height:1.8;color:#2B3A4F;">${stipLines(COMPANY_HANDLED_STIPS, "&#9744;")}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:24px 40px 30px 40px;border-radius:0 0 12px 12px;">
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
