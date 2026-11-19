import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import { axiosGet } from "@/redux/axios";
import { useTheme } from "@/context/ThemeContext";
import { formatDateTimeET } from "@/lib/dateTime";
import type { ApplicationActivityLog } from "@/redux/actions/applicationActivityLogActions";
import type { Application, ApplicationUserLite } from "@/types/applicationTypes";
import {
    applicationDecisionStageTitle,
    applicationDecisionToneClass,
    resolveApplicationCurrentDecision,
} from "@/lib/applicationCurrentDecision";
import {
    resolveRequestDeclineReasonsForDisplay,
    resolveStatusDeclineReasonsForDisplay,
} from "@/lib/scrubberDeclineReasonsDisplay";

interface SentToUnderwriterInfoProps {
    /** Route application id (numeric applicationId or uuid). */
    applicationId?: string | null;
    /**
     * Underwriter / Super Admin: also show the deal's Current Decision (with the
     * decline-reason tooltip), matching the Underwriter list column.
     */
    showCurrentDecision?: boolean;
}

/** Normalize a queue token so "Underwriter", "UNDER_WRITER" etc. compare equal. */
function queueToken(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}

/** True when the log records the deal moving into the Underwriter queue. */
function isSentToUnderwriterLog(log: ApplicationActivityLog): boolean {
    if (String(log.actionType ?? "").toUpperCase() === "SEND_TO_UNDERWRITER") return true;
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    if (queueToken(meta.newQueue) === "UNDERWRITER") return true;
    // currentStatus is stored as `${queue} / ${state}`.
    return queueToken(String(log.currentStatus ?? "").split("/")[0]) === "UNDERWRITER";
}

function asUserLite(value: unknown): ApplicationUserLite | null {
    return value && typeof value === "object" ? (value as ApplicationUserLite) : null;
}

function fullName(user: ApplicationUserLite | null): string {
    if (!user) return "";
    return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
}

/**
 * Scrubbing tab strip showing which underwriter the deal was sent to and when.
 * The underwriter comes from the application's routing stamp
 * (`assignedUnderwriter`, else the scrubbing claim / approver); the timestamp
 * comes from the activity-log entry that moved the deal into the Underwriter queue.
 */
