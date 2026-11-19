import { CollectionPaymentStatus, Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import { buildApplicationStatsBucketWhere } from '../services/applicationStatsBucketWhere';

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const r = await fn();
  console.log(`[time] ${label}: ${Date.now() - t0}ms`);
  return r;
}

async function main() {
  const fundedWhere = buildApplicationStatsBucketWhere('funded')!;
  const apps = await prisma.application.findMany({ where: fundedWhere, select: { id: true } });
  const appIds = apps.map((a) => a.id);
  console.log('funded apps:', appIds.length);

  await time('A. payments full (8 cols incl notes+dates)', () =>
    prisma.collectionPayment.findMany({
      where: { applicationId: { in: appIds } },
      select: {
        applicationId: true, dealId: true, Date: true, scheduledDate: true,
        processedDate: true, status: true, amount: true, notes: true,
      },
    }),
  );

  await time('B. payments minimal (appId, dealId, status, amount, notes)', () =>
    prisma.collectionPayment.findMany({
      where: { applicationId: { in: appIds } },
      select: { applicationId: true, dealId: true, status: true, amount: true, notes: true },
    }),
  );

  await time('C. payments no-notes (appId, dealId, status, amount)', () =>
    prisma.collectionPayment.findMany({
      where: { applicationId: { in: appIds } },
      select: { applicationId: true, dealId: true, status: true, amount: true },
    }),
  );

  await time('D. DB-side groupBy(applicationId,status) sum amount', () =>
    prisma.collectionPayment.groupBy({
      by: ['applicationId', 'status'],
      where: { applicationId: { in: appIds } },
      _sum: { amount: true },
    }),
  );

  // how many rows actually carry a dealId or notes deal-token (affects whether notes filter matters)
  const withDealId = await prisma.collectionPayment.count({
    where: { applicationId: { in: appIds }, dealId: { not: null } },
  });
  console.log('   rows with non-null dealId:', withDealId);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
