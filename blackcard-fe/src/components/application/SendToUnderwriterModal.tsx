import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { toast } from "react-toastify";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  assignApplicationToUnderwriter,
  updateApplicationQueue,
} from "@/redux/actions/applicationActions";
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

const UNDERWRITER_ROLE_ID = "UNDERWRITER";
/** Select value for "leave it in the open Underwriter queue". */
const OPEN_QUEUE_VALUE = "__open_queue__";

type SendToUnderwriterModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  onSent?: () => void | Promise<void>;
};

/**
 * Super Admin approving at the scrubbing stage (a deal in Scrubbing, or a scrubber
 * decline awaiting review): records Recommend Approval and sends the deal to the
 * Underwriter queue, optionally assigned to one underwriter.
 */
export default function SendToUnderwriterModal({
  open,
  onOpenChange,
  applicationId,
  onSent,
}: SendToUnderwriterModalProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [selectedUnderwriterId, setSelectedUnderwriterId] = useState(OPEN_QUEUE_VALUE);
  const [isSending, setIsSending] = useState(false);

  const underwriters: User[] = useSelector(
    (state: RootState) => selectUsersByRole(state, UNDERWRITER_ROLE_ID),
    shallowEqual,
  );
  const underwritersLoading = useSelector((state: RootState) =>
    selectUsersLoadingByRole(state, UNDERWRITER_ROLE_ID),
  );

  useEffect(() => {
    if (!open) return;
    dispatch(fetchUsersByRole(UNDERWRITER_ROLE_ID));
    setSelectedUnderwriterId(OPEN_QUEUE_VALUE);
  }, [dispatch, open]);

  const resolveUserId = (user: User): string =>
    String(user._id ?? (user as { id?: string }).id ?? "");

  const sortedUnderwriters = useMemo(() => {
    return [...underwriters]
      .filter((u) => u.isActive !== false)
      .sort((a, b) => {
        const nameA = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase();
        const nameB = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [underwriters]);

  const handleSend = async () => {
    setIsSending(true);
    const toastId = toast.loading("Sending the deal to the Underwriter queue...");
    try {
      await dispatch(
        updateApplicationQueue({
          id: applicationId,
          data: {
            currentQueue: "Underwriter",
            scrubberRecommendation: "Recommend Approval",
          },
        }),
      ).unwrap();
      const underwriter = sortedUnderwriters.find(
        (u) => resolveUserId(u) === selectedUnderwriterId,
      );
      if (underwriter) {
        await dispatch(
          assignApplicationToUnderwriter({
            applicationId,
            underwriterId: resolveUserId(underwriter),
            underwriterEmail: underwriter.email || undefined,
          }),
        ).unwrap();
      }
      toast.update(toastId, {
        render: underwriter
          ? "Deal approved and assigned to the underwriter."
          : "Deal approved and sent to the Underwriter queue.",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
      onOpenChange(false);
      await onSent?.();
    } catch (err) {
      console.error("Failed to send the deal to the Underwriter queue:", err);
      toast.update(toastId, {
        render:
          typeof err === "string"
            ? err
            : "Failed to send the deal to the Underwriter. Please try again.",
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
          <DialogTitle>Approve and send to Underwriter</DialogTitle>
          <DialogDescription>
            The deal moves to the Underwriter queue as a scrubber approval. Pick an
            underwriter to assign it to, or leave it open for any underwriter to claim.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <span className="text-sm font-medium">Underwriter</span>
          <Select
            value={selectedUnderwriterId}
            onValueChange={setSelectedUnderwriterId}
            disabled={isSending}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Underwriter" />
            </SelectTrigger>
            <SelectContent
              className="z-[10060] max-h-72 rounded-xl"
              searchPlaceholder="Search underwriters..."
            >
              <SelectItem value={OPEN_QUEUE_VALUE} className="cursor-pointer">
                <span className="font-medium">Open Underwriter queue</span>
              </SelectItem>
              {underwritersLoading && sortedUnderwriters.length === 0 ? (
                <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                  Loading underwriters…
                </div>
              ) : (
                sortedUnderwriters.map((user) => {
                  const userId = resolveUserId(user);
                  const label =
                    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
                    user.email ||
                    "Underwriter";
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
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#16a34a] hover:bg-[#16a34a]/90 text-white"
            disabled={isSending}
            onClick={() => void handleSend()}
          >
            {isSending ? "Sending…" : "Send to Underwriter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
