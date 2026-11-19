import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useSearchParams } from "react-router";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import { useApplicationDetailLoader } from "@/hooks/useApplicationDetailLoader";

import ApplicationSummary from "@/components/application/ApplicationSummary";
import ApplicationBasicDetails from "@/components/application/ApplicationBasicDetails";
import CommentSection from "@/components/application/CommentSection";
import UploadedDocuments from "@/components/application/UploadedDocuments";
import RequiredDocument from "@/components/application/RequiredDocument";
import ChecksAndDecision from "@/components/application/ChecksAndDecision";
import DecisionMakeFinalValues from "@/components/application/DecisionMakeFinalValues";

/** Pipeline list stages where deal detail should omit bank/offer/leverage/positions UI */
const EARLY_PIPELINE_STAGES = new Set(["agent", "scrubbing"]);

/** All deal-pipeline tab values (must match `PipelineStage` / `fromStage` in DealPipeline). */
const DEAL_PIPELINE_STAGES = new Set([
  "agent",
  "scrubbing",
  "final-scrubbing",
  "doc-request-contract",
  "final",
  "funding-call",
]);

export default function DealbyId() {
  const { dealId } = useParams<{ dealId: string }>();
  const [searchParams] = useSearchParams();
  const fromStage = searchParams.get("fromStage") ?? "";
  const hideEarlyPipelineFinancials = EARLY_PIPELINE_STAGES.has(fromStage);
  const hideFundingDocumentsForPipeline = DEAL_PIPELINE_STAGES.has(fromStage);
  const userRole =
    useSelector((state: RootState) => state.login?.data?.user?.role) ||
    (typeof window !== "undefined" ? localStorage.getItem("role") : "") ||
    "";
  const roleUpper = String(userRole || "").replace(/-/g, "_").toUpperCase();
  const isOperationsRole = roleUpper === "OPERATIONS";

  const { loading, data: applicationData, error } =
    useApplicationDetailLoader(dealId);

  const ready = !loading && !!applicationData && !error;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="w-full mx-auto">
        <section className="bg-card border border-border rounded-2xl shadow-sm shadow-slate-200/50">
          <header className="sticky top-0 z-10 flex items-center px-4 py-3 md:px-6 md:py-4 border-b border-border/80 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="group inline-flex shrink-0 h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors shadow-sm"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4 md:h-5 md:w-5 transition-transform group-hover:-translate-x-0.5" />
            </button>
          </header>

          <div className="p-4 md:p-6 lg:p-8">
            {!dealId && (
              <p className="text-center text-destructive py-8" role="alert">
                Missing application id in URL.
              </p>
            )}

            {dealId && loading && !applicationData && (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Loading application…</span>
              </div>
            )}

            {dealId && error && !loading && (
              <p className="text-center text-destructive py-8" role="alert">
                {error}
              </p>
            )}

            {dealId && ready && (
              <div className="decision-making-deal-pipeline">
                <ApplicationSummary />
                <ApplicationBasicDetails applicationId={dealId} />
                <div className="mt-6">
                  {/* Rely on applicationDetail from fetch; prop would trigger numeric-only /applicationId/ route */}
                  <UploadedDocuments readOnly={isOperationsRole} />
                </div>
                <div className="flex flex-row mt-6 gap-4 w-full">
                  <RequiredDocument
                    isDecisionMaking={false}
                    isBankAnalysis={false}
                    hideBankTotal={hideEarlyPipelineFinancials}
                    hideFundingDocuments={hideFundingDocumentsForPipeline}
                    readOnly={isOperationsRole}
                  />
                </div>
                {!hideEarlyPipelineFinancials ? (
                  <div className="mt-6">
                    <DecisionMakeFinalValues />
                  </div>
                ) : null}
                {hideEarlyPipelineFinancials ? (
                  <div className="mt-6 w-full max-h-[min(32rem,70vh)] overflow-y-auto">
                    <CommentSection />
                  </div>
                ) : (
                  <div className="flex flex-row mt-6 gap-4 w-full items-stretch">
                    <div className="flex-[7] min-w-0 max-h-[467px] overflow-y-auto">
                      <CommentSection />
                    </div>
                    <div className="flex-[3] min-w-0">
                      <ChecksAndDecision hideUnderwritingDecision compactLayout />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
