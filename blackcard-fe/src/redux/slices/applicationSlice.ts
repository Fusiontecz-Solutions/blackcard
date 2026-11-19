import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Application } from '@/types/applicationTypes';
import { buildDetailHydrationPayload } from '@/lib/applicationDetailCache.ts';
import {
    createApplication,
    getApplications,
    getApplicationStats,
    normalizeApplicationStatsData,
    getApplicationById,
    getApplicationByApplicationId,
    getApplicationsByClient,
    getApplicationsByIsoId,
    getApplicationsByUnderwriterId,
    updateApplication,
    updateApplicationQueue,
    updateApplicationState,
    updateApplicationDocumentChecklist,
    rejectApplication,
    deleteApplication,
    uploadApplicationDocuments,
} from '../actions/applicationActions';
import type { ApplicationStatsData } from '../actions/applicationActions';
import { sendDocumentRequest } from '../actions/notificationActions';
import { updateIso } from '../actions/isoActions';
import { updateClient } from '../actions/clientActions';
import { resolveOwnersFromClientData } from '@/lib/clientOwners';

/** Prefer richer `owners[]` when application refetch returns a flat/stale nested client. */
function mergeClientPreservingOwners(
    previous: Record<string, unknown> | null | undefined,
    incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
    if (!incoming || typeof incoming !== 'object') return incoming;
    if (!previous || typeof previous !== 'object') return incoming;
    const prevOwners = resolveOwnersFromClientData(previous);
    const nextOwners = resolveOwnersFromClientData(incoming);
    if (!prevOwners.length) return incoming;

    const nameOf = (owners: ReturnType<typeof resolveOwnersFromClientData>) => {
        const p = owners[0];
        return `${String(p?.firstName ?? '').trim()} ${String(p?.lastName ?? '').trim()}`
            .trim()
            .toLowerCase();
    };

    // Overview `updateClient` can refresh owners before application detail refetch;
    // keep the newer local owners when the embed still has the previous name.
    const preferPrevious =
        !nextOwners.length ||
        (Boolean(nameOf(prevOwners)) &&
            Boolean(nameOf(nextOwners)) &&
            nameOf(prevOwners) !== nameOf(nextOwners));

    const owners = preferPrevious ? prevOwners : nextOwners;
    const primary = owners[0]!;
    return {
        ...incoming,
        owners,
        owner: (preferPrevious ? previous.owner : incoming.owner) ?? primary,
        ownerFirstName:
            String(primary.firstName ?? '').trim() ||
            (preferPrevious ? previous.ownerFirstName : incoming.ownerFirstName),
        ownerLastName:
            String(primary.lastName ?? '').trim() ||
            (preferPrevious ? previous.ownerLastName : incoming.ownerLastName),
        ownerEmail:
            String(primary.email ?? '').trim() ||
            (preferPrevious ? previous.ownerEmail : incoming.ownerEmail),
    };
}

function applyClientOwnerFlatFields(
    client: Record<string, unknown>,
): Record<string, unknown> {
    const owners = resolveOwnersFromClientData(client);
    if (!owners.length) return client;
    const primary = owners[0]!;
    return {
        ...client,
        owners,
        owner: (client.owner as typeof primary | undefined) ?? primary,
        ownerFirstName: String(primary.firstName ?? '').trim() || client.ownerFirstName,
        ownerLastName: String(primary.lastName ?? '').trim() || client.ownerLastName,
        ownerEmail: String(primary.email ?? '').trim() || client.ownerEmail,
    };
}

function mergeApplicationDetailFromUpdate(
    state: { data: Application | null },
    payload: unknown,
) {
    const body = payload as { data?: Application } | Application | null | undefined;
    const updated = body && typeof body === 'object' && 'data' in body && (body as { data?: Application }).data
        ? (body as { data: Application }).data
        : (body as Application | null | undefined);
    if (!updated || !state.data) return;
    const d = state.data as Application & { _id?: string; id?: string };
    const u = updated as Application & { _id?: string; id?: string };
    const curId = d._id ?? d.id;
    const curAid = d.applicationId;
    const upId = u._id ?? u.id;
    const upAid = u.applicationId;
    const idMatch = curId != null && upId != null && String(curId) === String(upId);
    const aidMatch =
        curAid != null &&
        upAid != null &&
        Number(curAid) === Number(upAid);
    if (idMatch || aidMatch) {
        state.data = { ...d, ...u } as Application;
    }
}

