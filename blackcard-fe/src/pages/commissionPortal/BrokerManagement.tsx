import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
    Plus,
    Mail,
    Phone,
    Landmark,
    Pencil,
    Trash2,
    AlertCircle,
    Loader2,
    Layers,
    CircleDollarSign,
    TrendingUp,
    CheckCircle2,
    Clock,
} from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '@/redux/store'
import { createIso, deleteIso, getIsos, updateIso } from '@/redux/actions/isoActions'
import { getApplicationsByIsoId } from '@/redux/actions/applicationActions'
import { fetchIsoMyDeals, type IsoMyDealsSummary } from '@/lib/isoDealsApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import { formatUSPhoneNumber, handleUSPhoneInputChange } from '@/utils/formatPhoneNumber'

export type iso = {
    id: string
    name: string
    email?: string
    phone?: string
    accountDetails: string
    routingNumber: string
    commissionPercentage: number
    initials: string
    joinDate?: string
    applications?: any[]
}

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function maskSensitive(value: string): string {
    const v = value.replace(/\s/g, '')
    if (!v) return '—'
    if (v.length <= 4) return '••••'
    return `••••${v.slice(-4)}`
}

function formatDate(value?: string): string {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Raw pipeline state from API — same priority as dashboard deal bucketing (`statsCurrentState` before workflow-mapped `currentState`). */
function resolveApplicationRawStatus(app: Record<string, unknown> | null | undefined): string {
    if (!app) return ''
    const candidates = [
        app.statsCurrentState,
        app.state,
        app.status,
        app.currentState,
    ]
    for (const c of candidates) {
        if (c == null) continue
        const s = String(c).trim()
        if (s) return s
    }
    return ''
}

function formatStatusLabel(raw: string): string {
    if (!raw.trim()) return '—'
    return raw
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function toNum(v: unknown): number | null {
    if (v == null) return null
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[^0-9.-]+/g, ''))
        return Number.isFinite(n) ? n : null
    }
    return null
}

function approvedAmountFromTermsOfferRow(row: Record<string, unknown> | null): number | null {
    if (!row) return null
    const nested =
        row.offer &&
        typeof row.offer === 'object' &&
        !Array.isArray(row.offer)
            ? (row.offer as Record<string, unknown>)
            : null
    return toNum(nested?.approvedAmount) ?? toNum(row.approvedAmount) ?? null
}

/**
 * Same sources as GET /iso/:id/my-deals: latest terms `approvedAmount`, else `OfferDecision.offer`.
 * Prisma returns `offer` as a number/string (Decimal), not a nested object — the old resolver never read it.
 */
function approvedAmountFromOfferDecision(od: Record<string, unknown> | undefined): number | null {
    if (!od) return null
    const offer = od.offer
    if (offer != null && typeof offer === 'object' && !Array.isArray(offer)) {
        const inner = offer as Record<string, unknown>
        return toNum(inner.approvedAmount) ?? toNum(inner.offer) ?? null
    }
    return toNum(offer)
}

function resolveApprovedAmountFromApplication(app: any): number {
    const r = app as Record<string, unknown>
    const termOffers = r?.termsOffers as unknown[] | undefined
    const latestTermsOffer =
        Array.isArray(termOffers) && termOffers.length > 0 ? (termOffers[0] as Record<string, unknown>) : null

    const fromTerms = approvedAmountFromTermsOfferRow(latestTermsOffer)
    const fromOfferDecision = approvedAmountFromOfferDecision(r?.OfferDecision as Record<string, unknown> | undefined)

    return (
        fromTerms ??
        fromOfferDecision ??
        toNum(app?.offerApprovedAmount) ??
        toNum(app?.approvedAmount) ??
        0
    )
}

function formatCurrentQueue(app: any): string {
    const q = String(app?.currentQueue ?? '').trim()
    return q || '—'
}

/** Most recent activity time for sorting “recent” deals (updatedAt, else createdAt). */
function appRecentTimestampMs(app: any): number {
    const u = app?.updatedAt != null ? new Date(String(app.updatedAt)).getTime() : NaN
    const c = app?.createdAt != null ? new Date(String(app.createdAt)).getTime() : NaN
    if (Number.isFinite(u)) return u
    if (Number.isFinite(c)) return c
    return 0
}

