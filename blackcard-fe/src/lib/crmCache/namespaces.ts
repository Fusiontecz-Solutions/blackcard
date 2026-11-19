/** IndexedDB + in-memory cache namespaces (L2 / L1). */
export const CRM_CACHE_NS = {
  APPLICATIONS_LIST: "applications.list",
  APPLICATIONS_DETAIL: "applications.detail",
  DEAL_PIPELINE_LISTS: "dealPipeline.lists",
  OPS_DASHBOARD: "ops.dashboard",
  PAYMENT_DASHBOARD: "payment.dashboard",
  PAYMENT_TEMPLATES: "payment.templates",
  CLIENTS_LIST: "clients.list",
} as const;

export type CrmCacheNamespace =
  (typeof CRM_CACHE_NS)[keyof typeof CRM_CACHE_NS];
