import { createAsyncThunk } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import { axiosGet } from '../axios';
import type { MoneyFlowPoint } from '@/types/paymentDashboardTypes';

export type PaymentDashboardTrendView = 'monthly' | 'weekly' | 'monthlyInYear' | 'yearly';

export type FetchPaymentDashboardTrendArg = {
    view: PaymentDashboardTrendView;
    year: number;
    month: number | 'all';
    /** Organization filter — omit or `all` for no filter. */
    organization?: string;
};

export type PaymentDashboardTrendPayload = {
    points: MoneyFlowPoint[];
    yearOptions: number[];
};

function resolveTrendError(error: unknown): string {
    if (isAxiosError(error)) {
        const msg = (error.response?.data as { message?: string })?.message;
        if (msg?.trim()) return msg.trim();
        if (error.code === 'ECONNABORTED') return 'Chart data timed out — try again.';
    }
    return 'Failed to load credit vs debit trend';
}

export const fetchPaymentDashboardCreditDebitTrend = createAsyncThunk<
    PaymentDashboardTrendPayload,
    FetchPaymentDashboardTrendArg,
    { rejectValue: string }
>('paymentDashboardTrend/fetch', async (arg, { rejectWithValue }) => {
    try {
        const organization =
            arg.organization?.trim() && arg.organization.trim().toLowerCase() !== 'all'
                ? arg.organization.trim()
                : undefined;
        const response = await axiosGet('/collection-payments/dashboard/credit-debit-trend', {
            params: {
                view: arg.view,
                year: arg.year,
                month: arg.month === 'all' ? 'all' : arg.month,
                ...(organization ? { organization } : {}),
            },
            timeout: 120_000,
        });
        const body = response?.data ?? {};
        const data = (body as { data?: PaymentDashboardTrendPayload }).data ?? body;
        const points = Array.isArray((data as PaymentDashboardTrendPayload).points)
            ? (data as PaymentDashboardTrendPayload).points
            : [];
        const yearOptions = Array.isArray((data as PaymentDashboardTrendPayload).yearOptions)
            ? (data as PaymentDashboardTrendPayload).yearOptions
            : [];
        return { points, yearOptions };
    } catch (error: unknown) {
        return rejectWithValue(resolveTrendError(error));
    }
});
