import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getReportErrorMessage, reportApi, type StageBucket } from '../reportApi';
import { BarsChart, ChartCard, KpiTile, MiniTable, ShareBar, TrendChart } from '../charts';
import { fmtBucket, fmtDays, fmtInt, fmtMoney, fmtMoneyShort, fmtPct } from '../format';
import DrillDownTable from '../DrillDownTable';
import type { TabProps } from './types';

interface AmountDatum {
  key: string;
  label: string;
  value: number;
  [k: string]: unknown;
}

function foldTop6(items: AmountDatum[]): AmountDatum[] {
  if (items.length <= 6) return items;
  const top = items.slice(0, 6);
  const rest = items.slice(6);
  return [...top, { key: 'other', label: 'Other', value: rest.reduce((a, b) => a + b.value, 0) }];
}

export default function FundingTab({ filters }: TabProps) {
  const q = useQuery({
    queryKey: ['reports', 'funding', filters],
    queryFn: async () => (await reportApi.funding(filters)).data,
    placeholderData: keepPreviousData,
  });

  const data = q.data;
  const [fundedDrillOpen, setFundedDrillOpen] = useState(false);
  const [queueDrill, setQueueDrill] = useState<{ stage: string; label: string } | null>(null);

  const bookParts = useMemo(() => {
    const sorted = [...(data?.byBook ?? [])].sort((a, b) => b.amount - a.amount);
    return foldTop6(sorted.map((b) => ({ key: b.bookId, label: b.code, value: b.amount })));
  }, [data]);

  const topAgents = useMemo(() => [...(data?.byAgent ?? [])].sort((a, b) => b.amount - a.amount).slice(0, 8), [data]);
  const topUnderwriters = useMemo(() => [...(data?.byUnderwriter ?? [])].sort((a, b) => b.amount - a.amount).slice(0, 8), [data]);

  if (q.isError) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{getReportErrorMessage(q.error, 'Could not load funding report')}</div>;
  }

  const totals = data?.totals;
  const portfolio = data?.portfolio;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Funded deals" value={fmtInt(totals?.funded)} loading={q.isLoading} onClick={() => setFundedDrillOpen((v) => !v)} />
        <KpiTile label="Funded amount" value={fmtMoney(totals?.fundedAmount)} loading={q.isLoading} />
        <KpiTile label="Avg deal" value={fmtMoney(totals?.avgDeal)} loading={q.isLoading} />
        <KpiTile label="Commission" value={fmtMoney(totals?.commissionAmount)} loading={q.isLoading} />
        <KpiTile label="Renewal share" value={fmtPct(totals?.renewalShare)} loading={q.isLoading} />
        <KpiTile label="Signed → funded" value={fmtDays(totals?.signedToFundedAvgDays)} sub="avg days" loading={q.isLoading} />
      </div>
      {fundedDrillOpen ? (
        <section className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">Funded deals</h4>
            <button type="button" onClick={() => setFundedDrillOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close drill-down">
              <X className="size-4" />
            </button>
          </div>
          <DrillDownTable filters={filters} query={{ dateField: 'fundedAt', stage: 'Funded' }} title="Funded deals" />
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Funding queue</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(data?.queue ?? []).map((item: StageBucket) => (
            <button
              key={item.stage}
              type="button"
              onClick={() => setQueueDrill((d) => (d && d.stage === item.stage ? null : { stage: item.stage, label: item.label }))}
              className={cn(
                'flex flex-col gap-1 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50',
                queueDrill?.stage === item.stage && 'bg-muted/50 ring-1 ring-ring',
              )}
            >
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</span>
              <span className="text-xl font-semibold tabular-nums text-foreground">{fmtInt(item.count)}</span>
              <span className="text-xs text-muted-foreground">{fmtMoney(item.amount)}</span>
            </button>
          ))}
          {q.isLoading
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)
            : null}
          {!q.isLoading && (data?.queue ?? []).length === 0 ? <p className="col-span-3 py-4 text-center text-sm text-muted-foreground">No items in queue</p> : null}
        </div>
        {queueDrill ? (
          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">{queueDrill.label}</h4>
              <button type="button" onClick={() => setQueueDrill(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close drill-down">
                <X className="size-4" />
              </button>
            </div>
            <DrillDownTable filters={filters} query={{ dateField: 'none', stage: queueDrill.stage }} title={queueDrill.label} />
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Funded deals over time"
          loading={q.isLoading}
          empty={!q.isLoading && (data?.trend ?? []).length === 0}
          table={<MiniTable columns={[{ key: 'bucket', label: 'Period', format: (v) => fmtBucket(String(v)) }, { key: 'funded', label: 'Funded', align: 'right', format: (v) => fmtInt(Number(v ?? 0)) }]} rows={data?.trend ?? []} />}
        >
          <BarsChart data={data?.trend ?? []} xKey="bucket" xFormat={fmtBucket} yFormat={fmtInt} series={[{ key: 'funded', label: 'Funded deals', format: fmtInt }]} />
        </ChartCard>
        <ChartCard
          title="Funded amount over time"
          loading={q.isLoading}
          empty={!q.isLoading && (data?.trend ?? []).length === 0}
          table={<MiniTable columns={[{ key: 'bucket', label: 'Period', format: (v) => fmtBucket(String(v)) }, { key: 'fundedAmount', label: 'Funded amount', align: 'right', format: (v) => fmtMoney(Number(v ?? 0)) }]} rows={data?.trend ?? []} />}
        >
          <TrendChart data={data?.trend ?? []} xKey="bucket" area yFormat={fmtMoneyShort} series={[{ key: 'fundedAmount', label: 'Funded amount', format: fmtMoney }]} />
        </ChartCard>
      </div>

      <ChartCard
        title="Funded amount by book"
        loading={q.isLoading}
        empty={!q.isLoading && bookParts.length === 0}
        table={<MiniTable columns={[{ key: 'label', label: 'Book' }, { key: 'value', label: 'Funded amount', align: 'right', format: (v) => fmtMoney(Number(v ?? 0)) }]} rows={bookParts} keyField="key" />}
      >
        <ShareBar parts={bookParts} format={fmtMoney} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top agents by funded amount"
          loading={q.isLoading}
          empty={!q.isLoading && topAgents.length === 0}
          table={
            <MiniTable
              columns={[
                { key: 'name', label: 'Agent' },
                { key: 'count', label: 'Funded', align: 'right', format: (v) => fmtInt(Number(v ?? 0)) },
                { key: 'amount', label: 'Amount', align: 'right', format: (v) => fmtMoney(Number(v ?? 0)) },
                { key: 'commission', label: 'Commission', align: 'right', format: (v) => fmtMoney(Number(v ?? 0)) },
              ]}
              rows={[...(data?.byAgent ?? [])].sort((a, b) => b.amount - a.amount)}
              keyField="name"
            />
          }
        >
          <BarsChart data={topAgents} xKey="name" horizontal colorByIndex yFormat={fmtMoneyShort} series={[{ key: 'amount', label: 'Funded amount', format: fmtMoney }]} />
        </ChartCard>
        <ChartCard
          title="Top underwriters by funded amount"
          loading={q.isLoading}
          empty={!q.isLoading && topUnderwriters.length === 0}
          table={
            <MiniTable
              columns={[
                { key: 'name', label: 'Underwriter' },
                { key: 'count', label: 'Funded', align: 'right', format: (v) => fmtInt(Number(v ?? 0)) },
                { key: 'amount', label: 'Amount', align: 'right', format: (v) => fmtMoney(Number(v ?? 0)) },
              ]}
              rows={[...(data?.byUnderwriter ?? [])].sort((a, b) => b.amount - a.amount)}
              keyField="name"
            />
          }
        >
          <BarsChart data={topUnderwriters} xKey="name" horizontal colorByIndex yFormat={fmtMoneyShort} series={[{ key: 'amount', label: 'Funded amount', format: fmtMoney }]} />
        </ChartCard>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Portfolio (all funded deals, any period)</h3>
          <span className="text-2xl font-semibold tabular-nums text-foreground">{fmtPct(portfolio?.collectedShare)}</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Share collected of total payback due</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Funded deals" value={fmtInt(portfolio?.fundedDeals)} loading={q.isLoading} />
          <Stat label="Funded amount" value={fmtMoney(portfolio?.fundedAmount)} loading={q.isLoading} />
          <Stat label="Payback amount" value={fmtMoney(portfolio?.paybackAmount)} loading={q.isLoading} />
          <Stat label="Repaid" value={fmtMoney(portfolio?.repaidAmount)} loading={q.isLoading} />
        </div>
        <div className="mt-4">
          <ShareBar
            parts={[
              { key: 'repaid', label: 'Repaid', value: portfolio?.repaidAmount ?? 0 },
              { key: 'balance', label: 'Balance due', value: portfolio?.balanceDue ?? 0 },
            ]}
            format={fmtMoney}
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {loading ? <div className="h-6 w-20 animate-pulse rounded bg-muted" /> : <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>}
    </div>
  );
}
