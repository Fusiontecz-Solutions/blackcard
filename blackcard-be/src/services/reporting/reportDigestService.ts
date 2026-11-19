/**
 * Daily digest email.
 *
 * Builds a professional, email-safe HTML summary from the sections an admin
 * selected. Every section is optional; order follows DIGEST_SECTIONS.
 */
import prisma from '../../config/prismaClient';
import {
  booksReport,
  casesReport,
  contractsReport,
  dailyReport,
  fundingReport,
  overviewReport,
  teamReport,
  type ReportFilters,
} from './reportQueryService';
import { STAGE_LABELS, type Stage } from './reportSyncService';
import { collectionsReport } from './reportCollectionsService';

export interface DigestSection {
  key: string;
  label: string;
  description: string;
  /** Rows shown for list-style sections. */
  limit?: number;
}

export const DIGEST_SECTIONS: DigestSection[] = [
  { key: 'summary', label: 'Yesterday at a glance', description: 'New applications, approvals, fundings, declines and contracts for yesterday, compared with the day before and the same day last week.' },
  { key: 'funding', label: 'Funding', description: 'Deals funded yesterday with amounts, plus the funding queue (final approval, funding call, disbursement).', limit: 10 },
  { key: 'pipeline', label: 'Open pipeline', description: 'Open cases by stage with dollar amounts, and how many are on hold or waiting for documents.' },
  { key: 'queues', label: 'Work queues', description: 'Unclaimed and claimed underwriting work, waiting-for-documents and on-hold counts, claimed cases per underwriter.' },
  { key: 'stuck', label: 'Cases over SLA', description: 'Open cases that have sat in their current stage longer than the SLA, oldest first.', limit: 10 },
  { key: 'contracts', label: 'Contracts', description: 'Contracts sent and signed yesterday, sign rate, and unsigned contracts that are still out.', limit: 8 },
  { key: 'collections', label: 'Collections', description: 'Expected today, received yesterday, failed payments, due in the next 7 days and overdue balance with the most delinquent deals.', limit: 8 },
  { key: 'movements', label: "Yesterday's movements", description: 'Stage changes observed yesterday: which cases moved and where.', limit: 15 },
  { key: 'books', label: 'Book performance (last 7 days)', description: 'Applications, approvals, funded volume and rates per book for the last seven days.' },
  { key: 'team', label: 'Team activity (last 7 days)', description: 'Top agents by funded volume and underwriter decisions for the last seven days.', limit: 8 },
  { key: 'trend', label: '30-day trend', description: 'Applications and funded volume for the last 30 days versus the 30 days before.' },
];

export const DEFAULT_DIGEST_SECTIONS = ['summary', 'funding', 'pipeline', 'stuck', 'contracts'];

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Formatting helpers (email-safe, no external CSS)
// ---------------------------------------------------------------------------

const BRAND = process.env.REPORT_EMAIL_BRAND_COLOR || '#3d6fa0';
const BRAND_DARK = '#1f5a80';
const INK = '#1f2937';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const SOFT = '#f4f6f8';
const GOOD = '#15803d';
const BAD = '#b91c1c';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '–'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const int = (v: number | null | undefined) => (v === null || v === undefined ? '–' : new Intl.NumberFormat('en-US').format(v));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${Math.round(v * 100)}%`);
const days = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${Math.round(v * 10) / 10}d`);

