import axios from 'axios';
import { isAvochatoVoiceConfigured } from './avochatoVoiceService';

/**
 * Avochato REST: tickets, ticket events (SMS + metadata), outbound SMS.
 * @see https://www.avochato.com/docs
 *
 * Uses the same API credentials as voice (`AVOCHATO_AUTH_ID`, `AVOCHATO_AUTH_SECRET`).
 */

const DEFAULT_BASE = 'https://www.avochato.com';

function avochatoBaseUrl(): string {
  const raw = String(process.env.AVOCHATO_API_BASE_URL ?? DEFAULT_BASE).trim();
  return raw.replace(/\/$/, '') || DEFAULT_BASE;
}

function getAuth(): { auth_id: string; auth_secret: string } {
  const auth_id = String(process.env.AVOCHATO_AUTH_ID ?? '').trim();
  const auth_secret = String(process.env.AVOCHATO_AUTH_SECRET ?? '').trim();
  if (!auth_id || !auth_secret) {
    const err = new Error('Avochato is not configured on the server');
    (err as NodeJS.ErrnoException).code = 'AVOCHATO_NOT_CONFIGURED';
    throw err;
  }
  return { auth_id, auth_secret };
}

function subdomainParam(subdomain?: string): Record<string, string> {
  const s = String(subdomain ?? '').trim();
  return s ? { subdomain: s } : {};
}

function unwrapData(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid Avochato response');
  }
  const row = payload as { status?: number; data?: unknown; message?: string };
  if (row.status != null && row.status !== 200) {
    const msg = typeof row.message === 'string' ? row.message : `Avochato API status ${row.status}`;
    throw new Error(msg);
  }
  if (!row.data || typeof row.data !== 'object') {
    return {};
  }
  return row.data as Record<string, unknown>;
}

export { isAvochatoVoiceConfigured as isAvochatoMessagingConfigured };

export async function avochatoListTickets(options: {
  page?: number;
  query?: string;
  subdomain?: string;
}): Promise<Record<string, unknown>> {
  const auth = getAuth();
  const res = await axios.get(`${avochatoBaseUrl()}/v1/tickets`, {
    params: {
      ...auth,
      page: options.page ?? 1,
      ...(options.query ? { query: options.query } : {}),
      ...subdomainParam(options.subdomain),
    },
    timeout: 30_000,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    throw new Error(`Avochato HTTP ${res.status}`);
  }
  return unwrapData(res.data);
}

export async function avochatoGetContactsByIds(options: {
  ids: string[];
  subdomain?: string;
}): Promise<Record<string, unknown>> {
  const ids = options.ids.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length === 0) {
    return { contacts: [] };
  }
  const auth = getAuth();
  const encoded = encodeURIComponent(ids.join(','));
  const res = await axios.get(`${avochatoBaseUrl()}/v1/contacts/${encoded}`, {
    params: {
      ...auth,
      page: 1,
      ...subdomainParam(options.subdomain),
    },
    timeout: 30_000,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    throw new Error(`Avochato HTTP ${res.status}`);
  }
  return unwrapData(res.data);
}

export type AvochatoTicketEvent = Record<string, unknown>;

export async function avochatoListTicketEventsPage(options: {
  ticketId: string;
  page?: number;
  subdomain?: string;
}): Promise<{ events: AvochatoTicketEvent[]; page: number }> {
  const ticketId = String(options.ticketId ?? '').trim();
  if (!ticketId) {
    throw new Error('ticketId is required');
  }
  const auth = getAuth();
  const res = await axios.get(`${avochatoBaseUrl()}/v1/tickets/${encodeURIComponent(ticketId)}/events`, {
    params: {
      ...auth,
      page: options.page ?? 1,
      ...subdomainParam(options.subdomain),
    },
    timeout: 30_000,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    throw new Error(`Avochato HTTP ${res.status}`);
  }
  const root = res.data as { page?: number; data?: unknown };
  const data = unwrapData(res.data);
  const events = Array.isArray(data.events) ? (data.events as AvochatoTicketEvent[]) : [];
  const page = typeof root.page === 'number' ? root.page : options.page ?? 1;
  return { events, page };
}

/** Pull every events page Avochato returns for a ticket (bounded). */
export async function avochatoCollectTicketEvents(options: {
  ticketId: string;
  subdomain?: string;
  maxPages?: number;
}): Promise<AvochatoTicketEvent[]> {
  const maxPages = options.maxPages ?? 60;
  const merged: AvochatoTicketEvent[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const { events } = await avochatoListTicketEventsPage({
      ticketId: options.ticketId,
      page,
      subdomain: options.subdomain,
    });
    if (!events.length) break;
    merged.push(...events);
  }
  merged.sort((a, b) => {
    const ta = Number(a.sent_at ?? a.created_at ?? 0);
    const tb = Number(b.sent_at ?? b.created_at ?? 0);
    return ta - tb;
  });
  return merged;
}

export async function avochatoSendSms(options: {
  phone: string;
  message: string;
  subdomain?: string;
  markAddressed?: boolean;
}): Promise<Record<string, unknown>> {
  const phone = String(options.phone ?? '').trim();
  const message = String(options.message ?? '').trim();
  if (!phone) throw new Error('phone is required');
  if (!message) throw new Error('message is required');
  if (message.length > 1600) throw new Error('message exceeds 1600 characters');

  const auth = getAuth();
  const body: Record<string, string> = {
    ...auth,
    phone,
    message,
    mark_addressed: options.markAddressed === false ? 'false' : 'true',
    ...subdomainParam(options.subdomain),
  };

  const res = await axios.post(`${avochatoBaseUrl()}/v1/messages`, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    throw new Error(`Avochato HTTP ${res.status}`);
  }
  return unwrapData(res.data);
}
