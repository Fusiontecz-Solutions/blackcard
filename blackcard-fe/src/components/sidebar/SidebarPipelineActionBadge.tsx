import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  getSidebarPipelineActionBadgeClass,
  type SidebarPipelineActionAccent,
} from "@/lib/sidebarPipelineActionBadge";

type SidebarPipelineActionBadgeProps = {
  accent: SidebarPipelineActionAccent;
  children: ReactNode;
  className?: string;
};

/** Compact action pill shown beneath a pipeline sub-item label. */
export function SidebarPipelineActionBadge({
  accent,
  children,
  className,
}: SidebarPipelineActionBadgeProps) {
  return (
    <span
      className={cn(
        "sidebar-pipeline-action-badge inline-flex w-fit max-w-full rounded-full px-2.5 py-0.5",
        "text-[10px] font-bold leading-snug",
        getSidebarPipelineActionBadgeClass(accent),
        className,
      )}
    >
      {children}
    </span>
  );
}
