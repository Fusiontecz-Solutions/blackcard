import type { Application, ApplicationUserLite } from "@/types/applicationTypes";

export function formatApplicationUserDisplayName(
  user: ApplicationUserLite | null | undefined,
): string {
  if (!user || typeof user !== "object") return "";
  const fn = (user.firstName ?? "").trim();
  const ln = (user.lastName ?? "").trim();
  const full = [fn, ln].filter(Boolean).join(" ");
  if (full) return full;
  const name = (user as { name?: string }).name?.trim();
  if (name) return name;
  if (user.email?.trim()) return user.email.trim();
  return "";
}

/** Scrubbing-stage claim (`claimedByUnderwriter` — legacy field name). */
export function formatScrubberClaimLabel(
  app: Pick<Application, "claimedByUnderwriterId" | "claimedByUnderwriter">,
): string {
  const name = formatApplicationUserDisplayName(app.claimedByUnderwriter);
  if (app.claimedByUnderwriterId || name) return name || "—";
  return "—";
}

/** Underwriter-stage claim / assignment. */
export function formatUnderwriterClaimLabel(
  app: Pick<Application, "assignedUnderwriterId" | "assignedUnderwriter">,
): string {
  const name = formatApplicationUserDisplayName(app.assignedUnderwriter);
  if (app.assignedUnderwriterId || name) return name || "—";
  return "—";
}

export function formatClaimFilterUserName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  name?: string | null;
}): string {
  const fn = (user.firstName ?? "").trim();
  const ln = (user.lastName ?? "").trim();
  const full = [fn, ln].filter(Boolean).join(" ");
  if (full) return full;
  const name = (user.name ?? "").trim();
  if (name) return name;
  if (user.email?.trim()) return user.email.trim();
  return "Unnamed user";
}

export function mapUsersToClaimFilterOptions(
  users: Array<{
    _id?: string;
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    name?: string | null;
  }>,
): { id: string; name: string }[] {
  return users
    .map((user) => {
      const id = user._id ?? user.id;
      if (!id) return null;
      return { id: String(id), name: formatClaimFilterUserName(user) };
    })
    .filter((row): row is { id: string; name: string } => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Super Admin / Operations — scrubbers and underwriters must not see colleagues' claims on shared lists. */
export function canViewApplicationClaimAssignments(roleKey: string): boolean {
  const key = roleKey.trim().toUpperCase().replace(/\s+/g, "_");
  return key === "SUPER_ADMIN" || key === "OPERATIONS";
}

function normalizeQueueToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

/** Queue Claim button vs "—": first-claim race between scrubbers and underwriters. */
export function canClaimDealFromInbox(
  app: Pick<
    Application,
    | "currentQueue"
    | "queue"
    | "claimedByUnderwriterId"
    | "assignedUnderwriterId"
  > & { returnedToScrubberAt?: string | null },
  roleKey: string,
): boolean {
  // A deal sent back for correction is already owned - the scrubber holds the
  // claim, the underwriter keeps the assignment - so it is nobody's to claim.
  if (app.returnedToScrubberAt) return false;
  const role = roleKey.trim().toUpperCase().replace(/\s+/g, "_");
  const queue = normalizeQueueToken(app.currentQueue ?? app.queue);
  const scrubberClaimed = Boolean(app.claimedByUnderwriterId);
  const underwriterClaimed = Boolean(app.assignedUnderwriterId);

  if (role === "SCRUBBING") {
    return queue === "SCRUBBING" && !scrubberClaimed && !underwriterClaimed;
  }
  if (role === "UNDERWRITER") {
    if (underwriterClaimed) return false;
    if (queue === "UNDERWRITER") return true;
    if (queue === "SCRUBBING") return !scrubberClaimed;
    return false;
  }
  return false;
}

/** Approved offer amount on application lists (ops/admin + pipeline reviewers). */
export function canViewApplicationApprovedAmount(roleKey: string): boolean {
  const key = roleKey.trim().toUpperCase().replace(/\s+/g, "_");
  if (canViewApplicationClaimAssignments(key)) return true;
  return key === "SCRUBBING" || key === "UNDERWRITER";
}
