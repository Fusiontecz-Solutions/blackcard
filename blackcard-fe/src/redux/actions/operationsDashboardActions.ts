import { createAsyncThunk } from "@reduxjs/toolkit";
import { axiosGet } from "../axios";

export type OperationsDashboardRecentCase = {
  id: string;
  applicationId: string;
  /** Mongo application id — required for preview sheet tabs (comments, files API, etc.). */
  applicationMongoId: string;
  /** Passed to `getClientByClientId` when opening the preview (numeric client id or client mongo id). */
  clientLookupId: string | null;
  merchant: string;
  email: string;
  amount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/** Map a raw `/applications` row to the operations dashboard recent-case shape (shared with in-dashboard list). */
export function mapRawApplicationToOperationsRecentCase(
  application: Record<string, unknown>,
): OperationsDashboardRecentCase {
  const client = application?.client;
  let merchant = "-";
  let email = "-";
  if (typeof client === "string") {
    merchant = client;
  } else if (client && typeof client === "object") {
    const c = client as {
      _id?: string;
      clientId?: number;
      business?: { name?: string; email?: string };
      owner?: { firstName?: string; lastName?: string; email?: string };
    };
    if (c.business?.name) {
      merchant = c.business.name;
    } else if (c.owner?.firstName || c.owner?.lastName) {
      merchant =
        `${c.owner?.firstName || ""} ${c.owner?.lastName || ""}`.trim() || "-";
    }
    email = c.business?.email || c.owner?.email || "-";
  }

  let clientLookupId: string | null = null;
  if (typeof client === "string" && client.trim()) {
    clientLookupId = client.trim();
  } else if (client && typeof client === "object") {
    const c = client as { clientId?: unknown; _id?: unknown };
    if (c.clientId != null && String(c.clientId).trim()) {
      clientLookupId = String(c.clientId);
    } else if (c._id != null && String(c._id).trim()) {
      clientLookupId = String(c._id);
    }
  }

  const applicationId = application?.applicationId;
  const idStr = application?._id;
  const applicationMongoId =
    typeof idStr === "string" && idStr.trim() ? idStr.trim() : "";
  const fallbackId =
    typeof idStr === "string" && idStr.length > 6
      ? idStr.slice(-6)
      : String(idStr ?? "N/A");

  const createdRaw = application?.createdAt;
  const updatedRaw = application?.updatedAt;

  return {
    id: applicationId != null ? `APP-${applicationId}` : `APP-${fallbackId}`,
    applicationId: applicationId != null ? String(applicationId) : "",
    applicationMongoId,
    clientLookupId,
    merchant,
    email,
    amount: Number(application?.loanAmount ?? 0),
    status: String(
      application?.currentQueue ||
        application?.queue ||
        application?.status ||
        "",
    ),
    createdAt: String(createdRaw || updatedRaw || new Date().toISOString()),
    updatedAt: String(updatedRaw || createdRaw || new Date().toISOString()),
  };
}

export const fetchOperationsDashboardSummary = createAsyncThunk<
  {
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
    summaryAmounts: {
      contractPending: number;
      contractsOut: number;
      signedContracts: number;
      fundingCall: number;
      disbursment: number;
      funded: number;
    };
    caseStageCounts: Record<string, number>;
    caseStageAmounts: Record<string, number>;
    operationsMetricsMode?: string;
  },
  void,
  { rejectValue: string }
>(
  "operationsDashboard/fetchSummary",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet("/applications/operations-dashboard-summary");
      const payload = response?.data ?? {};
      const data = payload?.data;
      if (!data?.summaryCounts || !data?.caseStageCounts) {
        return rejectWithValue("Invalid dashboard summary response");
      }
      return {
        summaryCounts: {
          totalCases: Number(data.summaryCounts.totalCases) || 0,
          contractPending: Number(data.summaryCounts.contractPending) || 0,
          contractGenerated:
            Number(data.summaryCounts.contractGenerated) ||
            Number(data.summaryCounts.contractsGenerated) ||
            0,
          contractsOut: Number(data.summaryCounts.contractsOut) || 0,
          signedContracts: Number(data.summaryCounts.signedContracts) || 0,
          fundingCall: Number(data.summaryCounts.fundingCall) || 0,
          disbursment: Number(data.summaryCounts.disbursment) || 0,
          funded: Number(data.summaryCounts.funded) || 0,
        },
        summaryAmounts: {
          contractPending: Number(data.summaryAmounts?.contractPending) || 0,
          contractsOut: Number(data.summaryAmounts?.contractsOut) || 0,
          signedContracts: Number(data.summaryAmounts?.signedContracts) || 0,
          fundingCall: Number(data.summaryAmounts?.fundingCall) || 0,
          disbursment: Number(data.summaryAmounts?.disbursment) || 0,
          funded: Number(data.summaryAmounts?.funded) || 0,
        },
        caseStageCounts: {
          Agent: Number(data.caseStageCounts.Agent) || 0,
          Scrubbing: Number(data.caseStageCounts.Scrubbing) || 0,
          "Underwriter": Number(data.caseStageCounts["Underwriter"]) || 0,
          Final_Approval: Number(data.caseStageCounts.Final_Approval) || 0,
          Approved_By_UW: Number(data.caseStageCounts.Approved_By_UW) || 0,
          Approval_Sent: Number(data.caseStageCounts.Approval_Sent) || 0,
          Approved_By_ISO: Number(data.caseStageCounts.Approved_By_ISO) || 0,
          Contracted: Number(data.caseStageCounts.Contracted) || 0,
          Final: Number(data.caseStageCounts.Final) || 0,
          "Funding Call": Number(data.caseStageCounts["Funding Call"]) || 0,
          On_Hold: Number(data.caseStageCounts.On_Hold) || 0,
          Missing_Documents: Number(data.caseStageCounts.Missing_Documents) || 0,
          Declined: Number(data.caseStageCounts.Declined) || 0,
          Decline_Request: Number(data.caseStageCounts.Decline_Request) || 0,
          Declined_By_Scrubber:
            Number(data.caseStageCounts.Declined_By_Scrubber) || 0,
          Declined_By_Underwriter:
            Number(data.caseStageCounts.Declined_By_Underwriter) || 0,
          Not_A_Application:
            Number(data.caseStageCounts.Not_A_Application) || 0,
          Old_Not_Scrubbed:
            Number(data.caseStageCounts.Old_Not_Scrubbed) || 0,
          Contract_Pending: Number(data.caseStageCounts.Contract_Pending) || 0,
          Contract_Sent: Number(data.caseStageCounts.Contract_Sent) || 0,
          Contract_Signed: Number(data.caseStageCounts.Contract_Signed) || 0,
          Reinitiate_Contract:
            Number(data.caseStageCounts.Reinitiate_Contract) || 0,
          Recently_Deleted:
            Number(data.caseStageCounts.Recently_Deleted) || 0,
        },
        caseStageAmounts: {
          Agent: Number(data.caseStageAmounts?.Agent) || 0,
          Scrubbing: Number(data.caseStageAmounts?.Scrubbing) || 0,
          "Underwriter":
            Number(data.caseStageAmounts?.["Underwriter"]) || 0,
          Contracted: Number(data.caseStageAmounts?.Contracted) || 0,
          Final: Number(data.caseStageAmounts?.Final) || 0,
          "Funding Call": Number(data.caseStageAmounts?.["Funding Call"]) || 0,
          Declined: Number(data.caseStageAmounts?.Declined) || 0,
          Contract_Pending: Number(data.caseStageAmounts?.Contract_Pending) || 0,
          Contract_Sent: Number(data.caseStageAmounts?.Contract_Sent) || 0,
          Contract_Signed: Number(data.caseStageAmounts?.Contract_Signed) || 0,
          Disbursment: Number(data.caseStageAmounts?.Disbursment) || 0,
          Funded: Number(data.caseStageAmounts?.Funded) || 0,
        },
        operationsMetricsMode:
          typeof data.operationsMetricsMode === "string"
            ? data.operationsMetricsMode
            : undefined,
      };
    } catch (error: unknown) {
      const message =
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message
          ? String(
              (error as { response: { data: { message: string } } }).response.data
                .message,
            )
          : "Failed to load dashboard totals";
      return rejectWithValue(message);
    }
  },
);

export const fetchOperationsDashboardRecentCases = createAsyncThunk<
  OperationsDashboardRecentCase[],
  void,
  { rejectValue: string }
>(
  "operationsDashboard/fetchRecentCases",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet(
        "/applications/operations-dashboard-recent-cases?limit=200",
      );
      const payload = response?.data ?? {};
      const applications = Array.isArray(payload?.data) ? payload.data : [];

      const mapped: OperationsDashboardRecentCase[] = applications
        .map((application: Record<string, unknown>) =>
          mapRawApplicationToOperationsRecentCase(application),
        );

      mapped.sort(
          (a: OperationsDashboardRecentCase, b: OperationsDashboardRecentCase) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return mapped;
    } catch (error: unknown) {
      const message =
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message
          ? String(
              (error as { response: { data: { message: string } } }).response.data
                .message,
            )
          : "Failed to load recent cases";
      return rejectWithValue(message);
    }
  },
);
