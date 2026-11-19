import { CRM_CACHE_NS_CONFIG } from "./config";
import type { CrmCacheEntry } from "./config";
import {
  idbClearAll,
  idbClearNamespace,
  idbGet,
  idbGetAllByNamespace,
  idbPut,
} from "./indexedDbStore";
import {
  memoryClearAll,
  memoryClearNamespace,
  memoryGet,
  memoryGetFreshestInNamespace,
  memorySet,
  memorySetFromHydrate,
} from "./memoryStore";
import type { CrmCacheNamespace } from "./namespaces";

export { CRM_CACHE_NS, type CrmCacheNamespace } from "./namespaces";
export type { CrmCacheEntry } from "./config";
export { memoryClearNamespace, memoryEntriesForNamespace } from "./memoryStore";
export { idbClearNamespace } from "./indexedDbStore";

/** L1 read (sync). */
export function crmCacheGet<T>(
  namespace: CrmCacheNamespace,
  key: string,
): T | undefined {
  return memoryGet<T>(namespace, key);
}

/** L1 + L2 write. */
export function crmCacheSet<T>(
  namespace: CrmCacheNamespace,
  key: string,
  data: T,
): void {
  const entry: CrmCacheEntry<T> = { at: Date.now(), data };
  memorySet(namespace, key, data, entry.at);
  void idbPut(namespace, key, entry);
}

export function crmCacheGetFreshest<T>(
  namespace: CrmCacheNamespace,
): T | undefined {
  return memoryGetFreshestInNamespace<T>(namespace);
}

export function crmCacheClearNamespace(namespace: CrmCacheNamespace): void {
  memoryClearNamespace(namespace);
  void idbClearNamespace(namespace);
}

let bootstrapPromise: Promise<void> | null = null;

/**
 * Hydrate L1 from IndexedDB on authenticated app load.
 * Safe to call multiple times; runs once per page session.
 */
export function bootstrapCrmCache(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const namespaces = (
      Object.entries(CRM_CACHE_NS_CONFIG) as Array<
        [CrmCacheNamespace, (typeof CRM_CACHE_NS_CONFIG)[CrmCacheNamespace]]
      >
    )
      .filter(([, cfg]) => cfg.hydrateOnBoot)
      .map(([ns]) => ns);

    await Promise.all(
      namespaces.map(async (namespace) => {
        const rows = await idbGetAllByNamespace(namespace);
        for (const { key, entry } of rows) {
          memorySetFromHydrate(namespace, key, entry);
        }
      }),
    );
  })().catch(() => {
    bootstrapPromise = null;
  });
  return bootstrapPromise;
}

/** Pull one key from IDB into L1 if L1 miss (async warm). */
export async function crmCacheHydrateKey(
  namespace: CrmCacheNamespace,
  key: string,
): Promise<void> {
  if (memoryGet(namespace, key) !== undefined) return;
  const entry = await idbGet(namespace, key);
  if (entry) memorySetFromHydrate(namespace, key, entry);
}

const LEGACY_SESSION_PREFIXES = [
  "inhcrm.appsList.v1:",
  "inhcrm.appDetail.v1:",
  "ihcrm.paymentTemplates.v1",
] as const;

const LEGACY_SESSION_KEYS = [
  "ihcrm_deal_pipeline_lists_v1",
  "ihcrm_ops_dashboard_v1",
] as const;

function clearLegacySessionStorage(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k) continue;
      if (
        LEGACY_SESSION_PREFIXES.some((p) => k.startsWith(p)) ||
        LEGACY_SESSION_KEYS.includes(k as (typeof LEGACY_SESSION_KEYS)[number]) ||
        k.startsWith("ih.paymentDashboard.v1.")
      ) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Clear L1 + L2 and legacy session blobs — call on logout. */
export function clearCrmCacheOnLogout(): void {
  memoryClearAll();
  void idbClearAll();
  clearLegacySessionStorage();
  bootstrapPromise = null;
}
