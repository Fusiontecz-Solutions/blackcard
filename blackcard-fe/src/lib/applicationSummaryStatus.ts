import {
  isFakeApplicationQueue,
  NOT_A_APPLICATION_LABEL,
} from "@/lib/notMcaApplication";

/** Status label shown in ApplicationSummary — `Application.currentQueue` only. */
export function getApplicationSummaryStatusLabel(app: {
  currentQueue?: string | null;
}): string {
  const q = app.currentQueue;
  if (q != null && String(q).trim() !== "") {
    const trimmed = String(q).trim();
    if (isFakeApplicationQueue(trimmed)) return NOT_A_APPLICATION_LABEL;
    return trimmed;
  }
  return "-";
}

function parseUpdatedAtMs(value: unknown): number {
  if (value == null || value === "") return 0;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Resolve `Application.currentQueue` for summary display.
 * Prefer the fresher row when list and detail disagree (stale detail cache).
 */
export function resolveApplicationTableCurrentQueue(
  application: { currentQueue?: string | null; updatedAt?: unknown },
  listRow?: { currentQueue?: string | null; updatedAt?: unknown } | null,
): string {
  const detailQueue = String(application.currentQueue ?? "").trim();
  const listQueue = String(listRow?.currentQueue ?? "").trim();

  if (detailQueue && listQueue && detailQueue !== listQueue) {
    const detailUpdatedAt = parseUpdatedAtMs(application.updatedAt);
    const listUpdatedAt = parseUpdatedAtMs(listRow?.updatedAt);
    if (listUpdatedAt > detailUpdatedAt) return listQueue;
    if (detailUpdatedAt > listUpdatedAt) return detailQueue;
    return listQueue;
  }

  return detailQueue || listQueue || "-";
}
