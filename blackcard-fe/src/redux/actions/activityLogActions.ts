import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet } from '../axios';

export interface ActivityLogUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export interface ActivityLog {
  _id: string;
  id?: string;
  user: ActivityLogUser | string | null;
  action: string;
  entity: string;
  entityId?: string;
  applicationId?: string | null;
  applicationNumericId?: number | null;
  description?: string;
  category?: string;
  channel?: string | null;
  recipientName?: string | null;
  recipientType?: string | null;
  templateName?: string | null;
  subject?: string | null;
  viewType?: string | null;
  paymentMailLogId?: string | null;
  outboundCommunicationId?: string | null;
  ipAddress?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  canView?: boolean;
  createdAt: string;
}

export interface ActivityLogContent {
  viewType: string;
  channel?: string;
  recipient?: string;
  recipientType?: string | null;
  templateName?: string | null;
  documentName?: string | null;
  category?: string;
  subject?: string | null;
  body?: string | null;
  status?: string;
  applicationId?: string | null;
  contractId?: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
  attachments?: string[];
  delivery?: Record<string, unknown>;
  note?: string;
  createdAt?: string;
}

export interface GetActivityLogsParams {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  category?: string;
  channel?: string;
  recipientType?: string;
  entity?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

export const getActivityLogs = createAsyncThunk(
  'activityLogs/getAll',
  async (params: GetActivityLogsParams = {}, { rejectWithValue }) => {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.search) queryParams.append('search', params.search);
      if (params.action) queryParams.append('action', params.action);
      if (params.category) queryParams.append('category', params.category);
      if (params.channel) queryParams.append('channel', params.channel);
      if (params.recipientType) queryParams.append('recipientType', params.recipientType);
      if (params.entity) queryParams.append('entity', params.entity);
      if (params.userId) queryParams.append('userId', params.userId);
      if (params.startDate) queryParams.append('startDate', params.startDate);
      if (params.endDate) queryParams.append('endDate', params.endDate);

      const url = `/activity-logs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await axiosGet(url);
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      console.error('Get activity logs error:', error);
      return rejectWithValue(
        err.response?.data?.message || 'Failed to fetch activity logs'
      );
    }
  }
);

export const getActivityLogContent = createAsyncThunk(
  'activityLogs/getContent',
  async (logId: string, { rejectWithValue }) => {
    try {
      const response = await axiosGet(`/activity-logs/${logId}/content`);
      return response.data?.data ?? response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(
        err.response?.data?.message || 'Failed to load message content'
      );
    }
  }
);
