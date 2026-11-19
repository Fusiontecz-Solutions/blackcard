import { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/context/ThemeContext";
import { createContractGuarantor } from "@/redux/actions/contractActions";
import type { AppDispatch } from "@/redux/store";
import { toast } from "react-toastify";
import { US_STATES } from "@/constants/usStates";

export interface GuarantorEntry {
  guarantorName: string;
  guarantorEmail: string;
  guarantorAddress: string;
  state: string;
  city: string;
  zipCode: string;
  ssnNumber: string;
  driverLicenseNumber: string;
  typeOfEntity: string;
}

interface GuarantorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: GuarantorEntry) => void | Promise<void>;
}

const emptyForm: GuarantorEntry = {
  guarantorName: "",
  guarantorEmail: "",
  guarantorAddress: "",
  state: "",
  city: "",
  zipCode: "",
  ssnNumber: "",
  driverLicenseNumber: "",
  typeOfEntity: "",
};

export default function GuarantorModal({
  open,
  onOpenChange,
  onSave,
}: GuarantorModalProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [form, setForm] = useState<GuarantorEntry>(emptyForm);
  const [saving, setSaving] = useState(false);

  const inputClass = useMemo(
    () =>
      isDark
        ? "bg-muted border-gray-700 text-gray-200"
        : "bg-white border-[#D1D5DB]",
    [isDark],
  );

  const update = (key: keyof GuarantorEntry, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const fullName = form.guarantorName.trim();
      const [firstName = "", ...rest] = fullName.split(" ");
      const lastName = rest.join(" ").trim();
      // const contractId = Number(
      //   applicationData?.contractId ??
      //   applicationData?.contract?.id ??
      //   applicationData?.contract?.contractId,
      // );
      const contractId = 1;

      if (!firstName || !lastName || !Number.isFinite(contractId)) {
        toast.error("Missing guarantor name or contract id.");
      } else {
        await dispatch(
          createContractGuarantor({
            contractId,
            firstName,
            lastName,
            email: form.guarantorEmail || undefined,
            address: form.guarantorAddress || undefined,
            state: form.state || undefined,
            city: form.city || undefined,
            zip: form.zipCode || undefined,
            ssn: form.ssnNumber || undefined,
          }),
        ).unwrap();
      }

      await onSave?.(form);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save guarantor:", error);
      toast.error("Failed to save guarantor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader className="pb-4 pr-8">
          <DialogTitle className={`text-xl font-semibold ${isDark ? "text-gray-200" : "text-black"}`}>
            Add Guarantor
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Guarantor Name *</Label>
            <Input
              value={form.guarantorName}
              onChange={(e) => update("guarantorName", e.target.value)}
              className={inputClass}
              placeholder="Enter guarantor name"
            />
          </div>
          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Guarantor Email</Label>
            <Input
              value={form.guarantorEmail}
              onChange={(e) => update("guarantorEmail", e.target.value)}
              className={inputClass}
              placeholder="Enter guarantor email"
            />
          </div>

          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Guarantor Address</Label>
            <Input
              value={form.guarantorAddress}
              onChange={(e) => update("guarantorAddress", e.target.value)}
              className={inputClass}
              placeholder="Enter guarantor address"
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

          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>SSN Number</Label>
            <Input
              value={form.ssnNumber}
              onChange={(e) => update("ssnNumber", e.target.value)}
              className={inputClass}
              placeholder="Enter SSN (123-45-6789)"
            />
          </div>
          <div className="space-y-1.5">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Driver License Number</Label>
            <Input
              value={form.driverLicenseNumber}
              onChange={(e) => update("driverLicenseNumber", e.target.value)}
              className={inputClass}
              placeholder="Enter driver license number"
            />
          </div>

          <div className="space-y-1.5 md:col-span-1">
            <Label className={`text-sm ${isDark ? "text-gray-300" : "text-[#374151]"}`}>Type of Entity</Label>
            <Input
              value={form.typeOfEntity}
              onChange={(e) => update("typeOfEntity", e.target.value)}
              className={inputClass}
              placeholder="Enter type of entity"
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
