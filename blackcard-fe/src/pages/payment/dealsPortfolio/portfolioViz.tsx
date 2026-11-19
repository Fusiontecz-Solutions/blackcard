import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, formatCurrencyFull, formatCurrencyInt, formatDateMonthDayYear } from '@/lib/utils';
import type { DealDetailResponse, PortfolioMerchant, PortfolioTotals } from './portfolioApi';

export const PORTFOLIO_CHART = {
  brand: '#276d9c',
  brandMid: '#3792E2',
  repaid: '#2f9e6e',
  balance: '#276d9c',
  overdue: '#c24141',
  funded: '#64748b',
  gridLight: '#E5E7EB',
  gridDark: '#374151',
  tickLight: '#64748b',
  tickDark: '#94a3b8',
};

export function moneyShort(v: number) {
  return formatCurrencyInt(v, { fallback: '$0' });
}

/** color→white gradient defs for the donut rings. */
const RING_GRADS: { id: string; color: string }[] = [
  { id: 'rgRepaid', color: PORTFOLIO_CHART.repaid },
  { id: 'rgOverdue', color: PORTFOLIO_CHART.overdue },
  { id: 'rgBalance', color: PORTFOLIO_CHART.balance },
];
function PortfolioRingDefs() {
  return (
    <defs>
      {RING_GRADS.map((g) => (
        <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={g.color} stopOpacity={0.95} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.85} />
        </linearGradient>
      ))}
    </defs>
  );
}
function ringGradFor(color: string): string {
  if (color === PORTFOLIO_CHART.repaid) return 'url(#rgRepaid)';
  if (color === PORTFOLIO_CHART.overdue) return 'url(#rgOverdue)';
  if (color === PORTFOLIO_CHART.balance) return 'url(#rgBalance)';
  return color;
}

export const listStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const } },
};

