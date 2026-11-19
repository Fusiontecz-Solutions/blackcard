import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost } from '../axios';
import type { GetUsersParams } from '@/types/userTypes';

export interface CreateUserPayload {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: string;
    isActive?: boolean;
    phone?: string;
}

// Fetch users with optional role filter
export const fetchUsers = createAsyncThunk(
    'user/fetchUsers',
    async (params: GetUsersParams = {}, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            if (params.role) queryParams.append('role', params.role);
            if (params.page) queryParams.append('page', params.page.toString());
            if (params.limit) queryParams.append('limit', params.limit.toString());
            if (params.search) queryParams.append('search', params.search);
            if (params.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());

            const url = `/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Fetch users error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch users'
            );
        }
    }
);

// Fetch users by specific role (convenience action)
export const fetchUsersByRole = createAsyncThunk(
    'user/fetchUsersByRole',
    async (role: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/users?role=${role}`);
            return { role, data: response.data };
        } catch (error: any) {
            console.error('Fetch users by role error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch users'
            );
        }
    }
);

// Create user (Admin only). Backend returns 201 + user.
export const createUser = createAsyncThunk(
    'user/createUser',
    async (payload: CreateUserPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/users', payload);
            return response.data;
        } catch (error: any) {
            const message = error.response?.data?.message || 'Failed to create user';
            return rejectWithValue(message);
        }
    }
);

