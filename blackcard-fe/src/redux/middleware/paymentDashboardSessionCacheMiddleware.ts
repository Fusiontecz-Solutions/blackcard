import type { Middleware } from '@reduxjs/toolkit';
import type { Application } from '@/types/applicationTypes';
import type { PaymentDashboardData } from '@/types/paymentDashboardTypes';
import type { FundedDealBalanceApiRow } from '@/lib/collectionPaymentDashboardApi';
import {
    fetchPaymentFinancialOverviewSummary,
    getPaymentDashboard,
} from '@/redux/actions/paymentDashboardActions';
import { fetchPaymentDashboardFundedDeals } from '@/redux/actions/paymentDashboardCohortActions';
import { writePaymentDashboardSessionCache } from '@/lib/paymentDashboardSessionCache';

/** Narrow store shape — avoid importing `RootState` from `store.ts` (circular with this middleware). */
type PaymentDashboardCacheStoreState = {
    paymentDashboard: { data: PaymentDashboardData | null };
    paymentDashboardCohort: {
        fetched: boolean;
        data: Application[];
        pagination: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        } | null;
    };
    paymentDashboardMoney: {
        hydratedOnce: boolean;
        balancesByAppId: Record<string, FundedDealBalanceApiRow>;
        paymentsByApp: Record<string, unknown[]>;
    };
};

function persistPaymentDashboardState(state: PaymentDashboardCacheStoreState) {
    writePaymentDashboardSessionCache({
        dashboard: state.paymentDashboard.data ?? undefined,
        cohort: state.paymentDashboardCohort.fetched
            ? {
                  data: state.paymentDashboardCohort.data,
                  pagination: state.paymentDashboardCohort.pagination,
              }
            : undefined,
        money: state.paymentDashboardMoney.hydratedOnce
            ? {
                  balancesByAppId: state.paymentDashboardMoney.balancesByAppId,
                  paymentsByApp: state.paymentDashboardMoney.paymentsByApp,
              }
            : undefined,
    });
}

/** After any payment-dashboard slice succeeds, persist a merged snapshot for instant rehydrate on F5. */
export const paymentDashboardSessionCacheMiddleware: Middleware =
    (api) => (next) => (action) => {
        const result = next(action);
        if (
            getPaymentDashboard.fulfilled.match(action) ||
            fetchPaymentFinancialOverviewSummary.fulfilled.match(action) ||
            fetchPaymentDashboardFundedDeals.fulfilled.match(action)
        ) {
            persistPaymentDashboardState(api.getState() as PaymentDashboardCacheStoreState);
        }
        return result;
    };
