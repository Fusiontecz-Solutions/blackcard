import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type DeclineReasonInfoIconProps = {
  reasons: string[];
  /** Optional button class overrides (e.g. white icon on brand summary card). */
  className?: string;
  iconClassName?: string;
};

export default function DeclineReasonInfoIcon({
  reasons,
  className,
  iconClassName,
}: DeclineReasonInfoIconProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
            className,
          )}
          aria-label="View decline reason"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className={cn("h-3.5 w-3.5", iconClassName)} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs space-y-1 p-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
          Decline reason
        </p>
        {reasons.length > 0 ? (
          <ul className="space-y-0.5 text-xs">
            {reasons.map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs">No decline reason provided</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
