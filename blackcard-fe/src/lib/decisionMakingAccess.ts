import { normalizeRoleKey } from "@/lib/sessionRole";

/** Roles that may edit offer values, bank analysis, and positions on the Decision Making tab. */
const DECISION_MAKING_EDITOR_ROLES = new Set([
  "SCRUBBING",
  "UNDERWRITER",
  "OPERATIONS",
  "SUPER_ADMIN",
  "SUPERADMIN",
]);

export function canRoleEditDecisionMakingTab(
  role: string | null | undefined,
): boolean {
  const roleKey = normalizeRoleKey(role ?? "");
  return DECISION_MAKING_EDITOR_ROLES.has(roleKey);
}
