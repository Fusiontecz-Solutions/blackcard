import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { axiosGet } from '@/redux/axios';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'react-toastify';
import {
  CircleDollarSign,
  Target,
  TrendingUp,
  Wallet,
  Coins,
  Percent,
  ArrowUpRight,
  AlertTriangle,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import SyndicatorAdminStatCard from './SyndicatorAdminStatCard';
import { syndicatorDealIdDisplay } from '@/lib/syndicatorDealDisplay';
import { formatUSD, formatUSDShort } from '@/utils/formatCurrency';
import { formatDate as formatDateUtil, cn } from '@/lib/utils';

type Txn = { key: string; date: string | null; amount: number; status: string; description: string };

const fmtDate = (v: string | null | undefined) => (v ? formatDateUtil(v, '—') : '—');

function mapTxns(list: unknown[]): Txn[] {
  return list.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const date =
      (r.scheduledDate as string) || (r.paymentDate as string) || (r.createdAt as string) || null;
    const amount = Number(r.amount ?? 0) || 0;
    const status = String(r.status ?? r.paymentStatus ?? r.state ?? '—');
    const description = String(r.notes ?? r.note ?? r.description ?? '').trim();
    return { key: String(r.id ?? i), date, amount, status, description };
  });
}

function TxnStatusDot({ status }: { status: string }) {
  const l = status.toLowerCase();
  const color = l.includes('fail')
    ? 'bg-red-500'
    : l.includes('debit')
      ? 'bg-indigo-600'
      : l.includes('overdue')
        ? 'bg-amber-500'
        : l.includes('paid') || l.includes('credit') || l.includes('manual')
          ? 'bg-emerald-500'
          : 'bg-sky-400';
  return <span className={cn('size-2 shrink-0 rounded-full', color)} aria-hidden />;
}

