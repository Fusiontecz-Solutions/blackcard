import { createSlice } from '@reduxjs/toolkit';
import type { Month } from '@/types/monthTypes';
import {
    createMonth,
    getMonths,
    getMonthById,
    updateMonth,
    deleteMonth,
} from '../actions/monthActions';

// Months List State
interface MonthsState {
    loading: boolean;
    data: Month[];
    error: string | null;
}

const monthsInitialState: MonthsState = {
    loading: false,
    data: [],
    error: null,
};

export const monthsSlice = createSlice({
    name: 'months',
    initialState: monthsInitialState,
    reducers: {
        clearMonths: (state) => {
            state.data = [];
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getMonths.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getMonths.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
            })
            .addCase(getMonths.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            })
            .addCase(createMonth.fulfilled, (state, action) => {
                state.data.push(action.payload.data || action.payload);
            })
            .addCase(updateMonth.fulfilled, (state, action) => {
                const updatedMonth = action.payload.data || action.payload;
                const index = state.data.findIndex(month => month._id === updatedMonth._id);
                if (index !== -1) {
                    state.data[index] = updatedMonth;
                }
            })
            .addCase(deleteMonth.fulfilled, (state, action: any) => {
                state.data = state.data.filter(month => month._id !== action.payload.deletedId);
            });
    },
});

// Create Month State
interface CreateMonthState {
    loading: boolean;
    success: boolean;
    data: Month | null;
    error: string | null;
}

const createMonthInitialState: CreateMonthState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const createMonthSlice = createSlice({
    name: 'createMonth',
    initialState: createMonthInitialState,
    reducers: {
        resetCreateMonth: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(createMonth.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(createMonth.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(createMonth.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Month Detail State
interface MonthDetailState {
    loading: boolean;
    data: Month | null;
    error: string | null;
}

const monthDetailInitialState: MonthDetailState = {
    loading: false,
    data: null,
    error: null,
};

export const monthDetailSlice = createSlice({
    name: 'monthDetail',
    initialState: monthDetailInitialState,
    reducers: {
        clearMonthDetail: (state) => {
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getMonthById.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getMonthById.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
            })
            .addCase(getMonthById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Update Month State
interface UpdateMonthState {
    loading: boolean;
    success: boolean;
    data: Month | null;
    error: string | null;
}

const updateMonthInitialState: UpdateMonthState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const updateMonthSlice = createSlice({
    name: 'updateMonth',
    initialState: updateMonthInitialState,
    reducers: {
        resetUpdateMonth: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(updateMonth.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(updateMonth.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(updateMonth.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Delete Month State
interface DeleteMonthState {
    loading: boolean;
    success: boolean;
    deletedId: string | null;
    error: string | null;
}

const deleteMonthInitialState: DeleteMonthState = {
    loading: false,
    success: false,
    deletedId: null,
    error: null,
};

export const deleteMonthSlice = createSlice({
    name: 'deleteMonth',
    initialState: deleteMonthInitialState,
    reducers: {
        resetDeleteMonth: (state) => {
            state.loading = false;
            state.success = false;
            state.deletedId = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(deleteMonth.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(deleteMonth.fulfilled, (state, action: any) => {
                state.loading = false;
                state.success = true;
                state.deletedId = action.payload.deletedId;
            })
            .addCase(deleteMonth.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Export actions
export const { clearMonths } = monthsSlice.actions;
export const { resetCreateMonth } = createMonthSlice.actions;
export const { clearMonthDetail } = monthDetailSlice.actions;
export const { resetUpdateMonth } = updateMonthSlice.actions;
export const { resetDeleteMonth } = deleteMonthSlice.actions;

