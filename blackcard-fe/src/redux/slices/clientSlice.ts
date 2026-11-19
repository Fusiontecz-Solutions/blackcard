import { createSlice } from '@reduxjs/toolkit';
import {
    createClient,
    getClients,
    updateClient,
    deleteClient,
    getClientByClientId,
    getClientById,
} from '../actions/clientActions';
import type { Client } from '../../types/clientTypes';

// State interface for clients list
interface ClientsState {
    loading: boolean;
    data: Client[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    } | null;
    error: string | null;
}

// State interface for single client operations
interface ClientState {
    loading: boolean;
    data: Client | null;
    currentClientId: string | null;
    error: string | null;
    success: boolean;
}

// State interface for delete operation
interface DeleteClientState {
    loading: boolean;
    error: string | null;
    success: boolean;
    deletedId: string | null;
}

// Clients List Slice
export const clientsSlice = createSlice({
    name: 'clients',
    initialState: {
        loading: false,
        data: [],
        pagination: null,
        error: null,
    } as ClientsState,
    reducers: {
        clearClientsError: (state) => {
            state.error = null;
        },
        /** Add a single client to the list (e.g. from PDF extraction). No duplicates by id. */
        addClient: (state, action) => {
            const client = action.payload as Client;
            if (!client || !state.data) return;
            const id = client._id ?? (client as { id?: string }).id;
            const exists = state.data.some(
                (c: Client) => c._id === id || (c as { id?: string }).id === id
            );
            if (!exists) {
                state.data = [client, ...state.data];
                if (state.pagination) {
                    state.pagination.total += 1;
                    if (state.pagination.totalPages != null) {
                        state.pagination.totalPages = Math.ceil(
                            state.pagination.total / state.pagination.limit
                        );
                    }
                }
            }
        },
    },
    extraReducers: (builder) => {
        builder
            // Get All Clients
            .addCase(getClients.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getClients.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                const rawPagination = action.payload.pagination;
                if (rawPagination) {
                    state.pagination = {
                        total:
                            rawPagination.totalItems ??
                            rawPagination.total ??
                            0,
                        page:
                            rawPagination.currentPage ??
                            rawPagination.page ??
                            1,
                        limit:
                            rawPagination.itemsPerPage ??
                            rawPagination.limit ??
                            10,
                        totalPages: rawPagination.totalPages ?? 1,
                    };
                } else {
                    state.pagination = null;
                }
                state.error = null;
            })
            .addCase(getClients.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Create Client Slice
export const createClientSlice = createSlice({
    name: 'createClient',
    initialState: {
        loading: false,
        data: null,
        error: null,
        success: false,
    } as ClientState,
    reducers: {
        resetCreateClient: (state) => {
            state.loading = false;
            state.data = null;
            state.error = null;
            state.success = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(createClient.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(createClient.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                state.error = null;
                state.success = true;
            })
            .addCase(createClient.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                state.success = false;
            });
    },
});

// Get Single Client Slice
export const clientDetailSlice = createSlice({
    name: 'clientDetail',
    initialState: {
        loading: false,
        data: null,
        currentClientId: null,
        error: null,
        success: false,
    } as ClientState,
    reducers: {
        clearClientDetail: (state) => {
            state.loading = false;
            state.data = null;
            state.currentClientId = null;
            state.error = null;
            state.success = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getClientByClientId.pending, (state) => {
                state.loading = true;
                state.currentClientId = null;
                state.error = null;
            })
            .addCase(getClientByClientId.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                state.currentClientId = String(action.meta.arg ?? "");
                state.error = null;
                state.success = true;
            })
            .addCase(getClientByClientId.rejected, (state, action) => {
                state.loading = false;
                state.currentClientId = null;
                state.error = action.payload as string;
                state.success = false;
            })
            .addCase(getClientById.pending, (state) => {
                state.loading = true;
                state.currentClientId = null;
                state.error = null;
            })
            .addCase(getClientById.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                state.currentClientId = String(action.meta.arg ?? "");
                state.error = null;
                state.success = true;
            })
            .addCase(getClientById.rejected, (state, action) => {
                state.loading = false;
                state.currentClientId = null;
                state.error = action.payload as string;
                state.success = false;
            })
            .addCase(updateClient.fulfilled, (state, action) => {
                const updated = action.payload.data || action.payload;
                if (!updated) return;
                const updatedId = String(updated.id ?? updated._id ?? "");
                const currentId = String(
                    state.data?._id ?? (state.data as { id?: string } | null)?.id ?? ""
                );
                const currentClientId = String(state.currentClientId ?? "");
                const updatedClientId = String(updated.clientId ?? "");
                const matchesCurrent =
                    (currentId && updatedId && currentId === updatedId) ||
                    (currentClientId && updatedClientId && currentClientId === updatedClientId) ||
                    (currentClientId && updatedId && currentClientId === updatedId);
                if (matchesCurrent || !state.data) {
                    state.data = updated;
                    if (updatedClientId) state.currentClientId = updatedClientId;
                    else if (updatedId) state.currentClientId = updatedId;
                }
            });
    },
});

// Update Client Slice
export const updateClientSlice = createSlice({
    name: 'updateClient',
    initialState: {
        loading: false,
        data: null,
        error: null,
        success: false,
    } as ClientState,
    reducers: {
        resetUpdateClient: (state) => {
            state.loading = false;
            state.data = null;
            state.error = null;
            state.success = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(updateClient.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(updateClient.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
                state.error = null;
                state.success = true;
            })
            .addCase(updateClient.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                state.success = false;
            });
    },
});

// Delete Client Slice
export const deleteClientSlice = createSlice({
    name: 'deleteClient',
    initialState: {
        loading: false,
        error: null,
        success: false,
        deletedId: null,
    } as DeleteClientState,
    reducers: {
        resetDeleteClient: (state) => {
            state.loading = false;
            state.error = null;
            state.success = false;
            state.deletedId = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(deleteClient.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(deleteClient.fulfilled, (state, action) => {
                state.loading = false;
                state.error = null;
                state.success = true;
                state.deletedId = action.payload.deletedId;
            })
            .addCase(deleteClient.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                state.success = false;
            });
    },
});

// Export actions
export const { clearClientsError, addClient } = clientsSlice.actions;
export const { resetCreateClient } = createClientSlice.actions;
export const { clearClientDetail } = clientDetailSlice.actions;
export const { resetUpdateClient } = updateClientSlice.actions;
export const { resetDeleteClient } = deleteClientSlice.actions;

