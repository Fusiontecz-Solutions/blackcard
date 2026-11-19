import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosPut, axiosPatch, axiosDelete, axiosPostFormData } from '../axios';
import {
    applicationsListParamsCacheKey,
    buildApplicationsListUrl,
    getCachedApplicationsList,
    invalidateApplicationsListCache,
    setCachedApplicationsList,
} from '@/lib/applicationsListCache';
import { recordApplicationDetailResponse } from '@/lib/applicationDetailCache';
import type {
    CreateApplicationPayload,
    UpdateApplicationPayload,
    UpdateQueuePayload,
    UpdateStatePayload,
    GetApplicationsParams,
} from '@/types/applicationTypes';

// Create a new application (handles both with and without files)
export const createApplication = createAsyncThunk(
    'application/create',
    async ({ data, files }: { data: CreateApplicationPayload; files?: File[] }, { rejectWithValue }) => {
        try {
            const formData = new FormData();

            // Append form fields
            Object.entries(data).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    formData.append(key, String(value));
                }
            });

            // Append files only if available
            if (files && files.length > 0) {
                files.forEach((file) => {
                    formData.append('files', file);
                });
            }

            const response = await axiosPostFormData('/applications', formData);
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Create application error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to create application'
            );
        }
    }
);

/**
 * Raw applications list HTTP (cache + pagination merge). Used by `getApplications` and by the
 * payment dashboard cohort fetch without mutating the global `applications` slice.
 */
export async function executeApplicationsListFetch(params: GetApplicationsParams = {}) {
    const {
        skipListCache,
        skipListCacheRead,
        clearListOnFetch: _clear,
        fetchAllPages,
        requestTimeoutMs,
        ...fetchParams
    } = params;
    const axiosListConfig =
        requestTimeoutMs != null && Number.isFinite(requestTimeoutMs)
            ? { timeout: requestTimeoutMs }
            : undefined;
    const cacheKey = applicationsListParamsCacheKey(
        fetchAllPages ? { ...fetchParams, fetchAllPages: true } : fetchParams,
    );
    const bypassCacheRead = Boolean(skipListCache || skipListCacheRead);
    if (!bypassCacheRead) {
        const cached = getCachedApplicationsList(cacheKey);
        if (cached !== undefined) {
            return cached;
        }
    }

    if (fetchAllPages) {
        const pageSize = Math.max(1, Math.min(Number(fetchParams.limit) || 500, 1000));
        const merged: unknown[] = [];
        let totalItems = 0;
        const maxPages = 500;

        for (let page = 1; page <= maxPages; page += 1) {
            const url = buildApplicationsListUrl({
                ...fetchParams,
                page,
                limit: pageSize,
            });
            const response = await axiosGet(url, axiosListConfig);
            const body = response.data as {
                data?: unknown[];
                pagination?: { totalItems?: number; total?: number };
            };
            const batch = Array.isArray(body?.data) ? body.data : [];
            const p = body?.pagination;
            totalItems = Number(p?.totalItems ?? p?.total ?? 0);
            merged.push(...batch);
            if (batch.length < pageSize) break;
        }

        const combined = {
            success: true,
            data: merged,
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalItems: totalItems || merged.length,
                itemsPerPage: merged.length,
            },
        };

        if (!skipListCache) {
            setCachedApplicationsList(cacheKey, combined);
        }
        return combined;
    }

    const url = buildApplicationsListUrl(fetchParams);
    const response = await axiosGet(url, axiosListConfig);
    if (!skipListCache) {
        setCachedApplicationsList(cacheKey, response.data);
    }
    return response.data;
}

// Upload documents to an existing application
// Get all applications with pagination and filters
export const getApplications = createAsyncThunk(
    'application/getAll',
    async (params: GetApplicationsParams = {}, { rejectWithValue }) => {
        try {
            return await executeApplicationsListFetch(params);
        } catch (error: any) {
            console.error('Get applications error:', error);
            return rejectWithValue(
                error.response?.data?.message ||
                    error?.message ||
                    'Failed to fetch applications',
            );
        }
    }
);

export const claimUnderwriterDeal = createAsyncThunk(
    'application/claimUnderwriterDeal',
    async ({ applicationId }: { applicationId: string }, { dispatch, rejectWithValue }) => {
        try {
            await axiosPost(
                `/applications/${encodeURIComponent(applicationId)}/scrubbing-claim`,
                {},
            );
            await invalidateApplicationsListCache();
            return true;
        } catch (error: any) {
            console.error('Claim scrubbing deal error:', error);
            return rejectWithValue(
                error.response?.data?.message ||
                    error?.message ||
                    'Failed to claim deal',
            );
        }
    },
);

