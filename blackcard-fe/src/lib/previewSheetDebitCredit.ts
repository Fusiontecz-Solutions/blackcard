export type PreviewSheetRowSide = "debit" | "credit" | "unknown";

function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getPreviewRowValue(rowData: Record<string, string>, ...candidates: string[]): string {
  const entries = Object.entries(rowData);
  for (const candidate of candidates) {
    const want = normalizeHeaderKey(candidate);
    const hit = entries.find(([k]) => normalizeHeaderKey(k) === want);
    if (hit) return String(hit[1] ?? "").trim();
  }
  return "";
}

function hasPreviewCellValue(value: string): boolean {
  const s = String(value ?? "").trim();
  return s.length > 0 && s !== "—" && s !== "-";
}

export function parsePreviewSheetAmount(value: string): number | null {
  const s = String(value ?? "").replace(/[$,\s]/g, "").trim();
  if (!s || s === "—" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getPreviewSheetRowSide(rowData: Record<string, string>): PreviewSheetRowSide {
  const hasCredit = hasPreviewCellValue(getPreviewRowValue(rowData, "Credit"));
  const hasDebit = hasPreviewCellValue(getPreviewRowValue(rowData, "Debit"));
  if (hasDebit && !hasCredit) return "debit";
  if (hasCredit && !hasDebit) return "credit";
  return "unknown";
}

const PREVIEW_ROW_DESCRIPTION_HEADER_KEYS = new Set([
  "description",
  "desc",
  "narration",
  "notes",
  "note",
  "remarks",
]);

export function getPreviewSheetDescription(
  row: { description?: string; rowData?: Record<string, string> },
): string {
  const direct = String(row.description ?? "").trim();
  if (direct) return direct;
  const entries = Object.entries(row.rowData ?? {});
  const descriptionEntry = entries.find(([key]) =>
    PREVIEW_ROW_DESCRIPTION_HEADER_KEYS.has(normalizeHeaderKey(key)),
  );
  return String(descriptionEntry?.[1] ?? "").trim();
}

export function getPreviewSheetDateKey(row: {
  rowData?: Record<string, string>;
}): string {
  const rowData = row.rowData ?? {};
  for (const [key, value] of Object.entries(rowData)) {
    const n = normalizeHeaderKey(key);
    if (
      n !== "date" &&
      n !== "paymentdate" &&
      n !== "transactiondate" &&
      n !== "valuedate" &&
      n !== "postingdate"
    ) {
      continue;
    }
    const t = String(value ?? "").trim();
    if (!t) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return "";
}

export function getPreviewSheetPairingKey(params: {
  dealId: string;
  rowData?: Record<string, string>;
}): string | null {
  const deal = String(params.dealId ?? "").trim().toUpperCase();
  if (!deal) return null;
  const rowData = params.rowData ?? {};
  const credit = parsePreviewSheetAmount(getPreviewRowValue(rowData, "Credit"));
  const debit = parsePreviewSheetAmount(getPreviewRowValue(rowData, "Debit"));
  const amount = credit ?? debit;
  if (amount == null) return null;
  const dateKey = getPreviewSheetDateKey({ rowData });
  return `${deal}|${dateKey}|${amount.toFixed(2)}`;
}

export type PreviewSheetRowLike = {
  rowData?: Record<string, string>;
  description?: string;
};

export function findPairedDebitSheetRow<T extends PreviewSheetRowLike>(
  row: T,
  groupRows: T[],
  dealId: string,
): T | null {
  const rowData = row.rowData ?? {};
  if (getPreviewSheetRowSide(rowData) === "debit") return row;
  const pairingKey = getPreviewSheetPairingKey({ dealId, rowData });
  if (!pairingKey) return null;
  for (const candidate of groupRows) {
    const candidateData = candidate.rowData ?? {};
    if (getPreviewSheetRowSide(candidateData) !== "debit") continue;
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
  const rowData = row.rowData ?? {};
  if (getPreviewSheetRowSide(rowData) === "credit") return row;
  const pairingKey = getPreviewSheetPairingKey({ dealId, rowData });
  if (!pairingKey) return null;
  for (const candidate of groupRows) {
    const candidateData = candidate.rowData ?? {};
    if (getPreviewSheetRowSide(candidateData) !== "credit") continue;
    const candidateKey = getPreviewSheetPairingKey({ dealId, rowData: candidateData });
    if (candidateKey === pairingKey) return candidate;
  }
  return null;
}

/** @deprecated Prefer resolveReturnCodeDescriptionsForSheetRow — kept for callers that need raw text. */
export function getReturnCodeSourceDescription<T extends PreviewSheetRowLike>(
  row: T,
  groupRows: T[],
  dealId: string,
): string {
  const { debitDescription, creditDescription } = resolveReturnCodeDescriptionsForSheetRow(
    row,
    groupRows,
    dealId,
  );
  return debitDescription || creditDescription;
}

/**
 * Reversal pairs: return code is read from the debit memo first, then the paired credit/return memo
 * (banks often put "R01 Insufficient Funds" on the credit leg only).
 */
export function resolveReturnCodeDescriptionsForSheetRow<T extends PreviewSheetRowLike>(
  row: T,
  groupRows: T[],
  dealId: string,
): { debitDescription: string; creditDescription: string } {
  const rowData = row.rowData ?? {};
  const side = getPreviewSheetRowSide(rowData);
  const debitRow =
    side === "debit" ? row : findPairedDebitSheetRow(row, groupRows, dealId);
  const creditRow =
    side === "credit" ? row : findPairedCreditSheetRow(row, groupRows, dealId);

  return {
    debitDescription: debitRow ? getPreviewSheetDescription(debitRow) : "",
    creditDescription: creditRow ? getPreviewSheetDescription(creditRow) : "",
  };
}
