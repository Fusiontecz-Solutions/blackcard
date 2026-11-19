/**
 * Typed client for /api/v1/reports (see REPORTING.md).
 */
import { axiosDelete, axiosGet, axiosPost, axiosPut } from '@/redux/axios';

export type Preset = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'ytd' | 'custom';

export const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisQuarter', label: 'This quarter' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'custom', label: 'Custom range' },
];

export interface ReportFilters {
  preset: Preset;
  from?: string;
  to?: string;
  bookIds: string[];
  agentId?: string;
  underwriterId?: string;
  stage?: string;
  dealType?: string;
  search?: string;
}

export const DEFAULT_FILTERS: ReportFilters = { preset: 'last30', bookIds: [] };

export type ReportKey = 'overview' | 'books' | 'cases' | 'contracts' | 'funding' | 'collections' | 'daily' | 'team' | 'applications';

export function filtersToParams(f: ReportFilters, extra: Record<string, unknown> = {}): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.preset === 'custom') {
    if (f.from) p.from = f.from;
    if (f.to) p.to = f.to;
  } else p.preset = f.preset;
  if (f.bookIds.length) p.bookIds = f.bookIds.join(',');
  if (f.agentId) p.agentId = f.agentId;
  if (f.underwriterId) p.underwriterId = f.underwriterId;
  if (f.stage) p.stage = f.stage;
  if (f.dealType) p.dealType = f.dealType;
  if (f.search) p.search = f.search;
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') p[k] = String(v);
  return p;
}

