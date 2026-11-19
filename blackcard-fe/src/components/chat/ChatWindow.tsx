import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { ChatInput, type ChatAttachment } from './ChatInput';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '@/redux/store';
import type { AppDispatch } from '@/redux/store';
import { useSocket } from '@/context/SocketContext';
import { fetchMessages } from '@/redux/actions/chatActions';
import { useChatMessagesRestFallback } from '@/hooks/useChatMessagesRestFallback';
import {
  addMessage,
  setTyping,
  removeTyping,
  updateMessageDelivered,
  updateMessageReads,
  setUnreadCount,
} from '@/redux/slices/chatSlice';
import type { Message, MessageSender } from '@/redux/slices/chatSlice';

/** Only server message IDs (UUIDs) – temp IDs like "temp-123" must not be sent to mark_read */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChatWindowProps {
  conversationId: string;
  currentUserId: string;
  onClose: () => void;
  onSendMessage: (content: string) => void;
  /** When false, header (title + close) is hidden - used inside ChatPanel */
  showHeader?: boolean;
}

export const ChatWindow = ({ conversationId, currentUserId, onClose, onSendMessage, showHeader = true }: ChatWindowProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const { socket } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentTempIdRef = useRef<string | null>(null);

  const messages = useSelector((state: RootState) => 
    state.chat.messages[conversationId] || []
  );
  const typingUsers = useSelector((state: RootState) => 
    state.chat.typingUsers[conversationId] || []
  );
  const conversation = useSelector((state: RootState) =>
    state.chat.conversations.find((c) => c.id === conversationId)
  );

  // Load messages when this conversation is selected (REST fallback and initial load)
  useEffect(() => {
    if (conversationId) {
      dispatch(fetchMessages({ conversationId }));
      dispatch(setUnreadCount({ conversationId, count: 0 }));
    }
  }, [conversationId, dispatch]);

  useChatMessagesRestFallback(conversationId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Socket.IO event listeners + join room (re-join on connect so we get messages after reconnect)
  useEffect(() => {
    if (!socket) return;

    const joinRoom = () => {
      socket.emit('join_conversation', { conversationId });
    };

    const onConnect = () => {
      joinRoom();
      // Refetch latest messages after reconnect so we don't miss any
      dispatch(fetchMessages({ conversationId }));
    };

    joinRoom();
    socket.on('connect', onConnect);

    // Listen for new messages – always add to state (so receiver sees it); scroll/delivered only for current conversation
    const handleNewMessage = (data: { message: Message }) => {
      const msg = data.message;
      const isCurrentConversation = msg.conversationId === conversationId;
      const fromUs = (msg.senderId ?? (msg.sender as MessageSender)?._id ?? (msg.sender as MessageSender)?.id) === currentUserId;

      // If this is our own message and we have a temp message, update it instead of adding duplicate
      if (isCurrentConversation && fromUs && lastSentTempIdRef.current) {
        const serverId = msg.id ?? msg._id;
        if (serverId) {
          // Update temp message to server message (preserves senderId and prevents duplicate)
          dispatch(
            updateMessageDelivered({
              conversationId: msg.conversationId,
              messageId: String(serverId),
              tempId: lastSentTempIdRef.current,
              deliveredAt: msg.createdAt ?? new Date().toISOString(),
            })
          );
          // Also update the message with full server data, but addMessage will handle deduplication
          dispatch(addMessage(msg));
          lastSentTempIdRef.current = null;
        } else {
          // No server ID yet, just add the message (addMessage handles deduplication)
          dispatch(addMessage(msg));
        }
      } else {
        // Not our message or different conversation - add it (addMessage handles deduplication)
        dispatch(addMessage(msg));
      }
      
      if (isCurrentConversation) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    };

    // Server confirms our message was saved (optional; some backends send this instead of echoing new_message)
    // NOTE: This is a backup - new_message should already handle the update, but this ensures we don't miss it
    const handleMessageSent = (data: { message: Message }) => {
      if (data.message?.conversationId !== conversationId) return;
      const serverId = data.message.id ?? data.message._id;
      if (serverId && lastSentTempIdRef.current) {
        // Update temp message to server message
        dispatch(
          updateMessageDelivered({
            conversationId,
            messageId: String(serverId),
            tempId: lastSentTempIdRef.current,
            deliveredAt: data.message.createdAt ?? new Date().toISOString(),
          })
        );
        // addMessage will handle deduplication if new_message already added it
        dispatch(addMessage(data.message));
        lastSentTempIdRef.current = null;
      }
    };

    // Real-time read receipts (✓✓) when receiver marks messages as read
    const handleMessagesRead = (data: {
      conversationId: string;
      reads: Array<{ messageId: string; userId: string; readAt: string }>;
    }) => {
      if (data.conversationId !== conversationId) return;
      dispatch(updateMessageReads({ conversationId: data.conversationId, reads: data.reads }));
    };

    // Listen for typing indicators
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

  // Mark messages as read when user is viewing this conversation (real-time read receipts for others)
  // Only send server message IDs (valid UUIDs); temp IDs (e.g. temp-123) would cause backend Prisma errors
  useEffect(() => {
    if (!socket || !conversationId || messages.length === 0) return;
    const messageIds = messages
      .slice(-50)
      .map((m) => m.id ?? m._id)
      .filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id));
    if (messageIds.length > 0) {
      socket.emit('mark_read', { conversationId, messageIds });
    }
  }, [socket, conversationId, messages]);

  const handleSend = (content: string, attachments?: ChatAttachment[]) => {
    const hasContent = (content && content.trim()) || (attachments && attachments.length > 0);
    if (!socket || !hasContent) return;

    // Emit typing stop
    socket.emit('typing_stop', { conversationId });

    const messageType = attachments?.length
      ? attachments.some((a) => a.fileType.startsWith('image/'))
        ? 'IMAGE'
        : 'FILE'
      : 'TEXT';

    const trimmedContent = content?.trim() || '';
    const tempId = `temp-${Date.now()}`;
    lastSentTempIdRef.current = tempId;
    const nowIso = new Date().toISOString();

    // Optimistic message so sender sees it immediately
    const currentUser = conversation?.participants?.find((p) => p.userId === currentUserId)?.user;
    const optimisticMessage: Message = {
      id: tempId,
      conversationId,
      senderId: currentUserId,
      content: trimmedContent,
      messageType,
      isEdited: false,
      isDeleted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      sender: currentUser
        ? {
            id: currentUser.id,
            firstName: currentUser.firstName,
            lastName: currentUser.lastName,
            email: currentUser.email,
            profilePicture: currentUser.profilePicture ?? undefined,
          }
        : undefined,
      attachments: attachments?.map((a, i) => ({
        id: `temp-att-${i}`,
        url: a.url,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: a.fileSize,
      })),
    };
    dispatch(addMessage(optimisticMessage));
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    socket.emit('send_message', {
      conversationId,
      content: trimmedContent,
      messageType,
      attachments: attachments?.map((a) => ({
        url: a.url,
        publicId: a.publicId,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: a.fileSize,
      })),
    });

    onSendMessage(trimmedContent);
  };

  const participants = (conversation?.participants || [])
    .filter((p) => p.userId !== currentUserId && p?.user?.id)
    .map((p) => ({
      id: p.user!.id ?? p.userId,
      firstName: p.user!.firstName,
      lastName: p.user!.lastName,
    }));

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#1a1a1e] overflow-hidden">
      {showHeader && (
        <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-gray-700/80 bg-[#1e1e24]">
          <h3 className="font-semibold text-sm text-gray-100 truncate">
            {conversation?.type === 'DIRECT'
              ? conversation.participants?.find((p) => p.userId !== currentUserId)?.user
                  ? `${conversation.participants.find((p) => p.userId !== currentUserId)!.user!.firstName} ${conversation.participants.find((p) => p.userId !== currentUserId)!.user!.lastName}`
                  : 'Chat'
              : conversation?.name || 'Chat'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-700 transition-colors shrink-0"
            aria-label="Close chat"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>
      )}

      {/* Messages Body - dark theme, rounded scroll area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <>
            {messages.map((message: Message) => {
              const senderId = message.senderId ?? (message.sender as MessageSender)?._id ?? (message.sender as MessageSender)?.id;
              const senderParticipant = conversation?.participants?.find((p) => p.userId === senderId);
              const senderRole = senderParticipant?.user?.role;
              // CRITICAL: Robust check to determine if message is from current user
              // Check all possible fields where senderId might be stored
              // This ensures alignment stays correct even after refresh/socket updates
              const isOwnMessage = 
                String(message.senderId) === String(currentUserId) || 
                String(senderId) === String(currentUserId) ||
                String((message.sender as MessageSender)?.id) === String(currentUserId) ||
                String((message.sender as MessageSender)?._id) === String(currentUserId);
              return (
                <MessageBubble
                  key={message.id ?? message._id ?? `msg-${message.createdAt}`}
                  message={message}
                  isOwnMessage={isOwnMessage}
                  currentUserId={currentUserId}
                  isGroupChat={conversation?.type === 'GROUP'}
                  senderRole={senderRole}
                />
              );
            })}
            {typingUsers.length > 0 && (
              <div className="flex justify-start mb-3 gap-2">
                <div className="w-9 h-9 rounded-full bg-gray-600 shrink-0" />
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-gray-700">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Footer - dark bar */}
      <ChatInput
        onSendMessage={handleSend}
        disabled={!socket}
        participants={participants}
        onTypingStart={() => socket?.emit('typing_start', { conversationId })}
        onTypingStop={() => socket?.emit('typing_stop', { conversationId })}
      />
    </div>
  );
};
