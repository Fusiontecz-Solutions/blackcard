import { useEffect, useMemo, useState } from 'react';
import { Download, Filter, FileText, ChevronDown } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '@/redux/store';
import { getApplications } from '@/redux/actions/applicationActions';
import { getTermsOffers } from '@/redux/actions/termsOfferActions';
import type { Application } from '@/types/applicationTypes';
import type { TermsOffer } from '@/types/termsOfferTypes';
import { formatCurrency, formatInt } from '@/lib/utils';
import * as XLSX from 'xlsx-js-style';

type ReportRow = {
    id: number;
    merchant: string;
    agent: string;
    dealId: string;
    fundedAmount: number;
    approvedAmount: number;
    commission: number;
    status: 'Pending' | 'Paid';
    // Deal pipeline status for charting approved / funded amounts in this report
    dealStatus: 'Approved' | 'Funded';
    date: string;
};

const Reports = () => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const dispatch = useDispatch<AppDispatch>();
    const { data: applications } = useSelector(
        (state: RootState) => state.applications,
    );
    const { data: termsOffers } = useSelector(
        (state: RootState) => state.termsOffers,
    );

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'Funded' | 'Approved' | 'Paid'>('all');
    const [timePeriod, setTimePeriod] = useState<'monthly' | 'weekly' | 'yearly'>('monthly');

    // Load recent applications and related terms offers for reports
    useEffect(() => {
        dispatch(
            getApplications({
                page: 1,
                limit: 200,
                sortBy: 'createdAt',
                sortOrder: 'desc',
            }),
        );
        dispatch(
            getTermsOffers({
                limit: 500,
            } as any),
        );
    }, [dispatch]);

    // Map terms offers to sums by applicationId (approved amount + commission)
    const termsByApplicationId = useMemo(() => {
        const map = new Map<
            number,
            {
                approvedAmount: number;
                commission: number;
            }
        >();

        (termsOffers as TermsOffer[] | undefined)?.forEach((offer) => {
            const appRef = offer.application as any;
            const appId: number | undefined =
                typeof appRef === 'object' && appRef !== null
                    ? appRef.applicationId
                    : typeof appRef === 'number'
                        ? appRef
                        : undefined;

            if (!appId) return;

            const existing = map.get(appId) ?? { approvedAmount: 0, commission: 0 };
            const approvedAmount = offer.approvedAmount ?? 0;
            const commissionAmount = offer.commissionAmount ?? 0;

            map.set(appId, {
                approvedAmount: existing.approvedAmount + approvedAmount,
                commission: existing.commission + commissionAmount,
            });
        });

        return map;
    }, [termsOffers]);

    // Build dynamic report rows from real application data
    const reportRows: ReportRow[] = useMemo(() => {
        const apps = (applications as Application[] | undefined) ?? [];
        const rows: ReportRow[] = [];

        apps.forEach((app) => {
            const client: any =
                app && typeof (app as any).client === 'object' ? (app as any).client : null;
            const merchant: string =
                client?.business?.name ||
                client?.businessName ||
                client?.owner?.firstName ||
                'Unknown';

            const referringAgent: any = (app as any).referringAgent;
            const salesRep: any = (app as any).salesRepresentative;
            const agentSource = referringAgent || salesRep;
            const agentName: string = agentSource
                ? `${agentSource.firstName || ''} ${agentSource.lastName || ''}`.trim() ||
                  agentSource.email ||
                  'Unknown'
                : 'Unknown';

            const appId = app.applicationId;
            if (appId == null) return;
            const dealId = `#APL-${appId}`;

            // Prefer approvedAmount from terms offers when available; fall back to loanAmount
            const termsAgg = termsByApplicationId.get(appId);
            const approvedAmount =
                termsAgg && termsAgg.approvedAmount > 0
                    ? termsAgg.approvedAmount
                    : app.loanAmount ?? 0;

            const commission = termsAgg?.commission ?? 0;

            const queue = app.currentQueue;
            const state = app.currentState;
            const isFunded = queue === 'Approved' && state === 'Completed';
            const isApproved = queue === 'Approved' && state !== 'Completed';

            // Only include applications that are truly Approved or Funded
            if (!isFunded && !isApproved) return;

            const dealStatus: 'Approved' | 'Funded' = isFunded ? 'Funded' : 'Approved';

            // "status" here represents commission payout status (Paid vs Pending)
            const status: 'Pending' | 'Paid' = isFunded ? 'Paid' : 'Pending';

            // Business rules for amounts:
            // - Approved: approvedAmount > 0, fundedAmount = 0
            // - Funded: fundedAmount === approvedAmount
            // - Until funded, fundedAmount must remain 0
            const fundedAmount = isFunded ? approvedAmount : 0;

            const date = app.createdAt || new Date().toISOString();

            if (approvedAmount > 0 || fundedAmount > 0) {
                rows.push({
                    id: appId,
                    merchant,
                    agent: agentName,
                    dealId,
                    fundedAmount,
                    approvedAmount,
                    commission,
                    status,
                    dealStatus,
                    date,
                });
            }
        });

        return rows;
    }, [applications, termsByApplicationId]);

    const filteredRows = useMemo(() => {
        return reportRows.filter((row) => {
            const matchesSearch =
                !search ||
                row.merchant.toLowerCase().includes(search.toLowerCase()) ||
                row.agent.toLowerCase().includes(search.toLowerCase()) ||
                row.dealId.toLowerCase().includes(search.toLowerCase());

            let matchesStatus = true;
            if (statusFilter === 'Funded') {
                matchesStatus = row.dealStatus === 'Funded';
            } else if (statusFilter === 'Approved') {
                matchesStatus = row.dealStatus === 'Approved';
            } else if (statusFilter === 'Paid') {
                matchesStatus = row.status === 'Paid';
            }

            return matchesSearch && matchesStatus;
        });
    }, [reportRows, search, statusFilter]);

    const summary = useMemo(() => {
        let totalFunded = 0;
        let totalApproved = 0;
        let totalCommission = 0;
        let pending = 0;
        let paid = 0;
        let fundedDeals = 0;
        let approvedDeals = 0;

        for (const r of reportRows) {
            totalFunded += r.fundedAmount;
            totalApproved += r.approvedAmount;
            totalCommission += r.commission;

            if (r.dealStatus === 'Funded') fundedDeals += 1;
            else if (r.dealStatus === 'Approved') approvedDeals += 1;

            if (r.status === 'Pending') pending += 1;
            if (r.status === 'Paid') paid += 1;
        }

        return {
            totalFunded,
            totalApproved,
            totalCommission,
            pending,
            paid,
            fundedDeals,
            approvedDeals,
        };
    }, [reportRows]);

    console.log("reportRows",reportRows);

    // Prepare data for bar chart (approved / funded / declined amounts by time period)
    const barChartData = useMemo(() => {
        const periodData: {
            [key: string]: {
                period: string;
                approved: number;
                funded: number;
                declined: number;
                dateKey: string;
            };
        } = {};

        const formatYmd = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const referenceDate = reportRows.length > 0 ? new Date(reportRows[0].date) : new Date();

        // If monthly, initialize all days of the month
        if (timePeriod === 'monthly') {
            const year = referenceDate.getFullYear();
            const month = referenceDate.getMonth();

            // Get the number of days in the month (handles leap years for February)
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            // Initialize all days of the month
            for (let day = 1; day <= daysInMonth; day++) {
                const periodKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                periodData[periodKey] = {
                    period: String(day),
                    approved: 0,
                    funded: 0,
                    declined: 0,
                    dateKey: periodKey,
                };
            }
        }

        // If weekly, initialize all weeks that intersect the month
        if (timePeriod === 'weekly') {
            const year = referenceDate.getFullYear();
            const month = referenceDate.getMonth();
            const rangeStart = new Date(year, month, 1);
            rangeStart.setHours(0, 0, 0, 0);
            const rangeEnd = new Date(year, month + 1, 0);
            rangeEnd.setHours(23, 59, 59, 999);

            const d = new Date(rangeStart);
            d.setDate(d.getDate() - d.getDay()); // Sunday
            d.setHours(0, 0, 0, 0);

            while (d <= rangeEnd) {
                const weekStart = new Date(d);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                weekEnd.setHours(23, 59, 59, 999);

                const periodKey = formatYmd(weekStart);
                const periodLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

                periodData[periodKey] = {
                    period: periodLabel,
                    approved: 0,
                    funded: 0,
                    declined: 0,
                    dateKey: periodKey,
                };

                d.setDate(d.getDate() + 7);
            }
        }

        // If yearly, initialize all 12 months
        if (timePeriod === 'yearly') {
            // Get the year from the data (use current year if no data)
            const year = reportRows.length > 0
                ? new Date(reportRows[0].date).getFullYear()
                : new Date().getFullYear();

            // Initialize all 12 months
            for (let month = 0; month < 12; month++) {
                const date = new Date(year, month, 1);
                const periodKey = `${year}-${String(month + 1).padStart(2, '0')}`;
                const periodLabel = date.toLocaleDateString('en-US', { month: 'short' });
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-01`;
                periodData[periodKey] = {
                    period: periodLabel,
                    approved: 0,
                    funded: 0,
                    declined: 0,
                    dateKey,
                };
            }
        }

        reportRows.forEach((row) => {
            const date = new Date(row.date);
            let periodKey = '';
            let periodLabel = '';

            if (timePeriod === 'monthly') {
                // Group by day (1-31, etc.)
                periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                periodLabel = String(date.getDate());
            } else if (timePeriod === 'weekly') {
                // Get the start of the week (Sunday)
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                // Create a unique key for the week
                periodKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
                periodLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            } else if (timePeriod === 'yearly') {
                // Show all 12 months for yearly view
                periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                periodLabel = date.toLocaleDateString('en-US', { month: 'short' });
            }

            if (!periodData[periodKey]) {
                const dateKey =
                    timePeriod === 'yearly'
                        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
                        : periodKey;

                periodData[periodKey] = {
                    period: periodLabel,
                    approved: 0,
                    funded: 0,
                    declined: 0,
                    dateKey,
                };
            }

            // Sum amounts into the correct bucket based on dealStatus
            if (row.dealStatus === 'Approved') {
                // For approved deals, chart should reflect approvedAmount, not fundedAmount (which is 0)
                periodData[periodKey].approved += row.approvedAmount;
            } else if (row.dealStatus === 'Funded') {
                periodData[periodKey].funded += row.fundedAmount;
            } else if (row.dealStatus === 'Declined') {
                // For declined, we can still chart the originally approved amount
                periodData[periodKey].declined += row.approvedAmount;
            }
        });

        const sortedEntries = Object.entries(periodData).sort(([, a], [, b]) =>
            a.dateKey.localeCompare(b.dateKey),
        );

        return sortedEntries.map(([, value]) => value);
    }, [reportRows, timePeriod]);

    // Prepare data for pie chart (status distribution)
    const pieChartData = useMemo(() => {
        const { pending, paid } = summary;

        return [
            { name: 'Paid', value: paid, color: 'var(--brand)' },
            { name: 'Pending', value: pending, color: '#7DB3CF' },
        ];
    }, [summary]);

    const handleExportCsv = () => {
        if (!filteredRows || filteredRows.length === 0) {
            return;
        }

        const headers = [
            'Merchant',
            'Agent',
            'Deal ID',
            'Approved Amount',
            'Funded Amount',
            'Commission',
            'Deal Status',
            'Payout Status',
            'Date',
        ];

        const data = filteredRows.map((row) => [
            row.merchant,
            row.agent,
            row.dealId,
            row.approvedAmount,
            row.fundedAmount,
            row.commission,
            row.dealStatus,
            row.status,
            new Date(row.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            }),
        ]);

        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Reports');

        const excelBuffer = XLSX.write(workbook, {
            bookType: 'xlsx',
            type: 'array',
        });

        const blob = new Blob([excelBuffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const now = new Date();
        const fileName = `reports_${now.getFullYear()}-${String(
            now.getMonth() + 1,
        ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xlsx`;

        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-background p-4 md:p-6">
            {/* Header */}
            <div
                className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-lg shadow-[0px_4px_20px_0px_#00000005] ${isDark ? 'bg-[#141517]' : 'bg-white'
                    }`}
            >
                <div>
                    <h1 className="text-[1.2rem] font-semibold text-foreground font-roboto">
                        Reports
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Overview of your funded deals and commissions.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* <Button
                        variant="outline"
                        className="gap-2 bg-transparent border border-border text-foreground cursor-pointer"
                    >
                        <Calendar className="size-4" />
                        This Month
                    </Button> */}
                    <Button
                        className="gap-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer"
                        onClick={handleExportCsv}
                    >
                        <Download className="size-4" />
                        Export Excel
                    </Button>
                </div>
            </div>

            {/* Summary cards */}
            <section className="mt-6 mb-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                <div
                    className={`rounded-lg border py-3 px-5 shadow-[0px_4px_20px_0px_#00000005] ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]'
                        }`}
                >
                    <p className="text-sm text-muted-foreground font-semibold">Total Funded</p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="text-2xl font-[700] text-foreground">
                            {formatCurrency(summary.totalFunded)}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {summary.fundedDeals} deals
                        </span>
                    </div>
                </div>

                <div
                    className={`rounded-lg border py-3 px-5 shadow-[0px_4px_20px_0px_#00000005] ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]'
                        }`}
                >
                    <p className="text-sm text-muted-foreground font-semibold">Total Approved</p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="text-2xl font-[700] text-foreground">
                            {formatCurrency(summary.totalApproved)}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {summary.approvedDeals} deals
                        </span>
                    </div>
                </div>
                

                
                <div
                    className={`rounded-lg border py-3 px-5 shadow-[0px_4px_20px_0px_#00000005] ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]'
                        }`}
                >
                    <p className="text-sm text-muted-foreground font-semibold">Pending Payouts</p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="text-2xl font-[700] text-foreground">
                            {summary.pending}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {summary.pending} deals
                        </span>
                    </div>
                </div>
                <div
                    className={`rounded-lg border py-3 px-5 shadow-[0px_4px_20px_0px_#00000005] ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]'
                        }`}
                >
                    <p className="text-sm text-muted-foreground font-semibold">Paid Deals</p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="text-2xl font-[700] text-foreground">
                            {summary.paid}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {summary.paid} deals
                        </span>
                    </div>
                </div>
            </section>

            {/* Charts Section */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Bar Chart - Deal Status Amount Trends */}
                <div
                    className={`rounded-lg border shadow-[0px_4px_20px_0px_#00000005] p-5 ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]'
                        }`}
                >
                    <div className="mb-4 flex items-start justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">
                                {timePeriod === 'monthly' ? 'Monthly' : timePeriod === 'weekly' ? 'Weekly' : 'Yearly'} Deal Status Amounts
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                {timePeriod === 'yearly'
                                    ? 'Approved, funded, and declined amounts by month (all 12 months)'
                                    : timePeriod === 'monthly'
                                        ? 'Approved, funded, and declined amounts by day (all days of the month)'
                                        : 'Approved, funded, and declined amounts by week'
                                }
                            </p>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="h-9 gap-2 text-muted-foreground bg-card"
                                >
                                    <span className="capitalize">{timePeriod}</span>
                                    <ChevronDown className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-32">
                                <DropdownMenuItem onClick={() => setTimePeriod('monthly')}>
                                    Monthly
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTimePeriod('weekly')}>
                                    Weekly
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTimePeriod('yearly')}>
                                    Yearly
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                            data={barChartData}
                            barGap={0} // remove space between Approved / Funded / Declined bars
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
                            <XAxis
                                dataKey="period"
                                stroke={isDark ? '#9CA3AF' : '#6B7280'}
                                style={{ fontSize: '12px' }}
                            />
                            <YAxis
                                stroke={isDark ? '#9CA3AF' : '#6B7280'}
                                style={{ fontSize: '12px' }}
                                tickFormatter={(value) => `$ ${formatInt((value as number) / 1000)}k`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                                    border: isDark ? '1px solid #374151' : '1px solid #E5E7EB',
                                    borderRadius: '8px',
                                }}
                                formatter={(value, name) => [
                                    formatCurrency(Number(value ?? 0)),
                                    String(name ?? ''),
                                ]}
                                labelFormatter={(label, payload) => {
                                    const first = payload && payload[0];
                                    const dateKey =
                                        first && first.payload
                                            ? (first.payload as { dateKey?: string }).dateKey
                                            : undefined;

                                    if (timePeriod === 'monthly' && dateKey) {
                                        const d = new Date(dateKey);
                                        if (!isNaN(d.getTime())) {
                                            const monthShort = d
                                                .toLocaleDateString('en-US', { month: 'short' })
                                                .toUpperCase();
                                            const day = d.getDate();
                                            return `${monthShort}-${day}`;
                                        }
                                    }

                                    return label;
                                }}
                            />
                            <Legend />
                            <Bar
                                dataKey="approved"
                                name="Approved Amount"
                                fill="var(--brand)"
                                radius={[4, 4, 0, 0]}
                            />
                            <Bar
                                dataKey="funded"
                                name="Funded Amount"
                                fill="#7DB3CF"
                                radius={[4, 4, 0, 0]}
                            />
                            <Bar
                                dataKey="declined"
                                name="Declined Amount"
                                fill="#CFE4F0"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Pie Chart - Status Distribution */}
                <div
                    className={`rounded-lg border shadow-[0px_4px_20px_0px_#00000005] p-5 ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]'
                        }`}
                >
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-foreground">Status Distribution</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Breakdown of paid vs pending deals
                        </p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={pieChartData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, value, percent }) =>
                                    `${name}: ${formatCurrency(Number(value ?? 0))} (${formatInt(percent ? (percent * 100) : 0)}%)`
                                }
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {pieChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                                    border: isDark ? '1px solid #374151' : '1px solid #E5E7EB',
                                    borderRadius: '8px',
                                }}
                                formatter={(value, name) => [
                                    formatCurrency(Number(value ?? 0)),
                                    String(name ?? ''),
                                ]}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-col md:flex-row items-stretch md:items-center gap-3 justify-between">
                <div className="flex items-center gap-3 w-full md:max-w-[520px]">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                className="h-10 gap-2 text-muted-foreground bg-card cursor-pointer"
                            >
                                <Filter className="size-4" />
                                <span className="capitalize">
                                    {statusFilter === 'all' ? 'All Statuses' : statusFilter}
                                </span>
                                <ChevronDown className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => setStatusFilter('all')}>
                                All Statuses
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setStatusFilter('Funded')}>
                                Funded
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setStatusFilter('Approved')}>
                                Approved
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setStatusFilter('Paid')}>
                                Paid
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="relative flex-1">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by merchant, agent, or deal ID..."
                            className="pl-9 h-10 bg-card"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div
                className={`mt-5 rounded-[5px] border shadow-[0px_4px_20px_0px_#00000005] ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]'
                    }`}
            >
                <div
                    className={`px-4 md:px-5 py-2 rounded-t-[5px] flex items-center justify-between ${isDark ? 'bg-[#2A2B2F]' : 'bg-[#F9FAFD]'
                        }`}
                >
                    <div className="flex items-center gap-3">
                        <span className="font-semibold text-[1rem] text-foreground font-roboto">
                            Recent deals
                        </span>
                    </div>
                </div>

                <div className="p-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground border-b">
                                <th className="py-2 pr-4 font-medium">Merchant</th>
                                <th className="py-2 pr-4 font-medium">Agent</th>
                                <th className="py-2 pr-4 font-medium">Deal ID</th>
                                <th className="py-2 pr-4 font-medium">Funded Amount</th>
                                <th className="py-2 pr-4 font-medium">Commission</th>
                                <th className="py-2 pr-4 font-medium">Status</th>
                                <th className="py-2 pr-4 font-medium">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="py-6 text-center text-muted-foreground text-sm"
                                    >
                                        No deals match your filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((row) => (
                                    <tr
                                        key={row.id}
                                        className="border-b last:border-0 hover:bg-muted/40 transition-colors"
                                    >
                                        <td className="py-2 pr-4 text-foreground">{row.merchant}</td>
                                        <td className="py-2 pr-4 text-foreground">{row.agent}</td>
                                        <td className="py-2 pr-4 text-foreground">{row.dealId}</td>
                                        <td className="py-2 pr-4 text-foreground">
                                            {formatCurrency(row.fundedAmount)}
                                        </td>
                                        <td className="py-2 pr-4 text-foreground">
                                            {formatCurrency(row.commission)}
                                        </td>
                                        <td className="py-2 pr-4">
                                            <span
                                                className={`px-2 py-1 rounded-full text-xs font-medium ${row.status === 'Paid'
                                                    ? 'bg-[var(--brand)]/10 text-[var(--brand)]'
                                                    : 'bg-yellow-100 text-yellow-700'
                                                    }`}
                                            >
                                                {row.dealStatus}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-4 text-foreground">
                                            {new Date(row.date).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Reports;

