import type { Application } from "@/types/applicationTypes";
import { resolveOfferDecisionFundedAmount } from "@/lib/offerDecisionFees";

function parseMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const n = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Latest terms-offer or offer-decision amount (excludes declined decisions). */
export function getApplicationApprovedAmount(app: Application): number | null {
  const termsOffers = app.termsOffers;
  const fromTerms =
    termsOffers && termsOffers.length > 0
      ? parseMoney(termsOffers[0].approvedAmount)
      : null;

  const od = app.OfferDecision;
  const decisionNorm = od?.decision ? String(od.decision).toLowerCase() : "";
  const fromOfferDecision =
    od && decisionNorm !== "declined"
      ? resolveOfferDecisionFundedAmount(od as Record<string, unknown>)
      : null;

  return fromTerms ?? fromOfferDecision;
}
