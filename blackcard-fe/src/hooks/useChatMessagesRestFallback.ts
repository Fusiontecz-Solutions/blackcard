import { useEffect } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/redux/store";
import { fetchMessages } from "@/redux/actions/chatActions";
import { useSocket } from "@/context/SocketContext";
import { CHAT_MESSAGES_FALLBACK_POLL_MS } from "@/lib/queryDefaults";

/**
 * Poll `fetchMessages` only when Socket.IO is disconnected (~30s).
 * While connected, `new_message` / reconnect handlers are the source of truth.
 */
export function useChatMessagesRestFallback(conversationId: string | null) {
  const dispatch = useDispatch<AppDispatch>();
  const { isConnected } = useSocket();

  useEffect(() => {
    if (!conversationId || isConnected) return;

    const poll = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      dispatch(fetchMessages({ conversationId }));
    };

    const intervalId = window.setInterval(poll, CHAT_MESSAGES_FALLBACK_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [conversationId, isConnected, dispatch]);
}
