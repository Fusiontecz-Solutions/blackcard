import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsCurrencyInput } from "@/components/ui/us-currency-input";
import { useTheme } from "@/context/ThemeContext";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { createAddendum } from "@/redux/actions/contractActions";
import type { AppDispatch, RootState } from "@/redux/store";
import { toast } from "react-toastify";

export interface AddendumEntry {
    id: string;
    legalName: string;
    dba: string;
    typeOfEntity: string;
    ein: string;
    mailingAddress: string;
    addendumDated: string;
    principalOwner: string;
    principalBusiness: string;
    businessLocation: string;
    principalState: string;
    principalOwnerAmount1: string;
    principalOwnerAmount2: string;
    principalOwner1Name: string;
    principalOwner1Date: string;
    principalOwner2Name: string;
    principalOwner2Date: string;
}

interface AddendumModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    applicationId?: string | null;
    onSave?: (data: AddendumEntry[]) => void | Promise<void>;
}

export default function AddendumModal({ open, onOpenChange, applicationId, onSave }: AddendumModalProps) {
    const dispatch = useDispatch<AppDispatch>();
    const applicationData = useSelector((state: RootState) => state.applicationDetail.data as any);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const [entries, setEntries] = useState<AddendumEntry[]>([
        {
            id: "1",
            legalName: "",
            dba: "",
            typeOfEntity: "",
            ein: "",
            mailingAddress: "",
            addendumDated: "",
            principalOwner: "",
            principalBusiness: "",
            businessLocation: "",
            principalState: "",
            principalOwnerAmount1: "",
            principalOwnerAmount2: "",
            principalOwner1Name: "",
            principalOwner1Date: "",
            principalOwner2Name: "",
            principalOwner2Date: "",
        },
    ]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ "1": true });
    const [saving, setSaving] = useState(false);

    const toggleExpand = (id: string) => {
        setExpanded((p) => ({ ...p, [id]: !p[id] }));
    };

    const updateEntry = (id: string, field: keyof AddendumEntry, value: string) => {
        setEntries((prev) =>
            prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
        );
    };

    const removeEntry = (id: string) => {
        if (entries.length <= 1) return;
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setExpanded((p) => {
            const next = { ...p };
            delete next[id];
            return next;
        });
    };

    const addEntry = () => {
        const newId = String(Date.now());
        setEntries((prev) => [
            ...prev,
            {
                id: newId,
                legalName: "",
                dba: "",
                typeOfEntity: "",
                ein: "",
                mailingAddress: "",
                addendumDated: "",
                principalOwner: "",
                principalBusiness: "",
                businessLocation: "",
                principalState: "",
                principalOwnerAmount1: "",
                principalOwnerAmount2: "",
                principalOwner1Name: "",
                principalOwner1Date: "",
                principalOwner2Name: "",
                principalOwner2Date: "",
            },
        ]);
        setExpanded((p) => ({ ...p, [newId]: true }));
    };

    const handleSave = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const clientId = String(
                applicationData?.clientId ??
                applicationData?.client?._id ??
                applicationData?.client?.id ??
                "",
            );
            const rawBusinessInfoId =
                applicationData?.businessInfo?.[0]?.id ??
                applicationData?.businessInfo?.[0]?._id ??
                applicationData?.businessInfo?.id ??
                applicationData?.businessInfo?._id;
            const businessInfoId = Number(rawBusinessInfoId);

            if (!clientId || !Number.isFinite(businessInfoId)) {
                toast.error("Missing client or business info for Addendum.");
            } else {
                const [e1, e2, e3] = entries;
                const response = await dispatch(
                    createAddendum({
                        clientId,
                        businessInfoId,
                        legalName1: e1?.legalName,
                        dba1: e1?.dba,
                        typeOfEntity1: e1?.typeOfEntity,
                        ein1: e1?.ein,
                        mailingAddress1: e1?.mailingAddress,
                        legalName2: e2?.legalName,
                        dba2: e2?.dba,
                        typeOfEntity2: e2?.typeOfEntity,
                        ein2: e2?.ein,
                        mailingAddress2: e2?.mailingAddress,
                        legalName3: e3?.legalName,
                        dba3: e3?.dba,
                        typeOfEntity3: e3?.typeOfEntity,
                        ein3: e3?.ein,
                        mailingAddress3: e3?.mailingAddress,
                        addendumDated: e1?.addendumDated,
                        principalOwner: e1?.principalOwner,
                        principalBusiness: e1?.principalBusiness,
                        businessLocation: e1?.businessLocation,
                        principalState: e1?.principalState,
                        principalOwnerAmount1: e1?.principalOwnerAmount1,
                        principalOwnerAmount2: e1?.principalOwnerAmount2,
                        principalOwner1Name: e1?.principalOwner1Name,
                        principalOwner1Date: e1?.principalOwner1Date,
                        principalOwner2Name: e1?.principalOwner2Name,
                        principalOwner2Date: e1?.principalOwner2Date,
                    }),
                ).unwrap();
                toast.success(
                    (response as { message?: string })?.message ||
                    "Addendum record created successfully",
                );
            }

            await onSave?.(entries);
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save Addendum:", error);
            toast.error("Failed to save Addendum.");
        } finally {
            setSaving(false);
        }
    };

    const inputClass = isDark
        ? "bg-muted border-gray-700 text-gray-200"
        : "bg-white border-[#D1D5DB]";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4 pr-10">
                    <DialogTitle className={`text-xl font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
                        Addendum
                    </DialogTitle>
                    <Button
                        type="button"
                        size="sm"
                        className="bg-[#3B8BD1] hover:bg-[#2d6fad] text-white"
                        onClick={addEntry}
                    >
                        Add
                    </Button>
                </DialogHeader>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {entries.map((entry, idx) => (
                        <div
                            key={entry.id}
                            className={`rounded-lg border p-4 ${isDark ? "border-gray-700 bg-[#262827]" : "border-gray-200 bg-gray-50"}`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className={`font-bold ${isDark ? "text-gray-200" : "text-black"}`}>
                                    Addendum {idx + 1}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => removeEntry(entry.id)}
                                        className="text-red-500 hover:text-red-600 p-1"
                                        aria-label="Delete"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(entry.id)}
                                        className="p-1"
                                        aria-label={expanded[entry.id] ? "Collapse" : "Expand"}
                                    >
                                        {expanded[entry.id] ? (
                                            <ChevronUp className="h-4 w-4 text-gray-500" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4 text-gray-500" />
                                        )}
                                    </button>
                                </div>
                            </div>
                            {expanded[entry.id] && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Legal Name #1</Label>
                                        <Input
                                            value={entry.legalName}
                                            onChange={(e) => updateEntry(entry.id, "legalName", e.target.value)}
                                            className={inputClass}
                                            placeholder=""
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>DBA</Label>
                                        <Input
                                            value={entry.dba}
                                            onChange={(e) => updateEntry(entry.id, "dba", e.target.value)}
                                            className={inputClass}
                                            placeholder=""
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Type of Entity</Label>
                                        <Input
                                            value={entry.typeOfEntity}
                                            onChange={(e) => updateEntry(entry.id, "typeOfEntity", e.target.value)}
                                            className={inputClass}
                                            placeholder=""
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>EIN</Label>
                                        <Input
                                            value={entry.ein}
                                            onChange={(e) => updateEntry(entry.id, "ein", e.target.value)}
                                            className={inputClass}
                                            placeholder=""
                                        />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Mailing Address</Label>
                                        <Input
                                            value={entry.mailingAddress}
                                            onChange={(e) => updateEntry(entry.id, "mailingAddress", e.target.value)}
                                            className={inputClass}
                                            placeholder=""
                                        />
                                    </div>
                                    {idx === 0 && (
                                        <>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Addendum Dated</Label>
                                                <Input value={entry.addendumDated} onChange={(e) => updateEntry(entry.id, "addendumDated", e.target.value)} className={inputClass} placeholder="" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Principal Owner</Label>
                                                <Input value={entry.principalOwner} onChange={(e) => updateEntry(entry.id, "principalOwner", e.target.value)} className={inputClass} placeholder="" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Principal Business</Label>
                                                <Input value={entry.principalBusiness} onChange={(e) => updateEntry(entry.id, "principalBusiness", e.target.value)} className={inputClass} placeholder="" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Business Location</Label>
                                                <Input value={entry.businessLocation} onChange={(e) => updateEntry(entry.id, "businessLocation", e.target.value)} className={inputClass} placeholder="" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Principal State</Label>
                                                <Input value={entry.principalState} onChange={(e) => updateEntry(entry.id, "principalState", e.target.value)} className={inputClass} placeholder="" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Offer amount</Label>
                                                <UsCurrencyInput value={entry.principalOwnerAmount1} onChange={(next) => updateEntry(entry.id, "principalOwnerAmount1", next)} className={inputClass} placeholder="e.g. 25,000.00" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Payback amount</Label>
                                                <UsCurrencyInput value={entry.principalOwnerAmount2} onChange={(next) => updateEntry(entry.id, "principalOwnerAmount2", next)} className={inputClass} placeholder="e.g. 37,250.00" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Principal Owner 1 Name</Label>
                                                <Input value={entry.principalOwner1Name} onChange={(e) => updateEntry(entry.id, "principalOwner1Name", e.target.value)} className={inputClass} placeholder="" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Principal Owner 1 Date</Label>
                                                <Input value={entry.principalOwner1Date} onChange={(e) => updateEntry(entry.id, "principalOwner1Date", e.target.value)} className={inputClass} placeholder="" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Principal Owner 2 Name</Label>
                                                <Input value={entry.principalOwner2Name} onChange={(e) => updateEntry(entry.id, "principalOwner2Name", e.target.value)} className={inputClass} placeholder="" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Principal Owner 2 Date</Label>
                                                <Input value={entry.principalOwner2Date} onChange={(e) => updateEntry(entry.id, "principalOwner2Date", e.target.value)} className={inputClass} placeholder="" />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className={isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : ""}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={saving}
                        onClick={handleSave}
                        className="bg-[#3B8BD1] hover:bg-[#2d6fad] text-white"
                    >
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
