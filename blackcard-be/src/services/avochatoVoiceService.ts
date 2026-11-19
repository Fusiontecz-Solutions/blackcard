import axios from 'axios';

/**
 * Avochato REST API (browser calling uses Twilio-compatible client token).
 * @see https://www.avochato.com/docs — CallTokens → Create Call Token (`POST /v1/calls`)
 *
 * Environment (backend `.env`):
 * - AVOCHATO_AUTH_ID — Settings → API Access
 * - AVOCHATO_AUTH_SECRET
 * - AVOCHATO_API_BASE_URL — optional, default `https://www.avochato.com`
 * - AVOCHATO_SUBDOMAIN — optional default inbox subdomain when API key spans multiple inboxes (or pass `subdomain` in `POST /avochato-voice/call-token`; frontend may set `VITE_AVOCHATO_SUBDOMAIN` for Communication → Calling).
 */

const DEFAULT_BASE = 'https://www.avochato.com';

export type AvochatoCallTokenResult = {
  twilio_token: string | null;
  twilio_payload: Record<string, unknown>;
};

function avochatoBaseUrl(): string {
  const raw = String(process.env.AVOCHATO_API_BASE_URL ?? DEFAULT_BASE).trim();
  return raw.replace(/\/$/, '') || DEFAULT_BASE;
}

export function isAvochatoVoiceConfigured(): boolean {
  return (
    !!String(process.env.AVOCHATO_AUTH_ID ?? '').trim() &&
    !!String(process.env.AVOCHATO_AUTH_SECRET ?? '').trim()
  );
}

export async function requestAvochatoCallToken(options?: {
  /** Overrides `AVOCHATO_SUBDOMAIN` when sent from client for multi-inbox users. */
  subdomain?: string;
}): Promise<AvochatoCallTokenResult> {
  const authId = String(process.env.AVOCHATO_AUTH_ID ?? '').trim();
  const authSecret = String(process.env.AVOCHATO_AUTH_SECRET ?? '').trim();
  if (!authId || !authSecret) {
    const err = new Error('Avochato voice is not configured on the server');
    (err as NodeJS.ErrnoException).code = 'AVOCHATO_NOT_CONFIGURED';
    throw err;
  }

  const envSub = String(process.env.AVOCHATO_SUBDOMAIN ?? '').trim();
  const subdomain = String(options?.subdomain ?? '').trim() || envSub || undefined;

  const body: Record<string, string> = {
    auth_id: authId,
    auth_secret: authSecret,
  };
  if (subdomain) {
    body.subdomain = subdomain;
  }

  const http = await axios.post<{
    status?: number;
    data?: { twilio_token?: string | null; twilio_payload?: Record<string, unknown> };
  }>(`${avochatoBaseUrl()}/v1/calls`, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 25_000,
    validateStatus: () => true,
  });

  if (http.status >= 400) {
    const body = http.data as { message?: string; status?: unknown };
    const detail =
      typeof body?.message === 'string' && body.message.trim() ? `: ${body.message.trim()}` : '';
    const err = new Error(`Avochato HTTP ${http.status}${detail}`);
    (err as NodeJS.ErrnoException).code = 'AVOCHATO_HTTP';
    throw err;
  }

  const data = http.data;
  if (data.status != null && data.status !== 200) {
    const msg =
      typeof (data as { message?: unknown }).message === 'string'
        ? String((data as { message: string }).message).trim()
        : '';
    const err = new Error(
      msg ? `Avochato API error (${data.status}): ${msg}` : `Avochato API error (${data.status})`,
    );
    (err as NodeJS.ErrnoException).code = 'AVOCHATO_HTTP';
    throw err;
  }

  const inner = data?.data ?? {};
  return {
    twilio_token: inner.twilio_token ?? null,
    twilio_payload: (inner.twilio_payload ?? {}) as Record<string, unknown>,
  };
}
