import { useCallback, useEffect, useRef } from "react";
import { useSocket } from "@/context/SocketContext";

export type DisconnectAwareRestSyncOptions = {
  /** When false, no fetch / poll / visibility / reconnect handlers run. */
  enabled?: boolean;
  /** REST poll interval while the socket is disconnected (ms). */
  fallbackPollMs: number;
};

/**
 * Central REST refresh: mount, tab visible, socket reconnect, and interval poll
 * only while disconnected. Skips hidden tabs and deduplicates concurrent fetches.
 */
export function useDisconnectAwareRestSync(
  fetchFn: () => void | Promise<void>,
  { enabled = true, fallbackPollMs }: DisconnectAwareRestSyncOptions,
) {
  const { socket, isConnected } = useSocket();
  const inFlightRef = useRef(false);

  const runFetch = useCallback(async () => {
    if (!enabled) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await fetchFn();
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, fetchFn]);

  useEffect(() => {
    if (!enabled) return;
    void runFetch();
  }, [enabled, runFetch]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runFetch();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, runFetch]);

  useEffect(() => {
    if (!enabled || !socket) return;
    const onConnect = () => void runFetch();
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, [enabled, socket, runFetch]);

  useEffect(() => {
    if (!enabled || isConnected) return;
    const intervalId = window.setInterval(() => void runFetch(), fallbackPollMs);
    return () => window.clearInterval(intervalId);
  }, [enabled, isConnected, fallbackPollMs, runFetch]);
}
