import { useCallback, useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { syndicatorDealIdDisplay } from '@/lib/syndicatorDealDisplay';
import { SYNDICATOR_PROJECTED_END_DATE_TITLE, formatProjectedEndDate } from '@/lib/syndicatorProjectedEndDate';
import { SYNDICATOR_FUNDING_TABLE_HEADS } from '@/lib/syndicatorFundingTableHeads';
import { axiosGet } from '@/redux/axios';

/** Ring arc fills on `bg-primary` — do not use `primary` (same as card bg). */
const statusColors = {
    syndicated: 'var(--primary-foreground)',
    payback: 'var(--chart-4)',
    remaining: 'var(--secondary)',
    fees: 'var(--chart-2)',
} as const;

/** Three-column summary (Line item / Amount / %) — matches Payouts summary cards. */
const SUMMARY_3COL_GRID =
    'grid min-h-0 grid-cols-[minmax(0,46fr)_minmax(0,38fr)_minmax(0,16fr)] items-center';

const radialTrackOnPrimary = 'rgba(255,255,255,0.22)';

function pctOf(part: number, whole: number): number {
    if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
    return (part / whole) * 100;
}

/** Same idea as home “Total syndicate RTR”: arc = share of total; center = percentage. */
function DealRadial({ valuePct, color, ariaLabel }: { valuePct: number; color: string; ariaLabel: string }) {
    const v = Math.min(100, Math.max(0, valuePct));
    return (
        <div className="relative mx-auto h-[96px] w-[96px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={[{ value: v }, { value: Math.max(0, 100 - v) }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={34}
                        outerRadius={44}
                        startAngle={90}
                        endAngle={450}
                        dataKey="value"
                        stroke="none"
                    >
                        <Cell fill={color} />
                        <Cell fill={radialTrackOnPrimary} />
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center px-1">
                <span className="text-center text-[11px] font-black leading-none text-primary-foreground">
                    {v.toFixed(1)}%
                </span>
            </div>
            <span className="sr-only">{ariaLabel}</span>
        </div>
    );
}

const num = (v: unknown): number => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};

type SyndicatorMe = {
    id: number;
    firstName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
};

type SummaryTotals = {
    fundedAmount?: number;
    amountSyndicated?: number;
    paybackAmountSyndicated?: number;
    commissionAmount?: number;
    managementFeeToDate?: number;
    collectedAmount?: number;
    remainingAmount?: number;
    defaultedAmount?: number;
    slowPayAmount?: number;
};

type SummaryResponse = {
    totals?: SummaryTotals;
};

type ApplicationRef = {
    dealId?: string | null;
    dealDisplayName?: string | null;
    applicationId?: number | null;
    businessName?: string | null;
    fundingDate?: string | null;
    /** From latest terms / offer — maps syndication `termLength` (periods) to calendar days. */
    repaymentFrequency?: string | null;
} | null;

type AllocationRow = {
    id: number;
    applicationId: string;
    createdAt?: string;
    merchantName?: string | null;
    amountSyndicated?: unknown;
    fundedAmount?: unknown;
    commissionAmount?: unknown;
    managementFeeToDate?: unknown;
    paybackAmount?: unknown;
    paybackAmountSyndicated?: unknown;
    collectedAmount?: unknown;
    remainingAmount?: unknown;
    percentageSyndicated?: unknown;
    termLength?: unknown;
    application?: ApplicationRef;
};

type AllocationsListMeta = {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

const TABLE_PAGE_SIZE = 10;

function formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : '—';
}

