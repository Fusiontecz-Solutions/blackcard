import { useEffect, useState, type ReactNode } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  DocuSignAccountProfile,
  DocuSignAccountProfileInput,
} from "@/types/integrationSettingsTypes";
import { normalizePemKey } from "@/utils/normalizePemKey";

type Props = {
  open: boolean;
  saving?: boolean;
  initial?: DocuSignAccountProfile | null;
  onClose: () => void;
  onSave: (payload: DocuSignAccountProfileInput) => Promise<void>;
};

const emptyForm: DocuSignAccountProfileInput = {
  name: "",
  integrationKey: "",
  impersonatedUserId: "",
  rsaPrivateKey: "",
  isActive: true,
};

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function Field({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `grid gap-2 ${className}` : "grid gap-2"}>{children}</div>;
}

export default function DocuSignAccountModal({
  open,
  saving,
  initial,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<DocuSignAccountProfileInput>(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        integrationKey: initial.integrationKey,
        impersonatedUserId: initial.impersonatedUserId,
        accountId: initial.accountId ?? "",
        baseUri: initial.baseUri ?? "",
        isActive: initial.isActive,
        rsaPrivateKey: "",
        clientSecret: "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, initial]);

  const set = (key: keyof DocuSignAccountProfileInput, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.integrationKey.trim() || !form.impersonatedUserId.trim()) {
      return;
    }
    if (!initial && !form.rsaPrivateKey?.trim()) {
      return;
    }
    await onSave({
      ...form,
      name: form.name.trim(),
      integrationKey: form.integrationKey.trim(),
      impersonatedUserId: form.impersonatedUserId.trim(),
      rsaPrivateKey: form.rsaPrivateKey?.trim()
        ? normalizePemKey(form.rsaPrivateKey)
        : form.rsaPrivateKey,
    });
  };

  const handleRsaKeyChange = (value: string) => {
    set("rsaPrivateKey", value);
  };

  const handleRsaKeyPaste = (value: string) => {
    set("rsaPrivateKey", normalizePemKey(value));
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit DocuSign account" : "Add DocuSign account"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-2">
          <div>
            <SectionTitle>Profile</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <Label htmlFor="ds-name">Profile name</Label>
                <Input
                  id="ds-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Production account"
                />
              </Field>
            </div>
          </div>

          <div>
            <SectionTitle>JWT credentials</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="ds-key">Integration key (client ID)</Label>
                <Input
                  id="ds-key"
                  value={form.integrationKey}
                  onChange={(e) => set("integrationKey", e.target.value)}
                />
              </Field>
              <Field>
                <Label htmlFor="ds-user">Impersonated user ID</Label>
                <Input
                  id="ds-user"
                  value={form.impersonatedUserId}
                  onChange={(e) => set("impersonatedUserId", e.target.value)}
                  placeholder="API username GUID"
                />
              </Field>
              <Field>
                <Label htmlFor="ds-account">Account ID (optional)</Label>
                <Input
                  id="ds-account"
                  value={form.accountId ?? ""}
                  onChange={(e) => set("accountId", e.target.value)}
                  placeholder="DocuSign account GUID"
                />
              </Field>
              <Field>
                <Label htmlFor="ds-base">Base URI</Label>
                <Input
                  id="ds-base"
                  value={form.baseUri ?? ""}
                  onChange={(e) => set("baseUri", e.target.value)}
                  placeholder="https://na4.docusign.net"
                />
              </Field>
            </div>
          </div>

          <div>
            <SectionTitle>Private key</SectionTitle>
            <Field>
              <Label htmlFor="ds-rsa">
                RSA private key {initial ? "(leave blank to keep existing)" : ""}
              </Label>
              <Textarea
                id="ds-rsa"
                rows={8}
                className="font-mono text-xs"
                value={form.rsaPrivateKey ?? ""}
                onChange={(e) => handleRsaKeyChange(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  if (!pasted.trim()) return;
                  e.preventDefault();
                  handleRsaKeyPaste(pasted);
                }}
                onBlur={(e) => {
                  const normalized = normalizePemKey(e.target.value);
                  if (normalized !== e.target.value) {
                    set("rsaPrivateKey", normalized);
                  }
                }}
                placeholder="Paste the private key from DocuSign Apps and Keys"
              />
              <p className="text-xs text-muted-foreground">
                Paste as-is from DocuSign — single line, multi-line, or copied from .env all work.
              </p>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            Active
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-[image:var(--brand-gradient)] hover:opacity-90"
            disabled={saving}
            onClick={() => void handleSubmit()}
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
