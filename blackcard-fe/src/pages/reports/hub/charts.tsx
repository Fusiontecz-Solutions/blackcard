/**
 * Shared chart primitives for the Reports hub.
 * Conventions: text never wears series colour; thin marks; one axis; a legend for
 * two or more series; every plot has a hover tooltip; every chart offers a table view.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus, Table2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import './viz.css';
import { SEQ, SERIES, fmtBucket, fmtInt } from './format';

/** Recharts 3 types data keys against the row type; charts here take plain string-keyed rows. */
type Row = Record<string, string | number | null | undefined>;

// ---------------------------------------------------------------------------
// Stat tile + delta
// ---------------------------------------------------------------------------

export function Delta({ current, previous, invert = false, format = 'pct' }: { current: number | null | undefined; previous: number | null | undefined; invert?: boolean; format?: 'pct' | 'pts' }) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  const diff = format === 'pts' ? (current - previous) * 100 : previous === 0 ? (current === 0 ? 0 : null) : (current - previous) / previous;
  if (diff === null) return <span className="text-xs text-muted-foreground">new</span>;
  const good = invert ? diff < 0 : diff > 0;
  const Icon = diff === 0 ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = diff === 0 ? 'text-muted-foreground' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', tone)}>
      <Icon className="size-3.5" aria-hidden />
      {format === 'pts' ? `${Math.abs(diff).toFixed(1)} pts` : `${Math.abs(diff * 100).toFixed(0)}%`}
      <span className="sr-only">{diff > 0 ? 'up' : diff < 0 ? 'down' : 'unchanged'} versus previous period</span>
    </span>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  delta,
  onClick,
  loading,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  onClick?: () => void;
  loading?: boolean;
  accent?: 'good' | 'warning' | 'critical' | 'neutral';
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card p-4 text-left',
        onClick && 'transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <span className={cn('truncate text-xl font-semibold tabular-nums text-foreground 2xl:text-2xl', accent === 'critical' && 'text-red-600 dark:text-red-400', accent === 'warning' && 'text-amber-600 dark:text-amber-400', accent === 'good' && 'text-emerald-600 dark:text-emerald-400')}>
          {value}
        </span>
      )}
      {(sub || delta) && (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {delta}
          {sub}
        </span>
      )}
    </Comp>
  );
}

