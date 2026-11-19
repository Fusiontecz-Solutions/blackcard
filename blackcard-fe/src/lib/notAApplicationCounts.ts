import { FAKE_APPLICATION_QUEUE } from "@/lib/notMcaApplication";

let invalidateNotAApplicationCountFn: (() => void) | null = null;

export function registerNotAApplicationCountInvalidator(
  fn: (() => void) | null,
): void {
  invalidateNotAApplicationCountFn = fn;
}

export function invalidateNotAApplicationCount(): void {
  invalidateNotAApplicationCountFn?.();
}

/** Live count of deals tagged `currentQueue = fake Application`. */
export async function fetchNotAApplicationCount(): Promise<number | null> {
  try {
    const { executeApplicationsListFetch } = await import(
      "@/redux/actions/applicationActions"
    );
    const response = await executeApplicationsListFetch({
      currentQueue: FAKE_APPLICATION_QUEUE,
      lite: true,
      page: 1,
      limit: 1,
      skipListCache: true,
    });
    const pagination = response?.pagination;
    const total = Number(pagination?.totalItems ?? pagination?.total ?? 0);
    const rows = Array.isArray(response?.data) ? response.data.length : 0;
    if (Number.isFinite(total) && total > 0) return total;
    return rows;
  } catch {
    return null;
  }
}
