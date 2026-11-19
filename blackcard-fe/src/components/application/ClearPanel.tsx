import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  CheckCircle2,
  Download,
  Eye,
  FileOutput,
  Loader2,
  MinusCircle,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  getApplicationByApplicationId,
  getApplicationById,
} from "@/redux/actions/applicationActions";
import {
  syncClearBusinessToApplication,
  syncClearPersonToOwner,
} from "@/redux/actions/clear-actions";
import {
  buildClearBusinessComparisonRows,
  buildClearPersonComparisonRows,
  buildClearSyncConfirmationLines,
  canSyncClearComparisonRow,
  extractApplicationBusinessSnapshotForClear,
  extractApplicationOwnersForClear,
  revealClearIdForDisplay,
  syncFieldsForClearComparisonRow,
  syncFieldsFromClearComparisonRows,
  type ClearBusinessSyncFieldKey,
  type ClearComparisonRow,
  type ClearPersonSyncFieldKey,
} from "./clearComparison";
import type {
  ClearBusinessHit,
  ClearCorporateAssociationRecord,
  ClearLienJudgmentRecord,
  ClearLookupMetadata,
  ClearPersonHit,
  ClearPersonSearchMeta,
} from "./clearTypes";
import type { BackgroundCheckStoredAttachment } from "./backgroundCheckTypes";
import {
  downloadBackgroundCheckAttachment,
  openBackgroundCheckAttachment,
} from "./backgroundCheckAttachment";

function clearLienJudgmentTitle(record: ClearLienJudgmentRecord): string {
  const kindLabel = record.kind === "lien" ? "Lien" : "Judgment";
  return [kindLabel, record.amount, record.court || record.caseNumber].filter(Boolean).join(" · ");
}

