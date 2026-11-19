import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { toast } from "react-toastify";
import type { AppDispatch, RootState } from "@/redux/store";
import { returnApplicationToScrubber } from "@/redux/actions/applicationActions";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

const SCRUBBING_ROLE_ID = "SCRUBBING";

/** Common reasons an underwriter cannot decide and needs the file corrected. */
export const RETURN_TO_SCRUBBER_REASONS = [
  "Bank statements incomplete or wrong months",
  "Positions do not match the bank statements",
  "Missing stips from the ISO",
  "Documents illegible or unreadable",
  "Offer / deal figures need correction",
  "Other",
] as const;

type SendBackToScrubberModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  /** Scrubber who scrubbed the deal — pre-selected when known. */
  defaultScrubberId?: string | null;
  /**
   * That scrubber's email. On Super Admin the deal carries the book's user id,
   * which never matches a Super Admin user id, so email is the reliable match.
   */
  defaultScrubberEmail?: string | null;
  onSent?: () => void;
};

export default function SendBackToScrubberModal({
  open,
  onOpenChange,
  applicationId,
  defaultScrubberId,
  defaultScrubberEmail,
  onSent,
}: SendBackToScrubberModalProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [selectedScrubberId, setSelectedScrubberId] = useState("");
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [isSending, setIsSending] = useState(false);

  const scrubbers: User[] = useSelector(
    (state: RootState) => selectUsersByRole(state, SCRUBBING_ROLE_ID),
    shallowEqual,
  );
  const scrubbersLoading = useSelector((state: RootState) =>
    selectUsersLoadingByRole(state, SCRUBBING_ROLE_ID),
  );

  /** Pre-selection runs once per open, so it never overrides a manual choice. */
  const didPreselect = useRef(false);

  useEffect(() => {
    if (!open) {
      didPreselect.current = false;
      return;
    }
    dispatch(fetchUsersByRole(SCRUBBING_ROLE_ID));
    setSelectedScrubberId("");
    setSelectedReasons([]);
    setNote("");
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

  const resolveUserId = (user: User): string =>
    String(user._id ?? (user as { id?: string }).id ?? "");

  /**
   * On Super Admin the selected id belongs to the Super Admin database, which the
   * book cannot resolve. Send the email too so the book can match on that.
   */
  const selectedScrubberEmail = useMemo(() => {
    const match = sortedScrubbers.find(
      (u) => resolveUserId(u) === selectedScrubberId,
    );
    return String(match?.email ?? "").trim();
  }, [sortedScrubbers, selectedScrubberId]);

  // Match the deal's scrubber against the loaded list: by email first (works on
  // Super Admin, where the deal carries the book's user id), then by id.
  useEffect(() => {
    if (!open || didPreselect.current) return;
    if (sortedScrubbers.length === 0) return;

    const wantedEmail = String(defaultScrubberEmail ?? "").trim().toLowerCase();
    const wantedId = String(defaultScrubberId ?? "").trim();
    const match =
      (wantedEmail
        ? sortedScrubbers.find(
            (u) => String(u.email || "").trim().toLowerCase() === wantedEmail,
          )
        : undefined) ??
      (wantedId
        ? sortedScrubbers.find((u) => resolveUserId(u) === wantedId)
        : undefined);

    didPreselect.current = true;
    if (match) setSelectedScrubberId(resolveUserId(match));
  }, [open, sortedScrubbers, defaultScrubberEmail, defaultScrubberId]);

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason],
    );
  };

  const handleSend = async () => {
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      toast.error("Please describe what the scrubber needs to correct.");
      return;
    }

    setIsSending(true);
    const toastId = toast.loading("Sending the deal back to the scrubber...");
    try {
      await dispatch(
        returnApplicationToScrubber({
          applicationId,
          scrubberId: selectedScrubberId || undefined,
          scrubberEmail: selectedScrubberEmail || undefined,
          reasons: selectedReasons,
          note: trimmedNote,
        }),
      ).unwrap();
      toast.update(toastId, {
        render: "Deal sent back to the scrubber for correction.",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      console.error("Failed to send the deal back to the scrubber:", err);
      toast.update(toastId, {
        render:
          typeof err === "string"
            ? err
            : "Failed to send the deal back. Please try again.",
        type: "error",
        isLoading: false,
        autoClose: 4000,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send back to Scrubber</DialogTitle>
          <DialogDescription>
            Return this deal for correction. It goes back to the scrubber&apos;s
            Claimed list, and returns to you once they resend it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">Scrubber</span>
            <Select
              value={selectedScrubberId || undefined}
              onValueChange={setSelectedScrubberId}
              disabled={isSending || scrubbersLoading}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue
                  placeholder={
                    scrubbersLoading && sortedScrubbers.length === 0
                      ? "Loading scrubbers…"
                      : "Scrubber who scrubbed this deal"
                  }
                />
              </SelectTrigger>
              <SelectContent
                className="z-[10060] max-h-72 rounded-xl"
                searchPlaceholder="Search scrubbers..."
              >
                {sortedScrubbers.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No scrubbers found
                  </div>
                ) : (
                  sortedScrubbers.map((user) => {
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

          <div className="space-y-2">
            <span className="text-sm font-medium">What needs fixing</span>
            <div className="space-y-2 rounded-lg border border-input p-3">
              {RETURN_TO_SCRUBBER_REASONS.map((reason) => (
                <label
                  key={reason}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={selectedReasons.includes(reason)}
                    onCheckedChange={() => toggleReason(reason)}
                    disabled={isSending}
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">
              Note to the scrubber <span className="text-destructive">*</span>
            </span>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe exactly what must be corrected before this deal can be underwritten."
              rows={4}
              disabled={isSending}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#EAA95A] hover:bg-[#EAA95A]/90 text-white"
            disabled={!note.trim() || isSending}
            onClick={() => void handleSend()}
          >
            {isSending ? "Sending…" : "Send to Scrubber"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
