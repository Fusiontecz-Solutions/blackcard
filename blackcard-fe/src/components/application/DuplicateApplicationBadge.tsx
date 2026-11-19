import { cn } from "@/lib/utils";

export const DUPLICATE_APPLICATION_BADGE_CLASS =
  "inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-gradient-to-b from-amber-100 to-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";

type DuplicateApplicationBadgeProps = {
  isDuplicate?: boolean | null;
  className?: string;
};

/** Visible "Duplicate" tag for deals that share EIN or SSN with another application. */
export default function DuplicateApplicationBadge({
  isDuplicate,
  className,
}: DuplicateApplicationBadgeProps) {
  if (!isDuplicate) return null;
  return (
    <span
      className={cn(DUPLICATE_APPLICATION_BADGE_CLASS, className)}
      title="Another application shares this EIN or SSN"
    >
      Duplicate
    </span>
  );
}
