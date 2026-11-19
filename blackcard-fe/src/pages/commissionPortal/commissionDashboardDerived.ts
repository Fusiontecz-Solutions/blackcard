import {
    type DealRow,
    getCommissionForApplication,
    mapApplicationToHistoryRow,
} from './commissionHistoryShared'

export type CommissionTrendPoint = {
    name: string
    value: number
    paid: number
    pending: number
    clawback: number
}

export type CommissionPortalRecentRow = {
    id: string | number
    date: string
    agentName: string
    dealName: string
    applicationId: number | null
    fundedAmount: number
    commissionAmount: number
    commissionStatus: string
    commissionReason: string
    commissionId: string | null
}

function ymdKeyLocal(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function addRowToTrendPoint(
    pt: { name: string; value: number; paid: number; pending: number; clawback: number },
    row: DealRow,
) {
    const net = row.net
    if (row.status === 'PAID') {
        pt.paid += net
    } else if (row.status === 'APPROVED' || row.status === 'PENDING') {
        pt.pending += net
    } else if (row.status === 'CLAWBACK') {
        pt.clawback += net
    }
    pt.value += net
}

function monthWeekIndex(dayOfMonth: number): number {
    if (dayOfMonth >= 22) return 3
    if (dayOfMonth >= 15) return 2
    if (dayOfMonth >= 8) return 1
    return 0
}

/**
 * Bucket commission amounts for the **current calendar period**: every day of the current month,
 * four week segments within that month (weekly), or all twelve months of the current year (yearly).
 */
export function buildCommissionTrendFromDealRows(
    rows: DealRow[],
    view: 'monthly' | 'weekly' | 'yearly',
): CommissionTrendPoint[] {
    const v = String(view || 'monthly').toLowerCase()
    const now = new Date()
    const y = now.getFullYear()
    const mo = now.getMonth()
    const lastDayOfMonth = new Date(y, mo + 1, 0).getDate()

    const periodData: Record<string, CommissionTrendPoint> = {}

    const addBucket = (key: string, name: string) => {
        if (!periodData[key]) {
            periodData[key] = { name, value: 0, paid: 0, pending: 0, clawback: 0 }
        }
    }

    if (v === 'monthly') {
        const d = new Date(y, mo, 1, 0, 0, 0, 0)
        while (d.getMonth() === mo) {
            const key = ymdKeyLocal(d)
            addBucket(key, String(d.getDate()))
            d.setDate(d.getDate() + 1)
        }
    } else if (v === 'yearly') {
        for (let m = 0; m < 12; m += 1) {
            const key = `${y}-${String(m + 1).padStart(2, '0')}`
            const label = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short' })
            addBucket(key, label)
        }
    } else {
        const ranges: [number, number][] = [
            [1, 7],
            [8, 14],
            [15, 21],
            [22, lastDayOfMonth],
        ]
        for (let i = 0; i < 4; i += 1) {
            const [a, bRaw] = ranges[i]
            const b = Math.min(bRaw, lastDayOfMonth)
            const key = `${y}-${String(mo + 1).padStart(2, '0')}-w${i}`
            if (a > lastDayOfMonth) {
                addBucket(key, `Wk ${i + 1}`)
                continue
            }
            const end = Math.max(a, Math.min(b, lastDayOfMonth))
            const label = a === end ? `${a}` : `${a}–${end}`
            addBucket(key, label)
        }
    }

    for (const row of rows) {
        const c = new Date(row.activityAtMs)
        if (!row.activityAtMs || Number.isNaN(c.getTime())) continue

        let periodKey = ''
        if (v === 'monthly') {
            if (c.getFullYear() !== y || c.getMonth() !== mo) continue
            periodKey = ymdKeyLocal(c)
        } else if (v === 'yearly') {
            if (c.getFullYear() !== y) continue
            periodKey = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`
        } else {
            if (c.getFullYear() !== y || c.getMonth() !== mo) continue
            const dom = c.getDate()
            periodKey = `${y}-${String(mo + 1).padStart(2, '0')}-w${monthWeekIndex(dom)}`
        }

        if (!periodData[periodKey]) continue
        addRowToTrendPoint(periodData[periodKey], row)
    }

    return Object.keys(periodData)
        .sort()
        .map((k) => periodData[k])
}

export function buildTopIsosFromDealRows(rows: DealRow[], limit: number) {
    const isoMap = new Map<string, { name: string; amount: number; deals: number }>()
    for (const r of rows) {
        if (r.funded <= 0) continue
        const raw = r.iso.trim()
        const name =
            raw && raw !== '—' && raw !== '–' && raw !== '\u2014' && raw !== '\u2013' ? raw : null
        if (!name) continue
        const amt = r.funded
        const cur = isoMap.get(name)
        if (cur) {
            cur.amount += amt
            cur.deals += 1
        } else {
            isoMap.set(name, { name, amount: amt, deals: 1 })
        }
    }
    return Array.from(isoMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit)
}

export function buildRecentActivityFromApplications(
    applications: unknown[],
    commissionLookup: Map<string, Record<string, unknown> | null>,
    limit: number,
): CommissionPortalRecentRow[] {
    const enriched = applications.map((app, idx) => {
        const commission = getCommissionForApplication(app, commissionLookup) ?? null
        const row = mapApplicationToHistoryRow(app, idx, commission)
        const r = app as Record<string, unknown>
        return { app: r, row, commission }
    })
    enriched.sort((a, b) => b.row.activityAtMs - a.row.activityAtMs)
    return enriched.slice(0, limit).map((e, idx) => {
        const { app, row, commission } = e
        const agent = app.agent as Record<string, unknown> | undefined
        const act = new Date(row.activityAtMs)
        const date =
            row.activityAtMs && !Number.isNaN(act.getTime()) ? act.toLocaleDateString('en-US') : '—'
        const agentName =
            [agent?.firstName, agent?.lastName].filter(Boolean).join(' ').trim() ||
            String(agent?.email || '—')
        const crStatus = commission?.status != null ? String(commission.status) : 'Not Requested'
        const commissionReason =
            crStatus === 'Rejected' ? String(commission?.reason || '—') : '—'
        const commissionId =
            commission?.id != null ? String(commission.id) : commission?._id != null ? String(commission._id) : null
        const appIdRaw = app.applicationId
        const applicationId =
            appIdRaw != null && appIdRaw !== ''
                ? typeof appIdRaw === 'number'
                    ? appIdRaw
                    : Number(appIdRaw)
                : null
        const safeAppId = applicationId != null && Number.isFinite(applicationId) ? applicationId : null

        const rawId = app.id ?? app._id ?? idx
        const id: string | number =
            typeof rawId === 'string' || typeof rawId === 'number' ? rawId : String(rawId)

        return {
            id,
            date,
            agentName,
            dealName: row.merchant,
            applicationId: safeAppId,
            fundedAmount: row.funded,
            commissionAmount: row.net,
            commissionStatus: crStatus,
            commissionReason,
            commissionId,
        }
    })
}
