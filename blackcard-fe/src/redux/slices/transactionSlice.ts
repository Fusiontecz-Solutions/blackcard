import { createSlice } from '@reduxjs/toolkit';
import type { Transaction } from '@/types/transactionTypes';
import {
    createTransaction,
    bulkCreateTransactions,
    getTransactions,
    getTransactionById,
    updateTransaction,
    deleteTransaction,
} from '../actions/transactionActions';

// Transactions List State (grouped by monthId)
interface TransactionsState {
    loading: boolean;
    data: Record<string, Transaction[]>; // Key is monthId, value is array of transactions
    error: string | null;
}

const transactionsInitialState: TransactionsState = {
    loading: false,
    data: {},
    error: null,
};

export const transactionsSlice = createSlice({
    name: 'transactions',
    initialState: transactionsInitialState,
    reducers: {
        clearTransactions: (state) => {
            state.data = {};
            state.error = null;
        },
        clearTransactionsByMonth: (state, action) => {
            delete state.data[action.payload];
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getTransactions.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getTransactions.fulfilled, (state, action) => {
                state.loading = false;
                // Get monthId from the action meta (the original request params)
                const monthId = (action.meta?.arg as any)?.monthId;
                const transactions = action.payload?.data || (Array.isArray(action.payload) ? action.payload : []);
                
                // Store transactions array (even if empty) to mark that we've fetched for this month
                if (monthId) {
                    state.data[monthId] = Array.isArray(transactions) ? transactions : [];
                } else if (Array.isArray(transactions) && transactions.length > 0) {
                    // Fallback: try to get monthId from first transaction if not in meta
                    const firstTxnMonthId = typeof transactions[0].monthId === 'string' 
                        ? transactions[0].monthId 
                        : (transactions[0].monthId as any)?._id;
                    if (firstTxnMonthId) {
                        state.data[firstTxnMonthId] = transactions;
                    }
                }
            })
            .addCase(getTransactions.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            })
            .addCase(createTransaction.fulfilled, (state, action) => {
                const transaction = action.payload.data || action.payload;
                const monthId = typeof transaction.monthId === 'string' 
                    ? transaction.monthId 
                    : (transaction.monthId as any)?._id;
                if (monthId) {
                    if (!state.data[monthId]) {
                        state.data[monthId] = [];
                    }
                    // Add new transaction at the end (maintains chronological order)
                    state.data[monthId].push(transaction);
                    // Re-sort by createdAt ascending to ensure correct order
                    state.data[monthId].sort((a, b) => {
                        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        return aDate - bDate; // Ascending: oldest first
                    });
                }
            })
            .addCase(bulkCreateTransactions.fulfilled, (state, action) => {
                const transactions = action.payload.data || action.payload;
                if (Array.isArray(transactions) && transactions.length > 0) {
                    const monthId = typeof transactions[0].monthId === 'string' 
                        ? transactions[0].monthId 
                        : (transactions[0].monthId as any)?._id;
                    if (monthId) {
                        if (!state.data[monthId]) {
                            state.data[monthId] = [];
                        }
                        // Add new transactions at the end (maintains chronological order)
                        state.data[monthId].push(...transactions);
                        // Re-sort by createdAt ascending to ensure correct order
                        state.data[monthId].sort((a, b) => {
                            const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                            const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                            return aDate - bDate; // Ascending: oldest first
                        });
                    }
                }
            })
            .addCase(updateTransaction.fulfilled, (state, action) => {
                const updatedTransaction = action.payload.data || action.payload;
                const monthId = typeof updatedTransaction.monthId === 'string' 
                    ? updatedTransaction.monthId 
                    : (updatedTransaction.monthId as any)?._id;
                if (monthId && state.data[monthId]) {
                    const index = state.data[monthId].findIndex(t => t._id === updatedTransaction._id);
                    if (index !== -1) {
                        state.data[monthId][index] = updatedTransaction;
                    }
                }
            })
            .addCase(deleteTransaction.fulfilled, (state, action: any) => {
                const deletedId = action.payload.deletedId;
                // Find and remove from all months
                Object.keys(state.data).forEach(monthId => {
                    state.data[monthId] = state.data[monthId].filter(t => t._id !== deletedId);
                });
            });
    },
});

// Create Transaction State
interface CreateTransactionState {
    loading: boolean;
    success: boolean;
    data: Transaction | null;
    error: string | null;
}

const createTransactionInitialState: CreateTransactionState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const createTransactionSlice = createSlice({
    name: 'createTransaction',
    initialState: createTransactionInitialState,
    reducers: {
        resetCreateTransaction: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(createTransaction.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(createTransaction.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(createTransaction.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Transaction Detail State
interface TransactionDetailState {
    loading: boolean;
    data: Transaction | null;
    error: string | null;
}

const transactionDetailInitialState: TransactionDetailState = {
    loading: false,
    data: null,
    error: null,
};

export const transactionDetailSlice = createSlice({
    name: 'transactionDetail',
    initialState: transactionDetailInitialState,
    reducers: {
        clearTransactionDetail: (state) => {
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getTransactionById.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getTransactionById.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
            })
            .addCase(getTransactionById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Update Transaction State
interface UpdateTransactionState {
    loading: boolean;
    success: boolean;
    data: Transaction | null;
    error: string | null;
}

const updateTransactionInitialState: UpdateTransactionState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const updateTransactionSlice = createSlice({
    name: 'updateTransaction',
    initialState: updateTransactionInitialState,
    reducers: {
        resetUpdateTransaction: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(updateTransaction.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(updateTransaction.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(updateTransaction.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Delete Transaction State
interface DeleteTransactionState {
    loading: boolean;
    success: boolean;
    deletedId: string | null;
    error: string | null;
}

const deleteTransactionInitialState: DeleteTransactionState = {
    loading: false,
    success: false,
    deletedId: null,
    error: null,
};

export const deleteTransactionSlice = createSlice({
    name: 'deleteTransaction',
    initialState: deleteTransactionInitialState,
    reducers: {
        resetDeleteTransaction: (state) => {
            state.loading = false;
            state.success = false;
            state.deletedId = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(deleteTransaction.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(deleteTransaction.fulfilled, (state, action: any) => {
                state.loading = false;
                state.success = true;
                state.deletedId = action.payload.deletedId;
            })
            .addCase(deleteTransaction.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Export actions
export const { clearTransactions, clearTransactionsByMonth } = transactionsSlice.actions;
export const { resetCreateTransaction } = createTransactionSlice.actions;
export const { clearTransactionDetail } = transactionDetailSlice.actions;
export const { resetUpdateTransaction } = updateTransactionSlice.actions;
export const { resetDeleteTransaction } = deleteTransactionSlice.actions;

