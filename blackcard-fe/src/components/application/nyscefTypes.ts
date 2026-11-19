import {
  appendCrmBridgeHash,
  buildCrmBackgroundCheckReturnUrl,
  splitOwnerName,
  bridgeImportApplicationIdMatches,
  type CrmBridgeSearchMode,
} from "./crmBridgeTypes";

export const NYSCEF_IMPORT_MESSAGE_TYPE = "crm:nyscef-import";
export const NYSCEF_SEARCH_BASE_URL = "https://iapps.courts.state.ny.us/nyscef/CaseSearch?TAB=name";

export type NyscefCaseHit = {
  indexNumber?: string;
  caseName?: string;
  caseType?: string;
  court?: string;
  filingDate?: string;
  status?: string;
  detailUrl?: string;
  searchMode?: CrmBridgeSearchMode;
};

export type NyscefImportMessage = {
  type: typeof NYSCEF_IMPORT_MESSAGE_TYPE;
  applicationId: string;
  sourceUrl: string;
  searchedAt: string;
  searchQuery: string;
  searchMode: CrmBridgeSearchMode;
  cases: NyscefCaseHit[];
};

export type NyscefLookupData = {
  searchQuery: string;
  searchMode: CrmBridgeSearchMode;
  cases: NyscefCaseHit[];
  sourceUrl?: string;
};

export type PersistedNyscefCache = {
  queryKey: string;
  searchedAt: string;
  resultsExpanded?: boolean;
  result: NyscefLookupData;
};

export function buildNyscefQueryKey(
  searchQuery: string,
  searchMode: CrmBridgeSearchMode,
): string {
  return `${searchMode}|${searchQuery.trim().toLowerCase()}`;
}

export function nyscefStorageKey(applicationId: string): string {
  return `nyscef:${applicationId}`;
}

export function loadNyscefCache(
  applicationId: string,
  queryKey: string,
): PersistedNyscefCache | null {
  try {
    const raw = localStorage.getItem(nyscefStorageKey(applicationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedNyscefCache;
    if (parsed.queryKey !== queryKey || !parsed.result || !parsed.searchedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Load the saved NY Court result for an application regardless of active query key. */
export function loadLatestNyscefCache(applicationId: string): PersistedNyscefCache | null {
  try {
    const raw = localStorage.getItem(nyscefStorageKey(applicationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedNyscefCache;
    if (!parsed.result || !parsed.searchedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveNyscefCache(applicationId: string, cache: PersistedNyscefCache): void {
  localStorage.setItem(nyscefStorageKey(applicationId), JSON.stringify(cache));
}

export function buildNyscefSearchUrl(params: {
  applicationId: string;
  origin: string;
  businessName?: string;
  ownerName?: string;
  searchMode: CrmBridgeSearchMode;
}): string {
  const ownerParts =
    params.searchMode === "owner" ? splitOwnerName(params.ownerName ?? "") : null;

  return appendCrmBridgeHash(NYSCEF_SEARCH_BASE_URL, {
    applicationId: params.applicationId,
    origin: params.origin,
    returnUrl: buildCrmBackgroundCheckReturnUrl(params.applicationId, "nyscef"),
    sectionId: "nyscef",
    searchMode: params.searchMode,
    businessName: params.searchMode === "business" ? params.businessName : undefined,
    ownerFirstName: ownerParts?.firstName,
    ownerMiddleName: ownerParts?.middleName,
    ownerLastName: ownerParts?.lastName,
  });
}

export function formatNyscefSearchedAt(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatNyscefNotes(
  lookup: NyscefLookupData,
  searchedAt?: string,
): string {
  const modeLabel = lookup.searchMode === "owner" ? "Owner search" : "Business search";
  const header = `NY Court (NYSCEF) — ${modeLabel}: ${lookup.searchQuery}${
    searchedAt ? ` (searched ${formatNyscefSearchedAt(searchedAt)})` : ""
  }`;

  if (!lookup.cases.length) {
    return `${header}\nNo cases found.`;
  }

  const lines = lookup.cases.map((item, index) => {
    const parts = [
      `${index + 1}. ${item.caseName || "Unnamed case"}`,
      item.indexNumber ? `Index: ${item.indexNumber}` : null,
      item.caseType ? `Type: ${item.caseType}` : null,
      item.court ? `Court: ${item.court}` : null,
      item.filingDate ? `Filed: ${item.filingDate}` : null,
      item.status ? `Status: ${item.status}` : null,
      item.detailUrl ? `Link: ${item.detailUrl}` : null,
    ].filter(Boolean);
    return parts.join(" | ");
  });

  return [header, `Cases found: ${lookup.cases.length}`, ...lines].join("\n");
}

export function isNyscefImportMessage(
  data: unknown,
  expectedApplicationId?: string,
  applicationData?: Record<string, unknown> | null,
): data is NyscefImportMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as NyscefImportMessage;
  if (msg.type !== NYSCEF_IMPORT_MESSAGE_TYPE) return false;
  if (!msg.applicationId || !Array.isArray(msg.cases)) return false;
  if (
    expectedApplicationId &&
    !bridgeImportApplicationIdMatches(expectedApplicationId, msg.applicationId, applicationData)
  ) {
    return false;
  }
  return msg.cases.every(
    (item) => Boolean(item?.caseName || item?.indexNumber || item?.detailUrl),
  );
}

export function isAllowedNyscefMessageOrigin(origin: string): boolean {
  if (origin === window.location.origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "iapps.courts.state.ny.us";
  } catch {
    return false;
  }
}

export function parseNyscefImportJson(raw: string): NyscefCaseHit[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Nothing to import. On NYSCEF click Send to CRM, then use Paste JSON in CRM.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(`Could not parse JSON: ${detail}`);
  }

  if (Array.isArray(parsed)) {
    return parsed as NyscefCaseHit[];
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.cases)) {
      return obj.cases as NyscefCaseHit[];
    }
  }
  throw new Error("Invalid NYSCEF JSON. Expected { cases: [...] } or an array.");
}
