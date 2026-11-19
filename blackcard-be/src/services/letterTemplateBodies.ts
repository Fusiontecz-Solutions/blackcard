/**
 * API-safe copies of the current branded letter layouts used by the CRM.
 * Values stay as merge tokens so SuperAdmin can personalize and send the same
 * templates without depending on the tenant frontend bundle.
 *
 * Palette mirrors the frontend `letterEmailBranding` Black Card defaults.
 */

import { BRAND_DISPLAY_NAME, BRAND_LEGAL_NAME, BRAND_LOGO_URL } from '../constants/brand';

const COLORS = {
  stripLight: '#3d6fa0',
  stripDark: '#002147',
  iconBg: '#002147',
  ink: '#09090b',
  heading: '#09090b',
  body: '#52525b',
  muted: '#71717a',
  border: '#e2e8f0',
  surface: '#ffffff',
  canvas: '#f8fafc',
};

const LOGO_SRC = BRAND_LOGO_URL;
const ICON_SRC = {
  account:
    'https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781791504/Image_5_yhs5j4.png',
  payoff:
    'https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781791504/Image_6_ktsahv.png',
  date: 'https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781791503/Image_7_wo9ohu.png',
  status:
    'https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781791503/Account_Status_Icon_-_White_1_tfndrl.png',
  beneficiary:
    'https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781791504/Account_Number_Icon_1_ieacvs.png',
  note: 'https://res.cloudinary.com/dehrku8og/image/upload/q_auto/f_auto/v1781791503/Note_Icon_1_j4ywhl.png',
};

function documentShell(title: string, content: string): string {
  const logo = LOGO_SRC
    ? `<img src="${LOGO_SRC}" alt="${BRAND_DISPLAY_NAME}" width="160" style="display:block;width:160px;max-width:160px;height:auto;margin:0 auto;" />`
    : `<div style="font-size:18px;font-weight:700;color:${COLORS.stripDark};">${BRAND_DISPLAY_NAME}</div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.canvas};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${COLORS.canvas};">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;border-collapse:collapse;background:${COLORS.surface};border:1px solid ${COLORS.border};">
          <tr><td height="12" bgcolor="${COLORS.stripLight}" style="height:12px;font-size:0;line-height:0;background-color:${COLORS.stripLight};">&nbsp;</td></tr>
          <tr><td height="12" bgcolor="${COLORS.stripDark}" style="height:12px;font-size:0;line-height:0;background-color:${COLORS.stripDark};">&nbsp;</td></tr>
          <tr>
            <td align="center" style="padding:10px 45px 35px;">${logo}</td>
          </tr>
          <tr>
            <td style="padding:0 45px 20px;">${content}</td>
          </tr>
          <tr>
            <td style="padding:16px 45px 10px;">
              <p style="margin:0 0 8px;font-style:italic;color:${COLORS.body};">Sincerely,</p>
              <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-style:italic;color:${COLORS.stripDark};">{{sender_name}}</p>
              <p style="margin:0;font-size:12px;color:${COLORS.muted};">Account Specialist</p>
            </td>
          </tr>
          <tr><td height="12" bgcolor="${COLORS.stripDark}" style="height:12px;font-size:0;line-height:0;background-color:${COLORS.stripDark};">&nbsp;</td></tr>
          <tr><td height="12" bgcolor="${COLORS.stripLight}" style="height:12px;font-size:0;line-height:0;background-color:${COLORS.stripLight};">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

type InfoRowOptions = {
  valueStyle?: string;
  bordered?: boolean;
  labelWidth?: number;
};

function infoRow(
  iconSrc: string,
  label: string,
  value: string,
  options: InfoRowOptions = {},
): string {
  const {
    valueStyle = `font-size:15px;color:${COLORS.body};`,
    bordered = true,
    labelWidth = 160,
  } = options;
  const borderAttr = bordered
    ? ` style="border-bottom:1px solid ${COLORS.border};"`
    : '';
  return `<tr${borderAttr}>
            <td width="50" bgcolor="${COLORS.iconBg}" align="center" style="width:50px;padding:14px 0;background-color:${COLORS.iconBg};vertical-align:middle;line-height:0;font-size:0;">
              <img src="${iconSrc}" alt="" width="28" height="28" style="display:block;width:28px;height:28px;border:0;margin:0 auto;" />
            </td>
            <td width="${labelWidth}" style="width:${labelWidth}px;padding:14px 0 14px 20px;font-size:15px;font-weight:bold;color:${COLORS.ink};">${label}</td>
            <td width="20" align="center" style="width:20px;font-size:15px;font-weight:bold;color:${COLORS.stripDark};">:</td>
            <td style="padding:14px 16px;${valueStyle}">${value}</td>
          </tr>`;
}

function infoTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:8px;overflow:hidden;">
          ${rows}
        </table>`;
}

