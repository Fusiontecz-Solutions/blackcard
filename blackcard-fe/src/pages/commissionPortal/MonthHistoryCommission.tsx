import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
    Download,
    DollarSign,
    Percent,
    Loader2,
    CheckCircle2,
    Clock,
    Ban,
    Search,
    ChevronLeft,
    ChevronRight,
    Calendar,
    ChevronDown,
    Check,
} from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
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
import { formatCurrency, cn } from '@/lib/utils'
import type { RootState } from '@/redux/store'
import type { AppDispatch } from '@/redux/store'
import { getApplications } from '@/redux/actions/applicationActions'
import { getFundedDeals } from '@/redux/actions/commissionRequestActions'
import { getIsos } from '@/redux/actions/isoActions'
import type { Iso } from '@/types/isoTypes'
import { hydrateApplicationsListFromCache } from '@/redux/slices/applicationSlice'
import {
    applicationsListParamsCacheKey,
    getCachedApplicationsList,
    getMostRecentCachedApplicationsList,
} from '@/lib/applicationsListCache'
import type { GetApplicationsParams } from '@/types/applicationTypes'
import {
    APPLICATIONS_TABLE_CLIENT_FETCH_LIMIT,
    filterApplicationsBySearchQuery,
} from '@/lib/applicationTableSearch'
import { CornerSummaryCard } from './CornerSummaryCard'
import {
    type DealRow,
    aggregateStatsFromRows,
    buildCommissionLookupByApplication,
    dealCommissionStatusClassName,
    dealCommissionStatusLabel,
    getApplicationIsoId,
    getApplicationUnderwriterId,
    getCommissionForApplication,
    mapApplicationToHistoryRow,
} from './commissionHistoryShared'
import { CommissionRecipientToggle } from './CommissionRecipientToggle'
import { fetchUsersByRole } from '@/redux/actions/settingsUserActions'
import { selectUsersByRole } from '@/redux/selectors/settingsUsersSelectors'
import type { CommissionRecipientType } from './commissionRecipientShared'

/** Map typographic dashes to ASCII so CSV survives Excel’s default (non‑UTF‑8) import. */
function sanitizeCsvText(value: string): string {
    return value.replace(/\u2014/g, '-').replace(/\u2013/g, '-').replace(/\u00A0/g, ' ')
}

/** No ISO uses em dash in UI; leave ISO column blank in exports (clearer than “-” in Excel). */
function isoCellForCsv(iso: string): string {
    const t = iso.trim()
    if (t === '' || t === '\u2014' || t === '\u2013' || t === '—' || t === '–') return ''
    return sanitizeCsvText(t)
}

function escapeCsvCell(value: string): string {
    const v = sanitizeCsvText(value)
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
    return v
}

function downloadDealRowsCsv(rows: DealRow[]) {
    const headers = [
        'Deal ID',
        'Merchant',
        'Month',
        'ISO',
        'Funded',
        'Application commission %',
        'Net Commission',
        'Status',
    ]
    const lines = [
        headers.join(','),
        ...rows.map((d) =>
            [
                escapeCsvCell(d.dealDisplayId),
                escapeCsvCell(d.merchant),
                escapeCsvCell(d.month),
                escapeCsvCell(isoCellForCsv(d.iso)),
                escapeCsvCell(String(d.funded)),
                escapeCsvCell(d.commissionPctLabel),
                escapeCsvCell(String(d.net)),
                escapeCsvCell(dealCommissionStatusLabel(d.status)),
            ].join(','),
        ),
    ]
    // UTF-8 BOM: Excel on Windows opens the file as UTF-8 instead of system ANSI (fixes mojibake).
    const csvBody = `\uFEFF${lines.join('\n')}`
    const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `commission-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

const TABLE_PAGE_SIZE = 10

/** Left-aligned table headers and cells (matches dashboard Recent Activity). */
const thCommission = 'h-12 text-left text-[11px] uppercase tracking-wider'
const tdCommission = 'text-left align-middle'

const selectToolbarClass = (isDark: boolean) =>
    cn(
        'h-10 w-full shrink-0 rounded-xl sm:w-[min(100%,11rem)] lg:w-[10.5rem]',
        isDark ? 'border-[#3A4A5F] bg-[#111B2D]/80' : 'border-[#D6E4F1] bg-white',
    )

const MONTH_PICKER_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const

function formatMonthKeyLabel(monthKey: string): string {
    const [yStr, mStr] = monthKey.split('-')
    const y = Number(yStr)
    const m = Number(mStr)
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return monthKey
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function monthKeyForYearMonth(year: number, monthIndex0: number): string {
    return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`
}

