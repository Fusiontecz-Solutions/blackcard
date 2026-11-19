// User Types

export interface User {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    role: string;
    isVerified: boolean;
    isActive: boolean;
    lastSeenAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface GetUsersParams {
    role?: string;
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
}

export interface UsersResponse {
    success: boolean;
    data: User[];
    pagination?: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

