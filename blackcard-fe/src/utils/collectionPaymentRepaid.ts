/**
 * Sum of repaid: sum of CREDIT amounts only, excluding credits that are
 * linked by DEBIT description date + same amount.
 */
import { extractDescriptionDateKeys } from "./extractDescriptionDateKeys";

export type CollectionPaymentFinancials = {
  dealId: string;
  sumOfRepaid: number;
  balance: number;
};

function normalizeCollectionStatus(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function toAmount(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** YYYY-MM-DD from API date string or ISO timestamp; uses UTC date for parsed ISO. */
function calendarDateKey(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim();
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1] ?? null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const pad = (x: number) => (x < 10 ? `0${x}` : String(x));
  return `${y}-${pad(m)}-${pad(day)}`;
}

function rowCalendarDate(row: Record<string, unknown>): string | null {
  const scheduled = row.scheduledDate ?? row.date;
  const processed = row.processedDate;
  return calendarDateKey(scheduled) ?? calendarDateKey(processed);
}

/**
 * @param rows — collection payment API rows (`status`, `amount`, `scheduledDate` / `date` / `processedDate`)
 * @param applicationDealId — `Application.dealId` when set
 * @param applicationId — UUID fallback for grouping when dealId is empty
 */
export function sumOfRepaidFromCollectionPayments(
  rows: unknown[],
  applicationDealId: string,
  applicationId: string,
): number {
  return calculateFinancialsFromCollectionPayments(
    rows,
    0,
    applicationDealId,
    applicationId,
  ).sumOfRepaid;
}

/**
 * Financial calculations:
 * - sumOfRepaid = sum(CREDIT amounts) except when a DEBIT description links to that CREDIT date and amount
 * - balance = payback - sumOfRepaid
 */
export function calculateFinancialsFromCollectionPayments(
  rows: unknown[],
  payback: number,
  applicationDealId: string,
  applicationId: string,
): CollectionPaymentFinancials {
  const dealKey =
    String(applicationDealId ?? "").trim() ||
    String(applicationId ?? "").trim() ||
    "_unknown";

  type NormalizedRow = {
    status: string;
    amount: number;
    dateKey: string | null;
    descriptionDateKeys: string[];
  };
  const normalizedRows: NormalizedRow[] = [];

  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const status = normalizeCollectionStatus(row.status);
    const amount = Math.abs(toAmount(row.amount));
    const dateKey = rowCalendarDate(row);
    const descriptionDateKeys = extractDescriptionDateKeys(
      row.notes ?? row.note ?? row.description,
      dateKey,
      "utc",
    );
    normalizedRows.push({ status, amount, dateKey, descriptionDateKeys });
  }

  const creditRows: Array<{ key: string; amount: number }> = [];
  const creditCountByKey = new Map<string, number>();

  normalizedRows.forEach((row) => {
    if (!row.dateKey || row.amount <= 0) return;
    const key = `${dealKey}_${row.dateKey}_${row.amount}`;
    if (row.status === "credit") {
      creditRows.push({ key, amount: row.amount });
      creditCountByKey.set(key, (creditCountByKey.get(key) ?? 0) + 1);
    }
  });

  const consumedCreditCountByKey = new Map<string, number>();
  normalizedRows.forEach((row) => {
    if (row.status !== "debit" || row.amount <= 0) return;
    const descOrTxKeys =
      row.descriptionDateKeys.length > 0
        ? row.descriptionDateKeys
        : row.dateKey
          ? [row.dateKey]
          : [];
    for (const dateKey of descOrTxKeys) {
      if (!dateKey) continue;
      const creditKey = `${dealKey}_${dateKey}_${row.amount}`;
      const creditCount = creditCountByKey.get(creditKey) ?? 0;
      const alreadyConsumed = consumedCreditCountByKey.get(creditKey) ?? 0;
      if (alreadyConsumed >= creditCount) continue;
      consumedCreditCountByKey.set(creditKey, alreadyConsumed + 1);
      break;
    }
  });

  let sum = 0;
  for (const creditRow of creditRows) {
    const consumedCount = consumedCreditCountByKey.get(creditRow.key) ?? 0;
    if (consumedCount > 0) {
      consumedCreditCountByKey.set(creditRow.key, consumedCount - 1);
      continue;
    }
    sum += creditRow.amount;
  }

  return {
    dealId: dealKey,
    sumOfRepaid: sum,
    balance: toAmount(payback) - sum,
  };
}
