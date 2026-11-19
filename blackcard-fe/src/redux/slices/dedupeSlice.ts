import { createSlice } from '@reduxjs/toolkit';
import { getApplicationDuplicates, type DuplicateApplication } from '../actions/applicationDedupeActions';

interface DedupeState {
  loading: boolean;
  data: DuplicateApplication[];
  error: string | null;
}

const initialState: DedupeState = {
  loading: false,
  data: [],
  error: null,
};

export const dedupeSlice = createSlice({
  name: 'applicationDedupe',
  initialState,
  reducers: {
    clearDedupe(state) {
      state.data = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getApplicationDuplicates.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getApplicationDuplicates.fulfilled, (state, action) => {
        state.loading = false;
        const payload = action.payload;
        state.data = payload?.data ?? payload ?? [];
      })
      .addCase(getApplicationDuplicates.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearDedupe } = dedupeSlice.actions;
export default dedupeSlice.reducer;

