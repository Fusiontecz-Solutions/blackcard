import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { AlertTriangle, CalendarClock, Clock, Loader2, Mail, Pencil, Play, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/usePermissions';
import { resolveSessionUser } from '@/lib/sessionRole';
import { cn } from '@/lib/utils';
import { DEFAULT_FILTERS, getReportErrorMessage, reportApi, type DigestPreviewRequest, type ReportSchedule } from '../reportApi';
import type { TabProps } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pad2 = (n: number) => String(n).padStart(2, '0');
const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

interface FormState {
  id: string | null;
  name: string;
  subject: string;
  note: string;
  recipientsText: string;
  frequency: 'daily' | 'weekdays';
  hourLocal: number;
  minuteLocal: number;
  timezone: string;
  bookIds: string[];
  sections: string[];
  includeAttachment: boolean;
  enabled: boolean;
}

function emptyForm(defaults: string[], tz: string): FormState {
  return {
    id: null,
    name: 'Daily report',
    subject: '',
    note: '',
    recipientsText: '',
    frequency: 'daily',
    hourLocal: 7,
    minuteLocal: 0,
    timezone: tz,
    bookIds: [],
    sections: defaults,
    includeAttachment: false,
    enabled: true,
  };
}

function formFromSchedule(s: ReportSchedule): FormState {
  const bookIds = s.filters?.bookIds;
  return {
    id: s.id,
    name: s.name,
    subject: s.subject ?? '',
    note: s.note ?? '',
    recipientsText: s.recipients.join('\n'),
    frequency: s.frequency === 'weekdays' ? 'weekdays' : 'daily',
    hourLocal: s.hourLocal,
    minuteLocal: s.minuteLocal,
    timezone: s.timezone,
    bookIds: Array.isArray(bookIds) ? (bookIds as string[]) : typeof bookIds === 'string' && bookIds ? String(bookIds).split(',') : [],
    sections: s.sections ?? [],
    includeAttachment: s.includeAttachment,
    enabled: s.enabled,
  };
}

function parseRecipients(text: string) {
  const list = [...new Set(text.split(/[\s,;]+/).map((r) => r.trim().toLowerCase()).filter(Boolean))];
  return { valid: list.filter((r) => EMAIL_RE.test(r)), invalid: list.filter((r) => !EMAIL_RE.test(r)) };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function describeTime(f: FormState) {
  const h = f.hourLocal % 12 || 12;
  const ampm = f.hourLocal < 12 ? 'AM' : 'PM';
  return `${f.frequency === 'weekdays' ? 'Weekdays' : 'Every day'} at ${h}:${pad2(f.minuteLocal)} ${ampm} (${f.timezone})`;
}

export default function DailyEmailTab(props: TabProps) {
  void props;
  const { can } = usePermissions();
  const canEdit = can('reports.schedule');
  const qc = useQueryClient();
  const me = resolveSessionUser();

  const meta = useQuery({ queryKey: ['reports', 'digest', 'sections'], queryFn: async () => (await reportApi.digestSections()).data });
  const options = useQuery({ queryKey: ['reports', 'options', 'digest'], queryFn: async () => (await reportApi.options(DEFAULT_FILTERS)).data });
  const schedules = useQuery({ queryKey: ['reports', 'schedules'], queryFn: async () => (await reportApi.schedules()).data });
  const digests = useMemo(() => (schedules.data ?? []).filter((s) => s.reportKey === 'digest'), [schedules.data]);

  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportSchedule | null>(null);
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (form || !meta.data) return;
    // Open the first digest for editing, or a fresh form when none exist.
    setForm(digests[0] ? formFromSchedule(digests[0]) : emptyForm(meta.data.defaults, meta.data.defaultTimezone));
    setTestTo(me?.email ?? '');
  }, [meta.data, digests, form, me?.email]);

  // Live preview (debounced).
  const previewReq: DigestPreviewRequest | null = form
    ? { sections: form.sections, bookIds: form.bookIds.length ? form.bookIds : undefined, timezone: form.timezone, title: form.subject || form.name, note: form.note }
    : null;
  const debounced = useDebounced(JSON.stringify(previewReq), 500);
  const preview = useQuery({
    queryKey: ['reports', 'digest', 'preview', debounced],
    queryFn: async () => (await reportApi.digestPreview(JSON.parse(debounced) as DigestPreviewRequest)).data,
    enabled: !!previewReq && (previewReq.sections?.length ?? 0) > 0,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const { valid, invalid } = parseRecipients(f.recipientsText);
      if (invalid.length) throw new Error(`Invalid email: ${invalid.join(', ')}`);
      if (!valid.length) throw new Error('Add at least one recipient');
      if (!f.sections.length) throw new Error('Pick at least one section');
      const body = {
        name: f.name.trim() || 'Daily report',
        reportKey: 'digest' as const,
        filters: { preset: 'yesterday', ...(f.bookIds.length ? { bookIds: f.bookIds } : {}) },
        frequency: f.frequency,
        hourLocal: f.hourLocal,
        minuteLocal: f.minuteLocal,
        timezone: f.timezone,
        recipients: valid,
        format: 'xlsx' as const,
        sections: f.sections,
        includeAttachment: f.includeAttachment,
        subject: f.subject.trim() || null,
        note: f.note.trim() || null,
        enabled: f.enabled,
      };
      const res = f.id ? await reportApi.updateSchedule(f.id, body as Partial<ReportSchedule>) : await reportApi.createSchedule(body as Partial<ReportSchedule>);
      return res.data?.data as ReportSchedule;
    },
    onSuccess: (s) => {
      toast.success(form?.id ? 'Daily email updated' : 'Daily email scheduled');
      void qc.invalidateQueries({ queryKey: ['reports', 'schedules'] });
      if (s) setForm(formFromSchedule(s));
    },
    onError: (err) => toast.error(getReportErrorMessage(err, 'Could not save')),
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { valid } = parseRecipients(testTo);
      const res = await reportApi.digestTest({ ...(previewReq as DigestPreviewRequest), recipients: valid, subject: form.subject || null });
      return res.data as { message?: string };
    },
    onSuccess: (d) => toast.success(d?.message ?? 'Test email sent'),
    onError: (err) => toast.error(getReportErrorMessage(err, 'Could not send test email')),
  });

  const runNow = useMutation({
    mutationFn: async (id: string) => (await reportApi.runSchedule(id)).data as { success: boolean; message?: string },
    onSuccess: (d) => {
      (d?.success ? toast.success : toast.warn)(d?.message ?? 'Done');
      void qc.invalidateQueries({ queryKey: ['reports', 'schedules'] });
    },
    onError: (err) => toast.error(getReportErrorMessage(err, 'Could not send')),
  });

  const toggle = useMutation({
    mutationFn: async (s: ReportSchedule) => reportApi.updateSchedule(s.id, { enabled: !s.enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reports', 'schedules'] }),
    onError: (err) => toast.error(getReportErrorMessage(err, 'Could not update')),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => reportApi.deleteSchedule(id),
    onSuccess: () => {
      toast.success('Daily email deleted');
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: ['reports', 'schedules'] });
      if (meta.data) setForm(emptyForm(meta.data.defaults, meta.data.defaultTimezone));
    },
    onError: (err) => toast.error(getReportErrorMessage(err, 'Could not delete')),
  });

  if (!form || !meta.data) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }

  const sections = meta.data.sections;
  const recipients = parseRecipients(form.recipientsText);
  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const toggleSection = (key: string) =>
    set({ sections: sections.map((s) => s.key).filter((k) => (k === key ? !form.sections.includes(k) : form.sections.includes(k))) });
  const toggleBook = (id: string) => set({ bookIds: form.bookIds.includes(id) ? form.bookIds.filter((b) => b !== id) : [...form.bookIds, id] });

  const books = options.data?.books ?? [];

  return (
    <div className="space-y-4">
      {meta.data.mailMode === 'none' ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Email delivery is not configured on the server yet. You can design and save the daily email now; sends will be marked <em>skipped</em> until SMTP credentials are set (SENDGRID_API_KEY or SMTP_AUTH_USER / SMTP_AUTH_PASS).
          </span>
        </div>
      ) : meta.data.mailMode === 'outbox' ? (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-foreground">
          <Mail className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-300" />
          <span>
            Local test mode: emails are not sent. Every send (test, send-now or scheduled) is saved as a file in{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{meta.data.outboxDir}</code>. Open the <code className="rounded bg-muted px-1 py-0.5 text-xs">.html</code> file to see the email exactly as it would arrive.
          </span>
        </div>
      ) : null}

      {/* Existing digests */}
      {digests.length ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarClock className="size-4" /> Configured daily emails
            </div>
            {canEdit ? (
              <Button size="sm" variant="outline" onClick={() => setForm(emptyForm(meta.data!.defaults, meta.data!.defaultTimezone))}>
                <Plus className="size-4" /> New daily email
              </Button>
            ) : null}
          </div>
          <ul className="divide-y divide-border">
            {digests.map((s) => (
              <li key={s.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm', form.id === s.id && 'bg-primary/5')}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{s.name}</span>
                    {!s.enabled ? <span className="rounded-full bg-muted px-2 py-px text-[11px] text-muted-foreground">paused</span> : null}
                    {s.lastStatus ? (
                      <span
                        className={cn(
                          'rounded-full px-2 py-px text-[11px]',
                          s.lastStatus === 'sent' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : s.lastStatus === 'failed' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                        )}
                        title={s.lastError ?? ''}
                      >
                        last: {s.lastStatus}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {describeTime(formFromSchedule(s))} · {s.recipients.length} recipient{s.recipients.length === 1 ? '' : 's'} · {s.sections.length} section{s.sections.length === 1 ? '' : 's'}
                    {s.nextRunAt ? ` · next ${new Date(s.nextRunAt).toLocaleString()}` : ''}
                  </div>
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-1">
                    <Switch size="sm" checked={s.enabled} onCheckedChange={() => toggle.mutate(s)} aria-label="Enabled" />
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setForm(formFromSchedule(s))} title="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => runNow.mutate(s.id)} disabled={runNow.isPending} title="Send now">
                      <Play className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-red-600" onClick={() => setDeleteTarget(s)} title="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[440px_1fr]">
        {/* Setup form */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Mail className="size-4" /> {form.id ? 'Edit daily email' : 'Set up a daily email'}
            </h3>
            <p className="text-xs text-muted-foreground">Choose what goes in the email, who gets it and when. The preview on the right updates as you go.</p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Name</span>
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} disabled={!canEdit} placeholder="Daily report" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Email title (optional)</span>
              <Input value={form.subject} onChange={(e) => set({ subject: e.target.value })} disabled={!canEdit} placeholder="Defaults to the name · the date is appended" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Intro note (optional)</span>
              <textarea
                className="min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.note}
                onChange={(e) => set({ note: e.target.value })}
                disabled={!canEdit}
                placeholder="A short message shown at the top of the email"
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-foreground">What to include</span>
            <ul className="space-y-1.5">
              {sections.map((s) => {
                const on = form.sections.includes(s.key);
                return (
                  <li key={s.key} className={cn('flex items-start gap-3 rounded-lg border px-3 py-2', on ? 'border-primary/30 bg-primary/5' : 'border-border')}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                    </div>
                    <Switch size="sm" checked={on} disabled={!canEdit} onCheckedChange={() => toggleSection(s.key)} aria-label={s.label} />
                  </li>
                );
              })}
            </ul>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span>
                <span className="block text-foreground">Attach the daily report spreadsheet</span>
                <span className="block text-xs text-muted-foreground">Adds an .xlsx with yesterday's movements, queues and logins.</span>
              </span>
              <Switch size="sm" checked={form.includeAttachment} disabled={!canEdit} onCheckedChange={(v: boolean) => set({ includeAttachment: v })} />
            </label>
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-foreground">Books</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => set({ bookIds: [] })}
                className={cn('rounded-full border px-3 py-1 text-xs', form.bookIds.length === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
              >
                All books
              </button>
              {books.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleBook(b.id)}
                  className={cn('rounded-full border px-3 py-1 text-xs', form.bookIds.includes(b.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
                >
                  {b.code}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-foreground">Recipients</span>
            <textarea
              className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.recipientsText}
              onChange={(e) => set({ recipientsText: e.target.value })}
              disabled={!canEdit}
              placeholder="one@company.com, two@company.com"
            />
            <div className="text-xs text-muted-foreground">
              {recipients.valid.length} valid{recipients.invalid.length ? <span className="text-red-600"> · invalid: {recipients.invalid.join(', ')}</span> : null}
            </div>
          </div>

          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Clock className="size-4" /> When
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select className={selectClass} value={form.frequency} onChange={(e) => set({ frequency: e.target.value as FormState['frequency'] })} disabled={!canEdit}>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays only</option>
              </select>
              <select className={selectClass} value={form.hourLocal} onChange={(e) => set({ hourLocal: Number(e.target.value) })} disabled={!canEdit} aria-label="Hour">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {h % 12 || 12} {h < 12 ? 'AM' : 'PM'}
                  </option>
                ))}
              </select>
              <select className={selectClass} value={form.minuteLocal} onChange={(e) => set({ minuteLocal: Number(e.target.value) })} disabled={!canEdit} aria-label="Minute">
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    :{pad2(m)}
                  </option>
                ))}
              </select>
              <select className={selectClass} value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} disabled={!canEdit} aria-label="Timezone">
                {[form.timezone, ...TIMEZONES.filter((t) => t !== form.timezone)].map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-muted-foreground">{describeTime(form)}. The email covers the previous day.</div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="text-foreground">Enabled</span>
            <Switch size="sm" checked={form.enabled} disabled={!canEdit} onCheckedChange={(v: boolean) => set({ enabled: v })} />
          </label>

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
                {form.id ? 'Save changes' : 'Schedule daily email'}
              </Button>
              <div className="ml-auto flex items-center gap-1">
                <Input className="h-9 w-56" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Send a test to…" />
                <Button variant="outline" onClick={() => sendTest.mutate()} disabled={sendTest.isPending || !parseRecipients(testTo).valid.length || !form.sections.length} title="Send a one-off test with the current settings">
                  {sendTest.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Send test
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Preview */}
        <div className="flex min-h-[600px] flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Preview</div>
              <div className="truncate text-xs text-muted-foreground">
                {preview.data ? `Subject: ${preview.data.subject}` : 'How the email will look, using the latest synced data'}
              </div>
            </div>
            {preview.isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>
          {!form.sections.length ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">Turn on at least one section to see a preview.</div>
          ) : preview.isError ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{getReportErrorMessage(preview.error, 'Could not build the preview')}</div>
          ) : (
            <iframe title="Daily email preview" className="min-h-[600px] w-full flex-1 bg-[#eef1f4]" sandbox="" srcDoc={preview.data?.html ?? '<p style="font:14px Arial;color:#6b7280;padding:24px">Building preview…</p>'} />
          )}
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete daily email?</DialogTitle>
            <DialogDescription>“{deleteTarget?.name}” will stop being sent. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && remove.mutate(deleteTarget.id)} disabled={remove.isPending}>
              {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
