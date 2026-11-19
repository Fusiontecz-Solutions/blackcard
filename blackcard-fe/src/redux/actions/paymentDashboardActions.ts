import { createAsyncThunk } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import { axiosGet } from '../axios';
import type {
    FailedPaymentDebitSummary,
    MoneyFlowPoint,
    PaymentDashboardData,
} from '@/types/paymentDashboardTypes';

/** Aggregates all funded deals + payments in one request — allow longer than default 25s. */
const PAYMENT_DASHBOARD_REQUEST_TIMEOUT_MS = 180_000;

function resolvePaymentDashboardFetchError(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const resp = (error as { response?: { data?: unknown; status?: number } }).response;
        const data = resp?.data;
        if (data && typeof data === 'object') {
            const msg = (data as { message?: unknown }).message;
            if (typeof msg === 'string' && msg.trim()) return msg.trim();
        }
        if (resp?.status === 401) return 'Session expired — please sign in again.';
        if (resp?.status === 503) return 'Payment dashboard temporarily unavailable — try again.';
    }
    if (isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || String(error.message ?? '').toLowerCase().includes('timeout')) {
            return 'Payment dashboard timed out — many deals can make this slow; try again in a moment.';
        }
        if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
            return 'Cannot reach the server — check that the API is running and VITE_API_BASE_URL is correct.';
        }
        if (error.message?.trim()) return error.message.trim();
    }
    return 'Failed to fetch payment dashboard';
}

function normalizeMoneyFlowPoints(value: unknown): MoneyFlowPoint[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
        if (!item || typeof item !== 'object') {
            return { label: '', inflow: 0, outflow: 0 };
        }
        const o = item as Record<string, unknown>;
        return {
            label: String(o.label ?? o.name ?? ''),
            inflow: Number(o.inflow) || 0,
            outflow: Number(o.outflow) || 0,
        };
    });
}

function cardOptionalNumber(raw: Record<string, unknown>, key: string): number | undefined {
    if (!(key in raw)) return undefined;
    const n = Number(raw[key]);
    return Number.isFinite(n) ? n : undefined;
}

/** Normalize backend `cards.failedPayment` (DEBIT-based) — returns undefined when payload omits it. */
function normalizeFailedPaymentDebit(value: unknown): FailedPaymentDebitSummary | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const o = value as Record<string, unknown>;
    const totalAmountRaw = Number(o.totalAmount);
    const countRaw = Number(o.count);
    const totalAmount = Number.isFinite(totalAmountRaw) ? totalAmountRaw : 0;
    const count = Number.isFinite(countRaw) ? Math.max(0, Math.round(countRaw)) : 0;
    return { totalAmount, count };
}

/** Merge API payload with safe defaults so cards/charts never flicker with undefined. */
export function normalizePaymentDashboardData(raw: unknown): PaymentDashboardData {
    const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const cardsRaw =
        root.cards && typeof root.cards === 'object' ? (root.cards as Record<string, unknown>) : {};
    const mfRaw =
        root.moneyFlow && typeof root.moneyFlow === 'object'
            ? (root.moneyFlow as Record<string, unknown>)
            : {};
    const trendRaw =
        root.creditDebitTrend && typeof root.creditDebitTrend === 'object'
            ? (root.creditDebitTrend as Record<string, unknown>)
            : {};

    const fundedTotal = cardOptionalNumber(cardsRaw, 'fundedTotal');
    const netFundingTotal = cardOptionalNumber(cardsRaw, 'netFundingTotal');
    const abovePrincipalTotal = cardOptionalNumber(cardsRaw, 'abovePrincipalTotal');
    const abovePrincipalPositiveSum = cardOptionalNumber(cardsRaw, 'abovePrincipalPositiveSum');
    const abovePrincipalNegativeSum = cardOptionalNumber(cardsRaw, 'abovePrincipalNegativeSum');
    const dealsWithPositiveGap = cardOptionalNumber(cardsRaw, 'dealsWithPositiveGap');
    const dealsWithNegativeGap = cardOptionalNumber(cardsRaw, 'dealsWithNegativeGap');
    const dealsWithZeroGap = cardOptionalNumber(cardsRaw, 'dealsWithZeroGap');
    const failedPayment = normalizeFailedPaymentDebit(cardsRaw.failedPayment);

    const chartYearOptions = Array.isArray(root.chartYearOptions)
        ? root.chartYearOptions
              .map((y) => Number(y))
              .filter((y) => Number.isFinite(y))
              .map((y) => Math.floor(y))
        : undefined;

    return {
cards: {
            dueToday: Number(cardsRaw.dueToday) || 0,
            dueNext7Days: Number(cardsRaw.dueNext7Days) || 0,
            totalPayback: Number(cardsRaw.totalPayback) || 0,
            totalDues: Number(cardsRaw.totalDues) || 0,
            recovered: Number(cardsRaw.recovered) || 0,
            defaults: Number(cardsRaw.defaults) || 0,
            totalDeals: Number(cardsRaw.totalDeals) || 0,
            activeDeals: Number(cardsRaw.activeDeals) || 0,
            collectionEfficiency: Number(cardsRaw.collectionEfficiency) || 0,
            ...(fundedTotal !== undefined ? { fundedTotal } : {}),
            ...(netFundingTotal !== undefined ? { netFundingTotal } : {}),
            ...(abovePrincipalTotal !== undefined ? { abovePrincipalTotal } : {}),
            ...(abovePrincipalPositiveSum !== undefined ? { abovePrincipalPositiveSum } : {}),
            ...(abovePrincipalNegativeSum !== undefined ? { abovePrincipalNegativeSum } : {}),
            ...(dealsWithPositiveGap !== undefined
                ? { dealsWithPositiveGap: Math.round(dealsWithPositiveGap) }
                : {}),
            ...(dealsWithNegativeGap !== undefined
                ? { dealsWithNegativeGap: Math.round(dealsWithNegativeGap) }
                : {}),
            ...(dealsWithZeroGap !== undefined ? { dealsWithZeroGap: Math.round(dealsWithZeroGap) } : {}),
            ...(failedPayment !== undefined ? { failedPayment } : {}),
        },
        moneyFlow: {
            monthly: normalizeMoneyFlowPoints(mfRaw.monthly),
            weekly: normalizeMoneyFlowPoints(mfRaw.weekly),
            yearly: normalizeMoneyFlowPoints(mfRaw.yearly),
        },
        creditDebitTrend: {
            monthly: normalizeMoneyFlowPoints(trendRaw.monthly),
            weekly: normalizeMoneyFlowPoints(trendRaw.weekly),
            monthlyInYear: normalizeMoneyFlowPoints(trendRaw.monthlyInYear),
            yearly: normalizeMoneyFlowPoints(trendRaw.yearly),
        },
        ...(chartYearOptions && chartYearOptions.length > 0 ? { chartYearOptions } : {}),
    };
}

