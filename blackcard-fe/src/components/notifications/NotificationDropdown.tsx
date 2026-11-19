import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router";
import type { AppDispatch, RootState } from "@/redux/store";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import {
    getNotifications,
    markAllNotificationsAsRead,
    getNotificationSummary,
} from "@/redux/actions/notificationActions";
import { markAllNotificationsReadOptimistic } from "@/redux/slices/notificationSlice";
import type { Notification } from "@/redux/slices/notificationSlice";
import NotificationItem from "./NotificationItem";
import { useNotificationActions } from "./useNotificationActions";
import { compareNotifications, isHiddenBySnooze } from "./notificationTaxonomy";

type Tab = { key: string; label: string };
const TABS: Tab[] = [
    { key: "all", label: "All" },
    { key: "urgent", label: "Urgent" },
    { key: "todo", label: "To-do" },
    { key: "follow_up", label: "Follow-up" },
];

const NotificationDropdown = () => {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const actions = useNotificationActions();
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<string>("all");

    const { data: loginData } = useSelector((state: RootState) => state.login);
    const userRole = loginData?.user?.role || localStorage.getItem("role") || "";
    const isSuperAdmin = userRole === "SUPER_ADMIN" || userRole === "SUPERADMIN";
    const inboxParams = useMemo(
        () => ({ limit: 50, ...(isSuperAdmin ? { personalOnly: true as const } : {}) }),
        [isSuperAdmin],
    );

    const { data: notifications, loading } = useSelector((state: RootState) => state.notifications);
    const summary = useSelector((state: RootState) => state.notificationSummary.data);

    // Visible inbox = not archived, not snoozed-until-future.
    const visible = useMemo(
        () => (notifications || []).filter((n: Notification) => !n.isArchived && !isHiddenBySnooze(n)),
        [notifications],
    );
    const unreadCount = summary?.unread ?? visible.filter((n) => !n.isRead).length;

    const filtered = useMemo(() => {
        let list = visible;
        if (tab === "urgent") list = list.filter((n) => n.importance === "urgent");
        else if (tab === "todo") list = list.filter((n) => n.bucket === "todo");
        else if (tab === "follow_up") list = list.filter((n) => n.bucket === "follow_up");
        return [...list].sort(compareNotifications);
    }, [visible, tab]);

    useEffect(() => {
        if (open) {
            dispatch(getNotifications(inboxParams));
            dispatch(getNotificationSummary());
        }
    }, [open, dispatch, inboxParams]);

    const handleMarkAllAsRead = async () => {
        dispatch(markAllNotificationsReadOptimistic());
        try {
            await dispatch(markAllNotificationsAsRead()).unwrap();
            dispatch(getNotificationSummary());
        } catch (error) {
            console.error("Failed to mark all notifications as read:", error);
        }
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="relative p-2 rounded-full hover:bg-accent text-muted-foreground"
                    aria-label="notifications"
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-[26rem] max-w-[92vw] p-0 overflow-hidden bg-background border-border"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                        {unreadCount > 0 && (
                            <span className="rounded-full bg-[var(--brand)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--brand)]">
                                {unreadCount} new
                            </span>
                        )}
                    </div>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={handleMarkAllAsRead}
                            className="cursor-pointer text-xs font-medium text-[var(--brand)] hover:text-[var(--brand-hover)]"
                        >
                            Mark all read
                        </button>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border">
                    {TABS.map((t) => {
                        const count =
                            t.key === "urgent"
                                ? summary?.urgent ?? 0
                                : t.key === "todo"
                                  ? summary?.byBucket?.todo ?? 0
                                  : t.key === "follow_up"
                                    ? summary?.byBucket?.follow_up ?? 0
                                    : 0;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setTab(t.key)}
                                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                    tab === t.key
                                        ? "bg-[image:var(--brand-gradient)] text-white shadow-sm"
                                        : "text-muted-foreground hover:bg-muted"
                                }`}
                            >
                                {t.label}
                                {t.key !== "all" && count > 0 && (
                                    <span className="ml-1 opacity-80">{count}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* List */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {loading && filtered.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
                    ) : filtered.length > 0 ? (
                        filtered.map((n) => (
                            <NotificationItem key={n._id} notification={n} actions={actions} compact />
                        ))
                    ) : (
                        <div className="p-6 text-center">
                            <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                            <p className="text-sm text-muted-foreground">You're all caught up!</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-border px-4 py-2">
                    <button
                        type="button"
                        onClick={() => {
                            setOpen(false);
                            navigate("/notifications");
                        }}
                        className="w-full cursor-pointer text-center text-xs font-medium text-[var(--brand)] hover:text-[var(--brand-hover)]"
                    >
                        Open notifications dashboard
                    </button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default NotificationDropdown;
