/** Underwriter sidebar pipeline filters — must match backend `underwriterPipelineFilter`. */
export const UNDERWRITER_PIPELINE_FILTERS = {
  /** Underwriter queue — available to claim. */
  UNCLAIMED: "unclaimed",
  CLAIMED: "claimed",
  APPROVED_BY_UW: "approved-by-uw",
  DECLINED_BY_UW: "declined-by-uw",
  /** Hard declines by Super Admin / Admin / Operations. */
  DECLINED_BY_ADMIN: "declined-by-admin",
  FINAL_APPROVAL: "final-approval",
  FINAL_APPROVED_BY_UW: "final-approved-by-uw",
  ISO_QUERY: "iso-query",
  ON_HOLD: "on-hold",
  /** Scrubber My Deals — claimed deals the Underwriter approved. */
  SCRUBBER_APPROVED: "scrubber-approved",
  /** Scrubber My Deals — claimed deals that were declined. */
  SCRUBBER_DECLINED: "scrubber-declined",
} as const;

const SCRUBBER_FILTERS = new Set<string>([
  UNDERWRITER_PIPELINE_FILTERS.SCRUBBER_APPROVED,
  UNDERWRITER_PIPELINE_FILTERS.SCRUBBER_DECLINED,
]);

export function isScrubberPipelineFilter(value: string | null | undefined): boolean {
  return Boolean(value) && SCRUBBER_FILTERS.has(value as string);
}

export type UnderwriterPipelineFilter =
  (typeof UNDERWRITER_PIPELINE_FILTERS)[keyof typeof UNDERWRITER_PIPELINE_FILTERS];

const ALLOWED = new Set<string>(Object.values(UNDERWRITER_PIPELINE_FILTERS));

export function normalizeUnderwriterPipelineParam(
  raw: string | null | undefined,
): UnderwriterPipelineFilter | undefined {
  if (!raw?.trim()) return undefined;
  const value = raw.trim().toLowerCase();
  return ALLOWED.has(value) ? (value as UnderwriterPipelineFilter) : undefined;
}

export function underwriterPipelineTitle(
  pipeline: UnderwriterPipelineFilter,
): string {
  switch (pipeline) {
    case UNDERWRITER_PIPELINE_FILTERS.CLAIMED:
      return "Claimed Submissions";
    case UNDERWRITER_PIPELINE_FILTERS.APPROVED_BY_UW:
      return "Approved";
    case UNDERWRITER_PIPELINE_FILTERS.DECLINED_BY_UW:
      return "Decline";
    case UNDERWRITER_PIPELINE_FILTERS.FINAL_APPROVAL:
      return "Admin Sent for final Approval";
    case UNDERWRITER_PIPELINE_FILTERS.FINAL_APPROVED_BY_UW:
      return "Final Approved";
    case UNDERWRITER_PIPELINE_FILTERS.ISO_QUERY:
      return "ISO Query";
    case UNDERWRITER_PIPELINE_FILTERS.ON_HOLD:
      return "On Hold";
    case UNDERWRITER_PIPELINE_FILTERS.SCRUBBER_APPROVED:
      return "My Deals - Approved";
    case UNDERWRITER_PIPELINE_FILTERS.SCRUBBER_DECLINED:
      return "My Deals - Declined";
    default:
      return "Submissions";
  }
}

export type UnderwriterPipelineCounts = Partial<Record<UnderwriterPipelineFilter, number>>;
