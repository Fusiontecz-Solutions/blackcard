import { useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import { UploadCloud } from "lucide-react";

interface ContractTemplateModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called when the user confirms an uploaded template */
    onTemplateSelected?: (file: File) => void;
    /** Optional existing template name to show current selection */
    existingTemplateName?: string | null;
}

export default function ContractTemplateModal({
    open,
    onOpenChange,
    onTemplateSelected,
    existingTemplateName,
}: ContractTemplateModalProps) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        // Accept common contract template formats; backend can enforce stricter rules
        setSelectedFile(file);
    };

    const handleContinue = () => {
        if (selectedFile) {
            onTemplateSelected?.(selectedFile);
        }
        onOpenChange(false);
    };

    const handleClose = (nextOpen: boolean) => {
        if (!nextOpen) {
            // Reset local selection when closing
            setSelectedFile(null);
        }
        onOpenChange(nextOpen);
    };

    const displayName = selectedFile?.name ?? existingTemplateName ?? null;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className={isDark ? "text-gray-100" : "text-gray-900"}>
                        Upload Contract Template
                    </DialogTitle>
                    <DialogDescription className={isDark ? "text-gray-300" : "text-gray-600"}>
                        Upload the PDF that will be used as the contract template for this application.
                    </DialogDescription>
                </DialogHeader>

                <div
                    className={`mt-4 rounded-lg border-2 border-dashed px-4 py-6 flex flex-col items-center justify-center text-center cursor-pointer ${
                        isDark
                            ? "border-gray-600 bg-[#1F2933] hover:border-blue-400"
                            : "border-gray-300 bg-gray-50 hover:border-blue-500"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <UploadCloud
                        className={`h-10 w-10 mb-3 ${
                            isDark ? "text-blue-300" : "text-blue-500"
                        }`}
                    />
                    <p
                        className={`text-sm font-medium mb-1 ${
                            isDark ? "text-gray-100" : "text-gray-900"
                        }`}
                    >
                        Click to upload or drag and drop
                    </p>
                    <p className={`text-xs mb-3 ${isDark ? "text-gray-300" : "text-gray-500"}`}>
                        PDF files only.
                    </p>
                    {displayName ? (
                        <div
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
                                isDark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"
                            } shadow-sm`}
                        >
                            <span className="truncate max-w-[220px]">{displayName}</span>
                        </div>
                    ) : (
                        <span
                            className={`text-xs ${
                                isDark ? "text-gray-400" : "text-gray-400"
                            }`}
                        >
                            No file selected
                        </span>
                    )}
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                />

                <div className="flex justify-end gap-3 pt-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleClose(false)}
                        className={isDark ? "border-gray-600 text-gray-300 hover:bg-gray-800" : ""}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleContinue}
                        disabled={!selectedFile}
                        className="bg-[#3B8BD1] hover:bg-[#2d6fad] text-white"
                    >
                        Continue
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

