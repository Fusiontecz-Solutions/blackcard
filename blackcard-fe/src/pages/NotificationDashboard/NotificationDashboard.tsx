import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import type { Notification, NotificationBucket } from "@/redux/slices/notificationSlice";
import { markAllNotificationsReadOptimistic } from "@/redux/slices/notificationSlice";
import {
    getNotifications,
    getNotificationSummary,
    markAllNotificationsAsRead,
} from "@/redux/actions/notificationActions";
import { useNotificationsSync } from "@/hooks/useNotificationsSync";
import NotificationItem from "@/components/notifications/NotificationItem";
import { useNotificationActions } from "@/components/notifications/useNotificationActions";
import {
    BUCKET_META,
    BUCKET_ORDER,
    CATEGORY_META,
    CATEGORY_ORDER,
    IMPORTANCE_META,
    IMPORTANCE_ORDER,
    compareNotifications,
    isSnoozeDue,
} from "@/components/notifications/notificationTaxonomy";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, RefreshCcw, Archive, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

/** A snoozed-but-due item resurfaces in the Inbox; otherwise the stored bucket. */
function displayBucket(n: Notification): NotificationBucket {
    if (n.bucket === "snoozed" && isSnoozeDue(n)) return "inbox";
    return (n.bucket ?? "inbox") as NotificationBucket;
}

const activeNavClass =
    "bg-[image:var(--brand-gradient)] text-white shadow-sm ring-1 ring-[var(--brand)]/20";
const activeCategoryClass =
    "cursor-pointer border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)] font-medium";
const inactiveCategoryClass =
    "cursor-pointer border-border bg-card text-foreground hover:border-[var(--brand)]/30 hover:bg-muted/50";

