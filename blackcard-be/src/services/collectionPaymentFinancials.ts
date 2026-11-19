import { CollectionPaymentStatus, Prisma, type PrismaClient } from '@prisma/client';

import { extractDescriptionDateKeys } from '../utils/extractDescriptionDateKeys';

export type DealFinancialsResult = {
  dealId: string;
  sumOfRepaid: number;
  balance: number;
};

/** One row per CollectionPayment after resolving dealId and calendar date (date-only, no time). */
export type RepaidCalculationRow = {
  dealId: string;
  /** YYYY-MM-DD (UTC calendar components of the stored date). */
  dateKey: string;
  status: CollectionPaymentStatus;
  /** From `amount` column only. */
  amount: number;
  descriptionDateKeys: string[];
  /** ACH / bank memo — used when several rows share the same date + amount for strict pairing. */
  notes: string | null;
};

function toFiniteAmount(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const n = Number((value as { toString(): string }).toString());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calendar date key YYYY-MM-DD using UTC date parts (correct for `@db.Date` values at UTC midnight).
 */
export function calendarDateKeyUTC(d: Date): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const pad = (x: number) => (x < 10 ? `0${x}` : String(x));
  return `${y}-${pad(m)}-${pad(day)}`;
}

export function resolveTransactionDateKey(p: {
  Date?: Date | null;
  scheduledDate?: Date | null;
  processedDate?: Date | null;
}): string | null {
  const raw = p.Date ?? p.scheduledDate ?? p.processedDate ?? null;
  if (!raw) return null;
  return calendarDateKeyUTC(new Date(raw));
}

/**
 * Date key aligned with `mapPaymentToApi` / Transactions `resolveTransactionDate` (ISO `YYYY-MM-DD`).
 */
export function installmentMatchDateKey(raw: Date | string | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Calendar date shown in Collections → Transactions (`scheduledDate` first, same as the FE).
 * Column dates only — never parsed from `notes` — so weekly installments with the same amount
 * do not cross-match via memo text (e.g. "May 14" inside a description).
 */
export function resolveCollectionPaymentUiDateKey(p: {
  scheduledDate?: Date | null;
  Date?: Date | null;
  processedDate?: Date | null;
  createdAt?: Date;
}): string | null {
  const raw = p.scheduledDate ?? p.Date ?? p.processedDate ?? p.createdAt ?? null;
  return installmentMatchDateKey(raw);
}

/** Every populated date column on a collection row (for debit↔credit pairing only). */
export function collectionPaymentColumnDateKeys(p: {
  scheduledDate?: Date | null;
  Date?: Date | null;
  processedDate?: Date | null;
  returnDate?: Date | null;
  createdAt?: Date;
}): Set<string> {
  const keys = new Set<string>();
  for (const col of [p.scheduledDate, p.Date, p.processedDate, p.returnDate, p.createdAt]) {
    const k = installmentMatchDateKey(col);
    if (k) keys.add(k);
  }
  return keys;
}

function collectionDateKeysOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const k of a) {
    if (b.has(k)) return true;
  }
  return false;
}

/** Absolute amount rounded to cents — debits may be stored negative. */
export function collectionAmountMatchKey(amount: Prisma.Decimal | number): string {
  return Math.abs(toFiniteAmount(amount)).toFixed(2);
}

/** Distinct YYYY-MM-DD keys from every populated date column (pairs debit/credit when “same day” spans fields). */
export function allResolveTransactionDateKeys(p: {
  Date?: Date | null;
  scheduledDate?: Date | null;
  processedDate?: Date | null;
}): string[] {
  const out = new Set<string>();
  for (const raw of [p.Date, p.scheduledDate, p.processedDate]) {
    if (raw == null) continue;
    const k = calendarDateKeyUTC(new Date(raw));
    if (k) out.add(k);
  }
  return [...out];
}

export function normalizeDealIdTokenForPayments(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Deal codes from upload notes, e.g. `[UPLOAD_UNMAPPED_IDENTIFIER:BA1020]`. */
export function extractStructuredDealTokensFromNotes(notes: string | null | undefined): string[] {
  const s = String(notes ?? '');
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const reUnmapped = /\[UPLOAD_UNMAPPED_IDENTIFIER:\s*([A-Z0-9]+)\]/gi;
  while ((m = reUnmapped.exec(s)) !== null) {
    const t = normalizeDealIdTokenForPayments(m[1]);
    if (t) out.add(t);
  }
  const mDeal = s.match(/\[DEAL_ID:\s*([^\]]+)\]/i);
  if (mDeal?.[1]) {
    const t = normalizeDealIdTokenForPayments(mDeal[1]);
    if (t) out.add(t);
  }
  return [...out];
}

export function collectionPaymentRowDealTokens(row: {
  dealId?: string | null;
  notes?: string | null;
}): string[] {
  const tokens = new Set<string>();
  const fromCol = normalizeDealIdTokenForPayments(row.dealId);
  if (fromCol) tokens.add(fromCol);
  for (const t of extractStructuredDealTokensFromNotes(row.notes)) {
    tokens.add(t);
  }
  return [...tokens];
}

/**
 * When `Application.dealId` is set, exclude collection rows that identify a different deal (DB `dealId` or markers in `notes`).
 * Rows with no deal hints remain included (legacy rows for this application).
 */
export function paymentBelongsToApplicationDeal(
  row: { dealId?: string | null; notes?: string | null },
  applicationDealId: string | null | undefined,
): boolean {
  const appTok = normalizeDealIdTokenForPayments(applicationDealId);
  if (!appTok) return true;

  const rowToks = collectionPaymentRowDealTokens(row);
  if (rowToks.length === 0) return true;

  return rowToks.some((t) => t === appTok);
}

export function filterCollectionPaymentsForApplicationDeal<
  T extends { dealId?: string | null; notes?: string | null },
>(payments: T[], applicationDealId: string | null | undefined): T[] {
  return payments.filter((p) => paymentBelongsToApplicationDeal(p, applicationDealId));
}

/**
 * Deal Economics gross repaid (Collections `Transactions.tsx` `paidAmount`): CREDIT + PAID + MANUAL − DEBITS.
 * Stored per deal as `grossRepaidDealEconomics` (balances API); summed for payment dashboard “Recovered Amount”.
 */
export function grossRepaidDealEconomicsFromPayments<
  T extends { status: CollectionPaymentStatus; amount: Prisma.Decimal | number },
