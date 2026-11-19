import { QUERY_STALE_TIME_MS } from "@/lib/querySyncConstants";
import { visibleRefetchInterval } from "@/lib/prefetchFreshness";

/** Shared React Query tuning for live dashboards — fewer focus/interval refetches. */
export const DASHBOARD_STALE_MS = QUERY_STALE_TIME_MS;
export const DASHBOARD_REFETCH_MS = 60_000;

export function dashboardRefetchWhenVisible(): number | false {
  return visibleRefetchInterval(DASHBOARD_REFETCH_MS);
}
