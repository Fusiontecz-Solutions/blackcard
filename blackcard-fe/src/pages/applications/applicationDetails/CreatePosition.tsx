import { ArrowLeft } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Button } from '@/components/ui/button';
import { useNavigate, useParams } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTheme } from '@/context/ThemeContext';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/redux/store';
import { createPosition, updatePosition, getPositionById } from '@/redux/actions/positionActions';
import { resetCreatePosition, resetUpdatePosition } from '@/redux/slices/positionSlice';
import { useApplicationDetailLoader } from '@/hooks/useApplicationDetailLoader';
import { useEffect, useState } from 'react';
import type { CreatePositionPayload, UpdatePositionPayload } from '@/types/positionTypes';

// Form values type
type PositionFormValues = {
    position: string;
    factorRate: string;
    ach: string;
    percentOfGross: string;
    funder: string;
    paybackAmount: string;
    fundingDate: string;
    activeStatus: boolean;
    fundedAmount: string;
    frequency: string;
    closeDate: string;
    notes: string;
};

// Validation schema
const positionSchema = yup.object({
    position: yup.string().required('Position is required'),
    factorRate: yup.string().required('Factor Rate is required'),
    ach: yup.string().required('ACH is required'),
    percentOfGross: yup.string().required('% of Gross is required'),
    funder: yup.string().required('Funder is required'),
    paybackAmount: yup.string().required('Payback Amount is required'),
    fundingDate: yup.string().required('Funding Date is required'),
    activeStatus: yup.boolean(),
    fundedAmount: yup.string().required('Funded Amount is required'),
    frequency: yup.string().required('Frequency is required'),
    closeDate: yup.string().required('Close Date is required'),
    notes: yup.string(),
});

const defaultFormValues: PositionFormValues = {
    position: '',
    factorRate: '1.49',
    ach: '',
    percentOfGross: '',
    funder: '',
    paybackAmount: '',
    fundingDate: '',
    activeStatus: false,
    fundedAmount: '',
    frequency: '',
    closeDate: '',
    notes: '',
};

// Frequency options
const frequencyOptions = [
    { value: 'Daily', label: 'Daily' },
    { value: 'Weekly', label: 'Weekly' },
    { value: 'Bi-Weekly', label: 'Bi-Weekly' },
    { value: 'Monthly', label: 'Monthly' },
];

const readOnlyValueClass =
    'min-h-10 w-full rounded-[5px] px-3 py-2 text-sm text-[#111827] dark:text-slate-100';

