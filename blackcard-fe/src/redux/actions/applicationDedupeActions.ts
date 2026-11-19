import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosGet, axiosPost } from '../axios';

export interface DuplicateApplication {
  id: string;
  applicationId: number | null;
  businessName: string | null;
  agentName: string | null;
  submittedAt: string;
  status: string;
  fundedAmount: number | null;
  businessEinNumber?: string | null;
  ownerSsn?: string | null;
  matchWith?: string[];
  isDuplicate?: boolean;
  decision?: string | null;
  hasDecision?: boolean;
  offerAmount?: number | null;
  position?: string | null;
  rate?: number | null;
  term?: string | null;
  frequency?: string | null;
  repayPerPeriod?: number | null;
  monthlyPayment?: number | null;
  fees?: number | null;
  ourRemit?: number | null;
  totalRemit?: number | null;
  refinanceAmount?: number | null;
  notes?: string | null;
  declineReason?: string | null;
  scrubberRecommendation?: string | null;
  underwriterAction?: string | null;
  /**
   * The decision actually recorded on the prior deal, from whichever stage made
   * it (underwriter, then offer, then scrubber). `decision` above stays the
   * offer decision alone, because that is what Apply copies across.
   */
  currentDecision?: string | null;
  currentDecisionStage?: 'underwriter' | 'offer' | 'scrubber' | null;
  /**
   * Why the deal was declined, resolved server-side. Reasons may be encoded in
   * the recommendation, in a marker line in the note, or on the offer decision —
   * only the API can see all three.
   */
  declineReasons?: string[];
}

export const getApplicationDuplicates = createAsyncThunk(
  'applications/getDuplicates',
  async (applicationId: string | number, { rejectWithValue }) => {
    try {
      const response = await axiosGet(`/applications/${applicationId}/duplicates`);
      return response.data;
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Failed to fetch duplicate applications';
      console.error('Get duplicate applications error:', message, error.response?.data);
      return rejectWithValue(message);
    }
  }
);

export const applyDuplicateDecision = createAsyncThunk(
  'applications/applyDuplicateDecision',
  async (
    payload: { applicationId: string | number; sourceApplicationId: string },
    { rejectWithValue },
  ) => {
    try {
      const response = await axiosPost(
        `/applications/${payload.applicationId}/apply-duplicate-decision`,
        { sourceApplicationId: payload.sourceApplicationId },
      );
      return response.data;
    } catch (error: any) {
      const message =
        error.response?.data?.message || error.message || 'Failed to apply duplicate decision';
      console.error('Apply duplicate decision error:', message, error.response?.data);
      return rejectWithValue(message);
    }
  },
);

