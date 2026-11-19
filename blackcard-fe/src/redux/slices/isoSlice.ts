import { createSlice } from "@reduxjs/toolkit";
import type { Iso } from "@/types/isoTypes";
import {
  createIso,
  deleteIso,
  getIsoById,
  getIsos,
  updateIso,
} from "../actions/isoActions";

interface IsoState {
  list: Iso[];
  listLoading: boolean;
  listError: string | null;

  detail: Iso | null;
  detailLoading: boolean;
  detailError: string | null;

  createLoading: boolean;
  createSuccess: boolean;
  createError: string | null;

  updateLoading: boolean;
  updateSuccess: boolean;
  updateError: string | null;

  deleteLoading: boolean;
  deleteSuccess: boolean;
  deletedId: string | null;
  deleteError: string | null;
}

const initialState: IsoState = {
  list: [],
  listLoading: false,
  listError: null,

  detail: null,
  detailLoading: false,
  detailError: null,

  createLoading: false,
  createSuccess: false,
  createError: null,

  updateLoading: false,
  updateSuccess: false,
  updateError: null,

  deleteLoading: false,
  deleteSuccess: false,
  deletedId: null,
  deleteError: null,
};

export const isoSlice = createSlice({
  name: "iso",
  initialState,
  reducers: {
    resetIsoCreateState(state) {
      state.createLoading = false;
      state.createSuccess = false;
      state.createError = null;
    },
    resetIsoUpdateState(state) {
      state.updateLoading = false;
      state.updateSuccess = false;
      state.updateError = null;
    },
    resetIsoDeleteState(state) {
      state.deleteLoading = false;
      state.deleteSuccess = false;
      state.deletedId = null;
      state.deleteError = null;
    },
    clearIsoDetail(state) {
      state.detail = null;
      state.detailError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getIsos.pending, (state) => {
        // Stale-while-revalidate: keep showing the last list while refreshing in the background.
        if (state.list.length === 0) {
          state.listLoading = true;
        }
        state.listError = null;
      })
      .addCase(getIsos.fulfilled, (state, action) => {
        state.listLoading = false;
        const payload = action.payload as any;
        state.list = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : [];
      })
      .addCase(getIsos.rejected, (state, action) => {
        state.listLoading = false;
        state.listError = (action.payload as string) || "Failed to fetch ISOs";
      })
      .addCase(getIsoById.pending, (state) => {
        state.detailLoading = true;
        state.detailError = null;
      })
      .addCase(getIsoById.fulfilled, (state, action) => {
        state.detailLoading = false;
        const payload = action.payload as any;
        state.detail = (payload?.data ?? payload) || null;
      })
      .addCase(getIsoById.rejected, (state, action) => {
        state.detailLoading = false;
        state.detailError = (action.payload as string) || "Failed to fetch ISO";
      })
      .addCase(createIso.pending, (state) => {
        state.createLoading = true;
        state.createSuccess = false;
        state.createError = null;
      })
      .addCase(createIso.fulfilled, (state, action) => {
        state.createLoading = false;
        state.createSuccess = true;
        const payload = action.payload as any;
        const created = (payload?.data ?? payload) as Iso | undefined;
        if (created) state.list.unshift(created);
      })
      .addCase(createIso.rejected, (state, action) => {
        state.createLoading = false;
        state.createSuccess = false;
        state.createError = (action.payload as string) || "Failed to create ISO";
      })
      .addCase(updateIso.pending, (state) => {
        state.updateLoading = true;
        state.updateSuccess = false;
        state.updateError = null;
      })
      .addCase(updateIso.fulfilled, (state, action) => {
        state.updateLoading = false;
        state.updateSuccess = true;
        const payload = action.payload as any;
        const updated = (payload?.data ?? payload) as Iso | undefined;
        if (!updated) return;
        const idx = state.list.findIndex((x) => x.id === updated.id);
        if (idx >= 0) state.list[idx] = updated;
        if (state.detail?.id === updated.id) state.detail = updated;
      })
      .addCase(updateIso.rejected, (state, action) => {
        state.updateLoading = false;
        state.updateSuccess = false;
        state.updateError = (action.payload as string) || "Failed to update ISO";
      })
      .addCase(deleteIso.pending, (state) => {
        state.deleteLoading = true;
        state.deleteSuccess = false;
        state.deleteError = null;
      })
      .addCase(deleteIso.fulfilled, (state, action) => {
        state.deleteLoading = false;
        state.deleteSuccess = true;
        const deletedId = (action.payload as any)?.deletedId as string | undefined;
        if (!deletedId) return;
        state.deletedId = deletedId;
        state.list = state.list.filter((x) => x.id !== deletedId);
        if (state.detail?.id === deletedId) state.detail = null;
      })
      .addCase(deleteIso.rejected, (state, action) => {
        state.deleteLoading = false;
        state.deleteSuccess = false;
        state.deleteError = (action.payload as string) || "Failed to delete ISO";
      });
  },
});

export const {
  resetIsoCreateState,
  resetIsoUpdateState,
  resetIsoDeleteState,
  clearIsoDetail,
} = isoSlice.actions;

export default isoSlice.reducer;
