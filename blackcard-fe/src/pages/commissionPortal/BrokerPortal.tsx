import { formatInTimeZone } from 'date-fns-tz'
import { BUSINESS_TIMEZONE } from '@/lib/dateTime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    TrendingUp,
    CheckCircle2,
    Clock,
    Percent,
    Loader2,
    Upload,
    FileText,
    Trash2,
    EyeIcon,
    Search,
    ChevronLeft,
    ChevronRight,
    Calendar,
    PencilIcon,
} from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDispatch, useSelector } from 'react-redux'

import type { AppDispatch, RootState } from '@/redux/store'
import { getIsos, updateIso } from '@/redux/actions/isoActions'
import { formatCurrency, formatDate as formatDateUtil, type DateInput, cn } from '@/lib/utils'
import {
    fetchIsoMyDeals,
    updateIsoDealPayout,
    type IsoMyDealRow,
    type IsoMyDealsResponse,
    type IsoMyDealsSummary,
} from '@/lib/isoDealsApi'
import type { Iso, IsoDocumentCategory, IsoDocumentItem } from '@/types/isoTypes'
import { axiosGet, axiosPostFormData, axiosDelete } from '@/redux/axios'
import { invalidateApplicationsListCache } from '@/lib/applicationsListCache'
import { toast } from 'react-toastify'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const STORAGE_LAST_ISO = 'inhousecrm:brokerPortal:lastIsoId'
const DEALS_CACHE_PREFIX = 'inhousecrm:brokerPortal:deals:v1:'

function readLastIsoIdFromStorage(): string {
    try {
        return sessionStorage.getItem(STORAGE_LAST_ISO)?.trim() ?? ''
    } catch {
        return ''
    }
}

function writeLastIsoIdToStorage(id: string) {
    if (!id) return
    try {
        sessionStorage.setItem(STORAGE_LAST_ISO, id)
    } catch {
        /* ignore quota / private mode */
    }
}

function dealsCacheKey(isoId: string, page: number, limit: number, search: string): string {
    return `${DEALS_CACHE_PREFIX}${isoId}:${page}:${limit}:${search}`
}

function readDealsCache(
    isoId: string,
    page: number,
    limit: number,
    search: string,
): IsoMyDealsResponse | null {
    try {
        const raw = sessionStorage.getItem(dealsCacheKey(isoId, page, limit, search))
        if (!raw) return null
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== 'object') return null
        const o = parsed as Record<string, unknown>
        if (!Array.isArray(o.deals)) return null
        return {
            deals: o.deals as IsoMyDealRow[],
            total: typeof o.total === 'number' ? o.total : 0,
            page: typeof o.page === 'number' ? o.page : page,
            limit: typeof o.limit === 'number' ? o.limit : limit,
            totalPages: typeof o.totalPages === 'number' ? o.totalPages : 0,
            linkedApplicationCount:
                typeof o.linkedApplicationCount === 'number' ? o.linkedApplicationCount : 0,
            summary:
                o.summary && typeof o.summary === 'object'
                    ? {
                        totalEarned: Number((o.summary as { totalEarned?: unknown }).totalEarned) || 0,
                        totalPaid: Number((o.summary as { totalPaid?: unknown }).totalPaid) || 0,
                        pendingPayout:
                            Number((o.summary as { pendingPayout?: unknown }).pendingPayout) || 0,
                    }
                    : { totalEarned: 0, totalPaid: 0, pendingPayout: 0 },
        }
    } catch {
        return null
    }
}

function writeDealsCache(
    isoId: string,
    page: number,
    limit: number,
    search: string,
    data: IsoMyDealsResponse,
) {
    try {
        sessionStorage.setItem(dealsCacheKey(isoId, page, limit, search), JSON.stringify(data))
    } catch {
        /* ignore quota */
    }
}


const PREVIEW_EXT_TO_MIME: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
}

function extensionFromDoc(name: string, url: string): string {
    const n = name.toLowerCase().trim()
    const fromName = n.match(/\.([a-z0-9]+)$/)?.[1] ?? ''
    if (fromName) return fromName
    try {
        const path = new URL(url).pathname.toLowerCase()
        return path.match(/\.([a-z0-9]+)$/)?.[1] ?? ''
    } catch {
        return ''
    }
}

/** Match backend: avoid octet-stream for known extensions so Edge does not force download on blob: URLs. */
function resolveClientPreviewMime(
    name: string,
    url: string,
    blobType: string,
    headerCt?: string,
): string {
    const ext = extensionFromDoc(name, url)
    if (ext && PREVIEW_EXT_TO_MIME[ext]) {
        return PREVIEW_EXT_TO_MIME[ext]
    }
    const h = headerCt?.split(';')[0]?.trim().toLowerCase()
    if (h && h !== 'application/octet-stream') {
        return h
    }
    if (blobType && blobType !== 'application/octet-stream') {
        return blobType
    }
    return blobType || 'application/octet-stream'
}

