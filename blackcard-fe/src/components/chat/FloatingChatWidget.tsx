import { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import { ChatButton } from './ChatButton';
import { ChatPanel } from './ChatPanel';
import { useSocket } from '@/context/SocketContext';
import { fetchConversations } from '@/redux/actions/chatActions';
import { createConversation } from '@/redux/actions/chatActions';
import { addConversation, addMessage, incrementUnreadCount } from '@/redux/slices/chatSlice';
import type { RootState } from '@/redux/store';
import type { AppDispatch } from '@/redux/store';
import type { User } from '@/types/userTypes';
import type { Conversation, Message } from '@/redux/slices/chatSlice';

interface FloatingChatWidgetProps {
  currentUserId: string;
}

export const FloatingChatWidget = ({ currentUserId }: FloatingChatWidgetProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const { socket } = useSocket();
  const conversations = useSelector((state: RootState) => state.chat.conversations);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUserId) {
      dispatch(fetchConversations());
    }
  }, [isOpen, currentUserId, dispatch]);

  // When receiver gets a new message: add to state and increment unread if not viewing that conversation (or panel closed)
  useEffect(() => {
    if (!socket || !currentUserId) return;
    const handleNewMessage = (data: { message: Message }) => {
      const msg = data.message;
      dispatch(addMessage(msg));
      const senderId = msg.senderId;
      const isReceiver = senderId !== currentUserId;
      if (!isReceiver) return;
      const notViewing = !isOpen || conversationId !== msg.conversationId;
      if (notViewing) {
        dispatch(incrementUnreadCount(msg.conversationId));
      }
    };
    socket.on('new_message', handleNewMessage);
    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, currentUserId, conversationId, isOpen, dispatch]);

  const onSelectUser = useCallback(
    (user: User | null) => {
      setSelectedConversation(null);
      setSelectedUser(user);
      if (!user) {
        setConversationId(null);
        return;
      }
      const userId = user._id || (user as any).id;
      const existing = (conversations || []).find(
        (c) =>
          c.type === 'DIRECT' &&
          c.participants?.some((p) => p.userId === userId) &&
          c.participants?.some((p) => p.userId === currentUserId)
      );
      if (existing) {
        setConversationId(existing.id);
        return;
      }
      dispatch(
        createConversation({
          type: 'DIRECT',
          participantIds: [userId],
        })
      ).then((result) => {
        if (createConversation.fulfilled.match(result)) {
          const conv = result.payload;
          dispatch(addConversation(conv));
          setConversationId(conv.id);
        }
      });
    },
    [conversations, currentUserId, dispatch]
  );

  const onSelectConversation = useCallback((conv: Conversation | null) => {
    setSelectedUser(null);
    setSelectedConversation(conv);
    setConversationId(conv ? conv.id : null);
  }, []);

  const onGroupCreated = useCallback(
    (conv: Conversation) => {
      dispatch(addConversation(conv));
      setSelectedConversation(conv);
      setSelectedUser(null);
      setConversationId(conv.id);
    },
    [dispatch]
  );

  const onClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const onSendMessage = useCallback(() => {}, []);

  return (
    <>
      <ChatButton onClick={() => setIsOpen((prev) => !prev)} />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed bottom-24 right-6 z-40 w-[380px] h-[560px] max-h-[calc(100vh-8rem)] flex flex-col rounded-2xl shadow-2xl border border-gray-700/60 bg-[#1a1a1e] overflow-hidden"
            style={{ originX: 1, originY: 1 }}
          >
            <ChatPanel
              currentUserId={currentUserId}
              selectedUser={selectedUser}
              selectedConversation={selectedConversation}
              conversationId={conversationId}
              onClose={onClose}
              onSelectUser={onSelectUser}
              onSelectConversation={onSelectConversation}
              onGroupCreated={onGroupCreated}
              onSendMessage={onSendMessage}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
