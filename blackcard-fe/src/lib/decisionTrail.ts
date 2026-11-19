import {
  isScrubberApprovalRecommendation,
  isScrubberDeclineRecommendation,
} from "@/lib/scrubberDeclineReasons";
import { isPastApprovalStage } from "@/lib/applicationCurrentDecision";
import { UNDERWRITER_DECLINE_REASONS_NOTE_PREFIX } from "@/lib/scrubberDeclineReasonsDisplay";

export type DecisionTrailTone = "approved" | "declined" | "pending";
export type DecisionTrailStep = { role: string; label: string; tone: DecisionTrailTone };

const has = (value: string, re: RegExp) => re.test(value);

/**
 * Who decided what on a deal, in workflow order: the scrubber recommends, the
 * underwriter decides, and Super Admin makes the final call that goes to the ISO.
 */
export function resolveDecisionTrail(app: {
  scrubberRecommendation?: string | null;
  underwriterAction?: string | null;
  note?: string | null;
  currentQueue?: string | null;
  currentState?: string | null;
} | null | undefined): DecisionTrailStep[] {
  const action = String(app?.underwriterAction ?? "").trim().toLowerCase();
  const rec = app?.scrubberRecommendation ?? "";
  const underwriterDeclinedEarlier = String(app?.note ?? "")
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(UNDERWRITER_DECLINE_REASONS_NOTE_PREFIX));
  const adminDeclined = has(action, /decline by admin/);
  const adminApproved = !adminDeclined && isPastApprovalStage(app?.currentQueue, app?.currentState);

  const scrubber: DecisionTrailStep = has(action, /decline by scrubber/) || isScrubberDeclineRecommendation(rec)
    ? { role: "Scrubber", label: "Recommended Decline", tone: "declined" }
    : isScrubberApprovalRecommendation(rec)
      ? { role: "Scrubber", label: "Recommended Approval", tone: "approved" }
      : { role: "Scrubber", label: "Pending", tone: "pending" };

  const underwriter: DecisionTrailStep = has(action, /approved by uw/)
    ? { role: "Underwriter", label: "Approved", tone: "approved" }
    : has(action, /decline by uw/) || underwriterDeclinedEarlier
      ? { role: "Underwriter", label: "Declined", tone: "declined" }
      : adminApproved
        ? { role: "Underwriter", label: "Approved", tone: "approved" }
        : { role: "Underwriter", label: "Pending", tone: "pending" };

  const superAdmin: DecisionTrailStep = adminDeclined
    ? { role: "Super Admin", label: "Declined", tone: "declined" }
    : adminApproved
      ? { role: "Super Admin", label: "Approved", tone: "approved" }
      : { role: "Super Admin", label: "Pending", tone: "pending" };

  return [scrubber, underwriter, superAdmin];
}
