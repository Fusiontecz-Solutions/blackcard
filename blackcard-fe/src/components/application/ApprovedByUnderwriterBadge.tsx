import { formatApprovedByUnderwriterLabel } from "@/lib/underwriterApprovalLabel";
import { cn } from "@/lib/utils";
import type { Application } from "@/types/applicationTypes";

export const APPROVED_BY_UNDERWRITER_BADGE_CLASS =
    "inline-flex max-w-full items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-200";

type ApprovedByUnderwriterBadgeProps = {
    app: Pick<
        Application,
        | "approvedByUnderwriterId"
        | "approvedByUnderwriter"
        | "assignedUnderwriterId"
        | "assignedUnderwriter"
        | "claimedByUnderwriterId"
        | "claimedByUnderwriter"
    >;
    viewerUserId?: string | null;
    className?: string;
    fallback?: string;
};

export default function ApprovedByUnderwriterBadge({
    app,
    viewerUserId,
    className,
    fallback,
}: ApprovedByUnderwriterBadgeProps) {
    const name = formatApprovedByUnderwriterLabel(app, viewerUserId);
    const label = name ?? fallback;
    if (!label) return null;

    return (
        <span className={cn(APPROVED_BY_UNDERWRITER_BADGE_CLASS, "truncate", className)}>
            Approved by {label}
        </span>
    );
}
