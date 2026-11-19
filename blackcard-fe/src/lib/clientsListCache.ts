import { axiosGet } from "@/redux/axios";
import {
  idbClearNamespace,
  idbDelete,
  idbGetAllInNamespace,
  idbSet,
} from "@/lib/persistentCache/idbStore";

const TTL_MS = 60_000;
const MAX_ENTRIES = 40;
const IDB_NAMESPACE = "clients-list.v1";

type CacheEntry = { at: number; data: unknown };

const memory = new Map<string, CacheEntry>();

export function clientsListParamsCacheKey(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
}): string {
  return JSON.stringify({
    page: params.page ?? 1,
    limit: params.limit ?? 10,
    search: params.search ?? "",
    status: params.status ?? "",
    sortBy: params.sortBy ?? "",
    sortOrder: params.sortOrder ?? "",
  });
}

export function buildClientsListUrl(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {},
): string {
  const qp = new URLSearchParams();
  if (params.page) qp.append("page", String(params.page));
  if (params.limit) qp.append("limit", String(params.limit));
  if (params.search) qp.append("search", params.search);
  if (params.status) qp.append("status", params.status);
  if (params.sortBy) qp.append("sortBy", params.sortBy);
  if (params.sortOrder) qp.append("sortOrder", params.sortOrder);
  const q = qp.toString();
  return `/clients${q ? `?${q}` : ""}`;
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

export async function hydrateClientsListCacheFromIdb(): Promise<void> {
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

export function getCachedClientsList(key: string): unknown | undefined {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (isExpired(entry)) {
    memory.delete(key);
    void idbDelete(IDB_NAMESPACE, key);
    return undefined;
  }
  return entry.data;
}

export function setCachedClientsList(key: string, data: unknown): void {
  remember(key, { at: Date.now(), data });
}

export function invalidateClientsListCache(): void {
  memory.clear();
  void idbClearNamespace(IDB_NAMESPACE);
}

export function prefetchClientsList(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  } = {},
): void {
  const key = clientsListParamsCacheKey(params);
  const existing = memory.get(key);
  if (existing && !isExpired(existing)) return;
  void axiosGet(buildClientsListUrl(params))
    .then((res) => setCachedClientsList(key, res.data))
    .catch(() => {
      /* prefetch */
    });
}
