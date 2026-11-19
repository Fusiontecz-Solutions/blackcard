import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatNumberUS, formatNumberUSForInput, formatRateUS } from "@/lib/utils";
import { deriveOfferRepaymentStack } from "@/lib/offerRepaymentCalculations";
import {
  feesPercentToDollarsFromFunded,
  resolveOfferDecisionFeesRaw,
  resolveOfferDecisionFundedAmount,
  resolveOfferFeesPercentForForm,
} from "@/lib/offerDecisionFees";
import {
  OFFER_DECISION_UPDATED_EVENT,
  emitOfferDecisionUpdated,
  offerDecisionUpdateMatchesApplication,
} from "@/lib/offerDecisionSync";
import { axiosGet, axiosPost } from "@/redux/axios";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { ApprovedOfferDisplay } from "./ApprovedOfferDisplay";
import {
  getExistingActivePositionsCount,
  type BankTotalRow,
} from "@/lib/positionMetrics";
import RejectApplicationModal from "./RejectApplicationModal";
import "@/styles/scrubbingPreviewTheme.css";

/** Wd preview's GREEN_VEIL (sectionBarStyles.js) laid over the #5f9a60 Offer bar. */
const SCRUB_GREEN_VEIL =
  "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 44%, rgba(255,255,255,0.12) 56%, rgba(255,255,255,0.30) 68%, rgba(255,255,255,0.50) 80%, rgba(255,255,255,0.62) 91%, rgba(255,255,255,0.70) 100%)";

type Frequency = "Daily" | "Weekly" | "Bi-Weekly" | "Monthly" | "";

export interface OfferFormValue {
  position: string;
  offer: string;
  rate: string;
  term: string;
  fees: string;
  notes: string;
  frequency: Frequency;
  daysWeeks: string;
  monthlyPayment: string;
  totalRemit: string;
  /** Optional manual remit input (our leverage %) */
  ourRemit?: string;
}

export interface OfferDecisionToggleProps {
  /** Stack / positions context (optional in this project, but supported). */
  positions?: any[];
  /** Per-month bank totals, for Recent month Leverage. */
  bankTotalRows?: BankTotalRow[];
  /** Raw bank tables used to compute fallback average net credit. */
  bankTables?: Array<{ rows?: Array<{ netCredit?: number | string | null }> }>;
  /** Primary average net credit value for this bank analysis. */
  bankTotalAvgNetCredit?: number | string;
  /** Existing total monthly from positions (for display only). */
  positionTotalMonthlyPayment?: number | string;
  /** Current decision from parent (approved / declined / null). */
  offerDecision?: "approved" | "declined" | null;
  /** Unique id for this application, used to reset when navigating. */
  applicationId?: string | null;

  /** External form value, if parent wants to control it. */
  value?: OfferFormValue;
  /** Called whenever local form state changes. */
  onChange?: (next: OfferFormValue) => void;

  /** Called when user confirms Approve & Save. Return false to abort the offer save. */
  onApprove?: (value: OfferFormValue) => void | boolean | Promise<void | boolean>;
  /** Called when user confirms decline with a reason. */
  onDecline?: (reason: string) => void | Promise<void>;
  /** Called when user cancels editing an existing decision. */
  onCancelEdit?: () => void;
  /** Notifies parent whenever the approve form open state changes. */
  onFormOpenChange?: (open: boolean) => void;

  /** Forces the approve form open (for editing an existing approval). */
  forceShowForm?: boolean;
  /**
   * Page-level edit mode. When true the offer fields unlock together with Bank
   * Analysis and Positions and this card hides its own Edit button - the
   * page's single Edit/Save toolbar owns the lock state.
   */
  editMode?: boolean;
  /**
   * Registers a save callback with the page toolbar so one Save persists the
   * offer alongside banks and positions. It is a no-op for a case with no
   * approved decision yet: Save must never approve an offer on its own.
   */
  onRegisterSave?: (save: () => Promise<boolean>) => void;
  /**
   * Reports the stored decision once it has loaded — "approved", "declined", or
   * null when this deal has no offer yet. The page uses it to decide whether to
   * start in edit mode, so a brand new deal is ready to type into.
   */
  onDecisionLoaded?: (decision: "approved" | "declined" | null) => void;
  /** Parent-controlled flag when editing an existing declined decision. */
  editingDeclined?: boolean;
  /** Disables decision buttons (e.g. until first save). */
  disabled?: boolean;
  /** Controls visibility of Approved / Declined buttons (default: true). */
  showDecisionButtons?: boolean;
  /** Controls visibility of footer actions (Cancel / Approve & Save). */
  showFooterActions?: boolean;
  /** Controls visibility of leverage table under Offer. */
  showLeverageTable?: boolean;
  /** Optional overrides for position metrics when computed externally. */
  activePositionCountOverride?: number;
  existingRemitOverride?: number;
  totalMonthlyFromPositionsOverride?: number;
  totalDailyFromPositionsOverride?: number;

  /** Emits computed summary metrics for the Underwriter header. */
  onSummaryMetricsChange?: (payload: {
    activePositions: number;
    existingLeveragePct: number;
    totalLeveragePct: number;
    loading: boolean;
  }) => void;
  /** When true, Decline / Approve & Save / Edit render above the OFFER card. */
  actionsAtTop?: boolean;
  /** When true (default with actionsAtTop), show a Preview mode badge while the offer is locked. */
  showPreviewBadge?: boolean;
  /** Fires when an approved offer is locked (preview) vs editable. */
  onPreviewModeChange?: (isPreview: boolean) => void;
  /** Optional slot rendered directly above the OFFER card (below top actions when actionsAtTop). */
  aboveOffer?: React.ReactNode;
}

function isSameOfferForm(a: OfferFormValue, b: OfferFormValue): boolean {
  return (
    a.position === b.position &&
    a.offer === b.offer &&
    a.rate === b.rate &&
    a.term === b.term &&
    a.fees === b.fees &&
    a.notes === b.notes &&
    a.frequency === b.frequency &&
    a.daysWeeks === b.daysWeeks &&
    a.monthlyPayment === b.monthlyPayment &&
    a.totalRemit === b.totalRemit &&
    (a.ourRemit ?? "") === (b.ourRemit ?? "")
  );
}

const DEFAULT_OFFER_RATE = "1.499";
const DEFAULT_FEES_PERCENT = "10";
const WEEKLY_TO_MONTHLY_FACTOR = 4.2;
// Bi-Weekly = 26 payments/yr ÷ 12 months ≈ 2.166. Kept proportional to the
// project's WEEKLY_TO_MONTHLY_FACTOR (4.2 instead of 4.333) by halving it.
const BIWEEKLY_TO_MONTHLY_FACTOR = 2.1;

const DEFAULT_FORM_STATE: OfferFormValue = {
  position: "",
  offer: "",
  rate: DEFAULT_OFFER_RATE,
  term: "",
  fees: DEFAULT_FEES_PERCENT,
  notes: "",
  frequency: "",
  daysWeeks: "",
  monthlyPayment: "",
  totalRemit: "",
  ourRemit: "",
};

// ---- Shared position metrics (mirrors web/utils/positionMetrics.js) ----

