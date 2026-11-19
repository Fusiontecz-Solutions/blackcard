import { jwtDecode } from "jwt-decode";
import type { OperationsDashboardRecentCase } from "@/redux/actions/operationsDashboardActions";
import { idbClearNamespace, idbGet, idbSet } from "@/lib/persistentCache/idbStore";

const IDB_NAMESPACE = "operations-dashboard.v1";
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StoredBlob = {
  v: 1;
  userId: string;
  savedAt: number;
  summaryCounts: {
    totalCases: number;
    contractPending: number;
    contractGenerated: number;
    contractsOut: number;
    signedContracts: number;
    fundingCall: number;
    disbursment: number;
    funded: number;
  };
  caseStageCounts: Record<string, number>;
  operationsMetricsMode: string | null;
  hasLoadedRecentOnce?: boolean;
  recentCases: OperationsDashboardRecentCase[];
};

let memoryBlob: StoredBlob | null = null;

function getTokenUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    const token = localStorage.getItem("token");
    if (!token) return "";
    const decoded = jwtDecode<{ id?: string }>(token);
    return decoded?.id ? String(decoded.id) : "";
  } catch {
    return "";
  }
}

function normalizeRecentCase(
  row: OperationsDashboardRecentCase,
): OperationsDashboardRecentCase {
  return {
    ...row,
    applicationMongoId: row.applicationMongoId ?? "",
    clientLookupId:
      row.clientLookupId != null && String(row.clientLookupId).trim()
        ? String(row.clientLookupId).trim()
        : null,
  };
}

function blobToHydration(parsed: StoredBlob): OperationsDashboardHydration {
  const recentCases = Array.isArray(parsed.recentCases)
    ? parsed.recentCases.map((r) => normalizeRecentCase(r))
    : [];

  const hasLoadedRecentOnce =
    typeof parsed.hasLoadedRecentOnce === "boolean"
      ? parsed.hasLoadedRecentOnce
      : recentCases.length > 0;

  return {
    summaryCounts: { ...parsed.summaryCounts },
    caseStageCounts: { ...parsed.caseStageCounts },
    operationsMetricsMode:
      typeof parsed.operationsMetricsMode === "string"
        ? parsed.operationsMetricsMode
        : null,
    hasLoadedSummaryOnce: true,
    lastSummaryFetchedAt: null,
    hasLoadedRecentOnce,
    lastRecentFetchedAt: null,
    recentCases,
  };
}

export type OperationsDashboardHydration = {
  summaryCounts: StoredBlob["summaryCounts"];
  caseStageCounts: Record<string, number>;
  operationsMetricsMode: string | null;
  hasLoadedSummaryOnce: boolean;
  lastSummaryFetchedAt: null;
  hasLoadedRecentOnce: boolean;
  lastRecentFetchedAt: null;
  recentCases: OperationsDashboardRecentCase[];
};

export function readOperationsDashboardSession(): OperationsDashboardHydration | null {
  if (typeof window === "undefined") return null;
  const userId = getTokenUserId();
  if (!userId || !memoryBlob) return null;
  if (memoryBlob.userId !== userId) return null;
  if (
    typeof memoryBlob.savedAt !== "number" ||
    Date.now() - memoryBlob.savedAt > MAX_CACHE_AGE_MS
  ) {
    memoryBlob = null;
    void idbClearNamespace(IDB_NAMESPACE);
    return null;
  }
  if (!memoryBlob.summaryCounts || !memoryBlob.caseStageCounts) return null;
  return blobToHydration(memoryBlob);
}

export async function hydrateOperationsDashboardCacheFromIdb(): Promise<void> {
  const userId = getTokenUserId();
  if (!userId) return;
  const hit = await idbGet<StoredBlob>(IDB_NAMESPACE, userId);
  if (!hit?.payload || (hit.payload as StoredBlob).v !== 1) return;
  const parsed = hit.payload as StoredBlob;
  if (parsed.userId !== userId) return;
  if (Date.now() - parsed.savedAt > MAX_CACHE_AGE_MS) {
    void idbClearNamespace(IDB_NAMESPACE);
    return;
  }
  memoryBlob = parsed;
}

export function persistOperationsDashboardSession(payload: {
  userId: string;
  summaryCounts: StoredBlob["summaryCounts"];
  caseStageCounts: Record<string, number>;
  operationsMetricsMode: string | null;
  hasLoadedRecentOnce: boolean;
  recentCases: OperationsDashboardRecentCase[];
}): void {
  if (typeof window === "undefined") return;
  try {
    const blob: StoredBlob = {
      v: 1,
      userId: payload.userId,
      savedAt: Date.now(),
      summaryCounts: { ...payload.summaryCounts },
      caseStageCounts: { ...payload.caseStageCounts },
      operationsMetricsMode: payload.operationsMetricsMode,
      hasLoadedRecentOnce: payload.hasLoadedRecentOnce,
      recentCases: payload.recentCases.map((r) => normalizeRecentCase(r)),
    };
    memoryBlob = blob;
    void idbSet(IDB_NAMESPACE, payload.userId, blob);
  } catch {
    /* ignore */
  }
}

export function clearOperationsDashboardSession(): void {
  memoryBlob = null;
  void idbClearNamespace(IDB_NAMESPACE);
}

export { getTokenUserId };
