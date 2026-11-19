import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { BarsChart, ChartCard, KpiTile, MiniTable, ShareBar, TrendChart } from '../charts';
import { fmtBucket, fmtInt, fmtMoney, fmtMoneyShort, fmtPct, MUTED, SERIES } from '../format';
import { applicationHref } from '../drillDown';
import { getReportErrorMessage, reportApi, type CollectionsReport, type PaymentKind, type PaymentRow } from '../reportApi';
import type { TabProps } from './types';

const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

function StatusPill({ status, daysOverdue }: { status: string; daysOverdue: number }) {
  const overdue = daysOverdue > 0 && status !== 'paid' && status !== 'waived';
  const tone = status === 'paid' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : status === 'failed' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : overdue ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground';
  return <span className={cn('rounded-full px-2 py-px text-[11px] font-medium capitalize', tone)}>{overdue && status === 'scheduled' ? `overdue ${daysOverdue}d` : status}</span>;
}

/** Drill-down list of payments for a given kind. */
function PaymentsPanel({ filters, kind, applicationUuid, bookId, title, onClose }: { filters: TabProps['filters']; kind: PaymentKind; applicationUuid?: string; bookId?: string; title: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['reports', 'collections', 'payments', filters, kind, applicationUuid, bookId, page],
    queryFn: () => reportApi.payments(filters, { kind, applicationUuid, bookId, page, limit: 25 }),
    placeholderData: keepPreviousData,
  });
  const rows = q.data?.data ?? [];
  const pg = q.data?.pagination;
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">{pg ? `${fmtInt(pg.total)} payment${pg.total === 1 ? '' : 's'}` : 'Loading…'}</div>
        </div>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>
      {q.isError ? (
        <div className="p-4 text-sm text-red-600">{getReportErrorMessage(q.error, 'Could not load payments')}</div>
      ) : q.isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No payments match.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Merchant</th>
                <th className="px-3 py-2">Book</th>
                <th className="px-3 py-2">Deal</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Scheduled</th>
                <th className="px-3 py-2">Processed</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Method</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: PaymentRow) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground">
                    {r.applicationUuid ? (
                      <Link to={applicationHref({ applicationUuid: r.applicationUuid, bookCode: r.bookCode })} className="inline-flex items-center gap-1 hover:underline">
                        {r.merchantName ?? r.applicationNumericId ?? r.dealId ?? 'Unknown'} <ExternalLink className="size-3 text-muted-foreground" />
                      </Link>
                    ) : (
                      r.merchantName ?? r.dealId ?? 'Unknown'
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.bookCode ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.dealId ?? r.applicationNumericId ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtMoney(r.amount)}</td>
                  <td className="px-3 py-2"><StatusPill status={r.status} daysOverdue={r.daysOverdue} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.scheduledDate)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.processedDate)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.failureReason ?? (r.status === 'failed' ? r.rawStatus : '') ?? ''}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.method ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pg && pg.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>Page {pg.page} of {pg.totalPages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4" /></Button>
            <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= pg.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="size-4" /></Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CollectionsTab({ filters }: TabProps) {
  const q = useQuery({
    queryKey: ['reports', 'collections', filters],
    queryFn: async () => (await reportApi.collections(filters)).data,
    placeholderData: keepPreviousData,
  });
  const d: CollectionsReport | undefined = q.data;
  const loading = q.isLoading;
  const [drill, setDrill] = useState<{ kind: PaymentKind; title: string; applicationUuid?: string; bookId?: string } | null>(null);

  const aging = useMemo(() => Object.entries(d?.overdue.aging ?? {}).map(([bucket, v]) => ({ bucket: `${bucket} days`, amount: v.amount, count: v.count })), [d]);
  const trend = d?.trend ?? [];
  const byBook = d?.byBook ?? [];
  const reasons = d?.failedReasons ?? [];

  if (q.isError) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{getReportErrorMessage(q.error, 'Could not load collections')}</div>;

  const noData = !loading && d && d.portfolio.fundedDeals === 0;

  return (
    <div className="space-y-4">
      {noData ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>No funded deals or payment schedules have been synced yet. Collections fill in after the first sync against a book with a payments endpoint.</span>
        </div>
      ) : null}

      {/* Portfolio */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Total funded" value={fmtMoney(d?.portfolio.totalFunded)} sub={d ? `${fmtInt(d.portfolio.fundedDeals)} funded deals` : undefined} loading={loading} />
        <KpiTile label="Expected payback" value={fmtMoney(d?.portfolio.totalPayback)} sub="Total contracted payback" loading={loading} />
        <KpiTile label="Collected to date" value={fmtMoney(d?.portfolio.collectedToDate)} sub={d ? `${fmtPct(d.portfolio.collectedShare)} of payback` : undefined} loading={loading} accent="good" />
        <KpiTile label="Outstanding balance" value={fmtMoney(d?.portfolio.outstanding)} sub="Still to collect" loading={loading} />
      </div>

      {/* Today / near term */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile label="Expected today" value={fmtMoney(d?.today.expectedAmount)} sub={d ? `${fmtInt(d.today.expectedCount)} payments due` : undefined} loading={loading} onClick={() => setDrill({ kind: 'due', title: 'Payments due' })} />
        <KpiTile label="Received today" value={fmtMoney(d?.today.receivedAmount)} sub={d ? `${fmtInt(d.today.receivedCount)} payments` : undefined} loading={loading} accent="good" onClick={() => setDrill({ kind: 'paid', title: 'Payments received' })} />
        <KpiTile label="Failed today" value={fmtInt(d?.today.failedCount)} sub={d ? fmtMoney(d.today.failedAmount) : undefined} loading={loading} accent={d && d.today.failedCount > 0 ? 'critical' : 'neutral'} onClick={() => setDrill({ kind: 'failed', title: 'Failed payments' })} />
        <KpiTile label={`Due next ${d?.dueSoonDays ?? 7} days`} value={fmtMoney(d?.dueSoon.amount)} sub={d ? `${fmtInt(d.dueSoon.count)} payments` : undefined} loading={loading} onClick={() => setDrill({ kind: 'due', title: 'Payments due' })} />
        <KpiTile label="Overdue" value={fmtMoney(d?.overdue.amount)} sub={d ? `${fmtInt(d.overdue.count)} payments past due` : undefined} loading={loading} accent={d && d.overdue.count > 0 ? 'warning' : 'neutral'} onClick={() => setDrill({ kind: 'overdue', title: 'Overdue payments' })} />
      </div>

      {/* Period */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Expected in period" value={fmtMoney(d?.period.expected)} loading={loading} />
        <KpiTile label="Collected in period" value={fmtMoney(d?.period.collected)} sub={d ? `${fmtPct(d.period.collectionRate)} collection rate` : undefined} loading={loading} accent="good" />
        <KpiTile label="Failed in period" value={fmtInt(d?.period.failedCount)} sub={d ? `${fmtMoney(d.period.failedAmount)} · ${fmtPct(d.period.failureRate)} of attempts` : undefined} loading={loading} accent={d && d.period.failedCount > 0 ? 'critical' : 'neutral'} onClick={() => setDrill({ kind: 'failed', title: 'Failed payments in period' })} />
        <KpiTile label="Payments received" value={fmtInt(d?.period.paidCount)} sub="in period" loading={loading} />
      </div>

      {drill ? <PaymentsPanel filters={filters} kind={drill.kind} applicationUuid={drill.applicationUuid} bookId={drill.bookId} title={drill.title} onClose={() => setDrill(null)} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Expected vs collected"
          subtitle="Scheduled amount by due date against amount received by processed date"
          loading={loading}
          empty={!trend.length}
          legend={[{ key: 'expected', label: 'Expected', color: MUTED, format: fmtMoney }, { key: 'collected', label: 'Collected', color: SERIES[0], format: fmtMoney }]}
          table={<MiniTable columns={[{ key: 'bucket', label: 'Period', format: (v) => fmtBucket(String(v)) }, { key: 'expected', label: 'Expected', align: 'right', format: (v) => fmtMoney(Number(v)) }, { key: 'collected', label: 'Collected', align: 'right', format: (v) => fmtMoney(Number(v)) }]} rows={trend as unknown as Record<string, unknown>[]} keyField="bucket" />}
        >
          <TrendChart data={trend} xKey="bucket" area series={[{ key: 'expected', label: 'Expected', color: MUTED, format: fmtMoney }, { key: 'collected', label: 'Collected', color: SERIES[0], format: fmtMoney }]} yFormat={fmtMoneyShort} />
        </ChartCard>
        <ChartCard
          title="Failed payments over time"
          subtitle="Count of failed or returned payments"
          loading={loading}
          empty={!trend.length}
          legend={[{ key: 'failedCount', label: 'Failed', color: SERIES[3] }]}
          table={<MiniTable columns={[{ key: 'bucket', label: 'Period', format: (v) => fmtBucket(String(v)) }, { key: 'failedCount', label: 'Failed', align: 'right' }, { key: 'failed', label: 'Amount', align: 'right', format: (v) => fmtMoney(Number(v)) }]} rows={trend as unknown as Record<string, unknown>[]} keyField="bucket" />}
        >
          <BarsChart data={trend} xKey="bucket" series={[{ key: 'failedCount', label: 'Failed', color: SERIES[3] }]} xFormat={fmtBucket} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Overdue aging"
          subtitle="Overdue amount by how long it has been past due"
          loading={loading}
          empty={!aging.some((a) => a.count > 0)}
          legend={[{ key: 'amount', label: 'Overdue amount', format: fmtMoney }]}
          table={<MiniTable columns={[{ key: 'bucket', label: 'Age' }, { key: 'count', label: 'Payments', align: 'right' }, { key: 'amount', label: 'Amount', align: 'right', format: (v) => fmtMoney(Number(v)) }]} rows={aging as unknown as Record<string, unknown>[]} keyField="bucket" />}
        >
          <BarsChart data={aging} xKey="bucket" series={[{ key: 'amount', label: 'Overdue amount', format: fmtMoney }]} yFormat={fmtMoneyShort} colorByIndex onBarClick={() => setDrill({ kind: 'overdue', title: 'Overdue payments' })} />
        </ChartCard>
        <ChartCard
          title="Why payments fail"
          subtitle="Top failure reasons in the period"
          loading={loading}
          empty={!reasons.length}
          legend={[{ key: 'count', label: 'Failed payments' }]}
          table={<MiniTable columns={[{ key: 'reason', label: 'Reason' }, { key: 'count', label: 'Count', align: 'right' }, { key: 'amount', label: 'Amount', align: 'right', format: (v) => fmtMoney(Number(v)) }]} rows={reasons as unknown as Record<string, unknown>[]} keyField="reason" />}
          height={Math.max(220, reasons.length * 34 + 40)}
        >
          <BarsChart data={reasons} xKey="reason" horizontal series={[{ key: 'count', label: 'Failed payments' }]} colorByIndex />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        {/* Delinquent deals */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <div className="text-sm font-semibold text-foreground">Most overdue deals</div>
            <div className="text-xs text-muted-foreground">Ranked by overdue amount · click a row for its payments</div>
          </div>
          {loading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-2/3" /></div>
          ) : !d?.delinquent.length ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nothing overdue. Nice.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Merchant</th>
                    <th className="px-3 py-2">Book</th>
                    <th className="px-3 py-2 text-right">Overdue</th>
                    <th className="px-3 py-2 text-right">Payments</th>
                    <th className="px-3 py-2 text-right">Failed</th>
                    <th className="px-3 py-2 text-right">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {d.delinquent.map((r) => (
                    <tr key={`${r.bookId}:${r.applicationUuid ?? r.dealId}`} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setDrill({ kind: 'overdue', title: `Overdue payments · ${r.merchantName ?? r.dealId ?? ''}`, applicationUuid: r.applicationUuid ?? undefined, bookId: r.bookId })}>
                      <td className="px-3 py-2 text-foreground">{r.merchantName ?? r.applicationNumericId ?? r.dealId ?? 'Unknown'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.bookCode ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{fmtMoney(r.overdueAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtInt(r.overdueCount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtInt(r.failedCount)}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums font-medium', r.daysOverdue > 30 ? 'text-red-600 dark:text-red-400' : r.daysOverdue > 14 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>{r.daysOverdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Health categories */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground">Portfolio recovery</div>
            <div className="mb-3 text-xs text-muted-foreground">Collected versus outstanding across all funded deals</div>
            {d ? <ShareBar parts={[{ key: 'collected', label: 'Collected', value: d.portfolio.collectedToDate, color: SERIES[0] }, { key: 'outstanding', label: 'Outstanding', value: d.portfolio.outstanding, color: MUTED }]} format={fmtMoney} /> : <Skeleton className="h-8 w-full" />}
          </div>
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-2.5">
              <div className="text-sm font-semibold text-foreground">Payment health categories</div>
              <div className="text-xs text-muted-foreground">Operations-set categories on funded deals</div>
            </div>
            {loading ? (
              <div className="space-y-2 p-4"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-2/3" /></div>
            ) : !d?.healthCategories.length ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No categories set on funded deals.</div>
            ) : (
              <MiniTable columns={[{ key: 'category', label: 'Category' }, { key: 'deals', label: 'Deals', align: 'right' }, { key: 'outstanding', label: 'Outstanding', align: 'right', format: (v) => fmtMoney(Number(v)) }]} rows={d.healthCategories as unknown as Record<string, unknown>[]} keyField="category" />
            )}
          </div>
        </div>
      </div>

      {/* By book */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <div className="text-sm font-semibold text-foreground">Collections by book</div>
          <div className="text-xs text-muted-foreground">Expected and collected in the period, failures and overdue balance right now</div>
        </div>
        {loading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-full" /></div>
        ) : !byBook.length ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No data.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Book</th>
                  <th className="px-3 py-2 text-right">Funded deals</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                  <th className="px-3 py-2 text-right">Expected</th>
                  <th className="px-3 py-2 text-right">Collected</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2 text-right">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {byBook.map((b) => (
                  <tr key={b.bookId} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setDrill({ kind: 'overdue', title: `Overdue payments · ${b.name}`, bookId: b.bookId })}>
                    <td className="px-3 py-2 font-medium text-foreground">{b.name} <span className="text-xs text-muted-foreground">{b.code}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(b.fundedDeals)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(b.outstanding)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(b.expected)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{fmtMoney(b.collected)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPct(b.collectionRate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700 dark:text-red-300">{fmtInt(b.failedCount)} <span className="text-xs text-muted-foreground">({fmtMoneyShort(b.failedAmount)})</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-300">{fmtMoney(b.overdueAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
