/**
 * Shared “Contract out” queue/state pill styling for every role and surface.
 */
export const CONTRACT_OUT_QUEUE_BADGE_CLASS =
  "border border-blue-200 bg-gradient-to-b from-blue-100 to-white text-blue-700 dark:bg-blue-950 dark:text-blue-200";

export function normalizeQueueBadgeLabel(label: string): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the label is explicitly Contract(s) Out (not generic “Contracted” alone). */
export function isContractOutQueueBadgeLabel(label: string): boolean {
  const n = normalizeQueueBadgeLabel(label);
  if (!n || n === "-") return false;
  if (n === "contract out" || n === "contracts out") return true;
  const compact = n.replace(/\s+/g, "");
  return compact === "contractout" || compact === "contractsout";
}

/** Contract workflow queue pill colors (pending → generated → sent → signed / cancelled). */
export function getContractWorkflowQueueBadgeClass(label: string): string | null {
  const compact = normalizeQueueBadgeLabel(label).replace(/\s+/g, "");

  if (compact === "contractpending") {
    return "border border-amber-200 bg-gradient-to-b from-amber-100 to-white text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  }
  if (compact === "contractgenerated") {
    return "border border-violet-200 bg-gradient-to-b from-violet-100 to-white text-violet-800 dark:bg-violet-950 dark:text-violet-200";
  }
  if (compact === "contractsent") {
    return "border border-sky-200 bg-gradient-to-b from-sky-100 to-white text-sky-800 dark:bg-sky-950 dark:text-sky-200";
  }
  if (compact === "contractcancelled" || compact === "contractcanceled") {
    return "border border-red-200 bg-gradient-to-b from-red-100 to-white text-red-700 dark:bg-red-950 dark:text-red-200";
  }
  if (isContractOutQueueBadgeLabel(label)) {
    return CONTRACT_OUT_QUEUE_BADGE_CLASS;
  }
  return null;
}
