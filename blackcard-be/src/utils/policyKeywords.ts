/**
 * Keyword lists taken from the Fusiontecz underwriting policy.
 *
 * ── Why these live here ──────────────────────────────────────────────────
 *
 * The lists inside mcaExtraction.js were written before the policy existed,
 * so they encode an earlier judgement about what matters. These come straight
 * out of the document — the gambling names, the fintech lenders, the
 * deduction descriptors — so when the policy is rewritten, this is the file
 * that changes, and the classifier follows.
 *
 * ── What the policy says about matching ─────────────────────────────────
 *
 *   "Search by keyword as well as by name. Descriptors vary by bank."
 *
 * So each group carries both: short keywords that survive a bank truncating
 * the payee column, and the specific brand names a statement actually shows.
 *
 * Matching is lowercase substring, which is why entries are kept distinctive.
 * "bet" as a bare substring would match "better" and "betterment"; it is in
 * the word list instead, tested on word boundaries.
 */

/* ── Gambling ──────────────────────────────────────────────────────────
 * Credits come out of revenue; debits are a risk signal showing where the
 * business's cash is going. Policy page 6. */
export const GAMBLING_NAMES = [
  // Sportsbooks
  "draftkings", "fanduel", "betmgm", "caesars sportsbook", "fanatics sportsbook",
  "betrivers", "rush street", "hard rock bet", "bet365", "thescore bet", "espn bet",
  // Daily fantasy and prediction markets
  "prizepicks", "underdog fantasy", "sleeper", "kalshi", "polymarket",
  // Sweepstakes and social casinos
  "chumba", "vgw", "luckyland", "stake.us", "mcluck", "pulsz", "wow vegas",
  // Land-based casinos
  "mgm resorts", "caesars entertainment", "wynn", "venetian", "mohegan sun",
  "foxwoods", "seminole hard rock",
  // Casino cash access
  "everi", "global cash access",
  // Gaming payment processors
  "paynearme", "vip preferred", "sightline", "play+", "skrill",
];

/* Short forms that survive truncation. Tested on word boundaries, never as
   substrings — "bet" inside "betterment" is not a sportsbook. */
export const GAMBLING_WORDS = [
  "bet", "sportsbk", "sportsbook", "casino", "gaming", "lotto", "lottery",
  "wager", "poker", "slots",
];

/* ── Crypto ────────────────────────────────────────────────────────────
 * Same treatment as gambling: credits deducted, debits a signal. Note the
 * aliases — Crypto.com settles as "Foris DAX" and Binance.US as "BAM
 * Trading", so the brand name alone would miss them. */
export const CRYPTO_NAMES = [
  "coinbase", "kraken", "payward", "gemini", "crypto.com", "foris dax",
  "binance", "bam trading", "okx", "uphold", "bitstamp",
  "strike", "river financial", "swan bitcoin",
  "moonpay", "bitpay", "transak",
  "bitcoin depot", "coinflip", "coinme", "athena bitcoin", "rockitcoin",
  /**
   * Module 3 groups brokerage cash-outs with crypto, and for the same reason:
   * both are money coming out of an instrument rather than a customer paying
   * for a sale.
   *
   * Cash App, Venmo and PayPal appear on the guide's list too, and are left
   * out on purpose. They already have their own categories, and they move
   * ordinary money far more often than crypto, so tagging every Venmo transfer
   * as a crypto cash-out would deduct real revenue. "Ramp" is left out for
   * the same kind of reason: the corporate card company shares the name.
   */
  "robinhood", "schwab", "fidelity investments",
];

export const CRYPTO_WORDS = [
  "crypto", "btc", "bitcoin", "eth", "digital asset", "wallet",
];

/* ── Financing that is NOT revenue ─────────────────────────────────────
 * Platform and fintech lenders. These were the costly omission: a Shopify
 * Capital advance counted as revenue inflates true revenue and sizes the
 * offer too high. Policy page 4. */
export const FINTECH_FINANCING = [
  "shopify capital", "square loans", "square capital", "paypal working",
  "stripe capital", "amazon lending", "bluevine", "ondeck", "on deck",
  "fundbox", "kabbage",
];

/** Bank, SBA and equipment lending paid in to the merchant. */
export const LOAN_PROCEEDS = [
  "loan proceeds", "sba", "sbad treas", "ln disb", "eidl", "loan disbursement",
  "equipment financ",
];

/** Line of credit and overdraft protection draws. */
export const LOC_DRAW = [
  "loc adv", "credit line", "line of credit", "overdraft protection",
  "advance from line",
];

/** Factoring — advances against invoices. */
export const FACTORING = ["reserve release", "factoring", "factor advance", "rebate"];

/** The owner putting money in. Not revenue however it arrives. */
export const OWNER_INJECTION = [
  "capital contribution", "shareholder loan", "member contribution",
  "owner contribution", "owner draw", "owner deposit", "investor",
];

/** Money coming back, not coming in. */
export const RETURNS_REVERSALS = [
  "deposited item returned", "return item", "returned item", "ach return",
  "reversal", "chargeback", "returned deposit",
];

export const BANK_CORRECTIONS = [
  "adjustment", "correction credit", "provisional credit", "duplicate posting",
];

