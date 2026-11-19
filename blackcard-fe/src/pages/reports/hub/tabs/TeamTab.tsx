import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { getReportErrorMessage, reportApi, type TeamReport } from '../reportApi';
import { BarsChart, ChartCard, MiniTable, ShareBar } from '../charts';
import { fmtInt, fmtMoney, fmtPct } from '../format';
import type { TabProps } from './types';

type AgentRow = TeamReport['agents'][number];
type UnderwriterRow = TeamReport['underwriters'][number];

interface Column<T> {
  key: string;
  label: string;
  align: 'left' | 'right';
  better: 'high' | 'low' | 'none';
  sortValue: ((r: T) => number | null) | null;
  cell: (r: T) => ReactNode;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="size-3 text-muted-foreground/40" aria-hidden />;
  return dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />;
}

function sortGeneric<T>(rows: T[], columns: Column<T>[], key: string, dir: 'asc' | 'desc'): T[] {
  const col = columns.find((c) => c.key === key);
  if (!col || !col.sortValue) return rows;
  const getter = col.sortValue;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sign * (av - bv);
  });
}

function computeBest<T>(rows: T[], columns: Column<T>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const col of columns) {
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

interface SortableTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  loading?: boolean;
  rowKey: (r: T) => string;
  emptyLabel: string;
}

