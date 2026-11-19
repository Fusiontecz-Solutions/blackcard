import crypto from 'crypto';
import { BOLDSIGN_WEBHOOK_SECRET } from './boldsign-client';

/**
 * Verify BoldSign webhook signature.
 * BoldSign sends an HMAC-SHA256 signature in the `boldsignsignature` header.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
): boolean {
  if (!BOLDSIGN_WEBHOOK_SECRET) {
    console.warn('BOLDSIGN_WEBHOOK_SECRET not set – skipping signature verification');
    return true; // pass-through when secret is not configured
  }

  const expected = crypto
    .createHmac('sha256', BOLDSIGN_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex'),
  );
}

// ─── Map BoldSign webhook event types to internal status strings ──────────────
export type BoldSignEventType =
  | 'Sent'
  | 'Viewed'
  | 'Signed'
  | 'Completed'
  | 'Declined'
  | 'Revoked'
  | 'Expired'
  | 'Reassigned'
  | 'AuthenticationFailed';

const EVENT_TO_STATUS: Record<string, string> = {
  Sent: 'sent',
  Viewed: 'viewed',
  Signed: 'signed',
  Completed: 'completed',
  Declined: 'declined',
  Revoked: 'revoked',
  Expired: 'expired',
  Reassigned: 'reassigned',
  AuthenticationFailed: 'authentication_failed',
};

export function mapEventToStatus(event: string): string {
  return EVENT_TO_STATUS[event] || event.toLowerCase();
}

/** BoldSign `data.status` / `document.status` values (e.g. Completed, InProgress). */
export function mapBoldSignDocumentApiStatus(status: unknown): string | null {
  if (status == null || typeof status !== 'string') return null;
  const k = status.trim().toLowerCase().replace(/\s+/g, '');
  const map: Record<string, string> = {
    draft: 'draft',
    inprogress: 'sent',
    awaiting: 'sent',
    sent: 'sent',
    viewed: 'viewed',
    partiallycompleted: 'signed',
    completed: 'completed',
    declined: 'declined',
    revoked: 'revoked',
    expired: 'expired',
  };
  return map[k] ?? null;
}

const INTERNAL_ENVELOPE_STATUS_RANK: Record<string, number> = {
  draft: 0,
  sent: 1,
  viewed: 2,
  signed: 3,
  reassigned: 2,
  authentication_failed: 2,
  declined: 40,
  revoked: 40,
  expired: 40,
  completed: 100,
};

function pickRicherInternalEnvelopeStatus(
  a: string | null,
  b: string | null,
): string | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const ra = INTERNAL_ENVELOPE_STATUS_RANK[a] ?? 0;
  const rb = INTERNAL_ENVELOPE_STATUS_RANK[b] ?? 0;
  return ra >= rb ? a : b;
}

/**
 * Combine BoldSign document status with webhook event type so a late
 * `Viewed` event does not overwrite `Completed` from `data.status`.
 */
export function resolveBoldSignWebhookEnvelopeStatus(body: any): string | null {
  if (!body?.event?.eventType) return null;
  const fromDoc =
    mapBoldSignDocumentApiStatus(body.data?.status) ??
    mapBoldSignDocumentApiStatus(body.document?.status);
  const fromEvent = mapEventToStatus(String(body.event.eventType));
  return pickRicherInternalEnvelopeStatus(fromDoc, fromEvent);
}

/** Keep the furthest lifecycle state when merging with an existing DB row. */
export function mergeWithExistingEnvelopeStatus(
  existing: string | null | undefined,
  incoming: string | null,
): string | null {
  const normalized = existing
    ? String(existing).trim().toLowerCase()
    : null;
  return pickRicherInternalEnvelopeStatus(normalized, incoming);
}

/**
 * Parse the raw webhook body into a structured event.
 * BoldSign webhook payload shape:
 * {
 *   "event": { "eventType": "Completed" },
 *   "data": { "documentId": "xxx", ... }
 * }
 */
export interface BoldSignWebhookPayload {
  event: {
    eventType: BoldSignEventType;
    eventUtcTimestamp?: string;
  };
  data: {
    documentId: string;
    senderDetail?: { name: string; emailAddress: string };
    signerDetails?: Array<{
      signerName: string;
      signerEmail: string;
      status: string;
      signedDate?: string;
      declineReason?: string;
    }>;
    ccDetails?: Array<{ emailAddress: string }>;
    [key: string]: any;
  };
}

export function parseWebhookPayload(body: any): BoldSignWebhookPayload | null {
  if (!body || !body.event || !body.data) return null;
  return body as BoldSignWebhookPayload;
}
