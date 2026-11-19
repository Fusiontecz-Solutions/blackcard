// Bank Detail Types

export interface BankDetail {
    _id: string;
    bankName: string;
    accountNumber: string;
    routingNumber?: string | null;
    application?: string | {
        _id: string;
        applicationId?: number;
        priority?: string;
        type?: string;
        currentQueue?: string;
        currentState?: string;
    };
    createdBy?: string | {
        _id: string;
        firstName?: string;
        lastName?: string;
        email?: string;
    };
    createdAt?: string;
    updatedAt?: string;
}

export interface CreateBankDetailPayload {
    bankName: string;
    accountNumber: string;
    routingNumber?: string;
    application: string;
}

export interface BulkCreateBankDetailPayload {
    banks: Array<{
        bankName: string;
        accountNumber: string;
        routingNumber?: string;
    }>;
    application: string;
}

export interface UpdateBankDetailPayload {
    bankName?: string;
    accountNumber?: string;
    routingNumber?: string;
    application?: string;
}

export interface BankDetailResponse {
    success: boolean;
    message: string;
    data: BankDetail;
}

export interface BankDetailsListResponse {
    success: boolean;
    message: string;
    data: BankDetail[];
}

export interface GetBankDetailsParams {
    application: string;
}

