import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/context/ThemeContext';
import { cn, formatCurrencyInt, formatDateMonthDayYear } from '@/lib/utils';
import { useDealDetail } from './useDealDetail';
import { HEALTH_LABEL, type DealDetailDeal, type DealHealth } from './portfolioApi';
import { MerchantPaybackRing, PORTFOLIO_CHART } from './portfolioViz';
import PaymentDealById from '../PaymentDealById';

const fmtDate = (v: string | null | undefined) => (v ? formatDateMonthDayYear(v) : '—');
const money = (v: number) => formatCurrencyInt(v, { fallback: '$0' });

function maskEin(ein: string | null | undefined): string | null {
  const digits = String(ein ?? '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `EIN ••••${digits.slice(-4)}`;
}

const HEALTH_TONE: Record<DealHealth, string> = {
  paid_off: 'bg-[#E6F9F0] text-[#2D8A5B] dark:bg-emerald-950/35 dark:text-emerald-300',
  on_track: 'bg-[#E6F9F0] text-[#2D8A5B] dark:bg-emerald-950/35 dark:text-emerald-300',
  attention: 'bg-[#FEF9C3] text-[#A16207] dark:bg-amber-400/15 dark:text-amber-300',
  delinquent: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300',
};

function HealthBadge({ health, category }: { health: DealHealth; category?: string | null }) {
  const label = (category && category.trim()) || HEALTH_LABEL[health];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', HEALTH_TONE[health])}>
      <span className={cn('size-1.5 rounded-full', health === 'delinquent' ? 'bg-red-500' : health === 'attention' ? 'bg-amber-500' : 'bg-emerald-500')} />
      {label}
    </span>
  );
}

/** Matches the donut: green repaid + red overdue over a blue balance-due track. */
function RepaidBar({ repaid, payback, overdue }: { repaid: number; payback: number; overdue: number }) {
  const base = Math.max(payback, 1);
  const repaidPct = Math.max(0, Math.min(100, Math.round((repaid / base) * 100)));
  const overduePct = Math.max(0, Math.min(100 - repaidPct, Math.round((overdue / base) * 100)));
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2.5 w-full min-w-[3rem] overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900/70"
        title={`Repaid ${repaidPct}%${overduePct > 0 ? ` • Overdue ${overduePct}%` : ''}`}
      >
        <div className="flex h-full w-full">
          <span className="h-full" style={{ width: `${repaidPct}%`, background: PORTFOLIO_CHART.repaid }} />
          <span className="h-full bg-red-500" style={{ width: `${overduePct}%` }} />
        </div>
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">{repaidPct}%</span>
    </div>
  );
}

const COLS = 'grid-cols-[minmax(11rem,1.4fr)_7rem_minmax(11rem,2.6fr)_6.5rem_6.5rem_7.5rem_1.5rem]';