function IsoPortalPdfPages({ fileUrl, isDark }: { fileUrl: string; isDark: boolean }) {
    const [numPages, setNumPages] = useState<number | null>(null)
    const [pageWidth, setPageWidth] = useState(800)

    useEffect(() => {
        const update = () => setPageWidth(Math.min(920, Math.max(280, window.innerWidth - 96)))
        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    return (
        <Document
            file={fileUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={() => {
                toast.error('Could not render this PDF in the viewer.')
            }}
            loading={
                <div className="flex min-h-[200px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
                </div>
            }
            className="flex flex-col items-center gap-3 py-4"
        >
            {numPages
                ? Array.from({ length: numPages }, (_, i) => (
                    <Page
                        key={i + 1}
                        pageNumber={i + 1}
                        width={pageWidth}
                        className={cn('shadow-md', isDark ? 'bg-neutral-900' : 'bg-white')}
                        renderTextLayer
                        renderAnnotationLayer
                    />
                ))
                : null}
        </Document>
    )
}

/** `yyyy-mm-dd` → `mm/dd/yyyy` for US-style display. */
function isoYmdToUsDisplay(ymd: string): string {
    const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return ''
    return `${m[2]}/${m[3]}/${m[1]}`
}

/** Parse strict `m/d/yyyy` or `mm/dd/yyyy` → `yyyy-mm-dd` for the API. */
function usDisplayToIsoYmd(s: string): string | null {
    const t = s.trim()
    if (!t) return null
    const match = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!match) return null
    const month = Number(match[1])
    const day = Number(match[2])
    const year = Number(match[3])
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null
    const d = new Date(Date.UTC(year, month - 1, day))
    if (
        d.getUTCFullYear() !== year ||
        d.getUTCMonth() !== month - 1 ||
        d.getUTCDate() !== day
    ) {
        return null
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

type IsoTier = 'STANDARD' | 'GOLD' | 'PLATINUM'

type IsoRow = {
    id: string
    name: string
    company: string
    initials: string
    tier: IsoTier
    email?: string
    phone?: string
    bankAccountNo: string
    routingNumber: string
    commissionPercentage: number
    documents: IsoDocumentItem[]
}

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function tierFromCommissionPct(pct: number): IsoTier {
    if (pct >= 15) return 'PLATINUM'
    if (pct >= 12) return 'GOLD'
    return 'STANDARD'
}

function tierPillClass(tier: IsoTier, isDark: boolean): string {
    const base = 'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide border uppercase'
    switch (tier) {
        case 'PLATINUM':
            return `${base} ${isDark
                ? 'border-slate-400/40 bg-slate-500/15 text-slate-200'
                : 'border-slate-300 bg-slate-100 text-slate-700'
                }`
        case 'GOLD':
            return `${base} ${isDark
                ? 'border-orange-400/30 bg-orange-400/10 text-orange-400'
                : 'border-amber-300 bg-amber-50 text-amber-800'
                }`
        default:
            return `${base} ${isDark
                ? 'border-slate-600 bg-slate-800/80 text-slate-400'
                : 'border-slate-200 bg-slate-100 text-slate-600'
                }`
    }
}

function tierSubtitle(tier: IsoTier): string {
    const name = tier.charAt(0) + tier.slice(1).toLowerCase()
    return `${name} Tier`
}

function parseNum(v: unknown): number {
    if (typeof v === 'number' && !Number.isNaN(v)) return v
    if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[^0-9.-]+/g, ''))
        return Number.isNaN(n) ? 0 : n
    }
    return 0
}

function toDateInputValue(isoLike: string | null): string {
    if (!isoLike) return ''
    const d = new Date(isoLike)
    if (Number.isNaN(d.getTime())) return ''
    const z = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - z).toISOString().slice(0, 10)
}

/** Scheduled pay from API → `yyyy-mm-dd` (avoids TZ shift on date-only strings). */
function scheduledPayDateToInputValue(raw: string | null | undefined): string {
    if (raw == null || !String(raw).trim()) return ''
    const s = String(raw).trim()
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
    return m ? m[1] : toDateInputValue(s)
}

function scheduledPayDateToUsDisplay(raw: string | null | undefined): string {
    const ymd = scheduledPayDateToInputValue(raw)
    return ymd ? isoYmdToUsDisplay(ymd) : ''
}

/** Local calendar date + time from an ISO string, for US-style paid-at fields. */
function paidAtToUsDateAndTime(isoLike: string | null): { date: string; time: string } {
    if (!isoLike) return { date: '', time: '' }
    const d = new Date(isoLike)
    if (Number.isNaN(d.getTime())) return { date: '', time: '' }
    // Eastern Time, like the rest of the CRM.
    return {
        date: isoYmdToUsDisplay(formatInTimeZone(d, BUSINESS_TIMEZONE, 'yyyy-MM-dd')),
        time: formatInTimeZone(d, BUSINESS_TIMEZONE, 'HH:mm'),
    }
}

type CommissionPayoutStatus = 'paid' | 'pending' | 'clawbacks'

function commissionPayoutBadgeClass(status: CommissionPayoutStatus, isDark: boolean): string {
    if (status === 'paid') {
        return isDark
            ? ' text-emerald-400'
            : ' text-emerald-700'
    }
    if (status === 'clawbacks') {
        return isDark
            ? ' text-rose-300'
            : ' text-rose-700'
    }
    return isDark
        ? ' text-amber-400'
        : ' text-amber-700'
}

function commissionPayoutStatusLabel(status: CommissionPayoutStatus): string {
    if (status === 'paid') return 'Paid'
    if (status === 'clawbacks') return 'Clawbacks'
    return 'Pending'
}

function payDateDisplay(row: IsoMyDealRow): string {
    if (row.payoutStatus === 'paid' && row.paidAt) {
        return formatDateUtil(row.paidAt as DateInput, '—')
    }
    if (row.scheduledPayDate) {
        return formatDateUtil(row.scheduledPayDate as DateInput, '—')
    }
    return '—'
}

/** Mirror Applications list behavior: prefer imported dealId, else business applicationId. */
function getIsoDealIdDisplay(row: IsoMyDealRow): string {
    const rawDealId = row.dealId?.trim()
    if (rawDealId) return rawDealId
    if (row.applicationNumber != null) return String(row.applicationNumber)
    return '-'
}

function normalizeIsoDocuments(raw: unknown): IsoDocumentItem[] {
    if (!Array.isArray(raw)) return []
    const out: IsoDocumentItem[] = []
    for (const d of raw) {
        if (d == null || typeof d !== 'object') continue
        const o = d as Record<string, unknown>
        if (typeof o.id !== 'string' || typeof o.url !== 'string') continue
        const c = o.category != null ? String(o.category).trim().toLowerCase() : ''
        const category: IsoDocumentCategory | undefined =
            c === 'w9' || c === 'supporting' || c === 'other' ? c : undefined
        out.push({
            id: o.id,
            url: o.url,
            originalName: typeof o.originalName === 'string' ? o.originalName : 'Document',
            publicId: o.publicId != null && String(o.publicId).trim() ? String(o.publicId) : null,
            uploadedAt:
                typeof o.uploadedAt === 'string' && o.uploadedAt.trim()
                    ? o.uploadedAt
                    : new Date().toISOString(),
            ...(category ? { category } : {}),
        })
    }
    return out
}

function looksLikeW9FileName(name: string): boolean {
    return /w\s*-?\s*9|\bw9\b|1099|tax\s*form/i.test(name)
}

/** W-9 slot: explicit category or legacy uploads matched by filename. */
function isW9PortalDoc(d: IsoDocumentItem): boolean {
    if (d.category === 'w9') return true
    if (!d.category && looksLikeW9FileName(d.originalName)) return true
    return false
}

