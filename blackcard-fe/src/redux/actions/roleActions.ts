import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet } from '../axios';
import type { RoleItem } from '../slices/rolesSlice';

/** API returns `SYNDICATOR` (Prisma); Settings tabs use `SYNDICATORS`. */
function apiRoleToSettingsTabId(role: string): string {
  const u = role.trim().toUpperCase().replace(/-/g, '_');
  return u === 'SYNDICATOR' ? 'SYNDICATORS' : u;
}

const ROLE_TAB_LABELS: Record<string, string> = {
  AGENT: 'Agent',
  SCRUBBING: 'Scrubbing',
  UNDERWRITER: 'Underwriters',
  SYNDICATORS: 'Syndicators',
  ACCOUNTANT: 'Accountant',
  ACCOUNTS: 'Accounts',
  ADMIN: 'Admin',
  OPERATIONS: 'Operations',
  SUPER_ADMIN: 'Super Admin',
};

function labelForTabId(tabId: string): string {
  return (
    ROLE_TAB_LABELS[tabId] ??
    tabId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Backend returns `string[]`; normalize to `RoleItem` with stable tab ids. */
function normalizeRolesPayload(raw: unknown): RoleItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') {
      const tabId = apiRoleToSettingsTabId(item);
      const roleName = labelForTabId(tabId);
      return { id: tabId, roleName, name: roleName };
    }
    const o = item as { id?: string; roleName?: string; name?: string };
    const rawId = String(o.id ?? '').trim();
    const tabId = apiRoleToSettingsTabId(rawId);
    return {
      id: tabId,
      roleName: o.roleName ?? labelForTabId(tabId),
      name: o.name ?? o.roleName ?? labelForTabId(tabId),
    };
  });
}

export const fetchRoles = createAsyncThunk<RoleItem[]>(
  'roles/fetchRoles',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet('/roles');
      const data = response.data;
      if (data?.success && Array.isArray(data.data)) {
        return normalizeRolesPayload(data.data);
      }
      return [];
    } catch (error: any) {
      const message = error.response?.data?.message ?? 'Failed to fetch roles';
      return rejectWithValue(message);
    }
  }
);
