import { useMemo } from "react";
import { useSelector } from "react-redux";
import { AlertTriangle } from "lucide-react";
import type { RootState } from "@/redux/store";
import { useTheme } from "@/context/ThemeContext";
import { formatDateTimeET } from "@/lib/dateTime";

const REASON_DELIMITER = "|||";

type ReturnedUnderwriter = {
  id?: string;
  _id?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

function parseReasons(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((r) => String(r ?? "").trim()).filter(Boolean);
  }
  return String(raw ?? "")
    .split(REASON_DELIMITER)
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Scrubbing tab banner shown while a deal is back with the scrubber because the
 * Underwriter asked for corrections. Clears when the scrubber resends the deal.
 */
export default function ReturnedForCorrectionBanner() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const applicationData = useSelector(
    (state: RootState) => state.applicationDetail.data,
  );

  const returnedAt = (applicationData as { returnedToScrubberAt?: string | null })
    ?.returnedToScrubberAt;
  const note = String(
    (applicationData as { returnNote?: string | null })?.returnNote ?? "",
  ).trim();
  const reasons = useMemo(
    () => parseReasons((applicationData as { returnReasons?: unknown })?.returnReasons),
    [applicationData],
  );

  const underwriter = (
    applicationData as { returnedByUnderwriter?: ReturnedUnderwriter | null }
  )?.returnedByUnderwriter;
  const underwriterName =
    `${underwriter?.firstName ?? ""} ${underwriter?.lastName ?? ""}`.trim() ||
    String(underwriter?.email ?? "").trim() ||
    "The Underwriter";

  // The stamp alone is not enough: a deal that has moved on must not keep
  // showing the banner, even if an old stamp was never cleared. Only show it
  // while the deal is actually back in Scrubbing with no decision recorded.
  const queueToken = String(
    (applicationData as { currentQueue?: string | null })?.currentQueue ?? "",
  )
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const awaitingCorrection =
    queueToken === "SCRUBBING" &&
    !(applicationData as { underwriterAction?: string | null })?.underwriterAction &&
    !(applicationData as { approvedByUnderwriterId?: string | null })
      ?.approvedByUnderwriterId;

  if (!returnedAt || !awaitingCorrection) return null;

  return (
    <div
      className={`mt-3 rounded-lg border-l-4 border-l-[#EAA95A] p-4 ${
        isDark
          ? "bg-amber-500/10 border border-amber-500/30"
          : "bg-[#FFFBEB] border border-[#FDE68A]"
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-[#D97706]"
          aria-hidden
        />
        <div className="space-y-2">
          <p
            className={`text-sm font-semibold ${
              isDark ? "text-amber-200" : "text-[#92400E]"
            }`}
          >
            {underwriterName} sent this deal back for correction
            <span className="font-normal opacity-80">
              {" "}
              — {formatDateTimeET(returnedAt)}
            </span>
          </p>

          {reasons.length > 0 ? (
            <ul
              className={`list-disc space-y-0.5 pl-5 text-sm ${
                isDark ? "text-amber-100/90" : "text-[#78350F]"
              }`}
            >
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}

          {note ? (
            <p
              className={`text-sm ${
                isDark ? "text-amber-100/90" : "text-[#78350F]"
              }`}
            >
              {note}
            </p>
          ) : null}

          <p
            className={`text-xs ${
              isDark ? "text-amber-100/70" : "text-[#92400E]/80"
            }`}
          >
            Correct the deal and recommend it again — it goes straight back to{" "}
            {underwriterName}.
          </p>
        </div>
      </div>
    </div>
  );
}
