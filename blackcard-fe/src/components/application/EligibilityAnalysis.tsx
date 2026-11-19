import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router";
import { Download, Eye, Landmark, Loader2, Mail } from "lucide-react";
import ApplicationSheetBankDetail from "@/components/application/ApplicationSheetBankDetail";
import PDFViewerDocsModal from "@/components/application/PDFViewerDocsModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DecisionLogicInfo from "@/components/client/decision-logic/decision-logic-info-section";
import { getBankDetails } from "@/redux/actions/bankDetailActions";
import {
  downloadDecisionLogicReportPdf,
  fetchDecisionLogicReport,
  fetchDecisionLogicReportPdfBlob,
  initiateDecisionLogic,
} from "@/redux/actions/decision-logic-actions";
import { uploadAndDownloadCsv } from "@/redux/actions/automatedBankStatementActions";
import {
  getApplicationById,
  sendApplicationForFinalUnderwriterApproval,
} from "@/redux/actions/applicationActions";
import { FINAL_APPROVAL_SOURCE_DECISION_LOGIC } from "@/lib/finalApprovalSource";
import { normalizeRoleKey, resolveEffectiveRole } from "@/lib/sessionRole";
import { isContractSignedApplication } from "@/lib/applicationWorkflowState";
import {
  formatApprovedByUnderwriterLabel,
  formatUserLiteName,
  resolveFinalApprovalTargetUnderwriter,
} from "@/lib/underwriterApprovalLabel";
import type { AppDispatch, RootState } from "@/redux/store";
import type { BankDetail } from "@/types/bankDetailTypes";
import { filterBankDetailsForApplication } from "@/lib/bankDetailUtils";
import {
  isDecisionLogicVerificationIncomplete,
  pickBestDecisionLogicReportRow,
} from "@/lib/decisionLogicReportStatus";

type OwnerRow = { id: number; label: string };
type BankRow = { id: number; label: string };

