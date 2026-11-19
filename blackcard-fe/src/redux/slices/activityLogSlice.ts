import { createSlice } from '@reduxjs/toolkit';
import { getActivityLogs, type ActivityLog } from '../actions/activityLogActions';
import { getApplicationActivityLogs, type ApplicationActivityLog } from '../actions/applicationActivityLogActions';

interface ActivityLogState {
  logs: (ActivityLog | ApplicationActivityLog)[];
  loading: boolean;
  error: string | null;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const initialState: ActivityLogState = {
  logs: [],
  loading: false,
  error: null,
  pagination: {
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  },
};

const activityLogSlice = createSlice({
  name: 'activityLogs',
  initialState,
  reducers: {
    clearActivityLogs: (state) => {
      state.logs = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getActivityLogs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getActivityLogs.fulfilled, (state, action) => {
        state.loading = false;
        const payload = action.payload;
        state.logs = payload?.data ?? payload ?? [];
        if (payload?.pagination) {
          state.pagination = payload.pagination;
        }
      })
      .addCase(getActivityLogs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(getApplicationActivityLogs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getApplicationActivityLogs.fulfilled, (state, action) => {
        state.loading = false;
        const payload = action.payload;
        state.logs = payload?.data ?? payload ?? [];
      })
      .addCase(getApplicationActivityLogs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearActivityLogs } = activityLogSlice.actions;
export default activityLogSlice.reducer;
