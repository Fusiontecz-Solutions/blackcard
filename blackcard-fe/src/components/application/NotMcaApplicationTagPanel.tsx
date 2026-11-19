import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import type { AppDispatch, RootState } from "@/redux/store";
import {
    getApplicationById,
    updateApplication,
    updateApplicationQueue,
} from "@/redux/actions/applicationActions";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "@/context/ThemeContext";
import {
    normalizeRoleKey,
    resolveEffectiveRole,
} from "@/lib/sessionRole";
import {
    FAKE_APPLICATION_QUEUE,
    NOT_A_APPLICATION_LABEL,
    canUseNotAApplicationTag,
    isNotMcaApplication,
} from "@/lib/notMcaApplication";
import { invalidateUnderwriterPipelineCounts } from "@/lib/underwriterPipelineCounts";
import { invalidateNotAApplicationCount } from "@/lib/notAApplicationCounts";
import { invalidateDeclinePipelineCounts } from "@/lib/declinePipelineCounts";

function actionErrorMessage(err: unknown, fallback: string): string {
    if (typeof err === "string" && err.trim()) return err.trim();
    if (err && typeof err === "object") {
        const message = (err as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) return message.trim();
    }
    return fallback;
}

/**
 * Tags a deal as not a real MCA application by writing `currentQueue`
 * (`fake Application`) on the application row.
 */
export default function NotMcaApplicationTagPanel() {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const { applicationId: paramApplicationId } = useParams<{ applicationId: string }>();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const loginUser = useSelector((state: RootState) => state.login.data?.user);
    const viewerRoleKey = normalizeRoleKey(
        resolveEffectiveRole({ role: loginUser?.role }),
    );
    const applicationData = useSelector(
        (state: RootState) => state.applicationDetail.data,
    );
    const applicationUuid =
        (applicationData as { _id?: string; id?: string } | null)?._id ??
        (applicationData as { id?: string } | null)?.id ??
        null;

    const isTagged = isNotMcaApplication(
        (applicationData ?? null) as Parameters<typeof isNotMcaApplication>[0],
    );
    const canTagAsNotMca = canUseNotAApplicationTag(viewerRoleKey);
    const canTag = !isTagged && canTagAsNotMca;
    const showPanel = canTagAsNotMca;

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [tagging, setTagging] = useState(false);

    const helperText = useMemo(
        () =>
            isTagged
                ? `This deal is tagged as not a real MCA application. Super Admin can review it under ${NOT_A_APPLICATION_LABEL}.`
                : "Tag this deal when it is not a real MCA application (for example over-attachment). Status is saved as fake Application.",
        [isTagged],
    );

    if (!showPanel) return null;

    const openConfirm = () => {
        if (!canTag || tagging) return;
        setConfirmOpen(true);
    };

    const persistFakeApplication = async (id: string) => {
        try {
            await dispatch(
                updateApplicationQueue({
                    id,
                    data: { currentQueue: FAKE_APPLICATION_QUEUE },
                }),
            ).unwrap();
        } catch {
            await dispatch(
                updateApplication({
                    id,
                    data: { currentQueue: FAKE_APPLICATION_QUEUE },
                }),
            ).unwrap();
        }
    };

    const handleTag = async () => {
        if (!applicationUuid) {
            toast.error("Missing application id. Please reload and try again.");
            return;
        }
        setTagging(true);
        const toastId = toast.loading("Updating application status...");
        try {
            await persistFakeApplication(applicationUuid);
            invalidateUnderwriterPipelineCounts();
            invalidateNotAApplicationCount();
            invalidateDeclinePipelineCounts();
            await dispatch(getApplicationById(paramApplicationId ?? applicationUuid));
            toast.update(toastId, {
                render: `Status set to ${FAKE_APPLICATION_QUEUE}. Super Admin can review it under ${NOT_A_APPLICATION_LABEL}.`,
                type: "success",
                isLoading: false,
                autoClose: 4000,
            });
            setConfirmOpen(false);
            if (viewerRoleKey === "SCRUBBING") {
                navigate("/applications");
            }
        } catch (err) {
            console.error("Failed to tag as not an MCA application:", err);
            toast.update(toastId, {
                render: actionErrorMessage(
                    err,
                    "Failed to update application status. Please try again.",
                ),
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setTagging(false);
        }
    };

    return (
        <>
            <div
                className={`mb-6 overflow-hidden rounded-xl border shadow-sm ${
                    isDark
                        ? "border-[#374151] bg-[#141517]"
                        : "border-[#FDFDFD] bg-white"
                }`}
            >
                <h2
                    className={`border-b px-4 py-3 text-base font-roboto font-[600] uppercase tracking-wide sm:px-5 ${
                        isDark
                            ? "border-[#374151] bg-[#2A2B2F] text-white"
                            : "border-slate-100 bg-[#F9FAFD] text-[#374151]"
                    }`}
                >
                    {NOT_A_APPLICATION_LABEL}
                </h2>
                <div className="px-4 py-3.5 sm:px-5 sm:py-4">
                    <div
                        role="checkbox"
                        aria-checked={isTagged}
                        tabIndex={canTag && !tagging ? 0 : -1}
                        onClick={openConfirm}
                        onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            openConfirm();
                        }}
                        className={`flex items-start gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                            canTag && !tagging
                                ? "cursor-pointer"
                                : "cursor-not-allowed opacity-80"
                        }`}
                    >
                        <Checkbox
                            id="overview-not-mca-application"
                            checked={isTagged}
                            disabled={!canTag || tagging}
                            onCheckedChange={(value: boolean | "indeterminate") => {
                                if (value === true) openConfirm();
                            }}
                            className="mt-0.5 pointer-events-none"
                        />
                        <span className="flex flex-col gap-1">
                            <span
                                className={`text-sm font-medium ${
                                    isDark ? "text-gray-100" : "text-[#374151]"
                                }`}
                            >
                                This is not an MCA application
                            </span>
                            <span
                                className={`text-xs ${
                                    isDark ? "text-gray-400" : "text-muted-foreground"
                                }`}
                            >
                                {helperText}
                            </span>
                        </span>
                    </div>
                </div>
            </div>

            <Dialog
                open={confirmOpen}
                onOpenChange={(open: boolean) => {
                    if (tagging) return;
                    setConfirmOpen(open);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Tag as not an MCA application?</DialogTitle>
                        <DialogDescription>
                            This updates the application status to {FAKE_APPLICATION_QUEUE}.
                            The deal leaves the live pipeline and Super Admin can review it
                            under {NOT_A_APPLICATION_LABEL}.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={tagging}
                            onClick={() => setConfirmOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={tagging}
                            onClick={() => void handleTag()}
                        >
                            {tagging ? "Saving…" : "Tag application"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