export const claimFinalUnderwriterDeal = createAsyncThunk(
    'application/claimFinalUnderwriterDeal',
    async ({ applicationId }: { applicationId: string }, { rejectWithValue }) => {
        try {
            await axiosPost(
                `/applications/${encodeURIComponent(applicationId)}/underwriter-claim`,
                {},
            );
            await invalidateApplicationsListCache();
            return true;
        } catch (error: any) {
            console.error('Claim underwriter deal error:', error);
            return rejectWithValue(
                error.response?.data?.message ||
                    error?.message ||
                    'Failed to claim application',
            );
        }
    },
);

export const releaseUnderwriterDeal = createAsyncThunk(
    'application/releaseUnderwriterDeal',
    async ({ applicationId }: { applicationId: string }, { dispatch, rejectWithValue }) => {
        try {
            await axiosPost(
                `/applications/${encodeURIComponent(applicationId)}/scrubbing-release`,
                {},
            );
            await invalidateApplicationsListCache();
            return true;
        } catch (error: any) {
            console.error('Release scrubbing deal error:', error);
            return rejectWithValue(
                error.response?.data?.message ||
                    error?.message ||
                    'Failed to release claim',
            );
        }
    },
);

export const assignApplicationToUnderwriter = createAsyncThunk(
    'application/assignUnderwriter',
    async (
        {
            applicationId,
            underwriterId,
            underwriterEmail,
        }: { applicationId: string; underwriterId: string; underwriterEmail?: string },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPost(
                `/applications/${encodeURIComponent(applicationId)}/assign-underwriter`,
                { underwriterId, ...(underwriterEmail ? { underwriterEmail } : {}) },
            );
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Assign application to Underwriter error:', error);
            return rejectWithValue(
                error.response?.data?.message ||
                    error?.message ||
                    'Failed to assign application to Underwriter',
            );
        }
    },
);

export const sendApplicationForFinalUnderwriterApproval = createAsyncThunk(
    'application/sendFinalUnderwriterApproval',
    async (
        {
            applicationId,
            source,
        }: {
            applicationId: string;
            source?: 'Decision Logic' | 'Funding Call';
        },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPost(
                `/applications/${encodeURIComponent(applicationId)}/send-final-underwriter-approval`,
                source ? { source } : {},
            );
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Send for final Underwriter approval error:', error);
            return rejectWithValue(
                error.response?.data?.message ||
                    error?.message ||
                    'Failed to send application for final Underwriter approval',
            );
        }
    },
);

export { prefetchApplicationsList } from '@/lib/applicationsListCache';

// Application stats (count + totalAmount per queue/state)
export interface ApplicationStatsBucket {
    count: number;
    totalAmount: number;
}

export interface ApplicationStatsData {
    funded: ApplicationStatsBucket;
    approved: ApplicationStatsBucket;
    rejected: ApplicationStatsBucket;
    pending: ApplicationStatsBucket;
    inProcess: ApplicationStatsBucket;
    underwriting: ApplicationStatsBucket;
    /** Agent queue / Pending state — backend `/applications/stats`. */
    workflowPending?: ApplicationStatsBucket;
    /** Scrubbing queue / In Progress state — backend `/applications/stats`. */
    workflowInProgress?: ApplicationStatsBucket;
    /** All applications in stats scope once each (dashboard “Total Deals Picked”). */
    totalDealsPicked?: ApplicationStatsBucket;
    /** Apps in the viewer’s primary queue: Agent / Scrubbing / Underwriter. */
    roleQueueAssigned?: ApplicationStatsBucket;
}

export interface GetApplicationStatsParams {
    startDate?: string;
    endDate?: string;
}

const zeroBucket = (): ApplicationStatsBucket => ({ count: 0, totalAmount: 0 });

function toStatsBucket(value: unknown): ApplicationStatsBucket {
    if (value && typeof value === 'object') {
        const o = value as Record<string, unknown>;
        const totalRaw = o.totalAmount ?? o.total_amount;
        return {
            count: Number(o.count) || 0,
            totalAmount: Number(totalRaw) || 0,
        };
    }
    return zeroBucket();
}

