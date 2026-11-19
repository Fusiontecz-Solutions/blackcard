import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { useSelector } from "react-redux";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RootState } from "@/redux/store";
import {
  fetchDataMerchForApplication,
  type DataMerchLookupData,
  type DataMerchMerchant,
  type DataMerchRecord,
} from "@/redux/actions/datamerch-actions";

type DataMerchPanelProps = {
  manualSearch?: boolean;
  embedded?: boolean;
};

type PersistedDataMerchCache = {
  queryKey: string;
  searchedAt: string;
  resultsExpanded?: boolean;
  result: Omit<DataMerchLookupData, "raw">;
};

function buildDataMerchQueryKey(businessName: string, ein: string): string {
  const einDigits = ein.replace(/\D/g, "");
  return `${einDigits}|${businessName.trim().toLowerCase()}`;
}

function dataMerchStorageKey(applicationId: string): string {
  return `datamerch:${applicationId}`;
}

function loadDataMerchCache(
  applicationId: string,
  queryKey: string,
): PersistedDataMerchCache | null {
  try {
    const raw = localStorage.getItem(dataMerchStorageKey(applicationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDataMerchCache;
    if (parsed.queryKey !== queryKey || !parsed.result || !parsed.searchedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveDataMerchCache(applicationId: string, cache: PersistedDataMerchCache): void {
  localStorage.setItem(dataMerchStorageKey(applicationId), JSON.stringify(cache));
}

function stripRawFromResult(data: DataMerchLookupData): Omit<DataMerchLookupData, "raw"> {
  const { raw: _raw, ...rest } = data;
  return rest;
}

function formatSearchedAt(iso: string): string {
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

type DealClientDetails = {
  businessName: string;
  dba: string;
  ein: string;
  city: string;
  state: string;
  addressLine: string;
  phone: string;
  dealId: string;
};

function extractDealClientDetails(
  applicationData: Record<string, unknown> | null,
): DealClientDetails {
  const client = applicationData?.client as Record<string, unknown> | undefined;
  const business = client?.business as Record<string, unknown> | undefined;
  const address = business?.address as Record<string, unknown> | undefined;

  const streetParts = [
    address?.street,
    address?.street1,
    address?.line1,
    address?.addressLine1,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);

  const city = String(address?.city ?? client?.city ?? "").trim();
  const state = String(address?.state ?? client?.state ?? "").trim();
  const zip = String(address?.zip ?? address?.zipCode ?? "").trim();
  const location = [city, state].filter(Boolean).join(", ");
  const addressLine = [streetParts[0], location, zip].filter(Boolean).join(" · ");

  return {
    businessName: String(
      business?.name ?? client?.businessName ?? applicationData?.businessName ?? "",
    ).trim(),
    dba: String(business?.dba ?? client?.dba ?? "").trim(),
    ein: String(
      business?.einNumber ??
        business?.ein ??
        client?.businessEinNumber ??
        client?.federalTaxIdEin ??
        "",
    ).trim(),
    city,
    state,
    addressLine,
    phone: String(
      business?.phone ?? business?.businessPhone ?? client?.phone ?? client?.businessPhone ?? "",
    ).trim(),
    dealId: String(
      applicationData?.applicationId ??
        applicationData?.dealId ??
        applicationData?.id ??
        applicationData?._id ??
        "",
    ).trim(),
  };
}

function DataMerchClientSummary({
  client,
  className,
}: {
  client: DealClientDetails;
  className?: string;
}) {
  const location = [client.city, client.state].filter(Boolean).join(", ");
  const hasAnyDetail = Boolean(client.businessName || client.ein || client.dba || location);

  if (!hasAnyDetail) {
    return (
      <p className={cn("text-[11px] text-[#6B7280]", className)}>
        Add business name or EIN on this deal to run DataMerch.
      </p>
    );
  }

  const detailParts = [
    client.ein ? `EIN ${formatEinDisplay(client.ein)}` : null,
    client.dba ? `DBA ${client.dba}` : null,
    client.addressLine || location || null,
    client.phone ? client.phone : null,
    client.dealId ? `Deal ${client.dealId}` : null,
  ].filter(Boolean);

  return (
    <p className={cn("min-w-0 text-[11px] leading-snug text-[#6B7280]", className)}>
      <span className="font-semibold text-[#111827]">{client.businessName || "—"}</span>
      {detailParts.length > 0 ? (
        <>
          {" "}
          <span className="text-[#D1D5DB]" aria-hidden>
            ·
          </span>{" "}
          {detailParts.join(" · ")}
        </>
      ) : null}
    </p>
  );
}

function formatEinDisplay(ein: string | null | undefined): string {
  if (!ein) return "—";
  const digits = String(ein).replace(/\D/g, "");
  if (digits.length !== 9) return ein;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function formatDataMerchDate(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value === "0001-01-01") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function merchantDisplayName(merchant: DataMerchMerchant): string {
  return (
    String(
      merchant.legalName ??
        merchant.legal_name ??
        merchant.name ??
        merchant.business_name ??
        "",
    ).trim() || "Unknown merchant"
  );
}

function merchantEin(merchant: DataMerchMerchant, fallback?: string | null): string {
  return String(merchant.fein ?? merchant.ein ?? fallback ?? "").trim();
}

function merchantRecords(merchant: DataMerchMerchant): DataMerchRecord[] {
  if (Array.isArray(merchant.records)) return merchant.records;
  if (Array.isArray(merchant.notes)) return merchant.notes;
  return [];
}

function recordText(record: DataMerchRecord): string {
  return String(record.note ?? record.notes ?? "").trim() || "—";
}

function recordFunder(record: DataMerchRecord): string | null {
  const value = record.addedBy ?? record.funder ?? record.added_by;
  return value != null && String(value).trim() ? String(value).trim() : null;
}

function recordDate(record: DataMerchRecord): string | null {
  return formatDataMerchDate(record.createdAt ?? record.created_at);
}

function merchantAddress(merchant: DataMerchMerchant): string | null {
  const parts = [
    merchant.address,
    merchant.street1,
    merchant.street2,
    [merchant.city, merchant.state].filter(Boolean).join(", "),
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(" · ") : null;
}

function merchantKey(merchant: DataMerchMerchant, index: number): string {
  return merchantEin(merchant) || `${merchantDisplayName(merchant)}-${index}`;
}

function DataMerchMerchantCard({
  merchant,
  fallbackEin,
}: {
  merchant: DataMerchMerchant;
  fallbackEin?: string | null;
}) {
  const records = merchantRecords(merchant);
  const startDate = formatDataMerchDate(merchant.businessStartDate);
  const location = [merchant.city, merchant.state].filter(Boolean).join(", ");
  const address = merchantAddress(merchant);

  return (
    <div className="rounded-md border border-[#E5E7EB] bg-white px-3 py-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-[#111827]">
          {merchantDisplayName(merchant)}
        </p>
        <p className="mt-0.5 text-xs text-[#6B7280]">
          EIN {formatEinDisplay(merchantEin(merchant, fallbackEin))}
          {location ? ` · ${location}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#6B7280]">
          {merchant.dba ? <span>DBA: {merchant.dba}</span> : null}
          {address ? <span>Address: {address}</span> : null}
          {merchant.industry ? <span>Industry: {merchant.industry}</span> : null}
          {startDate ? <span>Started: {startDate}</span> : null}
          {merchant.businessPhone ? <span>Phone: {merchant.businessPhone}</span> : null}
        </div>
      </div>

      {records.length === 0 ? (
        <p className="text-xs text-[#6B7280]">No funder reports on file for this match.</p>
      ) : (
        <div className="space-y-2">
          {records.map((record, recordIndex) => {
            const category = String(record.category ?? "Record");
            const text = recordText(record);
            const date = recordDate(record);
            const funder = recordFunder(record);
            return (
              <div
                key={recordIndex}
                className="rounded border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase text-[#374151]">
                    {category}
                  </p>
                  {date ? (
                    <p className="text-[11px] text-[#6B7280]">Reported: {date}</p>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[#111827] whitespace-pre-wrap">{text}</p>
                {funder ? (
                  <p className="mt-1 text-[11px] text-[#6B7280]">Funder: {funder}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DataMerchPanel({
  manualSearch = false,
  embedded = false,
}: DataMerchPanelProps) {
  const applicationData = useSelector(
    (state: RootState) => state.applicationDetail.data as Record<string, unknown> | null,
  );

  const applicationId = useMemo(
    () =>
      String(
        applicationData?._id ??
          applicationData?.id ??
          applicationData?.applicationId ??
          "",
      ).trim(),
    [applicationData],
  );

  const dealClient = useMemo(
    () => extractDealClientDetails(applicationData),
    [applicationData],
  );

  const dealBusinessName = dealClient.businessName;
  const dealEin = dealClient.ein;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DataMerchLookupData | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedAt, setSearchedAt] = useState<string | null>(null);
  const [resultsExpanded, setResultsExpanded] = useState(true);

  const queryKey = useMemo(
    () => buildDataMerchQueryKey(dealBusinessName, dealEin),
    [dealBusinessName, dealEin],
  );

  useEffect(() => {
    if (!applicationId) {
      setResult(null);
      setHasSearched(false);
      setSearchedAt(null);
      setError("");
      return;
    }

    const cached = loadDataMerchCache(applicationId, queryKey);
    if (cached) {
      setResult({ ...cached.result, raw: null });
      setHasSearched(true);
      setSearchedAt(cached.searchedAt);
      setResultsExpanded(cached.resultsExpanded ?? true);
      setError("");
      return;
    }

    setResult(null);
    setHasSearched(false);
    setSearchedAt(null);
    setResultsExpanded(true);
    setError("");
  }, [applicationId, queryKey]);

  const canSearch = Boolean(applicationId) && Boolean(dealBusinessName || dealEin);

  const runSearch = async () => {
    if (!applicationId) return;
    if (!dealBusinessName && !dealEin) {
      setError("Add a business name or EIN on this deal to run DataMerch.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError("");
    setHasSearched(true);
    setResultsExpanded(true);
    const response = await fetchDataMerchForApplication(applicationId, {
      businessName: dealBusinessName,
      ein: dealEin,
    });
    setLoading(false);
    if (!response.success) {
      setError(response.message);
      setResult(null);
      return;
    }
    const searchedAtIso = new Date().toISOString();
    setResult(response.data);
    setSearchedAt(searchedAtIso);
    saveDataMerchCache(applicationId, {
      queryKey,
      searchedAt: searchedAtIso,
      resultsExpanded: true,
      result: stripRawFromResult(response.data),
    });
  };

  const toggleResultsExpanded = () => {
    setResultsExpanded((current) => {
      const next = !current;
      if (applicationId && result && hasSearched) {
        const cached = loadDataMerchCache(applicationId, queryKey);
        if (cached) {
          saveDataMerchCache(applicationId, { ...cached, resultsExpanded: next });
        }
      }
      return next;
    });
  };

  const totalRecords = useMemo(
    () =>
      (result?.merchants ?? []).reduce(
        (sum, merchant) => sum + merchantRecords(merchant).length,
        0,
      ),
    [result],
  );

  const searchButton = (
    <Button
      type="button"
      variant="default"
      size="sm"
      className="h-8 text-xs"
      disabled={loading || !canSearch}
      onClick={() => void runSearch()}
    >
      {loading ? (
        <>
          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden />
          Searching…
        </>
      ) : (
        <>
          <Search className="mr-1.5 h-3 w-3" aria-hidden />
          {hasSearched ? "Search again" : "Search DataMerch"}
        </>
      )}
    </Button>
  );

  return (
    <div className={embedded ? "space-y-3" : "rounded-md border border-[#E5E7EB] bg-white p-4 space-y-3 shadow-[0px_4px_20px_0px_#00000005]"}>
      {!embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#111827]">DataMerch</h3>
            <p className="mt-0.5 text-xs text-[#6B7280]">Industry default database (API)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {searchedAt ? (
              <p className="text-[11px] text-[#6B7280]">
                Last searched {formatSearchedAt(searchedAt)}
              </p>
            ) : null}
            {searchButton}
          </div>
        </div>
      ) : null}

      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <DataMerchClientSummary client={dealClient} className="flex-1" />
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {searchedAt ? (
              <p className="text-[11px] text-[#6B7280]">
                Last searched {formatSearchedAt(searchedAt)}
              </p>
            ) : null}
            {searchButton}
          </div>
        </div>
      ) : (
        <DataMerchClientSummary client={dealClient} />
      )}

      {manualSearch && !embedded && !hasSearched && !loading ? (
        <p className="rounded-md border border-dashed border-[#D1D5DB] bg-[#F9FAFB] px-3 py-3 text-xs text-[#6B7280]">
          Click &quot;Search DataMerch&quot; to scrub this merchant against the DataMerch
          database.
        </p>
      ) : null}

      {loading && !result ? (
        <div className="flex items-center gap-2 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-4 text-xs text-[#6B7280]">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--brand)]" aria-hidden />
          Searching DataMerch…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      {!loading && !error && result && hasSearched ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={toggleResultsExpanded}
            className={cn(
              "flex w-full items-start gap-2 rounded-md border px-3 py-2.5 text-left text-xs transition-colors",
              totalRecords > 0
                ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100/80"
                : "border-green-200 bg-green-50 text-green-800 hover:bg-green-100/80",
            )}
            aria-expanded={resultsExpanded}
          >
            <div className="min-w-0 flex-1">
              {totalRecords > 0 ? (
                <>
                  <p className="font-semibold">
                    {totalRecords} record{totalRecords !== 1 ? "s" : ""} found across{" "}
                    {result.merchants.length} merchant
                    {result.merchants.length !== 1 ? "s" : ""}
                  </p>
                  {resultsExpanded ? (
                    <p className="mt-0.5">
                      {result.searchType === "both"
                        ? `Matched using EIN and business name: ${formatEinDisplay(result.ein ?? "")} / ${result.businessName ?? result.searchQuery}`
                        : result.searchType === "ein"
                          ? `Matched using EIN: ${formatEinDisplay(result.searchQuery)}`
                          : `Matched using business name: ${result.searchQuery}`}
                    </p>
                  ) : (
                    <p className="mt-0.5 opacity-80">Click to expand results</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold">No record found</p>
                  {resultsExpanded ? (
                    <p className="mt-0.5">
                      {result.searchType === "both"
                        ? `Searched by EIN ${formatEinDisplay(result.ein ?? "")} and business name "${result.businessName ?? ""}"`
                        : result.searchType === "ein"
                          ? `Searched by EIN ${formatEinDisplay(result.searchQuery)}`
                          : `No exact match for business name "${result.businessName ?? result.searchQuery}"`}
                    </p>
                  ) : (
                    <p className="mt-0.5 opacity-80">Click to expand details</p>
                  )}
                </>
              )}
            </div>
            <ChevronDown
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0 transition-transform",
                resultsExpanded && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          {resultsExpanded && (result.merchants ?? []).length > 0 ? (
            <div className="space-y-2">
              {result.merchants.map((merchant, index) => (
                <DataMerchMerchantCard
                  key={merchantKey(merchant, index)}
                  merchant={merchant}
                  fallbackEin={result.ein}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
