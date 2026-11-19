import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosPut, axiosDelete } from '../axios';
import type {
    CreateCommentPayload,
    UpdateCommentPayload,
    GetCommentsParams
} from '@/types/commentTypes';

// Create a new comment on an application
export const createComment = createAsyncThunk(
    'comment/create',
    async (
        { applicationId, data }: { applicationId: string; data: CreateCommentPayload },
        { rejectWithValue }
    ) => {
        try {
            const response = await axiosPost(`/comments/application/${applicationId}`, data);
            return response.data;
        } catch (error: any) {
            console.error('Create comment error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create comment'
            );
        }
    }
);

// Get all comments for an application
export const getCommentsByApplication = createAsyncThunk(
    'comment/getByApplication',
    async (
        { applicationId, params }: { applicationId: string; params?: GetCommentsParams },
        { rejectWithValue }
    ) => {
        try {
            const queryParams = new URLSearchParams();
            if (params?.page) queryParams.append('page', params.page.toString());
            if (params?.limit) queryParams.append('limit', params.limit.toString());
            if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
            if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);

            const queryString = queryParams.toString();
            const url = `/comments/application/${applicationId}${queryString ? `?${queryString}` : ''}`;

            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get comments error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch comments'
            );
        }
    }
);

// Get comment count for an application
export const getCommentCount = createAsyncThunk(
    'comment/getCount',
    async (applicationId: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/comments/application/${applicationId}/count`);
            return response.data;
        } catch (error: any) {
            console.error('Get comment count error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch comment count'
            );
        }
    }
);

// Get single comment by ID
export const getCommentById = createAsyncThunk(
    'comment/getById',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/comments/${id}`);
            return response.data;
        } catch (error: any) {
            console.error('Get comment by ID error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch comment'
            );
        }
    }
);

// Update comment
export const updateComment = createAsyncThunk(
    'comment/update',
    async (
        { id, data }: { id: string; data: UpdateCommentPayload },
        { rejectWithValue }
    ) => {
        try {
            const response = await axiosPut(`/comments/${id}`, data);
            return response.data;
        } catch (error: any) {
            console.error('Update comment error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update comment'
            );
        }
    }
);

// Delete comment (soft delete)
export const deleteComment = createAsyncThunk(
    'comment/delete',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/comments/${id}`);
            return { ...response.data, deletedId: id };
        } catch (error: any) {
            console.error('Delete comment error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete comment'
            );
        }
    }
);

