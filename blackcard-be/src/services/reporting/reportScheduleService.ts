/**
 * Scheduled report emails: CRUD, next-run computation and dispatch.
 */
import type { Prisma } from '@prisma/client';
import prisma from '../../config/prismaClient';
import sendMail, { isOutboundSmtpConfigured } from '../../config/nodemailer';
import { buildReportSheets, REPORT_KEYS, REPORT_TITLES, sheetsToCsv, sheetsToXlsx, type ReportKey } from './reportExportService';
import { resolveFilters, type RawFilters } from './reportFilters';
import { buildDigest, DEFAULT_DIGEST_SECTIONS, DIGEST_SECTIONS } from './reportDigestService';

export class ReportScheduleError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export type Frequency = 'daily' | 'weekdays' | 'weekly' | 'monthly';

/** `digest` = the designed daily email; other keys attach a spreadsheet export. */
export type ScheduleReportKey = ReportKey | 'digest';

export interface ScheduleInput {
  name: string;
  reportKey: ScheduleReportKey;
  filters: RawFilters;
  frequency: Frequency;
  hourLocal?: number;
  minuteLocal?: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timezone?: string;
  recipients: string[];
  format?: 'xlsx' | 'csv';
  enabled?: boolean;
  /** Digest only: section keys from DIGEST_SECTIONS. */
  sections?: string[];
  /** Digest only: also attach the daily report spreadsheet. */
  includeAttachment?: boolean;
  /** Optional custom subject (digest) — the report date is appended. */
  subject?: string | null;
  /** Optional intro paragraph shown at the top of the digest. */
  note?: string | null;
}

function validTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local wall-clock parts of `d` in `tz`. */
function partsIn(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, dow };
}

