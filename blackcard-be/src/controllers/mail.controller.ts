import { Request, Response } from 'express';

import { isSendGridConfigured } from '../config/nodemailer';

import { sendTrackedPaymentTemplateMail } from '../services/paymentMailSendService';


/**

 * POST /api/mail/send

 * Send payment template emails via the server mailer (Gmail API sender mailbox, or SendGrid),
 * never the acting user's connected Gmail.

 * When `applicationId` + deal metadata are supplied, the send is tracked end-to-end

 * via SendGrid webhooks (delivered / opened / clicked / bounced).

 */

export async function sendPaymentMail(req: Request, res: Response): Promise<void> {

    try {

        if (!isSendGridConfigured()) {

            res.status(503).json({

                success: false,

                message:

                    'Payment letters require the server mailer. Set GMAIL_SENDER_EMAIL (Gmail API) or SENDGRID_API_KEY and SENDGRID_FROM_EMAIL on the server.',

            });

            return;

        }



        const body = req.body as Record<string, unknown>;

        const to = typeof body.to === 'string' ? body.to.trim() : '';

        const subject = typeof body.subject === 'string' ? body.subject : '';

        const htmlBody = typeof body.body === 'string' ? body.body : '';

        const cc = body.cc as string | string[] | undefined;

        const bcc = body.bcc as string | string[] | undefined;

        const replyTo = typeof body.replyTo === 'string' ? body.replyTo : undefined;



        const applicationId =

            typeof body.applicationId === 'string' ? body.applicationId.trim() : '';

        const dealKey = typeof body.dealKey === 'string' ? body.dealKey.trim() : '';

        const templateName = typeof body.templateName === 'string' ? body.templateName.trim() : '';

        const category = typeof body.category === 'string' ? body.category.trim() : '';

        const attachLetterPdf =
            body.attachLetterPdf === true ||
            body.attachLetterPdf === 'true' ||
            body.attachLetterPdf === 1 ||
            body.attachLetterPdf === '1';
        const letterPdfFilename =
            typeof body.letterPdfFilename === 'string' ? body.letterPdfFilename.trim() : undefined;

        if (!to) {

            res.status(400).json({

                success: false,

                message: 'Recipient (to) is required',

            });

            return;

        }



        if (!htmlBody) {

            res.status(400).json({

                success: false,

                message: 'Email body is required',

            });

            return;

        }



        if (!applicationId) {
            res.status(400).json({
                success: false,
                message:
                    'applicationId, dealKey, templateName, and category are required for tracked template email delivery',
            });
            return;
        }

        if (!dealKey || !templateName || !category) {
            res.status(400).json({
                success: false,
                message: 'dealKey, templateName, and category are required when applicationId is provided',
            });
            return;
        }

        const tracked = await sendTrackedPaymentTemplateMail(req, {
            to,
            subject: subject || '',
            body: htmlBody,
            cc,
            bcc,
            replyTo,
            applicationId,
            dealKey,
            templateName,
            category,
            attachLetterPdf,
            letterPdfFilename,
        });

        if (!tracked.ok) {
            res.status(tracked.status).json({
                success: false,
                message: tracked.message,
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: 'Email sent successfully',
            data: {
                paymentMailLog: tracked.paymentMailLog,
                sgMessageId: tracked.sgMessageId ?? null,
            },
        });
        return;
    } catch (error: any) {

        console.error('Payment mail send error:', error);

        const message = error?.message || 'Failed to send email';
        const creditsExceeded = /credits exceeded/i.test(message);

        res.status(creditsExceeded ? 402 : 500).json({

            success: false,

            message: creditsExceeded
                ? 'SendGrid email credits exceeded. Add credits or upgrade your SendGrid plan, then try again.'
                : message,

        });

    }

}

/**
 * POST /api/mail/letter-pdf
 * Renders the supplied letter/template HTML to a single-page PDF and streams it
 * back as a downloadable attachment. Reuses the same Puppeteer renderer used for
 * email PDF attachments so the download matches what merchants receive.
 */
export async function downloadLetterPdf(req: Request, res: Response): Promise<void> {
    try {
        const body = req.body as Record<string, unknown>;
        const htmlBody = typeof body.body === 'string' ? body.body : '';
        const rawFilename =
            typeof body.filename === 'string' && body.filename.trim()
                ? body.filename.trim()
                : 'letter';

        if (!htmlBody.trim()) {
            res.status(400).json({
                success: false,
                message: 'Template body is required to generate a PDF',
            });
            return;
        }

        const { renderLetterHtmlToPdfBuffer, sanitizeLetterPdfFilename } = await import(
            '../services/pdf/letterHtmlToPdf.service'
        );

        const filename = sanitizeLetterPdfFilename(rawFilename);
        const pdfBuffer = await renderLetterHtmlToPdfBuffer(htmlBody);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.status(200).end(pdfBuffer);
        return;
    } catch (error: any) {
        console.error('Letter PDF download error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate letter PDF',
        });
    }
}

