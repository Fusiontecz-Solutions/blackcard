import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router";
import ApprovedApplicationModal from "./ApprovedApplicationModal";
import { isFinalUnderwriterWorkflowQueue, isApplicationInFinalApprovalStage, resolveApplicationWorkflowQueueAndStates } from "@/lib/applicationWorkflowState";
import RequestMissingDocumentsModal from "./RequestMissingDocumentsModal";
import RejectApplicationModal from "./RejectApplicationModal";
import SendBackToScrubberModal from "./SendBackToScrubberModal";
import SendToUnderwriterModal from "./SendToUnderwriterModal";
import MissingDocumentsModal from "./MissingDocumentsModal";
import { useTheme } from "@/context/ThemeContext";
import { useSelector, useDispatch } from "react-redux";
import { toast } from "react-toastify";
import type { RootState, AppDispatch } from "@/redux/store";
import { getApplicationActivityLogs } from "@/redux/actions/applicationActivityLogActions";
import { updateApplicationQueue, getApplicationById, updateApplication } from "@/redux/actions/applicationActions";
import { getCommentsByApplication } from "@/redux/actions/commentActions";
import { isUnderwriterApprovedApplication, resolveApprovingUnderwriter } from "@/lib/underwriterApprovalLabel";
import { normalizeRoleKey, resolveEffectiveRole, resolveSessionUser } from "@/lib/sessionRole";
import ApprovedByUnderwriterBadge from "./ApprovedByUnderwriterBadge";
import ApplicationClaimAssignments from "./ApplicationClaimAssignments";
import { applicationNeedsContractReinitiation } from "@/lib/contractReinitiation";
import { Checkbox } from "@/components/ui/checkbox";
import { invalidateUnderwriterPipelineCounts } from "@/lib/underwriterPipelineCounts";
import { isNotMcaApplication } from "@/lib/notMcaApplication";
import { resolveActionErrorMessage } from "@/lib/unclaimedDealError";
import { OFFER_DECISION_UPDATED_EVENT, offerDecisionUpdateMatchesApplication } from "@/lib/offerDecisionSync";
import { getOfferDecisionByApplication } from "@/redux/actions/offerDecisionActions";

interface ChecksAndDecisionProps {
    /** Plain SCRUBBING (scrubbing) — primary CTA is "Recommend for approval", not send-to-FU wording. */
    isPlainUnderwriter?: boolean;
    /** When true, Approved modal shows "Proceed to Generate Contract" (UNDERWRITER only) */
    isFinalUnderwriter?: boolean;
    /** Super Admin on Decision Making — same ISO approval-mail CTA as Underwriter. */
    canSendApprovalMailToIso?: boolean;
    /** Called when UNDERWRITER clicks Proceed to Generate Contract */
    onProceedToContract?: () => void;
    /** When true, hides the "Make Underwriting Decision" action buttons (e.g. deal pipeline read-only view). */
    hideUnderwritingDecision?: boolean;
    /** When true, hides decision actions while browsing a past workflow stage. */
    previewMode?: boolean;
    /** Narrow sidebar layout: stack decision buttons vertically for ~30% column width. */
    compactLayout?: boolean;
}

/** Legacy decision CTAs — solid colors, not the app-wide brand-gradient Button theme. */
const decisionButtonBase =
    "rounded-md text-white h-auto py-4 px-3 box-border cursor-pointer flex flex-col gap-1.5 items-center justify-center text-center w-full overflow-hidden transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--brand)] disabled:opacity-50 disabled:cursor-not-allowed";

const UNDERWRITER_RECOMMEND_LABEL = "Recommend";
const UNDERWRITER_RECOMMEND_DESCRIPTION =
    "Send this application to the Underwriter queue for review";
/** Underwriter final approval moves the deal into the operations "Final" pipeline stage. */
const FINAL_STAGE = "Final";
const FINAL_APPROVAL_LABEL = "Final Approval";
const FINAL_APPROVAL_DESCRIPTION =
    "Grant final approval and automate the deal for contract";

