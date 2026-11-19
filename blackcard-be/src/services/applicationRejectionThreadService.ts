/**
 * Thin compatibility layer for decline / rejection callers.
 * Thread resolution + Gmail send live in `applicationGmailThreadMailService`.
 */
export {
    buildReplySubject,
    resolveApplicationSubmissionThreadContext,
    resolveIsoSubmissionEmailThreadContext,
    resolveStoredGmailMessageId,
    preserveGmailMessageNoteMarker,
    trySendOnApplicationSubmissionThread,
    type ApplicationSubmissionMailSource,
    type ApplicationSubmissionThreadContext,
} from './applicationGmailThreadMailService';

/** Legacy name used by rejectApplication controller. */
export type { ApplicationSubmissionThreadContext as IsoSubmissionEmailThreadContext } from './applicationGmailThreadMailService';

export function buildApplicationRejectionEmailSubject(
    businessName?: string | null,
): string {
    const business = String(businessName || '').trim();
    return business ? `Application Rejected — ${business}` : 'Application Rejected';
}
