import { ChevronDown, ArrowLeft } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useParams, useNavigate } from 'react-router';
import { formatCurrency, formatDate } from '@/lib/utils';
import { syndicatorDealIdDisplay } from '@/lib/syndicatorDealDisplay';
import { syndicatorWalletPaymentTypeDisplay } from '@/lib/syndicatorWalletPaymentTypeDisplay';
import { axiosGet } from '@/redux/axios';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';

export type PayoutTxn = {
  trsDate: string;
  merchantName: string;
  amount: number;
  category: string;
  paymentType: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type PayoutDeal = {
  dealId: string;
  merchantCode: string;
  dealName: string;
  fundedAmount: number;
  paybackAmount: number;
  collectedAmount: number;
  remainingAmount: number;
  openContracts: number;
  transactions: PayoutTxn[];
};

type SummaryRecent = {
  allocationId: number;
  applicationUuid: string;
  dealId: string | null;
  applicationId: number | null;
  dealDisplayName: string | null;
  fundedAmount: number;
  paybackAmount: number;
  collectedAmount: number;
  remainingAmount: number;
};

type SummaryResponse = {
  recentApplications: SummaryRecent[];
};

type SyndicatorMe = { id: number };

type AllocationRow = {
  id: number;
  applicationId: string;
  fundedAmount: unknown;
  paybackAmount: unknown;
  collectedAmount: unknown;
  remainingAmount: unknown;
  merchantName?: string | null;
  application?: {
    id: string;
    dealId: string | null;
    dealDisplayName: string | null;
    applicationId: number | null;
    businessName: string | null;
  } | null;
};

type WalletRow = {
  amount: unknown;
  description: string | null;
  merchantName: string | null;
  date: string;
  paymentType: string | null;
  applicationId: string | null;
  application?: { dealId: string | null; dealDisplayName: string | null; applicationId: number | null } | null;
};

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

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export default function SyndicatorPayoutDetailPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();

  const [deal, setDeal] = useState<PayoutDeal | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const raw = String(dealId ?? '').trim();
    if (!raw) {
      setDeal(null);
      setLoading(false);
      return;
    }

    const n = Number(raw);
    const nFinite = /^[0-9]+$/.test(raw) && Number.isFinite(n);

    setLoading(true);
    try {
      const meRes = await axiosGet('/syndicators/me');
      const me = meRes?.data?.data as SyndicatorMe | undefined;
      if (!me?.id) {
        toast.error('No syndicator profile is linked to this account');
        setDeal(null);
        return;
      }

      let applicationUuid: string | null = null;
      let fundedAmount = 0;
      let paybackAmount = 0;
      let collectedAmount = 0;
      let remainingAmount = 0;
      let dealName = 'Deal';
      let displayDealId = syndicatorDealIdDisplay(null, null);

      const matchesDealKey = (
        appDealId: string | null | undefined,
        appNumericId: number | null | undefined,
        allocationId: number,
      ): boolean => {
        const dd = appDealId != null ? String(appDealId).trim() : '';
        if (dd !== '' && dd.toLowerCase() === raw.toLowerCase()) return true;
        if (!nFinite) return false;
        return allocationId === n || (appNumericId != null && appNumericId === n);
      };

      try {
        const summaryRes = await axiosGet('/syndicators/me/summary');
        const summary = summaryRes?.data?.data as SummaryResponse | undefined;
        const recent = Array.isArray(summary?.recentApplications) ? summary.recentApplications : [];
        const hit = recent.find((r) =>
          matchesDealKey(r.dealId, r.applicationId, r.allocationId),
        );
        if (hit) {
          applicationUuid = hit.applicationUuid;
          fundedAmount = num(hit.fundedAmount);
          paybackAmount = num(hit.paybackAmount);
          collectedAmount = num(hit.collectedAmount);
          remainingAmount = num(hit.remainingAmount);
          dealName = hit.dealDisplayName?.trim() || dealName;
          displayDealId = syndicatorDealIdDisplay(hit.dealId, hit.applicationId);
        }
      } catch {
        /* fall through to allocation list */
      }

      if (!applicationUuid) {
        const listRes = await axiosGet(`/application-syndicators/by-syndicator/${me.id}`);
        const rows = Array.isArray(listRes?.data?.data) ? (listRes.data.data as AllocationRow[]) : [];
        const row = rows.find((d) =>
          matchesDealKey(d.application?.dealId, d.application?.applicationId ?? null, d.id),
        );
        if (!row) {
          setDeal(null);
          return;
        }
        applicationUuid = row.applicationId;
        fundedAmount = num(row.fundedAmount);
        paybackAmount = num(row.paybackAmount);
        collectedAmount = num(row.collectedAmount);
        remainingAmount = num(row.remainingAmount);
        dealName =
          row.application?.dealDisplayName?.trim() ||
          row.merchantName?.trim() ||
          row.application?.businessName?.trim() ||
          dealName;
        displayDealId = syndicatorDealIdDisplay(row.application?.dealId, row.application?.applicationId ?? null);
      }

      const txRes = await axiosGet(`/syndicators/${me.id}/wallet-transactions`);
      const allTx = Array.isArray(txRes?.data?.data) ? (txRes.data.data as WalletRow[]) : [];
      const forApp = allTx.filter((t) => t.applicationId === applicationUuid);

      const transactions: PayoutTxn[] = forApp.map((t) => {
        const merchant =
          t.merchantName?.trim() ||
          t.application?.dealDisplayName?.trim() ||
          '—';
        const d = formatDate(t.date, '—');
        return {
          trsDate: d,
          merchantName: merchant,
          amount: num(t.amount),
          category: categoryLabel(t.paymentType),
          paymentType: syndicatorWalletPaymentTypeDisplay(t.paymentType),
          description: t.description?.trim() || '—',
          createdAt: d,
          updatedAt: '—',
        };
      });

      setDeal({
        dealId: displayDealId,
        merchantCode: '—',
        dealName,
        fundedAmount,
        paybackAmount,
        collectedAmount,
        remainingAmount,
        openContracts: 0,
        transactions,
      });
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not load deal';
      toast.error(msg);
      setDeal(null);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-5 text-foreground">
        <div className="text-sm text-muted-foreground">Loading deal…</div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-5 text-foreground">
        <div className="text-lg font-bold mb-4">Deal not found</div>
        <Button onClick={() => navigate('/syndicator-payouts')} variant="outline">
          <ArrowLeft size={14} className="mr-2" /> Back to Payouts
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-4 bg-background p-5 text-foreground md:px-8">
      <Button onClick={() => navigate('/syndicator-payouts')} variant="outline" className="h-8 text-[11px] font-bold">
        <ArrowLeft size={14} className="mr-2" /> Back to Payouts
      </Button>
      <SyndicatorPayoutDetail deal={deal} />
    </div>
  );
}