// ---------------------------------------------------------------------------
// Chart card with legend + table view toggle
// ---------------------------------------------------------------------------

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
  format?: (v: number) => string;
}

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  table,
  legend,
  loading,
  empty,
  className,
  height = 260,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Optional table representation (accessibility + "table view" toggle). */
  table?: ReactNode;
  legend?: SeriesDef[];
  loading?: boolean;
  empty?: boolean;
  className?: string;
  height?: number;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className={cn('viz-root flex min-w-0 flex-col rounded-xl border border-border bg-card', className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          {table ? (
            <button
              type="button"
              onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={view === 'chart' ? 'Show as table' : 'Show as chart'}
              title={view === 'chart' ? 'Table view' : 'Chart view'}
            >
              {view === 'chart' ? <Table2 className="size-4" /> : <BarChart3 className="size-4" />}
            </button>
          ) : null}
        </div>
      </header>
      {legend && legend.length > 1 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 text-xs text-muted-foreground" aria-label="Legend">
          {legend.map((s, i) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color ?? SERIES[i % SERIES.length] }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="px-2 pb-3 pt-2" style={{ minHeight: height }}>
        {loading ? (
          <div className="flex h-full items-center justify-center px-2" style={{ height }}>
            <Skeleton className="h-[85%] w-full" />
          </div>
        ) : empty ? (
          <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
            No data for this period
          </div>
        ) : view === 'table' && table ? (
          <div className="overflow-x-auto px-2">{table}</div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

type TooltipEntry = { dataKey?: string | number; name?: string | number; value?: number | string; color?: string };

export function VizTooltip({ active, label, payload, series, labelFormatter }: { active?: boolean; label?: string | number; payload?: TooltipEntry[]; series: SeriesDef[]; labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(series.map((s) => [s.key, s]));
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{labelFormatter ? labelFormatter(String(label)) : String(label)}</p>
      <ul className="space-y-0.5">
        {payload.map((p, i) => {
          const def = byKey.get(String(p.dataKey));
          const v = typeof p.value === 'number' ? p.value : Number(p.value ?? 0);
          return (
            <li key={`${String(p.dataKey)}-${i}`} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: p.color ?? def?.color }} aria-hidden />
                {def?.label ?? String(p.name ?? p.dataKey)}
              </span>
              <strong className="tabular-nums text-foreground">{def?.format ? def.format(v) : fmtInt(v)}</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend (line / area)
// ---------------------------------------------------------------------------

export function TrendChart<T extends object>({
  data,
  xKey,
  series,
  area = false,
  yFormat,
  xFormat = fmtBucket,
}: {
  data: T[];
  xKey: string;
  series: SeriesDef[];
  area?: boolean;
  yFormat?: (v: number) => string;
  xFormat?: (v: string) => string;
}) {
  const gid = useId();
  const defs = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length] }));
  const Chart = area ? AreaChart : LineChart;
  const rows = data as unknown as Row[];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="0" />
        <XAxis dataKey={xKey} tickFormatter={(v: string) => xFormat(v)} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v: number) => (yFormat ? yFormat(v) : fmtInt(v))} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<VizTooltip series={defs} labelFormatter={xFormat} />} cursor={{ strokeWidth: 1 }} />
        {defs.map((s) =>
          area ? (
            <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} fill={`url(#${gid}-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--viz-surface)' }} isAnimationActive={false} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--viz-surface)' }} isAnimationActive={false} />
          ),
        )}
        {area ? (
          <defs>
            {defs.map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
        ) : null}
      </Chart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Bars (vertical columns or horizontal bars, optional stacking)
// ---------------------------------------------------------------------------

export function BarsChart<T extends object>({
  data,
  xKey,
  series,
  horizontal = false,
  stacked = false,
  yFormat,
  xFormat,
  colorByIndex = false,
  onBarClick,
}: {
  data: T[];
  xKey: string;
  series: SeriesDef[];
  horizontal?: boolean;
  stacked?: boolean;
  yFormat?: (v: number) => string;
  xFormat?: (v: string) => string;
  /** Single-series ordinal ramp per category (sequential hue). */
  colorByIndex?: boolean;
  onBarClick?: (row: T) => void;
}) {
  const defs = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length] }));
  const rows = data as unknown as Row[];
  const catAxisProps = { dataKey: xKey, tickLine: false, axisLine: false, tickFormatter: xFormat ? (v: string) => xFormat(v) : undefined };
  const numFmt = (v: number) => (yFormat ? yFormat(v) : fmtInt(v));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barCategoryGap={horizontal ? 6 : '25%'}>
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} strokeDasharray="0" />
        {horizontal ? (
          <>
            <XAxis type="number" tickFormatter={numFmt} tickLine={false} axisLine={false} />
            <YAxis type="category" {...catAxisProps} width={120} interval={0} />
          </>
        ) : (
          <>
            <XAxis type="category" {...catAxisProps} minTickGap={16} interval={0} />
            <YAxis type="number" tickFormatter={numFmt} tickLine={false} axisLine={false} width={56} />
          </>
        )}
        <Tooltip content={<VizTooltip series={defs} labelFormatter={xFormat} />} cursor={{ fill: 'var(--viz-grid)' }} />
        {defs.map((s, si) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId={stacked ? 'stack' : undefined}
            fill={s.color}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={horizontal ? 22 : 40}
            isAnimationActive={false}
            onClick={onBarClick ? (d: unknown) => onBarClick((d as { payload: T }).payload) : undefined}
            className={onBarClick ? 'cursor-pointer' : undefined}
            stroke="var(--viz-surface)"
            strokeWidth={stacked ? 1 : 0}
          >
            {colorByIndex && si === 0
              ? rows.map((_, i) => <Cell key={i} fill={SEQ[Math.min(SEQ.length - 1, Math.max(0, SEQ.length - 1 - Math.floor((i / Math.max(1, data.length - 1)) * (SEQ.length - 1))))]} />)
              : null}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Simple data table used for "table view" of charts and small breakdowns
// ---------------------------------------------------------------------------

export function MiniTable({ columns, rows, keyField }: { columns: { key: string; label: string; align?: 'left' | 'right'; format?: (v: unknown, row: Record<string, unknown>) => ReactNode }[]; rows: Record<string, unknown>[]; keyField?: string }) {
  const id = useId();
  const cols = useMemo(() => columns, [columns]);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          {cols.map((c) => (
            <th key={c.key} scope="col" className={cn('px-2 py-1.5 font-medium', c.align === 'right' ? 'text-right' : 'text-left')}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={String(keyField ? r[keyField] : `${id}-${i}`)} className="border-b border-border/60 last:border-0">
            {cols.map((c) => (
              <td key={c.key} className={cn('px-2 py-1.5 text-foreground', c.align === 'right' && 'text-right tabular-nums')}>
                {c.format ? c.format(r[c.key], r) : String(r[c.key] ?? '')}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={cols.length} className="px-2 py-4 text-center text-muted-foreground">
              No data
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** Horizontal proportion bar (part-to-whole) with legend; use instead of pies. */
export function ShareBar({ parts, format = fmtInt }: { parts: { key: string; label: string; value: number; color?: string }[]; format?: (v: number) => string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="viz-root space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.map((p) => `${p.label} ${format(p.value)}`).join(', ')}>
        {parts.map((p, i) =>
          p.value > 0 ? (
            <div key={p.key} style={{ width: `${(p.value / Math.max(1, total)) * 100}%`, background: p.color ?? SERIES[i % SERIES.length], marginRight: 2 }} title={`${p.label}: ${format(p.value)}`} />
          ) : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p, i) => (
          <li key={p.key} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: p.color ?? SERIES[i % SERIES.length] }} aria-hidden />
            {p.label}
            <strong className="tabular-nums text-foreground">{format(p.value)}</strong>
            <span>({total ? Math.round((p.value / total) * 100) : 0}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
