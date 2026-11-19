import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useApplicationDetailLoader } from "@/hooks/useApplicationDetailLoader";
import { Button } from "@/components/ui/button";

import Letters from "@/pages/payment/Letters";
import { prefetchPaymentTemplates } from "@/pages/payment/paymentTemplateApi";
import { letterApplicationIdFromApp } from "@/pages/templates/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isApplicationUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

/**
 * Letter generator drill-in: open an application and go straight to
 * Payoff / Zero Balance letter send (no Templates tab).
 */
export default function LetterGeneratorDealById() {
  const { letterGeneratorDealId } = useParams<{ letterGeneratorDealId: string }>();
  const navigate = useNavigate();

  const applicationId = useMemo(() => {
    const raw = letterGeneratorDealId?.trim();
    if (!raw) return "";
    try {
      const decoded = decodeURIComponent(raw);
      return isApplicationUuid(decoded) ? decoded : "";
    } catch {
      return isApplicationUuid(raw) ? raw : "";
    }
  }, [letterGeneratorDealId]);

  const { loading, data: applicationData, error } =
    useApplicationDetailLoader(applicationId || undefined);

  useEffect(() => {
    prefetchPaymentTemplates();
  }, []);

  const ready = !loading && !!applicationData && !error;

  if (!applicationId) {
    return (
      <div className="min-h-screen bg-background p-6 lg:p-10">
        <p className="text-center text-destructive" role="alert">
          Invalid application link. Use Letters and pick an application from the list.
        </p>
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="outline" onClick={() => navigate("/letter-generator")}>
            Back to list
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 font-sans text-foreground lg:p-10">
      <div className="mx-auto w-full space-y-6">
        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white shadow-lg ring-1 ring-inset ring-white/10 dark:border-border dark:bg-card">
          <div className="border-b border-border/60 px-5 pb-4 pt-5 sm:px-6">
            <div className="flex flex-wrap items-start gap-4">
              <button
                type="button"
                onClick={() => navigate("/letter-generator")}
                className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-all hover:border-[var(--brand)]/40 hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 focus-visible:ring-offset-2"
                aria-label="Back to application list"
                title="Back to list"
              >
                <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Letters
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {letterApplicationIdFromApp(applicationData) || "Application"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose Payoff or Zero Balance and send.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-5 sm:p-6">
            {loading && !applicationData && (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Loading application…</span>
              </div>
            )}

            {error && !loading && (
              <p className="py-8 text-center text-destructive" role="alert">
                {error}
              </p>
            )}

            {ready && <Letters />}
          </div>
        </div>
      </div>
    </div>
  );
}