// Applications List State
interface ApplicationsState {
    /** True only when there is no row data yet (initial load). */
    loading: boolean;
    /** True when refetching while keeping the previous list visible. */
    isRefreshing: boolean;
    data: Application[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    } | null;
    error: string | null;
    latestRequestId: string | null;
}

function extractApplicationFromUpdatePayload(payload: unknown): Application | null {
    const body = payload as { data?: Application } | Application | null | undefined;
    const updated =
        body && typeof body === 'object' && 'data' in body && (body as { data?: Application }).data
            ? (body as { data: Application }).data
            : (body as Application | null | undefined);
    if (!updated || typeof updated !== 'object') return null;
    return updated as Application;
}

/** Merge PATCH queue/state response into the global applications list (Kanban reads this slice). */
function patchApplicationInList(state: ApplicationsState, payload: unknown) {
    const updated = extractApplicationFromUpdatePayload(payload);
    if (!updated || !Array.isArray(state.data)) return;
    const u = updated as Application & { _id?: string; id?: string };
    const upId = u._id ?? u.id;
    const upAid = u.applicationId;
    const idx = state.data.findIndex((d) => {
        const cur = d as Application & { id?: string };
        const curId = cur._id ?? cur.id;
        const curAid = cur.applicationId;
        const idMatch = curId != null && upId != null && String(curId) === String(upId);
        const aidMatch =
            curAid != null &&
            upAid != null &&
            Number(curAid) === Number(upAid);
        return idMatch || aidMatch;
    });
    if (idx >= 0) {
        state.data[idx] = { ...state.data[idx], ...u } as Application;
    }
}

const applicationsInitialState: ApplicationsState = {
    loading: false,
    isRefreshing: false,
    data: [],
    pagination: null,
    error: null,
    latestRequestId: null,
};

export const applicationsSlice = createSlice({
    name: 'applications',
    initialState: applicationsInitialState,
    reducers: {
        clearApplications: (state) => {
            state.data = [];
            state.pagination = null;
            state.error = null;
            state.loading = false;
            state.isRefreshing = false;
        },
        /**
         * Apply a cached list response before `getApplications` runs so the first paint can show rows
         * and pending uses `isRefreshing` instead of a full-table loading state.
         */
        hydrateApplicationsListFromCache: (state, action: PayloadAction<unknown>) => {
            const payload = action.payload as {
                data?: Application[];
                pagination?: Record<string, unknown>;
            };
            const rows = payload?.data ?? (Array.isArray(action.payload) ? (action.payload as Application[]) : null);
            if (!Array.isArray(rows)) return;
            state.data = rows;
            const pagination = payload?.pagination;
            state.pagination = pagination
                ? {
                    total: Number(pagination.total ?? pagination.totalItems ?? 0),
                    page: Number(pagination.page ?? pagination.currentPage ?? 1),
                    limit: Number(pagination.limit ?? pagination.itemsPerPage ?? 10),
                    totalPages: Number(pagination.totalPages ?? 1),
                }
                : null;
            state.loading = false;
            state.isRefreshing = false;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getApplications.pending, (state, action) => {
                state.error = null;
                state.latestRequestId = action.meta.requestId;
                if (action.meta.arg?.clearListOnFetch) {
                    state.data = [];
                    state.pagination = null;
                    state.loading = true;
                    state.isRefreshing = false;
                    return;
                }
                if (state.data.length > 0) {
                    state.isRefreshing = true;
                } else {
                    state.loading = true;
                }
            })
            .addCase(getApplications.fulfilled, (state, action) => {
                // Ignore out-of-order responses: after a newer fetch completes, `latestRequestId` is
                // null, but an older in-flight response must not overwrite fresh data.
                if (action.meta.requestId !== state.latestRequestId) {
                    return;
                }
                state.loading = false;
                state.isRefreshing = false;
                state.data = action.payload.data || action.payload;
                const pagination = action.payload?.pagination;
                state.pagination = pagination
                    ? {
                        total: pagination.total ?? pagination.totalItems ?? 0,
                        page: pagination.page ?? pagination.currentPage ?? 1,
                        limit: pagination.limit ?? pagination.itemsPerPage ?? 10,
                        totalPages: pagination.totalPages ?? 1,
                    }
                    : null;
                state.latestRequestId = null;
            })
            .addCase(getApplications.rejected, (state, action) => {
                if (action.meta.requestId !== state.latestRequestId) {
                    return;
                }
                state.loading = false;
                state.isRefreshing = false;
                state.error = action.payload as string;
                state.latestRequestId = null;
            })
            .addCase(updateApplicationQueue.fulfilled, (state, action) => {
                patchApplicationInList(state, action.payload);
            })
            .addCase(updateApplicationState.fulfilled, (state, action) => {
                patchApplicationInList(state, action.payload);
            })
            .addCase(updateApplication.fulfilled, (state, action) => {
                patchApplicationInList(state, action.payload);
            })
            .addCase(getApplicationById.fulfilled, (state, action) => {
                patchApplicationInList(state, action.payload);
            })
            .addCase(getApplicationByApplicationId.fulfilled, (state, action) => {
                patchApplicationInList(state, action.payload);
            });
    },
});