function parseNum(value: unknown): number {
  if (value == null || String(value).trim() === "") return NaN;
  const cleaned = String(value).replace(/[^0-9.-]+/g, "");
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function getActivePositionsForCount(
  positions: any[] | undefined | null,
): any[] {
  if (!Array.isArray(positions)) return [];
  return positions.filter((row) => {
    const status = String(row?.status || "")
      .trim()
      .toUpperCase();
    if (status && status !== "SELECT") return true;

    const lender = String(row?.lender || "").trim();
    if (lender) return true;

    const numericKeys = [
      "amountFunded",
      "installment",
      "paymentTerm",
      "totalRepayments",
      "monthlyMcaPmts",
      "mcaEstBalance",
      "mcaPercentPaid",
      "pmtsLeft",
      "mcaRemit",
      "loanAmount",
    ] as const;

    for (const key of numericKeys) {
      const v = row && (row as any)[key];
      if (v != null && String(v).trim() !== "" && !Number.isNaN(parseNum(v))) {
        return true;
      }
    }
    return false;
  });
}

function getActivePositionsForMetrics(
  positions: any[] | undefined | null,
): any[] {
  if (!Array.isArray(positions)) return [];
  return positions.filter((row) => {
    const statusUpper = String(row?.status || "")
      .toUpperCase()
      .trim();
    const hasStatus = statusUpper && statusUpper !== "SELECT";
    const isIncludedStatus = ["ACTIVE", "REFI", "PIF", "REVERSE"].includes(
      statusUpper,
    );

    const amountFunded = parseNum(row?.amountFunded);
    const hasAmountFunded = !Number.isNaN(amountFunded) && amountFunded > 0;

    const mcaRemit = parseNum(row?.mcaRemit);
    const monthlyMcaPmts = parseNum(row?.monthlyMcaPmts);
    const hasRemitOrPayment =
      (!Number.isNaN(mcaRemit) && mcaRemit > 0) ||
      (!Number.isNaN(monthlyMcaPmts) && monthlyMcaPmts > 0);

    if (isIncludedStatus && (hasAmountFunded || hasRemitOrPayment)) {
      return true;
    }

    if (!hasStatus && (hasAmountFunded || hasRemitOrPayment)) {
      return true;
    }

    return false;
  });
}

function computePositionMetrics(positions: any[] | undefined | null) {
  const activeForCount = getActivePositionsForCount(positions);
  const activeForTotals = getActivePositionsForMetrics(positions);

  const existingRemit = activeForTotals.reduce((sum, row) => {
    return sum + (parseNum(row?.mcaRemit) || 0);
  }, 0);

  const totalMonthlyFromPositions = activeForTotals.reduce((sum, row) => {
    return sum + (parseNum(row?.monthlyMcaPmts) || 0);
  }, 0);

  const totalDailyFromPositions =
    totalMonthlyFromPositions > 0 ? totalMonthlyFromPositions / 22 : 0;

  return {
    activeCount: activeForCount.length,
    existingRemit,
    totalMonthlyFromPositions,
    totalDailyFromPositions,
  };
}

function sanitizeDecimalInput(value: string): string {
  let s = value.replace(/[^0-9.-]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
  if (s.indexOf("-", 1) !== -1) s = s.replace(/-/g, "");
  return s;
}

/** Format stored currency strings for display (comma thousands, two decimals). */
function formatCurrencyDisplayValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const formatted = formatNumberUS(trimmed);
  return formatted || trimmed;
}

function computeFallbackAvgNetCredit(
  bankTables?: Array<{ rows?: Array<{ netCredit?: number | string | null }> }>,
): number | null {
  if (!Array.isArray(bankTables) || bankTables.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const table of bankTables) {
    if (!Array.isArray(table?.rows)) continue;
    for (const row of table.rows) {
      const n = parseNum(row?.netCredit);
      if (!Number.isNaN(n) && n > 0) {
        sum += n;
        count += 1;
      }
    }
  }
  if (count === 0) return null;
  return sum / count;
}

const GRAMMAR_DEBOUNCE_MS = 1200;

async function checkAndCorrectWithLanguageTool(
  text: string,
  lang: string,
): Promise<string | null> {
  try {
    const params = new URLSearchParams();
    params.set("text", text);
    params.set("language", lang);

    const res = await fetch("https://api.languagetool.org/v2/check", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      matches?: Array<{
        offset: number;
        length: number;
        replacements?: Array<{ value: string }>;
      }>;
    };
    if (!Array.isArray(data.matches) || data.matches.length === 0) {
      return text;
    }

    // Apply replacements from the end to preserve offsets
    let corrected = text;
    const matches = [...data.matches].sort((a, b) => b.offset - a.offset);
    for (const match of matches) {
      if (!match.replacements?.length) continue;
      const replacement = match.replacements[0]?.value;
      if (!replacement) continue;
      corrected =
        corrected.slice(0, match.offset) +
        replacement +
        corrected.slice(match.offset + match.length);
    }
    return corrected;
  } catch {
    return null;
  }
}

/** Map GET/POST offer-decision payload into form state; fill repay/monthly when missing. */
function mapApiOfferDecisionToLocalData(
  apiData: Record<string, unknown>,
  prev: OfferFormValue,
): OfferFormValue {
  const fundedAmount = resolveOfferDecisionFundedAmount(apiData);
  const feesRaw = resolveOfferDecisionFeesRaw(apiData);
  const loadedFeesPercent = resolveOfferFeesPercentForForm(
    fundedAmount,
    apiData.rate,
    feesRaw,
  );

  let next: OfferFormValue = {
    ...prev,
    position: apiData.position != null ? String(apiData.position) : "",
    offer: fundedAmount != null ? formatNumberUS(fundedAmount) : "",
    rate:
      apiData.rate != null
        ? formatRateUS(apiData.rate)
        : DEFAULT_OFFER_RATE,
    term: apiData.term != null ? String(apiData.term) : "",
    frequency: (apiData.frequency as Frequency) ?? "",
    daysWeeks:
      apiData.repayPerPeriod != null
        ? formatNumberUS(apiData.repayPerPeriod)
        : "",
    monthlyPayment:
      apiData.monthlyPayment != null
        ? formatNumberUS(apiData.monthlyPayment)
        : "",
    fees:
      loadedFeesPercent != null
        ? formatNumberUS(loadedFeesPercent)
        : prev.fees,
    ourRemit:
      apiData.ourRemit != null ? formatNumberUS(apiData.ourRemit) : "",
    totalRemit:
      apiData.totalRemit != null
        ? formatNumberUS(apiData.totalRemit)
        : "",
  };

  const offerNum = parseNum(next.offer);
  const rateNum = parseNum(next.rate);
  const termStr = next.term.trim();

  if (offerNum > 0 && rateNum > 0 && termStr) {
    const stack = deriveOfferRepaymentStack({
      advance: offerNum,
      factorRate: rateNum,
      term: termStr,
      frequency: next.frequency || "Daily",
    });
    if (stack) {
      next = {
        ...next,
        daysWeeks: formatNumberUS(stack.perPeriodPayment),
        monthlyPayment: formatNumberUS(stack.monthlyPayment),
      };
    }
  }

  return next;
}

const OfferDecisionToggle: React.FC<OfferDecisionToggleProps> = (props) => {
  const {
    positions,
    bankTotalRows,
    bankTables,
    bankTotalAvgNetCredit,
    // positionTotalMonthlyPayment,
    offerDecision,
    applicationId,
    onApprove,
    onDecline,
    onCancelEdit,
    onFormOpenChange,
    forceShowForm,
    editMode,
    onRegisterSave,
    onDecisionLoaded,
    editingDeclined,
    disabled,
    // showDecisionButtons = true,
    showFooterActions = true,
    showLeverageTable = true,
    activePositionCountOverride,
    existingRemitOverride,
    totalMonthlyFromPositionsOverride,
    totalDailyFromPositionsOverride,
    onSummaryMetricsChange,
    actionsAtTop = false,
    showPreviewBadge = actionsAtTop,
    onPreviewModeChange,
    aboveOffer,
  } = props;

  const [localData, setLocalData] = useState<OfferFormValue>(() => ({
    ...DEFAULT_FORM_STATE,
    ...(props.value ?? {}),
  }));
  const [showApproveForm, setShowApproveForm] = useState<boolean>(false);
  const [isApproveLoading, setIsApproveLoading] = useState(false);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  // Used to show an inline loading state while we fetch saved decision.
  const [isOfferDecisionLoading, setIsOfferDecisionLoading] = useState(false);
  const [persistedDecision, setPersistedDecision] = useState<
    "approved" | "declined" | null
  >(null);
  /** After save, offer fields stay read-only until user clicks Edit. */
  const [editingApprovedOffer, setEditingApprovedOffer] = useState(false);
  /** Snapshot of offer fields when opening edit on an already-approved offer (for Cancel). */
  const offerSnapshotBeforeEditRef = useRef<OfferFormValue | null>(null);
  const editingApprovedOfferRef = useRef(false);
  /** Skip redundant reload when this instance just saved (emitOfferDecisionUpdated echoes back). */
  const skipNextOfferDecisionReloadRef = useRef(false);

  const lastChangedFieldRef = useRef<
    | "offer"
    | "rate"
    | "term"
    | "frequency"
    | "monthlyPayment"
    | "daysWeeks"
    | "ourRemit"
    | null
  >(null);
  const hasManualOurRemitRef = useRef(false);
  const lastAutoCalcRef = useRef<{
    monthlyPayment?: string;
    daysWeeks?: string;
  }>({});
  const prevApplicationIdRef = useRef<string | null | undefined>(applicationId);

  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCorrectedNotesRef = useRef<string | null>(null);

  // --- Derived metrics (avg net credit, existing remit etc.) ---

  const avgNetCredit = useMemo(() => {
    const direct = parseNum(bankTotalAvgNetCredit);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const fallback = computeFallbackAvgNetCredit(bankTables);
    return fallback ?? NaN;
  }, [bankTotalAvgNetCredit, bankTables]);

  // Existing leverage & repayment totals from positions (shared metrics utility).
  const {
    activeCount: activePositionCountBase,
    existingRemit: existingRemitBase,
    totalMonthlyFromPositions: totalMonthlyFromPositionsBase,
    totalDailyFromPositions: totalDailyFromPositionsBase,
  } = useMemo(() => computePositionMetrics(positions), [positions]);

  const activePositionCount =
    activePositionCountOverride ?? activePositionCountBase;
  const existingRemit = existingRemitOverride ?? existingRemitBase;
  const totalMonthlyFromPositions =
    totalMonthlyFromPositionsOverride ?? totalMonthlyFromPositionsBase;
  const totalDailyFromPositions =
    totalDailyFromPositionsOverride ?? totalDailyFromPositionsBase;

  // If parent provides a controlled value, keep localData in sync.
  useEffect(() => {
    if (!props.value) return;
    if (isSameOfferForm(localData, props.value)) return;
    setLocalData((prev) => {
      if (isSameOfferForm(prev, props.value as OfferFormValue)) return prev;
      return { ...prev, ...(props.value as OfferFormValue) };
    });
  }, [props.value]);

  // Notify parent whenever localData changes so it can persist state.
  useEffect(() => {
    if (!props.onChange) return;
    if (props.value && isSameOfferForm(props.value, localData)) return;
    props.onChange(localData);
  }, [localData, props.onChange, props.value]);

  // When applicationId changes, close the approve form so it does not leak across cases.
  useEffect(() => {
    if (prevApplicationIdRef.current !== applicationId) {
      prevApplicationIdRef.current = applicationId;
      setShowApproveForm(false);
      setPersistedDecision(null);
      setEditingApprovedOffer(false);
      offerSnapshotBeforeEditRef.current = null;
      // Reset form to defaults when switching applications
      setLocalData({ ...DEFAULT_FORM_STATE });
    }
  }, [applicationId]);

  const applyOfferDecisionApiData = useCallback(
    (apiData: Record<string, unknown>) => {
      const decisionValue = (apiData?.decision ??
        apiData?.status ??
        apiData?.offerDecision ??
        apiData?.offer_status ??
        null) as string | null;

      // An "approved" row without an offer amount is a placeholder, not a
      // scrubbed offer — treating it as approved put a fresh deal in Preview.
      const hasOfferAmount = (resolveOfferDecisionFundedAmount(apiData) ?? 0) > 0;
      const normalizedDecision =
        decisionValue === "declined" ||
        (decisionValue === "approved" && hasOfferAmount)
          ? decisionValue
          : null;
      setPersistedDecision(normalizedDecision);

      if (decisionValue === "declined") {
        hasManualOurRemitRef.current = false;
        lastChangedFieldRef.current = null;
        setShowApproveForm(false);
        setEditingApprovedOffer(false);
        setLocalData({ ...DEFAULT_FORM_STATE });
        return;
      }

      setEditingApprovedOffer(false);
      lastChangedFieldRef.current = null;
      hasManualOurRemitRef.current = false;

      setLocalData((prev) =>
        mapApiOfferDecisionToLocalData(apiData, prev),
      );

      if (disabled) {
        const apiOurRemit = apiData.ourRemit ?? "";
        hasManualOurRemitRef.current =
          apiOurRemit != null && String(apiOurRemit).trim() !== "";
      }
    },
    [disabled],
  );

  const reloadOfferDecision = useCallback(async () => {
    if (!applicationId) return;

    setIsOfferDecisionLoading(true);

    try {
      const res = await axiosGet(`/offer-decisions`, {
        params: { application: applicationId },
      });
      const apiData = (res.data && res.data.data) || null;
      if (!apiData) {
        setPersistedDecision(null);
        return;
      }

      applyOfferDecisionApiData(apiData as Record<string, unknown>);
    } catch (error: unknown) {
      console.error("Failed to load existing offer decision:", error);
      toast.error("Failed to load offer decision.");
      setPersistedDecision(null);
    } finally {
      setIsOfferDecisionLoading(false);
    }
  }, [applicationId, applyOfferDecisionApiData]);

  // Load existing offer decision for this application (if any)
  useEffect(() => {
    void reloadOfferDecision();
  }, [reloadOfferDecision]);

  // Real-time sync when approval modal (or elsewhere) saves offer-decision
  useEffect(() => {
    const onOfferDecisionUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ applicationId?: string }>).detail;
      if (!offerDecisionUpdateMatchesApplication(detail?.applicationId, applicationId)) {
        return;
      }
      if (skipNextOfferDecisionReloadRef.current) {
        skipNextOfferDecisionReloadRef.current = false;
        return;
      }
      if (editingApprovedOfferRef.current) return;
      void reloadOfferDecision();
    };

    window.addEventListener(OFFER_DECISION_UPDATED_EVENT, onOfferDecisionUpdated);
    return () => {
      window.removeEventListener(
        OFFER_DECISION_UPDATED_EVENT,
        onOfferDecisionUpdated,
      );
    };
  }, [applicationId, reloadOfferDecision]);

  // Tell the page whether this deal already has an offer, once the load settles.
  useEffect(() => {
    if (isOfferDecisionLoading) return;
    onDecisionLoaded?.(persistedDecision);
  }, [isOfferDecisionLoading, persistedDecision, onDecisionLoaded]);

  const formOpen = showApproveForm || !!forceShowForm;

  useEffect(() => {
    onFormOpenChange?.(formOpen);
  }, [formOpen, onFormOpenChange]);

  editingApprovedOfferRef.current = editingApprovedOffer;

  const effectiveDecision = offerDecision ?? persistedDecision;
  /** Page-level edit mode never overrides an explicit read-only context. */
  const isPageEditing = !!editMode && !disabled;
  /**
   * True when a page-level Edit button owns the lock state. Those screens hide
   * this card's own Edit button: the one at the top unlocks the whole page.
   */
  const pageDrivesEditing = editMode !== undefined;
  const offerInputsLocked =
    effectiveDecision === "approved" &&
    !editingApprovedOffer &&
    !forceShowForm &&
    !isPageEditing;
  const inputsDisabled = !!disabled || offerInputsLocked;
  /** Approved offer saved and not in edit mode — bank analysis / positions should lock too. */
  const isPreviewMode =
    effectiveDecision === "approved" && offerInputsLocked && !disabled;
  /** Preview / read-only contexts (e.g. sheet, operations): show grid layout like approved state, not input boxes. */
  const showReadOnlyOfferGrid = offerInputsLocked || !!disabled;

  useEffect(() => {
    onPreviewModeChange?.(isPreviewMode);
  }, [isPreviewMode, onPreviewModeChange]);

  const setField = useCallback(
    (field: keyof OfferFormValue, rawValue: string) => {
      if (inputsDisabled) return;
      setLocalData((prev) => {
        const next: OfferFormValue = { ...prev, [field]: rawValue };

        if (field === "ourRemit") {
          const trimmed = rawValue.trim();
          hasManualOurRemitRef.current = trimmed !== "";
          lastChangedFieldRef.current = "ourRemit";
        } else if (
          field === "offer" ||
          field === "rate" ||
          field === "term" ||
          field === "frequency" ||
          field === "monthlyPayment" ||
          field === "daysWeeks"
        ) {
          lastChangedFieldRef.current = field;
          // Changing parent drivers resets manual remit override
          hasManualOurRemitRef.current = false;
        }

        return next;
      });
    },
    [inputsDisabled],
  );

  const derivedRepaymentStack = useMemo(() => {
    const offerNum = parseNum(localData.offer);
    const rateNum = parseNum(localData.rate);
    const termStr = localData.term.trim();
    if (!termStr || offerNum <= 0 || rateNum <= 0) return null;
    return deriveOfferRepaymentStack({
      advance: offerNum,
      factorRate: rateNum,
      term: termStr,
      frequency: localData.frequency || "Daily",
    });
  }, [
    localData.offer,
    localData.rate,
    localData.term,
    localData.frequency,
  ]);

  // --- Remit calculation helpers ---

  const ourRemitCalc = useMemo(() => {
    const monthlyRepayNum =
      derivedRepaymentStack?.monthlyPayment ??
      parseNum(localData.monthlyPayment);
    if (!Number.isFinite(monthlyRepayNum) || monthlyRepayNum <= 0) return 0;
    if (!Number.isFinite(avgNetCredit) || avgNetCredit <= 0) return 0;
    return (monthlyRepayNum / avgNetCredit) * 100;
  }, [derivedRepaymentStack, localData.monthlyPayment, avgNetCredit]);

  const ourRemitNumber = parseNum(localData.ourRemit);

  const effectiveOurRemit =
    hasManualOurRemitRef.current && ourRemitNumber > 0
      ? ourRemitNumber
      : ourRemitCalc;

  const displayTotalRemit =
    existingRemit + (effectiveOurRemit > 0 ? effectiveOurRemit : 0);

  const lastEmittedSummaryRef = useRef<{
    activePositions: number;
    existingLeveragePct: number;
    totalLeveragePct: number;
    loading: boolean;
  } | null>(null);

  useEffect(() => {
    if (!onSummaryMetricsChange) return;
    const safeExisting = Number.isFinite(existingRemit) ? existingRemit : 0;
    const safeTotal = Number.isFinite(displayTotalRemit)
      ? displayTotalRemit
      : safeExisting;

    const payload = {
      activePositions: activePositionCount,
      existingLeveragePct: safeExisting,
      totalLeveragePct: safeTotal,
      loading: isOfferDecisionLoading,
    };

    const last = lastEmittedSummaryRef.current;
    const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 1e-6;

    if (
      last &&
      last.activePositions === payload.activePositions &&
      last.loading === payload.loading &&
      nearlyEqual(last.existingLeveragePct, payload.existingLeveragePct) &&
      nearlyEqual(last.totalLeveragePct, payload.totalLeveragePct)
    ) {
      return;
    }

    lastEmittedSummaryRef.current = payload;
    onSummaryMetricsChange(payload);
  }, [
    onSummaryMetricsChange,
    activePositionCount,
    existingRemit,
    displayTotalRemit,
    isOfferDecisionLoading,
  ]);

  // Keep localData.totalRemit in sync whenever effective remit changes.
  useEffect(() => {
    if (offerInputsLocked) return;
    const calculated =
      existingRemit + (effectiveOurRemit > 0 ? effectiveOurRemit : 0);
    const totalRemitStr = calculated > 0 ? calculated.toFixed(2) : "";

    setLocalData((prev) => {
      if (prev.totalRemit === totalRemitStr) return prev;
      return { ...prev, totalRemit: totalRemitStr };
    });
  }, [existingRemit, effectiveOurRemit, offerInputsLocked]);

  // --- Core bidirectional offer/repayment calculations ---

  useEffect(() => {
    if (offerInputsLocked) return;
    const {
      offer,
      rate,
      term,
      frequency,
      monthlyPayment,
      daysWeeks,
      ourRemit,
    } = localData;

    const offerNum = parseNum(offer);
    const rateNum = parseNum(rate);
    const termNum = parseNum(term);
    const monthlyNum = parseNum(monthlyPayment);
    const daysWeeksNum = parseNum(daysWeeks);
    const ourRemitNum = parseNum(ourRemit);

    const hasValidRateTerm =
      !Number.isNaN(rateNum) &&
      rateNum > 0 &&
      !Number.isNaN(termNum) &&
      termNum > 0;

    const hasValidOfferRateTerm =
      hasValidRateTerm && !Number.isNaN(offerNum) && offerNum > 0;

    const avgNetCreditNum = avgNetCredit;
    const lastChanged = lastChangedFieldRef.current;

    const freqForCalc: Frequency =
      frequency === "Weekly"
        ? "Weekly"
        : frequency === "Bi-Weekly"
          ? "Bi-Weekly"
          : frequency === "Monthly"
            ? "Monthly"
            : "Daily";

    // --- Case A: user edits Our Remit (solve for monthly and offer) ---
    if (
      lastChanged === "ourRemit" &&
      hasValidRateTerm &&
      ourRemitNum > 0 &&
      Number.isFinite(avgNetCreditNum) &&
      avgNetCreditNum > 0
    ) {
      const newMonthlyNum = (ourRemitNum / 100) * avgNetCreditNum;

      // Current project model:
      // Daily monthly uses special rule when term < 22.
      const perPeriodFromMonthly =
        freqForCalc === "Daily"
          ? (termNum < 22 ? newMonthlyNum / termNum : newMonthlyNum / 22)
          : freqForCalc === "Weekly"
            ? newMonthlyNum / WEEKLY_TO_MONTHLY_FACTOR
            : freqForCalc === "Bi-Weekly"
              ? newMonthlyNum / BIWEEKLY_TO_MONTHLY_FACTOR
              : newMonthlyNum;
      const totalRepayment = perPeriodFromMonthly * termNum;
      const newOfferNum = totalRepayment / rateNum;

      if (!Number.isFinite(newOfferNum) || newOfferNum <= 0) {
        return;
      }

      const newMonthlyStr = formatNumberUS(newMonthlyNum);

      // Derive per‑period payment from monthly based on frequency
      let perPeriodPayment = 0;
      if (freqForCalc === "Daily") {
        perPeriodPayment = newMonthlyNum / 22;
      } else if (freqForCalc === "Weekly") {
        perPeriodPayment = newMonthlyNum / WEEKLY_TO_MONTHLY_FACTOR;
      } else if (freqForCalc === "Bi-Weekly") {
        perPeriodPayment = newMonthlyNum / BIWEEKLY_TO_MONTHLY_FACTOR;
      } else {
        perPeriodPayment = newMonthlyNum;
      }

      const newDaysWeeksStr = formatNumberUS(perPeriodPayment);

      lastAutoCalcRef.current = {
        monthlyPayment: newMonthlyStr,
        daysWeeks: newDaysWeeksStr,
      };

      setLocalData((prev) => {
        const next: OfferFormValue = {
          ...prev,
          offer: formatNumberUS(newOfferNum),
          monthlyPayment: newMonthlyStr,
          daysWeeks: newDaysWeeksStr,
          frequency: prev.frequency || ("Daily" as Frequency),
        };
        return next;
      });
      return;
    }

    // --- Case B: user edits Monthly Payment ---
    if (
      lastChanged === "monthlyPayment" &&
      hasValidRateTerm &&
      monthlyNum > 0
    ) {
      hasManualOurRemitRef.current = false;

      const freqMonthly: Frequency =
        frequency === "Weekly"
          ? "Weekly"
          : frequency === "Bi-Weekly"
            ? "Bi-Weekly"
            : frequency === "Monthly"
              ? "Monthly"
              : "Daily";

      // Current project model:
      // Daily: if term < 22, monthly equals total repayment; else repay * 22.
      const perPeriodPayment =
        freqMonthly === "Daily"
          ? termNum < 22
            ? monthlyNum / termNum
            : monthlyNum / 22
          : freqMonthly === "Weekly"
            ? monthlyNum / WEEKLY_TO_MONTHLY_FACTOR
            : freqMonthly === "Bi-Weekly"
              ? monthlyNum / BIWEEKLY_TO_MONTHLY_FACTOR
              : monthlyNum;
      const totalRepayment = perPeriodPayment * termNum;

      const newOfferNum = totalRepayment / rateNum;

      if (!Number.isFinite(newOfferNum) || newOfferNum <= 0) {
        return;
      }

      let ourRemitFromMonthly: number | null = null;
      if (Number.isFinite(avgNetCreditNum) && avgNetCreditNum > 0) {
        ourRemitFromMonthly = (monthlyNum / avgNetCreditNum) * 100;
      }

      const monthlyPaymentStr = formatNumberUS(monthlyNum);
      const perPeriodStr = formatNumberUS(perPeriodPayment);

      lastAutoCalcRef.current = {
        monthlyPayment: monthlyPaymentStr,
        daysWeeks: perPeriodStr,
      };

      setLocalData((prev) => {
        const next: OfferFormValue = {
          ...prev,
          offer: formatNumberUS(newOfferNum),
          monthlyPayment: monthlyPaymentStr,
          daysWeeks: perPeriodStr,
          ourRemit:
            ourRemitFromMonthly != null
              ? formatNumberUS(ourRemitFromMonthly)
              : prev.ourRemit,
        };
        return next;
      });
      return;
    }

    // --- Case C: user edits Daily/Weekly Repay (daysWeeks) ---
    if (lastChanged === "daysWeeks" && hasValidRateTerm && daysWeeksNum > 0) {
      hasManualOurRemitRef.current = false;
      const freqDays: Frequency =
        frequency === "Weekly"
          ? "Weekly"
          : frequency === "Bi-Weekly"
            ? "Bi-Weekly"
            : frequency === "Monthly"
              ? "Monthly"
              : "Daily";

      // daysWeeksNum is the per‑period payment
      const totalRepayment = daysWeeksNum * termNum;
      const newOfferNum = totalRepayment / rateNum;

      if (!Number.isFinite(newOfferNum) || newOfferNum <= 0) {
        return;
      }

      // Convert per‑period back to a monthly equivalent
      let newMonthlyNumForRemit = 0;
      if (freqDays === "Daily") {
        newMonthlyNumForRemit = termNum < 22 ? totalRepayment : daysWeeksNum * 22;
      } else if (freqDays === "Weekly") {
        newMonthlyNumForRemit = daysWeeksNum * WEEKLY_TO_MONTHLY_FACTOR;
      } else if (freqDays === "Bi-Weekly") {
        newMonthlyNumForRemit = daysWeeksNum * BIWEEKLY_TO_MONTHLY_FACTOR;
      } else {
        newMonthlyNumForRemit = daysWeeksNum;
      }

      const newMonthlyStr = formatNumberUS(newMonthlyNumForRemit);

      let ourRemitFromMonthly: number | null = null;
      if (
        Number.isFinite(avgNetCreditNum) &&
        avgNetCreditNum > 0 &&
        newMonthlyNumForRemit > 0
      ) {
        ourRemitFromMonthly = (newMonthlyNumForRemit / avgNetCreditNum) * 100;
      }

      lastAutoCalcRef.current = {
        monthlyPayment: newMonthlyStr,
        daysWeeks: formatNumberUS(daysWeeksNum),
      };

      setLocalData((prev) => {
        const next: OfferFormValue = {
          ...prev,
          offer: formatNumberUS(newOfferNum),
          monthlyPayment: newMonthlyStr,
          daysWeeks: formatNumberUS(daysWeeksNum),
          ourRemit:
            ourRemitFromMonthly != null
              ? formatNumberUS(ourRemitFromMonthly)
              : prev.ourRemit,
        };
        return next;
      });
      return;
    }

    // --- Case D: user edits Offer / Rate / Term / Frequency ---
    const offerRateTermInvalid = !hasValidOfferRateTerm;

    if (
      offerRateTermInvalid &&
      (lastChanged === "offer" ||
        lastChanged === "rate" ||
        lastChanged === "term")
    ) {
      setLocalData((prev) => {
        if (prev.monthlyPayment === "" && prev.daysWeeks === "") {
          return prev;
        }
        const next: OfferFormValue = {
          ...prev,
          monthlyPayment: "",
          daysWeeks: "",
        };
        return next;
      });
      // fall through to sync block
    } else if (hasValidOfferRateTerm) {
      hasManualOurRemitRef.current = false;
      lastChangedFieldRef.current = null;

      const stack = deriveOfferRepaymentStack({
        advance: offerNum,
        factorRate: rateNum,
        term: String(termNum),
        frequency: frequency || "Daily",
      });

      if (!stack) return;

      const newDaysWeeks = formatNumberUS(stack.perPeriodPayment);
      const newMonthlyPayment = formatNumberUS(stack.monthlyPayment);

      const shouldSetOurRemit =
        lastChanged !== "ourRemit" &&
        stack.monthlyPayment > 0 &&
        Number.isFinite(avgNetCreditNum) &&
        avgNetCreditNum > 0;

      const autoOurRemitStr = shouldSetOurRemit
        ? formatNumberUS((stack.monthlyPayment / avgNetCreditNum) * 100)
        : null;

      lastAutoCalcRef.current = {
        monthlyPayment: newMonthlyPayment,
        daysWeeks: newDaysWeeks,
      };

      setLocalData((prev) => {
        const next: OfferFormValue = {
          ...prev,
          monthlyPayment: newMonthlyPayment,
          daysWeeks: newDaysWeeks,
          ourRemit: autoOurRemitStr != null ? autoOurRemitStr : prev.ourRemit,
        };
        return next;
      });
      return;
    }

    // --- Sync block & remit reset logic ---
    const monthlyNumSync = parseNum(localData.monthlyPayment);
    const avgNetCreditNumSync = avgNetCredit;
    const ourRemitCleared = (localData.ourRemit ?? "").trim() === "";

    if (ourRemitCleared) {
      hasManualOurRemitRef.current = false;
    }

    if (
      !Number.isNaN(monthlyNumSync) &&
      monthlyNumSync > 0 &&
      Number.isFinite(avgNetCreditNumSync) &&
      avgNetCreditNumSync > 0 &&
      !hasManualOurRemitRef.current
    ) {
      const autoRemit = (monthlyNumSync / avgNetCreditNumSync) * 100;
      const autoRemitStr = autoRemit > 0 ? formatNumberUS(autoRemit) : "";
      if (autoRemitStr && autoRemitStr !== localData.ourRemit) {
        setLocalData((prev) => {
          const next: OfferFormValue = {
            ...prev,
            ourRemit: autoRemitStr,
          };
          return next;
        });
      }
    }
  }, [
    localData.offer,
    localData.rate,
    localData.term,
    localData.frequency,
    localData.monthlyPayment,
    localData.daysWeeks,
    localData.ourRemit,
    avgNetCredit,
    offerInputsLocked,
  ]);

  // --- Notes: debounce + grammar auto-correct ---

  useEffect(() => {
    if (offerInputsLocked) {
      if (notesDebounceRef.current) {
        clearTimeout(notesDebounceRef.current);
        notesDebounceRef.current = null;
      }
      return;
    }
    const text = localData.notes;

    if (notesDebounceRef.current) {
      clearTimeout(notesDebounceRef.current);
      notesDebounceRef.current = null;
    }

    if (!text || !text.trim()) {
      lastCorrectedNotesRef.current = null;
      return;
    }

    if (lastCorrectedNotesRef.current === text) {
      return;
    }

    notesDebounceRef.current = setTimeout(async () => {
      const corrected = await checkAndCorrectWithLanguageTool(text, "en-US");
      if (!corrected || corrected === text) {
        lastCorrectedNotesRef.current = text;
        return;
      }
      lastCorrectedNotesRef.current = corrected;
      setLocalData((prev) => {
        if (prev.notes === corrected) return prev;
        return {
          ...prev,
          notes: corrected,
        };
      });
    }, GRAMMAR_DEBOUNCE_MS);

    return () => {
      if (notesDebounceRef.current) {
        clearTimeout(notesDebounceRef.current);
        notesDebounceRef.current = null;
      }
    };
  }, [localData.notes, offerInputsLocked]);

  // --- Decision buttons & actions ---

  const isEditingDecision =
    !!forceShowForm ||
    !!editingDeclined ||
    (effectiveDecision === "approved" && editingApprovedOffer);
  const hasDecision =
    effectiveDecision === "approved" || effectiveDecision === "declined";

  // const isApprovedButtonDisabled =
  //   !!disabled || (!isEditingDecision && hasDecision);
  const isDeclinedButtonDisabled =
    !!disabled || (!isEditingDecision && hasDecision);

  // If parent indicates this offer was declined, clear editable fields.
  // Keep "editingDeclined" intact so parent flows that re-edit declined decisions
  // can still display needed data.
  useEffect(() => {
    if (effectiveDecision === "declined" && !editingDeclined) {
      hasManualOurRemitRef.current = false;
      lastChangedFieldRef.current = null;
      offerSnapshotBeforeEditRef.current = null;
      setShowApproveForm(false);
      setEditingApprovedOffer(false);
      setLocalData({ ...DEFAULT_FORM_STATE });
    }
  }, [effectiveDecision, editingDeclined]);

  // const handleApproveClick = () => {
  //   if (isApprovedButtonDisabled) return;
  //   setShowApproveForm((prev) => !prev);
  // };

  const handleDeclineClick = () => {
    if (isDeclinedButtonDisabled) return;
    setIsDeclineModalOpen(true);
  };

  // Runs after RejectApplicationModal's rejectApplication succeeds: keep the
  // offer-decision record + local offer form in sync with the rejected state.
  const handleAfterReject = async (reason: string) => {
    const trimmed = reason.trim();

    if (applicationId) {
      try {
        await axiosPost("/offer-decisions/decline", {
          applicationId,
          declineReason: trimmed,
          decision: "declined",
        });
      } catch (error: unknown) {
        console.error("Failed to persist offer decline:", error);
      }
    }

    if (onDecline) {
      const maybePromise = onDecline(trimmed);
      if (maybePromise && typeof (maybePromise as any).then === "function") {
        await maybePromise;
      }
    }

    // Clear editable fields after a decline.
    hasManualOurRemitRef.current = false;
    lastChangedFieldRef.current = null;
    offerSnapshotBeforeEditRef.current = null;
    setLocalData({ ...DEFAULT_FORM_STATE });
    setShowApproveForm(false);
    setPersistedDecision("declined");
  };

  /**
   * Matches mca-tool: every offer field is optional, so the only thing that can
   * block a save is a missing application id. Blank fields are persisted as
   * null rather than disabling the button.
   */
  const canApproveOffer = useMemo(() => Boolean(applicationId), [applicationId]);

  /** Returns true when the offer was persisted, so the page toolbar can stop on failure. */
  const handleApproveSave = async (): Promise<boolean> => {
    if (!applicationId) {
      toast.error("Missing application id. Please reload and try again.");
      return false;
    }
    if (!canApproveOffer) return false;
    try {
      setIsApproveLoading(true);

      if (onApprove) {
        const preSaveResult = await onApprove(localData);
        if (preSaveResult === false) {
          return false;
        }
      }

      const feesDollarsForDb = feesPercentToDollarsFromFunded(
        localData.offer,
        localData.fees,
      );

      const payload = {
        applicationId,
        decision: "approved" as const,
        position: localData.position || null,
        offer: parseNum(localData.offer) || null,
        rate: parseNum(localData.rate) || null,
        term: parseNum(localData.term) || null,
        frequency: localData.frequency || null,
        repayPerPeriod: parseNum(localData.daysWeeks) || null,
        monthlyPayment: parseNum(localData.monthlyPayment) || null,
        fees: feesDollarsForDb,
        ourRemit: parseNum(localData.ourRemit) || null,
        totalRemit: parseNum(localData.totalRemit) || null,
      };

      const saveRes = await axiosPost("/offer-decisions", payload);
      const saved = (saveRes?.data && saveRes.data.data) || null;

      if (saved) {
        const savedFunded = resolveOfferDecisionFundedAmount(
          saved as Record<string, unknown>,
        );
        const savedFeesPercent = resolveOfferFeesPercentForForm(
          savedFunded,
          saved.rate,
          resolveOfferDecisionFeesRaw(saved as Record<string, unknown>),
        );

        setLocalData((prev) => ({
          ...prev,
          position: saved.position ?? "",
          offer:
            savedFunded != null ? formatNumberUS(savedFunded) : "",
          rate:
            saved.rate != null
              ? formatRateUS(saved.rate)
              : DEFAULT_OFFER_RATE,
          term: saved.term != null ? String(saved.term) : "",
          frequency: saved.frequency ?? "",
          daysWeeks:
            saved.repayPerPeriod != null
              ? formatNumberUS(saved.repayPerPeriod)
              : "",
          monthlyPayment:
            saved.monthlyPayment != null
              ? formatNumberUS(saved.monthlyPayment)
              : "",
          fees:
            savedFeesPercent != null
              ? formatNumberUS(savedFeesPercent)
              : prev.fees,
          ourRemit:
            saved.ourRemit != null ? formatNumberUS(saved.ourRemit) : "",
          totalRemit:
            saved.totalRemit != null ? formatNumberUS(saved.totalRemit) : "",
        }));
      }

      setPersistedDecision("approved");
      setEditingApprovedOffer(false);
      offerSnapshotBeforeEditRef.current = null;

      // Ensure the OFFER form/section remains visible after saving
      setShowApproveForm(true);

      skipNextOfferDecisionReloadRef.current = true;
      emitOfferDecisionUpdated(applicationId);

      toast.success("Offer saved successfully.");
      return true;
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to save offer. Please try again.";
      console.error("Approve & Save offer failed:", error);
      toast.error(message);
      return false;
    } finally {
      setIsApproveLoading(false);
    }
  };

  /**
   * Save hook for the page-level Edit/Save toolbar. Re-saves an already
   * approved offer so edits made in page edit mode are persisted; for a case
   * with no approved decision it does nothing and reports success, because
   * Save must never turn into an approval.
   */
  const saveFromPageToolbar = useCallback(async (): Promise<boolean> => {
    if (effectiveDecision !== "approved") return true;
    if (!canApproveOffer) return true;
    return await handleApproveSaveRef.current();
  }, [effectiveDecision, canApproveOffer]);

  const handleApproveSaveRef = useRef(handleApproveSave);
  handleApproveSaveRef.current = handleApproveSave;

  useEffect(() => {
    onRegisterSave?.(saveFromPageToolbar);
  }, [onRegisterSave, saveFromPageToolbar]);

  const handleStartEditApprovedOffer = () => {
    offerSnapshotBeforeEditRef.current = { ...localData };
    setEditingApprovedOffer(true);
  };

  const handleCancelEditApprovedOffer = () => {
    const snap = offerSnapshotBeforeEditRef.current;
    offerSnapshotBeforeEditRef.current = null;
    setEditingApprovedOffer(false);
    if (snap) {
      setLocalData({ ...snap });
      const trimmed = (snap.ourRemit ?? "").trim();
      hasManualOurRemitRef.current = trimmed !== "";
      lastChangedFieldRef.current = null;
    }
    onCancelEdit?.();
  };

  const totalRepaymentDisplay =
    derivedRepaymentStack && derivedRepaymentStack.payback > 0
      ? formatNumberUS(derivedRepaymentStack.payback)
      : "";

  const perPeriodRepayDisplay =
    derivedRepaymentStack && derivedRepaymentStack.perPeriodPayment > 0
      ? formatNumberUS(derivedRepaymentStack.perPeriodPayment)
      : "";

  const monthlyPaymentDisplay =
    derivedRepaymentStack && derivedRepaymentStack.monthlyPayment > 0
      ? formatNumberUS(derivedRepaymentStack.monthlyPayment)
      : "";

  /**
   * Our Position = positions still outstanding + 1, derived from the live
   * positions list - never the stored offer field, which goes stale as soon as
   * a position is added or paid off. Same rule as the preview and the PDF.
   */
  const ourPositionDisplay = String(
    getExistingActivePositionsCount(positions) + 1,
  );

  const offerDisplay = formatCurrencyDisplayValue(localData.offer);

  const commitCurrencyField = useCallback(
    (field: "offer" | "daysWeeks" | "monthlyPayment", rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed) return;
      const num = parseNum(trimmed);
      if (!Number.isFinite(num)) return;
      setField(field, formatNumberUS(num));
    },
    [setField],
  );

  const showActionRow = showFooterActions;
  const renderDecisionActions = () => {
    if (!showActionRow) return null;

    return (
      <div className="flex flex-wrap items-center gap-3">
        {showPreviewBadge && isPreviewMode && (
          <Badge
            variant="secondary"
            className="border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            Preview mode
          </Badge>
        )}
        {effectiveDecision === "approved" &&
        !editingApprovedOffer &&
        !forceShowForm &&
        !pageDrivesEditing ? (
          <>
            <button
              type="button"
              onClick={handleStartEditApprovedOffer}
              disabled={!!disabled}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                disabled
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                  : "cursor-pointer border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              Edit
            </button>
            <div
              role="status"
              className="px-6 py-2 bg-[#00b377] text-white rounded-lg text-sm font-semibold shadow-md select-none cursor-default"
            >
              Approved
            </div>
          </>
        ) : (
          <>
            {effectiveDecision === "approved" &&
              editingApprovedOffer &&
              !forceShowForm && (
                <button
                  type="button"
                  onClick={handleCancelEditApprovedOffer}
                  disabled={!!disabled || isApproveLoading}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                    disabled || isApproveLoading
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                      : "cursor-pointer border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-[#141517] dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  Cancel
                </button>
              )}
            <button
              type="button"
              onClick={handleDeclineClick}
              disabled={isDeclinedButtonDisabled}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                isDeclinedButtonDisabled
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-[#ff4d4d] text-white hover:bg-[#e64545] cursor-pointer"
              }`}
            >
              Declined
            </button>
            <button
              type="button"
              onClick={handleApproveSave}
              disabled={
                isApproveLoading || !!disabled || !canApproveOffer
              }
              className={`px-6 py-2 rounded-lg text-sm font-semibold shadow-lg transition-all ${
                (!canApproveOffer && !isApproveLoading) || !!disabled
                  ? "bg-[#00b377]/50 text-white/90 cursor-not-allowed"
                  : "bg-[#00b377] text-white cursor-pointer hover:bg-[#009e69] transform hover:-translate-y-0.5"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {isApproveLoading ? "Saving..." : "Scrubbed & Saved"}
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full font-sans text-slate-700 dark:text-slate-200">
      {isOfferDecisionLoading && (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-white/70 dark:bg-[#141517]/80">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 dark:border-slate-600 dark:border-t-slate-100" />
            Loading offer...
          </div>
        </div>
      )}
      {/* ACTION BUTTONS */}

      <div className="animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="space-y-4">
          <div className="min-w-0 space-y-3">
            {actionsAtTop && renderDecisionActions()}
            {aboveOffer}
            <div data-scrub-type className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-md dark:border-slate-700 dark:bg-[#141517]">
              {/* Wd preview's OFFER bar: sage #5f9a60 under a green veil, centred 16px/700. */}
              <div
                className="scrub-offer-bar px-4 py-1.5 text-center text-[16px] font-bold uppercase text-white"
                style={{ backgroundColor: "#5f9a60", backgroundImage: SCRUB_GREEN_VEIL }}
              >
                {effectiveDecision === "approved" ? "Approved" : "Offer"}
              </div>

              {showReadOnlyOfferGrid ? (
                <div className="@container border-t border-[#d8dde3] dark:border-slate-700">
                  <div className="grid grid-cols-1 md:grid-cols-3">
                    {/*
                      3×3 layout (rows): Offer | Repayment | Term → Rate | Our Position | Frequency → Repay | Monthly payment | Fees
                    */}
                    <div className="grid min-h-[56px] grid-cols-1 content-center gap-y-1 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:items-center @4xl:gap-x-3 border-b border-[#d8dde3] bg-white px-4 py-4 dark:border-slate-700 dark:bg-[#141517] md:border-r md:[&:nth-child(3n)]:border-r-0">
                      <span className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Offer
                      </span>
                      <span className="text-left text-[15px] font-bold tabular-nums text-[#0caa46]">
                        {offerDisplay ? `$ ${offerDisplay}` : "—"}
                      </span>
                    </div>
                    <div className="grid min-h-[56px] grid-cols-1 content-center gap-y-1 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:items-center @4xl:gap-x-3 border-b border-[#d8dde3] bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/40 md:border-r md:[&:nth-child(3n)]:border-r-0">
                      <span className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Repayment
                      </span>
                      <span className="text-left text-[15px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                        {totalRepaymentDisplay
                          ? `$ ${totalRepaymentDisplay}`
                          : "—"}
                      </span>
                    </div>
                    <div className="grid min-h-[56px] grid-cols-1 content-center gap-y-1 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:items-center @4xl:gap-x-3 border-b border-[#d8dde3] bg-white px-4 py-4 dark:border-slate-700 dark:bg-[#141517] md:border-r md:[&:nth-child(3n)]:border-r-0">
                      <span className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Term
                      </span>
                      <span className="text-left text-[15px] font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {localData.term.trim() ? localData.term : "—"}
                      </span>
                    </div>
                    <div className="grid min-h-[56px] grid-cols-1 content-center gap-y-1 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:items-center @4xl:gap-x-3 border-b border-[#d8dde3] bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/40 md:border-r md:[&:nth-child(3n)]:border-r-0">
                      <span className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Rate
                      </span>
                      <span className="text-left text-[15px] font-bold tabular-nums text-[#1e3a8a] dark:text-blue-200">
                        {localData.rate.trim() ? localData.rate : "—"}
                      </span>
                    </div>
                    <div className="grid min-h-[56px] grid-cols-1 content-center gap-y-1 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:items-center @4xl:gap-x-3 border-b border-[#d8dde3] bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/40 md:border-r md:[&:nth-child(3n)]:border-r-0">
                      <span className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Our Position
                      </span>
                      <span className="text-left text-[15px] font-bold tabular-nums text-[#1e3a8a] dark:text-blue-200">
                        {ourPositionDisplay}
                      </span>
                    </div>
                    <div className="grid min-h-[56px] grid-cols-1 content-center gap-y-1 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:items-center @4xl:gap-x-3 border-b border-[#d8dde3] bg-white px-4 py-4 dark:border-slate-700 dark:bg-[#141517] md:border-r md:[&:nth-child(3n)]:border-r-0">
                      <span className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Frequency
                      </span>
                      <span className="text-left text-[16px] font-bold text-[#3d5c86] dark:text-slate-100">
                        {(localData.frequency || "").trim() || "—"}
                      </span>
                    </div>
                    <div className="grid min-h-[56px] grid-cols-1 content-center gap-y-1 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:items-center @4xl:gap-x-3 border-b border-[#d8dde3] bg-white px-4 py-4 dark:border-slate-700 dark:bg-[#141517] md:border-r md:[&:nth-child(3n)]:border-r-0">
                      <span className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Repay
                      </span>
                      <span className="text-left text-[15px] font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {perPeriodRepayDisplay
                          ? `$ ${perPeriodRepayDisplay}`
                          : localData.daysWeeks.trim()
                            ? `$ ${formatCurrencyDisplayValue(localData.daysWeeks)}`
                            : "—"}
                      </span>
                    </div>
                    <div className="grid min-h-[56px] grid-cols-1 content-center gap-y-1 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:items-center @4xl:gap-x-3 border-b border-[#d8dde3] bg-white px-4 py-4 dark:border-slate-700 dark:bg-[#141517] md:border-r md:[&:nth-child(3n)]:border-r-0">
                      <span className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Monthly payment
                      </span>
                      <span className="text-left text-[15px] font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {monthlyPaymentDisplay
                          ? `$ ${monthlyPaymentDisplay}`
                          : localData.monthlyPayment.trim()
                            ? `$ ${formatCurrencyDisplayValue(localData.monthlyPayment)}`
                            : "—"}
                      </span>
                    </div>
                    <div className="grid min-h-[56px] grid-cols-1 content-center gap-y-1 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:items-center @4xl:gap-x-3 border-b border-[#d8dde3] bg-white px-4 py-4 dark:border-slate-700 dark:bg-[#141517] md:border-r md:[&:nth-child(3n)]:border-r-0">
                      <span className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Fees
                      </span>
                      <span className="text-left text-[15px] font-bold tabular-nums text-[#1e3a8a] dark:text-blue-200">
                        {localData.fees.trim() ? `${localData.fees}%` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-t-0 border-[rgb(100_100_100)] dark:border-slate-700">
                  <div className="grid grid-cols-1 md:grid-cols-3">
                    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 border-b border-[#94a3b8] bg-white px-2 py-1 dark:border-slate-700 dark:bg-[#141517] md:border-r md:border-r-[#94a3b8] md:[&:nth-child(3n)]:border-r-0">
                      <label className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Offer
                      </label>
                      <div className="relative min-w-0">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                          $
                        </span>
                        <input
                          className="w-full min-w-0 rounded-md border border-slate-200 bg-white py-1.5 pl-6 pr-3 text-[16px] font-bold text-[#0caa46] outline-none focus:border-[#86b186] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:placeholder:text-slate-500"
                          placeholder="offer"
                          value={localData.offer}
                          onChange={(e) =>
                            setField(
                              "offer",
                              formatNumberUSForInput(e.target.value),
                            )
                          }
                          onBlur={(e) =>
                            commitCurrencyField("offer", e.target.value)
                          }
                          disabled={inputsDisabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-[12rem_1fr] items-center gap-x-3 border-b border-[#94a3b8] bg-white px-2 py-1 dark:border-slate-700 dark:bg-[#141517] md:border-r md:border-r-[#94a3b8] md:[&:nth-child(3n)]:border-r-0">
                      <label className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Repayment
                      </label>
                      <div className="relative min-w-0">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                          $
                        </span>
                        <input
                          className="w-full min-w-0 rounded-md border border-slate-200 bg-slate-100 py-1.5 pl-6 pr-3 text-[16px] font-bold text-slate-500 outline-none dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
                          value={totalRepaymentDisplay}
                          readOnly
                          placeholder="-"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 border-b border-[#94a3b8] bg-white px-2 py-1 dark:border-slate-700 dark:bg-[#141517] md:border-r md:border-r-[#94a3b8] md:[&:nth-child(3n)]:border-r-0">
                      <label className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Term
                      </label>
                      <input
                        className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[16px] font-bold text-[#3d5c86] outline-none focus:border-[#86b186] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                        placeholder="term"
                        value={localData.term}
                        onChange={(e) =>
                          setField("term", sanitizeDecimalInput(e.target.value))
                        }
                        disabled={inputsDisabled}
                      />
                    </div>
                    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 border-b border-[#94a3b8] bg-white px-2 py-1 dark:border-slate-700 dark:bg-[#141517] md:border-r md:border-r-[#94a3b8] md:[&:nth-child(3n)]:border-r-0">
                      <label className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Rate
                      </label>
                      <input
                        className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[16px] font-bold text-[#3d5c86] outline-none focus:border-[#86b186] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-blue-200 dark:placeholder:text-slate-500"
                        placeholder={DEFAULT_OFFER_RATE}
                        value={localData.rate}
                        onChange={(e) =>
                          setField("rate", sanitizeDecimalInput(e.target.value))
                        }
                        disabled={inputsDisabled}
                      />
                    </div>
                    <div className="grid grid-cols-[12rem_1fr] items-center gap-x-3 border-b border-[#94a3b8] bg-white px-2 py-1 dark:border-slate-700 dark:bg-[#141517] md:border-r md:border-r-[#94a3b8] md:[&:nth-child(3n)]:border-r-0">
                      <label className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Our Position
                      </label>
                      <input
                        className="w-full min-w-0 rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-[16px] font-bold text-[#3d5c86] outline-none focus:border-[#86b186] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800/80 dark:text-blue-200 dark:placeholder:text-slate-500"
                        value={localData.position}
                        onChange={(e) => setField("position", e.target.value)}
                        placeholder="e.g. 2"
                        disabled={inputsDisabled}
                      />
                    </div>
                    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 border-b border-[#94a3b8] bg-white px-2 py-1 dark:border-slate-700 dark:bg-[#141517] md:border-r md:border-r-[#94a3b8] md:[&:nth-child(3n)]:border-r-0">
                      <label className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Frequency
                      </label>
                      <select
                        className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[16px] font-bold text-[#3d5c86] outline-none focus:border-[#86b186] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        value={localData.frequency || ""}
                        onChange={(e) =>
                          setField("frequency", e.target.value as Frequency)
                        }
                        disabled={inputsDisabled}
                      >
                        <option value="">Select</option>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Bi-Weekly">Bi-Weekly</option>
                        <option value="Monthly">Monthly</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 border-b border-[#94a3b8] bg-white px-2 py-1 dark:border-slate-700 dark:bg-[#141517] md:border-r md:border-r-[#94a3b8] md:[&:nth-child(3n)]:border-r-0">
                      <label className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Repay
                      </label>
                      <div className="relative min-w-0">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                          $
                        </span>
                        <input
                          className="w-full min-w-0 rounded-md border border-slate-200 bg-white py-1.5 pl-6 pr-3 text-[16px] font-bold text-[#3d5c86] outline-none focus:border-[#86b186] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          placeholder="repay per period"
                          value={localData.daysWeeks}
                          onChange={(e) =>
                            setField(
                              "daysWeeks",
                              formatNumberUSForInput(e.target.value),
                            )
                          }
                          onBlur={(e) =>
                            commitCurrencyField("daysWeeks", e.target.value)
                          }
                          disabled={inputsDisabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-[12rem_1fr] items-center gap-x-3 border-b border-[#94a3b8] bg-white px-2 py-1 dark:border-slate-700 dark:bg-[#141517] md:border-r md:border-r-[#94a3b8] md:[&:nth-child(3n)]:border-r-0">
                      <label className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Monthly payment
                      </label>
                      <div className="relative min-w-0">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                          $
                        </span>
                        <input
                          className="w-full min-w-0 rounded-md border border-slate-200 bg-white py-1.5 pl-6 pr-3 text-[16px] font-bold text-[#3d5c86] outline-none focus:border-[#86b186] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          placeholder="amount"
                          value={localData.monthlyPayment}
                          onChange={(e) =>
                            setField(
                              "monthlyPayment",
                              formatNumberUSForInput(e.target.value),
                            )
                          }
                          onBlur={(e) =>
                            commitCurrencyField(
                              "monthlyPayment",
                              e.target.value,
                            )
                          }
                          disabled={inputsDisabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 border-b border-[#94a3b8] bg-white px-2 py-1 dark:border-slate-700 dark:bg-[#141517] md:border-r md:border-r-[#94a3b8] md:[&:nth-child(3n)]:border-r-0">
                      <label className="text-[16px] font-medium text-slate-800 dark:text-slate-300">
                        Fees
                      </label>
                      <div className="relative min-w-0">
                        <input
                          className="w-full min-w-0 rounded-md border border-slate-200 bg-white py-2 pl-3 pr-7 text-[16px] font-bold text-[#3d5c86] outline-none focus:border-[#86b186] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-blue-200"
                          value={localData.fees}
                          onChange={(e) =>
                            setField("fees", sanitizeDecimalInput(e.target.value))
                          }
                          disabled={inputsDisabled}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* <div className="col-span-1 md:col-span-3 mt-1">
                <label className="text-sm font-semibold text-slate-700 block mb-2">
                  Notes
                </label>
                <div className="relative">
                  <textarea
                    id="offer-notes-textarea"
                    className="w-full border border-slate-200 rounded-md p-3 outline-none focus:border-[#86b186] min-h-[68px] resize-none text-sm"
                    placeholder="notes (Press Enter for bullets)"
                    value={localData.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                    onKeyDown={handleNotesKeyDown}
                    disabled={disabled}
                  />
                  {isNotesChecking && (
                    <div className="absolute bottom-2 right-3 text-[11px] text-slate-400 bg-white/80 px-2 py-0.5 rounded-full">
                      Checking...
                    </div>
                  )}
                </div>
              </div> */}
                </div>
              )}
            </div>
            <div className="flex w-full min-w-0 flex-col gap-1.5">
              <ApprovedOfferDisplay
                offer={localData.offer}
                rate={localData.rate}
                term={localData.term}
                frequency={localData.frequency}
                monthlyPayment={localData.monthlyPayment}
                daysWeeks={localData.daysWeeks}
                bankTotalAvgNetCredit={bankTotalAvgNetCredit}
                bankTables={bankTables}
                bankTotalRows={bankTotalRows}
                positions={positions}
                existingRemit={existingRemit}
                totalMonthlyFromPositions={totalMonthlyFromPositions}
                totalDailyFromPositions={totalDailyFromPositions}
                showLeverageTable={showLeverageTable}
              />
              {!actionsAtTop && renderDecisionActions()}
            </div>
          </div>
        </div>
      </div>

      {/* DECLINE MODAL — same flow as ChecksAndDecision (reason dropdown + ISO rejection email) */}
      <RejectApplicationModal
        open={isDeclineModalOpen}
        onOpenChange={setIsDeclineModalOpen}
        onAfterReject={handleAfterReject}
      />
    </div>
  );
};

export default OfferDecisionToggle;
