import { useMemo } from "react"
import { useSelector } from "react-redux"
import { useEffect } from "react"
import { useDispatch } from "react-redux"
import type { RootState } from "@/redux/store"
import type { AppDispatch } from "@/redux/store"
import BankAnalysisTable from "./BankAnalysisTable"
import DecisionMakeFinalValues from "./DecisionMakeFinalValues"
import { getPositions } from "@/redux/actions/positionActions"
import { canRoleEditDecisionMakingTab } from "@/lib/decisionMakingAccess"
import { resolveEffectiveRole } from "@/lib/sessionRole"

type ApplicationSheetBankAnalysisProps = {
  applicationId?: string | null
}

export default function ApplicationSheetBankAnalysis({
  applicationId,
}: ApplicationSheetBankAnalysisProps) {
  const dispatch = useDispatch<AppDispatch>()
  const resolvedApplicationId = applicationId ?? undefined
  const positionsState = useSelector((state: RootState) => state.positions)

  const loginUser = useSelector((state: RootState) => state.login?.data?.user)
  const canEditDecisionMaking = useMemo(
    () => canRoleEditDecisionMakingTab(resolveEffectiveRole(loginUser)),
    [loginUser],
  )

  useEffect(() => {
    if (!resolvedApplicationId) return
    dispatch(getPositions({ application: resolvedApplicationId, force: true }))
  }, [resolvedApplicationId, dispatch])

  const scopedPositions = useMemo(() => {
    if (!resolvedApplicationId) return []
    const currentScopeId = positionsState.currentApplicationId
      ? String(positionsState.currentApplicationId)
      : ""
    const allowedIds = [resolvedApplicationId].filter(Boolean).map((id) => String(id))
    if (currentScopeId && !allowedIds.includes(currentScopeId)) return []
    const list = Array.isArray(positionsState.data) ? positionsState.data : []
    return list.map((p: any) => ({
      amountFunded: p.fundedAmount != null ? String(p.fundedAmount) : "",
      startingDate:
        typeof p.fundingDate === "string"
          ? p.fundingDate.slice(0, 10)
          : p.fundingDate
            ? new Date(p.fundingDate).toISOString().slice(0, 10)
            : "",
      allocatedBankAnalysisId:
        Number.isInteger(p?.allocatedBankAnalysisId) &&
        Number(p.allocatedBankAnalysisId) > 0
          ? Number(p.allocatedBankAnalysisId)
          : undefined,
    }))
  }, [
    resolvedApplicationId,
    positionsState.currentApplicationId,
    positionsState.data,
  ])

  return (
    <div className="space-y-6">
      <DecisionMakeFinalValues
        applicationId={resolvedApplicationId}
        allowOfferEdit={canEditDecisionMaking}
        allowPositionsEdit={canEditDecisionMaking}
        betweenOfferAndPositions={({ componentsReadOnly, onRegisterBankSaveAll, editMode }) => (
          <BankAnalysisTable
            editMode={editMode && canEditDecisionMaking}
            showOnlyTotals={!canEditDecisionMaking}
            readOnly={componentsReadOnly || !canEditDecisionMaking}
            disableCreate={componentsReadOnly || !canEditDecisionMaking}
            applicationId={resolvedApplicationId}
            positions={scopedPositions as any}
            onRegisterSaveAll={onRegisterBankSaveAll}
          />
        )}
      />
    </div>
  )
}
