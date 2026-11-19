import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { CalendarClock, Loader2, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { DEFAULT_FILTERS, PRESETS, getReportErrorMessage, reportApi, type Preset, type ReportKey, type ReportSchedule } from '../reportApi';
import type { TabProps } from './types';

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

const REPORT_TITLES: Record<ReportKey, string> = {
  overview: 'Overview',
  books: 'Book performance',
  cases: 'Cases overview',
  contracts: 'Contracts overview',
  funding: 'Funding overview',
  collections: 'Collections',
  daily: 'Daily working overview',
  team: 'Team performance',
  applications: 'Applications list',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function frequencySummary(s: ReportSchedule): string {
  const hm = `${pad2(s.hourLocal)}:${pad2(s.minuteLocal)}`;
  switch (s.frequency) {
    case 'daily':
      return `Daily at ${hm} ${s.timezone}`;
    case 'weekdays':
      return `Weekdays at ${hm} ${s.timezone}`;
    case 'weekly':
      return `Weekly on ${DAY_NAMES[s.dayOfWeek ?? 1] ?? 'Mon'} at ${hm}`;
    case 'monthly':
      return `Monthly on day ${s.dayOfMonth ?? 1}`;
    default:
      return s.frequency;
  }
}

function parseRecipients(text: string): { valid: string[]; invalid: string[] } {
  const parts = text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) (EMAIL_RE.test(p) ? valid : invalid).push(p);
  return { valid: [...new Set(valid)], invalid };
}

interface FormState {
  name: string;
  reportKey: ReportKey;
  preset: Preset;
  bookIds: string[];
  frequency: ReportSchedule['frequency'];
  hourLocal: number;
  minuteLocal: number;
  dayOfWeek: number;
  dayOfMonth: number;
  timezone: string;
  recipientsText: string;
  format: 'xlsx' | 'csv';
  enabled: boolean;
}

function emptyForm(): FormState {
  return {
    name: '',
    reportKey: 'overview',
    preset: 'last30',
    bookIds: [],
    frequency: 'weekdays',
    hourLocal: 7,
    minuteLocal: 0,
    dayOfWeek: 1,
    dayOfMonth: 1,
    timezone: 'America/New_York',
    recipientsText: '',
    format: 'xlsx',
    enabled: true,
  };
}

function formFromSchedule(s: ReportSchedule): FormState {
  const filters = s.filters as Partial<{ preset: Preset; bookIds: string[] }>;
  return {
    name: s.name,
    // Digest schedules are edited in the Daily email tab; fall back to a spreadsheet report here.
    reportKey: (s.reportKey === 'digest' ? 'daily' : s.reportKey) as ReportKey,
    preset: filters.preset ?? 'last30',
    bookIds: filters.bookIds ?? [],
    frequency: s.frequency,
    hourLocal: s.hourLocal,
    minuteLocal: s.minuteLocal,
    dayOfWeek: s.dayOfWeek ?? 1,
    dayOfMonth: s.dayOfMonth ?? 1,
    timezone: s.timezone,
    recipientsText: s.recipients.join('\n'),
    format: s.format,
    enabled: s.enabled,
  };
}

function StatusBadge({ status, error }: { status: string | null; error: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">Never run</span>;
  const tone =
    status === 'sent'
      ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : status === 'skipped'
        ? 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10'
        : 'text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/10';
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize', tone)} title={error ?? undefined}>
      {status}
    </span>
  );
}

function RecipientChips({ recipients }: { recipients: string[] }) {
  if (recipients.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const shown = recipients.slice(0, 2);
  const rest = recipients.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((r) => (
        <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
          {r}
        </span>
      ))}
      {rest > 0 ? <span className="text-[11px] text-muted-foreground">+{rest} more</span> : null}
    </div>
  );
}

