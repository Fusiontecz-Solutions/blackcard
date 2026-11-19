/**
 * Minimal PDF viewer for CLEAR lookup reports.
 *
 * Deliberately separate from the application's PDFViewerModal: that component
 * is built around contract review — signer tabs, prefill, envelope actions —
 * and opening it for a background-check report drags all of that along. A
 * report only needs to be read and saved.
 *
 * The PDF is rendered from an in-memory blob URL in an iframe, which uses the
 * browser's native viewer (zoom, page nav, text selection, print) without
 * pulling in a JS PDF renderer or a worker bundle.
 */
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ReportViewerModal({
  open,
  onOpenChange,
  fileUrl,
  fileName,
  onDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string | null;
  fileName: string;
  onDownload?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent defaults to max-w-lg; a report is unreadable that narrow. */}
      <DialogContent className="max-w-5xl gap-2 px-4 py-3">
        <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <DialogTitle className="truncate text-sm">{fileName}</DialogTitle>
            <DialogDescription className="text-[11px]">
              CLEAR report — held in memory only, not saved anywhere.
            </DialogDescription>
          </div>

          {/* DialogContent renders its own close button in the top-right corner,
              so this row holds the download action only. */}
          {onDownload && (
            <Button
              size="sm"
              variant="outline"
              className="mr-8 h-7 shrink-0"
              onClick={onDownload}
            >
              <Download className="mr-1 h-3.5 w-3.5" /> Download
            </Button>
          )}
        </DialogHeader>

        {fileUrl ? (
          <iframe
            src={fileUrl}
            title={fileName}
            className="h-[80vh] w-full rounded border border-[#E5E7EB] bg-white"
          />
        ) : (
          <p className="py-10 text-center text-sm text-[#6B7280]">No report to display.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