>(payments: T[]): number {
  let incoming = 0;
  let debits = 0;
  for (const p of payments) {
    const amtAbs = Math.abs(toFiniteAmount(p.amount));
    if (amtAbs <= 0) continue;
    switch (p.status) {
      case CollectionPaymentStatus.CREDIT:
      case CollectionPaymentStatus.PAID:
      case CollectionPaymentStatus.MANUAL:
        incoming += amtAbs;
        break;
      case CollectionPaymentStatus.DEBIT:
        debits += amtAbs;
        break;
      default:
        break;
    }
  }
  return Math.max(0, incoming - debits);
}

/** Already net = advance − fees + commission — same Deal economics row as Collections. */
export function alreadyNetDealEconomics(
  advanceNum: number,
  feesAmount: number,
  commissionOnDeal: number,
): number {
  const a = Number.isFinite(advanceNum) ? advanceNum : 0;
  const f = Number.isFinite(feesAmount) ? feesAmount : 0;
  const c = Number.isFinite(commissionOnDeal) ? commissionOnDeal : 0;
  return a - f + c;
}

/**
 * Portfolio “Above principal” contribution for one deal: repaidTowardPayback − alreadyNet, floored at zero.
 * Use {@link repaidTowardPaybackExcludingSurplus} on gross economics repaid so overpaid surplus does not inflate the gap.
 * Raw negative gaps (collections still below already net) contribute nothing to the summed stat card.
 */
export function abovePrincipalPositiveOnlyContribution(
  repaidTowardPayback: number,
  alreadyNet: number,
): number {
  const g = Number.isFinite(repaidTowardPayback) ? repaidTowardPayback : 0;
  const n = Number.isFinite(alreadyNet) ? alreadyNet : 0;
  return Math.max(0, g - n);
}

/**
 * Payback for balance math comes from `OfferDecision.totalRemit` (total remittance / payback in this schema).
 */
export function paybackFromOfferDecision(od: { totalRemit: Prisma.Decimal | null } | null | undefined): number {
  if (od == null || od.totalRemit == null) return 0;
  return toFiniteAmount(od.totalRemit);
}

/** Incoming ACH side for debit pairing: CREDIT plus positive PAID/MANUAL (matches API list filtering). */
export function isIncomingForDebitPairingStatus(
  status: CollectionPaymentStatus,
  signedAmount: number,
): boolean {
  return (
    status === CollectionPaymentStatus.CREDIT ||
    ((status === CollectionPaymentStatus.PAID || status === CollectionPaymentStatus.MANUAL) &&
      signedAmount > 0)
  );
}

const NOTES_PAIRING_NOISE = new Set([
  'ccd',
  'ach',
  'the',
  'and',
  'for',
  'pos',
  'dep',
  'wd',
  'dr',
  'cr',
  'rdfi',
]);

