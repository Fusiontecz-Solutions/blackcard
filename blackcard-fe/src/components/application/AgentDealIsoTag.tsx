import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/context/ThemeContext";
import type { AppDispatch, RootState } from "@/redux/store";
import { getIsos, updateIso } from "@/redux/actions/isoActions";
import { updateApplication } from "@/redux/actions/applicationActions";
import { toast } from "react-toastify";
import { Check, Loader2, Mail, Pencil, PhoneCall, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIsoDisplayLabel } from "@/lib/isoDisplayLabel";
import { formatUSPhoneNumber } from "@/utils/formatPhoneNumber";
import { axiosGet } from "@/redux/axios";

const EMPTY_FIELD = "—";

function formatIsoPhoneDisplay(phone: string): string {
    const trimmed = phone.trim();
    if (!trimmed) return EMPTY_FIELD;
    return formatUSPhoneNumber(trimmed) || trimmed;
}

function isoInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    }
    const single = parts[0] ?? name.trim();
    return single.slice(0, 2).toUpperCase() || "ISO";
}

type AgentDealIsoTagProps = {
    applicationId?: string | null;
    alwaysEditable?: boolean;
    /** Tighter vertical layout for dialogs (e.g. Approved Application modal). */
    variant?: "default" | "compact";
    /** Side-by-side with bank details on the overview grid. */
    splitLayout?: boolean;
    className?: string;
};

