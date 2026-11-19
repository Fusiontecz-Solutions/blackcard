/**
 * Paginated list of applications behind any report number.
 * Usage: <DrillDownTable filters={filters} query={{ dateField: 'fundedAt', stage: 'Funded' }} title="Funded deals" />
 */
import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fmtMoney } from './format';
import { DEFAULT_COLUMNS, applicationHref } from './drillDown';
import { reportApi, type ApplicationRow, type ReportFilters } from './reportApi';

export interface DrillQuery {
  dateField?: 'createdAtTenant' | 'approvedAt' | 'fundedAt' | 'declinedAt' | 'contractSentAt' | 'contractSignedAt' | 'none';
  stage?: string;
  bookId?: string;
  sortBy?: 'createdAtTenant' | 'fundedAt' | 'approvedAmount' | 'fundedAmount' | 'merchantName' | 'stage' | 'updatedAtTenant';
  sortDir?: 'asc' | 'desc';
}

type Col = { key: string; label: string; align?: 'left' | 'right'; render: (r: ApplicationRow) => React.ReactNode };

const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—');

const ALL_COLUMNS: Record<string, Col> = {
  book: { key: 'book', label: 'Book', render: (r) => r.bookCode ?? '—' },
  application: { key: 'application', label: 'App #', render: (r) => r.applicationNumericId ?? r.dealId ?? '—' },
  merchant: { key: 'merchant', label: 'Merchant', render: (r) => <span className="font-medium text-foreground">{r.merchantName ?? '—'}</span> },
  type: { key: 'type', label: 'Type', render: (r) => r.dealType ?? '—' },
  stage: { key: 'stage', label: 'Stage', render: (r) => r.stageLabel },
  agent: { key: 'agent', label: 'Agent', render: (r) => r.agentName ?? '—' },
  underwriter: { key: 'underwriter', label: 'Underwriter', render: (r) => r.underwriterName ?? '—' },
  requested: { key: 'requested', label: 'Requested', align: 'right', render: (r) => fmtMoney(r.requestedAmount) },
  approved: { key: 'approved', label: 'Approved', align: 'right', render: (r) => fmtMoney(r.approvedAmount) },
  funded: { key: 'funded', label: 'Funded', align: 'right', render: (r) => fmtMoney(r.fundedAmount) },
  commission: { key: 'commission', label: 'Commission', align: 'right', render: (r) => fmtMoney(r.commissionAmount) },
  balance: { key: 'balance', label: 'Balance due', align: 'right', render: (r) => fmtMoney(r.balanceDue) },
  created: { key: 'created', label: 'Created', render: (r) => date(r.createdAtTenant) },
  approvedAt: { key: 'approvedAt', label: 'Approved on', render: (r) => date(r.approvedAt) },
  fundedAt: { key: 'fundedAt', label: 'Funded on', render: (r) => date(r.fundedAt) },
  declinedAt: { key: 'declinedAt', label: 'Declined on', render: (r) => date(r.declinedAt) },
  sentAt: { key: 'sentAt', label: 'Contract sent', render: (r) => date(r.contractSentAt) },
  signedAt: { key: 'signedAt', label: 'Signed', render: (r) => date(r.contractSignedAt) },
  updated: { key: 'updated', label: 'Updated', render: (r) => date(r.updatedAtTenant) },
};

export function DrillDownTable({
  filters,
  query = {},
  columns = DEFAULT_COLUMNS,
  title,
  pageSize = 25,
  className,
}: {
  filters: ReportFilters;
  query?: DrillQuery;
  columns?: string[];
  title?: string;
  pageSize?: number;
  className?: string;
}) {
  const [page, setPage] = useState(1);
  const key = useMemo(() => JSON.stringify({ filters, query, page, pageSize }), [filters, query, page, pageSize]);
  const q = useQuery({
    queryKey: ['reports', 'applications', key],
    queryFn: () => reportApi.applications(filters, { ...query, page, limit: pageSize }),
    placeholderData: keepPreviousData,
  });
  const cols = columns.map((c) => ALL_COLUMNS[c]).filter(Boolean);
  const rows = q.data?.data ?? [];
  const pg = q.data?.pagination;

  return (
    <section className={cn('rounded-xl border border-border bg-card', className)}>
      {(title || pg) && (
        <header className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">{title ?? 'Submissions'}</h3>
          {pg ? <span className="text-xs text-muted-foreground">{pg.total.toLocaleString()} total</span> : null}
        </header>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border bg-muted/40 text-xs text-muted-foreground">
              {cols.map((c) => (
                <th key={c.key} scope="col" className={cn('px-3 py-2 font-medium', c.align === 'right' ? 'text-right' : 'text-left')}>
                  {c.label}
                </th>
              ))}
              <th scope="col" className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {q.isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    {cols.map((c) => (
                      <td key={c.key} className="px-3 py-2">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                    <td />
                  </tr>
                ))
              : rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    {cols.map((c) => (
                      <td key={c.key} className={cn('px-3 py-2 text-foreground', c.align === 'right' && 'text-right tabular-nums')}>
                        {c.render(r)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <Link to={applicationHref(r)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" title="Open application">
                        Open <ExternalLink className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
            {!q.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length + 1} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No applications match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pg && pg.totalPages > 1 ? (
        <footer className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
          <span>
            Page {pg.page} of {pg.totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= pg.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

export default DrillDownTable;
