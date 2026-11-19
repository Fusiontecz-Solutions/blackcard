/**
 * Funded-deal portfolio grouped by merchant (All Deals "By merchant" view).
 *
 * One merchant = one client. The same business under Katan II and Katan III
 * is merged when they share an EIN, or, failing that, the same normalised
 * business name. Figures use the same payback / repaid / balance helpers as
 * the payment dashboard.
 */
import { CollectionPaymentStatus, Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import { buildApplicationStatsBucketWhere } from './applicationStatsBucketWhere';
import {
  applyStrictTransactionFiltering,
  balanceDueLikeTransactionsPage,
  filterCollectionPaymentsForApplicationDeal,
  getApprovedOfferAmountForDealBalance,
  getPaybackAmountForDealBalance,
} from './collectionPaymentFinancials';
import {
  deriveOrganizationFromDealId,
  mergeApplicationWhereWithOrganization,
} from '../utils/deriveOrganizationFromDealId';

const DAY = 24 * 60 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGAL_SUFFIX =
  /\b(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corp\.|corporation|co|co\.|ltd|ltd\.|limited|plc|lp|llp|pllc|pc|dba)\b/g;
const ATTENTION_CATEGORY =
  /insufficient|nsf|default|collections?|legal|bankrupt|stopped|closed|dispute|delinq|late|missed|hold|frozen|return|needs attention/i;

function healthFromCategoryAndSignals(
  category: string | null | undefined,
  paidOff: boolean,
  overdueCount: number,
  failedOrDebit: number,
  hasOpenExceptions: boolean,
): DealHealth {
  const cat = String(category ?? '').trim().toLowerCase();
  if (cat === 'paid off' || paidOff) return 'paid_off';
  if (cat === 'delinquent') return 'delinquent';
  if (cat === 'needs attention') return 'attention';
  if (overdueCount >= 3 || failedOrDebit >= 3) return 'delinquent';
  if (ATTENTION_CATEGORY.test(String(category ?? '')) || hasOpenExceptions) return 'attention';
  return 'on_track';
}

function n(v: unknown): number {
  const x = v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

const dayStart = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function personName(
  u?: { firstName?: string | null; lastName?: string | null } | null,
): string | null {
  const s = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
  return s || null;
}

/** Normalised business name used to merge the same merchant across organizations. */
export function merchantNameKey(name: string | null | undefined): string | null {
  const s = String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s || null;
}

function einKey(ein: string | null | undefined): string | null {
  const digits = String(ein ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits : null;
}

export type DealHealth = 'paid_off' | 'on_track' | 'attention' | 'delinquent';

/** Default payment tags persisted to `Application.category`. */
export const DEFAULT_HEALTH_TAG: Record<DealHealth, string> = {
  paid_off: 'Paid off',
  on_track: 'On track',
  attention: 'Needs attention',
  delinquent: 'Delinquent',
};

const DEFAULT_HEALTH_TAG_KEYS = new Set(
  Object.values(DEFAULT_HEALTH_TAG).map((label) => label.toLowerCase()),
);

export function isDefaultHealthTag(category: string | null | undefined): boolean {
  const c = String(category ?? '').trim().toLowerCase();
  return !c || DEFAULT_HEALTH_TAG_KEYS.has(c);
}

/** Payment-health from schedule signals only (used for default DB tags). */
function healthFromSignals(
  paidOff: boolean,
  overdueCount: number,
  failedOrDebit: number,
  hasOpenExceptions: boolean,
): DealHealth {
  if (paidOff) return 'paid_off';
  if (overdueCount >= 3 || failedOrDebit >= 3) return 'delinquent';
  if (hasOpenExceptions) return 'attention';
  return 'on_track';
}

/** Write default Delinquent / Needs attention / On track / Paid off tags to Application.category. */
async function persistDefaultHealthTags(
  rows: { id: string; category: string | null | undefined; defaultTag: string }[],
): Promise<Map<string, string>> {
  const applied = new Map<string, string>();
  const byTag = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.id || !isDefaultHealthTag(row.category)) continue;
    const current = String(row.category ?? '').trim();
    if (current === row.defaultTag) continue;
    const ids = byTag.get(row.defaultTag) ?? [];
    ids.push(row.id);
    byTag.set(row.defaultTag, ids);
    applied.set(row.id, row.defaultTag);
  }
  if (byTag.size === 0) return applied;
  await Promise.all(
    [...byTag.entries()].map(([category, ids]) =>
      prisma.application.updateMany({
        where: { id: { in: ids } },
        data: { category },
      }),
    ),
  );
  return applied;
}

/** Payback collected (or residual cents) means the deal is closed. */
const PAID_OFF_BALANCE_EPS = 0.5;

function dealIsPaidOff(balance: number): boolean {
  return balance <= PAID_OFF_BALANCE_EPS;
}

/**
 * Failed / debit / past-due schedule rows are history, not current arrears,
 * once the merchant has repaid the payback amount.
 */
function currentOverdue(
  balance: number,
  overdueCount: number,
  overdueAmount: number,
): { overdueCount: number; overdueAmount: number } {
  if (dealIsPaidOff(balance)) return { overdueCount: 0, overdueAmount: 0 };
  return { overdueCount, overdueAmount };
}

export interface PortfolioQuery {
  organization?: string;
  search?: string;
  status?: 'all' | 'active' | 'paid_off' | 'attention' | 'multi';
  sortBy?: 'balance' | 'funded' | 'repaid' | 'name' | 'pctPaid' | 'deals' | 'lastFunded';
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  asOf?: Date;
  /** Bypass the in-memory snapshot (refresh button). */
  skipCache?: boolean;
}

type OrgBook = { bookId: string; code: string | null; name: string | null };

function orgBook(organization: string | null | undefined, dealId: string | null | undefined): OrgBook {
  const org =
    String(organization ?? '').trim() || deriveOrganizationFromDealId(dealId) || 'BlackCard';
  const code =
    org === 'Katan II' ? 'KK' : org === 'Katan III' ? 'KC' : org.slice(0, 6).toUpperCase();
  return {
    bookId: org.toLowerCase().replace(/\s+/g, '-'),
    code,
    name: org,
  };
}

type NormPayStatus = 'paid' | 'scheduled' | 'failed' | 'debit' | 'waived' | 'other';

function normPayStatus(status: CollectionPaymentStatus): NormPayStatus {
  switch (status) {
    case CollectionPaymentStatus.PAID:
    case CollectionPaymentStatus.CREDIT:
    case CollectionPaymentStatus.MANUAL:
      return 'paid';
    case CollectionPaymentStatus.FAILED:
      return 'failed';
    case CollectionPaymentStatus.DEBIT:
      return 'debit';
    case CollectionPaymentStatus.SCHEDULED:
    case CollectionPaymentStatus.UPCOMING:
    case CollectionPaymentStatus.DUE_TODAY:
      return 'scheduled';
    case CollectionPaymentStatus.WAIVED:
      return 'waived';
    default:
      return 'other';
  }
}

/** Same Failed/Debit pairing as GET /collection-payments (Transactions tab). */
function paymentsForFailedDebitView(scoped: PayRow[]) {
  return applyStrictTransactionFiltering(scoped).map((p) => ({
    ...p,
    norm: normPayStatus(p.status),
    due: scheduleDate(p),
    processed: processedDateOf(p),
  }));
}

const appSelect = {
  id: true,
  applicationId: true,
  dealId: true,
  type: true,
  priority: true,
  category: true,
  status: true,
  currentQueue: true,
  currentState: true,
  loanAmount: true,
  commissionAmount: true,
  commissionPercentage: true,
  createdAt: true,
  updatedAt: true,
  claimedAt: true,
  approvedAt: true,
  isDuplicate: true,
  organization: true,
  clientId: true,
  client: {
    select: {
      id: true,
      clientId: true,
      businessName: true,
      businessEinNumber: true,
    },
  },
  referringAgent: { select: { firstName: true, lastName: true } },
  assignedUnderwriter: { select: { firstName: true, lastName: true } },
  salesRepresentative: { select: { firstName: true, lastName: true } },
  iso: { select: { name: true } },
  OfferDecision: {
    select: {
      offer: true,
      decision: true,
      rate: true,
      fees: true,
      totalRemit: true,
      refinanceAmount: true,
    },
  },
  termsOffers: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      approvedAmount: true,
      factorRate: true,
      paybackAmount: true,
      commissionAmount: true,
    },
  },
  fundings: { select: { fundedAmount: true, fundingDate: true } },
  contract: { select: { createdAt: true, updatedAt: true, status: true, startDate: true } },
  document: { select: { sentAt: true, completedAt: true } },
} satisfies Prisma.ApplicationSelect;

