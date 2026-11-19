import { createSlice } from '@reduxjs/toolkit';
import type { BankDetail } from '@/types/bankDetailTypes';
import {
    createBankDetail,
    bulkCreateBankDetails,
    getBankDetails,
    getBankDetailById,
    updateBankDetail,
    deleteBankDetail,
} from '../actions/bankDetailActions';

// Bank Details List State
interface BankDetailsState {
    loading: boolean;
    data: BankDetail[];
    error: string | null;
}

const bankDetailsInitialState: BankDetailsState = {
    loading: false,
    data: [],
    error: null,
};

export const bankDetailsSlice = createSlice({
    name: 'bankDetails',
    initialState: bankDetailsInitialState,
    reducers: {
        clearBankDetails: (state) => {
            state.data = [];
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getBankDetails.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getBankDetails.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
            })
            .addCase(getBankDetails.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            })
            .addCase(createBankDetail.fulfilled, (state, action) => {
                state.data.push(action.payload.data || action.payload);
            })
            .addCase(bulkCreateBankDetails.fulfilled, (state, action) => {
                const newBanks = action.payload.data || action.payload;
                if (Array.isArray(newBanks)) {
                    state.data.push(...newBanks);
                }
            })
            .addCase(updateBankDetail.fulfilled, (state, action) => {
                const updatedBank = action.payload.data || action.payload;
                const index = state.data.findIndex(bank => bank._id === updatedBank._id);
                if (index !== -1) {
                    state.data[index] = updatedBank;
                }
            })
            .addCase(deleteBankDetail.fulfilled, (state, action: any) => {
                state.data = state.data.filter(bank => bank._id !== action.payload.deletedId);
            });
    },
});

// Create Bank Detail State
interface CreateBankDetailState {
    loading: boolean;
    success: boolean;
    data: BankDetail | null;
    error: string | null;
}

const createBankDetailInitialState: CreateBankDetailState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const createBankDetailSlice = createSlice({
    name: 'createBankDetail',
    initialState: createBankDetailInitialState,
    reducers: {
        resetCreateBankDetail: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(createBankDetail.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(createBankDetail.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(createBankDetail.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Bulk Create Bank Details State
interface BulkCreateBankDetailsState {
    loading: boolean;
    success: boolean;
    data: BankDetail[] | null;
    error: string | null;
}

const bulkCreateBankDetailsInitialState: BulkCreateBankDetailsState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const bulkCreateBankDetailsSlice = createSlice({
    name: 'bulkCreateBankDetails',
    initialState: bulkCreateBankDetailsInitialState,
    reducers: {
        resetBulkCreateBankDetails: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(bulkCreateBankDetails.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(bulkCreateBankDetails.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(bulkCreateBankDetails.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Bank Detail Detail State
interface BankDetailDetailState {
    loading: boolean;
    data: BankDetail | null;
    error: string | null;
}

const bankDetailDetailInitialState: BankDetailDetailState = {
    loading: false,
    data: null,
    error: null,
};

export const bankDetailDetailSlice = createSlice({
    name: 'bankDetailDetail',
    initialState: bankDetailDetailInitialState,
    reducers: {
        clearBankDetailDetail: (state) => {
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getBankDetailById.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getBankDetailById.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
            })
            .addCase(getBankDetailById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Update Bank Detail State
interface UpdateBankDetailState {
    loading: boolean;
    success: boolean;
    data: BankDetail | null;
    error: string | null;
}

const updateBankDetailInitialState: UpdateBankDetailState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const updateBankDetailSlice = createSlice({
    name: 'updateBankDetail',
    initialState: updateBankDetailInitialState,
    reducers: {
        resetUpdateBankDetail: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(updateBankDetail.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(updateBankDetail.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(updateBankDetail.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Delete Bank Detail State
interface DeleteBankDetailState {
    loading: boolean;
    success: boolean;
    deletedId: string | null;
    error: string | null;
}

const deleteBankDetailInitialState: DeleteBankDetailState = {
    loading: false,
    success: false,
    deletedId: null,
    error: null,
};

export const deleteBankDetailSlice = createSlice({
    name: 'deleteBankDetail',
    initialState: deleteBankDetailInitialState,
    reducers: {
        resetDeleteBankDetail: (state) => {
            state.loading = false;
            state.success = false;
            state.deletedId = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(deleteBankDetail.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(deleteBankDetail.fulfilled, (state, action: any) => {
                state.loading = false;
                state.success = true;
                state.deletedId = action.payload.deletedId;
            })
            .addCase(deleteBankDetail.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Export actions
export const { clearBankDetails } = bankDetailsSlice.actions;
export const { resetCreateBankDetail } = createBankDetailSlice.actions;
export const { resetBulkCreateBankDetails } = bulkCreateBankDetailsSlice.actions;
export const { clearBankDetailDetail } = bankDetailDetailSlice.actions;
export const { resetUpdateBankDetail } = updateBankDetailSlice.actions;
export const { resetDeleteBankDetail } = deleteBankDetailSlice.actions;

