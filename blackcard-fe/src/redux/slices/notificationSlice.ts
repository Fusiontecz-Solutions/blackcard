import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
    sendDocumentRequest,
    getNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    getDocumentRequestsByApplication,
    getNotificationSummary,
    updateNotificationState,
    bulkUpdateNotifications,
    type NotificationStatePatch,
} from '../actions/notificationActions';

// Re-export so triage UI can import the patch type from the slice barrel.
export type { NotificationStatePatch } from '../actions/notificationActions';

// MCA category (system-derived) — see backend notificationCategory.ts.
// UI surfaces an "All" filter ahead of these stored values.
export type NotificationCategory =
    | 'approvals'
    | 'contracts'
    | 'funding'
    | 'collections'
    | 'others';

// User-set action bucket ("heading") and importance tag
export type NotificationBucket = 'inbox' | 'todo' | 'follow_up' | 'snoozed' | 'done';
export type NotificationImportance = 'urgent' | 'high' | 'normal' | 'low';

// Notification Type
export interface Notification {
    _id: string;
    title: string;
    message: string;
    type: string;
    recipient: string | {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    application?: string | {
        _id: string;
        applicationId: number;
        priority: string;
        type: string;
        currentQueue: string;
        currentState: string;
        // Enriched detail fields (merchant / amount / deal ref)
        loanAmount?: number | null;
        dealId?: string | null;
        dealDisplayName?: string | null;
        businessName?: string | null;
        ownerName?: string | null;
    };
    documentRequestDetails?: {
        requestedDocuments: string[];
        requestAdditional: boolean;
    };
    isRead: boolean;
    readAt?: string;
    // Triage state
    category?: NotificationCategory;
    bucket?: NotificationBucket;
    importance?: NotificationImportance;
    snoozedUntil?: string | null;
    isArchived?: boolean;
    actionUrl?: string | null;
    createdBy?: string | {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    createdAt: string;
    updatedAt: string;
}

// State interface for notifications list
interface NotificationsState {
    loading: boolean;
    data: Notification[];
    error: string | null;
}

// State interface for send document request
interface SendDocumentRequestState {
    loading: boolean;
    data: Notification | null;
    error: string | null;
    success: boolean;
}

// Notifications List Slice
export const notificationsSlice = createSlice({
    name: 'notifications',
    initialState: {
        loading: false,
        data: [],
        error: null,
    } as NotificationsState,
    reducers: {
        clearNotificationsError: (state) => {
            state.error = null;
        },
        /** Immediate UI: mark one read before PATCH returns (inbox only). */
        markNotificationReadOptimistic: (state, action: PayloadAction<string>) => {
            const id = action.payload;
            const idx = state.data.findIndex((n: Notification) => n._id === id);
            if (idx !== -1) {
                state.data[idx] = {
                    ...state.data[idx],
                    isRead: true,
                    readAt: new Date().toISOString(),
                };
            }
        },
        /** Immediate UI: mark entire inbox read (matches mark-all API for personal inbox). */
        markAllNotificationsReadOptimistic: (state) => {
            const now = new Date().toISOString();
            state.data = state.data.map((n: Notification) => ({
                ...n,
                isRead: true,
                readAt: n.readAt ?? now,
            }));
        },
        /**
         * Immediate UI: insert a notification pushed via Socket.IO at the top
         * of the inbox so the bell badge / sidebar count update without
         * waiting for the next poll. De-dupes by `_id` so reconciling with a
         * subsequent REST refresh is a no-op.
         */
        prependNotification: (state, action: PayloadAction<Notification>) => {
            const incoming = action.payload;
            if (!incoming || !incoming._id) return;
            // Default triage fields so realtime pushes render consistently.
            const normalized: Notification = {
                bucket: 'inbox',
                importance: 'normal',
                isArchived: false,
                category: 'others',
                ...incoming,
            };
            const existingIdx = state.data.findIndex(
                (n: Notification) => n._id === normalized._id,
            );
            if (existingIdx !== -1) {
                state.data[existingIdx] = { ...state.data[existingIdx], ...normalized };
                return;
            }
            state.data = [normalized, ...state.data];
        },
        /** Immediate UI: apply a triage patch to one notification before PATCH returns. */
        updateNotificationStateOptimistic: (
            state,
            action: PayloadAction<{ id: string; patch: NotificationStatePatch }>,
        ) => {
            const { id, patch } = action.payload;
            const idx = state.data.findIndex((n: Notification) => n._id === id);
            if (idx === -1) return;
            state.data[idx] = { ...state.data[idx], ...patch } as Notification;
        },
        /** Immediate UI: apply a triage patch to many notifications. */
        bulkUpdateOptimistic: (
            state,
            action: PayloadAction<{ ids: string[]; patch: NotificationStatePatch }>,
        ) => {
            const { ids, patch } = action.payload;
            const idSet = new Set(ids);
            state.data = state.data.map((n: Notification) =>
                idSet.has(n._id) ? ({ ...n, ...patch } as Notification) : n,
            );
        },
    },
    extraReducers: (builder) => {
        builder
            // Get Notifications
            .addCase(getNotifications.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getNotifications.fulfilled, (state, action) => {
                state.loading = false;
                state.error = null;
                state.data = action.payload.data || [];
            })
            .addCase(markNotificationAsRead.fulfilled, (state, action) => {
                const idFromRequest = action.meta.arg as string;
                const updated = action.payload?.data ?? action.payload;
                const id =
                    updated &&
                    typeof updated === 'object' &&
                    '_id' in updated &&
                    (updated as { _id?: string })._id
                        ? (updated as { _id: string })._id
                        : idFromRequest;
                if (!id) return;
                const idx = state.data.findIndex((n: Notification) => n._id === id);
                if (idx === -1) return;
                const readAt =
                    updated &&
                    typeof updated === 'object' &&
                    'readAt' in updated &&
                    (updated as { readAt?: string | null }).readAt
                        ? (updated as { readAt?: string | null }).readAt!
                        : state.data[idx].readAt ?? new Date().toISOString();
                state.data[idx] = { ...state.data[idx], isRead: true, readAt };
            })
            .addCase(markAllNotificationsAsRead.fulfilled, (state) => {
                const now = new Date().toISOString();
                state.data = state.data.map((n: Notification) => ({
                    ...n,
                    isRead: true,
                    readAt: n.readAt ?? now,
                }));
            })
            // Reconcile single triage update with the server's canonical record.
            .addCase(updateNotificationState.fulfilled, (state, action) => {
                const updated = action.payload?.data;
                if (!updated?._id) return;
                const idx = state.data.findIndex((n: Notification) => n._id === updated._id);
                if (idx !== -1) state.data[idx] = { ...state.data[idx], ...updated };
            })
            // Reconcile bulk update (payload echoes ids + patch).
            .addCase(bulkUpdateNotifications.fulfilled, (state, action) => {
                const { ids, patch } = action.payload || {};
                if (!Array.isArray(ids) || !patch) return;
                const idSet = new Set(ids.map(String));
                state.data = state.data.map((n: Notification) =>
                    idSet.has(n._id) ? ({ ...n, ...patch } as Notification) : n,
                );
            })
            .addCase(getNotifications.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Notification Summary (counts for headings + bell badge)
export interface NotificationSummary {
    total: number;
    unread: number;
    urgent: number;
    byBucket: Record<string, number>;
    byCategory: Record<string, number>;
}

interface NotificationSummaryState {
    loading: boolean;
    data: NotificationSummary;
    error: string | null;
}

const emptySummary: NotificationSummary = {
    total: 0,
    unread: 0,
    urgent: 0,
    byBucket: {},
    byCategory: {},
};

export const notificationSummarySlice = createSlice({
    name: 'notificationSummary',
    initialState: {
        loading: false,
        data: emptySummary,
        error: null,
    } as NotificationSummaryState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(getNotificationSummary.pending, (state) => {
                state.loading = true;
            })
            .addCase(getNotificationSummary.fulfilled, (state, action) => {
                state.loading = false;
                state.error = null;
                state.data = action.payload?.data ?? emptySummary;
            })
            .addCase(getNotificationSummary.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Send Document Request Slice
export const sendDocumentRequestSlice = createSlice({
    name: 'sendDocumentRequest',
    initialState: {
        loading: false,
        data: null,
        error: null,
        success: false,
    } as SendDocumentRequestState,
    reducers: {
        resetSendDocumentRequest: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(sendDocumentRequest.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(sendDocumentRequest.fulfilled, (state, action) => {
                state.loading = false;
                state.error = null;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(sendDocumentRequest.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                state.success = false;
            });
    },
});

// Mark as Read Slice
export const markAsReadSlice = createSlice({
    name: 'markNotificationAsRead',
    initialState: {
        loading: false,
        data: null,
        error: null,
        success: false,
    } as SendDocumentRequestState,
    reducers: {
        resetMarkAsRead: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(markNotificationAsRead.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(markNotificationAsRead.fulfilled, (state, action) => {
                state.loading = false;
                state.error = null;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(markNotificationAsRead.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
                state.success = false;
            });
    },
});

// Mark All as Read State
interface MarkAllAsReadState {
    loading: boolean;
    error: string | null;
    success: boolean;
}

// Mark All as Read Slice
export const markAllAsReadSlice = createSlice({
    name: 'markAllNotificationsAsRead',
    initialState: {
        loading: false,
        error: null,
        success: false,
    } as MarkAllAsReadState,
    reducers: {
        resetMarkAllAsRead: (state) => {
            state.loading = false;
            state.success = false;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(markAllNotificationsAsRead.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.success = false;
            })
            .addCase(markAllNotificationsAsRead.fulfilled, (state) => {
                state.loading = false;
                state.error = null;
                state.success = true;
            })
            .addCase(markAllNotificationsAsRead.rejected, (state, action) => {
                state.loading = false;
                state.error = (action.payload as string) || 'Failed to mark all notifications as read';
                state.success = false;
            });
    },
});

// Document Request State
interface DocumentRequest {
    name: string;
    label?: string;
    status: 'Complete' | 'Pending';
    createdAt: string;
    fileUrl?: string;
    fileId?: string;
    contractUploadKey?: 'voidedCheck' | 'driverLicense';
    message?: string;
    requestedBy?: {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
}

interface DocumentRequestsState {
    loading: boolean;
    data: DocumentRequest[];
    error: string | null;
}

// Document Requests Slice
export const documentRequestsSlice = createSlice({
    name: 'documentRequests',
    initialState: {
        loading: false,
        data: [],
        error: null,
    } as DocumentRequestsState,
    reducers: {
        clearDocumentRequestsError: (state) => {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getDocumentRequestsByApplication.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getDocumentRequestsByApplication.fulfilled, (state, action) => {
                state.loading = false;
                state.error = null;
                state.data = action.payload.data || [];
            })
            .addCase(getDocumentRequestsByApplication.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Export actions
export const {
    clearNotificationsError,
    markNotificationReadOptimistic,
    markAllNotificationsReadOptimistic,
    prependNotification,
    updateNotificationStateOptimistic,
    bulkUpdateOptimistic,
} = notificationsSlice.actions;
export const { resetSendDocumentRequest } = sendDocumentRequestSlice.actions;
export const { resetMarkAsRead } = markAsReadSlice.actions;
export const { resetMarkAllAsRead } = markAllAsReadSlice.actions;
export const { clearDocumentRequestsError } = documentRequestsSlice.actions;

