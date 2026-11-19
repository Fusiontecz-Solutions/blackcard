import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/redux/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'react-toastify';
import { getApplicationByApplicationId } from '@/redux/actions/applicationActions';
import { fetchUsersByRole } from '@/redux/actions/userActions';
import { createCommissionRequest, getCommissionRequests, getFundedDeals, regenerateCommissionRequest } from '@/redux/actions/commissionRequestActions';

type CommissionRequestFormValues = {
    companyDeal: string;
    date: string;
    applicationId: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email: string;
    fundingAmount: string;
    agentName: string;
    syndicatorId: string;
    commissionPercentage: string;
};

const commissionRequestSchema = yup.object({
    companyDeal: yup.string().required('Company / Deal is required'),
    date: yup.string().required('Date is required'),
    applicationId: yup.string().required('Application ID is required'),
    firstName: yup.string().required('First Name is required'),
    lastName: yup.string().required('Last Name is required'),
    phoneNumber: yup.string().required('Phone Number is required'),
    email: yup.string().email('Invalid email').required('Email is required'),
    fundingAmount: yup
        .number()
        .typeError('Funding Amount must be a number')
        .required('Funding Amount is required'),
    agentName: yup.string().required('Agent Name is required'),
    syndicatorId: yup.string().nullable(),
    commissionPercentage: yup
        .number()
        .typeError('Commission % must be a number')
        .min(0, 'Commission % must be at least 0')
        .max(100, 'Commission % cannot exceed 100')
        .required('Commission % is required'),
});

interface CommissiongenrateRequestProps {
    applicationId?: string | number | null;
    commissionRequestId?: string | null;
    onSuccess?: () => void;
}

