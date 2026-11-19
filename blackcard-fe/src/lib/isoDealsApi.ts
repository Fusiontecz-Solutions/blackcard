import { axiosGet, axiosPut } from '@/redux/axios'

export type IsoMyDealRow = {
    applicationId: string
    dealId: string | null
    applicationNumber: number
    merchant: string
    offerApprovedAmount: number | null
    commissionAmount: number
    commissionRequestStatus: string | null
    payoutStatus: 'paid' | 'pending' | 'clawbacks'
    scheduledPayDate: string | null
    paidAt: string | null
}

export type IsoMyDealsSummary = {
    totalEarned: number
    totalPaid: number
    pendingPayout: number
}

export type IsoMyDealsResponse = {
    deals: IsoMyDealRow[]
    total: number
    page: number
    limit: number
    totalPages: number
    linkedApplicationCount: number
    summary: IsoMyDealsSummary
}

export async function fetchIsoMyDeals(
    isoId: string,
    params?: { search?: string; page?: number; limit?: number },
): Promise<IsoMyDealsResponse> {
    const search = params?.search?.trim() ?? ''
    const page = params?.page ?? 1
    const limit = params?.limit ?? 10
    const res = await axiosGet(`/iso/${isoId}/my-deals`, {
        params: {
            ...(search ? { search } : {}),
            page,
            limit,
        },
    })
    const body = res.data as {
        success?: boolean
        data?: {
            deals?: IsoMyDealRow[]
            total?: number
            page?: number
            limit?: number
            totalPages?: number
            linkedApplicationCount?: number
            summary?: Partial<IsoMyDealsSummary>
        }
    }
    const d = body?.data
    const deals = Array.isArray(d?.deals) ? d.deals : []
    const summary = d?.summary ?? {}
    return {
        deals,
        total: typeof d?.total === 'number' ? d.total : deals.length,
        page: typeof d?.page === 'number' ? d.page : page,
        limit: typeof d?.limit === 'number' ? d.limit : limit,
        totalPages: typeof d?.totalPages === 'number' ? d.totalPages : 0,
        linkedApplicationCount: typeof d?.linkedApplicationCount === 'number' ? d.linkedApplicationCount : deals.length,
        summary: {
            totalEarned: typeof summary.totalEarned === 'number' ? summary.totalEarned : 0,
            totalPaid: typeof summary.totalPaid === 'number' ? summary.totalPaid : 0,
            pendingPayout: typeof summary.pendingPayout === 'number' ? summary.pendingPayout : 0,
        },
    }
}

export async function updateIsoDealPayout(
    isoId: string,
    payload: {
        applicationId: string
        payoutStatus: 'paid' | 'pending' | 'clawbacks'
        scheduledPayDate: string | null
        paidAt: string | null
    },
): Promise<void> {
    await axiosPut(`/iso/${isoId}/application-payout-status`, payload)
}
