/**
 * Offer Decision fees: UI is % of funded amount (`OfferDecision.offer`);
 * DB column `OfferDecision.fees` stores the dollar fee amount.
 */

function parseAmount(value: unknown): number {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const s = String(value).replace(/[$,%\s]/g, "").replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Scalar funded amount from GET/POST payload (`offer` may be a nested snapshot object). */
export function resolveOfferDecisionFundedAmount(
  apiData: Record<string, unknown> | null | undefined,
): number | null {
  if (!apiData || typeof apiData !== "object") return null;
  const offer = apiData.offer;
  if (offer != null && typeof offer === "object" && !Array.isArray(offer)) {
    const inner = offer as Record<string, unknown>;
    const fromInner = parseAmount(
      inner.offer ?? inner.approvedAmount ?? inner.fundedAmount ?? inner.amount,
    );
    if (Number.isFinite(fromInner) && fromInner > 0) return fromInner;
  }
  const scalar = parseAmount(offer);
  return Number.isFinite(scalar) && scalar > 0 ? scalar : null;
}

/** Fee value from root or nested `offer` snapshot. */
export function resolveOfferDecisionFeesRaw(
  apiData: Record<string, unknown> | null | undefined,
): unknown {
  if (!apiData || typeof apiData !== "object") return undefined;
  const root = apiData.fees;
  if (root != null && String(root).trim() !== "") return root;
  const offer = apiData.offer;
  if (offer != null && typeof offer === "object" && !Array.isArray(offer)) {
    return (offer as Record<string, unknown>).fees;
  }
  return root;
}

/**
 * Map stored `OfferDecision.fees` → fee % for the Decision Making form.
 * Handles: dollars (new), legacy payback-based dollars, and rare percent-in-DB rows.
 */
export function resolveOfferFeesPercentForForm(
  fundedAmount: unknown,
  factorRate: unknown,
  feesRaw: unknown,
): number | null {
  const fundedN = parseAmount(fundedAmount);
  const rateN = parseAmount(factorRate);
  const feesN = parseAmount(feesRaw);
  if (!Number.isFinite(fundedN) || fundedN <= 0) return null;
  if (!Number.isFinite(feesN) || feesN <= 0) return null;

  const looksLikeDollars = feesN > 100 || feesN > fundedN * 0.005;

  if (looksLikeDollars) {
    const percentOfFunded = (feesN / fundedN) * 100;
    // Legacy payback fee: $ = funded × rate × p/100. For p = 1%, $ = funded × rate / 100,
    // and (fees / funded) × 100 equals factor rate (e.g. 1.35) — not the real fee %.
    const legacyOnePctPaybackDollars =
      Number.isFinite(rateN) &&
      rateN > 0 &&
      Math.abs(feesN - (fundedN * rateN) / 100) < Math.max(1, fundedN * 0.00001);
    if (legacyOnePctPaybackDollars) {
      const fromPaybackBasis = (feesN * 100) / (fundedN * rateN);
      if (fromPaybackBasis > 0 && fromPaybackBasis <= 100) {
        return fromPaybackBasis;
      }
    }
    if (percentOfFunded > MAX_REASONABLE_OFFER_FEE_PERCENT) {
      return null;
    }
    return percentOfFunded;
  }

  // Already stored as a small percent (e.g. 10). Do not show factor rate as fee %.
  if (Number.isFinite(rateN) && rateN > 0 && Math.abs(feesN - rateN) < 0.0001) {
    return null;
  }
  if (feesN > 0 && feesN <= 100) {
    return feesN;
  }

  return null;
}

/** Max fee % treated as valid when inferring from stored dollar amounts. */
export const MAX_REASONABLE_OFFER_FEE_PERCENT = 25;

export const DEFAULT_OFFER_FEE_PERCENT = 10;

/**
 * Fee % for calculations: terms offer commission % → application ISO % →
 * offer-decision fees field → default 10%.
 */
export function resolveOfferFeePercentForDeal(sources: {
  fundedAmount: unknown;
  factorRate?: unknown;
  feesRaw?: unknown;
  termsCommissionPercent?: unknown;
  applicationCommissionPercentage?: unknown;
}): number {
  const termsPct = parseAmount(sources.termsCommissionPercent);
  if (Number.isFinite(termsPct) && termsPct > 0 && termsPct <= 100) {
    return termsPct;
  }

  const appPct = parseAmount(sources.applicationCommissionPercentage);
  if (Number.isFinite(appPct) && appPct > 0 && appPct <= 100) {
    return appPct;
  }

  const fromOfferFees = resolveOfferFeesPercentForForm(
    sources.fundedAmount,
    sources.factorRate,
    sources.feesRaw,
  );
  if (
    fromOfferFees != null &&
    fromOfferFees > 0 &&
    fromOfferFees <= MAX_REASONABLE_OFFER_FEE_PERCENT
  ) {
    return fromOfferFees;
  }

  return DEFAULT_OFFER_FEE_PERCENT;
}

/** Fee dollars = funded amount × (fee % ÷ 100). */
export function computeOfferFeeAmountDollars(
  fundedAmount: unknown,
  feePercent: unknown,
): number {
  const fundedN = parseAmount(fundedAmount);
  const pctN = parseAmount(feePercent);
  if (!Number.isFinite(fundedN) || fundedN <= 0) return 0;
  if (!Number.isFinite(pctN) || pctN <= 0) return 0;
  return Math.round(((fundedN * pctN) / 100) * 100) / 100;
}

/**
 * Canonical underwriting / origination fee in dollars for a deal.
 * Never uses payback−advance, monthly payment, or stale commissionAmount columns.
 */
export function resolveOfferFeeAmountForDeal(sources: {
  fundedAmount: unknown;
  factorRate?: unknown;
  feesRaw?: unknown;
  termsCommissionPercent?: unknown;
  applicationCommissionPercentage?: unknown;
}): number {
  const fundedN = parseAmount(sources.fundedAmount);
  if (!Number.isFinite(fundedN) || fundedN <= 0) return 0;

  const termsPct = parseAmount(sources.termsCommissionPercent);
  if (Number.isFinite(termsPct) && termsPct > 0 && termsPct <= 100) {
    return computeOfferFeeAmountDollars(fundedN, termsPct);
  }

  const appPct = parseAmount(sources.applicationCommissionPercentage);
  if (Number.isFinite(appPct) && appPct > 0 && appPct <= 100) {
    return computeOfferFeeAmountDollars(fundedN, appPct);
  }

  const feesN = parseAmount(sources.feesRaw);
  const rateN = parseAmount(sources.factorRate);
  if (Number.isFinite(feesN) && feesN > 0) {
    const looksLikeDollars = feesN > 100 || feesN > fundedN * 0.005;
    if (looksLikeDollars) {
      const impliedPct = (feesN / fundedN) * 100;
      if (impliedPct > 0 && impliedPct <= MAX_REASONABLE_OFFER_FEE_PERCENT) {
        return Math.round(feesN * 100) / 100;
      }
    } else if (feesN > 0 && feesN <= 100) {
      if (!(Number.isFinite(rateN) && rateN > 0 && Math.abs(feesN - rateN) < 0.0001)) {
        return computeOfferFeeAmountDollars(fundedN, feesN);
      }
    }
  }

  const pct = resolveOfferFeePercentForDeal(sources);
  return computeOfferFeeAmountDollars(fundedN, pct);
}

/** Convert fee % (of funded amount) → dollars for `OfferDecision.fees`. */
export function feesPercentToDollarsFromFunded(
  fundedAmount: unknown,
  feesPercent: unknown,
): number | null {
  const fundedN = parseAmount(fundedAmount);
  const pctN = parseAmount(feesPercent);
  if (!Number.isFinite(fundedN) || fundedN <= 0) return null;
  if (!Number.isFinite(pctN) || pctN <= 0) return null;
  return (fundedN * pctN) / 100;
}

/** Convert stored fee dollars → % of funded amount for the offer form. */
export function feesDollarsToPercentOfFunded(
  fundedAmount: unknown,
  feesDollars: unknown,
  factorRate?: unknown,
): number | null {
  return resolveOfferFeesPercentForForm(fundedAmount, factorRate, feesDollars);
}

/** Display dollars for Fees column on offer-decision panels. */
export function resolveOfferDecisionFeesDisplayDollars(
  offerDecision: Record<string, unknown> | null | undefined,
  options?: {
    termsCommissionPercent?: unknown;
    applicationCommissionPercentage?: unknown;
  },
): number {
  if (!offerDecision || typeof offerDecision !== "object") return 0;
  return resolveOfferFeeAmountForDeal({
    fundedAmount: resolveOfferDecisionFundedAmount(offerDecision),
    factorRate: offerDecision.rate,
    feesRaw: resolveOfferDecisionFeesRaw(offerDecision),
    termsCommissionPercent: options?.termsCommissionPercent,
    applicationCommissionPercentage: options?.applicationCommissionPercentage,
  });
}
