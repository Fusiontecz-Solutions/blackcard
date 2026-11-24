import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, ChevronDown, PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { store } from "@/redux/store";
import {
  getApplicationByApplicationId,
  getApplicationById,
} from "@/redux/actions/applicationActions";
import { getCollectionPayments } from "@/redux/actions/collectionPaymentActions";
import {
  applicationMatchesPaymentRoute,
  buildCollectionPaymentsQuery,
  collectionPaymentsCacheKey,
  parsePaymentDealRouteParam,
  resolveApplicationDealId,
  resolveNumericApplicationId,
  resolvePrismaApplicationUuid,
  applicationPrimaryKey,
} from "@/lib/paymentDealApplicationId";

import ApplicationSummary from "@/components/application/ApplicationSummary";
import ApplicationBasicDetails from "@/components/application/ApplicationBasicDetails";
import MyNotes from "@/components/application/MyNotes";
import UploadedDocuments from "@/components/application/UploadedDocuments";
import RequiredDocument from "@/components/application/RequiredDocument";
import ChecksAndDecision from "@/components/application/ChecksAndDecision";
import DecisionMakeFinalValues from "@/components/application/DecisionMakeFinalValues";

import { prefetchPaymentTemplates } from "./paymentTemplateApi";
import { DealHero, DealSidebar } from "./dealsPortfolio/DealHero";
import Transactions from "./Transactions";
import FundingCommissionTab from "./FundingCommissionTab";
import Templates from "./Templates";
import Letters from "./Letters";
import MailLogs from "./MailLogs";
import ActionLogs from "./ActionLogs";
import PaymentCommunicationTab from "./PaymentCommunicationTab";
import ApplicationSyndicationTab, {
  buildSyndicationDealHints,
} from "@/components/application/ApplicationSyndicationTab";

type TabId =
  | "overview"
  | "collections"
  | "templates"
  | "letters"
  | "mailLogs"
  | "actionLogs"
  | "communication"
  | "syndication"
  | "fundingCommission";
  

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "collections", label: "Transactions" },
  { id: "fundingCommission", label: "Funding & Commission" },
  { id: "templates", label: "Templates" },
  { id: "letters", label: "Letters" },
  { id: "mailLogs", label: "Mail logs" },
  { id: "actionLogs", label: "Action logs" },
  { id: "communication", label: "Communication" },
  { id: "syndication", label: "Syndication" },
];

const merchantOpenByDefault = (tab: TabId) => tab === "overview" || tab === "collections";

const sidebarMotion = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
};

type PaymentDealByIdProps = {
  /** Deal ref to show instead of the `:paymentDealId` route param (e.g. when embedded in Merchant Deals). */
  dealRefOverride?: string;
  /** Render without the full-page shell (no min-h-screen / outer padding). */
  embedded?: boolean;
};