/** 0..1 overlap between ACH descriptions — picks the correct row when several share date + amount. */
function notesPairingSimilarity(
  debit: string | null | undefined,
  incoming: string | null | undefined,
): number {
  const a = String(debit ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const b = String(incoming ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 8 && longer.includes(shorter)) return 0.92;
  const tokenize = (s: string) =>
    s.split(/[^a-z0-9]+/i).filter((t) => t.length >= 2 && !NOTES_PAIRING_NOISE.has(t));
  const tokA = tokenize(a);
  const setB = new Set(tokenize(b));
  if (tokA.length === 0 && setB.size === 0) return 0.35;
  if (tokA.length === 0) return 0;
  let hits = 0;
  for (const t of tokA) if (setB.has(t)) hits += 1;
  const denom = Math.max(tokA.length, setB.size, 1);
  return hits / denom;
}

/**
 * When multiple incoming rows collide on date-key + amount, require description match.
 * Same for single-candidate ambiguous cases where notes are filled on both sides.
 */
function pickIncomingIndexStrict(
  candidateIndices: number[],
  debitNotes: string | null | undefined,
  incomingNoteByIdx: Map<number, string | null | undefined>,
  hiddenIncoming: Set<number>,
  consumedIncoming: Set<number>,
): number | null {
  const seen = new Set<number>();
  const available = candidateIndices.filter((i) => {
    if (seen.has(i)) return false;
    seen.add(i);
    return !hiddenIncoming.has(i) && !consumedIncoming.has(i);
  });
  if (available.length === 0) return null;
  if (available.length === 1) {
    const only = available[0]!;
    const inc = incomingNoteByIdx.get(only);
    const d = String(debitNotes ?? '').trim();
    const cn = String(inc ?? '').trim();
    if (d.length >= 12 && cn.length >= 12) {
      const sim = notesPairingSimilarity(d, cn);
      if (sim < 0.08) return null;
    }
    return only;
  }
  let bestIdx: number | null = null;
  let bestScore = -1;
  for (const idx of available) {
    const sc = notesPairingSimilarity(debitNotes, incomingNoteByIdx.get(idx));
    if (sc > bestScore || (sc === bestScore && (bestIdx == null || idx < bestIdx))) {
      bestScore = sc;
      bestIdx = idx;
    }
  }
  /** Several rows share bucket — only pair when memo clearly aligns. */
  const MULTI_CANDIDATE_MIN = 0.14;
  if (bestIdx == null || bestScore < MULTI_CANDIDATE_MIN) return null;
  return bestIdx;
}

/**
 * Pair DEBIT reversals to incoming (CREDIT / positive PAID|MANUAL) by deal + date + amount + memo rules.
 * Same logic as repaid/balance math and strict transaction filtering.
 */
export function computeDebitIncomingPairing(rows: RepaidCalculationRow[]): {
  consumedIncomingIndices: Set<number>;
  pairedDebitRowIndices: Set<number>;
} {
  const creditIndicesByKey = new Map<string, number[]>();

  rows.forEach((row, idx) => {
    const dealId = String(row.dealId ?? '').trim();
    if (!dealId) return;
    const signed = row.amount;
    const amtAbs = Math.abs(signed);
    if (amtAbs <= 0 || !isIncomingForDebitPairingStatus(row.status, signed)) return;
    const txKey = String(row.dateKey ?? '').trim();
    const keysForIncoming = new Set<string>();
    if (txKey) keysForIncoming.add(txKey);
    row.descriptionDateKeys.forEach((d) => keysForIncoming.add(d));
    if (keysForIncoming.size === 0) return;
    for (const dk of keysForIncoming) {
      const key = `${dealId}_${dk}_${amtAbs}`;
      const list = creditIndicesByKey.get(key) ?? [];
      list.push(idx);
      creditIndicesByKey.set(key, list);
    }
  });

  const consumedIncomingIndices = new Set<number>();
  const pairedDebitRowIndices = new Set<number>();
  const incomingNoteByIdx = new Map<number, string | null | undefined>(
    rows.map((r, i) => [i, r.notes]),
  );

  rows.forEach((row, rowIdx) => {
    if (row.status !== CollectionPaymentStatus.DEBIT) return;
    const dealId = String(row.dealId ?? '').trim();
    if (!dealId) return;
    const amtAbs = Math.abs(row.amount);
    if (amtAbs <= 0) return;
    const dateKey = String(row.dateKey ?? '').trim();
    const candidateKeys =
      row.descriptionDateKeys.length > 0
        ? row.descriptionDateKeys.map((descDateKey) => `${dealId}_${descDateKey}_${amtAbs}`)
        : dateKey
          ? [`${dealId}_${dateKey}_${amtAbs}`]
          : [];
    for (const candidateKey of candidateKeys) {
      const candidates = creditIndicesByKey.get(candidateKey) ?? [];
      const picked = pickIncomingIndexStrict(
        candidates,
        row.notes,
        incomingNoteByIdx,
        new Set<number>(),
        consumedIncomingIndices,
      );
      if (picked == null) continue;
      consumedIncomingIndices.add(picked);
      pairedDebitRowIndices.add(rowIdx);
      break;
    }
  });

  return { consumedIncomingIndices, pairedDebitRowIndices };
}

/** Incoming row indices consumed as the offsetting leg of a same-date / same-amount DEBIT reversal. */
export function computeConsumedIncomingIndicesForDebitPairing(rows: RepaidCalculationRow[]): Set<number> {
  return computeDebitIncomingPairing(rows).consumedIncomingIndices;
}

/**
 * SumOfRepaid = sum of incoming (`CREDIT` + positive PAID/MANUAL), excluding incoming consumed when paired to a DEBIT,
 * minus any **unmatched** DEBIT amounts (aggregate returns whose |amount| is not modeled as consuming one incoming row —
 * e.g. one −$2,040 reversal vs multiple $1,020 credits). Balance = payback − sumOfRepaid.
 */
export function calculateSumOfRepaidAndBalance(
  rows: RepaidCalculationRow[],
  payback: number,
): { sumOfRepaid: number; balance: number } {
  const paybackN = Number.isFinite(payback) ? payback : 0;
  const creditRows: Array<{ idx: number; amount: number }> = [];

  rows.forEach((row, idx) => {
    const dealId = String(row.dealId ?? '').trim();
    if (!dealId) return;
    const signed = row.amount;
    const amtAbs = Math.abs(signed);
    if (amtAbs <= 0 || !isIncomingForDebitPairingStatus(row.status, signed)) return;
    creditRows.push({ idx, amount: amtAbs });
  });

  const { consumedIncomingIndices, pairedDebitRowIndices } = computeDebitIncomingPairing(rows);

  let sumOfRepaid = 0;
  creditRows.forEach((creditRow) => {
    if (!consumedIncomingIndices.has(creditRow.idx)) {
      sumOfRepaid += creditRow.amount;
    }
  });

  let unmatchedDebitSubtract = 0;
  rows.forEach((row, rowIdx) => {
    if (row.status !== CollectionPaymentStatus.DEBIT) return;
    if (pairedDebitRowIndices.has(rowIdx)) return;
    unmatchedDebitSubtract += Math.abs(row.amount);
  });

  sumOfRepaid = Math.max(0, sumOfRepaid - unmatchedDebitSubtract);

  const balance = paybackN - sumOfRepaid;
  return { sumOfRepaid, balance };
}

export function buildRepaidRowsFromCollectionPayments(
  payments: Array<{
    Date?: Date | null;
    scheduledDate?: Date | null;
    processedDate?: Date | null;
    status: CollectionPaymentStatus;
    amount: Prisma.Decimal | number;
    notes?: string | null;
  }>,
  applicationDealId: string | null | undefined,
  applicationId: string,
): RepaidCalculationRow[] {
  const dealId =
    String(applicationDealId ?? '').trim() ||
    String(applicationId ?? '').trim() ||
    '_unknown';
  const out: RepaidCalculationRow[] = [];

  for (const p of payments) {
    const dateKey = resolveTransactionDateKey(p);
    if (!dateKey) continue;
    out.push({
      dealId,
      dateKey,
      status: p.status,
      amount: toFiniteAmount(p.amount),
      descriptionDateKeys: extractDescriptionDateKeys(p.notes, dateKey, 'utc'),
      notes: p.notes != null ? String(p.notes) : null,
    });
  }

  return out;
}

type UiMatchPaymentShape = {
  id: string;
  status: CollectionPaymentStatus;
  amount: Prisma.Decimal | number;
  scheduledDate?: Date | null;
  Date?: Date | null;
  processedDate?: Date | null;
  returnDate?: Date | null;
  createdAt?: Date;
  notes?: string | null;
};

function isIncomingForUiDebitPairing(
  status: CollectionPaymentStatus,
  signedAmount: number,
): boolean {
  return (
    status === CollectionPaymentStatus.CREDIT ||
    status === CollectionPaymentStatus.PAID ||
    (status === CollectionPaymentStatus.MANUAL && signedAmount > 0)
  );
}

/**
 * Pair DEBIT with incoming rows when |amount| matches and any date column overlaps.
 * Mirrors `pairDebitCreditAsFailed` on the Transactions tab without memo-date pairing.
 */
export function pairDebitCreditWithColumnDateOverlap<T extends UiMatchPaymentShape>(
  payments: T[],
): T[] {
  if (payments.length < 2) return payments;

  const debits: T[] = [];
  const incoming: T[] = [];
  const others: T[] = [];

  for (const payment of payments) {
    const signed = toFiniteAmount(payment.amount);
    if (payment.status === CollectionPaymentStatus.DEBIT) {
      debits.push(payment);
    } else if (isIncomingForUiDebitPairing(payment.status, signed)) {
      incoming.push(payment);
    } else {
      others.push(payment);
    }
  }

  const usedIncomingIds = new Set<string>();
  const out: T[] = [];

  for (const debit of debits) {
    const debitDates = collectionPaymentColumnDateKeys(debit);
    const amtKey = collectionAmountMatchKey(debit.amount);
    const match = incoming.find(
      (inc) =>
        !usedIncomingIds.has(inc.id) &&
        collectionAmountMatchKey(inc.amount) === amtKey &&
        collectionDateKeysOverlap(debitDates, collectionPaymentColumnDateKeys(inc)),
    );
    if (match) {
      usedIncomingIds.add(match.id);
      out.push({ ...debit, status: CollectionPaymentStatus.FAILED });
    } else {
      out.push(debit);
    }
  }

  for (const inc of incoming) {
    if (!usedIncomingIds.has(inc.id)) out.push(inc);
  }
  out.push(...others);
  return out;
}

/**
 * Same calendar day + same |amount|: pair DEBIT with CREDIT/PAID into one FAILED row.
 * Mirrors `pairDebitCreditAsFailed` in `PaymentScheduletab.tsx` (display date + amount only).
 */
export function pairDebitCreditForUiMatch<T extends UiMatchPaymentShape>(payments: T[]): T[] {
  if (payments.length < 2) return payments;

  const withoutGroupKey: T[] = [];
  const groups = new Map<string, T[]>();

  for (const payment of payments) {
    const dateKey = resolveCollectionPaymentUiDateKey(payment);
    if (!dateKey) {
      withoutGroupKey.push(payment);
      continue;
    }
    const key = `${dateKey}|${collectionAmountMatchKey(payment.amount)}`;
    const arr = groups.get(key);
    if (arr) arr.push(payment);
    else groups.set(key, [payment]);
  }

  const out: T[] = [...withoutGroupKey];

  for (const group of groups.values()) {
    out.push(...pairDebitCreditWithColumnDateOverlap(group));
  }

  return out;
}

export type ScheduleDayCollectionStatus = 'clear' | 'bounced';

/** Resolve clear vs bounced for collection rows tied to one schedule installment date. */
export function resolveScheduleDayCollectionStatus<T extends UiMatchPaymentShape>(
  dayRows: T[],
): ScheduleDayCollectionStatus | null {
  if (dayRows.length === 0) return null;

  const shaped = pairDebitCreditWithColumnDateOverlap(dayRows);
  let hasBounced = false;
  let hasClear = false;

  for (const row of shaped) {
    if (
      row.status === CollectionPaymentStatus.FAILED ||
      row.status === CollectionPaymentStatus.DEBIT
    ) {
      hasBounced = true;
    } else if (
      row.status === CollectionPaymentStatus.CREDIT ||
      row.status === CollectionPaymentStatus.PAID
    ) {
      hasClear = true;
    }
  }

  if (hasBounced) return 'bounced';
  if (hasClear) return 'clear';
  return null;
}

/** Deal-scoped collection rows for schedule tracking (no strict memo-date filter). */
export function filterCollectionPaymentsForScheduleMatch<T extends UiMatchPaymentShape>(
  payments: T[],
  applicationDealId: string | null | undefined,
): T[] {
  return filterCollectionPaymentsForApplicationDeal(payments, applicationDealId);
}

/**
 * Collection rows for one schedule installment: primary match on Transactions display date,
 * plus debit/incoming legs whose other date columns include the installment day (ACH returns).
 */
export function selectCollectionRowsForScheduleInstallment<T extends UiMatchPaymentShape>(
  scoped: T[],
  installmentDate: string,
  amountKey: string,
  usedCollectionIds: Set<string>,
): T[] {
  const displayMatches: T[] = [];
  const pairingExtras: T[] = [];

  for (const payment of scoped) {
    if (usedCollectionIds.has(payment.id)) continue;
    if (collectionAmountMatchKey(payment.amount) !== amountKey) continue;

    const displayDate = resolveCollectionPaymentUiDateKey(payment);
    if (displayDate === installmentDate) {
      displayMatches.push(payment);
      continue;
    }

    if (!collectionPaymentColumnDateKeys(payment).has(installmentDate)) continue;

    const signed = toFiniteAmount(payment.amount);
    const isDebit = payment.status === CollectionPaymentStatus.DEBIT;
    const isIncoming = isIncomingForDebitPairingStatus(payment.status, signed);
    if (isDebit || isIncoming) {
      pairingExtras.push(payment);
    }
  }

  return [...displayMatches, ...pairingExtras];
}

export type StrictTransactionFilterOptions = {
  /** Collection payment ids for DEBIT rows paired to an incoming and surfaced as `FAILED`. */
  pairedReversalDebitPaymentIdsOut?: Set<string>;
};

/**
 * Server-side schedule shaping for GET /collection-payments:
 * - Pair DEBIT (returns) to incoming rows (CREDIT or positive PAID/MANUAL) by |amount| + transaction date
 *   and/or dates parsed from `notes` (same util as financials).
 * - Hide the matched incoming row; set the debit’s status to FAILED for API consumers.
 */
export function applyStrictTransactionFiltering<T extends {
  status: CollectionPaymentStatus;
  amount: Prisma.Decimal | number;
  Date?: Date | null;
  scheduledDate?: Date | null;
  processedDate?: Date | null;
  notes?: string | null;
}>(payments: T[], options?: StrictTransactionFilterOptions): T[] {
  const rows = payments.map((payment, idx) => {
    const rawAmount = toFiniteAmount(payment.amount);
    const amountAbs = Math.abs(rawAmount);
    const dateKey = resolveTransactionDateKey(payment);
    const descriptionDateKeys = extractDescriptionDateKeys(payment.notes, dateKey, 'utc');
    const isIncoming = isIncomingForDebitPairingStatus(payment.status, rawAmount);
    const isDebitRow = payment.status === CollectionPaymentStatus.DEBIT;
    return {
      idx,
      payment,
      rawAmount,
      amountAbs,
      dateKey,
      descriptionDateKeys,
      isIncoming,
      isDebitRow,
    };
  });

  const creditIndicesByKey = new Map<string, number[]>();
  rows.forEach((row) => {
    if (!row.isIncoming || row.amountAbs <= 0) return;
    const keysForIncoming = new Set<string>();
    for (const dk of allResolveTransactionDateKeys(row.payment)) keysForIncoming.add(dk);
    row.descriptionDateKeys.forEach((d) => keysForIncoming.add(d));
    for (const dk of keysForIncoming) {
      const key = `${dk}_${row.amountAbs}`;
      const list = creditIndicesByKey.get(key) ?? [];
      list.push(row.idx);
      creditIndicesByKey.set(key, list);
    }
  });

  const incomingNoteByIdx = new Map<number, string | null | undefined>(
    rows.map((r) => [r.idx, r.payment.notes as string | null | undefined]),
  );

  const hiddenIncomingIndices = new Set<number>();
  const forcedFailedIndices = new Set<number>();
  const consumedIncomingForDebit = new Set<number>();

  rows.forEach((row) => {
    if (!row.isDebitRow || row.amountAbs <= 0) return;
    const candidateKeys: string[] = [];
    const seenPairKey = new Set<string>();
    const pushKey = (dk: string) => {
      const key = `${dk}_${row.amountAbs}`;
      if (seenPairKey.has(key)) return;
      seenPairKey.add(key);
      candidateKeys.push(key);
    };
    for (const dk of row.descriptionDateKeys) pushKey(dk);
    for (const dk of allResolveTransactionDateKeys(row.payment)) pushKey(dk);
    for (const key of candidateKeys) {
      const candidates = creditIndicesByKey.get(key) ?? [];
      const matchIdx = pickIncomingIndexStrict(
        candidates,
        row.payment.notes as string | null | undefined,
        incomingNoteByIdx,
        hiddenIncomingIndices,
        consumedIncomingForDebit,
      );
      if (matchIdx == null) continue;
      consumedIncomingForDebit.add(matchIdx);
      hiddenIncomingIndices.add(matchIdx);
      forcedFailedIndices.add(row.idx);
      const pid = (row.payment as { id?: unknown }).id;
      if (pid != null && options?.pairedReversalDebitPaymentIdsOut) {
        options.pairedReversalDebitPaymentIdsOut.add(String(pid));
      }
      break;
    }
  });

  return rows.flatMap((row) => {
    if (hiddenIncomingIndices.has(row.idx)) return [];
    if (!forcedFailedIndices.has(row.idx)) return [row.payment];
    return [{ ...row.payment, status: CollectionPaymentStatus.FAILED }];
  });
}

export async function getDealFinancialsForApplication(
  prisma: PrismaClient,
  applicationId: string,
): Promise<DealFinancialsResult | null> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      dealId: true,
      OfferDecision: { select: { totalRemit: true } },
    },
  });

  if (!app) return null;

  const payments = await prisma.collectionPayment.findMany({
    where: { applicationId },
    select: {
      dealId: true,
      Date: true,
      scheduledDate: true,
      processedDate: true,
      status: true,
      amount: true,
      notes: true,
    },
  });

  const scoped = filterCollectionPaymentsForApplicationDeal(payments, app.dealId);
  const rows = buildRepaidRowsFromCollectionPayments(scoped, app.dealId, applicationId);
  const payback = paybackFromOfferDecision(app.OfferDecision);
  const { sumOfRepaid, balance } = calculateSumOfRepaidAndBalance(rows, payback);

  const dealId = String(app.dealId ?? '').trim();

  return {
    dealId,
    sumOfRepaid,
    balance,
  };
}

