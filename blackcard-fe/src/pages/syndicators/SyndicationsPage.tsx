import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ChevronDown, Search, X } from 'lucide-react';
import { axiosGet } from '@/redux/axios';
import { useTheme } from '@/context/ThemeContext';
import { cn, formatCurrencyFull, formatDateMonthDayYear, formatUSDShort } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import SyndicatorsSectionTabs from '@/components/syndicators/SyndicatorsSectionTabs';

type DealSyndicator = {
  id: number;
  syndicatorId: number;
  syndicatorName: string | null;
  percentageSyndicated: number;
  amountSyndicated: number;
  paybackAmountSyndicated: number;
  collectedAmount: number;
  remainingAmount: number;
  commissionAmount: number;
  status: string | null;
};
type DealRow = {
  applicationId: string;
  dealId: string | null;
  merchantName: string | null;
  businessName: string | null;
  fundingDate: string | null;
  syndicatorCount: number;
  amountSyndicated: number;
  paybackAmountSyndicated: number;
  collectedAmount: number;
  remainingAmount: number;
  commissionAmount: number;
  status: string;
  pctCollected: number;
  syndicators: DealSyndicator[];
};
type Totals = {
  deals: number;
  syndications: number;
  amountSyndicated: number;
  paybackAmountSyndicated: number;
  collectedAmount: number;
  remainingAmount: number;
};
type Txn = { key: string; date: string | null; amount: number; status: string; description: string };

const money = (v: number) => formatUSDShort(v, { fallback: '$0' });
const fmtDate = (v: string | null | undefined) => (v ? formatDateMonthDayYear(v) : '—');

function statusTone(s: string | null): string {
  const l = (s ?? '').toLowerCase();
  if (l.includes('paid')) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (l.includes('default') || l.includes('risk') || l.includes('delinq'))
    return 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300';
  if (l.includes('active')) return 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300';
  return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
}

const COLS =
  'grid-cols-[minmax(8rem,1.2fr)_minmax(10rem,1.7fr)_5rem_7rem_7rem_7rem_8rem_7.5rem_1.5rem]';

const SYND_COLS =
  'grid-cols-[minmax(9rem,1.4fr)_5rem_7rem_7rem_8.5rem_6rem]';

function StatusPill({ status }: { status: string | null }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', statusTone(status))}>
      {status || '—'}
    </span>
  );
}

function TxnStatusDot({ status }: { status: string }) {
  const l = status.toLowerCase();
  const color = l.includes('fail')
    ? 'bg-red-500'
    : l.includes('debit')
      ? 'bg-indigo-600'
      : l.includes('overdue')
        ? 'bg-amber-500'
        : l.includes('paid') || l.includes('credit') || l.includes('manual')
          ? 'bg-emerald-500'
          : 'bg-sky-400';
  return <span className={cn('size-2 shrink-0 rounded-full', color)} aria-hidden />;
}

function mapTxns(rows: unknown[]): Txn[] {
  return rows.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const date =
      (r.scheduledDate as string) || (r.paymentDate as string) || (r.createdAt as string) || null;
    const amount = Number(r.amount ?? 0) || 0;
    const status = String(r.status ?? r.paymentStatus ?? r.state ?? '—');
    const description = String(r.notes ?? r.note ?? r.description ?? '').trim();
    return { key: String(r.id ?? r._id ?? i), date, amount, status, description };
  });
}

