// Position Types

export interface Position {
    _id: string;
    positionId?: number;
    position: string;
    factorRate: string;
    ach: string;
    percentOfGross: string;
    funder: string;
    paybackAmount: number;
    fundingDate: string | Date;
    activeStatus: boolean;
    fundedAmount: number;
    frequency: string;
    closeDate: string | Date;
    notes?: string;
    application?: string | {
        _id: string;
        applicationId?: number;
        priority?: string;
        type?: string;
        currentQueue?: string;
        currentState?: string;
    };
    applicationId?: string;
    createdBy?: string | {
        _id: string;
        firstName?: string;
        lastName?: string;
        email?: string;
    };
    createdAt?: string;
    updatedAt?: string;

    // Positions table / calculator columns (stored per application)
    status?: string;
    loanAmount?: number;
    paymentTerm?: number;
    mcaEstBalance?: number;
    mcaPercentPaid?: number;
    pmtsLeft?: number;
    monthlyMcaPmts?: number;
    mcaRemit?: number;
    carryForward?: number;
    lastPaymentDate?: string | Date;
    allocatedBankAnalysisId?: number;
}

export interface CreatePositionPayload {
    position: string;
    factorRate: string;
    ach: string;
    percentOfGross: string;
    funder: string;
    paybackAmount: string | number;
    fundingDate: string;
    activeStatus?: boolean;
    fundedAmount: string | number;
    frequency: string;
    closeDate: string;
    notes?: string;
    application: string;

    // Optional MCA calculator fields persisted with the position
    status?: string;
    loanAmount?: string | number;
    paymentTerm?: string | number;
    mcaEstBalance?: string | number;
    mcaPercentPaid?: string | number;
    pmtsLeft?: string | number;
    monthlyMcaPmts?: string | number;
    mcaRemit?: string | number;
    carryForward?: string | number;
    lastPaymentDate?: string;
    allocatedBankAnalysisId?: number;
}

export interface UpdatePositionPayload {
    position?: string;
    factorRate?: string;
    ach?: string;
    percentOfGross?: string;
    funder?: string;
    paybackAmount?: string | number;
    fundingDate?: string;
    activeStatus?: boolean;
    fundedAmount?: string | number;
    frequency?: string;
    closeDate?: string;
    notes?: string;
    application?: string;

    // Optional MCA calculator fields persisted with the position
    status?: string;
    loanAmount?: string | number;
    paymentTerm?: string | number;
    mcaEstBalance?: string | number;
    mcaPercentPaid?: string | number;
    pmtsLeft?: string | number;
    monthlyMcaPmts?: string | number;
    mcaRemit?: string | number;
    carryForward?: string | number;
    lastPaymentDate?: string;
    allocatedBankAnalysisId?: number;
}

export interface PositionResponse {
    success: boolean;
    message: string;
    data: Position;
}

export interface PositionsListResponse {
    success: boolean;
    message: string;
    data: Position[];
    pagination?: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface GetPositionsParams {
    application?: string;
    activeStatus?: boolean;
    page?: number;
    limit?: number;
    /** Bypass the in-flight / already-fetched guard (manual refresh). */
    force?: boolean;
}

