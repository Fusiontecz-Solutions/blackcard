import { useEffect, useMemo, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { axiosGet } from "@/redux/axios";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatUSD } from "@/lib/utils";

type LedgerKind = "FUNDING" | "COMMISSION";

type DealLedger = {
  dealId: string | null;
  entries: Array<{
    id: string;
    kind: LedgerKind;
    date: string;
    amount: number;
    description: string;
  }>;
  totals: {
    fundingWired: number;
    commissionPaid: number;
    commissionOwed: number | null;
    commissionBalance: number | null;
  };
  payouts: Array<{ iso: string | null; status: "PENDING" | "PAID" | "CLAWBACKS"; paidAt: string | null }>;
};

const KIND_LABEL: Record<LedgerKind, string> = {
  FUNDING: "Funding wire",
  COMMISSION: "ISO commission",
};

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
};

/**
 * Funding wires to the merchant and ISO commission payouts for one deal, synced daily from the
 * Google Sheet bank ledger (Bank1).
 */
export default function FundingCommissionTab({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<DealLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | LedgerKind>("ALL");

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    axiosGet(`/collection-payments/deal-ledger/${encodeURIComponent(applicationId)}`)
      .then((res) => {
        if (!cancelled) setData(res.data?.data ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || "Could not load funding and commission entries.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const rows = useMemo(
    () => (data?.entries ?? []).filter((e) => filter === "ALL" || e.kind === filter),
    [data, filter],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Loading funding and commission…</span>
      </div>
    );
  }
  if (error) {
    return (
      <p className="py-8 text-center text-destructive" role="alert">
        {error}
      </p>
    );
  }
  if (!data) return null;

  const t = data.totals;
  const payout = data.payouts[0];
  const cards: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Funding wired", value: formatUSD(t.fundingWired) },
    { label: "Commission owed", value: t.commissionOwed === null ? "—" : formatUSD(t.commissionOwed) },
    { label: "Commission paid", value: formatUSD(t.commissionPaid) },
    {
      label: "Commission balance",
      value: t.commissionBalance === null ? "—" : formatUSD(t.commissionBalance),
      hint: payout
        ? `${payout.iso ?? "ISO"}: ${payout.status.toLowerCase()}${payout.paidAt ? ` (${formatDate(payout.paidAt)})` : ""}`
        : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">{c.value}</p>
            {c.hint ? <p className="mt-1 text-xs text-muted-foreground capitalize">{c.hint}</p> : null}
          </div>
        ))}
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {(["ALL", "FUNDING", "COMMISSION"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filter === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "ALL" ? "All" : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Wallet className="h-8 w-8" />
            <p>No funding or commission entries synced from the sheet yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="min-w-[240px]">Description</TableHead>
                <TableHead className="pr-4 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="pl-4 whitespace-nowrap text-foreground">{formatDate(e.date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{KIND_LABEL[e.kind]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[360px] whitespace-normal break-words text-foreground">
                    {e.description}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "pr-4 text-right tabular-nums",
                      e.amount < 0 ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {formatUSD(e.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Synced daily from the Google Sheet bank ledger. Negative amounts are money returned.
      </p>
    </div>
  );
}
