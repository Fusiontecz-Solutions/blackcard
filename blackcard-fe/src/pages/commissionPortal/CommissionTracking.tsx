import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDate as formatDateUtil, formatNumber } from '@/lib/utils';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from '@/context/ThemeContext';
import type { AppDispatch, RootState } from '@/redux/store';
import { deleteCommissionRequest, getCommissionRequests, updateCommissionRequestStatus } from '@/redux/actions/commissionRequestActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Calendar, ChevronDown, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';

type TimeFilter = 'all' | 'weekly' | 'monthly' | 'yearly';
type StatusFilter = 'all' | 'Pending' | 'Approved' | 'Rejected';

const CommissionTracking = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const { list: commissionRequests, listLoading } = useSelector(
        (state: RootState) => state.commissionRequest,
    );
    const userRole = useSelector(
        (state: RootState) => state.login?.data?.user?.role || localStorage.getItem('role') || '',
    );
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    const [search, setSearch] = useState('');
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
    const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);
    const [selectedReason, setSelectedReason] = useState('');

    useEffect(() => {
        dispatch(getCommissionRequests());
    }, [dispatch]);

    const filterByTime = (createdAt: string | Date | undefined | null): boolean => {
        if (timeFilter === 'all' || !createdAt) return true;
        const created = new Date(createdAt);
        if (Number.isNaN(created.getTime())) return false;

        const now = new Date();
        const diffMs = now.getTime() - created.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        switch (timeFilter) {
            case 'weekly':
                return diffDays <= 7;
            case 'monthly':
                return diffDays <= 31;
            case 'yearly':
                return diffDays <= 365;
            default:
                return true;
        }
    };

    const filteredRequests = useMemo(() => {
        if (!Array.isArray(commissionRequests)) return [];

        const term = search.trim().toLowerCase();

        return commissionRequests.filter((cr: any) => {
            const createdAt = cr.createdAt || cr.created_at;
            if (!filterByTime(createdAt)) return false;

            const status: string = cr.status || 'Pending';
            if (statusFilter !== 'all' && status !== statusFilter) return false;

            if (!term) return true;

            // Agent name from backend-resolved User (agentId) if available
            const agent = cr.agent;
            const agentName =
                (cr.agentName || '')
                    .toString()
                    .toLowerCase()
                    || (
                        agent && typeof agent === 'object'
                            ? `${(agent.firstName || '').toString()} ${(agent.lastName || '').toString()} `.trim().toLowerCase() ||
                              (agent.email || '').toString().toLowerCase()
                            : ''
                    );

            // Application ID (raw + numeric for display/search)
            const app = cr.application;
            const rawApplicationId =
                app && typeof app === 'object'
                    ? String(app.applicationId ?? '')
                    : String(app ?? '');
            const numericApplicationId =
                cr.applicationNumericId != null ? String(cr.applicationNumericId) : '';
            const companyDeal = String(cr.companyDeal || '').toLowerCase();

            const matchesId =
                rawApplicationId.toLowerCase().includes(term) ||
                numericApplicationId.toLowerCase().includes(term);

            return (
                agentName.includes(term) ||
                companyDeal.includes(term) ||
                matchesId
            );
        });
    }, [commissionRequests, search, timeFilter, statusFilter]);

    const summary = useMemo(() => {
        let pendingCount = 0;
        let pendingAmount = 0;
        let approvedCount = 0;
        let approvedThisMonth = 0;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        (commissionRequests || []).forEach((cr: any) => {
            const status: string = cr.status || 'Pending';
            const amount = Number(cr.fundingAmount || 0);

            if (status === 'Pending') {
                pendingCount += 1;
                pendingAmount += amount;
            }

            if (status === 'Approved') {
                approvedCount += 1;
                const createdAt = cr.createdAt || cr.created_at;
                if (createdAt) {
                    const d = new Date(createdAt);
                    if (!Number.isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                        approvedThisMonth += amount;
                    }
                }
            }
        });

        return {
            pendingCount,
            pendingAmount,
            approvedCount,
            approvedThisMonth,
        };
    }, [commissionRequests]);

    const handleApprove = async (id: string) => {
        try {
            await dispatch(
                updateCommissionRequestStatus({ id, status: 'Approved' }),
            ).unwrap();
            toast.success('Commission request approved');
        } catch (err: any) {
            toast.error(err || 'Failed to approve commission request');
        }
    };

    const openRejectModal = (id: string) => {
        setSelectedRequestId(id);
        setRejectReason('');
        setIsRejectModalOpen(true);
    };

    const handleRejectSubmit = async () => {
        if (!selectedRequestId) return;
        if (!rejectReason.trim()) {
            toast.error('Rejection reason is required');
            return;
        }
        try {
            await dispatch(
                updateCommissionRequestStatus({
                    id: selectedRequestId,
                    status: 'Rejected',
                    reason: rejectReason.trim(),
                }),
            ).unwrap();
            toast.success('Commission request rejected');
            setIsRejectModalOpen(false);
        } catch (err: any) {
            toast.error(err || 'Failed to reject commission request');
        }
    };

    const openReasonModal = (reason: string) => {
        if (!reason) return;
        setSelectedReason(reason);
        setIsReasonModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        const confirmed = window.confirm('Are you sure you want to delete this commission request?');
        if (!confirmed) return;
        try {
            await dispatch(deleteCommissionRequest(id)).unwrap();
            toast.success('Commission request deleted');
        } catch (err: any) {
            toast.error(err || 'Failed to delete commission request');
        }
    };

    return (
        <div className="min-h-screen flex bg-background">
            <main className="flex-1 min-w-0 overflow-x-hidden px-6 md:px-8 py-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
                        Commission Tracking
                    </h1>
                </div>

                {/* Summary cards */}
                <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                    {[
                        {
                            title: 'Pending Approval',
                            value: `${summary.pendingCount}`,
                            money: formatCurrency(summary.pendingAmount),
                        },
                        {
                            title: 'Scheduled (Approved)',
                            value: `${summary.approvedCount}`,
                            money: formatNumber(summary.approvedCount),
                        },
                        {
                            title: 'Paid This Month',
                            value: '',
                            money: formatCurrency(summary.approvedThisMonth),
                        },
                        {
                            title: 'Total Requests',
                            value: `${(commissionRequests || []).length}`,
                            money: '',
                        },
                    ].map((c, idx) => (
                        <div
                            key={idx}
                            className={`rounded-lg border py-3 px-5 shadow-[0px_4px_20px_0px_#00000005] ${
                                isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]'
                            }`}
                        >
                            <div className="flex flex-col gap-1">
                                <p className="text-sm text-muted-foreground font-inter">{c.title}</p>
                                <div className="mt-1 flex items-baseline gap-2 justify-between">
                                    <span className="text-[1.3rem] font-bold text-foreground font-inter">
                                        {c.money || c.value}
                                    </span>
                                    {c.money && c.value && (
                                        <span className="text-xs text-muted-foreground font-inter">
                                            {c.value} requests
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </section>

                {/* Filters */}
                <section
                    className={`mt-6 rounded-lg border shadow-[0px_4px_20px_0px_#00000005] p-4 ${
                        isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]'
                    }`}
                >
                    <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                        <div className="flex-1">
                            <Input
                                placeholder="Search rep, deal name, or ID"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full"
                            />
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {/* Time filter */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="h-9 gap-2">
                                        <Calendar className="size-4" />
                                        <span>
                                            {timeFilter === 'all'
                                                ? 'All Time'
                                                : timeFilter === 'weekly'
                                                    ? 'Weekly'
                                                    : timeFilter === 'monthly'
                                                        ? 'Monthly'
                                                        : 'Yearly'}
                                        </span>
                                        <ChevronDown className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onSelect={() => setTimeFilter('all')}>
                                        All Time
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setTimeFilter('weekly')}>
                                        Weekly
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setTimeFilter('monthly')}>
                                        Monthly
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setTimeFilter('yearly')}>
                                        Yearly
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Status filter */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="h-9 gap-2">
                                        <span>
                                            {statusFilter === 'all' ? 'All Statuses' : statusFilter}
                                        </span>
                                        <ChevronDown className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onSelect={() => setStatusFilter('all')}>
                                        All
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setStatusFilter('Pending')}>
                                        Pending
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setStatusFilter('Approved')}>
                                        Approved
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setStatusFilter('Rejected')}>
                                        Rejected
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </section>

                {/* Table */}
                <section
                    className={`mt-5 rounded-sm border shadow-[0px_4px_20px_0px_#00000005] ${
                        isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]'
                    }`}
                >
                    <div
                        className={`px-6 py-2 border-none rounded-t-sm flex items-center justify-between ${
                            isDark ? 'bg-[#2A2B2F]' : 'bg-[#F9FAFD]'
                        }`}
                    >
                        <span className="font-semibold text-foreground text-base font-roboto">
                            Commission Requests
                        </span>
                    </div>
                    <div className="p-1 md:p-2">
                        <div className="w-full max-w-full overflow-x-auto overflow-y-auto rounded-xl max-h-[420px]">
                            <Table className="min-w-[900px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-foreground px-6 font-roboto">DATE</TableHead>
                                        <TableHead className="text-foreground px-6 font-roboto">AGENT NAME</TableHead>
                                        <TableHead className="text-foreground px-6 font-roboto">APP ID</TableHead>
                                        <TableHead className="text-foreground px-6 font-roboto">FUNDED AMOUNT</TableHead>
                                        <TableHead className="text-foreground px-6 font-roboto">COMMISSION %</TableHead>
                                        <TableHead className="text-foreground px-6 font-roboto">COMMISSION AMOUNT</TableHead>
                                        <TableHead className="text-foreground px-6 font-roboto">STATUS</TableHead>
                                        <TableHead className="text-foreground px-6 font-roboto">REJECTION REASON</TableHead>
                                        {isAdmin && (
                                            <TableHead className="text-left text-foreground px-6 font-roboto">
                                                ACTIONS
                                            </TableHead>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {listLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={isAdmin ? 9 : 8} className="text-left py-6">
                                                Loading commission requests...
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredRequests.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={isAdmin ? 9 : 8} className="text-left py-6">
                                                No commission requests found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredRequests.map((cr: any, idx: number) => {
                                            const createdAt = cr.createdAt || cr.created_at;
                                            const dateStr = createdAt
                                                ? formatDateUtil(createdAt, "—")
                                                : '—';
                                            const agent = cr.agent;
                                            const agentName =
                                                (cr.agentName &&
                                                    cr.agentName.toString().trim()) ||
                                                (agent && typeof agent === 'object'
                                                    ? (
                                                        [`${agent.firstName || ''}`.trim(), `${agent.lastName || ''}`.trim()]
                                                            .filter(Boolean)
                                                            .join(' ') || agent.email
                                                    )
                                                    : '—');
                                            const app = cr.application;
                                            const applicationId =
                                                app && typeof app === 'object'
                                                    ? app.applicationId
                                                    : app;
                                            const fundedAmount = Number(cr.fundingAmount || 0);
                                            const commissionPercent = Number(cr.commissionPercentage || 0);
                                            const commissionAmount = fundedAmount * (commissionPercent / 100);
                                            const status: string = cr.status || 'Pending';
                                            const reason: string = cr.reason || '—';
                                            const rowId = cr._id || cr.id || idx.toString();

                                            const numericApplicationId = cr.applicationNumericId;
                                            const applicationIdDisplay =
                                                numericApplicationId != null
                                                    ? `App#${numericApplicationId}`
                                                    : (applicationId ?? '—');

                                            return (
                                                <TableRow
                                                    key={rowId}
                                                    className={`hover:bg-accent ${idx % 2 ? 'bg-muted/50' : ''}`}
                                                >
                                                    <TableCell className="text-foreground font-poppins px-6">
                                                        {dateStr}
                                                    </TableCell>
                                                    <TableCell className="text-foreground font-poppins px-6">
                                                        {agentName}
                                                    </TableCell>
                                                    <TableCell className="text-foreground font-poppins px-6">
                                                        {applicationIdDisplay}
                                                    </TableCell>
                                                    <TableCell className="text-foreground font-poppins px-6">
                                                        {formatCurrency(fundedAmount)}
                                                    </TableCell>
                                                    <TableCell className="text-foreground font-poppins px-6">
                                                        {commissionPercent || 0}%
                                                    </TableCell>
                                                    <TableCell className="text-foreground font-poppins px-6">
                                                        {formatCurrency(commissionAmount)}
                                                    </TableCell>
                                                    <TableCell className="text-foreground font-poppins px-6">
                                                        {status}
                                                    </TableCell>
                                                    <TableCell className="text-foreground font-poppins px-6 align-top">
                                                        {status === 'Rejected' ? (
                                                            <span
                                                                className="block text-sm leading-5 max-w-xs cursor-pointer whitespace-normal break-words"
                                                                style={{
                                                                    display: '-webkit-box',
                                                                    WebkitLineClamp: 2,
                                                                    WebkitBoxOrient: 'vertical',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                }}
                                                                title={reason}
                                                                onClick={() => openReasonModal(reason)}
                                                            >
                                                                {reason}
                                                            </span>
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </TableCell>
                                                    {isAdmin && (
                                                        <TableCell className="text-left font-poppins px-6 pr-8">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Button
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="border-green-600 cursor-pointer text-green-700 hover:bg-green-50 rounded-full"
                                                                    onClick={() => handleApprove(rowId)}
                                                                    title="Approve"
                                                                >
                                                                    <CheckCircle2 className="size-4 cursor-pointer" />
                                                                    <span className="sr-only">Approve</span>
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="border-red-600 cursor-pointer text-red-700 hover:bg-red-50 rounded-full"
                                                                    onClick={() => openRejectModal(rowId)}
                                                                    title="Reject"
                                                                >
                                                                    <XCircle className="size-4 cursor-pointer" />
                                                                    <span className="sr-only">Reject</span>
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="border-red-600  cursor-pointer text-red-700 hover:bg-red-50 rounded-full"
                                                                    onClick={() => handleDelete(rowId)}
                                                                    title="Delete"
                                                                >
                                                                    <Trash2 className="size-4 cursor-pointer" />
                                                                    <span className="sr-only cursor-pointer">Delete</span>
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </section>

                {/* Reject modal */}
                <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reject Commission Request</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Please provide a reason for rejecting this commission request.
                            </p>
                            <Input
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Enter rejection reason"
                            />
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsRejectModalOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleRejectSubmit}
                                    className="bg-red-600 cursor-pointer hover:bg-red-700 text-white"
                                >
                                    Reject
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Full rejection reason modal */}
                <Dialog open={isReasonModalOpen} onOpenChange={setIsReasonModalOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Rejection Reason</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                                {selectedReason}
                            </p>
                        </div>
                    </DialogContent>
                </Dialog>
            </main>
        </div>
    );
};

export default CommissionTracking;