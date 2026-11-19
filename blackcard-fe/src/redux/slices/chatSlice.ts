import { createSlice } from '@reduxjs/toolkit';
import {
  fetchConversations,
  fetchConversationById,
  createConversation,
  fetchMessages,
  deleteConversation,
} from '../actions/chatActions';

// Types used by components and chatActions
export interface ConversationParticipant {
  userId: string;
  user?: MessageSender;
  [key: string]: unknown;
}

export interface Conversation {
  id: string;
  type: 'DIRECT' | 'GROUP' | 'APPLICATION';
  name?: string;
  participants?: ConversationParticipant[];
  applicationId?: string;
  [key: string]: unknown;
}

export interface MessageAttachment {
  id: string;
  url: string;
  fileName: string;
  fileType: string;
}

export interface MessageSender {
  _id?: string;
  id?: string;
  firstName: string;
  lastName: string;
  email?: string;
  role?: string;
  profilePicture?: string;
  [key: string]: unknown;
}

/** Single read receipt (one user read the message) */
export interface MessageReadReceipt {
  userId: string;
  readAt: string;
  [key: string]: unknown;
}

export interface Message {
  _id?: string;
  id?: string;
  conversationId: string;
  content: string;
  senderId?: string;
  sender?: MessageSender;
  createdAt: string;
  isDeleted?: boolean;
  replyTo?: { sender: MessageSender; content: string };
  attachments?: MessageAttachment[];
  /** ✓ Delivered: message reached server/receiver */
  deliveredAt?: string | null;
  /** ✓✓ Read: receipts when message was read by recipient(s) */
  messageReads?: MessageReadReceipt[];
  isEdited?: boolean;
  [key: string]: unknown;
}

interface ChatState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  typingUsers: Record<string, Array<{ userId: string; userName: string }>>;
  onlineUsers: string[];
  unreadCounts: Record<string, number>;
}

