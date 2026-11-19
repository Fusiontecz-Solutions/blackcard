import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';
import type { SyndicatorAdminOutletContext } from './syndicatorAdminOutletContext';
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
import { Button } from '@/components/ui/button';
import { toast } from 'react-toastify';
import { formatDate as formatDateUtil, cn } from '@/lib/utils';
import { syndicatorWalletPaymentTypeDisplay } from '@/lib/syndicatorWalletPaymentTypeDisplay';
import { CircleDollarSign, Download, Wallet as WalletIcon, Layers, Loader2 } from 'lucide-react';
import SyndicatorAdminStatCard from './SyndicatorAdminStatCard';
import { formatUSD } from '@/utils/formatCurrency';
import { downloadStatementPdf, type StatementSection } from '@/lib/statementPdf';
type WalletRow = {
  id?: number;
  date: string;
  amount: unknown;
  paymentType?: string | null;
  description?: string | null;
  merchantName?: string | null;
  prevBalance?: unknown;
  applicationId?: string | null;
  application?: {
    dealId?: string | null;
    applicationId?: number | null;
    dealDisplayName?: string | null;
  } | null;
};

type SyndDeal = {
  applicationId: string;
  merchantName?: string | null;
  amountSyndicated: unknown;
  percentageSyndicated?: unknown;
  collectedAmount?: unknown;
  remainingAmount?: unknown;
  paybackAmountSyndicated?: unknown;
  status?: string | null;
  application?: {
    dealId?: string | null;
    dealDisplayName?: string | null;
    businessName?: string | null;
    applicationId?: number | null;
    fundingDate?: string | null;
  } | null;
};

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const money = (v: unknown) => formatUSD(v);
const fmtDate = (v: string | null | undefined) => (v ? formatDateUtil(v, '—') : '—');

function isCredit(pt: string): boolean {
  const u = pt.toUpperCase();
  return u === 'CREDIT' || u === 'WALLET_CREDIT' || u === 'PAID' || u === 'MANUAL';
}
function isDebit(pt: string): boolean {
  const u = pt.toUpperCase();
  return (
    u === 'DEBIT' ||
    u === 'WITHDRAW' ||
    u === 'SYNDICATION_COMMISSION' ||
    u === 'SYNDICATION_MANAGEMENT_FEE'
  );
}

/** Prior Friday → current period end bracket for the summary tiles. */
function getWeekWindow(): { start: Date; end: Date } {
  const today = new Date();
  const day = today.getDay();
  const lastFriday = new Date(today);
  lastFriday.setDate(today.getDate() - ((day + 2) % 7));
  lastFriday.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  if (day > 5) endDate.setDate(today.getDate() + (6 - day));
  endDate.setHours(23, 59, 59, 999);
  return { start: lastFriday, end: endDate };
}

function dealLabel(d: SyndDeal): string {
  return (
    d.application?.dealDisplayName ||
    d.application?.businessName ||
    d.merchantName ||
    d.application?.dealId ||
    'Deal'
  );
}

/** One repayment the merchant made on the deal (from collection-payments). */
type RepayTxn = { id: string; date: string | null; amount: number; status: string };

