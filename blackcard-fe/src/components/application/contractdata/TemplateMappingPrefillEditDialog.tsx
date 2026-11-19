import { toPrefillUppercase } from "./prefillUppercase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsCurrencyInput, isUsCurrencyEditField } from "@/components/ui/us-currency-input";
import type { AppDispatch } from "@/redux/store";
import {
    getByApplicationIdContract,
    getAllACH,
    updateACH,
    updateContract,
} from "@/redux/actions/contractActions";
import { toast } from "react-toastify";
import type {
    BuildContractPrefillFieldsArgs,
    ContractPrefillContractRecords,
} from "./Contract";
import {
    CONTRACT_PREFILL_COLUMN_SYNC_KEYS,
    stripStaleOfferOverridesFromPersisted,
} from "./Contract";
import {
    ACH_PREFILL_MAPPING_ALIAS_KEY,
    achCamelPartialToAchRecordPatch,
    achTabValuesToCamelPartial,
    resolveAchSavedMappingOverrides,
} from "./achFormEditConfig";
import {
    DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY,
    DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY,
    parseDocumentTemplateEnvelopeByMappingId,
    parseDocumentTemplatePrefillByMappingId,
    getDocumentTemplatePrefillFieldRowsForEditor,
    usesCoordinateLayoutTemplate,
} from "./documentTemplateMappingPrefill";
import { stripAchAuthorizationKeysFromRecord } from "./documentPrefillScope";

export type TemplateMappingPrefillEditRow = {
    id: string;
    contractId: number;
    templateId: string;
    documentType: string;
    template?: {
        id?: string;
        name?: string | null;
        type?: string;
        layoutKey?: string | null;
        state?: string | null;
        frequency?: string | null;
        templateId?: string;
        pdfUrl?: string | null;
    } | null;
};

type TemplateMappingPrefillEditDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    row: TemplateMappingPrefillEditRow | null;
    /** CRM `Contract.id`. */
    contractId: number | null;
    applicationUuid?: string | null;
    applicationData: unknown;
    resolvedContract: Record<string, unknown> | null;
    contractRecords?: ContractPrefillContractRecords;
    /** Agreement / disclosure date default (e.g. today). */
    agreementDate: string;
    /** Full map: mapping row id → BoldSign field id → value. */
    documentTemplatePrefillByMappingId: Record<string, Record<string, string>>;
    /** Main contract prefill overrides (without document mapping blob); merged on save. */
    mainPrefillOverrides: Partial<BuildContractPrefillFieldsArgs> | null;
    /** Live Offer Decision — drives funding / payback on addendum + disclosure editors. */
    offerDecision?: Record<string, unknown> | null;
    /**
     * Optional title suffix (e.g. selected funder name for ACH).
     * When set, replaces the template name in the dialog title.
     */
    titleSuffix?: string | null;
    /** Pass false when the contract has more than one ACH form. */
    allowAchAliasFallback?: boolean;
    /** After a successful save, parent refreshes contract + mapping list. */
    onSaved: (savedTabValues?: Record<string, string>) => void;
};

