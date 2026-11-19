/**
 * True when a list/table fetch is in flight and there are no rows to show yet.
 * Prevents flashing "No data" before the first (or cleared) response arrives.
 */
export function isListBlockingLoad(args: {
  rowCount: number;
  loading?: boolean;
  isRefreshing?: boolean;
  isFetching?: boolean;
  /** Set when the first request has not completed (e.g. pagination still null). */
  awaitingFirstLoad?: boolean;
}): boolean {
  const busy =
    Boolean(args.loading) ||
    Boolean(args.isRefreshing) ||
    Boolean(args.isFetching) ||
    Boolean(args.awaitingFirstLoad);
  return busy && args.rowCount === 0;
}
