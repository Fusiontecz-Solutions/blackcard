import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Application } from '@/types/applicationTypes';
import { fetchPaymentDashboardFundedDeals } from '@/redux/actions/paymentDashboardCohortActions';

interface PaymentDashboardCohortState {
    loading: boolean;
    isRefreshing: boolean;
    data: Application[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    } | null;
    error: string | null;
    /** True after the first cohort request settles (success or failure). */
    fetched: boolean;
    latestRequestId: string | null;
}

const initialState: PaymentDashboardCohortState = {
    loading: false,
    isRefreshing: false,
    data: [],
    pagination: null,
    error: null,
    fetched: false,
    latestRequestId: null,
};

export const paymentDashboardCohortSlice = createSlice({
    name: 'paymentDashboardCohort',
    initialState,
    reducers: {
        clearPaymentDashboardCohort: (state) => {
            state.data = [];
            state.pagination = null;
            state.error = null;
            state.loading = false;
            state.isRefreshing = false;
            state.fetched = false;
            state.latestRequestId = null;
        },
        hydratePaymentDashboardCohortFromCache: (
            state,
            action: PayloadAction<{ data: Application[]; pagination: PaymentDashboardCohortState['pagination'] }>,
        ) => {
            state.data = action.payload.data;
            state.pagination = action.payload.pagination;
            state.fetched = true;
            state.loading = false;
            state.isRefreshing = false;
            state.error = null;
            state.latestRequestId = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchPaymentDashboardFundedDeals.pending, (state, action) => {
                state.error = null;
                state.latestRequestId = action.meta.requestId;
                if (state.data.length > 0) {
                    state.isRefreshing = true;
                } else {
                    state.loading = true;
                }
            })
            .addCase(fetchPaymentDashboardFundedDeals.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.latestRequestId) {
                    return;
                }
                state.loading = false;
                state.isRefreshing = false;
                state.fetched = true;
                const payload = action.payload as {
                    data?: Application[];
                    pagination?: Record<string, unknown>;
                };
                const rows = Array.isArray(payload?.data) ? payload.data : [];
                state.data = rows;
                const pagination = payload?.pagination;
                state.pagination = pagination
                    ? {
                          total: Number(pagination.total ?? pagination.totalItems ?? 0),
                          page: Number(pagination.page ?? pagination.currentPage ?? 1),
                          limit: Number(pagination.limit ?? pagination.itemsPerPage ?? 0),
                          totalPages: Number(pagination.totalPages ?? 1),
                      }
                    : null;
                state.latestRequestId = null;
            })
            .addCase(fetchPaymentDashboardFundedDeals.rejected, (state, action) => {
                if (action.meta.requestId !== state.latestRequestId) {
                    return;
                }
                state.loading = false;
                state.isRefreshing = false;
                state.fetched = true;
                state.error = (action.payload as string) || 'Failed to load funded deals';
                state.latestRequestId = null;
            });
    },
});

export const { clearPaymentDashboardCohort, hydratePaymentDashboardCohortFromCache } =
    paymentDashboardCohortSlice.actions;
