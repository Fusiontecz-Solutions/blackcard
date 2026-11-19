import { createSlice } from '@reduxjs/toolkit';
import {
    getBackgroundCheck,
    updateCheckItem,
    runAutomatedCheckItem,
    addCheckAttachment,
    removeCheckAttachment,
    setRequiredFlags,
    recordCheckDecision,
    reopenCheck,
} from '../actions/backgroundCheckActions';

export type BgCheckResult = 'PASS' | 'FAIL' | 'FLAG' | 'NA';
export type BgItemStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
export type BgCheckStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY_FOR_DECISION' | 'APPROVED' | 'DECLINED';

export interface BackgroundCheckItem {
    id: string;
    checkType: 'TLO' | 'OPENCORPORATES' | 'SOS' | 'NY_COURT' | 'DATAMERCH' | 'GOOGLE';
    required: boolean;
    status: BgItemStatus;
    result: BgCheckResult | null;
    notes: string | null;
    metadata?: Record<string, unknown> | null;
    performedById: string | null;
    performedAt: string | null;
    attachments: { id: string; url: string; originalName: string | null; publicId?: string | null }[];
}

export interface BackgroundCheck {
    id: string;
    applicationId: string;
    status: BgCheckStatus;
    items: BackgroundCheckItem[];
    decision: {
        id: string;
        outcome: 'APPROVED' | 'DECLINED';
        reasonText: string;
        conditionsText: string | null;
        overrodeFail: boolean;
        decidedById: string | null;
        createdAt: string;
    } | null;
    events?: any[];
}

interface State {
    data: BackgroundCheck | null;
    loading: boolean;
    saving: boolean;
    error: string | null;
}

const initialState: State = { data: null, loading: false, saving: false, error: null };

const fulfilled = (state: State, action: any) => {
    state.saving = false;
    state.loading = false;
    if (action.payload) state.data = action.payload;
};

export const backgroundCheckSlice = createSlice({
    name: 'backgroundCheck',
    initialState,
    reducers: {
        clearBackgroundCheck: (state) => {
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getBackgroundCheck.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getBackgroundCheck.fulfilled, fulfilled)
            .addCase(getBackgroundCheck.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
        for (const thunk of [
            updateCheckItem,
            runAutomatedCheckItem,
            addCheckAttachment,
            removeCheckAttachment,
            setRequiredFlags,
            recordCheckDecision,
            reopenCheck,
        ]) {
            builder
                .addCase(thunk.pending, (state) => {
                    state.saving = true;
                    state.error = null;
                })
                .addCase(thunk.fulfilled, fulfilled)
                .addCase(thunk.rejected, (state, action) => {
                    state.saving = false;
                    state.error = action.payload as string;
                });
        }
    },
});

export const { clearBackgroundCheck } = backgroundCheckSlice.actions;
export default backgroundCheckSlice.reducer;
