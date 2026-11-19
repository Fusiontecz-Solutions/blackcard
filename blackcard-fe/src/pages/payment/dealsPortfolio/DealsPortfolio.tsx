import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/context/ThemeContext';
import { cn, formatCurrencyFull, formatCurrencyInt, formatDateMonthDayYear, formatDateTimeUS } from '@/lib/utils';
import { MotionPaybackBar } from './portfolioViz';
import {
  cachedPortfolioUpdatedAt,
  fetchDealDetail,
  fetchPortfolio,
  PORTFOLIO_QUERY_GC_MS,
  PORTFOLIO_QUERY_STALE_MS,
  HEALTH_LABEL,
  readCachedDealDetail,
  readCachedPortfolio,
  seedDealDetailFromList,
  type DealHealth,
  type PortfolioDeal,
  type PortfolioMerchant,
  type PortfolioQuery,
  type PortfolioSort,
  type PortfolioStatus,
} from './portfolioApi';
import { dealDetailQueryKey } from './useDealDetail';
import { DealTagPill, DealTagSelect } from '../DealTagSelect';

const TEXT = 'text-sm';
const MUTED = 'text-sm text-muted-foreground';
const ROW_GRID =
  'grid-cols-1 md:grid-cols-[minmax(14rem,1.35fr)_minmax(16rem,2fr)_6.5rem_7rem_1.25rem]';

const fmtDate = (v: string | null | undefined) => (v ? formatDateMonthDayYear(v) : '—');
const money = (v: number) => formatCurrencyInt(v, { fallback: '$0' });

