import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-toastify';
import { axiosGet, axiosPost } from '@/redux/axios';
import { formatCurrency, formatDate } from '@/lib/utils';

type SyndicatorMe = {
    id: number;
    currentBalance?: unknown;
    firstName?: string;
};

type WithdrawalRow = {
    id: number;
    amount: unknown;
    status: string;
    transactionType?: string | null;
    comment?: string | null;
    payoutDate?: string | null;
    createdAt: string;
};

const num = (v: unknown): number => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};

function todayISODate(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function statusBadge(status: string) {
    const u = status.toUpperCase();
    if (u === 'PENDING') {
        return (
            <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                Pending
            </Badge>
        );
    }
    if (u === 'APPROVED') {
        return (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                Approved
            </Badge>
        );
    }
    if (u === 'DECLINED') {
        return <Badge variant="destructive">Declined</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
}

export default function SyndicatorWithdraw() {
    const navigate = useNavigate();

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [me, setMe] = useState<SyndicatorMe | null>(null);
    const [rows, setRows] = useState<WithdrawalRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const categoryValue = 'Withdrawal';

    const [form, setForm] = useState({
        payoutDate: todayISODate(),
        amount: '',
        transactionType: '',
        comment: '',
    });

    const resetForm = () =>
        setForm({
            payoutDate: todayISODate(),
            amount: '',
            transactionType: '',
            comment: '',
        });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const meRes = await axiosGet('/syndicators/me');
            const profile = meRes?.data?.data as SyndicatorMe | undefined;
            if (!profile?.id) {
                toast.error('No syndicator profile is linked to this account');
                setMe(null);
                setRows([]);
                return;
            }
            setMe(profile);

            const wrRes = await axiosGet('/syndicators/me/withdrawal-requests');
            const list = wrRes?.data?.data;
            setRows(Array.isArray(list) ? (list as WithdrawalRow[]) : []);
        } catch (e: unknown) {
            const msg =
                (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                'Could not load withdrawals';
            toast.error(msg);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const pendingHeld = useMemo(() => {
        let s = 0;
        for (const r of rows) {
            if (String(r.status).toUpperCase() === 'PENDING') s += num(r.amount);
        }
        return s;
    }, [rows]);

    const walletBalance = num(me?.currentBalance);
    const available = Math.max(0, walletBalance - pendingHeld);
    const balanceLabel = formatCurrency(walletBalance);

    const sortedRows = useMemo(
        () => [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
        [rows],
    );

    const submit = async () => {
        const amountN = parseFloat(String(form.amount).replace(/,/g, '').trim());
        if (!Number.isFinite(amountN) || amountN <= 0) {
            toast.error('Enter a valid amount greater than zero.');
            return;
        }
        if (amountN > available + 0.0001) {
            toast.error('Amount exceeds available balance (wallet minus pending requests).');
            return;
        }

        setSubmitting(true);
        try {
            await axiosPost('/syndicators/me/withdrawal-requests', {
                amount: amountN,
                payoutDate: form.payoutDate || undefined,
                transactionType: form.transactionType.trim() || undefined,
                comment: form.comment.trim() || undefined,
            });
            toast.success('Withdrawal request submitted for admin review.');
            setIsAddOpen(false);
            resetForm();
            await load();
        } catch (e: unknown) {
            const msg =
                (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                'Could not submit withdrawal';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background p-6 text-foreground md:px-8">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button onClick={() => navigate('/')} variant="outline" className="h-8 w-fit text-[11px] font-bold">
                    <ArrowLeft size={14} className="mr-2" /> Back to Dashboard
                </Button>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                    <div className="text-right text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Wallet: {balanceLabel}</span>
                    </div>
                    <Button className="h-8 px-4 text-[11px] font-bold shadow-sm" onClick={() => setIsAddOpen(true)}>
                        + Add New Record
                    </Button>
                </div>
            </div>

            <Dialog
                open={isAddOpen}
                onOpenChange={(open: boolean) => {
                    setIsAddOpen(open);
                    if (!open) resetForm();
                }}
            >
                <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
                    <div className="bg-card p-5">
                        <DialogHeader className="px-2">
                            <DialogTitle className="text-[16px] font-bold text-foreground">
                                Request withdrawal
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground">
                                Submit a request to move funds from your wallet. An administrator must approve it before
                                it appears in your transaction history.
                            </DialogDescription>
                        </DialogHeader>

                        <form
                            className="mt-4 px-2 pb-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void submit();
                            }}
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-foreground">Payout date</Label>
                                    <Input
                                        type="date"
                                        value={form.payoutDate}
                                        onChange={(e) =>
                                            setForm((p) => ({ ...p, payoutDate: e.target.value }))
                                        }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-foreground">Amount</Label>
                                    <Input
                                        value={form.amount}
                                        onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                                        placeholder="0.00"
                                        inputMode="decimal"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-foreground">Transaction type</Label>
                                    <Input
                                        value={form.transactionType}
                                        onChange={(e) =>
                                            setForm((p) => ({ ...p, transactionType: e.target.value }))
                                        }
                                        placeholder="e.g. Wire, ACH"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-foreground">Category</Label>
                                    <Select value={categoryValue} disabled>
                                        <SelectTrigger className="border-border bg-muted/40">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={categoryValue}>{categoryValue}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2 mt-4">
                                <Label className="text-xs text-foreground">Comment</Label>
                                <Textarea
                                    value={form.comment}
                                    onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                                    className="min-h-[90px]"
                                    placeholder="Notes for the admin team"
                                />
                            </div>

                            <DialogFooter className="mt-4 px-0">
                                <div className="flex w-full justify-end gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 px-5"
                                        onClick={() => setIsAddOpen(false)}
                                        disabled={submitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" className="h-9 px-5" disabled={submitting}>
                                        {submitting ? 'Submitting…' : 'Submit'}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </form>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="rounded-xl border border-border bg-card shadow-sm">
                <div className="rounded-t-xl bg-muted/50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-foreground">
                    Withdrawals
                </div>

                <div className="p-4">
                    {loading ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {['#', 'REQUESTED', 'PAYOUT DATE', 'AMOUNT', 'STATUS', 'TYPE', 'COMMENT'].map(
                                        (h) => (
                                            <TableHead
                                                key={h}
                                                className="text-[10px] font-bold text-muted-foreground"
                                            >
                                                {h}
                                            </TableHead>
                                        ),
                                    )}
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {sortedRows.length ? (
                                    sortedRows.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell className="text-xs tabular-nums">#{r.id}</TableCell>
                                            <TableCell className="text-xs">
                                                {formatDate(r.createdAt, '—')}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {r.payoutDate ? formatDate(r.payoutDate, '—') : '—'}
                                            </TableCell>
                                            <TableCell className="text-xs tabular-nums">
                                                {formatCurrency(num(r.amount))}
                                            </TableCell>
                                            <TableCell className="text-xs">{statusBadge(r.status)}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {r.transactionType?.trim() ? r.transactionType : '—'}
                                            </TableCell>
                                            <TableCell
                                                className="max-w-[200px] truncate text-xs text-muted-foreground"
                                                title={r.comment ?? ''}
                                            >
                                                {r.comment?.trim() ? r.comment : '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            className="py-12 text-left text-xs text-muted-foreground"
                                        >
                                            No withdrawal requests yet. Use &quot;Add New Record&quot; to submit one.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </div>
        </div>
    );
}
