/** Normalize Decision Logic API payload to an array of report detail rows. */
export function normalizeDecisionLogicReportRows(
  reportsDetails: unknown,
): Record<string, unknown>[] {
  if (Array.isArray(reportsDetails)) {
    return reportsDetails.filter(
      (row): row is Record<string, unknown> =>
        row != null && typeof row === 'object' && !Array.isArray(row),
    );
  }
  if (reportsDetails && typeof reportsDetails === 'object') {
    return [reportsDetails as Record<string, unknown>];
  }
  return [];
}

export function pickBestDecisionLogicReportRow(
  reportsDetails: unknown,
): Record<string, unknown> | null {
  const rows = normalizeDecisionLogicReportRows(reportsDetails);
  if (!rows.length) return null;
  const checking = rows.find(
    (row) =>
      String(row.accountType ?? '')
        .trim()
        .toUpperCase() === 'CHECKING',
  );
  return checking ?? rows[0] ?? null;
}

/** True when Decision Logic finished bank login and returned account data. */
export function isDecisionLogicReportRowComplete(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row) return false;

  if (row.isCompleted === true) return true;

  const status = String(row.statusText ?? '')
    .trim()
    .toLowerCase();
  if (status) {
    if (
      status.includes('not completed') ||
      status.includes('not started') ||
      status.includes('in progress') ||
      status.includes('pending')
    ) {
      return false;
    }
    if (status.includes('completed') || status === 'complete') {
      return true;
    }
    if (
      status.includes('success') ||
      status.includes('shared') ||
      status.includes('authorized')
    ) {
      return true;
    }
  }

  const nameFound = String(row.nameFound ?? '').trim();
  const accountNumberFound = String(row.accountNumberFound ?? '').trim();
  const hasTransactions =
    parseJsonArray(row.transactionSummaries).length > 0 ||
    parseJsonArray(row.transactionAnalysisSummaries).length > 0;

  return Boolean(
    (nameFound || accountNumberFound) &&
      (hasTransactions ||
        Number(row.totalCredits) > 0 ||
        Number(row.totalDebits) > 0 ||
        Number(row.currentBalance) !== 0),
  );
}

export function isDecisionLogicReportsDetailsComplete(
  reportsDetails: unknown,
): boolean {
  const rows = normalizeDecisionLogicReportRows(reportsDetails);
  if (!rows.length) return false;
  return rows.some((row) => isDecisionLogicReportRowComplete(row));
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export const DECISION_LOGIC_REPORT_NOT_COMPLETE_MESSAGE =
  'Decision Logic verification is not complete yet. The customer must finish bank login in the widget before the full report is available.';
