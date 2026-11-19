import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { toast } from 'react-toastify';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { syndicatorDealIdDisplay } from '@/lib/syndicatorDealDisplay';
import { syndicatorChartYAxisLayoutForMaxValue } from '@/lib/syndicatorChartYAxisLayout';
import { axiosGet } from '@/redux/axios';
import type { SummaryResponse } from './syndicatorMeSummary.shared';

/** Three-column summary (Line item / Amount / %) — matches prior `colgroup` 46 / 38 / 16. */
const SUMMARY_3COL_GRID =
  'grid min-h-0 grid-cols-[minmax(0,46fr)_minmax(0,38fr)_minmax(0,16fr)] items-center';

/** Arc fills for deal-status dome on `bg-primary`. */
const dealStatusColors = {
  syndicated: 'var(--primary-foreground)',
  payback: 'var(--chart-4)',
  remaining: 'var(--secondary)',
  fees: 'var(--chart-2)',
} as const;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type TrendBar = { period: string; amount: number };

function PayoutStatusCapsule({ status, label }: { status: string; label: string }) {
  const u = String(status).toUpperCase();
  /** Shared pill frame; Paid/Failed match design ref (sentence case, soft fill + tonal border). */
  const frame =
    'rounded-full border px-2.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal shadow-none';
  if (u === 'PAID' || u === 'CREDIT') {
    return (
      <Badge
        variant="outline"
        className={`${frame} border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-50 dark:hover:bg-emerald-950/45`}
      >
        {label}
      </Badge>
    );
  }
  if (u === 'FAILED') {
    return (
      <Badge
        variant="outline"
        className={`${frame} border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-300 dark:hover:bg-rose-950/45`}
      >
        {label}
      </Badge>
    );
  }
  if (u === 'MANUAL') {
    return (
      <Badge
        variant="outline"
        className={`${frame} border-sky-200 bg-sky-50 text-sky-950 hover:bg-sky-50 dark:border-sky-800 dark:bg-sky-950/45 dark:text-sky-50 dark:hover:bg-sky-950/45`}
      >
        {label}
      </Badge>
    );
  }
  if (u === 'DEBIT') {
    return (
      <Badge
        variant="outline"
        className={`${frame} border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-50 dark:hover:bg-amber-950/45`}
      >
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`${frame} border-border bg-muted/60 text-foreground hover:bg-muted/60`}>
      {label}
    </Badge>
  );
}

/** Roll repayment credits by calendar month (Jan–Dec) for the bar chart. */
function rollupRepaymentByCalendarMonth(repaymentRows: { date: string; amount: string }[]): TrendBar[] {
  const rows = Array.isArray(repaymentRows) ? repaymentRows : [];
  const monthMap = new Map<number, number>();
  for (const r of rows) {
    const d = new Date(r.date);
    if (!Number.isFinite(d.getTime())) continue;
    const m = d.getMonth();
    monthMap.set(m, (monthMap.get(m) ?? 0) + Number(r.amount ?? 0));
  }
  return MONTH_NAMES.map((month, idx) => ({
    period: month,
    amount: Number((monthMap.get(idx) ?? 0).toFixed(2)),
  }));
}

function ProgressRing({
    total,
    values,
    labels,
}: {
    total: number;
    values: number[];
    labels: string[];
}) {
    const pieData = values.map((v, idx) => ({ name: labels[idx], value: v }));

    const colorForIndex = (i: number) => {
        if (i === 0) return dealStatusColors.syndicated;
        if (i === 1) return dealStatusColors.payback;
        if (i === 2) return dealStatusColors.remaining;
        return dealStatusColors.fees;
    };

    return (
        <div className="relative mx-auto h-[136px] w-[220px] shrink-0 overflow-visible">
            <ResponsiveContainer width="100%" height="100%">
                {/*
                  cy≈middle of viewport (not cy=100%): anchors the dome so the arc uses the vertical
                  space evenly instead of sitting on the SVG bottom edge with a tall empty band above.
                */}
                <PieChart margin={{ top: 6, right: 4, bottom: 10, left: 4 }}>
                    <Pie
                        data={pieData}
                        dataKey="value"
                        cx="50%"
                        cy="71%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={56}
                        outerRadius={74}
                        paddingAngle={1}
                        stroke="none"
                        cornerRadius={0}
                    >
                        {pieData.map((_, i) => (
                            <Cell key={i} fill={colorForIndex(i)} />
                        ))}
                    </Pie>
                </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-[6px]">
                <div className="mb-0.5 text-[11px] font-black text-primary-foreground/90">Total</div>
                <div className="text-[13px] font-black leading-tight text-primary-foreground">{formatCurrency(total)}</div>
            </div>
        </div>
    );
}