export const FEE_REFUNDS = [
  "od fee refund", "fee reversal", "courtesy refund", "nsf fee refund",
  "fee refund",
];

/** One-off income: tax, government, insurance, asset sales. */
export const TAX_REFUNDS = [
  "irs treas 310", "tax ref", "tax refund", "dept of revenue",
  "department of revenue", "erc", "employee retention",
];

export const GOVERNMENT_FUNDS = [
  "ppp", "rrf", "restaurant revitalization", "grant", "stimulus",
  "sba loan", "treas 310",
];

export const INSURANCE_SETTLEMENT = [
  "insurance", "claim payment", "settlement", "indemnity",
];

/* ── Other red flags ───────────────────────────────────────────────────
 * Not deductions — signals that change the decision. Policy page 6-7. */
export const PAYDAY_LOANS = [
  "advance america", "check into cash", "titlemax", "speedy cash",
  "cashnetusa", "payday",
];

export const LEVIES_GARNISHMENT = [
  "irs levy", "tax levy", "levy", "garnishment", "garnish", "wage garn",
];

export const LEGAL_DEBITS = [
  "judgment", "judgement", "court order", "writ", "attorney", "law firm",
  "legal services", "collection",
];

export const STOP_PAYMENT = [
  "stop payment", "ach block", "unauthorized return", "blocked ach",
];

export const DEBT_SETTLEMENT = [
  "debt settlement", "debt relief", "consolidation", "reverse consolidation",
  "settlement services",
];

/**
 * Every deduction group, in the order the policy lists them.
 *
 * `category` is what the classifier tags the transaction as; `deduct` marks
 * the groups that must come out of gross deposits to reach true revenue.
 */
export const DEDUCTION_GROUPS = [
  { key: "fintechFinancing", label: "Fintech financing", words: FINTECH_FINANCING, deduct: true },
  { key: "loanProceeds", label: "Loan proceeds", words: LOAN_PROCEEDS, deduct: true },
  { key: "locDraw", label: "Line of credit draw", words: LOC_DRAW, deduct: true },
  { key: "factoring", label: "Factoring", words: FACTORING, deduct: true },
  { key: "ownerInjection", label: "Owner injection", words: OWNER_INJECTION, deduct: true },
  { key: "returnsReversals", label: "Returns and reversals", words: RETURNS_REVERSALS, deduct: true },
  { key: "bankCorrection", label: "Bank correction", words: BANK_CORRECTIONS, deduct: true },
  { key: "feeRefund", label: "Fee refund", words: FEE_REFUNDS, deduct: true },
  { key: "taxRefund", label: "Tax refund", words: TAX_REFUNDS, deduct: true },
  { key: "governmentFunds", label: "Government funds", words: GOVERNMENT_FUNDS, deduct: true },
  { key: "insuranceSettlement", label: "Insurance or settlement", words: INSURANCE_SETTLEMENT, deduct: true },
];

/** Red-flag groups — surfaced to the underwriter rather than deducted. */
export const RED_FLAG_GROUPS = [
  { key: "gambling", label: "Gambling", words: GAMBLING_NAMES, boundaryWords: GAMBLING_WORDS },
  { key: "crypto", label: "Crypto", words: CRYPTO_NAMES, boundaryWords: CRYPTO_WORDS },
  { key: "paydayLoan", label: "Payday or title loan", words: PAYDAY_LOANS },
  { key: "levy", label: "Levy or garnishment", words: LEVIES_GARNISHMENT },
  { key: "legal", label: "Legal or collections", words: LEGAL_DEBITS },
  { key: "stopPayment", label: "Stop payment or blocked ACH", words: STOP_PAYMENT },
  { key: "debtSettlement", label: "Debt settlement", words: DEBT_SETTLEMENT },
];

/**
 * Statement health thresholds, from the policy's health-check table.
 *
 * Kept here so the AI analysis grades a statement the same way the soft offer
 * engine and the cheat sheet do, rather than three places drifting apart.
 */
export const HEALTH_THRESHOLDS = {
  nsfPerMonth: { good: 2, caution: 7 },      // 0-2 good, 3-7 caution, 8+ decline
  negativeDaysPerMonth: { good: 3, caution: 10 },
  revenueDropPct: 25,                         // latest month vs average
  adbToRevenuePct: { good: 10, weak: 5 },
};

/**
 * Credit categories that are NOT customer revenue.
 *
 * This is the policy's rule in one list: "deduct any credit that is not a
 * customer paying for goods or services". Gross deposits minus these is true
 * revenue.
 *
 * Exported with the analysis so the interface does not keep its own copy —
 * a second list would drift, and the direction it drifts is upward, because
 * a forgotten deduction inflates revenue and sizes the offer too high.
 */
export const NON_REVENUE_CATEGORIES = [
  // Money moving between the merchant's own or related accounts
  "transfers",
  // Borrowed money
  "mcaCredits",
  "loanInflow",
  "loanProceeds",
  "locDraw",
  "factoring",
  // The owner's own money
  "ownerInjection",
  // Money coming back rather than in
  "returnsReversals",
  "nsf",
  "bankCorrection",
  "feeRefund",
  // One-off income
  "taxRefund",
  "governmentFunds",
  "insuranceSettlement",
  // Cash out of other instruments — a win or a sale, not a sale to a customer
  "gambling",
  "crypto",
];
