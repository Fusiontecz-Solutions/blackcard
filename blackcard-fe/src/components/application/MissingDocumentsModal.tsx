import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import type { AppDispatch } from "@/redux/store";
import { flagApplicationMissingDocuments } from "@/redux/actions/applicationActions";
import { DOCUMENT_REQUEST_OPTIONS } from "@/constants/documentRequestTypes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { parseMissingDocumentsFromNote } from "@/lib/missingDocuments";

type MissingDocumentsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  /** Deal note: an existing MISSING_DOCUMENTS marker pre-selects the earlier list. */
  existingNote?: string | null;
  onSent?: () => void;
};

/**
 * Scrubber: flag the deal as Missing Documents. The deal leaves the scrubbing
 * pool and Super Admin is emailed the list.
 */
export default function MissingDocumentsModal({
  open,
  onOpenChange,
  applicationId,
  existingNote,
  onSent,
}: MissingDocumentsModalProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [otherDocuments, setOtherDocuments] = useState("");
  const [isSending, setIsSending] = useState(false);

  const existingDocuments = parseMissingDocumentsFromNote(existingNote);
  const isUpdate = existingDocuments.length > 0;

  useEffect(() => {
    if (!open) return;
    // Re-opening on a deal already in Missing Documents starts from the earlier list,
    // so the scrubber only adds what is new.
    const known = new Set<string>(DOCUMENT_REQUEST_OPTIONS.map((o) => o.label));
    setSelectedDocuments(existingDocuments.filter((d) => known.has(d)));
    setOtherDocuments(existingDocuments.filter((d) => !known.has(d)).join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingNote]);

  const toggleDocument = (label: string) => {
    setSelectedDocuments((prev) =>
      prev.includes(label) ? prev.filter((d) => d !== label) : [...prev, label],
    );
  };

  const canSubmit = selectedDocuments.length > 0 || otherDocuments.trim().length > 0;

  const handleSend = async () => {
    if (!canSubmit) {
      toast.error("Select at least one document or describe what is missing.");
      return;
    }

    setIsSending(true);
    const toastId = toast.loading("Moving the deal to Missing Documents...");
    try {
      await dispatch(
        flagApplicationMissingDocuments({
          applicationId,
          documents: selectedDocuments,
          otherDocuments: otherDocuments.trim() || undefined,
        }),
      ).unwrap();
      toast.update(toastId, {
        render: isUpdate
          ? "Missing documents updated. Super Admin has been notified."
          : "Deal moved to Missing Documents. Super Admin has been notified.",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      console.error("Failed to flag missing documents:", err);
      toast.update(toastId, {
        render:
          typeof err === "string"
            ? err
            : "Failed to flag missing documents. Please try again.",
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
          <DialogTitle>Missing Documents</DialogTitle>
          <DialogDescription className="sr-only">
            Select the documents this deal is missing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">Documents</span>
            <div className="space-y-2 rounded-lg border border-input p-3">
              {DOCUMENT_REQUEST_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={selectedDocuments.includes(option.label)}
                    onCheckedChange={() => toggleDocument(option.label)}
                    disabled={isSending}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Other documents not in the list</span>
            <Textarea
              value={otherDocuments}
              onChange={(e) => setOtherDocuments(e.target.value)}
              placeholder="Describe any other missing documents."
              rows={3}
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
            disabled={!canSubmit || isSending}
            onClick={() => void handleSend()}
          >
            {isSending ? "Sending…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
