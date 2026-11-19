/** Next-action hints shown under deal-pipeline sidebar sub-items. */
export const SIDEBAR_PIPELINE_ACTION_HINTS: Partial<Record<string, string>> = {
  Contract_Signed: "Perform Decision Logic",
};

export type SidebarPipelineActionAccent = "contract-signed";

export function getSidebarPipelineActionHint(
  operationsStatus: string,
): string | null {
  return SIDEBAR_PIPELINE_ACTION_HINTS[operationsStatus] ?? null;
}

export function resolveSidebarPipelineActionAccent(
  operationsStatus: string,
): SidebarPipelineActionAccent | null {
  if (operationsStatus === "Contract_Signed") return "contract-signed";
  return null;
}

/** Bold action pill colors aligned with each pipeline stage accent. */
export function getSidebarPipelineActionBadgeClass(
  accent: SidebarPipelineActionAccent,
): string {
  switch (accent) {
    case "contract-signed":
      return [
        "bg-amber-100 text-amber-900",
        "dark:bg-amber-900/45 dark:text-amber-100",
      ].join(" ");
    default:
      return "bg-muted text-muted-foreground";
  }
}
