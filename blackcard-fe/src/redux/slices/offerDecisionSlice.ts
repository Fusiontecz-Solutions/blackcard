import { createSlice } from "@reduxjs/toolkit"
import { getOfferDecisionByApplication } from "../actions/offerDecisionActions"

interface OfferDecisionState {
  loading: boolean
  data: any | null
  error: string | null
}

const initialState: OfferDecisionState = {
  loading: false,
  data: null,
  error: null,
}

export const offerDecisionSlice = createSlice({
  name: "offerDecision",
  initialState,
  reducers: {
    clearOfferDecision: (state) => {
      state.loading = false
      state.data = null
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getOfferDecisionByApplication.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(getOfferDecisionByApplication.fulfilled, (state, action) => {
        state.loading = false
        state.data = action.payload?.data ?? action.payload ?? null
      })
      .addCase(getOfferDecisionByApplication.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
  },
})

export const { clearOfferDecision } = offerDecisionSlice.actions

