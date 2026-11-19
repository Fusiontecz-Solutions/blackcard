import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { axiosGet } from '@/redux/axios';
import { formatCurrency, formatDate } from '@/lib/utils';
import { syndicatorDealIdDisplay } from '@/lib/syndicatorDealDisplay';
import { syndicatorWalletPaymentTypeDisplay } from '@/lib/syndicatorWalletPaymentTypeDisplay';

type Syndicator = {
    id: number;
    firstName: string;
    lastName: string | null;
    currentBalance: unknown;
};

type WalletRow = {
    id: number;
    syndicatorId: number;
    amount: unknown;
    description: string | null;
    merchantName: string | null;
    prevBalance: unknown;
    applicationId: string | null;
    date: string;
    paymentType: string | null;
    application?: {
        id: string;
        dealId: string | null;
        applicationId: number | null;
        dealDisplayName: string | null;
    } | null;
};

const num = (v: unknown): number => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};

/** Map raw `paymentType` (CREDIT, WALLET_CREDIT, DEBIT, WITHDRAW) to the user-facing CREDIT/DEBIT chip. */
function creditOrDebit(paymentType: string | null | undefined): 'CREDIT' | 'DEBIT' | '—' {
    const u = String(paymentType ?? '').toUpperCase();
    if (u === 'CREDIT' || u === 'WALLET_CREDIT') return 'CREDIT';
    if (
        u === 'DEBIT' ||
        u === 'WITHDRAW' ||
        u === 'SYNDICATION_COMMISSION' ||
        u === 'SYNDICATION_MANAGEMENT_FEE'
    ) {
        return 'DEBIT';
    }
    return '—';
}

/** Best-effort category: rely on paymentType, fall back to "—" for unrecognized values. */
function categoryLabel(paymentType: string | null | undefined): string {
    const u = String(paymentType ?? '').toUpperCase();
    if (u === 'WALLET_CREDIT') return 'Wallet Credit';
    if (u === 'WITHDRAW') return 'Withdrawal';
    if (u === 'CREDIT') return 'Repayment';
    if (u === 'DEBIT') return 'Allocation';
    if (u === 'SYNDICATION_COMMISSION') return 'Commission';
    if (u === 'SYNDICATION_MANAGEMENT_FEE') return 'Management fee';
    return '—';
}

export default function SyndicatorActivity() {
    const navigate = useNavigate();

    const [syndicator, setSyndicator] = useState<Syndicator | null>(null);
    const [rows, setRows] = useState<WalletRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const meRes = await axiosGet('/syndicators/me');
            const me = meRes?.data?.data as Syndicator | undefined;
            if (!me?.id) {
                toast.error('No syndicator profile is linked to this account');
                setSyndicator(null);
                setRows([]);
                return;
            }
            setSyndicator(me);

            const txRes = await axiosGet(`/syndicators/${me.id}/wallet-transactions`);
            const data = txRes?.data?.data;
            setRows(Array.isArray(data) ? (data as WalletRow[]) : []);
        } catch (e: unknown) {
            const msg =
                (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                'Could not load activity';
            toast.error(msg);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const sortedDesc = [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        if (!q) return sortedDesc;
        return sortedDesc.filter((r) => {
            const dealName = r.application?.dealDisplayName ?? r.merchantName ?? '';
            const dealLabel = syndicatorDealIdDisplay(r.application?.dealId, r.application?.applicationId ?? null);
            const dealNum = dealLabel !== '—' ? dealLabel : '';
            return (
                String(num(r.amount)).includes(q) ||
                String(r.paymentType ?? '').toLowerCase().includes(q) ||
                String(r.description ?? '').toLowerCase().includes(q) ||
                dealName.toLowerCase().includes(q) ||
                dealNum.includes(q)
            );
        });
    }, [rows, search]);

    const currentBalance = num(syndicator?.currentBalance);

    return (
        <div className="min-h-screen bg-background p-6 text-foreground md:px-8">
            <div className="mb-4 flex items-center justify-between">
                <Button onClick={() => navigate('/')} variant="outline" className="h-8 text-[11px] font-bold">
                    <ArrowLeft size={14} className="mr-2" /> Back to Dashboard
                </Button>
                <div className="text-sm text-muted-foreground">
                    Current Balance{' '}
                    <span className="font-black text-primary">{formatCurrency(currentBalance)}</span>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-foreground">Transactions</div>
                    <Input
                        type="search"
                        placeholder="Search transactions"
                        className="h-8 w-full max-w-[240px] text-[11px]"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search transactions"
                    />
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            {[
                                '#',
                                'TRS DATE',
                                'PREV. BALANCE',
                                'AMOUNT',
                                'DEAL',
                                'DEAL NAME',
                                'TRANSACTION TYPE',
                                'CREDIT/DEBIT',
                                'CATEGORY',
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
                                <TableCell colSpan={10} className="h-24 text-left text-[11px] text-muted-foreground">
                                    Loading wallet transactions…
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={10} className="h-24 text-left text-[11px] text-muted-foreground">
                                    {rows.length
                                        ? 'No results match your search.'
                                        : 'No wallet transactions recorded.'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((r, idx) => {
                                const dealLabel = syndicatorDealIdDisplay(
                                    r.application?.dealId,
                                    r.application?.applicationId ?? null,
                                );
                                const dealName = r.application?.dealDisplayName ?? r.merchantName ?? '—';
                                return (
                                    <TableRow key={r.id ?? `${r.date}-${idx}`}>
                                        <TableCell className="text-[11px] text-muted-foreground">{idx + 1}</TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground">
                                            {formatDate(r.date, '—')}
                                        </TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground tabular-nums">
                                            {formatCurrency(r.prevBalance)}
                                        </TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground tabular-nums">
                                            {formatCurrency(r.amount)}
                                        </TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground">
                                            {dealLabel}
                                        </TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground">{dealName}</TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground uppercase">
                                            {syndicatorWalletPaymentTypeDisplay(r.paymentType)}
                                        </TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground">
                                            {creditOrDebit(r.paymentType)}
                                        </TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground">
                                            {categoryLabel(r.paymentType)}
                                        </TableCell>
                                        <TableCell
                                            className="text-[11px] text-muted-foreground max-w-[280px] truncate"
                                            title={r.description ?? ''}
                                        >
                                            {r.description ?? '—'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