export default function MonthHistoryCommission() {
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'
    const dispatch = useDispatch<AppDispatch>()

    const applications = useSelector((state: RootState) => state.applications.data || [])
    const applicationsLoading = useSelector((state: RootState) => state.applications.loading)
    const applicationsRefreshing = useSelector((state: RootState) => state.applications.isRefreshing)
    const applicationsError = useSelector((state: RootState) => state.applications.error)
    const fundedDeals = useSelector((state: RootState) => state.commissionRequest.fundedDeals)
    const isoList = useSelector((state: RootState) => state.iso.list)
    const underwriters = useSelector((state: RootState) =>
        selectUsersByRole(state, 'UNDERWRITER'),
    )

    const [commissionRecipient, setCommissionRecipient] =
        useState<CommissionRecipientType>('iso')
    const [selectedIsoId, setSelectedIsoId] = useState('all')
    const [selectedUnderwriterId, setSelectedUnderwriterId] = useState('all')
    const [selectedMonthKey, setSelectedMonthKey] = useState('all')
    const [monthMenuOpen, setMonthMenuOpen] = useState(false)
    const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear())
    const [selectedStatus, setSelectedStatus] = useState('all')
    const [tableSearchInput, setTableSearchInput] = useState('')
    const [tablePage, setTablePage] = useState(1)

    useEffect(() => {
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
    }, [dispatch])

    useEffect(() => {
        void dispatch(getFundedDeals())
    }, [dispatch])

    useEffect(() => {
        void dispatch(getIsos())
    }, [dispatch])

    useEffect(() => {
        void dispatch(fetchUsersByRole('UNDERWRITER'))
    }, [dispatch])

    const commissionLookup = useMemo(
        () => buildCommissionLookupByApplication(fundedDeals),
        [fundedDeals],
    )

    const recipientFilteredApps = useMemo(() => {
        const base = filterApplicationsBySearchQuery(applications, tableSearchInput)
        if (commissionRecipient === 'iso') {
            if (selectedIsoId === 'all') return base
            return base.filter((app) => {
                const iid = getApplicationIsoId(app)
                if (selectedIsoId === '__none__') return iid == null
                return iid === selectedIsoId
            })
        }
        if (selectedUnderwriterId === 'all') return base
        return base.filter((app) => {
            const uid = getApplicationUnderwriterId(app)
            if (selectedUnderwriterId === '__none__') return uid == null
            return uid === selectedUnderwriterId
        })
    }, [
        applications,
        commissionRecipient,
        selectedIsoId,
        selectedUnderwriterId,
        tableSearchInput,
    ])

    const dealRows = useMemo(
        () =>
            recipientFilteredApps.map((app, idx) =>
                mapApplicationToHistoryRow(
                    app,
                    idx,
                    getCommissionForApplication(app, commissionLookup),
                    commissionRecipient,
                ),
            ),
        [recipientFilteredApps, commissionLookup, commissionRecipient],
    )

    const monthFilteredRows = useMemo(() => {
        if (selectedMonthKey === 'all') return dealRows
        return dealRows.filter((d) => d.monthKey === selectedMonthKey)
    }, [dealRows, selectedMonthKey])

    const statusFilteredRows = useMemo(() => {
        if (selectedStatus === 'all') return monthFilteredRows
        return monthFilteredRows.filter((d) => d.status === selectedStatus)
    }, [monthFilteredRows, selectedStatus])

    const stats = useMemo(() => aggregateStatsFromRows(statusFilteredRows), [statusFilteredRows])

    useEffect(() => {
        setTablePage(1)
    }, [tableSearchInput, selectedIsoId, selectedUnderwriterId, selectedMonthKey, selectedStatus, commissionRecipient])

    const tableTotalPages = Math.max(1, Math.ceil(statusFilteredRows.length / TABLE_PAGE_SIZE) || 1)
    const safeTablePage = Math.min(tablePage, tableTotalPages)
    const pagedRows = useMemo(() => {
        const start = (safeTablePage - 1) * TABLE_PAGE_SIZE
        return statusFilteredRows.slice(start, start + TABLE_PAGE_SIZE)
    }, [statusFilteredRows, safeTablePage])

    const isoOptions = useMemo(() => {
        const rows = (isoList || []).map((item: Iso & { _id?: string }) => {
            const isoId = String(item.id ?? item._id ?? '').trim()
            return {
                isoId,
                isoName: String(item.name || 'Unnamed ISO').trim() || 'Unnamed ISO',
            }
        })
        const withIds = rows.filter((r) => r.isoId)
        withIds.sort((a, b) => a.isoName.localeCompare(b.isoName))
        let noIsoCount = 0
        for (const app of applications) {
            if (!getApplicationIsoId(app)) noIsoCount += 1
        }
        if (noIsoCount > 0) {
            withIds.unshift({ isoId: '__none__', isoName: 'No ISO' })
        }
        return withIds
    }, [isoList, applications])

    const underwriterOptions = useMemo(() => {
        const rows = underwriters
            .map((uw) => {
                const id = String(uw._id ?? (uw as { id?: string }).id ?? '').trim()
                if (!id) return null
                const name =
                    [uw.firstName, uw.lastName].filter(Boolean).join(' ').trim() ||
                    uw.email ||
                    'Unnamed underwriter'
                return { underwriterId: id, underwriterName: name }
            })
            .filter((r): r is { underwriterId: string; underwriterName: string } => r !== null)
        rows.sort((a, b) => a.underwriterName.localeCompare(b.underwriterName))
        let noUwCount = 0
        for (const app of applications) {
            if (!getApplicationUnderwriterId(app)) noUwCount += 1
        }
        if (noUwCount > 0) {
            rows.unshift({ underwriterId: '__none__', underwriterName: 'No underwriter' })
        }
        return rows
    }, [underwriters, applications])

    useEffect(() => {
        if (commissionRecipient !== 'iso') return
        if (selectedIsoId === 'all' || selectedIsoId === '__none__') return
        if (!isoOptions.some((o) => o.isoId === selectedIsoId)) {
            setSelectedIsoId('all')
        }
    }, [commissionRecipient, isoOptions, selectedIsoId])

    useEffect(() => {
        if (commissionRecipient !== 'underwriter') return
        if (selectedUnderwriterId === 'all' || selectedUnderwriterId === '__none__') return
        if (!underwriterOptions.some((o) => o.underwriterId === selectedUnderwriterId)) {
            setSelectedUnderwriterId('all')
        }
    }, [commissionRecipient, underwriterOptions, selectedUnderwriterId])

    const listBlocking =
        applicationsLoading && applications.length === 0 && !applicationsRefreshing

    const tableMessage = useMemo(() => {
        if (listBlocking) return 'loading' as const
        if (applicationsError && applications.length === 0) return 'error' as const
        if (!listBlocking && applications.length === 0) return 'empty' as const
        if (
            !listBlocking &&
            applications.length > 0 &&
            statusFilteredRows.length === 0
        ) {
            if (tableSearchInput.trim()) return 'search' as const
            if (
                selectedIsoId !== 'all' ||
                selectedUnderwriterId !== 'all' ||
                selectedMonthKey !== 'all' ||
                selectedStatus !== 'all'
            )
                return 'filtered' as const
            return 'empty' as const
        }
        return null
    }, [
        listBlocking,
        applications.length,
        applicationsError,
        statusFilteredRows.length,
        tableSearchInput,
        selectedIsoId,
        selectedUnderwriterId,
        selectedMonthKey,
        selectedStatus,
    ])

    return (
        <div className="space-y-6">
            <div
                className={`relative overflow-hidden rounded-3xl border p-6 shadow-sm ${isDark ? 'border-[#2D3B4F]' : 'border-[#E2ECF4]'
                    }`}
            >
                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground">COMMISSION PORTAL</p>
                        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Monthly Commission History</h2>
                        <p className="text-sm text-muted-foreground">
                            Same application list as Deal details (up to 1,000 rows). For ISO-linked deals, status reflects
                            the ISO portal commission payout (paid vs pending). Otherwise, status follows application
                            queue/state and the latest commission request when present.
                        </p>
                    </div>
                </div>
            </div>

            {applicationsError ? (
                <p className="text-sm text-destructive">{applicationsError}</p>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <CornerSummaryCard
                    isDark={isDark}
                    title="TOTAL DEALS"
                    iconSize={24}
                    countValue={String(stats.dealsFunded)}
                    countSuffix="Deals"
                    footLeft="Total Funded Amount"
                    amountLabel=""
                    amountValue={formatCurrency(stats.totalFunded)}
                    icon={
                        <DollarSign className="text-[#49A8E8]" aria-hidden />
                    }
                />
                <CornerSummaryCard
                    isDark={isDark}
                    title="COMMISSION TOTAL"
                    iconSize={24}
                    countValue={String(stats.dealsFunded)}
                    countSuffix="Deals"
                    footLeft="Total Commission Amount"
                    amountValue={formatCurrency(stats.commissionTotal)}
                    icon={<Percent className="text-[#49A8E8]" aria-hidden />}
                />
                <CornerSummaryCard
                    isDark={isDark}
                    title="PAID COMMISSION"
                    iconSize={24}
                    countValue={String(stats.paidDealCount)}
                    countSuffix={stats.paidDealCount === 1 ? 'Deal' : 'Deals'}
                    footLeft="Paid Commission Amount"
                    amountValue={formatCurrency(stats.paid)}
                    icon={<CheckCircle2 className="text-green-500" aria-hidden />}
                />
                <CornerSummaryCard
                    isDark={isDark}
                    title="PENDING COMMISSION"
                    iconSize={24}
                    countValue={String(stats.pendingDealCount)}
                    countSuffix={
                        stats.pendingDealCount === 1 ? 'Deal' : 'Deals'
                    }
                    footLeft="Pending Commission Amount"
                    amountValue={formatCurrency(stats.pendingCommission)}
                    icon={<Clock className="text-sky-500" aria-hidden />}
                />
                <CornerSummaryCard
                    isDark={isDark}
                    title="CLAWBACK COMMISSION"
                    iconSize={24}
                    countValue={String(stats.clawbackDealCount)}
                    countSuffix={
                        stats.clawbackDealCount === 1 ? 'Deal' : 'Deals'
                    }
                    footLeft="Clawback Commission Amount"
                    amountValue={formatCurrency(stats.clawback)}
                    icon={<Ban className="text-rose-500" aria-hidden />}
                />
            </div>

            <div
                className={cn(
                    'flex flex-col gap-3 rounded-2xl border p-4 shadow-sm lg:flex-row lg:flex-nowrap lg:items-center lg:gap-3',
                    isDark ? 'border-[#324154] bg-[#121A25]' : 'border-[#E2ECF4] bg-white',
                )}
            >
                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap lg:gap-3">
                    <CommissionRecipientToggle
                        value={commissionRecipient}
                        onChange={(next) => {
                            setCommissionRecipient(next)
                            setSelectedIsoId('all')
                            setSelectedUnderwriterId('all')
                        }}
                    />
                    <div className="relative min-w-[12rem] flex-1 lg:min-w-[10rem] lg:max-w-md">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                        />
                        <Input
                            type="search"
                            placeholder="Search merchant, deal…"
                            value={tableSearchInput}
                            onChange={(e) => setTableSearchInput(e.target.value)}
                            className={cn('h-10 pl-9', isDark ? 'border-[#3A4A5F] bg-[#111B2D]/80' : '')}
                            aria-label="Search applications"
                        />
                    </div>
                    {commissionRecipient === 'iso' ? (
                        <Select value={selectedIsoId} onValueChange={setSelectedIsoId}>
                            <SelectTrigger className={selectToolbarClass(isDark)}>
                                <SelectValue placeholder="All ISOs" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All ISOs</SelectItem>
                                {isoOptions.map((iso) => (
                                    <SelectItem key={iso.isoId} value={iso.isoId}>
                                        {iso.isoName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Select
                            value={selectedUnderwriterId}
                            onValueChange={setSelectedUnderwriterId}
                        >
                            <SelectTrigger className={selectToolbarClass(isDark)}>
                                <SelectValue placeholder="All underwriters" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All underwriters</SelectItem>
                                {underwriterOptions.map((uw) => (
                                    <SelectItem key={uw.underwriterId} value={uw.underwriterId}>
                                        {uw.underwriterName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <DropdownMenu
                        open={monthMenuOpen}
                        onOpenChange={(open: boolean) => {
                            setMonthMenuOpen(open)
                            if (open) {
                                if (selectedMonthKey !== 'all') {
                                    const y = Number(selectedMonthKey.slice(0, 4))
                                    if (Number.isFinite(y)) setPickerYear(y)
                                } else {
                                    setPickerYear(new Date().getFullYear())
                                }
                            }
                        }}
                    >
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    selectToolbarClass(isDark),
                                    'flex items-center justify-between gap-2 px-3 text-left text-sm font-medium text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40',
                                )}
                                aria-label="Filter by month"
                            >
                                <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                    <span className="truncate">
                                        {selectedMonthKey === 'all'
                                            ? 'All months'
                                            : formatMonthKeyLabel(selectedMonthKey)}
                                    </span>
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="start"
                            className={cn(
                                'w-[min(100vw-2rem,18rem)] p-3',
                                isDark ? 'border-[#324154] bg-[#121A25]' : '',
                            )}
                            onCloseAutoFocus={(e: Event) => e.preventDefault()}
                        >
                            <button
                                type="button"
                                className={cn(
                                    'mb-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                    selectedMonthKey === 'all'
                                        ? isDark
                                            ? 'bg-[var(--brand)]/25 text-foreground'
                                            : 'bg-[#E8F4FC] text-foreground'
                                        : 'text-muted-foreground hover:bg-muted/60',
                                )}
                                onClick={() => {
                                    setSelectedMonthKey('all')
                                    setMonthMenuOpen(false)
                                }}
                            >
                                All months
                                {selectedMonthKey === 'all' ? (
                                    <Check className="h-4 w-4 text-[var(--brand)]" aria-hidden />
                                ) : null}
                            </button>
                            <div
                                className={cn(
                                    'mb-2 flex items-center justify-between rounded-lg border px-1 py-1',
                                    isDark ? 'border-[#3A4A5F]' : 'border-[#E2ECF4]',
                                )}
                            >
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    aria-label="Previous year"
                                    onClick={() => setPickerYear((y) => y - 1)}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-sm font-semibold tabular-nums">{pickerYear}</span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    aria-label="Next year"
                                    onClick={() => setPickerYear((y) => y + 1)}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {MONTH_PICKER_SHORT.map((label, idx) => {
                                    const key = monthKeyForYearMonth(pickerYear, idx)
                                    const selected = selectedMonthKey === key
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className={cn(
                                                'relative rounded-lg px-2 py-2 text-xs font-semibold transition-colors',
                                                selected
                                                    ? isDark
                                                        ? 'bg-[var(--brand)]/35 text-foreground ring-1 ring-[var(--brand)]/50'
                                                        : 'bg-[#E8F4FC] text-foreground ring-1 ring-[var(--brand)]/40'
                                                    : isDark
                                                      ? 'text-muted-foreground hover:bg-white/5'
                                                      : 'text-muted-foreground hover:bg-muted/70',
                                            )}
                                            onClick={() => {
                                                setSelectedMonthKey(key)
                                                setMonthMenuOpen(false)
                                            }}
                                        >
                                            {label}
                                            {selected ? (
                                                <Check
                                                    className="absolute right-1 top-1 h-3 w-3 text-[var(--brand)]"
                                                    aria-hidden
                                                />
                                            ) : null}
                                        </button>
                                    )
                                })}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                        <SelectTrigger className={selectToolbarClass(isDark)}>
                            <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="APPROVED">Approved</SelectItem>
                            <SelectItem value="PAID">Paid</SelectItem>
                            <SelectItem value="PENDING">Pending</SelectItem>
                            <SelectItem value="CLAWBACK">Clawback</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button
                    type="button"
                    className="h-10 w-full shrink-0 rounded-xl bg-[image:var(--brand-gradient)] px-5 font-semibold shadow-[0_8px_24px_-12px_rgba(169,98,205,0.9)] hover:bg-[image:var(--brand-gradient)] sm:w-fit lg:ml-auto"
                    disabled={statusFilteredRows.length === 0}
                    onClick={() => downloadDealRowsCsv(statusFilteredRows)}
                >
                    <Download size={16} className="mr-2" /> Export CSV
                </Button>
            </div>

            <div
                className={`overflow-hidden rounded-2xl border shadow-lg ${isDark ? 'border-[#324154] bg-[#10151F]/95' : 'border-[#E2ECF4] bg-white'
                    }`}
            >
                <div className="overflow-x-auto px-5 pb-4">
                    <Table>
                    <TableHeader>
                        <TableRow className={isDark ? 'bg-[#121A25]' : 'bg-[#F8FBFF]'}>
                            <TableHead className={thCommission}>Deal ID</TableHead>
                            <TableHead className={thCommission}>Business Name</TableHead>
                            <TableHead className={thCommission}>Month</TableHead>
                            <TableHead className={thCommission}>
                                {commissionRecipient === 'underwriter' ? 'Underwriter' : 'ISO'}
                            </TableHead>
                            <TableHead className={thCommission}>Funded Amount</TableHead>
                            <TableHead className={cn(thCommission, 'min-w-[9rem]')}>
                                {commissionRecipient === 'underwriter'
                                    ? 'Underwriter commission %'
                                    : 'App commission %'}
                            </TableHead>
                            <TableHead className={thCommission}>Net Commission</TableHead>
                            <TableHead className={thCommission}>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tableMessage === 'loading' && (
                            <TableRow>
                                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                    <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-[var(--brand)]" />
                                    Loading applications…
                                </TableCell>
                            </TableRow>
                        )}
                        {tableMessage === 'error' && (
                            <TableRow>
                                <TableCell colSpan={8} className="py-6 text-center text-destructive">
                                    {applicationsError}
                                </TableCell>
                            </TableRow>
                        )}
                        {tableMessage === 'empty' && (
                            <TableRow>
                                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                                    No applications found.
                                </TableCell>
                            </TableRow>
                        )}
                        {tableMessage === 'filtered' && (
                            <TableRow>
                                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                                    No records found for selected filters.
                                </TableCell>
                            </TableRow>
                        )}
                        {tableMessage === 'search' && (
                            <TableRow>
                                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                                    No applications match your search.
                                </TableCell>
                            </TableRow>
                        )}
                        {tableMessage === null &&
                            pagedRows.map((deal) => (
                                <TableRow key={`${deal.id}-${deal.monthKey}`} className="transition-colors hover:bg-muted/35">
                                    <TableCell className={cn(tdCommission, 'font-medium text-muted-foreground')}>
                                        {deal.dealDisplayId}
                                    </TableCell>
                                    <TableCell className={cn(tdCommission, 'font-semibold text-foreground')}>
                                        {deal.merchant}
                                    </TableCell>
                                    <TableCell className={cn(tdCommission, 'text-muted-foreground')}>{deal.month}</TableCell>
                                    <TableCell className={tdCommission}>{deal.iso}</TableCell>
                                    <TableCell className={cn(tdCommission, 'text-[var(--brand)] font-semibold')}>
                                        {formatCurrency(deal.funded)}
                                    </TableCell>
                                    <TableCell
                                        className={cn(tdCommission, 'tabular-nums text-foreground font-medium')}
                                    >
                                        {deal.commissionPctLabel}
                                    </TableCell>
                                    <TableCell className={cn(tdCommission, 'text-[#009432] font-bold')}>
                                        {formatCurrency(deal.net)}
                                    </TableCell>
                                    <TableCell className={tdCommission}>
                                        <span className={dealCommissionStatusClassName(deal.status)}>
                                            {dealCommissionStatusLabel(deal.status)}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                    </Table>
                </div>
                {tableMessage === null && statusFilteredRows.length > TABLE_PAGE_SIZE ? (
                    <div
                        className={`flex flex-col gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between ${isDark ? 'border-[#324154]' : 'border-slate-100'
                            }`}
                    >
                        <p className="text-xs text-muted-foreground">
                            Showing{' '}
                            {(safeTablePage - 1) * TABLE_PAGE_SIZE + 1}–
                            {Math.min(safeTablePage * TABLE_PAGE_SIZE, statusFilteredRows.length)} of {statusFilteredRows.length}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                disabled={safeTablePage <= 1}
                                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                            </Button>
                            <span className="min-w-[5.5rem] text-center text-xs tabular-nums text-muted-foreground">
                                Page {safeTablePage} of {tableTotalPages}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                disabled={safeTablePage >= tableTotalPages}
                                onClick={() => setTablePage((p) => Math.min(tableTotalPages, p + 1))}
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
