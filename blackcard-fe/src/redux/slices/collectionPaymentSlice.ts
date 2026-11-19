import { createSlice } from '@reduxjs/toolkit';
import { sortCollectionPaymentRowsNewestFirst } from '@/lib/collectionPaymentSort';
import type { CollectionPayment, DealCollectionsView } from '@/types/collectionPaymentTypes';
import {
  createCollectionPayment,
  deleteCollectionPayment,
  getCollectionPayments,
  updateCollectionPayment,
  updateDealEconomics,
} from '../actions/collectionPaymentActions';

interface CollectionPaymentsState {
  loading: boolean;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
  data: Record<string, CollectionPayment[]>;
  fetched: Record<string, boolean>;
  /** Keyed like `data` (applicationId and/or dealId) — from includeDealView on list. */
  dealViewByKey: Record<string, DealCollectionsView | null>;
  error: string | null;
}

const initialState: CollectionPaymentsState = {
  loading: false,
  creating: false,
  updating: false,
  deleting: false,
  data: {},
  fetched: {},
  dealViewByKey: {},
  error: null,
};

export const collectionPaymentsSlice = createSlice({
  name: 'collectionPayments',
  initialState,
  reducers: {
    clearCollectionPaymentsByApplication: (state, action) => {
      const applicationId = String(action.payload || '');
      delete state.data[applicationId];
      delete state.fetched[applicationId];
      delete state.dealViewByKey[applicationId];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getCollectionPayments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getCollectionPayments.fulfilled, (state, action) => {
        state.loading = false;
        const applicationId = (action.meta.arg as any)?.applicationId;
        const dealId = (action.meta.arg as any)?.dealId;
        if (!applicationId && !dealId) return;
        const rows = action.payload?.data ?? [];
        const normalizedRows = Array.isArray(rows) ? [...rows] : [];
        sortCollectionPaymentRowsNewestFirst(normalizedRows);
        const payload = action.payload as { dealView?: DealCollectionsView | null };
        const hasDealViewInPayload = payload != null && 'dealView' in payload;
        if (applicationId) {
          state.data[applicationId] = normalizedRows;
          state.fetched[applicationId] = true;
          if (hasDealViewInPayload) {
            state.dealViewByKey[applicationId] = payload.dealView ?? null;
          }
        }
        if (dealId) {
          state.data[dealId] = normalizedRows;
          state.fetched[dealId] = true;
          if (hasDealViewInPayload) {
            state.dealViewByKey[dealId] = payload.dealView ?? null;
          }
        }
      })
      .addCase(getCollectionPayments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createCollectionPayment.pending, (state) => {
        state.creating = true;
        state.error = null;
      })
      .addCase(createCollectionPayment.fulfilled, (state, action) => {
        state.creating = false;
        const row = action.payload?.data ?? action.payload;
        const applicationId = row?.applicationId;
        if (!applicationId) return;
        const dealKey =
          typeof row?.dealId === 'string' && row.dealId.trim() !== ''
            ? row.dealId.trim()
            : null;
        const sortBucket = (arr: CollectionPayment[]) => {
          sortCollectionPaymentRowsNewestFirst(arr);
        };
        const keys = dealKey ? [applicationId, dealKey] : [applicationId];
        const uniqKeys = [...new Set(keys)];
        for (const key of uniqKeys) {
          if (!state.data[key]) state.data[key] = [];
          const arr = state.data[key];
          if (!arr.some((x) => x.id === row.id)) arr.push(row);
          sortBucket(arr);
          state.fetched[key] = true;
        }
      })
      .addCase(createCollectionPayment.rejected, (state, action) => {
        state.creating = false;
        state.error = action.payload as string;
      })
      .addCase(updateCollectionPayment.pending, (state) => {
        state.updating = true;
        state.error = null;
      })
      .addCase(updateCollectionPayment.fulfilled, (state, action) => {
        state.updating = false;
        const row = action.payload?.data ?? action.payload;
        const applicationId = row?.applicationId;
        if (!applicationId || !row?.id) return;
        for (const arr of Object.values(state.data)) {
          const idx = arr.findIndex((x) => x.id === row.id);
          if (idx >= 0) {
            arr[idx] = row;
            sortCollectionPaymentRowsNewestFirst(arr);
          }
        }
      })
      .addCase(updateCollectionPayment.rejected, (state, action) => {
        state.updating = false;
        state.error = action.payload as string;
      })
      .addCase(deleteCollectionPayment.pending, (state) => {
        state.deleting = true;
        state.error = null;
      })
      .addCase(deleteCollectionPayment.fulfilled, (state, action) => {
        state.deleting = false;
        const deletedId = String(action.payload ?? "").trim();
        if (!deletedId) return;
        for (const key of Object.keys(state.data)) {
          state.data[key] = state.data[key].filter((x) => x.id !== deletedId);
        }
      })
      .addCase(deleteCollectionPayment.rejected, (state, action) => {
        state.deleting = false;
        state.error = action.payload as string;
      })
      .addCase(updateDealEconomics.pending, (state) => {
        state.updating = true;
        state.error = null;
      })
      .addCase(updateDealEconomics.fulfilled, (state, action) => {
        state.updating = false;
        const { data } = action.payload;
        if (!data) return;
        const fees = Number(data.feesAmount ?? 0);
        const commission = Number(data.commissionOnDeal ?? 0);
        // Update every cached deal-view bucket that points at this application/deal so the UI reflects new
        // fees/commission and recomputed `alreadyNet` / `abovePrincipal` without a full refetch round-trip.
        const keysToUpdate = new Set<string>();
        if (data.applicationId) keysToUpdate.add(String(data.applicationId).trim());
        if (data.dealId) keysToUpdate.add(String(data.dealId).trim());
        if (action.meta.arg.applicationId) keysToUpdate.add(String(action.meta.arg.applicationId).trim());
        if (action.meta.arg.dealId) keysToUpdate.add(String(action.meta.arg.dealId).trim());
        for (const key of keysToUpdate) {
          if (!key) continue;
          const view = state.dealViewByKey[key];
          if (!view) continue;
          const advance = Number(view.offerSummary?.advanceNum ?? 0);
          const refinance = Number(view.offerSummary?.refinanceAmount ?? 0);
          const repaid = Number(view.repayment?.repaidTowardPayback ?? 0);
          const alreadyNet = advance - fees + commission;
          state.dealViewByKey[key] = {
            ...view,
            offerSummary: {
              ...view.offerSummary,
              feesAmount: fees,
              commissionOnDeal: commission,
              netFundingNum: Math.max(0, advance - fees - (Number.isFinite(refinance) ? refinance : 0)),
              alreadyNetNum: alreadyNet,
            },
            repayment: {
              ...view.repayment,
              netFunding: Math.max(0, advance - fees - (Number.isFinite(refinance) ? refinance : 0)),
              alreadyNet,
              abovePrincipal: Math.round((repaid - alreadyNet) * 100) / 100,
            },
          };
        }
      })
      .addCase(updateDealEconomics.rejected, (state, action) => {
        state.updating = false;
        state.error = (action.payload as string) ?? action.error.message ?? 'Failed to update deal economics';
      });
  },
});

export const { clearCollectionPaymentsByApplication } = collectionPaymentsSlice.actions;
