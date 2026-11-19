import { createSlice } from '@reduxjs/toolkit';
import { createFundingCall, getFundingCalls } from '../actions/fundingCallActions';

interface FundingCallCreateState {
  loading: boolean;
  success: boolean;
  error: string | null;
  data: any | null;
}

interface FundingCallListState {
  loading: boolean;
  data: any[];
  error: string | null;
}

const createInitialState: FundingCallCreateState = {
  loading: false,
  success: false,
  error: null,
  data: null,
};

const listInitialState: FundingCallListState = {
  loading: false,
  data: [],
  error: null,
};

export const createFundingCallSlice = createSlice({
  name: 'createFundingCall',
  initialState: createInitialState,
  reducers: {
    resetCreateFundingCall: (state) => {
      state.loading = false;
      state.success = false;
      state.error = null;
      state.data = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createFundingCall.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(createFundingCall.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.data = action.payload?.data ?? action.payload;
      })
      .addCase(createFundingCall.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
      });
  },
});

export const fundingCallsSlice = createSlice({
  name: 'fundingCalls',
  initialState: listInitialState,
  reducers: {
    clearFundingCalls: (state) => {
      state.loading = false;
      state.data = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getFundingCalls.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getFundingCalls.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload?.data ?? action.payload ?? [];
      })
      .addCase(getFundingCalls.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { resetCreateFundingCall } = createFundingCallSlice.actions;
export const { clearFundingCalls } = fundingCallsSlice.actions;

