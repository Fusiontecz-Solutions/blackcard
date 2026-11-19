import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createDocuSignAccountProfile,
  deleteDocuSignAccountProfile,
  fetchDocuSignAccountProfiles,
  updateDocuSignAccountProfile,
} from "@/redux/actions/integrationSettingsActions";
import type {
  DocuSignAccountProfile,
  DocuSignAccountProfileInput,
} from "@/types/integrationSettingsTypes";
import DocuSignAccountModal from "./DocuSignAccountModal";

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}

export default function DocuSignAccountsSettings() {
  const [rows, setRows] = useState<DocuSignAccountProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DocuSignAccountProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchDocuSignAccountProfiles());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load DocuSign accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (payload: DocuSignAccountProfileInput) => {
    setSaving(true);
    try {
      if (editing) {
        await updateDocuSignAccountProfile(editing.id, payload);
        toast.success("DocuSign account updated");
      } else {
        await createDocuSignAccountProfile(payload);
        toast.success("DocuSign account added");
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save DocuSign account");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: DocuSignAccountProfile) => {
    if (!window.confirm(`Delete DocuSign account "${row.name}"?`)) return;
    try {
      await deleteDocuSignAccountProfile(row.id);
      toast.success("DocuSign account deleted");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Add DocuSign JWT credentials for each signing account. Link funders to these profiles
          on the Funders tab so contracts route to the correct DocuSign account.
        </p>
        <Button
          className="gap-2 bg-[image:var(--brand-gradient)] hover:opacity-90 shrink-0"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add DocuSign account
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading DocuSign accounts…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No DocuSign accounts yet. Add one to connect a funder to its own DocuSign account.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.id} className={!row.isActive ? "opacity-70" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{row.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditing(row);
                        setModalOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => void handleDelete(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.isActive ? "Active" : "Inactive"}
                  {row.funderCount != null ? ` · ${row.funderCount} funder(s)` : ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <DetailRow label="Integration key" value={row.integrationKey} />
                <DetailRow label="Impersonated user" value={row.impersonatedUserId} />
                <DetailRow label="Account ID" value={row.accountId} />
                <DetailRow label="Base URI" value={row.baseUri} />
                <DetailRow label="RSA key" value={row.hasRsaPrivateKey ? "Configured" : "Missing"} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DocuSignAccountModal
        open={modalOpen}
        saving={saving}
        initial={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}
