import { useEffect, useMemo, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import type { AppDispatch, RootState } from "@/redux/store"
import BankAnalysisTable from "./BankAnalysisTable"
import PositionTableCalculator from "./PositionTableCalculator"
import { getPositions } from "@/redux/actions/positionActions"

type ApplicationSheetBankAndPositionsProps = {
  /** Application MongoDB ObjectId used to load/persist bank analysis and positions. */
  applicationId?: string | null
  /** When true, both tables are view-only (no Add Bank / Add Month / Create Position / delete). */
  readOnly?: boolean
}

/**
 * Sheet-oriented composition that stacks the editable Bank Analysis table and the
 * Positions table. The bank total's average net credit is forwarded to the positions
 * table so remit-based calculations stay in sync, mirroring the Decision Making layout
 * (without the offer toggle).
 */
export default function ApplicationSheetBankAndPositions({
  applicationId,
  readOnly = false,
}: ApplicationSheetBankAndPositionsProps) {
  const dispatch = useDispatch<AppDispatch>()
  const resolvedApplicationId = applicationId ?? undefined
  const positionsState = useSelector((state: RootState) => state.positions)
  const [bankNetCreditAvg, setBankNetCreditAvg] = useState<number | null>(null)

  useEffect(() => {
    if (!resolvedApplicationId) return
    dispatch(getPositions({ application: resolvedApplicationId }))
  }, [resolvedApplicationId, dispatch])

  // Positions reduced to the shape the Bank Analysis table needs for funding allocation,
  // scoped to the current application so a stale store never leaks another deal's data.
  const scopedPositions = useMemo(() => {
    if (!resolvedApplicationId) return []
    const currentScopeId = positionsState.currentApplicationId
      ? String(positionsState.currentApplicationId)
      : ""
    if (currentScopeId && currentScopeId !== String(resolvedApplicationId)) return []
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
        Number.isInteger(p?.allocatedBankAnalysisId) && Number(p.allocatedBankAnalysisId) > 0
          ? Number(p.allocatedBankAnalysisId)
          : undefined,
    }))
  }, [resolvedApplicationId, positionsState.currentApplicationId, positionsState.data])

  return (
    <div className="space-y-6">
      <BankAnalysisTable
        applicationId={resolvedApplicationId}
        readOnly={readOnly}
        disableCreate={readOnly}
        disableDelete={readOnly}
        positions={scopedPositions as any}
        onNetCreditAverageChange={(avg) => setBankNetCreditAvg(avg)}
      />
      <PositionTableCalculator
        applicationId={resolvedApplicationId}
        avgBankNetCredit={bankNetCreditAvg ?? undefined}
        readOnly={readOnly}
        disableDelete={readOnly}
        disableCreate={readOnly}
      />
    </div>
  )
}