export default function BrokerPortal() {
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'
    const dispatch = useDispatch<AppDispatch>()
    // const navigate = useNavigate()

    const isoList = useSelector((state: RootState) => state.iso.list)
    const isoListLoading = useSelector((state: RootState) => state.iso.listLoading)
    const isoUpdateLoading = useSelector((state: RootState) => state.iso.updateLoading)

    const isos = useMemo<IsoRow[]>(
        () =>
            (isoList || []).map((item: Iso) => {
                const ext = item as Iso & { _id?: string }
                const pct = parseNum(ext.commissionPercentage)
                return {
                    id: String(ext.id ?? ext._id ?? ''),
                    name: String(ext.name || 'Unnamed ISO'),
                    company: 'ISO Partner',
                    initials: initialsFromName(String(ext.name || '')),
                    tier: tierFromCommissionPct(pct),
                    email: ext.email ? String(ext.email) : undefined,
                    phone: ext.phone ? String(ext.phone) : undefined,
                    bankAccountNo: String(ext.bankAccountNo ?? ''),
                    routingNumber: String(ext.routingNumber ?? ''),
                    commissionPercentage: pct,
                    documents: normalizeIsoDocuments((ext as Iso & { documents?: unknown }).documents),
                }
            }),
        [isoList],
    )

    const [selectedId, setSelectedId] = useState<string>(() => readLastIsoIdFromStorage())
    const [bankOpen, setBankOpen] = useState(false)
    const [bankForm, setBankForm] = useState({ bankAccountNo: '', routingNumber: '' })

    const [myDeals, setMyDeals] = useState<IsoMyDealRow[]>([])
    const [dealsLoading, setDealsLoading] = useState(false)
    const [dealsPage, setDealsPage] = useState(1)
    const [dealsPageSize, setDealsPageSize] = useState(10)
    const [dealsSearchInput, setDealsSearchInput] = useState('')
    const [debouncedDealsSearch, setDebouncedDealsSearch] = useState('')
    const [dealsTotal, setDealsTotal] = useState(0)
    const [dealsTotalPages, setDealsTotalPages] = useState(0)
    const [dealsLinkedCount, setDealsLinkedCount] = useState(0)
    const [dealsSummary, setDealsSummary] = useState<IsoMyDealsSummary>({
        totalEarned: 0,
        totalPaid: 0,
        pendingPayout: 0,
    })

    const [dealEditOpen, setDealEditOpen] = useState(false)
    const [dealEditing, setDealEditing] = useState<IsoMyDealRow | null>(null)
    const [dealEditForm, setDealEditForm] = useState({
        payoutStatus: 'pending' as CommissionPayoutStatus,
        /** US month/day/year display; converted to yyyy-mm-dd on save. */
        plannedPayDateDisplay: '',
        paidAtDateDisplay: '',
        /** 24-hour HH:mm for native time input */
        paidAtTimeDisplay: '',
    })
    const [dealSaving, setDealSaving] = useState(false)

    const supportingDocInputRef = useRef<HTMLInputElement>(null)
    const schedulePayDatePickerRef = useRef<HTMLInputElement>(null)
    const paidAtDatePickerRef = useRef<HTMLInputElement>(null)
    const [isoDocUploading, setIsoDocUploading] = useState(false)
    const [isoDocRemovingId, setIsoDocRemovingId] = useState<string | null>(null)
    const [isoDocViewer, setIsoDocViewer] = useState<{
        title: string
        originalUrl: string
        blobUrl: string | null
        mimeType: string | null
    } | null>(null)
    const [isoDocPreviewLoading, setIsoDocPreviewLoading] = useState(false)
    const isoDocPreviewSessionRef = useRef(0)
    const dealsFetchGenRef = useRef(0)
    const dealsPageSizeRef = useRef(dealsPageSize)
    dealsPageSizeRef.current = dealsPageSize

    const closeIsoDocViewer = useCallback(() => {
        isoDocPreviewSessionRef.current += 1
        setIsoDocPreviewLoading(false)
        setIsoDocViewer((v) => {
            if (v?.blobUrl) URL.revokeObjectURL(v.blobUrl)
            return null
        })
    }, [])

    const openIsoDocViewer = useCallback(
        async (doc: IsoDocumentItem) => {
            const session = ++isoDocPreviewSessionRef.current
            setIsoDocViewer({
                title: doc.originalName,
                originalUrl: doc.url,
                blobUrl: null,
                mimeType: null,
            })
            setIsoDocPreviewLoading(true)
            try {
                const res = await axiosGet('/uploads/inline-preview', {
                    params: { url: doc.url, name: doc.originalName },
                    responseType: 'blob',
                })
                if (isoDocPreviewSessionRef.current !== session) {
                    return
                }
                const rawBlob = res.data as Blob
                const headerCt =
                    typeof res.headers['content-type'] === 'string' ? res.headers['content-type'] : undefined
                const mime = resolveClientPreviewMime(
                    doc.originalName,
                    doc.url,
                    rawBlob.type,
                    headerCt,
                )
                const blob = new Blob([rawBlob], { type: mime })
                const blobUrl = URL.createObjectURL(blob)
                setIsoDocViewer((v) => {
                    if (!v || v.originalUrl !== doc.url) {
                        URL.revokeObjectURL(blobUrl)
                        return v
                    }
                    return { ...v, blobUrl, mimeType: mime }
                })
            } catch {
                toast.error('Could not load document preview.')
                if (isoDocPreviewSessionRef.current === session) {
                    setIsoDocViewer(null)
                }
            } finally {
                if (isoDocPreviewSessionRef.current === session) {
                    setIsoDocPreviewLoading(false)
                }
            }
        },
        [],
    )

    useEffect(() => {
        dispatch(getIsos())
    }, [dispatch])

    useEffect(() => {
        if (isos.length === 0) return
        const ok = Boolean(selectedId && isos.some((i) => i.id === selectedId))
        if (!ok) {
            setSelectedId(isos[0].id)
        }
    }, [isos, selectedId])

    useEffect(() => {
        if (!selectedId) return
        writeLastIsoIdToStorage(selectedId)
    }, [selectedId])

    useEffect(() => {
        const t = window.setTimeout(() => {
            const next = dealsSearchInput.trim()
            setDebouncedDealsSearch((prev) => {
                if (prev !== next) setDealsPage(1)
                return next
            })
        }, 400)
        return () => window.clearTimeout(t)
    }, [dealsSearchInput])

    /** ISO id used for the deals API — can be the last-used id before `/iso` finishes loading (parallel fetch). */
    const dealFetchIsoId = useMemo(() => {
        if (isos.length === 0) {
            return selectedId.trim()
        }
        const valid = selectedId && isos.some((i) => i.id === selectedId)
        return valid ? selectedId : (isos[0]?.id ?? '')
    }, [isos, selectedId])

    const iso = useMemo(
        () => isos.find((b) => b.id === selectedId) ?? isos[0],
        [isos, selectedId],
    )

    useEffect(() => {
        const id = iso?.id
        if (!id) return
        setDealsPage(1)
        setDealsSearchInput('')
        setDebouncedDealsSearch('')
        const cached = readDealsCache(id, 1, dealsPageSizeRef.current, '')
        if (cached) {
            setMyDeals(cached.deals)
            setDealsTotal(cached.total)
            setDealsTotalPages(cached.totalPages)
            setDealsLinkedCount(cached.linkedApplicationCount)
            setDealsSummary(cached.summary)
        } else {
            setMyDeals([])
            setDealsTotal(0)
            setDealsTotalPages(0)
            setDealsLinkedCount(0)
            setDealsSummary({ totalEarned: 0, totalPaid: 0, pendingPayout: 0 })
        }
    }, [iso?.id])

    const loadMyDeals = useCallback(async () => {
        const id = dealFetchIsoId
        if (!id) return

        const gen = ++dealsFetchGenRef.current
        const search = debouncedDealsSearch.trim()
        const cached = readDealsCache(id, dealsPage, dealsPageSize, search)

        if (cached) {
            setMyDeals(cached.deals)
            setDealsTotal(cached.total)
            setDealsTotalPages(cached.totalPages)
            setDealsLinkedCount(cached.linkedApplicationCount)
            setDealsSummary(cached.summary)
            setDealsLoading(false)
        } else {
            setDealsLoading(true)
        }

        try {
            const res = await fetchIsoMyDeals(id, {
                search: search || undefined,
                page: dealsPage,
                limit: dealsPageSize,
            })
            if (dealsFetchGenRef.current !== gen) {
                return
            }
            setMyDeals(res.deals)
            setDealsTotal(res.total)
            setDealsTotalPages(res.totalPages)
            setDealsLinkedCount(res.linkedApplicationCount)
            setDealsSummary(res.summary)
            writeDealsCache(id, dealsPage, dealsPageSize, search, res)
        } catch (e: unknown) {
            if (dealsFetchGenRef.current !== gen) {
                return
            }
            const msg =
                typeof e === 'object' && e !== null && 'response' in e
                    ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '')
                    : ''
            if (!cached) {
                toast.error(msg || 'Failed to load deals for this ISO.')
                setMyDeals([])
                setDealsTotal(0)
                setDealsTotalPages(0)
                setDealsLinkedCount(0)
                setDealsSummary({ totalEarned: 0, totalPaid: 0, pendingPayout: 0 })
            } else {
                toast.error(msg || 'Could not refresh deals; showing last loaded data.')
            }
        } finally {
            if (dealsFetchGenRef.current === gen) {
                setDealsLoading(false)
            }
        }
    }, [dealFetchIsoId, debouncedDealsSearch, dealsPage, dealsPageSize])

    useEffect(() => {
        void loadMyDeals()
    }, [loadMyDeals])

    const stats = useMemo(
        () => ({
            totalEarned: formatCurrency(dealsSummary.totalEarned, { fallback: '$0' }),
            totalPaid: formatCurrency(dealsSummary.totalPaid, { fallback: '$0' }),
            pending: formatCurrency(dealsSummary.pendingPayout, { fallback: '$0' }),
        }),
        [dealsSummary],
    )

    const dealsPageStart = dealsTotal === 0 ? 0 : (dealsPage - 1) * dealsPageSize + 1
    const dealsPageEnd = Math.min(dealsPage * dealsPageSize, dealsTotal)

    useEffect(() => {
        if (bankOpen && iso) {
            setBankForm({
                bankAccountNo: iso.bankAccountNo,
                routingNumber: iso.routingNumber,
            })
        }
    }, [bankOpen, iso])

    const supportingDocuments = useMemo(
        () => (iso?.documents ?? []).filter((d) => !isW9PortalDoc(d)),
        [iso?.documents],
    )

    const openDealEdit = (row: IsoMyDealRow) => {
        setDealEditing(row)
        const paidParts = paidAtToUsDateAndTime(row.paidAt)
        setDealEditForm({
            payoutStatus: row.payoutStatus,
            plannedPayDateDisplay: scheduledPayDateToUsDisplay(row.scheduledPayDate),
            paidAtDateDisplay: paidParts.date,
            paidAtTimeDisplay: paidParts.time,
        })
        setDealEditOpen(true)
    }

    const saveDealEdit = async () => {
        if (!iso?.id || !dealEditing) return
        setDealSaving(true)
        try {
            const plannedRaw = dealEditForm.plannedPayDateDisplay.trim()
            let scheduledPayDate: string | null = null
            if (plannedRaw) {
                const ymd = usDisplayToIsoYmd(plannedRaw)
                if (!ymd) {
                    toast.error('Enter a valid schedule pay date as month/day/year (mm/dd/yyyy).')
                    setDealSaving(false)
                    return
                }
                scheduledPayDate = ymd
            }

            let paidAtIso: string | null = null
            if (dealEditForm.payoutStatus === 'paid') {
                const dateDisp = dealEditForm.paidAtDateDisplay.trim()
                const timeDisp = dealEditForm.paidAtTimeDisplay.trim()
                if (dateDisp || timeDisp) {
                    if (!dateDisp || !timeDisp) {
                        toast.error(
                            'Enter both paid date (mm/dd/yyyy) and time, or leave both blank to use the current moment.',
                        )
                        setDealSaving(false)
                        return
                    }
                    const ymd = usDisplayToIsoYmd(dateDisp)
                    if (!ymd) {
                        toast.error('Enter a valid paid date as month/day/year (mm/dd/yyyy).')
                        setDealSaving(false)
                        return
                    }
                    const tm = timeDisp.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
                    if (!tm) {
                        toast.error('Enter a valid time (use the time picker or hh:mm, 24-hour).')
                        setDealSaving(false)
                        return
                    }
                    const hh = Number(tm[1])
                    const min = Number(tm[2])
                    if (hh < 0 || hh > 23 || min < 0 || min > 59) {
                        toast.error('Enter a valid time (hours 0–23, minutes 0–59).')
                        setDealSaving(false)
                        return
                    }
                    const [Y, M, D] = ymd.split('-').map(Number)
                    paidAtIso = new Date(Y, M - 1, D, hh, min, 0, 0).toISOString()
                } else {
                    paidAtIso = new Date().toISOString()
                }
            }
            await updateIsoDealPayout(iso.id, {
                applicationId: dealEditing.applicationId,
                payoutStatus: dealEditForm.payoutStatus,
                scheduledPayDate,
                paidAt: paidAtIso,
            })
            await invalidateApplicationsListCache()
            toast.success('Commission payout updated.')
            setDealEditOpen(false)
            setDealEditing(null)
            await loadMyDeals()
        } catch {
            toast.error('Failed to save.')
        } finally {
            setDealSaving(false)
        }
    }

    const saveBanking = async () => {
        if (!iso) return
        if (!bankForm.bankAccountNo.trim() || !bankForm.routingNumber.trim()) {
            toast.error('Account number and routing number are required.')
            return
        }
        try {
            await dispatch(
                updateIso({
                    id: iso.id,
                    data: {
                        bankAccountNo: bankForm.bankAccountNo.trim(),
                        routingNumber: bankForm.routingNumber.trim(),
                    },
                }),
            ).unwrap()
            toast.success('Banking information saved.')
            setBankOpen(false)
            await dispatch(getIsos()).unwrap()
        } catch (e: unknown) {
            toast.error(typeof e === 'string' ? e : 'Failed to update banking info.')
        }
    }

    const uploadIsoPortalDocuments = async (
        files: FileList | null,
        category: IsoDocumentCategory,
    ) => {
        if (!iso?.id || !files?.length) return
        setIsoDocUploading(true)
        try {
            let base = [...iso.documents]
            if (category === 'w9') {
                base = base.filter((d) => !isW9PortalDoc(d))
            }
            let nextDocs = base
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const formData = new FormData()
                formData.append('file', file)
                const res = await axiosPostFormData('/uploads/single', formData)
                const d = res.data?.data as
                    | { url?: string; publicId?: string; originalName?: string }
                    | undefined
                if (!d?.url) {
                    toast.error(`Upload failed for "${file.name}".`)
                    continue
                }
                const uploadedAt = new Date().toISOString()
                const item: IsoDocumentItem = {
                    id: crypto.randomUUID(),
                    url: d.url,
                    originalName: String(d.originalName ?? file.name).slice(0, 500),
                    publicId: d.publicId ?? null,
                    uploadedAt,
                    category,
                }
                nextDocs = [...nextDocs, item]
            }
            await dispatch(
                updateIso({
                    id: iso.id,
                    data: { documents: nextDocs },
                }),
            ).unwrap()
            toast.success(files.length > 1 ? 'Documents uploaded.' : 'Document uploaded.')
            await dispatch(getIsos()).unwrap()
        } catch {
            toast.error('Could not save ISO documents.')
        } finally {
            setIsoDocUploading(false)
            if (supportingDocInputRef.current) supportingDocInputRef.current.value = ''
        }
    }

    const removeIsoPortalDocument = async (doc: IsoDocumentItem) => {
        if (!iso?.id) return
        setIsoDocRemovingId(doc.id)
        try {
            if (doc.publicId) {
                try {
                    await axiosDelete('/uploads', { data: { publicId: doc.publicId } })
                } catch {
                    /* still remove from ISO record */
                }
            }
            const nextDocs = iso.documents.filter((x) => x.id !== doc.id)
            await dispatch(
                updateIso({
                    id: iso.id,
                    data: { documents: nextDocs },
                }),
            ).unwrap()
            toast.success('Document removed.')
            await dispatch(getIsos()).unwrap()
        } catch {
            toast.error('Could not remove document.')
        } finally {
            setIsoDocRemovingId(null)
        }
    }

    const cardClass = `rounded-2xl border ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-white border-[#E2E8F0]'
        }`

    const bottomCardClass = cn(cardClass, 'shadow-sm')

    const selectTriggerClass = isDark
        ? 'h-9 min-w-[220px] border-[#374151] bg-transparent text-foreground hover:bg-[#374151]/20'
        : 'h-9 min-w-[220px] border-[var(--brand)]/40 bg-white text-foreground hover:bg-[var(--brand)]/5'

    if (isoListLoading && isos.length === 0) {
        return (
            <div className={`flex min-h-[240px] items-center justify-center gap-2 rounded-2xl border p-8 ${cardClass}`}>
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading ISO partners…</span>
            </div>
        )
    }

    if (!iso) {
        return (
            <div className={`rounded-2xl border p-8 text-center ${cardClass}`}>
                <p className="text-sm text-muted-foreground">
                    No ISO partners yet. Add one under ISO Management to use this portal.
                </p>
            </div>
        )
    }

    return (
        <div className="w-full space-y-6">
            <Dialog open={bankOpen} onOpenChange={setBankOpen}>
                <DialogContent className={isDark ? 'border-[#374151] bg-[#141517]' : ''}>
                    <DialogHeader>
                        <DialogTitle>Banking information</DialogTitle>
                        <DialogDescription>
                            Update ACH details for {iso.name}. This is stored on the ISO record.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="portal-bank-account">Account number</Label>
                            <Input
                                id="portal-bank-account"
                                value={bankForm.bankAccountNo}
                                onChange={(e) => setBankForm((f) => ({ ...f, bankAccountNo: e.target.value }))}
                                autoComplete="off"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="portal-bank-routing">Routing number</Label>
                            <Input
                                id="portal-bank-routing"
                                value={bankForm.routingNumber}
                                onChange={(e) => setBankForm((f) => ({ ...f, routingNumber: e.target.value }))}
                                autoComplete="off"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setBankOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="bg-[image:var(--brand-gradient)] text-white hover:bg-[image:var(--brand-gradient)]"
                            disabled={isoUpdateLoading}
                            onClick={() => void saveBanking()}
                        >
                            {isoUpdateLoading ? 'Saving…' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={dealEditOpen} onOpenChange={setDealEditOpen}>
                <DialogContent className={cn(isDark ? 'border-[#374151] bg-[#141517]' : '')}>
                    <DialogHeader>
                        <DialogTitle>Update commission payout</DialogTitle>
                        <DialogDescription>
                            {dealEditing ? (
                                <>
                                    <span className="font-medium text-foreground">{dealEditing.merchant}</span>
                                    <span className="text-muted-foreground"> · App #{dealEditing.applicationNumber}</span>
                                </>
                            ) : null}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Commission status</Label>
                            <Select
                                value={dealEditForm.payoutStatus}
                                onValueChange={(v: string) =>
                                    setDealEditForm((f) => ({ ...f, payoutStatus: v as CommissionPayoutStatus }))
                                }
                            >
                                <SelectTrigger className={cn('h-10', isDark ? 'border-[#374151]' : '')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                    <SelectItem value="clawbacks">Clawbacks</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2" lang="en-US">
                            <Label htmlFor="deal-sched-pay">Schedule Pay Date</Label>
                            <div className="relative">
                                <input
                                    ref={schedulePayDatePickerRef}
                                    type="date"
                                    className="sr-only"
                                    tabIndex={-1}
                                    aria-hidden
                                    onChange={(e) => {
                                        const v = e.target.value
                                        if (!v) return
                                        setDealEditForm((f) => ({
                                            ...f,
                                            plannedPayDateDisplay: isoYmdToUsDisplay(v),
                                        }))
                                    }}
                                />
                                <Input
                                    id="deal-sched-pay"
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="mm/dd/yyyy"
                                    autoComplete="off"
                                    className={cn('h-10 pr-10', isDark ? 'border-[#374151]' : '')}
                                    value={dealEditForm.plannedPayDateDisplay}
                                    onChange={(e) =>
                                        setDealEditForm((f) => ({
                                            ...f,
                                            plannedPayDateDisplay: e.target.value,
                                        }))
                                    }
                                />
                                <button
                                    type="button"
                                    className={cn(
                                        'absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors',
                                        'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40',
                                    )}
                                    aria-label="Open calendar"
                                    onClick={() => {
                                        const el = schedulePayDatePickerRef.current
                                        if (!el) return
                                        const ymd = usDisplayToIsoYmd(
                                            dealEditForm.plannedPayDateDisplay.trim(),
                                        )
                                        el.value = ymd ?? ''
                                        const picker = el as HTMLInputElement & {
                                            showPicker?: () => void
                                        }
                                        if (typeof picker.showPicker === 'function') {
                                            try {
                                                picker.showPicker()
                                            } catch {
                                                el.click()
                                            }
                                        } else {
                                            el.click()
                                        }
                                    }}
                                >
                                    <Calendar className="h-4 w-4" aria-hidden />
                                </button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Optional. Month/day/year (for example 04/10/2026). Use the calendar button to pick a
                                date.
                            </p>
                        </div>
                        {dealEditForm.payoutStatus === 'paid' ? (
                            <div className="space-y-2" lang="en-US">
                                <p className="text-sm font-medium text-foreground">Paid at</p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="deal-paid-at-date" className="text-muted-foreground">
                                            Date (month/day/year)
                                        </Label>
                                        <div className="relative">
                                            <input
                                                ref={paidAtDatePickerRef}
                                                type="date"
                                                className="sr-only"
                                                tabIndex={-1}
                                                aria-hidden
                                                onChange={(e) => {
                                                    const v = e.target.value
                                                    if (!v) return
                                                    setDealEditForm((f) => ({
                                                        ...f,
                                                        paidAtDateDisplay: isoYmdToUsDisplay(v),
                                                    }))
                                                }}
                                            />
                                            <Input
                                                id="deal-paid-at-date"
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="mm/dd/yyyy"
                                                autoComplete="off"
                                                className={cn('h-10 pr-10', isDark ? 'border-[#374151]' : '')}
                                                value={dealEditForm.paidAtDateDisplay}
                                                onChange={(e) =>
                                                    setDealEditForm((f) => ({
                                                        ...f,
                                                        paidAtDateDisplay: e.target.value,
                                                    }))
                                                }
                                            />
                                            <button
                                                type="button"
                                                className={cn(
                                                    'absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors',
                                                    'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40',
                                                )}
                                                aria-label="Open calendar"
                                                onClick={() => {
                                                    const el = paidAtDatePickerRef.current
                                                    if (!el) return
                                                    const ymd = usDisplayToIsoYmd(
                                                        dealEditForm.paidAtDateDisplay.trim(),
                                                    )
                                                    el.value = ymd ?? ''
                                                    const picker = el as HTMLInputElement & {
                                                        showPicker?: () => void
                                                    }
                                                    if (typeof picker.showPicker === 'function') {
                                                        try {
                                                            picker.showPicker()
                                                        } catch {
                                                            el.click()
                                                        }
                                                    } else {
                                                        el.click()
                                                    }
                                                }}
                                            >
                                                <Calendar className="h-4 w-4" aria-hidden />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="deal-paid-at-time" className="text-muted-foreground">
                                            Time
                                        </Label>
                                        <Input
                                            id="deal-paid-at-time"
                                            type="time"
                                            step={60}
                                            value={dealEditForm.paidAtTimeDisplay}
                                            onChange={(e) =>
                                                setDealEditForm((f) => ({
                                                    ...f,
                                                    paidAtTimeDisplay: e.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Leave date and time empty to record payment at the current moment when you save.
                                </p>
                            </div>
                        ) : null}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setDealEditOpen(false)} disabled={dealSaving}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="bg-[image:var(--brand-gradient)] text-white hover:bg-[image:var(--brand-gradient)]"
                            disabled={dealSaving}
                            onClick={() => void saveDealEdit()}
                        >
                            {dealSaving ? 'Saving…' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isoDocViewer != null} onOpenChange={(open: boolean) => !open && closeIsoDocViewer()}>
                <DialogContent
                    className={cn(
                        'flex max-h-[92vh] w-[min(100vw-2rem,56rem)] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl',
                        isDark ? 'border-[#374151] bg-[#141517]' : '',
                    )}
                >
                    <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 pr-14 text-left">
                        <DialogTitle className="truncate text-base leading-tight">
                            {isoDocViewer?.title ?? 'Document'}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            In-app preview of the uploaded document
                        </DialogDescription>
                    </DialogHeader>
                    <div className="relative min-h-[50vh] flex-1 bg-slate-100 p-2 dark:bg-black/50">
                        {isoDocPreviewLoading ? (
                            <div className="flex h-[min(75vh,720px)] w-full items-center justify-center rounded-md border border-dashed border-border bg-white dark:border-[#374151] dark:bg-neutral-950">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
                            </div>
                        ) : null}
                        {isoDocViewer?.blobUrl && isoDocViewer.mimeType ? (
                            isoDocViewer.mimeType === 'application/pdf' ? (
                                <div className="h-[min(75vh,720px)] w-full overflow-auto rounded-md border border-border bg-neutral-100 dark:border-[#374151] dark:bg-black/60">
                                    <IsoPortalPdfPages
                                        key={isoDocViewer.blobUrl}
                                        fileUrl={isoDocViewer.blobUrl}
                                        isDark={isDark}
                                    />
                                </div>
                            ) : isoDocViewer.mimeType.startsWith('image/') ? (
                                <div className="flex h-[min(75vh,720px)] w-full items-start justify-center overflow-auto rounded-md border border-border bg-neutral-100 p-2 dark:border-[#374151] dark:bg-black/60">
                                    <img
                                        src={isoDocViewer.blobUrl}
                                        alt=""
                                        className="max-h-full max-w-full object-contain"
                                    />
                                </div>
                            ) : (
                                <iframe
                                    key={isoDocViewer.blobUrl}
                                    title={isoDocViewer.title}
                                    src={isoDocViewer.blobUrl}
                                    className="h-[min(75vh,720px)] w-full rounded-md border border-border bg-white dark:border-[#374151] dark:bg-neutral-950"
                                />
                            )
                        ) : null}
                    </div>
                    <p className="border-t border-border bg-muted/50 px-3 py-2 text-center text-[10px] text-muted-foreground dark:bg-black/30">
                        Preview is fetched through the app with inline display so the browser does not force a download.
                    </p>
                </DialogContent>
            </Dialog>

            <div
                className={`relative overflow-hidden rounded-3xl border p-6 shadow-sm ${isDark ? 'border-[#2D3B4F]' : 'border-[#E2ECF4]'
                    }`}
            >
                <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground">COMMISSION PORTAL</p>
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">ISO Portal</h2>
                    <p className="text-sm text-muted-foreground">
                        Self-service view for the selected ISO: commission stats, linked deals, payout status (paid vs pending),
                        planned pay dates, and supporting documents. Updates here sync with internal commission tracking and ISO
                        payout records.
                    </p>
                </div>
            </div>

            <div className={`p-6 ${cardClass} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
                <div className="flex min-w-0 flex-1 items-center gap-4">
                    <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white shadow-sm ${isDark ? 'bg-[image:var(--brand-gradient)] shadow-[var(--brand)]/25' : 'bg-[image:var(--brand-gradient)]'
                            }`}
                    >
                        {iso.initials}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Welcome, {iso.name.split(' ')[0]}</h2>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{iso.company}</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className={tierPillClass(iso.tier, isDark)}>{iso.tier}</span>
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">View as ISO</span>
                        <Select value={String(iso.id)} onValueChange={(v: string) => setSelectedId(v)}>
                            <SelectTrigger className={selectTriggerClass}>
                                <SelectValue placeholder="Select ISO" />
                            </SelectTrigger>
                            <SelectContent align="end" enableSearch className="min-w-[var(--radix-select-trigger-width)]">
                                {isos.map((b) => (
                                    <SelectItem key={b.id} value={String(b.id)}>
                                        <span className="font-medium">{b.name}</span>
                                        <span className="text-muted-foreground"> · {b.company}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                {[
                    {
                        label: 'TOTAL COMMISSION',
                        val: stats.totalEarned,
                        sub: debouncedDealsSearch ? 'Matching Search' : 'All Linked Deals',
                        icon: <TrendingUp className="text-emerald-500" />,
                        accent: 'text-emerald-500',
                    },
                    {
                        label: 'PAID OUT',
                        val: stats.totalPaid,
                        sub: debouncedDealsSearch ? 'Matching Search' : 'Marked Paid',
                        icon: <CheckCircle2 className="text-green-500" />,
                        accent: 'text-green-600 dark:text-green-400',
                    },
                    {
                        label: 'PENDING PAYOUT',
                        val: stats.pending,
                        sub: debouncedDealsSearch ? 'Matching Search' : 'Not Yet Paid',
                        icon: <Clock className="text-[var(--brand)]" />,
                        accent: 'text-[var(--brand)]',
                    },
                    {
                        label: 'MY RATE',
                        val: `${iso.commissionPercentage}%`,
                        sub: tierSubtitle(iso.tier), 
                        icon: <Percent className="text-violet-500" />,
                        accent: 'text-violet-500',
                    },
                ].map((card, i) => (
                    <div key={i} className={`p-5 ${cardClass}`}>
                        <div className="mb-4 flex items-start justify-between">
                            <span className="text-[13px] font-bold tracking-widest text-muted-foreground uppercase">{card.label}</span>
                            {card.icon}
                        </div>
                        <div className="space-y-1">
                            <p className="text-3xl font-bold text-foreground">{card.val}</p>
                            <p className={`text-xs font-medium ${card.accent}`}>{card.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div
                className={cn(
                    'mt-5 overflow-hidden rounded-[5px] border shadow-[0px_4px_20px_0px_#00000005]',
                    isDark ? 'bg-[#141517] border-[#374151]' : 'bg-card border-[#FDFDFD]',
                )}
            >
                <div
                    className={cn(
                        'flex flex-col gap-4 border-b px-4 py-3 md:px-5',
                        isDark ? 'border-[#374151] bg-[#2A2B2F]' : 'border-[#ECEFF5] bg-[#F9FAFD]',
                    )}
                >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <h3 className="shrink-0 text-[1rem] font-semibold uppercase tracking-wide text-foreground">
                            My deals (
                            {dealsTotal}
                            {debouncedDealsSearch ? ` of ${dealsLinkedCount}` : ''})
                        </h3>
                        <div className="relative w-full min-w-0 lg:max-w-sm">
                            <Search
                                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden
                            />
                            <Input
                                type="search"
                                placeholder="Search merchant, app #, payout or request status…"
                                value={dealsSearchInput}
                                onChange={(e) => setDealsSearchInput(e.target.value)}
                                className={cn(
                                    'h-9 border-[#E5E7EB] bg-white pl-9 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[var(--brand)]/25',
                                    isDark ? 'border-[#374151] bg-transparent text-foreground placeholder:text-muted-foreground' : '',
                                )}
                                aria-label="Search deals"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left">
                        <thead>
                            <tr
                                className={cn(
                                    'border-b text-[10px] font-semibold uppercase tracking-[0.08em]',
                                    isDark
                                        ? 'border-[#374151] bg-[#1f2024] text-slate-300'
                                        : 'border-[#ECEFF5] bg-white text-[#111827]',
                                )}
                            >
                                <th className="px-5 py-3 font-semibold">Deal ID</th>
                                <th className="px-5 py-3 font-semibold">Business name</th>
                                <th className="px-5 py-3 font-semibold">Funded amount</th>
                                <th className="px-5 py-3 font-semibold">Commission</th>
                                <th className="px-5 py-3 font-semibold">Current state</th>
                                <th className="px-5 py-3 font-semibold">Pay date</th>
                                <th className="px-5 py-3 text-left font-semibold">View</th>
                            </tr>
                        </thead>
                        <tbody className={cn(isDark ? 'divide-y divide-[#2b2d33]' : '')}>
                            {dealsLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-left text-muted-foreground">
                                        <span className="inline-flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Loading deals…
                                        </span>
                                    </td>
                                </tr>
                            ) : dealsLinkedCount === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-10 text-left text-sm text-muted-foreground">
                                        No applications linked to this ISO yet.
                                    </td>
                                </tr>
                            ) : dealsTotal === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                                        No deals match your search.
                                    </td>
                                </tr>
                            ) : (
                                myDeals.map((row) => (
                                    <tr
                                        key={row.applicationId}
                                        className={cn(
                                            'border-b transition-colors',
                                            isDark
                                                ? 'border-[#2b2d33] hover:bg-slate-800/30'
                                                : 'border-[#F1F5F9] hover:bg-[#FCFDFE]',
                                        )}
                                    >
                                        <td className="px-5 py-3">
                                            <button
                                                type="button"
                                                className="text-sm font-semibold text-[#0c2461] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 focus-visible:ring-offset-2 dark:text-sky-400"
                                            >
                                                {getIsoDealIdDisplay(row)}
                                            </button>
                                        </td>
                                        <td className="px-5 py-3 text-[13px] font-medium text-foreground">{row.merchant}</td>
                                        <td className="px-5 py-3 text-[13px] font-medium text-foreground">
                                            {row.offerApprovedAmount != null
                                                ? formatCurrency(row.offerApprovedAmount, { fallback: '—' })
                                                : '—'}
                                        </td>
                                        <td className="px-5 py-3 text-[13px] font-semibold text-[#0F766E] dark:text-emerald-400">
                                            {formatCurrency(row.commissionAmount, { fallback: '$0' })}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col gap-1">
                                                <span
                                                    className={`w-fit rounded px-2.5 py-1 text-[12px] font-bold tracking-wide  ${commissionPayoutBadgeClass(row.payoutStatus, isDark)}`}
                                                >
                                                    {commissionPayoutStatusLabel(row.payoutStatus)}
                                                </span>
                                                {row.commissionRequestStatus ? (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        Request: {row.commissionRequestStatus}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-[13px] text-muted-foreground">{payDateDisplay(row)}</td>
                                        <td className="px-5 py-3 text-left">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className={cn(
                                                    'h-7 rounded-full cursor-pointer border px-2 text-[11px] font-semibold',
                                                    isDark
                                                        ? 'border-[#4b5563] text-slate-200 hover:bg-slate-800'
                                                        : 'border-[#BFDBFE] text-[var(--brand)] hover:bg-[#EFF6FF]',
                                                )}
                                                onClick={() => openDealEdit(row)}
                                            >
                                                <PencilIcon className="h-3.5 w-3.5" aria-hidden />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {!dealsLoading && dealsTotal > 0 ? (
                    <div
                        className={cn(
                            'flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between',
                            isDark ? 'border-[#374151] bg-[#1f2024]' : 'border-[#ECEFF5] bg-[#F8FAFC]',
                        )}
                    >
                        <div className="flex flex-wrap items-center gap-3">
                            <p className="text-xs text-muted-foreground">
                                Showing {dealsPageStart}–{dealsPageEnd} of {dealsTotal}
                            </p>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Rows
                                </span>
                                <Select
                                    value={String(dealsPageSize)}
                                    onValueChange={(v: string) => {
                                        setDealsPageSize(Number(v))
                                        setDealsPage(1)
                                    }}
                                >
                                    <SelectTrigger
                                        className={cn('h-8 w-[72px] text-xs', isDark ? 'border-[#374151]' : '')}
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[10, 25, 50].map((n) => (
                                            <SelectItem key={n} value={String(n)}>
                                                {n}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                disabled={dealsPage <= 1}
                                onClick={() => setDealsPage((p) => Math.max(1, p - 1))}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                            </Button>
                            <span className="min-w-[5.5rem] text-center text-xs tabular-nums text-muted-foreground">
                                Page {dealsTotalPages > 0 ? dealsPage : 0} of {Math.max(dealsTotalPages, 1)}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                disabled={dealsTotalPages === 0 || dealsPage >= dealsTotalPages}
                                onClick={() =>
                                    setDealsPage((p) =>
                                        dealsTotalPages > 0 ? Math.min(dealsTotalPages, p + 1) : p,
                                    )
                                }
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="w-full  gap-5 lg:grid-cols-2 shadow-lg">
                <div className={`p-6 ${bottomCardClass}`}>



                    <div>
                        <input
                            id="portal-iso-supporting-docs"
                            ref={supportingDocInputRef}
                            type="file"
                            className="sr-only"
                            multiple
                            onChange={(e) => {
                                void uploadIsoPortalDocuments(e.target.files, 'supporting')
                            }}
                        />
                        <p className="text-md font-semibold text-foreground">Supporting documents</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Optional extras—contracts, correspondence, or other files.
                        </p>
                        <button
                            type="button"
                            disabled={isoDocUploading || isoUpdateLoading}
                            onClick={() => supportingDocInputRef.current?.click()}
                            onDragOver={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                            }}
                            onDrop={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (isoDocUploading || isoUpdateLoading) return
                                const files = e.dataTransfer.files
                                if (files?.length) void uploadIsoPortalDocuments(files, 'supporting')
                            }}
                            className={cn(
                                'mt-4 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 focus-visible:ring-offset-2',
                                isDark
                                    ? 'border-[#374151] bg-black/20 hover:border-[var(--brand)]/45 hover:bg-[var(--brand)]/[0.06]'
                                    : 'border-[var(--brand)]/25 bg-[var(--brand)]/[0.04] hover:border-[var(--brand)]/45 hover:bg-[var(--brand)]/[0.07]',
                                (isoDocUploading || isoUpdateLoading) && 'pointer-events-none opacity-60',
                            )}
                        >
                            <div
                                className={cn(
                                    'flex h-12 w-12 items-center justify-center rounded-full',
                                    isDark ? 'bg-[var(--brand)]/20 text-[#C07BE0]' : 'bg-[var(--brand)]/15 text-[var(--brand)]',
                                )}
                            >
                                {isoDocUploading ? (
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                ) : (
                                    <Upload className="h-6 w-6" />
                                )}
                            </div>
                            <span className="mt-3 text-sm font-semibold text-foreground">
                                {isoDocUploading ? 'Uploading…' : 'Drop files here or click to browse'}
                            </span>
                            <span className="mt-1 max-w-sm text-xs text-muted-foreground">
                                Multiple files supported · same types as W-9
                            </span>
                            <span
                                className={cn(
                                    'mt-4 inline-flex items-center rounded-lg px-4 py-2 text-[11px] font-bold uppercase tracking-wide',
                                    isDark
                                        ? 'bg-[var(--brand)]/25 text-[#93C5E8]'
                                        : 'bg-[image:var(--brand-gradient)] text-white shadow-sm shadow-[var(--brand)]/20',
                                )}
                            >
                                Choose files
                            </span>
                        </button>

                        {supportingDocuments.length === 0 ? (
                            <p className="mt-4 text-center text-xs text-muted-foreground">No supporting files uploaded yet.</p>
                        ) : (
                            <ul className="mt-4 space-y-2">
                                {supportingDocuments.map((doc) => (
                                    <li
                                        key={doc.id}
                                        className={cn(
                                            'flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                                            isDark
                                                ? 'border-[#374151] bg-black/25 hover:border-[var(--brand)]/30'
                                                : 'border-[#E2E8F0] bg-white hover:border-[var(--brand)]/25',
                                        )}
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <span
                                                className={cn(
                                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                                    isDark ? 'bg-[var(--brand)]/15 text-[#C07BE0]' : 'bg-[var(--brand)]/10 text-[var(--brand)]',
                                                )}
                                            >
                                                <FileText className="h-4 w-4" />
                                            </span>
                                            <span className="truncate font-medium text-foreground">{doc.originalName}</span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 gap-1 px-2 text-[11px]"
                                                onClick={() => void openIsoDocViewer(doc)}
                                            >
                                                <EyeIcon className="h-3.5 w-3.5" aria-hidden />
                                                View
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 gap-1 px-2 text-[11px] text-destructive hover:text-destructive"
                                                disabled={isoDocRemovingId === doc.id}
                                                onClick={() => void removeIsoPortalDocument(doc)}
                                            >
                                                {isoDocRemovingId === doc.id ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                )}
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

            </div>
        </div>
    )
}
