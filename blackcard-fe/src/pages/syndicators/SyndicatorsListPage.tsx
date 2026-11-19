import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
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
import { UserPlus, Trash2, Pencil, Search, ChevronRight, Users, CircleDollarSign, Wallet, ArrowUpRight } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { axiosDelete, axiosGet, axiosPut } from '@/redux/axios';
import SyndicatorsSectionTabs from '@/components/syndicators/SyndicatorsSectionTabs';
import SyndicatorAdminStatCard from '@/pages/syndicators/admin/SyndicatorAdminStatCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'react-toastify';
import AddUserModal from '@/pages/settings/AddUserModal';
import { fetchUsersByRole } from '@/redux/actions/settingsUserActions';
import { invalidateRoleCache } from '@/redux/slices/settingsUsersSlice';
import type { AppDispatch } from '@/redux/store';
import { formatUSPhoneNumber, handleUSPhoneInputChange } from '@/utils/formatPhoneNumber';
import { formatUSD, formatUSDShort } from '@/utils/formatCurrency';

const SETTINGS_SYNDICATORS_TAB_ID = 'SYNDICATORS';

export type SyndicatorRecord = {
  id: number;
  firstName: string;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  companyName?: string | null;
  role?: string | null;
  status?: string | null;
  currentBalance?: unknown;
  createdAt?: string;
  // aggregates added by GET /syndicators
  dealCount?: number;
  amountSyndicated?: unknown;
  collectedAmount?: unknown;
  remainingAmount?: unknown;
  commissionAmount?: unknown;
};

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const toCurrency = (value: unknown) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num(value));

const compactCurrency = (value: unknown) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(num(value));

/** Imported placeholder emails look like IMPORT-X@SYNDICATORS.INVALID — don't surface them. */
const isRealEmail = (email?: string | null) =>
  !!email && !/@syndicators\.invalid$/i.test(email) && !/^import-/i.test(email);

function StatusBadge({ status }: { status?: string | null }) {
  const s = String(status ?? '').toUpperCase();
  const tone =
    s === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
      : s === 'SUSPENDED'
        ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {status ?? '—'}
    </span>
  );
}

