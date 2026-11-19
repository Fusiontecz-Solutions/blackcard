import type { AchAuthorizationDocuSignCapsuleStatus } from "./achAuthorizationDocuSign";
import { formatAchAuthorizationCapsuleLabel } from "./achAuthorizationDocuSign";

export type AchSigningStepperState = {
    activeIndex: number;
    statusLabel: string;
    badgeClassName: string;
    isTerminal: boolean;
    terminalMessage?: string;
};

export function resolveAchSigningStepperState(
    status: AchAuthorizationDocuSignCapsuleStatus,
    hasEnvelope: boolean,
): AchSigningStepperState {
    if (!hasEnvelope) {
        return {
            activeIndex: -1,
            statusLabel: "Not sent",
            badgeClassName: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
            isTerminal: false,
        };
    }

    if (status === "VOIDED") {
        return {
            activeIndex: -1,
            statusLabel: "Voided",
            badgeClassName: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
            isTerminal: true,
            terminalMessage: "Signing flow ended with status: Voided.",
        };
    }

    if (status === "DRAFT") {
        return {
            activeIndex: -1,
            statusLabel: "Draft",
            badgeClassName: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
            isTerminal: false,
        };
    }

    const rank: Record<AchAuthorizationDocuSignCapsuleStatus, number> = {
        DRAFT: -1,
        SENT: 0,
        VIEWED: 1,
        SIGNED: 3,
        VOIDED: -1,
    };

    const badgeByStatus: Record<AchAuthorizationDocuSignCapsuleStatus, string> = {
        DRAFT: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
        SENT: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
        VIEWED: "bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-100",
        SIGNED: "bg-[var(--brand)]/12 text-[var(--brand)]",
        VOIDED: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    };

    const label =
        status === "SIGNED" ? "Completed" : formatAchAuthorizationCapsuleLabel(status);

    return {
        activeIndex: rank[status] ?? -1,
        statusLabel: label,
        badgeClassName: badgeByStatus[status],
        isTerminal: false,
    };
}
