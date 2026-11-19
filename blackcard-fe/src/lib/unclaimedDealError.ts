/** User-facing copy when a scrubber/underwriter acts on an unclaimed deal. */
export const CLAIM_DEAL_FIRST_MESSAGE = "Claim deal first";

function readErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error == null || typeof error !== "object") return "";

  const asAny = error as {
    message?: unknown;
    payload?: unknown;
    response?: { data?: { message?: unknown } };
  };

  const fromResponse = asAny.response?.data?.message;
  if (typeof fromResponse === "string" && fromResponse.trim()) {
    return fromResponse.trim();
  }
  if (typeof asAny.payload === "string" && asAny.payload.trim()) {
    return asAny.payload.trim();
  }
  if (typeof asAny.message === "string" && asAny.message.trim()) {
    return asAny.message.trim();
  }
  return "";
}

/** True when the API rejected the mutation because the deal is not claimed. */
export function isUnclaimedDealError(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase();
  if (!message) return false;
  return (
    message.includes("claim this deal") ||
    message.includes("claim this application") ||
    message.includes("claim deal first") ||
    (message.includes("claim") &&
      (message.includes("before making changes") ||
        message.includes("before making")))
  );
}

/**
 * Prefer a short claim prompt for unclaimed-deal 403s; otherwise return the
 * API message or the provided fallback.
 */
export function resolveActionErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (isUnclaimedDealError(error)) return CLAIM_DEAL_FIRST_MESSAGE;
  const message = readErrorMessage(error);
  return message || fallback;
}
