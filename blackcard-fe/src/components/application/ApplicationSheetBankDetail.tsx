"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit2, Eye, EyeOff, Landmark, Trash2 } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";

import {
    createBankDetail,
    getBankDetails,
    updateBankDetail,
    deleteBankDetail,
} from "@/redux/actions/bankDetailActions";
import { toast } from "react-toastify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import {
    filterBankDetailsForApplication,
    hasCompleteBankDetailRow,
} from "@/lib/bankDetailUtils";
import { cn } from "@/lib/utils";
import { emitContractPrefillUpdated } from "@/lib/contractPrefillSync";
import { getByApplicationIdContract } from "@/redux/actions/contractActions";

type ApplicationSheetBankDetailProps = {
    applicationId: string;
    /** When embedded in a dialog, closes the parent modal on Cancel. */
    onClose?: () => void;
    /** When false, a successful save keeps the parent dialog open (e.g. add bank then initiate Decision Logic). */
    closeOnSave?: boolean;
    /** Compact card layout for the application Overview tab. */
    variant?: "default" | "overview";
    className?: string;
};

export default function ApplicationSheetBankDetail({
    applicationId,
    onClose,
    closeOnSave = true,
    variant = "default",
    className,
}: ApplicationSheetBankDetailProps) {
    const isOverview = variant === "overview";
    const dispatch = useDispatch<AppDispatch>();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const { data: bankDetailsList, loading } = useSelector(
        (state: RootState) => state.bankDetails,
    );
    const { data: applicationData } = useSelector(
        (state: RootState) => state.applicationDetail,
    );

    const applicationKeys = useMemo(
        () => [
            applicationId,
            (applicationData as { _id?: string; id?: string; applicationId?: string })
                ?._id,
            (applicationData as { id?: string })?.id,
            (applicationData as { applicationId?: string })?.applicationId,
        ],
        [applicationId, applicationData],
    );

    const bankDetails = useMemo(
        () => filterBankDetailsForApplication(bankDetailsList, applicationKeys),
        [bankDetailsList, applicationKeys],
    );

    const hasCompleteBankDetails = bankDetails.some(hasCompleteBankDetailRow);
    const showIncompleteHint =
        isOverview &&
        Boolean(applicationId) &&
        !loading &&
        !hasCompleteBankDetails;

    const [form, setForm] = useState({
        bankName: "",
        accountNumber: "",
        routingNumber: "",
    });

    const [showAccount, setShowAccount] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    useEffect(() => {
        if (applicationId) {
            dispatch(getBankDetails({ application: applicationId }));
        }
    }, [applicationId, dispatch]);

    const resetForm = () => {
        setForm({
            bankName: "",
            accountNumber: "",
            routingNumber: "",
        });
        setEditingId(null);
    };

    const handleCancel = () => {
        resetForm();
        onClose?.();
    };

    const handleEditClick = (id: string) => {
        const bank = bankDetails.find((b) => b._id === id);
        if (!bank) return;

        setForm({
            bankName: bank.bankName || "",
            accountNumber: bank.accountNumber || "",
            routingNumber: bank.routingNumber || "",
        });
        setEditingId(id);
        setShowAccount(false);
    };

    const handleDeleteClick = async (id: string) => {
        try {
            await dispatch(deleteBankDetail(id)).unwrap();
            toast.success("Bank detail deleted.");
            if (editingId === id) {
                resetForm();
            }
        } catch (error: unknown) {
            toast.error(
                typeof error === "string" ? error : "Failed to delete bank detail.",
            );
        }
    };

    const handleSave = async () => {
        if (!form.accountNumber || !applicationId) {
            toast.error("Please enter an account number.");
            return;
        }
        if (!String(form.routingNumber || "").trim()) {
            toast.error("Please enter a routing number (required for contracts).");
            return;
        }

        try {
            setSaving(true);
            if (editingId) {
                await dispatch(
                    updateBankDetail({
                        id: editingId,
                        data: {
                            bankName: form.bankName,
                            accountNumber: form.accountNumber,
                            routingNumber: form.routingNumber,
                        },
                    }),
                ).unwrap();
                toast.success("Bank details updated successfully.");
            } else {
                await dispatch(
                    createBankDetail({
                        bankName: form.bankName,
                        accountNumber: form.accountNumber,
                        routingNumber: form.routingNumber,
                        application: applicationId,
                    }),
                ).unwrap();
                toast.success("Bank details saved successfully.");
            }

            await dispatch(getBankDetails({ application: applicationId })).unwrap();

            // Keep Verify contract prefill / DocuSign draft bank tabs aligned with Overview bank edits.
            try {
                const appUuid = String(
                    (applicationData as { id?: string; _id?: string } | null)?.id ??
                        (applicationData as { _id?: string } | null)?._id ??
                        applicationId,
                ).trim();
                if (appUuid) {
                    const res = await dispatch(getByApplicationIdContract(appUuid)).unwrap();
                    const contract = (res as { data?: unknown })?.data ?? res;
                    if (contract && typeof contract === "object") {
                        emitContractPrefillUpdated(appUuid, contract);
                    } else {
                        emitContractPrefillUpdated(appUuid);
                    }
                }
            } catch {
                /* no contract yet */
            }

            resetForm();
            if (closeOnSave) {
                onClose?.();
            }
        } catch (error: unknown) {
            toast.error(
                typeof error === "string" ? error : "Failed to save bank details.",
            );
        } finally {
            setSaving(false);
        }
    };

    const labelClass = isOverview
        ? `text-xs font-medium ${isDark ? "text-[#C07BE0]" : "text-[var(--brand)]"}`
        : "text-xs font-semibold text-muted-foreground uppercase tracking-wide";

    const inputClass = isOverview
        ? "h-9 px-3 text-sm"
        : "h-11 px-4 text-sm";

    const formGrid = (
        <div
            className={
                isOverview
                    ? "grid grid-cols-1 gap-3 sm:grid-cols-3"
                    : "grid grid-cols-1 md:grid-cols-3 gap-4"
            }
        >
            <div className="flex flex-col gap-1">
                <label className={labelClass}>Bank Name</label>
                <Input
                    type="text"
                    name="bankName"
                    placeholder="e.g. Bank of America"
                    value={form.bankName}
                    onChange={handleChange}
                    className={inputClass}
                />
            </div>

            <div className="flex flex-col gap-1 relative">
                <label className={labelClass}>Account Number</label>
                <div className="relative">
                    <Input
                        type={showAccount ? "text" : "password"}
                        name="accountNumber"
                        placeholder="e.g. 1234567890"
                        value={form.accountNumber}
                        onChange={handleChange}
                        className={`${inputClass} w-full pr-9 tracking-widest`}
                    />
                    <button
                        type="button"
                        onClick={() => setShowAccount(!showAccount)}
                        className="absolute cursor-pointer right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        {showAccount ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <label className={labelClass}>
                    Routing Number{" "}
                    <span className="text-red-500">{isOverview ? "*" : ""}</span>
                </label>
                <Input
                    type="text"
                    name="routingNumber"
                    placeholder="e.g. 1234567890"
                    value={form.routingNumber}
                    onChange={handleChange}
                    className={inputClass}
                />
            </div>
        </div>
    );

    const savedRows = loading ? (
        <p className="text-xs text-muted-foreground">Loading bank details...</p>
    ) : bankDetails.length > 0 ? (
        isOverview ? (
            <div className="divide-y divide-border rounded-md border border-border">
                {bankDetails.map((bank) => (
                    <div
                        key={bank._id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                            <span className={`font-medium ${isDark ? "text-white" : "text-[#374151]"}`}>
                                {bank.bankName || "—"}
                            </span>
                            <span className={isDark ? "text-gray-400" : "text-[#6B7280]"}>
                                Acct{" "}
                                {bank.accountNumber
                                    ? `••••${bank.accountNumber.slice(-4)}`
                                    : "—"}
                            </span>
                            <span className={isDark ? "text-gray-400" : "text-[#6B7280]"}>
                                Routing {bank.routingNumber || "—"}
                            </span>
                        </div>
                        <div className="inline-flex shrink-0 items-center gap-0.5">
                            <Button
                                type="button"
                                onClick={() => handleEditClick(bank._id)}
                                variant="ghost"
                                size="icon-sm"
                                className="h-8 w-8 text-primary cursor-pointer hover:text-primary"
                            >
                                <Edit2 size={15} />
                            </Button>
                            <Button
                                type="button"
                                onClick={() => void handleDeleteClick(bank._id)}
                                variant="ghost"
                                size="icon-sm"
                                className="h-8 w-8 text-destructive cursor-pointer hover:text-destructive"
                            >
                                <Trash2 size={15} />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <div className="overflow-x-auto border border-border rounded-lg">
                <table className="min-w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Bank Name
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Account Number
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Routing Number
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {bankDetails.map((bank) => (
                            <tr key={bank._id} className="border-t border-border">
                                <td className="px-4 py-2 text-foreground">
                                    {bank.bankName || "-"}
                                </td>
                                <td className="px-4 py-2 text-foreground">
                                    {bank.accountNumber
                                        ? "••••••" + bank.accountNumber.slice(-4)
                                        : "-"}
                                </td>
                                <td className="px-4 py-2 text-foreground">
                                    {bank.routingNumber || "-"}
                                </td>
                                <td className="px-4 py-2 text-left">
                                    <div className="inline-flex items-center gap-1">
                                        <Button
                                            type="button"
                                            onClick={() => handleEditClick(bank._id)}
                                            variant="ghost"
                                            size="icon-sm"
                                            className="text-primary cursor-pointer hover:text-primary"
                                        >
                                            <Edit2 size={18} />
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => void handleDeleteClick(bank._id)}
                                            variant="ghost"
                                            size="icon-sm"
                                            className="text-destructive cursor-pointer hover:text-destructive"
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    ) : (
        <p className="text-xs text-muted-foreground">No bank details added yet.</p>
    );

    const actionButtons = (
        <div className={`flex justify-end gap-2 ${isOverview ? "mt-3" : "mt-6 gap-3"}`}>
            <Button
                type="button"
                variant="outline"
                size={isOverview ? "sm" : "default"}
                className="cursor-pointer"
                onClick={handleCancel}
                disabled={saving}
            >
                {editingId ? "Cancel Edit" : "Cancel"}
            </Button>
            <Button
                size={isOverview ? "sm" : "default"}
                className="cursor-pointer bg-[image:var(--brand-gradient)] text-white hover:opacity-90"
                onClick={() => void handleSave()}
                disabled={saving}
            >
                {saving ? "Saving..." : editingId ? "Update" : "Save Details"}
            </Button>
        </div>
    );

    if (isOverview) {
        return (
            <Card
                className={cn(
                    "mt-6 gap-0 border shadow-md dark:shadow-lg p-0 rounded-b-md pb-3",
                    isDark ? "bg-[#141517] border-[#374151]" : "border-[#FDFDFD]",
                    className,
                )}
            >
                <CardHeader className="pb-0 p-0">
                    <CardTitle
                        className={`rounded-t-sm text-base font-[600] font-roboto px-6 py-3 ${isDark ? "text-white bg-[#2A2B2F]" : "text-[#374151] bg-[#F9FAFD]"}`}
                    >
                        Bank Details
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-6 pt-4">
                    {showIncompleteHint ? (
                        <div
                            role="status"
                            className={`flex gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed ${isDark
                                ? "border-amber-900/60 bg-amber-950/40 text-amber-100/95"
                                : "border-amber-200/90 bg-amber-50 text-amber-950"
                                }`}
                        >
                            <Landmark
                                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? "text-amber-400" : "text-amber-700"}`}
                                aria-hidden
                            />
                            <p>
                                Account and routing number are required before generating a
                                contract.
                                {bankDetails.length > 0 && !hasCompleteBankDetails
                                    ? " A saved row is missing routing — edit it below."
                                    : null}
                            </p>
                        </div>
                    ) : null}
                    {formGrid}
                    {bankDetails.length > 0 || loading ? (
                        <div className="pt-1">{savedRows}</div>
                    ) : null}
                    {actionButtons}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-4xl mx-auto">
            <CardHeader className="pb-0">
                <CardTitle className="text-xl">Add Bank Details</CardTitle>
            </CardHeader>

            <CardContent className="pt-4">
                {formGrid}

                <div className="mt-6">
                    <h3 className="text-sm font-semibold text-foreground mb-2">
                        Client Bank Info
                    </h3>
                    {savedRows}
                </div>

                {actionButtons}
            </CardContent>
        </Card>
    );
}
