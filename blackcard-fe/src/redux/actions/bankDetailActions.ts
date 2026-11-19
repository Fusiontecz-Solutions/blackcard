import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosPut, axiosDelete } from '../axios';
import type {
    CreateBankDetailPayload,
    BulkCreateBankDetailPayload,
    UpdateBankDetailPayload,
    GetBankDetailsParams,
} from '@/types/bankDetailTypes';

// Create a new bank detail
export const createBankDetail = createAsyncThunk(
    'bankDetail/create',
    async (data: CreateBankDetailPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/bank-details', data);
            return response.data;
        } catch (error: any) {
            console.error('Create bank detail error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create bank detail'
            );
        }
    }
);

// Create multiple bank details at once
export const bulkCreateBankDetails = createAsyncThunk(
    'bankDetail/bulkCreate',
    async (data: BulkCreateBankDetailPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/bank-details/bulk', data);
            return response.data;
        } catch (error: any) {
            console.error('Bulk create bank details error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create bank details'
            );
        }
    }
);

// Get all bank details for a specific application
export const getBankDetails = createAsyncThunk(
    'bankDetail/getAll',
    async (params: GetBankDetailsParams, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            queryParams.append('application', params.application);

            const url = `/bank-details?${queryParams.toString()}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get bank details error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch bank details'
            );
        }
    }
);

// Get bank detail by MongoDB ObjectId
export const getBankDetailById = createAsyncThunk(
    'bankDetail/getById',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/bank-details/${id}`);
            return response.data;
        } catch (error: any) {
            console.error('Get bank detail by ID error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch bank detail'
            );
        }
    }
);

// Update bank detail
export const updateBankDetail = createAsyncThunk(
    'bankDetail/update',
    async ({ id, data }: { id: string; data: UpdateBankDetailPayload }, { rejectWithValue }) => {
        try {
            const response = await axiosPut(`/bank-details/${id}`, data);
            return response.data;
        } catch (error: any) {
            console.error('Update bank detail error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update bank detail'
            );
        }
    }
);

// Delete bank detail
export const deleteBankDetail = createAsyncThunk(
    'bankDetail/delete',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/bank-details/${id}`);
            return { ...response.data, deletedId: id };
        } catch (error: any) {
            console.error('Delete bank detail error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete bank detail'
            );
        }
    }
);

