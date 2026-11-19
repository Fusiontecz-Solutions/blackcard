import type { Store } from '@reduxjs/toolkit';
import {
    hydratePaymentDashboardCacheFromIdb,
    readPaymentDashboardSessionCache,
} from '@/lib/paymentDashboardSessionCache';
import { hydratePaymentDashboardFromCache } from '@/redux/slices/paymentDashboardSlice';
import { hydratePaymentDashboardCohortFromCache } from '@/redux/slices/paymentDashboardCohortSlice';
import { hydratePaymentDashboardMoneyFromCache } from '@/redux/slices/paymentDashboardMoneySlice';

function applySnapshotToStore(store: Store): void {
    const snap = readPaymentDashboardSessionCache();
    if (!snap) return;

    if (snap.dashboard) {
        store.dispatch(hydratePaymentDashboardFromCache(snap.dashboard));
    }
    if (snap.cohort != null) {
        store.dispatch(
            hydratePaymentDashboardCohortFromCache({
                data: snap.cohort.data,
                pagination: snap.cohort.pagination,
            }),
        );
    }
    if (snap.money != null) {
        store.dispatch(
            hydratePaymentDashboardMoneyFromCache({
                balancesByAppId: snap.money.balancesByAppId,
                paymentsByApp: snap.money.paymentsByApp,
            }),
        );
    }
}

/** @deprecated Prefer hydratePaymentDashboardFromIdb (async, IndexedDB). */
export function hydratePaymentDashboardFromSession(store: Store): void {
    applySnapshotToStore(store);
}

/** Restore payment dashboard from IndexedDB into Redux (after L1 warm). */
export async function hydratePaymentDashboardFromIdb(store: Store): Promise<void> {
    await hydratePaymentDashboardCacheFromIdb();
    applySnapshotToStore(store);
}
