import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { ArrowLeft, ExternalLink, RefreshCw, RotateCcw, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { axiosGet, axiosPost } from '@/redux/axios';
import type { RootState } from '@/redux/store';
import { normalizeRoleKey, resolveEffectiveRole } from '@/lib/sessionRole';
import { BUSINESS_TIMEZONE, formatDateTimeET } from '@/lib/dateTime';

/** Human labels for ledger skip reasons (BE `skipReason`). */
export const SKIP_REASON_LABELS: Record<string, string> = {
  self_sent: 'Sent by the mailbox itself',
  crm_template: 'CRM template email',
  docusign_or_esign: 'DocuSign / e-sign',
  single_attachment: 'Fewer than 2 PDFs',
  duplicate: 'Already created (duplicate)',
  unknown: 'unknown (before logging)',
};

type SkippedRow = {
  id: string;
  mailbox: string | null;
  gmailMessageId: string;
  gmailUrl: string;
  outcome: string;
  skipReason: string;
  skipDetail: string | null;
  subject: string | null;
  fromEmail: string | null;
  pdfCount: number | null;
  reviewedAt: string | null;
  createdAt: string;
};

type ListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: SkippedRow[];
};

const PAGE_SIZE = 25;

/** `YYYY-MM-DD` (US Eastern) → ISO instant at the start / end of that ET day. */
function etDayBoundaryIso(ymd: string, endOfDay: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  const guess = new Date(`${ymd}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  const asEt = Date.parse(guess.toLocaleString('en-US', { timeZone: BUSINESS_TIMEZONE }));
  const asUtc = Date.parse(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (asEt - asUtc)).toISOString();
}

/** Page numbers with ellipses: 1 … 4 5 6 … 20 */
function pageList(current: number, total: number): Array<number | '…'> {
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(pages).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

export default function GmailSkippedEmails() {
  const navigate = useNavigate();
  const loginUser = useSelector((s: RootState) => s.login?.data?.user);
  const roleKey = normalizeRoleKey(resolveEffectiveRole(loginUser));
  const isAdmin = roleKey === 'ADMIN' || roleKey === 'SUPER_ADMIN';

  const [page, setPage] = useState(1);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'open' | 'dismissed' | 'all'>('open');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [reason, status, fromDate, toDate, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axiosGet('/gmail/auto-create/skipped', {
        params: {
          page,
          pageSize: PAGE_SIZE,
          status,
          reason: reason || undefined,
          search: search || undefined,
          from: fromDate ? etDayBoundaryIso(fromDate, false) : undefined,
          to: toDate ? etDayBoundaryIso(toDate, true) : undefined,
        },
      });
      setData(response.data?.data ?? null);
      setSelected(new Set());
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load skipped emails');
    } finally {
      setLoading(false);
    }
  }, [page, status, reason, search, fromDate, toDate]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const rows = data?.rows ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pages = useMemo(() => pageList(data?.page ?? 1, data?.totalPages ?? 1), [data]);

  const retry = async (ids: string[], force = false) => {
    if (ids.length === 0) return;
    if (
      force &&
      !window.confirm('Force retry ignores the skip rules and will try to create a deal. Continue?')
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await axiosPost('/gmail/auto-create/skipped/retry', { ids, force });
      const results: Array<{ ok: boolean; labelError?: string }> = response.data?.data?.results ?? [];
      const ok = results.filter((r) => r.ok).length;
      const labelErrors = results.filter((r) => r.ok && r.labelError).length;
      toast.success(`${ok} email${ok === 1 ? '' : 's'} queued — picked up on the next Gmail poll`);
      if (labelErrors) {
        toast.warn(
          `${labelErrors} email${labelErrors === 1 ? '' : 's'}: could not remove the crm-skipped label in Gmail — remove it manually`,
        );
      }
      if (ok < results.length) toast.error(`${results.length - ok} could not be retried`);
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Retry failed');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await axiosPost('/gmail/auto-create/skipped/dismiss', { ids });
      toast.success(`Dismissed ${ids.length}`);
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Dismiss failed');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return <Navigate to="/gmail" replace />;
  }

  const selectClass =
    'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground';

  return (
    <div className="crm-keep-case min-h-[calc(100vh-64px)] w-full bg-background p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/gmail')} title="Back to Gmail">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Skipped emails</h1>
            <p className="text-sm text-muted-foreground">
              Mail Gmail auto-create filtered out (labelled <code>crm-skipped</code>). Retry re-checks it on the
              next poll; dismiss keeps it skipped.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="gap-2 cursor-pointer">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <Input
          className="w-64"
          placeholder="Search subject, sender, message id"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">All reasons</option>
          {Object.entries(SKIP_REASON_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value as 'open' | 'dismissed' | 'all')}
        >
          <option value="open">Needs review</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </select>
        <label className="text-xs text-muted-foreground flex flex-col">
          From (ET)
          <Input type="date" className="w-40" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col">
          To (ET)
          <Input type="date" className="w-40" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        {selected.size > 0 && (
          <div className="flex gap-2 ml-auto">
            <Button disabled={busy} onClick={() => retry(Array.from(selected))} className="gap-2 cursor-pointer">
              <RotateCcw className="h-4 w-4" />
              Retry {selected.size}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => dismiss(Array.from(selected))}
              className="gap-2 cursor-pointer"
            >
              <EyeOff className="h-4 w-4" />
              Dismiss {selected.size}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(v: boolean | 'indeterminate') =>
                    setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())
                  }
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Date (ET)</TableHead>
              <TableHead>Sender</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No skipped emails
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={(v: boolean | 'indeterminate') =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        })
                      }
                      aria-label="Select row"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTimeET(row.createdAt, '—')}</TableCell>
                  <TableCell className="text-sm max-w-[220px] truncate" title={row.fromEmail || ''}>
                    {row.fromEmail || '—'}
                  </TableCell>
                  <TableCell className="text-sm max-w-[320px]">
                    <a
                      href={row.gmailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                      title={`Open in Gmail (${row.mailbox || 'mailbox'}) — ${row.gmailMessageId}`}
                    >
                      <span className="truncate">{row.subject || `(message ${row.gmailMessageId})`}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {SKIP_REASON_LABELS[row.skipReason] || row.skipReason}
                    {row.reviewedAt && <span className="ml-1 text-xs text-muted-foreground">(dismissed)</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[280px] break-words">
                    {row.skipDetail || '—'}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => retry([row.id])} className="cursor-pointer">
                      Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => retry([row.id], true)}
                      className="ml-1 cursor-pointer"
                      title="Retry and ignore the skip rules for this email"
                    >
                      Force
                    </Button>
                    {!row.reviewedAt && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => dismiss([row.id])} className="ml-1 cursor-pointer">
                        Dismiss
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-muted-foreground">
            {data.total} email{data.total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Prev
            </Button>
            {pages.map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="px-2 text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  size="sm"
                  variant={p === page ? 'default' : 'outline'}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ),
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
