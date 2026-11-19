import { createSlice } from '@reduxjs/toolkit';
import { fetchRoles } from '../actions/roleActions';

export interface RoleItem {
  id: string;
  roleName: string;
  name?: string;
}

interface RolesState {
  list: RoleItem[];
  loading: boolean;
  error: string | null;
}

const initialState: RolesState = {
  list: [],
  loading: false,
  error: null,
};

export const rolesSlice = createSlice({
  name: 'roles',
  initialState,
  reducers: {
    clearRoles: (state) => {
      state.list = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRoles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload ?? [];
      })
      .addCase(fetchRoles.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) ?? 'Failed to fetch roles';
      });
  },
});

export const { clearRoles } = rolesSlice.actions;
