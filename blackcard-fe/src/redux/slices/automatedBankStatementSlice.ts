import { createSlice } from '@reduxjs/toolkit';
import {
  uploadAndDownloadCsv,
  uploadBankStatement,
} from '../actions/automatedBankStatementActions';

interface AutomatedBankStatementState {
  loading: boolean;
  data: any | null;
  error: string | null;
}

const initialState: AutomatedBankStatementState = {
  loading: false,
  data: null,
  error: null,
};

export const automatedBankStatementSlice = createSlice({
  name: 'automatedBankStatement',
  initialState,
  reducers: {
    resetAutomatedBankStatement: (state) => {
      state.loading = false;
      state.data = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(uploadBankStatement.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(uploadBankStatement.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload?.data ?? action.payload ?? null;
      })
      .addCase(uploadBankStatement.rejected, (state, action) => {
        state.loading = false;
        state.error =
          (action.payload as string) ||
          'Failed to upload and parse bank statement';
      });

    // Keep same UI loading/error state when downloading CSV too.
    builder
      .addCase(uploadAndDownloadCsv.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(uploadAndDownloadCsv.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload ?? null;
      })
      .addCase(uploadAndDownloadCsv.rejected, (state, action) => {
        state.loading = false;
        state.error =
          (action.payload as string) || 'Failed to upload and download CSV';
      });
  },
});

export const { resetAutomatedBankStatement } = automatedBankStatementSlice.actions;

