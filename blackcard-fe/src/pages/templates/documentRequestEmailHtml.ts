import { APP_EMAIL_LOGO_SRC } from "@/constants/appLogo";
import type { TemplateValues } from "./types";
import {
  escapeHtml,
  resolveDocumentRequestEmailFields,
} from "./documentRequestEmailShared";

/** Hosted logo for outbound email (Gmail/Outlook-safe absolute URL). */
const DOCUMENT_REQUEST_EMAIL_LOGO_SRC = APP_EMAIL_LOGO_SRC;

/** Hosted PNG document icon shown in the "Required Documents" circle. */
const DOCUMENT_REQUEST_EMAIL_ICON_SRC =
    "https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781888571/Document_Icon_1_etkhnd.png";

/** Center faded background watermark layout image. */
const DOCUMENT_REQUEST_EMAIL_WATERMARK_SRC = DOCUMENT_REQUEST_EMAIL_LOGO_SRC;

/** Use two columns when the list has this many items or more. */
const TWO_COLUMN_MIN_ITEMS = 4;
/** Fixed column width — % columns collapse in Outlook. */
const DOCUMENT_LIST_COLUMN_WIDTH = 168;

function renderDocumentItem(label: string, isLast: boolean): string {
  const cellStyle = isLast
    ? "padding:10px 0 6px 0;"
    : "padding:10px 0; border-bottom:1px solid #e2e8f0;";
  return `
    <tr>
      <td style="${cellStyle}">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td width="20" style="font-size:16px;color:#94a3b8;line-height:1;vertical-align:middle;text-align:left;padding-top:1px;">&#9679;</td>
            <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#0f172a;line-height:1.4;vertical-align:middle;">
              ${escapeHtml(label)}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function renderDocumentColumn(labels: string[]): string {
  const rows = labels
    .map((label, index) =>
      renderDocumentItem(label, index === labels.length - 1),
    )
    .join("");
  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${rows}
    </table>`;
}