/** Matches `collectionPaymentController` payback semantics (terms offer + OfferDecision.rate / factor). */
function parseMoneyForDealBalance(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const n = Number((value as { toString(): string }).toString());
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Matches PaymentHistoryDashboard / Transactions: when `OfferDecision.offer` is a nested object, scalar
 * lookups (payback, approved amount, total remit) use that inner record; `rate` stays on the root OfferDecision.
 */
export function offerDecisionEffectiveRecord(
  odRoot: { offer?: unknown } | null | undefined,
): Record<string, unknown> | null {
  if (!odRoot || typeof odRoot !== 'object') return null;
  const root = odRoot as Record<string, unknown>;
  const inner = root.offer;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    if (Prisma.Decimal.isDecimal(inner)) {
      return root;
    }
    return inner as Record<string, unknown>;
  }
  return root;
}

export function offerDecisionRateFromRoot(odRoot: unknown): number | null {
  if (!odRoot || typeof odRoot !== 'object') return null;
  return parseMoneyForDealBalance((odRoot as Record<string, unknown>).rate);
}

/**
 * Fee dollars for deal economics: root `OfferDecision.fees`, else nested `offer.fees` when `offer` is an object.
 * Matches frontend `resolveFeesForOfferDecision`.
 */
export function feesForOfferDecision(odRoot: { offer?: unknown } | null | undefined): number {
  if (!odRoot || typeof odRoot !== 'object') return 0;
  const root = odRoot as Record<string, unknown>;
  const odEff = offerDecisionEffectiveRecord(odRoot);
  return (
    parseMoneyForDealBalance(root.fees) ??
    parseMoneyForDealBalance(odEff?.fees) ??
    0
  );
}

