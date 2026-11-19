/**
 * Personal syndicator home (logged-in user with SYNDICATOR role).
 * Rendered at `/` via DashboardPage — not used on `/syndicators/dashboard`.
 *
 * Data source: GET /syndicators/me/summary
 *   - totals across all of this syndicator's allocations (applicationSyndicatorDetails aggregate)
 *   - REPAYMENT/Funding wallet ledger (last 14 months) bucketed client-side for weekly/monthly/yearly trend
 *   - recent allocations enriched with application + latest terms-offer details for the **Recent fundings** table
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line,
} from 'recharts';
import { ChevronDown } from 'lucide-react';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { axiosGet } from '@/redux/axios';
import { syndicatorDealIdDisplay } from '@/lib/syndicatorDealDisplay';
import { formatProjectedEndDate, SYNDICATOR_PROJECTED_END_DATE_TITLE } from '@/lib/syndicatorProjectedEndDate';
import { SYNDICATOR_FUNDING_TABLE_HEADS } from '@/lib/syndicatorFundingTableHeads';
import { syndicatorChartYAxisLayoutForMaxValue } from '@/lib/syndicatorChartYAxisLayout';
import {
  type SummaryResponse,
  type TrendBucket,
  type WalletSeriesRow,
  bucketRepayments,
  pct,
} from './syndicatorMeSummary.shared';

function InvestedPieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string | number; value?: unknown }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const name = String(row.name ?? 'Amount');
  const v = Number(row.value ?? 0);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-md">
      <p className="m-0 mb-1 font-medium text-muted-foreground">{name}</p>
      <p className="m-0 font-bold tabular-nums">{formatCurrency(v)}</p>
    </div>
  );
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const MiniFinanceCard = ({
  title,
  value,
  showGraph,
}: {
  title: string;
  value: string;
  showGraph?: boolean;
}) => (
  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-6 shadow-sm">
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <h4 className="text-lg font-black text-primary">{value}</h4>
    </div>
    {showGraph ? (
      <div className="h-10 w-20">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={[{ v: 1 }, { v: 3 }, { v: 2 }, { v: 5 }, { v: 4 }]}>
            <Area type="monotone" dataKey="v" stroke="var(--primary)" fill="none" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    ) : null}
  </div>
);

function TotalSyndicateRtrTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: unknown; dataKey?: unknown }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload.find((p) => String(p.dataKey) === 'actual') ?? payload[0];
  const n = Number(row?.value ?? 0);
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-foreground shadow-md">
      <p className="m-0 mb-1 font-medium">{String(label ?? '')}</p>
      <p className="m-0 text-sm font-medium text-foreground">Repayment: {formatCurrency(n)}</p>
    </div>
  );
}

/** Repayment trend chart + timeframe control only — state here avoids re-rendering the rest of the dashboard. */
function TotalSyndicateRtrTrendChart({ repayment }: { repayment: WalletSeriesRow[] }) {
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const trendLabel =
    timeframe === 'daily' ? 'Daily' : timeframe === 'weekly' ? 'Weekly' : 'Monthly';

  const rtrChartData = useMemo<TrendBucket[]>(
    () => bucketRepayments(repayment, timeframe),
    [repayment, timeframe],
  );

  const highlightIndex = useMemo(() => {
    if (rtrChartData.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < rtrChartData.length; i++) {
      if (rtrChartData[i].actual > rtrChartData[best].actual) best = i;
    }
    return rtrChartData[best].actual > 0 ? best : -1;
  }, [rtrChartData]);

  const rtrChartYMax = useMemo(
    () => rtrChartData.reduce((m, d) => Math.max(m, d.actual), 0),
    [rtrChartData],
  );

  const rtrYAxisLayout = useMemo(
    () => syndicatorChartYAxisLayoutForMaxValue(rtrChartYMax <= 0 ? 0 : rtrChartYMax * 1.28),
    [rtrChartYMax],
  );

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 shadow-sm xl:col-span-7">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-wider text-foreground">Total syndicate RTR</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-8 gap-2 text-sm">
              {trendLabel} <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setTimeframe('daily')}>Daily</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTimeframe('weekly')}>Weekly</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTimeframe('monthly')}>Monthly</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="h-[220px] w-full overflow-visible pr-0.5 pt-0.5">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rtrChartData}
            margin={{
              top: 12,
              right: rtrYAxisLayout.marginRight,
              left: rtrYAxisLayout.marginLeft,
              bottom: rtrYAxisLayout.marginBottom,
            }}
            barCategoryGap="30%"
            barGap={0}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }}
              dy={10}
            />
            <YAxis
              width={rtrYAxisLayout.yAxisWidth}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }}
              tickMargin={rtrYAxisLayout.tickMargin}
              tickFormatter={(v) => formatCurrency(Number(v))}
            />
            <Tooltip
              cursor={{ fill: 'transparent' }}
              content={(props) => (
                <TotalSyndicateRtrTooltip active={props.active} payload={props.payload} label={props.label} />
              )}
            />

            <Bar dataKey="actual" barSize={24} radius={0} isAnimationActive={false}>
              {rtrChartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === highlightIndex ? 'var(--primary)' : 'var(--secondary)'}
                />
              ))}
            </Bar>

            <Line
              type="linear"
              dataKey="actual"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeDasharray="8 8"
              dot={{
                r: 4,
                fill: 'var(--primary)',
                strokeWidth: 2,
                stroke: 'var(--card)',
              }}
              activeDot={{ r: 6 }}
              connectNulls={false}
              isAnimationActive={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function SyndicatorRoleHomeDashboard() {
  const navigate = useNavigate();

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosGet('/syndicators/me/summary');
      const data = res?.data?.data as SummaryResponse | undefined;
      if (!data) {
        toast.error('Could not load syndicator dashboard');
        setSummary(null);
        return;
      }
      setSummary(data);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not load syndicator dashboard';
      toast.error(msg);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = summary?.totals;
  const invested = totals?.amountSyndicated ?? 0;
  const repaid = totals?.collectedAmount ?? 0;
  const defaulted = totals?.defaultedAmount ?? 0;
  const slowPay = totals?.slowPayAmount ?? 0;
  const remaining = totals?.remainingAmount ?? 0;
  const commission = totals?.commissionAmount ?? 0;
  const managementFee = totals?.managementFeeToDate ?? 0;
  const expectedRtr = totals?.paybackAmountSyndicated ?? 0;

  const statusBreakdownTotal = invested + repaid + defaulted + slowPay;
  const investedPct = pct(invested, statusBreakdownTotal);
  const repaidPct = pct(repaid, statusBreakdownTotal);
  const defaultedPct = pct(defaulted, statusBreakdownTotal);
  const slowPayPct = pct(slowPay, statusBreakdownTotal);

  const investedByPie = useMemo(
    () => [
      { name: 'Successful', value: repaid },
      { name: 'Remaining', value: remaining },
      { name: 'Default', value: defaulted },
    ],
    [repaid, remaining, defaulted],
  );

  const investedPieTotal = repaid + remaining + defaulted;

  const totalSyndicateRtr = invested + commission + managementFee + remaining;
  const rtrInvestedPct = pct(invested, totalSyndicateRtr);
  const rtrCommissionPct = pct(commission, totalSyndicateRtr);
  const rtrMgmtPct = pct(managementFee, totalSyndicateRtr);
  const rtrRemainderPct = pct(remaining, totalSyndicateRtr);

  const recentApplications = summary?.recentApplications ?? [];

  const radialTrack = 'var(--secondary)';

  const RadialProgress = ({ value, color }: { value: number; color: string }) => (
    <div className="relative h-24 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={[{ value: Math.max(0, value) }, { value: Math.max(0, 100 - value) }]}
            innerRadius={36}
            outerRadius={46}
            startAngle={90}
            endAngle={450}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill={radialTrack} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[12px] font-black text-foreground">{value.toFixed(2)}%</span>
      </div>
    </div>
  );

  const LegendItem = ({ color, label, value }: { color: string; label: string; value: string }) => (
    // Stack label above value so long labels (e.g. "Mgmt fees up to date") never overflow
    // their grid cell and overlap a sibling legend item in narrow card widths.
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate text-[11px] font-medium text-muted-foreground" title={label}>
          {label}
        </span>
      </div>
      <span className="pl-5 text-[12px] font-black text-foreground">{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen space-y-6 bg-background px-6 pb-6 pt-8 text-foreground md:pt-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Syndicator dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Your portfolio performance and repayment overview.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" className="h-9 text-xs font-bold" onClick={() => navigate('/syndicator-activity')}>
            Activity
          </Button>
          <Button className="h-9 px-4 text-xs font-bold" onClick={() => navigate('/syndicator-withdraw')}>
            Withdraw
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
          Loading syndicator dashboard…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl bg-primary p-6 text-primary-foreground shadow-sm">
              <h3 className="mb-6 text-sm font-semibold">RTR status breakdown</h3>

              <div className="relative mb-8">
                {/* Per-segment amount labels above the bar. Each label is only rendered when its
                    segment is wide enough to physically fit the currency string (>= 10%); anything
                    smaller is suppressed here to avoid horizontal overlap and is still visible in
                    the legend below. `overflow-hidden` + `whitespace-nowrap` clips edge cases. */}
                <div className="mb-2 flex w-full text-[10px] font-medium text-primary-foreground/70">
                  <div
                    style={{ width: `${investedPct}%` }}
                    className="shrink-0 overflow-hidden whitespace-nowrap pr-1"
                  >
                    {investedPct >= 10 ? formatCurrency(invested) : ''}
                  </div>
                  <div
                    style={{ width: `${repaidPct}%` }}
                    className="shrink-0 overflow-hidden whitespace-nowrap px-1"
                  >
                    {repaidPct >= 10 ? formatCurrency(repaid) : ''}
                  </div>
                  <div
                    style={{ width: `${defaultedPct}%` }}
                    className="shrink-0 overflow-hidden whitespace-nowrap px-1"
                  >
                    {defaultedPct >= 10 ? formatCurrency(defaulted) : ''}
                  </div>
                  <div
                    style={{ width: `${slowPayPct}%` }}
                    className="shrink-0 overflow-hidden whitespace-nowrap pl-1 text-right"
                  >
                    {slowPayPct >= 10 ? formatCurrency(slowPay) : ''}
                  </div>
                </div>

                <div className="flex h-14 w-full items-center">
                  <div className="relative h-full rounded-l-xl bg-[#A9CCE3]" style={{ width: `${investedPct}%` }}>
                    <div className="absolute bottom-[-20px] right-0 top-[-20px] w-px bg-primary-foreground opacity-30" />
                  </div>
                  <div className="relative h-full bg-[#D1E9F6]" style={{ width: `${repaidPct}%` }}>
                    <div className="absolute bottom-[-20px] right-0 top-[-20px] w-px bg-primary-foreground opacity-30" />
                  </div>
                  <div className="relative h-full bg-[#FFB09C]" style={{ width: `${defaultedPct}%` }}>
                    <div className="absolute bottom-[-20px] right-0 top-[-20px] w-px bg-primary-foreground opacity-30" />
                  </div>
                  <div className="h-full rounded-r-xl bg-[#E2E8F0]" style={{ width: `${slowPayPct}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-4 pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#A9CCE3]" />
                  <span className="text-[11px] text-primary-foreground/80">
                    Invested: <span className="ml-1 font-bold text-primary-foreground">{formatCurrency(invested)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#D1E9F6]" />
                  <span className="text-[11px] text-primary-foreground/80">
                    Repaid: <span className="ml-1 font-bold text-primary-foreground">{formatCurrency(repaid)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FFB09C]" />
                  <span className="text-[11px] text-primary-foreground/80">
                    Default: <span className="ml-1 font-bold text-primary-foreground">{formatCurrency(defaulted)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#E2E8F0]" />
                  <span className="text-[11px] text-primary-foreground/80">
                    Slow pay: <span className="ml-1 font-bold text-primary-foreground">{formatCurrency(slowPay)}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="h-full rounded-xl border border-border bg-card p-6 shadow-sm">
              <h3 className="mb-6 text-sm font-bold text-foreground">Invested amount breakdown</h3>

              <div className="flex items-center justify-between gap-4">
                <div className="flex w-1/2 flex-col items-center">
                  <div className="relative h-40 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip content={InvestedPieTooltip} />
                        <Pie
                          data={investedByPie}
                          cx="50%"
                          cy="50%"
                          outerRadius={65}
                          dataKey="value"
                          stroke="var(--card)"
                          strokeWidth={2}
                          label={false}
                          cursor="pointer"
                        >
                          <Cell fill="var(--chart-1)" />
                          <Cell fill="var(--chart-4)" />
                          <Cell fill="var(--chart-5)" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-base font-black text-foreground">{formatCurrency(investedPieTotal)}</p>
                </div>

                <div className="w-1/2 space-y-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-chart-1" />
                      <span className="text-xs font-medium text-muted-foreground">Successful</span>
                    </div>
                    <span className="pl-5 text-base font-black text-foreground">{formatCurrency(repaid)}</span>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-[#D1E9F6]" />
                      <span className="text-xs font-medium text-muted-foreground">Remaining</span>
                    </div>
                    <span className="pl-5 text-base font-black text-foreground">{formatCurrency(remaining)}</span>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-[#FFB09C]" />
                      <span className="text-xs font-medium text-muted-foreground">Default</span>
                    </div>
                    <span className="pl-5 text-base font-black text-foreground">{formatCurrency(defaulted)}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="flex h-full flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm xl:col-span-5">
              <div className="mb-4 flex items-start justify-between">
                <h3 className="text-sm font-bold text-foreground">Total syndicate RTR</h3>
                <span className="text-lg font-black text-primary">{formatCurrency(totalSyndicateRtr)}</span>
              </div>

              <div className="mb-4 flex items-center justify-between px-1">
                <RadialProgress value={rtrInvestedPct} color="var(--primary)" />
                <RadialProgress value={rtrCommissionPct} color="var(--chart-2)" />
                <RadialProgress value={rtrMgmtPct} color="var(--chart-4)" />
                <RadialProgress value={rtrRemainderPct} color="var(--chart-5)" />
              </div>

              <div className="grid grid-cols-2 gap-x-2 gap-y-3 border-t border-border pt-4">
                <LegendItem color="var(--primary)" label="Syndicated" value={formatCurrency(invested)} />
                <LegendItem color="var(--chart-2)" label="Commission" value={formatCurrency(commission)} />
                <LegendItem color="var(--chart-4)" label="Mgmt fees up to date" value={formatCurrency(managementFee)} />
                <LegendItem color="var(--chart-5)" label="Remainder" value={formatCurrency(remaining)} />
              </div>
            </div>

            <TotalSyndicateRtrTrendChart repayment={summary?.trend?.REPAYMENT ?? []} />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <MiniFinanceCard title="Total investment" value={formatCurrency(invested)} showGraph />
            <MiniFinanceCard title="Expected RTR" value={formatCurrency(expectedRtr)} />
            <MiniFinanceCard title="Total remaining" value={formatCurrency(remaining)} />
            <MiniFinanceCard title="Total commission" value={formatCurrency(commission)} />
            <MiniFinanceCard title="Successful payments" value={formatCurrency(repaid)} />
            <MiniFinanceCard title="Default payments" value={formatCurrency(defaulted)} />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Recent fundings</h3>
              <Button size="sm" className="h-9 px-4 text-xs" onClick={() => navigate('/syndicator-funding')}>
                View all
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  {SYNDICATOR_FUNDING_TABLE_HEADS.map((h) => (
                    <TableHead
                      key={h.id}
                      className={['text-[10px] font-bold text-muted-foreground', h.className].filter(Boolean).join(' ')}
                    >
                      {h.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentApplications.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={SYNDICATOR_FUNDING_TABLE_HEADS.length}
                      className="py-12 text-left text-xs font-medium italic text-muted-foreground"
                    >
                      No fundings yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentApplications.map((row) => {
                    const dealId = syndicatorDealIdDisplay(row.dealId, row.applicationId);
                    const merchant =
                      row.merchantName?.trim() || row.dealDisplayName?.trim() || '—';
                    const company = row.businessName?.trim() || '—';
                    const startIso = row.fundingDate ?? row.createdAt;
                    return (
                      <TableRow key={row.allocationId}>
                        <TableCell className="text-[11px] text-foreground">{dealId}</TableCell>
                        <TableCell className="text-[11px] text-foreground">{merchant}</TableCell>
                        <TableCell className="text-[11px] text-foreground">{company}</TableCell>
                        <TableCell className="text-[11px] text-foreground">{formatDate(startIso, '—')}</TableCell>
                        <TableCell
                          className="text-[11px] text-muted-foreground"
                          title={SYNDICATOR_PROJECTED_END_DATE_TITLE}
                        >
                          {formatProjectedEndDate(startIso, row.termLength, row.repaymentFrequency ?? null)}
                        </TableCell>
                        <TableCell className="text-[11px] text-foreground">
                          {formatCurrency(row.amountSyndicated)}
                        </TableCell>
                        <TableCell className="text-[11px] text-foreground">
                          {formatCurrency(row.paybackAmountSyndicated)}
                        </TableCell>
                        <TableCell className="text-[11px] text-foreground">
                          {formatCurrency(row.commissionAmount)}
                        </TableCell>
                        <TableCell className="text-[11px] text-foreground">
                          {formatCurrency(row.managementFeeToDate)}
                        </TableCell>
                        <TableCell className="text-[11px] text-foreground">
                          {formatCurrency(row.collectedAmount)}
                        </TableCell>
                        <TableCell className="text-[11px] text-foreground">
                          {formatCurrency(row.remainingAmount)}
                        </TableCell>
                        <TableCell className="text-[11px] text-foreground">
                          {num(row.percentageSyndicated).toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