function ChartTip({
  title,
  rows,
}: {
  title?: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="rounded-[10px] border border-[rgba(39,109,156,0.2)] bg-card px-3 py-2 text-xs shadow-[0_8px_30px_rgba(15,23,42,0.12)]">
      {title ? <p className="mb-1.5 font-semibold text-foreground">{title}</p> : null}
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {r.color ? <span className="size-2 rounded-sm" style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className="tabular-nums font-semibold text-foreground">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function PortfolioMixChart({
  totals,
  isDark,
}: {
  totals: PortfolioTotals;
  isDark: boolean;
}) {
  const slices = [
    { key: 'Repaid', value: Math.max(0, totals.repaid), color: PORTFOLIO_CHART.repaid },
    { key: 'Balance', value: Math.max(0, totals.balance - Math.max(0, totals.overdueAmount)), color: PORTFOLIO_CHART.balance },
    { key: 'Overdue', value: Math.max(0, totals.overdueAmount), color: PORTFOLIO_CHART.overdue },
  ].filter((s) => s.value > 0);
  const data = slices.length ? slices : [{ key: 'Empty', value: 1, color: isDark ? '#374151' : '#E5E7EB' }];
  const pct = totals.payback > 0 ? Math.round((totals.repaid / totals.payback) * 100) : 0;

  return (
    <div className="flex h-full min-h-[220px] items-center gap-4">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <PortfolioRingDefs />
            <Pie data={data} dataKey="value" nameKey="key" innerRadius={54} outerRadius={78} paddingAngle={2} stroke="none">
              {data.map((s) => (
                <Cell key={s.key} fill={ringGradFor(s.color)} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0];
                return (
                  <ChartTip
                    rows={[{ label: String(p.name), value: formatCurrencyFull(Number(p.value) || 0), color: String(p.payload?.color ?? '') }]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-foreground">{pct}%</span>
          <span className="text-[11px] text-muted-foreground">repaid</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {slices.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.key}
            </span>
            <span className="tabular-nums font-semibold text-foreground">{moneyShort(s.value)}</span>
          </div>
        ))}
        <div className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
          Payback {formatCurrencyFull(totals.payback)}
        </div>
      </div>
    </div>
  );
}

export function MerchantPaybackRing({
  funded,
  payback,
  repaid,
  balance,
  overdue = 0,
  abovePrincipal,
  isDark,
  size = 200,
}: {
  funded: number;
  payback: number;
  repaid: number;
  balance: number;
  overdue?: number;
  /** repaid − funded; when provided, shown as a final row (red when negative, green otherwise). */
  abovePrincipal?: number;
  isDark: boolean;
  /** Diameter of the ring in px (default 200). */
  size?: number;
}) {
  const overdueAmt = balance <= 0.5 ? 0 : Math.max(0, overdue);
  const remaining = Math.max(0, balance - overdueAmt);
  const slices = [
    { key: 'Repaid', value: Math.max(0, repaid), color: PORTFOLIO_CHART.repaid },
    { key: 'Overdue', value: overdueAmt, color: PORTFOLIO_CHART.overdue },
    { key: 'Balance due', value: remaining, color: PORTFOLIO_CHART.balance },
  ].filter((s) => s.value > 0.005);
  const data = slices.length ? slices : [{ key: 'Empty', value: 1, color: isDark ? '#374151' : '#E5E7EB' }];
  const pct = payback > 0 ? Math.round((repaid / payback) * 100) : 0;
  const rows = [
    { label: 'Funded', value: formatCurrencyFull(funded) },
    { label: 'Payback', value: formatCurrencyFull(payback) },
    { label: 'Repaid', value: `${formatCurrencyFull(repaid)} (${pct}%)`, color: PORTFOLIO_CHART.repaid },
    { label: 'Balance due', value: formatCurrencyFull(balance), color: PORTFOLIO_CHART.balance },
    ...(overdueAmt > 0
      ? [{ label: 'Overdue', value: formatCurrencyFull(overdueAmt), color: PORTFOLIO_CHART.overdue, danger: true }]
      : []),
    ...(abovePrincipal !== undefined
      ? [{ label: 'Above principal', value: formatCurrencyFull(abovePrincipal), negative: abovePrincipal < -0.005, positive: abovePrincipal >= -0.005 }]
      : []),
  ];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative shrink-0" style={{ height: size, width: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <PortfolioRingDefs />
            <Pie data={data} dataKey="value" nameKey="key" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none">
              {data.map((s) => (
                <Cell key={s.key} fill={ringGradFor(s.color)} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0];
                return (
                  <ChartTip
                    rows={[{ label: String(p.name), value: formatCurrencyFull(Number(p.value) || 0), color: String(p.payload?.color ?? '') }]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums leading-none text-foreground">{pct}%</span>
          <span className="mt-1 text-sm text-muted-foreground">repaid</span>
        </div>
      </div>
      <div className="w-full space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              {'color' in r && r.color ? <span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} /> : null}
              {r.label}
            </span>
            <span
              className={cn(
                'tabular-nums font-semibold',
                ('danger' in r && r.danger) || ('negative' in r && r.negative)
                  ? 'text-red-600 dark:text-red-400'
                  : 'positive' in r && r.positive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-foreground',
              )}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TopMerchantsChart({
  merchants,
  isDark,
}: {
  merchants: PortfolioMerchant[];
  isDark: boolean;
}) {
  const rows = useMemo(
    () =>
      [...merchants]
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 8)
        .map((m) => ({
          name: m.name.length > 18 ? `${m.name.slice(0, 16)}…` : m.name,
          full: m.name,
          repaid: Math.round(m.repaid),
          balance: Math.round(m.balance),
        })),
    [merchants],
  );
  const tick = isDark ? PORTFOLIO_CHART.tickDark : PORTFOLIO_CHART.tickLight;
  const grid = isDark ? PORTFOLIO_CHART.gridDark : PORTFOLIO_CHART.gridLight;

  if (!rows.length) {
    return <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No merchants on this page.</p>;
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid stroke={grid} horizontal={false} />
          <XAxis type="number" tick={{ fill: tick, fontSize: 11 }} tickFormatter={(v) => moneyShort(Number(v))} minTickGap={24} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={112} tick={{ fill: tick, fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(39, 109, 156, 0.08)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const full = String(payload[0]?.payload?.full ?? '');
              return (
                <ChartTip
                  title={full}
                  rows={[
                    { label: 'Repaid', value: formatCurrencyFull(Number(payload.find((p) => p.dataKey === 'repaid')?.value) || 0), color: PORTFOLIO_CHART.repaid },
                    { label: 'Balance', value: formatCurrencyFull(Number(payload.find((p) => p.dataKey === 'balance')?.value) || 0), color: PORTFOLIO_CHART.balance },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="repaid" stackId="a" fill={PORTFOLIO_CHART.repaid} radius={[0, 0, 0, 0]} />
          <Bar dataKey="balance" stackId="a" fill={PORTFOLIO_CHART.brand} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DealPaydownChart({
  strip,
  payback,
  isDark,
}: {
  strip: DealDetailResponse['schedule']['strip'];
  payback: number;
  isDark: boolean;
}) {
  const points = useMemo(() => {
    let paid = 0;
    const years = new Set(strip.map((p) => String(p.date ?? '').slice(0, 4)));
    return strip.map((p, i) => {
      if (p.status === 'paid') paid += p.amount;
      const repaid = Math.round(paid * 100) / 100;
      const target = Math.round(payback * 100) / 100;
      const label = formatDateMonthDayYear(p.date) || `P${i + 1}`;
      return {
        i,
        label,
        short: years.size > 1 ? label.replace(/\/\d{2}(\d{2})$/, '/$1') : label.replace(/\/\d{4}$/, ''),
        paid: repaid,
        payback: target,
        remaining: Math.max(0, Math.round((target - repaid) * 100) / 100),
        pct: target > 0 ? Math.round((repaid / target) * 100) : 0,
        status: p.status,
      };
    });
  }, [strip, payback]);
  const tick = isDark ? PORTFOLIO_CHART.tickDark : PORTFOLIO_CHART.tickLight;
  const grid = isDark ? PORTFOLIO_CHART.gridDark : PORTFOLIO_CHART.gridLight;
  if (points.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough schedule points to draw a paydown line.</p>;
  }

  const latest = points[points.length - 1];
  const targetStroke = isDark ? '#94a3b8' : '#64748b';

  return (
    <div className="w-full">
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="dealPaidFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PORTFOLIO_CHART.brand} stopOpacity={0.35} />
                <stop offset="100%" stopColor={PORTFOLIO_CHART.brand} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis
              dataKey="short"
              interval="preserveStartEnd"
              tick={{ fill: tick, fontSize: 12, fontWeight: 500 }}
              minTickGap={28}
              tickMargin={6}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: tick, fontSize: 12, fontWeight: 500 }}
              tickFormatter={(v) => formatCurrencyInt(Number(v), { fallback: '$0' })}
              width={84}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as (typeof points)[number] | undefined;
                if (!row) return null;
                return (
                  <ChartTip
                    title={row.label}
                    rows={[
                      { label: 'Repaid to date', value: formatCurrencyFull(row.paid), color: PORTFOLIO_CHART.brand },
                      { label: 'Payback target', value: formatCurrencyFull(row.payback), color: targetStroke },
                      { label: 'Remaining', value: formatCurrencyFull(row.remaining) },
                      { label: 'Percent repaid', value: `${row.pct}%` },
                      { label: 'This payment', value: row.status },
                    ]}
                  />
                );
              }}
            />
            <Area type="monotone" dataKey="payback" stroke={targetStroke} strokeDasharray="6 5" fill="none" strokeWidth={2.4} name="Payback target" />
            <Area type="monotone" dataKey="paid" stroke={PORTFOLIO_CHART.brand} fill="url(#dealPaidFill)" strokeWidth={2.6} name="Repaid" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-1 w-6 rounded-full" style={{ background: PORTFOLIO_CHART.brand }} aria-hidden />
          <span className="font-medium">Repaid</span>
          <span className="font-semibold tabular-nums">{formatCurrencyFull(latest.paid)}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0 w-6 border-t-[2.5px] border-dashed" style={{ borderColor: targetStroke }} aria-hidden />
          <span className="font-medium">Payback target</span>
          <span className="font-semibold tabular-nums">{formatCurrencyFull(latest.payback)}</span>
        </span>
      </div>
    </div>
  );
}

export function MotionPaybackBar({
  offer,
  funded,
  payback,
  repaid,
  balance,
  overdue = 0,
  size = 'md',
  showLegend = true,
  installment,
  paidCount,
  remainingCount,
  lastPaymentDate,
  nextPaymentDate,
  className,
}: {
  offer?: number;
  funded: number;
  payback: number;
  repaid: number;
  balance: number;
  overdue?: number;
  size?: 'sm' | 'md';
  showLegend?: boolean;
  installment?: number | null;
  paidCount?: number;
  remainingCount?: number;
  lastPaymentDate?: string | null;
  nextPaymentDate?: string | null;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<{ seg: 'repaid' | 'overdue' | 'balance'; rect: DOMRect } | null>(null);
  const hoverSeg = hover?.seg ?? null;
  const setHoverSeg = (seg: 'repaid' | 'overdue' | 'balance', el: Element | null) => {
    const bar = el?.parentElement;
    if (bar) setHover({ seg, rect: bar.getBoundingClientRect() });
  };
  const paidOff = balance <= 0.5;
  const overdueAmt = paidOff ? 0 : Math.max(0, overdue);
  const total = Math.max(payback, repaid + balance, 1);
  const pct = Math.min(100, Math.max(0, (repaid / total) * 100));
  const overduePct = Math.min(100 - pct, Math.max(0, (overdueAmt / total) * 100));
  const remainingPct = Math.max(0, 100 - pct - overduePct);
  const principalPct = Math.min(100, Math.max(0, (funded / total) * 100));
  const height = size === 'sm' ? 'h-2' : 'h-2.5';
  const balanceDue = Math.max(0, balance - overdueAmt);
  const fmtD = (v: string | null | undefined) => (v ? formatDateMonthDayYear(v) : '—');

  const tip =
    hoverSeg === 'repaid'
      ? {
          title: 'Repaid',
          color: PORTFOLIO_CHART.repaid,
          left: pct / 2,
          rows: [
            ['Repaid', `${formatCurrencyFull(repaid)} (${Math.round(pct)}%)`],
            ...(installment ? [['Installment', formatCurrencyFull(installment)]] : []),
            ...(paidCount !== undefined ? [['Installments paid', String(paidCount)]] : []),
            ...(remainingCount !== undefined ? [['Installments left', String(remainingCount)]] : []),
            ...(lastPaymentDate !== undefined ? [['Last payment', fmtD(lastPaymentDate)]] : []),
          ],
        }
      : hoverSeg === 'overdue'
        ? {
            title: 'Overdue',
            color: '#ef4444',
            left: pct + overduePct / 2,
            rows: [['Overdue amount', formatCurrencyFull(overdueAmt)]],
          }
        : hoverSeg === 'balance'
          ? {
              title: 'Balance due',
              color: '#38bdf8',
              left: pct + overduePct + remainingPct / 2,
              rows: [
                ['Balance due', formatCurrencyFull(balanceDue)],
                ...(nextPaymentDate !== undefined ? [['Next payment', fmtD(nextPaymentDate)]] : []),
              ],
            }
          : null;

  return (
    <div className={cn('relative min-w-0', className)}>
      <div
        className={cn('relative w-full overflow-hidden rounded-full bg-muted', height)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={`${Math.round(pct)}% of payback repaid`}
        onMouseLeave={() => setHover(null)}
      >
        <motion.div
          className="absolute inset-y-0 left-0 cursor-pointer rounded-full"
          style={{ background: PORTFOLIO_CHART.repaid }}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          onMouseEnter={(e) => setHoverSeg('repaid', e.currentTarget)}
        />
        {remainingPct > 0 ? (
          <div
            className="absolute inset-y-0 cursor-pointer bg-sky-200 dark:bg-sky-900/70"
            style={{ left: `${pct + overduePct}%`, width: `${remainingPct}%` }}
            onMouseEnter={(e) => setHoverSeg('balance', e.currentTarget)}
          />
        ) : null}
        {overduePct > 0 ? (
          <motion.div
            className="absolute inset-y-0 cursor-pointer bg-red-500"
            style={{ left: `${pct}%` }}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${overduePct}%` }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            onMouseEnter={(e) => setHoverSeg('overdue', e.currentTarget)}
          />
        ) : null}
        {funded > 0 && principalPct < 100 ? (
          <div className="pointer-events-none absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${principalPct}%` }} aria-hidden />
        ) : null}
      </div>
      {tip && hover ? createPortal(
        <div
          className="pointer-events-none fixed z-50 w-56 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-[0_8px_30px_rgba(15,23,42,0.15)]"
          style={{
            left: Math.min(
              Math.max(8, hover.rect.left + (hover.rect.width * tip.left) / 100 - 112),
              window.innerWidth - 232,
            ),
            top: hover.rect.bottom + 8,
          }}
        >
          <p className="mb-1.5 inline-flex items-center gap-1.5 font-semibold text-foreground">
            <span className="size-2.5 rounded-sm" style={{ background: tip.color }} />
            {tip.title}
          </p>
          {tip.rows.map(([label, value]) => (
            <p key={label} className="flex items-center justify-between gap-4 py-0.5">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold tabular-nums text-foreground">{value}</span>
            </p>
          ))}
        </div>,
        document.body,
      ) : null}
      {showLegend ? (
        <div className={cn('mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground', size === 'sm' ? 'text-xs' : 'text-sm')}>
          <span title="Funded — approved funded amount for the deal">Funded <span className="font-semibold tabular-nums text-foreground">{formatCurrencyFull(funded)}</span></span>
          <span title="Payback total — funded amount plus fees the merchant must repay">Payback <span className="font-semibold tabular-nums text-foreground">{formatCurrencyFull(payback)}</span></span>
          <span title="Repaid — money collected so far, as a % of payback">Repaid <span className="font-semibold tabular-nums text-foreground">{formatCurrencyFull(repaid)}</span> ({Math.round(pct)}%)</span>
          <span title="Balance due — payback still outstanding">Balance due <span className="font-semibold tabular-nums text-foreground">{formatCurrencyFull(balance)}</span></span>
          {overdueAmt > 0 ? <span className="font-semibold tabular-nums text-red-600 dark:text-red-400" title="Overdue — payments that were due and not collected">Overdue {formatCurrencyFull(overdueAmt)}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
