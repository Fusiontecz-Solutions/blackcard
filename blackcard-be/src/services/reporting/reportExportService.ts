/**
 * Turns report results into downloadable files (xlsx / csv).
 */
import * as XLSX from 'xlsx';
import {
  booksReport,
  casesReport,
  contractsReport,
  dailyReport,
  drillDown,
  fundingReport,
  overviewReport,
  teamReport,
  type ReportFilters,
} from './reportQueryService';
import { collectionsReport } from './reportCollectionsService';

export type ReportKey = 'overview' | 'books' | 'cases' | 'contracts' | 'funding' | 'collections' | 'daily' | 'team' | 'applications';

export const REPORT_KEYS: ReportKey[] = ['overview', 'books', 'cases', 'contracts', 'funding', 'collections', 'daily', 'team', 'applications'];

export const REPORT_TITLES: Record<ReportKey, string> = {
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

type Sheet = { name: string; rows: Record<string, unknown>[] };

const pct = (v: number | null) => (v === null || v === undefined ? '' : `${(v * 100).toFixed(1)}%`);
const dt = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? '');

export async function buildReportSheets(key: ReportKey, f: ReportFilters): Promise<Sheet[]> {
  switch (key) {
    case 'overview': {
      const r = await overviewReport(f);
      return [
        {
          name: 'KPIs',
          rows: [
            { metric: 'Applications', current: r.current.applications, previous: r.previous.applications },
            { metric: 'Requested amount', current: r.current.requestedAmount, previous: r.previous.requestedAmount },
            { metric: 'Approved', current: r.current.approved, previous: r.previous.approved },
            { metric: 'Approved amount', current: r.current.approvedAmount, previous: r.previous.approvedAmount },
            { metric: 'Funded', current: r.current.funded, previous: r.previous.funded },
            { metric: 'Funded amount', current: r.current.fundedAmount, previous: r.previous.fundedAmount },
            { metric: 'Commission', current: r.current.commissionAmount, previous: r.previous.commissionAmount },
            { metric: 'Declined', current: r.current.declined, previous: r.previous.declined },
            { metric: 'Contracts sent', current: r.current.contractsSent, previous: r.previous.contractsSent },
            { metric: 'Contracts signed', current: r.current.contractsSigned, previous: r.previous.contractsSigned },
            { metric: 'Approval rate', current: pct(r.current.approvalRate), previous: pct(r.previous.approvalRate) },
            { metric: 'Funding rate', current: pct(r.current.fundingRate), previous: pct(r.previous.fundingRate) },
          ],
        },
        { name: 'Trend', rows: r.trend },
        { name: 'Open pipeline', rows: [...r.openPipeline, ...r.waiting].map(({ label, count, amount }) => ({ stage: label, count, amount })) },
      ];
    }
    case 'books': {
      const r = await booksReport(f);
      return [{ name: 'Books', rows: r.rows.map((b) => ({ ...b, approvalRate: pct(b.approvalRate), fundingRate: pct(b.fundingRate), renewalShare: pct(b.renewalShare) })) }];
    }
    case 'cases': {
      const r = await casesReport(f);
      return [
        { name: 'By stage', rows: r.byStage.map((s) => ({ stage: s.label, count: s.count, amount: s.amount, avgDaysInStage: s.avgDaysInStage, overSla: s.overSla, ...Object.fromEntries(Object.entries(s.aging).map(([k, v]) => [`aging ${k}d`, v])) })) },
        { name: 'Velocity', rows: r.velocity.map((v) => ({ stage: v.label, avgDays: v.avgDays, medianDays: v.medianDays, samples: v.samples })) },
        { name: 'Stuck cases', rows: r.stuck.map((s) => ({ ...s, enteredAt: dt(s.enteredAt) })) },
        { name: 'Declines', rows: [...r.declines.byActor.map((d) => ({ type: 'actor', name: d.actor, count: d.count })), ...r.declines.reasons.map((d) => ({ type: 'reason', name: d.reason, count: d.count }))] },
      ];
    }
    case 'contracts': {
      const r = await contractsReport(f);
      return [
        { name: 'Summary', rows: [{ sentInRange: r.sentInRange, signedInRange: r.signedInRange, signRate: pct(r.signRate), needsReinitiation: r.needsReinitiation, approvalToSentAvgDays: r.turnaround.approvalToSentAvgDays, sentToSignedAvgDays: r.turnaround.sentToSignedAvgDays }] },
        { name: 'By stage', rows: r.byStage.map((s) => ({ stage: s.label, count: s.count, amount: s.amount })) },
        { name: 'Unsigned', rows: r.unsigned.map((u) => ({ book: u.bookCode, application: u.applicationNumericId, merchant: u.merchantName, amount: u.amount, agent: u.agentName, sentAt: dt(u.contractSentAt), daysOut: u.daysOut })) },
      ];
    }
    case 'funding': {
      const r = await fundingReport(f);
      return [
        { name: 'Totals', rows: [{ ...r.totals, renewalShare: pct(r.totals.renewalShare), ...r.portfolio, collectedShare: pct(r.portfolio.collectedShare) }] },
        { name: 'Trend', rows: r.trend },
        { name: 'By book', rows: r.byBook },
        { name: 'By agent', rows: r.byAgent },
        { name: 'By underwriter', rows: r.byUnderwriter },
        { name: 'Queue', rows: r.queue.map((s) => ({ stage: s.label, count: s.count, amount: s.amount })) },
      ];
    }
    case 'daily': {
      const r = await dailyReport(f.to, f.bookIds);
      return [
        { name: 'Summary', rows: [{ period: 'today', ...r.today }, { period: 'yesterday', ...r.yesterday }, { period: 'same day last week', ...r.sameDayLastWeek }] },
        { name: 'Queues', rows: [{ unclaimed: r.queues.unclaimed, claimed: r.queues.claimed, waitingDocs: r.queues.waitingDocs, onHold: r.queues.onHold }, ...r.queues.byUnderwriter.map((u) => ({ underwriter: u.name, claimed: u.count }))] },
        { name: 'Movements', rows: r.movements.map((m) => ({ ...m, at: dt(m.at) })) },
        { name: 'Logins', rows: r.logins },
      ];
    }
    case 'team': {
      const r = await teamReport(f);
      return [
        { name: 'Agents', rows: r.agents.map((a) => ({ ...a, approvalRate: pct(a.approvalRate), fundingRate: pct(a.fundingRate) })) },
        { name: 'Underwriters', rows: r.underwriters.map((u) => ({ ...u, approvalRate: pct(u.approvalRate) })) },
        { name: 'Scrubbing', rows: r.scrubbing },
      ];
    }
    case 'collections': {
      const r = await collectionsReport(f, { listLimit: 200 });
      return [
        {
          name: 'Summary',
          rows: [
            { metric: 'Funded deals', value: r.portfolio.fundedDeals },
            { metric: 'Total funded', value: r.portfolio.totalFunded },
            { metric: 'Total payback (expected)', value: r.portfolio.totalPayback },
            { metric: 'Collected to date', value: r.portfolio.collectedToDate },
            { metric: 'Outstanding', value: r.portfolio.outstanding },
            { metric: 'Collected share', value: pct(r.portfolio.collectedShare) },
            { metric: 'Expected today', value: r.today.expectedAmount, count: r.today.expectedCount },
            { metric: 'Received today', value: r.today.receivedAmount, count: r.today.receivedCount },
            { metric: 'Failed today', value: r.today.failedAmount, count: r.today.failedCount },
            { metric: `Due next ${r.dueSoonDays} days`, value: r.dueSoon.amount, count: r.dueSoon.count },
            { metric: 'Overdue', value: r.overdue.amount, count: r.overdue.count },
            { metric: 'Expected in period', value: r.period.expected },
            { metric: 'Collected in period', value: r.period.collected },
            { metric: 'Collection rate (period)', value: pct(r.period.collectionRate) },
            { metric: 'Failed in period', value: r.period.failedAmount, count: r.period.failedCount },
            { metric: 'Failure rate (period)', value: pct(r.period.failureRate) },
          ],
        },
        { name: 'Trend', rows: r.trend },
        { name: 'Overdue aging', rows: Object.entries(r.overdue.aging).map(([bucket, v]) => ({ daysOverdue: bucket, ...v })) },
        { name: 'By book', rows: r.byBook.map((b) => ({ ...b, collectionRate: pct(b.collectionRate) })) },
        { name: 'Failed payments', rows: r.failedPayments.map((p) => ({ book: p.bookCode, application: p.applicationNumericId, dealId: p.dealId, merchant: p.merchantName, amount: p.amount, reason: p.failureReason ?? p.rawStatus, scheduled: dt(p.scheduledDate), processed: dt(p.processedDate), method: p.method })) },
        { name: 'Failed reasons', rows: r.failedReasons },
        { name: 'Delinquent deals', rows: r.delinquent.map((d) => ({ book: d.bookCode, application: d.applicationNumericId, dealId: d.dealId, merchant: d.merchantName, overdueAmount: d.overdueAmount, overduePayments: d.overdueCount, failedPayments: d.failedCount, daysOverdue: d.daysOverdue, oldestDue: dt(d.oldestDue) })) },
        { name: 'Health categories', rows: r.healthCategories },
      ];
    }
    case 'applications': {
      const r = await drillDown({ ...f, dateField: 'createdAtTenant', page: 1, limit: 500 });
      const rows = [...r.data];
      for (let p = 2; p <= r.pagination.totalPages && rows.length < 10_000; p++) {
        rows.push(...(await drillDown({ ...f, dateField: 'createdAtTenant', page: p, limit: 500 })).data);
      }
      return [{ name: 'Applications', rows: rows.map((x) => ({ book: x.bookCode, application: x.applicationNumericId, dealId: x.dealId, merchant: x.merchantName, type: x.dealType, stage: x.stageLabel, status: x.status, agent: x.agentName, iso: x.isoName, underwriter: x.underwriterName, requested: x.requestedAmount, approved: x.approvedAmount, funded: x.fundedAmount, commission: x.commissionAmount, balanceDue: x.balanceDue, createdAt: dt(x.createdAtTenant), approvedAt: dt(x.approvedAt), contractSentAt: dt(x.contractSentAt), contractSignedAt: dt(x.contractSignedAt), fundedAt: dt(x.fundedAt), declinedAt: dt(x.declinedAt) })) }];
    }
    default:
      throw Object.assign(new Error(`Unknown report ${String(key)}`), { statusCode: 400 });
  }
}

export function sheetsToXlsx(sheets: Sheet[], meta: { title: string; from: Date; to: Date; books?: string }): Buffer {
  const wb = XLSX.utils.book_new();
  const cover = XLSX.utils.aoa_to_sheet([
    ['Report', meta.title],
    ['From', meta.from.toISOString().slice(0, 10)],
    ['To', meta.to.toISOString().slice(0, 10)],
    ['Books', meta.books ?? 'All'],
    ['Generated', new Date().toISOString()],
  ]);
  XLSX.utils.book_append_sheet(wb, cover, 'About');
  for (const s of sheets) {
    const ws = s.rows.length ? XLSX.utils.json_to_sheet(s.rows) : XLSX.utils.aoa_to_sheet([['No data']]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

export function sheetsToCsv(sheets: Sheet[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const parts: string[] = [];
  for (const s of sheets) {
    parts.push(`# ${s.name}`);
    if (!s.rows.length) {
      parts.push('No data', '');
      continue;
    }
    const cols = [...new Set(s.rows.flatMap((r) => Object.keys(r)))];
    parts.push(cols.join(','));
    for (const r of s.rows) parts.push(cols.map((c) => esc(r[c])).join(','));
    parts.push('');
  }
  return parts.join('\r\n');
}
