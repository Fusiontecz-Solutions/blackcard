import type { Middleware } from "@reduxjs/toolkit";
import {
  fetchOperationsDashboardSummary,
  fetchOperationsDashboardRecentCases,
} from "@/redux/actions/operationsDashboardActions";
import {
  resetOperationsDashboard,
  type OperationsDashboardState,
} from "@/redux/slices/operationsDashboardSlice";
import {
  persistOperationsDashboardSession,
  clearOperationsDashboardSession,
  getTokenUserId,
} from "@/lib/operationsDashboardSessionCache";
import { clearDealPipelineListCache } from "@/lib/dealPipelineListCache";

type OpsDashRoot = { operationsDashboard: OperationsDashboardState };

/**
 * Persists ops dashboard summary + recent list after successful fetches; clears on logout.
 */
export const operationsDashboardPersistMiddleware: Middleware =
  (store) => (next) => (action) => {
    const result = next(action);

    if (resetOperationsDashboard.match(action)) {
      clearOperationsDashboardSession();
      clearDealPipelineListCache();
      return result;
    }

    const userId = getTokenUserId();
    if (!userId) return result;

    const nextOps = (store.getState() as OpsDashRoot).operationsDashboard;

    if (
      (fetchOperationsDashboardSummary.fulfilled.match(action) ||
        fetchOperationsDashboardRecentCases.fulfilled.match(action)) &&
      nextOps.hasLoadedSummaryOnce
    ) {
      persistOperationsDashboardSession({
        userId,
        summaryCounts: nextOps.summaryCounts,
        caseStageCounts: { ...nextOps.caseStageCounts },
        operationsMetricsMode: nextOps.operationsMetricsMode,
        hasLoadedRecentOnce: nextOps.hasLoadedRecentOnce,
        recentCases: nextOps.recentCases,
      });
    }

    return result;
  };