function formatEin(ein: string | null | undefined) {
  const digits = String(ein ?? '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  const pretty = digits.length === 9 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
  return `EIN ${pretty}`;
}

function visibleDealTag(category: string | null | undefined, health: DealHealth): string | null {
  const value = (category && category.trim()) || HEALTH_LABEL[health];
  if (!value) return null;
  if (value.trim().toLowerCase() === 'on track') return null;
  return value;
}

function DealStatusTag({ category, health }: { category?: string | null; health: DealHealth }) {
  return <DealTagPill value={visibleDealTag(category, health)} />;
}

function MoneyDots({
  funded,
  payback,
  repaid,
  balance,
  overdue,
  paidPct,
  precise = false,
}: {
  funded: number;
  payback: number;
  repaid: number;
  balance: number;
  overdue: number;
  paidPct: number;
  precise?: boolean;
}) {
  const amt = (v: number) => (precise ? formatCurrencyFull(v) : money(v));
  const showOverdue = overdue > 0.5 && balance > 0.5;
  const items = [
    { color: 'bg-slate-400', label: `Funded ${amt(funded)}`, title: 'Funded — approved funded amount for the deal' },
    { color: 'bg-indigo-400', label: `Payback ${amt(payback)}`, title: 'Payback total — funded amount plus fees the merchant must repay' },
    { color: 'bg-[#276d9c]', label: `Repaid ${amt(repaid)} (${paidPct}%)`, title: 'Repaid / recovered — all CREDIT transactions minus all DEBIT transactions' },
    { color: 'bg-slate-300', label: `Balance due ${amt(balance)}`, title: 'Balance due — payback still outstanding (payback minus repaid)' },
    ...(showOverdue
      ? [{ color: 'bg-red-500', label: `Overdue ${amt(overdue)}`, title: 'Overdue — payments that were due and not collected', danger: true }]
      : []),
  ];
  return (
    <p className={cn('mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-medium text-foreground', precise ? 'text-base' : 'text-sm')}>
      {items.map((item) => (
        <span
          key={item.label}
          className={cn('inline-flex items-center gap-1.5', 'danger' in item && item.danger ? 'font-semibold text-red-600 dark:text-red-400' : '')}
          title={item.title}
        >
          <span className={cn('rounded-full', precise ? 'size-2' : 'size-1.5', item.color)} />
          {item.label}
        </span>
      ))}
    </p>
  );
}

function MetricStack({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0 md:text-right">
      <p className={cn('text-[11px] font-medium tracking-wide', danger ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>{label}</p>
      <p className={cn(TEXT, 'font-semibold tabular-nums', danger ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>
        {value}
      </p>
    </div>
  );
}

function applicationState(d: PortfolioDeal) {
  return (d.stage || d.stageLabel || d.status || '').trim() || '—';
}

function isFundedState(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ') === 'funded';
}

function CurrentStateBadge({ deal }: { deal: PortfolioDeal }) {
  const label = applicationState(deal);
  const funded = isFundedState(label) || deal.health === 'paid_off';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        funded
          ? 'bg-[#E6F9F0] text-[#2D8A5B] dark:bg-emerald-950/35 dark:text-emerald-300'
          : 'border border-[#FDE68A] bg-[#FEF9C3] text-[#A16207] dark:border-amber-300/20 dark:bg-amber-400/15 dark:text-amber-300',
      )}
    >
      {label}
    </span>
  );
}

function paymentCounts(d: PortfolioDeal) {
  const paidOff = d.health === 'paid_off';
  const parts = [
    `${d.paidCount} paid`,
    `${paidOff ? 0 : d.remainingCount} remaining`,
    d.failedCount ? `${d.failedCount} failed` : null,
    d.debitCount ? `${d.debitCount} debit` : null,
    !paidOff && d.overdueCount ? `${d.overdueCount} overdue` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

const STATUS_OPTIONS: { value: PortfolioStatus; label: string }[] = [
  { value: 'all', label: 'All merchants' },
  { value: 'active', label: 'Active' },
  { value: 'attention', label: 'Attention' },
  { value: 'multi', label: 'Multi-deal' },
  { value: 'paid_off', label: 'Paid off' },
];
const SORT_OPTIONS: { value: PortfolioSort; label: string }[] = [
  { value: 'balance', label: 'Balance due' },
  { value: 'funded', label: 'Funded' },
  { value: 'repaid', label: 'Repaid' },
  { value: 'pctPaid', label: '% paid' },
  { value: 'deals', label: 'Deal count' },
  { value: 'lastFunded', label: 'Last funded' },
  { value: 'name', label: 'Name' },
];

function MerchantBlock({
  m,
  defaultOpen,
  isDark,
  onOpenDeal,
  onPrefetchDeal,
}: {
  m: PortfolioMerchant;
  defaultOpen: boolean;
  isDark: boolean;
  onOpenDeal: (d: PortfolioDeal, merchant: PortfolioMerchant) => void;
  onPrefetchDeal?: (d: PortfolioDeal) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const paidPct = m.payback > 0 ? Math.round((m.repaid / m.payback) * 100) : 0;
  const ein = formatEin(m.ein);
  const books = m.books.map((b) => b.code).filter(Boolean).join(', ');
  const meta = [
    `${m.dealCount} ${m.dealCount === 1 ? 'deal' : 'deals'}`,
    `${m.activeDeals} active`,
    m.renewals ? `${m.renewals} ${m.renewals === 1 ? 'renewal' : 'renewals'}` : null,
    books || null,
    ein,
  ].filter(Boolean);
  const merchantPaidOff = m.health === 'paid_off';
  const merchantOverdue = merchantPaidOff ? 0 : m.overdueAmount;

  return (
    <article className={cn('border-b last:border-b-0', isDark ? 'border-[#374151]' : 'border-[#E8EBF2]')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('grid w-full gap-3 px-4 py-3.5 text-left md:items-center', ROW_GRID)}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className={cn(TEXT, 'truncate font-semibold text-foreground')}>{m.name}</p>
            {[...new Set(m.deals.map((d) => visibleDealTag(d.category, d.health)).filter((v): v is string => !!v))]
              .slice(0, 2)
              .map((tag) => (
                <DealTagPill key={tag} value={tag} />
              ))}
          </div>
          <p className={cn(MUTED, 'mt-0.5 truncate text-xs')}>{meta.join(' • ')}</p>
        </div>
        <div className="min-w-0">
          <MotionPaybackBar size="md" showLegend={false} funded={m.funded} payback={m.payback} repaid={m.repaid} balance={m.balance} overdue={merchantOverdue} />
          <MoneyDots funded={m.funded} payback={m.payback} repaid={m.repaid} balance={m.balance} overdue={merchantOverdue} paidPct={paidPct} />
        </div>
        <MetricStack
          label="Next payment"
          value={merchantPaidOff ? 'Complete' : fmtDate(m.nextPaymentDate)}
        />
        <MetricStack
          label="Overdue"
          value={merchantOverdue > 0.5 ? money(merchantOverdue) : '—'}
          danger={merchantOverdue > 0.5}
        />
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform duration-200 md:justify-self-end', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="deals"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className={cn('px-4 pb-3', isDark ? 'bg-[#101114]' : 'bg-[#F7F8FB]')}>
              <div className="flex items-center justify-between gap-2 pt-2">
                <p className={cn(MUTED, 'text-xs')}>
                  {m.deals.length} {m.deals.length === 1 ? 'application' : 'applications'}
                </p>
                {m.deals[0]?.applicationUuid ? (
                  <Link
                    to={`/payments/merchant/${encodeURIComponent(m.deals[0].applicationUuid)}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline"
                  >
                    Open merchant page
                    <ChevronRight className="size-3.5" />
                  </Link>
                ) : null}
              </div>
              {m.deals.map((d) => {
                const dealPaidOff = d.health === 'paid_off';
                const dealOverdue = dealPaidOff ? 0 : d.overdueAmount;
                return (
                <div
                  key={d.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => onOpenDeal(d, m)}
                  onPointerEnter={() => onPrefetchDeal?.(d)}
                  onFocus={() => onPrefetchDeal?.(d)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenDeal(d, m);
                    }
                  }}
                  className={cn(
                    'mt-2 grid w-full cursor-pointer gap-3 rounded-md border px-3 py-3 text-left md:items-center',
                    ROW_GRID,
                    isDark ? 'border-[#2A2B2F] bg-[#141517] hover:border-[var(--brand)]/40' : 'border-[#E8EBF2] bg-white hover:border-[var(--brand)]/35',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className={cn(TEXT, 'font-semibold text-foreground')}>
                        {d.dealId ?? (d.applicationNumericId ? `#${d.applicationNumericId}` : 'Deal')}
                      </p>
                      <CurrentStateBadge deal={d} />
                      <DealStatusTag category={d.category} health={d.health} />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <DealTagSelect applicationId={d.applicationUuid} value={d.category} size="sm" />
                      </div>
                    </div>
                    <p className={cn(MUTED, 'mt-0.5 truncate text-xs')}>
                      {[
                        d.dealType,
                        d.fundedAt ? `Funded ${fmtDate(d.fundedAt)}` : null,
                        d.lastPaymentDate ? `Last ${fmtDate(d.lastPaymentDate)}` : null,
                      ].filter(Boolean).join(' • ')}
                    </p>
                    <p className={cn(MUTED, 'mt-0.5 text-xs')}>{paymentCounts(d)}</p>
                  </div>
                  <div className="min-w-0">
                    <MotionPaybackBar
                      size="md"
                      showLegend={false}
                      funded={d.funded}
                      payback={d.payback}
                      repaid={d.repaid}
                      balance={d.balance}
                      overdue={dealOverdue}
                      installment={d.installment}
                      paidCount={d.paidCount}
                      remainingCount={dealPaidOff ? 0 : d.remainingCount}
                      lastPaymentDate={d.lastPaymentDate}
                      nextPaymentDate={dealPaidOff ? null : d.nextPaymentDate}
                    />
                    <MoneyDots
                      funded={d.funded}
                      payback={d.payback}
                      repaid={d.repaid}
                      balance={d.balance}
                      overdue={dealOverdue}
                      paidPct={d.payback > 0 ? Math.round((d.repaid / d.payback) * 100) : 0}
                    />
                  </div>
                  <MetricStack
                    label="Next payment"
                    value={dealPaidOff ? 'Complete' : fmtDate(d.nextPaymentDate)}
                  />
                  <MetricStack
                    label="Overdue"
                    value={dealOverdue > 0.5 ? money(dealOverdue) : '—'}
                    danger={dealOverdue > 0.5}
                  />
                  <span />
                </div>
              );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

export default function DealsPortfolio({ search, organization }: { search: string; organization?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [status, setStatus] = useState<PortfolioStatus>('all');
  const [sortBy, setSortBy] = useState<PortfolioSort>('balance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandAll, setExpandAll] = useState(false);
  const filterKey = JSON.stringify([search.trim(), organization ?? '', status, sortBy, sortDir]);
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (next: (p: number) => number) => setPageState({ key: filterKey, page: Math.max(1, next(page)) });
  const searching = search.trim().length > 0;

  const query: PortfolioQuery = { search, organization, status, sortBy, sortDir, page, limit: 25 };
  const q = useQuery({
    queryKey: ['portfolio', 'merchants', { search, organization, status, sortBy, sortDir, page }],
    queryFn: () => fetchPortfolio(query),
    initialData: () => readCachedPortfolio(query),
    initialDataUpdatedAt: () => cachedPortfolioUpdatedAt(query),
    placeholderData: keepPreviousData,
    staleTime: PORTFOLIO_QUERY_STALE_MS,
    gcTime: PORTFOLIO_QUERY_GC_MS,
    refetchOnWindowFocus: false,
  });
  const merchants = q.data?.data ?? [];
  const totals = q.data?.totals;
  const pg = q.data?.pagination;
  const showSkeleton = !q.data && q.isPending;
  const openDeal = (d: PortfolioDeal, merchant: PortfolioMerchant) => {
    const key = dealDetailQueryKey(d.applicationUuid);
    if (!queryClient.getQueryData(key) && !readCachedDealDetail(d.applicationUuid)) {
      queryClient.setQueryData(key, seedDealDetailFromList(d, merchant));
    }
    void queryClient.prefetchQuery({
      queryKey: key,
      queryFn: () => fetchDealDetail(d.applicationUuid),
      staleTime: 0,
    });
    navigate(`/payments/${encodeURIComponent(d.applicationUuid)}`);
  };
  const prefetchDeal = (d: PortfolioDeal) => {
    void queryClient.prefetchQuery({
      queryKey: dealDetailQueryKey(d.applicationUuid),
      queryFn: () => fetchDealDetail(d.applicationUuid),
      staleTime: PORTFOLIO_QUERY_STALE_MS,
    });
  };
  const refresh = () => {
    void queryClient.fetchQuery({
      queryKey: ['portfolio', 'merchants', { search, organization, status, sortBy, sortDir, page }],
      queryFn: () => fetchPortfolio({ ...query, fresh: true }),
      staleTime: 0,
    });
  };
  const card = isDark ? 'border-[#374151] bg-[#141517]' : 'border-[#E8EBF2] bg-card';
  const repaidPct = totals && totals.payback > 0 ? Math.round((totals.repaid / totals.payback) * 100) : 0;
  const asOf = q.data?.dataAsOf || q.data?.asOf;
  const selectCls = cn(
    'h-8 rounded-md border px-2 text-sm',
    isDark ? 'border-[#374151] bg-[#141517] text-foreground' : 'border-border bg-card',
  );

  return (
    <div className="mt-5 space-y-3">
      {q.isError ? (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Could not load merchants.
        </div>
      ) : (
        <section className={cn('overflow-hidden rounded-md border', card)}>
          <div className={cn('border-b px-4 py-4', isDark ? 'border-[#374151]' : 'border-[#E8EBF2]')}>
            <p className="text-sm font-semibold text-foreground">Portfolio payback progress</p>
            {totals ? (
              <div className="mt-3">
                <MotionPaybackBar
                  size="md"
                  showLegend={false}
                  offer={totals.offer}
                  funded={totals.funded}
                  payback={totals.payback}
                  repaid={totals.repaid}
                  balance={totals.balance}
                  overdue={totals.overdueAmount}
                />
                <MoneyDots
                  precise
                  funded={totals.funded}
                  payback={totals.payback}
                  repaid={totals.repaid}
                  balance={totals.balance}
                  overdue={totals.overdueAmount}
                  paidPct={repaidPct}
                />
              </div>
            ) : showSkeleton ? (
              <Skeleton className="mt-3 h-10 w-full" />
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <select
                className={selectCls}
                value={status}
                onChange={(e) => setStatus(e.target.value as PortfolioStatus)}
                aria-label="Filter merchants"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
              <select
                className={selectCls}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as PortfolioSort)}
                aria-label="Sort merchants"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" className="h-8 text-sm" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                {sortDir === 'asc' ? 'Asc' : 'Desc'}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-sm" onClick={() => setExpandAll((v) => !v)}>
                {expandAll ? 'Collapse all' : 'Expand all'}
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={refresh} disabled={q.isFetching} title="Refresh">
                <RefreshCw className={cn('size-4', q.isFetching && 'animate-spin')} />
              </Button>
              <p className="ml-auto text-xs text-muted-foreground">
                {asOf ? `Data as of ${formatDateTimeUS(asOf)}` : null}
                {asOf ? ' · ' : null}
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() => navigate('/payments/failed-transactions')}
                >
                  Collections report
                </button>
              </p>
            </div>
          </div>

          <div className={cn('flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5', isDark ? 'border-[#374151]' : 'border-[#E8EBF2]')}>
            <p className="text-sm font-medium text-foreground">
              Merchants
              <span className="ml-2 font-normal text-muted-foreground">
                {showSkeleton ? 'Loading…' : `${pg?.total ?? merchants.length}`}
                {q.isFetching && q.data ? ' · Refreshing' : ''}
              </span>
            </p>
          </div>
          <div className={cn('hidden border-b px-4 py-2 md:grid md:items-center', ROW_GRID, isDark ? 'border-[#374151]' : 'border-[#E8EBF2]')}>
            <p className={MUTED}>Merchant</p>
            <p className={MUTED}>Funded · Payback</p>
            <p className={cn(MUTED, 'md:text-right')}>Next payment</p>
            <p className="md:text-right text-[11px] font-medium tracking-wide text-red-600 dark:text-red-400">Overdue</p>
            <span />
          </div>
          {showSkeleton ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : merchants.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {searching ? 'No merchants match that search.' : 'No funded deals to group yet.'}
            </p>
          ) : (
            merchants.map((m) => (
              <MerchantBlock
                key={m.key}
                m={m}
                isDark={isDark}
                defaultOpen={expandAll || searching}
                onOpenDeal={openDeal}
                onPrefetchDeal={prefetchDeal}
              />
            ))
          )}
        </section>
      )}

      {pg && pg.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(pg.page - 1) * pg.limit + 1}–{Math.min(pg.page * pg.limit, pg.total)} of {pg.total}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-8 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2">{pg.page} / {pg.totalPages}</span>
            <Button size="sm" variant="outline" className="h-8 px-2" disabled={page >= pg.totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
