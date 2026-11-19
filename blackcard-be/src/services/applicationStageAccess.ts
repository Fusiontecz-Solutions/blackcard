/**
 * Stage-aware role access for applications (server side).
 *
 * Mirrors `FE/src/lib/applicationStageAccess.ts` so a workflow role (Agent /
 * Scrubbing / Underwriter) can SEE deals that have advanced past their
 * stage but cannot mutate them ΓÇö they appear as preview only.
 *
 * Non-workflow roles (Operations, Admin, Super Admin, Accountant, etc.) are
 * never locked out by stage and bypass the preview guard entirely.
 */

import type { AuthenticatedUser } from './applicationService';

export type ApplicationStageMode = 'edit' | 'preview';

export type ApplicationStageKey =
    | 'AGENT'
    | 'SCRUBBING'
    | 'UNDERWRITER'
    | 'POST_FINAL';

export interface ApplicationStageAccess {
    mode: ApplicationStageMode;
    canEdit: boolean;
    isPreview: boolean;
    reason: string | null;
    stageKey: ApplicationStageKey | null;
    nextStageLabel: string | null;
    roleKey: string;
}

const normalizeToken = (value: unknown): string =>
    String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');

const normalizeRoleKey = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    let key = raw.toUpperCase().replace(/\s+/g, '_');
    if (key === 'FINALUNDERWRITER') key = 'UNDERWRITER';
    if (key === 'SUPERADMIN') key = 'SUPER_ADMIN';
    return key;
};

const AGENT_STAGE_TOKENS = new Set([
    '',
    'new',
    'agent',
    'onhold',
    'review',
    'draft',
]);

const UNDERWRITER_STAGE_TOKENS = new Set(['scrubbing', 'underwriting']);

const FINAL_UNDERWRITER_STAGE_TOKENS = new Set([
    'underwriter',
    'finalreview',
]);

const POST_FINAL_STAGE_TOKENS = new Set([
    'approved',
    'declined',
    'rejected',
    'contracted',
    'contractout',
    'contractsout',
    'contractsigned',
    'signedcontracts',
    'final',
    'fundingcall',
    'disbursment',
    'disbursement',
    'funded',
    'completed',
    'cancelled',
]);

const STAGE_FRIENDLY_LABEL: Record<ApplicationStageKey, string> = {
    AGENT: 'Agent',
    SCRUBBING: 'Scrubbing',
    UNDERWRITER: 'Underwriter',
    POST_FINAL: 'Operations',
};

const STAGE_ORDER: Record<ApplicationStageKey, number> = {
    AGENT: 0,
    SCRUBBING: 1,
    UNDERWRITER: 2,
    POST_FINAL: 3,
};

const ROLE_OWNED_STAGE: Record<string, ApplicationStageKey> = {
    AGENT: 'AGENT',
    SCRUBBING: 'SCRUBBING',
    UNDERWRITER: 'UNDERWRITER',
};

function resolveStageKey(
    currentQueue: string | null | undefined,
    currentState?: string | null | undefined,
): ApplicationStageKey | null {
    const queueToken = normalizeToken(currentQueue);
    const stateToken = normalizeToken(currentState);

    // Queue drives stage. FU keeps queue "Underwriter" with state "Approved" after
    // sending approval mail (and while resending after ISO comments) ΓÇö still FU-owned.
    if (POST_FINAL_STAGE_TOKENS.has(queueToken)) return 'POST_FINAL';
    if (FINAL_UNDERWRITER_STAGE_TOKENS.has(queueToken)) return 'UNDERWRITER';
    if (UNDERWRITER_STAGE_TOKENS.has(queueToken)) return 'SCRUBBING';
    if (AGENT_STAGE_TOKENS.has(queueToken)) return 'AGENT';

    if (POST_FINAL_STAGE_TOKENS.has(stateToken)) return 'POST_FINAL';
    return null;
}

export interface StageAccessInput {
    role: string | null | undefined;
    currentQueue: string | null | undefined;
    currentState?: string | null | undefined;
    /** True when a scrubber may keep editing a recommended deal (see isScrubberPostRecommendEditable). */
    scrubberPostRecommendEditable?: boolean;
}

/**
 * After Recommend Approval the deal sits in the Underwriter queue. The scrubber who
 * claimed it may keep editing until an underwriter claims it or takes any action.
 */
export function isScrubberPostRecommendEditable(
    userId: string | null | undefined,
    application:
        | {
            claimedByUnderwriterId?: string | null;
            assignedUnderwriterId?: string | null;
            underwriterAction?: string | null;
        }
        | null
        | undefined,
): boolean {
    if (!userId || !application) return false;
    return (
        String(application.claimedByUnderwriterId ?? '') === String(userId) &&
        !application.assignedUnderwriterId &&
        !String(application.underwriterAction ?? '').trim()
    );
}

export function getApplicationStageAccess(
    input: StageAccessInput,
): ApplicationStageAccess {
    const roleKey = normalizeRoleKey(input.role);
    const stageKey = resolveStageKey(input.currentQueue, input.currentState);

    const baseEdit: ApplicationStageAccess = {
        mode: 'edit',
        canEdit: true,
        isPreview: false,
        reason: null,
        stageKey,
        nextStageLabel: null,
        roleKey,
    };

    const ownedStage = ROLE_OWNED_STAGE[roleKey];
    if (!ownedStage) return baseEdit;
    if (!stageKey) return baseEdit;

    if (roleKey === 'UNDERWRITER' && stageKey === 'SCRUBBING') {
        return {
            ...baseEdit,
            mode: 'preview',
            canEdit: false,
            isPreview: true,
            nextStageLabel: STAGE_FRIENDLY_LABEL.SCRUBBING,
            reason:
                'This deal is still in Scrubbing — view only. You cannot edit it until a scrubber sends it on, or you claim it first from Queue.',
        };
    }

    if (STAGE_ORDER[stageKey] <= STAGE_ORDER[ownedStage]) {
        return baseEdit;
    }

    if (
        roleKey === 'SCRUBBING' &&
        stageKey === 'UNDERWRITER' &&
        input.scrubberPostRecommendEditable
    ) {
        return baseEdit;
    }

    const nextLabel = STAGE_FRIENDLY_LABEL[stageKey];
    return {
        ...baseEdit,
        mode: 'preview',
        canEdit: false,
        isPreview: true,
        nextStageLabel: nextLabel,
        reason: `This deal has moved to ${nextLabel} ΓÇö preview only for your role.`,
    };
}

/**
 * Resolves stage access for a given user against an application record.
 * Accepts an arbitrary application-like object (Prisma row or mapped DTO).
 */
export function getApplicationStageAccessForUser(
    user: AuthenticatedUser | null | undefined,
    application:
        | {
            currentQueue?: string | null;
            currentState?: string | null;
            claimedByUnderwriterId?: string | null;
            assignedUnderwriterId?: string | null;
            underwriterAction?: string | null;
        }
        | null
        | undefined,
): ApplicationStageAccess {
    return getApplicationStageAccess({
        role: user?.role,
        currentQueue: application?.currentQueue ?? null,
        currentState: application?.currentState ?? null,
        scrubberPostRecommendEditable: isScrubberPostRecommendEditable(user?.id, application),
    });
}
