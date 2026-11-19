/**
 * Front-end mirror of the book backends' `getUnderwriterClaimMutationDenial`
 * (services/underwriterClaimGuard.ts) for the unclaimed cases only.
 *
 * The backend rejects every change to an unclaimed deal with "Claim deal
 * first", but the page used to open fully editable, so the user could fill in
 * values that were then refused on save. This lets the page open read-only and
 * ask for the claim up front.
 *
 * "Claimed by someone else" is left to the backend: claim ids are book user
 * ids, which do not always match the gateway session's id, and guessing wrong
 * would lock the claim holder out of their own deal.
 */

export type ClaimRequirement = "scrubbing" | "underwriter";

type UserLite = { id?: string | null; _id?: string | null; email?: string | null } | null;

type ClaimFields = {
  currentQueue?: string | null;
  queue?: string | null;
  claimedByUnderwriterId?: string | null;
  claimedByUnderwriter?: UserLite;
  claimedAt?: string | null;
  assignedUnderwriterId?: string | null;
  assignedUnderwriter?: UserLite;
  returnedToScrubberAt?: string | null;
} | null | undefined;

const hasUser = (u: UserLite | undefined) => Boolean(u && (u.id || u._id || u.email));

function queueToken(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[\s-]+/g, "_")
    : "";
}

/** Which claim the user still needs before editing, or null when none. */
export function getRequiredClaim(
  roleKey: string,
  app: ClaimFields,
): ClaimRequirement | null {
  if (!app) return null;
  const queue = queueToken(app.currentQueue ?? app.queue);

  if (roleKey === "SCRUBBING" && queue === "SCRUBBING") {
    // Taken by an underwriter (and not sent back): not claimable by scrubbers.
    const assigned = app.assignedUnderwriterId || hasUser(app.assignedUnderwriter);
    if (assigned && !app.returnedToScrubberAt) return null;
    // Any claim marker counts — the id, the claimer, or the claim time.
    const claimed =
      app.claimedByUnderwriterId || hasUser(app.claimedByUnderwriter) || app.claimedAt;
    return claimed ? null : "scrubbing";
  }

  if (roleKey === "UNDERWRITER" && queue === "UNDERWRITER") {
    return app.assignedUnderwriterId || hasUser(app.assignedUnderwriter)
      ? null
      : "underwriter";
  }

  return null;
}
