/**
 * Canonical application lifecycle used by the application-detail progress bar.
 *
 * The deal moves through these stages in order. We resolve the furthest-reached
 * stage from any of `currentQueue`, `currentState`, or `status`, so the bar
 * reflects real progress even when one field lags behind another.
 *
 * Declined / rejected / cancelled deals are surfaced as a terminal negative
 * state rather than a position on the happy path.
 */

export type ApplicationProgressStageKey =
  | "SCRUBBING"
  | "UNDERWRITER"
  | "APPROVED"
  | "FINAL_APPROVAL"
  | "CONTRACT_GENERATED"
  | "CONTRACT_SIGNED"
  | "FINAL_AND_FUNDING"
  | "DISBURSEMENT"
  | "FUNDED";

export interface ApplicationProgressStage {
  key: ApplicationProgressStageKey;
  label: string;
  /** Slightly longer description shown on hover / for screen readers. */
  description: string;
}

/** Ordered lifecycle. Index === progress position. */
export const APPLICATION_PROGRESS_STAGES: ApplicationProgressStage[] = [
  { key: "SCRUBBING", label: "Scrubbing", description: "Under review during scrubbing" },
  { key: "UNDERWRITER", label: "Underwriter", description: "Underwriter review" },
  { key: "APPROVED", label: "Approved", description: "Approved pending contract" },
  {
    key: "CONTRACT_GENERATED",
    label: "Contract Generated",
    description: "Contract has been generated",
  },
  {
    key: "CONTRACT_SIGNED",
    label: "Contract Signed",
    description: "Contract has been signed",
  },
  {
    key: "FINAL_AND_FUNDING",
    label: "Final & Funding",
    description: "Final review and funding call",
  },
  {
    key: "FINAL_APPROVAL",
    label: "Final Approval",
    description: "Awaiting underwriter final approval after funding call",
  },
  { key: "DISBURSEMENT", label: "Disbursement", description: "Funds being disbursed" },
  { key: "FUNDED", label: "Funded", description: "Deal funded and complete" },
];

const STAGE_INDEX_BY_KEY: Record<ApplicationProgressStageKey, number> =
  APPLICATION_PROGRESS_STAGES.reduce(
    (acc, stage, index) => {
      acc[stage.key] = index;
      return acc;
    },
    {} as Record<ApplicationProgressStageKey, number>,
  );

/** Strip spaces / underscores / dashes and lowercase for tolerant matching. */
function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

/** Tokens that mean the deal is dead (no longer on the happy path). */
const NEGATIVE_TOKENS = new Set([
  "declined",
  "rejected",
  "cancelled",
  "canceled",
  "contractcancelled",
  "contractcanceled",
]);

/** Maps a normalized queue/state/status token to its lifecycle index. */
const TOKEN_TO_INDEX: Record<string, number> = {
  // Intake / agent (no separate Agent step on the bar — earliest visible stage is Underwriting)
  "": STAGE_INDEX_BY_KEY.SCRUBBING,
  new: STAGE_INDEX_BY_KEY.SCRUBBING,
  agent: STAGE_INDEX_BY_KEY.SCRUBBING,
  onhold: STAGE_INDEX_BY_KEY.SCRUBBING,
  review: STAGE_INDEX_BY_KEY.SCRUBBING,
  draft: STAGE_INDEX_BY_KEY.SCRUBBING,
  pending: STAGE_INDEX_BY_KEY.SCRUBBING,
  submitted: STAGE_INDEX_BY_KEY.SCRUBBING,

  // Scrubbing
  scrubbing: STAGE_INDEX_BY_KEY.SCRUBBING,
  missingdocuments: STAGE_INDEX_BY_KEY.SCRUBBING,
  underwriting: STAGE_INDEX_BY_KEY.SCRUBBING,
  inprogress: STAGE_INDEX_BY_KEY.SCRUBBING,

  // Final scrubbing
  underwriter: STAGE_INDEX_BY_KEY.UNDERWRITER,
  finalreview: STAGE_INDEX_BY_KEY.UNDERWRITER,

  // Approved (incl. UW sign-off before ISO outreach)
  approved: STAGE_INDEX_BY_KEY.APPROVED,
  underwriterapproved: STAGE_INDEX_BY_KEY.APPROVED,
  approvedbyuw: STAGE_INDEX_BY_KEY.APPROVED,
  approvalsent: STAGE_INDEX_BY_KEY.APPROVED,
  isoapproved: STAGE_INDEX_BY_KEY.APPROVED,
  approvedbyiso: STAGE_INDEX_BY_KEY.APPROVED,

  // Final approval (underwriter second sign-off after contract — often sent from Funding Call)
  finalapproval: STAGE_INDEX_BY_KEY.FINAL_APPROVAL,

  // Contract generated (pending, sent, out, etc.)
  contracted: STAGE_INDEX_BY_KEY.CONTRACT_GENERATED,
  contractpending: STAGE_INDEX_BY_KEY.CONTRACT_GENERATED,
  contractgenerated: STAGE_INDEX_BY_KEY.CONTRACT_GENERATED,
  contractsent: STAGE_INDEX_BY_KEY.CONTRACT_GENERATED,
  contractout: STAGE_INDEX_BY_KEY.CONTRACT_GENERATED,
  contractsout: STAGE_INDEX_BY_KEY.CONTRACT_GENERATED,

  // Contract signed
  contractsigned: STAGE_INDEX_BY_KEY.CONTRACT_SIGNED,
  signedcontracts: STAGE_INDEX_BY_KEY.CONTRACT_SIGNED,

  // Underwriter granted final approval (post-contract; Funding Call or Decision Logic path)
  finalapprovedbyuw: STAGE_INDEX_BY_KEY.DISBURSEMENT,

  // Ops "Final" queue after UW final approval — past Final Approval on the bar
  final: STAGE_INDEX_BY_KEY.DISBURSEMENT,

  // Final & funding call (funding call tab / finals questions)
  fundingcall: STAGE_INDEX_BY_KEY.FINAL_AND_FUNDING,
  finalsandfundingcall: STAGE_INDEX_BY_KEY.FINAL_AND_FUNDING,

  // Disbursement
  disbursment: STAGE_INDEX_BY_KEY.DISBURSEMENT,
  disbursement: STAGE_INDEX_BY_KEY.DISBURSEMENT,

  // Funded
  funded: STAGE_INDEX_BY_KEY.FUNDED,
  completed: STAGE_INDEX_BY_KEY.FUNDED,
};

