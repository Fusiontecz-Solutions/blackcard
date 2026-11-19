import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosDelete, axiosGet, axiosPatch, axiosPost, axiosPut } from '../axios';
import type {
  CreateCollectionPaymentPayload,
  GetCollectionPaymentsParams,
  UpdateCollectionPaymentPayload,
  UpdateDealEconomicsPayload,
  UpdateDealEconomicsResponse,
} from '@/types/collectionPaymentTypes';

export const getCollectionPayments = createAsyncThunk(
  'collectionPayment/getAll',
  async (params: GetCollectionPaymentsParams, { rejectWithValue }) => {
    try {
      const query = new URLSearchParams();
      query.set('applicationId', params.applicationId);
      if (params.dealId && String(params.dealId).trim()) {
        query.set('dealId', String(params.dealId).trim());
      }
      if (params.includeDealView) {
        query.set('includeDealView', 'true');
      }
      const response = await axiosGet(`/collection-payments?${query.toString()}`);
      return {
        ...response.data,
        applicationId: params.applicationId,
        dealId: params.dealId,
        force: !!params.force,
      };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch collection payments');
    }
  },
);

export const createCollectionPayment = createAsyncThunk(
  'collectionPayment/create',
  async (payload: CreateCollectionPaymentPayload, { rejectWithValue }) => {
    try {
      const response = await axiosPost('/collection-payments', payload);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create payment');
    }
  },
);

export const updateCollectionPayment = createAsyncThunk(
  'collectionPayment/update',
  async (
    { id, data }: { id: string; data: UpdateCollectionPaymentPayload },
    { rejectWithValue },
  ) => {
    try {
      const response = await axiosPut(`/collection-payments/${id}`, data);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update payment');
    }
  },
);

export const deleteCollectionPayment = createAsyncThunk(
  'collectionPayment/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await axiosDelete(`/collection-payments/${id}`);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete payment');
    }
  },
);

/** PATCH /collection-payments/deal-economics — updates OfferDecision.fees and Application.commissionAmount. */
export const updateDealEconomics = createAsyncThunk<
  { data: UpdateDealEconomicsResponse } & { applicationId?: string; dealId?: string },
  UpdateDealEconomicsPayload,
  { rejectValue: string }
>(
  'collectionPayment/updateDealEconomics',
  async (payload, { rejectWithValue }) => {
    try {
      const response = await axiosPatch('/collection-payments/deal-economics', payload);
      return {
        data: response.data?.data as UpdateDealEconomicsResponse,
        applicationId: payload.applicationId,
        dealId: payload.dealId,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update deal economics',
      );
    }
  },
);
