/** Route helpers — limit authenticated-shell prefetch to pages that need the data. */

export function isPaymentsRoute(pathname: string): boolean {
  return pathname === "/payments" || pathname.startsWith("/payments/");
}

function isOpsOrSuperAdminRole(normalizedRole: string): boolean {
  return (
    normalizedRole === "OPERATIONS" || normalizedRole === "SUPER_ADMIN"
  );
}

/** Sidebar deal-pipeline badges need summary counts on any authenticated page. */
export function shouldPrefetchOpsDashboardSummary(
  normalizedRole: string,
): boolean {
  return (
    isOpsOrSuperAdminRole(normalizedRole) || normalizedRole === "UNDERWRITER"
  );
}

export function isOpsDashboardWarmRoute(
  pathname: string,
  normalizedRole: string,
): boolean {
  if (!isOpsOrSuperAdminRole(normalizedRole)) return false;
  return (
    pathname === "/" ||
    pathname === "/cases-dashboard" ||
    pathname === "/case-management"
  );
}

export function isApplicationStatsWarmRoute(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/applications" ||
    pathname.startsWith("/applications/") ||
    pathname === "/agents" ||
    pathname.startsWith("/application-details")
  );
}

export function isPipelineListWarmRoute(pathname: string): boolean {
  return (
    pathname === "/deal-pipeline" ||
    pathname.startsWith("/deal-pipeline/") ||
    pathname === "/applications" ||
    pathname.startsWith("/applications/")
  );
}
