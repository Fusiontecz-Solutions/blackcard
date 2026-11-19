import type { Application } from "@/types/applicationTypes";
import {
  canViewApplicationClaimAssignments,
  formatScrubberClaimLabel,
  formatUnderwriterClaimLabel,
} from "@/lib/applicationClaimLabel";
import { normalizeRoleKey, resolveEffectiveRole } from "@/lib/sessionRole";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";

type ApplicationClaimAssignmentsProps = {
  app: Pick<
    Application,
    | "claimedByUnderwriterId"
    | "claimedByUnderwriter"
    | "assignedUnderwriterId"
    | "assignedUnderwriter"
  >;
  /** `summary` — white text on brand gradient; `panel` — default foreground on cards. */
  variant?: "summary" | "panel" | "inline";
  className?: string;
};

export default function ApplicationClaimAssignments({
  app,
  variant = "panel",
  className = "",
}: ApplicationClaimAssignmentsProps) {
  const loginUser = useSelector((state: RootState) => state.login.data?.user);
  const roleKey = normalizeRoleKey(resolveEffectiveRole(loginUser));

  if (!canViewApplicationClaimAssignments(roleKey)) return null;

  const scrubber = formatScrubberClaimLabel(app);
  const underwriter = formatUnderwriterClaimLabel(app);

  const labelClass =
    variant === "summary"
      ? "text-sm font-medium opacity-90 mb-1"
      : "text-xs font-medium text-muted-foreground mb-0.5";
  const valueClass =
    variant === "summary"
      ? "text-base font-semibold"
      : "text-sm font-medium text-foreground";
  const wrapClass =
    variant === "inline"
      ? `flex flex-wrap items-center gap-x-4 gap-y-1 text-sm ${className}`
      : variant === "summary"
        ? `mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg p-4 shadow-md dark:shadow-lg bg-white/10 border border-white/15 ${className}`
        : `grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 ${className}`;

  if (variant === "inline") {
    return (
      <div className={wrapClass}>
        <span className="text-foreground">
          <span className="text-muted-foreground">Scrubber: </span>
          {scrubber}
        </span>
        <span className="text-foreground">
          <span className="text-muted-foreground">Underwriter: </span>
          {underwriter}
        </span>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <div className={variant === "summary" ? "text-white" : undefined}>
        <p className={labelClass}>Claimed by Scrubber</p>
        <p className={valueClass} title={scrubber}>
          {scrubber}
        </p>
      </div>
      <div className={variant === "summary" ? "text-white" : undefined}>
        <p className={labelClass}>Claimed by Underwriter</p>
        <p className={valueClass} title={underwriter}>
          {underwriter}
        </p>
      </div>
    </div>
  );
}
