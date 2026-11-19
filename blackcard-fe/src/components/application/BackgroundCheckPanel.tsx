import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { Button } from "@/components/ui/button";
import { axiosPost } from "@/redux/axios";
import { toast } from "react-toastify";
import {
    getBackgroundCheck,
    updateCheckItem,
    runAutomatedCheckItem,
    addCheckAttachment,
    recordCheckDecision,
    reopenCheck,
    setRequiredFlags,
} from "@/redux/actions/backgroundCheckActions";
import type { BackgroundCheckItem } from "@/redux/slices/backgroundCheckSlice";
import {
    ShieldCheck,
    ExternalLink,
    Paperclip,
    Loader2,
    RotateCcw,
    CheckCircle2,
    XCircle,
    Check,
    Building2,
} from "lucide-react";

const CHECK_LABELS: Record<string, string> = {
    TLO: "Thomson Reuters CLEAR",
    OPENCORPORATES: "OpenCorporates",
    SOS: "Secretary of State",
    NY_COURT: "NY Court",
    DATAMERCH: "DataMerch",
    GOOGLE: "Google",
};
const CHECK_SUB: Record<string, string> = {
    TLO: "Identity and background screening",
    OPENCORPORATES: "Entity registration & status",
    SOS: "State business registration",
    NY_COURT: "Civil / judgment search",
    DATAMERCH: "Industry default database",
    GOOGLE: "Open-web reputation",
};
const RESULTS: { key: "PASS" | "FAIL" | "FLAG" | "NA"; label: string }[] = [
    { key: "PASS", label: "Pass" },
    { key: "FAIL", label: "Fail" },
    { key: "FLAG", label: "Flag" },
    { key: "NA", label: "N/A" },
];
const DECIDERS = ["UNDERWRITER", "FINAL_UNDERWRITER", "ADMIN", "SUPER_ADMIN"];
const ADMINS = ["ADMIN", "SUPER_ADMIN"];

const checkLink = (type: string, q: string): string | undefined => {
    const query = encodeURIComponent(q.trim());
    switch (type) {
        case "OPENCORPORATES":
            return q ? `https://opencorporates.com/companies?q=${query}&utf8=%E2%9C%93` : "https://opencorporates.com/";
        case "SOS":
            return q ? `https://www.google.com/search?q=${encodeURIComponent(q + " secretary of state business search")}` : "https://www.nass.org/business-services";
        case "NY_COURT":
            return "https://iapps.courts.state.ny.us/webcivilLocal/LCSearch";
        case "DATAMERCH":
            return "https://datamerch.com/";
        case "GOOGLE":
            return q ? `https://www.google.com/search?q=${query}` : "https://www.google.com/";
        default:
            return undefined;
    }
};

const STATUS_LABEL: Record<string, string> = {
    NOT_STARTED: "Not Started",
    IN_PROGRESS: "In Progress",
    READY_FOR_DECISION: "Ready for Decision",
    APPROVED: "Approved",
    DECLINED: "Declined",
};
const statusTone = (s: string) =>
    s === "APPROVED"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        : s === "DECLINED"
          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          : s === "READY_FOR_DECISION"
            ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
            : "bg-muted text-muted-foreground";

const pillSelected: Record<string, string> = {
    PASS: "bg-emerald-600 text-white border-emerald-600",
    FAIL: "bg-red-600 text-white border-red-600",
    FLAG: "bg-amber-500 text-white border-amber-500",
    NA: "bg-slate-500 text-white border-slate-500",
};
const barColor: Record<string, string> = { PASS: "bg-emerald-500", FAIL: "bg-red-500", FLAG: "bg-amber-500", NA: "bg-slate-400" };
const accentBar = (r: string | null) =>
    r === "PASS" ? "border-l-emerald-500" : r === "FAIL" ? "border-l-red-500" : r === "FLAG" ? "border-l-amber-500" : "border-l-transparent";

type Props = { applicationId: string };

