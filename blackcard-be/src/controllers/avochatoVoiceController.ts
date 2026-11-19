import type { Request, Response } from 'express';
import {
  isAvochatoVoiceConfigured,
  requestAvochatoCallToken,
} from '../services/avochatoVoiceService';

export async function getAvochatoVoiceStatus(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    configured: isAvochatoVoiceConfigured(),
  });
}

export async function postAvochatoCallToken(req: Request, res: Response): Promise<void> {
  try {
    const subdomain =
      typeof req.body?.subdomain === 'string' ? req.body.subdomain : undefined;
    const result = await requestAvochatoCallToken({ subdomain });
    if (!result.twilio_token) {
      res.status(502).json({
        success: false,
        message:
          'Avochato did not return a voice token (twilio_token was empty). ' +
          'Confirm voice is enabled for this inbox and API credentials are valid.',
        twilioPayload: result.twilio_payload,
      });
      return;
    }
    res.json({
      success: true,
      twilioToken: result.twilio_token,
      twilioPayload: result.twilio_payload,
    });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
    if (code === 'AVOCHATO_NOT_CONFIGURED') {
      res.status(503).json({
        success: false,
        message: 'Avochato voice is not configured (missing AVOCHATO_AUTH_ID / AVOCHATO_AUTH_SECRET).',
      });
      return;
    }
    const msg = e instanceof Error ? e.message : 'Failed to mint Avochato call token';
    res.status(500).json({ success: false, message: msg });
  }
}
