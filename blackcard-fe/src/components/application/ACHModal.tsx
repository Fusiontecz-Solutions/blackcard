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
import { useTheme } from "@/context/ThemeContext";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { createACH } from "@/redux/actions/contractActions";
import type { AppDispatch, RootState } from "@/redux/store";
import { toast } from "react-toastify";

export interface ACHEntry {
    id: string;
    bankName: string;
    fullNameOnAccount: string;
    accountNumber: string;
    routingNumber: string;
    dba: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    bankBranchCity: string;
    bankState: string;
    bankZip: string;
}

interface ACHModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    applicationId?: string | null;
    onSave?: (data: ACHEntry[]) => void | Promise<void>;
}

export default function ACHModal({ open, onOpenChange, applicationId, onSave }: ACHModalProps) {
    const dispatch = useDispatch<AppDispatch>();
    const applicationData = useSelector((state: RootState) => state.applicationDetail.data as any);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const [entries, setEntries] = useState<ACHEntry[]>([
        {
            id: "1",
            bankName: "",
            fullNameOnAccount: "",
            accountNumber: "",
            routingNumber: "",
            dba: "",
            phone: "",
            address: "",
            city: "",
            state: "",
            zip: "",
            bankBranchCity: "",
            bankState: "",
            bankZip: "",
        },
    ]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ "1": true });
    const [saving, setSaving] = useState(false);

    const toggleExpand = (id: string) => {
        setExpanded((p) => ({ ...p, [id]: !p[id] }));
    };

    const updateEntry = (id: string, field: keyof ACHEntry, value: string) => {
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
                bankName: "",
                fullNameOnAccount: "",
                accountNumber: "",
                routingNumber: "",
                dba: "",
                phone: "",
                address: "",
                city: "",
                state: "",
                zip: "",
                bankBranchCity: "",
                bankState: "",
                bankZip: "",
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
                toast.error("Missing client or business info for ACH.");
            } else {
                await Promise.all(
                    entries.map((entry) =>
                        dispatch(
                            createACH({
                                clientId,
                                businessInfoId,
                                bankName: entry.bankName,
                                accountHolderName: entry.fullNameOnAccount,
                                accountNumber: entry.accountNumber,
                                routingNumber: entry.routingNumber,
                                dba: entry.dba,
                                phone: entry.phone,
                                address: entry.address,
                                city: entry.city,
                                state: entry.state,
                                zip: entry.zip,
                                bankBranchCity: entry.bankBranchCity,
                                bankState: entry.bankState,
                                bankZip: entry.bankZip,
                            }),
                        ).unwrap(),
                    ),
                );
            }

            await onSave?.(entries);
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save ACH:", error);
            toast.error("Failed to save ACH.");
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
                        ACH
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
                            <div className="flex items-center justify-between">
                                <span className={`font-bold ${isDark ? "text-gray-200" : "text-black"}`}>
                                    ACH {idx + 1}
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Bank Name</Label>
                                        <Input
                                            value={entry.bankName}
                                            onChange={(e) => updateEntry(entry.id, "bankName", e.target.value)}
                                            className={inputClass}
                                            placeholder=""
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Full Name on Account</Label>
                                        <Input
                                            value={entry.fullNameOnAccount}
                                            onChange={(e) => updateEntry(entry.id, "fullNameOnAccount", e.target.value)}
                                            className={inputClass}
                                            placeholder=""
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Account Number</Label>
                                        <Input
                                            value={entry.accountNumber}
                                            onChange={(e) => updateEntry(entry.id, "accountNumber", e.target.value)}
                                            className={inputClass}
                                            placeholder=""
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Routing Number</Label>
                                        <Input
                                            value={entry.routingNumber}
                                            onChange={(e) => updateEntry(entry.id, "routingNumber", e.target.value)}
                                            className={inputClass}
                                            placeholder=""
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>DBA</Label>
                                        <Input value={entry.dba} onChange={(e) => updateEntry(entry.id, "dba", e.target.value)} className={inputClass} placeholder="" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Phone</Label>
                                        <Input value={entry.phone} onChange={(e) => updateEntry(entry.id, "phone", e.target.value)} className={inputClass} placeholder="" />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Address</Label>
                                        <Input value={entry.address} onChange={(e) => updateEntry(entry.id, "address", e.target.value)} className={inputClass} placeholder="" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>City</Label>
                                        <Input value={entry.city} onChange={(e) => updateEntry(entry.id, "city", e.target.value)} className={inputClass} placeholder="" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>State</Label>
                                        <Input value={entry.state} onChange={(e) => updateEntry(entry.id, "state", e.target.value)} className={inputClass} placeholder="" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Zip</Label>
                                        <Input value={entry.zip} onChange={(e) => updateEntry(entry.id, "zip", e.target.value)} className={inputClass} placeholder="" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Bank Branch City</Label>
                                        <Input value={entry.bankBranchCity} onChange={(e) => updateEntry(entry.id, "bankBranchCity", e.target.value)} className={inputClass} placeholder="" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Bank State</Label>
                                        <Input value={entry.bankState} onChange={(e) => updateEntry(entry.id, "bankState", e.target.value)} className={inputClass} placeholder="" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Bank Zip</Label>
                                        <Input value={entry.bankZip} onChange={(e) => updateEntry(entry.id, "bankZip", e.target.value)} className={inputClass} placeholder="" />
                                    </div>
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
