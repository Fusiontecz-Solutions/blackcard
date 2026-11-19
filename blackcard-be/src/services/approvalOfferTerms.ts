/**
 * Approved amount and offer terms shown in the first ISO approval email. Both approval templates (server and CRM frontend) carry an
 * HTML-comment placeholder; it is swapped for the block here, or left as an
 * invisible comment when the deal has no saved offer.
 */
import prisma from '../config/prismaClient';

export const APPROVAL_OFFER_TERMS_PLACEHOLDER = '<!--__APPROVAL_OFFER_TERMS__-->';

const money = (n: number | null): string =>
    n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const toNumber = (value: unknown): number | null => {
    if (value == null || value === '') return null;
    const n = Number(String(value));
    return Number.isFinite(n) ? n : null;
};

/**
 * Approved amount + offer terms for the green card of the ISO approval email:
 * "APPROVED AMOUNT", the amount, then Factor / Term / Frequency / Payment /
 * Payback in one row. '' when the deal has no saved offer amount.
 */
export async function buildApprovalOfferTermsHtml(applicationId: string): Promise<string> {
    const offer = await prisma.offerDecision.findUnique({
        where: { applicationId },
        select: {
            offer: true,
            rate: true,
            term: true,
            frequency: true,
            repayPerPeriod: true,
            monthlyPayment: true,
            totalRemit: true,
        },
    });
    const amount = toNumber(offer?.offer);
    if (!offer || amount == null || amount <= 0) return '';

    const rate = toNumber(offer.rate);
    const terms: Array<[string, string]> = [
        ['FACTOR', rate != null && rate > 0 ? String(rate) : '—'],
        ['TERM', String(offer.term ?? '').trim() || '—'],
        ['FREQUENCY', String(offer.frequency ?? '').trim() || '—'],
        ['PAYMENT', money(toNumber(offer.repayPerPeriod) ?? toNumber(offer.monthlyPayment))],
        ['PAYBACK', money(toNumber(offer.totalRemit))],
    ];
    const cells = terms
        .map(([label, value], i) => {
            const divider = i < terms.length - 1 ? 'border-right:1px solid #C6E8D4;' : '';
            return `
                  <td width="20%" align="center" style="padding:10px 2px;border-top:1px solid #C6E8D4;border-bottom:1px solid #C6E8D4;${divider}">
                    <div style="font-size:10px;letter-spacing:0.8px;color:#3F7A5C;">${label}</div>
                    <div style="font-size:15px;font-weight:700;color:#0B3D26;margin-top:3px;">${escapeHtml(value)}</div>
                  </td>`;
        })
        .join('');

    return `<div style="font-size:11px;font-weight:600;letter-spacing:1.5px;color:#3F7A5C;">APPROVED AMOUNT</div>
              <div style="font-size:30px;font-weight:800;color:#0B3D26;margin:4px 0 12px 0;line-height:1.1;">${escapeHtml(money(amount))}</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>${cells}
                </tr>
              </table>`;
}

/** Swap the placeholder for the terms block (no-op when either is missing). */
export function fillApprovalOfferTerms(html: string, termsHtml: string): string {
    if (!termsHtml) return html;
    return String(html || '').split(APPROVAL_OFFER_TERMS_PLACEHOLDER).join(termsHtml);
}
