/**
 * List payment templates in the database.
 * Manage templates via Payments → Templates in the app (or POST /api/v1/payment-templates).
 *
 * Usage: npx ts-node src/scripts/seedPayoffWireTemplate.ts
 */
import prisma from '../config/prismaClient';

void (async () => {
  try {
    await prisma.$connect();
    const rows = await prisma.paymentTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, category: true, updatedAt: true },
    });
    console.log(`PaymentTemplate rows: ${rows.length}`);
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
