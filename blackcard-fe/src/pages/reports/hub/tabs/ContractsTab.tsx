import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BarsChart, ChartCard, KpiTile, MiniTable } from '../charts';
import { fmtDays, fmtInt, fmtMoney, fmtPct } from '../format';
import { applicationHref } from '../drillDown';
import { DrillDownTable } from '../DrillDownTable';
import { getReportErrorMessage, reportApi, type StageBucket } from '../reportApi';
import type { TabProps } from './types';

const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—');

function daysOutToneClass(days: number) {
  if (days >= 14) return 'text-red-600 dark:text-red-400 font-semibold';
  if (days >= 7) return 'text-amber-600 dark:text-amber-400 font-medium';
  return 'text-foreground';
}

type Drill = { title: string; query: { dateField?: 'contractSentAt' | 'contractSignedAt' | 'none'; stage?: string }; columns?: string[] } | null;

export default function ContractsTab({ filters }: TabProps) {
  const [drill, setDrill] = useState<Drill>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const q = useQuery({
    queryKey: ['reports', 'contracts', filters],
    queryFn: async () => (await reportApi.contracts(filters)).data,
    placeholderData: keepPreviousData,
  });

  const data = q.data;
  const byStage = useMemo(() => data?.byStage ?? [], [data]);
  const unsigned = useMemo(() => data?.unsigned ?? [], [data]);

  const sortedUnsigned = useMemo(() => {
    const rows = [...unsigned];
    rows.sort((a, b) => (sortDir === 'desc' ? b.daysOut - a.daysOut : a.daysOut - b.daysOut));
    return rows;
  }, [unsigned, sortDir]);

  const drillColumns = ['book', 'application', 'merchant', 'agent', 'approved', 'sentAt', 'signedAt'];
  const stageHeight = Math.max(200, byStage.length * 34 + 40);

  return (
    <div className="space-y-4">
      {q.isError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">{getReportErrorMessage(q.error, 'Could not load contracts report')}</div>
      ) : null}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Contracts sent"
          value={fmtInt(data?.sentInRange)}
          loading={q.isLoading}
          onClick={() => setDrill({ title: 'Contracts sent', query: { dateField: 'contractSentAt' }, columns: drillColumns })}
        />
        <KpiTile
          label="Signed"
          value={fmtInt(data?.signedInRange)}
          loading={q.isLoading}
          onClick={() => setDrill({ title: 'Contracts signed', query: { dateField: 'contractSignedAt' }, columns: drillColumns })}
        />
        <KpiTile label="Sign rate" value={fmtPct(data?.signRate)} loading={q.isLoading} />
        <KpiTile label="Needs re-initiation" value={fmtInt(data?.needsReinitiation)} accent={(data?.needsReinitiation ?? 0) > 0 ? 'warning' : 'neutral'} loading={q.isLoading} />
        <KpiTile label="Approval → sent" value={fmtDays(data?.turnaround.approvalToSentAvgDays)} sub="avg days" loading={q.isLoading} />
        <KpiTile
          label="Sent → signed"
          value={fmtDays(data?.turnaround.sentToSignedAvgDays)}
          sub={data ? `Median ${fmtDays(data.turnaround.sentToSignedMedianDays)}` : undefined}
          loading={q.isLoading}
        />
      </div>

      {/* Contracts by stage */}
      <ChartCard
        title="Contracts by stage"
        loading={q.isLoading}
        empty={!q.isLoading && byStage.length === 0}
        height={stageHeight}
        table={
          <MiniTable
            keyField="stage"
            columns={[
              { key: 'label', label: 'Stage' },
              { key: 'count', label: 'Count', align: 'right', format: (v) => fmtInt(v as number) },
              { key: 'amount', label: 'Amount', align: 'right', format: (v) => fmtMoney(v as number) },
            ]}
            rows={byStage as unknown as Record<string, unknown>[]}
          />
        }
      >
        <BarsChart<StageBucket>
          data={byStage}
          xKey="label"
          series={[{ key: 'count', label: 'Contracts' }]}
          horizontal
          colorByIndex
          onBarClick={(row) => setDrill({ title: `Stage: ${row.label}`, query: { dateField: 'none', stage: row.stage } })}
        />
      </ChartCard>

      {drill ? (
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">{drill.title}</h3>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setDrill(null)}>
              <X className="size-3.5" /> Close
            </Button>
          </header>
          <DrillDownTable filters={filters} query={drill.query} columns={drill.columns} className="rounded-none border-0 border-t" />
        </section>
      ) : null}

      {/* Turnaround */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Turnaround</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiTile label="Approval → sent" value={fmtDays(data?.turnaround.approvalToSentAvgDays)} sub="avg" loading={q.isLoading} />
          <KpiTile label="Sent → signed (avg)" value={fmtDays(data?.turnaround.sentToSignedAvgDays)} loading={q.isLoading} />
          <KpiTile label="Sent → signed (median)" value={fmtDays(data?.turnaround.sentToSignedMedianDays)} loading={q.isLoading} />
        </div>
      </section>

      {/* Unsigned contracts */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Unsigned contracts</h3>
            <p className="text-xs text-muted-foreground">Amber at 7 days out, red at 14 days out.</p>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border bg-muted/40 text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left font-medium">Book</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">App #</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Merchant</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Agent</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Sent at</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}>
                    Days out {sortDir === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
                  </button>
                </th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sortedUnsigned.map((r) => (
                <tr key={`${r.bookId}-${r.applicationUuid}`} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-foreground">{r.bookCode ?? '—'}</td>
                  <td className="px-3 py-2 text-foreground">{r.applicationNumericId ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Link to={applicationHref(r)} className="font-medium text-foreground hover:underline">
                      {r.merchantName ?? '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtMoney(r.amount)}</td>
                  <td className="px-3 py-2 text-foreground">{r.agentName ?? '—'}</td>
                  <td className="px-3 py-2 text-foreground">{fmtDate(r.contractSentAt)}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', daysOutToneClass(r.daysOut))}>{fmtDays(r.daysOut)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link to={applicationHref(r)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" title="Open application">
                      Open <ExternalLink className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {!q.isLoading && sortedUnsigned.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No unsigned contracts for these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
