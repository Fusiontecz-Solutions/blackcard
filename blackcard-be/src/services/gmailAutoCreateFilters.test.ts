import { evaluateGmailAutoCreateSkip, extractNewestReplyPart } from './gmailAutoCreateFilters';

const DECLINE =
    '<div>Hi,</div><div>Thank you for the submission. Unfortunately we are unable to approve it at this time.</div>';
const APPROVAL =
    '<div>Great news — ACME LLC has been pre-approved by our underwriting team. Click below to calculate your approval.</div>';

function evalBody(bodyText: string) {
    return evaluateGmailAutoCreateSkip({
        fromEmail: 'iso@broker.com',
        mailboxEmail: 'submissions@crm.com',
        subject: 'RE: ACME LLC',
        pdfCount: 3,
        pdfFilenames: ['app.pdf', 'bank1.pdf', 'bank2.pdf'],
        bodyText,
    });
}

describe('extractNewestReplyPart / crm_template skip', () => {
    it('still skips the CRM decline email itself', () => {
        const d = evalBody(DECLINE);
        expect(d.skip).toBe(true);
        expect(d.skip && d.reason).toBe('crm_template');
    });

    it('still skips the CRM approval email itself', () => {
        expect(evalBody(APPROVAL).skip).toBe(true);
    });

    it('does not skip an ISO reply above a quoted CRM decline (Gmail quote)', () => {
        const body = `<div dir="ltr">Please reconsider, attached 3 more months.</div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Mon, Oct 12, 2026 at 9:00 AM CRM &lt;crm@crm.com&gt; wrote:<br></div><blockquote class="gmail_quote">${DECLINE}</blockquote></div>`;
        expect(extractNewestReplyPart(body)).not.toMatch(/unable to approve/);
        expect(evalBody(body).skip).toBe(false);
    });

    it('does not skip an ISO reply above a quoted CRM approval (bare blockquote)', () => {
        const body = `<p>Here are the stips for the approval.</p><blockquote type="cite">${APPROVAL}<blockquote>older</blockquote></blockquote><p>Thanks, Bob</p>`;
        const newest = extractNewestReplyPart(body);
        expect(newest).toMatch(/stips/);
        expect(newest).toMatch(/Thanks, Bob/);
        expect(evalBody(body).skip).toBe(false);
    });

    it('does not skip an Apple-style "On … wrote:" plain reply', () => {
        const body = `New deal attached.\n\nOn Oct 12, 2026, at 9:00 AM, CRM Team <crm@crm.com>\nwrote:\n\n${DECLINE}`;
        expect(evalBody(body).skip).toBe(false);
    });

    it('does not skip an Outlook-style quote (divRplyFwdMsg / stopSpelling / header block)', () => {
        const outlookDiv = `<div>Resubmitting with corrected app.</div><hr style="display:inline-block" id="stopSpelling"><div id="divRplyFwdMsg"><b>From:</b> CRM<br><b>Sent:</b> Monday<br></div>${APPROVAL}`;
        expect(evalBody(outlookDiv).skip).toBe(false);

        const original = `Resubmitting.\r\n\r\n-----Original Message-----\r\nFrom: CRM\r\nSent: Monday\r\n${DECLINE}`;
        expect(evalBody(original).skip).toBe(false);

        const header = `<p>Resubmitting.</p><p><b>From:</b> CRM Team &lt;crm@crm.com&gt;<br><b>Sent:</b> Monday, October 12, 2026<br><b>Subject:</b> ACME</p>${DECLINE}`;
        expect(evalBody(header).skip).toBe(false);
    });

    it('does not skip a plain-text ">" quote', () => {
        const body = `Updated statements attached.\n\n> Thank you for the submission.\n> Unfortunately we are unable to approve it at this time.\n`;
        const newest = extractNewestReplyPart(body);
        expect(newest).toMatch(/Updated statements/);
        expect(newest).not.toMatch(/unable/);
        expect(evalBody(body).skip).toBe(false);
    });

    it('does not skip a forwarded message containing the template', () => {
        const body = `<div>FYI new file for this merchant</div><div>---------- Forwarded message ---------<br>From: CRM &lt;crm@crm.com&gt;<br>Date: Mon</div>${DECLINE}`;
        expect(evalBody(body).skip).toBe(false);
    });

    it('keeps a template phrase written above the quote', () => {
        const body = `<div>Correction required on the app.</div><blockquote>older text</blockquote>`;
        expect(evalBody(body).skip).toBe(true);
    });

    it('skips mail sent by the connected mailbox itself', () => {
        const d = evaluateGmailAutoCreateSkip({
            fromEmail: 'Submissions@CRM.com',
            mailboxEmail: 'submissions@crm.com',
            pdfCount: 3,
        });
        expect(d.skip && d.reason).toBe('self_sent');
    });

    it('does not skip an ISO that put its own address in To', () => {
        const d = evaluateGmailAutoCreateSkip({
            fromEmail: 'iso@broker.com',
            mailboxEmail: 'submissions@crm.com',
            subject: 'Fwd: NEW SUB - ACME LLC',
            pdfCount: 5,
            pdfFilenames: ['app.pdf', 'b1.pdf', 'b2.pdf', 'b3.pdf', 'b4.pdf'],
        });
        expect(d.skip).toBe(false);
    });
});

describe('DocuSign rule', () => {
    const base = { mailboxEmail: 'submissions@crm.com', pdfCount: 5 };

    it('skips mail from @docusign.net', () => {
        const d = evaluateGmailAutoCreateSkip({ ...base, fromEmail: 'dse_na4@docusign.net', subject: 'Please sign', pdfCount: 1 });
        expect(d.skip && d.reason).toBe('docusign_or_esign');
    });

    it('skips a subject that starts with "Completed:"', () => {
        const d = evaluateGmailAutoCreateSkip({ ...base, fromEmail: 'iso@broker.com', subject: 'Completed: BLACKCARD FUNDING LLC: ACME $5,000.00' });
        expect(d.skip && d.reason).toBe('docusign_or_esign');
    });

    it('does not skip an ISO submission whose application PDF is named DocuSign', () => {
        const d = evaluateGmailAutoCreateSkip({
            ...base,
            fromEmail: 'josh@skyadvance.biz',
            subject: 'New Deal: B&T Logistics',
            pdfFilenames: ['Complete_with_DocuSign_Sky_Advance_App.pdf', 'b1.pdf', 'b2.pdf', 'b3.pdf', 'b4.pdf'],
        });
        expect(d.skip).toBe(false);
    });

    it('does not skip when DocuSign only appears in the quoted body', () => {
        const d = evaluateGmailAutoCreateSkip({
            ...base,
            fromEmail: 'leo@alliancecapitals.biz',
            senderEmails: ['dse_na4@docusign.net'],
            subject: 'Fwd: New Deal : Madrid Fence & Stain',
        });
        expect(d.skip).toBe(false);
    });
});
