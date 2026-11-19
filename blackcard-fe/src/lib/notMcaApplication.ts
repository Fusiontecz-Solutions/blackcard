import { isSuperAdminRole, normalizeRoleKey } from "@/lib/sessionRole";

/** Stored `Application.currentQueue` for deals that are not real MCA applications. */
export const FAKE_APPLICATION_QUEUE = "fake Application";

/** Super Admin list heading under Recently Deleted. */
export const NOT_A_APPLICATION_LABEL = "Not A Submission";

/** Stored `Application.currentQueue` (and state) for old deals that were never scrubbed. */
export const OLD_NOT_SCRUBBED_QUEUE = "Old Not Scrubbed";

/** Super Admin sidebar / list heading, below Not A Submission. */
export const OLD_NOT_SCRUBBED_LABEL = "Old - Not Scrubbed";

const FAKE_APPLICATION_QUEUE_ALIASES = [
  FAKE_APPLICATION_QUEUE,
  "Fake Application",
  "Not A Submission",
  "Not an MCA Application",
  "Not an MC Application",
] as const;

function normalizeFakeApplicationKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

export function isFakeApplicationQueue(
  value: string | null | undefined,
): boolean {
  const key = normalizeFakeApplicationKey(value);
  if (!key) return false;
  return (
    key === "fakeapplication" ||
    key === "notaapplication" ||
    key === "notanapplication" ||
    key === "notanmcaapplication" ||
    key === "notanmcapplication"
  );
}

export function isNotMcaApplication(app: {
  currentQueue?: string | null;
  currentState?: string | null;
  queue?: string | null;
  state?: string | null;
  status?: string | null;
  statsCurrentState?: string | null;
} | null | undefined): boolean {
  if (!app) return false;
  return (
    isFakeApplicationQueue(app.currentQueue) ||
    isFakeApplicationQueue(app.queue) ||
    isFakeApplicationQueue(app.currentState) ||
    isFakeApplicationQueue(app.state) ||
    isFakeApplicationQueue(app.status) ||
    isFakeApplicationQueue(app.statsCurrentState)
  );
}

export function canUseNotAApplicationTag(role?: string | null): boolean {
  const key = normalizeRoleKey(String(role ?? ""));
  return isSuperAdminRole(key) || key === "SCRUBBING";
}

void FAKE_APPLICATION_QUEUE_ALIASES;
