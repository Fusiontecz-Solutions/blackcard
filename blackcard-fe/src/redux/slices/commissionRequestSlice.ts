import { createSlice } from '@reduxjs/toolkit';
import type { FundedDealsHistoryFilters } from '../actions/commissionRequestActions';
import {
    createCommissionRequest,
    getCommissionRequests,
    updateCommissionRequestStatus,
    getFundedDeals,
    getCommissionPortalDashboard,
    deleteCommissionRequest,
    regenerateCommissionRequest,
} from '../actions/commissionRequestActions';

export interface FundedDealsSummary {
    totals: {
        dealsFunded: number;
        totalFunded: number;
        commissionTotal: number;
        paid: number;
        processing: number;
        approved: number;
        clawback: number;
        pendingCommission: number;
    };
    byBroker: Array<{
        brokerId: string | null;
        brokerName: string;
        dealsFunded: number;
        totalFunded: number;
        totalCommission: number;
        paidCommission: number;
        pendingCommission: number;
        processingCommission: number;
        approvedCommission: number;
        clawbackCommission: number;
    }>;
}

const emptySummary = (): FundedDealsSummary => ({
    totals: {
        dealsFunded: 0,
        totalFunded: 0,
        commissionTotal: 0,
        paid: 0,
        processing: 0,
        approved: 0,
        clawback: 0,
        pendingCommission: 0,
    },
    byBroker: [],
});

function fundedDealsRequestHasFilters(filters?: FundedDealsHistoryFilters): boolean {
    if (filters == null) return false;
    if (filters.month && filters.month !== 'all') return true;
    if (filters.status && filters.status !== 'all') return true;
    if (filters.brokerId && filters.brokerId !== 'all') return true;
    return false;
}

function parseFundedDealsPayload(payload: unknown): { deals: any[]; summary: FundedDealsSummary } {
    const p = payload as { data?: unknown; summary?: FundedDealsSummary };
    const deals = Array.isArray(p?.data) ? p.data : [];
    const summary = p?.summary ?? emptySummary();
    return { deals, summary };
}

export type CommissionPortalDashboardPayload = {
    dashboardCards: {
        fundedVolume: number;
        netCommission: number;
        paid: number;
        pending: number;
        clawback: number;
        fundedDealsCount: number;
        paidDealsCount: number;
        clawbackDealsCount: number;
        commissionToFundedPercent: number;
    };
    commissionTrend: {
        name: string;
        value: number;
        paid: number;
        pending: number;
        clawback: number;
    }[];
    topIsos: { name: string; amount: number; deals: number }[];
    recentActivity: Array<{
        id: string | number;
        date: string;
        agentName: string;
        dealName: string;
        applicationId: number | null;
        fundedAmount: number;
        commissionAmount: number;
        commissionStatus: string;
        commissionReason: string;
        commissionId: string | null;
    }>;
    range?: { start: string; end: string };
    trendView?: string;
};

interface CommissionRequestState {
    loading: boolean;
    success: boolean;
    error: string | null;
    list: any[];
    listLoading: boolean;
    fundedDeals: any[];
    fundedDealsLoading: boolean;
    fundedDealsSummary: FundedDealsSummary | null;
    monthHistoryDeals: any[];
    monthHistorySummary: FundedDealsSummary | null;
    monthHistoryLoading: boolean;
    portalDashboard: CommissionPortalDashboardPayload | null;
    portalDashboardLoading: boolean;
    portalDashboardError: string | null;
}

const initialState: CommissionRequestState = {
    loading: false,
    success: false,
    error: null,
    list: [],
    listLoading: false,
    fundedDeals: [],
    fundedDealsLoading: false,
    fundedDealsSummary: null,
    monthHistoryDeals: [],
    monthHistorySummary: null,
    monthHistoryLoading: false,
    portalDashboard: null,
    portalDashboardLoading: false,
    portalDashboardError: null,
};

