import { useMemo, useState } from "react";
import { CheckCircle2, Pencil, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
    KycExtractionResult,
    KycPanelAchPatch,
    KycPanelGuarantorPatch,
} from "./kycDocumentPrefill";

type KycDocKey = "driverLicense" | "voidedCheck";

type KycExtractionReviewCardProps = {
    documentKey: KycDocKey;
    extraction: KycExtractionResult;
    synced?: boolean;
    syncing?: boolean;
    onChange: (next: KycExtractionResult) => void;
    onSync: () => void;
    onDismiss?: () => void;
};

function labelForKey(key: KycDocKey): string {
    return key === "driverLicense" ? "Driver's License" : "Voided Check";
}

type FieldDef = { key: string; label: string; value: string };

function driverLicenseFields(extraction: KycExtractionResult): FieldDef[] {
    const g = extraction.panels?.guarantor;
    const o = extraction.panels?.owner;
    return [
        { key: "firstName", label: "First name", value: g?.firstName || o?.firstName || "" },
        { key: "lastName", label: "Last name", value: g?.lastName || o?.lastName || "" },
        { key: "driverLicenseNumber", label: "Driver license #", value: g?.driverLicenseNumber || "" },
        { key: "address", label: "Address", value: g?.address || o?.address || "" },
        { key: "city", label: "City", value: g?.city || o?.city || "" },
        { key: "state", label: "State", value: g?.state || o?.state || "" },
        { key: "zipCode", label: "Zip", value: g?.zipCode || o?.zipCode || "" },
    ];
}

function voidedCheckFields(extraction: KycExtractionResult): FieldDef[] {
    const ach = extraction.panels?.ach;
    return [
        { key: "fullNameOnAccount", label: "Account holder", value: ach?.fullNameOnAccount || "" },
        { key: "dba", label: "DBA", value: ach?.dba || "" },
        { key: "bankName", label: "Bank name", value: ach?.bankName || "" },
        { key: "routingNumber", label: "Routing #", value: ach?.routingNumber || "" },
        { key: "accountNumber", label: "Account #", value: ach?.accountNumber || "" },
        { key: "address", label: "Address", value: ach?.address || "" },
        { key: "city", label: "City", value: ach?.city || "" },
        { key: "state", label: "State", value: ach?.state || "" },
        { key: "zip", label: "Zip", value: ach?.zip || "" },
    ];
}

export default function KycExtractionReviewCard({
    documentKey,
    extraction,
    synced = false,
    syncing = false,
    onChange,
    onSync,
    onDismiss,
}: KycExtractionReviewCardProps) {
    const [editing, setEditing] = useState(false);
    const fields = useMemo(
        () =>
            documentKey === "driverLicense"
                ? driverLicenseFields(extraction)
                : voidedCheckFields(extraction),
        [documentKey, extraction],
    );

    const updateField = (fieldKey: string, value: string) => {
        if (documentKey === "driverLicense") {
            const owner = extraction.panels?.owner ?? {
                firstName: "",
                lastName: "",
                address: "",
                city: "",
                state: "",
                zipCode: "",
            };
            const guarantor = extraction.panels?.guarantor ?? {
                firstName: "",
                lastName: "",
                address: "",
                city: "",
                state: "",
                zipCode: "",
                driverLicenseNumber: "",
            };
            const patch: Partial<KycPanelGuarantorPatch & { zipCode: string }> = {
                [fieldKey]: value,
            };
            const nextGuarantor = { ...guarantor, ...patch };
            const nextOwner = {
                ...owner,
                ...(fieldKey === "driverLicenseNumber"
                    ? {}
                    : {
                          firstName:
                              fieldKey === "firstName" ? value : nextGuarantor.firstName,
                          lastName: fieldKey === "lastName" ? value : nextGuarantor.lastName,
                          address: fieldKey === "address" ? value : nextGuarantor.address,
                          city: fieldKey === "city" ? value : nextGuarantor.city,
                          state: fieldKey === "state" ? value : nextGuarantor.state,
                          zipCode: fieldKey === "zipCode" ? value : nextGuarantor.zipCode,
                      }),
            };
            onChange({
                ...extraction,
                panels: {
                    ...extraction.panels,
                    owner: nextOwner,
                    guarantor: nextGuarantor,
                },
            });
            return;
        }

        const ach = extraction.panels?.ach ?? {
            bankName: "",
            fullNameOnAccount: "",
            accountNumber: "",
            routingNumber: "",
            dba: "",
            address: "",
            city: "",
            state: "",
            zip: "",
        };
        onChange({
            ...extraction,
            panels: {
                ...extraction.panels,
                ach: { ...ach, [fieldKey]: value } as KycPanelAchPatch,
            },
        });
    };

    if (extraction.error) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50/80 p-3 text-sm text-red-700">
                <p className="font-medium">{labelForKey(documentKey)} scan failed</p>
                <p className="mt-1 text-xs">{extraction.error}</p>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "rounded-xl border p-3 shadow-sm",
                synced
                    ? "border-emerald-200 bg-emerald-50/60"
                    : "border-[var(--brand)]/25 bg-gradient-to-br from-white to-slate-50/90",
            )}
        >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold text-slate-900">
                        Extracted — {labelForKey(documentKey)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                        {synced
                            ? "Synced to contract prefill."
                            : "Review extracted fields, edit if needed, then sync to prefill."}
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    {!synced && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => setEditing((v) => !v)}
                        >
                            <Pencil className="h-3.5 w-3.5" />
                            {editing ? "Done" : "Edit"}
                        </Button>
                    )}
                    {onDismiss ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Dismiss"
                            onClick={onDismiss}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {fields.map((field) => (
                    <div key={field.key} className="min-w-0">
                        <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                            {field.label}
                        </p>
                        {editing && !synced ? (
                            <Input
                                className="h-8 bg-white text-xs"
                                value={field.value}
                                onChange={(e) => updateField(field.key, e.target.value)}
                            />
                        ) : (
                            <p className="truncate rounded-md border border-slate-200/80 bg-white px-2 py-1.5 text-xs text-slate-800">
                                {field.value.trim() || "—"}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {!synced && (
                <div className="mt-3 flex justify-end">
                    <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1.5 bg-[image:var(--brand-gradient)] text-xs text-white hover:opacity-90"
                        disabled={syncing}
                        onClick={onSync}
                    >
                        {syncing ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Sync to prefill
                    </Button>
                </div>
            )}

            {synced && (
                <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Prefill updated
                </p>
            )}
        </div>
    );
}
