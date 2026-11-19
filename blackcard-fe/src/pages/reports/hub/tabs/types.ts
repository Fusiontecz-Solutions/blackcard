import type { ReportFilters } from '../reportApi';

export interface TabProps {
  filters: ReportFilters;
  onFilters: (next: Partial<ReportFilters>) => void;
}