// Application Stats State
interface ApplicationStatsState {
    /** True only when there is no cached data yet (first load). */
    loading: boolean;
    /** True when re-fetching while previous `data` is still shown (stale-while-revalidate). */
    isRefreshing: boolean;
    data: ApplicationStatsData | null;
    error: string | null;
    lastFetchedAt: number | null;
}

const applicationStatsInitialState: ApplicationStatsState = {
    loading: false,
    isRefreshing: false,
    data: null,
    error: null,
    lastFetchedAt: null,
};

export const applicationStatsSlice = createSlice({
    name: 'applicationStats',
    initialState: applicationStatsInitialState,
    reducers: {
        clearApplicationStats: (state) => {
            state.data = null;
            state.error = null;
            state.loading = false;
            state.isRefreshing = false;
            state.lastFetchedAt = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getApplicationStats.pending, (state) => {
                state.error = null;
                if (state.data) {
                    state.isRefreshing = true;
                } else {
                    state.loading = true;
                }
            })
            .addCase(getApplicationStats.fulfilled, (state, action) => {
                state.loading = false;
                state.isRefreshing = false;
                state.lastFetchedAt = Date.now();
                const raw = action.payload?.data ?? action.payload;
                state.data = normalizeApplicationStatsData(raw);
            })
            .addCase(getApplicationStats.rejected, (state, action) => {
                state.loading = false;
                state.isRefreshing = false;
                state.error = action.payload as string;
            });
    },
});

// Create Application State
interface CreateApplicationState {
    loading: boolean;
    success: boolean;
    data: Application | null;
    error: string | null;
}

