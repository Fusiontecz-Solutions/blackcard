/**
 * Workflow stage rank for application list sorting (earlier pipeline = lower number).
 * Aligned with the application progress bar lifecycle, with New/Agent before Underwriter.
 */

const NEGATIVE_TOKENS = new Set([
    'declined',
    'rejected',
    'cancelled',
    'canceled',
    'contractcancelled',
    'contractcanceled',
]);

/** Lower = earlier in the deal pipeline. */
const TOKEN_TO_PIPELINE_RANK: Record<string, number> = {
    '': 40,
    new: 10,
    draft: 15,
    agent: 20,
    onhold: 25,
    pending: 10,
    submitted: 10,
    review: 30,
    underwriter: 40,
    underwriting: 40,
    inprogress: 40,
    finalunderwriter: 50,
    finalreview: 50,
    approved: 60,
    contracted: 70,
    contractpending: 70,
    contractgenerated: 72,
    contractsent: 74,
    contractout: 74,
    contractsout: 74,
    contractsigned: 80,
    signedcontracts: 80,
    final: 90,
    fundingcall: 100,
    disbursment: 110,
    disbursement: 110,
    funded: 120,
    completed: 120,
};

function normalizeWorkflowToken(value: string | null | undefined): string {
    return String(value ?? '')
        .trim()
        .replace(/[\s_-]+/g, '')
        .toLowerCase();
}

export function isNegativeWorkflowApplication(app: {
    currentQueue?: string | null;
    currentState?: string | null;
    status?: string | null;
}): boolean {
    const tokens = [
        normalizeWorkflowToken(app.currentQueue),
        normalizeWorkflowToken(app.currentState),
        normalizeWorkflowToken(app.status),
    ];
    return tokens.some((t) => NEGATIVE_TOKENS.has(t));
}

/**
 * Furthest pipeline stage implied by queue/state/status (same idea as the progress bar).
 */
export function workflowStageRankForApplication(app: {
    currentQueue?: string | null;
    currentState?: string | null;
    status?: string | null;
}): number {
    const tokens = [
        normalizeWorkflowToken(app.currentQueue),
        normalizeWorkflowToken(app.currentState),
        normalizeWorkflowToken(app.status),
    ];

    let rank = 0;
    for (const token of tokens) {
        const mapped = TOKEN_TO_PIPELINE_RANK[token];
        if (mapped != null && mapped > rank) {
            rank = mapped;
        }
    }
    return rank;
}

export function compareApplicationsByWorkflowStage<
    T extends {
        currentQueue?: string | null;
        currentState?: string | null;
        status?: string | null;
        applicationId?: number | null;
    },
>(a: T, b: T, sortOrder: 'asc' | 'desc'): number {
    const aNeg = isNegativeWorkflowApplication(a);
    const bNeg = isNegativeWorkflowApplication(b);
    if (aNeg && !bNeg) return 1;
    if (!aNeg && bNeg) return -1;
    if (aNeg && bNeg) {
        return (a.applicationId ?? 0) - (b.applicationId ?? 0);
    }

    const ra = workflowStageRankForApplication(a);
    const rb = workflowStageRankForApplication(b);
    if (ra !== rb) {
        return sortOrder === 'asc' ? ra - rb : rb - ra;
    }

    return (a.applicationId ?? 0) - (b.applicationId ?? 0);
}
