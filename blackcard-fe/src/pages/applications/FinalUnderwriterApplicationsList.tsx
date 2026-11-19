import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatCurrency, getPreviousMonthDateRangeET } from "@/lib/utils";
import { resolveApplicationDisplayLoanAmount } from "@/lib/applicationLoanAmount";
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/redux/store';
import {
    getApplications,
    getApplicationStats,
    deleteApplication,
    type ApplicationStatsData,
} from '@/redux/actions/applicationActions';
import { resetDeleteApplication } from '@/redux/slices/applicationSlice';
import { toast } from 'react-toastify';
import type { Application } from '@/types/applicationTypes';
import {
    type ColumnDef,
    type PaginationState,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Trash2 } from 'lucide-react';
import DataTableContent from '@/components/DataTable/DataTableContent';
import { isListBlockingLoad } from '@/lib/listLoading';
import DataTablePagination from '@/components/DataTable/DataTablePagination';
import { axiosGet } from '@/redux/axios';
import { formatDate as formatDateUtil } from "@/lib/utils";
import ApplicationDetailsSheet from "@/components/application/ApplicationDetailsSheet";
import { useTheme } from "@/context/ThemeContext";
import { getClientByClientId } from "@/redux/actions/clientActions";
import {
    buildApplicationsBrowseUrl,
    statCardTitleToApplicationsQuery,
} from "@/constants/dashboardApplicationsNavigation";
import {
    buildApplicationsListParams,
    DEFAULT_APPLICATIONS_PAGE_SIZE,
} from "@/lib/applicationsListParams";
import { getApplicationBusinessDisplayName } from "@/lib/applicationBusinessDisplayName";
import {
    CONTRACT_OUT_QUEUE_BADGE_CLASS,
    isContractOutQueueBadgeLabel,
} from "@/lib/contractOutQueueBadge";
import {
    CONTRACT_SIGNED_QUEUE_BADGE_CLASS,
    isContractSignedQueueBadgeLabel,
} from "@/lib/contractSignedQueueBadge";

/** Badge colors for {@link Application.currentQueue} / `queue` labels. */
function currentQueueBadgeClass(label: string): string {
    if (!label || label === "-") return "bg-slate-100 text-slate-600";
    if (isContractOutQueueBadgeLabel(label)) return CONTRACT_OUT_QUEUE_BADGE_CLASS;
    if (isContractSignedQueueBadgeLabel(label)) return CONTRACT_SIGNED_QUEUE_BADGE_CLASS;
    const q = label.toLowerCase();
    if (/(declin|reject|cancel)/.test(q)) return "bg-red-100 text-red-700";
    if (/(fund|disburs|complet)/.test(q)) return "bg-green-100 text-green-700";
    if (/(approv|contract)/.test(q)) return "bg-blue-100 text-blue-700";
    if (/(underwrit|review|final|^new\b|hold)/.test(q)) return "bg-sky-100 text-sky-800";
    return "bg-yellow-100 text-yellow-700";
}

