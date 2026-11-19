/**
 * Filter parsing shared by the controller (query string) and schedules (stored JSON).
 * Relative presets are resolved against "now" (or `_asOf` for scheduled runs)
 * so a saved "last 30 days" schedule always rolls forward.
 */
import type { ReportFilters } from './reportQueryService';

export type Preset = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'ytd' | 'custom';

export interface RawFilters {
  preset?: Preset | string;
  from?: string;
  to?: string;
  bookIds?: string[] | string;
  bookId?: string;
  agentId?: string;
  underwriterId?: string;
  stage?: string;
  status?: string;
  dealType?: string;
  search?: string;
  /** Scheduler: evaluate relative presets as of this instant. */
  _asOf?: string;
}

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const endOfDay = (d: Date) => new Date(startOfDay(d).getTime() + DAY - 1);

export function presetRange(preset: string, now: Date): { from: Date; to: Date } | null {
  const today = startOfDay(now);
  switch (preset) {
    case 'today':
      return { from: today, to: endOfDay(now) };
    case 'yesterday':
      return { from: new Date(today.getTime() - DAY), to: new Date(today.getTime() - 1) };
    case 'last7':
      return { from: new Date(today.getTime() - 6 * DAY), to: endOfDay(now) };
    case 'last30':
      return { from: new Date(today.getTime() - 29 * DAY), to: endOfDay(now) };
    case 'last90':
      return { from: new Date(today.getTime() - 89 * DAY), to: endOfDay(now) };
    case 'thisWeek': {
      const dow = today.getUTCDay() || 7;
      return { from: new Date(today.getTime() - (dow - 1) * DAY), to: endOfDay(now) };
    }
    case 'thisMonth':
      return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: endOfDay(now) };
    case 'lastMonth': {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1);
      return { from, to };
    }
    case 'thisQuarter': {
      const q = Math.floor(now.getUTCMonth() / 3) * 3;
      return { from: new Date(Date.UTC(now.getUTCFullYear(), q, 1)), to: endOfDay(now) };
    }
    case 'ytd':
      return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: endOfDay(now) };
    default:
      return null;
  }
}

function list(v: string[] | string | undefined): string[] | undefined {
  if (!v) return undefined;
  const arr = Array.isArray(v) ? v : String(v).split(',');
  const out = arr.map((s) => String(s).trim()).filter((s) => s && s.toLowerCase() !== 'all');
  return out.length ? out : undefined;
}

export function resolveFilters(raw: RawFilters): ReportFilters {
  const now = raw._asOf ? new Date(raw._asOf) : new Date();
  let range = presetRange(String(raw.preset ?? ''), now);
  if (!range) {
    const from = raw.from ? new Date(raw.from) : null;
    const to = raw.to ? new Date(raw.to) : null;
    if (from && !Number.isNaN(from.getTime()) && to && !Number.isNaN(to.getTime())) {
      range = { from: startOfDay(from), to: endOfDay(to) };
    } else {
      range = presetRange('last30', now)!;
    }
  }
  // Guard against absurd ranges (max 3 years).
  if (range.to.getTime() - range.from.getTime() > 3 * 366 * DAY) range.from = new Date(range.to.getTime() - 3 * 366 * DAY);

  const bookIds = list(raw.bookIds) ?? (raw.bookId && raw.bookId !== 'all' ? [raw.bookId] : undefined);
  const s = (v: unknown) => (v === undefined || v === null || v === '' || v === 'all' ? undefined : String(v));
  return {
    from: range.from,
    to: range.to,
    bookIds,
    agentId: s(raw.agentId),
    underwriterId: s(raw.underwriterId),
    stage: s(raw.stage),
    status: s(raw.status),
    dealType: s(raw.dealType),
    search: s(raw.search),
  };
}