export default function AgentDealIsoTag({
    applicationId,
    alwaysEditable = true,
    variant = "default",
    splitLayout = false,
    className,
}: AgentDealIsoTagProps) {
    const isCompact = variant === "compact";
    const dispatch = useDispatch<AppDispatch>();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    
    const { loading: fetchLoading, data: applicationData } = useSelector(
        (state: RootState) => state.applicationDetail,
    );

    const normalizedApplicationId =
        applicationId === null || applicationId === undefined ? null : String(applicationId);

    const dataApplicationId = (applicationData as { applicationId?: unknown })?.applicationId;
    const dataId = (applicationData as { _id?: unknown })?._id;

    const appIdMatch =
        !normalizedApplicationId || !applicationData
            ? true
            : String(dataId ?? "") === normalizedApplicationId ||
              String(dataApplicationId ?? "") === normalizedApplicationId;

    const showDynamicData = appIdMatch && Boolean(applicationData);

    const hasIso = useMemo(() => {
        if (!showDynamicData || !applicationData) return false;
        const row = applicationData as unknown as Record<string, unknown>;
        const iso = row.iso as Record<string, unknown> | null | undefined;
        const isoIdRaw = row.isoId;
        const isoTagged =
            iso &&
            typeof iso === "object" &&
            Boolean(
                (typeof iso.name === "string" && iso.name.trim()) ||
                    (typeof iso.email === "string" && iso.email.trim()) ||
                    iso.id ||
                    iso._id,
            );
        const rawId =
            isoIdRaw != null && String(isoIdRaw).trim() !== "" ? String(isoIdRaw).trim() : "";
        return isoTagged || rawId.length > 0;
    }, [showDynamicData, applicationData]);

    const linkedIsoId = useMemo(() => {
        if (!showDynamicData || !applicationData) return "";
        const row = applicationData as unknown as Record<string, unknown>;
        const iso = row.iso as Record<string, unknown> | null | undefined;
        if (iso && typeof iso === "object") {
            if (iso.id != null && String(iso.id).trim()) return String(iso.id).trim();
            if (iso._id != null && String(iso._id).trim()) return String(iso._id).trim();
        }
        const isoIdRaw = row.isoId;
        return isoIdRaw != null && String(isoIdRaw).trim() !== "" ? String(isoIdRaw).trim() : "";
    }, [showDynamicData, applicationData]);

    const appRow = applicationData as unknown as Record<string, unknown> | null;
    const targetApplicationId = String(
        normalizedApplicationId ||
            (appRow?.id as string | undefined) ||
            (appRow?._id as string | undefined) ||
            (appRow != null && appRow.applicationId != null
                ? String(appRow.applicationId)
                : "") ||
            "",
    );

    const { list: isoList, listLoading: isoListLoading, listError: isoListError } = useSelector(
        (state: RootState) => state.iso,
    );
    const [taggingIso, setTaggingIso] = useState(false);
    const [savingEmail, setSavingEmail] = useState(false);
    const taggingIsoRef = useRef(false);
    const [emailDraft, setEmailDraft] = useState("");
    const [editingEmail, setEditingEmail] = useState(false);
    const [isoSearch, setIsoSearch] = useState("");
    const [submissionFrom, setSubmissionFrom] = useState<string[]>([]);
    const [submissionCc, setSubmissionCc] = useState<string[]>([]);

    useEffect(() => {
        if (!showDynamicData) return;
        void dispatch(getIsos());
    }, [dispatch, showDynamicData]);

    useEffect(() => {
        if (!targetApplicationId) {
            setSubmissionFrom([]);
            setSubmissionCc([]);
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const res = await axiosGet(
                    `/applications/${encodeURIComponent(targetApplicationId)}/submission-mail-participants`,
                );
                const data = (res?.data?.data ?? res?.data) as {
                    available?: boolean;
                    from?: string[];
                    cc?: string[];
                } | null;
                if (cancelled) return;
                if (data?.available) {
                    setSubmissionFrom(Array.isArray(data.from) ? data.from : []);
                    setSubmissionCc(Array.isArray(data.cc) ? data.cc : []);
                } else {
                    setSubmissionFrom([]);
                    setSubmissionCc([]);
                }
            } catch {
                if (!cancelled) {
                    setSubmissionFrom([]);
                    setSubmissionCc([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [targetApplicationId]);

    const sortedIsos = useMemo(() => {
        return [...isoList].sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""), undefined, {
                sensitivity: "base",
            }),
        );
    }, [isoList]);

    const filteredIsos = useMemo(() => {
        const q = isoSearch.trim().toLowerCase();
        if (!q) return sortedIsos;
        return sortedIsos.filter(
            (iso) =>
                String(iso.name || "").toLowerCase().includes(q) ||
                String(iso.email || "").toLowerCase().includes(q) ||
                formatIsoDisplayLabel(iso).toLowerCase().includes(q),
        );
    }, [sortedIsos, isoSearch]);

    const linkedIso = useMemo(() => {
        if (!showDynamicData || !applicationData) return { name: "", email: "", phone: "" };
        const row = applicationData as unknown as Record<string, unknown>;
        let name = "";
        let email = "";
        let phone = "";
        if (row.iso && typeof row.iso === "object") {
            const iso = row.iso as Record<string, unknown>;
            name = typeof iso.name === "string" ? iso.name.trim() : "";
            email = typeof iso.email === "string" ? iso.email.trim() : "";
            phone = typeof iso.phone === "string" ? iso.phone.trim() : "";
        }
        const isoIdForList =
            linkedIsoId ||
            (row.iso && typeof row.iso === "object"
                ? String(
                      (row.iso as Record<string, unknown>).id ??
                          (row.iso as Record<string, unknown>)._id ??
                          "",
                  ).trim()
                : row.isoId != null
                  ? String(row.isoId).trim()
                  : "");
        if (isoIdForList) {
            const fromList = isoList.find((item) => item.id === isoIdForList);
            if (fromList) {
                if (!name) name = String(fromList.name || "").trim();
                if (!email) email = String(fromList.email || "").trim();
                if (!phone) phone = String(fromList.phone || "").trim();
            }
        }
        return { name, email, phone };
    }, [applicationData, showDynamicData, isoList, linkedIsoId]);

    const isApprovedByIso = useMemo(() => {
        if (!showDynamicData || !applicationData) return false;
        const row = applicationData as unknown as Record<string, unknown>;
        const queue = String(row.currentQueue ?? row.queue ?? "").trim();
        const state = String(row.currentState ?? row.state ?? "").trim();
        const normalize = (v: string) => v.toLowerCase().replace(/[_\s]+/g, " ").trim();
        return normalize(queue) === "contract pending" || normalize(state) === "contract pending";
    }, [showDynamicData, applicationData]);

    useEffect(() => {
        setEmailDraft(linkedIso.email);
        setEditingEmail(false);
    }, [linkedIso.email, linkedIsoId]);

    const handlePickIso = useCallback(
        async (isoId: string) => {
            if (!isoId?.trim() || !targetApplicationId) return;
            if (taggingIsoRef.current) return;
            if (hasIso && isoId.trim() === linkedIsoId) return;

            taggingIsoRef.current = true;
            setTaggingIso(true);
            try {
                await dispatch(
                    updateApplication({
                        id: targetApplicationId,
                        data: { isoId: isoId.trim() },
                    }),
                ).unwrap();
                toast.success(hasIso ? "ISO updated successfully." : "ISO linked successfully.");
            } catch (err: unknown) {
                const msg =
                    typeof err === "string"
                        ? err
                        : err && typeof err === "object" && "message" in err
                          ? String((err as { message?: string }).message)
                          : "Failed to update ISO";
                toast.error(msg || "Failed to update ISO");
            } finally {
                taggingIsoRef.current = false;
                setTaggingIso(false);
            }
        },
        [dispatch, targetApplicationId, hasIso, linkedIsoId],
    );

    const handleSaveEmail = useCallback(async () => {
        const trimmed = emailDraft.trim();
        if (!linkedIsoId) {
            toast.error("Link an ISO before saving.");
            return;
        }
        if (!trimmed) {
            toast.error("ISO email is required.");
            return;
        }
        if (trimmed === linkedIso.email) return;

        setSavingEmail(true);
        try {
            await dispatch(
                updateIso({
                    id: linkedIsoId,
                    data: { email: trimmed },
                }),
            ).unwrap();
            toast.success("ISO email updated.");
            setEditingEmail(false);
        } catch (err: unknown) {
            const msg =
                typeof err === "string"
                    ? err
                    : err && typeof err === "object" && "message" in err
                      ? String((err as { message?: string }).message)
                      : "Failed to update ISO email";
            toast.error(msg || "Failed to update ISO email");
        } finally {
            setSavingEmail(false);
        }
    }, [dispatch, emailDraft, linkedIso.email, linkedIsoId]);

    if (!showDynamicData) return null;

    const controlsDisabled =
        !alwaysEditable ||
        taggingIso ||
        savingEmail ||
        !targetApplicationId ||
        (isoListLoading && sortedIsos.length === 0);

    const emailDirty = emailDraft.trim() !== linkedIso.email;
    const canSaveEmail =
        alwaysEditable &&
        hasIso &&
        linkedIsoId.length > 0 &&
        emailDirty &&
        emailDraft.trim().length > 0 &&
        !savingEmail;

    const shell = cn(
        "overflow-hidden rounded-xl border p-0 shadow-sm",
        splitLayout ? "mb-0 h-full" : isCompact ? "mb-0" : "mb-6",
        isDark
            ? "border-[#374151] bg-[#141517]"
            : "border-[#FDFDFD] bg-white",
        className,
    );

    const sectionTitle = fetchLoading
        ? "ISO Partner"
        : hasIso
          ? alwaysEditable && editingEmail
              ? "Edit ISO"
              : "Linked ISO"
          : alwaysEditable
            ? "Link ISO"
            : "ISO Partner";

    const headerBar = cn(
        "flex items-center gap-2 border-b font-roboto font-[600] uppercase tracking-wide",
        isCompact
            ? "px-4 py-2.5 text-xs sm:px-4"
            : "px-4 py-3 text-base sm:px-5",
        isDark
            ? "border-[#374151] bg-[#2A2B2F] text-white"
            : "border-slate-100 bg-[#F9FAFD] text-[#374151]",
    );

    const bodyPad = isCompact ? "px-4 py-3 sm:px-4" : "px-4 py-3.5 sm:px-5 sm:py-4";

    // Cleaned up Form Trigger Styles
    const selectTriggerClass = cn(
        "h-10 w-full min-w-[11rem] cursor-pointer rounded-lg border text-sm font-medium transition-all duration-200 focus:ring-2 focus:ring-blue-500/20",
        isDark
            ? "border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-950"
            : "border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300 hover:bg-white",
    );

    const clickAction = "cursor-pointer";

    const metaMuted = isDark ? "text-zinc-500" : "text-slate-400";
    const metaValue = isDark ? "text-zinc-300" : "text-slate-600";

    const isoSelect = (
        <Select
            disabled={controlsDisabled}
            value={hasIso && linkedIsoId ? linkedIsoId : undefined}
            onValueChange={(v: string) => void handlePickIso(v)}
            onOpenChange={(open: boolean) => {
                if (!open) setIsoSearch("");
            }}
        >
            <SelectTrigger size="sm" className={selectTriggerClass}>
                <SelectValue
                    placeholder={
                        isoListLoading && sortedIsos.length === 0
                            ? "Loading…"
                            : hasIso
                              ? "Change ISO partner"
                              : "Select ISO partner"
                    }
                >
                    {hasIso && linkedIsoId
                        ? "Change ISO partner"
                        : undefined}
                </SelectValue>
            </SelectTrigger>
            <SelectContent className="z-[10060] max-h-72 rounded-xl backdrop-blur-xl border border-blue-500/10 shadow-xl">
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
                            value={isoSearch}
                            onChange={(e) => setIsoSearch(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder="Search ISO partners..."
                            className={cn(
                                "h-9 w-full rounded-lg border pl-9 pr-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500/20",
                                isDark
                                    ? "border-zinc-800 bg-zinc-950/40 text-zinc-200 placeholder:text-zinc-500"
                                    : "border-slate-200 bg-slate-50/50 text-slate-700 placeholder:text-slate-400",
                            )}
                        />
                    </div>
                </div>
                {filteredIsos.length === 0 ? (
                    <div className={cn("px-2 py-6 text-center text-sm", metaMuted)}>
                        No ISO partners found
                    </div>
                ) : (
                    filteredIsos.map((iso) => (
                        <SelectItem
                            key={iso.id}
                            value={iso.id}
                            className="cursor-pointer rounded-md py-2 text-sm my-0.5"
                        >
                            <span className="font-medium">{formatIsoDisplayLabel(iso)}</span>
                            {iso.email ? <span className="opacity-60 font-normal"> — {iso.email}</span> : ""}
                        </SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
    );

    const displayName = (() => {
        const label = formatIsoDisplayLabel({
            name: linkedIso.name,
            email: linkedIso.email,
        });
        return label === "-" ? "Linked ISO" : label;
    })();

    const isoSelectControl = isoListError ? (
        <p className="text-sm font-medium text-destructive">{isoListError}</p>
    ) : sortedIsos.length === 0 && !isoListLoading ? (
        <p className={cn("text-sm font-medium", metaMuted)}>No ISOs registered.</p>
    ) : (
        <div className="flex w-full flex-col items-stretch gap-1.5">
            {isCompact ? (
                <p className={cn("text-xs font-medium", metaMuted)}>ISO partner</p>
            ) : null}
            {isoSelect}
            {taggingIso && (
                <span
                    className={cn(
                        "flex items-center gap-1.5 text-xs font-medium",
                        isDark ? "text-blue-400" : "text-blue-600",
                    )}
                >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Updating deal…
                </span>
            )}
        </div>
    );

    const contactChip = (icon: ReactNode, children: ReactNode, inline = false) => (
        <span
            className={cn(
                "inline-flex min-w-0 max-w-full items-center gap-2 text-sm font-medium",
                metaValue,
            )}
        >
            {inline ? (
                <span
                    className={cn(
                        "shrink-0",
                        isDark ? "text-sky-400" : "text-[var(--brand-mid)]",
                    )}
                >
                    {icon}
                </span>
            ) : (
                <span
                    className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        isDark ? "bg-zinc-800 text-sky-400" : "bg-[var(--brand)]/10 text-[var(--brand-mid)]",
                    )}
                >
                    {icon}
                </span>
            )}
            <span className="truncate">{children}</span>
        </span>
    );

    const editEmailButton = (
        <button
            type="button"
            onClick={() => setEditingEmail(true)}
            className={cn(
                clickAction,
                "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors",
                isDark
                    ? "border-zinc-700 bg-zinc-800/80 text-sky-300 hover:border-sky-500/40 hover:bg-zinc-800 hover:text-sky-200"
                    : "border-slate-200 bg-white text-[var(--brand)] hover:border-[var(--brand)]/40 hover:bg-[var(--brand)]/5 hover:text-[var(--brand-mid)]",
            )}
            aria-label="Edit ISO email"
        >
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
        </button>
    );

    const linkedBadge = (
        <span
            className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                isDark
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200",
            )}
        >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Linked
        </span>
    );

    const approvedByIsoTag = (
        <span
            className={cn(
                "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide normal-case shadow-sm",
                isDark
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-300",
            )}
            title="Application approved by ISO (Contract Pending)"
        >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Approved by ISO
        </span>
    );

    const dividerClass = cn("h-px w-full", isDark ? "bg-zinc-800/80" : "bg-slate-100");

    const emailEditPanel = (
        <div
            className={cn(
                "flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3 animation-fadeIn",
            )}
        >
            <div className="relative flex-1">
                <Mail
                    className={cn(
                        "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                        isDark ? "text-zinc-500" : "text-[var(--brand)]",
                    )}
                    strokeWidth={2}
                    aria-hidden
                />
                <Input
                    id="deal-iso-email"
                    type="email"
                    autoComplete="email"
                    disabled={savingEmail}
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    className={cn(
                        "h-10 pl-10 text-sm rounded-lg",
                        isDark ? "border-zinc-800 bg-zinc-950/50" : "border-slate-200 bg-white",
                    )}
                    placeholder="ISO partner email"
                />
            </div>
            <div className="flex shrink-0 gap-2 justify-end">
                <Button
                    type="button"
                    size="sm"
                    disabled={!canSaveEmail}
                    onClick={() => void handleSaveEmail()}
                    className={cn(
                        clickAction,
                        "h-10 gap-1.5 bg-[image:var(--brand-gradient)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-mid)] rounded-lg",
                    )}
                >
                    {savingEmail ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Check className="h-4 w-4" />
                    )}
                    Save
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={savingEmail}
                    className={cn(
                        clickAction,
                        "h-10 w-10 p-0 rounded-lg",
                        isDark ? "hover:bg-zinc-800" : "hover:bg-slate-100",
                    )}
                    onClick={() => {
                        setEmailDraft(linkedIso.email);
                        setEditingEmail(false);
                    }}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );

    return (
        <section className={shell} aria-labelledby="deal-iso-section-title">
            <div className={headerBar}>
                {/* <Building2
                    className={cn(
                        "h-5 w-5 shrink-0",
                        isDark ? "text-[#C07BE0]" : "text-[var(--brand)]",
                    )}
                    aria-hidden
                /> */}
                <h2 id="deal-iso-section-title" className="leading-tight">
                    {sectionTitle}
                </h2>
                {!fetchLoading && isApprovedByIso ? approvedByIsoTag : null}
            </div>

            {fetchLoading ? (
                <div className={cn(bodyPad, "flex items-center gap-4")}>
                    <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                    <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 max-w-[200px] rounded" />
                        <Skeleton className="h-3 max-w-[300px] rounded" />
                    </div>
                </div>
            ) : hasIso ? (
                isCompact ? (
                    <div className={cn(bodyPad, "flex flex-col gap-3")}>
                        {!editingEmail ? (
                            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                                <div
                                    className={cn(
                                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold tracking-wider shadow-inner",
                                        isDark
                                            ? "bg-gradient-to-br from-blue-500/20 to-blue-600/5 text-blue-300 border border-blue-500/10"
                                            : "bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700 border border-blue-200/50",
                                    )}
                                >
                                    {isoInitials(displayName)}
                                </div>

                                <div className="flex min-w-0 items-center gap-2">
                                    <span
                                        className={cn(
                                            "truncate text-sm font-semibold tracking-tight",
                                            isDark ? "text-zinc-100" : "text-slate-800",
                                        )}
                                    >
                                        {displayName}
                                    </span>
                                    {linkedBadge}
                                </div>

                                {contactChip(
                                    <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />,
                                    linkedIso.email || EMPTY_FIELD,
                                    true,
                                )}
                                {contactChip(
                                    <PhoneCall className="h-4 w-4" strokeWidth={2} aria-hidden />,
                                    formatIsoPhoneDisplay(linkedIso.phone),
                                    true,
                                )}
                                {submissionFrom.length > 0
                                    ? contactChip(
                                          <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />,
                                          `From: ${submissionFrom.join(", ")}`,
                                          true,
                                      )
                                    : null}
                                {submissionCc.length > 0
                                    ? contactChip(
                                          <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />,
                                          `Cc: ${submissionCc.join(", ")}`,
                                          true,
                                      )
                                    : null}
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <div
                                    className={cn(
                                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold tracking-wider shadow-inner",
                                        isDark
                                            ? "bg-gradient-to-br from-blue-500/20 to-blue-600/5 text-blue-300 border border-blue-500/10"
                                            : "bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700 border border-blue-200/50",
                                    )}
                                >
                                    {isoInitials(displayName)}
                                </div>
                                <div className="flex min-w-0 items-center gap-2">
                                    <span
                                        className={cn(
                                            "truncate text-sm font-semibold tracking-tight",
                                            isDark ? "text-zinc-100" : "text-slate-800",
                                        )}
                                    >
                                        {displayName}
                                    </span>
                                    {linkedBadge}
                                </div>
                            </div>
                        )}

                        {alwaysEditable && !editingEmail ? (
                            <div className={cn("border-t pt-3", isDark ? "border-zinc-800" : "border-slate-100")}>
                                {isoSelectControl}
                            </div>
                        ) : null}

                        {alwaysEditable && editingEmail ? (
                            <div className={cn("border-t pt-3", isDark ? "border-zinc-800/80" : "border-slate-100")}>
                                {emailEditPanel}
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className={cn(bodyPad, "flex flex-col gap-4")}>
                        {/* ISO selector (full width, on top) */}
                        {alwaysEditable ? <div className="w-full">{isoSelectControl}</div> : null}

                        <div className={dividerClass} />

                        {/* Linked ISO identity */}
                        <div className="flex items-center gap-3">
                            <div
                                className={cn(
                                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tracking-wider shadow-inner",
                                    isDark
                                        ? "bg-gradient-to-br from-blue-500/20 to-blue-600/5 text-blue-300 border border-blue-500/10"
                                        : "bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700 border border-blue-200/50",
                                )}
                            >
                                {isoInitials(displayName)}
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span
                                    className={cn(
                                        "truncate text-base font-semibold tracking-tight",
                                        isDark ? "text-zinc-100" : "text-slate-800",
                                    )}
                                >
                                    {displayName}
                                </span>
                                {linkedBadge}
                            </div>
                        </div>

                        {/* Contact details */}
                        {!editingEmail ? (
                            <div
                                className={cn(
                                    "flex flex-col gap-3 rounded-xl border p-3",
                                    isDark
                                        ? "border-zinc-800 bg-zinc-950/30"
                                        : "border-slate-100 bg-slate-50/60",
                                )}
                            >
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    {contactChip(
                                        <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />,
                                        linkedIso.email || EMPTY_FIELD,
                                    )}
                                    {alwaysEditable ? editEmailButton : null}
                                </div>
                                {contactChip(
                                    <PhoneCall className="h-4 w-4" strokeWidth={2} aria-hidden />,
                                    formatIsoPhoneDisplay(linkedIso.phone),
                                )}
                                {submissionFrom.length > 0
                                    ? contactChip(
                                          <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />,
                                          `From: ${submissionFrom.join(", ")}`,
                                      )
                                    : null}
                                {submissionCc.length > 0
                                    ? contactChip(
                                          <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />,
                                          `Cc: ${submissionCc.join(", ")}`,
                                      )
                                    : null}
                            </div>
                        ) : (
                            <div
                                className={cn(
                                    "flex flex-col gap-3 rounded-xl border p-3",
                                    isDark
                                        ? "border-zinc-800 bg-zinc-950/30"
                                        : "border-slate-100 bg-slate-50/60",
                                )}
                            >
                                {emailEditPanel}
                                {contactChip(
                                    <PhoneCall className="h-4 w-4" strokeWidth={2} aria-hidden />,
                                    formatIsoPhoneDisplay(linkedIso.phone),
                                )}
                            </div>
                        )}
                    </div>
                )
            ) : (
                <div
                    className={cn(
                        bodyPad,
                        "flex flex-col gap-3",
                        !isCompact && "gap-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                    )}
                >
                    <p className={cn("min-w-0 text-sm font-medium leading-relaxed", metaMuted)}>
                        {alwaysEditable
                            ? "Connect a sales partner to track commissions and contact details on this deal."
                            : "No ISO linked."}
                    </p>
                    {alwaysEditable ? (
                        <div className={cn("w-full shrink-0", !isCompact && "sm:w-auto sm:min-w-[11rem]")}>
                            {isoSelectControl}
                        </div>
                    ) : null}
                </div>
            )}
        </section>
    );
}