// Wire Information table: bank (fixed bank address), beneficiary, routing, account.
const PAYMENT_ADDRESS_BLOCK = `
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
            <td width="34%" style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;color:#09090b;vertical-align:top;border-bottom:1px solid #e5e9ef;">{{payment_company_name}}<span style="display:block;padding-top:3px;font-size:11pt;color:#71717a;">2929 E. Commercial Blvd., Ft. Lauderdale, FL, 33308</span></td>
            <td width="16%" style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;font-weight:700;color:#52637a;background-color:#f6f8fa;vertical-align:top;border-bottom:1px solid #e5e9ef;">Routing</td>
            <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;color:#09090b;vertical-align:top;border-bottom:1px solid #e5e9ef;">{{payment_routing_number}}</td>
          </tr>
          <tr>
            <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;font-weight:700;color:#52637a;background-color:#f6f8fa;vertical-align:top;border-bottom:1px solid #e5e9ef;">Beneficiary</td>
            <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;color:#09090b;vertical-align:top;border-bottom:1px solid #e5e9ef;">{{lender_name}}<span style="display:block;padding-top:3px;font-size:11pt;color:#71717a;">{{payment_address_line1}}, {{payment_address_line2}}</span></td>
            <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;font-weight:700;color:#52637a;background-color:#f6f8fa;vertical-align:top;border-bottom:1px solid #e5e9ef;">Account</td>
            <td style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;padding:12px 14px;font-size:11pt;color:#09090b;vertical-align:top;border-bottom:1px solid #e5e9ef;">{{payment_account_number}}</td>
          </tr>
        </table>
      </td>
    </tr>
`;

/**
 * Payoff + Zero Balance letters: shared letterhead layout (logo + date,
 * divider, centered title in the brand colour, blurred logo watermark,
 * details table, sign-off, footer). Mirrors FE `src/pages/templates/letterLayout.ts`.
 */
const PL_FONT = "font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;";
const PL_DARK = '#111827';
const PL_BODY = '#374151';
const PL_MUTED = '#6b7280';
const PL_RULE = '#e5e7eb';
const PL_TITLE = COLORS.stripDark;
const PL_COMPANY_LEGAL = BRAND_LEGAL_NAME;
const PL_COMPANY_SHORT = BRAND_DISPLAY_NAME;
/** Hosted Black Card logo (same default as the frontend email logo). */
const PL_LOGO =
  LOGO_SRC || 'https://res.cloudinary.com/oqok4ng8/image/upload/v1787242509/black_logo.svg';
/** Logo faded (6%) and heavily blurred by Cloudinary — email/PDF clients ignore CSS blur. */
const PL_WATERMARK = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(PL_LOGO)
  ? PL_LOGO.replace('/image/upload/', '/image/upload/o_6,e_blur:800,f_png/')
  : '';
/** Bank address shown under the wire bank name. */
const WIRE_BANK_ADDRESS = '2929 E. Commercial Blvd., Ft. Lauderdale, FL, 33308';

const plStrong = (text: string): string =>
  `<strong style="color:${PL_DARK};font-weight:600;">${text}</strong>`;

const plParagraph = (text: string, bottom: number): string => `
                <tr>
                  <td style="${PL_FONT}padding:0 0 ${bottom}px 0;font-size:13px;line-height:1.6;color:${PL_BODY};">${text}</td>
                </tr>`;

const plDetailsTable = (rows: Array<{ label: string; value: string; subtle?: boolean }>): string => {
  const body = rows
    .map((row, i) => {
      const border = i === rows.length - 1 ? '' : `border-bottom:1px solid ${PL_RULE};`;
      return `
                      <tr>
                        <td width="38%" style="${PL_FONT}width:38%;padding:11px 0;font-size:13px;color:${PL_MUTED};vertical-align:top;${border}">${row.label}</td>
                        <td style="${PL_FONT}padding:11px 0;font-size:${row.subtle ? '12px' : '13px'};font-weight:${row.subtle ? '400' : '600'};color:${row.subtle ? PL_MUTED : PL_DARK};vertical-align:top;${border}">${row.value}</td>
                      </tr>`;
    })
    .join('');
  return `
                <tr>
                  <td style="padding:0 0 24px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;border-top:1px solid ${PL_RULE};border-bottom:1px solid ${PL_RULE};">${body}
                    </table>
                  </td>
                </tr>`;
};