/** Ensures every card bucket exists (avoids “—” / undefined when API omits workflow fields). */
export function normalizeApplicationStatsData(raw: unknown): ApplicationStatsData | null {
    if (raw == null || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    return {
        funded: toStatsBucket(o.funded),
        approved: toStatsBucket(o.approved),
        rejected: toStatsBucket(o.rejected),
        pending: toStatsBucket(o.pending),
        inProcess: toStatsBucket(o.inProcess),
        underwriting: toStatsBucket(o.underwriting),
        workflowPending: toStatsBucket(o.workflowPending),
        workflowInProgress: toStatsBucket(o.workflowInProgress),
        totalDealsPicked: toStatsBucket(o.totalDealsPicked),
        roleQueueAssigned: toStatsBucket(o.roleQueueAssigned),
    };
}

type SliceWithAppStats = { applicationStats: { loading: boolean } };

export const getApplicationStats = createAsyncThunk(
    'application/getStats',
    async (params: GetApplicationStatsParams | undefined, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            if (params?.startDate) queryParams.append('startDate', params.startDate);

            if (params?.endDate) queryParams.append('endDate', params.endDate);

            const url = `/applications/stats${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get application stats error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch application stats'
            );
        }
    },
    {
        // Avoid duplicate cold-load requests (e.g. login + layout) racing the same empty state.
        condition: (_, { getState }) => {
            const s = getState() as SliceWithAppStats;
            return !s.applicationStats?.loading;
        },
    },
);

// Monthly trend stats for applications (approved & funded amounts per month)
export const getApplicationMonthlyTrend = createAsyncThunk(
    'application/getMonthlyTrend',
    async (params: GetApplicationStatsParams | undefined, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            if (params?.startDate) queryParams.append('startDate', params.startDate);
            if (params?.endDate) queryParams.append('endDate', params.endDate);

            const url = `/applications/stats/trend${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get application monthly trend error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch application monthly trend'
            );
        }
    }
);

// Commission trend stats (commissionAmount per month)
export const getCommissionTrend = createAsyncThunk(
    'application/getCommissionTrend',
    async (params: GetApplicationStatsParams | undefined, { rejectWithValue }) => {
        try {
            const queryParams = new URLSearchParams();
            if (params?.startDate) queryParams.append('startDate', params.startDate);
            if (params?.endDate) queryParams.append('endDate', params.endDate);

            const url = `/terms-offers/stats/commission-trend${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await axiosGet(url);
            return response.data;
        } catch (error: any) {
            console.error('Get commission trend error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch commission trend'
            );
        }
    }
);

// Get application by MongoDB ObjectId
export const getApplicationById = createAsyncThunk(
    'application/getById',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/applications/${id}`);
            recordApplicationDetailResponse(response.data);
            return response.data;
        } catch (error: any) {
            console.error('Get application by ID error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch application'
            );
        }
    }
);

