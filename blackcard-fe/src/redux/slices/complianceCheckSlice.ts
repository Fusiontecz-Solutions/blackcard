import { createSlice } from '@reduxjs/toolkit';
import type { ComplianceCheck } from '@/types/complianceCheckTypes';
import {
    createOrUpdateComplianceCheck,
    getComplianceChecks,
} from '../actions/complianceCheckActions';

// Compliance Checks List State
interface ComplianceChecksState {
    data: ComplianceCheck[] | null;
    loading: boolean;
    error: string | null;
}

const initialState: ComplianceChecksState = {
    data: null,
    loading: false,
    error: null,
};

export const complianceChecksSlice = createSlice({
    name: 'complianceChecks',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(getComplianceChecks.pending, (state) => {
                if (state.data === null) {
                    state.loading = true;
                }
                state.error = null;
            })
            .addCase(getComplianceChecks.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                state.error = null;
            })
            .addCase(getComplianceChecks.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            })
            .addCase(createOrUpdateComplianceCheck.fulfilled, (state, action) => {
                const updatedCheck = action.payload?.data ?? action.payload;
                if (!updatedCheck || typeof updatedCheck !== 'object') return;

                if (state.data) {
                    const index = state.data.findIndex(check =>
                        check.question === updatedCheck.question || check._id === updatedCheck._id
                    );
                    if (index !== -1) {
                        state.data[index] = updatedCheck;
                    } else {
                        state.data.push(updatedCheck);
                    }
                } else {
                    state.data = [updatedCheck];
                }
                state.loading = false;
            });
    },
});

// Create or Update Compliance Check State
interface CreateOrUpdateComplianceCheckState {
    data: ComplianceCheck | null;
    loading: boolean;
    error: string | null;
}

const createOrUpdateInitialState: CreateOrUpdateComplianceCheckState = {
    data: null,
    loading: false,
    error: null,
};

export const createOrUpdateComplianceCheckSlice = createSlice({
    name: 'createOrUpdateComplianceCheck',
    initialState: createOrUpdateInitialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(createOrUpdateComplianceCheck.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(createOrUpdateComplianceCheck.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                state.error = null;
            })
            .addCase(createOrUpdateComplianceCheck.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

