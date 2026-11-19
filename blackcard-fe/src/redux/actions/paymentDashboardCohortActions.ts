import { createAsyncThunk } from '@reduxjs/toolkit';
import { executeApplicationsListFetch } from '@/redux/actions/applicationActions';
import {
    paymentFundedDealsListParams,
    type PaymentFundedDealsListArg,
} from '@/lib/paymentDashboardFunded';

export const fetchPaymentDashboardFundedDeals = createAsyncThunk(
    'paymentDashboardCohort/fetch',
    async (arg: PaymentFundedDealsListArg, { rejectWithValue }) => {
        try {
            return await executeApplicationsListFetch(paymentFundedDealsListParams(arg));
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } }; message?: string };
            return rejectWithValue(
                err.response?.data?.message ||
                    err?.message ||
                    'Failed to load funded deals for payment dashboard',
            );
        }
    },
);
