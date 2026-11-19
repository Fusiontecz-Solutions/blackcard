import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { BarsChart, ChartCard, Delta, KpiTile, MiniTable, TrendChart, type SeriesDef } from '../charts';
import { fmtBucket, fmtInt, fmtMoney, fmtMoneyShort, fmtPct } from '../format';
import { getReportErrorMessage, reportApi, type StageBucket } from '../reportApi';
import { describeRange } from '../useReportFilters';
import DrillDownTable, { type DrillQuery } from '../DrillDownTable';
import type { TabProps } from './types';

interface OpenDrill {
  title: string;
  query: DrillQuery;
}

function findStage(rows: StageBucket[], stage: string): StageBucket | undefined {
  return rows.find((r) => r.stage === stage);
}

const VOLUME_SERIES: SeriesDef[] = [
  { key: 'applications', label: 'Submissions' },
  { key: 'approved', label: 'Approved' },
  { key: 'funded', label: 'Funded' },
  { key: 'declined', label: 'Declined' },
];
const FUNDED_AMOUNT_SERIES: SeriesDef[] = [{ key: 'fundedAmount', label: 'Funded amount', format: fmtMoneyShort }];
const PIPELINE_SERIES: SeriesDef[] = [{ key: 'count', label: 'Submissions', format: fmtInt }];

