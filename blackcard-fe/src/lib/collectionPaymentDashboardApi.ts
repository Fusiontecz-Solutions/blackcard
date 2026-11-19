import { isAxiosError } from "axios";
import { axiosGet, axiosPost } from "@/redux/axios";

/** Matches `FundedDealBalanceApiRow` from `collectionPaymentFinancials.ts` (POST `/collection-payments/balances`). */
export type FundedDealBalanceApiRow = {
  applicationId: string;
  dealId: string;
  paybackAmount: number;
  sumOfRepaid: number;
  balanceDue: number;
  grossRepaidDealEconomics: number;
};

/**
 * Max concurrent GET `/collection-payments` calls. Higher values exceed typical per-host browser limits (~6),
 * which inflates DevTools "Stalled" time while requests wait for a free connection.
 */
const COLLECTION_PAYMENTS_FETCH_CONCURRENCY = 5;

/** Align with payment dashboard / funded-list requests — balances + per-app rows can exceed the old 25s default. */
const COLLECTION_BALANCES_REQUEST_TIMEOUT_MS = 180_000;
const COLLECTION_PAYMENTS_GET_TIMEOUT_MS = 120_000;
/** Single bulk POST replaces many GETs — allow same ceiling as balances for large portfolios. */
const COLLECTION_PAYMENTS_BULK_POST_TIMEOUT_MS = COLLECTION_BALANCES_REQUEST_TIMEOUT_MS;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await worker(items[i]!, i);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Fresh per-application balances (repaid, payback, deal economics) from the DB.
 */
export async function fetchCollectionBalancesForApplicationIds(
  applicationIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, FundedDealBalanceApiRow>> {
  const ids = [
    ...new Set(
      applicationIds.map((id) => String(id ?? "").trim()).filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return new Map();

  const res = await axiosPost(
    "/collection-payments/balances",
    { applicationIds: ids },
    { timeout: COLLECTION_BALANCES_REQUEST_TIMEOUT_MS, signal },
  );
  const list = (res.data?.data ?? []) as unknown[];
  const map = new Map<string, FundedDealBalanceApiRow>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const applicationId = String(r.applicationId ?? "").trim();
    if (!applicationId) continue;
    map.set(applicationId, {
      applicationId,
      dealId: String(r.dealId ?? "").trim(),
      paybackAmount: Number(r.paybackAmount ?? 0),
      sumOfRepaid: Number(r.sumOfRepaid ?? 0),
      balanceDue: Number(r.balanceDue ?? 0),
      grossRepaidDealEconomics: Number(r.grossRepaidDealEconomics ?? 0),
    });
  }
  return map;
}

async function fetchCollectionPaymentsViaPerApplicationGets(
  applicationIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, unknown[]>> {
  const ids = [
    ...new Set(
      applicationIds.map((id) => String(id ?? "").trim()).filter((id) => id.length > 0),
    ),
  ];
  const out: Record<string, unknown[]> = {};
  if (ids.length === 0) return out;

  const batch = await mapWithConcurrency(
    ids,
    COLLECTION_PAYMENTS_FETCH_CONCURRENCY,
    async (applicationId) => {
      try {
        const res = await axiosGet("/collection-payments", {
          params: { applicationId },
          timeout: COLLECTION_PAYMENTS_GET_TIMEOUT_MS,
          signal,
        });
        const raw = res.data?.data;
        const rows = Array.isArray(raw) ? raw : [];
        return { applicationId, rows };
      } catch (e) {
        if (isAxiosError(e) && (e.code === "ERR_CANCELED" || signal?.aborted)) {
          throw e;
        }
        return { applicationId, rows: [] as unknown[] };
      }
    },
    signal,
  );

  for (const { applicationId, rows } of batch) {
    out[applicationId] = rows;
  }
  return out;
}

/**
 * Loads collection payment rows for many applications. Prefer one POST `/collection-payments/by-application-ids`;
 * falls back to bounded concurrent GETs if the bulk route fails (older servers / proxies).
 */
export async function fetchCollectionPaymentsForApplicationsBatched(
  applicationIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, unknown[]>> {
  const ids = [
    ...new Set(
      applicationIds.map((id) => String(id ?? "").trim()).filter((id) => id.length > 0),
    ),
  ];
  const out: Record<string, unknown[]> = {};
  if (ids.length === 0) return out;

  try {
    const res = await axiosPost(
      "/collection-payments/by-application-ids",
      { applicationIds: ids },
      { timeout: COLLECTION_PAYMENTS_BULK_POST_TIMEOUT_MS, signal },
    );
    const payload = res.data?.data as unknown;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const bucket = payload as Record<string, unknown>;
      for (const id of ids) {
        const rows = bucket[id];
        out[id] = Array.isArray(rows) ? rows : [];
      }
      return out;
    }
    return fetchCollectionPaymentsViaPerApplicationGets(ids, signal);
  } catch (e) {
    if (isAxiosError(e) && (e.code === "ERR_CANCELED" || signal?.aborted)) {
      throw e;
    }
    console.warn(
      "[PaymentDashboard] Bulk collection-payments failed; falling back to per-application GETs.",
      e,
    );
    return fetchCollectionPaymentsViaPerApplicationGets(ids, signal);
  }
}