const plWatermarkStyle = PL_WATERMARK
  ? `background-image:url('${PL_WATERMARK}');background-repeat:no-repeat;background-position:center 55%;background-size:70% auto;`
  : '';

const letterheadHtml = (documentTitle: string, heading: string, bodyRows: string): string => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${documentTitle}</title>
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
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;${PL_FONT}-webkit-font-smoothing:antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" data-letter-pdf-card="1" class="letter-container" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 auto;width:100%;max-width:794px;border-collapse:collapse;background-color:#ffffff;">
          <tr>
            <td class="content-pad" style="padding:36px 36px 24px 36px;background-color:#ffffff;${plWatermarkStyle}">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 18px 0;border-bottom:1px solid ${PL_RULE};">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                      <tr>
                        <td valign="middle" style="vertical-align:middle;line-height:0;font-size:0;">
                          <img src="${PL_LOGO}" alt="${PL_COMPANY_SHORT}" width="130" border="0" style="display:block;width:130px;max-width:130px;height:auto;" />
                        </td>
                        <td valign="middle" align="right" style="${PL_FONT}vertical-align:middle;text-align:right;font-size:12px;color:${PL_MUTED};white-space:nowrap;">{{letter_date}}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="${PL_FONT}padding:30px 0 28px 0;text-align:center;font-size:20px;font-weight:600;letter-spacing:4px;color:${PL_TITLE};">${heading}</td>
                </tr>
${bodyRows}
                <tr>
                  <td style="${PL_FONT}padding:0 0 36px 0;font-size:13px;line-height:1.6;color:${PL_BODY};">
                    Best Regards,<br />
                    <strong style="display:inline-block;padding-top:10px;font-weight:600;color:${PL_DARK};">{{sender_name}}</strong><br />
                    <span style="font-size:12px;color:${PL_MUTED};">Account Specialist</span><br />
                    <span style="font-size:12px;color:${PL_MUTED};">${PL_COMPANY_LEGAL}</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="${PL_FONT}padding:14px 0 0 0;border-top:1px solid ${PL_RULE};text-align:center;font-size:11px;color:#9ca3af;">${PL_COMPANY_LEGAL}</td>
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

const PL_WIRE_LABEL = `${PL_FONT}width:17%;padding:12px 14px;font-size:12px;font-weight:600;color:${PL_MUTED};background-color:#f3f4f6;vertical-align:top;border:1px solid ${PL_RULE};`;
const PL_WIRE_VALUE = `${PL_FONT}padding:12px 14px;font-size:13px;font-weight:600;color:${PL_DARK};vertical-align:top;border:1px solid ${PL_RULE};`;
const PL_WIRE_SUB = `display:inline-block;padding-top:3px;font-size:11px;font-weight:400;color:${PL_MUTED};`;

const PAYOFF_LETTER_BODY = letterheadHtml(
  'Payoff Letter',
  'PAYOFF LETTER',
  [
    plParagraph('{{recipient_salutation}},', 14),
    plParagraph(
      `This letter provides the payoff information for ${plStrong('{{account_name}}')}. The payoff amount and wire instructions below are valid through ${plStrong('{{good_through_date}}')}. Payments received after this date may require an updated payoff.`,
      20,
    ),
    plDetailsTable([
      { label: 'Deal ID', value: '{{deal_id}}' },
      { label: 'Merchant Name', value: '{{account_name}}' },
      { label: 'Payoff Amount', value: '{{payoff_amount}}' },
      { label: 'Valid Through', value: '{{good_through_date}}' },
      { label: 'Note', value: '{{note}}', subtle: true },
    ]),
    plParagraph(
      'Please wire the payoff amount to the account below. To avoid additional interest charges, make sure payment is received by the valid-through date.',
      20,
    ),
    `
                <tr>
                  <td style="${PL_FONT}padding:0 0 8px 0;font-size:11px;font-weight:600;letter-spacing:1.5px;color:${PL_MUTED};">WIRE INFORMATION</td>
                </tr>
                <tr>
                  <td style="padding:0 0 32px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;border:1px solid ${PL_RULE};">
                      <tr>
                        <td width="17%" style="${PL_WIRE_LABEL}">Bank</td>
                        <td width="37%" style="${PL_WIRE_VALUE}">{{payment_company_name}}<br /><span style="${PL_WIRE_SUB}">${WIRE_BANK_ADDRESS}</span></td>
                        <td width="17%" style="${PL_WIRE_LABEL}">Routing</td>
                        <td style="${PL_WIRE_VALUE}">{{payment_routing_number}}</td>
                      </tr>
                      <tr>
                        <td style="${PL_WIRE_LABEL}">Beneficiary</td>
                        <td style="${PL_WIRE_VALUE}">{{lender_name}}<br /><span style="${PL_WIRE_SUB}">{{payment_address_line1}}, {{payment_address_line2}}</span></td>
                        <td style="${PL_WIRE_LABEL}">Account</td>
                        <td style="${PL_WIRE_VALUE}">{{payment_account_number}}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`,
  ].join(''),
);

