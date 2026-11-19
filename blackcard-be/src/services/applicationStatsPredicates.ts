/**
 * Mirrors `applicationStatsService.ts` SQL (queueNorm / stateNorm / funded / approved / rejected).
 * Use for in-memory aggregation (e.g. admin dashboard charts) so behavior matches `/applications/stats`.
 */

export function compactQueueKey(value: unknown): string {
    return String(value ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, '')
        .toLowerCase();
}

/** Same as SQL: UPPER(REPLACE(TRIM(state), ' ', '_')) */
export function normalizeStateToken(value: unknown): string {
    return String(value ?? '')
        .trim()
        .replace(/ /g, '_')
        .toUpperCase();
}

export function isFundedForStats(
    currentQueue: string | null | undefined,
    currentState: string | null | undefined,
): boolean {
    const qc = compactQueueKey(currentQueue);
    const st = normalizeStateToken(currentState);
    return (
        qc === 'funded' ||
        st === 'FUNDED' ||
        st === 'COMPLETED' ||
        (qc === 'approved' && st === 'COMPLETED')
    );
}

/**
 * Commission history / funded-deals summary: include CRM-funded rows plus late payout pipeline
 * (often still in Disbursement or Funding Call — excluded from global “funded” stats).
 */
export function isFundedOrPayoutPipelineForCommissionHistory(
    currentQueue: string | null | undefined,
    currentState: string | null | undefined,
): boolean {
    if (isFundedForStats(currentQueue, currentState)) return true;
    const qc = compactQueueKey(currentQueue);
    return (
        qc === 'disbursement' ||
        qc === 'disbursment' ||
        qc === 'fundingcall' ||
        qc === 'signedcontracts'
    );
}

export function isRejectedForStats(currentQueue: string | null | undefined): boolean {
    return compactQueueKey(currentQueue) === 'declined';
}

export function isApprovedForStats(
    currentQueue: string | null | undefined,
    currentState: string | null | undefined,
): boolean {
    if (isRejectedForStats(currentQueue)) return false;
    if (isFundedForStats(currentQueue, currentState)) return false;
    const st = normalizeStateToken(currentState);
    const stateLower = String(currentState ?? '').trim().toLowerCase();
    return stateLower === 'approved' || st === 'APPROVED';
}

/** For trend buckets: rejected → funded → approved (same exclusivity as SQL filters). */
export function classifyFundedApprovedRejected(
    currentQueue: string | null | undefined,
    currentState: string | null | undefined,
): 'funded' | 'approved' | 'rejected' | null {
    if (isRejectedForStats(currentQueue)) return 'rejected';
    if (isFundedForStats(currentQueue, currentState)) return 'funded';
    if (isApprovedForStats(currentQueue, currentState)) return 'approved';
    return null;
}
