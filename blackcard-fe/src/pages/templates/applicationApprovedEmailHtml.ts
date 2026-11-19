import type { TemplateValues } from "./types";
import {
  APPLICATION_APPROVAL_EMAIL_LOGO_SRC,
  APPLICATION_APPROVAL_EMAIL_WATERMARK_SRC,
  escapeHtml,
} from "./applicationApprovalEmailShared";
import { resolveApplicationApprovedEmailFields } from "./applicationApprovedEmailShared";
import {
  buildOfferDetailsRows,
  renderOfferDetailsTable,
} from "./offerDetailsEmailHtml";

const EMAIL_WIDTH = 600;

/**
 * Gmail / Outlook-safe HTML for the ISO application-approved email with full
 * offer terms inline — no public approval portal link.
 * Woodmere brand palette — aligned with the application-approval template.
 */
export function renderApplicationApprovedEmailHtml(
  values: TemplateValues,
): string {
  const fields = resolveApplicationApprovedEmailFields(values);
  const companyName = escapeHtml(fields.companyName);
  const brandName = escapeHtml(fields.companyNameBrand);

  const logoSrc = escapeHtml(APPLICATION_APPROVAL_EMAIL_LOGO_SRC);
  const watermarkSrc = escapeHtml(APPLICATION_APPROVAL_EMAIL_WATERMARK_SRC);

  const offerDetailsRows = buildOfferDetailsRows(fields);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Application Approved</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; display: block; }
    a { text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border: none !important; }
      .content-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; }
      .stack-gap { height: 16px !important; line-height: 16px !important; font-size: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f8fafc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f8fafc;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" width="${EMAIL_WIDTH}" style="width:${EMAIL_WIDTH}px;max-width:${EMAIL_WIDTH}px;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;">

          <!-- Top two-tone accent strip -->
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;margin:0;">
                <tr>
                  <td height="12" bgcolor="#3d6fa0" style="height:12px;line-height:12px;font-size:12px;background-color:#3d6fa0;padding:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td height="12" bgcolor="#002147" style="height:12px;line-height:12px;font-size:12px;background-color:#002147;padding:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:10px 45px 35px 45px;background-color:#ffffff;">
              <img src="${logoSrc}" alt="${brandName}" width="160" height="auto" border="0" style="display:block;width:160px;max-width:160px;height:auto;margin:0 auto;" />
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td class="content-pad" style="padding:0 45px 20px 45px;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">

                <tr>
                  <td align="center" style="padding:0 0 25px 0;">
                    <h1 style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;line-height:1.2;color:#002147;letter-spacing:0.5px;text-transform:uppercase;">
                      APPLICATION <span style="color:#a1a1aa;font-weight:400;">APPROVED</span>
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding:0 0 30px 0;">
                    <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.4;color:#52525b;">
                      Congratulations! Your application has been successfully approved.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 12px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:1.4;color:#09090b;">
                    Hi Team,
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#52525b;">
                    We are pleased to inform you that your application for <strong style="color:#09090b;font-weight:700;">&apos;${companyName}&apos;</strong> has been approved by <strong style="color:#09090b;font-weight:700;">${brandName}!</strong> The approved offer terms are summarized below.
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 28px 0;">
                    ${renderOfferDetailsTable(offerDetailsRows)}
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#52525b;">
                    If you need more information or have any questions about these terms, contact your ${escapeHtml(fields.crmName)} representative directly.
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Sign-off + watermark -->
          <tr>
            <td style="padding:0;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td valign="bottom" style="padding:16px 0 10px 45px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#52525b;vertical-align:bottom;">
                    Best Regards,<br/>${brandName} Team
                  </td>
                  <td align="right" valign="bottom" width="240" style="width:240px;padding:0 10px 6px 0;line-height:0;font-size:0;text-align:right;vertical-align:bottom;">
                    <img src="${watermarkSrc}" width="240" height="auto" alt="" border="0" style="display:inline-block;width:240px;max-width:240px;height:auto;opacity:0.04;filter:alpha(opacity=4);" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer two-tone accent strip -->
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;margin:0;">
                <tr>
                  <td height="12" bgcolor="#002147" style="height:12px;line-height:12px;font-size:12px;background-color:#002147;padding:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td height="12" bgcolor="#3d6fa0" style="height:12px;line-height:12px;font-size:12px;background-color:#3d6fa0;padding:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