const createApplicationInitialState: CreateApplicationState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const createApplicationSlice = createSlice({
    name: 'createApplication',
    initialState: createApplicationInitialState,
    reducers: {
        resetCreateApplication: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(createApplication.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(createApplication.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(createApplication.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Application Detail State
interface ApplicationDetailState {
    /** True when there is no row data yet (initial load or switched to another deal). */
    loading: boolean;
    /** True when re-fetching the same deal while keeping previous `data` visible. */
    isRefreshing: boolean;
    data: Application | null;
    error: string | null;
}

const applicationDetailInitialState: ApplicationDetailState = {
    loading: false,
    isRefreshing: false,
    data: null,
    error: null,
};

export const applicationDetailSlice = createSlice({
    name: 'applicationDetail',
    initialState: applicationDetailInitialState,
    reducers: {
        clearApplicationDetail: (state) => {
            state.data = null;
            state.error = null;
            state.loading = false;
            state.isRefreshing = false;
        },
        hydrateApplicationDetailFromCache: (state, action) => {
            const payload = buildDetailHydrationPayload(action.payload);
            if (!payload) return;
            state.data = payload.data;
            state.loading = false;
            state.isRefreshing = false;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            // Get by ID
            .addCase(getApplicationById.pending, (state, action) => {
                const requestedId = String(action.meta.arg).trim();
                const cur = state.data;
                const curPk = cur
                    ? String(
                        (cur as Application & { id?: string }).id ??
                        cur._id ??
                        '',
                    ).trim()
                    : '';
                state.error = null;
                if (cur && curPk && curPk === requestedId) {
                    state.isRefreshing = true;
                } else {
                    state.loading = true;
                    state.isRefreshing = false;
                    state.data = null;
                }
            })
            .addCase(getApplicationById.fulfilled, (state, action) => {
                state.loading = false;
                state.isRefreshing = false;
                state.error = null;
                const incoming = (action.payload.data || action.payload) as Application & {
                    client?: Record<string, unknown> | null;
                };
                const prevClient = (state.data as Application & {
                    client?: Record<string, unknown> | null;
                } | null)?.client;
                state.data = {
                    ...incoming,
                    client: mergeClientPreservingOwners(
                        prevClient ?? undefined,
                        (incoming?.client as Record<string, unknown> | null | undefined) ??
                            undefined,
                    ) as Application['client'],
                } as Application;
            })
            .addCase(getApplicationById.rejected, (state, action) => {
                state.loading = false;
                state.isRefreshing = false;
                state.error = action.payload as string;
            })
            // Get by applicationId
            .addCase(getApplicationByApplicationId.pending, (state, action) => {
                const requestedAid = Number(action.meta.arg);
                const curAid = state.data?.applicationId;
                state.error = null;
                if (
                    state.data &&
                    curAid != null &&
                    !Number.isNaN(requestedAid) &&
                    Number(curAid) === requestedAid
                ) {
                    state.isRefreshing = true;
                } else {
                    state.loading = true;
                    state.isRefreshing = false;
                    state.data = null;
                }
            })
            .addCase(getApplicationByApplicationId.fulfilled, (state, action) => {
                state.loading = false;
                state.isRefreshing = false;
                state.error = null;
                const incoming = (action.payload.data || action.payload) as Application & {
                    client?: Record<string, unknown> | null;
                };
                const prevClient = (state.data as Application & {
                    client?: Record<string, unknown> | null;
                } | null)?.client;
                state.data = {
                    ...incoming,
                    client: mergeClientPreservingOwners(
                        prevClient ?? undefined,
                        (incoming?.client as Record<string, unknown> | null | undefined) ??
                            undefined,
                    ) as Application['client'],
                } as Application;
            })
            .addCase(getApplicationByApplicationId.rejected, (state, action) => {
                state.loading = false;
                state.isRefreshing = false;
                state.error = action.payload as string;
            })
            .addCase(updateApplication.fulfilled, (state, action) => {
                mergeApplicationDetailFromUpdate(state, action.payload);
            })
            .addCase(updateIso.fulfilled, (state, action) => {
                const payload = action.payload as { data?: Record<string, unknown> } | Record<string, unknown> | null;
                const updated = (
                    payload && typeof payload === 'object' && 'data' in payload && payload.data
                        ? payload.data
                        : payload
                ) as Record<string, unknown> | null;
                if (!updated || !state.data) return;
                const d = state.data as Application & { iso?: Record<string, unknown> | null };
                const iso = d.iso;
                const updatedId = String(updated.id ?? '').trim();
                if (!iso || !updatedId) return;
                const curId = String(iso.id ?? iso._id ?? '').trim();
                if (curId && curId === updatedId) {
                    state.data = {
                        ...d,
                        iso: { ...iso, ...updated },
                    } as Application;
                }
            })
            .addCase(updateApplicationQueue.fulfilled, (state, action) => {
                mergeApplicationDetailFromUpdate(state, action.payload);
            })
            .addCase(updateApplicationState.fulfilled, (state, action) => {
                mergeApplicationDetailFromUpdate(state, action.payload);
            })
            // Update application detail when document checklist is updated
            .addCase(updateApplicationDocumentChecklist.fulfilled, (state, action) => {
                if (action.payload?.data) {
                    state.data = action.payload.data;
                }
            })
            // Update application detail when rejected
            .addCase(rejectApplication.fulfilled, (state, action) => {
                if (state.data && action.payload.data) {
                    // Update the application in the detail state
                    state.data = action.payload.data;
                }
            })
            // Update application note when document request is sent
            .addCase(sendDocumentRequest.fulfilled, (state, action) => {
                // Update the application detail with the updated application data from the response
                // This includes the updated note field
                const updatedApplication = (action.payload as any)?.application;
                if (updatedApplication && state.data) {
                    // Check if this is the same application (by id or applicationId)
                    const currentAppId = (state.data as any)?._id || (state.data as any)?.id;
                    const currentAppApplicationId = (state.data as any)?.applicationId;
                    const updatedAppId = updatedApplication._id || updatedApplication.id;
                    const updatedAppApplicationId = updatedApplication.applicationId;

                    if (
                        currentAppId === updatedAppId ||
                        (currentAppApplicationId && currentAppApplicationId === updatedAppApplicationId)
                    ) {
                        // Update the application data with the new note
                        state.data = {
                            ...state.data,
                            ...updatedApplication,
                            note: updatedApplication.note,
                            iso: updatedApplication.iso ?? (state.data as any).iso,
                        } as Application;
                    }
                }
            })
            // Overview client save — keep embedded application.client (owners) in sync for
            // Contract Signers + Verify Prefill without waiting on a detail refetch race.
            .addCase(updateClient.fulfilled, (state, action) => {
                const updated = (action.payload as { data?: Record<string, unknown> })?.data
                    ?? (action.payload as Record<string, unknown> | null);
                if (!updated || !state.data) return;
                const app = state.data as Application & {
                    client?: Record<string, unknown> | null;
                };
                const appClient = app.client;
                if (!appClient || typeof appClient !== 'object') return;
                const appClientId = String(appClient.id ?? appClient._id ?? '').trim();
                const updatedId = String(updated.id ?? updated._id ?? '').trim();
                const appClientKey = String(appClient.clientId ?? '').trim();
                const updatedKey = String(updated.clientId ?? '').trim();
                const idMatch = Boolean(appClientId && updatedId && appClientId === updatedId);
                const keyMatch = Boolean(appClientKey && updatedKey && appClientKey === updatedKey);
                if (!idMatch && !keyMatch) return;
                state.data = {
                    ...app,
                    client: applyClientOwnerFlatFields({
                        ...appClient,
                        ...updated,
                    }),
                } as Application;
            });
    },
});

// Client Applications State
interface ClientApplicationsState {
    loading: boolean;
    data: Application[];
    error: string | null;
}

const clientApplicationsInitialState: ClientApplicationsState = {
    loading: false,
    data: [],
    error: null,
};

export const clientApplicationsSlice = createSlice({
    name: 'clientApplications',
    initialState: clientApplicationsInitialState,
    reducers: {
        clearClientApplications: (state) => {
            state.data = [];
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getApplicationsByClient.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getApplicationsByClient.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload.data || action.payload;
            })
            .addCase(getApplicationsByClient.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// ISO Applications State
interface IsoApplicationsState {
    loading: boolean;
    data: Application[];
    error: string | null;
    cache: Record<string, Application[]>;
}

const isoApplicationsInitialState: IsoApplicationsState = {
    loading: false,
    data: [],
    error: null,
    cache: {},
};

function isoApplicationsCacheKey(
    arg: string | { isoId: string; search?: string; currentQueue?: string }
) {
    if (typeof arg === 'string') return `iso:${arg}|search:`;
    return `iso:${arg.isoId}|search:${(arg.search ?? '').trim().toLowerCase()}|queue:${(arg.currentQueue ?? '').trim().toLowerCase()}`;
}

export const isoApplicationsSlice = createSlice({
    name: 'isoApplications',
    initialState: isoApplicationsInitialState,
    reducers: {
        clearIsoApplications: (state) => {
            state.data = [];
            state.error = null;
            state.loading = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getApplicationsByIsoId.pending, (state, action) => {
                state.loading = true;
                state.error = null;
                const key = isoApplicationsCacheKey(action.meta.arg);
                if (state.cache[key]) {
                    state.data = state.cache[key];
                    state.loading = false;
                }
            })
            .addCase(getApplicationsByIsoId.fulfilled, (state, action) => {
                state.loading = false;
                const rows = action.payload.data || action.payload;
                state.data = rows;
                const key = isoApplicationsCacheKey(action.meta.arg);
                state.cache[key] = rows;
            })
            .addCase(getApplicationsByIsoId.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Underwriter Applications State
interface UnderwriterApplicationsState {
    loading: boolean;
    data: Application[];
    error: string | null;
    cache: Record<string, Application[]>;
}

const underwriterApplicationsInitialState: UnderwriterApplicationsState = {
    loading: false,
    data: [],
    error: null,
    cache: {},
};

function underwriterApplicationsCacheKey(
    arg: string | { underwriterId: string; search?: string; currentQueue?: string },
) {
    if (typeof arg === 'string') return `uw:${arg}|search:`;
    return `uw:${arg.underwriterId}|search:${(arg.search ?? '').trim().toLowerCase()}|queue:${(arg.currentQueue ?? '').trim().toLowerCase()}`;
}

export const underwriterApplicationsSlice = createSlice({
    name: 'underwriterApplications',
    initialState: underwriterApplicationsInitialState,
    reducers: {
        clearUnderwriterApplications: (state) => {
            state.data = [];
            state.error = null;
            state.loading = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getApplicationsByUnderwriterId.pending, (state, action) => {
                state.loading = true;
                state.error = null;
                const key = underwriterApplicationsCacheKey(action.meta.arg);
                if (state.cache[key]) {
                    state.data = state.cache[key];
                    state.loading = false;
                }
            })
            .addCase(getApplicationsByUnderwriterId.fulfilled, (state, action) => {
                state.loading = false;
                const rows = action.payload.data || action.payload;
                state.data = rows;
                const key = underwriterApplicationsCacheKey(action.meta.arg);
                state.cache[key] = rows;
            })
            .addCase(getApplicationsByUnderwriterId.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

// Update Application State
interface UpdateApplicationState {
    loading: boolean;
    success: boolean;
    data: Application | null;
    error: string | null;
}

const updateApplicationInitialState: UpdateApplicationState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const updateApplicationSlice = createSlice({
    name: 'updateApplication',
    initialState: updateApplicationInitialState,
    reducers: {
        resetUpdateApplication: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            // Update application
            .addCase(updateApplication.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(updateApplication.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(updateApplication.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            })
            // Update queue
            .addCase(updateApplicationQueue.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(updateApplicationQueue.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(updateApplicationQueue.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            })
            // Update state
            .addCase(updateApplicationState.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(updateApplicationState.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(updateApplicationState.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Reject Application State
interface RejectApplicationState {
    loading: boolean;
    success: boolean;
    data: Application | null;
    error: string | null;
}

const rejectApplicationInitialState: RejectApplicationState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const rejectApplicationSlice = createSlice({
    name: 'rejectApplication',
    initialState: rejectApplicationInitialState,
    reducers: {
        resetRejectApplication: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(rejectApplication.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(rejectApplication.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(rejectApplication.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Delete Application State
interface DeleteApplicationState {
    loading: boolean;
    success: boolean;
    deletedId: string | null;
    error: string | null;
}

const deleteApplicationInitialState: DeleteApplicationState = {
    loading: false,
    success: false,
    deletedId: null,
    error: null,
};

export const deleteApplicationSlice = createSlice({
    name: 'deleteApplication',
    initialState: deleteApplicationInitialState,
    reducers: {
        resetDeleteApplication: (state) => {
            state.loading = false;
            state.success = false;
            state.deletedId = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(deleteApplication.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(deleteApplication.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.deletedId = action.payload.deletedId;
            })
            .addCase(deleteApplication.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Upload Documents State
interface UploadDocumentsState {
    loading: boolean;
    success: boolean;
    data: any | null;
    error: string | null;
}

const uploadDocumentsInitialState: UploadDocumentsState = {
    loading: false,
    success: false,
    data: null,
    error: null,
};

export const uploadDocumentsSlice = createSlice({
    name: 'uploadDocuments',
    initialState: uploadDocumentsInitialState,
    reducers: {
        resetUploadDocuments: (state) => {
            state.loading = false;
            state.success = false;
            state.data = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(uploadApplicationDocuments.pending, (state) => {
                state.loading = true;
                state.success = false;
                state.error = null;
            })
            .addCase(uploadApplicationDocuments.fulfilled, (state, action) => {
                state.loading = false;
                state.success = true;
                state.data = action.payload.data || action.payload;
            })
            .addCase(uploadApplicationDocuments.rejected, (state, action) => {
                state.loading = false;
                state.success = false;
                state.error = action.payload as string;
            });
    },
});

// Export actions
export const { clearApplications, hydrateApplicationsListFromCache } =
    applicationsSlice.actions;
export const { clearApplicationStats } = applicationStatsSlice.actions;
export const { resetCreateApplication } = createApplicationSlice.actions;
export const {
    clearApplicationDetail,
    hydrateApplicationDetailFromCache,
} = applicationDetailSlice.actions;
export const setApplicationDetail = hydrateApplicationDetailFromCache;
export const { clearClientApplications } = clientApplicationsSlice.actions;
export const { clearIsoApplications } = isoApplicationsSlice.actions;
export const { clearUnderwriterApplications } = underwriterApplicationsSlice.actions;
export const { resetUpdateApplication } = updateApplicationSlice.actions;
export const { resetRejectApplication } = rejectApplicationSlice.actions;
export const { resetDeleteApplication } = deleteApplicationSlice.actions;
export const { resetUploadDocuments } = uploadDocumentsSlice.actions;