export default function OverviewTab({ filters }: TabProps) {
  const query = useQuery({
    queryKey: ['reports', 'overview', filters],
    queryFn: async () => {
      const res = await reportApi.overview(filters);
      return { data: res.data, filters: res.filters };
    },
    placeholderData: keepPreviousData,
  });

  const [openDrill, setOpenDrill] = useState<OpenDrill | null>(null);

  const report = query.data?.data;
  const current = report?.current;
  const previous = report?.previous;
  const trend = report?.trend ?? [];
  const openPipeline = report?.openPipeline ?? [];
  const loading = query.isLoading;
  const errorMessage = query.isError ? getReportErrorMessage(query.error, 'Could not load the overview report') : null;

  const onHold = findStage(report?.waiting ?? [], 'On_Hold');
  const waitingDocs = findStage(report?.waiting ?? [], 'Waiting_For_Documents');

  const openApplications = (title: string, dq: DrillQuery) => setOpenDrill({ title, query: dq });

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="size-4 shrink-0" />
          {errorMessage}
        </div>
      ) : null}

      {report ? (
        <p className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{describeRange(filters, query.data?.filters)}</span>, grouped by {report.granularity}.
        </p>
      ) : null}

      {/* Primary KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Submissions"
          value={fmtInt(current?.applications)}
          sub={current ? fmtMoney(current.requestedAmount) : undefined}
          delta={current && previous ? <Delta current={current.applications} previous={previous.applications} /> : undefined}
          loading={loading}
          onClick={() => openApplications('Submissions', { dateField: 'createdAtTenant' })}
        />
        <KpiTile
          label="Approved"
          value={fmtInt(current?.approved)}
          sub={current ? fmtMoney(current.approvedAmount) : undefined}
          delta={current && previous ? <Delta current={current.approved} previous={previous.approved} /> : undefined}
          loading={loading}
          onClick={() => openApplications('Approved', { dateField: 'approvedAt' })}
        />
        <KpiTile
          label="Funded"
          value={fmtInt(current?.funded)}
          sub={current ? fmtMoney(current.fundedAmount) : undefined}
          delta={current && previous ? <Delta current={current.funded} previous={previous.funded} /> : undefined}
          loading={loading}
          onClick={() => openApplications('Funded', { dateField: 'fundedAt', stage: 'Funded' })}
        />
        <KpiTile
          label="Funded amount"
          value={current ? fmtMoney(current.fundedAmount) : '—'}
          delta={current && previous ? <Delta current={current.fundedAmount} previous={previous.fundedAmount} /> : undefined}
          loading={loading}
          onClick={() => openApplications('Funded', { dateField: 'fundedAt', stage: 'Funded' })}
        />
        <KpiTile
          label="Declined"
          value={fmtInt(current?.declined)}
          delta={current && previous ? <Delta current={current.declined} previous={previous.declined} invert /> : undefined}
          loading={loading}
          onClick={() => openApplications('Declined', { dateField: 'declinedAt', stage: 'Declined' })}
        />
        <KpiTile
          label="Approval rate"
          value={fmtPct(current?.approvalRate)}
          delta={current && previous ? <Delta current={current.approvalRate} previous={previous.approvalRate} format="pts" /> : undefined}
          loading={loading}
        />
      </div>

      {/* Secondary KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Funding rate"
          value={fmtPct(current?.fundingRate)}
          delta={current && previous ? <Delta current={current.fundingRate} previous={previous.fundingRate} format="pts" /> : undefined}
          loading={loading}
        />
        <KpiTile
          label="Avg funded deal"
          value={current ? fmtMoney(current.avgFundedDeal) : '—'}
          delta={current && previous ? <Delta current={current.avgFundedDeal} previous={previous.avgFundedDeal} /> : undefined}
          loading={loading}
        />
        <KpiTile
          label="Commission"
          value={current ? fmtMoney(current.commissionAmount) : '—'}
          delta={current && previous ? <Delta current={current.commissionAmount} previous={previous.commissionAmount} /> : undefined}
          loading={loading}
        />
        <KpiTile
          label="Contracts sent"
          value={fmtInt(current?.contractsSent)}
          delta={current && previous ? <Delta current={current.contractsSent} previous={previous.contractsSent} /> : undefined}
          loading={loading}
          onClick={() => openApplications('Contracts sent', { dateField: 'contractSentAt' })}
        />
        <KpiTile
          label="Contracts signed"
          value={fmtInt(current?.contractsSigned)}
          delta={current && previous ? <Delta current={current.contractsSigned} previous={previous.contractsSigned} /> : undefined}
          loading={loading}
          onClick={() => openApplications('Contracts signed', { dateField: 'contractSignedAt' })}
        />
      </div>

      {/* Trends */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Volume over time"
          legend={VOLUME_SERIES}
          loading={loading}
          empty={!loading && trend.length === 0}
          table={
            <MiniTable
              columns={[
                { key: 'bucket', label: 'Period', format: (v) => fmtBucket(String(v)) },
                { key: 'applications', label: 'Submissions', align: 'right', format: (v) => fmtInt(v as number) },
                { key: 'approved', label: 'Approved', align: 'right', format: (v) => fmtInt(v as number) },
                { key: 'funded', label: 'Funded', align: 'right', format: (v) => fmtInt(v as number) },
                { key: 'declined', label: 'Declined', align: 'right', format: (v) => fmtInt(v as number) },
              ]}
              rows={trend as unknown as Record<string, unknown>[]}
              keyField="bucket"
            />
          }
        >
          <TrendChart data={trend} xKey="bucket" series={VOLUME_SERIES} />
        </ChartCard>

        <ChartCard
          title="Funded amount over time"
          loading={loading}
          empty={!loading && trend.length === 0}
          table={
            <MiniTable
              columns={[
                { key: 'bucket', label: 'Period', format: (v) => fmtBucket(String(v)) },
                { key: 'fundedAmount', label: 'Funded amount', align: 'right', format: (v) => fmtMoney(v as number) },
              ]}
              rows={trend as unknown as Record<string, unknown>[]}
              keyField="bucket"
            />
          }
        >
          <TrendChart data={trend} xKey="bucket" series={FUNDED_AMOUNT_SERIES} area yFormat={fmtMoneyShort} />
        </ChartCard>
      </div>

      {/* Pipeline */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Open pipeline by stage"
          subtitle="Submissions currently in progress, by stage"
          loading={loading}
          empty={!loading && openPipeline.length === 0}
          height={Math.max(200, openPipeline.length * 34)}
          table={
            <MiniTable
              columns={[
                { key: 'label', label: 'Stage' },
                { key: 'count', label: 'Submissions', align: 'right', format: (v) => fmtInt(v as number) },
                { key: 'amount', label: 'Amount', align: 'right', format: (v) => fmtMoney(v as number) },
              ]}
              rows={openPipeline as unknown as Record<string, unknown>[]}
              keyField="stage"
            />
          }
        >
          <BarsChart
            data={openPipeline}
            xKey="label"
            series={PIPELINE_SERIES}
            horizontal
            colorByIndex
            onBarClick={(row) => openApplications(`Pipeline: ${row.label}`, { dateField: 'none', stage: row.stage })}
          />
        </ChartCard>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <KpiTile
              label="On hold"
              value={fmtInt(onHold?.count ?? 0)}
              sub={onHold ? fmtMoney(onHold.amount) : undefined}
              loading={loading}
              accent={(onHold?.count ?? 0) > 0 ? 'warning' : undefined}
              onClick={() => openApplications('On hold', { dateField: 'none', stage: 'On_Hold' })}
            />
            <KpiTile
              label="Waiting for documents"
              value={fmtInt(waitingDocs?.count ?? 0)}
              sub={waitingDocs ? fmtMoney(waitingDocs.amount) : undefined}
              loading={loading}
              accent={(waitingDocs?.count ?? 0) > 0 ? 'warning' : undefined}
              onClick={() => openApplications('Waiting for documents', { dateField: 'none', stage: 'Waiting_For_Documents' })}
            />
          </div>
          <p className="text-xs text-muted-foreground">Click a stage bar or a tile to see the underlying submissions.</p>
        </div>
      </div>

      {openDrill ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{openDrill.title}</h3>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => setOpenDrill(null)}>
              Close
            </button>
          </div>
          <DrillDownTable filters={filters} query={openDrill.query} />
        </div>
      ) : null}
    </div>
  );
}
