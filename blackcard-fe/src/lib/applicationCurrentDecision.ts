import type { Application } from "@/types/applicationTypes";
import {
  formatScrubberRecommendationBadgeLabel,
  isScrubberDeclineRecommendation,
} from "@/lib/scrubberDeclineReasons";

/** Stage that produced the decision shown in the "Current Decision" column. */
export type ApplicationDecisionStage = "underwriter" | "offer" | "scrubber";

export type ApplicationDecisionTone = "approved" | "declined" | "neutral";

export interface ApplicationCurrentDecision {
  label: string;
  tone: ApplicationDecisionTone;
  stage: ApplicationDecisionStage;
  /** Whether the decline-reason info icon should be offered next to the badge. */
  isDecline: boolean;
}

const STAGE_TITLE: Record<ApplicationDecisionStage, string> = {
  underwriter: "Underwriter decision",
  offer: "Offer decision",
  scrubber: "Scrubber recommendation",
};

/** Human hint for the badge `title` so a Super Admin can tell which stage decided. */
export function applicationDecisionStageTitle(
  stage: ApplicationDecisionStage,
): string {
  return STAGE_TITLE[stage];
}

const toneFromLabel = (value: string): ApplicationDecisionTone => {
  if (/declin|reject/i.test(value)) return "declined";
  if (/approv/i.test(value)) return "approved";
  return "neutral";
};

/** `OfferDecision.decision` is persisted lowercase ("approved" / "declined"). */
const formatOfferDecisionLabel = (value: string): string => {
  const raw = value.trim();
  if (!raw) return "";
  if (/^declin/i.test(raw)) return "Declined";
  if (/^approv/i.test(raw)) return "Approved";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const PAST_APPROVAL_STAGES = new Set([
  "approved",
  "approvalsent",
  "isoapproved",
  "approvedbyiso",
  "underwriterapproved",
  "finalapproval",
  "contracted",
  "contractgenerated",
  "contractout",
  "contractsout",
  "contractsent",
  "contractsigned",
  "signedcontracts",
  "fundingcall",
  "disbursment",
  "disbursement",
  "funded",
  "final",
]);

const compactStage = (value: string | null | undefined): string =>
  String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** True when the deal's queue/state is at Approval Sent or any later stage. */
export function isPastApprovalStage(
  queue: string | null | undefined,
  state: string | null | undefined,
): boolean {
  return (
    PAST_APPROVAL_STAGES.has(compactStage(queue)) ||
    PAST_APPROVAL_STAGES.has(compactStage(state))
  );
}

/**
 * Latest decision recorded on a deal, whichever stage produced it:
 * `underwriterAction` → `OfferDecision.decision` → `scrubberRecommendation`.
 * Returns `null` when no stage has decided yet (column renders "-").
 */
export function resolveApplicationCurrentDecision(
  app: (Pick<
    Application,
    "underwriterAction" | "OfferDecision" | "scrubberRecommendation"
  > & {
    currentQueue?: string | null;
    currentState?: string | null;
  }) | null | undefined,
): ApplicationCurrentDecision | null {
  if (!app) return null;

  const underwriterAction = String(app.underwriterAction ?? "").trim();
  // A deal declined earlier and later approved can still carry the old decline
  // label; once it sits in an approved-or-later stage, the stage is the truth.
  if (
    /declin|reject/i.test(underwriterAction) &&
    isPastApprovalStage(app.currentQueue, app.currentState)
  ) {
    return {
      label: "Approved",
      tone: "approved",
      stage: "underwriter",
      isDecline: false,
    };
  }
  if (underwriterAction) {
    return {
      label: underwriterAction,
      tone: toneFromLabel(underwriterAction),
      stage: "underwriter",
      isDecline: /declin|reject/i.test(underwriterAction),
    };
  }

  const offerDecision = String(app.OfferDecision?.decision ?? "").trim();
  if (offerDecision) {
    const label = formatOfferDecisionLabel(offerDecision);
    return {
      label,
      tone: toneFromLabel(label),
      stage: "offer",
      isDecline: /declin|reject/i.test(label),
    };
  }

  const recommendation = String(app.scrubberRecommendation ?? "").trim();
  if (recommendation) {
    const label =
      formatScrubberRecommendationBadgeLabel(recommendation) || recommendation;
    return {
      label,
      tone: toneFromLabel(label),
      stage: "scrubber",
      isDecline: isScrubberDeclineRecommendation(recommendation),
    };
  }

  return null;
}

/** Sort/search value for the column; empty string when undecided. */
export function applicationCurrentDecisionSortValue(
  app: Parameters<typeof resolveApplicationCurrentDecision>[0],
): string {
  return resolveApplicationCurrentDecision(app)?.label ?? "";
}

export function applicationDecisionToneClass(
  tone: ApplicationDecisionTone,
): string {
  if (tone === "approved") {
    return "border border-green-200 bg-gradient-to-b from-green-100 to-white text-green-700 dark:bg-green-900/40 dark:text-green-300";
  }
  if (tone === "declined") {
    return "border border-red-200 bg-gradient-to-b from-red-100 to-white text-red-700 dark:bg-red-900/40 dark:text-red-300";
  }
  return "bg-muted/60 text-foreground";
}
