import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosDelete } from '../axios';
import type {
    CreateNotePayload,
    GetNotesParams,
} from '@/types/noteTypes';

// Create Note
export const createNote = createAsyncThunk(
    'note/create',
    async (payload: CreateNotePayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/notes', payload);
            return response.data;
        } catch (error: any) {
            console.error('Create note error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create note'
            );
        }
    }
);

// Get All Notes
export const getNotes = createAsyncThunk(
    'note/getAll',
    async (params: GetNotesParams = {}, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            if (params.application) queryParams.append('application', params.application);

            const url = `/notes${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get notes error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch notes'
            );
        }
    }
);

// Delete Note
export const deleteNote = createAsyncThunk(
    'note/delete',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/notes/${id}`);
            return { ...response.data, deletedId: id };
        } catch (error: any) {
            console.error('Delete note error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete note'
            );
        }
    }
);