export default function SyndicatorsListPage() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [list, setList] = useState<SyndicatorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<SyndicatorRecord | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosGet('/syndicators');
      const data = res?.data?.data;
      setList(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load syndicators';
      toast.error(msg);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const totals = useMemo(() => {
    const syndicated = list.reduce((a, r) => a + num(r.amountSyndicated), 0);
    const collected = list.reduce((a, r) => a + num(r.collectedAmount), 0);
    return {
      count: list.length,
      syndicated,
      collected,
      remaining: list.reduce((a, r) => a + num(r.remainingAmount), 0),
      abovePrincipal: collected - syndicated,
    };
  }, [list]);

  /** Top syndicators by invested → invested / repaid / above-principal bars. */
  const chartData = useMemo(() => {
    return [...list]
      .sort((a, b) => num(b.amountSyndicated) - num(a.amountSyndicated))
      .slice(0, 8)
      .map((r) => {
        const invested = num(r.amountSyndicated);
        const repaid = num(r.collectedAmount);
        return {
          name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.companyName || `#${r.id}`,
          invested,
          repaid,
          above: repaid - invested,
        };
      });
  }, [list]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = !q
      ? list
      : list.filter((r) => {
          const name = [r.firstName, r.lastName].filter(Boolean).join(' ');
          return [name, r.companyName, isRealEmail(r.email) ? r.email : '']
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q);
        });
    // Biggest portfolios first; zero-deal imported stubs sink to the bottom.
    return [...rows].sort((a, b) => num(b.amountSyndicated) - num(a.amountSyndicated));
  }, [list, search]);

  const openEdit = (row: SyndicatorRecord) => {
    setEditRow(row);
    setEditFirstName(row.firstName ?? '');
    setEditLastName(row.lastName ?? '');
    setEditEmail(row.email ?? '');
    setEditPhone(row.phone ?? '');
    setEditCompany(row.companyName ?? '');
  };

  const closeEdit = () => {
    setEditRow(null);
    setEditSaving(false);
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    const fn = editFirstName.trim();
    const ln = editLastName.trim();
    const em = editEmail.trim().toLowerCase();
    if (!fn || !em) {
      toast.error('First name and email are required');
      return;
    }
    setEditSaving(true);
    try {
      await axiosPut(`/syndicators/${editRow.id}`, {
        firstName: fn,
        lastName: ln || undefined,
        email: em,
        phone: editPhone.trim() || undefined,
        companyName: editCompany.trim() || undefined,
      });
      toast.success('Syndicator updated');
      closeEdit();
      void loadList();
      dispatch(invalidateRoleCache(SETTINGS_SYNDICATORS_TAB_ID));
      void dispatch(fetchUsersByRole(SETTINGS_SYNDICATORS_TAB_ID));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not update syndicator';
      toast.error(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (row: SyndicatorRecord) => {
    if (
      !window.confirm(
        `Delete syndicator "${[row.firstName, row.lastName].filter(Boolean).join(' ')}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await axiosDelete(`/syndicators/${row.id}`);
      toast.success('Syndicator removed');
      void loadList();
      dispatch(invalidateRoleCache(SETTINGS_SYNDICATORS_TAB_ID));
      void dispatch(fetchUsersByRole(SETTINGS_SYNDICATORS_TAB_ID));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not delete syndicator';
      toast.error(msg);
    }
  };

  const openDetail = (id: number) => navigate(`/syndicators/syndicators-list/${id}/profile`);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <SyndicatorsSectionTabs />

        {/* Totals */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SyndicatorAdminStatCard label="Syndicators" value={String(totals.count)} icon={Users} accent="violet" />
          <SyndicatorAdminStatCard
            label="Invested"
            value={formatUSDShort(totals.syndicated)}
            title={formatUSD(totals.syndicated)}
            icon={CircleDollarSign}
            accent="violet"
          />
          <SyndicatorAdminStatCard
            label="Repayment"
            value={formatUSDShort(totals.collected)}
            title={formatUSD(totals.collected)}
            icon={Wallet}
            accent="emerald"
          />
          <SyndicatorAdminStatCard
            label="Above principal"
            value={`${totals.abovePrincipal >= 0 ? '+' : '−'}${formatUSDShort(Math.abs(totals.abovePrincipal))}`}
            title={formatUSD(totals.abovePrincipal)}
            icon={ArrowUpRight}
            accent={totals.abovePrincipal >= 0 ? 'emerald' : 'red'}
            toneClassName={
              totals.abovePrincipal >= 0
                ? 'border-emerald-200 bg-gradient-to-br from-emerald-100 via-emerald-50 to-white dark:border-emerald-900/50 dark:from-emerald-950/50 dark:via-emerald-950/20 dark:to-transparent'
                : 'border-red-200 bg-gradient-to-br from-red-100 via-red-50 to-white dark:border-red-900/50 dark:from-red-950/50 dark:via-red-950/20 dark:to-transparent'
            }
          />
        </div>

        {/* Investment vs repayment chart */}
        {!loading && chartData.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Top syndicators — invested vs repaid</p>
                <p className="text-xs text-muted-foreground">Invested, repaid and above-principal across the biggest partners.</p>
              </div>
              <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-violet-500" /> Invested</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-500" /> Repaid</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 46)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                barGap={2}
                barCategoryGap={14}
              >
                <CartesianGrid horizontal={false} stroke={isDark ? '#2A2B2F' : '#EEF1F6'} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatUSDShort(v as number)}
                  tick={{ fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 11, fill: isDark ? '#d1d5db' : '#374151' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: isDark ? '#ffffff08' : '#00000005' }}
                  formatter={(value, name) => [formatUSD(Number(value ?? 0)), String(name)] as [string, string]}
                  contentStyle={{
                    background: isDark ? '#141517' : '#ffffff',
                    border: `1px solid ${isDark ? '#2A2B2F' : '#E8EBF2'}`,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="invested" name="Invested" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="repaid" name="Repaid" fill="#10b981" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold text-foreground">Syndicators list</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search name or company"
                className="w-full pl-8 sm:w-[260px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search syndicators"
              />
            </div>
            <Button className="gap-2 shrink-0" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Add syndicator
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            Loading syndicators…
          </div>
        ) : !filtered.length ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            {list.length ? 'No syndicators match your search.' : 'No syndicators yet.'}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-[10px] font-bold text-muted-foreground">Syndicator</TableHead>
                  <TableHead className="text-[10px] font-bold text-muted-foreground text-right">Deals</TableHead>
                  <TableHead className="text-[10px] font-bold text-muted-foreground text-right">Invested</TableHead>
                  <TableHead className="text-[10px] font-bold text-muted-foreground text-right">Repayment</TableHead>
                  <TableHead className="text-[10px] font-bold text-muted-foreground text-right">Above principal</TableHead>
                  <TableHead className="text-[10px] font-bold text-muted-foreground text-right">Wallet</TableHead>
                  <TableHead className="text-[10px] font-bold text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-[10px] font-bold text-muted-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || '—';
                  const sub = row.companyName || (isRealEmail(row.email) ? row.email : null);
                  return (
                    <TableRow
                      key={row.id}
                      className="group border-b border-border cursor-pointer hover:bg-muted/40"
                      onClick={() => openDetail(row.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openDetail(row.id);
                        }
                      }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {(row.firstName?.[0] ?? '?').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{name}</p>
                            {sub ? (
                              <p className="text-xs text-muted-foreground truncate">{sub}</p>
                            ) : (
                              <p className="text-xs text-muted-foreground/60 italic">#{row.id}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.dealCount ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium" title={toCurrency(row.amountSyndicated)}>
                        {compactCurrency(row.amountSyndicated)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400" title={toCurrency(row.collectedAmount)}>
                        {compactCurrency(row.collectedAmount)}
                      </TableCell>
                      {(() => {
                        const above = num(row.collectedAmount) - num(row.amountSyndicated);
                        return (
                          <TableCell
                            className={cn(
                              'text-right tabular-nums font-medium',
                              above >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                            )}
                            title={toCurrency(above)}
                          >
                            {above >= 0 ? '+' : '−'}
                            {compactCurrency(Math.abs(above))}
                          </TableCell>
                        );
                      })()}
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {toCurrency(row.currentBalance)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors"
                            onClick={() => handleDelete(row)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </button>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AddUserModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        role={SETTINGS_SYNDICATORS_TAB_ID}
        roleName="Syndicator"
        createSyndicatorProfile
        onSuccess={() => void loadList()}
      />

      <Dialog open={!!editRow} onOpenChange={(open: boolean) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit syndicator</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-first">First name</Label>
              <Input
                id="edit-first"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                disabled={editSaving}
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-last">Last name</Label>
              <Input
                id="edit-last"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                disabled={editSaving}
                autoComplete="family-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                disabled={editSaving}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                type="tel"
                placeholder="(XXX) XXX-XXXX"
                value={formatUSPhoneNumber(editPhone)}
                onChange={(e) => handleUSPhoneInputChange(e, setEditPhone)}
                disabled={editSaving}
                inputMode="numeric"
                autoComplete="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-company">Company</Label>
              <Input
                id="edit-company"
                value={editCompany}
                onChange={(e) => setEditCompany(e.target.value)}
                disabled={editSaving}
                autoComplete="organization"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeEdit} disabled={editSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveEdit()} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