export default function SchedulesTab(props: TabProps) {
  // This tab has no filter bar (ReportsHub renders it only for the other tabs) and owns its own data.
  void props;
  const { can } = usePermissions();
  const allowed = can('reports.schedule');
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['reports', 'schedules'],
    queryFn: async () => (await reportApi.schedules()).data,
    placeholderData: keepPreviousData,
  });
  const optionsQ = useQuery({
    queryKey: ['reports', 'schedules', 'book-options'],
    queryFn: async () => (await reportApi.options(DEFAULT_FILTERS)).data,
    staleTime: 5 * 60 * 1000,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReportSchedule | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReportSchedule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  // Designed daily emails (reportKey 'digest') are managed in the Daily email tab.
  const schedules = (q.data ?? []).filter((s) => s.reportKey !== 'digest');
  const books = optionsQ.data?.books ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };
  const openEdit = (s: ReportSchedule) => {
    setEditing(s);
    setForm(formFromSchedule(s));
    setDialogOpen(true);
  };

  const { valid: recipientsValid, invalid: recipientsInvalid } = useMemo(() => parseRecipients(form.recipientsText), [form.recipientsText]);
  const canSubmit = form.name.trim().length > 0 && recipientsValid.length > 0 && recipientsInvalid.length === 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload: Partial<ReportSchedule> = {
        name: form.name.trim(),
        reportKey: form.reportKey,
        filters: { preset: form.preset, bookIds: form.bookIds },
        frequency: form.frequency,
        hourLocal: form.hourLocal,
        minuteLocal: form.minuteLocal,
        dayOfWeek: form.frequency === 'weekly' ? form.dayOfWeek : null,
        dayOfMonth: form.frequency === 'monthly' ? form.dayOfMonth : null,
        timezone: form.timezone.trim() || 'America/New_York',
        recipients: recipientsValid,
        format: form.format,
        enabled: form.enabled,
      };
      if (editing) await reportApi.updateSchedule(editing.id, payload);
      else await reportApi.createSchedule(payload);
      toast.success(editing ? 'Schedule updated' : 'Schedule created');
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ['reports', 'schedules'] });
    } catch (err) {
      toast.error(getReportErrorMessage(err, 'Could not save schedule'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (s: ReportSchedule, enabled: boolean) => {
    try {
      await reportApi.updateSchedule(s.id, { enabled });
      void qc.invalidateQueries({ queryKey: ['reports', 'schedules'] });
    } catch (err) {
      toast.error(getReportErrorMessage(err, 'Could not update schedule'));
    }
  };

  const runNow = async (s: ReportSchedule) => {
    setRunningId(s.id);
    try {
      const res = await reportApi.runSchedule(s.id);
      const body = res.data as { message?: string; data?: { status?: string } };
      const status = body.data?.status;
      (status === 'failed' ? toast.error : toast.success)(body.message ?? 'Schedule run triggered');
      void qc.invalidateQueries({ queryKey: ['reports', 'schedules'] });
    } catch (err) {
      toast.error(getReportErrorMessage(err, 'Could not run schedule'));
    } finally {
      setRunningId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await reportApi.deleteSchedule(deleteTarget.id);
      toast.success('Schedule deleted');
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: ['reports', 'schedules'] });
    } catch (err) {
      toast.error(getReportErrorMessage(err, 'Could not delete schedule'));
    } finally {
      setDeleting(false);
    }
  };

  const toggleBook = (id: string) => {
    setForm((f) => {
      const set = new Set(f.bookIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...f, bookIds: [...set] };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Scheduled reports</h2>
          <p className="text-sm text-muted-foreground">Automatically email a report on a recurring schedule.</p>
        </div>
        {allowed ? (
          <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
            <Plus className="size-4" /> New schedule
          </Button>
        ) : null}
      </div>

      {q.isError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">{getReportErrorMessage(q.error, 'Could not load schedules')}</div>
      ) : null}

      {!q.isLoading && schedules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <CalendarClock className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">No scheduled reports yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Set up a recurring export — daily, weekly or monthly — and have it emailed to your team automatically.
          </p>
          {allowed ? (
            <Button size="sm" className="mt-4 h-9 gap-1.5" onClick={openCreate}>
              <Plus className="size-4" /> New schedule
            </Button>
          ) : null}
        </div>
      ) : (
        <section className="rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 text-left font-medium">Name</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Report</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Frequency</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Recipients</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Format</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Enabled</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Last run</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Next run</th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td colSpan={9} className="px-3 py-3">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      </tr>
                    ))
                  : schedules.map((s) => (
                      <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                        <td className="px-3 py-2 text-foreground">{s.reportKey === 'digest' ? 'Daily email' : REPORT_TITLES[s.reportKey] ?? s.reportKey}</td>
                        <td className="px-3 py-2 text-foreground">{frequencySummary(s)}</td>
                        <td className="px-3 py-2">
                          <RecipientChips recipients={s.recipients} />
                        </td>
                        <td className="px-3 py-2 uppercase text-foreground">{s.format}</td>
                        <td className="px-3 py-2">
                          <Switch checked={s.enabled} onCheckedChange={(c: boolean) => void toggleEnabled(s, c)} disabled={!allowed} size="sm" />
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={s.lastStatus} error={s.lastError} />
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {allowed ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon-sm" onClick={() => void runNow(s)} disabled={runningId === s.id} title="Run now" aria-label={`Run ${s.name} now`}>
                                {runningId === s.id ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                              </Button>
                              <Button variant="ghost" size="icon-sm" onClick={() => openEdit(s)} title="Edit" aria-label={`Edit ${s.name}`}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(s)} title="Delete" aria-label={`Delete ${s.name}`}>
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">Email delivery requires SMTP to be configured on the server. If it isn't, a run completes with status "skipped".</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit schedule' : 'New schedule'}</DialogTitle>
            <DialogDescription>Runs the selected report and emails it to the recipients below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="sch-name">Name</Label>
              <Input id="sch-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekly funding recap" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sch-report">Report</Label>
                <select
                  id="sch-report"
                  className={cn(selectClass, 'w-full')}
                  value={form.reportKey}
                  onChange={(e) => setForm((f) => ({ ...f, reportKey: e.target.value as ReportKey }))}
                >
                  {(Object.entries(REPORT_TITLES) as [ReportKey, string][]).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sch-preset">Date range</Label>
                <select
                  id="sch-preset"
                  className={cn(selectClass, 'w-full')}
                  value={form.preset}
                  onChange={(e) => setForm((f) => ({ ...f, preset: e.target.value as Preset }))}
                >
                  {PRESETS.filter((p) => p.value !== 'custom').map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">Relative ranges (e.g. "Last 30 days") are recalculated from today's date on every run.</p>

            <div className="space-y-1">
              <Label>Books</Label>
              <div className="max-h-32 overflow-y-auto rounded-md border border-input p-2">
                <label className="flex items-center gap-2 py-0.5 text-sm">
                  <Checkbox checked={form.bookIds.length === 0} onCheckedChange={() => setForm((f) => ({ ...f, bookIds: [] }))} /> All books
                </label>
                {books.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <Checkbox checked={form.bookIds.includes(b.id)} onCheckedChange={() => toggleBook(b.id)} /> {b.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Leave empty to include every book.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sch-frequency">Frequency</Label>
                <select
                  id="sch-frequency"
                  className={cn(selectClass, 'w-full')}
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as FormState['frequency'] }))}
                >
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Time</Label>
                <div className="flex items-center gap-1">
                  <select className={selectClass} value={form.hourLocal} onChange={(e) => setForm((f) => ({ ...f, hourLocal: Number(e.target.value) }))} aria-label="Hour">
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>
                        {pad2(h)}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground">:</span>
                  <select className={selectClass} value={form.minuteLocal} onChange={(e) => setForm((f) => ({ ...f, minuteLocal: Number(e.target.value) }))} aria-label="Minute">
                    {Array.from({ length: 60 }).map((_, m) => (
                      <option key={m} value={m}>
                        {pad2(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {form.frequency === 'weekly' ? (
              <div className="space-y-1">
                <Label htmlFor="sch-dow">Day of week</Label>
                <select id="sch-dow" className={cn(selectClass, 'w-full')} value={form.dayOfWeek} onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: Number(e.target.value) }))}>
                  {DAY_NAMES.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {form.frequency === 'monthly' ? (
              <div className="space-y-1">
                <Label htmlFor="sch-dom">Day of month</Label>
                <select id="sch-dom" className={cn(selectClass, 'w-full')} value={form.dayOfMonth} onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: Number(e.target.value) }))}>
                  {Array.from({ length: 28 }).map((_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="sch-tz">Timezone</Label>
              <Input id="sch-tz" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} placeholder="America/New_York" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="sch-recipients">Recipients</Label>
              <Textarea
                id="sch-recipients"
                rows={3}
                value={form.recipientsText}
                onChange={(e) => setForm((f) => ({ ...f, recipientsText: e.target.value }))}
                placeholder="name@company.com, another@company.com"
              />
              {recipientsInvalid.length > 0 ? (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Invalid email{recipientsInvalid.length > 1 ? 's' : ''}: {recipientsInvalid.join(', ')}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Comma or newline separated.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sch-format">Format</Label>
                <select id="sch-format" className={cn(selectClass, 'w-full')} value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value as 'xlsx' | 'csv' }))}>
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV</option>
                </select>
              </div>
              <div className="flex items-end gap-2 pb-1.5">
                <Switch checked={form.enabled} onCheckedChange={(c: boolean) => setForm((f) => ({ ...f, enabled: c }))} />
                <span className="text-sm text-foreground">Enabled</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={!canSubmit || submitting} className="gap-1.5">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? 'Save changes' : 'Create schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o: boolean) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete schedule</DialogTitle>
            <DialogDescription>{deleteTarget ? `"${deleteTarget.name}" will stop running. This can't be undone.` : ''}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting} className="gap-1.5">
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