function normalizeOwners(applicationData: any): OwnerRow[] {
  const client = applicationData?.client;
  const owner = client?.owner;
  const ownerId = Number(client?.clientId ?? applicationData?.applicationId ?? 0);
  if (!owner) return [];
  const fullName = `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim();
  return [{ id: ownerId, label: fullName || "Owner" }];
}

function normalizeBanks(rawBanks: BankDetail[]): BankRow[] {
  if (!Array.isArray(rawBanks)) return [];
  return rawBanks.map((bank: any, index: number) => {
    // Decision Logic backend currently expects numeric bankAccountId.
    // BankDetail PK is UUID, so we pass stable 1-based row order.
    const id = index + 1;
    const bankName = bank?.bankName ?? "Bank";
    const routing = bank?.routingNumber ?? "—";
    const account = bank?.accountNumber ?? "—";
    return { id, label: `${bankName} (${routing}/${account})` };
  });
}

function resolveOwnerEmailForDecisionLogic(applicationData: unknown): string {
  const app = applicationData as {
    client?: {
      owner?: { email?: string | null };
      businessEmail?: string | null;
      ownerEmail?: string | null;
    };
  } | null;
  return String(
    app?.client?.owner?.email ??
      app?.client?.ownerEmail ??
      app?.client?.businessEmail ??
      "",
  ).trim();
}

export default function EligibilityAnalysis() {
  const { applicationId: paramApplicationId } = useParams<{ applicationId: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const applicationData = useSelector((state: RootState) => state.applicationDetail.data as any);
  const loginUser = useSelector((state: RootState) => state.login.data?.user);
  const bankDetailRows = useSelector(
    (state: RootState) => (state.bankDetails.data ?? []) as BankDetail[]
  );
  const [bankDetailsDialogOpen, setBankDetailsDialogOpen] = useState(false);
  const [isDecisionLogicModalOpen, setIsDecisionLogicModalOpen] = useState(false);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>("");
  const [isSendingDecisionLogicEmail, setIsSendingDecisionLogicEmail] = useState(false);
  const [isSendingFinalApproval, setIsSendingFinalApproval] = useState(false);
  const [dlReportLoading, setDlReportLoading] = useState(false);
  const [dlReportError, setDlReportError] = useState("");
  const [dlReportRow, setDlReportRow] = useState<Record<string, unknown> | null>(null);
  const [dlReportFetched, setDlReportFetched] = useState(false);
  const [reportFetchNonce, setReportFetchNonce] = useState(0);
  const [dlPdfViewing, setDlPdfViewing] = useState(false);
  const [dlPdfDownloading, setDlPdfDownloading] = useState(false);
  const [dlPdfPreviewUrl, setDlPdfPreviewUrl] = useState<string | null>(null);
  const [dlPdfPreviewName, setDlPdfPreviewName] = useState("Decision-Logic-Report.pdf");
  const [isDlPdfPreviewOpen, setIsDlPdfPreviewOpen] = useState(false);
  const [uploadedBankFiles, setUploadedBankFiles] = useState<string[]>([]);
  const { loading: uploadStatementLoading, error: uploadStatementError } = useSelector(
    (state: RootState) => state.automatedBankStatement,
  );

  const owners = useMemo(() => normalizeOwners(applicationData), [applicationData]);
  const applicationRecordId = useMemo(
    () =>
      String(
        applicationData?._id ??
        applicationData?.id ??
        applicationData?.application?._id ??
        ""
      ),
    [applicationData]
  );
  const applicationKeys = useMemo(
    () => [
      applicationRecordId,
      paramApplicationId,
      applicationData?.applicationId,
      applicationData?.application?.applicationId,
    ],
    [applicationRecordId, paramApplicationId, applicationData],
  );
  const scopedBankDetailRows = useMemo(
    () => filterBankDetailsForApplication(bankDetailRows, applicationKeys),
    [bankDetailRows, applicationKeys],
  );
  const clientOwnerId = useMemo(
    () => Number(applicationData?.client?.clientId ?? 0),
    [applicationData]
  );
  const banks = useMemo(() => normalizeBanks(scopedBankDetailRows), [scopedBankDetailRows]);
  const bankOptions = useMemo(
    () =>
      banks.length
        ? banks
        : [{ id: 0, label: "Demo Bank Account (No bank account added yet)" }],
    [banks]
  );
  const bankAccountsOptions = useMemo(
    () =>
      bankOptions.map((bank) => ({
        value: String(bank.id),
        label: bank.label,
      })),
    [bankOptions]
  );
  const roleKey = normalizeRoleKey(resolveEffectiveRole(loginUser));
  const canSendFinalUnderwriterApproval =
    roleKey === "SUPER_ADMIN" || roleKey === "OPERATIONS";
  const isContractSignedStage = isContractSignedApplication(applicationData);
  const finalApprovalTarget = resolveFinalApprovalTargetUnderwriter(applicationData ?? {});
  const approvingUnderwriterId = finalApprovalTarget?.id ?? "";
  const currentQueueNorm = String(applicationData?.currentQueue ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  const isFinalApprovalStage = currentQueueNorm === "finalapproval";
  const approvingUnderwriterName = finalApprovalTarget
    ? formatUserLiteName(finalApprovalTarget.user)
    : formatApprovedByUnderwriterLabel(
        (applicationData ?? {}) as Parameters<typeof formatApprovedByUnderwriterLabel>[0],
      );
  const showSendFinalApprovalButton =
    canSendFinalUnderwriterApproval &&
    isContractSignedStage &&
    Boolean(approvingUnderwriterId);
  const ownerEmailForDecisionLogic = useMemo(
    () => resolveOwnerEmailForDecisionLogic(applicationData),
    [applicationData],
  );
  const decisionLogicIncomplete = useMemo(
    () => isDecisionLogicVerificationIncomplete(dlReportRow),
    [dlReportRow],
  );

  useEffect(() => {
    if (!applicationRecordId) return;
    void dispatch(getBankDetails({ application: applicationRecordId }));
  }, [dispatch, applicationRecordId]);

  useEffect(() => {
    if (!Number.isFinite(clientOwnerId) || clientOwnerId <= 0) {
      setDlReportRow(null);
      setDlReportError("");
      setDlReportLoading(false);
      setDlReportFetched(false);
      return;
    }
    let cancelled = false;
    setDlReportLoading(true);
    setDlReportError("");
    void (async () => {
      const response = await fetchDecisionLogicReport(0, clientOwnerId);
      if (cancelled) return;
      if ((response as { error?: string })?.error) {
        setDlReportError(
          String(
            (response as { error?: string }).error ||
              "Failed to fetch Decision Logic report.",
          ),
        );
        setDlReportRow(null);
        setDlReportLoading(false);
        setDlReportFetched(true);
        return;
      }
      const rows = (response as { data?: unknown })?.data;
      setDlReportRow(pickBestDecisionLogicReportRow(rows));
      setDlReportLoading(false);
      setDlReportFetched(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientOwnerId, reportFetchNonce]);

  const handleUploadBankStatement = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,application/pdf";
    input.multiple = true;
    input.onchange = async () => {
      const files = input.files;
      if (!files || files.length === 0) return;

      const names = Array.from(files).map((f) => f.name);
      setUploadedBankFiles(names);

      const [firstFile] = Array.from(files);
      if (!firstFile) return;

      const toastId = toast.loading("Uploading bank statement…");
      try {
        const { csvContent, filename } = await dispatch(
          uploadAndDownloadCsv(firstFile),
        ).unwrap();

        const blob = new Blob(
          [typeof csvContent === "string" ? csvContent : String(csvContent)],
          { type: "text/csv;charset=utf-8" },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        if (applicationRecordId) {
          void dispatch(getBankDetails({ application: applicationRecordId }));
        }

        toast.update(toastId, {
          render: "Bank statement uploaded and parsed successfully.",
          type: "success",
          isLoading: false,
          autoClose: 3000,
        });
      } catch (err) {
        const message =
          typeof err === "string"
            ? err
            : "Failed to upload bank statement. Please try again.";
        toast.update(toastId, {
          render: message,
          type: "error",
          isLoading: false,
          autoClose: 4000,
        });
      }
    };
    input.click();
  }, [applicationRecordId, dispatch]);

  const openBankDetailsDialog = () => {
    if (!applicationRecordId) {
      toast.error("Missing application id. Please reload and try again.");
      return;
    }
    setBankDetailsDialogOpen(true);
  };

  const onInitiateDecisionLogic = () => {
    if (!owners.length) {
      toast.error("Owner profile is missing for this application.");
      return;
    }
    setSelectedBankAccountId(String(bankOptions[0]?.id ?? ""));
    setIsDecisionLogicModalOpen(true);
  };

  const dlPdfNameHint = useMemo(() => {
    if (!dlReportRow) return "report";
    return String(
      dlReportRow.nameFound ||
        dlReportRow.nameEntered ||
        dlReportRow.accountName ||
        dlReportRow.requestCode ||
        "report",
    );
  }, [dlReportRow]);

  const handleViewDecisionLogicPdf = useCallback(async () => {
    if (!Number.isFinite(clientOwnerId) || clientOwnerId <= 0 || !dlReportRow) {
      toast.error("No Decision Logic report available to view.");
      return;
    }
    setDlPdfViewing(true);
    try {
      const { blob, filename } = await fetchDecisionLogicReportPdfBlob(clientOwnerId);
      const url = URL.createObjectURL(blob);
      setDlPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setDlPdfPreviewName(filename);
      setIsDlPdfPreviewOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not open the Decision Logic PDF.",
      );
    } finally {
      setDlPdfViewing(false);
    }
  }, [clientOwnerId, dlReportRow]);

  const handleDownloadDecisionLogicPdf = useCallback(async () => {
    if (!Number.isFinite(clientOwnerId) || clientOwnerId <= 0 || !dlReportRow) {
      toast.error("No Decision Logic report available to download.");
      return;
    }
    setDlPdfDownloading(true);
    try {
      await downloadDecisionLogicReportPdf(clientOwnerId, dlPdfNameHint);
      toast.success("Decision Logic PDF downloaded.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not download the Decision Logic PDF.",
      );
    } finally {
      setDlPdfDownloading(false);
    }
  }, [clientOwnerId, dlPdfNameHint, dlReportRow]);

  const handleCloseDecisionLogicPdfPreview = useCallback(() => {
    setIsDlPdfPreviewOpen(false);
    setDlPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setDlPdfPreviewName("Decision-Logic-Report.pdf");
  }, []);

  const sendDecisionLogicEmailToCustomer = async (bankAccountId: string) => {
    const parsedBankId = parseInt(bankAccountId, 10);
    if (!Number.isFinite(parsedBankId) || parsedBankId <= 0) {
      toast.error("Please select a valid bank account.");
      return;
    }

    const ownerId = clientOwnerId || owners[0]?.id || 0;
    if (!ownerId) {
      toast.error("Client id is missing for this application.");
      return;
    }

    if (!ownerEmailForDecisionLogic) {
      toast.error(
        "Owner email is missing on this application. Add an email on the client record first.",
      );
      return;
    }

    setIsDecisionLogicModalOpen(false);
    const toastId = toast.loading(
      `Sending Decision Logic link to ${ownerEmailForDecisionLogic}…`,
    );
    try {
      setIsSendingDecisionLogicEmail(true);
      const response = await initiateDecisionLogic(ownerId, ownerId, parsedBankId);
      if ((response as { error?: string })?.error) {
        toast.update(toastId, {
          render: String((response as { error?: string }).error),
          type: "error",
          isLoading: false,
          autoClose: 6000,
        });
        return;
      }

      toast.update(toastId, {
        render:
          `Verification email sent to ${ownerEmailForDecisionLogic}. ` +
          "Ask the customer to open the link and complete bank login, then click Refresh report.",
        type: "success",
        isLoading: false,
        autoClose: 8000,
      });
    } finally {
      setIsSendingDecisionLogicEmail(false);
    }
  };

  const handleSendForFinalUnderwriterApproval = async () => {
    if (!applicationRecordId) {
      toast.error("Missing application id. Please reload and try again.");
      return;
    }
    if (!approvingUnderwriterId) {
      toast.error("No approving Underwriter is recorded for this application.");
      return;
    }
    setIsSendingFinalApproval(true);
    const toastId = toast.loading("Sending to Underwriter for final approval...");
    try {
      await dispatch(
        sendApplicationForFinalUnderwriterApproval({
          applicationId: applicationRecordId,
          source: FINAL_APPROVAL_SOURCE_DECISION_LOGIC,
        }),
      ).unwrap();
      await dispatch(getApplicationById(paramApplicationId ?? applicationRecordId));
      toast.update(toastId, {
        render: approvingUnderwriterName
          ? `Application sent to ${approvingUnderwriterName} for final approval.`
          : "Application sent to the approving Underwriter for final approval.",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
    } catch (err) {
      console.error("Failed to send for final Underwriter approval:", err);
      toast.update(toastId, {
        render:
          typeof err === "string"
            ? err
            : "Failed to send application for final Underwriter approval. Please try again.",
        type: "error",
        isLoading: false,
        autoClose: 4000,
      });
    } finally {
      setIsSendingFinalApproval(false);
    }
  };

  return (
    <section >
      <div className="space-y-5">
        {showSendFinalApprovalButton ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#111827]">
                Final Underwriter approval
              </p>
              <p className="mt-0.5 text-xs text-[#6B7280]">
                {isFinalApprovalStage
                  ? `Already sent to ${approvingUnderwriterName ?? "the approving Underwriter"} for final approval.`
                  : approvingUnderwriterName
                    ? `Send this deal back to ${approvingUnderwriterName} only — not to another Underwriter.`
                    : "Send this deal to the Underwriter who approved it for final approval."}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="default"
              className="bg-[image:none] bg-green-600 text-white hover:bg-green-700 hover:opacity-100"
              disabled={isSendingFinalApproval || isFinalApprovalStage}
              onClick={() => void handleSendForFinalUnderwriterApproval()}
            >
              {isSendingFinalApproval ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : isFinalApprovalStage ? (
                "Sent for final approval"
              ) : (
                "Send for Final Approval"
              )}
            </Button>
          </div>
        ) : null}
        <div className="rounded-md border border-[#E5E7EB] p-3 space-y-2">
          <div className="flex w-full items-start justify-between gap-3">
            <h3 className="shrink-0 pt-1 text-sm font-semibold text-[#111827]">Decision Logic</h3>
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploadStatementLoading}
                onClick={handleUploadBankStatement}
              >
                {uploadStatementLoading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                    Uploading…
                  </>
                ) : (
                  "Upload bank statement"
                )}
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={onInitiateDecisionLogic}
              >
                <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Initiate Decision Logic
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={openBankDetailsDialog}
                    aria-label="Add bank details"
                  >
                    <Landmark className="h-4 w-4" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Add bank details</TooltipContent>
              </Tooltip>
            </div>
          </div>
          {uploadedBankFiles.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-1 text-[11px] text-[#6B7280]">
              {uploadedBankFiles.map((name, idx) => (
                <span
                  key={`${name}-${idx}`}
                  className="rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5"
                  title={name}
                >
                  {name.length > 22 ? `${name.slice(0, 19)}…` : name}
                </span>
              ))}
            </div>
          ) : null}
          {uploadStatementError ? (
            <p className="text-[11px] text-red-600">{uploadStatementError}</p>
          ) : null}
          {owners.map((owner) => (
            <details key={`decision-${owner.id}`} className="rounded-md border border-[#E5E7EB]">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase text-[#111827]">
                {owner.label}
              </summary>
            </details>
          ))}

          {Number.isFinite(clientOwnerId) && clientOwnerId > 0 ? (
            <div className="border-t border-[#E5E7EB] pt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <span className="text-xs font-medium text-[#374151]">
                  Decision Logic report (client #{clientOwnerId})
                </span>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={
                      !dlReportRow ||
                      dlReportLoading ||
                      dlPdfViewing ||
                      dlPdfDownloading
                    }
                    onClick={() => void handleViewDecisionLogicPdf()}
                  >
                    {dlPdfViewing ? (
                      <>
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden />
                        Opening…
                      </>
                    ) : (
                      <>
                        <Eye className="mr-1.5 h-3 w-3" aria-hidden />
                        View PDF
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={
                      !dlReportRow ||
                      dlReportLoading ||
                      dlPdfViewing ||
                      dlPdfDownloading
                    }
                    onClick={() => void handleDownloadDecisionLogicPdf()}
                  >
                    {dlPdfDownloading ? (
                      <>
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden />
                        Preparing…
                      </>
                    ) : (
                      <>
                        <Download className="mr-1.5 h-3 w-3" aria-hidden />
                        Download PDF
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={dlReportLoading}
                    onClick={() => setReportFetchNonce((n) => n + 1)}
                  >
                    {dlReportLoading ? (
                      <>
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden />
                        Loading…
                      </>
                    ) : (
                      "Refresh report"
                    )}
                  </Button>
                </div>
              </div>

              {dlReportLoading && !dlReportRow ? (
                <div className="flex items-center gap-2 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-4 text-xs text-[#6B7280]">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--brand)]" aria-hidden />
                  Loading Decision Logic report…
                </div>
              ) : null}

              {dlReportError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {dlReportError}
                </div>
              ) : null}

              {!dlReportLoading && !dlReportError && dlReportRow ? (
                <>
                  {decisionLogicIncomplete ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
                      <p className="text-xs font-semibold text-amber-900">
                        Bank verification not completed
                      </p>
                      <p className="text-xs text-amber-900">
                        Status is &quot;
                        {String(dlReportRow.statusText ?? "Not Started")}
                        &quot; — the customer has not finished bank login yet. Click
                        <strong>Initiate Decision Logic</strong> to send the secure Decision Logic link
                        so bank data can be returned.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className="h-7 bg-[var(--brand)] text-white hover:opacity-90"
                        disabled={isSendingDecisionLogicEmail}
                        onClick={onInitiateDecisionLogic}
                      >
                        {isSendingDecisionLogicEmail ? (
                          <>
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden />
                            Sending…
                          </>
                        ) : (
                          <>
                            <Mail className="mr-1.5 h-3 w-3" aria-hidden />
                            Initiate Decision Logic
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2.5">
                      <p className="text-xs font-semibold text-green-800">
                        Bank verification completed
                      </p>
                      <p className="mt-0.5 text-xs text-green-800">
                        Decision Logic finished processing. Report data is shown below.
                      </p>
                    </div>
                  )}
                  <DecisionLogicInfo data={dlReportRow} />
                </>
              ) : null}

              {dlReportFetched && !dlReportLoading && !dlReportError && !dlReportRow ? (
                <p className="px-1 text-xs text-[#6B7280]">
                  No saved Decision Logic report for this client yet. Click{" "}
                  <strong>Initiate Decision Logic</strong> to send the bank verification link, then
                  use &quot;Refresh report&quot; after they complete it.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="border-t border-[#E5E7EB] pt-3 px-1 text-xs text-[#6B7280]">
              Link this application to a client to load a Decision Logic report.
            </p>
          )}
        </div>
      </div>
      <Dialog
        open={bankDetailsDialogOpen}
        onOpenChange={(open: boolean) => {
          setBankDetailsDialogOpen(open);
          if (!open && applicationRecordId) {
            void dispatch(getBankDetails({ application: applicationRecordId }));
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-y-auto px-0 py-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-[#E5E7EB] px-4 py-3">
            <DialogTitle className="text-sm font-semibold text-[#111827]">
              Bank Details
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-3">
            {applicationRecordId ? (
              <ApplicationSheetBankDetail
                applicationId={applicationRecordId}
                onClose={() => setBankDetailsDialogOpen(false)}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isDecisionLogicModalOpen} onOpenChange={setIsDecisionLogicModalOpen}>
        <DialogContent className="max-w-[480px] gap-0 px-0 py-0">
          <DialogHeader className="border-b border-[#E5E7EB] px-4 py-3">
            <DialogTitle className="text-sm font-semibold text-[#111827]">
              Decision Logic — Initiate
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-4 py-3">
            <p className="text-xs leading-relaxed text-[#6B7280]">
              Sends a secure link to the owner&apos;s email. They open it, log into their bank in
              the Decision Logic widget, and bank data is saved here when finished.
            </p>
            {ownerEmailForDecisionLogic ? (
              <p className="text-xs text-[#374151]">
                Email will be sent to{" "}
                <span className="font-medium text-[#111827]">
                  {ownerEmailForDecisionLogic}
                </span>
              </p>
            ) : (
              <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800">
                No owner email on file. Add an email on the client record before sending.
              </p>
            )}
            <label className="text-xs text-[#374151]">Bank account on file</label>
            <Select value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Select Bank Account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccountsOptions.map((bank) => (
                  <SelectItem key={bank.value} value={bank.value} className="text-xs">
                    {bank.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex-row justify-end gap-2 border-t border-[#E5E7EB] px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDecisionLogicModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => void sendDecisionLogicEmailToCustomer(selectedBankAccountId)}
              disabled={
                isSendingDecisionLogicEmail ||
                !selectedBankAccountId ||
                !ownerEmailForDecisionLogic
              }
            >
              {isSendingDecisionLogicEmail ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="mr-1.5 h-3 w-3" aria-hidden />
                  Initiate Decision Logic
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PDFViewerDocsModal
        isOpen={isDlPdfPreviewOpen}
        onClose={handleCloseDecisionLogicPdfPreview}
        fileUrl={dlPdfPreviewUrl}
        fileName={dlPdfPreviewName}
        showPrintButton
      />
    </section>
  );
}
