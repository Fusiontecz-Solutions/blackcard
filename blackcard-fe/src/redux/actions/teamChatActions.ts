import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost } from '../axios';
import type { Channel, DirectMessage, ChannelMessage } from '../slices/teamChatSlice';

/**
 * Helper: the backend wraps every response as { success, data }.
 * `axiosGet` returns an AxiosResponse, so `response.data` = { success, data }.
 * We need `response.data.data` for the actual payload.
 */
function extractData<T>(responseData: any): T {
  // responseData = axios response.data = { success: true, data: <actual> }
  if (responseData && typeof responseData === 'object' && 'data' in responseData) {
    return responseData.data as T;
  }
  return responseData as T;
}

// GET /team-chat/channels — fetch all team channels
export const fetchChannels = createAsyncThunk<Channel[], void>(
  'teamChat/fetchChannels',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet('/team-chat/channels');
      const channels = extractData<Channel[]>(response.data);
      return channels ?? [];
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch channels'
      );
    }
  }
);

// GET /team-chat/dms — fetch user DMs
export const fetchUserDMs = createAsyncThunk<DirectMessage[], void>(
  'teamChat/fetchUserDMs',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet('/team-chat/dms');
      const dms = extractData<DirectMessage[]>(response.data);
      return dms ?? [];
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch DMs'
      );
    }
  }
);

// POST /team-chat/channel — create a new team channel
export const createTeamChannel = createAsyncThunk<
  Channel,
  { name: string; type?: string; isPrivate?: boolean; members?: string[] }
>(
  'teamChat/createTeamChannel',
  async (data, { rejectWithValue }) => {
    try {
      const response = await axiosPost('/team-chat/channel', data);
      return extractData<Channel>(response.data);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to create channel'
      );
    }
  }
);

// GET /team-chat/messages/:channelId — fetch messages for a channel
export const fetchChannelMessages = createAsyncThunk<
  { channelId: string; messages: ChannelMessage[] },
  { channelId: string; limit?: number; offset?: number }
>(
  'teamChat/fetchChannelMessages',
  async ({ channelId, limit = 50, offset = 0 }, { rejectWithValue }) => {
    try {
      const response = await axiosGet(`/team-chat/messages/${channelId}`, {
        params: { limit, offset },
      });
      const raw = extractData<any[]>(response.data) ?? [];
      const messages: ChannelMessage[] = raw.map((m: any) => ({
        id: String(m.id ?? ''),
        channelId: String(m.channelId ?? channelId),
        // Backend returns `message`; UI expects `content`.
        content: String(m.content ?? m.message ?? ''),
        senderId: String(m.senderId ?? ''),
        createdAt: String(m.createdAt ?? new Date().toISOString()),
        sender: m.sender
          ? {
              id: String(m.sender.id ?? m.senderId ?? ''),
              firstName: String(m.sender.firstName ?? ''),
              lastName: String(m.sender.lastName ?? ''),
              email: m.sender.email ? String(m.sender.email) : undefined,
              profilePicture: m.sender.profilePicture
                ? String(m.sender.profilePicture)
                : undefined,
            }
          : undefined,
        attachments: Array.isArray(m.attachments)
          ? m.attachments.map((a: any, i: number) => ({
              id: String(a.id ?? `att-${i}`),
              url: String(a.url ?? ''),
              fileName: String(a.fileName ?? a.name ?? 'Attachment'),
              fileType: String(a.fileType ?? a.type ?? 'application/octet-stream'),
            }))
          : undefined,
      }));
      return { channelId, messages };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch channel messages'
      );
    }
  }
);
