import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosDelete, axiosGet, axiosPost } from '../axios';

export interface CreateCommissionRequestPayload {
    applicationId: string | number;
    companyDeal: string;
    date?: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    email: string;
    fundingAmount: number;
    syndicatorId?: string;
    commissionPercentage: number;
}

export const createCommissionRequest = createAsyncThunk(
    'commissionRequest/create',
    async (payload: CreateCommissionRequestPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/commission-requests', payload);
            return response.data;
        } catch (error: any) {
            console.error('Create commission request error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create commission request'
            );
        }
    }
);

export const getCommissionRequests = createAsyncThunk(
    'commissionRequest/getAll',
    async (_, { rejectWithValue }) => {
        try {
            const response = await axiosGet('/commission-requests');
            return response.data;
        } catch (error: any) {
            console.error('Get commission requests error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch commission requests'
            );
        }
    }
);

export type FundedDealsHistoryFilters = {
    month?: string;
    status?: string;
    brokerId?: string;
};

export const getFundedDeals = createAsyncThunk(
    'commissionRequest/getFundedDeals',
    async (filters: FundedDealsHistoryFilters | undefined, { rejectWithValue }) => {
        try {
            const params: Record<string, string> = {};
            if (filters?.month && filters.month !== 'all') params.month = filters.month;
            if (filters?.status && filters.status !== 'all') params.status = filters.status;
            if (filters?.brokerId && filters.brokerId !== 'all') params.brokerId = filters.brokerId;

            const response = await axiosGet('/commission-requests/funded-deals', { params });
            return response.data;
        } catch (error: any) {
            console.error('Get funded deals error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch funded deals'
            );
        }
    }
);

export type CommissionPortalDashboardParams = {
    startDate?: string;
    endDate?: string;
    trendView?: 'monthly' | 'weekly' | 'yearly';
};

export const getCommissionPortalDashboard = createAsyncThunk(
    'commissionRequest/portalDashboard',
    async (params: CommissionPortalDashboardParams | undefined, { rejectWithValue }) => {
        try {
            const query: Record<string, string> = {};
            if (params?.startDate) query.startDate = params.startDate;
            if (params?.endDate) query.endDate = params.endDate;
            if (params?.trendView) query.trendView = params.trendView;

            const response = await axiosGet('/commission-requests/portal-dashboard', {
                params: query,
            });
            return response.data;
        } catch (error: any) {
            console.error('Get commission portal dashboard error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch commission dashboard'
            );
        }
    }
);

export const updateCommissionRequestStatus = createAsyncThunk(
    'commissionRequest/updateStatus',
    async (
        payload: { id: string; status: 'Pending' | 'Approved' | 'Rejected'; reason?: string },
        { rejectWithValue }
    ) => {
        try {
            const response = await axiosPost(`/commission-requests/${payload.id}/status`, {
                status: payload.status,
                ...(payload.reason ? { reason: payload.reason } : {}),
            });
            return response.data;
        } catch (error: any) {
            console.error('Update commission request status error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update commission request status'
            );
        }
    }
);

export const deleteCommissionRequest = createAsyncThunk(
    'commissionRequest/delete',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/commission-requests/${id}`);
            return response.data;
        } catch (error: any) {
            console.error('Delete commission request error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete commission request'
            );
        }
    }
);

export const regenerateCommissionRequest = createAsyncThunk(
    'commissionRequest/regenerate',
    async (
        payload: { id: string; commissionPercentage: number },
        { rejectWithValue }
    ) => {
        try {
            const response = await axiosPost(
                `/commission-requests/${payload.id}/regenerate`,
                { commissionPercentage: payload.commissionPercentage }
            );
            return response.data;
        } catch (error: any) {
            console.error('Regenerate commission request error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to regenerate commission request'
            );
        }
    }
);


