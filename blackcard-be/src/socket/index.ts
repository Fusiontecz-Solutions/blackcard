// @ts-nocheck
import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../config/prismaClient';

/**
 * Module-scoped Socket.IO server instance.
 *
 * Exposed via {@link getSocketIO} so non-socket modules (queues, services,
 * controllers) can push real-time events without coupling to the HTTP server
 * lifecycle. Returns null until {@link initializeSocketIO} is called from the
 * server bootstrap, which lets callers no-op safely instead of throwing.
 */
let ioInstance: Server | null = null;

/** Returns the live Socket.IO server, or null when sockets are not initialized. */
export function getSocketIO(): Server | null {
  return ioInstance;
}

/**
 * Emit a payload to every socket connected as `userId`. Safe to call before
 * sockets are initialized (no-op) and never throws. Single hop for low-latency
 * fan-out from background workers.
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!ioInstance || !userId) return;
  try {
    ioInstance.to(`user:${userId}`).emit(event, payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[socket] emitToUser failed:', { userId, event, err });
  }
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type TeamChatAck = (payload: { success: boolean; error?: string; channelId?: string }) => void;

function normalizeTeamMessageType(type?: string): 'text' | 'file' | 'system' {
  const t = String(type || '').toLowerCase();
  if (t === 'file' || t === 'system') return t;
  return 'text';
}

async function getOrCreateTeamDmChannel(userId: string, receiverId: string) {
  const dmId = [userId, receiverId].sort().join('_');
  let channel = await prisma.channel.findUnique({ where: { dmId } });
  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        name: 'DM',
        type: 'dm',
        dmId,
        members: {
          create: [{ userId }, { userId: receiverId }],
        },
      },
    });
  }
  return channel;
}

function mapTeamChannelMessage(m: any) {
  return {
    id: m.id,
    channelId: m.channelId,
    senderId: m.senderId,
    receiverId: m.receiverId,
    message: m.message,
    messageType: m.messageType,
    type: m.type,
    attachments: m.attachments || [],
    replyTo: m.replyToId || null,
    createdAt: m.createdAt,
  };
}

function getCorsOrigin(): string[] | true {
  // In development, allow any origin to avoid "xhr poll error" (localhost vs 127.0.0.1, different ports, etc.)
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  const origins = FRONTEND_URL.split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) return true;
  return [...new Set(origins)];
}

function mapMessageToApi(m: {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  sender?: { id: string; firstName: string; lastName: string; email: string };
  attachments?: { id: string; url: string; fileName: string; fileType: string }[];
  messageReads?: { userId: string; readAt: Date }[];
}) {
  return {
    id: m.id,
    _id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    messageType: m.messageType,
    isEdited: m.isEdited,
    isDeleted: m.isDeleted,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    sender: m.sender
      ? { id: m.sender.id, firstName: m.sender.firstName, lastName: m.sender.lastName, email: m.sender.email }
      : undefined,
    attachments: m.attachments?.map((a) => ({ id: a.id, url: a.url, fileName: a.fileName, fileType: a.fileType })),
    messageReads: m.messageReads?.map((r) => ({ userId: r.userId, readAt: r.readAt.toISOString() })),
  };
}

export function initializeSocketIO(httpServer: HttpServer): void {
  if (ioInstance) return;
  const io = new Server(httpServer, {
    cors: {
      origin: getCorsOrigin(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  ioInstance = io;

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string })?.token;
    if (!token) return next(new Error('Authentication required'));
    if (!JWT_SECRET) return next(new Error('Server misconfiguration'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email?: string };
      (socket.data as { userId: string }).userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  const connectedUsers = new Map<string, string>();

  io.on('connection', (socket) => {
    const userId = (socket.data as { userId: string }).userId;
    connectedUsers.set(socket.id, userId);
    socket.join(`user:${userId}`);
    const onlineUserIds = [...new Set(connectedUsers.values())];
    socket.emit('online_users', { userIds: onlineUserIds });
    io.emit('user:online', { userId });
    console.log(`✅ User connected: ${userId}`);

    socket.on('join_conversation', (data: { conversationId: string }) => {
      const { conversationId } = data || {};
      if (conversationId) {
        socket.join(`conversation:${conversationId}`);
        console.log(`User ${userId} joined conversation ${conversationId}`);
      }
    });

    socket.on('leave_conversation', (data: { conversationId: string }) => {
      const { conversationId } = data || {};
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
        console.log(`User ${userId} left conversation ${conversationId}`);
      }
    });

    // Team Chat compatibility events (channel/dm)
    socket.on('join_channel', async (channelId: string) => {
      try {
        const channel = await prisma.channel.findFirst({
          where: { id: String(channelId), members: { some: { userId } } },
          select: { id: true },
        });
        if (!channel) return;
        socket.join(`channel:${channel.id}`);
      } catch (err) {
        console.error('join_channel error:', err);
      }
    });

    socket.on('leave_channel', (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on(
      'send_channel_message',
      async (
        data: {
          channelId: string;
          message: string;
          type?: 'text' | 'file' | 'system';
          replyTo?: string | null;
          attachments?: Array<{ name?: string; type?: string; url?: string }>;
        },
        ack?: TeamChatAck
      ) => {
        try {
          if (!data?.channelId) throw new Error('channelId is required');
          if (!String(data.message || '').trim()) throw new Error('message is required');

          const channel = await prisma.channel.findFirst({
            where: { id: String(data.channelId), members: { some: { userId } } },
            include: { members: { select: { userId: true } } },
          });
          if (!channel) throw new Error('Access denied');

          const message = await prisma.channelMessage.create({
            data: {
              channelId: channel.id,
              senderId: userId,
              message: String(data.message),
              messageType: 'channel',
              type: normalizeTeamMessageType(data.type),
              replyToId: data.replyTo || null,
              attachments: data.attachments?.length
                ? {
                    create: data.attachments.map((a) => ({
                      name: a.name,
                      type: a.type,
                      url: a.url,
                    })),
                  }
                : undefined,
            },
            include: { attachments: true },
          });

          await prisma.channel.update({
            where: { id: channel.id },
            data: { lastMessageId: message.id, lastMessageAt: new Date() },
          });

          const payload = mapTeamChannelMessage(message);
          io.to(`channel:${channel.id}`).emit('channel_message_new', payload);
          for (const m of channel.members) {
            io.to(`user:${m.userId}`).emit('channel_message_new', payload);
          }
          ack?.({ success: true });
        } catch (err: any) {
          console.error('send_channel_message error:', err);
          ack?.({ success: false, error: err?.message || 'Failed to send message' });
        }
      }
    );

    socket.on(
      'send_dm',
      async (
        data: {
          receiverId: string;
          message: string;
          type?: 'text' | 'file' | 'system';
          attachments?: Array<{ name?: string; type?: string; url?: string }>;
        },
        ack?: TeamChatAck
      ) => {
        try {
          if (!data?.receiverId) throw new Error('receiverId is required');
          if (!String(data.message || '').trim()) throw new Error('message is required');

          const channel = await getOrCreateTeamDmChannel(userId, String(data.receiverId));
          socket.join(`channel:${channel.id}`);

          const message = await prisma.channelMessage.create({
            data: {
              channelId: channel.id,
              senderId: userId,
              receiverId: String(data.receiverId),
              message: String(data.message),
              messageType: 'dm',
              type: normalizeTeamMessageType(data.type),
              attachments: data.attachments?.length
                ? {
                    create: data.attachments.map((a) => ({
                      name: a.name,
                      type: a.type,
                      url: a.url,
                    })),
                  }
                : undefined,
            },
            include: { attachments: true },
          });

          await prisma.channel.update({
            where: { id: channel.id },
            data: { lastMessageId: message.id, lastMessageAt: new Date() },
          });

          const payload = mapTeamChannelMessage(message);
          io.to(`channel:${channel.id}`).emit('dm_new', payload);
          io.to(`user:${userId}`).emit('dm_new', payload);
          io.to(`user:${String(data.receiverId)}`).emit('dm_new', payload);
          ack?.({ success: true, channelId: channel.id });
        } catch (err: any) {
          console.error('send_dm error:', err);
          ack?.({ success: false, error: err?.message || 'Failed to send DM' });
        }
      }
    );

    socket.on(
      'send_message',
      async (data: {
        conversationId: string;
        content: string;
        messageType: string;
        attachments?: { url: string; publicId: string; fileName: string; fileType: string; fileSize?: number }[];
      }) => {
        const { conversationId, content, messageType, attachments } = data || {};
        if (!conversationId || content == null) return;

        try {
          const participant = await prisma.conversationParticipant.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
          });
          if (!participant) {
            socket.emit('error', { message: 'Not a participant in this conversation' });
            return;
          }

          const message = await prisma.message.create({
            data: {
              conversationId,
              senderId: userId,
              content: String(content),
              messageType: (messageType === 'IMAGE' || messageType === 'FILE' ? messageType : 'TEXT') as 'TEXT' | 'IMAGE' | 'FILE',
              attachments:
                attachments?.length ?
                  {
                    create: attachments.map((a) => ({
                      url: a.url,
                      publicId: a.publicId,
                      fileName: a.fileName,
                      fileType: a.fileType,
                      fileSize: typeof a.fileSize === 'number' ? a.fileSize : 0,
                    }))
                  }
                : undefined,
            },
            include: {
              sender: { select: { id: true, firstName: true, lastName: true, email: true } },
              attachments: true,
              messageReads: { select: { userId: true, readAt: true } },
            },
          });

          const payload = mapMessageToApi(message);
          // Emit to conversation room only - all participants in the room will receive it
          // This prevents duplicate messages (previously was emitting to both conversation AND user rooms)
          io.to(`conversation:${conversationId}`).emit('new_message', { message: payload });
          // Also emit to sender for confirmation (optional, but helps with optimistic updates)
          socket.emit('message_sent', { message: payload });
        } catch (err) {
          console.error('send_message error:', err);
          socket.emit('error', { message: 'Failed to send message' });
        }
      }
    );

    socket.on('typing_start', async (data: { conversationId: string }) => {
      const { conversationId } = data || {};
      if (!conversationId) return;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        });
        const userName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Someone';
        socket.to(`conversation:${conversationId}`).emit('user_typing', {
          userId,
          userName,
          conversationId,
        });
      } catch (_) {
        socket.to(`conversation:${conversationId}`).emit('user_typing', {
          userId,
          userName: 'Someone',
          conversationId,
        });
      }
    });

    socket.on('typing_stop', (data: { conversationId: string }) => {
      const { conversationId } = data || {};
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', { userId, conversationId });
      }
    });

    socket.on(
      'mark_read',
      async (data: { conversationId: string; messageIds?: string[] }) => {
        const { conversationId, messageIds } = data || {};
        if (!conversationId || !Array.isArray(messageIds) || messageIds.length === 0) return;

        const validIds = messageIds.filter((id) => typeof id === 'string' && UUID_REGEX.test(id));
        if (validIds.length === 0) return;

        try {
          const participant = await prisma.conversationParticipant.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
          });
          if (!participant) return;

          const reads: { messageId: string; userId: string; readAt: string }[] = [];
          for (const messageId of validIds) {
            try {
              await prisma.messageRead.upsert({
                where: { messageId_userId: { messageId, userId } },
                create: { messageId, userId },
                update: {},
              });
              reads.push({ messageId, userId, readAt: new Date().toISOString() });
            } catch (_) {
              // Message might not exist or already read
            }
          }
          if (reads.length > 0) {
            io.to(`conversation:${conversationId}`).emit('messages_read', { conversationId, reads });
          }
        } catch (err) {
          console.error('mark_read error:', err);
        }
      }
    );

    socket.on('disconnect', () => {
      connectedUsers.delete(socket.id);
      io.emit('user:offline', { userId });
      prisma.user
        .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
        .catch((err) => console.error('Update lastSeenAt error:', err.message));
      console.log(`❌ User disconnected: ${userId}`);
    });
  });
}
