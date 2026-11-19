import type { Application } from '@/types/applicationTypes';
import type { PaymentDashboardData } from '@/types/paymentDashboardTypes';
import type { FundedDealBalanceApiRow } from '@/lib/collectionPaymentDashboardApi';
import { idbClearNamespace, idbGet, idbSet } from '@/lib/persistentCache/idbStore';

const CACHE_VERSION = 1 as const;
const IDB_NAMESPACE = 'payment-dashboard.v1';

export type PaymentDashboardSessionBundle = {
    v: typeof CACHE_VERSION;
    savedAt: number;
    dashboard: PaymentDashboardData | null;
    cohort: {
        data: Application[];
        pagination: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        } | null;
    } | null;
    money: {
        balancesByAppId: Record<string, FundedDealBalanceApiRow>;
        paymentsByApp: Record<string, unknown[]>;
    } | null;
};

let memoryBundle: PaymentDashboardSessionBundle | null = null;

function cacheKeyForSession(): string {
    try {
        const token = localStorage.getItem('token');
        if (!token) return '__no_token__';
        const parts = token.split('.');
        if (parts.length < 2) return '__bad_token__';
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const json = JSON.parse(atob(padded)) as { id?: string; sub?: string; _id?: string };
        return String(json.id ?? json.sub ?? json._id ?? 'user');
    } catch {
        return '__err__';
    }
}

function safeParse(payload: unknown): PaymentDashboardSessionBundle | null {
    try {
        const parsed = payload as PaymentDashboardSessionBundle;
        if (parsed?.v !== CACHE_VERSION) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function readPaymentDashboardSessionCache(): PaymentDashboardSessionBundle | null {
    return memoryBundle;
}

/** Load payment dashboard snapshot from IndexedDB into L1 (app boot). */
export async function hydratePaymentDashboardCacheFromIdb(): Promise<PaymentDashboardSessionBundle | null> {
    const uid = cacheKeyForSession();
    const hit = await idbGet<PaymentDashboardSessionBundle>(IDB_NAMESPACE, uid);
    const parsed = hit ? safeParse(hit.payload) : null;
    if (parsed) {
        memoryBundle = parsed;
    }
    return parsed;
}

/** Merge the latest successful API slice into IndexedDB + L1. */
export function writePaymentDashboardSessionCache(partial: {
    dashboard?: PaymentDashboardData | null;
    cohort?: PaymentDashboardSessionBundle['cohort'];
    money?: PaymentDashboardSessionBundle['money'];
}): void {
    if (typeof window === 'undefined') return;
    const prev = memoryBundle ?? readPaymentDashboardSessionCache();

    const bundle: PaymentDashboardSessionBundle = {
        v: CACHE_VERSION,
        savedAt: Date.now(),
        dashboard: partial.dashboard !== undefined ? partial.dashboard : prev?.dashboard ?? null,
        cohort: partial.cohort !== undefined ? partial.cohort : prev?.cohort ?? null,
        money: partial.money !== undefined ? partial.money : prev?.money ?? null,
    };

    const hasAnything =
        bundle.dashboard != null ||
        bundle.cohort != null ||
        bundle.money != null;

    if (!hasAnything) return;

    const slimIfNeeded = (): PaymentDashboardSessionBundle => {
        if (bundle.cohort && bundle.cohort.data.length > 400) {
            return {
                ...bundle,
                cohort: {
                    data: bundle.cohort.data.slice(0, 400),
                    pagination: bundle.cohort.pagination,
                },
            };
        }
        return bundle;
    };

    memoryBundle = slimIfNeeded();
    void idbSet(IDB_NAMESPACE, cacheKeyForSession(), memoryBundle);
}

export function clearPaymentDashboardSessionCache(): void {
    memoryBundle = null;
    void idbClearNamespace(IDB_NAMESPACE);
}
