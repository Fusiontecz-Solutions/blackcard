import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { FinalAnswer } from '@/types/finalAnswerTypes';
import {
    fetchFinalAnswers,
    saveFinalAnswer,
    saveFinalAnswers,
} from '../actions/finalAnswerActions';

type AnswerMap = Record<string, FinalAnswer>;

interface FinalAnswersState {
    byApplication: Record<string, AnswerMap>;
    loading: boolean;
    saving: boolean;
    error: string | null;
}

const initialState: FinalAnswersState = {
    byApplication: {},
    loading: false,
    saving: false,
    error: null,
};

interface SetAnswerLocallyPayload {
    applicationId: string;
    questionKey: string;
    questionLabel: string;
    value: string;
}

export const finalAnswersSlice = createSlice({
    name: 'finalAnswers',
    initialState,
    reducers: {
        setAnswerLocally(state, action: PayloadAction<SetAnswerLocallyPayload>) {
            const { applicationId, questionKey, questionLabel, value } = action.payload;
            if (!state.byApplication[applicationId]) {
                state.byApplication[applicationId] = {};
            }
            const existing = state.byApplication[applicationId][questionKey];
            state.byApplication[applicationId][questionKey] = {
                ...(existing || {}),
                questionKey,
                questionLabel,
                answer: value,
            };
        },
        resetAnswersForApplication(state, action: PayloadAction<{ applicationId: string }>) {
            const { applicationId } = action.payload;
            delete state.byApplication[applicationId];
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchFinalAnswers.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchFinalAnswers.fulfilled, (state, action) => {
                state.loading = false;
                const { applicationId, data } = action.payload as {
                    applicationId: string;
                    data: FinalAnswer[];
                };
                const map: AnswerMap = {};
                (data || []).forEach((item) => {
                    map[item.questionKey] = item;
                });
                state.byApplication[applicationId] = map;
            })
            .addCase(fetchFinalAnswers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            })
            .addCase(saveFinalAnswer.pending, (state) => {
                state.saving = true;
                state.error = null;
            })
            .addCase(saveFinalAnswer.fulfilled, (state, action) => {
                state.saving = false;
                const { applicationId, data } = action.payload as {
                    applicationId: string;
                    data: FinalAnswer;
                };
                if (!state.byApplication[applicationId]) {
                    state.byApplication[applicationId] = {};
                }
                state.byApplication[applicationId][data.questionKey] = data;
            })
            .addCase(saveFinalAnswer.rejected, (state, action) => {
                state.saving = false;
                state.error = action.payload as string;
            })
            .addCase(saveFinalAnswers.pending, (state) => {
                state.saving = true;
                state.error = null;
            })
            .addCase(saveFinalAnswers.fulfilled, (state, action) => {
                state.saving = false;
                const { applicationId, data } = action.payload as {
                    applicationId: string;
                    data: FinalAnswer[];
                };
                if (!state.byApplication[applicationId]) {
                    state.byApplication[applicationId] = {};
                }
                (data || []).forEach((item) => {
                    state.byApplication[applicationId][item.questionKey] = item;
                });
            })
            .addCase(saveFinalAnswers.rejected, (state, action) => {
                state.saving = false;
                state.error = action.payload as string;
            });
    },
});

export const { setAnswerLocally, resetAnswersForApplication } = finalAnswersSlice.actions;