function DealRow({
  d,
  selected,
  onOpen,
}: {
  d: DealDetailDeal;
  selected: boolean;
  onOpen: () => void;
}) {
  const abovePrincipal = d.repaid - d.funded;
  const overdue = d.health === 'paid_off' ? 0 : d.overdueAmount;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      title="Show deal details (collections, letters & more) below"
      className={cn(
        'grid cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors md:gap-4',
        COLS,
        'border-t border-border/60 first:border-t-0',
        selected ? 'bg-[var(--brand)]/5' : 'hover:bg-muted/40',
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate font-semibold text-foreground">
            {d.dealId ?? (d.applicationNumericId ? `#${d.applicationNumericId}` : 'Deal')}
          </span>
          {selected ? (
            <span className="rounded-sm bg-[var(--brand)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand)]">
              Viewing
            </span>
          ) : null}
          {d.bookCode ? (
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {d.bookCode}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">Funded {fmtDate(d.dates.fundedAt)}</p>
      </div>
      <div className="min-w-0"><HealthBadge health={d.health} category={d.category} /></div>
      <RepaidBar repaid={d.repaid} payback={d.payback} overdue={overdue} />
      <div className="text-right tabular-nums text-foreground">{money(d.funded)}</div>
      <div className="text-right tabular-nums text-foreground">{money(d.balance)}</div>
      <div className={cn('text-right font-medium tabular-nums', abovePrincipal < -0.005 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
        {money(abovePrincipal)}
      </div>
      <ChevronRight className={cn('size-4 justify-self-end text-muted-foreground transition-transform', selected && 'rotate-90')} aria-hidden />
    </div>
  );
}

export default function MerchantDeals() {
  const { dealRef } = useParams<{ dealRef: string }>();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const q = useDealDetail(dealRef);
  const [selectedRef, setSelectedRef] = useState<string | undefined>(dealRef);

  const data = q.data;
  const m = data?.merchant;
  const deals = useMemo<DealDetailDeal[]>(() => {
    if (!data?.deal) return [];
    const rest = data.siblings ?? [];
    return [data.deal, ...rest.filter((s) => s.id !== data.deal.id)];
  }, [data]);

  const card = isDark ? 'border-[#374151] bg-[#141517]' : 'border-[#E8EBF2] bg-card';
  const ein = maskEin(m?.ein);
  const books = (m?.books ?? []).map((b) => b.code).filter(Boolean) as string[];
  const merchantAbovePrincipal = m ? m.repaid - m.funded : 0;
  const activeSelectedRef = selectedRef ?? dealRef;

  return (
    <div className="payment-module crm-keep-case min-h-screen bg-background p-6 font-sans text-foreground lg:p-10">
      <div className="mx-auto w-full space-y-5">
        {/* Merchant header */}
        <section className={cn('rounded-xl border p-5 shadow-[0px_4px_20px_0px_#00000005]', card)}>
          <div className="flex flex-wrap items-start gap-3">
            <button
              type="button"
              onClick={() => navigate('/payments')}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
              aria-label="Back to all deals"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Merchant</p>
              {m ? (
                <>
                  <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{m.name}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {books.map((b) => (
                      <span key={b} className="rounded-sm border border-border px-1.5 py-0.5 font-medium uppercase tracking-wide">
                        {b}
                      </span>
                    ))}
                    {ein ? <span>{ein}</span> : null}
                    <span>
                      {m.dealCount} {m.dealCount === 1 ? 'deal' : 'deals'} · {m.activeDeals} active
                    </span>
                  </div>
                </>
              ) : (
                <div className="space-y-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-72" /></div>
              )}
            </div>
          </div>
        </section>

        {q.isError && !m ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-10 text-center text-sm text-red-700 dark:text-red-300">
            Could not load this merchant.
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[23rem_minmax(0,1fr)]">
            {/* Left: combined summary + donut */}
            <section className={cn('h-fit rounded-xl border p-5 shadow-[0px_4px_20px_0px_#00000005]', card)}>
              <p className="mb-4 text-sm font-semibold text-foreground">All deals combined</p>
              {m ? (
                <MerchantPaybackRing
                  isDark={isDark}
                  size={244}
                  funded={m.funded}
                  payback={m.payback}
                  repaid={m.repaid}
                  balance={m.balance}
                  overdue={m.balance <= 0.5 ? 0 : m.overdueAmount}
                  abovePrincipal={merchantAbovePrincipal}
                />
              ) : (
                <Skeleton className="h-64 w-full" />
              )}
            </section>

            {/* Right: deals table */}
            <section className={cn('overflow-hidden rounded-xl border shadow-[0px_4px_20px_0px_#00000005]', card)}>
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">
                  Deals <span className="ml-1 font-normal text-muted-foreground">{deals.length}</span>
                </p>
              </div>
              <div className={cn('hidden items-center gap-3 border-b border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid md:gap-4', COLS)}>
                <span>Deal</span>
                <span>Status</span>
                <span>Repaid</span>
                <span className="text-right">Funded</span>
                <span className="text-right">Balance</span>
                <span className="text-right">Above principal</span>
                <span />
              </div>
              {!data ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : deals.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">No deals for this merchant.</p>
              ) : (
                deals.map((d) => (
                  <DealRow
                    key={d.id}
                    d={d}
                    selected={d.applicationUuid === activeSelectedRef}
                    onOpen={() => setSelectedRef(d.applicationUuid)}
                  />
                ))
              )}
            </section>
          </div>
        )}

        {/* Selected deal — full detail (hero + Overview/Collections/Letters/… tabs) inline */}
        {activeSelectedRef ? (
          <section className={cn('overflow-hidden rounded-xl border shadow-[0px_4px_20px_0px_#00000005]', card)}>
            <PaymentDealById dealRefOverride={activeSelectedRef} embedded />
          </section>
        ) : null}
      </div>
    </div>
  );
}