export default function NotificationDashboard() {
    const dispatch = useDispatch<AppDispatch>();
    const actions = useNotificationActions();
    const isMobile = useIsMobile();

    const { data: loginData } = useSelector((s: RootState) => s.login);
    const role = loginData?.user?.role || localStorage.getItem("role") || "";
    const isSuperAdmin = role === "SUPER_ADMIN" || role === "SUPERADMIN";

    const { data: notifications, loading } = useSelector((s: RootState) => s.notifications);

    const [bucket, setBucket] = useState<NotificationBucket>("inbox");
    const [category, setCategory] = useState<string | null>(null);
    const [importance, setImportance] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const fetchAll = useMemo(
        () => async () => {
            await dispatch(
                getNotifications({
                    limit: 200,
                    includeSnoozed: true,
                    ...(isSuperAdmin ? { personalOnly: true } : {}),
                }),
            );
            dispatch(getNotificationSummary());
        },
        [dispatch, isSuperAdmin],
    );

    useNotificationsSync({ limit: 200 }, { customFetch: fetchAll });

    const active = useMemo(
        () => (notifications || []).filter((n: Notification) => !n.isArchived),
        [notifications],
    );

    const bucketCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const n of active) {
            const b = displayBucket(n);
            counts[b] = (counts[b] || 0) + 1;
        }
        return counts;
    }, [active]);

    const list = useMemo(() => {
        let l = active.filter((n) => displayBucket(n) === bucket);
        if (category) l = l.filter((n) => (n.category ?? "system") === category);
        if (importance) l = l.filter((n) => (n.importance ?? "normal") === importance);
        return [...l].sort(compareNotifications);
    }, [active, bucket, category, importance]);

    useEffect(() => {
        setSelected((prev) => {
            const visibleIds = new Set(list.map((n) => n._id));
            const next = new Set([...prev].filter((id) => visibleIds.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [list]);

    const toggleSelect = (id: string, checked: boolean) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });

    const allSelected = list.length > 0 && selected.size === list.length;
    const toggleSelectAll = () =>
        setSelected(allSelected ? new Set() : new Set(list.map((n) => n._id)));

    const ids = [...selected];
    const runBulk = async (patch: Parameters<typeof actions.bulk>[1], msg?: string) => {
        await actions.bulk(ids, patch, msg);
        setSelected(new Set());
    };

    const handleMarkAllRead = async () => {
        dispatch(markAllNotificationsReadOptimistic());
        try {
            await dispatch(markAllNotificationsAsRead()).unwrap();
            dispatch(getNotificationSummary());
        } catch {
            /* handled by slice */
        }
    };

    const bulkBar = selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--brand)]/20 bg-[var(--brand)]/5 px-3 py-2 text-sm dark:bg-[var(--brand)]/10">
            <span className="font-medium text-[var(--brand)]">
                {selected.size} selected
            </span>
            <span className="text-muted-foreground">·</span>
            <button className="cursor-pointer rounded-md px-2 py-0.5 hover:bg-muted" onClick={() => runBulk({ isRead: true }, "Marked read")}>Mark read</button>
            <button className="cursor-pointer rounded-md px-2 py-0.5 hover:bg-muted" onClick={() => runBulk({ importance: "urgent" }, "Tagged urgent")}>Mark urgent</button>
            <button className="cursor-pointer rounded-md px-2 py-0.5 hover:bg-muted" onClick={() => runBulk({ bucket: "todo" }, "Moved to To-do")}>To-do</button>
            <button className="cursor-pointer rounded-md px-2 py-0.5 hover:bg-muted" onClick={() => runBulk({ bucket: "follow_up" }, "Moved to Follow-up")}>Follow-up</button>
            <button className="cursor-pointer rounded-md px-2 py-0.5 hover:bg-muted" onClick={() => runBulk({ bucket: "done" }, "Moved to Done")}>Done</button>
            <button className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => runBulk({ isArchived: true }, "Archived")}>
                <Archive className="h-3.5 w-3.5" /> Archive
            </button>
            <button className="ml-auto inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
                <X className="h-3.5 w-3.5" /> Clear
            </button>
        </div>
    );

    return (
        <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden bg-background">
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                {/* Headings rail — full height */}
                <aside className="flex w-full shrink-0 flex-col border-b border-border bg-card lg:w-56 lg:border-b-0 lg:border-r">
                    <p className="hidden px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:block">
                        Headings
                    </p>
                    <nav className="flex gap-1 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:pt-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pb-4 lg:[scrollbar-width:auto] lg:[&::-webkit-scrollbar]:block">
                        {BUCKET_ORDER.map((b) => {
                            const Icon = BUCKET_META[b].icon;
                            const c = bucketCounts[b] || 0;
                            const activeTab = bucket === b;
                            return (
                                <button
                                    key={b}
                                    type="button"
                                    onClick={() => {
                                        setBucket(b);
                                        setCategory(null);
                                    }}
                                    className={cn(
                                        "flex shrink-0 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:w-full",
                                        activeTab
                                            ? activeNavClass
                                            : "text-foreground hover:bg-muted",
                                    )}
                                >
                                    <span className="flex items-center gap-2">
                                        <Icon className="h-4 w-4" />
                                        {BUCKET_META[b].label}
                                    </span>
                                    {c > 0 && (
                                        <span
                                            className={cn(
                                                "rounded-full px-1.5 text-[11px] font-semibold",
                                                activeTab ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
                                            )}
                                        >
                                            {c}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {/* Main workspace — fills remaining viewport */}
                <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
                    {!isMobile ? (
                    <div className="shrink-0 space-y-3 border-b border-border bg-card px-4 py-4 md:px-6">
                        {/* Row 1: category pills + actions */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            {/* Phones: one swipeable pill row instead of a tall wrapped block. */}
                            <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible md:py-0">
                                <button
                                    type="button"
                                    onClick={() => setCategory(null)}
                                    className={cn(
                                        "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                                        category === null ? activeCategoryClass : inactiveCategoryClass,
                                    )}
                                >
                                    All categories
                                </button>
                                {CATEGORY_ORDER.map((c) => {
                                    const Icon = CATEGORY_META[c].icon;
                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setCategory(category === c ? null : c)}
                                            className={cn(
                                                "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                                                category === c ? activeCategoryClass : inactiveCategoryClass,
                                            )}
                                        >
                                            <Icon className={cn("h-4 w-4", CATEGORY_META[c].tone)} />
                                            {CATEGORY_META[c].label}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={fetchAll}>
                                    <RefreshCcw className="h-4 w-4" />
                                    Refresh
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={handleMarkAllRead}>
                                    <CheckCheck className="h-4 w-4" />
                                    Mark all read
                                </Button>
                            </div>
                        </div>

                        {/* Row 2: importance filters */}
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
                            <span className="pr-1 text-muted-foreground">Importance:</span>
                            <button
                                type="button"
                                onClick={() => setImportance(null)}
                                className={cn(
                                    "cursor-pointer rounded px-1.5 py-0.5 transition-colors",
                                    importance === null
                                        ? "font-semibold text-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                Any
                            </button>
                            {IMPORTANCE_ORDER.map((imp) => (
                                <span key={imp} className="inline-flex items-center">
                                    <span className="mx-1.5 text-border select-none" aria-hidden>
                                        |
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setImportance(importance === imp ? null : imp)}
                                        title={IMPORTANCE_META[imp].label}
                                        className={cn(
                                            "inline-flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors",
                                            importance === imp
                                                ? "font-semibold text-foreground"
                                                : "text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        <span className={cn("h-2 w-2 rounded-full", IMPORTANCE_META[imp].dot)} />
                                        {IMPORTANCE_META[imp].label}
                                    </button>
                                </span>
                            ))}
                        </div>

                        {/* Row 3: helper text */}
                        <p className="text-xs text-muted-foreground">
                            {isSuperAdmin
                                ? "Showing all workspace notifications. Personal inbox updates still sync to the bell icon."
                                : "Deal updates appear here as they happen. Your bell icon stays in sync in real time."}
                        </p>

                        {bulkBar}
                    </div>
                    ) : (
                    /* ---- Mobile header: one swipeable filter rail, actions live in the list bar ---- */
                    <div className="shrink-0 space-y-2 border-b border-border bg-card px-4 py-3">
                        <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            <button
                                type="button"
                                onClick={() => setCategory(null)}
                                className={cn(
                                    "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs",
                                    category === null ? activeCategoryClass : inactiveCategoryClass,
                                )}
                            >
                                All
                            </button>
                            {CATEGORY_ORDER.map((c) => {
                                const Icon = CATEGORY_META[c].icon;
                                return (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setCategory(category === c ? null : c)}
                                        className={cn(
                                            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs",
                                            category === c ? activeCategoryClass : inactiveCategoryClass,
                                        )}
                                    >
                                        <Icon className={cn("h-3.5 w-3.5", CATEGORY_META[c].tone)} />
                                        {CATEGORY_META[c].label}
                                    </button>
                                );
                            })}
                            <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
                            {IMPORTANCE_ORDER.map((imp) => (
                                <button
                                    key={imp}
                                    type="button"
                                    onClick={() => setImportance(importance === imp ? null : imp)}
                                    className={cn(
                                        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs",
                                        importance === imp ? activeCategoryClass : inactiveCategoryClass,
                                    )}
                                >
                                    <span className={cn("h-2 w-2 rounded-full", IMPORTANCE_META[imp].dot)} />
                                    {IMPORTANCE_META[imp].label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                            {isSuperAdmin
                                ? "Showing all workspace notifications. Personal inbox updates still sync to the bell icon."
                                : "Deal updates appear here as they happen. Your bell icon stays in sync in real time."}
                        </p>
                        {bulkBar}
                    </div>
                    )}

                    {/* Scrollable list — grows to fill screen */}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {(list.length > 0 || isMobile) && (
                            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 backdrop-blur-sm md:px-6">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={toggleSelectAll}
                                    aria-label="Select all"
                                    className="h-4 w-4 accent-[var(--brand)]"
                                />
                                <span className="text-xs font-medium text-muted-foreground">
                                    {list.length} in {BUCKET_META[bucket].label}
                                </span>
                                {isMobile && (
                                    <span className="ml-auto flex items-center gap-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={fetchAll}
                                            aria-label="Refresh"
                                            title="Refresh"
                                        >
                                            <RefreshCcw className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={handleMarkAllRead}
                                            aria-label="Mark all read"
                                            title="Mark all read"
                                        >
                                            <CheckCheck className="h-4 w-4" />
                                        </Button>
                                    </span>
                                )}
                            </div>
                        )}

                        {loading && list.length === 0 ? (
                            <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
                                Loading notifications…
                            </div>
                        ) : list.length > 0 ? (
                            list.map((n) => (
                                <NotificationItem
                                    key={n._id}
                                    notification={n}
                                    actions={actions}
                                    selectable
                                    selected={selected.has(n._id)}
                                    onSelectChange={(c) => toggleSelect(n._id, c)}
                                />
                            ))
                        ) : (
                            <div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-6 text-center">
                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                    <Bell className="h-6 w-6 text-muted-foreground/60" />
                                </div>
                                <p className="text-sm font-medium text-foreground">
                                    Nothing in {BUCKET_META[bucket].label}
                                </p>
                                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                                    {category
                                        ? `No ${CATEGORY_META[category as keyof typeof CATEGORY_META]?.label ?? category} items here yet.`
                                        : "New deal updates will appear here as they arrive."}
                                </p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
