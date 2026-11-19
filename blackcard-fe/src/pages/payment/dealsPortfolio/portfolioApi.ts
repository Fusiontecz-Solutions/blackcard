import { axiosGet } from '@/redux/axios';

export type DealHealth = 'paid_off' | 'on_track' | 'attention' | 'delinquent';

const PORTFOLIO_STALE_MS = 5 * 60_000;
const SESSION_TTL_MS = 5 * 60_000;
const SESSION_PREFIX = 'blackcard.portfolio.';

type SessionEntry<T> = { at: number; data: T };

function sessionKey(kind: string, extra: unknown) {
  return `${SESSION_PREFIX}${kind}:${JSON.stringify(extra)}`;
}

function readSession<T>(key: string): { at: number; data: T } | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SessionEntry<T>;
    if (!parsed || typeof parsed.at !== 'number' || parsed.data == null) return undefined;
    if (Date.now() - parsed.at > SESSION_TTL_MS) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeSession<T>(key: string, data: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data } satisfies SessionEntry<T>));
  } catch {
    /* quota / private mode */
  }
}

export function clearPortfolioSessionCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export const PORTFOLIO_QUERY_STALE_MS = PORTFOLIO_STALE_MS;
export const PORTFOLIO_QUERY_GC_MS = 15 * 60_000;

export interface PortfolioDeal {
  id: string;
  bookId: string;
  bookCode: string | null;
  bookName: string | null;
  applicationUuid: string;
  applicationNumericId: string | null;
  dealId: string | null;
  merchantName: string | null;
  clientId: string | null;
  dealType: string | null;
  stage: string | null;
  stageLabel: string | null;
  status: string | null;
  category: string | null;
  health: DealHealth;
  agentName: string | null;
  isoName: string | null;
  underwriterName: string | null;
  offer: number;
  funded: number;
  payback: number;
  repaid: number;
  balance: number;
  pctPaid: number;
  commission: number;
  fundedAt: string | null;
  createdAt: string | null;
  installment: number | null;
  nextPaymentDate: string | null;
  nextPaymentAmount: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number;
  paidCount: number;
  remainingCount: number;
  failedCount: number;
  failedAmount: number;
  debitCount: number;
  debitAmount: number;
  overdueCount: number;
  overdueAmount: number;
  daysSinceLastPayment: number | null;
  isDuplicate: boolean;
}

export interface PortfolioMerchant {
  key: string;
  name: string;
  ein: string | null;
  books: { bookId: string; code: string | null; name: string | null }[];
  crossBook: boolean;
  dealCount: number;
  activeDeals: number;
  paidOffDeals: number;
  renewals: number;
  offer: number;
  funded: number;
  payback: number;
  repaid: number;
  balance: number;
  pctPaid: number;
  health: DealHealth;
  overdueAmount: number;
  failedCount: number;
  debitCount: number;
  debitAmount: number;
  nextPaymentDate: string | null;
  lastPaymentDate: string | null;
  lastFundedAt: string | null;
  categories: string[];
  deals: PortfolioDeal[];
}

export interface PortfolioTotals {
  merchants: number;
  deals: number;
  activeDeals: number;
  crossBookMerchants: number;
  multiDealMerchants: number;
  offer: number;
  funded: number;
  payback: number;
  repaid: number;
  balance: number;
  overdueAmount: number;
  attention: number;
}

