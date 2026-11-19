/**
 * True when the URL segment for an application details route matches the
 * loaded application (by UUID `_id`, legacy `id`, or numeric `applicationId`).
 */
export function routeParamMatchesApplication(
  routeParam: string | undefined | null,
  data: unknown,
): boolean {
  if (routeParam == null || String(routeParam).trim() === "" || data == null) {
    return false;
  }
  const r = String(routeParam).trim();
  const d = data as Record<string, unknown>;
  if (d._id != null && String(d._id) === r) return true;
  if (d.id != null && String(d.id) === r) return true;
  if (d.applicationId != null && String(d.applicationId) === r) return true;
  return false;
}

/** Route param is the numeric public application id (e.g. /application-details/42). */
export function isNumericApplicationRouteParam(param: string): boolean {
  return /^\d+$/.test(String(param).trim());
}
