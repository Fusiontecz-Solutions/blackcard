import type { Request, Response } from 'express';
import {
    createOrGetDM,
    createChannel,
    getMessages,
    getUserChannels,
    getUserDMs,
    reactToMessage,
    sendMessage,
} from './chat.service';

type AuthenticatedRequest = Request & {
    user?: {
        id: string;
        name: string;
        email: string;
        role: string;
    };
};

export const fetchChannels = async (
    req: AuthenticatedRequest,
    res: Response,
): Promise<Response> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const channels = await getUserChannels(userId);
        console.log("channels", channels);
        return res.status(200).json({ success: true, data: channels });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch channels',
        });
    }
};

export const createTeamChannel = async (
    req: AuthenticatedRequest,
    res: Response,
): Promise<Response> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const channel = await createChannel(req.body, userId);
        console.log("channel", channel);
        return res.status(201).json({ success: true, data: channel });
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            message: error?.message || 'Failed to create channel',
        });
    }
};

export const fetchChannelMessages = async (
    req: AuthenticatedRequest,
    res: Response,
): Promise<Response> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const channelId = String(req.params.channelId || '');
        const limit = Number(req.query.limit) || 30;
        const skip = Number(req.query.skip) || 0;
        const messages = await getMessages(channelId, userId, { limit, skip });

        return res.status(200).json({ success: true, data: messages });
    } catch (error: any) {
        return res.status(403).json({
            success: false,
            message: error?.message || 'Failed to fetch messages',
        });
    }
};

export const fetchUserDMs = async (
    req: AuthenticatedRequest,
    res: Response,
): Promise<Response> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const dms = await getUserDMs(userId);
        return res.status(200).json({ success: true, data: dms });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch DMs',
        });
    }
};

export const createDirectMessageChannel = async (
    req: AuthenticatedRequest,
    res: Response,
): Promise<Response> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const otherUserId = String(req.body?.otherUserId || '').trim();
        if (!otherUserId) {
            return res.status(400).json({
                success: false,
                message: 'otherUserId is required',
            });
        }

        const dm = await createOrGetDM(userId, otherUserId);
        return res.status(200).json({ success: true, data: dm });
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            message: error?.message || 'Failed to create/get DM',
        });
    }
};

export const createMessage = async (
    req: AuthenticatedRequest,
    res: Response,
): Promise<Response> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const payload = {
            channelId: req.body?.channelId ? String(req.body.channelId) : undefined,
            senderId: userId,
            receiverId: req.body?.receiverId ? String(req.body.receiverId) : undefined,
            message: String(req.body?.message || ''),
            messageType:
                String(req.body?.messageType || '').toLowerCase() === 'dm'
                    ? 'dm'
                    : 'channel',
            type:
                String(req.body?.type || '').toLowerCase() === 'file'
                    ? 'file'
                    : String(req.body?.type || '').toLowerCase() === 'system'
                        ? 'system'
                        : 'text',
        } as const;

        const created = await sendMessage(payload);
        return res.status(201).json({ success: true, data: created });
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            message: error?.message || 'Failed to send message',
        });
    }
};

export const toggleReaction = async (
    req: AuthenticatedRequest,
    res: Response,
): Promise<Response> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const messageId = String(req.params.messageId || req.body?.messageId || '').trim();
        const emoji = String(req.body?.emoji || '').trim();

        if (!messageId || !emoji) {
            return res.status(400).json({
                success: false,
                message: 'messageId and emoji are required',
            });
        }

        const result = await reactToMessage(messageId, userId, emoji);
        return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            message: error?.message || 'Failed to react to message',
        });
    }
};

export default {
    fetchChannels,
    createTeamChannel,
    fetchChannelMessages,
    fetchUserDMs,
    createDirectMessageChannel,
    // createMessage,
    toggleReaction,
};