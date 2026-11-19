import {
    APP_COMPANY_NAME,
} from './applicationApprovalEmailShared';

const EMAIL_WIDTH = 600;
const SCRUBBER_RECOMMEND_DECLINE_REASON =
    'Scrubber recommended decline — pending underwriting review';

export type ScrubberRecommendationKind = 'Recommend Approval' | 'Recommend Decline';

export type ScrubberUwOfferSummary = {
    approvedAmount?: string;
    factorRate?: string;
    term?: string;
    frequency?: string;
    payback?: string;
    repay?: string;
};

export type ScrubberUwEmailParams = {
    recommendation: ScrubberRecommendationKind;
    underwriterName: string;
    applicationNumber: string;
    businessName: string;
    isoName: string;
    openApplicationUrl?: string;
    attachmentNames?: string[];
    offer?: ScrubberUwOfferSummary | null;
    declineReason?: string;
    /** True when the scrubber is resending a deal the underwriter returned for correction. */
    isCorrection?: boolean;
    /** The underwriter's original correction note, echoed back so they see it was addressed. */
    correctionNote?: string | null;
    brandName?: string;
    logoUrl?: string;
    /** 'underwriter' = the underwriter's decision, sent to subs@ for Super Admin. */
    stage?: 'scrubber' | 'underwriter';
    /** Underwriter who decided (underwriter stage). */
    deciderName?: string | null;
};

/** Wording that differs between the scrubber recommendation and the underwriter decision. */
function stageCopy(params: ScrubberUwEmailParams, approve: boolean) {
    const decider = escapeHtml(String(params.deciderName || '').trim()) || 'The underwriter';
    if (params.stage === 'underwriter') {
        return {
            title: approve ? 'Underwriter Approved' : 'Underwriter Declined',
            pill: approve ? 'UNDERWRITER APPROVED' : 'UNDERWRITER DECLINED',
            heading: 'Final Decision Required',
            subheading: 'An underwriter decision is ready for Super Admin review.',
            introLead: `<strong>${decider}</strong> has reviewed application`,
            introVerb: approve ? 'approved' : 'declined',
            introTail: ' it',
            next: approve
                ? 'Please review the offer summary and attached documents, then approve or decline the deal in the CRM. Nothing has been sent to the ISO yet.'
                : 'Please review the reasons and attached documents, then make the final decision in the CRM. Nothing has been sent to the ISO yet.',
            offerLabel: 'APPROVED OFFER',
            pendingNote: 'Awaiting Super Admin decision',
            preheaderTail: approve ? 'was approved by the underwriter' : 'was declined by the underwriter',
            footerNote: 'For internal use only. Nothing has been sent to the ISO or merchant.',
        };
    }
    return {
        title: approve ? 'Recommend Approval' : 'Recommend Decline',
        pill: approve ? 'RECOMMENDED FOR APPROVAL' : 'RECOMMENDED FOR DECLINE',
        heading: 'Underwriting Review Required',
        subheading: 'A scrubber recommendation is ready for your decision.',
        introLead: 'The scrubber team has completed the initial review of application',
        introVerb: approve ? 'approval' : 'decline',
        introTail: '',
        next: approve
            ? 'Please review the offer summary, attached documents, and offer screenshot below, then complete your underwriting decision in the CRM.'
            : 'Please review the attached documents and complete your underwriting decision in the CRM.',
        offerLabel: 'RECOMMENDED OFFER',
        pendingNote: 'Pending review, not final',
        preheaderTail: approve ? 'is recommended for approval' : 'is recommended for decline. Pending underwriting review',
        footerNote: approve
            ? 'This is an internal notification. Please do not forward outside the organization.'
            : 'For internal underwriting use only. This is not a decline notice to the ISO or merchant.',
    };
}

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

export function buildScrubberRecommendationUwEmailSubject(
    recommendation: ScrubberRecommendationKind,
    businessName?: string | null,
    isCorrection?: boolean,
): string {
    const business = String(businessName || '').trim();
    const action =
        recommendation === 'Recommend Approval' ? 'Recommend Approval' : 'Recommend Decline';
    const prefix = isCorrection
        ? 'Underwriting Review Required — Corrected'
        : 'Underwriting Review Required';
    return business
        ? `${prefix} — ${action} — ${business}`
        : `${prefix} — ${action}`;
}