export default function SentToUnderwriterInfo({
    applicationId,
    showCurrentDecision = false,
}: SentToUnderwriterInfoProps) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const applicationData = useSelector((state: RootState) => state.applicationDetail.data);
    const offerDecisionData = useSelector((state: RootState) => state.offerDecision.data);

    const applicationKey = String(
        applicationId ??
            (applicationData as { applicationId?: string | number } | null)?.applicationId ??
            (applicationData as { _id?: string } | null)?._id ??
            "",
    ).trim();

    const [logs, setLogs] = useState<ApplicationActivityLog[]>([]);

    useEffect(() => {
        if (!applicationKey) {
            setLogs([]);
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const response = await axiosGet(`/applications/${applicationKey}/activity-logs`);
                const payload = response.data;
                const rows = (payload?.data ?? payload ?? []) as ApplicationActivityLog[];
                if (!cancelled) setLogs(Array.isArray(rows) ? rows : []);
            } catch (error) {
                console.error("Failed to load sent-to-underwriter activity:", error);
                if (!cancelled) setLogs([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [applicationKey]);

    /** Latest queue change into Underwriter — when the deal was sent. */
    const sentAt = useMemo(() => {
        const matches = logs.filter(isSentToUnderwriterLog);
        if (matches.length === 0) return null;
        return [...matches].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0].createdAt;
    }, [logs]);

    const underwriter = useMemo(() => {
        const record = applicationData as Record<string, unknown> | null;
        if (!record) return null;
        const candidate =
            asUserLite(record.assignedUnderwriter) ??
            asUserLite(record.claimedByUnderwriter) ??
            asUserLite(record.approvedByUnderwriter);
        if (!candidate) return null;
        const name = fullName(candidate) || String(candidate.email ?? "").trim();
        if (!name) return null;
        return { name, email: String(candidate.email ?? "").trim() };
    }, [applicationData]);

    const fallbackSentAt =
        (applicationData as { claimedAt?: string | null } | null)?.claimedAt ?? null;
    const sentOn = sentAt ?? fallbackSentAt;

    /**
     * The detail payload does not embed OfferDecision, so fall back to the
     * offer-decision slice (loaded by the summary card) for the decision stage.
     */
    const decisionSource = useMemo(() => {
        if (!applicationData) return null;
        const record = applicationData as unknown as Application;
        return {
            ...record,
            OfferDecision:
                record.OfferDecision ??
                ((offerDecisionData as Application["OfferDecision"] | null) ?? null),
        } as Application;
    }, [applicationData, offerDecisionData]);

    const decision = useMemo(
        () => (showCurrentDecision ? resolveApplicationCurrentDecision(decisionSource) : null),
        [showCurrentDecision, decisionSource],
    );

    const declineReasons = useMemo(() => {
        if (!decision?.isDecline || !decisionSource) return [] as string[];
        return decision.stage === "scrubber"
            ? resolveRequestDeclineReasonsForDisplay(decisionSource)
            : resolveStatusDeclineReasonsForDisplay(decisionSource);
    }, [decision, decisionSource]);

    if (!underwriter && !sentOn && !decision) return null;

    return (
        <div
            className={`mb-6 overflow-hidden rounded-xl border shadow-sm ${
                isDark ? "border-[#374151] bg-[#141517]" : "border-[#FDFDFD] bg-white"
            }`}
        >
            <h2
                className={`border-b px-4 py-3 text-base font-roboto font-[600] uppercase tracking-wide sm:px-5 ${
                    isDark
                        ? "border-[#374151] bg-[#2A2B2F] text-white"
                        : "border-slate-100 bg-[#F9FAFD] text-[#374151]"
                }`}
            >
                Sent To
            </h2>
            <div
                className={`grid grid-cols-1 gap-4 px-4 py-3.5 sm:px-5 sm:py-4 ${
                    showCurrentDecision ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
                }`}
            >
                <Field label="Name" value={underwriter?.name || "--"} isDark={isDark} />
                <Field label="Email" value={underwriter?.email || "--"} isDark={isDark} />
                <Field
                    label="Sent On"
                    value={sentOn ? formatDateTimeET(sentOn, "--") : "--"}
                    isDark={isDark}
                />
                {showCurrentDecision ? (
                    <div className="flex flex-col gap-1">
                        <span
                            className={`text-xs font-medium uppercase tracking-wide ${
                                isDark ? "text-gray-400" : "text-slate-500"
                            }`}
                        >
                            Current Decision
                        </span>
                        {decision ? (
                            <div className="flex min-w-0 flex-wrap items-start gap-2">
                                <span
                                    title={applicationDecisionStageTitle(decision.stage)}
                                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium uppercase ${applicationDecisionToneClass(decision.tone)}`}
                                >
                                    {decision.label}
                                </span>
                                {decision.isDecline && declineReasons.length > 0 ? (
                                    <span
                                        className={`min-w-0 flex-1 pt-0.5 text-sm font-medium uppercase break-words ${
                                            isDark ? "text-red-300" : "text-red-700"
                                        }`}
                                    >
                                        {declineReasons.join(", ")}
                                    </span>
                                ) : null}
                            </div>
                        ) : (
                            <span
                                className={`text-sm font-medium ${
                                    isDark ? "text-gray-100" : "text-[#374151]"
                                }`}
                            >
                                --
                            </span>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function Field({
    label,
    value,
    isDark,
}: {
    label: string;
    value: string;
    isDark: boolean;
}) {
    return (
        <div className="flex flex-col gap-1">
            <span
                className={`text-xs font-medium uppercase tracking-wide ${
                    isDark ? "text-gray-400" : "text-slate-500"
                }`}
            >
                {label}
            </span>
            <span
                className={`text-sm font-medium break-words ${
                    isDark ? "text-gray-100" : "text-[#374151]"
                }`}
            >
                {value}
            </span>
        </div>
    );
}
