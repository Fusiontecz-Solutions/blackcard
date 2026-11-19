// @ts-nocheck
import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import { ConversationType } from '@prisma/client';

type AuthRequest = Request & { user?: { id: string } };

function mapParticipant(p: { id: string; userId: string; user: { id: string; firstName: string; lastName: string; email: string; profilePicture?: string | null } }) {
  return {
    id: p.id,
    userId: p.userId,
    user: {
      id: p.user.id,
      firstName: p.user.firstName,
      lastName: p.user.lastName,
      email: p.user.email,
      profilePicture: p.user.profilePicture ?? undefined,
    },
  };
}

function mapMessage(m: {
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
      ? {
          id: m.sender.id,
          firstName: m.sender.firstName,
          lastName: m.sender.lastName,
          email: m.sender.email,
        }
      : undefined,
    attachments: m.attachments?.map((a) => ({
      id: a.id,
      url: a.url,
      fileName: a.fileName,
      fileType: a.fileType,
    })),
    messageReads: m.messageReads?.map((r) => ({ userId: r.userId, readAt: r.readAt.toISOString() })),
  };
}

function mapConversation(
  c: {
    id: string;
    type: ConversationType;
    name: string | null;
    applicationId: string | null;
    createdAt: Date;
    participants: { id: string; userId: string; user: { id: string; firstName: string; lastName: string; email: string; profilePicture?: string | null } }[];
  },
  unreadCount?: number
) {
  return {
    id: c.id,
    type: c.type,
    name: c.name ?? undefined,
    applicationId: c.applicationId ?? undefined,
    createdAt: c.createdAt.toISOString(),
    participants: c.participants.map(mapParticipant),
    unreadCount: unreadCount ?? 0,
  };
}

const chatController = {
  async createConversation(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { type, participantIds, name, applicationId } = req.body as {
        type: 'DIRECT' | 'GROUP' | 'APPLICATION';
        participantIds?: string[];
        name?: string;
        applicationId?: string;
      };

      const participantIdSet = new Set(participantIds ?? []);
      if (type === 'DIRECT' && participantIdSet.size !== 1) {
        return res.status(400).json({ success: false, message: 'DIRECT conversation must have exactly one other participant' });
      }
      if (!participantIdSet.has(userId)) {
        participantIdSet.add(userId);
      }

      const conversation = await prisma.conversation.create({
        data: {
          type,
          name: name ?? null,
          applicationId: applicationId ?? null,
          createdById: userId,
          participants: {
            create: Array.from(participantIdSet).map((uid) => ({ userId: uid })),
          },
        },
        include: {
          participants: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, profilePicture: true } } } },
        },
      });

      return res.status(201).json({ success: true, data: mapConversation(conversation) });
    } catch (error) {
      console.error('Create conversation error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  async getConversations(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const list = await prisma.conversation.findMany({
        where: {
          isDeleted: false,
          participants: { some: { userId } },
        },
        include: {
          participants: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, profilePicture: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const convIds = list.map((c) => c.id);
      const unreadCounts =
        convIds.length > 0
          ? await prisma.message.groupBy({
              by: ['conversationId'],
              where: {
                conversationId: { in: convIds },
                isDeleted: false,
                senderId: { not: userId },
                messageReads: { none: { userId } },
              },
              _count: { id: true },
            })
          : [];
      const countByConv: Record<string, number> = {};
      for (const row of unreadCounts) {
        countByConv[row.conversationId] = row._count.id;
      }

      const data = list.map((c) => mapConversation(c, countByConv[c.id] ?? 0));
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Get conversations error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  async getConversationById(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { conversationId } = req.params;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          isDeleted: false,
          participants: { some: { userId } },
        },
        include: {
          participants: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, profilePicture: true } } } },
        },
      });
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }
      return res.status(200).json({ success: true, data: mapConversation(conversation) });
    } catch (error) {
      console.error('Get conversation error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  async updateConversation(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { conversationId } = req.params;
      const { name } = req.body as { name?: string };
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const existing = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          isDeleted: false,
          participants: { some: { userId } },
        },
      });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: { name: name ?? undefined },
        include: {
          participants: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, profilePicture: true } } } },
        },
      });
      return res.status(200).json({ success: true, data: mapConversation(updated) });
    } catch (error) {
      console.error('Update conversation error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  async deleteConversation(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { conversationId } = req.params;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const existing = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          participants: { some: { userId } },
        },
      });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isDeleted: true },
      });
      return res.status(200).json({ success: true, message: 'Conversation deleted' });
    } catch (error) {
      console.error('Delete conversation error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  async getMessages(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { conversationId } = req.params;
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const conv = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          isDeleted: false,
          participants: { some: { userId } },
        },
      });
      if (!conv) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      const messages = await prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, email: true } },
          attachments: true,
          messageReads: { select: { userId: true, readAt: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      });

      return res.status(200).json({ success: true, data: messages.map(mapMessage) });
    } catch (error) {
      console.error('Get messages error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  async searchMessages(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const query = String(req.query.query || '').trim();
      const conversationId = req.query.conversationId as string | undefined;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!query) {
        return res.status(200).json({ success: true, data: [] });
      }

      const baseWhere = {
        content: { contains: query, mode: 'insensitive' as const },
        isDeleted: false,
      };
      const where = conversationId
        ? { ...baseWhere, conversationId, conversation: { participants: { some: { userId } } } }
        : { ...baseWhere, conversation: { participants: { some: { userId } } } };

      const messages = await prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, email: true } },
          attachments: true,
          messageReads: { select: { userId: true, readAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return res.status(200).json({ success: true, data: messages.map(mapMessage) });
    } catch (error) {
      console.error('Search messages error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  async exportMessages(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { conversationId } = req.params;
      const format = (req.query.format as string) || 'json';
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const conv = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          isDeleted: false,
          participants: { some: { userId } },
        },
      });
      if (!conv) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      const messages = await prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, email: true } },
          attachments: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      const data = messages.map(mapMessage);
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="messages-${conversationId}.csv"`);
        const header = 'id,conversationId,senderId,content,messageType,createdAt\n';
        const rows = data.map((m) => `"${m.id}","${m.conversationId}","${m.senderId}","${(m as any).content?.replace(/"/g, '""')}","${(m as any).messageType}","${(m as any).createdAt}"`).join('\n');
        return res.status(200).send(header + rows);
      }
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Export messages error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  async addParticipants(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { conversationId } = req.params;
      const { participantIds } = req.body as { participantIds: string[] };
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ success: false, message: 'participantIds array required' });
      }

      const conv = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          isDeleted: false,
          participants: { some: { userId } },
        },
      });
      if (!conv) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      await prisma.conversationParticipant.createMany({
        data: participantIds.map((uid) => ({ conversationId, userId: uid })),
        skipDuplicates: true,
      });

      const updated = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, profilePicture: true } } } },
        },
      });
      return res.status(200).json({ success: true, data: updated ? mapConversation(updated) : {} });
    } catch (error) {
      console.error('Add participants error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  async removeParticipant(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { conversationId, userId: targetUserId } = req.params;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const conv = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          isDeleted: false,
          participants: { some: { userId } },
        },
      });
      if (!conv) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      await prisma.conversationParticipant.deleteMany({
        where: { conversationId, userId: targetUserId },
      });
      return res.status(200).json({ success: true, message: 'Participant removed' });
    } catch (error) {
      console.error('Remove participant error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },
};

export default chatController;
