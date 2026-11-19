import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import { resolveFilters, type RawFilters } from '../services/reporting/reportFilters';
import {
  booksReport,
  bookTrendReport,
  casesReport,
  contractsReport,
  dailyReport,
  drillDown,
  filterOptions,
  fundingReport,
  overviewReport,
  syncStatus,
  teamReport,
  type DrillQuery,
} from '../services/reporting/reportQueryService';
import { buildReportSheets, REPORT_KEYS, REPORT_TITLES, sheetsToCsv, sheetsToXlsx, type ReportKey } from '../services/reporting/reportExportService';
import { collectionsReport, paymentsDrillDown, type PaymentDrillQuery } from '../services/reporting/reportCollectionsService';
import { isSyncRunning, rebuildSnapshots, syncAllBooks, syncBook } from '../services/reporting/reportSyncService';
import * as schedules from '../services/reporting/reportScheduleService';
import { buildDigest, DEFAULT_DIGEST_SECTIONS, DIGEST_SECTIONS } from '../services/reporting/reportDigestService';
import {
  exportApplicationsForSaSync,
  exportPaymentsForSaSync,
} from '../services/reporting/reportSaExportService';
import sendMail, { isOutboundSmtpConfigured } from '../config/nodemailer';
import { ensureLocalBook, LOCAL_BOOK_ID } from '../services/reporting/reportLocalBook';

function fail(res: Response, err: unknown, log = 'Report error') {
  const e = err as { statusCode?: number; message?: string };
  const status = e?.statusCode ?? 500;
  if (status >= 500) console.error(`${log}:`, err);
  return res.status(status).json({ success: false, message: status >= 500 ? 'Internal server error' : e?.message });
}

/** Always scope to this CRM's stub book. */
async function scopedFilters(_req: Request, rawOverride?: RawFilters) {
  await ensureLocalBook();
  const raw = rawOverride ?? (_req.query as unknown as RawFilters);
  const f = resolveFilters(raw);
  f.bookIds = [LOCAL_BOOK_ID];
  return f;
}

const memo = new Map<string, { at: number; value: unknown }>();
const MEMO_TTL = Math.max(0, Number(process.env.REPORT_QUERY_CACHE_MS || 20_000));
async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_TTL) return hit.value as T;
  const value = await loader();
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 500) memo.delete(memo.keys().next().value as string);
  return value;
}
export function clearReportMemo() {
  memo.clear();
}

