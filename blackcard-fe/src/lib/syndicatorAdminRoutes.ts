/**
 * Admin CRM syndicator management (internal staff).
 * Users with role SYNDICATOR must not reach these URLs (direct navigation or login returnUrl).
 */
export function syndicatorMustNotAccessPath(pathname: string): boolean {
  if (
    pathname === '/syndicators' ||
    pathname === '/syndicators/dashboard'
  ) {
    return true;
  }
  if (pathname.startsWith('/syndicators/syndicators-list')) {
    return true;
  }
  return false;
}