const ChecksAndDecision = ({
    isPlainUnderwriter,
    isFinalUnderwriter,
    canSendApprovalMailToIso,
    onProceedToContract,
    hideUnderwritingDecision,
    previewMode,
    compactLayout,
}: ChecksAndDecisionProps = {}) => {
    const loginUser = useSelector(
        (state: RootState) => state.login.data?.user,
    );
    const loginUserRole = loginUser?.role;
    const viewerRoleKey = normalizeRoleKey(
        resolveEffectiveRole({ role: loginUserRole }),
    );
    const isUnderwriterRole = viewerRoleKey === "UNDERWRITER";
    // Scrubbers flag Missing Documents instead of sending a document request.
    const isScrubberRole = viewerRoleKey === "SCRUBBING";
    const sessionUserId = resolveSessionUser(loginUser)?.id ?? "";
    // UNDERWRITER role: approve directly (update DB to Approved) — no ISO approval mail.
    const showUnderwriterApproveFlow = Boolean(
        (isFinalUnderwriter || isUnderwriterRole) && !canSendApprovalMailToIso,
    );
    // Super Admin keeps the ISO approval-mail CTA.
    const showIsoApprovalMailFlow = Boolean(canSendApprovalMailToIso);
    const showUnderwriterRecommendFlow = Boolean(
        isPlainUnderwriter && !showIsoApprovalMailFlow && !showUnderwriterApproveFlow,
    );
    const showUnderwritingDecision = !hideUnderwritingDecision && !previewMode;
    // Underwriters never email the ISO: their decision goes to the submissions inbox
    // and Super Admin sends the ISO approval.
    const showUnderwriterIsoMailButton = false;
    const needsIsoApprovalMailTracking =
        showIsoApprovalMailFlow || showUnderwriterIsoMailButton;
    const { applicationId: paramApplicationId } = useParams<{ applicationId: string }>();
    const dispatch = useDispatch<AppDispatch>();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const applicationData = useSelector((state: RootState) => state.applicationDetail.data);
    const currentUserId = sessionUserId;
    const applicationUuid =
        (applicationData as { _id?: string; id?: string })?._id ??
        (applicationData as { id?: string })?.id ??
        null;
    const approvedByUnderwriterId =
        resolveApprovingUnderwriter(
            (applicationData ?? {}) as Parameters<typeof resolveApprovingUnderwriter>[0],
        )?.id ??
        (applicationData as { approvedByUnderwriterId?: string | null })?.approvedByUnderwriterId ??
        (applicationData as { approvedByUnderwriter?: { id?: string; _id?: string } | null })
            ?.approvedByUnderwriter?.id ??
        (applicationData as { approvedByUnderwriter?: { id?: string; _id?: string } | null })
            ?.approvedByUnderwriter?._id ??
        null;
    const assignedUnderwriterId =
        (applicationData as { assignedUnderwriterId?: string | null })?.assignedUnderwriterId ??
        (applicationData as { assignedUnderwriter?: { id?: string; _id?: string } | null })
            ?.assignedUnderwriter?.id ??
        (applicationData as { assignedUnderwriter?: { id?: string; _id?: string } | null })
            ?.assignedUnderwriter?._id ??
        null;
    const workflowFields = resolveApplicationWorkflowQueueAndStates(
        (applicationData ?? null) as Parameters<
            typeof resolveApplicationWorkflowQueueAndStates
        >[0],
    );
    // Derive application status/queue to control decision button availability
    const status = (applicationData as any)?.currentState || (applicationData as any)?.status;
    const queue = workflowFields.queue || (applicationData as any)?.queue;
    const explicitStatus = (applicationData as any)?.status;
    const currentStateRaw =
        workflowFields.rawState ||
        workflowFields.mappedState ||
        (applicationData as any)?.currentState;
    const statusNorm = typeof status === "string" ? status.trim().toLowerCase() : "";
    const queueNorm = typeof queue === "string" ? queue.trim().toLowerCase() : "";
    const currentStateNorm =
        typeof currentStateRaw === "string" ? currentStateRaw.trim().toLowerCase() : "";
    const explicitStatusNorm =
        typeof explicitStatus === "string" ? explicitStatus.trim().toLowerCase() : "";

    const isCompletedStatus = statusNorm === "completed";
    const isApprovedStatus = explicitStatusNorm === "approved";
    const isApprovedQueue = queueNorm === "approved";
    const isUnderwriterApprovedStage = isUnderwriterApprovedApplication(
        applicationData as Record<string, unknown> | null,
    );
    const isLegacyUwApprovedStage =
        queueNorm === "approved" &&
        (statusNorm === "approved" || currentStateNorm === "approved");
    const isUnderwriterQueue = isFinalUnderwriterWorkflowQueue(queue);
    const isFinalApprovalStage = isApplicationInFinalApprovalStage(
        (applicationData ?? null) as Parameters<
            typeof isApplicationInFinalApprovalStage
        >[0],
    );
    const isContractPendingStage =
        queueNorm === "contract pending" ||
        queueNorm === "contract_pending" ||
        currentStateNorm === "contract pending" ||
        currentStateNorm === "contract_pending";
    const isFinalStage = queueNorm === "final" || currentStateNorm === "final";
    const isTaggedNotMca = isNotMcaApplication(
        (applicationData ?? null) as Parameters<typeof isNotMcaApplication>[0],
    );

    /** Underwriter queue → first approval; Final Approval queue → final approval CTA. */
    const showUnderwriterApprovalButton =
        showUnderwriterApproveFlow && isUnderwriterQueue;
    const showFinalApprovalButton =
        showUnderwriterApproveFlow && isFinalApprovalStage;

    const isApprovingUnderwriterForDeal =
        !approvedByUnderwriterId ||
        !currentUserId ||
        String(approvedByUnderwriterId) === String(currentUserId);
    // In the Underwriter queue an underwriter must have claimed the deal: an
    // unassigned deal is NOT "theirs" (it used to count as assigned, so approve
    // and decline showed before anyone claimed it). Elsewhere keep the old rule.
    const isAssignedUnderwriterForDeal =
        viewerRoleKey === "UNDERWRITER" && isUnderwriterQueue
            ? Boolean(assignedUnderwriterId) &&
              Boolean(currentUserId) &&
              String(assignedUnderwriterId) === String(currentUserId)
            : !assignedUnderwriterId ||
              !currentUserId ||
              String(assignedUnderwriterId) === String(currentUserId);

    /**
     * Scrubbers and underwriters may not approve, recommend or send the approval
     * mail until the deal has a saved offer (Offer amount above 0). Decline is
     * always allowed.
     * Same rule as the backend; every other offer field stays optional.
     */
    const offerDecisionState = useSelector((state: RootState) => state.offerDecision);
    const offerLookupKey = paramApplicationId ?? applicationUuid ?? null;
    useEffect(() => {
        if (!offerLookupKey) return;
        void dispatch(getOfferDecisionByApplication(String(offerLookupKey)));
        const onOfferDecisionUpdated = (event: Event) => {
            const detail = (event as CustomEvent<{ applicationId?: string }>).detail;
            if (!offerDecisionUpdateMatchesApplication(detail?.applicationId, String(offerLookupKey))) return;
            void dispatch(getOfferDecisionByApplication(String(offerLookupKey)));
        };
        window.addEventListener(OFFER_DECISION_UPDATED_EVENT, onOfferDecisionUpdated);
        return () => window.removeEventListener(OFFER_DECISION_UPDATED_EVENT, onOfferDecisionUpdated);
    }, [offerLookupKey, dispatch]);
    const savedOffer = offerDecisionState?.data as { applicationId?: string; offer?: unknown } | null;
    const savedOfferBelongsHere =
        !!savedOffer &&
        (!savedOffer.applicationId ||
            !applicationUuid ||
            String(savedOffer.applicationId) === String(applicationUuid));
    const hasSavedOffer = savedOfferBelongsHere && Number(savedOffer?.offer ?? 0) > 0;
    const offerMissing =
        (viewerRoleKey === "SCRUBBING" || viewerRoleKey === "UNDERWRITER") && !hasSavedOffer;
    const OFFER_MISSING_HINT = "Save an offer (Offer amount) first";
    /** Match backend — underwriters and ops/admin/contract roles may resolve ISO query. */
    const canResolveIsoQuery =
        viewerRoleKey === "SUPER_ADMIN" ||
        viewerRoleKey === "MANAGER" ||
        viewerRoleKey === "ADMIN" ||
        viewerRoleKey === "OPERATIONS" ||
        viewerRoleKey === "CONTRACT" ||
        isUnderwriterRole;
    const canActOnFinalApprovalStage =
        isFinalApprovalStage &&
        (isApprovingUnderwriterForDeal || isAssignedUnderwriterForDeal);
    const isContractedQueue =
        queueNorm === "contracted" ||
        queueNorm === "contract out" ||
        queueNorm === "contracts out" ||
        isContractPendingStage;

    // Once sent to Underwriter or approved/contracted/completed, lock the primary decision button
    const disablePrimaryDecisionButton =
        isUnderwriterQueue ||
        isUnderwriterApprovedStage ||
        isLegacyUwApprovedStage ||
        isApprovedStatus ||
        isApprovedQueue ||
        isCompletedStatus ||
        isContractedQueue;

    // Underwriter direct-approve flow: lock the button once the application is approved,
    // except when the deal is back in Final Approval for the second sign-off.
    // The underwriter's approval credit must survive later stage changes. When a
    // Super Admin sends the ISO approval mail the deal moves to "Approval Sent",
    // which previously dropped this badge and made it look like the recorded
    // "Approved by Underwriter" was overwritten. Keep crediting the underwriter
    // once an approver is recorded and the deal has reached or advanced past
    // Underwriter Approved — except during the Final Approval second sign-off,
    // where it is intentionally hidden.
    const hasRecordedApprovingUnderwriter = Boolean(approvedByUnderwriterId);
    const isApprovalSentStage =
        queueNorm === "approval sent" ||
        queueNorm === "approval_sent" ||
        currentStateNorm === "approval sent" ||
        currentStateNorm === "approval_sent";
    const isIsoApprovedStage =
        queueNorm === "iso approved" ||
        queueNorm === "iso_approved" ||
        currentStateNorm === "iso approved" ||
        currentStateNorm === "iso_approved" ||
        (queueNorm === "approved" && currentStateNorm === "approved");
    const isApplicationApproved =
        !isFinalApprovalStage &&
        (isUnderwriterApprovedStage ||
            isLegacyUwApprovedStage ||
            isApprovedStatus ||
            isApprovedQueue ||
            statusNorm === "approved" ||
            isCompletedStatus ||
            isContractedQueue ||
            (hasRecordedApprovingUnderwriter && isApprovalSentStage));
    const isAtOrPastUnderwriterApproval =
        isUnderwriterApprovedStage ||
        isLegacyUwApprovedStage ||
        isApprovedStatus ||
        isApprovedQueue ||
        isCompletedStatus ||
        isContractedQueue ||
        isApprovalSentStage ||
        isIsoApprovedStage;
    /** Underwriter role: show decision panel when the deal is in an actionable UW queue. */
    const showUnderwriterIsoMailStage =
        showUnderwriterIsoMailButton &&
        (isUnderwriterQueue ||
            isUnderwriterApprovedStage ||
            isApprovalSentStage ||
            isIsoApprovedStage ||
            isFinalApprovalStage);
    const showUnderwriterDecisionActions =
        showUnderwriterApprovalButton ||
        showFinalApprovalButton ||
        isUnderwriterApprovedStage ||
        showUnderwriterIsoMailStage;
    // Underwriter send-back: only before any underwriting decision is recorded.
    const underwriterActionRecorded = Boolean(
        (applicationData as { underwriterAction?: string | null })?.underwriterAction ||
            (applicationData as { approvedByUnderwriterId?: string | null })
                ?.approvedByUnderwriterId,
    );
    const inUnderwriterQueue =
        String((applicationData as { currentQueue?: string | null })?.currentQueue ?? "")
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, "_") === "UNDERWRITER";
    // Super Admin / Manager have every action an underwriter has.
    const isPrivilegedAdminViewer =
        viewerRoleKey === "SUPER_ADMIN" ||
        viewerRoleKey === "ADMIN" ||
        viewerRoleKey === "MANAGER";
    // Scrubber Recommend Decline waits for Super Admin as "Decline by Scrubber".
    const isScrubberDeclineHold =
        queueNorm === "declined" &&
        String((applicationData as { underwriterAction?: string | null })?.underwriterAction ?? "")
            .trim()
            .toLowerCase() === "decline by scrubber";
    const isScrubbingStageDeal = queueNorm === "scrubbing";
    /** Super Admin on a scrubbing-stage deal acts as the scrubber: approve sends it to the UW queue. */
    const adminActsAsScrubber =
        isPrivilegedAdminViewer && (isScrubbingStageDeal || isScrubberDeclineHold);
    const showSendBackToScrubberButton =
        adminActsAsScrubber ||
        ((isUnderwriterRole || isPrivilegedAdminViewer) &&
            inUnderwriterQueue &&
            !underwriterActionRecorded);
    const dealScrubberId =
        (applicationData as { claimedByUnderwriterId?: string | null })
            ?.claimedByUnderwriterId ??
        (applicationData as { claimedByUnderwriter?: { id?: string; _id?: string } | null })
            ?.claimedByUnderwriter?.id ??
        (applicationData as { claimedByUnderwriter?: { id?: string; _id?: string } | null })
            ?.claimedByUnderwriter?._id ??
        null;
    /** Email is the reliable cross-app match for the deal's scrubber. */
    const dealScrubberEmail =
        (applicationData as { claimedByUnderwriter?: { email?: string | null } | null })
            ?.claimedByUnderwriter?.email ?? null;

    // A scrubber may still edit a recommended deal (until an underwriter acts), but the
    // recommendation is already made — no decision buttons once it is in the Underwriter queue.
    const scrubberAlreadyRecommended =
        isScrubberRole && (isUnderwriterQueue || isScrubberDeclineHold);

    const showDecisionPanel =
        showUnderwritingDecision &&
        !scrubberAlreadyRecommended &&
        !isTaggedNotMca &&
        (!showUnderwriterApproveFlow || showUnderwriterDecisionActions);
    const canExecuteUnderwriterDecisions =
        !showUnderwriterApproveFlow ||
        isUnderwriterApprovedStage ||
        showUnderwriterApprovalButton ||
        (showFinalApprovalButton && canActOnFinalApprovalStage) ||
        (showUnderwriterIsoMailButton &&
            (isApprovalSentStage || isIsoApprovedStage));
    const showApprovedByUnderwriterBadge =
        !isFinalApprovalStage &&
        (isUnderwriterApprovedStage ||
            (hasRecordedApprovingUnderwriter && isAtOrPastUnderwriterApproval));

    // Underwriter view: load the saved offer decision so we can detect whether
    // the FU has already updated the offer values. That toggles the primary CTA
    // between "Approved application" (no offer change yet OR mail already sent) and
    // "Send Approval Mail to ISO" (FU updated the offer, mail not yet sent).
    useEffect(() => {
        if (needsIsoApprovalMailTracking && applicationUuid) {
            dispatch(getApplicationActivityLogs(paramApplicationId ?? applicationUuid));
        }
    }, [needsIsoApprovalMailTracking, applicationUuid, paramApplicationId, dispatch]);

    // Keep ISO approval-mail CTA state fresh after ISO comments / offer edits without requiring manual refresh.
    useEffect(() => {
        if (!needsIsoApprovalMailTracking || !applicationUuid) return;

        const refresh = () => {
            dispatch(getApplicationActivityLogs(paramApplicationId ?? applicationUuid));
        };

        // 8s meant a proxied activity-log fetch roughly every 8 seconds for as
        // long as the screen stayed open. The visibilitychange handler below
        // already refreshes the moment the user comes back to the tab, so the
        // timer only needs to cover changes made while they are watching.
        const intervalId = window.setInterval(refresh, 30_000);
        const onVisibilityChange = () => {
            if (!document.hidden) refresh();
        };
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [needsIsoApprovalMailTracking, applicationUuid, paramApplicationId, dispatch]);

    const activityLogs = useSelector((state: RootState) => state.activityLogs.logs) as Array<{
        actionType?: string;
        actionDescription?: string;
        metadata?: Record<string, unknown> | null;
    }>;

    // Strict activity-log rule requested:
    // if approval mail already sent once, show resend CTA.
    const hasSentApprovalMailOnce = Array.isArray(activityLogs)
        ? activityLogs.some((log) => {
            const actionTypeNorm = String(log?.actionType || "").trim().toUpperCase();
            const descriptionNorm = String(log?.actionDescription || "").trim().toLowerCase();
            const templateNorm = String((log?.metadata as any)?.template || "").trim().toLowerCase();
            return (
                actionTypeNorm === "APPROVED" &&
                (templateNorm === "approval" ||
                    templateNorm === "offer-updated" ||
                    descriptionNorm.includes("sent approval email") ||
                    descriptionNorm.includes("resent updated offer email"))
            );
        })
        : false;

    // Once the ISO approval mail has been sent it must NEVER revert to "Send Approval
    // Mail to ISO". The activity-log slice is shared and can be overwritten (or briefly
    // empty) by other fetches, so we also treat workflow stages that only occur after
    // the mail was sent, and keep a sticky flag so a transient empty log list can't
    // flip it back. Underwriter approval alone does NOT count — Super Admin may still
    // need to send the first ISO mail.
    const hasApprovalMailBeenSentByWorkflow =
        isApprovalSentStage ||
        isIsoApprovedStage ||
        isContractedQueue ||
        isCompletedStatus;

    const [approvalMailSentSticky, setApprovalMailSentSticky] = useState(false);

    // Reset the sticky flag whenever we switch to a different application.
    useEffect(() => {
        setApprovalMailSentSticky(false);
    }, [applicationUuid]);

    useEffect(() => {
        if (hasSentApprovalMailOnce || hasApprovalMailBeenSentByWorkflow) {
            setApprovalMailSentSticky(true);
        }
    }, [hasSentApprovalMailOnce, hasApprovalMailBeenSentByWorkflow]);

    const shouldResendApprovalMail =
        needsIsoApprovalMailTracking &&
        (hasSentApprovalMailOnce ||
            hasApprovalMailBeenSentByWorkflow ||
            approvalMailSentSticky);

    const needsContractReinitiation = applicationNeedsContractReinitiation(
        applicationData as Record<string, unknown> | null,
    );
    const shouldReinitiateContractWithResend =
        shouldResendApprovalMail && needsContractReinitiation;

    const resendApprovalMailButtonLabel = shouldReinitiateContractWithResend
        ? "Resend approval mail to ISO and reinitiate contract"
        : shouldResendApprovalMail
          ? "Resend Approval Mail to ISO"
          : "Approve";

    const resendApprovalMailButtonDescription = shouldReinitiateContractWithResend
        ? "Offer values changed after a contract was generated. Send the updated offer email and reset the contract for regeneration."
        : shouldResendApprovalMail
          ? "ISO commented and offer was updated. Send the updated offer email."
          : "Approve and send the approval email to the ISO";

    const underwriterIsoMailButtonLabel = resendApprovalMailButtonLabel;
    const underwriterIsoMailButtonDescription = resendApprovalMailButtonDescription;

    const canSendUnderwriterIsoMail =
        showUnderwriterIsoMailButton &&
        !isContractedQueue &&
        !isCompletedStatus &&
        (canExecuteUnderwriterDecisions ||
            isApprovalSentStage ||
            isIsoApprovedStage);

    const isoApprovalMailButtonLabel = resendApprovalMailButtonLabel;
    const isoApprovalMailButtonDescription = resendApprovalMailButtonDescription;

    const showUnderwriterApprovalModal =
        showUnderwriterApprovalButton ||
        (showUnderwriterApproveFlow && !showFinalApprovalButton && !isApplicationApproved);

    const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
    const [isIsoApprovalMailModalOpen, setIsIsoApprovalMailModalOpen] = useState(false);
    const [isRequestDocumentsModalOpen, setIsRequestDocumentsModalOpen] = useState(false);
    const [isMissingDocumentsModalOpen, setIsMissingDocumentsModalOpen] = useState(false);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [isSendBackToScrubberOpen, setIsSendBackToScrubberOpen] = useState(false);
    const [isSendToUnderwriterOpen, setIsSendToUnderwriterOpen] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [isUpdatingIsoQueryResolved, setIsUpdatingIsoQueryResolved] = useState(false);

    const comments = useSelector((state: RootState) => state.comments.data);
    const isoQueryResolved =
        (applicationData as { isoQueryResolved?: boolean } | null)?.isoQueryResolved === true;

    const hasIsoComments = useMemo(
        () =>
            Array.isArray(comments) &&
            comments.some(
                (comment) =>
                    !comment.isDeleted &&
                    (comment.type === "ISO Comment" ||
                        String(comment.type ?? "").trim().toLowerCase() === "iso comment"),
            ),
        [comments],
    );
    const showReinitiateContractCheckbox = isUnderwriterRole;

    useEffect(() => {
        if (!applicationUuid) return;
        dispatch(getCommentsByApplication({ applicationId: applicationUuid }));
    }, [applicationUuid, dispatch]);

    const handleIsoQueryResolvedChange = async (checked: boolean) => {
        if (!applicationUuid || !canResolveIsoQuery) return;
        setIsUpdatingIsoQueryResolved(true);
        const toastId = toast.loading(
            checked ? "Marking ISO query as resolved..." : "Reopening ISO query...",
        );
        try {
            await dispatch(
                updateApplication({
                    id: applicationUuid,
                    data: { isoQueryResolved: checked },
                }),
            ).unwrap();
            await dispatch(getApplicationById(paramApplicationId ?? applicationUuid));
            invalidateUnderwriterPipelineCounts();
            toast.update(toastId, {
                render: checked
                    ? "ISO query marked as resolved. This deal was removed from ISO Query."
                    : "ISO query reopened.",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });
        } catch (err) {
            console.error("Failed to update ISO query resolution:", err);
            toast.update(toastId, {
                render: resolveActionErrorMessage(
                    err,
                    "Failed to update ISO query resolution. Please try again.",
                ),
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setIsUpdatingIsoQueryResolved(false);
        }
    };

    const handleFinalApproveApplication = async () => {
        if (!applicationUuid) {
            toast.error("Missing application id. Please reload and try again.");
            return;
        }
        setIsApproving(true);
        const toastId = toast.loading("Granting final approval...");
        try {
            await dispatch(
                updateApplicationQueue({
                    id: applicationUuid,
                    data: { currentQueue: FINAL_STAGE },
                }),
            ).unwrap();
            await dispatch(getApplicationById(paramApplicationId ?? applicationUuid));
            toast.update(toastId, {
                render: "Application moved to Final.",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });
        } catch (err) {
            console.error("Failed to final-approve application:", err);
            toast.update(toastId, {
                render: resolveActionErrorMessage(
                    err,
                    "Failed to approve application. Please try again.",
                ),
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setIsApproving(false);
        }
    };

    useEffect(() => {
        if (
            needsIsoApprovalMailTracking &&
            applicationUuid &&
            (isApprovalModalOpen || isIsoApprovalMailModalOpen)
        ) {
            dispatch(getApplicationActivityLogs(paramApplicationId ?? applicationUuid));
        }
    }, [
        needsIsoApprovalMailTracking,
        applicationUuid,
        isApprovalModalOpen,
        isIsoApprovalMailModalOpen,
        paramApplicationId,
        dispatch,
    ]);
    return (
        <div className={`w-full ${compactLayout ? "" : "space-y-6"}`}>
            {showApprovedByUnderwriterBadge ? (
                <ApprovedByUnderwriterBadge
                    app={
                        (applicationData ?? {}) as Parameters<
                            typeof ApprovedByUnderwriterBadge
                        >[0]["app"]
                    }
                    fallback="an underwriter"
                />
            ) : null}
            {applicationData ? (
                <ApplicationClaimAssignments
                    app={
                        applicationData as Parameters<
                            typeof ApplicationClaimAssignments
                        >[0]["app"]
                    }
                    variant="panel"
                />
            ) : null}
            {hasIsoComments ? (
                <div
                    className={`border border-[#FDFDFD] shadow-[0px_4px_20px_0px_#00000005] flex flex-col gap-3 w-full rounded-lg overflow-hidden ${compactLayout ? "my-0" : "my-6"} ${isDark ? "bg-card border-white" : "bg-white"}`}
                >
                    <h2
                        className={`text-base font-roboto w-full font-semibold ${isDark ? "bg-card" : "bg-[#F9FAFD]"} px-6 py-2 ${isDark ? "text-gray-200" : "text-[#374151]"}`}
                    >
                        ISO Query
                    </h2>
                    <div className="px-6 pb-6">
                        <div
                            role="checkbox"
                            aria-checked={isoQueryResolved}
                            tabIndex={canResolveIsoQuery && !isUpdatingIsoQueryResolved ? 0 : -1}
                            onClick={() => {
                                if (!canResolveIsoQuery || isUpdatingIsoQueryResolved) return;
                                void handleIsoQueryResolvedChange(!isoQueryResolved);
                            }}
                            onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                if (!canResolveIsoQuery || isUpdatingIsoQueryResolved) return;
                                void handleIsoQueryResolvedChange(!isoQueryResolved);
                            }}
                            className={`flex items-start gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                                canResolveIsoQuery && !isUpdatingIsoQueryResolved
                                    ? "cursor-pointer"
                                    : "cursor-not-allowed opacity-60"
                            }`}
                        >
                            <Checkbox
                                id="iso-query-resolved"
                                checked={isoQueryResolved}
                                disabled={!canResolveIsoQuery || isUpdatingIsoQueryResolved}
                                onCheckedChange={(value: boolean | "indeterminate") => {
                                    void handleIsoQueryResolvedChange(value === true);
                                }}
                                className="mt-0.5 pointer-events-none"
                            />
                            <span className="flex flex-col gap-1">
                                <span
                                    className={`text-sm font-medium ${isDark ? "text-gray-100" : "text-[#374151]"}`}
                                >
                                    ISO query Resolved
                                </span>
                                <span
                                    className={`text-xs ${isDark ? "text-gray-400" : "text-muted-foreground"}`}
                                >
                                    {isoQueryResolved
                                        ? "This deal is hidden from the ISO Query pipeline. A new ISO comment will reopen it."
                                        : "Mark resolved once you have addressed the ISO comment. The deal will leave ISO Query."}
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
            ) : null}
            {/* Make Underwriting Decision Section */}
            {showDecisionPanel && (
            <div className={`border border-[#FDFDFD] shadow-[0px_4px_20px_0px_#00000005] flex flex-col gap-4 w-full pt-0 rounded-lg overflow-hidden ${compactLayout ? (showUnderwriterIsoMailButton ? "my-0 min-h-[520px]" : "my-0 min-h-[420px]") : "my-6"} ${isDark ? 'bg-card border-white' : 'bg-white'}`}>
            <h2 className={`text-base font-roboto w-full font-semibold ${isDark ? 'bg-card' : 'bg-[#F9FAFD]'} px-6 py-2 ${isDark ? 'text-gray-200' : 'text-[#374151]'}`}>
                {showUnderwriterRecommendFlow || adminActsAsScrubber
                    ? "Make Scrubbing Decision"
                    : "Make Underwriting Decision"}
            </h2>
                
                <div className={`${
                    compactLayout
                        ? "flex flex-1 flex-col justify-center gap-5 px-4 pb-4"
                        : showUnderwriterIsoMailButton || showSendBackToScrubberButton
                          ? "grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-4 px-6 pb-6"
                          : "grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-4 px-6 pb-6"
                }`}>
                    {/* Approved Button */}
                    {adminActsAsScrubber ? (
                        <button
                            type="button"
                            onClick={() => setIsSendToUnderwriterOpen(true)}
                            title={!hasSavedOffer ? OFFER_MISSING_HINT : undefined}
                            disabled={!hasSavedOffer || !applicationUuid}
                            className={`${decisionButtonBase} border border-[#0f7a36] bg-[linear-gradient(180deg,#16a34a_0%,#16a34a_55%,#ffffff_115%)] shadow-md shadow-green-700/25 hover:brightness-95`}
                        >
                            <span className="text-base font-roboto font-bold whitespace-normal break-words w-full px-1">
                                Approve
                            </span>
                            <span className="text-xs font-normal opacity-90 whitespace-normal break-words w-full leading-snug px-1">
                                Send this deal to the Underwriter queue
                            </span>
                        </button>
                    ) : (
                    <button
                        type="button"
                        onClick={() =>
                            showFinalApprovalButton
                                ? void handleFinalApproveApplication()
                                : showIsoApprovalMailFlow
                                  ? setIsIsoApprovalMailModalOpen(true)
                                  : setIsApprovalModalOpen(true)
                        }
                        title={offerMissing && !showUnderwriterRecommendFlow ? OFFER_MISSING_HINT : undefined}
                        disabled={
                            // Scrubbers open the modal to Recommend Decline too; approval is gated there.
                            (offerMissing && !showUnderwriterRecommendFlow) ||
                            !canExecuteUnderwriterDecisions ||
                            (showFinalApprovalButton
                                ? isApproving || isContractPendingStage || isFinalStage
                                : showUnderwriterApprovalButton
                                  ? isApproving || isApplicationApproved
                                  : showUnderwriterApproveFlow
                                    ? isApproving || isApplicationApproved
                                    : showIsoApprovalMailFlow
                                      ? false
                                      : // Scrubbers keep Recommend / documents / Decline available
                                        // after recommending (do not lock the panel on one click).
                                        showUnderwriterRecommendFlow
                                          ? false
                                          : disablePrimaryDecisionButton)
                        }
                        className={`${decisionButtonBase} border border-[#0f7a36] bg-[linear-gradient(180deg,#16a34a_0%,#16a34a_55%,#ffffff_115%)] shadow-md shadow-green-700/25 hover:brightness-95`}
                    >
                        <span className="text-base font-roboto font-bold whitespace-normal break-words w-full px-1">
                            {showFinalApprovalButton
                                ? isApproving
                                    ? "Approving…"
                                    : FINAL_APPROVAL_LABEL
                                : showUnderwriterApprovalButton || showUnderwriterApproveFlow
                                  ? isApproving
                                      ? "Approving…"
                                      : isApplicationApproved
                                        ? "Underwriter Approved"
                                        : "Approve Submission"
                                  : showIsoApprovalMailFlow
                                    ? isoApprovalMailButtonLabel
                                    : showUnderwriterRecommendFlow
                                      ? UNDERWRITER_RECOMMEND_LABEL
                                      : "Send application to Final-scrubbing"}
                        </span>
                        <span className="text-xs font-normal opacity-90 whitespace-normal break-words w-full leading-snug px-1">
                            {showFinalApprovalButton
                                ? FINAL_APPROVAL_DESCRIPTION
                                : showUnderwriterApprovalButton || showUnderwriterApproveFlow
                                  ? "Mark this application as Underwriter Approved"
                                  : showIsoApprovalMailFlow
                                    ? isoApprovalMailButtonDescription
                                    : showUnderwriterRecommendFlow
                                      ? UNDERWRITER_RECOMMEND_DESCRIPTION
                                      : "Confirm terms and send for final underwriting review"}
                        </span>
                    </button>
                    )}

                    {showUnderwriterIsoMailButton ? (
                        <button
                            type="button"
                            onClick={() => setIsIsoApprovalMailModalOpen(true)}
                            title={offerMissing ? OFFER_MISSING_HINT : undefined}
                            disabled={offerMissing || !canSendUnderwriterIsoMail}
                            className={`${decisionButtonBase} border border-[var(--brand-hover)] bg-[linear-gradient(180deg,var(--brand)_0%,var(--brand)_55%,#ffffff_115%)] shadow-md shadow-[var(--brand)]/25 hover:brightness-95`}
                        >
                            <span className="text-base font-roboto font-bold whitespace-normal break-words w-full px-1">
                                {underwriterIsoMailButtonLabel}
                            </span>
                            <span className="text-xs font-normal opacity-90 whitespace-normal break-words w-full leading-snug px-1">
                                {underwriterIsoMailButtonDescription}
                            </span>
                        </button>
                    ) : null}

                    {isScrubberRole ? (
                        /* Missing Documents Button — scrubbers park the deal with Super Admin */
                        <button
                            type="button"
                            onClick={() => setIsMissingDocumentsModalOpen(true)}
                            disabled={!canExecuteUnderwriterDecisions || !applicationUuid}
                            className={`${decisionButtonBase} border border-[#c9862f] bg-[linear-gradient(180deg,#eaa95a_0%,#eaa95a_55%,#ffffff_115%)] shadow-md shadow-amber-700/20 hover:brightness-95`}
                        >
                            <span className="text-base font-roboto font-bold whitespace-normal break-words w-full px-1">Missing Documents</span>
                            <span className="text-xs font-normal opacity-90 whitespace-normal break-words w-full leading-snug px-1">Flag missing documents for Super Admin</span>
                        </button>
                    ) : (
                        /* Send back for documents Button */
                        <button
                            type="button"
                            onClick={() => setIsRequestDocumentsModalOpen(true)}
                            disabled={!canExecuteUnderwriterDecisions}
                            className={`${decisionButtonBase} border border-[#c9862f] bg-[linear-gradient(180deg,#eaa95a_0%,#eaa95a_55%,#ffffff_115%)] shadow-md shadow-amber-700/20 hover:brightness-95`}
                        >
                            <span className="text-base font-roboto font-bold whitespace-normal break-words w-full px-1">Send back for documents</span>
                            <span className="text-xs font-normal opacity-90 whitespace-normal break-words w-full leading-snug px-1">Request additional documents</span>
                        </button>
                    )}

                    {/* Send back to Scrubber — pre-decision correction request */}
                    {showSendBackToScrubberButton ? (
                        <button
                            type="button"
                            onClick={() => setIsSendBackToScrubberOpen(true)}
                            disabled={!canExecuteUnderwriterDecisions}
                            className={`${decisionButtonBase} border border-[#7a4ea3] bg-[linear-gradient(180deg,#9a6bc4_0%,#9a6bc4_55%,#ffffff_115%)] shadow-md shadow-[#9A6BC4]/25 hover:brightness-95`}
                        >
                            <span className="text-base font-roboto font-bold whitespace-normal break-words w-full px-1">
                                Send back to Scrubber
                            </span>
                            <span className="text-xs font-normal opacity-90 whitespace-normal break-words w-full leading-snug px-1">
                                Return this deal to the scrubber for corrections
                            </span>
                        </button>
                    ) : null}

                    {/* Decline Button */}
                    <button
                        type="button"
                        onClick={() => setIsRejectModalOpen(true)}
                        disabled={!canExecuteUnderwriterDecisions}
                        className={`${decisionButtonBase} border border-[#b5261a] bg-[linear-gradient(180deg,#dc331d_0%,#dc331d_55%,#ffffff_115%)] shadow-md shadow-red-700/20 hover:brightness-95`}
                    >
                        <span className="text-base font-roboto font-bold whitespace-normal break-words w-full px-1">Decline</span>
                        <span className="text-xs font-normal opacity-90 whitespace-normal break-words w-full leading-snug px-1">Decline this application</span>
                    </button>
                </div>
            </div>
            )}

            {showDecisionPanel && (
                <>
            {showSendBackToScrubberButton && applicationUuid ? (
                <SendBackToScrubberModal
                    open={isSendBackToScrubberOpen}
                    onOpenChange={setIsSendBackToScrubberOpen}
                    applicationId={String(applicationUuid)}
                    defaultScrubberId={dealScrubberId}
                    defaultScrubberEmail={dealScrubberEmail}
                    onSent={() => {
                        if (paramApplicationId) {
                            void dispatch(getApplicationById(paramApplicationId));
                        }
                    }}
                />
            ) : null}
            {adminActsAsScrubber && applicationUuid ? (
                <SendToUnderwriterModal
                    open={isSendToUnderwriterOpen}
                    onOpenChange={setIsSendToUnderwriterOpen}
                    applicationId={String(applicationUuid)}
                    onSent={() => {
                        invalidateUnderwriterPipelineCounts();
                        void dispatch(getApplicationById(paramApplicationId ?? String(applicationUuid)));
                    }}
                />
            ) : null}

            {/* Approved Application Modal */}
            <ApprovedApplicationModal
                open={isApprovalModalOpen || isIsoApprovalMailModalOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsApprovalModalOpen(false);
                        setIsIsoApprovalMailModalOpen(false);
                    }
                }}
                isPlainUnderwriter={showUnderwriterRecommendFlow}
                isFinalUnderwriter={showIsoApprovalMailFlow || isIsoApprovalMailModalOpen}
                isUnderwriterDirectApprove={
                    isApprovalModalOpen &&
                    showUnderwriterApprovalModal &&
                    !isIsoApprovalMailModalOpen
                }
                showIsoRecipientFields={isIsoApprovalMailModalOpen}
                showReinitiateContractCheckbox={showReinitiateContractCheckbox}
                onProceedToContract={onProceedToContract}
                resendApprovalEmail={shouldResendApprovalMail}
                reinitiateContract={needsContractReinitiation}
                onOfferUpdated={() => {
                    if (needsIsoApprovalMailTracking && applicationUuid) {
                        dispatch(
                            getApplicationActivityLogs(
                                paramApplicationId ?? applicationUuid,
                            ),
                        );
                    }
                }}
            />

            {isScrubberRole && applicationUuid ? (
                <MissingDocumentsModal
                    open={isMissingDocumentsModalOpen}
                    onOpenChange={setIsMissingDocumentsModalOpen}
                    applicationId={String(applicationUuid)}
                    existingNote={(applicationData as { note?: string | null } | null)?.note}
                    onSent={() => {
                        invalidateUnderwriterPipelineCounts();
                        if (paramApplicationId) {
                            void dispatch(getApplicationById(paramApplicationId));
                        }
                    }}
                />
            ) : null}

            {/* Request Missing Documents Modal */}
            <RequestMissingDocumentsModal
                open={isRequestDocumentsModalOpen}
                onOpenChange={setIsRequestDocumentsModalOpen}
            />

            {/* Reject Application Modal */}
            <RejectApplicationModal
                open={isRejectModalOpen}
                onOpenChange={setIsRejectModalOpen}
            />
                </>
            )}
        </div>
    );
};

export default ChecksAndDecision;