export function getApprovedOfferAmountForDealBalance(app: {
  loanAmount?: unknown;
  termsOffers?: Array<{ approvedAmount?: unknown }>;
  OfferDecision?: { offer?: unknown; decision?: string | null } | null;
}): number {
  const loanAmount = parseMoneyForDealBalance(app.loanAmount);
  const latestTerms = app.termsOffers?.[0];
  const fromTerms = latestTerms ? parseMoneyForDealBalance(latestTerms.approvedAmount) : null;
  const decisionNorm = String(app.OfferDecision?.decision ?? '').toLowerCase();
  const odEff = offerDecisionEffectiveRecord(app.OfferDecision);
  const fromOfferDecision =
    decisionNorm !== 'declined'
      ? parseMoneyForDealBalance(odEff?.offer) ?? parseMoneyForDealBalance(odEff?.approvedAmount)
      : null;
  return fromTerms ?? fromOfferDecision ?? loanAmount ?? 0;
}

export function getPaybackAmountForDealBalance(
  app: {
    OfferDecision?: {
      offer?: unknown;
      rate?: unknown;
      factorRate?: unknown;
      factor?: unknown;
      paybackAmount?: unknown;
      totalRemit?: unknown;
      totalRepayments?: unknown;
      totalRepayment?: unknown;
    } | null;
    termsOffers?: Array<{ approvedAmount?: unknown; factorRate?: unknown; paybackAmount?: unknown }>;
  },
  offerAmount: number,
): number {
  const latestTermsOffer = app.termsOffers?.[0];
  const odRoot = app.OfferDecision;
  const odEff = offerDecisionEffectiveRecord(odRoot);
  const decisionRate = offerDecisionRateFromRoot(odRoot);
  const termsFactor = parseMoneyForDealBalance(latestTermsOffer?.factorRate);
  const factorRate = decisionRate ?? termsFactor;
  const fallbackPayback =
    parseMoneyForDealBalance(latestTermsOffer?.paybackAmount) ??
    parseMoneyForDealBalance(odEff?.paybackAmount) ??
    parseMoneyForDealBalance(odEff?.totalRemit) ??
    parseMoneyForDealBalance(odEff?.totalRepayments) ??
    parseMoneyForDealBalance(odEff?.totalRepayment);

  const advance =
    offerAmount > 0
      ? offerAmount
      : parseMoneyForDealBalance(odEff?.offer) ??
        parseMoneyForDealBalance(odEff?.approvedAmount) ??
        parseMoneyForDealBalance(latestTermsOffer?.approvedAmount) ??
        0;

  if (advance <= 0) return 0;
  if (factorRate != null) return Math.max(advance * factorRate, 0);
  if (fallbackPayback != null && fallbackPayback > 0) return Math.max(fallbackPayback, 0);
  return 0;
}

