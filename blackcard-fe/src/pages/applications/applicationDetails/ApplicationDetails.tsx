import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LazyTabContent } from "@/components/application/LazyTabContent";
import { Button } from "@/components/ui/button";
import ApplicationSummary from "@/components/application/ApplicationSummary";
import SentToUnderwriterInfo from "@/components/application/SentToUnderwriterInfo";
import ReturnedForCorrectionBanner from "@/components/application/ReturnedForCorrectionBanner";
import AgentDealIsoTag from "@/components/application/AgentDealIsoTag";
import ApplicationBasicDetails from "@/components/application/ApplicationBasicDetails";
import CommentSection from "@/components/application/CommentSection";
import UploadedDocuments from "@/components/application/UploadedDocuments";
import MissingDocumentsPanel from "@/components/application/MissingDocumentsPanel";
import Approval from "@/components/application/Approval";
import RequiredDocument from "@/components/application/RequiredDocument";
import BankAnalysisTable from "@/components/application/BankAnalysisTable";
import BankAnalysis from "@/components/application/BankAnalysis";
import ChecksAndDecision from "@/components/application/ChecksAndDecision";
import SendApplicationToUnderwriter from "@/components/application/SendApplicationToUnderwriter";
import ContractTab from "@/components/application/ContractTab";
import ComplianceChecks from "@/components/application/ComplianceChecks";
import DecisionMakeFinalValues from "@/components/application/DecisionMakeFinalValues";
import EligibilityAnalysis from "@/components/application/EligibilityAnalysis";
import BackgroundCheckTab from "@/components/application/BackgroundCheckTab";
import AIAnalysisView from "@/components/aiAnalysis/AIAnalysisView";
import ScrubbingPreviewModal from "@/components/application/ScrubbingPreviewModal";

import { CasesDashboard } from "@/pages/case/CasesDashboard";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import {
    getApplicationByApplicationId,
    getApplicationById,
    updateApplicationQueue,
} from "@/redux/actions/applicationActions";
import {
    isNumericApplicationRouteParam,
    routeParamMatchesApplication,
} from "@/lib/applicationRouteMatch";
import { hydrateApplicationDetailFromCache } from "@/redux/slices/applicationSlice";
import {
  buildDetailHydrationPayload,
  findApplicationListRowForRoute,
  getCachedApplicationDetail,
  isApplicationDetailFetchFresh,
} from "@/lib/applicationDetailCache";
import type { Application } from "@/types/applicationTypes";
import { isFinalUnderwriterWorkflowQueue, isUnderwriterWorkflowDecisionStage } from "@/lib/applicationWorkflowState";
import { useTheme } from "@/context/ThemeContext";
import type { user } from "@/redux/slices/authSlice";
import { toast } from "react-toastify";
import FinalsAndFundingCallFlow from "@/components/application/FinalsAndFundingCallFlow";
import { Disbursement } from "@/pages/case/Disbursment";
import { useTabRouting, type TabOption } from "@/hooks/useTabRouting";
import {
    canOpenDisbursementTab,
    inferOperationsListStatusFromApplication,
    normalizeOperationsDashboardStatusParam,
    OPERATIONS_APPLICATIONS_LIST_ALL_QUERY,
} from "@/constants/operationsDashboardApplications";
import { getFundingCalls } from "@/redux/actions/fundingCallActions";
import {
    getOperationsPipelineStageTabId,
    getOperationsTabsForDashboardEntry,
    isOperationsPipelineTabBehindDealStage,
    SUPER_ADMIN_PIPELINE_TABS,
} from "@/constants/operationsPipelineTabs";
import { useTabAccess } from "@/hooks/useTabAccess.ts";
import FinalUnderwriterApplicationSummary from "@/components/application/FinalUnderwriterApplicationSummary";
import ApplicationSheetActivityLog from "@/components/application/ApplicationSheetActivityLog";
import ApplicationSheetMailLog from "@/components/application/ApplicationSheetMailLog";
import { ChevronLeft, ChevronRight, ScrollText, Mail } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getStageAccessForApplication } from "@/lib/applicationStageAccess";
import ApplicationProgressBar from "@/components/application/ApplicationProgressBar";
import { HorizontalScrollFade } from "@/components/ui/horizontal-scroll-fade";
import { normalizeRoleKey, resolveEffectiveRole } from "@/lib/sessionRole";
import { canUseNotAApplicationTag } from "@/lib/notMcaApplication";
import NotMcaApplicationTagPanel from "@/components/application/NotMcaApplicationTagPanel";
import { getRequiredClaim } from "@/lib/claimEditGuard";
import { claimFinalUnderwriterDeal } from "@/redux/actions/applicationActions";


