/**
 * Syndicators dashboard for internal roles: KPIs from `GET /syndicators/admin-summary`,
 * repayment and funding aggregates from syndicator wallet transactions.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
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
import type { TooltipContentProps } from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { Users, Coins, TrendingUp, Wallet, AlertTriangle, BadgeDollarSign } from 'lucide-react';

import { CornerSummaryCard } from '@/pages/commissionPortal/CornerSummaryCard';
import SyndicatorsSectionTabs from '@/components/syndicators/SyndicatorsSectionTabs';
import { axiosGet } from '@/redux/axios';
import { formatCurrency } from '@/lib/utils';

type PieTooltipPayload = {
  name: string;
  value: number;
  color: string;
};

type WalletPoint = { date: string; amount: string };

type AdminSummaryPayload = {
  totalSyndicators: number;
  amountSyndicated: number;
  commissionAmount: number;
  paybackAmountSyndicated: number;
  managementFeeToDate: number;
  remainingAmount: number;
  collectedAmount: number;
  defaultedAmount: number;
  REPAYMENT: WalletPoint[];
  Funding: WalletPoint[];
};

/** Circular KPI badge (matches admin / commission portal stat tiles). */
function StatIconBadge({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-white ${className}`}
    >
      {children}
    </span>
  );
}

/** Platform syndicator accent (matches admin nav / CRM blue) */
const primaryColor = 'var(--primary)';
const secondaryColor = 'var(--chart-4)';

/** Horizontal color→white gradients for the dashboard bar charts. */
const BAR_GRADIENTS: { id: string; color: string }[] = [
  { id: 'gInvested', color: '#86efac' }, // light green
  { id: 'gExpected', color: '#15803d' }, // dark green
  { id: 'gCollected', color: '#22c55e' }, // medium green
  { id: 'gOutstanding', color: '#fca5a5' }, // light red
  { id: 'gAtrisk', color: '#ef4444' }, // red
  { id: 'gCommission', color: '#8b5cf6' }, // violet
  { id: 'gMgmt', color: '#f59e0b' }, // amber
];

function BarGradientDefs() {
  return (
    <defs>
      {BAR_GRADIENTS.map((g) => (
        <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={g.color} stopOpacity={0.95} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.9} />
        </linearGradient>
      ))}
    </defs>
  );
}

/** Donut palette (requested): greens for money in/held, reds for fees/default. */
const PIE_COLOR_BY_NAME: Record<string, string> = {
  Syndicated: '#22c55e', // green (readable)
  'Syndicated RTR': '#22c55e',
  Invested: '#22c55e',
  Remaining: '#15803d', // dark green
  Paid: '#166534', // dark green
  Commission: '#f87171', // light red
  'Mgmt Fees Up To Date': '#dc2626', // deeper red (2nd shade)
  Default: '#b91c1c', // dark red
};
const pieColor = (name: string) => PIE_COLOR_BY_NAME[name] ?? '#86efac';
const pieGradId = (name: string) => `pg_${name.replace(/[^a-zA-Z0-9]/g, '') || 'x'}`;

function PieGradientDefs() {
  const seen = new Set<string>();
  const items = Object.keys(PIE_COLOR_BY_NAME).filter((name) => {
    const id = pieGradId(name);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return (
    <defs>
      {items.map((name) => (
        <linearGradient key={name} id={pieGradId(name)} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={pieColor(name)} stopOpacity={0.95} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.85} />
        </linearGradient>
      ))}
    </defs>
  );
}

const PieCustomTooltip: React.FC<Partial<TooltipContentProps<number, string>>> = ({ active, payload }) => {
  if (active && payload?.length) {
    const entry = payload[0]!.payload as PieTooltipPayload;
    const bgColor = entry.color || primaryColor;
    return (
      <div className="flex items-center" style={{ position: 'relative', left: 120 }}>
        <div
          style={{
            position: 'relative',
            left: 5,
            width: 0,
            height: 0,
            borderTop: '12px solid transparent',
            borderBottom: '12px solid transparent',
            borderRight: `14px solid ${bgColor}`,
            marginRight: 2,
          }}
        />
        <div
          style={{
            background: bgColor,
            color: 'var(--primary-foreground)',
            borderRadius: 8,
            padding: '10px 18px',
            fontWeight: 'bold',
            fontSize: '17px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            minWidth: 70,
            textAlign: 'center',
          }}
        >
          <div className="text-sm font-light">{entry.name}</div>
          {formatCurrency(entry.value)}
        </div>
      </div>
    );
  }
  return null;
};

export default function AdminSyndicatorsDashboard() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdminSummaryPayload | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axiosGet('/syndicators/admin-summary');
      const payload = res?.data?.data ?? res?.data;
      if (!payload || typeof payload.totalSyndicators !== 'number') {
        setError('Unexpected response');
        return;
      }
      setSummary(payload as AdminSummaryPayload);
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' &&
        e !== null &&
        'response' in e &&
        typeof (e as { response?: { data?: { message?: string } } }).response?.data?.message ===
          'string'
          ? String((e as { response: { data: { message: string } } }).response.data.message)
          : 'Failed to load syndicator overview';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const totalInvestment = summary?.amountSyndicated ?? 0;
  const totalpaybackSyndicated = summary?.paybackAmountSyndicated ?? 0;
  const totalremaining = summary?.remainingAmount ?? 0;
  const totalCommission = summary?.commissionAmount ?? 0;
  const totalManagement = summary?.managementFeeToDate ?? 0;
  const totalCollected = summary?.collectedAmount ?? 0;
  const totalDefaultedAmount = summary?.defaultedAmount ?? 0;
  const totalSyndicators = summary?.totalSyndicators ?? 0;

  const datapie1 = useMemo(
    () => [
      { name: 'Syndicated', value: totalInvestment, color: primaryColor },
      { name: 'Commission', value: totalCommission, color: secondaryColor },
    ],
    [totalInvestment, totalCommission],
  );

  const datapie2 = useMemo(
    () => [
      { name: 'Syndicated RTR', value: totalpaybackSyndicated, color: primaryColor },
      { name: 'Commission', value: totalCommission, color: 'var(--chart-2)' },
      { name: 'Mgmt Fees Up To Date', value: totalManagement, color: 'var(--destructive)' },
      { name: 'Remaining', value: totalremaining, color: 'var(--chart-5)' },
    ],
    [totalpaybackSyndicated, totalCommission, totalManagement, totalremaining],
  );

  const datapie3 = useMemo(
    () => [
      { name: 'Invested', value: totalInvestment, color: primaryColor },
      { name: 'Default', value: totalDefaultedAmount, color: 'var(--destructive)' },
      { name: 'Paid', value: totalCollected, color: secondaryColor },
    ],
    [totalInvestment, totalDefaultedAmount, totalCollected],
  );

  const totalSyndicateInvested = totalInvestment + totalCommission;
  const totalSyndicateRTR =
    totalpaybackSyndicated + totalCommission + totalManagement + totalremaining;

  // Populated snapshots that replace the (empty) daily cash-flow / payouts series.
  // Requested palette: invested light green, expected RTR dark green,
  // collected medium green, outstanding light red. Each bar fades to white.
  const capitalData = useMemo(
    () => [
      { name: 'Invested', value: totalInvestment, grad: 'gInvested' },
      { name: 'Expected RTR', value: totalpaybackSyndicated, grad: 'gExpected' },
      { name: 'Collected', value: totalCollected, grad: 'gCollected' },
      { name: 'Outstanding', value: totalremaining, grad: 'gOutstanding' },
    ],
    [totalInvestment, totalpaybackSyndicated, totalCollected, totalremaining],
  );

  const recoveryData = useMemo(
    () => [
      { name: 'Collected', value: totalCollected, grad: 'gCollected' },
      { name: 'Outstanding', value: totalremaining, grad: 'gOutstanding' },
      { name: 'At risk', value: totalDefaultedAmount, grad: 'gAtrisk' },
      { name: 'Commission', value: totalCommission, grad: 'gCommission' },
      { name: 'Mgmt fees', value: totalManagement, grad: 'gMgmt' },
    ],
    [totalCollected, totalremaining, totalDefaultedAmount, totalCommission, totalManagement],
  );


  if (loading) {
    return (
      <div className="w-full space-y-4 px-4 pb-4 pt-6">
        <SyndicatorsSectionTabs />
        <p className="text-sm text-muted-foreground">Loading syndicator dashboard…</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="w-full space-y-4 px-4 pb-4 pt-6">
        <SyndicatorsSectionTabs />
        <p className="text-sm text-destructive">{error ?? 'Unable to load data.'}</p>
      </div>
    );
  }

  return (
    <div className="w-full px-4 pb-4 pt-6">
      <SyndicatorsSectionTabs />

      <h2 className="mb-4 mt-5 text-xl font-semibold tracking-tight md:mt-6">
        Syndicator Dashboard
      </h2>

      {/* KPI row — clickable tiles; each drills into the syndicators breakdown */}
      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {([
          {
            title: 'TOTAL SYNDICATORS',
            Icon: Users,
            iconClass: 'bg-[image:var(--brand-gradient)]',
            countValue: String(totalSyndicators),
            countSuffix: totalSyndicators === 1 ? 'Syndicator' : 'Syndicators',
            footLeft: 'Total syndicated principal',
            amountValue: formatCurrency(totalInvestment),
            to: '/syndicators/syndicators-list',
          },
          {
            title: 'TOTAL INVESTMENT',
            Icon: Coins,
            iconClass: 'bg-emerald-600',
            countValue: formatCurrency(totalInvestment),
            countSuffix: 'Syndicated',
            footLeft: 'Expected RTR',
            amountValue: formatCurrency(totalpaybackSyndicated),
            to: '/syndicators/syndications?title=Syndicated+deals',
          },
          {
            title: 'EXPECTED RTR',
            Icon: TrendingUp,
            iconClass: 'bg-sky-600',
            countValue: formatCurrency(totalpaybackSyndicated),
            countSuffix: 'Payback',
            footLeft: 'Outstanding remaining',
            amountValue: formatCurrency(totalremaining),
            to: '/syndicators/syndications?title=Expected+RTR',
          },
          {
            title: 'TOTAL REMAINING',
            Icon: Wallet,
            iconClass: 'bg-primary',
            countValue: formatCurrency(totalremaining),
            countSuffix: 'Outstanding',
            footLeft: 'Commission to date',
            amountValue: formatCurrency(totalCommission),
            to: '/syndicators/syndications?title=Outstanding+syndications',
          },
          {
            title: 'DEFAULT RTR',
            Icon: AlertTriangle,
            iconClass: 'bg-rose-600',
            countValue: formatCurrency(totalDefaultedAmount),
            countSuffix: 'At risk',
            footLeft: 'Collected recoveries',
            amountValue: formatCurrency(totalCollected),
            to: '/syndicators/syndications?title=At-risk+syndications',
          },
          {
            title: 'TOTAL COMMISSION',
            Icon: BadgeDollarSign,
            iconClass: 'bg-green-600',
            countValue: formatCurrency(totalCommission),
            countSuffix: 'Earned',
            footLeft: 'Management fees to date',
            amountValue: formatCurrency(totalManagement),
            to: '/syndicators/syndications?title=Commission',
          },
        ] as const).map((c) => (
          <div
            key={c.title}
            role="button"
            tabIndex={0}
            onClick={() => navigate(c.to)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(c.to);
              }
            }}
            className="h-full cursor-pointer rounded-xl transform-gpu transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.99] hover:ring-2 hover:ring-[var(--brand)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
          >
            <CornerSummaryCard
              isDark={isDark}
              title={c.title}
              icon={
                <StatIconBadge className={c.iconClass}>
                  <c.Icon className="size-4" aria-hidden />
                </StatIconBadge>
              }
              iconSize={20}
              countValue={c.countValue}
              countSuffix={c.countSuffix}
              footLeft={c.footLeft}
              amountValue={c.amountValue}
            />
          </div>
        ))}
      </section>

      <div className="mb-8 grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="cyber-card flex h-auto w-full flex-col"
        >
          <div className="flex h-full w-full flex-col rounded-2xl border border-border bg-card px-6 py-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-1 flex w-full items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Capital at work</h2>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              How deployed capital stands across the portfolio.
            </p>
            <div className="h-[300px] flex-grow">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={capitalData}
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                  barCategoryGap={18}
                >
                  <BarGradientDefs />
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tickFormatter={(value) => formatCurrency(Number(value))}
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value ?? 0))}
                    contentStyle={{
                      background: isDark ? '#141517' : '#ffffff',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                    {capitalData.map((d, i) => (
                      <Cell key={i} fill={`url(#${d.grad})`} stroke={BAR_GRADIENTS.find((g) => g.id === d.grad)?.color} strokeWidth={0.5} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="cyber-card flex h-auto w-full flex-col"
        >
          <div className="flex h-full w-full flex-col rounded-2xl border border-border bg-card px-6 py-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-1 flex w-full items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Recovery &amp; risk</h2>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Collected vs outstanding, at-risk exposure and fees earned.
            </p>
            <div className="h-[300px] flex-grow">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={recoveryData}
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                  barCategoryGap={14}
                >
                  <BarGradientDefs />
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tickFormatter={(value) => formatCurrency(Number(value))}
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value ?? 0))}
                    contentStyle={{
                      background: isDark ? '#141517' : '#ffffff',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
                    {recoveryData.map((d, i) => (
                      <Cell key={i} fill={`url(#${d.grad})`} stroke={BAR_GRADIENTS.find((g) => g.id === d.grad)?.color} strokeWidth={0.5} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="cyber-card flex h-full w-full flex-col rounded-2xl border border-border bg-card/80 px-6 py-6 shadow-sm backdrop-blur transition-all hover:shadow-md"
        >
          <h4 className="self-start pl-[1rem] text-base font-bold text-foreground">Total Syndicate Invested</h4>
          <div className="w-full pl-[1rem] text-left">
            <p className="text-lg font-semibold text-primary">
              {formatCurrency(totalSyndicateInvested || 0)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center">
            <PieChart width={300} height={230}>
              <PieGradientDefs />
              <Pie
                data={datapie1}
                cx={150}
                cy={105}
                innerRadius={40}
                outerRadius={80}
                paddingAngle={0}
                dataKey="value"
              >
                {datapie1.map((entry) => (
                  <Cell
                    key={`cell-${entry.name}`}
                    fill={`url(#${pieGradId(entry.name)})`}
                    stroke={pieColor(entry.name)}
                    strokeWidth={0.5}
                  />
                ))}
              </Pie>
              <Tooltip content={<PieCustomTooltip />} />
            </PieChart>
            <div className="flex flex-col items-start justify-center">
              {datapie1.map((entry) => (
                <div key={entry.name} className="mb-2 flex items-center justify-start">
                  <div
                    className="mr-2 h-3 w-3 rounded"
                    style={{ backgroundColor: pieColor(entry.name) }}
                  />
                  <span className="w-[50px] text-right text-sm font-bold">
                    {totalSyndicateInvested
                      ? `${Math.round((entry.value / totalSyndicateInvested) * 1000) / 10}%`
                      : '0%'}
                  </span>
                  <span className="ml-4 text-sm font-semibold">
                    {entry.name}: {formatCurrency(entry.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="cyber-card flex h-full w-full flex-col rounded-2xl border border-border bg-card/80 px-6 py-6 shadow-sm backdrop-blur transition-all hover:shadow-md"
        >
          <h4 className="self-start pl-[1rem] text-base font-bold text-foreground">Total Syndicate RTR</h4>
          <div className="w-full pl-[1rem] text-left">
            <p className="text-lg font-semibold text-primary">
              {formatCurrency(totalSyndicateRTR || 0)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center">
            <PieChart width={300} height={230}>
              <PieGradientDefs />
              <Pie
                data={datapie2}
                cx={150}
                cy={105}
                innerRadius={40}
                outerRadius={80}
                paddingAngle={0}
                dataKey="value"
              >
                {datapie2.map((entry) => (
                  <Cell
                    key={`cell-${entry.name}`}
                    fill={`url(#${pieGradId(entry.name)})`}
                    stroke={pieColor(entry.name)}
                    strokeWidth={0.5}
                  />
                ))}
              </Pie>
              <Tooltip content={<PieCustomTooltip />} />
            </PieChart>
            <div className="flex flex-col items-start justify-center">
              {datapie2.map((entry) => (
                <div key={entry.name} className="mb-2 flex items-center justify-start">
                  <div
                    className="mr-2 h-3 w-3 rounded"
                    style={{ backgroundColor: pieColor(entry.name) }}
                  />
                  <span className="w-[50px] text-right text-sm font-bold">
                    {totalSyndicateRTR
                      ? `${Math.round((entry.value / totalSyndicateRTR) * 1000) / 10}%`
                      : '0%'}
                  </span>
                  <span className="ml-4 text-sm font-semibold" style={{ color: pieColor(entry.name) }}>
                    {entry.name}: {formatCurrency(entry.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="cyber-card flex h-full w-full flex-col rounded-2xl border border-border bg-card/80 px-6 py-6 shadow-sm backdrop-blur transition-all hover:shadow-md"
        >
          <h4 className="mb-6 self-start pl-[1rem] text-base font-bold text-foreground">Status</h4>
          <div className="flex flex-col items-center justify-center">
            <PieChart width={300} height={225}>
              <PieGradientDefs />
              <Pie
                data={datapie3}
                cx={150}
                cy={105}
                innerRadius={40}
                outerRadius={80}
                paddingAngle={0}
                dataKey="value"
              >
                {datapie3.map((entry) => (
                  <Cell
                    key={`cell-${entry.name}`}
                    fill={`url(#${pieGradId(entry.name)})`}
                    stroke={pieColor(entry.name)}
                    strokeWidth={0.5}
                  />
                ))}
              </Pie>
              <Tooltip content={<PieCustomTooltip />} />
            </PieChart>
            <div className="flex flex-col items-start justify-center">
              {datapie3.map((entry) => (
                <div key={entry.name} className="mb-2 flex items-center justify-center">
                  <div
                    className="mr-2 h-3 w-3 rounded"
                    style={{ backgroundColor: pieColor(entry.name) }}
                  />
                  <span className="ml-4 text-sm font-bold" style={{ color: pieColor(entry.name) }}>
                    {entry.name}: {formatCurrency(entry.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