/**
 * Payment dashboard **Total Payback**: Σ per funded application of
 * **`OfferDecision.offer` × `OfferDecision.rate`** (linked by `applicationId`).
 * Uses the same offer scalar resolution as deal economics (`offerDecisionEffectiveRecord` for nested JSON).
 * Does **not** use terms `factorRate`, `loanAmount`, or `totalRemit` — those inflated portfolio totals.
 */
export function sumTotalPaybackOfferTimesRateFromOfferDecisionRows(
  applications: Array<{
    OfferDecision?: {
      offer?: unknown;
      decision?: unknown;
      rate?: unknown;
    } | null;
  }>,
): number {
  let sum = 0;
  for (const app of applications) {
    const od = app.OfferDecision;
    if (!od) continue;
    if (String(od.decision ?? '').toLowerCase() === 'declined') continue;
    const odEff = offerDecisionEffectiveRecord(od);
    const root = od as Record<string, unknown>;
    const offerNum =
      parseMoneyForDealBalance(root.offer) ??
      parseMoneyForDealBalance(odEff?.offer as unknown) ??
      parseMoneyForDealBalance((odEff as Record<string, unknown> | null)?.approvedAmount as unknown);
    const rateNum = offerDecisionRateFromRoot(od);
    if (offerNum == null || rateNum == null) continue;
    if (!(offerNum > 0) || !(rateNum > 0)) continue;
    sum += offerNum * rateNum;
  }
  return Number(sum.toFixed(2));
}

/** Signed per-deal gap: repaid toward payback (capped) − already net — same as PaymentHistoryDashboard StatCard. */
export function signedAbovePrincipalGap(repaidTowardPayback: number, alreadyNet: number): number {
  const g = Number.isFinite(repaidTowardPayback) ? repaidTowardPayback : 0;
  const n = Number.isFinite(alreadyNet) ? alreadyNet : 0;
  return g - n;
}

export type FundedDealBalanceApiRow = {
  applicationId: string;
  dealId: string;
  paybackAmount: number;
  /** Strict ACH/booking pairing (CREDIT/PAID + debit netting rules). Used for balances that must match ACH reversals. */
  sumOfRepaid: number;
  balanceDue: number;
  /**
   * Same gross “Repaid” as Deal Economics (`Transactions.tsx` `paidAmount`):
   * CREDIT + PAID + MANUAL − sum(|DEBIT|). Portfolio recovered totals prefer this plus payback-cap.
   */
  grossRepaidDealEconomics: number;
};

/**
 * Amount applied toward payback excluding surplus (`Min(repaid, payback)` when payback is positive).
 * Prefer {@link grossRepaidDealEconomicsFromPayments} for portfolio “Recovered” matching Deal Economics REPaid.
 * @param sumOfRepaid gross economics or strict sum, depending on caller
 */
export function repaidTowardPaybackExcludingSurplus(sumOfRepaid: number, paybackAmount: number): number {
  const gross = Math.max(0, Number(sumOfRepaid) || 0);
  const payback = Math.max(0, Number(paybackAmount) || 0);
  return payback > 0 ? Math.min(gross, payback) : gross;
}

/**
 * Remaining balance the same way `Transactions.tsx` computes it: gross economics repaid vs payback,
 * not strict ACH pairing (`calculateSumOfRepaidAndBalance`).
 */
export function balanceDueLikeTransactionsPage(
  paybackAmount: number,
  grossRepaidDealEconomics: number,
): number {
  const payback = Math.max(0, Number(paybackAmount) || 0);
  const paidAmount =
    Math.round(Math.max(0, Number(grossRepaidDealEconomics) || 0) * 100) / 100;
  return payback > 0 ? Math.max(0, payback - paidAmount) : payback - paidAmount;
}

/**
 * Computes payback plus strict repayment math and Deal Economics gross repaid (`grossRepaidDealEconomicsFromPayments`).
 */
export async function getBalancesForApplicationIds(
  prisma: PrismaClient,
  applicationIds: string[],
): Promise<FundedDealBalanceApiRow[]> {
  const uniqueIds = [
    ...new Set(applicationIds.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0)),
  ];
  if (!uniqueIds.length) return [];

  const apps = await prisma.application.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      dealId: true,
      loanAmount: true,
      OfferDecision: {
        select: {
          offer: true,
          decision: true,
          rate: true,
          totalRemit: true,
        },
      },
      termsOffers: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          approvedAmount: true,
          factorRate: true,
          paybackAmount: true,
        },
      },
    },
  });

  const payments = await prisma.collectionPayment.findMany({
    where: { applicationId: { in: uniqueIds } },
    select: {
      applicationId: true,
      dealId: true,
      Date: true,
      scheduledDate: true,
      processedDate: true,
      status: true,
      amount: true,
      notes: true,
    },
  });

  const paymentsByApplicationId = new Map<string, typeof payments>();
  for (const payment of payments) {
    const list = paymentsByApplicationId.get(payment.applicationId);
    if (list) list.push(payment);
    else paymentsByApplicationId.set(payment.applicationId, [payment]);
  }

  const appById = new Map(apps.map((a) => [a.id, a]));
  const out: FundedDealBalanceApiRow[] = [];

  for (const applicationId of uniqueIds) {
    const app = appById.get(applicationId);
    if (!app) continue;

    const offerApproved = getApprovedOfferAmountForDealBalance(app);
    const paybackAmount = getPaybackAmountForDealBalance(
      {
        OfferDecision: app.OfferDecision,
        termsOffers: app.termsOffers,
      },
      offerApproved,
    );
    const appPayments = paymentsByApplicationId.get(applicationId) ?? [];
    const scopedPayments = filterCollectionPaymentsForApplicationDeal(appPayments, app.dealId ?? null);
    const rows = buildRepaidRowsFromCollectionPayments(scopedPayments, app.dealId ?? null, app.id);
    const { sumOfRepaid, balance } = calculateSumOfRepaidAndBalance(rows, paybackAmount);
    const grossEconomics = grossRepaidDealEconomicsFromPayments(scopedPayments);

    out.push({
      applicationId,
      dealId: String(app.dealId ?? '').trim(),
      paybackAmount: Number(Number(paybackAmount).toFixed(2)),
      sumOfRepaid: Number(Number(sumOfRepaid).toFixed(2)),
      balanceDue: Number(Number(balance).toFixed(2)),
      grossRepaidDealEconomics: Number(Number(grossEconomics).toFixed(2)),
    });
  }

  return out;
}

