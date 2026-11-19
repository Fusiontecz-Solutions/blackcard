/**
 * Mirrors `in-house-crm-be/src/services/applicationStatsPredicates.ts` and SQL in
 * `applicationStatsService.ts`. Use raw DB state (`statsCurrentState` from API), not
 * workflow-mapped `currentState`, so dashboard charts match `/applications/stats`.
 */

export function compactQueueKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

/** Same as SQL: UPPER(REPLACE(TRIM(state), ' ', '_')) */
export function normalizeStateToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/ /g, "_")
    .toUpperCase();
}

export function isFundedForStats(
  currentQueue: string | null | undefined,
  currentState: string | null | undefined,
): boolean {
  const qc = compactQueueKey(currentQueue);
  const st = normalizeStateToken(currentState);
  const isDisbursementQueue =
    qc === "disbursement" || qc === "disbursment" || qc.includes("disburs");
  return (
    qc === "funded" ||
    isDisbursementQueue ||
    st === "FUNDED" ||
    st === "COMPLETED" ||
    (qc === "approved" && st === "COMPLETED")
  );
}

export function isRejectedForStats(currentQueue: string | null | undefined): boolean {
  return compactQueueKey(currentQueue) === "declined";
}

export function isApprovedForStats(
  currentQueue: string | null | undefined,
  currentState: string | null | undefined,
): boolean {
  if (isRejectedForStats(currentQueue)) return false;
  if (isFundedForStats(currentQueue, currentState)) return false;
  const qc = compactQueueKey(currentQueue);
  const st = normalizeStateToken(currentState);
  const stateLower = String(currentState ?? "").trim().toLowerCase();
  return (
    stateLower === "approved" ||
    st === "APPROVED" ||
    qc === "approved" ||
    qc === "contracted" ||
    qc === "contractpending" ||
    qc === "signedcontracts"
  );
}

/** Same exclusivity as SQL filters: rejected → funded → approved. */
export function classifyFundedApprovedRejected(
  currentQueue: string | null | undefined,
  currentState: string | null | undefined,
): "funded" | "approved" | "rejected" | null {
  if (isRejectedForStats(currentQueue)) return "rejected";
  if (isFundedForStats(currentQueue, currentState)) return "funded";
  if (isApprovedForStats(currentQueue, currentState)) return "approved";
  return null;
}