function SnapshotCell({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'emerald' | 'red';
  className?: string;
}) {
  const valueTone =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'red'
        ? 'text-red-600 dark:text-red-400'
        : 'text-foreground';
  return (
    <div className={cn('rounded-lg border border-border bg-background px-3 py-2', className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold tabular-nums', valueTone)}>{value}</p>
    </div>
  );
}

type DetailRow = {
  id: number;
  applicationId: string;
  merchantName?: string | null;
  fundedAmount?: unknown;
  amountSyndicated: unknown;
  paybackAmountSyndicated?: unknown;
  collectedAmount?: unknown;
  remainingAmount?: unknown;
  commissionAmount?: unknown;
  managementFeeToDate?: unknown;
  percentageSyndicated?: unknown;
  status?: string | null;
  application?: {
    dealId: string | null;
    dealDisplayName: string | null;
    applicationId: number | null;
    businessName: string | null;
  } | null;
};

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const money = (v: unknown) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num(v));

export default function SyndicatorAdminSyndicationsPage() {
  const { syndicatorId } = useParams<{ syndicatorId: string }>();
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [txns, setTxns] = useState<Record<string, Txn[] | 'loading'>>({});

  const toggleDeal = (applicationId: string) => {
    setExpanded((prev) => (prev === applicationId ? null : applicationId));
    if (!txns[applicationId]) {
      setTxns((t) => ({ ...t, [applicationId]: 'loading' }));
      axiosGet('/collection-payments', { params: { applicationId, includeDealView: false } })
        .then((res) =>
          setTxns((t) => ({ ...t, [applicationId]: mapTxns((res.data?.data ?? []) as unknown[]) })),
        )
        .catch(() => setTxns((t) => ({ ...t, [applicationId]: [] })));
    }
  };

  const load = useCallback(async () => {
    if (!syndicatorId) return;
    setLoading(true);
    try {
      const res = await axiosGet(`/application-syndicators/by-syndicator/${syndicatorId}`);
      const data = res?.data?.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not load syndications';
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [syndicatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const amountSyndicated = rows.reduce((a, r) => a + num(r.amountSyndicated), 0);
    const collected = rows.reduce((a, r) => a + num(r.collectedAmount), 0);
    return {
      amountSyndicated,
      payback: rows.reduce((a, r) => a + num(r.paybackAmountSyndicated), 0),
      remaining: rows.reduce((a, r) => a + num(r.remainingAmount), 0),
      collected,
      commission: rows.reduce((a, r) => a + num(r.commissionAmount), 0),
      managementFee: rows.reduce((a, r) => a + num(r.managementFeeToDate), 0),
      // Above principal = how much has been collected beyond the capital put in.
      abovePrincipal: collected - amountSyndicated,
      // Defaulted exposure = remaining on deals whose status reads as defaulted.
      defaulted: rows.reduce(
        (a, r) =>
          String(r.status ?? '').toLowerCase().includes('default') ? a + num(r.remainingAmount) : a,
        0,
      ),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const idLabel = syndicatorDealIdDisplay(r.application?.dealId, r.application?.applicationId ?? null);
      const deal =
        r.application?.dealDisplayName ||
        r.application?.businessName ||
        (idLabel !== '—' ? idLabel : '') ||
        r.applicationId;
      const blob = [
        deal,
        r.merchantName,
        String(num(r.amountSyndicated)),
        String(num(r.paybackAmountSyndicated)),
        String(num(r.collectedAmount)),
        String(num(r.remainingAmount)),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Loading syndications…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-6 md:px-6 shadow-sm grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SyndicatorAdminStatCard
          label="Amount syndicated"
          value={formatUSDShort(totals.amountSyndicated)}
          title={formatUSD(totals.amountSyndicated)}
          icon={CircleDollarSign}
          accent="violet"
        />
        <SyndicatorAdminStatCard
          label="Payback amount"
          value={formatUSDShort(totals.payback)}
          title={formatUSD(totals.payback)}
          icon={Target}
          accent="sky"
        />
        <SyndicatorAdminStatCard
          label="Collected"
          value={formatUSDShort(totals.collected)}
          title={formatUSD(totals.collected)}
          icon={Wallet}
          accent="emerald"
        />
        <SyndicatorAdminStatCard
          label="Remaining"
          value={formatUSDShort(totals.remaining)}
          title={formatUSD(totals.remaining)}
          icon={TrendingUp}
          accent="amber"
        />
        <SyndicatorAdminStatCard
          label="Above principal"
          value={`${totals.abovePrincipal >= 0 ? '+' : '−'}${formatUSDShort(Math.abs(totals.abovePrincipal))}`}
          title={formatUSD(totals.abovePrincipal)}
          icon={ArrowUpRight}
          accent={totals.abovePrincipal >= 0 ? 'emerald' : 'red'}
          toneClassName={
            totals.abovePrincipal >= 0
              ? 'border-emerald-200 bg-gradient-to-br from-emerald-100 via-emerald-50 to-white dark:border-emerald-900/50 dark:from-emerald-950/50 dark:via-emerald-950/20 dark:to-transparent'
              : 'border-red-200 bg-gradient-to-br from-red-100 via-red-50 to-white dark:border-red-900/50 dark:from-red-950/50 dark:via-red-950/20 dark:to-transparent'
          }
        />
        <SyndicatorAdminStatCard
          label="Default"
          value={formatUSDShort(totals.defaulted)}
          title={formatUSD(totals.defaulted)}
          icon={AlertTriangle}
          accent="red"
        />
        <SyndicatorAdminStatCard
          label="Commission"
          value={formatUSDShort(totals.commission)}
          title={formatUSD(totals.commission)}
          icon={Coins}
          accent="default"
        />
        <SyndicatorAdminStatCard
          label="Management fee"
          value={formatUSDShort(totals.managementFee)}
          title={formatUSD(totals.managementFee)}
          icon={Percent}
          accent="default"
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Input
          type="search"
          placeholder="Search syndications"
          className="w-full sm:max-w-[240px]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search syndications"
        />
      </div>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60 border-b">
              <TableHead className="font-medium text-foreground">Submission</TableHead>
              <TableHead className="font-medium text-foreground">Merchant</TableHead>
              <TableHead className="font-medium text-foreground">Funded</TableHead>
              <TableHead className="font-medium text-foreground">% Syndicated</TableHead>
              <TableHead className="font-medium text-foreground">Payback</TableHead>
              <TableHead className="font-medium text-foreground">Collected</TableHead>
              <TableHead className="font-medium text-foreground">Remaining</TableHead>
              <TableHead className="font-medium text-foreground">Commission</TableHead>
              <TableHead className="font-medium text-foreground">Mgmt fee</TableHead>
              <TableHead className="font-medium text-foreground">Status</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map((r) => {
                const idLabel = syndicatorDealIdDisplay(r.application?.dealId, r.application?.applicationId ?? null);
                const deal =
                  r.application?.dealDisplayName ||
                  r.application?.businessName ||
                  (idLabel !== '—' ? idLabel : null) ||
                  'Submission';
                const appUuid = r.applicationId;
                const isOpen = expanded === appUuid;
                const t = txns[appUuid];
                const abovePrincipal = num(r.collectedAmount) - num(r.amountSyndicated);
                return (
                  <Fragment key={r.id}>
                    <TableRow
                      className={cn(
                        'cursor-pointer border-b border-border hover:bg-muted/40',
                        isOpen && 'bg-primary/5',
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleDeal(appUuid)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleDeal(appUuid);
                        }
                      }}
                    >
                      <TableCell className="font-medium text-foreground">{String(deal)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.merchantName ?? '—'}</TableCell>
                      <TableCell className="tabular-nums">{money(r.fundedAmount ?? r.amountSyndicated)}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.percentageSyndicated != null
                          ? `${Number(r.percentageSyndicated).toFixed(2)}%`
                          : '—'}
                      </TableCell>
                      <TableCell className="tabular-nums">{money(r.paybackAmountSyndicated)}</TableCell>
                      <TableCell className="tabular-nums">{money(r.collectedAmount)}</TableCell>
                      <TableCell className="tabular-nums">{money(r.remainingAmount)}</TableCell>
                      <TableCell className="tabular-nums">{money(r.commissionAmount)}</TableCell>
                      <TableCell className="tabular-nums">{money(r.managementFeeToDate)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.status ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <ChevronDown
                          className={cn(
                            'size-4 text-muted-foreground transition-transform',
                            isOpen && 'rotate-180',
                          )}
                          aria-hidden
                        />
                      </TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow className="bg-card hover:bg-card">
                        <TableCell colSpan={11} className="p-0 bg-card">
                          <div className="grid gap-4 p-4 lg:grid-cols-2">
                            {/* Deal performance snapshot */}
                            <div>
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Deal performance
                                </p>
                                <Link
                                  to={`/application-details/${appUuid}`}
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Open submission <ExternalLink className="size-3" />
                                </Link>
                              </div>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                <SnapshotCell label="Funded" value={money(r.fundedAmount ?? r.amountSyndicated)} />
                                <SnapshotCell label="Total repayment" value={money(r.paybackAmountSyndicated)} />
                                <SnapshotCell label="Repaid" value={money(r.collectedAmount)} tone="emerald" />
                                <SnapshotCell label="Remaining" value={money(r.remainingAmount)} />
                                <SnapshotCell label="Commission" value={money(r.commissionAmount)} />
                                <SnapshotCell label="Mgmt fee" value={money(r.managementFeeToDate)} />
                                <div className="col-span-2 sm:col-span-3">
                                  <SnapshotCell
                                    label="Above principal"
                                    value={`${abovePrincipal >= 0 ? '+' : '−'}${money(Math.abs(abovePrincipal))}`}
                                    tone={abovePrincipal >= 0 ? 'emerald' : 'red'}
                                    className={
                                      abovePrincipal >= 0
                                        ? 'border-emerald-200 bg-gradient-to-br from-emerald-100 via-emerald-50 to-white dark:border-emerald-900/50 dark:from-emerald-950/50 dark:via-emerald-950/20 dark:to-transparent'
                                        : 'border-red-200 bg-gradient-to-br from-red-100 via-red-50 to-white dark:border-red-900/50 dark:from-red-950/50 dark:via-red-950/20 dark:to-transparent'
                                    }
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Transactions */}
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Transactions{Array.isArray(t) ? ` (${t.length})` : ''}
                              </p>
                              <div className="rounded-lg border border-border bg-background">
                                {t === 'loading' || t === undefined ? (
                                  <div className="space-y-2 p-3">
                                    {[0, 1, 2].map((i) => (
                                      <Skeleton key={i} className="h-6 w-full" />
                                    ))}
                                  </div>
                                ) : t.length === 0 ? (
                                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                                    No transactions for this deal.
                                  </p>
                                ) : (
                                  <div className="max-h-64 divide-y divide-border/60 overflow-y-auto">
                                    {t.map((x) => (
                                      <div
                                        key={x.key}
                                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                      >
                                        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                                          <TxnStatusDot status={x.status} />
                                          <span className="shrink-0">{fmtDate(x.date)}</span>
                                          <span className="truncate text-xs capitalize">· {x.status.toLowerCase()}</span>
                                        </span>
                                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                                          {money(x.amount)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={11} className="h-24 text-left text-muted-foreground">
                  {rows.length ? 'No results match your search.' : 'No syndicated submissions for this partner.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
