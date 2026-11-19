import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { ChevronDown, ExternalLink, Loader2, Search } from "lucide-react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RootState } from "@/redux/store";
import {
  handleCrmBridgeReturn,
  isCrmBridgeReturnMessage,
  resolveCrmBridgeOrigin,
  bridgeImportApplicationIdMatches,
  resolveBridgeApplicationId,
  splitOwnerName,
  type CrmBridgeSearchMode,
} from "./crmBridgeTypes";
import { useCrmBridgeInbox } from "./useCrmBridgeInbox";
import {
  buildNyscefQueryKey,
  buildNyscefSearchUrl,
  formatNyscefSearchedAt,
  isAllowedNyscefMessageOrigin,
  isNyscefImportMessage,
  loadNyscefCache,
  loadLatestNyscefCache,
  NYSCEF_IMPORT_MESSAGE_TYPE,
  saveNyscefCache,
  type NyscefCaseHit,
  type NyscefLookupData,
} from "./nyscefTypes";
import { buildNyscefNotesHtml } from "./backgroundCheckNotesHtml";

type NyCourtPanelProps = {
  embedded?: boolean;
  onApplyToNotes?: (notes: string) => void;
};

type DealClientDetails = {
  businessName: string;
  ownerName: string;
  dealId: string;
};

function extractDealClientDetails(
  applicationData: Record<string, unknown> | null,
): DealClientDetails {
  const client = applicationData?.client as Record<string, unknown> | undefined;
  const business = client?.business as Record<string, unknown> | undefined;
  const owner = client?.owner as Record<string, unknown> | undefined;

  return {
    businessName: String(
      business?.name ?? client?.businessName ?? applicationData?.businessName ?? "",
    ).trim(),
    ownerName: `${owner?.firstName ?? ""} ${owner?.lastName ?? ""}`.trim(),
    dealId: String(
      applicationData?.applicationId ??
        applicationData?.dealId ??
        applicationData?.id ??
        applicationData?._id ??
        "",
    ).trim(),
  };
}