/** List view does not need contract / document / sales-rep joins. */
const listAppSelect = {
  id: true,
  applicationId: true,
  dealId: true,
  type: true,
  category: true,
  status: true,
  currentQueue: true,
  currentState: true,
  loanAmount: true,
  commissionAmount: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  isDuplicate: true,
  organization: true,
  clientId: true,
  client: {
    select: {
      id: true,
      clientId: true,
      businessName: true,
      businessEinNumber: true,
    },
  },
  referringAgent: { select: { firstName: true, lastName: true } },
  assignedUnderwriter: { select: { firstName: true, lastName: true } },
  iso: { select: { name: true } },
  OfferDecision: {
    select: {
      offer: true,
      decision: true,
      rate: true,
      fees: true,
      totalRemit: true,
      refinanceAmount: true,
    },
  },
  termsOffers: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      approvedAmount: true,
      factorRate: true,
      paybackAmount: true,
      commissionAmount: true,
    },
  },
  fundings: { select: { fundedAmount: true, fundingDate: true } },
} satisfies Prisma.ApplicationSelect;

type AppRow = Prisma.ApplicationGetPayload<{ select: typeof appSelect }>;
type ListAppRow = Prisma.ApplicationGetPayload<{ select: typeof listAppSelect }>;

type PayRow = {
  applicationId: string;
  dealId: string | null;
  status: CollectionPaymentStatus;
  amount: Prisma.Decimal | number;
  scheduledDate: Date | null;
  processedDate: Date | null;
  Date: Date | null;
  notes?: string | null;
  TransactionCategory?: string | null;
};

const PAYMENT_LIST_SELECT = {
  applicationId: true,
  dealId: true,
  status: true,
  amount: true,
  scheduledDate: true,
  processedDate: true,
  Date: true,
  TransactionCategory: true,
} satisfies Prisma.CollectionPaymentSelect;

