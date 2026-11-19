import prisma from '../config/prismaClient';

interface GetMessagesOptions {
    limit?: number;
    skip?: number;
}

type CreateChannelInput = {
    name?: string;
    type?: 'channel' | 'dm';
    isPrivate?: boolean;
    members?: string[];
};

type SendMessageInput = {
    channelId?: string;
    senderId: string;
    receiverId?: string;
    message: string;
    messageType: 'channel' | 'dm';
    type?: 'text' | 'file' | 'system';
};

export const getUserChannels = async (userId: string) => {
    return prisma.channel.findMany({
        where: {
            type: 'channel',
            members: {
                some: { userId },
            },
        },
        include: {
            members: {
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            role: true,
                        },
                    },
                },
            },
            lastMessage: {
                include: {
                    sender: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
            },
        },
        orderBy: { lastMessageAt: 'desc' },
    });
};

export const getUserDMs = async (userId: string) => {
    return prisma.channel.findMany({
        where: {
            type: 'dm',
            members: {
                some: { userId },
            },
        },
        include: {
            members: {
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            role: true,
                        },
                    },
                },
            },
            lastMessage: {
                include: {
                    sender: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
            },
        },
        orderBy: { lastMessageAt: 'desc' },
    });
};

export const createChannel = async (
    data: CreateChannelInput,
    creatorId: string,
) => {
    if (!creatorId) {
        throw new Error('Creator ID missing');
    }

    const memberIds = [...new Set([...(data.members || []), creatorId])];
    if (!memberIds.length) {
        throw new Error('At least one member is required');
    }

    return prisma.channel.create({
        data: {
            name: data.name || 'Untitled Channel',
            type: data.type || 'channel',
            isPrivate: data.isPrivate ?? false,
            members: {
                create: memberIds.map((id) => ({
                    user: { connect: { id } },
                })),
            },
        },
        
        include: {
            members: {
              include: {
                user: true, // 🔥 VERY IMPORTANT
              },
            },
          },
    });
};

export const createOrGetDM = async (user1Id: string, user2Id: string) => {
    if (user1Id === user2Id) {
        throw new Error('Cannot create DM with yourself');
    }

    const dmId = [user1Id, user2Id].sort().join('_');

    const existing = await prisma.channel.findUnique({
        where: { dmId },
        include: { members: true },
    });

    if (existing) {
        return existing;
    }

    return prisma.channel.create({
        data: {
            name: 'Direct Message',
            type: 'dm',
            dmId,
            members: {
                create: [{ userId: user1Id }, { userId: user2Id }],
            },
        },
        include: { members: true },
    });
};

export const sendMessage = async (data: SendMessageInput) => {
    if (!data.senderId) {
        throw new Error('senderId is required');
    }
    if (!data.messageType) {
        throw new Error('messageType is required');
    }
    if (!data.message?.trim()) {
        throw new Error('message is required');
    }
    if (data.messageType === 'channel' && !data.channelId) {
        throw new Error('channelId is required for channel messages');
    }
    if (data.messageType === 'dm' && !data.channelId && !data.receiverId) {
        throw new Error('For DM messages, provide channelId or receiverId');
    }

    const newMessage = await prisma.channelMessage.create({
        data: {
            channelId: data.channelId,
            senderId: data.senderId,
            receiverId: data.receiverId,
            message: data.message,
            messageType: data.messageType,
            type: data.type || 'text',
        },
    });

    if (data.channelId) {
        await prisma.channel.update({
            where: { id: data.channelId },
            data: {
                lastMessageId: newMessage.id,
                lastMessageAt: new Date(),
            },
        });
    }

    return newMessage;
};

export const getMessages = async (
    channelId: string,
    userId: string,
    { limit = 30, skip = 0 }: GetMessagesOptions = {},
) => {
    const channel = await prisma.channel.findFirst({
        where: {
            id: channelId,
            members: {
                some: { userId },
            },
        },
    });

    if (!channel) {
        throw new Error('Access denied or channel not found');
    }

    return prisma.channelMessage.findMany({
        where: { channelId },
        include: {
            sender: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    profilePicture: true,
                },
            },
            attachments: true,
            reactions: {
                include: {
                    users: true,
                },
            },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
    });
};

export const reactToMessage = async (
    messageId: string,
    userId: string,
    emoji: string,
) => {
    const existingReaction = await prisma.messageReaction.findFirst({
        where: { messageId, emoji },
        include: { users: true },
    });

    if (!existingReaction) {
        return prisma.messageReaction.create({
            data: {
                messageId,
                emoji,
                users: {
                    create: {
                        user: { connect: { id: userId } },
                    },
                },
            },
            include: { users: true },
        });
    }

    const alreadyReacted = existingReaction.users.some((u) => u.userId === userId);

    if (alreadyReacted) {
        await prisma.messageReactionUser.delete({
            where: {
                reactionId_userId: {
                    reactionId: existingReaction.id,
                    userId,
                },
            },
        });

        return { removed: true };
    }

    return prisma.messageReactionUser.create({
        data: {
            reactionId: existingReaction.id,
            userId,
        },
    });
};