/** Offset (ms) of tz at instant d. */
function tzOffsetMs(d: Date, tz: string): number {
  const p = partsIn(d, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return asUtc - Math.floor(d.getTime() / 60000) * 60000;
}

function localToInstant(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  const off = tzOffsetMs(guess, tz);
  return new Date(guess.getTime() - off);
}

export function computeNextRun(s: { frequency: string; hourLocal: number; minuteLocal: number; dayOfWeek: number | null; dayOfMonth: number | null; timezone: string }, after = new Date()): Date {
  const tz = validTz(s.timezone) ? s.timezone : 'UTC';
  for (let i = 0; i < 400; i++) {
    const probe = new Date(after.getTime() + i * 24 * 60 * 60 * 1000);
    const p = partsIn(probe, tz);
    const candidate = localToInstant(p.y, p.m, p.d, s.hourLocal, s.minuteLocal, tz);
    if (candidate <= after) continue;
    if (s.frequency === 'daily') return candidate;
    if (s.frequency === 'weekdays' && p.dow >= 1 && p.dow <= 5) return candidate;
    if (s.frequency === 'weekly' && p.dow === (s.dayOfWeek ?? 1)) return candidate;
    if (s.frequency === 'monthly') {
      const dom = Math.min(Math.max(1, s.dayOfMonth ?? 1), 28);
      if (p.d === dom) return candidate;
    }
  }
  return new Date(after.getTime() + 24 * 60 * 60 * 1000);
}

function validate(input: ScheduleInput) {
  if (!input.name?.trim()) throw new ReportScheduleError('name is required');
  if (input.reportKey !== 'digest' && !REPORT_KEYS.includes(input.reportKey as ReportKey)) throw new ReportScheduleError('Unknown reportKey');
  const known = new Set(DIGEST_SECTIONS.map((s) => s.key));
  const sections = input.reportKey === 'digest'
    ? DIGEST_SECTIONS.map((s) => s.key).filter((k) => (input.sections?.length ? input.sections : DEFAULT_DIGEST_SECTIONS).includes(k))
    : [];
  if (input.reportKey === 'digest' && !sections.length) throw new ReportScheduleError('Pick at least one section for the daily email');
  for (const s of input.sections ?? []) if (!known.has(String(s))) throw new ReportScheduleError(`Unknown section ${String(s)}`);
  if (!['daily', 'weekdays', 'weekly', 'monthly'].includes(input.frequency)) throw new ReportScheduleError('Invalid frequency');
  const recipients = [...new Set((input.recipients ?? []).map((r) => String(r).trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) throw new ReportScheduleError('At least one recipient is required');
  for (const r of recipients) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)) throw new ReportScheduleError(`Invalid recipient ${r}`);
  const tz = input.timezone?.trim() || 'America/New_York';
  if (!validTz(tz)) throw new ReportScheduleError('Invalid timezone');
  const hour = Math.min(23, Math.max(0, Number(input.hourLocal ?? 7) || 0));
  const minute = Math.min(59, Math.max(0, Number(input.minuteLocal ?? 0) || 0));
  return { recipients, tz, hour, minute, sections };
}

function digestFields(input: ScheduleInput, sections: string[]) {
  return {
    sections,
    includeAttachment: input.reportKey === 'digest' ? input.includeAttachment ?? false : true,
    subject: input.subject?.trim() ? input.subject.trim().slice(0, 150) : null,
    note: input.note?.trim() ? input.note.trim().slice(0, 1000) : null,
  };
}

export async function createSchedule(input: ScheduleInput, actor: { id?: string; email?: string }) {
  const v = validate(input);
  const base = {
    name: input.name.trim(),
    reportKey: input.reportKey,
    filters: (input.filters ?? {}) as Prisma.InputJsonValue,
    frequency: input.frequency,
    hourLocal: v.hour,
    minuteLocal: v.minute,
    dayOfWeek: input.frequency === 'weekly' ? Number(input.dayOfWeek ?? 1) : null,
    dayOfMonth: input.frequency === 'monthly' ? Number(input.dayOfMonth ?? 1) : null,
    timezone: v.tz,
    recipients: v.recipients,
    format: input.format === 'csv' ? 'csv' : 'xlsx',
    enabled: input.enabled ?? true,
    ...digestFields(input, v.sections),
  };
  return prisma.reportSchedule.create({
    data: { ...base, nextRunAt: computeNextRun(base), createdById: actor.id ?? null, createdByEmail: actor.email ?? null },
  });
}

export async function updateSchedule(id: string, input: Partial<ScheduleInput>) {
  const existing = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!existing) throw new ReportScheduleError('Schedule not found', 404);
  const merged: ScheduleInput = {
    name: input.name ?? existing.name,
    reportKey: (input.reportKey ?? existing.reportKey) as ReportKey,
    filters: (input.filters ?? (existing.filters as RawFilters)) as RawFilters,
    frequency: (input.frequency ?? existing.frequency) as Frequency,
    hourLocal: input.hourLocal ?? existing.hourLocal,
    minuteLocal: input.minuteLocal ?? existing.minuteLocal,
    dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
    dayOfMonth: input.dayOfMonth ?? existing.dayOfMonth,
    timezone: input.timezone ?? existing.timezone,
    recipients: input.recipients ?? existing.recipients,
    format: (input.format ?? existing.format) as 'xlsx' | 'csv',
    enabled: input.enabled ?? existing.enabled,
    sections: input.sections ?? existing.sections,
    includeAttachment: input.includeAttachment ?? existing.includeAttachment,
    subject: input.subject === undefined ? existing.subject : input.subject,
    note: input.note === undefined ? existing.note : input.note,
  };
  const v = validate(merged);
  const base = {
    name: merged.name.trim(),
    reportKey: merged.reportKey,
    filters: merged.filters as Prisma.InputJsonValue,
    frequency: merged.frequency,
    hourLocal: v.hour,
    minuteLocal: v.minute,
    dayOfWeek: merged.frequency === 'weekly' ? Number(merged.dayOfWeek ?? 1) : null,
    dayOfMonth: merged.frequency === 'monthly' ? Number(merged.dayOfMonth ?? 1) : null,
    timezone: v.tz,
    recipients: v.recipients,
    format: merged.format === 'csv' ? 'csv' : 'xlsx',
    enabled: merged.enabled ?? true,
    ...digestFields(merged, v.sections),
  };
  return prisma.reportSchedule.update({ where: { id }, data: { ...base, nextRunAt: computeNextRun(base) } });
}

export async function deleteSchedule(id: string) {
  const existing = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!existing) throw new ReportScheduleError('Schedule not found', 404);
  await prisma.reportSchedule.delete({ where: { id } });
  return existing;
}

export async function listSchedules() {
  return prisma.reportSchedule.findMany({ orderBy: { createdAt: 'desc' } });
}

/** Build + email one schedule now. Returns delivery details. */
export async function runSchedule(id: string, opts: { asOf?: Date } = {}) {
  const s = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!s) throw new ReportScheduleError('Schedule not found', 404);
  const asOf = opts.asOf ?? new Date();
  const built = await composeScheduleEmail(s, asOf);

  let status = 'sent';
  let error: string | null = null;
  if (!isOutboundSmtpConfigured()) {
    status = 'skipped';
    error = 'SMTP is not configured';
  } else {
    try {
      await sendMail({
        to: s.recipients.join(','),
        subject: built.subject,
        html: built.html,
        ...(built.attachment ? { attachments: [built.attachment] } : {}),
      });
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
    }
  }
  await prisma.reportSchedule.update({
    where: { id },
    data: { lastRunAt: asOf, lastStatus: status, lastError: error, nextRunAt: computeNextRun(s, asOf) },
  });
  return {
    status,
    error,
    recipients: s.recipients,
    filename: built.attachment?.filename ?? null,
    bytes: built.attachment ? Buffer.byteLength(built.attachment.content as Buffer | string) : Buffer.byteLength(built.html),
  };
}

