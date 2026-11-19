import type { SchedulePaymentTrackingRow } from "@/redux/actions/applicationActions";
import type { CollectionPayment } from "@/types/collectionPaymentTypes";

import { filterCollectionPaymentsForApplicationDeal } from "./paymentDealIdUtils";
import type { PaymentRow, PaymentStatus } from "./paymentScheduleTypes";
import type {
  ScheduleRowWithTrackingStatus,
  ScheduleTrackingDisplayStatus,
  ScheduleTrackingSummary,
} from "./schedulePaymentTrackingStatus";

function rowStatusLc(p: Pick<PaymentRow, "status">): string {
  return String(p.status ?? "").trim().toLowerCase();
}

/** `YYYY-MM-DD` key — same as `PaymentScheduletab.tsx` / Transactions table. */
export function normalizeInstallmentDateKey(
  dateStr: string | undefined | null,
): string {
  const t = (dateStr ?? "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Two-decimal amount key — same as Transactions tab. */
export function normalizeInstallmentAmountKey(
  n: number | undefined | null,
): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

/** Same field order as `Transactions.tsx` `resolveTransactionDate`. */
function resolveCollectionTransactionDate(row: CollectionPayment): string {
  const txRow = row as CollectionPayment & {
    date?: unknown;
    paymentDate?: unknown;
    transactionDate?: unknown;
  };
  return (
    String(
      txRow.scheduledDate ??
        txRow.date ??
        txRow.paymentDate ??
        txRow.transactionDate ??
        txRow.processedDate ??
        txRow.createdAt ??
        "",
    ).trim() || ""
  );
}

/**
 * Pairs same-day same-amount debit/credit/paid into a single failed row.
 * Mirrors `pairDebitCreditAsFailed` in `PaymentScheduletab.tsx`.
 */
export function pairDebitCreditAsFailedForTracking(
  list: PaymentRow[],
): PaymentRow[] {
  if (list.length < 2) return list;

  const groups = new Map<string, PaymentRow[]>();
  for (const p of list) {
    const key = `${normalizeInstallmentDateKey(p.date)}|${normalizeInstallmentAmountKey(p.amount)}`;
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  const out: PaymentRow[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) {
      out.push(...group);
      continue;
    }
    const debits: PaymentRow[] = [];
    const credits: PaymentRow[] = [];
    const others: PaymentRow[] = [];
    for (const p of group) {
      const s = rowStatusLc(p);
      if (s === "debit") debits.push(p);
      else if (s === "credit" || s === "paid") credits.push(p);
      else others.push(p);
    }

    const pairCount = Math.min(debits.length, credits.length);
    for (let i = 0; i < pairCount; i++) {
      const debit = debits[i];
      out.push({
        ...debit,
        status: "failed" as PaymentStatus,
        note: debit.note ?? "",
      });
    }
    for (let i = pairCount; i < debits.length; i++) out.push(debits[i]);
    for (let i = pairCount; i < credits.length; i++) out.push(credits[i]);
    out.push(...others);
  }

  out.sort((a, b) => (a.payNum ?? 0) - (b.payNum ?? 0));
  return out;
}

export function mapCollectionPaymentsToTransactionRows(
  collectionPayments: CollectionPayment[],
  applicationDealId?: string,
): PaymentRow[] {
  const scoped = filterCollectionPaymentsForApplicationDeal(
    collectionPayments,
    applicationDealId,
  );

  return scoped.map((row, idx) => ({
    id: row.id,
    payNum: row.paymentNumber ?? idx + 1,
    date: resolveCollectionTransactionDate(row),
    amount: Number(row.amount ?? 0),
    status: row.status as PaymentStatus,
    refId:
      row.referenceNumber ??
      `COL-${String(row.applicationId).slice(0, 6).toUpperCase()}-${row.paymentNumber ?? idx + 1}`,
    note: String(row.notes ?? "").trim(),
    dealId: row.dealId ?? null,
  }));
}

/**
 * Strict match: schedule `scheduledDate` + `amount` vs Transactions tab rows
 * (after deal scope + `pairDebitCreditAsFailedForTracking`).
 * Paid/credit → clear; failed/debit → bounced; any failed on that day wins over paid.
 */
export function resolveTrackingStatusForInstallment(
  installmentDateKey: string,
  installmentAmountKey: string,
  pairedTransactions: PaymentRow[],
  usedTransactionIds: Set<string>,
): ScheduleTrackingDisplayStatus {
  const matches = pairedTransactions.filter((txn) => {
    const id = txn.id ?? "";
    if (id && usedTransactionIds.has(id)) return false;
    return (
      normalizeInstallmentDateKey(txn.date) === installmentDateKey &&
      normalizeInstallmentAmountKey(txn.amount) === installmentAmountKey
    );
  });

  if (matches.length === 0) return "upcoming";

  for (const txn of matches) {
    if (txn.id) usedTransactionIds.add(txn.id);
  }

  const statuses = matches.map((txn) => rowStatusLc(txn));
  if (statuses.some((s) => s === "failed" || s === "debit")) return "bounced";
  if (statuses.some((s) => s === "paid" || s === "credit")) return "clear";
  return "upcoming";
}

export function attachScheduleTrackingStatusFromCollections(
  scheduleRows: SchedulePaymentTrackingRow[],
  collectionPayments: CollectionPayment[],
  applicationDealId?: string,
): ScheduleRowWithTrackingStatus[] {
  const transactionRows = mapCollectionPaymentsToTransactionRows(
    collectionPayments,
    applicationDealId,
  );
  const pairedTransactions = pairDebitCreditAsFailedForTracking(transactionRows);
  const usedTransactionIds = new Set<string>();

  return scheduleRows.map((schedule) => {
    const dateKey = normalizeInstallmentDateKey(schedule.scheduledDate);
    const amountKey = normalizeInstallmentAmountKey(schedule.amount);
    const trackingStatus =
      !dateKey || !amountKey
        ? "upcoming"
        : resolveTrackingStatusForInstallment(
            dateKey,
            amountKey,
            pairedTransactions,
            usedTransactionIds,
          );

    return { ...schedule, trackingStatus };
  });
}

export function buildScheduleTrackingSummary(
  payments: Array<{ amount: number; trackingStatus: ScheduleTrackingDisplayStatus }>,
): ScheduleTrackingSummary {
  const summary: ScheduleTrackingSummary = {
    all: { count: 0, sum: 0 },
    upcoming: { count: 0, sum: 0 },
    clear: { count: 0, sum: 0 },
    bounced: { count: 0, sum: 0 },
  };

  for (const row of payments) {
    const amt = Number(row.amount);
    if (!Number.isFinite(amt)) continue;
    summary.all.count += 1;
    summary.all.sum += amt;
    summary[row.trackingStatus].count += 1;
    summary[row.trackingStatus].sum += amt;
  }

  return {
    all: { count: summary.all.count, sum: Number(summary.all.sum.toFixed(2)) },
    upcoming: {
      count: summary.upcoming.count,
      sum: Number(summary.upcoming.sum.toFixed(2)),
    },
    clear: { count: summary.clear.count, sum: Number(summary.clear.sum.toFixed(2)) },
    bounced: {
      count: summary.bounced.count,
      sum: Number(summary.bounced.sum.toFixed(2)),
    },
  };
}
