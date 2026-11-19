import {
    ChevronDown,
    LayoutDashboard,
    TrendingUp,
    FileText,
    Users,
    Globe,
    Loader2,
    DollarSign,
    Percent,
    CheckCircle2,
    Clock,
    Ban,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatUSDShort, cn } from '@/lib/utils'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    type LegendPayload,
} from 'recharts'
import { useTheme } from '@/context/ThemeContext'
import { useState, useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router'
import type { AppDispatch, RootState } from '@/redux/store'
import { getApplications } from '@/redux/actions/applicationActions'
import { getCommissionRequests, getFundedDeals } from '@/redux/actions/commissionRequestActions'
import { hydrateApplicationsListFromCache } from '@/redux/slices/applicationSlice'
import {
    applicationsListParamsCacheKey,
    getCachedApplicationsList,
    getMostRecentCachedApplicationsList,
} from '@/lib/applicationsListCache'
import type { GetApplicationsParams } from '@/types/applicationTypes'
import { APPLICATIONS_TABLE_CLIENT_FETCH_LIMIT } from '@/lib/applicationTableSearch'
import {
    aggregateStatsFromRows,
    buildCommissionLookupByApplication,
    dealCommissionStatusClassName,
    dealCommissionStatusLabel,
    getCommissionForApplication,
    mapApplicationToHistoryRow,
} from './commissionHistoryShared'
import {
    type CommissionTrendPoint,
    buildCommissionTrendFromDealRows,
    buildTopIsosFromDealRows,
} from './commissionDashboardDerived'
import MonthHistoryCommission from './MonthHistoryCommission'
import DealDetails from './DealDetails'
import IsoManagement from './BrokerManagement'
import IsoPortal from './BrokerPortal'
import IsoCommissionDashboard from './IsoCommissionDashboard'
import { CornerSummaryCard } from './CornerSummaryCard'
// import isoPortal from './isoPortal'

type CommissionTab = 'dashboard' | 'monthlyHistory' | 'dealDetails' | 'isoCommission' | 'isoManagement' | 'isoPortal'

const RECENT_DEALS_LIMIT = 5

/** Match `DataTableContent` + Applications list table (`Applications.tsx`). */
const thRecentCommissionApps =
    'h-12 text-left px-6 align-middle text-[11px] uppercase tracking-wide text-muted-foreground'
const tdRecentCommissionApps =
    'text-left align-middle px-6 py-2 text-[0.85rem] text-foreground'

/** Tooltip title: matches bucket logic in `buildCommissionTrendFromDealRows` (current month / year). */
function formatCommissionTrendTooltipLabel(
    view: 'monthly' | 'weekly' | 'yearly',
    axisLabel: string,
): string {
    const raw = String(axisLabel ?? '').trim()
    if (!raw) return ''

    const now = new Date()
    const y = now.getFullYear()
    const monthLong = now.toLocaleDateString('en-US', { month: 'long' })

    if (view === 'monthly') {
        const day = Number(raw)
        if (Number.isFinite(day) && day >= 1 && day <= 31) {
            return `${monthLong} ${day}`
        }
        return raw
    }

    if (view === 'weekly') {
        if (raw.startsWith('Wk ')) {
            return `${monthLong} — ${raw}`
        }
        return `${monthLong} ${raw}`
    }

    for (let m = 0; m < 12; m += 1) {
        const short = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short' })
        if (short === raw) {
            return new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        }
    }
    return raw
}

/** Tallest single series value per bucket (grouped bars, not stacked). */
function maxCommissionTrendBarValue(points: CommissionTrendPoint[]): number {
    let m = 0
    for (const p of points) {
        m = Math.max(
            m,
            Number(p.paid) || 0,
            Number(p.pending) || 0,
            Number(p.clawback) || 0,
        )
    }
    return m
}

/** Upper Y-axis bound with headroom and 1–2–5×10ⁿ steps. */
function commissionTrendNiceYMax(rawMax: number): number {
    if (!Number.isFinite(rawMax) || rawMax <= 0) return 100
    const headroom = rawMax * 1.08
    const exp = Math.floor(Math.log10(headroom))
    const base = 10 ** exp
    const frac = headroom / base
    const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
    return niceFrac * base
}

function formatCommissionTrendYTick(value: number): string {
    if (!Number.isFinite(value)) return ''
    return formatUSDShort(value, { fallback: '' })
}

const CommissionPortal = () => {
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'
    const dispatch = useDispatch<AppDispatch>()
    const navigate = useNavigate()
    const applications = useSelector((state: RootState) => state.applications.data || [])
    const applicationsLoading = useSelector((state: RootState) => state.applications.loading)
    const applicationsRefreshing = useSelector((state: RootState) => state.applications.isRefreshing)
    const applicationsError = useSelector((state: RootState) => state.applications.error)
    const fundedDeals = useSelector((state: RootState) => state.commissionRequest.fundedDeals)
    const fundedDealsLoading = useSelector((state: RootState) => state.commissionRequest.fundedDealsLoading)

    const [commissionChartView, setCommissionChartView] = useState<'monthly' | 'weekly' | 'yearly'>('monthly')
    const [commissionLegendHoverKey, setCommissionLegendHoverKey] = useState<string | undefined>(undefined)
    const [activeTab, setActiveTab] = useState<CommissionTab>('dashboard')

    useEffect(() => {
        dispatch(getCommissionRequests())
    }, [dispatch])

    useEffect(() => {
        if (activeTab !== 'dashboard') return
        const listParams: GetApplicationsParams = {
            page: 1,
            limit: APPLICATIONS_TABLE_CLIENT_FETCH_LIMIT,
        }
        const cacheKey = applicationsListParamsCacheKey(listParams)
        const exactCached = getCachedApplicationsList(cacheKey)
        if (exactCached !== undefined) {
            dispatch(hydrateApplicationsListFromCache(exactCached))
        } else {
            const latestCached = getMostRecentCachedApplicationsList()
            if (latestCached !== undefined) {
                dispatch(hydrateApplicationsListFromCache(latestCached))
            }
        }
        void dispatch(getApplications(listParams))
        void dispatch(getFundedDeals())
    }, [dispatch, activeTab])

    useEffect(() => {
        setCommissionLegendHoverKey(undefined)
    }, [commissionChartView])

    const commissionLookup = useMemo(
        () => buildCommissionLookupByApplication(fundedDeals),
        [fundedDeals],
    )

    const dealRows = useMemo(
        () =>
            applications.map((app, idx) =>
                mapApplicationToHistoryRow(
                    app,
                    idx,
                    getCommissionForApplication(app, commissionLookup),
                ),
            ),
        [applications, commissionLookup],
    )

    const stats = useMemo(() => aggregateStatsFromRows(dealRows), [dealRows])

    const commissionTrendData = useMemo(
        () => buildCommissionTrendFromDealRows(dealRows, commissionChartView),
        [dealRows, commissionChartView],
    )

    const commissionTrendYAxisMax = useMemo(
        () => commissionTrendNiceYMax(maxCommissionTrendBarValue(commissionTrendData)),
        [commissionTrendData],
    )

    const topisos = useMemo(() => buildTopIsosFromDealRows(dealRows, 5), [dealRows])



    const recentDealTableRows = useMemo(() => {
        const pairs = applications.map((app, idx) => ({
            app,
            row: dealRows[idx],
        }))
        pairs.sort((a, b) => b.row.activityAtMs - a.row.activityAtMs)
        return pairs.slice(0, RECENT_DEALS_LIMIT)
    }, [applications, dealRows])

    const listBlocking =
        activeTab === 'dashboard' &&
        applicationsLoading &&
        applications.length === 0 &&
        !applicationsRefreshing

    const portalDashboardLoading =
        activeTab === 'dashboard' && (listBlocking || (fundedDealsLoading && fundedDeals.length === 0))

    const dashEmpty =
        portalDashboardLoading && applications.length === 0 && fundedDeals.length === 0

    const dashAmount = (n: number | undefined) =>
        dashEmpty ? '—' : formatCurrency(n ?? 0)

    const dashCount = (n: number) => (dashEmpty ? '—' : String(n))

    const commissionSeriesOpacity = (key: string) =>
        commissionLegendHoverKey === undefined || commissionLegendHoverKey === key ? 1 : 0.35

    return (
        <div className="min-h-screen bg-background">
            <main className="max-w-[1600px] mx-auto p-6 space-y-6">
                <nav className={`flex items-center gap-2 p-1.5 rounded-xl w-fit border shadow-lg ${isDark ? 'bg-[#1A1B1E] border-[#374151]' : 'bg-white border-[#D4DEE9]'
                    }`}>
                    {[
                        { key: 'dashboard' as const, name: 'Dashboard', icon: LayoutDashboard },
                        { key: 'monthlyHistory' as const, name: 'Monthly', icon: TrendingUp },
                        { key: 'dealDetails' as const, name: 'Deal Details', icon: FileText },
                        // { key: 'isoCommission' as const, name: 'ISO Dashboard', icon: TrendingUp },
                        { key: 'isoManagement' as const, name: 'ISO Management', icon: Users },
                        { key: 'isoPortal' as const, name: 'ISO Portal', icon: Globe },
                    ].map(({ key, name, icon: Icon }) => (
                        <Button
                            key={name}
                            variant={activeTab === key ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab(key)}
                            className={
                                activeTab === key
                                    ? 'cursor-pointer bg-[image:var(--brand-gradient)] hover:bg-[image:var(--brand-gradient)] text-xs font-medium text-white gap-1.5'
                                    : 'cursor-pointer text-[14px] text-muted-foreground hover:text-foreground gap-1.5'
                            }
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {name}
                        </Button>
                    ))}
                </nav>

                {activeTab === 'dashboard' && (
                    <>
                        <div
                            className={`relative overflow-hidden rounded-3xl border p-6 shadow-lg ${isDark ? 'border-[#2D3B4F]' : 'border-[#E2ECF4]'
                                }`}
                        >
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground">
                                    COMMISSION PORTAL
                                </p>
                                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                                    Commission dashboard
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Lifetime-style KPIs from the server,commission status trend (paid, pending, clawbacks), top referring brokers by funded amount, and recent deals
                                    activity.
                                </p>
                            </div>
                        </div>
                        {applicationsError ? (
                            <div
                                className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${isDark ? 'border-red-900/50 bg-red-950/30 text-red-200' : 'border-red-200 bg-red-50 text-red-800'}`}
                            >
                                {applicationsError}
                            </div>
                        ) : null}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            <CornerSummaryCard
                                isDark={isDark}
                                title="PORTFOLIO DEALS"
                                iconSize={24}
                                countValue={dashCount(stats.dealsFunded)}
                                countSuffix="Deals"
                                footLeft="Cumulative Funded Principal"
                                amountValue={dashAmount(stats.totalFunded)}
                                icon={<DollarSign className="text-[#49A8E8]" aria-hidden />}
                            />
                            <CornerSummaryCard
                                isDark={isDark}
                                title="COMMISSION BASE"
                                iconSize={24}
                                countValue={dashCount(stats.dealsFunded)}
                                countSuffix="Deals"
                                footLeft="All-Time Commission Sum"
                                amountValue={dashAmount(stats.commissionTotal)}
                                icon={<Percent className="text-[#49A8E8]" aria-hidden />}
                            />
                            <CornerSummaryCard
                                isDark={isDark}
                                title="SETTLED PAYOUTS"
                                iconSize={24}
                                countValue={dashCount(stats.paidDealCount)}
                                countSuffix={stats.paidDealCount === 1 ? 'Deal' : 'Deals'}
                                footLeft="Lifetime Paid Commission"
                                amountValue={dashAmount(stats.paid)}
                                icon={<CheckCircle2 className="text-green-500" aria-hidden />}
                            />
                            <CornerSummaryCard
                                isDark={isDark}
                                title="PIPELINE BALANCE"
                                iconSize={24}
                                countValue={dashCount(stats.pendingDealCount)}
                                countSuffix={stats.pendingDealCount === 1 ? 'Deal' : 'Deals'}
                                footLeft="Approved + Processing"
                                amountValue={dashAmount(stats.pendingCommission)}
                                icon={<Clock className="text-sky-500" aria-hidden />}
                            />
                            <CornerSummaryCard
                                isDark={isDark}
                                title="REVERSALS & CLAWBACKS"
                                iconSize={24}
                                countValue={dashCount(stats.clawbackDealCount)}
                                countSuffix={stats.clawbackDealCount === 1 ? 'Deal' : 'Deals'}
                                footLeft="Clawback / Reversal Impact"
                                amountValue={dashAmount(stats.clawback)}
                                icon={<Ban className="text-rose-500" aria-hidden />}
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className={`lg:col-span-2 rounded-2xl p-6 border shadow-lg ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-white border-[#FDFDFD]'
                                }`}>
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="font-semibold text-foreground">
                                        {`${commissionChartView.charAt(0).toUpperCase() + commissionChartView.slice(1)} commission status`}
                                    </h3>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="h-8 gap-2 text-sm">
                                                {commissionChartView === 'monthly'
                                                    ? 'Monthly'
                                                    : commissionChartView === 'weekly'
                                                        ? 'Weekly'
                                                        : 'Yearly'}
                                                <ChevronDown className="size-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => setCommissionChartView('weekly')}>Weekly</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => setCommissionChartView('monthly')}>Monthly</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => setCommissionChartView('yearly')}>Yearly</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="relative h-[300px] w-full">
                                    {portalDashboardLoading && commissionTrendData.length === 0 ? (
                                        <div className="flex h-full items-center justify-center text-muted-foreground">
                                            <Loader2 className="h-8 w-8 animate-spin" />
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                data={commissionTrendData}
                                                margin={{ top: 8, right: 8, bottom: 8, left: 4 }}
                                                barCategoryGap="6%"
                                                barGap={0}
                                            >
                                                <CartesianGrid
                                                    strokeDasharray="3 3"
                                                    stroke={isDark ? '#374151' : '#e2e8f0'}
                                                    vertical
                                                />
                                                <XAxis
                                                    dataKey="name"
                                                    axisLine={false}
                                                    tickLine={false}
                                                    interval={0}
                                                    tick={{ fill: isDark ? '#cbd5e1' : '#334155', fontSize: 12 }}
                                                />
                                                <YAxis
                                                    width="auto"
                                                    domain={[0, commissionTrendYAxisMax]}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: isDark ? '#cbd5e1' : '#334155', fontSize: 12 }}
                                                    tickFormatter={(value: number) =>
                                                        formatCommissionTrendYTick(value)}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                    }}
                                                    labelStyle={{ color: isDark ? '#e2e8f0' : '#0f172a' }}
                                                    labelFormatter={(label) =>
                                                        formatCommissionTrendTooltipLabel(
                                                            commissionChartView,
                                                            String(label ?? ''),
                                                        )
                                                    }
                                                    formatter={(value, name) => [
                                                        formatCurrency(Number(value ?? 0)),
                                                        String(name ?? ''),
                                                    ]}
                                                />
                                                <Legend
                                                    verticalAlign="top"
                                                    align="center"
                                                    wrapperStyle={{
                                                        width: '100%',
                                                        paddingBottom: 12,
                                                        color: isDark ? '#cbd5e1' : '#334155',
                                                        fontSize: 12,
                                                    }}
                                                    onMouseEnter={(item: LegendPayload) => {
                                                        if (item.dataKey != null) {
                                                            setCommissionLegendHoverKey(String(item.dataKey))
                                                        }
                                                    }}
                                                    onMouseLeave={() => setCommissionLegendHoverKey(undefined)}
                                                />
                                                <Bar
                                                    name="Clawbacks"
                                                    dataKey="clawback"
                                                    fill="#5A9FCC"
                                                    fillOpacity={commissionSeriesOpacity('clawback')}
                                                    radius={[8, 8, 0, 0]}
                                                    activeBar={{
                                                        fill: '#6eb0d9',
                                                        stroke: isDark ? '#e0f2fe' : '#0ea5e9',
                                                        strokeWidth: 1,
                                                        fillOpacity: 1,
                                                    }}
                                                />
                                                <Bar
                                                    name="Paid"
                                                    dataKey="paid"
                                                    fill="#256892"
                                                    fillOpacity={commissionSeriesOpacity('paid')}
                                                    radius={[8, 8, 0, 0]}
                                                    activeBar={{
                                                        fill: '#2f7aad',
                                                        stroke: isDark ? '#7dd3fc' : '#0369a1',
                                                        strokeWidth: 1,
                                                        fillOpacity: 1,
                                                    }}
                                                />
                                                <Bar
                                                    name="Pending"
                                                    dataKey="pending"
                                                    fill={isDark ? 'var(--brand)' : 'var(--brand)'}
                                                    fillOpacity={commissionSeriesOpacity('pending')}
                                                    radius={[8, 8, 0, 0]}
                                                    activeBar={{
                                                        fill: '#3d92c9',
                                                        stroke: isDark ? '#bae6fd' : '#0284c7',
                                                        strokeWidth: 1,
                                                        fillOpacity: 1,
                                                    }}
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>

                            <div
                                className={`rounded-2xl border p-5 sm:p-6 shadow-lg ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-white border-[#FDFDFD]'
                                    }`}
                            >
                                <div className="mb-4 flex items-end justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold tracking-tight text-foreground">Top ISOs</h3>
                                        <p className="mt-0.5 text-xs text-muted-foreground">By funded volume</p>
                                    </div>
                                    {topisos.length > 0 ? (
                                        <span
                                            className={`tabular-nums text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'
                                                }`}
                                        >
                                            {topisos.length}
                                        </span>
                                    ) : null}
                                </div>

                                {!portalDashboardLoading && topisos.length === 0 && (
                                    <p className="text-sm text-muted-foreground">No funded broker data yet.</p>
                                )}
                                {portalDashboardLoading && topisos.length === 0 ? (
                                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                        Loading…
                                    </p>
                                ) : null}

                                {topisos.length > 0 ? (
                                    <ul
                                        role="list"
                                        className={`mt-1 max-h-[min(280px,42vh)] list-none space-y-0.5 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin] ${isDark
                                            ? '[scrollbar-color:rgba(148,163,184,0.35)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-600/50 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500/70'
                                            : '[scrollbar-color:rgba(148,163,184,0.55)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80 [&::-webkit-scrollbar-thumb:hover]:bg-slate-400/90'
                                            }`}
                                    >
                                        {topisos.map((iso, i) => {
                                            const tier =
                                                iso.amount > 250000
                                                    ? 'Platinum'
                                                    : iso.amount > 100000
                                                        ? 'Gold'
                                                        : 'Standard'
                                            const rankShell =
                                                i === 0
                                                    ? 'bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-400'
                                                    : i === 1
                                                        ? isDark
                                                            ? 'bg-slate-800 text-slate-300 ring-1 ring-slate-700/80'
                                                            : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/90'
                                                        : i === 2
                                                            ? 'bg-orange-500/12 text-orange-600 ring-1 ring-orange-500/20 dark:text-orange-400'
                                                            : isDark
                                                                ? 'bg-slate-800/60 text-slate-500'
                                                                : 'bg-slate-50 text-slate-500'

                                            return (
                                                <li key={`${iso.name}-${i}`}>
                                                    <div
                                                        className={`flex items-center gap-3 rounded-xl px-2 py-2 transition-colors ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                                                            }`}
                                                    >
                                                        <div
                                                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums ${rankShell}`}
                                                        >
                                                            {i + 1}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm font-medium text-foreground">{iso.name}</p>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                {iso.deals} deal{iso.deals === 1 ? '' : 's'}
                                                            </p>
                                                        </div>
                                                        <div className="shrink-0 text-right">
                                                            <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                                                {formatCurrency(iso.amount)}
                                                            </p>
                                                            <span
                                                                className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide ${tier === 'Platinum'
                                                                    ? 'bg-violet-500/12 text-violet-700 dark:text-violet-300'
                                                                    : tier === 'Gold'
                                                                        ? 'bg-amber-500/12 text-amber-800 dark:text-amber-400'
                                                                        : isDark
                                                                            ? 'bg-slate-800/80 text-slate-400'
                                                                            : 'bg-slate-100 text-slate-600'
                                                                    }`}
                                                            >
                                                                {tier}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                ) : null}
                            </div>
                        </div>

                        <div
                            className={`mt-5 overflow-hidden rounded-[5px] border shadow-[0px_4px_20px_0px_#00000005] transition-all duration-300 ${isDark ? 'border-[#374151] bg-[#141517]' : 'border-[#FDFDFD] bg-card'
                                }`}
                        >
                            <div
                                className={`rounded-t-[5px] border-b px-4 py-2 md:px-5 ${isDark ? 'border-[#374151] bg-[#2A2B2F]' : 'border-[#ECEFF5] bg-[#F9FAFD]'
                                    }`}
                            >
                                <span className="font-roboto text-[1rem] font-semibold uppercase tracking-wide text-foreground">
                                    Recent Activity
                                </span>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Up to {RECENT_DEALS_LIMIT} most recent deals by activity (same columns as Monthly
                                    history).
                                </p>
                            </div>
                            <div
                                className={`p-1 transition-opacity duration-300 ${portalDashboardLoading ? 'opacity-85' : 'opacity-100'
                                    }`}
                            >
                                <div className="overflow-x-auto overflow-y-auto rounded-xl [scrollbar-gutter:stable]">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className={thRecentCommissionApps}>
                                                    <span className="font-medium text-foreground uppercase tracking-wide">
                                                        Deal
                                                    </span>
                                                </TableHead>
                                                <TableHead className={thRecentCommissionApps}>
                                                    <span className="font-medium text-foreground uppercase tracking-wide">
                                                        Business Name
                                                    </span>
                                                </TableHead>
                                                <TableHead className={thRecentCommissionApps}>
                                                    <span className="font-medium text-foreground uppercase tracking-wide">
                                                        Month
                                                    </span>
                                                </TableHead>
                                                <TableHead className={thRecentCommissionApps}>
                                                    <span className="font-medium text-foreground uppercase tracking-wide">
                                                        ISO
                                                    </span>
                                                </TableHead>
                                                <TableHead className={thRecentCommissionApps}>
                                                    <span className="font-medium text-foreground uppercase tracking-wide">
                                                        Funded
                                                    </span>
                                                </TableHead>
                                                <TableHead className={cn(thRecentCommissionApps, 'min-w-[9rem]')}>
                                                    <span className="font-medium text-foreground uppercase tracking-wide">
                                                        App commission %
                                                    </span>
                                                </TableHead>
                                                <TableHead className={thRecentCommissionApps}>
                                                    <span className="font-medium text-foreground uppercase tracking-wide">
                                                        Net Commission
                                                    </span>
                                                </TableHead>
                                                <TableHead className={thRecentCommissionApps}>
                                                    <span className="font-medium text-foreground uppercase tracking-wide">
                                                        Status
                                                    </span>
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {portalDashboardLoading && recentDealTableRows.length === 0 && (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={8}
                                                        className={cn(
                                                            tdRecentCommissionApps,
                                                            'py-10 text-center text-muted-foreground',
                                                        )}
                                                    >
                                                        <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-primary" />
                                                        Loading applications…
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {!portalDashboardLoading && recentDealTableRows.length === 0 && (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={8}
                                                        className={cn(
                                                            tdRecentCommissionApps,
                                                            'py-6 text-center text-muted-foreground',
                                                        )}
                                                    >
                                                        No recent deals to show.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {recentDealTableRows.map(({ app, row: deal }, rowIdx) => {
                                                const r = app as unknown as Record<string, unknown>
                                                const appIdRaw = r.applicationId
                                                const applicationIdNum =
                                                    appIdRaw != null && appIdRaw !== ''
                                                        ? typeof appIdRaw === 'number'
                                                            ? appIdRaw
                                                            : Number(appIdRaw)
                                                        : null
                                                const safeAppId =
                                                    applicationIdNum != null && Number.isFinite(applicationIdNum)
                                                        ? applicationIdNum
                                                        : null
                                                const rowKey = `${deal.id}-${deal.monthKey}`
                                                return (
                                                    <TableRow
                                                        key={rowKey}
                                                        className={cn(
                                                            'transition-colors hover:bg-accent',
                                                            rowIdx % 2 ? 'bg-muted/50' : '',
                                                        )}
                                                    >
                                                        <TableCell className={tdRecentCommissionApps}>
                                                            <button
                                                                type="button"
                                                                className="cursor-pointer font-medium text-[var(--brand)] hover:text-[var(--brand-accent-strong)] hover:underline"
                                                                onClick={() => {
                                                                    if (safeAppId != null) {
                                                                        navigate(`/application-details/${safeAppId}`)
                                                                    }
                                                                }}
                                                            >
                                                                {deal.dealDisplayId}
                                                            </button>
                                                        </TableCell>
                                                        <TableCell className={tdRecentCommissionApps}>
                                                            <span className="text-foreground">
                                                                {deal.merchant}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className={tdRecentCommissionApps}>
                                                            <span className="text-foreground">{deal.month}</span>
                                                        </TableCell>
                                                        <TableCell className={tdRecentCommissionApps}>
                                                            <span className="text-foreground">{deal.iso}</span>
                                                        </TableCell>
                                                        <TableCell className={tdRecentCommissionApps}>
                                                            <span className="font-medium text-foreground">
                                                                {formatCurrency(deal.funded)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className={tdRecentCommissionApps}>
                                                            <span className="font-medium tabular-nums text-foreground">
                                                                {deal.commissionPctLabel}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className={tdRecentCommissionApps}>
                                                            <span className="font-semibold text-foreground">
                                                                {formatCurrency(deal.net)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className={tdRecentCommissionApps}>
                                                            <span
                                                                className={dealCommissionStatusClassName(
                                                                    deal.status,
                                                                )}
                                                            >
                                                                {dealCommissionStatusLabel(deal.status)}
                                                            </span>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'monthlyHistory' && <MonthHistoryCommission />}
                {activeTab === 'dealDetails' && <DealDetails />}
                {activeTab === 'isoCommission' && <IsoCommissionDashboard isDark={isDark} />}
                {activeTab === 'isoManagement' && <IsoManagement />}
                {activeTab === 'isoPortal' && <IsoPortal />}
            </main>
        </div>
    )
}

export default CommissionPortal;