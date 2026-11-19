import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
// import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
// import { Label } from "../ui/label";
import { CheckCircle2, Pencil } from "lucide-react";
import MyNotes from "./MyNotes";
import { ApplicationAdditionalInfo } from "./AdditionalInfoSection";
// import RawEligibilityAndBankTotalSection from "./EligibilityAndBankTotalSection";
import RawBankAnalysisTable from "./BankAnalysisTable";
// import RawPositionsTable from "./PositionsTable";
// import { useTheme } from "@/context/ThemeContext";
import type { AppDispatch, RootState } from "@/redux/store";
import OfferDecisionToggle from "./OfferDecisionToggle";
import { axiosGet } from "@/redux/axios";
import {
    getBankDetails,
} from "@/redux/actions/bankDetailActions";
import {
    getMonths,
    // createMonth,
    // updateMonth
} from "@/redux/actions/monthActions";
import {
    getTransactions,
    // createTransaction,
    // updateTransaction,
    // deleteTransaction,
    // bulkCreateTransactions
} from "@/redux/actions/transactionActions";
import { getPositions } from "@/redux/actions/positionActions";
import { clearPositions } from "@/redux/slices/positionSlice";
// import { toast } from "react-toastify";
import type { BankDetail } from "@/types/bankDetailTypes";
import type { Month } from "@/types/monthTypes";
import type { Transaction as TransactionType } from "@/types/transactionTypes";
import PositionTableCalculator from "./PositionTableCalculator";
import {
    uploadAndDownloadCsv,
} from "@/redux/actions/automatedBankStatementActions";
import { updateApplication } from "@/redux/actions/applicationActions";
import { normalizeApiDateToYyyyMmDd, formatNumberUSForInput } from "@/lib/utils";
import type { Application } from "@/types/applicationTypes";
import { toast } from "react-toastify";
import { resolveOfferDecisionFundedAmount } from "@/lib/offerDecisionFees";

function loanAmountToInputString(loanAmount: Application["loanAmount"]): string {
    if (loanAmount === null || loanAmount === undefined) return "";
    const n =
        typeof loanAmount === "number"
            ? loanAmount
            : parseFloat(String(loanAmount).replace(/[^0-9.-]+/g, ""));
    if (Number.isNaN(n) || n <= 0) return "";
    return Number.isInteger(n) ? String(n) : String(n);
}

