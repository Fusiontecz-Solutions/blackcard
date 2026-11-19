// Month Types

export interface Month {
    _id: string;
    monthName: string;
    date: string | Date;
    amount: number | string;
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

export interface CreateMonthPayload {
    monthName: string;
    date: string;
    amount: string | number;
    application: string;
}

export interface UpdateMonthPayload {
    monthName?: string;
    date?: string;
    amount?: string | number;
    application?: string;
}

export interface MonthResponse {
    success: boolean;
    message: string;
    data: Month;
}

export interface MonthsListResponse {
    success: boolean;
    message: string;
    data: Month[];
}

export interface GetMonthsParams {
    application: string;
}

