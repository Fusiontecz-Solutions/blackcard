import { useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSocket } from '@/context/SocketContext';
import { fetchConversations, fetchMessages, createConversation } from '@/redux/actions/chatActions';
import { useChatMessagesRestFallback } from '@/hooks/useChatMessagesRestFallback';
import {
  addConversation,
  addMessage,
  setTyping,
  removeTyping,
  updateMessageDelivered,
  updateMessageReads,
  setUnreadCount,
} from '@/redux/slices/chatSlice';
import type { RootState, AppDispatch } from '@/redux/store';
import type { Message, MessageSender } from '@/redux/slices/chatSlice';

const TEAM_CHAT_NAMES = ['Team Chat', 'General'];

function getTeamConversationId(conversations: { id: string; type: string; name?: string }[]): string | null {
  const found = conversations.find(
    (c) => c.type === 'GROUP' && TEAM_CHAT_NAMES.some((name) => c.name === name)
  );
  return found?.id ?? null;
}

export function useTeamChat() {
  const dispatch = useDispatch<AppDispatch>();
  const { socket } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentTempIdRef = useRef<string | null>(null);
  const createAttemptedRef = useRef(false);

  const conversations = useSelector((state: RootState) => state.chat.conversations);
  const loginData = useSelector((state: RootState) => state.login?.data);
  const currentUserId =
    (loginData?.user as { _id?: string; id?: string } | undefined)?._id ??
    (loginData?.user as { _id?: string; id?: string } | undefined)?.id ??
    '';

  const conversationId = getTeamConversationId(conversations);
  const messages = useSelector((state: RootState) =>
    conversationId ? state.chat.messages[conversationId] ?? [] : []
  );
  const typingUsers = useSelector((state: RootState) =>
    conversationId ? state.chat.typingUsers[conversationId] ?? [] : []
  );
  const conversation = useSelector((state: RootState) =>
    conversationId ? state.chat.conversations.find((c) => c.id === conversationId) ?? null : null
  );

  const loading = !conversations.length && !!currentUserId;

  // Ensure team conversation exists: fetch conversations, then create "Team Chat" group if missing
  useEffect(() => {
    if (!currentUserId) return;
    dispatch(fetchConversations());
  }, [currentUserId, dispatch]);

  useEffect(() => {
    if (!currentUserId || conversations.length === 0) return;
    const teamId = getTeamConversationId(conversations);
    if (teamId) return;
    if (createAttemptedRef.current) return;
    createAttemptedRef.current = true;
    dispatch(
      createConversation({
        type: 'GROUP',
        name: 'Team Chat',
        participantIds: [currentUserId],
      })
    ).then((result) => {
      if (createConversation.fulfilled.match(result) && result.payload) {
        dispatch(addConversation(result.payload));
      }
      createAttemptedRef.current = false;
    });
  }, [currentUserId, conversations, dispatch]);

  // Load messages and join socket room when we have a conversation
  useEffect(() => {
    if (!conversationId) return;
    dispatch(fetchMessages({ conversationId }));
    dispatch(setUnreadCount({ conversationId, count: 0 }));
  }, [conversationId, dispatch]);

  useChatMessagesRestFallback(conversationId);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Socket: join room, new_message, message_sent, typing, mark_read
  useEffect(() => {
    if (!socket || !conversationId) return;

    const joinRoom = () => socket.emit('join_conversation', { conversationId });
    joinRoom();
    const onConnect = () => {
      joinRoom();
      dispatch(fetchMessages({ conversationId }));
    };
    socket.on('connect', onConnect);

    const handleNewMessage = (data: { message: Message }) => {
      const msg = data.message;
      const isCurrent = msg.conversationId === conversationId;
      const fromUs =
        String(msg.senderId ?? (msg.sender as MessageSender)?._id ?? (msg.sender as MessageSender)?.id) ===
        String(currentUserId);

      if (isCurrent && fromUs && lastSentTempIdRef.current) {
        const serverId = msg.id ?? msg._id;
        if (serverId) {
          dispatch(
            updateMessageDelivered({
              conversationId: msg.conversationId,
              messageId: String(serverId),
              tempId: lastSentTempIdRef.current,
              deliveredAt: msg.createdAt ?? new Date().toISOString(),
            })
          );
          dispatch(addMessage(msg));
          lastSentTempIdRef.current = null;
        } else {
          dispatch(addMessage(msg));
        }
      } else {
        dispatch(addMessage(msg));
      }
      if (isCurrent) {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    };

    const handleMessageSent = (data: { message: Message }) => {
      if (data.message?.conversationId !== conversationId) return;
      const serverId = data.message.id ?? data.message._id;
      if (serverId && lastSentTempIdRef.current) {
        dispatch(
          updateMessageDelivered({
            conversationId,
            messageId: String(serverId),
            tempId: lastSentTempIdRef.current,
            deliveredAt: data.message.createdAt ?? new Date().toISOString(),
          })
        );
        dispatch(addMessage(data.message));
        lastSentTempIdRef.current = null;
      }
    };

    const handleMessagesRead = (data: {
      conversationId: string;
      reads: Array<{ messageId: string; userId: string; readAt: string }>;
    }) => {
      if (data.conversationId !== conversationId) return;
      dispatch(updateMessageReads({ conversationId: data.conversationId, reads: data.reads }));
    };

    const handleTyping = (data: { userId: string; userName: string; conversationId: string }) => {
      if (data.conversationId === conversationId && data.userId !== currentUserId) {
        dispatch(setTyping({ conversationId, userId: data.userId, userName: data.userName }));
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          dispatch(removeTyping({ conversationId, userId: data.userId }));
        }, 3000);
      }
    };

    const handleStopTyping = (data: { userId: string; conversationId: string }) => {
      if (data.conversationId === conversationId) {
        dispatch(removeTyping({ conversationId, userId: data.userId }));
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message_sent', handleMessageSent);
    socket.on('messages_read', handleMessagesRead);
    socket.on('user_typing', handleTyping);
    socket.on('user_stopped_typing', handleStopTyping);

    return () => {
      socket.off('connect', onConnect);
      socket.off('new_message', handleNewMessage);
      socket.off('message_sent', handleMessageSent);
      socket.off('messages_read', handleMessagesRead);
      socket.off('user_typing', handleTyping);
      socket.off('user_stopped_typing', handleStopTyping);
      socket.emit('leave_conversation', { conversationId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [socket, conversationId, currentUserId, dispatch]);

  // Mark as read when viewing
  useEffect(() => {
    if (!socket || !conversationId || messages.length === 0) return;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const messageIds = messages
      .slice(-50)
      .map((m) => m.id ?? m._id)
      .filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id));
    if (messageIds.length > 0) {
      socket.emit('mark_read', { conversationId, messageIds });
    }
  }, [socket, conversationId, messages]);

  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content?.trim() || '';
      if (!socket || !conversationId || !trimmed) return;

      socket.emit('typing_stop', { conversationId });

      const tempId = `temp-${Date.now()}`;
      lastSentTempIdRef.current = tempId;
      const nowIso = new Date().toISOString();
      const currentUser = conversation?.participants?.find((p) => p.userId === currentUserId)?.user;

      const optimistic: Message = {
        id: tempId,
        conversationId,
        senderId: currentUserId,
        content: trimmed,
        createdAt: nowIso,
        sender: currentUser
          ? {
              id: currentUser.id,
              _id: currentUser._id,
              firstName: currentUser.firstName,
              lastName: currentUser.lastName,
              email: currentUser.email,
              profilePicture: currentUser.profilePicture ?? undefined,
            }
          : undefined,
      };
      dispatch(addMessage(optimistic));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

      socket.emit('send_message', {
        conversationId,
        content: trimmed,
        messageType: 'TEXT',
      });
    },
    [socket, conversationId, currentUserId, conversation, dispatch]
  );

  const emitTypingStart = useCallback(() => {
    socket?.emit('typing_start', { conversationId });
  }, [socket, conversationId]);

  const emitTypingStop = useCallback(() => {
    socket?.emit('typing_stop', { conversationId });
  }, [socket, conversationId]);

  return {
    conversationId,
    currentUserId,
    conversation,
    messages,
    typingUsers,
    loading,
    sendMessage,
    messagesEndRef,
    emitTypingStart,
    emitTypingStop,
    isConnected: !!socket?.connected,
  };
}
