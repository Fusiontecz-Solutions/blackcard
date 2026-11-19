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
import { createEPO } from "@/redux/actions/contractActions";
import type { AppDispatch, RootState } from "@/redux/store";
import { toast } from "react-toastify";

export interface EPOEntry {
    id: string;
    legalName: string;
    receivedDate: string;
}

interface EPOModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    applicationId?: string | null;
    onSave?: (data: EPOEntry[]) => void | Promise<void>;
}

export default function EPOModal({ open, onOpenChange, applicationId, onSave }: EPOModalProps) {
    const dispatch = useDispatch<AppDispatch>();
    const applicationData = useSelector((state: RootState) => state.applicationDetail.data as any);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const [entries, setEntries] = useState<EPOEntry[]>([
        { id: "1", legalName: "", receivedDate: "" },
        { id: "2", legalName: "", receivedDate: "" },
    ]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ "1": true, "2": false });
    const [saving, setSaving] = useState(false);

    const toggleExpand = (id: string) => {
        setExpanded((p) => ({ ...p, [id]: !p[id] }));
    };

    const updateEntry = (id: string, field: keyof EPOEntry, value: string) => {
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
            { id: newId, legalName: "", receivedDate: "" },
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
            const parsedBusinessInfoId = Number(rawBusinessInfoId);
            const businessInfoId =
                Number.isFinite(parsedBusinessInfoId) &&
                Number.isInteger(parsedBusinessInfoId) &&
                parsedBusinessInfoId > 0
                    ? parsedBusinessInfoId
                    : undefined;

            if (!clientId) {
                toast.error("Missing client for EPO.");
            } else {
                await Promise.all(
                    entries.map((entry) =>
                        dispatch(
                            createEPO({
                                clientId,
                                ...(businessInfoId !== undefined ? { businessInfoId } : {}),
                                amountReceived1: entry.legalName,
                                receivedDate1: entry.receivedDate,
                            }),
                        ).unwrap(),
                    ),
                );
            }

            await onSave?.(entries);
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save EPO:", error);
            toast.error("Failed to save EPO.");
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
                        EPO
                    </DialogTitle>
                    <Button
                        type="button"
                        size="sm"
                        className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
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
                                    EPO {idx + 1}
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
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Legal Name #1</Label>
                                        <Input
                                            value={entry.legalName}
                                            onChange={(e) => updateEntry(entry.id, "legalName", e.target.value)}
                                            className={inputClass}
                                            placeholder=""
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>Received Date 1</Label>
                                        <Input
                                            type="date"
                                            value={entry.receivedDate}
                                            onChange={(e) => updateEntry(entry.id, "receivedDate", e.target.value)}
                                            className={inputClass}
                                        />
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
                        className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
                    >
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
