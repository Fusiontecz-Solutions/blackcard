import { ArrowLeft } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Button } from '@/components/ui/button';
import { useNavigate, useParams } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTheme } from '@/context/ThemeContext';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/redux/store';
import { createTermsOffer, updateTermsOffer, getTermsOfferById } from '@/redux/actions/termsOfferActions';
import { resetCreateTermsOffer, resetUpdateTermsOffer } from '@/redux/slices/termsOfferSlice';
import { useApplicationDetailLoader } from '@/hooks/useApplicationDetailLoader';
import { useEffect, useState } from 'react';
import type { CreateTermsOfferPayload, UpdateTermsOfferPayload } from '@/types/termsOfferTypes';
import { getPositions } from '@/redux/actions/positionActions';
import { formatCurrency } from '@/lib/utils';

// Form values type
type TermsOfferFormValues = {
    approvedAmount: number | string;
    factorRate: number | string;
    paybackAmount: number | string;
    numberOfPayments: number | string;
    offerExpiryDate: string;
    termLength: number | string;
    commissionPercent: number | string;
    paymentAmount: number | string;
    percentOfGross: number | string;
    frequency: string;
    buyRate: number | string;
    commissionAmount: number | string;
    position: string;
    paymentSchedule: string;
    paymentDays: string[]; // Array of selected days
};

// Validation schema
const termsOfferSchema = yup.object({
    approvedAmount: yup.number().min(0).required('Approved amount is required').nullable().transform((value, originalValue) => originalValue === '' ? null : value),
    factorRate: yup.number().min(0).required('Factor rate is required').nullable().transform((value, originalValue) => originalValue === '' ? null : value),
    paybackAmount: yup.number().min(0).required('Payback amount is required').nullable().transform((value, originalValue) => originalValue === '' ? null : value),
    numberOfPayments: yup.number().min(1, 'Must be at least 1').required('Number of payments is required').nullable().transform((value, originalValue) => originalValue === '' ? null : value),
    offerExpiryDate: yup.string().required('Offer expiry date is required'),
    termLength: yup.number().min(0).required('Term length is required').nullable().transform((value, originalValue) => originalValue === '' ? null : value),
    commissionPercent: yup.number().min(0).max(100).required('Commission percent is required').nullable().transform((value, originalValue) => originalValue === '' ? null : value),
    paymentAmount: yup.number().min(0).required('Payment amount is required').nullable().transform((value, originalValue) => originalValue === '' ? null : value),
    percentOfGross: yup.number().min(0).max(100).required('% of Gross is required').nullable().transform((value, originalValue) => originalValue === '' ? null : value),
    frequency: yup.string().required('Frequency is required'),
    buyRate: yup.number().min(0).required('Buy rate is required').nullable().transform((value, originalValue) => originalValue === '' ? null : value),
    commissionAmount: yup.number().min(0).required('Commission amount is required').nullable().transform((value, originalValue) => originalValue === '' ? null : value),
    position: yup.string().required('Position is required'),
    paymentSchedule: yup.string().required('Payment schedule is required'),
    paymentDays: yup.array().of(yup.string()).min(1, 'At least one payment day must be selected'),
});

const defaultFormValues: TermsOfferFormValues = {
    approvedAmount: '',
    factorRate: '',
    paybackAmount: '',
    numberOfPayments: '',
    offerExpiryDate: '',
    termLength: '',
    commissionPercent: '',
    paymentAmount: '',
    percentOfGross: '',
    frequency: '',
    buyRate: '',
    commissionAmount: '',
    position: '',
    paymentSchedule: '',
    paymentDays: [],
};

// Frequency options
const frequencyOptions = [
    { value: 'Daily', label: 'Daily' },
    { value: 'Weekly', label: 'Weekly' },
    { value: 'Bi-Weekly', label: 'Bi-Weekly' },
    { value: 'Monthly', label: 'Monthly' },
];

// Position options
const positionOptions = [
    { value: '1st', label: '1st' },
    { value: '2nd', label: '2nd' },
    { value: '3rd', label: '3rd' },
];