export default function SyndicationsPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const statusParam = sp.get('status') ?? '';
  const titleParam = sp.get('title') ?? 'Syndications';
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [rows, setRows] = useState<DealRow[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [isError, setIsError] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [txns, setTxns] = useState<Record<string, Txn[] | 'loading'>>({});

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setIsError(false);
    axiosGet('/application-syndicators', { params: statusParam ? { status: statusParam } : {} })
      .then((res) => {
        if (cancelled) return;
        setRows((res.data?.data ?? []) as DealRow[]);
        setTotals((res.data?.totals ?? null) as Totals | null);
      })
      .catch(() => {
        if (!cancelled) setIsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [statusParam]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!rows) return [];
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.dealId ?? '').toLowerCase().includes(q) ||
        (r.merchantName ?? '').toLowerCase().includes(q) ||
        (r.businessName ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const toggle = (d: DealRow) => {
    const id = d.applicationId;
    setExpanded((prev) => (prev === id ? null : id));
    if (!txns[id]) {
      setTxns((t) => ({ ...t, [id]: 'loading' }));
      axiosGet('/collection-payments', { params: { applicationId: id, includeDealView: false } })
        .then((res) => setTxns((t) => ({ ...t, [id]: mapTxns((res.data?.data ?? []) as unknown[]) })))
        .catch(() => setTxns((t) => ({ ...t, [id]: [] })));
    }
  };

  const card = isDark ? 'border-[#374151] bg-[#141517]' : 'border-[#E8EBF2] bg-card';

  return (
    <div className="w-full px-4 pb-6 pt-6">
      <SyndicatorsSectionTabs />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/syndicators/dashboard')}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{titleParam}</h1>
            <p className="text-xs text-muted-foreground">Deals syndicated across syndicators — expand a deal for shares & transactions.</p>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deal or merchant…"
            className="h-9 w-64 rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/40"
          />
        </div>
      </div>

      {statusParam ? (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs">
          <span className="text-muted-foreground">Filtered by status:</span>
          <span className="font-semibold text-foreground">{statusParam}</span>
          <button type="button" onClick={() => navigate('/syndicators/syndications')} aria-label="Clear filter">
            <X className="size-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      ) : null}

      {/* Totals */}
      {totals ? (
        (() => {
          const above = totals.collectedAmount - totals.amountSyndicated;
          const tiles: {
            label: string;
            value: string;
            tone?: string;
            toneBg?: string;
          }[] = [
            { label: 'Deals', value: String(totals.deals) },
            { label: 'Syndicated', value: money(totals.amountSyndicated) },
            { label: 'Expected RTR', value: money(totals.paybackAmountSyndicated) },
            { label: 'Remaining', value: money(totals.remainingAmount) },
            {
              label: 'Above principal',
              value: `${above >= 0 ? '+' : '−'}${money(Math.abs(above))}`,
              tone: above >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
              toneBg:
                above >= 0
                  ? 'border-emerald-200 bg-gradient-to-br from-emerald-100 via-emerald-50 to-white dark:border-emerald-900/50 dark:from-emerald-950/50 dark:via-emerald-950/20 dark:to-transparent'
                  : 'border-red-200 bg-gradient-to-br from-red-100 via-red-50 to-white dark:border-red-900/50 dark:from-red-950/50 dark:via-red-950/20 dark:to-transparent',
            },
          ];
          return (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {tiles.map((t) => (
                <div key={t.label} className={cn('rounded-xl border p-3', t.toneBg ?? card)}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t.label}</p>
                  <p className={cn('mt-0.5 text-lg font-semibold tabular-nums text-foreground', t.tone)}>{t.value}</p>
                </div>
              ))}
            </div>
          );
        })()
      ) : null}

      {/* Deals table */}
      <section className={cn('mt-5 overflow-hidden rounded-xl border shadow-[0px_4px_20px_0px_#00000005]', card)}>
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            Syndicated deals <span className="ml-1 font-normal text-muted-foreground">{filtered.length}</span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[64rem]">
            <div className={cn('hidden gap-3 border-b border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid md:gap-4', COLS)}>
              <span>Deal</span>
              <span>Merchant</span>
              <span className="text-right">Synd.</span>
              <span className="text-right">Syndicated</span>
              <span className="text-right">Expected RTR</span>
              <span className="text-right">Remaining</span>
              <span className="text-right">Above principal</span>
              <span>Status</span>
              <span />
            </div>

            {isError ? (
              <p className="px-4 py-10 text-center text-sm text-red-600 dark:text-red-300">Could not load syndications.</p>
            ) : !rows ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">No syndicated deals found.</p>
            ) : (
              filtered.map((d) => {
                const isOpen = expanded === d.applicationId;
                const t = txns[d.applicationId];
                return (
                  <div key={d.applicationId} className="border-b border-border/60 last:border-b-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggle(d)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle(d);
                        }
                      }}
                      className={cn('grid cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors md:gap-4', COLS, isOpen ? 'bg-[var(--brand)]/5' : 'hover:bg-muted/40')}
                    >
                      <div className="min-w-0">
                        <span className="truncate font-semibold text-foreground">{d.dealId ?? '—'}</span>
                        {d.fundingDate ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">Funded {fmtDate(d.fundingDate)}</p>
                        ) : null}
                      </div>
                      <span className="min-w-0 truncate text-foreground">{d.merchantName ?? d.businessName ?? '—'}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{d.syndicatorCount}</span>
                      <span className="text-right tabular-nums text-foreground">{money(d.amountSyndicated)}</span>
                      <span className="text-right tabular-nums text-foreground">{money(d.paybackAmountSyndicated)}</span>
                      <span className="text-right tabular-nums text-foreground">{money(d.remainingAmount)}</span>
                      {(() => {
                        const above = d.collectedAmount - d.amountSyndicated;
                        return (
                          <span className={cn('text-right tabular-nums font-medium', above >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                            {above >= 0 ? '+' : '−'}{money(Math.abs(above))}
                          </span>
                        );
                      })()}
                      <span className="min-w-0"><StatusPill status={d.status} /></span>
                      <ChevronDown className={cn('size-4 justify-self-end text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden />
                    </div>

                    {isOpen ? (
                      <div className={cn('grid gap-4 px-4 pb-4 pt-1', isDark ? 'bg-[#101114]' : 'bg-[#F7F8FB]')}>
                        {/* Syndicators — share, invested, repayment & above principal */}
                        <div className={cn('overflow-hidden rounded-lg border shadow-md', isDark ? 'border-[#3A3B40] bg-[#141517]' : 'border-slate-300 bg-white')}>
                          <p className="border-b border-border/60 bg-gradient-to-r from-slate-100 to-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:from-slate-800/40 dark:to-transparent">
                            Syndicators in this deal ({d.syndicators.length})
                          </p>
                          <div className="overflow-x-auto">
                            <div className="min-w-[42rem]">
                              <div className={cn('grid gap-3 border-b border-border/60 bg-gradient-to-r from-slate-100 to-white px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground dark:from-slate-800/40 dark:to-transparent', SYND_COLS)}>
                                <span>Syndicator</span>
                                <span className="text-right">Share</span>
                                <span className="text-right">Invested</span>
                                <span className="text-right">Repaid</span>
                                <span className="text-right">Above principal</span>
                                <span>Status</span>
                              </div>
                              {d.syndicators.map((s) => {
                                const above = s.collectedAmount - s.amountSyndicated;
                                return (
                                  <div key={s.id} className={cn('grid items-center gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-b-0', SYND_COLS)}>
                                    <span className="truncate font-medium text-foreground">{s.syndicatorName ?? `Syndicator #${s.syndicatorId}`}</span>
                                    <span className="text-right tabular-nums text-muted-foreground">{s.percentageSyndicated.toFixed(1)}%</span>
                                    <span className="text-right tabular-nums text-foreground">{formatCurrencyFull(s.amountSyndicated)}</span>
                                    <span className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrencyFull(s.collectedAmount)}</span>
                                    <span className={cn('text-right tabular-nums font-medium', above >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                                      {above >= 0 ? '+' : '−'}{formatCurrencyFull(Math.abs(above))}
                                    </span>
                                    <span className="min-w-0"><StatusPill status={s.status ?? d.status} /></span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Transactions + per-syndicator allocation */}
                        <div className={cn('overflow-hidden rounded-lg border shadow-md', isDark ? 'border-[#3A3B40] bg-[#141517]' : 'border-slate-300 bg-white')}>
                          <p className="border-b border-border/60 bg-gradient-to-r from-slate-100 to-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:from-slate-800/40 dark:to-transparent">
                            Transactions &amp; syndicator allocation{Array.isArray(t) ? ` (${t.length})` : ''}
                          </p>
                          {t === 'loading' || t === undefined ? (
                            <div className="space-y-2 p-3">
                              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
                            </div>
                          ) : t.length === 0 ? (
                            <p className="px-3 py-4 text-center text-xs text-muted-foreground">No transactions for this deal.</p>
                          ) : (
                            <div className="max-h-80 overflow-auto">
                              <table className="w-full border-collapse text-sm">
                                <thead className="sticky top-0">
                                  <tr className="border-b border-border/60 bg-gradient-to-r from-slate-100 to-white text-[11px] uppercase tracking-wide text-muted-foreground dark:from-slate-800/40 dark:to-transparent">
                                    <th className="px-3 py-2 text-left font-medium">Date</th>
                                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                                    {d.syndicators.map((s) => (
                                      <th key={s.id} className="px-3 py-2 text-right font-medium">
                                        <span className="block text-foreground">{s.syndicatorName ?? `#${s.syndicatorId}`}</span>
                                        <span className="block font-normal normal-case">{s.percentageSyndicated.toFixed(0)}%</span>
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {t.map((x) => (
                                    <tr key={x.key} className="border-b border-border/60 hover:bg-muted/30">
                                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                                        <span className="inline-flex items-center gap-1.5">
                                          <TxnStatusDot status={x.status} />
                                          {fmtDate(x.date)}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                                        {formatCurrencyFull(x.amount)}
                                      </td>
                                      {d.syndicators.map((s) => (
                                        <td key={s.id} className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                                          {formatCurrencyFull((x.amount * s.percentageSyndicated) / 100)}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                  {/* Totals */}
                                  <tr className="border-t border-border bg-muted/30 font-semibold">
                                    <td className="px-3 py-2 text-xs uppercase text-muted-foreground">Total</td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                      {formatCurrencyFull(t.reduce((a, x) => a + x.amount, 0))}
                                    </td>
                                    {d.syndicators.map((s) => (
                                      <td key={s.id} className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                                        {formatCurrencyFull((t.reduce((a, x) => a + x.amount, 0) * s.percentageSyndicated) / 100)}
                                      </td>
                                    ))}
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
