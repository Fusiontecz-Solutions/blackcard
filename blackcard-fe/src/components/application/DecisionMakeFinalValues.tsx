import { useMemo, useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { getPositions } from "@/redux/actions/positionActions";

import "@/styles/scrubbingPreviewTheme.css";

import type { BankTotalRow } from "@/lib/positionMetrics";

import { Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";

import BankAnalysisTable from "./BankAnalysisTable";
import MyNotes from "./MyNotes";
import { ApplicationAdditionalInfo } from "./AdditionalInfoSection";
import OfferDecisionToggle from "./OfferDecisionToggle";
import PositionTableCalculator from "./PositionTableCalculator";

export type DecisionTabSectionContext = {
  /** True when offer is approved/saved and user has not clicked Edit. */
  componentsReadOnly: boolean;
  /** True while OfferDecisionToggle is in approved preview (read-only) mode. */
  isPreviewMode: boolean;
  /** Bulk-save hook for bank cards — wired to Approve & Save. */
  onRegisterBankSaveAll?: (saveAll: () => Promise<boolean>) => void;
  /**
   * True while the user is editing the page. Sections pass it to their tables
   * so every row unlocks at once, instead of each row keeping its own pencil.
   */
  editMode: boolean;
  applicationId?: string;
  positionsForBankTable?: unknown[];
};

type DecisionMakeFinalValuesProps = {
  applicationId?: string | null;
  allowOfferEdit?: boolean;
  /** When true, the Positions table is editable (lock/unlock + field edits). */
  allowPositionsEdit?: boolean;
  /** When true (and positions are editable), hide the per-row delete action. */
  positionsDisableDelete?: boolean;
  /** When true (and positions are editable), hide Create Position. */
  positionsDisableCreate?: boolean;
  onSummaryMetricsChange?: (payload: {
    activePositions: number;
    existingLeveragePct: number;
    totalLeveragePct: number;
    loading: boolean;
  }) => void;
  /** e.g. bank totals table — shown after offer, before positions (Decision Making layout). */
  betweenOfferAndPositions?:
    | ReactNode
    | ((ctx: DecisionTabSectionContext) => ReactNode);
  /** Rendered directly above the OFFER card (e.g. Super Admin assign-to-underwriter). */
  aboveOffer?: ReactNode;
  /** Show the My Notes panel beside the offer (Decision Making / Scrubbing tabs). */
  showNotesPanel?: boolean;
  /**
   * Scrubbing tab: render Offer, Leverage, Bank Analysis and Positions read-only
   * on first paint. An Edit button unlocks all four; Save persists and returns
   * to the read-only view.
   */
  startInPreview?: boolean;
};

function toISODateOrEmpty(input: unknown): string {
  if (typeof input === "string") {
    if (input.length >= 10) return input.slice(0, 10);
    return input;
  }
  if (!input) return "";
  const d = new Date(input as any);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// PositionTableCalculator and OfferDecisionToggle both expect a "calculator row" shape.
function mapPositionsForCalculator(positions: any[]): any[] {
  return positions.map((p: any) => {
    const fundingDateIso = toISODateOrEmpty(p.fundingDate);
    const closeDateIso = toISODateOrEmpty(p.closeDate);

    return {
      _id: p._id,
      lender: p.funder ?? "",
      frequency: p.frequency ?? "",
      installment: p.ach != null ? String(p.ach) : "",
      status: p.status ?? (p.activeStatus ? "ACTIVE" : "SELECT"),
      startingDate: fundingDateIso,
      // Was omitted entirely, so DATE OF LAST PAYMENT rendered "-" for every
      // row. The preview maps the same field (mapPositions: p.lastPaymentDate).
      lastPaymentDate: toISODateOrEmpty(p.lastPaymentDate),
      amountFunded: p.fundedAmount != null ? String(p.fundedAmount) : "",
      loanAmount: p.loanAmount != null ? String(p.loanAmount) : "",
      totalRepayments: p.paybackAmount != null ? String(p.paybackAmount) : "",
      paymentTerm: p.paymentTerm != null ? String(p.paymentTerm) : "",
      mcaEstBalance: p.mcaEstBalance != null ? String(p.mcaEstBalance) : "",
      mcaPercentPaid: p.mcaPercentPaid != null ? String(p.mcaPercentPaid) : "",
      pmtsLeft: p.pmtsLeft != null ? String(p.pmtsLeft) : "",
      estEndDate: closeDateIso,
      mcaRemit:
        p.mcaRemit != null || p.percentOfGross != null
          ? String(p.mcaRemit ?? p.percentOfGross ?? "")
          : "",
      monthlyMcaPmts:
        p.monthlyMcaPmts != null ? String(p.monthlyMcaPmts) : "",
      carryForward: p.carryForward != null ? String(p.carryForward) : "",
      allocatedBankAnalysisId:
        Number.isInteger((p as any).allocatedBankAnalysisId) &&
        Number((p as any).allocatedBankAnalysisId) > 0
          ? Number((p as any).allocatedBankAnalysisId)
          : undefined,
      isLocked: true,
    };
  });
}

function positionsHaveMeaningfulData(arr: unknown): boolean {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some((row) => {
    if (!row || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    for (const key of [
      "lender",
      "installment",
      "amountFunded",
      "totalRepayments",
      "monthlyMcaPmts",
      "mcaRemit",
      "startingDate",
    ]) {
      const v = r[key];
      if (v != null && String(v).trim() !== "") return true;
    }
    const status = String(r.status ?? "").trim().toUpperCase();
    if (status && status !== "SELECT") return true;
    const frequency = String(r.frequency ?? "").trim();
    if (frequency && frequency !== "Select") return true;
    return false;
  });
}

export default function DecisionMakeFinalValues({
  applicationId,
  allowOfferEdit = false,
  allowPositionsEdit = false,
  positionsDisableDelete = false,
  positionsDisableCreate = false,
  onSummaryMetricsChange,
  betweenOfferAndPositions,
  aboveOffer,
  showNotesPanel = false,
  startInPreview = false,
}: DecisionMakeFinalValuesProps) {
  const { data: applicationData } = useSelector(
    (state: RootState) => state.applicationDetail,
  );
  const positionsState = useSelector((state: RootState) => state.positions);

  const fromRedux =
    (applicationData as any)?.applicationId ??
    (applicationData as any)?._id ??
    (applicationData as any)?.id ??
    null;
  const propId =
    applicationId != null && String(applicationId).trim() !== ""
      ? String(applicationId).trim()
      : null;
  /** Prefer explicit prop (e.g. preview sheet) so we never show another deal's offer when Redux detail is stale. */
  const effectiveApplicationId = propId ?? fromRedux;

  const dispatch = useDispatch<AppDispatch>();

  // Always load positions for this application (Preview fetches independently;
  // without this, Decision Making can stay empty after refresh).
  useEffect(() => {
    if (!effectiveApplicationId) return;
    void dispatch(getPositions({ application: String(effectiveApplicationId), force: true }));
  }, [effectiveApplicationId, dispatch]);

  const [bankNetCreditAvg, setBankNetCreditAvg] = useState<number | null>(
    null,
  );
  /** Per-month bank totals — the Leverage card needs these for Recent month Leverage. */
  const [bankTotalRows, setBankTotalRows] = useState<BankTotalRow[]>([]);
  /** null until the bank analysis has loaded; then whether any month was saved. */
  const [bankHasSavedRows, setBankHasSavedRows] = useState<boolean | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  /** Edit gate for `startInPreview`: false until the user clicks Edit. */
  const [isEditingSections, setIsEditingSections] = useState(false);
  const [isSavingSections, setIsSavingSections] = useState(false);
  /** null until the offer card reports; false means this deal has no offer. */
  const [offerExists, setOfferExists] = useState<boolean | null>(null);
  const handleDecisionLoaded = useCallback(
    (decision: "approved" | "declined" | null) => {
      setOfferExists(decision !== null);
    },
    [],
  );
  const [livePositions, setLivePositions] = useState<any[]>([]);
  const livePositionsRef = useRef<any[]>([]);
  const lastPositionsSeedSigRef = useRef("");
  const lastSeededAppRef = useRef<string | null>(null);

  const saveAllPositionsRef = useRef<(() => Promise<boolean>) | null>(null);
  const saveAllBanksRef = useRef<(() => Promise<boolean>) | null>(null);

  const handleRegisterSaveAllPositions = useCallback(
    (saveAll: () => Promise<boolean>) => {
      saveAllPositionsRef.current = saveAll;
    },
    [],
  );

  const handleRegisterSaveAllBanks = useCallback(
    (saveAll: () => Promise<boolean>) => {
      saveAllBanksRef.current = saveAll;
    },
    [],
  );

  /**
   * A deal with no offer, no positions and no bank rows opens ready to type
   * into; a deal that already holds values opens read-only behind the Edit
   * button. Latched on the first load so that typing into an empty deal does
   * not make it "non-empty" and snap the page back to read-only mid-entry.
   * Decided only once the offer, positions and bank analysis have all loaded:
   * deciding on the offer alone read a still-loading deal as empty and opened
   * it fully editable with no Edit button.
   */
  const startedEmptyRef = useRef<boolean | null>(null);
  const positionsLoaded =
    !positionsState.loading &&
    effectiveApplicationId != null &&
    String(positionsState.currentApplicationId ?? "") ===
      String(effectiveApplicationId);
  if (
    startedEmptyRef.current === null &&
    offerExists !== null &&
    bankHasSavedRows !== null &&
    positionsLoaded
  ) {
    startedEmptyRef.current =
      !offerExists &&
      !bankHasSavedRows &&
      // Server-side positions; `scopedPositions` is declared further down, and
      // an unscoped read here only ever errs towards read-only.
      !positionsHaveMeaningfulData(positionsState.data);
  }
  const startedEmpty = startedEmptyRef.current === true;

  // The edit gate only hides editing affordances; save-all registration stays
  // wired so Save can flush both tables once the user enters edit mode.
  const editGateActive = startInPreview && !isEditingSections && !startedEmpty;
  /**
   * One edit state for the whole page: behind the top Edit button when there is
   * one, otherwise simply "the page is editable". Tables use it to unlock every
   * row together, the way they behave when values are first entered.
   */
  const sectionsEditMode = startInPreview
    ? isEditingSections || startedEmpty
    : allowPositionsEdit || allowOfferEdit;
  const effectiveAllowOfferEdit = allowOfferEdit && !editGateActive;
  const effectiveAllowPositionsEdit = allowPositionsEdit && !editGateActive;

  const useDeferredSave = allowOfferEdit || allowPositionsEdit;

  /** Save hook registered by {@link OfferDecisionToggle}. */
  const saveOfferRef = useRef<(() => Promise<boolean>) | null>(null);
  const handleRegisterSaveOffer = useCallback((save: () => Promise<boolean>) => {
    saveOfferRef.current = save;
  }, []);

  const handleApproveSaveAll = useCallback(async (): Promise<boolean> => {
    if (!useDeferredSave) return true;

    try {
      const banksOk = (await saveAllBanksRef.current?.()) ?? true;
      if (!banksOk) return false;
    } catch (err) {
      console.error("Failed to save bank analysis on approve:", err);
      return false;
    }

    try {
      const positionsOk = (await saveAllPositionsRef.current?.()) ?? true;
      if (!positionsOk) return false;
    } catch (err) {
      console.error("Failed to save positions on approve:", err);
      return false;
    }

    return true;
  }, [useDeferredSave]);

  const componentsReadOnly = isPreviewMode || !effectiveAllowPositionsEdit;

  const handleSaveSections = useCallback(async () => {
    setIsSavingSections(true);
    try {
      const coreOk = await handleApproveSaveAll();
      if (!coreOk) return;
      // The offer is saved here rather than inside handleApproveSaveAll,
      // because that function is also the offer card's `onApprove` — calling
      // the offer from within it makes the two recurse into each other and no
      // save ever completes. The hook is a no-op until a decision exists, so
      // Save still never approves on its own.
      await saveOfferRef.current?.();
      // Re-read what was just written. Saving posts each row but never
      // refreshed the store, so anything driven by it — the Leverage totals and
      // the wires derived from Positions — kept showing the old values until
      // the page was reloaded by hand.
      if (effectiveApplicationId) {
        void dispatch(
          getPositions({ application: String(effectiveApplicationId), force: true }),
        );
      }
      // A deal that opened empty skipped the Edit gate; once saved it holds
      // values, so it goes read-only behind Edit like any other deal.
      startedEmptyRef.current = false;
      setIsEditingSections(false);
    } finally {
      setIsSavingSections(false);
    }
  }, [handleApproveSaveAll, dispatch, effectiveApplicationId]);

  const scopedPositions = useMemo(() => {
    if (!effectiveApplicationId) return [];
    const currentScopeId = positionsState.currentApplicationId
      ? String(positionsState.currentApplicationId)
      : "";
    const allowedIds = [
      effectiveApplicationId,
      (applicationData as any)?._id,
      (applicationData as any)?.applicationId,
      (applicationData as any)?.id,
      applicationId,
    ]
      .filter(Boolean)
      .map((id) => String(id));
    if (currentScopeId && !allowedIds.includes(currentScopeId)) return [];
    return Array.isArray(positionsState.data) ? positionsState.data : [];
  }, [
    effectiveApplicationId,
    applicationData,
    applicationId,
    positionsState.currentApplicationId,
    positionsState.data,
  ]);

  const calculatorPositions = useMemo(() => {
    if (!Array.isArray(scopedPositions)) return [];
    return mapPositionsForCalculator(scopedPositions);
  }, [scopedPositions]);

  const positionsForCalculator = useMemo(() => {
    // Read-only always uses the API-mapped rows.
    //
    // `livePositions` are the rows PositionTableCalculator emitted back out via
    // onRowsChange, and those have been through recalcRow — EST. MCA % PAID,
    // EST. Lvg, EST. PMTS LEFT and EST. BALANCE are all derived there. Feeding
    // them back in makes the table display computed figures where the preview
    // and the PDF show the values stored in /positions, so the same position
    // reports a different EST. MCA % PAID on each screen.
    //
    // Live rows are what the user is actively editing, so they still win while
    // the table is editable.
    if (componentsReadOnly) {
      return calculatorPositions;
    }
    if (positionsHaveMeaningfulData(livePositions)) {
      return livePositions;
    }
    return calculatorPositions;
  }, [componentsReadOnly, livePositions, calculatorPositions]);

  useEffect(() => {
    livePositionsRef.current = livePositions;
  }, [livePositions]);

  useEffect(() => {
    if (!effectiveApplicationId) {
      setLivePositions([]);
      lastSeededAppRef.current = null;
      lastPositionsSeedSigRef.current = "";
      return;
    }
    const appKey = String(effectiveApplicationId);
    const sig = JSON.stringify(
      (calculatorPositions || []).map((p: any) => ({
        _id: String(p._id ?? ""),
        lender: String(p.lender ?? ""),
        amountFunded: String(p.amountFunded ?? ""),
      })),
    );

    if (lastSeededAppRef.current !== appKey) {
      lastSeededAppRef.current = appKey;
      lastPositionsSeedSigRef.current = sig;
      setLivePositions(calculatorPositions);
      return;
    }

    if (sig === lastPositionsSeedSigRef.current) return;
    lastPositionsSeedSigRef.current = sig;

    if (
      !positionsHaveMeaningfulData(calculatorPositions) &&
      positionsHaveMeaningfulData(livePositionsRef.current)
    ) {
      return;
    }

    setLivePositions(calculatorPositions);
  }, [effectiveApplicationId, calculatorPositions]);

  const handleRowsChange = useCallback((nextRows: any[]) => {
    setLivePositions((prev) => {
      if (
        !positionsHaveMeaningfulData(nextRows) &&
        positionsHaveMeaningfulData(prev)
      ) {
        return prev;
      }
      return prev === nextRows ? prev : nextRows || [];
    });
  }, []);

  const sectionContext: DecisionTabSectionContext = {
    componentsReadOnly,
    isPreviewMode,
    editMode: sectionsEditMode && !isPreviewMode,
    onRegisterBankSaveAll: useDeferredSave
      ? handleRegisterSaveAllBanks
      : undefined,
    applicationId: effectiveApplicationId ?? undefined,
    positionsForBankTable: positionsForCalculator,
  };

  const betweenSection =
    typeof betweenOfferAndPositions === "function"
      ? betweenOfferAndPositions(sectionContext)
      : betweenOfferAndPositions;

  return (
    <div className="space-y-6 w-full">
      {startInPreview && (allowOfferEdit || allowPositionsEdit) && !startedEmpty ? (
        <div className="flex items-center justify-end gap-2">
          {isEditingSections ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={isSavingSections}
                onClick={() => setIsEditingSections(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSavingSections}
                onClick={() => void handleSaveSections()}
                className="gap-1.5"
              >
                {isSavingSections ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingSections(true)}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      ) : null}

      {/* Mount bank totals off-screen so we can reuse avgNetCredit for remit calculations */}
      <div
        className="hidden"
        aria-hidden="true"
        style={{ position: "absolute", left: -9999, top: 0 }}
      >
        <BankAnalysisTable
          showOnlyTotals
          onNetCreditAverageChange={(avg) => setBankNetCreditAvg(avg)}
          onBankTotalRowsChange={setBankTotalRows}
          onSavedRowsLoaded={setBankHasSavedRows}
          applicationId={effectiveApplicationId || undefined}
          positions={positionsForCalculator as any}
        />
      </div>

      {/*
        Leverage reads `positions` for existingRemit (sum of each active
        position's mcaRemit). Pass the API-backed rows, NOT `positionsForCalculator`.

        `positionsForCalculator` prefers PositionTableCalculator's live rows,
        which RECOMPUTE mcaRemit as monthlyMcaPmts / avgNetCredit × 100 and blank
        it whenever the average is unavailable. The preview never recomputes — it
        sums the stored mcaRemit straight from /positions. Feeding the recomputed
        rows here is why Current and Total Levg disagreed with the preview.
      */}
      <OfferDecisionToggle
        editMode={sectionsEditMode}
        onRegisterSave={handleRegisterSaveOffer}
        onDecisionLoaded={handleDecisionLoaded}
        positions={calculatorPositions as any}
        bankTables={undefined}
        bankTotalRows={bankTotalRows}
        bankTotalAvgNetCredit={bankNetCreditAvg ?? undefined}
        applicationId={effectiveApplicationId || undefined}
        disabled={!effectiveAllowOfferEdit}
        showFooterActions={effectiveAllowOfferEdit}
        actionsAtTop
        showPreviewBadge
        onPreviewModeChange={setIsPreviewMode}
        showLeverageTable
        onSummaryMetricsChange={onSummaryMetricsChange}
        onApprove={useDeferredSave ? handleApproveSaveAll : undefined}
        aboveOffer={aboveOffer}
      />

      {betweenSection}

      <PositionTableCalculator
        editMode={sectionsEditMode && !componentsReadOnly}
        applicationId={effectiveApplicationId || undefined}
        positions={positionsForCalculator as any}
        avgBankNetCredit={bankNetCreditAvg ?? undefined}
        onRowsChange={handleRowsChange}
        readOnly={componentsReadOnly}
        disableDelete={effectiveAllowPositionsEdit && positionsDisableDelete}
        disableCreate={effectiveAllowPositionsEdit && positionsDisableCreate}
        onRegisterSaveAll={
          useDeferredSave ? handleRegisterSaveAllPositions : undefined
        }
        autoSave={useDeferredSave && !componentsReadOnly}
      />
      {/* Additional Info follows Positions: the credit side of Critical Wire
          Transactions is derived from them, so it reads under its source. */}
      <div className="mt-6 w-full min-w-0">
        {/* Permission only, never the page's Edit gate: mca-tool keeps this
            section editable at all times. */}
        <ApplicationAdditionalInfo
          applicationId={effectiveApplicationId || undefined}
          readOnly={!allowPositionsEdit && !allowOfferEdit}
          positions={positionsForCalculator}
        />
      </div>


      {showNotesPanel && (
        <div className="mt-6 w-full min-w-0">
          <MyNotes applicationId={effectiveApplicationId || undefined} wide />
        </div>
      )}
    </div>
  );
}
