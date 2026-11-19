import { useState } from 'react';
import { axiosPost } from '@/redux/axios';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'react-toastify';

type TxKind = 'WALLET_CREDIT' | 'WITHDRAW' | '';

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syndicatorId: string;
  onSuccess: () => void;
};

export default function AddSyndicatorWalletBalanceDialog({
  open,
  onOpenChange,
  syndicatorId,
  onSuccess,
}: Props) {
  const [txDate, setTxDate] = useState(todayISODate);
  const [amount, setAmount] = useState('');
  const [txType, setTxType] = useState<TxKind>('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTxDate(todayISODate());
    setAmount('');
    setTxType('');
    setDescription('');
  };

  const handleSubmit = async () => {
    const n = parseFloat(amount.trim());
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a valid amount greater than zero.');
      return;
    }
    if (txType !== 'WALLET_CREDIT' && txType !== 'WITHDRAW') {
      toast.error('Select a transaction type.');
      return;
    }
    setSaving(true);
    try {
      await axiosPost(`/syndicators/${syndicatorId}/wallet-balance`, {
        amount: n,
        paymentType: txType,
        description: description.trim() || (txType === 'WALLET_CREDIT' ? 'Wallet credit' : 'Withdraw'),
        date: txDate,
      });
      toast.success('Wallet updated');
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not save wallet transaction';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle className="text-xl font-semibold">Add Wallet Balance</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4">
          <div className="grid gap-2">
            <Label htmlFor="wallet-tx-date">Date</Label>
            <Input
              id="wallet-tx-date"
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wallet-tx-amount">Amount</Label>
            <Input
              id="wallet-tx-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wallet-tx-type">Transaction Type</Label>
            <Select
              value={txType === '' ? undefined : txType}
              onValueChange={(v: string) => setTxType(v as 'WALLET_CREDIT' | 'WITHDRAW')}
            >
              <SelectTrigger id="wallet-tx-type" className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="WALLET_CREDIT">Wallet Credit</SelectItem>
                <SelectItem value="WITHDRAW">Withdraw</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wallet-tx-desc">Description</Label>
            <Input
              id="wallet-tx-desc"
              placeholder="Notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
