/**
 * Shared letterhead layout for the Payoff and Zero Balance letters:
 * logo top-left + date top-right, divider, centered title in the brand colour,
 * faint blurred logo watermark, sign-off and footer. Tables + inline styles
 * only so it renders the same in email clients and the letter PDF.
 * Branding (name, logo, colours) comes from the funder's letter branding.
 * Inputs must be HTML-escaped.
 */
import { APP_COMPANY_LEGAL_NAME, APP_COMPANY_NAME } from "@/constants/appBranding";
import { escapeHtml } from "./applicationApprovalEmailShared";
import {
  DEFAULT_LETTER_EMAIL_BRANDING,
  type LetterEmailBranding,
} from "./letterEmailBranding";

export const LETTER_FONT = "font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;";
export const LETTER_DARK = "#111827";
export const LETTER_BODY = "#374151";
export const LETTER_MUTED = "#6b7280";
export const LETTER_RULE = "#e5e7eb";

const FONT = LETTER_FONT;
const LETTER_WIDTH = 794;

/**
 * Faint (6%), heavily blurred copy of the letter logo. Cloudinary logos get the
 * transform baked in (email/PDF clients ignore CSS blur/opacity); other hosts
 * fall back to the branding's own watermark image.
 */
export function letterWatermarkSrc(branding: LetterEmailBranding): string {
  const logo = String(branding.logoSrc ?? "").trim();
  if (/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(logo)) {
    return logo.replace("/image/upload/", "/image/upload/o_6,e_blur:800,f_png/");
  }
  return String(branding.watermarkSrc ?? "").trim();
}

/** Legal name for the sign-off / footer (the platform's legal entity for the default branding). */
export function letterCompanyLegalName(branding: LetterEmailBranding): string {
  return branding === DEFAULT_LETTER_EMAIL_BRANDING
    ? APP_COMPANY_LEGAL_NAME
    : branding.companyName;
}

/** Short name used in letter copy (e.g. "Black Card"). */
export function letterCompanyShortName(branding: LetterEmailBranding): string {
  return branding === DEFAULT_LETTER_EMAIL_BRANDING
    ? APP_COMPANY_NAME
    : branding.companyName;
}

