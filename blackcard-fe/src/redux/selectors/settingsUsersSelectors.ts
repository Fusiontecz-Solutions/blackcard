import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';

const selectByRole = (state: RootState) => state.settingsUsers?.byRole ?? {};

/** Memoized: returns users list for a role. */
export const selectUsersByRole = createSelector(
  [selectByRole, (_state: RootState, roleId: string) => roleId],
  (byRole, roleId) => byRole[roleId]?.list ?? []
);

export const selectUsersLoadingByRole = (state: RootState, roleId: string): boolean =>
  state.settingsUsers?.byRole?.[roleId]?.loading ?? false;

export const selectLastFetchedByRole = (state: RootState, roleId: string): number | null =>
  state.settingsUsers?.byRole?.[roleId]?.lastFetched ?? null;
