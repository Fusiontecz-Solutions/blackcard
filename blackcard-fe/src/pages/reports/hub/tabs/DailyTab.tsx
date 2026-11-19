import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BarsChart, ChartCard, Delta, KpiTile, MiniTable, type SeriesDef } from '../charts';
import { fmtInt, fmtMoney } from '../format';
import { getReportErrorMessage, reportApi, type ReportFilters } from '../reportApi';
import DrillDownTable, { type DrillQuery } from '../DrillDownTable';
import { applicationHref } from '../drillDown';
import type { TabProps } from './types';

interface OpenDrill {
  title: string;
  query: DrillQuery;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const UNDERWRITER_SERIES: SeriesDef[] = [{ key: 'count', label: 'Claimed', format: fmtInt }];

function ComparisonLine({ label, current, previous }: { label: string; current: number | null | undefined; previous: number | null | undefined }) {
  return (
    <span className="flex items-center gap-1">
      <span>{label}</span>
      <Delta current={current} previous={previous} />
    </span>
  );
}

export default function DailyTab({ filters }: TabProps) {
  const [sp, setSp] = useSearchParams();
  const date = sp.get('date') || toISODate(new Date());
  const [openDrill, setOpenDrill] = useState<OpenDrill | null>(null);

  const setDate = (next: string) =>
    setSp(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set('date', next);
        return out;
      },
      { replace: true },
    );

  const query = useQuery({
    queryKey: ['reports', 'daily', filters, date],
    queryFn: async () => (await reportApi.daily(filters, date)).data,
    placeholderData: keepPreviousData,
  });

  const report = query.data;
  const today = report?.today;
  const yesterday = report?.yesterday;
  const lastWeek = report?.sameDayLastWeek;
  const loading = query.isLoading;
  const errorMessage = query.isError ? getReportErrorMessage(query.error, 'Could not load the daily report') : null;

  const dayFilters: ReportFilters = { ...filters, preset: 'custom', from: date, to: date };
  const openApplications = (title: string, dq: DrillQuery) => setOpenDrill({ title, query: dq });

