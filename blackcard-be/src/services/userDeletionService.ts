import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';

async function detachLinkedSyndicator(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const synd = await tx.syndicator.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!synd) return;
  const { detachSyndicatorGraph } = await import('./syndicatorDeletionService');
  await detachSyndicatorGraph(tx, synd.id);
}

async function deleteUserAuthTokens(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.accessToken.deleteMany({ where: { userId } });
  await tx.verificationToken.deleteMany({ where: { userId } });
}

async function resolveFallbackUserId(
  tx: Prisma.TransactionClient,
  userId: string,
  actingUserId?: string,
): Promise<string> {
  if (actingUserId && actingUserId !== userId) {
    const acting = await tx.user.findUnique({ where: { id: actingUserId }, select: { id: true } });
    if (acting) return acting.id;
  }

  const admin = await tx.user.findFirst({
    where: {
      id: { not: userId },
      role: { in: ['SUPER_ADMIN', 'ADMIN'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!admin) {
    const err = new Error('Cannot delete user: no other admin is available to reassign linked records') as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }

  return admin.id;
}

/** Clears or reassigns all FK references that would block deleting a CRM user. */
async function detachUserReferences(
  tx: Prisma.TransactionClient,
  userId: string,
  fallbackUserId: string,
): Promise<void> {
  await tx.client.updateMany({ where: { assignedToId: userId }, data: { assignedToId: null } });
  await tx.client.updateMany({ where: { createdById: userId }, data: { createdById: null } });

  await tx.application.updateMany({ where: { claimedByUnderwriterId: userId }, data: { claimedByUnderwriterId: null } });
  await tx.application.updateMany({ where: { approvedByUnderwriterId: userId }, data: { approvedByUnderwriterId: null } });
  await tx.application.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.application.updateMany({ where: { referringAgentId: userId }, data: { referringAgentId: null } });
  await tx.application.updateMany({
    where: { salesRepresentativeId: userId },
    data: { salesRepresentativeId: fallbackUserId },
  });

  await tx.comment.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.notification.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.notification.deleteMany({ where: { recipientId: userId } });

  await tx.position.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.termsOffer.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.offerDecision.updateMany({ where: { userId }, data: { userId: null } });
  await tx.contractTemplate.updateMany({ where: { uploadedById: userId }, data: { uploadedById: null } });
  await tx.applicationActivityLog.updateMany({ where: { userId }, data: { userId: null } });
  await tx.collectionPayment.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.paymentTemplate.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.schedulePaymentTracking.updateMany({ where: { confirmedById: userId }, data: { confirmedById: null } });
  await tx.outbound_communications.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.collectionPaymentUploadJob.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.paymentMailLog.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.channelMessage.updateMany({ where: { receiverId: userId }, data: { receiverId: null } });

  await tx.bankDetail.updateMany({ where: { createdById: userId }, data: { createdById: fallbackUserId } });
  await tx.complianceCheck.updateMany({ where: { createdById: userId }, data: { createdById: fallbackUserId } });
  await tx.month.updateMany({ where: { createdById: userId }, data: { createdById: fallbackUserId } });
  await tx.note.updateMany({ where: { createdById: userId }, data: { createdById: fallbackUserId } });
  await tx.contract.updateMany({ where: { createdById: userId }, data: { createdById: fallbackUserId } });
  await tx.conversation.updateMany({ where: { createdById: userId }, data: { createdById: fallbackUserId } });
  await tx.applicationQuestionResponse.updateMany({
    where: { updatedById: userId },
    data: { updatedById: fallbackUserId },
  });
  await tx.message.updateMany({ where: { senderId: userId }, data: { senderId: fallbackUserId } });
  await tx.channelMessage.updateMany({ where: { senderId: userId }, data: { senderId: fallbackUserId } });
  await tx.fundingCall.updateMany({ where: { createdById: userId }, data: { createdById: fallbackUserId } });
}

/** Deletes a CRM user inside an existing transaction. */
export async function deleteUserInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  actingUserId?: string,
): Promise<void> {
  const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) {
    const err = new Error('User not found') as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const fallbackUserId = await resolveFallbackUserId(tx, userId, actingUserId);

  await detachLinkedSyndicator(tx, userId);

  await detachUserReferences(tx, userId, fallbackUserId);
  await deleteUserAuthTokens(tx, userId);
  await tx.user.delete({ where: { id: userId } });
}

/** Deletes a CRM user and all blocking references (reassigns audit rows to another admin). */
export async function deleteUserCompletely(userId: string, actingUserId?: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await deleteUserInTransaction(tx, userId, actingUserId);
    },
    {
      // This transaction runs ~40 sequential updateMany/delete queries to detach
      // every FK referencing the user, which can exceed Prisma's default 5s limit.
      maxWait: 10000,
      timeout: 30000,
    },
  );
}
