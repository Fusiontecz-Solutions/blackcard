import type { ApplicationStatsPayload } from './applicationStatsService';
import {
    DashboardCacheKind,
    getDashboardCache,
    invalidateAllDashboardCache,
    setDashboardCache,
} from './dashboardCache';

/** @deprecated Use getDashboardCache(DashboardCacheKind.STATS, key) — kept for call-site clarity. */
export async function getApplicationStatsCache(
    key: string,
): Promise<ApplicationStatsPayload | null> {
    return getDashboardCache<ApplicationStatsPayload>(DashboardCacheKind.STATS, key);
}

export async function setApplicationStatsCache(
    key: string,
    data: ApplicationStatsPayload,
): Promise<void> {
    await setDashboardCache(DashboardCacheKind.STATS, key, data);
}

/** Clears dashboard Redis/memory caches (stats, trend, funnel, ops, admin). */
export function invalidateAllApplicationStatsCache(): void {
    void invalidateAllDashboardCache();
}
