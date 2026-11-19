import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '@/redux/store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getApplications, getApplicationsByIsoId } from '@/redux/actions/applicationActions'
import { clearIsoApplications } from '@/redux/slices/applicationSlice'

type Props = {
  isDark: boolean
}

type IsoCommissionRow = {
  id: string | number
  iso: string
  deal: string
  applicationId: string | number | null
  fundedAmount: number
  commissionAmount: number
  date: string
  status: string
}

function getIsoNameFromApplication(app: unknown): string {
  const r = app as Record<string, unknown>
  const iso = r?.iso as Record<string, unknown> | undefined
  return String(
    (iso?.name as string | undefined) ??
      (r?.isoName as string | undefined) ??
      '—',
  )
}

function mapApplicationToCommissionRow(
  app: any,
  isoLabel: string,
  rowKeyPrefix: string,
  index: number,
): IsoCommissionRow {
  const offerDecision = app?.OfferDecision?.offer || {}
  const latestTermsOffer = Array.isArray(app?.termsOffers) ? app.termsOffers[0] : null

  const fundedAmount = Number(
    latestTermsOffer?.approvedAmount ??
    offerDecision?.approvedAmount ??
    app?.loanAmount ??
    0,
  )

  const commissionAmount = Number(
    offerDecision?.commissionAmount ??
    offerDecision?.commission ??
    app?.commissionAmount ??
    0,
  )

  const appId = app?.applicationId ?? app?.id ?? app?._id
  const rowIdRaw = app?.id ?? app?._id ?? app?.applicationId
  const rowId: string | number =
    typeof rowIdRaw === 'string' || typeof rowIdRaw === 'number'
      ? rowIdRaw
      : `${rowKeyPrefix}-${index}`

  return {
    id: rowId,
    iso: isoLabel,
    deal:
      app?.client?.business?.name ||
      app?.client?.businessName ||
      `Application #${app?.applicationId ?? app?.id ?? '—'}`,
    applicationId: appId != null ? (appId as string | number) : null,
    fundedAmount,
    commissionAmount,
    date: formatDate(app?.createdAt, '—'),
    status: String(app?.currentState || app?.status || '—'),
  }
}

export default function IsoCommissionDashboard({ isDark }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const isos = useSelector((state: RootState) => state.iso.list || [])
  const allApplications = useSelector((state: RootState) => state.applications.data || [])
  const allApplicationsLoading = useSelector(
    (state: RootState) => state.applications.loading || state.applications.isRefreshing,
  )
  const allApplicationsError = useSelector((state: RootState) => state.applications.error)

  const isoApplications = useSelector((state: RootState) => state.isoApplications.data || [])
  const isoApplicationsLoading = useSelector((state: RootState) => state.isoApplications.loading)
  const isoApplicationsError = useSelector((state: RootState) => state.isoApplications.error)

  const [selectedIsoId, setSelectedIsoId] = useState<string>('all')

  useEffect(() => {
    if (selectedIsoId === 'all') {
      dispatch(clearIsoApplications())
      dispatch(
        getApplications({
          page: 1,
          limit: 1000,
        }),
      )
      return
    }
    dispatch(getApplicationsByIsoId(selectedIsoId))
  }, [dispatch, selectedIsoId])

  const isoAgentOptions = useMemo(
    () =>
      (isos as { id?: string; _id?: string; name?: string }[])
        .map((iso) => {
          const isoId = iso.id ?? iso._id
          if (!isoId) return null
          return {
            id: String(isoId),
            name: String(iso.name || 'Unnamed ISO'),
          }
        })
        .filter((x): x is { id: string; name: string } => x !== null),
    [isos],
  )

  const sourceApplications = useMemo(
    () => (selectedIsoId === 'all' ? allApplications : isoApplications) as any[],
    [selectedIsoId, allApplications, isoApplications],
  )

  const listLoading =
    selectedIsoId === 'all' ? allApplicationsLoading : isoApplicationsLoading
  const listError =
    selectedIsoId === 'all' ? allApplicationsError : isoApplicationsError

  const selectedIsoName =
    isoAgentOptions.find((x) => x.id === selectedIsoId)?.name || '—'

  const isoCommissionRows = useMemo<IsoCommissionRow[]>(() => {
    return sourceApplications.map((app, index) =>
      mapApplicationToCommissionRow(
        app,
        selectedIsoId === 'all' ? getIsoNameFromApplication(app) : selectedIsoName,
        selectedIsoId,
        index,
      ),
    )
  }, [sourceApplications, selectedIsoId, selectedIsoName])

  const isoCommissionTotal = useMemo(
    () =>
      isoCommissionRows.reduce(
        (sum, row) => sum + Number(row.commissionAmount || 0),
        0,
      ),
    [isoCommissionRows],
  )

  const showTableLoader = listLoading && sourceApplications.length === 0

  return (
    <div className="space-y-5">
      <div
        className={`rounded-2xl border p-5 ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-white border-[#FDFDFD]'
          }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">
              ISO Commission Dashboard
            </h3>
            <p className="text-sm text-muted-foreground">
              Commission per deal across all ISOs, or filter to one ISO. Data loads from live applications.
            </p>
          </div>
          <div className="flex flex-col gap-2 min-w-[260px]">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Filter ISO
            </span>
            <select
              value={selectedIsoId}
              onChange={(e) => setSelectedIsoId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All ISOs</option>
              {isoAgentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div
        className={`rounded-2xl border overflow-hidden ${isDark ? 'bg-[#141517] border-[#374151]' : 'bg-white border-[#FDFDFD]'
          }`}
      >
        <div
          className={`p-4 border-b flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${isDark ? 'border-[#374151]' : 'border-[#E2E8F0]'
            }`}
        >
          <p className="text-sm font-semibold text-foreground">
            Deals: {isoCommissionRows.length}
            {listLoading && sourceApplications.length > 0 ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(updating…)</span>
            ) : null}
          </p>
          <p className="text-sm font-bold text-emerald-500">
            Total Commission: {formatCurrency(isoCommissionTotal)}
          </p>
        </div>
        {listError ? (
          <div
            className={`px-4 py-3 text-sm text-destructive ${isDark ? 'bg-destructive/10' : 'bg-destructive/5'
              }`}
          >
            {listError}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr
                className={`border-b text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ${isDark ? 'border-[#374151]' : 'border-[#E2E8F0]'
                  }`}
              >
                <th className="px-4 py-3">ISO</th>
                <th className="px-4 py-3">Deal</th>
                <th className="px-4 py-3">Application</th>
                <th className="px-4 py-3">Funded</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${isDark ? 'divide-slate-800/50' : 'divide-slate-100'
                }`}
            >
              {showTableLoader ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-left text-muted-foreground">
                    Loading deals…
                  </td>
                </tr>
              ) : isoCommissionRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-left text-muted-foreground">
                    {selectedIsoId === 'all'
                      ? 'No deals found.'
                      : 'No commission deals found for selected ISO.'}
                  </td>
                </tr>
              ) : (
                isoCommissionRows.map((row) => (
                  <tr key={`iso-commission-${row.id}-${row.applicationId ?? ''}-${row.deal}`}>
                    <td className="px-4 py-3 font-medium text-foreground">{row.iso}</td>
                    <td className="px-4 py-3 text-foreground">{row.deal}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.applicationId ?? '—'}</td>
                    <td className="px-4 py-3 text-sky-600 dark:text-sky-400">
                      {formatCurrency(row.fundedAmount)}
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-500">
                      {formatCurrency(row.commissionAmount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.status}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