export default function PaymentDealById({
  dealRefOverride,
  embedded = false,
}: PaymentDealByIdProps = {}) {
  const { paymentDealId: routeDealId } = useParams<{ paymentDealId: string }>();
  const paymentDealId = dealRefOverride ?? routeDealId;
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [merchantOpen, setMerchantOpen] = useState(!embedded);
  const [openApp, setOpenApp] = useState(false);
  const [openDocs, setOpenDocs] = useState(false);
  const [openOffer, setOpenOffer] = useState(false);
  const [openChecks, setOpenChecks] = useState(false);

  const selectTab = (id: TabId) => {
    setActiveTab(id);
    setMerchantOpen(!embedded && merchantOpenByDefault(id));
  };

  const routeRef = useMemo(
    () => parsePaymentDealRouteParam(paymentDealId),
    [paymentDealId],
  );

  const { loading, isRefreshing, data: applicationData, error } = useSelector(
    (state: RootState) => state.applicationDetail,
  );

  const applicationUuid = useMemo(
    () => resolvePrismaApplicationUuid(applicationData),
    [applicationData],
  );

  const routeCollectionQuery = useMemo(() => {
    const routeUuid = routeRef.kind === "uuid" ? routeRef.value : "";
    const routeNumeric =
      routeRef.kind === "numericApplicationId" ? routeRef.value : "";
    const routeDeal = routeRef.kind === "dealId" ? routeRef.value : "";
    return buildCollectionPaymentsQuery({
      prismaApplicationUuid: resolvePrismaApplicationUuid(applicationData) || routeUuid,
      numericApplicationId:
        resolveNumericApplicationId(applicationData) || routeNumeric,
      dealId: resolveApplicationDealId(applicationData) || routeDeal,
    });
  }, [applicationData, routeRef]);

  const collectionsCacheKey = useMemo(
    () =>
      collectionPaymentsCacheKey({
        prismaApplicationUuid:
          resolvePrismaApplicationUuid(applicationData) ||
          (routeRef.kind === "uuid" ? routeRef.value : ""),
        numericApplicationId:
          resolveNumericApplicationId(applicationData) ||
          (routeRef.kind === "numericApplicationId" ? routeRef.value : ""),
        dealId:
          resolveApplicationDealId(applicationData) ||
          (routeRef.kind === "dealId" ? routeRef.value : ""),
      }),
    [applicationData, routeRef],
  );

  const collectionsAlreadyFetched = useSelector((state: RootState) =>
    collectionsCacheKey
      ? Boolean(state.collectionPayments.fetched[collectionsCacheKey])
      : false,
  );

  useEffect(() => {
    if (!collectionsCacheKey || collectionsAlreadyFetched) return;
    dispatch(
      getCollectionPayments({
        ...routeCollectionQuery,
        includeDealView: true,
      }),
    );
  }, [
    dispatch,
    collectionsCacheKey,
    routeCollectionQuery,
    collectionsAlreadyFetched,
  ]);

  useEffect(() => {
    if (routeRef.kind === "empty") return;
    const { data, error: detailError } = store.getState().applicationDetail;
    if (data != null && applicationMatchesPaymentRoute(data, routeRef) && !detailError) {
      return;
    }

    if (routeRef.kind === "uuid") {
      dispatch(getApplicationById(routeRef.value));
      return;
    }
    if (routeRef.kind === "numericApplicationId") {
      dispatch(getApplicationByApplicationId(routeRef.value));
      return;
    }

    void dispatch(
      getCollectionPayments({
        applicationId: "",
        dealId: routeRef.value,
        includeDealView: true,
      }),
    )
      .unwrap()
      .then((result) => {
        const viewUuid = (
          result as { dealView?: { viewApplicationId?: string } | null }
        )?.dealView?.viewApplicationId;
        if (viewUuid) dispatch(getApplicationById(viewUuid));
      })
      .catch(() => {
        /* Collections tab surfaces fetch errors; overview may stay empty for unknown deal ids. */
      });
  }, [dispatch, routeRef]);

  useEffect(() => {
    prefetchPaymentTemplates();
  }, []);

  const syndicationDealHints = useMemo(
    () => buildSyndicationDealHints(applicationData),
    [applicationData],
  );

  // const dealLabel = useMemo(() => {
  //   if (!paymentDealId?.trim()) return "—";
  //   try {
  //     return decodeURIComponent(paymentDealId);
  //   } catch {
  //     return paymentDealId;
  //   }
  // }, [paymentDealId]);

  const showOverview = Boolean(applicationData);
  const showInitialSpinner = loading && !applicationData;
  const showFatalError = Boolean(error && !applicationData && !loading);

  return (
    <div
      className={cn(
        "payment-module crm-keep-case bg-background font-sans text-foreground",
        embedded ? "p-4 sm:p-5" : "min-h-screen p-6 lg:p-10",
      )}
    >
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col items-stretch gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 rounded-2xl border border-border/70 bg-card/95 shadow-lg ring-1 ring-inset ring-border/40 dark:border-white/10 dark:bg-white/[0.03] dark:ring-white/10">
          <div className="border-b border-border/60 px-5 pb-4 pt-5 sm:px-6">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                {/* <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Payment deal
                </p>
                <p
                  className="mt-1 truncate text-lg font-semibold text-foreground"
                  title={dealLabel}
                >
                  {dealLabel}
                </p> */}
                {isRefreshing && applicationData && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating…
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                {tabs.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectTab(id)}
                    className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors sm:px-4 ${
                      activeTab === id
                        ? "tab-pipeline-active shadow-sm"
                        : "text-muted-foreground hover:bg-background hover:text-foreground dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {embedded ? null : (
                <button
                  type="button"
                  onClick={() => setMerchantOpen((open) => !open)}
                  aria-expanded={merchantOpen}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted",
                    merchantOpen ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {merchantOpen ? (
                    <PanelRightClose className="size-3.5" aria-hidden />
                  ) : (
                    <PanelRightOpen className="size-3.5" aria-hidden />
                  )}
                  {merchantOpen ? "Hide merchant" : "Show merchant"}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-6 p-5 sm:p-6">
            {activeTab === "overview" && (
              <>
                <DealHero
                  dealRef={paymentDealId}
                  onBack={() => navigate(-1)}
                  showBack={!embedded}
                  applicationId={
                    applicationUuid || applicationPrimaryKey(applicationData) || undefined
                  }
                  category={applicationData?.category}
                />

                <details
                  open={openApp}
                  className="group overflow-hidden rounded-xl border border-border/60"
                  onToggle={(e) => setOpenApp((e.target as HTMLDetailsElement).open)}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40">
                    <span>Application details</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  {openApp ? (
                  <div className="border-t border-border/60 p-4">
                {showInitialSpinner && (
                  <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Loading application…</span>
                  </div>
                )}

                {showFatalError && (
                  <p className="py-8 text-center text-destructive" role="alert">
                    {error}
                  </p>
                )}

                {showOverview && (
                  <div className="decision-making-deal-pipeline space-y-4">
                    <ApplicationSummary />
                    <ApplicationBasicDetails
                      applicationId={applicationUuid || paymentDealId || ""}
                    />

                    {/* Heavy sections are collapsible so the overview stays scannable */}
                    <details
                      open={openDocs}
                      className="group overflow-hidden rounded-xl border border-border/60"
                      onToggle={(e) => setOpenDocs((e.target as HTMLDetailsElement).open)}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40">
                        <span>Documents</span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      {openDocs ? (
                        <div className="space-y-6 border-t border-border/60 p-4">
                          <UploadedDocuments />
                          <div className="flex w-full flex-row gap-4">
                            <RequiredDocument
                              isDecisionMaking={false}
                              isBankAnalysis={false}
                              hideBankTotal
                              skipFinancialFetches
                            />
                          </div>
                        </div>
                      ) : null}
                    </details>

                    <details
                      open={openOffer}
                      className="group overflow-hidden rounded-xl border border-border/60"
                      onToggle={(e) => setOpenOffer((e.target as HTMLDetailsElement).open)}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40">
                        <span>Offer, leverage &amp; positions</span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      {openOffer ? (
                        <div className="border-t border-border/60 p-4">
                          <DecisionMakeFinalValues />
                        </div>
                      ) : null}
                    </details>

                    <details
                      open={openChecks}
                      className="group overflow-hidden rounded-xl border border-border/60"
                      onToggle={(e) => setOpenChecks((e.target as HTMLDetailsElement).open)}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40">
                        <span>Checks &amp; notes</span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      {openChecks ? (
                        <div className="flex w-full flex-row gap-4 border-t border-border/60 p-4">
                          <ChecksAndDecision hideUnderwritingDecision />
                          <div className="w-[50%]">
                            <MyNotes applicationId={applicationUuid || paymentDealId || ""} />
                          </div>
                        </div>
                      ) : null}
                    </details>
                  </div>
                )}
                  </div>
                  ) : null}
                </details>
              </>
            )}

            {activeTab === "collections" && <Transactions />}
            {activeTab === "fundingCommission" && applicationUuid && (
              <FundingCommissionTab applicationId={applicationUuid} />
            )}
            {activeTab === "templates" && <Templates />}
            {activeTab === "letters" && <Letters />}
            {activeTab === "mailLogs" && <MailLogs />}
            {activeTab === "actionLogs" && <ActionLogs />}
            {activeTab === "communication" && <PaymentCommunicationTab />}
            {activeTab === "syndication" && (
              <>
                {showInitialSpinner && (
                  <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Loading application…</span>
                  </div>
                )}
                {showFatalError && (
                  <p className="py-8 text-center text-destructive" role="alert">
                    {error}
                  </p>
                )}
                {showOverview && (
                  <ApplicationSyndicationTab
                    applicationId={applicationUuid || paymentDealId || ""}
                    dealHints={syndicationDealHints}
                  />
                )}
              </>
            )}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {merchantOpen ? (
            <motion.div
              key="merchant-sidebar"
              {...sidebarMotion}
              className="w-full shrink-0 xl:w-[340px]"
            >
              <DealSidebar dealRef={paymentDealId} />
            </motion.div>
          ) : null}
        </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
