import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost } from '../axios';
import type {
    FetchFinalAnswersParams,
    SaveFinalAnswerPayload,
    SaveFinalAnswersPayload,
} from '@/types/finalAnswerTypes';

export const fetchFinalAnswers = createAsyncThunk(
    'finalAnswers/fetchAll',
    async ({ applicationId }: FetchFinalAnswersParams, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            queryParams.append('applicationId', applicationId);
            const response = await axiosGet(`/final-answers?${queryParams.toString()}`);
            return {
                applicationId,
                data: response.data.data || response.data,
            };
        } catch (error: any) {
            console.error('Fetch final answers error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch final answers'
            );
        }
    }
);

export const saveFinalAnswer = createAsyncThunk(
    'finalAnswers/saveOne',
    async (payload: SaveFinalAnswerPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/final-answers', payload);
            return {
                applicationId: payload.applicationId,
                data: response.data.data || response.data,
            };
        } catch (error: any) {
            console.error('Save final answer error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to save final answer'
            );
        }
    }
);

export const saveFinalAnswers = createAsyncThunk(
    'finalAnswers/saveMany',
    async (payload: SaveFinalAnswersPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/final-answers/bulk', payload, {
                timeout: 120_000,
            });
            return {
                applicationId: payload.applicationId,
                data: response.data.data || response.data,
            };
        } catch (error: any) {
            console.error('Save final answers (bulk) error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to save final answers'
            );
        }
    }
);

