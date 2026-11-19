import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Search } from "lucide-react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { toast } from "react-toastify";
import { useTheme } from "@/context/ThemeContext";
import type { AppDispatch, RootState } from "@/redux/store";
import {
    assignApplicationToUnderwriter,
    getApplicationById,
} from "@/redux/actions/applicationActions";
import { fetchUsersByRole } from "@/redux/actions/settingsUserActions";
import {
    selectUsersByRole,
    selectUsersLoadingByRole,
} from "@/redux/selectors/settingsUsersSelectors";
import type { User } from "@/types/userTypes";
import { isUnderwriterApprovedApplication } from "@/lib/underwriterApprovalLabel";
import ApprovedByUnderwriterBadge from "./ApprovedByUnderwriterBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const UNDERWRITER_ROLE_ID = "UNDERWRITER";

type SendApplicationToUnderwriterProps = {
    applicationId?: string | null;
    /** Super Admin: keep reassignment controls visible after underwriter approval. */
    allowReassignWhenApproved?: boolean;
};

export default function SendApplicationToUnderwriter({
    applicationId: applicationIdProp,
    allowReassignWhenApproved = false,
}: SendApplicationToUnderwriterProps) {
    const { applicationId: paramApplicationId } = useParams<{ applicationId: string }>();
    const dispatch = useDispatch<AppDispatch>();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const applicationData = useSelector((state: RootState) => state.applicationDetail.data);
    const applicationUuid =
        (applicationData as { _id?: string; id?: string })?._id ??
        (applicationData as { id?: string })?.id ??
        (applicationIdProp != null && String(applicationIdProp).trim() !== ""
            ? String(applicationIdProp).trim()
            : null);

    const isUnderwriterApproved = isUnderwriterApprovedApplication(
        (applicationData ?? null) as Record<string, unknown> | null,
    );
    const approvedAtRaw = (applicationData as { approvedAt?: string | null })?.approvedAt;
    const approvedAtLabel =
        approvedAtRaw && !Number.isNaN(Date.parse(approvedAtRaw))
            ? new Date(approvedAtRaw).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
              })
            : null;

    const [selectedUnderwriterId, setSelectedUnderwriterId] = useState("");
    const [underwriterSearch, setUnderwriterSearch] = useState("");
    const [isAssigningUnderwriter, setIsAssigningUnderwriter] = useState(false);

    const underwriters: User[] = useSelector(
        (state: RootState) => selectUsersByRole(state, UNDERWRITER_ROLE_ID),
        shallowEqual,
    );
    const underwritersLoading = useSelector((state: RootState) =>
        selectUsersLoadingByRole(state, UNDERWRITER_ROLE_ID),
    );

    useEffect(() => {
        dispatch(fetchUsersByRole(UNDERWRITER_ROLE_ID));
    }, [dispatch]);

    useEffect(() => {
        setSelectedUnderwriterId("");
        setUnderwriterSearch("");
    }, [applicationUuid]);

    const sortedUnderwriters = useMemo(() => {
        return [...underwriters]
            .filter((u) => u.isActive !== false)
            .sort((a, b) => {
                const nameA = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase();
                const nameB = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase();
                return nameA.localeCompare(nameB);
            });
    }, [underwriters]);

    const filteredUnderwriters = useMemo(() => {
        const q = underwriterSearch.trim().toLowerCase();
        if (!q) return sortedUnderwriters;
        return sortedUnderwriters.filter((u) => {
            const name = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
            const email = String(u.email || "").toLowerCase();
            return name.includes(q) || email.includes(q);
        });
    }, [sortedUnderwriters, underwriterSearch]);

    const resolveUserId = (user: User): string =>
        String(user._id ?? (user as { id?: string }).id ?? "");

    const handleAssignToUnderwriter = async () => {
        if (!applicationUuid) {
            toast.error("Missing application id. Please reload and try again.");
            return;
        }
        if (!selectedUnderwriterId) {
            toast.error("Please select an Underwriter.");
            return;
        }
        setIsAssigningUnderwriter(true);
        const toastId = toast.loading("Sending application to Underwriter...");
        try {
            await dispatch(
                assignApplicationToUnderwriter({
                    applicationId: applicationUuid,
                    underwriterId: selectedUnderwriterId,
                }),
            ).unwrap();
            await dispatch(getApplicationById(paramApplicationId ?? applicationUuid));
            toast.update(toastId, {
                render: "Application sent to Underwriter and they have been notified.",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });
        } catch (err) {
            console.error("Failed to assign application to Underwriter:", err);
            toast.update(toastId, {
                render:
                    typeof err === "string"
                        ? err
                        : "Failed to send application to Underwriter. Please try again.",
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setIsAssigningUnderwriter(false);
        }
    };

    const showAssignControls =
        !isUnderwriterApproved ||
        (isUnderwriterApproved && allowReassignWhenApproved);
    const assignButtonLabel = isUnderwriterApproved
        ? "Send application to another Underwriter"
        : "Send application to Underwriter";
    const assignHelpText = isUnderwriterApproved
        ? "Reassign this application to a different Underwriter. They will be notified in their notification panel."
        : "Choose an Underwriter to receive this application. They will be notified in their notification panel.";

    return (
        <div
            className={`overflow-hidden rounded-2xl border shadow-md ${
                isDark
                    ? "border-slate-700 bg-[#141517]"
                    : "border-slate-200 bg-white"
            }`}
        >
            <div
                className={`px-5 py-3 font-bold text-base tracking-wide ${
                    isDark ? "bg-[#1e293b] text-slate-100" : "bg-[#F9FAFD] text-[#374151]"
                }`}
            >
                {isUnderwriterApproved ? "Underwriter Approval" : "Send to Underwriter"}
            </div>
            {isUnderwriterApproved ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                    <ApprovedByUnderwriterBadge
                        app={
                            (applicationData ?? {}) as Parameters<
                                typeof ApprovedByUnderwriterBadge
                            >[0]["app"]
                        }
                        fallback="an underwriter"
                    />
                    {approvedAtLabel ? (
                        <span
                            className={`text-xs ${isDark ? "text-gray-400" : "text-[#6B7280]"}`}
                        >
                            {approvedAtLabel}
                        </span>
                    ) : null}
                </div>
            ) : null}
            {showAssignControls ? (
            <div
                className={cn(
                    "flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-end",
                    isUnderwriterApproved
                        ? "border-t border-slate-200 dark:border-slate-700"
                        : "border-t border-slate-200 dark:border-slate-700",
                )}
            >
                <div className="min-w-0 flex-1 space-y-2">
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-[#6B7280]"}`}>
                        {assignHelpText}
                    </p>
                    <Select
                        value={selectedUnderwriterId || undefined}
                        onValueChange={setSelectedUnderwriterId}
                        onOpenChange={(open: boolean) => {
                            if (!open) setUnderwriterSearch("");
                        }}
                        disabled={isAssigningUnderwriter || underwritersLoading}
                    >
                        <SelectTrigger
                            className={cn(
                                "h-10 w-full rounded-lg border text-sm",
                                isDark
                                    ? "border-zinc-800 bg-zinc-950/40 text-zinc-200"
                                    : "border-slate-200 bg-slate-50/50 text-slate-700",
                            )}
                        >
                            <SelectValue
                                placeholder={
                                    underwritersLoading && sortedUnderwriters.length === 0
                                        ? "Loading underwriters…"
                                        : "Select Underwriter"
                                }
                            />
                        </SelectTrigger>
                        <SelectContent className="z-[10060] max-h-72 rounded-xl">
                            <div
                                className={cn(
                                    "sticky top-0 z-10 -mx-1 -mt-1 mb-1 px-2 pb-2 pt-2",
                                    isDark ? "bg-[#141517]" : "bg-white",
                                )}
                            >
                                <div className="relative">
                                    <Search
                                        className={cn(
                                            "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                                            isDark ? "text-zinc-500" : "text-slate-400",
                                        )}
                                        aria-hidden
                                    />
                                    <input
                                        type="text"
                                        value={underwriterSearch}
                                        onChange={(e) => setUnderwriterSearch(e.target.value)}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        placeholder="Search underwriters..."
                                        className={cn(
                                            "h-9 w-full rounded-lg border pl-9 pr-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500/20",
                                            isDark
                                                ? "border-zinc-800 bg-zinc-950/40 text-zinc-200 placeholder:text-zinc-500"
                                                : "border-slate-200 bg-slate-50/50 text-slate-700 placeholder:text-slate-400",
                                        )}
                                    />
                                </div>
                            </div>
                            {filteredUnderwriters.length === 0 ? (
                                <div
                                    className={cn(
                                        "px-2 py-6 text-center text-sm",
                                        isDark ? "text-zinc-500" : "text-slate-400",
                                    )}
                                >
                                    No underwriters found
                                </div>
                            ) : (
                                filteredUnderwriters.map((user) => {
                                    const userId = resolveUserId(user);
                                    const label =
                                        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
                                        user.email ||
                                        "Underwriter";
                                    return (
                                        <SelectItem
                                            key={userId}
                                            value={userId}
                                            className="cursor-pointer rounded-md py-2 text-sm my-0.5"
                                        >
                                            <span className="font-medium">{label}</span>
                                            {user.email ? (
                                                <span className="opacity-60 font-normal">
                                                    {" "}
                                                    — {user.email}
                                                </span>
                                            ) : null}
                                        </SelectItem>
                                    );
                                })
                            )}
                        </SelectContent>
                    </Select>
                </div>
                <Button
                    type="button"
                    className="w-full shrink-0 bg-[image:var(--brand-gradient)] hover:opacity-90 text-white sm:w-auto sm:min-w-[220px]"
                    disabled={!selectedUnderwriterId || isAssigningUnderwriter}
                    onClick={() => void handleAssignToUnderwriter()}
                >
                    {isAssigningUnderwriter ? "Sending…" : assignButtonLabel}
                </Button>
            </div>
            ) : null}
        </div>
    );
}
