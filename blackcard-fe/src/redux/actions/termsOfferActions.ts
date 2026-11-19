import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosPut, axiosDelete } from '../axios';
import type {
    CreateTermsOfferPayload,
    UpdateTermsOfferPayload,
    GetTermsOffersParams,
} from '@/types/termsOfferTypes';

// Create a new terms offer
export const createTermsOffer = createAsyncThunk(
    'termsOffer/create',
    async (data: CreateTermsOfferPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/terms-offers', data);
            return response.data;
        } catch (error: any) {
            console.error('Create terms offer error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create terms offer'
            );
        }
    }
);

// Get all terms offers with optional filters
export const getTermsOffers = createAsyncThunk(
    'termsOffer/getAll',
    async (params: GetTermsOffersParams = {}, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            if (params.application) queryParams.append('application', params.application);
            if (params.page) queryParams.append('page', params.page.toString());
            if (params.limit) queryParams.append('limit', params.limit.toString());

            const url = `/terms-offers${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get terms offers error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch terms offers'
            );
        }
    }
);

// Get terms offer by MongoDB ObjectId
export const getTermsOfferById = createAsyncThunk(
    'termsOffer/getById',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/terms-offers/${id}`);
            return response.data;
        } catch (error: any) {
            console.error('Get terms offer by ID error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch terms offer'
            );
        }
    }
);

// Get terms offer by numeric termsOfferId
export const getTermsOfferByTermsOfferId = createAsyncThunk(
    'termsOffer/getByTermsOfferId',
    async (termsOfferId: string | number, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/terms-offers/termsOfferId/${termsOfferId}`);
            return response.data;
        } catch (error: any) {
            console.error('Get terms offer by termsOfferId error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch terms offer'
            );
        }
    }
);

// Update terms offer
export const updateTermsOffer = createAsyncThunk(
    'termsOffer/update',
    async ({ id, data }: { id: string; data: UpdateTermsOfferPayload }, { rejectWithValue }) => {
        try {
            const response = await axiosPut(`/terms-offers/${id}`, data);
            return response.data;
        } catch (error: any) {
            console.error('Update terms offer error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update terms offer'
            );
        }
    }
);

// Delete terms offer
export const deleteTermsOffer = createAsyncThunk(
    'termsOffer/delete',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/terms-offers/${id}`);
            return { ...response.data, deletedId: id };
        } catch (error: any) {
            console.error('Delete terms offer error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete terms offer'
            );
        }
    }
);

