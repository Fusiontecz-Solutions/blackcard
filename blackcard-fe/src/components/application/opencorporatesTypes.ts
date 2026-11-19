import {
  appendCrmBridgeHash,
  buildCrmBackgroundCheckReturnUrl,
  bridgeImportApplicationIdMatches,
} from "./crmBridgeTypes";

export const OPENCORPORATES_IMPORT_MESSAGE_TYPE = "crm:opencorporates-import";

export type OpenCorporatesOfficer = {
  name: string;
  position?: string;
  status?: "active" | "inactive";
};

export type OpenCorporatesAddress = {
  label: string;
  address: string;
};

export type OpenCorporatesIdentifier = {
  system: string;
  value: string;
  category?: string;
};

export type OpenCorporatesCompanyHit = {
  name: string;
  companyNumber: string;
  jurisdictionCode: string;
  currentStatus?: string;
  incorporationDate?: string;
  registeredAddress?: string;
  headOfficeAddress?: string;
  mailingAddress?: string;
  agentName?: string;
  agentAddress?: string;
  addresses?: OpenCorporatesAddress[];
  companyType?: string;
  opencorporatesUrl: string;
  registryUrl?: string;
  officers?: OpenCorporatesOfficer[];
  directors?: OpenCorporatesOfficer[];
  inactiveOfficers?: OpenCorporatesOfficer[];
  identifiers?: OpenCorporatesIdentifier[];
  dataSource?: string;
  lastUpdateFromSource?: string;
  lastChangeRecorded?: string;
  nextUpdateFromSource?: string;
};

export type OpenCorporatesImportMessage = {
  type: typeof OPENCORPORATES_IMPORT_MESSAGE_TYPE;
  applicationId: string;
  sourceUrl: string;
  searchedAt: string;
  companies: OpenCorporatesCompanyHit[];
};

export type OpenCorporatesLookupData = {
  searchQuery: string;
  jurisdictionCode?: string;
  companies: OpenCorporatesCompanyHit[];
  sourceUrl?: string;
};

export type PersistedOpenCorporatesCache = {
  queryKey: string;
  searchedAt: string;
  resultsExpanded?: boolean;
  result: OpenCorporatesLookupData;
};

export function buildOpenCorporatesQueryKey(
  businessName: string,
  state: string,
): string {
  return `${businessName.trim().toLowerCase()}|${state.trim().toLowerCase()}`;
}

export function opencorporatesStorageKey(applicationId: string): string {
  return `opencorporates:${applicationId}`;
}

