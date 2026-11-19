import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/context/ThemeContext";
import { createContractOwner } from "@/redux/actions/contractActions";
import type { AppDispatch, RootState } from "@/redux/store";
import { toast } from "react-toastify";
import { US_STATES } from "@/constants/usStates";

export interface OwnerEntry {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerAddress: string;
  state: string;
  city: string;
  zipCode: string;
  ownershipPercentage: string;
}

interface OwnerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: OwnerEntry) => void | Promise<void>;
}

const emptyForm: OwnerEntry = {
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  ownerAddress: "",
  state: "",
  city: "",
  zipCode: "",
  ownershipPercentage: "",
};

export default function OwnerModal({
  open,
  onOpenChange,
  onSave,
}: OwnerModalProps) {
  const dispatch = useDispatch<AppDispatch>();
  const applicationData = useSelector((state: RootState) => state.applicationDetail.data as any);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [form, setForm] = useState<OwnerEntry>(emptyForm);
  const [saving, setSaving] = useState(false);

  const inputClass = useMemo(
    () =>
      isDark
        ? "bg-muted border-gray-700 text-gray-200"
        : "bg-white border-[#D1D5DB]",
    [isDark],
  );

  const update = (key: keyof OwnerEntry, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const fullName = form.ownerName.trim();
      const [firstName = "", ...rest] = fullName.split(" ");
      const lastName = rest.join(" ").trim();
      const contractId = Number(
        applicationData?.contractId ??
        applicationData?.contract?.id ??
        applicationData?.contract?.contractId,
      );

      if (!firstName || !lastName || !Number.isFinite(contractId)) {
        toast.error("Missing owner name or contract id.");
      } else {
        const response = await dispatch(
          createContractOwner({
            contractId,
            firstName,
            lastName,
            email: form.ownerEmail || undefined,
            phone: form.ownerPhone || undefined,
            address: form.ownerAddress || undefined,
            state: form.state || undefined,
            city: form.city || undefined,
            zip: form.zipCode || undefined,
            ownershipPercentage: form.ownershipPercentage
              ? Number(form.ownershipPercentage)
              : undefined,
          }),
        ).unwrap();
        toast.success(
          (response as { message?: string })?.message ||
            "Owner record created successfully",
        );
      }

      await onSave?.(form);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save owner:", error);
      toast.error("Failed to save owner.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader className="pb-4 pr-8">
          <DialogTitle className={`text-xl font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
            Add Owner
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Owner Name *</Label>
            <Input
              value={form.ownerName}
              onChange={(e) => update("ownerName", e.target.value)}
              className={inputClass}
              placeholder="Enter owner name"
            />
          </div>
          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Owner Email</Label>
            <Input
              value={form.ownerEmail}
              onChange={(e) => update("ownerEmail", e.target.value)}
              className={inputClass}
              placeholder="Enter owner email"
            />
          </div>
          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Owner Phone</Label>
            <Input
              value={form.ownerPhone}
              onChange={(e) => update("ownerPhone", e.target.value)}
              className={inputClass}
              placeholder="Enter owner phone"
            />
          </div>
          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Ownership %</Label>
            <Input
              value={form.ownershipPercentage}
              onChange={(e) => update("ownershipPercentage", e.target.value)}
              className={inputClass}
              placeholder="Enter ownership percentage"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Owner Address</Label>
            <Input
              value={form.ownerAddress}
              onChange={(e) => update("ownerAddress", e.target.value)}
              className={inputClass}
              placeholder="Enter owner address"
            />
          </div>
          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>State</Label>
            <select
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
              disabled={saving}
              className={`${inputClass} w-full h-9 rounded-md px-3 py-2 text-sm`}
            >
              <option value="">Select state</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>City</Label>
            <Input
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              className={inputClass}
              placeholder={form.state ? "Enter city" : "Select state first"}
              disabled={!form.state}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Zip Code</Label>
            <Input
              value={form.zipCode}
              onChange={(e) => update("zipCode", e.target.value)}
              className={inputClass}
              placeholder="Enter zip code"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white px-7"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