function SyndicatorPayoutDetail({ deal }: { deal: PayoutDeal }) {
  const rows = deal.transactions.slice(0, 50);
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between bg-primary px-5 py-4 text-primary-foreground">
        <div className="text-[18px] font-black">{deal.dealName}</div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            className="h-8 border border-primary-foreground/25 bg-primary-foreground/10 px-4 text-[11px] font-bold text-primary-foreground hover:bg-primary-foreground/20"
          >
            Report Payment
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className="h-8 border border-primary-foreground/25 bg-primary-foreground/10 px-4 text-[11px] font-bold text-primary-foreground hover:bg-primary-foreground/20"
              >
                Payment Issues
                <ChevronDown size={14} className="ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem>Refund Payment</DropdownMenuItem>
              <DropdownMenuItem>Mark as Disputed</DropdownMenuItem>
              <DropdownMenuItem>Request Investigation</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="bg-muted/40 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[11px] font-bold text-muted-foreground">Funded Amount</div>
            <div className="text-[14px] font-black text-primary">{formatCurrency(deal.fundedAmount)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[11px] font-bold text-muted-foreground">Payback Amount</div>
            <div className="text-[14px] font-black text-primary">{formatCurrency(deal.paybackAmount)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[11px] font-bold text-muted-foreground">Collected Amount</div>
            <div className="text-[14px] font-black text-primary">{formatCurrency(deal.collectedAmount)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[11px] font-bold text-muted-foreground">Remaining Amount</div>
            <div className="text-[14px] font-black text-primary">{formatCurrency(deal.remainingAmount)}</div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-foreground">Transactions</div>
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                {[
                  'TRANSACTION DATE',
                  'MERCHANT NAME',
                  'AMOUNT',
                  'CATEGORY',
                  'PAYMENT TYPE',
                  'DESCRIPTION',
                  'CREATED AT',
                  'UPDATED AT',
                ].map((h) => (
                  <TableHead key={h} className="text-[10px] font-bold text-muted-foreground">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-[11px] text-muted-foreground text-left py-8">
                    No wallet transactions for this deal.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((t, i) => (
                  <TableRow key={`${deal.dealId}-${i}`}>
                    <TableCell className="text-[11px] text-muted-foreground">{t.trsDate}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{t.merchantName}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground tabular-nums">
                      {formatCurrency(t.amount)}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{t.category}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground uppercase">
                      {t.paymentType}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{t.description}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{t.createdAt}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{t.updatedAt}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
