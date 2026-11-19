import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useTheme } from "@/context/ThemeContext";
import { axiosGet, axiosPost } from "@/redux/axios";

export type BusinessInfoPayload = {
  state: string;
  funderName: string;
  frequency: string;
  clientBusinessName: string;
  clientBusinessEmail: string;
  payoff: string;
  addendum: boolean;
  epo: boolean;
  ach: boolean;
};

export type BusinessInfoApi = {
  id: number;
  state: string;
  funderName: string;
  frequency: string;
  clientBusinessName: string;
  clientBusinessEmail: string;
  payoff: string;
  addendum: boolean;
  epo: boolean;
  ach: boolean;
  applicationId: string;
};

type BusinessInfoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId?: string | null;
  readOnly?: boolean;
};

const emptyPayload: BusinessInfoPayload = {
  state: "",
  funderName: "",
  frequency: "",
  clientBusinessName: "",
  clientBusinessEmail: "",
  payoff: "",
  addendum: false,
  epo: false,
  ach: false,
};

export default function BusinessInfoModal({
  open,
  onOpenChange,
  applicationId,
  readOnly = false,
}: BusinessInfoModalProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const inputClass = useMemo(
    () =>
      isDark
        ? "bg-muted border-gray-700 text-gray-200 read-only:opacity-90"
        : "bg-white border-[#D1D5DB] read-only:bg-gray-50",
    [isDark],
  );

  const [serialId, setSerialId] = useState<number | null>(null);
  const [form, setForm] = useState<BusinessInfoPayload>(emptyPayload);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasExisting = serialId !== null;

  useEffect(() => {
    if (!open) return;
    if (!applicationId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const resp = await axiosGet(
          `/business-info/application/${applicationId}`,
        );
        const data = resp?.data?.data as BusinessInfoApi | null;

        if (cancelled) return;

        if (!data) {
          setSerialId(null);
          setForm(emptyPayload);
          return;
        }

        setSerialId(data.id);
        setForm({
          state: data.state ?? "",
          funderName: data.funderName ?? "",
          frequency: data.frequency ?? "",
          clientBusinessName: data.clientBusinessName ?? "",
          clientBusinessEmail: data.clientBusinessEmail ?? "",
          payoff: data.payoff ?? "",
          addendum: Boolean(data.addendum),
          epo: Boolean(data.epo),
          ach: Boolean(data.ach),
        });
      } catch (err: any) {
        if (cancelled) return;
        const message =
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load business info";
        setLoadError(message);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, applicationId]);

  const handleChange =
    (key: keyof BusinessInfoPayload) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({
        ...prev,
        [key]: e.target.value,
      }));
    };

  const handleCheckbox =
    (key: "addendum" | "epo" | "ach") =>
    (checked: boolean) => {
      setForm((prev) => ({
        ...prev,
        [key]: checked,
      }));
    };

  const validate = (): string | null => {
    const requiredKeys: Array<keyof BusinessInfoPayload> = [
      "state",
      "funderName",
      "frequency",
      "clientBusinessName",
      "clientBusinessEmail",
    ];

    for (const k of requiredKeys) {
      if (!String(form[k] ?? "").trim()) {
        return `${k} is required`;
      }
    }
    // payoff is allowed empty, but ensure it's a string
    return null;
  };

  const handleSave = async () => {
    if (readOnly) return;
    if (!applicationId) return;

    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setSaving(true);

      const payload: BusinessInfoPayload = {
        ...form,
        payoff: String(form.payoff ?? "").trim(),
      };

      const resp = await axiosPost(
        `/business-info/application/${applicationId}`,
        payload,
      );
      const saved = resp?.data?.data as BusinessInfoApi | null;

      if (saved) {
        setSerialId(saved.id);
        setForm({
          state: saved.state ?? "",
          funderName: saved.funderName ?? "",
          frequency: saved.frequency ?? "",
          clientBusinessName: saved.clientBusinessName ?? "",
          clientBusinessEmail: saved.clientBusinessEmail ?? "",
          payoff: saved.payoff ?? "",
          addendum: Boolean(saved.addendum),
          epo: Boolean(saved.epo),
          ach: Boolean(saved.ach),
        });
      }

      toast.success(
        hasExisting
          ? "Business info updated successfully."
          : "Business info created successfully.",
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to save business info";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4 pr-6">
          <DialogTitle
            className={`text-xl font-semibold ${
              isDark ? "text-gray-200" : "text-black"
            }`}
          >
            {hasExisting ? "Edit Business Info" : "Add Business Info"}
          </DialogTitle>

          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">
              {loading ? "Loading..." : ""}
            </div>
          </div>
        </DialogHeader>

        {loadError ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        <div className="space-y-4">
          {loading ? (
            <div className="py-6 text-sm text-muted-foreground">
              Loading business info...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>
                    SERIAL (ID)
                  </Label>
                  <Input
                    value={serialId === null ? "" : String(serialId)}
                    disabled
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>
                    applicationId (UUID)
                  </Label>
                  <Input
                    value={applicationId ?? ""}
                    readOnly
                    disabled
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>
                    state
                  </Label>
                  <Input
                    value={form.state}
                    onChange={handleChange("state")}
                    className={inputClass}
                    placeholder="e.g. California"
                    readOnly={readOnly}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>
                    funderName
                  </Label>
                  <Input
                    value={form.funderName}
                    onChange={handleChange("funderName")}
                    className={inputClass}
                    placeholder="e.g. Daily Core Funding"
                    readOnly={readOnly}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>
                    frequency
                  </Label>
                  <Input
                    value={form.frequency}
                    onChange={handleChange("frequency")}
                    className={inputClass}
                    placeholder="e.g. Weekly"
                    readOnly={readOnly}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>
                    clientBusinessName
                  </Label>
                  <Input
                    value={form.clientBusinessName}
                    onChange={handleChange("clientBusinessName")}
                    className={inputClass}
                    placeholder="Client business name"
                    readOnly={readOnly}
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>
                    clientBusinessEmail
                  </Label>
                  <Input
                    value={form.clientBusinessEmail}
                    onChange={handleChange("clientBusinessEmail")}
                    className={inputClass}
                    placeholder="Client business email"
                    readOnly={readOnly}
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}>
                    payoff (optional)
                  </Label>
                  <Input
                    value={form.payoff}
                    onChange={handleChange("payoff")}
                    className={inputClass}
                    placeholder="Payoff1 / Payoff2 / Payoff3 or leave blank"
                    readOnly={readOnly}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.addendum}
                        onCheckedChange={(c: boolean | "indeterminate") =>
                          handleCheckbox("addendum")(c === true)
                        }
                        disabled={readOnly}
                      />
                      <span className={isDark ? "text-gray-300 text-sm" : "text-[#374151] text-sm"}>
                        addendum
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.epo}
                        onCheckedChange={(c: boolean | "indeterminate") => handleCheckbox("epo")(c === true)}
                        disabled={readOnly}
                      />
                      <span className={isDark ? "text-gray-300 text-sm" : "text-[#374151] text-sm"}>
                        epo
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.ach}
                        onCheckedChange={(c: boolean | "indeterminate") => handleCheckbox("ach")(c === true)}
                        disabled={readOnly}
                      />
                      <span className={isDark ? "text-gray-300 text-sm" : "text-[#374151] text-sm"}>
                        ach
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className={
              isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : ""
            }
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={readOnly || loading || saving}
            className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

