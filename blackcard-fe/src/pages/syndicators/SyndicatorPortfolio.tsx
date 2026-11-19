import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { toast } from 'react-toastify';
import { formatCurrency } from '@/lib/utils';
import { syndicatorChartYAxisLayoutForMaxValue } from '@/lib/syndicatorChartYAxisLayout';
import { axiosGet } from '@/redux/axios';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  type SummaryResponse,
  type TrendBucket,
  bucketRepayments,
  pct,
} from './syndicatorMeSummary.shared';

const statusColors = {
  invested: '#A9CCE3',
  repaid: '#D1E9F6',
  defaulted: '#FFB09C',
  slowPay: '#E2E8F0',
} as const;

function StatusBreakdownCard({
  invested,
  repaid,
  defaulted,
  slowPay,
  investedPct,
  repaidPct,
  defaultedPct,
  slowPayPct,
}: {
  invested: number;
  repaid: number;
  defaulted: number;
  slowPay: number;
  investedPct: number;
  repaidPct: number;
  defaultedPct: number;
  slowPayPct: number;
}) {
  return (
    <div className="rounded-xl bg-primary p-6 text-primary-foreground shadow-sm h-full">
      <h3 className="text-sm font-semibold mb-8">Status Breakdown</h3>

      <div className="relative mb-6">
        <div className="flex w-full mb-2 text-[10px] font-medium text-primary-foreground/70">
          <div style={{ width: `${investedPct}%` }} className="shrink-0 overflow-hidden whitespace-nowrap pr-1">
            {investedPct >= 10 ? formatCurrency(invested) : ''}
          </div>
          <div style={{ width: `${repaidPct}%` }} className="shrink-0 overflow-hidden whitespace-nowrap px-1">
            {repaidPct >= 10 ? formatCurrency(repaid) : ''}
          </div>
          <div style={{ width: `${defaultedPct}%` }} className="shrink-0 overflow-hidden whitespace-nowrap px-1">
            {defaultedPct >= 10 ? formatCurrency(defaulted) : ''}
          </div>
          <div
            style={{ width: `${slowPayPct}%` }}
            className="shrink-0 overflow-hidden whitespace-nowrap pl-1 text-right"
          >
            {slowPayPct >= 10 ? formatCurrency(slowPay) : ''}
          </div>
        </div>

        <div className="flex h-14 w-full items-center overflow-hidden rounded-xl bg-primary-foreground/10">
          <div
            className="h-full rounded-l-xl relative"
            style={{ width: `${investedPct}%`, backgroundColor: statusColors.invested }}
          >
            <div className="absolute bottom-[-20px] right-0 top-[-20px] w-px bg-primary-foreground opacity-30" />
          </div>
          <div className="h-full relative" style={{ width: `${repaidPct}%`, backgroundColor: statusColors.repaid }}>
            <div className="absolute bottom-[-20px] right-0 top-[-20px] w-px bg-primary-foreground opacity-30" />
          </div>
          <div
            className="h-full relative"
            style={{ width: `${defaultedPct}%`, backgroundColor: statusColors.defaulted }}
          >
            <div className="absolute bottom-[-20px] right-0 top-[-20px] w-px bg-primary-foreground opacity-30" />
          </div>
          <div
            className="h-full rounded-r-xl"
            style={{ width: `${slowPayPct}%`, backgroundColor: statusColors.slowPay }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-y-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#A9CCE3]" />
          <span className="text-[11px] text-primary-foreground/80">
            Invested <span className="font-black text-primary-foreground ml-1">{formatCurrency(invested)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#D1E9F6]" />
          <span className="text-[11px] text-primary-foreground/80">
            Repaid <span className="font-black text-primary-foreground ml-1">{formatCurrency(repaid)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FFB09C]" />
          <span className="text-[11px] text-primary-foreground/80">
            Default <span className="font-black text-primary-foreground ml-1">{formatCurrency(defaulted)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#E2E8F0]" />
          <span className="text-[11px] text-primary-foreground/80">
            Slow Pay <span className="font-black text-primary-foreground ml-1">{formatCurrency(slowPay)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: { v: number }[] }) {
  const data = points.length > 0 ? points : [{ v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }];
  return (
    <div className="w-[120px] h-[42px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
            <Area type="monotone" dataKey="v" stroke="var(--primary)" fill="transparent" strokeWidth={2.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RepaymentsTooltip({
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
      <p className="m-0 text-sm font-medium" style={{ color: 'var(--primary)' }}>
        Repaid: {formatCurrency(n)}
      </p>
    </div>
  );
}

function RepaymentsTransactionsCard({
  chartData,
  highlightIndex,
  trendView,
  onTrendView,
}: {
  chartData: TrendBucket[];
  highlightIndex: number;
  trendView: 'daily' | 'weekly' | 'monthly';
  onTrendView: (v: 'daily' | 'weekly' | 'monthly') => void;
}) {
  const trendLabel = trendView === 'daily' ? 'Daily' : trendView === 'weekly' ? 'Weekly' : 'Monthly';

  const { chartYMax, yAxisLayout } = useMemo(() => {
    let max = 0;
    for (const d of chartData) {
      max = Math.max(max, Number(d.actual));
    }
    const yMax = max <= 0 ? 1 : Number((max * 1.28).toFixed(2));
    return { chartYMax: yMax, yAxisLayout: syndicatorChartYAxisLayoutForMaxValue(yMax) };
  }, [chartData]);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-semibold text-foreground">Repayments</h3>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2 rounded-lg text-[10px] font-bold">
              {trendLabel}
              <ChevronDown size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onTrendView('daily')}>Daily</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onTrendView('weekly')}>Weekly</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onTrendView('monthly')}>Monthly</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="h-[260px] w-full overflow-visible pr-0.5 pt-0.5">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{
              top: 12,
              right: yAxisLayout.marginRight,
              left: yAxisLayout.marginLeft,
              bottom: yAxisLayout.marginBottom,
            }}
            barCategoryGap="30%"
            barGap={0}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              type="category"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }}
              dy={10}
            />
            <YAxis
              width={yAxisLayout.yAxisWidth}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }}
              tickMargin={yAxisLayout.tickMargin}
              tickFormatter={(v) => formatCurrency(Number(v))}
              domain={[0, chartYMax]}
            />
            <Tooltip
              cursor={{ fill: 'transparent' }}
              content={(props) => (
                <RepaymentsTooltip active={props.active} payload={props.payload} label={props.label} />
              )}
            />

            <Bar
              name="Repaid"
              dataKey="actual"
              barSize={26}
              radius={0}
              isAnimationActive={false}
            >
              {chartData.map((entry, idx) => (
                <Cell
                  key={`${entry.month}-${idx}`}
                  fill={idx === highlightIndex ? 'var(--primary)' : 'var(--secondary)'}
                />
              ))}
            </Bar>

            <Line
              type="linear"
              dataKey="actual"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeDasharray="6 6"
              dot={{ r: 4, fill: 'var(--primary)', strokeWidth: 2, stroke: 'var(--card)' }}
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

