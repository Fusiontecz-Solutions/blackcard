/**
 * Bidirectional offer / repayment math (mirrors OfferDecisionToggle).
 * advance = offer, factorRate = rate, payback = total repayment, daily = per-period payment.
 */

export type OfferFrequency = "Daily" | "Weekly" | "Bi-Weekly" | "Monthly";

export type OfferCalcDriverField =
  | "advance"
  | "factorRate"
  | "term"
  | "frequency"
  | "payback"
  | "daily";

export type OfferCalcInput = {
  advance: number;
  factorRate: number;
  payback: number;
  daily: number;
  term: string;
  frequency: string;
};

export type OfferCalcResult = Pick<
  OfferCalcInput,
  "advance" | "factorRate" | "payback" | "daily"
> & {
  monthlyPayment: number;
};

const WEEKLY_TO_MONTHLY_FACTOR = 4.2;
// Bi-Weekly = every 2 weeks → ~26 payments/year ÷ 12 months ≈ 2.166.
// Kept consistent with the project's WEEKLY_TO_MONTHLY_FACTOR (4.2) by halving it.
const BIWEEKLY_TO_MONTHLY_FACTOR = 2.1;

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function parseTerm(term: string): number {
  const cleaned = String(term ?? "").replace(/[^0-9.-]/g, "");
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function normalizeFrequency(frequency: string): OfferFrequency {
  const f = String(frequency ?? "").trim();
  if (f === "Weekly") return "Weekly";
  if (f === "Bi-Weekly" || f === "BiWeekly" || f === "Biweekly") {
    return "Bi-Weekly";
  }
  if (f === "Monthly") return "Monthly";
  return "Daily";
}

function hasValidRateTerm(factorRate: number, termNum: number): boolean {
  return (
    isOfferFactorRate(factorRate) &&
    Number.isFinite(termNum) &&
    termNum > 0
  );
}

/** MCA factor/sell rates are ≥ 1; terms `buyRate` (~0.1–0.2) is not the payback multiplier. */
export function isOfferFactorRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 1;
}

/** Resolve sell rate for payback math (matches backend `offerDecisionRateFromRoot` + terms factor). */
export function resolveOfferFactorRate(sources: {
  summaryFactor?: number | null;
  offerDecisionRate?: number | null;
  offerDecisionFactorRate?: number | null;
  termsFactorRate?: number | null;
  fallback?: number;
}): number {
  const candidates = [
    sources.summaryFactor,
    sources.offerDecisionRate,
    sources.offerDecisionFactorRate,
    sources.termsFactorRate,
  ];
  for (const value of candidates) {
    if (value != null && isOfferFactorRate(value)) return value;
  }
  return sources.fallback ?? 1.5;
}

/**
 * Payback dollars — mirrors `getPaybackAmountForDealBalance` on the backend.
 * Do not use `OfferDecision.totalRemit` when it stores leverage % from the offer form.
 */
export function resolveOfferPayback(
  advance: number,
  factorRate: number,
  sources: {
    paybackNum?: number | null;
    termsPaybackAmount?: number | null;
    offerPaybackAmount?: number | null;
    totalRemit?: number | null;
  },
): number {
  // Same priority as backend `getPaybackAmountForDealBalance`: offer × rate wins when rate is valid.
  if (advance > 0 && isOfferFactorRate(factorRate)) {
    return roundMoney(advance * factorRate);
  }

  const fromSummary = sources.paybackNum;
  if (fromSummary != null && fromSummary > 0) return roundMoney(fromSummary);

  const fromTerms = sources.termsPaybackAmount;
  if (fromTerms != null && fromTerms > 0) return roundMoney(fromTerms);

  const fromOffer = sources.offerPaybackAmount;
  if (fromOffer != null && fromOffer > 0) return roundMoney(fromOffer);

  const totalRemit = sources.totalRemit;
  if (
    totalRemit != null &&
    totalRemit > 0 &&
    advance > 0 &&
    totalRemit >= advance
  ) {
    return roundMoney(totalRemit);
  }

  return 0;
}

/**
 * Monthly equivalent — mirrors OfferDecisionToggle Case D.
 * Always derives per-period payment from payback ÷ term so term edits stay stable.
 */
export function computeMonthlyPayment(input: {
  payback: number;
  term: string;
  frequency: string;
}): number {
  const termNum = parseTerm(input.term);
  if (!Number.isFinite(termNum) || termNum <= 0) return 0;

  const totalRepayment = input.payback;
  if (totalRepayment <= 0) return 0;

  const perPeriodPayment = computePerPeriodPayment({
    payback: totalRepayment,
    term: input.term,
  });
  if (perPeriodPayment <= 0) return 0;

  const freq = normalizeFrequency(input.frequency);

  if (freq === "Daily") {
    return roundMoney(
      termNum < 22 ? perPeriodPayment * termNum : perPeriodPayment * 22,
    );
  }
  if (freq === "Weekly") {
    return roundMoney(perPeriodPayment * WEEKLY_TO_MONTHLY_FACTOR);
  }
  if (freq === "Bi-Weekly") {
    return roundMoney(perPeriodPayment * BIWEEKLY_TO_MONTHLY_FACTOR);
  }
  return roundMoney(perPeriodPayment);
}

