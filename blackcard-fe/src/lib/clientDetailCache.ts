import { axiosGet } from "@/redux/axios";
import {
  idbClearNamespace,
  idbDelete,
  idbGetAllInNamespace,
  idbSet,
} from "@/lib/persistentCache/idbStore";
import type { Client } from "@/types/clientTypes";

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 30;
const IDB_NAMESPACE = "client-detail.v1";

type CacheEntry = { at: number; data: unknown };

const memory = new Map<string, CacheEntry>();

function keyFor(clientId: string): string {
  return String(clientId).trim();
}

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.at > TTL_MS;
}

function remember(key: string, entry: CacheEntry) {
  memory.set(key, entry);
  void idbSet(IDB_NAMESPACE, key, entry);
  while (memory.size > MAX_ENTRIES) {
    const first = memory.keys().next().value;
    if (first === undefined) break;
    memory.delete(first);
    void idbDelete(IDB_NAMESPACE, first);
  }
}

export async function hydrateClientDetailCacheFromIdb(): Promise<void> {
  const rows = await idbGetAllInNamespace<CacheEntry>(IDB_NAMESPACE);
  for (const row of rows) {
    if (!row.payload || typeof row.payload.at !== "number") continue;
    if (isExpired(row.payload)) {
      void idbDelete(IDB_NAMESPACE, row.key);
      continue;
    }
    if (!memory.has(row.key) || row.payload.at > (memory.get(row.key)?.at ?? 0)) {
      memory.set(row.key, row.payload);
    }
  }
}

export function getCachedClientDetail(clientId: string): unknown | undefined {
  const key = keyFor(clientId);
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (isExpired(entry)) {
    memory.delete(key);
    void idbDelete(IDB_NAMESPACE, key);
    return undefined;
  }
  return entry.data;
}

export function setCachedClientDetail(clientId: string, payload: unknown): void {
  remember(keyFor(clientId), { at: Date.now(), data: payload });
}

export function invalidateClientDetailCache(clientId?: string): void {
  if (clientId) {
    const key = keyFor(clientId);
    memory.delete(key);
    void idbDelete(IDB_NAMESPACE, key);
    return;
  }
  memory.clear();
  void idbClearNamespace(IDB_NAMESPACE);
}

export function prefetchClientDetail(clientId: string): void {
  const key = keyFor(clientId);
  const existing = memory.get(key);
  if (existing && !isExpired(existing)) return;
  void axiosGet(`/clients/clientId/${encodeURIComponent(clientId)}`)
    .then((res) => setCachedClientDetail(key, res.data))
    .catch(() => {
      /* prefetch */
    });
}

export function findClientListRowForRoute(
  clientId: string,
  listRows: Client[] | undefined | null,
): Client | undefined {
  if (!clientId || !listRows?.length) return undefined;
  const q = keyFor(clientId);
  return listRows.find((c) => {
    if (c.clientId != null && String(c.clientId) === q) return true;
    if (c._id != null && String(c._id) === q) return true;
    return false;
  });
}

export function buildClientDetailHydrationPayload(
  cachedOrApiBody: unknown,
): { data: Client } | null {
  if (!cachedOrApiBody || typeof cachedOrApiBody !== "object") return null;
  const body = cachedOrApiBody as { data?: Client } | Client;
  const data =
    "data" in body && body.data && typeof body.data === "object"
      ? (body.data as Client)
      : (body as Client);
  if (!data || typeof data !== "object") return null;
  return { data };
}
