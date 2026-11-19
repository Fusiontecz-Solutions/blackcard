import { useEffect, useMemo, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import type { AppDispatch, RootState } from "@/redux/store"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { Application } from "@/types/applicationTypes"
import type { Client } from "@/types/clientTypes"
import ApplicationSheetDudep from "./ApplicationSheetDudep"
import { useResizableSheetWidth } from "./useResizableSheetWidth"
import ApplicationSheetActivityLog from "./ApplicationSheetActivityLog"
import ApplicationSheetMailLog from "./ApplicationSheetMailLog"
import ContractTab from "./ContractTab"
import { Final } from "@/pages/case/Final"
import { FundingCall } from "@/pages/case/FundingCall"
import { Disbursement } from "@/pages/case/Disbursment"
import ApplicationSummary from "./ApplicationSummary"
import UploadedDocuments from "./UploadedDocuments"
import BankAnalysisTable from "./BankAnalysisTable"
import PositionTableCalculator from "./PositionTableCalculator"
import { ApplicationAdditionalInfo } from "./AdditionalInfoSection"
import { getPositions } from "@/redux/actions/positionActions"
import { canRoleEditDecisionMakingTab } from "@/lib/decisionMakingAccess"
import { resolveEffectiveRole } from "@/lib/sessionRole"

import { formatCurrency, formatDate as formatDateUtil } from "@/lib/utils"
import { useTheme } from "@/context/ThemeContext"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Briefcase,
  Building2,
  FileText,
  AlertCircle
} from "lucide-react"
import { getClientByClientId } from "@/redux/actions/clientActions"
import { getApplicationByApplicationId } from "@/redux/actions/applicationActions"

type ApplicationDetailsSheetProps = {
  application: Application | null
  open: boolean
  onOpenChange: (open: boolean) => void
}



function getClientNameFromApplication(client: Application["client"]): string {
  if (!client) return "-"
  if (typeof client === "string") return client
  if (client.business?.name) return client.business.name
  if (client.owner?.firstName || client.owner?.lastName) {
    return `${client.owner.firstName || ""} ${client.owner.lastName || ""}`.trim()
  }
  return client.owner?.email || client.business?.email || "-"
}

function formatMaybeDate(value: unknown): string {
  if (!value || typeof value !== "string") return "-"
  return formatDateUtil(value, "-")
}