const PAYMENT_DETAIL_SELECT = {
  ...PAYMENT_LIST_SELECT,
  notes: true,
} satisfies Prisma.CollectionPaymentSelect;

function indexPaymentsByApp(payments: PayRow[]): Map<string, PayRow[]> {
  const map = new Map<string, PayRow[]>();
  for (const p of payments) {
    const list = map.get(p.applicationId);
    if (list) list.push(p);
    else map.set(p.applicationId, [p]);
  }
  return map;
}

function schedulePersistDefaultHealthTags(
  rows: { id: string; category: string | null | undefined; defaultTag?: string }[],
) {
  const plan = rows
    .filter((row): row is typeof row & { defaultTag: string } => !!row.defaultTag)
    .map((row) => ({ id: row.id, category: row.category, defaultTag: row.defaultTag }));
  for (const row of rows) {
    if (row.defaultTag && isDefaultHealthTag(row.category)) {
      row.category = row.defaultTag;
    }
    delete row.defaultTag;
  }
  if (plan.length === 0) return;
  void persistDefaultHealthTags(plan).catch((err) => {
    console.error('persistDefaultHealthTags failed', err);
  });
}

const PORTFOLIO_TTL_MS = 45_000;
const DEAL_DETAIL_TTL_MS = 45_000;

type UniverseCache = {
  at: number;
  lastUpdated: Date | null;
  // Built merchant rows; filtered/sorted per request from this snapshot.
  merchants: ReturnType<typeof assembleMerchants>;
};

const universeCache = new Map<string, UniverseCache>();
const dealDetailCache = new Map<string, { at: number; payload: Record<string, unknown> }>();

export function invalidateDealPortfolioCache() {
  universeCache.clear();
  dealDetailCache.clear();
}

function fundedWhere(organization?: string): Prisma.ApplicationWhereInput {
  const funded = buildApplicationStatsBucketWhere('funded') ?? {
    currentQueue: { equals: 'Funded', mode: 'insensitive' },
  };
  return mergeApplicationWhereWithOrganization(funded, organization);
}

/** Same recovered/repaid rule as the Financial Overview card: |CREDIT| − |DEBIT|. */
function creditMinusDebit(payments: PayRow[]): number {
  let credit = 0;
  let debit = 0;
  for (const p of payments) {
    const amt = Math.abs(n(p.amount));
    if (amt <= 0) continue;
    if (p.status === CollectionPaymentStatus.CREDIT) credit += amt;
    else if (p.status === CollectionPaymentStatus.DEBIT) debit += amt;
  }
  return Math.max(0, credit - debit);
}

function scheduleDate(p: PayRow): Date | null {
  return p.scheduledDate ?? p.Date ?? null;
}

function processedDateOf(p: PayRow): Date | null {
  return p.processedDate ?? p.Date ?? null;
}

type PayAgg = {
  nextDue: Date | null;
  nextAmount: number;
  lastPaid: Date | null;
  lastPaidAmount: number;
  failed: number;
  failedAmount: number;
  debit: number;
  debitAmount: number;
  overdue: number;
  overdueAmount: number;
  paidCount: number;
  scheduledCount: number;
  installment: number | null;
};

function emptyPayAgg(): PayAgg {
  return {
    nextDue: null,
    nextAmount: 0,
    lastPaid: null,
    lastPaidAmount: 0,
    failed: 0,
    failedAmount: 0,
    debit: 0,
    debitAmount: 0,
    overdue: 0,
    overdueAmount: 0,
    paidCount: 0,
    scheduledCount: 0,
    installment: null,
  };
}

function aggregatePaymentsForDeal(payments: PayRow[], dealId: string | null, today: Date): PayAgg {
  const scoped = filterCollectionPaymentsForApplicationDeal(payments, dealId);
  const a = emptyPayAgg();
  for (const p of paymentsForFailedDebitView(scoped)) {
    const status = p.norm;
    const due = p.due;
    const processed = p.processed;
    const amt = Math.abs(n(p.amount));
    if (status === 'paid') {
      a.paidCount += 1;
      if (processed && (!a.lastPaid || processed > a.lastPaid)) {
        a.lastPaid = processed;
        a.lastPaidAmount = amt;
      }
      if (a.installment === null) a.installment = amt;
    } else if (status === 'failed') {
      a.failed += 1;
      a.failedAmount += amt;
      if (due && due < today) {
        a.overdue += 1;
        a.overdueAmount += amt;
      }
    } else if (status === 'debit') {
      a.debit += 1;
      a.debitAmount += amt;
      if (due && due < today) {
        a.overdue += 1;
        a.overdueAmount += amt;
      }
    } else if (status === 'scheduled') {
      a.scheduledCount += 1;
      if (due) {
        if (due < today) {
          a.overdue += 1;
          a.overdueAmount += amt;
        } else if (!a.nextDue || due < a.nextDue) {
          a.nextDue = due;
          a.nextAmount = amt;
        }
      }
      if (a.installment === null) a.installment = amt;
    }
  }
  return a;
}

type DealListRow = ReturnType<typeof buildDealListRow>;

