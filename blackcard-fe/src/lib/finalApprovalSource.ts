export const FINAL_APPROVAL_SOURCE_DECISION_LOGIC = "Decision Logic" as const;
export const FINAL_APPROVAL_SOURCE_FUNDING_CALL = "Funding Call" as const;

export type FinalApprovalSource =
    | typeof FINAL_APPROVAL_SOURCE_DECISION_LOGIC
    | typeof FINAL_APPROVAL_SOURCE_FUNDING_CALL;

const FINAL_APPROVAL_SOURCE_VALUES: FinalApprovalSource[] = [
    FINAL_APPROVAL_SOURCE_DECISION_LOGIC,
    FINAL_APPROVAL_SOURCE_FUNDING_CALL,
];

export function isFinalApprovalSource(value: unknown): value is FinalApprovalSource {
    return (
        typeof value === "string" &&
        FINAL_APPROVAL_SOURCE_VALUES.includes(value as FinalApprovalSource)
    );
}

export function formatFinalApprovalSourceLabel(
    source: FinalApprovalSource | string | null | undefined,
): string | null {
    if (source === FINAL_APPROVAL_SOURCE_DECISION_LOGIC) {
        return "Decision Logic";
    }
    if (source === FINAL_APPROVAL_SOURCE_FUNDING_CALL) {
        return "Funding Call";
    }
    return null;
}
