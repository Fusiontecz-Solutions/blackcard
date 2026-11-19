import { createAsyncThunk } from "@reduxjs/toolkit";
import { axiosGet, axiosPost } from "../axios";

export const fetchAiAnalyses = createAsyncThunk(
  "aiAnalysis/fetchAll",
  async (bankAnalysisId: string, { rejectWithValue }) => {
    try {
      const res = await axiosGet(`/ai-analysis/${bankAnalysisId}/ai-analyses`);
      return res.data.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);

export const analyzeAiDocument = createAsyncThunk(
  "aiAnalysis/analyze",
  async (
    { bankAnalysisId, payload }: { bankAnalysisId: string; payload: any },
    { rejectWithValue }
  ) => {
    try {
      const res = await axiosPost(`/ai-analysis/${bankAnalysisId}/ai-analyze`, payload, { timeout: 180000 });
      return res.data.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);

export const recategorizeAiDocument = createAsyncThunk(
  "aiAnalysis/recategorize",
  async (
    { bankAnalysisId, payload }: { bankAnalysisId: string; payload: any },
    { rejectWithValue }
  ) => {
    try {
      const res = await axiosPost(`/ai-analysis/${bankAnalysisId}/recategorize`, payload);
      return res.data.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);

export const recategorizeAllAi = createAsyncThunk(
  "aiAnalysis/recategorizeAll",
  async (bankAnalysisId: string, { rejectWithValue }) => {
    try {
      const res = await axiosPost(`/ai-analysis/${bankAnalysisId}/recategorize-all`);
      return res.data.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);

export const fetchCombinedAi = createAsyncThunk(
  "aiAnalysis/combined",
  async (bankAnalysisId: string, { rejectWithValue }) => {
    try {
      const res = await axiosGet(`/ai-analysis/${bankAnalysisId}/ai-combined`);
      return res.data.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);

export const setMcaTagAction = createAsyncThunk(
  "aiAnalysis/setTag",
  async (payload: { description?: string; keyword?: string; decision: string; removeTag?: boolean; key?: string }, { rejectWithValue }) => {
    try {
      const res = await axiosPost(`/ai-analysis/mca-tags`, payload);
      return res.data.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);

export const fetchMcaTags = createAsyncThunk(
  "aiAnalysis/fetchTags",
  async (_, { rejectWithValue }) => {
    try {
      const res = await axiosGet(`/ai-analysis/mca-tags`);
      return res.data.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);

export const fetchCategories = createAsyncThunk(
  "aiAnalysis/fetchCategories",
  async (_, { rejectWithValue }) => {
    try {
      const res = await axiosGet(`/ai-analysis/categories`);
      return res.data.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);
