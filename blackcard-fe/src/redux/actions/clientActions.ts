import { createAsyncThunk } from "@reduxjs/toolkit";
import { axiosGet, axiosPost, axiosPut, axiosDelete } from "../axios";
import type { CreateClientPayload, UpdateClientPayload } from "../../types/clientTypes";

// Create Client
export const createClient = createAsyncThunk(
    'client/create',
    async (payload: CreateClientPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/clients', payload);
            return response.data;
        } catch (error: any) {
            console.error('Create client error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create client'
            );
        }
    }
);

// Get All Clients
export const getClients = createAsyncThunk(
    'client/getAll',
    async (params: { 
        page?: number
        limit?: number
        search?: string
        status?: string
        sortBy?: string
        sortOrder?: 'asc' | 'desc'
    } = {}, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            if (params.page) queryParams.append('page', params.page.toString());
            if (params.limit) queryParams.append('limit', params.limit.toString());
            if (params.search) queryParams.append('search', params.search);
            if (params.status) queryParams.append('status', params.status);
            if (params.sortBy) queryParams.append('sortBy', params.sortBy);
            if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

            const url = `/clients${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get clients error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch clients'
            );
        }
    }
);

// Get Single Client by UUID
export const getClientById = createAsyncThunk(
    'client/getById',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/clients/${id}`);
            return response.data;
        } catch (error: any) {
            console.error('Get client by id error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch client'
            );
        }
    }
);

// Get Single Client by clientId
export const getClientByClientId = createAsyncThunk(
    'client/getByClientId',
    async (clientId: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/clients/clientId/${clientId}`);
            return response.data;
        } catch (error: any) {
            console.error('Get client by clientId error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch client'
            );
        }
    }
);

// Update Client
export const updateClient = createAsyncThunk(
    'client/update',
    async ({ id, data }: UpdateClientPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPut(`/clients/${id}`, data);
            return response.data;
        } catch (error: any) {
            console.error('Update client error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update client'
            );
        }
    }
);

// Delete Client
export const deleteClient = createAsyncThunk(
    'client/delete',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/clients/${id}`);
            return { ...response.data, deletedId: id };
        } catch (error: any) {
            console.error('Delete client error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete client'
            );
        }
    }
);

