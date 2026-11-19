import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { Upload, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useRef, useState, useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { useSelector, useDispatch } from "react-redux";
import type { RootState, AppDispatch } from "@/redux/store";
import type { user } from "@/redux/slices/authSlice";
import type { ApplicationFiles } from "@/types/applicationTypes";
import { getPositions } from "@/redux/actions/positionActions";
import { resetDeletePosition } from "@/redux/slices/positionSlice";
import { getTermsOffers } from "@/redux/actions/termsOfferActions";
import { getMonths } from "@/redux/actions/monthActions";
import { getTransactions } from "@/redux/actions/transactionActions";
import { uploadApplicationDocuments, getApplicationById, getApplicationByApplicationId, updateApplicationDocumentChecklist } from "@/redux/actions/applicationActions";
import { resetUploadDocuments } from "@/redux/slices/applicationSlice";
// import MonthlyTransactions, { type MonthlyTransactionData } from "./MonthlyTransactions";
import BankAnalysisTable from "./BankAnalysisTable";
import { useTheme } from "@/context/ThemeContext";
import { toast } from "react-toastify";
// import { formatCurrency } from "@/lib/utils";
import Swal from "sweetalert2";
import PDFViewerDocsModal from "./PDFViewerDocsModal";

// Yup validation schema
const uploadSchema = yup.object({
    uploadedFile: yup.mixed().required("Please upload a document."),
});

interface UploadFormData {
    uploadedFile: File | null;
}

// Document list: provide with contract
const provideWithContract = [
    { label: "Void Check" },
    { label: "Driver's License" },
];

// Document list: company will handle
const companyWillHandle = [
    { label: "Merchant Interview" },
    { label: "Decision Logic/Bank Login" },
    { label: "Most Recent Bank Statement and MTD for 6010" },
    { label: "Most Recent Bank Statement and MTD for 5181" },
    { label: "Most Recent Bank Statement and MTD for 6536" },
];

// // Helper function to format currency (no decimals, with comma grouping)
// const formatCurrency = (value: number | string | undefined): string => {
//     if (!value) return "-";
//     if (typeof value === 'string') {
//         // If already formatted, return as is
//         if (value.includes('$')) return value;
//         const num = parseFloat(value);
//         return isNaN(num) ? "-" : formatCurrencyUtil(num);
//     }
//     return formatCurrencyUtil(value);
// };

// Helper function to normalize category names for matching
// const normalizeCategory = (category: string): string => {
//     if (!category) return "";
//     const normalized = category.toLowerCase().trim();
//     // Map various category name formats to standard names
//     if (normalized === 'transfer' || normalized.includes('transfer')) return 'Transfer';
//     if (normalized === 'total credits' || normalized.includes('total credit')) return 'Total Credits';
//     if (normalized === 'non business' || normalized.includes('non business') || normalized.includes('nonbusiness')) return 'Non Business';
//     if (normalized === 'business' || (normalized.includes('business') && !normalized.includes('non'))) return 'Business';
//     if (normalized === 'funding' || normalized.includes('funding')) return 'Funding';
//     if (normalized === 'other' || normalized.includes('other')) return 'Other';
//     return category; // Return original if no match
// };

// Helper function to calculate bank analysis data from actual transactions
// const calculateBankAnalysisData = (
//     monthsData: any[],
//     transactionsData: Record<string, any[]>
// ): Array<{
//     month: string;
//     totalCredit: string;
//     transfers: string;
//     nonBusiness: string;
//     funding: string;
//     others: string;
//     netCredit: string;
//     trend: "up" | "down" | null;
// }> => {
//     if (!monthsData || !Array.isArray(monthsData) || monthsData.length === 0) {
//         return [];
//     }

//     // Sort months by date (ascending)
//     const sortedMonths = [...monthsData].sort((a, b) => {
//         const dateA = a.date ? new Date(a.date).getTime() : 0;
//         const dateB = b.date ? new Date(b.date).getTime() : 0;
//         return dateA - dateB;
//     });

//     const monthAbbreviations: Record<string, string> = {
//         'january': 'Jan', 'february': 'Feb', 'march': 'Mar', 'april': 'Apr',
//         'may': 'May', 'june': 'Jun', 'july': 'Jul', 'august': 'Aug',
//         'september': 'Sep', 'october': 'Oct', 'november': 'Nov', 'december': 'Dec'
//     };

//     const analysisData = sortedMonths.map((month, index) => {
//         const monthTransactions = transactionsData[month._id] || [];

//         // Initialize category totals
//         let totalCredits = 0;
//         let transfers = 0;
//         let nonBusiness = 0;
//         let funding = 0;
//         let others = 0;

//         // 1) If user filled the month-level amount in Bank Analysis, treat it as Total Credits
//         const parsedMonthAmount = typeof month.amount === 'number'
//             ? month.amount
//             : (typeof month.amount === 'string'
//                 ? parseFloat(String(month.amount).replace(/[^0-9.-]+/g, '')) || 0
//                 : 0);

//         if (parsedMonthAmount > 0) {
//             totalCredits = parsedMonthAmount;
//         }

//         // 2) Sum transactions by category (used for breakdown and as fallback when month.amount is not set)
//         monthTransactions.forEach((transaction: any) => {
//             const amount = typeof transaction.amount === 'number' 
//                 ? transaction.amount 
//                 : (typeof transaction.amount === 'string' 
//                     ? parseFloat(transaction.amount.replace(/[^0-9.-]+/g, '')) || 0 
//                     : 0);

//             const category = normalizeCategory(transaction.category || '');

//             if (category === 'Total Credits') {
//                 // If month.amount is set, prefer that as Total Credits; still include this in breakdown
//                 if (parsedMonthAmount <= 0) {
//                     totalCredits += amount;
//                 }
//             } else if (category === 'Transfer') {
//                 transfers += amount;
//             } else if (category === 'Non Business') {
//                 nonBusiness += amount;
//             } else if (category === 'Funding') {
//                 funding += amount;
//             } else if (category === 'Other') {
//                 others += amount;
//             } else if (amount > 0) {
//                 // If category doesn't match, add to others
//                 others += amount;
//             }
//         });

//         // If no Total Credits (and no month.amount) but we have other transactions, use sum of all as Total Credits
//         if (totalCredits === 0 && parsedMonthAmount <= 0 && (transfers > 0 || nonBusiness > 0 || funding > 0 || others > 0)) {
//             totalCredits = transfers + nonBusiness + funding + others;
//         }

//         // Calculate Net Credit (Total Credits minus deductions, or just Total Credits if no deductions)
//         const netCredit = totalCredits - (transfers + nonBusiness + funding + others);
//         const finalNetCredit = netCredit > 0 ? netCredit : totalCredits;

//         // Determine trend by comparing with previous month
//         let trend: "up" | "down" | null = null;
//         if (index > 0) {
//             const prevMonthTransactions = transactionsData[sortedMonths[index - 1]._id] || [];
//             let prevTotalCredits = 0;
//             prevMonthTransactions.forEach((transaction: any) => {
//                 const amount = typeof transaction.amount === 'number' 
//                     ? transaction.amount 
//                     : (typeof transaction.amount === 'string' 
//                         ? parseFloat(transaction.amount.replace(/[^0-9.-]+/g, '')) || 0 
//                         : 0);
//                 const category = normalizeCategory(transaction.category || '');
//                 if (category === 'Total Credits') {
//                     prevTotalCredits += amount;
//                 }
//             });
//             if (prevTotalCredits === 0 && prevMonthTransactions.length > 0) {
//                 prevTotalCredits = prevMonthTransactions.reduce((sum: number, t: any) => {
//                     const amt = typeof t.amount === 'number' 
//                         ? t.amount 
//                         : (typeof t.amount === 'string' 
//                             ? parseFloat(t.amount.replace(/[^0-9.-]+/g, '')) || 0 
//                             : 0);
//                     return sum + amt;
//                 }, 0);
//             }
//             if (prevTotalCredits > 0) {
//                 trend = finalNetCredit > prevTotalCredits ? "up" : finalNetCredit < prevTotalCredits ? "down" : null;
//             }
//         }

//         // Get month abbreviation
//         const monthName = (month.monthName || '').toLowerCase();
//         const monthAbbr = monthAbbreviations[monthName] || monthName.substring(0, 3).charAt(0).toUpperCase() + monthName.substring(1, 3);

//         return {
//             month: monthAbbr,
//             totalCredit: totalCredits > 0 ? formatCurrency(totalCredits) : "-",
//             transfers: transfers > 0 ? formatCurrency(transfers) : "-",
//             nonBusiness: nonBusiness > 0 ? formatCurrency(nonBusiness) : "-",
//             funding: funding > 0 ? formatCurrency(funding) : "-",
//             others: others > 0 ? formatCurrency(others) : "-",
//             netCredit: finalNetCredit > 0 ? formatCurrency(finalNetCredit) : "-",
//             trend,
//         };
//     });

//     return analysisData;
// };

interface RequiredDocumentProps {
    isBankAnalysis?: boolean;
    isDecisionMaking?: boolean;
    /** e.g. deal pipeline Agent/Scrubbing — omit Bank Total summary above documents */
    hideBankTotal?: boolean;
    /** e.g. deal pipeline any stage — omit Required Documents for funding card (checklist, upload, uploaded list) */
    hideFundingDocuments?: boolean;
    // Public/unregistered visitors can only view documents (no upload/delete/checklist updates).
    publicMode?: boolean;
    /** Logged-in view-only: hide funding checklist + upload UI (e.g. approval / bank-analysis for operations). */
    readOnly?: boolean;
    /**
     * When false, user can still see the upload area but cannot submit files
     * (e.g. final scrubbing / operations on decision-making — only super admin + scrubbing upload here).
     */
    disableFundingUpload?: boolean;
    /** Skip positions/terms/months/transactions fetches (e.g. payment deal overview, documents only). */
    skipFinancialFetches?: boolean;
}

const RequiredDocument = ({
    isBankAnalysis,
    isDecisionMaking,
    hideBankTotal = false,
    hideFundingDocuments = false,
    publicMode = false,
    readOnly = false,
    disableFundingUpload = false,
    skipFinancialFetches = false,
}: RequiredDocumentProps) => {
    const showFundingChecklists = !publicMode && !readOnly;
    const showFundingUploadZone = !publicMode && !readOnly;
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const fileInputRef = useRef<HTMLInputElement>(null);
    // const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const { applicationId } = useParams<{ applicationId?: string }>();

    const [isPDFModalOpen, setIsPDFModalOpen] = useState(false);
    const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
    const [pdfFileName, setPdfFileName] = useState<string>("Document");
    const [pdfMimeTypeHint, setPdfMimeTypeHint] = useState<string>("");

    const handleClosePDFModal = () => {
        setIsPDFModalOpen(false);
        setPdfFileUrl(null);
        setPdfFileName("Document");
        setPdfMimeTypeHint("");
    };

    const [, setUser] = useState<user>()
    const [checkedDocs, setCheckedDocs] = useState<Set<string>>(new Set())
    const { loading, data } = useSelector((state: RootState) => state.login)
    const positionsState = useSelector((state: RootState) => state.positions)

    // // Get positions from Redux store
    // const { data: positions, loading: positionsLoading } = useSelector((state: RootState) => state.positions);
    const { data: applicationData } = useSelector((state: RootState) => state.applicationDetail);
    const { success: deleteSuccess } = useSelector((state: RootState) => state.deletePosition);



    // Get months and transactions from Redux store
    const { data: monthsData } = useSelector((state: RootState) => state.months);
    // const { data: transactionsData } = useSelector((state: RootState) => state.transactions);

    // Upload documents state
    const { loading: uploadLoading, success: uploadSuccess, error: uploadError } = useSelector(
        (state: RootState) => state.uploadDocuments
    );

    useEffect(() => {
        setUser(data?.user)
        if (!data?.user) {
            const storedUser = localStorage.getItem('user')
            if (storedUser) {
                setUser(JSON.parse(storedUser))
            }
        }
    }, [data, loading])

    // Sync checkbox state from backend when application data loads (persisted document checklist)
    useEffect(() => {
        const persisted = applicationData?.documentChecklistChecked;
        if (Array.isArray(persisted)) {
            setCheckedDocs(new Set(persisted));
        }
    }, [applicationData?._id, applicationData?.documentChecklistChecked]);

    // Fetch positions, terms offers, months by application (UUID or numeric applicationId) — role-independent; same data for Agent and Scrubbing
    const applicationIdentifier = applicationData?._id ?? applicationId;
    const scopedPositionsForBankTotal = useMemo(() => {
        if (!applicationIdentifier) return [];
        const currentScopeId = positionsState.currentApplicationId
            ? String(positionsState.currentApplicationId)
            : "";
        const allowedIds = [
            applicationIdentifier,
            applicationData?._id,
            (applicationData as any)?.applicationId,
            (applicationData as any)?.id,
            applicationId,
        ]
            .filter(Boolean)
            .map((id) => String(id));
        if (currentScopeId && !allowedIds.includes(currentScopeId)) return [];
        const list = Array.isArray(positionsState.data) ? positionsState.data : [];
        return list.map((p: any) => ({
            amountFunded: p.fundedAmount != null ? String(p.fundedAmount) : "",
            startingDate:
                typeof p.fundingDate === "string"
                    ? p.fundingDate.slice(0, 10)
                    : p.fundingDate
                        ? new Date(p.fundingDate).toISOString().slice(0, 10)
                        : "",
            allocatedBankAnalysisId:
                Number.isInteger(p?.allocatedBankAnalysisId) &&
                    Number(p.allocatedBankAnalysisId) > 0
                    ? Number(p.allocatedBankAnalysisId)
                    : undefined,
        }));
    }, [applicationIdentifier, applicationData, applicationId, positionsState.currentApplicationId, positionsState.data]);

    useEffect(() => {
        // Public/unregistered visitors: this component is used only for documents viewing,
        // so skip heavy data fetching (positions/terms/months/transactions).
        if (publicMode || skipFinancialFetches) return;
        if (applicationIdentifier) {
            dispatch(getTermsOffers({ application: applicationIdentifier }));
            // BankAnalysis owns these shared requests when both components are mounted together.
            if (!isBankAnalysis) {
                dispatch(getPositions({ application: applicationIdentifier }));
                dispatch(getMonths({ application: applicationIdentifier }));
            }
        }
    }, [applicationIdentifier, dispatch, isBankAnalysis, publicMode, skipFinancialFetches]);

    // Fetch transactions for each month when months data is available — role-independent; Agent and Scrubbing see same transactions for the same applicationId
    useEffect(() => {
        if (publicMode || skipFinancialFetches) return;
        if (monthsData && Array.isArray(monthsData) && monthsData.length > 0) {
            monthsData.forEach((month) => {
                // Always fetch transactions to ensure we have the latest data (including transactions created by other roles)
                // The backend queries by monthId only, with no role-based filtering
                dispatch(getTransactions({ monthId: month._id }));
            });
        }
    }, [monthsData, dispatch, publicMode, skipFinancialFetches]);

    // Refetch terms offers after successful deletion
    // useEffect(() => {
    //     if (deleteTermsOfferSuccess && applicationIdentifier) {
    //         dispatch(getTermsOffers({ application: applicationIdentifier }));
    //         dispatch(resetDeleteTermsOffer());
    //     }
    // }, [deleteTermsOfferSuccess, applicationIdentifier, dispatch]);

    // Refetch positions after successful deletion
    useEffect(() => {
        if (skipFinancialFetches) return;
        if (deleteSuccess && applicationIdentifier) {
            dispatch(getPositions({ application: applicationIdentifier }));
            dispatch(resetDeletePosition());
        }
    }, [deleteSuccess, applicationIdentifier, dispatch, skipFinancialFetches]);

    const {
        control,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<UploadFormData>({
        resolver: yupResolver(uploadSchema) as any,
        defaultValues: {
            uploadedFile: null,
        },
    });

    const uploadedFile = watch("uploadedFile");

    // Handle upload success/error
    useEffect(() => {
        if (uploadSuccess) {
            toast.success("Document uploaded successfully.");
            setValue("uploadedFile", null, { shouldValidate: false });
            if (fileInputRef.current) fileInputRef.current.value = "";
            if (applicationData?._id) {
                dispatch(getApplicationById(applicationData._id));
            }
            if (applicationData?.applicationId != null) {
                dispatch(getApplicationByApplicationId(applicationData.applicationId as number));
            }
            dispatch(resetUploadDocuments());
        }
        if (uploadError) {
            toast.error(uploadError);
            dispatch(resetUploadDocuments());
        }
    }, [uploadSuccess, uploadError, applicationData?._id, applicationData?.applicationId, dispatch, setValue]);

    // Handle delete - directly delete without confirmation
    // const handleDeleteClick = async (positionId: string) => {
    //     await dispatch(deletePosition(positionId));
    // };

    // Handle delete terms offer - directly delete without confirmation
    // const handleDeleteTermsOfferClick = async (termsOfferId: string) => {
    //     await dispatch(deleteTermsOffer(termsOfferId));
    // };

    // Calculate bank analysis data from actual transactions — role-independent; shows all transactions for the application
    // const bankAnalysisData = useMemo(() => {
    //     return calculateBankAnalysisData(monthsData || [], transactionsData || {});
    // }, [monthsData, transactionsData]);

    // Calculate totals for the summary row
    // const bankAnalysisTotals = useMemo(() => {
    //     const totals = bankAnalysisData.reduce((acc, row) => {
    //         const parseAmount = (val: string) => {
    //             if (val === "-" || !val) return 0;
    //             const num = parseFloat(val.replace(/[^0-9.-]+/g, ''));
    //             return isNaN(num) ? 0 : num;
    //         };
    //         return {
    //             totalCredit: acc.totalCredit + parseAmount(row.totalCredit),
    //             transfers: acc.transfers + parseAmount(row.transfers),
    //             nonBusiness: acc.nonBusiness + parseAmount(row.nonBusiness),
    //             funding: acc.funding + parseAmount(row.funding),
    //             others: acc.others + parseAmount(row.others),
    //             netCredit: acc.netCredit + parseAmount(row.netCredit),
    //         };
    //     }, { totalCredit: 0, transfers: 0, nonBusiness: 0, funding: 0, others: 0, netCredit: 0 });

    //     return {
    //         totalCredit: totals.totalCredit > 0 ? formatCurrency(totals.totalCredit) : "-",
    //         transfers: totals.transfers > 0 ? formatCurrency(totals.transfers) : "-",
    //         nonBusiness: totals.nonBusiness > 0 ? formatCurrency(totals.nonBusiness) : "-",
    //         funding: totals.funding > 0 ? formatCurrency(totals.funding) : "-",
    //         others: totals.others > 0 ? formatCurrency(totals.others) : "-",
    //         netCredit: totals.netCredit > 0 ? formatCurrency(totals.netCredit) : "-",
    //     };
    // }, [bankAnalysisData]);

    // const userRole = user?.role || localStorage.getItem('role') || ''
    // const isUnderwriterRole = userRole === 'SCRUBBING' || userRole === 'UNDERWRITER'

    const onSubmit = async (data: UploadFormData) => {
        if (disableFundingUpload) return;
        if (!applicationData?._id) {
            toast.error("Application not found. Please open an application first.");
            return;
        }
        if (!data.uploadedFile) {
            toast.warning("Please select a document to upload.");
            return;
        }
        try {
            await dispatch(
                uploadApplicationDocuments({
                    id: applicationData._id,
                    files: [data.uploadedFile],
                })
            ).unwrap();
            toast.success("Document uploaded successfully.");
            setValue("uploadedFile", null, { shouldValidate: false });
            if (fileInputRef.current) fileInputRef.current.value = "";
            if (applicationData._id) {
                dispatch(getApplicationById(applicationData._id));
            }
            if (applicationData.applicationId != null) {
                dispatch(getApplicationByApplicationId(applicationData.applicationId as number));
            }
            dispatch(resetUploadDocuments());
        } catch (err: unknown) {
            const message = typeof err === "string" ? err : (err as Error)?.message || "Failed to upload document.";
            toast.error(message);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (disableFundingUpload) return;
        const file = e.target.files?.[0];
        if (file) {
            setValue("uploadedFile", file, { shouldValidate: true });
        }
    };

    const handleUploadClick = () => {
        if (disableFundingUpload) return;
        fileInputRef.current?.click();
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const size = Math.round(bytes / Math.pow(k, i));
        return `${size} ${sizes[i]}`;
    };

    const uploadedFilesList: ApplicationFiles[] = applicationData?.files ?? [];

    const handleDocumentCheckboxChange = async (label: string, checked: boolean | "indeterminate") => {
        const isChecked = checked === true;
        const next = new Set(checkedDocs);
        if (isChecked) next.add(label);
        else next.delete(label);
        setCheckedDocs(next);

        if (!applicationData?._id) return;

        try {
            await dispatch(
                updateApplicationDocumentChecklist({
                    id: applicationData._id,
                    checkedLabels: Array.from(next),
                })
            ).unwrap();
        } catch (err) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to save document checklist.",
            });
        }
    };

    // Transform months and transactions data for MonthlyTransactions component
    // const transformedMonthlyTransactionsData = useMemo((): MonthlyTransactionData[] => {
    //     if (!monthsData || !Array.isArray(monthsData) || monthsData.length === 0) {
    //         return [];
    //     }

    //     // Sort months by date ascending (oldest first)
    //     const sortedMonths = [...monthsData].sort((a, b) => {
    //         const dateA = a.date ? (typeof a.date === 'string' ? new Date(a.date) : new Date(a.date)) : new Date(0);
    //         const dateB = b.date ? (typeof b.date === 'string' ? new Date(b.date) : new Date(b.date)) : new Date(0);
    //         return dateA.getTime() - dateB.getTime();
    //     });

    //     return sortedMonths.map((month) => {
    //         const monthTransactions = transactionsData[month._id] || [];

    //         // Transform transactions to the format expected by MonthlyTransactions
    //             const transformedTransactions = monthTransactions.map((transaction) => {
    //             // Format amount as currency string (no decimals)
    //             const amount = typeof transaction.amount === 'number' 
    //                 ? formatCurrency(transaction.amount)
    //                 : transaction.amount 
    //                     ? (typeof transaction.amount === 'string' && transaction.amount.includes('$')
    //                         ? transaction.amount
    //                         : formatCurrency(transaction.amount))
    //                     : formatCurrency(0);

    //             return {
    //                 category: transaction.category || '',
    //                 amount: amount,
    //                 note: transaction.notes || '',
    //             };
    //         });

    //         return {
    //             month: month.monthName ? month.monthName.toUpperCase() : 'UNKNOWN',
    //             transactions: transformedTransactions,
    //         };
    //     });
    // }, [monthsData, transactionsData]);

    return (
        <div className="space-y-6 w-full">
            {/* Required Documents for Funding Section */}
            {
                !isBankAnalysis && !hideFundingDocuments ? (
                    <Card
                        className={`border-border shadow-sm gap-2 ${isDecisionMaking ? "mb-10" : "mb-5"}`}
                    >
                        <CardHeader className="">
                            <CardTitle className="text-foreground text-lg font-semibold">
                                Required Documents for funding
                            </CardTitle>
                        </CardHeader>
                        <CardContent
                            className={isDecisionMaking ? "pb-10" : "pb-6"}
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                {/* Left Column - Document Lists */}
                                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {showFundingChecklists && (
                                        <>
                                            {/* Provide with signed contract */}
                                            <div>
                                                <h3 className="text-[#1E88E5] font-medium text-sm mb-4">
                                                    Provide with signed contract
                                                </h3>
                                                <div className="space-y-3">
                                                    {provideWithContract.map((item, index) => (
                                                        <div key={index} className="flex items-center gap-3">
                                                            <Checkbox
                                                                id={`provide-${index}`}
                                                                checked={checkedDocs.has(item.label)}
                                                                onCheckedChange={(checked: boolean | "indeterminate") =>
                                                                    handleDocumentCheckboxChange(item.label, checked as boolean | "indeterminate")
                                                                }
                                                            />
                                                            <span className="text-sm text-foreground">{item.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {showFundingChecklists && (
                                        <>
                                            {/* Abc Company will take care of */}
                                            <div>
                                                <h3 className="text-[#1E88E5] font-medium text-sm mb-4">
                                                    Abc Company will take care of:
                                                </h3>
                                                <div className="space-y-3">
                                                    {companyWillHandle.map((item, index) => (
                                                        <div key={index} className="flex items-center gap-3">
                                                            <Checkbox
                                                                id={`company-${index}`}
                                                                checked={checkedDocs.has(item.label)}
                                                                onCheckedChange={(checked: boolean | "indeterminate") =>
                                                                    handleDocumentCheckboxChange(item.label, checked as boolean | "indeterminate")
                                                                }
                                                            />
                                                            <span className="text-sm text-foreground">{item.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Right Column - Upload Section */}
                                <div className="lg:col-span-1">
                                    {showFundingUploadZone && (
                                        <form onSubmit={handleSubmit(onSubmit)}>
                                            <div
                                                className={`rounded-lg border-2 border-dashed border-gray-300 p-6 text-center ${disableFundingUpload ? "opacity-70" : ""}`}
                                            >
                                                <p className="text-sm text-muted-foreground mb-4">Upload documents here</p>

                                                <Controller
                                                    name="uploadedFile"
                                                    control={control}
                                                    render={() => (
                                                        <>
                                                            <input
                                                                type="file"
                                                                ref={fileInputRef}
                                                                onChange={handleFileChange}
                                                                className="hidden"
                                                                disabled={disableFundingUpload}
                                                            />
                                                            <Button
                                                                type="button"
                                                                onClick={handleUploadClick}
                                                                disabled={disableFundingUpload}
                                                                className="bg-[#C07BE0] hover:bg-[#1565C0] text-white text-sm font-medium px-4 py-2 mb-4 disabled:pointer-events-none disabled:opacity-50"
                                                            >
                                                                <Upload className="w-4 h-4 mr-2" />
                                                                Upload Document
                                                            </Button>
                                                        </>
                                                    )}
                                                />

                                                {uploadedFile && (
                                                    <p className="text-sm text-green-600 mb-2">
                                                        File selected: {(uploadedFile as File).name}
                                                    </p>
                                                )}

                                                <p className="text-xs text-muted-foreground">
                                                    Please upload required document for this application below then click on the "Submit" button.
                                                </p>

                                                {disableFundingUpload && (
                                                    <p className="text-xs text-muted-foreground mt-2">
                                                        Upload is available to Super Admin, Scrubbing, and Underwriter only.
                                                    </p>
                                                )}

                                                {errors.uploadedFile && (
                                                    <p className="text-red-500 text-xs mt-2">
                                                        {errors.uploadedFile.message as string}
                                                    </p>
                                                )}
                                                {!applicationData?._id && (
                                                    <p className="text-amber-600 text-xs mt-2">
                                                        Open an application to upload documents.
                                                    </p>
                                                )}
                                            </div>

                                            <div
                                                className={`flex justify-end ${isDecisionMaking ? "mt-6 mb-5" : "mt-4 mb-3"}`}
                                            >
                                                <Button
                                                    type="submit"
                                                    disabled={
                                                        disableFundingUpload ||
                                                        !applicationData?._id ||
                                                        !uploadedFile ||
                                                        uploadLoading
                                                    }
                                                    className="bg-[#22C55E] hover:bg-[#16A34A] text-white text-sm font-medium px-6 py-2 disabled:opacity-50"
                                                >
                                                    {uploadLoading ? "Uploading..." : "Submit"}
                                                </Button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </div>

                            {/* Uploaded files list */}
                            <div
                                className={`border-t ${isDark ? "border-[#374151]" : "border-border"} ${isDecisionMaking ? "mt-8 pt-6" : "mt-6 pt-4"}`}
                            >
                                <h3 className="text-[#1E88E5] font-medium text-sm mb-3">Uploaded documents</h3>
                                {uploadedFilesList.length === 0 ? (
                                    <p className={`text-sm ${isDark ? "text-gray-400" : "text-muted-foreground"}`}>
                                        No documents uploaded yet.
                                    </p>
                                ) : (
                                    <div className="rounded-md border overflow-hidden">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className={isDark ? "border-[#374151] bg-[#2A2B2F]" : "bg-muted/50"}>
                                                    <TableHead className={isDark ? "text-gray-300" : "text-[#687182]"}>File name</TableHead>
                                                    <TableHead className={isDark ? "text-gray-300" : "text-[#687182]"}>Size</TableHead>
                                                    <TableHead className={isDark ? "text-gray-300" : "text-[#687182]"}>Uploaded</TableHead>
                                                    <TableHead className="text-left w-[100px]">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {uploadedFilesList.map((file) => (
                                                    <TableRow key={file._id ?? file.url} className={isDark ? "border-[#374151]" : ""}>
                                                        <TableCell className={`text-sm font-medium ${isDark ? "text-white" : "text-foreground"}`}>
                                                            {file.originalName ?? "Document"}
                                                        </TableCell>
                                                        <TableCell className={`text-sm ${isDark ? "text-gray-400" : "text-muted-foreground"}`}>
                                                            {formatFileSize(file.size ?? 0)}
                                                        </TableCell>
                                                        <TableCell className={`text-sm ${isDark ? "text-gray-400" : "text-muted-foreground"}`}>
                                                            {file.uploadedAt
                                                                ? new Date(file.uploadedAt).toLocaleDateString("en-US", {
                                                                    year: "numeric",
                                                                    month: "short",
                                                                    day: "numeric",
                                                                    hour: "2-digit",
                                                                    minute: "2-digit",
                                                                })
                                                                : "—"}
                                                        </TableCell>
                                                        <TableCell className="text-left">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {file.url && (
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-blue-500 hover:text-blue-600"
                                                                        onClick={() => {
                                                                            setPdfFileUrl(file.url ?? null);
                                                                            setPdfFileName((file.originalName ?? "Document") as string);
                                                                            setPdfMimeTypeHint(String(file.mimeType || "").trim());
                                                                            setIsPDFModalOpen(true);
                                                                        }}
                                                                        title="View"
                                                                    >
                                                                        <Eye className="size-4" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>) : <div className="mb-5"></div>
            }

            {/* Bank Analysis Section */}
            {/* {!isBankAnalysis &&  <Card className={`gap-0 my-6 w-full border shadow-[0px_4px_20px_0px_#00000005] p-0 rounded-b-md ${
                isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
            }`}>
                <CardHeader className={`flex flex-row items-center justify-between px-4 py-2 ${
                    isDark ? 'bg-[#2A2B2F]' : 'bg-[#F9FAFD]'
                }`}>
                    <CardTitle className={`font-roboto text-base font-semibold ${
                        isDark ? 'text-white bg-[#2A2B2F]' : 'text-[#374151] bg-[#F9FAFD]'
                    }`}>
                        Bank Analysis
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className={`shadow-[0px_0px_2px_0px_#0000001A] border ${
                                isDark ? 'border-[#374151] bg-[#2A2B2F]' : 'border-[#ECECEC]'
                            }`}>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Month
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider text-left ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Total Credit
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider text-left ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Transfers
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider text-left ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Non Business
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider text-left ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Funding
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider text-left ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Others
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider text-left ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Net Credit
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {bankAnalysisData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className={`py-8 text-left text-sm ${
                                        isDark ? 'text-white' : 'text-muted-foreground'
                                    }`}>
                                        No transaction data available. Transactions will appear here once months are added and transactions are created.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                <>
                                    {bankAnalysisData.map((row, index) => (
                                        <TableRow key={index} className={`border-b ${
                                            isDark ? 'border-[#374151]' : 'border-border'
                                        }`}>
                                            <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                                isDark ? 'text-white' : 'text-[#687182]'
                                            }`}>
                                                {row.month}
                                            </TableCell>
                                            <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins text-left ${
                                                isDark ? 'text-white' : 'text-[#687182]'
                                            }`}>
                                                {row.totalCredit}
                                            </TableCell>
                                            <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins text-left ${
                                                isDark ? 'text-white' : 'text-[#687182]'
                                            }`}>
                                                {row.transfers}
                                            </TableCell>
                                            <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins text-left ${
                                                isDark ? 'text-white' : 'text-[#687182]'
                                            }`}>
                                                {row.nonBusiness}
                                            </TableCell>
                                            <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins text-left ${
                                                isDark ? 'text-white' : 'text-[#687182]'
                                            }`}>
                                                {row.funding}
                                            </TableCell>
                                            <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins text-left ${
                                                isDark ? 'text-white' : 'text-[#687182]'
                                            }`}>
                                                {row.others}
                                            </TableCell>
                                            <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                                isDark ? 'text-white' : 'text-[#687182]'
                                            }`}>
                                                <div className="flex items-center justify-center gap-1">
                                                    <span className={isDark ? 'text-white' : 'text-foreground'}>{row.netCredit}</span>
                                                    {row.trend === "up" && (
                                                        <ArrowUpRight className="w-4 h-4 text-green-500" />
                                                    )}
                                                    {row.trend === "down" && (
                                                        <ArrowDownRight className="w-4 h-4 text-red-500" />
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                
                                    {bankAnalysisData.length > 0 && (
                                        <TableRow className={`py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-black'
                                        }`}>
                                            <TableCell className={`py-4 px-6 text-sm font-semibold ${
                                                isDark ? 'text-white' : 'text-black'
                                            }`}>
                                                Total
                                            </TableCell>
                                            <TableCell className={`py-4 px-6 text-sm font-semibold text-left ${
                                                isDark ? 'text-white' : 'text-black'
                                            }`}>
                                                {bankAnalysisTotals.totalCredit}
                                            </TableCell>
                                            <TableCell className={`py-4 px-6 text-sm font-semibold text-left ${
                                                isDark ? 'text-white' : 'text-black'
                                            }`}>
                                                {bankAnalysisTotals.transfers}
                                            </TableCell>
                                            <TableCell className={`py-4 px-6 text-sm font-semibold text-left ${
                                                isDark ? 'text-white' : 'text-black'
                                            }`}>
                                                {bankAnalysisTotals.nonBusiness}
                                            </TableCell>
                                            <TableCell className={`py-4 px-6 text-sm font-semibold text-left ${
                                                isDark ? 'text-white' : 'text-black'
                                            }`}>
                                                {bankAnalysisTotals.funding}
                                            </TableCell>
                                            <TableCell className={`py-4 px-6 text-sm font-semibold text-left ${
                                                isDark ? 'text-white' : 'text-black'
                                            }`}>
                                                {bankAnalysisTotals.others}
                                            </TableCell>
                                            <TableCell className={`py-4 px-6 text-sm font-semibold text-left ${
                                                isDark ? 'text-white' : 'text-black'
                                            }`}>
                                                {bankAnalysisTotals.netCredit}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>} */}

            {/* Bank Total summary table only on main application view (not Bank Analysis / Decision Making tabs) */}
            {!isBankAnalysis && !isDecisionMaking && !hideBankTotal && (
                <BankAnalysisTable showOnlyTotals positions={scopedPositionsForBankTotal as any} />
            )}

            {/* Monthly Transactions Section */}
            {/* {(isBankAnalysis || isDecisionMaking) && (
                <MonthlyTransactions 
                    data={transformedMonthlyTransactionsData} 
                />
            )} */}

            {/* Positions Section */}
            {/* <Card className={`gap-0 my-6 w-full border shadow-[0px_4px_20px_0px_#00000005] p-0 rounded-b-md ${
                isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
            }`}>
                <CardHeader className={`flex flex-row items-center justify-between px-4 py-2 ${
                    isDark ? 'bg-[#2A2B2F]' : 'bg-[#F9FAFD]'
                }`}>
                    <CardTitle className={`font-roboto text-base font-semibold ${
                        isDark ? 'text-white' : 'text-[#374151]'
                    }`}>
                        Positions
                    </CardTitle>
                    {isBankAnalysis && (
                        <Button 
                            onClick={() => {
                                if (applicationId) {
                                    navigate(`/application-details/${applicationId}/create-position`);
                                } else {
                                    navigate('/create-position');
                                }
                            }}
                            className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white w-36 px-10 py-0 text-xs rounded-sm"
                        >
                            Create Position
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className={`shadow-[0px_0px_2px_0px_#0000001A] border ${
                                isDark ? 'border-[#374151]' : 'border-[#ECECEC]'
                            }`}>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    ID
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Position
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Funded
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Payback Amount
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Factor Rate
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    Frequency
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    ACH
                                </TableHead>
                                <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    % of Gross
                                </TableHead>
                                {isUnderwriterRole && (
                                    <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider text-left ${
                                        isDark ? 'text-white' : 'text-[#687182]'
                                    }`}>
                                        ACTION
                                    </TableHead>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {positionsLoading ? (
                                <TableRow>
                                    <TableCell colSpan={isUnderwriterRole ? 9 : 8} className={`py-8 text-left text-sm ${
                                        isDark ? 'text-white' : 'text-muted-foreground'
                                    }`}>
                                        Loading positions...
                                    </TableCell>
                                </TableRow>
                            ) : positions && positions.length > 0 ? (
                                positions.map((row) => (
                                    <TableRow key={row._id} className={`border-b ${
                                        isDark ? 'border-[#374151]' : 'border-border'
                                    }`}>
                                        <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {row.positionId || row._id.slice(-6).toUpperCase()}
                                        </TableCell>
                                        <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {row.position}
                                        </TableCell>
                                        <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {formatCurrency(row.fundedAmount)}
                                        </TableCell>
                                        <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {formatCurrency(row.paybackAmount)}
                                        </TableCell>
                                        <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {row.factorRate}
                                        </TableCell>
                                        <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {row.frequency}
                                        </TableCell>
                                        <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {row.ach || "-"}
                                        </TableCell>
                                        <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {row.percentOfGross}
                                        </TableCell>
                                        {isUnderwriterRole && (
                                            <TableCell className="py-2 px-6 text-sm text-foreground text-left">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-foreground hover:text-foreground hover:bg-transparent cursor-pointer"
                                                        >
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreHorizontal className="size-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                if (applicationId) {
                                                                    navigate(`/application-details/${applicationId}/view-position/${row._id}`);
                                                                } else {
                                                                    navigate(`/view-position/${row._id}`);
                                                                }
                                                            }}
                                                        >
                                                            View
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                if (applicationId) {
                                                                    navigate(`/application-details/${applicationId}/edit-position/${row._id}`);
                                                                } else {
                                                                    navigate(`/edit-position/${row._id}`);
                                                                }
                                                            }}
                                                        >
                                                            Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem 
                                                            variant="destructive"
                                                            onClick={() => handleDeleteClick(row._id)}
                                                            disabled={deleteLoading}
                                                        >
                                                            {deleteLoading ? 'Deleting...' : 'Delete'}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={isUnderwriterRole ? 9 : 8} className={`py-8 text-left text-sm ${
                                        isDark ? 'text-white' : 'text-muted-foreground'
                                    }`}>
                                        No positions found. Click "Create Position" to add one.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card> */}

            {/* Terms Offers Section */}
            {/* {(isBankAnalysis || isDecisionMaking) && (
            <Card className={`gap-0 my-6 w-full border shadow-[0px_4px_20px_0px_#00000005] p-0 rounded-b-md ${
                isDark ? 'bg-[#141517] border-[#374151]' : 'border-[#FDFDFD]'
            }`}>
                <CardHeader className={`flex flex-row items-center justify-between px-4 py-2 ${
                    isDark ? 'bg-[#2A2B2F]' : 'bg-[#F9FAFD]'
                }`}>
                    <CardTitle className={`font-roboto text-base font-semibold ${
                        isDark ? 'text-white' : 'text-[#374151]'
                    }`}>
                        Terms Offers
                    </CardTitle>
                    {
                        isBankAnalysis &&                    
                        (<Button 
                            onClick={() => {
                                if (applicationId) {
                                    navigate(`/application-details/${applicationId}/create-terms-offer`);
                                } else {
                                    navigate('/create-terms-offer');
                                }
                            }}
                            className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white w-36 px-10 py-0 text-xs rounded-sm"
                        >
                            Create Terms Offer
                        </Button>)
                    }
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className={`shadow-[0px_0px_2px_0px_#0000001A] border ${
                                isDark ? 'border-[#374151]' : 'border-[#ECECEC]'
                            }`}>
                               <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    APPROVED AMOUNT
                                </TableHead>
                               <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    PAYBACK AMOUNT
                                </TableHead>
                               <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    BUY RATE
                                </TableHead>
                               <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    FACTOR RATE
                                </TableHead>
                               <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    PAYMENT AMOUNT
                                </TableHead>
                               <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    COMMISSION AMOUNT
                                </TableHead>
                               <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    TERM LENGTH
                                </TableHead>
                               <TableHead className={`py-3 px-6 font-roboto text-xs font-semibold uppercase tracking-wider ${
                                    isDark ? 'text-white' : 'text-[#687182]'
                                }`}>
                                    ACTION
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {termsOffersLoading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className={`py-8 text-left text-sm ${
                                        isDark ? 'text-white' : 'text-muted-foreground'
                                    }`}>
                                        Loading terms offers...
                                    </TableCell>
                                </TableRow>
                            ) : termsOffers && termsOffers.length > 0 ? (
                                termsOffers.map((row) => (
                                    <TableRow key={row._id} className={`border-b ${
                                        isDark ? 'border-[#374151]' : 'border-border'
                                    }`}>
                                         <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {formatCurrency(row.approvedAmount)}
                                        </TableCell>
                                         <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {formatCurrency(row.paybackAmount)}
                                        </TableCell>
                                         <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {row.buyRate}%
                                        </TableCell>
                                         <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {row.factorRate}
                                        </TableCell>
                                         <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {formatCurrency(row.paymentAmount)}
                                        </TableCell>
                                         <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {formatCurrency(row.commissionAmount)}
                                        </TableCell>
                                        <TableCell className={`text-[0.8rem] font-[400] py-2 px-6 font-poppins ${
                                            isDark ? 'text-white' : 'text-[#687182]'
                                        }`}>
                                            {row.termLength != null
                                                ? `${row.termLength} months`
                                                : '-'}
                                        </TableCell>
                                        <TableCell className={`py-2 px-6 text-sm text-left ${
                                            isDark ? 'text-white' : 'text-foreground'
                                        }`}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            if (applicationId) {
                                                                navigate(`/application-details/${applicationId}/view-terms-offer/${row._id}`);
                                                            } else {
                                                                navigate(`/view-terms-offer/${row._id}`);
                                                            }
                                                        }}
                                                    >
                                                        View
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            if (applicationId) {
                                                                navigate(`/application-details/${applicationId}/edit-terms-offer/${row._id}`);
                                                            } else {
                                                                navigate(`/edit-terms-offer/${row._id}`);
                                                            }
                                                        }}
                                                    >
                                                        Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem 
                                                        variant="destructive"
                                                        onClick={() => handleDeleteTermsOfferClick(row._id)}
                                                        disabled={deleteTermsOfferLoading}
                                                    >
                                                        {deleteTermsOfferLoading ? 'Deleting...' : 'Delete'}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} className={`py-8 text-left text-sm ${
                                        isDark ? 'text-white' : 'text-muted-foreground'
                                    }`}>
                                        No terms offers found. Click "Create Terms Offer" to add one.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>)} */}
            <PDFViewerDocsModal
                isOpen={isPDFModalOpen}
                onClose={handleClosePDFModal}
                fileUrl={pdfFileUrl}
                fileName={pdfFileName}
                mimeTypeHint={pdfMimeTypeHint}
            />
        </div>
    );
};

export default RequiredDocument;