// Get application by numeric applicationId
export const getApplicationByApplicationId = createAsyncThunk(
    'application/getByApplicationId',
    async (applicationId: string | number, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/applications/applicationId/${applicationId}`);
            recordApplicationDetailResponse(response.data);
            return response.data;
        } catch (error: any) {
            console.error('Get application by applicationId error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch application'
            );
        }
    }
);

// Get applications by client
export const getApplicationsByClient = createAsyncThunk(
    'application/getByClient',
    async (clientId: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`/applications/client/${clientId}`);
            return response.data;
        } catch (error: any) {
            console.error('Get applications by client error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch applications'
            );
        }
    }
);

// Get applications by ISO id
export const getApplicationsByIsoId = createAsyncThunk(
    'application/getByIsoId',
    async (
        args: string | { isoId: string; search?: string; currentQueue?: string },
        { rejectWithValue },
    ) => {
        try {
            const isoId = typeof args === 'string' ? args : args.isoId;
            const search = typeof args === 'string' ? '' : (args.search ?? '');
            const currentQueue = typeof args === 'string' ? '' : (args.currentQueue ?? '');
            const queryParams = new URLSearchParams();
            if (search.trim()) {
                queryParams.append('search', search.trim());
            }
            if (currentQueue.trim()) {
                queryParams.append('currentQueue', currentQueue.trim());
            }
            const query = queryParams.toString();
            const response = await axiosGet(`/applications/by-iso/${isoId}${query ? `?${query}` : ''}`);
            return response.data;
        } catch (error: any) {
            console.error('Get applications by ISO id error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch applications by ISO'
            );
        }
    }
);

// Get applications by underwriter id
export const getApplicationsByUnderwriterId = createAsyncThunk(
    'application/getByUnderwriterId',
    async (
        args: string | { underwriterId: string; search?: string; currentQueue?: string },
        { rejectWithValue },
    ) => {
        try {
            const underwriterId = typeof args === 'string' ? args : args.underwriterId;
            const search = typeof args === 'string' ? '' : (args.search ?? '');
            const currentQueue = typeof args === 'string' ? '' : (args.currentQueue ?? '');
            const queryParams = new URLSearchParams();
            if (search.trim()) {
                queryParams.append('search', search.trim());
            }
            if (currentQueue.trim()) {
                queryParams.append('currentQueue', currentQueue.trim());
            }
            const query = queryParams.toString();
            const response = await axiosGet(
                `/applications/by-underwriter/${underwriterId}${query ? `?${query}` : ''}`,
            );
            return response.data;
        } catch (error: any) {
            console.error('Get applications by underwriter id error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fetch applications by underwriter',
            );
        }
    },
);

export type SaveSchedulePaymentTrackingPayload = {
    paymentStartDate: string;
    effectiveStartDate: string;
    dealId?: string | null;
    paymentSchedule: Array<{
        index: number;
        date: string;
        amount: number;
        label: string;
    }>;
};

export type ScheduleTrackingDisplayStatus = 'clear' | 'bounced' | 'upcoming';

export type ScheduleTrackingSummaryStat = { count: number; sum: number };

export type ScheduleTrackingSummary = Record<
    'all' | ScheduleTrackingDisplayStatus,
    ScheduleTrackingSummaryStat
>;

export type SchedulePaymentTrackingRow = {
    id: string;
    applicationId: string;
    dealId: string | null;
    batchId: string;
    paymentNumber: number;
    scheduledDate: string;
    amount: number;
    label: string | null;
    paymentStartDate: string | null;
    effectiveStartDate: string | null;
    status: string;
    confirmedById: string | null;
    createdAt: string;
    updatedAt: string;
    /** Compared on the server against collection payments (paid → clear, failed → bounced). */
    trackingStatus: ScheduleTrackingDisplayStatus;
};

/**
 * Fetch SchedulePaymentTracking rows for an application (defaults to active SCHEDULED rows).
 * `status: 'all'` returns every row across batches (scheduled + superseded + cancelled).
 */
export const getSchedulePaymentTracking = createAsyncThunk(
    'application/getSchedulePaymentTracking',
    async (
        {
            id,
            status,
            batchId,
            dealId,
        }: {
            id: string;
            status?: 'scheduled' | 'superseded' | 'cancelled' | 'all';
            batchId?: string;
            dealId?: string;
        },
        { rejectWithValue },
    ) => {
        try {
            const query = new URLSearchParams();
            if (status) query.append('status', status);
            if (batchId) query.append('batchId', batchId);
            if (dealId?.trim()) query.append('dealId', dealId.trim());
            const qs = query.toString();
            const response = await axiosGet(
                `/applications/${encodeURIComponent(id)}/schedule-payment-tracking${qs ? `?${qs}` : ''}`,
            );
            return response.data as {
                success: boolean;
                payments: SchedulePaymentTrackingRow[];
                summary: ScheduleTrackingSummary;
            };
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            return rejectWithValue(
                err.response?.data?.message || 'Failed to fetch payment schedule',
            );
        }
    },
);

/** Persist disbursement review payment schedule (replaces active SCHEDULED rows). */
export const saveSchedulePaymentTracking = createAsyncThunk(
    'application/saveSchedulePaymentTracking',
    async (
        { id, data }: { id: string; data: SaveSchedulePaymentTrackingPayload },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPut(
                `/applications/${encodeURIComponent(id)}/schedule-payment-tracking`,
                {
                    paymentStartDate: data.paymentStartDate,
                    effectiveStartDate: data.effectiveStartDate,
                    dealId: data.dealId ?? undefined,
                    paymentSchedule: data.paymentSchedule.map((row) => ({
                        paymentNumber: row.index,
                        scheduledDate: row.date,
                        amount: row.amount,
                        label: row.label,
                    })),
                },
            );
            return response.data;
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            return rejectWithValue(
                err.response?.data?.message || 'Failed to save payment schedule',
            );
        }
    },
);

// Update application
export const updateApplication = createAsyncThunk(
    'application/update',
    async ({ id, data }: { id: string; data: UpdateApplicationPayload }, { rejectWithValue }) => {
        try {
            const response = await axiosPut(`/applications/${id}`, data);
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Update application error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update application'
            );
        }
    }
);

// Update application queue
export const updateApplicationQueue = createAsyncThunk(
    'application/updateQueue',
    async ({ id, data }: { id: string; data: UpdateQueuePayload }, { rejectWithValue }) => {
        try {
            const response = await axiosPatch(`/applications/${id}/queue`, data);
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Update application queue error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update application queue'
            );
        }
    }
);

// Update application state
export const updateApplicationState = createAsyncThunk(
    'application/updateState',
    async ({ id, data }: { id: string; data: UpdateStatePayload }, { rejectWithValue }) => {
        try {
            const response = await axiosPatch(`/applications/${id}/state`, data);
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Update application state error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update application state'
            );
        }
    }
);

// Update document checklist (checked document labels)
export const updateApplicationDocumentChecklist = createAsyncThunk(
    'application/updateDocumentChecklist',
    async (
        { id, checkedLabels }: { id: string; checkedLabels: string[] },
        { rejectWithValue }
    ) => {
        try {
            const response = await axiosPatch(`/applications/${id}/document-checklist`, {
                checkedLabels,
            });
            return response.data;
        } catch (error: any) {
            console.error('Update document checklist error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update document checklist'
            );
        }
    }
);

// Reject/Decline application
export const rejectApplication = createAsyncThunk(
    'application/reject',
    async (
        {
            id,
            reason,
            emailHtml,
            emailSubject,
            isoEmail,
            ccEmails,
            toEmails,
        }: {
            id: string | number;
            reason: string;
            emailHtml?: string;
            emailSubject?: string;
            isoEmail?: string;
            ccEmails?: string[];
            /** Decline mail To list (UW: submissions inbox; Super Admin: ISO email(s)). */
            toEmails?: string[];
        },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPost(`/applications/${id}/reject`, {
                reason,
                ...(emailHtml ? { emailHtml } : {}),
                ...(emailSubject ? { emailSubject } : {}),
                ...(isoEmail ? { isoEmail } : {}),
                ccEmails: ccEmails ?? [],
                ...(toEmails?.length ? { toEmails } : {}),
            });
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Reject application error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to reject application'
            );
        }
    }
);

// Delete application (soft-delete → Recently Deleted)
export const deleteApplication = createAsyncThunk(
    'application/delete',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/applications/${id}`);
            await invalidateApplicationsListCache();
            return { ...response.data, deletedId: id };
        } catch (error: any) {
            console.error('Delete application error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete application'
            );
        }
    }
);

