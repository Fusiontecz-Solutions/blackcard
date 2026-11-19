import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import DecisionLogicInfo from "@/components/client/decision-logic/decision-logic-info-section";
import { fetchDecisionLogicReport } from "@/redux/actions/decision-logic-actions";
import {
  isDecisionLogicReportRowComplete,
  isDecisionLogicVerificationIncomplete,
  pickBestDecisionLogicReportRow,
} from "@/lib/decisionLogicReportStatus";

export default function DecisionLogicSuccessPage() {
  const [searchParams] = useSearchParams();
  const businessOwnerId = useMemo(
    () => Number(searchParams.get("businessOwnerId") ?? 0),
    [searchParams],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportRow, setReportRow] = useState<Record<string, unknown> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!Number.isFinite(businessOwnerId) || businessOwnerId <= 0) {
        if (!cancelled) {
          setError("Missing business owner id for report retrieval.");
          setLoading(false);
        }
        return;
      }

      const response = await fetchDecisionLogicReport(0, businessOwnerId);
      if (cancelled) return;
      if ((response as { error?: string })?.error) {
        setError(
          String(
            (response as { error?: string }).error ||
              "Failed to fetch Decision Logic report.",
          ),
        );
        setLoading(false);
        return;
      }

      const rows = (response as { data?: unknown })?.data;
      const best = pickBestDecisionLogicReportRow(rows);
      setReportRow(best);
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [businessOwnerId]);

  const reportComplete = isDecisionLogicReportRowComplete(reportRow);
  const reportIncomplete = isDecisionLogicVerificationIncomplete(reportRow);

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-4">
        {loading ? null : reportComplete ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <h1 className="text-lg font-semibold text-green-700">
              Bank verification completed
            </h1>
            <p className="mt-1 text-sm text-green-700">
              Decision Logic finished processing. Full report data is shown below.
            </p>
          </div>
        ) : reportIncomplete ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h1 className="text-lg font-semibold text-amber-900">
              Bank verification not completed
            </h1>
            <p className="mt-1 text-sm text-amber-900">
              Status is &quot;{String(reportRow?.statusText ?? "Not Started")}&quot;.
              Return to the verification link and finish bank login in the widget.
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
            Loading Decision Logic report...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : reportRow ? (
          <DecisionLogicInfo data={reportRow} />
        ) : (
          <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
            No Decision Logic report found yet for this owner.
          </div>
        )}
      </div>
    </div>
  );
}
