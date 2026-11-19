import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  BACKGROUND_CHECK_RESOURCES,
  resolveBackgroundCheckHref,
} from "@/config/externalLinks";
import BackgroundCheckItemCard from "@/components/application/BackgroundCheckItemCard";
import BackgroundCheckSidebar from "@/components/application/BackgroundCheckSidebar";
import DataMerchPanel from "@/components/application/DataMerchPanel";
import OpenCorporatesPanel from "@/components/application/OpenCorporatesPanel";
import ClearPanel from "@/components/application/ClearPanel";
import {
  buildClearMatchSectionsForPdf,
  ownersMissingFullSsnForClear,
} from "@/components/application/clearComparison";
import { isClearLookupMetadata } from "@/components/application/clearTypes";
import NyCourtPanel from "@/components/application/NyCourtPanel";
import CompanyResearchPanel from "@/components/application/CompanyResearchPanel";
import {
  apiCheckToFormState,
  buildItemIdMap,
  formItemToApiPayload,
  resolveLatestSavedAt,
} from "@/components/application/backgroundCheckApiMapper";
import {
  backgroundCheckPdfFilename,
  defaultBackgroundCheckLogoUrl,
  getBackgroundCheckPdfErrorMessage,
  downloadBackgroundCheckPdf,
  fetchBackgroundCheckPdfBlob,
  formatBackgroundCheckEin,
} from "@/components/application/backgroundCheckPdf";
import PDFViewerDocsModal from "@/components/application/PDFViewerDocsModal";
import type {
  BackgroundCheckFormState,
  BackgroundCheckItemState,
  BackgroundCheckStoredAttachment,
} from "@/components/application/backgroundCheckTypes";
import { normalizeRoleKey, resolveEffectiveRole } from "@/lib/sessionRole";
import type { DataMerchLookupData } from "@/redux/actions/datamerch-actions";
import {
  addCheckAttachment,
  getBackgroundCheck,
  mapClearCorporationsToExhibit,
  removeCheckAttachment,
  runAutomatedCheckItem,
  updateCheckItem,
} from "@/redux/actions/backgroundCheckActions";
import type { BackgroundCheck } from "@/redux/slices/backgroundCheckSlice";
import {
  buildOpenCorporatesQueryKey,
  loadOpenCorporatesCache,
  type OpenCorporatesLookupData,
} from "@/components/application/opencorporatesTypes";
import { getOfferDecisionByApplication } from "@/redux/actions/offerDecisionActions";
import { getTermsOffers } from "@/redux/actions/termsOfferActions";
import { resolveApplicationOfferAmount } from "@/lib/applicationLoanAmount";
import { formatCurrency } from "@/lib/utils";

const CHECK_IDS = BACKGROUND_CHECK_RESOURCES.map((r) => r.id);

function emptyChecks(): BackgroundCheckFormState {
  return Object.fromEntries(
    CHECK_IDS.map((id) => [id, { notes: "", status: undefined, optional: false }]),
  );
}

function buildDataMerchQueryKey(businessName: string, ein: string): string {
  const einDigits = ein.replace(/\D/g, "");
  return `${einDigits}|${businessName.trim().toLowerCase()}`;
}

