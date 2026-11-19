import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { BarsChart, ChartCard, KpiTile, MiniTable, ShareBar, type SeriesDef } from '../charts';
import { fmtDays, fmtInt, fmtMoney, SERIES } from '../format';
import { applicationHref } from '../drillDown';
import { DrillDownTable } from '../DrillDownTable';
import { getReportErrorMessage, reportApi, type CaseStageRow, type StuckCase } from '../reportApi';
import type { TabProps } from './types';

const AGING_BUCKETS = ['0-3', '4-7', '8-14', '15-30', '31+'] as const;

const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—');
const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Unknown');

function daysToneClass(days: number, slaDays: number) {
  if (days >= slaDays * 2) return 'text-red-600 dark:text-red-400 font-semibold';
  if (days >= slaDays) return 'text-amber-600 dark:text-amber-400 font-medium';
  return 'text-foreground';
}

export default function CasesTab({ filters }: TabProps) {
  const [slaText, setSlaText] = useState('');
  const [slaOverride, setSlaOverride] = useState<number | undefined>(undefined);
  const userEditedSla = useRef(false);
  const [selectedStage, setSelectedStage] = useState<{ stage: string; label: string } | null>(null);
  const [showAllStuck, setShowAllStuck] = useState(false);

  const q = useQuery({
    queryKey: ['reports', 'cases', filters, slaOverride],
    queryFn: async () => (await reportApi.cases(filters, slaOverride)).data,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!userEditedSla.current && q.data?.slaDays !== undefined) setSlaText(String(q.data.slaDays));
  }, [q.data?.slaDays]);

  useEffect(() => {
    if (!userEditedSla.current) return;
    const t = setTimeout(() => {
      const n = Number(slaText);
      if (slaText.trim() !== '' && Number.isFinite(n) && n > 0) setSlaOverride(Math.round(n));
    }, 500);
    return () => clearTimeout(t);
  }, [slaText]);

  const data = q.data;
  const byStage = useMemo(() => data?.byStage ?? [], [data]);
  const stuck = useMemo(() => data?.stuck ?? [], [data]);
  const velocity = useMemo(() => data?.velocity ?? [], [data]);
  const effectiveSla = data?.slaDays ?? 7;

  const openCases = byStage.reduce((a, s) => a + s.count, 0);
  const overSla = byStage.reduce((a, s) => a + s.overSla, 0);
  const declinedInPeriod = (data?.declines.byActor ?? []).reduce((a, d) => a + d.count, 0);

  const sortedStuck = useMemo(() => [...stuck].sort((a, b) => b.daysInStage - a.daysInStage), [stuck]);
  const visibleStuck = showAllStuck ? sortedStuck : sortedStuck.slice(0, 50);

  const agingSeries: SeriesDef[] = AGING_BUCKETS.map((b, i) => ({ key: b, label: `${b} days`, color: SERIES[i] }));
  const agingRows = byStage.map((s) => ({ label: s.label, stage: s.stage, ...Object.fromEntries(AGING_BUCKETS.map((b) => [b, s.aging[b] ?? 0])) }));

  const pipelineHeight = Math.max(220, byStage.length * 34 + 40);
  const velocityHeight = Math.max(200, velocity.length * 34 + 40);

  const declineActorParts = (data?.declines.byActor ?? []).map((a, i) => ({ key: a.actor, label: titleCase(a.actor), value: a.count, color: SERIES[i] }));
  const declineReasons = data?.declines.reasons ?? [];

  return (
    <div className="space-y-4">
      {q.isError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">{getReportErrorMessage(q.error, 'Could not load cases report')}</div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <label htmlFor="cases-sla-days" className="text-xs font-medium text-muted-foreground">
          SLA days
        </label>
        <Input
          id="cases-sla-days"
          type="number"
          min={1}
          className="h-9 w-20"
          value={slaText}
          onChange={(e) => {
            userEditedSla.current = true;
            setSlaText(e.target.value);
          }}
        />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Open cases" value={fmtInt(openCases)} loading={q.isLoading} />
        <KpiTile label="Over SLA" value={fmtInt(overSla)} accent={overSla > 0 ? 'critical' : 'neutral'} loading={q.isLoading} />
        <KpiTile
          label="Avg cycle time"
          value={fmtDays(data?.cycle.avgDays)}
          sub={data ? `Median ${fmtDays(data.cycle.medianDays)} · ${fmtInt(data.cycle.samples)} samples` : undefined}
          loading={q.isLoading}
        />
        <KpiTile label="Declined in period" value={fmtInt(declinedInPeriod)} loading={q.isLoading} />
      </div>

      {/* Pipeline funnel */}
      <ChartCard
        title="Pipeline funnel"
        subtitle="Open cases by stage"
        loading={q.isLoading}
        empty={!q.isLoading && byStage.length === 0}
        height={pipelineHeight}
        table={
          <MiniTable
            keyField="stage"
            columns={[
              { key: 'label', label: 'Stage' },
              { key: 'count', label: 'Count', align: 'right', format: (v) => fmtInt(v as number) },
              { key: 'amount', label: 'Amount', align: 'right', format: (v) => fmtMoney(v as number) },
              { key: 'avgDaysInStage', label: 'Avg days in stage', align: 'right', format: (v) => fmtDays(v as number | null) },
              { key: 'overSla', label: 'Over SLA', align: 'right', format: (v) => fmtInt(v as number) },
            ]}
            rows={byStage as unknown as Record<string, unknown>[]}
          />
        }
      >
        <BarsChart<CaseStageRow>
          data={byStage}
          xKey="label"
          series={[{ key: 'count', label: 'Cases' }]}
          horizontal
          colorByIndex
          onBarClick={(row) => setSelectedStage({ stage: row.stage, label: row.label })}
        />
      </ChartCard>

      {selectedStage ? (
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Stage: {selectedStage.label}</h3>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setSelectedStage(null)}>
              <X className="size-3.5" /> Close
            </Button>
          </header>
          <DrillDownTable filters={filters} query={{ dateField: 'none', stage: selectedStage.stage }} className="rounded-none border-0 border-t" />
        </section>
      ) : null}

      {/* Aging by stage */}
      <ChartCard
        title="Aging by stage"
        subtitle="Days since the case entered its current stage"
        loading={q.isLoading}
        empty={!q.isLoading && byStage.length === 0}
        height={pipelineHeight}
        legend={agingSeries}
        table={
          <MiniTable
            keyField="stage"
            columns={[{ key: 'label', label: 'Stage' }, ...AGING_BUCKETS.map((b) => ({ key: b, label: `${b} days`, align: 'right' as const, format: (v: unknown) => fmtInt(v as number) }))]}
            rows={agingRows}
          />
        }
      >
        <BarsChart data={agingRows} xKey="label" series={agingSeries} horizontal stacked />
      </ChartCard>

      {/* Stage velocity */}
      <ChartCard
        title="Stage velocity"
        subtitle="Avg days per stage, measured from stage transitions seen by the sync"
        loading={q.isLoading}
        empty={!q.isLoading && velocity.length === 0}
        height={velocityHeight}
        table={
          <MiniTable
            keyField="stage"
            columns={[
              { key: 'label', label: 'Stage' },
              { key: 'avgDays', label: 'Avg days', align: 'right', format: (v) => fmtDays(v as number | null) },
              { key: 'medianDays', label: 'Median days', align: 'right', format: (v) => fmtDays(v as number | null) },
              { key: 'samples', label: 'Samples', align: 'right', format: (v) => fmtInt(v as number) },
            ]}
            rows={velocity}
          />
        }
      >
        <BarsChart data={velocity} xKey="label" series={[{ key: 'avgDays', label: 'Avg days', format: fmtDays }]} horizontal yFormat={fmtDays} />
      </ChartCard>

      {/* Stuck cases */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Stuck cases</h3>
            <p className="text-xs text-muted-foreground">Sorted by days in current stage, longest first. Amber at {fmtInt(effectiveSla)}d, red at {fmtInt(effectiveSla * 2)}d.</p>
          </div>
          {sortedStuck.length > 50 ? (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowAllStuck((v) => !v)}>
              {showAllStuck ? 'Show top 50' : `Show all (${sortedStuck.length})`}
            </Button>
          ) : null}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border bg-muted/40 text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left font-medium">Book</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">App #</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Merchant</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Stage</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Days in stage</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Agent</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Underwriter</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Entered at</th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibleStuck.map((r: StuckCase) => (
                <tr key={`${r.bookId}-${r.applicationUuid}`} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-foreground">{r.bookCode ?? '—'}</td>
                  <td className="px-3 py-2 text-foreground">{r.applicationNumericId ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Link to={applicationHref(r)} className="font-medium text-foreground hover:underline">
                      {r.merchantName ?? '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-foreground">{r.stageLabel}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', daysToneClass(r.daysInStage, effectiveSla))}>{fmtDays(r.daysInStage)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtMoney(r.amount)}</td>
                  <td className="px-3 py-2 text-foreground">{r.agentName ?? '—'}</td>
                  <td className="px-3 py-2 text-foreground">{r.underwriterName ?? '—'}</td>
                  <td className="px-3 py-2 text-foreground">{fmtDate(r.enteredAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link to={applicationHref(r)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" title="Open application">
                      Open <ExternalLink className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {!q.isLoading && visibleStuck.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No stuck cases for these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Declines */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Declines by actor"
          subtitle="Who declined the case"
          height={140}
          loading={q.isLoading}
          empty={!q.isLoading && declineActorParts.every((p) => p.value === 0)}
          table={
            <MiniTable
              columns={[
                { key: 'label', label: 'Actor' },
                { key: 'value', label: 'Count', align: 'right', format: (v) => fmtInt(v as number) },
              ]}
              rows={declineActorParts}
            />
          }
        >
          <div className="flex h-full items-center px-2">
            <ShareBar parts={declineActorParts} />
          </div>
        </ChartCard>
        <ChartCard
          title="Top decline reasons"
          loading={q.isLoading}
          empty={!q.isLoading && declineReasons.length === 0}
          height={220}
          table={
            <MiniTable
              columns={[
                { key: 'reason', label: 'Reason' },
                { key: 'count', label: 'Count', align: 'right', format: (v) => fmtInt(v as number) },
              ]}
              rows={declineReasons}
            />
          }
        >
          <BarsChart data={declineReasons.slice(0, 10)} xKey="reason" series={[{ key: 'count', label: 'Declines' }]} horizontal />
        </ChartCard>
      </div>
    </div>
  );
}
