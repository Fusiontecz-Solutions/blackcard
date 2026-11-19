/**
 * Stage-aware role access for applications.
 *
 * Workflow:
 *   Agent  →  Scrubbing  →  Underwriter  →  (Post-final / Funded / etc.)
 *
 * Rule:
 *   When an application moves to the next stage, the previous-stage role can
 *   still SEE the deal in their list/detail but can only PREVIEW it (no edits
 *   or workflow actions). Operations / Admin / Super Admin / Accountant are
 *   never locked out by stage.
 */

import { normalizeRoleKey } from "./sessionRole";

export type ApplicationStageMode = "edit" | "preview";

/** Coarse pipeline buckets for queue/state strings. `null` = stage unknown / new draft. */
export type ApplicationStageKey =
  | "AGENT"
  | "SCRUBBING"
  | "UNDERWRITER"
  | "POST_FINAL";

export interface ApplicationStageAccess {
  mode: ApplicationStageMode;
  canEdit: boolean;
  isPreview: boolean;
  /** Short banner copy when the deal is preview-only for this role. */
  reason: string | null;
  /** Resolved stage of the application (best effort). */
  stageKey: ApplicationStageKey | null;
  /** Friendly label for the stage the deal has moved to. */
  nextStageLabel: string | null;
  /** Normalized role key used in the decision. */
  roleKey: string;
}

interface StageAccessOptions {
  role: string | null | undefined;
  currentQueue: string | null | undefined;
  currentState?: string | null | undefined;
  /** Optional: `?viewOnly=1` browse links always force preview, regardless of stage. */
  viewOnlyBrowse?: boolean;
  /** True when a scrubber may keep editing a recommended deal (see isScrubberPostRecommendEditable). */
  scrubberPostRecommendEditable?: boolean;
}

/**
 * After Recommend Approval the deal sits in the Underwriter queue. The scrubber who
 * claimed it may keep editing until an underwriter claims it or takes any action;
 * their edits show on the underwriter side as they are saved.
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
    String(application.claimedByUnderwriterId ?? "") === String(userId) &&
    !application.assignedUnderwriterId &&
    !String(application.underwriterAction ?? "").trim()
  );
}

const normalizeToken = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const AGENT_STAGE_TOKENS = new Set([
  "",
  "new",
  "agent",
  "onhold",
  "review",
  "draft",
]);

const UNDERWRITER_STAGE_TOKENS = new Set([
  "scrubbing",
  "underwriting",
]);

const FINAL_UNDERWRITER_STAGE_TOKENS = new Set([
  "underwriter",
  "finalreview",
  "finalscrubbing",
  "underwriterapproved",
  "finalapproval",
]);

const POST_FINAL_STAGE_TOKENS = new Set([
  "approved",
  "declined",
  "rejected",
  "contracted",
  "contractout",
  "contractsout",
  "contractsigned",
  "signedcontracts",
  "final",
  "fundingcall",
  "disbursment",
  "disbursement",
  "funded",
  "completed",
  "cancelled",
]);

const STAGE_FRIENDLY_LABEL: Record<ApplicationStageKey, string> = {
  AGENT: "Agent",
  SCRUBBING: "Scrubbing",
  UNDERWRITER: "Underwriter",
  POST_FINAL: "Operations",
};

/** Resolve which pipeline bucket an application is in (for timeline + preview rules). */
export function getApplicationPipelineStageKey(
  currentQueue: string | null | undefined,
  currentState?: string | null | undefined,
): ApplicationStageKey | null {
  const queueToken = normalizeToken(currentQueue);
  const stateToken = normalizeToken(currentState);

  // Queue drives stage. FU keeps queue "Underwriter" with state "Approved" after
  // sending approval mail (and while resending after ISO comments) — still FU-owned.
  if (POST_FINAL_STAGE_TOKENS.has(queueToken)) return "POST_FINAL";
  if (FINAL_UNDERWRITER_STAGE_TOKENS.has(queueToken)) return "UNDERWRITER";
  if (UNDERWRITER_STAGE_TOKENS.has(queueToken)) return "SCRUBBING";
  if (AGENT_STAGE_TOKENS.has(queueToken)) return "AGENT";

  // Some imports use `currentState` for the deal stage (e.g. "FINAL").
  if (POST_FINAL_STAGE_TOKENS.has(stateToken)) return "POST_FINAL";

  return null;
}

