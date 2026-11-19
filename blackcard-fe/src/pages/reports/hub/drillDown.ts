/** Column defaults and link helper for report drill-down tables. */

export const DEFAULT_COLUMNS = ['book', 'application', 'merchant', 'stage', 'agent', 'underwriter', 'approved', 'funded', 'created', 'updated'];

export function applicationHref(r: { applicationUuid: string; bookCode?: string | null }): string {
  const q = r.bookCode ? `?bookCode=${encodeURIComponent(r.bookCode)}` : '';
  return `/application-details/${encodeURIComponent(r.applicationUuid)}${q}`;
}