export default function SyndicatorPayouts() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosGet('/syndicators/me/summary');
      setSummary((res?.data?.data as SummaryResponse | undefined) ?? null);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load payouts';
      toast.error(msg);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const repaymentRows = useMemo(
    () => (Array.isArray(summary?.trend?.REPAYMENT) ? summary.trend.REPAYMENT : []),
    [summary],
  );

  const paymentStatus = useMemo(() => {
    if (!summary?.totals) {
      return { received: 0, remaining: 0, failed: 0, slowPay: 0 };
    }
    return {
      received: Number(summary.totals.collectedAmount ?? 0),
      remaining: Number(summary.totals.remainingAmount ?? 0),
      failed: Number(summary.totals.defaultedAmount ?? 0),
      slowPay: Number(summary.totals.slowPayAmount ?? 0),
    };
  }, [summary]);

  const paymentTotal = useMemo(() => Object.values(paymentStatus).reduce((a, b) => a + b, 0), [paymentStatus]);

  const dealStatus = useMemo(() => {
    if (!summary?.totals) {
      return { syndicated: 0, payback: 0, remaining: 0, fees: 0 };
    }
    const t = summary.totals;
    return {
      syndicated: Number(t.amountSyndicated ?? 0),
      payback: Number(t.paybackAmountSyndicated ?? 0),
      remaining: Number(t.remainingAmount ?? 0),
      fees: Number(t.commissionAmount ?? 0) + Number(t.managementFeeToDate ?? 0),
    };
  }, [summary]);

  const dealStatusTotal = useMemo(
    () => dealStatus.syndicated + dealStatus.payback + dealStatus.remaining + dealStatus.fees,
    [dealStatus],
  );

  const transactionAmount = useMemo(
    () => rollupRepaymentByCalendarMonth(repaymentRows),
    [repaymentRows],
  );

  /** Headroom so the tallest bar is not flush with (and clipped by) the plot top. */
  const transactionChartYMax = useMemo(() => {
    const max = transactionAmount.reduce((m, r) => Math.max(m, r.amount), 0);
    if (max <= 0) return 1;
    return Number((max * 1.18).toFixed(2));
  }, [transactionAmount]);

  const transactionYAxisLayout = useMemo(
    () => syndicatorChartYAxisLayoutForMaxValue(transactionChartYMax),
    [transactionChartYMax],
  );

  /** Capital deployed (syndicator view — no multi-syndicator selector on this page). */
  const flowOutflowRows = useMemo(() => {
    const t = summary?.totals;
    if (!t) return [];
    const invested = Number(t.amountSyndicated ?? 0);
    return [{ key: 'invested', label: 'Invested amount', amount: invested, pct: '100%' }];
  }, [summary]);

  /**
   * Expected syndicator RTR split: principal = syndicated share of capital; profit = remainder of
   * syndicated payback obligation (same basis as Funding payback vs syndicated).
   */
  const flowInflowRows = useMemo(() => {
    const t = summary?.totals;
    if (!t) return [];
    const payback = Number(t.paybackAmountSyndicated ?? 0);
    const syndicated = Number(t.amountSyndicated ?? 0);
    const principal = payback > 0 ? Math.min(syndicated, payback) : syndicated;
    const profit = Math.max(0, payback - principal);
    const denom = payback > 0 ? payback : Math.max(principal + profit, 1);
    return [
      {
        key: 'principal',
        label: 'Principal amount',
        amount: principal,
        pct: denom > 0 ? `${((principal / denom) * 100).toFixed(0)}%` : '0%',
      },
      {
        key: 'profit',
        label: 'Profit amount',
        amount: profit,
        pct: denom > 0 ? `${((profit / denom) * 100).toFixed(0)}%` : '0%',
      },
    ];
  }, [summary]);

  const paymentSummaryRows = useMemo(
    () => [
      {
        key: 'total',
        label: 'Total Amount',
        amount: paymentTotal,
        pct: '100%',
        bold: true,
      },
      {
        key: 'collected',
        label: 'Collected Amount',
        amount: paymentStatus.received,
        pct: paymentTotal > 0 ? `${((paymentStatus.received / paymentTotal) * 100).toFixed(2)}%` : '0%',
        bold: false,
      },
      {
        key: 'remaining',
        label: 'Remaining Amount',
        amount: paymentStatus.remaining,
        pct: paymentTotal > 0 ? `${((paymentStatus.remaining / paymentTotal) * 100).toFixed(2)}%` : '0%',
        bold: false,
      },
      {
        key: 'failed',
        label: 'Failed Amount',
        amount: paymentStatus.failed,
        pct: paymentTotal > 0 ? `${((paymentStatus.failed / paymentTotal) * 100).toFixed(2)}%` : '0%',
        bold: false,
      },
    ],
    [paymentTotal, paymentStatus.failed, paymentStatus.received, paymentStatus.remaining],
  );

  const flowBodyRowCount = 2 + flowOutflowRows.length + flowInflowRows.length;

  const payoutRows = useMemo(
    () =>
      (Array.isArray(summary?.recentPayoutCollections) ? summary.recentPayoutCollections : []).map((r, idx) => ({
        key: r.id,
        rowNo: idx + 1,
        trsDate: formatDate(r.trsDate, '—'),
        amount: r.syndicatorAmount,
        dealId: syndicatorDealIdDisplay(r.dealId ?? r.applicationDealId, r.applicationNumericId),
        dealName: r.dealDisplayName?.trim() || r.businessName?.trim() || '—',
        paymentStatus: r.paymentStatusLabel,
        statusCode: r.status,
        comments: r.notes?.trim() || '—',
      })),
    [summary?.recentPayoutCollections],
  );

  return (
    <div className="min-h-screen space-y-4 bg-background p-5 text-foreground md:px-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className="flex h-full w-full min-h-[248px] flex-col rounded-xl bg-primary p-4 text-primary-foreground shadow-sm lg:min-h-0">
          <div className="shrink-0">
            <div className="text-[11px] font-bold text-primary-foreground/90">Deal status</div>
            <div className="mt-1 text-sm font-black text-primary-foreground">
              {formatCurrency(dealStatusTotal)}{' '}
              <span className="text-[10px] font-bold text-primary-foreground/80">Total</span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 w-full flex-wrap items-center justify-center gap-6 overflow-visible">
            <ProgressRing
              total={dealStatusTotal}
              values={[
                dealStatus.syndicated,
                dealStatus.payback,
                dealStatus.remaining,
                dealStatus.fees,
              ]}
              labels={['Syndicated', 'Syndicated payback', 'Syndicated remaining', 'Fees']}
            />

            <div className="flex min-w-[200px] flex-col gap-2 text-[11px] sm:min-w-0">
              <div className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-primary-foreground ring-1 ring-primary-foreground/40" />
                <span className="text-primary-foreground">
                  Syndicated: <span className="font-black">{formatCurrency(dealStatus.syndicated)}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-chart-4" />
                <span className="text-primary-foreground">
                  Syndicated payback:{' '}
                  <span className="font-black">{formatCurrency(dealStatus.payback)}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-secondary" />
                <span className="text-primary-foreground">
                  Syndicated remaining:{' '}
                  <span className="font-black">{formatCurrency(dealStatus.remaining)}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-chart-2" />
                <span className="text-primary-foreground">
                  Fees: <span className="font-black">{formatCurrency(dealStatus.fees)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex h-full min-h-0 w-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 shrink-0">
            <div className="text-[11px] font-bold text-foreground">Transaction Amount</div>
          </div>

          <div className="min-h-[210px] w-full flex-1 overflow-visible pr-0.5 pt-0.5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={transactionAmount}
                margin={{
                  top: 28,
                  right: transactionYAxisLayout.marginRight,
                  left: transactionYAxisLayout.marginLeft,
                  bottom: transactionYAxisLayout.marginBottom,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }} />
                <YAxis
                  width={transactionYAxisLayout.yAxisWidth}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }}
                  tickMargin={transactionYAxisLayout.tickMargin}
                  tickFormatter={(v) => formatCurrency(Number(v))}
                  domain={[0, transactionChartYMax]}
                />
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                  }}
                  labelStyle={{ color: 'var(--foreground)' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                  formatter={(value) => [
                    formatCurrency(Number(value ?? 0)),
                    'Amount',
                  ]}
                />
                <Bar dataKey="amount" radius={[2, 2, 0, 0]} barSize={26} maxBarSize={40} isAnimationActive={false}>
                  {transactionAmount.map((entry, idx) => {
                    const amounts = transactionAmount.map((x) => x.amount);
                    const peak = amounts.length ? Math.max(...amounts) : 0;
                    const isPeak = peak > 0 && entry.amount >= peak && entry.amount > 0;
                    return (
                      <Cell key={`${entry.period}-${idx}`} fill={isPeak ? 'var(--primary)' : 'var(--chart-3)'} />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        {/* Payment totals — grid body rows share extra height when column is stretched */}
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div
            className={`${SUMMARY_3COL_GRID} shrink-0 border-b border-border bg-muted/60 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-foreground`}
          >
            <div className="text-left font-bold">Line item</div>
            <div className="border-l border-border text-left pl-3 font-bold">Amount</div>
            <div className="border-l border-border text-left pl-3 font-bold">%</div>
          </div>
          <div
            className="grid min-h-0 flex-1 text-[11px]"
            style={{
              gridTemplateRows: `repeat(${paymentSummaryRows.length}, minmax(0, 1fr))`,
            }}
          >
            {paymentSummaryRows.map((row) => (
              <div
                key={row.key}
                className={`${SUMMARY_3COL_GRID} border-b border-border px-0 last:border-b-0`}
              >
                <div
                  className={`border-r border-border px-3 py-2.5 text-foreground ${row.bold ? 'font-bold' : 'font-medium'}`}
                >
                  {row.label}
                </div>
                <div className="border-r border-border px-3 py-2.5 text-left tabular-nums text-muted-foreground">
                  {formatCurrency(row.amount)}
                </div>
                <div className="px-3 py-2.5 text-left tabular-nums text-muted-foreground">{row.pct}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Outflow / Inflow — same column grid; body rows split remaining height evenly */}
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div
            className={`${SUMMARY_3COL_GRID} shrink-0 border-b border-border bg-muted/60 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-foreground`}
          >
            <div className="text-left font-bold">Line item</div>
            <div className="border-l border-border text-left pl-3 font-bold">Amount</div>
            <div className="border-l border-border text-left pl-3 font-bold">%</div>
          </div>
          <div
            className="grid min-h-0 flex-1 text-[11px]"
            style={{
              gridTemplateRows: `repeat(${flowBodyRowCount}, minmax(0, 1fr))`,
            }}
          >
            <div className="flex min-h-0 items-center border-b border-border bg-muted/40">
              <div className="px-3 py-2 text-[11px] font-bold text-foreground">Outflow</div>
            </div>
            {flowOutflowRows.map((row) => (
              <div key={row.key} className={`${SUMMARY_3COL_GRID} min-h-0 border-b border-border`}>
                <div className="border-r border-border px-3 py-2 font-medium text-foreground">{row.label}</div>
                <div className="border-r border-border px-3 py-2 text-left tabular-nums text-muted-foreground">
                  {formatCurrency(row.amount)}
                </div>
                <div className="px-3 py-2 text-left tabular-nums text-muted-foreground">{row.pct}</div>
              </div>
            ))}
            <div className="flex min-h-0 items-center border-b border-border bg-muted/40">
              <div className="px-3 py-2 text-[11px] font-bold text-foreground">Inflow</div>
            </div>
            {flowInflowRows.map((row) => (
              <div key={row.key} className={`${SUMMARY_3COL_GRID} min-h-0 border-b border-border last:border-b-0`}>
                <div className="border-r border-border px-3 py-2 font-medium text-foreground">{row.label}</div>
                <div className="border-r border-border px-3 py-2 text-left tabular-nums text-muted-foreground">
                  {formatCurrency(row.amount)}
                </div>
                <div className="px-3 py-2 text-left tabular-nums text-muted-foreground">{row.pct}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-foreground">Payout List</div>
        </div>

        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              {[
                '#',
                'TRS DATE',
                'AMOUNT',
                'DEAL ID',
                'DEAL NAME',
                'PAYMENT STATUS',
                'COMMENTS',
              ].map((h) => (
                <TableHead key={h} className="text-[10px] font-bold text-muted-foreground">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-left text-[11px] text-muted-foreground">
                  Loading payouts...
                </TableCell>
              </TableRow>
            ) : payoutRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-left text-[11px] text-muted-foreground">
                  No payouts found for this syndicator.
                </TableCell>
              </TableRow>
            ) : (
              payoutRows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="text-[11px] text-muted-foreground">{r.rowNo}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{r.trsDate}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{formatCurrency(r.amount)}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{r.dealId}</TableCell>
                  <TableCell className="text-[11px] font-semibold text-primary">{r.dealName}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    <PayoutStatusCapsule status={r.statusCode} label={r.paymentStatus} />
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{r.comments}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}




