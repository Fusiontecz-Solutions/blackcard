import {
    APP_COMPANY_NAME,
    APPLICATION_APPROVAL_EMAIL_LOGO_SRC,
} from './applicationApprovalEmailShared';

const EMAIL_WIDTH = 600;

export type ReturnToScrubberEmailParams = {
    /** Scrubber the deal was sent back to. */
    scrubberName: string;
    /** Underwriter who asked for the correction. */
    underwriterName: string;
    applicationNumber: string;
    businessName: string;
    /** Correction reasons the underwriter selected. */
    reasons?: string[];
    /** The underwriter's free-text note. */
    note?: string;
    openApplicationUrl?: string;
    brandName?: string;
    logoUrl?: string;
};

function escapeHtml(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeHref(url: string): string {
    return escapeHtml(url).replace(/'/g, '&#39;');
}

export function buildReturnToScrubberEmailSubject(
    businessName?: string | null,
): string {
    const business = String(businessName || '').trim();
    return business
        ? `Correction Required — ${business}`
        : 'Correction Required';
}

function buildStyledCtaButton(href: string, label: string): string {
    const safeHref = escapeHref(href);
    const safeLabel = escapeHtml(label);
    return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="left" style="border-collapse:collapse;margin:0;">
  <tr>
    <td align="left" style="padding:0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="12%" stroked="f" fillcolor="#000000">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">${safeLabel}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${safeHref}" target="_blank" style="background-color:#000000;border-radius:6px;color:#ffffff;display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;line-height:44px;padding:0 28px;text-align:center;text-decoration:none;text-transform:uppercase;letter-spacing:0.5px;-webkit-text-size-adjust:none;mso-hide:all;">${safeLabel}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

function detailRow(
    label: string,
    value: string,
    opts?: { last?: boolean; valueColor?: string },
): string {
    const border = opts?.last ? '' : 'border-bottom:1px solid #e2e8f0;';
    const valueColor = opts?.valueColor || '#09090b';
    return `
<tr>
  <td style="padding:14px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#52525b;${border}">${escapeHtml(label)}</td>
  <td align="right" style="padding:14px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:${valueColor};${border}">${escapeHtml(value)}</td>
</tr>`;
}

function renderReasonList(reasons: string[]): string {
    if (!reasons.length) return '';
    const rows = reasons
        .map(
            (reason) => `
<tr>
  <td style="padding:4px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#09090b;">&bull;&nbsp; ${escapeHtml(reason)}</td>
</tr>`,
        )
        .join('');

    return `
                <tr>
                  <td style="padding:0 0 10px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#002147;letter-spacing:0.5px;text-transform:uppercase;">
                    What Needs Correcting
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 22px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                      ${rows}
                    </table>
                  </td>
                </tr>`;
}

/**
 * Underwriter → scrubber correction request. Same shell as the scrubber →
 * underwriter recommendation email, in the other direction.
 * Internal underwriting notice — not ISO/merchant facing.
 */
/* Branding comes from this book's own constants — never hard-code a book name
 * or logo here, or it travels when this file is ported to another book. */
export function renderReturnToScrubberEmailHtml(
    params: ReturnToScrubberEmailParams,
): string {
    const brandNameRaw =
        String(params.brandName || APP_COMPANY_NAME).trim() || 'CRM';
    const brandName = escapeHtml(brandNameRaw);
    const logoSrc = escapeHtml(
        String(params.logoUrl || APPLICATION_APPROVAL_EMAIL_LOGO_SRC || '').trim(),
    );
    const scrubberNameRaw = String(params.scrubberName || 'Scrubber').trim() || 'Scrubber';
    const underwriterNameRaw =
        String(params.underwriterName || 'Underwriter').trim() || 'Underwriter';
    const applicationNumberRaw = String(params.applicationNumber || '').trim() || '—';
    const businessNameRaw = String(params.businessName || '').trim() || 'the business';
    const noteRaw = String(params.note || '').trim();
    const reasons = (params.reasons || [])
        .map((r) => String(r || '').trim())
        .filter(Boolean);
    const openUrl = String(params.openApplicationUrl || '').trim();

    /** Amber, matching the Correction Required banner on the Scrubbing tab. */
    const accentColor = '#b45309';

    const noteBlock = noteRaw
        ? `
                <tr>
                  <td style="padding:0 0 22px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#fffbeb;border-left:3px solid #d97706;">
                      <tr>
                        <td style="padding:12px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#52525b;">
                          <strong style="color:#09090b;font-weight:700;">Note from ${escapeHtml(underwriterNameRaw)}:</strong>
                          ${escapeHtml(noteRaw)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
        : '';

    const ctaBlock = openUrl
        ? `
                <tr>
                  <td style="padding:0 0 10px 0;">
                    ${buildStyledCtaButton(openUrl, 'Open Application')}
                  </td>
                </tr>`
        : '';

    const logoBlock = logoSrc
        ? `<img src="${logoSrc}" alt="${brandName}" width="160" height="auto" border="0" style="display:block;width:160px;max-width:160px;height:auto;margin:0 auto;" />`
        : `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#002147;letter-spacing:1px;">${brandName}</div>`;

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Correction Required — ${escapeHtml(businessNameRaw)}</title>
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
                  <td height="12" bgcolor="#3d6fa0" style="height:12px;line-height:12px;font-size:12px;background-color:#3d6fa0;padding:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td height="12" bgcolor="#002147" style="height:12px;line-height:12px;font-size:12px;background-color:#002147;padding:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:10px 45px 28px 45px;background-color:#ffffff;">
              ${logoBlock}
            </td>
          </tr>

          <tr>
            <td class="content-pad" style="padding:0 45px 20px 45px;background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">

                <tr>
                  <td align="center" style="padding:0 0 12px 0;">
                    <h1 style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;line-height:1.2;color:#002147;letter-spacing:0.5px;text-transform:uppercase;">
                      CORRECTION <span style="color:#a1a1aa;font-weight:400;">REQUIRED</span>
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding:0 0 8px 0;">
                    <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${accentColor};">
                      Sent Back To Scrubbing
                    </p>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding:0 0 28px 0;">
                    <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.4;color:#52525b;">
                      This deal needs corrections before it can be underwritten.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 12px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:1.4;color:#09090b;">
                    Hi ${escapeHtml(scrubberNameRaw)},
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#52525b;">
                    <strong style="color:#09090b;font-weight:700;">${escapeHtml(underwriterNameRaw)}</strong> has sent application
                    <strong style="color:#09090b;font-weight:700;">#${escapeHtml(applicationNumberRaw)}</strong> for
                    <strong style="color:#09090b;font-weight:700;">&apos;${escapeHtml(businessNameRaw)}&apos;</strong>
                    back for correction.
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 22px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#52525b;">
                    The deal is back in your Claimed list and is not being underwritten until you resend it. Correct it and recommend it again — it goes straight back to ${escapeHtml(underwriterNameRaw)}.
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 0 10px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#002147;letter-spacing:0.5px;text-transform:uppercase;">
                    Application Details
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 22px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;">
                      ${detailRow('Application', `#${applicationNumberRaw}`)}
                      ${detailRow('Business', businessNameRaw)}
                      ${detailRow('Returned by', underwriterNameRaw)}
                      ${detailRow('Status', 'Awaiting correction', {
                          last: true,
                          valueColor: accentColor,
                      })}
                    </table>
                  </td>
                </tr>

                ${renderReasonList(reasons)}

                ${noteBlock}

                ${ctaBlock}

                <tr>
                  <td style="padding:12px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#71717a;">
                    This message is for internal underwriting use only. It is not a notice to the ISO or merchant.
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 45px 20px 45px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#52525b;background-color:#ffffff;">
              Best Regards,<br/>${brandName} Team
            </td>
          </tr>

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
