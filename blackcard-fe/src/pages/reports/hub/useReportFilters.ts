import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_FILTERS, PRESETS, filtersFromSearch, filtersToParams, reportApi, type ReportFilters } from './reportApi';

const FILTER_KEYS = ['preset', 'from', 'to', 'bookIds', 'agentId', 'underwriterId', 'stage', 'dealType', 'search'] as const;

export function useReportFilters(): [ReportFilters, (next: Partial<ReportFilters>) => void, () => void] {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(sp), [sp]);
  const update = useCallback(
    (next: Partial<ReportFilters>) => {
      const merged: ReportFilters = { ...filters, ...next };
      const params = filtersToParams(merged);
      setSp(
        (prev) => {
          const out = new URLSearchParams(prev);
          for (const k of FILTER_KEYS) out.delete(k);
          for (const [k, v] of Object.entries(params)) out.set(k, v);
          return out;
        },
        { replace: true },
      );
    },
    [filters, setSp],
  );
  const reset = useCallback(() => update({ ...DEFAULT_FILTERS, from: undefined, to: undefined, agentId: undefined, underwriterId: undefined, stage: undefined, dealType: undefined, search: undefined }), [update]);
  return [filters, update, reset];
}

export function useReportOptions(filters: ReportFilters) {
  return useQuery({
    queryKey: ['reports', 'options', filters.bookIds.join(',')],
    queryFn: async () => (await reportApi.options(filters)).data,
    staleTime: 5 * 60 * 1000,
  });
}

export function describeRange(f: ReportFilters, resolved?: { from: string; to: string } | null): string {
  if (f.preset !== 'custom') return PRESETS.find((p) => p.value === f.preset)?.label ?? f.preset;
  const from = resolved?.from ?? f.from;
  const to = resolved?.to ?? f.to;
  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '…');
  return `${fmt(from)} – ${fmt(to)}`;
}
