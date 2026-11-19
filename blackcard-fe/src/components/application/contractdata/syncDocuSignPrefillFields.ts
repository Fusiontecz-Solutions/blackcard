import { axiosPatch } from "@/redux/axios";
import { formatDate } from "@/lib/utils";
import { toast } from "react-toastify";
import type { BuildContractPrefillFieldsArgs } from "./Contract";
import {
    applyDocumentTemplateMappingPrefillOverrides,
    DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY,
    stripDocumentTemplateBlobFromPrefillOverrides,
} from "./documentTemplateMappingPrefill";
import { DOCUSIGN_ADDENDUM_LAYOUT_KEYS } from "./docusignAddendumTemplates";

export type DocuSignPrefillField = { id: string; value: string };

export type DocuSignPrefillSnapshot = {
    mainPrefillOverrides?: Partial<BuildContractPrefillFieldsArgs> | null;
    documentTemplatePrefillByMappingId?: Record<string, Record<string, string>>;
};

export type DocuSignPrefillSyncResult = {
    applied?: number;
    attempted?: number;
};

export async function patchDocuSignPrefillFields(
    envelopeId: string,
    fields: DocuSignPrefillField[],
): Promise<DocuSignPrefillSyncResult | null> {
    const eid = String(envelopeId ?? "").trim();
    if (!eid || !fields.length) return null;
    const response = await axiosPatch("/docusign/prefill-fields", {
        documentId: eid,
        fields,
    });
    const payload = (response as { data?: DocuSignPrefillSyncResult })?.data ?? response;
    return payload && typeof payload === "object"
        ? (payload as DocuSignPrefillSyncResult)
        : null;
}

/** ACH-only draft envelope — skip when already sent/signed/voided. */
export function resolveAchDraftEnvelopeIdForSync(args: {
    achCapsuleStatus?: string | null;
    achEnvelopeId?: string | null;
    sessionEnvelopeId?: string | null;
    mainContractEnvelopeId?: string | null;
}): string | null {
    const status = String(args.achCapsuleStatus ?? "DRAFT").trim().toUpperCase();
    if (status && status !== "DRAFT") return null;
    const fromDb = String(args.achEnvelopeId ?? "").trim();
    const session = String(args.sessionEnvelopeId ?? "").trim();
    const main = String(args.mainContractEnvelopeId ?? "").trim();
    const id = session || fromDb;
    if (!id || (main && id === main)) return null;
    return id;
}

export function buildAchDocuSignPrefillFieldsPayload(args: {
    contract: Record<string, unknown> | null;
    application: Record<string, unknown> | null;
    linkedAchMapping: {
        id: string;
        documentType?: string | null;
        template?: {
            id?: string;
            layoutKey?: string | null;
            templateId?: string;
            name?: string | null;
        } | null;
    } | null;
    contractPrefillOverridesRaw: unknown;
    achLayoutKey: string;
    /** Fresh mapping blob when state has not re-rendered yet. */
    documentTemplatePrefillByMappingId?: Record<string, Record<string, string>>;
}): DocuSignPrefillField[] {
    const mappingBlob =
        args.documentTemplatePrefillByMappingId ??
        (() => {
            const raw = args.contractPrefillOverridesRaw;
            if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
            const blob = (raw as Record<string, unknown>)[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
            if (blob == null || typeof blob !== "object" || Array.isArray(blob)) return {};
            const out: Record<string, Record<string, string>> = {};
            for (const [mappingId, row] of Object.entries(blob)) {
                if (!row || typeof row !== "object" || Array.isArray(row)) continue;
                const inner: Record<string, string> = {};
                for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
                    inner[k] = String(v ?? "");
                }
                out[mappingId] = inner;
            }
            return out;
        })();

    const mainPrefill = stripDocumentTemplateBlobFromPrefillOverrides(
        (args.contractPrefillOverridesRaw ?? null) as Record<string, unknown> | null,
    );
    const contractPrefillOverridesRaw = {
        ...(mainPrefill ?? {}),
        [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: mappingBlob,
    };
    const mappingRows = args.linkedAchMapping ? [args.linkedAchMapping] : [];
    const mergedLayoutKeys = [
        ...new Set(
            [
                args.achLayoutKey,
                DOCUSIGN_ADDENDUM_LAYOUT_KEYS.ACH_AUTHORIZATION_STANDALONE,
                DOCUSIGN_ADDENDUM_LAYOUT_KEYS.ACH_AUTHORIZATION,
            ]
                .map((k) => String(k ?? "").trim())
                .filter(Boolean),
        ),
    ];

    return applyDocumentTemplateMappingPrefillOverrides({
        prefillFieldsPayload: [],
        mergedTemplateIds: [],
        mergedLayoutKeys,
        templateMappingRows: mappingRows,
        contractPrefillOverridesRaw,
        contract: args.contract,
        application: args.application,
        agreementDate: formatDate(new Date()),
        mainPrefillOverrides: mainPrefill as Partial<BuildContractPrefillFieldsArgs> | null,
    })
        .map((field) => ({
            id: field.id,
            value: String(field.value ?? "").trim(),
        }))
        .filter((field) => field.id && field.value);
}

export function docuSignPrefillSyncToast(
    result: DocuSignPrefillSyncResult | null,
    options?: { hasDraftEnvelope?: boolean },
): void {
    if (!options?.hasDraftEnvelope) return;
    const applied = Number(result?.applied ?? 0);
    const attempted = Number(result?.attempted ?? 0);
    if (applied > 0) {
        toast.success(
            `DocuSign draft updated (${applied} data label${applied === 1 ? "" : "s"}).`,
        );
        return;
    }
    if (attempted > 0) {
        toast.warning(
            "Prefill saved in CRM, but no matching DocuSign data labels were found on this draft.",
        );
    }
}
