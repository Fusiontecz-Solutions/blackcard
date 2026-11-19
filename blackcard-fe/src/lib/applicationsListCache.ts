import type { Application, GetApplicationsParams } from "@/types/applicationTypes";
import { axiosGet } from "@/redux/axios";
import { routeParamMatchesApplication } from "@/lib/applicationRouteMatch";
import { writeApplicationDetailCache } from "@/lib/applicationDetailCache";
import {
  idbClearNamespace,
  idbDelete,
  idbGet,
  idbGetAllInNamespace,
  idbSet,
} from "@/lib/persistentCache/idbStore";
import { invalidateApplicationsListQueries } from "@/lib/applicationsListQuerySync";
import { invalidateUnderwriterPipelineCounts } from "@/lib/underwriterPipelineCounts";
import { invalidateDeclinePipelineCounts } from "@/lib/declinePipelineCounts";
import { invalidateNotAApplicationCount } from "@/lib/notAApplicationCounts";

const TTL_MS = 60_000;
const MAX_ENTRIES = 40;
const IDB_NAMESPACE = "applications-list.v1";

type CacheEntry = { at: number; data: unknown };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

function pruneIfNeeded() {
  while (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
    void idbDeleteEntry(first);
  }
}

function idbDeleteEntry(key: string): void {
  void idbDelete(IDB_NAMESPACE, key);
}

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.at > TTL_MS;
}

function remember(key: string, entry: CacheEntry) {
  cache.set(key, entry);
  void idbSet(IDB_NAMESPACE, key, entry);
  pruneIfNeeded();
}

/** Warm L1 from IndexedDB (call once on app boot). */
export async function hydrateApplicationsListCacheFromIdb(): Promise<void> {
  const rows = await idbGetAllInNamespace<CacheEntry>(IDB_NAMESPACE);
  for (const row of rows) {
    if (!row.payload || typeof row.payload.at !== "number") continue;
    if (isExpired(row.payload)) {
      void idbDeleteEntry(row.key);
      continue;
    }
    if (!cache.has(row.key) || row.payload.at > (cache.get(row.key)?.at ?? 0)) {
      cache.set(row.key, row.payload);
    }
  }
  pruneIfNeeded();
}

/** Stable key for list requests (defaults match list first-page fetch). */
export const listFetchKeyFromGetApplicationsParams =
  applicationsListParamsCacheKey;

export function applicationsListParamsCacheKey(
  params: GetApplicationsParams,
): string {
  const p = {
    fetchAllPages: params.fetchAllPages ? "1" : "",
    page: params.page ?? 1,
    limit: params.limit ?? 10,
    search: params.search ?? "",
    status: params.status ?? "",
    statsBucket: params.statsBucket ?? "",
    operationsStatus: params.operationsStatus ?? "",
    priority: params.priority ?? "",
    type: params.type ?? "",
    clientId: params.clientId ?? "",
    currentQueue: params.currentQueue ?? "",
    currentState: params.currentState ?? "",
    sortBy: params.sortBy ?? "",
    sortOrder: params.sortOrder ?? "",
    lite: params.lite ? "1" : "",
    underwriterClaim: params.underwriterClaim ?? "",
    underwriterPipeline: params.underwriterPipeline ?? "",
    returnedForCorrection: params.returnedForCorrection ? "1" : "",
    claimedByUnderwriterId: params.claimedByUnderwriterId ?? "",
    assignedUnderwriterId: params.assignedUnderwriterId ?? "",
    organization: params.organization ?? "",
    startDate: params.startDate ?? "",
    endDate: params.endDate ?? "",
  };
  return JSON.stringify(p);
}

export function buildApplicationsListUrl(
  params: GetApplicationsParams = {},
): string {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", params.page.toString());
  if (params.limit) queryParams.append("limit", params.limit.toString());
  if (params.search) queryParams.append("search", params.search);
  if (params.status) queryParams.append("status", params.status);
  if (params.statsBucket) queryParams.append("statsBucket", params.statsBucket);
  if (params.operationsStatus) {
    queryParams.append("operationsStatus", params.operationsStatus);
  }
  if (params.priority) queryParams.append("priority", params.priority);
  if (params.type) queryParams.append("type", params.type);
  if (params.clientId) queryParams.append("clientId", params.clientId);
  if (params.currentQueue) {
    queryParams.append("currentQueue", params.currentQueue);
  }
  if (params.currentState) {
    queryParams.append("currentState", params.currentState);
  }
  if (params.sortBy) queryParams.append("sortBy", params.sortBy);
  if (params.sortOrder) queryParams.append("sortOrder", params.sortOrder);
  if (params.lite) queryParams.append("lite", "1");
  if (params.underwriterClaim) {
    queryParams.append("underwriterClaim", params.underwriterClaim);
  }
  if (params.underwriterPipeline) {
    queryParams.append("underwriterPipeline", params.underwriterPipeline);
  }
  if (params.returnedForCorrection) {
    queryParams.append("returnedForCorrection", "1");
  }
  if (params.claimedByUnderwriterId) {
    queryParams.append("claimedByUnderwriterId", params.claimedByUnderwriterId);
  }
  if (params.assignedUnderwriterId) {
    queryParams.append("assignedUnderwriterId", params.assignedUnderwriterId);
  }
  if (params.startDate) queryParams.append("startDate", params.startDate);
  if (params.endDate) queryParams.append("endDate", params.endDate);
  const q = queryParams.toString();
  return `/applications${q ? `?${q}` : ""}`;
}

