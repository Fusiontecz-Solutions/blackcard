import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { FundedDealBalanceApiRow } from '@/lib/collectionPaymentDashboardApi';
import { fetchPaymentDashboardMoney } from '@/redux/actions/paymentDashboardMoneyActions';

interface PaymentDashboardMoneyState {
    loading: boolean;
    /** Background refresh while keeping cached balances / payment rows visible. */
    isRefreshing: boolean;
    balancesByAppId: Record<string, FundedDealBalanceApiRow>;
    paymentsByApp: Record<string, unknown[]>;
    error: string | null;
    /** After first successful load with cohort ready (may be empty balances). */
    hydratedOnce: boolean;
    latestRequestId: string | null;
}

const initialState: PaymentDashboardMoneyState = {
    loading: false,
    isRefreshing: false,
    balancesByAppId: {},
    paymentsByApp: {},
    error: null,
    hydratedOnce: false,
    latestRequestId: null,
};

export const paymentDashboardMoneySlice = createSlice({
    name: 'paymentDashboardMoney',
    initialState,
    reducers: {
        clearPaymentDashboardMoney: (state) => {
            state.balancesByAppId = {};
            state.paymentsByApp = {};
            state.error = null;
            state.loading = false;
            state.isRefreshing = false;
            state.hydratedOnce = false;
            state.latestRequestId = null;
        },
        hydratePaymentDashboardMoneyFromCache: (
            state,
            action: PayloadAction<{
                balancesByAppId: Record<string, FundedDealBalanceApiRow>;
                paymentsByApp: Record<string, unknown[]>;
            }>,
        ) => {
            state.balancesByAppId = action.payload.balancesByAppId;
            state.paymentsByApp = action.payload.paymentsByApp;
            state.hydratedOnce = true;
            state.loading = false;
            state.isRefreshing = false;
            state.error = null;
            state.latestRequestId = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchPaymentDashboardMoney.pending, (state, action) => {
                state.error = null;
                state.latestRequestId = action.meta.requestId;
                const hasCachedRows =
                    state.hydratedOnce ||
                    Object.keys(state.balancesByAppId).length > 0 ||
                    Object.keys(state.paymentsByApp).length > 0;
                if (hasCachedRows) {
                    state.isRefreshing = true;
                } else {
                    state.loading = true;
                }
            })
            .addCase(fetchPaymentDashboardMoney.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.latestRequestId) {
                    return;
                }
                state.loading = false;
                state.isRefreshing = false;
                state.balancesByAppId = action.payload.balancesByAppId;
                state.paymentsByApp = action.payload.paymentsByApp;
                state.hydratedOnce = true;
                state.latestRequestId = null;
            })
            .addCase(fetchPaymentDashboardMoney.rejected, (state, action) => {
                if (action.meta.requestId !== state.latestRequestId) {
                    return;
                }
                state.loading = false;
                state.isRefreshing = false;
                state.error = (action.payload as string) || 'Failed to load payment balances';
                state.latestRequestId = null;
            });
    },
});

export const { clearPaymentDashboardMoney, hydratePaymentDashboardMoneyFromCache } =
    paymentDashboardMoneySlice.actions;
