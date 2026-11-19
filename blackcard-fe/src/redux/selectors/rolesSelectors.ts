import type { RootState } from '../store';

export const selectRolesList = (state: RootState) => state.roles?.list ?? [];
export const selectRolesLoading = (state: RootState) => state.roles?.loading ?? false;
export const selectRolesError = (state: RootState) => state.roles?.error ?? null;