export function getCachedApplicationsList(
  key: string,
): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (isExpired(entry)) {
    cache.delete(key);
    void idbDeleteEntry(key);
    return undefined;
  }
  return entry.data;
}

/**
 * Returns the freshest non-expired cached list across all keys (L1 only).
 */
export function getMostRecentCachedApplicationsList(): unknown | undefined {
  const now = Date.now();
  let freshest: CacheEntry | undefined;

  for (const entry of cache.values()) {
    if (now - entry.at > TTL_MS) continue;
    if (!freshest || entry.at > freshest.at) {
      freshest = entry;
    }
  }

  return freshest?.data;
}

export function setCachedApplicationsList(key: string, data: unknown) {
  remember(key, { at: Date.now(), data });
}

/**
 * Run `fetcher` once per cache key; concurrent callers share the same promise.
 * Returns fresh cache when available.
 */
export function coalesceApplicationsListFetch(
  key: string,
  fetcher: () => Promise<unknown>,
): Promise<unknown> {
  const existing = cache.get(key);
  if (existing && Date.now() - existing.at < TTL_MS) {
    return Promise.resolve(existing.data);
  }
  const pending = inFlight.get(key);
  if (pending) return pending;
  const promise = fetcher()
    .then((data) => {
      setCachedApplicationsList(key, data);
      return data;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

export function invalidateApplicationsListCache() {
  cache.clear();
  void idbClearNamespace(IDB_NAMESPACE);
  invalidateApplicationsListQueries();
  invalidateUnderwriterPipelineCounts();
  invalidateDeclinePipelineCounts();
  invalidateNotAApplicationCount();
}

/**
 * Warm list cache for a single filter key (hover / active filter only).
 * Skips network when cache is fresh or an identical request is in flight.
 */
export function prefetchApplicationsList(
  params: GetApplicationsParams = {},
): void {
  const key = applicationsListParamsCacheKey(params);
  const url = buildApplicationsListUrl(params);
  void coalesceApplicationsListFetch(key, async () => {
    const res = await axiosGet(url);
    return res.data;
  }).catch(() => {
    /* prefetch only */
  });
}

function applicationsFromListPayload(data: unknown): Application[] | undefined {
  if (!data) return undefined;
  if (Array.isArray(data)) return data as Application[];
  if (typeof data === "object") {
    const payload = data as { data?: Application[] };
    if (Array.isArray(payload.data)) return payload.data;
  }
  return undefined;
}

/** Load one list cache key from IndexedDB into L1 (when memory miss on filter change). */
export async function warmApplicationsListCacheFromIdb(
  key: string,
): Promise<void> {
  const row = await idbGet<CacheEntry>(IDB_NAMESPACE, key);
  if (!row?.payload || typeof row.payload.at !== "number") return;
  if (isExpired(row.payload)) {
    void idbDeleteEntry(key);
    return;
  }
  if (!cache.has(key) || row.payload.at > (cache.get(key)?.at ?? 0)) {
    cache.set(key, row.payload);
    pruneIfNeeded();
  }
}

/** Find a lite list row across all cached list responses for instant detail paint. */
export function findApplicationInListCache(
  routeParam: string,
): Application | undefined {
  if (!routeParam?.trim()) return undefined;
  for (const entry of cache.values()) {
    if (isExpired(entry)) continue;
    const rows = applicationsFromListPayload(entry.data);
    if (!rows?.length) continue;
    const found = rows.find((row) =>
      routeParamMatchesApplication(routeParam, row),
    );
    if (found) return found;
  }
  return undefined;
}

/** Seed detail cache from every non-expired cached applications list. */
export function hydrateApplicationDetailCacheFromCachedLists(): void {
  for (const entry of cache.values()) {
    if (isExpired(entry)) continue;
    const rows = applicationsFromListPayload(entry.data);
    if (!rows?.length) continue;
    for (const row of rows) {
      writeApplicationDetailCache(row);
    }
  }
}
