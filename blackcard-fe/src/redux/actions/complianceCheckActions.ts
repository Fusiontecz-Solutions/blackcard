import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost } from '../axios';
import type {
    CreateOrUpdateComplianceCheckPayload,
    GetComplianceChecksParams,
} from '@/types/complianceCheckTypes';

// Create or update a compliance check
export const createOrUpdateComplianceCheck = createAsyncThunk(
    'complianceCheck/createOrUpdate',
    async (data: CreateOrUpdateComplianceCheckPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/compliance-checks', data);
            return response.data;
        } catch (error: any) {
            console.error('Create or update compliance check error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to save compliance check'
            );
        }
    }
);

// Get all compliance checks for a specific application
export const getComplianceChecks = createAsyncThunk(
    'complianceCheck/getAll',
    async (params: GetComplianceChecksParams, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            queryParams.append('application', params.application);

            const url = `/compliance-checks?${queryParams.toString()}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get compliance checks error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch compliance checks'
            );
        }
    }
);

