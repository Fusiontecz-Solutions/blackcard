import { createSlice } from '@reduxjs/toolkit';
import type { MoneyFlowPoint } from '@/types/paymentDashboardTypes';
import { fetchPaymentDashboardCreditDebitTrend } from '@/redux/actions/paymentDashboardTrendActions';

interface PaymentDashboardTrendState {
    loading: boolean;
    points: MoneyFlowPoint[];
    yearOptions: number[];
    error: string | null;
}

const initialState: PaymentDashboardTrendState = {
    loading: false,
    points: [],
    yearOptions: [],
    error: null,
};

export const paymentDashboardTrendSlice = createSlice({
    name: 'paymentDashboardTrend',
    initialState,
    reducers: {
        clearPaymentDashboardTrend: (state) => {
            state.points = [];
            state.yearOptions = [];
            state.error = null;
            state.loading = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchPaymentDashboardCreditDebitTrend.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchPaymentDashboardCreditDebitTrend.fulfilled, (state, action) => {
                state.loading = false;
                state.points = action.payload.points;
                state.yearOptions = action.payload.yearOptions;
            })
            .addCase(fetchPaymentDashboardCreditDebitTrend.rejected, (state, action) => {
                state.loading = false;
                state.error = (action.payload as string) || 'Failed to load trend';
            });
    },
});

export const { clearPaymentDashboardTrend } = paymentDashboardTrendSlice.actions;
