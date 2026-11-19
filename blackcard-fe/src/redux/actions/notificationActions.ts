import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosPatch, axiosDelete } from '../axios';

export interface SendDocumentRequestPayload {
    applicationId: string | number;
    requestedDocuments: string[];
    requestAdditional?: boolean;
    reason?: string;
    /** Contract modal ISO email flow — omit for underwriting send-back. */
    isoEmail?: string;
    additionalToEmails?: string[];
    ccEmails?: string[];
    /** Pre-rendered HTML from the CRM email template. */
    emailHtml?: string;
    emailSubject?: string;
}

export interface SendDocumentRequestResponse {
    success: boolean;
    message: string;
    data?: unknown;
    application?: unknown;
    emailSent?: boolean;
    emailError?: string;
    emailedTo?: string[];
    emailedCc?: string[];
}

export interface NotifyFinalUnderwriterPayload {
    applicationId: string | number;
    underwriterName?: string;
}

// Send document request notification
export const sendDocumentRequest = createAsyncThunk(
    'notification/sendDocumentRequest',
    async (data: SendDocumentRequestPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/notifications/document-request', data);
            return response.data;
        } catch (error: any) {
            const responseData = error.response?.data;
            const message =
                responseData?.message || error.message || 'Failed to send document request';
            console.error('Send document request error:', message, responseData);
            return rejectWithValue({
                message,
                emailSent: responseData?.emailSent,
                emailError: responseData?.emailError,
                application: responseData?.application,
                status: error.response?.status,
            });
        }
    }
);

// Notify Underwriter when an application is sent from Scrubbing
export const notifyFinalUnderwriterOnAssignment = createAsyncThunk(
    'notification/notifyFinalUnderwriterOnAssignment',
    async (data: NotifyFinalUnderwriterPayload, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/notifications/application-sent-to-final-scrubbing', data);
            return response.data;
        } catch (error: any) {
            const message =
                error.response?.data?.message ||
                error.message ||
                'Failed to notify Underwriter';
            console.error('Notify Underwriter error:', message, error.response?.data);
            return rejectWithValue(message);
        }
    }
);

export interface GetNotificationsParams {
    isRead?: boolean;
    limit?: number;
    page?: number;
    personalOnly?: boolean;
    /** Action bucket: inbox | todo | follow_up | snoozed | done */
    bucket?: string;
    /** MCA category filter */
    category?: string;
    /** Importance filter: urgent | high | normal | low */
    importance?: string;
    /** Include archived rows (default false) */
    archived?: boolean;
    /** Include not-yet-due snoozed rows (default false) */
    includeSnoozed?: boolean;
}

// Get notifications for current user
export const getNotifications = createAsyncThunk(
    'notification/getNotifications',
    async (params: GetNotificationsParams = {}, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            if (params.isRead !== undefined) queryParams.append('isRead', params.isRead.toString());
            if (params.limit) queryParams.append('limit', params.limit.toString());
            if (params.page) queryParams.append('page', params.page.toString());
            if (params.personalOnly) queryParams.append('personalOnly', 'true');
            if (params.bucket) queryParams.append('bucket', params.bucket);
            if (params.category) queryParams.append('category', params.category);
            if (params.importance) queryParams.append('importance', params.importance);
            if (params.archived) queryParams.append('archived', 'true');
            if (params.includeSnoozed) queryParams.append('includeSnoozed', 'true');

            const url = `/notifications${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get notifications error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch notifications'
            );
        }
    }
);

export interface NotificationStatePatch {
    bucket?: string;
    importance?: string;
    category?: string;
    /** ISO string, or null to clear the snooze */
    snoozedUntil?: string | null;
    isArchived?: boolean;
    isRead?: boolean;
}

// Triage counts for headings + bell badge
export const getNotificationSummary = createAsyncThunk(
    'notification/getSummary',
    async (_: void | undefined, { rejectWithValue }) => {
        try {
            const response = await axiosGet('/notifications/summary');
            return response.data;
        } catch (error: any) {
            console.error('Get notification summary error:', error);
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch notification summary');
        }
    }
);

// Update per-user triage state for a single notification
export const updateNotificationState = createAsyncThunk(
    'notification/updateState',
    async ({ id, patch }: { id: string; patch: NotificationStatePatch }, { rejectWithValue }) => {
        try {
            const response = await axiosPatch(`/notifications/${id}/state`, patch);
            return response.data;
        } catch (error: any) {
            console.error('Update notification state error:', error);
            return rejectWithValue(error.response?.data?.message || 'Failed to update notification');
        }
    }
);

// Apply a triage patch to many notifications at once
export const bulkUpdateNotifications = createAsyncThunk(
    'notification/bulkUpdate',
    async ({ ids, patch }: { ids: string[]; patch: NotificationStatePatch }, { rejectWithValue }) => {
        try {
            const response = await axiosPatch('/notifications/bulk', { ids, patch });
            return { ...response.data, ids, patch };
        } catch (error: any) {
            console.error('Bulk update notifications error:', error);
            return rejectWithValue(error.response?.data?.message || 'Failed to update notifications');
        }
    }
);

// Mark notification as read
export const markNotificationAsRead = createAsyncThunk(
    'notification/markAsRead',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosPatch(`/notifications/${id}/read`);
            return response.data;
        } catch (error: any) {
            console.error('Mark notification as read error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to mark notification as read'
            );
        }
    }
);

export type MarkAllNotificationsParams = {
    /** Super Admin only: mark every notification in DB (global feed). Omit or false = current user’s inbox only. */
    allRecipients?: boolean;
}

// Mark all notifications as read (personal inbox, or entire system for Super Admin when allRecipients is true)
export const markAllNotificationsAsRead = createAsyncThunk(
    'notification/markAllAsRead',
    async (params: MarkAllNotificationsParams | undefined, { rejectWithValue }) => {
        try {
            const allRecipients = params?.allRecipients === true;
            const url = `/notifications/read-all${allRecipients ? '?allRecipients=true' : ''}`;
            const response = await axiosPatch(url);
            return response.data;
        } catch (error: any) {
            console.error('Mark all notifications as read error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to mark all notifications as read'
            );
        }
    }
);

// Delete a notification
export const deleteNotification = createAsyncThunk(
    'notification/deleteNotification',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/notifications/${id}`);
            return response.data;
        } catch (error: any) {
            console.error('Delete notification error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete notification'
            );
        }
    }
);

// Get document requests for an application
export const getDocumentRequestsByApplication = createAsyncThunk(
    'notification/getDocumentRequestsByApplication',
    async (applicationId: string | number, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/notifications/document-requests/${applicationId}`);
            return response.data;
        } catch (error: any) {
            console.error('Get document requests by application error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch document requests'
            );
        }
    }
);

export const removeDocumentRequest = createAsyncThunk(
    'notification/removeDocumentRequest',
    async (
        data: { applicationId: string | number; documentId: string },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosDelete(
                `/notifications/document-requests/${data.applicationId}/${encodeURIComponent(data.documentId)}`,
            );
            return {
                ...response.data,
                documentId: data.documentId,
                applicationId: data.applicationId,
            };
        } catch (error: any) {
            console.error('Remove document request error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to remove document request',
            );
        }
    },
);

