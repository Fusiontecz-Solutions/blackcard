import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost, axiosPut, axiosDelete } from '../axios';
import type { Conversation, Message } from '../slices/chatSlice';

// Get all conversations
export const fetchConversations = createAsyncThunk(
  'chat/fetchConversations',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet('/chat/conversations');
      return response.data.data as Conversation[];
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch conversations');
    }
  }
);

// Get conversation by ID
export const fetchConversationById = createAsyncThunk(
  'chat/fetchConversationById',
  async (conversationId: string, { rejectWithValue }) => {
    try {
      const response = await axiosGet(`/chat/conversations/${conversationId}`);
      return response.data.data as Conversation;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch conversation');
    }
  }
);

// Create conversation
export const createConversation = createAsyncThunk(
  'chat/createConversation',
  async (
    data: {
      type: 'DIRECT' | 'GROUP' | 'APPLICATION';
      participantIds?: string[];
      name?: string;
      applicationId?: string;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await axiosPost('/chat/conversations', data);
      return response.data.data as Conversation;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create conversation');
    }
  }
);

// Get messages for a conversation
export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async (
    { conversationId, limit = 50, offset = 0 }: { conversationId: string; limit?: number; offset?: number },
    { rejectWithValue }
  ) => {
    try {
      const response = await axiosGet(`/chat/conversations/${conversationId}/messages`, {
        params: { limit, offset },
      });
      return {
        conversationId,
        messages: response.data.data as Message[],
      };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch messages');
    }
  }
);

// Search messages
export const searchMessages = createAsyncThunk(
  'chat/searchMessages',
  async (
    { query, conversationId }: { query: string; conversationId?: string },
    { rejectWithValue }
  ) => {
    try {
      const response = await axiosGet('/chat/messages/search', {
        params: { query, conversationId },
      });
      return response.data.data as Message[];
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to search messages');
    }
  }
);

// Export messages
export const exportMessages = createAsyncThunk(
  'chat/exportMessages',
  async (
    { conversationId, format = 'json' }: { conversationId: string; format?: 'json' | 'csv' },
    { rejectWithValue }
  ) => {
    try {
      const response = await axiosGet(`/chat/conversations/${conversationId}/export`, {
        params: { format },
        responseType: format === 'csv' ? 'blob' : 'json',
      });
      return { conversationId, data: response.data, format };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to export messages');
    }
  }
);

// Add participants to conversation
export const addParticipants = createAsyncThunk(
  'chat/addParticipants',
  async (
    { conversationId, participantIds }: { conversationId: string; participantIds: string[] },
    { rejectWithValue }
  ) => {
    try {
      const response = await axiosPost(`/chat/conversations/${conversationId}/participants`, {
        participantIds,
      });
      return { conversationId, ...response.data.data };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to add participants');
    }
  }
);

// Remove participant from conversation
export const removeParticipant = createAsyncThunk(
  'chat/removeParticipant',
  async (
    { conversationId, userId }: { conversationId: string; userId: string },
    { rejectWithValue }
  ) => {
    try {
      await axiosDelete(`/chat/conversations/${conversationId}/participants/${userId}`);
      return { conversationId, userId };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to remove participant');
    }
  }
);

// Update conversation
export const updateConversation = createAsyncThunk(
  'chat/updateConversation',
  async (
    { conversationId, name }: { conversationId: string; name?: string },
    { rejectWithValue }
  ) => {
    try {
      const response = await axiosPut(`/chat/conversations/${conversationId}`, { name });
      return response.data.data as Conversation;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update conversation');
    }
  }
);

// Delete conversation
export const deleteConversation = createAsyncThunk(
  'chat/deleteConversation',
  async (conversationId: string, { rejectWithValue }) => {
    try {
      await axiosDelete(`/chat/conversations/${conversationId}`);
      return conversationId;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete conversation');
    }
  }
);
