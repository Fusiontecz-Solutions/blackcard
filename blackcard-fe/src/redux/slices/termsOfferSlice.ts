import { createSlice } from '@reduxjs/toolkit';
import type { TermsOffer } from '@/types/termsOfferTypes';
import {
    createTermsOffer,
    getTermsOffers,
    getTermsOfferById,
    getTermsOfferByTermsOfferId,
    updateTermsOffer,
    deleteTermsOffer,
} from '../actions/termsOfferActions';

// Terms Offers List State
interface TermsOffersState {
    loading: boolean;
    data: TermsOffer[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    } | null;
    error: string | null;
}

const termsOffersInitialState: TermsOffersState = {
    loading: false,
    data: [],
    pagination: null,
    error: null,
};

export const termsOffersSlice = createSlice({
    name: 'termsOffers',
    initialState: termsOffersInitialState,
    reducers: {
        clearTermsOffers: (state) => {
            state.data = [];
            state.pagination = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getTermsOffers.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getTermsOffers.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                state.pagination = action.payload.pagination || null;
            })
            .addCase(getTermsOffers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Create Terms Offer State
interface CreateTermsOfferState {
    loading: boolean;
    success: boolean;
    data: TermsOffer | null;
    error: string | null;
}

const createTermsOfferInitialState: CreateTermsOfferState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const createTermsOfferSlice = createSlice({
    name: 'createTermsOffer',
    initialState: createTermsOfferInitialState,
    reducers: {
        resetCreateTermsOffer: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(createTermsOffer.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(createTermsOffer.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(createTermsOffer.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Terms Offer Detail State
interface TermsOfferDetailState {
    loading: boolean;
    data: TermsOffer | null;
    error: string | null;
}

const termsOfferDetailInitialState: TermsOfferDetailState = {
    loading: false,
    data: null,
    error: null,
};

export const termsOfferDetailSlice = createSlice({
    name: 'termsOfferDetail',
    initialState: termsOfferDetailInitialState,
    reducers: {
        clearTermsOfferDetail: (state) => {
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            // Get by ID
            .addCase(getTermsOfferById.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getTermsOfferById.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
            })
            .addCase(getTermsOfferById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            })
            // Get by termsOfferId
            .addCase(getTermsOfferByTermsOfferId.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getTermsOfferByTermsOfferId.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
            })
            .addCase(getTermsOfferByTermsOfferId.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Update Terms Offer State
interface UpdateTermsOfferState {
    loading: boolean;
    success: boolean;
    data: TermsOffer | null;
    error: string | null;
}

const updateTermsOfferInitialState: UpdateTermsOfferState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const updateTermsOfferSlice = createSlice({
    name: 'updateTermsOffer',
    initialState: updateTermsOfferInitialState,
    reducers: {
        resetUpdateTermsOffer: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(updateTermsOffer.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(updateTermsOffer.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(updateTermsOffer.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Delete Terms Offer State
interface DeleteTermsOfferState {
    loading: boolean;
    success: boolean;
    deletedId: string | null;
    error: string | null;
}

const deleteTermsOfferInitialState: DeleteTermsOfferState = {
    loading: false,
    success: false,
    deletedId: null,
    error: null,
};

export const deleteTermsOfferSlice = createSlice({
    name: 'deleteTermsOffer',
    initialState: deleteTermsOfferInitialState,
    reducers: {
        resetDeleteTermsOffer: (state) => {
            state.loading = false;
            state.success = false;
            state.deletedId = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(deleteTermsOffer.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(deleteTermsOffer.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.deletedId = action.payload.deletedId;
            })
            .addCase(deleteTermsOffer.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Export actions
export const { clearTermsOffers } = termsOffersSlice.actions;
export const { resetCreateTermsOffer } = createTermsOfferSlice.actions;
export const { clearTermsOfferDetail } = termsOfferDetailSlice.actions;
export const { resetUpdateTermsOffer } = updateTermsOfferSlice.actions;
export const { resetDeleteTermsOffer } = deleteTermsOfferSlice.actions;

