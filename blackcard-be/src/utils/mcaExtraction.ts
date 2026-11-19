// @ts-nocheck
/**
 * Turn a Google Document AI parsed `document` into the MCA analysis result:
 *   - a flat list of transactions (from bank-statement entities, or OCR-text fallback)
 *   - per-category totals (deposits / mcaDebits / transfers / fees / nsf / other)
 *   - detected recurring MCA positions with inferred frequency + installment
 *   - a statement summary + risk flags
 *
 * The goal (per product spec) is to surface existing merchant cash advance running
 * positions — their amount and frequency — and bifurcate transactions into categories.
 */

// Payments per month by frequency — kept in sync with the frontend utils/mcaConstants.js.
// Daily × 22 (business days), Weekly × 4.
const FREQUENCY_MULTIPLIER = {
  // Module 8 of the underwriting guide: daily x21, weekly x4.33, bi-weekly x2.17.
  Daily: 21,
  Weekly: 4.33,
  "Bi-weekly": 2.17,
  Monthly: 1,
};

// Financing/position keywords. Any transaction whose description contains one of these
// is treated as an MCA / financing position. Per product spec this is intentionally broad
// so no funding/loan position is missed. Longer tokens are matched as substrings
// ("PeopleFund" → fund); the short risky ones (cap/lend) are matched as whole words so
// they don't fire on "landscape" or "blender".
/* Lists taken from the underwriting policy. Kept in their own module so a
   policy rewrite changes one file and the classifier follows. */
import {
  GAMBLING_NAMES,
  GAMBLING_WORDS,
  CRYPTO_NAMES,
  CRYPTO_WORDS,
  FINTECH_FINANCING,
  LOAN_PROCEEDS,
  LOC_DRAW,
  FACTORING,
  OWNER_INJECTION,
  RETURNS_REVERSALS,
  BANK_CORRECTIONS,
  FEE_REFUNDS,
  TAX_REFUNDS,
  GOVERNMENT_FUNDS,
  INSURANCE_SETTLEMENT,
  PAYDAY_LOANS,
  LEVIES_GARNISHMENT,
  LEGAL_DEBITS,
  STOP_PAYMENT,
  DEBT_SETTLEMENT,
  NON_REVENUE_CATEGORIES,
} from "./policyKeywords";

const POSITION_KEYWORDS_SUB = [
  "funding", "capital", "loan", "fund", "advance", "cash advance",
  "lending",
  // "financ" (not "finance"/"financing") so truncated statement descriptions still match —
  // Bank of America clips the payee column, turning "Forward Financing" → "Forward Financin"
  // and "Equipment Financing" → "Equipment Financ". Also covers finance/financial/refinance.
  "financ",
];
const POSITION_KEYWORDS_WORD = ["cap", "lend"];
// A debit is a financing position if it contains a generic financing keyword OR names a
// known MCA lender (many funders — Olympus, Pinnacle, Fundworks — carry no generic keyword).
const isFinancing = (desc) =>
  hasAnySub(desc, POSITION_KEYWORDS_SUB) ||
  hasAny(desc, POSITION_KEYWORDS_WORD) ||
  hasAnySub(desc, MCA_LENDER_KEYWORDS) ||
  // Platform lenders the generic keywords miss: "Shopify Capital" matches
  // on "capital", but "Amazon Lending" and "Square Loans" would not.
  hasPolicyTerm(desc, FINTECH_FINANCING);

// Well-known MCA lender names — used to group a lender's payments together and mark the
// position high-confidence.
const MCA_LENDER_KEYWORDS = [
  "kabbage", "ondeck", "on deck", "rapid finance", "rapidadvance", "fora financial",
  "fundbox", "square capital", "paypal working", "bluevine", "credibly",
  "forward financing", "kapitus", "reliant funding", "fox funding", "fox capital",
  "everest business", "cfg merchant", "libertas", "mulligan funding",
  "wynwood", "slate advance", "idea financial", "expansion capital", "byzfunder",
  "unique funding", "wave lending", "greenbox capital", "national funding",
  "quick fix capital", "delta bridge", "elevate funding", "torro", "smartbiz",
  "parkview advance", "cloudfund", "fenix capital", "diesel funding", "peoplefund",
  // user-provided funders
  "kanmon", "yellowstone", "imerchant", "armada", "bizfi", "can capital",
  "liberty capital", "pearl capital", "strategic funding", "rts financial",
  "pipe technologies", "essential fundin", "splashadvance", "aspirefunding", "spartan cap",
  // Funders whose statement descriptions carry no generic financing keyword (or are truncated
  // by the bank). Kept specific (multi-word / distinctive) to avoid false positives. Note
  // "forward financin" (no trailing g) also matches the full "forward financing".
  "forward financin", "olympus", "pinnacle business", "pinnaclebus",
  "the fundwork", "fundwork", "path 2 capital", "mnr capital",
];

const TRANSFER_KEYWORDS = [
  "transfer", "xfer", "online transfer", "internal transfer",
  "book transfer", "to savings", "from savings", "ach transfer", "eb to",
];
const WIRE_KEYWORDS = [
  "wire", "fedwire", "wire transfer", "incoming wire", "outgoing wire",
  "wire credit", "wire debit", "intl wire", "international wire", "domestic wire", "swift",
];

const ZELLE_KEYWORDS = ["zelle"];
const CASHAPP_KEYWORDS = ["cash app", "cashapp", "cash.app"];
const VENMO_KEYWORDS = ["venmo"];
// Debit/credit card POS activity.
const CARD_KEYWORDS = [
  "card purchase", "pin purchase", "debit card", "pos purchase", "pos debit",
  "card payment", "visa purchase", "recurring card",
];
const FUEL_KEYWORDS = [
  "fuel", "atob", "wex", "fuelman", "comdata", "fleetcor", "pilot", "flying j",
  "loves", "ta petro", "efs fuel", "quiktrip", "racetrac", "gas station",
];

// Overdraft fees vs NSF/returned items are surfaced as SEPARATE categories.
const OVERDRAFT_KEYWORDS = [
  "overdraft", "od fee", "overdraft fee", "negative balance", "extended od",
];
const NSF_KEYWORDS = [
  "nsf", "insufficient", "returned item", "return item", "uncollected",
  "returned deposit", "chargeback", "returned check", "return fee",
];
const FEE_KEYWORDS = [
  "fee", "service charge", "svc charge", "maintenance", "monthly charge",
  "wire fee", "atm fee", "analysis charge", "processing fee",
];

// ---- Position TYPE classification (user-provided taxonomy) ----
// A financing position (found via the broad isFinancing rule) is labelled MCA vs LOAN
// using these curated lists. Generic financing that matches neither defaults to MCA.
const MCA_TYPE_KEYWORDS = [
  "merchant cash", "cash advance", "business advance", "future receivable",
  "receivables", "daily remit", "daily remittance", "remittance",
  "ondeck", "on deck", "rapid", "kanmon", "yellowstone", "imerchant", "iom",
  "vader", "armada", "fora", "forafinancial", "lendtech", "bizfi", "kapitus",
  "forward financing", "fundbox", "bluevine", "kabbage", "can capital", "credibly",
  "national funding", "liberty capital", "pearl capital", "strategic funding",
  "everest business", "rts financial", "pipe technologies",
];
const LOAN_TYPE_KEYWORDS = [
  "loan", "installment", "term loan", "equipment loan", "avant", "onemain",
  "prosper", "lending club", "upstart", "sofi", "marcus", "best egg",
  "earnest", "lightstream",
];

// Payment processors (revenue rails) — Stripe/PayPal/Square deposits etc.
const PROCESSOR_KEYWORDS = ["stripe", "paypal", "square", "worldpay", "toast", "clover"];
// Non-financing obligations — excluded from position detection and bucketed separately.
const NON_MCA_KEYWORDS = [
  "payroll", "adp", "gusto", "paychex", "irs", "tax", "insurance",
  "utility", "electric", "water", "gas",
];
const CHECK_KEYWORDS = ["check", "chk"];
const IMPOUND_KEYWORDS = ["impound"];
const CASH_DEPOSIT_KEYWORDS = ["cash deposit", "atm deposit", "cash dep", "currency deposit"];
const REMOTE_DEPOSIT_KEYWORDS = ["remote deposit", "mobile deposit", "remote dep", "mobile dep", "rdc deposit", "mrdc"];

const lc = (s) => String(s || "").toLowerCase();

// Word-boundary keyword matching. A plain substring check is unsafe for short tokens:
// e.g. "nsf" is a substring of "traNSFer", which would misfile transfers as NSF items.
const _kwRegexCache = new Map();
function matchesKeyword(text, keyword) {
  let re = _kwRegexCache.get(keyword);
  if (!re) {
    const esc = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`\\b${esc}\\b`, "i");
    _kwRegexCache.set(keyword, re);
  }
  return re.test(text);
}
const hasAny = (text, list) => {
  const t = String(text || "");
  return list.some((k) => matchesKeyword(t, k));
};

// Underwriting-policy terms must start at a word boundary, but may be truncated at the end
// ("equipment financ", "tax ref"). A plain substring would read MERCHANT as the "erc" tax credit
// and pull ordinary card deposits out of true revenue.
const _policyRegexCache = new Map();
const hasPolicyTerm = (text, list) => {
  const t = String(text || "");
  return list.some((k) => {
    let re = _policyRegexCache.get(k);
    if (!re) {
      const esc = k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      re = new RegExp(`\\b${esc}`, "i");
      _policyRegexCache.set(k, re);
    }
    return re.test(t);
  });
};

// Plain substring match (case-insensitive). Used for the financing/position keywords,
// which the spec wants matched as "descriptions containing" the word (e.g. "PeopleFund").
const hasAnySub = (text, list) => {
  const t = lc(text);
  return list.some((k) => t.includes(k));
};

/** Money proto → Number. normalizedValue.moneyValue = { units, nanos, currencyCode }. */
function moneyToNumber(moneyValue) {
  if (!moneyValue) return null;
  const units = Number(moneyValue.units || 0);
  const nanos = Number(moneyValue.nanos || 0);
  const val = units + nanos / 1e9;
  return Number.isFinite(val) ? val : null;
}

/** Best-effort parse of a currency-looking string like "$1,234.56" or "(1,234.56)". */
function parseAmountString(str) {
  if (str == null) return null;
  const raw = String(str).trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || /-\s*[\d$]/.test(raw);
  const num = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num)) return null;
  return negative ? -num : num;
}

