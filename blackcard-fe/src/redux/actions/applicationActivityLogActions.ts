import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet } from '../axios';
import type { ActivityLogContent } from './activityLogActions';

export interface ApplicationActivityLog {
  id: string;
  applicationId: string | null;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  actionType: string;
  action?: string;
  actionDescription: string;
  previousStatus?: string | null;
  currentStatus?: string | null;
  metadata?: Record<string, unknown> | null;
  category?: string;
  channel?: string | null;
  recipientName?: string | null;
  recipientType?: string | null;
  templateName?: string | null;
  subject?: string | null;
  canView?: boolean;
  createdAt: string;
}

export const getApplicationActivityLogs = createAsyncThunk(
  'applicationActivityLogs/getByApplication',
  async (applicationId: string | number, { rejectWithValue }) => {
    try {
      const response = await axiosGet(`/applications/${applicationId}/activity-logs`);
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      console.error('Get application activity logs error:', error);
      return rejectWithValue(
        err.response?.data?.message || 'Failed to fetch application activity logs'
      );
    }
  }
);

export const getApplicationActivityLogContent = createAsyncThunk(
  'applicationActivityLogs/getContent',
  async (
    { applicationId, logId }: { applicationId: string; logId: string },
    { rejectWithValue },
  ) => {
    try {
      const response = await axiosGet(
        `/applications/${applicationId}/activity-logs/${logId}/content`,
      );
      return (response.data?.data ?? response.data) as ActivityLogContent;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(
        err.response?.data?.message || 'Failed to load message content',
      );
    }
  }
);
