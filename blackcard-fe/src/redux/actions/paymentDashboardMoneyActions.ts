import { createAsyncThunk } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import type { RootState } from '@/redux/store';
import { isFundedApplication } from '@/lib/paymentDashboardFunded';
import {
    fetchCollectionBalancesForApplicationIds,
    fetchCollectionPaymentsForApplicationsBatched,
    type FundedDealBalanceApiRow,
} from '@/lib/collectionPaymentDashboardApi';
import type { Application } from '@/types/applicationTypes';

export type FetchPaymentDashboardMoneyArg = { force?: boolean };

function isAbortLike(reason: unknown): boolean {
    if (reason && typeof reason === 'object' && 'name' in reason) {
        if ((reason as { name: string }).name === 'AbortError') return true;
    }
    return isAxiosError(reason) && reason.code === 'ERR_CANCELED';
}

function balancesMapToRecord(map: Map<string, FundedDealBalanceApiRow>): Record<string, FundedDealBalanceApiRow> {
    const out: Record<string, FundedDealBalanceApiRow> = {};
    map.forEach((v, k) => {
        out[k] = v;
    });
    return out;
}

export const fetchPaymentDashboardMoney = createAsyncThunk<
    {
        balancesByAppId: Record<string, FundedDealBalanceApiRow>;
        paymentsByApp: Record<string, unknown[]>;
    },
    FetchPaymentDashboardMoneyArg | undefined,
    { rejectValue: string; state: RootState }
>(
    'paymentDashboardMoney/fetch',
    async (_arg, { getState, rejectWithValue, signal }) => {
        const cohort = getState().paymentDashboardCohort;
        const applications = cohort.data as Application[];
        const ids = (applications ?? [])
            .filter(isFundedApplication)
            .map((app) => String(app._id ?? (app as { id?: string }).id ?? '').trim())
            .filter((id) => id.length > 0);

        if (ids.length === 0) {
            return {
                balancesByAppId: {},
                paymentsByApp: {},
            };
        }

        try {
            const settled = await Promise.allSettled([
                fetchCollectionBalancesForApplicationIds(ids, signal),
                fetchCollectionPaymentsForApplicationsBatched(ids, signal),
            ]);

            if (settled[0].status === 'rejected' && isAbortLike(settled[0].reason)) {
                throw settled[0].reason;
            }
            if (settled[1].status === 'rejected' && isAbortLike(settled[1].reason)) {
                throw settled[1].reason;
            }

            const balances: Map<string, FundedDealBalanceApiRow> =
                settled[0].status === 'fulfilled'
                    ? settled[0].value
                    : new Map<string, FundedDealBalanceApiRow>();
            const paymentsByApp: Record<string, unknown[]> =
                settled[1].status === 'fulfilled' ? settled[1].value : {};

            const balFailed = settled[0].status === 'rejected';
            const payFailed = settled[1].status === 'rejected';

            if (settled[0].status === 'rejected') {
                console.error('[PaymentDashboard] balances request failed:', settled[0].reason);
            }
            if (settled[1].status === 'rejected') {
                console.error('[PaymentDashboard] collection-payments batch failed:', settled[1].reason);
            }

            if (balFailed && payFailed) {
                const message =
                    settled[0].status === 'rejected'
                        ? String(
                              (settled[0].reason as { response?: { data?: { message?: string } } })?.response
                                  ?.data?.message ??
                                  (settled[0].reason as Error)?.message ??
                                  'Failed to load payment balances.',
                          )
                        : 'Failed to load payment data.';
                return rejectWithValue(message);
            }

            return {
                balancesByAppId: balancesMapToRecord(balances),
                paymentsByApp,
            };
        } catch (e: unknown) {
            const message =
                (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                (e as Error)?.message ??
                'Failed to load payment balances.';
            return rejectWithValue(message);
        }
    },
    {
        condition: (arg, { getState }) => {
            const cohort = getState().paymentDashboardCohort;
            if (!cohort.fetched) return false;
            if (arg?.force) return true;
            return !getState().paymentDashboardMoney.loading;
        },
    },
);
