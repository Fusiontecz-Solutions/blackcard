import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";
import { DocumentViewerPanel } from "@/components/documents/DocumentViewerPanel";
import { isPdfMimeOrName, resolveClientPreviewMime } from "@/lib/documentPreview";
import { cn } from "@/lib/utils";

interface PDFViewerDocsModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileUrl: string | null | undefined;
    fileName?: string | null | undefined;
    showPrintButton?: boolean;
    onSendToBoldSign?: (ccEmails: string[]) => void;
    prefillFieldsPreview?: Array<{ id: string; label?: string; value: string }>;
    onSendToDocusign?: (ccEmails: string[]) => void;
    /** Use direct Cloudinary URLs (e.g. public portal without auth). */
    preferDirectUrl?: boolean;
    /** Public document portal token — fetches inline preview without CRM login. */
    publicPortalToken?: string;
    mimeTypeHint?: string;
    overlayClassName?: string;
    contentClassName?: string;
}

const PDFViewerDocsModal = ({
    isOpen,
    onClose,
    fileUrl,
    fileName = "Document",
    showPrintButton = false,
    onSendToBoldSign,
    prefillFieldsPreview = [],
    onSendToDocusign,
    preferDirectUrl = false,
    publicPortalToken,
    mimeTypeHint,
    overlayClassName,
    contentClassName,
}: PDFViewerDocsModalProps) => {
    void onSendToBoldSign;
    void prefillFieldsPreview;
    void onSendToDocusign;

    const safeUrl = typeof fileUrl === "string" ? fileUrl.trim() : "";
    const isValidUrl = safeUrl !== "";
    const safeFileName =
        typeof fileName === "string" && fileName.trim() !== ""
            ? fileName.trim()
            : "Document Viewer";
    const mimeType = resolveClientPreviewMime(safeFileName, safeUrl, "", undefined, mimeTypeHint ?? "");
    const canPrint = showPrintButton && isPdfMimeOrName(mimeType, safeFileName);

    const handlePrint = () => {
        const printWindow = window.open(safeUrl, "_blank", "noopener,noreferrer");
        if (!printWindow) {
            toast.error("Popup blocked. Please allow popups to print the document.");
            return;
        }

        const triggerPrint = () => {
            try {
                printWindow.focus();
                printWindow.print();
            } catch {
                toast.error("Could not open print dialog.");
            }
        };

        printWindow.onload = triggerPrint;
        window.setTimeout(triggerPrint, 800);
    };

    if (!isOpen || !isValidUrl) return null;

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open: boolean) => {
                if (!open) onClose();
            }}
        >
            <DialogContent
                className={cn("flex h-[95vh] max-w-5xl flex-col p-0", contentClassName)}
                overlayClassName={overlayClassName}
            >
                <DialogHeader className="flex-row items-center justify-between space-y-0 p-3 pb-0">
                    <DialogTitle className="truncate pr-2 text-black dark:text-white">
                        {safeFileName}
                    </DialogTitle>
                    {canPrint ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handlePrint}
                            className="mr-8 h-8 w-8 shrink-0"
                            title="Print PDF"
                            aria-label="Print PDF"
                        >
                            <Printer className="h-4 w-4" aria-hidden />
                        </Button>
                    ) : null}
                </DialogHeader>

                <div className="relative m-3 min-h-0 flex-1 overflow-hidden">
                    <DocumentViewerPanel
                        fileUrl={safeUrl}
                        fileName={safeFileName}
                        className="h-full"
                        minHeightClassName="min-h-[calc(95vh-6rem)]"
                        preferDirectUrl={preferDirectUrl}
                        publicPortalToken={publicPortalToken}
                        mimeTypeHint={mimeTypeHint}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PDFViewerDocsModal;
