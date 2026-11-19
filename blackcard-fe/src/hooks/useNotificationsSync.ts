import { useCallback } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/redux/store";
import { getNotifications } from "@/redux/actions/notificationActions";
import { NOTIFICATIONS_FALLBACK_POLL_MS } from "@/lib/queryDefaults";
import { useDisconnectAwareRestSync } from "@/hooks/useDisconnectAwareRestSync";

export type NotificationInboxParams = {
  isRead?: boolean;
  limit?: number;
  page?: number;
  personalOnly?: boolean;
};

export type UseNotificationsSyncOptions = {
  enabled?: boolean;
  /** Override REST fetch (e.g. Super Admin full feed on the notifications page). */
  customFetch?: () => void | Promise<void>;
};

/**
 * Single inbox sync for bell badge, sidebar, and dropdown — mount, tab focus,
 * socket reconnect, and 60s REST poll only when disconnected.
 */
export function useNotificationsSync(
  params: NotificationInboxParams,
  options: UseNotificationsSyncOptions = {},
) {
  const dispatch = useDispatch<AppDispatch>();
  const { enabled = true, customFetch } = options;

  const { isRead, limit, page, personalOnly } = params;

  const fetchInbox = useCallback(async () => {
    if (customFetch) {
      await customFetch();
      return;
    }
    await dispatch(
      getNotifications({ isRead, limit, page, personalOnly }),
    ).unwrap();
  }, [customFetch, dispatch, isRead, limit, page, personalOnly]);

  useDisconnectAwareRestSync(fetchInbox, {
    enabled,
    fallbackPollMs: NOTIFICATIONS_FALLBACK_POLL_MS,
  });
}
