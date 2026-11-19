import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import type { AppDispatch } from "@/redux/store";
import type { Notification, NotificationStatePatch } from "@/redux/slices/notificationSlice";
import {
    updateNotificationStateOptimistic,
    bulkUpdateOptimistic,
} from "@/redux/slices/notificationSlice";
import {
    updateNotificationState,
    bulkUpdateNotifications,
    markNotificationAsRead,
    getNotificationSummary,
} from "@/redux/actions/notificationActions";
import { resolveActionUrl } from "./notificationTaxonomy";

/**
 * Shared notification triage actions used by both the bell dropdown and the
 * full dashboard. Each handler updates the UI optimistically, fires the REST
 * call, and refreshes the summary counts so headings/badges stay in sync.
 */
export function useNotificationActions() {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();

    const apply = useCallback(
        async (id: string, patch: NotificationStatePatch, successMsg?: string) => {
            dispatch(updateNotificationStateOptimistic({ id, patch }));
            try {
                await dispatch(updateNotificationState({ id, patch })).unwrap();
                dispatch(getNotificationSummary());
                if (successMsg) toast.success(successMsg, { autoClose: 1800 });
            } catch {
                toast.error("Couldn't update notification");
            }
        },
        [dispatch],
    );

    const setImportance = useCallback(
        (id: string, importance: string) => apply(id, { importance }),
        [apply],
    );

    const moveToBucket = useCallback(
        (id: string, bucket: string) => {
            const label = bucket.replace("_", " ");
            return apply(id, { bucket }, `Moved to ${label}`);
        },
        [apply],
    );

    const snooze = useCallback(
        (id: string, snoozedUntil: string) => apply(id, { snoozedUntil, bucket: "snoozed" }, "Snoozed"),
        [apply],
    );

    const unsnooze = useCallback(
        (id: string) => apply(id, { snoozedUntil: null, bucket: "inbox" }),
        [apply],
    );

    const setRead = useCallback(
        (id: string, isRead: boolean) => apply(id, { isRead }),
        [apply],
    );

    const archive = useCallback(
        (id: string) => apply(id, { isArchived: true }, "Archived"),
        [apply],
    );

    const bulk = useCallback(
        async (ids: string[], patch: NotificationStatePatch, successMsg?: string) => {
            if (ids.length === 0) return;
            dispatch(bulkUpdateOptimistic({ ids, patch }));
            try {
                await dispatch(bulkUpdateNotifications({ ids, patch })).unwrap();
                dispatch(getNotificationSummary());
                if (successMsg) toast.success(successMsg, { autoClose: 1800 });
            } catch {
                toast.error("Couldn't update notifications");
            }
        },
        [dispatch],
    );

    /** Open the related deal: mark read (best-effort) then navigate to the deep link. */
    const open = useCallback(
        (n: Notification) => {
            if (!n.isRead) {
                dispatch(updateNotificationStateOptimistic({ id: n._id, patch: { isRead: true } }));
                dispatch(markNotificationAsRead(n._id));
            }
            const url = resolveActionUrl(n);
            if (url) navigate(url);
            return Boolean(url);
        },
        [dispatch, navigate],
    );

    return { setImportance, moveToBucket, snooze, unsnooze, setRead, archive, bulk, open };
}

export type NotificationActions = ReturnType<typeof useNotificationActions>;