export const commissionRequestSlice = createSlice({
    name: 'commissionRequest',
    initialState,
    reducers: {
        resetCommissionRequest(state) {
            state.loading = false;
            state.success = false;
            state.error = null;
        },
        clearMonthHistory(state) {
            state.monthHistoryDeals = [];
            state.monthHistorySummary = null;
            state.monthHistoryLoading = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(createCommissionRequest.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(createCommissionRequest.fulfilled, (state) => {
                state.loading = false;
                state.success = true;
                state.error = null;
            })
            .addCase(createCommissionRequest.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = (action.payload as string) || 'Failed to create commission request';
            })
            .addCase(getCommissionRequests.pending, (state) => {
                state.listLoading = true;
            })
            .addCase(getCommissionRequests.fulfilled, (state, action) => {
                state.listLoading = false;
                const payload = action.payload as any;
                state.list = Array.isArray(payload?.data) ? payload.data : payload?.data ?? [];
            })
            .addCase(getCommissionRequests.rejected, (state) => {
                state.listLoading = false;
            })
            .addCase(getFundedDeals.pending, (state, action) => {
                const filtered = fundedDealsRequestHasFilters(action.meta.arg);
                if (filtered) state.monthHistoryLoading = true;
                else state.fundedDealsLoading = true;
            })
            .addCase(getFundedDeals.fulfilled, (state, action) => {
                const filtered = fundedDealsRequestHasFilters(action.meta.arg);
                const { deals, summary } = parseFundedDealsPayload(action.payload);
                if (filtered) {
                    state.monthHistoryLoading = false;
                    state.monthHistoryDeals = deals;
                    state.monthHistorySummary = summary;
                } else {
                    state.fundedDealsLoading = false;
                    state.fundedDeals = deals;
                    state.fundedDealsSummary = summary;
                    state.monthHistoryDeals = [];
                    state.monthHistorySummary = null;
                }
            })
            .addCase(getFundedDeals.rejected, (state, action) => {
                const filtered = fundedDealsRequestHasFilters(action.meta.arg);
                if (filtered) {
                    state.monthHistoryLoading = false;
                } else {
                    state.fundedDealsLoading = false;
                }
            })
            .addCase(getCommissionPortalDashboard.pending, (state) => {
                state.portalDashboardLoading = true;
                state.portalDashboardError = null;
            })
            .addCase(getCommissionPortalDashboard.fulfilled, (state, action) => {
                state.portalDashboardLoading = false;
                const p = action.payload as any;
                state.portalDashboard = {
                    dashboardCards: {
                        fundedVolume: p.dashboardCards?.fundedVolume ?? 0,
                        netCommission: p.dashboardCards?.netCommission ?? 0,
                        paid: p.dashboardCards?.paid ?? 0,
                        pending: p.dashboardCards?.pending ?? 0,
                        clawback: p.dashboardCards?.clawback ?? 0,
                        fundedDealsCount: p.dashboardCards?.fundedDealsCount ?? 0,
                        paidDealsCount: p.dashboardCards?.paidDealsCount ?? 0,
                        clawbackDealsCount: p.dashboardCards?.clawbackDealsCount ?? 0,
                        commissionToFundedPercent: p.dashboardCards?.commissionToFundedPercent ?? 0,
                    },
                    commissionTrend: Array.isArray(p.commissionTrend)
                        ? p.commissionTrend.map((row: any) => ({
                              name: String(row?.name ?? ''),
                              value: Number(row?.value ?? 0),
                              paid: Number(row?.paid ?? 0),
                              pending: Number(row?.pending ?? 0),
                              clawback: Number(row?.clawback ?? 0),
                          }))
                        : [],
                    topIsos: Array.isArray(p.topIsos) ? p.topIsos : [],
                    recentActivity: Array.isArray(p.recentActivity) ? p.recentActivity : [],
                    range: p.range,
                    trendView: p.trendView,
                };
            })
            .addCase(getCommissionPortalDashboard.rejected, (state, action) => {
                state.portalDashboardLoading = false;
                state.portalDashboardError = (action.payload as string) || 'Failed to load dashboard';
            })
            .addCase(updateCommissionRequestStatus.fulfilled, (state, action) => {
                const payload = action.payload as any;
                const updated = payload?.data ?? payload;
                if (!updated) return;
                const id = updated._id || updated.id;
                if (!id) return;
                const idx = state.list.findIndex((cr: any) => (cr._id || cr.id) === id);
                if (idx >= 0) {
                    state.list[idx] = {
                        ...state.list[idx],
                        ...updated,
                    };
                }
            })
            .addCase(deleteCommissionRequest.fulfilled, (state, action) => {
                const idFromPayload = (action.payload as any)?.data?._id || (action.payload as any)?.data?.id;
                const id = idFromPayload || action.meta.arg;
                state.list = state.list.filter((cr: any) => (cr._id || cr.id) !== id);
            })
            .addCase(regenerateCommissionRequest.fulfilled, (state, action) => {
                const payload = action.payload as any;
                const updated = payload?.data ?? payload;
                if (!updated) return;
                const id = updated._id || updated.id;
                if (!id) return;
                const idx = state.list.findIndex((cr: any) => (cr._id || cr.id) === id);
                if (idx >= 0) {
                    state.list[idx] = {
                        ...state.list[idx],
                        ...updated,
                    };
                } else {
                    state.list.unshift(updated);
                }
            });
    },
});

export const { resetCommissionRequest, clearMonthHistory } = commissionRequestSlice.actions;