// function statusPillClass(statusUpper: string): string {
//     const s = statusUpper.trim()
//     if (!s) {
//         return 'border-slate-500/20 bg-slate-500/10 text-slate-500 dark:text-slate-400'
//     }
//     if (s.includes('APPROV') || s.includes('FUNDED') || s.includes('COMPLETE')) {
//         return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
//     }
//     if (s.includes('DECLIN') || s.includes('REJECT') || s.includes('CANCEL')) {
//         return 'border-rose-500/25 bg-rose-500/10 text-rose-400'
//     }
//     return 'border-amber-500/25 bg-amber-500/10 text-amber-400'
// }

function tierPillClass(isDark: boolean): string {
    const base = 'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide border'
    return `${base} ${isDark ? 'border-slate-600 bg-slate-800/80 text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-600'}`
}

type AddisoForm = {
    name: string
    email: string
    phone: string
    accountDetails: string
    routingNumber: string
    commissionPercentage: string
}

const emptyForm: AddisoForm = {
    name: '',
    email: '',
    phone: '',
    accountDetails: '',
    routingNumber: '',
    commissionPercentage: '',
}

export default function isoManagement() {
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'
    const dispatch = useDispatch<AppDispatch>()
    const isoState = useSelector((state: RootState) => state.iso)
    const isoApplicationsState = useSelector((state: RootState) => state.isoApplications)
    const isoApplications = useMemo(() => isoApplicationsState.data || [], [isoApplicationsState.data])

    const isos = useMemo<iso[]>(
        () =>
            (isoState.list || []).map((item: any) => ({
                id: String(item.id),
                name: item.name || 'Unnamed ISO',
                email: item.email || undefined,
                phone: item.phone || undefined,
                accountDetails: item.bankAccountNo || '',
                routingNumber: item.routingNumber || '',
                commissionPercentage: Number(item.commissionPercentage || 0),
                initials: initialsFromName(item.name || ''),
                joinDate: item.createdAt ? String(item.createdAt).slice(0, 10) : undefined,
                applications: Array.isArray(item.applications) ? item.applications : [],
            })),
        [isoState.list],
    )
    const seededAppsByIso = useMemo<Record<string, any[]>>(
        () =>
            isos.reduce((acc, item) => {
                acc[item.id] = Array.isArray(item.applications) ? item.applications : []
                return acc
            }, {} as Record<string, any[]>),
        [isos],
    )
    /** User’s explicit pick; empty string means “follow first ISO in list” (no extra render delay). */
    const [selectedId, setSelectedId] = useState<string>('')
    const effectiveSelectedId = useMemo(
        () => selectedId || isos[0]?.id || '',
        [selectedId, isos],
    )
    const myDealsSummaryCacheRef = useRef<Record<string, IsoMyDealsSummary>>({})

    const [addOpen, setAddOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [form, setForm] = useState<AddisoForm>(emptyForm)
    const [isoMyDealsLoading, setIsoMyDealsLoading] = useState(false)
    const [isoMyDealsSummary, setIsoMyDealsSummary] = useState<IsoMyDealsSummary>({
        totalEarned: 0,
        totalPaid: 0,
        pendingPayout: 0,
    })

    useEffect(() => {
        dispatch(getIsos())
    }, [dispatch])

    useEffect(() => {
        if (effectiveSelectedId) {
            dispatch(getApplicationsByIsoId(effectiveSelectedId))
        }
    }, [dispatch, effectiveSelectedId])

    useEffect(() => {
        if (!effectiveSelectedId) {
            setIsoMyDealsSummary({ totalEarned: 0, totalPaid: 0, pendingPayout: 0 })
            setIsoMyDealsLoading(false)
            return
        }
        const cached = myDealsSummaryCacheRef.current[effectiveSelectedId]
        const emptySummary = { totalEarned: 0, totalPaid: 0, pendingPayout: 0 }
        if (cached) {
            setIsoMyDealsSummary(cached)
            setIsoMyDealsLoading(false)
        } else {
            setIsoMyDealsSummary(emptySummary)
            setIsoMyDealsLoading(true)
        }
        let cancelled = false
        void fetchIsoMyDeals(effectiveSelectedId, { page: 1, limit: 100 })
            .then((res) => {
                if (!cancelled) {
                    setIsoMyDealsSummary(res.summary)
                    myDealsSummaryCacheRef.current[effectiveSelectedId] = res.summary
                }
            })
            .catch(() => {
                if (!cancelled && !myDealsSummaryCacheRef.current[effectiveSelectedId]) {
                    setIsoMyDealsSummary(emptySummary)
                }
            })
            .finally(() => {
                if (!cancelled) setIsoMyDealsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [effectiveSelectedId])

    const selectediso = useMemo(
        () => isos.find((b) => b.id === effectiveSelectedId) ?? isos[0],
        [isos, effectiveSelectedId],
    )
    const fetchedSelectedApps = useMemo(
        () =>
            (isoApplications as any[]).filter((app: any) => {
                const appIsoId = String(app?.isoId ?? app?.iso?.id ?? '')
                return appIsoId && appIsoId === effectiveSelectedId
            }),
        [isoApplications, effectiveSelectedId],
    )
    const selectedApps = useMemo(() => {
        // Show preloaded ISO-linked apps instantly while the per-ISO fetch refreshes in background.
        if (fetchedSelectedApps.length > 0) return fetchedSelectedApps
        return seededAppsByIso[effectiveSelectedId] || []
    }, [fetchedSelectedApps, seededAppsByIso, effectiveSelectedId])
    const { recentDeals, recentDealsApprovedTotal } = useMemo(() => {
        const sorted = [...selectedApps].sort(
            (a, b) => appRecentTimestampMs(b) - appRecentTimestampMs(a),
        )
        const top = sorted.slice(0, 3)
        let recentDealsApprovedTotal = 0
        const recentDeals = top.map((app: any) => {
            const approvedAmount = resolveApprovedAmountFromApplication(app)
            recentDealsApprovedTotal += approvedAmount
            const statusRaw = resolveApplicationRawStatus(app as Record<string, unknown>)
            const trimmed = statusRaw.trim()
            return {
                name:
                    app?.client?.business?.name ||
                    app?.client?.businessName ||
                    `Application #${app?.applicationId ?? app?.id ?? '—'}`,
                date: formatDate(app?.createdAt),
                approvedAmount,
                currentQueue: formatCurrentQueue(app),
                statusRaw,
                statusLabel: formatStatusLabel(statusRaw),
                statusUpper: trimmed ? trimmed.toUpperCase() : '',
            }
        })
        return { recentDeals, recentDealsApprovedTotal }
    }, [selectedApps])
    const totals = useMemo(
        () => ({
            deals: selectedApps.length,
        }),
        [selectedApps],
    )

    /**
     * Same math as ISO portal (`BrokerPortal`): `/iso/:id/my-deals` rows —
     * total = sum of commissionAmount; paid = paid payoutStatus; pending = unpaid commission dollars.
     */
    const myDealsCommissionStats = useMemo(
        () => ({
            total: isoMyDealsSummary.totalEarned,
            paid: isoMyDealsSummary.totalPaid,
            pendingAmount: isoMyDealsSummary.pendingPayout,
        }),
        [isoMyDealsSummary],
    )

    const myDealsStatsPlaceholder =
        isoMyDealsLoading && !myDealsSummaryCacheRef.current[effectiveSelectedId] ? '…' : null
    const openAddDialog = useCallback(() => {
        setForm(emptyForm)
        setAddOpen(true)
    }, [])

    const openEditDialog = useCallback(() => {
        if (!selectediso) return
        setForm({
            name: selectediso.name,
            email: selectediso.email || '',
            phone: selectediso.phone || '',
            accountDetails: selectediso.accountDetails,
            routingNumber: selectediso.routingNumber,
            commissionPercentage: String(selectediso.commissionPercentage ?? 0),
        })
        setEditOpen(true)
    }, [selectediso])

    const submitAddiso = useCallback(async () => {
        const name = form.name.trim()
        const commissionPercentage = Number(form.commissionPercentage)
        if (
            !name ||
            !form.accountDetails.trim() ||
            !form.routingNumber.trim() ||
            !Number.isFinite(commissionPercentage) ||
            commissionPercentage < 0 ||
            commissionPercentage > 100
        )
            return
        try {
            await dispatch(
                createIso({
                    name,
                    email: form.email.trim() || null,
                    phone: form.phone.trim() || null,
                    bankAccountNo: form.accountDetails.trim(),
                    routingNumber: form.routingNumber.trim(),
                    commissionPercentage,
                }),
            ).unwrap()
            await dispatch(getIsos()).unwrap()
            setAddOpen(false)
            setForm(emptyForm)
        } catch {
            // errors are handled in redux state; keep dialog open
        }
    }, [dispatch, form])

    const submitEditiso = useCallback(async () => {
        if (!selectediso) return
        const name = form.name.trim()
        const commissionPercentage = Number(form.commissionPercentage)
        if (
            !name ||
            !form.accountDetails.trim() ||
            !form.routingNumber.trim() ||
            !Number.isFinite(commissionPercentage) ||
            commissionPercentage < 0 ||
            commissionPercentage > 100
        )
            return
        try {
            await dispatch(
                updateIso({
                    id: selectediso.id,
                    data: {
                        name,
                        email: form.email.trim() || null,
                        phone: form.phone.trim() || null,
                        bankAccountNo: form.accountDetails.trim(),
                        routingNumber: form.routingNumber.trim(),
                        commissionPercentage,
                    },
                }),
            ).unwrap()
            await dispatch(getIsos()).unwrap()
            setEditOpen(false)
            setForm(emptyForm)
        } catch {
            // errors handled in redux state
        }
    }, [dispatch, form, selectediso])

    const handleDeleteIso = useCallback(async () => {
        if (!selectediso || isoState.deleteLoading) return
        const shouldDelete = window.confirm(`Delete ISO "${selectediso.name}"?`)
        if (!shouldDelete) return
        try {
            await dispatch(deleteIso(selectediso.id)).unwrap()
            await dispatch(getIsos()).unwrap()
            if (!selectedId || selectedId === selectediso.id) {
                const remaining = isos.filter((x) => x.id !== selectediso.id)
                setSelectedId(remaining[0]?.id || '')
            }
        } catch {
            // errors handled in redux state
        }
    }, [dispatch, selectedId, selectediso, isos, isoState.deleteLoading])

    const sidebarBg = isDark ? 'bg-[#141517] border-[#374151]' : 'bg-muted/40 border-border'
    const mainBg = isDark ? 'bg-[#141517]' : 'bg-background'
    const panelBg = isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-border'
    const subtlePanelBg = isDark ? 'bg-[#1f2024] border-[#374151]' : 'bg-slate-50 border-slate-200/80'
    const listCardIdle = isDark
        ? 'border-[#374151] bg-[#1f2024] hover:border-slate-500'
        : 'border-border bg-card hover:border-muted-foreground/30'
    const listCardActive = isDark
        ? 'border-[var(--brand)]/55 bg-[#1f2024] ring-1 ring-[var(--brand)]/30'
        : 'border-blue-500/50 bg-blue-50/80 ring-1 ring-blue-500/20'

    return (
        <div className="w-full space-y-6">
            <div
                className={`relative overflow-hidden rounded-3xl border p-6 shadow-sm ${isDark ? 'border-[#2D3B4F]' : 'border-[#E2ECF4]'
                    }`}
            >
                <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground">COMMISSION PORTAL</p>
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">ISO Management</h2>
                    <p className="text-sm text-muted-foreground">
                        Add and maintain ISO (broker) profiles: commission rate, contact info, and banking details. Select an ISO
                        to review linked applications, deal summaries, and performance metrics in one place.
                    </p>
                </div>
            </div>
            <div
                className={`flex min-h-[min(720px,78vh)] flex-col overflow-hidden rounded-2xl border shadow-sm lg:flex-row ${isDark ? 'border-slate-800' : 'border-border'}`}
            >
                {/* Left: iso list (reference layout ~25–30% width) */}
                <aside
                    className={`flex w-full shrink-0 flex-col gap-4 border-b p-4 lg:w-80 lg:border-b-0 lg:border-r ${sidebarBg}`}
                >
                    <Button
                        type="button"
                        className="h-10 w-full rounded-lg font-semibold text-white shadow-sm bg-[image:var(--brand-gradient)] hover:opacity-90 cursor-pointer"
                        onClick={openAddDialog}
                    >
                        <Plus className="h-4 w-4" />
                        Add ISO
                    </Button>
                    {isoState.listError ? (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-400">
                            {isoState.listError}
                        </div>
                    ) : null}

                    <div className="scrollbar-thin flex max-h-[min(560px,55vh)] flex-1 flex-col gap-3 overflow-y-auto lg:max-h-[min(680px,72vh)]">
                        {isoState.listLoading && isos.length === 0 ? (
                            <div className={`rounded-xl border p-4 text-xs ${subtlePanelBg}`}>
                                <div className="mb-2 flex items-center gap-2 text-blue-400">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Loading ISOs...
                                </div>
                                <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Fetching broker profiles and settings.</p>
                            </div>
                        ) : null}
                        {!isoState.listLoading && isos.length === 0 ? (
                            <div className={`rounded-xl border p-4 text-xs ${subtlePanelBg}`}>
                                <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>No ISOs yet</p>
                                <p className={`mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Add your first ISO to start tracking deals and commissions.
                                </p>
                            </div>
                        ) : null}
                        {isos.map((iso) => {
                            const isActive = selectediso?.id === iso.id
                            return (
                                <button
                                    key={iso.id}
                                    type="button"
                                    onClick={() => setSelectedId(iso.id)}
                                    className={`rounded-xl border p-3 text-left transition-all ${isActive ? listCardActive : listCardIdle}`}
                                >
                                    <div className="flex gap-3">
                                        <div
                                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${isActive
                                                ? 'border-[var(--brand)]/50 bg-[#141517] text-[#C07BE0]'
                                                : isDark
                                                    ? 'border-[var(--brand)]/30 bg-[#141517] text-[#C07BE0]'
                                                    : 'border-border bg-muted text-blue-600'
                                                }`}
                                        >
                                            {iso.initials}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <h3
                                                    className={`truncate text-sm font-bold ${isDark ? 'text-white' : 'text-foreground'}`}
                                                >
                                                    {iso.name}
                                                </h3>
                                                <span className={tierPillClass(isDark)}>ISO</span>
                                            </div>
                                            <p className="truncate text-[10px] text-slate-500 dark:text-slate-500">
                                                Commission {iso.commissionPercentage}%
                                            </p>
                                            <div className="mt-2 flex flex-wrap items-baseline gap-x-1 text-[10px] leading-tight">
                                                <span className={isDark ? 'text-slate-300' : 'text-muted-foreground'}>
                                                    Joined {formatDate(iso.joinDate)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </aside>

                {/* Right: detail panel */}
                {selectediso && (
                    <main className={`flex flex-1 flex-col overflow-y-auto p-6 lg:p-8 ${mainBg}`}>
                        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-foreground'}`}>
                                        {selectediso.name}
                                    </h1>
                                    <span className={tierPillClass(isDark)}>ISO</span>
                                </div>
                                <div
                                    className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${isDark ? 'text-slate-500' : 'text-muted-foreground'}`}
                                >
                                    <span className="inline-flex items-center gap-1">
                                        <Mail className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                        {selectediso.email ?? '—'}
                                    </span>
                                    {selectediso.phone ? (
                                        <span className="inline-flex items-center gap-1">
                                            <Phone className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                            {formatUSPhoneNumber(selectediso.phone)}
                                        </span>
                                    ) : null}
                                </div>
                                <p className={`mt-2 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Joined {formatDate(selectediso.joinDate)} • Commission rate {selectediso.commissionPercentage}%
                                </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                                <Button type="button" variant="outline" className="gap-2" onClick={openEditDialog}>
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                </Button>
                                <Button type="button" variant="destructive" className="gap-2" onClick={handleDeleteIso}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                </Button>
                                {/* <ComplianceBadge label="W-9" active /> */}
                                {/* <ComplianceBadge label="ACH" active={Boolean(selectediso.accountDetails && selectediso.routingNumber)} /> */}
                            </div>
                        </div>
                        {isoApplicationsState.error ? (
                            <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                {isoApplicationsState.error}
                            </div>
                        ) : null}

                        <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                            <CommissionStatCard
                                label="Deals"
                                value={String(totals.deals)}
                                subtitle="For This ISO"
                                icon={Layers}
                                accent="blue"
                                isDark={isDark}
                            />
                            <CommissionStatCard
                                label="Funded Amount"
                                value={
                                    isoApplicationsState.loading && selectedApps.length === 0
                                        ? '…'
                                        : formatCurrency(recentDealsApprovedTotal)
                                }
                                subtitle="Recent Deals Total"
                                icon={CircleDollarSign}
                                accent="blue"
                                isDark={isDark}
                            />
                            <CommissionStatCard
                                label="Total Commission"
                                value={
                                    myDealsStatsPlaceholder ??
                                    formatCurrency(myDealsCommissionStats.total)
                                }
                                subtitle="All Linked Deals"
                                icon={TrendingUp}
                                accent="emerald"
                                isDark={isDark}
                            />
                            <CommissionStatCard
                                label="Paid out"
                                value={
                                    myDealsStatsPlaceholder ??
                                    formatCurrency(myDealsCommissionStats.paid)
                                }
                                subtitle="Marked Paid"
                                icon={CheckCircle2}
                                accent="emerald"
                                isDark={isDark}
                            />
                            <CommissionStatCard
                                label="Pending payout"
                                value={
                                    myDealsStatsPlaceholder ??
                                    formatCurrency(myDealsCommissionStats.pendingAmount)
                                }
                                subtitle="Not Yet Paid"
                                icon={Clock}
                                accent="blue"
                                isDark={isDark}
                            />
                        </div>

                        <div className="mb-10">
                            <h4
                                className={`mb-4 border-b pb-2 text-[10px] font-bold uppercase tracking-widest ${isDark ? 'border-slate-800 text-slate-500' : 'border-border text-muted-foreground'}`}
                            >
                                Commission Settings
                            </h4>
                            <div className={`overflow-hidden rounded-xl border ${panelBg}`}>
                                <SettingRow label="Commission" value={`${selectediso.commissionPercentage}%`} isDark={isDark} />
                                {/* <SettingRow label="Payout Trigger" value="On Funding" isDark={isDark} /> */}
                                {/* <SettingRow label="Min Payout Threshold" value="$100" isDark={isDark} /> */}
                                <SettingRow label="Joined" value={formatDate(selectediso.joinDate)} isDark={isDark} last />
                            </div>
                        </div>

                        <div className={`mb-10 rounded-xl border p-4 ${panelBg}`}>
                            <div className="mb-3 flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-500">
                                    <Landmark className="h-4 w-4" />
                                </span>
                                <p
                                    className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-muted-foreground'}`}
                                >
                                    Payout banking
                                </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <DetailTile label="Account details" value={maskSensitive(selectediso.accountDetails)} isDark={isDark} />
                                <DetailTile label="Routing number" value={maskSensitive(selectediso.routingNumber)} isDark={isDark} />
                            </div>
                        </div>

                        <div>
                            <h4
                                className={`mb-4 border-b pb-2 text-[10px] font-bold uppercase tracking-widest ${isDark ? 'border-slate-800 text-slate-500' : 'border-border text-muted-foreground'}`}
                            >
                                Recent Deals ({recentDeals.length})
                            </h4>
                            {isoApplicationsState.loading && selectedApps.length === 0 ? (
                                <div className={`rounded-xl border p-4 text-xs ${subtlePanelBg}`}>
                                    <div className="flex items-center gap-2 text-blue-400">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Loading recent deals...
                                    </div>
                                </div>
                            ) : recentDeals.length > 0 ? (
                                <div className="space-y-4">
                                    {recentDeals.map((d, idx) => (
                                        <RecentDeal
                                            key={`${d.name}-${d.date}-${idx}`}
                                            name={d.name}
                                            date={d.date}
                                            approvedAmount={d.approvedAmount}
                                            currentQueue={d.currentQueue}
                                            statusLabel={d.statusLabel}
                                            statusUpper={d.statusUpper}
                                            isDark={isDark}
                                            formatCurrency={formatCurrency}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className={`rounded-xl border p-4 text-xs ${subtlePanelBg}`}>
                                    <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>No recent deals</p>
                                    <p className={`mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        New applications for this ISO will appear here.
                                    </p>
                                </div>
                            )}
                        </div>
                    </main>
                )}
                {!selectediso && !isoState.listLoading ? (
                    <main className={`flex flex-1 items-center justify-center p-8 ${mainBg}`}>
                        <div className={`max-w-sm rounded-xl border p-6 text-center ${subtlePanelBg}`}>
                            <p className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                Select an ISO profile
                            </p>
                            <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                Choose a profile from the left panel to view commissions, banking, and recent deals.
                            </p>
                        </div>
                    </main>
                ) : null}
            </div>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add ISO</DialogTitle>
                        <DialogDescription>
                            Enter contact information and ACH details. Sensitive values are stored for this session and shown masked in the
                            profile.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="iso-name">Name</Label>
                            <Input
                                id="iso-name"
                                autoComplete="name"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Full name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="iso-email">Email</Label>
                            <Input
                                id="iso-email"
                                type="email"
                                autoComplete="email"
                                value={form.email}
                                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                placeholder="name@company.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="iso-phone">Phone</Label>
                            <Input
                                id="iso-phone"
                                type="tel"
                                autoComplete="tel"
                                value={formatUSPhoneNumber(form.phone)}
                                onChange={(e) =>
                                    handleUSPhoneInputChange(e, (value) =>
                                        setForm((f) => ({ ...f, phone: value }))
                                    )
                                }
                                placeholder="(555) 000-0000"
                                inputMode="numeric"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="iso-account">Account details</Label>
                            <Input
                                id="iso-account"
                                autoComplete="off"
                                value={form.accountDetails}
                                onChange={(e) => setForm((f) => ({ ...f, accountDetails: e.target.value }))}
                                placeholder="Bank account number"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="iso-routing">Routing number</Label>
                            <Input
                                id="iso-routing"
                                autoComplete="off"
                                value={form.routingNumber}
                                onChange={(e) => setForm((f) => ({ ...f, routingNumber: e.target.value }))}
                                placeholder="9-digit routing"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="iso-commission">Commission Percentage</Label>
                            <Input
                                id="iso-commission"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={form.commissionPercentage}
                                onChange={(e) => setForm((f) => ({ ...f, commissionPercentage: e.target.value }))}
                                placeholder="e.g. 12.5"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                            disabled={
                                !form.name.trim() ||
                                !form.accountDetails.trim() ||
                                !form.routingNumber.trim() ||
                                !form.commissionPercentage.trim() ||
                                Number(form.commissionPercentage) < 0 ||
                                Number(form.commissionPercentage) > 100 ||
                                isoState.createLoading
                            }
                            onClick={submitAddiso}
                        >
                            {isoState.createLoading ? 'Saving...' : 'Save iso'}
                        </Button>
                    </DialogFooter>
                    {isoState.createError ? (
                        <p className="text-xs text-rose-500">{isoState.createError}</p>
                    ) : null}
                </DialogContent>
            </Dialog>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit iso</DialogTitle>
                        <DialogDescription>Update ISO details, banking and commission percentage.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="edit-iso-name">Name</Label>
                            <Input
                                id="edit-iso-name"
                                autoComplete="name"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Full name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-iso-email">Email</Label>
                            <Input
                                id="edit-iso-email"
                                type="email"
                                autoComplete="email"
                                value={form.email}
                                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                placeholder="name@company.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-iso-phone">Phone</Label>
                            <Input
                                id="edit-iso-phone"
                                type="tel"
                                autoComplete="tel"
                                value={formatUSPhoneNumber(form.phone)}
                                onChange={(e) =>
                                    handleUSPhoneInputChange(e, (value) =>
                                        setForm((f) => ({ ...f, phone: value }))
                                    )
                                }
                                placeholder="(555) 000-0000"
                                inputMode="numeric"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-iso-account">Account details</Label>
                            <Input
                                id="edit-iso-account"
                                autoComplete="off"
                                value={form.accountDetails}
                                onChange={(e) => setForm((f) => ({ ...f, accountDetails: e.target.value }))}
                                placeholder="Bank account number"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-iso-routing">Routing number</Label>
                            <Input
                                id="edit-iso-routing"
                                autoComplete="off"
                                value={form.routingNumber}
                                onChange={(e) => setForm((f) => ({ ...f, routingNumber: e.target.value }))}
                                placeholder="9-digit routing"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-iso-commission">Commission Percentage</Label>
                            <Input
                                id="edit-iso-commission"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={form.commissionPercentage}
                                onChange={(e) => setForm((f) => ({ ...f, commissionPercentage: e.target.value }))}
                                placeholder="e.g. 12.5"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                            disabled={
                                !form.name.trim() ||
                                !form.accountDetails.trim() ||
                                !form.routingNumber.trim() ||
                                !form.commissionPercentage.trim() ||
                                Number(form.commissionPercentage) < 0 ||
                                Number(form.commissionPercentage) > 100 ||
                                isoState.updateLoading
                            }
                            onClick={submitEditiso}
                        >
                            {isoState.updateLoading ? 'Saving...' : 'Save changes'}
                        </Button>
                    </DialogFooter>
                    {isoState.updateError ? (
                        <p className="text-xs text-rose-500">{isoState.updateError}</p>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    )
}

const commissionStatAccent: Record<
    'blue' | 'emerald',
    { iconWrap: string; subtitle: string }
> = {
    blue: {
        iconWrap:
            'bg-blue-500/[0.12] text-blue-600 ring-1 ring-inset ring-blue-500/10 dark:bg-blue-500/[0.14] dark:text-blue-400 dark:ring-blue-400/15',
        subtitle: 'text-blue-600/90 dark:text-blue-400/90',
    },
    emerald: {
        iconWrap:
            'bg-emerald-500/[0.12] text-emerald-600 ring-1 ring-inset ring-emerald-500/10 dark:bg-emerald-500/[0.14] dark:text-emerald-400 dark:ring-emerald-400/15',
        subtitle: 'text-emerald-600/90 dark:text-emerald-400/90',
    },
}

function CommissionStatCard({
    label,
    value,
    subtitle,
    icon: Icon,
    accent,
    isDark,
}: {
    label: string
    value: string
    subtitle: string
    icon: LucideIcon
    accent: keyof typeof commissionStatAccent
    isDark: boolean
}) {
    const a = commissionStatAccent[accent]
    const cardBase = isDark
        ? 'rounded-lg border border-[#374151] bg-[#141517] shadow-[0_1px_2px_rgba(0,0,0,0.2)]'
        : 'rounded-lg border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]'

    return (
        <div className={`flex flex-col gap-1.5 px-3.5 py-3 ${cardBase} transition-[box-shadow,border-color] duration-200 hover:border-slate-300/90 hover:shadow-[0_2px_8px_rgba(15,23,42,0.07)] dark:hover:border-slate-600/90`}>
            <div className="flex items-center justify-between gap-2">
                <p
                    className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                >
                    {label}
                </p>
                <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.iconWrap}`}
                    aria-hidden
                >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
            </div>
            <p
                className={`text-lg font-bold tabular-nums leading-none tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}
            >
                {value}
            </p>
            <p className={`text-[11px] font-medium leading-tight ${a.subtitle}`}>{subtitle}</p>
        </div>
    )
}

function DetailTile({
    label,
    value,
    isDark,
}: {
    label: string
    value: string
    isDark: boolean
}) {
    return (
        <div
            className={`rounded-xl border px-3 py-2.5 ${isDark ? 'border-[#2F4055] bg-[#0c121c]/90' : 'border-slate-200/90 bg-slate-50/90'
                }`}
        >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-sm font-medium tabular-nums text-foreground">{value}</p>
        </div>
    )
}

function SettingRow({
    label,
    value,
    isDark,
    last,
}: {
    label: string
    value: string
    isDark: boolean
    last?: boolean
}) {
    return (
        <div
            className={`flex justify-between gap-4 px-4 py-3.5 text-xs ${!last ? (isDark ? 'border-b border-slate-700/90' : 'border-b border-border') : ''}`}
        >
            <span className={isDark ? 'font-medium text-slate-500' : 'text-muted-foreground'}>{label}</span>
            <span className={`text-right font-semibold ${isDark ? 'text-white' : 'text-foreground'}`}>{value}</span>
        </div>
    )
}

function RecentDeal({
    name,
    date,
    approvedAmount,
    currentQueue,
    statusLabel,
    statusUpper,
    isDark,
    formatCurrency,
}: {
    name: string
    date: string
    approvedAmount: number
    currentQueue: string
    statusLabel: string
    statusUpper: string
    isDark: boolean
    formatCurrency: (value: number) => string
}) {
    const approvedLabel =
        Number.isFinite(approvedAmount) && approvedAmount > 0 ? formatCurrency(approvedAmount) : '—'

    return (
        <div
            className={`group flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 ${
                isDark ? 'border-[#374151] bg-[#1f2024]' : 'border-slate-200/80 bg-slate-50/70'
            }`}
        >
            <div className="min-w-0 flex-1">
                <div>
                    <span
                        className={`text-sm font-bold transition-colors ${isDark ? 'text-white group-hover:text-blue-400' : 'text-foreground group-hover:text-blue-600'}`}
                    >
                        {name}
                    </span>
                    <span className={`ml-2 text-[11px] ${isDark ? 'text-slate-600' : 'text-muted-foreground'}`}>{date}</span>
                </div>
                <p className={`mt-1 text-[11px] ${isDark ? 'text-slate-500' : 'text-muted-foreground'}`}>
                    <span className="font-semibold uppercase tracking-wide text-[9px] text-muted-foreground/80">Queue</span>{' '}
                    <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-foreground'}`}>{currentQueue}</span>
                </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 sm:shrink-0">
                <div className="text-right">
                    <p className="text-[8px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                        Approved Amount
                        {/* <span className="mt-0.5 block font-normal normal-case tracking-normal opacity-90">(offer approved)</span> */}
                    </p>
                    <p className="text-md font-bold tabular-nums text-slate-900 dark:text-slate-100">{approvedLabel}</p>
                </div>
                <div className="text-right">
                    {/* <p className="text-[8px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                        Current status
                    </p> */}
                    {/* <span
                        className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${statusPillClass(statusUpper)}`}
                    >
                        {statusLabel}
                    </span> */}
                </div>
            </div>
        </div>
    )
}
