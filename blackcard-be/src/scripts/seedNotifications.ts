/**
 * Seeds demo notifications for the first SUPER_ADMIN so the rebuilt notifications
 * panel has data across categories / buckets / importance to exercise.
 *
 * Run: npx ts-node src/scripts/seedNotifications.ts
 */
import '../config/loadEnv';
import prisma from '../config/prismaClient';
import { deriveCategory } from '../services/notificationCategory';

async function main() {
    const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    if (!admin) throw new Error('No SUPER_ADMIN user found. Bootstrap one first.');

    // Dev seed: reset this user's notifications so re-runs don't pile up duplicates.
    const removed = await prisma.notification.deleteMany({ where: { recipientId: admin.id } });
    if (removed.count) console.log(`Cleared ${removed.count} existing notifications for ${admin.email}.`);

    const apps = await prisma.application.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: { client: true },
    });

    const samples: Array<{
        title: string;
        message: string;
        type: string;
        importance?: string;
        bucket?: string;
        snoozeHours?: number;
    }> = [
        { title: 'New application submitted', message: 'A new MCA application was created and needs intake review.', type: 'application_update', importance: 'high' },
        { title: 'Document request required', message: '3 months of bank statements requested for underwriting.', type: 'document_request', importance: 'urgent' },
        { title: 'Requested document received', message: 'Voided check uploaded by the merchant.', type: 'document_received', importance: 'normal', bucket: 'todo' },
        { title: 'Contract sent for signature', message: 'BoldSign envelope sent to the merchant for signing.', type: 'contract_signing_status', importance: 'high', bucket: 'follow_up' },
        { title: 'Deal funded', message: 'Disbursement completed — funds wired to the merchant.', type: 'application_update', importance: 'normal' },
        { title: 'Commission request submitted', message: 'ISO submitted a commission payout request for review.', type: 'commission_request', importance: 'low' },
        { title: 'ACH payment returned', message: 'A scheduled ACH debit was returned (R01 - insufficient funds). Follow up on the missed payment.', type: 'ach_authorization', importance: 'urgent', bucket: 'todo' },
        { title: 'Payment received', message: "Today's ACH repayment cleared for the merchant.", type: 'payment', importance: 'low' },
        { title: 'Compliance flag raised', message: 'Possible duplicate SSN detected — compliance review needed.', type: 'compliance', importance: 'urgent', bucket: 'todo' },
        { title: 'Snoozed: follow up with ISO', message: 'Reminder to chase the ISO on missing stips.', type: 'application_update', importance: 'normal', bucket: 'snoozed', snoozeHours: 24 },
    ];

    let created = 0;
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const app = apps[i % Math.max(apps.length, 1)];
        const category = deriveCategory(s.type, app ? { currentQueue: app.currentQueue } : null);

        await prisma.notification.create({
            data: {
                title: s.title,
                message: s.message,
                type: s.type,
                category,
                importance: s.importance ?? 'normal',
                bucket: s.bucket ?? 'inbox',
                snoozedUntil: s.snoozeHours ? new Date(Date.now() + s.snoozeHours * 3600 * 1000) : null,
                recipientId: admin.id,
                applicationId: app?.id ?? null,
                createdById: admin.id,
            },
        });
        created++;
    }

    const total = await prisma.notification.count({ where: { recipientId: admin.id } });
    console.log(`✅ Seeded ${created} notifications for ${admin.email}. Total now: ${total}`);
}

main()
    .catch((e) => {
        console.error('❌ Notification seed failed:', e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