  const movements = report?.movements ?? [];
  const logins = report?.logins ?? [];
  const noActivity = !loading && movements.length === 0 && !!today && today.created === 0 && today.approved === 0 && today.funded === 0 && today.declined === 0 && today.contractsSent === 0 && today.contractsSigned === 0 && today.stageMoves === 0;

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="size-4 shrink-0" />
          {errorMessage}
        </div>
      ) : null}

      {/* Date picker row */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
          <ChevronLeft className="size-4" />
        </Button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value || toISODate(new Date()))}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        />
        <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={() => setDate(toISODate(new Date()))}>
          Today
        </Button>
        <span className="ml-1 text-sm text-muted-foreground">{formatDayLabel(date)}</span>
      </div>

      {noActivity ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          No activity recorded for this day. The reporting sync records activity between syncs, so very recent changes may not show up yet.
        </div>
      ) : null}

      {/* Headline row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <KpiTile
          label="Created"
          value={fmtInt(today?.created)}
          sub={
            <span className="flex flex-col gap-0.5">
              <ComparisonLine label="vs yesterday" current={today?.created} previous={yesterday?.created} />
              <ComparisonLine label="vs last wk" current={today?.created} previous={lastWeek?.created} />
            </span>
          }
          loading={loading}
          onClick={() => openApplications('Created today', { dateField: 'createdAtTenant' })}
        />
        <KpiTile
          label="Approved"
          value={fmtInt(today?.approved)}
          sub={
            <span className="flex flex-col gap-0.5">
              <ComparisonLine label="vs yesterday" current={today?.approved} previous={yesterday?.approved} />
              <ComparisonLine label="vs last wk" current={today?.approved} previous={lastWeek?.approved} />
            </span>
          }
          loading={loading}
          onClick={() => openApplications('Approved today', { dateField: 'approvedAt' })}
        />
        <KpiTile
          label="Funded"
          value={fmtInt(today?.funded)}
          sub={
            <span className="flex flex-col gap-0.5">
              <span>{today ? fmtMoney(today.fundedAmount) : '—'}</span>
              <ComparisonLine label="vs yesterday" current={today?.funded} previous={yesterday?.funded} />
              <ComparisonLine label="vs last wk" current={today?.funded} previous={lastWeek?.funded} />
            </span>
          }
          loading={loading}
          onClick={() => openApplications('Funded today', { dateField: 'fundedAt', stage: 'Funded' })}
        />
        <KpiTile
          label="Declined"
          value={fmtInt(today?.declined)}
          sub={
            <span className="flex flex-col gap-0.5">
              <ComparisonLine label="vs yesterday" current={today?.declined} previous={yesterday?.declined} />
              <ComparisonLine label="vs last wk" current={today?.declined} previous={lastWeek?.declined} />
            </span>
          }
          loading={loading}
          onClick={() => openApplications('Declined today', { dateField: 'declinedAt', stage: 'Declined' })}
        />
        <KpiTile
          label="Contracts sent"
          value={fmtInt(today?.contractsSent)}
          sub={
            <span className="flex flex-col gap-0.5">
              <ComparisonLine label="vs yesterday" current={today?.contractsSent} previous={yesterday?.contractsSent} />
              <ComparisonLine label="vs last wk" current={today?.contractsSent} previous={lastWeek?.contractsSent} />
            </span>
          }
          loading={loading}
          onClick={() => openApplications('Contracts sent today', { dateField: 'contractSentAt' })}
        />
        <KpiTile
          label="Contracts signed"
          value={fmtInt(today?.contractsSigned)}
          sub={
            <span className="flex flex-col gap-0.5">
              <ComparisonLine label="vs yesterday" current={today?.contractsSigned} previous={yesterday?.contractsSigned} />
              <ComparisonLine label="vs last wk" current={today?.contractsSigned} previous={lastWeek?.contractsSigned} />
            </span>
          }
          loading={loading}
          onClick={() => openApplications('Contracts signed today', { dateField: 'contractSignedAt' })}
        />
        <KpiTile
          label="Stage moves"
          value={fmtInt(today?.stageMoves)}
          sub={
            <span className="flex flex-col gap-0.5">
              <ComparisonLine label="vs yesterday" current={today?.stageMoves} previous={yesterday?.stageMoves} />
              <ComparisonLine label="vs last wk" current={today?.stageMoves} previous={lastWeek?.stageMoves} />
            </span>
          }
          loading={loading}
        />
      </div>

      {openDrill ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{openDrill.title}</h3>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => setOpenDrill(null)}>
              Close
            </button>
          </div>
          <DrillDownTable filters={dayFilters} query={openDrill.query} />
        </div>
      ) : null}

      {/* Queues */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-4 lg:col-span-2">
          <KpiTile label="Unclaimed" value={fmtInt(report?.queues.unclaimed ?? 0)} loading={loading} accent={(report?.queues.unclaimed ?? 0) > 0 ? 'warning' : undefined} />
          <KpiTile label="Claimed" value={fmtInt(report?.queues.claimed ?? 0)} loading={loading} />
          <KpiTile label="Waiting for docs" value={fmtInt(report?.queues.waitingDocs ?? 0)} loading={loading} accent={(report?.queues.waitingDocs ?? 0) > 0 ? 'warning' : undefined} />
          <KpiTile label="On hold" value={fmtInt(report?.queues.onHold ?? 0)} loading={loading} />
        </div>
        <ChartCard
          title="Claimed by underwriter"
          loading={loading}
          empty={!loading && (report?.queues.byUnderwriter?.length ?? 0) === 0}
          height={Math.max(160, (report?.queues.byUnderwriter?.length ?? 0) * 34)}
          table={
            <MiniTable
              columns={[
                { key: 'name', label: 'Underwriter' },
                { key: 'count', label: 'Claimed', align: 'right', format: (v) => fmtInt(v as number) },
              ]}
              rows={(report?.queues.byUnderwriter ?? []) as unknown as Record<string, unknown>[]}
              keyField="name"
            />
          }
        >
          <BarsChart data={report?.queues.byUnderwriter ?? []} xKey="name" series={UNDERWRITER_SERIES} horizontal />
        </ChartCard>
      </div>

      {/* Movements */}
      <section className="rounded-xl border border-border bg-card">
        <header className="px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Movements today</h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border bg-muted/40 text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left font-medium">Time</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Book</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">App #</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Merchant</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">From → To</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Agent</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Underwriter</th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {movements.map((m, i) => (
                <tr key={`${m.applicationUuid}-${i}`} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-foreground">{formatTime(m.at)}</td>
                  <td className="px-3 py-2 text-foreground">{m.bookCode ?? '—'}</td>
                  <td className="px-3 py-2 text-foreground">{m.applicationNumericId ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Link to={applicationHref(m)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      {m.merchantName ?? '—'} <ExternalLink className="size-3" />
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {m.from ?? '—'} → {m.to ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtMoney(m.amount)}</td>
                  <td className="px-3 py-2 text-foreground">{m.agentName ?? '—'}</td>
                  <td className="px-3 py-2 text-foreground">{m.underwriterName ?? '—'}</td>
                  <td />
                </tr>
              ))}
              {!loading && movements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No stage changes recorded for this day.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Logins */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Team logins</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : logins.length === 0 ? (
          <p className="text-sm text-muted-foreground">No logins recorded for this day.</p>
        ) : (
          <ul className={cn('grid grid-cols-1 gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3')}>
            {logins.map((l, i) => (
              <li key={`${l.email ?? 'unknown'}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1">
                <span className="truncate text-foreground">{l.email ?? 'Unknown'}</span>
                <span className="tabular-nums text-muted-foreground">{fmtInt(l.count)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
