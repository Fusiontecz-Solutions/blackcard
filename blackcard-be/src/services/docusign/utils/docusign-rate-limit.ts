/** Reuse GET /recipients within a single send / finalize flow (and short draft edits). */
const RECIPIENTS_CACHE_TTL_MS = 5 * 60_000;
/** Reuse GET /envelopes/{id} status within short windows. */
const ENVELOPE_STATUS_CACHE_TTL_MS = 60_000;
/** Reuse GET /custom_fields within a send / CC notify flow. */
const CUSTOM_FIELDS_CACHE_TTL_MS = 2 * 60_000;
/** Reuse envelope document/recipient tab catalogs while a draft is being edited. */
const ENVELOPE_TABS_CACHE_TTL_MS = 5 * 60_000;
/** After Connect fires, trust CRM and skip DocuSign GET unless force (default 45 min). */
const WEBHOOK_TRUST_SKIP_POLL_MS = Math.max(
  60_000,
  parseInt(String(process.env.DOCUSIGN_WEBHOOK_TRUST_MS || ''), 10) || 45 * 60_000,
);
/** Fallback status-sync spacing when webhooks are missing (default 15 min). */
const ENVELOPE_STATUS_SYNC_MIN_INTERVAL_MS = Math.max(
  60_000,
  parseInt(String(process.env.DOCUSIGN_FALLBACK_POLL_MS || ''), 10) || 15 * 60_000,
);

type CacheEntry<T> = { value: T; expiresAt: number };

const recipientsCache = new Map<string, CacheEntry<unknown>>();
const envelopeStatusCache = new Map<string, CacheEntry<string>>();
const customFieldsCache = new Map<
  string,
  CacheEntry<Array<{ name?: string; value?: string; show?: string }>>
>();
const envelopeDocumentTabsCache = new Map<string, CacheEntry<unknown>>();
const envelopeRecipientTabsCache = new Map<string, CacheEntry<unknown>>();
const envelopeLastWebhookAt = new Map<string, number>();
const envelopeStatusSyncCache = new Map<
  string,
  { syncedAt: number; payload: Record<string, unknown> }
>();

function normalizeAccountId(accountId?: string | null): string {
  return String(accountId || '').trim().toLowerCase();
}

function cacheKey(accountId: string, envelopeId: string): string {
  return `${normalizeAccountId(accountId)}::${String(envelopeId).trim()}`;
}

function recipientTabsCacheKey(
  accountId: string,
  envelopeId: string,
  recipientId: string,
): string {
  return `${cacheKey(accountId, envelopeId)}::${String(recipientId).trim()}`;
}