const STAGE_ORDER: Record<ApplicationStageKey, number> = {
  AGENT: 0,
  SCRUBBING: 1,
  UNDERWRITER: 2,
  POST_FINAL: 3,
};

const ROLE_OWNED_STAGE: Record<string, ApplicationStageKey> = {
  AGENT: "AGENT",
  SCRUBBING: "SCRUBBING",
  UNDERWRITER: "UNDERWRITER",
};

/**
 * @param options Application stage + the viewer's role.
 * @returns `mode: 'preview'` when the deal has moved past the viewer's owning
 * stage (workflow roles only). All non-workflow roles return `mode: 'edit'`.
 */
export function getApplicationStageAccess(
  options: StageAccessOptions,
): ApplicationStageAccess {
  const roleKey = normalizeRoleKey(options.role ?? "");
  const stageKey = getApplicationPipelineStageKey(
    options.currentQueue,
    options.currentState,
  );

  const baseEdit: ApplicationStageAccess = {
    mode: "edit",
    canEdit: true,
    isPreview: false,
    reason: null,
    stageKey,
    nextStageLabel: null,
    roleKey,
  };

  if (options.viewOnlyBrowse) {
    return {
      ...baseEdit,
      mode: "preview",
      canEdit: false,
      isPreview: true,
      reason: "Read-only browse view — actions and edits are disabled.",
    };
  }

  const ownedStage = ROLE_OWNED_STAGE[roleKey];
  if (!ownedStage) return baseEdit;
  if (!stageKey) return baseEdit;

  if (roleKey === "UNDERWRITER" && stageKey === "SCRUBBING") {
    return {
      ...baseEdit,
      mode: "preview",
      canEdit: false,
      isPreview: true,
      nextStageLabel: STAGE_FRIENDLY_LABEL.SCRUBBING,
      reason:
        "This deal is still in Scrubbing — view only. You cannot edit it until a scrubber sends it on, or you claim it first from Queue.",
    };
  }

  if (STAGE_ORDER[stageKey] <= STAGE_ORDER[ownedStage]) {
    return baseEdit;
  }

  if (
    roleKey === "SCRUBBING" &&
    stageKey === "UNDERWRITER" &&
    options.scrubberPostRecommendEditable
  ) {
    return baseEdit;
  }

  const nextLabel = STAGE_FRIENDLY_LABEL[stageKey];
  return {
    ...baseEdit,
    mode: "preview",
    canEdit: false,
    isPreview: true,
    nextStageLabel: nextLabel,
    reason: `This deal has moved to ${nextLabel} — preview only for your role.`,
  };
}

/** Convenience helper for an application-like object (queue/state on top-level fields). */
export function getStageAccessForApplication(
  application: {
    currentQueue?: string | null;
    currentState?: string | null;
    queue?: string | null;
    state?: string | null;
    claimedByUnderwriterId?: string | null;
    assignedUnderwriterId?: string | null;
    underwriterAction?: string | null;
  } | null
    | undefined,
  role: string | null | undefined,
  options?: { viewOnlyBrowse?: boolean; userId?: string | null },
): ApplicationStageAccess {
  return getApplicationStageAccess({
    role,
    currentQueue: application?.currentQueue ?? application?.queue,
    currentState: application?.currentState ?? application?.state,
    viewOnlyBrowse: options?.viewOnlyBrowse,
    scrubberPostRecommendEditable: isScrubberPostRecommendEditable(options?.userId, application),
  });
}
