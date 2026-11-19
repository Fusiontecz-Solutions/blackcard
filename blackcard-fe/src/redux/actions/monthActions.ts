import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosPut, axiosDelete } from '../axios';
import type {
    CreateMonthPayload,
    UpdateMonthPayload,
    GetMonthsParams,
} from '@/types/monthTypes';

// Create a new month
export const createMonth = createAsyncThunk(
    'month/create',
    async (data: CreateMonthPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/months', data);
            return response.data;
        } catch (error: any) {
            console.error('Create month error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create month'
            );
        }
    }
);

// Get all months for a specific application
export const getMonths = createAsyncThunk(
    'month/getAll',
    async (params: GetMonthsParams, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            queryParams.append('application', params.application);

            const url = `/months?${queryParams.toString()}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get months error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch months'
            );
        }
    }
);

// Get month by MongoDB ObjectId
export const getMonthById = createAsyncThunk(
    'month/getById',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/months/${id}`);
            return response.data;
        } catch (error: any) {
            console.error('Get month by ID error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch month'
            );
        }
    }
);

// Update month
export const updateMonth = createAsyncThunk(
    'month/update',
    async ({ id, data }: { id: string; data: UpdateMonthPayload }, { rejectWithValue }) => {
        try {
            const response = await axiosPut(`/months/${id}`, data);
            return response.data;
        } catch (error: any) {
            console.error('Update month error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update month'
            );
        }
    }
);

// Delete month
export const deleteMonth = createAsyncThunk(
    'month/delete',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/months/${id}`);
            return { ...response.data, deletedId: id };
        } catch (error: any) {
            console.error('Delete month error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete month'
            );
        }
    }
);