const ApplicationDetails = () => {
    const { applicationId } = useParams<{ applicationId: string; tab?: string }>()
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [sendingToUnderwriter, setSendingToUnderwriter] = useState(false);
    const [agentSentToUnderwriter, setAgentSentToUnderwriter] = useState(false);
    const [auditLogOpen, setAuditLogOpen] = useState(false);
    const [mailLogOpen, setMailLogOpen] = useState(false);
    const [liveFundingCallStatus, setLiveFundingCallStatus] = useState<string | null>(null);
    const [showAiAnalysis, setShowAiAnalysis] = useState(false);
    const [showScrubbingPreview, setShowScrubbingPreview] = useState(false);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const dispatch = useDispatch<AppDispatch>();

    const [user, setUser] = useState<user>()
    const { loading, data } = useSelector((state: RootState) => state.login)

    const {
        loading: applicationDetailLoading,
        isRefreshing: applicationDetailRefreshing,
        data: applicationData,
        error: applicationDetailError,
    } = useSelector((state: RootState) => state.applicationDetail);
    const applicationsListRows = useSelector(
        (state: RootState) => state.applications.data,
    );

    // Removed debug logging to avoid slowing down render on tab refresh.





    const status = (applicationData as any)?.currentState || (applicationData as any)?.status;
    const queue = (applicationData as any)?.currentQueue || (applicationData as any)?.queue;
    const explicitStatus = (applicationData as any)?.status;
    const currentState = (applicationData as any)?.currentState as string | undefined;
    const statsCurrentState = (applicationData as any)?.statsCurrentState as string | undefined;
    const applicationUuid = (applicationData as any)?._id ?? (applicationData as any)?.id ?? null;
    /** Same Mongo id the preview sheet uses for `/applications/:id/activity-logs`. */
    const activityLogApplicationId =
        applicationUuid != null ? String(applicationUuid) : "";


    const resolvedApplicationId =
        (applicationData as any)?.applicationId ??
        (applicationData as any)?._id ??
        applicationId ??
        null;
    /** UUID or numeric applicationId — backend accepts either for PATCH `/applications/:id/queue`. */
    const queueUpdateApplicationRef =
        activityLogApplicationId ||
        (resolvedApplicationId != null ? String(resolvedApplicationId) : "") ||
        (applicationId ? String(applicationId) : "");

    useEffect(() => {
        setUser(data?.user)
        if (!data?.user) {
            const storedUser = localStorage.getItem('user')
            if (storedUser) {
                setUser(JSON.parse(storedUser))
            }
        }
    }, [data, loading])

    const userRole = resolveEffectiveRole(user);
    const roleKey = normalizeRoleKey(userRole);
    const isSuperAdmin = roleKey === "SUPER_ADMIN";
    const isUnderwriter = roleKey === 'SCRUBBING' || roleKey === 'UNDERWRITER';
    const isPlainUnderwriter = roleKey === 'SCRUBBING';
    const canShowNotAApplicationTag = canUseNotAApplicationTag(roleKey);
    const isFinalUnderwriter = roleKey === 'UNDERWRITER';
    const isAgent = roleKey === 'AGENT';
    const canEditIsoDetails =
        isSuperAdmin || isAgent || roleKey === "OPERATIONS";
    const hideBusinessProfileOnDecisionMakingTab =
        roleKey === "SCRUBBING" ||
        roleKey === "OPERATIONS" ||
        roleKey === "SUPER_ADMIN";
    /** Operations + Super Admin use the same funding-pipeline tab strip and `?operationsStatus=` depth rules. */
    const useOperationsPipelineTabs =
        roleKey === "OPERATIONS" || roleKey === "SUPER_ADMIN";
    const operationsStatusQueryRaw = searchParams.get("operationsStatus");
    const operationsEntryStatus = useMemo(
        () =>
            normalizeOperationsDashboardStatusParam(operationsStatusQueryRaw),
        [operationsStatusQueryRaw],
    );

    const applicationAligned = Boolean(
        applicationId &&
        applicationData &&
        routeParamMatchesApplication(applicationId, applicationData),
    );

    /**
     * URL `operationsStatus` wins when set to a known stage.
     * Otherwise infer from the loaded app (e.g. deep link from Operations dashboard with a hint).
     *
     * SUPER_ADMIN always sees the full pipeline strip (Overview → Disbursement), ignoring stage trim.
     * OPERATIONS opening from the main Applications list (no stage query, or `all`) sees the full
     * strip for that stage set; Operations early tabs stay read-only via `isOperationsReadOnlyPipelineTab`.
     */
    const effectiveOperationsStatus = useMemo(() => {
        if (!useOperationsPipelineTabs) return null;
        const trimmedOpsStatus = operationsStatusQueryRaw?.trim() ?? "";
        /** Same as Operations: browsing Applications / “all” without a stage should show the full pipeline strip. */
        const operationsOpenedWithoutStageFilter =
            (roleKey === "OPERATIONS" || roleKey === "SUPER_ADMIN") &&
            (!trimmedOpsStatus ||
                trimmedOpsStatus.toLowerCase() ===
                OPERATIONS_APPLICATIONS_LIST_ALL_QUERY);
        if (operationsOpenedWithoutStageFilter) {
            return null;
        }
        if (operationsEntryStatus) return operationsEntryStatus;
        if (!applicationAligned) return null;
        return inferOperationsListStatusFromApplication(queue, {
            explicitStatus,
            currentState,
        });
    }, [
        useOperationsPipelineTabs,
        roleKey,
        operationsStatusQueryRaw,
        operationsEntryStatus,
        applicationAligned,
        queue,
        explicitStatus,
        currentState,
    ]);

    const handleSummaryMetricsChange = useCallback(
        (_payload: {
            activePositions: number;
            existingLeveragePct: number;
            totalLeveragePct: number;
            loading: boolean;
        }) => {
            // Reserved for future header metrics; DecisionMakeFinalValues still reports totals.
        },
        []
    );

    // Determine tabs based on status and user role
    const getTabs = () => {
        const isCompleted = status?.toLowerCase() === 'completed';
        const isApprovedStatus = explicitStatus?.toLowerCase() === 'approved';
        const isApprovedQueue = typeof queue === 'string' && queue.toLowerCase() === 'approved';
        const queueNorm = typeof queue === 'string' ? queue.trim().toLowerCase() : '';
        const isSentToFinalUnderwriter = isFinalUnderwriterWorkflowQueue(queue);
        /** After "Generate contract", queue moves here — keep CONTRACT tab so FUW is not locked out. */
        const isContractedQueue =
            queueNorm === 'contracted' ||
            queueNorm === 'contract pending' ||
            queueNorm === 'contract generated' ||
            queueNorm === 'contract sent' ||
            queueNorm === 'contract cancelled' ||
            queueNorm === 'contract signed' ||
            queueNorm === 'contract out' ||
            queueNorm === 'contracts out';
        // const stateNorm =
        //     typeof currentState === 'string' ? currentState.trim().toLowerCase() : '';
        // const isApprovedCurrentState =
        //     stateNorm === 'approved' ||
        //     stateNorm === 'completed' ||
        //     stateNorm === 'contracted';

        // UNDERWRITER (final review): overview with ISO, then pipeline tabs through decision making.
        // CONTRACT and DECISION LOGIC tabs are intentionally omitted — only Operations / Super Admin get them.
        if (isFinalUnderwriter) {
            return [
                { id: "overview", label: "OVERVIEW" },
                { id: "documents", label: "DOCUMENTS" },
                { id: "background-check", label: "BACKGROUND CHECK" },
                { id: "decision-making", label: "DECISION MAKING" },
            ];
        }

        // SCRUBBING (not final): scrubbing merges bank analysis + decision making
        if (isUnderwriter) {
            return [
                { id: "overview", label: "OVERVIEW" },
                { id: "documents", label: "DOCUMENTS" },
                { id: "background-check", label: "BACKGROUND CHECK" },
                { id: "decision-making", label: "SCRUBBING" },
            ];
        }

        // For non-scrubbing users:
        // - Before sending to Underwriter: show only first two tabs (Overview, Documents)
        // - After sending (queue === "Final Review") or when Completed or when status/queue indicate Approved: show all four tabs
        if (
            isCompleted ||
            isSentToFinalUnderwriter ||
            isApprovedStatus ||
            isApprovedQueue ||
            isContractedQueue
        ) {
            // DECISION LOGIC tab is intentionally omitted — only Operations / Super Admin get it.
            return [
                { id: "overview", label: "OVERVIEW" },
                { id: "documents", label: "DOCUMENTS" },
                { id: "approval", label: "APPROVAL" },
                { id: "contract", label: "CONTRACT" },
            ];
        }

        return [
            { id: "overview", label: "OVERVIEW" },
            { id: "documents", label: "DOCUMENTS" },
        ];
    };

    const tabs = useMemo((): TabOption[] => {
        let list: TabOption[];
        if (useOperationsPipelineTabs) {
            list = isSuperAdmin
                ? [...SUPER_ADMIN_PIPELINE_TABS]
                : getOperationsTabsForDashboardEntry(effectiveOperationsStatus);
        } else {
            list = getTabs();
        }
        // Background Check tab — Super Admin only — immediately before Contract.
        if (isSuperAdmin && !list.some((t) => t.id === "background-check")) {
            const bc: TabOption = { id: "background-check", label: "BACKGROUND CHECK" };
            const contractIdx = list.findIndex((t) => t.id === "contract");
            const at =
                contractIdx >= 0
                    ? contractIdx
                    : (() => {
                            const overviewIdx = list.findIndex((t) => t.id === "overview");
                            return overviewIdx >= 0 ? overviewIdx + 1 : list.length;
                        })();
            list = [...list.slice(0, at), bc, ...list.slice(at)];
        }
        return list;
    }, [
        effectiveOperationsStatus,
        useOperationsPipelineTabs,
        isSuperAdmin,
        status,
        explicitStatus,
        queue,
        currentState,
        isFinalUnderwriter,
        isUnderwriter,
    ]);

    const { data: fundingCallsForApp, loading: fundingCallsLoading } = useSelector(
        (state: RootState) => state.fundingCalls,
    );

    const latestFundingCallStatus = useMemo(() => {
        const rows = fundingCallsForApp;
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const latest = rows[0] as { callStatus?: string };
        return latest?.callStatus ?? null;
    }, [fundingCallsForApp]);

    const effectiveFundingCallStatus =
        liveFundingCallStatus ?? latestFundingCallStatus;

    useEffect(() => {
        setLiveFundingCallStatus(null);
    }, [resolvedApplicationId]);

    useEffect(() => {
        if (!useOperationsPipelineTabs || !resolvedApplicationId) return;
        void dispatch(
            getFundingCalls({ application: String(resolvedApplicationId) }),
        );
    }, [useOperationsPipelineTabs, resolvedApplicationId, dispatch]);

    const canSelectOperationsDisbursementTab = useMemo(
        () =>
            canOpenDisbursementTab(queue, {
                explicitStatus,
                currentState,
                latestFundingCallStatus: effectiveFundingCallStatus,
            }),
        [queue, explicitStatus, currentState, effectiveFundingCallStatus],
    );

    const handleFundingCallStatusChange = useCallback((status: string) => {
        setLiveFundingCallStatus(status.trim() ? status : null);
    }, []);

    const tabsForOperationsUi = useMemo(() => {
        if (!useOperationsPipelineTabs) return tabs;
        const disbursementLocked =
            !canSelectOperationsDisbursementTab && !fundingCallsLoading;
        return tabs.map((t) =>
            t.id === "disbursement" && disbursementLocked
                ? { ...t, disabled: true as const }
                : t,
        );
    }, [
        tabs,
        useOperationsPipelineTabs,
        canSelectOperationsDisbursementTab,
        fundingCallsLoading,
    ]);

    const defaultTabForRouting = useMemo(() => {
        if (useOperationsPipelineTabs && effectiveOperationsStatus) {
            const stageTab = getOperationsPipelineStageTabId(
                effectiveOperationsStatus,
            );
            if (tabs.some((t) => t.id === stageTab)) return stageTab;
        }
        return tabs[0]?.id ?? "overview";
    }, [tabs, useOperationsPipelineTabs, effectiveOperationsStatus]);

    const isLoadingCurrentApplication =
        !applicationId ||
        (applicationDetailLoading && !applicationData) ||
        (!!applicationData &&
            !routeParamMatchesApplication(applicationId, applicationData));

    const showApplicationLoadError =
        Boolean(applicationDetailError) &&
        !applicationDetailLoading &&
        (!applicationData ||
            !routeParamMatchesApplication(applicationId, applicationData));

    const isTabsReady = !isLoadingCurrentApplication && !showApplicationLoadError;

    const refetchApplicationDetail = useCallback(() => {
        if (!applicationId) return;
        if (isNumericApplicationRouteParam(applicationId)) {
            void dispatch(getApplicationByApplicationId(applicationId));
        } else {
            void dispatch(getApplicationById(applicationId));
        }
    }, [applicationId, dispatch]);

    const { activeTab, handleTabChange } = useTabRouting(
        tabs,
        applicationId,
        defaultTabForRouting,
        { isTabsReady, clampInvalidUrlTab: true },
    );

    useEffect(() => {
        if (!isTabsReady || !useOperationsPipelineTabs) return;
        if (activeTab !== "disbursement") return;
        if (canSelectOperationsDisbursementTab) return;
        if (!applicationId) return;
        const fallback =
            tabs.find((t) => t.id !== "disbursement")?.id ?? defaultTabForRouting;
        handleTabChange(fallback);
    }, [
        isTabsReady,
        useOperationsPipelineTabs,
        activeTab,
        canSelectOperationsDisbursementTab,
        applicationId,
        tabs,
        defaultTabForRouting,
        handleTabChange,
    ]);

    /** Bank Analysis tab merged into Scrubbing for plain underwriters — remap legacy URLs. */
    useEffect(() => {
        if (!isTabsReady || !isPlainUnderwriter) return;
        if (activeTab !== "bank-analysis") return;
        handleTabChange("decision-making");
    }, [isTabsReady, isPlainUnderwriter, activeTab, handleTabChange]);

    /** Final + Funding Call merged into one pipeline tab — remap legacy URLs. */
    useEffect(() => {
        if (!isTabsReady || !useOperationsPipelineTabs) return;
        if (activeTab !== "final" && activeTab !== "funding-call") return;
        handleTabChange("finals-and-funding-call");
    }, [isTabsReady, useOperationsPipelineTabs, activeTab, handleTabChange]);

    const handleOperationsTabChange = useCallback(
        (next: string) => {
            const row = tabsForOperationsUi.find((t) => t.id === next);
            if (row?.disabled) return;
            handleTabChange(next);
        },
        [tabsForOperationsUi, handleTabChange],
    );


    const OPERATIONS_READ_ONLY_PIPELINE_TAB_IDS = useMemo(
        () =>
            new Set([
                "overview",
                "documents",
                "contract",
                "approval",
            ]),
        [],
    );

    /** Loaded deal stage for Operations / Super Admin pipeline (always from app queue, not URL filter). */
    const applicationOperationsDealStatus = useMemo(() => {
        if (!useOperationsPipelineTabs || !applicationAligned) return null;
        return inferOperationsListStatusFromApplication(queue, {
            explicitStatus,
            currentState,
        });
    }, [
        useOperationsPipelineTabs,
        applicationAligned,
        queue,
        explicitStatus,
        currentState,
    ]);

    const isOperationsTabBehindCurrentDeal = useMemo(() => {
        if (!useOperationsPipelineTabs) return false;
        return isOperationsPipelineTabBehindDealStage(
            activeTab,
            applicationOperationsDealStatus,
            tabsForOperationsUi,
        );
    }, [
        useOperationsPipelineTabs,
        activeTab,
        applicationOperationsDealStatus,
        tabsForOperationsUi,
    ]);

    const isWorkflowRole =
        roleKey === "AGENT" ||
        roleKey === "SCRUBBING" ||
        roleKey === "UNDERWRITER";
    const isViewOnlyBrowse =
        searchParams.get("viewOnly") === "1" && !isWorkflowRole;

    const stageAccess = useMemo(
        () => getStageAccessForApplication(applicationData as any, roleKey, {
            viewOnlyBrowse: false,
            userId: (data as { user?: { id?: string | null } } | null)?.user?.id ?? null,
        }),
        [applicationData, roleKey, data],
    );
    const isStagePreview = stageAccess.isPreview;
    const underwriterWorkflowDecisionActive = useMemo(() => {
        if (!isFinalUnderwriter) return false;
        return isUnderwriterWorkflowDecisionStage(applicationData as Application | null);
    }, [isFinalUnderwriter, applicationData]);
    const underwriterDecisionPreviewMode =
        isStagePreview && !underwriterWorkflowDecisionActive;
    const isOperationsReadOnlyPipelineTab =
        (useOperationsPipelineTabs &&
            (OPERATIONS_READ_ONLY_PIPELINE_TAB_IDS.has(activeTab) ||
                isOperationsTabBehindCurrentDeal)) ||
        isViewOnlyBrowse ||
        isStagePreview;
    /**
     * Documents tab upload/delete: workflow roles (Agent, Scrubbing) keep upload even in
     * stage-preview; Super Admin keeps upload on Documents. Operations pipeline early tabs
     * stay view-only for OPERATIONS only.
     */
    /**
     * Underwriter on a deal in the Underwriter queue nobody has claimed yet: the
     * backend refuses every change until it is claimed, so open it read-only
     * with a Claim button. Judged only once this deal's own detail (with its
     * assignment fields) is loaded, so a claimed deal is never locked by mistake.
     */
    const requiredClaim =
        applicationAligned &&
        applicationData &&
        roleKey === "UNDERWRITER" &&
        ("assignedUnderwriterId" in (applicationData as object) ||
            "assignedUnderwriter" in (applicationData as object))
            ? getRequiredClaim(roleKey, applicationData as any)
            : null;
    const claimLocked = requiredClaim !== null;
    const [isClaiming, setIsClaiming] = useState(false);
    const handleClaimDeal = async () => {
        const id = (applicationData as any)?._id ?? (applicationData as any)?.id;
        if (!id) return;
        setIsClaiming(true);
        try {
            await dispatch(claimFinalUnderwriterDeal({ applicationId: String(id) })).unwrap();
            toast.success("Application claimed");
            void dispatch(getApplicationById(String(id)));
        } catch (e: unknown) {
            toast.error(typeof e === "string" ? e : "Could not claim this deal");
        } finally {
            setIsClaiming(false);
        }
    };

    const uploadedDocumentsReadOnly =
        claimLocked ||
        (useOperationsPipelineTabs &&
            roleKey === "OPERATIONS" &&
            (OPERATIONS_READ_ONLY_PIPELINE_TAB_IDS.has(activeTab) ||
                isOperationsTabBehindCurrentDeal)) ||
        isViewOnlyBrowse;
    /**
     * Super Admin may edit offer, bank analysis, positions, and workflow actions on any
     * pipeline tab (including past stages), same as full access on Bank Analysis.
     */
    const superAdminPipelineEditOverride = isSuperAdmin && !isViewOnlyBrowse;
    /**
     * OPERATIONS may edit offer, bank analysis, and position values on any pipeline
     * stage (including past tabs), regardless of where the deal currently sits.
     * Scope is limited to those values — all other Operations access (documents,
     * contract, workflow actions) keeps the existing stage rules. View-only browse
     * links stay read-only.
     */
    const operationsValueEditOverride =
        roleKey === "OPERATIONS" && !isViewOnlyBrowse;
    /** Most pipeline stages: no edits for Operations on past tabs / view-only browse / workflow preview. */
    const pipelineStageReadOnly =
        claimLocked ||
        (!superAdminPipelineEditOverride &&
            (isOperationsReadOnlyPipelineTab || isViewOnlyBrowse || isStagePreview));
    /**
     * SCRUBBING (not Underwriter): full offer / bank / position edits on deals
     * still at the scrubbing stage. Other roles keep existing rules.
     */
    const plainUnderwriterWorkflowEdit =
        isPlainUnderwriter && !pipelineStageReadOnly && !isViewOnlyBrowse;
    const bankAnalysisTabReadOnly =
        pipelineStageReadOnly && !operationsValueEditOverride;
    /** Offer + positions on Decision Making (underwriters, Operations always, Super Admin always). */
    const canEditDecisionMakingFinalValues =
        operationsValueEditOverride ||
        ((isUnderwriter || superAdminPipelineEditOverride) &&
            !pipelineStageReadOnly);
    /** OPERATIONS may comment; block composer for `?viewOnly=1` browse links and stage-preview viewers. */
    const commentsReadOnly = isViewOnlyBrowse || isStagePreview;
    const normalizeWorkflowToken = (value: unknown) =>
        String(value ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    const queueKey = normalizeWorkflowToken(queue);
    const stateNorm = normalizeWorkflowToken(
        currentState || status || statsCurrentState || "",
    );
    /** Past agent intake — do not offer "Send to Scrubbing". (Do not include `review`; backend still treats Review as agent-side.) */
    const postAgentIntakeQueues = new Set([
        "scrubbing",
        "underwriting",
        "final review",
        "final scrubbing",
        "approved",
        "contracted",
        "contract out",
        "contracts out",
        "funding call",
        "disbursment",
        "disbursement",
        "funded",
        "final",
    ]);
    const isPastAgentIntakeQueue = postAgentIntakeQueues.has(queueKey);
    const agentIntakeQueues = new Set(["new", "agent", "on hold", "review", ""]);
    const pendingLikeState =
        stateNorm === "pending" ||
        stateNorm === "draft";
    const isPreUnderwriterStage =
        !isPastAgentIntakeQueue &&
        (agentIntakeQueues.has(queueKey) || pendingLikeState);
    /** Agent intake only — Super Admin / Admin / Operations must not send from Documents. */
    const canActSendToUnderwriter = isAgent;
    const canShowSendToUnderwriterButton =
        canActSendToUnderwriter &&
        !isViewOnlyBrowse &&
        !isStagePreview &&
        isPreUnderwriterStage &&
        !agentSentToUnderwriter &&
        Boolean(queueUpdateApplicationRef) &&
        !applicationDetailLoading;

    const changeTabScrollTop = useCallback(
        (tabId: string) => {
            if (useOperationsPipelineTabs) {
                const target = tabsForOperationsUi.find((t) => t.id === tabId);
                if (target?.disabled) return;
            }
            handleTabChange(tabId);
            requestAnimationFrame(() => {
                window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            });
        },
        [useOperationsPipelineTabs, tabsForOperationsUi, handleTabChange],
    );

    const { isAllowed, fallbackComponent } = useTabAccess(tabs, activeTab);
    const canRenderTabContent = isTabsReady && isAllowed;
    const showAccessDenied = isTabsReady && !isAllowed;

    const tabStepFooter = useMemo(() => {
        if (!canRenderTabContent || tabsForOperationsUi.length < 2) return null;
        const ui = tabsForOperationsUi;
        const idx = ui.findIndex((t) => t.id === activeTab);
        if (idx < 0) return null;
        let prevTab: (typeof ui)[number] | null = null;
        for (let i = idx - 1; i >= 0; i--) {
            if (!ui[i]?.disabled) {
                prevTab = ui[i]!;
                break;
            }
        }
        let nextTab: (typeof ui)[number] | null = null;
        for (let i = idx + 1; i < ui.length; i++) {
            if (!ui[i]?.disabled) {
                nextTab = ui[i]!;
                break;
            }
        }
        return (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
                <Button
                    type="button"
                    variant="outline"
                    className="min-w-[8rem]"
                    disabled={!prevTab}
                    onClick={() => prevTab && changeTabScrollTop(prevTab.id)}
                >
                    <ChevronLeft className="mr-1 h-4 w-4 shrink-0" aria-hidden />
                    Back
                </Button>
                <Button
                    type="button"
                    variant="default"
                    className="min-w-[8rem] disabled:opacity-40"
                    disabled={!nextTab}
                    onClick={() => nextTab && changeTabScrollTop(nextTab.id)}
                >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4 shrink-0" aria-hidden />
                </Button>
            </div>
        );
    }, [canRenderTabContent, tabsForOperationsUi, activeTab, changeTabScrollTop]);

    // Fetch application data when in edit mode.
    // Guard against redundant network calls (helps refresh/navigation latency).
    const applicationDetailRef = useRef(applicationData);
    const initialDetailRequestRef = useRef<string | null>(null);
    useEffect(() => {
        applicationDetailRef.current = applicationData;
    }, [applicationData]);

    useEffect(() => {
        setAuditLogOpen(false);
        setMailLogOpen(false);
    }, [applicationId]);

    useEffect(() => {
        setAgentSentToUnderwriter(false);
    }, [applicationId]);

    useEffect(() => {
        if (!applicationId) return;

        const preview = (location.state as { applicationPreview?: Application } | null)
            ?.applicationPreview;
        const fromList = findApplicationListRowForRoute(
            applicationId,
            applicationsListRows,
        );
        const seed =
            preview && routeParamMatchesApplication(applicationId, preview)
                ? preview
                : fromList;
        if (
            seed &&
            !routeParamMatchesApplication(applicationId, applicationDetailRef.current)
        ) {
            dispatch(hydrateApplicationDetailFromCache({ success: true, data: seed }));
        }

        // Only warm from detail cache when there is no list/preview row — stale cache must not
        // overwrite a fresher applications-table `currentQueue`.
        if (!seed) {
            const cachedBody = getCachedApplicationDetail(applicationId);
            const cachedPayload = buildDetailHydrationPayload(cachedBody);
            if (
                cachedPayload &&
                !routeParamMatchesApplication(applicationId, applicationDetailRef.current)
            ) {
                dispatch(hydrateApplicationDetailFromCache(cachedBody));
            }
        }

    }, [applicationId, applicationsListRows, dispatch, location.state]);

    // Fetch separately from cache/list hydration. A fulfilled request patches the applications
    // list, so including that list in this effect would create a request -> list update loop.
    useEffect(() => {
        if (!applicationId) return;
        const requestKey = String(applicationId).trim();
        if (
            initialDetailRequestRef.current === requestKey ||
            isApplicationDetailFetchFresh(requestKey)
        ) {
            return;
        }
        initialDetailRequestRef.current = requestKey;

        if (isNumericApplicationRouteParam(requestKey)) {
            void dispatch(getApplicationByApplicationId(requestKey));
        } else {
            void dispatch(getApplicationById(requestKey));
        }
    }, [applicationId, dispatch]);

    const handleSendToUnderwriter = async () => {
        if (!queueUpdateApplicationRef) {
            toast.error("Submission ID is missing. Please refresh the page and try again.");
            return;
        }
        setSendingToUnderwriter(true);
        const toastId = toast.loading("Sending application to Scrubbing...");
        try {
            await dispatch(
                updateApplicationQueue({
                    id: queueUpdateApplicationRef,
                    data: { currentQueue: "Scrubbing" },
                }),
            ).unwrap();
            setAgentSentToUnderwriter(true);
            toast.update(toastId, {
                render: "Submission has been sent to Scrubbing.",
                type: "success",
                isLoading: false,
                autoClose: 2500,
            });
            refetchApplicationDetail();
        } catch (error) {
            console.error("Failed to send application to Scrubbing:", error);
            const apiMessage =
                typeof error === "string" && error.trim()
                    ? error.trim()
                    : "Failed to send application to Scrubbing. Please try again.";
            toast.update(toastId, {
                render: apiMessage,
                type: "error",
                isLoading: false,
                autoClose: 6000,
            });
        } finally {
            setSendingToUnderwriter(false);
        }
    };




    const externalLinksRow =
        isSuperAdmin && activityLogApplicationId ? (
            <div className="flex items-center gap-6 flex-wrap">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setMailLogOpen((open) => !open);
                        if (!mailLogOpen) setAuditLogOpen(false);
                    }}
                    aria-expanded={mailLogOpen}
                    aria-haspopup="dialog"
                    aria-pressed={mailLogOpen}
                    className="group shrink-0 gap-2 rounded-full border border-cyan-700/25 bg-gradient-to-b from-cyan-500/[0.08] to-cyan-500/[0.03] px-4 py-2 text-sm font-semibold text-cyan-900 shadow-sm transition-all hover:border-cyan-700/40 hover:from-cyan-500/15 hover:to-cyan-500/08 hover:shadow-md active:scale-[0.98] dark:border-cyan-400/35 dark:from-cyan-400/15 dark:to-cyan-400/5 dark:text-cyan-100"
                >
                    <Mail
                        className="h-4 w-4 shrink-0 opacity-90 transition-transform group-hover:scale-105"
                        aria-hidden
                    />
                    Mail log
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setAuditLogOpen((open) => !open);
                        if (!auditLogOpen) setMailLogOpen(false);
                    }}
                    aria-expanded={auditLogOpen}
                    aria-haspopup="dialog"
                    aria-pressed={auditLogOpen}
                    className="group shrink-0 gap-2 rounded-full border border-[var(--brand)]/30 bg-gradient-to-b from-[var(--brand)]/[0.1] to-[var(--brand)]/[0.04] px-4 py-2 text-sm font-semibold text-[var(--brand)] shadow-sm transition-all hover:border-[var(--brand)]/45 hover:from-[var(--brand)]/15 hover:to-[var(--brand)]/08 hover:shadow-md active:scale-[0.98] dark:border-primary/35 dark:from-primary/20 dark:to-primary/8 dark:text-foreground dark:hover:border-primary/50"
                >
                    <ScrollText
                        className="h-4 w-4 shrink-0 opacity-90 transition-transform group-hover:scale-105"
                        aria-hidden
                    />
                    Activity log
                </Button>
            </div>
        ) : null;

    return (
        <div
            className={`min-h-screen bg-background p-4 md:p-6 transition-opacity duration-300 ${
                applicationDetailRefreshing ? "opacity-90" : "opacity-100"
            }`}
        >
            <div className="mx-auto min-w-0 max-w-screen-2xl">
                {applicationAligned ? (
                    <ApplicationProgressBar
                        application={applicationData as any}
                        className="mb-6"
                    />
                ) : null}
                {requiredClaim ? (
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                        <span>
                            <span className="font-semibold">Claim this deal first.</span>{" "}
                            You can review it, but approve, decline and offer edits stay locked until you claim it.
                        </span>
                        <button
                            type="button"
                            onClick={() => void handleClaimDeal()}
                            disabled={isClaiming}
                            className="rounded-md bg-[var(--brand)] px-4 py-1.5 font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isClaiming ? "Claiming…" : "Claim deal"}
                        </button>
                    </div>
                ) : null}
                {isFinalUnderwriter ? (
                    /* UNDERWRITER: 1) Tab row (tabs + links) 2) Submission Summary below tabs 3) Tab content */
                    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                        {/* Row 1: Tabs (left) + Links (right) */}
                        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <HorizontalScrollFade className="min-w-0 w-full flex-1" scrollKey={activeTab}>
                            <TabsList className="bg-transparent cursor-pointer p-0 h-auto flex w-max flex-nowrap items-center shrink-0">
                                {tabs.map((tab, index) => {
                                    const isActive = activeTab === tab.id;
                                    const isFirst = index === 0;
                                    const isLast = index === tabs.length - 1;
                                    const zIndex = isActive ? 10 : tabs.length - index;
                                    const clipPath = isFirst
                                        ? "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%)"
                                        : isLast
                                            ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 18px 50%)"
                                            : "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%, 18px 50%)";
                                    const triggerClip = isFirst
                                        ? "polygon(0 0, calc(100% - 20px) 0, calc(100% - 2px) 50%, calc(100% - 20px) 100%, 0 100%)"
                                        : isLast
                                            ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 20px 50%)"
                                            : "polygon(0 0, calc(100% - 20px) 0, calc(100% - 2px) 50%, calc(100% - 20px) 100%, 0 100%, 20px 50%)";
                                    return (
                                        <div key={tab.id} className="relative" style={{ marginLeft: isFirst ? 0 : -18, zIndex }}>
                                            <div className={`absolute inset-0 ${isDark ? 'bg-gray-600' : 'bg-white'}`} style={{ clipPath }} />
                                            <TabsTrigger
                                                value={tab.id}
                                                className={`relative cursor-pointer whitespace-nowrap px-5 py-2.5 text-xs font-bold border-0 shadow-none rounded-none sm:px-6 sm:text-sm lg:px-8 data-[state=active]:shadow-none ${isActive ? "tab-pipeline-active" : ""}`}
                                                style={{
                                                    ...(isActive
                                                        ? { color: "#FFFFFF" }
                                                        : { backgroundColor: '#E8E9EC80', color: '#000000' }),
                                                    clipPath: triggerClip,
                                                }}
                                            >
                                                {tab.label}
                                            </TabsTrigger>
                                        </div>
                                    );
                                })}
                            </TabsList>
                            </HorizontalScrollFade>
                            {externalLinksRow ? (
                                <div className="shrink-0">{externalLinksRow}</div>
                            ) : null}
                        </div>
                        {/* Row 2: Submission Summary (same five-column layout as all roles) */}
                        <FinalUnderwriterApplicationSummary
                            applicationId={applicationId}
                            onBack={() => navigate(-1)}
                        />
                        {canRenderTabContent ? (
                            <>
                                <LazyTabContent activeTab={activeTab} value="overview" className="mt-6">
                                    <AgentDealIsoTag applicationId={applicationId} alwaysEditable={canEditIsoDetails} />
                                    <ApplicationBasicDetails applicationId={applicationId} />
                                </LazyTabContent>
                                <LazyTabContent activeTab={activeTab} value="documents" className="mt-6">
                                    <MissingDocumentsPanel />
                                    <UploadedDocuments readOnly={uploadedDocumentsReadOnly} />
                                </LazyTabContent>
                                <LazyTabContent activeTab={activeTab} value="background-check" className="mt-6">
                                    <BackgroundCheckTab />
                                </LazyTabContent>
                                <LazyTabContent activeTab={activeTab} value="decision-making" className="mt-6">
                                    <div className="flex items-center gap-2 mt-3 mb-2">
                                        <Button
                                            variant={showAiAnalysis ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setShowAiAnalysis(!showAiAnalysis)}
                                            className="gap-1.5"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 0-4 4c0 2 1 3 2 4l-6 6v2h4l6-6c1 1 2 2 4 2a4 4 0 0 0 0-8"/><path d="M2.5 21.5l3-3"/></svg>
                                            AI Analysis
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowScrubbingPreview(true)}
                                        >
                                            Preview
                                        </Button>
                                    </div>
                                    {showAiAnalysis && (
                                        <div className="mt-2 mb-4 border rounded-lg p-4 bg-white shadow-sm">
                                            <AIAnalysisView
                                                applicationId={applicationId}
                                                onApplied={() => setShowAiAnalysis(false)}
                                            />
                                        </div>
                                    )}
                                    <DecisionMakeFinalValues
                                            applicationId={applicationId}
                                            showNotesPanel
                                            startInPreview
                                            allowOfferEdit
                                            allowPositionsEdit
                                            onSummaryMetricsChange={handleSummaryMetricsChange}
                                            betweenOfferAndPositions={({
                                                componentsReadOnly,
                                                onRegisterBankSaveAll,
                                                applicationId: bankAppId,
                                                positionsForBankTable,
                                                editMode,
                                            }) => (
                                                <BankAnalysisTable
                                                    editMode={editMode}
                                                    disableDelete
                                                    disableCreate
                                                    readOnly={componentsReadOnly}
                                                    onRegisterSaveAll={onRegisterBankSaveAll}
                                                    applicationId={bankAppId}
                                                    positions={positionsForBankTable as any}
                                                showCreditsTrend
                                                />
                                            )}
                                        />
                                    <div className="flex flex-row gap-4 w-full mt-10 items-start">
                                        <div className="flex-[7] min-w-0 h-[480px] flex flex-col overflow-hidden">
                                            <CommentSection compactLayout readOnly={commentsReadOnly} />
                                        </div>
                                        <div className="flex-[3] min-w-0 flex flex-col">
                                            <ChecksAndDecision
                                                isFinalUnderwriter={true}
                                                previewMode={
                                                    claimLocked ||
                                                    (underwriterDecisionPreviewMode &&
                                                        !underwriterWorkflowDecisionActive)
                                                }
                                                compactLayout
                                            />
                                        </div>
                                    </div>
                                </LazyTabContent>
                                <LazyTabContent activeTab={activeTab} value="eligibility-analysis" className="mt-6">
                                    <EligibilityAnalysis />
                                </LazyTabContent>
                            </>
                        ) : showAccessDenied ? (
                            fallbackComponent
                        ) : showApplicationLoadError ? (
                            <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-10 text-center shadow-[0px_4px_20px_0px_rgba(0,0,0,0.06)] dark:shadow-[0px_4px_24px_0px_rgba(0,0,0,0.35)]">
                                <p className="text-sm font-medium text-destructive">
                                    {applicationDetailError}
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="mt-4"
                                    onClick={refetchApplicationDetail}
                                >
                                    Try again
                                </Button>
                            </div>
                        ) : (
                            <div className="mt-6 flex items-center justify-center rounded-lg border border-border bg-card p-10 shadow-[0px_4px_20px_0px_rgba(0,0,0,0.06)] dark:shadow-[0px_4px_24px_0px_rgba(0,0,0,0.35)]">
                                <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <span className="inline-block h-4 w-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                                    Loading application details...
                                </div>
                            </div>
                        )}
                        {tabStepFooter}
                    </Tabs>
                ) : null}
                {!isFinalUnderwriter && (
                    <Tabs
                        value={activeTab}
                        onValueChange={
                            useOperationsPipelineTabs
                                ? handleOperationsTabChange
                                : handleTabChange
                        }
                        className="w-full"
                    >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <HorizontalScrollFade className="w-full" scrollKey={activeTab}>
                            <TabsList className="bg-transparent cursor-pointer p-0 h-auto flex w-max flex-nowrap items-center shrink-0">
                                {tabsForOperationsUi.map((tab, index) => {
                                    const isActive = activeTab === tab.id;
                                    const isDisabled = Boolean(tab.disabled);
                                    const isFirst = index === 0;
                                    const isLast = index === tabsForOperationsUi.length - 1;

                                    // Calculate z-index - active tab should be on top, earlier tabs have higher z-index
                                    const zIndex = isActive ? 10 : tabsForOperationsUi.length - index;

                                    // ClipPath for the tab shape
                                    const clipPath = isFirst
                                        ? "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%)"
                                        : isLast
                                            ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 18px 50%)"
                                            : "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%, 18px 50%)";

                                    return (
                                        <div
                                            key={tab.id}
                                            className="relative"
                                            style={{
                                                marginLeft: isFirst ? "0" : "-18px",
                                                zIndex: zIndex,
                                            }}
                                        >
                                            {/* Border wrapper */}
                                            <div
                                                className={`absolute inset-0 ${isDark ? 'bg-gray-600' : 'bg-white'}`}
                                                style={{
                                                    clipPath: clipPath,
                                                }}
                                            />
                                            {/* Tab content with slight inset to show border */}
                                            <TabsTrigger
                                                value={tab.id}
                                                disabled={isDisabled}
                                                className={`relative whitespace-nowrap px-5 py-2 text-xs font-bold border-0 shadow-none transition-all duration-200 rounded-none sm:px-6 sm:text-sm lg:px-8 data-[state=active]:shadow-none ${isDisabled
                                                        ? "cursor-not-allowed opacity-45"
                                                        : "cursor-pointer"
                                                    } ${isActive ? "tab-pipeline-active" : ""}`}
                                                style={{
                                                    ...(isActive
                                                        ? { color: "#FFFFFF" }
                                                        : {
                                                            backgroundColor: isDark ? '#374151' : '#E8E9EC80',
                                                            color: isDark ? '#FFFFFF' : '#000000',
                                                        }),
                                                    clipPath: isFirst
                                                        ? "polygon(0 0, calc(100% - 20px) 0, calc(100% - 2px) 50%, calc(100% - 20px) 100%, 0 100%)"
                                                        : isLast
                                                            ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 20px 50%)"
                                                            : "polygon(0 0, calc(100% - 20px) 0, calc(100% - 2px) 50%, calc(100% - 20px) 100%, 0 100%, 20px 50%)",
                                                }}
                                            >
                                                {tab.label}
                                            </TabsTrigger>
                                        </div>
                                    );
                                })}
                            </TabsList>
                            </HorizontalScrollFade>
                            {externalLinksRow ? (
                                <div className="shrink-0">{externalLinksRow}</div>
                            ) : null}
                        </div>

                        {canRenderTabContent ? (
                            <>
	                            <LazyTabContent activeTab={activeTab} value="overview" className="mt-6">
                                    <>
                                        <ApplicationSummary applicationId={applicationId} onBack={() => navigate(-1)} />
                                    {canShowNotAApplicationTag ? <NotMcaApplicationTagPanel /> : null}
                                        <AgentDealIsoTag
                                            applicationId={applicationId}
                                            alwaysEditable={canEditIsoDetails}
                                        />
                                        <ApplicationBasicDetails applicationId={applicationId} />
                                        {canShowSendToUnderwriterButton ? (
                                            <div className="flex justify-end mb-4">
                                                <Button
                                                    type="button"
                                                    variant="default"
                                                    onClick={handleSendToUnderwriter}
                                                    disabled={sendingToUnderwriter}
                                                    className="mt-4 disabled:opacity-40"
                                                >
                                                    {sendingToUnderwriter ? "Sending..." : "Send to Scrubbing"}
                                                </Button>
                                            </div>
                                        ) : null}
                                        <div className="mt-6"><CommentSection isUnderwriter={isUnderwriter} readOnly={commentsReadOnly} /></div>
                                    </>
                            </LazyTabContent>

                            <LazyTabContent activeTab={activeTab} value="documents" className="mt-6">
                                    <ApplicationSummary applicationId={applicationId} onBack={() => navigate(-1)} />
                                    {canShowNotAApplicationTag ? <NotMcaApplicationTagPanel /> : null}

                                    <MissingDocumentsPanel />
                                    <UploadedDocuments readOnly={uploadedDocumentsReadOnly} />
                                    {canShowSendToUnderwriterButton ? (
                                        <div className="flex justify-end mb-4">
                                            <Button
                                                type="button"
                                                variant="default"
                                                onClick={handleSendToUnderwriter}
                                                disabled={sendingToUnderwriter}
                                                className="mt-4 disabled:opacity-40"
                                            >
                                                {sendingToUnderwriter ? "Sending..." : "Send to Scrubbing"}
                                            </Button>
                                        </div>
                                    ) : null}
                                    <div className="mt-6"><CommentSection readOnly={commentsReadOnly} /></div>
                            </LazyTabContent>

                            <LazyTabContent activeTab={activeTab} value="approval" className="mt-6">
                                    <Approval readOnly={pipelineStageReadOnly} />
                                    <div className="mt-6"><CommentSection styles="flex-row" readOnly={commentsReadOnly} /></div>
                                    <RequiredDocument readOnly={pipelineStageReadOnly} />
                            </LazyTabContent>

                            <LazyTabContent activeTab={activeTab} value="background-check" className="mt-6">
                                    <ApplicationSummary onBack={() => navigate(-1)} />
                                    {canShowNotAApplicationTag ? <NotMcaApplicationTagPanel /> : null}
                                    <BackgroundCheckTab />
                            </LazyTabContent>

                            <LazyTabContent activeTab={activeTab} value="contract" className="mt-6">
                                    <ContractTab readOnly={isAgent || isViewOnlyBrowse} />
                            </LazyTabContent>

                            <LazyTabContent activeTab={activeTab} value="eligibility-analysis" className="mt-6">
                                    <ApplicationSummary onBack={() => navigate(-1)} />
                                    {canShowNotAApplicationTag ? <NotMcaApplicationTagPanel /> : null}
                                    <EligibilityAnalysis />
                            </LazyTabContent>

                                {/* -------------------------------------------------------------- */}
                                {/* OPERATIONS specific tabs */}
                            <LazyTabContent activeTab={activeTab} value="doc-request-contract" className="mt-6">
                                    <CasesDashboard applicationId={resolvedApplicationId} />
                            </LazyTabContent>

                            <LazyTabContent activeTab={activeTab} value="finals-and-funding-call" className="mt-6">
                                    <FinalsAndFundingCallFlow
                                        applicationId={applicationId}
                                        resolvedApplicationId={resolvedApplicationId}
                                        onBack={() => navigate(-1)}
                                        onCallStatusChange={handleFundingCallStatusChange}
                                        onFundingCallSaved={() => {
                                            refetchApplicationDetail();
                                            if (resolvedApplicationId != null) {
                                                void dispatch(
                                                    getFundingCalls({
                                                        application: String(
                                                            resolvedApplicationId,
                                                        ),
                                                    }),
                                                );
                                            }
                                        }}
                                    />
                            </LazyTabContent>

                            <LazyTabContent activeTab={activeTab} value="disbursement" className="mt-6">
                                    <Disbursement
                                        applicationId={resolvedApplicationId ?? undefined}
                                        summaryApplicationId={applicationId}
                                        applicationRecordId={applicationUuid}
                                        currentQueue={queue}
                                        onBack={() => navigate(-1)}
                                    />
                            </LazyTabContent>
                                {/* -------------------------------------------------------------- */}

                            <LazyTabContent activeTab={activeTab} value="bank-analysis" className="mt-6">
                                    <ApplicationSummary applicationId={applicationId} onBack={() => navigate(-1)} />
                                    {canShowNotAApplicationTag ? <NotMcaApplicationTagPanel /> : null}
                                    <BankAnalysis
                                        readOnly={bankAnalysisTabReadOnly}
                                        enableCreate={
                                            superAdminPipelineEditOverride ||
                                            plainUnderwriterWorkflowEdit
                                        }
                                    />
                                    <RequiredDocument isBankAnalysis={true} readOnly={bankAnalysisTabReadOnly} />
                                    <div className="mt-6"><CommentSection readOnly={commentsReadOnly} /></div>
                            </LazyTabContent>

                            <LazyTabContent activeTab={activeTab} value="checks" className="mt-6">
                                    <ApplicationSummary onBack={() => navigate(-1)} />
                                    {canShowNotAApplicationTag ? <NotMcaApplicationTagPanel /> : null}
                                    <ComplianceChecks />
                                    <div className="mt-6"><CommentSection readOnly={commentsReadOnly} /></div>
                            </LazyTabContent>

                            <LazyTabContent activeTab={activeTab} value="decision-making" className="mt-6">
                                    <ApplicationSummary onBack={() => navigate(-1)} />
                                    <ReturnedForCorrectionBanner />
                                    <SentToUnderwriterInfo
                                        applicationId={applicationId}
                                        showCurrentDecision={isUnderwriter || isSuperAdmin}
                                    />
                                    {canShowNotAApplicationTag ? <NotMcaApplicationTagPanel /> : null}
                                    <div className="flex items-center gap-2 mt-3 mb-2">
                                        <Button
                                            variant={showAiAnalysis ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setShowAiAnalysis(!showAiAnalysis)}
                                            className="gap-1.5"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 0-4 4c0 2 1 3 2 4l-6 6v2h4l6-6c1 1 2 2 4 2a4 4 0 0 0 0-8"/><path d="M2.5 21.5l3-3"/></svg>
                                            AI Analysis
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowScrubbingPreview(true)}
                                        >
                                            Preview
                                        </Button>
                                    </div>
                                    {showAiAnalysis && (
                                        <div className="mt-2 mb-4 border rounded-lg p-4 bg-white shadow-sm">
                                            <AIAnalysisView
                                                applicationId={applicationId}
                                                onApplied={() => setShowAiAnalysis(false)}
                                            />
                                        </div>
                                    )}
                                    {!hideBusinessProfileOnDecisionMakingTab && (
                                        <ApplicationBasicDetails applicationId={applicationId} />
                                    )}
                                    {isPlainUnderwriter ? (
                                        <>
                                            <div className="mt-6">
                                                <BankAnalysis
                                                    readOnly={bankAnalysisTabReadOnly}
                                                    enableCreate={plainUnderwriterWorkflowEdit}
                                                    showBankStatementUpload={false}
                                                />
                                            </div>
                                            <RequiredDocument
                                                isBankAnalysis={true}
                                                readOnly={bankAnalysisTabReadOnly}
                                            />
                                        </>
                                    ) : (
                                        <div className="mt-6">
                                            <DecisionMakeFinalValues
                                                applicationId={applicationId}
                                                showNotesPanel
                                                startInPreview
                                                allowOfferEdit={canEditDecisionMakingFinalValues}
                                                allowPositionsEdit={canEditDecisionMakingFinalValues}
                                                positionsDisableDelete={
                                                    !superAdminPipelineEditOverride
                                                }
                                                positionsDisableCreate={
                                                    canEditDecisionMakingFinalValues &&
                                                    !superAdminPipelineEditOverride &&
                                                    !isPlainUnderwriter
                                                }
                                                aboveOffer={
                                                    isSuperAdmin ? (
                                                        <SendApplicationToUnderwriter
                                                            applicationId={applicationId}
                                                            allowReassignWhenApproved
                                                        />
                                                    ) : undefined
                                                }
                                                betweenOfferAndPositions={({
                                                    componentsReadOnly,
                                                    onRegisterBankSaveAll,
                                                    applicationId: bankAppId,
                                                    positionsForBankTable,
                                                    editMode,
                                                }) =>
                                                    isUnderwriter ||
                                                    roleKey === "OPERATIONS" ||
                                                    superAdminPipelineEditOverride ? (
                                                        <BankAnalysisTable
                                                            editMode={editMode}
                                                            disableDelete={
                                                                !superAdminPipelineEditOverride
                                                            }
                                                            disableCreate={
                                                                componentsReadOnly ||
                                                                (!superAdminPipelineEditOverride &&
                                                                    !plainUnderwriterWorkflowEdit &&
                                                                    (pipelineStageReadOnly ||
                                                                        isOperationsReadOnlyPipelineTab))
                                                            }
                                                            readOnly={
                                                                componentsReadOnly ||
                                                                (!superAdminPipelineEditOverride &&
                                                                    !plainUnderwriterWorkflowEdit &&
                                                                    !operationsValueEditOverride &&
                                                                    (pipelineStageReadOnly ||
                                                                        isOperationsReadOnlyPipelineTab))
                                                            }
                                                            onRegisterSaveAll={onRegisterBankSaveAll}
                                                            applicationId={bankAppId}
                                                            positions={positionsForBankTable as any}
                                                            showCreditsTrend
                                                            autoSave={
                                                                !(
                                                                    componentsReadOnly ||
                                                                    (!superAdminPipelineEditOverride &&
                                                                        !plainUnderwriterWorkflowEdit &&
                                                                        !operationsValueEditOverride &&
                                                                        (pipelineStageReadOnly ||
                                                                            isOperationsReadOnlyPipelineTab))
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        // Was showOnlyTotals: with Bank Total now gated
                                                        // to 2+ banks, that left this section empty on
                                                        // single-account deals. Per-bank cards instead.
                                                        <BankAnalysisTable
                                                            editMode={editMode}
                                                            readOnly={
                                                                componentsReadOnly ||
                                                                pipelineStageReadOnly ||
                                                                isOperationsReadOnlyPipelineTab
                                                            }
                                                        />
                                                    )
                                                }
                                            />
                                        </div>
                                    )}
                                    <div className="flex flex-row mt-6 gap-4 w-full items-start">
                                        <div className="flex-[7] min-w-0 h-[480px] flex flex-col overflow-hidden">
                                            <CommentSection compactLayout readOnly={commentsReadOnly} />
                                        </div>
                                        <div className="flex-[3] min-w-0 flex flex-col">
                                            <ChecksAndDecision
                                                isPlainUnderwriter={isPlainUnderwriter}
                                                canSendApprovalMailToIso={
                                                    // Only Super Admin approves to the ISO.
                                                    roleKey === "SUPER_ADMIN"
                                                }
                                                hideUnderwritingDecision={roleKey === "OPERATIONS"}
                                                compactLayout
                                                previewMode={
                                                    claimLocked ||
                                                    // Scrubbers keep Recommend / documents / Decline
                                                    // visible after sending to Underwriter (stage
                                                    // preview must not hide those CTAs).
                                                    !isPlainUnderwriter &&
                                                    !superAdminPipelineEditOverride &&
                                                    (isStagePreview ||
                                                        isOperationsTabBehindCurrentDeal)
                                                }
                                            />
                                        </div>
                                    </div>
                            </LazyTabContent>
                            </>
                        ) : showAccessDenied ? (
                            fallbackComponent
                        ) : showApplicationLoadError ? (
                            <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-10 text-center shadow-[0px_4px_20px_0px_rgba(0,0,0,0.06)] dark:shadow-[0px_4px_24px_0px_rgba(0,0,0,0.35)]">
                                <p className="text-sm font-medium text-destructive">
                                    {applicationDetailError}
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="mt-4"
                                    onClick={refetchApplicationDetail}
                                >
                                    Try again
                                </Button>
                            </div>
                        ) : (
                            <div className="mt-6 flex items-center justify-center rounded-lg border border-border bg-card p-10 shadow-[0px_4px_20px_0px_rgba(0,0,0,0.06)] dark:shadow-[0px_4px_24px_0px_rgba(0,0,0,0.35)]">
                                <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <span className="inline-block h-4 w-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                                    Loading application details...
                                </div>
                            </div>
                        )}
                        {tabStepFooter}
                    </Tabs>
                )}
            </div>

            {isSuperAdmin && activityLogApplicationId ? (
                <>
                    <Dialog open={mailLogOpen} onOpenChange={setMailLogOpen}>
                        <DialogContent
                            aria-label="Mail log"
                            className="flex max-h-[90vh] w-[min(96vw,72rem)] max-w-[72rem] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
                        >
                            <ApplicationSheetMailLog
                                applicationId={activityLogApplicationId}
                                active={mailLogOpen}
                                className="max-h-[90vh] min-h-0 flex-1"
                                headerClassName="shrink-0 px-6 pb-3 pt-6 pr-12"
                            />
                        </DialogContent>
                    </Dialog>
                    <Sheet open={auditLogOpen} onOpenChange={setAuditLogOpen}>
                        <SheetContent
                            side="right"
                            aria-label="Activity log"
                            overlayClassName="bg-black/15"
                            className="z-[9999] flex h-full w-full max-w-full flex-col gap-0 overflow-hidden border-l p-0 sm:w-[50vw] sm:max-w-[50vw]"
                        >
                            <ApplicationSheetActivityLog
                                applicationId={activityLogApplicationId}
                                className="min-h-0 flex-1"
                                headerClassName="shrink-0 pr-14 pt-10"
                            />
                        </SheetContent>
                    </Sheet>
                </>
            ) : null}

            <ScrubbingPreviewModal
                open={showScrubbingPreview}
                onOpenChange={setShowScrubbingPreview}
                applicationId={applicationId}
            />
        </div>
    );
};

export default ApplicationDetails;