export function TemplateMappingPrefillEditDialog({
    open,
    onOpenChange,
    row,
    contractId,
    applicationUuid = null,
    applicationData,
    resolvedContract,
    contractRecords,
    agreementDate,
    documentTemplatePrefillByMappingId,
    mainPrefillOverrides,
    offerDecision = null,
    titleSuffix = null,
    allowAchAliasFallback = true,
    onSaved,
}: TemplateMappingPrefillEditDialogProps) {
    const dispatch = useDispatch<AppDispatch>();
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    /** Only hydrate once per open/row — contract status polls must not wipe in-progress edits. */
    const hydratedSessionKeyRef = useRef<string | null>(null);

    const coordinateLayout = usesCoordinateLayoutTemplate(row);

    const effectiveMainPrefillOverrides = useMemo(
        () =>
            stripStaleOfferOverridesFromPersisted(
                mainPrefillOverrides,
                offerDecision,
                applicationData,
                resolvedContract,
            ),
        [mainPrefillOverrides, offerDecision, applicationData, resolvedContract],
    );

    const editorRows = useMemo(() => {
        if (!row) return [];
        const saved = coordinateLayout
            ? resolveAchSavedMappingOverrides(documentTemplatePrefillByMappingId, row.id, {
                  allowAliasFallback: allowAchAliasFallback,
              })
            : (documentTemplatePrefillByMappingId[row.id] ?? {});
        return getDocumentTemplatePrefillFieldRowsForEditor({
            templateId: row.template?.templateId ?? null,
            templateName: row.template?.name ?? null,
            templateType: row.template?.type ?? row.documentType ?? null,
            templateLayoutKey: row.template?.layoutKey ?? null,
            templateState: row.template?.state ?? null,
            templateFrequency: row.template?.frequency ?? null,
            fallbackState:
                String((resolvedContract as { state?: unknown } | null)?.state ?? "").trim() || null,
            fallbackFrequency:
                String(
                    (resolvedContract as { disclosureFrequency?: unknown } | null)
                        ?.disclosureFrequency ?? "",
                ).trim() || null,
            documentType: row.documentType ?? null,
            contract: resolvedContract,
            application: applicationData as Record<string, unknown> | null,
            offerDecision,
            contractRecords,
            agreementDate,
            mainPrefillOverrides: effectiveMainPrefillOverrides ?? undefined,
            savedOverridesForMapping: saved,
            bankDetail: contractRecords?.bankDetail ?? null,
        });
    }, [
        row,
        coordinateLayout,
        documentTemplatePrefillByMappingId,
        resolvedContract,
        applicationData,
        offerDecision,
        contractRecords,
        agreementDate,
        effectiveMainPrefillOverrides,
        allowAchAliasFallback,
    ]);

    useEffect(() => {
        if (!open || !row) {
            hydratedSessionKeyRef.current = null;
            return;
        }
        const sessionKey = String(row.id);
        if (hydratedSessionKeyRef.current === sessionKey) return;
        if (editorRows.length === 0) return;
        hydratedSessionKeyRef.current = sessionKey;
        setFieldValues(Object.fromEntries(editorRows.map((r) => [r.id, r.value ?? ""])));
    }, [open, row?.id, editorRows]);

    const handleSave = useCallback(async () => {
        const cid = contractId != null && Number.isFinite(Number(contractId)) ? Number(contractId) : null;
        if (cid == null || !row?.id) {
            toast.error("Missing contract or mapping row.");
            return;
        }
        setSaving(true);
        try {
            const rawOverrides =
                resolvedContract?.contractPrefillOverrides &&
                typeof resolvedContract.contractPrefillOverrides === "object" &&
                !Array.isArray(resolvedContract.contractPrefillOverrides)
                    ? {
                          ...(resolvedContract.contractPrefillOverrides as Record<
                              string,
                              unknown
                          >),
                      }
                    : {};

            const existingBlob = parseDocumentTemplatePrefillByMappingId(rawOverrides);
            const envelopeBlob = parseDocumentTemplateEnvelopeByMappingId(rawOverrides);

            const tabValues = { ...fieldValues };
            // Balance Transfer Remaining RTR must map to its own DocuSign data label —
            // never seed from purchase_price / payback.
            const remainingBalance = String(
                tabValues.balance_transfer_remaining_rtr_balance ??
                    tabValues.remaining_rtr_balance ??
                    "",
            ).trim();
            if (remainingBalance) {
                const layoutKey = String(row.template?.layoutKey ?? "").trim().toLowerCase();
                const templateName = String(row.template?.name ?? "").toLowerCase();
                const isBalanceTransfer =
                    layoutKey === "balance_transfer" ||
                    layoutKey.endsWith("_balance_transfer") ||
                    templateName.includes("balance transfer");
                if (isBalanceTransfer) {
                    tabValues.balance_transfer_remaining_rtr_balance = remainingBalance;
                    tabValues.remaining_rtr_balance = remainingBalance;
                    delete tabValues.purchase_price;
                    delete tabValues.balance_transfer_purchase_price;
                }
            }
            let nextBlob: Record<string, Record<string, string>> = {
                ...existingBlob,
                ...documentTemplatePrefillByMappingId,
                [row.id]: tabValues,
            };

            const achCamel = coordinateLayout ? achTabValuesToCamelPartial(tabValues) : null;
            if (coordinateLayout && achCamel && allowAchAliasFallback) {
                // Survive synthetic → real mapping id swaps. Skipped with several ACH
                // forms, where the alias would just hold the last edited form.
                nextBlob = {
                    ...nextBlob,
                    [ACH_PREFILL_MAPPING_ALIAS_KEY]: tabValues,
                };
            }

            const mainBase = { ...rawOverrides } as Record<string, unknown>;
            delete mainBase[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
            delete mainBase[DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY];
            const main = coordinateLayout
                ? stripAchAuthorizationKeysFromRecord(mainBase)
                : mainBase;

            const contractPrefillOverrides: Record<string, unknown> = {
                ...main,
                [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: nextBlob,
                ...(Object.keys(envelopeBlob).length
                    ? { [DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY]: envelopeBlob }
                    : {}),
            };

            const columnSync: Record<string, string> = {};
            // ACH form values live only in per-mapping blob — never write shared
            // authorization* / ACH columns (those merge across forms + overwrite Client).
            if (achCamel && !coordinateLayout) {
                for (const key of CONTRACT_PREFILL_COLUMN_SYNC_KEYS) {
                    if (!(key in achCamel)) continue;
                    columnSync[key] = String(achCamel[key] ?? "");
                }
            }

            await dispatch(
                updateContract({
                    id: cid,
                    data: {
                        contractPrefillOverrides,
                        ...columnSync,
                    },
                }),
            ).unwrap();

            // Persist ACH form fields onto the contract ACH row so Info Required
            // and later reloads match what was saved on this form.
            if (coordinateLayout && achCamel) {
                const achId = Number(
                    (contractRecords?.ach as { id?: unknown } | null | undefined)?.id,
                );
                if (Number.isFinite(achId) && achId > 0) {
                    const achPatch = achCamelPartialToAchRecordPatch(achCamel);
                    const hasAchData = Object.values(achPatch).some(Boolean);
                    if (hasAchData) {
                        try {
                            await dispatch(
                                updateACH({ id: achId, data: achPatch }),
                            ).unwrap();
                            await dispatch(getAllACH({ contractId: cid })).unwrap();
                        } catch (achErr) {
                            console.warn("[ACH] Failed to sync Info Required ACH row:", achErr);
                        }
                    }
                }
            }

            const appKey = String(applicationUuid ?? "").trim();
            if (appKey) {
                try {
                    await dispatch(getByApplicationIdContract(appKey)).unwrap();
                } catch {
                    /* ignore */
                }
            }

            toast.success(
                coordinateLayout
                    ? "ACH form field values saved."
                    : "Template mapping and DocuSign field overrides saved.",
            );
            onSaved(coordinateLayout ? tabValues : undefined);
            onOpenChange(false);
        } catch (e: unknown) {
            console.error(e);
            const msg =
                e && typeof e === "object" && "message" in e
                    ? String((e as { message?: string }).message)
                    : "Failed to save.";
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    }, [
        contractId,
        row,
        coordinateLayout,
        fieldValues,
        documentTemplatePrefillByMappingId,
        resolvedContract,
        contractRecords,
        dispatch,
        applicationUuid,
        onSaved,
        onOpenChange,
    ]);

    const overrideTitle = String(titleSuffix ?? "").trim();
    const titleName = overrideTitle
        ? overrideTitle
        : row?.template?.name?.trim()
          ? row.template.name
          : coordinateLayout
            ? "ACH authorization"
            : row?.template?.templateId || "DocuSign template";

    const dialogTitle = coordinateLayout
        ? `Edit ACH form — ${titleName}`
        : `Edit template mapping — ${titleName}`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex max-h-[90vh] w-[min(100vw-2rem,960px)] flex-col gap-0 p-0 sm:max-w-[960px]"
                onOpenAutoFocus={(e: any) => e.preventDefault()}
            >
                <DialogHeader className="shrink-0 border-b px-6 py-4">
                    <DialogTitle className="text-base">{dialogTitle}</DialogTitle>
                    {!coordinateLayout ? (
                        <p className="text-muted-foreground text-sm font-normal leading-snug">
                            Adjust field values used when prefilling this document. Values are saved on the
                            contract.
                        </p>
                    ) : null}
                </DialogHeader>
                <div className="max-h-[min(65vh,520px)] overflow-y-auto px-6 py-4">
                    <div className="space-y-4">
                        {editorRows.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No registered field map for this template. For state disclosures, set
                                BoldSignTemplate{" "}
                                <span className="font-mono text-xs">type=disclosure</span> with{" "}
                                <span className="font-mono text-xs">state</span> (e.g.{" "}
                                <span className="font-mono text-xs">florida</span>) and{" "}
                                <span className="font-mono text-xs">frequency</span> (
                                <span className="font-mono text-xs">daily</span> /{" "}
                                <span className="font-mono text-xs">weekly</span>), or name like{" "}
                                <span className="font-mono text-xs">daily_florida</span>. For ACH, ensure{" "}
                                <span className="font-mono text-xs">type=ach</span> or a layout key containing{" "}
                                <span className="font-mono text-xs">ach_authorization</span>.
                            </p>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {editorRows.map((r) => (
                                    <div key={r.id} className="space-y-1.5">
                                        <Label htmlFor={`tmpl-field-${r.id}`} className="text-xs font-medium">
                                            {r.label}
                                        </Label>
                                        {isUsCurrencyEditField(r.id, r.label) ? (
                                            <UsCurrencyInput
                                                id={`tmpl-field-${r.id}`}
                                                value={fieldValues[r.id] ?? ""}
                                                onChange={(next) =>
                                                    setFieldValues((prev) => ({ ...prev, [r.id]: next }))
                                                }
                                            />
                                        ) : (
                                        <Input
                                            id={`tmpl-field-${r.id}`}
                                            value={fieldValues[r.id] ?? ""}
                                            onChange={(e) =>
                                                setFieldValues((prev) => ({ ...prev, [r.id]: toPrefillUppercase(e.target.value, r.id) }))
                                            }
                                        />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
                    <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={saving || !row} onClick={() => void handleSave()}>
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
