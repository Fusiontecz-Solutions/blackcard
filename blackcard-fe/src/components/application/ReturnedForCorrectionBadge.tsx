import { cn } from "@/lib/utils";

export const RETURNED_FOR_CORRECTION_BADGE_CLASS =
  "inline-flex shrink-0 items-center rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-900 dark:bg-orange-950/50 dark:text-orange-200";

type ReturnedForCorrectionBadgeProps = {
  /** Set while the deal is back with the scrubber awaiting corrections. */
  returnedToScrubberAt?: string | Date | null;
  className?: string;
};

/** Visible "Returned" tag for deals an Underwriter sent back for correction. */
export default function ReturnedForCorrectionBadge({
  returnedToScrubberAt,
  className,
}: ReturnedForCorrectionBadgeProps) {
  if (!returnedToScrubberAt) return null;
  return (
    <span
      className={cn(RETURNED_FOR_CORRECTION_BADGE_CLASS, className)}
      title="The Underwriter sent this deal back to the scrubber for correction"
    >
      Returned
    </span>
  );
}
