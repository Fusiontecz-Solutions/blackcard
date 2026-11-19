import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { axiosGet, axiosPut } from '@/redux/axios';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'react-toastify';
import { parseMoneyInput } from '@/utils/formatCurrency';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BUSINESS_WEEKDAYS,
  CALCULATION_LOGIC_OPTIONS,
  PAYMENT_FREQUENCY_OPTIONS,
  formatWeekdayLabel,
  inputSelectClass,
  normalizeBusinessWeekday,
  weekdaySelectClass,
} from './syndicatorAdminFormOptions';

function pickSyndicatorSetting(raw: Record<string, unknown>): Record<string, unknown> | null {
  const ss =
    raw.SyndicatorSetting ??
    raw.syndicatorSetting ??
    (raw as { syndicator_setting?: unknown }).syndicator_setting;
  return ss && typeof ss === 'object' && !Array.isArray(ss) ? (ss as Record<string, unknown>) : null;
}

const CALC_LOGIC_LABELS: Record<string, string> = {
  PRINCIPAL_SYNDICATED_AMOUNT: 'Principal syndicated amount',
  DISBURSED_SYNDICATED_AMOUNT: 'Disbursed syndicated amount',
};
function formatFeePercentage(value: unknown): string | null {
  const num = parseMoneyInput(value);
  if (num === null) return null;
  return num.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function formatMiscCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '—';
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (Array.isArray(raw))
    return raw.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ') || '—';
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

const MAX_NOTIFICATION_RECIPIENTS = 30;

/** Pragmatic email check — keep in sync with backend `NOTIFICATION_RECIPIENT_EMAIL_RE`. */
const RECIPIENT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isRecipientEmailFormat(email: string): boolean {
  const n = normalizeRecipientEmail(email);
  if (!n || n.length > 254) return false;
  return RECIPIENT_EMAIL_RE.test(n);
}

/** Split pasted or typed batches (comma, semicolon, space, newline). */
function splitRecipientTokens(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeRecipients(current: string[], tokens: string[]): string[] {
  const seen = new Set(current.map(normalizeRecipientEmail));
  const next = [...current];
  for (const t of tokens) {
    const n = normalizeRecipientEmail(t);
    if (!n || !isRecipientEmailFormat(n)) continue;
    if (seen.has(n)) continue;
    if (next.length >= MAX_NOTIFICATION_RECIPIENTS) break;
    seen.add(n);
    next.push(n);
  }
  return next;
}

const RESERVED_SETTING_KEYS = new Set([
  'id',
  'syndicatorId',
  'feePercentage',
  'calculationLogic',
  'frequency',
  'automaticACH',
  'notificationRecipients',
  'paymentDays',
  'createdAt',
  'updatedAt',
]);

type SettingsFormValues = {
  feePercentage: string;
  calculationLogic: string;
  frequency: string;
  automaticACH: boolean;
  notificationRecipients: string[];
  weeklyPaymentDay: string;
  biweeklyPaymentDay: string;
};

const emptySettingsForm = (): SettingsFormValues => ({
  feePercentage: '0',
  calculationLogic: 'PRINCIPAL_SYNDICATED_AMOUNT',
  frequency: 'DAILY',
  automaticACH: false,
  notificationRecipients: [],
  weeklyPaymentDay: 'MONDAY',
  biweeklyPaymentDay: 'MONDAY',
});

function formFromSetting(setting: Record<string, unknown> | null): SettingsFormValues {
  if (!setting) return emptySettingsForm();
  const feeFormatted = formatFeePercentage(setting.feePercentage);
  const rec = Array.isArray(setting.notificationRecipients)
    ? setting.notificationRecipients
    : [];
  const recipients = [...new Set(rec.map((item) => normalizeRecipientEmail(String(item ?? ''))))].filter(
    (e) => e && isRecipientEmailFormat(e),
  );
  const pd = Array.isArray(setting.paymentDays) ? setting.paymentDays : [];
  const freq =
    typeof setting.frequency === 'string' && setting.frequency.trim()
      ? setting.frequency
      : 'DAILY';
  let weeklyPaymentDay = 'MONDAY';
  let biweeklyPaymentDay = 'MONDAY';
  if (freq === 'WEEKLY') {
    weeklyPaymentDay = normalizeBusinessWeekday(pd[0], 'MONDAY');
  } else if (freq === 'BIWEEKLY') {
    biweeklyPaymentDay = normalizeBusinessWeekday(pd[0] ?? pd[1], 'MONDAY');
  }

  return {
    feePercentage:
      feeFormatted != null ? feeFormatted : String(parseMoneyInput(setting.feePercentage) ?? 0),
    calculationLogic:
      typeof setting.calculationLogic === 'string' && setting.calculationLogic.trim()
        ? setting.calculationLogic
        : 'PRINCIPAL_SYNDICATED_AMOUNT',
    frequency: freq,
    automaticACH:
      setting.automaticACH === true || setting.automaticACH === 'true',
    notificationRecipients: recipients,
    weeklyPaymentDay,
    biweeklyPaymentDay,
  };
}

function buildPaymentDaysForSave(form: SettingsFormValues): string[] {
  if (form.frequency === 'DAILY') return [];
  if (form.frequency === 'WEEKLY') return [form.weeklyPaymentDay];
  if (form.frequency === 'BIWEEKLY') return [form.biweeklyPaymentDay];
  return [];
}

export default function SyndicatorAdminSettingsPage() {
  const { syndicatorId } = useParams<{ syndicatorId: string }>();
  const [setting, setSetting] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<SettingsFormValues>(emptySettingsForm());
  const [recipientDraft, setRecipientDraft] = useState('');
  const [recipientDraftError, setRecipientDraftError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!syndicatorId) return;
    setLoading(true);
    try {
      const res = await axiosGet(`/syndicators/${syndicatorId}?extended=1`);
      const raw = res?.data?.data ?? {};
      const dataObj =
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const next = pickSyndicatorSetting(dataObj);
      setSetting(next);
      setForm(formFromSetting(next));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Settings could not be loaded.';
      toast.error(msg);
      setSetting(null);
      setForm(emptySettingsForm());
    } finally {
      setLoading(false);
    }
  }, [syndicatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const commitRecipientDraft = () => {
    const tokens = splitRecipientTokens(recipientDraft);
    setRecipientDraftError(null);
    if (tokens.length === 0) return;

    const invalid = tokens.filter((t) => !isRecipientEmailFormat(t));
    if (invalid.length) {
      setRecipientDraftError(
        invalid.length === 1
          ? `Invalid email: ${invalid[0]}`
          : `Invalid emails: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`,
      );
      return;
    }

    const before = form.notificationRecipients.length;
    const existing = new Set(form.notificationRecipients.map(normalizeRecipientEmail));
    const batchSeen = new Set<string>();
    let newDistinct = 0;
    for (const t of tokens) {
      const n = normalizeRecipientEmail(t);
      if (existing.has(n) || batchSeen.has(n)) continue;
      batchSeen.add(n);
      newDistinct++;
    }

    const room = MAX_NOTIFICATION_RECIPIENTS - before;
    if (room <= 0 && newDistinct > 0) {
      toast.warn(`You can store at most ${MAX_NOTIFICATION_RECIPIENTS} recipients. Remove one to add another.`);
      return;
    }

    const merged = mergeRecipients(form.notificationRecipients, tokens);
    const added = merged.length - before;
    const duplicateCount = tokens.length - added;

    setForm((f) => ({ ...f, notificationRecipients: merged }));
    setRecipientDraft('');

    if (added > 0 && room < newDistinct && added < newDistinct) {
      toast.warn(
        `Only ${added} of ${newDistinct} new address(es) added (${MAX_NOTIFICATION_RECIPIENTS} recipient limit).`,
      );
    } else if (duplicateCount > 0 && added > 0) {
      toast.info(`${added} added; ${duplicateCount} duplicate(s) skipped.`);
    } else if (duplicateCount > 0 && added === 0) {
      toast.info('Those addresses are already in the list.');
    }
  };

  const removeRecipient = (email: string) => {
    const key = normalizeRecipientEmail(email);
    setForm((f) => ({
      ...f,
      notificationRecipients: f.notificationRecipients.filter((e) => normalizeRecipientEmail(e) !== key),
    }));
  };

  const save = async () => {
    if (!syndicatorId) return;
    setSaving(true);
    try {
      const notificationRecipients = form.notificationRecipients;
      const paymentDays = buildPaymentDaysForSave(form);
      if (form.automaticACH && notificationRecipients.length === 0) {
        toast.error('At least one notice recipient is required when Automatic ACH is enabled.');
        setSaving(false);
        return;
      }
      await axiosPut(`/syndicators/${syndicatorId}/syndicator-setting`, {
        feePercentage: form.feePercentage,
        calculationLogic: form.calculationLogic,
        frequency: form.frequency,
        automaticACH: form.automaticACH,
        notificationRecipients,
        paymentDays,
      });

      toast.success('Settings saved');

      const res = await axiosGet(`/syndicators/${syndicatorId}?extended=1`);
      const raw = res?.data?.data ?? {};
      const dataObj =
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const next = pickSyndicatorSetting(dataObj);
      setSetting(next);
      setForm(formFromSetting(next));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not save settings.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const miscRows = useMemo(() => {
    if (!setting) return [];
    return Object.entries(setting).filter(([k]) => !RESERVED_SETTING_KEYS.has(k) && !k.endsWith('At'));
  }, [setting]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Loading syndicator settings…
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Card className="shadow-sm gap-0 py-0">
        <CardContent className="grid gap-4 py-6 sm:grid-cols-2">
          {!setting ? (
            <p className="sm:col-span-2 text-sm text-muted-foreground border border-border border-dashed rounded-md px-3 py-2 bg-muted/30">
              No fee profile saved for this syndicator yet. Defaults below are placeholders only —{' '}
              <span className="text-foreground font-medium">Save settings</span> writes them to the database.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="feePercentage">Default management fee (%)</Label>
            <Input
              id="feePercentage"
              type="number"
              step="0.01"
              min={0}
              value={form.feePercentage}
              onChange={(e) => setForm((f) => ({ ...f, feePercentage: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="frequency">Payment frequency</Label>
            <select
              id="frequency"
              className={inputSelectClass}
              value={form.frequency}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => {
                  const next: SettingsFormValues = { ...f, frequency: v };
                  if (v === 'WEEKLY') {
                    if (f.frequency === 'BIWEEKLY') {
                      next.weeklyPaymentDay = f.biweeklyPaymentDay || 'MONDAY';
                    } else if (f.frequency !== 'WEEKLY') {
                      next.weeklyPaymentDay = 'MONDAY';
                    }
                  }
                  if (v === 'BIWEEKLY') {
                    if (f.frequency === 'WEEKLY') {
                      next.biweeklyPaymentDay = f.weeklyPaymentDay || 'MONDAY';
                    } else if (f.frequency !== 'BIWEEKLY') {
                      next.biweeklyPaymentDay = 'MONDAY';
                    }
                  }
                  return next;
                });
              }}
            >
              {PAYMENT_FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="calculationLogic">Fee calculation basis</Label>
            <select
              id="calculationLogic"
              className={inputSelectClass}
              value={form.calculationLogic}
              onChange={(e) => setForm((f) => ({ ...f, calculationLogic: e.target.value }))}
            >
              {CALCULATION_LOGIC_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {CALC_LOGIC_LABELS[opt] ?? opt.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="automaticACH"
              checked={form.automaticACH}
              onCheckedChange={(c: boolean | 'indeterminate') =>
                setForm((f) => ({ ...f, automaticACH: c === true }))
              }
            />
            <Label htmlFor="automaticACH" className="font-normal cursor-pointer">
              Automatic ACH debits allowed
            </Label>
          </div>
          {form.frequency === 'WEEKLY' ? (
            <div className="space-y-2">
              <Label htmlFor="weeklyPaymentDay">Payment day of the week</Label>
              <select
                id="weeklyPaymentDay"
                className={weekdaySelectClass}
                value={form.weeklyPaymentDay}
                onChange={(e) => setForm((f) => ({ ...f, weeklyPaymentDay: e.target.value }))}
              >
                {BUSINESS_WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {formatWeekdayLabel(d)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {form.frequency === 'BIWEEKLY' ? (
            <div className="space-y-2">
              <Label htmlFor="biweeklyPaymentDay">Payment day of the week</Label>
              <select
                id="biweeklyPaymentDay"
                className={weekdaySelectClass}
                value={form.biweeklyPaymentDay}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    biweeklyPaymentDay: e.target.value,
                  }))
                }
              >
                {BUSINESS_WEEKDAYS.map((d) => (
                  <option key={`bw-${d}`} value={d}>
                    {formatWeekdayLabel(d)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-3 sm:col-span-2 rounded-lg border border-border bg-muted/20 px-4 py-4">
            <div>
              <Label className="text-base">Notification recipients</Label>
            </div>

            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {
                form.notificationRecipients.map((email) => (
                  <span
                    key={email}
                    className={cn(
                      'inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background',
                      'pl-2.5 pr-1 py-1 text-sm shadow-xs',
                    )}
                  >
                    <span className="truncate" title={email}>
                      {email}
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${email}`}
                      onClick={() => removeRecipient(email)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))
              }
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="recipientDraft" className="sr-only">
                  Add email
                </Label>
                <Input
                  id="recipientDraft"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@company.com"
                  value={recipientDraft}
                  aria-invalid={Boolean(recipientDraftError)}
                  onChange={(e) => {
                    setRecipientDraft(e.target.value);
                    setRecipientDraftError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRecipientDraft();
                    }
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData?.getData('text') ?? '';
                    if (/[\s,;]/u.test(text) && /@/u.test(text)) {
                      e.preventDefault();
                      setRecipientDraft((d) => (d ? `${d} ${text}` : text));
                    }
                  }}
                  className="sm:max-w-md"
                />
                {recipientDraftError ? (
                  <p className="text-xs text-destructive">{recipientDraftError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Press Enter or Add. Paste multiple emails separated by commas, spaces, or new lines.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="sm:mt-0 shrink-0"
                onClick={commitRecipientDraft}
              >
                Add
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t py-4 flex justify-end">
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={saving || !syndicatorId}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </CardFooter>
      </Card>

      {miscRows.length > 0 ? (
        <Card className="shadow-sm gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base font-semibold">Additional fields</CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60 hover:bg-muted/60 border-b">
                    <TableHead className="font-medium text-foreground w-[40%]">Field</TableHead>
                    <TableHead className="font-medium text-foreground">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {miscRows.map(([key, raw]) => (
                    <TableRow key={key} className="border-b hover:bg-muted/30">
                      <TableCell className="text-muted-foreground capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </TableCell>
                      <TableCell className="font-medium break-all">{formatMiscCell(raw)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
