import type { Prisma, PrismaClient } from '@prisma/client';

type DbLike = PrismaClient | Prisma.TransactionClient;

type PaymentIdentity = {
    applicationId: string;
    amount: Prisma.Decimal | Prisma.DecimalJsLike | number | string;
    status?: string | null;
    Date?: Date | string | null;
    scheduledDate?: Date | string | null;
    notes?: string | null;
};

function dateKey(value: Date | string | null | undefined): string {
    if (value == null) return '';
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Same application + date + amount + status + description = same transaction. */
function paymentIdentityKey(p: PaymentIdentity): string {
    const amount = Number(p.amount);
    return [
        p.applicationId,
        dateKey(p.Date ?? p.scheduledDate),
        Number.isFinite(amount) ? amount.toFixed(2) : String(p.amount),
        String(p.status ?? '').toUpperCase(),
        String(p.notes ?? '').trim().toLowerCase(),
    ].join('|');
}

/**
 * Split incoming transaction rows into ones that are new and ones already stored, so re-uploading
 * the same file never inserts (or re-allocates to syndicators) the same transaction twice.
 *
 * Matching is by multiplicity: if a file legitimately has two identical rows and the database
 * already holds one of them, exactly one more is inserted.
 */
export async function partitionAlreadyImportedPayments<T extends PaymentIdentity>(
    db: DbLike,
    rows: T[],
): Promise<{ freshIndices: number[]; duplicateIndices: number[] }> {
    const freshIndices: number[] = [];
    const duplicateIndices: number[] = [];
    if (!rows.length) return { freshIndices, duplicateIndices };

    const applicationIds = [...new Set(rows.map((r) => r.applicationId).filter(Boolean))];
    const existing = await db.collectionPayment.findMany({
        where: { applicationId: { in: applicationIds } },
        select: {
            applicationId: true,
            amount: true,
            status: true,
            Date: true,
            scheduledDate: true,
            notes: true,
        },
    });
    const remainingExisting = new Map<string, number>();
    for (const row of existing) {
        const key = paymentIdentityKey(row);
        remainingExisting.set(key, (remainingExisting.get(key) ?? 0) + 1);
    }

    rows.forEach((row, index) => {
        const key = paymentIdentityKey(row);
        const left = remainingExisting.get(key) ?? 0;
        if (left > 0) {
            remainingExisting.set(key, left - 1);
            duplicateIndices.push(index);
        } else {
            freshIndices.push(index);
        }
    });
    return { freshIndices, duplicateIndices };
}