/** Per-period payment (daily / weekly / monthly) from offer drivers. */
export function computePerPeriodPayment(input: {
  payback: number;
  term: string;
}): number {
  const termNum = parseTerm(input.term);
  if (!Number.isFinite(termNum) || termNum <= 0 || input.payback <= 0) return 0;
  return roundMoney(input.payback / termNum);
}

function withMonthlyPayment(
  result: Pick<OfferCalcInput, "advance" | "factorRate" | "payback" | "daily">,
  term: string,
  frequency: string,
): OfferCalcResult {
  return {
    ...result,
    monthlyPayment: computeMonthlyPayment({
      payback: result.payback,
      term,
      frequency,
    }),
  };
}

/** Recalculate daily + monthly from advance × rate and term (term/frequency edits). */
export function recalculateFromTermOrFrequency(
  input: OfferCalcInput,
): OfferCalcResult | null {
  const termNum = parseTerm(input.term);
  const rateNum = input.factorRate;
  const offerNum = input.advance;

  if (
    !hasValidRateTerm(rateNum, termNum) ||
    !Number.isFinite(offerNum) ||
    offerNum <= 0
  ) {
    return null;
  }

  const payback = roundMoney(offerNum * rateNum);
  const daily = computePerPeriodPayment({ payback, term: input.term });

  return withMonthlyPayment(
    {
      advance: offerNum,
      factorRate: rateNum,
      payback,
      daily,
    },
    input.term,
    input.frequency,
  );
}

/** Recalculate dependent fields after a driver edit. Returns null if inputs are insufficient. */
export function recalculateOfferFields(
  input: OfferCalcInput,
  lastChanged: OfferCalcDriverField,
): OfferCalcResult | null {
  const termNum = parseTerm(input.term);
  const rateNum = input.factorRate;
  const offerNum = input.advance;
  const paybackNum = input.payback;
  const dailyNum = input.daily;
  const hasValidRateTermFlag = hasValidRateTerm(rateNum, termNum);

  // User edited per-period payment (daysWeeks / daily)
  if (lastChanged === "daily" && hasValidRateTermFlag && dailyNum > 0) {
    const totalRepayment = dailyNum * termNum;
    const newAdvance = totalRepayment / rateNum;
    if (!Number.isFinite(newAdvance) || newAdvance <= 0) return null;
    return withMonthlyPayment(
      {
        advance: roundMoney(newAdvance),
        factorRate: rateNum,
        payback: roundMoney(totalRepayment),
        daily: roundMoney(dailyNum),
      },
      input.term,
      input.frequency,
    );
  }

  // User edited total repayment (payback / totalRemit)
  if (lastChanged === "payback" && hasValidRateTermFlag && paybackNum > 0) {
    const newAdvance = paybackNum / rateNum;
    if (!Number.isFinite(newAdvance) || newAdvance <= 0) return null;
    const perPeriodPayment = paybackNum / termNum;
    return withMonthlyPayment(
      {
        advance: roundMoney(newAdvance),
        factorRate: rateNum,
        payback: roundMoney(paybackNum),
        daily: roundMoney(perPeriodPayment),
      },
      input.term,
      input.frequency,
    );
  }

  // Term / frequency: keep payback = advance × rate; only split across periods
  if (lastChanged === "term" || lastChanged === "frequency") {
    return recalculateFromTermOrFrequency(input);
  }

  // Advance or factor: recompute full offer stack
  if (lastChanged === "advance" || lastChanged === "factorRate") {
    if (
      !hasValidRateTermFlag ||
      !Number.isFinite(offerNum) ||
      offerNum <= 0
    ) {
      return null;
    }

    const payback = roundMoney(offerNum * rateNum);
    const daily = computePerPeriodPayment({ payback, term: input.term });

    return withMonthlyPayment(
      {
        advance: offerNum,
        factorRate: rateNum,
        payback,
        daily,
      },
      input.term,
      input.frequency,
    );
  }

  return null;
}

/** Canonical stack: payback = offer × rate; repay = payback ÷ term; monthly from frequency rules. */
export type OfferRepaymentStack = {
  advance: number;
  factorRate: number;
  payback: number;
  perPeriodPayment: number;
  monthlyPayment: number;
};

export function deriveOfferRepaymentStack(input: {
  advance: number;
  factorRate: number;
  term: string;
  frequency: string;
}): OfferRepaymentStack | null {
  const termNum = parseTerm(input.term);
  const offerNum = input.advance;
  const rateNum = input.factorRate;

  if (
    !Number.isFinite(offerNum) ||
    offerNum <= 0 ||
    !hasValidRateTerm(rateNum, termNum)
  ) {
    return null;
  }

  const payback = roundMoney(offerNum * rateNum);
  const perPeriodPayment = computePerPeriodPayment({
    payback,
    term: input.term,
  });
  const monthlyPayment = computeMonthlyPayment({
    payback,
    term: input.term,
    frequency: input.frequency,
  });

  return {
    advance: offerNum,
    factorRate: rateNum,
    payback,
    perPeriodPayment,
    monthlyPayment,
  };
}

export {
  WEEKLY_TO_MONTHLY_FACTOR,
  BIWEEKLY_TO_MONTHLY_FACTOR,
  parseTerm,
  normalizeFrequency,
  roundMoney,
};
