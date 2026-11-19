import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
import type { AppDispatch, RootState } from '@/redux/store';
import { getApplications, updateApplicationQueue, updateApplicationState } from '@/redux/actions/applicationActions';
import { useTheme } from '@/context/ThemeContext';
import { Input } from '@/components/ui/input';
import { Search, LayoutGrid } from 'lucide-react';
import KanbanBoard from '@/components/caseManagement/KanbanBoard';
import type { Application } from '@/types/applicationTypes';
import { toast } from 'react-toastify';
import { filterApplicationsBySearchQuery } from '@/lib/applicationTableSearch';
import { isListBlockingLoad } from '@/lib/listLoading';

// Status configuration matching the screenshot
const STATUSES: Array<{ id: string; label: string; color: string }> = [
    { id: 'Pending', label: 'Pending', color: 'bg-blue-500' },
    { id: 'In Progress', label: 'In Progress', color: 'bg-purple-500' },
    { id: 'Approved', label: 'Approved', color: 'bg-green-500' },
    { id: 'Contracted', label: 'Contracted', color: 'bg-orange-500' },
    { id: 'Funded', label: 'Funded', color: 'bg-emerald-600' },
    { id: 'Declined', label: 'Declined', color: 'bg-red-500' },
];

const CaseManagement = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
    const [searchTerm, setSearchTerm] = useState('');

    // Get applications from Redux
    const { loading, isRefreshing, data: applications } = useSelector(
        (state: RootState) => state.applications
    );

    const kanbanBlockingLoad = isListBlockingLoad({
        rowCount: applications?.length ?? 0,
        loading,
        isRefreshing,
    });

    // Fetch all kanban cards (paginated merge) — accurate column counts, not a single-page cap.
    useEffect(() => {
        dispatch(
            getApplications({
                page: 1,
                limit: 500,
                lite: true,
                fetchAllPages: true,
                skipListCache: true,
            }),
        );
    }, [dispatch]);

    // Map status back to queue and state
    const mapStatusToQueueAndState = (status: string): { queue?: string; state?: string } => {
        switch (status) {
            case 'Pending':
                return { queue: 'New', state: 'Draft' };
            case 'In Progress':
                return { queue: 'Underwriting', state: 'In Progress' };
            case 'Approved':
                return { queue: 'Approved', state: 'Submitted' };
            case 'Contracted':
                return { queue: 'Contract Sent', state: 'CONTRACT_SENT' };
            case 'Funded':
                return { queue: 'Approved', state: 'Completed' };
            case 'Declined':
                return { queue: 'Declined', state: 'Cancelled' };
            default:
                return { queue: 'New', state: 'Draft' };
        }
    };

    // Map application queue/state to status
    const mapApplicationToStatus = (app: Application): string => {
        // Map based on currentQueue and currentState from the model (list API may use queue/state aliases)
        const queue = (app as any).currentQueue || app.queue;
        const state =
            (app as any).currentState || app.state || (app as any).statsCurrentState;

        if (!queue && !state && app.status) {
            const s = app.status;
            if (s === 'Funded') return 'Funded';
            if (s === 'Approved') return 'Approved';
            if (s === 'Rejected') return 'Declined';
            if (s === 'Pending') return 'Pending';
        }

        // Priority mapping based on queue and state
        if (queue === 'Approved') {
            // Check if it's funded (completed state) or just approved
            if (state === 'Completed') return 'Funded';
            // Approved status uses Submitted state
            if (state === 'Submitted' || state === 'In Progress') return 'Approved';
            // Default to Approved if queue is Approved but state is not specified
            return 'Approved';
        }
        if (queue === 'Declined') return 'Declined';
        if (queue === 'On Hold') return 'In Progress';
        if (queue === 'Contracted' || queue === 'Contract Sent' || queue === 'Contract Out' || queue === 'Contracts Out')
            return 'Contracted';
        if (queue === 'Scrubbing' || queue === 'Underwriter' || queue === 'Underwriting' || queue === 'Review' || queue === 'Final Review') return 'In Progress';
        if (queue === 'New') return 'Pending';
        
        // Fallback to state if queue doesn't match
        if (state === 'Completed' && queue === 'Approved') {
            return 'Funded';
        }
        if (state === 'Submitted' && queue === 'Approved') {
            return 'Approved';
        }
        if (state === 'Submitted' || state === 'In Progress') {
            // If queue is not Approved, it's In Progress
            if (queue !== 'Approved') return 'In Progress';
        }
        if (state === 'Cancelled') return 'Declined';
        
        return 'Pending';
    };

    // Handle card drop
    const handleCardDrop = useCallback(
        async (applicationId: string, newStatus: string) => {
            if (!applicationId?.trim()) return;

            const app = Array.isArray(applications)
                ? applications.find(
                      (a) =>
                          String(a._id) === String(applicationId) ||
                          (a.applicationId != null &&
                              String(a.applicationId) === String(applicationId)),
                  )
                : undefined;
            if (app && mapApplicationToStatus(app) === newStatus) {
                return;
            }

            try {
                const { queue, state } = mapStatusToQueueAndState(newStatus);

                if (queue) {
                    await dispatch(
                        updateApplicationQueue({
                            id: applicationId,
                            data: { currentQueue: queue },
                        }),
                    ).unwrap();
                }

                if (state) {
                    await dispatch(
                        updateApplicationState({
                            id: applicationId,
                            data: { currentState: state },
                        }),
                    ).unwrap();
                }

                // Bust list cache — otherwise getApplications returns stale Kanban data
                await dispatch(
                    getApplications({ page: 1, limit: 1000, skipListCache: true }),
                ).unwrap();
                toast.success('Application status updated successfully');
            } catch (error: unknown) {
                console.error('Update application status error:', error);
                const message =
                    error &&
                    typeof error === 'object' &&
                    'message' in error &&
                    typeof (error as { message?: string }).message === 'string'
                        ? (error as { message: string }).message
                        : 'Failed to update application status';
                toast.error(message);
                try {
                    await dispatch(
                        getApplications({ page: 1, limit: 1000, skipListCache: true }),
                    ).unwrap();
                } catch {
                    /* ignore */
                }
            }
        },
        [dispatch, applications],
    );

    const applicationsMatchingSearch = useMemo(
        () => filterApplicationsBySearchQuery(applications, searchTerm),
        [applications, searchTerm],
    );

    // Group applications by status (after fast client-side search)
    const applicationsByStatus = useMemo(() => {
        if (!applicationsMatchingSearch || !Array.isArray(applicationsMatchingSearch)) return {};

        const grouped: Record<string, Application[]> = {};

        STATUSES.forEach(status => {
            grouped[status.id] = [];
        });

        applicationsMatchingSearch.forEach(app => {
            const status = mapApplicationToStatus(app);
            if (grouped[status]) {
                grouped[status].push(app);
            } else {
                grouped['Pending'].push(app);
            }
        });

        return grouped;
    }, [applicationsMatchingSearch]);

    // Calculate status counts
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        STATUSES.forEach(status => {
            counts[status.id] = applicationsByStatus[status.id]?.length || 0;
        });
        return counts;
    }, [applicationsByStatus]);

    return (
        <div className="min-h-screen bg-background p-4 md:p-6">
            <div className="max-w-screen-2xl mx-auto">
                {/* Header Section */}
                <div className="flex items-center w-full justify-between">
                    <div className="mb-6">
                        <h1 className="text-[22px] font-semibold text-foreground">
                            Case Management Board
                        </h1>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            Track and manage loan applications through the pipeline.
                        </p>
                    </div>
                    {/* View Toggle and Search */}
                    <div className="flex items-center justify-end gap-4 mb-6">
                        <div className="flex items-center gap-0 bg-gray-100 rounded-lg p-1 relative">
                            <button
                                onClick={() => setViewMode('kanban')}
                                className={`flex items-center gap-2 px-4 py-2 cursor-pointer rounded-md transition-all ${
                                    viewMode === 'kanban'
                                        ? 'bg-white text-gray-900 font-semibold shadow-sm'
                                        : 'text-gray-600 font-normal'
                                }`}
                            >
                                <LayoutGrid className="h-4 w-4" />
                                Kanban
                            </button>
                            {/* <button
                                onClick={() => setViewMode('list')}
                                className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-md transition-all ${
                                    viewMode === 'list'
                                        ? 'bg-white text-gray-900 font-semibold shadow-sm'
                                        : 'text-gray-600 font-normal'
                                }`}
                            >
                                <List className="h-4 w-4" />
                                List
                            </button> */}
                        </div>
                        <div className="relative w-full max-w-md">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="Search cases..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 bg-white border-gray-300 rounded-md"
                            />
                        </div>
                    </div>
                </div>

                {/* Status Summary Bar */}
                <div className={`flex flex-wrap items-center gap-4 mb-6 p-4  `}>
                    {STATUSES.map(status => (
                        <div key={status.id} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${status.color}`}></div>
                            <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                {status.label}: {statusCounts[status.id] || 0}
                            </span>
                        </div>
                    ))}
                </div>

                

                {/* Kanban Board or List View */}
                {viewMode === 'kanban' ? (
                    <KanbanBoard
                        applicationsByStatus={applicationsByStatus}
                        statuses={STATUSES}
                        loading={kanbanBlockingLoad}
                        onCardClick={(applicationId) => {
                            navigate(`/application-details/${applicationId}`);
                        }}
                        onDrop={handleCardDrop}
                    />
                ) : (
                    <div className={`p-4 rounded-lg ${isDark ? 'bg-card' : 'bg-white'} border border-border`}>
                        <p className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            List view coming soon...
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CaseManagement;

