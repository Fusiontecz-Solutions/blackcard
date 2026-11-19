import { normalizeRoleKey } from "@/lib/sessionRole";

export function isAgentRole(role: string | null | undefined): boolean {
  return normalizeRoleKey(role ?? "") === "AGENT";
}

/** Paths agents must not open (bookmark / typed URL). */
const AGENT_BLOCKED_PATH_SNIPPETS = [
  "/create-terms-offer",
  "/edit-terms-offer",
  "/view-terms-offer",
  "/create-position",
  "/edit-position",
  "/view-position",
  "/applications/browse",
  "/deal-pipeline",
  "/reports",
  "/commission-portal",
  "/commission-tracking",
  "/team-chat",
  "/gmail",
  "/payments",
  "/agents",
  "/scrubbing",
  "/underwriters",
  "/syndicators",
  "/case-management",
  "/cases-dashboard",
  "/cases",
  "/deals",
  "/letter-generator",
  "/operations-applications",
  "/activity-logs",
] as const;

const AGENT_ALLOWED_EXACT = new Set([
  "/",
  "/applications",
  "/clients",
  "/create-clients",
  "/create-applications",
  "/notifications",
  "/user-setting",
  "/template/playground",
]);

const AGENT_ALLOWED_PREFIXES = [
  "/applications/",
  "/application-details/",
  "/create-clients/",
  "/create-applications/",
] as const;

/** Tab ids on application detail — agents only see these. */
export const AGENT_APPLICATION_TAB_IDS = new Set(["overview", "documents"]);

export function isAgentAllowedPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";

  for (const snippet of AGENT_BLOCKED_PATH_SNIPPETS) {
    if (path.includes(snippet)) return false;
  }

  if (path === "/settings" || path.startsWith("/settings/")) return false;

  if (AGENT_ALLOWED_EXACT.has(path)) return true;

  return AGENT_ALLOWED_PREFIXES.some(
    (prefix) => path.startsWith(prefix) && path.length > prefix.length,
  );
}

export function isAgentAllowedApplicationTab(tabId: string | null | undefined): boolean {
  if (!tabId) return true;
  return AGENT_APPLICATION_TAB_IDS.has(tabId);
}
