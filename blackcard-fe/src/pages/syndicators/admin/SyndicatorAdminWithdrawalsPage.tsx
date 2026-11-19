import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';
import type { SyndicatorAdminOutletContext } from './syndicatorAdminOutletContext';
import { axiosGet, axiosPatch } from '@/redux/axios';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-toastify';
import { formatDate as formatDateUtil } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type WithdrawalRow = {
  id: number;
  amount: unknown;
  status: string;
  transactionType?: string | null;
  comment?: string | null;
  payoutDate?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
};

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const money = (v: unknown) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num(v));

function statusBadge(status: string) {
  const u = status.toUpperCase();
  if (u === 'PENDING') {
    return <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100">Pending</Badge>;
  }
  if (u === 'APPROVED') {
    return <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">Approved</Badge>;
  }
  if (u === 'DECLINED') {
    return <Badge variant="destructive">Declined</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

export default function SyndicatorAdminWithdrawalsPage() {
  const { syndicatorId } = useParams<{ syndicatorId: string }>();
  const { walletRefreshToken = 0, bumpWalletRefresh } =
    useOutletContext<SyndicatorAdminOutletContext | null>() ?? {
      walletRefreshToken: 0,
      bumpWalletRefresh: () => {},
    };
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<{ id: number; decision: 'APPROVE' | 'DECLINE' } | null>(null);

  const load = useCallback(async () => {
    if (!syndicatorId) return;
    setLoading(true);
    try {
      const res = await axiosGet(`/syndicators/${syndicatorId}/withdrawal-requests`);
      const data = res?.data?.data;
      setRows(Array.isArray(data) ? (data as WithdrawalRow[]) : []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not load withdrawal requests';
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [syndicatorId]);

  useEffect(() => {
    void load();
  }, [load, walletRefreshToken]);

  const review = useCallback(
    async (requestId: number, decision: 'APPROVE' | 'DECLINE') => {
      if (!syndicatorId) return;
      const label = decision === 'APPROVE' ? 'approve' : 'decline';
      if (decision === 'DECLINE') {
        const ok = window.confirm(`Decline withdrawal request #${requestId}?`);
        if (!ok) return;
      }
      setActing({ id: requestId, decision });
      try {
        await axiosPatch(`/syndicators/${syndicatorId}/withdrawal-requests/${requestId}`, {
          decision,
        });
        toast.success(decision === 'APPROVE' ? 'Withdrawal approved' : 'Withdrawal declined');
        await load();
        if (decision === 'APPROVE') bumpWalletRefresh();
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          `Could not ${label} request`;
        toast.error(msg);
      } finally {
        setActing(null);
      }
    },
    [syndicatorId, load, bumpWalletRefresh],
  );

  const sorted = useMemo(
    () => [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [rows],
  );

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Loading withdrawal requests…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-6 md:px-6 shadow-sm space-y-4">
      <p className="text-sm text-muted-foreground">
        Pending requests are funded from the syndicator wallet only after you approve them. Approved payouts appear in
        transaction history and the syndicator activity ledger.
      </p>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60 border-b">
              <TableHead className="font-medium text-foreground">ID</TableHead>
              <TableHead className="font-medium text-foreground">Requested</TableHead>
              <TableHead className="font-medium text-foreground">Payout date</TableHead>
              <TableHead className="font-medium text-foreground">Amount</TableHead>
              <TableHead className="font-medium text-foreground">Type</TableHead>
              <TableHead className="font-medium text-foreground">Status</TableHead>
              <TableHead className="font-medium text-foreground">Comment</TableHead>
              <TableHead className="font-medium text-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length ? (
              sorted.map((r) => {
                const pending = String(r.status).toUpperCase() === 'PENDING';
                const busyDecline = acting?.id === r.id && acting.decision === 'DECLINE';
                const busyApprove = acting?.id === r.id && acting.decision === 'APPROVE';
                return (
                  <TableRow key={r.id} className="border-b border-border hover:bg-muted/40">
                    <TableCell className="tabular-nums">#{r.id}</TableCell>
                    <TableCell>{formatDateUtil(r.createdAt, '—')}</TableCell>
                    <TableCell>
                      {r.payoutDate ? formatDateUtil(r.payoutDate, '—') : '—'}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">{money(r.amount)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {r.transactionType?.trim() ? r.transactionType : '—'}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground text-sm" title={r.comment ?? ''}>
                      {r.comment?.trim() ? r.comment : '—'}
                    </TableCell>
                    <TableCell>
                      {pending ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/40 hover:bg-destructive/10"
                            disabled={!!acting}
                            onClick={() => void review(r.id, 'DECLINE')}
                          >
                            {busyDecline ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Decline
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={!!acting}
                            onClick={() => void review(r.id, 'APPROVE')}
                          >
                            {busyApprove ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Approve
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {r.reviewedAt ? `Reviewed ${formatDateUtil(r.reviewedAt, '—')}` : '—'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-left text-muted-foreground">
                  No withdrawal requests yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
