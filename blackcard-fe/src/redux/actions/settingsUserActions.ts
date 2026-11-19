import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosPut, axiosDelete } from '../axios';
import type { AppDispatch, RootState } from '../store';
import type { User } from '@/types/userTypes';
import { removeUserFromRole, rollbackRemoveUser } from '../slices/settingsUsersSlice';

// Local cache TTL (5 minutes). Defined here to avoid circular imports.
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Settings tabs use `SYNDICATORS` (plural); Prisma `Role` is `SYNDICATOR`.
 */
const SETTINGS_ROLE_TAB_TO_API_ROLE: Record<string, string> = {
  SYNDICATORS: 'SYNDICATOR',
};

function settingsRoleToApiRole(roleId: string): string {
  const key = String(roleId ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');
  return SETTINGS_ROLE_TAB_TO_API_ROLE[key] ?? key;
}

export interface CreateUserPayload {
  /** Single name field (split to firstName/lastName on backend). */
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: string;
  /** Optional: active/inactive. Default true. */
  status?: boolean;
  /** Legacy: use name instead. */
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  /**
   * With role `SYNDICATOR`: backend creates the linked syndicator profile by default unless set to `false`.
   */
  createSyndicatorProfile?: boolean;
}

/** Fetch users for a role. Uses cache: no refetch if list exists and lastFetched < 5 min. */
export const fetchUsersByRole = createAsyncThunk<
  User[] | { data: User[] },
  string,
  { state: RootState; dispatch: AppDispatch }
>(
  'settingsUsers/fetchByRole',
  async (roleId, { getState, dispatch, rejectWithValue }) => {
    const state = getState();
    const entry = state.settingsUsers?.byRole?.[roleId];
    const now = Date.now();
    if (entry?.list?.length && entry.lastFetched != null && now - entry.lastFetched < CACHE_TTL_MS) {
      return entry.list;
    }
    try {
      const apiRole = settingsRoleToApiRole(roleId);
      const response = await axiosGet(`/users?role=${encodeURIComponent(apiRole)}`);
      const data = response.data;
      const list = data?.data ?? data;
      return Array.isArray(list) ? list : { data: list ?? [] };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message ?? 'Failed to fetch users'
      );
    }
  }
);

/** Create user via POST /auth/register. Splits name into firstName/lastName. On success, refetches users for the role. */
export const createUser = createAsyncThunk<
  any,
  CreateUserPayload,
  { state: RootState; dispatch: AppDispatch }
>(
  'settingsUsers/createUser',
  async (payload: CreateUserPayload, { dispatch, rejectWithValue }) => {
    try {
      const fullName = payload.name?.trim() ?? [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim();
      const parts = fullName ? fullName.split(/\s+/).filter(Boolean) : [];
      const firstName = parts[0] ?? fullName ?? '';
      const lastName = parts.slice(1).join(' ') || parts[0] || '';

      const apiRole = settingsRoleToApiRole(payload.role);
      const body: Record<string, unknown> = {
        name: fullName || `${firstName} ${lastName}`.trim(),
        email: payload.email,
        password: payload.password,
        role: apiRole,
        status: payload.status ?? payload.isActive ?? true,
      };
      if (payload.phone != null && payload.phone !== '') body.phone = payload.phone;
      if (payload.createSyndicatorProfile === true) body.createSyndicatorProfile = true;
      if (payload.createSyndicatorProfile === false) body.createSyndicatorProfile = false;
      // Admin-only endpoint to create users with proper role and welcome email
      const response = await axiosPost('/auth/create-user', body);
      const data = response.data;
      if (data?.success && payload.role) {
        dispatch(fetchUsersByRole(payload.role));
      }
      return data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message ?? 'Failed to create user'
      );
    }
  }
);

export interface DeleteUserPayload {
  roleId: string;
  userId: string;
  user: User;
}

/** Optimistic delete: remove from Redux, then API; rollback on failure. */
export const deleteUser = createAsyncThunk(
  'settingsUsers/deleteUser',
  async (
    { roleId, userId, user }: DeleteUserPayload,
    { dispatch, rejectWithValue }
  ) => {
    dispatch(removeUserFromRole({ roleId, userId }));
    try {
      await axiosDelete(`/users/${userId}`);
    } catch (error: any) {
      dispatch(rollbackRemoveUser({ roleId, user }));
      return rejectWithValue(
        error.response?.data?.message ?? 'Failed to delete user'
      );
    }
  }
);

export interface UpdateUserPayload {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
}

export const updateUser = createAsyncThunk(
  'settingsUsers/updateUser',
  async ({ id, ...payload }: UpdateUserPayload, { rejectWithValue }) => {
    try {
      const response = await axiosPut(`/users/${id}`, payload);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message ?? 'Failed to update user'
      );
    }
  }
);
