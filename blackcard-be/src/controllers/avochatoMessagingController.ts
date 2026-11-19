import type { Request, Response } from 'express';
import {
  avochatoCollectTicketEvents,
  avochatoGetContactsByIds,
  avochatoListTickets,
  avochatoSendSms,
  isAvochatoMessagingConfigured,
} from '../services/avochatoMessagingService';

export async function getAvochatoMessagingStatus(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    configured: isAvochatoMessagingConfigured(),
  });
}

export async function getAvochatoTickets(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const query = typeof req.query.query === 'string' ? req.query.query : undefined;
    const subdomain = typeof req.query.subdomain === 'string' ? req.query.subdomain : undefined;
    const data = await avochatoListTickets({ page, query, subdomain });
    res.json({ success: true, data });
  } catch (e: unknown) {
    handleAvochatoError(res, e);
  }
}

export async function getAvochatoContacts(req: Request, res: Response): Promise<void> {
  try {
    const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
    const ids = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const subdomain = typeof req.query.subdomain === 'string' ? req.query.subdomain : undefined;
    const data = await avochatoGetContactsByIds({ ids, subdomain });
    res.json({ success: true, data });
  } catch (e: unknown) {
    handleAvochatoError(res, e);
  }
}

export async function getAvochatoTicketConversation(req: Request, res: Response): Promise<void> {
  try {
    const ticketId = String(req.params.ticketId ?? '').trim();
    if (!ticketId) {
      res.status(400).json({ success: false, message: 'ticketId is required' });
      return;
    }
    const subdomain = typeof req.query.subdomain === 'string' ? req.query.subdomain : undefined;
    const events = await avochatoCollectTicketEvents({ ticketId, subdomain });
    res.json({ success: true, data: { events } });
  } catch (e: unknown) {
    handleAvochatoError(res, e);
  }
}

export async function postAvochatoOutboundSms(req: Request, res: Response): Promise<void> {
  try {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone : '';
    const message = typeof req.body?.message === 'string' ? req.body.message : '';
    const subdomain = typeof req.body?.subdomain === 'string' ? req.body.subdomain : undefined;
    const markAddressed = req.body?.markAddressed !== false;
    const data = await avochatoSendSms({ phone, message, subdomain, markAddressed });
    res.json({ success: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to send SMS';
    if (msg.includes('required') || msg.includes('exceeds')) {
      res.status(400).json({ success: false, message: msg });
      return;
    }
    handleAvochatoError(res, e);
  }
}

function handleAvochatoError(res: Response, e: unknown): void {
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
  if (code === 'AVOCHATO_NOT_CONFIGURED') {
    res.status(503).json({
      success: false,
      message: 'Avochato is not configured (missing AVOCHATO_AUTH_ID / AVOCHATO_AUTH_SECRET).',
    });
    return;
  }
  const msg = e instanceof Error ? e.message : 'Avochato request failed';
  res.status(500).json({ success: false, message: msg });
}
