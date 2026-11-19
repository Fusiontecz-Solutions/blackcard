import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosPatch, axiosDelete } from '../axios';

const BASE = '/background-checks';

/** Get (lazy-create) the background check for a deal. */
export const getBackgroundCheck = createAsyncThunk(
    'backgroundCheck/get',
    async (applicationId: string, { rejectWithValue }) => {
        try {
            const res = await axiosGet(`${BASE}/application/${applicationId}`);
            return res.data?.data;
        } catch (e: any) {
            return rejectWithValue(e.response?.data?.message || 'Failed to load background check');
        }
    },
);

export const updateCheckItem = createAsyncThunk(
    'backgroundCheck/updateItem',
    async (
        {
            itemId,
            ...body
        }: {
            itemId: string;
            result?: string | null;
            notes?: string;
            status?: string;
            required?: boolean;
            metadata?: Record<string, unknown> | null;
        },
        { rejectWithValue },
    ) => {
        try {
            const res = await axiosPatch(`${BASE}/items/${itemId}`, body);
            return res.data?.data;
        } catch (e: any) {
            return rejectWithValue(e.response?.data?.message || 'Failed to update check item');
        }
    },
);

export const runAutomatedCheckItem = createAsyncThunk(
    'backgroundCheck/runItem',
    async (itemId: string, { rejectWithValue }) => {
        try {
            const res = await axiosPost(`${BASE}/items/${itemId}/run`, {});
            return res.data?.data;
        } catch (e: any) {
            return rejectWithValue(e.response?.data?.message || 'Failed to run automated background check');
        }
    },
);

export const addCheckAttachment = createAsyncThunk(
    'backgroundCheck/addAttachment',
    async (
        { itemId, url, publicId, originalName }: { itemId: string; url: string; publicId?: string; originalName?: string },
        { rejectWithValue },
    ) => {
        try {
            const res = await axiosPost(`${BASE}/items/${itemId}/attachments`, { url, publicId, originalName });
            return res.data?.data;
        } catch (e: any) {
            return rejectWithValue(e.response?.data?.message || 'Failed to add attachment');
        }
    },
);

export const removeCheckAttachment = createAsyncThunk(
    'backgroundCheck/removeAttachment',
    async (attachmentId: string, { rejectWithValue }) => {
        try {
            const res = await axiosDelete(`${BASE}/attachments/${attachmentId}`);
            return res.data?.data;
        } catch (e: any) {
            return rejectWithValue(e.response?.data?.message || 'Failed to remove attachment');
        }
    },
);

/** Copy CLEAR corporation names into empty Exhibit A slots on the deal's contract. */
export const mapClearCorporationsToExhibit = createAsyncThunk(
    'backgroundCheck/mapToExhibit',
    async (itemId: string, { rejectWithValue }) => {
        try {
            const res = await axiosPost(`${BASE}/items/${itemId}/map-to-exhibit`, {});
            return res.data?.data as {
                added: number;
                names: string[];
                candidates: string[];
                contractId: string;
                check: unknown;
            };
        } catch (e: any) {
            return rejectWithValue(e.response?.data?.message || 'Failed to map CLEAR corporations to Exhibit A');
        }
    },
);

export const setRequiredFlags = createAsyncThunk(
    'backgroundCheck/setRequired',
    async ({ checkId, flags }: { checkId: string; flags: Record<string, boolean> }, { rejectWithValue }) => {
        try {
            const res = await axiosPatch(`${BASE}/${checkId}/required`, { flags });
            return res.data?.data;
        } catch (e: any) {
            return rejectWithValue(e.response?.data?.message || 'Failed to update required checks');
        }
    },
);

export const recordCheckDecision = createAsyncThunk(
    'backgroundCheck/decide',
    async (
        {
            checkId,
            ...body
        }: { checkId: string; outcome: string; reasonText: string; reasonCode?: string; conditionsText?: string; overrideFail?: boolean },
        { rejectWithValue },
    ) => {
        try {
            const res = await axiosPost(`${BASE}/${checkId}/decision`, body);
            return res.data?.data;
        } catch (e: any) {
            return rejectWithValue(e.response?.data?.message || 'Failed to record decision');
        }
    },
);

export const reopenCheck = createAsyncThunk(
    'backgroundCheck/reopen',
    async (checkId: string, { rejectWithValue }) => {
        try {
            const res = await axiosPost(`${BASE}/${checkId}/reopen`, {});
            return res.data?.data;
        } catch (e: any) {
            return rejectWithValue(e.response?.data?.message || 'Failed to reopen check');
        }
    },
);