function toISODateOrEmpty(input: unknown): string {
  if (typeof input === "string") {
    if (input.length >= 10) return input.slice(0, 10)
    return input
  }
  if (!input) return ""
  const d = new Date(input as string | number | Date)
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

function mapPositionsForCalculator(positions: Array<Record<string, unknown>>) {
  return positions.map((p) => {
    const fundingDateIso = toISODateOrEmpty(p.fundingDate)
    const closeDateIso = toISODateOrEmpty(p.closeDate)

    return {
      _id: p._id,
      lender: p.funder ?? "",
      frequency: p.frequency ?? "",
      installment: p.ach != null ? String(p.ach) : "",
      status: p.status ?? (p.activeStatus ? "ACTIVE" : "SELECT"),
      startingDate: fundingDateIso,
      amountFunded: p.fundedAmount != null ? String(p.fundedAmount) : "",
      loanAmount: p.loanAmount != null ? String(p.loanAmount) : "",
      totalRepayments: p.paybackAmount != null ? String(p.paybackAmount) : "",
      paymentTerm: p.paymentTerm != null ? String(p.paymentTerm) : "",
      mcaEstBalance: p.mcaEstBalance != null ? String(p.mcaEstBalance) : "",
      mcaPercentPaid: p.mcaPercentPaid != null ? String(p.mcaPercentPaid) : "",
      pmtsLeft: p.pmtsLeft != null ? String(p.pmtsLeft) : "",
      estEndDate: closeDateIso,
      lastPaymentDate: toISODateOrEmpty(p.lastPaymentDate),
      mcaRemit:
        p.mcaRemit != null || p.percentOfGross != null
          ? String(p.mcaRemit ?? p.percentOfGross ?? "")
          : "",
      monthlyMcaPmts: p.monthlyMcaPmts != null ? String(p.monthlyMcaPmts) : "",
      carryForward: p.carryForward != null ? String(p.carryForward) : "",
      allocatedBankAnalysisId:
        Number.isInteger(p.allocatedBankAnalysisId) &&
        Number(p.allocatedBankAnalysisId) > 0
          ? Number(p.allocatedBankAnalysisId)
          : undefined,
      isLocked: true,
    }
  })
}

const TABS = [
  { id: "details", label: "Submission Details", icon: <FileText className="w-4 h-4" /> },
  { id: "contract", label: "Contracts", icon: <FileText className="w-4 h-4" /> },
  { id: "final", label: "Final", icon: <Briefcase className="w-4 h-4" /> },
  { id: "funding", label: "Funding", icon: <Briefcase className="w-4 h-4" /> },
  { id: "disbursement", label: "Disbursement", icon: <Briefcase className="w-4 h-4" /> },
  { id: "mailLog", label: "Mail Log", icon: <AlertCircle className="w-4 h-4" /> },
  { id: "activityLog", label: "Activity Log", icon: <Building2 className="w-4 h-4" /> },
  { id: "dedupe", label: "Dedupe", icon: <AlertCircle className="w-4 h-4" /> },
]

export default function ApplicationDetailsSheet({
  application,
  open,
  onOpenChange,
}: ApplicationDetailsSheetProps) {


  const [activeTab, setActiveTab] = useState("details")
  /** Panel width the user can change by dragging its left edge. */
  const resizableSheet = useResizableSheetWidth("crm.applicationSheetWidthVw")
  const [bankNetCreditAvg, setBankNetCreditAvg] = useState<number | null>(null)
  const dispatch = useDispatch<AppDispatch>()
  const { resolvedTheme } = useTheme()
  const { data: clientData, loading: clientLoading, currentClientId } = useSelector(
    (state: RootState) => state.clientDetail
  )
  const positionsState = useSelector((state: RootState) => state.positions)
  const loginUser = useSelector((state: RootState) => state.login?.data?.user)
  const canEditDecisionMaking = useMemo(
    () => canRoleEditDecisionMakingTab(resolveEffectiveRole(loginUser)),
    [loginUser],
  )

  const userRole = useSelector(
    (state: RootState) =>
      state.login?.data?.user?.role ||
      (typeof window !== "undefined" ? localStorage.getItem("role") : "") ||
      ""
  )
  const roleUpper = String(userRole || "").replace(/-/g, "_").toUpperCase()
  const canSeeDedupe = ["SCRUBBING", "UNDERWRITER", "ADMIN", "SUPER_ADMIN"].includes(
    roleUpper
  )
  const isOperationsRole = roleUpper === "OPERATIONS"
  const visibleTabs = canSeeDedupe ? TABS : TABS.filter((t) => t.id !== "dedupe")

  // Derive clientId from application
  const clientIdFromApplication = (() => {
    const client = application?.client
    if (!client) return null
    if (typeof client === "string") return client
    if (client.clientId != null) return String(client.clientId)
    if (client._id) return client._id
    return null
  })()

  // Fetch full client details when sheet opens
  useEffect(() => {
    if (!open || !clientIdFromApplication) return
    if (currentClientId === clientIdFromApplication && clientData) return

    dispatch(getClientByClientId(clientIdFromApplication))
  }, [open, clientIdFromApplication, currentClientId, clientData, dispatch])

  const dealApplicationId = application
    ? String(application.applicationId ?? application._id)
    : null

  useEffect(() => {
    if (!open || !dealApplicationId) return
    dispatch(getApplicationByApplicationId(dealApplicationId))
    dispatch(getPositions({ application: dealApplicationId, force: true }))
  }, [open, dealApplicationId, dispatch])

  const scopedPositions = useMemo(() => {
    if (!dealApplicationId) return []
    const currentScopeId = positionsState.currentApplicationId
      ? String(positionsState.currentApplicationId)
      : ""
    const allowedIds = [dealApplicationId].filter(Boolean).map((id) => String(id))
    if (currentScopeId && !allowedIds.includes(currentScopeId)) return []
    return Array.isArray(positionsState.data) ? positionsState.data : []
  }, [dealApplicationId, positionsState.currentApplicationId, positionsState.data])

  const calculatorPositions = useMemo(
    () => mapPositionsForCalculator(scopedPositions as unknown as Array<Record<string, unknown>>),
    [scopedPositions],
  )

  const bankAnalysisPositions = useMemo(
    () =>
      scopedPositions.map((p) => {
        const row = p as unknown as Record<string, unknown>
        return {
          amountFunded: row.fundedAmount != null ? String(row.fundedAmount) : "",
          startingDate:
            typeof row.fundingDate === "string"
              ? row.fundingDate.slice(0, 10)
              : row.fundingDate
                ? new Date(row.fundingDate as string | number | Date).toISOString().slice(0, 10)
                : "",
          allocatedBankAnalysisId:
            Number.isInteger(row.allocatedBankAnalysisId) &&
            Number(row.allocatedBankAnalysisId) > 0
              ? Number(row.allocatedBankAnalysisId)
              : undefined,
        }
      }),
    [scopedPositions],
  )

  useEffect(() => {
    if (!open) return
    if (activeTab === "dedupe" && !canSeeDedupe) {
      setActiveTab("details")
    }
  }, [open, activeTab, canSeeDedupe])

  if (!application) return null

  const clientName = getClientNameFromApplication(application.client)
  const appId = String(application.applicationId ?? application._id)
  const applicationId = String(application._id)
  const currentQueue =
    (application as any)?.currentQueue || (application as any)?.queue || null


  const business: Client["business"] | null = clientData?.business ?? null
  const owner: Client["owner"] | null = clientData?.owner ?? null
  const isDark = resolvedTheme === "dark"
  const isCoreDetailsLoading =
    Boolean(clientIdFromApplication) &&
    (clientLoading || currentClientId !== clientIdFromApplication) &&
    !owner &&
    !business
  const summaryGradient = "var(--brand-gradient)"


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={resizableSheet.style}
        className={`fixed inset-y-0 right-0 z-[9999] flex h-full w-full max-w-full flex-col border-l bg-background p-0 ${
          resizableSheet.isDragging ? "" : "transition-all duration-300"
        } ${resizableSheet.widthClass}`}
      >
        {/* Drag the left edge to widen or narrow the panel. */}
        {resizableSheet.handle}
        {/* --- TOP HEADER (Title & Deal ID) --- */}
        <div className="p-6 pb-4 flex justify-between items-start bg-muted/5">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              {clientName} Deal
            </h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium">Deal ID:</span>
              <code className="bg-muted px-2 py-0.5 rounded text-[12px]">{appId}</code>
            </div>
          </div>

        </div>

        {/* --- TABS NAVIGATION --- */}
        <div className="flex min-h-0 flex-1 flex-col px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 w-full flex-1 flex-col">
            <div className="overflow-x-auto overflow-y-hidden border-b [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.55)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/70 dark:[&::-webkit-scrollbar-thumb]:bg-slate-500/70 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500/90 dark:[&::-webkit-scrollbar-thumb:hover]:bg-slate-400/90">
              <TabsList className="bg-transparent rounded-none min-w-max w-max justify-start h-auto p-0 gap-6">
                {visibleTabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="shrink-0 rounded-none border-b-2 border-b-transparent border-x-0 border-t-0 data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-3 text-md font-medium transition-all"
                  >
                    <div className="flex items-center gap-2">
                      {/* {tab.icon} */}
                      {tab.label}
                    </div>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-6">
              {isCoreDetailsLoading ? (
                <div className="space-y-6 px-2">
                  <Card className={`border-0 rounded-lg shadow-xl overflow-hidden py-0 ${isDark ? "" : "dark:border dark:border-border"}`}>
                    <CardContent className="px-8 py-6" style={{ background: summaryGradient }}>
                      <div className="space-y-4">
                        <Skeleton className="h-8 w-[260px] bg-white/30" />
                        <div className={`grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 rounded-lg p-4 shadow-md dark:shadow-lg ${isDark ? "bg-white/20" : "bg-white/30"}`}>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="space-y-2">
                              <Skeleton className="h-4 w-[140px] bg-white/30" />
                              <Skeleton className="h-5 w-[100px] bg-white/30" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-md border border-border/60 bg-background p-4 space-y-3 shadow-md">
                      <Skeleton className="h-5 w-[200px]" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-[85%]" />
                    </div>
                    <div className="rounded-md border border-border/60 bg-background p-4 space-y-3 shadow-md">
                      <Skeleton className="h-5 w-[200px]" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-[85%]" />
                    </div>
                  </section>
                </div>
              ) : (
                <TabsContent value="details" className="m-0 space-y-8">
                  <ApplicationSummary applicationId={appId} />

                  <Separator />

                  <section>
                    <UploadedDocuments
                      applicationId={appId}
                      readOnly={isOperationsRole}
                    />
                  </section>

                  <Separator />

                  <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <DetailPanel
                      title="Business Profile"
                      loading={clientLoading && !business}
                      empty={!clientLoading && !business}
                      loadingText="Loading business profile..."
                      emptyText="Business profile not available for this client."
                      rows={
                        business
                          ? [
                            { label: "Business Name", value: business.name || "-" },
                            { label: "Business Email", value: business.email || "-" },
                            { label: "Business Number", value: business.number || "-" },
                            {
                              label: "Incorporation date",
                              value: business.incorporationDate
                                ? formatDateUtil(business.incorporationDate, "-")
                                : "-",
                            },
                            { label: "Type of business entity", value: business.businessEntityType || "-" },
                            { label: "website", value: business.website || "-" },
                            { label: "Incorporation State", value: business.incorporationState || "-" },
                            {
                              label: "Monthly Revenue",
                              value:
                                business.monthlyRevenue !== undefined &&
                                  business.monthlyRevenue !== null &&
                                  business.monthlyRevenue !== ""
                                  ? formatCurrency(Number(business.monthlyRevenue))
                                  : "-",
                            },
                            { label: "EIN Number", value: business.einNumber || "-" },
                            { label: "Address 1", value: business.address?.address1 || "-" },
                            { label: "City", value: business.address?.city || "-" },
                            { label: "State", value: business.address?.state || "-" },
                            { label: "Zip Code", value: business.address?.zipCode || "-" },
                          ]
                          : []
                      }
                    />
                    <DetailPanel
                      title="Business Owner Details"
                      loading={clientLoading && !owner}
                      empty={!clientLoading && !owner}
                      loadingText="Loading owner details..."
                      emptyText="Owner details not available for this client."
                      rows={
                        owner
                          ? [
                            {
                              label: "Name",
                              value: `${owner.firstName || ""} ${owner.lastName || ""}`.trim() || "-",
                            },
                            { label: "Email", value: owner.email || "-" },
                            { label: "Mobile Number", value: owner.mobileNumber || "-" },
                            { label: "Date of Birth", value: formatMaybeDate(owner.dateOfBirth) },
                            { label: "Social Security Number (SSN)", value: owner.ssn || "-" },
                            {
                              label: "FiCO Score",
                              value:
                                owner.ficoScore !== undefined && owner.ficoScore !== null && owner.ficoScore !== ""
                                  ? String(owner.ficoScore)
                                  : "-",
                            },
                            {
                              label: "Ownership Percentage",
                              value:
                                owner.ownershipPercentage !== undefined &&
                                  owner.ownershipPercentage !== null &&
                                  owner.ownershipPercentage !== ""
                                  ? `${owner.ownershipPercentage}%`
                                  : "-",
                            },
                            { label: "Address 1", value: owner.address?.address1 || "-" },
                            { label: "City", value: owner.address?.city || "-" },
                            { label: "State", value: owner.address?.state || "-" },
                            { label: "Zip Code", value: owner.address?.zipCode || "-" },
                          ]
                          : []
                      }
                    />
                  </section>

                  <Separator />

                  <section className="space-y-6">
                    <div
                      className="hidden"
                      aria-hidden="true"
                      style={{ position: "absolute", left: -9999, top: 0 }}
                    >
                      <BankAnalysisTable
                        showOnlyTotals
                        onNetCreditAverageChange={(avg) => setBankNetCreditAvg(avg)}
                        applicationId={appId}
                        positions={bankAnalysisPositions as any}
                      />
                    </div>
                    <BankAnalysisTable
                      editMode={canEditDecisionMaking}
                      showOnlyTotals={!canEditDecisionMaking}
                      readOnly={!canEditDecisionMaking}
                      disableCreate={!canEditDecisionMaking}
                      applicationId={appId}
                      positions={bankAnalysisPositions as any}
                    />
                  </section>

                  <Separator />

                  <section>
                    <PositionTableCalculator
                      editMode={canEditDecisionMaking}
                      applicationId={appId}
                      positions={calculatorPositions as any}
                      avgBankNetCredit={bankNetCreditAvg ?? undefined}
                      readOnly={!canEditDecisionMaking}
                      disableDelete={!canEditDecisionMaking}
                      disableCreate={!canEditDecisionMaking}
                    />
                  </section>

                  <section>
                    <ApplicationAdditionalInfo
                      applicationId={appId}
                      readOnly={!canEditDecisionMaking}
                    />
                  </section>

                </TabsContent>
              )}

              {/* Contracts Tab */}
              {activeTab === "contract" && (
                <TabsContent value="contract" className="m-0">
                  <ContractTab readOnly={isOperationsRole} />
                </TabsContent>
              )}

              {/* Final Tab */}
              {activeTab === "final" && (
                <TabsContent value="final" className="m-0">
                  <Final
                    applicationId={appId}
                    onBack={() => onOpenChange(false)}
                  />
                </TabsContent>
              )}

              {/* Funding Tab */}
              {activeTab === "funding" && (
                <TabsContent value="funding" className="m-0">
                  <FundingCall applicationId={appId} />
                </TabsContent>
              )}

              {/* Disbursement Tab */}
              {activeTab === "disbursement" && (
                <TabsContent value="disbursement" className="m-0">
                  <Disbursement
                    applicationId={appId}
                    summaryApplicationId={appId}
                    applicationRecordId={applicationId}
                    currentQueue={currentQueue}
                    onBack={() => onOpenChange(false)}
                  />
                </TabsContent>
              )}

              {/* Mail Log Tab */}
              {activeTab === "mailLog" && (
                <TabsContent
                  value="mailLog"
                  className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <ApplicationSheetMailLog
                    applicationId={applicationId}
                    active={activeTab === "mailLog"}
                    className="min-h-0 flex-1"
                  />
                </TabsContent>
              )}

              {/* Activity Log Tab */}
              {activeTab === "activityLog" && (
                <TabsContent
                  value="activityLog"
                  className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <ApplicationSheetActivityLog
                    applicationId={applicationId}
                    className="min-h-0 flex-1"
                  />
                </TabsContent>
              )}

              {/* Dedupe Tab */}
              {canSeeDedupe && activeTab === "dedupe" && (
                <TabsContent value="dedupe" className="m-0">
                  <ApplicationSheetDudep
                    applicationId={applicationId}
                    onNavigateAway={() => onOpenChange(false)}
                  />
                </TabsContent>
              )}

            </div>
          </Tabs>
        </div>

        {/* --- FOOTER --- */}
        <div className="mt-auto p-4 border-t bg-muted/10 flex justify-between items-center px-6">
          <span className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
            Confidential Data
          </span>
          <span className="text-[11px] text-muted-foreground">
            Created At: {formatDateUtil(application.createdAt || "", "N/A")}
          </span>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DetailPanel({
  title,
  rows,
  loading,
  empty,
  loadingText,
  emptyText,
}: {
  title: string
  rows: Array<{ label: string; value: string }>
  loading: boolean
  empty: boolean
  loadingText: string
  emptyText: string
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background overflow-hidden shadow-md dark:shadow-lg">
      <div className="px-4 py-2 bg-muted/50 border-b border-border/60">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-4">
        {loading && <p className="text-sm text-muted-foreground">{loadingText}</p>}
        {empty && <p className="text-sm text-muted-foreground">{emptyText}</p>}
        {!loading && !empty && (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[minmax(150px,220px)_minmax(0,1fr)] gap-3">
                <p className="text-[13px] font-semibold text-[#2f5e7d]">{row.label}</p>
                <p className="min-w-0 whitespace-normal break-all text-[13px] text-foreground">{row.value || "-"}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}