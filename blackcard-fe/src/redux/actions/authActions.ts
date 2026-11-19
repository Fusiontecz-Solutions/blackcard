import { axiosPost } from "../axios";
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { LoginCredentials, SignupCredentials } from "../../types/authTypes";
import { validateStandardPassword } from "@/lib/passwordValidation";

export const login = createAsyncThunk('auth/login', async (payload: LoginCredentials, { rejectWithValue }) => {
    try {
        const normalizedEmail = String(payload.email ?? '').trim().toLowerCase();
        const response = await axiosPost('/auth/login', {
            ...payload,
            email: normalizedEmail,
        });
        return response.data;
    } catch (error: any) {
        console.log(error, "error", error.response, 'error.response');
        return rejectWithValue(error.response.data.message || 'Login failed');
    }
});

export const signup = createAsyncThunk('auth/signup', async (credentials: SignupCredentials, { rejectWithValue }) => {
    try {
        const response = await axiosPost('/auth/register', credentials);
        return response.data;
    } catch (error: any) {
        return rejectWithValue(error.response.data.message || 'Signup failed');
    }
});

export const verifyOtp = createAsyncThunk('auth/verify-otp', async ({ userId, otp }: { userId: string, otp: string }, { rejectWithValue }) => {
    try {
        const response = await axiosPost('/auth/verify-otp', { userId, otp });
        console.log(response.data, "response data");
        return response.data;
    } catch (error: any) {
        console.log('error', error);
        return rejectWithValue(error.response.data.message || 'Verify OTP failed');
    }
});

export const sendBankEditOtp = createAsyncThunk('auth/send-bank-edit-otp', async (_, { rejectWithValue }) => {
    try {
        const response = await axiosPost('/auth/send-bank-edit-otp');
        return response.data;
    } catch (error: any) {
        return rejectWithValue(error.response?.data?.message || 'Failed to send OTP');
    }
});

export const verifyBankEditOtp = createAsyncThunk(
    'auth/verify-bank-edit-otp',
    async ({ otp }: { otp: string }, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/auth/verify-bank-edit-otp', { otp });
            return response.data;
        } catch (error: any) {
            return rejectWithValue(error.response?.data?.message || 'Verify OTP failed');
        }
    }
);

export const forgotPassword = createAsyncThunk('auth/forgot-password', async (email: string, { rejectWithValue }) => {
    try {
        const normalizedEmail = String(email ?? '').trim().toLowerCase();
        const response = await axiosPost('/auth/forgot-password', { email: normalizedEmail });
        console.log(response.data, "response data");
        return response.data;
    } catch (error: any) {
        console.log('error', error);
        return rejectWithValue(error.response.data.message || 'Forgot password failed');
    }
});

export const resetPassword = createAsyncThunk('auth/reset-password', async ({ userId, password }: { userId: string, password: string }, { rejectWithValue }) => {
    try {
        const validationError = validateStandardPassword(String(password ?? ''));
        if (validationError) {
            return rejectWithValue(validationError);
        }
        const response = await axiosPost('/auth/reset-password', { userId, password });
        console.log(response.data, "response data");
        return response.data;
    } catch (error: any) {
        console.log('error', error);
        return rejectWithValue(error?.response?.data?.message || 'Reset password failed');
    }
});

export const logout = createAsyncThunk('auth/logout', async (_, { rejectWithValue }) => {
    try {
        const response = await axiosPost('/auth/logout');
        console.log(response.data, "response data");
        return response.data;
    } catch (error: any) {
        return rejectWithValue(error.response.data.message || 'Logout failed');
    }
});