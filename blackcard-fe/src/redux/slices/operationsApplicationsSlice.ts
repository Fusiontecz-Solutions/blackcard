import { createSlice } from "@reduxjs/toolkit";
import type { Application } from "@/types/applicationTypes";
import { fetchOperationsApplications } from "../actions/operationsApplicationsActions";

export interface OperationsApplicationsState {
  loading: boolean;
  error: string | null;
  data: Application[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null;
  /** Last successful filter (API value). */
  operationsStatus: string | null;
  /** Search string used for the loaded page. */
  search: string;
  latestRequestId: string | null;
}

const initialState: OperationsApplicationsState = {
  loading: false,
  error: null,
  data: [],
  pagination: null,
  operationsStatus: null,
  search: "",
  latestRequestId: null,
};

export const operationsApplicationsSlice = createSlice({
  name: "operationsApplications",
  initialState,
  reducers: {
    clearOperationsApplications: () => ({ ...initialState }),
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOperationsApplications.pending, (state, action) => {
        state.loading = true;
        state.error = null;
        state.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchOperationsApplications.fulfilled, (state, action) => {
        if (
          state.latestRequestId &&
          action.meta.requestId !== state.latestRequestId
        ) {
          return;
        }
        state.loading = false;
        state.data = action.payload.data;
        state.pagination = action.payload.pagination;
        state.operationsStatus = action.payload.operationsStatus;
        state.search = action.payload.search;
        state.error = null;
        state.latestRequestId = null;
      })
      .addCase(fetchOperationsApplications.rejected, (state, action) => {
        if (
          state.latestRequestId &&
          action.meta.requestId !== state.latestRequestId
        ) {
          return;
        }
        state.loading = false;
        state.error =
          (action.payload as string) || "Failed to load applications";
        state.latestRequestId = null;
      });
  },
});

export const { clearOperationsApplications } =
  operationsApplicationsSlice.actions;
