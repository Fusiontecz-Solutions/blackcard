import { isScrubberDeclineRecommendation } from "@/lib/scrubberDeclineReasons";
import { resolveDecisionTrail } from "@/lib/decisionTrail";
import { useEffect, useMemo } from "react";
import { normalizeRoleKey, resolveEffectiveRole } from "@/lib/sessionRole";
import { useDispatch, useSelector } from "react-redux";
import { Card, CardContent } from "../ui/card"
import type { AppDispatch, RootState } from "@/redux/store";
import { Skeleton } from "../ui/skeleton";
import { useTheme } from "@/context/ThemeContext";
import { ChevronLeft } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatActionRequired } from "@/lib/formatActionRequired";
import { isApplicationInFinalApprovalStage } from "@/lib/applicationWorkflowState";
import { isUnderwriterApprovedApplication } from "@/lib/underwriterApprovalLabel";
import ApprovedByUnderwriterBadge from "./ApprovedByUnderwriterBadge";
import FinalApprovalSourceBadge from "./FinalApprovalSourceBadge";
import DeclineReasonInfoIcon from "./DeclineReasonInfoIcon";
import { resolveApplicationOfferAmount } from "@/lib/applicationLoanAmount";
import {
    getApplicationSummaryStatusLabel,
    resolveApplicationTableCurrentQueue,
} from "@/lib/applicationSummaryStatus";
import { findApplicationListRowForRoute } from "@/lib/applicationDetailCache";
import {
    OFFER_DECISION_UPDATED_EVENT,
    offerDecisionUpdateMatchesApplication,
} from "@/lib/offerDecisionSync";
import { getOfferDecisionByApplication } from "@/redux/actions/offerDecisionActions";
import { getTermsOffers } from "@/redux/actions/termsOfferActions";
import type { Application } from "@/types/applicationTypes";
import {
    isDeclinedStatusLabel,
    resolveStatusDeclineReasonsForDisplay,
} from "@/lib/scrubberDeclineReasonsDisplay";
// import { Button } from "../ui/button";

interface ApplicationSummaryProps {
    isUnderwriter?: boolean;
    /** When true, show the Scrubber Request field (Underwriter role only). */
    showScrubberRequest?: boolean;
    /** When provided (e.g. on application-detail overview for agent), only show data for this application — no static values */
    applicationId?: string | null;
    /** Called when back arrow is clicked */
    onBack?: () => void;
}

