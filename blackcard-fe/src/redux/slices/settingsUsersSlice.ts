import { createSlice } from '@reduxjs/toolkit';
import type { User } from '@/types/userTypes';
import {
  fetchUsersByRole,
  createUser,
  updateUser,
} from '../actions/settingsUserActions';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface UsersByRoleEntry {
  list: User[];
  loading: boolean;
  lastFetched: number | null;
}

interface SettingsUsersState {
  byRole: Record<string, UsersByRoleEntry>;
}

function getInitialEntry(): UsersByRoleEntry {
  return { list: [], loading: false, lastFetched: null };
}

const initialState: SettingsUsersState = {
  byRole: {},
};

export const settingsUsersSlice = createSlice({
  name: 'settingsUsers',
  initialState,
  reducers: {
    addUserToRole: (state, action: { payload: { roleId: string; user: User } }) => {
      const { roleId, user } = action.payload;
      if (!state.byRole[roleId]) state.byRole[roleId] = getInitialEntry();
      const exists = state.byRole[roleId].list.some(
        (u) => (u._id || (u as any).id) === (user._id || (user as any).id)
      );
      if (!exists) state.byRole[roleId].list.unshift(user);
    },
    removeUserFromRole: (state, action: { payload: { roleId: string; userId: string } }) => {
      const { roleId, userId } = action.payload;
      if (!state.byRole[roleId]) return;
      state.byRole[roleId].list = state.byRole[roleId].list.filter(
        (u) => (u._id || (u as any).id) !== userId
      );
    },
    rollbackRemoveUser: (state, action: { payload: { roleId: string; user: User } }) => {
      const { roleId, user } = action.payload;
      if (!state.byRole[roleId]) state.byRole[roleId] = getInitialEntry();
      const exists = state.byRole[roleId].list.some(
        (u) => (u._id || (u as any).id) === (user._id || (user as any).id)
      );
      if (!exists) state.byRole[roleId].list.unshift(user);
    },
    invalidateRoleCache: (state, action: { payload: string }) => {
      const roleId = action.payload;
      if (state.byRole[roleId]) state.byRole[roleId].lastFetched = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchUsersByRole
      .addCase(fetchUsersByRole.pending, (state, action) => {
        const roleId = action.meta.arg;
        if (!state.byRole[roleId]) state.byRole[roleId] = getInitialEntry();
        state.byRole[roleId].loading = true;
      })
      .addCase(fetchUsersByRole.fulfilled, (state, action) => {
        const roleId = action.meta.arg;
        if (!state.byRole[roleId]) state.byRole[roleId] = getInitialEntry();
        state.byRole[roleId].loading = false;
        state.byRole[roleId].lastFetched = Date.now();
        const payload = action.payload;
        state.byRole[roleId].list = Array.isArray(payload)
          ? payload
          : (payload?.data ?? []);
      })
      .addCase(fetchUsersByRole.rejected, (state, action) => {
        const roleId = action.meta.arg;
        if (state.byRole[roleId]) state.byRole[roleId].loading = false;
      })
      // createUser – optimistic append
      .addCase(createUser.fulfilled, (state, action) => {
        const data = action.payload?.data ?? action.payload;
        if (!data) return;
        const apiRole = String((data as { role?: string }).role ?? '');
        const requestedTab = action.meta.arg?.role as string | undefined;
        /** List is keyed by settings tab id (e.g. SYNDICATORS), not Prisma role (SYNDICATOR). */
        const roleId =
          requestedTab ??
          (apiRole === 'SYNDICATOR' ? 'SYNDICATORS' : apiRole);
        if (!roleId) return;
        if (!state.byRole[roleId]) state.byRole[roleId] = getInitialEntry();
        const user = data as User;
        const exists = state.byRole[roleId].list.some(
          (u) => (u._id || (u as any).id) === (user._id || (user as any).id)
        );
        if (!exists) state.byRole[roleId].list.unshift(user);
      })
      // deleteUser – optimistic remove in thunk; rollback dispatched from thunk on reject
      // updateUser – update in place if present
      .addCase(updateUser.fulfilled, (state, action) => {
        const data = action.payload?.data ?? action.payload;
        if (!data) return;
        const user = data as User;
        const id = user._id || (user as any).id;
        const roleId = user.role;
        if (!roleId || !state.byRole[roleId]) return;
        const idx = state.byRole[roleId].list.findIndex(
          (u) => (u._id || (u as any).id) === id
        );
        if (idx >= 0) state.byRole[roleId].list[idx] = user;
      });
  },
});

export const {
  addUserToRole,
  removeUserFromRole,
  rollbackRemoveUser,
  invalidateRoleCache,
} = settingsUsersSlice.actions;

export const CACHE_TTL_MS_EXPORT = CACHE_TTL_MS;
