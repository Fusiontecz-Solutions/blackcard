import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/redux/store";
import { getByApplicationIdContract, updateContract } from "@/redux/actions/contractActions";
import { toast } from "react-toastify";
import { EXHIBIT_A_VALUE_COUNT, type BuildContractPrefillFieldsArgs } from "./Contract";
import { companiesFromPrefill, companiesToPrefillPayload } from "./exhibitCompanyPrefill";
import {
    DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY,
    stripDocumentTemplateBlobFromPrefillOverrides,
} from "./documentTemplateMappingPrefill";

function parsePositiveContractId(id: number | string | null | undefined): number | null {
    if (id === null || id === undefined) return null;
    const n = typeof id === "number" ? id : Number(String(id).trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
    return n;
}

export type ExhibitACompaniesSummarySectionProps = {
    contractId: number | string | null;
    applicationUuid?: string | null;
    canEdit: boolean;
    prefillOverridesReady: boolean;
    persistedPrefillOverrides?: Partial<BuildContractPrefillFieldsArgs> | null;
    documentTemplatePrefillByMappingId?: Record<string, Record<string, string>>;
    onPersistedPrefillChange?: (next: Partial<BuildContractPrefillFieldsArgs> | null) => void;
    onPersistedPrefillFullChange?: (full: Record<string, unknown> | null) => void;
    onDraftInvalidate?: () => void;
};

export function ExhibitACompaniesSummarySection({
    contractId,
    applicationUuid,
    canEdit,
    prefillOverridesReady,
    persistedPrefillOverrides,
    documentTemplatePrefillByMappingId = {},
    onPersistedPrefillChange,
    onPersistedPrefillFullChange,
    onDraftInvalidate,
}: ExhibitACompaniesSummarySectionProps) {
    const dispatch = useDispatch<AppDispatch>();
    const [companies, setCompanies] = useState<string[]>([""]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!prefillOverridesReady) return;
        setCompanies(companiesFromPrefill(persistedPrefillOverrides));
    }, [prefillOverridesReady, persistedPrefillOverrides]);

    const updateRow = useCallback((index: number, value: string) => {
        setCompanies((prev) => prev.map((c, i) => (i === index ? value : c)));
    }, []);

    const addRow = useCallback(() => {
        setCompanies((prev) => {
            if (prev.length >= EXHIBIT_A_VALUE_COUNT) return prev;
            return [...prev, ""];
        });
    }, []);

    const removeRow = useCallback((index: number) => {
        setCompanies((prev) => {
            if (prev.length <= 1) return [""];
            return prev.filter((_, i) => i !== index);
        });
    }, []);

    const handleSave = async () => {
        const cid = parsePositiveContractId(contractId);
        if (cid == null) {
            toast.error("Create or open a contract for this application before saving Exhibit A names.");
            return;
        }
        setSaving(true);
        try {
            const base =
                stripDocumentTemplateBlobFromPrefillOverrides(persistedPrefillOverrides) ??
                ({} as Partial<BuildContractPrefillFieldsArgs>);
            const exhibitPayload = companiesToPrefillPayload(companies);
            const contractPrefillOverrides: Record<string, unknown> = {
                ...base,
                ...exhibitPayload,
                [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: documentTemplatePrefillByMappingId,
            };
            const updateRes = await dispatch(
                updateContract({
                    id: cid,
                    data: { contractPrefillOverrides },
                }),
            ).unwrap();
            const updatedContract = (updateRes as { data?: unknown })?.data ?? updateRes;
            const fromUpdate = (updatedContract as { contractPrefillOverrides?: unknown } | null)
                ?.contractPrefillOverrides;
            const fullSaved =
                fromUpdate != null && typeof fromUpdate === "object" && !Array.isArray(fromUpdate)
                    ? (fromUpdate as Record<string, unknown>)
                    : contractPrefillOverrides;
            const mainSaved =
                stripDocumentTemplateBlobFromPrefillOverrides(fullSaved) ??
                ({ ...base, ...exhibitPayload } as Partial<BuildContractPrefillFieldsArgs>);
            onPersistedPrefillChange?.(mainSaved);
            onPersistedPrefillFullChange?.(fullSaved);
            onDraftInvalidate?.();
            setCompanies(companiesFromPrefill(mainSaved));
            const appKey = String(applicationUuid ?? "").trim();
            if (appKey) {
                try {
                    await dispatch(getByApplicationIdContract(appKey)).unwrap();
                } catch {
                    /* parent keeps local snapshot */
                }
            }
            toast.success("Exhibit A company names saved.");
        } catch (e: unknown) {
            const msg =
                typeof e === "string"
                    ? e
                    : String((e as { message?: string })?.message ?? "Failed to save Exhibit A names.");
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!prefillOverridesReady) {
        return (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic py-1">
                Loading contract prefill…
            </p>
        );
    }

    const atMax = companies.length >= EXHIBIT_A_VALUE_COUNT;

    return (
        <div className="space-y-3">
            <div>
                <span className="text-blue-600 font-bold text-[11px] uppercase">
                    Exhibit A — company names
                </span>
                <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    Add up to {EXHIBIT_A_VALUE_COUNT} companies.
                </p>
            </div>

            <div className="space-y-2">
                {companies.map((name, index) => (
                    <div key={`exhibit-row-${index}`} className="flex items-end gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                            <Label
                                htmlFor={`summary-exhibit-${index}`}
                                className="text-xs text-slate-600 dark:text-slate-400"
                            >
                                Company {index + 1}
                            </Label>
                            <Input
                                id={`summary-exhibit-${index}`}
                                className="h-8 text-sm"
                                value={name}
                                onChange={(e) => updateRow(index, e.target.value)}
                                disabled={!canEdit || saving}
                                placeholder="Company legal name"
                            />
                        </div>
                        {canEdit && companies.length > 1 ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-600"
                                onClick={() => removeRow(index)}
                                disabled={saving}
                                aria-label={`Remove company ${index + 1}`}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        ) : (
                            <div className="h-8 w-8 shrink-0" aria-hidden />
                        )}
                    </div>
                ))}
            </div>

            {canEdit ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={addRow}
                    disabled={saving || atMax}
                    title={atMax ? `Maximum ${EXHIBIT_A_VALUE_COUNT} companies` : "Add company"}
                >
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Add company
                </Button>
            ) : null}

            {canEdit ? (
                <div className="flex justify-end pt-1">
                    <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        onClick={() => void handleSave()}
                        disabled={saving || parsePositiveContractId(contractId) == null}
                    >
                        {saving ? (
                            <>
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                                Saving…
                            </>
                        ) : (
                            "Save Exhibit A names"
                        )}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
