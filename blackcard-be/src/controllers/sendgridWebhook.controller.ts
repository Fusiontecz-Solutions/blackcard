import crypto from 'crypto';
import type { Request, Response } from 'express';
import {
  processSendGridEvents,
  type SendGridEvent,
} from '../services/sendgridWebhookService';

const SIGNATURE_HEADER = 'x-twilio-email-event-webhook-signature';
const TIMESTAMP_HEADER = 'x-twilio-email-event-webhook-timestamp';

function isSignatureEnforced(): boolean {
  return String(process.env.SENDGRID_WEBHOOK_ENFORCE_SIGNATURE ?? '')
    .trim()
    .toLowerCase() === 'true';
}

/**
 * Verify the SendGrid "Signed Event Webhook" signature (ECDSA P-256 / SHA-256).
 * The signed payload is `timestamp + rawBody`. Returns:
 *   - 'ok'        signature is valid
 *   - 'invalid'   key configured but signature did not match
 *   - 'skipped'   no verification key configured (dev / unsigned)
 */
function verifySignature(req: Request): 'ok' | 'invalid' | 'skipped' {
  const verificationKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY?.trim();
  if (!verificationKey) return 'skipped';

  const signature = req.header(SIGNATURE_HEADER);
  const timestamp = req.header(TIMESTAMP_HEADER);
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!signature || !timestamp || !rawBody) return 'invalid';

  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(verificationKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const verifier = crypto.createVerify('sha256');
    verifier.update(timestamp);
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, 'base64')) ? 'ok' : 'invalid';
  } catch (err) {
    console.error('[sendgridWebhook] signature verification error:', err);
    return 'invalid';
  }
}

/**
 * POST /api/v1/sendgrid/webhook
 *
 * Public endpoint (no JWT) that ingests the SendGrid Event Webhook batch and
 * updates each message's delivery/open/click status. Always responds 2xx fast
 * (unless signature enforcement rejects) so SendGrid does not retry valid posts.
 */
export async function handleSendGridWebhook(req: Request, res: Response): Promise<void> {
  console.log('=== SENDGRID WEBHOOK HIT ===');
  console.log(req.body);
  console.log(JSON.stringify(req.body, null, 2));

  const verification = verifySignature(req);
  if (verification === 'invalid') {
    if (isSignatureEnforced()) {
      console.warn(
        '[sendgridWebhook] rejected: invalid signature (check SENDGRID_WEBHOOK_VERIFICATION_KEY matches SendGrid dashboard)',
      );
      res.status(403).json({ success: false, message: 'Invalid webhook signature' });
      return;
    }
    console.warn('[sendgridWebhook] webhook received with invalid signature (not enforced)');
  }

  const body = req.body;
  const events: SendGridEvent[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { events?: unknown })?.events)
      ? ((body as { events: SendGridEvent[] }).events)
      : [];

  if (events.length === 0) {
    res.status(200).json({ success: true, received: 0 });
    return;
  }

  // Respond immediately so SendGrid/ngrok never time out (502) while DB work runs.
  res.status(200).json({ success: true, received: events.length, queued: true });

  void processSendGridEvents(events)
    .then((result) => {
      console.log('[sendgridWebhook] processed:', result);
      if (result.unmatched > 0) {
        console.warn('[sendgridWebhook] unmatched events:', result);
      }
    })
    .catch((err) => {
      console.error('[sendgridWebhook] background processing error:', err);
    });
}
