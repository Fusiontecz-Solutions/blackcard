import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getReportErrorMessage, reportApi, type BookRow } from '../reportApi';
import { BarsChart, ChartCard, KpiTile, MiniTable, TrendChart, type SeriesDef } from '../charts';
import { fmtBucket, fmtDays, fmtInt, fmtMoney, fmtMoneyShort, MUTED } from '../format';
import DrillDownTable from '../DrillDownTable';
import type { TabProps } from './types';

// ---------------------------------------------------------------------------
// Comparison table column config
// ---------------------------------------------------------------------------

interface Column {
  key: string;
  label: string;
  align: 'left' | 'right';
  better: 'high' | 'low' | 'none';
  sortValue: ((r: BookRow) => number | null) | null;
  cell: (r: BookRow) => ReactNode;
}

const BOOK_COLUMNS: Column[] = [
  {
    key: 'code',
    label: 'Book',
    align: 'left',
    better: 'none',
    sortValue: null,
    cell: (r) => (
      <div className="min-w-0">
        <div className="font-medium text-foreground">{r.code}</div>
        <div className="truncate text-xs text-muted-foreground">{r.name}</div>
      </div>
    ),
  },
  { key: 'applications', label: 'Submissions', align: 'right', better: 'high', sortValue: (r) => r.applications, cell: (r) => fmtInt(r.applications) },
  { key: 'approved', label: 'Approved', align: 'right', better: 'high', sortValue: (r) => r.approved, cell: (r) => fmtInt(r.approved) },
  { key: 'funded', label: 'Funded', align: 'right', better: 'high', sortValue: (r) => r.funded, cell: (r) => fmtInt(r.funded) },
  { key: 'fundedAmount', label: 'Funded amount', align: 'right', better: 'high', sortValue: (r) => r.fundedAmount, cell: (r) => fmtMoney(r.fundedAmount) },
  { key: 'avgFundedDeal', label: 'Avg deal', align: 'right', better: 'high', sortValue: (r) => r.avgFundedDeal, cell: (r) => fmtMoney(r.avgFundedDeal) },
  { key: 'approvalRate', label: 'Approval rate', align: 'right', better: 'high', sortValue: (r) => r.approvalRate, cell: (r) => fmtPctSafe(r.approvalRate) },
  { key: 'fundingRate', label: 'Funding rate', align: 'right', better: 'high', sortValue: (r) => r.fundingRate, cell: (r) => fmtPctSafe(r.fundingRate) },
  { key: 'avgDaysToFund', label: 'Avg days to fund', align: 'right', better: 'low', sortValue: (r) => r.avgDaysToFund, cell: (r) => fmtDays(r.avgDaysToFund) },
  {
    key: 'openPipeline',
    label: 'Open pipeline',
    align: 'right',
    better: 'none',
    sortValue: (r) => r.openAmount,
    cell: (r) => (
      <span>
        {fmtInt(r.openCount)} <span className="text-muted-foreground">· {fmtMoney(r.openAmount)}</span>
      </span>
    ),
  },
  { key: 'balanceDue', label: 'Balance due', align: 'right', better: 'low', sortValue: (r) => r.balanceDue, cell: (r) => fmtMoney(r.balanceDue) },
  { key: 'renewalShare', label: 'Renewal share', align: 'right', better: 'high', sortValue: (r) => r.renewalShare, cell: (r) => fmtPctSafe(r.renewalShare) },
  { key: 'commissionAmount', label: 'Commission', align: 'right', better: 'high', sortValue: (r) => r.commissionAmount, cell: (r) => fmtMoney(r.commissionAmount) },
];

