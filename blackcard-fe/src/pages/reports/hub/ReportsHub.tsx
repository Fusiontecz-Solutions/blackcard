import React, { Suspense, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Activity, BadgeDollarSign, Briefcase, CalendarClock, CalendarDays, FileSignature, LayoutDashboard, Mail, RefreshCw, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { getReportErrorMessage, reportApi, type ReportKey } from './reportApi';
import { ReportFiltersBar } from './ReportFiltersBar';
import { useReportFilters } from './useReportFilters';
import './viz.css';

const OverviewTab = React.lazy(() => import('./tabs/OverviewTab'));
const BooksTab = React.lazy(() => import('./tabs/BooksTab'));
const CasesTab = React.lazy(() => import('./tabs/CasesTab'));
const ContractsTab = React.lazy(() => import('./tabs/ContractsTab'));
const FundingTab = React.lazy(() => import('./tabs/FundingTab'));
const DailyTab = React.lazy(() => import('./tabs/DailyTab'));
const TeamTab = React.lazy(() => import('./tabs/TeamTab'));
const SchedulesTab = React.lazy(() => import('./tabs/SchedulesTab'));
const DailyEmailTab = React.lazy(() => import('./tabs/DailyEmailTab'));
const CollectionsTab = React.lazy(() => import('./tabs/CollectionsTab'));

export type HubTab = ReportKey | 'schedules' | 'digest';

const TABS: { key: HubTab; label: string; icon: React.ComponentType<{ className?: string }>; permission?: string }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'daily', label: 'Daily', icon: CalendarDays },
  // Single-tenant CRM — Books tab hidden
  // { key: 'books', label: 'Books', icon: BookOpen },
  { key: 'cases', label: 'Cases', icon: Briefcase },
  { key: 'contracts', label: 'Contracts', icon: FileSignature },
  { key: 'funding', label: 'Funding', icon: Wallet },
  { key: 'collections', label: 'Collections', icon: BadgeDollarSign },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'digest', label: 'Daily email', icon: Mail, permission: 'reports.schedule' },
  { key: 'schedules', label: 'Schedules', icon: CalendarClock, permission: 'reports.schedule' },
];

/** Filter bar configuration per tab. */
const BAR: Record<HubTab, { people?: boolean; range?: boolean; stage?: boolean; search?: boolean; reportKey: ReportKey }> = {
  overview: { people: true, reportKey: 'overview' },
  // Daily has its own date picker and is not scoped by people.
  daily: { people: false, range: false, reportKey: 'daily' },
  books: { people: true, reportKey: 'books' },
  cases: { people: true, stage: true, reportKey: 'cases' },
  contracts: { people: true, reportKey: 'contracts' },
  funding: { people: true, reportKey: 'funding' },
  collections: { people: false, reportKey: 'collections' },
  // Team compares people, so person filters are set from within the tab.
  team: { people: false, reportKey: 'team' },
  applications: { people: true, stage: true, search: true, reportKey: 'applications' },
  schedules: { reportKey: 'overview' },
  digest: { people: false, range: false, reportKey: 'daily' },
};

function SyncPill() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['reports', 'sync-status'], queryFn: async () => (await reportApi.syncStatus()).data, refetchInterval: (q) => (q.state.data?.running ? 5000 : 60_000) });
  const d = status.data;
  const last = d?.books?.map((b) => b.lastSyncedAt).filter(Boolean).sort().at(-1);
  const lastRun = d?.runs?.[0];
  const trigger = async () => {
    try {
      await reportApi.sync({ full: false });
      toast.info('Sync started');
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['reports'] }), 6000);
      void status.refetch();
    } catch (err) {
      toast.error(getReportErrorMessage(err, 'Could not start sync'));
    }
  };
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1', d?.running && 'border-sky-500/40 text-sky-700 dark:text-sky-300')}>
        <Activity className={cn('size-3.5', d?.running && 'animate-pulse')} />
        {d?.running ? 'Syncing…' : last ? `Data as of ${new Date(last).toLocaleString()}` : 'No data synced yet'}
        {lastRun?.status === 'failed' ? <span className="text-red-600 dark:text-red-400" title={lastRun.error ?? ''}>· last run failed</span> : null}
      </span>
      {can('reports.sync') ? (
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => void trigger()} disabled={d?.running}>
          <RefreshCw className={cn('size-3.5', d?.running && 'animate-spin')} /> Sync now
        </Button>
      ) : null}
    </div>
  );
}

export default function ReportsHub() {
  const [sp, setSp] = useSearchParams();
  const { can } = usePermissions();
  const [filters, update, reset] = useReportFilters();
  const qc = useQueryClient();

  const visibleTabs = useMemo(() => TABS.filter((t) => !t.permission || can(t.permission)), [can]);
  const tab = (sp.get('tab') as HubTab) || 'overview';
  const active = visibleTabs.some((t) => t.key === tab) ? tab : 'overview';
  const setTab = (key: HubTab) =>
    setSp(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set('tab', key);
        return out;
      },
      { replace: true },
    );

  const bar = BAR[active];
  const refresh = () => void qc.invalidateQueries({ queryKey: ['reports', active] });
  const fetching = qc.isFetching({ queryKey: ['reports', active] }) > 0;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">Book performance, pipeline health, contracts, funding and daily activity.</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <SyncPill />
          <Link to="/reports/commissions" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            Commission report (legacy)
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1" aria-label="Report sections">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                selected ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {active !== 'schedules' && active !== 'digest' ? (
        <ReportFiltersBar filters={filters} onChange={update} onReset={reset} reportKey={bar.reportKey} showPeople={bar.people !== false} showRange={bar.range !== false} showStage={bar.stage} showSearch={bar.search} onRefresh={refresh} refreshing={fetching} />
      ) : null}

      <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
        {active === 'overview' && <OverviewTab filters={filters} onFilters={update} />}
        {active === 'daily' && <DailyTab filters={filters} onFilters={update} />}
        {active === 'books' && <BooksTab filters={filters} onFilters={update} />}
        {active === 'cases' && <CasesTab filters={filters} onFilters={update} />}
        {active === 'contracts' && <ContractsTab filters={filters} onFilters={update} />}
        {active === 'funding' && <FundingTab filters={filters} onFilters={update} />}
        {active === 'collections' && <CollectionsTab filters={filters} onFilters={update} />}
        {active === 'team' && <TeamTab filters={filters} onFilters={update} />}
        {active === 'schedules' && <SchedulesTab filters={filters} onFilters={update} />}
        {active === 'digest' && <DailyEmailTab filters={filters} onFilters={update} />}
      </Suspense>
    </div>
  );
}
