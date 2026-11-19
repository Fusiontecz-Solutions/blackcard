/**
 * Scrubber "Recommend Decline" reasons — stored on
 * `Application.scrubberRecommendation` as:
 *   Recommend Decline: Reason A; Reason B
 * (also accepts legacy `|||` delimited encoding).
 */

export const SCRUBBER_DECLINE_REASONS_DELIMITER = "|||";

/** Full reason list for recommend-decline (scrubber → underwriter handoff). */
export const SCRUBBER_RECOMMEND_DECLINE_REASON_OPTIONS = [
  "Low Average Daily Balance",
  "Excessive Negative Balance Days",
  "Bounced Payments",
  "Excessive ACH Returns",
  "Excessive Overdraft Fees",
  "Insufficient Revenue",
  "Insufficient Revenue (Construction)",
  "Insufficient Revenue (Trucking)",
  "No Active MCA Position",
  "Insufficient MCA History",
  "Delinquent on Reverse Consolidation",
  "Over-Leveraged",
  "Recovery Activity on File",
  "Recent Default",
  "Active Settlement",
  "Delinquent on Recent Fundings",
  "Insufficient Recent Funding",
  "Position Behind Non-Reputable Funder",
  "Excessive NSF Occurrences",
  "First Position Not Eligible",
] as const;

export const SCRUBBER_RECOMMEND_DECLINE_LABEL = "Recommend Decline";
export const SCRUBBER_RECOMMEND_APPROVAL_LABEL = "Recommend Approval";

export function encodeScrubberDeclineRecommendation(
  reasons: string[],
): string {
  const cleaned = reasons.map((r) => String(r).trim()).filter(Boolean);
  if (cleaned.length === 0) return SCRUBBER_RECOMMEND_DECLINE_LABEL;
  // Human-readable form survives most CRM string columns and list UIs.
  return `${SCRUBBER_RECOMMEND_DECLINE_LABEL}: ${cleaned.join("; ")}`;
}

export function isScrubberDeclineRecommendation(
  value: string | null | undefined,
): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const head =
    raw.split(SCRUBBER_DECLINE_REASONS_DELIMITER)[0]?.trim() ?? raw;
  return /recommend\s+decline/i.test(head);
}

export function isScrubberApprovalRecommendation(
  value: string | null | undefined,
): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  return /recommend\s+approval/i.test(raw);
}

/** Display badge label (Approve / Decline) without reason payload. */
export function formatScrubberRecommendationBadgeLabel(
  value: string | null | undefined,
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (isScrubberDeclineRecommendation(raw)) return "Decline";
  if (isScrubberApprovalRecommendation(raw)) return "Approve";
  return raw;
}

function splitReasonList(raw: string): string[] {
  return raw
    .split(/\s*;\s*|\s*\|\|\|\s*/)
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Reasons selected during Recommend Decline.
 * Prefers an explicit `scrubberDeclineReasons` field when present.
 */
export function parseScrubberDeclineReasons(
  scrubberRecommendation?: string | null,
  scrubberDeclineReasons?: string | null | string[],
): string[] {
  if (Array.isArray(scrubberDeclineReasons)) {
    return scrubberDeclineReasons.map((r) => String(r).trim()).filter(Boolean);
  }
  const fromField = String(scrubberDeclineReasons ?? "").trim();
  if (fromField) {
    return splitReasonList(fromField);
  }

  const encoded = String(scrubberRecommendation ?? "").trim();
  if (!encoded || !isScrubberDeclineRecommendation(encoded)) return [];

  // Legacy: Recommend Decline|||A|||B
  if (encoded.includes(SCRUBBER_DECLINE_REASONS_DELIMITER)) {
    const parts = encoded
      .split(SCRUBBER_DECLINE_REASONS_DELIMITER)
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.slice(1);
  }

  // Current: Recommend Decline: A; B
  const colonIdx = encoded.search(/:\s*/);
  if (colonIdx >= 0) {
    const after = encoded.slice(colonIdx + 1).trim();
    if (after) return splitReasonList(after);
  }

  // Fallback: Recommend Decline — A; B
  const dashMatch = encoded.match(/recommend\s+decline\s*[—–-]\s*(.+)$/i);
  if (dashMatch?.[1]) return splitReasonList(dashMatch[1]);

  return [];
}