export default function SyndicatorFunding() {
    const [loading, setLoading] = useState(true);
    const [tableLoading, setTableLoading] = useState(false);
    const [syndicator, setSyndicator] = useState<SyndicatorMe | null>(null);
    const [summary, setSummary] = useState<SummaryResponse | null>(null);
    const [allocations, setAllocations] = useState<AllocationRow[]>([]);
    const [allocationsMeta, setAllocationsMeta] = useState<AllocationsListMeta | null>(null);
    const [tablePage, setTablePage] = useState(1);
    const [tableSearch, setTableSearch] = useState('');
    const [debouncedTableSearch, setDebouncedTableSearch] = useState('');

    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedTableSearch(tableSearch.trim()), 350);
        return () => window.clearTimeout(t);
    }, [tableSearch]);

    useEffect(() => {
        setTablePage(1);
    }, [debouncedTableSearch]);

    const loadProfile = useCallback(async () => {
        setLoading(true);
        try {
            const meRes = await axiosGet('/syndicators/me');
            const me = meRes?.data?.data as SyndicatorMe | undefined;
            if (!me?.id) {
                toast.error('No syndicator profile is linked to this account');
                setSyndicator(null);
                setSummary(null);
                setAllocations([]);
                setAllocationsMeta(null);
                return;
            }
            setSyndicator(me);
            const summaryRes = await axiosGet('/syndicators/me/summary');
            setSummary((summaryRes?.data?.data as SummaryResponse | undefined) ?? null);
        } catch (e: unknown) {
            const msg =
                (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                'Failed to load funding';
            toast.error(msg);
            setSyndicator(null);
            setSummary(null);
            setAllocations([]);
            setAllocationsMeta(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const syndicatorId = syndicator?.id;

    const loadAllocations = useCallback(async () => {
        if (!syndicatorId) {
            setAllocations([]);
            setAllocationsMeta(null);
            return;
        }
        setTableLoading(true);
        try {
            const listRes = await axiosGet(`/application-syndicators/by-syndicator/${syndicatorId}`, {
                params: {
                    page: tablePage,
                    pageSize: TABLE_PAGE_SIZE,
                    ...(debouncedTableSearch ? { q: debouncedTableSearch } : {}),
                },
            });
            const payload = listRes?.data as
                | { data?: AllocationRow[]; meta?: AllocationsListMeta }
                | undefined;
            const rows = Array.isArray(payload?.data) ? payload.data : [];
            setAllocations(rows);
            setAllocationsMeta(
                payload?.meta &&
                    typeof payload.meta.total === 'number' &&
                    typeof payload.meta.page === 'number' &&
                    typeof payload.meta.pageSize === 'number' &&
                    typeof payload.meta.totalPages === 'number'
                    ? payload.meta
                    : null,
            );
        } catch (e: unknown) {
            const msg =
                (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                'Failed to load allocations';
            toast.error(msg);
            setAllocations([]);
            setAllocationsMeta(null);
        } finally {
            setTableLoading(false);
        }
    }, [syndicatorId, tablePage, debouncedTableSearch]);

    useEffect(() => {
        void loadProfile();
    }, [loadProfile]);

    useEffect(() => {
        void loadAllocations();
    }, [loadAllocations]);

    const totals = summary?.totals;

    const dealStatus = useMemo(
        () => ({
            syndicated: num(totals?.amountSyndicated),
            payback: num(totals?.paybackAmountSyndicated),
            remaining: num(totals?.remainingAmount),
            fees: num(totals?.commissionAmount) + num(totals?.managementFeeToDate),
        }),
        [totals],
    );

    const dealStatusTotal = useMemo(
        () =>
            dealStatus.syndicated +
            dealStatus.payback +
            dealStatus.remaining +
            dealStatus.fees,
        [dealStatus],
    );

    const fundingFlowOutflowRows = useMemo(() => {
        if (!totals) return [];
        const invested = num(totals.amountSyndicated);
        return [{ key: 'invested' as const, label: 'Invested amount', amount: invested, pct: '100%' }];
    }, [totals]);

    const fundingFlowInflowRows = useMemo(() => {
        if (!totals) return [];
        const payback = num(totals.paybackAmountSyndicated);
        const syndicated = num(totals.amountSyndicated);
        const principal = payback > 0 ? Math.min(syndicated, payback) : syndicated;
        const profit = Math.max(0, payback - principal);
        const denom = payback > 0 ? payback : Math.max(principal + profit, 1);
        return [
            {
                key: 'principal' as const,
                label: 'Principal amount',
                amount: principal,
                pct: denom > 0 ? `${((principal / denom) * 100).toFixed(0)}%` : '0%',
            },
            {
                key: 'profit' as const,
                label: 'Profit amount',
                amount: profit,
                pct: denom > 0 ? `${((profit / denom) * 100).toFixed(0)}%` : '0%',
            },
        ];
    }, [totals]);

    const fundingFlowBodyRowCount = 2 + fundingFlowOutflowRows.length + fundingFlowInflowRows.length;

    const tableBusy = Boolean(syndicatorId) && tableLoading;

    return (
        <div className="min-h-screen bg-background p-6 text-foreground md:px-8">
            <div className="mb-4">
                <div className="text-sm font-black uppercase text-foreground">
                    Syndication funding
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
                {/* Deal status */}
                <div className="flex h-full min-h-0 w-full flex-col rounded-xl bg-primary p-5 text-primary-foreground shadow-sm">
                    <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className="text-[11px] font-bold text-primary-foreground/90">Deal status</div>
                            <div className="mt-1 text-sm font-black text-primary-foreground">
                                {formatCurrency(dealStatusTotal)}{' '}
                                <span className="align-top text-[10px] font-bold text-primary-foreground/80">Total</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-4 content-center gap-1 sm:gap-2">
                        <DealRadial
                            valuePct={pctOf(dealStatus.syndicated, dealStatusTotal)}
                            color={statusColors.syndicated}
                            ariaLabel={`Syndicated, ${pctOf(dealStatus.syndicated, dealStatusTotal).toFixed(1)} percent of total`}
                        />
                        <DealRadial
                            valuePct={pctOf(dealStatus.payback, dealStatusTotal)}
                            color={statusColors.payback}
                            ariaLabel={`Syndicated payback, ${pctOf(dealStatus.payback, dealStatusTotal).toFixed(1)} percent of total`}
                        />
                        <DealRadial
                            valuePct={pctOf(dealStatus.remaining, dealStatusTotal)}
                            color={statusColors.remaining}
                            ariaLabel={`Syndicated remaining, ${pctOf(dealStatus.remaining, dealStatusTotal).toFixed(1)} percent of total`}
                        />
                        <DealRadial
                            valuePct={pctOf(dealStatus.fees, dealStatusTotal)}
                            color={statusColors.fees}
                            ariaLabel={`Fees, ${pctOf(dealStatus.fees, dealStatusTotal).toFixed(1)} percent of total`}
                        />
                    </div>

                    <div className="mt-4 grid shrink-0 grid-cols-2 gap-x-6 gap-y-3 border-t border-primary-foreground/15 pt-4">
                        {(
                            [
                                {
                                    key: 'syndicated',
                                    label: 'Syndicated',
                                    amount: dealStatus.syndicated,
                                    dotClass: 'bg-primary-foreground ring-1 ring-primary-foreground/35',
                                },
                                {
                                    key: 'payback',
                                    label: 'Syndicated payback',
                                    amount: dealStatus.payback,
                                    dotClass: 'bg-chart-4',
                                },
                                {
                                    key: 'remaining',
                                    label: 'Syndicated remaining',
                                    amount: dealStatus.remaining,
                                    dotClass: 'bg-secondary',
                                },
                                {
                                    key: 'fees',
                                    label: 'Fees',
                                    amount: dealStatus.fees,
                                    dotClass: 'bg-chart-2',
                                },
                            ] as const
                        ).map((row) => (
                            <div key={row.key} className="flex min-w-0 flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className={`size-2.5 shrink-0 rounded-full ${row.dotClass}`} />
                                    <span
                                        className="truncate text-[11px] font-medium text-primary-foreground/90"
                                        title={row.label}
                                    >
                                        {row.label}
                                    </span>
                                </div>
                                <span className="pl-[18px] text-[12px] font-black text-primary-foreground">
                                    {formatCurrency(row.amount)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Outflow / Inflow — grid rows share extra height when column is stretched */}
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
                            gridTemplateRows: `repeat(${fundingFlowBodyRowCount}, minmax(0, 1fr))`,
                        }}
                    >
                        <div className="flex min-h-0 items-center border-b border-border bg-muted/40">
                            <div className="px-3 py-2 text-[11px] font-bold text-foreground">Outflow</div>
                        </div>
                        {fundingFlowOutflowRows.map((row) => (
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
                        {fundingFlowInflowRows.map((row) => (
                            <div
                                key={row.key}
                                className={`${SUMMARY_3COL_GRID} min-h-0 border-b border-border last:border-b-0`}
                            >
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

            {/* Syndication Funding Table */}
            <div className="mt-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-foreground">Syndication funding</div>
                    <Input
                        placeholder="Search merchant, company, or deal ID…"
                        value={tableSearch}
                        onChange={(e) => setTableSearch(e.target.value)}
                        disabled={!syndicatorId || loading}
                        className="h-9 max-w-md text-sm"
                        aria-label="Filter syndication rows"
                    />
                </div>

                <div className={tableBusy ? 'pointer-events-none opacity-60' : ''}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {SYNDICATOR_FUNDING_TABLE_HEADS.map((h) => (
                                    <TableHead
                                        key={h.id}
                                        className={['text-[10px] font-bold text-muted-foreground', h.className]
                                            .filter(Boolean)
                                            .join(' ')}
                                    >
                                        {h.label}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={SYNDICATOR_FUNDING_TABLE_HEADS.length}
                                        className="py-12 text-left text-xs text-muted-foreground"
                                    >
                                        Loading…
                                    </TableCell>
                                </TableRow>
                            ) : !syndicatorId ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={SYNDICATOR_FUNDING_TABLE_HEADS.length}
                                        className="py-12 text-left text-xs text-muted-foreground"
                                    >
                                        No syndicator profile is linked to this account.
                                    </TableCell>
                                </TableRow>
                            ) : tableBusy && allocations.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={SYNDICATOR_FUNDING_TABLE_HEADS.length}
                                        className="py-12 text-left text-xs text-muted-foreground"
                                    >
                                        Loading…
                                    </TableCell>
                                </TableRow>
                            ) : allocations.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={SYNDICATOR_FUNDING_TABLE_HEADS.length}
                                        className="py-12 text-left text-xs text-muted-foreground"
                                    >
                                        {debouncedTableSearch
                                            ? 'No allocations match your search.'
                                            : 'No syndication allocations for your account.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                allocations.map((row) => {
                                    const dealId = syndicatorDealIdDisplay(
                                        row.application?.dealId,
                                        row.application?.applicationId ?? null,
                                    );
                                    const merchant =
                                        row.merchantName?.trim() ||
                                        row.application?.dealDisplayName?.trim() ||
                                        '—';
                                    const company = row.application?.businessName?.trim() || '—';
                                    const startIso = row.application?.fundingDate ?? row.createdAt;
                                    const syndicateAmount = num(row.amountSyndicated);
                                    const syndicatedPayback = num(row.paybackAmountSyndicated);
                                    const commissionAmt = num(row.commissionAmount);
                                    const managementFeeAmt = num(row.managementFeeToDate);
                                    const collected = num(row.collectedAmount);
                                    const remaining = num(row.remainingAmount);
                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell className="text-[11px] text-foreground">{dealId}</TableCell>
                                            <TableCell className="text-[11px] text-foreground">{merchant}</TableCell>
                                            <TableCell className="text-[11px] text-foreground">{company}</TableCell>
                                            <TableCell className="text-[11px] text-foreground">
                                                {formatDate(startIso)}
                                            </TableCell>
                                            <TableCell
                                                className="text-[11px] text-muted-foreground"
                                                title={SYNDICATOR_PROJECTED_END_DATE_TITLE}
                                            >
                                                {formatProjectedEndDate(
                                                    startIso,
                                                    row.termLength,
                                                    row.application?.repaymentFrequency ?? null,
                                                )}
                                            </TableCell>
                                            <TableCell className="text-[11px] text-foreground">
                                                {formatCurrency(syndicateAmount)}
                                            </TableCell>
                                            <TableCell className="text-[11px] text-foreground">
                                                {formatCurrency(syndicatedPayback)}
                                            </TableCell>
                                            <TableCell className="text-[11px] text-foreground">
                                                {formatCurrency(commissionAmt)}
                                            </TableCell>
                                            <TableCell className="text-[11px] text-foreground">
                                                {formatCurrency(managementFeeAmt)}
                                            </TableCell>
                                            <TableCell className="text-[11px] text-foreground">
                                                {formatCurrency(collected)}
                                            </TableCell>
                                            <TableCell className="text-[11px] text-foreground">
                                                {formatCurrency(remaining)}
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

                {allocationsMeta && allocationsMeta.total > 0 ? (
                    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[11px] text-muted-foreground">
                            Showing{' '}
                            {(allocationsMeta.page - 1) * allocationsMeta.pageSize + 1}–
                            {Math.min(allocationsMeta.page * allocationsMeta.pageSize, allocationsMeta.total)} of{' '}
                            {allocationsMeta.total}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8"
                                disabled={tablePage <= 1 || tableBusy}
                                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                            >
                                Previous
                            </Button>
                            <span className="text-[11px] text-muted-foreground">
                                Page {allocationsMeta.page} of {allocationsMeta.totalPages}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8"
                                disabled={tablePage >= allocationsMeta.totalPages || tableBusy}
                                onClick={() => setTablePage((p) => p + 1)}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
