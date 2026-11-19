import { formatCityStateZip } from "./payoffWireInstructionsShared";
import { PAYOFF_WIRE_INSTRUCTIONS_VARIABLES } from "./payoffWireInstructionsShared";
import type { TemplateValues, TemplateVariable } from "./types";
import { escapeHtml } from "./applicationApprovalEmailShared";
import { APP_COMPANY_LEGAL_NAME } from "@/constants/appBranding";
import {
  DEFAULT_LETTER_EMAIL_BRANDING,
  type LetterEmailBranding,
} from "./letterEmailBranding";

const ICON_SRC = {
  merchant:
    "https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781791504/Image_5_yhs5j4.png",
  payoff:
    "https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781791504/Image_6_ktsahv.png",
  date: "https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781791503/Image_7_wo9ohu.png",
  beneficiary:
    "https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781791504/Account_Number_Icon_1_ieacvs.png",
};

const EMAIL_WIDTH = 600;
const INFO_TABLE_WIDTH = 510;

const v = PAYOFF_WIRE_INSTRUCTIONS_VARIABLES.reduce<
  Record<string, TemplateVariable>
>((acc, variable) => {
  acc[variable.key] = variable;
  return acc;
}, {});

function pickFirstOrNA(
  values: TemplateValues,
  keys: string[],
  variable?: TemplateVariable,
): string {
  for (const key of keys) {
    const raw = values[key];
    if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  }
  if (variable?.defaultValue?.trim()) return variable.defaultValue.trim();
  return "NA";
}

function pickOrNA(values: TemplateValues, variable: TemplateVariable): string {
  return pickFirstOrNA(values, [variable.key], variable);
}

function omitNa(raw: string): string {
  const t = raw.trim();
  if (!t || t.toUpperCase() === "NA") return "";
  return t;
}

function iconCell(src: string): string {
  return `<td align="center" style="line-height:0;font-size:0;"><img src="${escapeHtml(
    src,
  )}" alt="" width="28" height="28" border="0" style="display:block;width:28px;height:28px;border:0;outline:none;-ms-interpolation-mode:bicubic;" /></td>`;
}

function infoRow(
  iconSrc: string,
  label: string,
  val: string,
  iconBg: string,
  valCellStyle: string,
  bordered = true,
): string {
  const borderAttr = bordered ? ' style="border-bottom:1px solid #e2e8f0;"' : "";
  return `
                      <tr${borderAttr}>
                        <td width="50" bgcolor="${iconBg}" align="center" style="width:50px;background-color:${iconBg};padding:14px 0;vertical-align:middle;">
                          <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:0 auto;">
                            <tr>
                              ${iconCell(iconSrc)}
                            </tr>
                          </table>
                        </td>
                        <td width="180" style="width:180px;padding:14px 0 14px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#09090b;">
                          ${label}
                        </td>
                        <td width="16" align="center" style="width:16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#002147;">
                          :
                        </td>
                        <td style="padding:14px 16px;${valCellStyle}">${val}</td>
                      </tr>`;
}

/**
 * Gmail-safe HTML for Payoff Wire Information — same personalization keys as
 * the Payoff letter. Leftover wire tokens alias to those keys.
 */