type PaymentDashForCondition = {
    paymentDashboard: { loading: boolean; isRefreshing: boolean };
};

export type FetchPaymentFinancialOverviewSummaryArg = {
    chartYear?: number;
    chartMonth?: number | 'all';
    /** Organization filter — omit or `all` for portfolio-wide totals. */
    organization?: string;
    /** When true, bypass the in-flight guard (manual refresh). */
    force?: boolean;
};

export const fetchPaymentFinancialOverviewSummary = createAsyncThunk<
    PaymentDashboardData,
    FetchPaymentFinancialOverviewSummaryArg | void,
    { rejectValue: string }
>(
    'paymentDashboard/financialOverviewSummary',
    async (arg, { rejectWithValue }) => {
        try {
            const params = new URLSearchParams();
            const chartYear =
                arg && typeof arg === 'object' && arg.chartYear != null && Number.isFinite(arg.chartYear)
                    ? Math.floor(arg.chartYear)
                    : undefined;
            const chartMonth =
                arg && typeof arg === 'object' ? arg.chartMonth : undefined;
            const organization =
                arg && typeof arg === 'object' && arg.organization?.trim()
                    ? arg.organization.trim()
                    : undefined;

            if (chartYear != null) {
                params.set('chartYear', String(chartYear));
            }
            if (chartMonth === 'all') {
                params.set('chartMonth', 'all');
            } else if (chartMonth != null && Number.isFinite(chartMonth)) {
                params.set('chartMonth', String(Math.floor(chartMonth)));
            }
            if (organization && organization.toLowerCase() !== 'all') {
                params.set('organization', organization);
            }

            const qs = params.toString();
            const response = await axiosGet(
                `/collection-payments/financial-overview/summary${qs ? `?${qs}` : ''}`,
                { timeout: PAYMENT_DASHBOARD_REQUEST_TIMEOUT_MS },
            );
            const body = response?.data ?? {};
            const raw = (body as { data?: unknown }).data ?? body;
            return normalizePaymentDashboardData(raw);
        } catch (error: unknown) {
            return rejectWithValue(resolvePaymentDashboardFetchError(error));
        }
    },
    {
        condition: (arg, { getState }) => {
            if (arg && typeof arg === 'object' && arg.force) return true;
            const s = (getState() as PaymentDashForCondition).paymentDashboard;
            return !s?.loading;
        },
    },
);

export type GetPaymentDashboardArg = {
    /** Organization filter — omit or `all` for portfolio-wide totals. */
    organization?: string;
};

export const getPaymentDashboard = createAsyncThunk<
    PaymentDashboardData,
    GetPaymentDashboardArg | void,
    { rejectValue: string }
>(
    'paymentDashboard/get',
    async (arg, { rejectWithValue }) => {
        try {
            const organization =
                arg && typeof arg === 'object' && arg.organization?.trim()
                    ? arg.organization.trim()
                    : undefined;
            const response = await axiosGet('/collection-payments/dashboard', {
                timeout: PAYMENT_DASHBOARD_REQUEST_TIMEOUT_MS,
                ...(organization && organization.toLowerCase() !== 'all'
                    ? { params: { organization } }
                    : {}),
            });
            const body = response?.data ?? {};
            const raw = (body as { data?: unknown }).data ?? body;
            return normalizePaymentDashboardData(raw);
        } catch (error: unknown) {
            return rejectWithValue(resolvePaymentDashboardFetchError(error));
        }
    },
    {
        condition: (_, { getState }) => {
            const s = (getState() as PaymentDashForCondition).paymentDashboard;
            return !s?.loading;
        },
    },
);
