import dotenv from 'dotenv';

dotenv.config();

/** Demo: account-d.docusign.com — Production: account.docusign.com */
export const DOCUSIGN_AUTH_BASE =
  process.env.DOCUSIGN_AUTH_BASE || 'https://account-d.docusign.com';

/** Integration key (Apps and Keys) — used for OAuth and JWT */
export const DOCUSIGN_CLIENT_ID = process.env.DOCUSIGN_CLIENT_ID || '';
export const DOCUSIGN_INTEGRATION_KEY =
  process.env.DOCUSIGN_INTEGRATION_KEY || DOCUSIGN_CLIENT_ID || '';

export const DOCUSIGN_CLIENT_SECRET = process.env.DOCUSIGN_CLIENT_SECRET || '';
export const DOCUSIGN_REDIRECT_URI = process.env.DOCUSIGN_REDIRECT_URI || '';

/** Default redirect for JWT admin consent (add this URI in Apps and Keys → Redirect URIs). */
export const DOCUSIGN_JWT_CONSENT_REDIRECT_URI =
  process.env.DOCUSIGN_JWT_CONSENT_REDIRECT_URI ||
  'https://developers.docusign.com/platform/auth/consent';

/**
 * JWT service account (BoldSign-style): impersonated sender GUID from DocuSign → My Profile → API Username.
 */
export const DOCUSIGN_IMPERSONATED_USER_ID =
  process.env.DOCUSIGN_IMPERSONATED_USER_ID ||
  process.env.DOCUSIGN_USER_ID ||
  '';

/** RSA private key PEM (use \\n for newlines in .env) */
export const DOCUSIGN_RSA_PRIVATE_KEY = process.env.DOCUSIGN_RSA_PRIVATE_KEY || '';

/** Optional hint — must be API account GUID (not numeric account number) */
export const DOCUSIGN_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID || '';
export const DOCUSIGN_BASE_URI = process.env.DOCUSIGN_BASE_URI || '';

/** Fallback return URL when frontend sends localhost/http (DocuSign sender view). */
export const DOCUSIGN_SENDER_RETURN_URL =
  process.env.DOCUSIGN_SENDER_RETURN_URL || 'https://www.docusign.com';

const DOCUSIGN_ACCOUNT_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DocuSign REST paths require the API account GUID, not the numeric account number. */
export function isDocusignAccountIdGuid(accountId: string): boolean {
  return DOCUSIGN_ACCOUNT_GUID_RE.test(String(accountId || '').trim());
}

/**
 * Auth mode: `jwt` (server, no user connect) | `oauth` (per-user connect).
 * Default: jwt when RSA key + user id are set, otherwise oauth.
 */
export const DOCUSIGN_AUTH_MODE = (process.env.DOCUSIGN_AUTH_MODE || '').trim().toLowerCase();

export const DOCUSIGN_DEFAULT_TEMPLATE_ID =
  process.env.DOCUSIGN_DEFAULT_TEMPLATE_ID ||
  process.env.BOLDSIGN_DEFAULT_TEMPLATE_ID ||
  '';

export const DOCUSIGN_DEFAULT_ROLE_NAME =
  process.env.DOCUSIGN_DEFAULT_ROLE_NAME || 'Signer';

/** Second owner / guarantor slot — must differ from DOCUSIGN_DEFAULT_ROLE_NAME. */
export const DOCUSIGN_SECONDARY_ROLE_NAME =
  process.env.DOCUSIGN_SECONDARY_ROLE_NAME || 'Owner 2';

/** Optional platform CC. Empty unless DOCUSIGN_DEFAULT_CC_EMAIL is set in env. */
export const DOCUSIGN_DEFAULT_CC_EMAIL = String(
  process.env.DOCUSIGN_DEFAULT_CC_EMAIL || '',
).trim();

/**
 * When true, envelope is set to `sent` after prefill (DocuSign emails signers).
 * Default true unless DOCUSIGN_AUTO_SEND_ENVELOPE=false in .env.
 */
export const DOCUSIGN_AUTO_SEND_ENVELOPE =
  String(process.env.DOCUSIGN_AUTO_SEND_ENVELOPE || 'true').trim().toLowerCase() !== 'false';

