// Terms Offer Types

export interface TermsOffer {
    _id: string;
    termsOfferId?: number;
    approvedAmount: number;
    factorRate: number;
    paybackAmount: number;
    numberOfPayments: number;
    offerExpiryDate: string | Date;
    termLength: number;
    commissionPercent: number;
    paymentAmount: number;
    percentOfGross: number;
    frequency: string;
    buyRate: number;
    commissionAmount: number;
    position: string;
    paymentSchedule: string;
    paymentDays: string[];
    application?: string | {
        _id: string;
        applicationId?: number;
        priority?: string;
        type?: string;
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

export interface CreateTermsOfferPayload {
    approvedAmount: string | number;
    factorRate: string | number;
    paybackAmount: string | number;
    numberOfPayments: string | number;
    offerExpiryDate: string;
    termLength: string | number;
    commissionPercent: string | number;
    paymentAmount: string | number;
    percentOfGross: string | number;
    frequency: string;
    buyRate: string | number;
    commissionAmount: string | number;
    position: string;
    paymentSchedule: string;
    paymentDays: string[];
    application: string;
}

export interface UpdateTermsOfferPayload {
    approvedAmount?: string | number;
    factorRate?: string | number;
    paybackAmount?: string | number;
    numberOfPayments?: string | number;
    offerExpiryDate?: string;
    termLength?: string | number;
    commissionPercent?: string | number;
    paymentAmount?: string | number;
    percentOfGross?: string | number;
    frequency?: string;
    buyRate?: string | number;
    commissionAmount?: string | number;
    position?: string;
    paymentSchedule?: string;
    paymentDays?: string[];
    application?: string;
}

export interface TermsOfferResponse {
    success: boolean;
    message: string;
    data: TermsOffer;
}

export interface TermsOffersListResponse {
    success: boolean;
    message: string;
    data: TermsOffer[];
    pagination?: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface GetTermsOffersParams {
    application?: string;
    page?: number;
    limit?: number;
}

