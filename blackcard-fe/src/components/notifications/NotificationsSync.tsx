import { useMemo } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import { useNotificationsSync } from "@/hooks/useNotificationsSync";
import {
  normalizeRoleKey,
  resolveEffectiveRole,
} from "@/lib/sessionRole";

/**
 * One authenticated-shell inbox sync (bell + sidebar badge).
 * Real-time rows still arrive via {@link RealtimeNotificationsListener}.
 */
const NotificationsSync = () => {
  const { data: loginData } = useSelector((state: RootState) => state.login);
  const userRole = resolveEffectiveRole(loginData?.user);
  const isSuperAdmin = normalizeRoleKey(userRole) === "SUPER_ADMIN";

  const inboxParams = useMemo(
    () => ({
      limit: 50,
      ...(isSuperAdmin ? { personalOnly: true as const } : {}),
    }),
    [isSuperAdmin],
  );

  useNotificationsSync(inboxParams);

  return null;
};

export default NotificationsSync;