function parseDateLoose(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Read a nested Document AI entity property value (money → date → mentionText). */
function propValue(prop) {
  if (!prop) return null;
  const nv = prop.normalizedValue;
  if (nv?.moneyValue) return moneyToNumber(nv.moneyValue);
  if (nv?.text) return nv.text;
  return prop.mentionText || null;
}

// Exact property-type match (case-insensitive). IMPORTANT: must be exact — the
// Bank Statement Parser emits both `transaction_deposit` (the amount) and
// `transaction_deposit_date`; a substring match on "deposit" would grab the date.
function propExact(entity, type) {
  if (!entity?.properties) return null;
  return entity.properties.find((p) => lc(p.type) === type) || null;
}
// Match by suffix, for the date/description fields (`*_deposit_date`, etc.).
function propEndsWith(entity, suffix) {
  if (!entity?.properties) return null;
  return entity.properties.find((p) => lc(p.type).endsWith(suffix)) || null;
}

// Extract a date embedded in free text, e.g. "6/11/2026 SPARTAN CAP ..." → Date.
function dateFromText(text) {
  const m = String(text || "").match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  let yy = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (yy < 100) yy += 2000;
  const d = new Date(Date.UTC(yy, mm - 1, dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Most frequent amount (to the cent). MCA remittances are a fixed installment, so the
// mode is far more robust than the median when Document AI mis-reads a few rows
// (e.g. grabbing an ID number as the amount).
function modeAmount(amounts) {
  const counts = new Map();
  for (const a of amounts) {
    const k = Number(a).toFixed(2);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = null, bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount || (c === bestCount && best != null && Number(k) < Number(best))) {
      best = k;
      bestCount = c;
    }
  }
  return { value: best != null ? Number(best) : 0, count: bestCount };
}

// Pull a trailing currency amount out of a description like "NSF FEE 35.00"
// (some rows put the amount inside the description text). Returns { amount, cleaned }.
function splitTrailingAmount(desc) {
  const s = String(desc || "").trim();
  const m = s.match(/(\(?-?\$?\s?\d[\d,]*\.\d{2}\)?)\s*$/);
  if (!m) return { amount: null, cleaned: s };
  return { amount: parseAmountString(m[1]), cleaned: s.slice(0, m.index).trim() };
}

/**
 * Extract transactions from Document AI entities (Bank Statement Parser v5 shape).
 * Each row is a `table_item` with either deposit or withdrawal properties:
 *   transaction_deposit (money) / transaction_deposit_date / transaction_deposit_description
 *   transaction_withdrawal (money) / transaction_withdrawal_date / transaction_withdrawal_description
 * Returns [{ date, description, amount, direction }], amount always positive.
 */
function transactionsFromEntities(entities) {
  const txns = [];

  const buildSide = (e, kind) => {
    // kind: "deposit" (credit) or "withdrawal" (debit)
    const amtProp = propExact(e, `transaction_${kind}`);
    const descProp = propEndsWith(e, `${kind}_description`);
    const dateProp = propEndsWith(e, `${kind}_date`);
    if (!amtProp && !descProp) return null;

    let description = String(propValue(descProp) || "").trim();
    // The untouched description exactly as Document AI read it (for display).
    const rawDescription = description || String(e.mentionText || "").trim();
    let amount = null;
    const av = amtProp ? propValue(amtProp) : null;
    if (typeof av === "number") amount = av;
    else if (av != null) amount = parseAmountString(av);

    // Fallback: amount embedded in the description text.
    if (amount == null && description) {
      const split = splitTrailingAmount(description);
      if (split.amount != null) {
        amount = split.amount;
        description = split.cleaned || description;
      }
    }
    if (amount == null || amount === 0) return null;

    const dateStr = propValue(dateProp);
    let date = parseDateLoose(typeof dateStr === "string" ? dateStr : null);
    // Fallback: many rows embed the date at the start of the description ("6/11/2026 ...").
    if (!date) date = dateFromText(description);
    return {
      date,
      description: description || rawDescription,
      rawDescription,
      amount: Math.abs(amount),
      direction: kind === "deposit" ? "credit" : "debit",
    };
  };

  const walk = (list) => {
    for (const e of list || []) {
      if (lc(e.type).includes("table_item") || lc(e.type).includes("transaction")) {
        const credit = buildSide(e, "deposit");
        const debit = buildSide(e, "withdrawal");
        if (credit) txns.push(credit);
        if (debit) txns.push(debit);
      }
      if (e.properties?.length) walk(e.properties);
    }
  };
  walk(entities);
  return txns;
}

/**
 * Fallback: parse transactions from raw OCR text lines when the processor returns no
 * structured entities (e.g. a generic Document OCR processor). Looks for lines that end
 * with a currency amount and contain a leading date.
 */
function transactionsFromText(text) {
  const txns = [];
  if (!text) return txns;
  const lines = String(text).split(/\r?\n/);
  const dateRe = /^\s*(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{4}-\d{2}-\d{2})/;
  const amtRe = /\(?-?\$?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?\s*$/;
  for (const line of lines) {
    const dm = line.match(dateRe);
    const am = line.match(amtRe);
    if (!dm || !am) continue;
    const amount = parseAmountString(am[0]);
    if (amount == null || amount === 0) continue;
    const description = line
      .replace(dateRe, "")
      .replace(amtRe, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    txns.push({
      date: parseDateLoose(dm[1]),
      description,
      amount: Math.abs(amount),
      // Sign / parentheses imply a debit; otherwise assume credit.
      direction: amount < 0 ? "debit" : "credit",
    });
  }
  return txns;
}

/**
 * Remove a statement's own section totals from the transaction list.
 *
 * Statements end each section with a summary line — "Total Electronic
 * Withdrawals $8,072.00", "Total Fees $204.00" — and Document AI's bank
 * statement parser happily returns those as transactions. They then sit
 * alongside the very rows they summarise, so that section is counted twice.
 * On the statement this was written for, the $8,072.00 electronic-withdrawals
 * total was being added to the three withdrawals it totals.
 *
 * Two signatures, both conservative:
 *
 *   - the description itself reads as a section total ("Total ...");
 *   - the row has NO date and its amount exactly equals one of the category
 *     totals from the statement's own summary block.
 *
 * Both conditions are deliberately narrow.
 *
 * The amounts come from the summary block rather than from scraping near
 * "Total ..." labels in the body, because the body linearizes unreliably: on
 * the statement this was written for, "$8,072.00" appears on the line BEFORE
 * its "Total Electronic Withdrawals" label, while the line after "Total ATM &
 * Debit Card Withdrawals" is "125.60" — an ordinary card purchase, not the
 * $3,953.84 that label totals. Pairing by proximity would have dropped a real
 * transaction. The summary totals are used only once they satisfy the balance
 * identity, so they are known-good.
 *
 * The undated condition matters too. A genuine transaction can coincide in
 * amount with a section total — a single-transaction section guarantees it —
 * but it will carry the date it posted on. A dated row is therefore never
 * dropped on the amount test alone.
 */
function dropSectionTotals(transactions, sectionTotals) {
  if (!Array.isArray(transactions) || !transactions.length) return transactions || [];

  const totalAmounts = new Set(
    (Array.isArray(sectionTotals) ? sectionTotals : [])
      .filter((v) => Number.isFinite(Number(v)) && Number(v) > 0)
      .map((v) => Math.abs(Number(v)).toFixed(2))
  );

  const describesTotal = (t) =>
    /^total\s/i.test(String(t.description || "").trim()) ||
    /^total\s/i.test(String(t.rawDescription || "").trim());

  return transactions.filter((t) => {
    if (describesTotal(t)) return false;
    if (!t.date && totalAmounts.has(Math.abs(Number(t.amount) || 0).toFixed(2))) return false;
    return true;
  });
}

// Insertion order controls display order in the UI.
const CATEGORY_LABELS = {
  deposits: "Deposits / Revenue",
  cashDeposit: "Cash Deposit",
  remoteDeposit: "Remote Deposit",
  processor: "Card Processor (Stripe/PayPal/Square)",
  mcaCredits: "MCA Credits (Amount Financed)",
  loanInflow: "Loan / Advance Inflow",
  mcaDebits: "MCA / Financing Debits",
  zelle: "Zelle",
  cashApp: "Cash App",
  venmo: "Venmo",
  cardPurchase: "Card Purchases",
  check: "Checks",
  fuel: "Fuel / Fleet",
  impound: "Impound",
  obligations: "Payroll / Tax / Insurance / Utilities",
  wires: "Wires",
  transfers: "Transfers",
  fees: "Bank Fees",
  overdraft: "Overdraft Fees",
  nsf: "NSF / Returned Items",
  // Deductions the policy names explicitly — each is money that is NOT a
  // customer paying for a sale, so it comes out of true revenue.
  loanProceeds: "Loan Proceeds",
  locDraw: "Line of Credit Draw",
  factoring: "Factoring",
  ownerInjection: "Owner Injection",
  returnsReversals: "Returns & Reversals",
  bankCorrection: "Bank Correction",
  feeRefund: "Fee Refund",
  taxRefund: "Tax Refund",
  governmentFunds: "Government Funds",
  insuranceSettlement: "Insurance / Settlement",
  // Red flags — surfaced, not deducted.
  gambling: "Gambling",
  crypto: "Crypto",
  paydayLoan: "Payday / Title Loan",
  levy: "Levy / Garnishment",
  legal: "Legal / Collections",
  stopPayment: "Stop Payment / Blocked ACH",
  debtSettlement: "Debt Settlement",
  other: "Other",
};

// Override values that mean "this counterparty is financing" (direction-mapped in
// categorize + treated as a position in detectPositions).
const FINANCING_OVERRIDES = new Set(["mca", "mcaCredits", "mcaDebits", "loanInflow"]);

// True when a description is a non-financing obligation (payroll/tax/insurance/utility)
// and NOT actually a known MCA/loan lender.
const isNonMcaObligation = (desc) =>
  hasAny(desc, NON_MCA_KEYWORDS) &&
  !hasAny(desc, MCA_TYPE_KEYWORDS) &&
  !hasAny(desc, LOAN_TYPE_KEYWORDS);

/**
 * Assign a single category to a transaction.
 * `overrides` is an object mapping a normalized counterparty key → "mca" | "not_mca",
 * built from user-applied tags. An "mca" tag forces the MCA/financing category (and takes
 * priority over everything); "not_mca" prevents auto-classifying it as financing.
 */
function categorize(txn, overrides, learned) {
  const desc = txn.description;
  const ov = overrides ? overrides[tagKeyFor(desc)] : undefined;
  // Any "this lender is financing" tag maps by direction: credits = the amount financed
  // (MCA Credits), debits = the remittance (MCA Debits). This keeps a lender's funding
  // deposit and its installment debits correctly separated even though they share a key.
  if (FINANCING_OVERRIDES.has(ov)) return txn.direction === "credit" ? "mcaCredits" : "mcaDebits";
  // Any other manual category override forces that exact category.
  if (ov && ov !== "not_mca" && CATEGORY_LABELS[ov]) return ov;

  /* Red flags first, and in either direction. A gambling credit comes out
     of revenue; a gambling debit shows where the cash is going. Both need
     the tag, so this runs before the credit/debit split below. */
  if (hasPolicyTerm(desc, GAMBLING_NAMES) || hasAny(desc, GAMBLING_WORDS)) return "gambling";
  if (hasPolicyTerm(desc, CRYPTO_NAMES) || hasAny(desc, CRYPTO_WORDS)) return "crypto";
  if (hasPolicyTerm(desc, PAYDAY_LOANS)) return "paydayLoan";
  if (hasPolicyTerm(desc, LEVIES_GARNISHMENT)) return "levy";
  if (hasPolicyTerm(desc, STOP_PAYMENT)) return "stopPayment";
  if (hasPolicyTerm(desc, DEBT_SETTLEMENT)) return "debtSettlement";

  // Overdraft + NSF are always surfaced separately, regardless of direction.
  if (txn.direction === "credit" && hasPolicyTerm(desc, FEE_REFUNDS)) return "feeRefund";
  if (hasAny(desc, OVERDRAFT_KEYWORDS)) return "overdraft";
  if (hasAny(desc, NSF_KEYWORDS)) return "nsf";
  // Money-movement rails are their own categories (either direction).
  if (hasAny(desc, ZELLE_KEYWORDS)) return "zelle";
  if (hasAnySub(desc, CASHAPP_KEYWORDS)) return "cashApp";
  if (hasAny(desc, VENMO_KEYWORDS)) return "venmo";
  if (hasAny(desc, CHECK_KEYWORDS) && !hasAny(desc, TRANSFER_KEYWORDS)) return "check";
  if (hasAny(desc, IMPOUND_KEYWORDS)) return "impound";

  // Learned keywords from user tags (auto-grown detection).
  const learnedMca = learned?.mcaKeywords || [];
  const learnedNot = learned?.notMcaKeywords || [];
  const learnedSaysNot = learnedNot.length > 0 && hasAnySub(desc, learnedNot);
  const learnedSaysMca = learnedMca.length > 0 && hasAnySub(desc, learnedMca);
  const financing =
    ov !== "not_mca" && !learnedSaysNot && (isFinancing(desc) || learnedSaysMca) && !isNonMcaObligation(desc);

  // Wires are their own category, distinct from ACH/book transfers (either direction).
  if (hasAny(desc, WIRE_KEYWORDS)) return "wires";

  if (txn.direction === "credit") {
    if (hasAny(desc, REMOTE_DEPOSIT_KEYWORDS)) return "remoteDeposit";
    if (hasAny(desc, CASH_DEPOSIT_KEYWORDS)) return "cashDeposit";

    // Named deduction groups first — several would be swallowed by the
    // broader financing and processor tests below.
    if (hasPolicyTerm(desc, RETURNS_REVERSALS)) return "returnsReversals";
    if (hasPolicyTerm(desc, FEE_REFUNDS)) return "feeRefund";
    if (hasPolicyTerm(desc, TAX_REFUNDS)) return "taxRefund";
    if (hasPolicyTerm(desc, GOVERNMENT_FUNDS)) return "governmentFunds";
    if (hasPolicyTerm(desc, OWNER_INJECTION)) return "ownerInjection";
    if (hasPolicyTerm(desc, LOC_DRAW)) return "locDraw";
    if (hasPolicyTerm(desc, FACTORING)) return "factoring";
    if (hasPolicyTerm(desc, LOAN_PROCEEDS)) return "loanProceeds";
    if (hasPolicyTerm(desc, INSURANCE_SETTLEMENT)) return "insuranceSettlement";
    if (hasPolicyTerm(desc, BANK_CORRECTIONS)) return "bankCorrection";

    // A platform lender paying out, before the processor test catches the
    // same brand name selling card services.
    if (hasPolicyTerm(desc, FINTECH_FINANCING)) return "mcaCredits";
    if (hasAny(desc, PROCESSOR_KEYWORDS)) return "processor";
    if (financing) return "mcaCredits";

    if (hasAny(desc, TRANSFER_KEYWORDS)) return "transfers";
    return "deposits";
  }
  // debit — financing (MCA/loan repayment) is checked before processor so a PayPal
  // Working Capital remittance isn't miscounted as processor revenue.
  if (financing) return "mcaDebits";
  // Debit side only: a credit from a law firm is a settlement, not a cost.
  if (hasPolicyTerm(desc, LEGAL_DEBITS)) return "legal";
  if (isNonMcaObligation(desc)) return "obligations";
  if (hasAny(desc, PROCESSOR_KEYWORDS)) return "processor";
  if (hasAny(desc, FEE_KEYWORDS)) return "fees";
  if (hasAny(desc, CARD_KEYWORDS)) return "cardPurchase";
  if (hasAny(desc, FUEL_KEYWORDS)) return "fuel";
  if (hasAny(desc, TRANSFER_KEYWORDS)) return "transfers";
  return "other";
}

/** Normalize a description into a grouping key for recurrence detection. */
function counterpartyKey(description) {
  return lc(description)
    .replace(/\b\d{2,}\b/g, "")       // strip long digit runs (ids, dates)
    .replace(/[^a-z ]/g, " ")          // keep letters
    .replace(/\b(ach|debit|pmt|payment|withdrawal|des|id|ppd|ccd|web|co)\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)                       // first few significant words
    .join(" ")
    .trim();
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function inferFrequency(dates) {
  const valid = dates.filter(Boolean).map((d) => d.getTime()).sort((a, b) => a - b);
  if (valid.length < 2) return "Monthly";
  const gaps = [];
  for (let i = 1; i < valid.length; i++) {
    const g = (valid[i] - valid[i - 1]) / (1000 * 60 * 60 * 24);
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return "Monthly";
  // Use the MODE of the day-gaps (rounded) rather than the median. Daily MCA remits are
  // weekday-only, so a Fri→Mon gap of 3 is normal and a few missed days or a month boundary
  // would inflate the median — the most COMMON gap is the reliable cadence signal.
  const counts = new Map();
  for (const g of gaps) { const k = Math.round(g); counts.set(k, (counts.get(k) || 0) + 1); }
  let modeGap = null, best = 0;
  for (const [k, c] of counts) if (c > best) { best = c; modeGap = k; }
  // Fall back to the median only when no gap repeats (mode is just noise).
  const g = best >= 2 ? modeGap : median(gaps);
  if (g <= 3) return "Daily";       // 1–3 day gaps (weekday daily, incl. weekend skips)
  if (g <= 10) return "Weekly";     // ~7
  if (g <= 20) return "Bi-weekly";  // ~14
  return "Monthly";                 // ~30 (one remittance a month)
}

// Curated clean display names for known lenders whose raw ACH descriptions are noisy or
// truncated. Keyed by the MCA_LENDER_KEYWORDS token that matched (the position group key).
const LENDER_DISPLAY_NAMES = {
  "forward financin": "Forward Financing",
  "olympus": "Olympus Business Capital",
  "pinnacle business": "Pinnacle Business Capital",
  "pinnaclebus": "Pinnacle Business Capital",
  "the fundwork": "The Fundworks",
  "fundwork": "The Fundworks",
  "path 2 capital": "Path 2 Capital",
  "mnr capital": "MNR Capital",
};

// Build a readable lender label: pick a representative description, strip ACH/ref
// noise and digits, de-duplicate repeated words, and title-case.
function cleanLenderName(items, key) {
  // Known lender → use its curated display name (avoids truncated/leaked ACH text).
  if (key && key.startsWith("lender:") && LENDER_DISPLAY_NAMES[key.slice(7)]) {
    return LENDER_DISPLAY_NAMES[key.slice(7)];
  }
  const descs = items.map((t) => t.description).filter(Boolean);
  // Prefer the shortest description with >= 2 words (avoids wrapped/mashed long lines).
  let base =
    descs.slice().sort((a, b) => a.length - b.length).find((d) => d.trim().split(/\s+/).length >= 2) ||
    descs[0] ||
    key;
  // ACH layout is "PAYEE DES:… ID:… INDN:<account holder> CO" — keep only the payee before
  // the first field marker so the originator/account-holder name doesn't leak into the label.
  base = String(base).split(/\s(?:DES|ID|INDN|CO ID|SEQ|ORIG)\s*:/i)[0] || base;
  let s = String(base)
    .replace(/\b(ref|reference|trace|conf|confirmation|id)\s*#?\s*:?\s*\w+.*$/i, "")
    .replace(/\b(ach|debit|withdrawal|pmt|payment|des|ppd|ccd|web|autopay|autopa|recur|recurring|trans|transaction|to|from|pos|purchase|pin|eft|wpin|dda|checkcard|card)\b/gi, " ")
    .replace(/\d{3,}/g, " ")
    .replace(/[^a-zA-Z& ]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const words = s.split(" ").filter((w) => w && w.length > 1); // drop stray single letters (e.g. "W")
  const dedup = [];
  for (const w of words) {
    if (!dedup.length || dedup[dedup.length - 1].toLowerCase() !== w.toLowerCase()) dedup.push(w);
  }
  s = dedup.slice(0, 4).join(" ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return s.slice(0, 45) || key;
}

/**
 * Detect MCA / financing positions.
 * Per spec: any DEBIT whose description contains a financing keyword (funding, capital,
 * loan, fund, advance, cash advance, lending, lend, cap, finance) is a position.
 * Matching debits are grouped by counterparty so recurring remittances collapse into one
 * position with an inferred frequency + installment; one-off matches are shown too.
 */
// The grouping key that decides which debits belong to the SAME position. When a known
// MCA lender name appears in the description, all of that lender's payments collapse into
// one position (even if ref numbers / wrapped text differ); otherwise fall back to the
// cleaned counterparty words.
function positionGroupKey(description) {
  const lcDesc = lc(description);
  const known = MCA_LENDER_KEYWORDS.find((k) => lcDesc.includes(k));
  if (known) return `lender:${known}`;
  // Group by the first significant word (the payee/lender name) so the same lender's
  // payments merge even when trailing tokens differ ("SPLASHADVANCELLC ACHPAYMENT" vs
  // "...ACHPAYME"). Fall back to the first two words for short first tokens.
  const words = (counterpartyKey(description) || lcDesc).split(" ").filter(Boolean);
  if (words[0] && words[0].length >= 5) return `payee:${words[0]}`;
  return `payee:${words.slice(0, 2).join(" ")}` || lcDesc.slice(0, 20);
}

// Normalized key used to remember a user's MCA/not-MCA tag for a counterparty so it can
// be applied to this and future statements. Same normalization as position grouping.
function tagKeyFor(description) {
  return positionGroupKey(description);
}

// A debit remittance above this is a Document AI mis-read (e.g. an ID parsed as the
// amount), never a real MCA installment — excluded from installment/total math.
const SANE_AMOUNT_MAX = 1_000_000;

// Detect an implausible amount for its category (a Document AI mis-read). Fees/NSF/
// overdraft are always small in reality, so a large value there is certainly wrong; other
// categories only flag truly enormous values. Flagged amounts are shown but excluded from
// totals and running balances so one bad row doesn't wreck the numbers.
function isSuspectAmount(amount, category) {
  if (category === "overdraft" || category === "nsf") return amount > 500;
  if (category === "fees") return amount > 2000;
  return amount >= SANE_AMOUNT_MAX;
}

// Classify a position as MCA vs LOAN from its member descriptions (user taxonomy).
// LOAN wins only when a loan keyword matches and no MCA signal is present; generic
// financing (funding/advance/cap) with no explicit loan wording defaults to MCA.
function classifyPositionType(items) {
  const anyMca = items.some((t) => hasAny(t.description, MCA_TYPE_KEYWORDS));
  const anyLoan = items.some((t) => hasAny(t.description, LOAN_TYPE_KEYWORDS));
  if (anyLoan && !anyMca) return "LOAN";
  return "MCA";
}

function detectPositions(debits, overrides, learned) {
  const learnedMca = learned?.mcaKeywords || [];
  const learnedNot = learned?.notMcaKeywords || [];
  // Broad financing detection, but drop non-financing obligations (payroll/tax/insurance
  // /utility) unless they are a known MCA/loan lender. A user "mca" tag force-includes a
  // counterparty; a "not_mca" tag (or a learned not-MCA keyword) force-excludes it.
  const financing = debits.filter((t) => {
    const ov = overrides ? overrides[tagKeyFor(t.description)] : undefined;
    if (ov === "not_mca") return false;
    if (FINANCING_OVERRIDES.has(ov)) return true;
    // Reclassified to a specific non-financing category → not a position.
    if (ov && CATEGORY_LABELS[ov]) return false;
    if (learnedNot.length && hasAnySub(t.description, learnedNot)) return false;
    const isFin = isFinancing(t.description) || (learnedMca.length && hasAnySub(t.description, learnedMca));
    return isFin && !isNonMcaObligation(t.description);
  });

  const groups = new Map();
  for (const t of financing) {
    const key = positionGroupKey(t.description);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  const positions = [];
  for (const [key, items] of groups) {
    const sorted = [...items].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
    // Ignore mis-read giant amounts when computing the installment/total.
    const sane = sorted.filter((t) => t.amount < SANE_AMOUNT_MAX);
    const amtSource = sane.length ? sane : sorted;

    // Installment = most common amount (robust to a few mis-read rows); median as fallback.
    const mode = modeAmount(amtSource.map((t) => t.amount));
    const installmentNum = sane.length === 0
      ? null
      : mode.count >= 2
        ? mode.value
        : round2(median(amtSource.map((t) => t.amount)));

    // Payments matching that installment are the "clean" remittances metrics are based on.
    const tol = installmentNum ? Math.max(installmentNum * 0.15, 1) : 0;
    const matched = installmentNum ? sane.filter((t) => Math.abs(t.amount - installmentNum) <= tol) : [];
    const basis = matched.length ? matched : (sane.length ? sane : sorted);

    const dates = basis.map((t) => t.date).filter(Boolean);
    const frequency = basis.length >= 2 ? inferFrequency(dates) : "One-time";
    const totalPaid = matched.length
      ? matched.reduce((s, t) => s + t.amount, 0)
      : sane.reduce((s, t) => s + t.amount, 0);
    const isKnownLender = sorted.some((t) => hasAny(t.description, MCA_LENDER_KEYWORDS));
    const perMonth = FREQUENCY_MULTIPLIER[frequency];

    positions.push({
      lender: cleanLenderName(sorted, key),
      type: classifyPositionType(sorted),
      frequency,
      installment: installmentNum != null ? String(round2(installmentNum)) : "",
      amountFunded: "", // set later by funding-credit linkage
      fundingDate: "",
      status: "Active",
      occurrences: basis.length,
      firstDate: dates[0] ? dates[0].toISOString().slice(0, 10) : "",
      lastDate: dates[dates.length - 1] ? dates[dates.length - 1].toISOString().slice(0, 10) : "",
      totalPaidInStatement: round2(totalPaid),
      monthlyMcaPmts: perMonth && installmentNum ? String(round2(installmentNum * perMonth)) : "",
      isKnownLender,
      confidence: isKnownLender ? "high" : basis.length >= 3 ? "medium" : "low",
      // Current user trust tag for this lender ("mca" = confirmed, "" = auto/unconfirmed).
      mcaTag: overrides && overrides[key] ? overrides[key] : "",
      // All grouped debits (incl. any mis-read outliers) for the collapsible detail view.
      transactions: sorted.map((t) => ({
        date: t.date ? t.date.toISOString().slice(0, 10) : "",
        description: t.description || "",
        amount: round2(t.amount),
      })),
    });
  }

  positions.sort((a, b) => b.totalPaidInStatement - a.totalPaidInStatement || b.occurrences - a.occurrences);
  return positions;
}

// Classify a position's repayment status from its dated repayments and the period end date:
//   One Time     – a single repayment (the full advance repaid in one payment)
//   Lower        – the remittance dropped to a stable lower amount partway (e.g. $500 → $400/day)
//   Paid in Full – repayments stopped and the amount repaid reached the expected payback
//   Stop         – repayments stopped well before the period end (no longer remitting)
//   Active       – still remitting at/near the period end
function computeRepayStatus(pos, periodEndISO) {
  const txns = (pos.transactions || [])
    .map((t) => ({ d: t.date ? new Date(t.date) : null, a: Number(t.amount) || 0 }))
    .filter((t) => t.d && !isNaN(t.d) && t.a > 0 && t.a < SANE_AMOUNT_MAX)
    .sort((a, b) => a.d - b.d);
  const n = txns.length;
  if (n === 0) return "Active";
  if (n === 1) return "One Time";

  const freq = pos.frequency || "";
  const dayMs = 86400000;
  const lastDate = txns[n - 1].d;
  const periodEnd = periodEndISO ? new Date(periodEndISO) : lastDate;
  const gapDays = Math.max(0, Math.round((periodEnd - lastDate) / dayMs));
  // "Stopped" = no payment for markedly longer than the payment interval before the period end.
  const stopThreshold = freq === "Daily" ? 10 : freq === "Weekly" ? 24 : freq === "Bi-weekly" ? 40 : 45;

  // Detect a LOWERED remittance: modal amount of the later payments vs the earlier payments.
  const modeOf = (arr) => {
    const m = new Map();
    for (const v of arr) { const k = Math.round(v); m.set(k, (m.get(k) || 0) + 1); }
    let best = null, bc = 0;
    for (const [k, c] of m) if (c > bc) { bc = c; best = k; }
    return best;
  };
  const split = Math.max(1, Math.floor(n * 0.6));
  const earlyMode = modeOf(txns.slice(0, split).map((t) => t.a));
  const lateMode = modeOf(txns.slice(split).map((t) => t.a));
  const lowered = earlyMode && lateMode && lateMode < earlyMode * 0.85 && (n - split) >= 2;

  if (gapDays <= stopThreshold) {
    return lowered ? "Lower" : "Active";
  }
  // Payments stopped before the period end. Paid in Full when the total repaid reached the
  // expected payback — without a factor rate we treat "repaid ≥ the funded amount" as completion.
  const funded = Number(pos.amountFunded) || 0;
  const totalPaid = Number(pos.totalPaidInStatement) || txns.reduce((s, t) => s + t.a, 0);
  if (funded > 0 && totalPaid >= funded * 0.98) return "Paid in Full";
  return "Stop";
}

const MON_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Extract the statement's opening/beginning balance from the OCR text. The amount may be on
 * the same line as the label, or on the line just before/after it (multi-column layouts).
 * This is the anchor for the daily running-balance calc.
 */
function extractOpeningBalance(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const labelRe = /(beginning|opening|previous|prior)\s+balance|balance\s+(forward|brought forward|b\/f)/i;
  const pureAmtRe = /^\(?-?\$?[\d,]+\.\d{2}\)?$/;
  const inlineAmtRe = /\(?-?\$?[\d,]+\.\d{2}\)?/;
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i])) continue;
    // Same line (e.g. "Beginning Balance  $12,733.08")
    const stripped = lines[i].replace(labelRe, "").trim();
    if (inlineAmtRe.test(stripped)) return parseAmountString(stripped.match(inlineAmtRe)[0]);
    // Adjacent lines — prefer the amount immediately before the label (typical statement
    // summary layout), then the lines after.
    for (const j of [i - 1, i + 1, i - 2, i + 2]) {
      if (j >= 0 && j < lines.length && pureAmtRe.test(lines[j])) return parseAmountString(lines[j]);
    }
  }
  return null;
}

/**
 * Reconcile against the statement's OWN stated totals. Statements print authoritative
 * figures the OCR/entity extraction can't be trusted to reproduce (e.g. checks in a
 * separate section). We parse:
 *   - "N (checks|items|deposits|credits|debits|withdrawals) totaling $X" phrases, and
 *   - Beginning / Ending balance,
 * then derive the missing credit/debit side from the balance identity:
 *   ending = beginning + credits - debits.
 * Returns { statedCredits, statedDebits, beginning, ending, creditCount, debitCount } —
 * any field may be null when not confidently found.
 */
function parseStatementTotals(text) {
  if (!text) return {};
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const round2 = (n) => Math.round(n * 100) / 100;

  // Track which section each "N ... totaling $X" phrase falls under. The word alone is
  // ambiguous ("68 items" can be deposits OR withdrawals), so we use the nearest section
  // heading. Dedupe by (count, amount) so page-continuation repeats aren't double-counted.
  const depHdr = /deposit|credit|addition/i;
  const debHdr = /withdrawal|debit|checks? paid|^checks?$|fees?|card (purchase|withdrawal)/i;
  const totalingRe = /(\d[\d,]*)\s+[a-z\/ .]+?\s+totaling\s+\(?\$?\s?([\d,]+\.\d{2})/i;
  // Activity-summary line format used by many banks: "20 Deposits/Credits $19,528.50" /
  // "217 Checks/Debits $19,320.88" (count + labelled total, no "totaling"). Authoritative.
  const summaryLineRe = /^(\d[\d,]*)\s+(deposits?\s*\/?\s*credits?|credits?\s*\/?\s*deposits?|checks?\s*\/?\s*debits?|debits?\s*\/?\s*checks?|withdrawals?(?:\s*\/?\s*debits?)?)\s+\$?([\d,]+\.\d{2})\b/i;
  let section = null;
  const cSeen = new Set(), dSeen = new Set();
  let cAmt = 0, cCnt = 0, dAmt = 0, dCnt = 0, sawC = false, sawD = false;
  // Authoritative single-line totals (take priority over summed "totaling" phrases).
  let summaryCr = null, summaryDr = null, summaryCrCnt = null, summaryDrCnt = null;
  // True when the statement's own summary block was read AND satisfies the
  // balance identity to the cent. That is proof, not a heuristic, so these
  // figures are shown as the statement's rather than as an estimate.
  let statedExact = false;
  let sectionTotals = [];
  for (const l of lines) {
    // Section heading updates (a heading line is short and has no amount).
    if (!/\d\.\d{2}/.test(l)) {
      if (depHdr.test(l) && !debHdr.test(l)) section = "credit";
      else if (debHdr.test(l)) section = "debit";
    }
    // Authoritative summary line ("N Deposits/Credits $X").
    const sm = l.match(summaryLineRe);
    if (sm) {
      const cnt2 = Number(sm[1].replace(/,/g, ""));
      const val2 = Number(sm[3].replace(/,/g, ""));
      if (Number.isFinite(val2)) {
        if (/debit|check|withdrawal/i.test(sm[2])) { summaryDr = val2; summaryDrCnt = cnt2; }
        else { summaryCr = val2; summaryCrCnt = cnt2; }
      }
      continue;
    }
    const m = l.match(totalingRe);
    if (!m) continue;
    const cnt = Number(m[1].replace(/,/g, ""));
    const val = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(val)) continue;
    // Prefer an explicit direction word on the line; else fall back to the section.
    const dir = depHdr.test(l) ? "credit" : /check|withdrawal|debit/i.test(l) ? "debit" : section;
    if (!dir) continue;
    const key = `${cnt}|${val.toFixed(2)}`;
    if (dir === "credit") { if (cSeen.has(key)) continue; cSeen.add(key); cAmt += val; cCnt += cnt; sawC = true; }
    else { if (dSeen.has(key)) continue; dSeen.add(key); dAmt += val; dCnt += cnt; sawD = true; }
  }

  let beginning = extractOpeningBalance(text);
  // Ending balance: label + nearest currency amount (scan a wider window for column layouts).
  let ending = null;
  const endRe = /(ending|closing|new)\s+balance|balance\s+this\s+statement/i;
  const pureAmtRe = /^\(?-?\$?[\d,]+\.\d{2}\)?$/;
  for (let i = 0; i < lines.length && ending == null; i++) {
    if (!endRe.test(lines[i])) continue;
    const inline = lines[i].replace(endRe, "").match(/\(?-?\$?[\d,]+\.\d{2}\)?/);
    if (inline) { ending = Math.abs(parseAmountString(inline[0])); break; }
    for (const j of [i + 1, i - 1, i + 2, i + 3, i - 2]) {
      if (j >= 0 && j < lines.length && pureAmtRe.test(lines[j])) { ending = Math.abs(parseAmountString(lines[j])); break; }
    }
  }

  // Chase CHECKING SUMMARY — the statement's own figures, which outrank
  // anything summed from extracted rows.
  //
  // Document AI linearizes this columnar block one of two ways:
  //
  //   interleaved  Beginning Balance / -$1,807.96 / Deposits and Additions /
  //                2 / 12,196.50 / ATM & Debit Card Withdrawals / 48 / …
  //
  //   split        Beginning Balance / Deposits and Additions / ATM & Debit
  //                Card Withdrawals / Electronic Withdrawals / Fees / Ending
  //                Balance … AMOUNT … -$1,807.96 / 2 / 12,196.50 / 48 /
  //                -3,953.84 / 3 / -8,072.00 / 6 / 59 / -204.00 / -$1,841.30
  //
  // Both reduce to one rule: the Nth label takes the Nth MONEY value (a value
  // with cents). Instance counts are bare integers and are skipped — note the
  // 59 above arrives out of order, between the 6 and the -204.00, so counts
  // cannot be used to align the columns.
  //
  // The previous version looked a few lines past each label for an amount and
  // gave up on reaching another label. In the split layout every label is
  // followed by another label, so it read nothing at all and the totals fell
  // back to summing extracted rows — which is how debits came out at
  // $20,026.44 against a stated $12,229.84.
  //
  // The zip is accepted only if it satisfies the balance identity
  // (beginning + credits − debits = ending) to the cent. A misaligned read
  // cannot pass that by accident, which is what makes trusting these figures
  // safe rather than merely convenient.
  if (summaryCr == null && /deposits?\s+and\s+additions?/i.test(text)) {
    const SUMMARY_LABELS = [
      [/^beginning\s+balance\b/i, "beginning"],
      [/^deposits?\s+and\s+additions?$/i, "credit"],
      [/^checks?\s+paid$/i, "debit"],
      [/^atm\s*&?\s*debit\s+card\s+withdrawals?$/i, "debit"],
      [/^electronic\s+withdrawals?$/i, "debit"],
      [/^fees?(?:\s+and\s+other\s+withdrawals?)?$/i, "debit"],
      [/^other\s+withdrawals?$/i, "debit"],
      [/^ending\s+balance\b/i, "ending"],
    ];
    const kindOf = (l) => {
      for (const [re, kind] of SUMMARY_LABELS) if (re.test(l)) return kind;
      return null;
    };

    const hdr = lines.findIndex((l) => /^checking\s+summary/i.test(l.trim()));
    if (hdr >= 0) {
      const kinds = [];
      const values = [];
      // Bounded so a failed read cannot wander into the transaction detail and
      // start collecting row amounts as though they were summary figures.
      const limit = Math.min(lines.length, hdr + 80);
      for (let i = hdr + 1; i < limit; i++) {
        const t = lines[i].trim();
        if (!t) continue;
        if (/^(instances?|amount)$/i.test(t)) continue;
        if (/^\d{1,4}$/.test(t)) continue; // instance count

        // Shared parser: a negative may be written -1,807.96, -$1,807.96,
        // $-1,807.96 or (1,807.96), and all four occur in bank output.
        const v = moneyLine(t);
        if (v != null) {
          values.push(v);
          continue;
        }

        const k = kindOf(t);
        if (k) {
          kinds.push(k);
          continue;
        }

        // Prose ends the block — but only once it has actually started. Before
        // then this is the product name ("Chase Business Complete Checking") or
        // a stray column header, which sits between the heading and the first
        // label in both layouts.
        //
        // Neither a label nor a value may terminate the scan: in the
        // interleaved layout they alternate, so stopping at "the first value
        // after a label" would read one row and quit.
        if (kinds.length && values.length) break;
      }

      if (kinds.length && kinds.length === values.length) {
        let begC = null;
        let endC = null;
        let crC = null;
        const debParts = [];
        for (let i = 0; i < kinds.length; i++) {
          const v = values[i];
          if (kinds[i] === "beginning") begC = v;
          else if (kinds[i] === "ending") endC = v;
          else if (kinds[i] === "credit") crC = (crC || 0) + Math.abs(v);
          else debParts.push(Math.abs(v));
        }
        const summedDeb = round2(debParts.reduce((s, v) => s + v, 0));

        // The identity is the proof. Signs are preserved here, so an account
        // that ran negative all month reconciles the same as one that did not.
        const identityHolds =
          begC != null && endC != null && crC != null &&
          Math.abs(begC + crC - summedDeb - endC) <= 0.01;

        if (identityHolds) {
          summaryCr = round2(crC);
          summaryDr = summedDeb;
          // The per-category totals, now proven by the identity. Used to spot a
          // section total that Document AI returned as though it were a row.
          sectionTotals = [crC, ...debParts].map((v) => round2(Math.abs(v)));
          beginning = begC;
          ending = endC;
          statedExact = true;
        } else if (crC != null && crC > 0) {
          // Could not prove it. Fall back to the old behaviour — use the
          // credits, and derive debits from the identity when the balances are
          // known — but leave statedExact false so nothing downstream treats
          // these as confirmed.
          summaryCr = round2(crC);
          if (beginning == null && begC != null) beginning = begC;
          if (endC != null) ending = endC;
          const beg = beginning != null ? beginning : begC;
          if (beg != null && endC != null) {
            const identityDeb = beg + crC - endC;
            if (debParts.length && Math.abs(summedDeb - identityDeb) <= Math.max(2, Math.abs(identityDeb) * 0.02)) {
              summaryDr = summedDeb;
            } else if (identityDeb > 0) {
              summaryDr = round2(identityDeb);
            } else if (debParts.length) {
              summaryDr = summedDeb;
            }
          } else if (debParts.length) {
            summaryDr = summedDeb;
          }
        }
      }
    }
  }

  // Bank of America "Account summary" block. Document AI linearizes it as a block of LABELS
  // followed by a matching column of AMOUNTS:
  //   Beginning balance on <date> / Deposits and other credits / Withdrawals and other debits /
  //   Checks / Service fees   THEN   $202,130.47 / 1,213,378.68 / -1,190,286.01 / -0.00 / -120.00
  // The amount column is ordered [Beginning, Deposits(credits), Withdrawals(debits), Checks, ...].
  if (summaryCr == null) {
    const depIdx = lines.findIndex((l) => /^deposits?\s+and\s+other\s+credits?$/i.test(l.trim()));
    const debIdx = lines.findIndex((l) => /^withdrawals?\s+and\s+other\s+debits?$/i.test(l.trim()));
    if (depIdx >= 0 && debIdx >= 0) {
      // The amount column begins after the label block: scan forward from the deposits label for
      // the first pure-amount line, then collect the consecutive amount run.
      let start = -1;
      for (let i = depIdx; i < Math.min(depIdx + 8, lines.length); i++) {
        if (/^\(?-?\$?[\d,]+\.\d{2}\)?$/.test(lines[i].trim())) { start = i; break; }
      }
      if (start >= 0) {
        const amts = [];
        for (let i = start; i < Math.min(start + 8, lines.length); i++) {
          const mm = lines[i].trim().match(/^\(?(-?)\$?\s?([\d,]+\.\d{2})\)?$/);
          if (!mm) break;
          let v = parseFloat(mm[2].replace(/,/g, ""));
          if (mm[1] === "-") v = -v;
          amts.push(v);
        }
        // [Beginning(+), Deposits(+), Withdrawals(−), ...]. Require the expected signs so a
        // different amount block can't be mis-mapped.
        if (amts.length >= 3 && amts[0] > 0 && amts[1] > 0 && amts[2] < 0) {
          summaryCr = round2(amts[1]);
          summaryDr = round2(Math.abs(amts[2]));
          if (beginning == null) beginning = amts[0];
        }
      }
    }
  }

  // Same-line fallback ("Deposits and Additions 58 316,843.60" / "Checks Paid 98 -40,554.44")
  // for banks / text extractions that keep the label and amount together. Debits are the
  // NEGATIVE-signed category lines; positive "Total X" sub-breakdowns are ignored.
  if (summaryCr == null) {
    const catRe = /^(deposits?\s+and\s+additions?|checks?\s+paid|electronic\s+withdrawals?|other\s+withdrawals?|withdrawals?\s+and\s+other\s+debits?|deposits?\s*&\s*(?:additions?|credits?))\b.*?(-)?\$?\s?([\d,]+\.\d{2})\s*$/i;
    let chaseCr = null, chaseDr = 0, sawChaseDr = false;
    for (const l of lines) {
      const m = l.match(catRe);
      if (!m) continue;
      const label = m[1].toLowerCase();
      const neg = m[2] === "-" || /-\s*\$?\s?[\d,]/.test(l);
      const v = Number(m[3].replace(/,/g, ""));
      if (!Number.isFinite(v) || v <= 0) continue;
      if (/deposit|addition|credit/.test(label)) {
        if (chaseCr == null || v > chaseCr) chaseCr = v;
      } else if (neg) {
        chaseDr += v; sawChaseDr = true;
      }
    }
    if (chaseCr != null) { summaryCr = chaseCr; }
    if (sawChaseDr && summaryDr == null) { summaryDr = round2(chaseDr); }
  }

  // Generic labelled totals (broad fallback for other banks): a "Total <Deposits/Credits>" or
  // "Total <Withdrawals/Debits/Checks>" label with its amount on the SAME line or the next
  // non-empty line. Every statement prints these, so this catches most remaining formats.
  {
    const findLabelled = (labelRe) => {
      for (let i = 0; i < lines.length; i++) {
        if (!labelRe.test(lines[i].trim())) continue;
        let m = lines[i].match(/\(?-?\$?\s?([\d,]+\.\d{2})\)?\s*$/); // amount on the same line
        if (m) return Math.abs(Number(m[1].replace(/,/g, "")));
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) { // else the next non-empty line
          const t = lines[j].trim();
          if (!t) continue;
          m = t.match(/^\(?-?\$?\s?([\d,]+\.\d{2})\)?$/);
          if (m) return Math.abs(Number(m[1].replace(/,/g, "")));
          break;
        }
      }
      return null;
    };
    if (summaryCr == null) {
      const c = findLabelled(/^total\s+(deposits?|credits?|additions?|deposits?\s+and\s+(?:additions?|credits?)|deposits?\s*\/?\s*credits?)\b/i);
      if (c != null && c > 0) summaryCr = c;
    }
    if (summaryDr == null) {
      const d = findLabelled(/^total\s+(withdrawals?|debits?|checks?\s+paid|checks?\s*\/?\s*debits?|withdrawals?\s+and\s+(?:other\s+)?debits?)\b/i);
      if (d != null && d > 0) summaryDr = d;
    }
  }

  // Authoritative single-line summary totals win; otherwise the summed "totaling" phrases.
  let statedCredits = summaryCr != null ? round2(summaryCr) : (sawC ? round2(cAmt) : null);
  let statedDebits = summaryDr != null ? round2(summaryDr) : (sawD ? round2(dAmt) : null);
  if (summaryCr != null) { sawC = true; cCnt = summaryCrCnt ?? cCnt; }
  if (summaryDr != null) { sawD = true; dCnt = summaryDrCnt ?? dCnt; }
  // Keep the raw parsed figures (before the reconciliation guard nulls them) so alteration
  // detection can test the statement's OWN printed math even when we don't trust the totals.
  const rawStatedCredits = statedCredits;
  const rawStatedDebits = statedDebits;

  // Self-consistency guard against the balance identity: ending = beginning + credits − debits.
  // Only trust the stated totals when they reconcile with the balances (or derive the missing
  // side from the identity). This blocks garbage from mis-parsed / OCR-scrambled summaries.
  let consistent = false;
  // balanceResidual: how far the statement's own printed figures miss the balance identity.
  // Only meaningful when beginning, ending, and BOTH printed sides were found — then it is a
  // genuine "the numbers on the page don't add up" signal (a hallmark of an altered statement).
  let balanceResidual = null;
  if (beginning != null && ending != null) {
    const net = ending - beginning; // = credits − debits
    if (rawStatedCredits != null && rawStatedDebits != null) {
      balanceResidual = round2((rawStatedCredits - rawStatedDebits) - net);
    }
    if (statedCredits != null && statedDebits != null) {
      consistent = Math.abs((statedCredits - statedDebits) - net) <= Math.max(1, Math.abs(net) * 0.02);
    } else if (statedCredits != null) { statedDebits = round2(statedCredits - net); consistent = true; }
    else if (statedDebits != null) { statedCredits = round2(statedDebits + net); consistent = true; }
  }
  // Without both balances we can't verify — only trust when BOTH sides were explicitly stated.
  if (!consistent && !(beginning != null && ending != null)) {
    consistent = statedCredits != null && statedDebits != null;
  }
  if (!consistent) {
    // The statement's PRINTED totals are authoritative. When BOTH sides were explicitly found,
    // trust them even if they don't reconcile with our balances (which can be off when some
    // transactions weren't extracted). Reconciliation still drives the alteration flag below.
    if (rawStatedCredits != null && rawStatedDebits != null) {
      statedCredits = rawStatedCredits;
      statedDebits = rawStatedDebits;
    } else {
      statedCredits = null;
      statedDebits = null;
    }
  }

  // Flag a real inconsistency only when we have all four printed figures and they miss the
  // identity by a MODERATE amount. A tiny gap is OCR noise; a huge gap (> 25% of the money
  // movement) is almost always a mis-parsed balance/column, not tampering — don't false-flag.
  const movement = (Math.abs(rawStatedCredits || 0) + Math.abs(rawStatedDebits || 0)) || 1;
  const residualAbs = balanceResidual != null ? Math.abs(balanceResidual) : 0;
  const balanceInconsistent =
    balanceResidual != null &&
    residualAbs > Math.max(2, Math.abs(ending - beginning) * 0.01) &&
    residualAbs < movement * 0.25;

  // Printed average daily/ledger balance (authoritative — avoids reconstructing the average from
  // the messy multi-column daily-balance table). BofA: "Average ledger balance: $173,274.90".
  let printedAverageBalance = null;
  {
    // Require a qualifier (ledger/collected/daily/available) and allow only ":"/spaces/"$" before
    // the amount — so fee-waiver prose like "…average ledger balance of $50,000.00 or more" (the
    // amount is preceded by "of") is rejected, but "Average ledger balance: $173,274.90" matches.
    const avgRe = /average\s+(?:ledger|collected|daily|available)\s+balance\s*:?\s*\$?\s?(-?[\d,]+\.\d{2})/i;
    for (const l of lines) {
      const m = l.match(avgRe);
      if (m) {
        const v = parseFloat(m[1].replace(/,/g, ""));
        if (Number.isFinite(v)) { printedAverageBalance = round2(v); break; }
      }
    }
  }

  return {
    statedCredits,
    statedDebits,
    creditCount: statedCredits != null && sawC ? cCnt : null,
    debitCount: statedDebits != null && sawD ? dCnt : null,
    beginning,
    ending,
    printedAverageBalance,
    rawStatedCredits,
    rawStatedDebits,
    balanceResidual,
    balanceInconsistent,
    statedExact,
    sectionTotals,
  };
}

/**
 * Bank of America detail sections ("Deposits and other credits" / "Withdrawals and other
 * debits") frequently get their Date / Description / Amount columns scrambled by Document AI,
 * so a transaction's entity description comes back as just the date (+amount). Within each
 * section the primary description lines and the amounts still appear in the SAME order, so we
 * collect each in order and zip them: the k-th description belongs to the k-th amount.
 * Returns [{ direction, amount, description }] for use in description recovery.
 */
function parseBofaColumnSections(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const secRe = /^(deposits?\s+and\s+other\s+credits?|withdrawals?\s+and\s+other\s+debits?)(\s*[-–—]\s*continued)?$/i;
  const endRe = /^(total\s+(deposits?|withdrawals?)|daily\s+ledger|service\s+fees?|ending\s+balance|beginning\s+balance|account\s+summary|checks?$)/i;
  const dateOnlyRe = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
  const amtRe = /^\(?-?\$?[\d,]+\.\d{2}\)?$/;
  // A continuation / noise line (an ACH detail fragment, not the start of a new description).
  const contRe = /^(co\s|co$|ccd\b|ppd\b|web\b|des:|id:|indn:|a\/c:|via:|ref\b|conf#|orig\b|bnf\b|trn\b|pmt\s+info|\d)/i;
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!secRe.test(lines[i])) { i++; continue; }
    const direction = /credit/i.test(lines[i]) ? "credit" : "debit";
    const descs = [];
    const amts = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (!l) continue;
      if (secRe.test(l) || endRe.test(l)) break;
      if (/^(date|description|amount)$/i.test(l)) continue; // column sub-headers
      if (dateOnlyRe.test(l)) continue;                     // standalone date column
      if (amtRe.test(l)) { amts.push(Math.abs(parseAmountString(l))); continue; }
      // Description line: strip a leading "MM/DD/YY " prefix; classify primary vs continuation.
      const cleaned = l.replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s+/, "").trim();
      if (!cleaned || !/[a-zA-Z]/.test(cleaned)) continue;
      if (contRe.test(cleaned)) {
        if (descs.length) descs[descs.length - 1] = (descs[descs.length - 1] + " " + cleaned).slice(0, 90);
        continue;
      }
      descs.push(cleaned.slice(0, 90));
    }
    // Zip in order — the k-th description is the k-th amount's.
    const n = Math.min(descs.length, amts.length);
    for (let k = 0; k < n; k++) out.push({ direction, amount: amts[k], description: descs[k] });
    i = j;
  }
  return out;
}

/**
 * Some statement layouts make Document AI capture only the date + amount for each row,
 * leaving the description/merchant on separate OCR text lines. This recovers a description
 * from the full OCR text, keyed by "Mon DD|amount", so a row like:
 *   Apr 01 / POS PURCHASE W/PIN / ($500.00) / <balance> / MAVERIK 638
 * yields "MAVERIK 638 POS PURCHASE W/PIN" for that date+amount.
 */
function buildTextDescriptions(text) {
  const map = new Map();
  if (!text) return map;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const dateRe = /^[A-Z][a-z]{2,8}\.?\s+\d{1,2}$/;
  const amtRe = /^\(?-?\$[\d,]+\.\d{2}\)?$/;
  const headerRe = /^(withdrawal|deposit|balance|beginning balance|ending balance|date|description)$/i;
  const skipDetailRe = /^(record no|card no|ref\b|reference|trace|conf\b|seq)/i;
  const add = (key, val) => {
    if (!val) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(val.slice(0, 70));
  };

  for (let i = 0; i < lines.length; i++) {
    if (!dateRe.test(lines[i])) continue;
    const date = lines[i].replace(/\./g, "");
    // First meaningful (non-header) line after the date = transaction type / description.
    let j = i + 1;
    let desc = "";
    while (j < lines.length && !amtRe.test(lines[j]) && !dateRe.test(lines[j])) {
      if (lines[j] && !headerRe.test(lines[j])) { desc = lines[j]; break; }
      j++;
    }
    while (j < lines.length && !amtRe.test(lines[j]) && !dateRe.test(lines[j])) j++;
    if (j >= lines.length || !amtRe.test(lines[j])) continue;
    const amt = Math.abs(parseAmountString(lines[j]));
    j++;
    if (j < lines.length && amtRe.test(lines[j])) j++; // skip balance column
    // Look a few lines ahead for a merchant name (skip RECORD NO / CARD NO / pure numbers).
    let merchant = "";
    for (let k = j; k < lines.length && k < j + 5 && !dateRe.test(lines[k]) && !amtRe.test(lines[k]); k++) {
      const l = lines[k];
      if (l && /[a-zA-Z]/.test(l) && !skipDetailRe.test(l) && !headerRe.test(l) && !/^\d/.test(l)) {
        merchant = l;
        break;
      }
    }
    const payeeDesc = merchant ? `${merchant} ${desc}`.trim() : desc;
    add(`${date}|${amt.toFixed(2)}`, payeeDesc);
  }
  return map;
}

/**
 * Parse full transactions from the OCR text for multi-line statement layouts:
 *   {date} / {description} / {amount} / {balance} / {merchant...}
 * Returns [{ dateStr, amount, direction, description }]. Direction is inferred from
 * parentheses / minus sign on the amount (withdrawal → debit). Used both to recover
 * descriptions and to fill in transactions Document AI's table extraction missed.
 */
function parseTextTransactions(text) {
  const out = [];
  if (!text) return out;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const dateRe = /^[A-Z][a-z]{2,8}\.?\s+\d{1,2}$/;
  const amtRe = /^\(?-?\$?[\d,]+\.\d{2}\)?$/;
  const headerRe = /^(withdrawal|deposit|balance|beginning balance|ending balance|date|description|total|subtotal)$/i;
  const skipDetailRe = /^(record no|card no|ref\b|reference|trace|conf\b|seq)/i;
  for (let i = 0; i < lines.length; i++) {
    if (!dateRe.test(lines[i])) continue;
    const dateStr = lines[i].replace(/\./g, "");
    let j = i + 1;
    let desc = "";
    while (j < lines.length && !amtRe.test(lines[j]) && !dateRe.test(lines[j])) {
      if (lines[j] && !headerRe.test(lines[j])) { desc = lines[j]; break; }
      j++;
    }
    while (j < lines.length && !amtRe.test(lines[j]) && !dateRe.test(lines[j])) j++;
    if (j >= lines.length || !amtRe.test(lines[j])) continue;
    const amtStr = lines[j];
    const direction = /^\(/.test(amtStr) || /^-/.test(amtStr) ? "debit" : "credit";
    const amount = Math.abs(parseAmountString(amtStr));
    j++;
    if (j < lines.length && amtRe.test(lines[j])) j++; // skip balance column
    let merchant = "";
    for (let k = j; k < lines.length && k < j + 5 && !dateRe.test(lines[k]) && !amtRe.test(lines[k]); k++) {
      const l = lines[k];
      if (l && /[a-zA-Z]/.test(l) && !skipDetailRe.test(l) && !headerRe.test(l) && !/^\d/.test(l)) { merchant = l; break; }
    }
    if (amount > 0) out.push({ dateStr, amount, direction, description: merchant ? `${merchant} ${desc}`.trim() : desc });
  }
  return out;
}

/**
 * Section/column-aware OCR parser for statements laid out as tables per section
 * (Chase/BofA style): a heading like "Deposits and Additions", then a block of dates, a
 * block of descriptions, then "Amount" + a block of amounts — aligned by position. Dates
 * and amounts are clean single-token columns, so date[i] pairs with amount[i] reliably;
 * descriptions are filled best-effort. Direction comes from the section heading. This
 * recovers transactions Document AI drops/fragments. Returns [{dateStr, amount, direction, description}].
 */
function parseTextSections(text) {
  const out = [];
  if (!text) return out;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  // Section headings and their direction. Credit sections add money; the rest subtract.
  const creditSec = /^(deposits and additions|deposits & additions|deposits\/additions|electronic deposits|deposits and credits|additions and credits)$/i;
  const debitSec = /^(atm & debit card withdrawals|atm and debit card withdrawals|electronic withdrawals|other withdrawals|withdrawals and (debits|subtractions)|checks paid|checks|fees|fees and charges|card (purchases|withdrawals)|other deductions|service fees)$/i;
  const colHdr = /^(date|description|amount|balance|check|ref|reference|transaction)s?$/i;
  const noise = /^(instances|total|beginning balance|ending balance|number of|continued|page \d|transaction detail|daily ending balance|\(continued\))/i;
  const dateRe = /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|[A-Z][a-z]{2}\.?\s+\d{1,2})$/;
  const amtRe = /^\(?-?\$?\s?[\d,]+\.\d{2}\)?[-]?$/;

  let i = 0;
  while (i < lines.length) {
    const isCredit = creditSec.test(lines[i]);
    const isDebit = debitSec.test(lines[i]);
    if (!isCredit && !isDebit) { i++; continue; }
    const direction = isCredit ? "credit" : "debit";
    i++;
    const dates = [], amts = [], descs = [];
    // Consume the section until the next section heading (or a big gap of unrelated text).
    while (i < lines.length && !creditSec.test(lines[i]) && !debitSec.test(lines[i])) {
      const l = lines[i];
      i++;
      if (!l || colHdr.test(l) || noise.test(l)) continue;
      if (dateRe.test(l)) { dates.push(l); continue; }
      if (amtRe.test(l)) { const a = parseAmountString(l); if (a != null && a !== 0) amts.push(Math.abs(a)); continue; }
      descs.push(l);
    }
    // Only trust a section when dates and amounts columns are the same length (clean table).
    if (dates.length >= 2 && dates.length === amts.length) {
      for (let k = 0; k < dates.length; k++) {
        out.push({ dateStr: dates[k], amount: amts[k], direction, description: (descs[k] || "").slice(0, 70) });
      }
    }
  }
  return out;
}

/**
 * Detect recurring NON-MCA transactions: same counterparty + same amount repeating on a
 * regular cadence, that are not financing/MCA positions (e.g. subscriptions, rent,
 * insurance, recurring vendor payments). Shown under their own "Recurring Transactions"
 * heading. Operates on the already-categorized transactions.
 */
function detectRecurring(tagged) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const groups = new Map();
  for (const t of tagged) {
    if (t.category === "mcaDebits" || t.category === "loanInflow") continue; // MCA handled as positions
    if (t.suspectAmount) continue;
    const desc = t.description || "";
    const groupKey = `${counterpartyKey(desc) || desc.slice(0, 15)}|${Number(t.amount).toFixed(2)}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(t);
  }
  const items = [];
  for (const [gk, arr] of groups) {
    if (arr.length < 3) continue; // "recurring" = at least 3 identical-amount hits
    const dateStrs = arr.map((t) => t.date).filter(Boolean).sort();
    const frequency = inferFrequency(dateStrs.map((d) => new Date(d)));
    items.push({
      payee: cleanLenderName(arr.map((t) => ({ description: t.description })), gk.split("|")[0]),
      category: arr[0].category,
      categoryLabel: arr[0].categoryLabel,
      direction: arr[0].direction,
      amount: r2(arr[0].amount),
      frequency,
      occurrences: arr.length,
      firstDate: dateStrs[0] || "",
      lastDate: dateStrs[dateStrs.length - 1] || "",
      total: r2(arr.reduce((s, t) => s + t.amount, 0)),
      transactions: arr.map((t) => ({ date: t.date, description: t.rawDescription || t.description, amount: t.amount })),
    });
  }
  items.sort((a, b) => b.occurrences - a.occurrences || b.total - a.total);
  return items;
}

/** Read a top-level bank-statement entity (bank_name, balances, dates) if present. */
function topEntity(entities, typeFragment) {
  const e = (entities || []).find((x) => lc(x.type).includes(typeFragment));
  if (!e) return null;
  const nv = e.normalizedValue;
  if (nv?.moneyValue) return moneyToNumber(nv.moneyValue);
  return e.mentionText || nv?.text || null;
}

/**
 * Compute running daily closing balances and the average daily balance from ordered
 * transactions. Uses the statement's starting balance (or derives it from the ending
 * balance and net flow). Balances are carried forward across days with no activity so the
 * average is a true period average.
 */
/**
 * Parse a line that is nothing but a money amount.
 *
 * Returns null for anything else, so it doubles as the test for "is this line
 * a value?" rather than each caller writing its own.
 *
 * Banks write a negative amount at least four ways, and Document AI faithfully
 * preserves whichever the PDF used:
 *
 *     -1,637.30      -$136.99      $-136.99      (136.99)
 *
 * All four turn up in Chase output alone. Every parser here used to carry its
 * own pattern and each got a different subset right: the daily-balance table
 * accepted "$2,501.34" and "-1,637.30" but not "-$136.99", so an August
 * statement whose first balance happened to be negative-with-symbol produced
 * no daily balances at all — and because the table was then empty rather than
 * wrong, nothing flagged it. One parser used everywhere is the only version of
 * this that stays fixed.
 */
function moneyLine(line) {
  const t = String(line == null ? "" : line).trim();
  if (!t) return null;
  // Optional bracket, optional sign either side of the symbol, optional
  // trailing bracket. A sign is permitted in both positions because the two
  // orderings are equally common; both cannot occur together in real output,
  // and treating that as negative rather than rejecting it is harmless.
  const m = t.match(/^\(?\s*(-|−)?\s*\$?\s*(-|−)?\s*(\d[\d,]*\.\d{2})\s*\)?$/);
  if (!m) return null;
  const v = parseFloat(m[3].replace(/,/g, ""));
  if (!Number.isFinite(v)) return null;
  const bracketed = t.startsWith("(") && t.endsWith(")");
  return m[1] || m[2] || bracketed ? -v : v;
}


/**
 * Parse a printed "DAILY ENDING BALANCE" section (Chase & others): date/amount pairs listing
 * each day's ending balance. Returns [{ month, day, closing }]. The section is often a 2–3
 * column table linearized by Document AI as date, amount, date, amount…
 */
function parseDailyEndingBalances(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  // The SECTION HEADER starts with "Daily Ending Balance"; ignore prose like "$2,000 Minimum
  // Daily Ending Balance: ...". Use the last matching header (the section sits after the detail).
  let start = -1;
  for (let i = 0; i < lines.length; i++) if (/^daily\s+(ending|ledger)\s+balance/i.test(lines[i])) start = i;
  if (start < 0) return [];
  const dateRe = /^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/;
  const bothRe = /^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\s+(.+)$/;
  const stopRe = /^(page\s+\d+\s+of\s+\d+|in case of errors|account number|overdraft|important|checking summary|savings summary|deposits? and additions?|electronic withdrawals?|fees?$|total\s)/i;

  // Collect the date column and the amount column separately, in order.
  //
  // Document AI linearizes this table one of two ways and the parser must
  // survive both:
  //
  //   row-major     07/22 / $2,501.34 / 07/23 / 492.48 / …
  //   column-major  07/22 / 07/23 / 07/24 / 07/27 / 07/29 / 07/30
  //                 AMOUNT
  //                 $2,501.34 / 492.48 / 119.78 / 0.08 / -1,637.30 / -1,841.30
  //
  // Both reduce to the same rule: the Nth date belongs to the Nth amount. The
  // previous version assumed row-major and scanned forward from each date for
  // a nearby amount, breaking when it met another date — on a column-major
  // table that paired only the LAST date with the FIRST amount and discarded
  // the rest, which is how a July 30th closing balance came back as the 22nd's
  // $2,501.34.
  const pairs = [];
  const collect = (start) => {
    const dates = [];
    const amts = [];
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (!l) continue;
      if (stopRe.test(l)) break;
      if (/^(date|amount)$/i.test(l)) continue;
      if (/^\d{10,}$/.test(l)) continue; // barcode / document id

      // A date and its amount sharing one line (row-major, un-split).
      const bm = l.match(bothRe);
      if (bm) {
        const v = moneyLine(bm[3]);
        if (v != null) {
          dates.push([Number(bm[1]), Number(bm[2])]);
          amts.push(v);
          continue;
        }
      }
      const dm = l.match(dateRe);
      if (dm) {
        dates.push([Number(dm[1]), Number(dm[2])]);
        continue;
      }
      const v = moneyLine(l);
      if (v != null) {
        amts.push(v);
        continue;
      }
      break; // anything else ends the table
    }
    return { dates, amts };
  };

  // The table can continue over a page break, so read every section and merge.
  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^daily\s+(ending|ledger)\s+balance/i.test(lines[i])) sections.push(i);
  }

  const byDate = new Map();
  for (const s of sections) {
    const { dates, amts } = collect(s);
    // Only zip when the two columns line up. An uneven read means something was
    // missed, and a shifted zip would invent balances that look plausible —
    // far worse than returning none and letting the walk be used instead.
    if (!dates.length || dates.length !== amts.length) continue;
    for (let k = 0; k < dates.length; k++) {
      const [month, day] = dates[k];
      const closing = amts[k];
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      if (!Number.isFinite(closing)) continue;
      byDate.set(`${month}/${day}`, { month, day, closing });
    }
  }

  for (const v of byDate.values()) pairs.push(v);
  return pairs;
}

/**
 * Daily closing balances, and the reconciliation that proves them.
 *
 * ── The walk ────────────────────────────────────────────────────────────
 *
 * Day 1 opens at the statement's opening balance, which is the prior
 * month's closing balance. Then, for every day in the period:
 *
 *     closing = opening + deposits − withdrawals
 *
 * and that closing becomes the next day's opening. A day with no activity
 * carries the previous closing forward unchanged. Average daily balance is
 * the sum of every day's closing divided by the number of days in the
 * period.
 *
 * ── Why reconciliation is mandatory ─────────────────────────────────────
 *
 * The last day's closing MUST equal the statement's printed closing
 * balance. It is an identity, not an estimate: if the walk lands anywhere
 * else, the extracted transactions are wrong — missed rows, duplicated
 * rows, or a section total counted as a transaction. There is no third
 * possibility.
 *
 * That makes this the only honest test of whether the extraction worked,
 * so it always runs and its verdict always travels with the numbers.
 *
 * This function used to back-derive the opening balance as
 * `endingBalance − net`, which forced the walk to land on the ending
 * balance by construction. Every statement then "reconciled" perfectly,
 * including the ones where whole sections had been double-counted. That
 * is why a mismatch is now reported rather than absorbed, and why a
 * back-derived opening is marked `unverified` instead of `ok` — a figure
 * that cannot disagree with itself proves nothing.
 *
 * When the statement prints its own per-day ending balances those are
 * authoritative and used directly, but the walk is still run against them
 * day by day. A per-day disagreement names the exact date the extraction
 * went wrong, which a single period-end total cannot.
 */
function computeDailyBalances(transactions, { startingBalance, endingBalance, statementStart, statementEnd, printedDailyBalances }) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const money = (n) =>
    (n < 0 ? "-$" : "$") +
    Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Skip Document AI mis-reads (an ID parsed as a giant amount) — they would swamp the
  // running balance. Only sanely-sized amounts move the balance.
  const usable = transactions.filter((t) => t.amount < SANE_AMOUNT_MAX);
  const signed = (t) => (t.direction === "credit" ? t.amount : -t.amount);
  const net = usable.reduce((s, t) => s + signed(t), 0);
  const extractedCredits = round2(
    usable.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount, 0)
  );
  const extractedDebits = round2(
    usable.filter((t) => t.direction !== "credit").reduce((s, t) => s + t.amount, 0)
  );

  const statedOpening =
    startingBalance != null && Number.isFinite(Number(startingBalance)) ? Number(startingBalance) : null;
  const statedEnding =
    endingBalance != null && Number.isFinite(Number(endingBalance)) ? Number(endingBalance) : null;

  // Where day 1 opens. Only a figure read off the statement can anchor a real
  // check; anything else is assumed, and the verdict below says so.
  let start = statedOpening;
  let openingSource = "stated";
  if (start == null && statedEnding != null) {
    start = statedEnding - net;
    openingSource = "derived";
  }
  if (start == null) {
    start = 0;
    openingSource = "assumed-zero";
  }

  const dated = usable.filter((t) => t.date).slice().sort((a, b) => a.date - b.date);

  // Net movement per day, from the transactions we extracted.
  const dayNet = new Map();
  for (const t of dated) {
    const key = t.date.toISOString().slice(0, 10);
    dayNet.set(key, round2((dayNet.get(key) || 0) + signed(t)));
  }

  // Per-day closing balances the statement printed itself, when it has them.
  const printed = new Map();
  const hasPrinted = Array.isArray(printedDailyBalances) && printedDailyBalances.length > 0;
  if (hasPrinted) {
    for (const d of printedDailyBalances) {
      if (d && d.date && Number.isFinite(Number(d.closing))) printed.set(d.date, round2(Number(d.closing)));
    }
  }

  // Period bounds: the statement's own dates first, then printed balance dates,
  // then the span of the transactions themselves.
  const printedDates = [...printed.keys()].sort();
  const startD =
    parseDateLoose(statementStart) || parseDateLoose(printedDates[0]) || (dated[0] ? dated[0].date : null);
  const endD =
    parseDateLoose(statementEnd) ||
    parseDateLoose(printedDates[printedDates.length - 1]) ||
    (dated.length ? dated[dated.length - 1].date : null);

  // ── The walk ──────────────────────────────────────────────────────────
  //
  // `walked` is always the running balance built from the extracted
  // transactions — it is what gets reconciled. `closing` is what the UI
  // shows, which prefers the statement's printed figure where there is one.
  const dailyBalances = [];
  const dayMismatches = [];
  let walkEnding = null;

  if (startD && endD && endD >= startD && (endD - startD) / 86400000 <= 400) {
    let carry = start;
    let shown = start;
    for (const d = new Date(startD.getTime()); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);

      // closing = opening − withdrawals + deposits; no activity carries forward.
      carry = round2(carry + (dayNet.get(key) || 0));
      shown = printed.has(key) ? printed.get(key) : hasPrinted ? shown : carry;

      // A printed day that disagrees with the walk names the exact date the
      // extraction went wrong. Only flag days the statement actually printed.
      if (printed.has(key) && Math.abs(printed.get(key) - carry) > 0.01) {
        dayMismatches.push({
          date: key,
          printed: printed.get(key),
          computed: carry,
          difference: round2(carry - printed.get(key)),
        });
      }

      dailyBalances.push({ date: key, closing: round2(shown), walked: round2(carry) });
    }
    walkEnding = round2(carry);
  } else {
    // No usable period. Fall back to listing what we have, and say below that
    // nothing could be verified.
    let carry = start;
    for (const [date, n] of [...dayNet.entries()].sort()) {
      carry = round2(carry + n);
      dailyBalances.push({ date, closing: printed.has(date) ? printed.get(date) : carry, walked: carry });
    }
    if (dailyBalances.length) walkEnding = dailyBalances[dailyBalances.length - 1].walked;
  }

  const daysInPeriod = dailyBalances.length;

  /**
   * Negative days, counted from the first day the account actually moved.
   *
   * An account can open the period already overdrawn and sit untouched for
   * weeks — this statement opens at -$1,807.96 and does nothing until the
   * 22nd. Counting those 21 dormant days gives 24 negative days out of 31,
   * which reads as an account in constant distress when it is really an
   * account that was not being used. Per the credit policy the count starts
   * at the first transaction, so it measures how often the merchant ran
   * negative WHILE TRADING.
   *
   * The average daily balance is deliberately NOT treated this way: it is a
   * true period average over every day, dormant ones included, because the
   * money genuinely was not there on those days.
   */
  const firstActivity = (() => {
    const fromTxn = dated.length ? dated[0].date.toISOString().slice(0, 10) : null;
    const fromPrinted = printedDates.length ? printedDates[0] : null;
    if (fromTxn && fromPrinted) return fromTxn < fromPrinted ? fromTxn : fromPrinted;
    return fromTxn || fromPrinted || null;
  })();
  for (const d of dailyBalances) d.counted = firstActivity ? d.date >= firstActivity : true;
  const activeDays = dailyBalances.filter((d) => d.counted).length;
  const negativeDays = dailyBalances.filter((d) => d.counted && d.closing < 0).length;
  const dormantDays = daysInPeriod - activeDays;
  const dailyAverageBalance = daysInPeriod
    ? round2(dailyBalances.reduce((s, x) => s + x.closing, 0) / daysInPeriod)
    : null;

  // ── The verdict ───────────────────────────────────────────────────────
  const difference =
    walkEnding != null && statedEnding != null ? round2(walkEnding - statedEnding) : null;

  /**
   * Does the statement's OWN daily-balance table close where the statement
   * says it does?
   *
   * If it does, the daily balances are the bank's figures, not ours, and the
   * average taken from them is right no matter what our transaction
   * extraction did or missed. That is a separate question from whether we
   * read every transaction, and conflating the two would condemn a correct
   * average because of an unrelated gap in the detail rows.
   */
  const lastPrinted = printedDates.length ? printed.get(printedDates[printedDates.length - 1]) : null;
  const printedAnchored =
    hasPrinted && statedEnding != null && lastPrinted != null && Math.abs(lastPrinted - statedEnding) <= 0.01;

  let status;
  let message;

  if (printedAnchored) {
    // The daily balances are settled. What may still be wrong is the
    // transaction list behind them, so say which it is.
    const gap = difference != null && Math.abs(difference) > 0.01 ? difference : null;
    status = "ok";
    message = gap == null
      ? "Balances reconcile: the statement's own daily ending balances close at " +
        money(lastPrinted) +
        ", matching the statement."
      : "Daily balances confirmed from the statement's own daily ending balance table, " +
        "closing at " +
        money(lastPrinted) +
        " as stated — the average daily balance is correct. Separately, the extracted " +
        "transaction list does not add up to that close: it is out by " +
        money(Math.abs(gap)) +
        " (" +
        (gap > 0 ? "deposits overstated or withdrawals missing" : "withdrawals overstated or deposits missing") +
        "), so the transaction detail, categories and positions may be incomplete even though " +
        "the balances are not.";
  } else if (openingSource === "assumed-zero" || statedEnding == null || walkEnding == null) {
    status = "unverified";
    message =
      "Could not verify the balances: the statement's " +
      (statedOpening == null && statedEnding == null
        ? "opening and closing balances were not found"
        : statedOpening == null
        ? "opening balance was not found"
        : "closing balance was not found") +
      ". Daily balances and the average below are unconfirmed — enter the opening and closing balances to check them.";
  } else if (openingSource === "derived") {
    // The opening was computed from the ending, so the walk lands on the ending
    // by arithmetic. It cannot disagree, and therefore proves nothing.
    status = "unverified";
    message =
      "Could not verify the balances: the statement's opening balance was not found, so it was " +
      "worked back from the closing balance. The daily walk cannot be checked against the " +
      "statement — enter the opening balance to confirm it.";
  } else if (Math.abs(difference) <= 0.01) {
    status = "ok";
    message =
      "Balances reconcile: the last day closes at " +
      money(walkEnding) +
      ", matching the statement.";
  } else {
    status = "mismatch";
    const over = difference > 0;
    message =
      "Reconciliation error: the daily walk ends at " +
      money(walkEnding) +
      " but the statement closes at " +
      money(statedEnding) +
      ", a difference of " +
      money(Math.abs(difference)) +
      ". " +
      (over
        ? "Deposits are overstated or withdrawals are missing"
        : "Withdrawals are overstated or deposits are missing") +
      " by that amount — a section total may have been counted as a transaction, a row " +
      "duplicated, or rows missed. The average daily balance cannot be trusted until this is fixed.";
  }

  return {
    dailyBalances,
    dailyAverageBalance,
    startingBalanceUsed: round2(start),
    negativeDays,
    activeDays,
    dormantDays,
    firstActivity,
    balanceCheck: {
      status,
      ok: status === "ok",
      message,
      openingBalance: round2(start),
      openingSource,
      statedOpening: statedOpening != null ? round2(statedOpening) : null,
      statedEnding: statedEnding != null ? round2(statedEnding) : null,
      computedEnding: walkEnding,
      difference,
      extractedCredits,
      extractedDebits,
      net: round2(net),
      daysInPeriod,
      periodStart: dailyBalances.length ? dailyBalances[0].date : null,
      periodEnd: dailyBalances.length ? dailyBalances[dailyBalances.length - 1].date : null,
      // Printed days the walk disagrees with — each names a date to go and look at.
      dayMismatches: dayMismatches.slice(0, 12),
      dayMismatchCount: dayMismatches.length,
      usedPrintedBalances: hasPrinted,
      /**
       * Where the daily balances came from. "statement" means the bank's own
       * daily ending balance table, verified to close where the statement
       * says — those figures and the average from them are exact.
       */
      dailySource: printedAnchored ? "statement" : "walk",
      /**
       * Whether the extracted transactions themselves add up to the close.
       * Kept apart from `status` on purpose: the balances can be right while
       * the transaction detail is incomplete, and an underwriter needs to
       * know it is the detail — not the average — that is short.
       */
      transactionsReconcile: difference != null ? Math.abs(difference) <= 0.01 : null,
      extractionDifference: difference,
    },
  };
}

/**
 * Core analysis over a list of transactions ({ date: Date|string, description,
 * rawDescription, amount, direction }). Shared by the Document AI path and the
 * recompute-from-stored path so applying user tags doesn't require re-calling Document AI.
 */
/**
 * Statement-alteration / tampering detection from the extracted DATA (no file bytes needed).
 * Returns an array of red-flag strings. Each check is deliberately conservative — an altered
 * statement is a serious accusation, so we only flag material, hard-to-explain discrepancies.
 *
 * Signals:
 *  1. The statement's own printed math doesn't reconcile (beginning + deposits − withdrawals
 *     ≠ ending) — the single strongest tamper signal.
 *  2. Duplicate deposits — the same amount + description on the same day, repeated (a common way
 *     to pad income by copy-pasting a credit).
 *  3. Suspiciously round income — a large share of deposit value in exact $1,000 increments.
 */
function detectAlteration(taggedTransactions, statementTotals) {
  const flags = [];
  const round2 = (n) => Math.round(n * 100) / 100;
  const money = (n) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const st = statementTotals || {};

  // 1. Printed figures don't add up.
  if (st.balanceInconsistent && st.balanceResidual != null) {
    flags.push(
      `Statement math doesn't reconcile — printed beginning + deposits − withdrawals is off from the printed ending balance by ${money(st.balanceResidual)}. Verify the statement hasn't been altered.`
    );
  }

  const credits = (taggedTransactions || []).filter(
    (t) => t.direction === "credit" && !t.suspectAmount && Number(t.amount) > 0
  );

  // 2. Duplicate deposits (same day + amount + description, repeated).
  const groups = new Map();
  for (const t of credits) {
    if (Number(t.amount) < 100) continue; // ignore trivial repeated micro-credits
    const norm = String(t.description || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
    const key = `${t.date || ""}|${Number(t.amount).toFixed(2)}|${norm}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  let dupGroups = 0;
  let dupExtra = 0;
  for (const [, n] of groups) {
    if (n >= 2) { dupGroups += 1; dupExtra += n - 1; }
  }
  if (dupGroups > 0) {
    flags.push(
      `${dupExtra} duplicate deposit${dupExtra === 1 ? "" : "s"} detected (${dupGroups} amount${dupGroups === 1 ? "" : "s"} repeated on the same day with the same description) — confirm these aren't copy-pasted to inflate income.`
    );
  }

  // 3. Suspiciously round income — high share of deposit value in exact $1,000 increments.
  if (credits.length >= 6) {
    const totalCr = credits.reduce((s, t) => s + Number(t.amount), 0);
    const roundCr = credits
      .filter((t) => Number(t.amount) >= 1000 && Number(t.amount) % 1000 === 0)
      .reduce((s, t) => s + Number(t.amount), 0);
    const share = totalCr > 0 ? roundCr / totalCr : 0;
    if (share >= 0.7) {
      flags.push(
        `Deposits are unusually round — ${Math.round(share * 100)}% of deposit value is in exact $1,000 increments across ${credits.length} deposits. Verify income is genuine.`
      );
    }
  }

  return flags;
}

/**
 * Statement-alteration / tampering detection from the raw PDF BYTES. Bank statements are
 * system-generated in a single pass; edits leave detectable artifacts. Returns red-flag
 * strings. Image uploads (JPG/PNG) and non-PDFs are skipped (returns []).
 */
export function analyzePdfIntegrity(buffer) {
  const flags = [];
  if (!buffer || !buffer.length) return flags;
  const head = buffer.slice(0, 5).toString("latin1");
  if (!head.startsWith("%PDF")) return flags; // not a PDF — nothing to inspect here
  // latin1 keeps byte offsets intact for structural markers like %%EOF.
  const text = buffer.toString("latin1");

  // Editing software in the Producer/Creator metadata. Genuine bank PDFs are produced by
  // report engines (iText, Prince, Apache FOP, PDFlib, the bank's own system) — not by image
  // or document editors. Their presence is a strong sign the file was re-authored.
  const readMeta = (label) => {
    const m = text.match(new RegExp(`/${label}\\s*\\(([^)]{0,120})\\)`));
    return m ? m[1] : "";
  };
  const producer = `${readMeta("Producer")} ${readMeta("Creator")}`.trim();
  const editorRe =
    /photoshop|illustrator|gimp|canva|inkscape|paint\.net|pixelmator|acrobat|pdfescape|sejda|smallpdf|ilovepdf|pdf24|pdffiller|foxit|nitro pdf|microsoft word|libreoffice|openoffice|wps (?:office|writer)|google docs/i;
  if (producer && editorRe.test(producer)) {
    flags.push(
      `PDF was produced/edited with document-editing software (${producer.slice(0, 60)}) — genuine bank statements are system-generated. Possible alteration.`
    );
  }

  // Incremental updates: a legitimate statement is written once (one %%EOF). Extra %%EOF /
  // startxref sections mean content was appended/edited after the original was generated.
  const eofCount = (text.match(/%%EOF/g) || []).length;
  if (eofCount > 1) {
    flags.push(
      `PDF has ${eofCount} save generations (incremental edits appended after the original) — the file was modified after it was first created.`
    );
  }

  // Modified after creation.
  const cd = text.match(/\/CreationDate\s*\(D:(\d{14})/);
  const md = text.match(/\/ModDate\s*\(D:(\d{14})/);
  if (cd && md && md[1] > cd[1]) {
    const fmt = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    flags.push(`PDF was modified (${fmt(md[1])}) after it was created (${fmt(cd[1])}).`);
  }

  // Explicit text-edit / redaction markers left by PDF editors.
  if (/\/TouchUp_TextEdit|\/Redact\b/.test(text)) {
    flags.push("PDF contains text-edit / redaction markers left by an editor — content was changed after generation.");
  }

  return flags;
}

export function analyzeFromTransactions(rawTransactions, meta = {}, overrides = {}, learned = {}) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const transactions = (rawTransactions || []).map((t) => ({
    date: t.date instanceof Date ? t.date : t.date ? parseDateLoose(String(t.date)) : null,
    description: t.description || t.rawDescription || "",
    rawDescription: t.rawDescription || t.description || "",
    amount: Math.abs(Number(t.amount) || 0),
    direction: t.direction === "credit" ? "credit" : "debit",
    source: t.source || "", // originating statement (for the combined view)
  }));

  // Chronological order (1st → month end); undated rows sink to the bottom.
  transactions.sort((a, b) => {
    if (a.date && b.date) return a.date - b.date;
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  // Per-category totals, split by direction so the UI can show credit vs debit categories.
  const totalsMap = {};
  for (const key of Object.keys(CATEGORY_LABELS)) {
    totalsMap[key] = { total: 0, count: 0, creditTotal: 0, creditCount: 0, debitTotal: 0, debitCount: 0 };
  }
  // Transactions with a plausible amount are used for totals + balances; suspected
  // mis-reads are still listed but flagged and excluded from the math.
  const balanceTxns = [];
  const taggedTransactions = transactions.map((t) => {
    const cat = categorize(t, overrides, learned);
    const suspect = isSuspectAmount(t.amount, cat);
    const m = totalsMap[cat];
    m.count += 1;
    if (t.direction === "credit") m.creditCount += 1;
    else m.debitCount += 1;
    if (!suspect) {
      m.total += t.amount;
      if (t.direction === "credit") m.creditTotal += t.amount;
      else m.debitTotal += t.amount;
      balanceTxns.push(t);
    }
    const dateStr = t.date ? t.date.toISOString().slice(0, 10) : "";
    return {
      date: dateStr,
      month: dateStr ? dateStr.slice(0, 7) : "", // YYYY-MM
      description: t.description || "",
      rawDescription: t.rawDescription || t.description || "",
      amount: round2(t.amount),
      direction: t.direction,
      category: cat,
      categoryLabel: CATEGORY_LABELS[cat],
      mcaTag: overrides[tagKeyFor(t.description)] || "", // "mca" | "not_mca" | category key
      suspectAmount: suspect,
      source: t.source || "",
    };
  });

  // Distinct months present in the statement (for the monthly view tabs).
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const months = [...new Set(taggedTransactions.map((t) => t.month).filter(Boolean))]
    .sort()
    .map((m) => {
      const [y, mm] = m.split("-");
      return { month: m, label: `${MONTH_NAMES[Number(mm) - 1]} ${y}` };
    });

  const totalCredits = balanceTxns.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount, 0);
  const totalDebits = balanceTxns.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0);
  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

  const categoryTotals = Object.keys(CATEGORY_LABELS)
    .map((key) => {
      const m = totalsMap[key];
      return {
        category: key,
        label: CATEGORY_LABELS[key],
        total: round2(m.total),
        count: m.count,
        creditTotal: round2(m.creditTotal),
        creditCount: m.creditCount,
        debitTotal: round2(m.debitTotal),
        debitCount: m.debitCount,
        // Share of total credits / debits (percent, one decimal).
        creditPct: pct(m.creditTotal, totalCredits),
        debitPct: pct(m.debitTotal, totalDebits),
      };
    })
    .filter((c) => c.count > 0);

  const positions = detectPositions(transactions.filter((t) => t.direction === "debit"), overrides, learned);
  const recurringTransactions = detectRecurring(taggedTransactions);

  // ── Amount Financed = MCA credit (per lender) ──────────────────────────────────────────
  // An MCA cash-advance CREDIT is the amount financed for that lender; the recurring DEBITS
  // to the same lender are the repayments (the position). We (1) attach each credit to its
  // matching debit position and track repayments after funding, and (2) create a position for
  // any MCA credit that has no auto-detected debit position, so the financed amount always
  // shows (with whatever recurring repayments exist).
  const fundingCredits = taggedTransactions.filter(
    (t) => t.direction === "credit" && t.category === "mcaCredits" && !t.suspectAmount
  );
  // Group the funding credits by lender key.
  const creditGroups = new Map();
  for (const c of fundingCredits) {
    const k = tagKeyFor(c.description);
    if (!k) continue;
    if (!creditGroups.has(k)) creditGroups.set(k, []);
    creditGroups.get(k).push(c);
  }

  const applyRepaymentWindow = (p) => {
    // Keep only repayments ON/AFTER the funding date ("thereafter"); guarded so a mis-dated
    // funding credit can never wipe a position.
    if (!p.fundingDate || !Array.isArray(p.transactions)) return;
    const after = p.transactions.filter(
      (t) => t.date && t.date >= p.fundingDate && Number(t.amount) < SANE_AMOUNT_MAX
    );
    if (!after.length) return;
    p.transactions = after;
    p.occurrences = after.length;
    p.totalPaidInStatement = round2(after.reduce((s, t) => s + (Number(t.amount) || 0), 0));
    const ad = after.map((t) => t.date).filter(Boolean).sort();
    p.firstDate = ad[0] || p.firstDate;
    p.lastDate = ad[ad.length - 1] || p.lastDate;
  };

  const matchedCreditKeys = new Set();
  // (1) Attach credits to existing debit positions.
  for (const p of positions) {
    const firstDesc = p.transactions && p.transactions[0] ? p.transactions[0].description : "";
    const posKey = firstDesc ? tagKeyFor(firstDesc) : null;
    if (!posKey || !creditGroups.has(posKey)) continue;
    matchedCreditKeys.add(posKey);
    const credits = creditGroups.get(posKey);
    const funded = credits.reduce((m, c) => (c.amount > m.amount ? c : m), credits[0]);
    p.amountFunded = round2(funded.amount);
    p.fundingDate = funded.date ? (funded.date instanceof Date ? funded.date.toISOString().slice(0, 10) : String(funded.date)) : "";
    applyRepaymentWindow(p);
  }

  // (2) Credit-driven positions: an MCA credit with no matching debit position still shows the
  // financed amount and any recurring debits to that lender.
  for (const [k, credits] of creditGroups) {
    if (matchedCreditKeys.has(k)) continue;
    const funded = credits.reduce((m, c) => (c.amount > m.amount ? c : m), credits[0]);
    const fundingDate = funded.date ? (funded.date instanceof Date ? funded.date.toISOString().slice(0, 10) : String(funded.date)) : "";
    // Repayments = debits to the same lender (after funding), even if they lacked a financing keyword.
    const repay = taggedTransactions
      .filter((t) => t.direction === "debit" && !t.suspectAmount && tagKeyFor(t.description) === k && Number(t.amount) < SANE_AMOUNT_MAX)
      .filter((t) => !fundingDate || (t.date && t.date >= fundingDate));
    const amts = repay.map((t) => Number(t.amount));
    const mode = modeAmount(amts);
    const installmentNum = repay.length === 0 ? null : (mode.count >= 2 ? mode.value : round2(median(amts)));
    const dateObjs = repay.map((t) => parseDateLoose(t.date)).filter(Boolean);
    const frequency = repay.length >= 2 ? inferFrequency(dateObjs) : "One-time";
    const perMonth = FREQUENCY_MULTIPLIER[frequency];
    const rdates = repay.map((t) => t.date).filter(Boolean).sort();
    positions.push({
      lender: cleanLenderName(credits.map((c) => ({ description: c.description })), k),
      type: "MCA",
      frequency,
      installment: installmentNum != null ? String(round2(installmentNum)) : "",
      amountFunded: round2(funded.amount),
      fundingDate,
      status: "Active",
      occurrences: repay.length,
      firstDate: rdates[0] || "",
      lastDate: rdates[rdates.length - 1] || "",
      totalPaidInStatement: round2(repay.reduce((s, t) => s + (Number(t.amount) || 0), 0)),
      monthlyMcaPmts: perMonth && installmentNum ? String(round2(installmentNum * perMonth)) : "",
      isKnownLender: credits.some((c) => hasAny(c.description, MCA_LENDER_KEYWORDS)),
      confidence: "high", // backed by an explicit MCA credit
      mcaTag: overrides && overrides[k] ? overrides[k] : "",
      fromCredit: true,
      transactions: repay.map((t) => ({ date: t.date || "", description: t.description || "", amount: round2(Number(t.amount)) })),
    });
  }
  // Re-sort so the largest positions lead (credit-driven ones are now mixed in).
  positions.sort((a, b) => (b.totalPaidInStatement - a.totalPaidInStatement) || (b.occurrences - a.occurrences));
  // Repayment status per position (Active / Lower / Paid in Full / Stop / One Time), judged
  // against the statement period end (latest transaction date).
  const periodEndForStatus = (() => {
    let max = null;
    for (const t of transactions) if (t.date && (!max || t.date > max)) max = t.date;
    return max ? max.toISOString().slice(0, 10) : (meta.statementPeriod?.end || null);
  })();
  for (const p of positions) p.repayStatus = computeRepayStatus(p, periodEndForStatus);
  const nsfCount = totalsMap.nsf.count;
  const overdraftCount = totalsMap.overdraft.count;

  const { dailyBalances, dailyAverageBalance, startingBalanceUsed, balanceCheck, negativeDays, activeDays, dormantDays } = computeDailyBalances(balanceTxns, {
    startingBalance: meta.startingBalance != null && Number.isFinite(Number(meta.startingBalance)) ? Number(meta.startingBalance) : null,
    endingBalance: meta.endingBalance != null && Number.isFinite(Number(meta.endingBalance)) ? Number(meta.endingBalance) : null,
    statementStart: meta.statementPeriod?.start,
    statementEnd: meta.statementPeriod?.end,
    printedDailyBalances: Array.isArray(meta.printedDailyBalances) ? meta.printedDailyBalances : null,
  });
  // The statement's own printed average balance (e.g. BofA "Average ledger balance") is
  // authoritative — prefer it over the computed average, which depends on complete extraction.
  const printedAvg = meta.statementTotals?.printedAverageBalance;
  const dailyAverageBalanceFinal =
    printedAvg != null && Number.isFinite(Number(printedAvg)) ? round2(Number(printedAvg)) : dailyAverageBalance;

  // Running balance after each transaction (chronological). The last transaction of each
  // day therefore shows that day's closing balance directly in the list.
  let runBal = startingBalanceUsed;
  for (const tt of taggedTransactions) {
    if (!tt.suspectAmount) runBal += tt.direction === "credit" ? tt.amount : -tt.amount;
    tt.runningBalance = round2(runBal);
  }

  const riskFlags = [];
  if (nsfCount > 0) riskFlags.push(`NSF / returned items found (${nsfCount})`);
  if (overdraftCount > 0) riskFlags.push(`Overdraft fees found (${overdraftCount})`);
  if (positions.length >= 3) riskFlags.push(`Stacked positions detected (${positions.length})`);
  else if (positions.length > 0) riskFlags.push(`${positions.length} financing position(s) detected`);
  if (totalDebits > totalCredits * 1.1 && totalCredits > 0) riskFlags.push("Debits exceed deposits (negative cash flow)");
  const dailyMca = positions.filter((p) => p.frequency === "Daily").length;
  if (dailyMca > 0) riskFlags.push(`${dailyMca} daily-remit position(s)`);

  // Statement-alteration / tampering red flags. PDF-byte signals (from the controller) +
  // data-derived signals (recomputed here). Shown under Risk Flags in the UI.
  const pdfFlags = Array.isArray(meta.pdfFlags) ? meta.pdfFlags : [];
  const dataAlterationFlags = detectAlteration(taggedTransactions, meta.statementTotals);
  const alterationFlags = [...pdfFlags, ...dataAlterationFlags];

  return {
    status: "completed",
    engine: "google-document-ai",
    processedAt: new Date(),
    fileName: meta.fileName || "",
    documentUrl: meta.documentUrl || "",
    bankName: meta.bankName || "",
    accountType: meta.accountType || "",
    statementPeriod: {
      start: meta.statementPeriod?.start || "",
      end: meta.statementPeriod?.end || "",
    },
    startingBalance: meta.startingBalance != null && Number.isFinite(Number(meta.startingBalance)) ? Number(meta.startingBalance) : null,
    endingBalance: meta.endingBalance != null && Number.isFinite(Number(meta.endingBalance)) ? Number(meta.endingBalance) : null,
    summary: (() => {
      // Total Credits / Total Debits priority:
      //   1. a manual override the user typed from the statement (most reliable),
      //   2. the statement's own stated totals parsed from the summary,
      //   3. the sum of extracted transactions (fallback).
      const st = meta.statementTotals || {};
      const ov = meta.totalsOverride || {};
      const ovCr = ov.totalCredits != null && Number.isFinite(Number(ov.totalCredits)) ? round2(Number(ov.totalCredits)) : null;
      const ovDr = ov.totalDebits != null && Number.isFinite(Number(ov.totalDebits)) ? round2(Number(ov.totalDebits)) : null;
      const extractedCr = round2(totalCredits);
      const extractedDr = round2(totalDebits);
      const finalCr = ovCr != null ? ovCr : (st.statedCredits != null ? st.statedCredits : extractedCr);
      const finalDr = ovDr != null ? ovDr : (st.statedDebits != null ? st.statedDebits : extractedDr);
      const reconciled = ovCr != null || ovDr != null || st.statedCredits != null || st.statedDebits != null;
      return {
        totalCredits: finalCr,
        totalDebits: finalDr,
        netCashFlow: round2(finalCr - finalDr),
        // Source of the totals shown: "manual" | "stated" | "extracted".
        totalsSource: (ovCr != null || ovDr != null) ? "manual" : (st.statedCredits != null || st.statedDebits != null ? "stated" : "extracted"),
        manualCredits: ovCr,
        manualDebits: ovDr,
        creditTxnCount: transactions.filter((t) => t.direction === "credit").length,
        debitTxnCount: transactions.filter((t) => t.direction === "debit").length,
        transactionCount: transactions.length,
        nsfCount,
        overdraftCount,
        mcaPositionCount: positions.length,
        dailyAverageBalance: dailyAverageBalanceFinal,
        /**
         * Whether the balance identity holds. This is the one figure that can
         * condemn the whole extraction, so it is carried on the summary rather
         * than left for a caller to dig out of `balanceCheck`.
         *
         * `true` only when the daily walk lands on the statement's own closing
         * balance. "unverified" is not "fine" — it means the statement's own
         * opening or closing balance could not be read, so nothing was proved.
         */
        balanceReconciled: balanceCheck.ok,
        balanceStatus: balanceCheck.status,
        balanceMessage: balanceCheck.message,
        /**
         * Days closing negative, counted from the first day the account moved.
         * Carried here so notes, the PDF and the soft offer all read the same
         * figure instead of each filtering the daily balances their own way.
         */
        negativeDays,
        activeDays,
        dormantDays,
        /**
         * The average is only as good as the walk behind it — unless the
         * statement printed its own average, which is the bank's figure and
         * stands whatever our extraction did.
         */
        dailyAverageBalanceReliable:
          balanceCheck.ok || (printedAvg != null && Number.isFinite(Number(printedAvg))),
        dailyAverageBalanceSource:
          printedAvg != null && Number.isFinite(Number(printedAvg)) ? "statement" : "computed",
        // Reconciliation transparency: stated totals vs what we actually extracted.
        reconciled,
        statedCredits: st.statedCredits ?? null,
        statedDebits: st.statedDebits ?? null,
        statedCreditCount: st.creditCount ?? null,
        statedDebitCount: st.debitCount ?? null,
        extractedCredits: extractedCr,
        extractedDebits: extractedDr,
      };
    })(),
    categoryTotals,
    nonRevenueCategories: NON_REVENUE_CATEGORIES,
    positions,
    recurringTransactions,
    transactions: taggedTransactions,
    dailyBalances,
    dailyAverageBalance: dailyAverageBalanceFinal,
    /**
     * The balance-identity check. Always present, always run.
     *
     * The UI must surface `status: "mismatch"` as an error rather than
     * showing the figures as though they were sound — a wrong average daily
     * balance presented confidently is worse than no average at all,
     * because it gets priced.
     */
    balanceCheck,
    months,
    statementTotals: meta.statementTotals || null,
    // Printed per-day ending balances (from the statement) — persisted so re-tagging keeps the
    // exact average daily balance instead of recomputing from incomplete transactions.
    printedDailyBalances: Array.isArray(meta.printedDailyBalances) ? meta.printedDailyBalances : null,
    // User-entered Total Credits / Total Debits override (persisted; wins over auto-parse).
    manualTotals: (meta.totalsOverride && (meta.totalsOverride.totalCredits != null || meta.totalsOverride.totalDebits != null))
      ? { totalCredits: meta.totalsOverride.totalCredits ?? null, totalDebits: meta.totalsOverride.totalDebits ?? null }
      : null,
    riskFlags,
    alterationFlags,
    // Echo the PDF-byte flags so they can be persisted and re-merged on recategorize
    // (the raw bytes aren't available then).
    pdfIntegrityFlags: pdfFlags,
  };
}

export { tagKeyFor, computeDailyBalances };

/**
 * Main entry: build the full analysis result from a Document AI `document`.
 * @param {object} document - the parsed document from Document AI process().
 * @param {object} meta - { fileName, documentUrl }
 * @param {object} overrides - { [tagKey]: "mca" | "not_mca" } learned user tags.
 */
export function buildMcaAnalysis(document, meta = {}, overrides = {}, learned = {}) {
  const entities = document?.entities || [];
  let transactions = transactionsFromEntities(entities);
  if (transactions.length === 0) {
    transactions = transactionsFromText(document?.text || "");
  }
  // The statement's own summary is parsed up front: its verified category
  // totals are what let a section total masquerading as a transaction be
  // identified before anything is summed from the rows.
  const statementTotals = parseStatementTotals(document?.text || "");
  transactions = dropSectionTotals(transactions, statementTotals.sectionTotals);

  // Correct transaction-date years. Statement rows often omit the year (just "05/22"),
  // and Document AI then defaults to a bogus year (e.g. 2001). Snap implausible years to
  // the statement period's year so the raw transaction dates read correctly.
  const stmtStartRaw = topEntity(entities, "statement_start_date") || topEntity(entities, "statement_date");
  const stmtYear = (() => {
    const d = parseDateLoose(stmtStartRaw ? String(stmtStartRaw) : null);
    const y = d ? d.getFullYear() : NaN;
    return y >= 2015 ? y : null;
  })();
  const nowYear = new Date().getFullYear();
  if (stmtYear) {
    for (const t of transactions) {
      if (t.date) {
        const y = t.date.getFullYear();
        if (y < 2015 || y > nowYear + 1) t.date.setFullYear(stmtYear);
      }
    }
  }

  // Parse transactions from the OCR text (multi-line layouts). Used to (a) recover missing
  // descriptions and (b) fill in transactions Document AI's table extraction dropped.
  // Two text parsers: single-line "Mon DD desc amount" rows, and section/column tables.
  // Combined + deduped in the merge below so column-layout statements (Chase/BofA) whose
  // transactions Document AI fragments/drops are recovered.
  const textTxns = [
    ...parseTextTransactions(document?.text || ""),
    ...parseTextSections(document?.text || ""),
  ];
  if (textTxns.length) {
    const parseTxnDate = (s) => parseDateLoose(s) || dateFromText(String(s || ""));
    const dayKey = (d) => `${MON_ABBR[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
    // Description lookup by "Mon DD|amount".
    const descMap = new Map();
    for (const tt of textTxns) {
      const dd = parseTxnDate(tt.dateStr);
      if (!dd || !tt.description) continue;
      const k = `${dayKey(dd)}|${tt.amount.toFixed(2)}`;
      if (!descMap.has(k)) descMap.set(k, []);
      descMap.get(k).push(tt.description.slice(0, 70));
    }
    for (const t of transactions) {
      if (!t.date) continue;
      const d = (t.description || "").trim();
      const needs = !d || /^[A-Za-z]{3,9}\.?\s+\d{1,2}\b/.test(d) || d.replace(/[^a-zA-Z]/g, "").length < 3;
      if (!needs) continue;
      const q = descMap.get(`${dayKey(t.date)}|${t.amount.toFixed(2)}`);
      if (q && q.length) { const nd = q.shift(); t.description = nd; t.rawDescription = nd; }
    }

    // Merge: add text transactions Document AI missed. Dedup by day+amount only (ignoring
    // direction) so a text row whose direction was mis-read can't double-count an existing
    // entity transaction.
    const have = new Map();
    for (const t of transactions) {
      if (!t.date) continue;
      const k = `${dayKey(t.date)}|${t.amount.toFixed(2)}`;
      have.set(k, (have.get(k) || 0) + 1);
    }
    for (const tt of textTxns) {
      const dd = parseTxnDate(tt.dateStr);
      if (!dd) continue;
      if (stmtYear && (dd.getFullYear() < 2015 || dd.getFullYear() > nowYear + 1)) dd.setFullYear(stmtYear);
      const k = `${dayKey(dd)}|${tt.amount.toFixed(2)}`;
      const n = have.get(k) || 0;
      if (n > 0) { have.set(k, n - 1); continue; } // already extracted (either direction)
      transactions.push({
        date: dd,
        description: tt.description || "",
        rawDescription: tt.description || "",
        amount: tt.amount,
        direction: tt.direction,
      });
    }
  }


  /**
   * Recover a date for rows Document AI returned without one.
   *
   * An undated row still counts toward the totals but never reaches the daily
   * balance walk, so it silently pulls the walk away from the statement's
   * closing balance — on the statement this was written for, one ACH debit
   * came back undated and left the walk $572.00 short while the row itself
   * was present and correct.
   *
   * Statement rows repeat their posting date inside the description
   * ("Orig CO Name: Dillards 07/23 Orig ID: ..."), so the first MM/DD in the
   * text is taken, and only when it lands inside the statement period. That
   * condition is what keeps this safe: descriptions are also full of other
   * dates — "Desc Date: 260722", card expiry, invoice numbers — and one
   * outside the period is evidence the match was one of those, so it is
   * discarded rather than guessed at.
   *
   * This runs AFTER the text merge, deliberately. Dating a row changes how it
   * dedupes, and doing it earlier let the merge treat three genuine $91.80
   * card purchases as already-seen and drop them, trading one missing date for
   * three missing transactions. Running last leaves the merge's behaviour
   * untouched.
   *
   * If the merge has already supplied the same amount on the recovered date,
   * the undated row IS that transaction read twice, so it is dropped rather
   * than dated — otherwise recovery would turn a missing date into a
   * double-count.
   */
  if (stmtYear) {
    const periodStart = parseDateLoose(stmtStartRaw ? String(stmtStartRaw) : null);
    const stmtEndRaw = topEntity(entities, "statement_end_date");
    const periodEnd = parseDateLoose(stmtEndRaw ? String(stmtEndRaw) : null);
    const atMidnight = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const lo = periodStart ? atMidnight(periodStart) : null;
    const hi = periodEnd ? atMidnight(periodEnd) : null;
    const mmddRe = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

    const dated = new Set();
    for (const t of transactions) {
      if (t.date) dated.add(`${t.date.toISOString().slice(0, 10)}|${t.amount.toFixed(2)}`);
    }

    const keep = [];
    for (const t of transactions) {
      if (t.date) { keep.push(t); continue; }
      const text = String(t.description || t.rawDescription || "");
      const m = text.match(mmddRe);
      if (!m) { keep.push(t); continue; }
      const mo = Number(m[1]);
      const dy = Number(m[2]);
      if (mo < 1 || mo > 12 || dy < 1 || dy > 31) { keep.push(t); continue; }
      const ms = Date.UTC(stmtYear, mo - 1, dy);
      if (Number.isNaN(ms)) { keep.push(t); continue; }
      if (lo != null && ms < lo) { keep.push(t); continue; }
      if (hi != null && ms > hi) { keep.push(t); continue; }

      const key = `${new Date(ms).toISOString().slice(0, 10)}|${t.amount.toFixed(2)}`;
      if (dated.has(key)) continue; // already present with a date — this is the duplicate
      t.date = new Date(ms);
      t.dateRecovered = true;
      dated.add(key);
      keep.push(t);
    }
    transactions = keep;
  }

  // Recover descriptions that came back as just a date (+amount) — common on BofA statements
  // whose Date/Description/Amount columns Document AI scrambles. Match each such transaction to
  // its section's recovered description by (direction, amount), consuming in order so repeated
  // amounts map to successive rows.
  {
    const bofa = parseBofaColumnSections(document?.text || "");
    if (bofa.length) {
      const q = new Map(); // "dir|amount" → [descriptions in order]
      for (const b of bofa) {
        const k = `${b.direction}|${(Number(b.amount) || 0).toFixed(2)}`;
        if (!q.has(k)) q.set(k, []);
        q.get(k).push(b.description);
      }
      // A description is "bad" when it has no real letters or is just a date (+ amount).
      const isBadDesc = (d) => {
        const s = String(d || "").trim();
        if (!s) return true;
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}[\s-]*\$?-?[\d,]*\.?\d*$/.test(s)) return true;
        return s.replace(/[^a-zA-Z]/g, "").length < 3;
      };
      for (const t of transactions) {
        if (!isBadDesc(t.description)) continue;
        const k = `${t.direction}|${(Number(t.amount) || 0).toFixed(2)}`;
        const arr = q.get(k);
        if (arr && arr.length) {
          const nd = arr.shift();
          t.description = nd;
          t.rawDescription = nd;
        }
      }
    }
  }

  // Opening balance: prefer the Document AI entity; otherwise recover the stated
  // "Beginning/Opening Balance" from the OCR text. This anchors the daily balance calc.
  let startingBalance = topEntity(entities, "starting_balance")
    ?? topEntity(entities, "beginning_balance")
    ?? topEntity(entities, "opening_balance");
  if (startingBalance == null) {
    const ob = extractOpeningBalance(document?.text || "");
    if (ob != null) startingBalance = ob;
  }
  const endingBalance = topEntity(entities, "ending_balance") ?? topEntity(entities, "closing_balance");
  const statementStart = topEntity(entities, "statement_start_date") || topEntity(entities, "statement_date");
  const statementEnd = topEntity(entities, "statement_end_date");

  // Balances may come back as a number (money entity) or a string ("$12,733.08") — parse both.
  const numOr = (v) => {
    if (v == null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const n = parseAmountString(String(v));
    return n == null || Number.isNaN(n) ? null : n;
  };

  // statementTotals was parsed at the top of this function, before the
  // section-total rows were dropped from the transaction list.
  let startBal = numOr(startingBalance);
  if (startBal == null && statementTotals.beginning != null) startBal = statementTotals.beginning;
  let endBal = numOr(endingBalance);
  if (endBal == null && statementTotals.ending != null) endBal = statementTotals.ending;

  // Strip phantom rows Doc AI mis-extracts from the summary block — e.g. the "Total Deposits
  // and Additions" figure appearing as a huge dateless deposit, or the beginning/ending balance
  // extracted as a transaction. Drop any transaction whose amount equals a stated summary total
  // or the opening/ending balance (these large exact figures are practically never a real txn).
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const phantomAmts = new Set(
    [statementTotals.statedCredits, statementTotals.statedDebits, statementTotals.beginning, statementTotals.ending, startBal, endBal]
      .filter((v) => v != null && Number.isFinite(Number(v)) && Math.abs(Number(v)) > 1000)
      .map((v) => r2(Math.abs(v)))
  );
  if (phantomAmts.size) {
    transactions = transactions.filter((t) => !phantomAmts.has(r2(Math.abs(t.amount))));
  }

  // Printed per-day ending balances (exact) → the average daily balance no longer depends on
  // (possibly incomplete) transaction extraction. Map MM/DD to the statement's year; if a date
  // falls before the statement start, it belongs to the prior month/year (period crosses over).
  const printedDaily = (() => {
    const raw = parseDailyEndingBalances(document?.text || "");
    if (!raw.length) return null;
    const startD = parseDateLoose(statementStart ? String(statementStart) : null);
    const baseYear = stmtYear || (startD ? startD.getFullYear() : new Date().getFullYear());
    const out = [];
    for (const p of raw) {
      let year = baseYear;
      // Statement spans a month/year boundary: a month earlier than the start month is prior year.
      if (startD && p.month < (startD.getMonth() + 1) && (startD.getMonth() + 1) - p.month > 6) year = baseYear + 1;
      const date = `${year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
      out.push({ date, closing: p.closing });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  })();

  return analyzeFromTransactions(transactions, {
    fileName: meta.fileName || "",
    documentUrl: meta.documentUrl || "",
    bankName: topEntity(entities, "bank_name") || "",
    accountType: topEntity(entities, "account_type") || "",
    statementPeriod: {
      start: statementStart ? String(statementStart) : "",
      end: statementEnd ? String(statementEnd) : "",
    },
    startingBalance: startBal,
    endingBalance: endBal,
    statementTotals,
    printedDailyBalances: printedDaily,
    pdfFlags: Array.isArray(meta.pdfFlags) ? meta.pdfFlags : [],
  }, overrides, learned);
}

export { CATEGORY_LABELS, FREQUENCY_MULTIPLIER };
