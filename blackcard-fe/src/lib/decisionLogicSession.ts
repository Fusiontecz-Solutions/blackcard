const SESSION_PREFIX = "dl-request-code:";

export function decisionLogicRequestCodeSessionKey(token: string): string {
  return `${SESSION_PREFIX}${token}`;
}

export function readCachedDecisionLogicRequestCode(
  token: string,
): string | null {
  const key = decisionLogicRequestCodeSessionKey(token);
  try {
    const cached = String(sessionStorage.getItem(key) ?? "").trim();
    return cached || null;
  } catch {
    return null;
  }
}

export function writeCachedDecisionLogicRequestCode(
  token: string,
  requestCode: string,
): void {
  const rc = String(requestCode ?? "").trim();
  if (!rc) return;
  try {
    sessionStorage.setItem(decisionLogicRequestCodeSessionKey(token), rc);
  } catch {
    /* private browsing / quota */
  }
}

export function clearCachedDecisionLogicRequestCode(token: string): void {
  try {
    sessionStorage.removeItem(decisionLogicRequestCodeSessionKey(token));
  } catch {
    /* ignore */
  }
}
