import { invalidateApplicationsListCache } from "@/lib/applicationsListCache";
import { invalidateApplicationDetailCache } from "@/lib/applicationDetailCache";
import { invalidateClientsListCache } from "@/lib/clientsListCache";
import { invalidateClientDetailCache } from "@/lib/clientDetailCache";
import { clearDealPipelineListCache } from "@/lib/dealPipelineListCache";
import { clearPaymentDashboardSessionCache } from "@/lib/paymentDashboardSessionCache";
import { clearOperationsDashboardSession } from "@/lib/operationsDashboardSessionCache";
import { idbClearAll } from "@/lib/persistentCache/idbStore";

/** Wipe all client persistent caches (logout / user switch). */
export async function clearAllPersistentCaches(): Promise<void> {
  invalidateApplicationsListCache();
  invalidateApplicationDetailCache();
  invalidateClientsListCache();
  invalidateClientDetailCache();
  clearDealPipelineListCache();
  clearPaymentDashboardSessionCache();
  clearOperationsDashboardSession();
  await idbClearAll();
}