function SortableTable<T>({ rows, columns, sortKey, sortDir, onSort, loading, rowKey, emptyLabel }: SortableTableProps<T>) {
  const sorted = useMemo(() => sortGeneric(rows, columns, sortKey, sortDir), [rows, columns, sortKey, sortDir]);
  const best = useMemo(() => computeBest(rows, columns), [rows, columns]);
  return (
    <div className="overflow-x-auto p-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            {columns.map((col) => (
              <th key={col.key} scope="col" className={cn('px-2 py-2 font-medium', col.align === 'right' ? 'text-right' : 'text-left')}>
                {col.sortValue ? (
                  <button type="button" onClick={() => onSort(col.key)} className={cn('inline-flex items-center gap-1 hover:text-foreground', col.align === 'right' && 'flex-row-reverse')}>
                    {col.label}
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border/60">
                  {columns.map((c) => (
                    <td key={c.key} className="px-2 py-2">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.map((r) => (
                <tr key={rowKey(r)} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  {columns.map((col) => {
                    const isBest = col.sortValue !== null && best[col.key] !== undefined && col.sortValue(r) === best[col.key];
                    return (
                      <td key={col.key} className={cn('px-2 py-2 text-foreground', col.align === 'right' && 'text-right tabular-nums', isBest && 'font-bold')}>
                        {col.cell(r)}
                      </td>
                    );
                  })}
                </tr>
              ))}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-2 py-8 text-center text-muted-foreground">
                {emptyLabel}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function bucketScrubbing(rows: TeamReport['scrubbing']): { key: string; label: string; value: number }[] {
  let approve = 0;
  let decline = 0;
  let other = 0;
  for (const r of rows) {
    const rec = (r.recommendation ?? '').toLowerCase();
    if (rec.includes('approv')) approve += r.count;
    else if (rec.includes('declin')) decline += r.count;
    else other += r.count;
  }
  return [
    { key: 'approve', label: 'Recommend approval', value: approve },
    { key: 'decline', label: 'Recommend decline', value: decline },
    { key: 'other', label: 'Other', value: other },
  ];
}

export default function TeamTab({ filters, onFilters }: TabProps) {
  const q = useQuery({
    queryKey: ['reports', 'team', filters],
    queryFn: async () => (await reportApi.team(filters)).data,
    placeholderData: keepPreviousData,
  });

  const agents = useMemo(() => q.data?.agents ?? [], [q.data]);
  const underwriters = useMemo(() => q.data?.underwriters ?? [], [q.data]);
  const scrubbing = useMemo(() => q.data?.scrubbing ?? [], [q.data]);

  const [agentSortKey, setAgentSortKey] = useState('fundedAmount');
  const [agentSortDir, setAgentSortDir] = useState<'asc' | 'desc'>('desc');
  const [uwSortKey, setUwSortKey] = useState('fundedAmount');
  const [uwSortDir, setUwSortDir] = useState<'asc' | 'desc'>('desc');

  const topAgentRank = useMemo(() => {
    const sorted = [...agents].sort((a, b) => b.fundedAmount - a.fundedAmount);
    return new Map(sorted.slice(0, 3).map((a, i) => [a.id ?? a.name, i + 1]));
  }, [agents]);

  const agentColumns: Column<AgentRow>[] = useMemo(
    () => [
      {
        key: 'name',
        label: 'Agent',
        align: 'left',
        better: 'none',
        sortValue: null,
        cell: (r) => {
          const rank = topAgentRank.get(r.id ?? r.name);
          return (
            <span className="inline-flex items-center gap-1.5">
              {rank ? (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  #{rank}
                </Badge>
              ) : null}
              {r.id ? (
                <button type="button" className="font-medium text-foreground hover:underline" onClick={() => onFilters({ agentId: r.id ?? undefined })}>
                  {r.name}
                </button>
              ) : (
                <span className="font-medium text-foreground">{r.name}</span>
              )}
            </span>
          );
        },
      },
      { key: 'submitted', label: 'Submitted', align: 'right', better: 'high', sortValue: (r) => r.submitted, cell: (r) => fmtInt(r.submitted) },
      { key: 'requestedAmount', label: 'Requested amount', align: 'right', better: 'high', sortValue: (r) => r.requestedAmount, cell: (r) => fmtMoney(r.requestedAmount) },
      { key: 'approved', label: 'Approved', align: 'right', better: 'high', sortValue: (r) => r.approved, cell: (r) => fmtInt(r.approved) },
      { key: 'approvalRate', label: 'Approval rate', align: 'right', better: 'high', sortValue: (r) => r.approvalRate, cell: (r) => fmtPct(r.approvalRate) },
      { key: 'funded', label: 'Funded', align: 'right', better: 'high', sortValue: (r) => r.funded, cell: (r) => fmtInt(r.funded) },
      { key: 'fundingRate', label: 'Funding rate', align: 'right', better: 'high', sortValue: (r) => r.fundingRate, cell: (r) => fmtPct(r.fundingRate) },
      { key: 'fundedAmount', label: 'Funded amount', align: 'right', better: 'high', sortValue: (r) => r.fundedAmount, cell: (r) => fmtMoney(r.fundedAmount) },
      { key: 'commission', label: 'Commission', align: 'right', better: 'high', sortValue: (r) => r.commission, cell: (r) => fmtMoney(r.commission) },
    ],
    [topAgentRank, onFilters],
  );

  const underwriterColumns: Column<UnderwriterRow>[] = useMemo(
    () => [
      {
        key: 'name',
        label: 'Underwriter',
        align: 'left',
        better: 'none',
        sortValue: null,
        cell: (r) =>
          r.id ? (
            <button type="button" className="font-medium text-foreground hover:underline" onClick={() => onFilters({ underwriterId: r.id ?? undefined })}>
              {r.name}
            </button>
          ) : (
            <span className="font-medium text-foreground">{r.name}</span>
          ),
      },
      { key: 'decisions', label: 'Decisions', align: 'right', better: 'high', sortValue: (r) => r.decisions, cell: (r) => fmtInt(r.decisions) },
      { key: 'approved', label: 'Approved', align: 'right', better: 'high', sortValue: (r) => r.approved, cell: (r) => fmtInt(r.approved) },
      { key: 'declined', label: 'Declined', align: 'right', better: 'low', sortValue: (r) => r.declined, cell: (r) => fmtInt(r.declined) },
      { key: 'approvalRate', label: 'Approval rate', align: 'right', better: 'high', sortValue: (r) => r.approvalRate, cell: (r) => fmtPct(r.approvalRate) },
      { key: 'approvedAmount', label: 'Approved amount', align: 'right', better: 'high', sortValue: (r) => r.approvedAmount, cell: (r) => fmtMoney(r.approvedAmount) },
      { key: 'funded', label: 'Funded', align: 'right', better: 'high', sortValue: (r) => r.funded, cell: (r) => fmtInt(r.funded) },
      { key: 'fundedAmount', label: 'Funded amount', align: 'right', better: 'high', sortValue: (r) => r.fundedAmount, cell: (r) => fmtMoney(r.fundedAmount) },
    ],
    [onFilters],
  );

  const agentBarData = useMemo(() => [...agents].sort((a, b) => b.submitted - a.submitted).slice(0, 10), [agents]);
  const uwBarData = useMemo(() => [...underwriters].sort((a, b) => b.decisions - a.decisions).slice(0, 10), [underwriters]);
  const scrubbingParts = useMemo(() => bucketScrubbing(scrubbing), [scrubbing]);

  const filteredAgentName = filters.agentId ? agents.find((a) => a.id === filters.agentId)?.name ?? filters.agentId : null;
  const filteredUwName = filters.underwriterId ? underwriters.find((u) => u.id === filters.underwriterId)?.name ?? filters.underwriterId : null;

  if (q.isError) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{getReportErrorMessage(q.error, 'Could not load team report')}</div>;
  }

  return (
    <div className="space-y-4">
      {(filteredAgentName || filteredUwName) && (
        <div className="flex flex-wrap gap-2">
          {filteredAgentName ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-foreground">
              Filtered to agent: {filteredAgentName}
              <button type="button" onClick={() => onFilters({ agentId: undefined })} className="text-muted-foreground hover:text-foreground" aria-label="Clear agent filter">
                <X className="size-3.5" />
              </button>
            </span>
          ) : null}
          {filteredUwName ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-foreground">
              Filtered to underwriter: {filteredUwName}
              <button type="button" onClick={() => onFilters({ underwriterId: undefined })} className="text-muted-foreground hover:text-foreground" aria-label="Clear underwriter filter">
                <X className="size-3.5" />
              </button>
            </span>
          ) : null}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card">
        <header className="px-4 pt-4">
          <h3 className="text-sm font-semibold text-foreground">Agents</h3>
          <p className="text-xs text-muted-foreground">Click a header to sort · click a name to filter every report to that agent.</p>
        </header>
        <SortableTable
          rows={agents}
          columns={agentColumns}
          sortKey={agentSortKey}
          sortDir={agentSortDir}
          onSort={(key) => {
            if (key === agentSortKey) setAgentSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
            else {
              setAgentSortKey(key);
              setAgentSortDir('desc');
            }
          }}
          loading={q.isLoading}
          rowKey={(r) => r.id ?? r.name}
          emptyLabel="No agent activity for this period"
        />
      </section>

      <ChartCard
        title="Submitted vs funded by agent"
        subtitle="Top 10 by submitted volume"
        legend={[
          { key: 'submitted', label: 'Submitted' },
          { key: 'funded', label: 'Funded' },
        ]}
        loading={q.isLoading}
        empty={!q.isLoading && agentBarData.length === 0}
        table={
          <MiniTable
            columns={[
              { key: 'name', label: 'Agent' },
              { key: 'submitted', label: 'Submitted', align: 'right', format: (v) => fmtInt(Number(v ?? 0)) },
              { key: 'funded', label: 'Funded', align: 'right', format: (v) => fmtInt(Number(v ?? 0)) },
            ]}
            rows={agentBarData}
            keyField="name"
          />
        }
        height={Math.max(220, agentBarData.length * 34)}
      >
        <BarsChart
          data={agentBarData}
          xKey="name"
          horizontal
          yFormat={fmtInt}
          series={[
            { key: 'submitted', label: 'Submitted' },
            { key: 'funded', label: 'Funded' },
          ]}
        />
      </ChartCard>

      <section className="rounded-xl border border-border bg-card">
        <header className="px-4 pt-4">
          <h3 className="text-sm font-semibold text-foreground">Underwriters</h3>
          <p className="text-xs text-muted-foreground">Click a header to sort · click a name to filter every report to that underwriter.</p>
        </header>
        <SortableTable
          rows={underwriters}
          columns={underwriterColumns}
          sortKey={uwSortKey}
          sortDir={uwSortDir}
          onSort={(key) => {
            if (key === uwSortKey) setUwSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
            else {
              setUwSortKey(key);
              setUwSortDir('desc');
            }
          }}
          loading={q.isLoading}
          rowKey={(r) => r.id ?? r.name}
          emptyLabel="No underwriter activity for this period"
        />
      </section>

      <ChartCard
        title="Decisions by underwriter"
        subtitle="Top 10 by decision volume"
        legend={[
          { key: 'approved', label: 'Approved' },
          { key: 'declined', label: 'Declined' },
        ]}
        loading={q.isLoading}
        empty={!q.isLoading && uwBarData.length === 0}
        table={
          <MiniTable
            columns={[
              { key: 'name', label: 'Underwriter' },
              { key: 'approved', label: 'Approved', align: 'right', format: (v) => fmtInt(Number(v ?? 0)) },
              { key: 'declined', label: 'Declined', align: 'right', format: (v) => fmtInt(Number(v ?? 0)) },
            ]}
            rows={uwBarData}
            keyField="name"
          />
        }
        height={Math.max(220, uwBarData.length * 34)}
      >
        <BarsChart
          data={uwBarData}
          xKey="name"
          horizontal
          stacked
          yFormat={fmtInt}
          series={[
            { key: 'approved', label: 'Approved' },
            { key: 'declined', label: 'Declined' },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="Scrubbing recommendations"
        loading={q.isLoading}
        empty={!q.isLoading && scrubbingParts.every((p) => p.value === 0)}
        table={<MiniTable columns={[{ key: 'label', label: 'Recommendation' }, { key: 'value', label: 'Count', align: 'right', format: (v) => fmtInt(Number(v ?? 0)) }]} rows={scrubbingParts} keyField="key" />}
      >
        <div className="flex h-full items-center px-2">
          <ShareBar parts={scrubbingParts} format={fmtInt} />
        </div>
      </ChartCard>
    </div>
  );
}