/** When true (default), contract + addendum/disclosure PDFs are merged into one DocuSign document. */
export const DOCUSIGN_COMBINE_PACKAGE_PDF =
  String(process.env.DOCUSIGN_COMBINE_PACKAGE_PDF || 'true').trim().toLowerCase() !== 'false';

export const DOCUSIGN_WEBHOOK_BASIC_USER = process.env.DOCUSIGN_WEBHOOK_BASIC_USER || '';
export const DOCUSIGN_WEBHOOK_BASIC_PASSWORD = process.env.DOCUSIGN_WEBHOOK_BASIC_PASSWORD || '';

/** Public URL DocuSign Connect posts to (per-envelope + account Connect). */
export function resolveDocusignWebhookUrl(): string | null {
  const explicit =
    process.env.DOCUSIGN_WEBHOOK_URL ||
    process.env.DOCUSIGN_CONNECT_WEBHOOK_URL ||
    process.env.NGROK_URL?.replace(/\/boldsign\/webhook\/?$/i, '/docusign/webhook');
  if (explicit?.trim()) return explicit.trim().replace(/\/+$/, '');

  const crmApi = process.env.CRM_API_URL || process.env.API_BASE_URL || '';
  if (crmApi.includes('/api/v1')) {
    return crmApi.replace(/\/uploads\/?$/i, '').replace(/\/+$/, '') + '/docusign/webhook';
  }
  return null;
}

export function getDocusignOAuthUrls() {
  return {
    authUrl: `${DOCUSIGN_AUTH_BASE}/oauth/auth`,
    tokenUrl: `${DOCUSIGN_AUTH_BASE}/oauth/token`,
    userInfoUrl: `${DOCUSIGN_AUTH_BASE}/oauth/userinfo`,
  };
}

export function normalizeDocusignRestBaseUri(baseUri: string): string {
  let uri = String(baseUri || '').trim().replace(/\/+$/, '');
  if (!uri) return uri;
  // Axios paths already include /v2.1/... — baseURL must end at /restapi only.
  uri = uri.replace(/\/v2\.1\/?$/i, '');
  if (!uri.endsWith('/restapi')) {
    uri = `${uri}/restapi`;
  }
  return uri;
}

export function buildDocusignApiUrl(baseUri: string, path: string): string {
  const base = normalizeDocusignRestBaseUri(baseUri);
  const rel = String(path || '').trim().replace(/^\/+/, '');
  return rel ? `${base}/${rel}` : base;
}

/** Parse DocuSign REST error body instead of bare axios "Request failed with status code 400". */
export function formatDocusignApiErrorMessage(err: unknown): string {
  const ax = err as {
    response?: { data?: unknown; status?: number };
    message?: string;
  };
  const data = ax?.response?.data;
  if (data && typeof data === 'object') {
    const o = data as { errorCode?: string; message?: string };
    if (o.message) {
      return o.errorCode
        ? `DocuSign (${o.errorCode}): ${o.message}`
        : `DocuSign: ${o.message}`;
    }
  }
  const msg = String(ax?.message || err || 'Unknown DocuSign error');
  if (/^Request failed with status code \d+$/i.test(msg) && ax?.response?.status) {
    return `DocuSign API request failed (HTTP ${ax.response.status})`;
  }
  return msg;
}

export function isDocuSignEnvelopeUpdateLimitError(err: unknown): boolean {
  const ax = err as {
    response?: { data?: { errorCode?: string; message?: string } };
  };
  const code = String(ax?.response?.data?.errorCode || '').trim();
  if (/^(?:HOURLY|BURST)_APIINVOCATION_ENVELOPE_LIMIT$/i.test(code)) return true;
  return /(?:HOURLY|BURST)_APIINVOCATION_ENVELOPE_LIMIT|APIINVOCATION.*ENVELOPE.*LIMIT/i.test(
    formatDocusignApiErrorMessage(err),
  );
}