function ClearAttachmentsSection({
  attachments,
  removingId,
  onRemove,
}: {
  attachments: BackgroundCheckStoredAttachment[];
  removingId: string | null;
  onRemove?: (attachment: BackgroundCheckStoredAttachment) => void;
}) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleView = async (attachment: BackgroundCheckStoredAttachment) => {
    if (!attachment.url) {
      toast.info("This PDF has no download URL.");
      return;
    }
    setViewingId(attachment.id);
    try {
      await openBackgroundCheckAttachment({
        url: attachment.url,
        name: attachment.name || "CLEAR-Report.pdf",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open the CLEAR PDF.",
      );
    } finally {
      setViewingId(null);
    }
  };

  const handleDownload = async (attachment: BackgroundCheckStoredAttachment) => {
    if (!attachment.url) {
      toast.info("This PDF has no download URL.");
      return;
    }
    setDownloadingId(attachment.id);
    try {
      await downloadBackgroundCheckAttachment({
        url: attachment.url,
        name: attachment.name || "CLEAR-Report.pdf",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not download the CLEAR PDF.",
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="rounded-md border border-[#E5E7EB] bg-[#FAFBFC] px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#374151]">
        Attached PDFs
      </p>
      <p className="mt-0.5 text-[11px] text-[#6B7280]">
        CLEAR report PDFs saved on this check.
      </p>
      {attachments.length === 0 ? (
        <p className="mt-2 text-[11px] italic text-[#9CA3AF]">None attached.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {attachments.map((attachment) => {
            const busy =
              viewingId === attachment.id ||
              downloadingId === attachment.id ||
              removingId === attachment.id;
            return (
              <li
                key={attachment.id}
                className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-white px-2.5 py-1.5"
              >
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-xs text-[var(--brand)] hover:underline"
                  title={attachment.name}
                >
                  {attachment.name}
                </a>
                <button
                  type="button"
                  onClick={() => void handleView(attachment)}
                  disabled={busy}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-[#64748B] hover:bg-[#EFF6FF] hover:text-[var(--brand)]",
                    busy && "cursor-not-allowed opacity-60",
                  )}
                  title="View PDF"
                >
                  {viewingId === attachment.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                  )}
                  View
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload(attachment)}
                  disabled={busy}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-[#64748B] hover:bg-[#F0FDF4] hover:text-emerald-700",
                    busy && "cursor-not-allowed opacity-60",
                  )}
                  title="Download PDF"
                >
                  {downloadingId === attachment.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Download
                </button>
                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(attachment)}
                    disabled={busy}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-[#64748B] hover:bg-[#FEF2F2] hover:text-red-600",
                      busy && "cursor-not-allowed opacity-60",
                    )}
                    title="Remove PDF"
                  >
                    {removingId === attachment.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Remove
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ClearCorporateAssociationsSection({
  records,
  mapping = false,
  onMapToExhibit,
}: {
  records: ClearCorporateAssociationRecord[];
  mapping?: boolean;
  onMapToExhibit?: () => void;
}) {
  const names = useMemo(() => {
    const seen = new Set<string>();
    const out: ClearCorporateAssociationRecord[] = [];
    for (const row of records) {
      const name = String(row.name ?? "").trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push({ ...row, name });
    }
    return out;
  }, [records]);

  return (
    <div className="rounded-md border border-[#E5E7EB] bg-[#FAFBFC] px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#374151]">
            Corporate filings
          </p>
          <p className="mt-0.5 text-[11px] text-[#6B7280]">
            Names from the CLEAR report Corporate Filings section only. Map to Exhibit adds them to
            empty Exhibit A company slots on the contract.
          </p>
        </div>
        {onMapToExhibit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={mapping || names.length === 0}
            onClick={onMapToExhibit}
            className="h-7 shrink-0 px-2.5 text-xs"
          >
            {mapping ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <FileOutput className="mr-1 h-3 w-3" aria-hidden />
            )}
            {mapping ? "Mapping…" : "Map to Exhibit"}
          </Button>
        ) : null}
      </div>
      {names.length === 0 ? (
        <p className="mt-2 text-[11px] italic text-[#9CA3AF]">None found.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {names.map((row, index) => (
            <li
              key={`${row.name}-${row.groupId ?? index}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded border border-[#E2E8F0] bg-white px-2.5 py-1.5"
            >
              <p className="text-xs font-medium text-[#0F172A]">{row.name}</p>
              <span className="rounded bg-[#EFF6FF] px-1.5 py-0.5 text-[10px] font-medium text-[#1D4ED8]">
                CLEAR
              </span>
              {row.reportKind ? (
                <span className="text-[10px] uppercase tracking-wide text-[#94A3B8]">
                  {row.reportKind}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClearLienJudgmentSection({
  title,
  records,
}: {
  title: string;
  records: ClearLienJudgmentRecord[];
}) {
  return (
    <div className="rounded-md border border-[#E5E7EB] bg-[#FAFBFC] px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#374151]">{title}</p>
      <p className="mt-0.5 text-[11px] text-[#6B7280]">
        From CLEAR report (filled automatically on Run).
      </p>
      {records.length === 0 ? (
        <p className="mt-2 text-[11px] italic text-[#9CA3AF]">None found.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {records.map((record, index) => {
            const lines = [
              record.caseNumber ? `Case: ${record.caseNumber}` : null,
              record.court ? `Court: ${record.court}` : null,
              record.filingDate ? `Filed: ${record.filingDate}` : null,
              record.amount ? `Amount: ${record.amount}` : null,
              record.parties ? `Parties: ${record.parties}` : null,
              record.status ? `Status: ${record.status}` : null,
            ].filter(Boolean);
            const key = [
              record.kind,
              record.groupId,
              record.caseNumber,
              record.court,
              record.filingDate,
              record.amount,
              index,
            ].join("|");
            return (
              <li
                key={key}
                className="rounded border border-[#E2E8F0] bg-white px-2.5 py-1.5"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="text-xs font-medium text-[#0F172A]">
                    {clearLienJudgmentTitle(record)}
                  </p>
                  <span className="rounded bg-[#EFF6FF] px-1.5 py-0.5 text-[10px] font-medium text-[#1D4ED8]">
                    CLEAR
                  </span>
                  {record.reportKind ? (
                    <span className="text-[10px] uppercase tracking-wide text-[#94A3B8]">
                      {record.reportKind}
                    </span>
                  ) : null}
                </div>
                {lines.length > 0 ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-[#64748B]">
                    {lines.join(" · ")}
                  </p>
                ) : null}
                {record.pdfUrl?.trim() ? (
                  <a
                    href={record.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--brand)] hover:underline"
                  >
                    Open CLEAR PDF
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ComparisonStatusIcon({ status }: { status: ClearComparisonRow["status"] }) {
  if (status === "match") {
    return (
      <CheckCircle2
        className="h-4 w-4 shrink-0 text-emerald-600"
        aria-label="Matches application"
      />
    );
  }
  if (status === "mismatch") {
    return (
      <XCircle
        className="h-4 w-4 shrink-0 text-red-600"
        aria-label="Does not match application"
      />
    );
  }
  return (
    <MinusCircle className="h-4 w-4 shrink-0 text-[#9CA3AF]" aria-label="Incomplete comparison" />
  );
}

function MatchRows({
  rows,
  syncingKey,
  cardKey,
  onSync,
}: {
  rows: ClearComparisonRow[];
  syncingKey: string | null;
  cardKey: string;
  onSync: (
    fields?: Array<ClearBusinessSyncFieldKey | ClearPersonSyncFieldKey>,
    rowsForConfirm?: ClearComparisonRow[],
  ) => void;
}) {
  const syncFields = useMemo(() => syncFieldsFromClearComparisonRows(rows), [rows]);
  const cardBusy = syncingKey === cardKey || syncingKey?.startsWith(`${cardKey}::`) === true;
  const syncingAll = syncingKey === cardKey;
  const canSyncAll = syncFields.length > 0 && !cardBusy;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
          Application match
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={!canSyncAll}
          onClick={() => onSync()}
        >
          {syncingAll ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-1.5 h-3 w-3" aria-hidden />
          )}
          Sync all
        </Button>
      </div>
      <div className="rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {rows.map((row) => {
          const rowCanSync = canSyncClearComparisonRow(row);
          const rowFields = syncFieldsForClearComparisonRow(row);
          const rowSyncKey = `${cardKey}::${row.key}`;
          const rowSyncing = syncingKey === rowSyncKey;
          const isWide = row.key === "address";
          return (
            <div
              key={row.key}
              className={cn(
                "rounded border border-[#E5E7EB]/bg-white px-2 py-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-0.5 text-xs",
                isWide && "sm:col-span-2 xl:col-span-3",
              )}
            >
              <ComparisonStatusIcon status={row.status} />
              <div className="min-w-0">
                <p className="font-medium text-[#111827]">{row.label}</p>
                <p className="truncate text-[#6B7280]" title={row.applicationValue}>
                  <span className="font-medium text-[#374151]">App:</span> {row.applicationValue}
                </p>
                <p className="truncate text-[#6B7280]" title={row.clearValue}>
                  <span className="font-medium text-[#374151]">CLEAR:</span> {row.clearValue}
                </p>
              </div>
              {rowCanSync ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  disabled={cardBusy}
                  onClick={() => onSync(rowFields, [row])}
                >
                  {rowSyncing ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="mr-1 h-3 w-3" aria-hidden />
                  )}
                  Sync
                </Button>
              ) : null}
            </div>
          );
        })}
        {syncFields.length === 0 ? (
          <p className="col-span-full text-[11px] text-[#6B7280]">No syncable fields for this hit.</p>
        ) : null}
      </div>
    </div>
  );
}

export default function ClearPanel({
  embedded = false,
  clearMetadata,
  attachments = [],
  onRunClear,
  onRemoveAttachment,
  onMapToExhibit,
  removingAttachmentId = null,
  mappingToExhibit = false,
  runningClear = false,
  canRunClear = true,
}: {
  embedded?: boolean;
  clearMetadata?: ClearLookupMetadata | null;
  attachments?: BackgroundCheckStoredAttachment[];
  onRunClear?: () => void;
  onRemoveAttachment?: (attachment: BackgroundCheckStoredAttachment) => void;
  onMapToExhibit?: () => void;
  removingAttachmentId?: string | null;
  mappingToExhibit?: boolean;
  runningClear?: boolean;
  canRunClear?: boolean;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const { id: routeApplicationId } = useParams();
  const applicationData = useSelector(
    (state: RootState) => state.applicationDetail.data as Record<string, unknown> | null,
  );

  const [syncingKey, setSyncingKey] = useState<string | null>(null);

  const applicationId = String(
    applicationData?.id ?? applicationData?._id ?? routeApplicationId ?? "",
  ).trim();

  const businessSnapshot = useMemo(
    () => extractApplicationBusinessSnapshotForClear(applicationData),
    [applicationData],
  );
  const owners = useMemo(
    () => extractApplicationOwnersForClear(applicationData),
    [applicationData],
  );

  const businessHits = clearMetadata?.businessSearch?.hits ?? [];
  const personSearches = clearMetadata?.personSearches ?? [];
  const clearBusinessFein = useMemo(() => {
    for (const hit of businessHits) {
      const fein = String(hit.fein ?? "").trim();
      if (fein) return fein;
    }
    return "";
  }, [businessHits]);
  const personIdOptions = useMemo(
    () => ({
      businessEinNumber: businessSnapshot.businessEinNumber,
      clearBusinessFein,
    }),
    [businessSnapshot.businessEinNumber, clearBusinessFein],
  );
  const lienJudgmentRecords = clearMetadata?.clearLienJudgments ?? [];
  const corporateAssociationRecords = clearMetadata?.clearCorporateAssociations ?? [];
  const judgmentRecords = useMemo(
    () => lienJudgmentRecords.filter((row) => row.kind === "judgment"),
    [lienJudgmentRecords],
  );
  const lienRecords = useMemo(
    () => lienJudgmentRecords.filter((row) => row.kind === "lien"),
    [lienJudgmentRecords],
  );
  const hasRun = Boolean(clearMetadata?.searchedAt || clearMetadata?.provider);
  const businessGroupCount = clearMetadata?.businessSearch?.groupCount ?? businessHits.length;
  const personGroupCount = personSearches.reduce(
    (total, search) => total + (search.groupCount ?? search.hits?.length ?? 0),
    0,
  );

  const refetchApplicationDetail = useCallback(async () => {
    const uuid = String(applicationData?.id ?? applicationData?._id ?? "").trim();
    const numeric =
      applicationData?.applicationId ?? applicationData?.dealId ?? routeApplicationId;
    if (uuid && /^[0-9a-f-]{36}$/i.test(uuid)) {
      await dispatch(getApplicationById(uuid));
      return;
    }
    if (numeric != null && String(numeric).trim()) {
      await dispatch(getApplicationByApplicationId(String(numeric).trim()));
    }
  }, [applicationData, dispatch, routeApplicationId]);

  const handleSyncBusiness = useCallback(
    async (
      hit: ClearBusinessHit,
      fieldsOverride?: Array<ClearBusinessSyncFieldKey | ClearPersonSyncFieldKey>,
      rowsForConfirm?: ClearComparisonRow[],
    ) => {
      if (!applicationId) {
        toast.error("Application id is required to sync CLEAR data.");
        return;
      }
      const rows = buildClearBusinessComparisonRows(hit, businessSnapshot);
      const fields = (fieldsOverride?.length
        ? fieldsOverride
        : syncFieldsFromClearComparisonRows(rows)) as ClearBusinessSyncFieldKey[];
      const confirmRows =
        rowsForConfirm && rowsForConfirm.length > 0
          ? rowsForConfirm
          : rows.filter(canSyncClearComparisonRow);
      if (fields.length === 0) {
        toast.info("No syncable fields for this selection.");
        return;
      }
      const singleField = Boolean(fieldsOverride?.length);
      const confirmed = window.confirm(
        [
          singleField
            ? "Sync this CLEAR value into the application?"
            : "Sync CLEAR values into this application's business profile?",
          "",
          ...buildClearSyncConfirmationLines(confirmRows),
        ].join("\n"),
      );
      if (!confirmed) return;

      const cardKey = `biz:${hit.groupId || hit.name}`;
      const syncKey =
        singleField && rowsForConfirm?.[0] ? `${cardKey}::${rowsForConfirm[0].key}` : cardKey;
      setSyncingKey(syncKey);
      try {
        const response = await syncClearBusinessToApplication(applicationId, { hit, fields });
        if (!response.success) {
          toast.error(response.message);
          return;
        }
        await refetchApplicationDetail();
        toast.success(
          singleField
            ? `${confirmRows[0]?.label ?? "Field"} synced to application.`
            : response.message || "Application business fields synced.",
        );
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Failed to sync CLEAR business data.");
      } finally {
        setSyncingKey(null);
      }
    },
    [applicationId, businessSnapshot, refetchApplicationDetail],
  );

  const handleSyncPerson = useCallback(
    async (
      hit: ClearPersonHit,
      ownerId: string | undefined,
      fieldsOverride?: Array<ClearBusinessSyncFieldKey | ClearPersonSyncFieldKey>,
      rowsForConfirm?: ClearComparisonRow[],
      ownerSnapshot?: ReturnType<typeof extractApplicationOwnersForClear>[number],
    ) => {
      if (!applicationId) {
        toast.error("Application id is required to sync CLEAR data.");
        return;
      }
      const owner =
        ownerSnapshot ??
        owners.find((row) => row.ownerId && row.ownerId === ownerId) ??
        owners[0];
      if (!owner) {
        toast.error("No application owner is available to sync.");
        return;
      }
      const rows = buildClearPersonComparisonRows(hit, owner, personIdOptions);
      const fields = (fieldsOverride?.length
        ? fieldsOverride
        : syncFieldsFromClearComparisonRows(rows)) as ClearPersonSyncFieldKey[];
      const confirmRows =
        rowsForConfirm && rowsForConfirm.length > 0
          ? rowsForConfirm
          : rows.filter(canSyncClearComparisonRow);
      if (fields.length === 0) {
        toast.info("No syncable fields for this selection.");
        return;
      }
      const singleField = Boolean(fieldsOverride?.length);
      const confirmed = window.confirm(
        [
          singleField
            ? "Sync this CLEAR value into the application owner?"
            : "Sync CLEAR values into this application owner?",
          "",
          ...buildClearSyncConfirmationLines(confirmRows),
        ].join("\n"),
      );
      if (!confirmed) return;

      const cardKey = `person:${owner.ownerId || ownerId || "primary"}:${hit.groupId || hit.lastName}`;
      const syncKey =
        singleField && rowsForConfirm?.[0] ? `${cardKey}::${rowsForConfirm[0].key}` : cardKey;
      setSyncingKey(syncKey);
      try {
        const response = await syncClearPersonToOwner(applicationId, {
          hit,
          fields,
          ownerId: owner.ownerId || ownerId,
        });
        if (!response.success) {
          toast.error(response.message);
          return;
        }
        await refetchApplicationDetail();
        toast.success(
          singleField
            ? `${confirmRows[0]?.label ?? "Field"} synced to owner.`
            : response.message || "Application owner fields synced.",
        );
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Failed to sync CLEAR person data.");
      } finally {
        setSyncingKey(null);
      }
    },
    [applicationId, owners, personIdOptions, refetchApplicationDetail],
  );

  const resolveOwnerForSearch = (search: ClearPersonSearchMeta) => {
    if (search.ownerId) {
      const byId = owners.find((owner) => owner.ownerId === search.ownerId);
      if (byId) return byId;
    }
    if (typeof search.ownerIndex === "number" && owners[search.ownerIndex]) {
      return owners[search.ownerIndex];
    }
    return owners[0];
  };

  return (
    <div
      className={cn(
        "space-y-3",
        embedded ? "rounded-md border border-[#E5E7EB] bg-white p-3" : "",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#111827]">CLEAR match review</p>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            Compare CLEAR hits to the application, then sync mismatches into the client profile.
          </p>
          {hasRun ? (
            <p className="mt-1 text-[11px] text-[#6B7280]">
              {businessGroupCount} business · {personGroupCount} owner match
              {personGroupCount === 1 ? "" : "es"}
              {clearMetadata?.searchedAt
                ? ` · ${new Date(clearMetadata.searchedAt).toLocaleString()}`
                : ""}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-[#6B7280]">Run CLEAR to load matches for review.</p>
          )}
        </div>
        {canRunClear && onRunClear ? (
          <Button
            type="button"
            size="sm"
            disabled={runningClear}
            onClick={onRunClear}
            className="shrink-0 bg-[#276D9C] text-white hover:bg-[#205b83]"
          >
            {runningClear ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            {runningClear ? "Running CLEAR…" : hasRun ? "Run CLEAR again" : "Run CLEAR"}
          </Button>
        ) : null}
      </div>

      {hasRun || attachments.length > 0 ? (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Attachments
          </p>
          <ClearAttachmentsSection
            attachments={attachments}
            removingId={removingAttachmentId}
            onRemove={onRemoveAttachment}
          />
        </section>
      ) : null}

      {hasRun ? (
        <div className="space-y-4">
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Business
            </p>
            {businessHits.length === 0 ? (
              <p className="text-xs text-[#6B7280]">No CLEAR business matches found.</p>
            ) : (
              businessHits.map((hit, index) => {
                const cardKey = `biz:${hit.groupId || hit.name || index}`;
                const rows = buildClearBusinessComparisonRows(hit, businessSnapshot);
                return (
                  <div
                    key={cardKey}
                    className="rounded-md border border-[#E5E7EB] bg-white px-3 py-3 space-y-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">
                        {hit.name || "CLEAR business hit"}
                      </p>
                      <p className="mt-0.5 text-xs text-[#6B7280]">
                        {[
                          (() => {
                            const fein = revealClearIdForDisplay(
                              hit.fein,
                              businessSnapshot.businessEinNumber,
                            );
                            return fein ? `EIN ${fein}` : null;
                          })(),
                          hit.groupId,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <MatchRows
                      rows={rows}
                      syncingKey={syncingKey}
                      cardKey={cardKey}
                      onSync={(fields, confirmRows) =>
                        void handleSyncBusiness(hit, fields, confirmRows)
                      }
                    />
                  </div>
                );
              })
            )}
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Owners
            </p>
            {personSearches.length === 0 ? (
              <p className="text-xs text-[#6B7280]">No CLEAR owner searches available.</p>
            ) : (
              personSearches.map((search, searchIndex) => {
                const owner = resolveOwnerForSearch(search);
                const hits = search.hits ?? [];
                const ownerLabel =
                  search.ownerName ||
                  [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") ||
                  `Owner ${searchIndex + 1}`;
                return (
                  <div key={`owner-search-${search.ownerId || searchIndex}`} className="space-y-2">
                    <p className="text-xs font-medium text-[#374151]">{ownerLabel}</p>
                    {hits.length === 0 ? (
                      <p className="text-xs text-[#6B7280]">No CLEAR person matches found.</p>
                    ) : (
                      hits.map((hit, hitIndex) => {
                        const cardKey = `person:${owner?.ownerId || search.ownerId || searchIndex}:${hit.groupId || hitIndex}`;
                        const rows = buildClearPersonComparisonRows(
                          hit,
                          owner ?? {
                            firstName: "",
                            middleName: "",
                            lastName: "",
                            dateOfBirth: "",
                            ssn: "",
                            email: "",
                            mobileNumber: "",
                            address1: "",
                            city: "",
                            state: "",
                            zipCode: "",
                          },
                          personIdOptions,
                        );
                        return (
                          <div
                            key={cardKey}
                            className="rounded-md border border-[#E5E7EB] bg-white px-3 py-3 space-y-2"
                          >
                            <div>
                              <p className="text-sm font-semibold text-[#111827]">
                                {[hit.firstName, hit.middleName, hit.lastName]
                                  .filter(Boolean)
                                  .join(" ") || "CLEAR person hit"}
                              </p>
                              <p className="mt-0.5 text-xs text-[#6B7280]">
                                {[
                                  (() => {
                                    const ssn = revealClearIdForDisplay(hit.ssn, owner?.ssn);
                                    return ssn ? `SSN ${ssn}` : null;
                                  })(),
                                  (() => {
                                    const ein = revealClearIdForDisplay(
                                      clearBusinessFein,
                                      businessSnapshot.businessEinNumber,
                                    );
                                    return ein ? `EIN ${ein}` : null;
                                  })(),
                                  hit.groupId,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                            <MatchRows
                              rows={rows}
                              syncingKey={syncingKey}
                              cardKey={cardKey}
                              onSync={(fields, confirmRows) =>
                                void handleSyncPerson(
                                  hit,
                                  owner?.ownerId || search.ownerId,
                                  fields,
                                  confirmRows,
                                  owner,
                                )
                              }
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })
            )}
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Corporate filings
            </p>
            <ClearCorporateAssociationsSection
              records={corporateAssociationRecords}
              mapping={mappingToExhibit}
              onMapToExhibit={onMapToExhibit}
            />
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Liens / Judgments
            </p>
            <ClearLienJudgmentSection title="Judgements" records={judgmentRecords} />
            <ClearLienJudgmentSection title="Liens" records={lienRecords} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
