/**
 * Mail Log entry for an email the CRM sent about a deal.
 *
 * The deal's Mail Log tab lists activity-log rows with category COMMUNICATION
 * (written by recordCommunicationAudit). Only a few senders wrote one, so most
 * automatic deal emails never showed up. Senders call this after the send with
 * the real outcome. It never throws: a logging failure must not break a send.
 */
import type { AuthenticatedUser } from './applicationService';
import type { CommunicationRecipientType } from './outboundCommunicationService';
import { recordCommunicationAudit } from './systemActivityLogService';

export type DealMailLogInput = {
    applicationId: string | null | undefined;
    to: string | string[];
    cc?: string | string[] | null;
    subject: string;
    html?: string | null;
    /** Short template key, e.g. 'scrubber-recommendation', 'return-to-scrubber'. */
    template: string;
    /** Heading shown in the Mail Log, e.g. 'Scrubber recommendation'. */
    templateName: string;
    recipientType?: CommunicationRecipientType;
    /** Activity line, e.g. 'Recommend Decline email sent to the submissions inbox.' */
    description: string;
    sent: boolean;
    via?: string | null;
    error?: unknown;
    user?: AuthenticatedUser | null;
};

const toList = (value: string | string[] | null | undefined): string[] =>
    (Array.isArray(value) ? value : value ? [value] : [])
        .map((v) => String(v || '').trim())
        .filter(Boolean);

export async function logDealEmail(input: DealMailLogInput): Promise<void> {
    const applicationId = String(input.applicationId || '').trim();
    const to = toList(input.to);
    if (!applicationId || to.length === 0) return;

    const status = input.sent ? 'sent' : 'failed';
    const errorMessage =
        input.error instanceof Error ? input.error.message : input.error ? String(input.error) : undefined;

    try {
        await recordCommunicationAudit(null, {
            applicationId,
            channel: 'EMAIL',
            recipientType: input.recipientType ?? 'OTHER',
            recipient: to.join(', '),
            subject: input.subject,
            body: input.html ?? null,
            templateName: input.templateName,
            actionType: input.sent ? 'EMAIL_SENT' : 'EMAIL_FAILED',
            actionDescription: input.description,
            user: input.user ?? null,
            metadata: {
                template: input.template,
                emailSentTo: to,
                ccEmails: toList(input.cc),
                via: input.via ?? undefined,
                status,
                ...(errorMessage ? { error: errorMessage } : {}),
                delivery: { status, sentAt: new Date().toISOString() },
            },
        });
    } catch (logError) {
        console.error('[deal-mail-log] failed to record', input.template, applicationId, logError);
    }
}