function fmtDate(d: Date, tz: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function delta(current: number, previous: number, invert = false): string {
  if (!previous && !current) return `<span style="color:${MUTED}">no change</span>`;
  if (!previous) return `<span style="color:${MUTED}">new</span>`;
  const change = (current - previous) / previous;
  const up = change >= 0;
  const good = invert ? !up : up;
  const arrow = up ? '&#9650;' : '&#9660;';
  return `<span style="color:${good ? GOOD : BAD};font-weight:600">${arrow} ${Math.abs(Math.round(change * 100))}%</span>`;
}

function section(title: string, subtitle: string | null, body: string): string {
  return `
  <tr><td style="padding:0 24px 20px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;overflow:hidden">
      <tr><td style="background:${SOFT};padding:12px 16px;border-bottom:1px solid ${LINE}">
        <div style="font:600 14px/20px Arial,Helvetica,sans-serif;color:${INK};letter-spacing:.2px">${esc(title)}</div>
        ${subtitle ? `<div style="font:12px/18px Arial,Helvetica,sans-serif;color:${MUTED}">${esc(subtitle)}</div>` : ''}
      </td></tr>
      <tr><td style="padding:14px 16px">${body}</td></tr>
    </table>
  </td></tr>`;
}

function kpiGrid(items: { label: string; value: string; sub?: string }[]): string {
  const cells = items.map(
    (k) => `
      <td width="${Math.floor(100 / Math.min(items.length, 3))}%" valign="top" style="padding:6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${LINE};border-radius:8px">
          <tr><td style="padding:12px 14px">
            <div style="font:11px/16px Arial,Helvetica,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:.6px">${esc(k.label)}</div>
            <div style="font:700 22px/28px Arial,Helvetica,sans-serif;color:${INK};margin-top:2px">${k.value}</div>
            ${k.sub ? `<div style="font:12px/18px Arial,Helvetica,sans-serif;color:${MUTED};margin-top:2px">${k.sub}</div>` : ''}
          </td></tr>
        </table>
      </td>`,
  );
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 3) rows.push(`<tr>${cells.slice(i, i + 3).join('')}</tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:-6px">${rows.join('')}</table>`;
}

function table(headers: string[], rows: string[][], align: ('left' | 'right')[] = []): string {
  if (!rows.length) return `<div style="font:13px/20px Arial,Helvetica,sans-serif;color:${MUTED}">Nothing to report.</div>`;
  const th = headers
    .map((h, i) => `<th align="${align[i] ?? 'left'}" style="font:600 11px/16px Arial,Helvetica,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:.5px;padding:6px 8px;border-bottom:1px solid ${LINE}">${esc(h)}</th>`)
    .join('');
  const tr = rows
    .map(
      (r, ri) =>
        `<tr style="background:${ri % 2 ? SOFT : '#ffffff'}">${r
          .map((c, i) => `<td align="${align[i] ?? 'left'}" style="font:13px/19px Arial,Helvetica,sans-serif;color:${INK};padding:7px 8px;border-bottom:1px solid ${LINE}">${c}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

function bar(value: number, max: number, color = BRAND): string {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${SOFT};border-radius:4px"><div style="width:${w}%;height:8px;background:${color};border-radius:4px"></div></td></tr></table>`;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface DigestOptions {
  sections: string[];
  bookIds?: string[];
  /** Instant the digest is generated; "yesterday" is relative to this in `timezone`. */
  asOf?: Date;
  timezone?: string;
  title?: string | null;
  note?: string | null;
  /** Base URL of the frontend for deep links. */
  appUrl?: string | null;
  slaDays?: number;
}

export interface DigestResult {
  subject: string;
  html: string;
  text: string;
  /** Section keys that rendered with data. */
  rendered: string[];
  reportDate: string;
}

function yesterdayIn(asOf: Date, tz: string): Date {
  // Local calendar date in tz, minus one day, expressed as UTC midnight (matches dailyReport's UTC-day bucketing).
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(asOf);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - DAY);
}

export async function buildDigest(opts: DigestOptions): Promise<DigestResult> {
  const tz = opts.timezone || 'America/New_York';
  const asOf = opts.asOf ?? new Date();
  const day = yesterdayIn(asOf, tz);
  const dayEnd = new Date(day.getTime() + DAY - 1);
  const bookIds = opts.bookIds?.length ? opts.bookIds : undefined;
  const keys = DIGEST_SECTIONS.map((s) => s.key).filter((k) => opts.sections.includes(k));
  const appUrl = (opts.appUrl || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  const link = (path: string, label: string) =>
    appUrl ? `<a href="${esc(appUrl + path)}" style="color:${BRAND};text-decoration:none">${esc(label)}</a>` : esc(label);

  const books = await prisma.book.findMany({ where: bookIds ? { id: { in: bookIds } } : {}, select: { id: true, code: true, name: true } });
  const bookLabel = bookIds ? books.map((b) => b.code).join(', ') : 'All books';
  const reportDate = fmtDate(day, 'UTC');
  const title = opts.title?.trim() || 'Daily report';
  const subject = `${title} – ${fmtDate(day, 'UTC', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const week: ReportFilters = { from: new Date(day.getTime() - 6 * DAY), to: dayEnd, bookIds };
  const month: ReportFilters = { from: new Date(day.getTime() - 29 * DAY), to: dayEnd, bookIds };
  const now: ReportFilters = { from: day, to: dayEnd, bookIds };

  const need = (k: string) => keys.includes(k);
  const [daily, cases, contracts, funding, booksRep, team, trend, collections] = await Promise.all([
    need('summary') || need('queues') || need('movements') ? dailyReport(day, bookIds) : null,
    need('pipeline') || need('stuck') ? casesReport(now, opts.slaDays) : null,
    need('contracts') ? contractsReport(now) : null,
    need('funding') ? fundingReport(now) : null,
    need('books') ? booksReport(week) : null,
    need('team') ? teamReport(week) : null,
    need('trend') ? overviewReport(month) : null,
    // "Today" for collections is the send day; the period covers yesterday.
    need('collections') ? collectionsReport(now, { asOf, listLimit: DIGEST_SECTIONS.find((s) => s.key === 'collections')?.limit ?? 8 }) : null,
  ]);

  const parts: string[] = [];
  const textParts: string[] = [`${title} – ${reportDate}`, `Scope: ${bookLabel}`, ''];
  const rendered: string[] = [];

  for (const key of keys) {
    if (key === 'summary' && daily) {
      const t = daily.today;
      const y = daily.yesterday;
      const w = daily.sameDayLastWeek;
      parts.push(
        section(
          'Yesterday at a glance',
          `${reportDate} · change vs the day before and vs the same day last week`,
          kpiGrid([
            { label: 'New applications', value: int(t.created), sub: `${delta(t.created, y.created)} · ${delta(t.created, w.created)} wk` },
            { label: 'Approved', value: int(t.approved), sub: `${delta(t.approved, y.approved)} · ${delta(t.approved, w.approved)} wk` },
            { label: 'Funded', value: int(t.funded), sub: `${money(t.fundedAmount)} · ${delta(t.fundedAmount, y.fundedAmount)}` },
            { label: 'Declined', value: int(t.declined), sub: `${delta(t.declined, y.declined, true)} · ${delta(t.declined, w.declined, true)} wk` },
            { label: 'Contracts sent', value: int(t.contractsSent), sub: `${delta(t.contractsSent, y.contractsSent)}` },
            { label: 'Contracts signed', value: int(t.contractsSigned), sub: `${delta(t.contractsSigned, y.contractsSigned)}` },
          ]),
        ),
      );
      textParts.push('YESTERDAY', `New ${t.created} · Approved ${t.approved} · Funded ${t.funded} (${money(t.fundedAmount)}) · Declined ${t.declined} · Contracts sent ${t.contractsSent} / signed ${t.contractsSigned}`, '');
      rendered.push(key);
    }

    if (key === 'funding' && funding) {
      const limit = DIGEST_SECTIONS.find((s) => s.key === key)?.limit ?? 10;
      const byBook = funding.byBook.slice(0, limit);
      const queue = funding.queue;
      const body = `
        ${kpiGrid([
          { label: 'Funded yesterday', value: int(funding.totals.funded), sub: money(funding.totals.fundedAmount) },
          { label: 'Avg deal', value: money(funding.totals.avgDeal) },
          { label: 'Commission', value: money(funding.totals.commissionAmount) },
        ])}
        <div style="height:12px"></div>
        ${table(['Queue', 'Cases', 'Amount'], queue.map((q) => [esc(q.label), int(q.count), money(q.amount)]), ['left', 'right', 'right'])}
        ${byBook.length ? `<div style="height:12px"></div>${table(['Funded by book', 'Deals', 'Amount'], byBook.map((b) => [esc(b.name), int(b.count), money(b.amount)]), ['left', 'right', 'right'])}` : ''}`;
      parts.push(section('Funding', 'Yesterday’s fundings and the current funding queue', body));
      textParts.push('FUNDING', `Funded ${funding.totals.funded} (${money(funding.totals.fundedAmount)})`, ...queue.map((q) => `${q.label}: ${q.count} (${money(q.amount)})`), '');
      rendered.push(key);
    }

    if (key === 'pipeline' && cases) {
      const rows = cases.byStage.filter((s) => s.count > 0);
      const max = Math.max(0, ...rows.map((r) => r.count));
      const body = table(
        ['Stage', 'Cases', '', 'Amount', 'Avg days'],
        rows.map((r) => [esc(r.label), int(r.count), bar(r.count, max), money(r.amount), days(r.avgDaysInStage)]),
        ['left', 'right', 'left', 'right', 'right'],
      );
      parts.push(section('Open pipeline', `Open cases by stage right now · ${link('/reports?tab=cases', 'open cases report')}`, body));
      textParts.push('OPEN PIPELINE', ...rows.map((r) => `${r.label}: ${r.count} (${money(r.amount)})`), '');
      rendered.push(key);
    }

    if (key === 'queues' && daily) {
      const q = daily.queues;
      const body = `
        ${kpiGrid([
          { label: 'Unclaimed', value: int(q.unclaimed) },
          { label: 'Claimed', value: int(q.claimed) },
          { label: 'Waiting for documents', value: int(q.waitingDocs) },
          { label: 'On hold', value: int(q.onHold) },
        ])}
        ${q.byUnderwriter.length ? `<div style="height:12px"></div>${table(['Underwriter', 'Claimed'], q.byUnderwriter.map((u) => [esc(u.name), int(u.count)]), ['left', 'right'])}` : ''}`;
      parts.push(section('Work queues', 'Underwriting workload right now', body));
      textParts.push('QUEUES', `Unclaimed ${q.unclaimed} · Claimed ${q.claimed} · Waiting for docs ${q.waitingDocs} · On hold ${q.onHold}`, '');
      rendered.push(key);
    }

    if (key === 'stuck' && cases) {
      const limit = DIGEST_SECTIONS.find((s) => s.key === key)?.limit ?? 10;
      const rows = cases.stuck.slice(0, limit);
      const body = table(
        ['Merchant', 'Book', 'Stage', 'Days', 'Amount', 'Owner'],
        rows.map((r) => [
          esc(r.merchantName ?? r.applicationNumericId ?? r.applicationUuid),
          esc(r.bookCode ?? ''),
          esc(r.stageLabel),
          `<span style="color:${(r.daysInStage as number) > cases.slaDays * 2 ? BAD : INK};font-weight:600">${int(r.daysInStage as number)}</span>`,
          money(r.amount as number),
          esc(r.underwriterName ?? r.agentName ?? ''),
        ]),
        ['left', 'left', 'left', 'right', 'right', 'left'],
      );
      parts.push(section(`Cases over SLA (${cases.slaDays} days)`, `${int(cases.stuck.length)} open case(s) past the SLA · showing the oldest ${Math.min(limit, cases.stuck.length)}`, body));
      textParts.push(`OVER SLA (${cases.stuck.length})`, ...rows.map((r) => `${r.merchantName ?? r.applicationUuid} · ${r.stageLabel} · ${r.daysInStage}d`), '');
      rendered.push(key);
    }

    if (key === 'contracts' && contracts) {
      const limit = DIGEST_SECTIONS.find((s) => s.key === key)?.limit ?? 8;
      const rows = contracts.unsigned.slice(0, limit);
      const body = `
        ${kpiGrid([
          { label: 'Sent yesterday', value: int(contracts.sentInRange) },
          { label: 'Signed yesterday', value: int(contracts.signedInRange) },
          { label: 'Sign rate', value: pct(contracts.signRate) },
          { label: 'Contracts out', value: int(contracts.byStage.find((s) => s.stage === 'Contracts_Out')?.count ?? 0) },
          { label: 'Sent → signed', value: days(contracts.turnaround.sentToSignedAvgDays), sub: 'avg days' },
          { label: 'Needs re-initiation', value: int(contracts.needsReinitiation) },
        ])}
        ${rows.length ? `<div style="height:12px"></div>${table(['Unsigned contract', 'Book', 'Amount', 'Days out', 'Agent'], rows.map((u) => [esc(u.merchantName ?? u.applicationNumericId ?? ''), esc(u.bookCode ?? ''), money(u.amount), `<span style="color:${u.daysOut >= 14 ? BAD : INK};font-weight:600">${int(u.daysOut)}</span>`, esc(u.agentName ?? '')]), ['left', 'left', 'right', 'right', 'left'])}` : ''}`;
      parts.push(section('Contracts', `Yesterday’s contract activity · ${link('/reports?tab=contracts', 'contracts report')}`, body));
      textParts.push('CONTRACTS', `Sent ${contracts.sentInRange} · Signed ${contracts.signedInRange} · Sign rate ${pct(contracts.signRate)}`, '');
      rendered.push(key);
    }

    if (key === 'collections' && collections) {
      const c = collections;
      const rows = c.delinquent;
      const body = `
        ${kpiGrid([
          { label: 'Expected today', value: money(c.today.expectedAmount), sub: `${int(c.today.expectedCount)} payment(s)` },
          { label: 'Received yesterday', value: money(c.period.collected), sub: `${int(c.period.paidCount)} payment(s) · ${pct(c.period.collectionRate)} of expected` },
          { label: 'Failed yesterday', value: int(c.period.failedCount), sub: money(c.period.failedAmount) },
          { label: `Due next ${c.dueSoonDays} days`, value: money(c.dueSoon.amount), sub: `${int(c.dueSoon.count)} payment(s)` },
          { label: 'Overdue', value: money(c.overdue.amount), sub: `${int(c.overdue.count)} payment(s)` },
          { label: 'Outstanding balance', value: money(c.portfolio.outstanding), sub: `${pct(c.portfolio.collectedShare)} of payback collected` },
        ])}
        ${rows.length ? `<div style="height:12px"></div>${table(['Most overdue deals', 'Book', 'Overdue', 'Payments', 'Days'], rows.map((d) => [esc(d.merchantName ?? d.applicationNumericId ?? d.dealId ?? ''), esc(d.bookCode ?? ''), money(d.overdueAmount), int(d.overdueCount), `<span style="color:${d.daysOverdue > 30 ? BAD : INK};font-weight:600">${int(d.daysOverdue)}</span>`]), ['left', 'left', 'right', 'right', 'right'])}` : ''}
        ${c.failedReasons.length ? `<div style="height:12px"></div>${table(['Failure reason (yesterday)', 'Count', 'Amount'], c.failedReasons.slice(0, 5).map((r) => [esc(r.reason), int(r.count), money(r.amount)]), ['left', 'right', 'right'])}` : ''}`;
      parts.push(section('Collections', `Payments across the funded portfolio · ${link('/reports?tab=collections', 'collections report')}`, body));
      textParts.push('COLLECTIONS', `Expected today ${money(c.today.expectedAmount)} · Received yesterday ${money(c.period.collected)} · Failed ${c.period.failedCount} · Overdue ${money(c.overdue.amount)}`, '');
      rendered.push(key);
    }

    if (key === 'movements' && daily) {
      const limit = DIGEST_SECTIONS.find((s) => s.key === key)?.limit ?? 15;
      const rows = daily.movements.slice(0, limit);
      const body = table(
        ['Merchant', 'Book', 'From', 'To', 'Amount'],
        rows.map((m) => [esc(m.merchantName ?? m.applicationNumericId ?? ''), esc(m.bookCode ?? ''), esc(m.from ?? '–'), `<strong>${esc(m.to ?? '–')}</strong>`, money(m.amount)]),
        ['left', 'left', 'left', 'left', 'right'],
      );
      parts.push(section('Yesterday’s movements', `${int(daily.today.stageMoves)} stage change(s) observed · showing ${rows.length}`, body));
      textParts.push('MOVEMENTS', ...rows.map((m) => `${m.merchantName ?? ''}: ${m.from ?? '–'} → ${m.to ?? '–'}`), '');
      rendered.push(key);
    }

    if (key === 'books' && booksRep) {
      const rows = booksRep.rows;
      const body = table(
        ['Book', 'Apps', 'Approved', 'Funded', 'Funded $', 'Fund rate', 'Open $'],
        rows.map((b) => [`<strong>${esc(b.name)}</strong>`, int(b.applications), int(b.approved), int(b.funded), money(b.fundedAmount), pct(b.fundingRate), money(b.openAmount)]),
        ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
      );
      parts.push(section('Book performance', `Last 7 days · ${link('/reports?tab=books&preset=last7', 'book report')}`, body));
      textParts.push('BOOKS (7d)', ...rows.map((b) => `${b.name}: ${b.applications} apps, ${b.funded} funded (${money(b.fundedAmount)})`), '');
      rendered.push(key);
    }

    if (key === 'team' && team) {
      const limit = DIGEST_SECTIONS.find((s) => s.key === key)?.limit ?? 8;
      const agents = team.agents.slice(0, limit);
      const uws = team.underwriters.slice(0, limit);
      const body = `
        ${table(['Agent', 'Submitted', 'Funded', 'Funded $'], agents.map((a) => [esc(a.name), int(a.submitted), int(a.funded), money(a.fundedAmount)]), ['left', 'right', 'right', 'right'])}
        <div style="height:12px"></div>
        ${table(['Underwriter', 'Decisions', 'Approved', 'Declined', 'Approval rate'], uws.map((u) => [esc(u.name), int(u.decisions), int(u.approved), int(u.declined), pct(u.approvalRate)]), ['left', 'right', 'right', 'right', 'right'])}`;
      parts.push(section('Team activity', `Last 7 days · ${link('/reports?tab=team&preset=last7', 'team report')}`, body));
      textParts.push('TEAM (7d)', ...agents.map((a) => `${a.name}: ${a.submitted} submitted, ${a.funded} funded`), '');
      rendered.push(key);
    }

    if (key === 'trend' && trend) {
      const c = trend.current;
      const p = trend.previous;
      const body = kpiGrid([
        { label: 'Applications (30d)', value: int(c.applications), sub: `${delta(c.applications, p.applications)} vs prior 30d` },
        { label: 'Funded (30d)', value: int(c.funded), sub: `${delta(c.funded, p.funded)} vs prior 30d` },
        { label: 'Funded amount (30d)', value: money(c.fundedAmount), sub: `${delta(c.fundedAmount, p.fundedAmount)} vs prior 30d` },
        { label: 'Approval rate', value: pct(c.approvalRate), sub: `prior ${pct(p.approvalRate)}` },
        { label: 'Funding rate', value: pct(c.fundingRate), sub: `prior ${pct(p.fundingRate)}` },
        { label: 'Avg funded deal', value: money(c.avgFundedDeal), sub: `prior ${money(p.avgFundedDeal)}` },
      ]);
      parts.push(section('30-day trend', `Last 30 days versus the 30 days before · ${link('/reports?tab=overview&preset=last30', 'overview')}`, body));
      textParts.push('30-DAY TREND', `Applications ${c.applications} · Funded ${c.funded} (${money(c.fundedAmount)})`, '');
      rendered.push(key);
    }
  }

  if (!parts.length) {
    parts.push(section('Nothing selected', null, `<div style="font:13px/20px Arial,Helvetica,sans-serif;color:${MUTED}">Choose at least one section for this digest.</div>`));
  }

  const note = opts.note?.trim();
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.08)">
    <tr><td style="background:linear-gradient(135deg,${BRAND},${BRAND_DARK});background-color:${BRAND};padding:26px 24px">
      <div style="font:700 20px/26px Arial,Helvetica,sans-serif;color:#ffffff">${esc(title)}</div>
      <div style="font:13px/20px Arial,Helvetica,sans-serif;color:rgba(255,255,255,.85);margin-top:4px">${esc(reportDate)} &nbsp;·&nbsp; ${esc(bookLabel)}</div>
    </td></tr>
    ${note ? `<tr><td style="padding:18px 24px 4px 24px"><div style="font:14px/22px Arial,Helvetica,sans-serif;color:${INK};background:${SOFT};border-left:4px solid ${BRAND};padding:10px 14px;border-radius:6px">${esc(note).replace(/\n/g, '<br>')}</div></td></tr>` : ''}
    <tr><td style="height:16px"></td></tr>
    ${parts.join('')}
    <tr><td style="padding:8px 24px 22px 24px;border-top:1px solid ${LINE}">
      <div style="font:12px/18px Arial,Helvetica,sans-serif;color:${MUTED}">
        Sent by the Super Admin reporting scheduler at ${esc(fmtDate(asOf, tz, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }))}.
        ${appUrl ? `Open the full reports at ${link('/reports', appUrl.replace(/^https?:\/\//, ''))}.` : ''}
        Figures reflect the last data sync and may lag live systems by a few minutes.
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text: textParts.join('\n'), rendered, reportDate: day.toISOString().slice(0, 10) };
}
