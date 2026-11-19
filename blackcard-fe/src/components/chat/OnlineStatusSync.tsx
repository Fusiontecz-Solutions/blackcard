import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useSocket } from '@/context/SocketContext';
import { setOnlineUsers, addOnlineUser, removeOnlineUser } from '@/redux/slices/chatSlice';
import type { AppDispatch } from '@/redux/store';

/**
 * Listens for socket online/offline events and updates Redux chat.onlineUsers
 * so ChatPanel can show "Online" / last seen correctly.
 */
export function OnlineStatusSync() {
  const { socket } = useSocket();
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (!socket) return;

    const handleOnlineUsers = (data: { userIds: string[] }) => {
      dispatch(setOnlineUsers(data.userIds ?? []));
    };
    const handleUserOnline = (data: { userId: string }) => {
      if (data.userId) dispatch(addOnlineUser(data.userId));
    };
    const handleUserOffline = (data: { userId: string }) => {
      if (data.userId) dispatch(removeOnlineUser(data.userId));
    };

    socket.on('online_users', handleOnlineUsers);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);

    return () => {
      socket.off('online_users', handleOnlineUsers);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
    };
  }, [socket, dispatch]);

  return null;
}