function loadDataMerchForExport(
  applicationId: string,
  queryKey: string,
): { result: Omit<DataMerchLookupData, "raw">; searchedAt: string } | null {
  try {
    const raw = localStorage.getItem(`datamerch:${applicationId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      queryKey?: string;
      searchedAt?: string;
      result?: Omit<DataMerchLookupData, "raw">;
    };
    if (parsed.queryKey !== queryKey || !parsed.result || !parsed.searchedAt) {
      return null;
    }
    return { result: parsed.result, searchedAt: parsed.searchedAt };
  } catch {
    return null;
  }
}

function loadOpenCorporatesForExport(
  applicationId: string,
  queryKey: string,
): { result: OpenCorporatesLookupData; searchedAt: string } | null {
  const cached = loadOpenCorporatesCache(applicationId, queryKey);
  if (!cached) return null;
  return { result: cached.result, searchedAt: cached.searchedAt };
}

export default function BackgroundCheckTab() {
  const dispatch = useDispatch<AppDispatch>();
  const applicationData = useSelector(
    (state: RootState) => state.applicationDetail.data as Record<string, unknown> | null,
  );
  const { data: offerDecisionData } = useSelector(
    (state: RootState) => state.offerDecision,
  );
  const { data: termsOffers } = useSelector(
    (state: RootState) => state.termsOffers,
  );
  const loginUser = useSelector(
    (state: RootState) => state.login.data?.user as
      | { firstName?: string; lastName?: string; role?: string }
      | undefined,
  );

  const applicationUuid = useMemo(
    () =>
      String(
        applicationData?._id ??
          applicationData?.id ??
          "",
      ).trim(),
    [applicationData],
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

  const apiApplicationKey = useMemo(
    () =>
      String(
        applicationData?.applicationId ??
          applicationData?._id ??
          applicationId ??
          "",
      ).trim(),
    [applicationData, applicationId],
  );

  useEffect(() => {
    if (!apiApplicationKey) return;
    void dispatch(getOfferDecisionByApplication(apiApplicationKey));
    void dispatch(getTermsOffers({ application: apiApplicationKey }));
  }, [apiApplicationKey, dispatch]);

  const linkContext = useMemo(() => {
    const client = applicationData?.client as Record<string, unknown> | undefined;
    const business = client?.business as Record<string, unknown> | undefined;
    const address = business?.address as Record<string, unknown> | undefined;
    const businessName = String(
      business?.name ?? client?.businessName ?? applicationData?.businessName ?? "",
    ).trim();
    const state = String(address?.state ?? client?.state ?? "").trim();
    const ein = String(
      business?.einNumber ??
        business?.ein ??
        client?.businessEinNumber ??
        "",
    ).trim();
    const dealId = String(
      applicationData?.applicationId ??
        applicationData?.dealId ??
        applicationData?.id ??
        "",
    ).trim();
    const owner = client?.owner as Record<string, unknown> | undefined;
    const ownerName = `${owner?.firstName ?? ""} ${owner?.lastName ?? ""}`.trim();
    const ownerSsn = String(owner?.ssn ?? client?.ownerSsn ?? "").trim();
    const offerDecisionSource =
      offerDecisionData ??
      (applicationData?.OfferDecision as Record<string, unknown> | null | undefined) ??
      (applicationData?.offerDecision as Record<string, unknown> | null | undefined) ??
      null;
    const offerAmount = resolveApplicationOfferAmount(
      offerDecisionSource,
      termsOffers?.[0],
    );
    const offerAmountLabel =
      offerAmount != null && offerAmount > 0 ? formatCurrency(offerAmount) : "";
    return { businessName, ein, state, dealId, ownerName, ownerSsn, offerAmountLabel };
  }, [applicationData, offerDecisionData, termsOffers]);

  const savedByName = useMemo(() => {
    const name = `${loginUser?.firstName ?? ""} ${loginUser?.lastName ?? ""}`.trim();
    return name || "User";
  }, [loginUser]);
  const canRunClear = useMemo(() => {
    // JWT-backed so the button survives a page refresh, when Redux has no user yet.
    const role = normalizeRoleKey(resolveEffectiveRole(loginUser));
    return ["UNDERWRITER", "ADMIN", "SUPER_ADMIN"].includes(role);
  }, [loginUser]);

  const [checks, setChecks] = useState<BackgroundCheckFormState>(emptyChecks);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(false);
  const [runningClear, setRunningClear] = useState(false);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);
  const [mappingToExhibit, setMappingToExhibit] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewName, setPdfPreviewName] = useState("Compliance-Report.pdf");
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const itemIdByResource = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!applicationUuid) {
      setChecks(emptyChecks());
      setSavedAt(null);
      itemIdByResource.current = {};
      return;
    }

    let cancelled = false;
    setLoading(true);
    void dispatch(getBackgroundCheck(applicationUuid))
      .unwrap()
      .then((check) => {
        if (cancelled || !check) return;
        itemIdByResource.current = buildItemIdMap(check);
        setChecks(apiCheckToFormState(check));
        setSavedAt(resolveLatestSavedAt(check));
      })
      .catch((error) => {
        if (cancelled) return;
        const message = typeof error === "string" ? error : "Failed to load background check.";
        toast.error(message);
        setChecks(emptyChecks());
        setSavedAt(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applicationUuid, dispatch]);

  const persistItem = useCallback(
    async (resourceId: string, state: BackgroundCheckItemState) => {
      const itemId = itemIdByResource.current[resourceId];
      if (!itemId) {
        throw new Error("Background check item not found.");
      }

      const payload = formItemToApiPayload(state);
      let check = (await dispatch(updateCheckItem({ itemId, ...payload })).unwrap()) as BackgroundCheck;
      itemIdByResource.current = buildItemIdMap(check);

      const apiItem = check.items.find((item) => item.id === itemId);
      const hasAttachment = (apiItem?.attachments ?? []).some(
        (attachment) => attachment.url === state.attachmentUrl,
      );
      if (state.attachmentUrl && !hasAttachment) {
        check = (await dispatch(
          addCheckAttachment({
            itemId,
            url: state.attachmentUrl,
            publicId: state.attachmentPublicId,
            originalName: state.attachmentName,
          }),
        ).unwrap()) as BackgroundCheck;
        itemIdByResource.current = buildItemIdMap(check);
      }

      return check;
    },
    [dispatch],
  );

  const requiredCheckIds = useMemo(
    () => CHECK_IDS.filter((id) => !checks[id]?.optional),
    [checks],
  );

  const updateCheck = useCallback(
    (id: string, patch: Partial<BackgroundCheckFormState[string]>) => {
      setChecks((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...patch },
      }));
    },
    [],
  );

  const markCheckDirty = useCallback(
    (id: string, patch: Partial<BackgroundCheckFormState[string]>) => {
      updateCheck(id, { ...patch, savedAt: undefined });
      setSavedAt(null);
    },
    [updateCheck],
  );

  const saveCheck = useCallback(
    async (id: string, extra?: Partial<BackgroundCheckItemState>) => {
      const state = {
        ...checks[id],
        ...extra,
        savedAt: new Date().toISOString(),
      };
      setSaving(true);
      try {
        const check = await persistItem(id, state);
        setChecks((prev) => ({ ...prev, [id]: state }));
        setSavedAt(resolveLatestSavedAt(check));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save background check.";
        toast.error(message);
      } finally {
        setSaving(false);
      }
    },
    [checks, persistItem],
  );

  const removeClearAttachment = useCallback(
    async (attachment: BackgroundCheckStoredAttachment) => {
      if (!window.confirm(`Remove "${attachment.name}" from this check?`)) return;
      setRemovingAttachmentId(attachment.id);
      try {
        const check = (await dispatch(
          removeCheckAttachment(attachment.id),
        ).unwrap()) as BackgroundCheck;
        itemIdByResource.current = buildItemIdMap(check);
        setChecks(apiCheckToFormState(check));
        setSavedAt(resolveLatestSavedAt(check));
        toast.success("PDF removed.");
      } catch (error) {
        toast.error(typeof error === "string" ? error : "Failed to remove the PDF.");
      } finally {
        setRemovingAttachmentId(null);
      }
    },
    [dispatch],
  );

  const mapClearToExhibit = useCallback(async () => {
    const itemId = itemIdByResource.current.tlo;
    if (!itemId) {
      toast.error("CLEAR background-check item was not found.");
      return;
    }

    setMappingToExhibit(true);
    try {
      const result = await dispatch(mapClearCorporationsToExhibit(itemId)).unwrap();
      toast.success(
        result.added > 0
          ? `Exhibit A filled with ${result.added} CLEAR corporation name(s).`
          : "Exhibit A already lists these CLEAR corporations.",
      );
    } catch (error) {
      toast.error(typeof error === "string" ? error : "Failed to map corporations to Exhibit A.");
    } finally {
      setMappingToExhibit(false);
    }
  }, [dispatch]);

  const runClear = useCallback(async () => {
    const itemId = itemIdByResource.current.tlo;
    if (!itemId) {
      toast.error("CLEAR background-check item was not found.");
      return;
    }

    const missingSsnOwners = ownersMissingFullSsnForClear(
      applicationData as Record<string, unknown> | null | undefined,
    );
    if (missingSsnOwners.length > 0) {
      const names = missingSsnOwners.map((owner) => owner.name).join(", ");
      const confirmed = window.confirm(
        [
          "Warning: No full SSN is available for:",
          names,
          "",
          "CLEAR person search will be less accurate and may return many loose matches.",
          "",
          "Run CLEAR anyway?",
        ].join("\n"),
      );
      if (!confirmed) return;
    }

    setRunningClear(true);
    try {
      const check = (await dispatch(runAutomatedCheckItem(itemId)).unwrap()) as BackgroundCheck;
      itemIdByResource.current = buildItemIdMap(check);
      setChecks(apiCheckToFormState(check));
      setSavedAt(resolveLatestSavedAt(check));
      toast.success("CLEAR business and owner searches completed.");
    } catch (error) {
      toast.error(typeof error === "string" ? error : "CLEAR search failed.");
    } finally {
      setRunningClear(false);
    }
  }, [applicationData, dispatch]);

  const handleSaveAll = useCallback(async () => {
    const now = new Date().toISOString();
    const next = { ...checks };
    for (const id of CHECK_IDS) {
      next[id] = { ...next[id], savedAt: now };
    }

    setSaving(true);
    try {
      let latestCheck = null;
      for (const id of CHECK_IDS) {
        latestCheck = await persistItem(id, next[id]);
      }
      setChecks(next);
      setSavedAt(latestCheck ? resolveLatestSavedAt(latestCheck) : now);
      toast.success("Background check saved.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save background check.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [checks, persistItem]);

  const buildPdfInput = useCallback(() => {
    const datamerchQueryKey = buildDataMerchQueryKey(
      linkContext.businessName,
      linkContext.ein,
    );
    const datamerchExport = applicationId
      ? loadDataMerchForExport(applicationId, datamerchQueryKey)
      : null;
    const opencorporatesQueryKey = buildOpenCorporatesQueryKey(
      linkContext.businessName,
      linkContext.state,
    );
    const opencorporatesExport = applicationId
      ? loadOpenCorporatesForExport(applicationId, opencorporatesQueryKey)
      : null;
    const clearMetadata = isClearLookupMetadata(checks.tlo?.clearMetadata)
      ? checks.tlo.clearMetadata
      : null;
    const clearMatchSections = buildClearMatchSectionsForPdf(
      clearMetadata,
      applicationData as Record<string, unknown> | null | undefined,
    );

    return {
      logoUrl: defaultBackgroundCheckLogoUrl(),
      merchantName: linkContext.businessName,
      ownerName: linkContext.ownerName,
      ownerSsn: linkContext.ownerSsn,
      offerAmount: linkContext.offerAmountLabel,
      savedByName,
      ein: linkContext.ein,
      dealId: linkContext.dealId,
      checks,
      savedAt,
      datamerch: datamerchExport?.result ?? null,
      datamerchSearchedAt: datamerchExport?.searchedAt ?? null,
      opencorporates: opencorporatesExport?.result ?? null,
      opencorporatesSearchedAt: opencorporatesExport?.searchedAt ?? null,
      clearMatchSections: clearMatchSections.length > 0 ? clearMatchSections : null,
    };
  }, [applicationData, applicationId, checks, linkContext, savedAt, savedByName]);

  const handleDownloadPdf = useCallback(async () => {
    setDownloadingPdf(true);
    try {
      await downloadBackgroundCheckPdf(buildPdfInput());
      toast.success("Background check PDF downloaded.");
    } catch (error) {
      const message = await getBackgroundCheckPdfErrorMessage(error);
      toast.error(message);
    } finally {
      setDownloadingPdf(false);
    }
  }, [buildPdfInput]);

  const handleViewPdf = useCallback(async () => {
    setViewingPdf(true);
    try {
      const blob = await fetchBackgroundCheckPdfBlob(buildPdfInput());
      const filename = backgroundCheckPdfFilename(linkContext.businessName);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setPdfPreviewName(filename);
      setIsPdfPreviewOpen(true);
    } catch (error) {
      const message = await getBackgroundCheckPdfErrorMessage(error);
      toast.error(message);
    } finally {
      setViewingPdf(false);
    }
  }, [buildPdfInput, linkContext.businessName]);

  const handleClosePdfPreview = useCallback(() => {
    setIsPdfPreviewOpen(false);
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPdfPreviewName("Compliance-Report.pdf");
  }, []);

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading background check…
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#111827]">Background Check</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            Due-diligence review required before contract.
          </p>
          <p className="mt-2 text-xs text-[#64748B]">
            {[
              linkContext.businessName || "Merchant",
              linkContext.ein
                ? `EIN ${formatBackgroundCheckEin(linkContext.ein)}`
                : null,
              linkContext.offerAmountLabel
                ? `Offer ${linkContext.offerAmountLabel}`
                : null,
              linkContext.ownerName ? `Owner ${linkContext.ownerName}` : null,
              linkContext.dealId ? `Deal ${linkContext.dealId}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {savedAt ? (
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
              Saved
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={saving || downloadingPdf || viewingPdf}
            onClick={() => void handleViewPdf()}
          >
            {viewingPdf ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                Opening…
              </>
            ) : (
              <>
                <Eye className="mr-1.5 h-4 w-4" aria-hidden />
                View PDF
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={saving || downloadingPdf || viewingPdf}
            onClick={() => void handleDownloadPdf()}
          >
            {downloadingPdf ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                Preparing…
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                Download PDF
              </>
            )}
          </Button>
        </div>
      </div>

      {applicationUuid ? (
        <CompanyResearchPanel
          applicationData={applicationData}
          applicationUuid={applicationUuid}
          defaultOwnerName={linkContext.ownerName}
          brief={checks.google?.companyBrief}
          canRun={canRunClear}
          onResearched={(check) => {
            // Only the brief is taken, so unsaved edits on the checks survive.
            const google = apiCheckToFormState(check).google;
            setChecks((prev) => ({
              ...prev,
              google: {
                ...(prev.google ?? { notes: "", optional: false }),
                companyBrief: google?.companyBrief ?? null,
              },
            }));
          }}
        />
      ) : null}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {BACKGROUND_CHECK_RESOURCES.map((resource) => {
            const state = checks[resource.id] ?? { notes: "", optional: false };
            const isDataMerch = resource.isApi === true;
            const isOpenCorporates = resource.hasPanel === true && resource.id === "opencorporates";
            const isNyCourt = resource.id === "nyscef";
            const isClear = resource.id === "tlo";

            return (
              <BackgroundCheckItemCard
                key={resource.id}
                anchorId={`bg-check-${resource.id}`}
                title={resource.title}
                description={resource.description}
                href={resolveBackgroundCheckHref(resource, linkContext)}
                notes={state.notes}
                noteImages={state.noteImages ?? []}
                status={state.status}
                risk={state.risk}
                optional={state.optional}
                attachmentName={state.attachmentName}
                attachmentUrl={state.attachmentUrl}
                attachmentPublicId={state.attachmentPublicId}
                savedAt={state.savedAt}
                onNotesChange={(notes) => markCheckDirty(resource.id, { notes })}
                onNoteImageAdd={(image) =>
                  markCheckDirty(resource.id, {
                    noteImages: [...(state.noteImages ?? []), image],
                  })
                }
                onNoteImageRemove={(imageId) =>
                  markCheckDirty(resource.id, {
                    noteImages: (state.noteImages ?? []).filter((image) => image.id !== imageId),
                  })
                }
                onSaveCheck={() => void saveCheck(resource.id)}
                onLinkOpen={() =>
                  void saveCheck(resource.id, { linkOpenedAt: new Date().toISOString() })
                }
                onStatusChange={(status) => markCheckDirty(resource.id, { status })}
                onRiskChange={(risk) => markCheckDirty(resource.id, { risk })}
                onOptionalToggle={() =>
                  markCheckDirty(resource.id, { optional: !state.optional })
                }
                onAttachmentSelect={(attachment) =>
                  markCheckDirty(resource.id, {
                    attachmentName: attachment.name,
                    attachmentUrl: attachment.url,
                    attachmentPublicId: attachment.publicId,
                  })
                }
                onAttachmentRemove={() =>
                  markCheckDirty(resource.id, {
                    attachmentName: undefined,
                    attachmentUrl: undefined,
                    attachmentPublicId: undefined,
                  })
                }
              >
                {isDataMerch ? <DataMerchPanel manualSearch embedded /> : null}
                {isOpenCorporates ? (
                  <OpenCorporatesPanel
                    embedded
                    onApplyToNotes={(notes) => markCheckDirty(resource.id, { notes })}
                  />
                ) : null}
                {isNyCourt ? (
                  <NyCourtPanel
                    embedded
                    onApplyToNotes={(notes) => markCheckDirty(resource.id, { notes })}
                  />
                ) : null}
                {isClear ? (
                  <ClearPanel
                    embedded
                    clearMetadata={state.clearMetadata}
                    attachments={state.attachments ?? []}
                    canRunClear={canRunClear}
                    runningClear={runningClear || saving}
                    onRunClear={() => void runClear()}
                    removingAttachmentId={removingAttachmentId}
                    onRemoveAttachment={(attachment) => void removeClearAttachment(attachment)}
                    mappingToExhibit={mappingToExhibit}
                    onMapToExhibit={canRunClear ? () => void mapClearToExhibit() : undefined}
                  />
                ) : null}
              </BackgroundCheckItemCard>
            );
          })}
        </div>

        <div className="w-full shrink-0 xl:w-[300px]">
          <BackgroundCheckSidebar
            merchantName={linkContext.businessName}
            checkIds={requiredCheckIds}
            checks={checks}
            savedAt={savedAt}
            saving={saving}
            downloadingPdf={downloadingPdf}
            viewingPdf={viewingPdf}
            onSaveAll={() => void handleSaveAll()}
            onDownloadPdf={handleDownloadPdf}
            onViewPdf={handleViewPdf}
          />
        </div>
      </div>

      <PDFViewerDocsModal
        isOpen={isPdfPreviewOpen}
        onClose={handleClosePdfPreview}
        fileUrl={pdfPreviewUrl}
        fileName={pdfPreviewName}
        showPrintButton
      />
    </div>
  );
}
