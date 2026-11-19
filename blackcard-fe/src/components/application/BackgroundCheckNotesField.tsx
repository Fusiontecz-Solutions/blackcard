import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  isStructuredBackgroundCheckNotes,
  stripStructuredNotesHtml,
} from "./backgroundCheckNotesHtml";

type BackgroundCheckNotesFieldProps = {
  notes: string;
  onNotesChange: (value: string) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
};

export default function BackgroundCheckNotesField({
  notes,
  onNotesChange,
  onPaste,
  placeholder = "What did you find? Add notes or paste a screenshot (Ctrl+V)...",
  className,
}: BackgroundCheckNotesFieldProps) {
  const structured = isStructuredBackgroundCheckNotes(notes);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!structured) {
      setEditing(false);
    }
  }, [structured, notes]);

  const handleEditAsPlainText = () => {
    onNotesChange(stripStructuredNotesHtml(notes));
    setEditing(true);
  };

  if (structured && !editing) {
    return (
      <div className={cn("mt-3", className)}>
        <div className="crm-bg-notes-preview rounded-lg border border-[#E5E7EB] bg-[#FAFBFC] p-3">
          <div
            className="crm-bg-notes-host"
            dangerouslySetInnerHTML={{ __html: notes }}
          />
        </div>
        <div className="mt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleEditAsPlainText}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            Edit as plain text
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mt-3", className)}>
      {structured && editing ? (
        <div className="mb-2 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
          <span>Editing notes as plain text</span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-1 font-medium hover:underline"
          >
            <X className="h-3 w-3" aria-hidden />
            Cancel
          </button>
        </div>
      ) : null}
      <Textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        onPaste={onPaste}
        placeholder={placeholder}
        className="min-h-[76px] resize-y border-[#E5E7EB] bg-[#FAFBFC] text-sm placeholder:text-[#9CA3AF]"
      />
    </div>
  );
}
