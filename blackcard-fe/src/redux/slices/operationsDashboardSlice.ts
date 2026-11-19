import { createSlice } from "@reduxjs/toolkit";
import {
  fetchOperationsDashboardSummary,
  fetchOperationsDashboardRecentCases,
  type OperationsDashboardRecentCase,
} from "../actions/operationsDashboardActions";

export type { OperationsDashboardRecentCase };

const defaultSummaryCounts = {
  totalCases: 0,
  contractPending: 0,
  contractGenerated: 0,
  contractsOut: 0,
  signedContracts: 0,
  fundingCall: 0,
  disbursment: 0,
  funded: 0,
};

const defaultSummaryAmounts = {
  contractPending: 0,
  contractsOut: 0,
  signedContracts: 0,
  fundingCall: 0,
  disbursment: 0,
  funded: 0,
};

const defaultCaseStageCounts: Record<string, number> = {
  Agent: 0,
  Scrubbing: 0,
  "Underwriter": 0,
  Final_Approval: 0,
  Approved_By_UW: 0,
  Approval_Sent: 0,
  Approved_By_ISO: 0,
  Contracted: 0,
  Contract_Pending: 0,
  Contract_Sent: 0,
  Contract_Signed: 0,
  Reinitiate_Contract: 0,
  Final: 0,
  "Funding Call": 0,
  On_Hold: 0,
  Missing_Documents: 0,
  Declined: 0,
  Decline_Request: 0,
  Declined_By_Scrubber: 0,
  Declined_By_Underwriter: 0,
  Not_A_Application: 0,
  Old_Not_Scrubbed: 0,
  Recently_Deleted: 0,
};

const defaultCaseStageAmounts: Record<string, number> = {
  Agent: 0,
  Scrubbing: 0,
  "Underwriter": 0,
  Contracted: 0,
  Final: 0,
  "Funding Call": 0,
  Declined: 0,
  Contract_Pending: 0,
  Contract_Sent: 0,
  Contract_Signed: 0,
  Reinitiate_Contract: 0,
  Disbursment: 0,
  Funded: 0,
};

export interface OperationsDashboardState {
  summaryCounts: typeof defaultSummaryCounts;
  summaryAmounts: typeof defaultSummaryAmounts;
  caseStageCounts: Record<string, number>;
  caseStageAmounts: Record<string, number>;
  /** Backend filter mode: `state` (OPERATIONS summary cards) vs `queue` (Super Admin pipeline). */
  operationsMetricsMode: string | null;
  /** True until the first successful summary load completes. */
  summaryLoading: boolean;
  /** Background refresh while keeping previous numbers visible. */
  summaryRefreshing: boolean;
  summaryError: string | null;
  summaryInFlight: boolean;
  lastSummaryFetchedAt: number | null;
  hasLoadedSummaryOnce: boolean;

  recentCases: OperationsDashboardRecentCase[];
  recentLoading: boolean;
  recentError: string | null;
  recentInFlight: boolean;
  lastRecentFetchedAt: number | null;
  hasLoadedRecentOnce: boolean;
}

const emptyState = (): OperationsDashboardState => ({
  summaryCounts: { ...defaultSummaryCounts },
  summaryAmounts: { ...defaultSummaryAmounts },
  caseStageCounts: { ...defaultCaseStageCounts },
  caseStageAmounts: { ...defaultCaseStageAmounts },
  operationsMetricsMode: null,
  summaryLoading: false,
  summaryRefreshing: false,
  summaryError: null,
  summaryInFlight: false,
  lastSummaryFetchedAt: null,
  hasLoadedSummaryOnce: false,

  recentCases: [],
  recentLoading: false,
  recentError: null,
  recentInFlight: false,
  lastRecentFetchedAt: null,
  hasLoadedRecentOnce: false,
});

const initialState: OperationsDashboardState = emptyState();

export const operationsDashboardSlice = createSlice({
  name: "operationsDashboard",
  initialState,
  reducers: {
    /** Call after mutations so the next dashboard visit refetches immediately. */
    invalidateOperationsDashboardCache: (state) => {
      state.lastSummaryFetchedAt = null;
      state.lastRecentFetchedAt = null;
    },
    /** Full reset (e.g. logout) so the next user does not see cached ops metrics. */
    resetOperationsDashboard: () => emptyState(),
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOperationsDashboardSummary.pending, (state) => {
        state.summaryInFlight = true;
        state.summaryError = null;
        if (!state.hasLoadedSummaryOnce) {
          state.summaryLoading = true;
        } else {
          state.summaryRefreshing = true;
        }
      })
      .addCase(fetchOperationsDashboardSummary.fulfilled, (state, action) => {
        state.summaryInFlight = false;
        state.summaryLoading = false;
        state.summaryRefreshing = false;
        state.hasLoadedSummaryOnce = true;
        state.lastSummaryFetchedAt = Date.now();
        state.summaryCounts = action.payload.summaryCounts;
        state.summaryAmounts = action.payload.summaryAmounts;
        state.caseStageCounts = action.payload.caseStageCounts;
        state.caseStageAmounts = action.payload.caseStageAmounts;
        state.operationsMetricsMode =
          action.payload.operationsMetricsMode ?? null;
      })
      .addCase(fetchOperationsDashboardSummary.rejected, (state, action) => {
        state.summaryInFlight = false;
        state.summaryLoading = false;
        state.summaryRefreshing = false;
        state.summaryError =
          action.payload ?? action.error.message ?? "Failed to load totals";
      })
      .addCase(fetchOperationsDashboardRecentCases.pending, (state) => {
        state.recentInFlight = true;
        state.recentError = null;
        if (!state.hasLoadedRecentOnce) {
          state.recentLoading = true;
        }
      })
      .addCase(fetchOperationsDashboardRecentCases.fulfilled, (state, action) => {
        state.recentInFlight = false;
        state.recentLoading = false;
        state.hasLoadedRecentOnce = true;
        state.lastRecentFetchedAt = Date.now();
        state.recentCases = action.payload;
      })
      .addCase(fetchOperationsDashboardRecentCases.rejected, (state, action) => {
        state.recentInFlight = false;
        state.recentLoading = false;
        state.recentError =
          action.payload ?? action.error.message ?? "Failed to load recent cases";
        if (!state.hasLoadedRecentOnce) {
          state.recentCases = [];
        }
      });
  },
});

export const {
  invalidateOperationsDashboardCache,
  resetOperationsDashboard,
} = operationsDashboardSlice.actions;
