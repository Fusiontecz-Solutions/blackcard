import { resolveOfferDecisionFundedAmount } from "@/lib/offerDecisionFees";
import type { TermsOffer } from "@/types/termsOfferTypes";

type ApplicationAmountSource = {
  loanAmount?: number | string | null;
  OfferDecision?: Record<string, unknown> | null;
  offerDecision?: Record<string, unknown> | null;
};

function parseLoanAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const n = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toValidNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Underwritten offer amount — OfferDecision / terms offer only, never requested loanAmount.
 */
export function resolveApplicationOfferAmount(
  offerDecisionData: unknown,
  latestTermsOffer?: TermsOffer | { approvedAmount?: unknown } | null,
): number | null {
  const fromTerms = toValidNumber(latestTermsOffer?.approvedAmount);
  if (!offerDecisionData || typeof offerDecisionData !== "object") {
    return fromTerms;
  }
  const od = offerDecisionData as Record<string, unknown>;
  if (String(od.decision ?? "").toLowerCase() === "declined") {
    return fromTerms;
  }
  const fromOffer = resolveOfferDecisionFundedAmount(od);
  if (fromOffer != null && fromOffer > 0) return fromOffer;
  return toValidNumber(od.approvedAmount) ?? fromTerms;
}

/** Original requested amount on the application (never offer/approved). */
export function resolveApplicationRequestAmount(
  app: ApplicationAmountSource | null | undefined,
): number | null {
  if (!app) return null;
  return parseLoanAmount(app.loanAmount);
}

/**
 * Amount shown in application lists: prefer OfferDecision offer after underwriting,
 * otherwise the requested amount on the application (`loanAmount`).
 */
export function resolveApplicationDisplayLoanAmount(
  app: ApplicationAmountSource | null | undefined,
): number | null {
  if (!app) return null;

  const offerDecision =
    (app.OfferDecision as Record<string, unknown> | null | undefined) ??
    (app.offerDecision as Record<string, unknown> | null | undefined) ??
    null;
  const fromOffer = resolveOfferDecisionFundedAmount(offerDecision);
  if (fromOffer != null && fromOffer > 0) return fromOffer;

  return parseLoanAmount(app.loanAmount);
}
