import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Route, X } from "lucide-react";
import { toast } from "react-toastify";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { axiosGet, axiosPut } from "@/redux/axios";
import type { User } from "@/types/userTypes";

const ENDPOINT = "/underwriter-routing";

type RoutingConfig = {
  underwriterIds: string[];
  underwriters: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }>;
  autoAssign: boolean;
  updatedAt: string | null;
  assignedCount?: number;
};

function displayName(user: Pick<User, "firstName" | "lastName" | "email">): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
}

function sameSelection(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

interface Props {
  users: User[];
}

export default function UnderwriterRoutingCard({ users }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () =>
      (users ?? [])
        .filter((user) => user.isActive !== false)
        .map((user) => ({
          id: user._id ?? (user as { id?: string }).id ?? "",
          label: displayName(user),
        }))
        .filter((option) => option.id),
    [users],
  );

  const labelById = useMemo(
    () => new Map(options.map((option) => [option.id, option.label])),
    [options],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axiosGet(ENDPOINT);
        if (cancelled) return;
        const config = res.data?.data as RoutingConfig | undefined;
        const next = config?.underwriterIds ?? [];
        setSelectedIds(next);
        setSavedIds(next);
      } catch {
        if (!cancelled) toast.error("Could not load underwriter routing");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await axiosPut(ENDPOINT, { underwriterIds: selectedIds });
      const config = res.data?.data as RoutingConfig | undefined;
      const next = config?.underwriterIds ?? [];
      setSelectedIds(next);
      setSavedIds(next);
      toast.success(res.data?.message || "Underwriter routing saved");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to save underwriter routing",
      );
    } finally {
      setSaving(false);
    }
  }, [selectedIds]);

  const dirty = !sameSelection(selectedIds, savedIds);

  let triggerLabel = "None (no routing)";
  if (loading) triggerLabel = "Loading…";
  else if (selectedIds.length === 1) {
    triggerLabel = labelById.get(selectedIds[0]) ?? "1 underwriter";
  } else if (selectedIds.length > 1) {
    triggerLabel = `${selectedIds.length} underwriters selected`;
  }

  let modeHint =
    "Nobody selected — deals stay unassigned until an underwriter claims them or an admin sends them over.";
  if (selectedIds.length === 1) {
    modeHint =
      "One underwriter selected — every deal entering the Underwriter queue is assigned to them, and unassigned deals already in that queue are handed over on save.";
  } else if (selectedIds.length > 1) {
    modeHint =
      "Several underwriters selected — nothing is auto-assigned; they all see the book's cases and claim as usual.";
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-[var(--brand)]" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">
              Route cases to underwriter(s)
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            {modeHint} Underwriters outside the selection only keep deals assigned to them
            directly.
          </p>

          {selectedIds.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedIds.map((id) => (
                <Badge
                  key={id}
                  variant="secondary"
                  className="gap-1 pr-1 text-xs font-normal"
                >
                  {labelById.get(id) ?? id}
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    disabled={saving}
                    className="rounded-full p-0.5 hover:bg-background/70"
                    aria-label={`Remove ${labelById.get(id) ?? "underwriter"}`}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={loading || saving}>
              <Button
                type="button"
                variant="outline"
                className="h-9 w-[260px] justify-between font-normal"
              >
                <span className="truncate">{triggerLabel}</span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-[260px] overflow-y-auto">
              {options.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={selectedIds.includes(option.id)}
                  onCheckedChange={() => toggle(option.id)}
                  onSelect={(event: Event) => event.preventDefault()}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {selectedIds.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelectedIds([])}
              disabled={loading || saving}
              className="h-9 px-2 text-xs text-muted-foreground"
            >
              Clear
            </Button>
          ) : null}

          <Button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !dirty}
            className="h-9 bg-[var(--brand)] hover:bg-[var(--brand)]/90"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