function buildDealListRow(d: ListAppRow, paymentsByApp: Map<string, PayRow[]>, today: Date) {
  const book = orgBook(d.organization, d.dealId);
  const offer = getApprovedOfferAmountForDealBalance(d);
  const funded = offer;
  const scopedPays = filterCollectionPaymentsForApplicationDeal(paymentsByApp.get(d.id) ?? [], d.dealId);
  const payback = getPaybackAmountForDealBalance(d, funded) || funded;
  const repaid = creditMinusDebit(scopedPays);
  const balance = balanceDueLikeTransactionsPage(payback, repaid);
  const pctPaid = payback > 0 ? Math.min(1, repaid / payback) : 0;
  const p = aggregatePaymentsForDeal(paymentsByApp.get(d.id) ?? [], d.dealId, today);
  const paidOff = dealIsPaidOff(balance);
  const overdueCount = p.overdue;
  const failedOrDebit = p.failed + p.debit;
  const hasOpenExceptions = overdueCount > 0 || failedOrDebit > 0;
  const signalHealth = healthFromSignals(paidOff, overdueCount, failedOrDebit, hasOpenExceptions);
  const health: DealHealth = isDefaultHealthTag(d.category)
    ? signalHealth
    : healthFromCategoryAndSignals(d.category, paidOff, overdueCount, failedOrDebit, hasOpenExceptions);
  const defaultTag = DEFAULT_HEALTH_TAG[signalHealth];
  const overdue = currentOverdue(balance, p.overdue, p.overdueAmount);
  const clientNumeric = d.client?.clientId != null ? String(d.client.clientId) : null;
  return {
    id: d.id,
    bookId: book.bookId,
    bookCode: book.code,
    bookName: book.name,
    applicationUuid: d.id,
    applicationNumericId: d.applicationId != null ? String(d.applicationId) : null,
    dealId: d.dealId,
    merchantName: d.client?.businessName ?? null,
    clientId: clientNumeric ?? d.clientId,
    clientEin: d.client?.businessEinNumber ?? null,
    dealType: d.type,
    stage: d.currentQueue,
    stageLabel: d.currentQueue,
    status: d.status ?? d.currentState,
    category: d.category,
    defaultTag,
    health,
    agentName: personName(d.referringAgent),
    isoName: d.iso?.name ?? null,
    underwriterName: personName(d.assignedUnderwriter),
    offer,
    funded,
    payback,
    repaid,
    balance,
    pctPaid,
    commission: n(d.commissionAmount),
    fundedAt: d.fundings?.fundingDate ?? d.approvedAt ?? d.updatedAt,
    createdAt: d.createdAt,
    installment: p.installment,
    nextPaymentDate: paidOff ? null : p.nextDue,
    nextPaymentAmount: paidOff ? 0 : p.nextAmount,
    lastPaymentDate: p.lastPaid,
    lastPaymentAmount: p.lastPaidAmount,
    paidCount: p.paidCount,
    remainingCount: paidOff ? 0 : p.scheduledCount,
    failedCount: p.failed,
    failedAmount: p.failedAmount,
    debitCount: p.debit,
    debitAmount: p.debitAmount,
    overdueCount: overdue.overdueCount,
    overdueAmount: overdue.overdueAmount,
    daysSinceLastPayment: p.lastPaid
      ? Math.floor((today.getTime() - dayStart(p.lastPaid).getTime()) / DAY)
      : null,
    isDuplicate: d.isDuplicate,
    updatedAt: d.updatedAt,
  };
}