const CreatePosition = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const { applicationId, positionId } = useParams<{ applicationId?: string; positionId?: string }>();
    const location = window.location.pathname;
    const [applicationMongoId, setApplicationMongoId] = useState<string | null>(null);
    const isEditMode = !!positionId && location.includes('/edit-position/');
    const isViewMode = !!positionId && location.includes('/view-position/');
    const [isFormEditing, setIsFormEditing] = useState(!isEditMode && !isViewMode);
    const isReadOnly = isViewMode || (isEditMode && !isFormEditing);
    
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'

    const { loading: createLoading, success: createSuccess, error: createError } = useSelector((state: RootState) => state.createPosition);
    const { loading: updateLoading, success: updateSuccess, error: updateError } = useSelector((state: RootState) => state.updatePosition);
    const { data: positionData, loading: positionLoading } = useSelector((state: RootState) => state.positionDetail);
    const { data: applicationData } = useApplicationDetailLoader(applicationId);

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

    // Fetch position data when in edit or view mode
    useEffect(() => {
        if ((isEditMode || isViewMode) && positionId) {
            dispatch(getPositionById(positionId));
        }
    }, [isEditMode, isViewMode, positionId, dispatch]);

    // Reset position state on mount
    useEffect(() => {
        if (!isEditMode && !isViewMode) {
            dispatch(resetCreatePosition());
        } else if (isEditMode) {
            dispatch(resetUpdatePosition());
        }
    }, [dispatch, isEditMode, isViewMode]);

    // Add mode is always editable; edit mode starts read-only until user clicks Edit.
    useEffect(() => {
        setIsFormEditing(!isEditMode && !isViewMode);
    }, [isEditMode, isViewMode]);

    // Handle successful position creation/update
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
    } = useForm<PositionFormValues>({
        resolver: yupResolver(positionSchema) as any,
        defaultValues: defaultFormValues,
    });

    // Watch funding and close dates and calculate term length in days
    const fundingDateValue = watch('fundingDate');
    const closeDateValue = watch('closeDate');
    const [term_length, setTermLength] = useState<number | null>(null);

    useEffect(() => {
        if (fundingDateValue && closeDateValue) {
            const start = new Date(fundingDateValue);
            const end = new Date(closeDateValue);

            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffMs = end.getTime() - start.getTime();
                const diffDays = Math.abs(Math.round(diffMs / (1000 * 60 * 60 * 24)));

                setTermLength(diffDays);
                console.log('term_length (days):', diffDays);
            } else {
                setTermLength(null);
            }
        } else {
            setTermLength(null);
        }
    }, [fundingDateValue, closeDateValue]);

    // Watch factorRate and fundedAmount to auto-calculate paybackAmount
    const factorRateValue = watch('factorRate');
    const fundedAmountValue = watch('fundedAmount');

    useEffect(() => {
        if (factorRateValue && fundedAmountValue && !isReadOnly) {
            const factorRateNum = parseFloat(factorRateValue);
            const fundedAmountNum = parseFloat(fundedAmountValue);

            if (!isNaN(factorRateNum) && !isNaN(fundedAmountNum) && fundedAmountNum > 0) {
                const paybackAmount = Math.round(factorRateNum * fundedAmountNum);
                setValue('paybackAmount', String(paybackAmount), { shouldValidate: false });
            }
        }
    }, [factorRateValue, fundedAmountValue, setValue, isReadOnly]);

    // --- Date-based ACH: integer payment count, full payback recovered ---
    const paybackAmountValue = watch('paybackAmount');
    const frequencyValue = watch('frequency');

    // Extract avgMonthlyRevenue from application data (client's monthly revenue)
    const avgMonthlyRevenue = (applicationData as any)?.client?.business?.monthlyRevenue
        ? Number((applicationData as any).client.business.monthlyRevenue)
        : null;

    useEffect(() => {
        if (isReadOnly) return;

        const paybackNum = parseFloat(paybackAmountValue);
        if (!paybackAmountValue || isNaN(paybackNum) || paybackNum <= 0) return;
        if (!frequencyValue) return;

        // Step 1 — termDays = difference between closeDate and fundingDate (already in term_length)
        const termDays = term_length ?? 0;
        if (termDays <= 0) return;

        // Step 2 — Integer number of payments based on frequency (no decimals)
        let payments: number;
        switch (frequencyValue) {
            case 'Daily':
                payments = Math.round((termDays / 7) * 5);
                break;
            case 'Weekly':
                payments = Math.floor(termDays / 7);
                break;
            case 'Bi-Weekly':
            case 'BiWeek':
                payments = Math.floor(termDays / 14);
                break;
            case 'Monthly':
                payments = Math.floor(termDays / 30);
                break;
            default:
                return;
        }

        // Step 3 — Safety: at least 1 payment
        payments = Math.max(1, payments);

        // Step 4 & 5 — ACH = paybackAmount / payments, round to whole number
        const ach = paybackNum / payments;
        const achRounded = Math.round(ach);
        setValue('ach', String(achRounded), { shouldValidate: false });

        // Monthly burden for % of Gross (Daily×22, Weekly×4, Bi-Weekly×2, Monthly×1)
        const monthlyMultiplier =
            frequencyValue === 'Daily' ? 22 :
            frequencyValue === 'Weekly' ? 4 :
            frequencyValue === 'Bi-Weekly' || frequencyValue === 'BiWeek' ? 2 :
            frequencyValue === 'Monthly' ? 1 : 0;
        const monthlyBurden = monthlyMultiplier > 0 ? ach * monthlyMultiplier : 0;

        if (avgMonthlyRevenue != null && avgMonthlyRevenue > 0 && monthlyBurden >= 0) {
            const percentOfGross = Math.round((monthlyBurden / avgMonthlyRevenue) * 100);
            setValue('percentOfGross', String(percentOfGross), { shouldValidate: false });
        }
    }, [paybackAmountValue, term_length, frequencyValue, avgMonthlyRevenue, setValue, isReadOnly]);

    // Pre-populate form when position data is loaded (edit or view mode)
    useEffect(() => {
        if ((isEditMode || isViewMode) && positionData) {
            // Get application ID from position data if not in URL
            if (!applicationMongoId && positionData.application) {
                const appId = typeof positionData.application === 'string' 
                    ? positionData.application 
                    : positionData.application._id;
                setApplicationMongoId(appId);
            }

            reset({
                position: positionData.position || '',
                factorRate: positionData.factorRate || '1.49',
                ach: positionData.ach || '',
                percentOfGross: positionData.percentOfGross || '',
                funder: positionData.funder || '',
                paybackAmount: String(positionData.paybackAmount || ''),
                fundingDate: formatDateForInput(positionData.fundingDate),
                activeStatus: positionData.activeStatus || false,
                fundedAmount: String(positionData.fundedAmount || ''),
                frequency: positionData.frequency || '',
                closeDate: formatDateForInput(positionData.closeDate),
                notes: positionData.notes || '',
            });
        }
    }, [isEditMode, positionData, reset, applicationMongoId]);

    const onSubmit = async (data: PositionFormValues) => {
        if (isEditMode) {
            // Update existing position
            if (!positionId) {
                alert('Position ID is required to update a position');
                return;
            }

            const updateData: UpdatePositionPayload = {
                position: data.position,
                factorRate: data.factorRate,
                ach: data.ach,
                percentOfGross: data.percentOfGross,
                funder: data.funder,
                paybackAmount: data.paybackAmount,
                fundingDate: data.fundingDate,
                activeStatus: data.activeStatus,
                fundedAmount: data.fundedAmount,
                frequency: data.frequency,
                closeDate: data.closeDate,
                notes: data.notes || '',
            };

            // Include application if we have it
            if (applicationMongoId) {
                updateData.application = applicationMongoId;
            }

            await dispatch(updatePosition({ id: positionId, data: updateData }));
        } else {
            // Create new position
            if (!applicationMongoId && !applicationId) {
                alert('Application ID is required to create a position');
                return;
            }

            // Use MongoDB _id if available, otherwise try to use the applicationId param as _id
            const appId = applicationMongoId || applicationId;
            if (!appId) {
                alert('Application ID is required to create a position');
                return;
            }

            const positionData: CreatePositionPayload = {
                position: data.position,
                factorRate: data.factorRate,
                ach: data.ach,
                percentOfGross: data.percentOfGross,
                funder: data.funder,
                paybackAmount: data.paybackAmount,
                fundingDate: data.fundingDate,
                activeStatus: data.activeStatus,
                fundedAmount: data.fundedAmount,
                frequency: data.frequency,
                closeDate: data.closeDate,
                notes: data.notes || '',
                application: appId,
            };

            await dispatch(createPosition(positionData));
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
                                {isViewMode ? 'View Position' : isEditMode ? 'Edit Position' : 'Add Position'}
                            </span>
                        </CardContent>
                    </Card>

                    {/* Form Card */}
                    {(isEditMode || isViewMode) && positionLoading ? (
                        <Card className={`rounded-sm box-border shadow-[0px_4px_20px_0px_#00000005] p-0 border ${
                            isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
                        }`}>
                            <CardContent className="flex items-center justify-center py-12 px-6">
                                <p className="text-muted-foreground">Loading position data...</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <form onSubmit={isViewMode ? (e) => e.preventDefault() : handleSubmit(onSubmit)} className="space-y-6">
                        <Card className={`rounded-sm box-border shadow-[0px_4px_20px_0px_#00000005] p-0 border pb-5 ${
                            isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
                        }`}>
                            <CardContent className="space-y-3 p-0">
                                <h2 className={`text-base font-[600] font-roboto px-6 py-3 ${
                                    isDark ? 'text-white bg-[#2A2B2F]' : 'text-[#374151] bg-[#F9FAFD]'
                                }`}>
                                    Position Details
                                </h2>
                                <div className="px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {/* LEFT COLUMN */}
                                    <div className="space-y-4">
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
                                                        {isReadOnly ? (
                                                            <div className={readOnlyValueClass}>{field.value || '-'}</div>
                                                        ) : (
                                                            <Input
                                                                {...field}
                                                                type="text"
                                                                value={field.value ?? ''}
                                                                placeholder="Enter Position"
                                                                className="px-3 py-2 w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                                aria-invalid={!!fieldState.error}
                                                            />
                                                        )}
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Factor Rate */}
                                        <div className="space-y-1.5">
                                           <Label className="text-sm font-[400] font-roboto text-[#374151]">
                                                Factor Rate <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="factorRate"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        {isReadOnly ? (
                                                            <div className={readOnlyValueClass}>{field.value || '-'}</div>
                                                        ) : (
                                                            <Input
                                                                {...field}
                                                                type="text"
                                                                value={field.value ?? ''}
                                                                placeholder="Enter Factor Rate"
                                                                className="px-3 py-2 w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                                aria-invalid={!!fieldState.error}
                                                            />
                                                        )}
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Funding Date */}
                                        <div className="space-y-1.5">
                                           <Label className="text-sm font-[400] font-roboto text-[#374151]">
                                                Funding Date <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="fundingDate"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        {isReadOnly ? (
                                                            <div className={readOnlyValueClass}>{field.value || '-'}</div>
                                                        ) : (
                                                            <Input
                                                                {...field}
                                                                type="date"
                                                                value={field.value ?? ''}
                                                                className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                                aria-invalid={!!fieldState.error}
                                                            />
                                                        )}
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* % of Gross */}
                                        <div className="space-y-1.5">
                                           <Label className="text-sm font-[400] font-roboto text-[#374151]">
                                                % of Gross <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="percentOfGross"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        {isReadOnly ? (
                                                            <div className={readOnlyValueClass}>{field.value || '-'}</div>
                                                        ) : (
                                                            <Input
                                                                {...field}
                                                                type="text"
                                                                value={field.value ?? ''}
                                                                placeholder="Enter % of Gross"
                                                                className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                                aria-invalid={!!fieldState.error}
                                                            />
                                                        )}
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
                                        {/* Funder */}
                                        <div className="space-y-1.5">
                                           <Label className="text-sm font-[400] font-roboto text-[#374151]">
                                                Funder <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="funder"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        {isReadOnly ? (
                                                            <div className={readOnlyValueClass}>{field.value || '-'}</div>
                                                        ) : (
                                                            <Input
                                                                {...field}
                                                                type="text"
                                                                value={field.value ?? ''}
                                                                placeholder="Enter Funder"
                                                                className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                                aria-invalid={!!fieldState.error}
                                                            />
                                                        )}
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Payback Amount */}
                                        <div className="space-y-1.5">
                                           <Label className="text-sm font-[400] font-roboto text-[#374151]">
                                                Payback Amount <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="paybackAmount"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        {isReadOnly ? (
                                                            <div className={readOnlyValueClass}>{field.value || '-'}</div>
                                                        ) : (
                                                            <Input
                                                                {...field}
                                                                type="text"
                                                                value={field.value ?? ''}
                                                                placeholder="Enter Payback Amount"
                                                                className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                                aria-invalid={!!fieldState.error}
                                                            />
                                                        )}
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                                  {/* Close Date */}
                                        <div className="space-y-1.5">
                                           <Label className="text-sm font-[400] font-roboto text-[#374151]">
                                                Close Date <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="closeDate"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        {isReadOnly ? (
                                                            <div className={readOnlyValueClass}>{field.value || '-'}</div>
                                                        ) : (
                                                            <Input
                                                                {...field}
                                                                type="date"
                                                                value={field.value ?? ''}
                                                                className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                                aria-invalid={!!fieldState.error}
                                                            />
                                                        )}
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Active Status - Checkbox */}
                                        <div className="space-y-1.5 mt-12">
                                            <Controller
                                                control={control}
                                                name="activeStatus"
                                                render={({ field }) => (
                                                    isReadOnly ? (
                                                        <div className={readOnlyValueClass}>
                                                            {field.value ? 'Active' : 'Inactive'}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id="activeStatus"
                                                                checked={field.value}
                                                                onCheckedChange={field.onChange}
                                                                className="size-6"
                                                            />
                                                            <Label
                                                                htmlFor="activeStatus"
                                                                className="text-sm font-[400] font-roboto text-[#374151] cursor-pointer"
                                                            >
                                                                Active Status
                                                            </Label>
                                                        </div>
                                                    )
                                                )}
                                            />
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN */}
                                    <div className="space-y-4">
                                        {/* Funded Amount */}
                                        <div className="space-y-1.5">
                                           <Label className="text-sm font-[400] font-roboto text-[#374151]">
                                                Funded Amount <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="fundedAmount"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        {isReadOnly ? (
                                                            <div className={readOnlyValueClass}>{field.value || '-'}</div>
                                                        ) : (
                                                            <Input
                                                                {...field}
                                                                type="text"
                                                                value={field.value ?? ''}
                                                                placeholder="Enter Funded Amount"
                                                                className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                                aria-invalid={!!fieldState.error}
                                                            />
                                                        )}
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* Frequency */}
                                        <div className="space-y-1.5">
                                           <Label className="text-sm font-[400] font-roboto text-[#374151]">
                                                Frequency <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="frequency"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        {isReadOnly ? (
                                                            <div className={readOnlyValueClass}>{field.value || '-'}</div>
                                                        ) : (
                                                            <Select
                                                                onValueChange={field.onChange}
                                                                value={field.value || ''}
                                                            >
                                                                <SelectTrigger className="w-full rounded-[5px] bg-background border border-[#E5E7EB]">
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
                                                        )}
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                        {/* ACH */}
                                        <div className="space-y-1.5">
                                           <Label className="text-sm font-[400] font-roboto text-[#374151]">
                                                ACH <span className="text-red-500">*</span>
                                            </Label>
                                            <Controller
                                                control={control}
                                                name="ach"
                                                render={({ field, fieldState }) => (
                                                    <>
                                                        {isReadOnly ? (
                                                            <div className={readOnlyValueClass}>{field.value || '-'}</div>
                                                        ) : (
                                                            <Input
                                                                {...field}
                                                                type="text"
                                                                value={field.value ?? ''}
                                                                placeholder="Enter ACH"
                                                                className="w-full rounded-[5px] bg-background border border-[#E5E7EB]"
                                                                aria-invalid={!!fieldState.error}
                                                            />
                                                        )}
                                                        {fieldState.error && (
                                                            <p className="text-[13px] text-red-500 mt-1">{fieldState.error.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            />
                                        </div>

                                      
                                    </div>
                                </div>

                                {/* Notes Section */}
                                <div className="px-6 mt-6 space-y-1.5">
                                   <Label className="text-sm font-[400] font-roboto text-[#374151]">
                                        Notes
                                    </Label>
                                    <Controller
                                        control={control}
                                        name="notes"
                                        render={({ field }) => (
                                            isReadOnly ? (
                                                <div className={`${readOnlyValueClass} min-h-[100px] whitespace-pre-wrap`}>
                                                    {field.value || '-'}
                                                </div>
                                            ) : (
                                                <Textarea
                                                    {...field}
                                                    placeholder="Add note here.."
                                                    className="w-full rounded-[5px] bg-background border border-[#E5E7EB] min-h-[100px] resize-none"
                                                />
                                            )
                                        )}
                                    />
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
                                {isEditMode && !isViewMode && !isFormEditing && (
                                    <Button
                                        type="button"
                                        className="px-4 shadow-[0px_0px_0px_1px_#5E5ADB] py-2 gap-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer"
                                        onClick={() => setIsFormEditing(true)}
                                        disabled={positionLoading}
                                    >
                                        Edit
                                    </Button>
                                )}
                                {!isViewMode && (!isEditMode || isFormEditing) && (
                                    <Button
                                        type="submit"
                                        className="px-4 shadow-[0px_0px_0px_1px_#5E5ADB] py-2 gap-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer"
                                        disabled={loading || (!isEditMode && !applicationMongoId) || (isEditMode && positionLoading)}
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

export default CreatePosition;

