import { getRedisClient } from '../config/redis';

/** Logical cache buckets — each gets a versioned Redis / memory key. */
export const DashboardCacheKind = {
    STATS: 'stats',
    TREND: 'trend',
    FUNNEL: 'funnel',
    RECENT: 'recent',
    ADMIN: 'admin',
    OPS_SUMMARY: 'ops-summary',
    OPS_RECENT: 'ops-recent',
    PAYMENT_OVERVIEW: 'payment-overview',
} as const;

export type DashboardCacheKind = (typeof DashboardCacheKind)[keyof typeof DashboardCacheKind];

const VERSION_KEY = 'dashboard:v1:version';

type MemoryEntry = { expiresAt: number; payload: string };

const memoryStore = new Map<string, MemoryEntry>();
let memoryVersion = 0;

function readDefaultTtlSeconds(): number {
    const raw = Number(process.env.DASHBOARD_CACHE_TTL_SECONDS ?? 25);
    return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 120) : 25;
}

function readRecentTtlSeconds(): number {
    const raw = Number(process.env.DASHBOARD_RECENT_CACHE_TTL_SECONDS ?? 10);
    return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 60) : 10;
}

function ttlForKind(kind: DashboardCacheKind): number {
    if (kind === DashboardCacheKind.RECENT || kind === DashboardCacheKind.OPS_RECENT) {
        return readRecentTtlSeconds();
    }
    return readDefaultTtlSeconds();
}

async function currentVersion(): Promise<number> {
    const redis = getRedisClient();
    if (redis) {
        try {
            const v = await redis.get(VERSION_KEY);
            const n = Number(v);
            if (Number.isFinite(n) && n >= 0) return n;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('[dashboard-cache] Redis version read failed:', msg);
        }
    }
    return memoryVersion;
}

function buildStorageKey(version: number, kind: DashboardCacheKind, key: string): string {
    return `dashboard:v1:${version}:${kind}:${key}`;
}

/**
 * Load cached dashboard payload. Returns null on miss or when cache is disabled.
 * Redis hit avoids Postgres; memory hit avoids Redis and Postgres.
 */
export async function getDashboardCache<T>(
    kind: DashboardCacheKind,
    key: string,
): Promise<T | null> {
    const version = await currentVersion();
    const storageKey = buildStorageKey(version, kind, key);

    const mem = memoryStore.get(storageKey);
    if (mem) {
        if (Date.now() <= mem.expiresAt) {
            try {
                return JSON.parse(mem.payload) as T;
            } catch {
                memoryStore.delete(storageKey);
            }
        } else {
            memoryStore.delete(storageKey);
        }
    }

    const redis = getRedisClient();
    if (!redis) return null;

    try {
        const raw = await redis.get(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as T;
        const ttlSec = ttlForKind(kind);
        memoryStore.set(storageKey, {
            expiresAt: Date.now() + ttlSec * 1000,
            payload: raw,
        });
        return parsed;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[dashboard-cache] Redis get failed (${kind}):`, msg);
        return null;
    }
}

export async function setDashboardCache<T>(
    kind: DashboardCacheKind,
    key: string,
    data: T,
): Promise<void> {
    const version = await currentVersion();
    const storageKey = buildStorageKey(version, kind, key);
    const payload = JSON.stringify(data);
    const ttlSec = ttlForKind(kind);

    memoryStore.set(storageKey, {
        expiresAt: Date.now() + ttlSec * 1000,
        payload,
    });

    const redis = getRedisClient();
    if (!redis) return;

    try {
        await redis.set(storageKey, payload, 'EX', ttlSec);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[dashboard-cache] Redis set failed (${kind}):`, msg);
    }
}

/** Run loader only on cache miss; stores result in Redis + memory when available. */
export async function withDashboardCache<T>(
    kind: DashboardCacheKind,
    key: string,
    loader: () => Promise<T>,
): Promise<T> {
    const cached = await getDashboardCache<T>(kind, key);
    if (cached !== null) return cached;
    const data = await loader();
    await setDashboardCache(kind, key, data);
    return data;
}

/**
 * Invalidate all dashboard caches (stats, charts, ops, admin).
 * Call after application writes so the next request recomputes from Postgres.
 */
export async function invalidateAllDashboardCache(): Promise<void> {
    memoryStore.clear();
    memoryVersion += 1;

    const redis = getRedisClient();
    if (!redis) return;

    try {
        await redis.incr(VERSION_KEY);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[dashboard-cache] Redis version bump failed:', msg);
    }
}