const ApplicationSummary = ({
    isUnderwriter,
    showScrubberRequest,
    applicationId,
    onBack,
}: ApplicationSummaryProps) => {
    const dispatch = useDispatch<AppDispatch>();
    const { loading: fetchLoading, data: applicationData } = useSelector(
        (state: RootState) => state.applicationDetail
    );
    const applicationsListRows = useSelector(
        (state: RootState) => state.applications.data,
    );
    const { data: offerDecisionData, loading: offerDecisionLoading } = useSelector(
        (state: RootState) => state.offerDecision,
    );
    const { data: termsOffers, loading: termsOffersLoading } = useSelector(
        (state: RootState) => state.termsOffers,
    );
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const loginUser = useSelector((state: RootState) => state.login.data?.user);
    const viewerRoleKey = useMemo(
        () => normalizeRoleKey(resolveEffectiveRole(loginUser)),
        [loginUser],
    );
    const isUnderwriterViewer = viewerRoleKey === "UNDERWRITER";

    // When applicationId is provided (e.g. agent on overview), only use data that matches the current application
    const normalizedApplicationId =
        applicationId === null || applicationId === undefined
            ? null
            : String(applicationId);

    const dataApplicationId = (applicationData as any)?.applicationId;
    const dataId = (applicationData as any)?._id;

    const appIdMatch =
        !normalizedApplicationId || !applicationData
            ? true
            : String(dataId ?? "") === normalizedApplicationId ||
            String(dataApplicationId ?? "") === normalizedApplicationId;

    const showDynamicData = appIdMatch && applicationData;
    const apiApplicationKey = showDynamicData
        ? String(
            (applicationData as { applicationId?: string | number; _id?: string })?.applicationId ??
            (applicationData as { _id?: string })?._id ??
            normalizedApplicationId ??
            "",
        ).trim()
        : "";

    useEffect(() => {
        if (!apiApplicationKey) return;
        void dispatch(getOfferDecisionByApplication(apiApplicationKey));
        void dispatch(getTermsOffers({ application: apiApplicationKey }));
    }, [apiApplicationKey, dispatch]);

    useEffect(() => {
        if (!apiApplicationKey) return;
        const onOfferDecisionUpdated = (event: Event) => {
            const detail = (event as CustomEvent<{ applicationId?: string }>).detail;
            if (
                !offerDecisionUpdateMatchesApplication(
                    detail?.applicationId,
                    apiApplicationKey,
                )
            ) {
                return;
            }
            void dispatch(getOfferDecisionByApplication(apiApplicationKey));
            void dispatch(getTermsOffers({ application: apiApplicationKey }));
        };
        window.addEventListener(OFFER_DECISION_UPDATED_EVENT, onOfferDecisionUpdated);
        return () => {
            window.removeEventListener(
                OFFER_DECISION_UPDATED_EVENT,
                onOfferDecisionUpdated,
            );
        };
    }, [apiApplicationKey, dispatch]);

    const latestTermsOffer = termsOffers?.[0];
    const offerDecisionSource =
        offerDecisionData ??
        (applicationData?.OfferDecision as Record<string, unknown> | null | undefined) ??
        null;
    const offerAmount = showDynamicData
        ? resolveApplicationOfferAmount(offerDecisionSource, latestTermsOffer)
        : null;

    const isLoading = fetchLoading;
    const offerAmountLoading =
        Boolean(apiApplicationKey) && (offerDecisionLoading || termsOffersLoading);

    const clientName = showDynamicData
        ? (applicationData?.client as any)?.owner?.firstName + ' ' + (applicationData?.client as any)?.owner?.lastName
        : null;
    const businessName = showDynamicData ? (applicationData?.client as any)?.business?.name : null;
    const loanAmount = showDynamicData && applicationData?.loanAmount != null
        ? Number(applicationData.loanAmount)
        : null;
    const matchingListRow = useMemo(() => {
        if (!showDynamicData || !applicationData) return undefined;
        const routeKey =
            normalizedApplicationId ??
            String(
                (applicationData as { applicationId?: string | number; _id?: string })
                    .applicationId ??
                    (applicationData as { _id?: string })._id ??
                    "",
            ).trim();
        if (!routeKey) return undefined;
        return findApplicationListRowForRoute(routeKey, applicationsListRows);
    }, [
        showDynamicData,
        applicationData,
        normalizedApplicationId,
        applicationsListRows,
    ]);

    const queueStatus = showDynamicData
        ? getApplicationSummaryStatusLabel({
              currentQueue: resolveApplicationTableCurrentQueue(
                  applicationData,
                  matchingListRow,
              ),
          })
        : null;
    /** Scrubber declined and the deal waits for Super Admin: say so instead of just "Underwriter". */
    const isPendingScrubberDecline =
        showDynamicData &&
        isScrubberDeclineRecommendation(
            (applicationData as { scrubberRecommendation?: string | null })?.scrubberRecommendation,
        ) &&
        !(applicationData as { underwriterAction?: string | null })?.underwriterAction &&
        /underwrit/i.test(String(queueStatus ?? ""));
    // Same name as the "Decline request" status in the sidebar.
    const status = isPendingScrubberDecline ? "Decline Request" : queueStatus;
    const adminDecision =
        resolveDecisionTrail(showDynamicData ? (applicationData as any) : null)[2];
    const actionRequired = showDynamicData ? formatActionRequired((applicationData as any)?.note) : "--";
    const isUnderwriterApproved = showDynamicData
        ? isUnderwriterApprovedApplication(applicationData)
        : false;
    const finalApprovalSource = showDynamicData
        ? (
              (applicationData as { finalApprovalSource?: Application["finalApprovalSource"] })
                  ?.finalApprovalSource ?? null
          )
        : null;
    const showFinalApprovalSourceBadge =
        showDynamicData &&
        Boolean(finalApprovalSource) &&
        isApplicationInFinalApprovalStage(applicationData) &&
        isUnderwriterViewer;
    const scrubberRecommendation = showDynamicData
        ? (
              (applicationData as { scrubberRecommendation?: string | null })
                  ?.scrubberRecommendation ?? ""
          ).trim() || null
        : null;
    const statusDeclineReasons = useMemo(() => {
        if (!showDynamicData || !applicationData || !isDeclinedStatusLabel(status)) {
            return [] as string[];
        }
        return resolveStatusDeclineReasonsForDisplay({
            scrubberRecommendation,
            scrubberDeclineReasons: (
                applicationData as {
                    scrubberDeclineReasons?: string | null | string[];
                }
            )?.scrubberDeclineReasons,
            note: (applicationData as { note?: string | null })?.note,
            declineReason: (
                applicationData as { declineReason?: string | null }
            )?.declineReason,
            OfferDecision: offerDecisionSource as {
                declineReason?: string | null;
            } | null,
        });
    }, [showDynamicData, applicationData, status, scrubberRecommendation, offerDecisionSource]);
    const showScrubberRequestField = Boolean(showScrubberRequest);
    // Brand gradient via CSS tokens; light mode fades to a soft brand tint (not white)
    // so the white heading/labels stay readable. Dark mode keeps --brand-gradient.
    const gradient = isDark
        ? "var(--brand-gradient)"
        : "linear-gradient(120deg, var(--brand) 0%, var(--brand-mid) 55%, color-mix(in srgb, var(--brand-accent) 70%, white) 100%)";

    const panelTint = isDark
        ? "bg-white/10 border border-white/15"
        : "bg-white/15 border border-white/20";

    const innerPanelClass = `grid gap-4 rounded-lg p-4 justify-center items-center shadow-md dark:shadow-lg ${panelTint} grid-cols-1 md:grid-cols-3 ${
        showScrubberRequestField ? "lg:grid-cols-7" : "lg:grid-cols-6"
    }`;

    const standardFiveColumns = (
        <>
            <div className="text-white">
                {isLoading ? (
                    <div className="space-y-2 pr-12">
                        <Skeleton className="h-4 w-[150px] bg-white/30" />
                        <Skeleton className="h-4 w-[100px] bg-white/30" />
                    </div>
                ) : (
                    <>
                        <p className="text-sm font-medium opacity-90 mb-1">Borrower Name</p>
                        <p className="text-base font-semibold capitalize">{clientName ?? "-"}</p>
                    </>
                )}
            </div>
            <div className="text-white">
                {isLoading ? (
                    <div className="space-y-2 pr-12">
                        <Skeleton className="h-4 w-[150px] bg-white/30" />
                        <Skeleton className="h-4 w-[100px] bg-white/30" />
                    </div>
                ) : (
                    <>
                        <p className="text-sm font-medium opacity-90 mb-1">Business Name</p>
                        <p className="text-base font-semibold capitalize">{businessName ?? "-"}</p>
                    </>
                )}
            </div>
            <div className="text-white">
                {isLoading ? (
                    <div className="space-y-2 pr-12">
                        <Skeleton className="h-4 w-[150px] bg-white/30" />
                        <Skeleton className="h-4 w-[100px] bg-white/30" />
                    </div>
                ) : (
                    <>
                        <p className="text-sm font-medium opacity-90 mb-1">Requested Amount</p>
                        <p className="text-base font-semibold">
                            {loanAmount != null ? formatCurrency(loanAmount) : "-"}
                        </p>
                    </>
                )}
            </div>
            <div className="text-white">
                {isLoading || offerAmountLoading ? (
                    <div className="space-y-2 pr-12">
                        <Skeleton className="h-4 w-[150px] bg-white/30" />
                        <Skeleton className="h-4 w-[100px] bg-white/30" />
                    </div>
                ) : (
                    <>
                        <p className="text-sm font-medium opacity-90 mb-1">Offer Amount</p>
                        <p className="text-base font-semibold">
                            {offerAmount != null ? formatCurrency(offerAmount) : "-"}
                        </p>
                    </>
                )}
            </div>
            <div className="text-white">
                {isLoading ? (
                    <div className="space-y-2 pr-12">
                        <Skeleton className="h-4 w-[150px] bg-white/30" />
                        <Skeleton className="h-4 w-[100px] bg-white/30" />
                    </div>
                ) : (
                    <>
                        <p className="text-sm font-medium opacity-90 mb-1">Status</p>
                        <div className="flex items-center gap-1.5">
                            <p className="text-base font-semibold capitalize">{status ?? "-"}</p>
                            {isDeclinedStatusLabel(status) ? (
                                <DeclineReasonInfoIcon
                                    reasons={statusDeclineReasons}
                                    className="text-white/90 hover:text-white hover:bg-white/15"
                                    iconClassName="h-4 w-4"
                                />
                            ) : null}
                        </div>
                    </>
                )}
            </div>
            <div className="text-white text-left">
                {isLoading ? (
                    <div className="space-y-2 pr-12">
                        <Skeleton className="h-4 w-[150px] bg-white/30" />
                        <Skeleton className="h-4 w-[100px] bg-white/30" />
                    </div>
                ) : (
                    <>
                        <p className="text-sm font-medium opacity-90 mb-1">Decision</p>
                        <p className="text-base font-semibold font-roboto whitespace-pre-wrap break-words">
                            {actionRequired}
                        </p>
                    </>
                )}
            </div>
            {showScrubberRequestField ? (
                <div className="text-white">
                    {isLoading ? (
                        <div className="space-y-2 pr-12">
                            <Skeleton className="h-4 w-[150px] bg-white/30" />
                            <Skeleton className="h-4 w-[100px] bg-white/30" />
                        </div>
                    ) : (
                        <>
                            <p className="text-sm font-medium opacity-90 mb-1">
                                Admin Decision
                            </p>
                            {/* Super Admin makes the final call (sent to the ISO); until then it's pending. */}
                            <span
                                className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    adminDecision.tone === "approved"
                                        ? "bg-green-100 text-green-800"
                                        : adminDecision.tone === "declined"
                                          ? "bg-red-100 text-red-800"
                                          : "bg-amber-100 text-amber-800"
                                }`}
                            >
                                {adminDecision.tone === "approved"
                                    ? "Approved"
                                    : adminDecision.tone === "declined"
                                      ? "Declined"
                                      : "Pending"}
                            </span>
                        </>
                    )}
                </div>
            ) : null}
        </>
    );

    return (
        <Card className={`border-0 rounded-lg shadow-xl overflow-hidden mb-6 py-0 ${isDark ? 'ring-1 ring-slate-500/30' : 'dark:border dark:border-border'}`}>
            <CardContent
                className="px-8 py-6"
                style={{ background: gradient }}
            >
                <div className="flex flex-wrap items-center gap-3 mb-5">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="flex items-center justify-center w-9 h-9 rounded-full text-white hover:bg-white/20 transition-colors"
                            aria-label="Go back"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                    )}
                    <h2 className="text-white text-2xl font-[700] font-roboto uppercase tracking-wide">
                        Submission Summary
                    </h2>
                    {isUnderwriterApproved ? (
                        <ApprovedByUnderwriterBadge
                            app={
                                (applicationData ?? {}) as Parameters<
                                    typeof ApprovedByUnderwriterBadge
                                >[0]["app"]
                            }
                            fallback="—"
                        />
                    ) : null}
                    {showFinalApprovalSourceBadge ? (
                        <FinalApprovalSourceBadge source={finalApprovalSource} />
                    ) : null}
                </div>
                <div className={innerPanelClass}>
                    {standardFiveColumns}
                </div>
                {/* {isUnderwriter && (
                    <div className="flex gap-2 items-center">
                        <Button variant="outline" className="h-9 gap-2 w-fit">
                            <span className="w-fit bg-[image:var(--brand-gradient)] text-white px-2 py-1 rounded-sm">Edit</span>
                        </Button>
                        <Button variant="outline" className="h-9 gap-2 bg-[#FFC3C3]">Delete</Button>
                    </div>
                )} */}
            </CardContent>
        </Card>
    )
}

export default ApplicationSummary;