function assembleMerchants(dealRows: DealListRow[]) {
  type Merchant = {
    key: string;
    name: string;
    books: OrgBook[];
    clientIds: string[];
    ein: string | null;
    deals: DealListRow[];
  };
  const byClient = new Map<string, Merchant>();
  for (const r of dealRows) {
    const localKey = r.clientId ?? merchantNameKey(r.merchantName) ?? r.applicationUuid;
    const m =
      byClient.get(localKey) ?? {
        key: localKey,
        name: r.merchantName ?? 'Unknown merchant',
        books: [{ bookId: r.bookId, code: r.bookCode, name: r.bookName }],
        clientIds: r.clientId ? [r.clientId] : [],
        ein: null,
        deals: [],
      };
    m.deals.push(r);
    if (!m.books.some((b) => b.bookId === r.bookId)) {
      m.books.push({ bookId: r.bookId, code: r.bookCode, name: r.bookName });
    }
    byClient.set(localKey, m);
  }

  const einByLocal = new Map<string, string | null>();
  for (const r of dealRows) {
    const localKey = r.clientId ?? merchantNameKey(r.merchantName) ?? r.applicationUuid;
    const e = einKey(r.clientEin);
    if (e && !einByLocal.get(localKey)) einByLocal.set(localKey, e);
  }

  const merged = new Map<string, Merchant>();
  for (const m of byClient.values()) {
    const ein = einByLocal.get(m.key) ?? null;
    const globalKey = ein ? `ein:${ein}` : `name:${merchantNameKey(m.name) ?? m.key}`;
    const g = merged.get(globalKey);
    if (!g) {
      merged.set(globalKey, { ...m, key: globalKey, ein });
    } else {
      g.deals.push(...m.deals);
      for (const b of m.books) if (!g.books.some((x) => x.bookId === b.bookId)) g.books.push(b);
      g.clientIds.push(...m.clientIds);
      if (!g.ein && ein) g.ein = ein;
      if (m.name.length > g.name.length) g.name = m.name;
    }
  }

  const rank: Record<DealHealth, number> = {
    delinquent: 3,
    attention: 2,
    on_track: 1,
    paid_off: 0,
  };
  return [...merged.values()].map((m) => {
    const offer = m.deals.reduce((a, d) => a + d.offer, 0);
    const funded = m.deals.reduce((a, d) => a + d.funded, 0);
    const payback = m.deals.reduce((a, d) => a + d.payback, 0);
    const repaid = m.deals.reduce((a, d) => a + d.repaid, 0);
    const balance = m.deals.reduce((a, d) => a + d.balance, 0);
    const active = m.deals.filter((d) => d.health !== 'paid_off');
    const worst = m.deals.reduce<DealHealth>(
      (w, d) => (rank[d.health] > rank[w] ? d.health : w),
      'paid_off',
    );
    const next =
      active
        .map((d) => d.nextPaymentDate)
        .filter((x): x is Date => !!x)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const last =
      m.deals
        .map((d) => d.lastPaymentDate)
        .filter((x): x is Date => !!x)
        .sort((a, b) => b.getTime() - b.getTime())[0] ?? null;
    const lastFunded =
      m.deals
        .map((d) => d.fundedAt)
        .filter((x): x is Date => !!x)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    m.deals.sort((a, b) => (b.fundedAt?.getTime() ?? 0) - (a.fundedAt?.getTime() ?? 0));
    return {
      key: m.key,
      name: m.name,
      ein: m.ein,
      books: m.books,
      crossBook: m.books.length > 1,
      dealCount: m.deals.length,
      activeDeals: active.length,
      paidOffDeals: m.deals.length - active.length,
      renewals: m.deals.filter((d) => /renew/i.test(d.dealType ?? '')).length,
      offer,
      funded,
      payback,
      repaid,
      balance,
      pctPaid: payback > 0 ? Math.min(1, repaid / payback) : 0,
      health: worst,
      overdueAmount: m.deals.reduce((a, d) => a + d.overdueAmount, 0),
      failedCount: m.deals.reduce((a, d) => a + d.failedCount, 0),
      debitCount: m.deals.reduce((a, d) => a + d.debitCount, 0),
      debitAmount: m.deals.reduce((a, d) => a + d.debitAmount, 0),
      nextPaymentDate: next,
      lastPaymentDate: last,
      lastFundedAt: lastFunded,
      categories: [...new Set(m.deals.map((d) => d.category).filter((x): x is string => !!x))],
      deals: m.deals.map(({ clientEin: _x, updatedAt: _u, defaultTag: _t, ...row }) => {
        void _x;
        void _u;
        void _t;
        return row;
      }),
    };
  });
}

async function getMerchantUniverse(organization?: string, skipCache = false) {
  const cacheKey = organization?.trim() || '__all__';
  if (!skipCache) {
    const hit = universeCache.get(cacheKey);
    if (hit && Date.now() - hit.at < PORTFOLIO_TTL_MS) return hit;
  }
  const asOf = new Date();
  const today = dayStart(asOf);
  const deals = await prisma.application.findMany({
    where: fundedWhere(organization),
    select: listAppSelect,
  });
  const appIds = deals.map((d) => d.id);
  const paymentsRaw = appIds.length
    ? await prisma.collectionPayment.findMany({
        where: { applicationId: { in: appIds } },
        select: PAYMENT_LIST_SELECT,
      })
    : [];
  const paymentsByApp = indexPaymentsByApp(paymentsRaw);
  const dealRows = deals.map((d) => buildDealListRow(d, paymentsByApp, today));
  schedulePersistDefaultHealthTags(dealRows);
  const merchants = assembleMerchants(dealRows);
  const lastUpdated = deals.reduce<Date | null>((acc, d) => {
    if (!acc || d.updatedAt > acc) return d.updatedAt;
    return acc;
  }, null);
  const universe = { at: Date.now(), lastUpdated, merchants };
  universeCache.set(cacheKey, universe);
  return universe;
}

function normalizeSearchText(v: string | null | undefined): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function searchTokens(search: string | null | undefined): string[] {
  return normalizeSearchText(search).split(' ').filter(Boolean);
}

type UniverseMerchant = Awaited<ReturnType<typeof getMerchantUniverse>>['merchants'][number];

const merchantSearchCache = new WeakMap<UniverseMerchant, string>();

function merchantSearchText(m: UniverseMerchant): string {
  const hit = merchantSearchCache.get(m);
  if (hit !== undefined) return hit;
  const parts: (string | null | undefined)[] = [m.name, m.ein];
  for (const b of m.books) parts.push(b.code, b.name);
  for (const d of m.deals) {
    parts.push(
      d.merchantName,
      d.dealId,
      d.applicationNumericId,
      d.clientId,
      d.agentName,
      d.isoName,
      d.underwriterName,
      d.bookCode,
    );
  }
  const text = ` ${parts.map(normalizeSearchText).filter(Boolean).join(' ')} `;
  merchantSearchCache.set(m, text);
  return text;
}

