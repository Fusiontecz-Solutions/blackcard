import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Bookmark, Download, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { DEFAULT_FILTERS, PRESETS, downloadReport, getReportErrorMessage, reportApi, type Preset, type ReportFilters, type ReportKey } from './reportApi';
import { useReportOptions } from './useReportFilters';

// ---------------------------------------------------------------------------
// Bar
// ---------------------------------------------------------------------------

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export function ReportFiltersBar({
  filters,
  onChange,
  onReset,
  reportKey,
  showPeople = true,
  showStage = false,
  showSearch = false,
  showRange = true,
  onRefresh,
  refreshing,
}: {
  filters: ReportFilters;
  onChange: (next: Partial<ReportFilters>) => void;
  onReset: () => void;
  reportKey: ReportKey;
  showPeople?: boolean;
  showRange?: boolean;
  showStage?: boolean;
  showSearch?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { can } = usePermissions();
  const { data: options } = useReportOptions({ ...filters, bookIds: [] });
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [viewShared, setViewShared] = useState(false);
  const [search, setSearch] = useState(filters.search ?? '');
  useEffect(() => setSearch(filters.search ?? ''), [filters.search]);
  useEffect(() => {
    if (!showSearch) return;
    const t = setTimeout(() => {
      if ((search || undefined) !== filters.search) onChange({ search: search || undefined });
    }, 350);
    return () => clearTimeout(t);
  }, [search, showSearch, filters.search, onChange]);

  const views = useQuery({ queryKey: ['reports', 'views'], queryFn: async () => (await reportApi.views()).data, staleTime: 60_000 });



  const applyView = (v: { filters: Partial<ReportFilters> }) => {
    onChange({ ...DEFAULT_FILTERS, ...v.filters, bookIds: (v.filters.bookIds as string[]) ?? [] });
  };

  const saveView = async () => {
    if (!viewName.trim()) return;
    try {
      await reportApi.createView({ name: viewName.trim(), reportKey, filters, isShared: viewShared });
      toast.success('View saved');
      setSaveOpen(false);
      setViewName('');
      void views.refetch();
    } catch (err) {
      toast.error(getReportErrorMessage(err, 'Could not save view'));
    }
  };

  const removeView = async (id: string) => {
    try {
      await reportApi.deleteView(id);
      void views.refetch();
    } catch (err) {
      toast.error(getReportErrorMessage(err, 'Could not delete view'));
    }
  };

  const exportAs = async (format: 'xlsx' | 'csv') => {
    try {
      await downloadReport(reportKey, filters, format);
    } catch (err) {
      toast.error(getReportErrorMessage(err, 'Export failed'));
    }
  };

  const active = [filters.agentId, filters.underwriterId, filters.stage, filters.dealType, filters.search].filter(Boolean).length + (filters.bookIds.length ? 1 : 0) + (filters.preset !== DEFAULT_FILTERS.preset ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      {/* Date range */}
      {showRange ? (
      <select className={selectClass} value={filters.preset} onChange={(e) => onChange({ preset: e.target.value as Preset })} aria-label="Date range">
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      ) : null}
      {showRange && filters.preset === 'custom' ? (
        <div className="flex items-center gap-1">
          <Input type="date" className="h-9 w-[150px]" value={filters.from ?? ''} onChange={(e) => onChange({ from: e.target.value || undefined })} aria-label="From date" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-9 w-[150px]" value={filters.to ?? ''} onChange={(e) => onChange({ to: e.target.value || undefined })} aria-label="To date" />
        </div>
      ) : null}

      {/* Single-tenant CRM: book picker omitted */}

      {/* People / type */}
      {showPeople ? (
        <>
          <select className={selectClass} value={filters.agentId ?? ''} onChange={(e) => onChange({ agentId: e.target.value || undefined })} aria-label="Agent">
            <option value="">All agents</option>
            {(options?.agents ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={filters.underwriterId ?? ''} onChange={(e) => onChange({ underwriterId: e.target.value || undefined })} aria-label="Underwriter">
            <option value="">All underwriters</option>
            {(options?.underwriters ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={filters.dealType ?? ''} onChange={(e) => onChange({ dealType: e.target.value || undefined })} aria-label="Deal type">
            <option value="">All types</option>
            {(options?.dealTypes ?? []).map((d) => (
              <option key={d.dealType} value={d.dealType}>
                {d.dealType}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {showStage ? (
        <select className={selectClass} value={filters.stage ?? ''} onChange={(e) => onChange({ stage: e.target.value || undefined })} aria-label="Stage">
          <option value="">All stages</option>
          {(options?.stages ?? []).map((s) => (
            <option key={s.stage ?? 'none'} value={s.stage ?? ''}>
              {s.label}
            </option>
          ))}
        </select>
      ) : null}
      {showSearch ? <Input className="h-9 w-48" placeholder="Search merchant, deal id…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" /> : null}

      {active > 0 ? (
        <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={onReset}>
          <X className="size-3.5" /> Clear
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        {onRefresh ? (
          <Button variant="ghost" size="sm" className="h-9" onClick={onRefresh} disabled={refreshing} aria-label="Refresh">
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </Button>
        ) : null}

        {/* Saved views */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Bookmark className="size-4" /> Views
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => setSaveOpen(true)} className="text-xs">
              <Save className="mr-2 size-3.5" /> Save current filters…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {(views.data ?? []).filter((v) => v.reportKey === reportKey).length === 0 ? (
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">No saved views for this report</DropdownMenuLabel>
            ) : null}
            {(views.data ?? [])
              .filter((v) => v.reportKey === reportKey)
              .map((v) => (
                <DropdownMenuItem key={v.id} onSelect={() => applyView(v)} className="group text-xs">
                  <span className="flex-1 truncate">{v.name}</span>
                  {v.isShared ? <span className="ml-2 text-[10px] text-muted-foreground">shared</span> : null}
                  {v.mine ? (
                    <button type="button" className="ml-2 hidden text-muted-foreground hover:text-red-600 group-hover:inline" onClick={(e) => { e.stopPropagation(); void removeView(v.id); }} aria-label={`Delete view ${v.name}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export */}
        {can('reports.export') ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9 gap-1.5">
                <Download className="size-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void exportAs('xlsx')} className="text-xs">Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportAs('csv')} className="text-xs">CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <Dialog open={saveOpen} onOpenChange={(o: boolean) => setSaveOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>Saves the current date range and filters for this report.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="view-name">Name</Label>
              <Input id="view-name" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Funded last quarter – Black Card" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={viewShared} onCheckedChange={(c: boolean | 'indeterminate') => setViewShared(c === true)} /> Share with everyone who can see reports
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveView()} disabled={!viewName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ReportFiltersBar;
