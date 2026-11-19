/** Registered from App so list cache invalidation also refreshes TanStack Query. */
let invalidateApplicationsListQueriesFn: (() => void) | null = null;

export function registerApplicationsListQueryInvalidator(fn: (() => void) | null): void {
  invalidateApplicationsListQueriesFn = fn;
}

export function invalidateApplicationsListQueries(): void {
  invalidateApplicationsListQueriesFn?.();
}