export async function portfolioByMerchant(q: PortfolioQuery) {
  const asOf = q.asOf ?? new Date();
  const page = Math.max(1, q.page ?? 1);
  const limit = Math.min(200, Math.max(1, q.limit ?? 25));
  const universe = await getMerchantUniverse(q.organization, q.skipCache);
  let merchants = universe.merchants.slice();

  const tokens = searchTokens(q.search);
  if (tokens.length) {
    merchants = merchants.filter((m) => {
      const hay = merchantSearchText(m);
      return tokens.every((t) => hay.includes(t));
    });
  }
  switch (q.status) {
    case 'active':
      merchants = merchants.filter((m) => m.activeDeals > 0);
      break;
    case 'paid_off':
      merchants = merchants.filter((m) => m.activeDeals === 0);
      break;
    case 'attention':
      merchants = merchants.filter((m) => m.health === 'attention' || m.health === 'delinquent');
      break;
    case 'multi':
      merchants = merchants.filter((m) => m.dealCount > 1);
      break;
    default:
      break;
  }

  const dir = q.sortDir === 'asc' ? 1 : -1;
  const by = q.sortBy ?? 'balance';
  merchants.sort((a, b) => {
    switch (by) {
      case 'name':
        return a.name.localeCompare(b.name) * (q.sortDir === 'desc' ? -1 : 1);
      case 'funded':
        return (a.funded - b.funded) * dir;
      case 'repaid':
        return (a.repaid - b.repaid) * dir;
      case 'pctPaid':
        return (a.pctPaid - b.pctPaid) * dir;
      case 'deals':
        return (a.dealCount - b.dealCount) * dir || (a.balance - b.balance) * dir;
      case 'lastFunded':
        return ((a.lastFundedAt?.getTime() ?? 0) - (b.lastFundedAt?.getTime() ?? 0)) * dir;
      default:
        return (a.balance - b.balance) * dir;
    }
  });

  const paybackTotal = merchants.reduce((a, m) => a + m.payback, 0);
  const repaidTotal = merchants.reduce((a, m) => a + m.repaid, 0);
  const totals = {
    merchants: merchants.length,
    deals: merchants.reduce((a, m) => a + m.dealCount, 0),
    activeDeals: merchants.reduce((a, m) => a + m.activeDeals, 0),
    crossBookMerchants: merchants.filter((m) => m.crossBook).length,
    multiDealMerchants: merchants.filter((m) => m.dealCount > 1).length,
    offer: merchants.reduce((a, m) => a + m.offer, 0),
    funded: merchants.reduce((a, m) => a + m.funded, 0),
    payback: paybackTotal,
    repaid: repaidTotal,
    balance: balanceDueLikeTransactionsPage(paybackTotal, repaidTotal),
    overdueAmount: merchants.reduce((a, m) => a + m.overdueAmount, 0),
    attention: merchants.filter((m) => m.health === 'attention' || m.health === 'delinquent').length,
  };

  const total = merchants.length;
  const pageRows = merchants.slice((page - 1) * limit, page * limit);

  return {
    asOf: asOf.toISOString(),
    dataAsOf: universe.lastUpdated,
    totals,
    data: pageRows,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export type PortfolioResult = Awaited<ReturnType<typeof portfolioByMerchant>>;

async function findDealApp(ref: string): Promise<AppRow | null> {
  const r = ref.trim();
  if (!r) return null;
  if (UUID_RE.test(r)) {
    const byId = await prisma.application.findFirst({ where: { id: r }, select: appSelect });
    if (byId) return byId;
  }
  const byDeal = await prisma.application.findFirst({
    where: { dealId: { equals: r, mode: 'insensitive' } },
    select: appSelect,
  });
  if (byDeal) return byDeal;
  if (/^\d+$/.test(r)) {
    return prisma.application.findFirst({
      where: { applicationId: Number(r) },
      select: appSelect,
    });
  }
  return null;
}

export async function dealDetail(
  ref: string,
  opts: { organization?: string; asOf?: Date; skipCache?: boolean } = {},
) {
  const cacheKey = `${ref.trim().toLowerCase()}|${opts.organization?.trim() || ''}`;
  if (!opts.skipCache) {
    const hit = dealDetailCache.get(cacheKey);
    if (hit && Date.now() - hit.at < DEAL_DETAIL_TTL_MS) {
      return hit.payload as Awaited<ReturnType<typeof loadDealDetailUncached>>;
    }
  }

  const payload = await loadDealDetailUncached(ref, opts);
  if (payload) dealDetailCache.set(cacheKey, { at: Date.now(), payload: payload as Record<string, unknown> });
  return payload;
}

async function loadDealDetailUncached(
  ref: string,
  opts: { organization?: string; asOf?: Date } = {},
) {
  const fact = await findDealApp(ref);
  if (!fact) return null;
  const asOf = opts.asOf ?? new Date();
  const today = dayStart(asOf);

  const nameKey = merchantNameKey(fact.client?.businessName);
  const ein = einKey(fact.client?.businessEinNumber);
  const siblingOr: Prisma.ApplicationWhereInput[] = [{ id: fact.id }];
  if (fact.clientId) siblingOr.push({ clientId: fact.clientId });
  else if (fact.client?.businessEinNumber) {
    siblingOr.push({ client: { businessEinNumber: fact.client.businessEinNumber } });
  }
  const siblingsWhere: Prisma.ApplicationWhereInput = {
    AND: [fundedWhere(undefined), { OR: siblingOr }],
  };
  const candidates = await prisma.application.findMany({
    where: siblingsWhere,
    select: appSelect,
  });
  const group = candidates.filter((c) => {
    if (c.id === fact.id) return true;
    if (fact.clientId && c.clientId === fact.clientId) return true;
    const ce = einKey(c.client?.businessEinNumber);
    if (ein && ce && ce === ein) return true;
    return !!nameKey && merchantNameKey(c.client?.businessName) === nameKey;
  });
  if (!group.some((g) => g.id === fact.id)) group.unshift(fact);

  const groupIds = [...new Set(group.map((g) => g.id))];
  const paymentsRaw = await prisma.collectionPayment.findMany({
    where: { applicationId: { in: groupIds } },
    orderBy: [{ scheduledDate: 'asc' }],
    select: PAYMENT_DETAIL_SELECT,
  });
  const paymentsByApp = indexPaymentsByApp(paymentsRaw);

  const summarise = (f: AppRow) => {
    const scoped = filterCollectionPaymentsForApplicationDeal(
      paymentsByApp.get(f.id) ?? [],
      f.dealId,
    );
    const rows = paymentsForFailedDebitView(scoped);
    const offer = getApprovedOfferAmountForDealBalance(f);
    const funded = offer;
    const payback = getPaybackAmountForDealBalance(f, funded) || funded;
    const repaid = creditMinusDebit(scoped);
    const balance = balanceDueLikeTransactionsPage(payback, repaid);
    const paid = rows.filter((p) => p.norm === 'paid');
    const failed = rows.filter((p) => p.norm === 'failed');
    const debit = rows.filter((p) => p.norm === 'debit');
    const scheduled = rows.filter((p) => p.norm === 'scheduled');
    const overdue = rows.filter(
      (p) =>
        (p.norm === 'scheduled' || p.norm === 'failed' || p.norm === 'debit') &&
        p.due &&
        p.due < today,
    );
    const upcoming = scheduled.filter((p) => p.due && p.due >= today);
    const lastPaid = [...paid].sort(
      (a, b) => (b.processed?.getTime() ?? 0) - (a.processed?.getTime() ?? 0),
    )[0] ?? null;
    const attentionCategory = !!(f.category && ATTENTION_CATEGORY.test(f.category));
    const paidOff = dealIsPaidOff(balance);
    const overdueCount = overdue.length;
    const failedOrDebit = failed.length + debit.length;
    const hasOpenExceptions =
      attentionCategory || overdueCount > 0 || failed.length > 0 || debit.length > 0;
    const signalHealth = healthFromSignals(paidOff, overdueCount, failedOrDebit, hasOpenExceptions);
    const health: DealHealth = isDefaultHealthTag(f.category)
      ? signalHealth
      : healthFromCategoryAndSignals(
          f.category,
          paidOff,
          overdueCount,
          failedOrDebit,
          hasOpenExceptions,
        );
    const defaultTag = DEFAULT_HEALTH_TAG[signalHealth];
    const openOverdue = currentOverdue(
      balance,
      overdue.length,
      overdue.reduce((a, p) => a + Math.abs(n(p.amount)), 0),
    );
    const dates = rows
      .map((p) => p.due)
      .filter((d): d is Date => !!d)
      .map((d) => dayStart(d).getTime())
      .sort((a, b) => a - b);
    const gaps = dates.slice(1).map((t, i) => (t - dates[i]) / DAY).filter((g) => g > 0);
    const gap = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
    const frequency =
      gap === null
        ? null
        : gap <= 1.5
          ? 'Daily'
          : gap <= 8
            ? 'Weekly'
            : gap <= 16
              ? 'Bi-weekly'
              : gap <= 35
                ? 'Monthly'
                : 'Custom';
    // Failed / debit rows are bounces (stored negative), never the installment amount.
    const installmentRow = scheduled[0] ?? paid[0] ?? null;
    const book = orgBook(f.organization, f.dealId);
    const contractSigned =
      f.document?.completedAt ??
      (f.contract?.status === 'SIGNED' || f.contract?.status === 'COMPLETED'
        ? f.contract.updatedAt
        : null);
    return {
      id: f.id,
      bookId: book.bookId,
      bookCode: book.code,
      bookName: book.name,
      applicationUuid: f.id,
      applicationNumericId: f.applicationId != null ? String(f.applicationId) : null,
      dealId: f.dealId,
      merchantName: f.client?.businessName ?? null,
      clientId: f.client?.clientId != null ? String(f.client.clientId) : f.clientId,
      dealType: f.type,
      priority: f.priority,
      stage: f.currentQueue,
      stageLabel: f.currentQueue,
      status: f.status ?? f.currentState,
      category: f.category,
      defaultTag,
      health,
      agentName: personName(f.referringAgent),
      isoName: f.iso?.name ?? null,
      underwriterName: personName(f.assignedUnderwriter),
      salesRep: personName(f.salesRepresentative),
      offer,
      funded,
      payback,
      repaid,
      balance,
      pctPaid: payback > 0 ? Math.min(1, repaid / payback) : 0,
      factorRate: funded > 0 ? Math.round((payback / funded) * 10000) / 10000 : null,
      commission: n(f.commissionAmount),
      commissionPct: f.commissionPercentage == null ? null : n(f.commissionPercentage),
      installment: installmentRow ? Math.abs(n(installmentRow.amount)) : null,
      frequency,
      paidCount: paid.length,
      remainingCount: paidOff ? 0 : scheduled.length,
      failedCount: failed.length,
      failedAmount: failed.reduce((a, p) => a + Math.abs(n(p.amount)), 0),
      debitCount: debit.length,
      debitAmount: debit.reduce((a, p) => a + Math.abs(n(p.amount)), 0),
      overdueCount: openOverdue.overdueCount,
      overdueAmount: openOverdue.overdueAmount,
      nextPaymentDate: paidOff ? null : upcoming[0]?.due ?? null,
      nextPaymentAmount: paidOff ? 0 : upcoming[0] ? n(upcoming[0].amount) : 0,
      lastPaymentDate: lastPaid?.processed ?? null,
      lastPaymentAmount: lastPaid ? n(lastPaid.amount) : 0,
      daysSinceLastPayment: lastPaid?.processed
        ? Math.floor((today.getTime() - dayStart(lastPaid.processed).getTime()) / DAY)
        : null,
      expectedPayoffDate: paidOff
        ? lastPaid?.processed ?? null
        : upcoming.length
          ? upcoming[upcoming.length - 1].due
          : null,
      dates: {
        createdAt: f.createdAt,
        claimedAt: f.claimedAt,
        approvedAt: f.approvedAt,
        contractSentAt: f.document?.sentAt ?? f.contract?.createdAt ?? null,
        contractSignedAt: contractSigned,
        fundedAt: f.fundings?.fundingDate ?? f.approvedAt ?? f.updatedAt,
      },
      isDuplicate: f.isDuplicate,
      syncedAt: f.updatedAt,
      rows,
    };
  };

  const me = summarise(fact);
  const siblings = group
    .filter((g) => g.id !== fact.id)
    .map(summarise)
    .sort((a, b) => (b.dates.fundedAt?.getTime() ?? 0) - (a.dates.fundedAt?.getTime() ?? 0));
  const all = [me, ...siblings];
  schedulePersistDefaultHealthTags(all);
  const merchant = {
    name: fact.client?.businessName ?? 'Unknown merchant',
    ein: ein
      ? ein.length === 9
        ? `${ein.slice(0, 2)}-${ein.slice(2)}`
        : ein
      : null,
    books: [...new Set(all.map((d) => d.bookId))].map((id) => {
      const hit = all.find((d) => d.bookId === id);
      return { bookId: id, code: hit?.bookCode ?? null, name: hit?.bookName ?? null };
    }),
    dealCount: all.length,
    activeDeals: all.filter((d) => d.health !== 'paid_off').length,
    offer: all.reduce((a, d) => a + d.offer, 0),
    funded: all.reduce((a, d) => a + d.funded, 0),
    payback: all.reduce((a, d) => a + d.payback, 0),
    repaid: all.reduce((a, d) => a + d.repaid, 0),
    balance: all.reduce((a, d) => a + d.balance, 0),
    overdueAmount: all.reduce((a, d) => a + d.overdueAmount, 0),
  };

  const mine = me.rows;
  const paidOff = me.health === 'paid_off';
  const strip = mine
    .filter((p) => p.due)
    .sort((a, b) => a.due!.getTime() - b.due!.getTime())
    .map((p) => ({
      date: p.due!,
      status:
        paidOff && p.norm === 'scheduled'
          ? 'scheduled'
          : p.norm === 'scheduled' && p.due! < today
            ? 'overdue'
            : p.norm === 'debit'
              ? 'debit'
              : p.norm,
      amount: n(p.amount),
    }));
  const recent = mine
    .filter((p) => p.norm === 'paid' || p.norm === 'failed' || p.norm === 'debit')
    .sort(
      (a, b) =>
        ((b.processed ?? b.due)?.getTime() ?? 0) - ((a.processed ?? a.due)?.getTime() ?? 0),
    )
    .slice(0, 10)
    .map((p) => ({
      date: p.processed ?? p.due,
      status: p.norm,
      amount: n(p.amount),
      reason: p.norm === 'failed' || p.norm === 'debit' ? p.notes : null,
      method: p.TransactionCategory,
    }));
  const upcoming = paidOff
    ? []
    : mine
        .filter((p) => p.norm === 'scheduled' && p.due && p.due >= today)
        .slice(0, 8)
        .map((p) => ({ date: p.due!, amount: n(p.amount) }));

  const strip60 =
    strip.length > 60
      ? strip.slice(Math.max(0, strip.findIndex((s) => s.date >= today) - 40)).slice(0, 60)
      : strip;
  const stripOut = (strip60.length ? strip60 : strip).map((s) => ({
    ...s,
    date: s.date.toISOString(),
  }));

  const { rows: _r, ...dealOut } = me;
  void _r;
  return {
    asOf: asOf.toISOString(),
    deal: dealOut,
    schedule: {
      strip: stripOut,
      recent,
      upcoming,
      counts: {
        paid: me.paidCount,
        failed: me.failedCount,
        debit: me.debitCount,
        scheduled: me.remainingCount,
        overdue: me.overdueCount,
      },
    },
    merchant,
    siblings: siblings.map(({ rows: _x, ...s }) => {
      void _x;
      return s;
    }),
  };
}

export type DealDetailResult = NonNullable<Awaited<ReturnType<typeof dealDetail>>>;