type ScheduleRow = Awaited<ReturnType<typeof prisma.reportSchedule.findUniqueOrThrow>>;

interface ComposedEmail {
  subject: string;
  html: string;
  attachment: { filename: string; content: Buffer | string; contentType: string } | null;
}

/** Build subject, body and optional attachment for a schedule as of `asOf`. */
async function composeScheduleEmail(s: ScheduleRow, asOf: Date): Promise<ComposedEmail> {
  const stamp = asOf.toISOString().slice(0, 10);
  const rawFilters = { ...(s.filters as RawFilters), _asOf: asOf.toISOString() };
  const filters = resolveFilters(rawFilters);

  if (s.reportKey === 'digest') {
    const digest = await buildDigest({
      sections: s.sections?.length ? s.sections : DEFAULT_DIGEST_SECTIONS,
      bookIds: filters.bookIds,
      asOf,
      timezone: s.timezone,
      title: s.subject || s.name,
      note: s.note,
    });
    let attachment: ComposedEmail['attachment'] = null;
    if (s.includeAttachment) {
      const daySheets = await buildReportSheets('daily', { ...filters, to: new Date(new Date(digest.reportDate).getTime() + 24 * 60 * 60 * 1000 - 1) });
      attachment = {
        filename: `daily-report-${digest.reportDate}.xlsx`,
        content: sheetsToXlsx(daySheets, { title: REPORT_TITLES.daily, from: new Date(digest.reportDate), to: new Date(digest.reportDate), books: filters.bookIds?.join(', ') }),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    return { subject: digest.subject, html: digest.html, attachment };
  }

  const key = s.reportKey as ReportKey;
  const title = REPORT_TITLES[key];
  const sheets = await buildReportSheets(key, filters);
  const attachment =
    s.format === 'csv'
      ? { filename: `${key}-${stamp}.csv`, content: sheetsToCsv(sheets), contentType: 'text/csv' }
      : { filename: `${key}-${stamp}.xlsx`, content: sheetsToXlsx(sheets, { title, from: filters.from, to: filters.to, books: filters.bookIds?.join(', ') }), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

  const headline = sheets[0]?.rows?.[0]
    ? Object.entries(sheets[0].rows[0]).slice(0, 8).map(([k, v]) => `<li><strong>${k}</strong>: ${typeof v === 'number' ? v.toLocaleString() : String(v ?? '')}</li>`).join('')
    : '<li>No data for this period.</li>';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#1f2937">
      <h2 style="margin:0 0 8px">${s.name}</h2>
      <p style="margin:0 0 12px;color:#6b7280">${title} · ${filters.from.toISOString().slice(0, 10)} to ${filters.to.toISOString().slice(0, 10)}${filters.bookIds?.length ? ` · ${filters.bookIds.length} book(s)` : ' · all books'}</p>
      <ul style="padding-left:18px">${headline}</ul>
      <p style="font-size:12px;color:#6b7280">The full report is attached. Sent by the Super Admin reporting scheduler.</p>
    </div>`;
  return { subject: `[Report] ${s.name} – ${stamp}`, html, attachment };
}

/** What a schedule would send right now (no email). */
export async function previewSchedule(id: string, asOf = new Date()) {
  const s = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!s) throw new ReportScheduleError('Schedule not found', 404);
  const built = await composeScheduleEmail(s, asOf);
  return { subject: built.subject, html: built.html, attachment: built.attachment ? { filename: built.attachment.filename } : null };
}

/** Called by the cron tick: run everything that is due. */
export async function runDueSchedules(now = new Date()) {
  const due = await prisma.reportSchedule.findMany({ where: { enabled: true, nextRunAt: { lte: now } } });
  const results = [];
  for (const s of due) {
    try {
      results.push({ id: s.id, name: s.name, ...(await runSchedule(s.id, { asOf: now })) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastRunAt: now, lastStatus: 'failed', lastError: message, nextRunAt: computeNextRun(s, now) } });
      results.push({ id: s.id, name: s.name, status: 'failed', error: message });
    }
  }
  return results;
}
