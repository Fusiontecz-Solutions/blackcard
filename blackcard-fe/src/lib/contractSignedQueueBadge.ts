import { normalizeQueueBadgeLabel } from "@/lib/contractOutQueueBadge";

/** Amber/orange pills for “Contract signed” / signed-contracts (matches ops stat card accent). */
export const CONTRACT_SIGNED_QUEUE_BADGE_CLASS =
  "border border-amber-200 bg-gradient-to-b from-amber-100 to-white text-amber-800 dark:bg-amber-950 dark:text-amber-200";

/** True when the label is explicitly contract-signed / signed-contracts (not generic “Contracted”). */
export function isContractSignedQueueBadgeLabel(label: string): boolean {
  const n = normalizeQueueBadgeLabel(label);
  if (!n || n === "-") return false;
  if (n === "contract signed" || n === "signed contracts") return true;
  const compact = n.replace(/\s+/g, "");
  return compact === "contractsigned" || compact === "signedcontracts";
}
