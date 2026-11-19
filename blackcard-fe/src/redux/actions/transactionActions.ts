import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosPut, axiosDelete } from '../axios';
import type {
    CreateTransactionPayload,
    BulkCreateTransactionPayload,
    UpdateTransactionPayload,
    GetTransactionsParams,
} from '@/types/transactionTypes';

// Create a new transaction
export const createTransaction = createAsyncThunk(
    'transaction/create',
    async (data: CreateTransactionPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/transactions', data);
            return response.data;
        } catch (error: any) {
            console.error('Create transaction error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create transaction'
            );
        }
    }
);

// Bulk create transactions
export const bulkCreateTransactions = createAsyncThunk(
    'transaction/bulkCreate',
    async (data: BulkCreateTransactionPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/transactions/bulk', data);
            return response.data;
        } catch (error: any) {
            console.error('Bulk create transactions error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create transactions'
            );
        }
    }
);

// Get all transactions for a specific month
export const getTransactions = createAsyncThunk(
    'transaction/getAll',
    async (params: GetTransactionsParams, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            queryParams.append('monthId', params.monthId);

            const url = `/transactions?${queryParams.toString()}`;
            const response = await axiosGet(url);
            // Include monthId in the response so we can store empty arrays
            return { ...response.data, monthId: params.monthId };
        } catch (error: any) {
            console.error('Get transactions error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch transactions'
            );
        }
    }
);

// Get transaction by MongoDB ObjectId
export const getTransactionById = createAsyncThunk(
    'transaction/getById',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/transactions/${id}`);
            return response.data;
        } catch (error: any) {
            console.error('Get transaction by ID error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch transaction'
            );
        }
    }
);

// Update transaction
export const updateTransaction = createAsyncThunk(
    'transaction/update',
    async ({ id, data }: { id: string; data: UpdateTransactionPayload }, { rejectWithValue }) => {
        try {
            const response = await axiosPut(`/transactions/${id}`, data);
            return response.data;
        } catch (error: any) {
            console.error('Update transaction error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update transaction'
            );
        }
    }
);

// Delete transaction
export const deleteTransaction = createAsyncThunk(
    'transaction/delete',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/transactions/${id}`);
            return { ...response.data, deletedId: id };
        } catch (error: any) {
            console.error('Delete transaction error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete transaction'
            );
        }
    }
);

