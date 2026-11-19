import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ProvideDetailsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    question: string;
    onSave: (details: string) => void;
    initialDetails?: string;
}

const ProvideDetailsModal = ({
    open,
    onOpenChange,
    question,
    onSave,
    initialDetails = "",
}: ProvideDetailsModalProps) => {
    const { control, handleSubmit, reset, watch } = useForm<{ details: string }>({
        defaultValues: {
            details: initialDetails,
        },
    });

    const detailsValue = watch("details");
    const characterCount = detailsValue?.length || 0;

    useEffect(() => {
        if (open) {
            reset({ details: initialDetails });
        }
    }, [open, initialDetails, reset]);

    const onSubmit = (data: { details: string }) => {
        if (data.details.trim().length > 0 && data.details.length <= 500) {
            onSave(data.details);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-semibold text-gray-900">
                        Provide Details
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    {/* Question Section */}
                    <div className="bg-red-50 border border-[#DC331D] rounded-lg p-4">
                        <p className="text-sm font-bold text-[#6C1B10] ">Question:</p>
                        <p className="text-sm text-black font-medium">{question}</p>
                    </div>

                    {/* Explanation Section */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-900">
                            Please provide detailed explanation *
                        </Label>
                        <Controller
                            name="details"
                            control={control}
                            rules={{ required: "Explanation is required" }}
                            render={({ field }) => (
                                <Textarea
                                    {...field}
                                    placeholder="Explain the situation, include dates, case numbers, amounts, or any relevant details.."
                                    className="min-h-[150px] resize-none border-gray-300 focus:border-gray-400 focus:ring-gray-400"
                                />
                            )}
                        />
                        <p className="text-sm text-gray-400 text-left">
                            {characterCount}/500 Characters
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className={`${
                                detailsValue && detailsValue.trim().length > 0 && characterCount <= 500
                                    ? "bg-red-600 text-white hover:bg-red-700"
                                    : "bg-gray-400 text-white hover:bg-gray-500"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            disabled={!detailsValue || detailsValue.trim().length === 0 || characterCount > 500}
                        >
                            Save Details
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default ProvideDetailsModal;