export function loadOpenCorporatesCache(
  applicationId: string,
  queryKey: string,
): PersistedOpenCorporatesCache | null {
  try {
    const raw = localStorage.getItem(opencorporatesStorageKey(applicationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedOpenCorporatesCache;
    if (parsed.queryKey !== queryKey || !parsed.result || !parsed.searchedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveOpenCorporatesCache(
  applicationId: string,
  cache: PersistedOpenCorporatesCache,
): void {
  localStorage.setItem(opencorporatesStorageKey(applicationId), JSON.stringify(cache));
}

export function stateToJurisdictionCode(state: string): string | undefined {
  const trimmed = state.trim();
  if (!trimmed) return undefined;
  if (/^us_[a-z]{2}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^[a-z]{2}$/i.test(trimmed)) return `us_${trimmed.toLowerCase()}`;
  return undefined;
}

export function buildOpenCorporatesSearchUrl(params: {
  businessName: string;
  state?: string;
  applicationId: string;
  origin: string;
}): string {
  const url = new URL("https://opencorporates.com/companies");
  if (params.businessName.trim()) {
    url.searchParams.set("q", params.businessName.trim());
  }
  const jurisdiction = stateToJurisdictionCode(params.state ?? "");
  if (jurisdiction) {
    url.searchParams.set("jurisdiction_code", jurisdiction);
  }
  return appendCrmBridgeHash(url.toString(), {
    applicationId: params.applicationId,
    origin: params.origin,
    returnUrl: buildCrmBackgroundCheckReturnUrl(params.applicationId, "opencorporates"),
    sectionId: "opencorporates",
    searchMode: "business",
    businessName: params.businessName,
  });
}

export function formatOpenCorporatesSearchedAt(iso: string): string {
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

export function formatOpenCorporatesNotes(
  company: OpenCorporatesCompanyHit,
  searchedAt?: string,
): string {
  const lines = [
    `OpenCorporates — ${company.name}${searchedAt ? ` (searched ${formatOpenCorporatesSearchedAt(searchedAt)})` : ""}`,
    [
      company.currentStatus ? `Status: ${company.currentStatus}` : null,
      company.jurisdictionCode ? `Jurisdiction: ${company.jurisdictionCode}` : null,
      company.companyNumber ? `No: ${company.companyNumber}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
    company.incorporationDate ? `Incorporated: ${company.incorporationDate}` : null,
    company.companyType ? `Type: ${company.companyType}` : null,
    company.agentName ? `Agent: ${company.agentName}` : null,
    company.agentAddress ? `Agent address: ${company.agentAddress}` : null,
    company.headOfficeAddress ? `Head office: ${company.headOfficeAddress}` : null,
    company.mailingAddress ? `Mailing: ${company.mailingAddress}` : null,
    company.registeredAddress &&
    company.registeredAddress !== company.headOfficeAddress &&
    company.registeredAddress !== company.mailingAddress
      ? `Registered address: ${company.registeredAddress}`
      : null,
    company.registryUrl ? `Registry: ${company.registryUrl}` : null,
    `Profile: ${company.opencorporatesUrl}`,
  ];

  if (company.identifiers && company.identifiers.length > 0) {
    lines.push(
      "Identifiers:",
      ...company.identifiers.map((identifier) =>
        identifier.category
          ? `  • ${identifier.system}: ${identifier.value} (${identifier.category})`
          : `  • ${identifier.system}: ${identifier.value}`,
      ),
    );
  }

  if (company.officers && company.officers.length > 0) {
    lines.push(
      "Officers:",
      ...company.officers.map((o) =>
        o.position ? `  • ${o.name} (${o.position})` : `  • ${o.name}`,
      ),
    );
  }

  if (company.directors && company.directors.length > 0) {
    lines.push(
      "Directors:",
      ...company.directors.map((o) =>
        o.position ? `  • ${o.name} (${o.position})` : `  • ${o.name}`,
      ),
    );
  }

  if (company.inactiveOfficers && company.inactiveOfficers.length > 0) {
    lines.push(
      "Inactive officers:",
      ...company.inactiveOfficers.map((o) =>
        o.position ? `  • ${o.name} (${o.position})` : `  • ${o.name}`,
      ),
    );
  }

  const sourceMeta = [
    company.dataSource ? `Source: ${company.dataSource}` : null,
    company.lastUpdateFromSource ? `Last update: ${company.lastUpdateFromSource}` : null,
    company.lastChangeRecorded ? `Last change: ${company.lastChangeRecorded}` : null,
    company.nextUpdateFromSource ? `Next update: ${company.nextUpdateFromSource}` : null,
  ].filter(Boolean);
  if (sourceMeta.length > 0) {
    lines.push(...sourceMeta);
  }

  return lines.filter(Boolean).join("\n");
}

export function formatOpenCorporatesNotesFromLookup(
  lookup: OpenCorporatesLookupData,
  searchedAt?: string,
): string {
  if (!lookup.companies.length) {
    return `OpenCorporates — no companies found for "${lookup.searchQuery}"`;
  }
  return lookup.companies
    .map((company) => formatOpenCorporatesNotes(company, searchedAt))
    .join("\n\n");
}

export function isOpenCorporatesImportMessage(
  data: unknown,
  expectedApplicationId?: string,
  applicationData?: Record<string, unknown> | null,
): data is OpenCorporatesImportMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as OpenCorporatesImportMessage;
  if (msg.type !== OPENCORPORATES_IMPORT_MESSAGE_TYPE) return false;
  if (!msg.applicationId || !Array.isArray(msg.companies)) return false;
  if (
    expectedApplicationId &&
    !bridgeImportApplicationIdMatches(expectedApplicationId, msg.applicationId, applicationData)
  ) {
    return false;
  }
  return msg.companies.every(
    (company) =>
      Boolean(company?.name) &&
      Boolean(company?.companyNumber) &&
      Boolean(company?.jurisdictionCode) &&
      Boolean(company?.opencorporatesUrl),
  );
}

export function isAllowedOpenCorporatesMessageOrigin(origin: string): boolean {
  if (origin === window.location.origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "opencorporates.com" || host.endsWith(".opencorporates.com");
  } catch {
    return false;
  }
}

export function parseOpenCorporatesImportJson(raw: string): OpenCorporatesCompanyHit[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(
      "Nothing to import. On OpenCorporates click Send to CRM, then use Paste JSON in Black Card.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(
      detail.includes("end of JSON")
        ? "Incomplete JSON. On OpenCorporates click Send to CRM again, then use Paste JSON in Black Card."
        : `Could not parse JSON: ${detail}`,
    );
  }
  if (Array.isArray(parsed)) {
    return parsed as OpenCorporatesCompanyHit[];
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.companies)) {
      return obj.companies as OpenCorporatesCompanyHit[];
    }
    if (obj.name && obj.companyNumber && obj.jurisdictionCode && obj.opencorporatesUrl) {
      return [obj as unknown as OpenCorporatesCompanyHit];
    }
  }
  throw new Error("Invalid OpenCorporates JSON. Expected { companies: [...] } or an array.");
}
