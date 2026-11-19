import type { CrmCacheNamespace } from "./namespaces";
import { CRM_CACHE_NS } from "./namespaces";

export type CrmCacheEntry<T = unknown> = {
  at: number;
  data: T;
};

export type CrmCacheNamespaceConfig = {
  ttlMs: number;
  maxEntries: number;
  /** Persist to IndexedDB (L2). */
  persistIdb: boolean;
  /** Load into L1 on app bootstrap when authenticated. */
  hydrateOnBoot: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const CRM_CACHE_NS_CONFIG: Record<CrmCacheNamespace, CrmCacheNamespaceConfig> =
  {
    [CRM_CACHE_NS.APPLICATIONS_LIST]: {
      ttlMs: 5 * 60_000,
      maxEntries: 40,
      persistIdb: true,
      hydrateOnBoot: true,
    },
    [CRM_CACHE_NS.APPLICATIONS_DETAIL]: {
      ttlMs: 5 * 60_000,
      maxEntries: 30,
      persistIdb: true,
      hydrateOnBoot: true,
    },
    [CRM_CACHE_NS.DEAL_PIPELINE_LISTS]: {
      ttlMs: 7 * DAY_MS,
      maxEntries: 8,
      persistIdb: true,
      hydrateOnBoot: true,
    },
    [CRM_CACHE_NS.OPS_DASHBOARD]: {
      ttlMs: 7 * DAY_MS,
      maxEntries: 4,
      persistIdb: true,
      hydrateOnBoot: true,
    },
    [CRM_CACHE_NS.PAYMENT_DASHBOARD]: {
      ttlMs: 7 * DAY_MS,
      maxEntries: 4,
      persistIdb: true,
      hydrateOnBoot: true,
    },
    [CRM_CACHE_NS.PAYMENT_TEMPLATES]: {
      ttlMs: 30 * 60_000,
      maxEntries: 2,
      persistIdb: true,
      hydrateOnBoot: true,
    },
    [CRM_CACHE_NS.CLIENTS_LIST]: {
      ttlMs: 60_000,
      maxEntries: 40,
      persistIdb: true,
      hydrateOnBoot: false,
    },
  };

export function getNamespaceConfig(namespace: CrmCacheNamespace): CrmCacheNamespaceConfig {
  return CRM_CACHE_NS_CONFIG[namespace];
}
