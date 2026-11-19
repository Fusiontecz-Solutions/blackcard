import type { Application } from "@/types/applicationTypes";
import { axiosGet } from "@/redux/axios";
import {
  isNumericApplicationRouteParam,
  routeParamMatchesApplication,
} from "@/lib/applicationRouteMatch";
import {
  idbClearNamespace,
  idbDelete,
  idbGetAllInNamespace,
  idbSet,
} from "@/lib/persistentCache/idbStore";

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 30;
const IDB_NAMESPACE = "application-detail.v1";

type CacheEntry = { at: number; data: unknown };

const memory = new Map<string, CacheEntry>();
/** Tracks only completed detail API requests; list-row cache entries do not count as fresh detail. */
const detailFetchedAt = new Map<string, number>();

function cacheKey(routeParam: string): string {
  return String(routeParam).trim();
}

function detailUrl(routeParam: string): string {
  if (isNumericApplicationRouteParam(routeParam)) {
    return `/applications/applicationId/${routeParam}`;
  }
  return `/applications/${routeParam}`;
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

export async function hydrateApplicationDetailCacheFromIdb(): Promise<void> {
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

export function getCachedApplicationDetail(
  routeParam: string,
): unknown | undefined {
  const key = cacheKey(routeParam);
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (isExpired(entry)) {
    memory.delete(key);
    void idbDelete(IDB_NAMESPACE, key);
    return undefined;
  }
  return entry.data;
}

export function setCachedApplicationDetail(
  routeParam: string,
  payload: unknown,
): void {
  remember(cacheKey(routeParam), { at: Date.now(), data: payload });
}

export function invalidateApplicationDetailCache(routeParam?: string): void {
  if (routeParam) {
    const key = cacheKey(routeParam);
    memory.delete(key);
    detailFetchedAt.delete(key);
    void idbDelete(IDB_NAMESPACE, key);
    return;
  }
  memory.clear();
  detailFetchedAt.clear();
  void idbClearNamespace(IDB_NAMESPACE);
}

/** Best-effort warm cache (row hover / before navigate). */
export function prefetchApplicationDetail(routeParam: string): void {
  const key = cacheKey(routeParam);
  const existing = memory.get(key);
  if (existing && !isExpired(existing)) return;
  const url = detailUrl(routeParam);
  void axiosGet(url)
    .then((res) => {
      setCachedApplicationDetail(key, res.data);
    })
    .catch(() => {
      /* prefetch only */
    });
}

/** Use a list row (lite) for instant paint when opening details. */
export function applicationDetailCacheKeyFromApplication(
  app: Application,
): string | null {
  if (app.applicationId != null) return String(app.applicationId);
  const id = app._id ?? (app as { id?: string }).id;
  return id != null ? String(id) : null;
}

export function findApplicationListRowForRoute(
  routeParam: string,
  listRows: Application[] | undefined | null,
): Application | undefined {
  if (!routeParam || !listRows?.length) return undefined;
  return listRows.find((row) => routeParamMatchesApplication(routeParam, row));
}

export function buildDetailHydrationPayload(
  cachedOrApiBody: unknown,
): { data: Application } | null {
  if (!cachedOrApiBody || typeof cachedOrApiBody !== "object") return null;
  const body = cachedOrApiBody as { data?: Application } | Application;
  const data =
    "data" in body && body.data && typeof body.data === "object"
      ? (body.data as Application)
      : (body as Application);
  if (!data || typeof data !== "object") return null;
  return { data };
}

/** Read a cached application row/API body for a route param (L1 only). */
export function readApplicationDetailCache(
  routeParam: string,
): Application | undefined {
  const raw = getCachedApplicationDetail(routeParam);
  if (raw == null) return undefined;
  const hydrated = buildDetailHydrationPayload(raw);
  if (hydrated) return hydrated.data;
  if (typeof raw === "object") return raw as Application;
  return undefined;
}

/** Store an application under all route keys (numeric id, UUID, legacy id). */
export function writeApplicationDetailCache(app: Application): void {
  const keys = new Set<string>();
  if (app.applicationId != null) keys.add(String(app.applicationId));
  const id = app._id ?? (app as { id?: string }).id;
  if (id != null) keys.add(String(id));
  for (const key of keys) {
    setCachedApplicationDetail(key, app);
  }
}

/** Record a completed detail API response under every route identifier for TTL checks. */
export function recordApplicationDetailResponse(payload: unknown): void {
  const hydrated = buildDetailHydrationPayload(payload);
  if (!hydrated) return;
  const app = hydrated.data;
  const now = Date.now();
  writeApplicationDetailCache(app);
  if (app.applicationId != null) detailFetchedAt.set(String(app.applicationId), now);
  const id = app._id ?? (app as { id?: string }).id;
  if (id != null) detailFetchedAt.set(String(id), now);
}

/** True only for a recent full detail response, never for a lightweight list-row seed. */
export function isApplicationDetailFetchFresh(routeParam: string): boolean {
  const fetchedAt = detailFetchedAt.get(cacheKey(routeParam));
  return fetchedAt != null && Date.now() - fetchedAt < TTL_MS;
}