function formatLoanAmountReadOnly(loanAmount: Application["loanAmount"]): string {
    const s = loanAmountToInputString(loanAmount);
    if (!s) return "—";
    const n = parseFloat(s.replace(/[^0-9.-]+/g, ""));
    if (Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(n);
}

function applicationUpdateRouteId(app: unknown): string {
    const a = app as Record<string, unknown> | null | undefined;
    if (!a || typeof a !== "object") return "";
    const mongo = a._id ?? a.id;
    if (mongo != null && String(mongo).trim() !== "") return String(mongo).trim();
    const aid = a.applicationId;
    if (aid != null && String(aid).trim() !== "") return String(aid).trim();
    return "";
}

/** True when at least one calculator row has user-entered / saved field values. */
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

/** Two scope keys refer to the same application when their id tokens overlap. */
function sameApplicationScope(prev: string | null, next: string | null): boolean {
    if (!prev || !next) return prev === next;
    const prevIds = new Set(prev.split("|"));
    for (const id of next.split("|")) {
        if (prevIds.has(id)) return true;
    }
    return false;
}

function buildApplicationScopeKey(
    app: unknown,
    fallbackId: string | number | null | undefined,
): string | null {
    const a = app as Record<string, unknown> | null;
    const ids = new Set<string>();
    for (const v of [a?._id, a?.id, a?.applicationId, fallbackId]) {
        if (v != null && String(v).trim() !== "") ids.add(String(v).trim());
    }
    if (ids.size === 0) return null;
    return Array.from(ids).sort().join("|");
}

/** Stable JSON signature for Redux-derived positions so we do not reset livePositions on referential churn. */
function positionsForBankSeedSignature(arr: Array<Record<string, unknown>>): string {
    return JSON.stringify(
        (arr || []).map((p) => ({
            _id: String(p._id ?? ""),
            lender: String(p.lender ?? ""),
            installment: String(p.installment ?? ""),
            frequency: String(p.frequency ?? ""),
            status: String(p.status ?? ""),
            startingDate: String(p.startingDate ?? ""),
            amountFunded: String(p.amountFunded ?? ""),
            estEndDate: String(p.estEndDate ?? ""),
            allocatedBankAnalysisId: p.allocatedBankAnalysisId ?? null,
            mcaRemit: String(p.mcaRemit ?? ""),
            monthlyMcaPmts: String(p.monthlyMcaPmts ?? ""),
        })),
    );
}

// New reusable table/summary components (typed as any so we can evolve props gradually)
// const EligibilityAndBankTotalSection: any = RawEligibilityAndBankTotalSection;
const BankAnalysisTable: any = RawBankAnalysisTable;
// const PositionsTable: any = RawPositionsTable;

// Local UI state for expanded months (not stored in Redux)
interface ExpandedMonths {
    [monthId: string]: boolean;
}

type BankAnalysisProps = {
    /** View-only: no statement upload, bank edits, positions, or terms-of-offer actions (e.g. OPERATIONS). */
    readOnly?: boolean;
    /** When false, hide add-bank/month and Create Position even if not read-only. Defaults to true when editable. */
    enableCreate?: boolean;
    /** When false, hide automated bank statement upload (e.g. Decision Making / Scrubbing tab). */
    showBankStatementUpload?: boolean;
};

const BankAnalysis = ({
    readOnly = false,
    enableCreate = true,
    showBankStatementUpload = true,
}: BankAnalysisProps) => {
    // const { resolvedTheme } = useTheme();
    // const isDark = resolvedTheme === 'dark';
    const dispatch = useDispatch<AppDispatch>();

    // Get application from Redux
    const { data: applicationData } = useSelector((state: RootState) => state.applicationDetail);
    const { data: bankDetailsData, loading: bankDetailsLoading } = useSelector(
        (state: RootState) => state.bankDetails,
    );
    // const { loading: createLoading } = useSelector((state: RootState) => state.createBankDetail);

    // Get months and transactions from Redux
    const { data: monthsData, loading: monthsLoading } = useSelector((state: RootState) => state.months);
    const { data: transactionsData } = useSelector((state: RootState) => state.transactions);
    // const { loading: createMonthLoading } = useSelector((state: RootState) => state.createMonth);
    // const { loading: createTransactionLoading } = useSelector((state: RootState) => state.createTransaction);
    // const { loading: deleteTransactionLoading } = useSelector((state: RootState) => state.deleteTransaction);
    const positionsState = useSelector((state: RootState) => state.positions);

    // Automated bank statement upload state
    const { loading: uploadStatementLoading, error: uploadStatementError } = useSelector(
        (state: RootState) => state.automatedBankStatement,
    );

    // Resolve application identifier in the same way as other components:
    // prefer business numeric applicationId, then fall back to MongoDB _id.
    const resolvedApplicationId =
        (applicationData as any)?.applicationId ??
        (applicationData as any)?._id ??
        null;

    const [requestedLoanAmountInput, setRequestedLoanAmountInput] = useState("");
    const [savingRequestedLoanAmount, setSavingRequestedLoanAmount] = useState(false);
    /** When a requested amount exists, user must open this to edit (unset deals always show the entry form). */
    const [editingLoanAmount, setEditingLoanAmount] = useState(false);

    const serverLoanAmount = (applicationData as Application | null)?.loanAmount;
    const loanAmountUnset = loanAmountToInputString(serverLoanAmount) === "";

    useEffect(() => {
        setRequestedLoanAmountInput(loanAmountToInputString(serverLoanAmount));
    }, [resolvedApplicationId, serverLoanAmount]);

    useEffect(() => {
        setEditingLoanAmount(false);
    }, [resolvedApplicationId]);

    /** Bulk-save hook registered by {@link PositionTableCalculator} for Approve & Save. */
    const saveAllPositionsRef = useRef<(() => Promise<boolean>) | null>(null);
    const handleRegisterSaveAllPositions = useCallback((saveAll: () => Promise<boolean>) => {
        saveAllPositionsRef.current = saveAll;
    }, []);

    /** Bulk-save hook registered by {@link BankAnalysisTable} for Approve & Save. */
    const saveAllBanksRef = useRef<(() => Promise<boolean>) | null>(null);
    const handleRegisterSaveAllBanks = useCallback((saveAll: () => Promise<boolean>) => {
        saveAllBanksRef.current = saveAll;
    }, []);

    /** Save hook registered by {@link OfferDecisionToggle} for the page toolbar. */
    const saveOfferRef = useRef<(() => Promise<boolean>) | null>(null);
    const handleRegisterSaveOffer = useCallback((save: () => Promise<boolean>) => {
        saveOfferRef.current = save;
    }, []);

    /**
     * Page-level edit mode: one Edit button unlocks Offer, Bank Analysis and
     * Positions together, so all three tables take input the same way instead
     * of each carrying its own pencil / "Edit rows" control.
     */
    const [pageEditMode, setPageEditMode] = useState(false);
    /**
     * Whether this deal opened with nothing on it (no offer, positions or bank
     * rows) — such a deal opens ready to type into, without the Edit button.
     * Decided once per deal, only after all three have loaded for it, and
     * cleared after a successful Save so a scrubbed deal locks behind Edit.
     */
    const [startedEmptyState, setStartedEmptyState] = useState<{
        scope: string;
        empty: boolean;
    } | null>(null);
    /** null until the offer card reports; false means this deal has no offer. */
    const [offerExists, setOfferExists] = useState<boolean | null>(null);
    const handleDecisionLoaded = useCallback(
        (decision: "approved" | "declined" | null) => {
            setOfferExists(decision !== null);
            // An offer saved on a deal that opened empty locks it behind Edit too.
            if (decision !== null) {
                setStartedEmptyState((prev) =>
                    prev?.empty ? { ...prev, empty: false } : prev,
                );
            }
        },
        [],
    );
    const [pageSaving, setPageSaving] = useState(false);

    /**
     * Persist the requested loan amount as part of the combined "Approve & Save"
     * flow. Best-effort and quiet: skips when empty/unchanged, surfaces only
     * hard failures. Returns false when an entered amount is invalid.
     */
    const persistRequestedLoanAmount = useCallback(async (opts?: {
        silent?: boolean;
        keepEditing?: boolean;
    }): Promise<boolean> => {
        const silent = !!opts?.silent;
        const keepEditing = opts?.keepEditing ?? !silent;
        const updateId = applicationUpdateRouteId(applicationData);
        if (!updateId) return true;
        const raw = String(requestedLoanAmountInput ?? "").trim();
        if (!raw) return true;
        const parsed = parseFloat(raw.replace(/[^0-9.-]+/g, ""));
        if (Number.isNaN(parsed) || parsed <= 0) {
            if (!silent) {
                toast.error("Enter a valid requested amount greater than zero.");
            }
            return false;
        }
        const prevStr = loanAmountToInputString(
            (applicationData as Application | null)?.loanAmount,
        ).replace(/[^0-9.-]+/g, "");
        const prev = prevStr === "" ? NaN : parseFloat(prevStr);
        if (!Number.isNaN(prev) && Math.abs(parsed - prev) < 0.005) {
            return true;
        }
        setSavingRequestedLoanAmount(true);
        try {
            await dispatch(
                updateApplication({
                    id: updateId,
                    data: { loanAmount: parsed },
                }),
            ).unwrap();
            if (keepEditing) {
                setEditingLoanAmount(true);
            } else {
                setEditingLoanAmount(false);
            }
            return true;
        } catch (e: unknown) {
            const msg =
                e && typeof e === "object" && "message" in e
                    ? String((e as { message?: string }).message)
                    : "Failed to save requested amount.";
            if (!silent) {
                toast.error(msg);
            }
            return false;
        } finally {
            setSavingRequestedLoanAmount(false);
        }
    }, [applicationData, dispatch, requestedLoanAmountInput]);

    /** Save requested amount, bank rows, and positions — Offer "Approve & Save". */
    const handleApproveSaveAll = useCallback(async (): Promise<boolean> => {
        const loanOk = await persistRequestedLoanAmount();
        if (!loanOk) return false;

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
    }, [persistRequestedLoanAmount]);

    /**
     * Toolbar Save: persists the requested amount, every bank card and every
     * position row, then the offer itself when one is already approved. Leaves
     * edit mode on if anything failed so the user does not lose their input.
     */
    const handlePageSave = useCallback(async () => {
        if (pageSaving) return;
        setPageSaving(true);
        try {
            const coreOk = await handleApproveSaveAll();
            if (!coreOk) return;
            const offerOk = (await saveOfferRef.current?.()) ?? true;
            if (!offerOk) return;
            // Re-read what was just written, or the Leverage totals and the
            // wires derived from Positions keep showing the old values until
            // the page is reloaded by hand.
            if (resolvedApplicationId) {
                dispatch(getPositions({ application: resolvedApplicationId as string, force: true }));
                dispatch(getBankDetails({ application: resolvedApplicationId as string }));
                dispatch(getMonths({ application: resolvedApplicationId as string }));
            }
            setPageEditMode(false);
            // The deal now holds data: lock it behind the Edit button.
            setStartedEmptyState((prev) => (prev ? { ...prev, empty: false } : prev));
        } catch (err) {
            console.error("Save failed:", err);
            toast.error("Failed to save. Please try again.");
        } finally {
            setPageSaving(false);
        }
    }, [handleApproveSaveAll, pageSaving]);

    // Local state for bank details (for optimistic updates)
    const [bankDetails, setBankDetails] = useState<BankDetail[]>([]);

    // Local state for expanded months (UI only)
    const [expandedMonths, setExpandedMonths] = useState<ExpandedMonths>({});
    // Local state for expanded month details (Month, Date, Amount fields)
    const [expandedMonthDetails, setExpandedMonthDetails] = useState<ExpandedMonths>({});

    // Local state for months (for optimistic updates with temp months)
    const [localMonths, setLocalMonths] = useState<Month[]>([]);

    // Local state for transactions (for optimistic updates with temp transactions)
    const [localTransactions, setLocalTransactions] = useState<Record<string, TransactionType[]>>({});
    /** Stack metrics from {@link PositionTableCalculator} — keeps leverage in sync with the editable table. */
    const [positionTableMetrics, setPositionTableMetrics] = useState<{
        activeCount: number;
        existingRemit: number;
        totalMonthlyFromPositions: number;
        totalDailyFromPositions: number;
    } | null>(null);
    const [bankNetCreditAvg, setBankNetCreditAvg] = useState<number | null>(null);
    const [offerDecisionState, setOfferDecisionState] = useState<"approved" | "declined" | null>(null);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const componentsReadOnly = readOnly || isPreviewMode;
    const scrubbingAutoSave = !componentsReadOnly;

    /** Debounced auto-save for requested loan amount on the Scrubbing tab. */
    useEffect(() => {
        if (!scrubbingAutoSave || readOnly || savingRequestedLoanAmount) return;
        const raw = String(requestedLoanAmountInput ?? "").trim();
        if (!raw) return;
        const parsed = parseFloat(raw.replace(/[^0-9.-]+/g, ""));
        if (Number.isNaN(parsed) || parsed <= 0) return;
        const prevStr = loanAmountToInputString(serverLoanAmount).replace(/[^0-9.-]+/g, "");
        const prev = prevStr === "" ? NaN : parseFloat(prevStr);
        if (!Number.isNaN(prev) && Math.abs(parsed - prev) < 0.005) return;

        const timer = setTimeout(() => {
            void persistRequestedLoanAmount({ silent: true, keepEditing: true });
        }, 1500);
        return () => clearTimeout(timer);
    }, [
        scrubbingAutoSave,
        readOnly,
        savingRequestedLoanAmount,
        requestedLoanAmountInput,
        serverLoanAmount,
        persistRequestedLoanAmount,
    ]);

    const [uploadedBankFiles, setUploadedBankFiles] = useState<string[]>([]);

    const [livePositions, setLivePositions] = useState<any[]>([]);
    const [bankAllocationOptions, setBankAllocationOptions] = useState<Array<{ id: number; label: string }>>([]);
    // Track which transaction amount fields are being edited (to show raw value)
    // const [editingAmounts, setEditingAmounts] = useState<Set<string>>(new Set());

    // Ref to store latest bank details for use in callbacks
    const bankDetailsRef = useRef<BankDetail[]>([]);
    const monthsRef = useRef<Month[]>([]);
    const localTransactionsRef = useRef<Record<string, TransactionType[]>>({});
    const defaultMonthCreatedRef = useRef<boolean>(false);
    const lastPositionsSeedSigRef = useRef<string>("");
    const lastSeededAppRef = useRef<string | null>(null);
    const livePositionsRef = useRef<any[]>([]);
    const lastFetchedApplicationScopeRef = useRef<string | null>(null);

    const applicationScopeKey = useMemo(
        () => buildApplicationScopeKey(applicationData, resolvedApplicationId),
        [applicationData, resolvedApplicationId],
    );

    // Fetch bank details, months, and positions for this application only (application-scoped)
    useEffect(() => {
        if (!resolvedApplicationId || !applicationScopeKey) {
            if (!resolvedApplicationId) {
                dispatch(clearPositions());
                setOfferDecisionState(null);
            }
            lastFetchedApplicationScopeRef.current = null;
            return;
        }
        // Only clear stale Redux positions when navigating to a different application —
        // not when the same deal is addressable by another id shape (applicationId vs _id).
        if (
            !sameApplicationScope(
                lastFetchedApplicationScopeRef.current,
                applicationScopeKey,
            )
        ) {
            if (lastFetchedApplicationScopeRef.current != null) {
                dispatch(clearPositions());
            }
            lastFetchedApplicationScopeRef.current = applicationScopeKey;
        }
        dispatch(getBankDetails({ application: resolvedApplicationId as string }));
        dispatch(getMonths({ application: resolvedApplicationId as string }));
        dispatch(getPositions({ application: resolvedApplicationId as string, force: true }));
    }, [resolvedApplicationId, applicationScopeKey, dispatch]);

    // Load persisted offer decision so holdings visibility survives refresh/reopen.
    useEffect(() => {
        const loadOfferDecision = async () => {
            if (!resolvedApplicationId) {
                setOfferDecisionState(null);
                return;
            }
            try {
                const res = await axiosGet(`/offer-decisions`, {
                    params: { application: resolvedApplicationId },
                });
                const apiData = (res.data && res.data.data) || null;
                const decisionValue = (apiData?.decision ??
                    apiData?.status ??
                    apiData?.offerDecision ??
                    apiData?.offer_status ??
                    null) as string | null;

                // "approved" with no offer amount is a placeholder row, not a scrubbed offer.
                const hasOfferAmount = (resolveOfferDecisionFundedAmount(apiData) ?? 0) > 0;
                if (
                    decisionValue === "declined" ||
                    (decisionValue === "approved" && hasOfferAmount)
                ) {
                    setOfferDecisionState(decisionValue);
                    return;
                }
                setOfferDecisionState(null);
            } catch {
                setOfferDecisionState(null);
            }
        };
        void loadOfferDecision();
    }, [resolvedApplicationId]);
    
    // Update local state when Redux state changes
    useEffect(() => {
        if (bankDetailsData && Array.isArray(bankDetailsData)) {
            setBankDetails(bankDetailsData);
            bankDetailsRef.current = bankDetailsData;
        }
    }, [bankDetailsData]);

    // Keep ref in sync with state
    useEffect(() => {
        bankDetailsRef.current = bankDetails;
    }, [bankDetails]);

    // Fetch transactions when months are expanded
    useEffect(() => {
        const monthsToCheck = localMonths.length > 0 ? localMonths : (monthsData || []);
        if (Array.isArray(monthsToCheck)) {
            monthsToCheck.forEach(month => {
                // Only fetch for non-temp months
                if (!month._id.startsWith('temp-') && expandedMonths[month._id] && !transactionsData[month._id]) {
                    dispatch(getTransactions({ monthId: month._id }));
                }
            });
        }
    }, [expandedMonths, localMonths, monthsData, transactionsData, dispatch]);

    // Update local months when Redux state changes
    useEffect(() => {
        if (monthsData && Array.isArray(monthsData) && monthsData.length > 0) {
            // Merge Redux months with local temp months (preserve temp months)
            const tempMonths = localMonths.filter(m => m._id.startsWith('temp-'));
            const existingIds = new Set(monthsData.map(m => m._id));
            const newTempMonths = tempMonths.filter(t => !existingIds.has(t._id));
            const allMonths = [...monthsData, ...newTempMonths];
            setLocalMonths(allMonths);
            monthsRef.current = allMonths;

            // Compute expanded state without calling setState from inside another setState callback
            const hasExpanded = Object.values(expandedMonthDetails).some(val => val === true);
            const newExpandedDetails: ExpandedMonths = { ...expandedMonthDetails };
            allMonths.forEach(month => {
                if (!(month._id in newExpandedDetails)) {
                    newExpandedDetails[month._id] = false;
                }
            });
            if (!hasExpanded && allMonths.length > 0) {
                const firstMonthId = allMonths[0]._id;
                newExpandedDetails[firstMonthId] = true;
                setExpandedMonthDetails(newExpandedDetails);
                setExpandedMonths(prev => ({ ...prev, [firstMonthId]: true }));
            } else {
                setExpandedMonthDetails(newExpandedDetails);
            }
        } else if (!monthsLoading && resolvedApplicationId && !defaultMonthCreatedRef.current) {
            // Check if we have no months (null, undefined, or empty array)
            const hasNoMonths = !monthsData || (Array.isArray(monthsData) && (monthsData as Month[]).length === 0);

            if (hasNoMonths) {
                // If no months data and not loading, create a default empty month for editing
                const tempMonths = monthsRef.current.filter(m => m._id.startsWith('temp-'));

                if (tempMonths.length === 0) {
                    // Create default month only if no temp months exist
                    const defaultMonthId = `temp-${Date.now()}`;
                    const defaultMonth: Month = {
                        _id: defaultMonthId,
                        monthName: "",
                        date: new Date().toISOString(),
                        amount: 0,
                        application: resolvedApplicationId as string,
                    };

                    setLocalMonths([defaultMonth]);
                    monthsRef.current = [defaultMonth];
                    defaultMonthCreatedRef.current = true;

                    // Initialize expanded state for default month
                    setExpandedMonthDetails(prev => ({ ...prev, [defaultMonthId]: true }));
                    setExpandedMonths(prev => ({ ...prev, [defaultMonthId]: true }));

                    // Add default transaction
                    const defaultTransaction: TransactionType = {
                        _id: `temp-transaction-${Date.now()}`,
                        monthId: defaultMonthId,
                        category: "Transfer",
                        amount: 0,
                        notes: ""
                    };
                    setLocalTransactions(prev => ({
                        ...prev,
                        [defaultMonthId]: [defaultTransaction]
                    }));
                } else {
                    // If temp months exist, mark as created
                    defaultMonthCreatedRef.current = true;
                }
            }
        } else if (monthsData && Array.isArray(monthsData) && (monthsData as Month[]).length > 0) {
            // Reset the flag when months data is loaded
            defaultMonthCreatedRef.current = false;
        } else if (!monthsData || (Array.isArray(monthsData) && (monthsData as Month[]).length === 0)) {
            // If no months data, keep only temp months
            const tempMonths = monthsRef.current.filter(m => m._id.startsWith('temp-'));
            if (tempMonths.length > 0) {
                setLocalMonths(tempMonths);
                monthsRef.current = tempMonths;

                // Initialize expandedMonthDetails for temp months - only first one expanded
                setExpandedMonthDetails(prev => {
                    const newState = { ...prev };
                    const hasExpanded = Object.values(newState).some(val => val === true);
                    if (!hasExpanded && tempMonths.length > 0) {
                        newState[tempMonths[0]._id] = true; // Only first month expanded
                    }
                    tempMonths.forEach(month => {
                        if (!(month._id in newState)) {
                            newState[month._id] = false; // Default to collapsed
                        }
                    });
                    return newState;
                });
            }
        }
    }, [monthsData, monthsLoading, resolvedApplicationId]);

    // Keep ref in sync with local months
    useEffect(() => {
        monthsRef.current = localMonths;
    }, [localMonths]);

    // Update local transactions when Redux state changes
    useEffect(() => {
        if (transactionsData) {
            setLocalTransactions(prev => {
                const updated = { ...prev };
                Object.keys(transactionsData).forEach(monthId => {
                    updated[monthId] = transactionsData[monthId];
                });
                localTransactionsRef.current = updated;
                return updated;
            });
        }
    }, [transactionsData]);

    // Keep ref in sync with local transactions
    useEffect(() => {
        localTransactionsRef.current = localTransactions;
    }, [localTransactions]);

    // Combine months with their transactions for display
    // const monthDataWithTransactions = useMemo(() => {
    //     const monthsToDisplay = localMonths.length > 0 ? localMonths : (monthsData || []);
    //     if (!Array.isArray(monthsToDisplay) || monthsToDisplay.length === 0) return [];

    //     return monthsToDisplay.map(month => {
    //         // Get transactions from local state (includes temp transactions) or Redux
    //         const monthTransactions = localTransactions[month._id] || transactionsData[month._id] || [];

    //         // Sort transactions by createdAt ascending (oldest first, newest last)
    //         const sortedTransactions = [...monthTransactions].sort((a, b) => {
    //             // Temp transactions go to the end
    //             const aIsTemp = a._id?.startsWith('temp-transaction-') || a._id?.startsWith('empty-');
    //             const bIsTemp = b._id?.startsWith('temp-transaction-') || b._id?.startsWith('empty-');

    //             if (aIsTemp && !bIsTemp) return 1; // Temp goes after real
    //             if (!aIsTemp && bIsTemp) return -1; // Real goes before temp
    //             if (aIsTemp && bIsTemp) {
    //                 // Both temp - sort by timestamp in ID if available
    //                 const aTime = a._id?.match(/\d+/) ? parseInt(a._id.match(/\d+/)![0]) : 0;
    //                 const bTime = b._id?.match(/\d+/) ? parseInt(b._id.match(/\d+/)![0]) : 0;
    //                 return aTime - bTime; // Older temp first
    //             }

    //             // Both real transactions - sort by createdAt
    //             const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    //             const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    //             return aDate - bDate; // Ascending: oldest first
    //         });

    //         return {
    //             ...month,
    //             transactions: sortedTransactions,
    //             isExpanded: expandedMonths[month._id] || false,
    //             isDetailsExpanded: expandedMonthDetails[month._id] === true // Only true if explicitly set
    //         };
    //     });
    // }, [localMonths, monthsData, transactionsData, localTransactions, expandedMonths, expandedMonthDetails]);

    // Map API positions into calculator rows; use stored column values when present (application-specific positions)
    // Use only positions that were fetched for this specific application
    const scopedPositions = useMemo(() => {
        if (!resolvedApplicationId) return [];
        const currentScopeId = positionsState.currentApplicationId
            ? String(positionsState.currentApplicationId)
            : "";
        const allowedIds = [
            resolvedApplicationId,
            (applicationData as any)?._id,
            (applicationData as any)?.applicationId,
            (applicationData as any)?.id,
        ]
            .filter(Boolean)
            .map((id) => String(id));
        if (currentScopeId && !allowedIds.includes(currentScopeId)) return [];
        return Array.isArray(positionsState.data) ? positionsState.data : [];
    }, [resolvedApplicationId, applicationData, positionsState.currentApplicationId, positionsState.data]);

    /**
     * Decide "started empty" once per deal, and only after the offer, positions
     * and bank rows have all loaded for it. Deciding earlier (positions or bank
     * still loading, or the previous deal's data still in the store) misread a
     * filled deal as empty: the Edit button vanished and every field unlocked.
     */
    const startedEmpty =
        startedEmptyState != null &&
        startedEmptyState.scope === applicationScopeKey &&
        startedEmptyState.empty;
    const lastOfferScopeRef = useRef<string | null>(null);
    useEffect(() => {
        if (!applicationScopeKey) return;
        if (lastOfferScopeRef.current !== applicationScopeKey) {
            // New deal: leave edit mode and wait one pass for its fetches to start.
            lastOfferScopeRef.current = applicationScopeKey;
            setPageEditMode(false);
            return;
        }
        if (startedEmptyState?.scope === applicationScopeKey) return;
        if (offerExists === null || positionsState.loading || bankDetailsLoading) return;
        setStartedEmptyState({
            scope: applicationScopeKey,
            empty:
                !offerExists &&
                !positionsHaveMeaningfulData(scopedPositions) &&
                !(Array.isArray(bankDetailsData) && bankDetailsData.length > 0),
        });
    }, [
        applicationScopeKey,
        startedEmptyState,
        offerExists,
        positionsState.loading,
        bankDetailsLoading,
        scopedPositions,
        bankDetailsData,
    ]);

    const calculatorPositions = useMemo(() => {
        if (!Array.isArray(scopedPositions)) return [];
        return scopedPositions.map((p: any) => {
            const fundingDateIso = normalizeApiDateToYyyyMmDd(p.fundingDate);
            const closeDateIso = normalizeApiDateToYyyyMmDd(p.closeDate);
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
                lastPaymentDate: normalizeApiDateToYyyyMmDd(p.lastPaymentDate),
                mcaRemit:
                    p.mcaRemit != null || p.percentOfGross != null
                        ? String(p.mcaRemit ?? p.percentOfGross ?? "")
                        : "",
                monthlyMcaPmts: p.monthlyMcaPmts != null ? String(p.monthlyMcaPmts) : "",
                carryForward: p.carryForward != null ? String(p.carryForward) : "",
                allocatedBankAnalysisId:
                    Number.isInteger((p as any).allocatedBankAnalysisId) &&
                    Number((p as any).allocatedBankAnalysisId) > 0
                        ? Number((p as any).allocatedBankAnalysisId)
                        : undefined,
                isLocked: true,
            };
        });
    }, [scopedPositions]);

    /** Prefer in-table edits over an empty Redux snapshot while positions refetch after save. */
    const positionsForCalculator = useMemo(() => {
        if (positionsHaveMeaningfulData(livePositions)) {
            return livePositions;
        }
        return calculatorPositions;
    }, [livePositions, calculatorPositions]);

    useEffect(() => {
        livePositionsRef.current = livePositions;
    }, [livePositions]);

    useEffect(() => {
        if (!resolvedApplicationId) {
            setLivePositions([]);
            setPositionTableMetrics(null);
            lastSeededAppRef.current = null;
            lastPositionsSeedSigRef.current = "";
            return;
        }
        const appKey = String(resolvedApplicationId);
        const sig = positionsForBankSeedSignature(calculatorPositions as any[]);

        if (lastSeededAppRef.current !== appKey) {
            lastSeededAppRef.current = appKey;
            lastPositionsSeedSigRef.current = sig;
            setLivePositions(calculatorPositions as any[]);
            setPositionTableMetrics(null);
            return;
        }

        if (sig === lastPositionsSeedSigRef.current) return;
        lastPositionsSeedSigRef.current = sig;

        // Keep showing the last known rows while Redux is briefly empty during refetch.
        if (
            !positionsHaveMeaningfulData(calculatorPositions) &&
            positionsHaveMeaningfulData(livePositionsRef.current)
        ) {
            return;
        }

        setLivePositions(calculatorPositions as any[]);
    }, [resolvedApplicationId, calculatorPositions]);

    const handleRowsChange = useCallback((nextRows: any[]) => {
        setLivePositions((prev) => {
            // Don't let empty placeholder emits from PositionTableCalculator
            // wipe a server-seeded snapshot before hydrate completes.
            if (
                !positionsHaveMeaningfulData(nextRows) &&
                positionsHaveMeaningfulData(prev)
            ) {
                return prev;
            }
            return prev === nextRows ? prev : (nextRows || []);
        });
    }, []);

    const handleBanksMetaChange = useCallback((banks: Array<{ id: number; accountNumber: string }>) => {
        const next = banks.map((b, i) => ({
            id: b.id,
            label: b.accountNumber?.trim()
                ? `Bank Analysis ${i + 1} (${b.accountNumber.trim()})`
                : `Bank Analysis ${i + 1}`,
        }));

        setBankAllocationOptions((prev) => {
            if (prev.length === next.length && prev.every((p, i) => p.id === next[i]?.id && p.label === next[i]?.label)) {
                return prev;
            }
            return next;
        });
    }, []);

    // Handle add bank
    // const handleAddBank = async () => {
    //     if (!applicationId) {
    //         toast.error('Application not found');
    //         return;
    //     }

    //     // Optimistically add to local state
    //     const tempId = `temp-${Date.now()}`;
    //     const newBank: BankDetail = {
    //         _id: tempId,
    //         bankName: "",
    //         accountNumber: "",
    //         application: applicationId as string,
    //     };
    //     setBankDetails([...bankDetails, newBank]);
    // };

    // Handle bank field update - using ref to avoid stale closure
    // const handleBankUpdate = useCallback(async (bankId: string) => {
    //     if (!applicationId) {
    //         console.error('No applicationId available for saving bank detail');
    //         return;
    //     }

    //     // Get the latest bank data from ref
    //     const currentBank = bankDetailsRef.current.find(b => b._id === bankId);
    //     if (!currentBank) {
    //         console.error('Bank not found in ref:', bankId);
    //         return;
    //     }

    //     // If it's a temporary ID (newly added), create it
    //     if (bankId.startsWith('temp-')) {
    //         if (currentBank.bankName && currentBank.accountNumber) {
    //             try {
    //                 console.log('Creating bank detail:', { bankName: currentBank.bankName, accountNumber: currentBank.accountNumber, application: applicationId });
    //                 const result = await dispatch(createBankDetail({
    //                     bankName: currentBank.bankName,
    //                     accountNumber: currentBank.accountNumber,
    //                     application: applicationId as string,
    //                 })).unwrap();

    //                 // Replace temp bank with created bank
    //                 setBankDetails(prev => prev.map(b => 
    //                     b._id === bankId ? (result.data || result) : b
    //                 ));
    //                 toast.success('Bank detail created successfully');
    //             } catch (error: any) {
    //                 console.error('Create bank detail error:', error);
    //                 toast.error(error || 'Failed to create bank detail');
    //                 // Remove the failed bank
    //                 setBankDetails(prev => prev.filter(b => b._id !== bankId));
    //             }
    //         } else {
    //             console.log('Cannot create bank - missing fields:', { bankName: currentBank.bankName, accountNumber: currentBank.accountNumber });
    //         }
    //     } else {
    //         // Update existing bank - allow partial updates (save whatever fields have values)
    //         if (currentBank.bankName || currentBank.accountNumber) {
    //             try {
    //                 const updateData: { bankName?: string; accountNumber?: string } = {};
    //                 if (currentBank.bankName) updateData.bankName = currentBank.bankName;
    //                 if (currentBank.accountNumber) updateData.accountNumber = currentBank.accountNumber;

    //                 console.log('Updating bank detail:', { id: bankId, data: updateData });
    //                 await dispatch(updateBankDetail({
    //                     id: bankId,
    //                     data: updateData
    //                 })).unwrap();
    //                 // toast.success('Bank detail updated successfully');
    //             } catch (error: any) {
    //                 console.error('Update bank detail error:', error);
    //                 toast.error(error || 'Failed to update bank detail');
    //             }
    //         } else {
    //             console.log('Cannot update bank - both fields are empty');
    //         }
    //     }
    // }, [applicationId, dispatch]);




    // Handle bank field change (local only – saving happens on blur)
    // const handleBankFieldChange = (bankId: string, field: 'bankName' | 'accountNumber', value: string) => {
    //     setBankDetails(prev => {
    //         const updated = prev.map(bank => 
    //             bank._id === bankId ? { ...bank, [field]: value } : bank
    //         );
    //         // Update ref immediately
    //         bankDetailsRef.current = updated;
    //         return updated;
    //     });
    // };

    // Handle delete bank (if needed in future)
    // const handleDeleteBank = async (bankId: string) => {
    //     if (bankId.startsWith('temp-')) {
    //         setBankDetails(prev => prev.filter(b => b._id !== bankId));
    //         return;
    //     }
    //     try {
    //         await dispatch(deleteBankDetail(bankId)).unwrap();
    //         toast.success('Bank detail deleted successfully');
    //     } catch (error: any) {
    //         toast.error(error || 'Failed to delete bank detail');
    //     }
    // };

    // Handle add month - add optimistically, create when fields are filled
    // const handleAddMonth = () => {
    //     if (!applicationId) {
    //         toast.error('Application not found');
    //         return;
    //     }

    //     // Check if we already have 3 months (including temp months)
    //     const allMonths = localMonths.length > 0 ? localMonths : (monthsData || []);
    //     if (allMonths.length >= 3) {
    //         toast.error('Maximum of 3 months can be added per application');
    //         return;
    //     }

    //     // Calculate the next month date based on existing months
    //     let nextMonthDate = new Date();
    //     if (allMonths.length > 0) {
    //         // Sort months by date to find the most recent one
    //         const sortedMonths = [...allMonths].sort((a, b) => {
    //             const dateA = a.date ? (typeof a.date === 'string' ? new Date(a.date) : new Date(a.date)) : new Date(0);
    //             const dateB = b.date ? (typeof b.date === 'string' ? new Date(b.date) : new Date(b.date)) : new Date(0);
    //             return dateB.getTime() - dateA.getTime();
    //         });

    //         // Get the most recent month's date
    //         const mostRecentMonth = sortedMonths[0];
    //         if (mostRecentMonth.date) {
    //             const mostRecentDate = typeof mostRecentMonth.date === 'string' 
    //                 ? new Date(mostRecentMonth.date) 
    //                 : new Date(mostRecentMonth.date);

    //             // Calculate one month after the most recent month
    //             nextMonthDate = new Date(mostRecentDate);
    //             nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    //         }
    //     }

    //     // Optimistically add to local state with temp ID
    //     const tempId = `temp-${Date.now()}`;
    //     const newMonth: Month = {
    //         _id: tempId,
    //         monthName: "",
    //         date: nextMonthDate.toISOString(),
    //         amount: 0,
    //         application: applicationId as string,
    //     };

    //     setLocalMonths(prev => [...prev, newMonth]);
    //     setExpandedMonths(prev => ({ ...prev, [tempId]: true })); // Auto-expand transactions for new month
    //     // Close all other months and expand the new one (accordion behavior)
    //     setExpandedMonthDetails(prev => {
    //         const newState: ExpandedMonths = {};
    //         // Close all existing months
    //         Object.keys(prev).forEach(id => {
    //             newState[id] = false;
    //         });
    //         // Expand the new month
    //         newState[tempId] = true;
    //         return newState;
    //     });

    //     // Automatically add a transaction when month is added
    //     const tempTransactionId = `temp-transaction-${Date.now()}`;
    //     const newTransaction: TransactionType = {
    //         _id: tempTransactionId,
    //         monthId: tempId,
    //         category: "Transfer",
    //         amount: 0,
    //         notes: ""
    //     };

    //     setLocalTransactions(prev => ({
    //         ...prev,
    //         [tempId]: [newTransaction]
    //     }));
    // };

    // Handle toggle month details expand (Month, Date, Amount fields)
    // const handleToggleMonthDetailsExpand = (monthId: string) => {
    //     setExpandedMonthDetails(prev => {
    //         const newState: ExpandedMonths = {};
    //         let willBeExpanded = !prev[monthId];

    //         // Close all other months (accordion behavior)
    //         Object.keys(prev).forEach(id => {
    //             if (id === monthId) {
    //                 newState[id] = willBeExpanded; // Toggle current month
    //             } else {
    //                 newState[id] = false; // Close others
    //             }
    //         });
    //         // If month wasn't in state, add it as expanded
    //         if (!(monthId in prev)) {
    //             newState[monthId] = true;
    //             willBeExpanded = true;
    //         }

    //         // Auto-expand transactions when month details are expanded
    //         if (willBeExpanded) {
    //             setExpandedMonths(prevTransactions => ({
    //                 ...prevTransactions,
    //                 [monthId]: true
    //             }));
    //         }

    //         return newState;
    //     });
    // };

    // Handle toggle month expand
    // const handleToggleMonthExpand = (monthId: string) => {
    //     setExpandedMonths(prev => {
    //         const newState: ExpandedMonths = {};
    //         // Close all other months (accordion behavior)
    //         Object.keys(prev).forEach(id => {
    //             if (id === monthId) {
    //                 newState[id] = !prev[id]; // Toggle current month
    //             } else {
    //                 newState[id] = false; // Close others
    //             }
    //         });
    //         // If month wasn't in state, add it as expanded
    //         if (!(monthId in prev)) {
    //             newState[monthId] = true;
    //         }
    //         return newState;
    //     });

    //     // Fetch transactions when expanding
    //     if (!expandedMonths[monthId]) {
    //         dispatch(getTransactions({ monthId }));
    //     }
    // };

    // Handle update month with debouncing
    // const monthUpdateTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // const handleUpdateMonth = useCallback(async (monthId: string, field: 'monthName' | 'date' | 'amount', value: string) => {
    //     if (!applicationId) return;

    //     // Update local state immediately
    //     setLocalMonths(prev => prev.map(month => {
    //         if (month._id === monthId) {
    //             const updated = { ...month };
    //             if (field === 'date') {
    //                 updated.date = value;
    //             } else if (field === 'amount') {
    //                 updated.amount = value;
    //             } else if (field === 'monthName') {
    //                 updated.monthName = value;
    //             }
    //             return updated;
    //         }
    //         return month;
    //     }));

    //     // Clear existing timeout
    //     const existingTimeout = monthUpdateTimeouts.current.get(`${monthId}-${field}`);
    //     if (existingTimeout) {
    //         clearTimeout(existingTimeout);
    //     }

    //     // Set new timeout for debounced update
    //     const timeout = setTimeout(async () => {
    //         // Get latest month data from ref
    //         const currentMonth = monthsRef.current.find(m => m._id === monthId);
    //         if (!currentMonth) return;

    //         // If it's a temp month, create it when required fields are filled
    //         if (monthId.startsWith('temp-')) {
    //             if (currentMonth.monthName && currentMonth.date && currentMonth.amount !== undefined) {
    //                 try {
    //                     const createData = {
    //                         monthName: currentMonth.monthName,
    //                         date: typeof currentMonth.date === 'string' 
    //                             ? new Date(currentMonth.date).toISOString() 
    //                             : new Date(currentMonth.date).toISOString(),
    //                         amount: typeof currentMonth.amount === 'string' 
    //                             ? parseFloat(String(currentMonth.amount).replace(/[^0-9.-]+/g, '')) || 0
    //                             : Number(currentMonth.amount) || 0,
    //                         application: applicationId as string,
    //                     };

    //                     const result = await dispatch(createMonth(createData)).unwrap();
    //                     const createdMonth = result.data || result;

    //                     // Replace temp month with created month
    //                     setLocalMonths(prev => prev.map(m => 
    //                         m._id === monthId ? createdMonth : m
    //                     ));

    //                     // If there were any temp transactions for this month, create them now (use ref for latest)
    //                     const tempTransactions = localTransactionsRef.current[monthId] || [];
    //                     if (tempTransactions.length > 0) {
    //                         try {
    //                             await dispatch(bulkCreateTransactions({
    //                                 monthId: createdMonth._id,
    //                                 transactions: tempTransactions.map(t => ({
    //                                     category: t.category || "Total Credits",
    //                                     amount: typeof t.amount === 'number' ? t.amount : (parseFloat(String(t.amount).replace(/[^0-9.-]+/g, '')) || 0),
    //                                     notes: t.notes || ""
    //                                 }))
    //                             })).unwrap();

    //                             // Clear temp transactions and fetch real ones
    //                             setLocalTransactions(prev => {
    //                                 const updated = { ...prev };
    //                                 delete updated[monthId];
    //                                 return updated;
    //                             });
    //                             startTransition(() => { void dispatch(getTransactions({ monthId: createdMonth._id })); });
    //                         } catch (error: any) {
    //                             console.error('Create transactions error:', error);
    //                             toast.error('Month created but failed to create transactions');
    //                         }
    //                     }

    //                             // Refresh months list (low priority to keep typing smooth)
    //                     startTransition(() => { void dispatch(getMonths({ application: applicationId as string })); });
    //                 } catch (error: any) {
    //                     console.error('Create month error:', error);
    //                     toast.error(error || 'Failed to create month');
    //                     // Remove failed temp month
    //                     setLocalMonths(prev => prev.filter(m => m._id !== monthId));
    //                 }
    //             }
    //         } else {
    //             // Update existing month
    //             try {
    //                 const updateData: any = {};
    //                 if (field === 'date') {
    //                     const dateValue = value ? new Date(value).toISOString() : new Date().toISOString();
    //                     updateData.date = dateValue;
    //                 } else if (field === 'amount') {
    //                     const amountValue = typeof value === 'string' 
    //                         ? parseFloat(value.replace(/[^0-9.-]+/g, '')) || 0
    //                         : Number(value) || 0;
    //                     updateData.amount = amountValue;
    //                 } else if (field === 'monthName') {
    //                     updateData.monthName = value;
    //                 }

    //                 await dispatch(updateMonth({
    //                     id: monthId,
    //                     data: updateData
    //                 })).unwrap();

    //                 // Don't show success toast for updates - it's auto-saving in background
    //                 // toast.success('Month updated successfully');
    //             } catch (error: any) {
    //                 console.error('Update month error:', error);
    //                 toast.error(error || 'Failed to update month');
    //             }
    //         }
    //         monthUpdateTimeouts.current.delete(`${monthId}-${field}`);
    //     }, 1000);

    //     monthUpdateTimeouts.current.set(`${monthId}-${field}`, timeout);
    // }, [applicationId, dispatch]);

    // Handle update transaction with debouncing (use refs to avoid stale closures)
    // const transactionUpdateTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // const handleUpdateTransaction = useCallback(async (transactionId: string, field: 'category' | 'amount' | 'notes', value: string) => {
    //     const transactionsMap = localTransactionsRef.current || transactionsData;
    //     const monthId = Object.keys(transactionsMap).find(mId =>
    //         transactionsMap[mId]?.some((t: TransactionType) => t._id === transactionId)
    //     );
    //     if (!monthId) {
    //         console.error('Transaction month not found');
    //         return;
    //     }

    //     const amountValue = field === 'amount'
    //         ? (typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]+/g, '')) || 0 : Number(value) || 0)
    //         : value;

    //     setLocalTransactions(prev => {
    //         if (!prev[monthId]) return prev;
    //         const updated = {
    //             ...prev,
    //             [monthId]: prev[monthId].map(t =>
    //                 t._id === transactionId
    //                     ? { ...t, [field]: field === 'amount' ? amountValue : value }
    //                     : t
    //             )
    //         };
    //         localTransactionsRef.current = updated;
    //         return updated;
    //     });

    //     if (transactionId.startsWith('temp-transaction-')) {
    //         if (monthId.startsWith('temp-')) return;
    //         const existingTimeout = transactionUpdateTimeouts.current.get(`${transactionId}-create`);
    //         if (existingTimeout) clearTimeout(existingTimeout);
    //         const timeout = setTimeout(() => {
    //             const currentTransactions = localTransactionsRef.current[monthId] || [];
    //             const currentTransaction = currentTransactions.find((t: TransactionType) => t._id === transactionId);
    //             if (currentTransaction?.category && currentTransaction.amount !== undefined && currentTransaction.amount !== 0) {
    //                 handleCreateTransaction(transactionId, monthId, currentTransaction);
    //             }
    //         }, 800);
    //         transactionUpdateTimeouts.current.set(`${transactionId}-create`, timeout);
    //         return;
    //     }

    //     const existingTimeout = transactionUpdateTimeouts.current.get(`${transactionId}-${field}`);
    //     if (existingTimeout) clearTimeout(existingTimeout);
    //     const timeout = setTimeout(async () => {
    //         try {
    //             const updateData: Record<string, unknown> = {};
    //             if (field === 'amount') updateData.amount = amountValue;
    //             else if (field === 'category') updateData.category = value;
    //             else if (field === 'notes') updateData.notes = value;
    //             await dispatch(updateTransaction({ id: transactionId, data: updateData })).unwrap();
    //         } catch (error: any) {
    //             console.error('Update transaction error:', error);
    //             toast.error(error || 'Failed to update transaction');
    //         }
    //         transactionUpdateTimeouts.current.delete(`${transactionId}-${field}`);
    //     }, 800);
    //     transactionUpdateTimeouts.current.set(`${transactionId}-${field}`, timeout);
    // }, [dispatch, transactionsData]);

    // Helper function to create transaction in backend
    // const handleCreateTransaction = async (transactionId: string, monthId: string, transaction: TransactionType) => {
    //     try {
    //         const createData = {
    //             monthId: monthId,
    //             category: transaction.category || "Total Credits",
    //             amount: typeof transaction.amount === 'number' 
    //                 ? transaction.amount 
    //                 : (parseFloat(String(transaction.amount).replace(/[^0-9.-]+/g, '')) || 0),
    //             notes: transaction.notes || ""
    //         };

    //         const result = await dispatch(createTransaction(createData)).unwrap();
    //         const createdTransaction = result.data || result;

    //         // Replace temp transaction with created transaction
    //         setLocalTransactions(prev => {
    //             const updated = {
    //                 ...prev,
    //                 [monthId]: prev[monthId].map(t =>
    //                     t._id === transactionId ? createdTransaction : t
    //                 )
    //             };
    //             localTransactionsRef.current = updated;
    //             return updated;
    //         });

    //         startTransition(() => { void dispatch(getTransactions({ monthId })); });
    //         // toast.success('Transaction created successfully');
    //     } catch (error: any) {
    //         console.error('Create transaction error:', error);
    //         toast.error(error || 'Failed to create transaction');
    //         // Remove failed temp transaction
    //         setLocalTransactions(prev => ({
    //             ...prev,
    //             [monthId]: prev[monthId].filter(t => t._id !== transactionId)
    //         }));
    //     }
    //     transactionUpdateTimeouts.current.delete(`${transactionId}-create`);
    // };

    // Handle add transaction - returns new transaction id so callers can update it without race
    // const handleAddTransaction = useCallback((monthId: string, initialData?: Partial<Pick<TransactionType, 'category' | 'amount' | 'notes'>>): string => {
    //     const month = monthsRef.current.find(m => m._id === monthId);
    //     if (!month) {
    //         toast.error('Month not found');
    //         return "";
    //     }
    //     const tempTransactionId = `temp-transaction-${Date.now()}`;
    //     const newTransaction: TransactionType = {
    //         _id: tempTransactionId,
    //         monthId,
    //         category: initialData?.category ?? "Total Credits",
    //         amount: initialData?.amount ?? 0,
    //         notes: initialData?.notes ?? ""
    //     };
    //     setLocalTransactions(prev => {
    //         const updated = {
    //             ...prev,
    //             [monthId]: [...(prev[monthId] || []), newTransaction]
    //         };
    //         localTransactionsRef.current = updated;
    //         return updated;
    //     });
    //     return tempTransactionId;
    // }, []);

    // Handle delete transaction (use ref for lookup to avoid stale closure)
    // const handleDeleteTransaction = useCallback(async (transactionId: string) => {
    //     if (!transactionId) {
    //         toast.error('Transaction ID is required');
    //         return;
    //     }
    //     const transactionsMap = localTransactionsRef.current || transactionsData;
    //     const monthId = Object.keys(transactionsMap).find(mId =>
    //         transactionsMap[mId]?.some((t: TransactionType) => t._id === transactionId)
    //     );
    //     if (!monthId) {
    //         toast.error('Transaction month not found');
    //         return;
    //     }
    //     if (transactionId.startsWith('temp-transaction-')) {
    //         setLocalTransactions(prev => {
    //             const updated = {
    //                 ...prev,
    //                 [monthId]: prev[monthId]?.filter(t => t._id !== transactionId) || []
    //             };
    //             localTransactionsRef.current = updated;
    //             return updated;
    //         });
    //         return;
    //     }
    //     try {
    //         await dispatch(deleteTransaction(transactionId)).unwrap();
    //         setLocalTransactions(prev => {
    //             const updated = {
    //                 ...prev,
    //                 [monthId]: prev[monthId]?.filter(t => t._id !== transactionId) || []
    //             };
    //             localTransactionsRef.current = updated;
    //             return updated;
    //         });
    //         startTransition(() => { void dispatch(getTransactions({ monthId })); });
    //         toast.success('Transaction deleted successfully');
    //     } catch (error: any) {
    //         console.error('Delete transaction error:', error);
    //         toast.error(error || 'Failed to delete transaction');
    //     }
    // }, [dispatch, transactionsData]);

    // const months = [
    //     "January", "February", "March", "April", "May", "June",
    //     "July", "August", "September", "October", "November", "December"
    // ];

    return (
        <div className="space-y-6 w-full">
            <div className="flex flex-col lg:flex-row gap-6 w-[101%]">

                {/* Left Column */}
                <div className="flex-1 min-w-0 space-y-4">
                    {resolvedApplicationId && (
                        <div className="border-b border-border pb-3">
                            {readOnly ? (
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Requested amount</span>
                                    <span
                                        className={`font-semibold tabular-nums ${loanAmountUnset ? "text-muted-foreground font-normal" : ""}`}
                                    >
                                        {loanAmountUnset
                                            ? "—"
                                            : formatLoanAmountReadOnly(serverLoanAmount)}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-2">
                                    {/* Requested amount — left */}
                                    <div className="min-w-0 shrink-0 sm:border-r sm:border-border/70 sm:pr-6">
                                        {loanAmountUnset ? (
                                            <div
                                                className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:gap-2"
                                                role="region"
                                                aria-label="Enter requested amount"
                                            >
                                                <div className="w-full space-y-1 sm:w-[11rem]">
                                                    <Label
                                                        htmlFor="bank-analysis-loan-amount-unset"
                                                        className="text-xs text-muted-foreground"
                                                    >
                                                        Requested amount ($)
                                                    </Label>
                                                    <Input
                                                        id="bank-analysis-loan-amount-unset"
                                                        type="text"
                                                        inputMode="decimal"
                                                        autoComplete="off"
                                                        placeholder="e.g. 50000"
                                                        value={formatNumberUSForInput(requestedLoanAmountInput)}
                                                        onChange={(e) =>
                                                            setRequestedLoanAmountInput(formatNumberUSForInput(e.target.value))
                                                        }
                                                        disabled={savingRequestedLoanAmount}
                                                        className="h-9 w-full bg-background"
                                                    />
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Saved automatically with “Approve &amp; Save”.
                                                    </p>
                                                </div>
                                            </div>
                                        ) : editingLoanAmount ? (
                                            <div className="flex flex-wrap items-end gap-2">
                                                <div className="w-full space-y-1 sm:w-[11rem]">
                                                    <Label
                                                        htmlFor="bank-analysis-loan-amount"
                                                        className="text-xs text-muted-foreground"
                                                    >
                                                        Requested amount ($)
                                                    </Label>
                                                    <Input
                                                        id="bank-analysis-loan-amount"
                                                        type="text"
                                                        inputMode="decimal"
                                                        autoComplete="off"
                                                        placeholder="0"
                                                        value={formatNumberUSForInput(requestedLoanAmountInput)}
                                                        onChange={(e) =>
                                                            setRequestedLoanAmountInput(formatNumberUSForInput(e.target.value))
                                                        }
                                                        disabled={savingRequestedLoanAmount}
                                                        className="h-9 w-full"
                                                    />
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Saved automatically with “Approve &amp; Save”.
                                                    </p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-9 text-muted-foreground"
                                                    disabled={savingRequestedLoanAmount}
                                                    onClick={() => {
                                                        setRequestedLoanAmountInput(
                                                            loanAmountToInputString(serverLoanAmount),
                                                        );
                                                        setEditingLoanAmount(false);
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <CheckCircle2
                                                    className="size-4 shrink-0 text-emerald-600 dark:text-emerald-500"
                                                    aria-hidden
                                                />
                                                <span className="text-sm text-muted-foreground">
                                                    Requested amount
                                                </span>
                                                <span className="text-sm font-semibold tabular-nums">
                                                    {formatLoanAmountReadOnly(serverLoanAmount)}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 shrink-0 gap-1 px-2.5 text-xs"
                                                    onClick={() => {
                                                        setRequestedLoanAmountInput(
                                                            loanAmountToInputString(serverLoanAmount),
                                                        );
                                                        setEditingLoanAmount(true);
                                                    }}
                                                >
                                                    <Pencil className="size-3.5" aria-hidden />
                                                    Change
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    {showBankStatementUpload ? (
                                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:shrink-0">
                                        {uploadedBankFiles.length > 0 && (
                                            <div className="flex max-w-[18rem] flex-wrap gap-1 text-[11px] text-muted-foreground">
                                                {uploadedBankFiles.map((name, idx) => (
                                                    <span
                                                        key={`${name}-${idx}`}
                                                        className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5"
                                                        title={name}
                                                    >
                                                        {name.length > 22 ? `${name.slice(0, 19)}…` : name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <Button
                                            type="button"
                                            variant="default"
                                            className="h-9 shrink-0 px-4 text-xs font-semibold"
                                            disabled={uploadStatementLoading}
                                            aria-disabled={uploadStatementLoading}
                                            onClick={() => {
                                                const input = document.createElement("input");
                                                input.type = "file";
                                                input.multiple = true;
                                                input.onchange = async () => {
                                                    const files = input.files;
                                                    if (!files || files.length === 0) return;

                                                    const names = Array.from(files).map((f) => f.name);
                                                    setUploadedBankFiles(names);
                                                    console.log(
                                                        "Selected bank statement files:",
                                                        files,
                                                    );

                                                    const [firstFile] = Array.from(files);
                                                    try {
                                                        if (firstFile) {
                                                            const { csvContent, filename } =
                                                                await dispatch(
                                                                    uploadAndDownloadCsv(firstFile),
                                                                ).unwrap();

                                                            const blob = new Blob(
                                                                [
                                                                    typeof csvContent === "string"
                                                                        ? csvContent
                                                                        : String(csvContent),
                                                                ],
                                                                {
                                                                    type: "text/csv;charset=utf-8",
                                                                },
                                                            );
                                                            const url = URL.createObjectURL(blob);
                                                            const a = document.createElement("a");
                                                            a.href = url;
                                                            a.download = filename;
                                                            document.body.appendChild(a);
                                                            a.click();
                                                            a.remove();
                                                            URL.revokeObjectURL(url);
                                                        }

                                                        if (resolvedApplicationId) {
                                                            dispatch(
                                                                getBankDetails({
                                                                    application:
                                                                        resolvedApplicationId as string,
                                                                }),
                                                            );
                                                            dispatch(
                                                                getMonths({
                                                                    application:
                                                                        resolvedApplicationId as string,
                                                                }),
                                                            );
                                                            dispatch(
                                                                getPositions({
                                                                    application:
                                                                        resolvedApplicationId as string,
                                                                    force: true,
                                                                }),
                                                            );
                                                        }
                                                    } catch (err) {
                                                        console.error("Upload statement failed:", err);
                                                    }
                                                };
                                                input.click();
                                            }}
                                        >
                                            {uploadStatementLoading
                                                ? "Uploading..."
                                                : "Upload Bank Statement"}
                                        </Button>

                                        {uploadStatementError && (
                                            <span
                                                className="text-[11px] text-red-500"
                                                title={uploadStatementError}
                                            >
                                                {uploadStatementError.length > 26
                                                    ? `${uploadStatementError.slice(0, 23)}...`
                                                    : uploadStatementError}
                                            </span>
                                        )}
                                    </div>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    )}

                    {/* One Edit/Save pair for the whole page — Offer, Bank Analysis
                        and Positions unlock and save together. */}
                    {/* Shown in Preview too — Edit is how a saved offer is reopened. */}
                    {!readOnly && !startedEmpty && (
                        <div className="flex w-full items-center justify-end gap-2">
                            {pageEditMode ? (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 cursor-pointer px-4 text-xs font-medium"
                                        disabled={pageSaving}
                                        onClick={() => setPageEditMode(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        className="h-9 cursor-pointer gap-1.5 rounded-lg bg-[var(--brand)] px-4 text-xs font-medium text-white hover:bg-[var(--brand-hover)]"
                                        disabled={pageSaving}
                                        onClick={() => void handlePageSave()}
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        {pageSaving ? "Saving…" : "Save"}
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 cursor-pointer gap-1.5 px-4 text-xs font-medium"
                                    onClick={() => setPageEditMode(true)}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Offer + bank grid: tighter gap below offer actions; no add-bank/month on this tab */}
                    <div className="flex w-full flex-col gap-2">
                        <OfferDecisionToggle
                            editMode={pageEditMode || startedEmpty}
                            onRegisterSave={handleRegisterSaveOffer}
                            onDecisionLoaded={handleDecisionLoaded}
                            positions={livePositions as any}
                            bankTables={undefined}
                            bankTotalAvgNetCredit={bankNetCreditAvg ?? undefined}
                            applicationId={resolvedApplicationId || undefined}
                            disabled={readOnly}
                            showFooterActions={!readOnly}
                            actionsAtTop
                            showPreviewBadge
                            onPreviewModeChange={setIsPreviewMode}
                            offerDecision={offerDecisionState}
                            activePositionCountOverride={
                                positionTableMetrics?.activeCount
                            }
                            existingRemitOverride={positionTableMetrics?.existingRemit}
                            totalMonthlyFromPositionsOverride={
                                positionTableMetrics?.totalMonthlyFromPositions
                            }
                            totalDailyFromPositionsOverride={
                                positionTableMetrics?.totalDailyFromPositions
                            }
                            onApprove={handleApproveSaveAll}
                            onDecline={async () => {
                                setOfferDecisionState("declined");
                            }}
                        />
                        <BankAnalysisTable
                            editMode={pageEditMode || startedEmpty}
                            readOnly={componentsReadOnly}
                            disableCreate={componentsReadOnly || !enableCreate}
                            onNetCreditAverageChange={setBankNetCreditAvg}
                            positions={livePositions as any}
                            onBanksMetaChange={handleBanksMetaChange}
                            hideToolbarSave={!readOnly}
                            onRegisterSaveAll={readOnly ? undefined : handleRegisterSaveAllBanks}
                            autoSave={scrubbingAutoSave}
                            showCreditsTrend
                        />
                    </div>
                 
                    <div className="flex min-w-0 w-full flex-col gap-4">
                        <PositionTableCalculator
                            editMode={pageEditMode || startedEmpty}
                            applicationId={resolvedApplicationId || undefined}
                            positions={positionsForCalculator as any}
                            avgBankNetCredit={bankNetCreditAvg ?? undefined}
                            onMetricsChange={setPositionTableMetrics}
                            onRowsChange={handleRowsChange}
                            bankAllocationOptions={bankAllocationOptions}
                            readOnly={componentsReadOnly}
                            disableCreate={componentsReadOnly || !enableCreate}
                            hideRowSave
                            onRegisterSaveAll={handleRegisterSaveAllPositions}
                            autoSave={scrubbingAutoSave}
                        />
                    </div>
                </div>

            </div>

            {/* Full width under the positions table — deliberately outside the
                bank/positions flex row above, where it would have become a
                third column and squeezed both. */}
            <div className="mt-6 w-full min-w-0">
                {/* Additional Info sits directly above Notes, as it does on
                    mca-tool's bank-analysis page. */}
                <div className="mt-6 w-full min-w-0">
                  <ApplicationAdditionalInfo
                    applicationId={resolvedApplicationId || undefined}
                    readOnly={readOnly}
                    positions={positionsForCalculator}
                  />
                </div>

                <MyNotes applicationId={resolvedApplicationId || undefined} wide />
            </div>

            {/* New summary / table sections using reusable components */}

            {/* <PositionsTable /> */}
        </div>
    );
};

export default BankAnalysis;