export function isDocuSignPollingLimitError(err: unknown): boolean {
  const ax = err as {
    status?: number;
    name?: string;
    message?: string;
    response?: { status?: number; data?: { errorCode?: string; message?: string } };
  };
  if (ax?.name === 'DocusignCooldownException' || ax?.status === 429 || ax?.response?.status === 429) {
    return true;
  }
  if (isDocuSignEnvelopeUpdateLimitError(err)) return true;
  const code = String(ax?.response?.data?.errorCode || '');
  if (
    /(?:HOURLY|BURST)_APIINVOCATION(?:_ENVELOPE)?_LIMIT|(?:BURST|HOURLY)_ENVELOPE_POLLING|APIINVOCATION.*LIMIT/i.test(
      code,
    )
  ) {
    return true;
  }
  const msg = `${formatDocusignApiErrorMessage(err)} ${String(ax?.message || '')}`;
  return /burst_envelope_polling|hourly_envelope_polling|polling.?limit|hourly_apiinvocation|apiinvocation.*limit|api.?invocation.*limit|rate.?limit|cooldown is active|too many requests|status code 429/i.test(
    msg,
  );
}

/** Respect DocuSign Retry-After/reset headers; use safe defaults when they are omitted. */
export function getDocusignRetryAfterMs(err: unknown): number {
  const ax = err as {
    retryAfterSeconds?: number;
    response?: {
      headers?: Record<string, unknown>;
      data?: { errorCode?: string; message?: string };
    };
  };
  if (Number.isFinite(ax?.retryAfterSeconds) && Number(ax.retryAfterSeconds) > 0) {
    return Math.ceil(Number(ax.retryAfterSeconds) * 1000);
  }

  const headers = ax?.response?.headers || {};
  const header = (name: string): unknown =>
    headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  const retryAfter = header('retry-after');
  if (retryAfter != null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
    const at = Date.parse(String(retryAfter));
    if (Number.isFinite(at) && at > Date.now()) return at - Date.now();
  }

  const reset = Number(header('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    const resetMs = reset > 10_000_000_000 ? reset : reset * 1000;
    if (resetMs > Date.now()) return resetMs - Date.now();
  }

  const code = String(ax?.response?.data?.errorCode || '');
  const message = `${code} ${String(ax?.response?.data?.message || '')}`;
  return /hourly/i.test(message) ? 60 * 60_000 : 60_000;
}

export function formatDocusignRouteError(err: unknown): {
  status: number;
  message: string;
  retryAfterSeconds?: number;
} {
  const e = err as {
    status?: number;
    message?: string;
    retryAfterSeconds?: number;
    response?: { status?: number };
  };
  const message = formatDocusignApiErrorMessage(err);
  if (isDocuSignPollingLimitError(err)) {
    const retryAfterSeconds = Math.max(
      1,
      e?.retryAfterSeconds || Math.ceil(getDocusignRetryAfterMs(err) / 1000),
    );
    return {
      status: 429,
      retryAfterSeconds,
      message:
        isDocuSignEnvelopeUpdateLimitError(err)
          ? `DocuSign envelope update limit reached. Retry after ${retryAfterSeconds} seconds; repeated retries will continue to fail.`
          : /hourly_apiinvocation|apiinvocation.?limit/i.test(message)
          ? 'DocuSign hourly API limit exceeded (3000/hour). Wait about an hour before sending or syncing again — status still updates via webhook.'
          : /hourly_envelope_polling|burst_envelope_polling|polling.?limit|cooldown is active|status code 429/i.test(
                `${message} ${String(e?.message || '')}`,
              )
            ? 'DocuSign envelope polling limit exceeded (250 GET/hour per envelope). Status updates via webhook — wait about an hour before Refresh/sync. Do not keep retrying.'
            : message,
    };
  }
  const status =
    typeof e?.status === 'number' && e.status >= 400 && e.status < 600
      ? e.status
      : typeof e?.response?.status === 'number' &&
          e.response.status >= 400 &&
          e.response.status < 600
        ? e.response.status
        : 500;
  return { status, message };
}

export function resolveDocusignAuthMode(): 'jwt' | 'oauth' {
  if (DOCUSIGN_AUTH_MODE === 'oauth') return 'oauth';
  if (DOCUSIGN_AUTH_MODE === 'jwt') return 'jwt';
  const integrationKey = DOCUSIGN_INTEGRATION_KEY || DOCUSIGN_CLIENT_ID;
  if (
    integrationKey?.trim() &&
    DOCUSIGN_IMPERSONATED_USER_ID?.trim() &&
    DOCUSIGN_RSA_PRIVATE_KEY?.trim()
  ) {
    return 'jwt';
  }
  return 'oauth';
}