export function filtersFromSearch(sp: URLSearchParams): ReportFilters {
  const preset = (sp.get('preset') as Preset) || (sp.get('from') && sp.get('to') ? 'custom' : DEFAULT_FILTERS.preset);
  return {
    preset,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    bookIds: (sp.get('bookIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    agentId: sp.get('agentId') ?? undefined,
    underwriterId: sp.get('underwriterId') ?? undefined,
    stage: sp.get('stage') ?? undefined,
    dealType: sp.get('dealType') ?? undefined,
    search: sp.get('search') ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface ResolvedFilters {
  from: string;
  to: string;
  bookIds?: string[];
}

export interface OverviewKpis {
  applications: number;
  requestedAmount: number;
  approved: number;
  approvedAmount: number;
  funded: number;
  fundedAmount: number;
  commissionAmount: number;
  declined: number;
  contractsSent: number;
  contractsSigned: number;
  approvalRate: number | null;
  fundingRate: number | null;
  avgFundedDeal: number | null;
}
export interface TrendPoint {
  bucket: string;
  applications: number;
  approved: number;
  funded: number;
  declined: number;
  fundedAmount: number;
  approvedAmount: number;
}
export interface StageBucket {
  stage: string;
  label: string;
  count: number;
  amount: number;
}
export interface OverviewReport {
  granularity: 'day' | 'week' | 'month';
  current: OverviewKpis;
  previous: OverviewKpis;
  trend: TrendPoint[];
  openPipeline: StageBucket[];
  waiting: StageBucket[];
}

export interface BookRow {
  bookId: string;
  code: string;
  name: string;
  applications: number;
  requestedAmount: number;
  approved: number;
  approvedAmount: number;
  funded: number;
  fundedAmount: number;
  commissionAmount: number;
  declined: number;
  openCount: number;
  openAmount: number;
  balanceDue: number;
  repaidAmount: number;
  approvalRate: number | null;
  fundingRate: number | null;
  avgFundedDeal: number | null;
  avgDaysToFund: number | null;
  renewalShare: number | null;
}
export interface BooksReport {
  rows: BookRow[];
  trend: { granularity: string; buckets: string[]; series: { bookId: string; code: string; name: string; values: number[] }[] };
}

export interface CaseStageRow extends StageBucket {
  aging: Record<string, number>;
  avgDaysInStage: number | null;
  overSla: number;
}
export interface StuckCase {
  bookId: string;
  bookCode?: string;
  applicationUuid: string;
  applicationNumericId: string | null;
  merchantName: string | null;
  stage: string;
  stageLabel: string;
  amount: number;
  agentName: string | null;
  underwriterName: string | null;
  daysInStage: number;
  enteredAt: string;
}
export interface CasesReport {
  slaDays: number;
  byStage: CaseStageRow[];
  stuck: StuckCase[];
  velocity: { stage: string; label: string; avgDays: number | null; medianDays: number | null; samples: number }[];
  cycle: { avgDays: number | null; medianDays: number | null; samples: number };
  declines: { byActor: { actor: string; count: number }[]; reasons: { reason: string; count: number }[] };
}

export interface ContractsReport {
  byStage: StageBucket[];
  sentInRange: number;
  signedInRange: number;
  signRate: number | null;
  needsReinitiation: number;
  turnaround: { approvalToSentAvgDays: number | null; sentToSignedAvgDays: number | null; sentToSignedMedianDays: number | null };
  unsigned: { bookId: string; bookCode?: string; applicationUuid: string; applicationNumericId: string | null; merchantName: string | null; amount: number; agentName: string | null; contractSentAt: string | null; daysOut: number }[];
}

export interface FundingReport {
  granularity: string;
  queue: StageBucket[];
  totals: { funded: number; fundedAmount: number; commissionAmount: number; avgDeal: number | null; renewalShare: number | null; signedToFundedAvgDays: number | null };
  trend: { bucket: string; funded: number; fundedAmount: number; commissionAmount: number }[];
  byBook: { bookId: string; code: string; name: string; count: number; amount: number }[];
  byAgent: { id: string | null; name: string; count: number; amount: number; commission: number }[];
  byUnderwriter: { id: string | null; name: string; count: number; amount: number }[];
  portfolio: { fundedDeals: number; fundedAmount: number; paybackAmount: number; repaidAmount: number; balanceDue: number; collectedShare: number | null };
}

export interface DailyCounts {
  created: number;
  approved: number;
  funded: number;
  fundedAmount: number;
  declined: number;
  contractsSent: number;
  contractsSigned: number;
  stageMoves: number;
}
export interface DailyReport {
  date: string;
  today: DailyCounts;
  yesterday: DailyCounts;
  sameDayLastWeek: DailyCounts;
  queues: { unclaimed: number; claimed: number; waitingDocs: number; onHold: number; byUnderwriter: { name: string; count: number }[] };
  movements: { at: string; bookCode?: string; applicationUuid: string; applicationNumericId: string | null; merchantName: string | null; amount: number; from: string | null; to: string | null; agentName: string | null; underwriterName: string | null }[];
  logins: { email: string | null; count: number }[];
}

export interface TeamReport {
  agents: { id: string | null; name: string; submitted: number; requestedAmount: number; approved: number; funded: number; fundedAmount: number; commission: number; approvalRate: number | null; fundingRate: number | null }[];
  underwriters: { id: string | null; name: string; decisions: number; approved: number; declined: number; approvedAmount: number; funded: number; fundedAmount: number; approvalRate: number | null }[];
  scrubbing: { recommendation: string | null; count: number }[];
}

export interface ApplicationRow {
  id: string;
  bookId: string;
  bookCode: string | null;
  bookName: string | null;
  applicationUuid: string;
  applicationNumericId: string | null;
  dealId: string | null;
  merchantName: string | null;
  dealType: string | null;
  stage: string | null;
  stageLabel: string;
  status: string | null;
  agentName: string | null;
  isoName: string | null;
  underwriterName: string | null;
  requestedAmount: number;
  approvedAmount: number;
  fundedAmount: number;
  commissionAmount: number;
  balanceDue: number;
  createdAtTenant: string | null;
  approvedAt: string | null;
  contractSentAt: string | null;
  contractSignedAt: string | null;
  fundedAt: string | null;
  declinedAt: string | null;
  updatedAtTenant: string | null;
}
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ReportOptions {
  books: { id: string; code: string; name: string; status: boolean }[];
  agents: { id: string; name: string; count: number }[];
  underwriters: { id: string; name: string; count: number }[];
  stages: { stage: string | null; label: string; count: number }[];
  dealTypes: { dealType: string; count: number }[];
  reports: { key: ReportKey; title: string }[];
}

export interface SyncStatus {
  running: boolean;
  facts: number;
  lastEventAt: string | null;
  books: { bookId: string; code?: string; name?: string; facts: number; lastSyncedAt: string | null }[];
  runs: { id: string; bookId: string | null; bookCode: string | null; trigger: string; status: string; startedAt: string; finishedAt: string | null; applicationsSeen: number; upserted: number; stageEvents: number; error: string | null }[];
}

/** `digest` is the designed daily email; other keys attach a spreadsheet export. */
export type ScheduleReportKey = ReportKey | 'digest';

export interface ReportSchedule {
  id: string;
  name: string;
  reportKey: ScheduleReportKey;
  filters: Partial<ReportFilters> & Record<string, unknown>;
  frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly';
  hourLocal: number;
  minuteLocal: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timezone: string;
  recipients: string[];
  format: 'xlsx' | 'csv';
  enabled: boolean;
  /** Digest only. */
  sections: string[];
  includeAttachment: boolean;
  subject: string | null;
  note: string | null;
  createdByEmail: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  nextRunAt: string | null;
}

export interface DigestSection {
  key: string;
  label: string;
  description: string;
  limit?: number;
}

export interface DigestSectionsResponse {
  sections: DigestSection[];
  defaults: string[];
  smtpConfigured: boolean;
  /** none = no delivery configured; smtp = real sending; outbox = local dev folder. */
  mailMode: 'none' | 'smtp' | 'outbox';
  outboxDir: string | null;
  defaultTimezone: string;
}

export interface DigestPreviewRequest {
  sections: string[];
  bookIds?: string[];
  timezone?: string;
  title?: string | null;
  note?: string | null;
}

export interface DigestPreview {
  subject: string;
  html: string;
  text: string;
  rendered: string[];
  reportDate: string;
}

export interface CollectionsReport {
  asOf: string;
  granularity: 'day' | 'week' | 'month';
  dueSoonDays: number;
  portfolio: { fundedDeals: number; totalFunded: number; totalPayback: number; collectedToDate: number; outstanding: number; collectedShare: number | null };
  today: { expectedCount: number; expectedAmount: number; receivedCount: number; receivedAmount: number; failedCount: number; failedAmount: number };
  dueSoon: { count: number; amount: number };
  overdue: { count: number; amount: number; aging: Record<string, { count: number; amount: number }> };
  period: { expected: number; collected: number; collectionRate: number | null; failedCount: number; failedAmount: number; failureRate: number | null; paidCount: number };
  trend: { bucket: string; expected: number; collected: number; failed: number; failedCount: number; paidCount: number }[];
  failedReasons: { reason: string; count: number; amount: number }[];
  failedPayments: { id: string; bookId: string; bookCode: string | null; applicationUuid: string | null; applicationNumericId: string | null; dealId: string | null; merchantName: string | null; amount: number; rawStatus: string | null; failureReason: string | null; scheduledDate: string | null; processedDate: string | null; method: string | null }[];
  delinquent: { bookId: string; bookCode: string | null; applicationUuid: string | null; applicationNumericId: string | null; dealId: string | null; merchantName: string | null; overdueAmount: number; overdueCount: number; failedCount: number; oldestDue: string | null; daysOverdue: number }[];
  byBook: { bookId: string; code: string; name: string; fundedDeals: number; fundedAmount: number; outstanding: number; expected: number; collected: number; failedCount: number; failedAmount: number; overdueCount: number; overdueAmount: number; collectionRate: number | null }[];
  healthCategories: { category: string; deals: number; outstanding: number }[];
}

export type PaymentKind = 'failed' | 'overdue' | 'due' | 'paid' | 'scheduled' | 'all';

export interface PaymentRow {
  id: string;
  bookId: string;
  bookCode: string | null;
  paymentUuid: string;
  applicationUuid: string | null;
  applicationNumericId: string | null;
  dealId: string | null;
  merchantName: string | null;
  amount: number;
  paidAmount: number | null;
  status: string;
  rawStatus: string | null;
  failureReason: string | null;
  method: string | null;
  scheduledDate: string | null;
  processedDate: string | null;
  daysOverdue: number;
}

export interface SavedView {
  id: string;
  ownerId: string;
  name: string;
  reportKey: ReportKey;
  filters: Partial<ReportFilters> & Record<string, unknown>;
  isShared: boolean;
  mine: boolean;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

type Envelope<T> = { success: boolean; filters?: ResolvedFilters; data: T; message?: string };

async function get<T>(path: string, params?: Record<string, string>): Promise<Envelope<T>> {
  const res = await axiosGet(path, { params });
  return res.data as Envelope<T>;
}

export const reportApi = {
  options: (f: ReportFilters) => get<ReportOptions>('/reports/options', filtersToParams(f)),
  overview: (f: ReportFilters) => get<OverviewReport>('/reports/overview', filtersToParams(f)),
  books: (f: ReportFilters) => get<BooksReport>('/reports/books', filtersToParams(f)),
  cases: (f: ReportFilters, slaDays?: number) => get<CasesReport>('/reports/cases', filtersToParams(f, { slaDays })),
  contracts: (f: ReportFilters) => get<ContractsReport>('/reports/contracts', filtersToParams(f)),
  funding: (f: ReportFilters) => get<FundingReport>('/reports/funding', filtersToParams(f)),
  daily: (f: ReportFilters, date?: string) => get<DailyReport>('/reports/daily', filtersToParams({ ...f, preset: 'today' }, { date })),
  team: (f: ReportFilters) => get<TeamReport>('/reports/team', filtersToParams(f)),
  collections: (f: ReportFilters, dueSoonDays?: number) => get<CollectionsReport>('/reports/collections', filtersToParams(f, { dueSoonDays })),
  payments: async (f: ReportFilters, q: { kind: PaymentKind; applicationUuid?: string; bookId?: string; page?: number; limit?: number }) => {
    const res = await axiosGet('/reports/payments', { params: filtersToParams(f, { kind: q.kind, applicationUuid: q.applicationUuid, bookId: q.bookId, page: q.page, limit: q.limit }) });
    return res.data as { success: boolean; data: PaymentRow[]; pagination: Pagination };
  },
  applications: async (f: ReportFilters, q: { dateField?: string; page?: number; limit?: number; sortBy?: string; sortDir?: string; stage?: string; bookId?: string } = {}) => {
    const res = await axiosGet('/reports/applications', { params: filtersToParams({ ...f, stage: q.stage ?? f.stage }, { dateField: q.dateField, page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir, bookId: q.bookId }) });
    return res.data as { success: boolean; data: ApplicationRow[]; pagination: Pagination };
  },
  syncStatus: () => get<SyncStatus>('/reports/sync/status'),
  sync: (body: { bookId?: string; full?: boolean } = {}) => axiosPost('/reports/sync', body),
  schedules: () => get<ReportSchedule[]>('/reports/schedules'),
  createSchedule: (body: Partial<ReportSchedule>) => axiosPost('/reports/schedules', body),
  updateSchedule: (id: string, body: Partial<ReportSchedule>) => axiosPut(`/reports/schedules/${id}`, body),
  deleteSchedule: (id: string) => axiosDelete(`/reports/schedules/${id}`),
  runSchedule: (id: string) => axiosPost(`/reports/schedules/${id}/run`),
  schedulePreview: (id: string) => get<{ subject: string; html: string; attachment: { filename: string } | null }>(`/reports/schedules/${id}/preview`),
  digestSections: () => get<DigestSectionsResponse>('/reports/digest/sections'),
  digestPreview: async (body: DigestPreviewRequest) => {
    const res = await axiosPost('/reports/digest/preview', body);
    return res.data as Envelope<DigestPreview>;
  },
  digestTest: (body: DigestPreviewRequest & { recipients?: string[]; subject?: string | null }) => axiosPost('/reports/digest/test', body),
  views: () => get<SavedView[]>('/reports/views'),
  createView: (body: { name: string; reportKey: ReportKey; filters: ReportFilters; isShared: boolean }) => axiosPost('/reports/views', body),
  deleteView: (id: string) => axiosDelete(`/reports/views/${id}`),
  exportUrl: (key: ReportKey, f: ReportFilters, format: 'xlsx' | 'csv') =>
    `/reports/export/${key}?${new URLSearchParams(filtersToParams(f, { format })).toString()}`,
};

export async function downloadReport(key: ReportKey, f: ReportFilters, format: 'xlsx' | 'csv') {
  const res = await axiosGet(`/reports/export/${key}`, { params: filtersToParams(f, { format }), responseType: 'blob' });
  const blob = res.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${key}-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function getReportErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || e?.message || fallback;
}
