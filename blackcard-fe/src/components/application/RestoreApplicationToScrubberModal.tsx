import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { toast } from "react-toastify";
import type { AppDispatch, RootState } from "@/redux/store";
import { restoreApplicationToScrubber } from "@/redux/actions/applicationActions";
import { fetchUsersByRole } from "@/redux/actions/settingsUserActions";
import {
  selectUsersByRole,
  selectUsersLoadingByRole,
} from "@/redux/selectors/settingsUsersSelectors";
import type { User } from "@/types/userTypes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SCRUBBING_ROLE_ID = "SCRUBBING";

type RestoreApplicationToScrubberModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationIds: string[];
  onRestored?: () => void;
};

export default function RestoreApplicationToScrubberModal({
  open,
  onOpenChange,
  applicationIds,
  onRestored,
}: RestoreApplicationToScrubberModalProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [selectedScrubberId, setSelectedScrubberId] = useState("");
  const [scrubberSearch, setScrubberSearch] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);

  const scrubbers: User[] = useSelector(
    (state: RootState) => selectUsersByRole(state, SCRUBBING_ROLE_ID),
    shallowEqual,
  );
  const scrubbersLoading = useSelector((state: RootState) =>
    selectUsersLoadingByRole(state, SCRUBBING_ROLE_ID),
  );

  useEffect(() => {
    if (!open) return;
    dispatch(fetchUsersByRole(SCRUBBING_ROLE_ID));
    setSelectedScrubberId("");
    setScrubberSearch("");
  }, [dispatch, open]);

  const sortedScrubbers = useMemo(() => {
    return [...scrubbers]
      .filter((u) => u.isActive !== false)
      .sort((a, b) => {
        const nameA = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase();
        const nameB = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [scrubbers]);

  const filteredScrubbers = useMemo(() => {
    const q = scrubberSearch.trim().toLowerCase();
    if (!q) return sortedScrubbers;
    return sortedScrubbers.filter((u) => {
      const name = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
      const email = String(u.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [sortedScrubbers, scrubberSearch]);

  const resolveUserId = (user: User): string =>
    String(user._id ?? (user as { id?: string }).id ?? "");

  const handleRestore = async () => {
    const ids = applicationIds.filter((id) => id.trim().length > 0);
    if (ids.length === 0) {
      toast.error("No applications selected.");
      return;
    }
    if (!selectedScrubberId) {
      toast.error("Please select a scrubber.");
      return;
    }

    setIsRestoring(true);
    const toastId = toast.loading(
      ids.length === 1
        ? "Restoring application to scrubber..."
        : `Restoring ${ids.length} applications to scrubber...`,
    );
    try {
      await Promise.all(
        ids.map((applicationId) =>
          dispatch(
            restoreApplicationToScrubber({
              applicationId,
              scrubberId: selectedScrubberId,
            }),
          ).unwrap(),
        ),
      );
      toast.update(toastId, {
        render:
          ids.length === 1
            ? "Application restored and assigned to the scrubber's claimed list."
            : `${ids.length} applications restored and assigned to the scrubber's claimed list.`,
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
      onOpenChange(false);
      onRestored?.();
    } catch (err) {
      console.error("Failed to restore application(s) to scrubber:", err);
      toast.update(toastId, {
        render:
          typeof err === "string"
            ? err
            : "Failed to restore application(s). Please try again.",
        type: "error",
        isLoading: false,
        autoClose: 4000,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const countLabel =
    applicationIds.length === 1
      ? "1 application"
      : `${applicationIds.length} applications`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revert to Scrubber</DialogTitle>
          <DialogDescription>
            Choose a scrubber to receive {countLabel}. The deal(s) will appear in
            that scrubber&apos;s Claimed list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Select
            value={selectedScrubberId || undefined}
            onValueChange={setSelectedScrubberId}
            onOpenChange={(nextOpen: boolean) => {
              if (!nextOpen) setScrubberSearch("");
            }}
            disabled={isRestoring || scrubbersLoading}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue
                placeholder={
                  scrubbersLoading && sortedScrubbers.length === 0
                    ? "Loading scrubbers…"
                    : "Select scrubber"
                }
              />
            </SelectTrigger>
            <SelectContent className="z-[10060] max-h-72 rounded-xl">
              <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 px-2 pb-2 pt-2 bg-popover">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <input
                    type="text"
                    value={scrubberSearch}
                    onChange={(e) => setScrubberSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Search scrubbers..."
                    className={cn(
                      "h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none",
                    )}
                  />
                </div>
              </div>
              {filteredScrubbers.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No scrubbers found
                </div>
              ) : (
                filteredScrubbers.map((user) => {
                  const userId = resolveUserId(user);
                  const label =
                    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
                    user.email ||
                    "Scrubber";
                  return (
                    <SelectItem key={userId} value={userId} className="cursor-pointer">
                      <span className="font-medium">{label}</span>
                      {user.email ? (
                        <span className="opacity-60 font-normal"> — {user.email}</span>
                      ) : null}
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRestoring}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white"
            disabled={!selectedScrubberId || isRestoring}
            onClick={() => void handleRestore()}
          >
            {isRestoring ? "Sending…" : "Send to Scrubber"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