export interface ApplicationProgress {
  /** Index into {@link APPLICATION_PROGRESS_STAGES} of the current stage. */
  currentIndex: number;
  currentStageKey: ApplicationProgressStageKey;
  /** Human-readable label for the active stage. */
  currentStageLabel: string;
  /** Completion ratio across the bar (0–1). */
  ratio: number;
  /** Rounded percent complete (current stage counts toward progress). */
  percentComplete: number;
  /** Rounded percent remaining until funded. */
  percentRemaining: number;
  /** True when the deal was declined / rejected / cancelled. */
  isNegative: boolean;
  /** Label to show for a negative terminal state (e.g. "Declined"). */
  negativeLabel: string | null;
  /** Set while the deal is parked on its stage (e.g. "Missing Documents"). */
  holdLabel: string | null;
}

interface ResolveProgressInput {
  currentQueue?: string | null;
  queue?: string | null;
  currentState?: string | null;
  state?: string | null;
  statsCurrentState?: string | null;
  status?: string | null;
  /** "Approved By UW", "Final Approved by UW", etc. */
  underwriterAction?: string | null;
  finalApprovalSource?: string | null;
}

function indexForToken(token: string): number | null {
  if (token in TOKEN_TO_INDEX) return TOKEN_TO_INDEX[token];
  return null;
}

/**
 * Resolve the lifecycle position of an application. We take the furthest stage
 * implied by any workflow field so a lagging field never understates progress.
 */
export function resolveApplicationProgress(
  application: ResolveProgressInput | null | undefined,
): ApplicationProgress {
  const tokens = [
    normalizeToken(application?.currentQueue ?? application?.queue),
    normalizeToken(application?.currentState ?? application?.state),
    normalizeToken(application?.statsCurrentState),
    normalizeToken(application?.status),
    normalizeToken(application?.underwriterAction),
  ];

  const negativeToken = tokens.find((t) => NEGATIVE_TOKENS.has(t));
  const holdLabel = tokens.includes("missingdocuments") ? "Missing Documents" : null;
  const isNegative = Boolean(negativeToken);

  let currentIndex = 0;
  for (const token of tokens) {
    const idx = indexForToken(token);
    if (idx != null && idx > currentIndex) {
      currentIndex = idx;
    }
  }

  const stageCount = APPLICATION_PROGRESS_STAGES.length;
  const lastIndex = stageCount - 1;
  const ratio = lastIndex > 0 ? currentIndex / lastIndex : 0;
  const currentStageKey = APPLICATION_PROGRESS_STAGES[currentIndex]!.key;
  const currentStageLabel = APPLICATION_PROGRESS_STAGES[currentIndex]!.label;

  const percentComplete = isNegative
    ? 0
    : Math.round(((currentIndex + 1) / stageCount) * 100);
  const percentRemaining = isNegative ? 100 : 100 - percentComplete;

  return {
    currentIndex,
    currentStageKey,
    currentStageLabel,
    ratio,
    percentComplete,
    percentRemaining,
    isNegative,
    negativeLabel: isNegative
      ? negativeToken === "rejected"
        ? "Rejected"
        : negativeToken?.includes("cancel")
          ? "Cancelled"
          : "Declined"
      : null,
    holdLabel: isNegative ? null : holdLabel,
  };
}

