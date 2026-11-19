import { createSlice } from '@reduxjs/toolkit';
import type { Comment } from '@/types/commentTypes';
import {
    createComment,
    getCommentsByApplication,
    getCommentCount,
    getCommentById,
    updateComment,
    deleteComment
} from '../actions/commentActions';

// Comments list slice (for fetching comments by application)
interface CommentsState {
    loading: boolean;
    data: Comment[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    } | null;
    error: string | null;
}

const commentsInitialState: CommentsState = {
    loading: false,
    data: [],
    pagination: null,
    error: null,
};

export const commentsSlice = createSlice({
    name: 'comments',
    initialState: commentsInitialState,
    reducers: {
        resetComments: (state) => {
            state.loading = false;
            state.data = [];
            state.pagination = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getCommentsByApplication.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getCommentsByApplication.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data;
                state.pagination = action.payload.pagination || null;
                state.error = null;
            })
            .addCase(getCommentsByApplication.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Create comment slice
interface CreateCommentState {
    loading: boolean;
    data: Comment | null;
    error: string | null;
    success: boolean;
}

const createCommentInitialState: CreateCommentState = {
    loading: false,
    data: null,
    error: null,
    success: false,
};

export const createCommentSlice = createSlice({
    name: 'createComment',
    initialState: createCommentInitialState,
    reducers: {
        resetCreateComment: (state) => {
            state.loading = false;
            state.data = null;
            state.error = null;
            state.success = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(createComment.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(createComment.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data;
                state.error = null;
                state.success = true;
            })
            .addCase(createComment.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                state.success = false;
            });
    },
});

// Comment count slice
interface CommentCountState {
    loading: boolean;
    count: number;
    error: string | null;
}

const commentCountInitialState: CommentCountState = {
    loading: false,
    count: 0,
    error: null,
};

export const commentCountSlice = createSlice({
    name: 'commentCount',
    initialState: commentCountInitialState,
    reducers: {
        resetCommentCount: (state) => {
            state.loading = false;
            state.count = 0;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getCommentCount.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getCommentCount.fulfilled, (state, action) => {
                state.loading = false;
                state.count = action.payload.data?.count || 0;
                state.error = null;
            })
            .addCase(getCommentCount.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Comment detail slice
interface CommentDetailState {
    loading: boolean;
    data: Comment | null;
    error: string | null;
}

const commentDetailInitialState: CommentDetailState = {
    loading: false,
    data: null,
    error: null,
};

export const commentDetailSlice = createSlice({
    name: 'commentDetail',
    initialState: commentDetailInitialState,
    reducers: {
        resetCommentDetail: (state) => {
            state.loading = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getCommentById.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getCommentById.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data;
                state.error = null;
            })
            .addCase(getCommentById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Update comment slice
interface UpdateCommentState {
    loading: boolean;
    data: Comment | null;
    error: string | null;
    success: boolean;
}

const updateCommentInitialState: UpdateCommentState = {
    loading: false,
    data: null,
    error: null,
    success: false,
};

export const updateCommentSlice = createSlice({
    name: 'updateComment',
    initialState: updateCommentInitialState,
    reducers: {
        resetUpdateComment: (state) => {
            state.loading = false;
            state.data = null;
            state.error = null;
            state.success = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(updateComment.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(updateComment.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data;
                state.error = null;
                state.success = true;
            })
            .addCase(updateComment.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                state.success = false;
            });
    },
});

// Delete comment slice
interface DeleteCommentState {
    loading: boolean;
    deletedId: string | null;
    error: string | null;
    success: boolean;
}

const deleteCommentInitialState: DeleteCommentState = {
    loading: false,
    deletedId: null,
    error: null,
    success: false,
};

export const deleteCommentSlice = createSlice({
    name: 'deleteComment',
    initialState: deleteCommentInitialState,
    reducers: {
        resetDeleteComment: (state) => {
            state.loading = false;
            state.deletedId = null;
            state.error = null;
            state.success = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(deleteComment.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(deleteComment.fulfilled, (state, action) => {
                state.loading = false;
                state.deletedId = action.payload.deletedId;
                state.error = null;
                state.success = true;
            })
            .addCase(deleteComment.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                state.success = false;
            });
    },
});

// Export actions
export const { resetComments } = commentsSlice.actions;
export const { resetCreateComment } = createCommentSlice.actions;
export const { resetCommentCount } = commentCountSlice.actions;
export const { resetCommentDetail } = commentDetailSlice.actions;
export const { resetUpdateComment } = updateCommentSlice.actions;
export const { resetDeleteComment } = deleteCommentSlice.actions;