/** Collections `Transactions.tsx` row filter — same rules as the frontend. */
export function filterCollectionPaymentsForTransactionsPage<
  T extends { applicationId: string; dealId?: string | null; notes?: string | null },
>(rows: T[], params: { primaryApplicationId: string; applicationIdDisplay: string | null; applicationDealId: string | null }): T[] {
  const normalizedIds = new Set<string>(
    [params.primaryApplicationId, params.applicationIdDisplay]
      .filter((v): v is string => !!v && String(v).trim().length > 0)
      .map((s) => String(s).trim()),
  );
  const token = normalizeDealIdTokenForPayments(params.applicationDealId);

  return rows.filter((row) => {
    const rowAppIds = [String(row.applicationId).trim()].filter((s) => s.length > 0);
    const rowDealTokens = collectionPaymentRowDealTokens(row);
    const matchesApplication = rowAppIds.some((id) => normalizedIds.has(id));
    const matchesDealId = token.length > 0 && rowDealTokens.some((t) => t === token);
    if (token.length > 0) {
      if (rowDealTokens.length > 0) return matchesDealId;
      return matchesApplication;
    }
    return matchesApplication || matchesDealId;
  });
}

function roundUsd2Local(value: number): number {
  return Math.round(value * 100) / 100;
}

function toLocalDateKey(d: Date): string {
  const pad = (x: number) => (x < 10 ? `0${x}` : String(x));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function resolvePaymentRowLocalDateKey(p: {
  Date?: Date | null;
  scheduledDate?: Date | null;
  processedDate?: Date | null;
}): string | null {
  const raw = p.scheduledDate ?? p.Date ?? p.processedDate ?? null;
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return toLocalDateKey(dt);
}

function buildFrequencyLabel(frequencyRaw: string): { frequency: string; frequencyLabel: string } {
  const frequency = String(frequencyRaw ?? '').trim().toLowerCase();
  const frequencyLabel =
    frequency === 'weekly'
      ? 'Weekly'
      : frequency === 'daily'
        ? 'Daily'
        : frequencyRaw.trim()
          ? frequencyRaw.trim().charAt(0).toUpperCase() + frequencyRaw.trim().slice(1).toLowerCase()
          : 'Daily';
  return { frequency, frequencyLabel };
}

export type DealCollectionsViewApi = {
  calculatedAt: string;
  viewApplicationId: string;
  offerDecision: 'approved' | 'declined' | null;
  offerSummary: {
    advanceNum: number;
    paybackNum: number;
    netFundingNum: number;
    feesAmount: number;
    commissionOnDeal: number;
    alreadyNetNum: number;
    refinanceAmount: number | null;
    factorRate: number | null;
    frequency: string;
    frequencyLabel: string;
    paymentAmount: number | null;
  };
  repayment: {
    pendingAmount: number;
    paidAmount: number;
    failedAmount: number;
    debitedAmount: number;
    netFunding: number;
    repaidTowardPayback: number;
    balance: number;
    paidPct: number | null;
    overPaid: number;
    abovePrincipal: number;
    alreadyNet: number;
    payback: number;
    advance: number;
    creditCount: number;
    failedTxnCount: number;
    debitTxnCount: number;
    dueTodayAmount: number;
  };
  schedule: {
    advanceAmount: number;
    factor: number;
    paybackAmount: number;
    dailyPayment: number;
    startDate: string;
  };
};

/**
 * Full deal economics + repayment metrics for the Collections Transactions tab.
 * Call with payments already passed through {@link applyStrictTransactionFiltering} and
 * {@link filterCollectionPaymentsForTransactionsPage}.
 */
export function computeDealCollectionsView(input: {
  viewPayments: Array<{
    status: CollectionPaymentStatus;
    amount: Prisma.Decimal | number;
    Date?: Date | null;
    scheduledDate?: Date | null;
    processedDate?: Date | null;
    notes?: string | null;
  }>;
  application: {
    id: string;
    applicationId: number;
    dealId: string | null;
    loanAmount: number | null;
    commissionAmount: number | null;
    OfferDecision: Record<string, unknown> | null;
    termsOffers: Array<{
      approvedAmount: number;
      factorRate: number;
      paybackAmount: number;
      paymentAmount: number;
      frequency: string;
      commissionAmount: number;
    }>;
  };
}): DealCollectionsViewApi {
  const app = input.application;
  const latestTerms = app.termsOffers?.[0];
  const odRoot = app.OfferDecision;
  const odEff = offerDecisionEffectiveRecord(odRoot);

  const decisionNorm = String(odRoot?.decision ?? '').toLowerCase();
  let offerDecision: 'approved' | 'declined' | null = null;
  if (decisionNorm === 'approved' || decisionNorm === 'declined') {
    offerDecision = decisionNorm as 'approved' | 'declined';
  }

  const refinanceAmount =
    parseMoneyForDealBalance(odRoot?.refinanceAmount) ??
    parseMoneyForDealBalance((odRoot as Record<string, unknown> | null)?.RefinanceAmount) ??
    parseMoneyForDealBalance(odEff?.refinanceAmount) ??
    parseMoneyForDealBalance(odEff?.RefinanceAmount);

  const appForAdvance = {
    loanAmount: app.loanAmount,
    termsOffers: app.termsOffers,
    OfferDecision: app.OfferDecision,
  };
  let advanceNum = getApprovedOfferAmountForDealBalance(appForAdvance);
  if (!(advanceNum > 0)) {
    advanceNum =
      parseMoneyForDealBalance(odEff?.offer) ??
      parseMoneyForDealBalance(latestTerms?.approvedAmount) ??
      0;
  }

  const paybackFromEconomics = getPaybackAmountForDealBalance(
    {
      OfferDecision: app.OfferDecision as Parameters<typeof getPaybackAmountForDealBalance>[0]['OfferDecision'],
      termsOffers: app.termsOffers,
    },
    advanceNum,
  );
  const fallbackPaybackDisplay =
    parseMoneyForDealBalance(latestTerms?.paybackAmount) ??
    parseMoneyForDealBalance(odEff?.paybackAmount) ??
    parseMoneyForDealBalance(odEff?.totalRemit) ??
    parseMoneyForDealBalance(odEff?.totalRepayments) ??
    parseMoneyForDealBalance(odEff?.totalRepayment);
  const decisionRate = offerDecisionRateFromRoot(odRoot);
  const termsFactor = parseMoneyForDealBalance(latestTerms?.factorRate);
  const factorRate = decisionRate ?? termsFactor;
  const factorForSchedule = Number(factorRate ?? 0);

  const paymentAmountResolved =
    parseMoneyForDealBalance(odRoot?.paymentAmount) ??
    parseMoneyForDealBalance(odRoot?.repayPerPeriod) ??
    parseMoneyForDealBalance((odRoot as Record<string, unknown>)?.daysWeeks) ??
    parseMoneyForDealBalance(odEff?.paymentAmount) ??
    parseMoneyForDealBalance(odEff?.repayPerPeriod) ??
    parseMoneyForDealBalance(odEff?.daysWeeks) ??
    parseMoneyForDealBalance(latestTerms?.paymentAmount);

  const frequencyRaw = String(odRoot?.frequency ?? odEff?.frequency ?? latestTerms?.frequency ?? '').trim();
  const { frequency, frequencyLabel } = buildFrequencyLabel(frequencyRaw);

  const feesAmount = feesForOfferDecision(odRoot as { offer?: unknown } | null);
  const paybackNum = roundUsd2Local(
    paybackFromEconomics > 0
      ? paybackFromEconomics
      : fallbackPaybackDisplay ?? 0,
  );

  const commissionOnDeal =
    parseMoneyForDealBalance(app.commissionAmount) ?? parseMoneyForDealBalance(latestTerms?.commissionAmount) ?? 0;

  const netFundingNum = Math.max(0, advanceNum - feesAmount - (refinanceAmount ?? 0));
  const alreadyNetNum = alreadyNetDealEconomics(advanceNum, feesAmount, commissionOnDeal);

  const paybackEconomicsForSchedule =
    paybackFromEconomics > 0
      ? paybackFromEconomics
      : advanceNum && factorForSchedule
        ? advanceNum * factorForSchedule
        : parseMoneyForDealBalance(latestTerms?.paybackAmount) ??
          parseMoneyForDealBalance(odEff?.paybackAmount) ??
          parseMoneyForDealBalance(odEff?.totalRemit) ??
          0;

  const dailyPaymentSchedule =
    parseMoneyForDealBalance(odRoot?.paymentAmount) ??
    parseMoneyForDealBalance(odRoot?.repayPerPeriod) ??
    parseMoneyForDealBalance((odRoot as Record<string, unknown>)?.daysWeeks) ??
    parseMoneyForDealBalance(latestTerms?.paymentAmount) ??
    0;

  const payments = input.viewPayments;
  const pendingAmount = payments
    .filter(
      (p) =>
        p.status === CollectionPaymentStatus.DUE_TODAY ||
        p.status === CollectionPaymentStatus.UPCOMING ||
        p.status === CollectionPaymentStatus.SCHEDULED,
    )
    .reduce((sum, p) => sum + Math.abs(toFiniteAmount(p.amount)), 0);

  const grossPaid = grossRepaidDealEconomicsFromPayments(payments);
  const paidAmount = roundUsd2Local(Math.max(0, grossPaid));

  const failedAmount = payments
    .filter((p) => p.status === CollectionPaymentStatus.FAILED)
    .reduce((sum, p) => sum + Math.abs(toFiniteAmount(p.amount)), 0);
  const debitedAmount = payments
    .filter((p) => p.status === CollectionPaymentStatus.DEBIT)
    .reduce((sum, p) => sum + Math.abs(toFiniteAmount(p.amount)), 0);

  const repaidTowardPayback = repaidTowardPaybackExcludingSurplus(paidAmount, paybackNum);
  const balance = balanceDueLikeTransactionsPage(paybackNum, paidAmount);
  const paidPct = paybackNum > 0 ? Math.min(100, (repaidTowardPayback / paybackNum) * 100) : null;
  const overPaid = Math.max(paidAmount - paybackNum, 0);
  const abovePrincipal = roundUsd2Local(signedAbovePrincipalGap(repaidTowardPayback, alreadyNetNum));

  const creditCount = payments.filter(
    (p) => p.status === CollectionPaymentStatus.CREDIT || p.status === CollectionPaymentStatus.PAID,
  ).length;
  const failedTxnCount = payments.filter((p) => p.status === CollectionPaymentStatus.FAILED).length;
  const debitTxnCount = payments.filter((p) => p.status === CollectionPaymentStatus.DEBIT).length;

  const todayKey = toLocalDateKey(new Date());
  let dueTodayAmount = 0;
  for (const p of payments) {
    const dk = resolvePaymentRowLocalDateKey(p);
    if (dk === todayKey) dueTodayAmount += Math.abs(toFiniteAmount(p.amount));
  }

  return {
    calculatedAt: new Date().toISOString(),
    viewApplicationId: app.id,
    offerDecision,
    offerSummary: {
      advanceNum,
      paybackNum,
      netFundingNum,
      feesAmount,
      commissionOnDeal,
      alreadyNetNum,
      refinanceAmount: refinanceAmount ?? null,
      factorRate,
      frequency,
      frequencyLabel,
      paymentAmount: paymentAmountResolved,
    },
    repayment: {
      pendingAmount,
      paidAmount,
      failedAmount,
      debitedAmount,
      netFunding: netFundingNum,
      repaidTowardPayback,
      balance,
      paidPct: paidPct != null && Number.isFinite(paidPct) ? roundUsd2Local(paidPct) : null,
      overPaid,
      abovePrincipal,
      alreadyNet: alreadyNetNum,
      payback: paybackNum,
      advance: advanceNum,
      creditCount,
      failedTxnCount,
      debitTxnCount,
      dueTodayAmount,
    },
    schedule: {
      advanceAmount: advanceNum,
      factor: factorForSchedule,
      paybackAmount: paybackEconomicsForSchedule > 0 ? paybackEconomicsForSchedule : Number(paybackNum),
      dailyPayment: dailyPaymentSchedule,
      startDate: new Date().toISOString().slice(0, 10),
    },
  };
}