const ZERO_BALANCE_LETTER_BODY = letterheadHtml(
  'Zero Balance Letter',
  'ZERO BALANCE LETTER',
  [
    plParagraph('Dear {{salutation_name}},', 14),
    plParagraph(
      `This letter confirms that ${plStrong('{{account_name}}')} has a balance of ${plStrong('$0.00 (zero dollars)')} with ${PL_COMPANY_LEGAL === PL_COMPANY_SHORT ? PL_COMPANY_LEGAL : `${PL_COMPANY_LEGAL} (&ldquo;${PL_COMPANY_SHORT}&rdquo;)`}.`,
      14,
    ),
    plParagraph(
      `As this balance has been satisfied in full, and pursuant to our agreement, ${PL_COMPANY_SHORT} agrees to release the UCC filing and to reduce the current debt owed to ${PL_COMPANY_SHORT} to $0.00 (zero dollars).`,
      20,
    ),
    plDetailsTable([
      { label: 'Deal ID', value: '{{deal_id}}' },
      { label: 'Merchant Name', value: '{{account_name}}' },
      { label: 'Date of Funding', value: '{{date_of_funding}}' },
      { label: 'Status', value: '{{account_status}}' },
    ]),
    plParagraph(
      'If you have any questions or need any further assistance, please feel free to contact us.',
      32,
    ),
  ].join(''),
);

const PAYOFF_WIRE_INSTRUCTIONS_BODY = documentShell(
  'Payoff Wire Information',
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td align="center" style="padding:0 0 28px;color:${COLORS.stripDark};font-size:28px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">PAYOFF WIRE INFORMATION</td></tr>
    <tr><td style="padding:0 0 14px;color:${COLORS.muted};font-size:13px;">{{letter_date}}</td></tr>
    <tr><td style="padding:0 0 10px;color:${COLORS.heading};font-size:15px;font-weight:700;">{{account_name}}</td></tr>
    <tr><td style="padding:0 0 16px;color:${COLORS.heading};font-size:13px;font-weight:700;">Subject: Payoff Wire Information</td></tr>
    <tr><td style="padding:0 0 22px;color:${COLORS.body};font-size:13px;line-height:1.55;">Please find below the payoff and wiring instructions for your account. Wires received after the valid through date may require updated instructions.</td></tr>
    <tr>
      <td style="padding:0 0 22px;">
        ${infoTable(
          [
            infoRow(ICON_SRC.account, 'Merchant Name', '{{account_name}}', {
              labelWidth: 180,
            }),
            infoRow(ICON_SRC.payoff, 'Payoff Amount', '{{payoff_amount}}', {
              labelWidth: 180,
              valueStyle: `font-size:15px;font-weight:700;color:${COLORS.ink};`,
            }),
            infoRow(ICON_SRC.beneficiary, 'Beneficiary Name', '{{lender_name}}', {
              labelWidth: 180,
            }),
            infoRow(ICON_SRC.date, 'Valid Till', '{{good_through_date}}', {
              labelWidth: 180,
              bordered: false,
            }),
          ].join('\n          '),
        )}
      </td>
    </tr>
    <tr><td style="padding:0 0 24px;color:${COLORS.body};font-size:13px;line-height:1.55;">Please remit the payoff amount to the address below. Ensure payments are received by the good through date to avoid additional interest charges.</td></tr>
    ${PAYMENT_ADDRESS_BLOCK}
  </table>`,
);

const BUILTIN_BODY_BY_ID: Record<string, string> = {
  'builtin:payoff-letter': PAYOFF_LETTER_BODY,
  'builtin:zero-balance-letter': ZERO_BALANCE_LETTER_BODY,
  'builtin:payoff-wire-instructions': PAYOFF_WIRE_INSTRUCTIONS_BODY,
  'builtin-fe:payoff-letter': PAYOFF_LETTER_BODY,
  'builtin-fe:zero-balance-letter': ZERO_BALANCE_LETTER_BODY,
  'builtin-fe:payoff-wire-instructions': PAYOFF_WIRE_INSTRUCTIONS_BODY,
};

export function getBuiltinLetterTemplateBody(id: string): string | null {
  return BUILTIN_BODY_BY_ID[id] ?? null;
}
