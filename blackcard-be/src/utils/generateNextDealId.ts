import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import { allocateNextDealId } from '../services/nextDealIdService';

export { DEAL_ID_PREFIX } from '../services/nextDealIdService';

/**
 * Returns the next sequential `Application.dealId` (`{prefix}{n}`).
 * Prefix comes from the funder profile Deal ID prefix, then DEAL_ID_PREFIX env, then BCF.
 */
export async function generateNextDealId(tx?: Prisma.TransactionClient): Promise<string> {
    if (tx) return allocateNextDealId(tx);
    return prisma.$transaction((innerTx) => allocateNextDealId(innerTx));
}