function getUnexpiredCacheValue<T>(
  cache: Map<string, CacheEntry<unknown>>,
  key: string,
): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function getCachedEnvelopeRecipients(
  accountId: string,
  envelopeId: string,
): unknown | null {
  const key = cacheKey(accountId, envelopeId);
  const hit = recipientsCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    recipientsCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCachedEnvelopeRecipients(
  accountId: string,
  envelopeId: string,
  value: unknown,
): void {
  const eid = String(envelopeId || '').trim();
  const aid = normalizeAccountId(accountId);
  if (!eid || !aid) return;
  recipientsCache.set(cacheKey(aid, eid), {
    value,
    expiresAt: Date.now() + RECIPIENTS_CACHE_TTL_MS,
  });
}

export function invalidateCachedEnvelopeRecipients(
  accountId: string,
  envelopeId: string,
): void {
  recipientsCache.delete(cacheKey(accountId, envelopeId));
}

export function getCachedEnvelopeStatus(
  accountId: string,
  envelopeId: string,
): string | null {
  const key = cacheKey(accountId, envelopeId);
  const hit = envelopeStatusCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    envelopeStatusCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCachedEnvelopeStatus(
  accountId: string,
  envelopeId: string,
  status: string,
): void {
  const eid = String(envelopeId || '').trim();
  const aid = normalizeAccountId(accountId);
  if (!eid || !aid) return;
  envelopeStatusCache.set(cacheKey(aid, eid), {
    value: String(status || '').toLowerCase(),
    expiresAt: Date.now() + ENVELOPE_STATUS_CACHE_TTL_MS,
  });
}

export function invalidateCachedEnvelopeStatus(
  accountId: string,
  envelopeId: string,
): void {
  envelopeStatusCache.delete(cacheKey(accountId, envelopeId));
}

export function getCachedEnvelopeCustomFields(
  accountId: string,
  envelopeId: string,
): Array<{ name?: string; value?: string; show?: string }> | null {
  const key = cacheKey(accountId, envelopeId);
  const hit = customFieldsCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    customFieldsCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCachedEnvelopeCustomFields(
  accountId: string,
  envelopeId: string,
  value: Array<{ name?: string; value?: string; show?: string }>,
): void {
  const eid = String(envelopeId || '').trim();
  const aid = normalizeAccountId(accountId);
  if (!eid || !aid) return;
  customFieldsCache.set(cacheKey(aid, eid), {
    value,
    expiresAt: Date.now() + CUSTOM_FIELDS_CACHE_TTL_MS,
  });
}

export function invalidateCachedEnvelopeCustomFields(
  accountId: string,
  envelopeId: string,
): void {
  customFieldsCache.delete(cacheKey(accountId, envelopeId));
}

export function getCachedEnvelopeDocumentTabs<T>(
  accountId: string,
  envelopeId: string,
): T | null {
  return getUnexpiredCacheValue<T>(
    envelopeDocumentTabsCache,
    cacheKey(accountId, envelopeId),
  );
}

export function setCachedEnvelopeDocumentTabs<T>(
  accountId: string,
  envelopeId: string,
  value: T,
): void {
  const key = cacheKey(accountId, envelopeId);
  if (!normalizeAccountId(accountId) || !String(envelopeId || '').trim()) return;
  envelopeDocumentTabsCache.set(key, {
    value,
    expiresAt: Date.now() + ENVELOPE_TABS_CACHE_TTL_MS,
  });
}

export function getCachedEnvelopeRecipientTabs<T>(
  accountId: string,
  envelopeId: string,
  recipientId: string,
): T | null {
  return getUnexpiredCacheValue<T>(
    envelopeRecipientTabsCache,
    recipientTabsCacheKey(accountId, envelopeId, recipientId),
  );
}

export function setCachedEnvelopeRecipientTabs<T>(
  accountId: string,
  envelopeId: string,
  recipientId: string,
  value: T,
): void {
  if (
    !normalizeAccountId(accountId) ||
    !String(envelopeId || '').trim() ||
    !String(recipientId || '').trim()
  ) {
    return;
  }
  envelopeRecipientTabsCache.set(
    recipientTabsCacheKey(accountId, envelopeId, recipientId),
    {
      value,
      expiresAt: Date.now() + ENVELOPE_TABS_CACHE_TTL_MS,
    },
  );
}

export function rememberEnvelopeWebhook(envelopeId?: string): void {
  const eid = String(envelopeId || '').trim();
  if (!eid) return;
  envelopeLastWebhookAt.set(eid, Date.now());
  envelopeStatusSyncCache.delete(eid);
}

export function shouldSkipDocuSignPollForWebhook(
  envelopeId: string,
  force: boolean,
): boolean {
  if (force) return false;
  const at = envelopeLastWebhookAt.get(String(envelopeId || '').trim());
  if (!at) return false;
  return Date.now() - at < WEBHOOK_TRUST_SKIP_POLL_MS;
}

export function getEnvelopeStatusSyncCache(
  envelopeId: string,
): { syncedAt: number; payload: Record<string, unknown> } | null {
  const eid = String(envelopeId || '').trim();
  if (!eid) return null;
  const hit = envelopeStatusSyncCache.get(eid);
  if (!hit) return null;
  if (Date.now() - hit.syncedAt >= ENVELOPE_STATUS_SYNC_MIN_INTERVAL_MS) {
    return null;
  }
  return hit;
}

export function setEnvelopeStatusSyncCache(
  envelopeId: string,
  payload: Record<string, unknown>,
): void {
  const eid = String(envelopeId || '').trim();
  if (!eid) return;
  envelopeStatusSyncCache.set(eid, { syncedAt: Date.now(), payload });
}

export function getEnvelopeStatusSyncMinIntervalMs(): number {
  return ENVELOPE_STATUS_SYNC_MIN_INTERVAL_MS;
}

/**
 * DocuSign enforces a separate per-envelope polling budget (~250 GET/hour on
 * envelope + documents/recipients/tabs). After a 429, block further poll GETs
 * for that envelope until Retry-After (account-wide 3000/hr is a different limit).
 */
const envelopePollingCooldownUntil = new Map<string, number>();

export function getEnvelopePollingCooldownRemainingMs(envelopeId: string): number {
  const eid = String(envelopeId || '').trim();
  if (!eid) return 0;
  const until = envelopePollingCooldownUntil.get(eid) || 0;
  const remaining = until - Date.now();
  if (remaining <= 0) {
    if (until) envelopePollingCooldownUntil.delete(eid);
    return 0;
  }
  return remaining;
}

export function setEnvelopePollingCooldown(envelopeId: string, retryAfterMs: number): void {
  const eid = String(envelopeId || '').trim();
  if (!eid) return;
  const ms = Math.max(60_000, Math.ceil(retryAfterMs || 60 * 60_000));
  const until = Date.now() + ms;
  const prev = envelopePollingCooldownUntil.get(eid) || 0;
  if (until > prev) envelopePollingCooldownUntil.set(eid, until);
}

export function clearEnvelopePollingCooldown(envelopeId: string): void {
  envelopePollingCooldownUntil.delete(String(envelopeId || '').trim());
}

/** Short-lived PDF buffer cache so preview / refresh does not re-GET the same envelope. */
const ENVELOPE_PDF_CACHE_TTL_MS = Math.max(
  30_000,
  parseInt(String(process.env.DOCUSIGN_PDF_CACHE_MS || ''), 10) || 10 * 60_000,
);
const envelopePdfCache = new Map<string, CacheEntry<Buffer>>();

export function getCachedEnvelopePdf(envelopeId: string, variant: string): Buffer | null {
  const key = `${String(envelopeId || '').trim()}::${variant}`;
  const hit = envelopePdfCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    envelopePdfCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCachedEnvelopePdf(
  envelopeId: string,
  variant: string,
  value: Buffer,
): void {
  const eid = String(envelopeId || '').trim();
  if (!eid || !value?.length) return;
  envelopePdfCache.set(`${eid}::${variant}`, {
    value,
    expiresAt: Date.now() + ENVELOPE_PDF_CACHE_TTL_MS,
  });
}

export function invalidateCachedEnvelopePdf(envelopeId: string): void {
  const eid = String(envelopeId || '').trim();
  if (!eid) return;
  for (const key of envelopePdfCache.keys()) {
    if (key.startsWith(`${eid}::`)) envelopePdfCache.delete(key);
  }
}
