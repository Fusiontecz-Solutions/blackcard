import { parseExcelDate } from '../services/applicationBulkExcelIngestService';

export type PreviewSheetRowSide = 'debit' | 'credit' | 'unknown';

const normalizeHeaderKey = (key: string): string =>
  key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const getPreviewRowValue = (rowData: Record<string, unknown>, ...candidates: string[]): unknown => {
  const entries = Object.entries(rowData);
  for (const candidate of candidates) {
    const want = normalizeHeaderKey(candidate);
    const hit = entries.find(([k]) => normalizeHeaderKey(k) === want);
    if (hit) return hit[1];
  }
  return undefined;
};

const hasPreviewCellValue = (value: unknown): boolean => {
  if (value == null) return false;
  const s = String(value).trim();
  return s.length > 0 && s !== '—' && s !== '-';
};

export function parsePreviewSheetAmount(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).replace(/[$,\s]/g, '').trim();
  if (!s || s === '—' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Debit vs credit leg from upload sheet columns (matches commit status logic). */
export function getPreviewSheetRowSide(rowData: Record<string, unknown>): PreviewSheetRowSide {
  const hasCredit = hasPreviewCellValue(getPreviewRowValue(rowData, 'Credit'));
  const hasDebit = hasPreviewCellValue(getPreviewRowValue(rowData, 'Debit'));
  if (hasDebit && !hasCredit) return 'debit';
  if (hasCredit && !hasDebit) return 'credit';
  return 'unknown';
}

export function getPreviewSheetDescription(
  rowData: Record<string, unknown>,
  fallbackDescription?: unknown,
): string {
  const fromCell = String(
    getPreviewRowValue(rowData, 'Description', 'Notes', 'Note', 'Remarks') ?? '',
  ).trim();
  if (fromCell) return fromCell;
  return String(fallbackDescription ?? '').trim();
}

export function getPreviewSheetDateKey(rowData: Record<string, unknown>): string {
  const dateRaw = getPreviewRowValue(
    rowData,
    'Date',
    'Payment Date',
    'Transaction Date',
    'Value Date',
    'Posting Date',
  );
  if (!hasPreviewCellValue(dateRaw)) return '';
  const parsed = parseExcelDate(dateRaw);
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

/** Pair reversal legs: same deal + date + |amount|. */
export function getPreviewSheetPairingKey(params: {
  dealId: string;
  rowData: Record<string, unknown>;
}): string | null {
  const deal = String(params.dealId ?? '').trim().toUpperCase();
  if (!deal) return null;
  const rowData = params.rowData ?? {};
  const credit = parsePreviewSheetAmount(getPreviewRowValue(rowData, 'Credit'));
  const debit = parsePreviewSheetAmount(getPreviewRowValue(rowData, 'Debit'));
  const amount = credit ?? debit;
  if (amount == null) return null;
  const amountKey = amount.toFixed(2);
  const dateKey = getPreviewSheetDateKey(rowData);
  return `${deal}|${dateKey}|${amountKey}`;
}

export type PreviewSheetRowLike = {
  rowData?: Record<string, unknown>;
  description?: unknown;
  dealId?: string | null;
};

export function findPairedDebitSheetRow<T extends PreviewSheetRowLike>(
  row: T,
  groupRows: T[],
  dealId: string,
): T | null {
  const rowData = (row.rowData ?? {}) as Record<string, unknown>;
  if (getPreviewSheetRowSide(rowData) === 'debit') return row;
  const pairingKey = getPreviewSheetPairingKey({ dealId, rowData });
  if (!pairingKey) return null;
  for (const candidate of groupRows) {
    const candidateData = (candidate.rowData ?? {}) as Record<string, unknown>;
    if (getPreviewSheetRowSide(candidateData) !== 'debit') continue;
    const candidateKey = getPreviewSheetPairingKey({ dealId, rowData: candidateData });
    if (candidateKey === pairingKey) return candidate;
  }
  return null;
}

export function findPairedCreditSheetRow<T extends PreviewSheetRowLike>(
  row: T,
  groupRows: T[],
  dealId: string,
): T | null {
  const rowData = (row.rowData ?? {}) as Record<string, unknown>;
  if (getPreviewSheetRowSide(rowData) === 'credit') return row;
  const pairingKey = getPreviewSheetPairingKey({ dealId, rowData });
  if (!pairingKey) return null;
  for (const candidate of groupRows) {
    const candidateData = (candidate.rowData ?? {}) as Record<string, unknown>;
    if (getPreviewSheetRowSide(candidateData) !== 'credit') continue;
    const candidateKey = getPreviewSheetPairingKey({ dealId, rowData: candidateData });
    if (candidateKey === pairingKey) return candidate;
  }
  return null;
}

export function resolveReturnCodeDescriptionsForSheetRow<T extends PreviewSheetRowLike>(
  row: T,
  groupRows: T[],
  dealId: string,
): { debitDescription: string; creditDescription: string } {
  const rowData = (row.rowData ?? {}) as Record<string, unknown>;
  const side = getPreviewSheetRowSide(rowData);
  const debitRow = side === 'debit' ? row : findPairedDebitSheetRow(row, groupRows, dealId);
  const creditRow = side === 'credit' ? row : findPairedCreditSheetRow(row, groupRows, dealId);
  return {
    debitDescription: debitRow
      ? getPreviewSheetDescription((debitRow.rowData ?? {}) as Record<string, unknown>, debitRow.description)
      : '',
    creditDescription: creditRow
      ? getPreviewSheetDescription((creditRow.rowData ?? {}) as Record<string, unknown>, creditRow.description)
      : '',
  };
}