export default function CommissiongenrateRequest({ applicationId, commissionRequestId, onSuccess }: CommissiongenrateRequestProps) {
    const dispatch = useDispatch<AppDispatch>();

    const { data: applicationDetail } = useSelector((state: RootState) => state.applicationDetail);
    const { agents } = useSelector((state: RootState) => state.usersByRole);
    const { loading } = useSelector(
        (state: RootState) => state.commissionRequest,
    );
    const loggedInUser = useSelector((state: RootState) => state.login?.data?.user);

    const { control, handleSubmit, setValue } = useForm<CommissionRequestFormValues>({
        resolver: yupResolver(commissionRequestSchema) as any,
        defaultValues: {
            companyDeal: '',
            date: new Date().toISOString().slice(0, 10),
            applicationId: applicationId ? String(applicationId) : '',
            firstName: '',
            lastName: '',
            phoneNumber: '',
            email: '',
            fundingAmount: '',
            agentName:
                [loggedInUser?.firstName, loggedInUser?.lastName].filter(Boolean).join(' ') || '',
            syndicatorId: '',
            commissionPercentage: '',
        },
    });

    // Load initial application details if applicationId is provided
    useEffect(() => {
        if (applicationId) {
            dispatch(getApplicationByApplicationId(applicationId));
        }
    }, [applicationId, dispatch]);

    // When application detail changes, auto-fill fields (if empty)
    useEffect(() => {
        if (!applicationDetail) return;

        const client = (applicationDetail as any).client;
        const businessName = client?.business?.name || '';
        const ownerFirstName = client?.owner?.firstName || '';
        const ownerLastName = client?.owner?.lastName || '';
        const ownerPhone = client?.owner?.mobileNumber || '';
        const ownerEmail = client?.owner?.email || client?.business?.email || '';
        const loanAmount = (applicationDetail as any).loanAmount;

        setValue('companyDeal', businessName);
        setValue('firstName', ownerFirstName);
        setValue('lastName', ownerLastName);
        setValue('phoneNumber', ownerPhone);
        setValue('email', ownerEmail);
        if (loanAmount != null) {
            setValue('fundingAmount', String(loanAmount));
        }
    }, [applicationDetail, setValue]);

    // Load potential syndicators (using AGENT role for now)
    useEffect(() => {
        dispatch(fetchUsersByRole('AGENT'));
    }, [dispatch]);

    const onSubmit = async (values: CommissionRequestFormValues) => {
        const fundingAmountNum = Number(values.fundingAmount);
        const commissionPercentNum = Number(values.commissionPercentage);
        try {
            if (commissionRequestId) {
                // Regenerate existing rejected request
                await dispatch(
                    regenerateCommissionRequest({
                        id: commissionRequestId,
                        commissionPercentage: Number.isNaN(commissionPercentNum)
                            ? 0
                            : commissionPercentNum,
                    }),
                ).unwrap();
                toast.success('Commission request regenerated successfully');
            } else {
                // Create new commission request
                await dispatch(
                    createCommissionRequest({
                        applicationId: values.applicationId,
                        companyDeal: values.companyDeal,
                        date: values.date,
                        firstName: values.firstName,
                        lastName: values.lastName,
                        phoneNumber: values.phoneNumber,
                        email: values.email,
                        fundingAmount: Number.isNaN(fundingAmountNum) ? 0 : fundingAmountNum,
                        syndicatorId: values.syndicatorId || undefined,
                        commissionPercentage: Number.isNaN(commissionPercentNum)
                            ? 0
                            : commissionPercentNum,
                    }),
                ).unwrap();
                toast.success('Commission request created successfully');
            }

            // Refresh commission data so tables/tiles update without reload
            await Promise.all([
                dispatch(getCommissionRequests() as any),
                dispatch(getFundedDeals() as any),
            ]);

            onSuccess?.();
        } catch (error: any) {
            toast.error(
                error?.message ||
                (commissionRequestId
                    ? 'Failed to regenerate commission request'
                    : 'Failed to create commission request'),
            );
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Company / Deal */}
                <div className="space-y-1.5">
                    <Label>Company / Deal</Label>
                    <Controller
                        control={control}
                        name="companyDeal"
                        render={({ field, fieldState }) => (
                            <>
                                <Input {...field} placeholder="Select or enter company / deal" />
                                {fieldState.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>

                {/* Date */}
                <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Controller
                        control={control}
                        name="date"
                        render={({ field, fieldState }) => (
                            <>
                                <Input {...field} type="date" />
                                {fieldState.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>

                {/* Application ID */}
                <div className="space-y-1.5">
                    <Label>Application ID</Label>
                    <Controller
                        control={control}
                        name="applicationId"
                        render={({ field, fieldState }) => (
                            <>
                                <Input
                                    {...field}
                                    placeholder="Enter Application ID"
                                    onBlur={(e) => {
                                        field.onBlur();
                                        const value = e.target.value;
                                        if (value) {
                                            dispatch(getApplicationByApplicationId(value));
                                        }
                                    }}
                                />
                                {fieldState.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>

                {/* Funding Amount (read-only) */}
                <div className="space-y-1.5">
                    <Label>Funding Amount</Label>
                    <Controller
                        control={control}
                        name="fundingAmount"
                        render={({ field, fieldState }) => (
                            <>
                                <Input
                                    {...field}
                                    placeholder="Auto-filled from application"
                                    readOnly
                                />
                                {fieldState.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>

                {/* First Name */}
                <div className="space-y-1.5">
                    <Label>First Name</Label>
                    <Controller
                        control={control}
                        name="firstName"
                        render={({ field, fieldState }) => (
                            <>
                                <Input {...field} placeholder="Enter First Name" />
                                {fieldState.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>

                {/* Last Name */}
                <div className="space-y-1.5">
                    <Label>Last Name</Label>
                    <Controller
                        control={control}
                        name="lastName"
                        render={({ field, fieldState }) => (
                            <>
                                <Input {...field} placeholder="Enter Last Name" />
                                {fieldState.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>

                {/* Phone Number */}
                <div className="space-y-1.5">
                    <Label>Phone Number</Label>
                    <Controller
                        control={control}
                        name="phoneNumber"
                        render={({ field, fieldState }) => (
                            <>
                                <Input {...field} placeholder="Enter Phone Number" />
                                {fieldState.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Controller
                        control={control}
                        name="email"
                        render={({ field, fieldState }) => (
                            <>
                                <Input {...field} placeholder="Enter Email" />
                                {fieldState.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>

                {/* Agent Name (editable) */}
                <div className="space-y-1.5">
                    <Label>Agent Name</Label>
                    <Controller
                        control={control}
                        name="agentName"
                        render={({ field, fieldState }) => (
                            <>
                                <Input {...field} placeholder="Auto-filled from logged-in user" />
                                {fieldState.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>

                {/* Syndicator dropdown */}
                <div className="space-y-1.5">
                    <Label>Syndicator</Label>
                    <Controller
                        control={control}
                        name="syndicatorId"
                        render={({ field }) => (
                            <Select
                                value={field.value || ''}
                                onValueChange={field.onChange}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select Syndicator" />
                                </SelectTrigger>
                                <SelectContent>
                                    {agents.map((user) => {
                                        const id = (user as any)._id ?? (user as any).id;
                                        const name = [user.firstName, user.lastName]
                                            .filter(Boolean)
                                            .join(' ');
                                        return (
                                            <SelectItem key={id} value={id}>
                                                {name || user.email}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        )}
                    />
                </div>

                {/* Commission % */}
                <div className="space-y-1.5">
                    <Label>Commission %</Label>
                    <Controller
                        control={control}
                        name="commissionPercentage"
                        render={({ field, fieldState }) => (
                            <>
                                <Input {...field} placeholder="Enter Commission %" />
                                {fieldState.error && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
                <Button
                    type="submit"
                    className="px-4 py-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90"
                    disabled={loading}
                >
                    {loading ? 'Submitting...' : 'Submit Request'}
                </Button>
            </div>
        </form>
    );
}