class ReportController {
  async overview(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const data = await cached(`overview:${JSON.stringify(f)}`, () => overviewReport(f));
      return res.json({ success: true, filters: f, data });
    } catch (e) {
      return fail(res, e);
    }
  }
  async books(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const [table, trend] = await Promise.all([
        cached(`books:${JSON.stringify(f)}`, () => booksReport(f)),
        cached(`bookTrend:${JSON.stringify(f)}`, () => bookTrendReport(f)),
      ]);
      return res.json({ success: true, filters: f, data: { ...table, trend } });
    } catch (e) {
      return fail(res, e);
    }
  }
  async cases(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const sla = req.query.slaDays ? Number(req.query.slaDays) : undefined;
      const data = await cached(`cases:${sla ?? ''}:${JSON.stringify(f)}`, () => casesReport(f, sla));
      return res.json({ success: true, filters: f, data });
    } catch (e) {
      return fail(res, e);
    }
  }
  async contracts(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const data = await cached(`contracts:${JSON.stringify(f)}`, () => contractsReport(f));
      return res.json({ success: true, filters: f, data });
    } catch (e) {
      return fail(res, e);
    }
  }
  async funding(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const data = await cached(`funding:${JSON.stringify(f)}`, () => fundingReport(f));
      return res.json({ success: true, filters: f, data });
    } catch (e) {
      return fail(res, e);
    }
  }
  async daily(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const day = req.query.date ? new Date(String(req.query.date)) : new Date();
      if (Number.isNaN(day.getTime())) return res.status(400).json({ success: false, message: 'Invalid date' });
      const data = await cached(`daily:${day.toISOString().slice(0, 10)}:${JSON.stringify(f.bookIds)}`, () => dailyReport(day, f.bookIds));
      return res.json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }
  async team(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const data = await cached(`team:${JSON.stringify(f)}`, () => teamReport(f));
      return res.json({ success: true, filters: f, data });
    } catch (e) {
      return fail(res, e);
    }
  }
  async applications(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const q = req.query;
      const data = await drillDown({
        ...f,
        dateField: (q.dateField as DrillQuery['dateField']) ?? 'createdAtTenant',
        page: Number(q.page) || 1,
        limit: Number(q.limit) || 50,
        sortBy: q.sortBy as DrillQuery['sortBy'],
        sortDir: q.sortDir as DrillQuery['sortDir'],
      });
      return res.json({ success: true, filters: f, ...data });
    } catch (e) {
      return fail(res, e);
    }
  }
  async options(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const books = await prisma.book.findMany({
        where: { id: LOCAL_BOOK_ID },
        select: { id: true, code: true, name: true, status: true },
        orderBy: { name: 'asc' },
      });
      const data = await cached(`options:${LOCAL_BOOK_ID}`, () => filterOptions(f.bookIds));
      return res.json({ success: true, data: { books, ...data, reports: REPORT_KEYS.map((k) => ({ key: k, title: REPORT_TITLES[k] })) } });
    } catch (e) {
      return fail(res, e);
    }
  }

  async export(req: Request, res: Response) {
    try {
      const key = String(req.params.key) as ReportKey;
      if (!REPORT_KEYS.includes(key)) return res.status(400).json({ success: false, message: 'Unknown report' });
      const f = await scopedFilters(req);
      const format = String(req.query.format ?? 'xlsx') === 'csv' ? 'csv' : 'xlsx';
      const sheets = await buildReportSheets(key, f);
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${key}-${stamp}.csv"`);
        return res.status(200).send(sheetsToCsv(sheets));
      }
      const buf = sheetsToXlsx(sheets, { title: REPORT_TITLES[key], from: f.from, to: f.to, books: f.bookIds?.join(', ') });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${key}-${stamp}.xlsx"`);
      return res.status(200).send(buf);
    } catch (e) {
      return fail(res, e);
    }
  }

  async syncStatus(_req: Request, res: Response) {
    try {
      return res.json({ success: true, data: { running: isSyncRunning(), ...(await syncStatus()) } });
    } catch (e) {
      return fail(res, e);
    }
  }
  async sync(req: Request, res: Response) {
    try {
      if (isSyncRunning()) return res.status(409).json({ success: false, message: 'A sync is already running' });
      const full = String(req.body?.full ?? 'true') !== 'false';
      const p = syncAllBooks({
        trigger: 'manual',
        since: full ? null : new Date(Date.now() - 24 * 3600 * 1000),
      });
      void p.then(() => clearReportMemo()).catch((err) => console.error('[reports] manual sync failed', err));
      return res.status(202).json({ success: true, message: 'Sync started' });
    } catch (e) {
      return fail(res, e);
    }
  }
  async rebuildSnapshots(req: Request, res: Response) {
    try {
      const days = Math.min(730, Math.max(1, Number(req.body?.days) || 120));
      await rebuildSnapshots(days);
      clearReportMemo();
      return res.json({ success: true, message: `Snapshots rebuilt for ${days} days` });
    } catch (e) {
      return fail(res, e);
    }
  }

  async collections(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const dueSoonDays = req.query.dueSoonDays ? Number(req.query.dueSoonDays) : undefined;
      const data = await cached(`collections:${dueSoonDays ?? ''}:${JSON.stringify(f)}`, () => collectionsReport(f, { dueSoonDays }));
      return res.json({ success: true, filters: f, data });
    } catch (e) {
      return fail(res, e);
    }
  }
  async payments(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req);
      const q = req.query;
      const kinds: PaymentDrillQuery['kind'][] = ['failed', 'overdue', 'due', 'paid', 'scheduled', 'all'];
      const kind = kinds.includes(q.kind as PaymentDrillQuery['kind']) ? (q.kind as PaymentDrillQuery['kind']) : 'all';
      const data = await paymentsDrillDown({
        ...f,
        kind,
        applicationUuid: q.applicationUuid ? String(q.applicationUuid) : undefined,
        bookId: LOCAL_BOOK_ID,
        page: Number(q.page) || 1,
        limit: Number(q.limit) || 50,
      });
      return res.json({ success: true, filters: f, ...data });
    } catch (e) {
      return fail(res, e);
    }
  }

  async listSchedules(_req: Request, res: Response) {
    try {
      return res.json({ success: true, data: await schedules.listSchedules() });
    } catch (e) {
      return fail(res, e);
    }
  }
  async createSchedule(req: Request, res: Response) {
    try {
      const s = await schedules.createSchedule(req.body, { id: req.user?.id, email: req.user?.email });
      return res.status(201).json({ success: true, data: s });
    } catch (e) {
      return fail(res, e);
    }
  }
  async updateSchedule(req: Request, res: Response) {
    try {
      const s = await schedules.updateSchedule(req.params.id, req.body);
      return res.json({ success: true, data: s });
    } catch (e) {
      return fail(res, e);
    }
  }
  async deleteSchedule(req: Request, res: Response) {
    try {
      await schedules.deleteSchedule(req.params.id);
      return res.json({ success: true, message: 'Schedule deleted' });
    } catch (e) {
      return fail(res, e);
    }
  }
  async runSchedule(req: Request, res: Response) {
    try {
      const r = await schedules.runSchedule(req.params.id);
      return res.json({ success: r.status === 'sent', message: r.status === 'sent' ? `Sent to ${r.recipients.join(', ')}` : r.error ?? r.status, data: r });
    } catch (e) {
      return fail(res, e);
    }
  }

  async digestSections(_req: Request, res: Response) {
    return res.json({
      success: true,
      data: {
        sections: DIGEST_SECTIONS,
        defaults: DEFAULT_DIGEST_SECTIONS,
        smtpConfigured: isOutboundSmtpConfigured(),
        mailMode: isOutboundSmtpConfigured() ? 'smtp' : 'none',
        outboxDir: null,
        defaultTimezone: process.env.REPORT_CRON_TZ || 'America/New_York',
      },
    });
  }

  async digestPreview(req: Request, res: Response) {
    try {
      const f = await scopedFilters(req, { bookIds: [LOCAL_BOOK_ID] });
      const sections = Array.isArray(req.body?.sections) && req.body.sections.length ? req.body.sections.map(String) : DEFAULT_DIGEST_SECTIONS;
      const digest = await buildDigest({
        sections,
        bookIds: f.bookIds,
        timezone: req.body?.timezone ? String(req.body.timezone) : undefined,
        title: req.body?.title ?? req.body?.name ?? null,
        note: req.body?.note ?? null,
        slaDays: req.body?.slaDays ? Number(req.body.slaDays) : undefined,
      });
      if (String(req.query.format) === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(digest.html);
      }
      return res.json({ success: true, data: digest });
    } catch (e) {
      return fail(res, e);
    }
  }

  async digestTest(req: Request, res: Response) {
    try {
      const recipients = (Array.isArray(req.body?.recipients) && req.body.recipients.length ? req.body.recipients : [req.user?.email])
        .map((r: unknown) => String(r ?? '').trim().toLowerCase())
        .filter((r: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));
      if (!recipients.length) return res.status(400).json({ success: false, message: 'No valid recipient' });
      if (!isOutboundSmtpConfigured()) {
        return res.status(503).json({ success: false, code: 'SMTP_NOT_CONFIGURED', message: 'Email is not configured on the server (SENDGRID_API_KEY or SMTP_AUTH_USER / SMTP_AUTH_PASS).' });
      }
      const f = await scopedFilters(req, { bookIds: [LOCAL_BOOK_ID] });
      const sections = Array.isArray(req.body?.sections) && req.body.sections.length ? req.body.sections.map(String) : DEFAULT_DIGEST_SECTIONS;
      const digest = await buildDigest({
        sections,
        bookIds: f.bookIds,
        timezone: req.body?.timezone ? String(req.body.timezone) : undefined,
        title: req.body?.title ?? req.body?.name ?? null,
        note: req.body?.note ?? null,
      });
      await sendMail({ to: recipients.join(','), subject: `[Test] ${req.body?.subject?.trim() || digest.subject}`, html: digest.html });
      return res.json({ success: true, message: `Test email sent to ${recipients.join(', ')}`, data: { recipients, subject: digest.subject } });
    } catch (e) {
      return fail(res, e);
    }
  }

  async schedulePreview(req: Request, res: Response) {
    try {
      const out = await schedules.previewSchedule(req.params.id);
      if (String(req.query.format) === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(out.html);
      }
      return res.json({ success: true, data: out });
    } catch (e) {
      return fail(res, e);
    }
  }

  async listViews(req: Request, res: Response) {
    try {
      const data = await prisma.reportSavedView.findMany({
        where: { OR: [{ ownerId: req.user!.id }, { isShared: true }] },
        orderBy: [{ isShared: 'asc' }, { name: 'asc' }],
      });
      return res.json({ success: true, data: data.map((v) => ({ ...v, mine: v.ownerId === req.user!.id })) });
    } catch (e) {
      return fail(res, e);
    }
  }
  async createView(req: Request, res: Response) {
    try {
      const { name, reportKey, filters, isShared } = req.body ?? {};
      if (!name?.trim() || !REPORT_KEYS.includes(reportKey)) return res.status(400).json({ success: false, message: 'name and a valid reportKey are required' });
      const v = await prisma.reportSavedView.create({ data: { ownerId: req.user!.id, name: String(name).trim(), reportKey, filters: filters ?? {}, isShared: !!isShared } });
      return res.status(201).json({ success: true, data: v });
    } catch (e) {
      return fail(res, e);
    }
  }
  async deleteView(req: Request, res: Response) {
    try {
      const existing = await prisma.reportSavedView.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ success: false, message: 'View not found' });
      if (existing.ownerId !== req.user!.id) return res.status(403).json({ success: false, message: 'Only the owner can delete this view' });
      await prisma.reportSavedView.delete({ where: { id: existing.id } });
      return res.json({ success: true, message: 'View deleted' });
    } catch (e) {
      return fail(res, e);
    }
  }

  /** Super-Admin panel: bulk applications with funding/contract/balances for report sync. */
  async saExportApplications(req: Request, res: Response) {
    try {
      const payload = await exportApplicationsForSaSync(req.query);
      return res.json({ success: true, ...payload });
    } catch (e) {
      return fail(res, e, 'SA report applications export');
    }
  }

  /** Super-Admin panel: bulk collection payments for report sync. */
  async saExportPayments(req: Request, res: Response) {
    try {
      const payload = await exportPaymentsForSaSync(req.query);
      return res.json({ success: true, ...payload });
    } catch (e) {
      return fail(res, e, 'SA report payments export');
    }
  }
}

export default new ReportController();
