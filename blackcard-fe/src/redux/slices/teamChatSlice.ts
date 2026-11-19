import { createSlice } from '@reduxjs/toolkit';
import {
  fetchChannels,
  fetchUserDMs,
  createTeamChannel,
  fetchChannelMessages,
} from '../actions/teamChatActions';

// ────────────────── Types ──────────────────

/** Nested user object returned inside a channel membership row */
export interface MemberUser {
  id: string;
  firstName: string;
  lastName: string;
  role?: string;
  email?: string;
  profilePicture?: string;
}

/**
 * Flattened channel member used by the UI.
 * The reducer flattens `member.user.*` → top‑level fields for convenience.
 */
export interface ChannelMember {
  id: string;          // membership row id
  channelId: string;
  userId: string;
  user?: MemberUser;
  // flattened from user — filled in by the reducer
  firstName?: string;
  lastName?: string;
  role?: string;
  email?: string;
  profilePicture?: string;
  [key: string]: unknown;
}

export interface LastMessageInfo {
  id: string;
  content?: string;
  createdAt?: string;
  sender?: {
    id: string;
    firstName: string;
    lastName?: string;
  };
  [key: string]: unknown;
}

export interface Channel {
  id: string;
  name: string;
  type?: string;        // 'channel' | 'dm'
  isPrivate?: boolean;
  description?: string;
  lastMessageId?: string | null;
  lastMessageAt?: string | null;
  dmId?: string | null;
  createdAt?: string;
  members?: ChannelMember[];
  lastMessage?: LastMessageInfo | null;
  [key: string]: unknown;
}

export interface DirectMessage {
  id: string;
  participants?: ChannelMember[];
  lastMessage?: string | LastMessageInfo | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  [key: string]: unknown;
}

export interface ChannelMessageSender {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  profilePicture?: string;
  [key: string]: unknown;
}

export interface ChannelMessage {
  id?: string;
  channelId: string;
  content: string;
  senderId?: string;
  sender?: ChannelMessageSender;
  createdAt: string;
  isDeleted?: boolean;
  isEdited?: boolean;
  attachments?: { id: string; url: string; fileName: string; fileType: string }[];
  [key: string]: unknown;
}

// ────────────────── State ──────────────────

interface TeamChatState {
  channels: Channel[];
  dms: DirectMessage[];
  messages: Record<string, ChannelMessage[]>; // keyed by channelId
  activeChannelId: string | null;

  channelsLoading: boolean;
  channelsError: string | null;

  dmsLoading: boolean;
  dmsError: string | null;

  createChannelLoading: boolean;
  createChannelError: string | null;

  messagesLoading: boolean;
  messagesError: string | null;
}

const initialState: TeamChatState = {
  channels: [],
  dms: [],
  messages: {},
  activeChannelId: null,

  channelsLoading: false,
  channelsError: null,

  dmsLoading: false,
  dmsError: null,

  createChannelLoading: false,
  createChannelError: null,

  messagesLoading: false,
  messagesError: null,
};

// ────────────────── Slice ──────────────────

