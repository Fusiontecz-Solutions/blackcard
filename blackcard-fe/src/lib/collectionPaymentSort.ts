import type { CollectionPayment } from '@/types/collectionPaymentTypes';

/** Best-effort “transaction date” for ordering (newest first). */
function collectionPaymentRowTimeMs(row: CollectionPayment): number {
  const tx = row as CollectionPayment & { date?: string | null };
  const candidates = [row.scheduledDate, tx.date, row.processedDate, row.createdAt].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  let best = 0;
  for (const c of candidates) {
    const t = new Date(c).getTime();
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best;
}

/** In-place: latest transaction first (collections / payments table). */
export function sortCollectionPaymentRowsNewestFirst(rows: CollectionPayment[]): void {
  rows.sort((a, b) => {
    const tb = collectionPaymentRowTimeMs(b);
    const ta = collectionPaymentRowTimeMs(a);
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });
}