const BackgroundCheckPanel = ({ applicationId }: Props) => {
    const dispatch = useDispatch<AppDispatch>();
    const { data: check, loading, saving, error } = useSelector((s: RootState) => s.backgroundCheck);
    const businessName = useSelector(
        (s: RootState) => (s.applicationDetail.data as any)?.client?.business?.name || (s.applicationDetail.data as any)?.client?.businessName || "",
    );
    const role = String(
        useSelector((s: RootState) => s.login?.data?.user?.role) || (typeof window !== "undefined" ? localStorage.getItem("role") : "") || "",
    )
        .toUpperCase()
        .replace(/-/g, "_");
    const canDecide = DECIDERS.includes(role);
    const isAdmin = ADMINS.includes(role);
    const locked = !!check?.decision;

    const [reason, setReason] = useState("");
    const [overrideFail, setOverrideFail] = useState(false);
    const [runningItemId, setRunningItemId] = useState<string | null>(null);

    useEffect(() => {
        if (applicationId) dispatch(getBackgroundCheck(applicationId));
    }, [applicationId, dispatch]);

    useEffect(() => {
        if (error) toast.error(error);
    }, [error]);

    const hasFail = (check?.items || []).some((i) => i.result === "FAIL");
    const completed = check ? check.items.filter((i) => i.status === "COMPLETE").length : 0;
    const total = check ? check.items.length : 0;
    const pct = total ? Math.round((completed / total) * 100) : 0;

    const decide = (outcome: "APPROVED" | "DECLINED") => {
        if (!check) return;
        if (!reason.trim()) return toast.error("A reason is required.");
        dispatch(recordCheckDecision({ checkId: check.id, outcome, reasonText: reason, overrideFail }))
            .unwrap()
            .then(() => {
                toast.success(`Background check ${outcome === "APPROVED" ? "approved" : "declined"}.`);
                setReason("");
                setOverrideFail(false);
            })
            .catch((e: any) => toast.error(typeof e === "string" ? e : "Failed to record decision."));
    };

    const runClear = (itemId: string) => {
        setRunningItemId(itemId);
        dispatch(runAutomatedCheckItem(itemId))
            .unwrap()
            .then(() => toast.success("CLEAR Person Search completed."))
            .catch((e: any) => toast.error(typeof e === "string" ? e : "CLEAR Person Search failed."))
            .finally(() => setRunningItemId(null));
    };

    if (loading && !check) return <div className="text-sm text-muted-foreground py-6">Loading background check…</div>;
    if (!check && error) {
        return (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
            </div>
        );
    }
    if (!check) return null;

    const ringDash = `${(pct / 100) * 132} 132`;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF1FA] text-[var(--brand)] dark:bg-[#1f2937] dark:text-[#5AACEA]">
                            <ShieldCheck className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[15px] font-semibold leading-tight">Background Check</p>
                            <p className="text-[11px] text-muted-foreground">Due-diligence review required before contract</p>
                        </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0 ${statusTone(check.status)}`}>
                        {STATUS_LABEL[check.status]}
                    </span>
                </div>
                <div className="h-1 w-full bg-muted">
                    <div className="h-full bg-[image:var(--brand-gradient)] transition-all" style={{ width: `${pct}%` }} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                {/* Checklist */}
                <div className="lg:col-span-2 space-y-2.5">
                    {check.items.map((item) => (
                        <div key={item.id} className={`rounded-lg border border-l-[3px] ${accentBar(item.result)} bg-card px-3.5 py-3`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    {checkLink(item.checkType, businessName) ? (
                                        <a
                                            href={checkLink(item.checkType, businessName)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline"
                                            title="Open the third-party site in a new tab"
                                        >
                                            {CHECK_LABELS[item.checkType]} <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    ) : (
                                        <span className="text-sm font-semibold">
                                            {CHECK_LABELS[item.checkType]}
                                        </span>
                                    )}
                                    <p className="text-[11px] text-muted-foreground">{CHECK_SUB[item.checkType]}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {item.checkType === "TLO" && canDecide && (
                                        <button
                                            type="button"
                                            disabled={locked || runningItemId !== null}
                                            onClick={() => runClear(item.id)}
                                            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#276D9C] px-2.5 text-[11px] font-semibold text-white hover:bg-[#205b83] disabled:opacity-50"
                                        >
                                            {runningItemId === item.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            {runningItemId === item.id ? "Running…" : "Run CLEAR"}
                                        </button>
                                    )}
                                    <div className="inline-flex rounded-lg border p-0.5">
                                        {RESULTS.map((r) => {
                                            const active = item.result === r.key;
                                            return (
                                                <button
                                                    key={r.key}
                                                    type="button"
                                                    disabled={locked}
                                                    onClick={() => dispatch(updateCheckItem({ itemId: item.id, result: active ? "" : r.key }))}
                                                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors disabled:opacity-50 ${
                                                        active ? pillSelected[r.key] : "text-muted-foreground hover:bg-muted"
                                                    }`}
                                                >
                                                    {r.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <AttachBtn item={item} disabled={locked} />
                                    <button
                                        type="button"
                                        disabled={locked}
                                        onClick={() => {
                                            if (item.status !== "COMPLETE" && !item.result) return toast.info("Pick a result first.");
                                            dispatch(updateCheckItem({ itemId: item.id, status: item.status === "COMPLETE" ? "IN_PROGRESS" : "COMPLETE" }));
                                        }}
                                        title={item.status === "COMPLETE" ? "Mark not done" : "Mark done"}
                                        className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
                                            item.status === "COMPLETE" ? "bg-emerald-600 border-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"
                                        }`}
                                    >
                                        <Check className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <textarea
                                defaultValue={item.notes ?? ""}
                                onBlur={(e) => {
                                    if ((e.target.value || "") !== (item.notes || ""))
                                        dispatch(updateCheckItem({ itemId: item.id, notes: e.target.value }));
                                }}
                                disabled={locked}
                                rows={2}
                                placeholder="What did you find? Add notes…"
                                className="mt-2.5 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs resize-y leading-relaxed"
                            />
                            {isAdmin && !locked && (
                                <button
                                    type="button"
                                    onClick={() => dispatch(setRequiredFlags({ checkId: check.id, flags: { [item.checkType]: !item.required } }))}
                                    className="mt-1 text-[10px] text-muted-foreground hover:underline"
                                >
                                    {item.required ? "Required — make optional" : "Optional — make required"}
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Review rail */}
                <aside className="space-y-4 lg:sticky lg:top-4 h-fit">
                    {/* Progress + merchant */}
                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center gap-4">
                            <div className="relative h-[58px] w-[58px] shrink-0">
                                <svg viewBox="0 0 50 50" className="h-full w-full -rotate-90">
                                    <circle cx="25" cy="25" r="21" fill="none" strokeWidth="5" className="stroke-muted" />
                                    <circle cx="25" cy="25" r="21" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-[var(--brand)]" strokeDasharray={ringDash} />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold">{pct}%</span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold">{completed} of {total} complete</p>
                                {businessName && (
                                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                                        <Building2 className="h-3 w-3 shrink-0" /> {businessName}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Result breakdown */}
                    <div className="rounded-xl border bg-card p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Results</p>
                        <div className="space-y-2">
                            {RESULTS.map((r) => {
                                const n = check.items.filter((i) => i.result === r.key).length;
                                return (
                                    <div key={r.key} className="flex items-center gap-2">
                                        <span className="w-10 text-xs text-muted-foreground">{r.label}</span>
                                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div className={`h-full rounded-full ${barColor[r.key]}`} style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                                        </div>
                                        <span className="w-4 text-right text-xs font-medium tabular-nums">{n}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Decision */}
                    <div className="rounded-xl border bg-card p-4">
                        {check.decision ? (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    {check.decision.outcome === "APPROVED" ? (
                                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-red-600" />
                                    )}
                                    <b>{check.decision.outcome === "APPROVED" ? "Approved" : "Declined"}</b>
                                    {check.decision.overrodeFail && <span className="text-xs text-amber-600">(fail overridden)</span>}
                                </div>
                                <p className="text-xs text-muted-foreground break-words">{check.decision.reasonText}</p>
                                {isAdmin && (
                                    <Button variant="outline" size="sm" className="w-full h-8 gap-1 text-xs" onClick={() => dispatch(reopenCheck(check.id))}>
                                        <RotateCcw className="h-3.5 w-3.5" /> Reopen check
                                    </Button>
                                )}
                            </div>
                        ) : check.status === "READY_FOR_DECISION" && canDecide ? (
                            <div className="space-y-2.5">
                                <p className="text-sm font-semibold">Record decision</p>
                                {hasFail && (
                                    <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
                                        A check is <b>Fail</b> — approval blocked unless overridden.
                                        {isAdmin && (
                                            <label className="mt-1 flex items-center gap-1.5">
                                                <input type="checkbox" checked={overrideFail} onChange={(e) => setOverrideFail(e.target.checked)} /> Override the fail
                                            </label>
                                        )}
                                    </div>
                                )}
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={2}
                                    placeholder="Reason (required)"
                                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                                />
                                <div className="flex gap-2">
                                    <Button size="sm" disabled={saving} onClick={() => decide("APPROVED")} className="flex-1 h-8 bg-[#16A34A] hover:bg-[#15803d] text-white gap-1.5">
                                        <CheckCircle2 className="h-4 w-4" /> Approve
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={saving} onClick={() => decide("DECLINED")} className="flex-1 h-8 border-red-300 text-red-600 gap-1.5">
                                        <XCircle className="h-4 w-4" /> Decline
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-muted-foreground">
                                <p className="text-sm font-semibold text-foreground mb-1">Decision</p>
                                {check.status !== "READY_FOR_DECISION"
                                    ? "Mark all required checks done to enable a decision."
                                    : "Ready — an Underwriter or Manager must approve or decline."}
                            </div>
                        )}
                    </div>
                </aside>
            </div>

        </div>
    );
};

function AttachBtn({ item, disabled }: { item: BackgroundCheckItem; disabled: boolean }) {
    const dispatch = useDispatch<AppDispatch>();
    const ref = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const count = item.attachments?.length || 0;

    const upload = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await axiosPost("/uploads/single", fd);
            const d = res.data?.data || {};
            const url = d.url || d.secure_url;
            if (!url) throw new Error("Upload returned no url");
            await dispatch(addCheckAttachment({ itemId: item.id, url, publicId: d.publicId || d.public_id, originalName: file.name })).unwrap();
            toast.success("Attachment added.");
        } catch (e: any) {
            toast.error(e?.response?.data?.message || e?.message || "Upload failed.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <span className="inline-flex items-center shrink-0">
            <input ref={ref} type="file" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            <button
                type="button"
                disabled={disabled || busy}
                onClick={() => ref.current?.click()}
                className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50"
                title={count ? `${count} attached — add more` : "Attach a screenshot or file"}
            >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                {count > 0 ? count : ""}
            </button>
        </span>
    );
}

export default BackgroundCheckPanel;