// Permanently delete a soft-deleted application (Super Admin / Operations)
export const permanentlyDeleteApplication = createAsyncThunk(
    'application/permanentlyDelete',
    async (id: string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/applications/${id}/permanent`);
            await invalidateApplicationsListCache();
            return { ...response.data, deletedId: id };
        } catch (error: any) {
            console.error('Permanent delete application error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to permanently delete application',
            );
        }
    },
);

// Restore a soft-deleted application to a scrubber's claimed queue
export const restoreApplicationToScrubber = createAsyncThunk(
    'application/restoreToScrubber',
    async (
        {
            applicationId,
            scrubberId,
        }: { applicationId: string; scrubberId: string },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPost(
                `/applications/${encodeURIComponent(applicationId)}/restore-to-scrubber`,
                { scrubberId },
            );
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Restore application to scrubber error:', error);
            return rejectWithValue(
                error.response?.data?.message ||
                    error?.message ||
                    'Failed to restore application to scrubber',
            );
        }
    },
);

/** Underwriter sends a pre-decision deal back to the scrubber for correction. */
export const returnApplicationToScrubber = createAsyncThunk(
    'application/returnToScrubber',
    async (
        {
            applicationId,
            scrubberId,
            scrubberEmail,
            reasons,
            note,
        }: {
            applicationId: string;
            scrubberId?: string;
            scrubberEmail?: string;
            reasons: string[];
            note: string;
        },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPost(
                `/applications/${encodeURIComponent(applicationId)}/return-to-scrubber`,
                { scrubberId, scrubberEmail, reasons, note },
            );
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Return application to scrubber error:', error);
            return rejectWithValue(
                error.response?.data?.message ||
                    error?.message ||
                    'Failed to send the application back to the scrubber',
            );
        }
    },
);

// Scrubber: park a claimed deal in Missing Documents (Super Admin is emailed)
export const flagApplicationMissingDocuments = createAsyncThunk(
    'application/flagMissingDocuments',
    async (
        {
            applicationId,
            documents,
            otherDocuments,
        }: { applicationId: string; documents: string[]; otherDocuments?: string },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPost(
                `/applications/${encodeURIComponent(applicationId)}/missing-documents`,
                { documents, otherDocuments },
            );
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Flag missing documents error:', error);
            return rejectWithValue(
                error.response?.data?.message ||
                    error?.message ||
                    'Failed to flag missing documents',
            );
        }
    },
);

// Super Admin: return a Missing Documents deal to the open Scrubbing queue
export const resolveApplicationMissingDocuments = createAsyncThunk(
    'application/resolveMissingDocuments',
    async ({ applicationId }: { applicationId: string }, { rejectWithValue }) => {
        try {
            const response = await axiosPost(
                `/applications/${encodeURIComponent(applicationId)}/missing-documents/resolve`,
                {},
            );
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Resolve missing documents error:', error);
            return rejectWithValue(
                error.response?.data?.message ||
                    error?.message ||
                    'Failed to send the deal back to Scrubber',
            );
        }
    },
);

// Upload documents to an existing application
export const uploadApplicationDocuments = createAsyncThunk(
    'application/uploadDocuments',
    async (
        {
            id,
            files,
            requestedDocumentSlug,
        }: { id: string; files: File[]; requestedDocumentSlug?: string },
        { rejectWithValue },
    ) => {
        try {
            const formData = new FormData();

            // Append files
            if (files && files.length > 0) {
                files.forEach((file) => {
                    formData.append('files', file);
                });
            }
            if (requestedDocumentSlug?.trim()) {
                formData.append('requestedDocumentSlug', requestedDocumentSlug.trim());
            }

            const response = await axiosPostFormData(`/applications/${id}/files`, formData);
            return response.data;
        } catch (error: any) {
            console.error('Upload application documents error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to upload application documents'
            );
        }
    }
);

// Delete application file
export const deleteApplicationFile = createAsyncThunk(
    'application/deleteFile',
    async ({ applicationId, fileId }: { applicationId: string; fileId: string }, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`/applications/${applicationId}/files/${fileId}`);
            return response.data;
        } catch (error: any) {
            console.error('Delete application file error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to delete application file'
            );
        }
    }
);

// Assign a document-request slug to an existing uploaded file
export const assignApplicationFileDocumentType = createAsyncThunk(
    'application/assignFileDocumentType',
    async (
        {
            applicationId,
            fileId,
            requestedDocumentSlug,
        }: { applicationId: string; fileId: string; requestedDocumentSlug: string },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPatch(`/applications/${applicationId}/files/${fileId}`, {
                requestedDocumentSlug: requestedDocumentSlug.trim() || null,
            });
            return response.data;
        } catch (error: any) {
            console.error('Assign file document type error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to assign document type',
            );
        }
    },
);

/** Run Claude/Document AI extraction on a stored application PDF and merge into client fields. */
export const fillApplicationFromPdfFile = createAsyncThunk(
    'application/fillApplicationFromPdfFile',
    async (
        { applicationId, fileId }: { applicationId: string; fileId: string },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPost(
                `/applications/${applicationId}/files/${fileId}/fill-from-pdf`,
                {},
            );
            return response.data;
        } catch (error: any) {
            console.error('Fill application from PDF error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to fill application from PDF',
            );
        }
    },
);

// Send approval email to client for an application
export const sendApprovalEmail = createAsyncThunk(
    'application/sendApprovalEmail',
    async (
        {
            applicationId,
            resend,
            reinitiateContract,
            emailHtml,
            emailSubject,
            isoEmail,
            ccEmails,
            toEmails,
            scrubbingPreviewHtml,
        }: {
            applicationId: string | number;
            resend?: boolean;
            /** Archive prior contract envelope when resending updated offer to ISO. */
            reinitiateContract?: boolean;
            /** Branded HTML rendered by the frontend approval template (backend injects URL / names). */
            emailHtml?: string;
            emailSubject?: string;
            isoEmail?: string;
            ccEmails?: string[];
            /** Every To recipient confirmed in the popup (overrides isoEmail on the backend). */
            toEmails?: string[];
            /** Scrubbing Preview Copy HTML; backends that support it append it below the mail. */
            scrubbingPreviewHtml?: string;
        },
        { rejectWithValue }
    ) => {
        try {
            const response = await axiosPost('/applications/send-approval-email', {
                applicationId,
                resend: !!resend,
                reinitiateContract: !!reinitiateContract,
                ...(emailHtml ? { emailHtml } : {}),
                ...(emailSubject ? { emailSubject } : {}),
                ...(isoEmail ? { isoEmail } : {}),
                ccEmails: ccEmails ?? [],
                ...(toEmails?.length ? { toEmails } : {}),
                ...(scrubbingPreviewHtml ? { scrubbingPreviewHtml } : {}),
            });
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Send approval email error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to send approval email'
            );
        }
    }
);

export const reinitiateContract = createAsyncThunk(
    'application/reinitiateContract',
    async (applicationId: string | number, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/applications/reinitiate-contract', {
                applicationId,
            });
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Reinitiate contract error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to reinitiate contract',
            );
        }
    },
);

/** Funded notification — best-effort client email (any role with app access) */
export const sendFundedEmail = createAsyncThunk(
    'application/sendFundedEmail',
    async (applicationId: string | number, { rejectWithValue }) => {
        try {
            const response = await axiosPost('/applications/send-funded-email', {
                applicationId,
            });
            return response.data;
        } catch (error: any) {
            console.error('Send funded email error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to send funded notification email'
            );
        }
    }
);

// Extract business and owner details from PDF (parse-only endpoint used for client prefill)
export const parseApplicationPdfForClientPrefill = createAsyncThunk(
    'application/parseApplicationPdfForClientPrefill',
    async (
        payload:
            | File
            | {
                  pdfFile: File;
                  applicationType?: string;
                  isoId?: string;
                  gmailMessageId?: string;
              },
        { rejectWithValue }
    ) => {
        try {
            const pdfFile = payload instanceof File ? payload : payload.pdfFile;
            const applicationType =
                payload instanceof File ? undefined : payload.applicationType;
            const isoId =
                payload instanceof File ? undefined : payload.isoId;
            const gmailMessageId =
                payload instanceof File ? undefined : payload.gmailMessageId;
            const formData = new FormData();
            formData.append('pdf', pdfFile);
            if (applicationType) {
                formData.append('applicationType', applicationType);
            }
            if (isoId) {
                formData.append('isoId', isoId);
            }
            if (gmailMessageId) {
                formData.append('gmailMessageId', gmailMessageId);
            }

            // Use the auto-create endpoint for combined client + application creation
            const response = await axiosPostFormData('/applications/auto-create-from-pdf', formData);
            return response.data; // { success, message, data: { client, application, existingClient, alreadyExisted } }
        } catch (error: any) {
            console.error('Parse application PDF error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to parse application PDF'
            );
        }
    }
);

// Backwards-compatible export for existing usages (Applications list & slice)
// This calls the same parse endpoint and returns the same shape { success, message, data }
export const extractBusinessDetails = createAsyncThunk(
    'application/extractBusinessDetails',
    async (pdfFile: File, { rejectWithValue }) => {
        try {
            const formData = new FormData();
            formData.append('pdf', pdfFile);

            const response = await axiosPostFormData('/applications/extract-pdf', formData);
            await invalidateApplicationsListCache();
            return response.data;
        } catch (error: any) {
            console.error('Extract business details error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to extract business details from PDF'
            );
        }
    }
);

/** Super Admin: import historical applications from Excel/CSV (multipart field `file`). */
export const bulkUploadApplicationsExcel = createAsyncThunk(
    'application/bulkUploadExcel',
    async (file: File, { rejectWithValue }) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await axiosPostFormData('/applications/bulk-upload-excel', formData);
            await invalidateApplicationsListCache();
            return response.data as {
                success?: boolean;
                message?: string;
                data?: {
                    totalRows: number;
                    successCount: number;
                    failedCount: number;
                    errors: Array<{
                        excelRowNumber: number;
                        message: string;
                        dealId?: string | null;
                        dealName?: string | null;
                    }>;
                };
            };
        } catch (error: any) {
            console.error('Bulk upload applications Excel error:', error);
            return rejectWithValue(
                error.response?.data?.message || 'Failed to import applications from Excel'
            );
        }
    }
);
