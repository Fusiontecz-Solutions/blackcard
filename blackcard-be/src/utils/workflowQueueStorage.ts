/**
 * Canonical `Application.currentQueue` values after the stage rename:
 *   first review stage  → Scrubbing  (was Underwriter / Underwriting)
 *   final review stage  → Underwriter (was Final Underwriter / Final Review)
 */
export const CANONICAL_WORKFLOW_QUEUES = {
    AGENT: 'Agent',
    SCRUBBING: 'Scrubbing',
    UNDERWRITER: 'Underwriter',
} as const;

const normalizeToken = (value: unknown): string =>
    String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');

/**
 * Map legacy queue labels to canonical DB values on write.
 * Accepts historical aliases; always persists Scrubbing or Underwriter for UW stages.
 */
export function normalizeStoredWorkflowQueue(value: string | null | undefined): string | undefined {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    if (!trimmed) return undefined;

    switch (normalizeToken(trimmed)) {
        case 'UNDERWRITING':
            return CANONICAL_WORKFLOW_QUEUES.SCRUBBING;
        case 'FINAL_REVIEW':
        case 'FINAL_UNDERWRITER':
            return CANONICAL_WORKFLOW_QUEUES.UNDERWRITER;
        default:
            return trimmed;
    }
}

/**
 * Map legacy `currentState` stage markers to canonical values on write.
 * Most states (Pending, In Progress, Approved, …) pass through unchanged.
 */
export function normalizeStoredWorkflowState(
    value: string | null | undefined,
    queue?: string | null,
): string | undefined {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    if (!trimmed) return undefined;

    const stateToken = normalizeToken(trimmed);
    const queueToken = normalizeToken(queue ?? '');

    switch (stateToken) {
        case 'UNDERWRITING':
            return CANONICAL_WORKFLOW_QUEUES.SCRUBBING;
        case 'FINAL_REVIEW':
        case 'FINAL_UNDERWRITER':
            return CANONICAL_WORKFLOW_QUEUES.UNDERWRITER;
        case 'UNDERWRITER':
            if (queueToken === 'SCRUBBING' || queueToken === 'UNDERWRITING') {
                return CANONICAL_WORKFLOW_QUEUES.SCRUBBING;
            }
            return trimmed;
        default:
            return trimmed;
    }
}

/** Whether a queue token targets the first review stage (Scrubbing). */
export function isScrubbingQueueTarget(value: unknown): boolean {
    const token = normalizeToken(value);
    return token === 'SCRUBBING' || token === 'UNDERWRITING';
}

/** Whether a queue token targets the final review stage (Underwriter). */
export function isFinalUnderwriterQueueTarget(value: unknown): boolean {
    const token = normalizeToken(value);
    return token === 'UNDERWRITER' || token === 'FINAL_REVIEW' || token === 'FINAL_UNDERWRITER';
}
