// Transaction Types

export interface Transaction {
    _id: string;
    monthId: string | {
        _id: string;
        monthName?: string;
        date?: Date | string;
        amount?: number;
        application?: string;
    };
    category: string;
    amount: number | string;
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface CreateTransactionPayload {
    monthId: string;
    category: string;
    amount: string | number;
    notes?: string;
}

export interface BulkCreateTransactionPayload {
    monthId: string;
    transactions: Array<{
        category: string;
        amount: string | number;
        notes?: string;
    }>;
}

export interface UpdateTransactionPayload {
    category?: string;
    amount?: string | number;
    notes?: string;
    monthId?: string;
}

export interface TransactionResponse {
    success: boolean;
    message: string;
    data: Transaction;
}

export interface TransactionsListResponse {
    success: boolean;
    message: string;
    data: Transaction[];
}

export interface GetTransactionsParams {
    monthId: string;
}

