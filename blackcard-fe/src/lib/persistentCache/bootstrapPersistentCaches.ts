import type { Store } from "@reduxjs/toolkit";
import { hydrateApplicationsListCacheFromIdb } from "@/lib/applicationsListCache";
import { hydrateApplicationDetailCacheFromIdb } from "@/lib/applicationDetailCache";
import { hydrateClientsListCacheFromIdb } from "@/lib/clientsListCache";
import { hydrateClientDetailCacheFromIdb } from "@/lib/clientDetailCache";
import { hydratePaymentDashboardFromIdb } from "@/lib/hydratePaymentDashboardStore";
import { hydrateOperationsDashboardCacheFromIdb } from "@/lib/operationsDashboardSessionCache";

/** Async warm of L1 memory caches from IndexedDB after app shell mounts. */
export async function bootstrapPersistentCaches(store: Store): Promise<void> {
  await Promise.all([
    hydrateApplicationsListCacheFromIdb(),
    hydrateApplicationDetailCacheFromIdb(),
    hydrateClientsListCacheFromIdb(),
    hydrateClientDetailCacheFromIdb(),
    hydrateOperationsDashboardCacheFromIdb(),
    hydratePaymentDashboardFromIdb(store),
  ]);
}