// Payment schedule options
const paymentScheduleOptions = [
    { value: 'Daily', label: 'Daily' },
    { value: 'Weekly', label: 'Weekly' },
    { value: 'Monthly', label: 'Monthly' },
];

// Payment days
const paymentDaysOptions = [
    { value: 'Monday', label: 'Monday' },
    { value: 'Tuesday', label: 'Tuesday' },
    { value: 'Wednesday', label: 'Wednesday' },
    { value: 'Thursday', label: 'Thursday' },
    { value: 'Friday', label: 'Friday' },
];

const CreateTermsOffer = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const { applicationId, termsOfferId } = useParams<{ applicationId?: string; termsOfferId?: string }>();
    const location = window.location.pathname;
    const [applicationMongoId, setApplicationMongoId] = useState<string | null>(null);
    const isEditMode = !!termsOfferId && location.includes('/edit-terms-offer/');
    const isViewMode = !!termsOfferId && location.includes('/view-terms-offer/');
    const isReadOnly = isViewMode;
        
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'

    const { loading: createLoading, success: createSuccess, error: createError } = useSelector((state: RootState) => state.createTermsOffer);
    const { loading: updateLoading, success: updateSuccess, error: updateError } = useSelector((state: RootState) => state.updateTermsOffer);
    const { data: termsOfferData, loading: termsOfferLoading } = useSelector((state: RootState) => state.termsOfferDetail);
    const { data: applicationData } = useApplicationDetailLoader(applicationId);
    const positionsState = useSelector((state: RootState) => state.positions);

    // Use appropriate loading/success/error based on mode
    const loading = isEditMode ? updateLoading : createLoading;
    const success = isEditMode ? updateSuccess : createSuccess;
    const error = isEditMode ? updateError : createError;

    // Set application MongoDB _id when application data is loaded
    useEffect(() => {
        if (applicationData?._id) {
            setApplicationMongoId(applicationData._id);
        }
    }, [applicationData]);

    // Fetch positions for this application (used for MCA stacking calculations)
    const applicationIdentifier = (applicationData as any)?._id ?? applicationId;
    useEffect(() => {
        if (applicationIdentifier) {
            dispatch(getPositions({ application: applicationIdentifier }));
        }
    }, [applicationIdentifier, dispatch]);

    // Fetch terms offer data when in edit or view mode
    useEffect(() => {
        if ((isEditMode || isViewMode) && termsOfferId) {
            dispatch(getTermsOfferById(termsOfferId));
        }
    }, [isEditMode, isViewMode, termsOfferId, dispatch]);

    // Reset terms offer state on mount
    useEffect(() => {
        if (!isEditMode && !isViewMode) {
            dispatch(resetCreateTermsOffer());
        } else if (isEditMode) {
            dispatch(resetUpdateTermsOffer());
        }
    }, [dispatch, isEditMode, isViewMode]);

    // Handle successful terms offer creation/update
    useEffect(() => {
        if (success) {
            if (applicationId) {
                navigate(`/application-details/${applicationId}`);
            } else {
                navigate(-1);
            }
        }
    }, [success, applicationId, navigate]);

    // Format date for input field (YYYY-MM-DD)
    const formatDateForInput = (date: string | Date | undefined): string => {
        if (!date) return '';
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(dateObj.getTime())) return '';
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const {
        control,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors },
    } = useForm<TermsOfferFormValues>({
        resolver: yupResolver(termsOfferSchema) as any,
        defaultValues: defaultFormValues,
    });

    // --- Auto-calculation: watched fields ---
    const approvedAmountRaw = watch('approvedAmount');
    const factorRateRaw = watch('factorRate');
    const termLengthRaw = watch('termLength');
    const frequencyValue = watch('frequency');
    const commissionPercentRaw = watch('commissionPercent');

    // Numeric helpers (form may store string or number)
    const toNum = (v: unknown): number => (v === '' || v == null ? 0 : Number(v));
    const approvedAmount = toNum(approvedAmountRaw);
    const factorRate = toNum(factorRateRaw);
    const termLength = toNum(termLengthRaw);
    const commissionPercent = toNum(commissionPercentRaw);

    // Extract client's monthly revenue (for MCA % of Gross calculations)
    const avgMonthlyRevenue =
        (applicationData as any)?.client?.business?.monthlyRevenue != null &&
        (applicationData as any).client.business.monthlyRevenue !== ''
            ? Number((applicationData as any).client.business.monthlyRevenue)
            : null;

    // Local state to expose MCA stacking metrics in the UI
    const [stackMetrics, setStackMetrics] = useState({
        newGross: '',
        stackGross: '',
        existingBurden: '',
        newMonthlyBurden: '',
    });

    // Reference constants for payment count (monthly model)
    const DAYS_IN_MONTH = 22;   // business days per month
    const WEEKS_IN_MONTH = 4;

    // 1) Payback Amount = Approved Amount × Factor Rate
    useEffect(() => {
        if (isReadOnly) return;
        if (!approvedAmount || approvedAmount <= 0 || !factorRate || factorRate <= 0) {
            setValue('paybackAmount', '', { shouldValidate: false });
            return;
        }
        const payback = Math.round(approvedAmount * factorRate);
        setValue('paybackAmount', String(payback), { shouldValidate: false });
    }, [approvedAmount, factorRate, setValue, isReadOnly]);

    // 2) Commission Amount = Approved Amount × (Commission Percent / 100)
    useEffect(() => {
        if (isReadOnly) return;
        if (!approvedAmount || approvedAmount <= 0 || !commissionPercent) {
            setValue('commissionAmount', '', { shouldValidate: false });
            return;
        }
        const commission = Math.round(approvedAmount * (commissionPercent / 100));
        setValue('commissionAmount', String(commission), { shouldValidate: false });
    }, [approvedAmount, commissionPercent, setValue, isReadOnly]);

    // 3) Number of Payments = f(termLength, frequency)
    useEffect(() => {
        if (isReadOnly) return;
        if (!termLength || termLength <= 0 || !frequencyValue) {
            setValue('numberOfPayments', '', { shouldValidate: false });
            return;
        }
        let numPayments: number;
        switch (frequencyValue) {
            case 'Daily':
                numPayments = Math.round(termLength * DAYS_IN_MONTH);
                break;
            case 'Weekly':
                numPayments = Math.round(termLength * WEEKS_IN_MONTH);
                break;
            case 'Bi-Weekly':
                numPayments = Math.round(termLength * (WEEKS_IN_MONTH / 2));
                break;
            case 'Monthly':
                numPayments = Math.round(termLength * 1);
                break;
            default:
                setValue('numberOfPayments', '', { shouldValidate: false });
                return;
        }
        numPayments = Math.max(1, numPayments);
        setValue('numberOfPayments', String(numPayments), { shouldValidate: false });
    }, [termLength, frequencyValue, setValue, isReadOnly]);

    // 4) Payment Amount (ACH) = Payback Amount / Number of Payments
    const paybackAmountRaw = watch('paybackAmount');
    const numberOfPaymentsRaw = watch('numberOfPayments');
    const paybackAmount = toNum(paybackAmountRaw);
    const numberOfPayments = toNum(numberOfPaymentsRaw);

    useEffect(() => {
        if (isReadOnly) return;
        if (!paybackAmount || paybackAmount <= 0 || !numberOfPayments || numberOfPayments <= 0) {
            setValue('paymentAmount', '', { shouldValidate: false });
            setValue('paymentSchedule', '', { shouldValidate: false });
            return;
        }
        const payment = Math.round(paybackAmount / numberOfPayments);
        const paymentStr = String(payment);
        setValue('paymentAmount', paymentStr, { shouldValidate: false });
        setValue('paymentSchedule', `${numberOfPayments} payments at ${formatCurrency(payment)}`, { shouldValidate: false });
    }, [paybackAmount, numberOfPayments, setValue, isReadOnly]);

    // 5) Dynamic MCA Gross % with stacking support
    const paymentAmountRaw = watch('paymentAmount');
    const paymentAmount = toNum(paymentAmountRaw);

    useEffect(() => {
        if (isReadOnly) return;

        // Helper to map ACH frequency to a monthly multiplier
        const getMonthlyMultiplier = (freq: string | undefined | null): number => {
            switch (freq) {
                case 'Daily':
                    return 22;
                case 'Weekly':
                    return 4;
                case 'Bi-Weekly':
                case 'BiWeek':
                    return 2;
                case 'Monthly':
                    return 1;
                default:
                    return 0;
            }
        };

        const monthlyRevenue = avgMonthlyRevenue ?? 0;

        // 3) Existing Positions — sum monthly burdens for all active positions
        const activeAppId = applicationIdentifier;
        const scopedPositions =
            activeAppId &&
            positionsState.currentApplicationId === activeAppId &&
            Array.isArray(positionsState.data)
                ? positionsState.data
                : [];
        const activePositions = scopedPositions.filter((pos: any) => pos?.activeStatus);

        const existingBurdenValue = activePositions.reduce((sum: number, pos: any) => {
            const achRaw = pos?.ach;
            const achNum = achRaw != null && achRaw !== '' ? Number(achRaw) : 0;
            if (!achNum || isNaN(achNum)) return sum;

            const multiplier = getMonthlyMultiplier(pos?.frequency);
            if (!multiplier) return sum;

            return sum + achNum * multiplier;
        }, 0);

        // 4) New Terms Offer — ACH paymentAmount with its frequency
        const newMultiplier = getMonthlyMultiplier(frequencyValue);
        const newMonthlyBurdenValue =
            paymentAmount > 0 && newMultiplier > 0 ? paymentAmount * newMultiplier : 0;

        // Edge case: if monthlyRevenue = 0 → return 0 (but still expose burdens)
        if (monthlyRevenue <= 0) {
            setValue('percentOfGross', '0', { shouldValidate: false });
            setStackMetrics({
                newGross: '0',
                stackGross: '0',
                existingBurden: String(Math.round(existingBurdenValue)),
                newMonthlyBurden: String(Math.round(newMonthlyBurdenValue)),
            });
            return;
        }

        // 5) % of Gross for NEW position
        const newGrossValue = (newMonthlyBurdenValue / monthlyRevenue) * 100;

        // 6) Total Stack Gross (existing + new)
        const stackGrossValue =
            ((existingBurdenValue + newMonthlyBurdenValue) / monthlyRevenue) * 100;

        const newGrossStr = Number.isFinite(newGrossValue)
            ? String(Math.round(newGrossValue))
            : '0';
        const stackGrossStr = Number.isFinite(stackGrossValue)
            ? String(Math.round(stackGrossValue))
            : '0';

        // Persist NEW position % of Gross in the form field
        setValue('percentOfGross', newGrossStr, { shouldValidate: false });

        // Expose all requested values for the UI
        setStackMetrics({
            newGross: newGrossStr,
            stackGross: stackGrossStr,
            existingBurden: String(Math.round(existingBurdenValue)),
            newMonthlyBurden: String(Math.round(newMonthlyBurdenValue)),
        });
    }, [isReadOnly, avgMonthlyRevenue, paymentAmount, frequencyValue, positionsState, applicationIdentifier, setValue]);

    // 6) Payment Days: Daily => all days; otherwise default Monday
    useEffect(() => {
        if (isReadOnly) return;
        if (!frequencyValue) return;
        if (frequencyValue === 'Daily') {
            setValue('paymentDays', [...paymentDaysOptions.map((d) => d.value)], { shouldValidate: false });
        } else {
            setValue('paymentDays', ['Monday'], { shouldValidate: false });
        }
    }, [frequencyValue, setValue, isReadOnly]);

    // Pre-populate form when terms offer data is loaded (edit or view mode)
    useEffect(() => {
        if ((isEditMode || isViewMode) && termsOfferData) {
            // Get application ID from terms offer data if not in URL
            if (!applicationMongoId && termsOfferData.application) {
                const appId = typeof termsOfferData.application === 'string' 
                    ? termsOfferData.application 
                    : termsOfferData.application._id;
                setApplicationMongoId(appId);
            }

            reset({
                approvedAmount: String(termsOfferData.approvedAmount || ''),
                factorRate: String(termsOfferData.factorRate || ''),
                paybackAmount: String(termsOfferData.paybackAmount || ''),
                numberOfPayments: String(termsOfferData.numberOfPayments || ''),
                offerExpiryDate: formatDateForInput(termsOfferData.offerExpiryDate),
                termLength: String(termsOfferData.termLength || ''),
                commissionPercent: String(termsOfferData.commissionPercent || ''),
                paymentAmount: String(termsOfferData.paymentAmount || ''),
                percentOfGross: String(termsOfferData.percentOfGross || ''),
                frequency: termsOfferData.frequency || '',
                buyRate: String(termsOfferData.buyRate || ''),
                commissionAmount: String(termsOfferData.commissionAmount || ''),
                position: termsOfferData.position || '',
                paymentSchedule: termsOfferData.paymentSchedule || '',
                paymentDays: termsOfferData.paymentDays || [],
            });
        }
    }, [isEditMode, isViewMode, termsOfferData, reset, applicationMongoId]);

    const onSubmit = async (data: TermsOfferFormValues) => {
        if (isEditMode) {
            // Update existing terms offer
            if (!termsOfferId) {
                alert('Terms Offer ID is required to update a terms offer');
                return;
            }

            const updateData: UpdateTermsOfferPayload = {
                approvedAmount: data.approvedAmount,
                factorRate: data.factorRate,
                paybackAmount: data.paybackAmount,
                numberOfPayments: data.numberOfPayments,
                offerExpiryDate: data.offerExpiryDate,
                termLength: data.termLength,
                commissionPercent: data.commissionPercent,
                paymentAmount: data.paymentAmount,
                percentOfGross: data.percentOfGross,
                frequency: data.frequency,
                buyRate: data.buyRate,
                commissionAmount: data.commissionAmount,
                position: data.position,
                paymentSchedule: data.paymentSchedule,
                paymentDays: data.paymentDays,
            };

            // Include application if we have it
            if (applicationMongoId) {
                updateData.application = applicationMongoId;
            }

            await dispatch(updateTermsOffer({ id: termsOfferId, data: updateData }));
        } else {
            // Create new terms offer
            if (!applicationMongoId && !applicationId) {
                alert('Application ID is required to create a terms offer');
                return;
            }

            // Use MongoDB _id if available, otherwise try to use the applicationId param as _id
            const appId = applicationMongoId || applicationId;
            if (!appId) {
                alert('Application ID is required to create a terms offer');
                return;
            }

            const termsOfferData: CreateTermsOfferPayload = {
                approvedAmount: data.approvedAmount,
                factorRate: data.factorRate,
                paybackAmount: data.paybackAmount,
                numberOfPayments: data.numberOfPayments,
                offerExpiryDate: data.offerExpiryDate,
                termLength: data.termLength,
                commissionPercent: data.commissionPercent,
                paymentAmount: data.paymentAmount,
                percentOfGross: data.percentOfGross,
                frequency: data.frequency,
                buyRate: data.buyRate,
                commissionAmount: data.commissionAmount,
                position: data.position,
                paymentSchedule: data.paymentSchedule,
                paymentDays: data.paymentDays,
                application: appId,
            };

            await dispatch(createTermsOffer(termsOfferData));
        }
    };

    const handleCancel = () => {
        if (applicationId) {
            navigate(`/application-details/${applicationId}`);
        } else {
            navigate(-1);
        }
    };

    return (
        <div className="min-h-[calc(100vh-64px)] w-full bg-background p-4 md:p-6 lg:p-8">
            <div className="w-full mx-auto">
                <div className="space-y-6">
                    {/* Title Card */}
                    <Card className={`flex justify-between px-2 py-3 rounded-lg shadow-[0px_4px_20px_0px_#00000005] ${
                        isDark ? 'bg-[#141517]' : 'bg-white'
                    }`}>
                        <CardContent className="flex items-center gap-3 px-0">
                            <Button
                                onClick={handleCancel}
                                variant="ghost"
                                className="h-10 gap-2 px-0 py-0 bg-card text-muted-foreground hover:bg-accent cursor-pointer"
                            >
                                <ArrowLeft className={`size-5 ${isDark ? 'text-white' : 'text-[#111827]'}`} />
                            </Button>
                            <span className={`text-[1.1rem] font-semibold font-roboto ${isDark ? 'text-white' : 'text-[#111827]'}`}>
                                {isViewMode ? 'View Terms Offer' : isEditMode ? 'Edit Terms Offer' : 'Create New Terms Offer'}
                            </span>
                        </CardContent>
                    </Card>

                    {/* Form Card */}
                    {(isEditMode || isViewMode) && termsOfferLoading ? (
                        <Card className={`rounded-sm box-border shadow-[0px_4px_20px_0px_#00000005] p-0 border ${
                            isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
                        }`}>
                            <CardContent className="flex items-center justify-center py-12 px-6">
                                <p className="text-muted-foreground">Loading terms offer data...</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <form onSubmit={isViewMode ? (e) => e.preventDefault() : handleSubmit(onSubmit)} className="space-y-6">
                        <Card className={`rounded-sm box-border shadow-[0px_4px_20px_0px_#00000005] p-0 border pb-5 ${
                            isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
                        }`}>
                            <CardContent className="space-y-1.5 p-0">
                                <h2 className={`text-base font-[600] font-roboto px-6 py-3 ${
                                    isDark ? 'text-white bg-[#2A2B2F]' : 'text-[#374151] bg-[#F9FAFD]'
                                }`}>
                                    Terms Offer
                                </h2>
                                <div className="px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {/* LEFT COLUMN */}
                                    <div className="space-y-4">
                                        {/* Approved amount */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Approved amount <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="approvedAmount"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="text"
                                                            value={field.value ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                field.onChange(value === '' ? '' : value);
                                                            }}
                                                            placeholder="Enter Approved Amount"
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Factor Rate */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Factor Rate <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="factorRate"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="text"
                                                            value={field.value ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                field.onChange(value === '' ? '' : value);
                                                            }}
                                                            placeholder="Enter Factor Rate"
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Payback amount */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Payback amount <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="paybackAmount"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="text"
                                                            value={field.value ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                field.onChange(value === '' ? '' : value);
                                                            }}
                                                            placeholder="Enter Payback Amount"
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Number of Payments */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Number of Payments <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="numberOfPayments"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="text"
                                                            value={field.value ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                field.onChange(value === '' ? '' : value);
                                                            }}
                                                            placeholder="Enter Number of Payments"
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Offer Expiry Date */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Offer Expiry Date <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="offerExpiryDate"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="date"
                                                            value={field.value ?? ''}
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>
                                    </div>

                                    {/* MIDDLE COLUMN */}
                                    <div className="space-y-4">
                                        {/* Term Length */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Term Length <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="termLength"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="text"
                                                            value={field.value ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                field.onChange(value === '' ? '' : value);
                                                            }}
                                                            placeholder="Enter Term Length"
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Commission Percent */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Commission Percent <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="commissionPercent"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="text"
                                                            value={field.value ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                field.onChange(value === '' ? '' : value);
                                                            }}
                                                            placeholder="Enter Commission Percent"
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Payment Amount */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Payment Amount <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="paymentAmount"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="text"
                                                            value={field.value ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                field.onChange(value === '' ? '' : value);
                                                            }}
                                                            placeholder="Enter Payment Amount"
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* % of Gross */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                % of Gross <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="percentOfGross"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="text"
                                                            value={field.value ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                field.onChange(value === '' ? '' : value);
                                                            }}
                                                            placeholder="Enter % of Gross"
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                        {!isReadOnly && stackMetrics.newGross !== '' && (
                                                            <p className="text-[12px] text-muted-foreground mt-1">
                                                                New MCA Gross: {stackMetrics.newGross}% | Stack Gross: {stackMetrics.stackGross}% | Existing Monthly Burden: ${stackMetrics.existingBurden} | New Monthly Burden: ${stackMetrics.newMonthlyBurden}
                                                            </p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Frequency */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Frequency <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="frequency"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value || ''}
                                                            disabled={isReadOnly}
                                                        >
                                                            <SelectTrigger className="w-full rounded-[5px] bg-background border border-[#E5E7EB]" disabled={isReadOnly}>
                                                                <SelectValue placeholder="Select Frequency" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {frequencyOptions.map((option) => (
                                                                    <SelectItem key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN */}
                                    <div className="space-y-4">
                                        {/* Buy Rate */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Buy Rate <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="buyRate"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="text"
                                                            value={field.value ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                field.onChange(value === '' ? '' : value);
                                                            }}
                                                            placeholder="Enter Buy Rate"
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Commission Amount */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Commission Amount <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="commissionAmount"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Input
                                                            {...field}
                                                            type="text"
                                                            value={field.value ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                field.onChange(value === '' ? '' : value);
                                                            }}
                                                            placeholder="Enter Commission Amount"
                                                            className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                            aria-invalid={!!fieldState.error}
                                                            disabled={isReadOnly}
                                                        />
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Position */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Position <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="position"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value || ''}
                                                            disabled={isReadOnly}
                                                        >
                                                            <SelectTrigger className="w-full rounded-[5px] bg-background border border-[#E5E7EB]" disabled={isReadOnly}>
                                                                <SelectValue placeholder="Select Position" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {positionOptions.map((option) => (
                                                                    <SelectItem key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Payment Schedule */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Payment Schedule <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="paymentSchedule"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value || ''}
                                                            disabled={isReadOnly}
                                                        >
                                                            <SelectTrigger className="w-full rounded-[5px] bg-background border border-[#E5E7EB]" disabled={isReadOnly}>
                                                                <SelectValue placeholder="Select Payment Schedule" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {paymentScheduleOptions.map((option) => (
                                                                    <SelectItem key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Payment Days - Checkbox Group */}
                                        <div className="space-y-1.5">
                                            <Label className={`text-sm font-[400] font-roboto ${isDark ? 'text-white' : 'text-[#374151]'}`}>
                                                Payment Days <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="paymentDays"
                                                render={({ field }) => (
                                                    <>
                                                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                                                            {paymentDaysOptions.map((day) => (
                                                                <div key={day.value} className="flex items-center space-x-2">
                                                                    <Checkbox
                                                                        checked={field.value?.includes(day.value)}
                                                                        onCheckedChange={(checked: boolean | "indeterminate") => {
                                                                            if (!isReadOnly) {
                                                                                const currentValue = field.value || [];
                                                                                if (checked) {
                                                                                    field.onChange([...currentValue, day.value]);
                                                                                } else {
                                                                                    field.onChange(currentValue.filter((d: string) => d !== day.value));
                                                                                }
                                                                            }
                                                                        }}
                                                                        disabled={isReadOnly}
                                                                    />
                                                                    <Label className={`text-sm font-normal text-[#374151] cursor-pointer ${isDark ? 'text-gray-300' : 'text-[#374151]'}`}>
                                                                        {day.label}
                                                                    </Label>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {errors.paymentDays && (
                                                            <p className="text-[13px] text-red-500 mt-1">
                                                                {errors.paymentDays.message}
                                                            </p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                            {/* Error Message */}
                            {error && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                                    <p className="text-sm text-red-600">{error}</p>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="px-4 py-2 gap-2 border border-[var(--brand)] text-[var(--brand)] bg-transparent cursor-pointer shadow-[0px_1px_1px_0px_#0000001A] hover:bg-transparent hover:text-[var(--brand)]/90"
                                    onClick={handleCancel}
                                    disabled={loading}
                                >
                                    {isViewMode ? 'Close' : 'Cancel'}
                                </Button>
                                {!isViewMode && (
                                    <Button
                                        type="submit"
                                        className="px-4 shadow-[0px_0px_0px_1px_#5E5ADB] py-2 gap-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer"
                                        disabled={loading || (!isEditMode && !applicationMongoId) || (isEditMode && termsOfferLoading)}
                                    >
                                        {loading ? (isEditMode ? 'Updating...' : 'Submitting...') : (isEditMode ? 'Update' : 'Submit')}
                                    </Button>
                                )}
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreateTermsOffer;

