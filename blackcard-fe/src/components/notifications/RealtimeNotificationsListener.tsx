import { useEffect } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/redux/store";
import { useSocket } from "@/context/SocketContext";
import {
    prependNotification,
    type Notification,
} from "@/redux/slices/notificationSlice";

/**
 * Real-time notifications bridge.
 *
 * Subscribes to the shared Socket.IO connection (see {@link SocketContext}) and
 * reconciles inbound `notification:new` pushes into Redux so the bell, sidebar
 * badge and notifications page update with zero latency — no polling lag.
 *
 * Contract/ACH signing status UI refreshes via `contract:signing-status`
 * listeners (`useContractSigningStatusRealtime`) — not this bell bridge.
 *
 * In-app corner toasts are intentionally disabled; notifications appear only in
 * the Notifications module and bell dropdown.
 *
 * Mounted once at the app root (inside SocketProvider) so it runs for every
 * authenticated user and never duplicates listeners.
 */
interface IncomingNotificationEvent {
    notification: Notification;
    meta?: {
        realtimeKind?: string;
        actionUrl?: string;
    };
}

const RealtimeNotificationsListener = () => {
    const { socket } = useSocket();
    const dispatch = useDispatch<AppDispatch>();

    useEffect(() => {
        if (!socket) return;

        const handleNotification = (event: IncomingNotificationEvent) => {
            const incoming = event?.notification;
            if (!incoming || !incoming._id) return;

            dispatch(prependNotification(incoming));
        };

        socket.on("notification:new", handleNotification);

        return () => {
            socket.off("notification:new", handleNotification);
        };
    }, [socket, dispatch]);

    return null;
};

export default RealtimeNotificationsListener;