export interface PortfolioResponse {
  success: boolean;
  asOf: string;
  dataAsOf: string | null;
  totals: PortfolioTotals;
  data: PortfolioMerchant[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export type PortfolioStatus = 'all' | 'active' | 'paid_off' | 'attention' | 'multi';
export type PortfolioSort = 'balance' | 'funded' | 'repaid' | 'name' | 'pctPaid' | 'deals' | 'lastFunded';

export interface PortfolioQuery {
  search?: string;
  organization?: string;
  status?: PortfolioStatus;
  sortBy?: PortfolioSort;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  fresh?: boolean;
}

function portfolioCacheKey(q: PortfolioQuery) {
  return sessionKey('merchants', {
    search: q.search?.trim() || '',
    organization: q.organization?.trim() || '',
    status: q.status || 'all',
    sortBy: q.sortBy || 'balance',
    sortDir: q.sortDir || 'desc',
    page: q.page ?? 1,
    limit: q.limit ?? 25,
  });
}

export function readCachedPortfolio(q: PortfolioQuery): PortfolioResponse | undefined {
  return readSession<PortfolioResponse>(portfolioCacheKey(q))?.data;
}

export function cachedPortfolioUpdatedAt(q: PortfolioQuery): number | undefined {
  return readSession<PortfolioResponse>(portfolioCacheKey(q))?.at;
}

export async function fetchPortfolio(q: PortfolioQuery): Promise<PortfolioResponse> {
  const params: Record<string, string | number> = {};
  if (q.search?.trim()) params.search = q.search.trim();
  if (q.organization?.trim()) params.organization = q.organization.trim();
  if (q.status && q.status !== 'all') params.status = q.status;
  if (q.sortBy) params.sortBy = q.sortBy;
  if (q.sortDir) params.sortDir = q.sortDir;
  params.page = q.page ?? 1;
  params.limit = q.limit ?? 25;
  if (q.fresh) params.fresh = 1;
  const res = await axiosGet('/collection-payments/portfolio/merchants', { params });
  const data = res.data as PortfolioResponse;
  writeSession(portfolioCacheKey(q), data);
  return data;
}

export interface DealDetailDeal extends Omit<PortfolioDeal, 'createdAt' | 'fundedAt'> {
  priority: string | null;
  salesRep: string | null;
  factorRate: number | null;
  commissionPct: number | null;
  frequency: string | null;
  expectedPayoffDate: string | null;
  dates: {
    createdAt: string | null;
    claimedAt: string | null;
    approvedAt: string | null;
    contractSentAt: string | null;
    contractSignedAt: string | null;
    fundedAt: string | null;
  };
  syncedAt: string;
}

export interface DealDetailResponse {
  success: boolean;
  asOf: string;
  deal: DealDetailDeal;
  schedule: {
    strip: { date: string; status: string; amount: number }[];
    recent: { date: string | null; status: string; amount: number; reason: string | null; method: string | null }[];
    upcoming: { date: string; amount: number }[];
    counts: { paid: number; failed: number; debit: number; scheduled: number; overdue: number };
  };
  merchant: {
    name: string;
    ein: string | null;
    books: { bookId: string; code: string | null; name: string | null }[];
    dealCount: number;
    activeDeals: number;
    offer: number;
    funded: number;
    payback: number;
    repaid: number;
    balance: number;
    overdueAmount: number;
  };
  siblings: DealDetailDeal[];
}

export function readCachedDealDetail(ref: string): DealDetailResponse | undefined {
  return readSession<DealDetailResponse>(sessionKey('deal', ref.trim().toLowerCase()))?.data;
}

export function cachedDealDetailUpdatedAt(ref: string): number | undefined {
  return readSession<DealDetailResponse>(sessionKey('deal', ref.trim().toLowerCase()))?.at;
}

export async function fetchDealDetail(ref: string, opts?: { fresh?: boolean }): Promise<DealDetailResponse> {
  const params = opts?.fresh ? { fresh: 1 } : undefined;
  const res = await axiosGet(`/collection-payments/portfolio/deal/${encodeURIComponent(ref)}`, { params });
  const data = res.data as DealDetailResponse;
  writeSession(sessionKey('deal', ref.trim().toLowerCase()), data);
  return data;
}

export const HEALTH_LABEL: Record<DealHealth, string> = {
  paid_off: 'Paid off',
  on_track: 'On track',
  attention: 'Needs attention',
  delinquent: 'Delinquent',
};

/** Instant deal-page paint from All Deals rows while the full detail request runs. */
export function seedDealDetailFromList(deal: PortfolioDeal, merchant: PortfolioMerchant): DealDetailResponse {
  const toDetail = (d: PortfolioDeal): DealDetailDeal => ({
    ...d,
    priority: null,
    salesRep: null,
    factorRate: d.funded > 0 ? Math.round((d.payback / d.funded) * 10000) / 10000 : null,
    commissionPct: null,
    frequency: null,
    expectedPayoffDate: null,
    dates: {
      createdAt: d.createdAt,
      claimedAt: null,
      approvedAt: null,
      contractSentAt: null,
      contractSignedAt: null,
      fundedAt: d.fundedAt,
    },
    syncedAt: d.createdAt ?? new Date().toISOString(),
  });
  return {
    success: true,
    asOf: new Date().toISOString(),
    deal: toDetail(deal),
    schedule: {
      strip: [],
      recent: [],
      upcoming: [],
      counts: {
        paid: deal.paidCount,
        failed: deal.failedCount,
        debit: deal.debitCount,
        scheduled: deal.remainingCount,
        overdue: deal.overdueCount,
      },
    },
    merchant: {
      name: merchant.name,
      ein: merchant.ein,
      books: merchant.books,
      dealCount: merchant.dealCount,
      activeDeals: merchant.activeDeals,
      offer: merchant.offer,
      funded: merchant.funded,
      payback: merchant.payback,
      repaid: merchant.repaid,
      balance: merchant.balance,
      overdueAmount: merchant.overdueAmount,
    },
    siblings: merchant.deals.filter((d) => d.id !== deal.id).map(toDetail),
  };
}
