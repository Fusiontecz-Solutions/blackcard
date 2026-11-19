import { createAsyncThunk } from "@reduxjs/toolkit";
import { axiosDelete, axiosGet, axiosPost, axiosPut } from "../axios";
import type { CreateIsoPayload, UpdateIsoPayload } from "@/types/isoTypes";

const ISO_BASE = "/iso";

export const createIso = createAsyncThunk(
  "iso/create",
  async (payload: CreateIsoPayload, { rejectWithValue }) => {
    try {
      const response = await axiosPost(ISO_BASE, payload);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to create ISO"
      );
    }
  }
);

export const getIsos = createAsyncThunk(
  "iso/getAll",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet(ISO_BASE);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch ISOs"
      );
    }
  }
);

export const getIsoById = createAsyncThunk(
  "iso/getById",
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await axiosGet(`${ISO_BASE}/${id}`);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch ISO"
      );
    }
  }
);

export const updateIso = createAsyncThunk(
  "iso/update",
  async (
    { id, data }: { id: string; data: UpdateIsoPayload },
    { rejectWithValue }
  ) => {
    try {
      const response = await axiosPut(`${ISO_BASE}/${id}`, data);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to update ISO"
      );
    }
  }
);

export const deleteIso = createAsyncThunk(
  "iso/delete",
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await axiosDelete(`${ISO_BASE}/${id}`);
      return { ...(response.data || {}), deletedId: id };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to delete ISO"
      );
    }
  }
);