/** "10/22/2026" (Letters page format) → "October 22, 2026"; anything else unchanged. */
export function toLongLetterDate(value: string): string {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(value);
  if (!m) return value;
  const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "October 22, 2026" — used when no letter date is supplied. */
export function todayLongDate(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Bold inline value inside a paragraph. */
export function letterStrong(text: string): string {
  return `<strong style="color:${LETTER_DARK};font-weight:600;">${text}</strong>`;
}

export function letterParagraph(text: string, bottom: number): string {
  return `
                <tr>
                  <td style="${FONT}padding:0 0 ${bottom}px 0;font-size:13px;line-height:1.6;color:${LETTER_BODY};">${text}</td>
                </tr>`;
}

export type LetterDetailRow = { label: string; value: string; subtle?: boolean };

/** Label/value table with thin grey row dividers. */
export function letterDetailsTable(rows: LetterDetailRow[]): string {
  const body = rows
    .map((row, i) => {
      const border = i === rows.length - 1 ? "" : `border-bottom:1px solid ${LETTER_RULE};`;
      return `
                      <tr>
                        <td width="38%" style="${FONT}width:38%;padding:11px 0;font-size:13px;color:${LETTER_MUTED};vertical-align:top;${border}">${row.label}</td>
                        <td style="${FONT}padding:11px 0;font-size:${row.subtle ? "12px" : "13px"};font-weight:${row.subtle ? "400" : "600"};color:${row.subtle ? LETTER_MUTED : LETTER_DARK};vertical-align:top;${border}">${row.value}</td>
                      </tr>`;
    })
    .join("");
  return `
                <tr>
                  <td style="padding:0 0 24px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;border-top:1px solid ${LETTER_RULE};border-bottom:1px solid ${LETTER_RULE};">${body}
                    </table>
                  </td>
                </tr>`;
}

/** "WIRE INFORMATION" heading + 2x2 bordered grid. Values must be HTML-escaped. */
export function letterWireInformation(opts: {
  bank: string;
  bankAddress: string;
  routing: string;
  beneficiary: string;
  beneficiaryAddress: string;
  account: string;
}): string {
  const label = `${FONT}width:17%;padding:12px 14px;font-size:12px;font-weight:600;color:${LETTER_MUTED};background-color:#f3f4f6;vertical-align:top;border:1px solid ${LETTER_RULE};`;
  const value = `${FONT}padding:12px 14px;font-size:13px;font-weight:600;color:${LETTER_DARK};vertical-align:top;border:1px solid ${LETTER_RULE};`;
  const sub = `display:inline-block;padding-top:3px;font-size:11px;font-weight:400;color:${LETTER_MUTED};`;
  const subLine = (text: string) => (text ? `<br /><span style="${sub}">${text}</span>` : "");
  return `
                <tr>
                  <td style="${FONT}padding:0 0 8px 0;font-size:11px;font-weight:600;letter-spacing:1.5px;color:${LETTER_MUTED};">WIRE INFORMATION</td>
                </tr>
                <tr>
                  <td style="padding:0 0 32px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;border:1px solid ${LETTER_RULE};">
                      <tr>
                        <td width="17%" style="${label}">Bank</td>
                        <td width="37%" style="${value}">${opts.bank}${subLine(opts.bankAddress)}</td>
                        <td width="17%" style="${label}">Routing</td>
                        <td style="${value}">${opts.routing}</td>
                      </tr>
                      <tr>
                        <td style="${label}">Beneficiary</td>
                        <td style="${value}">${opts.beneficiary}${subLine(opts.beneficiaryAddress)}</td>
                        <td style="${label}">Account</td>
                        <td style="${value}">${opts.account}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
}

export function renderLetterDocument(opts: {
  branding: LetterEmailBranding;
  documentTitle: string;
  heading: string;
  /** Escaped letter date (MM/DD/YYYY is shown in long form). */
  letterDate: string;
  bodyRows: string;
  /** Bold line under "Best Regards," (sender name, or the signature title). */
  signerLine: string;
  /** Optional grey title line under the signer (omitted when it equals the signer). */
  signatureTitle?: string;
}): string {
  const { branding } = opts;
  const company = escapeHtml(letterCompanyLegalName(branding));
  const companyAlt = escapeHtml(branding.companyName);
  const logoSrc = escapeHtml(branding.logoSrc);
  const watermarkSrc = escapeHtml(letterWatermarkSrc(branding));
  const titleColor = escapeHtml(branding.accentStripDark);
  const watermarkStyle = watermarkSrc
    ? `background-image:url('${watermarkSrc}');background-repeat:no-repeat;background-position:center 55%;background-size:70% auto;`
    : "";
  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" alt="${companyAlt}" width="130" border="0" style="display:block;width:130px;max-width:130px;height:auto;" />`
    : `<span style="${FONT}font-size:18px;line-height:1.2;font-weight:700;color:${titleColor};">${companyAlt}</span>`;
  const titleLine =
    opts.signatureTitle && opts.signatureTitle !== opts.signerLine
      ? `<br /><span style="font-size:12px;color:${LETTER_MUTED};">${opts.signatureTitle}</span>`
      : "";
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${opts.documentTitle}</title>
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; display: block; }
    a { text-decoration: none; }
    @media only screen and (max-width: 660px) {
      .letter-container { width: 100% !important; max-width: 100% !important; }
      .content-pad { padding-left: 24px !important; padding-right: 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;${FONT}-webkit-font-smoothing:antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" data-letter-pdf-card="1" class="letter-container" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 auto;width:100%;max-width:${LETTER_WIDTH}px;border-collapse:collapse;background-color:#ffffff;">
          <tr>
            <td class="content-pad" style="padding:36px 36px 24px 36px;background-color:#ffffff;${watermarkStyle}">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 18px 0;border-bottom:1px solid ${LETTER_RULE};">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                      <tr>
                        <td valign="middle" style="vertical-align:middle;line-height:0;font-size:0;">
                          ${logoHtml}
                        </td>
                        <td valign="middle" align="right" style="${FONT}vertical-align:middle;text-align:right;font-size:12px;color:${LETTER_MUTED};white-space:nowrap;">${toLongLetterDate(opts.letterDate)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="${FONT}padding:30px 0 28px 0;text-align:center;font-size:20px;font-weight:600;letter-spacing:4px;color:${titleColor};">${opts.heading}</td>
                </tr>
${opts.bodyRows}
                <tr>
                  <td style="${FONT}padding:0 0 36px 0;font-size:13px;line-height:1.6;color:${LETTER_BODY};">
                    Best Regards,<br />
                    <strong style="display:inline-block;padding-top:10px;font-weight:600;color:${LETTER_DARK};">${opts.signerLine}</strong>${titleLine}<br />
                    <span style="font-size:12px;color:${LETTER_MUTED};">${company}</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="${FONT}padding:14px 0 0 0;border-top:1px solid ${LETTER_RULE};text-align:center;font-size:11px;color:#9ca3af;">${company}</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Spacer row: the PDF renderer zeroes the card's last row, keep the letter out of it. -->
          <tr><td style="height:1px;line-height:1px;font-size:1px;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
