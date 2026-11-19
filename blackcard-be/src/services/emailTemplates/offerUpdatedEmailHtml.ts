import {
  APPLICATION_APPROVAL_URL_PLACEHOLDER,
  escapeHtml,
  resolveApplicationApprovalEmailFields,
  type ApplicationApprovalTemplateValues,
} from './applicationApprovalEmailShared';

const OFFER_UPDATED_EMAIL_LOGO_SRC =
  'https://res.cloudinary.com/oqok4ng8/image/upload/v1787242509/black_logo.svg';

const OFFER_UPDATED_EMAIL_WATERMARK_SRC =
  'https://res.cloudinary.com/oqok4ng8/image/upload/v1787242509/black_logo.svg';

const OFFER_UPDATED_EMAIL_FOOTER_LOGO_SRC =
  'https://res.cloudinary.com/oqok4ng8/image/upload/v1787242509/black_logo.svg';

const EMAIL_WIDTH = 600;
const EMAIL_BODY_MIN_HEIGHT = 440;

function buildStyledCtaButton(
  href: string,
  label: string,
  spacerBottom = 20,
): string {
  const safeLabel = escapeHtml(label);
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="left" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:0;padding:0 0 ${spacerBottom}px 0;">
  <tr>
    <td align="left" style="padding:0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:40px;v-text-anchor:middle;width:220px;" arcsize="10%" stroked="f" fillcolor="#002147">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">${safeLabel}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${href}" target="_blank" style="background-color:#002147;border-radius:4px;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:40px;padding:0 24px;text-align:center;text-decoration:none;-webkit-text-size-adjust:none;mso-hide:all;">${safeLabel}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

/** Gmail / Outlook-safe HTML for the ISO "offer updated" resend email. */
export function renderOfferUpdatedEmailHtml(
  values: ApplicationApprovalTemplateValues,
): string {
  const fields = resolveApplicationApprovalEmailFields(values);
  const companyName = escapeHtml(fields.companyName);
  const brandName = escapeHtml(fields.companyNameBrand);
  const crmName = escapeHtml(fields.crmName);
  const publicApprovalUrl =
    String(values.calculate_approval_url || values.view_application_url || '')
      .trim() || APPLICATION_APPROVAL_URL_PLACEHOLDER;
  const calculateHref = escapeHtml(publicApprovalUrl);

  const logoSrc = escapeHtml(OFFER_UPDATED_EMAIL_LOGO_SRC);
  const footerLogoSrc = escapeHtml(OFFER_UPDATED_EMAIL_FOOTER_LOGO_SRC);
  const watermarkSrc = escapeHtml(OFFER_UPDATED_EMAIL_WATERMARK_SRC);
  const teamSignature = escapeHtml(`${fields.companyNameBrand} Team`);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Offer Updated</title>
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
      .email-container { width: 100% !important; max-width: 100% !important; }
      .content-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; }
      .stack-gap { height: 16px !important; line-height: 16px !important; font-size: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:12px 10px;">
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" width="${EMAIL_WIDTH}" style="width:${EMAIL_WIDTH}px;max-width:${EMAIL_WIDTH}px;border-collapse:collapse;background-color:#ffffff;border:1px solid #e5e7eb;">

          <tr>
            <td bgcolor="#3d6fa0" style="padding:0;line-height:0;font-size:0;background-color:#3d6fa0;height:45px;vertical-align:bottom;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;border-collapse:collapse;">
                <tr>
                  <td bgcolor="#ffffff" style="background-color:#ffffff;padding:8px 24px 0 24px;border-top-left-radius:8px;border-top-right-radius:8px;line-height:0;font-size:0;">
                    <img src="${logoSrc}" alt="${brandName}" width="130" height="auto" border="0" style="display:block;width:130px;max-width:130px;height:auto;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="content-pad" valign="middle" height="${EMAIL_BODY_MIN_HEIGHT}" style="padding:32px 45px 0 45px;min-height:${EMAIL_BODY_MIN_HEIGHT}px;height:${EMAIL_BODY_MIN_HEIGHT}px;background-color:#ffffff;background-image:url('${watermarkSrc}');background-repeat:no-repeat;background-position:right center;background-size:contain;vertical-align:middle;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">

                <tr>
                  <td align="center" style="padding:0 0 4px 0;">
                    <h1 style="margin:0;font-family:Georgia,'Times New Roman',Times,serif;font-size:32px;font-weight:bold;line-height:1.2;color:#002147;letter-spacing:0.5px;text-transform:uppercase;">
                      Offer Updated
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding:0 0 28px 0;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;color:#4b5563;">
                      Your approved offer values have been updated.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td align="left" style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:1.4;color:#1f2937;text-align:left;">
                    Hi Team
                  </td>
                </tr>

                <tr>
                  <td align="left" style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#6b7280;text-align:left;">
                    Your offer values for <strong style="color:#1f2937;font-weight:bold;">&apos;${companyName}&apos;</strong> have been updated by <strong style="color:#1f2937;font-weight:bold;">${brandName}.</strong>
                  </td>
                </tr>

                <tr>
                  <td align="left" style="padding:0 0 22px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#6b7280;text-align:left;">
                    Please click on the button below to review your updated offer and recalculate your approvals. You do not need a ${crmName} login to use our calculator! Everyone on your team will have immediate access via this email.
                  </td>
                </tr>

                <tr>
                  <td align="left" style="padding:0 0 24px 0;text-align:left;">
                    ${buildStyledCtaButton(calculateHref, 'Review Approval', 0)}
                  </td>
                </tr>

                <tr>
                  <td align="left" style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#6b7280;text-align:left;">
                    If you need more information or have any questions, contact your representative directly.
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 45px 24px 45px;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td valign="bottom" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#333333;vertical-align:bottom;">
                    ${teamSignature}
                  </td>
                  <td align="right" valign="bottom" width="160" style="width:160px;text-align:right;vertical-align:bottom;line-height:0;font-size:0;">
                    <img src="${footerLogoSrc}" alt="${brandName}" width="150" height="auto" border="0" style="display:block;width:150px;max-width:150px;height:auto;margin-left:auto;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

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

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