function renderDocumentList(labels: string[]): string {
  if (labels.length === 0) {
    return renderDocumentColumn(["Additional documents (as discussed)"]);
  }

  if (labels.length < TWO_COLUMN_MIN_ITEMS) {
    return renderDocumentColumn(labels);
  }

  const splitAt = Math.ceil(labels.length / 2);
  const leftLabels = labels.slice(0, splitAt);
  const rightLabels = labels.slice(splitAt);

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;">
      <tr>
        <td class="request-doc-column" width="${DOCUMENT_LIST_COLUMN_WIDTH}" valign="top" style="width:${DOCUMENT_LIST_COLUMN_WIDTH}px;vertical-align:top;padding:0 12px 0 0;">
          ${renderDocumentColumn(leftLabels)}
        </td>
        <td class="request-doc-column" width="${DOCUMENT_LIST_COLUMN_WIDTH}" valign="top" style="width:${DOCUMENT_LIST_COLUMN_WIDTH}px;vertical-align:top;padding:0;">
          ${renderDocumentColumn(rightLabels)}
        </td>
      </tr>
    </table>`;
}

function renderNoteBlock(note: string): string {
  if (!note) return "";
  return `
          <tr>
            <td class="content-pad" style="padding:0 45px 25px 45px;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="510" style="width:510px;border-collapse:collapse;background-color:#f1f5f9;border-radius:6px;">
                <tr>
                  <td width="40" valign="top" style="width:40px;padding:12px 0 12px 14px;vertical-align:top;text-align:center;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:50%;width:20px;height:20px;border-collapse:collapse;margin:0 auto;">
                      <tr>
                        <td align="center" valign="middle" style="font-family:Georgia,serif;font-size:12px;font-weight:bold;color:#ffffff;line-height:20px;font-style:italic;text-align:center;">
                          i
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding:12px 14px 12px 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#475569;">
                    <strong style="color:#0f172a;">Important Note:</strong> ${escapeHtml(note).replace(/\n/g, "<br/>")}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function renderDocumentRequestEmailHtml(
  values: TemplateValues,
): string {
  const fields = resolveDocumentRequestEmailFields(values);
  const uploadUrl = escapeHtml(fields.uploadUrl);
  const teamName = escapeHtml(fields.teamName);
  const logoSrc = escapeHtml(DOCUMENT_REQUEST_EMAIL_LOGO_SRC);
  const documentIconSrc = escapeHtml(DOCUMENT_REQUEST_EMAIL_ICON_SRC);
  const watermarkSrc = escapeHtml(DOCUMENT_REQUEST_EMAIL_WATERMARK_SRC);
  const documentList = renderDocumentList(fields.requestedDocumentLabels);
  const noteBlock = renderNoteBlock(fields.note);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Document Upload Request</title>
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; display: block; }
    a { text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border: none !important; }
      .content-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .request-table { width: 100% !important; }
      .request-sidebar { display: block !important; width: 100% !important; border-radius: 12px 12px 0 0 !important; text-align: center !important; padding: 25px 0 !important; }
      .request-content { display: block !important; width: 100% !important; border-radius: 0 0 12px 12px !important; padding-left: 15px !important; padding-right: 15px !important; }
      .request-doc-column { display: block !important; width: 100% !important; max-width: 100% !important; padding-right: 0 !important; padding-bottom: 10px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f8fafc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f8fafc;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;border-collapse:collapse;border:1px solid #e2e8f0;background-color:#ffffff;position:relative;">
          
          <!-- Top Two-Tone Accent Strip Header -->
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

          <tr>
            <td align="center" style="padding:10px 45px 35px 45px;background-color:#ffffff;">
              <img src="${logoSrc}" alt="Logo" width="160" height="auto" border="0" style="display:block;width:160px;max-width:160px;height:auto;margin:0 auto;" />
            </td>
          </tr>

          <tr>
            <td align="center" class="content-pad" style="padding:0 45px 25px 45px;background-color:#ffffff;">
              <h1 style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;line-height:1.2;color:#002147;letter-spacing:0.5px;text-transform:uppercase;">
                DOCUMENT <span style="color:#a1a1aa;font-weight:400;">UPLOAD REQUEST</span>
              </h1>
            </td>
          </tr>

          <tr>
            <td class="content-pad" style="padding:15px 45px 20px 45px;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 12px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#09090b;">
                    Hi Team,
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 10px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#52525b;">
                    To continue processing your application, please upload the required documents listed below.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="content-pad" style="padding:10px 45px 25px 45px;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="510" style="width:510px;max-width:100%;border-collapse:collapse;">
                <tr>
                  <td>
                    <table role="presentation" class="request-table" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;box-shadow: 0px 4px 12px rgba(0,0,0,0.03);">
                      <tr>
                        <td width="115" bgcolor="#000000" align="center" valign="middle" style="width:115px;background-color:#000000;padding:25px 12px;vertical-align:middle;text-align:center;border-top-left-radius:12px;border-bottom-left-radius:12px;position:relative;">
                          <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;border-collapse:collapse;">
                            <tr>
                              <td align="center" style="padding:0 0 14px 0;">
                                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:50%;width:36px;height:36px;border-collapse:collapse;margin:0 auto;">
                                  <tr>
                                    <td align="center" valign="middle" style="height:36px;line-height:0;font-size:0;text-align:center;vertical-align:middle;">
                                      <img src="${documentIconSrc}" alt="Document" width="18" height="18" style="display:block;width:18px;height:18px;max-width:18px;margin:0 auto;" />
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:#ffffff;line-height:1.4;letter-spacing:0.8px;text-transform:uppercase;">
                                REQUIRED
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:#ffffff;line-height:1.4;letter-spacing:0.8px;text-transform:uppercase;">
                                DOCUMENTS
                              </td>
                            </tr>
                          </table>
                        </td>

                        <td width="20" bgcolor="#ffffff" valign="middle" style="width:20px;background-color:#ffffff;padding:0;font-size:0;line-height:0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
                          <svg width="20" height="140" viewBox="0 0 20 140" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;height:100%;width:20px;">
                            <path d="M0 0L15 70L0 140H20V0H0Z" fill="#ffffff"/>
                            <path d="M0 0L15 70L0 140" stroke="#e2e8f0" stroke-width="1"/>
                          </svg>
                        </td>

                        <td valign="middle" bgcolor="#ffffff" style="padding:15px 24px;vertical-align:middle;background-color:#ffffff;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-top-right-radius:12px;border-bottom-right-radius:12px;">
                          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                            <tr>
                              <td style="padding:0;">
                                ${documentList}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${noteBlock}

          <tr>
            <td class="content-pad" style="padding:5px 45px 25px 45px;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 20px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#52525b;">
                    Please upload the documents using the button below. No CRM login is required — you can upload everything from one secure page.
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 15px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
                      <tr>
                        <td align="center" bgcolor="#000000" style="border-radius:6px;background-color:#000000;">
                          <a href="${uploadUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;color:#ffffff;line-height:1;text-transform:uppercase;letter-spacing:0.5px;">
                            Upload Documents
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="content-pad" style="padding:0 45px 30px 45px;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 18px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#52525b;font-weight:700;">
                    Thank you for your cooperation,
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#52525b;font-weight:700;">
                    Best Regards,<br/>${teamName}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="right" style="padding:0 10px 20px 0;background-color:#ffffff;line-height:0;font-size:0;text-align:right;">
              <img src="${watermarkSrc}" width="240" height="auto" alt="" border="0" style="display:inline-block;width:240px;max-width:240px;height:auto;opacity:0.04;filter:alpha(opacity=4);" />
            </td>
          </tr> 

          <!-- Footer Two-Tone Accent Strip Foundation -->
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
