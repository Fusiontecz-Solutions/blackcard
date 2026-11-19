import type { AppDispatch } from "@/redux/store";
import { updateContract } from "@/redux/actions/contractActions";
import {
    isDefaultContractCcEmail,
    mergeContractPrefillWithCcEmails,
} from "./boldsignCcList";
import {
    mergeContractPrefillWithSignerOverrides,
    type ContractSignerOverrideRow,
} from "./contractdata/templateRecipients";

export function userCcEmailsFromMergedList(merged: string[]): string[] {
    return [
        ...new Set(
            merged
                .map((e) => String(e ?? "").trim())
                .filter(Boolean)
                .filter((e) => !isDefaultContractCcEmail(e)),
        ),
    ];
}

function resolvePrefillBase(raw: unknown): Record<string, unknown> {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
        return { ...(raw as Record<string, unknown>) };
    }
    return {};
}

/** Persist user-added CC emails on the contract (shared across CRM users). */
export async function persistContractCcEmails(
    dispatch: AppDispatch,
    contractId: number,
    mergedCcEmails: string[],
    contractPrefillOverrides: unknown,
): Promise<Record<string, unknown>> {
    const userOnly = userCcEmailsFromMergedList(mergedCcEmails);
    const nextPrefill = mergeContractPrefillWithCcEmails(
        contractPrefillOverrides,
        userOnly,
    );
    const updated = await dispatch(
        updateContract({
            id: contractId,
            data: { contractPrefillOverrides: nextPrefill },
        }),
    ).unwrap();
    const payload = (updated as { data?: unknown })?.data ?? updated;
    const fromPayload = (payload as { contractPrefillOverrides?: unknown } | null)
        ?.contractPrefillOverrides;
    return (
        (fromPayload != null && typeof fromPayload === "object"
            ? (fromPayload as Record<string, unknown>)
            : nextPrefill) ?? nextPrefill
    );
}

/** Persist CC list and optional signer overrides before send (visible to all users). */
export async function persistContractSendRecipients(
    dispatch: AppDispatch,
    contractId: number,
    options: {
        mergedCcEmails: string[];
        contractPrefillOverrides: unknown;
        signerRows?: ContractSignerOverrideRow[];
        primarySignerEmail?: string | null;
        primarySignerName?: string | null;
    },
): Promise<Record<string, unknown>> {
    let nextPrefill = mergeContractPrefillWithCcEmails(
        options.contractPrefillOverrides,
        userCcEmailsFromMergedList(options.mergedCcEmails),
    );
    if (options.signerRows?.length) {
        nextPrefill = mergeContractPrefillWithSignerOverrides(
            nextPrefill,
            options.signerRows,
        );
    }
    const updateData: {
        contractPrefillOverrides: Record<string, unknown>;
        clientEmail?: string;
        clientName?: string;
    } = { contractPrefillOverrides: nextPrefill };
    const primaryEmail = String(options.primarySignerEmail ?? "").trim();
    const primaryName = String(options.primarySignerName ?? "").trim();
    if (primaryEmail) updateData.clientEmail = primaryEmail;
    if (primaryName) updateData.clientName = primaryName;

    const updated = await dispatch(
        updateContract({
            id: contractId,
            data: updateData,
        }),
    ).unwrap();
    const payload = (updated as { data?: unknown })?.data ?? updated;
    const fromPayload = (payload as { contractPrefillOverrides?: unknown } | null)
        ?.contractPrefillOverrides;
    return (
        (fromPayload != null && typeof fromPayload === "object"
            ? (fromPayload as Record<string, unknown>)
            : nextPrefill) ?? nextPrefill
    );
}

export function readContractPrefillOverrides(
    resolvedContract: unknown,
    contractPrefillFromDb: unknown,
): unknown {
    const fromContract = (resolvedContract as { contractPrefillOverrides?: unknown } | null)
        ?.contractPrefillOverrides;
    return fromContract ?? contractPrefillFromDb ?? resolvePrefillBase(null);
}
