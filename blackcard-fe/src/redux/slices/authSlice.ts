import { createSlice } from '@reduxjs/toolkit';
import { login, signup } from '../actions/authActions';

export interface user {
  _id: string,
  firstName: string,
  lastName: string,
  email: string,
  phone?: string,
  role: string,
  isVerified: boolean,
  isActive: boolean,
}

interface LoginData {
  token: string
  user: user
  loading: boolean
  error?: string | null
}

export const loginSlice = createSlice({
  name: 'login',
  initialState: {
    loading: false,
    data: {} as LoginData,
    error: null as string | null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const signupSlice = createSlice({
  name: 'signup',
  initialState: {
    loading: false,
    data: {},
    error: null as string | null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(signup.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(signup.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.error = null;
      })
      .addCase(signup.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});