const initialState: ChatState = {
  conversations: [],
  messages: {},
  typingUsers: {},
  onlineUsers: [],
  unreadCounts: {},
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addConversation: (state, action: { payload: Conversation }) => {
      const exists = state.conversations.some((c) => c.id === action.payload.id);
      if (!exists) {
        state.conversations.push(action.payload);
      }
    },
    addMessage: (state, action: { payload: Message }) => {
      const cid = action.payload.conversationId;
      if (!state.messages[cid]) state.messages[cid] = [];
      const msgId = action.payload._id || action.payload.id;
      const msgContent = action.payload.content?.trim();
      const msgCreatedAt = action.payload.createdAt;
      
      // Check for duplicate by ID first (most reliable)
      const existingByIdIndex = state.messages[cid].findIndex(
        (m) => {
          const mId = m._id || m.id;
          return mId && msgId && String(mId) === String(msgId) && !String(msgId).startsWith('temp-');
        }
      );
      
      if (existingByIdIndex >= 0) {
        // Update existing message (server message replacing optimistic one)
        const existing = state.messages[cid][existingByIdIndex];
        state.messages[cid][existingByIdIndex] = {
          ...action.payload,
          // CRITICAL: Preserve senderId from optimistic message if server message lacks it
          senderId: action.payload.senderId || existing.senderId,
        };
        return;
      }
      
      // Check for duplicate by content + timestamp (for temp messages that might be replaced)
      if (msgId && String(msgId).startsWith('temp-')) {
        // For temp messages, check if server message with same content+time already exists
        const duplicateByContent = state.messages[cid].find(
          (m) => {
            const mId = m._id || m.id;
            // If there's a non-temp message with same content and very close timestamp, it's likely a duplicate
            if (mId && !String(mId).startsWith('temp-') && m.content?.trim() === msgContent) {
              const timeDiff = Math.abs(new Date(m.createdAt).getTime() - new Date(msgCreatedAt).getTime());
              return timeDiff < 5000; // Within 5 seconds
            }
            return false;
          }
        );
        if (duplicateByContent) {
          // Don't add temp message if server message already exists
          return;
        }
      } else {
        // For server messages, check if temp message with same content exists and replace it
        const tempMessageIndex = state.messages[cid].findIndex(
          (m) => {
            const mId = m._id || m.id;
            return mId && String(mId).startsWith('temp-') && 
                   m.content?.trim() === msgContent &&
                   Math.abs(new Date(m.createdAt).getTime() - new Date(msgCreatedAt).getTime()) < 5000;
          }
        );
        if (tempMessageIndex >= 0) {
          // Replace temp message with server message, preserving senderId
          const tempMsg = state.messages[cid][tempMessageIndex];
          state.messages[cid][tempMessageIndex] = {
            ...action.payload,
            senderId: action.payload.senderId || tempMsg.senderId,
          };
          return;
        }
      }
      
      // No duplicate found, add the message
      state.messages[cid].push(action.payload);
    },
    setTyping: (
      state,
      action: { payload: { conversationId: string; userId: string; userName: string } }
    ) => {
      const { conversationId, userId, userName } = action.payload;
      if (!state.typingUsers[conversationId]) state.typingUsers[conversationId] = [];
      const idx = state.typingUsers[conversationId].findIndex((t) => t.userId === userId);
      if (idx >= 0) {
        state.typingUsers[conversationId][idx].userName = userName;
      } else {
        state.typingUsers[conversationId].push({ userId, userName });
      }
    },
    removeTyping: (state, action: { payload: { conversationId: string; userId: string } }) => {
      const { conversationId, userId } = action.payload;
      if (state.typingUsers[conversationId]) {
        state.typingUsers[conversationId] = state.typingUsers[conversationId].filter(
          (t) => t.userId !== userId
        );
      }
    },
    setOnlineUsers: (state, action: { payload: string[] }) => {
      state.onlineUsers = action.payload;
    },
    addOnlineUser: (state, action: { payload: string }) => {
      const id = action.payload;
      if (id && !state.onlineUsers.includes(id)) {
        state.onlineUsers.push(id);
      }
    },
    removeOnlineUser: (state, action: { payload: string }) => {
      const id = action.payload;
      if (id) {
        state.onlineUsers = state.onlineUsers.filter((u) => u !== id);
      }
    },
    setUnreadCount: (state, action: { payload: { conversationId: string; count: number } }) => {
      state.unreadCounts[action.payload.conversationId] = action.payload.count;
    },
    /** Increment unread by 1 (e.g. when receiver gets new_message and is not viewing that conversation) */
    incrementUnreadCount: (state, action: { payload: string }) => {
      const conversationId = action.payload;
      state.unreadCounts[conversationId] = (state.unreadCounts[conversationId] ?? 0) + 1;
    },
    /** Mark message as delivered (✓) – e.g. when server confirms or message is saved */
    updateMessageDelivered: (
      state,
      action: { payload: { conversationId: string; messageId: string; tempId?: string; deliveredAt?: string } }
    ) => {
      const { conversationId, messageId, tempId, deliveredAt } = action.payload;
      const list = state.messages[conversationId];
      if (!list) return;
      const msg = list.find(
        (m) => (m.id || m._id) === messageId || (tempId && (m.id || m._id) === tempId)
      );
      if (msg) {
        if (tempId && (msg.id === tempId || msg._id === tempId)) {
          // Update ID but preserve senderId - critical for message alignment
          const preservedSenderId = msg.senderId;
          msg.id = messageId;
          (msg as Record<string, unknown>)._id = messageId;
          // Ensure senderId is preserved when updating temp message
          if (preservedSenderId && !msg.senderId) {
            msg.senderId = preservedSenderId;
          }
        }
        msg.deliveredAt = deliveredAt ?? new Date().toISOString();
      }
    },
    /** Update read receipts (✓✓) for messages – real-time when receiver reads */
    updateMessageReads: (
      state,
      action: {
        payload: {
          conversationId: string;
          reads: Array<{ messageId: string; userId: string; readAt: string }>;
        };
      }
    ) => {
      const { conversationId, reads } = action.payload;
      const list = state.messages[conversationId];
      if (!list) return;
      for (const r of reads) {
        const msg = list.find((m) => (m.id || m._id) === r.messageId);
        if (msg) {
          const arr = msg.messageReads ?? [];
          if (!arr.some((x) => x.userId === r.userId)) {
            arr.push({ userId: r.userId, readAt: r.readAt });
            msg.messageReads = arr;
          }
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.fulfilled, (state, action) => {
        const list = action.payload ?? [];
        state.conversations = list;
        list.forEach((c: Conversation & { unreadCount?: number }) => {
          state.unreadCounts[c.id] = c.unreadCount ?? 0;
        });
      })
      .addCase(fetchConversationById.fulfilled, (state, action) => {
        const conv = action.payload;
        if (conv) {
          const idx = state.conversations.findIndex((c) => c.id === conv.id);
          if (idx >= 0) {
            state.conversations[idx] = conv;
          } else {
            state.conversations.push(conv);
          }
        }
      })
      .addCase(createConversation.fulfilled, (state, action) => {
        const conv = action.payload;
        if (conv && !state.conversations.some((c) => c.id === conv.id)) {
          state.conversations.push(conv);
        }
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { conversationId, messages: fetched } = action.payload;
        const fetchedList = fetched ?? [];
        const existing = state.messages[conversationId] ?? [];
        
        // Create a map of existing messages by ID for quick lookup and senderId preservation
        const existingMap = new Map<string, Message>();
        existing.forEach((m) => {
          const id = m.id ?? m._id;
          if (id) {
            const idStr = String(id);
            // Keep the first occurrence (prefer optimistic messages with senderId)
            if (!existingMap.has(idStr) || (m.senderId && !existingMap.get(idStr)?.senderId)) {
              existingMap.set(idStr, m);
            }
        }
        });
        
        // Create set of fetched message IDs for deduplication
        const fetchedIds = new Set(fetchedList.map((m) => {
          const id = m.id ?? m._id;
          return id ? String(id) : null;
        }).filter(Boolean) as string[]);
        
        // Merge fetched messages, preserving senderId from existing optimistic messages
        const merged = fetchedList.map((fetchedMsg) => {
          const id = fetchedMsg.id ?? fetchedMsg._id;
          if (!id) return fetchedMsg;
          
          const existingMsg = existingMap.get(String(id));
          if (existingMsg && existingMsg.senderId && !fetchedMsg.senderId) {
            // Preserve senderId from optimistic message
            return { ...fetchedMsg, senderId: existingMsg.senderId };
          }
          return fetchedMsg;
        });
        
        // Add back any existing optimistic messages not in fetched list (e.g., just sent but not yet in DB)
        const existingOnly = existing.filter((m) => {
          const id = m.id ?? m._id;
          return id && !fetchedIds.has(String(id));
        });
        
        // Combine and sort by timestamp
        const finalMerged = [...merged, ...existingOnly].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        state.messages[conversationId] = finalMerged;
      })
      .addCase(deleteConversation.fulfilled, (state, action) => {
        const conversationId = action.payload;
        state.conversations = state.conversations.filter((c) => c.id !== conversationId);
        delete state.messages[conversationId];
        delete state.unreadCounts[conversationId];
        delete state.typingUsers[conversationId];
      });
  },
});

export const {
  addConversation,
  addMessage,
  setTyping,
  removeTyping,
  setOnlineUsers,
  addOnlineUser,
  removeOnlineUser,
  setUnreadCount,
  incrementUnreadCount,
  updateMessageDelivered,
  updateMessageReads,
} = chatSlice.actions;
export default chatSlice.reducer;