const teamChatSlice = createSlice({
  name: 'teamChat',
  initialState,
  reducers: {
    setActiveChannel: (state, action: { payload: string | null }) => {
      state.activeChannelId = action.payload;
    },
    addChannelMessage: (state, action: { payload: ChannelMessage }) => {
      const msg = action.payload;
      const cid = msg.channelId;
      if (!state.messages[cid]) state.messages[cid] = [];

      const msgId = msg.id;
      const isTemp = msgId && String(msgId).startsWith('temp-');

      // If this is a real (non-temp) message, try to replace an existing temp
      // message from the same sender with matching content (optimistic update).
      if (!isTemp) {
        const existsReal = state.messages[cid].some((m) => m.id === msgId);
        if (existsReal) return;                       // exact duplicate – skip

        const tempIdx = state.messages[cid].findIndex(
          (m) =>
            String(m.id).startsWith('temp-') &&
            m.senderId === msg.senderId &&
            m.content === msg.content
        );
        if (tempIdx !== -1) {
          state.messages[cid][tempIdx] = msg;         // replace optimistic msg
          return;
        }
      }

      state.messages[cid].push(msg);
    },
    addChannel: (state, action: { payload: Channel }) => {
      const exists = state.channels.some((c) => c.id === action.payload.id);
      if (!exists) {
        state.channels.push(action.payload);
      }
    },
    removeChannel: (state, action: { payload: string }) => {
      state.channels = state.channels.filter((c) => c.id !== action.payload);
      delete state.messages[action.payload];
      if (state.activeChannelId === action.payload) {
        state.activeChannelId = null;
      }
    },
    clearTeamChat: () => initialState,
  },
  extraReducers: (builder) => {
    /** Flatten nested `user` object onto each member for easy UI access */
    const flattenMembers = (members?: ChannelMember[]): ChannelMember[] | undefined => {
      if (!members) return undefined;
      return members.map((m) => ({
        ...m,
        firstName: m.firstName || m.user?.firstName,
        lastName: m.lastName || m.user?.lastName,
        role: m.role || m.user?.role,
        email: m.email || m.user?.email,
        profilePicture: m.profilePicture || m.user?.profilePicture,
      }));
    };

    /** Normalize a single channel (flatten members) */
    const normalizeChannel = (c: Channel): Channel => ({
      ...c,
      members: flattenMembers(c.members as ChannelMember[]),
    });

    builder
      // ── fetchChannels ──
      .addCase(fetchChannels.pending, (state) => {
        state.channelsLoading = true;
        state.channelsError = null;
      })
      .addCase(fetchChannels.fulfilled, (state, action) => {
        state.channelsLoading = false;
        state.channels = (action.payload ?? []).map(normalizeChannel);
      })
      .addCase(fetchChannels.rejected, (state, action) => {
        state.channelsLoading = false;
        state.channelsError = action.payload as string;
      })

      // ── fetchUserDMs ──
      .addCase(fetchUserDMs.pending, (state) => {
        state.dmsLoading = true;
        state.dmsError = null;
      })
      .addCase(fetchUserDMs.fulfilled, (state, action) => {
        state.dmsLoading = false;
        state.dms = (action.payload ?? []).map((dm) => ({
          ...dm,
          participants: flattenMembers(dm.participants as ChannelMember[]),
        }));
      })
      .addCase(fetchUserDMs.rejected, (state, action) => {
        state.dmsLoading = false;
        state.dmsError = action.payload as string;
      })

      // ── createTeamChannel ──
      .addCase(createTeamChannel.pending, (state) => {
        state.createChannelLoading = true;
        state.createChannelError = null;
      })
      .addCase(createTeamChannel.fulfilled, (state, action) => {
        state.createChannelLoading = false;
        const raw = action.payload;
        if (!raw) return;
        const channel = normalizeChannel(raw);
        if (channel.id && !state.channels.some((c) => c.id === channel.id)) {
          state.channels.push(channel);
        }
      })
      .addCase(createTeamChannel.rejected, (state, action) => {
        state.createChannelLoading = false;
        state.createChannelError = action.payload as string;
      })

      // ── fetchChannelMessages ──
      .addCase(fetchChannelMessages.pending, (state) => {
        state.messagesLoading = true;
        state.messagesError = null;
      })
      .addCase(fetchChannelMessages.fulfilled, (state, action) => {
        state.messagesLoading = false;
        const { channelId, messages } = action.payload;
        state.messages[channelId] = messages ?? [];
      })
      .addCase(fetchChannelMessages.rejected, (state, action) => {
        state.messagesLoading = false;
        state.messagesError = action.payload as string;
      });
  },
});

export const {
  setActiveChannel,
  addChannelMessage,
  addChannel,
  removeChannel,
  clearTeamChat,
} = teamChatSlice.actions;

export default teamChatSlice.reducer;
