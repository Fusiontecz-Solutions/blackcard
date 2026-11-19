import type { AppDispatch } from "@/redux/store";
import { updateApplication } from "@/redux/actions/applicationActions";
import { updateContract } from "@/redux/actions/contractActions";
import { formatCurrencyFull, parseNumberUS } from "@/lib/utils";
import type { BuildContractPrefillFieldsArgs } from "./contractdata/Contract";
import {
    deriveOfferFeesDollarsForNetToMerchant,
    formatNetToMerchantPrefillValue,
    formatOfferDecisionFeesDollarsForPrefill,
    normalizeContractPrefillOverrides,
} from "./contractdata/Contract";
import { syncContractPrefillToSourceRecords } from "./contractdata/contractPrefillSourceSync";

export const CONTRACT_VALUES_SECTION = "CONTRACT_VALUES";

/** When set on `contractPrefillOverrides`, live-offer sync must not overwrite `netToMerchant`. */
export const MANUAL_NET_TO_MERCHANT_KEY = "_manualNetToMerchant";

type PersistedContractValues = {
    amountFinancedInput?: string;
    recipientFundsInput?: string;
    financeChargeInput?: string;
    estimatedTotalPaymentInput?: string;
    paymentTotalInput?: string;
    estimatedMonthlyCostInput?: string;
    estimatedPaymentInput?: string;
    frequencyInput?: string;
    numberOfPaymentsInput?: string;
    termLengthInput?: string;
};

const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function resolvePrefillBase(raw: unknown): Record<string, unknown> {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
        return { ...(raw as Record<string, unknown>) };
    }
    return {};
}

export function parseRecipientFundsInputDollars(input: string | null | undefined): number | undefined {
    const raw = String(input ?? "").trim().replace(/^\$\s*/, "");
    if (!raw) return undefined;
    const n = parseNumberUS(raw);
    return Number.isFinite(n) ? n : undefined;
}

export function formatRecipientFundsInputFromDollars(dollars: number): string {
    return formatCurrencyFull(dollars);
}

export function readNetToMerchantDollarsFromContract(
    contract: unknown,
): number | undefined {
    const record =
        contract != null && typeof contract === "object"
            ? (contract as Record<string, unknown>)
            : null;
    const prefill = normalizeContractPrefillOverrides(record?.contractPrefillOverrides);
    const raw = prefill?.netToMerchant;
    if (raw == null || String(raw).trim() === "") return undefined;
    return parseRecipientFundsInputDollars(String(raw));
}

export function readNetToMerchantPrefillFromContract(
    contract: unknown,
): string | null {
    const record =
        contract != null && typeof contract === "object"
            ? (contract as Record<string, unknown>)
            : null;
    const prefill = normalizeContractPrefillOverrides(record?.contractPrefillOverrides);
    const raw = String(prefill?.netToMerchant ?? "").trim();
    return raw || null;
}

export function parseContractValuesFromApplicationNote(note: string): PersistedContractValues | null {
    if (!note?.trim()) return null;
    const sectionPattern = new RegExp(
        `\\[${escapeRegExp(CONTRACT_VALUES_SECTION)}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\n\\[[^\\]]+\\]\\s*\\n|$)`,
        "g",
    );
    let match: RegExpExecArray | null = null;
    let lastPayload = "";
    while ((match = sectionPattern.exec(note)) !== null) {
        lastPayload = String(match[1] || "").trim();
    }
    if (!lastPayload) return null;
    try {
        return JSON.parse(lastPayload) as PersistedContractValues;
    } catch {
        return null;
    }
}

function upsertContractValuesInApplicationNote(
    existingNote: string,
    payload: PersistedContractValues,
): string {
    const serialized = JSON.stringify(payload);
    const blockRegex = new RegExp(
        `(?:\\n\\n)?\\[${escapeRegExp(CONTRACT_VALUES_SECTION)}\\]\\s*\\n[\\s\\S]*?(?=(?:\\n\\n\\[[^\\]]+\\]\\s*\\n)|$)`,
        "g",
    );
    const stripped = String(existingNote || "").replace(blockRegex, "").trim();
    const nextBlock = `[${CONTRACT_VALUES_SECTION}]\n${serialized}`;
    return stripped ? `${stripped}\n\n${nextBlock}` : nextBlock;
}

/** Contract tab → prefill: persist Recipient Funds as `netToMerchant` on the contract. */
export async function persistContractNetToMerchantFromRecipientFunds(
    dispatch: AppDispatch,
    contractId: number,
    recipientFundsInput: string,
    contractPrefillOverrides: unknown,
    options?: {
        applicationData?: unknown;
        offerDecision?: Record<string, unknown> | null;
    },
): Promise<Record<string, unknown>> {
    const dollars = parseRecipientFundsInputDollars(recipientFundsInput);
    if (dollars === undefined) {
        return resolvePrefillBase(contractPrefillOverrides);
    }

    const base = resolvePrefillBase(contractPrefillOverrides);
    const sources = {
        application: options?.applicationData as Record<string, unknown> | undefined,
        offerDecision: options?.offerDecision ?? null,
        prefill: base as Partial<BuildContractPrefillFieldsArgs>,
    };
    const feesDollars = deriveOfferFeesDollarsForNetToMerchant(sources, dollars);

    const nextPrefill: Record<string, unknown> = {
        ...base,
        netToMerchant: formatNetToMerchantPrefillValue(dollars),
        [MANUAL_NET_TO_MERCHANT_KEY]: true,
    };
    if (feesDollars !== undefined) {
        nextPrefill.appendixUnderwritingFees =
            formatOfferDecisionFeesDollarsForPrefill(feesDollars);
    }

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

/** Push `netToMerchant` / derived fees to Live Offer (`OfferDecision`). */
export async function syncLiveOfferFromNetToMerchantPrefill(args: {
    dispatch: AppDispatch;
    applicationData: unknown;
    applicationUuid: string | null;
    offerDecision: Record<string, unknown> | null;
    contractPrefillOverrides: unknown;
    contract?: Record<string, unknown> | null;
}): Promise<void> {
    const prefill = normalizeContractPrefillOverrides(args.contractPrefillOverrides);
    if (!String(prefill?.netToMerchant ?? "").trim()) return;

    await syncContractPrefillToSourceRecords({
        dispatch: args.dispatch,
        applicationData: args.applicationData,
        applicationUuid: args.applicationUuid,
        prefill: prefill ?? {},
        offerDecision: args.offerDecision,
        contract: args.contract ?? null,
    });
}

/** Prefill → Contract tab note: keep `[CONTRACT_VALUES].recipientFundsInput` in sync. */
export async function syncApplicationNoteRecipientFundsFromNetToMerchant(
    dispatch: AppDispatch,
    applicationUuid: string,
    applicationNote: string,
    netToMerchantRaw: string | null | undefined,
): Promise<void> {
    const raw = String(netToMerchantRaw ?? "").trim();
    if (!raw) return;

    const dollars = parseRecipientFundsInputDollars(raw);
    if (dollars === undefined) return;

    const existing = parseContractValuesFromApplicationNote(applicationNote);
    const recipientFundsInput = formatRecipientFundsInputFromDollars(dollars);
    const nextValues: PersistedContractValues = {
        ...(existing ?? {}),
        recipientFundsInput,
    };
    const note = upsertContractValuesInApplicationNote(applicationNote, nextValues);
    await dispatch(
        updateApplication({
            id: String(applicationUuid),
            data: { note },
        }),
    ).unwrap();
}
