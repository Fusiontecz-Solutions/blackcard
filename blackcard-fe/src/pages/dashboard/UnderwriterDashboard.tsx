import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '@/redux/store';
import { getApplicationStats } from '@/redux/actions/applicationActions';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { formatNumber, formatCurrency } from '@/lib/utils';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  FileText,
  XCircle,
} from 'lucide-react';

export default function UnderwriterDashboard() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { data: statsData } = useSelector((state: RootState) => state.applicationStats);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    dispatch(getApplicationStats());
  }, [dispatch]);

  const stats = useMemo(() => {
    const s = statsData;
    const total =
      (s?.inProcess?.count ?? 0) +
      (s?.underwriting?.count ?? 0) +
      (s?.funded?.count ?? 0) +
      (s?.approved?.count ?? 0) +
      (s?.rejected?.count ?? 0);
    const b = (count: number, totalAmt: number) => ({
      value: formatNumber(count),
      money: formatCurrency(totalAmt),
    });
    return [
      {
        title: 'Total Assigned',
        value: formatNumber(total),
        money: formatCurrency(0),
        icon: FileText,
        iconBg: 'bg-blue-100 dark:bg-blue-900',
      },
      {
        title: 'In Progress',
        ...b(s?.inProcess?.count ?? 0, s?.inProcess?.totalAmount ?? 0),
        icon: Clock,
        iconBg: 'bg-amber-100 dark:bg-amber-900',
      },
      {
        title: 'Approved',
        ...b(s?.approved?.count ?? 0, s?.approved?.totalAmount ?? 0),
        icon: CheckCircle2,
        iconBg: 'bg-emerald-100 dark:bg-emerald-900',
      },
      {
        title: 'Rejected',
        ...b(s?.rejected?.count ?? 0, s?.rejected?.totalAmount ?? 0),
        icon: XCircle,
        iconBg: 'bg-rose-100 dark:bg-rose-900',
      },
      {
        title: 'Funded',
        value: formatNumber(s?.funded?.count ?? 0),
        money: formatCurrency(s?.funded?.totalAmount ?? 0),
        icon: Briefcase,
        iconBg: 'bg-indigo-100 dark:bg-indigo-900',
      },
    ];
  }, [statsData]);

  return (
    <div className="min-h-screen flex-1 bg-background px-6 py-6 md:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Scrubbing Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Overview of your application pipeline
            </p>
          </div>
          <Button
            onClick={() => navigate('/applications')}
            className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white shrink-0"
          >
            <Briefcase className="mr-2 h-4 w-4" />
            View Applications
          </Button>
        </div>

        {/* Workflow state totals (backend `/applications/stats`, role-scoped) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div
            className={`rounded-lg border shadow-sm px-4 py-4 ${
              isDark
                ? 'bg-[#141517] border-[#374151]'
                : 'bg-card border-[#FDFDFD]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Pending</p>
                <p className={`mt-1 text-2xl font-semibold ${isDark ? 'text-white' : 'text-[var(--brand)]'}`}>
                  {formatNumber(statsData?.workflowPending?.count ?? 0)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatCurrency(statsData?.workflowPending?.totalAmount ?? 0)}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900">
                <Clock className="h-5 w-5 text-foreground" />
              </div>
            </div>
          </div>
          <div
            className={`rounded-lg border shadow-sm px-4 py-4 ${
              isDark
                ? 'bg-[#141517] border-[#374151]'
                : 'bg-card border-[#FDFDFD]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground font-medium">In Progress</p>
                <p className={`mt-1 text-2xl font-semibold ${isDark ? 'text-white' : 'text-[var(--brand)]'}`}>
                  {formatNumber(statsData?.workflowInProgress?.count ?? 0)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatCurrency(statsData?.workflowInProgress?.totalAmount ?? 0)}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900">
                <Clock className="h-5 w-5 text-foreground" />
              </div>
            </div>
          </div>
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {stats.map((item, i) => (
            <div
              key={i}
              className={`rounded-lg border shadow-sm px-4 py-4 ${
                isDark
                  ? 'bg-[#141517] border-[#374151]'
                  : 'bg-card border-[#FDFDFD]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground font-medium">
                    {item.title}
                  </p>
                  <p
                    className={`mt-1 text-xl font-semibold ${
                      isDark ? 'text-white' : 'text-[var(--brand)]'
                    }`}
                  >
                    {item.value}
                  </p>
                  {item.money && item.money !== formatCurrency(0) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.money}
                    </p>
                  )}
                </div>
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.iconBg}`}
                >
                  <item.icon className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Quick action card */}
        <section
          className={`mt-8 rounded-lg border p-6 ${
            isDark
              ? 'bg-[#141517] border-[#374151]'
              : 'bg-card border-[#FDFDFD]'
          }`}
        >
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Quick actions
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Manage and review loan applications from the applications list.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate('/applications')}
            className="border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/10"
          >
            Go to Applications
          </Button>
        </section>
      </div>
    </div>
  );
}