export default function FinalUnderwriterApplicationsList() {
    const dispatch = useDispatch<AppDispatch>();

    const getApplicationClientId = useCallback((application: Application): string | null => {
        const client = application?.client;
        if (!client) return null;
        if (typeof client === "string") return client;
        if (client.clientId != null) return String(client.clientId);
        if (client._id) return String(client._id);
        return null;
    }, []);

    const navigate = useNavigate();
    const [viewApplication, setViewApplication] = useState<Application | null>(null);

    const handleOpenApplicationDetails = useCallback(
        async (application: Application) => {
            const clientId = getApplicationClientId(application);
            if (clientId) {
                try {
                    await dispatch(getClientByClientId(clientId)).unwrap();
                } catch {
                    // Open sheet even if prefetch fails; component handles fallback loading state.
                }
            }
            setViewApplication(application);
        },
        [dispatch, getApplicationClientId],
    );
    const {
        loading,
        isRefreshing: applicationsRefreshing,
        data: applications,
        pagination: apiPagination,
        error,
    } = useSelector((state: RootState) => state.applications);
    const { data: statsData, isRefreshing: statsRefreshing } = useSelector(
        (state: RootState) => state.applicationStats,
    );
    const { loading: deleteLoading, success: deleteSuccess, error: deleteError } = useSelector(
        (state: RootState) => state.deleteApplication
    );

    const [, setContractTemplate] = useState<{ url: string; originalName: string } | null>(null);
    // const templateInputRef = useRef<HTMLInputElement | null>(null);

    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: DEFAULT_APPLICATIONS_PAGE_SIZE,
    });
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
    const [prevMonthStats, setPrevMonthStats] = useState<ApplicationStatsData | null>(null);

    const formatDate = useCallback((dateString?: string) => {
        return formatDateUtil(dateString ?? "", "-");
    }, []);

    const getClientEmail = useCallback((client: Application["client"]) => {
        if (typeof client === "string") return "-";
        return client?.business?.email || client?.owner?.email || "-";
    }, []);

    const getApplicationCurrentQueue = useCallback((application: Application): string => {
        const raw = application.currentQueue ?? application.queue;
        const s = raw != null ? String(raw).trim() : "";
        return s || "-";
    }, []);

    // Row selection for bulk delete
    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
    const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
    const isBulkDeleteRef = useRef(false);

    useEffect(() => {
        setSelectedApplicationIds(Object.keys(rowSelection));
    }, [rowSelection]);

    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const stats = useMemo(() => {
        const s = statsData;
        const prev = prevMonthStats;
        const fmt = (n: number) => formatCurrency(n);

        const buildBucket = (
            count: number,
            total: number,
            prevTotal: number | null | undefined,
        ) => {
            const currentTotal = total ?? 0;
            const previousTotal = prevTotal ?? 0;

            let changePercent: number | null = null;

            if (previousTotal > 0) {
                changePercent = ((currentTotal - previousTotal) / previousTotal) * 100;
            } else if (currentTotal > 0) {
                changePercent = 100;
            } else if (previousTotal === 0 && currentTotal === 0) {
                changePercent = 0;
            }

            let changeLabel = "No change from last month";
            let changeClass = "text-muted-foreground";

            if (typeof changePercent === "number") {
                const rounded = Math.round(Math.abs(changePercent));
                const sign =
                    changePercent > 0 ? "+" : changePercent < 0 ? "-" : "";

                if (changePercent > 0) {
                    changeClass = "text-emerald-600";
                } else if (changePercent < 0) {
                    changeClass = "text-rose-600";
                }

                changeLabel = `${sign}${rounded}% from last month`;
            }

            return {
                value: String(count),
                money: fmt(currentTotal),
                changePercent,
                changeLabel,
                changeClass,
            };
        };

        return [
            {
                title: "Pending",
                ...buildBucket(
                    s?.workflowPending?.count ?? 0,
                    s?.workflowPending?.totalAmount ?? 0,
                    prev?.workflowPending?.totalAmount,
                ),
            },
            {
                title: "In Progress",
                ...buildBucket(
                    s?.workflowInProgress?.count ?? 0,
                    s?.workflowInProgress?.totalAmount ?? 0,
                    prev?.workflowInProgress?.totalAmount,
                ),
            },
            {
                title: "Funded",
                ...buildBucket(
                    s?.funded?.count ?? 0,
                    s?.funded?.totalAmount ?? 0,
                    prev?.funded?.totalAmount,
                ),
            },
            {
                title: "Approved",
                ...buildBucket(
                    s?.approved?.count ?? 0,
                    s?.approved?.totalAmount ?? 0,
                    prev?.approved?.totalAmount,
                ),
            },
            {
                title: "Rejected",
                ...buildBucket(
                    s?.rejected?.count ?? 0,
                    s?.rejected?.totalAmount ?? 0,
                    prev?.rejected?.totalAmount,
                ),
            },
        ];
    }, [statsData, prevMonthStats]);

    const statsGridCols = stats.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4";

    // const handleContractTemplateChange = useCallback(
    //     async (event: React.ChangeEvent<HTMLInputElement>) => {
    //         const file = event.target.files?.[0];
    //         if (!file) return;

    //         if (file.type !== 'application/pdf') {
    //             toast.error('Please upload a PDF file.');
    //             event.target.value = '';
    //             return;
    //         }

    //         try {
    //             const formData = new FormData();
    //             formData.append('file', file);

    //             const response = await axiosPostFormData('/contract-templates/upload', formData);
    //             const data = response.data?.data;

    //             if (!data?.url) {
    //                 toast.error('Failed to upload contract template.');
    //                 return;
    //             }

    //             const template = {
    //                 url: data.url as string,
    //                 originalName: (data.originalName as string) || file.name,
    //             };

    //             setContractTemplate(template);
    //             if (typeof window !== 'undefined') {
    //                 localStorage.setItem('globalContractTemplate', JSON.stringify(template));
    //             }

    //             toast.success('Contract template uploaded successfully.');
    //         } catch (error: any) {
    //             console.error('Failed to upload contract template:', error);
    //             const message = error?.response?.data?.message || 'Failed to upload contract template.';
    //             toast.error(message);
    //         } finally {
    //             event.target.value = '';
    //         }
    //     },
    //     [],
    // );

    const columns: ColumnDef<Application>[] = useMemo(() => {
        const selectColumn: ColumnDef<Application> = {
            id: "select",
            header: ({ table }) => (
                <input
                    type="checkbox"
                    className="size-4 rounded border-border text-blue-600 cursor-pointer"
                    checked={table.getIsAllPageRowsSelected()}
                    ref={(input) => {
                        if (input) {
                            input.indeterminate = table.getIsSomePageRowsSelected();
                        }
                    }}
                    onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
                    aria-label="Select all"
                />
            ),
            cell: ({ row }) => (
                <input
                    type="checkbox"
                    className="size-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    checked={row.getIsSelected()}
                    onChange={(e) => row.toggleSelected(e.target.checked)}
                    aria-label="Select row"
                />
            ),
            enableSorting: false,
            enableHiding: false,
        };

        const dataColumns: ColumnDef<Application>[] = [
            {
                accessorKey: "applicationId",
                header: () => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">ID</span>
                    </div>
                ),
                cell: ({ row }) => (
                    <span
                        className="font-medium text-foreground cursor-pointer hover:text-blue-600"
                        onClick={() =>
                            navigate(`/application-details/${row.original.applicationId}`)
                        }
                    >
                        {row.original.applicationId || "-"}
                    </span>
                ),
            },
            {
                id: "businessName",
                accessorFn: (row) => getApplicationBusinessDisplayName(row),
                header: () => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">BUSINESS NAME</span>
                    </div>
                ),
                cell: ({ row }) => (
                    <span className="text-foreground">
                        {getApplicationBusinessDisplayName(row.original)}
                    </span>
                ),
            },
            {
                id: "email",
                accessorFn: (row) => getClientEmail(row.client),
                header: () => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">EMAIL</span>
                    </div>
                ),
                cell: ({ row }) => (
                    <span className="text-foreground">{getClientEmail(row.original.client)}</span>
                ),
            },
            {
                id: "loanAmount",
                accessorFn: (row) => resolveApplicationDisplayLoanAmount(row),
                header: () => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">Loan Amount</span>
                    </div>
                ),
                cell: ({ row }) => {
                    const loanAmount = resolveApplicationDisplayLoanAmount(row.original);
                    if (loanAmount == null) return <span className="text-foreground">-</span>;
                    const rounded = Math.round(loanAmount);
                    return <span className="text-foreground">${rounded}</span>;
                },
            },
            {
                id: "currentQueue",
                accessorFn: (row) =>
                    String(row.currentQueue ?? row.queue ?? "")
                        .trim()
                        .toLowerCase(),
                header: () => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">Current queue</span>
                    </div>
                ),
                cell: ({ row }) => {
                    const queue = getApplicationCurrentQueue(row.original);
                    return (
                        <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${currentQueueBadgeClass(queue)}`}
                        >
                            {queue}
                        </span>
                    );
                },
            },
            {
                accessorKey: "createdAt",
                header: () => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">CREATED AT</span>
                    </div>
                ),
                cell: ({ row }) => (
                    <span className="text-foreground">{formatDate(row.original.createdAt)}</span>
                ),
            },
            {
                accessorKey: "lastModifiedAt",
                header: () => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">Last Modified Date</span>
                    </div>
                ),
                cell: ({ row }) => {
                    const value =
                        (row.original as any).lastModifiedAt ??
                        (row.original as any).updatedAt ??
                        row.original.createdAt;
                    return <span className="text-foreground">{formatDate(value)}</span>;
                },
            },
            {
                id: "view",
                header: () => <span className="font-medium text-foreground">VIEW</span>,
                cell: ({ row }) => (
                    <button
                        type="button"
                        onClick={() => handleOpenApplicationDetails(row.original)}
                        className="flex items-center justify-center text-[var(--brand)] hover:text-[var(--brand-accent-strong)] cursor-pointer"
                        aria-label="View application details"
                    >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs font-bold">
                            i
                        </span>
                    </button>
                ),
                enableSorting: false,
                enableHiding: false,
            },
        ];

        return [selectColumn, ...dataColumns];
    }, [
        formatDate,
        getApplicationCurrentQueue,
        getApplicationBusinessDisplayName,
        getClientEmail,
        handleOpenApplicationDetails,
        navigate,
    ]);

    const tableRows = applications ?? [];
    const applicationsListBlockingLoad = isListBlockingLoad({
        rowCount: tableRows.length,
        loading,
        isRefreshing: applicationsRefreshing,
    });
    const totalItems = apiPagination?.total ?? tableRows.length;
    const pageCount =
        apiPagination?.totalPages ??
        Math.max(1, Math.ceil(totalItems / pagination.pageSize) || 1);

    const table = useReactTable({
        data: tableRows,
        columns,
        pageCount,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onPaginationChange: (updater) => {
            const next = typeof updater === 'function' ? updater(pagination) : updater;
            setPagination(next);
        },
        manualPagination: true,
        state: { pagination, rowSelection },
        onRowSelectionChange: setRowSelection,
        getRowId: (row) => row._id,
    });

    const fetchApplications = useCallback(() => {
        dispatch(
            getApplications(
                buildApplicationsListParams({
                    pageIndex: pagination.pageIndex,
                    pageSize: pagination.pageSize,
                    searchTerm: debouncedSearchTerm,
                    dashboardStateFilter: "",
                    statusFilter: "all",
                }),
            ),
        );
    }, [
        dispatch,
        pagination.pageIndex,
        pagination.pageSize,
        debouncedSearchTerm,
    ]);

    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 400);
        return () => window.clearTimeout(t);
    }, [searchTerm]);

    useEffect(() => {
        setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
    }, [debouncedSearchTerm]);

    const handleBulkDelete = useCallback(async () => {
        if (selectedApplicationIds.length === 0) return;

        const confirmed = window.confirm(
            `Are you sure you want to delete ${selectedApplicationIds.length} selected application(s)?`,
        );
        if (!confirmed) return;

        isBulkDeleteRef.current = true;
        try {
            await Promise.all(
                selectedApplicationIds.map((id) => dispatch(deleteApplication(id)).unwrap()),
            );

            toast.success(
                selectedApplicationIds.length === 1
                    ? "Application deleted successfully!"
                    : `${selectedApplicationIds.length} applications deleted successfully!`,
            );

            dispatch(resetDeleteApplication());
            setRowSelection({});
            fetchApplications();
            dispatch(getApplicationStats());
        } catch (err: unknown) {
            const message =
                err && typeof err === "object" && "message" in err
                    ? String((err as { message: string }).message)
                    : "Failed to delete some applications";
            toast.error(message);
            dispatch(resetDeleteApplication());
            fetchApplications();
            setRowSelection({});
        } finally {
            isBulkDeleteRef.current = false;
        }
    }, [dispatch, selectedApplicationIds, fetchApplications]);

    useEffect(() => {
        fetchApplications();
    }, [fetchApplications]);

    useEffect(() => {
        dispatch(getApplicationStats());
    }, [dispatch]);

    useEffect(() => {
        const range = getPreviousMonthDateRangeET();
        if (!range) return;
        const startDate = range.start;
        const endDate = range.end;

        const fetchPrevStats = async () => {
            try {
                const queryParams = new URLSearchParams();
                queryParams.append("startDate", startDate);
                queryParams.append("endDate", endDate);
                const url = `/applications/stats${queryParams.toString() ? `?${queryParams.toString()}` : ""
                    }`;
                const response = await axiosGet(url);
                const payload = response.data as { data?: ApplicationStatsData } & ApplicationStatsData;
                const data = (payload?.data ?? payload) as ApplicationStatsData;
                setPrevMonthStats(data);
            } catch {
                setPrevMonthStats(null);
            }
        };

        fetchPrevStats();
    }, []);

    useEffect(() => {
        // Load most recent global contract template from backend (with localStorage fallback)
        const fetchTemplate = async () => {
            try {
                const response = await axiosGet('/contract-templates/latest');
                const data = response.data?.data;
                if (data?.url) {
                    const template = {
                        url: data.url as string,
                        originalName: (data.originalName as string) || 'Contract.pdf',
                    };
                    setContractTemplate(template);
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('globalContractTemplate', JSON.stringify(template));
                    }
                    return;
                }
            } catch (error) {
                console.error('Failed to fetch latest contract template:', error);
            }

            if (typeof window === 'undefined') return;
            try {
                const raw = localStorage.getItem('globalContractTemplate');
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (parsed?.url) {
                    setContractTemplate({
                        url: parsed.url as string,
                        originalName: (parsed.originalName as string) || 'Contract.pdf',
                    });
                }
            } catch (error) {
                console.error('Failed to read global contract template from storage:', error);
            }
        };

        fetchTemplate();
    }, []);

    useEffect(() => {
        if (deleteSuccess) {
            if (isBulkDeleteRef.current) {
                dispatch(resetDeleteApplication());
                return;
            }

            toast.success('Application deleted successfully!');
            dispatch(resetDeleteApplication());
            fetchApplications();
            dispatch(getApplicationStats());
        }
        if (deleteError) {
            toast.error(deleteError);
            dispatch(resetDeleteApplication());
        }
    }, [deleteSuccess, deleteError, dispatch, fetchApplications]);

    return (
        <div className="min-h-screen bg-background p-4 md:p-6">
            <div className="max-w-[1600px] mx-auto">
                {/* Header - All Submissions + Contract Template upload */}
                <div
                    className={`flex items-center justify-between p-6 rounded-lg shadow-[0px_4px_20px_0px_#00000005] ${isDark ? "bg-[#141517]" : "bg-white"
                        }`}
                >
                    <h1 className="text-[1.2rem] font-semibold text-foreground font-roboto">All Submissions</h1>
                    {/* <div className="flex items-center gap-3">
                        {contractTemplate?.originalName && (
                            <span className="text-xs text-[#4B5563]">
                                Template:&nbsp;
                                <span className="font-semibold">
                                    {contractTemplate.originalName}
                                </span>
                            </span>
                        )}
                        <input
                            ref={templateInputRef}
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={handleContractTemplateChange}
                        />
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 text-xs font-medium cursor-pointer"
                            onClick={() => templateInputRef.current?.click()}
                        >
                            Upload Contract Template
                        </Button>
                    </div> */}
                </div>

                <section
                    className={`mt-6 mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${statsGridCols} gap-5`}
                >
                    {stats.map((c, i) => (
                        <div
                            key={i}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    (e.currentTarget as HTMLDivElement).click();
                                }
                            }}
                            onClick={() => {
                                const q = statCardTitleToApplicationsQuery(c.title);
                                navigate(buildApplicationsBrowseUrl(q));
                            }}
                            className={`rounded-lg border py-3 px-5 shadow-[0px_4px_20px_0px_#00000005] cursor-pointer transition duration-300 hover:ring-2 hover:ring-[var(--brand)]/25 ${isDark ? "hover:shadow-lg" : "hover:shadow-lg"
                                } ${isDark
                                    ? "bg-[#141517] border-[#374151]"
                                    : "bg-card border-[#FDFDFD]"
                                }`}
                        >
                            <div className="flex flex-col items-start gap-1 font-inter">
                                <div className="w-full flex items-center justify-between gap-4">
                                    <div className="flex flex-col items-start gap-2">
                                        <p className="text-sm text-muted-foreground font-semibold font-inter">
                                            {c.title}
                                        </p>
                                        <div className="text-2xl font-[700] text-foreground font-inter">
                                            {c.value}
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full flex items-center justify-between gap-4">
                                    <div className="">
                                        <span
                                            className={`text-[12px] ${(c as { changeClass?: string }).changeClass
                                                    ? (c as { changeClass: string }).changeClass
                                                    : isDark
                                                        ? "text-green-400"
                                                        : "text-[#16A34A]"
                                                }`}
                                        >
                                            {(c as { changeLabel?: string }).changeLabel ??
                                                "No change from last month"}
                                        </span>
                                    </div>
                                    <div className=" flex items-center gap-1 text-foreground text-[1rem] font-[700]">
                                        <span>{c.money}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </section>

                {(statsRefreshing || applicationsRefreshing) && (
                    <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                        Updating applications…
                    </p>
                )}

                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                        {error}
                    </div>
                )}

                {/* Applications table */}
                <div
                    className={`mt-5 rounded-[5px] border shadow-[0px_4px_20px_0px_#00000005] bg-card border-[#FDFDFD]`}
                >
                    <div
                        className={`px-4 md:px-5 py-2 rounded-t-[5px] flex flex-wrap items-center justify-between gap-3 bg-[#F9FAFD]`}
                    >
                        <span className="font-semibold text-[1rem] text-foreground font-roboto">Submissions</span>
                        <div className="flex flex-1 min-w-[200px] max-w-md items-center gap-2 justify-end">
                            <div className="relative flex-1 min-w-0">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    placeholder="Search by name, email..."
                                    className="pl-9 h-9 bg-card"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    aria-label="Search applications"
                                />
                            </div>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="gap-1 cursor-pointer text-xs shrink-0"
                                disabled={selectedApplicationIds.length === 0 || deleteLoading}
                                onClick={handleBulkDelete}
                            >
                                <Trash2 className="size-3" />
                                Delete
                            </Button>
                        </div>
                    </div>

                    <div className="p-1">
                        <div className="overflow-x-auto rounded-xl">
                            <DataTableContent
                                table={table}
                                loading={applicationsListBlockingLoad}
                                loadingMessage="Loading applications..."
                                emptyMessage={
                                    debouncedSearchTerm.trim()
                                        ? "No matching applications"
                                        : "No applications found"
                                }
                                emptySubMessage={
                                    debouncedSearchTerm.trim()
                                        ? "Try a different search term"
                                        : "Try adjusting your search or filter criteria"
                                }
                            />
                        </div>
                    </div>

                    {totalItems > 0 && (
                            <DataTablePagination
                                table={table}
                                totalItems={totalItems}
                                showSelectedCount={false}
                            />
                        )}
                </div>

                <ApplicationDetailsSheet
                    application={viewApplication}
                    open={!!viewApplication}
                    onOpenChange={(open) => {
                        if (!open) setViewApplication(null);
                    }}
                />
            </div>
        </div>
    );
}
