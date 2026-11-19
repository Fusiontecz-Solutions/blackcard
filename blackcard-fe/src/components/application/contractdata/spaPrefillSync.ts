import type { BuildContractPrefillFieldsArgs } from "./Contract";
import { stripDocumentTemplateBlobFromPrefillOverrides } from "./documentTemplateMappingPrefill";
import { updateContract } from "@/redux/actions/contractActions";
import type { AppDispatch } from "@/redux/store";

export function parsePositiveContractId(id: number | string | null | undefined): number | null {
    if (id == null || id === "") return null;
    const n = typeof id === "number" ? id : Number.parseInt(String(id), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export async function persistCalculatedPurchasePercent(args: {
    dispatch: AppDispatch;
    contractId: number | string | null | undefined;
    spa: string;
    persistedPrefillOverrides?: Partial<BuildContractPrefillFieldsArgs> | Record<string, unknown> | null;
    additionalContractPrefillJson?: Record<string, unknown> | null;
}): Promise<{
    saved: boolean;
    mainSaved: Partial<BuildContractPrefillFieldsArgs> | null;
    fullSaved: Record<string, unknown> | null;
}> {
    const cid = parsePositiveContractId(args.contractId);
    if (cid == null) {
        return { saved: false, mainSaved: null, fullSaved: null };
    }

    const priorOverrides: Record<string, unknown> = {
        ...(args.persistedPrefillOverrides != null &&
        typeof args.persistedPrefillOverrides === "object" &&
        !Array.isArray(args.persistedPrefillOverrides)
            ? (args.persistedPrefillOverrides as Record<string, unknown>)
            : {}),
        ...(args.additionalContractPrefillJson != null &&
        typeof args.additionalContractPrefillJson === "object" &&
        !Array.isArray(args.additionalContractPrefillJson)
            ? args.additionalContractPrefillJson
            : {}),
    };
    delete priorOverrides._manualPurchasePercent;
    priorOverrides.purchasePercent = args.spa;

    const updateRes = await args
        .dispatch(
            updateContract({
                id: cid,
                data: {
                    contractPrefillOverrides: priorOverrides,
                    purchasePercent: args.spa,
                },
            }),
        )
        .unwrap();

    const updatedContract = (updateRes as { data?: unknown })?.data ?? updateRes;
    const fromUpdate = (updatedContract as { contractPrefillOverrides?: unknown } | null)
        ?.contractPrefillOverrides;
    const fullSaved =
        fromUpdate != null && typeof fromUpdate === "object" && !Array.isArray(fromUpdate)
            ? (fromUpdate as Record<string, unknown>)
            : priorOverrides;
    if (fullSaved._manualPurchasePercent != null) {
        delete fullSaved._manualPurchasePercent;
    }
    const mainSaved =
        stripDocumentTemplateBlobFromPrefillOverrides(fullSaved) ??
        ({ purchasePercent: args.spa } as Partial<BuildContractPrefillFieldsArgs>);

    return { saved: true, mainSaved, fullSaved };
}