export function renderPayoffWireInstructionsHtml(
  values: TemplateValues,
  branding: LetterEmailBranding = DEFAULT_LETTER_EMAIL_BRANDING,
): string {
  const theme = branding;
  const stripLight = escapeHtml(theme.accentStripLight);
  const stripDark = escapeHtml(theme.accentStripDark);
  const iconBg = escapeHtml(theme.infoTableIconBg);
  const letterDate = escapeHtml(pickOrNA(values, v.letter_date));
  const merchantName = escapeHtml(
    pickFirstOrNA(
      values,
      ["account_name", "merchant_legal_name"],
      v.account_name,
    ),
  );
  const payoffAmount = escapeHtml(pickOrNA(values, v.payoff_amount));
  const validTill = escapeHtml(pickOrNA(values, v.good_through_date));
  const lenderNameRaw = pickFirstOrNA(
    values,
    ["lender_name", "beneficiary_name"],
    v.lender_name,
  );
  const lenderName = escapeHtml(
    lenderNameRaw === "NA" ? APP_COMPANY_LEGAL_NAME : lenderNameRaw,
  );
  const paymentCompany = escapeHtml(
    pickFirstOrNA(
      values,
      ["payment_company_name", "payment_bank_name", "bank_name"],
      v.payment_company_name,
    ),
  );
  const paymentAddress1 = escapeHtml(pickOrNA(values, v.payment_address_line1));
  const paymentAddress2 = escapeHtml(
    omitNa(
      typeof values.payment_address_line2 === "string"
        ? values.payment_address_line2
        : "",
    ),
  );
  const routing = escapeHtml(
    pickFirstOrNA(
      values,
      ["payment_routing_number", "routing_number"],
      v.payment_routing_number,
    ),
  );
  const accountNumber = escapeHtml(
    pickFirstOrNA(
      values,
      ["payment_account_number", "wire_account_number"],
      v.payment_account_number,
    ),
  );
  const senderName = escapeHtml(pickOrNA(values, v.sender_name));
  const companyName = escapeHtml(theme.companyName);
  const logoSrc = escapeHtml(theme.logoSrc);
  const watermarkSrc = escapeHtml(theme.watermarkSrc);
  const watermarkHtml = watermarkSrc
    ? `<img class="letter-watermark" src="${watermarkSrc}" width="240" height="auto" alt="" border="0" style="display:inline-block;width:240px;max-width:240px;height:auto;opacity:0.04;filter:alpha(opacity=4);" />`
    : "";

  const intro =
    "Please find below the payoff and wiring instructions for your account. Wires received after the valid through date may require updated instructions.";
  const wireCopy =
    "Please remit the payoff amount to the address below. Ensure payments are received by the good through date to avoid additional interest charges.";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Payoff Wire Information</title>
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; display: block; }
    a { text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border: none !important; }
      .content-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .info-table { width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f8fafc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f8fafc;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" width="${EMAIL_WIDTH}" style="width:${EMAIL_WIDTH}px;max-width:${EMAIL_WIDTH}px;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;">

          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;margin:0;">
                <tr>
                  <td height="12" bgcolor="${stripLight}" style="height:12px;line-height:12px;font-size:12px;background-color:${stripLight};padding:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td height="12" bgcolor="${stripDark}" style="height:12px;line-height:12px;font-size:12px;background-color:${stripDark};padding:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:10px 45px 35px 45px;background-color:#ffffff;">
              <img src="${logoSrc}" alt="${companyName}" width="160" height="auto" border="0" style="display:block;width:160px;max-width:160px;height:auto;margin:0 auto;" />
            </td>
          </tr>

          <tr>
            <td class="content-pad" style="padding:0 45px 20px 45px;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">

                <tr>
                  <td align="center" style="padding:0 0 28px 0;text-align:center;">
                    <h1 style="margin:0;font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:28px;font-weight:700;line-height:1.25;color:${stripDark};text-transform:uppercase;">
                      PAYOFF <span style="color:${stripLight};font-weight:400;">WIRE INFORMATION</span>
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 14px 0;font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#71717a;">
                    ${letterDate}
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 10px 0;font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;line-height:1.4;color:#09090b;">
                    ${merchantName}
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 16px 0;font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;font-weight:700;color:#09090b;">
                    Subject: Payoff Wire Information
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 22px 0;font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.55;color:#52525b;">
                    ${intro}
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 22px 0;">
                    <table role="presentation" class="info-table" border="0" cellpadding="0" cellspacing="0" width="${INFO_TABLE_WIDTH}" style="width:${INFO_TABLE_WIDTH}px;max-width:100%;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                      ${infoRow(ICON_SRC.merchant, "Merchant Name", merchantName, iconBg, "font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:14px;color:#52525b;")}
                      ${infoRow(ICON_SRC.payoff, "Payoff Amount", payoffAmount, iconBg, "font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;color:#09090b;")}
                      ${infoRow(ICON_SRC.beneficiary, "Beneficiary Name", lenderName, iconBg, "font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:14px;color:#52525b;")}
                      ${infoRow(ICON_SRC.date, "Valid Till", validTill, iconBg, "font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:14px;color:#52525b;", false)}
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 24px 0;font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.55;color:#52525b;">
                    ${wireCopy}
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 10px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;font-weight:700;letter-spacing:2px;color:#1f5f99;white-space:nowrap;padding:0 12px 0 0;">WIRE INFORMATION</td>
                        <td width="100%" style="border-bottom:1px solid #e5e9ef;"></td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 28px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;border:1px solid #e5e9ef;">
                      <tr>
                        <td width="18%" style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;font-weight:700;color:#52637a;background-color:#f6f8fa;vertical-align:top;border-bottom:1px solid #e5e9ef;">Bank</td>
                        <td width="34%" style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;color:#09090b;vertical-align:top;border-bottom:1px solid #e5e9ef;">${paymentCompany}<span style="display:block;padding-top:3px;font-size:11pt;color:#71717a;">2929 E. Commercial Blvd., Ft. Lauderdale, FL, 33308</span></td>
                        <td width="16%" style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;font-weight:700;color:#52637a;background-color:#f6f8fa;vertical-align:top;border-bottom:1px solid #e5e9ef;">Routing</td>
                        <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;color:#09090b;vertical-align:top;border-bottom:1px solid #e5e9ef;">${routing}</td>
                      </tr>
                      <tr>
                        <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;font-weight:700;color:#52637a;background-color:#f6f8fa;vertical-align:top;border-bottom:1px solid #e5e9ef;">Beneficiary</td>
                        <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;color:#09090b;vertical-align:top;border-bottom:1px solid #e5e9ef;">${lenderName}<span style="display:block;padding-top:3px;font-size:11pt;color:#71717a;">${[paymentAddress1, formatCityStateZip(paymentAddress2)].filter(Boolean).join(", ")}</span></td>
                        <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;font-weight:700;color:#52637a;background-color:#f6f8fa;vertical-align:top;border-bottom:1px solid #e5e9ef;">Account</td>
                        <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;color:#09090b;vertical-align:top;border-bottom:1px solid #e5e9ef;">${accountNumber}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td valign="bottom" style="padding:16px 0 10px 45px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#52525b;vertical-align:bottom;">
                    <p style="margin:0 0 20px 0;font-style:italic;">Sincerely,</p>
                    <p style="margin:0 0 8px 0;font-family:Georgia,'Times New Roman',Times,serif;font-size:24px;font-weight:normal;color:#002147;font-style:italic;">${senderName}</p>
                    <p style="margin:0;font-size:12px;color:#71717a;">Account Specialist</p>
                  </td>
                  <td align="right" valign="bottom" width="240" style="width:240px;padding:0 10px 6px 0;line-height:0;font-size:0;text-align:right;vertical-align:bottom;">
                    ${watermarkHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;margin:0;">
                <tr>
                  <td height="12" bgcolor="${stripDark}" style="height:12px;line-height:12px;font-size:12px;background-color:${stripDark};padding:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td height="12" bgcolor="${stripLight}" style="height:12px;line-height:12px;font-size:12px;background-color:${stripLight};padding:0;">&nbsp;</td>
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
