import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from './prismaClient';
import dotenv from 'dotenv';

type Ack = (payload: { success: boolean; error?: string; channelId?: string }) => void;

type SocketUser = {
    id?: string;
    userid?: string | number;
};

type AuthedSocket = Socket & {
    userId?: string;
};

type ChannelMessagePayload = {
    channelId: string;
    message: string;
    type?: 'text' | 'file' | 'system';
    replyTo?: string | null;
    attachments?: Array<{ name?: string; type?: string; url?: string }>;
};

type SendDmPayload = {
    receiverId: string;
    message: string;
    type?: 'text' | 'file' | 'system';
    attachments?: Array<{ name?: string; type?: string; url?: string }>;
};

let io: Server | null = null;

function normalizeType(type?: string): 'text' | 'file' | 'system' {
    const t = String(type || '').toLowerCase();
    if (t === 'file' || t === 'system') return t;
    return 'text';
}

async function getOrCreateDMChannel(userId: string, receiverId: string) {
    const dmId = [userId, receiverId].sort().join('_');

    let channel = await prisma.channel.findUnique({
        where: { dmId },
    });

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

function mapMessage(m: any) {
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

export function initSocket(server: HttpServer): Server {
    io = new Server(server, {
        path: '/testbe/socket.io',
        cors: {
            origin: [
                'http://localhost:5173',
            ],
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    io.engine.on("connection_error", (err) => {
        console.log("ENGINE ERROR:", err);
    });

    io.use(async (socket: AuthedSocket, next) => {
        const token = socket.handshake.auth?.token as string | undefined;
        console.log("token", token)

        if (!token) {
            return next(new Error('No token provided'));
        }

        

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || '') as SocketUser;
            // Support both token formats:
            // - decoded.id (UUID string, preferred)
            // - decoded.userid (legacy numeric userId)

            console.log("JWT_SECRET exists:", !!process.env.JWT_SECRET);

            console.log("ddddddddddddddddddddd", decoded)

            let resolvedUserId = decoded.id;

            if (!resolvedUserId && decoded.userid != null) {
                const numericUserId = Number(decoded.userid);
                if (!Number.isNaN(numericUserId)) {
                    const user = await prisma.user.findUnique({
                        where: { userId: numericUserId },
                        select: { id: true },
                    });
                    resolvedUserId = user?.id;
                }
            }

            socket.userId = resolvedUserId;
            if (!resolvedUserId) {
                return next(new Error('Invalid token payload'));
            }
            return next();
        } catch {
            return next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket: AuthedSocket) => {
        const userId = socket.userId;
        const ioServer = io;
        if (!userId || !ioServer) return;

        socket.join(`user:${userId}`);

        socket.on('join_channel', async (channelId: string) => {
            try {
                const channel = await prisma.channel.findFirst({
                    where: {
                        id: channelId,
                        members: { some: { userId } },
                    },
                    select: { id: true },
                });
                if (!channel) return;
                socket.join(`channel:${channelId}`);
            } catch (err) {
                console.error('join_channel error:', err);
            }
        });

        socket.on('leave_channel', (channelId: string) => {
            socket.leave(`channel:${channelId}`);
        });

        socket.on(
            'send_channel_message',
            async (data: ChannelMessagePayload, ack?: Ack) => {
                try {
                    console.log('Incoming message:', data);
                    console.log('User:', userId);
                    if (!data?.channelId) {
                        throw new Error('channelId is required');
                    }
                    if (!String(data.message || '').trim()) {
                        throw new Error('message is required');
                    }

                    const channel = await prisma.channel.findFirst({
                        where: {
                            id: String(data.channelId),
                            members: { some: { userId } },
                        },
                        select: { id: true },
                    });
                    if (!channel) throw new Error('Access denied');

                    const message = await prisma.channelMessage.create({
                        data: {
                            channel: {
                                connect: { id: channel.id },
                            },
                            sender: {
                                connect: { id: userId },
                            },
                            message: String(data.message),
                            messageType: 'channel',
                            type: normalizeType(data.type),
                            replyTo: data.replyTo
                                ? {
                                    connect: { id: data.replyTo },
                                }
                                : undefined,
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

                    console.log("message", message);

                    await prisma.channel.update({
                        where: { id: channel.id },
                        data: {
                            lastMessageAt: new Date(),
                        },
                    });

                    ioServer
                        .to(`channel:${channel.id}`)
                        .emit('channel_message_new', mapMessage(message));
                    ack?.({ success: true });
                } catch (err: any) {
                    console.error('send_channel_message error:', err);
                    ack?.({ success: false, error: err?.message || 'Failed to send message' });
                }
            },
        );

        socket.on('send_dm', async (data: SendDmPayload, ack?: Ack) => {
            try {
                if (!data.receiverId) throw new Error('ReceiverId is required');

                const channel = await getOrCreateDMChannel(userId, data.receiverId);
                socket.join(`channel:${channel.id}`);

                const message = await prisma.channelMessage.create({
                    data: {
                        channel: {
                            connect: { id: channel.id },
                        },
                        sender: {
                            connect: { id: userId },
                        },
                        receiver: {
                            connect: { id: data.receiverId },
                        },
                        message: data.message,
                        messageType: 'dm',
                        type: normalizeType(data.type),
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
                    data: {
                        lastMessageAt: new Date(),
                    },
                });

                const payload = mapMessage(message);
                ioServer.to(`channel:${channel.id}`).emit('dm_new', payload);
                ioServer.to(`user:${userId}`).emit('dm_new', payload);
                ioServer.to(`user:${data.receiverId}`).emit('dm_new', payload);

                ack?.({ success: true, channelId: channel.id });
            } catch (err: any) {
                console.error('send_dm error:', err?.message || err);
                ack?.({ success: false, error: err?.message || 'Failed to send DM' });
            }
        });

        socket.on('call-user', ({ toUserId, offer }: { toUserId: string; offer: unknown }) => {
            io?.to(`user:${toUserId}`).emit('incoming-call', { fromUserId: userId, offer });
        });

        socket.on(
            'answer-call',
            ({ toUserId, answer }: { toUserId: string; answer: unknown }) => {
                io?.to(`user:${toUserId}`).emit('call-answered', { answer });
            },
        );

        socket.on(
            'ice-candidate',
            ({ toUserId, candidate }: { toUserId: string; candidate: unknown }) => {
                io?.to(`user:${toUserId}`).emit('ice-candidate', { candidate });
            },
        );

        socket.on('end-call', ({ toUserId }: { toUserId: string }) => {
            io?.to(`user:${toUserId}`).emit('call-ended');
        });
    });

    return io;
}

export default { initSocket };