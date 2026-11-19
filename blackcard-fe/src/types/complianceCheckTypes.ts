// Compliance Check Types

export interface ComplianceCheck {
    _id: string;
    question: string;
    answer: 'yes' | 'no';
    reason?: string;
    signature?: string;
    date?: string;
    application: string | {
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

export interface CreateOrUpdateComplianceCheckPayload {
    question: string;
    answer: 'yes' | 'no';
    reason?: string;
    signature?: string;
    date?: string;
    application: string;
}

export interface GetComplianceChecksParams {
    application: string;
}

export interface ComplianceCheckResponse {
    success: boolean;
    message: string;
    data: ComplianceCheck;
}

export interface ComplianceChecksListResponse {
    success: boolean;
    message: string;
    data: ComplianceCheck[];
}