/**
 * Scrubber → underwriter recommendation email (approval or decline).
 * Internal underwriting notice — not ISO/merchant facing.
 */
/**
 * Recommend Approval email (Blackcard design): status pill, offer hero with the
 * five offer terms, application details, attachment chips and a Review in CRM
 * button. Every value comes from the deal; a missing value shows as an em dash.
 */
function renderRecommendApprovalEmailHtml(params: ScrubberUwEmailParams): string {
    const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";
    const dash = (value?: string | null) => {
        const v = String(value ?? '').trim();
        return escapeHtml(v || '—');
    };
    // Header/footer add "FUNDING" themselves, so drop it from the name if present.
    const brandRaw =
        String(params.brandName || APP_COMPANY_NAME)
            .trim()
            .replace(/\s+funding$/i, '') || 'Black Card';
    const applicationNumber = dash(params.applicationNumber);
    const businessName = dash(params.businessName);
    const isoName = dash(params.isoName);
    const offer = params.offer || {};
    const amount = dash(offer.approvedAmount);
    const openUrl = String(params.openApplicationUrl || '').trim();
    const attachmentNames = (params.attachmentNames || [])
        .map((n) => String(n || '').trim())
        .filter(Boolean);
    const correctionNote = String(params.correctionNote || '').trim();
    const copy = stageCopy(params, true);

    const terms: Array<[string, string]> = [
        ['FACTOR', dash(offer.factorRate)],
        ['TERM', dash(offer.term)],
        ['FREQUENCY', dash(offer.frequency)],
        ['PAYMENT', dash(offer.repay)],
        ['PAYBACK', dash(offer.payback)],
    ];
    const termCells = terms
        .map(([label, value], i) => {
            const divider = i < terms.length - 1 ? 'border-right:1px solid #C6E8D4;' : '';
            return `
                  <td width="20%" align="center" style="padding:10px 2px 0 2px;border-top:1px solid #C6E8D4;${divider}">
                    <div style="font-size:10px;letter-spacing:0.8px;color:#3F7A5C;">${label}</div>
                    <div style="font-size:15px;font-weight:700;color:#0B3D26;margin-top:3px;">${value}</div>
                  </td>`;
        })
        .join('');

    const detailRows: Array<[string, string]> = [
        ['Application', `#${applicationNumber}`],
        ['Business', businessName],
        ['ISO', isoName],
    ];
    const details = detailRows
        .map(([label, value], i) => {
            const border = i < detailRows.length - 1 ? 'border-bottom:1px solid #E3E8EF;' : '';
            return `
          <tr>
            <td style="padding:8px 16px;font-size:14px;color:#5B6B82;${border}">${label}</td>
            <td align="right" style="padding:8px 16px;font-size:14px;font-weight:600;color:#0B1F3A;${border}">${value}</td>
          </tr>`;
        })
        .join('');

    const attachmentChips = attachmentNames.length
        ? `
    <tr>
      <td style="background-color:#FFFFFF;padding:22px 40px 0 40px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#0B1F3A;margin-bottom:8px;">ATTACHED DOCUMENTS</div>
        ${attachmentNames
            .map(
                (name) =>
                    `<span style="display:inline-block;background-color:#F7F9FB;border:1px solid #E3E8EF;border-radius:6px;padding:6px 10px;margin:0 6px 6px 0;font-size:13px;color:#2B3A4F;">&#128206; ${escapeHtml(name)}</span>`,
            )
            .join('')}
      </td>
    </tr>`
        : '';

    const correctionBlock = params.isCorrection
        ? `
    <tr>
      <td style="background-color:#FFFFFF;padding:16px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF7E6;border:1px solid #F3D9A4;border-radius:10px;">
          <tr><td style="padding:12px 16px;font-size:14px;line-height:1.6;color:#7A4B00;">
            <strong>Corrected after your review request.</strong>${
                correctionNote ? `<br>You asked for: ${escapeHtml(correctionNote)}` : ''
            }
          </td></tr>
        </table>
      </td>
    </tr>`
        : '';

    const cta = openUrl
        ? `
    <tr>
      <td align="center" style="background-color:#FFFFFF;padding:32px 40px 36px 40px;border-radius:0 0 12px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="background-color:#0B1F3A;border-radius:8px;">
              <a href="${escapeHref(openUrl)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">Review in CRM &rarr;</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
        : `
    <tr><td style="background-color:#FFFFFF;padding:0 0 28px 0;border-radius:0 0 12px 12px;">&nbsp;</td></tr>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Underwriting Review – ${copy.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF1F5;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#EEF1F5;">
Application #${applicationNumber} – ${businessName} ${copy.preheaderTail} at ${amount}.
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
            <td style="background-color:#E7F6EE;color:#13804B;font-size:12px;font-weight:700;letter-spacing:1px;padding:7px 14px;border-radius:999px;">
              &#10003;&nbsp; ${copy.pill}
            </td>
          </tr>
        </table>
        <h1 style="margin:18px 0 6px 0;font-size:24px;line-height:1.3;color:#0B1F3A;font-weight:700;">${copy.heading}</h1>
        <p style="margin:0;font-size:15px;color:#5B6B82;">${copy.subheading}</p>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:24px 40px 8px 40px;">
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#2B3A4F;">Hi Team,</p>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#2B3A4F;">
          ${copy.introLead} <strong>#${applicationNumber}</strong> for
          <strong>${businessName}</strong> and ${copy.introTail ? '' : 'recommends '}<strong style="color:#13804B;">${copy.introVerb}</strong>${copy.introTail}.
        </p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#2B3A4F;">
          ${copy.next}
        </p>
      </td>
    </tr>${correctionBlock}
    <tr>
      <td style="background-color:#FFFFFF;padding:22px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#E7F6EE;border:1px solid #BFE6D0;border-radius:10px;">
          <tr>
            <td align="center" style="padding:16px 16px 12px 16px;">
              <div style="font-size:11px;font-weight:600;letter-spacing:1.5px;color:#3F7A5C;">${copy.offerLabel}</div>
              <div style="font-size:30px;font-weight:800;color:#0B3D26;margin-top:4px;line-height:1.1;">${amount}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 12px 14px 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>${termCells}
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:22px 40px 0 40px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#0B1F3A;margin-bottom:8px;">APPLICATION DETAILS</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E3E8EF;border-radius:10px;">${details}
        </table>
      </td>
    </tr>${attachmentChips}${cta}
    <tr>
      <td align="center" style="padding:24px 24px 0 24px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#8A97AA;">
          ${escapeHtml(brandRaw)} Funding &middot; Underwriting Department<br>
          ${copy.footerNote}
        </p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Recommend Decline email (Blackcard design): red status pill, a Decline card
 * with the scrubber's selected reasons as chips, application details,
 * attachment chips and a Review in CRM button. Values all come from the deal.
 */
function renderRecommendDeclineEmailHtml(params: ScrubberUwEmailParams): string {
    const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";
    const dash = (value?: string | null) => {
        const v = String(value ?? '').trim();
        return escapeHtml(v || '—');
    };
    // Header/footer add "FUNDING" themselves, so drop it from the name if present.
    const brandRaw =
        String(params.brandName || APP_COMPANY_NAME)
            .trim()
            .replace(/\s+funding$/i, '') || 'Black Card';
    const applicationNumber = dash(params.applicationNumber);
    const businessName = dash(params.businessName);
    const isoName = dash(params.isoName);
    const openUrl = String(params.openApplicationUrl || '').trim();
    const attachmentNames = (params.attachmentNames || [])
        .map((n) => String(n || '').trim())
        .filter(Boolean);
    const reasons = String(params.declineReason || '')
        .split(';')
        .map((r) => r.trim())
        .filter(Boolean);
    const correctionNote = String(params.correctionNote || '').trim();
    const copy = stageCopy(params, false);

    const reasonChips = reasons
        .map(
            (reason) =>
                `<span style="display:inline-block;background-color:#FFFFFF;border:1px solid #F5C6CC;border-radius:999px;padding:3px 10px;margin:2px;font-size:12px;font-weight:600;color:#7A1522;">${escapeHtml(reason)}</span>`,
        )
        .join('\n              ');

    const detailRows: Array<[string, string]> = [
        ['Application', `#${applicationNumber}`],
        ['Business', businessName],
        ['ISO', isoName],
    ];
    const details = detailRows
        .map(([label, value], i) => {
            const border = i < detailRows.length - 1 ? 'border-bottom:1px solid #E3E8EF;' : '';
            return `
          <tr>
            <td style="padding:8px 16px;font-size:14px;color:#5B6B82;${border}">${label}</td>
            <td align="right" style="padding:8px 16px;font-size:14px;font-weight:600;color:#0B1F3A;${border}">${value}</td>
          </tr>`;
        })
        .join('');

    const attachmentChips = attachmentNames.length
        ? `
    <tr>
      <td style="background-color:#FFFFFF;padding:22px 40px 0 40px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#0B1F3A;margin-bottom:8px;">ATTACHED DOCUMENTS</div>
        ${attachmentNames
            .map(
                (name) =>
                    `<span style="display:inline-block;background-color:#F7F9FB;border:1px solid #E3E8EF;border-radius:6px;padding:6px 10px;margin:0 6px 6px 0;font-size:13px;color:#2B3A4F;">&#128206; ${escapeHtml(name)}</span>`,
            )
            .join('\n        ')}
      </td>
    </tr>`
        : '';

    const correctionBlock = params.isCorrection
        ? `
    <tr>
      <td style="background-color:#FFFFFF;padding:16px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF7E6;border:1px solid #F3D9A4;border-radius:10px;">
          <tr><td style="padding:12px 16px;font-size:14px;line-height:1.6;color:#7A4B00;">
            <strong>Corrected after your review request.</strong>${
                correctionNote ? `<br>You asked for: ${escapeHtml(correctionNote)}` : ''
            }
          </td></tr>
        </table>
      </td>
    </tr>`
        : '';

    const cta = openUrl
        ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="background-color:#0B1F3A;border-radius:8px;">
              <a href="${escapeHref(openUrl)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">Review in CRM &rarr;</a>
            </td>
          </tr>
        </table>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Underwriting Review – ${copy.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF1F5;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#EEF1F5;">
Application #${applicationNumber} – ${businessName} ${copy.preheaderTail}.
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
            <td style="background-color:#FDECEE;color:#B42335;font-size:12px;font-weight:700;letter-spacing:1px;padding:7px 14px;border-radius:999px;">
              &#10005;&nbsp; ${copy.pill}
            </td>
          </tr>
        </table>
        <h1 style="margin:18px 0 6px 0;font-size:24px;line-height:1.3;color:#0B1F3A;font-weight:700;">${copy.heading}</h1>
        <p style="margin:0;font-size:15px;color:#5B6B82;">${copy.subheading}</p>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:24px 40px 8px 40px;">
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#2B3A4F;">Hi Team,</p>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#2B3A4F;">
          ${copy.introLead} <strong>#${applicationNumber}</strong> for
          <strong>${businessName}</strong> and ${copy.introTail ? '' : 'recommends '}<strong style="color:#B42335;">${copy.introVerb}</strong>${copy.introTail}.
        </p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#2B3A4F;">
          ${copy.next}
        </p>
      </td>
    </tr>${correctionBlock}
    <tr>
      <td style="background-color:#FFFFFF;padding:22px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FDECEE;border:1px solid #F5C6CC;border-radius:10px;">
          <tr>
            <td align="center" style="padding:14px 14px 12px 14px;">
              <div style="font-size:24px;font-weight:800;color:#B42335;line-height:1.1;">Decline</div>
              <div style="font-size:12px;color:#9A3B47;margin:4px 0 ${reasons.length ? '10px' : '0'} 0;">${copy.pendingNote}</div>
              ${reasonChips}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;padding:22px 40px 0 40px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#0B1F3A;margin-bottom:8px;">APPLICATION DETAILS</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E3E8EF;border-radius:10px;">${details}
        </table>
      </td>
    </tr>${attachmentChips}
    <tr>
      <td align="center" style="background-color:#FFFFFF;padding:26px 40px 30px 40px;border-radius:0 0 12px 12px;">${cta}
        <p style="margin:22px 0 0 0;font-size:14px;line-height:1.6;color:#2B3A4F;">Best regards,<br><strong>${escapeHtml(brandRaw)} Team</strong></p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:24px 24px 0 24px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#8A97AA;">
          ${escapeHtml(brandRaw)} Funding &middot; Underwriting Department<br>
          ${copy.footerNote}
        </p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Scrubber → underwriter recommendation email (approval or decline).
 * Internal underwriting notice — not ISO/merchant facing.
 */
export function renderScrubberRecommendationUwEmailHtml(params: ScrubberUwEmailParams): string {
    return params.recommendation === 'Recommend Approval'
        ? renderRecommendApprovalEmailHtml(params)
        : renderRecommendDeclineEmailHtml(params);
}

export { SCRUBBER_RECOMMEND_DECLINE_REASON };
