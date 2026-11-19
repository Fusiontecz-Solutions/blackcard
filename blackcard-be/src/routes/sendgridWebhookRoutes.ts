import { Router } from 'express';
import { handleSendGridWebhook } from '../controllers/sendgridWebhook.controller';

const router = Router();

/**
 * SendGrid Event Webhook receiver — PUBLIC (no JWT). Configure this URL in the
 * SendGrid dashboard (Settings -> Mail Settings -> Event Webhook):
 *   {SENDGRID_WEBHOOK_URL}/sendgrid/webhook
 *
 * A GET is exposed only so the endpoint can be eyeballed / health-checked in a
 * browser; SendGrid always delivers events via POST.
 */
router.post('/webhook', handleSendGridWebhook);
router.get('/webhook', (_req, res) => {
  res.status(200).json({ success: true, message: 'SendGrid event webhook is live' });
});

export default router;