function fmtPctSafe(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(0)}%`;
}

function sortRows(rows: BookRow[], key: string, dir: 'asc' | 'desc'): BookRow[] {
  const col = BOOK_COLUMNS.find((c) => c.key === key);
  if (!col) return rows;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (col.key === 'code') return sign * a.code.localeCompare(b.code);
    const av = col.sortValue ? col.sortValue(a) : null;
    const bv = col.sortValue ? col.sortValue(b) : null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sign * (av - bv);
  });
}

function computeBest(rows: BookRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const col of BOOK_COLUMNS) {
    if (col.better === 'none' || !col.sortValue) continue;
    let best: number | null = null;
    for (const r of rows) {
      const v = col.sortValue(r);
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      if (best === null) best = v;
      else if (col.better === 'high' && v > best) best = v;
      else if (col.better === 'low' && v < best) best = v;
    }
    if (best !== null) out[col.key] = best;
  }
  return out;
}

function sum(rows: BookRow[], get: (r: BookRow) => number): number {
  return rows.reduce((a, r) => a + get(r), 0);
}

function avgNonNull(rows: BookRow[], get: (r: BookRow) => number | null): number | null {
  const vals = rows.map(get).filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="size-3 text-muted-foreground/40" aria-hidden />;
  return dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />;
}

// ---------------------------------------------------------------------------
// Trend + bar chart data shaping (cap at 6 books + "Other")
// ---------------------------------------------------------------------------

interface TrendSeriesRaw {
  bookId: string;
  code: string;
  name: string;
  values: number[];
}

function buildTrend(trend: { buckets: string[]; series: TrendSeriesRaw[] } | undefined): { rows: Record<string, string | number>[]; series: SeriesDef[] } {
  if (!trend || !trend.buckets.length) return { rows: [], series: [] };
  const withTotals = trend.series.map((s) => ({ ...s, total: s.values.reduce((a, v) => a + v, 0) }));
  const sorted = [...withTotals].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);
  const rows = trend.buckets.map((bucket, i) => {
    const row: Record<string, string | number> = { bucket };
    for (const s of top) row[s.code] = s.values[i] ?? 0;
    if (rest.length) row.Other = rest.reduce((a, s) => a + (s.values[i] ?? 0), 0);
    return row;
  });
  const series: SeriesDef[] = top.map((s) => ({ key: s.code, label: s.code, format: fmtMoney }));
  if (rest.length) series.push({ key: 'Other', label: 'Other', format: fmtMoney, color: MUTED });
  return { rows, series };
}

interface BarDatum {
  bookId: string;
  code: string;
  value: number;
  [key: string]: unknown;
}

function foldTop6(items: BarDatum[]): BarDatum[] {
  if (items.length <= 6) return items;
  const top = items.slice(0, 6);
  const rest = items.slice(6);
  return [...top, { bookId: '', code: 'Other', value: rest.reduce((a, b) => a + b.value, 0) }];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type DrillMode = 'funded' | 'applications';

export default function BooksTab({ filters }: TabProps) {
  const q = useQuery({
    queryKey: ['reports', 'books', filters],
    queryFn: async () => (await reportApi.books(filters)).data,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const [sortKey, setSortKey] = useState('fundedAmount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [tableDrill, setTableDrill] = useState<{ bookId: string; code: string } | null>(null);
  const [chartDrill, setChartDrill] = useState<{ bookId: string; code: string; mode: DrillMode } | null>(null);

  const sortedRows = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const bestByColumn = useMemo(() => computeBest(rows), [rows]);

  const totals = useMemo(() => {
    const applications = sum(rows, (r) => r.applications);
    const approved = sum(rows, (r) => r.approved);
    const funded = sum(rows, (r) => r.funded);
    const fundedAmount = sum(rows, (r) => r.fundedAmount);
    const openCount = sum(rows, (r) => r.openCount);
    const openAmount = sum(rows, (r) => r.openAmount);
    const balanceDue = sum(rows, (r) => r.balanceDue);
    const commissionAmount = sum(rows, (r) => r.commissionAmount);
    return {
      applications,
      approved,
      funded,
      fundedAmount,
      avgFundedDeal: funded ? fundedAmount / funded : null,
      approvalRate: applications ? approved / applications : null,
      fundingRate: applications ? funded / applications : null,
      avgDaysToFund: avgNonNull(rows, (r) => r.avgDaysToFund),
      openCount,
      openAmount,
      balanceDue,
      renewalShare: avgNonNull(rows, (r) => r.renewalShare),
      commissionAmount,
    };
  }, [rows]);

  const kpis = useMemo(() => {
    const active = rows.filter((r) => r.applications > 0);
    const totalFundedAmount = sum(rows, (r) => r.fundedAmount);
    const bestFundingRate = rows.reduce<BookRow | null>((best, r) => (r.fundingRate !== null && (best === null || r.fundingRate! > (best.fundingRate ?? -Infinity)) ? r : best), null);
    const fastestAvgDays = rows.reduce<BookRow | null>((best, r) => (r.avgDaysToFund !== null && (best === null || r.avgDaysToFund! < (best.avgDaysToFund ?? Infinity)) ? r : best), null);
    const largestPipeline = rows.reduce<BookRow | null>((best, r) => (best === null || r.openAmount > best.openAmount ? r : best), null);
    return { activeCount: active.length, totalFundedAmount, bestFundingRate, fastestAvgDays, largestPipeline };
  }, [rows]);

  const trend = useMemo(() => buildTrend(q.data?.trend), [q.data]);

  const fundedBars = useMemo(() => foldTop6([...rows].sort((a, b) => b.fundedAmount - a.fundedAmount).map((r) => ({ bookId: r.bookId, code: r.code, value: r.fundedAmount }))), [rows]);
  const appsBars = useMemo(() => foldTop6([...rows].sort((a, b) => b.applications - a.applications).map((r) => ({ bookId: r.bookId, code: r.code, value: r.applications }))), [rows]);

  const toggleSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (q.isError) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{getReportErrorMessage(q.error, 'Could not load book report')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="Books with activity" value={fmtInt(kpis.activeCount)} sub={`of ${fmtInt(rows.length)} total`} loading={q.isLoading} />
        <KpiTile label="Total funded amount" value={fmtMoney(kpis.totalFundedAmount)} loading={q.isLoading} />
        <KpiTile label="Best funding rate" value={fmtPctSafe(kpis.bestFundingRate?.fundingRate ?? null)} sub={kpis.bestFundingRate?.code} loading={q.isLoading} />
        <KpiTile label="Fastest avg days to fund" value={fmtDays(kpis.fastestAvgDays?.avgDaysToFund ?? null)} sub={kpis.fastestAvgDays?.code} loading={q.isLoading} />
        <KpiTile label="Largest open pipeline" value={fmtMoney(kpis.largestPipeline?.openAmount ?? null)} sub={kpis.largestPipeline?.code} loading={q.isLoading} />
      </div>

      <section className="rounded-xl border border-border bg-card">
        <header className="px-4 pt-4">
          <h3 className="text-sm font-semibold text-foreground">Book comparison</h3>
          <p className="text-xs text-muted-foreground">Click a header to sort · click a row to see its funded deals.</p>
        </header>
        <div className="overflow-x-auto p-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                {BOOK_COLUMNS.map((col) => (
                  <th key={col.key} scope="col" className={cn('px-2 py-2 font-medium', col.align === 'right' ? 'text-right' : 'text-left')}>
                    {col.sortValue === null && col.key === 'code' ? (
                      col.label
                    ) : (
                      <button type="button" onClick={() => toggleSort(col.key)} className={cn('inline-flex items-center gap-1 hover:text-foreground', col.align === 'right' && 'flex-row-reverse')}>
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/60">
                      {BOOK_COLUMNS.map((c) => (
                        <td key={c.key} className="px-2 py-2">
                          <div className="h-4 w-full animate-pulse rounded bg-muted" />
                        </td>
                      ))}
                    </tr>
                  ))
                : sortedRows.map((r) => (
                    <tr
                      key={r.bookId}
                      onClick={() => setTableDrill((d) => (d && d.bookId === r.bookId ? null : { bookId: r.bookId, code: r.code }))}
                      className={cn('cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40', tableDrill?.bookId === r.bookId && 'bg-muted/40')}
                    >
                      {BOOK_COLUMNS.map((col) => {
                        const isBest = col.sortValue !== null && bestByColumn[col.key] !== undefined && col.sortValue(r) === bestByColumn[col.key];
                        return (
                          <td key={col.key} className={cn('px-2 py-2 text-foreground', col.align === 'right' && 'text-right tabular-nums', isBest && 'font-bold')}>
                            {col.cell(r)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              {!q.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={BOOK_COLUMNS.length} className="px-2 py-8 text-center text-muted-foreground">
                    No data for this period
                  </td>
                </tr>
              ) : null}
            </tbody>
            {!q.isLoading && rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-border font-semibold text-foreground">
                  <td className="px-2 py-2">Total</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtInt(totals.applications)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtInt(totals.approved)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtInt(totals.funded)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(totals.fundedAmount)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(totals.avgFundedDeal)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtPctSafe(totals.approvalRate)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtPctSafe(totals.fundingRate)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtDays(totals.avgDaysToFund)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtInt(totals.openCount)} <span className="font-normal text-muted-foreground">· {fmtMoney(totals.openAmount)}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(totals.balanceDue)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtPctSafe(totals.renewalShare)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(totals.commissionAmount)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {tableDrill ? (
          <div className="border-t border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">{tableDrill.code} — funded deals</h4>
              <button type="button" onClick={() => setTableDrill(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close drill-down">
                <X className="size-4" />
              </button>
            </div>
            <DrillDownTable filters={filters} query={{ bookId: tableDrill.bookId, dateField: 'fundedAt', stage: 'Funded' }} title={`${tableDrill.code} funded deals`} />
          </div>
        ) : null}
      </section>

      <ChartCard
        title="Funded amount by book over time"
        legend={trend.series}
        loading={q.isLoading}
        empty={!q.isLoading && trend.rows.length === 0}
        table={
          <MiniTable
            columns={[{ key: 'bucket', label: 'Period', format: (v) => fmtBucket(String(v)) }, ...trend.series.map((s) => ({ key: s.key, label: s.label, align: 'right' as const, format: (v: unknown) => fmtMoney(Number(v ?? 0)) }))]}
            rows={trend.rows}
          />
        }
      >
        <TrendChart data={trend.rows} xKey="bucket" series={trend.series} yFormat={fmtMoneyShort} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Funded amount by book"
          loading={q.isLoading}
          empty={!q.isLoading && fundedBars.length === 0}
          table={<MiniTable columns={[{ key: 'code', label: 'Book' }, { key: 'value', label: 'Funded amount', align: 'right', format: (v) => fmtMoney(Number(v ?? 0)) }]} rows={fundedBars} keyField="code" />}
        >
          <BarsChart
            data={fundedBars}
            xKey="code"
            horizontal
            colorByIndex
            yFormat={fmtMoneyShort}
            series={[{ key: 'value', label: 'Funded amount', format: fmtMoney }]}
            onBarClick={(row) => row.bookId && setChartDrill((d) => (d && d.bookId === row.bookId && d.mode === 'funded' ? null : { bookId: row.bookId, code: row.code, mode: 'funded' }))}
          />
        </ChartCard>
        <ChartCard
          title="Applications by book"
          loading={q.isLoading}
          empty={!q.isLoading && appsBars.length === 0}
          table={<MiniTable columns={[{ key: 'code', label: 'Book' }, { key: 'value', label: 'Submissions', align: 'right', format: (v) => fmtInt(Number(v ?? 0)) }]} rows={appsBars} keyField="code" />}
        >
          <BarsChart
            data={appsBars}
            xKey="code"
            horizontal
            colorByIndex
            yFormat={fmtInt}
            series={[{ key: 'value', label: 'Submissions', format: fmtInt }]}
            onBarClick={(row) => row.bookId && setChartDrill((d) => (d && d.bookId === row.bookId && d.mode === 'applications' ? null : { bookId: row.bookId, code: row.code, mode: 'applications' }))}
          />
        </ChartCard>
      </div>

      {chartDrill ? (
        <section className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">
              {chartDrill.code} — {chartDrill.mode === 'funded' ? 'funded deals' : 'Submissions'}
            </h4>
            <button type="button" onClick={() => setChartDrill(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close drill-down">
              <X className="size-4" />
            </button>
          </div>
          <DrillDownTable
            filters={filters}
            query={chartDrill.mode === 'funded' ? { bookId: chartDrill.bookId, dateField: 'fundedAt', stage: 'Funded' } : { bookId: chartDrill.bookId, dateField: 'createdAtTenant' }}
            title={`${chartDrill.code} ${chartDrill.mode === 'funded' ? 'funded deals' : 'Submissions'}`}
          />
        </section>
      ) : null}
    </div>
  );
}
