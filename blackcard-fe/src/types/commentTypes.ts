// Comment Types

export interface Comment {
    _id: string;
    applicationId: string;
    content: string;
    type?: 'Internal Comment' | 'External Comment' | 'ISO Comment' | 'System';
    createdBy?: {
        _id: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        role?: string;
    } | string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface CreateCommentPayload {
    content: string;
    type?: string;
}

export interface UpdateCommentPayload {
    content?: string;
    type?: string;
}

export interface CommentsResponse {
    success: boolean;
    data: Comment[];
    pagination?: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface CommentResponse {
    success: boolean;
    data: Comment;
}

export interface CommentCountResponse {
    success: boolean;
    data: {
        count: number;
    };
}

export interface GetCommentsParams {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