function mapRepayments(list: unknown[]): RepayTxn[] {
  return list
    .map((raw, i) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const date =
        (r.scheduledDate as string) || (r.paymentDate as string) || (r.createdAt as string) || null;
      const amount = Number(r.amount ?? 0) || 0;
      const status = String(r.status ?? r.paymentStatus ?? r.state ?? '—');
      return { id: String(r.id ?? i), date, amount, status };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** A repayment counts toward the wallet balance only if it actually cleared. */
function repaymentCleared(status: string): boolean {
  const s = status.toLowerCase();
  return !(s.includes('fail') || s.includes('decline') || s.includes('return') || s.includes('reject'));
}

type View = 'ledger' | 'deal';

type DealGroup = {
  key: string;
  label: string;
  merchantName: string | null;
  invested: number;
  investedDate: string | null;
  pct: number;
  collected: number;
  remaining: number;
  payback: number;
  status: string | null;
  txns: WalletRow[];
};

type StatementLine = {
  key: string;
  date: string | null;
  desc: string;
  debit: number;
  credit: number;
  balance: number;
  muted?: boolean;
};

/**
 * Bank-statement ledger for one deal: opening investment (debit), then this syndicator's
 * share of each loaded merchant repayment as a credit, with a running outstanding balance.
 */
function buildDealStatement(g: DealGroup, repay: RepayTxn[] | 'loading' | undefined) {
  const repayLoaded = Array.isArray(repay);
  const repayCredits = repayLoaded
    ? repay.map((r) => ({
        key: r.id,
        date: r.date,
        status: r.status,
        share: (r.amount * g.pct) / 100,
        cleared: repaymentCleared(r.status),
      }))
    : [];

  let balance = g.invested;
  const lines: StatementLine[] = [
    {
      key: 'open',
      date: g.investedDate,
      desc: `Syndicated investment${g.pct ? ` · ${g.pct.toFixed(1)}% share` : ''}`,
      debit: g.invested,
      credit: 0,
      balance,
    },
  ];
  for (const c of repayCredits) {
    if (c.cleared) balance -= c.share;
    lines.push({
      key: c.key,
      date: c.date,
      desc: c.cleared
        ? `Repayment credit${g.pct ? ` · ${g.pct.toFixed(1)}% of collection` : ''}`
        : `Failed repayment · ${c.status}`,
      debit: 0,
      credit: c.cleared ? c.share : 0,
      balance,
      muted: !c.cleared,
    });
  }
  const totalCredit = repayCredits.filter((c) => c.cleared).reduce((a, c) => a + c.share, 0);
  return { lines, repayLoaded, repayCount: repayCredits.length, totalCredit, balance };
}

export default function SyndicatorAdminTransactionsPage() {
  const { syndicatorId } = useParams<{ syndicatorId: string }>();
  const {
    walletRefreshToken = 0,
    syndicatorName = null,
    syndicatorCompany = null,
    currentBalance = null,
  } = useOutletContext<SyndicatorAdminOutletContext | null>() ?? {
    walletRefreshToken: 0,
    bumpWalletRefresh: () => {},
  };
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [deals, setDeals] = useState<SyndDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('ledger');
  const [exporting, setExporting] = useState(false);
  const [dealRepay, setDealRepay] = useState<Record<string, RepayTxn[] | 'loading'>>({});
  const loadDealRepay = (applicationId: string) => {
    if (dealRepay[applicationId]) return;
    setDealRepay((s) => ({ ...s, [applicationId]: 'loading' }));
    axiosGet('/collection-payments', { params: { applicationId, includeDealView: false } })
      .then((res) => setDealRepay((s) => ({ ...s, [applicationId]: mapRepayments((res.data?.data ?? []) as unknown[]) })))
      .catch(() => setDealRepay((s) => ({ ...s, [applicationId]: [] })));
  };

  const load = useCallback(async () => {
    if (!syndicatorId) return;
    setLoading(true);
    try {
      const [walletRes, dealsRes] = await Promise.all([
        axiosGet(`/syndicators/${syndicatorId}/wallet-transactions`),
        axiosGet(`/application-syndicators/by-syndicator/${syndicatorId}`),
      ]);
      setRows(Array.isArray(walletRes?.data?.data) ? walletRes.data.data : []);
      setDeals(Array.isArray(dealsRes?.data?.data) ? dealsRes.data.data : []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not load wallet';
      toast.error(msg);
      setRows([]);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [syndicatorId]);

  useEffect(() => {
    void load();
  }, [load, walletRefreshToken]);

  const { start: wStart, end: wEnd } = useMemo(() => getWeekWindow(), []);

  const effRows = rows;

  const windowTotals = useMemo(() => {
    let collected = 0;
    let paid = 0;
    for (const r of effRows) {
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime()) || d < wStart || d > wEnd) continue;
      const pt = String(r.paymentType ?? '');
      const amt = num(r.amount);
      if (isCredit(pt)) collected += amt;
      if (isDebit(pt)) paid += amt;
    }
    return { collected, paid };
  }, [effRows, wStart, wEnd]);

  const ledgerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? effRows
      : effRows.filter(
          (item) =>
            String(num(item.amount)).includes(q) ||
            String(item.paymentType ?? '').toLowerCase().includes(q) ||
            String(item.description ?? '').toLowerCase().includes(q) ||
            String(item.merchantName ?? '').toLowerCase().includes(q),
        );
    return [...base].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [effRows, search]);

  /** Per-deal investment wallet: investment + repayment credits grouped by application. */
  const dealGroups = useMemo<DealGroup[]>(() => {
    const txnByApp = new Map<string, WalletRow[]>();
    for (const r of rows) {
      const app = r.applicationId;
      if (!app) continue;
      const arr = txnByApp.get(app) ?? [];
      arr.push(r);
      txnByApp.set(app, arr);
    }
    const groups = deals.map((d) => {
      const txns = (txnByApp.get(d.applicationId) ?? []).sort((a, b) =>
        String(a.date).localeCompare(String(b.date)),
      );
      const credited = txns
        .filter((t) => isCredit(String(t.paymentType ?? '')))
        .reduce((a, t) => a + num(t.amount), 0);
      return {
        key: d.applicationId,
        label: dealLabel(d),
        merchantName: d.merchantName ?? d.application?.businessName ?? null,
        invested: num(d.amountSyndicated),
        investedDate: d.application?.fundingDate ?? null,
        pct: num(d.percentageSyndicated),
        collected: Math.max(credited, num(d.collectedAmount)),
        remaining: num(d.remainingAmount),
        payback: num(d.paybackAmountSyndicated),
        status: d.status ?? null,
        txns,
      };
    });
    const q = search.trim().toLowerCase();
    const filtered = q
      ? groups.filter(
          (g) =>
            g.label.toLowerCase().includes(q) ||
            String(g.merchantName ?? '').toLowerCase().includes(q),
        )
      : groups;
    return filtered.sort((a, b) => b.invested - a.invested);
  }, [rows, deals, search]);

  const holderLine =
    [syndicatorName, syndicatorCompany && syndicatorCompany !== syndicatorName ? syndicatorCompany : null]
      .filter(Boolean)
      .join(' · ') || `Syndicator #${syndicatorId}`;

  const handleExport = async () => {
    setExporting(true);
    try {
      const signed = (r: WalletRow) => {
        const pt = String(r.paymentType ?? '');
        return `${isCredit(pt) ? '+' : isDebit(pt) ? '-' : ''}${money(r.amount)}`;
      };
      const sections: StatementSection[] =
        view === 'ledger'
          ? [
              {
                columns: [
                  { label: 'Date', width: 13 },
                  { label: 'Type', width: 16 },
                  { label: 'Amount', width: 14, align: 'right' },
                  { label: 'Prev balance', width: 15, align: 'right' },
                  { label: 'Merchant', width: 18 },
                  { label: 'Description', width: 24 },
                ],
                rows: ledgerRows.map((r) => [
                  fmtDate(String(r.date)),
                  syndicatorWalletPaymentTypeDisplay(r.paymentType),
                  signed(r),
                  money(r.prevBalance),
                  r.merchantName ?? '—',
                  r.description ?? '—',
                ]),
                emptyText: 'No wallet transactions recorded.',
              },
            ]
          : dealGroups.map((g) => {
              const st = buildDealStatement(g, dealRepay[g.key]);
              return {
                title: g.label,
                subtitle: [g.pct ? `${g.pct.toFixed(1)}% share` : 'Syndicated', `funded ${fmtDate(g.investedDate)}`, g.status]
                  .filter(Boolean)
                  .join(' · '),
                facts: [
                  { label: 'Invested', value: money(g.invested) },
                  { label: 'Repaid', value: money(st.totalCredit) },
                  { label: 'Outstanding', value: money(st.balance) },
                ],
                columns: [
                  { label: 'Date', width: 14 },
                  { label: 'Description', width: 38 },
                  { label: 'Debit', width: 16, align: 'right' },
                  { label: 'Credit', width: 16, align: 'right' },
                  { label: 'Balance', width: 16, align: 'right' },
                ],
                rows: st.lines.map((ln) => [
                  fmtDate(ln.date),
                  ln.desc,
                  ln.debit ? money(ln.debit) : '—',
                  ln.credit ? money(ln.credit) : '—',
                  money(ln.balance),
                ]),
                mutedRows: st.lines.flatMap((ln, i) => (ln.muted ? [i] : [])),
                totalRow: ['Closing balance', '', money(g.invested), money(st.totalCredit), money(st.balance)],
              } satisfies StatementSection;
            });

      const repaymentsMissing = view === 'deal' && dealGroups.some((g) => !Array.isArray(dealRepay[g.key]));
      await downloadStatementPdf({
        fileName: `syndicator-${syndicatorId}-wallet-${view === 'deal' ? 'by-deal' : 'ledger'}-${new Date().toISOString().slice(0, 10)}`,
        title: 'Syndicator wallet statement',
        headerLines: [
          holderLine,
          `${view === 'deal' ? 'Investment by deal' : 'Investment & repayment ledger'} · Account #${syndicatorId}`,
          ...(search.trim() ? [`Filtered by "${search.trim()}"`] : []),
        ],
        headerRight: [
          ...(currentBalance != null ? [`Current balance ${money(currentBalance)}`] : []),
          `Generated ${fmtDate(new Date().toISOString())}`,
        ],
        summary:
          view === 'ledger'
            ? [
                { label: 'This period collected', value: money(windowTotals.collected) },
                { label: 'This period paid out', value: money(windowTotals.paid) },
                { label: 'Transactions', value: String(ledgerRows.length) },
              ]
            : undefined,
        sections: view === 'deal' && sections.length === 0
          ? [{ columns: [{ label: 'Deal', width: 1 }], rows: [], emptyText: 'No deal investments for this syndicator.' }]
          : sections,
        footerNote: repaymentsMissing
          ? 'Repayment credits are included only for deals where "Track repayments" was loaded before exporting.'
          : undefined,
      });
    } catch {
      toast.error('Could not export PDF');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Loading wallet…
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* View toggle + export */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setView('ledger')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              view === 'ledger'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <WalletIcon className="size-4" />
            Investment &amp; repayment
          </button>
          <button
            type="button"
            onClick={() => setView('deal')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              view === 'deal'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Layers className="size-4" />
            By deal
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="search"
            placeholder={view === 'deal' ? 'Search deals' : 'Search transactions'}
            className="w-full sm:w-[220px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search wallet"
          />
          <Button type="button" variant="outline" className="shrink-0 gap-2" disabled={exporting} onClick={() => void handleExport()}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-6 rounded-xl border border-border bg-card p-4 md:p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Syndicator wallet statement</p>
              <p className="text-xs text-muted-foreground">{holderLine}</p>
              <p className="text-xs text-muted-foreground">
                {view === 'deal' ? 'Investment by deal' : 'Investment & repayment ledger'} · Account #{syndicatorId}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {currentBalance != null ? (
              <p>
                Current balance <span className="font-semibold text-foreground tabular-nums">{money(currentBalance)}</span>
              </p>
            ) : null}
            <p>Generated {fmtDate(new Date().toISOString())}</p>
          </div>
        </div>

        {view === 'ledger' ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SyndicatorAdminStatCard label="This period collected" value={money(windowTotals.collected)} icon={CircleDollarSign} accent="emerald" />
              <SyndicatorAdminStatCard label="This period paid out" value={money(windowTotals.paid)} icon={CircleDollarSign} accent="amber" />
              <SyndicatorAdminStatCard label="Transactions" value={String(effRows.length)} icon={WalletIcon} accent="violet" />
            </div>

            <div className="rounded-md border border-border bg-background overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60 hover:bg-muted/60 border-b">
                    <TableHead className="font-medium text-foreground">Date</TableHead>
                    <TableHead className="font-medium text-foreground">Type</TableHead>
                    <TableHead className="font-medium text-foreground text-right">Amount</TableHead>
                    <TableHead className="font-medium text-foreground text-right">Prev balance</TableHead>
                    <TableHead className="font-medium text-foreground">Merchant</TableHead>
                    <TableHead className="font-medium text-foreground">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerRows.length ? (
                    ledgerRows.map((r, i) => {
                      const pt = String(r.paymentType ?? '');
                      const credit = isCredit(pt);
                      const debit = isDebit(pt);
                      return (
                        <TableRow key={r.id ?? i} className="border-b border-border hover:bg-muted/40">
                          <TableCell>{fmtDate(typeof r.date === 'string' ? r.date : String(r.date))}</TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase',
                                credit
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                  : debit
                                    ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                                    : 'bg-muted text-muted-foreground',
                              )}
                            >
                              {syndicatorWalletPaymentTypeDisplay(r.paymentType)}
                            </span>
                          </TableCell>
                          <TableCell
                            className={cn(
                              'tabular-nums text-right font-medium',
                              credit ? 'text-emerald-600 dark:text-emerald-400' : debit ? 'text-red-600 dark:text-red-400' : '',
                            )}
                          >
                            {credit ? '+' : debit ? '−' : ''}
                            {money(r.amount)}
                          </TableCell>
                          <TableCell className="tabular-nums text-right text-muted-foreground">{money(r.prevBalance)}</TableCell>
                          <TableCell className="text-muted-foreground">{r.merchantName ?? '—'}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[280px] truncate" title={r.description ?? ''}>
                            {r.description ?? '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-left text-muted-foreground">
                        {effRows.length ? 'No results match your search.' : 'No wallet transactions recorded.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="grid gap-5">
            {dealGroups.length ? (
              dealGroups.map((g) => {
                const repay = dealRepay[g.key];
                const { lines, repayLoaded, repayCount, totalCredit, balance } = buildDealStatement(g, repay);

                return (
                  <div key={g.key} className="overflow-hidden rounded-lg border border-border bg-background">
                    {/* Statement header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{g.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {g.pct ? `${g.pct.toFixed(1)}% share` : 'Syndicated'} · funded {fmtDate(g.investedDate)}
                          {g.status ? ` · ${g.status}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                        <span className="text-muted-foreground">
                          Invested <span className="font-semibold text-foreground tabular-nums">{money(g.invested)}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Repaid{' '}
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {money(totalCredit)}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          Outstanding <span className="font-semibold text-foreground tabular-nums">{money(balance)}</span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 px-2 text-xs"
                          disabled={repay === 'loading'}
                          onClick={() => loadDealRepay(g.key)}
                        >
                          {repay === 'loading' ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Layers className="size-3.5" />
                          )}
                          {repayLoaded ? `Repayments (${repayCount})` : 'Track repayments'}
                        </Button>
                      </div>
                    </div>

                    {/* Statement table */}
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b hover:bg-transparent">
                          <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Date
                          </TableHead>
                          <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Description
                          </TableHead>
                          <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Debit
                          </TableHead>
                          <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Credit
                          </TableHead>
                          <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Balance
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((ln) => (
                          <TableRow key={ln.key} className={cn('border-b border-border/60 hover:bg-muted/30', ln.muted && 'opacity-60')}>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {fmtDate(ln.date)}
                            </TableCell>
                            <TableCell className="text-sm text-foreground">{ln.desc}</TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-red-600 dark:text-red-400">
                              {ln.debit ? money(ln.debit) : '—'}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                              {ln.credit ? money(ln.credit) : '—'}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              {money(ln.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {!repayLoaded ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="py-2 text-center text-xs text-muted-foreground">
                              {repay === 'loading'
                                ? 'Loading repayments…'
                                : 'Use “Track repayments” to pull this deal’s payments — each payoff posts a credit for the ' +
                                  (g.pct ? `${g.pct.toFixed(1)}%` : '') +
                                  ' share.'}
                            </TableCell>
                          </TableRow>
                        ) : repayCount === 0 ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="py-2 text-center text-xs text-muted-foreground">
                              No repayments recorded on this deal yet.
                            </TableCell>
                          </TableRow>
                        ) : null}
                        {/* Closing totals */}
                        <TableRow className="border-t-2 border-border bg-muted/30 hover:bg-muted/30">
                          <TableCell className="text-xs font-semibold uppercase text-muted-foreground" colSpan={2}>
                            Closing balance
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">{money(g.invested)}</TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">{money(totalCredit)}</TableCell>
                          <TableCell className="text-right text-sm font-bold tabular-nums">{money(balance)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-border bg-background p-6 text-center text-sm text-muted-foreground">
                {deals.length ? 'No deals match your search.' : 'No deal investments for this syndicator.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