function NyCourtClientSummary({
  client,
  searchMode,
  className,
}: {
  client: DealClientDetails;
  searchMode: CrmBridgeSearchMode;
  className?: string;
}) {
  if (searchMode === "owner") {
    if (!client.ownerName) {
      return (
        <p className={cn("text-[11px] text-[#6B7280]", className)}>
          Add an owner name on this deal to search NY Court.
        </p>
      );
    }
    const ownerParts = splitOwnerName(client.ownerName);
    const detailParts = [
      client.dealId ? `Deal ${client.dealId}` : null,
      client.businessName ? `Business ${client.businessName}` : null,
    ].filter(Boolean);

    return (
      <p className={cn("min-w-0 text-[11px] leading-snug text-[#6B7280]", className)}>
        <span className="font-semibold text-[#111827]">{client.ownerName}</span>
        {detailParts.length > 0 ? (
          <>
            {" "}
            <span className="text-[#D1D5DB]" aria-hidden>
              ·
            </span>{" "}
            {detailParts.join(" · ")}
          </>
        ) : null}
        {ownerParts.middleName ? (
          <span className="block mt-0.5">Middle name: {ownerParts.middleName}</span>
        ) : null}
      </p>
    );
  }

  if (!client.businessName) {
    return (
      <p className={cn("text-[11px] text-[#6B7280]", className)}>
        Add a business name on this deal to search NY Court.
      </p>
    );
  }

  const detailParts = [
    client.ownerName ? `Owner ${client.ownerName}` : null,
    client.dealId ? `Deal ${client.dealId}` : null,
  ].filter(Boolean);

  return (
    <p className={cn("min-w-0 text-[11px] leading-snug text-[#6B7280]", className)}>
      <span className="font-semibold text-[#111827]">{client.businessName}</span>
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

/** Stable key so postMessage + inbox polling do not re-toast the same failed import. */
function buildNyscefImportDedupeKey(data: unknown): string {
  if (!data || typeof data !== "object") return "unknown";
  const msg = data as Record<string, unknown>;
  if (msg.type !== NYSCEF_IMPORT_MESSAGE_TYPE) return "not-nyscef";
  const appId = String(msg.applicationId ?? "");
  const searchedAt = String(msg.searchedAt ?? "");
  const caseCount = Array.isArray(msg.cases) ? msg.cases.length : -1;
  return `${appId}|${searchedAt}|${caseCount}`;
}

function NyscefCaseCard({ item }: { item: NyscefCaseHit }) {
  return (
    <div className="rounded-md border border-[#E5E7EB] bg-white px-3 py-3 space-y-1.5">
      <p className="text-sm font-semibold text-[#111827]">{item.caseName || "Unnamed case"}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#6B7280]">
        {item.indexNumber ? <span>Index {item.indexNumber}</span> : null}
        {item.caseType ? <span>{item.caseType}</span> : null}
        {item.court ? <span>{item.court}</span> : null}
        {item.filingDate ? <span>Filed {item.filingDate}</span> : null}
        {item.status ? <span>{item.status}</span> : null}
      </div>
      {item.detailUrl ? (
        <a
          href={item.detailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-[var(--brand)] hover:underline"
        >
          View case
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

export default function NyCourtPanel({
  embedded = false,
  onApplyToNotes,
}: NyCourtPanelProps) {
  const { applicationId: routeApplicationId } = useParams<{ applicationId: string }>();
  const applicationData = useSelector(
    (state: RootState) => state.applicationDetail.data as Record<string, unknown> | null,
  );

  const applicationId = useMemo(
    () => resolveBridgeApplicationId(routeApplicationId, applicationData),
    [routeApplicationId, applicationData],
  );

  const dealClient = useMemo(
    () => extractDealClientDetails(applicationData),
    [applicationData],
  );

  const [searchMode, setSearchMode] = useState<CrmBridgeSearchMode>("business");
  const [result, setResult] = useState<NyscefLookupData | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedAt, setSearchedAt] = useState<string | null>(null);
  const [resultsExpanded, setResultsExpanded] = useState(true);
  const [waitingForImport, setWaitingForImport] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const importTimeoutRef = useRef<number | null>(null);
  const pendingImportRef = useRef<Parameters<typeof isNyscefImportMessage>[0] | null>(null);
  const rejectedImportKeysRef = useRef<Set<string>>(new Set());

  const activeSearchQuery = useMemo(() => {
    if (searchMode === "owner") return dealClient.ownerName;
    return dealClient.businessName;
  }, [dealClient.businessName, dealClient.ownerName, searchMode]);

  const queryKey = useMemo(
    () => buildNyscefQueryKey(activeSearchQuery, searchMode),
    [activeSearchQuery, searchMode],
  );

  const canSearch =
    Boolean(applicationId) &&
    (searchMode === "owner" ? Boolean(dealClient.ownerName) : Boolean(dealClient.businessName));

  const persistResult = useCallback(
    (lookup: NyscefLookupData, searchedAtIso: string, expanded = resultsExpanded) => {
      if (!applicationId) return;
      const storageKey = buildNyscefQueryKey(lookup.searchQuery, lookup.searchMode);
      saveNyscefCache(applicationId, {
        queryKey: storageKey,
        searchedAt: searchedAtIso,
        resultsExpanded: expanded,
        result: lookup,
      });
    },
    [applicationId, resultsExpanded],
  );

  const applyLookup = useCallback(
    (
      lookup: NyscefLookupData,
      meta: { searchedAt: string; sourceUrl?: string },
      options?: { announce?: boolean },
    ) => {
      setSearchMode(lookup.searchMode);
      setResult(lookup);
      setHasSearched(true);
      setSearchedAt(meta.searchedAt);
      setResultsExpanded(true);
      persistResult(lookup, meta.searchedAt, true);
      if (options?.announce) {
        const toastId = applicationId ? `nyscef-import-success-${applicationId}` : undefined;
        toast.success(
          lookup.cases.length > 0
            ? `Imported ${lookup.cases.length} NY court case${lookup.cases.length === 1 ? "" : "s"}.`
            : "NY court search imported with no cases found.",
          toastId ? { toastId } : undefined,
        );
      }
    },
    [applicationId, persistResult],
  );

  useEffect(() => {
    rejectedImportKeysRef.current.clear();
  }, [applicationId]);

  useEffect(() => {
    if (!applicationId) {
      setResult(null);
      setHasSearched(false);
      setSearchedAt(null);
      setResultsExpanded(true);
      return;
    }

    if (!activeSearchQuery) return;

    const cached =
      loadNyscefCache(applicationId, queryKey) ?? loadLatestNyscefCache(applicationId);
    if (cached) {
      setResult(cached.result);
      setHasSearched(true);
      setSearchedAt(cached.searchedAt);
      setResultsExpanded(cached.resultsExpanded ?? true);
      setSearchMode(cached.result.searchMode);
      return;
    }

    if (waitingForImport) return;

    setResult(null);
    setHasSearched(false);
    setSearchedAt(null);
    setResultsExpanded(true);
  }, [applicationId, activeSearchQuery, queryKey, waitingForImport]);

  const finishBridgeImport = useCallback(() => {
    setWaitingForImport(false);
    if (importTimeoutRef.current) {
      window.clearTimeout(importTimeoutRef.current);
      importTimeoutRef.current = null;
    }
    popupRef.current = null;
  }, []);

  const processNyscefImport = useCallback(
    (data: Parameters<typeof isNyscefImportMessage>[0]) => {
      if (!applicationId) return;

      if (!isNyscefImportMessage(data, applicationId, applicationData)) {
        if (!applicationData) {
          pendingImportRef.current = data;
          return;
        }
        const dedupeKey = buildNyscefImportDedupeKey(data);
        if (rejectedImportKeysRef.current.has(dedupeKey)) {
          return;
        }
        rejectedImportKeysRef.current.add(dedupeKey);
        toast.warn("Could not import NY Court results for this application.", {
          toastId: `nyscef-import-failed-${applicationId}`,
        });
        return;
      }

      pendingImportRef.current = null;
      rejectedImportKeysRef.current.clear();

      const lookup: NyscefLookupData = {
        searchQuery: data.searchQuery || activeSearchQuery,
        searchMode: data.searchMode || searchMode,
        cases: data.cases,
        sourceUrl: data.sourceUrl,
      };

      applyLookup(
        lookup,
        {
          searchedAt: data.searchedAt || new Date().toISOString(),
          sourceUrl: data.sourceUrl,
        },
        { announce: true },
      );

      finishBridgeImport();
      handleCrmBridgeReturn({
        type: "crm:bridge-return",
        applicationId,
        source: "nyscef",
        sectionId: "nyscef",
      });
    },
    [
      applicationId,
      applicationData,
      activeSearchQuery,
      searchMode,
      applyLookup,
      finishBridgeImport,
    ],
  );

  useEffect(() => {
    if (!applicationId || !applicationData || !pendingImportRef.current) return;
    processNyscefImport(pendingImportRef.current);
  }, [applicationId, applicationData, processNyscefImport]);

  const handleBridgeMessage = useCallback(
    (event: MessageEvent) => {
      if (!applicationId) return;
      if (
        isCrmBridgeReturnMessage(event.data) &&
        bridgeImportApplicationIdMatches(applicationId, event.data.applicationId, applicationData)
      ) {
        handleCrmBridgeReturn(event.data);
        finishBridgeImport();
        return;
      }
      if (!isAllowedNyscefMessageOrigin(event.origin)) return;
      processNyscefImport(event.data);
    },
    [applicationId, applicationData, finishBridgeImport, processNyscefImport],
  );

  useCrmBridgeInbox(
    applicationId,
    "nyscef",
    useCallback(
      (inbox) => {
        processNyscefImport(inbox.importPayload);
      },
      [processNyscefImport],
    ),
  );

  useEffect(() => {
    window.addEventListener("message", handleBridgeMessage);
    return () => window.removeEventListener("message", handleBridgeMessage);
  }, [handleBridgeMessage]);

  useEffect(() => {
    return () => {
      if (importTimeoutRef.current) {
        window.clearTimeout(importTimeoutRef.current);
      }
    };
  }, []);

  const openSearch = () => {
    if (!applicationId) {
      toast.error("Open an application before searching NY Court.");
      return;
    }
    if (searchMode === "business" && !dealClient.businessName) {
      toast.error("Add a business name on this deal to search NY Court.");
      return;
    }
    if (searchMode === "owner" && !dealClient.ownerName) {
      toast.error("Add an owner name on this deal to search NY Court.");
      return;
    }

    const url = buildNyscefSearchUrl({
      applicationId,
      origin: resolveCrmBridgeOrigin(),
      businessName: dealClient.businessName,
      ownerName: dealClient.ownerName,
      searchMode,
    });

    popupRef.current = window.open(url, `crm_nyscef_${applicationId}`);
    if (!popupRef.current) {
      toast.error(
        "Browser blocked the new tab. Allow popups for this site, then click Search NY Court again.",
      );
      setWaitingForImport(false);
      return;
    }

    setHasSearched(true);
    setWaitingForImport(true);
    if (importTimeoutRef.current) {
      window.clearTimeout(importTimeoutRef.current);
    }
    importTimeoutRef.current = window.setTimeout(() => {
      setWaitingForImport(false);
    }, 45_000);
  };

  const handleApplyToNotes = () => {
    if (!result) return;
    onApplyToNotes?.(buildNyscefNotesHtml(result, searchedAt ?? undefined));
    toast.success("NY Court summary applied to notes.");
  };

  const toggleResultsExpanded = () => {
    setResultsExpanded((current) => {
      const next = !current;
      if (applicationId && result && searchedAt) {
        persistResult(result, searchedAt, next);
      }
      return next;
    });
  };

  const caseCount = result?.cases.length ?? 0;
  const canApplyToNotes = Boolean(onApplyToNotes && result && caseCount > 0);

  const searchModeToggle =
    dealClient.businessName && dealClient.ownerName ? (
      <div className="inline-flex rounded-md border border-[#E5E7EB] p-0.5 text-[11px]">
        <button
          type="button"
          className={cn(
            "rounded px-2 py-0.5 transition-colors",
            searchMode === "business"
              ? "bg-[#111827] text-white"
              : "text-[#6B7280] hover:text-[#111827]",
          )}
          onClick={() => setSearchMode("business")}
        >
          Business
        </button>
        <button
          type="button"
          className={cn(
            "rounded px-2 py-0.5 transition-colors",
            searchMode === "owner"
              ? "bg-[#111827] text-white"
              : "text-[#6B7280] hover:text-[#111827]",
          )}
          onClick={() => setSearchMode("owner")}
        >
          Owner
        </button>
      </div>
    ) : null;

  const applyToNotesButton = canApplyToNotes ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 text-xs"
      onClick={handleApplyToNotes}
    >
      Apply to notes
    </Button>
  ) : null;

  const searchButton = (
    <Button
      type="button"
      variant="default"
      size="sm"
      className="h-8 text-xs"
      disabled={!canSearch}
      onClick={openSearch}
    >
      <Search className="mr-1.5 h-3 w-3" aria-hidden />
      {hasSearched ? "Search again" : "Search NY Court"}
    </Button>
  );

  return (
    <div className={embedded ? "space-y-3" : "rounded-md border border-[#E5E7EB] bg-white p-4 space-y-3 shadow-[0px_4px_20px_0px_#00000005]"}>
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <NyCourtClientSummary client={dealClient} searchMode={searchMode} />
            {searchModeToggle}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {searchedAt ? (
              <p className="text-[11px] text-[#6B7280]">
                Last searched {formatNyscefSearchedAt(searchedAt)}
              </p>
            ) : null}
            {applyToNotesButton}
            {searchButton}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#111827]">NY Court (NYSCEF)</h3>
              <p className="mt-0.5 text-xs text-[#6B7280]">Civil court case search</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {searchedAt ? (
                <p className="text-[11px] text-[#6B7280]">
                  Last searched {formatNyscefSearchedAt(searchedAt)}
                </p>
              ) : null}
              {applyToNotesButton}
              {searchButton}
            </div>
          </div>
          <div className="space-y-1.5">
            <NyCourtClientSummary client={dealClient} searchMode={searchMode} />
            {searchModeToggle}
          </div>
        </>
      )}

      {waitingForImport ? (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <div>
            <p className="font-medium">Waiting for import from NY Court tab…</p>
            <p className="mt-1 text-blue-800/90">
              The court site should prefill the {searchMode === "owner" ? "owner name" : "business name"}.
              Click <strong>Search</strong> on NYSCEF, review results, then click{" "}
              <strong>Send to CRM</strong>.
            </p>
          </div>
        </div>
      ) : null}

      {!hasSearched && !waitingForImport ? (
        <p className="rounded-md border border-dashed border-[#D1D5DB] bg-[#F9FAFB] px-3 py-3 text-xs text-[#6B7280]">
          Click <strong>Search NY Court</strong> to open NYSCEF with the{" "}
          {searchMode === "owner" ? "owner name" : "business name"} prefilled, then use{" "}
          <strong>Send to CRM</strong> on the results page.
        </p>
      ) : null}

      {result && hasSearched ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={toggleResultsExpanded}
            className={cn(
              "flex w-full items-start gap-2 rounded-md border px-3 py-2.5 text-left text-xs transition-colors",
              caseCount > 0
                ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100/80"
                : "border-green-200 bg-green-50 text-green-800 hover:bg-green-100/80",
            )}
            aria-expanded={resultsExpanded}
          >
            <div className="min-w-0 flex-1">
              {caseCount > 0 ? (
                <>
                  <p className="font-semibold">
                    {caseCount} case{caseCount !== 1 ? "s" : ""} found
                    {result.searchMode === "owner" ? " (owner search)" : " (business search)"}
                  </p>
                  {resultsExpanded ? (
                    <p className="mt-0.5">Matched &quot;{result.searchQuery}&quot;</p>
                  ) : (
                    <p className="mt-0.5 opacity-80">Click to expand results</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold">No NY court cases found</p>
                  {resultsExpanded ? (
                    <p className="mt-0.5">
                      Searched for &quot;{result.searchQuery}&quot;
                      {result.searchMode === "owner" ? " (owner search)" : " (business search)"}
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

          {resultsExpanded && caseCount > 0 ? (
            <div className="space-y-2">
              {result.cases.map((item, index) => (
                <NyscefCaseCard key={`${item.indexNumber || item.caseName}-${index}`} item={item} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
