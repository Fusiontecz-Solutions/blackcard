import type { Prisma } from '@prisma/client';

/**
 * Human-readable deal reference for syndicator wallet descriptions.
 * Prefer `Application.dealId`; otherwise the numeric CRM `applicationId`.
 */
export async function dealLabelForWalletDescription(
  tx: Prisma.TransactionClient,
  applicationUuid: string,
): Promise<string> {
  const id = String(applicationUuid ?? '').trim();
  if (!id) return '';
  const app = await tx.application.findUnique({
    where: { id },
    select: { applicationId: true, dealId: true },
  });
  if (!app) return id;
  const external = typeof app.dealId === 'string' ? app.dealId.trim() : '';
  return external !== '' ? external : String(app.applicationId);
}