const SummaryCard = ({ title, value }: { title: string; value: string }) => (
  <div className="rounded-xl border border-border bg-card shadow-sm p-6 h-full">
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[11px] font-semibold text-muted-foreground">{title}</div>
        <div className="text-lg font-black text-primary mt-2">{value}</div>
      </div>
      <div className="w-[120px]" />
    </div>
  </div>
);

export default function SyndicatorPortfolio() {
  const [trendView, setTrendView] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosGet('/syndicators/me/summary');
      const data = res?.data?.data as SummaryResponse | undefined;
      if (!data) {
        toast.error('Could not load portfolio');
        setSummary(null);
        return;
      }
      setSummary(data);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not load portfolio';
      toast.error(msg);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rtrBase = useMemo(
    () => bucketRepayments(summary?.trend?.REPAYMENT ?? [], trendView),
    [summary?.trend?.REPAYMENT, trendView],
  );

  /** Sparkline uses a fixed monthly view so it does not jump when the chart timeframe changes. */
  const sparklineBuckets = useMemo(
    () => bucketRepayments(summary?.trend?.REPAYMENT ?? [], 'monthly'),
    [summary?.trend?.REPAYMENT],
  );

  const highlightIndex = useMemo(() => {
    if (rtrBase.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < rtrBase.length; i++) {
      if (rtrBase[i].actual > rtrBase[best].actual) best = i;
    }
    return rtrBase[best].actual > 0 ? best : -1;
  }, [rtrBase]);

  const sparkPoints = useMemo(() => {
    const tail = sparklineBuckets.slice(-5).map((b) => ({ v: Math.max(0, b.actual) }));
    if (tail.length === 0) return [{ v: 0 }];
    const max = Math.max(...tail.map((p) => p.v), 1);
    return tail.map((p) => ({ v: max > 0 ? (p.v / max) * 4 + 1 : 1 }));
  }, [sparklineBuckets]);

  const totals = summary?.totals;
  const invested = totals?.amountSyndicated ?? 0;
  const repaid = totals?.collectedAmount ?? 0;
  const defaulted = totals?.defaultedAmount ?? 0;
  const slowPay = totals?.slowPayAmount ?? 0;

  const statusBreakdownTotal = invested + repaid + defaulted + slowPay;
  const investedPct = pct(invested, statusBreakdownTotal);
  const repaidPct = pct(repaid, statusBreakdownTotal);
  const defaultedPct = pct(defaulted, statusBreakdownTotal);
  const slowPayPct = pct(slowPay, statusBreakdownTotal);

  const totalInvestment = invested;
  const expectedRtr = totals?.paybackAmountSyndicated ?? 0;
  const totalRemaining = totals?.remainingAmount ?? 0;

  if (loading) {
    return (
      <div className="min-h-screen space-y-6 bg-background p-6 px-6 pb-6 pt-8 text-foreground md:pt-10">
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
          Loading portfolio…
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen space-y-6 bg-background p-6 px-6 pb-6 pt-8 text-foreground md:pt-10">
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
          Portfolio data unavailable. Refresh the page or try again later.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-background p-6 px-6 pb-6 pt-8 text-foreground md:pt-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <StatusBreakdownCard
          invested={invested}
          repaid={repaid}
          defaulted={defaulted}
          slowPay={slowPay}
          investedPct={investedPct}
          repaidPct={repaidPct}
          defaultedPct={defaultedPct}
          slowPayPct={slowPayPct}
        />
        <RepaymentsTransactionsCard
          chartData={rtrBase}
          highlightIndex={highlightIndex}
          trendView={trendView}
          onTrendView={setTrendView}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-xl border border-border bg-card shadow-sm p-6 h-full">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground">Total Investment</div>
              <div className="text-lg font-black text-primary mt-2">{formatCurrency(totalInvestment)}</div>
            </div>
            <Sparkline points={sparkPoints} />
          </div>
        </div>
        <SummaryCard title="Expected RTR" value={formatCurrency(expectedRtr)} />
        <SummaryCard title="Total Remaining" value={formatCurrency(totalRemaining)} />
      </div>
    </div>
  );
}
