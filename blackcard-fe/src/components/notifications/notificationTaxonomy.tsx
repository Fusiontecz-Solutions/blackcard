import type { ComponentType } from "react";
import {
    AlarmClock,
    Banknote,
    Clock,
    CheckCircle2,
    FileSignature,
    Gavel,
    Inbox,
    LayoutGrid,
    ListChecks,
    Wallet,
    type LucideProps,
} from "lucide-react";
import type {
    Notification,
    NotificationBucket,
    NotificationCategory,
    NotificationImportance,
} from "@/redux/slices/notificationSlice";
import { formatDate, formatMonthDayET, formatTimeET, isTodayET } from "@/lib/utils";

type IconType = ComponentType<LucideProps>;

/* ── MCA categories (system-derived). UI shows an "All" filter ahead of these. ── */
export const CATEGORY_META: Record<
    NotificationCategory,
    { label: string; icon: IconType; tone: string }
> = {
    approvals: { label: "Approvals", icon: Gavel, tone: "text-violet-600 dark:text-violet-400" },
    contracts: { label: "Contracts", icon: FileSignature, tone: "text-indigo-600 dark:text-indigo-400" },
    funding: { label: "Funding", icon: Banknote, tone: "text-emerald-600 dark:text-emerald-400" },
    collections: { label: "Collections", icon: Wallet, tone: "text-teal-600 dark:text-teal-400" },
    others: { label: "Others", icon: LayoutGrid, tone: "text-slate-500 dark:text-slate-400" },
};

export const CATEGORY_ORDER: NotificationCategory[] = [
    "approvals",
    "contracts",
    "funding",
    "collections",
    "others",
];

export function categoryMeta(c?: string) {
    return CATEGORY_META[(c as NotificationCategory) ?? "others"] ?? CATEGORY_META.others;
}

/* ── Action buckets (user-set headings) ───────────────────────────────── */
export const BUCKET_META: Record<NotificationBucket, { label: string; icon: IconType }> = {
    inbox: { label: "Inbox", icon: Inbox },
    todo: { label: "To-do", icon: ListChecks },
    follow_up: { label: "Follow-up", icon: Clock },
    snoozed: { label: "Snoozed", icon: AlarmClock },
    done: { label: "Done", icon: CheckCircle2 },
};

export const BUCKET_ORDER: NotificationBucket[] = ["inbox", "todo", "follow_up", "snoozed", "done"];

export function bucketMeta(b?: string) {
    return BUCKET_META[(b as NotificationBucket) ?? "inbox"] ?? BUCKET_META.inbox;
}

/* ── Importance tags ──────────────────────────────────────────────────── */
export const IMPORTANCE_META: Record<
    NotificationImportance,
    { label: string; dot: string; chip: string }
> = {
    urgent: {
        label: "Urgent",
        dot: "bg-red-500",
        chip: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    },
    high: {
        label: "High",
        dot: "bg-amber-500",
        chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    },
    normal: {
        label: "Normal",
        dot: "bg-[image:var(--brand-gradient)]",
        chip: "bg-secondary text-foreground/80",
    },
    low: {
        label: "Low",
        dot: "bg-slate-300 dark:bg-slate-600",
        chip: "bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400",
    },
};

export const IMPORTANCE_ORDER: NotificationImportance[] = ["urgent", "high", "normal", "low"];
const IMPORTANCE_RANK: Record<NotificationImportance, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function importanceMeta(i?: string) {
    return IMPORTANCE_META[(i as NotificationImportance) ?? "normal"] ?? IMPORTANCE_META.normal;
}

/* ── Snooze presets ───────────────────────────────────────────────────── */
export interface SnoozePreset {
    key: string;
    label: string;
    /** Returns the ISO timestamp to snooze until. */
    at: () => string;
}

export const SNOOZE_PRESETS: SnoozePreset[] = [
    { key: "1h", label: "1 hour", at: () => new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    {
        key: "evening",
        label: "This evening",
        at: () => {
            const d = new Date();
            d.setHours(18, 0, 0, 0);
            if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
            return d.toISOString();
        },
    },
    {
        key: "tomorrow",
        label: "Tomorrow",
        at: () => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            d.setHours(9, 0, 0, 0);
            return d.toISOString();
        },
    },
    {
        key: "nextweek",
        label: "Next week",
        at: () => {
            const d = new Date();
            const days = (8 - d.getDay()) % 7 || 7; // next Monday
            d.setDate(d.getDate() + days);
            d.setHours(9, 0, 0, 0);
            return d.toISOString();
        },
    },
];

/* ── Selectors / helpers ──────────────────────────────────────────────── */

/** A snoozed notification is "due" once its snoozedUntil time has passed. */
export function isSnoozeDue(n: Notification): boolean {
    if (n.bucket !== "snoozed" || !n.snoozedUntil) return false;
    return new Date(n.snoozedUntil).getTime() <= Date.now();
}

/** Hide snoozed-but-not-due rows from a list (client mirror of the API default). */
export function isHiddenBySnooze(n: Notification): boolean {
    return n.bucket === "snoozed" && !!n.snoozedUntil && new Date(n.snoozedUntil).getTime() > Date.now();
}

/** Sort: urgent first, then unread, then newest. */
export function compareNotifications(a: Notification, b: Notification): number {
    const ra = IMPORTANCE_RANK[(a.importance ?? "normal") as NotificationImportance] ?? 2;
    const rb = IMPORTANCE_RANK[(b.importance ?? "normal") as NotificationImportance] ?? 2;
    if (ra !== rb) return ra - rb;
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/** Short relative time, e.g. "3h ago". */
export function relativeTime(dateString: string): string {
    try {
        const diff = Date.now() - new Date(dateString).getTime();
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return formatDate(dateString);
    } catch {
        return "";
    }
}

/** Friendly "snoozed until" label. */
export function snoozeUntilLabel(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const time = formatTimeET(d);
    return isTodayET(d) ? `until ${time}` : `until ${formatMonthDayET(d)}, ${time}`;
}

/** Resolve the deep link an "Open" action navigates to. */
export function resolveActionUrl(n: Notification): string | null {
    if (n.actionUrl) return n.actionUrl;
    if (n.application && typeof n.application === "object") {
        const id = (n.application as any).applicationId ?? (n.application as any)._id;
        if (id) return `/application-details/${id}`;
    }
    return null;
}
